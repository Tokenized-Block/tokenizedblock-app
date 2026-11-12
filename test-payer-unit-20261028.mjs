/* test-payer-unit-20261028.mjs — UNIT, UNE option de plus dans « Pay with » (Phil 2026-10-28).
 * A. LE MODULE (payer-unit.js, ou PAYER_UNIT_MODULE = une copie mutee) sur une chaine FACTICE : la regle a la taille REELLE (aucun seuil
 *    de 10 000 USDC), devis non lu = non offert, > 1 % = non offert avec la raison mesuree, le plan (Permit2 exact, vente exact-in de UNIT,
 *    puis le chemin ETH natif de misables.js, puis les appels du jeu), lot atomique EXIGE, peremption.
 * B. LE VRAI CODE DE app.html (harnais payer-avec) : UNIT au MEME rang que les autres (tri par valeur tenue), jamais epingle, meme libelle ;
 *    un Spin paye en UNIT part en UN lot atomique ; un wallet qui ne groupe pas : RIEN n est envoye.
 * C. LES MUTANTS (copies, en memoire ou dans le dossier temporaire) : chacun doit rougir.
 * NE PROUVE PAS : l execution du swap (un B20 ne s execute pas hors du noeud Base : aucun fork local), un vrai wallet, les pixels. */
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as MIS from './misables.js';
import * as Slots from './slots-plan.js';
import * as BR from './blockrolls-plan.js';
import { USDC_BASE } from './frais-creation.js';
import { FACTORY_AERODROME_CL, ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { encodeV4Swap, paramsAction, ACTIONS_V4, SANS_MINHOP, isqrt, encodeApprove, encodePermit2Approve } from './pool.js';
import { PERMIT2, V4_ADRESSES } from './lancer-pool.js';
import { ROUTEUR, QUOTEUR } from './echange.js';
import { selecteur } from './keccak.js';
import { lireApp, chaineFactice, lignesServies, walletFactice, appelsEnvoyes, charger, choisir, tempsRapide, SLOTS, MESURE_20261025 } from './payer-avec-harnais-20261024.mjs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const bas = (x) => String(x || '').toLowerCase();
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const UNIT_ATTENDU = '0xb2000000000000000000007afa7ed748b0874f27';
const EURC = '0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42';
const JOUEUR = '0x' + 'ab'.repeat(20);
const Q192 = 1n << 192n;
const SEL_Q_CL = selecteur(MIS.SIG.quoteExactOutputSingle), SEL_Q_V4 = selecteur('quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))');
const SEL_SLOT0_SV = selecteur('getSlot0(bytes32)');

/* ───────────── la chaine UNIT factice : ETH a `prix` USDC bruts par ETH, UNIT a `unitParEth` bruts par wei ───────────── */
function chaineUnit(o = {}) {
  const P = o.prix ?? 2376000000n, U = o.unitParEth ?? 100000000n, fEth = BigInt(o.feeEthBps ?? 5), fUnit = BigInt(o.feeUnitBps ?? 10);
  const cap = o.capEth ?? 500000000000000n, bloc = o.bloc ?? 53193712, appels = [];
  const sqrtEth = isqrt((P * Q192) / 10n ** 18n), sqrtUnit = isqrt(U * Q192);
  const CL = MIS.CANDIDATS_CL.find((c) => c.natif && c.tickSpacing === 50);
  const rpc = async (m, p = []) => {
    appels.push({ m, p });
    if (m === 'eth_blockNumber') return hex(bloc);
    if (m === 'eth_getBlockByNumber') return { number: hex(bloc), timestamp: hex(1761600000) };
    if (m !== 'eth_call') throw new Error('fake: ' + m);
    const to = bas(p[0].to), d = bas(p[0].data), sel = d.slice(0, 10), w = (i) => BigInt('0x' + d.slice(10 + 64 * i, 74 + 64 * i));
    if (to === MIS.QUOTEUR_CL && sel === SEL_Q_CL) {
      if (o.ethNonLu) throw new Error('You reached Public endpoint rate limit');
      const out = w(2);
      return '0x' + mot(((out * 10n ** 18n * (10000n + fEth)) + P * 10000n - 1n) / (P * 10000n)) + mot(0).repeat(3);
    }
    if (to === bas(CL.pool) && sel === selecteur('slot0()')) return '0x' + mot(sqrtEth) + mot(0).repeat(6);
    if (to === bas(CL.pool) && sel === selecteur('factory()')) return '0x' + mot(BigInt(FACTORY_AERODROME_CL));
    if (to === MIS.USDC && sel === selecteur('balanceOf(address)')) return '0x' + mot(o.usdcPoolEth ?? 1443047682705n);
    if (to === bas(V4_ADRESSES[8453].stateView) && sel === SEL_SLOT0_SV) { if (o.slot0NonLu) throw new Error('timeout'); return '0x' + mot(sqrtUnit) + mot(0).repeat(3); }
    if (to === bas(QUOTEUR[8453]) && sel === SEL_Q_V4) {
      if (o.unitNonLu) throw new Error('You reached Public endpoint rate limit');
      if (o.unitVide) return '0x';
      const zf = w(6), u = w(7);
      if (zf !== 0n) throw new Error('execution reverted: wrong direction');
      const q = (u * (10000n - fUnit)) / (U * 10000n);
      if (q > cap) { const e = new Error('execution reverted'); e.data = '0x'; throw e; }
      return '0x' + mot(q) + mot(90000);
    }
    return '0x' + mot(0);
  };
  return { rpc, appels, sqrtEth, sqrtUnit, P, U, bloc };
}

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };

/* ═════════════════════════════ A. LE MODULE ═════════════════════════════ */
async function moduleA(PU) {
  const echecs = [];
  const v = (c, m) => { if (!c) echecs.push(m); };
  v(PU.UNIT === UNIT_ATTENDU, 'UNIT = l adresse exacte');
  v(PU.UNIT_POOL_ID === BR.UNIT_POOL_ID, 'pool UNIT = celle de BlockRolls (ETH/UNIT fee 0 tick 200 hook 7030)');
  v(!MIS.CANDIDATS_CL.some((c) => bas(c.jeton) === EURC) && PU.UNIT !== EURC, 'EURC reste banni');
  /* A1 la regle, pure */
  const el = (e, x = {}) => PU.eligibiliteUnit({ usdc: '500000', ok: true, montantIn: 1n, ecartBps: e, ...x });
  v(el(16).ok === true && el(100).ok === true, '<= 1 % offert');
  v(el(101).ok === false && el(101).code === 'ECART' && /1\.01%/.test(el(101).raison), '> 1 % : ECART, la perte mesuree dite');
  v(el(16, { nonLu: true, ok: false }).code === 'NON_MESURE' && PU.eligibiliteUnit(null).code === 'NON_MESURE', 'non lu = NON_MESURE');
  v(el(null).ok === false && el(16, { ok: false }).code === 'SANS_DEVIS', 'sans devis / sans ecart = non offert');
  /* A2 la ligne servie a la taille REELLE, pool UNIT mince (aucun USDC, pas de profondeur de 10 000) */
  const ch = chaineUnit();
  const cot = await PU.coterUnitTailles({ rpc: ch.rpc });
  const l = PU.ligneUnit(cot);
  const t0 = l.tailles[0];
  v(cot.etat === 'PRET' && t0.usdc === '500000' && t0.misable === true && t0.code === 'MISABLE', 'UNIT offert a 0,50 USDC sans aucune profondeur de 10 000 USDC (' + t0.code + ')');
  v(l.tailles[1].misable === false && l.tailles[1].code === 'SANS_DEVIS' && l.tailles[2].code === 'SANS_DEVIS', 'au-dela de ce que la pool remplit : SANS_DEVIS (mesure)');
  /* oracle de la perte : en flottants, independant de perteUnitBps */
  const d0 = cot.devis[0];
  const prixEth = Number(ch.P) / 1e6, unitEth = Number(ch.U);
  const cede = Number(d0.montantIn) / unitEth / 1e18, revient = (Number(d0.ethSortie) - Number(d0.montantInEth)) / 1e18, ideal = 0.5 / prixEth;
  const oracle = Math.round(((cede - revient) / ideal - 1) * 10000);
  v(Math.abs(oracle - d0.ecartBps) <= 1 && d0.ecartBps >= 14 && d0.ecartBps <= 17, 'perte = oracle (' + d0.ecartBps + ' vs ' + oracle + ' bps ; frais 5 + 10 bps)');
  v(BigInt(d0.ethSortie) >= (BigInt(d0.maxInEth) * 10050n) / 10000n, 'la jambe 1 rend au moins maxInEth + 0,5 %');
  /* A3 les devis sont a la taille REELLE : aucune sortie USDC > 10 USDC demandee au quoter CL */
  const outs = ch.appels.filter((a) => a.m === 'eth_call' && bas(a.p[0].to) === MIS.QUOTEUR_CL).map((a) => BigInt('0x' + a.p[0].data.slice(10 + 128, 10 + 192)));
  v(outs.length === 3 && outs.every((x) => MIS.TAILLES_USDC.includes(x)), 'les devis CL sont aux tailles reelles : ' + outs.join(','));
  /* A4 non lu : jamais offert */
  for (const [nom, o] of [['v4 rate limit', { unitNonLu: true }], ['v4 0x', { unitVide: true }], ['slot0 UNIT', { slot0NonLu: true }], ['jambe ETH', { ethNonLu: true }]]) {
    const c2 = await PU.coterUnitTailles({ rpc: chaineUnit(o).rpc });
    const l2 = PU.ligneUnit(c2);
    v(l2.misable === false && l2.tailles.every((t) => t.misable === false) && l2.tailles[0].code === 'NON_MESURE', 'non lu (' + nom + ') : NON_MESURE, non offert (' + l2.tailles[0].code + ')');
  }
  /* A5 > 1 % : hook a 1,20 % */
  const lc = PU.ligneUnit(await PU.coterUnitTailles({ rpc: chaineUnit({ feeUnitBps: 120 }).rpc }));
  v(lc.tailles[0].misable === false && lc.tailles[0].code === 'ECART' && lc.tailles[0].ecartBps > 100, 'perte > 1 % : ECART (' + lc.tailles[0].ecartBps + ' bps)');
  /* A6 le plan */
  const jeu = { genre: 'spins', contrat: SLOTS, n: 1, spinPrice: 500000n };
  const besoin = 500000n, vise = MIS.usdcAViser({ besoin });
  const dv = await PU.coterUnit({ rpc: chaineUnit().rpc, usdcSortie: vise });
  const now = 1761600000;
  const plan = PU.planPayerEnUnit({ devis: dv, compte: JOUEUR, jeu, blocActuel: dv.bloc, maintenant: now });
  const jeuUsdc = Slots.planSpins({ contrat: SLOTS, usdc: USDC_BASE, n: 1, spinPrice: 500000n }).appels;
  if (plan.etat !== 'PRET') { echecs.push('plan PRET : ' + plan.pourquoi); return echecs; }
  const a = plan.appels, u = BigInt(dv.montantIn), mx = BigInt(dv.maxInEth);
  v(a.length === 3 + 1 + jeuUsdc.length, 'appels : 2 Permit2 + vente UNIT + swap ETH + le jeu (' + a.length + ')');
  v(bas(a[0].to) === UNIT_ATTENDU && bas(a[0].data) === bas(encodeApprove(PERMIT2, u)), 'UNIT -> Permit2 : montant EXACT');
  v(bas(a[1].to) === bas(PERMIT2) && bas(a[1].data) === bas(encodePermit2Approve(UNIT_ATTENDU, ROUTEUR[8453], u, BigInt(now) + 3600n)), 'Permit2 -> routeur : exact, 1 h');
  const v4 = encodeV4Swap({ cle: PU.CLE_UNIT, zeroForOne: false, montant: u, sortieMin: mx, deadline: BigInt(now + MIS.DELAI_S), forme: SANS_MINHOP,
    actions: [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(UNIT_ATTENDU, u) }, { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(MIS.ETH, mx) }] });
  v(bas(a[2].to) === bas(ROUTEUR[8453]) && bas(a[2].data) === bas(v4) && BigInt(a[2].value) === 0n, 'vente exact-in de UNIT, minimum = maxInEth, sans valeur');
  v(bas(a[3].to) === bas(ROUTEUR_AERODROME_CL) && BigInt(a[3].value) === mx, 'jambe ETH : value = maxInEth (couverte par la jambe 1)');
  v(a.slice(-jeuUsdc.length).every((x, i) => bas(x.to) === bas(jeuUsdc[i].to) && bas(x.data) === bas(jeuUsdc[i].data)), 'les appels du jeu = ceux de SON module');
  v(plan.exigeAtomique === true && plan.resume.maxEntree === u && plan.resume.symbole === 'UNIT', 'lot atomique EXIGE ; resume = la quantite exacte vendue');
  /* A7 les refus */
  v(PU.planPayerEnUnit({ devis: dv, compte: JOUEUR, jeu, blocActuel: dv.bloc + 31, maintenant: now }).code === 'DEVIS_PERIME', 'devis de 31 blocs : refuse');
  v(PU.planPayerEnUnit({ devis: { ...dv, eth: { ...dv.eth, bloc: dv.bloc - 1 } }, compte: JOUEUR, jeu, blocActuel: dv.bloc, maintenant: now }).etat === 'REFUSE', 'jambes a deux blocs : refuse');
  v(PU.planPayerEnUnit({ devis: { ...dv, ethSortie: mx - 1n }, compte: JOUEUR, jeu, blocActuel: dv.bloc, maintenant: now }).etat === 'REFUSE', 'jambe 1 sous maxInEth : refuse');
  v(PU.planPayerEnUnit({ devis: { ...dv, nonLu: true, ok: false }, compte: JOUEUR, jeu, blocActuel: dv.bloc, maintenant: now }).code === 'NON_MESURE', 'devis non lu : refuse NON_MESURE');
  v(PU.planPayerEnUnit({ devis: { ...dv, ecartBps: 101 }, compte: JOUEUR, jeu, blocActuel: dv.bloc, maintenant: now }).code === 'ECART', 'devis a 1,01 % : refuse ECART');
  const dvC = await PU.coterUnit({ rpc: chaineUnit({ feeUnitBps: 120 }).rpc, usdcSortie: vise });
  v(PU.planPayerEnUnit({ devis: dvC, compte: JOUEUR, jeu, blocActuel: dvC.bloc, maintenant: now }).code === 'ECART', 'chaine a 1,2 % : refuse ECART');
  v(PU.planPayerEnUnit({ devis: { ...dv, jeton: EURC }, compte: JOUEUR, jeu, blocActuel: dv.bloc, maintenant: now }).etat === 'REFUSE', 'un autre jeton (EURC) : refuse');
  /* A8 le tri du serveur : la regle de listeMisables, rien de special pour UNIT */
  const autres = [{ jeton: '0x' + '11'.repeat(20), symbole: 'ZZZc', misable: true, tailles: [{ misable: true, ecartBps: 1 }] }, { jeton: '0x' + '22'.repeat(20), symbole: 'AAAc', misable: true, tailles: [{ misable: true, ecartBps: 1 }] }];
  const liste = MIS.listeMisables([...autres, l]).map((x) => x.symbole);
  v(JSON.stringify(liste) === JSON.stringify(['AAAc', 'UNIT', 'ZZZc']), 'tri serveur : misables puis alphabetique (' + liste.join(',') + ')');
  return echecs;
}

/* ═════════════════════════════ B. LE VRAI CODE DE app.html ═════════════════════════════ */
const remettre = tempsRapide();
const LIGNES0 = await lignesServies(MESURE_20261025);
const NV = LIGNES0.find((l) => l.symbole === 'NVDAc');
vu(!!NV && NV.tailles[0].misable, 'NVDAc misable dans la liste enregistree');
function rpcCombine(ch0, cu) {
  return async (m, p) => {
    if (m === 'eth_call') {
      const to = bas(p[0].to);
      if (to === bas(V4_ADRESSES[8453].stateView) || to === bas(QUOTEUR[8453])) return cu.rpc(m, p);
      if (to === UNIT_ATTENDU && bas(p[0].data) === '0x313ce567') return '0x' + mot(18);
    }
    return ch0.rpc(m, p);
  };
}
async function scenario(t, { soldeUnit, mode = 'lot', choix = null, spin = false, unit = null }) {
  const PU = unit || (await import('./payer-unit.js'));
  const soldes = new Map([[NV.jeton, 6000000n], [UNIT_ATTENDU, soldeUnit]]);
  const ch0 = chaineFactice({ mesure: MESURE_20261025, joueur: JOUEUR, soldes }), cu = chaineUnit({ bloc: MESURE_20261025.bloc });
  const rpc = rpcCombine(ch0, cu);
  const lu = PU.ligneUnit(await PU.coterUnitTailles({ rpc, bloc: MESURE_20261025.bloc }));
  const lignes = MIS.listeMisables([...LIGNES0, JSON.parse(JSON.stringify(lu, (_, x) => (typeof x === 'bigint' ? x.toString() : x)))]);
  const w = walletFactice({ mode, joueur: JOUEUR });
  const ch = charger(t, { compte: JOUEUR, rpc, eth: w.eth, lignes, rollsCfg: null, unit });
  await ch.api.peindrePayerAvec();
  const opts = ch.ecran.el('payerJeton').options.map((o) => ({ v: o.value, t: o.textContent, off: o.disabled }));
  let choisi = null, jete = null;
  if (choix) choisi = choisir(ch, choix);
  if (spin) { try { await ch.api.slotsAgir('spin'); } catch (e) { jete = String((e && e.stack) || e); } }
  return { opts, choisi, jete, envoyes: appelsEnvoyes(w.requetes), ecrits: ch.ecran.ecrits, ligneUnit: lu };
}
const VALEUR_BASSE = 10n ** 23n, VALEUR_HAUTE = 10n ** 26n; /* ~ 2,4 USDC et ~ 2 400 USDC de UNIT ; NVDAc 6 000 000 bruts */
async function clientB(t, unit = null) {
  const echecs = [];
  const v = (c, m) => { if (!c) echecs.push(m); };
  const bas1 = await scenario(t, { soldeUnit: VALEUR_BASSE, unit });
  const ordre = bas1.opts.map((o) => o.v);
  v(bas1.ligneUnit.tailles[0].misable === true, 'B : la ligne UNIT est offerte a 0,50');
  v(ordre[0] === 'usdc' && ordre.indexOf(NV.jeton) >= 0 && ordre.indexOf(UNIT_ATTENDU) > ordre.indexOf(NV.jeton), 'UNIT de moindre valeur tenue : APRES NVDAc (jamais epingle) : ' + bas1.opts.map((o) => o.t.split(' ')[0]).join(','));
  const haut = await scenario(t, { soldeUnit: VALEUR_HAUTE, unit });
  const o2 = haut.opts.map((o) => o.v);
  v(o2[0] === 'usdc' && o2.indexOf(UNIT_ATTENDU) >= 0 && o2.indexOf(UNIT_ATTENDU) < o2.indexOf(NV.jeton), 'UNIT de plus grande valeur tenue : avant NVDAc (meme regle)');
  const ou = bas1.opts.find((o) => o.v === UNIT_ATTENDU), onv = bas1.opts.find((o) => o.v === NV.jeton);
  const forme = /^[A-Za-z0-9.$-]+ — about [0-9.]+ for 0\.50 USDC · [0-9.]+ %$/;
  v(!!ou && forme.test(ou.t) && !!onv && forme.test(onv.t) && !/!|best|promo|new/i.test(ou.t), 'meme libelle que les autres, aucun texte promo : « ' + (ou && ou.t) + ' »');
  /* un Spin paye en UNIT, wallet qui groupe : UN lot atomique */
  const lot = await scenario(t, { soldeUnit: VALEUR_HAUTE, choix: UNIT_ATTENDU, spin: true, unit });
  const jeuUsdc = Slots.planSpin({ contrat: SLOTS, usdc: USDC_BASE, spinPrice: 500000n }).appels;
  const e = lot.envoyes;
  v(lot.choisi === true && !lot.jete, 'UNIT choisi, Spin lance' + (lot.jete ? ' (jete : ' + lot.jete.slice(0, 160) + ')' : ''));
  v(e.length === 4 + jeuUsdc.length && e.every((x) => x.via === 'lot' && x.atomicRequired === true), 'Spin en UNIT : un lot atomique de ' + e.length + ' appels (' + lot.ecrits.slice(-1).map((x) => x.texte).join('').slice(0, 160) + ')');
  v(e.length > 0 && e[0].to === UNIT_ATTENDU && e[2].to === bas(ROUTEUR[8453]) && e[3].to === bas(ROUTEUR_AERODROME_CL), 'ordre : UNIT->Permit2, Permit2, vente UNIT, swap ETH');
  v(e.length > 0 && e.slice(-jeuUsdc.length).every((x, i) => x.to === bas(jeuUsdc[i].to) && x.data === bas(jeuUsdc[i].data)), 'puis les appels du Spin, octet pour octet');
  /* wallet qui ne groupe pas : rien n est envoye, la raison est dite */
  const suite = await scenario(t, { soldeUnit: VALEUR_HAUTE, choix: UNIT_ATTENDU, spin: true, mode: 'suite', unit });
  v(suite.envoyes.length === 0 && suite.ecrits.some((x) => /all-or-nothing batch/.test(x.texte) && /nothing was sent/.test(x.texte)), 'sans lot atomique : 0 envoi, la raison dite');
  return echecs;
}

/* ═════════════════════════════ C. EXECUTION + MUTANTS ═════════════════════════════ */
const PU0 = await import(pathToFileURL(process.env.PAYER_UNIT_MODULE || path.join(ICI, 'payer-unit.js')).href);
const eA = await moduleA(PU0);
vu(eA.length === 0, 'A module : ' + (eA.join(' | ') || 'tout vert'));
/* game374 (Phil 2026-11-12: "retire le UNIT pour du TBLOCK"): app.html no longer OFFERS UNIT (PAYER_UNIT_OFFERT = false; proven by
 *   test-unit-tblock-374-20261112.mjs). The path stays in the code: B and the app mutants run on a copy with the flag on, so it stays proven. */
const APP_REEL = lireApp();
const APP = APP_REEL.replace('const PAYER_UNIT_OFFERT = false;', 'const PAYER_UNIT_OFFERT = true;');
vu(APP_REEL.split('const PAYER_UNIT_OFFERT = false;').length === 2 && APP !== APP_REEL, 'app.html : UNIT retire de Pay with par UN drapeau (PAYER_UNIT_OFFERT = false) ; B tourne sur la copie drapeau allume');
const eB = await clientB(APP);
vu(eB.length === 0, 'B app.html : ' + (eB.join(' | ') || 'tout vert'));

/* mutants du module : copies dans un dossier temporaire a cote des vrais modules (imports relatifs resolus par un lien de chaque import) */
/* 2026-10-31 : fins de ligne NORMALISEES avant les ancres (une copie de travail en CRLF — core.autocrlf sous Windows — rendait l ancre
 *   « ...seuilBps);\n » introuvable : « ancre unique » rouge sans aucun defaut du module). Meme correctif que le banc du lexique. */
const SRC = readFileSync(path.join(ICI, 'payer-unit.js'), 'utf8').replace(/\r\n/g, '\n');
const MUT_MODULE = [
  ['UNIT juge a 10 000 USDC de profondeur au lieu de la taille reelle', "  const s = Number(seuilBps);\n", "  const s = Number(seuilBps);\n  if (!(entier(d.usdcPool) >= 10000000000n)) return non('PEU_PROFONDE', 'pool under 10,000 USDC');\n"],
  ['UNIT cote a 10 000 USDC au lieu de la taille reelle', 'const t = await coterUnitTailles({ rpc, sorties: [usdcSortie], ...o });', 'const t = await coterUnitTailles({ rpc, sorties: [10000000000n], ...o });'],
  ['devis non lu traite comme OK', "      if (r.nonLu) { fin = { nonLu: true, erreur: r.erreur }; break; }", '      if (r.nonLu) { q = cible; break; }'],
  ['NON_MESURE oublie par la regle', "  if (d.nonLu === true) return non('NON_MESURE'", "  if (false) return non('NON_MESURE'"],
  ['UNIT offert au-dessus de 1 %', '  if (e > s) return non(', '  if (e > s + 100) return non('],
  ['lot atomique non exige', '    exigeAtomique: true, atomiquePrefere: true,', '    exigeAtomique: false, atomiquePrefere: true,'],
  ['vente sans minimum', 'montant: unitIn, sortieMin: maxInEth,', 'montant: unitIn, sortieMin: 0n,'],
];
const tmp = mkdtempSync(path.join(ICI, '.mut-unit-'));
let tues = 0;
try {
  for (const [nom, de, vers] of MUT_MODULE) {
    vu(SRC.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique');
    const f = path.join(tmp, 'payer-unit-' + tues + '.js');
    writeFileSync(f, SRC.replace(de, () => vers).replace(/from '\.\//g, "from '../"));
    const M = await import(pathToFileURL(f).href);
    let ea; try { ea = await moduleA(M); } catch (e) { ea = ['jete : ' + e.message]; }
    let eb = [];
    if (ea.length === 0) { try { eb = await clientB(APP, M); } catch (e) { eb = ['jete : ' + e.message]; } }
    vu(ea.length + eb.length > 0, 'MUTANT « ' + nom + ' » ROUGIT (' + [...ea, ...eb][0] + ')');
    tues += 1;
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

/* mutants de app.html (en memoire) */
const MUT_APP = [
  ['UNIT epingle en premier', '  tenues.sort((a, b) => { const va = valeur(a), vb = valeur(b); return va > vb ? -1 : va < vb ? 1 : 0; });',
    '  tenues.sort((a, b) => { const va = valeur(a), vb = valeur(b); return va > vb ? -1 : va < vb ? 1 : 0; }); tenues.sort((a, b) => (b.route === ROUTE_UNIT) - (a.route === ROUTE_UNIT));'],
  ['envoi a la suite permis pour UNIT', '  if (pj.plan.exigeAtomique === true) return {', '  if (false) return {'],
  ['branche UNIT retiree (chemin CL)', '  if (ligne.route === ROUTE_UNIT) return preparerPaiementUnit({ ligne, c, planUsdc, jeu, besoin });\n', ''],
];
for (const [nom, de, vers] of MUT_APP) {
  vu(APP.split(de).length === 2, 'mutant app « ' + nom + ' » : ancre unique');
  let eb; try { eb = await clientB(APP.replace(de, () => vers)); } catch (e) { eb = ['jete : ' + e.message]; }
  vu(eb.length > 0, 'MUTANT app « ' + nom + ' » ROUGIT (' + eb[0] + ')');
  tues += 1;
}
remettre();
console.log('ok payer-unit - ' + n + ' assertions, ' + tues + '/' + (MUT_MODULE.length + MUT_APP.length) + ' mutants tues ; NE PROUVE PAS l execution du swap (B20 : pas de fork local), un vrai wallet, les pixels');
