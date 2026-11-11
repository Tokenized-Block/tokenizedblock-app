/* points.js — the community points (Phil 2026-11-11: "a community vault with every user's lock, the points it generates for an airdrop;
 *   rewards for holders in wtCOIN and TBLOCK to redistribute"). Pure functions: no network, no signing.
 *
 * WHAT A POINT IS (fixed here, published, the same for everyone):
 *   - LOCK POINTS accrue every second a holder's lock is ACTIVE (date ahead, no exit requested — what TBlockLock.activeLockedOf says):
 *       per day: lockedTBLOCK / 1,000,000 × timeBonus, timeBonus = 1 + 0.5 × min(daysLeft, 90) / 90   (1.0 .. 1.5)
 *     An exit request stops the accrual at once; nothing accrues after the date.
 *   - PLAY POINTS: each heart (BlockLikes Liked) adds burnedTBLOCK / 1,000,000 × 2 — play counts double, so players stay ahead of
 *     pure lockers (Phil 10/11: the pot pays those who PLAY).
 * WHAT IT IS NOT: a promise. Points decide the SHARE of what the vault actually received; no rate, no APY is promised or shown.
 * Built from the contracts' own events only (emitter checked by the readers), each with its block's timestamp. */

export const MICRO = 10n ** 24n;                 /* 1,000,000 TBLOCK in raw units */
export const JOUR = 86400;
export const BONUS_PLEIN_JOURS = 90;
export const POINTS_JEU_FACTEUR = 2;

/* lock points of ONE holder between t0 and t1 (seconds) for a lock of `amount` raw TBLOCK ending at `unlockAt` — exact integral of the
 *   time bonus, which decreases linearly as the date comes closer (min(left, 90 days)) */
export function pointsLockIntervalle(amount, unlockAt, t0, t1) {
  const fin = Math.min(Number(t1), Number(unlockAt));
  const debut = Number(t0);
  if (!(fin > debut) || amount <= 0n) return 0;
  const tokens = Number(amount * 1000n / MICRO) / 1000;      /* millions of TBLOCK, 3 decimals */
  const P = BONUS_PLEIN_JOURS * JOUR;
  /* left(t) = unlockAt - t ; bonus(t) = 1 + 0.5 * min(left, P) / P ; integral over [debut, fin] */
  const u = Number(unlockAt);
  let integ = 0;
  const coupe = u - P;                                          /* before `coupe`, left > P: bonus = 1.5 */
  const a1 = debut, b1 = Math.min(fin, coupe);
  if (b1 > a1) integ += 1.5 * (b1 - a1);
  const a2 = Math.max(debut, coupe), b2 = fin;
  if (b2 > a2) {
    /* bonus = 1 + 0.5 (u - t)/P on [a2, b2] */
    integ += (b2 - a2) + 0.5 / P * (u * (b2 - a2) - (b2 * b2 - a2 * a2) / 2);
  }
  return tokens * integ / JOUR;
}

/** replay a holder's lock events (sorted by time) up to `maintenant`: returns lock points */
export function pointsLock(evs, maintenant) {
  let amount = 0n, unlockAt = 0, requested = false, depuis = null, pts = 0;
  const avancer = (t) => { if (depuis !== null && !requested && amount > 0n) pts += pointsLockIntervalle(amount, unlockAt, depuis, t); depuis = t; };
  for (const e of evs) {
    avancer(e.t);
    if (e.type === 'Locked') { amount = BigInt(e.total); unlockAt = Number(e.unlockAt); requested = false; }
    else if (e.type === 'Extended') { unlockAt = Number(e.unlockAt); requested = false; }
    else if (e.type === 'WithdrawRequested') requested = true;
    else if (e.type === 'WithdrawCancelled') requested = false;
    else if (e.type === 'Withdrawn') { amount = 0n; requested = false; }
  }
  avancer(maintenant);
  return pts;
}
/** play points from hearts: burned raw TBLOCK */
export function pointsJeu(burnedTotal) {
  return Number(BigInt(burnedTotal) * 1000n / MICRO) / 1000 * POINTS_JEU_FACTEUR;
}
/** everyone: { holder -> { lock, jeu, total } } and the board sorted by total; shares sum to 1 (what an airdrop would split) */
export function tableauPoints({ evenementsLock, coeurs, maintenant }) {
  const parLock = new Map();
  for (const e of [...evenementsLock].sort((a, b) => a.t - b.t || a.i - b.i)) { const l = parLock.get(e.holder) || []; l.push(e); parLock.set(e.holder, l); }
  const parJeu = new Map();
  for (const c of coeurs) parJeu.set(c.liker, (parJeu.get(c.liker) || 0n) + BigInt(c.burned));
  const tous = new Set([...parLock.keys(), ...parJeu.keys()]);
  const lignes = [...tous].map((h) => { const lock = pointsLock(parLock.get(h) || [], maintenant), jeu = pointsJeu(parJeu.get(h) || 0n); return { holder: h, lock, jeu, total: lock + jeu }; })
    .filter((x) => x.total > 0).sort((a, b) => b.total - a.total || (a.holder < b.holder ? -1 : 1));
  const somme = lignes.reduce((s, x) => s + x.total, 0);
  return { lignes: lignes.map((x, k) => ({ ...x, rang: k + 1, part: somme > 0 ? x.total / somme : 0 })), somme };
}
