/* mesure-qui-encaisse.mjs — LE HOOK V8 VERSE-T-IL VRAIMENT A a6cf ?
 *
 * ⛔ PHIL, PLUSIEURS FOIS : « fees wallet toujours pas corrige ». L adresse est bien la bonne dans
 *    le code (`FEE_WALLET` = celle qu il colle). Mais PERSONNE N A JAMAIS LU A QUI LE CONTRAT
 *    VERSE. Un frais preleve par le hook va ou le HOOK a decide, pas ou l app l ecrit.
 *
 * CE QU ON FAIT : on interroge le hook V8 sur les noms de fonction les plus probables, et on
 * compare la reponse a `FEE_WALLET`.
 * ⛔ AUCUN SELECTEUR TAPE DE MEMOIRE : tous sont calcules par `keccak.js` du depot.
 * ⛔ « NON LISIBLE » N EST PAS « MAUVAIS » : si le contrat n expose aucun de ces noms, on le DIT.
 *    Conclure « il ne paie pas a6cf » sur une fonction absente serait inventer une mesure.
 */
import { FEE_WALLET } from './frais-creation.js';
import { HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';
import { selecteur } from './keccak.js';

const RPC = 'https://mainnet.base.org';
async function rpc(m, p) {
  for (let e = 0; e < 4; e++) {
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) });
      if (r.status === 429) { await new Promise((k) => setTimeout(k, 600 * 2 ** e)); continue; }
      const j = await r.json();
      if (j.error) return { erreur: j.error.message };
      return { ok: j.result };
    } catch (err) { if (e === 3) return { erreur: String(err.message || err) }; }
  }
  return { erreur: 'illisible' };
}

/* les noms qu un contrat de frais porte le plus souvent */
const NOMS = ['FEE_WALLET()', 'feeWallet()', 'treasury()', 'TREASURY()', 'feeRecipient()',
  'recipient()', 'owner()', 'beneficiary()', 'devWallet()', 'collector()', 'sink()'];

const attendu = String(FEE_WALLET).toLowerCase();
console.log('═══ A QUI LE HOOK VERSE-T-IL ? ═══');
console.log('attendu (FEE_WALLET du code) : ' + attendu + '\n');

const HOOKS = [['V8 (courant)', HOOK_V8], ['V7', HOOK_V7], ['V6', HOOK_V6], ['V5', HOOK_V5]];
for (const [nom, adr] of HOOKS) {
  const code = await rpc('eth_getCode', [adr, 'latest']);
  /* ⛔⛔ TROIS ETATS, JAMAIS DEUX — et ma premiere version n en avait que deux. Elle ecrivait
   *     « aucun code a cette adresse » des que `code.ok` etait absent, c est-a-dire AUSSI quand la
   *     lecture avait ECHOUE. Resultat : elle a annonce V5, V6 et V7 sans code, alors que je les
   *     avais lus AVEC leur bytecode le matin meme. Un contrat ne disparait pas ; une lecture,
   *     si. Confondre les deux, c est `absence-of-evidence-vs-failure-to-look`. */
  if (code.erreur) { console.log(nom + ' : ⛔ LECTURE ECHOUEE (' + code.erreur.slice(0, 60) + ') — on ne conclut rien'); continue; }
  if (!code.ok) { console.log(nom + ' : ⛔ reponse vide du noeud — on ne conclut rien'); continue; }
  if (code.ok.length <= 4) { console.log(nom + ' : aucun code a cette adresse (lecture reussie)'); continue; }
  console.log(nom + '  ' + adr);
  let trouve = 0;
  for (const n of NOMS) {
    const sel = selecteur(n);
    const r = await rpc('eth_call', [{ to: adr, data: sel }, 'latest']);
    if (r.erreur || !r.ok || r.ok === '0x' || r.ok.length < 66) continue;
    /* une adresse tient dans les 20 derniers octets du mot */
    const val = '0x' + r.ok.slice(-40);
    if (!/^0x[0-9a-f]{40}$/i.test(val) || /^0x0{40}$/.test(val)) continue;
    trouve++;
    const bon = val.toLowerCase() === attendu;
    console.log('   ' + n.padEnd(16) + ' -> ' + val + (bon ? '   ✅ C EST BIEN a6cf' : '   ⛔ CE N EST PAS a6cf'));
  }
  if (!trouve) {
    console.log('   ⛔ aucun de ces ' + NOMS.length + ' noms n est expose par ce contrat.');
    console.log('      ⚠️ Ca ne veut PAS dire qu il ne paie pas a6cf : ca veut dire qu on ne peut pas');
    console.log('         le lire par ce chemin. Inventer une conclusion ici serait pire que ne rien dire.');
  }
  console.log('');
}
console.log('⛔ CE QUE CETTE SONDE NE PEUT PAS FAIRE : prouver ou part l argent d un swap. Seul un');
console.log('   swap reel, decode, le dirait — et ca demande une signature que je ne donne pas.');
