/* test-lp-lock-deploiement.mjs -- the frozen LP lock deployment (lp-lock-deploiement.js) against the forge artifact, the records it was
 *   copied from, and the deploy page's chain guard.
 * AFFIRME:
 *   - the creation data of the record (V put back by resoudre) == forge artifact bytecode + the 11 constructor words built HERE,
 *     independently, from tblock-hold.js TBLOCK_POOL, etat-naissance.js POSITION_MANAGER, economie-v2-pack-deploye.js V and
 *     lock-weekly-deploiement.js (R2 address, R2 guardian); sha256 of the source and of the creation are the record's;
 *   - the record is NOT ready (pret:false, no address): the plan refuses before any read;
 *   - the plan refuses any chain but Base (with the record forced ready IN MEMORY only), before any simulation or send;
 *   - the page imports lp-lock.js, sends only after planDeploiement, pins chainId on the transaction, never switches chain itself;
 *   - the server serves the three files and keeps the page out of the index;
 *   - the contract constants of lp-lock.js REGLE are the ones in TBlockLPLock.sol.
 *   With FORK=http://127.0.0.1:<port> (a LOCAL base-anvil fork only): the page's own plan runs on the fork (simulation = frozen runtime),
 *   then the creation is sent on the fork from the impersonated deployer and verifierLpLock must hold on every line.
 * NE PROUVE PAS: the mainnet deploy (nobody sends it here), nor the contract's behaviour (TBlockLPLock.t.sol / .fork.t.sol do). */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as L from './lp-lock.js';
import { LP_LOCK_DEPLOIEMENT as REC } from './lp-lock-deploiement.js';
import { TBLOCK_POOL, poolIdOfKey } from './tblock-hold.js';
import { POSITION_MANAGER } from './etat-naissance.js';
import { ADRESSES_PACK_ECONOMIE_V2 } from './economie-v2-pack-deploye.js';
import { LOCK_WEEKLY_DEPLOIEMENT as R2 } from './lock-weekly-deploiement.js';
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const lireF = (f) => readFileSync(new URL(f, import.meta.url));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const w = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
const wa = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');

/* 1. creation == artifact + independent args */
const art = JSON.parse(lireF('./contracts/out/TBlockLPLock.sol/TBlockLPLock.json'));
const K = TBLOCK_POOL;
const args = [wa(POSITION_MANAGER), wa(K.currency0), wa(K.currency1), w(K.fee), w(K.tickSpacing), wa(K.hooks), String(K.poolId).toLowerCase().slice(2),
  wa(ADRESSES_PACK_ECONOMIE_V2.V), wa(R2.parametres.guardian), w(REC.parametres.minL), wa(R2.adresse)].join('');
const attendu = String(art.bytecode.object).toLowerCase() + args;
const { creation } = L.resoudre(REC);
t('creation code of the record == forge artifact bytecode + constructor words built here', creation === attendu, creation.length + ' vs ' + attendu.length);
t('the artifact part alone is the forge bytecode', creation.startsWith(String(art.bytecode.object).toLowerCase()));
t('sha256Creation', sha(creation) === REC.sha256Creation);
t('sha256Source = contracts/src/TBlockLPLock.sol now', sha(lireF('./contracts/src/TBlockLPLock.sol')) === REC.sha256Source);
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : art.metadata;
const km = Object.entries(meta.sources).find(([k]) => /TBlockLPLock\.sol$/.test(k));
t('keccak of the source in the artifact metadata = the record', km && km[1].keccak256 === REC.keccakSourceMeta);
t('runtime size of the artifact', (String(art.deployedBytecode.object).length - 2) / 2 === REC.runtimeOctets);
t('runtime of the artifact passes controleRuntime', (await L.controleRuntime(REC, art.deployedBytecode.object)).length === 0);
t('record integrity []', (await L.integrite(REC)).length === 0, (await L.integrite(REC)).join(', '));
t('poolId = keccak256(abi.encode(key)) (lp-lock.js and tblock-hold.js agree)', L.poolIdDe(REC.parametres) === K.poolId.toLowerCase() && poolIdOfKey(K) === K.poolId.toLowerCase());
t('guardian = R2 guardian', REC.parametres.guardian === R2.parametres.guardian.toLowerCase());
t('rewards = R2 address', REC.parametres.rewards === R2.adresse.toLowerCase());
t('deployer = R2 deployer', REC.deployeur === R2.deployeur.toLowerCase());
t('the record does not carry V', !readFileSync(new URL('./lp-lock-deploiement.js', import.meta.url), 'utf8').toLowerCase().includes(ADRESSES_PACK_ECONOMIE_V2.V.toLowerCase().slice(2)));
t('MIN_L in the record = the measured choice', REC.parametres.minL === REC.mesureMinL.minL && BigInt(REC.parametres.minL) === 20n * 10n ** 18n);
t('MIN_L lets a $5 position in, refuses $0.50', BigInt(REC.mesureMinL.l5Usd) > BigInt(REC.parametres.minL) && BigInt(REC.mesureMinL.l1Usd) / 2n < BigInt(REC.parametres.minL));
/* a tampered record is caught */
const faux = { ...REC, parametres: { ...REC.parametres, minL: '1' } };
t('a changed parameter is caught (words no longer match)', (await L.integrite(faux)).some((x) => /constructor words/.test(x)));
const faux2 = { ...REC, creationModele: REC.creationModele.replace(/.$/, (c) => (c === '0' ? '1' : '0')) };
t('a changed byte is caught (sha256)', (await L.integrite(faux2)).some((x) => /sha256/.test(x)));

/* 2. pret:false -> refused before any read */
/* 2026-11-15: the record is ready (final audit passed: 0 critical/high/medium, L-1/L-2 fixed; unit 57/57, fork 4/4) but not deployed.
 * The pret:false refusal is still proven, on a copy forced NOT ready in memory. */
/* 2026-11-15 14:51 UTC: deployed on Base mainnet (block 57819604), noted from the receipt read on two nodes */
t('record is deployed: the mainnet address, block and tx noted', REC.pret === true && REC.adresse === '0x05989a948507ef5b4d56ca6fd2c26502e0c5cd38'
  && REC.bloc === 57819604 && REC.tx === '0xd4cfb26c35afd12789c4d5ecb20cc57e43d340eb43604fe0be054bafc11fdece');
const deja = await L.planDeploiement(REC, async () => { throw new Error('no rpc expected'); }, REC.deployeur);
t('a deployed record offers nothing more to sign', deja.pret === false && deja.fait === true && /already deployed/.test(deja.raison), deja.raison);
let appels = [];
const espion = (rep) => async (m, p) => { appels.push(m); if (m in rep) return typeof rep[m] === 'function' ? rep[m](p) : rep[m]; throw new Error('unexpected ' + m); };
let r = await L.planDeploiement({ ...REC, pret: false }, espion({}), REC.deployeur);
t('pret:false -> refused, no rpc call at all', r.pret === false && /not marked ready/.test(r.raison) && appels.length === 0, r.raison + ' ' + appels);

/* 3. the pre-deploy guards: a copy of the record IN MEMORY, ready and NOT deployed (the file is deployed since 2026-11-15) */
const PRET = { ...REC, pret: true, adresse: null, bloc: null, tx: null };
for (const c of ['0x1', '0xa', '0x14a34', '0x89', null]) {
  appels = [];
  r = await L.planDeploiement(PRET, espion({ eth_chainId: () => { if (c === null) throw new Error('down'); return c; } }), REC.deployeur);
  t('chain ' + c + ' refused before the simulation', r.pret === false && r.chaine === true && /switch the wallet to Base/.test(r.raison) && appels.join() === 'eth_chainId', r.raison + ' ' + appels);
}
appels = [];
r = await L.planDeploiement(PRET, espion({ eth_chainId: '0x2105', eth_getCode: '0x' }), REC.deployeur);
t('chain 0x2105 passes the guard (next read is the wallet code)', appels[0] === 'eth_chainId' && appels[1] === 'eth_getCode' && !r.chaine, appels.join());
appels = [];
r = await L.planDeploiement(PRET, espion({ eth_chainId: '0x2105' }), '0x' + '1'.repeat(40));
t('another wallet refused before reading the chain', r.pret === false && /not the deployer/.test(r.raison) && appels.length === 0);

/* 4. the page */
const page = readFileSync(new URL('./deployer-lp-lock.html', import.meta.url), 'utf8');
t('page imports lp-lock.js and the record', page.includes("import('./lp-lock.js')") && page.includes("import('./lp-lock-deploiement.js')"));
const iSend = page.indexOf("rpc('eth_sendTransaction'"), iPlan = page.lastIndexOf('await preparer()', iSend);
t('page: exactly one send, after a fresh plan', page.split("'eth_sendTransaction'").length === 2 && iPlan > 0 && iPlan < iSend && page.slice(iPlan, iSend).includes('if (!p.pret) return'));
t('page: the transaction pins chainId from the record', /chainId: '0x' \+ Number\(D\.chaine\)\.toString\(16\)/.test(page));
t('page: never switches or adds a chain itself', !/wallet_switchEthereumChain|wallet_addEthereumChain/.test(page));
t('page: a chain change re-plans', /on\('chainChanged'/.test(page));
t('page: Connect stays disabled unless pret === true', page.includes("D.pret !== true") && page.includes('<button id="connect" disabled>'));
t('page: no inline address', !/0x[0-9a-fA-F]{40}/.test(page));

/* 5. the server */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const bloc = srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
const servis = new Set([...bloc[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
for (const f of ['deployer-lp-lock.html', 'lp-lock-deploiement.js', 'lp-lock.js', 'lock-weekly-deploiement.js', 'etat-naissance.js', 'keccak.js', 'pack-economie-v2.js']) t('served: ' + f, servis.has(f));
t('robots: the deploy page is not indexed', srv.includes("'Disallow: /deployer-lp-lock.html'"));

/* 6. the constants the verifier reads back are the contract's */
const src = lireF('./contracts/src/TBlockLPLock.sol').toString();
const cst = (n) => { const m = src.match(new RegExp('constant ' + n + ' = ([^;]+);')); return m ? m[1].trim() : null; };
t('MIN_WEEKS', cst('MIN_WEEKS') === String(L.REGLE.minWeeks));
t('MAX_WEEKS', cst('MAX_WEEKS') === String(L.REGLE.maxWeeks));
t('MAX_SPAN_WEEKS', cst('MAX_SPAN_WEEKS') === String(L.REGLE.maxSpanWeeks));
t('MARK_GRACE 6 days', cst('MARK_GRACE') === '6 days' && L.REGLE.markGraceS === 6 * 86400);
t('CLAIM_WINDOW 12 weeks', cst('CLAIM_WINDOW') === '12 weeks' && L.REGLE.claimWindowS === 12 * 604800);
t('RESCUE_DELAY 72 hours', cst('RESCUE_DELAY') === '72 hours' && L.REGLE.rescueDelayS === 72 * 3600);

/* 7. LOCAL fork only */
const FORK = process.env.FORK;
if (FORK) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(FORK)) throw new Error('FORK must be a local fork URL');
  let id = 0;
  const rpc = async (method, params) => { const x = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((y) => y.json()); if (x.error) throw new Error(x.error.message || JSON.stringify(x.error)); return x.result; };
  const cv = await rpc('web3_clientVersion', []);
  if (!/anvil/i.test(cv)) throw new Error('not an anvil fork: ' + cv);
  /* first plan on the fork's real state. anvil prices gas at ~1 gwei (Base mainnet: ~0.006 gwei), so the balance step may refuse
   *   here although it would hold on Base: that refusal is printed, never hidden, and then the deployer is given 1 ETH ON THE FORK ONLY */
  let plan = await L.planDeploiement(PRET, rpc, REC.deployeur);
  console.log('fork plan on the real balance:', plan.raison);
  t('fork: the plan reaches at least the balance step (record, chain, wallet, nonce, simulation = frozen runtime, gas all hold)', plan.pret === true || /less than twice the estimated gas cost/.test(plan.raison), plan.raison);
  if (!plan.pret) {
    await rpc('anvil_setBalance', [REC.deployeur, '0xde0b6b3a7640000']);
    plan = await L.planDeploiement(PRET, rpc, REC.deployeur);
  }
  t('fork: the page plan holds (simulation = frozen runtime, gas, balance)', plan.pret === true, plan.raison);
  console.log('fork plan:', plan.raison);
  await rpc('anvil_impersonateAccount', [REC.deployeur]);
  const h = await rpc('eth_sendTransaction', [{ from: REC.deployeur, data: L.resoudre(PRET).creation, gas: '0x' + (plan.gasEnvoi || 8000000n).toString(16), value: '0x0' }]);
  await rpc('anvil_stopImpersonatingAccount', [REC.deployeur]);
  for (let i = 0; i < 20 && !(await rpc('eth_getTransactionReceipt', [h])); i++) await new Promise((o) => setTimeout(o, 250));
  const v = await L.verifierLpLock(PRET, h, rpc);
  for (const l of v.lignes) t('fork verifier: ' + l.quoi, l.ok, l.vu);
  console.log('fork deployed at', v.adresse, 'verifier', v.lignes.filter((x) => x.ok).length + '/' + v.lignes.length, 'predicted', plan.adressePrevue);
  t('fork: deployed at the predicted CREATE address', v.adresse === plan.adressePrevue);
}
console.log('test-lp-lock-deploiement:', ok, 'ok,', ko, 'KO', FORK ? '(with the local fork)' : '(no fork)');
process.exit(ko ? 1 : 0);
