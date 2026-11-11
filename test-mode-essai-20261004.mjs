/* test-mode-essai-20261004.mjs — LE MODE ESSAI EST ETEINT PAR DEFAUT, IMPOSSIBLE HORS DE CETTE MACHINE, ET LE WALLET SIMULE NE
 *   PEUT RIEN ENVOYER AILLEURS QUE SUR UN FORK LOCAL.
 *
 * CE QUE CE FICHIER PROUVE (hors reseau : deux faux noeuds JSON-RPC locaux, aucun vrai noeud, aucune transaction) :
 *   A. la regle de la PAGE (`modeEssai`)      : rien sans `?essai=wallet` ; rien hors de localhost ; rien vers un noeud distant ;
 *   B. la regle du SERVEUR (`essaiServeur`)   : rien sans `TB_RPC_TEST` ; refuse sur Railway, en production, vers un noeud distant ;
 *   C. les QUATRE listes de noeuds du serveur : sans mode essai, identiques a celles du commit 9ab857e (la production), pour trois
 *      environnements ; en mode essai, toutes egales au fork et a lui seul ;
 *   D. le bloc d app.html : avec l hote de production il ne touche ni `RESEAUX` ni `window.ethereum` et ne charge rien ;
 *   E. le wallet simule : sans cle, un seul compte, une liste FERMEE de lectures, refus si le noeud n est pas un fork anvil de
 *      Base, refus « utilisateur » reconnu par envoi.js, et `envoyerDepuisWallet` (le vrai) confirme a travers lui ;
 *   F. le serveur LANCE : par defaut `/wallet-simule.js` rend 404 et `/sante` ne dit rien de l essai ; avec `TB_RPC_TEST` toutes
 *      ses lectures partent au noeud d essai (zero au noeud de `BASE_RPC`, zero tentative vers un noeud public) ; avec
 *      `TB_RPC_TEST` ET une variable Railway, la variable est ignoree.
 *   Chaque garde est prouvee par MUTATION : le meme jeu d assertions, rejoue sur une copie mutee, doit rougir.
 * ⛔ CE QUE CE FICHIER NE PROUVE PAS : qu une transaction s execute (banc-wallet-simule-fork-20261004.mjs, sur le fork) ; que la
 *   page s affiche (ESSAI-WALLET-SIMULE-20261004.md, a la main) ; ce que Railway pose reellement comme variables.
 * ⛔ Le serveur lance ici est precharge avec garde-reseau-essai.mjs : aucun de ses `fetch` ne sort de la machine. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } return !!c; };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
let serie = 0;
const imp = (f, dir = ICI) => import(pathToFileURL(path.join(dir, f)).href + '?m=' + (serie += 1));
const FORK = 'http://127.0.0.1:8549';
const COMPTE = '0x' + '5e55'.padEnd(40, 'a');
const AUTRE = '0x' + 'b0b0'.padEnd(40, '1');
const Q = '?essai=wallet&compte=' + COMPTE;

/* ── A + B : les deux regles pures ─────────────────────────────────────────────────────────────────────────────────── */
function jeuRegles(M, j) {
  const p = (hote, recherche) => M.modeEssai({ hote, recherche });
  /* A. eteint par defaut */
  j(p('localhost', '').actif === false && p('localhost', '').pourquoi === null, 'A localhost sans parametre : inactif, et silencieux');
  j(p('localhost', '?panel=1').actif === false, 'A localhost avec un autre parametre : inactif');
  j(p('localhost', '?essai=1&compte=' + COMPTE).actif === false, 'A `essai=1` n est pas la valeur admise : inactif');
  j(p('localhost', '?compte=' + COMPTE + '&rpc=' + encodeURIComponent(FORK)).actif === false, 'A un compte et un rpc SANS `essai=wallet` : inactif');
  /* A. impossible hors de cette machine */
  for (const hote of ['tokenizedblock.space', 'www.tokenizedblock.space', 'tokenized-block.up.railway.app', 'localhost.exemple.com', '127.0.0.1.exemple.com',
    'exemple-localhost', 'notlocalhost', '127.0.0.2', '0.0.0.0', '192.168.1.10', '', undefined, null]) {
    const r = p(hote, Q);
    j(r.actif === false && r.rpc === null && r.compte === null, 'A hote « ' + hote + ' » avec la demande complete : inactif');
  }
  j(typeof p('tokenizedblock.space', Q).pourquoi === 'string', 'A le refus sur l hote de production dit pourquoi');
  /* A. actif : les trois noms de cette machine */
  for (const hote of ['localhost', '127.0.0.1', '[::1]']) {
    const r = p(hote, Q);
    j(r.actif === true && r.rpc === FORK && r.compte === COMPTE, 'A hote « ' + hote + ' » + demande complete : actif, fork par defaut, compte rendu');
  }
  j(p('localhost', Q + '&rpc=' + encodeURIComponent('http://localhost:9999')).rpc === 'http://localhost:9999', 'A un autre port local est admis');
  j(p('localhost', Q + '&rpc=' + encodeURIComponent('http://[::1]:8549')).rpc === 'http://[::1]:8549', 'A [::1] est admis comme noeud');
  /* A. le noeud d essai ne quitte jamais la machine */
  for (const rpc of ['https://mainnet.base.org', 'http://exemple.com:8549', 'http://127.0.0.1@exemple.com', 'http://127.0.0.1.exemple.com:8549',
    'http://localhost.exemple.com', 'https://127.0.0.1:8549', 'http://user:pw@127.0.0.1:8549', 'http://127.0.0.1:8549/chemin', 'http://127.0.0.1:8549/?x=1',
    'ws://127.0.0.1:8549', 'javascript:alert(1)', '//exemple.com', 'pas une url']) {
    const r = p('localhost', Q + '&rpc=' + encodeURIComponent(rpc));
    j(r.actif === false && r.rpc === null, 'A noeud « ' + rpc + ' » : refuse, meme sur localhost');
  }
  /* A. le compte est entier */
  for (const c of ['', '0x1234', COMPTE.slice(0, 41), COMPTE + '0', 'compte', '0x' + 'g'.repeat(40)]) {
    j(p('localhost', '?essai=wallet&compte=' + c).actif === false, 'A compte « ' + c + ' » : refuse (une adresse entiere, 40 caracteres hexadecimaux)');
  }
  /* B. le serveur */
  const s = (env) => M.essaiServeur(env);
  j(s({}).demande === false && s({}).actif === false, 'B sans TB_RPC_TEST : rien');
  j(s({ TB_RPC_TEST: '' }).demande === false && s({ TB_RPC_TEST: '   ' }).actif === false, 'B TB_RPC_TEST vide : rien');
  j(s(undefined).actif === false, 'B environnement absent : rien');
  j(s({ TB_RPC_TEST: FORK }).actif === true && s({ TB_RPC_TEST: FORK }).rpc === FORK, 'B TB_RPC_TEST sur cette machine : actif');
  j(s({ TB_RPC_TEST: FORK, RAILWAY_AUTRE: '' }).actif === true, 'B une variable RAILWAY_ VIDE ne compte pas');
  for (const rpc of ['https://mainnet.base.org', 'http://exemple.com:8549', 'http://127.0.0.1@exemple.com', 'https://127.0.0.1:8549', 'http://user:pw@127.0.0.1:8549']) {
    const r = s({ TB_RPC_TEST: rpc });
    j(r.demande === true && r.actif === false && r.rpc === null && !!r.pourquoi, 'B TB_RPC_TEST « ' + rpc + ' » : refuse, avec la raison');
  }
  for (const v of ['RAILWAY_ENVIRONMENT', 'RAILWAY_VOLUME_MOUNT_PATH', 'RAILWAY_PROJECT_ID', 'RAILWAY_SERVICE_ID']) {
    const r = s({ TB_RPC_TEST: FORK, [v]: 'x' });
    j(r.demande === true && r.actif === false && /Railway/.test(String(r.pourquoi)), 'B sur Railway (' + v + ') : refuse');
  }
  j(s({ TB_RPC_TEST: FORK, NODE_ENV: 'production' }).actif === false, 'B NODE_ENV=production : refuse');
  j(s({ TB_RPC_TEST: FORK, NODE_ENV: 'development' }).actif === true, 'B NODE_ENV=development : admis');
}

/* ── C : les quatre listes du serveur, evaluees depuis SON texte ───────────────────────────────────────────────────── */
/* la reference : les quatre declarations du commit 9ab857e (la production), recopiees telles quelles */
const REFERENCE_9AB857E = [
  /* 2026-10-10 : 9ab857e MOINS les deux noeuds morts mesures en prod (developer-access-mainnet.base.org 0/3 832, 1rpc.io 0/558) */
  "const RPC_LIST = (process.env.BASE_RPC\n  || 'https://mainnet.base.org')\n  .split(',').map((s) => s.trim()).filter(Boolean);",
  /* game361: + publicnode + tenderly in the pool-read list (prod measured 2,631 rate limits on mainnet.base.org, publicnode 0) */
  "const RPC_FAITS_POOL = (process.env.BASE_RPC_LECTURE\n  || 'https://mainnet.base.org,https://base.drpc.org,https://base-rpc.publicnode.com,https://gateway.tenderly.co/public/base')\n  .split(',').map((s) => s.trim()).filter(Boolean);",
  "const RPC_ACTIVITE = [...new Set([...RPC_LIST, 'https://base-rpc.publicnode.com', 'https://base.drpc.org'])];",
  "const RPC_SIMULATION = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'];",
];
function declarationsServeur(src) {
  const motifs = [/const RPC_LIST = [\s\S]*?\.filter\(Boolean\);/, /const RPC_FAITS_POOL = [\s\S]*?\.filter\(Boolean\);/, /const RPC_ACTIVITE = .*;/, /const RPC_SIMULATION = .*;/];
  return motifs.map((m) => { const x = src.match(m); return x ? x[0] : null; });
}
const evaluerListes = (decls, env, essai) => new Function('process', 'ESSAI_SRV', decls.join('\n') + '\nreturn { RPC_LIST, RPC_FAITS_POOL, RPC_ACTIVITE, RPC_SIMULATION };')({ env }, essai);
function jeuListes(src, j) {
  const decls = declarationsServeur(src);
  if (!j(decls.every(Boolean), 'C les quatre declarations de noeuds se lisent dans serveur-web.js')) return;
  for (const env of [{}, { BASE_RPC: 'http://a.exemple, http://b.exemple' }, { BASE_RPC_LECTURE: 'http://c.exemple' }, { BASE_RPC: 'http://a.exemple', BASE_RPC_LECTURE: 'http://c.exemple,http://d.exemple' }]) {
    let avant, apres;
    try { avant = evaluerListes(REFERENCE_9AB857E, env, undefined); apres = evaluerListes(decls, env, { demande: false, actif: false, rpc: null }); } catch (e) { j(false, 'C evaluation : ' + e.message); continue; }
    j(JSON.stringify(apres) === JSON.stringify(avant), 'C hors essai, env ' + JSON.stringify(env) + ' : les quatre listes sont celles de 9ab857e');
  }
  let enEssai;
  try { enEssai = evaluerListes(decls, { BASE_RPC: 'http://a.exemple', BASE_RPC_LECTURE: 'http://c.exemple' }, { demande: true, actif: true, rpc: FORK }); } catch (e) { j(false, 'C evaluation en essai : ' + e.message); return; }
  for (const k of ['RPC_LIST', 'RPC_FAITS_POOL', 'RPC_ACTIVITE', 'RPC_SIMULATION']) {
    j(JSON.stringify(enEssai[k]) === JSON.stringify([FORK]), 'C en essai : ' + k + ' = le fork, et lui seul (meme si BASE_RPC est pose)');
  }
}

/* ── D : le bloc d app.html, execute tel qu il est ecrit ───────────────────────────────────────────────────────────── */
function blocPage(html) {
  const m = html.match(/const ESSAI = modeEssai\(\{ hote: location\.hostname, recherche: location\.search \}\);\n[\s\S]*?console\.warn\('\[test mode\] not enabled: ' \+ ESSAI\.pourquoi\);\n/);
  const reseaux = html.match(/const RESEAUX = \{\n[\s\S]*?\n\};\n/);
  const stockage = html.match(/const RPC_STOCKAGE = .*;\n/);
  return { bloc: m ? m[0] : null, reseaux: reseaux ? reseaux[0] : null, stockage: stockage ? stockage[0] : null };
}
/** Une fenetre ou une extension de wallet tient `window.ethereum` et interdit qu on le remplace (le cas Rabby). */
function fenetreVerrouillee() {
  const vrai = { request: async () => { throw new Error('a REAL wallet was asked'); }, vraiWallet: true };
  const win = {};
  Object.defineProperty(win, 'ethereum', { get: () => vrai, configurable: false });
  return { win, vrai };
}
function executerBloc(parts, M, lieu, win = {}) {
  const code = parts.reseaux + parts.bloc.replace("import('./wallet-simule.js')", "importer('./wallet-simule.js')") + parts.stockage
    + '\nreturn { RESEAUX, ESSAI, RPC_STOCKAGE };';
  const imports = [], avertis = [], doc = { body: { textContent: '' } };
  const importer = (f) => { imports.push(f); return Promise.resolve({ installerWalletSimule: (o) => ({ request: async () => o, on() {}, removeListener() {} }) }); };
  const r = new Function('modeEssai', 'fournisseurDiffere', 'poserFournisseur', 'location', 'window', 'document', 'console', 'importer', code)(
    M.modeEssai, M.fournisseurDiffere, M.poserFournisseur, lieu, win, doc, { warn: (t) => avertis.push(t) }, importer);
  return { ...r, win, imports, avertis, doc };
}
function jeuPage(html, M, j) {
  const parts = blocPage(html);
  if (!j(!!parts.bloc && !!parts.reseaux && !!parts.stockage, 'D le bloc du mode essai, RESEAUX et RPC_STOCKAGE se lisent dans app.html')) return;
  j(parts.bloc.split("import('./wallet-simule.js')").length === 2, 'D le bloc charge wallet-simule.js par import(), une seule fois');
  const temoin = JSON.stringify(new Function(parts.reseaux + 'return RESEAUX;')());
  for (const lieu of [{ hostname: 'tokenizedblock.space', search: '' }, { hostname: 'tokenizedblock.space', search: Q }, { hostname: 'tokenizedblock.space', search: Q + '&rpc=' + encodeURIComponent(FORK) },
    { hostname: 'localhost', search: '' }, { hostname: 'localhost', search: '?panel=1' }, { hostname: '127.0.0.1.exemple.com', search: Q }]) {
    let r; try { r = executerBloc(parts, M, lieu); } catch (e) { j(false, 'D le bloc a leve sur ' + lieu.hostname + ' : ' + e.message); continue; }
    const nom = lieu.hostname + (lieu.search ? ' ' + lieu.search.slice(0, 24) + '…' : ' (sans parametre)');
    j(JSON.stringify(r.RESEAUX) === temoin, 'D ' + nom + ' : RESEAUX intact');
    j(!('ethereum' in r.win), 'D ' + nom + ' : window.ethereum pas touche');
    j(r.imports.length === 0, 'D ' + nom + ' : wallet-simule.js pas demande');
    j(r.RPC_STOCKAGE === 'tb-rpc-immuable-v1', 'D ' + nom + ' : la cle du cache RPC est celle d avant');
    j(r.avertis.length === (lieu.search.includes('essai=wallet') ? 1 : 0), 'D ' + nom + ' : ' + (lieu.search.includes('essai=wallet') ? 'le refus est dit une fois dans la console' : 'aucune ligne de console'));
  }
  let r; try { r = executerBloc(parts, M, { hostname: 'localhost', search: Q }); } catch (e) { j(false, 'D le bloc a leve en essai : ' + e.message); return; }
  const R = r.RESEAUX[8453];
  j(R.rpc === FORK && R.b20Rpc === FORK && R.logsMultiRpc === FORK && R.logsArchiveRpc === FORK, 'D en essai : les quatre noeuds de la page sont le fork');
  j(Array.isArray(R.secours) && R.secours.length === 0, 'D en essai : aucun noeud de secours (une lecture ne retombe jamais sur un vrai noeud)');
  j(!/base\.org|publicnode|drpc|1rpc/.test(JSON.stringify([R.rpc, R.secours, R.b20Rpc, R.logsMultiRpc, R.logsArchiveRpc])), 'D en essai : plus aucun noeud public parmi les noeuds lus par la page');
  j(JSON.stringify(r.RESEAUX[84532]) === JSON.stringify(JSON.parse(temoin)[84532]), 'D en essai : Sepolia n est pas touche');
  j(r.win.ethereum && r.win.ethereum.isWalletSimule === true && r.imports.length === 1 && r.imports[0] === './wallet-simule.js', 'D en essai : window.ethereum est le wallet simule, charge une fois');
  j(r.RPC_STOCKAGE === 'tb-rpc-essai-' + COMPTE, 'D en essai : le cache RPC a sa propre cle, par compte');
  j(r.doc.body.textContent === '', 'D en essai, sans extension de wallet : la page n est pas arretee');
  /* une extension de wallet tient window.ethereum : la page en essai S ARRETE, elle ne continue pas avec le vrai wallet */
  const v = fenetreVerrouillee();
  let leve = null, rv = null;
  try { rv = executerBloc(parts, M, { hostname: 'localhost', search: Q }, v.win); } catch (e) { leve = e; }
  j(leve !== null && /real wallet/.test(String(leve && leve.message)) && rv === null, 'D en essai, un vrai wallet tient window.ethereum : le module de la page LEVE (rien ne s execute apres)');
  j(v.win.ethereum === v.vrai, 'D … et le temoin est bien un wallet qu on n a pas pu remplacer');
  /* hors essai, la meme fenetre verrouillee ne gene rien : le bloc n y touche pas */
  let r2 = null; try { r2 = executerBloc(parts, M, { hostname: 'tokenizedblock.space', search: Q }, fenetreVerrouillee().win); } catch (e) { r2 = null; }
  j(r2 !== null && r2.imports.length === 0 && r2.doc.body.textContent === '', 'D hors essai, un vrai wallet present : le bloc ne leve pas et ne touche a rien');
}
function jeuPose(M, j) {
  const s = { simule: true };
  const a = {}; j(M.poserFournisseur(a, s) === true && a.ethereum === s, 'pose : une fenetre sans wallet recoit le wallet simule');
  const b = { ethereum: { ancien: true } }; j(M.poserFournisseur(b, s) === true && b.ethereum === s, 'pose : un wallet remplacable est remplace');
  const c = {}; Object.defineProperty(c, 'ethereum', { value: { vrai: true }, writable: false, configurable: false });
  j(M.poserFournisseur(c, s) === false && c.ethereum.vrai === true, 'pose : un wallet fige (ni configurable ni inscriptible) n est PAS remplace, et la fonction le DIT (faux)');
  const d = fenetreVerrouillee(); j(M.poserFournisseur(d.win, s) === false, 'pose : un wallet pose par un accesseur fige : faux aussi');
}

/* ── E : le wallet simule, contre un faux fork en memoire ──────────────────────────────────────────────────────────── */
function fauxFork({ client = 'anvil/v1.6.0', chaine = '0x2105' } = {}) {
  const appels = [], recus = new Map();
  const aller = async (url, o) => {
    const q = JSON.parse(o.body);
    appels.push({ url, method: q.method, params: q.params });
    let result = null;
    if (q.method === 'web3_clientVersion') result = client;
    else if (q.method === 'eth_chainId') result = chaine;
    else if (q.method === 'eth_estimateGas') result = '0x5208';
    else if (q.method === 'eth_sendTransaction') { result = '0x' + String(recus.size + 1).padStart(64, 'a'); recus.set(result, { status: '0x1', gasUsed: '0x5208', blockNumber: '0x1', logs: [] }); }
    else if (q.method === 'eth_getTransactionReceipt') result = recus.get(q.params[0]) || null;
    else if (q.method === 'eth_call') result = '0x' + '0'.repeat(63) + '7';
    return { status: 200, json: async () => ({ jsonrpc: '2.0', id: q.id, result }) };
  };
  return { aller, appels, de: (m) => appels.filter((a) => a.method === m) };
}
const code = async (p) => { try { await p; return 'aucune erreur'; } catch (e) { return e && e.code; } };
async function jeuWallet(W, Envoi, FraisM, j) {
  const cree = (o = {}) => { const f = fauxFork(o.fork); return { f, w: W.creerWalletSimule({ rpcUrl: FORK, compte: COMPTE, fetchImpl: f.aller, ...(o.wallet || {}) }) }; };
  const leve = (fn) => { try { fn(); return false; } catch (_) { return true; } };
  const f0 = fauxFork();
  j(leve(() => W.creerWalletSimule({ rpcUrl: 'https://mainnet.base.org', compte: COMPTE, fetchImpl: f0.aller })), 'E un noeud distant : le wallet refuse d exister');
  j(leve(() => W.creerWalletSimule({ rpcUrl: 'http://exemple.com:8549', compte: COMPTE, fetchImpl: f0.aller })), 'E un noeud http distant : refuse aussi');
  j(leve(() => W.creerWalletSimule({ rpcUrl: FORK, compte: FraisM.FEE_WALLET, fetchImpl: f0.aller })), 'E le wallet des frais comme compte d essai : refuse');
  j(leve(() => W.creerWalletSimule({ rpcUrl: FORK, compte: COMPTE.slice(0, 30), fetchImpl: f0.aller })), 'E un compte tronque : refuse');
  /* avant la connexion */
  { const { f, w } = cree();
    j(JSON.stringify(await w.request({ method: 'eth_accounts' })) === '[]', 'E avant connexion : eth_accounts rend une liste vide (aucune reprise de session inventee)');
    j(await code(w.request({ method: 'eth_sendTransaction', params: [{ from: COMPTE, to: AUTRE, value: '0x1' }] })) === 4100 && f.de('eth_sendTransaction').length === 0, 'E avant connexion : un envoi est refuse (4100) et rien ne part au noeud');
    /* la connexion */
    const comptes = await w.request({ method: 'eth_requestAccounts' });
    j(JSON.stringify(comptes) === JSON.stringify([COMPTE]) && f.de('anvil_impersonateAccount').length === 1 && f.de('anvil_impersonateAccount')[0].params[0] === COMPTE, 'E la connexion impersonne CE compte sur le fork, et le rend');
    j(f.appels.every((a) => a.url === FORK), 'E tous les appels vont au noeud local donne');
    j(await w.request({ method: 'eth_chainId' }) === '0x2105' && JSON.stringify(await w.request({ method: 'eth_accounts' })) === JSON.stringify([COMPTE]), 'E apres connexion : chaine 0x2105, compte rendu');
    /* un envoi : transmis tel quel, depuis ce compte */
    const tx = { from: COMPTE, to: AUTRE, data: '0xabcdef', value: '0x10', gas: '0x7530' };
    const h = await w.request({ method: 'eth_sendTransaction', params: [tx] });
    const parti = f.de('eth_sendTransaction')[0];
    j(/^0x[0-9a-f]{64}$/.test(h) && !!parti && JSON.stringify(parti.params[0]) === JSON.stringify({ from: COMPTE, data: '0xabcdef', value: '0x10', to: AUTRE, gas: '0x7530' }), 'E un envoi part au fork avec le destinataire, la valeur, les donnees et la limite de gaz de l app, inchanges');
    const l = w.journal[w.journal.length - 1];
    j(l.methode === 'eth_sendTransaction' && l.issue === 'sent' && l.vers === AUTRE && l.valeur === '0x10' && l.octets === 3 && l.hash === h, 'E le journal du wallet dit ce qu il a recu (destinataire, valeur, taille des donnees, hash)');
    j(W.ligneJournal(l).includes(AUTRE) && W.ligneJournal(l).includes(h), 'E la ligne du bandeau porte le destinataire et le hash EN ENTIER');
    /* un autre compte : jamais */
    const avant = f.de('eth_sendTransaction').length;
    j(await code(w.request({ method: 'eth_sendTransaction', params: [{ ...tx, from: AUTRE }] })) === 4100 && f.de('eth_sendTransaction').length === avant, 'E un envoi « depuis » un autre compte est refuse (4100), rien ne part');
    /* le refus de l utilisateur */
    w.refuserLaProchaine();
    let err = null; try { await w.request({ method: 'eth_sendTransaction', params: [tx] }); } catch (e) { err = e; }
    j(!!err && err.code === 4001 && Envoi.estRefusUtilisateur(err) && f.de('eth_sendTransaction').length === avant, 'E « decline the next request » : code 4001, reconnu par envoi.js comme un refus, rien ne part');
    j(w.refusArme() === false && /^0x/.test(await w.request({ method: 'eth_sendTransaction', params: [tx] })), 'E le refus ne vaut que pour UNE demande : la suivante passe');
    /* liste fermee */
    const nAppels = f.appels.length;
    for (const m of ['anvil_setBalance', 'anvil_impersonateAccount', 'evm_snapshot', 'evm_revert', 'anvil_reset', 'hardhat_setBalance', 'eth_sendRawTransaction', 'eth_signTransaction', 'debug_traceCall', '']) {
      j(await code(w.request({ method: m, params: [AUTRE, '0xffff'] })) === 4200, 'E « ' + m + ' » n est pas offert a la page (4200)');
    }
    j(f.appels.length === nAppels, 'E aucune de ces methodes n a atteint le noeud');
    j(await w.request({ method: 'eth_call', params: [{ to: AUTRE, data: '0x' }, 'latest'] }) === '0x' + '0'.repeat(63) + '7' && f.de('eth_call').length === 1, 'E une lecture (eth_call) est relayee');
    /* ce qu un compte classique sans cle ne sait pas faire */
    for (const m of ['wallet_sendCalls', 'wallet_getCapabilities', 'personal_sign']) {
      let e2 = null; try { await w.request({ method: m, params: [] }); } catch (e) { e2 = e; }
      j(!!e2 && e2.code === 4200 && /not supported/.test(e2.message), 'E « ' + m + ' » : non supporte, dit comme un vrai wallet le dit');
    }
    /* le vrai envoyerDepuisWallet, a travers lui */
    const rpc = async (method, params) => (await (await f.aller(FORK, { body: JSON.stringify({ id: 1, method, params }) })).json()).result;
    const r = await Envoi.envoyerDepuisWallet({ eth: w, rpc, chaineAttendue: 8453, compte: COMPTE, to: AUTRE, data: '0x', value: '0x1', delai: 5, essais: 5 });
    j(r.etat === 'CONFIRME' && /^0x/.test(String(r.hash)), 'E envoyerDepuisWallet (envoi.js, le vrai) confirme a travers le wallet simule');
    w.refuserLaProchaine();
    const r2 = await Envoi.envoyerDepuisWallet({ eth: w, rpc, chaineAttendue: 8453, compte: COMPTE, to: AUTRE, data: '0x', value: '0x1', delai: 5, essais: 5 });
    j(r2.etat === 'REFUSE_PAR_UTILISATEUR', 'E un refus dans le wallet simule rend REFUSE_PAR_UTILISATEUR — pas une retombee sur wallet_sendCalls');
    const lot = await Envoi.envoyerLotAtomique({ eth: w, rpc, chaineAttendue: 8453, compte: COMPTE, calls: [{ to: AUTRE, data: '0x', value: '0x0' }] });
    j(lot.etat === 'ECHEC_ENVOI' && lot.sendCallsUnsupported === true, 'E un lot atomique : le wallet simule dit ne pas savoir grouper (la page prend l etape par etape)');
    let recu = null; w.on('accountsChanged', (a) => { recu = a; }); w.deconnecter();
    j(JSON.stringify(recu) === '[]' && JSON.stringify(await w.request({ method: 'eth_accounts' })) === '[]', 'E deconnecter() : la page recoit accountsChanged([]), eth_accounts redevient vide');
  }
  /* le noeud n est pas un fork */
  { const { f, w } = cree({ fork: { client: 'Geth/v1.13.14-stable/linux-amd64/go1.21.7' } });
    j(await code(w.request({ method: 'eth_requestAccounts' })) === 4900 && f.de('anvil_impersonateAccount').length === 0, 'E un noeud local qui ne se dit pas anvil : connexion refusee, rien d impersonne');
    j(JSON.stringify(await w.request({ method: 'eth_accounts' })) === '[]', 'E … et le wallet reste deconnecte'); }
  { const { f, w } = cree({ fork: { chaine: '0x1' } });
    j(await code(w.request({ method: 'eth_requestAccounts' })) === 4901 && f.de('anvil_impersonateAccount').length === 0, 'E un fork d une AUTRE chaine : connexion refusee'); }
  /* un wallet ouvert sur Ethereum (le cas Rabby) */
  { const { f, w } = cree({ wallet: { chaineDepart: '0x1' } });
    await w.request({ method: 'eth_requestAccounts' });
    j(await w.request({ method: 'eth_chainId' }) === '0x1', 'E chaineDepart 0x1 : le wallet se dit sur Ethereum');
    j(await code(w.request({ method: 'eth_sendTransaction', params: [{ from: COMPTE, to: AUTRE, value: '0x1' }] })) === 4901 && f.de('eth_sendTransaction').length === 0, 'E … et refuse d envoyer tant qu il n est pas sur Base');
    j(await code(w.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] })) === 4902, 'E une chaine inconnue : 4902, comme un vrai wallet');
    let vu = null; w.on('chainChanged', (c) => { vu = c; });
    await w.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x2105' }] });
    j(vu === '0x2105' && await w.request({ method: 'eth_chainId' }) === '0x2105', 'E wallet_switchEthereumChain 0x2105 : la chaine change et chainChanged est emis');
    j(/^0x/.test(String(await w.request({ method: 'eth_sendTransaction', params: [{ from: COMPTE, to: AUTRE, value: '0x1' }] }))), 'E … puis l envoi passe'); }
  /* le refus s applique aussi a la connexion */
  { const { f, w } = cree();
    w.refuserLaProchaine();
    j(await code(w.request({ method: 'eth_requestAccounts' })) === 4001 && f.appels.length === 0, 'E un refus a la connexion : 4001, le noeud n est meme pas joint'); }
}

/* ── le relais differe (mode-essai.js) ─────────────────────────────────────────────────────────────────────────────── */
async function jeuRelais(M, j) {
  let livrer; const p = new Promise((o) => { livrer = o; });
  const d = M.fournisseurDiffere(p);
  const ecoutes = [];
  d.on('accountsChanged', (a) => ecoutes.push(a));
  let rendu = null; const attente = d.request({ method: 'eth_accounts' }).then((x) => { rendu = x; });
  await new Promise((o) => setTimeout(o, 20));
  j(rendu === null && d.isWalletSimule === true, 'relais : un appel fait avant le chargement ATTEND (il ne repond pas a la place du wallet)');
  const lus = new Map();
  livrer({ request: async (a) => 'reponse a ' + a.method, on: (ev, fn) => lus.set(ev, fn), removeListener() {} });
  await attente;
  j(rendu === 'reponse a eth_accounts' && typeof lus.get('accountsChanged') === 'function', 'relais : a l arrivee du wallet, l appel aboutit et les ecouteurs deja poses lui sont remis');
  const casse = M.fournisseurDiffere(Promise.reject(new Error('404 on wallet-simule.js')));
  let err = null; try { await casse.request({ method: 'eth_accounts' }); } catch (e) { err = e; }
  j(!!err && /404/.test(err.message), 'relais : un chargement rate se DIT a chaque appel (jamais une attente sans fin)');
  const vide = M.fournisseurDiffere(Promise.resolve({}));
  let err2 = null; try { await vide.request({ method: 'eth_accounts' }); } catch (e) { err2 = e; }
  j(!!err2, 'relais : un module charge qui ne rend pas un wallet est une erreur dite');
}

/* ═════════════════════════════════════════ LE VRAI CODE ═════════════════════════════════════════ */
const M = await imp('mode-essai.js');
const W = await imp('wallet-simule.js');
const Envoi = await imp('envoi.js');
const FraisM = await imp('frais-creation.js');
const SRC_SERVEUR = lire('serveur-web.js'), SRC_PAGE = lire('app.html'), SRC_MODE = lire('mode-essai.js'), SRC_WALLET = lire('wallet-simule.js');
const avantReel = n;
jeuRegles(M, ok);
jeuListes(SRC_SERVEUR, ok);
jeuPage(SRC_PAGE, M, ok);
jeuPose(M, ok);
await jeuWallet(W, Envoi, FraisM, ok);
await jeuRelais(M, ok);
ok(/import \{ modeEssai, fournisseurDiffere, poserFournisseur \} from '\.\/mode-essai\.js';/.test(SRC_PAGE), 'la page importe mode-essai.js (statique) et rien du wallet simule (seulement par import())');
ok(!/from '\.\/wallet-simule\.js'/.test(SRC_PAGE), 'aucun import STATIQUE de wallet-simule.js dans app.html : un visiteur ne le telecharge jamais');
console.log('vrai code : ' + (n - avantReel) + ' assertions, ' + ko + ' KO');

/* la reference recopiee est-elle bien le texte de 9ab857e ? (trois etats : oui / non / git non lu) */
try {
  const vieux = execFileSync('git', ['show', '9ab857e:serveur-web.js'], { cwd: ICI, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
  /* 2026-10-10 : la reference = 9ab857e MOINS les deux noeuds morts ; le temoin retire ces deux noeuds du texte de 9ab857e, et rien d autre */
  const vieuxMoins = vieux.split(",https://developer-access-mainnet.base.org'").join("'").split(",https://developer-access-mainnet.base.org,").join(",").split(",https://1rpc.io/base'").join("'")
    /* game361: then the two nodes added to the pool-read list, and nothing else */
    .split("|| 'https://mainnet.base.org,https://base.drpc.org')").join("|| 'https://mainnet.base.org,https://base.drpc.org,https://base-rpc.publicnode.com,https://gateway.tenderly.co/public/base')");
  ok(REFERENCE_9AB857E.every((d) => vieuxMoins.includes(d)) && vieux.includes('developer-access-mainnet.base.org') && vieux.includes('1rpc.io/base'), 'temoin : les quatre declarations de reference sont, au caractere pres, celles du commit 9ab857e moins developer-access-mainnet.base.org et 1rpc.io');
} catch (_) { console.log('NON LU : git ne rend pas 9ab857e ici — la reference recopiee n a pas ete comparee au commit (elle l a ete le 2026-10-04)'); }

/* ═════════════════════════════════════════ LES MUTANTS ══════════════════════════════════════════ */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'essai-mut-'));
const compter = async (fn) => { let rouges = 0, plante = null; try { await fn((c) => { if (!c) rouges += 1; return !!c; }); } catch (e) { plante = String((e && e.message) || e).slice(0, 70); } return { rouges, plante }; };
/* ⛔ UN MUTANT EST TUE PAR UNE ASSERTION, PAS PAR UN PLANTAGE : une copie mutee qui LEVE (faute de syntaxe, motif mal coupe)
 *   rougirait pour une raison sans rapport avec la garde retiree. Un plantage est donc un KO de ce fichier. */
let mutantsTues = 0;
const dire = (nom, r) => {
  const tue = r.plante === null && r.rouges > 0;
  if (tue) mutantsTues += 1;
  console.log((tue ? 'ROUGE  ' : 'SURVIT ') + 'mutant « ' + nom + ' » : ' + (r.plante ? 'a LEVE (' + r.plante + ')' : r.rouges + ' assertion(s) rouge(s)'));
  return ok(tue, 'mutant « ' + nom + ' » : ' + (r.plante ? 'la copie mutee a leve (' + r.plante + ') — ce n est pas une preuve' : 'SURVIT, la garde n est pas tenue par ce fichier'));
};
const muter = (src, mu) => (src.split(mu.de).length === 2 ? src.replace(mu.de, () => mu.a) : null);

for (const mu of [
  { nom: 'page : la condition d hote retiree', de: "  if (!estHoteLocal(hote)) return non('test mode exists only on a page served from this machine (localhost)');\n", a: '' },
  { nom: 'page : actif sans que l URL le demande', de: '  if (q.get(PARAM_ESSAI) !== VALEUR_ESSAI) return non();\n', a: '' },
  { nom: 'hote local juge par inclusion (localhost.exemple.com passe)', de: "  return HOTES_LOCAUX.includes(String(hote === undefined || hote === null ? '' : hote).toLowerCase());", a: "  return HOTES_LOCAUX.some((h) => String(hote || '').toLowerCase().includes(h));" },
  { nom: 'noeud d essai : l hote n est plus verifie', de: '  if (!estHoteLocal(x.hostname)) return null;\n', a: '' },
  { nom: 'noeud d essai : https admis', de: "  if (x.protocol !== 'http:') return null;\n", a: '' },
  { nom: 'noeud d essai : identifiants admis', de: '  if (x.username || x.password) return null;\n', a: '' },
  { nom: 'noeud d essai : chemin et requete admis', de: "  if ((x.pathname && x.pathname !== '/') || x.search || x.hash) return null;\n", a: '' },
  { nom: 'page : compte non verifie', de: "  if (!ADRESSE.test(compte)) return non('the test account must be a whole address: compte=0x… (40 hex characters)');\n", a: '' },
  { nom: 'serveur : Railway admis', de: "  if (railway.length) return refus('TB_RPC_TEST is refused on Railway (' + railway[0] + ' is set)');\n", a: '' },
  { nom: 'serveur : production admise', de: "  if (String(e.NODE_ENV || '').toLowerCase() === 'production') return refus('TB_RPC_TEST is refused when NODE_ENV is production');\n", a: '' },
  { nom: 'serveur : noeud distant admis', de: '  const rpc = urlLocale(brut);\n  if (!rpc) return refus', a: '  const rpc = brut;\n  if (!rpc) return refus' },
  { nom: 'pose : dit « pose » sans verifier que le wallet simule est bien en place', de: '  return lu === simule;\n', a: '  return true;\n' },
]) {
  const m = muter(SRC_MODE, mu);
  if (!m) { ok(false, 'mutant « ' + mu.nom + ' » : motif introuvable ou multiple dans mode-essai.js'); continue; }
  const dir = fs.mkdtempSync(path.join(tmp, 'm-'));
  fs.writeFileSync(path.join(dir, 'mode-essai.js'), m);
  const Mm = await imp('mode-essai.js', dir);
  dire(mu.nom, await compter(async (j) => { jeuRegles(Mm, j); jeuPage(SRC_PAGE, Mm, j); jeuPose(Mm, j); }));
}
for (const mu of [
  { nom: 'wallet : le noeud n a plus a etre anvil', de: "    if (!/^anvil\\b/i.test(client)) throw erreur(4900, 'this node is not a local fork (it says “' + client.slice(0, 40) + '”): the simulated wallet only works against anvil');\n", a: '' },
  { nom: 'wallet : un fork d une autre chaine est admis', de: "    if (id !== CHAINE_BASE_HEX) throw erreur(4901, 'the local fork is on chain ' + id + ', not Base (' + CHAINE_BASE_HEX + ')');\n", a: '' },
  { nom: 'wallet : signe pour n importe quel compte', de: '      if (de !== moi) {', a: '      if (false) {' },
  { nom: 'wallet : envoie sans etre connecte', de: '      if (!connecte) {', a: '      if (false) {' },
  { nom: 'wallet : envoie depuis une autre chaine', de: '      if (chaine !== CHAINE_BASE_HEX) {', a: '      if (false) {' },
  { nom: 'wallet : relaie TOUTE methode au noeud (anvil_setBalance compris)', de: "    throw erreur(4200, 'The method ' + (methode || '(none)') + ' is not supported by the simulated wallet.');", a: '    return noeud(methode, params);' },
  { nom: 'wallet : un noeud distant est admis', de: '  const url = urlLocale(rpcUrl);', a: '  const url = String(rpcUrl);' },
  { nom: 'wallet : le wallet des frais est admis', de: "  if (moi === String(FEE_WALLET).toLowerCase()) throw new Error('never test from the fee wallet');\n", a: '' },
  { nom: 'wallet : le refus arme est ignore', de: '    if (!refuserLaProchaine) return;\n', a: '    return;\n' },
  { nom: 'wallet : le refus ne se desarme jamais', de: '    refuserLaProchaine = false;\n    noter({ methode, ...detail, issue: \'declined\' });', a: '    noter({ methode, ...detail, issue: \'declined\' });' },
]) {
  const m = muter(SRC_WALLET, mu);
  if (!m) { ok(false, 'mutant « ' + mu.nom + ' » : motif introuvable ou multiple dans wallet-simule.js'); continue; }
  const dir = fs.mkdtempSync(path.join(tmp, 'w-'));
  fs.writeFileSync(path.join(dir, 'wallet-simule.js'), m);
  for (const f of ['mode-essai.js', 'frais-creation.js']) fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  const Wm = await imp('wallet-simule.js', dir);
  dire(mu.nom, await compter((j) => jeuWallet(Wm, Envoi, FraisM, j)));
}
for (const mu of [
  { nom: 'app.html : le bloc s execute sans condition', de: 'if (ESSAI.actif) {\n  Object.assign(RESEAUX[8453]', a: 'if (true) {\n  Object.assign(RESEAUX[8453]' },
  { nom: 'app.html : les noeuds de secours publics restent en essai', de: 'rpc: ESSAI.rpc, secours: [], logsMultiRpc', a: 'rpc: ESSAI.rpc, logsMultiRpc' },
  { nom: 'app.html : le noeud des B20 reste public en essai', de: ', b20Rpc: ESSAI.rpc });', a: ' });' },
  { nom: 'app.html : la page continue avec le VRAI wallet quand le simule n a pas pu etre pose', de: "    throw new Error('test mode stopped: window.ethereum is held by a real wallet');\n", a: '' },
  { nom: 'app.html : le cache RPC de l essai se melange a celui de la vraie chaine', de: "const RPC_STOCKAGE = ESSAI.actif ? 'tb-rpc-essai-' + ESSAI.compte : 'tb-rpc-immuable-v1';", a: "const RPC_STOCKAGE = 'tb-rpc-immuable-v1';" },
]) {
  const m = muter(SRC_PAGE, mu);
  if (!m) { ok(false, 'mutant « ' + mu.nom + ' » : motif introuvable ou multiple dans app.html'); continue; }
  dire(mu.nom, await compter((j) => jeuPage(m, M, j)));
}
for (const mu of [
  { nom: 'serveur : condition inversee sur RPC_LIST', de: 'const RPC_LIST = ESSAI_SRV.actif ? ', a: 'const RPC_LIST = !ESSAI_SRV.actif ? ' },
  { nom: 'serveur : RPC_FAITS_POOL reste public en essai', de: 'const RPC_FAITS_POOL = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : (', a: 'const RPC_FAITS_POOL = (' },
  { nom: 'serveur : RPC_ACTIVITE garde publicnode et drpc en essai', de: 'const RPC_ACTIVITE = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : [', a: 'const RPC_ACTIVITE = [' },
  { nom: 'serveur : RPC_SIMULATION reste publique en essai', de: 'const RPC_SIMULATION = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : [', a: 'const RPC_SIMULATION = [' },
  { nom: 'serveur : un noeud par defaut change', de: "|| 'https://mainnet.base.org')", a: "|| 'https://base.drpc.org')" },
]) {
  const m = muter(SRC_SERVEUR, mu);
  if (!m) { ok(false, 'mutant « ' + mu.nom + ' » : motif introuvable ou multiple dans serveur-web.js'); continue; }
  dire(mu.nom, await compter((j) => jeuListes(m, j)));
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* dossier temporaire */ }

/* ═════════════════════════════════════ F : LE SERVEUR, LANCE ═════════════════════════════════════ */
const { demarrerServeur, pause } = await imp('outils-essai-fork.mjs');
function fauxNoeudHttp() {
  const vus = [];
  const srv = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => {
      let q = null; try { q = JSON.parse(corps); } catch (_) { q = null; }
      const m = q && q.method; vus.push(m);
      const result = m === 'eth_blockNumber' ? '0x31b8ce1' : m === 'eth_chainId' ? '0x2105' : m === 'eth_getLogs' ? [] : m === 'eth_call' ? '0x' + '0'.repeat(64) : null;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: q ? q.id : null, result }));
    });
  });
  return new Promise((o) => srv.listen(0, '127.0.0.1', () => o({ url: 'http://127.0.0.1:' + srv.address().port, vus,
    fermer: () => new Promise((f) => { try { srv.closeAllConnections(); } catch (_) { /* node ancien */ } srv.close(() => f()); }) })));
}
const NOEUDS_PUBLICS = /base\.org|publicnode|drpc|1rpc/;
const UNE_ACTION = (lire('paires.js').match(/symbole: 'NVDAc'[^}]*adr: '(0x[0-9a-fA-F]{40})'/) || [])[1];
ok(/^0x[0-9a-fA-F]{40}$/.test(String(UNE_ACTION)), 'F l adresse d une action se lit dans paires.js (pour /api/activite)');
/** Un lancement : rend ce qui a ete observe. `fichier` permet de lancer une copie mutee du serveur, posee a cote de lui. */
async function lancer({ essai, extra = {}, fichier = 'serveur-web.js', activite = false }) {
  const A = await fauxNoeudHttp(), B = await fauxNoeudHttp();
  let s = null;
  try {
    s = await demarrerServeur({ rpcEssai: essai ? B.url : null, fichier, env: { BASE_RPC: A.url, BASE_RPC_LECTURE: A.url, ...extra } });
    const code = async (c) => (await fetch(s.url + c, { signal: AbortSignal.timeout(20000) })).status;
    const wallet = await code('/wallet-simule.js'), mode = await code('/mode-essai.js');
    if (activite) { try { await fetch(s.url + '/api/activite/' + String(UNE_ACTION).toLowerCase(), { signal: AbortSignal.timeout(20000) }); } catch (_) { /* seul le trajet compte */ } }
    await pause(2500); /* le balayage de demarrage part 1,5 s apres l ecoute */
    const sante = await (await fetch(s.url + '/sante')).json();
    return { wallet, mode, sante, a: A.vus.length, b: B.vus.length, urlB: B.url, origines: s.origines(), journal: s.journal() };
  } finally { if (s) await s.arreter(); await A.fermer(); await B.fermer(); }
}
function jugerDefaut(r, j) {
  j(r.wallet === 404, 'F par defaut : /wallet-simule.js rend 404 (obtenu ' + r.wallet + ')');
  j(r.mode === 200, 'F par defaut : /mode-essai.js est servi (la page l importe)');
  j(!('essai' in r.sante), 'F par defaut : /sante ne porte aucun champ « essai »');
  j(r.a > 0 && r.b === 0, 'F par defaut : les lectures partent au noeud de BASE_RPC (' + r.a + '), aucune ailleurs (' + r.b + ')');
}
{
  const r = await lancer({ essai: false });
  jugerDefaut(r, ok);
  ok(!/\[essai\]/.test(r.journal), 'F par defaut : le journal du serveur ne parle pas d essai');
}
{
  const r = await lancer({ essai: true, activite: true });
  ok(r.wallet === 200 && r.mode === 200, 'F en essai : /wallet-simule.js et /mode-essai.js sont servis');
  ok(r.sante.essai && r.sante.essai.rpc === r.urlB, 'F en essai : /sante dit le noeud d essai');
  ok(r.b > 0 && r.a === 0, 'F en essai : TOUTES les lectures partent au noeud d essai (' + r.b + '), ZERO au noeud de BASE_RPC (' + r.a + ')');
  ok(!r.origines.joints.concat(r.origines.bloques).some((o) => NOEUDS_PUBLICS.test(o)), 'F en essai : aucun noeud public n est meme tente, /api/activite compris (origines : ' + JSON.stringify(r.origines) + ')');
  ok(/MODE ESSAI/.test(r.journal), 'F en essai : le serveur l ecrit dans son journal');
}
{
  const r = await lancer({ essai: true, extra: { RAILWAY_ENVIRONMENT: 'production' } });
  jugerDefaut(r, ok);
  ok(/TB_RPC_TEST IGNORE/.test(r.journal), 'F sur Railway : TB_RPC_TEST est ignore, et le journal le dit');
}
/* mutants du serveur LANCE : la copie mutee est posee a cote de serveur-web.js (ses imports relatifs tiennent), puis retiree */
for (const mu of [
  { nom: 'serveur lance : wallet-simule.js servi a tout le monde', de: '  if (SERVIS_EN_ESSAI_SEULEMENT.includes(nom) && !ESSAI_SRV.actif) continue;\n', a: '', lancement: { essai: false }, juge: jugerDefaut },
  { nom: 'serveur lance : /sante annonce l essai sans essai', de: "...(ESSAI_SRV.actif ? { essai: { rpc: ESSAI_SRV.rpc } } : {})", a: "...({ essai: { rpc: ESSAI_SRV.rpc } })", lancement: { essai: false }, juge: jugerDefaut },
  { nom: 'serveur lance : RPC_ACTIVITE tente les noeuds publics en essai', de: 'const RPC_ACTIVITE = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : [', a: 'const RPC_ACTIVITE = [', lancement: { essai: true, activite: true },
    juge: (r, j) => j(!r.origines.joints.concat(r.origines.bloques).some((o) => NOEUDS_PUBLICS.test(o)), 'aucun noeud public tente') },
]) {
  const m = muter(SRC_SERVEUR, mu);
  if (!m) { ok(false, 'mutant « ' + mu.nom + ' » : motif introuvable ou multiple dans serveur-web.js'); continue; }
  const fichier = 'serveur-web.mutant-' + process.pid + '.mjs';
  const chemin = path.join(ICI, fichier);
  let res;
  try { fs.writeFileSync(chemin, m); res = await compter(async (j) => mu.juge(await lancer({ ...mu.lancement, fichier }), j)); }
  finally { try { fs.unlinkSync(chemin); } catch (_) { /* deja retire */ } }
  dire(mu.nom, res);
}

console.log('\ntest-mode-essai : ' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) · ' + mutantsTues + ' mutant(s) tue(s) par une assertion');
process.exit(ko ? 1 : 0);
