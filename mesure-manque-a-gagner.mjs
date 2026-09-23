/* mesure-manque-a-gagner.mjs — LES ECHANGES SUR DES BLOCKS B20 PAIENT-ILS, OUI OU NON ?
 *
 * ⛔ LA QUESTION DE PHIL, MOT POUR MOT (2026-09-23) : « je vois des tx en direct pas prise en
 *    compte, le manque a gagner est enorme chaque heure ». On ne repond pas a ca par une opinion.
 *
 * CE QU ON MESURE, SUR UNE FENETRE DE 24 h :
 *   1. toutes les pools Uniswap v4 ouvertes dont UNE DES DEUX devises est un jeton `0xb20…` ;
 *   2. lesquelles portent NOTRE hook, lesquelles n en portent aucun des notres ;
 *   3. combien d echanges ont eu lieu dans chacune.
 * ⇒ Un echange dans une pool sans notre hook ne nous paie RIEN. C est ca, le manque a gagner —
 *   et il se chiffre au lieu de se supposer.
 *
 * ⛔ CE QUE CETTE SONDE NE PEUT PAS DIRE :
 *   · combien d ETH ces echanges auraient rapporte : il faudrait decoder le volume de chaque swap
 *     et appliquer le taux du hook. Elle compte des ECHANGES, pas des montants, et le dit ;
 *   · si un block `0xb20…` vient de NOTRE app : le prefixe est un marqueur de standard, pas de
 *     provenance. Elle separe donc « B20 » et « ouvert par notre factory » quand elle peut ;
 *   · « 0 » ne veut dire « rien » QUE si toutes les fenetres ont ete lues. Le compte est affiche.
 */
import { FACTORY, TOPIC_CREATED, FENETRE_MAX } from './index-blocks.js';
import { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';
import { TOPIC_SWAP } from './achats.js';

const RPC = 'https://mainnet.base.org';
const PM_V4 = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TOPIC_INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const NOTRES = new Map([['V1', HOOK_PREVU], ['V2', HOOK_V2], ['V3', HOOK_V3], ['V4', HOOK_V4],
  ['V5', HOOK_V5], ['V6', HOOK_V6], ['V7', HOOK_V7], ['V8', HOOK_V8]].map(([n, a]) => [a.toLowerCase(), n]));

let appels = 0;
async function rpc(m, p) {
  for (let e = 0; e < 5; e++) {
    try {
      appels++;
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: appels, method: m, params: p }) });
      if (r.status === 429) { await new Promise((k) => setTimeout(k, 700 * 2 ** e)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (err) { if (e === 4) throw err; await new Promise((k) => setTimeout(k, 400 * 2 ** e)); }
  }
}
const hex = (n) => '0x' + n.toString(16);

async function balayer(filtre, de, a, quoi) {
  const logs = []; let lues = 0, ratees = 0;
  const attendues = Math.ceil((a - de + 1) / FENETRE_MAX);
  for (let h = a; h >= de;) {
    const bas = Math.max(de, Math.floor(h / FENETRE_MAX) * FENETRE_MAX);
    try {
      const o = await rpc('eth_getLogs', [{ ...filtre, fromBlock: hex(bas), toBlock: hex(h) }]);
      if (Array.isArray(o)) { logs.push(...o); lues++; } else ratees++;
    } catch (_) { ratees++; }
    h = bas - 1;
    if (lues % 10 === 0 && lues) process.stdout.write('\r  ' + quoi + ' ' + lues + '/' + attendues + '…    ');
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  return { logs, lues, ratees, attendues };
}

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const HEURES = 24;
const debut = tete - Math.floor((HEURES * 3600) / 2);
console.log('═══ MANQUE A GAGNER — ' + HEURES + ' h · blocs ' + debut + ' -> ' + tete + ' ═══\n');

/* 1. les pools ouvertes dont une devise est un B20 */
const init = await balayer({ address: PM_V4, topics: [TOPIC_INITIALIZE] }, debut, tete, 'Initialize');
console.log('pools ouvertes sur Base (24 h) : ' + init.logs.length
  + '   (fenetres ' + init.lues + '/' + init.attendues + ', ratees ' + init.ratees + ')');

const b20 = (x) => String(x || '').toLowerCase().startsWith('0xb20');
const pools = [];
for (const l of init.logs) {
  const c0 = '0x' + String(l.topics[2] || '').slice(26);
  const c1 = '0x' + String(l.topics[3] || '').slice(26);
  if (!b20(c0) && !b20(c1)) continue;
  const d = String(l.data || '').replace(/^0x/, '');
  if (d.length < 5 * 64) continue;
  const hook = '0x' + d.slice(2 * 64 + 24, 3 * 64);
  pools.push({ id: l.topics[1], jeton: b20(c0) ? c0 : c1, hook, notre: NOTRES.get(hook) || null,
    bloc: parseInt(l.blockNumber, 16) });
}
const notres = pools.filter((p) => p.notre);
const etrangeres = pools.filter((p) => !p.notre);
console.log('  dont une devise est un block B20 : ' + pools.length);
console.log('    · sur NOTRE hook   : ' + notres.length
  + (notres.length ? '  (' + [...new Set(notres.map((p) => p.notre))].join(', ') + ')' : ''));
console.log('    · hook ETRANGER    : ' + etrangeres.length);
if (!pools.length) { console.log('\n⇒ aucune pool B20 ouverte sur 24 h : rien a comparer ici.'); process.exit(0); }

/* 2. combien d echanges dans chacune */
async function swapsDe(ids, quoi) {
  if (!ids.length) return { n: 0, lues: 0, ratees: 0, attendues: 0 };
  const r = await balayer({ address: PM_V4, topics: [TOPIC_SWAP, ids] }, debut, tete, quoi);
  return { n: r.logs.length, lues: r.lues, ratees: r.ratees, attendues: r.attendues };
}
const sN = await swapsDe(notres.map((p) => p.id), 'Swap (nos pools)');
const sE = await swapsDe(etrangeres.map((p) => p.id), 'Swap (pools etrangeres)');

console.log('\n── LES ECHANGES, SUR 24 h ──');
console.log('  dans NOS pools (elles nous paient)       : ' + sN.n
  + '   (fenetres ' + sN.lues + '/' + sN.attendues + ', ratees ' + sN.ratees + ')');
console.log('  dans des pools B20 SANS notre hook       : ' + sE.n
  + '   (fenetres ' + sE.lues + '/' + sE.attendues + ', ratees ' + sE.ratees + ')');
const tot = sN.n + sE.n;
console.log('  ⇒ part des echanges B20 qui NE nous paient RIEN : '
  + (tot ? (sE.n / tot * 100).toFixed(1) + ' %' : 'aucun echange B20 sur la fenetre'));
if (sN.ratees || sE.ratees || init.ratees) {
  console.log('  ⛔ des fenetres ont ete ratees : ces comptes sont des MINIMA.');
}

/* 3. ⛔ ET LA QUESTION QUI DECIDE DE LA SUITE : ces pools etrangeres portent-elles des blocks nes
 *    chez NOUS ? Si oui, on perd nos propres creations ; sinon, ce sont les B20 des autres. */
if (etrangeres.length) {
  const nes = await balayer({ address: FACTORY, topics: [TOPIC_CREATED] }, debut, tete, 'Created');
  const parNous = new Set();
  for (const l of nes.logs) for (const t of (l.topics || []).slice(1)) {
    const a = '0x' + String(t).slice(26);
    if (b20(a)) parNous.add(a.toLowerCase());
  }
  const perdus = etrangeres.filter((p) => parNous.has(String(p.jeton).toLowerCase()));
  console.log('\n── CES POOLS ETRANGERES PORTENT-ELLES NOS BLOCKS ? ──');
  console.log('  creations lues par la factory (24 h) : ' + nes.logs.length
    + '   (fenetres ' + nes.lues + '/' + nes.attendues + ', ratees ' + nes.ratees + ')');
  console.log('  pools etrangeres portant un block ne de CETTE FACTORY : ' + perdus.length + '/' + etrangeres.length);
  /* ⛔⛔ CETTE LIGNE DISAIT « ce sont NOS creations qui s echangent ailleurs sans nous payer ».
   *     C ETAIT FAUX, ET C EST LE PIEGE `b20-provenance` : la factory `0xb20f…` est PUBLIQUE.
   *     N importe quel launchpad l appelle. « Ne de cette factory » ne veut donc PAS dire « ne
   *     chez nous » — seul un passage par notre `CREATE_ROUTER` le prouverait, et celui-ci a
   *     rendu 0 evenement en 14 jours (mesure du jour, 303/303 fenetres).
   *     ⇒ Ces echanges ne nous sont pas PRIS : ce sont ceux d un marche qu on ne capte pas.
   *       La difference change entierement ce qu il faut faire. */
  console.log('  ⛔ « ne de cette factory » ≠ « ne chez nous » : la factory B20 est PUBLIQUE.');
  console.log('     Notre CREATE_ROUTER a rendu 0 evenement en 14 j : aucune de ces creations');
  console.log('     n est passee par notre chemin paye. Ce marche n est pas perdu, il n est pas capte.');
}
console.log('\n' + appels + ' appels RPC.');
