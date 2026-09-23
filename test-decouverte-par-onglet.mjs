/* test-decouverte-par-onglet.mjs — LA DECOUVERTE DES POOLS NE DOIT PAS DEPENDRE D UN SEUL ONGLET.
 *
 * ⛔⛔ LE DEFAUT, MESURE EN PRODUCTION LE 2026-09-23. `decouvrirPools` n etait appele que depuis
 *     `lireLive` — le lecteur du FEED. Sur un chargement froid allant DIRECTEMENT sur Blocks :
 *         0 bouton « Buy » sur 52 lignes, toutes en repli « Pair a block with it ».
 *     Apres un simple passage par le Feed : 32 « Buy » sur 50.
 *     Le bouton n etait pas casse : il etait INVISIBLE a qui n avait pas visite un autre onglet.
 *     ⇒ Et c est le coeur de l offre mise en avant le meme jour — « we read every pool of this
 *       block and route the cheapest ». Sans pools decouvertes, on ne lit rien et on ne route rien.
 *
 * ⛔ POURQUOI AUCUNE GARDE NE L A VU : toutes verifiaient que le BOUTON existe dans le code, pas
 *    qu il soit ATTEIGNABLE a l execution. Un chemin conditionne a une visite d onglet passe tous
 *    les controles de source. C est `guards-measured-transport-not-execution`, applique a la
 *    navigation.
 *
 * ⛔ CE QUE CE TEST PROUVE : que la decouverte est declenchee depuis AU MOINS DEUX chemins, et que
 *    celui de Trending existe, ne tourne qu une fois, et rouvre son droit de reessayer en cas
 *    d echec.
 * ⛔ CE QU IL NE PROUVE PAS : qu elle TROUVE des pools. Ca depend de la chaine, et c est verifie a
 *    la main en production — 0/52 avant, mesure apres deploiement.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
assert.ok(sansCommentaires.length < html.length, 'depouillement sans effet — temoin casse');

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('`decouvrirPools` est appele depuis au moins DEUX chemins', () => {
  /* ⛔ LE CONTROLE QUI PORTE TOUT : un seul appelant, et le defaut revient tel quel. On compte sur
   *    le code DEPOUILLE — sinon les commentaires qui racontent l histoire gonfleraient le compte
   *    et la garde se satisferait de sa propre documentation. */
  const appels = [...sansCommentaires.matchAll(/\bdecouvrirPools\s*\(/g)].length;
  assert.ok(appels >= 2,
    'decouvrirPools n a que ' + appels + ' appelant(s) : la decouverte redevient dependante d un '
    + 'seul onglet, et le bouton Buy disparait pour qui ne le visite pas');
});

v('le chemin Trending existe et part du rendu', () => {
  assert.match(sansCommentaires, /async function decouvrirPourTrending\(/,
    'le declencheur cote Trending a disparu');
  const d = sansCommentaires.indexOf('function peindreTrending(');
  assert.ok(d > 0, 'peindreTrending introuvable');
  const corps = sansCommentaires.slice(d, d + 400);
  assert.match(corps, /decouvrirPourTrending\(\)/,
    'peindreTrending ne declenche plus la decouverte : Blocks redevient muet au premier chargement');
});

v('il ne tourne QU UNE FOIS, et pas a chaque rendu', () => {
  /* ⛔ Sans ce garde-fou, chaque tri de colonne relancerait un balayage de 10 000 blocs. */
  assert.match(sansCommentaires, /let decouverteTrendingLancee = false;/, 'le verrou a disparu');
  const d = sansCommentaires.indexOf('async function decouvrirPourTrending(');
  const corps = sansCommentaires.slice(d, sansCommentaires.indexOf('\n}', d) + 2);
  assert.match(corps, /if \(decouverteTrendingLancee/, 'le verrou n est plus teste en entree');
  assert.match(corps, /poolsLive && poolsLive\.size/,
    'la condition « rien n a encore ete decouvert » a disparu : on rebalayerait meme avec des pools');
});

v('un ECHEC rouvre le droit de reessayer', () => {
  /* ⛔ `neutral-return-swallows-failure` : si le verrou restait pose apres une panne de lecture,
   *    l app conclurait « pas de marche » pour toute la session sur un simple 429. */
  const d = sansCommentaires.indexOf('async function decouvrirPourTrending(');
  const corps = sansCommentaires.slice(d, sansCommentaires.indexOf('\n}', d) + 2);
  const apresCatch = corps.slice(corps.indexOf('catch'));
  assert.match(apresCatch, /decouverteTrendingLancee = false/,
    'apres un echec le verrou reste pose : une panne de lecture vaudrait « aucune pool » pour toute la session');
});

v('le rendu n ATTEND pas la decouverte', () => {
  /* ⛔ `void` et pas `await` : un ecran vide pendant dix secondes serait pire que le repli. */
  const d = sansCommentaires.indexOf('function peindreTrending(');
  const corps = sansCommentaires.slice(d, d + 400);
  assert.match(corps, /void decouvrirPourTrending\(\)/,
    'le rendu attend la decouverte : la liste resterait vide pendant le balayage');
  assert.doesNotMatch(corps, /await decouvrirPourTrending\(\)/, 'le rendu est devenu bloquant');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok decouverte-par-onglet — ' + n + ' cas : la decouverte ne depend plus d un seul onglet');
