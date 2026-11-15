/* banc-lp-lock-keeper-fork-20261115.mjs -- the LP lock keeper (lp-lock-keeper.js) against the REAL TBlockLPLock on a LOCAL base-anvil fork of
 *   Base (started HERE on a free port, stopped at the end; impersonation exists THERE ONLY). The keeper key is a throwaway generated here,
 *   funded with fork ETH and named as the keeper: it exists on the fork only, never on Base.
 * THE PATH: a real TBLOCK holder (the recorded deployer, impersonated on the fork) adds two full-range positions and locks them with the
 *   card's own plans (lp-lock-app.js: step 1 mint, step 2 = the number READ FROM THE RECEIPT, approve + lock); time moves into the first
 *   locked week; the holder plays in that week with a heart (economie-pack.js likeBatch, the app's own batch); swaps wtCOIN -> TBLOCK on the
 *   pinned pool (tblock-route.js planWtcoinVersTblock, the app's own plan) earn fees for the positions; then the keeper's rounds.
 * AFFIRME: the index reads the lock's events from its DEPLOY block (windows <= 45,000 blocks) and finds both positions for the holder;
 *   before the harvest window nothing is sent; in the last 6 h of the week ONE harvest([both ids]) is sent, from the keeper address, to the
 *   lock, status 1; pot(week) grew by EXACTLY the Harvested amounts, which equal the fees owed to both positions computed independently
 *   from the StateView (fee growth inside x liquidity / 2^128) and the lock's wtCOIN balance change; a second round sends nothing
 *   (lastHarvestOf); after the week ends + 1 h (not at + 59 min 59 s) ONE markWeekBatch(week, [holder]) is sent, status 1, and
 *   weightOf(week, holder) = isqrt(L1 + L2) x V.playOf(week, holder) = totalWeight(week); a later round sends nothing; no revert, no failure.
 *   (The "a lot that would mark 0 is not sent" case is proven on the fake chain of test-lp-lock-keeper, not here.)
 * NE PROUVE PAS: the prod key (the server checks it is the buyback keeper of its record), the prod node, many holders / 50-id lots (two
 *   ids and one holder here: the gas per id is printed, measured, not extrapolated as a promise); fees in TBLOCK (the swaps here go
 *   wtCOIN -> TBLOCK, so the fees are wtCOIN; the TBLOCK pot change is checked to be exactly 0, the Harvested TBLOCK amount). */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as K from './lp-lock-keeper.js';
import * as A from './lp-lock-app.js';
import * as EP from './economie-pack.js';
import { planWtcoinVersTblock } from './tblock-route.js';
import { LP_LOCK_DEPLOIEMENT as REC } from './lp-lock-deploiement.js';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur, topic } from './keccak.js';
import { isqrt } from './pool.js';

const PORT = Number(process.env.FORK_PORT || 9563);
const ANVIL = process.env.BASE_ANVIL || 'C:/Users/VolKov/.foundry/versions/base-v1.1.1/anvil.exe';
const URL_ = 'http://127.0.0.1:' + PORT;
const anvil = spawn(ANVIL, ['--base', '--fork-url', process.env.FORK_URL || 'https://base-rpc.publicnode.com', '--port', String(PORT), '--silent'], { stdio: 'ignore' });
let id = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(method + ': ' + (r.error.message || JSON.stringify(r.error))); e.code = r.error.code; e.data = r.error.data; throw e; }
  return r.result;
};
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else ko++; console.log((c ? 'ok  ' : 'KO  ') + m + (vu !== '' ? ' — ' + vu : '')); };
const fin = (code) => { try { anvil.kill(); } catch (_) {} console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green')); process.exit(code); };
const J = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? v.toString() : v));
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const mot = (h, i = 0) => BigInt('0x' + String(h).replace(/^0x/, '').slice(64 * i, 64 * (i + 1)));
const call = async (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const lit = async (v) => A.word(await call(v.to, v.data));
const L = A.LP_LOCK;
const envoyer = async (from, c) => {
  let h;
  try { h = await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value || '0x0', gas: '0x7a1200' }]); } catch (e) { return { status: 'refused', why: String(e.message).slice(0, 160) }; }
  let r = null; for (let i = 0; i < 40 && !r; i++) { try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { r = null; } if (!r) await new Promise((o) => setTimeout(o, 250)); }
  return r;
};
const ts = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const aller = async (s) => { const n = await ts(); await rpc('evm_setNextBlockTimestamp', [Number(s > n ? s : n + 1n)]); await rpc('evm_mine', []); };
const recu = async (h) => { let r = null; for (let i = 0; i < 40 && !r; i++) { try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { r = null; } if (!r) await new Promise((o) => setTimeout(o, 250)); } return r; };
const SEL = { pot: selecteur('pot(uint256)'), weightOf: selecteur('weightOf(uint256,address)'), totalWeight: selecteur('totalWeight(uint256)'),
  lastHarvestOf: selecteur('lastHarvestOf(uint256)'), VAULT: selecteur('VAULT()'), playOf: selecteur('playOf(uint256,address)'), epochEnd: selecteur('epochEnd(uint256)'),
  currentEpoch: selecteur('currentEpoch()'), positionOf: selecteur('positionOf(uint256)'),
  getPositionInfo: selecteur('getPositionInfo(bytes32,address,int24,int24,bytes32)'), getFeeGrowthInside: selecteur('getFeeGrowthInside(bytes32,int24,int24)') };
const TOPIC_HARVESTED = topic('Harvested(address,uint256,uint256,uint256,uint256,uint256)').toLowerCase();
const neg = (n) => ((1n << 256n) + BigInt(n)).toString(16).padStart(64, '0');
/* fees owed to a position, from the StateView alone (independent of the lock): (feeGrowthInside - last) * L >> 128, per currency */
async function dus(tokenId) {
  const salt = u(tokenId), pid = A.POOL_ID.replace(/^0x/, '');
  const pi = await call(A.STATE_VIEW_, SEL.getPositionInfo + pid + u(BigInt(A.PM)) + neg(-887220) + u(887220) + salt);
  const fg = await call(A.STATE_VIEW_, SEL.getFeeGrowthInside + pid + neg(-887220) + u(887220));
  const Lp = mot(pi, 0), M = 1n << 256n;
  return { L: Lp, w: (((mot(fg, 0) - mot(pi, 1)) % M + M) % M * Lp) >> 128n, t: (((mot(fg, 1) - mot(pi, 2)) % M + M) % M * Lp) >> 128n };
}

try {
  let pret = false;
  for (let i = 0; i < 60 && !pret; i++) { try { await rpc('eth_blockNumber'); pret = true; } catch (_) { await new Promise((o) => setTimeout(o, 1000)); } }
  t('base-anvil fork answers on port ' + PORT, pret);
  if (!pret) fin(1);
  t('chain id 8453 on the fork', BigInt(await rpc('eth_chainId')) === 8453n);
  t('the LP lock has code at the recorded address', (await rpc('eth_getCode', [L, 'latest'])).length > 1000, L);
  const H = String(REC.deployeur).toLowerCase(); /* a real TBLOCK holder on Base (the recorded deployer); impersonated on the fork only */
  await rpc('anvil_impersonateAccount', [H]); await rpc('anvil_setBalance', [H, '0x' + (10n ** 18n).toString(16)]);
  const PMGR = '0x498581ff718922c3f8e6a244956af099b2652b2b'; /* usage-onchain.js POOL_MANAGER (copied from banc-lp-lock-app-fork) */
  await rpc('anvil_impersonateAccount', [PMGR]); await rpc('anvil_setBalance', [PMGR, '0x' + (10n ** 18n).toString(16)]);
  for (const [jeton, q] of [[A.WTCOIN, 5n * 10n ** 16n], [A.TBLOCK, 6n * 10n ** 23n]]) {
    const r = await envoyer(PMGR, { to: jeton, data: '0xa9059cbb' + A.wAddr(H) + A.wUint(q) });
    t('fork top-up ' + jeton.slice(0, 8) + ': status 1', r && r.status === '0x1', r && (r.status || r.why));
  }
  await rpc('anvil_stopImpersonatingAccount', [PMGR]);

  /* two positions, added and locked with the card's own plans */
  const ids = [];
  for (const [cote, montant] of [['wtcoin', 5n * 10n ** 15n], ['tblock', 15n * 10n ** 22n]]) {
    const plan = await A.planifierAjoutEtLock({ rpc, moi: H, cote, montant, semaines: 4 });
    t('step 1 plan (' + cote + ') ready', plan.etat === 'PRET', plan.pourquoi);
    if (plan.etat !== 'PRET') fin(1);
    let dernier = null;
    for (const c of plan.appels) { dernier = await envoyer(H, c); t('step 1 call: status 1', dernier && dernier.status === '0x1', dernier && (dernier.status || dernier.why)); }
    const lpm = await A.lirePositionMintee({ rpc, hashes: [dernier.transactionHash], moi: H });
    t('step 2 number read from the receipt', lpm.ids.length === 1, J(lpm));
    const pl = A.planLockExistant({ moi: H, tokenId: lpm.ids[0], semaines: 4, nft: await A.lireNft({ rpc, tokenId: lpm.ids[0], moi: H }), liquiditeAttendue: plan.liquidite });
    t('step 2 plan ready', pl.etat === 'PRET', pl.pourquoi);
    for (const c of pl.appels) { const r = await envoyer(H, c); t('step 2 call: status 1', r && r.status === '0x1', r && (r.status || r.why)); }
    ids.push(lpm.ids[0]);
  }
  const c0 = mot(await call(L, SEL.currentEpoch));
  const pos = await Promise.all(ids.map(async (x) => { const h = await call(L, SEL.positionOf + u(x)); return { locker: '0x' + h.slice(26, 66), L: mot(h, 1), debut: mot(h, 2), fin: mot(h, 3) }; }));
  t('both locked by the holder, from next week', pos.every((p) => p.locker === H && p.debut === c0 + 1n), J(pos));
  const e = c0 + 1n;

  /* the index, from the lock's DEPLOY block */
  /* with the server's default: it stays INDEX_DEFAUT.confirmations blocks under the head (the 2 fresh locks are inside that tail) */
  const index = K.creerIndexLpLock({ lock: L, bloc: REC.bloc, rpcLogs: (m, p) => rpc(m, p), fenetresParTour: 20 });
  const CONF = K.INDEX_DEFAUT.confirmations;
  t('index: server default confirmations = ' + CONF, index.confirmations === CONF && CONF > 0);
  const teteA = Number(BigInt(await rpc('eth_blockNumber')));
  for (let i = 0; i < 6 && !index.aJour(0); i++) await index.avancer(teteA);
  t('index: caught up to head - ' + CONF + ', the 2 locks of the last blocks not indexed yet', index.aJour(0) && index.jusqua() === teteA - CONF && index.positionsDe(H).length === 0, index.jusqua() + ' / ' + teteA + ' ' + index.positionsDe(H).join());
  await rpc('anvil_mine', ['0x' + (CONF + 1).toString(16)]);
  const tete0 = Number(BigInt(await rpc('eth_blockNumber')));
  let tentatives = 0;
  while ((!index.aJour(0) || index.jusqua() < tete0 - CONF) && tentatives < 6) { await index.avancer(tete0); tentatives++; }
  t('index read from the deploy block ' + REC.bloc + ' to the head', index.aJour(0) && index.etat().depuis === REC.bloc, J(index.etat()));
  t('index: both positions for the holder', index.positionsDe(H).join() === ids.map(String).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)).join(), index.positionsDe(H).join());

  /* the keeper, with a throwaway fork-only key */
  const cle = '0x' + randomBytes(32).toString('hex'), moi = adresseDe(cle).toLowerCase();
  await rpc('anvil_setBalance', [moi, '0x' + (10n ** 17n).toString(16)]);
  const k = K.creerKeeperLpLock({ cle, lock: L, index, chaine: 8453, keeperAttendu: moi, rpc, bornes: { inclusionMaxMs: 30000 } });
  t('keeper ON with the throwaway key', k.etat().etat === 'ON', k.etat().pourquoi || '');
  /* move into week e (the first locked week) */
  const finC0 = mot(await call(L, SEL.epochEnd + u(c0)));
  await aller(finC0 + 60n);
  t('now in the first locked week', mot(await call(L, SEL.currentEpoch)) === e);
  let r = await k.tour();
  t('start of the week: nothing sent', r.fait === false, r.pourquoi);
  /* WITNESS: the holder has liquidity in e but has not played: a count would mark 0 (the keeper sends nothing in that case) */
  const finE = mot(await call(L, SEL.epochEnd + u(e)));
  const V = '0x' + (await call(L, SEL.VAULT)).slice(26, 66);
  t('the lock pays by the holders vault of the economy pack', V === EP.VAULT, V);
  /* the heart, as the app builds it (likeBatch), TBLOCK for the price from R's balance ON THE FORK ONLY if short */
  const prix = await lit(EP.VIEW.likePrice());
  if ((await lit(EP.VIEW.balanceOf(EP.TBLOCK, H))) < prix * 2n) {
    await rpc('anvil_impersonateAccount', [EP.REWARDS]); await rpc('anvil_setBalance', [EP.REWARDS, '0x' + (10n ** 18n).toString(16)]);
    const tr = await envoyer(EP.REWARDS, { to: EP.TBLOCK, data: '0xa9059cbb' + EP.wAddr(H) + EP.wUint(prix * 2n) });
    t('fork funding of the heart price: status 1', tr && tr.status === '0x1', tr && tr.status);
  }
  const BLOCK = '0xb200000000000000000000e4b0c5fbe9c8df579e'; /* a B20 block (copied from banc-lock-weekly-coeur-fork) */
  for (const [i, c] of EP.likeBatch({ block: BLOCK, n: 1, likePrice: prix }).entries()) { const rr = await envoyer(H, c); t('heart call ' + i + ': status 1', rr && rr.status === '0x1', rr && (rr.status || rr.why)); }
  const joue = mot(await call(V, SEL.playOf + u(e) + A.wAddr(H)));
  t('the holder played in week ' + e + ' (V.playOf > 0)', joue > 0n, joue);
  /* swaps that earn fees for the positions: wtCOIN -> TBLOCK on the pinned pool, the app's own plan */
  for (let s = 0; s < 3; s++) {
    const p = await planWtcoinVersTblock({ rpc, compte: H, montant: 3n * 10n ** 15n, maintenant: Number(await ts()) * 1000 });
    t('swap ' + s + ' plan ready', p.etat === 'PRET', p.pourquoi);
    for (const c of (p.appels || [])) { const rr = await envoyer(H, c); t('swap ' + s + ' call: status 1', rr && rr.status === '0x1', rr && (rr.status || rr.why)); }
  }
  const dus0 = await Promise.all(ids.map(dus));
  const attendu = { w: dus0.reduce((a, x) => a + x.w, 0n), t: dus0.reduce((a, x) => a + x.t, 0n) };
  t('fees owed to the two positions (StateView): wtCOIN > 0', attendu.w > 0n, J(attendu));
  /* 6 h + 1 s before the end: not yet; at 6 h: the harvest */
  await aller(finE - 21601n);
  r = await k.tour();
  t('6 h + 1 s before the end: nothing sent', r.fait === false, r.pourquoi);
  await aller(finE - 21600n);
  const potAvant = await call(L, SEL.pot + u(e));
  const balAvant = await lit(A.VIEW.balanceOf(A.WTCOIN, L));
  r = await k.tour();
  t('in the last 6 h: harvest sent', r.fait === true && /harvest week/.test(r.quoi), J(r));
  await rpc('evm_mine', []);
  const rh = r.hash ? await recu(r.hash) : null;
  const txh = r.hash ? await rpc('eth_getTransactionByHash', [r.hash]) : null;
  t('harvest tx: from the keeper, to the lock, value 0, status 1', rh && txh && txh.from.toLowerCase() === moi && txh.to.toLowerCase() === L && BigInt(txh.value) === 0n && rh.status === '0x1', rh && rh.status);
  const q = txh ? K.decoderDonnees(txh.input) : null;
  t('harvest tx: exactly both ids', q && q.quoi === 'harvest' && q.ids.map(String).sort().join() === ids.map(String).sort().join(), q && q.ids.join());
  const lh = rh ? rh.logs.find((l) => l.address.toLowerCase() === L && l.topics[0].toLowerCase() === TOPIC_HARVESTED) : null;
  const hv = lh ? { epoch: BigInt(lh.topics[2]), done: mot(lh.data, 0), skipped: mot(lh.data, 1), w: mot(lh.data, 2), t: mot(lh.data, 3) } : null;
  t('Harvested event from the lock: week e, 2 harvested, 0 skipped', hv && hv.epoch === e && hv.done === 2n && hv.skipped === 0n, J(hv));
  const potApres = await call(L, SEL.pot + u(e));
  const dPot = { w: mot(potApres, 0) - mot(potAvant, 0), t: mot(potApres, 1) - mot(potAvant, 1) };
  t('pot(e) grew by EXACTLY the Harvested amounts', hv && dPot.w === hv.w && dPot.t === hv.t, J({ dPot, hv }));
  t('... which equal the fees owed per the StateView', hv && hv.w === attendu.w && hv.t === attendu.t, J({ hv, attendu }));
  t('... and the lock\'s wtCOIN balance change', (await lit(A.VIEW.balanceOf(A.WTCOIN, L))) - balAvant === dPot.w);
  console.log('     measured: harvest of 2 positions used ' + BigInt(rh.gasUsed) + ' gas; harvested ' + dPot.w + ' wtCOIN raw, ' + dPot.t + ' TBLOCK raw');
  r = await k.tour();
  t('the round that reads the receipt: nothing more sent', r.fait === false && k.etat().compteurs.inclus === 1, J(r));
  r = await k.tour();
  t('a later round in the same window: nothing sent (lastHarvestOf)', r.fait === false, r.pourquoi);
  /* the count: not at end + 3599 s, at end + 3600 s */
  await aller(finE + 3599n);
  r = await k.tour();
  t('week ended, margin not passed: nothing sent', r.fait === false, r.pourquoi);
  await aller(finE + 3600n);
  r = await k.tour();
  t('end + 1 h: markWeekBatch sent', r.fait === true && /count week/.test(r.quoi), J(r));
  await rpc('evm_mine', []);
  const rm = r.hash ? await recu(r.hash) : null;
  const txm = r.hash ? await rpc('eth_getTransactionByHash', [r.hash]) : null;
  const qm = txm ? K.decoderDonnees(txm.input) : null;
  t('count tx: from the keeper, to the lock, status 1, markWeekBatch(e, [holder])', rm && rm.status === '0x1' && txm.from.toLowerCase() === moi && txm.to.toLowerCase() === L && qm.quoi === 'mark' && qm.e === e && qm.holders.join() === H, qm && J(qm));
  const poids = mot(await call(L, SEL.weightOf + u(e) + A.wAddr(H)));
  const attenduPoids = isqrt(pos[0].L + pos[1].L) * joue;
  t('weightOf(e, holder) = isqrt(L1 + L2) x playOf', poids === attenduPoids && poids > 0n, poids + ' vs ' + attenduPoids);
  t('totalWeight(e) = that weight', mot(await call(L, SEL.totalWeight + u(e))) === poids);
  console.log('     measured: markWeekBatch of 1 holder used ' + BigInt(rm.gasUsed) + ' gas');
  await k.tour();
  r = await k.tour();
  t('a later round: nothing sent', r.fait === false, r.pourquoi);
  const st = k.etat();
  t('no failure, no revert, no refused send', st.etat === 'ON' && st.compteurs.reverts === 0 && st.compteurs.envoisRefuses === 0 && st.compteurs.envois === 2, J(st.compteurs));
  await rpc('anvil_stopImpersonatingAccount', [H]);
  fin(ko ? 1 : 0);
} catch (e) { console.log('KO thrown', e && e.stack); ko++; fin(1); }
