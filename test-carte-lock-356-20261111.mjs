/* test-carte-lock-356-20261111.mjs — game356 (Grok's Wallet card plan, kept by Phil 2026-11-11). AFFIRME on the REAL files:
 *   - the lock form: amount chips (1,000 / holder stage / Max), duration pills from lock.js, a button naming amount AND days;
 *   - the points shown per lock come from points.js's pointsLockIntervalle (the server's own function), and points.js is SERVED;
 *   - the decreasing time bonus is said ("up to 1.5x at 90 days ahead"), never a flat multiplier, never a rate;
 *   - the big points counter and the folded "How the holders vault works" read their numbers (v1 holds from the frozen data, $15 from economie.js).
 * NE PROUVE PAS: the wallet flow (no wallet in a test) — the lock calls themselves are pinned by test-lock-app. */
import { readFileSync } from 'node:fs';
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const L = APP.slice(APP.indexOf('async function peindreLock('), APP.indexOf('async function peindreTipApercu('));
t('chips: 1,000 / holder stage / Max', L.includes("puce('1,000', 1000n * 10n ** 18n);") && !L.includes('Holder stage') /* game357: no holder-stage chip while v1 reads the wallet balance */ && L.includes("puce('Max', bal);"));
t('pills from lock.js durations', /for \(const j of LK\.DUREES_JOURS\) \{\n\s+const b = el\('button', 'lkPuce', ''\)/.test(L));
t('the button names the amount AND the days — or the LATER date a top-up keeps (review 356)', L.includes("(garde ? 'Add ' + LK.fmt(m) + ' TBLOCK to your lock (until '") && L.includes(": 'Lock ' + LK.fmt(m) + ' TBLOCK for ' + jours + ' days')"));
t('review 356: the kept date = the later of the stored date (active, no withdrawal asked) and the asked one', L.includes('const fin = Math.max(t0 + jours * 86400, Number(unlockAt) > t0 && locked > 0n && requestedAt === 0n ? Number(unlockAt) : 0);'));
/* review 356: '1.5' was read as 15 — the parse is EXECUTED here, extracted from the real file */
const brutSrc = L.slice(L.indexOf('const brut = (v) =>'), L.indexOf('\n', L.indexOf('const brut = (v) =>')));
const brut = new Function(brutSrc + '; return brut;')();
const E18 = 10n ** 18n;
t('review 356: whole TBLOCK only — 1.5 / 250.75 / 1e3 / -5 refused (0), never rewritten', [ '1.5', '250.75', '1e3', '-5', '', 'abc' ].every((x) => brut(x) === 0n));
t('review 356: 1000, 1,000 and 2 791 381 read exactly', brut('1000') === 1000n * E18 && brut('1,000') === 1000n * E18 && brut('2 791 381') === 2791381n * E18);
t('the click locks the CHOSEN duration', L.includes('LK.lockBatch({ amount: montant, jours, maintenantSec:'));
t('points per lock = the server function (points.js), up to the date the contract keeps', L.includes('PTS.pointsLockIntervalle(m, fin, t0, fin)') && APP.includes("import * as PTS from './points.js';"));
t('points.js is served (the app imports it)', /'points-vue\.js', 'points\.js'/.test(SRV));
t('decreasing bonus said, points = a separate drop, no rate promised', L.includes('up to 1.5x at 90 days ahead') && L.includes('Points decide your share of the community drop') && L.includes('No rate is promised.'));
t('the two-signature warning stays', L.includes('Approve, then lock: your wallet may ask twice.'));
const PTS = await import('./points.js');
const M = 10n ** 24n, T = 1_800_000_000;
const p7 = PTS.pointsLockIntervalle(M, T + 7 * 86400, T, T + 7 * 86400), p90 = PTS.pointsLockIntervalle(M, T + 90 * 86400, T, T + 90 * 86400);
t('points: 1M TBLOCK for 7 days earns between 7.0 and 7.3 (bonus 1.04x at start, 1.0x at the end)', p7 > 7.0 && p7 < 7.3);
t('points: 1M TBLOCK for 90 days = 90 x 1.25 average = 112.5', Math.abs(p90 - 112.5) < 1e-6);
t('big counter painted from /api/points total, hidden when none', APP.includes('gros.hidden = !(tot > 0);') && APP.includes('<p class="wPtsGros" id="wPointsGros" hidden></p>'));
t('vault explainer reads the v1 holds and the $15, never typed', APP.includes("ECO.fmt(ECO.LIKE_MIN_HOLD)") && APP.includes("ECO.fmt(ECO.CLAIM_MIN_HOLD)") && APP.includes("has the contracts ask $' + ECO.SEUIL_USD + ' of TBLOCK LOCKED") && APP.includes("the app also asks for a heart that you keep $' + ECO.SEUIL_USD") && !/17,200,000|2,580,000/.test(APP.slice(APP.indexOf("const wc = $('#wVaultComment');"), APP.indexOf('void peindreCoeursWallet();', APP.indexOf("const wc = $('#wVaultComment');")))));
t('vault explainer says v2 is NOT deployed yet, and points are NOT the weekly budget (review 356)', APP.includes('not deployed yet) has the contracts ask $') && !APP.includes('Points decide a share of what the vault actually receives'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
