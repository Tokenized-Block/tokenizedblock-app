/* test-paire-toshi-et-decouverte.mjs — TOUT ACTIF PEUT DEVENIR UN BLOCK, DONC TOUT BLOCK PEUT PAIRER.
 *
 * ⛔⛔ TROIS CHOSES MESUREES LE 2026-09-27, ET TENUES ICI.
 *
 * 1. TBLOCK ETAIT ENCORE PROPOSE A LA CREATION. Il porte `lancePubliquement: false` depuis le
 *    2026-09-24 — decision de Phil appuyee par une mesure — et PERSONNE NE LISAIT LE DRAPEAU :
 *    `pairesProposees` ne filtrait que sur la chaine. Re-mesure : `/tokens/v1/base/0xb20000…272e`
 *    rend AUCUNE PAIRE. Proposer de coter un block en TBLOCK, c est promettre un marche qui
 *    n existe pas — et l acheteur ne l apprend qu apres avoir paye la naissance.
 *    ⛔ Le jeton RESTE dans `DEVISES_BASE` : d autres ecrans s en servent, et les blocks deja cotes
 *      en TBLOCK ne doivent pas perdre leur libelle. On filtre ce qu on PROPOSE, pas ce qu on CONNAIT.
 *
 * 2. TOSHI AJOUTE, ET *PAS* COMME UN B20. Adresse RESOLUE par API, jamais rappelee de memoire.
 *    Mesure avec temoin : TOSHI `eth_getCode` = 23 898 caracteres de bytecode ; TBLOCK = `0xef`
 *    exactement. TOSHI n a pas le prefixe `0xb2`. On ne l affichera jamais comme un B20.
 *    ⛔ Mais cette distinction est INTERNE : le produit rend n importe quel actif en block, donc
 *      coter un block en TOSHI est le concept, pas une exception a excuser dans un libelle.
 *
 * 3. LA PORTE DES PRIX S OUVRE AUX BLOCKS QU ON SUIT. Un registre grave de 14 entrees ne peut pas
 *    porter « tout block peut pairer » ; notre index en suit ~2 000, decouverts sur la chaine.
 *    ⛔ Mais `/api/prix-usd` RELAIE vers DexScreener : son filtre est une frontiere. `blocksConnus`
 *      n est pas une entree utilisateur — c est ce que NOTRE indexeur a lu.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un block decouvert ait un prix lisible. La garde est ailleurs et
 *   inchangee — on ne PROPOSE que ce dont le prix a ete LU.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pairesProposees, DEVISES_BASE } from './paires.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nuSrv = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const pai = readFileSync(new URL('./paires.js', import.meta.url), 'utf8');
const P = pairesProposees(8453);

cas('⛔⛔ TBLOCK n est plus PROPOSE, mais reste CONNU', () => {
  assert.ok(!P.some((x) => x.symbole === 'TBLOCK'),
    'TBLOCK est de nouveau propose a la creation : on promettrait un marche qui n existe pas, et '
    + 'l acheteur ne l apprendrait qu apres avoir paye la naissance');
  /* game354: KNOWN = the real TBLOCK under its name (the old test token is oldTBLOCK) */
  assert.ok(DEVISES_BASE.some((x) => x.symbole === 'TBLOCK' && String(x.adr).toLowerCase() === '0xb200000000000000000000ba9bf8330307f8830e'),
    'TBLOCK a ete SUPPRIME du registre : les blocks deja cotes en TBLOCK perdraient leur libelle. '
    + 'On filtre ce qu on propose, on ne supprime pas ce qu on connait');
  assert.ok(/d\.lancePubliquement !== false/.test(pai),
    'le drapeau `lancePubliquement` n est plus lu : il redeviendrait decoratif, ce qu il etait');
});

cas('⛔ TOSHI est propose, et JAMAIS etiquete B20', () => {
  const t = P.find((x) => x.symbole === 'TOSHI');
  assert.ok(t, 'TOSHI n est plus propose');
  assert.equal(t.type, 'MAJEUR',
    'TOSHI est type « ' + t.type + ' » : son `eth_getCode` fait 23 898 caracteres de bytecode, pas '
    + '`0xef` — l etiqueter B20 serait l usurpation que ce depot chasse');
  assert.ok(!/^0xb2/i.test(t.adr), 'TOSHI porte un prefixe 0xb2 : verifier l adresse, elle a change');
  /* ⛔ ET LE LIBELLE NE PARLE PAS DE B20 : cette distinction est interne. Un « not a B20 » dans un
   *   selecteur repond a une question que personne ne se pose et jette un doute sans objet. */
  assert.ok(!/B20/i.test(t.nom),
    'le libelle de TOSHI parle de B20 : la distinction est interne, elle n a rien a faire dans ce '
    + 'que l utilisateur lit');
});

cas('⛔⛔ la porte des prix s ouvre aux blocks SUIVIS, et a rien d autre', () => {
  assert.ok(/\|\| blocksConnus\.has\(adr\)/.test(nuSrv),
    'la porte ne s ouvre plus aux blocks que notre index suit : « tout block peut pairer » '
    + 'resterait un registre grave de 14 entrees');
  /* ⛔⛔ ET LE REGISTRE RESTE LA PREMIERE SOURCE : ETH, USDC, cbBTC et TOSHI ne sont PAS des B20,
   *     donc absents de `blocksConnus`. Les deux sources sont complementaires. */
  assert.ok(/pairesProposees\(8453\)\.some\(\(p\) => \['STABLE', 'MAJEUR', 'ACTION'\]/.test(nuSrv),
    'le registre a disparu de la porte : les devises non-B20 (USDC, cbBTC, TOSHI) deviendraient '
    + 'impossibles a priser');
});

cas('⛔ `blocksConnus` n accepte que des adresses valides — la garde est a l INSERTION', () => {
  /* ⛔ C EST CE QUI REND SUR d ouvrir la porte a ce Set : l appartenance EST la validation. Si la
   *   regex sautait a l insertion, une adresse arbitraire pourrait entrer et nous ferions proxy de
   *   prix pour n importe qui. */
  assert.ok(/if \(\/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(a\)\) blocksConnus\.add\(a\.toLowerCase\(\)\)/.test(nuSrv),
    'la validation a l insertion de `blocksConnus` a saute : la porte des prix accepterait des '
    + 'adresses arbitraires, et cet endpoint relaie vers DexScreener');
});

cas('⛔ temoin : le registre porte toujours les devises non-B20', () => {
  for (const s of ['ETH', 'USDC', 'cbBTC']) {
    assert.ok(P.some((x) => x.symbole === s), 'la devise « ' + s + ' » a disparu du registre');
  }
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok paire-toshi-et-decouverte — ' + n + ' cas.');
console.log('   TBLOCK n est plus propose mais reste connu ; TOSHI est propose sans etre dit B20 ;');
console.log('   et la porte des prix s ouvre aux ~2 000 blocks que notre index a lus sur la chaine.');
console.log('⚠️ NE PROUVE PAS qu un block decouvert ait un prix lisible — la garde « on ne propose');
console.log('   que ce dont le prix a ete LU » est ailleurs, et inchangee.');
