/* lp-lock-app.js — the page side of the LP lock (TBlockLPLock, live on Base since 2026-11-15, block 57819604).
 *   Pure: no DOM, no network of its own. Reads go through an injected rpc(method, params); every call it builds is UNSIGNED, for the
 *   person's own wallet. Nothing here signs or sends.
 * ⛔ NO ADDRESS IS TYPED HERE: the lock address, the PositionManager and the pool key come from lp-lock-deploiement.js (the record filled
 *   from the receipt read on two nodes); Permit2 and the StateView come from etat-naissance.js. MIN_L is READ on chain (MIN_L()).
 * THE RULES ARE THE CONTRACT'S (contracts/src/TBlockLPLock.sol):
 *   - lock(tokenId, weeks): a PositionManager NFT of the wtCOIN/TBLOCK pool, full range (-887220, 887220), liquidity >= MIN_L, 4 to 12
 *     weeks, at most 10 positions per address; the lock pulls the NFT (approve it first); its weight starts NEXT week.
 *   - extend(tokenId, extra): only before the lock ends; weeks left from next week <= 12, whole span <= 26.
 *   - markWeek(e, holder): after week e ended, within 6 days; needs locked liquidity for all of e AND a play in the holders vault in e.
 *   - claim(e): after that grace, msg.sender only, once, until the week is swept.
 *   - unlock(tokenId): from the lock end; gives the NFT back AND pays every week of it that can be paid now. unlockOnly(tokenId): the NFT
 *     back, no token moved (the emergency exit if a reward token refuses transfers); its unpaid weeks stay claimable with claim(e).
 * ADD, THEN LOCK — TWO SIGNATURES (2026-11-15 review). A single batch "mint + approve(lock, n) + lock(n)" had to GUESS n from
 *   PositionManager.nextTokenId() before signing; on Base that number moves several times a minute (the review read 4 mints in ~60 s and 10
 *   in ~10 min before block 57835138), so most batches would revert with gas paid, and a position minted TO the user by someone else could be locked in
 *   place of the user's own. So:
 *   step 1 (planAjoutEtLock): only the missing approvals + the full-range mint to the user's own wallet, one atomic batch;
 *   step 2: the position number is READ FROM THAT BATCH'S RECEIPT (lirePositionMintee: a Transfer(0, user, id) log EMITTED BY THE
 *   PositionManager address itself, then ownerOf / pool / full range / liquidity checked on chain by lireNft + planLockExistant), and only
 *   then approve(lock, id) + lock(id, weeks). If step 2 is never signed, the position simply stays unlocked in the user's wallet. */
import { selecteur, topic } from './keccak.js';
import { LP_LOCK_DEPLOIEMENT as REC } from './lp-lock-deploiement.js';
import { PERMIT2, STATE_VIEW, UNIVERSAL_ROUTER } from './etat-naissance.js';
import { encodeMintPosition, liquiditePourDepot, montantsPourLiquidite, decoderPoolEtPosition, poolId as poolIdDe, TICK_BAS, TICK_HAUT,
  encodeV4Swap, encodeQuote, ACTIONS_V4, paramsAction, SANS_MINHOP } from './pool.js';
import { etapesPermit2Exactes } from './approbations-exactes.js';
import { QUOTEUR } from './echange.js'; /* the v4 quoter the app already quotes with (tblock-route.js QUOTER_V4 = the same; a test compares) */

const strip = (h) => String(h).replace(/^0x/, '');
const adr = (a) => (/^0x[0-9a-fA-F]{40}$/.test(String(a || '')) ? String(a).toLowerCase() : null);
const S_ = (sig) => strip(selecteur(sig));
const P_ = (REC && REC.parametres) || {};

export const LP_LOCK = REC && REC.pret === true ? adr(REC.adresse) : null;
export const LP_LOCK_BLOC = LP_LOCK ? Number(REC.bloc) : null;
export const PM = adr(P_.pm);
export const CLE = Object.freeze({ currency0: adr(P_.currency0), currency1: adr(P_.currency1), fee: Number(P_.fee), tickSpacing: Number(P_.tickSpacing), hooks: adr(P_.hooks) });
export const POOL_ID = String(P_.poolId || '').toLowerCase();
/* the pool is wtCOIN (currency0) / TBLOCK (currency1): lp-lock.js integrite() checks the record says so */
export const WTCOIN = CLE.currency0, TBLOCK = CLE.currency1;
export const PERMIT2_ = adr(PERMIT2), STATE_VIEW_ = adr(STATE_VIEW);
/* step 0's swap: the Universal Router and the v4 quoter the app already uses for its TBLOCK swaps (tblock-route.js; a test compares) */
export const ROUTEUR_ = adr(UNIVERSAL_ROUTER), QUOTEUR_ = adr(QUOTEUR && QUOTEUR[8453]);
/* the contract's constants (TBlockLPLock.sol; test-lp-lock-app checks them against the source and lp-lock.js REGLE) */
export const REGLE = Object.freeze({ minWeeks: 4, maxWeeks: 12, maxSpanWeeks: 26, maxPositions: 10, markGraceS: 518400, epochS: 604800 });
export const MAX_SEMAINES_RECLAMER = 26;

export const SEL = Object.freeze({
  lock: S_('lock(uint256,uint256)'), extend: S_('extend(uint256,uint256)'), markWeek: S_('markWeek(uint256,address)'), claim: S_('claim(uint256)'),
  unlock: S_('unlock(uint256)'), unlockOnly: S_('unlockOnly(uint256)'),
  currentEpoch: S_('currentEpoch()'), epochEnd: S_('epochEnd(uint256)'), epochStart: S_('epochStart(uint256)'), unlockAtOf: S_('unlockAtOf(uint256)'),
  positionOf: S_('positionOf(uint256)'), lockedCount: S_('lockedCount(address)'), lockedLiquidityIn: S_('lockedLiquidityIn(address,uint256)'),
  weightOf: S_('weightOf(uint256,address)'), totalWeight: S_('totalWeight(uint256)'), claimed: S_('claimed(uint256,address)'),
  claimable: S_('claimable(address,uint256)'), pot: S_('pot(uint256)'), paid: S_('paid(uint256)'), rolledOver: S_('rolledOver(uint256)'),
  swept: S_('swept(uint256)'), MIN_L: S_('MIN_L()'), VAULT: S_('VAULT()'), T0: S_('T0()'), EPOCH: S_('EPOCH()'),
});
/* PositionManager, ERC-20, Permit2, StateView, holders vault */
export const SEL_EXT = Object.freeze({
  nextTokenId: S_('nextTokenId()'), ownerOf: S_('ownerOf(uint256)'), getApproved: S_('getApproved(uint256)'), isApprovedForAll: S_('isApprovedForAll(address,address)'),
  getPositionLiquidity: S_('getPositionLiquidity(uint256)'), getPoolAndPositionInfo: S_('getPoolAndPositionInfo(uint256)'), approve: S_('approve(address,uint256)'),
  balanceOf: S_('balanceOf(address)'), allowance: S_('allowance(address,address)'),
  p2Allowance: S_('allowance(address,address,address)'), p2Approve: S_('approve(address,address,uint160,uint48)'),
  getSlot0: S_('getSlot0(bytes32)'), playOf: S_('playOf(uint256,address)'),
});
export const TOPIC_LOCKED = topic('Locked(address,uint256,uint256,uint256,uint256)');
export const TOPIC_TRANSFER = topic('Transfer(address,address,uint256)');

export function wAddr(a) { const s = adr(a); if (!s) throw new Error('not an address: ' + a); return strip(s).padStart(64, '0'); }
export function wUint(x) { const n = BigInt(x); if (n < 0n || n >= 1n << 256n) throw new Error('out of range'); return n.toString(16).padStart(64, '0'); }
export function word(hex, i = 0) { const m = strip(hex || '').slice(64 * i, 64 * (i + 1)); if (m.length !== 64) throw new Error('short answer'); return BigInt('0x' + m); }
const fige = (to, data) => Object.freeze({ to, data, value: '0x0' });
const call = (sel, args = '') => { if (!LP_LOCK) throw new Error('the LP lock is not on this network'); return fige(LP_LOCK, '0x' + sel + args); };
const vue = (to, sel, args = '') => ({ to, data: '0x' + sel + args });
const VL = (sel, args = '') => { if (!LP_LOCK) throw new Error('the LP lock is not on this network'); return vue(LP_LOCK, sel, args); };

/* ── calls (unsigned) ── */
const semainesOk = (w) => { const n = BigInt(w); if (n < BigInt(REGLE.minWeeks) || n > BigInt(REGLE.maxWeeks)) throw new Error(REGLE.minWeeks + ' to ' + REGLE.maxWeeks + ' weeks'); return n; };
export const lockCall = (tokenId, semaines) => call(SEL.lock, wUint(tokenId) + wUint(semainesOk(semaines)));
export function extendCall(tokenId, extra) { if (BigInt(extra) <= 0n) throw new Error('at least one week'); return call(SEL.extend, wUint(tokenId) + wUint(extra)); }
export const markWeekCall = (semaine, holder) => call(SEL.markWeek, wUint(semaine) + wAddr(holder));
export const claimCall = (semaine) => call(SEL.claim, wUint(semaine));
export function claimCalls(semaines) {
  const e = [...new Set((semaines || []).map((x) => BigInt(x)))].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  if (!e.length || e.length > MAX_SEMAINES_RECLAMER) throw new Error('1 to ' + MAX_SEMAINES_RECLAMER + ' weeks per claim');
  return e.map(claimCall);
}
export const unlockCall = (tokenId) => call(SEL.unlock, wUint(tokenId));
/** the emergency exit: the NFT back, no reward token moved (for a reward token that refuses transfers) */
export const unlockOnlyCall = (tokenId) => call(SEL.unlockOnly, wUint(tokenId));
/** PositionManager.approve(lock, tokenId): only the NFT's owner (or an operator) may call it — the batch's tokenId guard */
export function approveNftCall(tokenId) { if (!LP_LOCK || !PM) throw new Error('the LP lock is not on this network'); return fige(PM, '0x' + SEL_EXT.approve + wAddr(LP_LOCK) + wUint(tokenId)); }
export const erc20ApproveCall = (jeton, spender, montant) => fige(adr(jeton), '0x' + SEL_EXT.approve + wAddr(spender) + wUint(montant));
export function permit2ApproveCall(jeton, montant, expiration) {
  if (BigInt(montant) >= 1n << 160n || BigInt(expiration) >= 1n << 48n) throw new Error('permit out of range');
  return fige(PERMIT2_, '0x' + SEL_EXT.p2Approve + wAddr(jeton) + wAddr(PM) + wUint(montant) + wUint(expiration));
}

/* ── views ── */
export const VIEW = Object.freeze({
  currentEpoch: () => VL(SEL.currentEpoch), epochEnd: (e) => VL(SEL.epochEnd, wUint(e)), unlockAtOf: (id) => VL(SEL.unlockAtOf, wUint(id)),
  positionOf: (id) => VL(SEL.positionOf, wUint(id)), lockedCount: (a) => VL(SEL.lockedCount, wAddr(a)),
  lockedLiquidityIn: (a, e) => VL(SEL.lockedLiquidityIn, wAddr(a) + wUint(e)), weightOf: (e, a) => VL(SEL.weightOf, wUint(e) + wAddr(a)),
  totalWeight: (e) => VL(SEL.totalWeight, wUint(e)), claimed: (e, a) => VL(SEL.claimed, wUint(e) + wAddr(a)), claimable: (a, e) => VL(SEL.claimable, wAddr(a) + wUint(e)),
  pot: (e) => VL(SEL.pot, wUint(e)), paid: (e) => VL(SEL.paid, wUint(e)), rolledOver: (e) => VL(SEL.rolledOver, wUint(e)), swept: (e) => VL(SEL.swept, wUint(e)),
  MIN_L: () => VL(SEL.MIN_L), VAULT: () => VL(SEL.VAULT), T0: () => VL(SEL.T0), EPOCH: () => VL(SEL.EPOCH),
  nextTokenId: () => vue(PM, SEL_EXT.nextTokenId), ownerOf: (id) => vue(PM, SEL_EXT.ownerOf, wUint(id)), getApproved: (id) => vue(PM, SEL_EXT.getApproved, wUint(id)),
  isApprovedForAll: (o, op) => vue(PM, SEL_EXT.isApprovedForAll, wAddr(o) + wAddr(op)), liquidite: (id) => vue(PM, SEL_EXT.getPositionLiquidity, wUint(id)),
  poolEtPosition: (id) => vue(PM, SEL_EXT.getPoolAndPositionInfo, wUint(id)),
  balanceOf: (t, a) => vue(adr(t), SEL_EXT.balanceOf, wAddr(a)), allowance: (t, o, s) => vue(adr(t), SEL_EXT.allowance, wAddr(o) + wAddr(s)),
  permit2: (o, t) => vue(PERMIT2_, SEL_EXT.p2Allowance, wAddr(o) + wAddr(t) + wAddr(PM)), slot0: () => vue(STATE_VIEW_, SEL_EXT.getSlot0, strip(POOL_ID)),
  permit2Routeur: (o, t) => vue(PERMIT2_, SEL_EXT.p2Allowance, wAddr(o) + wAddr(t) + wAddr(ROUTEUR_)),
  devis: (montantTblock) => ({ to: QUOTEUR_, data: encodeQuote({ cle: CLE, zeroForOne: false, montant: BigInt(montantTblock) }) }),
  playOf: (v, e, a) => vue(adr(v), SEL_EXT.playOf, wUint(e) + wAddr(a)),
});

/* ── amounts ── */
/** the token amounts of a full-range position of liquidity L at the pool price (floor, as the pool library rounds a withdrawal) */
export function montantsDe(L, sqrtPrix) { const m = montantsPourLiquidite(L, sqrtPrix); return { wtcoin: m.montant0, tblock: m.montant1 }; }
const plafond = (x, pct) => (BigInt(x) * (100n + BigInt(pct)) + 99n) / 100n + 1n;
/** the smallest deposit the lock accepts, in tokens: what MIN_L needs at this price, with the price margin the plan puts on top */
export function minimumEnJetons({ sqrtPrix, minL, glissementPct = 1 }) {
  if (sqrtPrix === null || sqrtPrix === undefined || BigInt(sqrtPrix) === 0n || minL === null || minL === undefined) return null;
  const m = montantsDe(minL, sqrtPrix);
  return { wtcoin: plafond(m.wtcoin, glissementPct), tblock: plafond(m.tblock, glissementPct) };
}

/** the largest full-range liquidity whose maxima (need x (100 + pct)%) fit under BOTH caps; null when either side is too small */
export function liquiditeDeuxCotes({ plafonds, sqrtPrix, glissementPct = 1 }) {
  const m = 100n + BigInt(glissementPct);
  const a = liquiditePourDepot({ depot: BigInt(plafonds.wtcoin), sqrtPrix, deviseEst0: true, margePct: m });
  const b = liquiditePourDepot({ depot: BigInt(plafonds.tblock), sqrtPrix, deviseEst0: false, margePct: m });
  if (a.etat !== 'OK' || b.etat !== 'OK') return null;
  const L = a.liquidite < b.liquidite ? a.liquidite : b.liquidite;
  const besoin = montantsDe(L, sqrtPrix);
  const max = { wtcoin: plafond(besoin.wtcoin, glissementPct), tblock: plafond(besoin.tblock, glissementPct) };
  for (const k of ['wtcoin', 'tblock']) if (max[k] > BigInt(plafonds[k])) max[k] = BigInt(plafonds[k]);
  return { liquidite: L, besoin, max };
}

export const DELAI_S = 1200;          /* the mint's deadline: 20 minutes after the block read */
export const MARGE_PERMIT_S = 600;  /* a Permit2 allowance expiring within 10 minutes is renewed */
export const DUREE_PERMIT_S = 3600;   /* a new Permit2 allowance lasts one hour */

/**
 * (a) step 1: ADD full-range liquidity to the person's own wallet, one atomic batch (approvals + mint). The lock is step 2
 *   (lirePositionMintee, then planLockExistant), on the number read from this batch's receipt. Pure: `lu` holds what lireAjout read.
 * cote: 'wtcoin' or 'tblock' — the side the person typed; montant: raw units of that side. glissementPct: the cap on each token amount.
 * Returns { etat: 'PRET', appels, liquidite, besoin, max, semaines, retourS?, ... } or { etat: 'REFUSE' | 'NON_LU', pourquoi, minimum? }.
 */
export function planAjoutEtLock({ moi, cote, montant, semaines, lu, glissementPct = 1 }) {
  const refus = (pourquoi, x = {}) => ({ etat: 'REFUSE', pourquoi, ...x });
  if (!LP_LOCK || !PM) return refus('The LP lock is not on this network.');
  if (!adr(moi)) return refus('Connect your wallet first.');
  let w; try { w = semainesOk(semaines); } catch (_) { return refus('Choose ' + REGLE.minWeeks + ' to ' + REGLE.maxWeeks + ' weeks.'); }
  /* cote 'deux' (after step 0's swap): montant = { wtcoin, tblock }, the most of EACH token step 1 may put in; the liquidity is the
   *   largest whose maxima fit under both (re-planned from the balances read after the swap confirmed) */
  if (cote !== 'wtcoin' && cote !== 'tblock' && cote !== 'deux') return refus('Choose the token you type the amount in.');
  const pct = BigInt(glissementPct);
  if (pct < 0n || pct > 5n) return refus('Price margin must be 0 to 5%.');
  if (!lu) return { etat: 'NON_LU', pourquoi: 'Nothing was read.' };
  const { sqrtPrix, maintenantS, minL, soldes, versPermit2, permit2, lockedCount, t0, epochS } = lu;
  if (sqrtPrix === null || sqrtPrix === undefined || BigInt(sqrtPrix) === 0n) return { etat: 'NON_LU', pourquoi: 'The pool price was not read.' };
  if (minL === null || minL === undefined) return { etat: 'NON_LU', pourquoi: 'The lock minimum was not read.' };
  if (maintenantS === null || maintenantS === undefined) return { etat: 'NON_LU', pourquoi: 'The chain time was not read.' };
  if (lockedCount !== null && lockedCount !== undefined && BigInt(lockedCount) >= BigInt(REGLE.maxPositions)) return refus('This wallet already has ' + REGLE.maxPositions + ' positions locked, the most the lock accepts.');
  const minimum = minimumEnJetons({ sqrtPrix, minL, glissementPct: pct });
  let L, besoin, max;
  if (cote === 'deux') {
    const c = montant || {};
    let cw = 0n, ct = 0n; try { cw = BigInt(c.wtcoin || 0); ct = BigInt(c.tblock || 0); } catch (_) { cw = 0n; ct = 0n; }
    /* after a confirmed swap, 0 wtCOIN read = a node behind the receipt, not a missing amount (2026-11-15 review) */
    if (cw <= 0n) return refus('The wtCOIN from your swap is not read in your wallet yet: preview again in a moment.', { minimum, attendreSolde: true });
    if (ct <= 0n) return refus('No TBLOCK is left of the amount you chose.', { minimum });
    const r2 = liquiditeDeuxCotes({ plafonds: { wtcoin: cw, tblock: ct }, sqrtPrix, glissementPct: pct });
    if (!r2 || r2.liquidite < BigInt(minL)) return refus('Below the lock minimum.', { minimum });
    ({ liquidite: L, besoin, max } = r2);
  } else {
    const d = BigInt(montant || 0);
    if (d <= 0n) return refus('Type an amount.', { minimum });
    const r = liquiditePourDepot({ depot: d, sqrtPrix, deviseEst0: cote === 'wtcoin', margePct: 100n + pct });
    if (r.etat !== 'OK' || r.liquidite < BigInt(minL)) return refus('Below the lock minimum.', { minimum });
    L = r.liquidite;
    besoin = montantsDe(L, sqrtPrix);
    max = { wtcoin: plafond(besoin.wtcoin, pct), tblock: plafond(besoin.tblock, pct) };
    /* the typed side is never asked for more than typed (liquiditePourDepot kept besoin x margin under it) */
    if (max[cote] > d) max[cote] = d;
  }
  if (!soldes || soldes.wtcoin === null || soldes.wtcoin === undefined || soldes.tblock === null || soldes.tblock === undefined) return { etat: 'NON_LU', pourquoi: 'Your balances were not read.' };
  const manque = {};
  for (const k of ['wtcoin', 'tblock']) if (BigInt(soldes[k]) < max[k]) manque[k] = max[k] - BigInt(soldes[k]);
  if (Object.keys(manque).length) return refus('Not enough in this wallet.', { manque, max, besoin, minimum });
  if (!versPermit2 || !permit2) return { etat: 'NON_LU', pourquoi: 'Your allowances were not read.' };
  const now = BigInt(maintenantS);
  const appels = [], etapes = [];
  const jetons = { wtcoin: WTCOIN, tblock: TBLOCK }, noms = { wtcoin: 'wtCOIN', tblock: 'TBLOCK' };
  for (const k of ['wtcoin', 'tblock']) {
    if (versPermit2[k] === null || versPermit2[k] === undefined) return { etat: 'NON_LU', pourquoi: 'Your allowances were not read.' };
    if (BigInt(versPermit2[k]) < max[k]) { appels.push(erc20ApproveCall(jetons[k], PERMIT2_, max[k])); etapes.push('Allow Permit2 to move ' + noms[k] + ' (this exact amount)'); }
  }
  for (const k of ['wtcoin', 'tblock']) {
    const p = permit2[k];
    if (!p || p.montant === null || p.montant === undefined || p.expiration === null || p.expiration === undefined) return { etat: 'NON_LU', pourquoi: 'Your allowances were not read.' };
    if (BigInt(p.montant) < max[k] || BigInt(p.expiration) < now + BigInt(MARGE_PERMIT_S)) {
      appels.push(permit2ApproveCall(jetons[k], max[k], now + BigInt(DUREE_PERMIT_S))); etapes.push('Permit the position manager to take ' + noms[k] + ' for one hour');
    }
  }
  const mint = encodeMintPosition({ cle: CLE, tickBas: TICK_BAS, tickHaut: TICK_HAUT, liquidite: L, max0: max.wtcoin, max1: max.tblock, proprietaire: adr(moi), deadline: now + BigInt(DELAI_S) });
  appels.push(fige(PM, mint)); etapes.push('Add the liquidity: a new full-range position, to your own wallet');
  /* when it would come back if locked NOW (the lock counts from next week): epochEnd(current) + weeks x EPOCH, from the chain time read */
  let premiereSemaine = null, retourS = null;
  if (t0 !== null && t0 !== undefined && epochS && BigInt(epochS) > 0n && now >= BigInt(t0)) {
    const c = (now - BigInt(t0)) / BigInt(epochS);
    premiereSemaine = c + 1n; retourS = BigInt(t0) + (c + 1n + w) * BigInt(epochS);
  }
  return { etat: 'PRET', appels, etapes, liquidite: L, besoin, max, minimum, semaines: w, atomique: true, premiereSemaine, retourS };
}

/** the reads (a) needs */
export async function lireAjout({ rpc, moi }) {
  const brut = async (v) => { try { return await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']); } catch (_) { return null; } };
  const un = async (v, i = 0) => { const h = await brut(v); try { return h === null ? null : word(h, i); } catch (_) { return null; } };
  const m = adr(moi);
  let maintenantS = null;
  try { const b = await rpc('eth_getBlockByNumber', ['latest', false]); maintenantS = b && b.timestamp ? BigInt(b.timestamp) : null; } catch (_) { maintenantS = null; }
  const s0 = await brut(VIEW.slot0());
  let sqrtPrix = null; try { sqrtPrix = s0 === null ? null : word(s0, 0); } catch (_) { sqrtPrix = null; }
  const [minL, lockedCount, bw, bt, aw, at, pw, pt] = await Promise.all([un(VIEW.MIN_L()), un(VIEW.lockedCount(m)), un(VIEW.balanceOf(WTCOIN, m)), un(VIEW.balanceOf(TBLOCK, m)),
    un(VIEW.allowance(WTCOIN, m, PERMIT2_)), un(VIEW.allowance(TBLOCK, m, PERMIT2_)), brut(VIEW.permit2(m, WTCOIN)), brut(VIEW.permit2(m, TBLOCK))]);
  const p2 = (h) => { try { return h === null ? null : { montant: word(h, 0), expiration: word(h, 1) }; } catch (_) { return null; } };
  const [t0, epochS] = await Promise.all([un(VIEW.T0()), un(VIEW.EPOCH())]);
  return { sqrtPrix, minL, lockedCount, maintenantS, soldes: { wtcoin: bw, tblock: bt }, versPermit2: { wtcoin: aw, tblock: at }, permit2: { wtcoin: p2(pw), tblock: p2(pt) }, t0, epochS };
}

/** step 2's number: the PositionManager NFTs minted TO `moi` in these receipts. Only logs whose ADDRESS is the PositionManager count (a
 *   Transfer log emitted by any other contract is ignored: an event names anyone, only its emitter is checked), from = 0, to = moi.
 *   Pure. Returns the ids (bigint), sorted, deduplicated. */
export function positionsDuRecu(recus, moi) {
  const m = adr(moi); if (!m || !PM) return [];
  const zero = '0x' + '0'.repeat(64), a = '0x' + wAddr(m);
  const ids = new Set();
  for (const r of recus || []) {
    if (!r || r.status !== '0x1' || !Array.isArray(r.logs)) continue;
    for (const l of r.logs) {
      if (!l || String(l.address || '').toLowerCase() !== PM || !Array.isArray(l.topics) || l.topics.length !== 4) continue;
      if (String(l.topics[0]).toLowerCase() !== TOPIC_TRANSFER || String(l.topics[1]).toLowerCase() !== zero || String(l.topics[2]).toLowerCase() !== a) continue;
      ids.add(BigInt(l.topics[3]).toString());
    }
  }
  return [...ids].map((x) => BigInt(x)).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
}
/** reads the receipts of step 1's batch (its hashes) and returns { ids, lus } — lus = receipts actually read (0 = "not read") */
export async function lirePositionMintee({ rpc, hashes, moi }) {
  const hs = [...new Set((hashes || []).filter((h) => /^0x[0-9a-fA-F]{64}$/.test(String(h))))];
  const recus = await Promise.all(hs.map((h) => rpc('eth_getTransactionReceipt', [h]).catch(() => null)));
  const lus = recus.filter(Boolean);
  return { ids: positionsDuRecu(lus, moi), lus: lus.length };
}
export async function planifierAjoutEtLock({ rpc, moi, cote, montant, semaines, glissementPct = 1 }) {
  return planAjoutEtLock({ moi, cote, montant, semaines, glissementPct, lu: await lireAjout({ rpc, moi }) });
}

/* ── step 0 (Phil, 2026-11-15): a wallet with TBLOCK but not enough wtCOIN swaps PART of the TBLOCK it chose for wtCOIN, on THIS pool
 *   (the key above, the record's), through the app's own v4 path: the Universal Router + Permit2, exact approvals (approbations-exactes.js),
 *   the same calldata as tblock-route.js calldataSwapTblock (SETTLE_ALL + TAKE_ALL, the 8-field struct; a test compares the bytes).
 *   THE HOOK (read from its address bits, v4-core Hooks.sol): afterSwap + afterSwapReturnDelta, no beforeSwap, no add-liquidity flag.
 *   Its afterSwap CAN make a swap fail (gas lost, nothing moved) and its return delta decides the cut; neither can take the person below
 *   the minimum out, which the router enforces on chain. It keeps a cut of every swap OUTPUT (measured 2026-11-15 on Base: a 100,000 TBLOCK quote came out 1.30% under the pool price, the
 *   pool's 0.3% fee included) and takes nothing on an add. The cut is inside the quoter's answer, so the size, the minimum and the
 *   impact below are all read from the quote, never assumed.
 *   SIZE: what stays (total - s) and the wtCOIN after the swap (already held + quote) equal in value at the pool price:
 *   total - s = p x held + s x r, r = quote / (s at the pool price), read; refined twice on fresh quotes. Steps 1 (add) and 2 (lock) are
 *   planned AGAIN from the balances read after the swap confirmed (cote 'deux'). */
export const HOOK_FLAGS = CLE.hooks ? BigInt(CLE.hooks) & 0x3fffn : null;
export const HOOK = Object.freeze({
  bloqueEchange: HOOK_FLAGS === null ? null : (HOOK_FLAGS & (1n << 7n)) !== 0n,
  prendSurSortie: HOOK_FLAGS === null ? null : (HOOK_FLAGS & (1n << 6n)) !== 0n && (HOOK_FLAGS & (1n << 2n)) !== 0n,
  toucheAjout: HOOK_FLAGS === null ? null : (HOOK_FLAGS & ((1n << 11n) | (1n << 10n) | (1n << 1n))) !== 0n,
});
/* refused when the swap gets more than 3% under the pool price (fee and hook cut included). ⚠️ The pool price is this pool's own spot
 *   price, read in the same state as the quote: this bound caps the cost of the swap on that state, it does NOT detect a pool already
 *   moved by someone else (no independent price of wtCOIN/TBLOCK is read here; the add step has the same exposure). The minimum out
 *   only covers what moves between the preview and the swap. */
export const IMPACT_MAX_BPS = 300n;
export const TOLERANCE_ECHANGE_BPS = 100n;   /* the minimum out: the quote less 1% */
export const DELAI_ECHANGE_S = 600;          /* the swap's deadline: 10 minutes after the block read (tblock-route.js DEADLINE_S) */
const Q192 = 1n << 192n;
/** raw TBLOCK worth `w` raw wtCOIN at the pool price, and the reverse (floor) */
export const tblockPourWtcoin = (w, sq) => (BigInt(w) * BigInt(sq) * BigInt(sq)) / Q192;
export const wtcoinPourTblock = (t, sq) => (BigInt(t) * Q192) / (BigInt(sq) * BigInt(sq));
/** what one unit of value swapped returns, in millionths: quote / (montant at the pool price) */
export function rendementPpm({ montant, sortie, sqrtPrix }) { const mid = wtcoinPourTblock(montant, sqrtPrix); return mid > 0n ? (BigInt(sortie) * 1000000n) / mid : 0n; }
/** the TBLOCK to swap: total - s = p x deja + s x r  =>  s = (total - p x deja) / (1 + r); 0 when the wtCOIN held already covers it */
export function partAEchanger({ total, wtcoinDeja, sqrtPrix, rendementPpm: r }) {
  const T = BigInt(total), d = tblockPourWtcoin(wtcoinDeja || 0n, sqrtPrix), k = BigInt(r);
  if (k <= 0n || k > 1000000n) throw new Error('swap return out of range');
  if (T <= d) return 0n;
  return ((T - d) * 1000000n) / (1000000n + k);
}
/**
 * the smallest TBLOCK a wallet holding `wtcoinDeja` wtCOIN (often 0) must choose for step 0 + step 1 to reach the lock minimum, at the
 *   swap return READ from a quote (`rendementPpm`), the minimum-out margin and the add's price margin. Checked with the plan's own
 *   arithmetic (split, minimum out, two-sided liquidity), raised by 0.5% steps until it passes. "About": a different swap size gets a
 *   slightly different return. null when not computable. Pure.
 */
export function minimumTblockSeul({ sqrtPrix, minL, wtcoinDeja = 0n, rendementPpm: r, toleranceBps = TOLERANCE_ECHANGE_BPS, glissementPct = 1 }) {
  if (sqrtPrix === null || sqrtPrix === undefined || BigInt(sqrtPrix) === 0n || minL === null || minL === undefined || r === null || r === undefined) return null;
  const k = BigInt(r), f = 10000n - BigInt(toleranceBps), sq = BigInt(sqrtPrix), held = BigInt(wtcoinDeja || 0n);
  if (k <= 0n || k > 1000000n || f <= 0n) return null;
  const mini = minimumEnJetons({ sqrtPrix: sq, minL, glissementPct });
  if (!mini) return null;
  const d = tblockPourWtcoin(held, sq), Vm = tblockPourWtcoin(mini.wtcoin, sq);
  const passe = (T) => {
    const s = partAEchanger({ total: T, wtcoinDeja: held, sqrtPrix: sq, rendementPpm: k });
    const sortieMin = (((wtcoinPourTblock(s, sq) * k) / 1000000n) * f) / 10000n;
    const a = liquiditeDeuxCotes({ plafonds: { wtcoin: held + sortieMin, tblock: T - s }, sqrtPrix: sq, glissementPct });
    return Boolean(a && a.liquidite >= BigInt(minL));
  };
  let T;
  if (d >= Vm) T = mini.tblock;
  else {
    const s = ((Vm - d) * 1000000n * 10000n) / (k * f) + 1n;
    T = d + (s * (1000000n + k)) / 1000000n + 1n;
    if (T < mini.tblock + s) T = mini.tblock + s;
  }
  for (let i = 0; i < 40 && !passe(T); i++) T = (T * 1005n) / 1000n + 1n;
  /* + 0.1%: the plan re-reads the quote for its own size (rounding of a fresh quote), never a figure that fails by a few wei */
  return passe(T) ? (T * 1001n) / 1000n + 1n : null;
}
/** the Universal Router call: exactly `montant` TBLOCK in, at least `sortieMin` wtCOIN out, on this pool's key */
export function echangeCall({ montant, sortieMin, deadline }) {
  if (!ROUTEUR_) throw new Error('the router is not known');
  const m = BigInt(montant), mn = BigInt(sortieMin);
  if (m <= 0n || mn <= 0n) throw new Error('amount and minimum must be above zero');
  const actions = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(TBLOCK, m) }, { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(WTCOIN, mn) }];
  return fige(ROUTEUR_, encodeV4Swap({ cle: CLE, zeroForOne: false, montant: m, sortieMin: mn, deadline: BigInt(deadline), forme: SANS_MINHOP, actions }));
}

/**
 * step 0: the swap batch (exact approvals + the swap), pure. `total` = the TBLOCK the person chose to put in (raw); `devis` = { echange, sortie }
 *   (the TBLOCK to swap and the wtCOIN the quoter answered for it, read). `sortieMinImposee`: at the click, the minimum the preview showed
 *   (a fresh quote under it is refused: the price moved). Returns { etat: 'PRET', appels, etapes, echange, devis, sortieMin, impactBps,
 *   resteTblock, ajoutPrevu, ... } or { etat: 'REFUSE' | 'NON_LU', pourquoi }.
 */
export function planEchangePourAjout({ moi, total, lu, devis, toleranceBps = TOLERANCE_ECHANGE_BPS, sortieMinImposee = null, glissementPct = 1 }) {
  const refus = (pourquoi, x = {}) => ({ etat: 'REFUSE', pourquoi, ...x });
  if (!LP_LOCK || !PM || !ROUTEUR_ || !QUOTEUR_) return refus('The LP lock is not on this network.');
  if (!adr(moi)) return refus('Connect your wallet first.');
  if (HOOK.bloqueEchange !== false) return refus('The pool’s hook could refuse a swap: no swap is offered here.');
  let T = 0n; try { T = BigInt(total || 0); } catch (_) { T = 0n; }
  if (T <= 0n) return refus('Type an amount.');
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol > 500n) return refus('Price margin must be 0 to 5%.');
  if (!lu) return { etat: 'NON_LU', pourquoi: 'Nothing was read.' };
  const { sqrtPrix, maintenantS, minL, soldes, versPermit2, permit2Routeur } = lu;
  if (sqrtPrix === null || sqrtPrix === undefined || BigInt(sqrtPrix) === 0n) return { etat: 'NON_LU', pourquoi: 'The pool price was not read.' };
  if (minL === null || minL === undefined) return { etat: 'NON_LU', pourquoi: 'The lock minimum was not read.' };
  if (maintenantS === null || maintenantS === undefined) return { etat: 'NON_LU', pourquoi: 'The chain time was not read.' };
  if (!soldes || soldes.wtcoin === null || soldes.wtcoin === undefined || soldes.tblock === null || soldes.tblock === undefined) return { etat: 'NON_LU', pourquoi: 'Your balances were not read.' };
  if (BigInt(soldes.tblock) < T) return refus('This wallet holds less TBLOCK than that.', { manque: { tblock: T - BigInt(soldes.tblock) } });
  if (!devis || devis.echange === null || devis.echange === undefined) return { etat: 'NON_LU', pourquoi: 'The swap was not quoted just now.' };
  const s = BigInt(devis.echange);
  if (s <= 0n) return refus('No swap needed: this wallet already holds enough wtCOIN for that amount.', { inutile: true });
  if (s >= T) return refus('The amount is too small to split.');
  if (devis.sortie === null || devis.sortie === undefined) return { etat: 'NON_LU', pourquoi: 'The swap was not quoted just now.' };
  const q = BigInt(devis.sortie);
  if (q <= 0n) return refus('The pool quotes nothing for this amount.');
  const mid = wtcoinPourTblock(s, sqrtPrix);
  if (mid <= 0n) return refus('The amount is too small to split.');
  /* above the pool's own price (10 bps of rounding): the quote does not come from this pool's state */
  if (q * 10000n > mid * 10010n) return refus('The quote is above the pool price: it does not come from this pool. Nothing is offered.');
  const impact = q >= mid ? 0n : ((mid - q) * 10000n) / mid;
  if (impact > IMPACT_MAX_BPS) return refus('This swap would get ' + (Number(impact) / 100).toFixed(2) + '% less than the pool price, more than the ' + (Number(IMPACT_MAX_BPS) / 100) + '% this card accepts: try a smaller amount.', { impactBps: impact });
  let min = (q * (10000n - tol)) / 10000n;
  if (sortieMinImposee !== null && sortieMinImposee !== undefined) {
    if (q < BigInt(sortieMinImposee)) return refus('The price moved since your preview: preview again.', { impactBps: impact });
    /* never looser than the preview, never looser than a fresh quote less the margin (a price that moved in the person's favour) */
    if (BigInt(sortieMinImposee) > min) min = BigInt(sortieMinImposee);
  }
  if (min <= 0n) return refus('The amount is too small for a meaningful minimum.');
  /* what step 1 can then add, at today's price, with the TBLOCK left and the wtCOIN after the swap (its guaranteed minimum) */
  const ajoutPrevu = liquiditeDeuxCotes({ plafonds: { wtcoin: BigInt(soldes.wtcoin) + min, tblock: T - s }, sqrtPrix, glissementPct });
  if (!ajoutPrevu || ajoutPrevu.liquidite < BigInt(minL)) {
    /* the TBLOCK-only answer (2026-11-15 review): the two-token minimum is not what a TBLOCK-only wallet must type */
    const seul = minimumTblockSeul({ sqrtPrix, minL, wtcoinDeja: soldes.wtcoin, rendementPpm: rendementPpm({ montant: s, sortie: q, sqrtPrix }), toleranceBps: tol, glissementPct });
    return refus('Below the lock minimum once split.', { minimum: minimumEnJetons({ sqrtPrix, minL, glissementPct }), minimumTblockSeul: seul });
  }
  if (!versPermit2 || versPermit2.tblock === null || versPermit2.tblock === undefined || !permit2Routeur || permit2Routeur.montant === null || permit2Routeur.montant === undefined
    || permit2Routeur.expiration === null || permit2Routeur.expiration === undefined) return { etat: 'NON_LU', pourquoi: 'Your allowances were not read.' };
  const now = BigInt(maintenantS);
  const ap = etapesPermit2Exactes({ jeton: TBLOCK, permit2: PERMIT2_, routeur: ROUTEUR_, montant: s, maintenantSec: now, libelleJeton: 'TBLOCK',
    okP2: BigInt(versPermit2.tblock) >= s, okR: BigInt(permit2Routeur.montant) >= s && BigInt(permit2Routeur.expiration) >= now + BigInt(MARGE_PERMIT_S) });
  if (ap.etat !== 'OK') return refus(ap.pourquoi);
  const appels = ap.etapes.map((x) => fige(adr(x.to), x.data)), etapes = ap.etapes.map((x) => x.nom);
  const deadline = now + BigInt(DELAI_ECHANGE_S);
  appels.push(echangeCall({ montant: s, sortieMin: min, deadline })); etapes.push('Swap part of your TBLOCK for wtCOIN on the wtCOIN/TBLOCK pool');
  return { etat: 'PRET', etape: 0, appels, etapes, atomique: true, total: T, echange: s, devis: q, sortieMin: min, impactBps: impact, impactMaxBps: IMPACT_MAX_BPS,
    resteTblock: T - s, wtcoinApres: BigInt(soldes.wtcoin) + min, ajoutPrevu, deadline };
}

/** step 0's reads: lireAjout's, plus the Permit2 allowance to the Universal Router */
export async function lireEchange({ rpc, moi }) {
  const lu = await lireAjout({ rpc, moi });
  let p = null;
  try { const h = await rpc('eth_call', [{ to: VIEW.permit2Routeur(moi, TBLOCK).to, data: VIEW.permit2Routeur(moi, TBLOCK).data }, 'latest']); p = { montant: word(h, 0), expiration: word(h, 1) }; } catch (_) { p = null; }
  return { ...lu, permit2Routeur: p };
}
/** the wtCOIN the v4 quoter answers for `montant` TBLOCK on this pool (hook cut included), or null when not read */
export async function devisEchange({ rpc, montant }) {
  try { const v = VIEW.devis(montant); return word(await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']), 0); } catch (_) { return null; }
}
/**
 * step 0, read and planned. `echange` (optional) = the TBLOCK to swap, fixed (the click re-plans the SAME amount the preview showed, on a
 *   fresh quote and fresh allowances); without it the size is computed from the quotes as described above.
 */
export async function planifierEchangePourAjout({ rpc, moi, total, toleranceBps = TOLERANCE_ECHANGE_BPS, echange = null, sortieMinImposee = null, glissementPct = 1 }) {
  const lu = await lireEchange({ rpc, moi });
  const base = { moi, total, lu, toleranceBps, sortieMinImposee, glissementPct };
  if (lu.sqrtPrix === null || lu.sqrtPrix === undefined || lu.soldes.wtcoin === null) return planEchangePourAjout({ ...base, devis: null });
  let T; try { T = BigInt(total || 0); } catch (_) { T = 0n; }
  let s = echange === null || echange === undefined ? null : BigInt(echange);
  if (s === null && T > 0n) {
    s = partAEchanger({ total: T, wtcoinDeja: lu.soldes.wtcoin, sqrtPrix: lu.sqrtPrix, rendementPpm: 1000000n });
    for (let i = 0; i < 2 && s > 0n; i++) {
      const q = await devisEchange({ rpc, montant: s });
      if (q === null) return planEchangePourAjout({ ...base, devis: { echange: s, sortie: null } });
      const r = rendementPpm({ montant: s, sortie: q, sqrtPrix: lu.sqrtPrix });
      if (r <= 0n || r > 1000000n) return planEchangePourAjout({ ...base, devis: { echange: s, sortie: q } });
      s = partAEchanger({ total: T, wtcoinDeja: lu.soldes.wtcoin, sqrtPrix: lu.sqrtPrix, rendementPpm: r });
    }
  }
  if (s === null || s <= 0n) return planEchangePourAjout({ ...base, devis: { echange: s === null ? 0n : s, sortie: 0n } });
  return planEchangePourAjout({ ...base, devis: { echange: s, sortie: await devisEchange({ rpc, montant: s }) } });
}

/* ── (b) lock a position the person already holds ── */
export async function lireNft({ rpc, tokenId, moi }) {
  const brut = async (v) => { try { return await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']); } catch (_) { return null; } };
  const un = async (v) => { const h = await brut(v); try { return h === null ? null : word(h, 0); } catch (_) { return null; } };
  const id = BigInt(tokenId);
  const [o, info, liquidite, ap, tous, minL, lockedCount] = await Promise.all([brut(VIEW.ownerOf(id)), brut(VIEW.poolEtPosition(id)), un(VIEW.liquidite(id)), brut(VIEW.getApproved(id)),
    un(VIEW.isApprovedForAll(moi, LP_LOCK)), un(VIEW.MIN_L()), un(VIEW.lockedCount(moi))]);
  const a = (h) => (h === null || strip(h).length < 64 ? null : '0x' + strip(h).slice(24, 64));
  return { tokenId: id, proprietaire: a(o), position: info === null ? null : decoderPoolEtPosition(info), liquidite, approuve: a(ap), toutApprouve: tous === null ? null : tous === 1n, minL, lockedCount };
}
/** liquiditeAttendue (step 2 of add-and-lock): the liquidity step 1 minted; any other liquidity is refused (not the position just added) */
export function planLockExistant({ moi, tokenId, semaines, nft, liquiditeAttendue = null }) {
  const refus = (pourquoi) => ({ etat: 'REFUSE', pourquoi });
  if (!LP_LOCK) return refus('The LP lock is not on this network.');
  let w; try { w = semainesOk(semaines); } catch (_) { return refus('Choose ' + REGLE.minWeeks + ' to ' + REGLE.maxWeeks + ' weeks.'); }
  if (!nft) return { etat: 'NON_LU', pourquoi: 'Position #' + tokenId + ' was not read.' };
  if (!nft.proprietaire) return { etat: 'NON_LU', pourquoi: 'Position #' + tokenId + ' does not exist or was not read.' };
  if (nft.proprietaire !== adr(moi)) return refus('Position #' + tokenId + ' is not in this wallet.');
  if (!nft.position) return { etat: 'NON_LU', pourquoi: 'The pool of position #' + tokenId + ' was not read.' };
  let id = null; try { id = poolIdDe(nft.position.cle).toLowerCase(); } catch (_) { id = null; }
  if (id !== POOL_ID) return refus('Position #' + tokenId + ' is not in the wtCOIN/TBLOCK pool.');
  if (nft.position.tickLower !== TICK_BAS || nft.position.tickUpper !== TICK_HAUT) return refus('Position #' + tokenId + ' is not full range: the lock takes full-range positions only.');
  if (nft.liquidite === null || nft.minL === null) return { etat: 'NON_LU', pourquoi: 'The liquidity of position #' + tokenId + ' was not read.' };
  if (nft.liquidite < nft.minL) return refus('Position #' + tokenId + ' is below the lock minimum.');
  if (liquiditeAttendue !== null && liquiditeAttendue !== undefined && BigInt(nft.liquidite) !== BigInt(liquiditeAttendue)) return refus('Position #' + tokenId + ' does not hold the liquidity you just added.');
  if (nft.lockedCount !== null && nft.lockedCount !== undefined && nft.lockedCount >= BigInt(REGLE.maxPositions)) return refus('This wallet already has ' + REGLE.maxPositions + ' positions locked.');
  const appels = [];
  if (!(nft.toutApprouve === true || nft.approuve === LP_LOCK)) appels.push(approveNftCall(nft.tokenId));
  appels.push(lockCall(nft.tokenId, w));
  return { etat: 'PRET', appels, tokenId: nft.tokenId, semaines: w };
}

/* ── weeks ── */
/** the most weeks extend() accepts now for a position [debut, fin) (0 = none): weeks left from next week <= 12, whole span <= 26 */
export function extensionMax({ courant, debut, fin, maintenantS, unlockAt }) {
  if (BigInt(maintenantS) >= BigInt(unlockAt)) return 0n;
  const a = BigInt(REGLE.maxWeeks) - (BigInt(fin) - (BigInt(courant) + 1n)), b = BigInt(REGLE.maxSpanWeeks) - (BigInt(fin) - BigInt(debut));
  const m = a < b ? a : b;
  return m > 0n ? m : 0n;
}
/** the one week markable now (the previous one, during the 6 days after it ended), or null */
export function semaineMarquable({ courant, finPrecedente, maintenantS }) {
  if (BigInt(courant) === 0n || finPrecedente === null || finPrecedente === undefined) return null;
  const t = BigInt(maintenantS), f = BigInt(finPrecedente);
  return t >= f && t < f + BigInt(REGLE.markGraceS) ? BigInt(courant) - 1n : null;
}
/** what the card says about that week and whether "Count my week" is offered (markWeek would not revert) */
export function etatMarquage({ liquidite, joue, poids }) {
  if (liquidite === null || joue === null || poids === null) return { action: null, texte: 'not read' };
  if (BigInt(poids) > 0n) return { action: null, texte: 'counted' };
  if (BigInt(liquidite) === 0n) return { action: null, texte: 'no position of yours covered all of it' };
  if (BigInt(joue) === 0n) return { action: null, texte: 'you did not play in it: it pays you nothing' };
  return { action: 'mark', texte: 'played, not counted yet: count it within 6 days after the week ends, or it pays you nothing' };
}

/** the person's locked position numbers: Locked(locker = moi) logs, newest first, in windows of `pas` blocks (public nodes refuse more
 *   than 50,000), at most `fenetres` windows back from `tete`, never before the lock's deploy block. Plus `candidats` (numbers the page
 *   already knows). Every number is then checked on chain (positionOf). */
export async function idsVerrouilles({ rpc, moi, tete, pas = 45000, fenetres = 4, candidats = [] }) {
  const ids = new Set(candidats.map((x) => BigInt(x).toString()));
  let jusqua = Number(tete), lus = 0, complet = false;
  for (let k = 0; k < fenetres && jusqua >= LP_LOCK_BLOC; k++) {
    const de = Math.max(LP_LOCK_BLOC, jusqua - pas + 1);
    const logs = await rpc('eth_getLogs', [{ address: LP_LOCK, topics: [TOPIC_LOCKED, '0x' + wAddr(moi)], fromBlock: '0x' + de.toString(16), toBlock: '0x' + jusqua.toString(16) }]);
    if (!Array.isArray(logs)) throw new Error('logs unreadable');
    for (const l of logs) if (l && Array.isArray(l.topics) && l.topics[2]) ids.add(BigInt(l.topics[2]).toString());
    lus++;
    if (de === LP_LOCK_BLOC) { complet = true; break; }
    jusqua = de - 1;
  }
  return { ids: [...ids].map((x) => BigInt(x)), fenetresLues: lus, depuisLeDebut: complet };
}

/**
 * Everything the card shows for one wallet. A value not read is null (the page says "not read"), never 0.
 * { courant, finCourante, maintenantS, minL, sqrtPrix, lockedCount, positions: [...], introuvables, marquage, aReclamer, pots }
 */
export async function lireEtat({ rpc, moi, candidats = [], fenetres = 4, pas = 45000 }) {
  const m = adr(moi);
  const brut = async (v) => { try { return await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']); } catch (_) { return null; } };
  const un = async (v, i = 0) => { const h = await brut(v); try { return h === null ? null : word(h, i); } catch (_) { return null; } };
  const deux = async (v) => { const h = await brut(v); try { return h === null ? null : { wtcoin: word(h, 0), tblock: word(h, 1) }; } catch (_) { return null; } };
  const b = await rpc('eth_getBlockByNumber', ['latest', false]);
  const maintenantS = BigInt(b.timestamp), tete = Number(BigInt(b.number));
  const courant = await un(VIEW.currentEpoch());
  if (courant === null) throw new Error('the current week was not read');
  const s0 = await brut(VIEW.slot0());
  let sqrtPrix = null; try { sqrtPrix = s0 === null ? null : word(s0, 0); } catch (_) { sqrtPrix = null; }
  const [finCourante, finPrecedente, minL, lockedCount, vault, t0, ep] = await Promise.all([un(VIEW.epochEnd(courant)), courant > 0n ? un(VIEW.epochEnd(courant - 1n)) : null,
    un(VIEW.MIN_L()), un(VIEW.lockedCount(m)), brut(VIEW.VAULT()), un(VIEW.T0()), un(VIEW.EPOCH())]);
  const V = vault && strip(vault).length >= 64 ? '0x' + strip(vault).slice(24, 64) : null;
  /* positions: only when lockedCount says there are some (no log read otherwise) */
  const positions = []; let introuvables = 0, recherche = null;
  if (lockedCount !== null && lockedCount > 0n) {
    try { recherche = await idsVerrouilles({ rpc, moi: m, tete, pas, fenetres, candidats }); } catch (err) { recherche = { ids: candidats.map((x) => BigInt(x)), fenetresLues: 0, depuisLeDebut: false, erreur: String((err && err.message) || err).slice(0, 200) }; }
    for (const id of recherche.ids) {
      const h = await brut(VIEW.positionOf(id));
      if (h === null) continue;
      let p; try { p = { locker: '0x' + strip(h).slice(24, 64), liquidite: word(h, 1), debut: word(h, 2), fin: word(h, 3) }; } catch (_) { continue; }
      if (p.locker !== m) continue;
      const unlockAt = await un(VIEW.unlockAtOf(id));
      const ouvert = unlockAt !== null && maintenantS >= unlockAt;
      /* once open: would unlock() (the take-back that pays) go through for this wallet? 'OK' | 'REVERT' | null (not read). The emergency
       *   exit is offered only on 'REVERT': unlockOnly frees the position's weeks, which can then be swept before they are claimed. */
      let reprise = null;
      if (ouvert) {
        try { await rpc('eth_call', [{ from: m, to: LP_LOCK, data: unlockCall(id).data }, 'latest']); reprise = 'OK'; }
        catch (err) { reprise = estRevert(err) ? 'REVERT' : null; }
      }
      positions.push({ tokenId: id, ...p, unlockAt, ouvert, reprise,
        extensionMax: unlockAt === null ? 0n : extensionMax({ courant, debut: p.debut, fin: p.fin, maintenantS, unlockAt }),
        montants: sqrtPrix ? montantsDe(p.liquidite, sqrtPrix) : null });
    }
    positions.sort((x, y) => (x.tokenId < y.tokenId ? -1 : 1));
    introuvables = Number(lockedCount) - positions.length;
  }
  /* the week to count now */
  let marquage = null;
  const e = finPrecedente === null ? null : semaineMarquable({ courant, finPrecedente, maintenantS });
  if (e !== null) {
    const [liquidite, poids, joue] = await Promise.all([un(VIEW.lockedLiquidityIn(m, e)), un(VIEW.weightOf(e, m)), V ? un(VIEW.playOf(V, e, m)) : null]);
    marquage = { semaine: e, fin: finPrecedente, liquidite, poids, joue, ...etatMarquage({ liquidite, joue, poids }) };
  }
  /* this week: covered? played? */
  const [liqC, joueC] = await Promise.all([un(VIEW.lockedLiquidityIn(m, courant)), V ? un(VIEW.playOf(V, courant, m)) : null]);
  /* claimable weeks: every week from the deploy week to last week (a week stays claimable while a position covering it is locked, and
   *   after that until it is swept — no fixed look-back); if the deploy week is not read, 26 weeks back and the weeks of the positions
   *   found. Read 10 at a time (public nodes rate-limit bursts); a week whose read failed is COUNTED (nonLues), never shown as nothing. */
  let premiere = null;
  try {
    const bd = await rpc('eth_getBlockByNumber', ['0x' + LP_LOCK_BLOC.toString(16), false]);
    if (bd && bd.timestamp && t0 !== null && ep) premiere = BigInt(bd.timestamp) >= t0 ? (BigInt(bd.timestamp) - t0) / ep : 0n;
  } catch (_) { premiere = null; }
  if (premiere === null) {
    premiere = courant > BigInt(MAX_SEMAINES_RECLAMER) ? courant - BigInt(MAX_SEMAINES_RECLAMER) : 0n;
    for (const p of positions) if (p.debut < premiere) premiere = p.debut;
  }
  const aReclamer = []; let nonLues = 0;
  const semaines = []; for (let k = premiere; k < courant; k++) semaines.push(k);
  for (let i = 0; i < semaines.length; i += 10) {
    const lot = semaines.slice(i, i + 10);
    const cl = await Promise.all(lot.map((k) => deux(VIEW.claimable(m, k))));
    lot.forEach((k, j) => { const c = cl[j]; if (c === null) nonLues++; else if (c.wtcoin > 0n || c.tblock > 0n) aReclamer.push({ semaine: k, ...c }); });
  }
  const [potC, potP, poidsP, roP, bw, bt] = await Promise.all([deux(VIEW.pot(courant)), courant > 0n ? deux(VIEW.pot(courant - 1n)) : null, courant > 0n ? un(VIEW.totalWeight(courant - 1n)) : null,
    courant > 0n ? un(VIEW.rolledOver(courant - 1n)) : null, un(VIEW.balanceOf(WTCOIN, m)), un(VIEW.balanceOf(TBLOCK, m))]);
  return { courant, finCourante, finPrecedente, maintenantS, minL, sqrtPrix, lockedCount, vault: V, positions, introuvables, recherche, marquage,
    cetteSemaine: { liquidite: liqC, joue: joueC }, aReclamer, reclamerNonLues: nonLues, soldes: { wtcoin: bw, tblock: bt },
    pots: { courant: potC, precedent: potP, poidsPrecedent: poidsP, reportePrecedent: roP === null ? null : roP === 1n } };
}
/** a node's answer that means "the call reverted" (not a transport failure): JSON-RPC 3 / "execution reverted" / "revert" */
export function estRevert(err) {
  const s = String((err && (err.message || err.data)) || err || '').toLowerCase();
  return (err && (err.code === 3 || err.code === -32015)) || /execution reverted|revert/.test(s);
}
