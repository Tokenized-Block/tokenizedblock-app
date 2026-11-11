/* test-bridge-actifs-proposes.mjs — ON NE PROPOSE PAS D ECHANGER CE QUI NE S ECHANGE PAS.
 *
 * ⛔⛔ DECISION DE PHIL, 2026-09-24 : « retirer le TBLOCK de la, car le coin est pas reellement lance
 *     au public ». Il parlait du selecteur « From » du Swap via Bridge.
 *   ⇒ MESURE INDEPENDANTE FAITE LE MEME JOUR, qui va dans le meme sens : TBLOCK est l un des 7
 *     jetons detenus par le wallet de frais, et AUCUN des 7 n a de marche vivant (croise avec les
 *     268 marches suivis par /api/trending). Le proposer comme monnaie d echange revient a proposer
 *     d echanger quelque chose qui ne s echange pas — et l utilisateur ne le decouvrirait qu apres
 *     avoir choisi.
 *
 * ⛔ CE QUE CE TEST GARDE VRAIMENT : que les DEUX listes du Bridge (la dynamique et le repli code en
 *   dur) disent la meme chose. C est le motif `single-and-batch-twins-diverge` : filtrer l une en
 *   oubliant l autre rend le correctif invisible exactement quand la premiere echoue, donc au pire
 *   moment possible.
 *
 * ⛔ CE QU IL NE PROUVE PAS : que les autres actifs proposes ont, eux, un marche. Le drapeau est une
 *    DECLARATION portee a la main sur une entree ; ce test verifie qu elle est RESPECTEE, pas
 *    qu elle est exacte pour tous les actifs.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { DEVISES_BASE, proposableEnEchange, TBLOCK_MAINNET } from './paires.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('TBLOCK est marque comme non lance publiquement', () => {
  /* game354: looked up by ADDRESS (the old test token); its symbol is oldTBLOCK, never the bare TBLOCK */
  const t = DEVISES_BASE.find((p) => String(p.adr).toLowerCase() === String(TBLOCK_MAINNET).toLowerCase());
  assert.ok(t, 'l entree TBLOCK a disparu de DEVISES_BASE : ce test ne garde plus rien');
  assert.equal(t.symbole, 'oldTBLOCK', 'the old test token is named TBLOCK again: two TBLOCKs on screen');
  assert.equal(t.lancePubliquement, false, 'TBLOCK n est plus marque non-lance : il reviendrait dans les listes');
  assert.equal(String(t.adr).toLowerCase(), String(TBLOCK_MAINNET).toLowerCase());
});

v('le filtre retire TBLOCK et RIEN D AUTRE', () => {
  /* ⛔⛔ LE CAS QUI EMPECHE LE CORRECTIF DE TROP COUPER. Un filtre trop large viderait le selecteur
   *     entier — un panneau vide serait bien pire que le defaut corrige. On verifie les DEUX cotes :
   *     ce qui doit partir part, ce qui doit rester reste. */
  const retires = DEVISES_BASE.filter((p) => !proposableEnEchange(p)).map((p) => p.symbole);
  assert.deepEqual(retires, ['oldTBLOCK', 'TBLOCK'], /* game354: the old test token (oldTBLOCK) and the REAL one, known for the name guard — neither is proposed */ 'actifs retires inattendus : ' + retires.join(', '));
  const gardes = DEVISES_BASE.filter(proposableEnEchange).map((p) => p.symbole);
  for (const doitRester of ['ETH', 'USDC', 'cbBTC']) {
    assert.ok(gardes.includes(doitRester), doitRester + ' a ete retire par erreur : le selecteur se viderait');
  }
  assert.ok(gardes.length >= 3, 'seulement ' + gardes.length + ' actif(s) proposable(s) : filtre trop large');
});

v('fail-open assume : une entree SANS drapeau reste proposable', () => {
  /* ⛔ Exiger le drapeau ferait disparaitre les dizaines d entrees existantes qui n en portent pas.
   *   Le defaut doit etre « lance », et seul l explicite retire. */
  assert.equal(proposableEnEchange({ symbole: 'X' }), true);
  assert.equal(proposableEnEchange({ symbole: 'Y', lancePubliquement: true }), true);
  assert.equal(proposableEnEchange({ symbole: 'Z', lancePubliquement: false }), false);
  /* une entree illisible ne doit pas faire disparaitre un actif sans raison */
  assert.equal(proposableEnEchange(null), true);
});

/* ⛔⛔⛔ TROIS CAS FUSIONNES EN UNE GARDE CONTRE LE RETOUR, LE 2026-10-02 — ET C EST UN CHANGEMENT
 *      QU IL FAUT JUSTIFIER, PAS CONSTATER.
 *      Ils gardaient `peindreBridgeActifs()` : que sa liste DYNAMIQUE filtre par
 *      `proposableEnEchange`, que sa liste de REPLI ne recode pas TBLOCK en dur, et que l ecran
 *      importe bien le filtre. Trois bonnes gardes sur un sujet qui N EXISTE PLUS : la fonction et
 *      les deux selecteurs « From » / « To » ont ete retires.
 *
 *   ⭐ POURQUOI ILS ONT ETE RETIRES, et c est une MESURE, pas un gout : les deux selecteurs
 *     n entraient JAMAIS dans la transaction. Le gestionnaire appelle
 *     `planEchange({ jeton: hub, sens: 'VENTE', montant })` ; `fromSym` et `toSym` apparaissaient
 *     ZERO fois dans son corps, et le devis calcule a partir d eux n etait utilise NULLE PART.
 *     Vingt options laissaient croire a un echange actif-vers-actif, ce qui OBLIGEAIT a ecrire
 *     quelque part qu il ne se reglerait pas — la phrase que Raksha a fait retirer le 2026-10-02.
 *
 *   ⛔ UN TEST DONT LE SUJET DISPARAIT NE DOIT PAS ETRE SUPPRIME : il doit devenir la garde qui
 *     empeche le sujet de REVENIR sans ses protections. C est la seule facon honnete de retirer une
 *     fonctionnalite — sinon la prochaine personne recable les selecteurs, sans filtre, et plus rien
 *     ne crie.
 *   ⚠️ CE QUI N EST PLUS GARDE, DIT FRANCHEMENT : plus rien ne verifie que la liste de repli evite
 *     TBLOCK, parce qu il n y a plus de liste. Si les selecteurs reviennent, l assertion ci-dessous
 *     rougit et il faudra REECRIRE ces trois cas, pas seulement les rebrancher. Les deux premiers
 *     cas de ce fichier gardent toujours le filtre LUI-MEME dans `paires.js` : la regle survit, son
 *     cablage non. */
v('⛔ l offre actif-vers-actif ne revient pas sans ses protections', () => {
  const vu = src.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  /* ⛔ TEMOIN DU DEPOUILLEMENT : sans effet il ne protege rien, trop gourmand il rend toute absence
   *   vraie. Trois instruments se sont fait prendre la-dessus aujourd hui, dont deux a moi. */
  /* 2026-10-25 : le temoin vise `#brFundWallet` (toujours dans le Bridge) au lieu de `#brConfirm`, parti avec la carte de vente. */
  assert.ok(vu.length < src.length && vu.length > 200000 && vu.includes('id="brFundWallet"'),
    'depouillement casse : ce cas ne garde plus rien (' + vu.length + '/' + src.length + ')');
  assert.doesNotMatch(vu, /id="brFrom"/,
    'le selecteur « From » est revenu. Il ne commande RIEN dans la transaction — `planEchange` ne '
    + 'prend que le block et le montant — donc il recree une offre fantome, et il faudra de nouveau '
    + 'ecrire a l ecran qu elle ne se regle pas. Si le hub token-token existe vraiment maintenant, '
    + 'rebranche `proposableEnEchange` ET reecris les trois cas que ce bloc remplace.');
  assert.doesNotMatch(vu, /id="brTo"/, 'le selecteur « To » est revenu — meme raison que « From »');
  assert.doesNotMatch(vu, /function peindreBridgeActifs/,
    'le peintre des selecteurs est revenu sans les selecteurs, ou avec : dans les deux cas ce '
    + 'fichier doit etre reecrit avant, pas apres');
  /* ⛔ ET LE GESTE VIVANT SURVIT. `fail-closed sur une affordance efface le produit` a coute 13
   *   puces reduites a 2 EN PROD : retirer une offre fantome ne doit pas emporter l offre reelle.
   * ⛔⛔ 2026-10-25 (Phil : « remove that ») : la carte de vente du Bridge (`#brConfirm`, `#brAmount`) est RETIREE sur
   *    decision du proprietaire, et la vente d un block par son propre marche est passee au Swap du Wallet. Ce cas exigeait
   *    `#brConfirm` ; il exige maintenant que la vente reste ATTEIGNABLE la ou elle est allee — sinon on aurait emporte
   *    l affordance qui marche. La preuve complete (commande ecrite, meme chemin que le Chat) vit dans test-wallet-swap-20261025. */
  assert.match(vu, /id="bWalletSwap"[^>]*>[\s\S]{0,30}Swap</, 'le Swap du Wallet a disparu : vendre un block devient inatteignable hors de sa fiche');
  assert.match(vu, /'sell ' \+ n \+ ' ' \+ de/, 'le Swap du Wallet n ecrit plus `sell <n> <block>` : la vente par son propre marche est perdue');
  assert.match(vu, /id="brBlock"/, 'le choix du block hub du Bridge a disparu');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
/* ⛔ CETTE LIGNE DISAIT « TBLOCK retire des DEUX listes » — faux depuis le 2026-10-02 : il n y a
 *   plus de liste du tout dans le Bridge. Un resume qui decrit un etat disparu est la premiere
 *   chose qu on relit et la derniere qu on corrige. */
console.log('ok bridge-actifs-proposes — ' + n + ' cas : le filtre tient dans paires.js ('
  + DEVISES_BASE.filter(proposableEnEchange).length + ' actifs proposables), et l offre '
  + 'actif-vers-actif ne peut pas revenir dans le Bridge sans faire rougir ce fichier.');
console.log('⚠️ NE PROUVE PAS que les autres actifs ont un marche : le drapeau est declare, pas mesure.');
