/* test-unit-tblock-374-20261112.mjs — game374 (Phil 2026-11-12: "retire le UNIT pour du TBLOCK avec le buy qui mène au site basestonk").
 * THE REAL CODE OF app.html (the Pay with block, run by payer-avec-harnais-20261024.mjs), fed the recorded /api/misables list of 2026-10-25
 * PLUS the UNIT line exactly as prod served it on 2026-11-12 (GET /api/misables, x-ms-monitor: 1: UNIT, route unit-v4-eth-cl, misable at
 * 0.50 only, SANS_DEVIS at 5 and 10 USDC).
 *   A. no wallet: the greyed list (#payerListe) has no UNIT line; the "not deep enough" count does not count UNIT;
 *   B. a wallet that HOLDS UNIT (and NVDAc): the Pay with menu (#payerJeton) offers NVDAc, never UNIT; the greyed list has no UNIT;
 *   C. the TBLOCK line under the list: N TBLOCK for the size shown at the pool price the page already reads (tbPilule), "not a way to pay
 *      here", and without a price "price not read yet" — never an invented number;
 *   D. the HTML: #payerTblock sits inside #payerTous, its link is https://basestonk.io/tokens/<the REAL TBLOCK of tokenomics.js> (fetched on
 *      2026-11-12: title "TokenizedBlock ($TBLOCK) … | BaseStonk"; a made-up address answers the generic home title), new tab, noopener;
 *      no version words (v2, V8) in the new text;
 *   E. mutants (in memory): each must turn the test red.
 * DOES NOT PROVE: pixels, the BaseStonk page itself at run time (no network here), a real wallet. */
import { strict as assert } from 'node:assert';
import * as MIS from './misables.js';
import { TBLOCK, TBLOCK_TEST_ANCIEN } from './tokenomics.js';
import { UNIT, ROUTE_UNIT } from './payer-unit.js';
import { lireApp, chaineFactice, lignesServies, walletFactice, charger, tempsRapide, MESURE_20261025 } from './payer-avec-harnais-20261024.mjs';

const remettre = tempsRapide();
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const bas = (x) => String(x || '').toLowerCase();
const APP = lireApp();
const JOUEUR = '0x' + 'a1'.repeat(20);
const LIGNES = await lignesServies(MESURE_20261025);
/* the UNIT line as served by prod on 2026-11-12 (ecartBps not in that print: 50 here, under the 1 % rule, so the OLD code offers it) */
const LIGNE_UNIT = { jeton: UNIT, symbole: 'UNIT', famille: 'unit', natif: false, route: ROUTE_UNIT, tailles: [
  { usdc: '500000', misable: true, code: 'MISABLE', montantIn: '24636251802345198493515', ecartBps: 50 },
  { usdc: '5000000', misable: false, code: 'SANS_DEVIS', montantIn: null },
  { usdc: '10000000', misable: false, code: 'SANS_DEVIS', montantIn: null }] };
vu(ROUTE_UNIT === 'unit-v4-eth-cl' && bas(UNIT) === '0xb2000000000000000000007afa7ed748b0874f27', 'UNIT and its route = what prod serves');
vu(bas(TBLOCK) === '0xb200000000000000000000ba9bf8330307f8830e' && bas(TBLOCK) !== bas(TBLOCK_TEST_ANCIEN) && bas(TBLOCK) !== bas(UNIT), 'TBLOCK = the real token of tokenomics.js (not the old test token, not UNIT)');
const NV = LIGNES.find((l) => l.symbole === 'NVDAc');
const LISTEES = LIGNES.filter((l) => l.tailles.some((t) => t.misable));
vu(!!NV && NV.tailles[0].misable, 'NVDAc bettable in the recording');
const PRIX = 0.0000053721063154125905; /* /api/tblock/hold priceNow, prod 2026-11-12 */
const tbAttendu = (usdc) => 'about ' + Number((usdc / PRIX).toPrecision(3)).toLocaleString('en-US') + ' TBLOCK for ' + usdc.toFixed(2) + ' USDC at its pool price · not a way to pay here';

function lireListe(ch) {
  const h = String(ch.ecran.el('payerListe').innerHTML || '');
  return [...h.matchAll(/<li data-token="(0x[0-9a-f]{40})"[^>]*><b>([^<]*)<\/b>/g)].map((m) => ({ jeton: m[1], sym: m[2] }));
}
async function sansWallet(t, ctx = {}) {
  const ch = charger(t, { lignes: [...LIGNES, LIGNE_UNIT], ctx });
  await ch.api.peindrePayerAvec();
  return { liste: lireListe(ch), note: ch.ecran.el('payerNote').textContent, tb: ch.ecran.el('payerTblockCout').textContent, tous: ch.ecran.el('payerTous') };
}
async function avecUnit(t, ctx = {}) {
  const soldes = new Map([[NV.jeton, 6000000n], [bas(UNIT), 10n ** 26n]]);
  const ch0 = chaineFactice({ mesure: MESURE_20261025, joueur: JOUEUR, soldes });
  const rpc = async (m, p) => (m === 'eth_call' && bas(p[0].to) === bas(UNIT) && bas(p[0].data) === '0x313ce567' ? '0x' + (18).toString(16).padStart(64, '0') : ch0.rpc(m, p));
  const w = walletFactice({ mode: 'lot', joueur: JOUEUR });
  const ch = charger(t, { compte: JOUEUR, rpc, eth: w.eth, lignes: [...LIGNES, LIGNE_UNIT], rollsCfg: undefined, ctx });
  await ch.api.peindrePayerAvec();
  return { opts: ch.ecran.el('payerJeton').options.map((o) => ({ v: bas(o.value), t: o.textContent })), liste: lireListe(ch) };
}
async function verifier(t) {
  const e = [];
  const v = (c, m) => { if (!c) e.push(m); };
  /* A */
  const a = await sansWallet(t, { tbPilule: { usd: PRIX, t: Date.now(), enVol: false } });
  v(a.liste.length > 0 && !a.liste.some((x) => x.jeton === bas(UNIT) || x.sym === 'UNIT'), 'A: no UNIT line in the greyed list (' + a.liste.map((x) => x.sym).join(',') + ')');
  v(a.liste.length === LISTEES.length, 'A: the greyed list = the ' + LISTEES.length + ' recorded bettable tokens, nothing else (' + a.liste.length + ')');
  const autres = LIGNES.length - LISTEES.length;
  v(new RegExp('^' + autres + ' other tokens are not deep enough to bet\\.$').test(a.note), 'A: the count ignores UNIT: "' + a.note + '" (expected ' + autres + ')');
  /* C */
  v(a.tb === tbAttendu(0.5), 'C: TBLOCK line = "' + tbAttendu(0.5) + '" (got "' + a.tb + '")');
  const c0 = await sansWallet(t, {});
  v(c0.tb === 'price not read yet · not a way to pay here', 'C: no price read = "price not read yet" (got "' + c0.tb + '")');
  const c1 = await sansWallet(t, { tbPilule: { usd: null, t: 0, enVol: false } });
  v(c1.tb === 'price not read yet · not a way to pay here', 'C: price null = "price not read yet" (got "' + c1.tb + '")');
  /* B */
  const b = await avecUnit(t, { tbPilule: { usd: PRIX, t: Date.now(), enVol: false } });
  v(b.opts.some((o) => o.v === bas(NV.jeton)), 'B: NVDAc (held) is in the menu (' + b.opts.map((o) => o.t.split(' ')[0]).join(',') + ')');
  v(!b.opts.some((o) => o.v === bas(UNIT) || /^UNIT\b/.test(o.t)), 'B: UNIT (held, worth more than NVDAc) is NOT in the menu (' + b.opts.map((o) => o.t.split(' ')[0]).join(',') + ')');
  v(!b.liste.some((x) => x.jeton === bas(UNIT)), 'B: no UNIT in the greyed list either');
  return e;
}

const e0 = await verifier(APP);
vu(e0.length === 0, 'A/B/C on app.html: ' + (e0.join(' | ') || 'all green'));

/* D. the HTML */
const iT = APP.indexOf('<details class="payerTous" id="payerTous"'), fT = APP.indexOf('</details>', iT);
const zone = iT >= 0 && fT > iT ? APP.slice(iT, fT) : '';
const pT = /<p class="note payerTblock" id="payerTblock">([\s\S]*?)<\/p>/.exec(zone);
vu(!!pT, 'D: #payerTblock is inside #payerTous');
const lien = pT && /<a [^>]*id="payerTblockAchat"[^>]*>([^<]*)<\/a>/.exec(pT[1]);
const href = lien && /href="([^"]*)"/.exec(lien[0]);
vu(!!href && href[1] === 'https://basestonk.io/tokens/' + bas(TBLOCK), 'D: the link is https://basestonk.io/tokens/<real TBLOCK> (' + (href && href[1]) + ')');
vu(!!lien && /target="_blank"/.test(lien[0]) && /rel="noopener"/.test(lien[0]) && /^Buy on BaseStonk/.test(lien[1]), 'D: "Buy on BaseStonk", new tab, noopener');
const visible = pT ? pT[1].replace(/<[^>]*>/g, ' ') : '';
vu(!!pT && /\bTBLOCK\b/.test(visible) && !/\bUNIT\b/.test(visible) && !/\b[vV]\d+\b/.test(visible), 'D: TBLOCK named, no UNIT, no version word: "' + visible.replace(/\s+/g, ' ').trim() + '"');

/* E. mutants */
const MUT = [
  ['UNIT offered again', 'const PAYER_UNIT_OFFERT = false;', 'const PAYER_UNIT_OFFERT = true;'],
  ['UNIT counted as "not deep enough"', '  const n = payer.lignes ? payerServies().length - payerListees().length : 0;', '  const n = payer.lignes ? payer.lignes.length - payerListees().length : 0;'],
  ['TBLOCK price invented when not read', "  let u = null; try { u = tbPilule && Number.isFinite(tbPilule.usd) && tbPilule.usd > 0 ? tbPilule.usd : null; } catch (_) { u = null; }",
    "  let u = 0.00001; try { u = tbPilule && Number.isFinite(tbPilule.usd) && tbPilule.usd > 0 ? tbPilule.usd : 0.00001; } catch (_) { u = 0.00001; }"],
  ['TBLOCK line never painted', '  if (tbC) tbC.textContent = tbTxt;', ''],
];
let tues = 0;
for (const [nom, de, vers] of MUT) {
  vu(APP.split(de).length === 2, 'mutant "' + nom + '": unique anchor');
  let e; try { e = await verifier(APP.replace(de, () => vers)); } catch (err) { e = ['thrown: ' + err.message]; }
  vu(e.length > 0, 'MUTANT "' + nom + '" turns red (' + e[0] + ')');
  tues += 1;
}
remettre();
console.log('ok unit-tblock-374 - ' + n + ' assertions, ' + tues + '/' + MUT.length + ' mutants killed; DOES NOT PROVE pixels, the BaseStonk page at run time, a real wallet');
