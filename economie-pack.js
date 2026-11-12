/* economie-pack.js — the page side of the economy pack now live on Base (2026-11-12): Hearts (L), the TBLOCK payment router (P), TAM art
 *   (T), Skins (S), the holders vault (V) and the lock rewards (R). Pure: no DOM, no network. Builds UNSIGNED calls only; the person's own
 *   wallet signs everything. Nothing here holds, signs or sends.
 * ⛔ ADDRESSES ARE NEVER TYPED HERE: the six come from economie-v2-pack-deploye.js (the record written from the six receipts, read on two
 *   nodes). TBLOCK, USDC and the lock come from the modules that already carry them (economie.js, frais-creation.js, lock.js); the test
 *   checks they equal the frozen pack's own `existants`.
 * ⛔ THE RULES ARE THE CONTRACTS': a heart costs L.likePrice() and needs L.minHold() LOCKED (TBlockLock.activeLockedOf), read at the call;
 *   a vault claim needs V.needFor(e) locked and a lock date at least 7 days ahead; a router payment refuses a minimum under P.minOutFloor.
 *   The page reads those values and checks them before the wallet opens, so a refusal is a sentence, not a revert. */
import { selecteur } from './keccak.js';
import { ADRESSES_PACK_ECONOMIE_V2 as A, PACK_ECONOMIE_V2_DEPLOYE as REC } from './economie-v2-pack-deploye.js';
import { TBLOCK } from './economie.js';
import { USDC_BASE } from './frais-creation.js';
import { LOCK, lockBatch } from './lock.js';

export { TBLOCK };
export const USDC = String(USDC_BASE).toLowerCase();
export { LOCK };
const ADR = /^0x[0-9a-f]{40}$/;
const adr = (x) => { const s = String(x || '').toLowerCase(); return ADR.test(s) ? s : null; };
export const HEARTS = adr(A.L);
export const ROUTER = adr(A.P);
export const TAM = adr(A.T);
export const SKINS = adr(A.S);
export const VAULT = adr(A.V);
export const REWARDS = adr(A.R);
/** the block of each creation receipt (the first block an index of that contract must read) */
export const BLOC_DEPLOIEMENT = Object.freeze(Object.fromEntries(REC.etapes.map((e) => [e.lettre, e.bloc])));
/** TAM art (T) and Skins (S) as a deployment sheet { adresse, bloc } — the shape tam-plan.js adresseTam() and the indexes read */
export const TAM_DEPLOIEMENT = Object.freeze({ adresse: TAM, bloc: BLOC_DEPLOIEMENT.T });
export const SKINS_DEPLOIEMENT = Object.freeze({ adresse: SKINS, bloc: BLOC_DEPLOIEMENT.S });

const strip = (h) => String(h).replace(/^0x/, '');
const S_ = (sig) => strip(selecteur(sig));
export const SEL = Object.freeze({
  approve: S_('approve(address,uint256)'), balanceOf: S_('balanceOf(address)'),
  /* L (Hearts) */
  like: S_('like(address,uint256)'), likePrice: S_('likePrice()'), LIKE_USD_E18: S_('LIKE_USD_E18()'), HOLD_USD_E18: S_('HOLD_USD_E18()'), minHold: S_('minHold()'), likesOf: S_('likesOf(address)'),
  currentEpoch: S_('currentEpoch()'), epochEnd: S_('epochEnd(uint256)'), totalSpentIn: S_('totalSpentIn(uint256)'), spentIn: S_('spentIn(uint256,address)'),
  /* V (holders vault) */
  claim: S_('claim(uint256)'), closeEpoch: S_('closeEpoch(uint256)'), owed: S_('owed(uint256,address)'), epochs: S_('epochs(uint256)'), claimed: S_('claimed(uint256,address)'),
  needFor: S_('needFor(uint256)'), lockFactor: S_('lockFactor(address)'), playOf: S_('playOf(uint256,address)'), totalPlayIn: S_('totalPlayIn(uint256)'),
  free: S_('free()'), reserved: S_('reserved()'), REWARD_BPS: S_('REWARD_BPS()'), REBATE_BPS: S_('REBATE_BPS()'), MAX_EPOCH_BUDGET: S_('MAX_EPOCH_BUDGET()'),
  CLAIM_WINDOW: S_('CLAIM_WINDOW()'), MIN_COMMIT: S_('MIN_COMMIT()'), rescueAmount: S_('rescueAmount()'), rescueAt: S_('rescueAt()'),
  /* P (router) and the games it pays */
  pay: S_('pay(address,uint256,uint256,uint256,bytes)'), minOutFloor: S_('minOutFloor(uint256)'),
  PRICE_USDC: S_('PRICE_USDC()'), USDC_SPLIT: S_('USDC_SPLIT()'), MINT_PRICE: S_('MINT_PRICE()'),
  /* R (lock rewards) */
  enroll: S_('enroll(address)'), claimRewards: S_('claim(uint256[])'), rewardEpochsFor: S_('rewardEpochsFor(uint256)'),
  hasPlayed: S_('hasPlayed(address,uint256)'), claimable: S_('claimable(address,uint256[])'), nextEpochToClose: S_('nextEpochToClose()'),
  nextEpochToRelease: S_('nextEpochToRelease()'), pot: S_('pot(uint256)'), playedWeight: S_('playedWeight(uint256)'), totalWeight: S_('totalWeight(uint256)'),
  weightOf: S_('weightOf(address,uint256)'), enrollmentOf: S_('enrollmentOf(address)'), rewardsClaimed: S_('claimed(address,uint256)'),
  T0: S_('T0()'), EPOCH: S_('EPOCH()'),
});

export function wAddr(a) { const s = adr(a); if (!s) throw new Error('not an address: ' + a); return strip(s).padStart(64, '0'); }
export function wUint(x) { const n = BigInt(x); if (n < 0n || n >= 1n << 256n) throw new Error('out of range'); return n.toString(16).padStart(64, '0'); }
const call = (to, sel, args = '') => { if (!to) throw new Error('this contract is not on this network'); return Object.freeze({ to, data: '0x' + sel + args, value: '0x0' }); };
const vue = (to, sel, args = '') => ({ to, data: '0x' + sel + args });
const pad = (h) => h + '0'.repeat((64 - (h.length % 64)) % 64);
const hexOctets = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
/** uint256[] as an ABI tail: length, then the items */
const tableau = (xs) => wUint(xs.length) + xs.map(wUint).join('');

/** one 32-byte word -> BigInt; throws on anything else (a cut or empty answer is never read as 0) */
export function word(hex, i = 0) {
  const s = strip(String(hex || ''));
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length < 64 * (i + 1) || s.length % 64) throw new Error('answer is not whole 32-byte words');
  return BigInt('0x' + s.slice(64 * i, 64 * (i + 1)));
}
export function fmt(raw, digits = 0) {
  const n = BigInt(raw), u = 10n ** 18n, w = n / u, f = (n % u).toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return w.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}
export const usdcTexte = (raw) => { const n = BigInt(raw), e = n / 1000000n, c = (n % 1000000n).toString().padStart(6, '0').replace(/0+$/, ''); return e.toString() + (c ? '.' + c.slice(0, 2).padEnd(2, '0') : ''); };
export const isB20 = (a) => /^0xb2000000000000000000[0-9a-f]{20}$/.test(String(a || '').toLowerCase());

/* ═══════════════ Hearts (L) ═══════════════ */
/** before the wallet opens: n hearts cost n × likePrice from the WALLET, and the wallet must have at least minHold LOCKED (activeLockedOf) —
 *  the contract's rule (BlockLikesV2.like), both read on chain just before. Paying never touches the lock. */
export function likeCheck({ balance, locked, likePrice, minHold, n = 1, usdLike = null, usdHold = null }) {
  const k = BigInt(n), p = BigInt(likePrice), need = BigInt(minHold), b = BigInt(balance), l = BigInt(locked);
  if (k < 1n || k > 1000n) return { ok: false, why: '1 to 1000 hearts per call' };
  if (p <= 0n) return { ok: false, why: 'the heart price could not be read' };
  if (l < need) return { ok: false, why: 'a heart needs ' + fmt(need) + ' TBLOCK locked' + (usdHold ? ' (' + usd(usdHold) + ' at the contract price)' : '') + '; this wallet has ' + fmt(l) + ' locked' };
  const cost = k * p;
  if (b < cost) return { ok: false, why: k + (k === 1n ? ' heart costs ' : ' hearts cost ') + fmt(cost) + ' TBLOCK from the wallet' + (usdLike ? ' (' + usd(usdLike) + ' each)' : '') + '; this wallet holds ' + fmt(b) };
  return { ok: true, cost };
}
/** a USD amount read as USD × 1e18 (LIKE_USD_E18, HOLD_USD_E18) -> "$0.50", "$15" */
export function usd(e18) {
  const c = BigInt(e18) / 10n ** 16n; const e = c / 100n, r = c % 100n;
  return '$' + e.toString() + (r ? '.' + r.toString().padStart(2, '0') : '');
}
/** ONE batch for n hearts: approve EXACTLY n × likePrice (read just before) to Hearts, then like(block, n). Never an unlimited approval. */
export function likeBatch({ block, n = 1, likePrice }) {
  const k = BigInt(n);
  if (k < 1n || k > 1000n) throw new Error('1 to 1000 hearts per call');
  if (!isB20(block)) throw new Error('not a block address');
  const p = BigInt(likePrice);
  if (p <= 0n) throw new Error('the heart price could not be read');
  return Object.freeze([call(TBLOCK, SEL.approve, wAddr(HEARTS) + wUint(k * p)), call(HEARTS, SEL.like, wAddr(block) + wUint(k))]);
}

/* ═══════════════ Holders vault (V) ═══════════════ */
/** the vault's fixed rules, READ on chain (constants and immutables of TBlockVaultV2), for the "how it works" text: never typed here */
export const REGLES_VAULT = Object.freeze(['ACCESS_USD', 'TIER1_USD', 'TIER2_USD', 'TIER3_USD', 'TIER1_BONUS', 'TIER2_BONUS', 'TIER3_BONUS', 'TIME_BONUS',
  'TIME_FULL', 'MIN_COMMIT', 'MAX_FACTOR', 'CLAIM_WINDOW', 'REWARD_BPS', 'REBATE_BPS', 'TOP_BPS']);
/** the vault's rules in words, from the values read (an object { NAME: BigInt }); null when any is missing (no sentence on a guess) */
export function texteRegleVault(r) {
  if (!r || REGLES_VAULT.some((k) => typeof r[k] !== 'bigint')) return null;
  const pc = (bps) => '+' + (Number(bps) / 100) + '%', j = (s) => Math.round(Number(s) / 86400);
  const d = (x) => '$' + Number(x).toLocaleString('en-US');
  return 'Each week the vault keeps a budget for the players: ' + (Number(r.REWARD_BPS) / 100) + '% of its free TBLOCK at most, and never more than '
    + (Number(r.REBATE_BPS) / 100) + '% of what each player put in (hearts, TAM art, skins). To claim a week: ' + d(r.ACCESS_USD) + ' of TBLOCK locked at the contract price, a lock that lasts at least '
    + j(r.MIN_COMMIT) + ' more days, within ' + j(r.CLAIM_WINDOW) + ' days of the close. Your share grows with your lock: ' + pc(r.TIER1_BONUS) + ' from ' + d(r.TIER1_USD) + ' locked, '
    + pc(r.TIER2_BONUS) + ' from ' + d(r.TIER2_USD) + ', ' + pc(r.TIER3_BONUS) + ' from ' + d(r.TIER3_USD) + ', and up to ' + pc(r.TIME_BONUS) + ' more for ' + j(r.TIME_FULL)
    + ' days left on the lock (at most ×' + (Number(r.MAX_FACTOR) / 10000) + '). The top player of the week gets up to ' + (Number(r.TOP_BPS) / 100) + '% of the budget on top. No rate is promised.';
}
/** before the wallet opens: claim(e) needs needFor(e) LOCKED, a lock date at least MIN_COMMIT ahead, and something owed (all read on chain) */
export function claimCheck({ locked, need, unlockAt, minCommit, maintenantSec, owed }) {
  const l = BigInt(locked), n = BigInt(need), u = BigInt(unlockAt), m = BigInt(minCommit), t = BigInt(Math.floor(Number(maintenantSec))), o = BigInt(owed);
  if (o <= 0n) return { ok: false, why: 'nothing to claim for that week' };
  if (l < n) return { ok: false, why: 'claiming needs ' + fmt(n) + ' TBLOCK locked; this wallet has ' + fmt(l) + ' locked' };
  if (u < t + m) return { ok: false, why: 'claiming needs your lock to last at least ' + Math.round(Number(m) / 86400) + ' more days after the claim' };
  return { ok: true };
}
export const claimCall = (e) => call(VAULT, SEL.claim, wUint(e));
export const closeEpochCall = (e) => call(VAULT, SEL.closeEpoch, wUint(e));
/** what V.closeEpoch(e) would reserve if it ran now — the contract's three caps in its order: free × REWARD_BPS, MAX_EPOCH_BUDGET, then
 *  totalPlayIn × REBATE_BPS × 2 (every share + the top bonus). A read, not a promise. */
export function budgetAttendu({ free, totalPlay, rewardBps, rebateBps, maxBudget }) {
  let b = BigInt(free) * BigInt(rewardBps) / 10000n;
  if (b > BigInt(maxBudget)) b = BigInt(maxBudget);
  const payable_ = BigInt(totalPlay) * BigInt(rebateBps) / 10000n * 2n;
  if (b > payable_) b = payable_;
  return b;
}
/** the lock factor in bps as a "×1.25" text; 0 = not eligible now */
export const texteFacteur = (bps) => { const b = Number(bps); return b > 0 ? '×' + (b / 10000).toFixed(2).replace(/0$/, '') : 'not eligible now'; };
/** decodes V.epochs(e): (budget, paid, closedAt, closed, released) */
export function decoderEpoque(hex) {
  return { budget: word(hex, 0), paid: word(hex, 1), closedAt: Number(word(hex, 2)), closed: word(hex, 3) === 1n, released: word(hex, 4) === 1n };
}

/* ═══════════════ Router (P) paying a game (T or S) ═══════════════ */
/** the USDC the router swaps for TBLOCK: the price minus the game's own dev cut (TblockPayRouter._pay: usdcIn × devBps / 10000) */
export function usdcEchange(prix, devBps) {
  const p = BigInt(prix), b = BigInt(devBps);
  if (p <= 0n || b < 0n || b > 1000n) throw new Error('bad game price or split');
  return p - p * b / 10000n;
}
export const TOLERANCE_BPS = 100n; /* minOut = the fresh quote × 0.99 */
/** the minimum TBLOCK the payment must buy: the fresh quote × 0.99; refused when that falls under the router's own floor (it would revert) */
export function minimumDepuisDevis({ devis, plancher, toleranceBps = TOLERANCE_BPS }) {
  let d, f; try { d = BigInt(devis); f = BigInt(plancher); } catch (_) { return { ok: false, why: 'the TBLOCK quote could not be read just now' }; }
  if (d <= 0n) return { ok: false, why: 'the TBLOCK pool quotes nothing just now' };
  if (f <= 0n) return { ok: false, why: 'the router floor could not be read just now' };
  const min = d * (10000n - BigInt(toleranceBps)) / 10000n;
  if (min < f) return { ok: false, why: 'the pools moved: the quote is under the router floor right now, try again in a moment' };
  return { ok: true, minOut: min };
}
/** abi.encode(bytes work, bytes32 graine, bytes params) — the data TamArtV2.onPaid decodes */
export function dataTam({ octets, graine, paramsJson }) {
  const d = hexOctets(octets), p = hexOctets(new TextEncoder().encode(String(paramsJson)));
  const g = strip(String(graine)).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(g)) throw new Error('the seed is not 32 bytes');
  const offD = 96, offP = offD + 32 + pad(d).length / 2;
  return wUint(offD) + g + wUint(offP) + wUint(d.length / 2) + pad(d) + wUint(p.length / 2) + pad(p);
}
/** abi.encode(address blockToken, uint64 recipe) — the data BlockSkins.onPaid decodes */
export function dataSkin({ block, recipe }) {
  const r = BigInt(recipe);
  if (r < 0n || r >= 1n << 64n) throw new Error('bad recipe');
  return wAddr(block) + wUint(r);
}
/** ONE batch: approve EXACTLY usdcIn USDC to the router, then P.pay(game, usdcIn, minOut, deadline, data). Never an unlimited approval. */
export function payBatch({ game, usdcIn, minOut, deadline, data }) {
  const g = adr(game);
  if (g !== TAM && g !== SKINS) throw new Error('the router pays only TAM art and Skins here');
  const u = BigInt(usdcIn), m = BigInt(minOut), dl = BigInt(deadline), d = strip(String(data || '')).toLowerCase();
  if (u <= 0n) throw new Error('nothing to pay');
  if (m <= 0n) throw new Error('a payment needs a minimum TBLOCK out');
  if (!/^[0-9a-f]*$/.test(d) || d.length % 64) throw new Error('bad data');
  const args = wAddr(g) + wUint(u) + wUint(m) + wUint(dl) + wUint(5 * 32) + wUint(d.length / 2) + d;
  return Object.freeze([call(USDC, SEL.approve, wAddr(ROUTER) + wUint(u)), call(ROUTER, SEL.pay, args)]);
}
export const DELAI_PAIEMENT_S = 600;

/* ═══════════════ Lock rewards (R) ═══════════════ */
export const MOIS_JOURS = 30; /* TBlockLockRewards.EPOCH = 30 days */
export const MOIS_MIN_JOURS = 60; /* a lock of 60 days always covers one whole month after the current one */
export const enrollCall = (holder) => call(REWARDS, SEL.enroll, wAddr(holder));
/** ONE batch: the lock (approve exact + lock) then enroll(holder) in the monthly lock rewards */
export function lockEtInscrire({ amount, jours, maintenantSec, holder }) {
  return Object.freeze([...lockBatch({ amount, jours, maintenantSec }), enrollCall(holder)]);
}
export function claimRewardsCall(epochs) {
  const e = (epochs || []).map((x) => BigInt(x));
  if (!e.length || e.length > 24) throw new Error('1 to 24 months per claim');
  return call(REWARDS, SEL.claimRewards, wUint(32) + tableau(e));
}
/** decodes R.rewardEpochsFor(unlockAt): (firstEpoch, lastEpoch, count) */
export function decoderMois(hex) { return { premier: Number(word(hex, 0)), dernier: Number(word(hex, 1)), n: Number(word(hex, 2)) }; }
export const texteMois = (n) => (Number(n) > 0 ? 'earns ' + n + ' full month' + (Number(n) === 1 ? '' : 's') : 'earns no full month (60 days minimum)');
/** the realized yearly rate of the TBLOCK part of a CLOSED month: pot / played weight, × 365 / 30. One weight unit = 1 TBLOCK locked at ×1.
 *  null when nobody played. Past only: it says what that month paid, never what the next will. */
export function aprPasse({ potTblock, played }) {
  const p = BigInt(potTblock), w = BigInt(played);
  if (w <= 0n) return null;
  const bp = p * 10000n * 365n / (w * 30n); /* in basis points */
  return Number(bp) / 100;
}

export const VIEW = Object.freeze({
  balanceOf: (token, a) => vue(adr(token), SEL.balanceOf, wAddr(a)),
  /* L */
  likePrice: () => vue(HEARTS, SEL.likePrice), minHold: () => vue(HEARTS, SEL.minHold), likeUsd: () => vue(HEARTS, SEL.LIKE_USD_E18), holdUsd: () => vue(HEARTS, SEL.HOLD_USD_E18), likesOf: (b) => vue(HEARTS, SEL.likesOf, wAddr(b)),
  currentEpoch: () => vue(HEARTS, SEL.currentEpoch), epochEnd: (e) => vue(HEARTS, SEL.epochEnd, wUint(e)), totalSpentIn: (e) => vue(HEARTS, SEL.totalSpentIn, wUint(e)),
  /* V */
  owed: (e, a) => vue(VAULT, SEL.owed, wUint(e) + wAddr(a)), epochs: (e) => vue(VAULT, SEL.epochs, wUint(e)), claimed: (e, a) => vue(VAULT, SEL.claimed, wUint(e) + wAddr(a)),
  needFor: (e) => vue(VAULT, SEL.needFor, wUint(e)), lockFactor: (a) => vue(VAULT, SEL.lockFactor, wAddr(a)), playOf: (e, a) => vue(VAULT, SEL.playOf, wUint(e) + wAddr(a)),
  totalPlayIn: (e) => vue(VAULT, SEL.totalPlayIn, wUint(e)), free: () => vue(VAULT, SEL.free), reserved: () => vue(VAULT, SEL.reserved),
  vaultBalance: () => vue(TBLOCK, SEL.balanceOf, wAddr(VAULT)), rewardBps: () => vue(VAULT, SEL.REWARD_BPS), rebateBps: () => vue(VAULT, SEL.REBATE_BPS),
  maxEpochBudget: () => vue(VAULT, SEL.MAX_EPOCH_BUDGET), claimWindow: () => vue(VAULT, SEL.CLAIM_WINDOW), minCommit: () => vue(VAULT, SEL.MIN_COMMIT),
  rescueAmount: () => vue(VAULT, SEL.rescueAmount), rescueAt: () => vue(VAULT, SEL.rescueAt),
  regleVault: (nom) => { if (!REGLES_VAULT.includes(nom)) throw new Error('not a vault rule: ' + nom); return vue(VAULT, S_(nom + '()')); },
  /* P and the games */
  minOutFloor: (spend) => vue(ROUTER, SEL.minOutFloor, wUint(spend)), prixJeu: (g) => vue(adr(g), SEL.PRICE_USDC), partJeu: (g) => vue(adr(g), SEL.USDC_SPLIT),
  mintPriceSkin: () => vue(SKINS, SEL.MINT_PRICE),
  /* R */
  rewardEpochsFor: (unlockAt) => vue(REWARDS, SEL.rewardEpochsFor, wUint(unlockAt)), rCurrentEpoch: () => vue(REWARDS, SEL.currentEpoch),
  rEpochEnd: (e) => vue(REWARDS, SEL.epochEnd, wUint(e)), hasPlayed: (a, e) => vue(REWARDS, SEL.hasPlayed, wAddr(a) + wUint(e)),
  claimable: (a, es) => vue(REWARDS, SEL.claimable, wAddr(a) + wUint(64) + tableau(es.map((x) => BigInt(x)))),
  nextEpochToClose: () => vue(REWARDS, SEL.nextEpochToClose), nextEpochToRelease: () => vue(REWARDS, SEL.nextEpochToRelease),
  pot: (e) => vue(REWARDS, SEL.pot, wUint(e)), playedWeight: (e) => vue(REWARDS, SEL.playedWeight, wUint(e)), totalWeight: (e) => vue(REWARDS, SEL.totalWeight, wUint(e)),
  weightOf: (a, e) => vue(REWARDS, SEL.weightOf, wAddr(a) + wUint(e)), enrollmentOf: (a) => vue(REWARDS, SEL.enrollmentOf, wAddr(a)),
  rewardsClaimed: (a, e) => vue(REWARDS, SEL.rewardsClaimed, wAddr(a) + wUint(e)),
});
