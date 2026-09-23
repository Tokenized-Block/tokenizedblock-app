/* mesure-rails-suite.mjs — CE QUE LA PREMIERE PASSE A LAISSE OUVERT.
 *
 * ⛔ Trois questions, et aucune ne se repond par un commentaire du depot :
 *    1. le taux du hook V8 est-il VRAIMENT 0,5 % ? (le commentaire le dit ; la chaine decide)
 *    2. les 2 `Transfer` TBLOCK vers le wallet sont-ils de vraies entrees ? Un evenement n est pas
 *       une transaction : des contrats de spam emettent des `Transfer` nommant des adresses qui
 *       n ont rien signe. On va chercher la tx.
 *    3. nos marches ont-ils le moindre VOLUME ? 9 pools ouvertes ne valent rien si personne
 *       n echange dedans.
 *
 * ⛔ AUCUN SELECTEUR NI TOPIC TAPE DE MEMOIRE : tout est calcule par `keccak.js` du depot, ou
 *    importe de `achats.js`. Completer un identifiant de memoire a deja coute cher ici.
 */
import { FEE_WALLET } from './frais-creation.js';
import { TBLOCK, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8, HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4 } from './tokenomics.js';
import { selecteur } from './keccak.js';
import { TOPIC_SWAP, decoderSwap } from './achats.js';

const RPC = 'https://mainnet.base.org';
const FENETRE = 2000;
const PM_V4 = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TOPIC_INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const hex = (n) => '0x' + n.toString(16);
const mot = (a) => '0x' + String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');

let appels = 0;
async function rpc(methode, params) {
  for (let e = 0; e < 4; e++) {
    try {
      appels++;
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: appels, method: methode, params }) });
      if (r.status === 429) { await new Promise((k) => setTimeout(k, 800 * 2 ** e)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (err) { if (e === 3) throw err; await new Promise((k) => setTimeout(k, 500 * 2 ** e)); }
  }
}
async function balayer(filtre, de, a, quoi) {
  const logs = []; let lues = 0, ratees = 0;
  const attendues = Math.ceil((a - de + 1) / FENETRE);
  for (let d = de; d <= a; d += FENETRE) {
    const f = Math.min(a, d + FENETRE - 1);
    try {
      const o = await rpc('eth_getLogs', [{ ...filtre, fromBlock: hex(d), toBlock: hex(f) }]);
      if (!Array.isArray(o)) { ratees++; continue; }
      logs.push(...o); lues++;
    } catch (_) { ratees++; }
    if (lues && lues % 40 === 0) process.stdout.write('\r    ' + quoi + ' ' + lues + '/' + attendues + '…    ');
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  return { logs, lues, ratees, attendues };
}

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const debut = tete - Math.floor((14 * 24 * 3600) / 2);
console.log('═══ SUITE — tete ' + tete + ' ═══\n');

/* ---------- 1. LE TAUX REEL DU HOOK, LU SUR LA CHAINE ---------------------- */
console.log('── 1 · le taux des hooks, LU sur la chaine (pas dans un commentaire) ──');
const SEL_FEE = selecteur('HOOK_FEE()');
console.log('  selecteur HOOK_FEE() calcule par keccak.js : ' + SEL_FEE);
for (const [nom, adr] of [['V5', HOOK_V5], ['V6', HOOK_V6], ['V7', HOOK_V7], ['V8', HOOK_V8]]) {
  try {
    const r = await rpc('eth_call', [{ to: adr, data: SEL_FEE }, 'latest']);
    if (!r || r === '0x') { console.log('  ' + nom + ' : pas de reponse (fonction absente)'); continue; }
    const v = Number(BigInt(r));
    console.log('  ' + nom.padEnd(4) + ' HOOK_FEE = ' + v + ' / 1e6 = ' + (v / 1e6 * 100).toFixed(3) + ' %');
  } catch (e) { console.log('  ' + nom + ' : ' + String(e.message).slice(0, 50)); }
}

/* ---------- 2. LES DEUX TRANSFERTS TBLOCK, PROUVES PAR LEUR TX ------------- */
console.log('\n── 2 · les 2 Transfer TBLOCK vers le wallet : vrais ou forges ? ──');
const tb = await balayer({ address: TBLOCK, topics: [TOPIC_TRANSFER, null, mot(FEE_WALLET)] }, debut, tete, 'TBLOCK');
console.log('  evenements : ' + tb.logs.length + ' (fenetres ' + tb.lues + '/' + tb.attendues + ', ratees ' + tb.ratees + ')');
for (const l of tb.logs) {
  const tx = await rpc('eth_getTransactionByHash', [l.transactionHash]);
  const rec = await rpc('eth_getTransactionReceipt', [l.transactionHash]);
  const emetteur = '0x' + String(l.topics[1]).slice(26);
  const montant = Number(BigInt(l.data)) / 1e18;
  console.log('  · ' + l.transactionHash.slice(0, 18) + '…  bloc ' + parseInt(l.blockNumber, 16));
  console.log('      emetteur annonce par l EVENEMENT : ' + emetteur);
  console.log('      tx.from REEL                     : ' + (tx ? tx.from : '⛔ TX INTROUVABLE'));
  console.log('      tx.to                            : ' + (tx ? tx.to : '—'));
  console.log('      statut du recu                   : ' + (rec ? rec.status : '—')
    + (rec && rec.status === '0x1' ? '  ✅ reussie' : '  ⛔ ECHOUEE — ne compte pas'));
  console.log('      montant                          : ' + montant.toFixed(6) + ' TBLOCK');
  console.log('      ⇒ ' + (tx && rec && rec.status === '0x1'
    ? 'transaction REELLE et reussie'
    : '⛔ a ne PAS compter comme une entree'));
}

/* ---------- 3. NOS POOLS ONT-ELLES DU VOLUME ? ---------------------------- */
console.log('\n── 3 · nos marches ont-ils le moindre echange ? ──');
const NOTRES = new Set([HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8]
  .map((h) => h.toLowerCase()));
const init = await balayer({ address: PM_V4, topics: [TOPIC_INITIALIZE] }, debut, tete, 'Initialize');
const nosPools = [];
for (const l of init.logs) {
  const d = String(l.data || '').replace(/^0x/, '');
  if (d.length < 5 * 64) continue;
  const h = '0x' + d.slice(2 * 64 + 24, 3 * 64);
  if (NOTRES.has(h)) nosPools.push({ id: l.topics[1], hook: h, bloc: parseInt(l.blockNumber, 16) });
}
console.log('  Initialize lus : ' + init.logs.length + ' (fenetres ' + init.lues + '/' + init.attendues
  + ', ratees ' + init.ratees + ') · dont a NOUS : ' + nosPools.length);
if (!nosPools.length) { console.log('  ⛔ aucune pool a nous dans la fenetre — rien a mesurer.'); process.exit(0); }

/* ⛔ `poolId` est le topic[1] de Swap : on peut filtrer dessus, contrairement a `hooks`. */
const ids = nosPools.map((p) => p.id);
const sw = await balayer({ address: PM_V4, topics: [TOPIC_SWAP, ids] }, debut, tete, 'Swap');
console.log('  Swap sur NOS pools : ' + sw.logs.length
  + ' (fenetres ' + sw.lues + '/' + sw.attendues + ', ratees ' + sw.ratees + ')');
const parPool = new Map();
let lisibles = 0;
for (const l of sw.logs) {
  const s = decoderSwap(l);
  if (!s || s.erreur) continue;
  lisibles++;
  parPool.set(s.poolId, (parPool.get(s.poolId) || 0) + 1);
}
console.log('  dont decodables : ' + lisibles);
for (const p of nosPools) {
  const n = parPool.get(String(p.id).toLowerCase()) || parPool.get(p.id) || 0;
  console.log('    pool ' + String(p.id).slice(0, 14) + '…  bloc ' + p.bloc + '  hook ' + p.hook.slice(0, 10)
    + '…  ' + n + ' swap(s)');
}
const total = [...parPool.values()].reduce((a, b) => a + b, 0);
console.log('  ⇒ TOTAL des echanges sur nos marches, 14 j : ' + total
  + (init.ratees || sw.ratees ? '   ⛔ fenetres ratees : ce total est un MINIMUM' : '   (toutes fenetres lues)'));

console.log('\n═══ ' + appels + ' appels RPC ═══');
