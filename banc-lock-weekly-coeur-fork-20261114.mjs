/* banc-lock-weekly-coeur-fork-20261114.mjs -- on a LOCAL Base fork (anvil :9549; impersonation exists THERE ONLY), the app's own calls:
 *   the holder joins R2 (enrollWeeklyCall), time moves to week 1, then the heart's batch exactly as bcCoeur builds it: likeBatch + the
 *   markPlayed that marquageApresJeu appends from the reads. Every receipt must be status 0x1 (a reverted tx is never "green").
 * AFFIRME: on the real R2, Hearts, V and TBlockLock, a heart then markPlayed in the same week counts the holder (marked, playedWeight);
 *   witness: markPlayed for a holder who did NOT play reverts (so the append is only safe after a play), and the helper appends nothing
 *   once counted.
 * NE PROUVE PAS: a wallet's atomic batch (sent here one call after the other); TAM / skin plays through the router (not appended). */
import * as LW from './lock-weekly-app.js';
import * as EP from './economie-pack.js';
import * as LK from './lock.js';
import { LOCK_WEEKLY_DEPLOIEMENT as REC } from './lock-weekly-deploiement.js';
const URL_ = process.env.FORK || 'http://127.0.0.1:9549';
let id = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)));
  return r.result;
};
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const lit = async (v) => EP.word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']));
const envoyer = async (from, c) => {
  const h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x7a1200' }]);
  let r = null; for (let i = 0; i < 40 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
const H = REC.deployeur.toLowerCase(); /* a real holder with a real lock on Base (3,000,000 TBLOCK until 2027-01-11, read at writing) */
const AUTRE = '0x000000000000000000000000000000000000beef';
const BLOCK = '0xb200000000000000000000e4b0c5fbe9c8df579e'; /* a B20 block, as the prod health probe names it */
t('R2 is the recorded address and has code', (await rpc('eth_getCode', [LW.WEEKLY, 'latest'])).length > 1000, LW.WEEKLY);
await rpc('anvil_impersonateAccount', [H]);
await rpc('anvil_setBalance', [H, '0x' + (10n ** 18n).toString(16)]);
const locked = await lit(LK.VIEW.activeLockedOf(H));
t('the holder has an active lock', locked > 0n, locked);
const r1 = await envoyer(H, LW.enrollWeeklyCall(H));
t('enroll: status 1', r1 && r1.status === '0x1', r1 && r1.status);
/* to week 1 + 1 hour */
const fin0 = await lit(LW.VIEW.epochEnd(await lit(LW.VIEW.currentEpoch())));
const blk = await rpc('eth_getBlockByNumber', ['latest', false]);
await rpc('evm_increaseTime', [Number(fin0 - BigInt(blk.timestamp)) + 3600]); await rpc('evm_mine', []);
const sc = await lit(LW.VIEW.currentEpoch());
t('now in the next week', sc === 1n, sc);
const poids = await lit(LW.VIEW.weightOf(H, sc));
t('the lock weighs in week 1 (joined in week 0)', poids > 0n, poids);
/* the witness first: a holder with no play cannot be marked (the reason the append is only after a heart) */
await rpc('anvil_impersonateAccount', [AUTRE]); await rpc('anvil_setBalance', [AUTRE, '0x' + (10n ** 18n).toString(16)]);
const rW = await envoyer(AUTRE, LW.markPlayedCall(H, sc)).catch(() => null);
t('witness: markPlayed before any play reverts', !rW || rW.status !== '0x1', rW && rW.status);
/* the heart, as bcCoeur builds it: TBLOCK for the price, from R's balance ON THE FORK ONLY */
const prix = await lit(EP.VIEW.likePrice());
const bal = await lit(EP.VIEW.balanceOf(EP.TBLOCK, H));
if (bal < prix) {
  await rpc('anvil_impersonateAccount', [EP.REWARDS]); await rpc('anvil_setBalance', [EP.REWARDS, '0x' + (10n ** 18n).toString(16)]);
  const tr = await envoyer(EP.REWARDS, { to: EP.TBLOCK, data: '0xa9059cbb' + EP.wAddr(H) + EP.wUint(prix * 2n) });
  t('fork funding of the heart price: status 1', tr && tr.status === '0x1', tr && tr.status);
}
const [fin, mq] = await Promise.all([lit(LW.VIEW.epochEnd(sc)), lit(LW.VIEW.marked(H, sc))]);
const now = BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const compter = LW.marquageApresJeu({ holder: H, courant: sc, finSemaineS: fin, maintenantS: now, poids, marque: mq === 1n });
t('the helper appends markPlayed', !!compter && compter.data === LW.markPlayedCall(H, sc).data);
const lot = [...EP.likeBatch({ block: BLOCK, n: 1, likePrice: prix }), ...(compter ? [compter] : [])];
t('the heart batch ends with markPlayed', lot.length >= 2 && lot[lot.length - 1].to === LW.WEEKLY, lot.length);
for (const [i, c] of lot.entries()) { const r = await envoyer(H, c); t('heart batch call ' + i + ': status 1', r && r.status === '0x1', r && r.status); }
t('played in V this week', (await lit(LW.VIEW.hasPlayed(H, sc))) === 1n);
t('counted (marked)', (await lit(LW.VIEW.marked(H, sc))) === 1n);
t('playedWeight(week) = the lock weight', (await lit(LW.VIEW.playedWeight(sc))) >= poids, await lit(LW.VIEW.playedWeight(sc)));
const apres = LW.marquageApresJeu({ holder: H, courant: sc, finSemaineS: fin, maintenantS: now, poids, marque: (await lit(LW.VIEW.marked(H, sc))) === 1n });
t('a second heart this week appends nothing', apres === null);
const et = LW.etatSemaine({ poids, joue: true, marque: true });
t('the card then says counted, no button', et.action === null && /counted/.test(et.texte), et.texte);
await rpc('anvil_stopImpersonatingAccount', [H]);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
