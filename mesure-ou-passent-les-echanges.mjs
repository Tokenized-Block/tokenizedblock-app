/* mesure-ou-passent-les-echanges.mjs — DEUX DECISIONS QUI ENGAGENT DE L ARGENT, PRISES SUR MESURE.
 *
 * ⛔ PHIL M A DELEGUE DEUX REGLES (2026-09-23, « fais au mieux ») :
 *    1. router vers « 50 % certain » ou vers « 0 % + prelevement de hook inconnu » ?
 *    2. au-dessus de quel taux refuser de preparer l achat ?
 *    On ne repond pas a ca par une opinion. On mesure OU les gens echangent vraiment.
 *
 * CE QU ON MESURE, 24 h, sur toutes les pools dont une devise est un block B20 :
 *   · la distribution des frais de pool, PONDEREE PAR LES ECHANGES (pas par le nombre de pools :
 *     une pool sans echange ne dit rien de ce que les gens acceptent) ;
 *   · la part des echanges qui se font sur une pool HOOKEE a 0 % de frais de pool.
 *
 * ⛔ CE QUE CA NE DIT PAS : ce que le hook preleve. Un hook peut prendre sa part sans l annoncer.
 *    Cette sonde separe donc « frais de POOL » et « prelevement du HOOK », et ne confond jamais
 *    « 0 % de pool » avec « gratuit ».
 */
import { FENETRE_MAX } from './index-blocks.js';
import { TOPIC_SWAP } from './achats.js';

const RPC = 'https://mainnet.base.org';
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const T_INIT = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const ZERO = '0x0000000000000000000000000000000000000000';
const DYN = 0x800000;

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
    if (lues % 15 === 0 && lues) process.stdout.write('\r  ' + quoi + ' ' + lues + '/' + attendues + '…    ');
  }
  process.stdout.write('\r' + ' '.repeat(60) + '\r');
  return { logs, lues, ratees, attendues };
}

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const debut = tete - Math.floor((24 * 3600) / 2);
console.log('═══ OU PASSENT VRAIMENT LES ECHANGES — 24 h ═══\n');

const init = await balayer({ address: PM, topics: [T_INIT] }, debut, tete, 'Initialize');
console.log('pools ouvertes : ' + init.logs.length + '  (fenetres ' + init.lues + '/' + init.attendues
  + ', ratees ' + init.ratees + ')' + (init.ratees ? '   ⛔ MINIMA' : '   ✅'));

const b20 = (x) => String(x || '').toLowerCase().startsWith('0xb20');
const pools = new Map();   /* poolId -> { fee, hook } */
for (const l of init.logs) {
  const c0 = '0x' + String(l.topics[2] || '').slice(26);
  const c1 = '0x' + String(l.topics[3] || '').slice(26);
  if (!b20(c0) && !b20(c1)) continue;
  const d = String(l.data || '').replace(/^0x/, '');
  if (d.length < 5 * 64) continue;
  pools.set(String(l.topics[1]).toLowerCase(),
    { fee: parseInt(d.slice(0, 64), 16), hook: '0x' + d.slice(2 * 64 + 24, 3 * 64) });
}
console.log('dont un block B20 : ' + pools.size + ' pool(s)\n');

/* ⛔ on balaye TOUS les Swap du PoolManager et on ne garde que nos poolIds : un filtre par lot de
 *    poolIds coute plus cher que de trier localement, et il plafonne a la taille du topic. */
const sw = await balayer({ address: PM, topics: [TOPIC_SWAP] }, debut, tete, 'Swap (tout Base)');
console.log('Swap lus sur Base : ' + sw.logs.length + '  (fenetres ' + sw.lues + '/' + sw.attendues
  + ', ratees ' + sw.ratees + ')' + (sw.ratees ? '   ⛔ MINIMA' : '   ✅'));

const parTranche = new Map();
const parHookZero = { hookZeroPool: 0, sansHook: 0, autre: 0 };
let echangesB20 = 0;
for (const l of sw.logs) {
  const id = String(l.topics[1] || '').toLowerCase();
  const p = pools.get(id);
  if (!p) continue;
  echangesB20++;
  const dyn = (p.fee & DYN) !== 0;
  const pc = dyn ? null : p.fee / 10000;
  const tranche = dyn ? 'dynamique (taux fixe au swap)'
    : pc === 0 ? '0 %'
      : pc <= 1 ? '0 – 1 %'
        : pc <= 5 ? '1 – 5 %'
          : pc <= 20 ? '5 – 20 %'
            : pc <= 50 ? '20 – 50 %'
              : 'plus de 50 %';
  parTranche.set(tranche, (parTranche.get(tranche) || 0) + 1);
  if (p.hook.toLowerCase() === ZERO) parHookZero.sansHook++;
  else if (!dyn && pc === 0) parHookZero.hookZeroPool++;
  else parHookZero.autre++;
}

console.log('\n── LES ECHANGES SUR DES BLOCKS B20 : ' + echangesB20 + ' ──');
console.log('   (repartition par frais de POOL, ponderee par ECHANGE)\n');
const ordre = ['0 %', '0 – 1 %', '1 – 5 %', '5 – 20 %', '20 – 50 %', 'plus de 50 %', 'dynamique (taux fixe au swap)'];
let cumul = 0;
for (const t of ordre) {
  const v = parTranche.get(t) || 0;
  if (!v) continue;
  cumul += v;
  const pct = echangesB20 ? (v / echangesB20 * 100) : 0;
  console.log('   ' + t.padEnd(30) + String(v).padStart(6) + '  ' + pct.toFixed(1).padStart(5) + ' %'
    + '   cumul ' + (echangesB20 ? (cumul / echangesB20 * 100).toFixed(1) : '0') + ' %');
}
console.log('\n── HOOKE OU NON ──');
console.log('   pool HOOKEE a 0 % de frais de pool : ' + parHookZero.hookZeroPool
  + '  (' + (echangesB20 ? (parHookZero.hookZeroPool / echangesB20 * 100).toFixed(1) : 0) + ' %)');
console.log('   pool SANS hook                     : ' + parHookZero.sansHook
  + '  (' + (echangesB20 ? (parHookZero.sansHook / echangesB20 * 100).toFixed(1) : 0) + ' %)');
console.log('   autres (hook + frais de pool > 0, ou dynamique) : ' + parHookZero.autre);
console.log('\n⛔ « 0 % de frais de pool » NE VEUT PAS DIRE GRATUIT : le hook peut prelever sans');
console.log('   l annoncer dans la PoolKey. Cette sonde mesure OU LES GENS VONT, pas ce qu ils paient.');
console.log('\n' + appels + ' appels RPC.');
