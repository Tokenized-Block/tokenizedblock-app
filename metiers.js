// metiers.js — le metier du cerveau d un block : il OBSERVE et PROPOSE, il n execute JAMAIS.
// ================================================================================================
// ⛔⛔ LA LIGNE QUI NE BOUGE PAS. Phil veut des cerveaux qui « tradent un peu, gerent un peu le
//    wallet, momentum sell and buy ». Un agent qui PASSE les ordres detient une cle : c est de la
//    custodie, et c est la premiere promesse de cette app donnee. Donc ici : le metier LIT la chaine
//    et REDIGE une proposition ; le wallet de l utilisateur la signe, ou ne la signe pas.
//    Chaque proposition porte `signeParUtilisateur: true` — et un test refuse qu il en existe une
//    seule sans ce drapeau. C est volontairement penible a contourner.
//
// ⛔ AUCUN METIER N OUVRE UNE GARDE. Comme les paliers de `pointsdevie.js` : un metier change ce que
//    le block DIT, jamais ce que l app VERIFIE. Sinon un block « Momentum » finirait par sauter le
//    controle de chaine que les autres subissent.
//
// ⛔⛔ UNE TENDANCE DEMANDE TROIS LECTURES. Avec deux points on trace la droite qu on veut ; avec un
//    seul on invente. `momentum` rend PAS_ASSEZ tant qu il n a pas trois mesures — dire « ca monte »
//    sur une lecture unique est exactement la faute qui a coute le « 6 % » de ce depot.
//
// ⚠️ CE QUE CE MODULE NE FAIT PAS : il ne lit pas le reseau lui-meme, il ne connait pas le prix du
//    BTC, et il ne sait rien d autre que ce qu on lui donne. Un metier « trade BTC » demanderait un
//    oracle nomme et verifie ; tant qu il n existe pas, ce metier n existe pas ici.
import { keccak256Hex } from './keccak.js';

const enc = new TextEncoder();

/**
 * Les metiers. `fait` = ce qu il lit. `propose` = ce qu il peut soumettre A SIGNER. `jamais` = la
 * borne dite a l ecran, parce qu une borne qu on ne lit pas ne rassure personne.
 */
export const METIERS = [
  { cle: 'GARDIEN', regarde: 'its own market cap, compared across your visits (kept in this browser)', titre: 'Keeper',
    /* ⛔⛔ LA PROMESSE D AVANT ETAIT FAUSSE (Phil, capture du 2026-09-13) : « says when it moves » — et
     *    `rapport` ne disait JAMAIS un mouvement, juste la capitalisation lue. Le Keeper compare
     *    maintenant les lectures gardees dans CE navigateur et le dit — y compris qu il n en a pas assez. */
    fait: 'compares its market cap across your visits and says whether it moved',
    propose: null,
    jamais: 'never moves anything — it only reports' },
  { cle: 'MOMENTUM', regarde: 'its own last three readings', titre: 'Momentum',
    fait: 'compares its last three readings and calls the trend',
    propose: 'a buy or a sell, prepared for you to sign',
    jamais: 'never sends an order by itself' },
  { cle: 'ECLAIREUR', regarde: 'the other blocks this page could actually read — never all of them', titre: 'Scout',
    fait: 'ranks the blocks it can see, and says how shallow they are',
    propose: null,
    jamais: 'never claims a rank over blocks it could not read' },
  { cle: 'HERAUT', regarde: 'its own measured numbers', titre: 'Herald',
    fait: 'writes a post about its block using measured numbers only',
    propose: 'a draft you send yourself',
    jamais: 'never posts anywhere on its own' },
  /* ⛔⛔ REGLE DU JEU DE PHIL, 2026-09-13 : POOL PERMANENTE, FRAIS 0. Ce metier proposait « collecter
   *    les 0,5 % » — devenu FAUX pour tout marche ouvert par l app : la position appartient a l adresse
   *    morte et les frais sont a 0, donc il n y a rien a collecter, pour personne. Une proposition
   *    fausse affichee dans un profil serait pire qu aucune proposition. */
  { cle: 'COMPTABLE', regarde: 'your balance of this block', titre: 'Bookkeeper',
    fait: 'reads what you hold of the block',
    propose: null,
    jamais: 'never moves anything, and never holds a key' },
  /* ⛔⛔ ROLES A CHOISIR (Phil, 2026-09-14 : « mets de vrais roles au block, que les users peuvent choisir sur leur
   *    profil » + « le Brain AI s adapte »). Ces deux-la ne sont PAS tires de l adresse (voir METIERS_DERIVES) : les
   *    ajouter au tirage aurait change le metier de TOUS les blocks existants. */
  { cle: 'SENTINELLE', regarde: 'the buys and sells on its own market', titre: 'Sentinel',
    fait: 'watches the buys and sells on its market and says when selling outweighs buying',
    propose: null,
    jamais: 'never buys or sells — it only warns' },
  { cle: 'ACCUEIL', regarde: 'new holders and transfers of its own block', titre: 'Greeter',
    fait: 'notices new holders and transfers, and suggests a GM back',
    propose: 'a GM you send yourself',
    jamais: 'never sends a GM by itself' },
  /* ⛔⛔ DEUX ROLES AJOUTES LE 2026-09-25 (Phil : « une grande variete de blocks avec des
   *     intelligences differentes »). ILS NE SONT LA QUE PARCE QU UN TROU ETAIT MESURABLE — pas
   *     pour faire nombre. Les sept roles precedents se partagent sept capteurs, et deux etaient
   *     a decouvert :
   *       · `achat` n etait DOMINANT chez personne. Le Sentinel a un cote vendeur fort (2,5) sans
   *         miroir acheteur, alors que l app compte DEJA les deux (`echangesDe` rend `achats` ET
   *         `ventes`). C etait une asymetrie dans des donnees qu on mesure deja.
   *       · `taille` plafonnait a 1,5, chez le Scout — qui regarde les AUTRES blocks. Rien ne
   *         suivait sa PROPRE montee de palier, alors que l echelle Seed -> Canopee existe avec des
   *         seuils reels (`pointsdevie.js`) et que `progressionPalier` sait deja dire la distance.
   *   ⛔ UN ROLE DE PLUS DOIT AVOIR QUELQUE CHOSE DE VRAI A DIRE, sinon c est un decor. Chacun de
   *     ces deux-la s appuie sur une mesure que l app produit deja, et sur rien d autre.
   *   ⛔⛔ ET ILS SONT AJOUTES EN FIN DE LISTE, JAMAIS AU MILIEU. `METIERS_DERIVES` prend les CINQ
   *     PREMIERS et le tirage fait `% METIERS_DERIVES.length` : changer ce nombre reattribuerait en
   *     silence le metier de TOUS les blocks qui n en ont jamais choisi un — un block changerait de
   *     personnage sans que personne ne l ait decide. L ordre de ce tableau est porteur. */
  { cle: 'CHASSEUR', regarde: 'the buys and sells on its own market', titre: 'Hunter',
    fait: 'watches the buys and sells on its market and says when buying outweighs selling',
    propose: null,
    jamais: 'never buys or sells — it only reports what it counted' },
  { cle: 'GRIMPEUR', regarde: 'its own market cap against the tier thresholds', titre: 'Climber',
    fait: 'says which tier its market cap sits in and how far the next one is',
    propose: null,
    jamais: 'never promises it will get there' },
];
/** ⛔ LES METIERS TIRES DE L ADRESSE : les cinq d origine, dans leur ordre — un block garde le metier qu il avait. */
export const METIERS_DERIVES = METIERS.slice(0, 5);

/**
 * ⛔⛔ LE CERVEAU S ADAPTE AU ROLE : un multiplicateur par fait, applique au courant d entree (cerveau.js). Il change
 *    CE QUI COMPTE pour le block, jamais les regles d humeur ni ce que l app verifie. 1 = comme sans role.
 */
export const SENSIBILITES = Object.freeze({
  GARDIEN: Object.freeze({ delta: 1.5 }),
  MOMENTUM: Object.freeze({ delta: 2, achat: 1.5, vente: 1.5 }),
  ECLAIREUR: Object.freeze({ taille: 1.5 }),
  HERAUT: Object.freeze({ message: 2, transfert: 1.5 }),
  COMPTABLE: Object.freeze({}),
  SENTINELLE: Object.freeze({ vente: 2.5, delta: 1.5 }),
  ACCUEIL: Object.freeze({ detenteur: 2.5, transfert: 2 }),
  /* ⛔ LE MIROIR EXACT DU SENTINEL, memes valeurs de l autre cote : c est ce qui rend les deux
   *   comparables. Un chasseur « un peu » sensible a l achat n aurait rien dit de plus que le
   *   Momentum (achat 1,5) — il faut que le capteur DOMINE pour que le role se distingue. */
  CHASSEUR: Object.freeze({ achat: 2.5, delta: 1.5 }),
  /* ⛔ `taille` domine ici, la ou le Scout plafonne a 1,5 sur les AUTRES blocks. C est le seul role
   *   dont le sujet est sa propre position dans l echelle des paliers. */
  GRIMPEUR: Object.freeze({ taille: 2.5 }),
});
const NEUTRE = { delta: 1, taille: 1, transfert: 1, message: 1, detenteur: 1, achat: 1, vente: 1 };
/** La sensibilite d un role ; un role inconnu ou absent = neutre (le cerveau d avant). */
export function sensibiliteDe(cle) {
  return { ...NEUTRE, ...(SENSIBILITES[cle] || {}) };
}

export const ETATS_TENDANCE = ['HAUSSE', 'BAISSE', 'PLAT', 'PAS_ASSEZ'];
/** En dessous de ce mouvement relatif, on dit PLAT : le bruit n est pas une tendance. */
export const SEUIL_PLAT = 0.02;
/** ⛔ Trois lectures MINIMUM. Deux points font toujours une droite. */
export const LECTURES_MIN = 3;

/**
 * Le metier d un block, derive de son adresse.
 * ⛔ DETERMINISTE ET SANS STOCKAGE : le meme block a le meme metier chez tout le monde, pour
 *    toujours. Un metier tire au hasard a l ouverture ferait d un block deux personnages.
 * ⚠️ A la creation, ce choix pourra etre FAIT par l utilisateur et voyager avec le block ; tant que
 *    rien ne le grave, il est derive — ce qui est honnete tant qu on le dit a l ecran.
 */
export function metierDe(adresse) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(adresse || ''))) throw new Error('metierDe needs an address');
  const h = keccak256Hex(enc.encode('metier:' + String(adresse).toLowerCase()));
  return METIERS_DERIVES[parseInt(h.slice(2, 10), 16) % METIERS_DERIVES.length];
}

/**
 * La tendance, a partir de lectures HORODATEES de la capitalisation.
 * @param {Array<{at:number, vie:number}>} lectures
 * ⛔ LES LECTURES NON MESUREES SONT JETEES, PAS REMPLACEES PAR ZERO. Un trou dans la serie est un
 *    trou : le combler par zero fabriquerait un effondrement qui n a jamais eu lieu.
 */
export function momentum(lectures) {
  const bonnes = (Array.isArray(lectures) ? lectures : [])
    .filter((l) => l && typeof l.vie === 'number' && Number.isFinite(l.vie) && l.vie > 0)
    .sort((a, b) => (a.at || 0) - (b.at || 0));
  if (bonnes.length < LECTURES_MIN) {
    return { etat: 'PAS_ASSEZ', variation: null, lectures: bonnes.length,
      pourquoi: 'a trend needs ' + LECTURES_MIN + ' readings — ' + bonnes.length + ' so far. Two points always make a line.' };
  }
  const premiere = bonnes[0].vie, derniere = bonnes[bonnes.length - 1].vie;
  const variation = (derniere - premiere) / premiere;
  const etat = Math.abs(variation) < SEUIL_PLAT ? 'PLAT' : variation > 0 ? 'HAUSSE' : 'BAISSE';
  return { etat, variation, lectures: bonnes.length, pourquoi: null };
}

/**
 * Le rapport du metier : des lignes a lire, et des propositions A SIGNER.
 * ⛔ TOUTE PROPOSITION PORTE `signeParUtilisateur: true`. Un test parcourt tous les rapports
 *    possibles et echoue s il en trouve une sans. C est la garde qui empeche ce module de devenir,
 *    un jour, un executeur.
 */
export function rapport({ metier, symbole = null, vie = null, devise = null, tendance = null,
  rang = null, population = null, solde = null, echanges = null, nourriture = null } = {}) {
  /* ⛔ LE METIER EST RETROUVE DANS LA LISTE, PAS CRU SUR PAROLE. Ma premiere version gardait tout
   * objet portant un `cle` : un metier inconnu traversait, et `jamais` s affichait « undefined » —
   * la borne qui rassure devenait un bug a l ecran. */
  const m = METIERS.find((x) => metier && x.cle === metier.cle) || METIERS[0];
  const nom = symbole || 'this block';
  const lignes = [];
  const propositions = [];
  const aVie = typeof vie === 'number' && Number.isFinite(vie) && vie > 0;

  /* ⛔ SANS MARCHE, CHAQUE METIER LE DIT AU LIEU DE MEUBLER. Un rapport qui parle quand meme
   * apprend a ne plus le lire. */
  if (!aVie) {
    /* ⛔ review 2026-11-12 (CLOUD, 375 px) : « never traded » s affichait sous un prix et 130 trades en 24 h. `vie` est NOTRE
     *   lecture de marche ; son absence ne dit rien de l historique du block. */
    lignes.push(nom + ' has no market cap read on TokenizedBlock right now — that says nothing about whether it trades elsewhere.');
  } else {
    lignes.push('Market cap read: ' + vie + (devise ? ' ' + devise : '') + '.');
  }

  if (m.cle === 'MOMENTUM') {
    if (!tendance || tendance.etat === 'PAS_ASSEZ') {
      lignes.push(tendance && tendance.pourquoi ? tendance.pourquoi
        : 'Not enough readings yet to call a trend.');
    } else {
      lignes.push('Trend over ' + tendance.lectures + ' readings: ' + tendance.etat.toLowerCase()
        + ' (' + Math.round(tendance.variation * 1000) / 10 + ' %).');
      /* ⛔ LA PROPOSITION EST UNE PHRASE, PAS UN ORDRE : ni montant, ni slippage, ni envoi. */
      propositions.push({
        quoi: tendance.etat === 'BAISSE' ? 'SELL' : 'BUY',
        pourquoi: 'the last ' + tendance.lectures + ' readings moved '
          + Math.round(tendance.variation * 1000) / 10 + ' %',
        signeParUtilisateur: true,
        avertissement: 'A market cap is buyable: measured 2026-09-09, 0.01 ETH moved a displayed cap '
          + 'by 2 346 ETH. Size is not money in the pool.',
      });
    }
  }

  if (m.cle === 'GARDIEN' && aVie) {
    /* ⛔ SANS TROIS LECTURES, IL LE DIT — il ne dit pas « stable » : le silence d un gardien se lirait
     *    comme « rien ne bouge », ce qui n a jamais ete mesure. */
    if (!tendance || tendance.etat === 'PAS_ASSEZ') {
      const n = tendance ? tendance.lectures : 0;
      lignes.push('Not enough readings to say it moved: ' + n + ' of ' + LECTURES_MIN
        + '. Readings are kept in this browser, one per visit.');
    } else if (tendance.etat === 'PLAT') {
      lignes.push('Did not move over ' + tendance.lectures + ' readings (less than '
        + Math.round(SEUIL_PLAT * 100) + ' %).');
    } else {
      lignes.push('Moved ' + (tendance.variation > 0 ? 'up ' : 'down ')
        + Math.abs(Math.round(tendance.variation * 1000) / 10) + ' % over ' + tendance.lectures + ' readings.');
    }
  }

  if (m.cle === 'ECLAIREUR') {
    lignes.push(rang && population
      ? 'Rank ' + rang + ' of ' + population + ' blocks we could read — not of every block that exists.'
      : 'No rank: not enough blocks were read to compare.');
  }

  if (m.cle === 'COMPTABLE') {
    lignes.push(solde === null ? 'Your balance of this block was not read.'
      : 'You hold ' + solde + ' of it.');
    /* ⛔ AUCUNE PROPOSITION DE COLLECTE. 2026-10-02 : l ancienne phrase (« 0 % fee … no pool fees to collect ») se
     *   lisait comme « aucun frais » alors qu un echange paie le frais affiche avant la signature. */
    lignes.push('Pool liquidity earns no LP fee. Swaps on this block\'s pool carry the fee shown before you sign.');
  }

  if (m.cle === 'HERAUT') {
    lignes.push(aVie
      ? 'Draft: "' + nom + ' is at ' + vie + (devise ? ' ' + devise : '') + ' of life right now."'
      : 'Draft: "' + nom + ' has never been traded yet."');
    propositions.push({
      quoi: 'POST_DRAFT',
      pourquoi: 'a post is written here and sent by you, never by this page',
      signeParUtilisateur: true,
      avertissement: 'Only measured numbers go in a draft — nothing is invented to make it sound better.',
    });
  }

  if (m.cle === 'SENTINELLE') {
    /* ⛔ ce qu elle a VU cette session (fil Live), jamais une estimation ; sans echange vu, elle le dit */
    const a = echanges && Number.isFinite(echanges.achats) ? echanges.achats : null;
    const v = echanges && Number.isFinite(echanges.ventes) ? echanges.ventes : null;
    if (a === null || v === null) lignes.push('No buy or sell seen yet on its market since this page opened.');
    else {
      lignes.push('Seen since this page opened: ' + a + ' buy(s), ' + v + ' sell(s).');
      lignes.push(v > a ? '⚠️ Selling outweighs buying in what was seen — a warning, not an order.'
        : a + v === 0 ? 'Nothing traded in what was seen.' : 'Selling does not outweigh buying in what was seen.');
    }
  }

  if (m.cle === 'ACCUEIL') {
    const n = nourriture && nourriture.etat === 'LUE' ? nourriture : null;
    if (!n) lignes.push('Its recent holders and transfers were not read yet.');
    else {
      lignes.push(n.detenteurs + ' holder(s) reached and ' + n.gm + ' transfer(s) in the recent window.');
      if (n.detenteurs + n.gm > 0) {
        propositions.push({
          quoi: 'GM_BACK',
          pourquoi: 'someone reached ' + nom + ' recently — a GM back is a small transfer you choose and send',
          signeParUtilisateur: true,
          avertissement: 'A GM is a real transfer of this block from your wallet: you pick who and how much, your wallet shows it.',
        });
      }
    }
  }

  return { metier: m, lignes, propositions, jamais: m.jamais };
}
