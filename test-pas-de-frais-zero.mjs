/* test-pas-de-frais-zero.mjs — AUCUN CHEMIN N OFFRE NI N ACCEPTE UN MARCHE A 0 %.
 *
 * ⛔⛔ PHIL, 2026-09-23 : « evidemment tout le monde va prendre free, enleve-le, c est fini le free
 *     modele ». L option `0% (no fee, nobody earns)` vivait dans un `<select>`, pas dans un bouton
 *     — c est pour ca qu elle avait survecu au retrait du « free block » du 2026-09-19 : ce jour-la
 *     on avait cherche des BOUTONS. Une garde qui ne connait qu une forme d interface en laisse
 *     passer toutes les autres.
 *
 * ⛔ POURQUOI C EST PIRE QU UN SIMPLE MANQUE A GAGNER : le taux est grave dans la PoolKey. Un
 *    marche ouvert a 0 % ne rapporte JAMAIS rien, ni a son createur ni a nous, et aucune migration
 *    n existe — c est le piege ou sont enfermees les 5 pools du V1. Ce n etait pas une option bon
 *    marche, c etait une option morte.
 *
 * ⛔ DEUX GARDES, PAS UNE, ET C EST DELIBERE :
 *    1. l option a disparu de la LISTE ;
 *    2. le code REFUSE un 0 qui arriverait quand meme.
 *    Retirer une `<option>` ne ferme rien : un `select` garde la valeur d une session precedente,
 *    un outil de dev peut en poser une autre, et `Number('')` vaut 0. La garde appartient la ou la
 *    DECISION se prend, pas la ou le choix s affiche — [[ssrf-guard-must-run-per-hop]].
 *
 * ⛔ CE QU IL NE PEUT PAS PROUVER : que le contrat refuse un 0 % s il en recevait un. Il garde
 *    l APPEL, pas la chaine. Le jour ou un lancement 0 % serait signe ailleurs, rien ici ne le
 *    verrait.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔⛔ LES COMMENTAIRES SONT DEPOUILLES AVANT TOUT CONTROLE DE TEXTE A L ECRAN. Ce test a rougi sur
 *     SON PROPRE correctif : le commentaire qui explique le retrait cite « no fee, nobody earns »,
 *     et la garde l a lu comme si c etait affiche. Quatrieme fois en une journee que cette erreur
 *     se produit — sonde d id fantomes, deux verifications de prod, et maintenant ici. La regle
 *     est « pas a l ECRAN », jamais « pas dans le FICHIER » : un commentaire qui documente un
 *     retrait est la preuve du retrait, pas sa violation. */
const ecran = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
assert.ok(ecran.length < html.length, 'le depouillement des commentaires n a rien retire — temoin casse');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ LA GARDE S ACCUSE D ABORD : si le selecteur de frais a ete renomme, tous les controles
 *    ci-dessous passeraient sur du vide et rendraient un vert qui ne prouve rien. */
const bloc = html.match(/<select id="olFee">[\s\S]{0,400}?<\/select>/);
assert.ok(bloc, 'selecteur #olFee introuvable — cette garde ne protege plus rien');
assert.ok(bloc[0].includes('<option'), 'aucune option lue dans #olFee');

/* 1. L OPTION N EST PLUS OFFERTE. */
v('aucune option de valeur 0 dans #olFee', () => {
  assert.doesNotMatch(bloc[0], /<option[^>]*value="0"/, 'le choix 0 % est revenu dans la liste');
});
v('le texte « nobody earns » a disparu de l ecran', () => {
  assert.doesNotMatch(ecran, /nobody earns/i, 'la promesse d un marche gratuit est encore affichee');
});
v('il reste au moins deux taux payants proposes', () => {
  const opts = [...bloc[0].matchAll(/<option[^>]*value="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(opts.length >= 2, 'moins de deux taux : on a vide la liste au lieu de retirer le zero');
  assert.ok(opts.every((x) => x > 0), 'un taux nul subsiste : ' + JSON.stringify(opts));
});

/* 2. ⛔ ET LE CODE REFUSE UN ZERO QUI ARRIVERAIT QUAND MEME. C est la garde qui compte : la
 *    premiere ne protege que ce que l utilisateur VOIT. */
v('le lancement refuse un lpFee nul ou illisible', () => {
  assert.match(html, /const lpFee = Number\(\$\('#olFee'\)\.value\);/,
    'la valeur n est plus lue dans une variable gardee');
  assert.match(html, /!Number\.isFinite\(lpFee\)\s*\|\|\s*lpFee <= 0/,
    'le refus du 0 % a disparu du chemin de lancement');
});
v('le refus echoue FERME et dit pourquoi', () => {
  /* ⛔ un refus muet est un defaut : l utilisateur verrait un bouton sans effet et recommencerait. */
  const i = html.indexOf('!Number.isFinite(lpFee)');
  assert.ok(i > 0, 'refus introuvable');
  const suite = html.slice(i, i + 500);
  assert.match(suite, /wKo/, 'le refus ne passe pas l etat en erreur');
  assert.match(suite, /textContent\s*=/, 'le refus n ecrit aucune raison a l ecran');
  assert.match(suite, /\breturn;/, 'le refus ne s arrete pas — le lancement continuerait');
});
v('la valeur gardee est celle qui part au plan, pas une seconde lecture', () => {
  /* ⛔ MOTIF `canonical-helper-weaker-copy` : si l appelant relisait `$('#olFee').value` au lieu de
   *    reutiliser `lpFee`, la garde ne protegerait qu une variable que personne n emploie. */
  assert.match(html, /startTick: tickPourFdv\(Number\(\$\('#olFdv'\)\.value\)\), lpFee,/,
    'le plan ne consomme pas la valeur gardee');
  assert.doesNotMatch(html, /lpFee: Number\(\$\('#olFee'\)\.value\)/,
    'le plan relit la valeur brute et contourne la garde');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok pas-de-frais-zero — ' + n + ' cas : l option retiree ET le zero refuse au lancement');
