/* mesure-cache-factory.mjs — POURQUOI 79 BALAYAGES DE LA FACTORY A CHAQUE CHARGEMENT ?
 *
 * ⛔ L HYPOTHESE, ET ELLE PEUT ETRE FAUSSE. `rpc()` ne PERSISTE un resultat de `eth_getLogs` que
 *    si `res.length <= 20` (app.html, ligne ~2692). Entre 21 et 300 il ne vit qu en memoire, donc
 *    il MEURT au rechargement. Si la plupart des fenetres de la factory rendent plus de 20 logs,
 *    le cache ne peut rien retenir et tout est relu a chaque visite — pour un historique qui,
 *    lui, ne change JAMAIS.
 *
 * ⛔ CE QUE CETTE SONDE PROUVE : la distribution reelle du nombre de logs par fenetre.
 * ⛔ CE QU ELLE NE PROUVE PAS : que le cache est le SEUL coupable. `rpcCleLogs` refuse aussi de
 *    mettre en cache toute fenetre dont `toBlock > tete - 32` — une fenetre recente n est jamais
 *    gardee, et c est VOULU (une reorg la rendrait fausse). Cette sonde compte donc les deux
 *    causes separement au lieu d en accuser une.
 */
import { readFileSync } from 'node:fs';
const FACTORY = '0xb20f000000000000000000000000000000000000';
const RPC = 'https://mainnet.base.org';

/* ⛔ LES DEUX CONSTANTES SONT LUES DANS LES FICHIERS LIVRES, jamais retapees : si elles changent,
 *    cette mesure doit changer avec elles ou se taire. */
const src = readFileSync(new URL('./index-blocks.js', import.meta.url), 'utf8');
const mF = src.match(/FENETRE_MAX\s*=\s*(\d+)/);
const FENETRE = mF ? Number(mF[1]) : null;
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const mP = html.match(/res\.length <= (\d+)\) \{ rpcImmuable\.set\('l:'/);
const PLAFOND_PERSISTE = mP ? Number(mP[1]) : null;
const mM = html.match(/res\.length <= (\d+)\) \{ rpcLogs\.set/);
const PLAFOND_MEMOIRE = mM ? Number(mM[1]) : null;
if (!FENETRE || !PLAFOND_PERSISTE || !PLAFOND_MEMOIRE) {
  console.error('⛔ constantes introuvables — la sonde se tait plutot que de deviner');
  process.exit(1);
}
console.log('constantes LUES dans le code livre :');
console.log('  FENETRE_MAX (index-blocks.js)          = ' + FENETRE);
console.log('  plafond de PERSISTANCE (app.html)      = ' + PLAFOND_PERSISTE + ' logs');
console.log('  plafond de MEMOIRE seule (app.html)    = ' + PLAFOND_MEMOIRE + ' logs\n');

let appels = 0;
async function rpc(m, p) {
  for (let e = 0; e < 4; e++) {
    try {
      appels++;
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: appels, method: m, params: p }) });
      if (r.status === 429) { await new Promise((k) => setTimeout(k, 800 * 2 ** e)); continue; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message);
      return j.result;
    } catch (err) { if (e === 3) throw err; await new Promise((k) => setTimeout(k, 500 * 2 ** e)); }
  }
}
const hex = (n) => '0x' + n.toString(16);

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
const N = 79;                                  /* le nombre de fenetres observe en production */
const debut = Math.floor((tete - N * FENETRE) / FENETRE) * FENETRE;
console.log('tete ' + tete + ' · ' + N + ' fenetres de ' + FENETRE + ' blocs, a partir de ' + debut + '\n');

const comptes = [];
let ratees = 0;
for (let i = 0; i < N; i++) {
  const bas = debut + i * FENETRE;
  const haut = bas + FENETRE - 1;
  try {
    const logs = await rpc('eth_getLogs', [{ address: FACTORY, fromBlock: hex(bas), toBlock: hex(haut) }]);
    if (!Array.isArray(logs)) { ratees++; continue; }
    comptes.push({ bas, haut, n: logs.length, recente: haut > tete - 32 });
  } catch (_) { ratees++; }
  if (i % 20 === 19) process.stdout.write('\r  ' + (i + 1) + '/' + N + ' fenetres…   ');
}
process.stdout.write('\r' + ' '.repeat(50) + '\r');

/* ⛔ SANS CE COMPTE, UN « 0 fenetre trop grosse » NE SE DISTINGUE PAS DE « je n ai pas regarde ». */
console.log('fenetres lues : ' + comptes.length + '/' + N + ' · ratees : ' + ratees
  + (ratees ? '   ⛔ toute conclusion ci-dessous est un MINIMUM' : '   ✅'));
if (!comptes.length) { console.log('⛔ rien lu — sonde morte'); process.exit(1); }

const persistables = comptes.filter((c) => c.n <= PLAFOND_PERSISTE && !c.recente);
const memoireSeule = comptes.filter((c) => c.n > PLAFOND_PERSISTE && c.n <= PLAFOND_MEMOIRE);
const horsCache = comptes.filter((c) => c.n > PLAFOND_MEMOIRE);
const recentes = comptes.filter((c) => c.recente);
const vides = comptes.filter((c) => c.n === 0);
const total = comptes.reduce((s, c) => s + c.n, 0);

console.log('\n── la distribution ──');
console.log('  logs au total sur la plage      : ' + total);
console.log('  fenetres VIDES (0 log)          : ' + vides.length);
console.log('  max de logs dans une fenetre    : ' + Math.max(...comptes.map((c) => c.n)));
console.log('\n── ce que le cache peut retenir ──');
console.log('  PERSISTEES (<= ' + PLAFOND_PERSISTE + ' logs)      : ' + persistables.length
  + '  (' + Math.round(persistables.length / comptes.length * 100) + ' %)  ✅ survivent au rechargement');
console.log('  memoire seule (' + (PLAFOND_PERSISTE + 1) + '-' + PLAFOND_MEMOIRE + ' logs)   : ' + memoireSeule.length
  + '  (' + Math.round(memoireSeule.length / comptes.length * 100) + ' %)  ⛔ MEURENT au rechargement');
console.log('  jamais gardees (> ' + PLAFOND_MEMOIRE + ' logs)  : ' + horsCache.length);
console.log('  recentes, non cachables (reorg) : ' + recentes.length + '  (voulu)');

console.log('\n── VERDICT ──');
if (memoireSeule.length + horsCache.length === 0) {
  console.log('  ⛔ L HYPOTHESE EST FAUSSE : toutes les fenetres non recentes sont persistables.');
  console.log('     Le plafond de 20 n explique PAS les 79 relectures — chercher ailleurs.');
} else {
  console.log('  Le plafond de ' + PLAFOND_PERSISTE + ' logs empeche de persister '
    + (memoireSeule.length + horsCache.length) + ' fenetre(s) sur ' + comptes.length + '.');
  console.log('  Mais ' + persistables.length + ' fenetre(s) SONT persistables et devraient survivre :');
  console.log('  ⇒ si la production en relit 79 a chaque fois, le plafond n explique au mieux qu une');
  console.log('    PARTIE du probleme. Ne pas s arreter a la premiere cause qui arrange.');
}
console.log('\n' + appels + ' appels RPC.');
