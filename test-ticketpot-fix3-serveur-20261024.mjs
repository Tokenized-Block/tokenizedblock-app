/* test-ticketpot-fix3-serveur-20261024.mjs - UN TICKET DU JOUR NON LU N EST JAMAIS PERDU EN SILENCE : 202 (L APP RENVOIE), PRIX NUL = NON LU,
 *   PASS SKIN CREDITE AU RENVOI.
 * Revue adverse du correctif ticketpot, 2e tour (reviews-fix2.md, section ticketpot) :
 *   defaut 2 : le 1er envoi d un frais verifie dont le jour du bloc n est pas lu repondait 200 + ticket NON_LU ; l app (signalerPaye) ne
 *     renvoie que sur 202 / 429 -> le renvoi n arrivait jamais, le ticket etait perdu apres 49 h ;
 *   defaut 3 : prixUsdPourPlan rend null (jamais une exception) ; `|| 0` en faisait 0 $ : le hash etait marque vu, rien n etait credite,
 *     aucun message ; un prix d action non lu (valeurUsd : la devise vaut 0) faisait pareil ;
 *   defaut 5 : un skin_mint dont le frais passe verifierFrais (swap + mint dans une tx) avec un bloc non lu attendait dans ticketsEnAttente ;
 *     le renvoi appelait crediterVolumeJour (qui ne fait rien pour skin_mint) : l entree etait effacee, le pass (JOURS_PASS_SKIN jours) jamais credite.
 * EXECUTE la vraie route POST /api/paye + crediterVolumeJour + jourDuRecu + valeurFraisUsd + horodatageBloc de serveur-web.js (decoupes,
 *   montes par new Function) avec les vrais crediter / jourDe / joursPass / saisonDe / valeurUsd ; simules : la chaine (tx, recu, bloc
 *   lisible ou non, decimales), verifierFrais, volumeVerifie, passSkinVerifie, le prix (null a la demande), compterRevenu (compte), l horloge.
 * AFFIRME :
 *  D1 frais verifie, bloc ILLISIBLE au 1er envoi -> 202 (pas 200) + ticket NON_LU ; le renvoi -> 200 CREDITE 20 $ ; le 3e -> deja ;
 *  D2 frais NON verifie (swap UNIT, frais pris dans le swap), bloc illisible -> 202 + ticket NON_LU ; le renvoi credite ;
 *  P1 prix ETH null une fois -> 202, ticket NON_LU qui dit « price », rien de credite, le hash en attente (pas vu en silence) ; le renvoi
 *     credite 20 $, le frais compte UNE fois ;
 *  P2 prix d une action null une fois -> idem (valeurFraisUsd reelle, decimales lues) ;
 *  P3 temoin : prix lu -> 200 CREDITE tout de suite ;
 *  K1 skin_mint + frais verifie, bloc illisible -> 202 ; le renvoi -> pass CREDITE (passes, passVus), frais compte une fois, attente videe ;
 *  K2 skin_mint sans frais de swap (v pas ok), bloc illisible -> 202 ; le renvoi credite le pass.
 *  MUTANTS (copies en memoire de la source) : chaque garde retiree -> son scenario ROUGIT.
 * NE PROUVE PAS : un recu reel de Base, un vrai prix illisible sur la chaine, ni qu un utilisateur reste sur la page pendant les renvois
 *   (l app renvoie 5 fois au plus, ~2 min ; ensuite le hash attend : 3e tour, le serveur le reessaie, prouve par test-ticketpot-fix4-20261024). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crediter, jourDe, joursPass, saisonDe, valeurUsd, JOURS_PASS_SKIN } from './tirage-saison.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRV = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const PAYEUR = '0x' + 'd4'.repeat(20), JETON = '0x' + 'e5'.repeat(20);
const H = (k) => '0x' + k.toString(16).padStart(64, '0');

function monter(src, etat, horloge, chaine, compte, cfg) {
  const r0 = src.indexOf("if (chemin === '/api/paye' && req.method === 'POST') {"), r1 = src.lastIndexOf('/*', src.indexOf('REGISTRE DES CREATEURS (2026-10-17'));
  const c0 = src.indexOf('const AGE_MAX_TICKET_MS'), c1 = src.indexOf('const SEL_CREATEURS');
  const h0 = src.indexOf('async function horodatageBloc(n) {'), h1 = src.indexOf('let rollsScanEnVol');
  if (r0 < 0 || r1 < r0 || c0 < 0 || c1 < c0 || h0 < 0 || h1 < h0) throw new Error('decoupe introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(horloge.t); } static now() { return horloge.t; } }
  const rpc = async (meth, p) => {
    if (meth === 'eth_getTransactionByHash') return { hash: p[0], from: PAYEUR };
    if (meth === 'eth_getTransactionReceipt') return chaine.recus[p[0]] || null;
    if (meth === 'eth_getBlockByNumber') { const ts = chaine.blocs[parseInt(p[0], 16)]; return ts === undefined ? null : { timestamp: '0x' + ts.toString(16) }; }
    if (meth === 'eth_call' && p[0].data === '0x313ce567') return '0x' + '6'.padStart(64, '0');
    throw new Error('rpc ' + meth);
  };
  const deps = {
    revenu: etat, Date: D, LIGNES_FRAIS: ['hook_block', 'swap_action', 'skin_mint'], payesEnCours: new Set(), rpcActivite: rpc, rpcServeur: rpc,
    walletsInternes: () => new Set(), COMPTE_SONDE: '0x00000000000000000000000000000000c0ffee77', process: { env: {} },
    verifierFrais: () => (cfg.fraisOk ? { ok: true, externe: true, payeur: PAYEUR, recus: [] } : { ok: false, etat: 'SANS_FRAIS', pourquoi: 'no fee of ours in this transaction' }),
    devisesComptees: () => [], POOLS_ACTIONS_AERODROME: new Map(),
    volumeVerifie: () => (cfg.actions ? { ok: true, payeur: PAYEUR, unitWei: '0', actions: [{ jeton: JETON, montant: (20n * 10n ** 6n).toString() }] }
      : { ok: true, payeur: PAYEUR, unitWei: (10n ** 16n).toString(), actions: [] }),
    V4_ADRESSES: { 8453: { poolm: '0x' + '0'.repeat(40) } }, POOLS_UNIT_TB: new Set(), JETONS_ACTIONS: new Set([JETON]),
    prixUsdPourPlan: async (adr) => { if (chaine.prixNull > 0) { chaine.prixNull -= 1; return null; } return adr === null ? 2000 : 1; },
    decimalesCache: new Map(), WETH_SRV: '0x' + '42'.repeat(20), valeurUsd, crediter, jourDe, joursPass, saisonDe, SEUIL_VOLUME_JOUR_USD: 10,
    passSkinVerifie: () => ({ ok: true, payeur: PAYEUR }), BLOCKSKINS_SRV: '0x' + 'c0'.repeat(20), BLOCKSKINS_ACTIF_SRV: { routeur: null } /* 2026-11-12: crediterPassSkin reads the active contract's router (none here) */, USDC_BASE: '0x' + 'aa'.repeat(20), FEE_WALLET: '0x' + 'fe'.repeat(20), SKIN_MINT_USDC_SRV: 1000000n,
    compterRevenu: (x) => { compte.n += 1; return x; }, createurDuBlock: async () => null, ligneRegistre: () => ({}), horodatagesBlocsRolls: new Map(), console: { log() {} },
  };
  const noms = Object.keys(deps);
  const corps = 'let revenuSale = false;\n' + src.slice(h0, h1) + '\n' + src.slice(c0, c1) + '\nreturn async function route(chemin, req, res) {\n' + src.slice(r0, r1) + '\n};';
  return new Function(...noms, corps)(...noms.map((k) => deps[k]));
}
function poster(route, h, ligne) {
  return new Promise((fin) => {
    const res = { code: 0, writeHead(c) { this.code = c; }, end(b) { fin({ code: this.code, corps: JSON.parse(b) }); } };
    void route('/api/paye', { method: 'POST', url: '/api/paye?h=' + h + '&l=' + ligne }, res);
  });
}
const sec = (ms) => Math.floor(ms / 1000);
const etatVide = () => ({ vus: {}, parJour: {}, tentatives: {}, externe: {}, interne: {}, registre: {} });
const usdDe = (etat, jourId) => (((etat.jours || {})[jourId] || {})[PAYEUR] || {}).usd || 0;
const BLOC_MS = Date.UTC(2026, 9, 24, 10), JB = 'J2026-10-24';
const POSTE = [Date.UTC(2026, 9, 24, 11), Date.UTC(2026, 9, 24, 11, 1), Date.UTC(2026, 9, 24, 11, 2)];

async function sequence(src, { ligne = 'swap_action', lisibleAu = 2, envois = 3, prixNull = 0, fraisOk = true, actions = false }) {
  const h = H(9), etat = etatVide(), compte = { n: 0 }, horloge = { t: POSTE[0] };
  const chaine = { recus: { [h]: { blockNumber: '0x1f4', status: '0x1' } }, blocs: {}, prixNull };
  const route = monter(src, etat, horloge, chaine, compte, { fraisOk, actions });
  const reps = [];
  for (let k = 1; k <= envois; k++) {
    horloge.t = POSTE[k - 1];
    if (k >= lisibleAu) chaine.blocs[500] = sec(BLOC_MS);
    const r = await poster(route, h, ligne);
    r.usd = usdDe(etat, JB); r.attente = !!(etat.ticketsEnAttente || {})[h]; r.vu = !!etat.vus[h]; r.volVu = !!(etat.volVus || {})[h];
    r.pass = ((etat.passes || {})[PAYEUR] || []).length;
    reps.push(r);
  }
  return { etat, reps, compte, h };
}
const tk = (r) => (r && r.corps && r.corps.ticket) || {};
const resume = (reps) => reps.map((r) => r.code + ' ' + (tk(r).etat || '-') + (r.corps.deja ? ' deja' : '') + ' usd=' + r.usd + ' pass=' + r.pass + (r.attente ? ' attente' : '') + (r.vu ? ' vu' : '')).join(' | ');

async function scenarios(src) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  await essai('D1-non-lu-repond-202', async () => {
    const { reps, compte } = await sequence(src, {});
    R['D1:detail'] = resume(reps);
    const [r1, r2, r3] = reps;
    return r1.code === 202 && tk(r1).etat === 'NON_LU' && r1.usd === 0 && r1.attente && r2.code === 200 && tk(r2).etat === 'CREDITE' && r2.usd === 20 && !r2.attente
      && r3.code === 200 && r3.corps.deja === true && compte.n === 2;
  });
  await essai('D2-frais-non-verifie-non-lu-202', async () => {
    const { reps } = await sequence(src, { ligne: 'hook_block', fraisOk: false, envois: 2 });
    R['D2:detail'] = resume(reps);
    return reps[0].code === 202 && tk(reps[0]).etat === 'NON_LU' && reps[0].usd === 0 && tk(reps[1]).etat === 'CREDITE' && reps[1].usd === 20;
  });
  await essai('P1-prix-eth-null-attend', async () => {
    const { reps, compte } = await sequence(src, { lisibleAu: 1, prixNull: 1 });
    R['P1:detail'] = resume(reps) + ' | pourquoi ' + JSON.stringify(tk(reps[0]).pourquoi || null);
    const [r1, r2, r3] = reps;
    return r1.code === 202 && tk(r1).etat === 'NON_LU' && /price/i.test(String(tk(r1).pourquoi)) && r1.usd === 0 && r1.attente && !r1.volVu
      && tk(r2).etat === 'CREDITE' && r2.usd === 20 && !r2.attente && r3.corps.deja === true && compte.n === 2;
  });
  await essai('P2-prix-action-null-attend', async () => {
    const { reps } = await sequence(src, { lisibleAu: 1, prixNull: 1, actions: true });
    R['P2:detail'] = resume(reps) + ' | pourquoi ' + JSON.stringify(tk(reps[0]).pourquoi || null);
    return reps[0].code === 202 && tk(reps[0]).etat === 'NON_LU' && /price/i.test(String(tk(reps[0]).pourquoi)) && reps[0].usd === 0 && !reps[0].volVu
      && tk(reps[1]).etat === 'CREDITE' && reps[1].usd === 20;
  });
  await essai('P3-temoin-prix-lu', async () => {
    const { reps } = await sequence(src, { lisibleAu: 1, envois: 2, actions: true });
    return reps[0].code === 200 && tk(reps[0]).etat === 'CREDITE' && reps[0].usd === 20 && reps[1].corps.deja === true;
  });
  await essai('K1-pass-skin-renvoi-credite', async () => {
    const { etat, reps, compte, h } = await sequence(src, { ligne: 'skin_mint' });
    R['K1:detail'] = resume(reps) + ' | compterRevenu ' + compte.n;
    const [r1, r2, r3] = reps;
    return r1.code === 202 && tk(r1).etat === 'NON_LU' && r1.pass === 0 && r1.attente && r2.code === 200 && tk(r2).etat === 'CREDITE' && tk(r2).jourId === JB
      && r2.pass === JOURS_PASS_SKIN && (etat.passVus || {})[h] === 1 && !r2.attente && r3.corps.deja === true && r3.pass === JOURS_PASS_SKIN && compte.n === 2;
  });
  await essai('K2-pass-sans-swap-non-lu-202', async () => {
    const { reps } = await sequence(src, { ligne: 'skin_mint', fraisOk: false, envois: 2 });
    R['K2:detail'] = resume(reps);
    return reps[0].code === 202 && tk(reps[0]).etat === 'NON_LU' && tk(reps[1]).etat === 'CREDITE' && reps[1].pass === JOURS_PASS_SKIN;
  });
  return R;
}

const R = await scenarios(SRV);
for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
for (const k of ['D1', 'D2', 'P1', 'P2', 'K1', 'K2']) console.log('    ' + k + ' : ' + R[k + ':detail']);
const MUTANTS = [
  { nom: 'ticket NON_LU du frais compte -> 200', de: /repondre\(ticketTP && ticketTP\.etat === 'NON_LU' \? 202 : 200, avecTicket\(\{ ok: true, externe: verif\.externe \}\)\)/, vers: "repondre(200, avecTicket({ ok: true, externe: verif.externe }))", rougit: 'D1-non-lu-repond-202' },
  { nom: 'ticket NON_LU sans frais -> 200', de: /repondre\(v\.etat === 'NON_LU' \|\| \(ticketTP && ticketTP\.etat === 'NON_LU'\) \? 202 : 200/, vers: "repondre(v.etat === 'NON_LU' ? 202 : 200", rougit: 'D2-frais-non-verifie-non-lu-202' },
  /* 3e tour (D2) : le prix nul est une jambe SANS PRIX (manques) ; NON_LU seulement sous le seuil — les gardes ont change de forme */
  { nom: 'prix ETH null -> 0 $', de: /else manques\.push\('ETH'\); \}/, vers: '}', rougit: 'P1-prix-eth-null-attend' },
  { nom: 'prix d action null ignore', de: /if \(manques\.length\) \{ const nl = jambeSansPrix\(/, vers: 'if (false) { const nl = jambeSansPrix(', rougit: 'P2-prix-action-null-attend' },
  { nom: 'renvoi skin_mint par crediterVolumeJour seul', de: /ligne === 'skin_mint' \? await crediterPassSkin\(\{ h, tx, recu, internes \}\)/, vers: 'false ? null', rougit: 'K1-pass-skin-renvoi-credite' },
];
let tues = 0;
for (const m of MUTANTS) {
  if (!m.de.test(SRV)) { ok(false, 'MUTANT ' + m.nom + ' : motif absent de la source'); continue; }
  const Rm = await scenarios(SRV.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
console.log('mutants tues ' + tues + '/' + MUTANTS.length);
console.log(n + ' assertions, ' + ko + ' KO - NE PROUVE PAS un recu reel de Base, un vrai prix illisible, ni le balayage serveur des tickets en attente (banc : test-ticketpot-fix4-20261024)');
if (ko) process.exitCode = 1;
