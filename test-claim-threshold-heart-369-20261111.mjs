/* test-claim-threshold-heart-369-20261111.mjs — next to the heart, the page says what CLAIMING the holders vault needs.
 *
 * Why: the heart's own hold (LIKE_MIN_HOLD + $15) is far below the vault's claim threshold (CLAIM_MIN_HOLD, vault.config.minHold).
 *   The only place that showed the claim threshold was the "How it works" tab, hidden by default. A player who passes the heart's rule
 *   could believe a heart makes them eligible to claim.
 *
 * A  EXECUTED  coeurs-vue.js ligneSeuilClaim(): with the vault minHold from economie-deploiement.js and a price of 0.000005477993546359498,
 *              the text names "17,200,000 TBLOCK" and "$94.2" (the threshold is read from the record, not typed in this test).
 * B  EXECUTED  no dollar text without a price (null, 0, NaN); no balance text without a balance; "enough" / "not enough yet" by balance.
 * C  SOURCE    app.html peindreCoeursWallet calls CV.ligneSeuilClaim( with ECO.CLAIM_MIN_HOLD.
 * D  SOURCE    the #bcLikeBtn title in the HTML types no "86,000" or "2,580,000"; it is set in code that uses ECO.CLAIM_MIN_HOLD.
 * E  SOURCE    CLAIM_MIN_HOLD appears more than once in app.html (the note before connecting and the confirmation name it too).
 * F  SOURCE    coeurs-vue.js still imports nothing (test-coeurs-app-20261110.mjs rule).
 * M  MUTANTS   a dollar text printed without a price -> B red; a hard-coded number back in the button title -> D red.
 * Counts itself and prints n/n. */
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let n = 0, rouges = 0;
const vu = (cond, label) => { n += 1; if (cond === true) console.log('  ok   ' + label); else { rouges += 1; console.log('  FAIL ' + label); } };

const D = (await import('./economie-deploiement.js')).ECONOMIE_DEPLOIEMENT;
const MIN = BigInt(D.vault.config.minHold);
const ENT = (MIN / 10n ** 18n).toLocaleString('en-US');
const CV = await import('./coeurs-vue.js');
const f = CV.ligneSeuilClaim;
const PRIX = 0.000005477993546359498;

const clauseA = (fn) => {
  try {
    const l = fn({ claimMinHold: MIN, prixUsd: PRIX });
    return !!l && l.k === 'Vault claim needs' && l.v.includes(ENT + ' TBLOCK') && ENT === '17,200,000' && l.v.includes('$94.2') && /now/.test(l.v);
  } catch (_) { return false; }
};
const clauseB = (fn) => {
  try {
    const sansPrix = [null, 0, NaN, undefined].map((p) => fn({ claimMinHold: MIN, prixUsd: p }).v);
    const sansBal = fn({ claimMinHold: MIN, prixUsd: PRIX, balance: null }).v;
    const peu = fn({ claimMinHold: MIN, prixUsd: null, balance: MIN - 1n }).v;
    const assez = fn({ claimMinHold: MIN, prixUsd: null, balance: MIN }).v;
    return sansPrix.every((v) => !v.includes('$') && v.includes(ENT + ' TBLOCK')) && !/you hold|enough/.test(sansBal)
      && /you hold 17,199,999/.test(peu) && /not enough yet/.test(peu) && /you hold 17,200,000/.test(assez) && / · enough$/.test(assez);
  } catch (_) { return false; }
};
vu(typeof f === 'function', 'A coeurs-vue.js exports ligneSeuilClaim');
vu(typeof f === 'function' && clauseA(f), 'A the line names ' + ENT + ' TBLOCK (vault minHold of the record) and ≈ $94.2 at the given price');
vu(typeof f === 'function' && clauseB(f), 'B no dollar text without a price, no balance text without a balance, enough / not enough yet by balance');

const APP = lire('app.html');
const iP = APP.indexOf('async function peindreCoeursWallet() {');
/* the function body: up to its closing brace at column 0 (CRLF-safe search, test-tests-portables.mjs) */
const corpsDe = (i) => { if (i < 0) return ''; const k = APP.slice(i).search(/\r?\n\}\r?\n/); return k < 0 ? '' : APP.slice(i, i + k); };
const corpsP = corpsDe(iP);
/* review 2026-11-11: computing the line is not painting it — the line must be the FIRST row given to #wCoeursMoi, for a visitor too;
 *   and its "now" price is priceNow alone (not the lower of now and ~10 min ago) */
const clauseC = (c) => /const ligneClaim = CV\.ligneSeuilClaim\(\{ claimMinHold: ECO\.CLAIM_MIN_HOLD,/.test(c)
  && /peindre\(\$\('#wCoeursMoi'\), \[ligneClaim\]\.concat\(/.test(c)
  && /prixClaim = h && h\.ok && Number\(h\.priceNow\) > 0 \? Number\(h\.priceNow\) : null;/.test(c) && !/prixClaim = [^;]*priceBefore/.test(c);
vu(clauseC(corpsP), 'C peindreCoeursWallet paints CV.ligneSeuilClaim (ECO.CLAIM_MIN_HOLD) as the first row of #wCoeursMoi, priced with priceNow');
const mC = corpsP.replace("peindre($('#wCoeursMoi'), [ligneClaim].concat(", "peindre($('#wCoeursMoi'), [].concat(");
vu(mC !== corpsP && clauseC(mC) === false, 'M mutant: the claim line computed but not painted -> C red');

const clauseD = (app) => {
  const m = app.match(/<button type="button" id="bcLikeBtn"[^>]*>/);
  const tag = m ? m[0] : '';
  return !!tag && !tag.includes('86,000') && !tag.includes('2,580,000')
    && /\$\('#bcLikeBtn'\)\.title = [^\n]*ECO\.fmt\(ECO\.LIKE_PRICE\)[^\n]*ECO\.fmt\(ECO\.LIKE_MIN_HOLD\)[^\n]*ECO\.SEUIL_USD[^\n]*ECO\.fmt\(ECO\.CLAIM_MIN_HOLD\)/.test(app);
};
vu(clauseD(APP), 'D the ♥ title types no amount in the HTML; code sets it from ECO (price, hold, $, claim threshold)');
const nClaim = (APP.match(/CLAIM_MIN_HOLD/g) || []).length;
vu(nClaim > 1, 'E CLAIM_MIN_HOLD appears ' + nClaim + ' times in app.html (was 1)');
const iC = APP.indexOf('async function bcCoeur(a, dire = null) {');
const corpsC = corpsDe(iC);
vu(/Connect your wallet first\.[^\n]*ECO\.fmt\(ECO\.CLAIM_MIN_HOLD\)/.test(corpsC) && /♥ confirmed\.[^\n]*ECO\.fmt\(ECO\.CLAIM_MIN_HOLD\)/.test(corpsC),
  'E the note before connecting and the confirmation both name the claim threshold from ECO');
vu(!/^import /m.test(lire('coeurs-vue.js')), 'F coeurs-vue.js imports nothing');

/* mutants */
const SRC = lire('coeurs-vue.js');
const ancre = 'const p = Number(prixUsd);';
let mutVivant = false, mutTue = false;
if (SRC.includes(ancre)) {
  const dir = mkdtempSync(join(tmpdir(), 'ch369-'));
  const p = join(dir, 'coeurs-vue-mutant.mjs');
  writeFileSync(p, SRC.replace(ancre, 'const p = Number(prixUsd) || 0.00001;'));
  try {
    const M = await import(pathToFileURL(p).href);
    mutVivant = typeof M.ligneSeuilClaim === 'function' && M.ligneSeuilClaim({ claimMinHold: MIN }).k === 'Vault claim needs';
    mutTue = clauseB(M.ligneSeuilClaim) === false;
  } catch (_) { mutTue = false; }
  try { unlinkSync(p); } catch (_) { /* temp */ }
}
vu(mutVivant && mutTue, 'M mutant: a dollar text without a price (module loads) -> B red');
const mD = APP.replace('id="bcLikeBtn" aria-label="Heart this block"', 'id="bcLikeBtn" aria-label="Heart this block" data-x="burns 86,000 TBLOCK"');
vu(mD !== APP && clauseD(mD) === false, 'M mutant: a typed amount back in the ♥ button -> D red');

console.log((n - rouges) + '/' + n + (rouges ? ' — RED' : ' — green'));
process.exit(rouges ? 1 : 0);
