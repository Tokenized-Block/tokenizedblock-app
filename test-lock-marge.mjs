/* test-lock-marge.mjs — lock-marge.js.
 * AFFIRME: minHold after k writes is the contract-side worst case (step 10 %: x 10000/9000 rounded up, k times); the measured 2026-11-14
 *   lock (3,000,000 vs 2,789,880) is "close" with 0 writes of margin; a lock exactly at minHold is not "under"; the suggested top-up puts
 *   the lock exactly at the line after 3 writes; unread or insane inputs give no verdict.
 * NE PROUVE PAS: the card's rendering (the lock card tests and the browser do). */
import * as M from './lock-marge.js';
let ok = 0, ko = 0;
const t = (m, c, vu = '') => { if (c) ok++; else { ko++; console.log('KO', m, vu); } };
const E = 10n ** 18n;
const base = { maxStepBps: 1000n, minIntervalS: 3600n };
t('minHold after 1 write: 9000 -> 10000', M.minHoldApres(9000n, 1000n, 1) === 10000n);
t('minHold after 2 writes: 9000 -> 11112 (rounded up)', M.minHoldApres(9000n, 1000n, 2) === 11112n);
const g = M.margeHold({ ...base, locked: 3_000_000n * E, minHold: 2_789_880_205_312_700_046_735_192n });
t('Grok 2026-11-14: close, 0 writes of margin, +7.5%', g.niveau === 'proche' && g.pasAvant === 0 && g.margeBps === 753, JSON.stringify(g, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
t('its top-up lands exactly on the line after 3 writes', 3_000_000n * E + g.aAjouter === M.minHoldApres(2_789_880_205_312_700_046_735_192n, 1000n, 3));
t('a lock exactly at minHold is close, not under', M.margeHold({ ...base, locked: 100n, minHold: 100n }).niveau === 'proche');
t('one unit below: under', M.margeHold({ ...base, locked: 99n, minHold: 100n }).niveau === 'sous');
const loin = M.margeHold({ ...base, locked: 2000n, minHold: 1000n });
t('2x minHold: ok, 6 writes (1000 -> 1886 after 6, 2096 after 7)', loin.niveau === 'ok' && loin.pasAvant === 6 && loin.heures === 6 && loin.aAjouter === 0n, JSON.stringify(loin, (k, v) => (typeof v === 'bigint' ? String(v) : v)));
t('exactly 2 writes (1000 -> 1112 -> 1236): ok (PAS_PROCHE); 1235 is 1 write, close', M.margeHold({ ...base, locked: 1236n, minHold: 1000n }).pasAvant === 2 && M.margeHold({ ...base, locked: 1236n, minHold: 1000n }).niveau === 'ok' && M.margeHold({ ...base, locked: 1235n, minHold: 1000n }).niveau === 'proche');
t('1 write: close', M.margeHold({ ...base, locked: 1112n, minHold: 1000n }).niveau === 'proche' && M.margeHold({ ...base, locked: 1112n, minHold: 1000n }).pasAvant === 1);
for (const bad of [{ locked: 0n }, { minHold: 0n }, { maxStepBps: 0n }, { maxStepBps: 10000n }, { minIntervalS: 0n }, { locked: 'x' }]) t('no verdict for ' + JSON.stringify(bad, (k, v) => (typeof v === 'bigint' ? String(v) : v)), M.margeHold({ ...base, locked: 5n, minHold: 3n, ...bad }).niveau === null);
const fmt = (x) => (BigInt(x) / E).toString();
t('text close names the % and the top-up', /only 7\.5% above the hold line/.test(M.texteMarge(g, fmt)) && /Add \d+ TBLOCK/.test(M.texteMarge(g, fmt)));
t('text under says hearts are refused', /hearts are refused/.test(M.texteMarge(M.margeHold({ ...base, locked: 99n * E, minHold: 100n * E }), fmt)));
t('text ok says the margin', /^Hold margin: \+100%, about 6 moves/.test(M.texteMarge(loin, fmt)), M.texteMarge(loin, fmt));
t('no text without a verdict', M.texteMarge({ niveau: null }, fmt) === null);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
