// test-brain-ux-20261027 — the "View inside this block's brain" window (#bvPop), owner 2026-10-27:
//   1. its section tabs are ONE horizontal, readable, keyboard tab row (measured in game59: 9 spines of 24 x 96/108 px,
//      writing-mode vertical-rl + rotate(180deg), 11 px — unreadable);
//   2. the window and the Brain tab wear the colours of the block's on-chain SKIN, never an invented colour;
//   3. every skin colour that carries text is checked at WCAG AA 4.5:1, a failing one falls back to the page's own token.
// Mutants (on copies): BRAIN_UX_APP = another app.html, BRAIN_UX_SKIN = another vision-skin.js.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const DIR = new URL('./', import.meta.url);
const app = readFileSync(process.env.BRAIN_UX_APP || new URL('app.html', DIR), 'utf8').replace(/\r\n/g, '\n');
const S = await import(process.env.BRAIN_UX_SKIN ? pathToFileURL(process.env.BRAIN_UX_SKIN).href : new URL('vision-skin.js', DIR).href);
let count = 0; const ok = (c, m) => { assert.ok(c, m); count++; };

/* ── 1. THE TAB ROW ── every CSS rule of the shelf, read from the page */
const rules = [...app.matchAll(/^\.bvShelf[^{]*\{[^}]*\}/gm)].map((m) => m[0]);
ok(rules.length >= 3, 'the shelf rules are found (' + rules.length + ')');
const css = rules.join('\n');
ok(!/writing-mode\s*:\s*vertical/.test(css), 'no vertical writing-mode on the tabs');
ok(!/rotate\(/.test(css), 'no rotated tabs');
ok(!/flex-wrap\s*:\s*wrap/.test(css), 'the row never wraps into a column');
const shelf = rules.find((r) => /^\.bvShelf\{/.test(r)) || '';
ok(/flex-wrap:nowrap/.test(shelf) && /overflow-x:auto/.test(shelf) && /display:flex/.test(shelf), 'the row is one flex line that scrolls sideways itself: ' + shelf.slice(0, 90));
const spine = rules.find((r) => /^\.bvShelf \.bvSpine\{/.test(r)) || '';
ok(/white-space:nowrap/.test(spine) && /writing-mode:horizontal-tb/.test(spine), 'each tab label stays on one horizontal line');
const fs = Number((spine.match(/font-size:(\d+(?:\.\d+)?)px/) || [])[1]);
ok(fs >= 12, 'tab text is at least 12 px (' + fs + ')');
ok(/min-height:(3[6-9]|[4-9]\d)px/.test(spine), 'a tab is at least 36 px tall (touch)');
ok(/\.bvShelf \.bvSpine\[aria-selected=true\]\{[^}]*border-bottom-color:var\(--accent\)/.test(css), 'the active tab is underlined in the accent');
ok(/\.bvShelf \.bvSpine:focus-visible\{[^}]*outline/.test(css), 'keyboard focus is visible');
ok(/id="bvShelf" role="tablist"/.test(app), 'the row is a tablist');
const spines = [...app.matchAll(/<button type="button" class="bvSpine" role="tab"[^>]*data-book="(\w+)">([^<]+)<\/button>/g)];
ok(spines.length === 9, '9 tabs in the row (' + spines.length + ')');
/* the keyboard: the handler exists and maps the four keys */
const k = app.indexOf("$('#bvShelf').addEventListener('keydown'");
ok(k > 0, 'a keydown handler on the tab row');
const kb = app.slice(k, k + 900);
for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) ok(kb.includes("'" + key + "'"), 'key ' + key + ' handled');
ok(/bvOpenBook\(spines\[j\]\.dataset\.book\)/.test(kb) && /spines\[j\]\.focus\(\)/.test(kb), 'an arrow opens the section and moves the focus');
ok(/d\.tabIndex = d === focusable \? 0 : -1/.test(app), 'roving tabindex: one tab in the Tab order');

/* ── 2. THE SKIN SOURCE ── */
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27', OTHER = '0xb200000000000000000000b0526b81be1633e927';
const ALICE = '0x' + 'a'.repeat(40), BOB = '0x' + 'b'.repeat(40);
const rec = (h1, h3, cube, fond) => ({ id: 'random', angle: 10, h: [h1, 120, h3], cube, noyau: 200, fond });
const skins = [
  { tokenId: 1n, detenteur: ALICE, block: UNIT, recette: rec(43, 335, 280, 51) },
  { tokenId: 2n, detenteur: BOB, block: OTHER, recette: rec(100, 100, 100, 100) },
  { tokenId: 3n, detenteur: BOB, block: UNIT, recette: rec(60, 330, 10, 200) },
];
ok(S.skinDuBlock([], UNIT, null) === null, 'no skin on chain -> no skin');
ok(S.skinDuBlock(skins, '0x' + 'c'.repeat(40), null) === null, 'a block no skin names -> no skin');
ok(S.skinDuBlock(null, UNIT, null) === null, 'a list not read -> no skin (never a guess)');
/* ⛔ Owner (Phil, 2026-10-27): "a skin belongs to the user who owns it" — another account's skin is never shown */
ok(S.skinDuBlock(skins, UNIT, null) === null, 'no wallet: no skin (another account\'s skin is never shown)');
ok(S.skinDuBlock(skins, UNIT, '0x' + 'd'.repeat(40)) === null, 'a viewer who holds no skin for this block sees none (BOB\'s and ALICE\'s stay theirs)');
ok(S.skinDuBlock(skins, UNIT, ALICE).tokenId === 1n, 'the viewer who holds a skin for this block sees theirs');
ok(S.skinDuBlock(skins, UNIT, BOB).tokenId === 3n, 'each holder sees THEIR skin of the same block');
ok(S.skinDuBlock(skins, OTHER.toUpperCase().replace('0X', '0x'), BOB.toUpperCase().replace('0X', '0x')).tokenId === 2n, 'addresses compared case-insensitively');
/* the colours are the CONTRACT's (BlockSkins.sol#_svg): bg hsl(h6,45%,9%), ring hsl(h1,90%,62%), hsl(h3,90%,70%), edges hsl(h4,90%,60%) */
ok(JSON.stringify(S.hslVersRgb([0, 90, 62])) === '[245,71,71]', 'hsl(0,90%,62%) = rgb(245,71,71) (computed by hand)');
ok(JSON.stringify(S.hslVersRgb([0, 0, 100])) === '[255,255,255]' && JSON.stringify(S.hslVersRgb([120, 100, 25])) === '[0,128,0]', 'hsl->rgb reference points');
ok(Math.abs(S.contraste([255, 255, 255], [0, 0, 0]) - 21) < 1e-9 && Math.abs(S.contraste([118, 118, 118], [255, 255, 255]) - 4.54) < 0.01, 'WCAG ratios: 21 and 4.54');
const THEME = { texte: [243, 239, 251], doux: [185, 169, 221], accent: [167, 139, 250], accent2: [200, 189, 255], fond: [15, 10, 23] };
ok(S.paletteSkin(null, THEME).etat === 'DEFAUT', 'no skin -> the default palette');
ok(S.paletteSkin({ tokenId: 9n }, THEME).etat === 'DEFAUT', 'a skin without recipe -> the default palette');
ok(S.paletteSkin({ tokenId: 9n, recette: { ...rec(43, 335, 280, 51), fond: 400 } }, THEME).etat === 'DEFAUT', 'a hue outside 0..359 -> default, never a substitute hue');
ok(S.paletteSkin({ tokenId: 9n, recette: { ...rec(43, 335, 280, 51), cube: undefined } }, THEME).etat === 'DEFAUT', 'a missing hue -> default');
const p1 = S.paletteSkin(skins[0], THEME);
ok(p1.etat === 'SKIN' && p1.tokenId === '1', 'skin #1 is worn');
const rgb = (s) => s.match(/\d+/g).slice(0, 3).map(Number).join(',');
ok(rgb(p1.vars['--carte']) === S.hslVersRgb([51, 45, 9]).join(','), 'background = the contract background of its fond hue');
ok(rgb(p1.vars['--accent']) === S.hslVersRgb([43, 90, 62]).join(','), 'accent = the contract ring stop 0 of its first ring hue');
ok(rgb(p1.vars['--accent2']) === S.hslVersRgb([335, 90, 70]).join(','), 'accent2 = the contract ring stop .66 of its third ring hue');
ok(rgb(p1.vars['--ligne']) === S.hslVersRgb([280, 90, 60]).join(','), 'lines = the contract edge colour');
ok(Object.keys(p1.vars).every((v) => S.VARS_SKIN.includes(v)), 'only the listed variables are posed');
ok(!S.VARS_SKIN.some((v) => /--(vif|dur|tiede|doux|texte)\b/.test(v)), 'mood colours (--vif --dur --tiede) and text tokens are never skinned');

/* ── 3. CONTRAST ── a blue first ring (hsl(240,90%,62%)) reads at < 4.5:1 on a 9 % background: it must fall back */
const bleu = S.hslVersRgb([240, 90, 62]), fondB = S.hslVersRgb([51, 45, 9]);
ok(S.contraste(bleu, fondB) < 4.5, 'witness: the blue ring colour really fails (' + S.contraste(bleu, fondB).toFixed(2) + ':1)');
const p2 = S.paletteSkin({ tokenId: 4n, recette: rec(240, 335, 280, 51) }, THEME);
ok(p2.etat === 'SKIN' && p2.remplaces.includes('accent'), 'the failing accent is replaced (' + JSON.stringify(p2.remplaces) + ')');
ok(rgb(p2.vars['--accent']) === THEME.accent.join(','), 'by the page accent');
ok(p2.ratios.accent < 4.5 && p2.ratios.accentDefaut >= 4.5, 'ratios reported: skin ' + p2.ratios.accent + ', page ' + p2.ratios.accentDefaut);
for (const [n, r] of Object.entries(p1.ratios)) ok(r >= 4.5, 'skin #1 ' + n + ' reads at ' + r + ':1');
/* a page whose text is dark (a light theme) can wear no 9 %-background skin */
const p3 = S.paletteSkin(skins[0], { ...THEME, texte: [30, 30, 40], doux: [60, 60, 70] });
ok(p3.etat === 'DEFAUT' && /texte/.test(p3.pourquoi), 'dark page text on a dark skin -> the whole default palette (' + p3.pourquoi + ')');
/* neither the skin nor the page accent passes -> default */
const p4 = S.paletteSkin({ tokenId: 4n, recette: rec(240, 335, 280, 51) }, { ...THEME, accent: [60, 60, 200] });
ok(p4.etat === 'DEFAUT', 'no readable accent at all -> default');
/* a ratio between 3 and 4.5 fails AA for body text (kills a lowered threshold) */
const entre = [...Array(360).keys()].map((h) => [h, S.contraste(S.hslVersRgb([h, 90, 62]), fondB)]).find(([, r]) => r > 3 && r < 4.5);
ok(!!entre, 'witness hue between 3:1 and 4.5:1 found (' + (entre && entre[0]) + ')');
ok(S.paletteSkin({ tokenId: 5n, recette: rec(entre[0], 335, 280, 51) }, THEME).remplaces.includes('accent'), 'a 3..4.5:1 accent is replaced');
/* the translucent Brain-tab cards: text is checked on the mix too */
const p5 = S.paletteSkin(skins[0], THEME, { fonds: [(f) => f, (f) => S.melange(f, THEME.fond, 0.55)] });
ok(p5.etat === 'SKIN', 'skin #1 also readable on the Brain tab cards');

/* ── the glue in app.html: on-chain list only, never the panel's try-on ── */
const g = app.indexOf('async function bvPoserSkin(');
ok(g > 0, 'bvPoserSkin is found');
const glue = app.slice(g, app.indexOf('function ouvrirVision(', g));
ok(/skinDuBlock\(r\.skins, block, compte(\)|, BLOCKSKINS_SUITE\.map\(\(x\) => x\.contrat\)\))/.test(glue) /* game399: + the contracts order */ && /paletteSkin\(/.test(glue), 'the skin comes from the chain list (skinDuBlock on lireSkins)');
ok(!/skinPortee|bc\.skin|hsl\(|#[0-9a-f]{3,6}\b/i.test(glue), 'no try-on skin and no colour literal in the glue');
ok(/if \(!r\) \{ effacer\('not-read'\)/.test(glue), 'a failed read poses nothing');
ok(/pal\.etat !== 'SKIN'\) \{ effacer\('default'\)/.test(glue), 'a default verdict removes the skin variables');
const lu = app.indexOf('async function skinsVisionLus(');
ok(lu > 0 && /lireSkins\(\{ rpc \}\)/.test(app.slice(lu, lu + 400)) && /r\.etat === 'LU'/.test(app.slice(lu, lu + 400)), 'skins read with lireSkins, kept only when LU');
ok(/void bvPoserSkin\(dl, a,/.test(app) && /void bvPoserSkin\(\$\('#v-brain'\), a, \{ translucide: true/.test(app), 'posed on the brain window and on the Brain tab');
const rv = app.indexOf('function rasterVision(');
ok(rv > 0 && /getComputedStyle\(document\.documentElement\)/.test(app.slice(rv, rv + 400)), 'mood colours are read from the page root, not from the skinned window');
console.log('test-brain-ux-20261027: ' + count + ' ok');
