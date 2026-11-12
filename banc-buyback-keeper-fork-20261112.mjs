// banc-buyback-keeper-fork-20261112.mjs -- FORK ONLY (FORK_URL, default http://127.0.0.1:9617). The server keeper (buyback-keeper.js)
//   end to end on a local fork, with a THROWAWAY key generated here (never written, never printed; it exists only on the fork):
//   1. a test record = the real one with KEEPER = the throwaway address (preparer, SORTIE in a temp dir), deployed from the deployer
//      IMPERSONATED ON THE FORK; 2. fund it and the earlier buyback (economie-deploiement.js adresseBuyback) from a fork-funded account;
//   3. creerKeeperBuyback rounds: the new buyback is bought as KEEPER (vault V counts it), then the earlier one on its public path once
//      its delay is over, until it holds less than MIN_SPEND, and then it is never called again; a TooEarly revert from the node is read
//      as a guard (retry later), a key that is not the record keeper is OFF, a record without address is OFF.
// Refuses to run unless the node answers anvil_* methods. Nothing is sent to mainnet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecteur } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { creerKeeperBuyback, gardeDuRevert, donneesBuyback } from './buyback-keeper.js';
import { resoudre } from './buyback-vault.js';
import { ECONOMIE_DEPLOIEMENT as E } from './economie-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 as ADR } from './economie-v2-pack-deploye.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const FORK = process.env.FORK_URL || 'http://127.0.0.1:9617';
const rpc = async (m, p) => { const j = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json()); if (j.error) { const e = new Error(m + ': ' + JSON.stringify(j.error)); e.data = j.error.data; throw e; } return j.result; };
let ok = 0, ko = 0; const t = (n, c, x = '') => { if (c) { ok++; console.log('ok ', n, x); } else { ko++; console.log('RED', n, x); } };
await rpc('anvil_nodeInfo', []).catch(() => { console.error('not an anvil node: refused'); process.exit(2); });
const hx = (n) => '0x' + BigInt(n).toString(16);
const low = (a) => String(a).toLowerCase();
const u = async (to, sig, args = '') => BigInt(await rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']));
const ethOf = async (who) => BigInt(await rpc('eth_getBalance', [who, 'latest']));
const mine = async (h) => { let r = null; for (let k = 0; k < 40 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]).catch(() => null); if (!r) { await rpc('evm_mine', []).catch(() => null); await new Promise((o) => setTimeout(o, 400)); } } return r; };
const avance = async (s) => { await rpc('evm_increaseTime', [hx(s)]); await rpc('evm_mine', []); };

/* 1. the throwaway key and its test record */
const cle = '0x' + crypto.randomBytes(32).toString('hex');
const K = low(adresseDe(cle));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bbk-'));
const sortie = path.join(tmp, 'rec.js');
execFileSync('node', [path.join(ICI, 'contracts', 'preparer-deploiement-buyback-vault.mjs')], { env: { ...process.env, KEEPER: K, SORTIE: sortie }, cwd: path.join(ICI, 'contracts') });
const { BUYBACK_VAULT_DEPLOIEMENT: D0 } = await import(pathToFileURL(sortie).href);
const tb = (who) => u(low(D0.parametres.tblock), 'balanceOf(address)', low(who).slice(2).padStart(64, '0'));
t('test record: keeper = the throwaway address, dest = V', low(D0.parametres.keeper) === K && D0.parametres.dest === '@V' && low(resoudre(D0).parametres.dest) === low(ADR.V));
t('without an address the keeper is OFF', creerKeeperBuyback({ cle, rec: D0, rpc }).etat().etat === 'OFF', creerKeeperBuyback({ cle, rec: D0, rpc }).etat().pourquoi);
await rpc('anvil_impersonateAccount', [D0.deployeur]);
await rpc('anvil_setBalance', [D0.deployeur, hx(10n ** 17n)]);
const hd = await rpc('eth_sendTransaction', [{ from: D0.deployeur, data: resoudre(D0).creation, gas: hx(4_200_000) }]);
await rpc('anvil_stopImpersonatingAccount', [D0.deployeur]);
const rd = await mine(hd);
t('test buyback deployed on the fork', rd && rd.status === '0x1', rd && rd.contractAddress);
const A = low(rd.contractAddress), OLD = low(E.adresseBuyback);
const D = { ...D0, adresse: A };

/* 2. funding (a fork-only account), and the keeper's gas */
const FUNDER = '0x00000000000000000000000000000000000b0b0b';
await rpc('anvil_setBalance', [FUNDER, hx(10n ** 18n)]);
await rpc('anvil_setBalance', [K, hx(10n ** 16n)]);
await rpc('anvil_impersonateAccount', [FUNDER]);
const f1 = await mine(await rpc('eth_sendTransaction', [{ from: FUNDER, to: A, value: hx(5n * 10n ** 15n), gas: hx(100000) }]));
const f2 = await mine(await rpc('eth_sendTransaction', [{ from: FUNDER, to: OLD, value: hx(3n * 10n ** 14n), gas: hx(100000) }]));
await rpc('anvil_stopImpersonatingAccount', [FUNDER]);
t('funded: new 0.005 ETH, earlier 0.0003 ETH', f1.status === '0x1' && f2.status === '0x1' && (await ethOf(A)) === 5n * 10n ** 15n && (await ethOf(OLD)) >= 3n * 10n ** 14n);
t('earlier buyback armed by the deposit', (await u(OLD, 'armed()')) === 1n);
t('a key that is not the record keeper is OFF', creerKeeperBuyback({ cle: '0x' + crypto.randomBytes(32).toString('hex'), rec: D, rpc }).etat().etat === 'OFF');
/* the live TWAP gap (fork bench finding): let the 30-minute average catch up with no trade */
await avance(1860);

/* 3. rounds */
const journal = [];
const kp = creerKeeperBuyback({ cle, rec: D, ancien: OLD, rpc, journal: (x) => journal.push(x) });
t('keeper ON with the record keeper key', kp.etat().etat === 'ON' && kp.etat().adresse === K && kp.etat().cibles.join() === [A, OLD].join());
t('the state never carries the key', !JSON.stringify(kp.etat()).includes(cle.slice(2)));
const v0 = await tb(ADR.V), ancienVault = low(E.adresseVault), ov0 = await tb(ancienVault);
let r = await kp.tour();
t('round 1: buyback(0.002 ETH) sent to the new buyback as keeper', r.fait && r.to === A && r.montant === 2n * 10n ** 15n && r.comme === 'keeper', JSON.stringify({ ...r, montant: String(r.montant) }));
const rc1 = r.fait ? await mine(r.hash) : null;
t('round 1 tx mined, status 1, from the keeper key', rc1 && rc1.status === '0x1' && low(rc1.from) === K, rc1 && BigInt(rc1.gasUsed).toString() + ' gas');
const v1 = await tb(ADR.V);
t('the holders vault V received TBLOCK', v1 > v0, (v1 - v0).toString());
t('the new buyback spent exactly 0.002 ETH', (await ethOf(A)) === 3n * 10n ** 15n);
r = await kp.tour();
t('round 2: follows the receipt, then nothing (cooldown; the earlier one waits its public delay)', !r.fait && kp.etat().compteurs.inclus === 1, r.pourquoi);
/* a TooEarly from the node is a guard (retry later), never a failure */
let err = null; try { await rpc('eth_call', [{ from: K, to: A, data: donneesBuyback(2n * 10n ** 15n) }, 'latest']); } catch (e) { err = e; }
t('a TooEarly revert from the node reads as the guard TooEarly', gardeDuRevert(err) === 'TooEarly', err && String(err.message).slice(0, 120));
await avance(21600 + 60);
r = await kp.tour();
t('round 3: the new buyback first again (its cooldown is over)', r.fait && r.to === A && r.comme === 'keeper', r.pourquoi || '');
if (r.fait) await mine(r.hash);
r = await kp.tour();
const montantOld = r.montant;
t('round 4: the earlier buyback on its public path, with all it holds (< MAX_PER_CALL)', r.fait && r.to === OLD && r.comme === 'public' && montantOld === 3n * 10n ** 14n, JSON.stringify({ ...r, montant: String(r.montant) }));
const rc4 = r.fait ? await mine(r.hash) : null;
t('round 4 mined, status 1', rc4 && rc4.status === '0x1', rc4 && BigInt(rc4.gasUsed).toString() + ' gas');
const ov1 = await tb(ancienVault);
t('the earlier buyback paid its own earlier vault, not V', ov1 > ov0, (ov1 - ov0).toString());
r = await kp.tour();
t('round 5: the earlier buyback now holds less than MIN_SPEND and is dropped for good', kp.etat().epuises.includes(OLD) && !r.fait, r.pourquoi);
t('keeper still ON, no failure counted', kp.etat().etat === 'ON' && kp.etat().echecsSuite === 0 && kp.etat().compteurs.reverts === 0, JSON.stringify(kp.etat().compteurs));
for (const j of journal) console.log('   journal:', j);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(ko ? 'RED ' + ko + ' / ' + (ok + ko) : 'GREEN ' + ok + '/' + ok);
process.exitCode = ko ? 1 : 0;
