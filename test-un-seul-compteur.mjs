/* test-un-seul-compteur.mjs — LE BOUTON ET LA LISTE COMPTENT LA MEME CHOSE.
 *
 * ⛔⛔ LE DEFAUT (capture de Phil, 2026-09-23). Sous une liste numerotee « Signature 1 … 4 », le
 *     bouton disait « Approval 1 of 3 — Allow Permit2 to move this block ». Quatre erreurs dans
 *     une ligne :
 *       1. « Approval » est FAUX pour une partie des etapes. `plan.etapes` melange des
 *          approbations (`value: '0x0'`) et une etape PAYANTE — « Register on V8 — 0.0003 ETH ».
 *          Une approbation ne coute que du gas. Annoncer « approbation » avant un envoi d ETH
 *          prepare le lecteur a signer autre chose que ce qu on lui a dit.
 *       2. Le total ignorait la transaction finale : la liste montre N+1, le bouton disait N.
 *       3. Le `1` etait ECRIT EN DUR, et `etapes` retrecit a chaque signature : on lisait
 *          « 1 of 3 », « 1 of 2 », « 1 of 1 » — un compteur qui n avance jamais.
 *       4. Quand une ligne de frais ouvre la liste, `etapes[0]` est la Signature 2. Le bouton
 *          annoncait « 1 » pour la ligne « 2 » — c est exactement ce que montre la capture.
 *
 * ⛔ CE QUE CE TEST PROUVE : que le code livre calcule le rang depuis LA MEME liste que l affichage,
 *    et qu aucune etape payante n est plus appelee « approval ».
 * ⛔ CE QU IL NE PROUVE PAS : le rendu. Il lit la source, pas l ecran — un `peindrePlan` complet
 *    demanderait un DOM. Le rang a ete verifie a la main sur la capture ; ceci empeche la
 *    divergence de revenir sans qu on la voie.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ LA GARDE S ACCUSE D ABORD : si la fonction a ete renommee, tout ce qui suit passerait sur du
 *    vide. C est le vert qui a deja fait passer un site mort pour deploye. */
const d = html.indexOf('function peindrePlan(');
assert.ok(d > 0, 'peindrePlan introuvable — cette garde ne protege plus rien');
const bloc = html.slice(d, d + 12000);
assert.ok(bloc.includes('txsApercu'), 'txsApercu absent de peindrePlan — extraction ratee');

v('le bouton ne dit plus « Approval N of M »', () => {
  /* ⛔ Le mot reste legitime dans une PHRASE explicative (« Review approvals first ») : ce qu on
   *    interdit, c est le COMPTEUR — « Approval <chiffre> of ». */
  assert.doesNotMatch(bloc, /'Approval \d+ of '/,
    'le compteur « Approval N of » est revenu : il nomme « approbation » une etape qui peut payer');
});

v('le rang vient de la MEME liste que l affichage', () => {
  assert.match(bloc, /const signaturesVisibles = txsApercu\.filter\(Boolean\);/,
    'le bouton ne lit plus la liste affichee');
  assert.match(bloc, /signaturesVisibles\.indexOf\(etape\) \+ 1/,
    'le rang n est plus calcule depuis la position reelle de l etape');
  assert.match(bloc, /'Signature ' \+ rang \+ ' of ' \+ signaturesVisibles\.length/,
    'le bouton ne compte plus la meme chose que la liste');
});

v('aucun numero n est invente quand le rang est introuvable', () => {
  /* ⛔ `nan-walks-through-every-bound` : `indexOf` rend -1, donc rang = 0. Sans branche, on
   *    afficherait « Signature 0 of 4 ». Un numero faux est pire que pas de numero. */
  assert.match(bloc, /rang > 0 \? 'Signature '/,
    'le cas « rang introuvable » n a pas sa branche : un 0 partirait a l ecran');
  assert.match(bloc, /'Next signature/,
    'le repli sans numero a disparu');
});

v('la liste, elle, numerote toujours depuis la meme source', () => {
  assert.match(bloc, /txsApercu\.filter\(Boolean\)\.map\(\(tx, k\) =>/,
    'la liste ne parcourt plus txsApercu');
  /* ⛔ LE MOTIF N EXIGE PAS L APOSTROPHE OUVRANTE : le code ecrit `'<li><b>Signature ' + (k + 1)`,
   *    donc la chaine commence par le balisage. Mon premier motif demandait `'Signature '` et
   *    rougissait sur du code correct — un motif trop precis accuse la forme au lieu du fond. */
  assert.match(bloc, /Signature ' \+ \(k \+ 1\)/, 'la liste ne numerote plus ses lignes');
});

v('la progression ne compte plus des « approvals » qui paient', () => {
  assert.doesNotMatch(html, /' approval'\s*\n?\s*\+ \(plan\.etapes\.length > 1 \? 's' : ''\)/,
    'la ligne de progression appelle encore « approval » des etapes payantes');
  assert.match(html, /' signature'/, 'la ligne de progression ne dit plus « signature »');
});

/* ⛔ TEMOIN SUR LE CODE QUI FABRIQUE LE MELANGE : si un jour `etapes` ne contenait plus que des
 *    approbations, ce test deviendrait inutile — et il doit le DIRE, pas rester vert en silence. */
v('etapes contient bien encore une etape payante (sinon ce test ne sert plus)', () => {
  assert.match(html, /payant: true/,
    '`etapes` n a plus d etape payante : le melange a disparu, revoir si ce test a encore un objet');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok un-seul-compteur — ' + n + ' cas : le bouton et la liste comptent la meme chose');
