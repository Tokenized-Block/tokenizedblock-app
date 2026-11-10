/* lock.js — the page side of TBlockLock (Phil 2026-11-10: "the real holder stage = TBLOCK LOCKED, 1 week minimum; propose the lock right after
 *   Create"). Builds UNSIGNED calls only; the person's own wallet signs. Nothing here holds, signs or sends.
 * The address comes from lock-deploiement.js once the contract was READ on chain; until then LOCK is null and every lock button stays
 *   hidden (a button waiting for a contract is a draft, not a feature).
 * ⛔ A gate reads activeLockedOf (0 once the date passed — review SEC-001), never lockedOf. */
import { selecteur } from './keccak.js';
import { LOCK_DEPLOIEMENT as D } from './lock-deploiement.js';

export const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
export const LOCK = D.adresse ? String(D.adresse).toLowerCase() : null;
export const MIN_JOURS = 7;
export const DUREES_JOURS = Object.freeze([7, 30, 90]);
/* the date is computed when the plan is built; the tx is mined later. One hour of margin keeps "7 days" valid at execution. */
export const MARGE_SECONDES = 3600;

const strip = (h) => h.replace(/^0x/, '');
const S = (sig) => strip(selecteur(sig));
export const SEL = Object.freeze({
  approve: S('approve(address,uint256)'), lock: S('lock(uint256,uint256)'), withdraw: S('withdraw()'), extend: S('extend(uint256)'),
  requestWithdraw: S('requestWithdraw()'), cancelWithdraw: S('cancelWithdraw()'),
  activeLockedOf: S('activeLockedOf(address)'), unlockAtOf: S('unlockAtOf(address)'), lockedOf: S('lockedOf(address)'),
  requestedAtOf: S('requestedAtOf(address)'), withdrawableAtOf: S('withdrawableAtOf(address)'),
});
/* Phil 2026-11-10: "a 7-day withdrawal period too" — the exit is requested (perks stop at once), then paid 7 days later at the earliest */
export const RETRAIT_JOURS = Math.round(D.retraitSecondes / 86400);
const ADR = /^0x[0-9a-f]{40}$/;
const wAddr = (a) => { const s = String(a || '').toLowerCase(); if (!ADR.test(s)) throw new Error('not an address: ' + a); return strip(s).padStart(64, '0'); };
const wUint = (x) => { const n = BigInt(x); if (n < 0n || n >= 1n << 256n) throw new Error('out of range'); return n.toString(16).padStart(64, '0'); };
const call = (to, sel, args = '') => Object.freeze({ to, data: '0x' + sel + args, value: '0x0' });

/** the unlock date for `jours` days from `maintenantSec` (seconds), with the margin; refuses under 7 days */
export function dateDeverrou(jours, maintenantSec) {
  const j = Number(jours), t = Number(maintenantSec);
  if (!Number.isInteger(j) || j < MIN_JOURS || j > 4 * 365) throw new Error('a lock lasts 7 days to 4 years');
  if (!Number.isFinite(t) || t <= 0) throw new Error('no clock');
  return BigInt(Math.floor(t)) + BigInt(j) * 86400n + BigInt(MARGE_SECONDES);
}
/** ONE batch: approve EXACTLY `amount` to the lock, then lock(amount, date). Never an unlimited approval. */
export function lockBatch({ amount, jours, maintenantSec }) {
  if (!LOCK) throw new Error('the TBLOCK lock is not deployed yet');
  const a = BigInt(amount);
  if (a <= 0n) throw new Error('lock a positive amount');
  const at = dateDeverrou(jours, maintenantSec);
  return Object.freeze([call(TBLOCK, SEL.approve, wAddr(LOCK) + wUint(a)), call(LOCK, SEL.lock, wUint(a) + wUint(at))]);
}
const surLock = (sel) => { if (!LOCK) throw new Error('the TBLOCK lock is not deployed yet'); return call(LOCK, sel); };
export function withdrawCall() { return surLock(SEL.withdraw); }
export function requestWithdrawCall() { return surLock(SEL.requestWithdraw); }
export function cancelWithdrawCall() { return surLock(SEL.cancelWithdraw); }
export const VIEW = Object.freeze({
  activeLockedOf: (a) => ({ to: LOCK, data: '0x' + SEL.activeLockedOf + wAddr(a) }),
  lockedOf: (a) => ({ to: LOCK, data: '0x' + SEL.lockedOf + wAddr(a) }),
  unlockAtOf: (a) => ({ to: LOCK, data: '0x' + SEL.unlockAtOf + wAddr(a) }),
  requestedAtOf: (a) => ({ to: LOCK, data: '0x' + SEL.requestedAtOf + wAddr(a) }),
  withdrawableAtOf: (a) => ({ to: LOCK, data: '0x' + SEL.withdrawableAtOf + wAddr(a) }),
});
/** before the wallet opens: the amount must be positive and held */
export function lockCheck({ balance, amount }) {
  const b = BigInt(balance), a = BigInt(amount);
  if (a <= 0n) return { ok: false, why: 'type how many TBLOCK to lock' };
  if (a > b) return { ok: false, why: 'this wallet holds ' + fmt(b) + ' TBLOCK, less than ' + fmt(a) };
  return { ok: true };
}
const quand = (s) => new Date(Number(s) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const jours = (s, t) => { const j = Math.max(0, Math.ceil((Number(s) - Number(t)) / 86400)); return j + ' day' + (j === 1 ? '' : 's'); };
/** what the page says about a wallet's lock, and the ONE exit action it offers (raw TBLOCK units, seconds):
 *   action 'demander' (request the exit), 'annuler' (cancel the request), 'retirer' (take it back), or null */
export function etatLock({ locked, active, unlockAt, requestedAt = 0, withdrawableAt = 0, maintenantSec }) {
  const l = BigInt(locked), ac = BigInt(active), u = Number(unlockAt), r = Number(requestedAt), w = Number(withdrawableAt), t = Number(maintenantSec);
  if (l === 0n) return { cle: 'aucun', texte: 'No TBLOCK locked yet.', action: null };
  if (r > 0) {
    if (t >= w) return { cle: 'pret', texte: fmt(l) + ' TBLOCK: the ' + RETRAIT_JOURS + '-day withdrawal period is over — yours to take back.', action: 'retirer' };
    return { cle: 'sortie', texte: 'Withdrawal requested: ' + fmt(l) + ' TBLOCK can be taken back on ' + quand(w) + ' (' + jours(w, t) + '). The holder perks stopped at the request; cancel to keep them.', action: 'annuler' };
  }
  if (ac > 0n) return { cle: 'actif', texte: fmt(l) + ' TBLOCK locked until ' + quand(u) + ' (' + jours(u, t) + ' left). To leave: request the withdrawal, then wait ' + RETRAIT_JOURS + ' days (never before that date).', action: 'demander' };
  return { cle: 'expire', texte: fmt(l) + ' TBLOCK: the lock date passed on ' + quand(u) + ' and the holder perks are off. Lock again to keep them, or request the withdrawal (' + RETRAIT_JOURS + ' days).', action: 'demander' };
}
export function fmt(raw) {
  const n = BigInt(raw) / 10n ** 18n;
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
