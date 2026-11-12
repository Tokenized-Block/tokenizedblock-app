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
/* 2026-11-12: the lock.js durations, plus 60 days while the monthly lock rewards are live (the shortest lock sure to cover a whole month) */
t('pills from lock.js durations (+ 60 days with the lock rewards)', /const durees = EP\.REWARDS \? \[\.\.\.new Set\(\[\.\.\.LK\.DUREES_JOURS, EP\.MOIS_MIN_JOURS\]\)\]\.sort\(\(x, y\) => x - y\) : LK\.DUREES_JOURS;/.test(L) && /for \(const j of durees\) \{\n\s+const b = el\('button', 'lkPuce', ''\)/.test(L));
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
t('game359: the v2 bands said (1 a day per 100,000, x1.25 / x1.5 / x2), points = a separate drop, no rate promised', L.includes('1 a day per 100,000 TBLOCK, ×1.25 from 30 days, ×1.5 from 90, ×2 from 1 year') && L.includes('Points decide your share of the community drop') && L.includes('No rate is promised.'));
t('the two-signature warning stays', L.includes('Approve, then lock: your wallet may ask twice.'));
const PTS = await import('./points.js');
const M = 10n ** 24n, T = 1_800_000_000;
const p7 = PTS.pointsLockIntervalle(M, T + 7 * 86400, T, T + 7 * 86400), p90 = PTS.pointsLockIntervalle(M, T + 90 * 86400, T, T + 90 * 86400);
t('game359 points v2: 1M TBLOCK for 7 days = 10 a day x 7 = 70', Math.abs(p7 - 70) < 1e-6, String(p7));
t('game359 points v2: 1M TBLOCK for 90 days = 10 a day x 1.5 x 90 = 1350', Math.abs(p90 - 1350) < 1e-6, String(p90));
t('big counter painted from /api/points total, hidden when none', APP.includes('gros.hidden = !(tot > 0);') && APP.includes('<p class="wPtsGros" id="wPointsGros" hidden></p>'));
/* 2026-11-12 (UI copy rule, Phil): same facts, no version or internal status on screen ("Coming soon" for what is not live) */
/* 2026-11-12 (the economy pack is live): the explainer is the LIVE vault's rules, read on chain (EP.REGLES_VAULT -> texteRegleVault), never
 *   typed; these two clauses replace those of the first vault's explainer */
t('vault explainer: the live vault rules read on chain, never typed', APP.includes('for (const k of EP.REGLES_VAULT) r[k] = await lit(EP.VIEW.regleVault(k)); wVaultRegle = EP.texteRegleVault(r);') && APP.includes("if (wc) wc.textContent = (wVaultRegle || ") && !/17,200,000|2,580,000/.test(APP.slice(APP.indexOf("const wc = $('#wVaultComment');"), APP.indexOf("const wc = $('#wVaultComment');") + 900)));
t('vault explainer: you must play that week; points are separate from the weekly budget', APP.includes(' You must play that week: a heart, a TAM art mint or a skin mint. Community points are separate') && !APP.includes('Points decide a share of what the vault actually receives'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
