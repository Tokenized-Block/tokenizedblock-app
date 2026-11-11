/* OUSD COMME DEVISE DE PAIRE — ce qui est vrai, et ce qui ne l est pas.
 *
 * Ajoute le 2026-09-30. Ce test existe pour deux raisons opposees :
 *   · qu il ne DISPARAISSE pas d une liste ou il a sa place (marche mesure a 10 M$) ;
 *   · qu il ne soit pas TRAITE COMME PLUS QUE CE QU IL EST — son volume est minuscule et sa
 *     pool contre ETH est vide.
 */
import { DEVISES_BASE, qualifierPaire, proposableEnEchange, pairesProposees } from './paires.js';
import { symboleTrompeur } from './symbole-trompeur.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
const OUSD = DEVISES_BASE.find((d) => d.symbole === 'OUSD');

console.log('OUSD est dans la liste, et bien forme');
ok('present dans DEVISES_BASE', !!OUSD);
/* ⛔ L ADRESSE EST LE SEUL ELEMENT QUI NE SE DEVINE PAS. Copiee de l annonce de l emetteur,
 *   elle est figee ici : une faute d un caractere enverrait les paires vers le vide. */
ok('adresse EXACTE de l emetteur',
  OUSD.adr === '0xB2000000000000000000002fEb517dFeC7415344', OUSD.adr);
ok('elle porte le prefixe 0xB2', OUSD.adr.toLowerCase().startsWith('0xb2'));
ok('type STABLE', OUSD.type === 'STABLE');
ok('declare sur Base seulement', OUSD.chaines.length === 1 && OUSD.chaines[0] === 8453);

console.log('il est utilisable comme paire, SANS exception');
const q = qualifierPaire(OUSD.adr, 8453);
ok('qualifierPaire -> OK', q.etat === 'OK', q);
/* ⛔⛔ LE POINT QUI COMPTE : il est CONNU, donc il ne passe pas par la porte « prouve 0xef ».
 *    C est ce qui le distingue d un ERC-20 quelconque, que la regle « no ERC-20 sprawl » refuse. */
ok('il est VERIFIE, donc pas soumis a la preuve 0xef a chaque saisie',
  q.paire.verifiee === true && !q.paire.besoinB20, q.paire);
ok('il est PROPOSE en echange', proposableEnEchange(OUSD) === true);
ok('il apparait dans les paires proposees sur Base',
  pairesProposees(8453).some((p) => p.symbole === 'OUSD'));

console.log('il ne casse rien de ce qui existait');
/* ⛔ TEMOIN DE NON-REGRESSION : les devises d avant sont toujours la, et toujours proposees. */
for (const s of ['ETH', 'USDC', 'cbBTC', 'TOSHI']) {
  ok(s + ' est toujours propose', pairesProposees(8453).some((p) => p.symbole === s));
}
/* game354: by ADDRESS (the old test token is now symbol oldTBLOCK), and BOTH conditions — the check tested nothing otherwise */
const ancienTb = DEVISES_BASE.find((d) => String(d.adr).toLowerCase() === '0xb20000000000000000000024c30d3fcb7931272e');
ok('TBLOCK reste NON propose (decision du 2026-09-24)',
  !!ancienTb && !pairesProposees(8453).some((p) => String(p.adr).toLowerCase() === '0xb20000000000000000000024c30d3fcb7931272e')
  && proposableEnEchange(ancienTb) === false);
ok('aucun doublon d adresse dans la liste', (() => {
  const v = DEVISES_BASE.map((d) => d.adr.toLowerCase());
  return new Set(v).size === v.length;
})(), DEVISES_BASE.map((d) => d.adr));
ok('aucun doublon de symbole', (() => {
  const v = DEVISES_BASE.map((d) => d.symbole);
  return new Set(v).size === v.length;
})());

console.log('et la garde anti-sosie le protege desormais');
/* ⛔ En entrant dans DEVISES_BASE, OUSD devient un nom qu on protege : un block qui se
 *   reclamerait « OUSD » sans etre celui-la doit etre marque. C est le meme mecanisme qui
 *   protege deja USDC et TBLOCK. */
const AUTRE = '0xb200000000000000000000945f82034201b39901';
ok('un block qui se dit OUSD est marque TROMPEUR',
  symboleTrompeur('OUSD', AUTRE, DEVISES_BASE).verdict === 'TROMPEUR',
  symboleTrompeur('OUSD', AUTRE, DEVISES_BASE));
ok('le VRAI OUSD n est PAS marque',
  symboleTrompeur('OUSD', OUSD.adr, DEVISES_BASE).verdict === 'LIBRE');

console.log('⚠️ les reserves sont ECRITES, pas seulement sues');
/* ⛔⛔ CE TEST TIENT UN COMMENTAIRE, ET C EST VOLONTAIRE. Les deux reserves ci-dessous sont ce
 *    qui separe « on a ajoute une devise » de « on a ajoute un marche ». Les effacer du fichier
 *    ferait disparaitre la seule trace que le volume est minuscule et que la pool ETH est vide —
 *    et quelqu un router ait un jour ETH -> OUSD dans 289 $ de liquidite. */
import { readFileSync } from 'node:fs';
const src = readFileSync('./paires.js', 'utf8');
ok('le fichier garde la mesure de liquidite OUSD/USDC', /9 999 561/.test(src));
ok('le fichier garde l avertissement sur la pool ETH vide', /OUSD\/ETH[^\n]*289/.test(src));
/* ⛔⛔⛔ CETTE ASSERTION EXIGEAIT « le volume est minuscule », ET ELLE EST DEVENUE FAUSSE EN UN JOUR.
 *    Le chiffre qu elle protegeait (5 234 $) etait perime d un facteur 35 le soir meme : 181 424 $
 *    et 1 476 trades, mesures sur notre propre `/api/trending`. Une garde qui exige une PHRASE
 *    PERIMEE empeche la correction au lieu de la proteger — exactement ce qui s est passe avec
 *    « bps » sur la phrase de frais, deux fois dans la meme journee.
 *    ⛔ ET ELLE SERAIT RESTEE VERTE : la phrase survit dans la CITATION de la reserve retiree. Une
 *      garde qui accuse la citation d une faute au lieu de la faute ne mesure rien.
 *    ⇒ CE QU IL FAUT TENIR N EST PAS LE CHIFFRE, C EST LA DISCIPLINE : que le chiffre perime soit
 *      RETIRE A VOIX HAUTE, que le chiffre mesure soit la, et que le doute qui reste VRAI
 *      (la concentration sur un seul block) soit ecrit. */
ok('⛔ le fichier RETIRE le chiffre perime au lieu de le laisser vivre',
  /PERIME D UN FACTEUR 35/i.test(src));
ok('et il porte le volume REMESURE', /181 424/.test(src) && /1 476 trades/.test(src));
ok('et il nomme les blocks deja cotes en OUSD', /OHUSD/.test(src) && /169 381/.test(src));
/* ⛔ LE DOUTE QUI RESTE VRAI DOIT RESTER ECRIT : un marche concentre sur un block peut partir avec
 *   lui. Sans cette ligne, « 181 424 $ » se lirait comme une profondeur etablie. */
ok('et il dit que ce marche est CONCENTRE sur un seul block', /93,4 %/.test(src));
/* ⛔ ET QUE LES « REWARDS » NE SONT PAS UN REVENU : sans cette ligne, quelqu un les compterait. */
ok('le fichier dit que les rewards sont une PISTE, pas un revenu',
  /PISTE de revenu, pas un revenu/i.test(src));
ok('le fichier dit que la parente avec nos blocks N EST PAS verifiee',
  /pas la parente|prouve le FORMAT/i.test(src));

/* ══ OUSD ETAIT STRUCTURELLEMENT INOFFRABLE, ET C EST MESURE (2026-10-01) ═══════════════════════
 *
 * ⛔⛔⛔ LA CHAINE DU DEFAUT, BOUT A BOUT. Sur un profil ouvert, mesure par
 *      `performance.getEntriesByType('resource')` : 17 appels distincts a `/api/prix-usd`,
 *      couvrant TOUT le registre sauf ETH, USDC et **OUSD**.
 *        `assurerPrixDevise` est pilote par les SYMBOLES vus dans le marche ;
 *        OUSD ne cote presque aucun block, donc personne ne demande jamais son prix ;
 *        sans appel, pas d entree dans `faitsPoolLus` ;
 *        sans entree, `aretesMesurees()` ne produit AUCUNE arete — elle ne boucle que sur elle ;
 *        sans arete, la devise n a pas de chemin et n est jamais offerte.
 *      Et la route EXISTE : avec les modules deployes, OUSD -> SNDKc rend `ok: true`,
 *      `par: 'franchissement'`, 2 sauts. La pool d OUSD fait 10 004 877 $.
 *      ⇒ On refusait une devise de 10 M$ parce qu on ne s etait jamais demande son prix. C est la
 *        forme la plus couteuse de « module correct mais inatteignable » : le rail etait bati,
 *        teste et prouve sur fork, et le graphe n avait pas son noeud de depart.
 *
 * ⛔ CE QUE CES CAS GARDENT : le DECLENCHEMENT et ses bornes. Ils ne prouvent PAS qu OUSD soit
 *   offert a l ecran — ca depend du serveur et du marche du jour. Ils prouvent qu on LE DEMANDE. */
const appHtml = readFileSync('./app.html', 'utf8');
ok('⭐ les devises non lues sont REELLEMENT demandees, au lieu de rester invisibles',
  /for \(const c of candidates\)[\s\S]{0,900}?void prixUsdDevise\(c\.adr\)/.test(appHtml));
/* ⛔⛔ LA BORNE EST LA CONDITION POUR LE FAIRE ICI. Sans registre, chaque repeint du selecteur
 *     relancerait la lecture de toutes les devises non lues — et le selecteur se repeint a chaque
 *     arrivee de prix : une boucle qui se nourrit elle-meme. Ce depot a passe la meme soiree a
 *     retirer 12 appels IDENTIQUES en 24 ms ; on n en rajoute pas. */
ok('et une adresse n est demandee QU UNE FOIS par page',
  /const devisesSansFaitsEnVol = new Set\(\);/.test(appHtml)
  && /if \(devisesSansFaitsEnVol\.has\(k\)\) continue;/.test(appHtml)
  && /devisesSansFaitsEnVol\.add\(k\);/.test(appHtml));
/* ⛔ L ETH N A PAS DE POOL A LIRE et l USDC est le pivot que `aretesMesurees` ecarte deja : les
 *   demander ferait deux requetes refusees par le serveur a chaque session, pour rien. */
ok('et ni l ETH ni l USDC ne sont demandes',
  /k === String\(ETH_ADR\)\.toLowerCase\(\) \|\| k === String\(USDC_BASE\)\.toLowerCase\(\)/.test(appHtml));
/* ⛔⛔ SANS REPEINT, LE CORRECTIF SERAIT JUSTE DANS LE CODE ET INVISIBLE A L ECRAN — le defaut que
 *     Phil a nomme, et que j ai refait le meme jour. Et il ne doit se faire que si le profil est
 *     TOUJOURS sur ce block, sinon on colle les devises d un block a l ecran d un autre. */
ok('et l arrivee de la lecture REPEINT, mais seulement si on est encore sur ce block',
  /dataset\.block[\s\S]{0,260}?majDevisesDentree\(v\)/.test(appHtml));
/* ⛔ UNE LECTURE QUI ECHOUE LAISSE LA DEVISE « NON MESUREE », PAS « SANS ROUTE ». Confondre les deux
 *   transformerait notre incompletude en accusation contre le jeton de quelqu un — c est la regle
 *   que `devises-dentree.js` ecrit lui-meme, et elle doit survivre a ce correctif. */
ok('et un echec de lecture est AVALE, pas transforme en refus',
  /void prixUsdDevise\(c\.adr\)[\s\S]{0,500}?\.catch\(\(\) =>/.test(appHtml));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
