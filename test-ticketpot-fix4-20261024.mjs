/* test-ticketpot-fix4-20261024.mjs - UN REFUS PASSAGER NE CACHE PLUS UNE PART, UNE JAMBE SANS PRIX NE BLOQUE PLUS UN TRADE PRICE, UN 429
 *   NE COUPE PLUS LES RENVOIS, LE SERVEUR REESSAIE SEUL LES TICKETS EN ATTENTE.
 * Revue adverse du correctif ticketpot, 3e tour (reviews-r3.md, TICKETPOT REVIEW) :
 *   D1 : tout refus du serveur etait note POT_SIGN_REFUS (definitif) ; un 400 « does not recover » venu des parts du GET en cache 60 s (un
 *     ticket credite en retard pour ce jour) cachait des parts signables au brain pour toute la grace (PoC poc-rev3-refus-transitoire) ;
 *   D2 : une jambe SANS PRIX rendait tout le trade NON_LU, meme quand le cote price valait deja 20 $ (PoC poc-rev3-jambe-sans-prix) ;
 *   D3 : un 429 au 4e ou 5e envoi coupait la chaine de renvois NON_LU en silence (PoC poc-rev3-429-coupe) ;
 *   D4 : la fin disait « refused » pour un serveur muet ; la boucle de signature continuait apres une panne (signatures perdues) ; la note
 *     du ticket etait loin du trade. Plus : rien ne reessayait un ticket en attente une fois l app fermee.
 * EXECUTE (decoupes de la source, montees par new Function ; simules : la chaine, le prix, le wallet, le DOM, fetch, l horloge) :
 *  serveur-web.js : la route /api/ticketpot/(parts|signature), la route POST /api/paye, crediterVolumeJour, jambeSansPrix,
 *    invaliderPartsTPJours, crediterPassSkin, retenterTicket, balayerTicketsEnAttente, horodatageBloc — avec le VRAI cacheTemporise
 *    (ticketpot-parts-serveur.js), les vrais partsDuJour / verifierSignaturePart / crediter / ticketsJour ; signatures par signeur-secp256k1.js
 *    (cle de TEST publique des bancs, 0xA11CE) ; app.html : bjSignerParts, la fin de POT_SIGN de bjMontrer, la ligne refusVus,
 *    lieuTicketPaye / direTicketPaye / signalerPaye ; attester-ticketpot.html : son <script> entier ; brain-jeu.js : prochaineProposition.
 * AFFIRME :
 *  D1a parts du GET en cache, un ticket credite ensuite pour ce jour : le POST repond 412 PERIME (pas 400), la serie s ARRETE apres 1
 *      signature, rien n est note ; le GET suivant rend les parts fraiches (3 x 30) et le brain les propose TOUTES ;
 *  D1b seul un 409 (une autre part de ce wallet deja gardee) est note POT_SIGN_REFUS, et la serie continue (2 depots) ;
 *  D1c bout a bout : GET (cache) -> POST /api/paye d un ticket tardif pour ce jour -> le GET suivant a 3 parts (le credit invalide le jour
 *      et la semaine) ;
 *  D4 bjSignerParts : 400 REFUSE -> continue, non note ; reseau / 500 / 202 / 412 -> ARRET (pas de signature de plus) ; attester pareil
 *      (409 continue, reseau arrete) ; la fin de POT_SIGN dit « no answer » (pas « refused ») et « refused (n not proposed again) » pour 409 ;
 *  D2 cote price 20 $ + jambe sans prix -> 200 CREDITE 20 $ ; 4 $ + sans prix -> 202 NON_LU qui dit « $4.00 » et « below the $10 » ;
 *      8 $ deja credites ce jour + 4 $ + sans prix -> CREDITE ; ETH sans prix + action 20 $ -> CREDITE ;
 *  D3 un 429 au 4e / 5e envoi : la chaine va jusqu a 6 envois et la note est dite ; que des 429 apres un NON_LU : note « busy » ; un 429
 *      AVANT tout NON_LU : 3 renvois a 8 s (comme avant) ; une panne reseau dans la chaine : renvoi ;
 *  L  la note va sous le RESULTAT du trade (lieu enregistre), pas sous le ticket ; lieu detache -> « Last trade » sous le ticket ; lieu =
 *      fil du panneau -> une etape ; un credit efface la note du trade ; chaque appelant d un trade enregistre son lieu ;
 *  W  balayage serveur : pas avant 3 min, puis 5 min ; credit sans recompter le frais ; > 49 h -> sort sans appel ; 6 hash au plus par
 *      balayage ; un hash en cours saute ; recu null -> l attente reste ; pass skin credite (ses jours invalides) ; TROP_VIEUX sort ;
 *      un ticket NON_LU sans frais verifie attend aussi (ticketsEnAttente) et le serveur le credite ; l intervalle est cable (3 min).
 *  MUTANTS (copies en memoire des sources) : chaque garde retiree -> son scenario ROUGIT.
 * NE PROUVE PAS : un vrai navigateur, un vrai wallet, une vraie lecture de Base, un vrai prix illisible ; que le serveur deploye tourne le
 *   balayage (setInterval lu dans la source, pas execute) ; qu un jeton de JETONS_ACTIONS n ait vraiment aucun prix en prod.
 * Usage : node test-ticketpot-fix4-20261024.mjs [racine]  (racine = un autre arbre, pour le ROUGE avant) */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const RAC = path.resolve(process.argv[2] || ICI);
const imp = (f) => import(pathToFileURL(path.join(RAC, f)).href);
const lire = (f) => fs.readFileSync(path.join(RAC, f), 'utf8').replace(/\r\n/g, '\n');
const TS = await imp('tirage-saison.js');
const { saisonDe, jourDe, JOUR_MS, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD, ticketsJour, crediter, joursPass, valeurUsd } = TS;
const { joursTicketParWallet, niveauWallet, bonusNiveauxSemaine } = await imp('niveaux-jeu.js');
const { partsDuJour: partsTicketPot, verifierSignaturePart } = await imp('ticketpot-parts.js');
const { dayDeJourId: dayDeJourIdPot } = await imp('ticketpot-plan.js');
const { cacheTemporise } = await imp('ticketpot-parts-serveur.js');
const { signerDigest, adresseDe } = await imp('signeur-secp256k1.js');
const J = await imp('brain-jeu.js');

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const ticks = async (k = 30) => { for (let i = 0; i < k; i++) await new Promise((r) => setImmediate(r)); };
const essaiDe = (R) => async (nom, f) => { try { R[nom] = (await f()) === true; } catch (e) { R[nom] = false; R[nom + ':err'] = String((e && e.message) || e).slice(0, 160); } };

const CLE = '0x' + (0xA11CE).toString(16).padStart(64, '0'); /* cle de TEST publique des bancs */
const VERIF = adresseDe(CLE).toLowerCase();
const CT = '0xf98621bf4313e47af35b3344bdda112a32391df1', OWN = '0x' + '0a'.repeat(20);
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20), PAYEUR = '0x' + 'd4'.repeat(20);
const JA = '0x' + 'e5'.repeat(20), JX = '0x' + 'f6'.repeat(20);
const POT = 90000000n, MER = 'J2026-10-21', T_JEUDI = Date.UTC(2026, 9, 22, 10);
const H = (k) => '0x' + k.toString(16).padStart(64, '0');
const sec = (ms) => Math.floor(ms / 1000);
const semaineDe = (jid) => jourDe(saisonDe(Date.parse(jid.slice(1) + 'T00:00:00Z')).fin - JOUR_MS).id + '#S';

/* ================================================================ le serveur monte */
function monterSrv(src, etat, horloge, chaine) {
  const cut = (a, b, depuis = 0) => { const i = src.indexOf(a, depuis), k = src.indexOf(b, i + 1); if (i < 0 || k < i) throw new Error('decoupe introuvable : ' + a.slice(0, 40)); return src.slice(i, k); };
  const parts = cut("if (chemin === '/api/ticketpot/parts' || chemin === '/api/ticketpot/signature') {", "if (chemin === '/api/jeu/niveau') {");
  const niv = src.slice(src.indexOf('const joursTicketCache = '), src.indexOf('setInterval(() => {', src.indexOf('function niveauSrv(')));
  const r0 = src.indexOf("if (chemin === '/api/paye' && req.method === 'POST') {"), r1 = src.lastIndexOf('/*', src.indexOf('REGISTRE DES CREATEURS (2026-10-17'));
  const coeur = cut('const AGE_MAX_TICKET_MS', 'const SEL_CREATEURS');
  const horo = cut('async function horodatageBloc(n) {', 'let rollsScanEnVol');
  if (r0 < 0 || r1 < r0 || niv.length < 200) throw new Error('decoupe introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(horloge.t); } static now() { return horloge.t; } }
  const reel = cacheTemporise({ ttlMs: 60000, ttlEchecMs: 15000, max: 128, horloge: () => horloge.t });
  const invalides = [], rpcLog = [];
  const cache = { obtenir: (...x) => reel.obtenir(...x), invalider: (k) => { invalides.push(k); reel.invalider(k); }, taille: () => reel.taille() };
  const passe = { obtenir: (k, f) => Promise.resolve().then(f), invalider() {} };
  const rpc = async (meth, p) => {
    rpcLog.push(meth);
    if (meth === 'eth_getTransactionByHash') return { hash: p[0], from: PAYEUR };
    if (meth === 'eth_getTransactionReceipt') return chaine.recus[p[0]] || null;
    if (meth === 'eth_getBlockByNumber') { const ts = chaine.blocs[parseInt(p[0], 16)]; return ts === undefined ? null : { timestamp: '0x' + ts.toString(16) }; }
    if (meth === 'eth_call' && p[0].data === '0x313ce567') return '0x' + '6'.padStart(64, '0');
    throw new Error('rpc ' + meth);
  };
  const payesEnCours = new Set(), compte = { n: 0 };
  const deps = {
    revenu: etat, Date: D, LIGNES_FRAIS: ['hook_block', 'swap_action', 'skin_mint'], payesEnCours, rpcActivite: rpc, rpcServeur: rpc,
    walletsInternes: () => new Set(), COMPTE_SONDE: '0x00000000000000000000000000000000c0ffee77', process: { env: {} },
    verifierFrais: ({ tx, recu }) => (recu && (chaine.frais[tx && tx.hash] || {}).ok ? { ok: true, externe: true, payeur: (chaine.vol[tx.hash] || {}).payeur || PAYEUR, recus: [] } : { ok: false, etat: 'SANS_FRAIS', pourquoi: 'no fee of ours in this transaction' }),
    devisesComptees: () => [], POOLS_ACTIONS_AERODROME: new Map(),
    /* le vrai volumeVerifie lit les logs du RECU : sans recu, rien */
    volumeVerifie: ({ tx, recu }) => (recu ? chaine.vol[tx && tx.hash] || { ok: false } : { ok: false }),
    V4_ADRESSES: { 8453: { poolm: '0x' + '0'.repeat(40) } }, POOLS_UNIT_TB: new Set(), JETONS_ACTIONS: new Set([JA, JX]),
    prixUsdPourPlan: async (adr) => (chaine.prix ? chaine.prix(adr) : (adr === null ? 2000 : adr === JX ? null : 1)),
    decimalesCache: new Map(), WETH_SRV: '0x' + '42'.repeat(20), valeurUsd, crediter, jourDe, joursPass, saisonDe, SEUIL_VOLUME_JOUR_USD,
    passSkinVerifie: ({ tx }) => (chaine.skin[tx && tx.hash] ? { ok: true, payeur: PAYEUR } : { ok: false }), BLOCKSKINS_SRV: '0x' + 'c0'.repeat(20), BLOCKSKINS_ACTIF_SRV: { routeur: null } /* 2026-11-12: crediterPassSkin reads the active contract's router (none here) */, USDC_BASE: '0x' + 'aa'.repeat(20),
    FEE_WALLET: '0x' + 'fe'.repeat(20), SKIN_MINT_USDC_SRV: 1000000n,
    compterRevenu: (x) => { compte.n += 1; return x; }, createurDuBlock: async () => null, ligneRegistre: () => ({}), horodatagesBlocsRolls: new Map(), console: { log() {} },
    TICKETPOT_DEPLOIEMENT: { adresse: CT }, dayDeJourIdPot, JOUR_MS, joursEntre, entreesPeriode, bonusNiveauxSemaine, joursTicketParWallet, niveauWallet, ticketsJour,
    partsTicketPot, verifierSignaturePart, jourChaineTP: passe, partsCacheTP: cache,
    lireJourTicketPot: async () => ({ ferme: true, enPause: false, potAtClose: POT, reste: POT, verifier: VERIF }),
    couvertureParts: () => ({ complete: true }), BLOCKROLLS_DEPLOIEMENT: { adresse: null },
  };
  const noms = Object.keys(deps);
  const sortie = ['balayerTicketsEnAttente', 'crediterVolumeJour', 'retenterTicket'].map((f) => f + ': typeof ' + f + " === 'function' ? " + f + ' : null').join(', ');
  const corps = 'let revenuSale = false;\n' + horo + '\n' + coeur + '\n' + niv + '\nreturn { ' + sortie + ', route: async function route(chemin, req, res) {\n' + src.slice(r0, r1) + '\n' + parts + '\n} };';
  const f = new Function(...noms, corps)(...noms.map((k) => deps[k]));
  return { ...f, invalides, rpcLog, payesEnCours, compte, cache };
}
function appeler(route, method, url, corps) {
  return new Promise((fin) => {
    const ecoute = {};
    const req = { method, url, on: (ev, f) => { ecoute[ev] = f; }, destroy() {} };
    const res = { code: 0, writeHead(c) { this.code = c; }, end(b) { let j = null; try { j = JSON.parse(b); } catch (_) { j = null; } fin({ code: this.code, corps: j }); } };
    void route(new URL(url, 'http://x').pathname, req, res);
    if (method === 'POST' && ecoute.data) { ecoute.data(JSON.stringify(corps)); ecoute.end(); }
  });
}
const etatVide = () => ({ vus: {}, parJour: {}, tentatives: {}, externe: {}, interne: {}, registre: {}, passes: {}, xpEtat: { xp: {}, vus: {} }, depuis: '2026-10-16T00:00:00.000Z' });
const chaineVide = () => ({ recus: {}, blocs: {}, frais: {}, vol: {}, skin: {}, prix: null });
const usdDe = (etat, jid, w = PAYEUR) => (((etat.jours || {})[jid] || {})[w] || {}).usd || 0;

/* le vrai bjSignerParts, contre une reponse par wallet ('reseau' = fetch leve) */
function monterSigner(app, rep, fetchReel = null) {
  const a = app.indexOf('async function bjSignerParts('), b = app.indexOf('const BJ_TITRES');
  if (a < 0 || b < a) throw new Error('decoupe bjSignerParts introuvable');
  const etapes = [], depots = []; let sigs = 0;
  const window = { ethereum: { request: async ({ params }) => { sigs += 1; return rep.signer ? rep.signer(JSON.parse(params[1])) : '0xsig'; } } };
  const fetch = fetchReel || (async (url, o) => {
    const x = JSON.parse(o.body); depots.push(x.wallet);
    const r = rep(x.wallet);
    if (r === 'reseau') throw new TypeError('Failed to fetch');
    return { status: r.status, json: async () => { if (r.html) throw new SyntaxError('Unexpected token <'); return r.corps; } };
  });
  const f = new Function('bcEtape', 'courtAdr', 'usdcTexte', 'window', 'fetch', app.slice(a, b) + '\nreturn bjSignerParts;')((m, t, c) => etapes.push([t, c]), (w) => w.slice(0, 6), (x) => String(Number(x) / 1e6), window, fetch);
  return { f, etapes, depots, sigs: () => sigs };
}
const partsABC = () => ({ sign: { jourId: 'J2026-10-24', week: false, shares: [A, B, C].map((w) => ({ wallet: w, amount: '1000000', donnees: { message: { wallet: w } } })) } });
const OKR = { status: 200, corps: { ok: true } };

/* ================================================================ D1 : refus passager / 409 / credit tardif */
async function scenariosD1(S) {
  const R = {}, essai = essaiDe(R);
  const etatBrain = (seen, t2) => ({ authorized: true, wallet: VERIF, now: Math.floor(T_JEUDI / 1000) + 61, budgetUsdc: '0', spentUsdc: '0', balanceUsdc: '0',
    rules: { rolls: false, settle: false, pot: true, potDailyUsdc: '0' }, history: [], seen, rolls: null, missions: null, skins: null,
    pot: { contract: CT, usdc: '0x' + '8'.repeat(40), owner: OWN, veille: { jourId: MER, day: dayDeJourIdPot(MER), ferme: true, reste: POT.toString(), verifier: VERIF, owner: OWN }, sharesDay: t2, sharesWeek: null, jours: [], today: { day: dayDeJourIdPot(MER) + 1, dayPot: '0' } } });
  const signerContre = (m, t1, codes) => {
    const digestDe = Object.fromEntries(t1.parts.map((p) => [p.wallet, p.digest]));
    const fetchApp = async (url, o) => { const r = await appeler(m.route, 'POST', url, JSON.parse(o.body)); codes.push(r.code); return { status: r.code, json: async () => r.corps }; };
    const rep = () => null; rep.signer = (d) => signerDigest(CLE, digestDe[d.message.wallet]);
    return monterSigner(S.APP, rep, fetchApp);
  };
  const ligneRefus = (S.APP.match(/\n\s*const refusVus = [^\n]+/) || [''])[0].trim();
  const vusDe = (s, p) => (ligneRefus ? new Function('s', 'p', ligneRefus + '\nreturn refusVus;')(s, p) : null);
  await essai('D1a-perime-412-arret-rien-note-tout-repropose', async () => {
    const e = { ...etatVide(), jours: { [MER]: { [A]: { usd: 20, hashes: [H(1)] }, [B]: { usd: 20, hashes: [H(2)] } } } };
    const h = { t: T_JEUDI }, m = monterSrv(S.SRV, e, h, chaineVide());
    const t1 = (await appeler(m.route, 'GET', '/api/ticketpot/parts?day=' + MER)).corps;
    e.jours[MER][C] = { usd: 20, hashes: [H(3)] }; /* credite sans passer par le credit : seul le 412 peut le voir */
    const codes = [], sg = signerContre(m, t1, codes);
    const p = { sign: { jourId: MER, week: false, shares: t1.parts.map((x) => ({ wallet: x.wallet, amount: x.amount, donnees: { message: { wallet: x.wallet } } })) } };
    const s = await sg.f({}, p, VERIF);
    const vus = vusDe(s, p);
    const t2 = (await appeler(m.route, 'GET', '/api/ticketpot/parts?day=' + MER)).corps;
    const prop = J.prochaineProposition(etatBrain(vus || [], t2));
    const proposes = prop && prop.sign ? prop.sign.shares.map((x) => x.wallet) : [];
    R['D1a:detail'] = 'codes ' + codes.join(',') + ' sigs ' + sg.sigs() + ' vus ' + JSON.stringify(vus) + ' | GET2 ' + t2.parts.map((x) => x.wallet.slice(0, 4) + '=' + x.amount).join(' ') + ' | brain ' + proposes.map((w) => w.slice(0, 4)).join(',');
    return codes.join() === '412' && sg.sigs() === 1 && Array.isArray(vus) && vus.length === 0 && s.ok === false && s.refusees[0].refuse === false
      && t2.parts.length === 3 && t2.parts.every((x) => x.amount === '30000000') && proposes.length === 3 && [A, B, C].every((w) => proposes.includes(w));
  });
  await essai('D1b-409-seul-definitif-et-continue', async () => {
    const e = { ...etatVide(), jours: { [MER]: { [A]: { usd: 20, hashes: [H(1)] }, [B]: { usd: 20, hashes: [H(2)] } } } };
    e.ticketpotSig = { [MER]: { [A]: { digest: '0x' + 'de'.repeat(32), signature: '0x' + '11'.repeat(65), amount: '1', deadline: 0, ticket: 0, recue: '2026-10-22T09:00:00.000Z' } } };
    const h = { t: T_JEUDI }, m = monterSrv(S.SRV, e, h, chaineVide());
    const t1 = (await appeler(m.route, 'GET', '/api/ticketpot/parts?day=' + MER)).corps;
    const codes = [], sg = signerContre(m, t1, codes);
    const p = { sign: { jourId: MER, week: false, shares: t1.parts.map((x) => ({ wallet: x.wallet, amount: x.amount, donnees: { message: { wallet: x.wallet } } })) } };
    const s = await sg.f({}, p, VERIF);
    const vus = vusDe(s, p);
    R['D1b:detail'] = 'codes ' + codes.join(',') + ' vus ' + JSON.stringify(vus);
    return codes.join() === '409,200' && sg.sigs() === 2 && JSON.stringify(vus) === JSON.stringify(['POT_SIGN_REFUS:' + MER + ':' + A]);
  });
  await essai('D1c-credit-tardif-invalide-le-GET', async () => {
    const e = { ...etatVide(), jours: { [MER]: { [A]: { usd: 20, hashes: [H(1)] }, [B]: { usd: 20, hashes: [H(2)] } } } };
    const ch = chaineVide(), hc = H(0xc), h = { t: T_JEUDI };
    ch.recus[hc] = { blockNumber: '0x1f4', status: '0x1' }; ch.blocs[500] = sec(Date.UTC(2026, 9, 21, 23, 0));
    ch.frais[hc] = { ok: true }; ch.vol[hc] = { ok: true, payeur: C, unitWei: '0', actions: [{ jeton: JA, montant: (20n * 10n ** 6n).toString() }] };
    const m = monterSrv(S.SRV, e, h, ch);
    const t1 = (await appeler(m.route, 'GET', '/api/ticketpot/parts?day=' + MER)).corps;
    const rp = await new Promise((fin) => { const res = { writeHead(c) { this.code = c; }, end(b) { fin({ code: this.code, corps: JSON.parse(b) }); } }; void m.route('/api/paye', { method: 'POST', url: '/api/paye?h=' + hc + '&l=swap_action' }, res); });
    const t2 = (await appeler(m.route, 'GET', '/api/ticketpot/parts?day=' + MER)).corps;
    R['D1c:detail'] = 'GET1 ' + t1.parts.length + ' | paye ' + rp.code + ' ' + JSON.stringify(rp.corps.ticket || null) + ' | GET2 ' + t2.parts.length + ' | invalides ' + JSON.stringify(m.invalides);
    return t1.parts.length === 2 && rp.code === 200 && (rp.corps.ticket || {}).jourId === MER && t2.parts.length === 3 && m.invalides.includes(MER) && m.invalides.includes(semaineDe(MER));
  });
  return R;
}

/* ================================================================ D4 : la signature s arrete quand il faut, la fin dit vrai */
function monterAttester(html, rep) {
  const s = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  if (!s) throw new Error('script attester introuvable');
  const el = {};
  const mk = () => ({ value: '', checked: false, hidden: false, disabled: false, textContent: '', className: '', h: {}, enfants: [], addEventListener(t, f) { this.h[t] = f; }, append(x) { this.enfants.push(x); } });
  const document = { querySelector: (q) => (el[q] = el[q] || mk()), createElement: () => mk() };
  const signes = new Set(), depots = []; let sigs = 0;
  const window = { ethereum: { request: async ({ method }) => { if (method === 'eth_requestAccounts') return [VERIF]; if (method === 'eth_signTypedData_v4') { sigs += 1; return '0xsig'; } throw new Error(method); } } };
  const fetch = async (url, o) => {
    if (String(url).startsWith('/api/ticketpot/signature')) {
      const b = JSON.parse(o.body); depots.push(b.wallet);
      const r = rep(b.wallet);
      if (r === 'reseau') throw new TypeError('Failed to fetch');
      if (r.corps && r.corps.ok) signes.add(b.wallet);
      return { status: r.status, json: async () => r.corps };
    }
    return { status: 200, json: async () => ({ ok: true, ferme: true, jourId: 'J2026-10-24', potAtClose: '3000000', verifier: VERIF, dernierJourSemaine: false,
      parts: [A, B, C].map((w) => ({ wallet: w, jourId: 'J2026-10-24', amount: '1000000', signature: signes.has(w) ? '0xs' : null, donnees: { message: { wallet: w } } })) }) };
  };
  new Function('document', 'window', 'fetch', 'location', 'URLSearchParams', s[1])(document, window, fetch, { search: '' }, URLSearchParams);
  return { el, depots, sigs: () => sigs, clic: async (q) => { el[q].h.click(); await ticks(60); } };
}
function monterFinPotSign(app) {
  const a = app.indexOf('const s = await bjSignerParts(m, p, walletCarte);'), fin = a < 0 ? -1 : app.slice(a).search(/\r?\n {6}return;\r?\n {4}\}\r?\n {4}let r;/), b = fin < 0 ? -1 : a + fin;
  if (a < 0 || b < a) throw new Error('decoupe fin POT_SIGN introuvable');
  return new Function('bjSignerParts', 'm', 'p', 'walletCarte', 'bj', 'bjSauver', 'fini', 'return (async () => {\n' + app.slice(a, b) + '\n})();');
}
async function scenariosD4(S) {
  const R = {}, essai = essaiDe(R);
  const derniere = (sg) => String((sg.etapes[sg.etapes.length - 1] || [])[0] || '');
  await essai('D4-signer-400-continue-non-note', async () => {
    const sg = monterSigner(S.APP, (w) => (w === B ? { status: 400, corps: { ok: false, etat: 'REFUSE', pourquoi: 'shares already stored would exceed its pot' } } : OKR));
    const r = await sg.f({}, partsABC(), VERIF);
    R['D4a:detail'] = JSON.stringify(r);
    return sg.sigs() === 3 && sg.depots.length === 3 && r.faites === 2 && r.refusees.length === 1 && r.refusees[0].wallet === B && r.refusees[0].refuse === false;
  });
  for (const [nom, rep, motif] of [
    ['D4-signer-reseau-arrete', 'reseau', /Stopped: the server did not answer/],
    ['D4-signer-5xx-arrete', { status: 502, html: true }, /Stopped: the server did not answer/],
    ['D4-signer-202-arrete', { status: 202, corps: { ok: false, etat: 'NON_LU', pourquoi: 'the ticket pot could not be read just now' } }, /Stopped: the server did not answer/],
    ['D4-signer-412-arrete', { status: 412, corps: { ok: false, etat: 'PERIME', pourquoi: 'the shares changed' } }, /Stopped: the shares changed since they were read/],
  ]) {
    await essai(nom, async () => {
      const sg = monterSigner(S.APP, (w) => (w === B ? rep : OKR));
      const r = await sg.f({}, partsABC(), VERIF);
      R[nom + ':detail'] = sg.sigs() + ' sigs | ' + derniere(sg);
      return sg.sigs() === 2 && sg.depots.join() === [A, B].join() && r.ok === false && r.faites === 1 && r.refusees.length === 1 && r.refusees[0].refuse === false && motif.test(derniere(sg));
    });
  }
  await essai('D4-attester-reseau-arrete', async () => {
    const m = monterAttester(S.ATT, (w) => (w === B ? 'reseau' : OKR)); await ticks(60);
    await m.clic('#connecter'); await m.clic('#signer');
    const t = m.el['#etat'].textContent;
    R['D4-attester-reseau-arrete:detail'] = m.sigs() + ' sigs | ' + t;
    return m.sigs() === 2 && m.depots.join() === [A, B].join() && /^1 share\(s\) signed and stored/.test(t) && /Stopped: the server did not answer/.test(t) && !/refused by the server/.test(t);
  });
  await essai('D4-attester-409-continue', async () => {
    const m = monterAttester(S.ATT, (w) => (w === B ? { status: 409, corps: { ok: false, etat: 'REFUSE', pourquoi: 'a different share is already signed and served' } } : OKR)); await ticks(60);
    await m.clic('#connecter'); await m.clic('#signer');
    const t = m.el['#etat'].textContent;
    return m.sigs() === 3 && m.depots.join() === [A, B, C].join() && /^2 share\(s\) signed and stored/.test(t) && /1 refused by the server/.test(t);
  });
  const fin = async (s) => { const bj = { seen: [] }; let txt = null; await monterFinPotSign(S.APP)(async () => s, {}, { cle: 'POT_SIGN:J2026-10-24', sign: { jourId: 'J2026-10-24', week: false } }, VERIF, bj, () => {}, (x) => { txt = x; }); return { txt, bj }; };
  await essai('D4-fin-dit-muet-pas-refuse', async () => {
    const { txt, bj } = await fin({ ok: false, faites: 1, refusees: [{ wallet: B, refuse: false, issue: 'SANS_REPONSE', pourquoi: 'no answer' }], arret: 'SANS_REPONSE' });
    R['D4-fin-dit-muet-pas-refuse:detail'] = txt;
    return /^On — 1 share\(s\) stored, stopped: no answer from the server \(proposed again\)\.$/.test(txt) && !/refused/.test(txt) && bj.seen.length === 0;
  });
  await essai('D4-fin-409-dit-refuse', async () => {
    const { txt, bj } = await fin({ ok: false, faites: 2, refusees: [{ wallet: B, refuse: true, issue: 'GARDEE', pourquoi: 'already' }] });
    R['D4-fin-409-dit-refuse:detail'] = txt;
    return /^On — 2 share\(s\) stored, 1 refused by the server \(1 not proposed again\)\.$/.test(txt) && bj.seen.join() === 'POT_SIGN_REFUS:J2026-10-24:' + B;
  });
  return R;
}

/* ================================================================ D2 : une jambe sans prix */
async function scenariosD2(S) {
  const R = {}, essai = essaiDe(R);
  const BLOC = Date.UTC(2026, 9, 24, 10), JB = 'J2026-10-24';
  const unEnvoi = async ({ actions, unitWei = '0', prix = null, avant = null }) => {
    const e = etatVide(), ch = chaineVide(), hh = H(0x77), h = { t: Date.UTC(2026, 9, 24, 11) };
    if (avant) e.jours = { [JB]: { [PAYEUR]: { usd: avant, hashes: [H(0x76)] } } };
    ch.recus[hh] = { blockNumber: '0x1f4', status: '0x1' }; ch.blocs[500] = sec(BLOC); ch.frais[hh] = { ok: true };
    ch.vol[hh] = { ok: true, payeur: PAYEUR, unitWei, actions: actions.map(([jeton, usd]) => ({ jeton, montant: String(BigInt(Math.round(usd * 1e6))) })) };
    if (prix) ch.prix = prix;
    const m = monterSrv(S.SRV, e, h, ch);
    const r = await new Promise((fin) => { const res = { writeHead(c) { this.code = c; }, end(b) { fin({ code: this.code, corps: JSON.parse(b) }); } }; void m.route('/api/paye', { method: 'POST', url: '/api/paye?h=' + hh + '&l=swap_action' }, res); });
    return { r, tk: r.corps.ticket || {}, usd: usdDe(e, JB), attente: !!(e.ticketsEnAttente || {})[hh] };
  };
  await essai('D2-jambe-price-suffit-credite', async () => {
    const x = await unEnvoi({ actions: [[JA, 20], [JX, 5]] });
    R['D2a:detail'] = x.r.code + ' ' + JSON.stringify(x.tk) + ' usd=' + x.usd;
    return x.r.code === 200 && x.tk.etat === 'CREDITE' && x.usd === 20 && !x.attente;
  });
  await essai('D2-jambe-sous-seuil-non-lu-dit', async () => {
    const x = await unEnvoi({ actions: [[JA, 4], [JX, 5]] });
    R['D2b:detail'] = x.r.code + ' ' + JSON.stringify(x.tk);
    return x.r.code === 202 && x.tk.etat === 'NON_LU' && /\$4\.00/.test(x.tk.pourquoi) && /below the \$10 of a day ticket/.test(x.tk.pourquoi) && x.usd === 0 && x.attente;
  });
  await essai('D2-jambe-avec-trades-du-jour', async () => {
    const x = await unEnvoi({ actions: [[JA, 4], [JX, 5]], avant: 8 });
    R['D2c:detail'] = x.r.code + ' ' + JSON.stringify(x.tk) + ' usd=' + x.usd;
    return x.r.code === 200 && x.tk.etat === 'CREDITE' && x.usd === 12;
  });
  await essai('D2-eth-sans-prix-action-suffit', async () => {
    const x = await unEnvoi({ actions: [[JA, 20]], unitWei: (10n ** 16n).toString(), prix: (adr) => (adr === null ? null : 1) });
    R['D2d:detail'] = x.r.code + ' ' + JSON.stringify(x.tk) + ' usd=' + x.usd;
    return x.r.code === 200 && x.tk.etat === 'CREDITE' && x.usd === 20;
  });
  return R;
}

/* ================================================================ D3 + L : les renvois et la note */
function monterPaye(app, reponses) {
  const s0 = app.indexOf('let ticketPayeNote = null;'), s1 = app.indexOf('function allerA(');
  if (s0 < 0 || s1 < s0) throw new Error('decoupe signalerPaye introuvable');
  const el = { '#jourTicketTxt': { textContent: 'Your ticket — this face is yours.' } };
  const $ = (q) => el[q] || null;
  const minuteurs = [], appels = [];
  const fetch = async (url) => { appels.push(url); const r = reponses.shift() || { status: 200, corps: { ok: true, deja: true } }; if (r === 'reseau') throw new TypeError('Failed to fetch'); return { status: r.status, json: async () => r.corps }; };
  const document = { createElement: () => ({ className: '', textContent: '', dataset: {}, retire: false, remove() { this.retire = true; } }) };
  const deps = { $, fetch, setTimeout: (f, ms) => { minuteurs.push({ f, ms }); return 0; }, vitrineActive: () => null, INTERNE: false, document };
  const noms = Object.keys(deps);
  const api = new Function(...noms, app.slice(s0, s1) + '\nreturn { signalerPaye, lieu: typeof lieuTicketPaye === "function" ? lieuTicketPaye : null, note: noteTicketPaye };')(...noms.map((k) => deps[k]));
  const jouer = async () => { await ticks(); while (minuteurs.length && minuteurs.length < 20) { const m = minuteurs[minuteurs.length - 1]; if (m.joue) break; m.joue = true; m.f(); await ticks(); } };
  return { api, el, minuteurs, appels, jouer };
}
/* 4e tour (D4) : un lieu cache (offsetParent null) ne recoit plus la note ; querySelectorAll pour retrouver la note de CE hash */
const elem = (connecte = true, visible = true) => ({ isConnected: connecte, offsetParent: visible ? {} : null, enfants: [],
  querySelector(q) { return this.enfants.find((x) => x.className === q.slice(1) && !x.retire) || null; },
  querySelectorAll(q) { return this.enfants.filter((x) => x.className === q.slice(1) && !x.retire); }, append(x) { this.enfants.push(x); } });
const NL = (deja = false) => ({ status: 202, corps: { ok: true, ...(deja ? { deja: true } : { externe: true }), ticket: { ok: false, etat: 'NON_LU', pourquoi: 'the time of block 500 was not read: send it again in a moment' } } });
const BUSY = { status: 429, corps: { ok: false, pourquoi: 'busy, send it again in a moment' } };
const H1 = '0x' + '5'.repeat(64), H2 = '0x' + '6'.repeat(64);
async function scenariosD3(S) {
  const R = {}, essai = essaiDe(R);
  const derniereNote = (m) => m.el['#jourTicketTxt'].textContent;
  for (const k of [3, 4]) {
    await essai('D3-429-au-' + (k + 1) + 'e-envoi-continue', async () => {
      const m = monterPaye(S.APP, [...Array.from({ length: k }, (_, i) => NL(i > 0)), BUSY, ...Array.from({ length: 6 }, () => NL(true))]);
      m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
      R['D3-' + (k + 1) + ':detail'] = m.appels.length + ' envois ' + m.minuteurs.map((x) => x.ms).join(',') + ' | ' + derniereNote(m);
      return m.appels.length === 6 && m.minuteurs.map((x) => x.ms).join() === '8000,16000,24000,32000,40000' && /Last trade: not counted for a day ticket yet \(the server tries again for up to 48 h\)/.test(derniereNote(m));
    });
  }
  await essai('D3-que-des-429-apres-non-lu-note', async () => {
    const m = monterPaye(S.APP, [NL(), ...Array.from({ length: 6 }, () => BUSY)]);
    m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
    R['D3-busy:detail'] = m.appels.length + ' envois | ' + derniereNote(m);
    return m.appels.length === 6 && /Last trade: not counted for a day ticket yet \(the server tries again for up to 48 h\) — the server was busy at the last re-send from this page\.$/.test(derniereNote(m));
  });
  await essai('D3-429-avant-non-lu-comme-avant', async () => {
    const m = monterPaye(S.APP, Array.from({ length: 6 }, () => BUSY));
    m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
    return m.appels.length === 4 && m.minuteurs.map((x) => x.ms).join() === '8000,8000,8000' && derniereNote(m) === 'Your ticket — this face is yours.';
  });
  await essai('D3-reseau-dans-la-chaine', async () => {
    const m = monterPaye(S.APP, [NL(), 'reseau', { status: 200, corps: { ok: true, deja: true, ticket: { ok: true, etat: 'CREDITE', jourId: 'J2026-10-24' } } }]);
    m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
    return m.appels.length === 3 && derniereNote(m) === 'Your ticket — this face is yours.';
  });
  /* L : ou va la note */
  const TV = { status: 200, corps: { ok: true, externe: true, ticket: { ok: false, etat: 'TROP_VIEUX', pourquoi: 'this transaction is more than 48 h old: it no longer earns a day ticket' } } };
  await essai('L1-note-au-resultat-du-trade', async () => {
    const m = monterPaye(S.APP, [TV]); const e = elem();
    m.api.lieu(H1, e); m.api.signalerPaye(H1, 'hook_block'); await m.jouer();
    const s = e.querySelector('.ticketPayeNote');
    R['L1:detail'] = s ? s.textContent : 'aucune note au trade';
    return !!s && /^ Day ticket of this trade: no day ticket — this transaction is more than 48 h old/.test(s.textContent) && derniereNote(m) === 'Your ticket — this face is yours.' && m.api.note() === '';
  });
  await essai('L2-resultat-detache-sous-le-ticket', async () => {
    const m = monterPaye(S.APP, [TV]); const e = elem(false);
    m.api.lieu(H1, e); m.api.signalerPaye(H1, 'hook_block'); await m.jouer();
    return e.enfants.length === 0 && /Last trade: no day ticket — this transaction is more than 48 h old/.test(derniereNote(m));
  });
  await essai('L3-fil-du-panneau', async () => {
    const m = monterPaye(S.APP, [TV]); const vu = [];
    m.api.lieu(H1, (t) => vu.push(t)); m.api.signalerPaye(H1, 'swap_action'); await m.jouer();
    return vu.length === 1 && /^Day ticket of this trade: no day ticket/.test(vu[0]) && derniereNote(m) === 'Your ticket — this face is yours.';
  });
  /* 4e tour (D4, revue adverse scenario 2) : le credit d un AUTRE trade (H2) n efface plus la note de H1 ; le credit de H1 lui-meme, si */
  const CR = { status: 200, corps: { ok: true, externe: true, ticket: { ok: true, etat: 'CREDITE', jourId: 'J2026-10-24' } } };
  await essai('L4-credite-autre-hash-garde-la-note', async () => {
    const m = monterPaye(S.APP, [TV, CR]); const e = elem();
    m.api.lieu(H1, e); m.api.lieu(H2, e);
    m.api.signalerPaye(H1, 'hook_block'); await m.jouer();
    const avant = !!e.querySelector('.ticketPayeNote');
    m.api.signalerPaye(H2, 'hook_block'); await m.jouer();
    return avant && e.querySelectorAll('.ticketPayeNote').length === 1 && e.querySelector('.ticketPayeNote').dataset.hash === H1;
  });
  await essai('L4b-credite-meme-hash-efface', async () => {
    const m = monterPaye(S.APP, [TV, CR]); const e = elem();
    m.api.lieu(H1, e);
    m.api.signalerPaye(H1, 'hook_block'); await m.jouer();
    const avant = !!e.querySelector('.ticketPayeNote');
    m.api.signalerPaye(H1, 'hook_block'); await m.jouer();
    return avant && !e.querySelector('.ticketPayeNote');
  });
  await essai('L6-lieu-cache-sous-le-ticket', async () => {
    const m = monterPaye(S.APP, [TV]); const e = elem(true, false);
    m.api.lieu(H1, e); m.api.signalerPaye(H1, 'hook_block'); await m.jouer();
    return e.enfants.length === 0 && /Last trade: no day ticket — this transaction is more than 48 h old/.test(derniereNote(m));
  });
  await essai('L5-cablage-des-appelants', async () => {
    const L = S.APP.split('\n');
    const trades = L.map((l, i) => (/signalerPaye\([^,]+, ('hook_block'|'swap_action'|ligne)\)/.test(l) && !/function signalerPaye/.test(l) ? i : -1)).filter((i) => i >= 0);
    const sans = trades.filter((i) => !L.slice(i, i + 2).join('\n').includes('lieuTicketPaye('));
    R['L5:detail'] = trades.length + ' appels de trade, sans lieu : ' + sans.map((i) => i + 1).join(',');
    return trades.length === 6 && sans.length === 0;
  });
  return R;
}

/* ================================================================ W : le balayage serveur */
async function scenariosW(S) {
  const R = {}, essai = essaiDe(R);
  const BLOC = Date.UTC(2026, 9, 24, 10), JB = 'J2026-10-24', T0 = Date.UTC(2026, 9, 24, 11);
  const MIN = 60000;
  const base = (entrees, regler = () => {}) => {
    const e = etatVide(), ch = chaineVide(), h = { t: T0 };
    e.ticketsEnAttente = {};
    for (const [hh, x] of entrees) {
      e.ticketsEnAttente[hh] = x; e.vus[hh] = { jour: '2026-10-24', ligne: x.ligne, externe: true };
      ch.recus[hh] = { blockNumber: '0x1f4', status: '0x1' }; ch.frais[hh] = { ok: true };
      ch.vol[hh] = { ok: true, payeur: PAYEUR, unitWei: '0', actions: [{ jeton: JA, montant: (20n * 10n ** 6n).toString() }] };
    }
    regler(e, ch);
    const m = monterSrv(S.SRV, e, h, ch);
    if (!m.balayerTicketsEnAttente) throw new Error('aucun balayage serveur');
    const bal = async (t) => { h.t = t; return m.balayerTicketsEnAttente(t); };
    return { e, ch, h, m, bal };
  };
  await essai('W1-attente-puis-credit-par-le-serveur', async () => {
    const hh = H(0x91), w = base([[hh, { ligne: 'swap_action', at: T0 }]]);
    const r1 = await w.bal(T0 + MIN), n1 = w.m.rpcLog.length;
    const r2 = await w.bal(T0 + 4 * MIN), x = { ...w.e.ticketsEnAttente[hh] };
    const r3 = await w.bal(T0 + 6 * MIN);
    w.ch.blocs[500] = sec(BLOC);
    const r4 = await w.bal(T0 + 9 * MIN + 1000);
    R['W1:detail'] = [r1, r2, r3, r4].join(',') + ' | apres 2 : ' + JSON.stringify(x) + ' | usd ' + usdDe(w.e, JB) + ' | compterRevenu ' + w.m.compte.n + ' | invalides ' + JSON.stringify(w.m.invalides);
    return r1 === 0 && n1 === 0 && r2 === 1 && x.essais === 1 && x.prochain === T0 + 9 * MIN && r3 === 0 && r4 === 1 && !w.e.ticketsEnAttente[hh]
      && usdDe(w.e, JB) === 20 && w.m.compte.n === 0 && w.m.invalides.includes(JB) && w.m.invalides.includes(semaineDe(JB));
  });
  await essai('W2-49h-sort-sans-appel', async () => {
    const hh = H(0x92), w = base([[hh, { ligne: 'swap_action', at: T0 - 50 * 3600000 }]]);
    const r = await w.bal(T0);
    return r === 0 && !w.e.ticketsEnAttente[hh] && w.m.rpcLog.length === 0;
  });
  await essai('W3-borne-6-par-balayage', async () => {
    const w = base(Array.from({ length: 10 }, (_, i) => [H(0xa0 + i), { ligne: 'swap_action', at: T0 - 10 * MIN }]));
    const r1 = await w.bal(T0), tx1 = w.m.rpcLog.filter((x) => x === 'eth_getTransactionByHash').length;
    const r2 = await w.bal(T0 + 1000);
    R['W3:detail'] = r1 + ' puis ' + r2 + ' | tx lus ' + tx1;
    return r1 === 6 && tx1 === 6 && r2 === 4 && Object.keys(w.e.ticketsEnAttente).length === 10;
  });
  await essai('W4-hash-en-cours-saute', async () => {
    const hh = H(0x93), w = base([[hh, { ligne: 'swap_action', at: T0 - 10 * MIN }]], (e, ch) => { ch.blocs[500] = sec(BLOC); });
    w.m.payesEnCours.add(hh);
    const r = await w.bal(T0);
    return r === 0 && !!w.e.ticketsEnAttente[hh] && usdDe(w.e, JB) === 0;
  });
  await essai('W5-recu-null-garde-l-attente', async () => {
    const hh = H(0x94), w = base([[hh, { ligne: 'swap_action', at: T0 - 10 * MIN }]], (e, ch) => { ch.blocs[500] = sec(BLOC); delete ch.recus[hh]; });
    const r = await w.bal(T0);
    return r === 1 && !!w.e.ticketsEnAttente[hh] && w.e.ticketsEnAttente[hh].essais === 1;
  });
  await essai('W6-pass-skin-par-le-serveur', async () => {
    const hh = H(0x95), w = base([[hh, { ligne: 'skin_mint', at: T0 - 10 * MIN }]], (e, ch) => { ch.blocs[500] = sec(BLOC); ch.skin[hh] = true; });
    const r = await w.bal(T0);
    const jp = joursPass(BLOC);
    R['W6:detail'] = r + ' | pass ' + JSON.stringify((w.e.passes || {})[PAYEUR] || []) + ' | invalides ' + w.m.invalides.length;
    return r === 1 && !w.e.ticketsEnAttente[hh] && ((w.e.passes || {})[PAYEUR] || []).length === jp.length && jp.length > 0 && jp.every((d) => w.m.invalides.includes(d)) && w.m.compte.n === 0;
  });
  await essai('W7-trop-vieux-sort', async () => {
    const hh = H(0x96), w = base([[hh, { ligne: 'swap_action', at: T0 - 10 * MIN }]], (e, ch) => { ch.blocs[500] = sec(T0 - 49 * 3600000); });
    const r = await w.bal(T0);
    return r === 1 && !w.e.ticketsEnAttente[hh] && Object.values(w.e.jours || {}).every((j) => !j[PAYEUR]);
  });
  await essai('W8-sans-frais-verifie-attend-et-credite', async () => {
    const hh = H(0x97), w = base([], (e, ch) => {
      ch.recus[hh] = { blockNumber: '0x1f4', status: '0x1' };
      ch.vol[hh] = { ok: true, payeur: PAYEUR, unitWei: (10n ** 16n).toString(), actions: [] };
    });
    const r = await new Promise((fin) => { const res = { writeHead(c) { this.code = c; }, end(b) { fin({ code: this.code, corps: JSON.parse(b) }); } }; void w.m.route('/api/paye', { method: 'POST', url: '/api/paye?h=' + hh + '&l=hook_block' }, res); });
    const attente = !!w.e.ticketsEnAttente[hh];
    w.ch.blocs[500] = sec(BLOC);
    const b = await w.bal(T0 + 4 * MIN);
    R['W8:detail'] = r.code + ' ' + JSON.stringify(r.corps.ticket || null) + ' | attente ' + attente + ' | balaye ' + b + ' usd ' + usdDe(w.e, JB);
    return r.code === 202 && (r.corps.ticket || {}).etat === 'NON_LU' && attente && b === 1 && usdDe(w.e, JB) === 20 && !w.e.ticketsEnAttente[hh];
  });
  await essai('W9-cablage-intervalle', async () => {
    const i = S.SRV.indexOf('void balayerTicketsEnAttente()');
    const bloc = i > 0 ? S.SRV.slice(S.SRV.lastIndexOf('setInterval(() => {', i), S.SRV.indexOf('.unref();', i) + 9) : '';
    return /if \(balayageTicketsEnVol \|\| !Object\.keys\(revenu\.ticketsEnAttente \|\| \{\}\)\.length\) return;/.test(bloc) && /\}, 3 \* 60000\)\.unref\(\);$/.test(bloc)
      && /\nconst partsCacheTP = cacheTemporise\(/.test(S.SRV) && S.SRV.indexOf('function balayerTicketsEnAttente(') < S.SRV.indexOf('void balayerTicketsEnAttente()');
  });
  return R;
}

/* ================================================================ execution + mutants */
const SRC = { SRV: lire('serveur-web.js'), APP: lire('app.html'), ATT: lire('attester-ticketpot.html') };
const TOUS = async (S) => ({ ...(await scenariosD1(S)), ...(await scenariosD4(S)), ...(await scenariosD2(S)), ...(await scenariosD3(S)), ...(await scenariosW(S)) });
const RR = await TOUS(SRC);
for (const [k, v] of Object.entries(RR)) if (!k.includes(':')) ok(v === true, k + (RR[k + ':err'] ? ' (' + RR[k + ':err'] + ')' : ''));
for (const [k, v] of Object.entries(RR)) if (k.endsWith(':detail')) console.log('    ' + k.replace(':detail', '') + ' : ' + v);

let tues = 0, total = 0;
async function mutant(nom, cle, de, vers, rougit) {
  total += 1;
  if (SRC[cle].split(de).length !== 2) { ok(false, 'MUTANT ' + nom + ' : motif absent (ou pas unique)'); return; }
  const S = { ...SRC, [cle]: SRC[cle].replace(de, vers) };
  const Rm = await TOUS(S);
  const t = Rm[rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + nom + ' -> ' + rougit + ' ROUGIT');
}
await mutant('app : tout refus definitif', 'APP', "refuse: issue === 'GARDEE'", 'refuse: true', 'D4-signer-400-continue-non-note');
await mutant('app : 412 note definitif', 'APP', "refuse: issue === 'GARDEE'", 'refuse: true', 'D1a-perime-412-arret-rien-note-tout-repropose');
await mutant('app : la serie ne s arrete jamais', 'APP', "if (issue === 'PERIMEE' || issue === 'SANS_REPONSE') { arret = issue; break; }", '', 'D4-signer-reseau-arrete');
await mutant('app : 412 continue', 'APP', "if (issue === 'PERIMEE' || issue === 'SANS_REPONSE') { arret = issue; break; }", "if (issue === 'SANS_REPONSE') { arret = issue; break; }", 'D4-signer-412-arrete');
await mutant('app : fin compte un muet comme refus', 'APP', "const nRefus = (s.refusees || []).filter((x) => x.issue === 'GARDEE' || x.issue === 'REFUSEE').length", 'const nRefus = (s.refusees || []).length', 'D4-fin-dit-muet-pas-refuse');
await mutant('app : 429 coupe la chaine', 'APP', "chaine = nonLuVu || (!!tk && tk.etat === 'NON_LU')", "chaine = (!!tk && tk.etat === 'NON_LU')", 'D3-429-au-4e-envoi-continue');
await mutant('app : fin de chaine muette', 'APP', 'else if (chaine && encore) direTicketPaye(', 'else if (false) direTicketPaye(', 'D3-que-des-429-apres-non-lu-note');
await mutant('app : panne reseau coupe la chaine', 'APP', '.catch(() => {\n        if (!nonLuVu) return;', '.catch(() => {\n        return;', 'D3-reseau-dans-la-chaine');
await mutant('app : note jamais au trade', 'APP', "else if (lieuVisible && typeof ou.append === 'function') {", 'else if (false) {', 'L1-note-au-resultat-du-trade');
await mutant('app : lieu cache accepte', 'APP', "ou.isConnected !== false && ou.offsetParent !== null &&", 'ou.isConnected !== false &&', 'L6-lieu-cache-sous-le-ticket');
await mutant('app : note sans son hash', 'APP', "x.dataset && x.dataset.hash === h) || null", "true) || null", 'L4-credite-autre-hash-garde-la-note');
await mutant('app : achat USDC sans lieu', 'APP', 'lieuTicketPaye(lot.hash, note);', '', 'L5-cablage-des-appelants');
await mutant('attester : reseau continue', 'ATT', "(code ? 'answer ' + code : 'no answer'))); break;", "(code ? 'answer ' + code : 'no answer')));", 'D4-attester-reseau-arrete');
await mutant('serveur : pas de 412', 'SRV', "if (servie && String(servie.digest || '').toLowerCase() !== String(p.digest).toLowerCase() && verifierSignaturePart(", 'if (false && verifierSignaturePart(', 'D1a-perime-412-arret-rien-note-tout-repropose');
await mutant('serveur : credit n invalide pas les parts', 'SRV', '  invaliderPartsTPJours([bloc.jourId]);\n', '', 'D1c-credit-tardif-invalide-le-GET');
await mutant('serveur : pass n invalide pas ses jours', 'SRV', '  invaliderPartsTPJours(jp);\n', '', 'W6-pass-skin-par-le-serveur');
await mutant('serveur : jambe sans prix bloque tout', 'SRV', '  if (deja + usd >= SEUIL_VOLUME_JOUR_USD) return null;\n', '', 'D2-jambe-price-suffit-credite');
await mutant('serveur : trades du jour ignores', 'SRV', 'if (deja + usd >= SEUIL_VOLUME_JOUR_USD) return null;', 'if (usd >= SEUIL_VOLUME_JOUR_USD) return null;', 'D2-jambe-avec-trades-du-jour');
await mutant('serveur : ETH sans prix bloque tout', 'SRV', "else manques.push('ETH'); }", "else return { ok: false, etat: 'NON_LU', pourquoi: 'eth' }; }", 'D2-eth-sans-prix-action-suffit');
await mutant('serveur : balayage sans delai', 'SRV', 'if (essayes >= BALAYAGE_TICKETS_MAX || quand > maintenant ||', 'if (essayes >= BALAYAGE_TICKETS_MAX ||', 'W1-attente-puis-credit-par-le-serveur');
await mutant('serveur : balayage sans borne', 'SRV', 'if (essayes >= BALAYAGE_TICKETS_MAX || ', 'if (', 'W3-borne-6-par-balayage');
await mutant('serveur : 49 h jamais purgees', 'SRV', '    if (!x || !(maintenant - Number(x.at) <= TICKET_ATTENTE_MS)) { delete t[h]; revenuSale = true; continue; }\n', '', 'W2-49h-sort-sans-appel');
await mutant('serveur : hash en cours retente', 'SRV', ' || payesEnCours.has(h) || payesEnCours.size >= 3) continue;', ') continue;', 'W4-hash-en-cours-saute');
await mutant('serveur : recu null efface l attente', 'SRV', "if (!tx || !recu) return { ok: false, etat: 'NON_LU'", "if (false) return { ok: false, etat: 'NON_LU'", 'W5-recu-null-garde-l-attente');
await mutant('serveur : sans frais jamais en attente', 'SRV', "if (!v.ok && ticketTP && ticketTP.etat === 'NON_LU') garderTicketEnAttente(h, ligne);", '', 'W8-sans-frais-verifie-attend-et-credite');
console.log('mutants tues ' + tues + '/' + total);
console.log(n + ' assertions, ' + ko + ' KO - NE PROUVE PAS un vrai navigateur, un vrai wallet, une lecture reelle de Base, ni que le serveur deploye tourne le balayage');
if (ko) process.exitCode = 1;
