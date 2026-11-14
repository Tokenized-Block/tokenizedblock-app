/* lock-weekly-app.js — the page side of the WEEKLY lock rewards (TBlockLockRewardsWeekly, "R2", live on Base since 2026-11-14).
 *   Pure: no DOM, no network. Builds UNSIGNED calls and read requests only; the person's own wallet signs everything.
 * ⛔ THE ADDRESS IS NEVER TYPED HERE: it comes from lock-weekly-deploiement.js, the record filled from the receipt read on two nodes.
 *   null while that record names no address: every call then throws, every view is refused, and the page shows no weekly box.
 * THE RULES ARE THE CONTRACT'S: a lock counts from the week AFTER enroll; a week pays only the enrolled holders MARKED as having played
 *   it (markPlayed, permissionless, needs V.playOf(week, holder) > 0 and a weight for that week, and the week not closed yet); claim()
 *   pays msg.sender only, for closed, unreleased, marked weeks. */
import { selecteur } from './keccak.js';
import { LOCK_WEEKLY_DEPLOIEMENT as REC } from './lock-weekly-deploiement.js';

const strip = (h) => String(h).replace(/^0x/, '');
const adr = (a) => (/^0x[0-9a-fA-F]{40}$/.test(String(a || '')) ? String(a).toLowerCase() : null);
const S_ = (sig) => strip(selecteur(sig));

export const WEEKLY = adr(REC && REC.adresse);
export const WEEKLY_BLOC = REC && REC.adresse ? REC.bloc : null;
export const SEMAINE_S = 604800;
export const GRACE_S = 86400;

export const SEL = Object.freeze({
  enroll: S_('enroll(address)'), markPlayed: S_('markPlayed(address,uint256)'), claim: S_('claim(uint256[])'),
  currentEpoch: S_('currentEpoch()'), epochEnd: S_('epochEnd(uint256)'), weightOf: S_('weightOf(address,uint256)'),
  enrollmentOf: S_('enrollmentOf(address)'), hasPlayed: S_('hasPlayed(address,uint256)'), marked: S_('marked(address,uint256)'),
  claimable: S_('claimable(address,uint256[])'), nextEpochToClose: S_('nextEpochToClose()'), nextEpochToRelease: S_('nextEpochToRelease()'),
  pot: S_('pot(uint256)'), playedWeight: S_('playedWeight(uint256)'), unassigned: S_('unassigned(address)'),
  rewardEpochsFor: S_('rewardEpochsFor(uint256)'), projectedTotalWeight: S_('projectedTotalWeight(uint256)'), WTCOIN: S_('WTCOIN()'),
  START_EPOCH: S_('START_EPOCH()'),
});

export function wAddr(a) { const s = adr(a); if (!s) throw new Error('not an address: ' + a); return strip(s).padStart(64, '0'); }
export function wUint(x) { const n = BigInt(x); if (n < 0n || n >= 1n << 256n) throw new Error('out of range'); return n.toString(16).padStart(64, '0'); }
const tableau = (xs) => wUint(xs.length) + xs.map(wUint).join('');
const call = (sel, args = '') => { if (!WEEKLY) throw new Error('the weekly lock rewards are not on this network'); return Object.freeze({ to: WEEKLY, data: '0x' + sel + args, value: '0x0' }); };
const vue = (sel, args = '') => { if (!WEEKLY) throw new Error('the weekly lock rewards are not on this network'); return { to: WEEKLY, data: '0x' + sel + args }; };

export const enrollWeeklyCall = (holder) => call(SEL.enroll, wAddr(holder));
export const markPlayedCall = (holder, semaine) => call(SEL.markPlayed, wAddr(holder) + wUint(semaine));
export function claimWeeklyCall(semaines) {
  const e = [...new Set((semaines || []).map((x) => BigInt(x)))].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  if (!e.length || e.length > 24) throw new Error('1 to 24 weeks per claim');
  return call(SEL.claim, wUint(32) + tableau(e));
}

export const VIEW = Object.freeze({
  currentEpoch: () => vue(SEL.currentEpoch), epochEnd: (e) => vue(SEL.epochEnd, wUint(e)),
  weightOf: (a, e) => vue(SEL.weightOf, wAddr(a) + wUint(e)), enrollmentOf: (a) => vue(SEL.enrollmentOf, wAddr(a)),
  hasPlayed: (a, e) => vue(SEL.hasPlayed, wAddr(a) + wUint(e)), marked: (a, e) => vue(SEL.marked, wAddr(a) + wUint(e)),
  claimable: (a, es) => vue(SEL.claimable, wAddr(a) + wUint(64) + tableau(es.map((x) => BigInt(x)))),
  nextEpochToClose: () => vue(SEL.nextEpochToClose), nextEpochToRelease: () => vue(SEL.nextEpochToRelease),
  pot: (e) => vue(SEL.pot, wUint(e)), playedWeight: (e) => vue(SEL.playedWeight, wUint(e)), unassigned: (t) => vue(SEL.unassigned, wAddr(t)),
  rewardEpochsFor: (u) => vue(SEL.rewardEpochsFor, wUint(u)), projectedTotalWeight: (e) => vue(SEL.projectedTotalWeight, wUint(e)),
  WTCOIN: () => vue(SEL.WTCOIN), START_EPOCH: () => vue(SEL.START_EPOCH),
});

/** enrolled in R2 for THIS lock: enroll() stores exactly the lock's unlock date and amount, so a top-up not yet enrolled differs */
export function inscritPourCeLock({ enrUnlock, enrAmount, unlockAt, locked }) {
  return BigInt(locked) > 0n && BigInt(enrUnlock) === BigInt(unlockAt) && BigInt(enrAmount) === BigInt(locked);
}

/** the weeks this wallet may still mark: the current week, and the previous one while it is not closed (its grace day or later) */
export function semainesMarquables({ courant, prochainAFermer }) {
  const c = BigInt(courant), p = BigInt(prochainAFermer);
  const out = [];
  if (c > 0n && c - 1n >= p) out.push(c - 1n);
  if (c >= p) out.push(c);
  return out;
}

/** one week, one answer: what the box says and whether the "Mark" button is offered (all inputs read on chain) */
export function etatSemaine({ poids, joue, marque }) {
  if (BigInt(poids) === 0n) return { action: null, texte: 'your lock does not count for this week' };
  if (marque) return { action: null, texte: 'played and counted' };
  if (!joue) return { action: null, texte: 'not played yet: a heart, a TAM art mint or a skin mint' };
  return { action: 'mark', texte: 'played, not counted yet: one signature counts it' };
}
