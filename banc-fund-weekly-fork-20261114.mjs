/* banc-fund-weekly-fork-20261114.mjs -- on a LOCAL Base fork (anvil :9549; impersonation exists THERE ONLY), the calls fund-weekly.html
 *   sends: the guardian READ on chain requests R -> R2 for R's whole TBLOCK balance, waits 72 h, executes; then a holder deposits.
 * AFFIRME: the request lands only from the guardian (another wallet reverts), execute before 72 h reverts, after it R2 gets exactly what R
 *   held and R holds 0; etatRescue answers request -> wait -> execute along the way; a deposit of 1,000 TBLOCK raises R2 by 1,000.
 * NE PROUVE PAS: the page's DOM and the person's wallet (checked on prod: served bytes). */
import * as F from './fund-weekly.js';
import * as EP from './economie-pack.js';
const URL_ = process.env.FORK || 'http://127.0.0.1:9549';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(URL_)) { console.error('FORK must be a local fork'); process.exit(2); }
let id = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)));
  return r.result;
};
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (vu !== '' ? ' — ' + vu : '')); };
const lit = async (v) => rpc('eth_call', [v, 'latest']);
const big = async (v) => BigInt(await lit(v));
const imp = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 18n).toString(16)]); };
const envoyer = async (from, c) => {
  const h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: '0x0', gas: '0x7a1200' }]);
  let r = null; for (let i = 0; i < 60 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
const ts = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const G = '0x' + String(await lit(F.VIEW.guardian())).slice(-40);
t('the guardian read on chain is the DEV wallet of the record', G === '0x264496cc303f8dbe49a241ea84cd42be8392bc80', G);
const soldeR = await big(F.VIEW.soldeR()), r2Avant = await big(F.VIEW.soldeR2());
t('R holds TBLOCK', soldeR > 0n, soldeR);
const st = async (moi) => F.etatRescue({ moi, guardian: G, pending: F.decoderRescue(await lit(F.VIEW.pendingRescue())), maintenantS: await ts(), soldeR: await big(F.VIEW.soldeR()) });
const AUTRE = '0x000000000000000000000000000000000000beef';
await imp(AUTRE); await imp(G);
t('another wallet: nothing offered', (await st(AUTRE)).action === null);
t('the guardian: request offered', (await st(G)).action === 'request');
const rx = await envoyer(AUTRE, F.rescueVersR2(soldeR));
t('witness: the request from another wallet reverts', !rx || rx.status !== '0x1', rx && rx.status);
const r1 = await envoyer(G, F.rescueVersR2(soldeR));
t('request from the guardian: status 1', r1 && r1.status === '0x1', r1 && r1.status);
const s1 = await st(G);
t('then: wait, nothing offered', s1.action === null && /opens in/.test(s1.texte), s1.texte);
const r2 = await envoyer(G, F.rescueExecuter());
t('witness: execute before 72 h reverts', !r2 || r2.status !== '0x1');
await rpc('evm_increaseTime', [F.DELAI_RESCUE_S + 1]); await rpc('evm_mine', []);
t('after 72 h: execute offered', (await st(G)).action === 'execute');
const r3 = await envoyer(G, F.rescueExecuter());
t('execute: status 1', r3 && r3.status === '0x1', r3 && r3.status);
t('R2 received exactly what R held', (await big(F.VIEW.soldeR2())) - r2Avant === soldeR);
t('R holds 0 TBLOCK, nothing pending', (await big(F.VIEW.soldeR())) === 0n && (await st(G)).action === null);
/* a deposit: TBLOCK for a holder from R2's balance ON THE FORK ONLY */
const D = '0x000000000000000000000000000000000000d0d0', mille = 1000n * 10n ** 18n;
await imp(F.R2);
await envoyer(F.R2, { to: EP.TBLOCK, data: '0xa9059cbb' + D.slice(2).padStart(64, '0') + mille.toString(16).padStart(64, '0') });
await imp(D);
const avantD = await big(F.VIEW.soldeR2());
const [ap, dep] = F.depotR2(mille);
const ra = await envoyer(D, ap), rd = await envoyer(D, dep);
t('deposit: approve + deposit, status 1', ra && ra.status === '0x1' && rd && rd.status === '0x1');
t('R2 +1,000 TBLOCK', (await big(F.VIEW.soldeR2())) - avantD === mille);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
