/* test-games-tblock-378-20261112.mjs — ui-378 (Phil 2026-11-12, pasted from the Games tab: a "Trade UNIT" button and the line
 * "This week's UNIT pot: 0.0000 UNIT … Hold at least $10 of UNIT …"). Phil wants TBLOCK on screen, not UNIT.
 * AFFIRMS, on THE REAL CODE OF app.html (the HTML of #tirCarte, and peindrePotUnit / peindreReclamerPotUnit cut out and run):
 *   A. #tirCarte has no "Trade UNIT" button and no #jourUnit; #jourTblock is a link to https://basestonk.io/tokens/<the REAL TBLOCK of
 *      tokenomics.js>, the SAME href as #payerTblockAchat (Pay with), new tab, noopener; it names TBLOCK and never UNIT; no handler is left
 *      on #jourUnit (a `$('#jourUnit').addEventListener` on a missing element would throw at load).
 *   B. the UNIT pot line (#potJourUnit): with the pot EXACTLY as prod served it on 2026-11-12 (GET /api/tirage, x-ms-monitor: 1: every
 *      amount "0"; on chain UNIT.balanceOf(TicketPot UNIT) = 0 the same day) the line is hidden and nothing is written in it; hidden too
 *      when the week is not read, or an amount is unreadable; shown, with its UNIT amount, when this week's pot holds UNIT, when it is
 *      closed with a frozen pot, or when yesterday's closed pot still has UNIT left to claim.
 *   C. the UNIT eligibility line (#potEligUnit) follows the pot line: a pot at 0 shows no "Your UNIT at the end of …" either.
 *   D. mutants (in memory): each must turn the test red.
 * Run on another file: node test-games-tblock-378-20261112.mjs <path/to/app.html>
 * DOES NOT PROVE: pixels (checked in the browser), the BaseStonk page itself, a real claim. */
import fs from 'node:fs';
import { strict as assert } from 'node:assert';
import * as P from './ticketpot-plan.js';
import { TBLOCK } from './tokenomics.js';

const CHEMIN = process.argv[2] || new URL('./app.html', import.meta.url);
const APP = fs.readFileSync(CHEMIN, 'utf8').replace(/\r\n/g, '\n'); /* LF read: the mutant anchors below carry a newline (test-tests-portables) */
const bas = (x) => String(x || '').toLowerCase();
const LIEN = 'https://basestonk.io/tokens/' + bas(TBLOCK);
const POT_UNIT = '0x4afbcb853fd71432351c75f6add0ee6307edcb4f'; /* ticketpot-unit-deploiement.js adresse */
const A = '0x' + 'a1'.repeat(20);
/* GET https://tokenizedblock.space/api/tirage (x-ms-monitor: 1), 2026-11-12 13:38Z, .ticketpotUnit — the fields peindrePotUnit reads */
const SERVI_20261112 = { contrat: POT_UNIT, bloc: 53171096, jeton: 'UNIT', decimales: 18,
  veille: { jourId: 'J2026-11-11', day: 20768, ferme: false, enPause: false, potAtClose: '0', reste: '0' },
  semaine: { id: 'S4', jourId: 'J2026-11-15', day: 20772, ferme: false, enPause: false, potAtClose: '0', reste: '0', aujourdhui: false },
  signes: [] };
const E18 = 10n ** 18n;
const avec = (f) => { const t = JSON.parse(JSON.stringify(SERVI_20261112)); f(t); return t; };

function monter(app, rep) {
  const a = app.indexOf('/* ══ LE POT UNIT (2026-10-27'), b = app.indexOf("$('#jourReclamerPotUnit').addEventListener");
  if (a < 0 || b < a) throw new Error('cut not found');
  const el = {}; const $ = (s) => (el[s] = el[s] || { hidden: true, textContent: '', disabled: false });
  const deps = { $, montantPotTexte: P.montantTexte, reclamablePot: P.claimableUntil,
    fetch: async (u) => ({ json: async () => rep(u) }), AbortSignal: { timeout: () => null },
    dejaReclamePot: async () => false, planClaimPot: () => ({ etat: 'PRET', appels: [] }),
    envoyerAppels: async () => ({ etat: 'CONFIRME', hash: '0x' + 'ab'.repeat(32) }), phraseNonConfirme: () => 'no' };
  const noms = Object.keys(deps);
  const api = new Function(...noms, 'let compte = ' + JSON.stringify(A) + ';\n' + app.slice(a, b) + '\nreturn { peindrePotUnit };')(...noms.map((k) => deps[k]));
  return { api, el };
}
const repElig = () => ({ ok: true, jeton: 'UNIT', contrat: POT_UNIT, parts: [], eligibilite: { parWallet: { [A]: { ok: false, usd: 0, pourquoi: 'under $10' } } } });
async function peindre(app, tp, c = A) {
  const m = monter(app, repElig);
  m.api.peindrePotUnit({ ticketpotUnit: tp }, c);
  await new Promise((r) => setTimeout(r, 20));
  return { ligne: m.el['#potJourUnit'], elig: m.el['#potEligUnit'] };
}

async function verifier(app) {
  const e = [];
  const v = (c, m) => { if (!c) e.push(m); };
  /* A. the HTML */
  const c0 = app.indexOf('id="tirCarte"'), c1 = app.indexOf('id="brainJeuCarte"');
  const carte = c0 > 0 && c1 > c0 ? app.slice(c0, c1).replace(/<!--[\s\S]*?-->/g, '') : '';
  v(carte.length > 0, 'A: #tirCarte found');
  v(!/id="jourUnit"/.test(carte) && !/Trade UNIT/.test(carte), 'A: no "Trade UNIT" / #jourUnit in #tirCarte');
  const lien = /<a [^>]*id="jourTblock"[^>]*>([^<]*)<\/a>/.exec(carte);
  const href = lien && /href="([^"]*)"/.exec(lien[0]);
  const hrefPay = /<a [^>]*id="payerTblockAchat"[^>]*href="([^"]*)"/.exec(app);
  v(!!href && href[1] === LIEN, 'A: #jourTblock -> ' + LIEN + ' (got ' + (href && href[1]) + ')');
  v(!!href && !!hrefPay && href[1] === hrefPay[1], 'A: same href as #payerTblockAchat (' + (hrefPay && hrefPay[1]) + ')');
  v(!!lien && /target="_blank"/.test(lien[0]) && /rel="noopener"/.test(lien[0]), 'A: new tab, noopener');
  v(!!lien && /\bTBLOCK\b/.test(lien[1]) && !/\bUNIT\b/.test(lien[1]) && !/\b[vV]\d+\b/.test(lien[1]), 'A: names TBLOCK, no UNIT, no version word ("' + (lien && lien[1]) + '")');
  const visibles = [...carte.matchAll(/<(button|a)\b[^>]*>[\s\S]*?<\/\1>/g)].map((m) => m[0]).filter((x) => !/\bhidden\b/.test(x.split('>')[0]));
  v(!visibles.some((x) => /\bUNIT\b/.test(x.replace(/<[^>]*>/g, ''))), 'A: no visible button/link of #tirCarte says UNIT');
  v(!/\$\('#jourUnit'\)/.test(app), 'A: no code left on #jourUnit');
  /* B. the pot line */
  const z = await peindre(app, SERVI_20261112);
  v(z.ligne.hidden === true && z.ligne.textContent === '', 'B: pot served at 0 (prod 2026-11-12): line hidden, nothing written ("' + z.ligne.textContent + '")');
  const nonLu = await peindre(app, avec((t) => { delete t.semaine; }));
  v(nonLu.ligne.hidden === true, 'B: week not read: no line');
  const illisible = await peindre(app, avec((t) => { t.semaine.reste = 'x'; }));
  v(illisible.ligne.hidden === true, 'B: unreadable amount: no line');
  const sem = await peindre(app, avec((t) => { t.semaine.reste = (3n * E18).toString(); }));
  v(sem.ligne.hidden === false && /This week's UNIT pot: 3\.0000 UNIT/.test(sem.ligne.textContent), 'B: week holds 3 UNIT: line shown ("' + sem.ligne.textContent.slice(0, 80) + '")');
  const gel = await peindre(app, avec((t) => { t.semaine.ferme = true; t.semaine.potAtClose = (2n * E18).toString(); }));
  v(gel.ligne.hidden === false && /2\.0000 UNIT frozen/.test(gel.ligne.textContent), 'B: closed week with a frozen pot: line shown');
  const veille = await peindre(app, avec((t) => { t.veille.ferme = true; t.veille.reste = (7n * E18).toString(); }));
  v(veille.ligne.hidden === false && /Pot of 2026-11-11: 7\.0000 UNIT left to claim\./.test(veille.ligne.textContent), 'B: yesterday closed with 7 UNIT left: line shown');
  const veilleOuverte = await peindre(app, avec((t) => { t.veille.reste = (7n * E18).toString(); }));
  v(veilleOuverte.ligne.hidden === true, 'B: yesterday NOT closed (its amount is not shown by the line): no line');
  /* C. the eligibility line: a CLOSED day at 0 makes the page fetch the parts (and their eligibility) */
  const zf = await peindre(app, avec((t) => { t.veille.ferme = true; }));
  v(zf.ligne.hidden === true && zf.elig.hidden === true, 'C: closed day, pot 0: neither the pot line nor "Your UNIT at the end of …" (' + JSON.stringify(zf.elig.textContent) + ')');
  const zp = await peindre(app, avec((t) => { t.veille.ferme = true; t.veille.reste = '5'; }));
  v(zp.elig.hidden === false && /^Your UNIT at the end of 2026-11-11: \$0\.00 of UNIT/.test(zp.elig.textContent), 'C: closed day with UNIT left: the eligibility line is still said');
  return e;
}

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const e0 = await verifier(APP);
vu(e0.length === 0, 'A/B/C: ' + (e0.join(' | ') || 'all green'));
const MUT = [
  ['the line shown whenever a pot is served', '  if (p) p.hidden = !tient;\n', '  if (p) p.hidden = !tp;\n'],
  ['a 0 amount counted as held', "return BigInt(String(x)) > 0n;", "return BigInt(String(x)) >= 0n;"],
  ['yesterday counted without being closed', '(!!v && v.ferme === true && pos(v.reste))', '(!!v && pos(v.reste))'],
  ['eligibility line not gated', '    if (pe && ph && pe.hidden && tient) {', '    if (pe && ph && pe.hidden) {'],
  ['the link points at UNIT', 'id="jourTblock" href="https://basestonk.io/tokens/0xb200000000000000000000ba9bf8330307f8830e"', 'id="jourTblock" href="https://basestonk.io/tokens/0xb2000000000000000000007afa7ed748b0874f27"'],
  ['the Trade UNIT button back', '<a class="bouton sec" id="jourTblock"', '<button type="button" class="bouton sec" id="jourUnit">Trade UNIT</button><a class="bouton sec" id="jourTblock"'],
];
let tues = 0;
for (const [nom, de, vers] of MUT) {
  vu(APP.split(de).length === 2, 'mutant "' + nom + '": unique anchor');
  let e; try { e = await verifier(APP.replace(de, () => vers)); } catch (err) { e = ['thrown: ' + err.message]; }
  vu(e.length > 0, 'MUTANT "' + nom + '" turns red');
  console.log('  mutant killed: ' + nom + ' -> ' + e[0]);
  tues += 1;
}
console.log('ok games-tblock-378 - ' + n + ' assertions, ' + tues + '/' + MUT.length + ' mutants killed; DOES NOT PROVE pixels, the BaseStonk page, a real claim');
