/* test-duels-v2-app-20261024.mjs — BLOCKDUELS V2 COTE APP, EXECUTE (pas lu) : le module de plan v2, la route /api/duels du serveur, le brain,
 *   et le VRAI code de la carte (ligneDuel, actionDuel, tranches d app.html) sur une FAUSSE chaine (eth_call duels(id) encode comme le contrat
 *   v2, statut Defaulted compris). Rien n est signe : envoyerAppels est un temoin qui note les appels et rend un recu fabrique.
 * AFFIRME :
 *   A. duels-v2-plan.js : selecteur settleDefault et topic DefaultWon = l ABI COMPILEE de BlockDuelsV2 ; etats (OUVERT, EXPIRE, ATTENTE,
 *      REGLABLE, DEFAULT_CREATOR, GAGNE_DEFAUT ; jamais REMBOURSABLE) ; actions (SETTLE dans la fenetre, SETTLE_DEFAULT apres, REFUND
 *      seulement un ouvert expire, jamais un rejoint) ; planSettleDefault refuse dans la fenetre ; planJoin refuse sans temps de bloc mesure et
 *      porte la ligne « Settle within about N s… or the creator wins by default » ; JSON v2 (un defaut a un autre que le createur : refuse).
 *   B. serveur : la route /api/duels (tranche REELLE de serveur-web.js) sert v2 (version 2) par l ETAT, AUCUN eth_getLogs, chaque etat classe,
 *      la ligne avantJoin au temps mesure ; contratDeFicheV2 exige adresse ET bloc.
 *   C. brain-jeu.js : v2 -> DUEL_SETTLE dans la fenetre (ses duels), DUEL_SETTLE_DEFAULT apres (a tous, 0 USDC), DUEL_JOIN avec la ligne
 *      seulement si le temps de bloc est mesure, dans les limites (plafond, budget, solde) ; jamais un remboursement d un duel rejoint.
 *   D. la carte (code REEL d app.html) : textes et boutons par etat ; Accept absent sans mesure ; le join dit la ligne AVANT l unique envoi,
 *      puis attend le bloc et propose Settle (aucun second envoi : rien ne se signe seul) ; Settle by default paie le createur (DefaultWon lu).
 * Modules remplacables (muter-duels-v2-app.mjs) : DUELS_V2_MODULE, DUELS_V2_SERVEUR, BRAIN_JEU_MODULE, APP_HTML, SERVEUR_WEB.
 *   F. (2026-10-25, v2 deploye) l etat LIVE avec la fiche REELLE du depot : /api/duels sert version 2 sur son contrat, creer / rejoindre ouverts
 *      sans regleur ; v1 reste ferme. E. Fees & risks suit la fiche (le texte « pas signe » reste prouve sur une copie).
 * ⛔ PORTABLE : process.exitCode. NE PROUVE PAS : le rendu dans un navigateur, un vrai wallet, le contrat sur Base (lu ici par un faux noeud). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur, topic } from './keccak.js';
import { texteBlocs } from './temps-de-bloc.js';
import { FENETRE } from './blockrolls-plan.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, f)).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const essai = (f) => { try { return f(); } catch (e) { return 'THROW ' + (e && e.message); } };
const V2 = await imp(process.env.DUELS_V2_MODULE || 'duels-v2-plan.js');
const S = await imp(process.env.DUELS_V2_SERVEUR || 'duels-v2-serveur.js');
const J = await imp(process.env.BRAIN_JEU_MODULE || 'brain-jeu.js');
const lire = (f) => fs.readFileSync(path.isAbsolute(f) ? f : path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const APP = lire(process.env.APP_HTML || 'app.html'), SRV = lire(process.env.SERVEUR_WEB || 'serveur-web.js');
const tranche = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const ART = JSON.parse(lire('contracts/out/BlockDuelsV2.sol/BlockDuelsV2.json'));

const adr = (h) => '0x' + h.repeat(20).slice(0, 40);
const C = adr('c2'), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', A = adr('a1'), B = adr('b1'), TIERS = adr('7e');
const ZERO = '0x' + '0'.repeat(40);
const T = 1_800_000_000, TETE = 60_000;
const hx = (v) => '0x' + BigInt(v).toString(16);
const u = (v) => BigInt(v).toString(16).padStart(64, '0');
const aw = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const pack = (g) => (g[0] << 16) | (g[1] << 12) | (g[2] << 7) | (g[3] << 3) | g[4];
const g = (k) => [k % 6, k % 10, k % 19, k % 9, k % 8];
const hashDe = (b) => '0x' + (BigInt(b) * 0x9e3779b97f4a7c15n + 12345n).toString(16).padStart(64, '7').slice(-64);
const STATUT = { None: 0, Open: 1, Joined: 2, Settled: 3, Cancelled: 4, Refunded: 5, Defaulted: 6 };
const retourDuel = (d) => '0x' + [aw(d.creator || ZERO), u(d.expiresAt || 0), u(STATUT[d.statut || 'None']), u(d.guessA ? pack(d.guessA) : 0), aw(d.joiner || ZERO), u(d.targetBlock || 0),
  u(d.guessB ? pack(d.guessB) : 0), aw(d.token || ZERO), u(d.stake || 0n)].join('');

/* ═════════════════════════════════════ A. le module de plan v2 */
console.log('— A. duels-v2-plan.js (execute)');
ok(selecteur(V2.SIG_SETTLE_DEFAULT).slice(2) === ART.methodIdentifiers['settleDefault(uint256)'], 'settleDefault(uint256) : ' + selecteur(V2.SIG_SETTLE_DEFAULT) + ' = l ABI compilee de BlockDuelsV2');
const evAbi = ART.abi.find((x) => x.type === 'event' && x.name === 'DefaultWon');
ok(evAbi && V2.EV_DEFAULT_WON === 'DefaultWon(' + evAbi.inputs.map((i) => i.type).join(',') + ')' && evAbi.inputs[0].indexed && evAbi.inputs[1].indexed && !evAbi.inputs[2].indexed, 'DefaultWon(uint256 indexed, address indexed, uint256) = l ABI compilee');
for (const sig of ['create(address,uint256,uint8[5],uint64)', 'join(uint256,uint8[5])', 'settle(uint256)', 'cancel(uint256)', 'refundExpired(uint256)', 'claim(address,address)', 'nextId()', 'duels(uint256)'])
  ok(ART.methodIdentifiers[sig] === selecteur(sig).slice(2), 'v2 garde le selecteur v1 de ' + sig);
ok(V2.STATUTS_V2.join() === 'None,Open,Joined,Settled,Cancelled,Refunded,Defaulted', 'statuts v2 : ceux de v1, Defaulted ajoute a la fin');
const ouvert = { id: '1', creator: A, token: USDC, stake: 1_000_000n, guessA: g(1), expiresAt: T + 3600, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false, defaulted: null };
const pris = (t, x = {}) => ({ ...ouvert, id: '2', joiner: B, guessB: g(2), targetBlock: t, ...x });
const e = (d, tete = TETE, now = T) => V2.etatDuel(d, tete, now).etat;
ok(e(ouvert) === 'OUVERT' && e(ouvert, TETE, T + 3600) === 'EXPIRE', 'ouvert : OUVERT, puis EXPIRE a expiresAt');
/* R5 (test live Grok game39, 2026-10-25) : REGLABLE tant qu un settle envoye maintenant tombe dans la fenetre (tete + marge <= cible + 256) ;
 *   la marge par defaut = V2.MARGE_DEFAUT (temps de bloc non mesure, pris au plus court) ; ensuite TROP_TARD (aucune action), puis le defaut */
const M = V2.MARGE_DEFAUT;
ok(M >= 1 && e(pris(TETE)) === 'ATTENTE' && e(pris(TETE - 1)) === 'REGLABLE' && e(pris(TETE - 256 + M)) === 'REGLABLE' && e(pris(TETE - 257 + M)) === 'TROP_TARD' && e(pris(TETE - 256)) === 'TROP_TARD' && e(pris(TETE - 257)) === 'DEFAULT_CREATOR',
  'rejoint : ATTENTE au bloc cible, REGLABLE de cible+1 a cible+256-marge (' + M + '), TROP_TARD jusqu a cible+256, DEFAULT_CREATOR a cible+257 (jamais REMBOURSABLE)');
ok(e(pris(TETE - 300, { defaulted: { winner: A, payout: 1_800_000n } })) === 'GAGNE_DEFAUT' && V2.FINIS.includes('GAGNE_DEFAUT'), 'gagne par defaut : GAGNE_DEFAUT, un etat FINI');
const act = (d, moi, ouv = true) => V2.actionsDuel(d, moi, TETE, T, ouv).join();
ok(act(ouvert, B) === 'JOIN' && act(ouvert, A) === 'CANCEL' && act(ouvert, B, false) === '' && act(ouvert, null) === '', 'ouvert : JOIN (un autre), CANCEL (le createur), rien sans wallet ou ferme');
ok(act(pris(TETE - 10), TIERS) === 'SETTLE' && act(pris(TETE - 257), TIERS) === 'SETTLE_DEFAULT' && act(pris(TETE - 257), B) === 'SETTLE_DEFAULT', 'rejoint : SETTLE dans la fenetre, SETTLE_DEFAULT apres (pour tous, le joueur compris)');
ok(V2.actionsDuel(ouvert, A, TETE, T + 3600).join() === 'REFUND' && ![TETE - 10, TETE - 257, TETE - 5000].some((t) => /REFUND/.test(act(pris(t), A))), 'REFUND : seulement un ouvert expire ; un rejoint ne se rembourse JAMAIS');
const pd = V2.planSettleDefault({ contrat: C, id: '2', targetBlock: TETE - 257, blocActuel: TETE });
ok(pd.etat === 'PRET' && pd.appels.length === 1 && pd.appels[0].to === C && pd.appels[0].data === selecteur('settleDefault(uint256)') + u(2), 'planSettleDefault apres la fenetre : UN appel settleDefault(2) vers le contrat');
ok(V2.planSettleDefault({ contrat: C, id: '2', targetBlock: TETE - 256, blocActuel: TETE }).etat === 'REFUSE' && V2.planSettleDefault({ contrat: C, id: '2', targetBlock: TETE, blocActuel: TETE }).etat === 'REFUSE'
  && V2.planSettleDefault({ contrat: C, id: '2' }).etat === 'REFUSE', 'planSettleDefault refuse au dernier bloc reglable, au bloc cible, et sans cible / tete');
ok(V2.planSettle({ contrat: C, id: '2', targetBlock: TETE - 257, blocActuel: TETE }).etat === 'REFUSE' && /creator wins by default/.test(V2.planSettle({ contrat: C, id: '2', targetBlock: TETE - 257, blocActuel: TETE }).pourquoi)
  && V2.planSettle({ contrat: C, id: '2', targetBlock: TETE - 256 + M, blocActuel: TETE }).etat === 'PRET'
  && V2.planSettle({ contrat: C, id: '2', targetBlock: TETE - 256, blocActuel: TETE }).etat === 'REFUSE' && /Too late to settle safely/.test(V2.planSettle({ contrat: C, id: '2', targetBlock: TETE - 256, blocActuel: TETE }).pourquoi),
  'planSettle : PRET au dernier bloc SUR (cible + 256 - marge), refuse au dernier bloc de la fenetre (il serait mine apres : TooLate) et apres (le pourquoi dit le defaut)');
ok(V2.planRefund({ contrat: C, id: '2', duel: pris(TETE - 300) }).etat === 'REFUSE' && V2.planRefund({ contrat: C, id: '1', duel: ouvert, maintenant: T + 3600 }).etat === 'PRET'
  && V2.planRefund({ contrat: C, id: '1', duel: ouvert, maintenant: T }).etat === 'REFUSE', 'planRefund : refuse un rejoint et un ouvert pas expire ; PRET pour un ouvert expire');
ok(V2.phraseAvantJoin(2) === 'Settle within about 512 s after the result block (256 blocks at the measured block time) or the creator wins by default.' && V2.phraseAvantJoin(0.2) === 'Settle within about 51 s after the result block (256 blocks at the measured block time) or the creator wins by default.'
  && V2.phraseAvantJoin(null) === null && V2.phraseAvantJoin(NaN) === null && V2.phraseAvantJoin(500) === null, 'la ligne avant join : 512 s a 2 s/bloc, 51 s a 200 ms ; non mesure (ou aberrant) : null');
const pj = V2.planJoin({ contrat: C, duel: ouvert, guess: g(3), moi: B, maintenant: T, sParBloc: 2 });
ok(pj.etat === 'PRET' && pj.appels.length === 2 && pj.avertissement === V2.phraseAvantJoin(2) && pj.appels[1].data.startsWith(selecteur('join(uint256,uint8[5])')), 'planJoin mesure : approve EXACT + join, et la ligne a dire');
ok(V2.planJoin({ contrat: C, duel: ouvert, guess: g(3), moi: B, maintenant: T, sParBloc: null }).etat === 'REFUSE' && V2.planJoin({ contrat: C, duel: ouvert, guess: g(3), moi: B, maintenant: T }).etat === 'REFUSE', 'planJoin sans temps de bloc mesure : REFUSE (la fenetre ne se dit pas)');
ok(V2.duelsOuverts({ version: 2, ok: true, contrat: C }) === true && V2.duelsOuverts({ version: 1, ok: true, contrat: C }) === false && V2.duelsOuverts({ version: 2, ok: false, contrat: C }) === false && V2.duelsOuverts(null) === false, 'duelsOuverts v2 : version 2, lu, avec un contrat ; sinon ferme');
const jsonDef = (w) => V2.duelEnJson({ ...pris(TETE - 300), defaulted: { winner: w, payout: 1_800_000n } });
ok(V2.duelDepuisJson(jsonDef(A))?.defaulted?.payout === 1_800_000n && V2.duelDepuisJson(jsonDef(B)) === null && V2.duelDepuisJson(V2.duelEnJson(ouvert))?.defaulted === null, 'JSON v2 : un defaut au createur passe ; a un AUTRE (le joueur) : refuse ; sans defaut : null');
const logDef = { address: C, topics: [topic(V2.EV_DEFAULT_WON), '0x' + u(2), '0x' + aw(A)], data: '0x' + u(1_800_000n) };
const evd = V2.lireEvenementsDuel([logDef], C);
ok(evd.length === 1 && evd[0].type === 'DEFAULT_WON' && evd[0].id === '2' && evd[0].winner === A && evd[0].payout === 1_800_000n && V2.lireEvenementsDuel([{ ...logDef, address: TIERS }], C).length === 0, 'DefaultWon decode (id, gagnant, gain) ; un autre contrat : ignore');

/* ═════════════════════════════════════ B. le serveur : la route REELLE, par l etat */
console.log('— B. /api/duels (tranche reelle de serveur-web.js) + duels-v2-serveur.js');
function noeud(duels, contrat = C) { /* 2026-10-25 : `contrat` = le seul contrat lisible (F : celui de la fiche REELLE) ; tout autre eth_call jette */
  const nd = { appels: [] };
  nd.rpc = async (m, p) => {
    nd.appels.push(m);
    if (m === 'eth_blockNumber') return hx(TETE);
    if (m === 'eth_getLogs') throw new Error('getLogs must not be used');
    if (m === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16); return { number: hx(b), hash: hashDe(b), timestamp: hx(T + b * 2) }; }
    if (m === 'eth_call') {
      if (String(p[0].to).toLowerCase() !== contrat) throw new Error('unexpected eth_call target');
      if (p[0].data === selecteur('nextId()')) return '0x' + u(duels.size + 1);
      if (p[0].data.startsWith(selecteur('duels(uint256)'))) return retourDuel(duels.get(Number(BigInt('0x' + p[0].data.slice(10)))) || {});
    }
    throw new Error('unexpected ' + m);
  };
  return nd;
}
const FICHE = { contrat: 'BlockDuelsV2', chaine: 8453, adresse: C, bloc: 52_900_000, constructeur: { usdc: USDC, devWallet: adr('dd'), rewardPool: adr('ee'), guardian: adr('dd') } };
ok(S.contratDeFicheV2(FICHE) === C && S.contratDeFicheV2({ ...FICHE, bloc: null }) === null && S.contratDeFicheV2({ ...FICHE, adresse: null }) === null && S.contratDeFicheV2({ ...FICHE, contrat: 'BlockDuels' }) === null,
  'contratDeFicheV2 : adresse ET bloc ecrits, contrat BlockDuelsV2 ; sinon null (v1 sert, comme aujourd hui)');
const srcRoute = tranche(SRV, "if (chemin === '/api/duels') {", '/* ══ BLOCK MISSIONS');
ok(srcRoute.length > 500 && /const lv2 = duelsV2\(\);\n    if \(lv2\) \{/.test(srcRoute), 'la route /api/duels essaie v2 d abord (duelsV2()), avant tout le chemin v1');
const DUELS = new Map([
  [1, { creator: A, expiresAt: T + 3600, statut: 'Open', guessA: g(1), token: USDC, stake: 1_000_000n }],
  [2, { creator: A, expiresAt: T - 5, statut: 'Open', guessA: g(2), token: USDC, stake: 1_000_000n }],
  [3, { creator: A, expiresAt: T + 3600, statut: 'Joined', guessA: g(3), joiner: B, targetBlock: TETE - 10, guessB: g(4), token: USDC, stake: 2_000_000n }],
  [4, { creator: A, expiresAt: T + 3600, statut: 'Joined', guessA: g(5), joiner: B, targetBlock: TETE - 300, guessB: g(6), token: USDC, stake: 2_000_000n }],
  [5, { creator: A, expiresAt: T + 3600, statut: 'Defaulted', guessA: g(7), joiner: B, targetBlock: TETE - 900, guessB: g(8), token: USDC, stake: 100_001n }],
  [6, { creator: A, expiresAt: T + 3600, statut: 'Settled', guessA: g(9), joiner: B, targetBlock: TETE - 1000, guessB: g(10), token: USDC, stake: 1_000_000n }],
  [7, { creator: B, expiresAt: T + 3600, statut: 'Joined', guessA: g(11), joiner: A, targetBlock: TETE, guessB: g(12), token: USDC, stake: 1_000_000n }],
]);
const nd = noeud(DUELS);
const lecteur = S.creerLecteurDuelsV2({ rpc: nd.rpc, contrat: C, intervalleMs: 0 });
/* 2026-10-24 (revue n°2) : la route dit le temps de bloc PRUDENT (sParBlocServi : longue + courte) ; ici les deux valent 2 s */
/* R2 (2026-10-25) : la route repond APRES lireAvantReponse (attendue sur ?frais=1) — le banc attend la reponse (res.end) */
const route = new Function('duelsV2', 'sParBlocSrv', 'createurParBlock', 'reponseDuelsV2', 'DUELS_V2_DEPLOIEMENT', 'tempsDeBlocSrv', 'mesureCourteSrv', 'sParBlocServi', 'lireAvantReponse', 'demandeFraiche',
  'return async function route(req, res, chemin) {\n' + srcRoute + '\n};')(() => lecteur, async () => 2, new Map([['0x' + 'b0'.repeat(20), A]]), S.reponseDuelsV2, FICHE, { sParBloc: 2 }, { lire: async () => 2, etat: () => ({ sParBloc: 2 }) }, () => 2, S.lireAvantReponse, S.demandeFraiche);
const attendreCorps = async (res) => { for (let k = 0; k < 2000 && res.corps === null; k++) await new Promise((r) => setTimeout(r, 1)); };
const get = async () => { await lecteur.lire(true); const res = { corps: null, writeHead() {}, end(s) { this.corps = s; } }; await route({ method: 'GET' }, res, '/api/duels'); await attendreCorps(res); return JSON.parse(res.corps); };
const realNow = Date.now; Date.now = () => T * 1000;
let J2;
try { J2 = await get(); } finally { Date.now = realNow; }
ok(J2.ok === true && J2.etat === 'LU' && J2.version === 2 && J2.contrat === C && J2.nextId === 8, '/api/duels sert v2 : ok, LU, version 2, le contrat de la fiche, nextId 8');
ok(!nd.appels.includes('eth_getLogs'), 'AUCUN eth_getLogs (la liste vient de l etat)');
const tous2 = [...J2.duels, ...J2.recents], et2 = (id) => (tous2.find((d) => d.id === String(id)) || {}).etat;
ok([1, 2, 3, 4, 5, 6, 7].map(et2).join() === 'OUVERT,EXPIRE,REGLABLE,DEFAULT_CREATOR,GAGNE_DEFAUT,REGLE,ATTENTE', 'chaque etat classe : ' + [1, 2, 3, 4, 5, 6, 7].map(et2).join(','));
ok(J2.aReclamer === 1 && J2.avantJoin === V2.phraseAvantJoin(2) && J2.fenetreS === 512 && J2.tempsDeBloc.sParBloc === 2 && J2.regles.apresFenetre === 'DEFAULT_CREATOR', 'servi : 1 duel a reclamer par defaut, la ligne avant join a 2 s/bloc (512 s), la regle apres la fenetre');
const d5 = V2.duelDepuisJson(tous2.find((d) => d.id === '5'));
ok(d5 && d5.defaulted && d5.defaulted.winner === A && d5.defaulted.payout === 180_001n, '#5 Defaulted : gagnant = createur, gain = splitOf(100 001).gagnant = 180 001 (comme le contrat)');
ok(tous2.every((d) => V2.duelDepuisJson(d) !== null) && (tous2.find((d) => d.id === '1') || {}).creatorBlocks?.length === 1, 'les 7 duels servis passent duelDepuisJson v2 ; la Map connait le block du createur');
while (lecteur.etat().enVol) await new Promise((r) => setTimeout(r, 1)); /* le tour lance par la route (void lv2.lire()) se finit d abord */
const appels0 = nd.appels.length; await lecteur.lire(true);
const relus = nd.appels.slice(appels0).filter((a) => a === 'eth_call').length;
ok(relus === 1 + 5, 'tour suivant : nextId + les 5 non finaux relus (Defaulted, Settled finaux jamais relus) : ' + relus + ' eth_call');
const ndKo = noeud(new Map([[1, { creator: A, expiresAt: T + 3600, statut: 'Defaulted', guessA: g(1), token: USDC, stake: 1_000_000n }]]));
const lk = S.creerLecteurDuelsV2({ rpc: ndKo.rpc, contrat: C, intervalleMs: 0 }); await lk.lire(true);
ok(lk.etat().cache.size === 0 && /unreadable/.test(lk.etat().erreur || ''), 'un Defaulted SANS joueur (incoherent) n est jamais servi ; l erreur est dite');

/* ═════════════════════════════════════ C. le brain (execute) */
console.log('— C. brain-jeu.js (execute, duels v2)');
const W = A;
const base = (list, x = {}, duels = {}) => ({ authorized: true, wallet: W, now: T, budgetUsdc: '5000000', spentUsdc: '0', balanceUsdc: '5000000',
  rules: { rolls: false, settle: false, duels: true, maxDuelStakeUsdc: '2000000', ...x }, history: [], seen: [],
  duels: { contract: C, usdc: USDC, guess: g(13), expiresIn: 3600, block: TETE, list, open: true, version: 2, sParBloc: 2, ...duels } });
const autreOuvert = { ...ouvert, id: '9', creator: B };
const pJ = J.prochaineProposition(base([autreOuvert]));
ok(pJ.kind === 'DUEL_JOIN' && pJ.why.startsWith(V2.phraseAvantJoin(2)) && /a tie not settled in it goes to the creator/.test(pJ.why), 'v2, temps mesure : DUEL_JOIN, la ligne de la fenetre EN TETE du texte, l egalite dite');
const pJn = J.prochaineProposition({ ...base([autreOuvert], {}, { sParBloc: null }), history: [{ t: T - 60, kind: 'DUEL_CREATE' }] }); /* un create cette heure : le pourquoi du join se lit */
ok(pJn.kind !== 'DUEL_JOIN' && /block time is not measured/.test(String(pJn.why)), 'v2, temps non mesure : aucun DUEL_JOIN, le pourquoi le dit (' + String(pJn.why).slice(0, 80) + ')');
ok(J.prochaineProposition(base([{ ...autreOuvert, stake: 3_000_000n }])).kind !== 'DUEL_JOIN' && J.prochaineProposition(base([autreOuvert], {}, {})).kind === 'DUEL_JOIN'
  && J.prochaineProposition({ ...base([autreOuvert]), balanceUsdc: '900000' }).kind !== 'DUEL_JOIN', 'DUEL_JOIN dans les limites : au-dessus du plafond ou du solde, jamais');
const reg = pris(TETE - 10, { creator: TIERS, joiner: W });
const pS = J.prochaineProposition(base([reg]));
ok(pS.kind === 'DUEL_SETTLE' && pS.costUsdc === '0' && pS.cle === 'DUEL_SETTLE:2' && pS.calls[0].data === selecteur('settle(uint256)') + u(2) && /creator wins by default/.test(pS.why), 'son duel reglable : DUEL_SETTLE (settle), 0 USDC, le texte dit ce qui arrive apres');
const def = pris(TETE - 300, { creator: TIERS, joiner: adr('5e') });
const pD = J.prochaineProposition(base([def]));
ok(pD.kind === 'DUEL_SETTLE_DEFAULT' && pD.costUsdc === '0' && pD.calls.length === 1 && pD.calls[0].data === selecteur('settleDefault(uint256)') + u(2) && pD.cle === 'DUEL_SETTLE:2', 'un duel d AUTRES apres la fenetre : DUEL_SETTLE_DEFAULT propose a tous (settleDefault, 0 USDC)');
const pDc = J.prochaineProposition(base([pris(TETE - 300)]));
ok(pDc.kind === 'DUEL_SETTLE_DEFAULT' && /\(you\) wins by default/.test(pDc.why), 'son duel de createur apres la fenetre : DUEL_SETTLE_DEFAULT « (you) wins by default »');
ok(J.prochaineProposition({ ...base([def]), seen: ['DUEL_SETTLE:2'] }).kind !== 'DUEL_SETTLE_DEFAULT', 'un defaut deja signe (cle vue) : pas re-propose');
ok(J.prochaineProposition(base([{ ...def, id: '3' }, pris(TETE - 300, { id: '8' })])).cle === 'DUEL_SETTLE:8', 'deux defauts : celui dont ce wallet est le createur d abord (#8), meme plus recent que celui d un autre (#3)');
ok(J.prochaineProposition(base([def], { maxDuelStakeUsdc: '0' })).kind === 'DUEL_SETTLE_DEFAULT', 'le defaut ne coute rien : propose meme a mise max 0');
ok(J.prochaineProposition(base([pris(TETE - 300, { defaulted: { winner: A, payout: 1n } })])).kind !== 'DUEL_SETTLE_DEFAULT', 'un duel deja gagne par defaut : plus rien');
const brainProps = [reg, def, pris(TETE - 5000), { ...ouvert, expiresAt: T - 1 }].map((d) => J.prochaineProposition(base([d])));
ok(brainProps.every((p) => !p.calls || !p.calls.some((c) => c.data.startsWith(selecteur('refundExpired(uint256)')))) || brainProps[3].calls[0].data.startsWith(selecteur('refundExpired(uint256)')),
  'aucun refundExpired propose pour un duel REJOINT (seul son defi ouvert expire l est)');
ok(brainProps[3].kind === 'DUEL_SETTLE' && brainProps[3].calls[0].data === selecteur('refundExpired(uint256)') + u(1) && [0, 1, 2].every((i) => !brainProps[i].calls.some((c) => c.data.startsWith(selecteur('refundExpired(uint256)')))),
  'son defi jamais pris et expire : refundExpired ; les rejoints : settle ou settleDefault, jamais refund');
ok(J.KINDS.includes('DUEL_SETTLE_DEFAULT'), 'DUEL_SETTLE_DEFAULT est un genre du brain');

/* ═════════════════════════════════════ D. la carte : le code REEL d app.html */
console.log('— D. la carte Duels (ligneDuel, actionDuel : tranches reelles d app.html)');
const dateReelle = Date.now; Date.now = () => T * 1000; /* l instant du banc (les duels servis sont dates par rapport a T) */
const srcLigne = tranche(APP, 'async function ligneDuel(', '/** la carte Duels');
const srcAction = tranche(APP, 'async function actionDuel(', '/** Challenge :');
const srcDuelsDe = (APP.match(/const duelsDe = [^\n]*\n/) || [''])[0];
const srcBoutons = (APP.match(/const BOUTON_DUEL = [^\n]*\n/) || [''])[0];
ok(srcLigne.length > 2000 && srcAction.length > 2000 && srcDuelsDe && srcBoutons, 'tranches trouvees : ligneDuel, actionDuel, duelsDe, BOUTON_DUEL');
function el(tag) {
  const x = { tag, className: '', dataset: {}, attrs: {}, children: [], textContent: '', innerHTML: '', hidden: false, type: '',
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); },
    tous() { return [this, ...this.children.flatMap((c) => (c && c.tous ? c.tous() : []))]; },
    querySelector(s) { return s === '[data-detat]' ? this.tous().find((c) => c.dataset && c.dataset.detat === '1') || null : null; },
    querySelectorAll() { return []; } };
  return x;
}
const document = { createElement: el };
const monterCarte = ({ sParBlocApp = 2, j, tete = TETE, envois, logs = [] }) => {
  const env = { document, Duels: V2, sParBlocApp, FENETRE_ROLLS: FENETRE, texteBlocs, duelsCfg: { focus: null, j }, compte: B,
    montantDuel: async (b) => String(b) + ' raw', faceDuelHtml: () => '', faceBlocHtml: () => '', courtAdr: (a) => String(a).slice(0, 6), logoSvg: () => '', paramsLogoDepuisApparence: () => ({}),
    lireDuelsServis: async () => j, duelContrat: (x) => (x && x.contrat) || null, _t: tete,
    /* 2026-10-24 (revue n°1) : le join relit duels(id) sur la chaine avant le plan (le duel #1 y est Open) */
    rpc: async (m, p) => { if (m === 'eth_blockNumber') { env._t += 1; return hx(env._t); } if (m === 'eth_call' && String(p[0].data).startsWith(selecteur('duels(uint256)'))) return retourDuel(DUELS.get(Number(BigInt('0x' + p[0].data.slice(10)))) || {}); throw new Error(m); },
    /* le bloc de suivi (revue n°1) : sa boucle attend sur un setTimeout du banc qui ne rappelle jamais (elle est executee par test-duels-v2-suivi) */
    rpcReseau: async (m) => { if (m === 'eth_blockNumber') return hx(env._t); throw new Error(m); }, rpcTete: { n: 0, t: 0, v: null }, $: () => null, setTimeout: () => 0,
    peindreDuels: async () => null, peindreDuelsMap: async () => null, tirerFaceDeRoll: () => ({ guess: g(14), apparence: {} }), bcSolde: async () => 10_000_000n, symDuel: () => 'USDC',
    admisDuel: async () => true, phraseNonConfirme: (r, t) => t, toursAttente: () => 400, pasAttente: () => 0,
    envoyerAppels: async (appels, c) => { envois.push({ appels, c }); return { etat: 'CONFIRME', hash: '0x' + 'ab'.repeat(32) }; },
    recusLogs: async () => ({ logs }) };
  const noms = Object.keys(env).filter((k) => !k.startsWith('_'));
  const f = new Function(...noms, '__env', srcDuelsDe + srcBoutons + srcSuivi + srcLigne + '\n' + srcAction + '\nreturn { ligneDuel, actionDuel, duelsDe };');
  return { env, ...f(...noms.map((k) => env[k]), env) };
};
const srcSuivi = tranche(APP, '/* ══ LE SUIVI D UN DUEL REJOINT', '/* fin du suivi d un duel rejoint */');
const textes = (li) => li.tous().filter((c) => c.tag === 'p').map((c) => c.textContent).join(' | ');
/* les boutons d ACTION (data-action) ; « Copy link » (R4, data-lien) n en est pas une */
const boutons = (li) => li.tous().filter((c) => c.tag === 'button' && c.dataset.action).map((c) => c.dataset.action).join();
{
  const K = monterCarte({ j: J2, envois: [] });
  const ds = K.duelsDe(J2), dd = (id) => ds.find((x) => x.id === String(id)) || K.duelsDe(J2, 'recents').find((x) => x.id === String(id));
  const L = async (id, moi = B, s = 2) => { const K2 = s === 2 ? K : monterCarte({ j: J2, envois: [], sParBlocApp: s }); return K2.ligneDuel(dd(id), moi, TETE, T, true); };
  const l1 = await L(1);
  ok(boutons(l1) === 'JOIN' && textes(l1).includes(V2.phraseAvantJoin(2)), 'ouvert (un autre wallet) : Accept, et la ligne « Settle within about 512 s … creator wins by default » AVANT tout join');
  const l1n = await L(1, B, null);
  ok(boutons(l1n) === '' && textes(l1n).includes(V2.PHRASE_SANS_MESURE), 'temps de bloc NON mesure : aucun bouton Accept (jamais un bouton qui refuserait), la phrase le dit');
  const l1a = await L(1, A);
  /* R3 (test live Grok game39) : le createur voit la regle de la fenetre lui aussi (c est lui qui gagne par defaut) */
  ok(boutons(l1a) === 'CANCEL' && textes(l1a).includes(V2.phraseAvantJoin(2)), 'son propre defi : Cancel, et la ligne de la fenetre (R3 : le createur doit savoir quand le defaut s applique)');
  const l3 = await L(3);
  ok(boutons(l3) === 'SETTLE' && textes(l3).includes('After that, the creator wins by default.') && !/both are refunded/.test(textes(l3)), 'reglable : Settle ; « After that, the creator wins by default. » (plus « both are refunded »)');
  const l4 = await L(4, TIERS);
  ok(boutons(l4) === 'SETTLE_DEFAULT' && /the creator wins by default: 3600000 raw \(90%\)\. Anyone may send it\./.test(textes(l4)), 'fenetre passee : « Settle · creator wins by default », le gain du createur (90 %), n importe qui');
  const l5 = await L(5);
  ok(boutons(l5) === '' && /\(the creator\) won 180001 raw by default \(90%\)/.test(textes(l5)), 'gagne par defaut : le texte dit le gain du createur, aucun bouton');
  ok(boutons(await L(2, A)) === 'REFUND' && !/REFUND/.test([l3, l4, l5, await L(7)].map(boutons).join()), 'Refund : seulement le defi ouvert expire ; jamais sur un rejoint');
}
{
  /* le JOIN : la ligne dite AVANT l unique envoi ; puis le bloc attendu et Settle propose — aucun second envoi */
  const envois = [];
  const jn = { address: C, topics: [topic('Joined(uint256,address,uint8[5],uint256)'), '0x' + u(1), '0x' + aw(B)], data: '0x' + g(14).map(u).join('') + u(TETE + 2), blockNumber: hx(TETE), logIndex: '0x0', transactionHash: '0x' + '01'.repeat(32) };
  const K = monterCarte({ j: J2, envois, logs: [jn] });
  const li = el('div'); const note = el('p'); note.dataset.detat = '1'; li.append(note);
  await K.actionDuel('1', 'JOIN', li);
  ok(envois.length === 1 && envois[0].appels.length === 2 && envois[0].appels[1].data.startsWith(selecteur('join(uint256,uint8[5])')), 'Accept : UN seul envoi (approve EXACT + join)');
  /* 2026-10-24 (revue n°1) : plus d attente aveugle dans actionDuel — le duel est SUIVI (test-duels-v2-suivi) ; la note le dit */
  ok(/Settle shows here as soon as it is in/.test(note.textContent) && /After that, the creator wins by default\./.test(note.textContent) && K.env.duelsCfg.focus === '1', 'apres le join : « Settle shows here as soon as it is in … After that, the creator wins by default. », la carte reste sur CE duel');
}
{
  /* la ligne AVANT la signature : la note porte la ligne au moment de l envoi */
  const envois = [];
  const K = monterCarte({ j: J2, envois, logs: [] });
  const li = el('div'); const note = el('p'); note.dataset.detat = '1'; li.append(note);
  let noteAuMoment = null;
  const f = new Function(...Object.keys(K.env).filter((k) => !k.startsWith('_')), srcDuelsDe + srcBoutons + srcSuivi + srcLigne + '\n' + srcAction + '\nreturn actionDuel;');
  const envT = { ...K.env, envoyerAppels: async (appels) => { noteAuMoment = note.textContent; envois.push(appels); return { etat: 'CONFIRME', hash: '0x' + 'cd'.repeat(32) }; } };
  const actionDuel2 = f(...Object.keys(K.env).filter((k) => !k.startsWith('_')).map((k) => envT[k]));
  await actionDuel2('1', 'JOIN', li);
  ok(noteAuMoment !== null && noteAuMoment.startsWith(V2.phraseAvantJoin(2)) && envois.length === 1, 'au moment de l envoi, la carte dit DEJA « ' + String(noteAuMoment).slice(0, 60) + '… » (la ligne avant la signature)');
}
{
  /* Settle by default : settleDefault, DefaultWon relu */
  const envois = [];
  const dw = { address: C, topics: [topic(V2.EV_DEFAULT_WON), '0x' + u(4), '0x' + aw(A)], data: '0x' + u(3_600_000n) };
  const K = monterCarte({ j: J2, envois, logs: [dw] });
  const li = el('div'); const note = el('p'); note.dataset.detat = '1'; li.append(note);
  await K.actionDuel('4', 'SETTLE_DEFAULT', li);
  ok(envois.length === 1 && envois[0].appels.length === 1 && envois[0].appels[0].data === selecteur('settleDefault(uint256)') + u(4), 'Settle by default : UN envoi settleDefault(4)');
  ok(/\(the creator\) won 3600000 raw by default\./.test(note.textContent), 'DefaultWon relu sur le recu : « (the creator) won … by default » (lu : ' + note.textContent + ')');
  const envois2 = [], K3 = monterCarte({ j: J2, envois: envois2 });
  const li3 = el('div'); const n3 = el('p'); n3.dataset.detat = '1'; li3.append(n3);
  await K3.actionDuel('4', 'REFUND', li3);
  await K3.actionDuel('3', 'SETTLE_DEFAULT', li3);
  ok(envois2.length === 0 && /Not possible any more/.test(n3.textContent), 'Refund d un rejoint, ou defaut DANS la fenetre : rien n est demande');
}
{
  /* la commande « duel » du Chat (bcAccepterDuel, code REEL) : la ligne de la fenetre est dite AVANT le bouton « Sign in your wallet » */
  const srcAcc = tranche(APP, 'async function bcAccepterDuel(', '/* ══ LE BRAIN OS');
  const monterChat = (sParBlocApp) => {
    const env = { etapes: [], boutons: [], signes: [] };
    const deps = { bcAvecWallet: async () => true, compte: B, lireDuelsServis: async () => J2, duelContrat: (x) => (x && x.contrat) || null, Duels: V2, sParBlocApp, FENETRE_ROLLS: FENETRE, texteBlocs, duelsCfg: { j: J2 } /* duelsDe lit les recus gardes (revue n°1) */,
      rpc: async () => hx(TETE + 1), tirerFaceDeRoll: () => ({ guess: g(14) }), bcSolde: async () => 10_000_000n, symDuel: () => 'USDC', montantDuel: async (b) => String(b) + ' raw', admisDuel: async () => true,
      bcEtape: (m, t) => { env.etapes.push(t); }, bcBoutons: (m, b) => { env.boutons.push({ apres: env.etapes.length, b }); },
      bcSigner: async (m, appels) => { env.signes.push(appels); return { ok: true }; }, peindreDuels: async () => null };
    const noms = Object.keys(deps);
    const f = new Function(...noms, srcDuelsDe + srcAcc.replace(/\n\/\*[\s\S]*$/, '') + '\nreturn bcAccepterDuel;');
    return { env, acc: f(...noms.map((k) => deps[k])) };
  };
  ok(srcAcc.length > 1000, 'tranche bcAccepterDuel trouvee');
  const X = monterChat(2);
  await X.acc({}, '1');
  const iLigne = X.env.etapes.findIndex((t) => t === V2.phraseAvantJoin(2));
  ok(iLigne >= 0 && X.env.boutons.length === 1 && X.env.boutons[0].apres > iLigne && X.env.boutons[0].b[0][0] === 'Sign in your wallet' && X.env.signes.length === 0,
    'Chat : la ligne « Settle within about 512 s … » est dite AVANT le bouton Sign ; rien n est signe sans l appui');
  await X.env.boutons[0].b[0][1]();
  ok(X.env.signes.length === 1 && X.env.signes[0].length === 2 && /After that, the creator wins by default\./.test(X.env.etapes[X.env.etapes.length - 1]), 'Chat : apres l appui, UN lot (approve + join) ; le texte dit « After that, the creator wins by default. »');
  const Y = monterChat(null);
  await Y.acc({}, '1');
  ok(Y.env.boutons.length === 0 && Y.env.etapes.some((t) => /Not planned: The block time is not measured/.test(t)), 'Chat, temps de bloc non mesure : aucun bouton Sign, le pourquoi le dit');
}Date.now = dateReelle;
/* le texte de la regle (« How it works », la carte) et la route du plan : le code de la carte la dit en v2 */
ok(/const rf = \$\('#regleDuelsFenetre'\); if \(rf\) rf\.textContent = 'Not accepted in time: the stake goes back to its creator\. ' \+ fen \+ ', even on a tie\.';/.test(APP) && /<span id="regleDuelsFenetre">/.test(APP),
  'How it works : en v2, « … the creator wins by default, even on a tie. » remplace la phrase v1 du remboursement');
ok(/Duels = moduleDuels\(j\);/.test(APP) && /const moduleDuels = \(j\) => \(j && j\.version === DuelsV2\.VERSION \? DuelsV2 : DuelsV1\);/.test(APP), 'app : le module de duel = celui de la version SERVIE (v2 seulement si /api/duels dit version 2)');
ok(/if \(duels\) Object\.assign\(duels, \{ version: jd\.version === DuelsV2\.VERSION \? DuelsV2\.VERSION : 1, sParBloc: sParBlocApp \}\);/.test(APP), 'brain de l app : version et temps de bloc mesure passes au brain');
/* ═════════════════════════════════════ F. L ETAT LIVE (2026-10-25) : la fiche REELLE du depot porte l adresse de BlockDuelsV2
 *   (noter-deploiement-duelsv2, bloc 53 064 205). Execute avec CETTE fiche (jamais une fiche fabriquee) : le VRAI duelsV2() de serveur-web.js
 *   cree le lecteur sur SON contrat, la route /api/duels sert version 2, et creer / rejoindre sont ouverts SANS regleur (la reponse v2 n a pas
 *   de champ regleur, duelsOuverts v2 ne le lit pas) ; v1 reste ferme (DUELS_REGLEUR_SUFFIT), meme si une reponse dit le contraire. */
console.log('— F. etat live : la fiche REELLE du depot (duels-v2-deploiement.js)');
const { DUELS_V2_DEPLOIEMENT: DV2 } = await imp('duels-v2-deploiement.js');
const { DUELS_DEPLOIEMENT: DV1 } = await imp('duels-deploiement.js');
const P1 = await imp('duels-plan-app.js');
const CV2 = S.contratDeFicheV2(DV2);
ok(CV2 !== null && CV2 === DV2.adresse && Number.isSafeInteger(DV2.bloc) && DV2.bloc > 0 && CV2 !== String(DV1.adresse).toLowerCase(), 'la fiche du depot porte adresse ET bloc : contratDeFicheV2 = ' + CV2 + ' (bloc ' + DV2.bloc + '), pas le contrat v1');
const srcDuelsV2 = tranche(SRV, 'let lecteurDuelsV2 = null;', 'setInterval(() => { const l = duelsV2();');
ok(/function duelsV2\(\) \{\n  const c = contratDeFicheV2\(DUELS_V2_DEPLOIEMENT\);\n  if \(!c\) return null;/.test(srcDuelsV2), 'tranche REELLE de serveur-web.js : duelsV2() lit le contrat de la fiche (contratDeFicheV2)');
const creesSur = [];
const ndL = noeud(new Map([[1, { creator: A, expiresAt: T + 3600, statut: 'Open', guessA: g(1), token: USDC, stake: 1_000_000n }]]), CV2);
const monterDuelsV2 = (fiche) => new Function('contratDeFicheV2', 'DUELS_V2_DEPLOIEMENT', 'creerLecteurDuelsV2', 'rpcDuelsV2', srcDuelsV2 + '\nreturn duelsV2;')(
  S.contratDeFicheV2, fiche, (o) => { creesSur.push(o.contrat); return S.creerLecteurDuelsV2({ ...o, intervalleMs: 0 }); }, ndL.rpc);
ok(monterDuelsV2(Object.freeze({ ...DV2, adresse: null, bloc: null }))() === null && creesSur.length === 0, 'temoin : la MEME fiche ramenee a avant le deploiement -> duelsV2() null (la route resterait sur v1, fermee)');
const duelsV2Live = monterDuelsV2(DV2);
const routeL = new Function('duelsV2', 'sParBlocSrv', 'createurParBlock', 'reponseDuelsV2', 'DUELS_V2_DEPLOIEMENT', 'tempsDeBlocSrv', 'mesureCourteSrv', 'sParBlocServi', 'lireAvantReponse', 'demandeFraiche',
  'return async function route(req, res, chemin) {\n' + srcRoute + '\n};')(duelsV2Live, async () => 2, new Map(), S.reponseDuelsV2, DV2, { sParBloc: 2 }, { lire: async () => 2, etat: () => ({ sParBloc: 2 }) }, () => 2, S.lireAvantReponse, S.demandeFraiche);
let JL;
{
  const dn = Date.now; Date.now = () => T * 1000;
  try { await duelsV2Live().lire(true); const res = { corps: null, writeHead() {}, end(s) { this.corps = s; } }; await routeL({ method: 'GET' }, res, '/api/duels'); await attendreCorps(res); JL = JSON.parse(res.corps); } finally { Date.now = dn; }
  while (duelsV2Live().etat().enVol) await new Promise((r) => setTimeout(r, 1));
}
ok(JL.ok === true && JL.etat === 'LU' && JL.version === 2 && JL.contrat === DV2.adresse && JL.bloc === DV2.bloc && JL.usdc === DV2.constructeur.usdc && creesSur.length >= 1 && creesSur.every((c) => c === DV2.adresse),
  '/api/duels avec la fiche REELLE : version 2, LU, contrat ' + JL.contrat + ', bloc ' + JL.bloc + ' (le lecteur cree sur ce contrat seulement)');
ok(!ndL.appels.includes('eth_getLogs') && ndL.appels.includes('eth_call'), 'lu par l etat (eth_call sur le contrat de la fiche, tout autre cible jette), AUCUN eth_getLogs');
ok(!('regleur' in JL) && V2.duelsOuverts(JL) === true, 'creer / rejoindre OUVERTS sans regleur : la reponse v2 n a aucun champ regleur, duelsOuverts v2 = true');
const srcModule = (APP.match(/const moduleDuels = \(j\) => [^\n]*\n/) || [''])[0];
const moduleDuels = new Function('DuelsV2', 'DuelsV1', srcModule + 'return moduleDuels;')(V2, P1);
ok(srcModule && moduleDuels(JL) === V2 && moduleDuels({ ok: true, contrat: DV1.adresse }) === P1, 'app (tranche reelle moduleDuels) : la reponse live -> le module v2 ; une reponse v1 -> le module v1');
const duelLive = V2.duelDepuisJson(JL.duels.find((d) => d.id === '1'));
ok(duelLive && V2.actionsDuel(duelLive, B, TETE, T, V2.duelsOuverts(JL)).join() === 'JOIN' && /const ouv = Duels\.duelsOuverts\(j\);\n  \{ const fo = \$\('#duelForm'\); if \(fo\) fo\.hidden = !ouv; \}/.test(APP),
  'la carte : Accept propose sur le duel ouvert live ; le formulaire de creation n est cache que si duelsOuverts est faux');
const pLiveJ = J.prochaineProposition(base([{ ...autreOuvert }], {}, { contract: CV2, open: V2.duelsOuverts(JL) }));
const pLiveC = J.prochaineProposition(base([], {}, { contract: CV2, open: V2.duelsOuverts(JL) }));
ok(pLiveJ.kind === 'DUEL_JOIN' && pLiveC.kind === 'DUEL_CREATE' && pLiveC.calls.every((c) => [CV2, USDC].includes(String(c.to).toLowerCase())), 'brain, contrat live : DUEL_JOIN sur un duel ouvert, DUEL_CREATE sans duel (appels vers le contrat de la fiche et USDC)');
/* v1 reste FERME : meme une reponse qui dirait regleDuels true, meme un brain a qui on dirait open true */
const repV1 = { ok: true, etat: 'LU', contrat: DV1.adresse, regleur: { etat: 'ON', regleDuels: true } };
ok(P1.duelsOuverts(repV1) === false && P1.duelsFermesParContrat(DV1.adresse) === true && P1.regleurSuffit(DV1.adresse) === false && P1.duelsFermesParContrat(CV2) === false,
  'v1 (' + DV1.adresse + ') reste ferme : duelsOuverts v1 faux meme si la reponse dit regleDuels true ; le contrat v2 n est pas declare ferme');
const pV1 = [J.prochaineProposition(base([{ ...autreOuvert }], {}, { contract: DV1.adresse, open: true, version: 1 })), J.prochaineProposition(base([], {}, { contract: DV1.adresse, open: true, version: 1 })),
  /* et SEULE l adresse changee par rapport au cas live ouvert ci-dessus (version 2, open true) : c est le contrat qui ferme */
  J.prochaineProposition(base([{ ...autreOuvert }], {}, { contract: DV1.adresse, open: true })), J.prochaineProposition(base([], {}, { contract: DV1.adresse, open: true }))];
ok(pV1.every((p) => !['DUEL_JOIN', 'DUEL_CREATE'].includes(p.kind)), 'brain, contrat v1 avec open true : ni DUEL_JOIN ni DUEL_CREATE (' + pV1.map((p) => p.kind).join(', ') + ')');

/* ═════════════════════════════════════ E. « Fees & risks » (frais-risques.js, execute) */
console.log('— E. Fees & risks : la section des duels');
const FR = await imp('frais-risques.js');
const vraiFR = FR.rendre(FR.CHIFFRES, null);
/* 2026-10-25 : v2 deploye -> la page suit la fiche (deploye = contratDeFicheV2 non nul) ; le texte d avant (nouveaux duels fermes, pourquoi,
 *   v2 pas signe) reste PROUVE sur une copie des chiffres ou v2 n est pas signe (C0), jamais retire */
const v2Signe = CV2 !== null;
ok(FR.CHIFFRES.duels.v2.deploye === v2Signe && FR.CHIFFRES.duels.v2.adresse === DV2.adresse, 'Fees & risks lit la fiche v2 : deploye = ' + v2Signe + ', adresse = celle de la fiche');
const C0 = structuredClone(FR.CHIFFRES); C0.duels.v2 = { deploye: false, adresse: null };
const r0 = FR.rendre(C0, null);
ok(/Duels: new duels are closed\./.test(r0) && /prepared and not signed on Base yet/.test(r0) && /they could settle only their wins/.test(r0),
  'v2 pas signe : la page dit que les nouveaux duels sont fermes, pourquoi (v1), et que v2 attend sa signature');
ok(v2Signe ? /Duels: settle in time, or the creator wins\./.test(vraiFR) && !/new duels are closed/.test(vraiFR) && vraiFR.includes('https://basescan.org/address/' + DV2.adresse) : /Duels: new duels are closed\./.test(vraiFR),
  'la page servie aujourd hui suit la fiche : ' + (v2Signe ? 'v2 signe -> « settle in time, or the creator wins », lien vers ' + DV2.adresse : 'v2 pas signe -> nouveaux duels fermes'));
ok(/>Duel<\/th><td class="n">10% of the pot<\/td>/.test(vraiFR) && /90% of the pot to the winner, 7% to the reward pool wallet \(an ordinary wallet, not a contract[^)]*\) and 3% to TokenizedBlock/.test(vraiFR) /* game374 (audit F-duel-4): REWARD_POOL has no code on chain */, 'la ligne de frais d un duel : 10 % du pot (90 / 7 / 3), depuis duels-plan.js');
const C2 = structuredClone(FR.CHIFFRES); C2.duels.v2 = { deploye: true, adresse: C };
const r2 = FR.rendre(C2, { tempsDeBloc: { sParBloc: 2 } }), r3 = FR.rendre(C2, null), r4 = FR.rendre(C2, { tempsDeBloc: { sParBloc: 0.2 } });
ok(/Duels: settle in time, or the creator wins\./.test(r2) && /in the 256 blocks after its result block \(about 512 s at the measured block time\)/.test(r2) && /That includes a tie not settled in time\./.test(r2) && !/new duels are closed/.test(r2),
  'v2 signe : « settle in time, or the creator wins », la fenetre au temps MESURE (512 s), l egalite non reglee dite');
ok(/the block time was not measured just now/.test(r3) && /about 51 s at the measured block time/.test(r4), 'temps non mesure : dit ; a 200 ms/bloc : 51 s (jamais une duree supposee)');console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS le rendu ni un vrai wallet');
if (ko) process.exitCode = 1;
