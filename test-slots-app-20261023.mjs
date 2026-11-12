/* test-slots-app-20261023.mjs — le cablage des SLOTS dans l app et le serveur (lecture de app.html et serveur-web.js ; pas un navigateur).
 * AFFIRME : (1) sans contrat servi rien ne se montre (carte et tuile cachees dans le HTML ET par peindreSlots) ; aucun bouton desactive en dur ;
 *   Spin cache sans wallet, Settle cache sans spin reglable ; (2) chaque chiffre de la carte vient de /api/slots (la fiche) ou d un calcul
 *   (loi exacte, fenetre en blocs) — aucun prix tape ; une lecture ratee dit « not read » ; (3) les spins en attente sont relus sur la chaine
 *   par TRANCHES bornees (v3 : trancheSpun, 999 blocs puis les blocs nouveaux) et rien n est garde dans le navigateur ; (4) Spin = planSpin
 *   (approve EXACT), Settle = planSettleMany des seuls spins payes en entier (v3 : le plan refait a la tete relue) ; tout passe par
 *   envoyerAppels ; (5) les trois faces sont dessinees par logoSvg depuis
 *   les graines du contrat (Slots.graine) ; (6) le serveur sert les 4 fichiers, importe la fiche, rend PAS_OUVERT sans adresse, et ne tape
 *   aucun prix ; (7) etatSpins : un statut non lu donne NON_LU, jamais « reglable » ; (8) v4 (option 3 de Phil) : aucun remboursement
 *   dans la carte (ni bouton, ni plan, ni phrase), « A spin not settled in time is lost », l etat du regleur du serveur dit, la fenetre
 *   au temps de bloc MESURE ; le serveur lit SLOTS_KEEPER_KEY une fois, publie regleurSlots.etat() (/sante, /api/slots), OFF en essai.
 *   Chaque verification est rejouee sur une copie MUTEE en
 *   memoire et doit alors rendre faux. NE PROUVE PAS : le rendu (verifie au navigateur), un spin reel. */
import { readFileSync } from 'node:fs';
import * as S from './slots-plan.js';
import { SLOTS_DEPLOIEMENT as D } from './slots-deploiement.js';

let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const bloc = (t) => entre(t, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)');
/* 2026-10-24 (Phil : « fusionne le draw et le spin ») : la carte #slotsCarte est devenue la zone #slotsZone DE la carte Draws (memes
 *   elements, memes ids) — ce banc affirmait l ancienne carte ; il affirme la zone, cachee, dans #tirCarte, et qu aucune #slotsCarte ne reste */
const carteHtml = (t) => entre(t, '<div class="slotsZone" id="slotsZone"', '<div class="jourTicket">');

const checks = {
  carteCachee: (t) => /<div class="slotsZone" id="slotsZone" hidden>/.test(t) && /id="jbSlotsTuile"[^>]*\bhidden>/.test(t) && t.split('id="slotsZone"').length === 2
    && !/id="slotsCarte"/.test(t) && entre(t, '<div class="carte" id="tirCarte"', '<div class="carte" id="brainJeuCarte"').includes('id="slotsZone"'),
  cacheeSansContrat: (t) => /carte\.hidden = !on; if \(tuile\) tuile\.hidden = !on;/.test(bloc(t)) && /if \(!on\) return null;/.test(bloc(t)),
  aucunBoutonMort: (t) => { const c = carteHtml(t); return c.length > 500 && !/<button[^>]*\bdisabled\b/.test(c) && /<button type="button" class="bouton spinBouton" id="slotsSpin" hidden>/.test(c) && /id="slotsRegler" hidden>/.test(c); },
  /* 2026-10-24 (Phil : « un clic ») : sans wallet le bouton n est plus cache — il dit « Connect a wallet to spin » et connecte (ce banc
   *   affirmait « Spin cache sans wallet ») ; avec un contrat servi, LE bouton est toujours la, jamais desactive en dur */
  spinCacheSansWallet: (t) => /bS\.textContent = moi \? 'Spin · ' \+ usdcTexte\(prix\) \+ ' USDC' : 'Connect a wallet to spin';/.test(bloc(t)) && /bS\.hidden = false;/.test(bloc(t))
    && /if \(contrat && !c && quoi === 'spin'\) \{ await connecterPourSpin\(\); return; \}/.test(bloc(t)),
  /* v3 : Settle n apparait qu avec un spin payable EN ENTIER (le plan), et jamais quand les spins n ont pas ete lus */
  settleSeulementReglable: (t) => /bR\.hidden = lot\.length === 0;/.test(bloc(t)) && /if \(lu === null\) \{ bR\.hidden = true; bA\.hidden = true; slotsCfg\.vue = null;/.test(bloc(t)),
  /* v4 (option 3 de Phil) : AUCUN remboursement — ni bouton, ni plan expire, ni phrase de remboursement dans la carte ; la regle dite */
  sansRemboursement: (t) => { const b = bloc(t).replace(/\/\*[\s\S]*?\*\//g, ''), c = carteHtml(t).replace(/<!--[\s\S]*?-->/g, ''); return !/slotsRembourser|planExpire|lireExpiredTous|refund/i.test(b) && !/refund|slotsRembourser/i.test(c) && c.length > 500; },
  perduDit: (t) => /A spin not settled in time is lost: nothing is returned\./.test(bloc(t)),
  regleurDit: (t) => { const b = bloc(t); return /The server settles spins automatically when its keeper is on \(it is ' \+ reg \+ ' right now\); anyone can settle, and the prize always goes to the spin\\'s player\./.test(b) && /const reg = j\.regleur && j\.regleur\.etat === 'ON' \? 'on'/.test(b); },
  fenetreMesuree: (t) => { const b = bloc(t); return /const msB = await msBlocSlots\(j\);/.test(b) && /Slots\.secondesFenetre\(msB\)/.test(b) && /at the block time measured just now/.test(b) && /Slots\.msParBlocMesure\(\{ tsTete:/.test(b); },
  /* 2026-10-25 (Phil : « court, chaque fait une fois ») : le pli disait DEUX moyennes egales (j.esperanceBrut servie, ev.meilleureBrut
   *   calculee : 0.127862 deux fois). Il n en dit plus qu UNE, la meilleure strategie CALCULEE par Slots.esperance sur la table servie ; ce
   *   banc exigeait j.esperanceBrut dans le texte : il exige maintenant ev.meilleureBrut UNE fois, et toujours aucun chiffre tape (la liste
   *   des litteraux interdits garde 127862, 0.50, 0.25…). Ajoutes : les blocs des faces DERIVES (DELAI_CIBLE, REELS — le contrat :
   *   TARGET_DELAY, REELS), jamais « 2, 3 and 4 » tape ; le prix de « Pay with » = usdcTexte(prix). */
  chiffresServis: (t) => { const b = bloc(t).replace(/\/\*[\s\S]*?\*\//g, ''); return /const prix = BigInt\(j\.prixSpin\), table = j\.prizes\.map/.test(b) && /ev = Slots\.esperance\(table, prix, part\)/.test(b)
    && (b.match(/Slots\.usdcPrecis\(ev\.meilleureBrut\) \+ ' USDC a spin on average/g) || []).length === 1 && !/on average a settled spin/i.test(b)
    && /const blocsFaces = Array\.from\(\{ length: Slots\.REELS \}, \(_, r\) => Slots\.DELAI_CIBLE \+ r\);/.test(b) && !/2, 3 and 4/.test(b)
    && /swaps it for the ' \+ usdcTexte\(prix\) \+ ' USDC the spin takes/.test(b)
    && !/\b(500000|250000|0\.50|0\.25|0\.15|1000|325222|127862)\b/.test(b) && /Slots\.secondesFenetre\(2000\)/.test(b) && /Slots\.secondesFenetre\(200\)/.test(b); },
  /* 2026-10-25 : « Pay with » dit dans le pli (#slotsPayer, apres la table) : le swap D ABORD, le spin paye en USDC, les prix TOUJOURS en
   *   USDC ; et la note technique « This card finds your spins from the last 999 blocks » n est plus a l ecran */
  payerDit: (t) => { const b = bloc(t).replace(/\/\*[\s\S]*?\*\//g, ''), h = entre(t, '<summary class="note" style="cursor:pointer">How the slots work</summary>', '</details>');
    return /<p class="note" id="slotsTableNote"[^>]*><\/p>\s*<p class="note" id="slotsPayer"[^>]*><\/p>\s*$/.test(h) && /const rgPayer = \$\('#slotsPayer'\);/.test(b)
      && /your wallet first swaps it for the ' \+ usdcTexte\(prix\) \+ ' USDC the spin takes, then pays the spin in USDC;/.test(b) && /Prizes are always paid in USDC\./.test(b)
      && !/This card finds your spins|Slots\.PLAGE_LOGS \+ ' blocks/.test(b); },
  nonLu: (t) => { const b = bloc(t); return (b.match(/pot === null \? 'not read'/g) || []).length === 2 && /pts === null \? 'not read'/.test(b) && /gagne === null \? 'not read'/.test(b) && /Your pending spins could not be read just now\./.test(b); },
  /* v3 : les Spun par tranches (la premiere bornee a 999 blocs, puis les blocs nouveaux) ; rien dans le navigateur */
  fenetreBornee: (t) => /Slots\.trancheSpun\(\{ scanne: slotsCfg\.scanne, tete, blocDeploiement: j\.bloc \}\)/.test(bloc(t)) && /de: tr\.de, jusqua: tr\.jusqua/.test(bloc(t)) && !/localStorage|sessionStorage|indexedDB/.test(bloc(t)),
  spinExact: (t) => /plan = Slots\.planSpin\(\{ contrat, usdc: USDC_BASE, spinPrice: BigInt\(j\.prixSpin\) \}\)/.test(bloc(t)),
  /* v2 (R2) + v3 : la tete est relue juste avant, le plan REFAIT a cette tete, seuls les spins LOT (payes en entier) partent (le
   *   comportement est execute par test-slots-v3) */
  settleRelu: (t) => { const b = bloc(t); const i = b.indexOf("const tete = parseInt(await rpc('eth_blockNumber', []), 16);"), j = b.indexOf('const p = Slots.planReglement({ ...vue, tete });'), k = b.indexOf("envoyes = p.lignes.filter((l) => l.decision === 'LOT');"), m = b.indexOf('plan = Slots.planSettleMany({ contrat, spinIds: envoyes.map((l) => l.id) });'); return i > 0 && j > i && k > j && m > k; },
  envoiUnique: (t) => { const b = bloc(t).replace(/\/\*[\s\S]*?\*\//g, ''); return (b.match(/envoyerAppels\(/g) || []).length === 1 && !/eth_sendTransaction|envoyerDepuisWallet|wallet_sendCalls/.test(b); },
  facesDuContrat: (t) => /faceRevelee\(Slots\.graine\(hashes\[r\], spinId, r\)\)/.test(bloc(t)) && /logoSvg\(paramsLogoDepuisApparence\(f, String\(r \+ 1\)\)\)/.test(bloc(t)) && /Slots\.facesDuSpin\(hashes, spinId\)/.test(bloc(t)),
  importServi: (t) => /^import \* as Slots from '\.\/slots-plan\.js';$/m.test(t),
  /* 2026-10-24 (UN JEU A LA FOIS) : ce banc affirmait la grille de 2 colonnes sur telephone (341 px mesures a 375 px) ; le bandeau y est
   *   devenu UNE rangee qui defile de cote. Ce qui reste a garder pour les Slots : le selecteur [data-slots="1"] (0,2,0) est REPETE dans le
   *   media, sinon la grille de 4 colonnes battrait la rangee a 375 px. */
  bandeauTelephone: (t) => /@media \(max-width:600px\)\{\n  \.jeuBandeau,\.jeuBandeau\[data-n="7"\],\.jeuBandeau\[data-slots="1"\]\{display:flex;overflow-x:auto;/.test(t),
};
for (const [k, f] of Object.entries(checks)) vu(f(APP) === true, 'app.html : ' + k);
const mutants = [
  ['carteCachee', '<div class="slotsZone" id="slotsZone" hidden>', '<div class="slotsZone" id="slotsZone">'],
  ['cacheeSansContrat', 'carte.hidden = !on; if (tuile) tuile.hidden = !on;', 'carte.hidden = false; if (tuile) tuile.hidden = false;'],
  ['aucunBoutonMort', '<button type="button" class="bouton spinBouton" id="slotsSpin" hidden>', '<button type="button" class="bouton spinBouton" id="slotsSpin" disabled>'],
  ['spinCacheSansWallet', "bS.textContent = moi ? 'Spin · ' + usdcTexte(prix) + ' USDC' : 'Connect a wallet to spin';", "bS.textContent = 'Spin · ' + usdcTexte(prix) + ' USDC';"],
  ['settleSeulementReglable', 'bR.hidden = lot.length === 0;', 'bR.hidden = false;'],
  /* 2026-10-25 : la moyenne unique (meilleure strategie) tapee a la main ; les blocs des faces tapes ; le prix de « Pay with » tape ; la
   *   moyenne servie redite a cote (le doublon d avant) ; « Pay with » sans « Prizes are always paid in USDC » ; la note des 999 blocs revenue */
  ['chiffresServis', "Slots.usdcPrecis(ev.meilleureBrut) + ' USDC a spin on average", "'0.127862 USDC a spin on average"],
  ['chiffresServis', "blocsFaces.slice(0, -1).join(', ') + ' and ' + blocsFaces[blocsFaces.length - 1]", "'2, 3 and 4'"],
  ['chiffresServis', "swaps it for the ' + usdcTexte(prix) + ' USDC the spin takes", "swaps it for the 0.50 USDC the spin takes"],
  ['chiffresServis', "'The points of a spin pick its prize in the table below. '", "'The points of a spin pick its prize in the table below. On average a settled spin pays back ' + Slots.usdcPrecis(BigInt(j.esperanceBrut)) + ' USDC. '"],
  ['payerDit', ' Prizes are always paid in USDC. ', ' '],
  ['payerDit', "+ 'Points also add up as a running total kept on chain; prizes are paid per spin, points pay nothing on their own.';", "+ 'Points also add up as a running total kept on chain; prizes are paid per spin, points pay nothing on their own. This card finds your spins from the last ' + Slots.PLAGE_LOGS + ' blocks.';"],
  ['payerDit', '            <p class="note" id="slotsPayer" style="margin:6px 0 0"></p>\n', ''],
  ['nonLu', "pot === null ? 'not read' : usdcTexte(pot) + ' USDC') + '. A spin costs", "usdcTexte(pot || 0n) + ' USDC') + '. A spin costs"],
  ['fenetreBornee', 'scanne: slotsCfg.scanne, tete, blocDeploiement: j.bloc', 'scanne: null, tete, blocDeploiement: 0'],
  ['spinExact', 'plan = Slots.planSpin({ contrat, usdc: USDC_BASE, spinPrice: BigInt(j.prixSpin) });', 'plan = Slots.planSpins({ contrat, usdc: USDC_BASE, n: 1, spinPrice: 2n ** 255n });'],
  ['settleRelu', "envoyes = p.lignes.filter((l) => l.decision === 'LOT');", "envoyes = vue.spins;"],
  /* 2026-10-24 (« Pay with ») : l envoi USDC est dans la branche `else` (r partage avec le paiement en jeton) */
  ['envoiUnique', 'r = await envoyerAppels(plan.appels, c);\n    }\n    if (!r || r.etat !== \'CONFIRME\') { dit(phraseNonConfirme(r, refus', 'r = await envoyerDepuisWallet(plan.appels, c);\n    }\n    if (!r || r.etat !== \'CONFIRME\') { dit(phraseNonConfirme(r, refus'],
  ['facesDuContrat', 'faceRevelee(Slots.graine(hashes[r], spinId, r))', 'faceRevelee(Slots.graine(hashes[0], spinId, r))'],
  ['bandeauTelephone', '.jeuBandeau,.jeuBandeau[data-n="7"],.jeuBandeau[data-slots="1"]{display:flex;', '.jeuBandeau,.jeuBandeau[data-n="7"]{display:flex;'],
  /* 2026-10-24 : Settle / Accept sont dans le panneau de reponse (bouton plein : l action suivante) — l ancre suit le bouton */
  ['sansRemboursement', '<button type="button" class="bouton" id="slotsAccepter" hidden>Accept</button>', '<button type="button" class="bouton" id="slotsAccepter" hidden>Accept</button>\n        <button type="button" class="bouton sec" id="slotsRembourser" hidden>Claim refund</button>'],
  ['perduDit', "'A spin not settled in time is lost: nothing is returned. Settle within '", "'Settle within '"],
  ['regleurDit', "(it is ' + reg + ' right now)", "(it is on right now)"],
  ['fenetreMesuree', 'const msB = await msBlocSlots(j);', 'const msB = null;'],
];
/* un motif unique dans la page est mute dans la page ; un motif partage avec les duels (meme phrase) est mute DANS le bloc des slots seulement */
for (const [k, de, vers] of mutants) {
  const b = bloc(APP), dansPage = APP.split(de).length === 2, dansBloc = b.split(de).length === 2;
  vu(dansPage || dansBloc, 'mutant ' + k + ' : le motif existe une fois (page ou bloc des slots)');
  const mute = dansPage ? APP.replace(de, () => vers) : APP.replace(b, () => b.replace(de, () => vers));
  vu(checks[k](mute) === false, 'MUTANT ' + k + ' : la verification ROUGIT');
}

/* le serveur */
const route = (t) => entre(t, "if (chemin === '/api/slots') {", '/* ══ LES DUELS (2026-10-18)');
const srvChecks = {
  servi: (t) => { const s = (t.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || ''; return ['deployer-slots.html', 'slots-deploiement.js', 'slots-config.js', 'slots-plan.js'].every((f) => s.includes("'" + f + "'")); },
  ficheImportee: (t) => /^import \{ SLOTS_DEPLOIEMENT \} from '\.\/slots-deploiement\.js';$/m.test(t),
  pasOuvertSansAdresse: (t) => { const r = route(t); const i = r.indexOf("if (!contratSlots) { rendreS({ ok: false, etat: 'PAS_OUVERT' }); return; }"), j = r.indexOf("etat: 'OUVERT'"); return i > 0 && j > i && /const contratSlots = SPIN_ACTIF \? SPIN_ACTIF\.contrat : null;/.test(r)
    /* 2026-11-12 (the new Spin): the served contract comes from spin-actif.js — the record's address AND block, or the new Spin once recorded */
    && /Number\.isSafeInteger\(fiche\.bloc\)/.test(lire('spin-actif.js')); },
  aucunPrixTape: (t) => { const r = route(t); return /prixSpin: String\(sc\.spinPrice\)/.test(r) && /prizes: sc\.prizes\.map\(String\)/.test(r) && !/\b(500000|5000|250000)\b/.test(r) && !/eth_|rpc/.test(r); },
  getSeulement: (t) => /if \(req\.method !== 'GET' && req\.method !== 'HEAD'\) \{ res\.writeHead\(405[^\n]*GET only/.test(route(t)),
  /* v4 : le regleur — la cle lue UNE fois, de l environnement seulement, passee au module ; /sante et /api/slots publient son etat() */
  regleurCable: (t) => /^import \{ creerRegleur \} from '\.\/slots-regleur\.js';$/m.test(t) && (t.match(/SLOTS_KEEPER_KEY/g) || []).length >= 1
    && (t.match(/process\.env\.SLOTS_KEEPER_KEY/g) || []).length === 1 && /cle: process\.env\.SLOTS_KEEPER_KEY \|\| null, contrat: contratSlotsFiche, chainId: SLOTS_DEPLOIEMENT\.chaine, table: SPIN_ACTIF \? SPIN_ACTIF\.config\.prizes : SLOTS_DEPLOIEMENT\.constructeur\.prizes/.test(t) /* 2026-11-12: the served Spin's table */
    && /slotsRegleur: regleurSlots\.etat\(\),/.test(t) && /regleur: \(\(\) => \{ const e = regleurSlots\.etat\(\);/.test(route(t)) && /regleurSlots\.demarrer\(\)/.test(t),
  regleurOffEnEssai: (t) => /const regleurSlots = ESSAI_SRV\.actif\n  \? creerRegleur\(\{ desactive:/.test(t),
};
for (const [k, f] of Object.entries(srvChecks)) vu(f(SRV) === true, 'serveur : ' + k);
const srvMutants = [
  ['servi', "'deployer-slots.html', 'slots-deploiement.js', 'slots-config.js', 'slots-plan.js',", "'deployer-slots.html', 'slots-deploiement.js', 'slots-config.js',"],
  ['pasOuvertSansAdresse', "if (!contratSlots) { rendreS({ ok: false, etat: 'PAS_OUVERT' }); return; }", ''],
  ['aucunPrixTape', 'prixSpin: String(sc.spinPrice)', "prixSpin: '500000'"],
  ['regleurCable', 'slotsRegleur: regleurSlots.etat(),', ''],
  ['regleurOffEnEssai', 'const regleurSlots = ESSAI_SRV.actif\n  ? creerRegleur({ desactive:', 'const regleurSlots = false\n  ? creerRegleur({ desactive:'],
];
for (const [k, de, vers] of srvMutants) {
  vu(SRV.split(de).length === 2, 'mutant serveur ' + k + ' : le motif existe une fois');
  vu(srvChecks[k](SRV.replace(de, () => vers)) === false, 'MUTANT serveur ' + k + ' : la verification ROUGIT');
}
/* la fiche : nulle -> /api/slots rend PAS_OUVERT -> carte cachee ; 2026-10-24 deploye -> adresse ET bloc ecrits ensemble (noter-deploiement-slots) */
vu((D.adresse === null && D.bloc === null) || (/^0x[0-9a-f]{40}$/.test(String(D.adresse)) && Number.isSafeInteger(D.bloc) && D.bloc > 0), 'fiche : adresse et bloc tous deux nuls (PAS_OUVERT, aucun bouton Slots) ou tous deux ecrits');

/* (7) etatSpins, pur */
const spuns = [{ spinId: 1n, targetBlock: 100 }, { spinId: 2n, targetBlock: 100 }, { spinId: 3n, targetBlock: 100 }, { spinId: 4n, targetBlock: 300 }];
const e = S.etatSpins({ spuns, statuts: new Map([['1', 1], ['2', 2], ['3', null], ['4', 1]]), tete: 200 });
vu(e.length === 3 && e[0].id === '1' && e[0].etat === 'REGLABLE' && e[0].blocsRestants === 156 && e[1].id === '3' && e[1].etat === 'NON_LU' && e[2].etat === 'TROP_TOT' && e[2].blocsAvant === 103, 'etatSpins : regle saute, non lu = NON_LU, a venir = TROP_TOT (v2 : jusqu au 3e bloc, cible + 3 - tete)');
vu(S.etatSpins({ spuns: [{ spinId: 1n, targetBlock: 100 }], statuts: new Map([['1', 1]]), tete: 357 })[0].etat === 'PERDU', 'etatSpins : cible + 257 = PERDU');
vu(S.debutFenetreSpins(10000, 0) === 10000 - 256 - 2 - 40 && S.debutFenetreSpins(10000, 9900) === 9900, 'fenetre : tete - 298, jamais avant le deploiement');
const f = S.filtreSpunDe({ contrat: '0x' + 'cc'.repeat(20), joueur: '0x' + 'a1'.repeat(20), de: 9702, jusqua: 10000 });
vu(f.topics[0] === S.TOPIC_SPUN && f.topics[1] === null && f.topics[2] === '0x' + '0'.repeat(24) + 'a1'.repeat(20) && f.fromBlock === '0x25e6' && f.toBlock === '0x2710', 'filtre Spun : le joueur en topic 2, fenetre en hex');
let jete = false; try { S.filtreSpunDe({ contrat: '0x' + 'cc'.repeat(20), joueur: '0x' + 'a1'.repeat(20), de: 10, jusqua: 5 }); } catch (_) { jete = true; }
vu(jete, 'filtre Spun : fenetre inversee refusee');
console.log('ok slots-app - ' + n + ' assertions ; NE PROUVE PAS le rendu ni un spin reel');
