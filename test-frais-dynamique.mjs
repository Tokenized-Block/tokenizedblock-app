/* test-frais-dynamique.mjs — UN FRAIS DYNAMIQUE N EST NI UN NOMBRE, NI 838 %.
 *
 * ⛔⛔ LE DEFAUT, TROUVE PAR UNE MESURE DE MARCHE LE 2026-09-23. Une PoolKey v4 dont le champ
 *     `fee` porte le bit 0x800000 (8 388 608) n annonce AUCUN taux : le hook le fixe a chaque
 *     swap. Le code divisait ce champ par 10 000 comme un taux ordinaire :
 *         8 388 608 / 10 000 = 838,86  ->  l ecran affichait « Fee 839.36% »
 *     Ce n est pas un frais choquant, c est un nombre FAUX. Et il est reel : sur 24 h, 82 pools
 *     B20 portent ce drapeau (hook 0xbdf938…), plus 8 sur un autre (0xbb7784…).
 *
 * ⛔ DEUX ENDROITS ETAIENT TOUCHES, ET C EST TOUT L INTERET DE CE TEST :
 *    1. `libelleFrais` — le nombre affiche avant un achat ;
 *    2. `poolDecouvertPour` — le classement par prix, qui rangeait ces pools comme les plus
 *       cheres du monde alors que leur taux est simplement INCONNU.
 *    Corriger l affichage sans corriger le classement aurait laisse le defaut a moitie ferme :
 *    l ecran aurait dit « inconnu » pendant que le code aurait continue a les fuir comme des
 *    pools a 838 %.
 *
 * ⛔ CE QU IL NE PROUVE PAS : le taux reel d une pool dynamique. Le connaitre exige de SIMULER le
 *    swap. La garde prouve qu on ne l INVENTE pas.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ LA GARDE S ACCUSE D ABORD */
assert.match(html, /const FRAIS_DYNAMIQUE_V4 = 0x800000;/,
  'la constante du drapeau dynamique a disparu — cette garde ne protege plus rien');
const dF = html.indexOf('function fraisEstDynamique(');
assert.ok(dF > 0, 'fraisEstDynamique introuvable');
const srcF = html.slice(dF, html.indexOf('\n}', dF) + 2);
assert.ok(srcF.length > 80, 'extraction suspecte : ' + srcF.length);

const fait = new Function('FRAIS_DYNAMIQUE_V4', srcF + '\nreturn fraisEstDynamique;')(0x800000);

v('le drapeau exact est reconnu', () => {
  assert.equal(fait(8388608), true, '0x800000 doit etre dynamique');
  assert.equal(fait(0x800000 | 3000), true, 'le drapeau combine a un taux doit rester dynamique');
});
v('les taux ordinaires ne le sont pas', () => {
  for (const f of [0, 100, 500, 3000, 10000, 30000, 500000, 770000, 887323]) {
    assert.equal(fait(f), false, f + ' a ete pris pour un frais dynamique');
  }
});
v('les valeurs illisibles ne sont pas « dynamiques » non plus', () => {
  /* ⛔ `nan-walks-through-every-bound` : `NaN & x` vaut 0, donc false — mais on le VERIFIE au lieu
   *    de le supposer, parce qu un `true` ici ferait passer un frais illisible pour un cas connu. */
  for (const f of [null, undefined, NaN, '', 'beaucoup', {}]) {
    assert.equal(fait(f), false, String(f) + ' a ete pris pour un frais dynamique');
  }
});

v("l'ecran n'affiche plus de nombre pour un frais dynamique", () => {
  const d = html.indexOf('function libelleFrais(');
  assert.ok(d > 0, 'libelleFrais introuvable');
  const src = html.slice(d, html.indexOf('\n}', d) + 2);
  assert.match(src, /if \(fraisEstDynamique\(tier\)\)/,
    'libelleFrais ne traite plus le cas dynamique : « Fee 839.36% » reviendrait');
  assert.match(src, /Fee set by this market at each trade/, 'la phrase de remplacement a disparu');
  /* ⛔ et elle doit venir AVANT le calcul, sinon elle ne sert a rien */
  assert.ok(src.indexOf('fraisEstDynamique(tier)') < src.indexOf('const base = Math.round'),
    'le cas dynamique est teste APRES le calcul du nombre — il ne le remplace donc pas');
});

v('le classement par prix ne traite plus un frais dynamique comme un taux', () => {
  const d = html.indexOf('function poolDecouvertPour(');
  assert.ok(d > 0, 'poolDecouvertPour introuvable');
  const src = html.slice(d, html.indexOf('\n}', d) + 2);
  assert.match(src, /!fraisEstDynamique\(feeBrut\)/,
    'le classement voit encore 8 388 608 comme un prix : ces pools sont rangees a 838 %');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok frais-dynamique — ' + n + ' cas · affichage ET classement, les deux corriges');
