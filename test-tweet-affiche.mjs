/* test-tweet-affiche.mjs — LE POST GRAVE EST MONTRE, AVEC SA RESERVE.
 *
 * ⛔⛔ LE DEFAUT (Phil, 2026-09-23 : « je vois pas le block associe au post sur X »).
 *     `face.js` VALIDE le champ `tweet` et le STOCKE, Create l ECRIT dans la face gravee, et le
 *     lien part sur la chaine avec le block. Rien ne le relisait jamais pour l afficher.
 *     ⇒ Une valeur ECRITE SUR LA CHAINE PUIS JAMAIS RENDUE est un defaut : elle a coute du gas et
 *       n informe personne. C est le jumeau de « une valeur LUE puis JETEE ».
 *
 * ⛔ CE QUE CE TEST EXIGE, ET POURQUOI CHAQUE POINT :
 *    · le lien est REVALIDE a l affichage, a la forme canonique EXACTE. Il a deja ete valide a la
 *      gravure, mais il peut revenir du stockage local d une autre version, et
 *      `javascript://x.com/jack/status/20` passe un controle d HOTE. La garde appartient la ou le
 *      lien devient CLIQUABLE — `ssrf-guard-must-run-per-hop` ;
 *    · la reserve voyage AVEC le lien : on n a jamais ouvert ce post. Le montrer sans le dire
 *      fabriquerait une association qu on n a pas mesuree ;
 *    · une face illisible ne montre RIEN — elle n invente pas de lien.
 * ⛔ CE QU IL NE PROUVE PAS : que le post existe ni qu il appartienne au createur. Personne ici ne
 *    le verifie, et c est precisement ce que la phrase affichee reconnait.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('la page porte l element qui recoit le lien', () => {
  assert.match(html, /<p class="note" id="pTweet" hidden><\/p>/,
    'l element #pTweet a disparu : le lien grave redeviendrait invisible');
});

const d = html.indexOf("const elTweet = $('#pTweet');");
assert.ok(d > 0, 'le rendu du post grave est introuvable');
const src = html.slice(d, d + 1800);

v('le lien est relu depuis la FACE, pas reconstruit', () => {
  assert.match(src, /faceConnue\(adr\)/, 'le rendu ne lit plus la face gravee');
  assert.match(src, /f\.tweet/, 'le champ grave n est plus lu');
});

v('le lien est REVALIDE a la forme canonique avant de devenir cliquable', () => {
  assert.match(src, /\^https:\\\/\\\/x\\\.com\\\/\[A-Za-z0-9_\]\{1,15\}\\\/status\\\/\\d\{1,25\}\$/,
    'la revalidation a disparu : un javascript: deguise passerait un controle d hote');
});

v('le lien s ouvre sans donner la main a la page cible', () => {
  assert.match(src, /a\.rel = 'noopener noreferrer';/, 'rel noopener a disparu');
  assert.match(src, /a\.target = '_blank';/, 'le post remplacerait l app dans l onglet');
});

v('la reserve est affichee AVEC le lien, jamais separee', () => {
  assert.match(src, /We never opened it/,
    'la reserve a disparu : montrer le lien deviendrait une affirmation d appartenance');
  assert.match(src, /cannot be changed/, 'le caractere definitif de la gravure n est plus dit');
});

v('une face illisible ne montre RIEN', () => {
  /* ⛔ `neutral-return-swallows-failure` a l envers : un `catch` qui laisserait l element visible
   *    afficherait un lien d un autre block, ou un reste du precedent. */
  assert.match(src, /elTweet\.innerHTML = '';/, 'l element n est plus vide avant chaque rendu');
  assert.match(src, /elTweet\.hidden = true;/, 'l element n est plus cache avant chaque rendu');
  assert.match(src, /catch \(_\)/, 'une face illisible ferait planter le rendu du profil');
});

/* ⛔⛔ ET LE MARQUEUR 🟦 EST PARTI DE NOS CREATIONS (Phil, 2026-09-23 : « retire les carres bleus
 *     de nos creations »). Il datait du 2026-09-13. Quatre endroits le posaient : l etiquette de
 *     la map, les puces par palier, le nom dans le fil Live, et la ligne des preuves.
 *     ⚠️ MA PREMIERE RECHERCHE EN A RATE UN : mon extrait coupait les lignes a 110 caracteres, et
 *        `l.nous ? '🟦 '` vivait au-dela. Retrouve par un balayage ligne par ligne, sans fenetre —
 *        troisieme fois aujourd hui qu une fenetre de contexte me cache un resultat.
 *     ⛔ CE QUI RESTE ET QUI FAIT LE TRAVAIL : `h.nous` et la classe CSS `nous`. Le classement en
 *       tete ne dependait PAS de l emoji — rien ne relisait le marqueur. */
v('aucun marqueur 🟦 sur nos creations', () => {
  const ecran = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(ecran.length < html.length, 'depouillement sans effet — temoin casse');
  assert.doesNotMatch(ecran, /l\.nous \? '🟦/, 'le marqueur est revenu dans le fil Live');
  assert.doesNotMatch(ecran, /estANous\([^)]*\) \? '🟦/, 'le marqueur est revenu sur les noms');
  assert.doesNotMatch(ecran, /startsWith\('🟦'\)/, 'le marqueur est revenu sur l etiquette de la map');
  assert.doesNotMatch(ecran, /\+ '🟦 ' \+ enTexte/, 'le marqueur est revenu sur les puces par palier');
});

v('la distinction « nos blocks » survit dans les DONNEES', () => {
  /* ⛔ On retire un SIGNE, pas une distinction. Si `h.nous` partait avec l emoji, nos blocks
   *    perdraient leur place en tete — c est deja arrive une fois, SANS ERREUR. */
  assert.match(html, /h\.nous = true;/, 'la marque « a nous » a disparu des donnees');
  assert.match(html, /classList\.add\('nous'\)/, 'la classe CSS qui met en avant a disparu');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok tweet-affiche — ' + n + ' cas : le post grave est montre, les carres bleus sont partis');
