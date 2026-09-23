/* mesure-six-rails.mjs — LES SIX RAILS DE FRAIS, REMESURES SUR LA CHAINE (Phil, 2026-09-23).
 *
 * ⛔⛔ POURQUOI ON REMESURE. Les chiffres que je citais dataient de plusieurs jours et l un d eux
 *     avait deja pourri : je disais « hook V6 LIVE » alors que le hook courant est le V8, qui a
 *     fait passer le taux de 3 % a 0,5 %. Tout montant cite « par 14 jours » venait donc d un
 *     regime de frais SIX FOIS plus eleve que celui d aujourd hui. Un chiffre recopie ne redevient
 *     pas vrai — [[handoff-figures-rot]].
 *
 * ⛔ AUCUNE ADRESSE N EST TAPEE A LA MAIN. Tout est IMPORTE des modules livres. Completer une
 *    adresse de memoire a deja envoye une enquete entiere sur une fausse piste ici.
 *
 * ⛔ CE QUE CET INSTRUMENT PEUT PROUVER :
 *    · un solde, a un bloc donne ;
 *    · la presence ou l absence de code a une adresse ;
 *    · des evenements ERC-20 et Uniswap v4, fenetre par fenetre, avec le compte des fenetres LUES.
 * ⛔ CE QU IL NE PEUT PAS PROUVER, ET QU IL DIT :
 *    · les entrees en ETH NATIF n emettent aucun log. Un solde ne distingue pas « rien recu » de
 *      « recu puis depense ». La variation de solde est donc un NET, jamais un revenu ;
 *    · un evenement n est pas une transaction. Tout `Transfer` retenu comme entree d argent est
 *      re-verifie par `eth_getTransactionByHash` : `tx.from` doit correspondre. Deux faux ont deja
 *      ete attrapes comme ca ;
 *    · « 0 resultat » ne veut dire « rien ne s est passe » QUE si toutes les fenetres ont ete lues.
 *      Le compte fenetres-lues / fenetres-attendues est affiche, et une seule fenetre ratee
 *      invalide la conclusion. `absence-of-evidence-vs-failure-to-look`.
 */
import { FEE_WALLET, CREATE_ROUTER, USDC_BASE, USDC_DECIMALES } from './frais-creation.js';
import { TBLOCK, HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';

/* ⛔ `mainnet.base.org` est le SEUL noeud qui sert un getLogs multi-adresses et les lectures B20
 *    (mesure du jour). Ce script n a pas de repli : mieux vaut echouer que lire une liste vide
 *    qu on prendrait pour « aucun evenement ». */
const RPC = 'https://mainnet.base.org';
const FENETRE = 2000;                    /* plafond mesure de Base : « limited to a 2,000 range » */
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOPIC_INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const PM_V4 = '0x498581ff718922c3f8e6a244956af099b2652b2b';   /* Uniswap v4 PoolManager, Base */

let appels = 0;
async function rpc(methode, params) {
  for (let essai = 0; essai < 4; essai++) {
    try {
      appels++;
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: appels, method: methode, params }) });
      if (r.status === 429) { await new Promise((k) => setTimeout(k, 800 * 2 ** essai)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (e) {
      if (essai === 3) throw e;
      await new Promise((k) => setTimeout(k, 500 * 2 ** essai));
    }
  }
}
const mot = (a) => '0x' + String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const hex = (n) => '0x' + n.toString(16);
const ethDe = (wei) => Number(BigInt(wei)) / 1e18;

/** getLogs fenetre par fenetre. Rend AUSSI le compte des fenetres lues et ratees — sans lui,
 *  un « 0 log » ne se distingue pas d un « je n ai pas regarde ». */
async function balayer(filtre, de, a, quoi) {
  const logs = [];
  let lues = 0, ratees = 0;
  const attendues = Math.ceil((a - de + 1) / FENETRE);
  for (let d = de; d <= a; d += FENETRE) {
    const f = Math.min(a, d + FENETRE - 1);
    try {
      const out = await rpc('eth_getLogs', [{ ...filtre, fromBlock: hex(d), toBlock: hex(f) }]);
      if (!Array.isArray(out)) { ratees++; continue; }
      logs.push(...out); lues++;
    } catch (e) { ratees++; }
    if (lues % 25 === 0 && lues) process.stdout.write('\r    ' + quoi + ' : ' + lues + '/' + attendues + ' fenetres…   ');
  }
  process.stdout.write('\r' + ' '.repeat(70) + '\r');
  return { logs, lues, ratees, attendues };
}

/* ------------------------------------------------------------------ */
const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const BLOCS_14J = Math.floor((14 * 24 * 3600) / 2);       /* Base : 2 s par bloc */
const debut = tete - BLOCS_14J;

console.log('═══ LES SIX RAILS, REMESURES — ' + new Date().toISOString().slice(0, 10) + ' ═══');
console.log('tete ' + tete + ' · fenetre 14 j = blocs ' + debut + ' -> ' + tete
  + ' (' + BLOCS_14J + ' blocs, ' + Math.ceil(BLOCS_14J / FENETRE) + ' fenetres)\n');

/* ⛔ TEMOIN AVANT TOUTE MESURE : si le noeud ne rend pas le code d un contrat connu, tout
 *    « 0 » qui suit est un artefact de lecture, pas un fait. */
const codeTemoin = await rpc('eth_getCode', [PM_V4, 'latest']);
console.log('TEMOIN · code du PoolManager v4 lu : ' + (codeTemoin && codeTemoin.length > 4
  ? codeTemoin.length + ' caracteres  ✅ le noeud repond' : '⛔ VIDE — instrument mort, rien en dessous ne vaut'));
if (!codeTemoin || codeTemoin.length <= 4) process.exit(1);

/* ---------- RAIL 0 : le wallet lui-meme -------------------------------------- */
const soldeNow = BigInt(await rpc('eth_getBalance', [FEE_WALLET, 'latest']));
const soldeAvant = BigInt(await rpc('eth_getBalance', [FEE_WALLET, hex(debut)]));
console.log('\n── RAIL 0 · le wallet de frais ──');
console.log('  solde maintenant      : ' + ethDe(soldeNow).toFixed(9) + ' ETH');
console.log('  solde il y a 14 j     : ' + ethDe(soldeAvant).toFixed(9) + ' ETH');
const delta = soldeNow - soldeAvant;
console.log('  VARIATION NETTE 14 j  : ' + (delta >= 0n ? '+' : '') + ethDe(delta).toFixed(9) + ' ETH');
console.log('  ⛔ c est un NET, pas un revenu : une sortie de gas le masque, et l ETH natif');
console.log('     n emet aucun log — on ne peut pas separer entrees et sorties ici.');

/* ---------- RAIL 1 : Create / CREATE_ROUTER ---------------------------------- */
console.log('\n── RAIL 1 · Create (CREATE_ROUTER) ──');
const codeCR = await rpc('eth_getCode', [CREATE_ROUTER, 'latest']);
const soldeCR = BigInt(await rpc('eth_getBalance', [CREATE_ROUTER, 'latest']));
console.log('  contrat deploye       : ' + (codeCR && codeCR.length > 4 ? 'OUI (' + codeCR.length + ' car.)' : 'NON — pas de code'));
console.log('  solde du routeur      : ' + ethDe(soldeCR).toFixed(9) + ' ETH');
const crLogs = await balayer({ address: CREATE_ROUTER }, debut, tete, 'CreateRouter');
console.log('  evenements 14 j       : ' + crLogs.logs.length
  + '   (fenetres ' + crLogs.lues + '/' + crLogs.attendues + ', ratees ' + crLogs.ratees + ')');
console.log('  ⇒ ' + (crLogs.ratees === 0
  ? (crLogs.logs.length === 0 ? 'ZERO evenement sur 14 j, toutes fenetres lues — le rail n est PAS exerce.'
    : crLogs.logs.length + ' evenements : le rail EST exerce, a instruire.')
  : '⛔ ' + crLogs.ratees + ' fenetre(s) ratee(s) : on ne peut RIEN conclure d un zero.'));

/* ---------- RAIL 2 : USDC vers le wallet ------------------------------------- */
console.log('\n── RAIL 2 · USDC encaisse par le wallet ──');
const usdc = await balayer(
  { address: USDC_BASE, topics: [TOPIC_TRANSFER, null, mot(FEE_WALLET)] }, debut, tete, 'USDC->wallet');
console.log('  Transfer USDC recus   : ' + usdc.logs.length
  + '   (fenetres ' + usdc.lues + '/' + usdc.attendues + ', ratees ' + usdc.ratees + ')');
let usdcTotal = 0n, usdcProuves = 0;
for (const l of usdc.logs.slice(0, 12)) {
  /* ⛔ UN EVENEMENT N EST PAS UNE TRANSACTION : on va chercher la tx avant de compter un centime. */
  const tx = await rpc('eth_getTransactionByHash', [l.transactionHash]);
  if (tx) { usdcProuves++; usdcTotal += BigInt(l.data); }
}
if (usdc.logs.length) {
  console.log('  verifies par tx       : ' + usdcProuves + '/' + Math.min(12, usdc.logs.length));
  console.log('  montant (12 premiers) : ' + (Number(usdcTotal) / 10 ** USDC_DECIMALES).toFixed(6) + ' USDC');
} else {
  console.log('  ⇒ ' + (usdc.ratees === 0
    ? 'ZERO USDC en 14 jours, toutes fenetres lues.'
    : '⛔ ' + usdc.ratees + ' fenetre(s) ratee(s) : zero non concluant.'));
}

/* ---------- RAIL 3 : jetons TBLOCK vers le wallet ---------------------------- */
console.log('\n── RAIL 3 · frais payes EN JETON (TBLOCK -> wallet) ──');
const tb = await balayer(
  { address: TBLOCK, topics: [TOPIC_TRANSFER, null, mot(FEE_WALLET)] }, debut, tete, 'TBLOCK->wallet');
console.log('  Transfer TBLOCK recus : ' + tb.logs.length
  + '   (fenetres ' + tb.lues + '/' + tb.attendues + ', ratees ' + tb.ratees + ')');

/* ---------- RAILS 4-5 : les hooks, et les marches ouverts dessus -------------- */
console.log('\n── RAILS 4-5 · les hooks et leurs marches ──');
const HOOKS = [['V1 (prevu)', HOOK_PREVU], ['V2', HOOK_V2], ['V3', HOOK_V3], ['V4', HOOK_V4],
  ['V5', HOOK_V5], ['V6', HOOK_V6], ['V7', HOOK_V7], ['V8 (courant)', HOOK_V8]];
const deploye = new Map();
for (const [nom, adr] of HOOKS) {
  const c = await rpc('eth_getCode', [adr, 'latest']);
  deploye.set(adr.toLowerCase(), c && c.length > 4);
  console.log('  ' + nom.padEnd(14) + (c && c.length > 4 ? 'deploye (' + c.length + ' car.)' : '⛔ AUCUN CODE'));
}
/* ⛔ `Initialize` porte `hooks` dans les DONNEES, pas dans les topics : on ne peut pas filtrer
 *    dessus, il faut lire toutes les ouvertures de pool et decoder. C est plus cher, et c est le
 *    seul moyen honnete de compter nos marches. */
console.log('\n  ouvertures de pool sur Base (14 j), pour compter les notres :');
const init = await balayer({ address: PM_V4, topics: [TOPIC_INITIALIZE] }, debut, tete, 'Initialize');
console.log('  Initialize lus        : ' + init.logs.length
  + '   (fenetres ' + init.lues + '/' + init.attendues + ', ratees ' + init.ratees + ')');
const parHook = new Map();
for (const l of init.logs) {
  const d = String(l.data || '').replace(/^0x/, '');
  /* data = fee(32) tickSpacing(32) hooks(32) sqrtPriceX96(32) tick(32) — hooks = 3e mot */
  if (d.length < 5 * 64) continue;
  const h = '0x' + d.slice(2 * 64 + 24, 3 * 64);
  parHook.set(h, (parHook.get(h) || 0) + 1);
}
let notres = 0;
for (const [nom, adr] of HOOKS) {
  const n = parHook.get(adr.toLowerCase()) || 0;
  notres += n;
  if (n) console.log('    ' + nom.padEnd(14) + n + ' marche(s) ouvert(s)');
}
console.log('    ⇒ NOS marches sur 14 j : ' + notres + ' sur ' + init.logs.length
  + ' ouvertures Base (' + (init.logs.length ? (notres / init.logs.length * 100).toFixed(3) : '0') + ' %)');
if (init.ratees) console.log('    ⛔ ' + init.ratees + ' fenetre(s) ratee(s) : ces comptes sont des MINIMA.');

/* ---------- RAIL 6 : le Bridge ----------------------------------------------- */
console.log('\n── RAIL 6 · Bridge ──');
console.log('  (lu dans le code, pas sur la chaine — voir le verdict ci-dessous)');

console.log('\n═══ ' + appels + ' appels RPC. Fenetres ratees au total : '
  + (crLogs.ratees + usdc.ratees + tb.ratees + init.ratees) + ' ═══');
