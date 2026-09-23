/* mesure-qui-tient-le-marche.mjs — QUI HOOKE LES BLOCKS B20, ET COMBIEN PRELEVE-T-IL ?
 *
 * ⛔ AVANT DE CHANGER L OFFRE, SAVOIR CE QUE LE MARCHE ACCEPTE DEJA. Mesure du 2026-09-23 :
 *    4 naissances sur 6 ouvrent leur marche DANS LA MEME TRANSACTION, sur une pool a 0,00 % de
 *    frais, hook `0x1f91c998…`. Notre offre — « paie 0,001 ETH pour ouvrir un marche » — s adresse
 *    a des gens qui en ont deja un. Ce n est pas un prix trop haut, c est une offre sans objet.
 *
 * CE QU ON MESURE, SUR 24 h :
 *   1. tous les hooks qui portent une pool dont une devise est un block B20 ;
 *   2. leur part (pools, et surtout ECHANGES — une pool sans echange ne pese rien) ;
 *   3. ce que chacun preleve, quand son contrat veut bien le dire.
 *
 * ⛔ CE QU ELLE NE PEUT PAS DIRE : le revenu d un concurrent. Lire `HOOK_FEE()` ne marche que si
 *    son ABI porte ce nom — sinon on rend « non lisible », jamais un zero. Un zero invente ici
 *    ferait croire a un concurrent gratuit.
 */
import { FENETRE_MAX } from './index-blocks.js';
import { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';
import { TOPIC_SWAP } from './achats.js';
import { selecteur } from './keccak.js';

const RPC = 'https://mainnet.base.org';
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const T_INIT = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const ZERO = '0x0000000000000000000000000000000000000000';
const NOTRES = new Set([HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8]
  .map((h) => h.toLowerCase()));

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
console.log('═══ QUI TIENT LE MARCHE DES BLOCKS — 24 h ═══\n');

const init = await balayer({ address: PM, topics: [T_INIT] }, debut, tete, 'Initialize');
console.log('pools ouvertes sur Base : ' + init.logs.length
  + '   (fenetres ' + init.lues + '/' + init.attendues + ', ratees ' + init.ratees + ')');
if (init.ratees) console.log('  ⛔ des fenetres ont ete ratees : tout ce qui suit est un MINIMUM.');

const b20 = (x) => String(x || '').toLowerCase().startsWith('0xb20');
const parHook = new Map();
for (const l of init.logs) {
  const c0 = '0x' + String(l.topics[2] || '').slice(26);
  const c1 = '0x' + String(l.topics[3] || '').slice(26);
  if (!b20(c0) && !b20(c1)) continue;
  const d = String(l.data || '').replace(/^0x/, '');
  if (d.length < 5 * 64) continue;
  const hook = '0x' + d.slice(2 * 64 + 24, 3 * 64);
  const fee = parseInt(d.slice(0, 64), 16);
  if (!parHook.has(hook)) parHook.set(hook, { pools: 0, ids: [], fees: new Set() });
  const e = parHook.get(hook);
  e.pools++; e.fees.add(fee);
  if (e.ids.length < 300) e.ids.push(l.topics[1]);
}
const total = [...parHook.values()].reduce((s, e) => s + e.pools, 0);
console.log('dont une devise est un block B20 : ' + total + '   ·   hooks distincts : ' + parHook.size + '\n');

const rangs = [...parHook].sort((a, b) => b[1].pools - a[1].pools).slice(0, 6);
console.log('── LES SIX PREMIERS, PAR NOMBRE DE POOLS ──');
const SEL_FEE = selecteur('HOOK_FEE()');
for (const [hook, e] of rangs) {
  const sw = await balayer({ address: PM, topics: [TOPIC_SWAP, e.ids] }, debut, tete, 'Swap ' + hook.slice(0, 8));
  let frais = 'non lisible';
  if (hook !== ZERO) {
    try {
      const r = await rpc('eth_call', [{ to: hook, data: SEL_FEE }, 'latest']);
      if (r && r !== '0x') frais = (Number(BigInt(r)) / 1e6 * 100).toFixed(3) + ' % (HOOK_FEE lu)';
    } catch (_) { /* ABI differente : on ne devine pas */ }
  }
  const nom = hook === ZERO ? 'AUCUN HOOK' : (NOTRES.has(hook) ? '⭐ NOUS' : hook.slice(0, 12) + '…');
  console.log('  ' + nom.padEnd(18) + e.pools + ' pool(s) · ' + sw.logs.length + ' echange(s)'
    + ' · frais de pool ' + [...e.fees].map((f) => (f / 10000).toFixed(2) + '%').slice(0, 3).join('/')
    + ' · hook : ' + frais
    + (sw.ratees ? '   ⛔ ' + sw.ratees + ' fenetre(s) ratee(s)' : ''));
}
console.log('\n⛔ « non lisible » ne veut PAS dire « gratuit » : ca veut dire que son contrat');
console.log('   n expose pas `HOOK_FEE()`. Inventer un zero ferait croire a un concurrent gratuit.');
console.log('\n' + appels + ' appels RPC.');
