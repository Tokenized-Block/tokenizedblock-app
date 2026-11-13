/* test-duels-app-20261018.mjs — le cablage des DUELS dans l app (structure : lecture de app.html, serveur-web.js, commandes-panel.js ; pas un
 * navigateur). AFFIRME : (1) sans contrat servi rien de payant n est montre (carte, tuile et reglages du brain caches ; « How it works » dit
 * « Opens with its contract ») et aucun bouton n est desactive en dur ; (2) l app ne balaie JAMAIS la chaine (pas d eth_getLogs : /api/duels) ;
 * (3) chaque action RELIT les duels, la tete et l etat avant de construire l appel, et n envoie que par envoyerAppels ; (4) la Map pose une marque
 * SANS TEXTE et n ecrit rien dans sa legende ; (5) la commande « duel » existe et ne signe que par bcSigner, derriere un bouton ; (6) le serveur
 * charge la fiche par import() DYNAMIQUE, rend PAS_OUVERT sans elle, ne lit que par fenetres bornees, sert duels-plan-app.js.
 * Chaque verification est une FONCTION du texte : elle est rejouee sur une copie MUTEE en memoire et doit alors rendre faux.
 * NE PROUVE PAS : le rendu, un vrai duel, la parite avec le contrat compile. */
import { readFileSync } from 'node:fs';
import { analyserCommande, PRECOMMANDES, AIDE_COMMANDES } from './commandes-panel.js';

let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), SRV = lire('serveur-web.js');
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };

const checks = {
  carteCachee: (t) => /<div class="carte" id="duelsCarte" hidden>/.test(t) && /id="jbDuelsTuile"[^>]*\bhidden>/.test(t) && t.split('id="duelsCarte"').length === 2,
  regleSansContrat: (t) => /<b>06 · DUELS<\/b><p>[^<]*Winner|<b>06 · DUELS<\/b><p>[\s\S]{0,700}90% of the pot, 7% goes to the community reward pool, 3% to TokenizedBlock[\s\S]{0,200}<span id="regleDuelsEtat">Coming soon\.<\/span>/.test(t),
  aucunBoutonMort: (t) => { const c = entre(t, 'id="duelsCarte"', '<!-- EARN'); return c.length > 500 && !/<button[^>]*\bdisabled\b/.test(c); },
  horsDraws: (t) => { const c0 = t.indexOf('id="tirCarte"'), c1 = t.indexOf('id="missionsCarte"'), d = t.indexOf('id="duelsCarte"'); return d > c1 && c1 > c0 && d < t.indexOf('id="regleCarte"'); },
  pasDeBalayage: (t) => { const b = entre(t, '/* ══ LES DUELS (Phil 2026-10-18', '/* ══ LET THE BRAIN PLAY'); return b.length > 8000 && /fetch\((frais \? '\/api\/duels\?frais=1' : )?'\/api\/duels'/.test(b) && !/eth_getLogs/.test(b); },
  envoiUnique: (t) => { const b = entre(t, '/* ══ LES DUELS (Phil 2026-10-18', '/* ══ LET THE BRAIN PLAY').replace(/\/\*[\s\S]*?\*\//g, '');
    /* trois envois : une action de duel, un Challenge, un Claim — tous par envoyerAppels (le chemin des rolls payes) */
    return (b.match(/envoyerAppels\(/g) || []).length === 3 &&!/envoyerDepuisWallet|envoyerLotAtomique|eth_sendTransaction|wallet_sendCalls|bcSigner\(/.test(b); },
  relitAvantEnvoi: (t) => { const a = entre(t, 'async function actionDuel(', 'async function defierDuel(');
    const i1 = a.indexOf('await lireDuelsServis(true)'), i2 = a.indexOf("rpc('eth_blockNumber'"), i3 = a.indexOf('Duels.actionsDuel(d, moi, tete, maintenant, Duels.duelsOuverts(j), margeD).includes(action)'), i4 = a.indexOf('envoyerAppels(plan.appels, c)');
    return i1 > 0 && i2 > i1 && i3 > i2 && i4 > i3; },
  defiVerifie: (t) => { const a = entre(t, 'async function defierDuel(', "$('#duelsListe').addEventListener");
    const iA = a.indexOf('await admisDuel(contrat, token)'), iS = a.indexOf('bcSolde(token, c)'), iE = a.indexOf('envoyerAppels(plan.appels, c)');
    return iA > 0 && iS > iA && iE > iS && /if \(ok !== true\)/.test(a) && /if \(solde < mise\)/.test(a) && /tirerFaceDeRoll\(\)/.test(a); },
  aucuneAdresseTapee: (t) => { const b = entre(t, '/* ══ LES DUELS (Phil 2026-10-18', '/* ══ LET THE BRAIN PLAY').replace(/\/\*[\s\S]*?\*\//g, ''); return !/0x[0-9a-fA-F]{40}/.test(b); },
  marqueSansTexte: (t) => { const b = entre(t, 'async function peindreDuelsMap(', 'setInterval(() => { if (mapVisible()) void peindreDuelsMap(); }, 15000);');
    const svg = (t.match(/const DUEL_EPEES = '([^']*)'/) || [])[1] || '';
    return /if \(!mapVisible\(\)\) return;/.test(b) && /m\.innerHTML = DUEL_EPEES;/.test(b) && !/m\.textContent/.test(b) && /^<svg[^>]*aria-hidden="true">/.test(svg) && !/<text/.test(svg) && !/mapRolls|mapEtat/.test(b); },
  clicVersLaCarte: (t) => /const m = e\.target && e\.target\.closest \? e\.target\.closest\('\.duelMarque'\) : null;\n  if \(!m\) return;\n  e\.preventDefault\(\); e\.stopPropagation\(\);\n  ouvrirDuel\(m\.dataset\.duel\);\n\}, true\);/.test(t),
  marqueHorsDeMap: (t) => /<div class="mapEnv" id="map"[^>]*><\/div>\n[\s\S]{0,400}<div class="mapDuels" id="mapDuels"><\/div>/.test(t),
  commandeRoutee: (t) => /if \(c\.type === 'duel'\) \{ void bcCommandeDuel\(\); return true; \}/.test(t),
  commandeHorsBlocJeu: (t) => { const i0 = t.indexOf('async function bcExecuterTexte('), i1 = t.indexOf('/* ── LE TICKET DE L ONGLET TRADE (2026-10-04)'), d = t.indexOf('async function bcCommandeDuel('); return d > 0 && i0 > 0 && (d < i0 || d > i1); },
  commandeSigneDerriereUnBouton: (t) => { const a = entre(t, 'async function bcAccepterDuel(', '/** Une commande ECRITE ici');
    const iJ = a.indexOf(".includes('JOIN')"), iB = a.indexOf("bcBoutons(m, [['Sign in your wallet', async () => {"), iS = a.indexOf('bcSigner(m, plan.appels');
    return iJ > 0 && iB > iJ && iS > iB && (a.match(/bcSigner\(/g) || []).length === 1 && !/envoyerAppels|envoyerDepuisWallet/.test(a); },
  /* integration 2026-10-18 : le bandeau a SIX choix sans contrat (Roll, Ticket, Week pass, Its brain, Skins, Missions), SEPT avec les Duels */
  tuileBandeau: (t) => /\.jeuBandeau\[data-n="7"\]\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)\}/.test(t) && /if \(bd\) bd\.dataset\.n = on \? '7' : '6';/.test(t),
  /* revue adverse 2026-10-18 (MOYEN) : liste NON LUE -> ni « Challenge » ni formulaire ; defierDuel refuse sans liste lue */
  listeNonLue: (t) => /if \(!j\.ok\) \{ liste\.textContent = '';[^\n]*\$\('#duelDefier'\)\.hidden = true; const fo = \$\('#duelForm'\); if \(fo\) fo\.hidden = true; return null; \}/.test(t)
    && /if \(!j\.ok\) \{ dit\('The duel list could not be read just now — nothing was asked/.test(t.slice(t.indexOf('async function defierDuel('), t.indexOf("$('#duelDefier').addEventListener"))),
  /* revue adverse 2026-10-18 : un jeton retire par le gardien fait revert join() APRES l approve — admisDuel relu avant planJoin (carte ET chat) */
  joinAdmis: (t) => { const a = t.slice(t.indexOf('async function actionDuel('), t.indexOf('async function defierDuel(')), b = t.slice(t.indexOf('async function bcAccepterDuel('), t.indexOf('async function bcCommandeGame('));
    const ok = (s) => s.indexOf('const adm = await admisDuel(contrat, d.token);') > 0 && s.indexOf('const adm = await admisDuel(contrat, d.token);') < s.indexOf('planJoin({ contrat, duel: d') && /if \(adm !== true\) \{/.test(s);
    return ok(a) && ok(b); },
};
for (const [k, f] of Object.entries(checks)) vu(f(APP) === true, 'app.html : ' + k);

/* mutants EN MEMOIRE : chaque verification doit rougir sur la copie mutee */
const mutants = [
  ['carteCachee', '<div class="carte" id="duelsCarte" hidden>', '<div class="carte" id="duelsCarte">'],
  ['regleSansContrat', '<span id="regleDuelsEtat">Coming soon.</span>', '<span id="regleDuelsEtat"></span>'],
  ['aucunBoutonMort', '<button type="button" class="bouton" id="duelDefier">', '<button type="button" class="bouton" id="duelDefier" disabled>'],
  /* 2026-10-25 (R2 Grok) : /api/duels?frais=1 apres un recu — ancre suivie */
  ['pasDeBalayage', "try { const j = await fetch(frais ? '/api/duels?frais=1' : '/api/duels'", "try { await rpc('eth_getLogs', []); const j = await fetch(frais ? '/api/duels?frais=1' : '/api/duels'"],
  ['envoiUnique', 'const r = await envoyerAppels(plan.appels, c);\n  if (!r || r.etat !== \'CONFIRME\' || !r.hash) { dit(phraseNonConfirme(r, \'Not sent\'));', 'const r = await envoyerDepuisWallet(plan.appels, c);\n  if (!r || r.etat !== \'CONFIRME\' || !r.hash) { dit(phraseNonConfirme(r, \'Not sent\'));'],
  /* 2026-10-25 (R5 Grok) : la marge du Settle passee — ancre suivie */
  ['relitAvantEnvoi', 'if (!Duels.actionsDuel(d, moi, tete, maintenant, Duels.duelsOuverts(j), margeD).includes(action))', 'if (false)'],
  ['defiVerifie', 'if (solde < mise)', 'if (false)'],
  ['marqueSansTexte', 'm.innerHTML = DUEL_EPEES;', "m.innerHTML = DUEL_EPEES; m.textContent = '#' + d.id;"],
  ['clicVersLaCarte', 'e.preventDefault(); e.stopPropagation();\n  ouvrirDuel(m.dataset.duel);', 'ouvrirDuel(m.dataset.duel);'],
  ['commandeSigneDerriereUnBouton', "const s = await bcSigner(m, plan.appels.map((a) => ({ ...a, nom: a.quoi })), null);\n    if (s.ok) bcEtape(m, 'Accepted — settle", "const s = await envoyerAppels(plan.appels, compte);\n    if (s.ok) bcEtape(m, 'Accepted — settle"],
];
for (const [k, de, vers] of mutants) {
  vu(APP.split(de).length === 2, 'mutant ' + k + ' : le motif existe une fois');
  vu(checks[k](APP.replace(de, vers)) === false, 'MUTANT ' + k + ' : la verification ROUGIT');
}

/* la commande « duel » */
vu(analyserCommande('duel').ok && analyserCommande('duel').commande.type === 'duel' && analyserCommande('Duels').commande.type === 'duel', '« duel » / « Duels » : la commande duel');
vu(!analyserCommande('duel 5').ok, '« duel 5 » : refuse (la grammaire ne devine rien)');
vu(PRECOMMANDES.some((p) => p.cle === 'duel' && analyserCommande(p.modele).ok), 'la puce « Duel » ecrit une commande acceptee');
vu(AIDE_COMMANDES.some((l) => /^duel\b/.test(l) && /90%/.test(l) && /7%/.test(l) && /3%/.test(l)), 'l aide dit duel et 90 / 7 / 3');

/* le serveur */
const srvChecks = {
  ficheDynamique: (t) => /import\('\.\/duels-deploiement\.js'\)\.then\(/.test(t) && !/^import [^\n]*from '\.\/duels-deploiement\.js'/m.test(t),
  pasOuvertSansFiche: (t) => { const h = entre(t, "if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS (2026-10-17)'); const i = h.indexOf("if (!contrat) { rendreD({ ok: false, etat: 'PAS_OUVERT'"), j = h.indexOf('void lireDuelsSrv()'); return i > 0 && j > i && !/eth_send|sendTransaction|sendRawTransaction/.test(h); },
  getSeulement: (t) => /if \(req\.method !== 'GET' && req\.method !== 'HEAD'\) \{ res\.writeHead\(405[^\n]*GET only/.test(entre(t, "if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS (2026-10-17)')),
  /* 2026-10-24 : plus de fenetres de logs (une fenetre d archive refusee laissait /api/duels NON_LU pour toujours, mesure prod game33) — la
   *   lecture se fait par l ETAT, BORNEE : au plus DUELS_IDS_PAR_TOUR ids par tour, et AUCUN eth_getLogs (execute : test-duels-etat-20261024) */
  fenetresBornees: (t) => { const s = entre(t, 'async function lireDuelsSrv()', 'setInterval(() => { if (contratDuels()) void lireDuelsSrv(); }, 30000)');
    return /const DUELS_IDS_PAR_TOUR = 50;/.test(t) && /idsDuelsATour\(\{ nextId, cache: duelsSrv\.cache, budget: DUELS_IDS_PAR_TOUR, garde: DUELS_GARDE_IDS \}\)/.test(s) && s.length > 500 && !/eth_getLogs/.test(s); },
  servi: (t) => /'duels-plan-app\.js',/.test((t.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/) || [])[1] || ''),
  nonLuPasVide: (t) => /if \(duelsSrv\.contrat !== contrat \|\| duelsSrv\.tete === null\) \{ rendreD\(\{ ok: false, etat: 'NON_LU'/.test(t),
};
for (const [k, f] of Object.entries(srvChecks)) vu(f(SRV) === true, 'serveur : ' + k);
const srvMutants = [
  ['pasOuvertSansFiche', "if (!contrat) { rendreD({ ok: false, etat: 'PAS_OUVERT', regles }); return; }\n    void lireDuelsSrv();", "void lireDuelsSrv();\n    if (!contrat) { rendreD({ ok: false, etat: 'PAS_OUVERT', regles }); return; }"],
  ['fenetresBornees', 'budget: DUELS_IDS_PAR_TOUR, garde: DUELS_GARDE_IDS', 'budget: Infinity, garde: DUELS_GARDE_IDS'],
  ['fenetresBornees', "const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);\n    if (!Number.isSafeInteger(tete) || tete <= 0) throw new Error('head unreadable');\n    const nextId",
    "const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);\n    await rpcServeur('eth_getLogs', []);\n    if (!Number.isSafeInteger(tete) || tete <= 0) throw new Error('head unreadable');\n    const nextId"],
  ['nonLuPasVide', "if (duelsSrv.contrat !== contrat || duelsSrv.tete === null) { rendreD({ ok: false, etat: 'NON_LU'", "if (false) { rendreD({ ok: false, etat: 'NON_LU'"],
];
for (const [k, de, vers] of srvMutants) {
  vu(SRV.split(de).length === 2, 'mutant serveur ' + k + ' : le motif existe une fois');
  vu(srvChecks[k](SRV.replace(de, vers)) === false, 'MUTANT serveur ' + k + ' : la verification ROUGIT');
}
console.log('ok duels-app - ' + n + ' assertions ; NE PROUVE PAS le rendu ni un duel reel');
