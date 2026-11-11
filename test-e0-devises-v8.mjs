/* E0 (2026-10-01) — WHAT CAN PRICE A NEW BLOCK ON BASE, CHECKED BEFORE ANYTHING IS PAID.
 *
 * HOOK_V8 admits its quotes in the constructor only, with no setter. Seven currencies the app
 * offers are refused (V8.inscrire reverts PaireNonAdmise 0x9e16f763 — proven by eth_call on a real
 * Base node). Create used to take the 0.001 ETH first and fail at Birth. This test pins:
 *   · ONE source (`hookDeLancementPour`): the admitted set equals the devises-admises.mjs census, and
 *     "refused" is only its complement — no second list exists to drift;
 *   · DIVERGENCE: over every pair Create offers on Base, the Create guard, the routing answer and the
 *     launch guard of lancer-pool.js refuse EXACTLY the same set;
 *   · the copy (fact, not promise; "can already buy" only when the routing graph says so), and the
 *     wiring in app.html: note shown at pick time, button "Pick another pair" + disabled, return
 *     before any pair is accepted -> the 0.001 ETH is never requested.
 * Live check (optional, read only): TB_LIVE=1 node test-e0-devises-v8.mjs
 * Negative witness: APP_HTML=<copy without the guard> node test-e0-devises-v8.mjs  -> red.
 */
import { readFileSync } from 'fs';
import vm from 'vm';
import { pairesProposees, qualifierPaire, refusPrixNouveauBlock, hookDeLancementPour, DEVISES_ADMISES_V8,
  copieE0Achat, COPIE_E0_SANS_ROUTE, ETH_NATIF, TBLOCK_MAINNET } from './paires.js';
import * as P from './paires.js';
import { ciblesDuCensus, census } from './devises-admises.mjs';
import { HOOK_V8 } from './tokenomics.js';
import { planLancement, PROPRIETAIRE_PERMANENT } from './lancer-pool.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
const bas = (a) => String(a).toLowerCase();
const offertes = pairesProposees(8453);
const parSym = Object.fromEntries(offertes.map((p) => [p.symbole, bas(p.adr)]));
const ADMISES = ['USDC', 'cbBTC', 'AAPLc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'MSTRc', 'NVDAc', 'SNDKc', 'SPCXc', 'TSLAc'];
const REFUSEES = ['OUSD', 'TOSHI', 'AVGOc', 'BEc', 'HIMSc', 'MUc', 'PLTRc'];
const SIX = REFUSEES.filter((s) => s !== 'TOSHI');
/* 2026-10-02 : 18 actions de l emetteur ajoutees aux paires (test-new-stocks-26-20261002.mjs). V8 ne les admet pas
 *   (lu sur fork : deviseAdmise() == false) : elles rejoignent les refusees pour un block NEUF, rien d autre ne change. */
const NOUVELLES_20261002 = ['AMDc', 'ASTSc', 'CAKEc', 'DJTc', 'DUOLc', 'LLYc', 'MRNAc', 'MRVLc', 'NFLXc', 'NVAXc', 'ORCLc', 'PTONc', 'PYPLc', 'QUBTc', 'RBLXc', 'RDDTc', 'TTWOc', 'WENc', 'GMEc', 'HTZc', 'PFEc', 'PMc'];
/* 2026-10-02 (Phil) : + GMEc, HTZc, PFEc, PMc, ajoutees au hook 7030 (Devises7030.sol, 41). V8 ne les admet pas. */
/* 2026-10-03 (fondateur, « les 21 en Soon ») : les 21 autres actions de l emetteur entrent au registre pour l affichage.
 *   Routage app : aucune n ouvre un block neuf (la liste V8 de l app reste les 12 du census du 2026-10-01).
 *   ⚠️ DIVERGENCE CONNUE ET MESUREE (2026-10-03, V8.deviseAdmise sur la chaine) : le V8 ADMET CRCLc (13 devises, pas 12) ;
 *   l app ne l offre pas au pairage — CRCLc n a aucune unite (totalSupply 0) ni prix, la garde de prix refuserait de toute
 *   facon. A reprendre le jour ou CRCLc circule : remesurer le census, puis mettre la liste V8 a 13. */
const NOUVELLES_20261003 = ['AMCc', 'AEOc', 'BMNRc', 'BIRDc', 'BYNDc', 'CIFRc', 'CLSKc', 'CRCLc', 'CRWVc', 'HUTc', 'KSSc', 'LCIDc', 'MARAc', 'OPENc', 'RIOTc', 'SOUNc', 'USDEc', 'VVVc', 'WULFc', 'WWc', 'XYZc'];
/* 2026-10-09 : 12 actions du lot @base du jour entrent au registre (achat/vente ; pools Aerodrome mesurees, achat+vente prouves sur
 *   fork). HORS du hook 7030 comme du V8 : elles rejoignent les refusees pour un block NEUF, rien d autre ne change. */
const NOUVELLES_20261009 = ['ARMc', 'SKHYc', 'WRDc', 'BIDUc', 'BILIc', 'HSAIc', 'INFYc', 'NIOc', 'NVOc', 'PDDc', 'SAPc', 'VALEc'];
/* 2026-10-10 (3b3f39e) : SONYc entre au registre (pool remesuree, achat/vente/paiement d un block prouves sur fork) — memes regles
 *   que les 12 du 09 : hors 7030 et hors V8, refusee pour un block NEUF. */
/* 2026-10-25 : + SANc SEc ULc NOKc LIc (prouvees sur la chaine, achat execute sur fork) — memes regles : hors 7030, hors V8. */
const NOUVELLES_20261010 = ['SONYc', 'SANc', 'SEc', 'ULc', 'NOKc', 'LIc'];
/* game354 (2026-11-11): the REAL TBLOCK enters the registry, KNOWN for the name guard — never proposed, and refused for a new block: V8 and 7030 are immutable and list only the old test token. */
const NOUVELLES_20261111 = ['TBLOCK'];

console.log('one source, pinned to the census (devises-admises.mjs, measured 2026-10-01)');
ok('12 admitted, by symbol', DEVISES_ADMISES_V8.length === 12 && ADMISES.every((s) => DEVISES_ADMISES_V8.includes(parSym[s])));
ok('no second (refused) list is exported', !Object.keys(P).some((k) => /REFUSE/i.test(k)), Object.keys(P).filter((k) => /REFUSE/i.test(k)));
const cibles = ciblesDuCensus().filter((c) => c.sym !== 'TEMOIN');
ok('the census asks exactly the 19 listed currencies + the 22 added 2026-10-02 + the 21 added 2026-10-03 + the 12 added 2026-10-09 + SONYc (2026-10-10)', cibles.length === 19 + NOUVELLES_20261002.length + NOUVELLES_20261003.length + NOUVELLES_20261009.length + NOUVELLES_20261010.length + NOUVELLES_20261111.length, cibles.length);
ok('refused by the app = complement of the admitted set = exactly the 7 + the 22 + the 21 + the 12 + SONYc',
  JSON.stringify(cibles.filter((c) => hookDeLancementPour(c.adr, 8453) === null).map((c) => c.sym).sort()) === JSON.stringify([...REFUSEES, ...NOUVELLES_20261002, ...NOUVELLES_20261003, ...NOUVELLES_20261009, ...NOUVELLES_20261010, ...NOUVELLES_20261111].sort()),
  cibles.filter((c) => hookDeLancementPour(c.adr, 8453) === null).map((c) => c.sym));
ok('ETH and TBLOCK open on V8', hookDeLancementPour(ETH_NATIF, 8453) === 'V8' && hookDeLancementPour(TBLOCK_MAINNET, 8453) === 'V8');

console.log('DIVERGENCE CHECK: Create guard == routing == launch guard, over every pair offered on Base');
const rpcMort = async () => { throw new Error('no read in this test'); };
const E0_LAUNCH = "Base Launch refused: this quote can't price a new block on this hook";
const BLOC = '0xb20000000000000000000084d0953bad205d563f';
for (const p of offertes) {
  const routage = hookDeLancementPour(p.adr, 8453);
  const garde = refusPrixNouveauBlock(p.adr, 8453, { routable: true, symbole: p.symbole });
  let lancement;
  try {
    lancement = await planLancement({ rpc: rpcMort, chaine: 8453, jeton: BLOC, compte: '0x00000000000000000000000000000000000c0de1',
      valorisationEth: 10, devise: p.adr, hooks: HOOK_V8, proprietaire: PROPRIETAIRE_PERMANENT });
  } catch (e) { lancement = { etat: 'THROW', pourquoi: String(e && e.message) }; }
  const lanceRefuse = lancement && lancement.pourquoi === E0_LAUNCH;
  ok(p.symbole + ': Create ' + (garde ? 'refuses' : 'allows') + ' = routing ' + (routage || 'none') + ' = launch ' + (lanceRefuse ? 'refuses' : 'allows'),
    (garde !== null) === (routage === null) && (routage === null) === lanceRefuse, { garde, routage, lancement: lancement && lancement.pourquoi });
}
ok('a pasted unknown block: refused by Create AND by the launch guard',
  refusPrixNouveauBlock(BLOC, 8453) !== null && hookDeLancementPour(BLOC, 8453) === null);

console.log('the copy — fact, not promise; "can buy" only from the routing graph');
for (const s of SIX) {
  ok(s + ' routable -> "' + s + ' can\'t price a new block yet. You can already use it to buy."',
    refusPrixNouveauBlock(parSym[s], 8453, { routable: true, symbole: s }) === s + " can't price a new block yet. You can already use it to buy.");
  ok(s + ' NOT routable at display time -> factual phrase', refusPrixNouveauBlock(parSym[s], 8453, { routable: false, symbole: s }) === COPIE_E0_SANS_ROUTE);
}
ok('TOSHI (not routable) -> the factual phrase', refusPrixNouveauBlock(parSym.TOSHI, 8453, { routable: false, symbole: 'TOSHI' })
  === "This currency can't price a new block yet, and we can't route a buy from it yet either.");
ok('routing unknown (default) -> factual phrase, never "can buy"', refusPrixNouveauBlock(parSym.OUSD, 8453) === COPIE_E0_SANS_ROUTE);
ok('no symbol -> factual phrase', refusPrixNouveauBlock(parSym.OUSD, 8453, { routable: true }) === COPIE_E0_SANS_ROUTE);
ok('checksummed or lowercase: same answer', refusPrixNouveauBlock('0xB2000000000000000000002fEb517dFeC7415344', 8453, { routable: true, symbole: 'OUSD' })
  === refusPrixNouveauBlock(' 0xb2000000000000000000002feb517dfec7415344 ', 8453, { routable: true, symbole: 'OUSD' }));
ok('admitted currencies pass', ADMISES.every((s) => refusPrixNouveauBlock(parSym[s], 8453, { routable: true, symbole: s }) === null));
ok('off Base the guard says nothing', refusPrixNouveauBlock(parSym.OUSD, 84532) === null);
ok('every refused pair is still OFFERED (visible in Create)', REFUSEES.every((s) => qualifierPaire(parSym[s], 8453).etat === 'OK'));
for (const c of [copieE0Achat('OUSD'), COPIE_E0_SANS_ROUTE]) {
  ok('no hook/version, no date, no promise, no price: "' + c.slice(0, 42) + '…"',
    !/\$|≈|0x[0-9a-f]{4}|hook|V8|V9|soon|coming|20\d\d|scam|useless|no route|never/i.test(c), c);
}

console.log('the wiring in app.html (note at pick time, button closed, before the 0.001 ETH)');
const app = readFileSync(process.env.APP_HTML || './app.html', 'utf8');
const corps = app.slice(app.indexOf('async function majPaire()'), app.indexOf('/** tip 20260922-stock-pair-ux: Fund wallet CTA'));
const iGarde = corps.indexOf('refusPrixNouveauBlock(q.paire.adr, CHAINE');
ok('majPaire calls the guard', iGarde > 0);
ok('…with "routable" read from the buy-routing graph at display time',
  /refusPrixNouveauBlock\(q\.paire\.adr, CHAINE,\s*\{ routable: transactionsDepuisEth\(q\.paire\.adr\) !== null, symbole: q\.paire\.symbole(, \.\.\.OPTIONS_LANCEMENT)? \}\)/.test(corps));
ok('…before the on-chain checks and before a pair is accepted',
  iGarde > 0 && iGarde < corps.indexOf('faitsDuBlock(') && iGarde < corps.indexOf('paireChoisie = q.paire;'));
const blocE0 = corps.slice(iGarde, corps.indexOf('paireChoisie = q.paire;'));
ok('…a refusal leaves no pair chosen, records the reason and RETURNS',
  /* ⛔ `\r?\n` DES DEUX COTES — meme cause que l extracteur plus haut : sur un checkout Windows
   *   `app.html` est en CRLF, et un motif en `\n` seul ne matche JAMAIS. C est la SECONDE occurrence
   *   dans ce fichier, trouvee parce que le test est passe de 79/80 a 80/80 en normalisant. La fin
   *   de ligne est une propriete du CHECKOUT, pas du depot. */
  /paireChoisie = null;\s*motifRefusPaire = e0\(\);/.test(blocE0) && /\r?\n    return;\r?\n  \}/.test(blocE0));
ok('the note shows at pick time (same tick, before any await)', blocE0.indexOf('peindreE0();') > 0
  && blocE0.indexOf('peindreE0();') < blocE0.indexOf('await '));
ok('the pasted path goes through the same majPaire (no second door)',
  /\$\('#cPaireAutre'\)\.addEventListener\('input', \(\) => void majPaire\(\)\)/.test(app));
ok('validerCreation refuses (no pair) and repeats the reason',
  /if \(!paireChoisie\) return motifRefusPaire \? \{ ko: motifRefusPaire \}/.test(app));
ok('create button: "Pick another pair" and DISABLED while refused',
  /if \(motifRefusPaire\) \{ boutonCreer\.disabled = true; boutonCreer\.textContent = 'Pick another pair'; boutonCreer\.title = ''; \}/.test(app));
const recap = app.slice(app.indexOf('function majFraisEtRecap()'), app.indexOf("const feeTxt = usd > 0"));
ok('…set AFTER every other label/disabled write in majFraisEtRecap (nothing re-opens it)',
  recap.lastIndexOf('if (motifRefusPaire)') > recap.lastIndexOf('boutonCreer.disabled = aLancerBloque')
  && recap.lastIndexOf('if (motifRefusPaire)') > recap.lastIndexOf("'Review → sign Instant Birth · $5'"));
ok('the only click path to payment goes through validerCreation',
  /async function creerBlock\(\)[\s\S]{0,400}validerCreation\(\)/.test(app) || app.split('validerCreation()').length - 1 >= 4);

console.log('behaviour: majPaire + validerCreation from app.html, EXECUTED in a sandbox');
/* the real source text of the two functions, run against stubs: if the guard is bypassed, a refused
 * pair gets ACCEPTED (paireChoisie set) and validerCreation lets the 0.001 ETH path continue. */
/* ⛔⛔⛔ CET EXTRACTEUR RENDAIT CE TEST ROUGE SUR WINDOWS — donc sur la machine de Phil, et donc
 *      exactement la ou quelqu un l aurait cru. Il cherchait `'\n}\n'` ; or git convertit `app.html`
 *      en CRLF a la sortie, donc le texte reel est `\r\n}\r\n` et le motif ne matchait JAMAIS.
 *      `extraire` rendait `null`, les deux fonctions n etaient pas trouvees, et toute la moitie
 *      COMPORTEMENTALE s ecroulait sur `ReferenceError: majPaire is not defined`.
 *      ⇒ Mesure : rouge au premier lancement sur Windows ; apres normalisation d une copie en LF,
 *        **80/80**. Le code de Zero 1 etait SAIN — c est le TEST qui ne traversait pas la frontiere.
 *
 * ⛔⛔ ET LE PIRE N ETAIT PAS LE ROUGE, C ETAIT SON LIBELLE. Il echouait en disant « both functions
 *     found in app.html », ce qui se lit comme un defaut du CODE. Quelqu un pouvait « corriger » du
 *     code qui marche pour faire taire un test casse. Un test qui accuse la mauvaise moitie est pire
 *     qu un test absent.
 * ✅ EN REVANCHE L ASSERTION `both functions found` EST BIEN PLACEE : sans elle, une extraction
 *   ratee aurait fait passer toute la moitie comportementale sur du VIDE, en silence. Elle a crie —
 *   c est la bonne conception, et c est ce qui m a permis de trouver la cause en dix minutes.
 * ⛔ `\r?\n` DES DEUX COTES : la fin de ligne n est pas une propriete du DEPOT, c est une propriete
 *   du CHECKOUT. Un test qui en depend ne prouve rien chez l autre. */
function extraire(src, entete) {
  const i = src.indexOf(entete);
  if (i < 0) return null;
  const m = /\r?\n\}\r?\n/.exec(src.slice(i));
  if (!m) return null;
  /* on garde l accolade fermante, pas la fin de ligne qui la suit */
  return src.slice(i, i + m.index + m[0].indexOf('}') + 1);
}
const srcMaj = extraire(app, 'async function majPaire() {');
const srcVal = extraire(app, 'function validerCreation() {');
ok('both functions found in app.html', !!srcMaj && !!srcVal);
async function simuler(adr, { routable }) {
  /* 2026-10-11 : la note d une ACTION refusee recoit un bouton (append, document.createElement) */
  const el = (v = '') => ({ value: v, hidden: false, className: '', textContent: '', disabled: false, title: '', boutons: [], append(b) { this.boutons.push(b); } });
  const dom = { '#cPaire': el(adr), '#cPaireAutre': el(''), '#cPaireAutreRang': el(), '#cPaireNote': el(), '#cPaireChip': el(),
    '#cNom': el('My Block'), '#cSym': el('MYB'), '#cSel': el('salt-1') };
  const appels = { faitsDuBlock: 0, prixUsdDevise: 0 };
  const ctx = vm.createContext({
    $: (q) => dom[q] || el(), CHAINE: 8453, AUTRE_PAIRE: '__autre__', majPaireSeq: 0, paireChoisie: null, motifRefusPaire: null,
    compte: '0x00000000000000000000000000000000000c0de1', TextEncoder, String, Number, Boolean, Promise,
    qualifierPaire: P.qualifierPaire, refusPrixNouveauBlock: P.refusPrixNouveauBlock, libellePuceCreation: P.libellePuceCreation,
    transactionsDepuisEth: () => (routable ? { tx: 2, chemin: [], directe: false } : null),
    prixUsdDevise: async () => { appels.prixUsdDevise += 1; return null; },
    faitsDuBlock: async () => { appels.faitsDuBlock += 1; return { estB20: true, supply: 1n, symbole: 'X', nom: 'X' }; },
    rpc: async () => { throw new Error('no rpc'); }, majResumePaire() {}, majFraisEtRecap() {}, peindrePaireChips() {},
    majFundWalletPourPaire() {}, OPTIONS_LANCEMENT: { v9: false },
    /* 2026-10-03 : le drapeau 7030 est ALLUME dans le depot ; CE banc reste le temoin du cas « 7030 eteint » (textes et tx
     *   d avant, a l octet) : la paire ne va jamais au 7030 ici. Le cas allume vit dans test-hook-7030-app-wiring. */
    paireVa7030: () => false,
    /* 2026-10-04 : la devise de secours ne concerne que les adresses TAPEES (type SAISIE) ; ici on ne joue que des devises du
     *   registre — si elle etait consultee pour elles, ce faux leverait (test-secours-paire-20261004.mjs couvre le cas SAISIE). */
    deviseDeSecoursPour: () => { throw new Error('the fallback currency must not be consulted for a registry currency'); },
    /* 2026-10-03 (memestocks) : majPaire consulte la regle de lancement AVANT la lecture on-chain — le vrai module */
    hookDeLancementPour: P.hookDeLancementPour,
    symbolesLancables: () => P.pairesProposees(8453).filter((p) => p.type === 'ACTION' && P.hookDeLancementPour(p.adr, 8453, { v9: false })).map((p) => p.symbole),
    /* 2026-10-11 : une ACTION refusee propose sa devise (secoursAction) - le vrai registre et la meme regle de lancement */
    pairesProposees: P.pairesProposees, estPaireLancable: (a) => !!P.hookDeLancementPour(a, 8453, { v9: false }),
    document: { createElement: () => ({ type: '', className: '', id: '', textContent: '', addEventListener() {} }) }, Event: class {},
  });
  vm.runInContext(srcMaj + '\n' + srcVal, ctx);
  await vm.runInContext('majPaire()', ctx);
  const v = vm.runInContext('validerCreation()', ctx);
  return { paire: vm.runInContext('paireChoisie', ctx), motif: vm.runInContext('motifRefusPaire', ctx),
    note: dom['#cPaireNote'].textContent, v, appels };
}
for (const [s, routable] of [['OUSD', true], ['PLTRc', true], ['TOSHI', false], ['MUc', false]]) {
  const r = await simuler(parSym[s], { routable });
  const attendu = refusPrixNouveauBlock(parSym[s], 8453, { routable, symbole: s }) || '(guard says: allowed)';
  /* 2026-10-11 (Phil : « encore bcp de tokenized stocks sont en soon, fix pour donner un path ») : une ACTION refusee garde le refus
   *   (motif, paire nulle, paiement bloque) mais la note propose sa devise ; les autres devises du registre gardent le refus seul */
  const estAction = P.pairesProposees(8453).some((p) => p.type === 'ACTION' && String(p.adr).toLowerCase() === String(parSym[s]).toLowerCase());
  ok(s + ': refused on pick — no pair accepted, ' + (estAction ? 'note offers its currency' : 'note = ' + JSON.stringify(attendu.slice(0, 34) + '…')),
    r.paire === null && r.motif === attendu && (estAction ? r.note.startsWith(s + ' cannot be the pair of a new block here') : r.note === attendu),
    { paire: r.paire && r.paire.symbole, note: r.note });
  ok(s + ': validerCreation stops the payment path with the same reason', r.v && r.v.ko === attendu, r.v);
  ok(s + ': no on-chain pair check was started', r.appels.faitsDuBlock === 0, r.appels);
}
const rOk = await simuler(parSym.NVDAc, { routable: true });
ok('control: NVDAc (admitted) is accepted and validerCreation passes', rOk.paire && rOk.paire.symbole && !rOk.v.ko, { paire: !!rOk.paire, v: rOk.v });

console.log('OUSD at display time, through the REAL routing graph (transactionsDepuisEth from app.html + cheminEntre)');
/* Since 5e7e044, OUSD can be offered as a pay currency once its pool facts are read. The "can buy" phrase
 * must follow THAT measurement at display time — never a hardcoded string. */
const srcTx = extraire(app, 'function transactionsDepuisEth(adrPaire) {');
ok('transactionsDepuisEth found in app.html', !!srcTx);
const PONT = await import('./pont-de-liquidite.js');
const TOK = await import('./tokenomics.js');
const USDC_B = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
async function simulerGraphe(adr, aretesDepart, areteLue) {
  const aretes = [...aretesDepart];
  const el = (v = '') => ({ value: v, hidden: false, className: '', textContent: '', disabled: false, title: '' });
  const dom = { '#cPaire': el(adr), '#cPaireAutre': el(''), '#cPaireAutreRang': el(), '#cPaireNote': el(), '#cPaireChip': el(),
    '#cNom': el('My Block'), '#cSym': el('MYB'), '#cSel': el('salt-1') };
  const notes = [];
  const ctx = vm.createContext({
    $: (q) => dom[q] || el(), CHAINE: 8453, AUTRE_PAIRE: '__autre__', majPaireSeq: 0, paireChoisie: null, motifRefusPaire: null,
    compte: '0x00000000000000000000000000000000000c0de1', TextEncoder, String, Number, Boolean, Promise,
    qualifierPaire: P.qualifierPaire, refusPrixNouveauBlock: P.refusPrixNouveauBlock, libellePuceCreation: P.libellePuceCreation,
    ETH_ADR: '0x0000000000000000000000000000000000000000', cheminEntre: PONT.cheminEntre,
    transactionsNecessaires: PONT.transactionsNecessaires, aretesMesurees: () => aretes,
    /* reading the currency's pool facts = what 5e7e044 does for the Pay-with selector */
    prixUsdDevise: async () => { if (areteLue) aretes.push(...areteLue); return null; },
    faitsDuBlock: async () => ({ estB20: true, supply: 1n, symbole: 'X', nom: 'X' }),
    rpc: async () => { throw new Error('no rpc'); }, majResumePaire() {}, peindrePaireChips() {}, majFundWalletPourPaire() {},
    /* 2026-10-03 : le vrai OPTIONS_LANCEMENT porte desormais { h7030: true } (contrat vivant) et OUSD est APPARIABLE : les phrases
     *   « OUSD can't price a new block yet » de ce graphe sont celles du monde SANS 7030. Ce banc reste ce temoin-la (E0 : textes
     *   et tx d avant, a l octet) ; le cas 7030 allume vit dans test-hook-7030-app-wiring. */
    OPTIONS_LANCEMENT: { v9: TOK.OPTIONS_LANCEMENT.v9 === true },
    paireVa7030: () => false, hookDeLancementPour: P.hookDeLancementPour,
    deviseDeSecoursPour: () => { throw new Error('the fallback currency must not be consulted for a registry currency'); },
    symbolesLancables: () => P.pairesProposees(8453).filter((p) => p.type === 'ACTION' && P.hookDeLancementPour(p.adr, 8453, { v9: false })).map((p) => p.symbole),
    majFraisEtRecap() { notes.push(dom['#cPaireNote'].textContent); },
  });
  vm.runInContext(srcTx + '\n' + srcMaj + '\n' + srcVal, ctx);
  await vm.runInContext('majPaire()', ctx);
  return { notes, final: dom['#cPaireNote'].textContent, v: vm.runInContext('validerCreation()', ctx),
    paire: vm.runInContext('paireChoisie', ctx) };
}
const PIVOT = [{ de: '0x0000000000000000000000000000000000000000', vers: USDC_B, famille: 'uniswap-v4' }];
const OUSD_A = parSym.OUSD.toLowerCase();
const AVEC = 'OUSD can\'t price a new block yet. You can already use it to buy.';
const SANS = P.COPIE_E0_SANS_ROUTE;
{
  const r = await simulerGraphe(parSym.OUSD, PIVOT, [{ de: OUSD_A, vers: USDC_B, famille: 'uniswap-v4' }]);
  ok('OUSD facts unread at pick -> factual phrase first (no promise before the measure)', r.notes[0] === SANS, r.notes);
  ok('OUSD facts read -> REPAINTED with the 6-currency phrase "' + AVEC + '"', r.final === AVEC, r.final);
  ok('OUSD still refused for pricing (no pair, validerCreation ko = the same phrase)', r.paire === null && r.v.ko === AVEC, r.v);
}
{
  const r = await simulerGraphe(parSym.OUSD, [...PIVOT, { de: OUSD_A, vers: USDC_B, famille: 'uniswap-v4' }], null);
  ok('OUSD already routable at pick -> the 6-currency phrase at once', r.notes[0] === AVEC && r.final === AVEC, r.notes);
}
{
  const r = await simulerGraphe(parSym.OUSD, PIVOT, []);
  ok('OUSD read but no route -> stays factual (never "can buy" without a path)', r.final === SANS, r.final);
}
{
  const T = parSym.TOSHI.toLowerCase();
  const r = await simulerGraphe(parSym.TOSHI, PIVOT, [{ de: T, vers: '0x4200000000000000000000000000000000000006', famille: 'uniswap-v3' }]);
  ok('TOSHI with only a Uniswap V3 pool (a venue the router does not build) -> factual phrase', r.final === SANS, r.final);
}
ok('no hardcoded OUSD phrase in app.html (it comes from paires.js copieE0Achat)', !app.includes('OUSD can\'t price'));

const srcCreer = extraire(app, 'async function creerBlock() {') || '';
ok('creerBlock returns on validerCreation ko BEFORE reading/paying the fee',
  srcCreer.indexOf('if (v.ko) {') > 0 && srcCreer.indexOf('if (v.ko) {') < srcCreer.indexOf('assurerPrixEtFraisWei('));

if (process.env.TB_LIVE === '1') {
  console.log('LIVE: the census on the deployed hook still says the same (read only)');
  const r = await census(HOOK_V8);
  ok('negative control not admitted (the read discriminates)', r.fiable === true);
  for (const l of r.lignes.filter((x) => x.sym !== 'TEMOIN')) {
    const attendu = hookDeLancementPour(l.adr, 8453) === 'V8';
    ok(l.sym + ' live = ' + (attendu ? 'admitted' : 'refused'), l.admise === attendu, l.admise);
  }
}

console.log('\n' + (n - ko) + '/' + n + (ko ? '  ⛔ ' + ko + ' KO' : '  ✅'));
process.exit(ko ? 1 : 0);
