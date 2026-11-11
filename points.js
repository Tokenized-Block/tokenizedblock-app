/* points.js — the community points (Phil 2026-11-11: "a community vault with every user's lock, the points it generates for an airdrop").
 *   Pure functions: no network, no signing.
 *
 * RULE v2 (game359, Phil 2026-11-11: "les points ne fonctionnent pas … 1000 TBLOCK trop peu … dig sur un vrai système de points").
 *   Measured before: the v1 unit (1 point a day per 1,000,000 TBLOCK) gave the only lock (1,000 TBLOCK, 7 days) 0.0004 points, shown as "0".
 *   - LOCK POINTS accrue every second a lock is ACTIVE (date ahead, no exit requested — what TBlockLock.activeLockedOf says):
 *       per day = lockedTBLOCK / 100,000 × commitment multiplier.
 *     The multiplier is fixed by the COMMITMENT taken at the last Locked/Extended event: C = unlockAt − that event's time.
 *       C < 30 d ×1 · 30–89 d ×1.25 · 90–179 d ×1.5 · 180–364 d ×1.75 · 1 year or more ×2.
 *     It stays the same until the next Locked/Extended (simple to read: "×1.5 until 9 Feb"). Linear in the amount: splitting a lock over
 *     several wallets earns nothing more. An exit request stops the accrual at once; nothing accrues after the date.
 *   - PLAY POINTS: a heart = 10 points (BlockLikes burns 86,000 TBLOCK a heart: 1 point per 8,600 TBLOCK burned).
 *   Examples: 2,800,000 TBLOCK (~$15) locked 30 days = 35 points a day; 17,200,000 locked 1 year = 344 a day; one heart = 10.
 * WHAT IT IS NOT: a promise. Points decide a SHARE of a separate community drop, not live yet; no rate, no APY.
 * Built from the contracts' own events only (emitter checked by the readers), each with its block's timestamp. */

export const UNITE_LOCK = 100_000n * 10n ** 18n;     /* 1 point a day per 100,000 TBLOCK locked, at ×1 */
export const JOUR = 86400;
/* [minimum commitment in days, multiplier in basis points], highest first */
export const ENGAGEMENT = Object.freeze([[365, 20000], [180, 17500], [90, 15000], [30, 12500], [0, 10000]]);
export const TBLOCK_PAR_POINT_JEU = 8_600n * 10n ** 18n;   /* a heart burns 86,000 TBLOCK = 10 points */
export const REGLE_VERSION = 'v2';

/** the multiplier (basis points) for a commitment of `secs` seconds */
export function multiplicateurEngagement(secs) {
  const j = Number(secs) / JOUR;
  for (const [min, bps] of ENGAGEMENT) if (j >= min) return bps;
  return 10000;
}
const enUnites = (amount) => Number(BigInt(amount) * 1_000_000n / UNITE_LOCK) / 1e6;   /* hundred-thousands of TBLOCK, 6 decimals */

/** lock points of ONE lock of `amount` raw TBLOCK ending at `unlockAt`, between t0 and t1; the commitment counts from `engageA`
 *  (the time of the Locked/Extended event that set this date; by default t0, which is what a NEW lock asked now would get) */
export function pointsLockIntervalle(amount, unlockAt, t0, t1, engageA = t0) {
  const fin = Math.min(Number(t1), Number(unlockAt)), debut = Number(t0);
  if (!(fin > debut) || BigInt(amount) <= 0n) return 0;
  const mc = multiplicateurEngagement(Number(unlockAt) - Number(engageA)) / 10000;
  return enUnites(amount) * mc * (fin - debut) / JOUR;
}

/* one replay of a holder's lock events (sorted by time): the state after them, and the points up to `maintenant` */
function rejouer(evs, maintenant) {
  let amount = 0n, unlockAt = 0, requested = false, depuis = null, engage = 0, pts = 0;
  const avancer = (t) => { if (depuis !== null && !requested && amount > 0n) pts += pointsLockIntervalle(amount, unlockAt, depuis, t, engage); depuis = t; };
  for (const e of evs) {
    avancer(e.t);
    if (e.type === 'Locked') { amount = BigInt(e.total); unlockAt = Number(e.unlockAt); requested = false; engage = e.t; }
    else if (e.type === 'Extended') { unlockAt = Number(e.unlockAt); requested = false; engage = e.t; }
    else if (e.type === 'WithdrawRequested') requested = true;
    else if (e.type === 'WithdrawCancelled') requested = false;
    else if (e.type === 'Withdrawn') { amount = 0n; requested = false; }
  }
  avancer(maintenant);
  return { pts, amount, unlockAt, requested, engage };
}
/** lock points of a holder up to `maintenant` */
export function pointsLock(evs, maintenant) { return rejouer(evs, maintenant).pts; }
/** what the holder's CURRENT lock earns: { bps, parJour, jusqua }, or null when no lock is active */
export function multiplicateurActuel(evs, maintenant) {
  const s = rejouer(evs, maintenant);
  if (s.amount <= 0n || s.requested || s.unlockAt <= Number(maintenant)) return null;
  const bps = multiplicateurEngagement(s.unlockAt - s.engage);
  return { bps, parJour: enUnites(s.amount) * bps / 10000, jusqua: s.unlockAt };
}
/** play points from hearts: burned raw TBLOCK */
export function pointsJeu(burnedTotal) {
  return Number(BigInt(burnedTotal) * 1_000_000n / TBLOCK_PAR_POINT_JEU) / 1e6;
}
/** everyone: { holder -> { lock, jeu, total, parJour, mult } } and the board sorted by total; shares sum to 1 (what an airdrop would split) */
export function tableauPoints({ evenementsLock, coeurs, maintenant }) {
  const parLock = new Map();
  for (const e of [...evenementsLock].sort((a, b) => a.t - b.t || a.i - b.i)) { const l = parLock.get(e.holder) || []; l.push(e); parLock.set(e.holder, l); }
  const parJeu = new Map();
  for (const c of coeurs) parJeu.set(c.liker, (parJeu.get(c.liker) || 0n) + BigInt(c.burned));
  const tous = new Set([...parLock.keys(), ...parJeu.keys()]);
  const lignes = [...tous].map((h) => {
    const ev = parLock.get(h) || [], lock = pointsLock(ev, maintenant), jeu = pointsJeu(parJeu.get(h) || 0n), m = multiplicateurActuel(ev, maintenant);
    return { holder: h, lock, jeu, total: lock + jeu, parJour: m ? m.parJour : 0, mult: m ? m.bps / 10000 : null };
  }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total || (a.holder < b.holder ? -1 : 1));
  const somme = lignes.reduce((s, x) => s + x.total, 0);
  return { lignes: lignes.map((x, k) => ({ ...x, rang: k + 1, part: somme > 0 ? x.total / somme : 0 })), somme };
}
