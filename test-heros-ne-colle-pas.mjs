/* test-heros-ne-colle-pas.mjs — LE HEROS DE CREATE NE RECOUVRE PAS LE FORMULAIRE.
 *
 * ⛔⛔ LE DEFAUT, SIGNALE PAR PHIL AVEC UNE CAPTURE (2026-09-23 : « bug toujours visible »).
 *     `.creaHeros` heritait `position:sticky` de `.creaSticky` — la classe d une BARRE D OUTILS —
 *     et la redeclarait. L intention ecrite juste au-dessus de la regle est « le block au centre,
 *     comme un personnage » : centrer, pas coller. Le sticky etait RECOPIE, pas voulu.
 *
 * ⛔ CE QUE CA COUTAIT, MESURE DANS UN NAVIGATEUR A 375x812 (le format de la capture) : le heros
 *    fait 484 px — 60 % de la hauteur d ecran — avec `z-index:6`. Des qu on defile, le contenu
 *    passe DESSOUS. Textes de contenu reellement recouverts, les enfants du heros EXCLUS du compte
 *    (les inclure aurait gonfle le chiffre de 5 : une mesure qui compte l element contre lui-meme
 *    ment dans le sens qui l arrange) :
 *        scroll    0 ->  0 recouverts
 *        scroll  600 ->  6
 *        scroll  900 -> 11   dont « Name », « Symbol », « Image file »
 *        scroll 1400 -> 11
 *        scroll 2000 ->  8
 *    Les champs qu on est en train de REMPLIR etaient caches derriere la presentation.
 *    Apres `position:static`, les memes cinq positions rendent 0.
 *
 * ⛔ CE QUE CE TEST PROUVE : que la regle livree ne colle plus le heros.
 * ⛔ CE QU IL NE PEUT PAS PROUVER : le rendu. Il ne mesure ni hauteur ni recouvrement — ca demande
 *    un navigateur, et ca a ete fait a la main avant et apres. Une garde de SOURCE ne remplace pas
 *    une mesure d ECRAN ; elle empeche seulement la regression de revenir sans qu on la voie.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ LA GARDE S ACCUSE D ABORD : si la regle a ete renommee, tout ce qui suit passerait sur du
 *    vide et rendrait un vert qui ne prouve rien. */
const regle = html.match(/\.creaSticky\.creaHeros\{[^}]*\}/);
assert.ok(regle, 'regle .creaSticky.creaHeros introuvable — cette garde ne protege plus rien');
assert.ok(regle[0].length > 80, 'regle suspecte : ' + regle[0].length + ' caracteres');

v('le heros n est PAS colle', () => {
  assert.doesNotMatch(regle[0], /position\s*:\s*sticky/,
    'le heros est redevenu sticky : il recouvrira le formulaire des le premier defilement');
  assert.doesNotMatch(regle[0], /position\s*:\s*fixed/, 'le heros est devenu fixed — pire encore');
});

v('il declare explicitement sa position, il ne laisse pas l heritage decider', () => {
  /* ⛔ SANS DECLARATION, IL HERITE `sticky` DE `.creaSticky` — et le defaut revient en silence
   *    au premier qui retire la ligne en croyant nettoyer. C est la cause EXACTE de ce bug. */
  assert.match(regle[0], /position\s*:\s*static/,
    'aucune position declaree : .creaSticky imposerait de nouveau sticky');
});

v('la classe de barre d outils, elle, reste collee', () => {
  /* ⛔ ON NE CORRIGE QUE LE HEROS. `.creaSticky` seule sert une vraie barre d actions ; la
   *    decoller aussi serait reparer le mauvais element — une garde peut etre VRAIE et couvrir la
   *    mauvaise moitie. */
  const base = html.match(/\n\.creaSticky\{[^}]*\}/);
  assert.ok(base, 'regle .creaSticky de base introuvable');
  assert.match(base[0], /position\s*:\s*sticky/, 'la barre d outils a perdu son sticky');
});

v('le z-index eleve reste porte par la barre, pas par le heros', () => {
  assert.doesNotMatch(regle[0], /z-index/, 'le heros redeclare un z-index : il repasserait devant');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok heros-ne-colle-pas — ' + n + ' cas · mesure navigateur 375x812 : 36 recouvrements -> 0');
