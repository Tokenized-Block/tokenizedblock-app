/* slots-regleur.js — LE REGLEUR (keeper) DU JEU (v4 slots, option 3 de Phil, 2026-10-23 ; v5 2026-10-24 : duels + pot du pass des rolls).
 * Pourquoi : un spin non regle dans sa fenetre (256 blocs, ~51 s a 200 ms/bloc) est PERDU ; un duel rejoint non regle devient un
 * remboursement (le joueur qui a rejoint garde une OPTION GRATUITE : il regle s il gagne, se tait s il perd) ; un pot du jour arme non tire
 * se re-arme (un acheteur peut re-armer jusqu a ce que le hash le choisisse). settle / settleMany (slots), settle (duels), closeDay /
 * drawDay (rolls) sont PERMISSIONLESS et paient TOUJOURS selon les regles du contrat : le regleur ne paie que son gas, il ne touche rien.
 *
 * ⛔ CE QUE CE MODULE FAIT, ET RIEN D AUTRE :
 *   - SANS la variable SLOTS_KEEPER_KEY (le proprietaire cree et approvisionne ce wallet lui-meme ; personne d autre ne voit la cle) : il
 *     ne fait RIEN et le dit (etat OFF, et pourquoi) ; aucune lecture de chaine. UNE seule cle pour tous les contrats (slots, duels v1 et v2, rolls).
 *   - AVEC : toutes les `intervalleMs` (derive du temps de bloc MESURE — longue et courte, prudent, comme le serveur : un dixieme de la fenetre, borne a [2 s, 10 s] ; sans mesure, le pire cas 200 ms — DENIM 2026-11-05), il lit :
 *       slots  — les Spun d une fenetre BORNEE (<= 300 blocs, puis les seuls blocs nouveaux + 8), les statuts, les hashes, le pot ;
 *                refait le calcul du contrat (slots-plan.js planReglement) -> settleMany(ids) des spins que le pot paie en ENTIER ;
 *       duels  — DECOUVERTS par la liste de l ETAT (duels.joints / duels.connu : le cache de /api/duels, nextId + duels(id), sans
 *                eth_getLogs) ET par les Joined d une fenetre BORNEE (meme regle ; un refus de getLogs ne coute rien si la liste de l etat
 *                est lue). CLASSES UNE FOIS des que le hash de leur cible existe (tete >= cible) : les guesses et la mise viennent de la
 *                liste de l etat (aucune lecture) ou d UN duels(id) (au plus classementsParTour par tour, l echeance la plus proche
 *                d abord), le hash d un en-tete de bloc (cache par bloc, au plus max(entetesParTour, 2 tours de blocs) par tour) ->
 *                le VAINQUEUR calcule comme le contrat (faceDuHash = BlockDuels.faceOf, puis les deux scores) :
 *                  egalite      -> JAMAIS regle (les deux mises sont rendues, par settle comme par refundExpired : rien a proteger) ;
 *                  createur     -> settle(id) des cible + delaiDuelBlocs (l OPTION GRATUITE : le perdant qui a rejoint se tait) ;
 *                  rejoignant   -> settle(id) seulement PRES DE LA FIN (tete + 1 >= cible + 256 - marge) : le gagnant qui a rejoint,
 *                  (ou hash       en ligne, a toutes les raisons de regler lui-meme ; le regleur ne passe que s il ne l a pas fait.
 *                   illisible)
 *                Pourquoi un delai et pas cible + 1 (2026-10-24, revue keeper 1) : le risque du createur n existe qu A LA FIN de la
 *                fenetre (le rejoignant perdant laisse filer jusqu au remboursement) ; envoyer a cible + 1 fait COURIR le regleur contre
 *                le gagnant (ou un attaquant) qui regle au meme bloc — sa tx minee revert (NotJoined) pour rien. Le delai laisse le
 *                gagnant regler d abord ; la marge de fin (>= margeFinDuelBlocs, et >= 3 tours au temps de bloc MESURE, 200 ms sans
 *                mesure) laisse plusieurs tours pour que le settle du regleur tombe dans la fenetre. Parmi les duels prets : les
 *                PRESSES d abord (par echeance), puis ceux ou le createur gagne, par MISE decroissante ;
 *                ⛔ revue fix2 defaut 1 (2026-10-24, famine par egalites, chemins A et B) : une EGALITE et un duel FINAL ne sont plus
 *                jamais suivis ni relus (duelsClos, jusqu a la fin de leur fenetre), meme si une liste perimee les cite encore ; les
 *                lectures de STATUT (statutsParTour) ne vont qu aux candidats, dans l ORDRE D ENVOI (presses par echeance, puis createur
 *                gagnant par mise), au plus simulationsParTour ; au-dela de suivisMax, sortent d abord les rejoignants gagnants (le plus
 *                de temps d abord), JAMAIS un duel ou le createur gagne dans sa fenetre ; un non classe ne sort qu au-dela de suivisDurMax ;
 *       rolls  — today() et les `joursRecul` jours passes : un jour fini avec des acheteurs, Open -> closeDay(jour) ; Armed dans sa
 *                fenetre -> drawDay(jour) ; Armed hors fenetre -> closeDay(jour) (re-arme, puis tire au tour suivant). ⛔ buyerCount = 0
 *                n est retenu (jour sans acheteur, plus jamais relu) que lu PLUS D UN JOUR apres la fin du jour (today() > jour + 1) :
 *                juste apres minuit un noeud en retard peut rendre 0 pour un jour dont les acheteurs ont achete dans ses dernieres
 *                secondes (revue keeper 4) — relu a chaque tour jusque-la. Un compte > 0 ne sert qu a « il y a des acheteurs ».
 *     Au plus UNE tx par tour, la plus PRESSEE d abord (le dernier bloc ou elle passe encore ; un closeDay n a pas d echeance) ; chaque
 *     contrat garde son propre ordre (duels : presses, puis createur gagnant par mise) et la tete de chaque liste est comparee.
 *   - ⛔ FENETRE : une tx signee a la tete H est minee au mieux en H + 1 : rien n est envoye si H + 1 depasse la fenetre du contrat.
 *   - BORNES (BORNES_DEFAUT, chacune verifiee par test-slots-regleur) : au plus `spinsParTx` spins par tx ; jamais au-dessus de
 *     `maxFeeWei` par unite de gas ; au plus `txParHeure[contrat]` tx par heure glissante POUR CHAQUE contrat (slots, duels, rolls : un
 *     contrat inonde n affame pas les deux autres — revue keeper 2) ; au plus `gasMaxParTx` de gas ; une seule tx en vol ;
 *     au plus `simulationsParTour` simulations par tour ; ARRET apres `echecsMax` echecs de suite — jusqu au redemarrage.
 *   - ⛔ CE QUI EST UN ECHEC (compte vers l arret) : un revert MINE que le regleur ne s EXPLIQUE pas, un envoi REFUSE d une tx bien formee
 *     (apres verification : un « nonce too low » / « replacement underpriced » dont la tx est vue sur la chaine n en est pas un), une tx
 *     jamais incluse (120 s), un recu illisible pendant 120 s (l issue de la tx est INCONNUE : comptee comme non incluse — revue keeper 3).
 *     Un revert EXPLIQUE (revue keeper 1) : la cible relue apres le revert montre qu un AUTRE l a deja fait — duel Settled ; jour tire
 *     (Drawn) ou arme / re-arme par un autre au bloc du recu ou avant — compte a part (revertsExpliques), jamais vers l arret. Un revert
 *     des slots ne s explique jamais ainsi (settleMany SAUTE un spin deja regle, il ne revert pas pour lui). Cible illisible apres le
 *     revert : relue aux tours suivants, comptee au bout de 120 s. Une erreur RPC (eth_estimateGas) est PASSAGERE : jamais comptee. Un
 *     tour SAIN (tout lu, rien a faire) remet le compte a zero. etat().degrade le dit tant que des echecs sont en cours (/sante).
 *   - ⛔ settleMany qui ne se simule pas (un paiement refuse, liste noire USDC) : le lot est COUPE en deux jusqu a isoler le spin fautif,
 *     ecarte jusqu a la fin de sa fenetre ; les autres spins couverts partent.
 *   - ⛔ JAMAIS autre chose que : settleMany(uint256[]) / settle(uint256) vers le contrat des SLOTS ; settle(uint256) vers le contrat des
 *     DUELS ; closeDay(uint32) / drawDay(uint32) vers le contrat des ROLLS (les adresses des fiches) ; value 0 ; la chaine de la fiche.
 *     DENIM 2026-11-05 : et settleMany(uint256[]) (1..rollsParTx ids) vers le contrat des ROLLS (les rolls joues GAGNANTS dans leur
 *     fenetre) ; settle(uint256) vers BlockDuelsV2 (un duel que le REJOIGNANT gagne, prouve par un eth_call de settle juste avant).
 *     Jamais settleDefault, jamais expire, jamais refundExpired.
 *     verifierEnvoi() le controle juste avant CHAQUE signature et jette sinon (rien n est signe).
 *   - ⛔ La cle n est lue que du parametre `cle` (le serveur le prend dans process.env, et nulle part ailleurs) ; elle reste dans la
 *     fermeture ; etat() ne la rend jamais, aucune erreur ne la cite, rien ne la journalise. L ADRESSE du regleur est publique (/sante).
 *   - ⛔ LA SANTE DE LA LECTURE DES DUELS (revue duels-gate D1) : etat().contrats.duels.lu = l heure de la derniere lecture REUSSIE
 *     (decouverte lue : logs ou liste de l etat ; et pas TOUTES les lectures du tour en echec), erreurLecture = l erreur de la derniere
 *     lecture ratee (null apres un succes). duels-plan-app.js regleurCouvre exige lu de moins de 3 intervalles et erreurLecture null : un
 *     regleur ON qui ne lit pas les duels ne les ouvre pas. Un tour qui attend sa tx en vol ne lit rien : la porte se ferme apres 3 tours.
 * NE PROUVE PAS (dit) : un reglement reel sur Base ; le banc anvil execute les vrais contrats sur une chaine LOCALE (la course perdue y est
 *   rejouee par un minage manuel, pas par un vrai sequenceur ; le temps de bloc y est INJECTE, 200 ms : anvil mine en ~20 ms).
 * ⛔ ROUND 4 (decision du lead) : ce regleur ne SUFFIT PAS a fermer l option gratuite de BlockDuels v1 (famine du classement par
 *   egalites, statuts refuses, gas / plafond horaire / tete gelee : il lit sans pouvoir envoyer) -> duels-plan-app.js DUELS_REGLEUR_SUFFIT
 *   ferme creer / rejoindre sur ce contrat, quel que soit cet etat. Il continue de REGLER les duels deja rejoints ; il n ouvre rien.
 * RESTE (dit, 2026-10-24 round 3 ; chiffres de la revue, NON mesures sur Base) :
 *   - le PLAFOND des duels (30 tx / heure) et le tour a UNE tx : un attaquant les use avec des duels a lui ou SON createur gagne (deux
 *     wallets), a mise >= celle de la victime. Chaque settle que le regleur envoie pour lui lui coute 10 % du pot de 2 x mise : 0,02 USDC a
 *     la mise minimale de 0,10 USDC, plus le gas (le plafond : 30 x 0,02 = 0,60 USDC par heure ; les ~5 tours d une fenetre a 10 s et
 *     200 ms/bloc : 5 settles, 0,10 USDC). Les slots et les rolls gardent leur plafond ; parmi les duels la plus grosse mise passe d abord.
 *   - les egalites ne coutent que le gas (mises rendues), mais elles ne prennent plus de lecture de statut ni de place : connues du cache
 *     de /api/duels, elles se classent sans aucun duels(id) ; INCONNUES de ce cache (creees et rejointes pendant son retard : 50 ids par
 *     tour de 30 s), une lecture chacune, au plus classementsParTour (60) par tour. Affamer une victime ELLE AUSSI inconnue du cache demande
 *     plus de 60 egalites nouvelles a cible plus ancienne a CHAQUE tour de sa fenetre : ~300 duels (~900 tx de gas : create, join, refund). */
import * as Slots from './slots-plan.js';
import { selecteur, topic, keccak256 } from './keccak.js';
import { adresseDe } from './signeur-secp256k1.js';
import { signerEip1559 } from './tx-eip1559.js';
/* DENIM (2026-11-05) : la mesure courte et le temps prudent, les MEMES que ceux du serveur (temps-de-bloc.js, pur) */
import { sParBlocBorneBasse, sParBlocPrudent, enteteVersMesure, RECUL_COURT_BLOCS } from './temps-de-bloc.js';

export const SEL_SETTLE_MANY = selecteur(Slots.SIG_SETTLE_MANY).toLowerCase();
/* settle(uint256) : le MEME selecteur pour BlockSlots et BlockDuels ; la garde le juge par la DESTINATION */
export const SEL_SETTLE = selecteur(Slots.SIG_SETTLE).toLowerCase();
export const SEL_CLOSE_DAY = selecteur('closeDay(uint32)').toLowerCase();
export const SEL_DRAW_DAY = selecteur('drawDay(uint32)').toLowerCase();
export const SEL_DUELS = selecteur('duels(uint256)').toLowerCase();
export const SEL_TODAY = selecteur('today()').toLowerCase();
export const SEL_DAY_POTS = selecteur('dayPots(uint32)').toLowerCase();
export const SEL_BUYER_COUNT = selecteur('buyerCount(uint32)').toLowerCase();
export const TOPIC_JOINED = topic('Joined(uint256,address,uint8[5],uint256)');
export const TOPIC_DUEL_SETTLED = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
export const TOPIC_DAY_CLOSED = topic('DayClosed(uint32,uint256,uint256,uint256,address)');
export const TOPIC_DAY_DRAWN = topic('DayDrawn(uint32,address,bytes32,uint256,uint256)');
/* BlockDuels.Status : None 0, Open 1, Joined 2, Settled 3, Cancelled 4, Refunded 5 ; BlockRolls.DayState : Open 0, Armed 1, Drawn 2 */
const DUEL_JOINED = 2, DUEL_SETTLED = 3;
const FENETRE = 256;
const ROLLS_DELAI_CIBLE = 2; /* BlockRolls.TARGET_DELAY : closeDay arme a bloc + 2 */
/* DENIM (2026-11-05) : deux cibles de plus, chacune son plafond et son activite.
 *   duelsV2    — BlockDuelsV2 : settle(id) d un duel rejoint que le REJOIGNANT gagne (sinon, apres la fenetre, settleDefault le donne au
 *                createur : le gagnant qui a rejoint perdrait). Jamais un duel ou le createur gagne (le defaut paie la meme chose), jamais
 *                une egalite (le defaut la donne au createur ; la regler changerait l issue : decision de Phil, pas du regleur).
 *   rollsJoues — BlockRolls : settleMany(ids) des rolls PAYES par les joueurs, GAGNANTS, dans leur fenetre (un roll non regle dans les 256
 *                blocs apres sa cible est PERDU). Meme contrat que `rolls` (closeDay / drawDay), un autre selecteur, un autre plafond. */
export const CONTRATS = Object.freeze(['slots', 'duels', 'rolls', 'duelsV2', 'rollsJoues']);
export const SEL_ROLLS = selecteur('rolls(uint256)').toLowerCase();
export const SEL_RULES = selecteur('rules(uint16)').toLowerCase();
export const SEL_POT = selecteur('pot()').toLowerCase();
export const TOPIC_ROLLED = topic('Rolled(uint256,address,uint8[5],uint256,bool,uint256,uint256)');
export const TOPIC_ROLL_SETTLED = topic('Settled(uint256,address,bytes32,uint8[5],uint8,uint256,uint256)');
/* BlockDuelsV2.Status : ... Joined 2, Settled 3, ..., Defaulted 6 ; BlockRolls.Status : None 0, Pending 1, Settled 2, Expired 3 */
const ROLL_PENDING = 1;

export const BORNES_DEFAUT = Object.freeze({
  spinsParTx: 10,
  maxFeeWei: 1_000_000_000n, /* 1 gwei : Base tourne d ordinaire bien en dessous ; au-dessus, le regleur attend */
  prioWeiMax: 100_000_000n, /* 0,1 gwei de pourboire au plus */
  /* PAR CONTRAT (un nombre seul = le meme plafond pour chacun) : slots 60, duels 30, rolls 12 tx par heure glissante */
  /* DENIM 2026-11-05 : duelsV2 30 (comme v1), rollsJoues 60 (comme les slots : un lot de 10 rolls par tx) */
  txParHeure: Object.freeze({ slots: 60, duels: 30, rolls: 12, duelsV2: 30, rollsJoues: 60 }),
  rollsParTx: 10, /* rollsJoues : au plus 10 rolls par settleMany (la garde le verifie) */
  delaiDuelBlocs: 16, /* un duel ou le createur gagne : regle a partir de cible + 16 (le gagnant en ligne regle d abord) */
  margeFinDuelBlocs: 64, /* un duel ou le rejoignant gagne : regle a partir de cible + 256 - marge (marge >= 3 tours mesures) */
  gasMaxParTx: 3_000_000n,
  echecsMax: 3,
  intervalleMinMs: 2000,
  intervalleMaxMs: 10000,
  reculLogs: 300, /* > 256 + 2 : un spin / un duel plus vieux ne se regle plus */
  suivisMax: 200, /* duels : au-dela, les rejoignants gagnants sortent (jamais un createur gagnant dans sa fenetre) */
  suivisDurMax: 5000, /* duels : au-dela, les NON classes sortent aussi (le plus de temps d abord) — une borne memoire, pas une politique */
  closMax: 20000, /* duels : egalites et finals retenus (jamais relus) jusqu a la fin de leur fenetre, au plus */
  statutsParTour: 30,
  classementsParTour: 60, /* duels : duels(id) lus pour CLASSER un duel dont la liste de l etat ne donne pas les guesses */
  entetesParTour: 64, /* duels : en-tetes de cible lus par tour, au moins (et au moins 2 tours de blocs au temps de bloc) */
  simulationsParTour: 12, /* la coupe en deux d un lot de 10 avec un spin fautif : 1 + 2 x 4 au plus */
  joursRecul: 7, /* les pots du pass des 7 derniers jours UTC */
  /* ⛔ DENIM (2026-11-05) : un PLAFOND. La borne effective est FENETRE / 3 au temps de bloc (inclusionMaxDepuisBloc) : 120 s = 600 blocs a
   *   200 ms, plus que la fenetre de 256 — une tx coincee bloquait tout autre envoi bien apres la fin des fenetres. 2 s/bloc : 120 s (inchange). */
  inclusionMaxMs: 120000,
  inclusionMinMs: 4000,
  /* DENIM : tours par fenetre de 256 blocs (intervalleDepuisBloc) — 10 : ~5,1 s a 200 ms (5 seulement avant, a 10 s) ; 2 s/bloc : 10 s (borne) */
  toursParFenetre: 10,
  /* DENIM : la mesure COURTE (temps-de-bloc.js, RECUL_COURT_BLOCS), relue au plus toutes les 15 s comme celle du serveur ; le temps retenu est
   *   sParBlocPrudent(longue, courte) : la mesure longue seule (relue toutes les 10 min) garderait 2 s ~10 min apres la bascule */
  mesureCourteToutesMs: 15000,
  /* round 4 (tete GELEE, revue keeper round 3) : une tete qui ne depasse pas la plus haute deja lue pendant plus de teteGeleeBlocs temps de
   *   bloc (mesure ou injecte ; 200 ms sans mesure, le pire cas de Base) -> etat DEGRADE, rien n est envoye sur cette tete */
  teteGeleeBlocs: 30,
  mesureToutesMs: 600000,
  blocsMesure: Slots.BLOCS_MESURE,
});

/** le pire cas de Base apres Denim (200 ms/bloc) : le temps suppose tant qu il n est pas mesure, pour les bornes qui doivent tenir DANS la
 *  fenetre (jamais 2 s : une borne a 2 s depasserait la fenetre de 10x) */
const MS_PIRE_CAS = 200;
/** l intervalle entre deux tours : 1/toursParFenetre de la fenetre au temps de bloc MESURE, borne ; sans mesure, au pire cas (200 ms).
 *  ⛔ DENIM (2026-11-05) : avant, 1/5 de la fenetre et 10 s sans mesure — ~5 tours par fenetre de 51 s apres Denim. */
export function intervalleDepuisBloc(msParBloc, bornes = BORNES_DEFAUT) {
  const ms = Number(msParBloc) > 0 ? Number(msParBloc) : MS_PIRE_CAS;
  const v = Math.floor((Slots.secondesFenetre(ms) * 1000) / (Number(bornes.toursParFenetre) > 0 ? Number(bornes.toursParFenetre) : 10));
  return Math.max(bornes.intervalleMinMs, Math.min(bornes.intervalleMaxMs, v));
}
/** combien de temps une tx envoyee reste « en vol » (rien d autre ne part) avant d etre relachee : FENETRE / 3 au temps de bloc (pire cas
 *  200 ms sans mesure), borne [inclusionMinMs, inclusionMaxMs]. 200 ms -> ~17 s (85 blocs) ; 2 s -> 120 s (le plafond, inchange). */
export function inclusionMaxDepuisBloc(msParBloc, bornes = BORNES_DEFAUT) {
  const ms = Number(msParBloc) > 0 ? Number(msParBloc) : MS_PIRE_CAS;
  return Math.min(bornes.inclusionMaxMs, Math.max(bornes.inclusionMinMs, Math.floor((FENETRE * ms) / 3)));
}

const bas = (x) => String(x || '').toLowerCase();
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const motsDe = (data) => (String(data || '').replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const adresseOk = (x) => (/^0x[0-9a-f]{40}$/.test(bas(x)) ? bas(x) : null);
const resoudre = (x) => { try { return adresseOk(typeof x === 'function' ? x() : x); } catch (_) { return null; } };

/** les donnees de settleMany(ids) (ABI : offset 32, longueur, ids) */
export const donneesSettleMany = (ids) => SEL_SETTLE_MANY + u(32) + u(ids.length) + ids.map((x) => u(x)).join('');
/** un appel a UN argument : selecteur + un mot */
const donnees1 = (sel, x) => sel + u(x);

/** une erreur de simulation = un REVERT de l execution (le contrat refuse), pas une panne de transport (rate limit, delai, noeud muet) */
export const estRevert = (e) => /revert/i.test(String((e && e.message) || e)) || (e && typeof e.data === 'string' && /^0x[0-9a-f]{8,}/i.test(e.data));

/** la face d un hash de bloc, comme BlockDuels.faceOf (= BlockRolls.faceOf) : keccak256 de "0x" + les 40 premiers chiffres hex
 *  MINUSCULES du hash ; teinte = (k0*256+k1) % 361 ; [((teinte+30) % 360) / 60, k6 % 10, k7 % 19, k8 % 9, k9 % 8]. null si illisible.
 *  (le banc anvil compare au contrat COMPILE : le vainqueur predit = celui de l evenement Settled) */
export function faceDuHash(h) {
  const s = bas(h);
  if (!/^0x[0-9a-f]{64}$/.test(s)) return null;
  const k = keccak256(new TextEncoder().encode('0x' + s.slice(2, 42)));
  const teinte = (k[0] * 256 + k[1]) % 361;
  return [Math.floor(((teinte + 30) % 360) / 60), k[6] % 10, k[7] % 19, k[8] % 9, k[9] % 8];
}
/** un guess EMBALLE (uint24 de BlockDuels._pack) -> [bande, orbite, facette, matiere, ornement] (BlockDuels._unpack) */
export const deballerGuess = (p) => { const x = Number(p); return [(x >> 16) & 0x0f, (x >> 12) & 0x0f, (x >> 7) & 0x1f, (x >> 3) & 0x0f, x & 0x07]; };
/** l inverse : un guess DEBALLE (la forme de duels-plan.js lireDuel, celle du cache de /api/duels) ou deja emballe -> l uint24 ; null sinon */
export function emballerGuess(g) {
  if (Array.isArray(g)) {
    const max = [16, 16, 32, 16, 8];
    if (g.length !== 5 || !g.every((x, i) => Number.isInteger(x) && x >= 0 && x < max[i])) return null;
    return (g[0] << 16) | (g[1] << 12) | (g[2] << 7) | (g[3] << 3) | g[4];
  }
  if (typeof g === 'number' || typeof g === 'bigint') { const v = Number(g); return Number.isSafeInteger(v) && v >= 0 && v < 2 ** 24 ? v : null; }
  return null;
}
/** le vainqueur d un duel comme BlockDuels._settle : 'createur' | 'rejoignant' | 'egalite' ; null si le hash est illisible */
export function vainqueurDuel(hash, guessA, guessB) {
  const f = faceDuHash(hash);
  if (!f) return null;
  const score = (g) => deballerGuess(g).reduce((s, x, i) => s + (x === f[i] ? 1 : 0), 0);
  const a = score(guessA), b = score(guessB);
  return a === b ? 'egalite' : a > b ? 'createur' : 'rejoignant';
}
/** le plafond horaire d UN contrat : `txParHeure` nombre (le meme pour tous) ou { slots, duels, rolls } */
export const plafondHeure = (bornes, cible) => { const p = bornes.txParHeure; const v = typeof p === 'object' && p !== null ? p[cible] : p; return Number.isFinite(Number(v)) ? Number(v) : 0; };
/** la marge de fin d un duel ou le rejoignant gagne (blocs avant cible + 256) : >= margeFinDuelBlocs et >= 3 tours au temps de bloc
 *  mesure (200 ms sans mesure, le pire cas de Base) ; jamais au point de preceder cible + delaiDuelBlocs */
export function margeFinDuel(bornes, msParBloc, intervalleMs) {
  const ms = Number(msParBloc) > 0 ? Number(msParBloc) : 200;
  const tours = Math.ceil((3 * Number(intervalleMs || bornes.intervalleMaxMs)) / ms);
  return Math.min(FENETRE - bornes.delaiDuelBlocs - 1, Math.max(bornes.margeFinDuelBlocs, tours));
}

/**
 * ⛔ LA GARDE AVANT CHAQUE SIGNATURE : jette sauf si la tx est sans valeur, sur la bonne chaine, et ne porte QUE :
 *   vers `contrat` (slots) : settleMany(ids) (1..spinsParTx ids, encodage canonique) ou settle(id) ;
 *   vers `duels`           : settle(id) ;
 *   vers `rolls`           : closeDay(jour) / drawDay(jour) (jour < 2^32, un seul mot) ;
 *                            DENIM 2026-11-05 : et settleMany(ids) (1..rollsParTx ids, encodage canonique) — les rolls joues ;
 *   vers `duelsV2`         : settle(id) SEUL (jamais settleDefault, jamais refundExpired, rien d autre).
 * Rend le nombre de spins / rolls (settleMany) ou 1.
 */
/* le nombre d ids d un settleMany CANONIQUE (offset 32, longueur, ids) entre 1 et max ; jette sinon */
function lotCanonique(d, max) {
  const mots = motsDe('0x' + d.slice(10));
  const n = mots.length - 2;
  if ((d.length - 10) % 64 !== 0 || n < 1 || mots[0] !== 32n || mots[1] !== BigInt(n)) throw new Error('keeper: refused, a rolls batch is not canonical');
  if (n > max) throw new Error('keeper: refused, ' + n + ' rolls in one transaction (max ' + max + ')');
  return n;
}
export function verifierEnvoi(tx, { contrat, chainId, bornes = BORNES_DEFAUT, duels = null, rolls = null, duelsV2 = null, slotsAvant = null }) {
  const cS = adresseOk(contrat), cD = adresseOk(duels), cR = adresseOk(rolls), cV = adresseOk(duelsV2), cA = adresseOk(slotsAvant);
  if (!cS && !cD && !cR && !cV && !cA) throw new Error('keeper: no keeper contract');
  if (BigInt(tx.value ?? 0) !== 0n) throw new Error('keeper: refused, a keeper call carries no value');
  if (BigInt(tx.chainId) !== BigInt(chainId)) throw new Error('keeper: refused, wrong chain');
  const to = bas(tx.to), d = bas(tx.data);
  /* 2026-11-12 (Phil: the new Spin): the EARLIER Spin (slotsAvant) is drained by the same rule as the slots contract: settleMany / settle only */
  if ((cS && to === cS) || (cA && to === cA)) {
    if (d.startsWith(SEL_SETTLE) && d.length === 10 + 64) return 1;
    if (!d.startsWith(SEL_SETTLE_MANY)) throw new Error('keeper: refused, only settleMany / settle are ever sent to the slots contract');
    const m = motsDe('0x' + d.slice(10));
    if ((d.length - 10) % 64 !== 0 || m.length < 3 || m[0] !== 32n || m[1] !== BigInt(m.length - 2)) throw new Error('keeper: refused, settleMany data is not canonical');
    const k = m.length - 2;
    if (k < 1 || k > bornes.spinsParTx) throw new Error('keeper: refused, ' + k + ' spins in one transaction (max ' + bornes.spinsParTx + ')');
    return k;
  }
  if (cD && to === cD) {
    if (d.startsWith(SEL_SETTLE) && d.length === 10 + 64) return 1;
    throw new Error('keeper: refused, only settle(uint256) is ever sent to the duels contract');
  }
  if (cV && to === cV) {
    if (d.length === 10 + 64 && d.startsWith(SEL_SETTLE)) return 1;
    throw new Error('keeper: refused, only settle(uint256) is ever sent to the duels v2 contract');
  }
  if (cR && to === cR) {
    if (d.startsWith(SEL_SETTLE_MANY)) return lotCanonique(d, Number(bornes.rollsParTx) > 0 ? Number(bornes.rollsParTx) : 10);
    if ((d.startsWith(SEL_CLOSE_DAY) || d.startsWith(SEL_DRAW_DAY)) && d.length === 10 + 64 && /^[0-9a-f]{64}$/.test(d.slice(10)) && BigInt('0x' + d.slice(10)) < 2n ** 32n) return 1;
    throw new Error('keeper: refused, only closeDay / drawDay are ever sent to the rolls contract');
  }
  throw new Error('keeper: refused, the destination is not a keeper contract');
}

class Passagere extends Error {}

/**
 * le regleur. `rpc(methode, params)` -> resultat JSON-RPC (jette sur une erreur) ; `rpcEnvoi` (defaut rpc) sert au SEUL
 * eth_sendRawTransaction. `contrat` + `table` + `blocDeploiement` : les slots ; `duels` = { contrat, bloc } et `rolls` = { contrat }
 * (une adresse, ou une fonction relue a chaque tour : la fiche des duels arrive par un import dynamique). `duels.joints()` (les rejoints non
 * finaux { id, targetBlock, guessA, guessB, stake } du cache de /api/duels ; jette si ce cache n est pas frais) et `duels.connu(id)` (ce que ce
 * cache sait d un duel : { final, guessA, guessB, stake } ou null) sont optionnels. `maintenant` (ms) et `bornes` sont injectables pour
 * les tests ; `msParBloc` (revue fix2 defaut 2) FIXE le temps de bloc au lieu de le mesurer (un banc sur anvil, qui mine en ~20 ms :
 * la mesure y depend de la vitesse de la machine) — le serveur ne le passe pas.
 */
export function creerRegleur({ cle = null, contrat = null, chainId = 8453, table = null, blocDeploiement = 0, rpc = null, rpcEnvoi = null,
  maintenant = () => Date.now(), bornes: bornesIn = {}, journal = () => {}, desactive = null, duels = null, rolls = null, msParBloc: msParBlocFixe = null,
  /* DENIM 2026-11-05 : duelsV2 = { contrat, bloc, joints? } (BlockDuelsV2) ; rollsJoues = { contrat, bloc } (BlockRolls : les rolls des joueurs) */
  duelsV2 = null, rollsJoues = null,
  /* 2026-11-12 (Phil: the new Spin, dev share through the router): slotsAvant = { contrat, table, bloc } — the EARLIER Spin, still settled
   *   (settleMany only, its own spin ids, its own logs from its own block) while `contrat` is the new one: its last spins are never lost */
  slotsAvant = null } = {}) {
  const bornes = { ...BORNES_DEFAUT, ...bornesIn };
  const c = adresseOk(contrat);
  const off = (pourquoi) => ({
    etat: () => ({ etat: 'OFF', pourquoi, adresse: null }),
    tour: async () => ({ fait: false, pourquoi }),
    demarrer: () => false,
    arreter: () => {},
  });
  if (desactive) return off(String(desactive));
  if (!cle) return off('SLOTS_KEEPER_KEY is not set: the server settles nothing (anyone can still settle; prizes always go to the player)');
  const duelsCfg = duels && duels.contrat ? duels : null, rollsCfg = rolls && rolls.contrat ? rolls : null;
  const v2Cfg = duelsV2 && duelsV2.contrat ? duelsV2 : null, joueCfg = rollsJoues && rollsJoues.contrat ? rollsJoues : null;
  const cAvant = slotsAvant ? adresseOk(slotsAvant.contrat) : null;
  if (cAvant && (cAvant === c || !Array.isArray(slotsAvant.table) || slotsAvant.table.length !== Slots.MAX_POINTS + 1)) return off('the earlier Spin given to the keeper is the new one, or has no prize table');
  if (!c && !duelsCfg && !rollsCfg && !v2Cfg && !joueCfg) return off('no contract address in the slots, duels or rolls records');
  if (typeof rpc !== 'function') return off('no RPC reader');
  if (c && (!Array.isArray(table) || table.length !== Slots.MAX_POINTS + 1)) return off('no prize table in slots-deploiement.js');
  let adresse;
  try { adresse = adresseDe(cle); } catch (_) { return off('SLOTS_KEEPER_KEY is malformed (its value is never shown)'); }
  const envoi = typeof rpcEnvoi === 'function' ? rpcEnvoi : rpc;
  const tb = c ? table.map((x) => BigInt(x)) : null;
  const blocDuels = () => { try { const b = typeof duelsCfg.bloc === 'function' ? duelsCfg.bloc() : duelsCfg.bloc; return Number(b) || 0; } catch (_) { return 0; } };

  const activite = () => ({ envois: 0, inclus: 0, reverts: 0, revertsExpliques: 0, regles: 0, sautsHeure: 0, dernierEnvoi: null, dernierInclus: null });
  const fixe = Number(msParBlocFixe) > 0 ? Number(msParBlocFixe) : null;
  const st = {
    etat: 'ON', adresse, depuis: new Date(maintenant()).toISOString(), msParBloc: fixe, mesureA: 0, intervalleMs: intervalleDepuisBloc(fixe, bornes),
    /* DENIM 2026-11-05 : la mesure longue et la courte (ms), et l instant de la derniere lecture courte */
    msLong: null, msCourt: null, mesureCourteA: -Infinity,
    scanne: null, enVol: null, envoisHeure: { slots: [], duels: [], rolls: [], duelsV2: [], rollsJoues: [] }, echecsSuite: 0, dernierEchec: null, dernierTour: null, dernierEnvoi: null, dernierRegle: null, erreurs: [],
    compteurs: { tours: 0, envois: 0, spinsEnvoyes: 0, spinsRegles: 0, reverts: 0, revertsExpliques: 0, simulationsRefusees: 0, simulationsNonLues: 0, envoisRefuses: 0, envoisRetrouves: 0,
      nonInclus: 0, recusIlisibles: 0, sautsGas: 0, sautsHeure: 0, spinsEcartes: 0, toursSains: 0, duelsEgalites: 0, duelsEvinces: 0, toursTeteGelee: 0 },
    parContrat: { slots: activite(), duels: activite(), rolls: activite(), duelsV2: activite(), rollsJoues: activite() },
    arret: null, chaineVue: false,
    /* round 4 : la plus haute tete lue et l instant ou elle l a ete pour la premiere fois ; gelee = { ... } tant qu elle ne bouge plus */
    teteMax: null, teteMaxA: 0, gelee: null,
  };
  const suivis = new Map(); /* slots : id -> { t, player } */
  const ecartes = new Map(); /* slots : id -> t — settle seul qui ne se simule pas (paiement refuse) : ecarte jusqu a la fin de sa fenetre */
  /* the slots contexts: the slots contract (its scan cursor stays st.scanne) and, when given, the earlier Spin with its OWN ids and cursor */
  const principal = { c, tb, blocDeploiement, suivis, ecartes, scan: st };
  const avant = cAvant ? { c: cAvant, tb: slotsAvant.table.map((x) => BigInt(x)), blocDeploiement: Number(slotsAvant.bloc) || 0, suivis: new Map(), ecartes: new Map(), scan: { scanne: null } } : null;
  const slotsDe = (to) => (avant && bas(to) === avant.c ? avant : principal);
  const hashes = new Map(); /* bloc -> hash */
  /* id -> { t, vainqueur (null tant que non classe ; 'createur' | 'rejoignant'), mise, gA, gB (emballes), sansHash, luTour } —
   *   jamais une egalite ni un final : ceux-la vont dans duelsClos (id -> t), jamais relus, jusqu a la fin de leur fenetre */
  const duelsSuivis = new Map();
  const duelsClos = new Map();
  const scanDuels = { contrat: null, scanne: null };
  /* revue duels-gate D1 : la sante de la lecture des duels, publiee dans etat().contrats.duels (lu, erreurLecture) */
  const lectureDuels = { lu: null, erreur: null, ratees: 0 };
  /* une egalite, un final, un duel regle : plus jamais suivi ni relu (sa cible est gardee pour le sortir a la fin de sa fenetre) */
  const closDuel = (id, t = null) => {
    const d = duelsSuivis.get(id);
    duelsSuivis.delete(id);
    duelsClos.set(id, t !== null ? t : d ? d.t : Number.MAX_SAFE_INTEGER - FENETRE);
    while (duelsClos.size > bornes.closMax) duelsClos.delete(duelsClos.keys().next().value);
  };
  const jours = { contrat: null, finis: new Set(), acheteurs: new Map(), aujourdhui: null };
  /* DENIM 2026-11-05 — duelsV2 : suivis id -> { t, gA, gB, joueur (le rejoignant), classe } ; clos id -> t (createur gagnant, egalite,
   *   final : plus jamais relus jusqu a la fin de leur fenetre) ; lecture = la sante de la lecture, publiee par etat() */
  const v2 = { contrat: null, scanne: null, suivis: new Map(), clos: new Map(), lecture: { lu: null, erreur: null }, createurs: 0, egalites: 0, rejoignants: 0 };
  /* rollsJoues : suivis id -> { t, g (emballe, du log Rolled) } ; clos id -> t (perdant, deja regle, joueur = le regleur) ; ecartes id -> t
   *   (settle seul qui ne se simule pas : paiement refuse) ; regles version -> [p5, p4, p3, p2, minScore] (immuables par version) */
  const rj = { contrat: null, scanne: null, suivis: new Map(), clos: new Map(), ecartes: new Map(), regles: new Map(), lecture: { lu: null, erreur: null }, perdants: 0 };
  let enCours = false, minuteur = null, echecsCeTour = 0;

  const erreur = (quoi) => {
    const e = { a: new Date(maintenant()).toISOString(), quoi: String(quoi).slice(0, 160) };
    st.erreurs.push(e); while (st.erreurs.length > 10) st.erreurs.shift();
    journal('[keeper] ' + e.quoi);
  };
  /* un echec : `contrat` (slots / duels / rolls, ou null) est NOMME dans le message d arret (revue keeper 7 : il etait coupe) */
  const echec = (quoi, compteur, contrat = null) => {
    st.compteurs[compteur] += 1; st.echecsSuite += 1; echecsCeTour += 1; erreur(quoi);
    st.dernierEchec = { a: new Date(maintenant()).toISOString(), contrat, quoi: String(quoi).slice(0, 160) };
    if (st.echecsSuite >= bornes.echecsMax) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), contrat, pourquoi: st.echecsSuite + ' failures in a row (last, ' + (contrat || 'keeper') + ': ' + String(quoi).slice(0, 140) + ') — stopped until restart' }; journal('[keeper] STOPPED: ' + st.arret.pourquoi); }
  };
  const msg = (e) => String((e && e.message) || e).slice(0, 120);
  const entier = (h) => { const v = parseInt(String(h), 16); return Number.isSafeInteger(v) ? v : null; };
  const appel = (to, data, bloc = 'latest') => rpc('eth_call', [{ to, data }, bloc]);

  const nomTx = (v) => v.cible + ' ' + v.quoi + ' #' + v.ids[0] + (v.ids.length > 1 ? '..' + v.ids[v.ids.length - 1] : '');
  /* ⛔ revue keeper 1 : un revert MINE est-il explique par un AUTRE qui a deja fait le travail ? la cible est RELUE AU BLOC DU RECU
   *   (revue fix2 defaut 3 : a 'latest', un noeud en retard sur ce bloc rend encore le duel Joined -> une course perdue comptee comme un
   *   echec ; au bloc du recu, ce noeud repond « bloc inconnu » : la cible est relue au tour suivant). Sans numero de bloc : 'latest'.
   *   duels : statut Settled (3) — seul un settle reussi y mene ; le notre a revert, donc un autre l a regle (NotJoined).
   *   rolls : jour Drawn ; ou Armed avec une AUTRE cible que celle vue a l envoi, armee au bloc du recu ou avant (cible - 2 <= bloc) —
   *           un autre a ferme / re-arme le jour (StillSettleable, DayNotArmed, TooEarly). Une cible armee APRES notre bloc ne l explique pas.
   *   slots : jamais (settleMany saute un spin deja regle sans revert). Rend la raison, ou null ; jette si la cible n est pas lue. */
  async function expliquer(v, blocRecu) {
    const tag = blocRecu !== null && blocRecu > 0 ? '0x' + blocRecu.toString(16) : 'latest';
    if (v.cible === 'duels') {
      const m = motsDe(await appel(v.to, donnees1(SEL_DUELS, v.ids[0]), tag));
      if (m.length !== 9) throw new Error('duel not read');
      return Number(m[2]) === DUEL_SETTLED ? 'duel #' + v.ids[0] + ' already settled by another transaction' : null;
    }
    /* DENIM : BlockDuelsV2, la meme regle — Settled (3) au bloc du recu : un autre (le gagnant lui-meme) l a regle */
    if (v.cible === 'duelsV2') {
      const mv = motsDe(await appel(v.to, donnees1(SEL_DUELS, v.ids[0]), tag));
      if (mv.length !== 9) throw new Error('duel v2 not read');
      return Number(mv[2]) === 3 ? 'duel v2 #' + v.ids[0] + ' already settled by another transaction' : null;
    }
    if (v.cible === 'rolls') {
      const m = motsDe(await appel(v.to, donnees1(SEL_DAY_POTS, v.ids[0]), tag));
      if (m.length !== 3) throw new Error('dayPots not read');
      const etat = Number(m[2]), t = Number(m[1]);
      if (etat === 2) return 'day ' + v.ids[0] + ' already drawn by another transaction';
      const avant = v.avant || {};
      if (etat === 1 && t !== Number(avant.t) && blocRecu !== null && t - ROLLS_DELAI_CIBLE <= blocRecu) return 'day ' + v.ids[0] + ' armed by another transaction (target ' + t + ')';
      return null;
    }
    return null;
  }

  /* DENIM (2026-11-05) : `bornes.inclusionMaxMs` est, DANS suivreInclusion, la borne EFFECTIVE (inclusionMaxDepuisBloc au temps de bloc
   *   courant, plafonnee par la borne configuree) — le nom est garde pour que chaque garde ci-dessous (et les mutants qui la visent) reste
   *   la meme ligne */
  const bornesDeLInclusion = () => ({ ...bornes, inclusionMaxMs: inclusionMaxDepuisBloc(st.msParBloc, bornes) });
  async function suivreInclusion() {
    const bornes = bornesDeLInclusion();
    const v = st.enVol;
    let r = null;
    try { r = await rpc('eth_getTransactionReceipt', [v.hash]); } catch (e) {
      erreur('receipt not read: ' + msg(e));
      /* ⛔ un recu qui jette sans fin ne retient pas le regleur pour toujours : au bout de inclusionMaxMs la tx est relachee ; la suivante
       *    part au nonce 'pending'. revue keeper 3 : son issue est INCONNUE (un revert mine serait invisible) — comptee comme une tx non
       *    incluse, vers l arret ; etat().degrade le dit */
      if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec(nomTx(v) + ': receipt of tx ' + v.hash + ' unreadable for ' + Math.round(bornes.inclusionMaxMs / 1000) + ' s, released (outcome unknown, counted as a failure)', 'recusIlisibles', v.cible); return true; }
      return false;
    }
    if (!r) {
      if (maintenant() - v.a > bornes.inclusionMaxMs) { st.enVol = null; echec(nomTx(v) + ': tx ' + v.hash + ' not included after ' + Math.round(bornes.inclusionMaxMs / 1000) + ' s', 'nonInclus', v.cible); }
      return false;
    }
    const act = st.parContrat[v.cible];
    if (String(r.status) !== '0x1') {
      let pourquoi = null;
      try { pourquoi = await expliquer(v, entier(r.blockNumber)); } catch (e) {
        /* la cible n est pas lue : la tx reste « en vol » (rien d autre ne part), relue au tour suivant ; comptee au bout de inclusionMaxMs */
        if (v.revertA === undefined) v.revertA = maintenant();
        if (maintenant() - v.revertA <= bornes.inclusionMaxMs) { erreur(nomTx(v) + ': tx ' + v.hash + ' reverted; its target was not re-read (' + msg(e) + '), re-read next round'); return false; }
      }
      st.enVol = null;
      if (pourquoi) {
        act.revertsExpliques += 1; st.compteurs.revertsExpliques += 1;
        erreur(nomTx(v) + ': tx ' + v.hash + ' reverted — ' + pourquoi + ' (not counted as a failure)');
        if (v.cible === 'duels') closDuel(String(v.ids[0]), v.avant && Number.isSafeInteger(v.avant.t) ? v.avant.t : null);
        if (v.cible === 'duelsV2') closV2(String(v.ids[0]));
        return true;
      }
      act.reverts += 1; echec(nomTx(v) + ': tx ' + v.hash + ' reverted', 'reverts', v.cible); return true;
    }
    st.enVol = null;
    st.echecsSuite = 0;
    const a = new Date(maintenant()).toISOString(), bloc = entier(r.blockNumber);
    act.inclus += 1;
    if (v.cible === 'slots') {
      const regles = Slots.lireSettledTous(r.logs || [], v.to);
      st.compteurs.spinsRegles += regles.length; act.regles += regles.length;
      st.dernierRegle = { a, hash: v.hash, envoyes: v.ids.length, regles: regles.length, paye: regles.reduce((s, d) => s + d.payout, 0n).toString(), bloc };
      act.dernierInclus = { a, hash: v.hash, ids: v.ids, regles: regles.length, bloc };
      const sx = slotsDe(v.to);
      for (const d of regles) sx.suivis.delete(String(d.spinId));
    } else if (v.cible === 'duels') {
      const n = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_DUEL_SETTLED).length;
      act.regles += n; act.dernierInclus = { a, hash: v.hash, duel: v.ids[0], regles: n, bloc };
      closDuel(String(v.ids[0]), v.avant && Number.isSafeInteger(v.avant.t) ? v.avant.t : null);
    } else if (v.cible === 'duelsV2') {
      const n = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_DUEL_SETTLED).length;
      act.regles += n; act.dernierInclus = { a, hash: v.hash, duel: v.ids[0], regles: n, bloc };
      closV2(String(v.ids[0]));
    } else if (v.cible === 'rollsJoues') {
      /* settleMany SAUTE un roll deja regle : ne compte que les Settled de CE contrat dans le recu */
      const ok = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_ROLL_SETTLED && l.topics[1]).map((l) => String(BigInt(l.topics[1])));
      act.regles += ok.length; act.dernierInclus = { a, hash: v.hash, ids: v.ids, regles: ok.length, bloc };
      for (const id of v.ids) closRoll(String(id));
    } else {
      const tir = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_DAY_DRAWN).length;
      const fer = (r.logs || []).filter((l) => bas(l.address) === v.to && bas(l.topics && l.topics[0]) === TOPIC_DAY_CLOSED).length;
      act.regles += tir + fer; act.dernierInclus = { a, hash: v.hash, quoi: v.quoi, jour: v.ids[0], bloc };
      if (tir) jours.finis.add(String(v.ids[0]));
    }
    return true;
  }

  /* ⛔ DENIM (2026-11-05) : DEUX mesures, comme le serveur (serveur-web.js sParBlocServi) — la LONGUE (blocsMesure blocs, toutes les
   *   mesureToutesMs) et la COURTE (RECUL_COURT_BLOCS blocs, borne basse, toutes les mesureCourteToutesMs) ; le temps retenu est
   *   sParBlocPrudent(longue, courte) : la courte l emporte des que les blocs accelerent de plus de 10 %. Avant : la longue seule, relue
   *   toutes les 10 min — 2 s gardees ~10 min apres la bascule (intervalle, marge de fin, inclusion calcules 10x trop longs). */
  async function mesurerBloc(tete) {
    if (fixe !== null) return; /* temps de bloc INJECTE (revue fix2 defaut 2) : jamais mesure */
    const t = maintenant();
    const long = st.msLong === null || t - st.mesureA >= bornes.mesureToutesMs;
    const court = t - st.mesureCourteA >= bornes.mesureCourteToutesMs;
    if (!long && !court) return;
    if (long) st.mesureA = t;
    if (court) st.mesureCourteA = t;
    try {
      const n = Math.min(bornes.blocsMesure, tete), nc = Math.min(RECUL_COURT_BLOCS, tete);
      const [a, b, c] = await Promise.all([rpc('eth_getBlockByNumber', ['0x' + tete.toString(16), false]),
        long ? rpc('eth_getBlockByNumber', ['0x' + (tete - n).toString(16), false]) : null,
        court ? rpc('eth_getBlockByNumber', ['0x' + (tete - nc).toString(16), false]) : null]);
      if (long) { const ms = Slots.msParBlocMesure({ tsTete: entier(a && a.timestamp), tsAvant: entier(b && b.timestamp), n }); if (ms !== null) st.msLong = ms; }
      if (court) { const s = sParBlocBorneBasse({ haut: enteteVersMesure(a), bas: enteteVersMesure(c) }); if (s !== null) st.msCourt = Math.round(s * 1e6) / 1e3; }
      const p = sParBlocPrudent(st.msLong === null ? null : st.msLong / 1000, st.msCourt === null ? null : st.msCourt / 1000);
      /* hors des bornes plausibles de temps-de-bloc.js (ex. une chaine de test a 20 ms) : la longue telle quelle, comme avant */
      const ms = p !== null ? Math.round(p * 1e6) / 1e3 : st.msLong;
      if (ms !== null) { st.msParBloc = ms; st.intervalleMs = intervalleDepuisBloc(ms, bornes); }
    } catch (e) { erreur('block time not measured: ' + msg(e)); }
  }

  async function hashesDe(t) {
    const ns = Slots.blocsDesFaces(t);
    for (const b of ns) {
      if (hashes.has(b)) continue;
      const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
      if (blk && /^0x[0-9a-f]{64}$/i.test(String(blk.hash))) hashes.set(b, bas(blk.hash));
    }
    while (hashes.size > 900) hashes.delete(hashes.keys().next().value);
    const h = ns.map((b) => hashes.get(b));
    return h.every(Boolean) ? h : null;
  }

  /* ---------------------------------------------------------------- slots : le lot settleMany du tour (au plus un candidat) */
  async function candidatsSlots(tete, info, x = principal) {
    const { c, tb, suivis, ecartes, blocDeploiement } = x, st = x.scan;
    /* les Spun d une fenetre BORNEE : jamais plus de reculLogs blocs, jamais avant le deploiement ; puis les seuls blocs nouveaux (+ 8) */
    const plancher = Math.max(Number(blocDeploiement) || 0, tete - bornes.reculLogs + 1);
    const de = st.scanne === null ? plancher : Math.max(plancher, st.scanne + 1 - 8);
    if (de <= tete) {
      const logs = await rpc('eth_getLogs', [{ address: c, topics: [Slots.TOPIC_SPUN], fromBlock: '0x' + de.toString(16), toBlock: '0x' + tete.toString(16) }]);
      if (!Array.isArray(logs)) throw new Error('getLogs did not return a list');
      for (const s of Slots.lireSpunTous(logs, c)) { const id = String(s.spinId); if (!suivis.has(id)) suivis.set(id, { t: s.targetBlock, player: s.player }); }
      st.scanne = tete;
    }
    /* hors fenetre (une tx signee maintenant ne passerait plus) : perdu, plus rien a faire ; la liste suivie est bornee */
    for (const [id, s] of suivis) if (Slots.etatReglement(s.t, tete).etat === 'PERDU') { suivis.delete(id); ecartes.delete(id); }
    for (const [id, t] of ecartes) if (Slots.etatReglement(t, tete).etat === 'PERDU') ecartes.delete(id);
    while (suivis.size > bornes.suivisMax) suivis.delete(suivis.keys().next().value);
    const reglables = [...suivis.entries()].filter(([id, s]) => Slots.etatReglement(s.t, tete).etat === 'REGLABLE' && !ecartes.has(id))
      .sort((a, b) => (BigInt(a[0]) < BigInt(b[0]) ? -1 : 1)).slice(0, bornes.statutsParTour);
    if (!reglables.length) return [];
    const spins = [];
    for (const [id, s] of reglables) {
      const v = Slots.lireSpin(await appel(c, Slots.appelSpin(id)));
      if (!v) continue;
      /* ⛔ statut 0 (None) pour un id VU dans un Spun : un noeud en retard d un bloc, pas un spin clos — garde, relu au tour suivant */
      if (v.status === 0) { info.sain = false; continue; }
      if (v.status !== 1) { suivis.delete(id); continue; }
      const h = await hashesDe(s.t);
      spins.push({ id, t: s.t, faces: h ? Slots.facesDuSpin(h, BigInt(id)) : null });
    }
    if (!spins.length) return [];
    const pot = Slots.lireUint(await appel(c, Slots.appelPot()));
    if (pot === null) throw new Error('pot not read');
    const plan = Slots.planReglement({ spins, pot, table: tb, tete });
    info.courts = plan.courts.length;
    const lignes = plan.lignes.filter((l) => l.decision === 'LOT').slice(0, bornes.spinsParTx);
    if (!lignes.length) return [];
    return [{ cible: 'slots', to: c, ids: lignes.map((l) => l.id), fin: Math.min(...lignes.map((l) => l.dernierBloc)), quoi: 'settleMany' }];
  }

  /* ---------------------------------------------------------------- duels : settle(id) de chaque duel rejoint dans sa fenetre */
  /* la mise d une source externe (BigInt, entier, texte decimal) ; null sinon */
  const miseDe = (x) => { try { if (typeof x === 'bigint') return x >= 0n ? x : null; if ((typeof x === 'number' && Number.isSafeInteger(x)) || (typeof x === 'string' && /^\d+$/.test(x))) return BigInt(x); } catch (_) { /* illisible */ } return null; };
  /* un duel DECOUVERT (log Joined, liste de l etat) : jamais une egalite / un final deja clos, jamais hors fenetre ; complete ce qui manque */
  function decouvrir(id, t, tete, x = {}) {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(t) || t <= 0 || tete + 1 > t + FENETRE || duelsClos.has(id)) return;
    let d = duelsSuivis.get(id);
    if (!d) { d = { t, vainqueur: null, mise: null, gA: null, gB: null, sansHash: false, luTour: -1 }; duelsSuivis.set(id, d); }
    const gA = emballerGuess(x.guessA), gB = emballerGuess(x.guessB), mise = miseDe(x.stake);
    if (d.gA === null && gA !== null) d.gA = gA;
    if (d.gB === null && gB !== null) d.gB = gB;
    if (d.mise === null && mise !== null) d.mise = mise;
  }
  /* duels(id) -> { s (statut), gA, gB, mise } ; null si illisible */
  async function lireDuelEtat(cD, id) {
    const m = motsDe(await appel(cD, donnees1(SEL_DUELS, id)));
    return m.length === 9 ? { s: Number(m[2]), gA: Number(m[3]), gB: Number(m[6]), mise: m[8] } : null;
  }
  /* revue duels-gate D1 : la lecture des duels du tour, REUSSIE (lu) ou ratee (erreurLecture) — publiee par etat() */
  async function candidatsDuels(cD, tete, info) {
    if (scanDuels.contrat !== cD) { scanDuels.contrat = cD; scanDuels.scanne = null; duelsSuivis.clear(); duelsClos.clear(); Object.assign(lectureDuels, { lu: null, erreur: null, ratees: 0 }); }
    try {
      const r = await lireDuelsTour(cD, tete, info);
      Object.assign(lectureDuels, { lu: new Date(maintenant()).toISOString(), erreur: null, ratees: r.ratees });
      return r.out;
    } catch (e) { lectureDuels.erreur = msg(e); throw e; }
  }
  async function lireDuelsTour(cD, tete, info) {
    const plancher = Math.max(blocDuels(), tete - bornes.reculLogs + 1);
    const de = scanDuels.scanne === null ? plancher : Math.max(plancher, scanDuels.scanne + 1 - 8);
    /* 2026-10-24 : les rejoints lus par l ETAT (duelsCfg.joints : le cache de lireDuelsSrv, nextId + duels(id)) s ajoutent aux Joined des
     *   logs RECENTS : un log refuse ne perd plus un duel. Les logs refuses ET aucun etat fourni : le tour jette, comme avant. Le statut est
     *   RELU ci-dessous (duels(id) == Joined) avant tout envoi : une liste perimee ne fait rien partir. */
    let refusLogs = null, parEtat = false;
    /* settle passe si cible < bloc <= cible + 256 ; mine au mieux a tete + 1 : tete + 1 <= cible + 256. Simule a la tete : tete > cible. */
    for (const [id, d] of duelsSuivis) if (tete + 1 > d.t + FENETRE) duelsSuivis.delete(id);
    for (const [id, t] of duelsClos) if (tete + 1 > t + FENETRE) duelsClos.delete(id);
    if (de <= tete) {
      try {
        const logs = await rpc('eth_getLogs', [{ address: cD, topics: [TOPIC_JOINED], fromBlock: '0x' + de.toString(16), toBlock: '0x' + tete.toString(16) }]);
        if (!Array.isArray(logs)) throw new Error('getLogs did not return a list');
        for (const l of logs) {
          if (bas(l.address) !== cD || bas(l.topics && l.topics[0]) !== TOPIC_JOINED || !l.topics[1]) continue;
          const m = motsDe(l.data);
          if (m.length !== 6) continue;
          /* le Joined porte le guess du rejoignant (5 octets) et la cible ; le guess du createur vient de l etat ou d un duels(id) */
          decouvrir(String(BigInt(l.topics[1])), Number(m[5]), tete, { guessB: m.slice(0, 5).map(Number) });
        }
        scanDuels.scanne = tete;
      } catch (e) { refusLogs = e; }
    }
    if (typeof duelsCfg.joints === 'function') {
      try {
        for (const j of duelsCfg.joints() || []) decouvrir(String(j && j.id), Number(j && j.targetBlock), tete, j || {});
        parEtat = true;
      } catch (e) { parEtat = false; if (refusLogs) refusLogs = new Error(msg(refusLogs) + '; state list: ' + msg(e)); }
    }
    if (refusLogs && !parEtat) throw refusLogs;
    if (refusLogs) { info.sain = false; erreur('duels logs not read (state list used): ' + msg(refusLogs)); }
    const tourN = st.compteurs.tours;
    let tentees = 0, ratees = 0, derniere = null;
    /* une lecture de duels(id) : comptee (tentee / ratee) pour la sante de la lecture */
    const lire1 = async (id) => {
      tentees += 1;
      try { const v = await lireDuelEtat(cD, id); if (!v) { ratees += 1; derniere = 'duel #' + id + ' unreadable'; } return v; } catch (e) { ratees += 1; derniere = msg(e); return null; }
    };
    /* ⛔ revue fix2 defaut 1 : CLASSER chaque duel UNE fois, des que le hash de sa cible existe (tete >= cible), l echeance la plus proche
     *   d abord. Les guesses / la mise : la liste de l etat (connu, aucune lecture) ou UN duels(id) (budget classementsParTour) ; le hash :
     *   un en-tete (cache par bloc ; budget >= 2 tours de blocs : la production de blocs ne le depasse jamais). Egalite ou final -> clos. */
    const connu = typeof duelsCfg.connu === 'function' ? (id) => { try { return duelsCfg.connu(id) || null; } catch (_) { return null; } } : () => null;
    let budgetClasse = bornes.classementsParTour;
    let budgetEntetes = Math.min(FENETRE, Math.max(bornes.entetesParTour, Math.ceil((2 * st.intervalleMs) / (st.msParBloc || 200))));
    const aClasser = [...duelsSuivis.entries()].filter(([, d]) => d.vainqueur === null && tete >= d.t).sort((a, b) => a[1].t - b[1].t);
    for (const [id, d] of aClasser) {
      const k = connu(id);
      if (k && k.final === true) { closDuel(id); continue; } /* final selon le cache : jamais relu */
      if (k) decouvrir(id, d.t, tete, k);
      if (d.gA === null || d.gB === null || d.mise === null) {
        if (budgetClasse <= 0) continue;
        budgetClasse -= 1;
        const v = await lire1(id);
        if (!v || v.s === 0) { info.sain = false; continue; } /* illisible / noeud en retard : relu au tour suivant */
        if (v.s !== DUEL_JOINED) { closDuel(id); continue; }
        Object.assign(d, { gA: v.gA, gB: v.gB, mise: v.mise, luTour: tourN });
      }
      if (!hashes.has(d.t)) {
        if (budgetEntetes <= 0) continue;
        budgetEntetes -= 1; tentees += 1;
        try { await hashDe(d.t); } catch (e) { derniere = msg(e); }
        if (!hashes.has(d.t)) { ratees += 1; derniere = derniere || 'block ' + d.t + ' unreadable'; d.sansHash = true; info.sain = false; continue; }
      }
      const v = vainqueurDuel(hashes.get(d.t), d.gA, d.gB);
      if (v === 'egalite') { closDuel(id); st.compteurs.duelsEgalites += 1; continue; } /* les deux mises rendues quoi qu il arrive */
      d.vainqueur = v; d.sansHash = false;
    }
    /* ⛔ EVICTION au-dela de suivisMax : les rejoignants gagnants (pas presses d abord), le plus de temps d abord ; JAMAIS un createur
     *   gagnant dans sa fenetre ; un NON classe seulement au-dela de suivisDurMax (une borne memoire : il serait relu par la liste de l etat) */
    const marge = margeFinDuel(bornes, st.msParBloc, st.intervalleMs);
    const presse = (d) => tete + 1 >= d.t + FENETRE - marge;
    const evincer = (filtre, limite, clore) => {
      for (const [id] of [...duelsSuivis.entries()].filter(filtre).sort((a, b) => b[1].t - a[1].t)) {
        if (duelsSuivis.size <= limite) break;
        if (clore) closDuel(id); else duelsSuivis.delete(id);
        st.compteurs.duelsEvinces += 1;
      }
    };
    if (duelsSuivis.size > bornes.suivisMax) evincer(([, d]) => d.vainqueur === 'rejoignant' && !presse(d), bornes.suivisMax, true);
    if (duelsSuivis.size > bornes.suivisMax) evincer(([, d]) => d.vainqueur === 'rejoignant', bornes.suivisMax, true);
    if (duelsSuivis.size > bornes.suivisDurMax) evincer(([, d]) => d.vainqueur === null, bornes.suivisDurMax, false);
    /* ⛔ revue keeper 1 et 2 : jamais avant cible + delaiDuelBlocs ; rejoignant (ou hash illisible) -> seulement dans la marge de fin.
     *   L ORDRE D ENVOI : les PRESSES d abord (par echeance), puis ceux ou le createur gagne, par mise DECROISSANTE (puis echeance) ; les
     *   lectures de statut (statutsParTour) suivent CET ordre, au plus simulationsParTour candidats (revue fix2 defaut 1, chemin B) */
    const prets = [...duelsSuivis.entries()].filter(([, d]) => tete > d.t
      && ((d.vainqueur === 'createur' && tete >= d.t + bornes.delaiDuelBlocs) || ((d.vainqueur === 'rejoignant' || (d.vainqueur === null && d.sansHash)) && presse(d))))
      .map(([id, d]) => ({ id, d, presse: presse(d), fin: d.t + FENETRE, mise: d.mise === null ? 0n : d.mise }));
    prets.sort((a, b) => (Number(b.presse) - Number(a.presse)) || (a.presse ? a.fin - b.fin : (b.mise > a.mise ? 1 : b.mise < a.mise ? -1 : a.fin - b.fin)));
    const out = [];
    let budgetStatuts = bornes.statutsParTour;
    for (const p of prets) {
      if (out.length >= bornes.simulationsParTour) break;
      const { id, d } = p;
      if (d.luTour !== tourN) {
        if (budgetStatuts <= 0) break;
        budgetStatuts -= 1;
        const v = await lire1(id);
        if (!v || v.s === 0) { info.sain = false; continue; }
        if (v.s !== DUEL_JOINED) { closDuel(id); continue; }
        d.luTour = tourN;
        if (d.mise === null) d.mise = v.mise;
      }
      out.push({ cible: 'duels', to: cD, ids: [id], fin: p.fin, quoi: 'settle', presse: p.presse, mise: d.mise === null ? 0n : d.mise, vainqueur: d.vainqueur || 'inconnu', avant: { t: d.t } });
    }
    /* toutes les lectures du tour ratees : la lecture des duels a ECHOUE (la porte des duels se ferme) */
    if (tentees > 0 && ratees === tentees) throw new Error('no duel read succeeded this round (' + ratees + ' tried; last: ' + String(derniere).slice(0, 80) + ')');
    return { out, ratees };
  }
  /* le hash d UN bloc (la cible d un duel), par le meme cache que les slots */
  async function hashDe(b) {
    if (!hashes.has(b)) {
      const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
      if (blk && /^0x[0-9a-f]{64}$/i.test(String(blk.hash))) hashes.set(b, bas(blk.hash));
    }
    return hashes.get(b) || null;
  }

  /* ---------------------------------------------------------------- rolls : le pot du pass de chaque jour fini (closeDay / drawDay) */
  async function candidatsRolls(cR, tete) {
    if (jours.contrat !== cR) { jours.contrat = cR; jours.finis = new Set(); jours.acheteurs = new Map(); }
    const auj = Slots.lireUint(await appel(cR, SEL_TODAY));
    if (auj === null) throw new Error('today() not read');
    const a = Number(auj); jours.aujourdhui = a;
    for (const k of [...jours.acheteurs.keys()]) if (Number(k) < a - bornes.joursRecul) jours.acheteurs.delete(k);
    for (const k of [...jours.finis]) if (Number(k) < a - bornes.joursRecul) jours.finis.delete(k);
    const out = [];
    for (let d = a - 1; d >= Math.max(0, a - bornes.joursRecul); d--) {
      const k = String(d);
      if (jours.finis.has(k)) continue;
      /* un jour PASSE ne gagne plus d acheteur (buyPass inscrit au jour en cours) : un compte > 0 est garde (il ne sert qu a « il y a des
       *   acheteurs ») ; ⛔ revue keeper 4 : un 0 n est definitif que lu plus d un jour apres la fin du jour (a > d + 1) — avant, un noeud
       *   en retard peut le rendre juste apres minuit : il n est PAS garde, relu au tour suivant */
      if (!jours.acheteurs.has(k)) {
        const n = Slots.lireUint(await appel(cR, donnees1(SEL_BUYER_COUNT, d)));
        if (n === null) throw new Error('buyerCount not read');
        if (n === 0n && a <= d + 1) continue;
        jours.acheteurs.set(k, n);
      }
      if (jours.acheteurs.get(k) === 0n) { jours.finis.add(k); continue; }
      const m = motsDe(await appel(cR, donnees1(SEL_DAY_POTS, d)));
      if (m.length !== 3) throw new Error('dayPots not read');
      const etat = Number(m[2]), t = Number(m[1]), avant = { etat, t };
      if (etat === 2) { jours.finis.add(k); continue; }
      if (etat === 0) { out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay', avant }); continue; }
      if (etat !== 1) continue;
      /* Armed : drawDay passe si cible < bloc <= cible + 256 ; mine au mieux a tete + 1 ; simule a la tete : tete > cible */
      if (tete <= t) continue;
      if (tete + 1 <= t + FENETRE) out.push({ cible: 'rolls', to: cR, ids: [k], fin: t + FENETRE, quoi: 'drawDay', avant });
      else out.push({ cible: 'rolls', to: cR, ids: [k], fin: Infinity, quoi: 'closeDay', avant }); /* fenetre passee sans tirage : re-armer */
    }
    return out.sort((x, y) => (x.fin === y.fin ? 0 : x.fin < y.fin ? -1 : 1));
  }

  /* ================================================================ DENIM 2026-11-05 : BlockDuelsV2 et les rolls joues
   * Pourquoi : a 200 ms/bloc la fenetre de 256 blocs dure ~51 s. BlockDuelsV2 : un duel rejoint non regle dans sa fenetre est GAGNE PAR
   *   DEFAUT par le createur (settleDefault) — le joueur qui a rejoint et GAGNE perd. BlockRolls : un roll non regle dans les 256 blocs apres
   *   sa cible est PERDU (expire). settle (v2) et settleMany (rolls) sont PERMISSIONLESS et paient TOUJOURS le joueur / le gagnant du contrat
   *   (BlockDuelsV2.settle : winner = le meilleur score ; BlockRolls._settle : _push(r.player)) : le regleur ne paie que son gas. */
  const closV2 = (id) => {
    const d = v2.suivis.get(id);
    v2.suivis.delete(id);
    v2.clos.set(id, d ? d.t : Number.MAX_SAFE_INTEGER - FENETRE);
    while (v2.clos.size > bornes.closMax) v2.clos.delete(v2.clos.keys().next().value);
  };
  const closRoll = (id) => {
    const s = rj.suivis.get(id);
    rj.suivis.delete(id); rj.ecartes.delete(id);
    rj.clos.set(id, s ? s.t : Number.MAX_SAFE_INTEGER - FENETRE);
    while (rj.clos.size > bornes.closMax) rj.clos.delete(rj.clos.keys().next().value);
  };
  const blocDe = (cfg) => { try { const b = typeof cfg.bloc === 'function' ? cfg.bloc() : cfg.bloc; return Number(b) || 0; } catch (_) { return 0; } };
  /* hors fenetre : une tx signee a la tete H est minee au mieux en H + 1, et settle exige bloc <= cible + 256 */
  const dansFenetre = (t, tete) => tete > t && tete + 1 <= t + FENETRE;

  /* ---------------------------------------------------------------- duelsV2 : settle(id) des seuls duels que le REJOIGNANT gagne */
  function voirV2(id, t, tete, x = {}) {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(t) || t <= 0 || tete + 1 > t + FENETRE || v2.clos.has(id)) return;
    if (!v2.suivis.has(id)) v2.suivis.set(id, { t, gA: null, gB: null, joueur: null, classe: null });
  }
  async function candidatsDuelsV2(cV, tete, info) {
    if (v2.contrat !== cV) Object.assign(v2, { contrat: cV, scanne: null, suivis: new Map(), clos: new Map(), lecture: { lu: null, erreur: null } });
    try {
      const out = await lireDuelsV2(cV, tete, info);
      v2.lecture = { lu: new Date(maintenant()).toISOString(), erreur: null };
      return out;
    } catch (e) { v2.lecture.erreur = msg(e); throw e; }
  }
  async function lireDuelsV2(cV, tete, info) {
    for (const [id, d] of v2.suivis) if (d.t + FENETRE < tete + 1) v2.suivis.delete(id);
    for (const [id, t] of v2.clos) if (t + FENETRE < tete + 1) v2.clos.delete(id);
    /* la decouverte : les Joined d une fenetre BORNEE (comme v1) ET, si le serveur la donne, la liste par l ETAT (le lecteur v2) */
    const plancherV2 = Math.max(blocDe(v2Cfg), tete - bornes.reculLogs + 1);
    const deV2 = v2.scanne === null ? plancherV2 : Math.max(plancherV2, v2.scanne - 7);
    let refus = null, parEtat = false;
    if (deV2 <= tete) {
      try {
        const logs = await rpc('eth_getLogs', [{ address: cV, topics: [TOPIC_JOINED], fromBlock: '0x' + deV2.toString(16), toBlock: '0x' + tete.toString(16) }]);
        if (!Array.isArray(logs)) throw new Error('getLogs did not return a list');
        for (const l of logs) {
          if (bas(l.address) !== cV || bas(l.topics && l.topics[0]) !== TOPIC_JOINED || !l.topics[1]) continue;
          const mj = motsDe(l.data);
          if (mj.length === 6) voirV2(String(BigInt(l.topics[1])), Number(mj[5]), tete);
        }
        v2.scanne = tete;
      } catch (e) { refus = e; }
    }
    if (typeof v2Cfg.joints === 'function') {
      try { for (const j of v2Cfg.joints() || []) voirV2(String(j && j.id), Number(j && j.targetBlock), tete); parEtat = true; } catch (e) { if (refus) refus = new Error(msg(refus) + '; state list: ' + msg(e)); }
    }
    if (refus && !parEtat) throw refus;
    if (refus) { info.sain = false; erreur('duels v2 logs not read (state list used): ' + msg(refus)); }
    /* CLASSER une fois (le hash de la cible existe : tete >= cible), l echeance la plus proche d abord : UN duels(id) (statut, guesses, le
     *   rejoignant ; au plus classementsParTour), le hash d un en-tete (cache par bloc). createur gagnant / egalite / final -> clos, jamais relus */
    let lectures = bornes.classementsParTour;
    let entetes = Math.min(FENETRE, Math.max(bornes.entetesParTour, Math.ceil((2 * st.intervalleMs) / (st.msParBloc || 200))));
    for (const [id, d] of [...v2.suivis.entries()].filter(([, x]) => x.classe === null && tete >= x.t).sort((a, b) => a[1].t - b[1].t)) {
      if (d.joueur === null) {
        if (lectures <= 0) continue;
        lectures -= 1;
        const mv = motsDe(await appel(cV, donnees1(SEL_DUELS, id)));
        if (mv.length !== 9 || Number(mv[2]) === 0) { info.sain = false; continue; } /* illisible / noeud en retard : relu au tour suivant */
        if (Number(mv[2]) !== DUEL_JOINED) { closV2(id); continue; }
        /* la cible LUE sur la chaine fait foi (un log ou une liste ne la decide pas) */
        Object.assign(d, { t: Number(mv[5]), gA: Number(mv[3]), gB: Number(mv[6]), joueur: '0x' + mv[4].toString(16).padStart(40, '0') });
      }
      if (!hashes.has(d.t)) {
        if (entetes <= 0) continue;
        entetes -= 1;
        await hashDe(d.t);
        if (!hashes.has(d.t)) { info.sain = false; continue; }
      }
      const qui = vainqueurDuel(hashes.get(d.t), d.gA, d.gB);
      if (qui === 'rejoignant') { d.classe = qui; v2.rejoignants += 1; }
      else if (qui === 'createur') { closV2(id); v2.createurs += 1; } /* settleDefault paie EXACTEMENT la meme chose : rien a proteger */
      else if (qui === 'egalite') { closV2(id); v2.egalites += 1; } /* regle : mises rendues ; non regle : au createur — la regle de Phil */
      else info.sain = false;
    }
    /* PRETS : rejoignant gagnant, dans sa fenetre, et PRES DE LA FIN (le gagnant en ligne regle d abord ; meme marge que v1) */
    const margeV2 = margeFinDuel(bornes, st.msParBloc, st.intervalleMs);
    /* (tri ecrit autrement que celui du classement v1 : muter-keeper-fix3 exige que son ancre soit UNIQUE) */
    const pretsV2 = [...v2.suivis.entries()].filter(([, x]) => x.classe === 'rejoignant' && dansFenetre(x.t, tete) && tete + 1 >= x.t + FENETRE - margeV2)
      .sort(([, x], [, y]) => x.t - y.t);
    const out = [];
    let relus = bornes.statutsParTour;
    for (const [id, d] of pretsV2) {
      if (out.length >= bornes.simulationsParTour || relus <= 0) break;
      relus -= 1;
      const mv = motsDe(await appel(cV, donnees1(SEL_DUELS, id)));
      if (mv.length !== 9 || Number(mv[2]) === 0) { info.sain = false; continue; }
      if (Number(mv[2]) !== DUEL_JOINED) { closV2(id); continue; }
      /* ⛔ LA PREUVE PAR LE CONTRAT avant tout envoi : settle(id) EXECUTE (eth_call, depuis l adresse du regleur) doit designer le
       *   REJOIGNANT lu ci-dessus comme gagnant, et jamais le regleur. Un desaccord avec la prediction : clos, rien n est envoye. */
      let rendu = null;
      try { rendu = motsDe(await rpc('eth_call', [{ from: adresse, to: cV, data: donnees1(SEL_SETTLE, id) }, 'latest'])); } catch (e) {
        if (!estRevert(e)) throw e;
        info.sain = false; erreur('duel v2 #' + id + ': settle does not execute (' + msg(e) + '), re-read next round'); continue;
      }
      const gagnant = rendu.length === 2 ? '0x' + rendu[0].toString(16).padStart(40, '0') : null;
      const joueur = '0x' + mv[4].toString(16).padStart(40, '0');
      if (gagnant === null || gagnant !== joueur || gagnant !== d.joueur || gagnant === bas(adresse)) {
        closV2(id); erreur('duel v2 #' + id + ': the contract names ' + gagnant + ' as winner, not the joiner ' + joueur + ' — never sent'); continue;
      }
      out.push({ cible: 'duelsV2', to: cV, ids: [id], fin: d.t + FENETRE, quoi: 'settle', avant: { t: d.t } });
    }
    return out;
  }

  /* ---------------------------------------------------------------- rollsJoues : settleMany(ids) des rolls GAGNANTS dans leur fenetre */
  async function candidatsRollsJoues(cR, tete, info) {
    if (rj.contrat !== cR) Object.assign(rj, { contrat: cR, scanne: null, suivis: new Map(), clos: new Map(), ecartes: new Map(), regles: new Map(), lecture: { lu: null, erreur: null } });
    try {
      const out = await lireRollsJoues(cR, tete, info);
      rj.lecture = { lu: new Date(maintenant()).toISOString(), erreur: null };
      return out;
    } catch (e) { rj.lecture.erreur = msg(e); throw e; }
  }
  async function lireRollsJoues(cR, tete, info) {
    for (const [id, s] of rj.suivis) if (s.t + FENETRE < tete + 1) { rj.suivis.delete(id); rj.ecartes.delete(id); }
    for (const [id, t] of rj.clos) if (t + FENETRE < tete + 1) rj.clos.delete(id);
    for (const [id, t] of rj.ecartes) if (t + FENETRE < tete + 1) rj.ecartes.delete(id);
    /* les Rolled d une fenetre BORNEE (<= reculLogs blocs, jamais avant le deploiement), puis les seuls blocs nouveaux (+ 8) */
    const plancherR = Math.max(blocDe(joueCfg), tete - bornes.reculLogs + 1);
    const deR = rj.scanne === null ? plancherR : Math.max(plancherR, rj.scanne - 7);
    if (deR <= tete) {
      const logs = await rpc('eth_getLogs', [{ address: cR, topics: [TOPIC_ROLLED], fromBlock: '0x' + deR.toString(16), toBlock: '0x' + tete.toString(16) }]);
      if (!Array.isArray(logs)) throw new Error('getLogs did not return a list');
      for (const l of logs) {
        if (bas(l.address) !== cR || bas(l.topics && l.topics[0]) !== TOPIC_ROLLED || !l.topics[1]) continue;
        const mr = motsDe(l.data);
        if (mr.length !== 9) continue;
        const id = String(BigInt(l.topics[1])), t = Number(mr[5]);
        if (!Number.isSafeInteger(t) || t <= 0 || tete + 1 > t + FENETRE || rj.clos.has(id) || rj.suivis.has(id)) continue;
        rj.suivis.set(id, { t });
      }
      rj.scanne = tete;
    }
    while (rj.suivis.size > bornes.suivisMax) rj.suivis.delete(rj.suivis.keys().next().value);
    const aLire = [...rj.suivis.entries()].filter(([id, s]) => dansFenetre(s.t, tete) && !rj.ecartes.has(id)).sort((a, b) => a[1].t - b[1].t).slice(0, bornes.statutsParTour);
    if (!aLire.length) return [];
    const gagnants = [];
    for (const [id, s] of aLire) {
      /* rolls(id) = (player, targetBlock, status, guess, rulesVersion) : la chaine fait foi, jamais le log */
      const mr = motsDe(await appel(cR, donnees1(SEL_ROLLS, id)));
      if (mr.length !== 5 || Number(mr[2]) === 0) { info.sain = false; continue; } /* illisible / noeud en retard : relu au tour suivant */
      if (Number(mr[2]) !== ROLL_PENDING) { closRoll(id); continue; } /* deja regle (par le joueur) ou expire */
      const joueur = '0x' + mr[0].toString(16).padStart(40, '0'), t = Number(mr[1]), version = String(mr[4]);
      if (joueur === bas(adresse)) { closRoll(id); continue; } /* ⛔ jamais un roll dont le joueur est le regleur */
      s.t = t;
      if (!dansFenetre(t, tete)) continue;
      if (!rj.regles.has(version)) {
        const mg = motsDe(await appel(cR, donnees1(SEL_RULES, version)));
        if (mg.length !== 5) { info.sain = false; continue; }
        rj.regles.set(version, mg);
      }
      if (!hashes.has(t)) { await hashDe(t); if (!hashes.has(t)) { info.sain = false; continue; } }
      /* le score et le prix, comme BlockRolls._settle / _prizeFor (la face = faceDuHash = BlockRolls.faceOf) */
      const face = faceDuHash(hashes.get(t)), g = deballerGuess(Number(mr[3]));
      const score = g.reduce((n, x, i) => n + (x === face[i] ? 1 : 0), 0);
      const [p5, p4, p3, p2, minScore] = rj.regles.get(version);
      const prix = BigInt(score) < minScore ? 0n : score === 5 ? p5 : score === 4 ? p4 : score === 3 ? p3 : score === 2 ? p2 : 0n;
      if (prix === 0n) { closRoll(id); rj.perdants += 1; continue; } /* un perdant ne touche rien, regle ou non : pas de gas pour lui */
      gagnants.push({ id, t, prix });
    }
    if (!gagnants.length) return [];
    const pot = Slots.lireUint(await appel(cR, SEL_POT));
    if (pot === null) throw new Error('rolls pot not read');
    /* le lot, comme le contrat le paiera (dans l ordre des ids, chacun min(prix, pot restant)) : un roll que le pot paie en ENTIER part des
     *   qu il est reglable ; un roll que le pot ne paie qu en PARTIE n attend que la fin de sa fenetre (le pot peut remonter) — puis il part
     *   quand meme : un paiement partiel vaut mieux que la perte du roll entier */
    const margeR = margeFinDuel(bornes, st.msParBloc, st.intervalleMs);
    const lot = [];
    let reste = pot;
    for (const x of gagnants) {
      if (lot.length >= (Number(bornes.rollsParTx) > 0 ? Number(bornes.rollsParTx) : 10)) break;
      if (x.prix <= reste) { lot.push(x); reste -= x.prix; } else if (reste > 0n && tete + 1 >= x.t + FENETRE - margeR) { lot.push(x); reste = 0n; }
    }
    if (!lot.length) return [];
    return [{ cible: 'rollsJoues', to: cR, ids: lot.map((x) => x.id), fin: Math.min(...lot.map((x) => x.t + FENETRE)), quoi: 'settleMany' }];
  }

  const donneesDe = (k) => (k.cible === 'slots' || k.cible === 'rollsJoues' ? donneesSettleMany(k.ids) : k.cible === 'duels' || k.cible === 'duelsV2' ? donnees1(SEL_SETTLE, k.ids[0]) : donnees1(k.quoi === 'drawDay' ? SEL_DRAW_DAY : SEL_CLOSE_DAY, k.ids[0]));
  const estimer = async (to, data) => BigInt(await rpc('eth_estimateGas', [{ from: adresse, to, data, value: '0x0' }]));

  /* la simulation d UN candidat : rend { k, estime } ou null (revert : rien a envoyer pour lui) ; jette Passagere sur une panne RPC.
   * slots : un lot qui ne se simule pas est COUPE EN DEUX ; un spin seul qui ne se simule pas est ECARTE (son paiement echoue). */
  async function simuler(k, budget, tete) {
    const essai = async (ids) => {
      if (budget.n <= 0) return null;
      budget.n -= 1;
      const kk = { ...k, ids };
      try { return { k: kk, estime: await estimer(k.to, donneesDe(kk)) }; } catch (e) {
        if (!estRevert(e)) throw new Passagere(msg(e));
        st.compteurs.simulationsRefusees += 1;
        if (k.cible !== 'slots' && k.cible !== 'rollsJoues') { erreur('simulation reverted (' + k.quoi + ' ' + k.cible + ' #' + ids[0] + '): ' + msg(e)); return null; }
        /* rollsJoues : settleMany SAUTE un roll non reglable ; il ne revert que si un paiement echoue (liste noire USDC) : coupe en deux, le
         *   roll fautif ecarte jusqu a la fin de sa fenetre, comme un spin */
        if (ids.length === 1 && k.cible === 'rollsJoues') {
          const sr = rj.suivis.get(ids[0]);
          rj.ecartes.set(ids[0], sr ? sr.t : tete);
          erreur('roll #' + ids[0] + ': settling it alone reverts (its payout transfer fails?), left out of the batches: ' + msg(e));
          return null;
        }
        if (ids.length === 1) {
          const { suivis, ecartes } = slotsDe(k.to);
          const s = suivis.get(ids[0]);
          ecartes.set(ids[0], s ? s.t : tete); st.compteurs.spinsEcartes += 1;
          erreur('spin #' + ids[0] + ': settling it alone reverts (its payout transfer fails?), left out of the batches: ' + msg(e));
          return null;
        }
        const m = Math.ceil(ids.length / 2);
        return (await essai(ids.slice(0, m))) || (await essai(ids.slice(m)));
      }
    };
    return essai(k.ids);
  }

  /** UN tour : suivre la tx en vol, sinon lire, calculer, et envoyer au plus UNE tx. Rend ce qui a ete fait (pour les tests et /sante). */
  async function tour() {
    if (st.etat !== 'ON') return { fait: false, pourquoi: st.arret ? st.arret.pourquoi : st.etat };
    if (enCours) return { fait: false, pourquoi: 'a round is running' };
    enCours = true; echecsCeTour = 0;
    st.compteurs.tours += 1; st.dernierTour = new Date(maintenant()).toISOString();
    try {
      /* la chaine du noeud = celle de la fiche, verifiee une fois : sinon ARRET (une signature pour une autre chaine ne part jamais) */
      if (!st.chaineVue) {
        const id = await rpc('eth_chainId', []);
        if (BigInt(id) !== BigInt(chainId)) { st.etat = 'ARRETE'; st.arret = { a: new Date(maintenant()).toISOString(), pourquoi: 'the node serves chain ' + BigInt(id) + ', the keeper record says ' + chainId + ' — stopped' }; erreur(st.arret.pourquoi); return { fait: false, pourquoi: st.arret.pourquoi }; }
        st.chaineVue = true;
      }
      if (st.enVol) { const fini = await suivreInclusion(); if (!fini || st.etat !== 'ON') return { fait: false, pourquoi: st.enVol ? 'waiting for the transaction in flight' : st.etat }; }
      const tete = entier(await rpc('eth_blockNumber', []));
      if (tete === null) { erreur('head not read'); return { fait: false, pourquoi: 'head not read' }; }
      /* ⛔ round 4 (revue keeper round 3, attaque « tete gelee ») : un noeud qui ne avance plus fait croire au regleur que rien n est a
       *   faire (ou qu un duel n est pas encore pret) pendant que la vraie chaine ferme les fenetres. La tete doit DEPASSER la plus haute deja
       *   lue au moins tous les teteGeleeBlocs temps de bloc ; sinon etat DEGRADE (dit sur /sante, avec pourquoi) et RIEN n est lu ni
       *   envoye sur cette tete. Elle repart des que la tete bouge. */
      {
        const t1 = maintenant();
        if (st.teteMax === null || tete > st.teteMax) { st.teteMax = tete; st.teteMaxA = t1; st.gelee = null; }
        else {
          const seuilMs = bornes.teteGeleeBlocs * (Number(st.msParBloc) > 0 ? Number(st.msParBloc) : 200);
          const ms = t1 - st.teteMaxA;
          if (ms > seuilMs) {
            const neuf = st.gelee === null;
            st.gelee = { tete: st.teteMax, lue: tete, depuis: new Date(st.teteMaxA).toISOString(), ms, seuilMs,
              pourquoi: 'the node head has not moved past block ' + st.teteMax + ' for ' + Math.round(ms / 1000) + ' s (more than ' + bornes.teteGeleeBlocs + ' block times, ' + seuilMs + ' ms): nothing is sent on this head' };
            st.compteurs.toursTeteGelee += 1;
            if (neuf) erreur(st.gelee.pourquoi);
            return { fait: false, pourquoi: st.gelee.pourquoi };
          }
        }
      }
      await mesurerBloc(tete);
      const cD = duelsCfg ? resoudre(duelsCfg.contrat) : null, cR = rollsCfg ? resoudre(rollsCfg.contrat) : null;
      const cV = v2Cfg ? resoudre(v2Cfg.contrat) : null, cJ = joueCfg ? resoudre(joueCfg.contrat) : null;
      const info = { sain: true, courts: 0 };
      const listes = { slots: [], duels: [], rolls: [], duelsV2: [], rollsJoues: [] };
      const lire = async (nom, f) => { try { listes[nom] = await f(); } catch (e) { info.sain = false; erreur(nom + ' not read: ' + msg(e)); } };
      if (c) await lire('slots', () => candidatsSlots(tete, info));
      if (avant) { const a = await (async () => { try { return await candidatsSlots(tete, info, avant); } catch (e) { info.sain = false; erreur('earlier Spin not read: ' + msg(e)); return []; } })(); listes.slots = [...listes.slots, ...a].sort((p, q) => p.fin - q.fin); }
      if (cD) await lire('duels', () => candidatsDuels(cD, tete, info));
      if (cR) await lire('rolls', () => candidatsRolls(cR, tete));
      if (cV) await lire('duelsV2', () => candidatsDuelsV2(cV, tete, info));
      if (cJ) await lire('rollsJoues', () => candidatsRollsJoues(cJ, tete, info));
      if (!CONTRATS.some((x) => listes[x].length)) {
        /* ⛔ un tour SAIN (tout lu, aucun echec, rien a faire) remet le compte des echecs a zero */
        if (info.sain && echecsCeTour === 0) { st.echecsSuite = 0; st.compteurs.toursSains += 1; }
        return { fait: false, pourquoi: info.courts ? 'the pot cannot pay any pending spin in full' : 'nothing to settle', courts: info.courts };
      }
      /* ⛔ la borne horaire PAR CONTRAT (revue keeper 2) : un contrat a son plafond ne passe plus, les autres si */
      const t0 = maintenant();
      const pleins = [];
      for (const x of CONTRATS) {
        st.envoisHeure[x] = st.envoisHeure[x].filter((y) => t0 - y < 3600000);
        if (listes[x].length && st.envoisHeure[x].length >= plafondHeure(bornes, x)) { pleins.push(x); st.parContrat[x].sautsHeure += 1; listes[x] = []; }
      }
      if (pleins.length) st.compteurs.sautsHeure += 1;
      /* la plus PRESSEE d abord (le dernier bloc ou elle passe) : chaque contrat garde SON ordre (duels : presses, puis mise), la tete de
       *   chaque liste est comparee ; a echeance egale, l ordre slots, duels, rolls */
      const candidats = [];
      for (const q = { slots: 0, duels: 0, rolls: 0, duelsV2: 0, rollsJoues: 0 }; ;) {
        let pris = null;
        for (const x of CONTRATS) { const k = listes[x][q[x]]; if (k && (!pris || k.fin < listes[pris][q[pris]].fin)) pris = x; }
        if (!pris) break;
        candidats.push(listes[pris][q[pris]]); q[pris] += 1;
      }
      if (!candidats.length) return { fait: false, pourquoi: 'hourly cap reached (' + pleins.map((x) => x + ' ' + plafondHeure(bornes, x) + ' tx').join(', ') + ')' };
      /* le prix du gas : base du dernier bloc + pourboire borne ; au-dessus du plafond, on attend */
      const dernier = await rpc('eth_getBlockByNumber', ['latest', false]);
      const base = dernier && dernier.baseFeePerGas ? BigInt(dernier.baseFeePerGas) : null;
      if (base === null) { erreur('base fee not read'); return { fait: false, pourquoi: 'base fee not read' }; }
      let prio = 0n;
      try { prio = BigInt(await rpc('eth_maxPriorityFeePerGas', [])); } catch (_) { prio = 0n; }
      if (prio > bornes.prioWeiMax) prio = bornes.prioWeiMax;
      if (base + prio > bornes.maxFeeWei) { st.compteurs.sautsGas += 1; return { fait: false, pourquoi: 'gas price above the cap (' + (base + prio) + ' > ' + bornes.maxFeeWei + ' wei)' }; }
      const maxFee = 2n * base + prio > bornes.maxFeeWei ? bornes.maxFeeWei : 2n * base + prio;
      /* la simulation : le premier candidat qui se simule part ; un revert passe au suivant ; une panne RPC finit le tour (jamais un echec) */
      let choix = null;
      const budget = { n: bornes.simulationsParTour };
      try {
        for (const k of candidats) { choix = await simuler(k, budget, tete); if (choix || budget.n <= 0) break; }
      } catch (e) {
        if (!(e instanceof Passagere)) throw e;
        st.compteurs.simulationsNonLues += 1; erreur('simulation not run (node error, not counted as a failure): ' + e.message);
        return { fait: false, pourquoi: 'simulation not run' };
      }
      if (!choix) return { fait: false, pourquoi: 'simulation refused' };
      const k = choix.k, data = donneesDe(k);
      const gas = (choix.estime * 12n) / 10n;
      if (gas > bornes.gasMaxParTx) { erreur('gas ' + gas + ' above the per-tx cap'); return { fait: false, pourquoi: 'gas above the per-tx cap' }; }
      const nonce = BigInt(await rpc('eth_getTransactionCount', [adresse, 'pending']));
      const tx = { chainId, nonce, maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: k.to, value: 0n, data };
      verifierEnvoi(tx, { contrat: c, chainId, bornes, duels: cD, rolls: cR || cJ, duelsV2: cV, slotsAvant: cAvant }); /* ⛔ jette AVANT la signature si quoi que ce soit n est pas un appel admis */
      const signe = signerEip1559(tx, cle);
      if (bas(signe.de) !== bas(adresse)) throw new Error('keeper: the signature does not recover the keeper address');
      try {
        const h = await envoi('eth_sendRawTransaction', [signe.brut]);
        if (h && bas(h) !== bas(signe.hash)) erreur('node returned another hash than the signed one');
      } catch (e) {
        const m = msg(e);
        if (!/already known|known transaction/i.test(m)) {
          /* ⛔ une relance de l envoi (delai depasse, la tx deja minee) repond « nonce too low » / « replacement underpriced » : la tx
           *    SIGNEE ICI (son hash, calcule localement) est cherchee sur la chaine, puis le nonce, avant de parler d echec */
          let retrouvee = false;
          if (/nonce too low|nonce has already been used|replacement transaction underpriced|replacement fee too low/i.test(m)) {
            try {
              if (await rpc('eth_getTransactionReceipt', [signe.hash])) retrouvee = true;
              else if (await rpc('eth_getTransactionByHash', [signe.hash])) retrouvee = true;
              else if (BigInt(await rpc('eth_getTransactionCount', [adresse, 'latest'])) > nonce) retrouvee = true;
            } catch (e2) { retrouvee = true; erreur('send answered "' + m.slice(0, 60) + '" and the check could not read the node (' + msg(e2) + '): tracked until the inclusion timeout'); }
          }
          if (!retrouvee) { echec(nomTx(k) + ': send refused: ' + m, 'envoisRefuses', k.cible); return { fait: false, pourquoi: 'send refused' }; }
          st.compteurs.envoisRetrouves += 1; erreur('send answered "' + m.slice(0, 60) + '"; the signed tx (or its nonce) is on chain: tracked, not a failure');
        }
      }
      st.enVol = { hash: signe.hash, cible: k.cible, to: k.to, quoi: k.quoi, ids: k.ids, a: maintenant(), nonce: nonce.toString(), avant: k.avant || null };
      st.envoisHeure[k.cible].push(t0);
      st.compteurs.envois += 1; if (k.cible === 'slots') st.compteurs.spinsEnvoyes += k.ids.length;
      const de = { a: new Date(t0).toISOString(), hash: signe.hash, ids: k.ids, quoi: k.quoi, maxFeeWei: maxFee.toString(), gas: gas.toString() };
      st.parContrat[k.cible].envois += 1; st.parContrat[k.cible].dernierEnvoi = de;
      st.dernierEnvoi = { ...de, cible: k.cible };
      return { fait: true, hash: signe.hash, ids: k.ids, cible: k.cible, quoi: k.quoi };
    } catch (e) {
      erreur('round failed: ' + msg(e));
      return { fait: false, pourquoi: 'round failed' };
    } finally { enCours = false; }
  }

  const heure = (x) => st.envoisHeure[x].filter((y) => maintenant() - y < 3600000).length;
  return {
    /** l etat PUBLIABLE (/sante) : jamais la cle */
    etat: () => {
      const cD = duelsCfg ? resoudre(duelsCfg.contrat) : null, cR = rollsCfg ? resoudre(rollsCfg.contrat) : null;
      return {
        /* round 4 : DEGRADE = ON, mais sa tete est gelee (il ne lit ni n envoie rien sur elle) ; la porte des duels exige 'ON' */
        etat: st.etat === 'ON' && st.gelee ? 'DEGRADE' : st.etat, adresse: st.adresse, contrat: c, chaine: chainId, chaineVerifiee: st.chaineVue, depuis: st.depuis, msParBlocMesure: st.msParBloc, intervalleMs: st.intervalleMs,
        /* revue fix2 defaut 2 : 'injecte' (msParBloc passe a creerRegleur), 'mesure', ou null (pas encore mesure : 200 ms supposes pour la marge) */
        tempsDeBloc: fixe !== null ? 'injecte' : st.msParBloc !== null ? 'mesure' : null,
        fenetreSecondes: st.msParBloc ? Slots.secondesFenetre(st.msParBloc) : null, suivis: suivis.size, enVol: st.enVol ? { hash: st.enVol.hash, cible: st.enVol.cible, quoi: st.enVol.quoi, ids: st.enVol.ids } : null,
        dernierTour: st.dernierTour, dernierEnvoi: st.dernierEnvoi, dernierRegle: st.dernierRegle, erreurs: st.erreurs.slice(), echecsSuite: st.echecsSuite, arret: st.arret,
        /* revue keeper 3 : l etat DEGRADE (ON, mais des echecs en cours : recu illisible, revert, envoi refuse, non incluse) — dit, jamais tu */
        degrade: st.etat === 'ON' && (st.echecsSuite > 0 || st.gelee) ? { echecsSuite: st.echecsSuite, arretA: bornes.echecsMax, dernier: st.dernierEchec,
          /* round 4 : la tete gelee et POURQUOI (null si la tete bouge) */
          teteGelee: st.gelee ? { ...st.gelee } : null, pourquoi: st.gelee ? st.gelee.pourquoi : st.echecsSuite + ' failure(s) in a row (stop at ' + bornes.echecsMax + ')' } : null,
        envoisDerniereHeure: CONTRATS.reduce((s, x) => s + heure(x), 0), compteurs: { ...st.compteurs },
        /* 2026-10-24 : l activite PAR CONTRAT (/sante) ; revue keeper 2 : son plafond horaire et ses envois de l heure */
        contrats: {
          slots: { contrat: c, suivis: suivis.size, ecartes: [...ecartes.keys()], envoisDerniereHeure: heure('slots'), plafondHeure: plafondHeure(bornes, 'slots'), ...st.parContrat.slots },
          slotsAvant: avant ? { contrat: avant.c, suivis: avant.suivis.size, ecartes: [...avant.ecartes.keys()] } : null,
          /* revue duels-gate D1 : lu (derniere lecture REUSSIE des duels, ISO) et erreurLecture (la derniere ratee ; null apres un succes) —
           *   duels-plan-app.js regleurCouvre les exige frais et sans erreur ; clos = egalites / finals jamais relus */
          duels: { contrat: cD, configure: !!duelsCfg, suivis: duelsSuivis.size, clos: duelsClos.size, lu: lectureDuels.lu, erreurLecture: lectureDuels.erreur, lecturesRatees: lectureDuels.ratees,
            envoisDerniereHeure: heure('duels'), plafondHeure: plafondHeure(bornes, 'duels'), ...st.parContrat.duels },
          rolls: { contrat: cR, configure: !!rollsCfg, aujourdhui: jours.aujourdhui, joursClos: [...jours.finis], envoisDerniereHeure: heure('rolls'), plafondHeure: plafondHeure(bornes, 'rolls'), ...st.parContrat.rolls },
          /* DENIM 2026-11-05 : BlockDuelsV2 (settle des seuls duels que le rejoignant gagne) et les rolls joues (settleMany des gagnants) ;
           *   lu / erreurLecture : la derniere lecture reussie / ratee, comme les duels v1 */
          duelsV2: { contrat: v2Cfg ? resoudre(v2Cfg.contrat) : null, configure: !!v2Cfg, suivis: v2.suivis.size, clos: v2.clos.size, rejoignantsGagnants: v2.rejoignants, createursGagnants: v2.createurs, egalites: v2.egalites,
            lu: v2.lecture.lu, erreurLecture: v2.lecture.erreur, envoisDerniereHeure: heure('duelsV2'), plafondHeure: plafondHeure(bornes, 'duelsV2'), ...st.parContrat.duelsV2 },
          rollsJoues: { contrat: joueCfg ? resoudre(joueCfg.contrat) : null, configure: !!joueCfg, suivis: rj.suivis.size, clos: rj.clos.size, ecartes: [...rj.ecartes.keys()], perdants: rj.perdants,
            lu: rj.lecture.lu, erreurLecture: rj.lecture.erreur, envoisDerniereHeure: heure('rollsJoues'), plafondHeure: plafondHeure(bornes, 'rollsJoues'), ...st.parContrat.rollsJoues },
        },
        bornes: { spinsParTx: bornes.spinsParTx, maxFeeWei: String(bornes.maxFeeWei), txParHeure: Object.fromEntries(CONTRATS.map((x) => [x, plafondHeure(bornes, x)])), gasMaxParTx: String(bornes.gasMaxParTx), echecsMax: bornes.echecsMax, simulationsParTour: bornes.simulationsParTour, joursRecul: bornes.joursRecul,
          delaiDuelBlocs: bornes.delaiDuelBlocs, margeFinDuelBlocs: margeFinDuel(bornes, st.msParBloc, st.intervalleMs),
          /* DENIM 2026-11-05 : la borne d inclusion EFFECTIVE, et les deux mesures dont le temps retenu est tire */
          inclusionMaxMs: inclusionMaxDepuisBloc(st.msParBloc, bornes), msParBlocLong: st.msLong, msParBlocCourt: st.msCourt },
      };
    },
    tour,
    /** la boucle : un tour, puis le suivant apres intervalleMs (re-derive a chaque tour) ; unref : ne retient pas le processus */
    demarrer() {
      const boucle = async () => { await tour(); if (st.etat === 'ON') { minuteur = setTimeout(boucle, st.intervalleMs); minuteur.unref?.(); } };
      minuteur = setTimeout(boucle, 5000); minuteur.unref?.();
      return true;
    },
    arreter() { clearTimeout(minuteur); minuteur = null; },
  };
}
