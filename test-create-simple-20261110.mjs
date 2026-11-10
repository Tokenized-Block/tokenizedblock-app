/* test-create-simple-20261110.mjs — game347 (Phil 2026-11-10: "redo the UX of Name it / face / brain, more readable and simpler").
 * Reads the REAL app.html. AFFIRME: step 1 = name + symbol side by side, the address folded; step 2 = Style, the brain line (always on),
 *   the role, then the dials folded, then ONE "More options" fold holding the image, the X post and the store; every field id still
 *   exists exactly once (nothing removed, nothing duplicated). NE PROUVE PAS: the rendering at 375 px (measured on prod).
 */
import { readFileSync } from 'node:fs';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const i1 = APP.indexOf('<span class="creaEtape">1</span> Name it'), i2 = APP.indexOf('<span class="creaEtape">2</span> Its face</p>'), i3 = APP.indexOf('<span class="creaEtape">3</span>');
t('steps 1, 2, 3 in order', i1 > 0 && i2 > i1 && i3 > i2);
const E1 = APP.slice(i1, i2), E2 = APP.slice(i2, i3);
t('step 1: name and symbol side by side', /<div class="creaDuo">\s*<label class="champ">Name<input id="cNom"[^>]*><\/label>\s*<label class="champ">Symbol<input id="cSym"[^>]*><\/label>\s*<\/div>/.test(E1));
t('step 1: the address is folded', /<details class="bDetail"[^>]*><summary class="note">Its address \(advanced, already filled in\)<\/summary>[\s\S]*id="cSel"/.test(E1));
const pos = (re) => { const m = re.exec(E2); return m ? m.index : -1; };
const ordre = [/<select id="cStyle">/, /id="cCerveauNote"/, /<select id="cRole">/, /id="cReglagesDetail"/, /id="cPlus"/, /id="cImageDetail"/, /id="cTweetDetail"/, /id="cBoutique"/].map(pos);
t('step 2 order: style, brain, role, dials, More options (image, X, store)', ordre.every((p, k) => p >= 0 && (k === 0 || p > ordre[k - 1])));
const plus = /<details class="bDetail" id="cPlus"[\s\S]*?<\/details>\s*<\/div>/.exec(E2);
t('More options is closed by default', /<details class="bDetail" id="cPlus" style="margin-top:10px">/.test(E2) && !/id="cPlus"[^>]*\bopen\b/.test(E2));
t('More options holds the image, the X post and the store', !!plus && /id="cImageDetail"/.test(plus[0]) && /id="cTweetDetail"/.test(plus[0]) && /id="cBoutique"/.test(plus[0]));
t('the dials are NOT inside More options (the 🎛 button opens them directly)', !!plus && !/id="cReglagesDetail"/.test(plus[0]));
t('brain always on', /<input type="checkbox" id="cCerveau" checked disabled hidden>/.test(E2));
for (const id of ['cNom', 'cSym', 'cSel', 'cSelNouveau', 'cStyle', 'cStyles', 'cCombinaisons', 'cPhotoOu', 'cPhotoFichier', 'cPhotoFond', 'cPhotoEtat', 'cTweetOui', 'cTweetLien', 'cTweetEtat', 'cReglagesDetail', 'cReglages', 'cCerveau', 'cRole', 'cRoleNote', 'cBoutique', 'cBoutiqueNote', 'cHasard', 'cManuel']) {
  t('id ' + id + ' exactly once', (APP.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1);
}
t('one short line under the title of step 2', /Its face<\/p>\n\s*<p class="sous">Engraved forever\. Pick a style, or tap <b>🎲 Surprise me<\/b> above\.<\/p>/.test(E2));
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
