/* mesure-fenetres-glissantes.mjs — LES DEUX MOTIFS DE DECOUPAGE, SUR LA MEME PLAGE.
 *
 * ⛔ LE CONSTAT. `index-blocks.js` porte DEUX facons de decouper la plage :
 *      ligne 268 (canonique, corrigee le 2026-09-19) :
 *          bas = Math.max(debut, Math.floor(haut / FENETRE_MAX) * FENETRE_MAX)   puis   haut = bas - 1
 *      lignes 122 et 312 (restees glissantes) :
 *          haut = bas ;  bas = Math.max(debut, haut - FENETRE_MAX)
 *    Le commentaire de la version canonique DECRIT deja le defaut de l autre : « glissantes, elles
 *    changeaient a chaque lecture et aucune ne se relisait du cache ». Le diagnostic etait ecrit ;
 *    il a ete applique a UNE boucle sur TROIS.
 *
 * ⛔ CE QU ON MESURE, ET RIEN DE PLUS :
 *    1. les bornes changent-elles quand la tete de chaine avance ? (⇒ le cache peut-il servir ?)
 *    2. les fenetres glissantes se recouvrent-elles ? (⇒ des logs comptes deux fois ?)
 *    On ne mesure PAS « le gain en secondes » : ca depend du reseau et du cache du visiteur.
 *
 * ⛔ ET ON COMPARE LES DEUX MOTIFS SUR LA MEME PLAGE, avec DEUX tetes differentes — sinon on
 *    compare deux mesures et pas deux motifs.
 */
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('./index-blocks.js', import.meta.url), 'utf8');
const m = src.match(/FENETRE_MAX\s*=\s*(\d+)/);
if (!m) { console.error('⛔ FENETRE_MAX introuvable'); process.exit(1); }
const F = Number(m[1]);
console.log('FENETRE_MAX lu dans index-blocks.js = ' + F + '\n');

/** le motif GLISSANT, recopie tel quel de listerCreations (lignes 119-122). */
function glissant(dernier, blocs) {
  const debut = Math.max(0, dernier - blocs);
  const out = [];
  let bas = dernier;
  while (bas > debut) { const haut = bas; bas = Math.max(debut, haut - F); out.push([bas, haut]); }
  return out;
}
/** le motif ALIGNE, recopie tel quel de la version canonique (lignes 266-270). */
function aligne(dernier, blocs) {
  const debut = Math.max(0, dernier - blocs);
  const out = [];
  let haut = dernier;
  while (haut >= debut) { const bas = Math.max(debut, Math.floor(haut / F) * F); out.push([bas, haut]); haut = bas - 1; }
  return out;
}

const TETE = 51692000;
const BLOCS = 90000;                         /* le defaut de listerCreations */

for (const [nom, fn] of [['GLISSANT (livre, lignes 122 et 312)', glissant], ['ALIGNE (canonique, ligne 268)', aligne]]) {
  const a = fn(TETE, BLOCS);
  const b = fn(TETE + 137, BLOCS);           /* la tete a avance de 137 blocs, ~4 min sur Base */

  /* 1. combien de fenetres sont IDENTIQUES entre les deux lectures ? */
  const cles = new Set(a.map(([x, y]) => x + ':' + y));
  const communes = b.filter(([x, y]) => cles.has(x + ':' + y)).length;

  /* 2. les fenetres se recouvrent-elles ? bornes INCLUSIVES des deux cotes. */
  const tri = [...a].sort((p, q) => p[0] - q[0]);
  let recouvrements = 0, blocsEnDouble = 0;
  for (let i = 1; i < tri.length; i++) {
    const chevauche = tri[i][0] <= tri[i - 1][1];
    if (chevauche) { recouvrements++; blocsEnDouble += tri[i - 1][1] - tri[i][0] + 1; }
  }
  const couverts = new Set();
  console.log('── ' + nom + ' ──');
  console.log('  fenetres pour ' + BLOCS + ' blocs        : ' + a.length);
  console.log('  IDENTIQUES apres +137 blocs      : ' + communes + '/' + b.length
    + '  (' + Math.round(communes / b.length * 100) + ' %)'
    + (communes === 0 ? '   ⛔ AUCUNE ne se relit du cache' : ''));
  console.log('  paires de fenetres qui se recouvrent : ' + recouvrements);
  console.log('  blocs lus DEUX FOIS              : ' + blocsEnDouble
    + (blocsEnDouble ? '   ⛔ tout log de ces blocs est compte en double' : '   ✅'));
  console.log('');
}
console.log('⛔ BORNE : ceci mesure des BORNES, pas des logs. Le nombre de doublons REELS depend de');
console.log('   ce que contiennent les blocs partages — mesure a part.');
