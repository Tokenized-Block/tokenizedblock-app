/* banc-lock-weekly-paie-fork-20261114.mjs -- on a LOCAL Base fork (anvil :9549; impersonation exists THERE ONLY), the whole weekly road
 *   with the REAL state of 2026-11-14 (the holder enrolled on mainnet, R2 funded with 62,700 TBLOCK on mainnet): week 0 is closed by the
 *   box's own close call, the holder plays a heart and is counted in week 1, week 1 is closed, the holder claims.
 * AFFIRME: closeEpoch is refused before end + grace and lands after; semainesAFermer offers exactly the closable weeks; the claim pays
 *   exactly claimable() and that is unassigned × 7% × P / W read before the close (here P = W if only counted locks played).
 * NE PROUVE PAS: a wallet's atomic batch (calls sent one after the other); other holders' future behaviour. */
import * as LW from './lock-weekly-app.js';
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
const lit = async (v) => EP.word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']));
const envoyer = async (from, c) => {
  const h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x7a1200' }]);
  let r = null; for (let i = 0; i < 60 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
const imp = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 18n).toString(16)]); };
const ts = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const aller = async (s) => { await rpc('evm_increaseTime', [Number(s - (await ts()))]); await rpc('evm_mine', []); };
const H = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', BLOCK = '0xb200000000000000000000e4b0c5fbe9c8df579e', X = '0x000000000000000000000000000000000000beef';
await imp(H); await imp(X);
t('fork state: the holder is enrolled (mainnet tx 0xfa4b…) and weighs in week 1', (await lit(LW.VIEW.weightOf(H, 1n))) > 0n);
t('fork state: R2 holds the 62,700 TBLOCK deposited on mainnet', (await lit(EP.VIEW.balanceOf(EP.TBLOCK, LW.WEEKLY))) >= 62_700n * 10n ** 18n);
const fin0 = await lit(LW.VIEW.epochEnd(0n));
await aller(fin0 + 3600n);
t('in week 1, grace of week 0: nothing to close yet', LW.semainesAFermer({ prochain: 0n, fins: [fin0], maintenantS: await ts() }).length === 0);
const rw = await envoyer(X, LW.closeWeeklyCall(0n));
t('witness: closeEpoch(0) during its grace day reverts', !rw || rw.status !== '0x1');
/* the heart in week 1, then counted (the bench banc-lock-weekly-coeur proves the append; here the payout) */
const prix = await lit(EP.VIEW.likePrice());
if ((await lit(EP.VIEW.balanceOf(EP.TBLOCK, H))) < prix) { await imp(EP.REWARDS); await envoyer(EP.REWARDS, { to: EP.TBLOCK, data: '0xa9059cbb' + EP.wAddr(H) + EP.wUint(prix) }); }
for (const c of [...EP.likeBatch({ block: BLOCK, n: 1, likePrice: prix }), LW.markPlayedCall(H, 1n)]) { const r = await envoyer(H, c); t('heart + count in week 1: status 1', r && r.status === '0x1', r && r.status); }
await aller(fin0 + 86400n);
t('grace over: the box offers week 0', LW.semainesAFermer({ prochain: 0n, fins: [fin0], maintenantS: await ts() }).join() === '0');
const r0 = await envoyer(X, LW.closeWeeklyCall(0n));
t('closeEpoch(0) by any wallet: status 1', r0 && r0.status === '0x1');
const fin1 = await lit(LW.VIEW.epochEnd(1n));
await aller(fin1 + 86400n);
const [un, P, W] = [await lit(LW.VIEW.unassigned(EP.TBLOCK)), await lit(LW.VIEW.playedWeight(1n)), await lit(LW.VIEW.projectedTotalWeight(1n))];
const r1 = await envoyer(X, LW.closeWeeklyCall(1n));
t('closeEpoch(1): status 1', r1 && r1.status === '0x1');
const attendu = (un * 700n / 10000n) * P / W; /* MAX_POT not reached at this size */
const potT = EP.word(await rpc('eth_call', [LW.VIEW.pot(1n), 'latest']), 1);
t('pot(1) = unassigned × 7% × P / W', potT === attendu, potT + ' vs ' + attendu + ' (P ' + P + ', W ' + W + ')');
const q = await rpc('eth_call', [LW.VIEW.claimable(H, [1n]), 'latest']), du = EP.word(q, 1);
t('claimable for the holder > 0', du > 0n, du);
const avant = await lit(EP.VIEW.balanceOf(EP.TBLOCK, H));
const rc = await envoyer(H, LW.claimWeeklyCall([1n]));
t('claim: status 1', rc && rc.status === '0x1');
t('the holder received exactly claimable', (await lit(EP.VIEW.balanceOf(EP.TBLOCK, H))) - avant === du, du / 10n ** 18n + ' TBLOCK');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
