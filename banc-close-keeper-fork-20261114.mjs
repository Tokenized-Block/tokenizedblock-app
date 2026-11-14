/* banc-close-keeper-fork-20261114.mjs -- the close keeper against the REAL V, R and R2 on a LOCAL Base fork (anvil :9549). The key is a
 *   throwaway generated here, funded with fork ETH and named as the keeper: it exists on the fork only, never on Base.
 * AFFIRME: before the ends nothing is sent; after V's week 0 ends + 1 h the keeper closes it (status 1, V.epochs(0).closed); R2's week 0
 *   waits for its grace day + 1 h, then closes; R's month 0 closes after 2026-12-12 + 1 h; each tx is closeEpoch to that contract only,
 *   from the keeper address; a second round with nothing left sends nothing.
 * NE PROUVE PAS: the prod key (the server checks it is the buyback keeper of the record) or the prod node's behaviour. */
import { randomBytes } from 'node:crypto';
import * as K from './close-keeper.js';
import * as EP from './economie-pack.js';
import * as LW from './lock-weekly-app.js';
import { adresseDe } from './signeur-secp256k1.js';
const URL_ = process.env.FORK || 'http://127.0.0.1:9549';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(URL_)) { console.error('FORK must be a local fork'); process.exit(2); }
let id = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(method + ': ' + (r.error.message || JSON.stringify(r.error))); e.data = r.error.data; throw e; }
  return r.result;
};
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (vu !== '' ? ' — ' + vu : '')); };
const cle = '0x' + randomBytes(32).toString('hex'), moi = adresseDe(cle).toLowerCase();
await rpc('anvil_setBalance', [moi, '0x' + (10n ** 17n).toString(16)]);
const k = K.creerKeeperClose({ cle, vault: EP.VAULT, horloge: EP.HEARTS, mensuel: EP.REWARDS, hebdo: LW.WEEKLY, chaine: 8453, keeperAttendu: moi, rpc, bornes: { inclusionMaxMs: 30000 } });
t('keeper ON with the throwaway key', k.etat().etat === 'ON', k.etat().pourquoi || '');
const ts = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const aller = async (s) => { const n = await ts(); await rpc('evm_setNextBlockTimestamp', [Number(s > n ? s : n + 1n)]); await rpc('evm_mine', []); }; /* exact: evm_increaseTime adds to anvil's wall clock and overshoots */
const mot = (h, i = 0) => BigInt('0x' + String(h).slice(2 + 64 * i, 66 + 64 * i));
const call = async (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const { selecteur } = await import('./keccak.js');
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const vFerme = async (e) => mot(await call(EP.VAULT, selecteur('epochs(uint256)') + u(e)), 3) === 1n;
const r1 = await k.tour();
t('before any end: nothing sent', r1.fait === false, r1.pourquoi);
/* a tour that sent, then its receipt read by the next tour */
const verifierTx = async (h, cible) => { const tx = await rpc('eth_getTransactionByHash', [h]); const rc = await rpc('eth_getTransactionReceipt', [h]); return tx && rc && tx.from.toLowerCase() === moi && tx.to.toLowerCase() === cible && tx.input.startsWith(K.SEL_CLOSE) && rc.status === '0x1'; };
const finV = BigInt(await call(EP.HEARTS, selecteur('epochEnd(uint256)') + u(0)));
await aller(finV + 3599n);
t('V week 0 ended, margin not passed: nothing sent', (await k.tour()).fait === false);
await aller(finV + 3600n);
const r2 = await k.tour();
t('V week 0 + 1 h: closeEpoch(0) sent to V', r2.fait === true && /holders vault week 0/.test(r2.quoi), JSON.stringify(r2));
await rpc('evm_mine', []); await k.tour();
t('V tx: from the keeper, to V, closeEpoch, status 1', r2.hash && await verifierTx(r2.hash, EP.VAULT));
t('V.epochs(0).closed', await vFerme(0n));
const r3 = await k.tour();
t('R2 week 0 in its grace day: nothing sent', r3.fait === false, r3.pourquoi);
const finR2 = mot(await call(LW.WEEKLY, '0x' + LW.SEL.epochEnd + u(0)));
await aller(finR2 + 86400n + 3600n);
const r4 = await k.tour();
t('R2 week 0 after grace + 1 h: closeEpoch(0) sent to R2', r4.fait === true && /weekly lock rewards week 0/.test(r4.quoi), JSON.stringify(r4));
await rpc('evm_mine', []); await k.tour();
t('R2 tx checked, nextEpochToClose = 1', r4.hash && await verifierTx(r4.hash, LW.WEEKLY) && mot(await call(LW.WEEKLY, '0x' + LW.SEL.nextEpochToClose)) === 1n);
const finR = mot(await call(EP.REWARDS, selecteur('epochEnd(uint256)') + u(0)));
await aller(finR + 3600n);
/* by then V weeks 1..3 and R2 weeks 1..3 are finished too: the keeper closes one per round, V first; run until R is closed */
let fermeR = false, n = 0;
while (!fermeR && n < 20) { const r = await k.tour(); await rpc('evm_mine', []); if (r.fait && /monthly/.test(r.quoi)) { await k.tour(); fermeR = await verifierTx(r.hash, EP.REWARDS); } n++; }
t('R month 0 closed by the keeper (after V and R2 catch up, one tx per round)', fermeR, n + ' rounds');
let fin = 0; for (let i = 0; i < 12; i++) { const r = await k.tour(); await rpc('evm_mine', []); if (!r.fait && /nothing to close|waiting/.test(r.pourquoi)) { fin++; if (fin >= 2) break; } }
t('caught up: rounds then send nothing', fin >= 2);
const e = k.etat();
t('no failure, no revert', e.etat === 'ON' && e.compteurs.reverts === 0 && e.compteurs.envoisRefuses === 0, JSON.stringify(e.compteurs));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
