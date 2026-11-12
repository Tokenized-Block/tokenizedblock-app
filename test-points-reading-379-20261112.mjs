/* test-points-reading-379-20261112.mjs — a zero is not known while the points index is still reading the chain.
 * Found 2026-11-12: a fresh server (index complet:false) told a wallet that HAS points "none yet — lock 100,000 TBLOCK…".
 *   points-vue.js#lignesMesPoints must say it is still reading while complet is not true, and "none yet" only once complete.
 * And /api/points `regle` (serveur-web.js) still said "hearts = 10 points each": a heart earns what it burns (points.js, 1 point per 8,600 TBLOCK).
 * Usage: node test-points-reading-379-20261112.mjs [path to points-vue.js] [path to serveur-web.js] — to run it against a pre-fix copy. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ici = path.dirname(fileURLToPath(import.meta.url));
const pvChemin = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ici, 'points-vue.js');
const swChemin = process.argv[3] ? path.resolve(process.argv[3]) : path.join(ici, 'serveur-web.js');
/* the module under test imports ./points.js next to it: a copy elsewhere is loaded from a temp file beside this tree's points.js */
let pvUrl = pathToFileURL(pvChemin).href;
let tmp = null;
if (path.dirname(pvChemin) !== ici) { tmp = path.join(ici, '.tmp-points-vue-' + process.pid + '.mjs'); fs.writeFileSync(tmp, fs.readFileSync(pvChemin)); pvUrl = pathToFileURL(tmp).href; }
let ok = 0, ko = 0;
const t = (m, c, x = '') => { if (c) ok++; else { ko++; console.log('KO', m, x); } };
try {
  const { lignesMesPoints } = await import(pvUrl);
  const nom = (a) => a.slice(0, 6) + '…';
  const lecture = lignesMesPoints({ ok: true, complet: false, compte: { holder: '0xabc', lock: 0, jeu: 0, total: 0, rang: null, part: 0 } }, nom);
  t('1 index still reading + zero so far: never "none yet"', !/none yet/i.test(lecture[0].v), lecture[0].v);
  t('2 index still reading + zero so far: says it is still reading', /still reading/i.test(lecture[0].v), lecture[0].v);
  t('3 index still reading: no "lock 100,000 TBLOCK" call to start (it may already have points)', !/lock 100,000 TBLOCK/.test(lecture[0].v), lecture[0].v);
  const fini = lignesMesPoints({ ok: true, complet: true, compte: { holder: '0xabc', lock: 0, jeu: 0, total: 0, rang: null, part: 0 } }, nom);
  t('4 index complete + zero: "none yet" and how to start', /^none yet/.test(fini[0].v) && /lock 100,000 TBLOCK/.test(fini[0].v), fini[0].v);
  const avec = lignesMesPoints({ ok: true, complet: false, compte: { total: 3, lock: 3, jeu: 0, rang: 2, part: 0.5 } }, nom);
  t('5 index still reading + points: the points are shown, with "still reading"', /^3 /.test(avec[0].v) && /still reading/.test(avec[1].v), avec.map((l) => l.v).join(' | '));
} finally { if (tmp) try { fs.unlinkSync(tmp); } catch (_) {} }
const sw = fs.readFileSync(swChemin, 'utf8');
const ligne = (sw.split('\n').find((l) => /^\s*regle: 'v2: lock points per day/.test(l)) || '');
t('6 /api/points regle found in the server', ligne.length > 0);
t('7 /api/points regle: never "10 points each"', !/10 points each/.test(ligne), ligne.slice(0, 200));
t('8 /api/points regle: hearts = 1 point per N TBLOCK burned, N from points.js (TBLOCK_PAR_POINT_JEU), not typed', /hearts: 1 point per ' \+ \(TBLOCK_PAR_POINT_JEU \/ 10n \*\* 18n\)\.toLocaleString\('en-US'\) \+ ' TBLOCK burned/.test(ligne) && /import \{[^}]*\bTBLOCK_PAR_POINT_JEU\b[^}]*\} from '\.\/points\.js'/.test(sw), ligne.slice(0, 300));
const { TBLOCK_PAR_POINT_JEU } = await import(pathToFileURL(path.join(ici, 'points.js')).href);
t('9 points.js says 8,600 TBLOCK a point (the number the rule writes)', (TBLOCK_PAR_POINT_JEU / 10n ** 18n).toLocaleString('en-US') === '8,600');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
