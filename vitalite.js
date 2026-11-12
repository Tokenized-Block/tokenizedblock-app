// vitalite.js — la VIE d un block, derivee de faits MESURES. Aucune HP inventee.
// ================================================================================================
// ⛔ L IDEE, ET POURQUOI ELLE TIENT DEBOUT. Phil veut un tamagotchi : un block qui vit, qui perd de
//    la vie, dont on prend soin. La version paresseuse est une barre de HP qui descend sur un
//    minuteur. Elle est FAUSSE, elle se clone en une apres-midi, et elle contredit tout ce que
//    cette app affiche par ailleurs (« Not a game HP bar », le Care explicitement cosmetique).
//
// ⛔⛔ LA VIE EST DEJA SUR LA CHAINE. Elle n est simplement pas montree comme une vie. Un block dont
//    le mint est ferme, sans admin, avec des porteurs et des mouvements recents, EST vivant — et
//    chacun de ces faits se relit. On ne fabrique donc aucun chiffre : on TRADUIT des mesures.
//
// ⛔⛔⛔ ET LA PERTE DE VIE N A PAS BESOIN D UN MINUTEUR. Un minuteur serait un decor : il descend
//    que le block soit utilise ou non, donc il ne dit rien. Ce qui descend VRAIMENT, c est le
//    SILENCE DE LA CHAINE — pas de transfert dans la fenetre lue. Un block dont personne ne parle
//    s eteint ; un block qu on echange respire. C est la meme boucle de jeu, et elle est vraie.
//
// ⛔ CE QUE CE MODULE NE FERA JAMAIS :
//    · pas de score de confiance, pas de badge « verifie », pas de « scammer » ;
//    · pas de verdict sur une PERSONNE — la chaine prouve qui a paye, jamais pourquoi ;
//    · pas de chiffre dont on ne peut pas nommer la mesure et sa borne.
//
// ⚠️ IL EST PUR : aucune lecture reseau ici. On lui DONNE des faits deja mesures, et il rend une
//    lecture. C est ce qui le rend testable hors ligne, et c est ce qui empeche un « fait » de se
//    fabriquer en douce au milieu du calcul.

/** ⛔ Un signe vital ABSENT n est pas un signe vital MAUVAIS. Trois etats, jamais deux. */
export const ETATS = ['VIF', 'FAIBLE', 'NON_MESURE'];

/**
 * Les signes vitaux, dans l ordre d affichage.
 * ⛔ CHAQUE ENTREE PORTE SA BORNE. Un signe sans borne se lit comme universel : « 0 porteur »
 *    voudrait dire « personne n en detient », alors que ca veut dire « personne dans la fenetre
 *    que j ai su lire ».
 * ⚠️ Les poids sont ARBITRAIRES et le disent. Ils ordonnent l affichage et rien d autre — aucun
 *    total ne doit etre lu comme une note. C est pourquoi le total est rendu en FRACTION de ce qui
 *    a ete MESURE, jamais sur un maximum theorique.
 */
export const SIGNES = [
  { cle: 'mintFerme', titre: 'Supply sealed', poids: 3,
    borne: 'supply == cap read on chain — an admin could still raise the cap (see No admin)' },
  { cle: 'sansAdmin', titre: 'No admin', poids: 3,
    borne: 'the three roles read as absent AT THIS BLOCK HEIGHT — a role granted later would change this' },
  { cle: 'visage', titre: 'Face engraved', poids: 1,
    borne: 'a metadata URI that actually resolved — not merely present' },
  { cle: 'porteurs', titre: 'Holders seen', poids: 2,
    borne: 'distinct addresses seen receiving in the scanned window — NOT the holder count' },
  { cle: 'mouvement', titre: 'Recent movement', poids: 2,
    borne: 'transfers inside the scanned window — silence here means silence in THAT window' },
  { cle: 'liquidite', titre: 'Tradable', poids: 2,
    borne: 'a pool answered a quote — not a promise it will answer tomorrow' },
];

/** Le poids total possible — sert UNIQUEMENT a savoir si on en a lu assez pour conclure. */
export const TOTAL_POIDS = SIGNES.reduce((s, d) => s + d.poids, 0);

/** Somme des poids des signes REELLEMENT mesures. ⛔ Jamais le total theorique. */
function poidsMesures(signes) {
  return SIGNES.reduce((s, d) => s + (signes[d.cle] && signes[d.cle].etat !== 'NON_MESURE' ? d.poids : 0), 0);
}

/**
 * La vitalite d un block.
 *
 * @param {object} faits  ce qui a ete MESURE, chaque champ pouvant valoir null = non mesure :
 *   {bigint|null} supply, cap        · scelle si supply === cap et cap > 0
 *   {boolean|null} rolesAbsents      · les trois roles lus absents
 *   {boolean|null} visageResolu      · l URI de metadonnees a REPONDU (pas seulement existe)
 *   {number|null} porteursVus        · adresses distinctes receptrices dans la fenetre
 *   {number|null} transfertsFenetre  · transferts dans la fenetre
 *   {boolean|null} pooleCote         · une pool a rendu une cotation
 *   {object|null} fenetre            · { de, a } en numeros de bloc — OBLIGATOIRE des qu un signe
 *                                      de fenetre est fourni, sinon ce signe est refuse
 */
export function vitalite(faits) {
  const f = faits || {};
  const signes = {};
  const dire = (cle, etat, detail) => { signes[cle] = { etat, detail }; };

  /* ── scellee ─────────────────────────────────────────────────────────────────────────────── */
  if (typeof f.supply === 'bigint' && typeof f.cap === 'bigint' && f.cap > 0n) {
    dire('mintFerme', f.supply === f.cap ? 'VIF' : 'FAIBLE',
      f.supply === f.cap ? 'supply == cap' : 'supply < cap — more units can still be minted');
  } else dire('mintFerme', 'NON_MESURE', 'supply or cap unread');

  /* ── sans admin ──────────────────────────────────────────────────────────────────────────── */
  if (typeof f.rolesAbsents === 'boolean') {
    dire('sansAdmin', f.rolesAbsents ? 'VIF' : 'FAIBLE',
      f.rolesAbsents ? 'the three roles read as absent' : 'at least one role is held — someone can act on it');
  } else dire('sansAdmin', 'NON_MESURE', 'roles unread');

  /* ── visage ──────────────────────────────────────────────────────────────────────────────── */
  if (typeof f.visageResolu === 'boolean') {
    dire('visage', f.visageResolu ? 'VIF' : 'FAIBLE',
      f.visageResolu ? 'metadata URI resolved' : 'no metadata resolved — the block has no engraved face');
  } else dire('visage', 'NON_MESURE', 'metadata not read');

  /* ⛔ LES TROIS SIGNES DE FENETRE EXIGENT LA FENETRE. Sans elle, « 0 porteur » se lirait comme
   * « personne n en detient » au lieu de « personne dans ce que j ai lu ». Un nombre sans sa borne
   * est exactement le defaut que ce depot poursuit partout ailleurs. */
  const fen = f.fenetre && Number.isFinite(f.fenetre.de) && Number.isFinite(f.fenetre.a) ? f.fenetre : null;
  const bornee = (cle, valeur, seuil, mot) => {
    if (!fen) return dire(cle, 'NON_MESURE', 'no scanned window declared — refusing to count without its bound');
    if (!Number.isFinite(valeur)) return dire(cle, 'NON_MESURE', mot + ' unread');
    const n = 'blocks ' + fen.de + '–' + fen.a;
    dire(cle, valeur >= seuil ? 'VIF' : 'FAIBLE',
      valeur + ' ' + mot + ' in ' + n + (valeur >= seuil ? '' : ' — quiet in that window, not necessarily dead'));
  };
  bornee('porteurs', f.porteursVus, 2, 'distinct receiving address(es)');
  bornee('mouvement', f.transfertsFenetre, 1, 'transfer(s)');

  /* ── negociable ──────────────────────────────────────────────────────────────────────────── */
  if (typeof f.pooleCote === 'boolean') {
    dire('liquidite', f.pooleCote ? 'VIF' : 'FAIBLE',
      f.pooleCote ? 'a pool answered a quote' : 'no pool answered — nothing to trade against right now');
  } else dire('liquidite', 'NON_MESURE', 'no quote attempted');

  const mesure = poidsMesures(signes);
  const vifs = SIGNES.reduce((s, d) => s + (signes[d.cle].etat === 'VIF' ? d.poids : 0), 0);
  const nonMesures = SIGNES.filter((d) => signes[d.cle].etat === 'NON_MESURE').map((d) => d.cle);

  /* ⛔⛔ LE TOTAL EST UNE FRACTION DE CE QUI A ETE MESURE, PAS D UN MAXIMUM THEORIQUE. Diviser par
   * le total des poids ferait CHUTER la vitalite quand le RESEAU tombe — un block parfaitement
   * vivant paraitrait mourant parce qu un noeud n a pas repondu. Ce serait « je n ai pas regarde »
   * presente comme « c est faible », le defaut n°1 de ce depot.
   * ⇒ Quand rien n est mesure, il n y a pas de vitalite : `null`, et on le DIT. */
  const surCent = mesure > 0 ? Math.round((vifs / mesure) * 100) : null;

  return {
    signes,
    /* ⚠️ `surCent` est une part DES SIGNES MESURES. Il n est comparable entre deux blocks que si
     * les MEMES signes ont ete mesures — la liste `nonMesures` existe pour qu on puisse le voir. */
    surCent,
    poidsMesure: mesure,
    nonMesures,
    /* ⛔ L ETAT GLOBAL EST UN MOT, PAS UN VERDICT SUR QUELQU UN. Il decrit le JETON.
     * ⛔⛔ ET IL REFUSE DE CONCLURE SOUS LA MOITIE DU POIDS. Mesure a l ecran le 2026-09-08 : un
     * block dont UN SEUL signe sur six etait lu affichait « 100 % · VIF » en vert. Chaque mot
     * etait vrai — la part porte bien sur ce qui est mesure, et « 5 signes non mesures » etait
     * ecrit a cote — mais l oeil lit la pastille, pas la note. Une lecture partielle prenait l air
     * d un bulletin de sante.
     * ⇒ Sous 50 % du poids total, l etat devient PARTIEL : la part reste affichee, la CONCLUSION
     * est retenue. C est la meme regle que partout ici — ne pas conclure plus que ce qu on a lu. */
    etat: surCent === null ? 'NON_MESURE'
      : mesure * 2 < TOTAL_POIDS ? 'PARTIEL'
      : surCent >= 80 ? 'VIF' : surCent >= 40 ? 'ASSOUPI' : 'SILENCIEUX',
    /* ⚠️ Publie pour que l ecran puisse dire « 3 sur 13 » plutot qu un pourcentage seul. */
    poidsTotal: TOTAL_POIDS,
    /* ⛔ CE QUE CE CHIFFRE N EST PAS. Ecrit ici pour qu il voyage AVEC lui : un appelant qui
     * n afficherait que `surCent` afficherait un score de confiance, et ce n en est pas un. */
    cequecenestpas: 'Not a trust, safety or scammer score. It describes the TOKEN, never a person. '
      + 'Every sign is a re-readable measurement with its own bound.',
  };
}

/**
 * Ce qui ferait remonter la vitalite — la boucle « prends soin de ton block ».
 * ⛔ CHAQUE CONSEIL EST UN GESTE REEL, JAMAIS UN ACHAT DE JETON DE SOIN. Un objet de jeu payant qui
 *    « soigne » un block serait un chiffre invente vendu contre de l argent reel : exactement ce
 *    que ce depot refuse d afficher, et probablement ce que la loi appelle autrement.
 * ⚠️ Et le conseil pour un signe NON MESURE n est pas « ameliore-le » mais « re-mesure » : on ne
 *    demande pas a quelqu un de reparer ce qu on n a pas su lire.
 */
export function commentPrendreSoin(v) {
  const r = [];
  const s = (v && v.signes) || {};
  const dit = (cle, texte) => { if (s[cle]) r.push({ cle, etat: s[cle].etat, texte }); };
  if (s.mouvement && s.mouvement.etat === 'FAIBLE') dit('mouvement', 'Nothing moved in the scanned window. A single real transfer — to a friend, to another wallet of yours — makes this sign live again. It is the chain noticing your block, not a payment to us.');
  if (s.porteurs && s.porteurs.etat === 'FAIBLE') dit('porteurs', 'Only one address received units in the window. Share some with someone who wants them; a block held by one address is a block nobody else has a reason to keep alive.');
  if (s.liquidite && s.liquidite.etat === 'FAIBLE') dit('liquidite', 'No pool answered a quote. Launching one makes the block tradable — read the cost first; this app never opens a pool for you.');
  if (s.visage && s.visage.etat === 'FAIBLE') dit('visage', 'No metadata resolved. A face is engraved AT CREATION on this track — it cannot be added afterwards, and pretending otherwise would be a lie about an immutable token.');
  if (s.mintFerme && s.mintFerme.etat === 'FAIBLE') dit('mintFerme', 'supply < cap: more units can still be minted. That is a property of this token, not something care can change.');
  if (s.sansAdmin && s.sansAdmin.etat === 'FAIBLE') dit('sansAdmin', 'A role is held on this token. Nothing you do as a holder changes that — it is worth knowing, not fixing.');
  for (const cle of (v && v.nonMesures) || []) {
    r.push({ cle, etat: 'NON_MESURE', texte: 'Not measured — this is a reason to re-read, not a weakness of the block.' });
  }
  return r;
}
