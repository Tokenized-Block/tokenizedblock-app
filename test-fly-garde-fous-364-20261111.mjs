/* test-fly-garde-fous-364-20261111.mjs — game364 (Phil 2026-11-11, Coinbase "Agent Controls" post read on X the same day: max trade size,
 *   24-hour volume limit, auto-stop at a % loss that only the human turns back on). AFFIRME on the REAL fly-day.js and fly-brain.js / .html:
 *   - volume24h: rolling 24 h sum; mayBuyVolume refuses a buy that would pass the cap (exact edge allowed), and bad caps / amounts;
 *     reserveVolume drops entries older than 24 h, never mutates;
 *   - verdictPerte: stop at or past the % from the base; unmeasurable -> null (never a stop on a missing price);
 *   - the page: the buy is checked against the 24 h cap BEFORE planning; the trade's USDC is recorded WITH the slot before the first
 *     transaction; the auto-stop compares the wallet value to the value at Start, stops, and only Start (the human) clears it; a sell is never
 *     blocked by the volume cap; the rules panel is built from the same fields and says where the rules live (this page, no server).
 * NE PROUVE PAS: a live trade (the fly trades real money only with its owner's funding). */
import { readFileSync } from 'node:fs';
import { volume24h, mayBuyVolume, reserveVolume, verdictPerte, JOUR_MS } from './fly-day.js';
const JS = readFileSync(new URL('./fly-brain.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const HT = readFileSync(new URL('./fly-brain.html', import.meta.url), 'utf8');
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const T = 1_800_000_000_000;
let s = { day: 'x' };
s = reserveVolume(s, T - JOUR_MS - 1, 3);     /* older than 24 h */
s = reserveVolume(s, T - 1000, 1.5);
s = reserveVolume(s, T, 2);
t('rolling 24 h: the old entry is dropped by reserve and never counted', volume24h(s, T) === 3.5 && s.volumes.length === 2, String(volume24h(s, T)));
t('a buy that fits under the cap passes, the exact edge too', mayBuyVolume(s, T, 1.5, 5) && mayBuyVolume(s, T, 1.5, 5.0));
t('a buy that would pass the cap is refused', !mayBuyVolume(s, T, 1.6, 5));
t('after 24 h the volume comes back', volume24h(s, T + JOUR_MS + 1) === 0 && mayBuyVolume(s, T + JOUR_MS + 1, 5, 5));
t('bad cap / amount refused', !mayBuyVolume(s, T, 1, 0) && !mayBuyVolume(s, T, 0, 5) && !mayBuyVolume(s, T, NaN, 5));
const s0 = { volumes: [] }; reserveVolume(s0, T, 1);
t('reserveVolume never mutates', s0.volumes.length === 0);
t('auto-stop: down 5% from base -> stop at 5%', verdictPerte(2, 1.9, 5).arret === true && Math.abs(verdictPerte(2, 1.9, 5).perte - 5) < 1e-9);
t('down 4.9% -> no stop; up -> no stop', verdictPerte(2, 1.902, 5).arret === false && verdictPerte(2, 2.5, 5).arret === false);
t('unmeasurable -> null, never a stop', verdictPerte(0, 1, 5) === null && verdictPerte(2, NaN, 5) === null && verdictPerte(2, 1, 0) === null);
const tr = JS.slice(JS.indexOf('async function autoTrade('), JS.indexOf('function autoSettings()'));
t('page: the 24 h cap is checked on a BUY before planning', tr.indexOf('mayBuyVolume(') > 0 && tr.indexOf('mayBuyVolume(') < tr.indexOf("fetch('/api/rails/plan?'"));
t('page: a SELL is never checked against the volume cap', !/else \{ de = stock\.address;[^\n]*mayBuyVolume/.test(tr));
t('page: the trade\'s USDC is recorded with the slot, before the first transaction', tr.includes('Object.assign(auto.s, reserveVolume(auto.s, Date.now(), volumeDuTrade)); autoSave(); reserved = true; sendingStarted = true;'));
t('page: auto-stop compares to the value at Start and stops', tr.includes("verdictPerte(auto.s.baseUsd, valeur, field('autoLoss', 1, 50, 1))") && tr.includes('auto.s.running = false; auto.s.stopPerte = {'));
t('page: no price -> no auto-stop decision', tr.includes('if (prix !== null) {'));
t('page: only Start (the human) resets the base and clears a stop', JS.includes('auto.s.baseUsd = null; auto.s.stopPerte = null; autoSave(); autoRender();') && (JS.match(/auto\.s\.stopPerte = null/g) || []).length === 1);
t('html: the two new settings', HT.includes('id="autoVol"') && HT.includes('id="autoLoss"') && HT.includes('id="autoRules"'));
const ru = JS.slice(JS.indexOf('function autoRulesRender()'), JS.indexOf('function autoRulesRender()') + 1800);
t('rules panel: built from the same fields, says where the rules live', ru.includes("field('autoVol', 0.5, 1000, 0.5)") && ru.includes("field('autoLoss', 1, 50, 1)") && ru.includes('no server enforces them'));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
