/* test-points-vue-20261111.mjs — the words of the community points (points-vue.js): never a rate, unread said, still-reading said. */
import { lignesMesPoints, lignesBoardPoints, pct, REGLE_COURTE, fmtPts } from './points-vue.js';
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
const nom = (a) => a.slice(0, 6) + '…';
t('the rule says no rate is promised', /no rate is promised/.test(REGLE_COURTE) && !/APY|APR|yield|%\/(year|day)/i.test(REGLE_COURTE));
t('unread: said', lignesMesPoints(null, nom)[0].v === 'not read just now' && lignesBoardPoints({ ok: false }, nom)[0].v === 'not read just now');
t('no wallet: asks to connect', /connect your wallet/.test(lignesMesPoints({ ok: true }, nom)[0].v));
t('zero points: says how to start, with the v2 numbers', /lock 100,000 TBLOCK for 1 point a day, or send a heart: 1 point per 8,600 TBLOCK it burns/.test(lignesMesPoints({ ok: true, complet: true, compte: { total: 0 } }, nom)[0].v)); /* 2026-11-12: "none yet" only once the index is complete */
const r = { ok: true, complet: false, compte: { total: 12.345, lock: 10, jeu: 2.345, rang: 3, part: 0.1234, parJour: 35, mult: 1.25 }, board: [{ rang: 1, holder: '0xaaaaaaaa', total: 50, part: 0.5, sesBlocks: ['0xb1b1b1'] }, { rang: 2, holder: '0xbbbbbbbb', total: 1, part: 0.00001, sesBlocks: [] }] };
const m = lignesMesPoints(r, nom);
t('my points: total, lock, hearts (v2 format)', m[0].v === '12 (lock 10 · hearts 2.3)', m[0].v);
t('game359: what the lock earns now, with its multiplier', m[2] && m[2].v === '+35 a day (×1.25 commitment)', m[2] && m[2].v);
t('game359: a positive balance is never "0"', fmtPts(0.0004) === '<0.01' && fmtPts(0.01) === '0.01' && fmtPts(0.456) === '0.45' && fmtPts(3.27) === '3.2' && fmtPts(1234.9) === '1,234' && fmtPts(0) === '0');
t('game359: the rule says the v2 numbers', REGLE_COURTE.includes('1 point a day per 100,000 TBLOCK locked') && REGLE_COURTE.includes('Hearts: 1 point per 8,600 TBLOCK burned') && !/10 points each/.test(REGLE_COURTE)); /* game377: a heart's points follow its burn */
t('my share + rank, and "still reading" while incomplete', m[1].v === '12.34% · rank #3 · still reading the chain', m[1].v);
const b = lignesBoardPoints(r, nom, '0xBBBBBBBB');
t('board: named by the block when there is one', b[0].k === '#1 0xb1b1…’s creator' && b[0].v === '50 pts · 50.00%', b[0].v);
t('tiny shares are not shown as 0', b[1].v === '1 pts · <0.01%' && b[1].moi === true && /\(you\)$/.test(b[1].k));
t('empty and complete: the first lock or heart starts it', /first lock or heart/.test(lignesBoardPoints({ ok: true, complet: true, board: [] }, nom)[0].v));
t('pct', pct(0) === '0%' && pct(1) === '100.00%');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
