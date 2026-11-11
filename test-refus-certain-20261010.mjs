/* test-refus-certain-20261010.mjs — UN REFUS CERTAIN DE L ARCHIVE NE COUTE RIEN (version REDUITE) ; LE RESTE PART COMME A HEAD ; CE QUI
 * PART SUR LE RESEAU EST COMPTE PAR HOTE.
 *
 * Mesure prod (2026-10-10 16:27-16:31 UTC, rapporte a l heure, budget d archive epuise) : 4 044 refus de budget par heure ('route
 *   /api/prix-usd' 1 468, 'fond routeur' 1 318, 'fond nos-blocks' 1 198) ; chaque refus coutait d abord 4 requetes publiques et 1,8 s.
 * Ce banc EXECUTE le code livre (serveur-web.js : compteur d envois + callLarge, bloc d archive + rpcServeur + lecteurLogs,
 *   cleV4DuPoolId, resoudreClePool, les deux index, rpcRails, rpcActivite, rpcNaissance, reconstruireHolders) monte dans un
 *   « processus » neuf par cas, contre un FAUX RESEAU (fetch) calque sur les refus mesures le 2026-10-09 : base.org 429 a tout
 *   getLogs, publicnode 403 « des -9 000 » (repli-logs.js ; juge ici sur fromBlock — quel bout publicnode juge n est pas mesure),
 *   archive qui sert (ou 503, ou une non-liste, ou une fenetre COINCEE). Horloge et minuteurs factices : une pause demandee est
 *   comptee (temps simule), un minuteur >= 4 s est retenu (cadence des boucles).
 *   « Profonde » = tete - fromBlock >= PROFONDEUR_PUBLICNODE.
 *   A  budget epuise : une fenetre profonde de chacun des quatre consommateurs n envoie AUCUNE requete, reste NON LUE / en attente,
 *      la raison dit le budget du jour, elle est comptee par consommateur (archiveCompte.nonEnvoyeesParQui) ;
 *   Z  frontiere : -8 999 part, -9 000 et -9 001 ne partent pas (budget epuise) ; budget libre, -9 000 part a rpcServeur ;
 *   B  budget LIBRE : une fenetre profonde part a rpcServeur comme a HEAD (base.org, publicnode, puis l archive) — B0 compare la liste
 *      des requetes, requete pour requete, a celle du serveur-web.js de e84e936 (git show) ;
 *   S  (revue r2, MEDIUM) budget libre, une fenetre profonde que l archive refuse sans cesse : par tour, memes requetes et memes pauses
 *      que HEAD — appels d archive par tour et par seconde simulee <= HEAD ;
 *   C  une fenetre NON ENVOYEE n est pas relue sur place (REPRISES) ;
 *   D  rythme (UN mecanisme, rythme-fond.js) : nos-blocks a PAUSE_EPUISE_MS seulement avec une fenetre non envoyee ; le routeur, un tour
 *      par declenchement qui ne coute qu un eth_blockNumber ; routeurEnchaine inchange (D3) ; reprise apres 00:00 UTC ;
 *   E  cleV4DuPoolId : le lendemain, l absence (lue cette fois) est retenue ;
 *   F  compteurs d envois par hote : ce qui est compte = ce qui est parti (R6), jamais un chemin d URL ; /sante dit l unite (R7) ;
 *   G  un refus d archive qui N EST PAS de budget (503) se comporte comme avant (relu, compte, cadence 4 s) ;
 *   H  (R4) les holders sont INCHANGES ;
 *   P / W  le compteur des non envoyees est sauve toutes les 100, relu le meme jour, remis a zero un autre jour ; ecritures <= HEAD ;
 *   R1 seule une LISTE est une reponse d eth_getLogs, celle du PRINCIPAL comprise ;
 *   R2 une fenetre ENVOYEE dont l erreur commence par le texte du budget garde le traitement d avant (relue, pas de ralentissement, pas
 *      de « wait for 00:00 UTC ») ;
 *   R5 « attenteBudget » = les fenetres NON ENVOYEES seules, jamais remis a zero au debut d un tour ; R7 : le routeur ne recompte pas
 *      dans un tour une fenetre deja non envoyee.
 *   Puis chaque MUTANT des regles DOIT rougir (temoin : le code livre est vert).
 * Usage : node test-refus-certain-20261010.mjs [chemin/de/serveur-web.js] — sans argument, celui du depot. Un autre chemin rejoue le
 *   banc (sans mutants) sur ce fichier et les modules de son dossier : c est ainsi que le ROUGE AVANT est prouve.
 * ⛔ TEMOIN HEAD : `git show e84e936:serveur-web.js` (la base de ce correctif). Sans git, les cas B0, S et W rougissent en le disant.
 * ⛔ BORNE : ni les vrais noeuds ni le vrai volume ne sont exerces ; la prod le dira dans /sante.archive et /sante.envois.
 * ⛔ PORTABLE LF/CRLF : ancres et motifs de mutants sur une ligne (ou RegExp avec \r?\n).
 * serie-delai-s: 900 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const CIBLE = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ICI, 'serveur-web.js');
const DIR = path.dirname(CIBLE);
const imp = (f) => import(pathToFileURL(path.join(DIR, f)).href);
const SANTE_MOD = await imp('rpc-sante.js'); /* game362 */
const RL = await imp('repli-logs.js');
const RF = await imp('rythme-fond.js');
const IR = await imp('index-routeur.js');
const O = await imp('origine.js');
const SJ = await imp('soldes-jeton.js');
const { FEE_WALLET, CREATE_ROUTER } = await imp('frais-creation.js');
const { prochaineFenetre } = await imp('fenetre-scan.js');
const { frappesVers } = await imp('mes-blocks.js');
const { decoderInitialize } = await imp('pools-du-jeton.js');
const { LOGS_INITIALIZE_MESURES } = await imp('cles-v4-mesurees.js');
/* 2026-10-11 : cleV4DuPoolId consulte clesPool par cleV4Connue avant de balayer ; un arbre ANCIEN (argv[2]) n a pas ce module et ne
 *   l appelle pas : la doublure neutre (null) y est equivalente. Ici clesPool est vide : rien n est trouve, le routage juge reste le meme. */
const { cleV4Connue } = await imp('cle-v4-connue.js').catch(() => ({ cleV4Connue: () => null }));
const SRC = readFileSync(CIBLE, 'utf8');

/* le temoin HEAD : la base de ce correctif, lue dans git (jamais recopiee) */
const REF_HEAD = 'e84e936';
let SRC_HEAD = null, errHead = null;
try { SRC_HEAD = execFileSync('git', ['show', REF_HEAD + ':serveur-web.js'], { cwd: ICI, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); }
catch (e) { errHead = String((e && e.message) || e).slice(0, 160); }

/* constantes LUES dans le fichier livre, jamais recopiees */
const lire = (re, quoi) => { const m = re.exec(SRC); assert.ok(m, quoi + ' introuvable'); return m[1]; };
const PM_V4 = lire(/const PM_V4 = '(0x[0-9a-f]{40})';/, 'PM_V4');
const TOPIC_INITIALIZE = lire(/const TOPIC_INITIALIZE = '(0x[0-9a-f]{64})';/, 'TOPIC_INITIALIZE');
const PROF = Number(lire(/const PROFONDEUR_PUBLICNODE = (\d+);/, 'PROFONDEUR_PUBLICNODE'));
const PREMIER = Number(lire(/const PREMIER_BLOCK_TB = (\d+);/, 'PREMIER_BLOCK_TB'));
const GJ = O.GRAINE_NOS_JUSQUA, GJR = IR.GRAINE_JUSQUA;
const T = 52_400_000;
/* poolId FICTIF : surtout pas un des logs mesures (cles-v4-mesurees.js), que cleV4DuPoolId connait d avance et rend sans lire */
const ID_V4 = '0x' + 'ab'.repeat(32);
assert.ok(!LOGS_INITIALIZE_MESURES.some((l) => String(l.topics[1]).toLowerCase() === ID_V4), 'temoin : le poolId du banc est pre-rempli');
const JETON = '0xb2' + '0'.repeat(36) + 'aa';          /* jeton FICTIF pour /api/cle */
const JETON_B20 = '0xb20' + '0'.repeat(35) + 'cc';     /* jeton FICTIF pour les holders (forme 0xb20…) */
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const mot = (a) => '0x' + '0'.repeat(24) + String(a).toLowerCase().slice(2);

/* le faux reseau : hotes FICTIFS ou publics, aucune requete ne sort (fetch est remplace par instance) */
const URL_ARCHIVE = 'https://archive.exemple.test/rpc/v1/base/cleFACTICEdeBanc0123456789';
const BASE_ORG = 'https://mainnet.base.org', BASE_DEV = 'https://developer-access-mainnet.base.org';
const DRPC = 'https://base.drpc.org', UNRPC = 'https://1rpc.io/base';
const H_ARCHIVE = 'archive.exemple.test', H_PUBLICNODE = 'base-rpc.publicnode.com';
const H_BASE = ['mainnet.base.org', 'developer-access-mainnet.base.org'];
const PUBLICS = [...H_BASE, H_PUBLICNODE, 'base.drpc.org', '1rpc.io'];

/* o.archiveRend(q) / o.publicnodeRend(q) / o.baseRend(q) : ce que ces noeuds rendent pour un getLogs (base.org : 429 par defaut) ;
 * o.coince = { bloc, rend: '5xx' | 'null' } : l archive refuse SANS CESSE la fenetre qui contient ce bloc (revue r2) ;
 * o.publicnodeFlanche : nombre de 503 passagers de publicnode sur des fenetres RECENTES avant de servir ;
 * o.codeEnPanne : eth_getCode en erreur 500 ; c.teteIllisible (modifiable en cours de cas) : eth_blockNumber rend `null`. */
function chaine(o = {}) {
  const c = { tete: o.tete, envois: [], archive: o.archive || 'sert', coupures: o.coupures || 0, logs: o.logs || (() => []), autresHotes: o.autresHotes || null,
    archiveRend: o.archiveRend || null, publicnodeRend: o.publicnodeRend || null, baseRend: o.baseRend || null, coince: o.coince || null,
    flanche: o.publicnodeFlanche || 0, codeEnPanne: Boolean(o.codeEnPanne), teteIllisible: false };
  const rep = (statut, j) => ({ status: statut, ok: statut >= 200 && statut < 300, json: async () => j });
  c.fetch = async (url, init) => {
    const u = new URL(String(url));
    const corps = JSON.parse(init.body);
    const { id, method, params } = corps;
    const q = method === 'eth_getLogs' ? (params[0] || {}) : null;
    const e = { hote: u.host, chemin: u.pathname, methode: method, de: q ? parseInt(q.fromBlock, 16) : null, a: q ? parseInt(q.toBlock, 16) : null, classe: null };
    c.envois.push(e);
    const ok = (result) => { e.classe = 'ok'; return rep(200, { jsonrpc: '2.0', id, result }); };
    const non = (statut, message, classe) => { e.classe = classe; return rep(statut, { jsonrpc: '2.0', id, error: { code: -32000, message } }); };
    if (c.coupures > 0 && H_BASE.includes(u.host)) { c.coupures -= 1; e.classe = 'reseau'; throw new TypeError('fetch failed'); }
    if (c.autresHotes && c.autresHotes(u.host)) return non(500, 'internal error', 'erreur');
    if (method === 'eth_blockNumber') return ok(c.teteIllisible ? null : '0x' + c.tete.toString(16));
    if (method === 'eth_getLogs') {
      if (H_BASE.includes(u.host)) return c.baseRend ? ok(c.baseRend(q)) : non(429, 'over rate limit', 'limite');
      if (u.host === H_PUBLICNODE) {
        /* « 403 des -9 000 » (mesure du 2026-10-09, repli-logs.js) */
        if (c.tete - e.de >= PROF) return non(403, 'Archive requests require a personal token', 'erreur');
        if (c.flanche > 0) { c.flanche -= 1; return non(503, 'upstream 503 service unavailable', 'erreur'); }
        return ok(c.publicnodeRend ? c.publicnodeRend(q) : c.logs(q));
      }
      if (u.host === H_ARCHIVE) {
        if (c.coince && e.de <= c.coince.bloc && c.coince.bloc <= e.a) return c.coince.rend === 'null' ? ok(null) : non(503, 'upstream 503 service unavailable', 'erreur');
        return c.archive === '5xx' ? non(503, 'upstream 503 service unavailable', 'erreur') : ok(c.archiveRend ? c.archiveRend(q) : c.logs(q));
      }
      return non(400, 'getLogs not supported here', 'erreur');
    }
    if (method === 'eth_getTransactionReceipt') {
      const g = O.GRAINE_NOS_BLOCKS.find((x) => x.tx === String(params[0]).toLowerCase());
      return ok(g ? { status: '0x1', blockNumber: '0x' + g.bloc.toString(16), logs: [{ address: g.jeton, topics: [TOPIC_TRANSFER, mot('0x' + '0'.repeat(40)), mot(g.compte)] }] } : null);
    }
    if (method === 'eth_getCode') return c.codeEnPanne ? non(500, 'internal error', 'erreur') : ok('0x');
    if (method === 'eth_call') {
      if (u.host === 'base.drpc.org') { e.classe = 'limite'; return rep(429, null); }
      if (u.host === '1rpc.io') return ok('0x' + '00'.repeat(31) + '01');
      return ok('0x');
    }
    if (method === 'eth_simulateV1') return u.host === H_PUBLICNODE ? ok([{ calls: [] }]) : non(400, 'the method eth_simulateV1 does not exist', 'erreur');
    return non(400, 'method not simulated: ' + method, 'erreur');
  };
  return c;
}
const estGetLogs = (x) => x.methode === 'eth_getLogs';
/* profonde = fromBlock a PROF blocs ou plus sous la tete (le bloc le plus profond de la fenetre) */
const profondes = (c) => c.envois.filter((x) => estGetLogs(x) && c.tete - x.de >= PROF);
const deFenetre = (c, de, a) => c.envois.filter((x) => estGetLogs(x) && x.de === de && x.a === a);
const archives = (c) => c.envois.filter((x) => x.hote === H_ARCHIVE);
const getLogsArchive = (c) => c.envois.filter((x) => estGetLogs(x) && x.hote === H_ARCHIVE).length;
const getLogsPublicnode = (c) => c.envois.filter((x) => estGetLogs(x) && x.hote === H_PUBLICNODE).length;
const getLogsBase = (c) => c.envois.filter((x) => estGetLogs(x) && H_BASE.includes(x.hote)).length;
const sig = (x) => x.hote + ' ' + x.methode + ' ' + x.de + '-' + x.a;
const laisser = async (n = 40) => { for (let k = 0; k < n; k++) await new Promise((r) => setImmediate(r)); };
const jusqua = async (cond, quoi, n = 4000) => { for (let k = 0; k < n; k++) { if (cond()) return; await new Promise((r) => setImmediate(r)); } throw new Error('attente sans fin : ' + quoi); };

/* ── les tranches du fichier livre ───────────────────────────────────────────────────────────────────────────────────────────── */
function trancher(src) {
  const entre = (debut, fin, opt = {}) => {
    const i = src.indexOf(debut);
    assert.ok(i >= 0, 'ancre introuvable : ' + debut);
    if (fin instanceof RegExp) { const m = fin.exec(src.slice(i)); assert.ok(m, 'fin introuvable apres ' + debut); return src.slice(i, i + m.index + m[0].length); }
    const j = src.indexOf(fin, i);
    assert.ok(j > i, 'fin introuvable : ' + fin);
    return src.slice(i, j + (opt.inclure ? fin.length : 0));
  };
  return [
    entre('let tourFaits = 0, idFaits = 0;', '/** Les faits on-chain d une pool'),
    entre('const clesV4Lues = new Map();', /async function cleV4DuPoolId\(id\) \{[\s\S]*?\r?\n\}\r?\n/),
    entre('let rpcId = 0, rpcTour = 0;', '/* ⛔ 2026-10-09 : le scan des creations (factory B20) a un REPLI getLogs'),
    entre('async function resoudreClePool(token, fenetres = 40) {', 'const clesPoolEnVol = new Map();', { inclure: true }),
    entre('const PAS_ROUTEUR = 2000;', '/* ══ QUI DETIENT UN BLOCK'),
    entre('let idRails = 0;', '/** La cle exacte d un block'),
    entre('const RPC_ACTIVITE = ', 'async function lireActiviteServeur'),
    entre('const RPC_SIMULATION = ', '/* le prix en dollars que l ECRAN lirait'),
    entre('async function reconstruireHolders(jeton) {', /\r?\n\}\r?\n/),
  ].join('\n');
}
const RETOUR = '\n; return { archiveCompte, consommateurArchive, archiveEpuisee, RE_BUDGET_ARCHIVE,'
  + " lecteurLogs: typeof lecteurLogs === 'function' ? lecteurLogs : null, envoisNoeuds: typeof envoisNoeuds === 'object' ? envoisNoeuds : null,"
  + ' callLarge, rpcRails, rpcServeur, rpcActivite, rpcNaissance, cleV4DuPoolId, clesV4Absentes, resoudreClePool, clesPoolAbsentes, routeurEtat, nosBlocksEtat,'
  + ' etendreNosBlocks, etendreBlocksRouteur, rattraperNosBlocks, rattraperBlocksRouteur, nosBlocksCorps, blocksRouteurCorps, nosBlocksComplet,'
  + ' routeurEnCours: () => routeurEnCours, reconstruireHolders };';
const PARAMS = ['fetch', 'process', 'ESSAI_SRV', 'existsSync', 'join', 'readFileSync', 'writeFileSync', 'renameSync', 'AsyncLocalStorage',
  'lecteurUrl', 'lecteurUrlNu', 'classeEnvoi', 'avecRepliLogs', 'RPC_LIST', 'RPC_FAITS_POOL', 'setTimeout', 'setInterval', 'Date', 'console',
  'LOGS_INITIALIZE_MESURES', 'decoderInitialize', 'PM_V4', 'TOPIC_INITIALIZE', 'clesPool', 'cleV4Connue', 'clesCache',
  'scannerNesDuRouteur', 'GRAINE_ROUTEUR', 'GRAINE_JUSQUA', 'PLANCHER_ROUTEUR', 'RETARD_MAX_INDEX', 'neDuRouteur', 'ROUTEURS_ANCIENS',
  'FEE_WALLET', 'CREATE_ROUTER', 'graineNosBlocksAdmise', 'verifierGraineNos', 'NOS_BLOCKS_GENESE', 'GRAINE_NOS_BLOCKS', 'prochaineFenetre', 'frappesVers',
  'holdersCache', 'HOLDERS_MAX', 'lireNaissance', 'naissanceDuJeton', 'passeIncrementale', 'ecrireHolders', 'pauseNosBlocks', 'routeurEnchaine',
  /* 2026-10-25 : apprendreCreationAction (tranche du routeur) lit preuvesActions ; ici aucune action prouvee */
  'preuvesActions', 'prouverAction',
  /* game362: the server's shared RPC health state (rpc-sante.js), on THIS test's clock */
  'creerSante'];
const FICHIER_COMPTE_TMP = '/data/archive-compte.json.tmp';

/** Un « processus » neuf : le code livre, son faux reseau, son faux disque, son horloge et ses minuteurs. */
function monter(corpsSrc, { c, max = 3000, disque = new Map(), quand = '2026-10-10T12:00:00Z', faitsPool = [BASE_ORG, DRPC] /* 2026-10-10 : les listes par defaut de prod, sans les deux noeuds morts (developer-access 0/3 832, 1rpc 0/558) */, immediat = false } = {}) {
  const horloge = { t: Date.parse(quand) };
  const minuteur = { attente: [], pauses: 0 };
  const intervalles = [];
  const ecritures = { compte: 0 };
  const VraieDate = Date;
  const FDate = class extends VraieDate { constructor(...a) { if (a.length) super(...a); else super(horloge.t); } static now() { return horloge.t; } };
  const st = (fn, ms = 0, ...args) => {
    const t = { fn, ms: Number(ms) || 0, unref() { return t; }, ref() { return t; } };
    if (t.ms >= 4000 && !immediat) minuteur.attente.push(t); else { minuteur.pauses += t.ms; setImmediate(() => fn(...args)); }
    return t;
  };
  const avecFetch = (url, o = {}) => RL.lecteurUrl(url, { ...o, fetchImpl: c.fetch });
  const env = { BASE_RPC_ARCHIVE: URL_ARCHIVE, BASE_RPC_ARCHIVE_MAX_JOUR: String(max), TB_NOS_CREATEURS: '' };
  const muet = { log() {}, warn() {}, error() {} };
  const f = new Function(...PARAMS, '"use strict";\n' + corpsSrc + RETOUR);
  const M = f(c.fetch, { env }, { actif: false }, (p) => p === '/data' || disque.has(p), (...x) => x.join('/'),
    (p) => { if (!disque.has(p)) throw Object.assign(new Error('ENOENT ' + p), { code: 'ENOENT' }); return disque.get(p); },
    (p, v) => { if (p === FICHIER_COMPTE_TMP) ecritures.compte += 1; disque.set(p, String(v)); }, (a, b) => { disque.set(b, disque.get(a)); disque.delete(a); }, AsyncLocalStorage,
    avecFetch, avecFetch, RL.classeEnvoi, RL.avecRepliLogs, [BASE_ORG] /* RPC_LIST de prod depuis le 2026-10-10 */, faitsPool, st, (fn) => { intervalles.push(fn); return { unref() {} }; },
    FDate, muet, LOGS_INITIALIZE_MESURES, decoderInitialize, PM_V4, TOPIC_INITIALIZE, new Map(), cleV4Connue, new Map(),
    IR.scannerNesDuRouteur, IR.GRAINE_ROUTEUR, IR.GRAINE_JUSQUA, IR.PLANCHER_ROUTEUR, IR.RETARD_MAX_INDEX, IR.neDuRouteur, IR.ROUTEURS_ANCIENS,
    FEE_WALLET, CREATE_ROUTER, O.graineNosBlocksAdmise, O.verifierGraineNos, O.NOS_BLOCKS_GENESE, O.GRAINE_NOS_BLOCKS, prochaineFenetre, frappesVers,
    new Map(), 200, SJ.lireNaissance, SJ.naissanceDuJeton, SJ.passeIncrementale, () => {}, RF.pauseNosBlocks, RF.routeurEnchaine,
    new Map(), async () => { throw new Error('prouverAction ne doit pas etre appelee sans action prouvee'); },
    (o = {}) => SANTE_MOD.creerSante({ ...o, maintenant: () => horloge.t }));
  const jour = () => new FDate().toISOString().slice(0, 10);
  /* budget du jour EPUISE, comme la prod l ecrit (le jour courant, appels >= plafond) */
  const epuiser = () => Object.assign(M.archiveCompte, { jour: jour(), appels: max });
  return { ...M, c, minuteur, intervalles, horloge, disque, epuiser, jour, ecritures };
}
const qui = (m, l, fn) => m.consommateurArchive.run(l, fn);
const nonEnv = (m, l) => (m.archiveCompte.nonEnvoyeesParQui || {})[l] || 0;
const refus = (m, l) => (m.archiveCompte.refusParQui || {})[l] || 0;
/* progres-index.json tel que le code livre l ecrit : son minuteur de 5 s (retenu par le faux setTimeout) est declenche ici */
const progres = (m) => { for (const t of m.minuteur.attente.splice(0)) if (t.ms === 5000) t.fn(); const f = m.disque.get('/data/progres-index.json'); return f ? JSON.parse(f) : null; };
const fenetresTexte = (n) => new RegExp(': ' + n + ' window\\(s\\) wait for 00:00 UTC');

/* ── le temoin HEAD (e84e936) : memes scenarios, calcules une fois (le code de HEAD ne change pas d un mutant a l autre) ─────────── */
const corpsHead = SRC_HEAD ? trancher(SRC_HEAD) : null;
const memoHead = new Map();
const surHead = async (cle, fn) => {
  assert.ok(corpsHead, 'temoin HEAD (' + REF_HEAD + ') illisible : ' + errHead);
  if (!memoHead.has(cle)) memoHead.set(cle, await fn(corpsHead));
  return memoHead.get(cle);
};
/* un ou plusieurs tours d un consommateur : la liste des requetes (hote, methode, plage), les appels d archive et les pauses, PAR TOUR */
async function tours(corpsX, { conf, consommateur, n = 1, max = 3000, epuise = false }) {
  const c = chaine(conf); const m = monter(corpsX, { c, max }); if (epuise) m.epuiser();
  const res = [];
  for (let k = 0; k < n; k++) {
    const n0 = c.envois.length; m.minuteur.pauses = 0;
    if (consommateur === 'nos') await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    else if (consommateur === 'routeur') await qui(m, 'fond routeur', () => m.etendreBlocksRouteur());
    else if (consommateur === 'cleV4') await qui(m, 'route /api/prix-usd', () => m.cleV4DuPoolId(ID_V4));
    else if (consommateur === 'cle') await qui(m, 'route /api/cle/:adr', () => m.resoudreClePool(JETON).catch(() => null));
    const env = c.envois.slice(n0);
    res.push({ sigs: env.map(sig), archive: env.filter((x) => x.hote === H_ARCHIVE).length, publics: env.filter((x) => x.hote !== H_ARCHIVE).length, pauses: m.minuteur.pauses });
  }
  return { tours: res, ecritures: m.ecritures.compte, nos: { jusqua: m.nosBlocksEtat.jusqua, ratees: m.nosBlocksEtat.ratees }, routeur: { jusqua: m.routeurEtat.jusqua, ratees: m.routeurEtat.ratees } };
}

async function suite(source) {
  const corps = trancher(source);
  const res = [];
  const cas = async (id, f) => {
    if (process.env.REFUS_TRACE === '1') console.log('> ' + id.split(' ')[0]);
    try { await f(); res.push({ id, ok: true }); } catch (e) { res.push({ id, ok: false, err: String((e && e.message) || e).slice(0, 300) }); }
  };
  /* 7 fenetres de 2 000 sous la tete : 4 recentes (fromBlock a -1 999 .. -7 999), puis 3 PROFONDES (fromBlock a -9 999, -11 999,
   *   -13 999) — la premiere est « a cheval » (toBlock a -8 000) : profonde, jugee sur fromBlock. */
  const NOS = { tete: GJ + 14000 };
  const K_CHEVAL = [GJ + 14000 - 8000 - 1999, GJ + 14000 - 8000];

  /* ── A : budget epuise ─────────────────────────────────────────────────────────────────────────────────────────────────── */
  await cas('A1 nos-blocks, budget epuise : 0 requete pour les 3 fenetres profondes (a cheval comprise), en attente (3), plage figee, budget dit (3 fenetres), compte par consommateur', async () => {
    const c = chaine(NOS); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    assert.equal(profondes(c).length, 0, 'requetes envoyees pour des fenetres profondes : ' + profondes(c).length + ' ' + JSON.stringify(profondes(c).slice(0, 4)));
    assert.equal(deFenetre(c, K_CHEVAL[0], K_CHEVAL[1]).length, 0, 'fenetre a cheval envoyee');
    assert.equal(m.nosBlocksEtat.ratees, 3, 'fenetres en attente : ' + m.nosBlocksEtat.ratees);
    assert.equal(m.nosBlocksEtat.jusqua, GJ, 'la plage a avance sur des fenetres non lues');
    assert.equal(nonEnv(m, 'fond nos-blocks'), 3, 'fenetres non envoyees comptees : ' + JSON.stringify(m.archiveCompte.nonEnvoyeesParQui));
    assert.equal(refus(m, 'fond nos-blocks'), 0, 'refus de budget a l archive : ' + refus(m, 'fond nos-blocks'));
    const r = JSON.parse(m.nosBlocksCorps());
    assert.equal(r.fenetresEnAttente, 3); assert.equal(r.couvertureComplete, false);
    assert.match(String(r.attenteBudget), /daily budget/, 'la reponse ne dit pas le budget du jour');
    assert.match(String(r.attenteBudget), fenetresTexte(3), 'nombre de fenetres annoncees : ' + r.attenteBudget);
  });
  await cas('A2 routeur, budget epuise : 0 requete pour ses 2 fenetres profondes, en attente, plage figee, budget dit (2 fenetres), compte', async () => {
    const c = chaine({ tete: GJR + 14000 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond routeur', () => m.etendreBlocksRouteur());
    assert.equal(profondes(c).length, 0, 'requetes envoyees pour des fenetres profondes : ' + profondes(c).length);
    assert.equal(m.routeurEtat.ratees, 2); assert.equal(m.routeurEtat.jusqua, GJR);
    assert.equal(nonEnv(m, 'fond routeur'), 2, JSON.stringify(m.archiveCompte.nonEnvoyeesParQui));
    assert.equal(refus(m, 'fond routeur'), 0);
    const r = JSON.parse(m.blocksRouteurCorps());
    assert.equal(r.fenetresEnAttente, 2); assert.match(String(r.attenteBudget), /daily budget/); assert.match(String(r.attenteBudget), fenetresTexte(2));
  });
  await cas('A3 cleV4DuPoolId (/api/prix-usd), budget epuise : NON_LUE 55/59 qui dit le budget (55 en attente), 0 requete et 0 pause pour les 55 profondes, aucune absence retenue', async () => {
    const c = chaine({ tete: T }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    m.minuteur.pauses = 0;
    const r = await qui(m, 'route /api/prix-usd', () => m.cleV4DuPoolId(ID_V4));
    assert.equal(profondes(c).length, 0, 'requetes pour des fenetres profondes : ' + profondes(c).length + ' ; pauses demandees : ' + m.minuteur.pauses + ' ms');
    /* les 4 fenetres recentes (base.org 429 x 3 : 1,8 s chacune) coutent ce qu elles coutaient — inchange ; les 55 profondes : rien */
    assert.ok(m.minuteur.pauses <= 4 * 1800, 'pauses demandees : ' + m.minuteur.pauses + ' ms (au plus 4 x 1 800 attendus)');
    assert.equal(r && r.etat, 'NON_LUE', 'rendu : ' + JSON.stringify(r));
    assert.equal(r.ratees, 55); assert.equal(r.fenetres, 59);
    assert.match(r.pourquoi, /^55\/59 windows of 2000 blocks not read/); assert.match(r.pourquoi, /\(55 of them wait for the archive node daily budget/, 'la raison : ' + r.pourquoi);
    assert.equal(m.clesV4Absentes.has(ID_V4), false, 'une absence a ete retenue sur des fenetres non lues');
    assert.equal(nonEnv(m, 'route /api/prix-usd'), 55); assert.equal(refus(m, 'route /api/prix-usd'), 0);
  });
  await cas('A4 resoudreClePool (/api/cle), budget epuise, avec memoire : la premiere fenetre manquante est a -9 000 PILE — profonde, non envoyee, la resolution leve sur le budget, rien de retenu', async () => {
    const c = chaine({ tete: T }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    /* memoire d une plage lue [T-8001, T] : la plage manquante commence par [T-9000, T-8002] */
    const avant = { depuis: T - 8001, jusqua: T };
    m.clesPoolAbsentes.set(JETON, { ...avant });
    await assert.rejects(qui(m, 'route /api/cle/:adr', () => m.resoudreClePool(JETON)), /daily budget/);
    assert.equal(deFenetre(c, T - 9000, T - 8002).length, 0, 'la fenetre a -9 000 est partie : ' + JSON.stringify(deFenetre(c, T - 9000, T - 8002).map((x) => x.hote)));
    assert.equal(c.envois.filter(estGetLogs).length, 0, 'getLogs envoyes : ' + c.envois.filter(estGetLogs).length);
    assert.deepEqual(m.clesPoolAbsentes.get(JETON), avant, 'une resolution non lue a modifie la memoire');
    assert.equal(nonEnv(m, 'route /api/cle/:adr'), 1);
    assert.match(source.replace(/\/\*[\s\S]*?\*\//g, ' '), /ok: false, etat: 'NON_LU', pourquoi: 'pool key not read: '/, 'la route ne dit pas NON_LU');
  });
  await cas('A6 /api/cle, grille par DEFAUT et SANS memoire, budget epuise : la fenetre a cheval [T-9989, T-8991] et toutes les plus profondes envoient 0 requete ; les 9 recentes sont lues comme avant', async () => {
    const c = chaine({ tete: T }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await assert.rejects(qui(m, 'route /api/cle/:adr', () => m.resoudreClePool(JETON)), /daily budget/);
    const cheval = deFenetre(c, T - 9 * 999 - 998, T - 9 * 999);
    assert.equal(cheval.length, 0, 'requetes pour la fenetre a cheval : ' + cheval.length + ' ' + JSON.stringify(cheval.map((x) => x.hote + ' ' + x.classe)));
    assert.equal(profondes(c).length, 0, 'requetes pour des fenetres profondes : ' + profondes(c).length);
    for (let k = 0; k <= 8; k++) assert.equal(deFenetre(c, T - 999 * k - 998, T - 999 * k).length, 8, 'fenetre recente ' + k + ' : 2 topics x 4 attendus');
    const n = c.envois.filter(estGetLogs).length;
    assert.equal(n, 9 * 8, 'getLogs envoyes : ' + n + ' (9 fenetres recentes x 2 topics x 4 requetes attendus)');
    assert.equal(nonEnv(m, 'route /api/cle/:adr'), 1);
    assert.equal(m.clesPoolAbsentes.has(JETON), false, 'une absence a ete retenue sur une resolution non lue');
  });

  /* ── Z : la frontiere (>= : publicnode refuse « des -9 000 ») ─────────────────────────────────────────────────────────────── */
  await cas('Z1 lecteurLogs(T).rpc, budget epuise : fromBlock a -8 999 part (4 requetes, lue) ; -9 000 et -9 001 ne partent pas (NON_ENVOYEE) ; budget libre, -9 000 part a rpcServeur (base.org, publicnode, archive)', async () => {
    const c = chaine({ tete: T }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    assert.ok(m.lecteurLogs, 'pas de lecteurLogs');
    const q = (de) => [{ address: PM_V4, topics: [TOPIC_INITIALIZE], fromBlock: '0x' + de.toString(16), toBlock: '0x' + (de + 500).toString(16) }];
    const l = m.lecteurLogs(T);
    assert.deepEqual(await l.rpc('eth_getLogs', q(T - 8999)), []);
    assert.equal(deFenetre(c, T - 8999, T - 8499).length, 4, '-8 999 : ' + deFenetre(c, T - 8999, T - 8499).length + ' requetes');
    for (const d of [9000, 9001]) {
      await assert.rejects(l.rpc('eth_getLogs', q(T - d)), (e) => /daily budget/.test(e.message) && l.nonEnvoyee(e), '-' + d + ' : pas le refus certain');
      assert.equal(deFenetre(c, T - d, T - d + 500).length, 0, '-' + d + ' envoyee : ' + deFenetre(c, T - d, T - d + 500).length + ' requetes');
    }
    assert.equal(l.suivi.nonEnvoyees, 2);
    const c2 = chaine({ tete: T }); const m2 = monter(corps, { c: c2 });
    assert.deepEqual(await m2.lecteurLogs(T).rpc('eth_getLogs', q(T - 9000)), []);
    assert.deepEqual(deFenetre(c2, T - 9000, T - 8500).map((x) => x.hote), [H_BASE[0], H_BASE[0], H_BASE[0], H_PUBLICNODE, H_ARCHIVE] /* 2026-10-10 : RPC_LIST = base.org seul -> ses 3 essais, puis les replis */, 'budget libre, -9 000 : ' + JSON.stringify(deFenetre(c2, T - 9000, T - 8500).map((x) => x.hote)));
  });
  await cas('Z2 routeur, budget epuise : fenetre a fromBlock -9 000 PILE (tete = graine + 9 001) — 0 requete ; a -8 999 (tete = graine + 9 000) — lue, la plage avance', async () => {
    const c = chaine({ tete: GJR + 9001 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond routeur', () => m.etendreBlocksRouteur());
    assert.equal(deFenetre(c, GJR + 1, GJR + 1000).length, 0, 'fenetre a -9 000 envoyee : ' + deFenetre(c, GJR + 1, GJR + 1000).length);
    assert.equal(m.routeurEtat.ratees, 1); assert.equal(nonEnv(m, 'fond routeur'), 1); assert.equal(refus(m, 'fond routeur'), 0);
    const c2 = chaine({ tete: GJR + 9000 }); const m2 = monter(corps, { c: c2, max: 5 }); m2.epuiser();
    await qui(m2, 'fond routeur', () => m2.etendreBlocksRouteur());
    assert.equal(deFenetre(c2, GJR + 1, GJR + 1000).length, 4, 'fenetre a -8 999 : ' + deFenetre(c2, GJR + 1, GJR + 1000).length + ' requetes (4 = une lecture)');
    assert.equal(m2.routeurEtat.jusqua, GJR + 2000); assert.equal(nonEnv(m2, 'fond routeur'), 0);
  });

  /* ── B : budget LIBRE — comme HEAD ─────────────────────────────────────────────────────────────────────────────────────── */
  await cas('B0 budget libre, archive saine : nos-blocks, routeur, cleV4, /api/cle envoient EXACTEMENT les requetes de HEAD (e84e936), dans le meme ordre, avec les memes pauses', async () => {
    const scenarios = [['nos', { tete: GJ + 14000 }], ['routeur', { tete: GJR + 14000 }], ['cleV4', { tete: T }], ['cle', { tete: T }]];
    for (const [consommateur, conf] of scenarios) {
      const h = await surHead('B0 ' + consommateur, (cx) => tours(cx, { conf, consommateur }));
      const p = await tours(corps, { conf, consommateur });
      assert.ok(h.tours[0].sigs.length > 0, 'temoin vide : ' + consommateur);
      assert.deepEqual(p.tours[0].sigs, h.tours[0].sigs, consommateur + ' : requetes differentes de HEAD (' + p.tours[0].sigs.length + ' contre ' + h.tours[0].sigs.length + ')');
      assert.equal(p.tours[0].pauses, h.tours[0].pauses, consommateur + ' : pauses ' + p.tours[0].pauses + ' contre ' + h.tours[0].pauses + ' ms');
    }
  });
  await cas('B1 cleV4, budget libre : chaque fenetre profonde (55) passe par rpcServeur — 3 x base.org, publicnode (403), puis l archive UNE fois ; les recentes aux publics seuls', async () => {
    const c = chaine({ tete: T }); const m = monter(corps, { c });
    const r = await m.cleV4DuPoolId(ID_V4);
    assert.equal(r, null, 'tout lu, rien trouve : ' + JSON.stringify(r));
    for (let j = 1; j <= 59; j++) {
      const w = deFenetre(c, T - j * 2000, T - (j - 1) * 2000 - 1).map((x) => x.hote);
      if (j <= 4) assert.ok(w.length === 4 && w.every((h) => PUBLICS.includes(h)), 'fenetre recente ' + j + ' : ' + JSON.stringify(w));
      else assert.ok(w.length === 5 && w.filter((h) => H_BASE.includes(h)).length === 3 && w[3] === H_PUBLICNODE && w[4] === H_ARCHIVE, 'fenetre profonde ' + j + ' : ' + JSON.stringify(w));
    }
    assert.equal(getLogsArchive(c), 55); assert.equal(m.clesV4Absentes.has(ID_V4), true);
  });

  /* ── S : (revue r2, MEDIUM) une fenetre profonde que l archive refuse sans cesse, budget LIBRE — jamais plus que HEAD ─────────── */
  const coincee = async (id, consommateur, conf) => {
    const h = await surHead(id, (cx) => tours(cx, { conf, consommateur, n: 2 }));
    const p = await tours(corps, { conf, consommateur, n: 2 });
    /* REFUS_CHIFFRES=1 : les chiffres par tour, correctif contre HEAD (pour un rapport ; muet par defaut, les mutants rejouent ce cas) */
    if (process.env.REFUS_CHIFFRES === '1') for (let k = 0; k < 2; k++) console.log('  ' + id + ' tour ' + (k + 1) + ' : correctif ' + JSON.stringify({ requetes: p.tours[k].sigs.length, archive: p.tours[k].archive, publics: p.tours[k].publics, pausesMs: p.tours[k].pauses }) + ' / HEAD ' + JSON.stringify({ requetes: h.tours[k].sigs.length, archive: h.tours[k].archive, publics: h.tours[k].publics, pausesMs: h.tours[k].pauses }));
    for (let k = 0; k < 2; k++) {
      const [a, b] = [p.tours[k], h.tours[k]];
      assert.ok(b.archive > 0, 'temoin : HEAD n a rien demande a l archive au tour ' + (k + 1));
      assert.ok(a.archive <= b.archive, 'tour ' + (k + 1) + ' : ' + a.archive + ' appels d archive contre ' + b.archive + ' a HEAD');
      /* une seconde simulee = pauses du tour + la cadence de 4 s : le debit d archive ne depasse jamais celui de HEAD */
      assert.ok(a.archive / (a.pauses + 4000) <= b.archive / (b.pauses + 4000), 'tour ' + (k + 1) + ' : ' + a.archive + ' appels en ' + a.pauses + ' ms de pauses, contre ' + b.archive + ' en ' + b.pauses + ' ms a HEAD');
      /* game363: the general reader may now send its head reads (eth_blockNumber, eth_call latest...) to another HEALTHY host once base.org
       *   is set aside — the property of S stays: the deep eth_getLogs windows are EXACTLY HEAD's (host included), and the other reads keep the
       *   same methods and ranges in the same order (only their host may differ). */
      const logs = (x) => x.filter((q) => q.includes(' eth_getLogs '));
      const sansHote = (x) => x.filter((q) => !q.includes(' eth_getLogs ')).map((q) => q.slice(q.indexOf(' ') + 1));
      assert.deepEqual(logs(a.sigs), logs(b.sigs), 'tour ' + (k + 1) + ' : eth_getLogs differents de HEAD');
      assert.deepEqual(sansHote(a.sigs), sansHote(b.sigs), 'tour ' + (k + 1) + ' : autres lectures differentes de HEAD (hote mis a part)');
    }
    return { p, h };
  };
  await cas('S1 nos-blocks, budget libre, la fenetre profonde la plus basse refusee sans cesse (503) : jusqua fige, 20 fenetres relues a chaque tour — par tour, memes requetes, memes appels d archive, memes pauses que HEAD', async () => {
    const { p } = await coincee('S1', 'nos', { tete: GJ + 40000, coince: { bloc: GJ + 1, rend: '5xx' } });
    assert.equal(p.nos.jusqua, GJ, 'temoin : la fenetre coincee fige la plage');
  });
  await cas('S2 routeur, budget libre, sa premiere fenetre profonde refusee sans cesse (503) : par declenchement, memes requetes, memes appels d archive, memes pauses que HEAD', async () => {
    const { p } = await coincee('S2', 'routeur', { tete: GJR + 14000, coince: { bloc: GJR + 1, rend: '5xx' } });
    assert.equal(p.routeur.jusqua, GJR);
  });
  await cas('S3 nos-blocks, budget libre, l archive rend `result: null` pour la fenetre la plus basse (non-liste) : memes requetes que HEAD', async () => {
    const { p } = await coincee('S3', 'nos', { tete: GJ + 40000, coince: { bloc: GJ + 1, rend: 'null' } });
    assert.equal(p.nos.jusqua, GJ);
  });

  /* ── C : pas de relecture d une fenetre NON ENVOYEE ────────────────────────────────────────────────────────────────────── */
  await cas('C1 nos-blocks : les 3 fenetres NON ENVOYEES ne sont pas relues — une tentative chacune, aucune pause de REPRISES (seules les pauses de rpcServeur des 4 recentes)', async () => {
    const c = chaine(NOS); const m = monter(corps, { c, max: 5 }); m.epuiser();
    m.minuteur.pauses = 0;
    await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    assert.equal(nonEnv(m, 'fond nos-blocks'), 3, 'tentatives non envoyees : ' + nonEnv(m, 'fond nos-blocks'));
    assert.equal(m.minuteur.pauses, 4 * 1800, 'pauses demandees : ' + m.minuteur.pauses + ' ms (4 fenetres recentes x 1 800 attendus)');
  });
  await cas('C2 routeur : plage MIXTE (une fenetre profonde NON ENVOYEE, une recente lue) — la plage n est pas relue : la recente part une fois (4 requetes)', async () => {
    const tete = GJR + 9500; const c = chaine({ tete }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond routeur', () => m.etendreBlocksRouteur());
    assert.equal(deFenetre(c, GJR + 1, GJR + 1000).length, 0, 'fenetre profonde envoyee : ' + deFenetre(c, GJR + 1, GJR + 1000).length);
    assert.equal(deFenetre(c, GJR + 1001, GJR + 2000).length, 4, 'fenetre recente : ' + deFenetre(c, GJR + 1001, GJR + 2000).length + ' requetes (4 = une lecture)');
    assert.equal(nonEnv(m, 'fond routeur'), 1); assert.equal(refus(m, 'fond routeur'), 0);
    assert.equal(m.routeurEtat.ratees, 1); assert.equal(m.routeurEtat.jusqua, GJR);
    assert.match(String(JSON.parse(m.blocksRouteurCorps()).attenteBudget), fenetresTexte(1));
  });

  /* ── D : UN rythme (rythme-fond.js) ; reprise apres 00:00 UTC ─────────────────────────────────────────────────────────── */
  await cas('D1 nos-blocks : une fenetre non envoyee -> tour suivant dans PAUSE_EPUISE_MS (rythme-fond.js) ; le tour suivant recompte les MEMES 3 fenetres (+3, l unite publiee) ; 00:00 UTC -> reprise, lue jusqu a la tete, compteur remis a zero', async () => {
    const c = chaine(NOS); const m = monter(corps, { c, quand: '2026-10-10T23:50:10Z' }); m.epuiser();
    const prochain = () => m.minuteur.attente.find((t) => t.fn.name === 'pas');
    m.rattraperNosBlocks();
    await jusqua(() => prochain(), 'premier tour');
    let t = prochain();
    assert.equal(t.ms, RF.PAUSE_EPUISE_MS, 'tour suivant dans ' + t.ms + ' ms (' + RF.PAUSE_EPUISE_MS + ' attendus)');
    assert.equal(nonEnv(m, 'fond nos-blocks'), 3);
    m.minuteur.attente.splice(m.minuteur.attente.indexOf(t), 1); m.horloge.t += t.ms; t.fn(); /* 23:55:10 : toujours epuise */
    await jusqua(() => prochain(), 'deuxieme tour');
    t = prochain();
    assert.equal(t.ms, RF.PAUSE_EPUISE_MS, '2e tour suivant dans ' + t.ms + ' ms'); assert.equal(nonEnv(m, 'fond nos-blocks'), 6, 'un tour de plus : +3, memes fenetres');
    assert.equal(profondes(c).length, 0, 'fenetre profonde envoyee budget epuise');
    const archAvant = archives(c).length;
    m.minuteur.attente.splice(m.minuteur.attente.indexOf(t), 1); m.horloge.t += t.ms; t.fn(); /* 2026-10-11 00:00:10 */
    await jusqua(() => m.nosBlocksComplet(), 'reprise apres 00:00 UTC');
    assert.equal(m.jour(), '2026-10-11');
    assert.ok(archives(c).length > archAvant, 'aucune fenetre profonde envoyee apres 00:00 UTC');
    assert.equal(m.nosBlocksEtat.jusqua, NOS.tete); assert.equal(m.archiveCompte.jour, '2026-10-11');
    assert.equal(m.archiveCompte.nonEnvoyees, 0, 'le compteur d hier a survecu au changement de jour');
  });
  await cas('D2 routeur, budget epuise : chaque declenchement (visites a +1 s / +30 s / +59 s) fait UN tour qui n envoie qu un eth_blockNumber (0 getLogs) ; 00:00 UTC -> plus de « wait », reprise', async () => {
    const tete = GJR + 14000; const c = chaine({ tete }); const m = monter(corps, { c, quand: '2026-10-10T23:58:30Z' }); m.epuiser();
    const blockNumbers = () => c.envois.filter((x) => x.methode === 'eth_blockNumber').length;
    const visite = async () => { m.rattraperBlocksRouteur(); await laisser(); const p = m.routeurEnCours(); if (p) await p; await laisser(); };
    await visite();
    assert.equal(blockNumbers(), 1); assert.equal(m.routeurEtat.ratees, 2);
    for (const s of [1, 30, 59]) { m.horloge.t = Date.parse('2026-10-10T23:58:30Z') + s * 1000; await visite(); }
    assert.equal(blockNumbers(), 4, 'un tour par visite : ' + blockNumbers());
    assert.equal(c.envois.length, 4, 'requetes envoyees en 4 tours : ' + c.envois.length + ' (4 eth_blockNumber attendus) ' + JSON.stringify(c.envois.slice(0, 6).map(sig)));
    assert.equal(nonEnv(m, 'fond routeur'), 8, '2 fenetres x 4 tours : ' + nonEnv(m, 'fond routeur'));
    m.horloge.t = Date.parse('2026-10-10T23:59:50Z');
    assert.match(String(JSON.parse(m.blocksRouteurCorps()).attenteBudget), fenetresTexte(2));
    await laisser(); const p0 = m.routeurEnCours(); if (p0) await p0;
    m.horloge.t = Date.parse('2026-10-11T00:00:05Z'); /* le budget est revenu */
    assert.equal(JSON.parse(m.blocksRouteurCorps()).attenteBudget, null, 'la reponse dit encore « wait for 00:00 UTC » apres 00:00 UTC');
    await laisser(); const p1 = m.routeurEnCours(); if (p1) await p1; await laisser();
    await visite();
    assert.equal(m.routeurEtat.jusqua, tete, 'le routeur n a pas rattrape la tete : ' + m.routeurEtat.jusqua);
    assert.ok(archives(c).length > 0);
  });
  await cas('D3 routeur, budget epuise, tours PROPRES (fenetres recentes) : UN tour par declenchement (routeurEnchaine, 1365dcc, inchange) ; budget libre : il enchaine jusqu a la tete', async () => {
    const tete = GJR + 6000;
    const c = chaine({ tete }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    m.rattraperBlocksRouteur(); await laisser(); const p = m.routeurEnCours(); if (p) await p; await laisser();
    assert.equal(m.routeurEtat.ratees, 0); assert.equal(m.routeurEtat.jusqua, GJR + 2000, 'jusqua - graine : ' + (m.routeurEtat.jusqua - GJR));
    const c2 = chaine({ tete }); const m2 = monter(corps, { c: c2 });
    m2.rattraperBlocksRouteur(); await laisser(); const p2 = m2.routeurEnCours(); if (p2) await p2; await laisser();
    assert.equal(m2.routeurEtat.jusqua, tete);
  });

  /* ── E : le lendemain, la cle se relit (rien n etait retenu) ──────────────────────────────────────────────────────────── */
  await cas('E2 cleV4 : epuise puis le lendemain -> les 55 profondes partent (rpcServeur, puis l archive) et l absence, LUE cette fois, est retenue', async () => {
    const c = chaine({ tete: T }); const m = monter(corps, { c, quand: '2026-10-10T23:59:00Z' }); m.epuiser();
    assert.equal((await m.cleV4DuPoolId(ID_V4)).etat, 'NON_LUE');
    assert.equal(profondes(c).length, 0);
    m.horloge.t = Date.parse('2026-10-11T00:00:30Z');
    assert.equal(await m.cleV4DuPoolId(ID_V4), null);
    assert.equal(getLogsArchive(c), 55);
    assert.equal(m.clesV4Absentes.has(ID_V4), true);
  });

  /* ── F : compteurs d envois par hote ──────────────────────────────────────────────────────────────────────────────────── */
  const libelle = (x) => x.hote + (x.chemin && x.chemin !== '/' ? ' (path hidden)' : '');
  const attendu = (c) => { const a = {}; for (const x of c.envois) { const l = libelle(x); a[l] = a[l] || {}; a[l][x.classe] = (a[l][x.classe] || 0) + 1; } return a; };
  const sansZero = (p) => Object.fromEntries(Object.entries(p || {}).map(([h, v]) => [h, Object.fromEntries(Object.entries(v).filter(([, n]) => n > 0))]));
  await cas('F1 compte = parti : rpcServeur (rotation), lecteurUrl (publicnode, archive), callLarge, rpcRails, rpcActivite, rpcNaissance (R6), coupure reseau — par hote et par issue', async () => {
    /* 2026-10-10 : faitsPool garde 1rpc ICI seulement - le seul faux noeud qui sert un eth_call de lecture, pour que la classe ok soit exercee par rpcRails */
    const c = chaine({ tete: T, coupures: 1 }); const m = monter(corps, { c, faitsPool: [BASE_ORG, DRPC, UNRPC] });
    await m.cleV4DuPoolId(ID_V4);
    await m.callLarge('0x' + '11'.repeat(20), '0x12345678');
    await m.rpcRails('eth_call', [{ to: '0x' + '22'.repeat(20), data: '0x12345678' }, 'latest']);
    const nAvant = c.envois.length;
    await m.rpcActivite('eth_getLogs', [{ fromBlock: '0x' + (T - 10).toString(16), toBlock: '0x' + T.toString(16), address: '0x' + '33'.repeat(20), topics: [TOPIC_TRANSFER] }]);
    const nActivite = c.envois.length - nAvant;
    const r = await m.rpcNaissance('eth_simulateV1', [{ blockStateCalls: [] }, 'latest']);
    const nNaissance = c.envois.length - nAvant - nActivite;
    /* 2026-10-10 : RPC_ACTIVITE = RPC_LIST (base.org seul, developer-access retire) + publicnode + drpc -> 2 noeuds essayes avant la reponse ici, plus 3 */
    /* game362: base.org rate-limited earlier in THIS case is set aside by the shared health state -> the simulation goes straight to the next host: 1 send */
    assert.ok(nActivite === 2 && nNaissance === 1 && Array.isArray(r), 'temoin : rpcActivite ' + nActivite + ' envois (2 attendus), rpcNaissance ' + nNaissance + ' (1 attendu : base.org mis de cote)');
    assert.ok(m.envoisNoeuds, 'aucun compteur d envois');
    assert.deepEqual(sansZero(m.envoisNoeuds.parHote), attendu(c));
    const vus = Object.values(attendu(c)).flatMap((v) => Object.keys(v));
    for (const k of ['ok', 'limite', 'erreur', 'reseau']) assert.ok(vus.includes(k), 'temoin : la classe ' + k + ' n a pas ete exercee');
    assert.ok(Number.isFinite(Date.parse(m.envoisNoeuds.depuis)), 'depuis manque');
  });
  await cas('F2 jamais un chemin d URL : la cle de l archive et le chemin /base n apparaissent pas, les libelles sont des hotes', async () => {
    const c = chaine({ tete: T }); const m = monter(corps, { c, faitsPool: [BASE_ORG, DRPC, UNRPC] }); /* un noeud A CHEMIN (BASE_RPC_LECTURE d un operateur) : son chemin ne doit jamais sortir */
    await m.cleV4DuPoolId(ID_V4); await m.callLarge('0x' + '11'.repeat(20), '0x12345678');
    assert.ok(m.envoisNoeuds, 'aucun compteur d envois');
    const j = JSON.stringify(m.envoisNoeuds);
    assert.ok(!/cleFACTICE|\/rpc\/|\/base\b|https?:/.test(j), j);
    assert.ok(H_ARCHIVE + ' (path hidden)' in m.envoisNoeuds.parHote, 'archive non comptee : ' + j);
    assert.ok('1rpc.io (path hidden)' in m.envoisNoeuds.parHote, '1rpc non compte : ' + j);
  });
  await cas('F3 borne : 45 hotes -> 40 libelles + « autres hotes », rien de perdu', async () => {
    const hotes = Array.from({ length: 45 }, (_, i) => 'https://n' + i + '.exemple.test');
    /* callLarge recule de 200 ms x essai : au-dela de 20 essais la pause depasse 4 s — tout part tout de suite ici */
    const c = chaine({ tete: T, autresHotes: (h) => /^n\d+\.exemple\.test$/.test(h) }); const m = monter(corps, { c, faitsPool: hotes, immediat: true });
    await m.callLarge('0x' + '11'.repeat(20), '0x12345678').catch(() => {});
    assert.ok(m.envoisNoeuds, 'aucun compteur d envois');
    const p = m.envoisNoeuds.parHote;
    assert.equal(Object.keys(p).length, 41, Object.keys(p).length + ' cles');
    assert.ok('autres hotes' in p);
    assert.equal(Object.values(p).reduce((s, v) => s + v.erreur, 0), c.envois.length);
  });
  await cas('F4 classeEnvoi (repli-logs.js) : 429 / debit -> limite, 403 / 5xx / corps illisible -> erreur, result -> ok, reseau -> reseau ; jamais une exception', async () => {
    const k = RL.classeEnvoi;
    assert.equal(typeof k, 'function', 'classeEnvoi absent');
    assert.equal(k(429, null), 'limite'); assert.equal(k(200, { error: { message: 'over rate limit' } }), 'limite');
    assert.equal(k(403, { error: { message: 'Archive requests require a personal token' } }), 'erreur');
    assert.equal(k(503, null), 'erreur'); assert.equal(k(200, null), 'erreur'); assert.equal(k(200, { result: null }), 'ok');
    assert.equal(k(200, { result: '0x' }), 'ok'); assert.equal(k(0, null, true), 'reseau'); assert.equal(k(undefined, 'x'), 'erreur');
  });
  await cas('F5 /sante publie les envois a cote de l archive, et l UNITE de archive.nonEnvoyees (R7 : une fois par fenetre et par tour, relectures comprises — pas des fenetres distinctes)', async () => {
    const nu = source.replace(/\/\*[\s\S]*?\*\//g, ' '); /* le source JUGE (mute ou non), pas celui du depot */
    assert.match(nu, /archive: \{ pose: Boolean\(RPC_ARCHIVE\)[^\n]*\n\s*archiveNonEnvoyeesUnite: ARCHIVE_NON_ENVOYEES_UNITE,\s*envois: envoisNoeuds,/);
    assert.match(nu, /const ARCHIVE_NON_ENVOYEES_UNITE = 'deep windows not sent, each counted once per round \(one tour of nos-blocks or of the routeur, re-reads included;[^']*so this is not a number of distinct windows';/);
  });

  /* ── G : un refus d archive qui n est PAS de budget ───────────────────────────────────────────────────────────────────── */
  await cas('G1 archive en 503 (pas un refus de budget) : la fenetre est relue sur place comme avant (4 lectures x 3 essais), en attente, cadence 4 s, rien de « non envoye »', async () => {
    const c = chaine({ ...NOS, archive: '5xx' }); const m = monter(corps, { c });
    await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    const w = deFenetre(c, GJ + 1, GJ + 2000).filter((x) => x.hote === H_ARCHIVE);
    assert.equal(w.length, 12, 'essais a l archive pour la plus profonde : ' + w.length);
    assert.ok(m.nosBlocksEtat.ratees >= 2); assert.equal(m.nosBlocksEtat.jusqua, GJ);
    assert.ok(!m.nosBlocksEtat.attenteBudget, 'une panne d archive est prise pour le budget');
    assert.equal(m.archiveCompte.nonEnvoyees || 0, 0); assert.equal(m.archiveCompte.refusBudget, 0);
    const m2 = monter(corps, { c: chaine({ ...NOS, archive: '5xx' }) });
    m2.rattraperNosBlocks();
    await jusqua(() => m2.minuteur.attente.find((t) => t.fn.name === 'pas'), 'tour');
    assert.equal(m2.minuteur.attente.find((t) => t.fn.name === 'pas').ms, 4000, 'une panne d archive a ralenti la boucle');
  });
  await cas('G3 routeur, archive en 503 : la plage est relue sur place (4 lectures x 3 essais), et la visite suivante relance un tour', async () => {
    const c = chaine({ tete: GJR + 14000, archive: '5xx' }); const m = monter(corps, { c });
    const tours_ = () => c.envois.filter((x) => x.methode === 'eth_blockNumber').length;
    const visite = async () => { m.rattraperBlocksRouteur(); await laisser(); const p = m.routeurEnCours(); if (p) await p; await laisser(); };
    await visite();
    assert.equal(m.routeurEtat.ratees, 2); assert.ok(!m.routeurEtat.attenteBudget, 'une panne d archive est prise pour le budget');
    assert.equal(deFenetre(c, GJR + 1, GJR + 1000).filter((x) => x.hote === H_ARCHIVE).length, 12, 'essais a l archive');
    m.horloge.t += 1000; await visite();
    assert.equal(tours_(), 2, 'une panne d archive a bloque les visites : ' + tours_() + ' tour(s)');
    assert.equal(JSON.parse(m.blocksRouteurCorps()).attenteBudget ?? null, null);
  });
  await cas('G2 cleV4, archive en 503 : NON_LUE sans mention du budget, rien de retenu', async () => {
    const c = chaine({ tete: T, archive: '5xx' }); const m = monter(corps, { c });
    const r = await m.cleV4DuPoolId(ID_V4);
    assert.equal(r.etat, 'NON_LUE'); assert.doesNotMatch(r.pourquoi, /budget/); assert.equal(m.clesV4Absentes.has(ID_V4), false);
  });

  /* ── H : (R4) les holders ne passent PAS par lecteurLogs ──────────────────────────────────────────────────────────────── */
  await cas('H1 (R4) holders INCHANGES, budget epuise : la recherche de naissance passe par rpcServeur comme a HEAD (publics puis refus de budget), rien de « non envoye »', async () => {
    /* holders n a ni cache ni porte et app.html relance /api/holders toutes les 6 s (jusqu a 30 fois) : il lui faut une porte AVANT
     *   tout passage par lecteurLogs (pas faite). */
    const c = chaine({ tete: PREMIER + 20000 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    const e = await qui(m, 'route /api/holders/:adr', () => m.reconstruireHolders(JETON_B20));
    assert.equal(e.naissance, null); assert.equal(e.rechercheNaissance && e.rechercheNaissance.etat, 'NON_LUE');
    assert.equal(nonEnv(m, 'route /api/holders/:adr'), 0, 'holders passe par lecteurLogs (R4 : revert)');
    assert.ok(profondes(c).length > 0 && profondes(c).every((x) => PUBLICS.includes(x.hote)), 'fenetre profonde des holders : ' + JSON.stringify(profondes(c).map((x) => x.hote)));
    assert.equal(refus(m, 'route /api/holders/:adr'), 1, 'temoin : le dernier repli (archive) refuse par le budget');
  });

  /* ── P / W : sauvetage du compteur, et ecritures d archive-compte.json ─────────────────────────────────────────────────── */
  await cas('P1 nonEnvoyees / nonEnvoyeesParQui : sauves toutes les 100 (une ecriture pour 110), relus le meme jour, ignores un autre jour', async () => {
    const disque = new Map();
    const m = monter(corps, { c: chaine({ tete: T }), max: 5, disque }); m.epuiser();
    await qui(m, 'route /api/prix-usd', () => m.cleV4DuPoolId(ID_V4));
    await qui(m, 'route /api/prix-usd', () => m.cleV4DuPoolId(ID_V4));
    assert.equal(m.archiveCompte.nonEnvoyees, 110, 'deux appels, 55 chacun : ' + m.archiveCompte.nonEnvoyees);
    assert.equal(m.ecritures.compte, 1, 'ecritures d archive-compte.json : ' + m.ecritures.compte + ' (1 attendue, a 100)');
    const m2 = monter(corps, { c: chaine({ tete: T }), max: 5, disque });
    assert.equal(m2.archiveCompte.nonEnvoyees, 100, 'relu : ' + m2.archiveCompte.nonEnvoyees);
    assert.deepEqual(m2.archiveCompte.nonEnvoyeesParQui, { 'route /api/prix-usd': 100 });
    const m3 = monter(corps, { c: chaine({ tete: T }), max: 5, disque, quand: '2026-10-11T08:00:00Z' });
    assert.equal(m3.archiveCompte.nonEnvoyees, 0); assert.deepEqual(m3.archiveCompte.nonEnvoyeesParQui, {});
  });
  await cas('W1 budget epuise, memes tours que HEAD (4 de nos-blocks, 4 du routeur, 2 cleV4) : ecritures d archive-compte.json <= HEAD', async () => {
    const scen = [['nos', { tete: GJ + 14000 }, 4], ['routeur', { tete: GJR + 14000 }, 4], ['cleV4', { tete: T }, 2]];
    let ph = 0, pp = 0; const detail = [];
    for (const [consommateur, conf, n] of scen) {
      const h = await surHead('W1 ' + consommateur, (cx) => tours(cx, { conf, consommateur, n, max: 5, epuise: true }));
      const p = await tours(corps, { conf, consommateur, n, max: 5, epuise: true });
      ph += h.ecritures; pp += p.ecritures; detail.push(consommateur + ' ' + p.ecritures + '/' + h.ecritures);
      if (process.env.REFUS_CHIFFRES === '1') console.log('  W1 ' + consommateur + ' (' + n + ' tours, budget epuise) : correctif ' + p.ecritures + ' ecriture(s), ' + p.tours.reduce((s, t) => s + t.publics, 0) + ' requetes publiques / HEAD ' + h.ecritures + ' ecriture(s), ' + h.tours.reduce((s, t) => s + t.publics, 0) + ' requetes publiques');
      assert.ok(p.ecritures <= h.ecritures, consommateur + ' : ' + p.ecritures + ' ecritures contre ' + h.ecritures + ' a HEAD');
    }
    assert.ok(ph > 0, 'temoin : HEAD n ecrit rien (' + detail.join(', ') + ')');
    assert.ok(pp <= ph, 'ecritures ' + pp + ' contre ' + ph + ' a HEAD (' + detail.join(', ') + ')');
  });

  /* ── R1 : seule une LISTE est une reponse d eth_getLogs, celle du PRINCIPAL comprise ───────────────────────────────────────── */
  await cas('R1a nos-blocks : base.org (le PRINCIPAL) rend `result: null` a tout getLogs, budget libre — 7 fenetres ratees, relues (REPRISES : 4 lectures chacune), couverture ET progres-index.json a la graine', async () => {
    const c = chaine({ ...NOS, baseRend: () => null }); const m = monter(corps, { c });
    await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    assert.equal(m.nosBlocksEtat.jusqua, GJ, 'la couverture a avance sur des fenetres non lues : jusqua - graine = ' + (m.nosBlocksEtat.jusqua - GJ));
    assert.equal(m.nosBlocksEtat.ratees, 7, 'fenetres en attente : ' + m.nosBlocksEtat.ratees);
    assert.equal(getLogsBase(c), 28, 'lectures au principal : ' + getLogsBase(c) + ' (7 fenetres x 4 lectures attendues)');
    assert.equal(JSON.parse(m.nosBlocksCorps()).couvertureComplete, false);
    const p = progres(m);
    assert.ok(p && p.nos && p.routeur, 'progres-index.json non ecrit : ' + JSON.stringify(p));
    assert.equal(p.nos.jusqua, GJ, 'progres-index.json : nos.jusqua - graine = ' + (p.nos.jusqua - GJ)); assert.equal(p.nos.depuis, PREMIER);
    assert.ok(!m.nosBlocksEtat.attenteBudget, 'une non-liste est prise pour le budget');
  });
  await cas('R1b routeur : base.org rend `result: null` — 2 fenetres ratees, plage relue (4 lectures), couverture ET progres-index.json a la graine', async () => {
    const c = chaine({ tete: GJR + 14000, baseRend: () => null }); const m = monter(corps, { c });
    await qui(m, 'fond routeur', () => m.etendreBlocksRouteur());
    assert.equal(m.routeurEtat.jusqua, GJR, 'le routeur a avance sur des fenetres non lues : jusqua - graine = ' + (m.routeurEtat.jusqua - GJR));
    assert.equal(m.routeurEtat.ratees, 2);
    assert.equal(getLogsBase(c), 8, 'lectures au principal : ' + getLogsBase(c) + ' (2 fenetres x 4 lectures attendues)');
    const p = progres(m);
    assert.ok(p && p.routeur, 'progres-index.json non ecrit');
    assert.equal(p.routeur.jusqua, GJR, 'progres-index.json : routeur.jusqua - graine = ' + (p.routeur.jusqua - GJR));
  });
  await cas('R1c nos-blocks : le principal rend "0x", {} ou un nombre — meme regle : ratees, couverture et progres-index.json a la graine', async () => {
    for (const x of ['0x', {}, 7]) {
      const c = chaine({ ...NOS, baseRend: () => x }); const m = monter(corps, { c });
      await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
      assert.equal(m.nosBlocksEtat.jusqua, GJ, JSON.stringify(x) + ' : jusqua - graine = ' + (m.nosBlocksEtat.jusqua - GJ));
      assert.equal(m.nosBlocksEtat.ratees, 7, JSON.stringify(x) + ' : ratees ' + m.nosBlocksEtat.ratees);
      const p = progres(m);
      assert.equal(p && p.nos && p.nos.jusqua, GJ, JSON.stringify(x) + ' : progres-index.json ' + JSON.stringify(p && p.nos && p.nos.jusqua));
    }
  });

  /* ── R2 : une fenetre ENVOYEE dont l erreur commence par le texte du budget n est PAS un refus certain ─────────────────────── */
  const RECENTE = { tete: GJ + 1500 }; /* une seule fenetre [GJ+1, GJ+1500], a 1 500 blocs de la tete : RECENTE */
  await cas('R2a nos-blocks (CE4) : fenetre recente, 503 passager de publicnode, budget epuise (refus du dernier repli en tete) — relue sur place et LUE, aucun texte d attente', async () => {
    const c = chaine({ ...RECENTE, publicnodeFlanche: 1 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    assert.equal(m.archiveCompte.refusBudget, 1, 'temoin : le dernier repli (archive) a refuse par le budget');
    assert.equal(getLogsPublicnode(c), 2, 'lectures publicnode : ' + getLogsPublicnode(c) + ' (2 = la lecture puis une relecture)');
    assert.equal(m.nosBlocksEtat.jusqua, RECENTE.tete, 'la fenetre n a pas ete relue : jusqua - graine = ' + (m.nosBlocksEtat.jusqua - GJ));
    assert.equal(m.nosBlocksEtat.ratees, 0);
    assert.ok(!m.nosBlocksEtat.attenteBudget); assert.equal(JSON.parse(m.nosBlocksCorps()).attenteBudget ?? null, null);
  });
  await cas('R2b nos-blocks (CE4b) : meme fenetre, publicnode en 503 a chaque lecture — relue 3 fois (REPRISES), en attente SANS texte d attente, tour suivant dans 4 s (pas PAUSE_EPUISE_MS) : seule une fenetre non envoyee fait ralentir', async () => {
    const c = chaine({ ...RECENTE, publicnodeFlanche: 100 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    assert.equal(m.archiveCompte.refusBudget, 4, 'temoin : 4 lectures, chacune refusee par le budget au dernier repli');
    assert.equal(getLogsPublicnode(c), 4, 'lectures publicnode : ' + getLogsPublicnode(c) + ' (4 = lecture + 3 REPRISES)');
    assert.equal(m.nosBlocksEtat.ratees, 1); assert.equal(m.nosBlocksEtat.jusqua, GJ);
    assert.ok(!m.nosBlocksEtat.attenteBudget, 'attenteBudget : ' + m.nosBlocksEtat.attenteBudget);
    assert.equal(JSON.parse(m.nosBlocksCorps()).attenteBudget ?? null, null, 'la reponse dit « wait for 00:00 UTC » pour une fenetre envoyee');
    const m2 = monter(corps, { c: chaine({ ...RECENTE, publicnodeFlanche: 100 }), max: 5 }); m2.epuiser();
    m2.rattraperNosBlocks();
    await jusqua(() => m2.minuteur.attente.find((t) => t.fn.name === 'pas'), 'tour');
    assert.equal(m2.minuteur.attente.find((t) => t.fn.name === 'pas').ms, 4000, 'une fenetre envoyee a ralenti la boucle');
  });
  await cas('R2c routeur (CE5) : fenetre recente, 503 passager de publicnode, budget epuise — plage relue sur place et LUE, aucun texte d attente', async () => {
    const tete = GJR + 1500; const c = chaine({ tete, publicnodeFlanche: 1 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond routeur', () => m.etendreBlocksRouteur());
    assert.equal(m.archiveCompte.refusBudget, 1, 'temoin : le dernier repli (archive) a refuse par le budget');
    assert.equal(m.routeurEtat.jusqua, tete, 'la plage n a pas ete relue : jusqua - graine = ' + (m.routeurEtat.jusqua - GJR));
    assert.equal(m.routeurEtat.ratees, 0); assert.equal(JSON.parse(m.blocksRouteurCorps()).attenteBudget ?? null, null);
  });
  await cas('R2d routeur : publicnode en 503 a chaque lecture d une plage recente, budget epuise — pas de ralentissement : la visite suivante (+1 s) relance un tour', async () => {
    const tete = GJR + 1500; const c = chaine({ tete, publicnodeFlanche: 100 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    const tours_ = () => c.envois.filter((x) => x.methode === 'eth_blockNumber').length;
    const visite = async () => { m.rattraperBlocksRouteur(); await laisser(); const p = m.routeurEnCours(); if (p) await p; await laisser(); };
    await visite();
    assert.ok(m.routeurEtat.ratees > 0, 'temoin : la plage est ratee'); assert.ok(!m.routeurEtat.attenteBudget, 'attenteBudget : ' + m.routeurEtat.attenteBudget);
    m.horloge.t += 1000; await visite();
    assert.equal(tours_(), 2, 'une fenetre envoyee a bloque les visites : ' + tours_() + ' tour(s)');
  });

  /* ── R5 : « attenteBudget » = les fenetres NON ENVOYEES seules ; jamais remis a zero au debut d un tour ────────────────────── */
  await cas('R5a nos-blocks (CE6) : budget epuise + une fenetre recente dont le jeton n a pas pu etre verifie (eth_getCode en panne) — 4 en attente, la reponse en annonce 3 (les non envoyees)', async () => {
    const X = '0x' + 'cd'.repeat(20);
    const c = chaine({ ...NOS, codeEnPanne: true,
      publicnodeRend: (q) => (parseInt(q.toBlock, 16) === NOS.tete ? [{ address: X, blockNumber: '0x' + (NOS.tete - 5).toString(16), transactionHash: '0x' + '11'.repeat(32) }] : []) });
    const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond nos-blocks', () => m.etendreNosBlocks());
    assert.equal(m.nosBlocksEtat.ratees, 4, 'temoin : 3 non envoyees + 1 non verifiee, ratees ' + m.nosBlocksEtat.ratees);
    const r = JSON.parse(m.nosBlocksCorps());
    assert.equal(r.fenetresEnAttente, 4); assert.match(String(r.attenteBudget), fenetresTexte(3), 'annonce : ' + r.attenteBudget);
    assert.equal(m.nosBlocksEtat.attenteBudget, 3);
  });
  await cas('R5b routeur : un tour a retour anticipe (tete illisible) GARDE attenteBudget — la reponse le dit encore (2 fenetres)', async () => {
    const tete = GJR + 14000; const c = chaine({ tete }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    const tours_ = () => c.envois.filter((x) => x.methode === 'eth_blockNumber').length;
    const visite = async () => { m.rattraperBlocksRouteur(); await laisser(); const p = m.routeurEnCours(); if (p) await p; await laisser(); };
    await visite();
    assert.equal(tours_(), 1); assert.equal(m.routeurEtat.attenteBudget, 2, 'temoin : 2 fenetres non envoyees');
    m.horloge.t += 61000; c.teteIllisible = true; await visite();
    assert.equal(tours_(), 2, 'temoin : le tour a +61 s a eu lieu');
    assert.equal(m.routeurEtat.attenteBudget, 2, 'un retour anticipe a efface attenteBudget : ' + m.routeurEtat.attenteBudget);
    assert.match(String(JSON.parse(m.blocksRouteurCorps()).attenteBudget), fenetresTexte(2));
  });
  await cas('R5c nos-blocks : un tour a retour anticipe (tete illisible) GARDE attenteBudget — le tour suivant reste a PAUSE_EPUISE_MS', async () => {
    const c = chaine(NOS); const m = monter(corps, { c, max: 5 }); m.epuiser();
    const prochain = () => m.minuteur.attente.find((t) => t.fn.name === 'pas');
    m.rattraperNosBlocks();
    await jusqua(() => prochain(), 'premier tour');
    let t = prochain();
    assert.equal(t.ms, RF.PAUSE_EPUISE_MS, 'temoin : tour suivant dans ' + t.ms + ' ms'); assert.ok(m.nosBlocksEtat.attenteBudget, 'temoin : en attente');
    c.teteIllisible = true;
    m.minuteur.attente.splice(m.minuteur.attente.indexOf(t), 1); m.horloge.t += t.ms; t.fn();
    await jusqua(() => prochain(), 'deuxieme tour');
    t = prochain();
    assert.equal(m.nosBlocksEtat.attenteBudget, 3, 'un retour anticipe a efface attenteBudget : ' + m.nosBlocksEtat.attenteBudget);
    assert.equal(t.ms, RF.PAUSE_EPUISE_MS, 'apres un tour sans tete, tour suivant dans ' + t.ms + ' ms');
  });
  await cas('R5d/R7 routeur : plage MIXTE, la recente envoyee et ratee a chaque lecture — plage relue (4 lectures), la reponse annonce 1 fenetre (pas 2) ; la profonde est comptee UNE fois dans le tour (pas 4)', async () => {
    const tete = GJR + 9500; const c = chaine({ tete, publicnodeFlanche: 100 }); const m = monter(corps, { c, max: 5 }); m.epuiser();
    await qui(m, 'fond routeur', () => m.etendreBlocksRouteur());
    assert.equal(m.routeurEtat.ratees, 2, 'temoin : les deux fenetres en attente');
    assert.match(String(JSON.parse(m.blocksRouteurCorps()).attenteBudget), fenetresTexte(1), 'annonce : ' + JSON.parse(m.blocksRouteurCorps()).attenteBudget);
    assert.equal(deFenetre(c, GJR + 1001, GJR + 2000).length, 16, 'fenetre recente : ' + deFenetre(c, GJR + 1001, GJR + 2000).length + ' requetes (4 lectures x 4 attendues)');
    assert.equal(deFenetre(c, GJR + 1, GJR + 1000).length, 0);
    assert.equal(nonEnv(m, 'fond routeur'), 1, 'R7 : la fenetre non envoyee comptee ' + nonEnv(m, 'fond routeur') + ' fois dans UN tour');
    assert.equal(m.routeurEtat.attenteBudget, 1);
  });
  return res;
}

/* ── MUTANTS des regles : chacun DOIT rougir ──────────────────────────────────────────────────────────────────────────────────── */
const MUTANTS = [
  ['m1 la profondeur ignoree (tout a rpcServeur)', 'const profonde = Number.isSafeInteger(tete) && Number.isSafeInteger(bas) && tete - bas >= PROFONDEUR_PUBLICNODE;', 'const profonde = false;', [/^A1 /, /^A3 /]],
  ['m2 budget epuise : la fenetre profonde part quand meme', 'if (profonde && archiveEpuisee()) {', 'if (false) {', [/^A1 /, /^A3 /]],
  ['m3 non envoyee mais pas comptee', 'if (!vues.has(cle)) { vues.add(cle); suivi.nonEnvoyees += 1; noterNonEnvoyee(); }', 'if (!vues.has(cle)) { vues.add(cle); suivi.nonEnvoyees += 1; }', [/^A1 /, /^A2 /, /^P1 /]],
  ['m3b R7 : recomptee a chaque relecture du meme tour', 'if (!vues.has(cle)) { vues.add(cle); suivi.nonEnvoyees += 1; noterNonEnvoyee(); }', '{ suivi.nonEnvoyees += 1; noterNonEnvoyee(); }', [/^R5d/]],
  ['m4 refus certain qui ne dit plus le budget', "const NON_ENVOYEE_BUDGET = 'archive node daily budget reached — deep window not sent", "const NON_ENVOYEE_BUDGET = 'archive node daily quota hit — deep window not sent", [/^A4 /, /^A6 /]],
  ['m5 nos-blocks : relecture d une fenetre non envoyee', 'if (lire.nonEnvoyee(w.cause)) { ratees += 1; enAttente += 1; restent.push(w); continue; }', '', [/^C1 /]],
  ['m6 routeur : relecture d une plage dont toutes les ratees sont non envoyees', 'if (r.fenetresRatees <= lire.suivi.essais - avant) break;', '', [/^C2 /]],
  ['m6b R2 nos-blocks : tout texte de budget pris pour un refus certain', 'if (lire.nonEnvoyee(w.cause)) { ratees += 1;', 'if (RE_BUDGET_ARCHIVE.test(String(w.cause))) { ratees += 1;', [/^R2a /, /^R2b /]],
  ['m6c R2 routeur : jamais de relecture', 'if (r.fenetresRatees <= lire.suivi.essais - avant) break;', 'if (true) break;', [/^R2c /, /^R5d/]],
  ['m7 nos-blocks : jamais la pause de 5 min', 'setTimeout(pas, pauseNosBlocks(nosBlocksEtat.attenteBudget > 0 && archiveEpuisee())).unref?.();', 'setTimeout(pas, pauseNosBlocks(false)).unref?.();', [/^D1 /, /^R5c /]],
  ['m7b R2 nos-blocks : pause sur l epuisement seul (l entree de HEAD)', 'setTimeout(pas, pauseNosBlocks(nosBlocksEtat.attenteBudget > 0 && archiveEpuisee())).unref?.();', 'setTimeout(pas, pauseNosBlocks(archiveEpuisee())).unref?.();', [/^R2b /]],
  ['m8 routeur : routeurEnchaine retire (1365dcc)', 'if (!routeurEnchaine(archiveEpuisee())) break;', '', [/^D3 /]],
  ['m10 nos-blocks : toute fenetre en attente ralentit (503 compris)', 'nosBlocksEtat.attenteBudget = archiveEpuisee() ? enAttente : 0;', 'nosBlocksEtat.attenteBudget = ratees;', [/^G1 /, /^R5a /]],
  ['m10b routeur : toute plage en attente compte', 'routeurEtat.attenteBudget = r.fenetresRatees > 0 && archiveEpuisee() ? lire.suivi.essais - avant : 0;', 'routeurEtat.attenteBudget = r.fenetresRatees;', [/^G3 /]],
  ['m10c R5 nos-blocks : l annonce compte toutes les fenetres en attente', 'nosBlocksEtat.attenteBudget = archiveEpuisee() ? enAttente : 0;', 'nosBlocksEtat.attenteBudget = archiveEpuisee() ? ratees : 0;', [/^R5a /]],
  ['m10d R5 routeur : l annonce compte toutes les fenetres en attente', 'routeurEtat.attenteBudget = r.fenetresRatees > 0 && archiveEpuisee() ? lire.suivi.essais - avant : 0;', 'routeurEtat.attenteBudget = r.fenetresRatees > 0 && archiveEpuisee() ? r.fenetresRatees : 0;', [/^R5d/]],
  ['m11 cleV4 sans lecteurLogs', "logs = await lire.rpc('eth_getLogs', [{ address: PM_V4,", "logs = await rpcServeur('eth_getLogs', [{ address: PM_V4,", [/^A3 /]],
  ['m12 /api/cle sans lecteurLogs', "const logs = await rpc('eth_getLogs', [{ fromBlock: enHex(d), toBlock: enHex(f), address: PM_V4, topics }]);", "const logs = await rpcServeur('eth_getLogs', [{ fromBlock: enHex(d), toBlock: enHex(f), address: PM_V4, topics }]);", [/^A4 /, /^A6 /]],
  ['m13 cleV4 : la raison tait le budget', "+ (attente ? ' (' + attente + ' of them wait for the archive node daily budget", "+ (false ? ' (' + attente + ' of them wait for the archive node daily budget", [/^A3 /]],
  /* 2026-10-25 : ancre suivie (depuis = debutRechercheNaissance, test-naissance-creation-20261025) ; la mutation reste rpcServeur -> lecteurLogs */
  ['m14 R4 : holders par lecteurLogs (sans porte)', 'const r = await lireNaissance({ rpc: rpcServeur, jeton, depuis, jusqua: fin });', 'const r = await lireNaissance({ rpc: lecteurLogs(fin).rpc, jeton, depuis, jusqua: fin });', [/^H1 /]],
  ['m15 rpcServeur : envois non comptes', /compte = true; compterEnvoi\(url, classeEnvoi\(r\.status, j\)\);(\r?\n\s*if \(!j\.error\) return j\.result;)/, '$1', [/^F1 /]],
  ['m16 lecteurUrl : envois non comptes', 'return lecteurUrlNu(url, { ...options, surEnvoi: (c) => compterEnvoi(url, c) });', 'return lecteurUrlNu(url, options);', [/^F1 /, /^F2 /]],
  ['m17 le chemin publie (URL au lieu de l hote)', 'let h = libelleNoeud(url);', 'let h = String(url);', [/^F2 /]],
  ['m18 callLarge : envois non comptes', /(if \(r\.ok\) \{\r?\n\s*const j = await r\.json\(\)\.catch\(\(\) => null\);\r?\n\s*)compte = true; compterEnvoi\(url, classeEnvoi\(r\.status, j\)\);/, '$1compte = true;', [/^F1 /]],
  ['m18b rpcRails : envois non comptes', /compte = true; compterEnvoi\(url, classeEnvoi\(r\.status, j\)\);(\r?\n\s*\/\* ⛔ MESURE EN PROD \(build rails-lecteur-large\))/, 'compte = true;$1', [/^F1 /]],
  ['m18c rpcServeur : coupure reseau non comptee', /if \(!compte\) compterEnvoi\(url, classeEnvoi\(r \? r\.status : 0, null, r === null \|\| \/abort\|timeout\/i\.test\(String\(e && e\.name\)\)\)\);(\r?\n\s*dernier = e;\r?\n\s*if \(\/413)/, '$1', [/^F1 /]],
  ['m19 compteur non borne', "if (!envoisNoeuds.parHote[h] && Object.keys(envoisNoeuds.parHote).length >= ENVOIS_HOTES_MAX) h = 'autres hotes';", '', [/^F3 /]],
  ['m20 compteur non relu au redemarrage', 'archiveCompte.nonEnvoyeesParQui = compteurEntier(x.nonEnvoyeesParQui);', '', [/^P1 /]],
  ['m21 compteur non remis a zero au changement de jour', 'refusParQui: {}, nonEnvoyees: 0, nonEnvoyeesParQui: {} });', 'refusParQui: {} });', [/^D1 /]],
  ['m22 routeur : fenetres a rpcServeur', 'let r = await scannerNesDuRouteur({ rpc: lire.rpc, deBloc: routeurEtat.jusqua + 1, aBloc, pas: 1000 });', 'let r = await scannerNesDuRouteur({ rpc: rpcServeur, deBloc: routeurEtat.jusqua + 1, aBloc, pas: 1000 });', [/^A2 /]],
  ['m23 nos-blocks : fenetres a rpcServeur', 'const scan = await frappesVers({ rpc: lire.rpc, compte, deBloc, aBloc });', 'const scan = await frappesVers({ rpc: rpcServeur, compte, deBloc, aBloc });', [/^A1 /]],
  ['m24 R1 : une non-liste du principal acceptee comme fenetre vide', "if (methode === 'eth_getLogs' && !Array.isArray(r)) throw new Error('not a list');", '', [/^R1a /, /^R1b /, /^R1c /]],
  ['m25 R3 : profondeur jugee sur toBlock', 'const bas = q ? parseInt(q.fromBlock, 16) : NaN;', 'const bas = q ? parseInt(q.toBlock, 16) : NaN;', [/^A1 /, /^A6 /]],
  ['m26 R5 routeur : attenteBudget remis a zero au debut du tour', 'async function etendreBlocksRouteur() {', 'async function etendreBlocksRouteur() { routeurEtat.attenteBudget = 0;', [/^R5b /]],
  ['m27 R5 nos-blocks : attenteBudget remis a zero au debut du tour', 'async function etendreNosBlocks() {', 'async function etendreNosBlocks() { nosBlocksEtat.attenteBudget = 0;', [/^R5c /]],
  ['m28 R6 rpcActivite : envois non comptes', /compte = true; compterEnvoi\(url, classeEnvoi\(r\.status, j\)\);(\r?\n\s*if \(j && !j\.error && j\.result !== undefined\) return j\.result;)/, '$1', [/^F1 /]],
  ['m29 R6 rpcNaissance : envois non comptes', /compte = true; compterEnvoi\(url, classeEnvoi\(r\.status, j\)\);(\r?\n\s*if \(j && Array\.isArray\(j\.result\)\) return j\.result;)/, 'compte = true;$1', [/^F1 /]],
  ['m30 R7 /sante tait l unite de nonEnvoyees', 'archiveNonEnvoyeesUnite: ARCHIVE_NON_ENVOYEES_UNITE,', '', [/^F5 /]],
  ['m31 R5 routeur : « wait for 00:00 UTC » publie apres 00:00 UTC', 'attenteBudget: routeurEtat.attenteBudget && archiveEpuisee() ?', 'attenteBudget: routeurEtat.attenteBudget ?', [/^D2 /]],
  ['m32 frontiere : > au lieu de >= (-9 000 envoyee)', 'tete - bas >= PROFONDEUR_PUBLICNODE;', 'tete - bas > PROFONDEUR_PUBLICNODE;', [/^Z1 /, /^Z2 /, /^A4 /]],
  ['m33 revue r2 : profonde AVEC budget droit a l archive (rpcHistoire)', /const r = await rpcServeur\(methode, params\);(\r?\n\s*if \(methode === 'eth_getLogs' && !Array\.isArray\(r\)\) throw new Error\('not a list'\);)/, 'const r = await (profonde ? rpcHistoire : rpcServeur)(methode, params);$1', [/^B0 /, /^B1 /, /^S1 /, /^S2 /]],
  ['m34 sauvetage toutes les 25 (3 fois les ecritures, revue r2)', 'if (archiveCompte.nonEnvoyees % 100 === 0) sauverArchiveCompte();', 'if (archiveCompte.nonEnvoyees % 25 === 0) sauverArchiveCompte();', [/^P1 /]],
];

let ko = 0, n = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('  KO ' + m); } };
const base = await suite(SRC);
for (const r of base) { ok(r.ok, 'code ' + (process.argv[2] ? 'de ' + CIBLE : 'livre') + ' : ' + r.id + (r.err ? ' — ' + r.err : '')); if (r.ok) console.log('  ok  ' + r.id); }
console.log((process.argv[2] ? CIBLE : 'code livre') + ' : ' + base.length + ' cas, ' + base.filter((r) => !r.ok).length + ' KO');
if (!process.argv[2]) {
  let tues = 0;
  for (const [nom, de, vers, casse] of MUTANTS) {
    /* un motif est un texte (une ligne : portable LF/CRLF) ou une RegExp qui doit trouver UN seul endroit */
    const deX = de;
    const fois = deX instanceof RegExp ? (SRC.match(new RegExp(deX.source, 'g')) || []).length : SRC.split(deX).length - 1;
    ok(fois === 1, 'mutant ' + nom + ' : motif trouve ' + fois + ' fois (attendu 1)');
    if (fois !== 1) continue;
    const r = await suite(deX instanceof RegExp ? SRC.replace(deX, vers) : SRC.replace(deX, () => vers));
    const rouges = r.filter((x) => !x.ok).map((x) => x.id);
    if (rouges.length) tues += 1;
    console.log('mutant ' + nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.map((x) => x.split(' ')[0]).join(' | '));
    ok(rouges.length > 0, 'mutant ' + nom + ' : le banc doit devenir ROUGE');
    for (const re of casse) ok(rouges.some((id) => re.test(id)), 'mutant ' + nom + ' : doit casser ' + re);
  }
  console.log('mutants tues : ' + tues + '/' + MUTANTS.length);
}
console.log(n + ' assertions, ' + ko + ' KO');
if (n === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
