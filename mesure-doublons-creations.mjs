/* mesure-doublons-creations.mjs — LES BLOCS PARTAGES CONTIENNENT-ILS DE VRAIS LOGS ?
 *
 * ⛔ LA MESURE PRECEDENTE COMPTAIT DES BORNES : 90 blocs lus deux fois. Ca ne dit PAS combien de
 *    creations sont comptees en double — un bloc partage peut etre vide. On va donc lire la
 *    chaine avec les DEUX motifs, sur la MEME plage, et comparer les logs obtenus.
 *
 * ⛔ CE QUI COMPTE COMME DOUBLON : un meme (transactionHash, logIndex) rendu deux fois. C est
 *    l identite d un log, pas son contenu — deux creations distinctes dans un meme bloc ne sont
 *    pas des doublons.
 * ⛔ ET ON VERIFIE QUE LES DEUX MOTIFS COUVRENT LA MEME CHOSE : si l aligne trouvait MOINS de logs
 *    distincts, il ne « corrigerait » rien, il perdrait des donnees. Un correctif qui ampute est
 *    pire que le defaut.
 */
/* ⛔ ON IMPORTE, ON NE REGEXE PAS. Premiere version de cette sonde : elle cherchait
 *    `TOPIC_CREATED = '0x…'` par expression reguliere et s est tue, parce que ce topic est
 *    CALCULE (`keccak256` de la signature), pas ecrit en dur. Lire un module a la main au lieu de
 *    l importer, c est se fabriquer une seconde source de verite qui divergera. */
import { FENETRE_MAX as F, FACTORY, TOPIC_CREATED as TOPIC } from './index-blocks.js';
if (!F || !FACTORY || !TOPIC) { console.error('⛔ constantes vides a l import — la sonde se tait'); process.exit(1); }
console.log('importes de index-blocks.js : FENETRE_MAX=' + F + ' · factory=' + FACTORY.slice(0, 10) + '… · topic=' + TOPIC.slice(0, 10) + '…\n');

const RPC = 'https://mainnet.base.org';
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
const BLOCS = F * 30;                        /* 30 fenetres : assez pour voir, pas assez pour couter */
const debut = tete - BLOCS;

function glissant() { const o = []; let bas = tete; while (bas > debut) { const haut = bas; bas = Math.max(debut, haut - F); o.push([bas, haut]); } return o; }
function aligne() { const o = []; let haut = tete; while (haut >= debut) { const bas = Math.max(debut, Math.floor(haut / F) * F); o.push([bas, haut]); haut = bas - 1; } return o; }

async function ramasser(fenetres, nom) {
  const tous = [];
  let ratees = 0;
  for (const [bas, haut] of fenetres) {
    try {
      const logs = await rpc('eth_getLogs', [{ fromBlock: hex(bas), toBlock: hex(haut), address: FACTORY, topics: [TOPIC] }]);
      if (!Array.isArray(logs)) { ratees++; continue; }
      for (const l of logs) tous.push(l.transactionHash + ':' + l.logIndex);
    } catch (_) { ratees++; }
  }
  const distincts = new Set(tous);
  return { nom, fenetres: fenetres.length, ratees, rendus: tous.length, distincts: distincts.size,
    doublons: tous.length - distincts.size, ensemble: distincts };
}

const g = await ramasser(glissant(), 'GLISSANT (livre)');
const a = await ramasser(aligne(), 'ALIGNE (canonique)');

for (const r of [g, a]) {
  console.log('── ' + r.nom + ' ──');
  console.log('  fenetres : ' + r.fenetres + ' · ratees : ' + r.ratees
    + (r.ratees ? '   ⛔ conclusions = minima' : '   ✅'));
  console.log('  logs RENDUS    : ' + r.rendus);
  console.log('  logs DISTINCTS : ' + r.distincts);
  console.log('  DOUBLONS       : ' + r.doublons + (r.doublons ? '   ⛔' : '   ✅'));
  console.log('');
}

/* ⛔ LE CONTROLE QUI COMPTE : l aligne ne doit RIEN PERDRE. */
const perdus = [...g.ensemble].filter((x) => !a.ensemble.has(x));
const gagnes = [...a.ensemble].filter((x) => !g.ensemble.has(x));
console.log('── couverture comparee ──');
console.log('  creations vues par le glissant et PAS par l aligne : ' + perdus.length
  + (perdus.length ? '   ⛔⛔ L ALIGNE PERD DES DONNEES — ne pas livrer' : '   ✅ aucune perte'));
console.log('  creations vues par l aligne et pas par le glissant : ' + gagnes.length);
console.log('\n' + appels + ' appels RPC.');
