// motssimples.js — dire la meme chose a quelqu un qui ne connait pas la crypto. SANS rien perdre.
// ================================================================================================
// ⛔ LE LEVIER, ET LE PIEGE. Rendre l app utilisable par des gens normaux, c est traduire
//    « supply == cap », « no pool found among the keys read » et « MAX_UINT160 » en phrases qu on
//    comprend. Et la facon evidente de simplifier, c est d ENLEVER LES RESERVES — « pas de prix »
//    devient « ca ne vaut rien », « on n a pas trouve » devient « il n y en a pas ». On gagnerait
//    en confort exactement ce que cette app a de particulier : elle n affirme jamais plus que ce
//    qu elle a mesure.
//
// ⛔⛔ CHAQUE PHRASE SIMPLE PORTE DONC SA RESERVE, ET UN TEST LE VERIFIE. Une phrase qui affirme
//    sans reserve sur une donnee bornee est un mensonge plus grave que le jargon : le jargon
//    previent qu on ne comprend pas, la phrase simple donne l illusion qu on a compris.
//
// ⛔ ET ON NE TRADUIT QUE CE QU ON A MESURE. Il n y a pas de phrase pour un etat non mesure autre
//    que « on n a pas regarde » — inventer une formule rassurante pour combler un trou serait
//    exactement le defaut que tout ce depot poursuit.
//
// ⚠️ CE N EST PAS DE LA VULGARISATION DECORATIVE : la phrase simple est le TEXTE PRINCIPAL, le
//    terme technique reste dessous pour qui veut verifier. L inverse — jargon en gros, traduction
//    en petit — ne sert que ceux qui n en avaient pas besoin.

/** Les mots qu une phrase simple ne doit JAMAIS contenir sans reserve. */
export const MOTS_ABSOLUS = [
  'safe', 'worthless', 'guaranteed', 'always', 'never loses', 'cannot lose',
  'proven', 'certified', 'verified owner', 'no risk', 'risk-free',
];

/** Les marqueurs de reserve acceptes : au moins un doit apparaitre quand l etat est borne. */
export const MARQUEURS_RESERVE = [
  'we could', 'we looked', 'that we', 'as far as', 'here', 'in the window',
  'not the same as', 'does not mean', 'we did not', 'only', 'so far', 'where we',
];

/**
 * La phrase simple d un signe vital.
 * @param {string} cle     la clef du signe (voir `vitalite.js`)
 * @param {string} etat    'VIF' | 'FAIBLE' | 'NON_MESURE'
 * @returns {{texte: string, technique: string}|null}
 */
export function phraseSigne(cle, etat) {
  const T = {
    mintFerme: {
      VIF: ['All of it was made at birth: the supply equals the cap. Only an admin could raise the cap.', 'supply == cap'],
      FAIBLE: ['More of it can still be created.', 'supply < cap'],
    },
    sansAdmin: {
      VIF: ['Nobody can change it — not its creator, not us.', 'the three roles read as absent'],
      FAIBLE: ['Someone still holds a key that can act on it.', 'a role is held'],
    },
    visage: {
      VIF: ['It has a face, and that face is written into it for good.', 'metadata URI resolved'],
      FAIBLE: ['It has no face written into it, and one cannot be added later.', 'no metadata resolved'],
    },
    porteurs: {
      VIF: ['Several people received some, in the stretch we could read.', 'distinct receiving addresses in the scanned window'],
      FAIBLE: ['Almost nobody received any, in the stretch we could read.', 'one receiving address in the scanned window'],
    },
    mouvement: {
      VIF: ['It changed hands recently, in the stretch we could read.', 'transfers in the scanned window'],
      FAIBLE: ['It sat still in the stretch we could read — that does not mean it is finished.', '0 transfers in the scanned window'],
    },
    liquidite: {
      VIF: ['Someone is willing to trade it, where we looked.', 'a pool answered a quote'],
      FAIBLE: ['Nobody is offering to trade it where we looked — we only look in a few places.', 'no pool answered'],
    },
  };
  const l = T[cle];
  if (!l) return null;
  /* ⛔ NON MESURE A SA PROPRE PHRASE, ET ELLE NE RASSURE PAS. « On n a pas regarde » n est pas une
   * nuance de « tout va bien » : c est une absence, et elle appelle une relecture, pas une
   * conclusion. */
  if (etat === 'NON_MESURE') {
    return { texte: 'We could not read this one. That is about us, not about the block.', technique: 'not measured' };
  }
  const v = l[etat];
  return v ? { texte: v[0], technique: v[1] } : null;
}

/**
 * La phrase simple des points de vie.
 * ⛔ « Pas de prix » ne devient JAMAIS « ca ne vaut rien ». C est la traduction la plus tentante et
 *    la plus fausse : elle transforme une limite de NOTRE lecture en jugement sur la chose.
 */
export function phrasePV(pv, devise, viaPool) {
  if (pv === null || pv === undefined) {
    return {
      texte: 'Nobody has put a price on it where we can see. That is not the same as being worthless — '
        + 'we only look in a few trading places.',
      technique: 'no market cap measurable',
    };
  }
  return {
    texte: 'Right now, everything in it together is valued at about ' + pv + ' points of life'
      + (devise ? ' (measured in ' + devise + ')' : '')
      + (viaPool ? ', from the one trading place we found: ' + viaPool : '')
      + '. It can go down as easily as up, and a price alone is not money in anyone\'s pocket.',
    technique: 'HP = cube root of market cap',
  };
}

/**
 * Ce qu on peut FAIRE, en gestes du quotidien.
 * ⛔ AUCUN GESTE PAYANT DEGUISE EN SOIN. « Donne-lui a manger » pour dire « achete des jetons »
 *    serait la phrase la plus rentable de l app et la plus malhonnete.
 */
export function phraseSoin(cle) {
  const G = {
    mouvement: 'Send a few units to a friend, or to another wallet of yours. The chain notices, and this sign comes back. It costs a network fee, and nothing goes to us.',
    porteurs: 'Share some with someone who wants them. A thing only one person holds is a thing nobody else has a reason to keep alive.',
    liquidite: 'Opening a trading place for it makes it exchangeable. Read what it costs first — this app never opens one for you.',
    visage: 'Its face is written in at birth on this track. It cannot be added later, and saying otherwise would be a lie about something nobody can change.',
    mintFerme: 'This is how the block was made. Nothing you do changes it — it is worth knowing, not fixing.',
    sansAdmin: 'This is how the block was made. Nothing you do as a holder changes it.',
  };
  return G[cle] || null;
}
