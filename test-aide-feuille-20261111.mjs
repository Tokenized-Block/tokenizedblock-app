/* test-aide-feuille-20261111.mjs — game356 (Grok's "?" mock-up, validated by Phil 2026-11-11). AFFIRME on the REAL app.html:
 *   - "?" opens the guide as a SHEET (.feuille) and never switches the tab under it (no .on toggling, no navB change);
 *   - the 3 first steps come first; the tab guide, cube sizes and never-list are folded (<details>, closed);
 *   - close by ✕, by the backdrop, by Escape; each step button closes the sheet before moving;
 *   - the never-list no longer says "never trade for you" without the fly exception, nor "never sends anything by itself";
 *   - the Create price comes from create-vault-tip.js (TIP.TARGET_USD), never typed.
 * NE PROUVE PAS: the rendering (checked in a browser at 1280 and 375 px). */
import { readFileSync } from 'node:fs';
const APP = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };
const debut = APP.indexOf('<section class="volet" id="v-learn"');
const sec = APP.slice(debut, APP.indexOf('</section>', debut));
const f = APP.slice(APP.indexOf('function ouvrirLearn() {'), APP.indexOf('function fermerLearn() {'));
t('the sheet is a dialog', /id="v-learn" aria-label="Learn" role="dialog" aria-modal="true"/.test(sec));
t('"?" opens a sheet: adds .feuille', f.includes("f.classList.add('feuille');"));
t('"?" never switches the tab under it (no .on, no navB)', !f.includes("'on'") && !f.includes('.navB'));
const pas = sec.indexOf('class="lPas"'), plis = sec.indexOf('<details');
t('the 3 steps come before every folded part', pas > 0 && plis > pas && (sec.match(/<li>/g) || []).length >= 3);
t('3 folded parts, all closed by default', (sec.match(/<details class="carte lPli">/g) || []).length === 3 && !/<details[^>]*\bopen\b/.test(sec));
t('the tab guide, cube sizes and never-list are the folded ones', /<summary class="titre">What each tab does<\/summary>\s*<div class="etapes" id="lEtapes">/.test(sec)
  && sec.includes('<summary class="titre">Why some cubes are bigger</summary>') && /<summary class="titre">What this app never does<\/summary>\s*<ul class="pmLignes" id="lJamais">/.test(sec));
t('close by ✕, backdrop and Escape', APP.includes("$('#lFermer').addEventListener('click', fermerLearn);") && APP.includes('if (e.target === e.currentTarget) fermerLearn();')
  && APP.includes("if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('dialog[open]') && $('#v-learn').classList.contains('feuille')) fermerLearn();"));
t('review 356: any move to a tab (palette, links, steps) closes the sheet first', /function allerA\(nom\) \{\r?\n  if \(typeof fermerLearn === 'function'\) fermerLearn\(\);/.test(APP));
t('review 356: the step text never says the app holds no key at all (the fly has its own)', APP.includes('The app never holds your wallet’s key.') && !sec.includes('The app never holds a key.'));
const aller = APP.slice(APP.indexOf("for (const b of document.querySelectorAll('#v-learn [data-l-aller]'))"), APP.indexOf("$('#lConnecter').addEventListener"));
t('each step button closes the sheet BEFORE moving', aller.indexOf('fermerLearn();') > 0 && aller.indexOf('fermerLearn();') < aller.indexOf('allerA('));
t('the step targets exist as tabs (map, trade, creer, wallet)', ['map', 'trade', 'creer', 'wallet'].every((v) => APP.includes('data-volet="' + v + '"')));
t('the sheet CSS beats the generic .volet max-width (section#v-learn)', APP.includes('section#v-learn.feuille{display:block;position:fixed;inset:0;') && APP.includes('max-width:none;margin:0;'));
const jamais = APP.slice(APP.indexOf("$('#lJamais').innerHTML = ["), APP.indexOf("].map((l) => '<li>'", APP.indexOf("$('#lJamais').innerHTML = [")));
t('never-list: the fly exception is said with the brains line', jamais.includes('The one exception is the fly (Brain tab)') && !/never sends anything by itself/.test(jamais));
t('Create price from the module, never typed', APP.includes("cr.textContent = 'Create yours — $' + TIP.TARGET_USD;") && !/Create yours — \$\d/.test(sec));
const TIP = await import('./create-vault-tip.js');
t('the module price is a number', Number.isFinite(TIP.TARGET_USD) && TIP.TARGET_USD > 0);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
