/* test-pool-la-moins-chere.mjs — A CONFIANCE EGALE, LA ROUTE LA MOINS CHERE GAGNE.
 *
 * ⛔⛔ LE DEFAUT, MESURE SUR LA CHAINE LE 2026-09-23. `poolDecouvertPour` classait les pools par
 *     CONFIANCE seulement. Entre plusieurs pools du meme rang, la PREMIERE rencontree l emportait,
 *     quel que soit son prix. Sur SPIKE (`0xb200…d601`), 7 pools v4 existent :
 *         77,00 %  <- celle que l app proposait
 *         88,73 % · 87,84 % · 50,00 %   (sans hook)
 *         0,00 % x3                     (avec hook)
 *     L app offrait donc un achat a 77 % de frais alors qu une pool a 50 % etait disponible. Le
 *     badge « Fee 77.5% » etait VRAI — c est la ROUTE qui etait mal choisie. On routait un achat
 *     sans regarder ce qu il coute.
 *
 * ⛔ CE TEST EXECUTE LE CODE LIVRE : il extrait le corps de `poolDecouvertPour` d `app.html` et le
 *    fait tourner sur des pools fabriquees. Recopier la logique prouverait la copie.
 * ⛔ CE QU IL NE PROUVE PAS : que la pool choisie soit BONNE. Choisir la moins chere de sept
 *    mauvaises reste un achat a 50 %. Le seuil de refus est une decision produit, pas une garde.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const d = html.indexOf('function poolDecouvertPour(');
assert.ok(d > 0, 'poolDecouvertPour introuvable — cette garde ne protege plus rien');
const fin = html.indexOf('\n}', d);
assert.ok(fin > d, 'fin de fonction introuvable');
const source = html.slice(d, fin + 2);
assert.ok(source.length > 600, 'extraction suspecte : ' + source.length + ' caracteres');
for (const j of ['_score', 'MAX_SAFE_INTEGER', 'confiance']) {
  assert.ok(source.includes(j), 'extraction incomplete, il manque ' + j);
}

/* ⛔ on fournit les dependances que la fonction attend, sans en recopier la logique.
 * ⛔⛔ `fraisEstDynamique` EST EXTRAIT D `app.html`, PAS REECRIT ICI. Ce test a rougi quand cette
 *     dependance est apparue — c est exactement ce qu on veut : une garde qui fabrique elle-meme
 *     ses dependances ne remarque jamais que le vrai code en a gagne une. En la recopiant, on
 *     testerait notre version du drapeau dynamique pendant que la livree pourrait diverger
 *     (`canonical-helper-weaker-copy`). */
const dDyn = html.indexOf('function fraisEstDynamique(');
assert.ok(dDyn > 0, 'fraisEstDynamique introuvable dans app.html');
const srcDyn = html.slice(dDyn, html.indexOf('\n}', dDyn) + 2);
assert.ok(srcDyn.includes('FRAIS_DYNAMIQUE_V4'), 'extraction de fraisEstDynamique incomplete');
const fraisEstDynamique = new Function('FRAIS_DYNAMIQUE_V4', srcDyn + '\nreturn fraisEstDynamique;')(0x800000);

const choisir = new Function('poolsLive', 'estNotreHook', 'confianceDe', 'fraisEstDynamique', 'adr',
  source + '\nreturn poolDecouvertPour(adr);');

const JETON = '0xb200000000000000000000fac1a85ab57681d601';
const NOTRE = '0x5926abdabf5d0006ee960a8270f3e124e5a764cc';
const estNotreHook = (h) => String(h || '').toLowerCase() === NOTRE;
const confianceDe = (cle) => (String(cle.hooks || '').toLowerCase() === '0x0000000000000000000000000000000000000000'
  ? 'SANS_HOOK' : 'HOOK');
const pool = (fee, hooks) => ({ jeton: JETON, cle: { currency0: '0x0000000000000000000000000000000000000000',
  currency1: JETON, fee, tickSpacing: 200, hooks } });
const ZERO = '0x0000000000000000000000000000000000000000';

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('entre sept pools sans hook, la moins chere gagne (le cas SPIKE reel)', () => {
  const m = new Map([[1, pool(770000, ZERO)], [2, pool(887323, ZERO)], [3, pool(878449, ZERO)],
    [4, pool(500000, ZERO)]].map(([k, p]) => [k, p]));
  const r = choisir(m, estNotreHook, confianceDe, fraisEstDynamique, JETON);
  assert.equal(r.cle.fee, 500000, 'la pool choisie coute ' + (r.cle.fee / 10000) + ' % au lieu de 50 %');
});

v('l ordre de rencontre ne decide plus', () => {
  /* ⛔ Le defaut d origine : la PREMIERE gagnait. On presente donc la chere en premier ET en
   *    dernier — les deux doivent rendre la meme reponse. */
  const a = choisir(new Map([[1, pool(770000, ZERO)], [2, pool(30000, ZERO)]]), estNotreHook, confianceDe, fraisEstDynamique, JETON);
  const b = choisir(new Map([[1, pool(30000, ZERO)], [2, pool(770000, ZERO)]]), estNotreHook, confianceDe, fraisEstDynamique, JETON);
  assert.equal(a.cle.fee, 30000, 'la chere gagne quand elle est presentee en premier');
  assert.equal(b.cle.fee, 30000, 'la chere gagne quand elle est presentee en dernier');
});

v('NOTRE hook passe devant, meme si une autre pool est moins chere', () => {
  /* ⛔ Notre pool est a 0 % de frais de POOL (le hook preleve a part) : la confiance doit rester
   *    prioritaire, sinon ce correctif nous ferait router hors de notre propre marche. */
  const r = choisir(new Map([[1, pool(0, ZERO)], [2, pool(0, NOTRE)]]), estNotreHook, confianceDe, fraisEstDynamique, JETON);
  assert.equal(String(r.cle.hooks).toLowerCase(), NOTRE, 'notre hook a perdu la priorite');
  assert.equal(r.isTbFeeHook, true);
});

/* ⛔⛔ LE PRIX PASSE DEVANT LA CONFIANCE ENTRE HOOKS ETRANGERS (2026-09-23).
 *     Avant, SANS_HOOK (100) battait HOOK (50) : une pool sans hook a 50 % gagnait contre
 *     une pool hookee a 0 %. MESURE QUI A TRANCHE, 24 h, 13 506 echanges sur des blocks B20 :
 *         pools hookees a 0 % : 4 266 echanges (31,6 %)
 *         pools SANS hook     : 1 256 echanges ( 9,3 %)
 *         frais de pool > 50 %:    19 echanges ( 0,1 %)
 *     Router vers 50 % envoie la personne la ou va UN echange sur mille — pour eviter un
 *     prelevement de hook que 4 266 personnes ont accepte le meme jour. Une perte CERTAINE pour
 *     eviter un INCONNU que le marche a deja juge.
 *     ⛔ L opacite n est pas ignoree pour autant : libelleFrais suffixe « %+ » sur une pool
 *       hookee — « ce taux, plus ce que ce marche prend ». On cesse de FUIR l inconnu, on
 *       continue de l ANNONCER.
 *     ⚠️ CE COMMENTAIRE A ETE ECRIT UNE PREMIERE FOIS EN CHAINE SHELL et ses backticks ont ete
 *        EXECUTES : trois noms de symbole avaient disparu, laissant « Avant,  (100) battait  (50) ».
 *        Repare par Edit. C est ma propre regle, violee une fois de plus ce jour-la. */
v('une pool HOOKEE a 0 % bat une pool SANS hook a 50 %', () => {
  const ETRANGER = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
  const a = choisir(new Map([[1, pool(500000, ZERO)], [2, pool(0, ETRANGER)]]), estNotreHook, confianceDe, fraisEstDynamique, JETON);
  assert.equal(a.cle.fee, 0, 'on route encore a 50 % alors qu une pool hookee a 0 % existe');
  assert.equal(String(a.cle.hooks).toLowerCase(), ETRANGER);
  /* ⛔ et dans les deux ordres de rencontre, sinon on prouverait un hasard */
  const b = choisir(new Map([[1, pool(0, ETRANGER)], [2, pool(500000, ZERO)]]), estNotreHook, confianceDe, fraisEstDynamique, JETON);
  assert.equal(b.cle.fee, 0, 'le resultat depend de l ordre de rencontre');
});

v('un frais ILLISIBLE ne gagne jamais', () => {
  /* ⛔ `nan-walks-through-every-bound` : sans repli, `NaN < x` est faux mais `x < NaN` aussi —
   *    l ordre deviendrait dependant de la rencontre, c est-a-dire du defaut qu on corrige. */
  for (const mauvais of [undefined, null, NaN, 'beaucoup', {}]) {
    const r = choisir(new Map([[1, pool(mauvais, ZERO)], [2, pool(100000, ZERO)]]), estNotreHook, confianceDe, fraisEstDynamique, JETON);
    assert.equal(r.cle.fee, 100000, 'un frais illisible (' + String(mauvais) + ') a gagne');
  }
});

v('une seule pool, meme chere, reste choisie (on ne casse pas le cas simple)', () => {
  const r = choisir(new Map([[1, pool(770000, ZERO)]]), estNotreHook, confianceDe, fraisEstDynamique, JETON);
  assert.ok(r && r.cle.fee === 770000, 'la seule pool disponible n est plus rendue');
});

v('aucune pool pour ce jeton : null, pas un repli au hasard', () => {
  const autre = { jeton: '0xb200000000000000000000000000000000000099',
    cle: { currency0: ZERO, currency1: '0xb200000000000000000000000000000000000099', fee: 0, hooks: ZERO } };
  assert.equal(choisir(new Map([[1, autre]]), estNotreHook, confianceDe, fraisEstDynamique, JETON), null);
});

/* ⛔⛔ LA PROMESSE A L ECRAN ET LE CODE QUI LA REND VRAIE VIVENT OU MEURENT ENSEMBLE.
 *     Depuis le 2026-09-23 le fil Live annonce « we read every pool of this block and route the
 *     cheapest ». C est une PROMESSE : si quelqu un revoque le classement par prix demain, cette
 *     phrase devient un mensonge affiche, et rien ne le signalerait.
 *     ⇒ Les deux sont gardes par le MEME test. On ne peut plus retirer l un sans casser l autre. */
v('la phrase affichee et le routage ne peuvent pas diverger', () => {
  const promesse = /route the cheapest/;
  const ditLaPhrase = promesse.test(html);
  const faitLeTravail = /score === best\._score && feeP < best\._fee/.test(html);
  assert.equal(ditLaPhrase, faitLeTravail,
    ditLaPhrase
      ? 'l ecran promet de router la moins chere, et le code ne le fait plus'
      : 'le code route la moins chere, mais l ecran ne le dit plus — la promesse a disparu de l offre');
});


/* ⛔⛔ LE CHOIX EST DIT A CELUI QUI SIGNE, PAS SEULEMENT FAIT (2026-09-23).
 *     Le fil Live promet « we read every pool of this block and route the cheapest ». Tant que
 *     l ecran ne montre pas ce choix, c est une affirmation INVERIFIABLE par la personne qui
 *     s apprete a payer. Mesure sur SPIKE : 7 pools existent, a 0 %, 50 %, 77 % et 88,73 %.
 *     ⛔ ET LA LIGNE NE S AFFICHE QUE S IL Y A EU UN CHOIX : a une seule pool, on n ecrit rien
 *       plutot que d annoncer une comparaison qui n a pas eu lieu. */
v('l ecran dit combien de pools ont ete lues, et seulement s il y a eu un choix', () => {
  assert.match(html, /Cheapest of ' \+ combien \+ ' pools we read on chain/,
    'la ligne qui expose le choix a disparu : la promesse redevient invérifiable');
  assert.match(html, /combien > 1/,
    'la ligne s afficherait meme sans choix reel — annoncer une comparaison qui n a pas eu lieu');
});

assert.equal(n, 9, 'compte de cas inattendu apres ajout : ' + n);
console.log('ok pool-la-moins-chere — ' + n + ' cas, fonction extraite d app.html et EXECUTEE');
