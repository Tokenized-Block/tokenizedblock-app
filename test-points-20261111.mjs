/* test-points-20261111.mjs — the community points (points.js): exact integral vs a numeric one, the exit/date rules, play counts double. */
import { pointsLockIntervalle, pointsLock, pointsJeu, tableauPoints, JOUR } from './points.js';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const pres = (a, b, e = 1e-6) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));
const M = 10n ** 24n;   /* 1,000,000 TBLOCK */
/* numeric reference: 1-second-ish steps (Riemann with many steps) */
function ref(amount, u, t0, t1) {
  const fin = Math.min(t1, u); if (fin <= t0) return 0;
  const n = 200000, h = (fin - t0) / n; let s = 0;
  for (let k = 0; k < n; k++) { const tt = t0 + (k + 0.5) * h; const left = u - tt; s += (1 + 0.5 * Math.min(left, 90 * JOUR) / (90 * JOUR)) * h; }
  return Number(amount * 1000n / M) / 1000 * s / JOUR;
}
const T = 1_800_000_000;
for (const [days, span] of [[7, 7], [30, 10], [200, 150], [200, 200], [95, 20], [400, 3]]) {
  const u = T + days * JOUR, got = pointsLockIntervalle(3n * M, u, T, T + span * JOUR), want = ref(3n * M, u, T, T + span * JOUR);
  t('integral exact, lock ' + days + ' d over ' + span + ' d', pres(got, want, 1e-6), got + ' vs ' + want);
}
t('1M TBLOCK, >90 days ahead, 1 day = 1.5 points', pres(pointsLockIntervalle(M, T + 200 * JOUR, T, T + JOUR), 1.5));
t('nothing after the date', pointsLockIntervalle(M, T, T, T + 10 * JOUR) === 0);
const evs = [
  { type: 'Locked', t: T, total: (2n * M).toString(), unlockAt: T + 30 * JOUR },
  { type: 'WithdrawRequested', t: T + 5 * JOUR },
  { type: 'WithdrawCancelled', t: T + 6 * JOUR },
  { type: 'Locked', t: T + 8 * JOUR, total: (3n * M).toString(), unlockAt: T + 30 * JOUR },
];
const p = pointsLock(evs, T + 10 * JOUR);
const want = pointsLockIntervalle(2n * M, T + 30 * JOUR, T, T + 5 * JOUR) + pointsLockIntervalle(2n * M, T + 30 * JOUR, T + 6 * JOUR, T + 8 * JOUR) + pointsLockIntervalle(3n * M, T + 30 * JOUR, T + 8 * JOUR, T + 10 * JOUR);
t('an exit request stops the accrual until cancelled; a top-up counts from its time', pres(p, want), p + ' vs ' + want);
t('withdrawn: no more points', pointsLock([...evs, { type: 'Withdrawn', t: T + 9 * JOUR }], T + 20 * JOUR) === pointsLock([...evs], T + 9 * JOUR));
{
  /* the contract: lock() during a pending exit request CLEARS it (re-commit) -> the accrual resumes */
  const ev2 = [{ type: 'Locked', t: T, total: M.toString(), unlockAt: T + 60 * JOUR }, { type: 'WithdrawRequested', t: T + JOUR }, { type: 'Locked', t: T + 2 * JOUR, total: (2n * M).toString(), unlockAt: T + 60 * JOUR }];
  const got = pointsLock(ev2, T + 4 * JOUR), exp = pointsLockIntervalle(M, T + 60 * JOUR, T, T + JOUR) + pointsLockIntervalle(2n * M, T + 60 * JOUR, T + 2 * JOUR, T + 4 * JOUR);
  t('a new lock during an exit request resumes the accrual (as the contract clears the request)', pres(got, exp), got + ' vs ' + exp);
}
t('play counts double: 1M burned = 2 points', pres(pointsJeu(M), 2));
const tb = tableauPoints({ evenementsLock: [{ holder: 'a', ...evs[0], i: 0 }], coeurs: [{ liker: 'b', burned: (5n * M).toString() }, { liker: 'c', burned: '0' }], maintenant: T + 10 * JOUR });
t('board: sorted, shares sum to 1, zero-point wallets left out', tb.lignes.length === 2 && tb.lignes[0].total >= tb.lignes[1].total && pres(tb.lignes.reduce((s, x) => s + x.part, 0), 1));
t('same amount: burning it in hearts beats a day of lock at the best bonus (2 > 1.5)', pointsJeu(M) > pointsLockIntervalle(M, T + 400 * JOUR, T, T + JOUR));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
