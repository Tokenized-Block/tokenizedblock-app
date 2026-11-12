/* test-ticket-jour-du-bloc-20261024.mjs — LE VOLUME ET LE PASS SKIN COMPTENT LE JOUR DU BLOC, PAS LE JOUR OU LE HASH EST POSTE.
 * Revue adverse 2026-10-24 (audit-ticketpot 4, MEDIUM) : crediterVolumeJour creditait jourDe(Date.now()) et le pass skin joursPass(Date.now()) :
 *   un wallet gardait 7 swaps du lundi et postait un hash par jour (un ticket chaque jour sans trader), n importe quel vieux swap sur la pool
 *   UNIT se postait aujourd hui ; et un trade a 23:59:58 poste apres minuit tombait le lendemain.
 * EXECUTE la vraie route POST /api/paye de serveur-web.js + crediterVolumeJour + le jour du bloc (jourDuRecu) + horodatageBloc (decoupes,
 *   montes par new Function) avec les vrais crediter / jourDe / joursPass ; simules : la chaine (tx, recu, bloc), verifierFrais,
 *   volumeVerifie / passSkinVerifie (le recu est deja juge valide), le prix (20 $ le trade), l horloge.
 * AFFIRME : le jour credite = celui de l horodatage du BLOC du recu (23:59:58 poste a 00:00:30 -> la veille) ; un bloc de plus de 48 h ->
 *   rien de credite, la reponse dit pourquoi (ticket.etat TROP_VIEUX), le hash n est pas marque vu ; un bloc illisible -> rien, NON_LU, le
 *   hash se renvoie ; un hash ne compte qu une fois ; le pass skin pareil (jour du bloc, refus au-dela de 48 h).
 *   MUTANTS (copies en memoire) : Date.now a la place du bloc, borne de 48 h retiree, hash marque vu avant le bloc lu -> ROUGIT.
 * ⛔ NE PROUVE PAS : un recu reel de Base, ni l ecran (l app n affiche pas encore ticket.pourquoi). La saison v1 (revenu.saisons, swap_action)
 *   reste comptee a la date de reception : hors de ce correctif. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crediter, jourDe, joursPass, saisonDe } from './tirage-saison.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SRV = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8').replace(/\r\n/g, '\n');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const PAYEUR = '0x' + 'd4'.repeat(20);
const H = (k) => '0x' + k.toString(16).padStart(64, '0');

function monter(src, etat, horloge, chaine) {
  const r0 = src.indexOf("if (chemin === '/api/paye' && req.method === 'POST') {"), r1 = src.indexOf('/* ══ REGISTRE DES CREATEURS (2026-10-17');
  const m = src.indexOf('/* ══ LE JOUR DU BLOC'), c0 = m >= 0 ? m : src.indexOf('async function crediterVolumeJour('), c1 = src.indexOf('async function valeurFraisUsd(');
  const h0 = src.indexOf('async function horodatageBloc(n) {'), h1 = src.indexOf('let rollsScanEnVol');
  if (r0 < 0 || r1 < r0 || c0 < 0 || c1 < c0 || h0 < 0 || h1 < h0) throw new Error('decoupe introuvable');
  class D extends Date { constructor(...x) { if (x.length) super(...x); else super(horloge.t); } static now() { return horloge.t; } }
  const rpc = async (meth, p) => {
    if (meth === 'eth_getTransactionByHash') return { hash: p[0], from: PAYEUR };
    if (meth === 'eth_getTransactionReceipt') return chaine.recus[p[0]] || null;
    if (meth === 'eth_getBlockByNumber') { const ts = chaine.blocs[parseInt(p[0], 16)]; return ts === undefined ? null : { timestamp: '0x' + ts.toString(16) }; }
    throw new Error('rpc ' + meth);
  };
  const deps = {
    revenu: etat, Date: D, LIGNES_FRAIS: ['hook_block', 'swap_action', 'skin_mint'], payesEnCours: new Set(), rpcActivite: rpc, rpcServeur: rpc,
    walletsInternes: () => new Set(), COMPTE_SONDE: '0x00000000000000000000000000000000c0ffee77', process: { env: {} },
    verifierFrais: () => ({ ok: false, etat: 'PAS_DE_FRAIS', pourquoi: 'no fee of ours in this transaction' }), devisesComptees: () => [], POOLS_ACTIONS_AERODROME: new Map(),
    volumeVerifie: () => ({ ok: true, payeur: PAYEUR, unitWei: (10n ** 18n).toString(), actions: [] }), V4_ADRESSES: { 8453: { poolm: '0x' + '0'.repeat(40) } }, POOLS_UNIT_TB: new Set(), JETONS_ACTIONS: new Set(),
    prixUsdPourPlan: async () => 20, valeurFraisUsd: async () => 0, crediter, jourDe, joursPass, saisonDe,
    passSkinVerifie: () => ({ ok: true, payeur: PAYEUR }), BLOCKSKINS_SRV: '0x' + 'c0'.repeat(20), BLOCKSKINS_ACTIF_SRV: { routeur: null } /* 2026-11-12: crediterPassSkin reads the active contract's router (none here) */, USDC_BASE: '0x' + 'aa'.repeat(20), FEE_WALLET: '0x' + 'fe'.repeat(20), SKIN_MINT_USDC_SRV: 1000000n,
    compterRevenu: (x) => x, createurDuBlock: async () => null, ligneRegistre: () => ({}), horodatagesBlocsRolls: new Map(), console: { log() {} },
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
async function un(src, { blocMs, posteMs, ligne = 'hook_block', h = H(1), etat = { vus: {}, parJour: {}, tentatives: {}, externe: {}, interne: {}, registre: {} }, illisible = false }) {
  const chaine = { recus: { [h]: { blockNumber: '0x1f4', status: '0x1' } }, blocs: illisible ? {} : { 500: sec(blocMs) } };
  const route = monter(src, etat, { t: posteMs }, chaine);
  const r = await poster(route, h, ligne);
  return { etat, r };
}
const usdDe = (etat, jourId) => (((etat.jours || {})[jourId] || {})[PAYEUR] || {}).usd || 0;

async function scenarios(src) {
  const R = {};
  const essai = async (nom, f) => { try { R[nom] = await f(); } catch (e) { R[nom] = false; R[nom + ':err'] = String(e && e.message || e); } };
  await essai('V1-minuit', async () => {
    const { etat } = await un(src, { blocMs: Date.UTC(2026, 9, 24, 23, 59, 58), posteMs: Date.UTC(2026, 9, 25, 0, 0, 30) });
    return usdDe(etat, 'J2026-10-24') === 20 && usdDe(etat, 'J2026-10-25') === 0;
  });
  await essai('V2-poste-le-lendemain', async () => {
    const { etat } = await un(src, { blocMs: Date.UTC(2026, 9, 19, 10), posteMs: Date.UTC(2026, 9, 20, 9) });
    return usdDe(etat, 'J2026-10-19') === 20 && usdDe(etat, 'J2026-10-20') === 0;
  });
  await essai('V3-plus-de-48h', async () => {
    const { etat, r } = await un(src, { blocMs: Date.UTC(2026, 9, 20, 10), posteMs: Date.UTC(2026, 9, 22, 10, 1) });
    return !etat.jours && !(etat.volVus || {})[H(1)] && r.corps.ticket && r.corps.ticket.etat === 'TROP_VIEUX' && /48 h/.test(r.corps.ticket.pourquoi);
  });
  await essai('V3-temoin-47h59', async () => {
    const { etat } = await un(src, { blocMs: Date.UTC(2026, 9, 20, 10), posteMs: Date.UTC(2026, 9, 22, 9, 59) });
    return usdDe(etat, 'J2026-10-20') === 20;
  });
  await essai('V4-un-hash-une-fois', async () => {
    const e = { vus: {}, parJour: {}, tentatives: {}, externe: {}, interne: {}, registre: {} };
    await un(src, { blocMs: Date.UTC(2026, 9, 24, 10), posteMs: Date.UTC(2026, 9, 24, 11), etat: e });
    await un(src, { blocMs: Date.UTC(2026, 9, 24, 10), posteMs: Date.UTC(2026, 9, 25, 11), etat: e });
    return usdDe(e, 'J2026-10-24') === 20 && usdDe(e, 'J2026-10-25') === 0;
  });
  await essai('V5-bloc-illisible', async () => {
    const { etat, r } = await un(src, { blocMs: 0, posteMs: Date.UTC(2026, 9, 24, 11), illisible: true });
    return !etat.jours && !(etat.volVus || {})[H(1)] && r.corps.ticket && r.corps.ticket.etat === 'NON_LU';
  });
  await essai('P1-pass-jour-du-bloc', async () => {
    const { etat } = await un(src, { ligne: 'skin_mint', blocMs: Date.UTC(2026, 9, 24, 23, 59), posteMs: Date.UTC(2026, 9, 25, 0, 1) });
    const p = (etat.passes || {})[PAYEUR] || [];
    return p.includes('J2026-10-24') && !p.includes('J2026-10-25') && (etat.passVus || {})[H(1)] === 1;
  });
  await essai('P2-pass-plus-de-48h', async () => {
    const { etat, r } = await un(src, { ligne: 'skin_mint', blocMs: Date.UTC(2026, 9, 20, 10), posteMs: Date.UTC(2026, 9, 23, 10) });
    return !((etat.passes || {})[PAYEUR]) && !(etat.passVus || {})[H(1)] && r.corps.ticket && r.corps.ticket.etat === 'TROP_VIEUX';
  });
  return R;
}

const R = await scenarios(SRV);
for (const [k, v] of Object.entries(R)) if (!k.includes(':')) ok(v === true, k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : ''));
const MUTANTS = [
  { nom: 'volume : jour de reception (Date.now) au lieu du bloc', de: /saison: bloc\.jourId, payeur: vol\.payeur/, vers: 'saison: jourDe(Date.now()).id, payeur: vol.payeur', rougit: 'V1-minuit' },
  { nom: 'pass : joursPass(Date.now())', de: /joursPass\(blocPass\.ms\)/, vers: 'joursPass(Date.now())', rougit: 'P1-pass-jour-du-bloc' },
  { nom: 'borne de 48 h retiree', de: /if \(maintenant - ms > AGE_MAX_TICKET_MS\)/, vers: 'if (false)', rougit: 'V3-plus-de-48h' },
  { nom: 'hash marque vu avant le bloc lu', de: /if \(!vol\.ok \|\| internes\.has\(vol\.payeur\)\) return;/, vers: 'if (!vol.ok || internes.has(vol.payeur)) return; revenu.volVus[h] = 1;', rougit: 'V5-bloc-illisible' },
];
let tues = 0;
for (const m of MUTANTS) {
  if (!m.de.test(SRV)) { ok(false, 'MUTANT ' + m.nom + ' : motif absent de la source'); continue; }
  const Rm = await scenarios(SRV.replace(m.de, m.vers));
  const t = Rm[m.rougit] !== true; if (t) tues += 1;
  ok(t, 'MUTANT ' + m.nom + ' -> ' + m.rougit + ' ROUGIT');
}
console.log('mutants tues ' + tues + '/' + MUTANTS.length);
console.log(n + ' assertions, ' + ko + ' KO — NE PROUVE PAS un recu reel de Base');
if (ko) process.exitCode = 1;
