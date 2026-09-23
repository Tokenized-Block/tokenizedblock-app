/* test-carte-vivante.mjs — LA CARTE MONTRE CE QUI VIT, ET LE CUBE NE SE TORD PLUS.
 *
 * DEUX DECISIONS DE PHIL, 2026-09-23 : « je reduis l amplitude » et « il existe pas et vit pas
 * sur la map visible au public ».
 *
 * ⛔⛔ 1. L AMPLITUDE. Le cube faisait un TOUR COMPLET. Pris a mi-rotation — donc la plupart du
 *     temps — un gros cube se lit comme un parallelogramme ecrase. Signale TROIS fois comme un
 *     « bug visuel ». Ce n en etait pas un : c etait la demande du 2026-09-19 (« le block tourne
 *     sur lui-meme en libre mouvement x y z »). On garde le mouvement, on borne l angle a 14 deg.
 *     ⛔ LES SATELLITES GARDENT LEUR TOUR COMPLET : le defaut ne venait QUE du cube principal.
 *       Corriger au-dela du defaut mesure, c est casser ce qui marchait.
 *
 * ⛔⛔ 2. LA CARTE. Mesure : 355 cubes affiches, dont 67 exactement a la taille « sans marche ».
 *     Un cinquieme de la carte occupe par des blocks jamais echanges, qui rendaient illisibles
 *     ceux qui vivent.
 *     ⛔ ET LE POINT QUI DECIDE DE TOUT : `etatVie` a TROIS etats. On retire `NON_TROUVEE` — « on
 *       a cherche, il n y a rien » — et JAMAIS l etat « pas encore regarde ». Confondre les deux
 *       viderait la carte pendant le chargement et ferait passer une lecture non faite pour un
 *       fait sur le block de quelqu un d autre.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : le rendu. Il lit la source et EXECUTE le filtre ; l amplitude
 *    a l ecran demande un navigateur, et elle a ete verifiee a la main.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { CUBE3D_CSS } from './cube3d.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ EXTRACTION BORNEE. Ma premiere sonde cherchait `/c3tourne\{[\s\S]*?360deg/` : le motif
 *    non-gourmand traversait jusqu au bloc des satellites et rendait un faux positif. Un motif
 *    qui ne borne pas son bloc mesure le bloc d a cote. */
function blocKeyframes(nom) {
  const i = CUBE3D_CSS.indexOf('@keyframes ' + nom);
  if (i < 0) return null;
  const j = CUBE3D_CSS.indexOf('}}', i);
  return j < 0 ? null : CUBE3D_CSS.slice(i, j + 2);
}

v('le CSS du cube se charge vraiment', () => {
  assert.ok(typeof CUBE3D_CSS === 'string' && CUBE3D_CSS.length > 1000,
    'CUBE3D_CSS vide ou minuscule : un accent grave a du terminer le gabarit');
});

v('l amplitude est une constante nommee, et elle est bornee', () => {
  const m = /--c3amp:\s*(\d+)deg/.exec(CUBE3D_CSS);
  assert.ok(m, 'la constante --c3amp a disparu : l angle redeviendrait un nombre perdu dans une image-cle');
  const deg = Number(m[1]);
  assert.ok(deg >= 6 && deg <= 25,
    'amplitude de ' + deg + ' deg : en dessous de 6 le mouvement ne se voit plus, au-dessus de 25 '
    + 'le cube redevient un parallelogramme a mi-course');
});

v('le cube OSCILLE, il ne tourne plus', () => {
  const t = blocKeyframes('c3tourne');
  assert.ok(t, 'les images-cles du cube ont disparu');
  assert.doesNotMatch(t, /360deg/, 'le cube refait un tour complet : le defaut signale revient');
  assert.match(t, /var\(--c3amp\)/, 'le cube ne lit plus l amplitude bornee');
});

v('les satellites gardent leur tour complet', () => {
  const s = blocKeyframes('c3satellite');
  assert.ok(s, 'les satellites ont perdu leurs propres images-cles : ils suivraient le cube et se figeraient');
  assert.match(s, /360deg/, 'les satellites ne tournent plus');
});

/* ⛔ LE FILTRE DE LA CARTE EST EXECUTE, pas relu : c est son COMPORTEMENT sur les trois etats qui
 *    compte, et une relecture de texte ne l aurait jamais montre. */
const d = html.indexOf('function aSaPlaceSurLaCarte(');
assert.ok(d > 0, 'le filtre de la carte est introuvable');
const src = html.slice(d, html.indexOf('\n}', d) + 2);
const aSaPlace = new Function(src + '\nreturn aSaPlaceSurLaCarte;')();

v('un block PROUVE sans marche quitte la carte', () => {
  assert.equal(aSaPlace({ etatVie: 'NON_TROUVEE' }), false);
});

v('un block avec marche RESTE', () => {
  assert.equal(aSaPlace({ etatVie: 'LUE' }), true);
});

v('un block PAS ENCORE LU reste — on ne cache jamais ce qu on n a pas regarde', () => {
  /* ⛔ `absence-of-evidence-vs-failure-to-look`. Sans ces cas, la carte se viderait pendant le
   *    chargement et une lecture non faite passerait pour un fait. */
  for (const etat of [undefined, null, '', 'NON_LUE', 'EN_COURS']) {
    assert.equal(aSaPlace({ etatVie: etat }), true,
      'un block a l etat ' + String(etat) + ' a ete retire de la carte sans preuve');
  }
  assert.equal(aSaPlace(null), true, 'une entree illisible ne doit pas faire disparaitre un block');
});

v('le filtre est bien CABLE dans poserBlocks', () => {
  /* ⛔ Une fonction juste qui n est appelee nulle part ne filtre rien — c est le motif
   *    `garde-sur-element-absent-toujours-fausse` vu de l autre cote. */
  assert.match(html, /if \(aSaPlaceSurLaCarte\(c\)\) creerHabitant\(c\);/,
    'le filtre existe mais poserBlocks ne l appelle pas');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok carte-vivante — ' + n + ' cas : amplitude bornee, carte reservee a ce qui vit');
