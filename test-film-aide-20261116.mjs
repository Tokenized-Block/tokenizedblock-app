/* test-film-aide-20261116.mjs — the product film in the "?" sheet (game424).
 * AFFIRME (text of app.html and serveur-web.js, plus the two files on disk): the film block exists and is hidden by default, it
 *   asks for no file until shown (no src in the markup); the first "?" shows the film, a seen film opens the guide; the end of the
 *   film and Skip both lead to the guide and mark it seen; closing stops the film and puts the sheet back in order; the server
 *   lists the film and its poster, types them, never gzips them, and answers byte ranges (206 / 416).
 * NE PROUVE PAS: that a browser plays it. That was run by hand on 2026-11-16 (local server): 200 / 206 / 416 by curl with the
 *   range bytes compared to the file, and in the page: plays with sound after the click, 1280x720, 110 s, end -> guide,
 *   Escape in the middle -> stopped and tidy, reopen -> guide + "Watch the film", first-time Skip -> guide. */
import { readFileSync, statSync } from 'node:fs';
let ok = 0, ko = 0;
const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } };
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const SRV = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

const bloc = (APP.match(/<div class="carte lFilm" id="lFilm"[^>]*>[\s\S]*?<\/div>\s*<\/div>/) || [''])[0];
t('the film block exists, hidden by default', /id="lFilm" hidden>/.test(bloc));
t('the video asks for nothing until shown: no src in the markup, preload none', /<video id="lFilmVideo"[^>]*preload="none"/.test(bloc) && !/<video[^>]*\ssrc=/.test(bloc));
t('it plays inline with controls and a poster', /playsinline/.test(bloc) && /controls/.test(bloc) && /poster="film-poster\.jpg"/.test(bloc));
t('a Skip button and a replay button exist', /id="lFilmPasser"/.test(APP) && /id="lFilmRevoir"/.test(APP));
t('the film block comes before the guide card', APP.indexOf('id="lFilm"') > 0 && APP.indexOf('id="lFilm"') < APP.indexOf('id="lTitre"'));

const ouvrir = APP.slice(APP.indexOf('function ouvrirLearn()'), APP.indexOf('function fermerLearn()'));
t('the first "?" shows the film, a seen film opens the guide', ouvrir.includes('if (!filmVu()) { montrerFilm(); return; }'));
const fermer = APP.slice(APP.indexOf('function fermerLearn()'), APP.indexOf('const FILM_VU'));
t('closing stops the film and puts the sheet back in order', fermer.includes('arreterFilm(false)') && fermer.includes("classList.remove('lFilmSeul')") && /b\.hidden = true/.test(fermer));
t('the end of the film and Skip both lead to the guide', APP.includes("$('#lFilmVideo').addEventListener('ended', () => { filmCompter('film_fini'); arreterFilm(true); });") && APP.includes("$('#lFilmPasser').addEventListener('click', () => { filmCompter('film_passe'); arreterFilm(true); });"));
/* game426: three counts, and each name the page sends is a name the server keeps (an unknown name is dropped in silence) */
const envoyes = [...APP.matchAll(/filmCompter\('([a-z_]+)'\)/g)].map((m) => m[1]);
t('the page counts shown / watched to the end / skipped', ['film_lance', 'film_fini', 'film_passe'].every((n) => envoyes.includes(n)) && envoyes.length === 3, envoyes.join(','));
t('every film step sent is in the server list', envoyes.every((n) => SRV.includes("'" + n + "'")));
t('counting cannot stop the film (guarded call)', APP.includes("function filmCompter(nom) { try { if (typeof etape === 'function') etape(nom); } catch (_) {"));
const arreter = APP.slice(APP.indexOf('function arreterFilm('), APP.indexOf("$('#lFilmVideo').addEventListener('ended'"));
t('only reaching the guide marks the film as seen', arreter.indexOf('if (!versGuide) return;') > 0 && arreter.indexOf('if (!versGuide) return;') < arreter.indexOf("localStorage.setItem(FILM_VU, '1')"));
t('the file is set only when the film is shown', APP.includes("if (!v.getAttribute('src')) v.setAttribute('src', 'film.mp4');"));
t('while the film plays alone, the rest of the sheet is hidden by CSS', APP.includes('#v-learn.lFilmSeul .feuilleCorps>:not(#lFilm){display:none}'));

/* game425: the "turn your phone" line — only on a phone held upright; sideways the film fills the screen and Skip stays reachable */
t('the turn-your-phone line exists inside the film block', /id="lFilmTourner">[^<]*Turn your phone sideways/.test(bloc + APP.slice(APP.indexOf('id="lFilmPasser"'), APP.indexOf('id="lTitre"'))));
t('it is hidden by default and shown only upright on a narrow screen', APP.includes('#v-learn .lFilmTourner{display:none') && APP.includes('@media (max-width:700px) and (orientation:portrait){#v-learn .lFilmTourner{display:block}}'));
t('sideways, the film takes the height of the screen', /@media \(max-height:520px\) and \(orientation:landscape\)\{[\s\S]*?height:calc\(100dvh - 64px\)/.test(APP));

/* game425: on a phone only — a card before the film, full screen sideways, upright again after */
const montrer = APP.slice(APP.indexOf('function montrerFilm()'), APP.indexOf('function filmSurMobile()'));
t('the full-screen path is taken on a phone only (coarse pointer and a short side under 700 px)', montrer.includes('if (filmSurMobile()) {') && APP.includes("matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700"));
t('on a phone: the card shows, then the film is let go after it', montrer.includes('if (avant) avant.hidden = false;') && /setTimeout\(\(\) => \{ filmTenu = false; if \(avant\) avant\.hidden = true; const q = v\.play\(\)/.test(montrer));
t('a desktop keeps the direct start, with the card hidden', /\} else \{\s*if \(avant\) avant\.hidden = true;[\s\S]*?const p = v\.play\(\)/.test(montrer));
t('full screen then the landscape lock, both allowed to fail', APP.includes("o.lock('landscape')") && APP.includes('bloc.requestFullscreen || bloc.webkitRequestFullscreen'));
t('stopping the film (end, Skip or close) releases the orientation and leaves full screen', arreter.includes('filmQuitterPleinEcran();') && arreter.indexOf('filmQuitterPleinEcran();') < arreter.indexOf('if (!versGuide) return;') && APP.includes('o.unlock()'));
t('leaving full screen by hand also frees the orientation', APP.includes("document.addEventListener('fullscreenchange'"));
t('the card exists, hidden by default', /<div class="lFilmAvant" id="lFilmAvant" hidden>/.test(APP));

t('the server lists the film and its poster', /'film\.mp4', 'film-poster\.jpg',/.test(SRV));
t('the server types them', SRV.includes("'.mp4': 'video/mp4'") && SRV.includes("'.jpg': 'image/jpeg'"));
t('the server never gzips them', SRV.includes("nom.endsWith('.png') || nom.endsWith('.mp4') || nom.endsWith('.jpg')"));
t('the server answers byte ranges: 206 with content-range, 416 outside the file', SRV.includes("res.writeHead(206, { ...base, 'content-range': 'bytes ' + debut + '-' + fin + '/' + taille") && SRV.includes("res.writeHead(416, { 'content-range': 'bytes */' + taille"));
t('and says ranges exist on a whole-file answer', SRV.includes("'accept-ranges': 'bytes'"));

const mp4 = statSync(new URL('./film.mp4', import.meta.url)).size, head = readFileSync(new URL('./film.mp4', import.meta.url)).subarray(4, 8).toString('latin1');
t('film.mp4 is an MP4 under 12 MB (it is kept in memory and sent to phones)', head === 'ftyp' && mp4 > 1e6 && mp4 < 12e6, mp4);
t('film-poster.jpg is a JPEG', readFileSync(new URL('./film-poster.jpg', import.meta.url)).subarray(0, 2).toString('hex') === 'ffd8');
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
