/* mesure-assertions-sur-commentaires.mjs — COMBIEN D ASSERTIONS NE TIENNENT QUE PAR UN COMMENTAIRE ?
 *
 * ⛔⛔ LE DEFAUT MESURE LE 2026-09-23. `test-bridge-tab-0922.mjs` portait
 *         assert.match(bridgePanel, /Phil/i);
 *     Le panneau contient 5 fois « Phil » — et 0 a l ecran : les cinq sont dans des COMMENTAIRES,
 *     dont ceux qui expliquent qu on vient justement de retirer « Phil » de l affichage. Le test
 *     passait AVANT le retrait et APRES. Il n a jamais remarque que ce qu il gardait avait disparu.
 *     ⇒ Une garde satisfaite par le commentaire qui documente sa propre violation ne garde rien.
 *
 * CE QUE CETTE SONDE FAIT : pour chaque `assert.match(<source>, /motif/)` de la suite, elle
 * verifie si le motif tombe UNIQUEMENT dans des commentaires du fichier vise.
 *
 * ⛔ CE QU ELLE NE PEUT PAS DECIDER, ET QU ELLE NE PRETEND PAS : si c est un DEFAUT. Certaines
 *    assertions veulent legitimement garder un COMMENTAIRE (une mesure ecrite, une borne
 *    documentee). Elle RECENSE et CLASSE ; le tri est humain. Accuser automatiquement ici
 *    refabriquerait l erreur qu elle mesure.
 * ⛔ ET ELLE NE LIT QUE LES MOTIFS LITTERAUX `/.../` poses sur une variable de fichier connue.
 *    Les motifs construits, les chaines `includes()` et les sources qu elle ne sait pas relier
 *    lui echappent : elle les COMPTE et les annonce, elle ne les tait pas.
 */
import { readFileSync, readdirSync } from 'node:fs';

const D = new URL('./', import.meta.url);
const TESTS = readdirSync(D).filter((f) => /^test-.*\.mjs$/.test(f));
const sansCommentaires = (s) => s
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:'"\\])\/\/[^\n]*/gm, '$1 ');

/* les fichiers que les tests lisent le plus, charges une fois */
const CIBLES = new Map();
for (const f of ['app.html', 'index.html']) {
  try {
    const brut = readFileSync(new URL(f, D), 'utf8');
    CIBLES.set(f, { brut, net: sansCommentaires(brut) });
  } catch (_) { /* absent : on ne l invente pas */ }
}
if (!CIBLES.size) { console.error('⛔ aucune cible lue — sonde morte'); process.exit(1); }
for (const [f, c] of CIBLES) {
  if (c.net.length >= c.brut.length) { console.error('⛔ depouillement sans effet sur ' + f); process.exit(1); }
}

/* ⛔ on ne devine pas quelle variable porte quel fichier : on ne retient que les noms dont le test
 *    montre explicitement la provenance (`readFileSync('./app.html')` -> `html`, etc.). */
function ciblesDuTest(src) {
  const out = new Map();
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*readFileSync\([^)]*['"`]\.?\/?([\w.-]+)['"`]/g)) {
    if (CIBLES.has(m[2])) out.set(m[1], m[2]);
  }
  /* une tranche d un fichier deja relie garde la meme cible */
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*(\w+)\.slice\(/g)) {
    if (out.has(m[2])) out.set(m[1], out.get(m[2]));
  }
  return out;
}

let lues = 0, litterales = 0, nonLisibles = 0;
const surCommentaire = [];
for (const t of TESTS) {
  const src = readFileSync(new URL(t, D), 'utf8');
  const cibles = ciblesDuTest(src);
  for (const m of src.matchAll(/assert\.match\(\s*(\w+)\s*,\s*\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)\s*[,)]/g)) {
    lues++;
    const cible = cibles.get(m[1]);
    if (!cible) { nonLisibles++; continue; }
    litterales++;
    let re;
    try { re = new RegExp(m[2], m[3].replace(/[gy]/g, '')); } catch (_) { nonLisibles++; continue; }
    const c = CIBLES.get(cible);
    const dansBrut = re.test(c.brut);
    const dansNet = re.test(c.net);
    if (dansBrut && !dansNet) surCommentaire.push({ test: t, cible, motif: '/' + m[2] + '/' + m[3] });
  }
}

console.log('fichiers de test lus            : ' + TESTS.length);
console.log('assert.match(...) rencontres    : ' + lues);
console.log('  dont reliables a un fichier   : ' + litterales);
console.log('  ⛔ NON REGARDES (source ou motif non resolus) : ' + nonLisibles
  + '   — ni innocentes ni accuses');
if (!lues) { console.log('\n⛔ zero assertion lue : la sonde ne prouve rien'); process.exit(1); }

console.log('\n⛔ ASSERTIONS QUI NE TIENNENT QUE PAR UN COMMENTAIRE : ' + surCommentaire.length);
for (const s of surCommentaire) {
  console.log('   ' + s.test + '  ->  ' + s.cible + '  ' + s.motif.slice(0, 70));
}
if (!surCommentaire.length) {
  console.log('   (aucune parmi celles qui sont reliables — le cas `/Phil/i` a ete corrige)');
}
console.log('\n⛔ CE COMPTE NE DIT PAS « defaut ». Une assertion peut vouloir garder un commentaire');
console.log('   (une mesure ecrite, une borne documentee). Elle donne une SURFACE a trier.');
