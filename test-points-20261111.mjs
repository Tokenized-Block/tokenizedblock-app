/* test-points-20261111.mjs — the community points, RULE v2 (game359). AFFIRME on the REAL points.js:
 *   - 1 point a day per 100,000 TBLOCK at ×1; the commitment bands ×1 / ×1.25 / ×1.5 / ×1.75 / ×2 at 0 / 30 / 90 / 180 / 365 days, edges exact;
 *   - the worked examples of the rule ($15 = 2.8M locked 30 d = 35/day; 17.2M 1 year = 344/day; Grok's real lock 1,000 TBLOCK 7 d = 0.01/day);
 *   - the commitment is fixed at the last Locked/Extended (a top-up re-measures it), exit requests stop the accrual, a re-lock resumes it,
 *     withdrawn = no more; nothing after the date; splitting a lock over wallets earns nothing more (linear);
 *   - a heart (BlockLikes likePrice, read from the frozen deploy data) = exactly 10 points;
 *   - the board: sorted, shares sum to 1, the current multiplier and points/day reported.
 * NE PROUVE PAS: the server's event reading (test-points-app / the prod /api/points). */
import { pointsLockIntervalle, pointsLock, pointsJeu, tableauPoints, multiplicateurEngagement, multiplicateurActuel, JOUR, UNITE_LOCK } from './points.js';
import { LIKE_PRICE } from './economie.js';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const pres = (a, b, e = 1e-6) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
const TB = 10n ** 18n, T = 1_800_000_000;
t('unit: 100,000 TBLOCK', UNITE_LOCK === 100_000n * TB);
for (const [j, m] of [[0, 10000], [7, 10000], [29.99, 10000], [30, 12500], [89.99, 12500], [90, 15000], [179, 15000], [180, 17500], [364.9, 17500], [365, 20000], [1460, 20000]])
  t('band ' + j + ' d -> ' + m, multiplicateurEngagement(j * JOUR) === m, String(multiplicateurEngagement(j * JOUR)));
t('100,000 TBLOCK, 7 days, 1 day = 1 point', pres(pointsLockIntervalle(100_000n * TB, T + 7 * JOUR, T, T + JOUR), 1));
t('$15 example: 2,800,000 locked 30 days = 35 a day', pres(pointsLockIntervalle(2_800_000n * TB, T + 30 * JOUR, T, T + JOUR), 35));
t('gold example: 17,200,000 locked 1 year = 344 a day', pres(pointsLockIntervalle(17_200_000n * TB, T + 365 * JOUR, T, T + JOUR), 344));
t('the real lock today (1,000 TBLOCK, 7 days) = 0.01 a day', pres(pointsLockIntervalle(1000n * TB, T + 7 * JOUR, T, T + JOUR), 0.01));
t('nothing after the date', pointsLockIntervalle(TB * 100_000n, T, T, T + 10 * JOUR) === 0 && pres(pointsLockIntervalle(100_000n * TB, T + 2 * JOUR, T, T + 10 * JOUR), 2));
t('linear: two wallets of 1M = one wallet of 2M', pres(2 * pointsLockIntervalle(1_000_000n * TB, T + 90 * JOUR, T, T + 5 * JOUR), pointsLockIntervalle(2_000_000n * TB, T + 90 * JOUR, T, T + 5 * JOUR)));
const M = 1_000_000n * TB;
const evs = [
  { type: 'Locked', t: T, total: (2n * M).toString(), unlockAt: T + 100 * JOUR },          /* 100 d commitment: x1.5 */
  { type: 'WithdrawRequested', t: T + 5 * JOUR },
  { type: 'WithdrawCancelled', t: T + 6 * JOUR },
  { type: 'Locked', t: T + 80 * JOUR, total: (3n * M).toString(), unlockAt: T + 100 * JOUR }, /* top-up: 20 d left -> x1 */
];
const p = pointsLock(evs, T + 90 * JOUR);
const want = 20 * 1.5 * 5 + 20 * 1.5 * 74 + 30 * 1 * 10;
t('exit request stops until cancelled; a top-up re-measures the commitment (x1.5 -> x1)', pres(p, want), p + ' vs ' + want);
t('withdrawn: no more points', pointsLock([...evs, { type: 'Withdrawn', t: T + 85 * JOUR }], T + 99 * JOUR) === pointsLock(evs, T + 85 * JOUR));
{
  const ev2 = [{ type: 'Locked', t: T, total: M.toString(), unlockAt: T + 60 * JOUR }, { type: 'WithdrawRequested', t: T + JOUR }, { type: 'Locked', t: T + 2 * JOUR, total: (2n * M).toString(), unlockAt: T + 60 * JOUR }];
  t('a new lock during an exit request resumes the accrual', pres(pointsLock(ev2, T + 4 * JOUR), 10 * 1.25 + 20 * 1.25 * 2));
  const ext = [{ type: 'Locked', t: T, total: M.toString(), unlockAt: T + 10 * JOUR }, { type: 'Extended', t: T + JOUR, unlockAt: T + 400 * JOUR }];
  t('Extended re-measures the commitment (x1 -> x2)', pres(pointsLock(ext, T + 2 * JOUR), 10 + 20));
  const a = multiplicateurActuel(ext, T + 2 * JOUR);
  t('current multiplier and points a day', a && a.bps === 20000 && pres(a.parJour, 20) && a.jusqua === T + 400 * JOUR);
  t('no current multiplier once an exit is requested', multiplicateurActuel([...ext, { type: 'WithdrawRequested', t: T + 3 * JOUR }], T + 4 * JOUR) === null);
}
t('a heart (the deployed likePrice) = exactly 10 points', pres(pointsJeu(LIKE_PRICE), 10), String(pointsJeu(LIKE_PRICE)));
const tb = tableauPoints({ evenementsLock: [{ holder: 'a', ...evs[0], i: 0 }], coeurs: [{ liker: 'b', burned: (LIKE_PRICE * 3n).toString() }, { liker: 'c', burned: '0' }], maintenant: T + JOUR });
t('board: sorted, shares sum to 1, zero-point wallets left out', tb.lignes.length === 2 && tb.lignes[0].total >= tb.lignes[1].total && pres(tb.lignes.reduce((s, x) => s + x.part, 0), 1));
t('board: the locker carries its x1.5 and 30 a day; the heart giver none', tb.lignes.find((x) => x.holder === 'a').mult === 1.5 && pres(tb.lignes.find((x) => x.holder === 'a').parJour, 30) && tb.lignes.find((x) => x.holder === 'b').mult === null);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
