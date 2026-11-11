// banc-lock-fork-20261110.mjs — needs: a base-anvil fork of Base on 127.0.0.1:8659 (FOUNDRY_BASE=true anvil --base --fork-url …).
// Deploys the FROZEN bytes of lock-deploiement.js (the exact data deployer-lock.html offers), then sends the calls BUILT BY lock.js (the exact
// calls the app will ask a wallet to sign), with the REAL TBLOCK (B20) and a real holder impersonated on the LOCAL fork only.
// Nothing here touches mainnet. Each tx's receipt STATUS is checked (a green on status 0x0 is the known trap).
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur } from './keccak.js';
import { LOCK_DEPLOIEMENT as D } from './lock-deploiement.js';
const U = 'http://127.0.0.1:8659';
const TB = '0xb200000000000000000000ba9bf8330307f8830e';
const HOLDER = '0x025d751752d3aa695fdb3d9eedee69bc9553f331'; /* the holders vault: 549,434 TBLOCK on mainnet (read 2026-11-10); impersonated on the fork */
let id = 0;
async function rpc(method, params = []) { const r = await fetch(U, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; }
const pa = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const call = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const bal = async (a) => BigInt(await call(TB, 'balanceOf(address)', pa(a)));
let ok = 0, ko = 0;
const t = (m, c, extra = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (extra ? ' — ' + extra : '')); };
async function envoyer(from, tx) {
  const h = await rpc('eth_sendTransaction', [{ from, ...(tx.to ? { to: tx.to } : {}), data: tx.data, value: tx.value || '0x0', gas: '0x' + (3_000_000).toString(16) }]);
  for (let k = 0; k < 60; k++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 500)); }
  throw new Error('no receipt for ' + h);
}
async function revertDe(from, tx) { try { await rpc('eth_call', [{ from, to: tx.to, data: tx.data }, 'latest']); return null; } catch (e) { return String(e.data || e.message); } }
const sha = async (s) => (await import('node:crypto')).createHash('sha256').update(s).digest('hex');

const E = 10n ** 18n;
t('frozen data integrity (sha256 = the one deployer-lock.html checks)', (await sha(D.creation)) === D.sha256Creation);
await rpc('anvil_impersonateAccount', [HOLDER]);
await rpc('anvil_setBalance', [HOLDER, '0x' + (10n ** 18n).toString(16)]);
const b0 = await bal(HOLDER);
t('the holder holds TBLOCK on the fork', b0 >= 500_000n * E, String(b0 / E) + ' TBLOCK');
const dep = await envoyer(HOLDER, { data: D.creation });
t('deploy of the FROZEN bytes: status 1', dep.status === '0x1');
const LA = String(dep.contractAddress).toLowerCase();
t('it reads the real TBLOCK, 7 days minimum, 7-day withdrawal period', (await call(LA, 'TBLOCK()')).toLowerCase().endsWith(TB.slice(2)) && BigInt(await call(LA, 'MIN_LOCK()')) === 604800n && BigInt(await call(LA, 'WITHDRAW_DELAY()')) === 604800n);

/* lock.js with the deployed address, as the app will have it */
const ICI = path.dirname(fileURLToPath(import.meta.url));
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lockfork-'));
for (const f of ['lock.js', 'keccak.js']) fs.copyFileSync(path.join(ICI, f), path.join(DIR, f));
fs.writeFileSync(path.join(DIR, 'lock-deploiement.js'), fs.readFileSync(path.join(ICI, 'lock-deploiement.js'), 'utf8').replace(/adresse: (null|'0x[0-9a-f]{40}')/, "adresse: '" + LA + "'"));
const L = await import(pathToFileURL(path.join(DIR, 'lock.js')).href);
const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
const AMT = 500_000n * E;
const [appr, lk] = L.lockBatch({ amount: AMT, jours: 7, maintenantSec: now });
const r1 = await envoyer(HOLDER, appr); t('app call 1 (approve exactly): status 1', r1.status === '0x1');
const r2 = await envoyer(HOLDER, lk); t('app call 2 (lock 7 days + margin): status 1', r2.status === '0x1');
t('activeLockedOf = 500,000 TBLOCK (what gates read)', BigInt(await rpc('eth_call', [L.VIEW.activeLockedOf(HOLDER), 'latest'])) === AMT);
t('allowance back to 0 (approve was exact)', BigInt(await call(TB, 'allowance(address,address)', pa(HOLDER) + pa(LA))) === 0n);
t('the TBLOCK moved into the lock', (await bal(HOLDER)) === b0 - AMT && (await bal(LA)) === AMT);
const sansDemande = await revertDe(HOLDER, L.withdrawCall());
t('withdraw without a request is refused (NotRequested)', sansDemande !== null && sansDemande.includes(selecteur('NotRequested()').slice(2)), sansDemande && sansDemande.slice(0, 12));
/* Phil 2026-11-10: the 7-day withdrawal period — request (perks stop), wait, take back */
const rq = await envoyer(HOLDER, L.requestWithdrawCall()); t('app request call: status 1', rq.status === '0x1');
t('the request ends the perks at once (activeLockedOf = 0)', BigInt(await rpc('eth_call', [L.VIEW.activeLockedOf(HOLDER), 'latest'])) === 0n);
const wAt = BigInt(await rpc('eth_call', [L.VIEW.withdrawableAtOf(HOLDER), 'latest']));
const tReq = BigInt(await rpc('eth_call', [L.VIEW.requestedAtOf(HOLDER), 'latest']));
t('withdrawable at the later of the lock date and request + 7 days', wAt >= tReq + 604800n);
const tot = await revertDe(HOLDER, L.withdrawCall());
t('withdraw during the period is refused (TooEarly)', tot !== null && tot.includes(selecteur('TooEarly(uint256)').slice(2)), tot && tot.slice(0, 12));
const cur = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
await rpc('evm_increaseTime', [Number(wAt) - cur + 5]); await rpc('evm_mine', []);
const r3 = await envoyer(HOLDER, L.withdrawCall());
t('app withdraw call: status 1', r3.status === '0x1');
t('every TBLOCK is back, exactly', (await bal(HOLDER)) === b0 && (await bal(LA)) === 0n);
fs.rmSync(DIR, { recursive: true, force: true });
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green') + ' · gas approve ' + BigInt(r1.gasUsed) + ', request ' + BigInt(rq.gasUsed) + ', lock ' + BigInt(r2.gasUsed) + ', withdraw ' + BigInt(r3.gasUsed) + ', deploy ' + BigInt(dep.gasUsed));
process.exit(ko ? 1 : 0);
