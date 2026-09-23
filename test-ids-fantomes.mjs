/* test-ids-fantomes.mjs — AUCUN `#id` LU PAR LE JS NE DOIT MANQUER AU BALISAGE.
 *
 * ⛔⛔ LA CLASSE DE DEFAUT QUE CETTE GARDE FERME. `if (!$('#x')) return;` sur un `#x` qui n existe
 *     dans aucun fichier n est pas une garde : sa condition est CONSTANTE, donc c est un
 *     interrupteur colle sur ARRET. La fonction ne s executera jamais, aucune erreur ne sera levee,
 *     et l ecran restera exactement comme avant. C est arrive trois fois ici :
 *       · `#cVieDirecte` absent avait mis trois hooks a zero ;
 *       · le Companion peignait un role que personne ne lisait ;
 *       · `#bEcrireBlock` gardait huit lignes mortes, dont un `setInterval` jamais demarre,
 *         longtemps apres que `833ed7a` eut retire le bouton.
 *     Aucun de ces trois n a lance d erreur. Aucun test ne pouvait les voir. Le silence EST le
 *     defaut : c est pour ca que la garde doit etre structurelle et non comportementale.
 *
 * ⛔ CE QU ELLE SAIT PROUVER : qu un id lu par le code a une contrepartie ecrite quelque part —
 *    y compris dans une chaine de gabarit, donc injecte a l execution par `innerHTML`.
 * ⛔ CE QU ELLE NE PEUT PAS PROUVER, ET QU ELLE DIT :
 *    · un selecteur CONSTRUIT (`'#bloc' + n`) lui echappe entierement ;
 *    · un id PRESENT mais dans une branche jamais rendue passe pour existant. Elle prouve la
 *      presence dans la SOURCE, jamais la presence a l ECRAN. Le Companion a ete prouve par
 *      execution, pas par cette garde, et les deux preuves ne se remplacent pas.
 *
 * ⛔ ASYMETRIE DELIBEREE : les commentaires sont depouilles du cote des LECTURES (sinon un
 *    commentaire expliquant un retrait est lu comme du code — la v1 de la sonde a accuse
 *    `#lienLegende` exactement comme ca), mais JAMAIS du cote de l UNIVERS (sinon un id declare
 *    dans un gabarit commente disparaitrait et FABRIQUERAIT des fantomes). Une garde doit se
 *    tromper du cote de l innocence. */
import { readFileSync, readdirSync } from 'node:fs';

const D = new URL('./', import.meta.url);
const SOURCES = readdirSync(D).filter((f) => /\.(html|js)$/.test(f) && !f.startsWith('test-'));

/* ⛔ TOLERES, ET CHACUN PORTE SA RAISON. Un nom sur cette liste sans raison ecrite redevient un
 *    defaut au premier lecteur qui se demande pourquoi il est la. */
const TOLERES = new Map([
  ['cCreerFree', 'retire du DOM par `20260922-create-sign-ux` ; la lecture est explicitement '
    + 'null-gardee et le chemin gratuit reste atteignable par Practice.'],
  ['cVieDirecte', 'la case n existe plus, mais ses QUATRE lectures sont ecrites fail-open '
    + '(`!$(\'#cVieDirecte\') || $(\'#cVieDirecte\').checked`) : l absence vaut « vie directe ON », '
    + 'qui est la valeur voulue. Retirer les lectures changerait un comportement LIVE, pas ce test.'],
]);

const sansCommentairesJs = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1 ');

const existent = new Set();
for (const f of SOURCES) {
  const src = readFileSync(new URL(f, D), 'utf8');     /* univers : BRUT, le plus large possible */
  for (const m of src.matchAll(/\bid\s*=\s*["']([A-Za-z][\w-]*)["']/g)) existent.add(m[1]);
  for (const m of src.matchAll(/\bid=([A-Za-z][\w-]*)[\s">]/g)) existent.add(m[1]);
}

const LECTURES = [
  /\$\(\s*['"]#([A-Za-z][\w-]*)['"]\s*\)/g,
  /getElementById\(\s*['"]([A-Za-z][\w-]*)['"]\s*\)/g,
  /querySelector(?:All)?\(\s*['"]#([A-Za-z][\w-]*)['"]\s*\)/g,
];
const reclames = new Map();
let construits = 0;
for (const f of SOURCES) {
  const brut = readFileSync(new URL(f, D), 'utf8');
  const src = sansCommentairesJs(brut);
  for (const re of LECTURES) {
    for (const m of src.matchAll(re)) {
      if (!reclames.has(m[1])) reclames.set(m[1], new Set());
      reclames.get(m[1]).add(f);
    }
  }
  construits += [...src.matchAll(/\$\(\s*['"]#[^'"]*['"]\s*\+|getElementById\(\s*[A-Za-z_$]/g)].length;
}

/* ⛔ LA GARDE S ACCUSE D ABORD. Un « 0 fantome » obtenu sur zero lecture, ou sur un univers vide,
 *    est un vert qui ne prouve rien — c est exactement le motif qui a fait passer un site MORT
 *    pour deploye. Elle rougit donc sur ses propres conditions avant de juger le code. */
if (SOURCES.length < 50) throw new Error('la garde ne lit que ' + SOURCES.length + ' fichiers');
if (existent.size < 400) throw new Error('univers suspect : ' + existent.size + ' ids');
if (reclames.size < 400) throw new Error('lectures suspectes : ' + reclames.size);

const fantomes = [...reclames.keys()].filter((id) => !existent.has(id) && !TOLERES.has(id)).sort();
if (fantomes.length) {
  throw new Error('ids lus par le JS et absents de TOUT balisage — leur garde est collee sur '
    + 'ARRET et le code qu elle protege ne s executera jamais :\n  #'
    + fantomes.map((id) => id + '  (' + [...reclames.get(id)].join(', ') + ')').join('\n  #')
    + '\n  ⇒ soit le balisage a perdu un element, soit ce code est mort : trancher, ne pas tolerer.');
}

/* ⛔ ET LA LISTE DES TOLERES DOIT RESTER VRAIE. Un tolere qui REVIENT dans le balisage n est plus
 *    une exception : le laisser la eteindrait la garde sur un id redevenu vivant. */
for (const [id, raison] of TOLERES) {
  if (existent.has(id)) throw new Error('#' + id + ' existe de nouveau : retirer sa tolerance');
  if (!reclames.has(id)) throw new Error('#' + id + ' n est plus lu nulle part : tolerance perimee');
  if (raison.length < 60) throw new Error('#' + id + ' tolere sans raison ecrite');
}

console.log('ok ids-fantomes — ' + reclames.size + ' ids lus, ' + existent.size + ' ids ecrits, '
  + SOURCES.length + ' fichiers, ' + TOLERES.size + ' toleres motives');
console.log('   ⛔ NON REGARDE : ' + construits + ' selecteurs construits (`#bloc`+n) — hors portee.');
