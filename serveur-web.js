// serveur-web.js — sert l app en production, avec les en-tetes que GitHub Pages ne laisse pas regler.
// ================================================================================================
// ⛔ LA RAISON D ETRE DE CE FICHIER EST UNE MESURE. Le 2026-09-10, `tokenized-block.github.io`
//    repondait `Cache-Control: max-age=600` sur chaque page, et cet en-tete n est pas configurable
//    la-bas. Dix minutes pendant lesquelles un visiteur revoit le deploiement PRECEDENT — Phil l a
//    constate en rechargeant et en retrouvant l ancienne version. Un correctif deploye qu on ne peut
//    pas montrer n est pas un correctif.
//
// ⇒ ICI LE HTML NE SE MET JAMAIS EN CACHE. `no-cache` ne veut pas dire « ne garde rien » : ca veut
//   dire « redemande-moi avant de reutiliser ». Le navigateur garde sa copie, envoie son ETag, et
//   recoit 304 si rien n a bouge. Cout : une requete. Gain : plus jamais d ancienne version.
//
// ⛔ LISTE BLANCHE EXPLICITE, PAS DE PARCOURS DE DOSSIER. Un serveur statique qui resout un chemin
//    demande sert `../../.env` le jour ou quelqu un le demande. Ici un chemin absent de la table
//    n existe pas, point — meme discipline que le serveur de developpement.
//
// ⛔⛔ CE QUE CE PROCESSUS TOUCHE — corrige le 2026-09-23, parce que la phrase d avant etait FAUSSE.
//    Elle disait « AUCUN SECRET, AUCUNE CLE, AUCUNE ECRITURE ». Or :
//    · ECRITURE : il ecrit deja, en trois endroits (le cache trending et les compteurs d entonnoir,
//      par remplacement atomique sur le volume). La phrase etait perimee depuis ces ajouts, et
//      personne ne l avait remise a jour — un commentaire qui ment est pire qu un commentaire absent,
//      parce qu on s en sert pour decider qu il n y a rien a verifier.
//    · CLE : depuis /api/onramp/session, ce processus LIT une cle secrete CDP dans son environnement
//      pour signer un jeton de deux minutes. C est le rail fiat->Base demande par Phil, et il ne peut
//      pas exister autrement : la doc CDP impose un `sessionToken` fabrique cote serveur.
//    ⛔ CE QUI RESTE VRAI, ET QUI EST GARDE PAR test-onramp-fail-closed / test-cdp-jwt :
//      la cle ne traverse QUE `cdp-jwt.js`, elle n est jamais rendue, jamais journalisee, et aucune
//      reponse HTTP ne la contient — meme en cas d erreur. Sans elle, la route REFUSE en nommant ce
//      qui manque ; elle ne fabrique jamais d URL de secours.
import { pauseNosBlocks, routeurEnchaine } from './rythme-fond.js';
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, timingSafeEqual } from 'node:crypto';
/* ⛔⛔ AJOUTE LE 2026-09-22, APRES MESURE ET PAS PAR PRINCIPE. Le serveur n envoyait AUCUNE
 * compression : une requete HEAD avec Accept-Encoding gzip ne rendait pas de content-encoding, et
 * app.html partait en 672 523 octets BRUTS a chaque visite — la ou il en fait 213 210 en gzip.
 * 459 Ko de trop, pour chaque visiteur, sur la page d accueil d un produit qu on essaie justement
 * de faire decouvrir. Mesure faite avant le correctif, et refaite apres. */
import { gzipSync } from 'node:zlib';
import { resumerLancementsOL, OL_LISTE_BASE } from './openlaunch.js';
/* ⛔ LES ESPACEMENTS DE TICK VIENNENT DE LA FACTORY, plus d une liste ecrite a la main : elle en
 *   oubliait trois (80, 150, 500) et cachait la moitie du volume des blocks cotes en action. */
import { lireEspacements, phraseEspacements, ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
/* ⛔ L ORIGINE DES ACTIONS TOKENISEES, D APRES L EMETTEUR — 40 adresses, pas nos 15. */
import { lireActionsEmetteur, phraseActionsEmetteur } from './actions-emetteur.js';
/* 2026-10-25 — LES ACTIONS DE L EMETTEUR, PROUVEES SUR LA CHAINE (code 0xef + log de la factory B20 + tx.from), et leur route d achat */
import { candidatsActions, decouvrirActions, lireUnites, routeAction, routeServie, resumeActions, CREATEUR_EMETTEUR,
  ROUTES_PAR_TOUR, ROUTE_TTL_MS, UNITES_TTL_MS, routePourLigne, lecteurPreuves, verdictGravable, CREATIONS_GRAINE, prouverAction,
  ROUTE_SERVIE_MAX_MS } from './actions-chaine.js';
/* 2026-10-25 — CHAQUE LIEU D ECHANGE D UNE ACTION (notre factory, la factory « aero » 0x9cb2… et son routeur 0x9ee3… prouves sur fork,
 *   Uniswap v4), cote par les memes regles ; le meilleur qui passe est servi (`routeAction.meilleure`) et le planificateur l emprunte */
import { coterVenueCL, venuesServies, lireCodeQuoteurNouvelle, overrideQuoteur } from './liquidite-actions.js';
import { STABLES_NEUVE, verdictStableNeuve, STABLE_NEUVE_MAX_MS, STABLE_NEUVE_TOUR_MS } from './stables-neuve.js';
import { QUOTEUR_AERODROME_CL as QUOTEUR_AERODROME_CL_LIQ } from './rolls-en-action.js';
import { estDeviseConnue } from './pool-sans-hook.js';
/* le rail fiat->Base : validation pure + transport, et la signature isolee dans son propre module */
import { etatCdp, validerDemande, urlOnramp, creerSession, lireOptionsAchat, corpsReponseOptions, CHEMIN_OPTIONS_ACHAT } from './onramp-session.js';
/* le post grave, demande a X depuis ICI — jamais par un script dans la page du visiteur */
import { lirePostPublie } from './post-grave.js';
/* 2026-10-25 : les bornes de l index des createurs, servies a /api/blocks-de (le navigateur ne relit que le reste) */
import { bornesIndex, noterFaitsCreations, plusRecentesDabord, CREATIONS_SERVIES_MAX } from './creations-index.js';
const postsLus = new Map();
import { signerJwtCdp } from './cdp-jwt.js';
/* 2026-10-26 : le second rail fiat (MoonPay) pour les pays que Coinbase ne sert pas ; cache sans les deux cles */
import { lireCatalogueMoonpay, corpsPaysMoonpay, corpsSessionMoonpay } from './moonpay-rail.js';
/* 2026-11-04 : paiement USDC sur une boutique Shopify -> droits HORS CHAINE, bons de skin EIP-712 (cle dediee, mint seul) ;
 * aucune transaction signee ni envoyee ici, aucun fonds ; cache sans config */
import { traiterWebhook, corpsDroits, corpsEtat, corpsBon, creerMagasin, CORPS_MAX as SHOPIFY_CORPS_MAX } from './shopify-usdc.js';
/* Catalogue PUBLIC MoonPay : une lecture par heure au plus, un echec retenu 60 s (une absence ne doit pas etre repayee a
 * chaque ouverture de fiche), une seule lecture en vol. Echec = null = rail cache, jamais « tous les pays ». */
/* game81 (reste connu depuis le 31/10) : l IP du visiteur pour les budgets par IP (/api/jeu/roll, TAM, recherche…). Avant : le PREMIER
 *   element de x-forwarded-for — celui que le CLIENT ecrit lui-meme, donc falsifiable (un nouveau budget a chaque requete).
 *   Maintenant : le DERNIER element, celui qu ajoute le proxy de Railway devant nous ; s il remplace l en-tete, c est le seul element.
 *   Sans en-tete : l adresse de la socket. (Le comportement exact de l edge Railway est verifie en prod par une sonde, pas suppose.) */
function ipClient(req) {
  const xff = String((req && req.headers && req.headers['x-forwarded-for']) || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : String((req && req.socket && req.socket.remoteAddress) || '');
}
let catMoonpay = { t: 0, r: null, vol: null };
function catalogueMoonpay() {
  const age = Date.now() - catMoonpay.t;
  if (catMoonpay.r && age < 3600000) return Promise.resolve(catMoonpay.r);
  if (!catMoonpay.r && catMoonpay.t && age < 60000) return Promise.resolve(null);
  if (catMoonpay.vol) return catMoonpay.vol;
  catMoonpay.vol = lireCatalogueMoonpay()
    .then((r) => { catMoonpay = { t: Date.now(), r: r || null, vol: null }; return r || null; },
      () => { catMoonpay = { t: Date.now(), r: null, vol: null }; return null; });
  return catMoonpay.vol;
}

/* ⛔ PONT OPENLAUNCH (tip 0022). Leur API ne renvoie aucun en-tete CORS : la page ne peut pas la lire. Ce serveur la
 * lit pour elle — GET seul, 8 s max, UNE lecture par minute quel que soit le trafic, et il ne renvoie que le RESUME
 * valide par openlaunch.js (jamais la reponse brute). Echec = { ok:false } dit tel quel, pas une liste vide. */
let olCache = { a: 0, corps: null }, olEnCours = null;
function listeOpenLaunch() {
  if (olCache.corps && Date.now() - olCache.a < 60_000) return Promise.resolve(olCache.corps);
  /* des visiteurs simultanes partagent la MEME lecture en cours */
  if (!olEnCours) olEnCours = lireOpenLaunch().finally(() => { olEnCours = null; });
  return olEnCours;
}
async function lireOpenLaunch() {
  let corps;
  try {
    const r = await fetch(OL_LISTE_BASE, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    corps = JSON.stringify({ ok: true, lu: new Date().toISOString(), ...resumerLancementsOL(await r.json()) });
  } catch (e) {
    corps = JSON.stringify({ ok: false, pourquoi: 'OpenLaunch not read: ' + String(e && e.message || e).slice(0, 80) });
  }
  olCache = { a: Date.now(), corps };
  return corps;
}

/* ⛔ TRENDING (tip 0034). Mesure 2026-09-17 : ~5,4 M$ de volume 24 h sur les blocks B20 nes en 24 h, lances AILLEURS ;
 * on ne capte leurs frais que si le trade passe par notre Buy/Sell. Ce serveur tient la liste des blocks crees (logs
 * de la factory B20, lecture seule, ~12 h puis increments (tip 20260923-map-trending)), lit DexScreener par lots de 30 et renvoie le classement.
 * Une lecture complete au plus toutes les 5 min, partagee par tous les visiteurs. Echec = { ok:false }, dit tel quel. */
import { listerCreations, createurDe } from './index-blocks.js';
import { prouverCreationB20 } from './creation-b20-prouvee.js';
/* ⛔ 2026-10-02 (Raksha) : COMMENT UN BLOCK PARLE, choisi par son createur — meme module que la page (une seule source). */
import { verifierEcriture, recupererSignataire, proprietaireDuBlock, voixPublique, nettoyerVoix } from './voix-block.js';
import { frappesVers } from './mes-blocks.js';
/* ⛔ LE CALCUL DE GLISSEMENT EST PARTAGE AVEC LE CLIENT, pas recopie ici : deux implementations du
 *   meme calcul divergent, et c est le client qui ouvre ou ferme la puce. Une seule source. */
import { glissementBps, TAILLE_REFERENCE_USDC } from './porte-achat.js';
/* ⛔ LE SELECTEUR SE CALCULE, IL NE SE TAPE PAS. `keccak.js` est pur (zero dependance) et c est la
 *   seule source du depot : un selecteur ecrit a la main ne plante pas, il interroge une AUTRE
 *   fonction et rend un silence qu on lirait comme un fait. */
import { selecteur as selecteurSrv, topic as topicSrv, keccak256Hex as keccak256HexSrv } from './keccak.js';
import { parseTx } from './fly-tx.js';
import { createRelayGuard } from './fly-relay.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { readPoolPrice } from './fly-price.js';
import { createFly, createSession, foreseeNext, FLY } from './fly-core.js';
import { readPrices as tbReadPrices, readHold as tbReadHold, holdMessage as tbHoldMessage, verifyOwnership as tbVerifyOwnership,
  telegramInvite as tbTelegramInvite, telegramConfigured as tbTelegramConfigured, telegramReply as tbTelegramReply, joinRequestDecision as tbJoinRequestDecision, holderTagCall as tbHolderTagCall, HOLD_THRESHOLD_USD as TB_HOLD_USD, CHALLENGE_TTL_S as TB_CHALLENGE_TTL_S, TBLOCK_POOL as TB_POOL } from './tblock-hold.js';
import { readBurn as tbReadBurn } from './tblock-burn.js';
import { verifierFrais, compterRevenu, walletsInternes, devisesComptees, LIGNES_FRAIS } from './revenu-externe.js';
import { ligneRegistre, totauxParCreateur } from './ref-vitrine.js';
import { saisonDe, valeurUsd, crediter, tickets, racine, tirer, F_USD_V1, jourDe, moisDe, joursEntre, entreesPeriode, SEUIL_VOLUME_JOUR_USD, JOUR_MS, ticketsJour, joursPass, crediterPassSemaine } from './tirage-saison.js';
import { volumeVerifie, poolIdDe, passSkinVerifie } from './volume-tirage.js';
import { BLOCKSKINS as BLOCKSKINS_SRV, BLOCKSKINS_LUS as BLOCKSKINS_LUS_SRV, BLOCKSKINS_ACTIF as BLOCKSKINS_ACTIF_SRV, SKIN_MINT_USDC as SKIN_MINT_USDC_SRV, lireSkins as lireSkinsSrv, DEVISES_SKIN as DEVISES_SKIN_SRV } from './blockskins.js';
import { skinsPrixCorps } from './blockskins-actif.js';
import { sourcesSkins } from './blockskins-actif.js'; /* 2026-11-12: one XP source per skins contract the app minted on, each with its own key */
import { lireEvenementsJeu, evenementsPractice, fusionnerJournal, avecBlocks, TOPICS_ROLLS as TOPICS_ROLLS_JOURNAL, TOPICS_SKINS as TOPICS_SKINS_JOURNAL,
  TOPICS_DUELS as TOPICS_DUELS_JOURNAL, TOPICS_MISSIONS as TOPICS_MISSIONS_JOURNAL, JOURNAL_MAX, tempsDeBloc as tempsDeBlocJournal,
  profondeurJournee, premierBlocDuJour, journeeCouverte, garderJournal, completerJournal, ajouterListing } from './journal-jeu.js';
import { premierBlocApres, DELAI_REVELATION_S } from './face-du-jour.js';
/* 2026-10-23 DENIM : le temps de bloc MESURE (deux en-tetes), et les reculs exprimes en secondes convertis avec lui (temps-de-bloc.js) */
import { sParBlocMesure, enteteVersMesure, blocsPour, RECUL_MESURE_BLOCS, sParBlocPrudent } from './temps-de-bloc.js';
import { creerMesureCourte } from './temps-de-bloc-court.js';
import { actionsDesLogs, crediterActions, joursTicketParWallet, niveauWallet, bonusNiveauxSemaine, TOPICS_XP, XP_PAR_ACTION, NIVEAUX_XP } from './niveaux-jeu.js';
import { WETH_BASE } from './plan-eth-block.js';
import { attester, mesurerFenetre } from './missions-attestation.js';
import { lireMissions } from './missions-lecture.js';
import { MISSIONS_DEPLOIEMENT } from './missions-deploiement.js';
/* 2026-10-18 : BlockRolls (roll paye 0,50 USDC, day pass 10 USDC) — la fiche GENEREE (preparer-deploiement-blockrolls.mjs) ; `adresse` reste
 *   null tant que Phil n a pas signe : l app ne montre alors AUCUN bouton payant (practice). Aucune variable d environnement ne la remplace. */
import { BLOCKROLLS_DEPLOIEMENT } from './blockrolls-deploiement.js';
/* 2026-10-23 (Phil) : BlockSlots — la machine a sous a trois faces de bloc. La fiche GENEREE (preparer-deploiement-slots.mjs) ; `adresse`
 *   reste null tant que le proprietaire n a pas signe : /api/slots rend alors PAS_OUVERT et l app ne montre AUCUN bouton Slots. */
import { SLOTS_DEPLOIEMENT } from './slots-deploiement.js';
/* 2026-11-12 (Phil): WHICH Spin is served and settled — the new Spin (dev share through the TBLOCK payment router) once its address is
 *   recorded in skins-spin-deploiement.js, with the earlier Spin still settled; until then the live Spin, exactly as before (spin-actif.js) */
import { SPIN_ACTIF } from './spin-actif.js';
import { TAMART_DEPLOIEMENT } from './tamart-deploiement.js';
import { serveurTam } from './tam-serveur.js';
/* 2026-10-24 (Phil : « miser en USDC ou en tout B20 / action de l app, seul ce qui a une liquidite profonde ») : la regle et les devis
 *   exact-output des jetons misables (misables.js) ; /api/misables sert la liste, LECTURE SEULE, en cache 60 s. */
import { CANDIDATS_CL as CANDIDATS_MISABLES, coterMisableTailles, ligneMisable, listeMisables, SEUIL_ECART_BPS as SEUIL_MISABLE_BPS,
  PROFONDEUR_MIN_USDC as PROFONDEUR_MISABLE, DEVIS_BLOCS_MAX as DEVIS_MISABLE_BLOCS, TAILLES_USDC as TAILLES_MISABLES, MESURE_REFERENCE as MESURE_MISABLES,
  USDC as USDC_MISABLES } from './misables.js';
/* 2026-10-28 (Phil) : UNIT, UNE option de plus — chemin UNIT -> ETH (pool UNIT, hook 7030) -> USDC, juge a la taille REELLE (pas 10 000 USDC) */
import { coterUnitTailles, ligneUnit, UNIT_APPELS_MAX } from './payer-unit.js';
/* 2026-10-23 (Phil, option 3) : le REGLEUR des slots — sans SLOTS_KEEPER_KEY il ne fait rien et le dit (/sante) ; avec, il envoie settleMany
 *   (et rien d autre) au contrat de la fiche, du wallet du regleur (gas seulement ; le contrat paie les joueurs). slots-regleur.js. */
import { creerRegleur } from './slots-regleur.js';
/* 2026-11-12 : le keeper du TBLOCK buyback qui paie le holders vault (buyback-keeper.js) — rien tant que la fiche n a pas d adresse ;
 *   sans BUYBACK_KEEPER_KEY (ou si sa cle n est pas le KEEPER de la fiche) il ne fait rien et le dit (/sante). N envoie que buyback(uint256). */
import { creerKeeperBuyback } from './buyback-keeper.js';
/* 2026-11-12 : le keeper de la part dev du Spin (spin-dev-keeper.js) : n appelle que payDev, depuis la meme cle gas-only que le buyback */
import { creerKeeperSpinDev, creerExclusif } from './spin-dev-keeper.js';
import { BUYBACK_VAULT_DEPLOIEMENT } from './tblock-buyback-vault-deploiement.js';
/* 2026-10-18 : TicketPot LIVE (0xf986…1df1, bloc 52 776 705) — la fiche notee, et la lecture PURE du jour (lireJour : aucune cle requise) */
import { TICKETPOT_DEPLOIEMENT } from './ticketpot-deploiement.js';
/* 2026-10-27 : le SECOND TicketPot, qui paie en UNIT (18 decimales ; meme contrat, son propre verifyingContract), note par noter-deploiement */
import { TICKETPOT_DEPLOIEMENT as TICKETPOT_UNIT_DEPLOIEMENT } from './ticketpot-unit-deploiement.js';
import { lireJour as lireJourTicketPot } from './ticketpot-attestation.js';
import { dayDeJourId as dayDeJourIdPot, jourSemaineReclamable, jourIdDeDay as jourIdDeDayPot, claimableUntil as reclamablePotSrv } from './ticketpot-plan.js';
import { partsDuJour as partsTicketPot, verifierSignaturePart } from './ticketpot-parts.js';
import { cacheTemporise, couvertureParts } from './ticketpot-parts-serveur.js';
import { depensesJeu, passesAchetes, TOPIC_ROLLED as TOPIC_ROLLED_SRV, TOPIC_PASS as TOPIC_PASS_SRV } from './volume-rolls.js';
/* 2026-10-18 (Phil 09:00) : le Game pour le MCP du brain — etat du jeu, roll classique (<= 10 par lot), settle, mission (jeu-agent.js, serveur seul) */
import { etatJeuAgent, planRollAgent, planSettleAgent, planTaskAgent, lireGuess as lireGuessAgent } from './jeu-agent.js';
import { appelPot as appelPotRolls, lireUint as lireUintRolls } from './rolls-jeu.js';
/* 2026-10-18 (Phil) : LES DUELS (BlockDuels, contrat ecrit en parallele). L app lit /api/duels (LECTURE SEULE : aucun envoi, aucune cle).
 *   La fiche duels-deploiement.js est GENEREE par la partie contrat ; tant qu elle est absente, ou que son `adresse` n est pas une adresse,
 *   /api/duels rend PAS_OUVERT et AUCUNE lecture de chaine n a lieu. Chargee par import() DYNAMIQUE : un fichier absent ne fait pas tomber le
 *   serveur (un import statique d un fichier absent = serveur MORT au demarrage). Export attendu : DUELS_DEPLOIEMENT { adresse, bloc,
 *   constructeur: { usdc, devWallet, rewardPool, guardian } } (ou `default`). */
import { lireDuels, duelEnJson, filtreLogsDuels, TAILLE_FENETRE_LOGS as TAILLE_LOGS_DUELS, partage as partageDuel, MISE_MIN as MISE_MIN_DUEL,
  EXPIRATION_MIN_S as EXP_MIN_DUEL, EXPIRATION_MAX_S as EXP_MAX_DUEL, FINIS as FINIS_DUEL, etatDuel as etatDuelSrv, regleurCouvre } from './duels-plan-app.js';
/* 2026-10-24 : la liste des duels vient de l ETAT (nextId + duels(id) par eth_call), plus des logs d archive (duels-etat.js) */
import { appelNextIdEtat, appelDuelEtat, lireNextId as lireNextIdDuels, duelDepuisEtat, reglerDepuisHash, idsDuelsATour } from './duels-etat.js';
/* 2026-10-24 (audit rolls-duels) : les regles VIVANTES de BlockRolls (currentRules, rulesVersion, unitCreator, MAX_PRIZE) lues sur la chaine */
import { lireReglesRolls, creerCacheRegles } from './rolls-regles.js';
let DUELS_DEPLOIEMENT = null;
import('./duels-deploiement.js').then((m) => { DUELS_DEPLOIEMENT = (m && (m.DUELS_DEPLOIEMENT || m.default)) || null; })
  .catch((e) => { if (!/Cannot find module|ERR_MODULE_NOT_FOUND/.test(String((e && e.code) || '') + String((e && e.message) || ''))) console.log('[duels] fiche illisible :', String((e && e.message) || e).slice(0, 160)); });
/* 2026-10-24 (Phil) : BLOCKDUELS V2 — un duel rejoint non regle dans sa fenetre est gagne par defaut par le createur (plus d option gratuite,
 *   plus de regleur necessaire). Fiche duels-v2-deploiement.js (import DYNAMIQUE, comme v1) ; tant qu elle n a pas adresse ET bloc, /api/duels
 *   sert v1 exactement comme avant (creer / rejoindre fermes, la phrase dit pourquoi). Lecture par l ETAT : duels-v2-serveur.js. */
import { creerLecteurDuelsV2, reponseDuelsV2, contratDeFicheV2, lireAvantReponse, demandeFraiche } from './duels-v2-serveur.js';
let DUELS_V2_DEPLOIEMENT = null;
import('./duels-v2-deploiement.js').then((m) => { DUELS_V2_DEPLOIEMENT = (m && (m.DUELS_V2_DEPLOIEMENT || m.default)) || null; })
  .catch((e) => { if (!/Cannot find module|ERR_MODULE_NOT_FOUND/.test(String((e && e.code) || '') + String((e && e.message) || ''))) console.log('[duels v2] fiche illisible :', String((e && e.message) || e).slice(0, 160)); });
/* ⛔ LE DECODEUR D `Initialize` EST CELUI DU DEPOT, et il REFUSE une cle dont le poolId ne se
 *   recalcule pas. En reecrire une copie ici ferait un lecteur plus faible que le canonique — la
 *   faute que j ai deja faite deux fois aujourd hui. */
/* ⛔ ON N IMPORTE PAS `TOPIC_INITIALIZE` : ce fichier en declare DEJA un, ecrit en dur plus bas.
 *   ⭐ VERIFIE avant de s y fier, parce qu une constante recitee qui divergerait serait un bug muet :
 *     calcule par keccak  0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438
 *     ecrit en dur ici    0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438
 *   IDENTIQUES. On garde celui du fichier pour ne pas creer deux sources du meme fait. */
import { decoderInitialize } from './pools-du-jeton.js';
/* 2026-10-26 — LA CLE D UN BLOCK PAR LE poolId QUE DEXSCREENER REND DEJA (et sa date) : un getLogs etroit, prouve par decoderInitialize */
import { clePoolParId, indicesPoolIdDepuisPaires } from './cle-par-pool-id.js';
import { cleV4Connue } from './cle-v4-connue.js';
import { LOGS_INITIALIZE_MESURES } from './cles-v4-mesurees.js';
import { prochaineFenetre } from './fenetre-scan.js';
import { scannerNesDuRouteur, GRAINE_ROUTEUR, GRAINE_JUSQUA, PLANCHER_ROUTEUR, RETARD_MAX_INDEX, chargerIndexRouteur, chargerNosBlocksTb, sourcesTbLues, neDuRouteur, ROUTEURS_ANCIENS } from './index-routeur.js';
import { veiller } from './veille-pot.js';
import { lireNaissance, passeIncrementale, verifierSomme, soldesNegatifs } from './soldes-jeton.js';
import { partsHolders } from './parts-holders.js';
/* ⛔ LA VEILLE DES FRAIS VIT DANS SON MODULE, TESTE (66 assertions) : la reecrire ici en ferait une
 *    copie plus faible, sans ses quatre etats ni sa borne de fenetres ratees. */
import { scannerLancements } from './lancements-etrangers.js';
import { scanFrais, verifierArrivee, resumerFrais } from './veille-frais.js';
import { NOS_BLOCKS_GENESE, GRAINE_NOS_BLOCKS, graineNosBlocksAdmise, verifierGraineNos } from './origine.js';
import { FEE_WALLET, USDC_BASE, CREATE_ROUTER } from './frais-creation.js';
import { verifierEmission, creerServiceEmission, phraseEmission } from './emission-b20.js'; /* game376 : who can still create more of a block */
import { etatLive, htmlLive } from './live.js';
import { TBLOCK as TBLOCK_JETON, TBLOCK_TEST_ANCIEN, estJetonMasque, OPTIONS_LANCEMENT, HOOK_7030, estNotreHook as estNotreHookAchat } from './tokenomics.js';
import { verifierAchatSkin, validerRecette, jugerBlocSkinV1, COUPURE_SKINS_V1 } from './skins.js';
import { faceDuBlock } from './face.js';
import { logoSvg, paramsLogoDepuisApparence } from './logo.js';
/* ══ RASTERISEUR PNG, CHARGE A LA DEMANDE ══════════════════════════════════════════════════════════
 * ⛔ POURQUOI UN PNG : Base App lit l « image » du contractURI d un B20 ; Coinbase y met une URL https vers un PNG
 *    (mesure sur AAPLc, 2026-09-18). Un SVG en data: ne s y affiche pas.
 * ⛔ POURQUOI WASM : une version native compilee sous Windows planterait le serveur Linux. @resvg/resvg-wasm 2.6.2,
 *    zero dependance. La police (DejaVu Sans Bold, licence libre jointe dans polices/) est chargee avec lui : le WASM
 *    n a aucune police systeme, et sans elle la lettre du logo disparait (mesure : rendu sans lettre).
 * ⛔ CHARGEMENT PARESSEUX ET ISOLE : si le WASM ou la police manquent, SEULE la route .png repond 503 — le reste du
 *    serveur ne depend jamais d eux. */
let rasteriseur = null;
async function obtenirRasteriseur() {
  if (rasteriseur) return rasteriseur;
  const mod = await import('@resvg/resvg-wasm');
  const dir = dirname(fileURLToPath(import.meta.url));
  await mod.initWasm(readFileSync(join(dir, 'node_modules', '@resvg', 'resvg-wasm', 'index_bg.wasm')));
  const police = readFileSync(join(dir, 'polices', 'DejaVuSans-Bold.ttf'));
  rasteriseur = (svg, largeur = 256) => new mod.Resvg(svg, { fitTo: { mode: 'width', value: largeur },
    font: { fontBuffers: [police], defaultFontFamily: 'DejaVu Sans', loadSystemFonts: false } }).render().asPng();
  return rasteriseur;
}
import { resumerTrending } from './trending.js';
import { avecRepliLogs, lecteurUrl as lecteurUrlNu, classeEnvoi } from './repli-logs.js';
import { pairesProposees, pairesLancables, ACTIONS_COINBASE, DEVISES_BASE } from './paires.js';
import { lireAvoirs, classeLot } from './avoirs.js';
import { planRail, echangesDevisesAnnonces } from './rails-api.js';
import { planAchatPourCoffre, planWtcoinVersTblock, devisUsdcVersTblock } from './tblock-route.js'; /* game337: ETH -> TBLOCK -> holders vault; game339: resume */
import { ECONOMIE_DEPLOIEMENT } from './economie-deploiement.js';
import { validerRelais, RELAIS_CORPS_MAX } from './relais-rpc.js'; /* game341: the page's last-resort read relay */
import { lireEtatNaissance } from './etat-naissance.js'; /* game343 CREATE-ONE-PATH: the one reader of a birth */
import { lireCoffrePaye } from './coffre-paye.js';
import { classement, vueCompte, joueursParSemaine } from './coeurs.js'; /* game346: hearts given / received / board */
import { creerSante } from './rpc-sante.js'; /* game362: one health state per RPC host */
import { creerIndexCoeursSuite, LIKES_DEPLOY_BLOC } from './coeurs-index.js';
import { creerSignataires, derniersCoeurs, coeursPourLeFil } from './coeurs-fil.js'; /* game378: hearts in the Live feed, each checked on its receipt (tx.from) */
import * as EP_PACK from './economie-pack.js'; /* 2026-11-12: the live economy pack (addresses from its deployment record) */
import { creerIndexLogs } from './index-logs.js'; /* game353: the community points */
import { TOPICS as TOPICS_LOCK, decoderLock, LOCK_DEPLOY_BLOC } from './lock-evenements.js';
import { tableauPoints } from './points.js';
import { TBLOCK_PAR_POINT_JEU } from './points.js'; /* 2026-11-12: /api/points says the hearts rule from points.js, never typed */
import { LOCK_DEPLOIEMENT } from './lock-deploiement.js';
const TBLOCK_ADR = '0xb200000000000000000000ba9bf8330307f8830e';
const NAISS_ETAT = { cache: new Map(), minute: 0, parIp: new Map() };
import { lireMarchesMorpho, lireFraisMorphoChaine, lirePositionsMorpho, planEmprunter, planPreter, planRembourser, planRetirerGarantie, planRetirerPret, planEmprunterPanier, PANIER_MAX } from './banque-morpho.js';
/* 2026-10-04 : la naissance planifiee pour un agent, le MCP, et la sortie du minimum du createur (hook 7030) */
import { planNaissance, pairesDeNaissance } from './naissance-api.js';
import { traiterMcp } from './mcp-tblock.js';
import { etatCautionCreateur, sortieCautionPour, cleMarcheCreateur } from './caution-createur.js';
import { creerRegistrePanel } from './panel-sessions.js';
/* les sondes du marche, de l echange et du cerveau : les MEMES modules que l app (rien de reecrit pour la sonde) */
import { vieDuBlock } from './marche.js';
/* 2026-10-17 : le Buy de Market, par ligne — cle deja connue ici + filtres du planificateur + devis reel (achat-marche.js) */
import { verdictAchatMarche, quoterV4 } from './achat-marche.js';
import { lireCauseRefusPool, phraseRefusPool, gardeTaxeAvantAchat } from './pool-lanceur-taxe.js'; /* game374: the resale tax is read BEFORE a Buy */
import { poolId as poolIdV4 } from './pool.js';
import { lireReferenceAction, estActionCoinbase } from './reference-action.js';
import { etatInitial as etatInitialCerveau, pas as pasCerveau } from './cerveau.js';
import { snapshotCerveau } from './export-cerveau.js';
import { tacheAutorisee } from './brain-tasks.js';
import { adressesANommer, chercherNom, creerIndexNoms } from './recherche-noms.js';
import { validerRequete, construireIndex, chercherB20 } from './recherche-b20.js';
import { prixEthUsd, CLES_PRIX as CLES_PRIX_ETH } from './prix-eth.js';
/* 2026-10-28 (Phil) : le pot UNIT exige 10 $ d UNIT detenus au DERNIER bloc du jour (solde d archive, plus bas de deux prix) */
import { evaluerJour as evaluerJourUnit } from './eligibilite-unit.js';
import { moteurUsage, STATE_VIEW as STATE_VIEW_USAGE } from './usage-onchain.js';
import { plancher7030, DESCRIPTEUR_7030 } from './hook-7030-descripteur.js';
import { V4_ADRESSES } from './lancer-pool.js';
/* 2026-10-04 : l etat des devises de paire de Create (born / not_born / not_read), lu une fois ici pour tous les visiteurs */
import { creerEtatPaires } from './etat-paires.js';
import { randomBytes } from 'node:crypto';
/* 2026-10-04 : le mode essai (fork local + wallet simule) — la regle qui decide, pure, la meme que celle de la page */
import { essaiServeur, urlLocale } from './mode-essai.js';
/* tip 20260923-map-trending: rotate public Base RPCs — mainnet.base.org alone 413/rate-limits eth_getLogs (Map soleils die). */
/* tip 20260923-map-trending: only mainnet.base.org still serves free eth_getLogs (≤1k blocs). Others 413/HTML/plan. */
/* ⛔⛔ DEUX ENDPOINTS OFFICIELS PAR DEFAUT, ET PAS PLUS. Mesure du 2026-09-29 :
 *     `mainnet.base.org` SEUL rendait « over rate limit » sur les lectures de pool, depuis cette
 *     machine ET depuis l IP de Railway — la porte d achat restait inerte, 14 verdicts inconnus
 *     sur 16. Sonde de dix endpoints publics : `mainnet.base.org` et
 *     `developer-access-mainnet.base.org` sont les DEUX SEULS a servir les trois choses dont ce
 *     serveur a besoin — `eth_call`, l ETAT ANCIEN, et `eth_getLogs`. La note ci-dessus (« only
 *     mainnet.base.org still serves free eth_getLogs ») etait donc vraie A UN ENDPOINT PRES.
 *   ⛔ POURQUOI LES AUTRES NE SONT PAS ICI : `base.drpc.org`, `1rpc.io/base` et
 *     `base-mainnet.public.blastapi.io` servent `eth_call` mais REFUSENT `eth_getLogs` (HTTP 400).
 *     Les mettre dans cette rotation globale ferait rater une fenetre de logs sur deux au scan du
 *     trending : un degat qu on echangerait contre un peu de quota sans s en apercevoir. Ils sont
 *     utilises a part, la ou seul `eth_call` compte — voir `RPC_FAITS_POOL`.
 *   ⛔ ET LES B20 : ma regle « seul un noeud Base lit un B20 » etait MAL FORMULEE. Verifie le
 *     2026-09-29 sur `totalSupply()` de TBLOCK et `balanceOf(a6cf)` : les quatre endpoints rendent
 *     la MEME valeur au wei, et `eth_getCode` d un B20 rend `0xef` partout. L echec venait
 *     d ANVIL (un EVM generique), pas des RPC tiers, qui font tourner le client Base. Mes deux
 *     temoins negatifs ont ECHOUE A ECHOUER, et c est ce qui a corrige la regle.
 *   ⛔ AUCUNE CLE : ces URL sont publiques, sans inscription. `BASE_RPC` reste prioritaire. */
/* ══ MODE ESSAI (2026-10-04) — `TB_RPC_TEST=http://127.0.0.1:8549` : TOUS les noeuds du serveur deviennent ce fork local ══
 * POURQUOI. Rejouer le test « wallet connecte » du panneau sans wallet : la page (mode-essai.js, wallet-simule.js) envoie ses
 *   transactions sur un fork ; le planificateur doit lire CE fork, sinon ses plans decrivent une autre chaine.
 * CE QUI EXISTAIT DEJA : `BASE_RPC` et `BASE_RPC_LECTURE` (mesure du jour, fork au bloc 52137185 : un plan USDC > NVDAc PRET en
 *   74 ms, ETH > IB022 juge en 4,7 s). Mais ces deux variables laissent DEUX listes sur les vrais noeuds : `RPC_ACTIVITE` (qui
 *   AJOUTE publicnode et drpc — une lecture sur deux partirait sur la vraie chaine) et `RPC_SIMULATION` (ecrite en dur).
 *   `TB_RPC_TEST` remplace les QUATRE, ou n en remplace aucune.
 * ⛔ ETEINT PAR DEFAUT ET REFUSE EN PRODUCTION (regle pure, `essaiServeur`) : la variable doit designer un noeud de CETTE
 *   machine, et elle est IGNOREE des qu une variable `RAILWAY_*` existe ou que NODE_ENV vaut production. Ignoree = journalisee,
 *   et le serveur garde ses noeuds habituels. Sans la variable, les quatre listes ci-dessous sont celles d avant, a l octet
 *   (test-mode-essai-20261004.mjs les compare a celles du commit 9ab857e, et tue le mutant qui inverse la condition).
 * ⚠️ CE QUE LE MODE ESSAI NE CHANGE PAS : les lectures hors chaine (DexScreener, OpenLaunch, CDP) restent celles d avant. */
const ESSAI_SRV = essaiServeur(process.env);
if (ESSAI_SRV.demande && !ESSAI_SRV.actif) console.error('[essai] TB_RPC_TEST IGNORE : ' + ESSAI_SRV.pourquoi);
if (ESSAI_SRV.actif) console.warn('[essai] MODE ESSAI : tous les noeuds de ce serveur = ' + ESSAI_SRV.rpc + ' — ce processus ne lit PAS Base mainnet');
const RPC_LIST = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : (process.env.BASE_RPC
  /* 2026-10-10 (mesure prod, Claude) : developer-access-mainnet.base.org 0 ok / 3 832 envois -> retire des listes par defaut */
  || 'https://mainnet.base.org')
  .split(',').map((s) => s.trim()).filter(Boolean);
/* ⛔ LA LISTE LARGE, RESERVEE AUX LECTURES QUI NE FONT QUE `eth_call` : quatre fois le quota pour
 *   les faits de pool, sans toucher aux chemins qui ont besoin de `eth_getLogs`. */
/* game361 (Grok's live test 2026-11-11: the TBLOCK buy after a TAM mint failed "You reached Public endpoint rate limit"). Measured on prod
 *   /sante.envois since 12:48 UTC: mainnet.base.org 3,342 ok / 2,631 rate-limited, base.drpc.org 925 ok / 1,114 limited, publicnode 553 ok / 0
 *   limited. Probed the same day: publicnode and tenderly answer eth_call WITH a state override (the patched Aerodrome quoter needs it). */
const RPC_FAITS_POOL = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : (process.env.BASE_RPC_LECTURE
  /* 2026-10-10 (mesure prod, Claude) : developer-access-mainnet.base.org 0 ok / 3 832 et 1rpc.io 0 ok / 558 -> retires */
  || 'https://mainnet.base.org,https://base.drpc.org,https://base-rpc.publicnode.com,https://gateway.tenderly.co/public/base')
  .split(',').map((s) => s.trim()).filter(Boolean);
let tourFaits = 0, idFaits = 0;
/* ══ 2026-10-10 — CE QUI PART VRAIMENT SUR LE RESEAU, PAR HOTE (/sante.envois) ═══════════════════════════════════════════════
 * Seul le noeud d archive etait compte (archiveCompte). Les requetes aux noeuds PUBLICS ne l etaient nulle part : on ne pouvait pas
 *   dire ce que coutait un refus certain (jusqu a 3 essais en rotation sur RPC_LIST, puis publicnode, puis l archive qui refuse sans
 *   appel). Chaque requete HTTP ENVOYEE est comptee UNE fois, par hote et par issue (classeEnvoi, repli-logs.js : ok / limite / erreur
 *   / reseau).
 * ✅ COMPTE — cinq des six boucles fetch JSON-RPC de ce fichier, et le seul lecteur JSON-RPC des modules :
 *   rpcServeurBrut (rotation sur RPC_LIST) · lecteurUrl de repli-logs.js (publicnode en repli de rpcServeur et de rpcScanCreations,
 *   l archive via lecteurArchive) · callLarge et rpcRails (rotation sur RPC_FAITS_POOL) · rpcActivite (RPC_ACTIVITE) · rpcNaissance
 *   (sa boucle eth_simulateV1 sur RPC_SIMULATION ; ses autres methodes passent par rpcRails, comptees la).
 * ⛔ PAS COMPTE : la sixieme boucle, la sonde de /sante (sonderNoeuds, son propre fetch) ; une fenetre profonde NON ENVOYEE budget
 *   epuise (aucune requete ne part : archiveCompte.nonEnvoyees la compte, voir lecteurLogs) ; un refus de budget de lecteurArchive
 *   (aucune requete ne part : refusBudget) ; les lectures qui ne sont pas du JSON-RPC (DexScreener, OpenLaunch, la liste de
 *   l emetteur, les API CDP autres que le noeud, et les appels HTTP de ce serveur a sa propre route /api/prix-usd). Aucun autre
 *   module serveur n envoie de JSON-RPC par son propre fetch (recherche du 2026-10-10 sur les .js du depot : seul lecteurUrl de
 *   repli-logs.js ; wallet-simule.js tourne dans la PAGE).
 * ⛔ LE LIBELLE EST L HOTE, JAMAIS LE CHEMIN (libelleNoeud) : l URL de l archive porte une cle d API dans son chemin.
 * ⛔ BORNE : ENVOIS_HOTES_MAX hotes, le reste sous « autres hotes » ; en memoire, depuis le demarrage (`depuis`) — pas sauve. */
const ENVOIS_HOTES_MAX = 40;
const ENVOIS_CLASSES = ['ok', 'limite', 'erreur', 'reseau'];
const envoisNoeuds = { depuis: new Date().toISOString(), parHote: {} };
/* game362 (Phil: "régler une bonne fois pour toutes le problème de RPC"): every answer counted here also feeds ONE health state per host
 *   (rpc-sante.js): a host that rate-limits or does not answer is tried last for 15 s .. 5 min, by every reader of this server. */
const SANTE_RPC = creerSante();
/* game366 (live audit: mainnet.base.org's traffic could not be attributed — compterEnvoi counts per host, not per method or reader): every
 *   call that ENTERS a reader is counted here as reader x method (calls, not sends; retries stay in envois). Published in /sante. */
/* game372 Step 0: `parQui` = the same calls per CALLER (the archive label of the request or background loop) x reader x method */
const appelsLecteurs = { depuis: new Date().toISOString(), par: {}, parQui: {} };
function compterAppel(lecteur, methode) {
  try { const k = lecteur + ' ' + String(methode || '?').slice(0, 40); appelsLecteurs.par[k] = (appelsLecteurs.par[k] || 0) + 1; } catch { /* never breaks a read */ }
  try { const q = etiquetteArchive() + ' | ' + lecteur + ' ' + String(methode || '?').slice(0, 40); appelsLecteurs.parQui[q] = (appelsLecteurs.parQui[q] || 0) + 1; } catch { /* never breaks a read */ }
}
/* the keyed node (RELAIS_CLE, CDP) as the LAST resort of the pool reads when every public host failed — its own daily budget, counted */
const SECOURS_MAX_JOUR = Number.isSafeInteger(Number(process.env.RPC_SECOURS_MAX_JOUR)) && Number(process.env.RPC_SECOURS_MAX_JOUR) >= 0 ? Number(process.env.RPC_SECOURS_MAX_JOUR) : 5000;
const secoursCompte = { jour: '', appels: 0, servis: 0, refusBudget: 0, echecs: 0 };
function compterEnvoi(url, classe) {
  try {
    let h = libelleNoeud(url);
    if (!envoisNoeuds.parHote[h] && Object.keys(envoisNoeuds.parHote).length >= ENVOIS_HOTES_MAX) h = 'autres hotes';
    const c = envoisNoeuds.parHote[h] || (envoisNoeuds.parHote[h] = { ok: 0, limite: 0, erreur: 0, reseau: 0 });
    c[ENVOIS_CLASSES.includes(classe) ? classe : 'erreur'] += 1;
    SANTE_RPC.noter(libelleNoeud(url), classe); /* game362 */
  } catch { /* un compteur ne casse jamais une lecture */ }
}
/** lecteurUrl (repli-logs.js) dont chaque requete envoyee est comptee par hote. Meme nom : le cablage existant ne change pas. */
function lecteurUrl(url, options = {}) {
  return lecteurUrlNu(url, { ...options, surEnvoi: (c) => compterEnvoi(url, c) });
}
/** `eth_call` sur la liste LARGE — pour les faits de pool, et rien d autre.
 * ⛔⛔ ELLE TOURNE A CHAQUE ESSAI, et c est le point. `rpcServeur` tourne aussi, mais sa liste ne
 *     contient que les endpoints capables de `eth_getLogs` : deux. Ici on en a quatre, donc un
 *     endpoint etrangle ne bloque plus la lecture — exactement ce qui manquait quand le
 *     prechauffage rendait « 0 lus, 16 inconnus ».
 * ⛔ ELLE REFUSE `0x` COMME REPONSE : un endpoint qui rend une chaine vide au lieu d une valeur
 *   ferait passer une non-reponse pour un zero, et la porte lirait un glissement de 0 bps sur une
 *   pool qu elle n a pas lue. */
async function callLarge(to, data) {
  compterAppel('pool-facts', 'eth_call'); /* game366 */
  let dernier = 'aucun essai';
  const ordreF = SANTE_RPC.ordonner(RPC_FAITS_POOL, tourFaits++, libelleNoeud); /* game362: available hosts first */
  for (let k = 0; k < RPC_FAITS_POOL.length * 2; k += 1) {
    const url = ordreF[k % ordreF.length];
    let compte = false; /* 2026-10-10 : chaque requete envoyee, comptee une fois par hote et par issue (compterEnvoi) */
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idFaits, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
      if (r.ok) {
        const j = await r.json().catch(() => null);
        compte = true; compterEnvoi(url, classeEnvoi(r.status, j));
        if (j && j.result !== undefined && j.result !== '0x') return j.result;
        dernier = j && j.error ? String(j.error.message || '').slice(0, 40) : 'reponse vide';
      } else { compte = true; compterEnvoi(url, classeEnvoi(r.status, null)); dernier = 'HTTP ' + r.status; }
    } catch (e) { if (!compte) compterEnvoi(url, 'reseau'); dernier = String((e && e.name) || e).slice(0, 24); }
    await new Promise((ok) => setTimeout(ok, 200 * (k + 1)));
  }
  throw new Error('refused by all ' + RPC_FAITS_POOL.length + ' endpoints (' + dernier + ')');
}
/** Les faits on-chain d une pool : son glissement a la taille de reference, et sa FAMILLE PROUVEE.
 *
 * ⛔⛔ TROIS ETATS, JAMAIS DEUX. Une pool illisible rend `glissementBps: null` et
 *     `famille: 'NON_MESURE'`. Le client refuse alors la puce : notre aveuglement ne doit pas
 *     ressembler a un bon marche. Rendre 0 bps par defaut aurait ouvert la porte sur une panne.
 * ⛔ LA FAMILLE SE PROUVE PAR ALLER-RETOUR : on lit `token0/token1/tickSpacing` SUR la pool, on
 *   demande `getPool(token0, token1, tickSpacing)` a la factory Aerodrome, et on exige qu elle
 *   rende CETTE pool. Le `dexId` de l agregateur n est pas une preuve — et l adresse nulle est
 *   exactement ce que la factory rend pour un triplet inconnu, donc l accepter serait accepter
 *   « cette pool n existe pas ».
 * ⛔ `fee` N EST PAS `tickSpacing` : c est `tickSpacing()` qui entre dans `getPool`, et les
 *   confondre designe une pool inexistante (mesure : la pool MUc a un fee de 10 000 et un
 *   tickSpacing de 200).
 */
const FACTORY_AERODROME_CL_SRV = '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef';
const USDC_SRV = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const NON_MESURE_POOL = Object.freeze({ glissementBps: null, famille: 'NON_MESURE' });

/* ══ LES POOLS UNISWAP V4 N ONT PAS D ADRESSE ═════════════════════════════════════════════════════
 * ⛔⛔⛔ LA CAUSE RACINE DE QUATRE SYMPTOMES, MESUREE LE 2026-10-01. `faitsDeLaPool` commencait par
 *   `if (!/^0x[0-9a-fA-F]{40}$/.test(pool))` et rendait `famille: 'NON_MESURE'` avec
 *   « no pool address from the aggregator ». Or une pool V4 N A PAS D ADRESSE : c est un `poolId`
 *   de 32 octets dans le PoolManager singleton. DexScreener met donc ce poolId de 64 hex dans
 *   `pairAddress` — mesure sur TRUMPFIFA :
 *       dexId=uniswap  labels=["v4"]  pairAddress=0x6807fb21…b057   (66 caracteres)
 *   ⇒ LA DONNEE ETAIT DEJA LA. On la jetait parce qu elle ne ressemblait pas a une adresse.
 *
 * ⛔⛔ L AMPLEUR, sur les 250 lignes de `/api/trending` :
 *       `aerodrome` AVEC adresse :  13 lignes (5,2 %)   volume 24 h 101 870 174 $
 *       `uniswap`  SANS adresse  : 237 lignes (94,8 %)  volume 24 h   3 393 356 $
 *   94,8 % des lignes etaient `NON_MESURE` : pas de glissement, donc `porteDAchat` rendait
 *   `NON_MESURE`, donc AUCUNE puce et aucun routage — pour rien, la pool etant lisible.
 *   Quatre symptomes, un seul defaut : `poolAdr: null` sur OUSD, la pool d OHUSD « introuvable »,
 *   TRUMPFIFA invisible, et les blocks cotes en OUSD sans chemin d achat.
 *
 * ⛔ LE FAIL-CLOSED RESTE INTACT, ET C EST VOULU : `NON_MESURE` ⇒ pas de puce. On n ouvre PAS la
 *   porte, on MESURE ce qu on savait deja lire. Le reste du fichier n est pas touche.
 *
 * ⛔ LES DEUX ACCESSEURS SONT VERIFIES SUR LA CHAINE, PAS RECITES. Mesure avec temoin negatif :
 *       TRUMPFIFA/ETH  sqrtPriceX96 146451473072240870738511709852470   liquidite 4327858818808…
 *       USDC/OUSD      sqrtPriceX96 79228127470005035843928324941       liquidite 15572591403846543
 *       poolId BIDON   sqrtPriceX96 0                                   liquidite 0
 *   Un poolId inexistant rend ZERO, pas une erreur : c est ce qui rend le zero INTERPRETABLE.
 *   (`getPoolLiquidity(bytes32)` REVERTE — donc `getLiquidity` est bien le nom.)
 */
const STATE_VIEW_SRV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
/* ⛔ LE POOLMANAGER N EST PAS REDECLARE ICI : ce fichier a deja `PM_V4` plus bas, et j ai VERIFIE
 *   qu il vaut bien l adresse que StateView rend par `poolManager()` (0x498581ff…). Deux constantes
 *   pour le meme fait divergeraient le jour ou l une bouge — c est `le jumeau diverge`. */
const EST_POOL_ID_V4 = /^0x[0-9a-fA-F]{64}$/;
/* ⛔ Selecteurs CALCULES par keccak au demarrage, jamais tapes a la main.
 * ⛔⛔ ET ILS PORTENT DEJA LEUR `0x` — PIEGE REEL DU DEPOT, PAYE A L INSTANT : il existe DEUX
 *   fonctions `selecteur`, de MEME NOM, qui ne rendent PAS le meme format :
 *       `keccak.js` -> "0xc815641c"   (avec le prefixe)
 *       `pool.js`   -> "c815641c"     (sans)
 *   J ai importe celle de `keccak.js` ET rajoute `'0x'` : le calldata valait `0x0xc815641c…`, les
 *   quatre endpoints ont repondu « Invalid params », et la branche entiere rendait NON_MESURE.
 *   ⇒ Un meme nom pour deux contrats differents est exactement `la presence d un nom n est pas son
 *     usage`. Les constantes ci-dessous sont donc des calldata COMPLETS, prefixe inclus. */
const SEL_GET_SLOT0 = selecteurSrv('getSlot0(bytes32)');
const SEL_GET_LIQUIDITE = selecteurSrv('getLiquidity(bytes32)');
/* ⛔⛔ CE QUI A CASSE LA PRODUCTION LE 2026-09-29, ET LA LECON. Premiere version : cinq
 *     `eth_call` en `Promise.all` par pool. La page demande ~14 prix d un coup ⇒ **70 appels
 *     simultanes** sur un RPC public ⇒ « over rate limit » ⇒ `glissementBps: null` ⇒ la porte
 *     refuse ⇒ LES PUCES SONT TOMBEES DE 13 A 2 EN PRODUCTION.
 *   ✅ CE QUI A SAUVE LA SITUATION : les trois etats. La porte a refuse au lieu de s ouvrir sur
 *     mon aveuglement, et l endpoint portait `pourquoiFaits: "over rate limit"` — donc la cause
 *     etait LISIBLE au premier appel, sans deviner. Une garde qui echoue FERME et qui DIT
 *     pourquoi transforme une panne en diagnostic.
 *   ⛔ TROIS CORRECTIONS, ET AUCUNE NE CONSISTE A OUVRIR LA PORTE :
 *       1. les lectures sont SEQUENTIELLES, plus jamais en rafale ;
 *       2. `token0/token1/tickSpacing/famille` ne changent JAMAIS pour une pool donnee : on les
 *          garde pour de bon, ce qui ramene les appels repetes de cinq a deux ;
 *       3. un verrou a un seul fil : deux requetes concurrentes sur la meme pool ne la lisent
 *          qu une fois. */
/* ── ⛔⛔ UN VERDICT DATE SURVIT A UNE SECHERESSE DE RPC ──────────────────────────────────────────
 *     MESURE LE 2026-09-29 : le RPC public a etrangle cette machine toute la journee. Faits lus en
 *     rafale : refuses. Un a la fois, espaces de 1,5 s : refuses AUSSI. Le filtre restait donc
 *     INERTE en production — 16 verdicts `NON_MESURE` sur 17 — et BEc gardait sa puce avec 385 bps.
 *   ⛔ INSISTER N EST PAS LA REPONSE : la reponse est de PERSISTER ce qu on a reussi a lire, pour
 *     qu UNE SEULE bonne fenetre suffise. Une pool a 2,4 M$ ne passe pas de 0 a 418 bps en une
 *     heure ; un verdict d hier vaut infiniment mieux qu aucun verdict.
 *   ⛔⛔ ET IL PORTE SON AGE. Un verdict dont on ignore l age serait une photo prise pour du
 *     direct — la faute exacte qui avait grave une liste de puces « photo d un jour ». Le client
 *     recoit `ageFaitsMs` et peut en tirer ses conclusions. */
const FICHIER_FAITS_POOL = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'faits-pool.json') : null;
/* Droits Shopify (2026-11-04) : sur le volume s il existe, sinon en memoire ; ouvert a la premiere demande, un fichier
 * illisible fait rendre 503 (Shopify relivre) au lieu d etre ecrase. */
const FICHIER_DROITS_SHOPIFY = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'droits-shopify.json') : null;
let magasinShopifyOuvert = null;
/* 2026-11-05 : le DERNIER webhook recu, servi par /api/shopify/etat — heure, sujet, domaine annonce, statut rendu et raison d un refus
 *   (texte de CE serveur). Aucune donnee de commande ni de client. Sans lui, un refus de signature ou de domaine etait invisible. */
let dernierWebhookSh = null;
function magasinShopify() { if (!magasinShopifyOuvert) magasinShopifyOuvert = creerMagasin({ fichier: FICHIER_DROITS_SHOPIFY }); return magasinShopifyOuvert; }
const faitsPersistes = new Map();  /* jeton -> { glissementBps, famille, pool, tickSpacing, t } */
(function chargerFaitsPersistes() {
  /* ⛔⛔ LE JOURNAL DIT SI LA PERSISTANCE EXISTE. Sans volume monte, `FICHIER_FAITS_POOL` vaut
   *     `null` et tout ce mecanisme est un NO-OP — exactement le genre de correctif inerte qu on
   *     croit avoir livre. Un silence ici l aurait rendu indetectable. */
  if (!FICHIER_FAITS_POOL) {
    console.log('faits de pool : AUCUNE PERSISTANCE (pas de volume monte) — la porte redeviendra '
      + 'inerte a chaque redemarrage et a chaque secheresse de RPC');
    return;
  }
  if (!existsSync(FICHIER_FAITS_POOL)) { console.log('faits de pool : volume present, fichier encore vide'); return; }
  try {
    const j = JSON.parse(readFileSync(FICHIER_FAITS_POOL, 'utf8'));
    for (const [k, v] of Object.entries(j || {})) {
      if (v && typeof v.glissementBps === 'number') faitsPersistes.set(String(k).toLowerCase(), v);
    }
    console.log('faits de pool relus du disque : ' + faitsPersistes.size);
  } catch (_) { /* fichier illisible : on repart a vide, jamais sur des valeurs a moitie lues */ }
})();
function ecrireFaitsPersistes() {
  if (!FICHIER_FAITS_POOL) return;
  try {
    const payload = JSON.stringify(Object.fromEntries(faitsPersistes));
    writeFileSync(FICHIER_FAITS_POOL + '.tmp', payload);
    renameSync(FICHIER_FAITS_POOL + '.tmp', FICHIER_FAITS_POOL);
  } catch (_) { /* disque plein ou volume absent : on garde la memoire vive, on ne casse pas la page */ }
}

const poolImmuables = new Map();   /* pool -> { t0, t1, ts, famille } — jamais expire */
let filePoolFaits = Promise.resolve();
function enFile(tache) {
  const suite = filePoolFaits.then(tache, tache);
  /* ⛔ la file ne doit pas se rompre sur un echec : on la rebranche sur une promesse resolue. */
  filePoolFaits = suite.then(() => undefined, () => undefined);
  return suite;
}
const motDePool = (h, i) => String(h || '').replace(/^0x/, '').slice(i * 64, (i + 1) * 64);
const adrDePool = (h) => '0x' + motDePool(h, 0).slice(24);

/**
 * LES FAITS D UNE POOL UNISWAP V4, LUS PAR SON `poolId` SUR StateView.
 *
 * ⛔ UN POOLID EST UN HASH : on ne peut PAS en retrouver `currency0`. On ne le devine donc pas —
 *   l ordre des devises est de l ARITHMETIQUE sur les deux adresses que l agregateur nomme
 *   (`baseToken`/`quoteToken`), puisque V4 exige `currency0 < currency1`.
 * ⛔⛔ ET LE GLISSEMENT NE SE CALCULE QUE DANS LES BONNES UNITES. `TAILLE_REFERENCE_USDC` est une
 *   taille en USDC ; l appliquer a une pool jeton/ETH melangerait les unites et rendrait un
 *   glissement qui a l air d un chiffre. Sans USDC d un cote, on rend `null` AVEC UNE RAISON
 *   NOMMEE — jamais un nombre invente, jamais un zero.
 * ⛔ LA FAMILLE, ELLE, EST PROUVEE : si `getSlot0(poolId)` rend un prix NON NUL, ce poolId existe
 *   et est initialise dans le PoolManager. Un poolId inexistant rend ZERO (temoin negatif mesure),
 *   et c est ce qui rend le zero interpretable.
 */
/* ⛔⛔ UN `poolId` EST UN HASH : LA CLE NE S EN DEDUIT PAS. Et sans la cle (fee, tickSpacing,
 *   hooks), aucun calldata de swap n est constructible — `planEchangeMultiSauts` exige des sauts
 *   RESOLUS. On va donc la chercher dans l evenement `Initialize` du PoolManager, filtre PAR le
 *   poolId : UN seul topic en plus, donc des fenetres tres legeres.
 * ⛔ `decoderInitialize` REFUSE une cle dont le poolId ne se RECALCULE pas — on ne garde que ce
 *   qu on peut reconstruire. C est ce qui empeche une cle plausible et fausse de passer.
 * ⛔ CACHE POUR TOUJOURS : une cle de pool ne change JAMAIS. Mais on ne cache que les SUCCES —
 *   graver un echec de lecture figerait une cecite pour toute la vie du process. */
const clesV4Lues = new Map();
/* ⛔ 2026-10-02 — PRE-REMPLI par des logs `Initialize` MESURES (cles-v4-mesurees.js), chacun repasse par
 *   `decoderInitialize` : une cle n entre que si son poolId se recalcule. OUSD/USDC est nee hors de la fenetre
 *   de 120 000 blocs remontee ci-dessous — sans ce pre-remplissage, sa route restait cotable et pas construisible. */
for (const l of LOGS_INITIALIZE_MESURES) {
  const p = decoderInitialize(l);
  if (p && !p.erreur && p.cle && p.poolId) clesV4Lues.set(p.poolId, p.cle);
}
/* ⛔⛔ 2026-10-09 — TROIS ETATS, PAS DEUX. La cle (LUE) ; `null` = rien a construire sur une lecture qui a ABOUTI (evenement
 *   absent des 59 fenetres TOUTES lues, ou evenement trouve et refuse par decoderInitialize — ce cas-la inchange) ;
 *   `{ etat: 'NON_LUE', ratees, fenetres, pourquoi }` = au moins une fenetre NON LUE (erreur, ou autre chose qu un tableau) ou la
 *   tete illisible, et pas de cle.
 *   Avant : une fenetre refusee faisait `continue` comme une fenetre vide, les deux finissaient en `return null`, et faitsPoolV4
 *   publiait « the Initialize event for this poolId was not found in the window read » sur des fenetres jamais lues. Au-dela de
 *   ~9 000 blocs, aucun noeud gratuit ne sert ces fenetres (base.org 429, publicnode 403 : mesures du 2026-10-09, repli-logs.js),
 *   seule l archive le peut : budget du jour epuise, ces fenetres sont refusees (55 des 59, compte sur PAS et la borne de 120 000
 *   blocs, pas mesure).
 *   ⛔ Le refus est COMPTE (`ratees`), pas reconnu a son message. ⚠️ CORRIGE le 2026-10-10 : j ecrivais ici qu avecRepliLogs relance
 *     l erreur du principal « jamais celle du budget » — FAUX depuis le 2026-10-09 : quand le dernier repli (l archive) refuse par
 *     budget, repli-logs.js met ce refus EN TETE du message, meme apres un refus passager du principal. Seule la fenetre NON
 *     ENVOYEE de lecteurLogs (NON_ENVOYEE_BUDGET) est un refus certain ; elle seule fait dire « wait for the daily budget » ici.
 *     ⛔ Un NON_LUE n entre JAMAIS dans clesV4Lues : il se relit au prochain appel. */
/* ⛔⛔ 2026-10-10 (prod, compteur d archive par consommateur) — `route /api/prix-usd` = 2e consommateur (~10 appels/min la nuit).
 *   Une absence LUE (59 fenetres toutes lues, aucun Initialize) n etait JAMAIS retenue, et la reponse de /api/prix-usd ne vit que
 *   300 s : chaque jeton sans pool v4 recente repayait ~55 appels d archive toutes les 5 minutes. Meme remede que resoudreClePool
 *   (/api/cle, 93dad10 + b7cd95d, revue adversariale) : la plage LUE est retenue, la suite ne lit que les blocs nouveaux ; une memoire
 *   qui ne touche plus la fenetre est oubliee ; tout est plafonne a la tete ; un NON_LUE n est JAMAIS retenu ; persistee. */
const CLES_V4_ABSENTES_MAX = 5000;
const clesV4Absentes = new Map(); /* poolId -> { depuis, jusqua } : plage LUE sans Initialize */
let apresAbsencesV4 = () => {}; /* branche sur la persistance plus bas (le banc garde la doublure muette) */
async function cleV4DuPoolId(id) {
  const k = String(id).toLowerCase();
  if (clesV4Lues.has(k)) return clesV4Lues.get(k);
  /* ⛔ 2026-10-11 (diagnostic Grok : /api/prix-usd = 880 appels d archive le 10/10, tous ici) : une cle deja RESOLUE par /api/cle
   *   (clesPool, par jeton) n etait pas consultee - on rebalayait 59 fenetres pour la retrouver. Prise SEULEMENT si son poolId se
   *   recalcule (cle-v4-connue.js).
   *   ⛔ MESURE 2026-10-11 00:10 UTC (budget frais) : le seul consommateur etait RBLXc — poolId 0x4fb97de01a3c… absent des logs
   *   mesures, 33/59 fenetres non lues -> NON_LUE, jamais retenue, rebalayee a chaque prechauffage (4 min) ; /api/cle la connaissait.
   *   Les DEUX caches de /api/cle : clesCache (volume, cles-pool.json, relu au demarrage) puis clesPool. */
  const connue = cleV4Connue(k, [...clesCache.values(), ...clesPool.values()].flatMap((r) => (r && Array.isArray(r.cles) ? r.cles : [])));
  if (connue) { clesV4Lues.set(k, connue); if (clesV4Absentes.delete(k)) apresAbsencesV4(); return connue; }
  const nonLue = (ratees, fenetres, pourquoi) => ({ etat: 'NON_LUE', ratees, fenetres, pourquoi });
  let tete;
  try { tete = parseInt(await rpcServeur('eth_blockNumber', []), 16); } catch (_) { return nonLue(0, 0, 'chain head not read'); }
  if (!Number.isSafeInteger(tete) || tete <= 0) return nonLue(0, 0, 'chain head not read');
  const PAS = 2000;
  let ratees = 0, fenetres = 0;
  /* ⛔ ON REMONTE DANS LE TEMPS, et on BORNE : 120 000 blocs couvrent largement la vie des pools
   *   qui nous interessent. Au-dela ce n est plus une lecture, c est un balayage.
   *   La grille est celle d avant, a l identique : 59 fenetres [tete - j*PAS, tete - (j-1)*PAS - 1], j = 1..59. */
  const BAS = tete - 59 * PAS, HAUT = tete - 1;
  /* 2026-10-10 : budget d archive epuise, une fenetre PROFONDE n est PAS envoyee (lecteurLogs) — non lue, jamais une absence ; le
   *   reste part a rpcServeur comme avant */
  const lire = lecteurLogs(tete);
  const lu = clesV4Absentes.get(k) || null;
  /* ⛔ revue adversariale (2026-10-10) : la memoire doit TOUCHER la plage demandee DES DEUX COTES. Une tete qui recule sous le bas de
   *   la memoire faisait fusionner [HAUT+1, depuis-1] — des blocs jamais lus — puis rendre null pour une pool qui y vivait. */
  const deja = lu && Number.isSafeInteger(lu.depuis) && Number.isSafeInteger(lu.jusqua) && lu.jusqua + 1 >= BAS && lu.depuis <= HAUT + 1 ? lu : null;
  const plages = deja ? [[deja.jusqua + 1, HAUT], [BAS, Math.min(deja.depuis - 1, HAUT)]].filter(([d, f]) => f >= d) : [[BAS, HAUT]];
  for (const [deb, fin] of plages) {
    for (let f = fin; f >= deb; f -= PAS) {
      const d = Math.max(deb, f - PAS + 1);
      fenetres += 1;
      let logs;
      try {
        logs = await lire.rpc('eth_getLogs', [{ address: PM_V4,
          topics: [TOPIC_INITIALIZE, k],
          fromBlock: '0x' + Math.max(0, d).toString(16),
          toBlock: '0x' + f.toString(16) }]);
      } catch (_) { ratees += 1; continue; /* ⛔ une fenetre refusee n est pas une fenetre vide : COMPTEE, et on continue */ }
      /* ⛔ SEUL UN TABLEAU EST UNE REPONSE (repli-logs.js) : autre chose est un refus, pas une fenetre vide. */
      if (!Array.isArray(logs)) { ratees += 1; continue; }
      if (!logs.length) continue;
      const p = decoderInitialize(logs[0]);
      /* ⛔ `p.erreur` veut dire « je ne sais pas reconstruire cette cle » : on ne la garde PAS. */
      if (p && !p.erreur && p.cle) { clesV4Lues.set(k, p.cle); if (clesV4Absentes.delete(k)) apresAbsencesV4(); return p.cle; }
      return null;
    }
  }
  if (ratees) {
    /* seules les fenetres NON ENVOYEES (budget epuise) attendent le budget ; une fenetre envoyee et ratee n est pas comptee ici */
    const attente = lire.suivi.nonEnvoyees;
    return nonLue(ratees, fenetres, ratees + '/' + fenetres + ' windows of ' + PAS + ' blocks not read'
      + (attente ? ' (' + attente + ' of them wait for the archive node daily budget, exhausted until 00:00 UTC — deep windows are not sent meanwhile)' : ''));
  }
  /* tout LU, rien trouve : l absence est retenue avec sa plage LUE ; une ecriture concurrente qui la touche est unie, jamais plus */
  let couvert = { depuis: deja ? Math.min(deja.depuis, BAS) : BAS, jusqua: deja ? Math.max(deja.jusqua, HAUT) : HAUT };
  const cur = clesV4Absentes.get(k);
  if (cur && cur !== lu && cur.depuis <= couvert.jusqua + 1 && couvert.depuis <= cur.jusqua + 1) {
    couvert = { depuis: Math.min(cur.depuis, couvert.depuis), jusqua: Math.max(cur.jusqua, couvert.jusqua) };
  }
  clesV4Absentes.delete(k);
  clesV4Absentes.set(k, couvert);
  if (clesV4Absentes.size > CLES_V4_ABSENTES_MAX) clesV4Absentes.delete(clesV4Absentes.keys().next().value);
  apresAbsencesV4();
  return null;
}
/* persistance des absences v4 : meme mecanisme que cles-absentes.json (voir resoudreClePool) */
const FICHIER_CLES_V4_ABSENTES = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'cles-v4-absentes.json') : null;
let ecritureAbsentesV4Prevue = null;
apresAbsencesV4 = () => {
  if (!FICHIER_CLES_V4_ABSENTES || ecritureAbsentesV4Prevue) return;
  ecritureAbsentesV4Prevue = setTimeout(() => {
    ecritureAbsentesV4Prevue = null;
    try {
      const payload = JSON.stringify([...clesV4Absentes]);
      if (payload.length > 2 * 1024 * 1024) return; /* plutot rien qu un volume plein */
      writeFileSync(FICHIER_CLES_V4_ABSENTES + '.tmp', payload);
      renameSync(FICHIER_CLES_V4_ABSENTES + '.tmp', FICHIER_CLES_V4_ABSENTES);
    } catch { /* une ecriture ratee ne casse pas une lecture : la memoire suffit */ }
  }, 5000);
  ecritureAbsentesV4Prevue.unref?.();
};
(function relireClesV4Absentes() {
  if (!FICHIER_CLES_V4_ABSENTES || !existsSync(FICHIER_CLES_V4_ABSENTES)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_CLES_V4_ABSENTES, 'utf8'));
    if (!Array.isArray(brut)) return;
    for (const e of brut.slice(-CLES_V4_ABSENTES_MAX)) {
      const [j, v] = Array.isArray(e) ? e : [];
      if (/^0x[0-9a-f]{64}$/.test(String(j)) && v && Number.isSafeInteger(v.depuis) && Number.isSafeInteger(v.jusqua) && v.jusqua >= v.depuis && v.depuis > 0) {
        clesV4Absentes.set(String(j), { depuis: v.depuis, jusqua: v.jusqua });
      }
    }
    console.log('[cles-v4] ' + clesV4Absentes.size + ' absence(s) d Initialize relue(s) du volume');
  } catch (err) { console.warn('[cles-v4] absences illisibles, on repart a vide : ' + err.message); }
})();

async function faitsPoolV4(poolId, infos) {
  const id = String(poolId).toLowerCase();
  return enFile(async () => {
    const RESPIRATION_MS = 400;
    const un = async (data) => {
      const r = await callLarge(STATE_VIEW_SRV, data);
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      return r;
    };
    let s0, lq;
    try {
      /* ⛔ PAS DE `'0x' +` ICI : le selecteur de `keccak.js` le porte deja (voir le commentaire de
       *   SEL_GET_SLOT0). L ajouter donnait `0x0x…` et « Invalid params » sur les quatre endpoints. */
      s0 = await un(SEL_GET_SLOT0 + id.slice(2));
      lq = await un(SEL_GET_LIQUIDITE + id.slice(2));
    } catch (e) {
      /* ⛔ UN REFUS DU RPC N EST PAS « CETTE POOL N EXISTE PAS ». Deux causes, deux verdicts. */
      return { ...NON_MESURE_POOL,
        pourquoiFaits: 'v4 pool reads failed: ' + String((e && e.message) || e).slice(0, 60) };
    }
    let sqrt = 0n, liquidite = 0n;
    try { sqrt = BigInt('0x' + String(s0).replace(/^0x/, '').slice(0, 64)); } catch (_) { sqrt = 0n; }
    try { liquidite = BigInt(lq); } catch (_) { liquidite = 0n; }
    if (sqrt === 0n) {
      /* ⛔ CECI EST UN FAIT, PAS UNE PANNE : le PoolManager ne connait pas ce poolId. */
      return { glissementBps: null, famille: 'autre', poolId: id,
        pourquoiFaits: 'this poolId is not initialized in the v4 PoolManager' };
    }
    /* ⭐ LA FAMILLE EST PROUVEE PAR LA CHAINE : le poolId repond avec un prix. */
    const base = String((infos && infos.base) || '').toLowerCase();
    const quote = String((infos && infos.quote) || '').toLowerCase();
    const aUsdc = base === USDC_SRV || quote === USDC_SRV;
    if (!aUsdc) {
      return { glissementBps: null, famille: 'uniswap-v4', poolId: id, liquiditeV4: String(liquidite),
        pourquoiFaits: 'v4 pool read, but neither side is USDC so the USDC-sized reference '
          + 'would mix units — slippage left unmeasured on purpose' };
    }
    const autre = base === USDC_SRV ? quote : base;
    if (!/^0x[0-9a-f]{40}$/.test(autre)) {
      return { glissementBps: null, famille: 'uniswap-v4', poolId: id, liquiditeV4: String(liquidite),
        pourquoiFaits: 'the other side of the pair was not readable from the aggregator' };
    }
    /* ⛔ `currency0` EST LA PLUS PETITE ADRESSE — c est la regle de V4, donc une COMPARAISON, pas
     *   une supposition. L inverser echangerait le sens et rendrait un glissement a l envers. */
    const entreeEst0 = USDC_SRV < autre;
    const gl = glissementBps({ sqrtPriceX96: sqrt, liquidite,
      entree: TAILLE_REFERENCE_USDC, entreeEst0 });
    if (gl.etat !== 'OK') {
      return { glissementBps: null, famille: 'uniswap-v4', poolId: id, liquiditeV4: String(liquidite),
        pourquoiFaits: gl.pourquoi };
    }
    /* ⛔⛔ LA CLE EST RENDUE QUAND ON A SU LA LIRE, parce que c est elle — et pas le `poolId` — qui
     *   permet de CONSTRUIRE un swap. Sans elle, l ecran saurait qu une route existe et ne saurait
     *   pas la fabriquer : un bouton qui promet ce qu il ne peut pas tenir.
     * ⛔ ET SON ABSENCE EST UN FAIT NOMME, pas un silence : `cleV4: null` + `pourquoiCle`.
     * ⛔⛔ 2026-10-09 : ET « NON LUE » N EST PAS « ABSENTE » (voir cleV4DuPoolId). Une cle non lue rend `cleV4: null` (rien a
     *   construire) + `cleNonLue: true` + une raison qui le DIT, jamais « not found ». Une exception non plus n est pas une absence.
     *   Le glissement, lui, a ete LU : il reste publie — fermer la porte sur la cle ratee effacerait un fait mesure. */
    let cleV4 = null;
    try { cleV4 = await cleV4DuPoolId(id); } catch (_) { cleV4 = { etat: 'NON_LUE', pourquoi: 'the key lookup failed' }; }
    const cleNonLue = Boolean(cleV4 && cleV4.etat === 'NON_LUE');
    return { glissementBps: Number(gl.bps), famille: 'uniswap-v4', poolId: id,
      liquiditeV4: String(liquidite),
      ...(cleNonLue ? { cleV4: null, cleNonLue: true,
        pourquoiCle: 'the pool key was NOT READ (' + String(cleV4.pourquoi || 'unknown') + ') — this is not "no key": '
          + 'the route can be priced, not built yet; the key is read again on a later request' }
        : cleV4 ? { cleV4 } : { cleV4: null,
        pourquoiCle: 'the Initialize event for this poolId was not found in the window read — '
          + 'the route can be priced but not built' }) };
  });
}

async function faitsDeLaPool(pool, infos = null) {
  /* ⛔⛔ LE POOLID V4 PASSE AVANT LA GARDE D ADRESSE, et c est tout le correctif : 64 hex au lieu
   *   de 40, donc l ancienne garde le rejetait comme « pas d adresse » alors qu il porte TOUT ce
   *   qu il faut pour lire la pool. */
  if (EST_POOL_ID_V4.test(String(pool || ''))) return faitsPoolV4(pool, infos);
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(pool || ''))) {
    return { ...NON_MESURE_POOL, pourquoiFaits: 'no pool address and no v4 poolId from the aggregator' };
  }
  return enFile(async () => {
    const cle = String(pool).toLowerCase();
    /* ⛔⛔ L ESPACEMENT EST ENTRE LES APPELS, PAS SEULEMENT ENTRE LES DEVISES. Premiere version :
     *     1,5 s entre devises, mais les cinq `eth_call` d une meme pool partaient COLLES — donc
     *     encore des micro-rafales. Resultat mesure du premier cycle en production :
     *     « prechauffage des faits de pool : 0 lus, 16 inconnus, sur 16 devises ». Zero.
     *   ⛔ 400 ms entre chaque lecture : cinq appels prennent 2 s, seize pools une trentaine de
     *     secondes. Personne n attend ce chemin — il alimente un cache, il a tout son temps. Une
     *     lecture lente qui ABOUTIT vaut infiniment mieux qu une rafale qui echoue. */
    const RESPIRATION_MS = 400;
    /* ⛔ LISTE LARGE ICI, PAS `rpcServeur` : ces lectures ne font que `eth_call`, donc elles
     *   peuvent profiter des quatre endpoints au lieu des deux capables de `eth_getLogs`. */
    const un = async (sig4) => {
      const r = await callLarge(pool, sig4);
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      return r;
    };
    let fixe = poolImmuables.get(cle);
    if (!fixe) {
      let t0, t1, ts;
      try {
        t0 = await un('0x0dfe1681') /* token0() */;
        t1 = await un('0xd21220a7') /* token1() */;
        ts = await un('0xd0c93a7c') /* tickSpacing() */;
      } catch (e) { return { ...NON_MESURE_POOL, pourquoiFaits: 'pool reads failed: ' + String((e && e.message) || e).slice(0, 60) }; }
      let famille = 'autre';
      try {
        /* ⛔ `fee` N EST PAS `tickSpacing` : c est `tickSpacing()` qui entre dans `getPool`, et les
         *   confondre designe une pool inexistante (mesure : la pool MUc a fee 10 000, ts 200). */
        const appel = '0x28af8d0b' /* getPool(address,address,int24) */
          + motDePool(t0, 0) + motDePool(t1, 0) + BigInt(ts).toString(16).padStart(64, '0');
        const rendu = await callLarge(FACTORY_AERODROME_CL_SRV, appel);
        await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
        /* ⛔ L ADRESSE NULLE EST LA REPONSE DE LA FACTORY POUR UN TRIPLET INCONNU : c est un FAIT
         *   (« cette pool n est pas la mienne »), donc `autre`, et non une panne. */
        famille = adrDePool(rendu).toLowerCase() === cle ? 'aerodrome' : 'autre';
      } catch (_) {
        /* ⛔⛔ UN REFUS DU RPC N EST PAS « PAS AERODROME ». Mettre `autre` ici marquerait une pool
         *     Aerodrome comme ne portant pas notre frais pendant une simple panne de lecture, et
         *     `porteNotreFrais` cesserait de compter un revenu REEL. Deux causes, deux verdicts. */
        famille = 'NON_MESURE';
      }
      fixe = { t0, t1, ts: Number(BigInt(ts)), famille };
      /* ⛔ ON NE GRAVE PAS UNE FAMILLE NON MESUREE DANS LE CACHE « JAMAIS EXPIRE » : elle y
       *   resterait pour toute la vie du process. Seul un verdict LU merite d etre immuable. */
      if (famille !== 'NON_MESURE') poolImmuables.set(cle, fixe);
    }
    /* seuls le prix et la liquidite bougent : deux appels, jamais plus */
    let s0, lq;
    try { s0 = await un('0x3850c7bd') /* slot0() */; lq = await un('0x1a686502') /* liquidity() */; }
    catch (e) { return { glissementBps: null, famille: fixe.famille, pourquoiFaits: 'live pool reads failed: ' + String((e && e.message) || e).slice(0, 60) }; }
    const gl = glissementBps({ sqrtPriceX96: BigInt('0x' + motDePool(s0, 0)), liquidite: BigInt(lq),
      entree: TAILLE_REFERENCE_USDC, entreeEst0: adrDePool(fixe.t0).toLowerCase() === USDC_SRV });
    if (gl.etat !== 'OK') return { glissementBps: null, famille: fixe.famille, pourquoiFaits: gl.pourquoi };
    return { glissementBps: Number(gl.bps), famille: fixe.famille, pool: cle, tickSpacing: fixe.ts };
  });
}

/* ══ L ALTERNATIVE AERODROME ══════════════════════════════════════════════════════════════════════
 * ⛔⛔ POURQUOI ELLE EXISTE, EN CHIFFRES. Nos 0,1 % vivent dans `sweepTokenWithFee`, une fonction du
 *     routeur Aerodrome CL. L Universal Router d Uniswap ne l a PAS (extraction PUSH4 : 11
 *     selecteurs, `execute` present, `0xe0e189a0` ABSENT). Or la pool qu on sert vient de
 *     l agregateur, qui designe la PLUS LIQUIDE — parfois Uniswap, et alors le frais est impossible.
 *     Le 2026-09-29, les 138 transactions de Phil sont toutes parties vers l Universal Router :
 *     aucune ne pouvait nous payer. Decision de Phil du 2026-09-30 : chercher l alternative.
 *   ⛔ ON NE LA CHERCHE QUE SI ELLE MANQUE : `famille === 'aerodrome'` ⇒ rien a faire. Mesure du
 *     2026-09-29 : 13 des 14 actions sont DEJA sur Aerodrome, seule MUc ne l est pas. Ce balayage
 *     ne tournera donc presque jamais — et c est ce qui le rend acceptable sur un noeud public.
 *   ⛔⛔ TROUVER LA POOL NE DECIDE RIEN. C est `choix-de-pool.js`, cote client, qui tranche — et il
 *     ne devie que si le SURCOUT pour le visiteur reste sous le frais qu on prend. Ici on MESURE,
 *     on ne choisit pas : rendre un glissement n est pas recommander une route.
 * ⛔⛔⛔ CETTE LISTE A ETE LE BUG, ET IL A COUTE DES JOURS. Elle valait
 *      `[1, 10, 50, 100, 200, 2000]` — SIX espacements ecrits a la main. La factory Aerodrome CL en
 *      declare NEUF : `tickSpacings()` rend `1, 50, 100, 200, 2000, 500, 10, 80, 150`. Manquaient
 *      **80, 150 et 500**. Mesure du 2026-09-30 sur les 13 blocks cotes en action ayant une pool CL :
 *        · trouvables avec les six : 4
 *        · INVISIBLES              : 9, dont TE/MUc a tickSpacing **80** et 107 505 $ de volume 24 h
 *      La moitie du volume de cette categorie etait introuvable, et l ecran en concluait « pas de
 *      pool » — un refus qui ressemblait a un fait de la chaine alors qu il etait un fait sur NOTRE
 *      liste. Une liste blanche sans garde de derive DERIVE : elle n avait aucun tort le jour ou
 *      elle a ete ecrite, la factory a simplement active de nouveaux espacements depuis.
 *    ⇒ La liste n est plus ecrite ici : `espacements-cl.js` la DEMANDE a la factory, et sa retombee
 *      porte les neuf. `test-espacements-cl.mjs` compare le code NU de ce fichier a la reponse
 *      reelle de la factory — il est parti ROUGE sur l espacement 80 avant cette correction.
 * ⚠️ BORNE : on ne sonde que les espacements rendus. Une pool a un espacement que la factory n a
 *    pas active serait invisible — mais elle ne pourrait pas exister non plus. */
const ESPACEMENTS_ALTERNATIVE = Object.freeze([...ESPACEMENTS_RETOMBEE]);
/* ⛔ LA LECTURE VIVANTE, FAITE UNE FOIS. On garde le resultat ET son etat : si la factory est muette
 *   on sonde la retombee, mais on n ecrit jamais qu on l a lue. */
let espacementsLus = null;
async function espacementsASonder() {
  if (espacementsLus === null) {
    espacementsLus = await lireEspacements(
      async (to, data) => { try { return await callLarge(to, data); } catch (_) { return null; } },
      FACTORY_AERODROME_CL_SRV);
    const phrase = phraseEspacements(espacementsLus);
    console.log('[espacements] ' + (phrase || 'factory : ' + espacementsLus.espacements.join(', ')));
  }
  /* ⛔⛔ ON PREND L UNION, PAS LA LECTURE SEULE. Une factory mal lue qui rendrait moins que la
   *     retombee nous ramenerait au bug d origine EN SILENCE. Sonder un espacement desactive ne
   *     coute qu une lecture sterile ; en manquer un coute la moitie du volume. */
  return [...new Set([...espacementsLus.espacements, ...ESPACEMENTS_ALTERNATIVE])].sort((a, b) => a - b);
}
const alternativeImmuable = new Map();   /* jeton -> { pool, ts } | { absente: true } — jamais expire */

/* ⛔⛔ LA LISTE DE L EMETTEUR, RELUE TOUTES LES 24 H. Elle bouge — quatre actions y sont apparues en
 *     une semaine — donc la figer une fois pour la vie du process la rendrait fausse en silence.
 *   ⛔ ET UN ECHEC NE SE GRAVE PAS : sur `RETOMBEE` on garde l horodatage COURT (5 min) pour
 *     reessayer bientot, au lieu de rester 24 h avec une marque partielle. Un zero qui ne peut
 *     plus remonter est un motif deja paye cher dans ce depot. */
let emCache = { r: null, a: 0 };
async function actionsEmetteurServies() {
  const frais = emCache.r && (Date.now() - emCache.a) < (emCache.r.etat === 'OK' ? 86_400_000 : 300_000);
  if (frais) return emCache.r;
  const r = await lireActionsEmetteur(async (url) => {
    /* 2026-10-25 (revue) : 3 pages en sequence — chacune bornee, une API qui pend ne gele pas le tour du trending */
    const rep = await fetch(url, { headers: { 'x-ms-monitor': '1' }, signal: AbortSignal.timeout(10000) });
    if (!rep.ok) return null;
    return await rep.json();
  });
  emCache = { r, a: Date.now() };
  const phrase = phraseActionsEmetteur(r);
  console.log('[emetteur] ' + (phrase || r.adresses.length + ' actions tokenisees, lues chez l emetteur'));
  return r;
}

/* ══ 2026-10-25 — LES ACTIONS DE L EMETTEUR, DECOUVERTES ET PROUVEES SUR LA CHAINE (actions-chaine.js) ═══════════════════════════════
 * ⛔⛔ MESURE DU 2026-10-24 : 202 actions emises, 71 connues de l app, 100 marquees par le serveur (page 1 seulement), 32 au Market dont 16
 *   marquees. Ici, a chaque tour du trending : les candidats (liste de l emetteur, graine du recensement, creations vues dont tx.from est
 *   le createur de l emetteur) passent la preuve (code 0xef + log de la factory B20 dans une tx reussie + tx.from) ; seules les PROUVEES
 *   entrent dans la liste lue chez DexScreener, recoivent la marque d origine et un verdict de route (pool de NOTRE factory, cotee).
 * ⛔ BORNE DES LECTURES : PREUVES_PAR_TOUR preuves neuves (5 lectures), 60 relectures d unites, ROUTES_PAR_TOUR routes par tour ; une
 *   preuve ou un refus est definitif et PERSISTE (actions-chaine.json, a cote du cache trending) : un redeploiement ne repaie pas 1 000
 *   lectures. Les unites et les routes, elles, bougent : relues apres UNITES_TTL_MS / ROUTE_TTL_MS. */
const preuvesActions = new Map();
const unitesActions = new Map();   /* adr -> { v: BigInt|null, t } */
const routesActions = new Map();   /* adr -> { r, t } — r porte son bloc ; persiste (actions-chaine.json) */
const poolsActionsCache = new Map(); /* 'factory|jeton|ts' -> { pool|null, t } — une pool trouvee ne se relit jamais ; persiste */
/* 2026-10-25 (revue) : le COUT d un tour, compte et servi (actionsChaine.appels) — par tour et sur l heure glissante */
const appelsActions = { dernierTour: null, heure: [] };
const creationsEmetteurVues = new Map(); /* jeton -> { jeton, tx, createur, symbole } — creations vues par le scan, createur = l emetteur */
const CREATIONS_EMETTEUR_MAX = 2000;
let tourActions = null;
function fichierActions() {
  const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null);
  return dir ? join(dir, 'actions-chaine.json') : null;
}
function chargerActionsDisque() {
  try {
    const f = fichierActions();
    if (!f || !existsSync(f)) return;
    const x = JSON.parse(readFileSync(f, 'utf8'));
    /* ⛔ seules les PREUVES et REFUS bien formes reviennent ; un NON_MESURE n a jamais ete ecrit */
    /* ⛔⛔ 2026-10-25 (revue) : seuls les verdicts GRAVABLES reviennent (verdictGravable) — un refus ecrit par le code d avant sur un
     *   `0x` (MARQUEUR sans codeLu) ou une reponse decalee (RECU_AUTRE, TX_AUTRE) est jete ici et rejuge au prochain tour */
    let jetes = 0;
    for (const p of Array.isArray(x && x.preuves) ? x.preuves : []) {
      if (p && /^0x[0-9a-f]{40}$/.test(p.adr) && verdictGravable(p)) preuvesActions.set(p.adr, p); else jetes += 1;
    }
    for (const c of Array.isArray(x && x.creations) ? x.creations : []) {
      if (c && /^0x[0-9a-f]{40}$/.test(c.jeton) && /^0x[0-9a-f]{64}$/.test(c.tx) && c.createur === CREATEUR_EMETTEUR) creationsEmetteurVues.set(c.jeton, c);
    }
    /* les verdicts de route (avec leur bloc et leur heure) : servis des le demarrage, relus selon ROUTE_TTL_MS, ignores au-dela de
     *   ROUTE_SERVIE_MAX_MS (routePourLigne) */
    for (const v of Array.isArray(x && x.routes) ? x.routes : []) {
      if (v && /^0x[0-9a-f]{40}$/.test(v.adr) && v.r && typeof v.r === 'object' && typeof v.r.achetable === 'boolean' && Number.isFinite(v.t)) routesActions.set(v.adr, { r: v.r, t: v.t });
    }
    for (const [k, v] of Array.isArray(x && x.pools) ? x.pools : []) {
      if (typeof k === 'string' && v && (v.pool === null || /^0x[0-9a-f]{40}$/.test(v.pool)) && Number.isFinite(v.t)) poolsActionsCache.set(k, v);
    }
    console.log('[actions] disk: ' + preuvesActions.size + ' verdict(s) (' + jetes + ' not definitive, dropped), ' + creationsEmetteurVues.size
      + ' issuer creation(s) seen, ' + routesActions.size + ' route(s), ' + poolsActionsCache.size + ' pool lookup(s)');
  } catch (e) { console.log('[actions] disk unread: ' + e.message); }
}
function sauverActionsDisque() {
  const f = fichierActions();
  if (!f) return;
  try {
    writeFileSync(f + '.tmp', JSON.stringify({ v: 2, a: Date.now(), preuves: [...preuvesActions.values()], creations: [...creationsEmetteurVues.values()],
      routes: [...routesActions].map(([adr, v]) => ({ adr, r: v.r, t: v.t })), pools: [...poolsActionsCache] }));
    renameSync(f + '.tmp', f);
  } catch (e) { console.log('[actions] disk write failed: ' + e.message); }
}
chargerActionsDisque();
/** retient les creations du scan dont le createur RESOLU (tx.from, createurParBlock) est celui de l emetteur */
function retenirCreationsEmetteur(creations, createurDuJeton) {
  for (const c of creations || []) {
    const j = String((c && c.jeton) || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(j) || !/^0x[0-9a-fA-F]{64}$/.test(String(c.tx || ''))) continue;
    if (createurDuJeton(j) !== CREATEUR_EMETTEUR || creationsEmetteurVues.has(j)) continue;
    creationsEmetteurVues.set(j, { jeton: j, tx: String(c.tx).toLowerCase(), createur: CREATEUR_EMETTEUR, symbole: c.symbole ? String(c.symbole).slice(0, 24) : null });
    if (creationsEmetteurVues.size > CREATIONS_EMETTEUR_MAX) creationsEmetteurVues.delete(creationsEmetteurVues.keys().next().value);
  }
}
/** un tour : preuves, unites, routes. Ne leve jamais : une panne garde le tour precedent et le DIT (etat). */
/** un lecteur compte : chaque appel (pas chaque requete HTTP : les relances internes de rpcServeur/rpcRails ne sont pas vues ici) */
const compteur = (f, c, k) => async (...a) => { c[k] = (c[k] || 0) + 1; return f(...a); };
async function actionsChaineTour(em) {
  const c = { preuves: 0, unites: 0, routes: 0, bloc: 0 };
  try {
    const candidats = candidatsActions({ emetteur: em && em.etat === 'OK' ? em.adresses : [], symbolesEmetteur: (em && em.symboles) || {},
      creationsVues: [...creationsEmetteurVues.values()] });
    /* ⛔ 2026-10-25 : les preuves lisent par une LISTE de lecteurs capables des vieux recus (lecteurPreuves) : rpcServeur (base.org puis
     *   publicnode), puis base.drpc.org (12/12 des creations a ~49,1 M servies, mesure du jour ; publicnode 0/12) */
    const replisPreuves = ESSAI_SRV.actif || process.env.TB_REPLIS === '0' ? [] : [lecteurUrl('https://base.drpc.org')];
    const rpcPreuves = compteur(lecteurPreuves([rpcServeur, ...replisPreuves]), c, 'preuves');
    const tour = await decouvrirActions({ rpc: rpcPreuves, candidats, cache: preuvesActions, pause: 120 });
    let aSauver = tour.neuves > 0; /* une preuve tentee peut avoir grave, rejuge ou efface un verdict */
    let unitesLues = 0;
    for (const p of tour.prouvees) {
      const u = unitesActions.get(p.adr);
      if (u && u.v !== null && Date.now() - u.t < UNITES_TTL_MS) continue;
      if (unitesLues >= 60) break;
      unitesLues += 1;
      unitesActions.set(p.adr, { v: await lireUnites({ rpc: compteur(rpcRails, c, 'unites'), adr: p.adr }), t: Date.now() });
    }
    let routesLues = 0;
    /* ⛔ 2026-10-25 : LES ENTREES DE LA TABLE AUSSI. Remesure du jour : 4 des 25 (WRDc BILIc NIOc NVOc) cotaient 10 USDC 4 a 8 % sous leur
     *   prix moyen et gardaient leur Buy, parce que la table « garde la main ». Elle garde sa POOL (avecPoolAction) ; son Buy suit la regle
     *   commune.
     * ⛔⛔ ORDRE (revue 2026-10-25, fail-closed) : la TABLE D ABORD — sans verdict une action n a plus de Buy, et ce sont les Buy d hier ;
     *   puis, a statut egal, le verdict le plus VIEUX (ou absent) d abord. */
    const age = (a) => { const r = routesActions.get(a); return r ? r.t : 0; };
    const ordre = [...tour.prouvees].sort((x, y) => (Number(POOLS_ACTIONS_AERODROME.has(y.adr)) - Number(POOLS_ACTIONS_AERODROME.has(x.adr))) || (age(x.adr) - age(y.adr)));
    /* ⛔ les DEUX jambes d une route et ses lectures de pool sont epinglees au MEME bloc (10 blocs sous la tete lue : 2 s a 200 ms/bloc,
     *   pour qu un noeud un peu en retard l ait). Une tete non lue : aucune route ce tour (rien n est affirme). */
    let bloc = null;
    try { bloc = parseInt(await compteur(rpcRails, c, 'bloc')('eth_blockNumber', []), 16) - 10; } catch (_) { bloc = null; }
    const appelEpingle = Number.isSafeInteger(bloc) && bloc > 0
      ? compteur((to, data) => rpcRails('eth_call', [{ to, data }, '0x' + bloc.toString(16)]), c, 'routes') : null;
    const appelOverrideEpingle = Number.isSafeInteger(bloc) && bloc > 0
      ? compteur((to, data, ov) => rpcRails('eth_call', [{ to, data }, '0x' + bloc.toString(16), ov]), c, 'routes') : null;
    for (const p of appelEpingle ? ordre : []) {
      const u = unitesActions.get(p.adr);
      if (!u || !(u.v > 0n)) continue; /* sans unites en circulation, rien a acheter */
      const r = routesActions.get(p.adr);
      if (r && Date.now() - r.t < ROUTE_TTL_MS) continue;
      if (routesLues >= ROUTES_PAR_TOUR) break;
      routesLues += 1;
      const v = await routeAction({ appel: appelEpingle, adr: p.adr, cachePools: poolsActionsCache, bloc });
      if (v.etat === 'OK') {
        const servi = routeServie(v);
        /* 2026-10-25 (liquidite-actions.js) : le lieu 'aero-new' (factory 0x9cb2…7a76, routeur 0x9ee3…d418, prouve sur fork) est cote AU MEME
         *   BLOC par les regles du proprietaire (1 % / 2 % / 10 000 USDC UTILISABLES au prix courant, pas le solde) ; `meilleure` dit le lieu retenu (choisirVenue). Notre verdict
         *   `achetable` est INCHANGE : la fiche n achete que par notre routeur. Une lecture ratee : pas de champ, rien d affirme. */
        try {
          if (codeQuoteurLiq === null) codeQuoteurLiq = await lireCodeQuoteurNouvelle(compteur(rpcServeur, c, 'routes'));
          if (codeQuoteurLiq && appelOverrideEpingle) {
            const appelDevisNeuve = (to, data) => (String(to).toLowerCase() === QUOTEUR_AERODROME_CL_LIQ ? appelOverrideEpingle(to, data, overrideQuoteur(codeQuoteurLiq)) : appelEpingle(to, data));
            const cN = await coterVenueCL({ appel: appelEpingle, appelDevis: appelDevisNeuve, venue: 'aero-new', adr: p.adr, cachePools: poolsActionsCache });
            /* ⛔ meme ADMISSION que notre route (le frais se prend dans le jeton qui sort) et « strictement meilleur » : UNE fonction,
             *   venuesServies, que la mesure appelle aussi (revue de 3d81e06, defaut 4) */
            if (cN.etat === 'OK') Object.assign(servi, venuesServies({ route: servi, coteNeuve: cN, admise: estDeviseConnue(p.adr) }));
          }
        } catch (_) { /* rien d affirme */ }
        routesActions.set(p.adr, { r: servi, t: Date.now() }); aSauver = true;
      }
    }
    if (aSauver) sauverActionsDisque();
    tourActions = tour;
    const total = c.preuves + c.unites + c.routes + c.bloc;
    appelsActions.dernierTour = { ...c, total, routesLues, preuvesNeuves: tour.neuves, a: Date.now() };
    appelsActions.heure.push({ t: Date.now(), n: total });
    appelsActions.heure = appelsActions.heure.filter((x) => Date.now() - x.t < 3_600_000);
    console.log('[actions] ' + tour.etat + ' · ' + tour.prouvees.length + ' proven, ' + tour.refusees.length + ' refused, ' + tour.nonMesurees.length
      + ' not measured · ' + tour.neuves + ' new proof(s), ' + unitesLues + ' supply read(s), ' + routesLues + ' route(s) read · ' + total + ' rpc call(s)');
  } catch (e) { console.log('[actions] pass interrupted: ' + e.message); }
  const prouvees = new Set(((tourActions && tourActions.prouvees) || []).map((p) => p.adr));
  return { prouvees, tour: tourActions };
}

/** 2026-10-25 : le verdict de route SERVI d une action (lieux compris), tant qu il n est pas perime — le planificateur emprunte 'aero-new'
 *  seulement quand ce verdict le dit meilleur (rails-api.js venueNeuveDe) */
function venueActionServie(a) {
  const v = routesActions.get(String(a || '').toLowerCase());
  return v && v.r && Number.isFinite(v.t) && Date.now() - v.t <= ROUTE_SERVIE_MAX_MS ? v.r : null;
}
/** le code du quoter 0x514c… patche pour la factory 'aero-new' (immuable : lu une fois ; null = pas encore lu, false jamais garde) */
let codeQuoteurLiq = null;

/* ══ 2026-10-27 — LA MESURE DES STABLES EN MONNAIE LOCALE SUR 'aero-new' (stables-neuve.js) ═══════════════════════════════════
 *   CADD, MXNB, USDT : leur pool 'aero-new' est cotee toutes les 5 min, au bloc epingle (10 sous la tete), par coterVenueCL et la
 *   regle des actions (verdictVenue). Le planificateur ne les route que sur un verdict QUI PASSE et de moins de 15 min
 *   (porteStableNeuve). Une lecture ratee garde le verdict NON_MESURE (rien d affirme) ; l ancienne mesure perime seule. */
const stablesNeuve = new Map(); /* adr -> { v: verdictServi, t, bloc } */
let stablesNeuveEnVol = false;
async function mesurerStablesNeuve() {
  if (stablesNeuveEnVol) return;
  stablesNeuveEnVol = true;
  try {
    const bloc = parseInt(await rpcRails('eth_blockNumber', []), 16) - 10;
    if (!(Number.isSafeInteger(bloc) && bloc > 0)) return;
    const tag = '0x' + bloc.toString(16);
    if (codeQuoteurLiq === null) codeQuoteurLiq = await lireCodeQuoteurNouvelle(rpcServeur);
    if (!codeQuoteurLiq) return;
    const appel = (to, data) => rpcRails('eth_call', [{ to, data }, tag]);
    const quoteur = String(QUOTEUR_AERODROME_CL_LIQ).toLowerCase();
    const appelDevis = (to, data) => (String(to).toLowerCase() === quoteur ? rpcRails('eth_call', [{ to, data }, tag, overrideQuoteur(codeQuoteurLiq)]) : appel(to, data));
    for (const adr of STABLES_NEUVE.keys()) {
      try {
        const cote = await coterVenueCL({ appel, appelDevis, venue: 'aero-new', adr, cachePools: poolsActionsCache });
        stablesNeuve.set(adr, { v: verdictStableNeuve(cote), t: Date.now(), bloc });
      } catch (_) { /* rien d affirme : la mesure d avant perime seule */ }
    }
  } catch (e) { console.log('[stables-neuve] pass interrupted: ' + String((e && e.message) || e).slice(0, 120)); }
  finally { stablesNeuveEnVol = false; }
}
/** ce que le serveur garde pour un stable (la porte juge la fraicheur) */
function venueStableServie(a) { return stablesNeuve.get(String(a || '').toLowerCase()) || null; }
setTimeout(() => { void mesurerStablesNeuve(); }, 45000).unref?.();
setInterval(() => { void mesurerStablesNeuve(); }, STABLE_NEUVE_TOUR_MS).unref?.();

async function alternativeAerodrome(jeton, famille) {
  const cle = String(jeton || '').toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(cle)) return null;
  /* ⛔ DEJA SUR AERODROME : le frais tombe la ou on est, rien a arbitrer. */
  if (famille === 'aerodrome') return null;
  /* ⛔ FAMILLE NON MESUREE : on ne sait pas si l alternative manque. Chercher serait payer des
   *   lectures pour une question qu on ne sait pas encore poser. */
  if (famille !== 'autre') return { etat: 'NON_MESURE', pourquoi: 'the current pool family is ' + famille };
  return enFile(async () => {
    const RESPIRATION_MS = 400;
    let fixe = alternativeImmuable.get(cle);
    if (!fixe) {
      /* ⛔ LES ESPACEMENTS VIENNENT DE LA FACTORY, plus d une liste ecrite a la main. */
      const aSonder = await espacementsASonder();
      let trouvee = null, refus = 0;
      for (const ts of aSonder) {
        try {
          const appel = '0x28af8d0b' /* getPool(address,address,int24) */
            + cle.replace(/^0x/, '').padStart(64, '0') + USDC_SRV.replace(/^0x/, '').padStart(64, '0')
            + BigInt(ts).toString(16).padStart(64, '0');
          const rendu = await callLarge(FACTORY_AERODROME_CL_SRV, appel);
          await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
          const p = adrDePool(rendu).toLowerCase();
          /* ⛔ L ADRESSE NULLE EST UN FAIT (« pas de pool a cet espacement »), pas une panne. */
          if (!p || /^0x0{40}$/.test(p)) continue;
          /* ⛔⛔⛔ EXISTER N EST PAS ETRE ECHANGEABLE, ET J AI LE TEMOIN : sur USDC/PLTRc la pool a
           *      tickSpacing 1 EXISTE et porte `liquidity = 0`. Retenir la premiere adresse non
           *      nulle gravait donc une pool MORTE — pour toujours, puisque ce cache n expire
           *      jamais — et le glissement calcule dessus divisait par zero. ⛔ Un NaN traverse
           *      toutes les bornes : il aurait fait passer une pool vide pour une route acceptable.
           *   ⛔ ET UNE LIQUIDITE NON LUE N EST PAS UNE LIQUIDITE NULLE : on passe a l espacement
           *     suivant sans compter ca comme un refus de pool, mais on ne grave rien. */
          let liq = null;
          try {
            const l = await callLarge(p, '0x1a686502' /* liquidity() */);
            liq = (!l || l === '0x') ? null : BigInt(l);
            await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
          } catch (_) { liq = null; }
          if (liq === null) { refus += 1; continue; }
          if (liq === 0n) continue;
          trouvee = { pool: p, ts };
          break;
        } catch (_) { refus += 1; }
      }
      /* ⛔⛔ UN BALAYAGE OU TOUT A ETE REFUSE N EST PAS UNE ABSENCE. Graver `absente` apres neuf
       *     refus de RPC condamnerait ce jeton a ne jamais porter notre frais, pour toujours, a
       *     cause d une panne de cinq minutes. C est le motif du zero qui ne peut plus monter.
       *   ⛔ LE SEUIL SUIT LA LISTE REELLEMENT SONDEE, pas une constante : avec neuf espacements et
       *     un seuil reste a six, trois refus de trop auraient suffi a graver un faux `absente`. */
      if (!trouvee && refus >= aSonder.length) {
        return { etat: 'NON_MESURE', pourquoi: 'every tickSpacing probe was refused by the node' };
      }
      fixe = trouvee || { absente: true };
      alternativeImmuable.set(cle, fixe);
    }
    if (fixe.absente) return { etat: 'ABSENTE', pourquoi: 'no Aerodrome CL pool for this block and USDC' };
    /* le prix et la liquidite bougent : deux lectures, comme pour la pool servie */
    try {
      const t0 = await callLarge(fixe.pool, '0x0dfe1681');
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      const s0 = await callLarge(fixe.pool, '0x3850c7bd');
      await new Promise((ok) => setTimeout(ok, RESPIRATION_MS));
      const lq = await callLarge(fixe.pool, '0x1a686502');
      const gl = glissementBps({ sqrtPriceX96: BigInt('0x' + motDePool(s0, 0)), liquidite: BigInt(lq),
        entree: TAILLE_REFERENCE_USDC, entreeEst0: adrDePool(t0).toLowerCase() === USDC_SRV });
      if (gl.etat !== 'OK') return { etat: 'NON_MESURE', pool: fixe.pool, tickSpacing: fixe.ts, pourquoi: gl.pourquoi };
      return { etat: 'OK', pool: fixe.pool, tickSpacing: fixe.ts, glissementBps: Number(gl.bps) };
    } catch (e) {
      return { etat: 'NON_MESURE', pool: fixe.pool, tickSpacing: fixe.ts,
        pourquoi: 'alternative pool reads failed: ' + String((e && e.message) || e).slice(0, 60) };
    }
  });
}

let rpcId = 0, rpcTour = 0;
/* ⛔⛔ 2026-10-09 — TOUTES les lectures d historique du serveur ont le repli publicnode, pas seulement le scan des creations.
 *   Le motif qui revient dans ce depot : un noeud public CHANGE de comportement sans prevenir (base.org : 429 a tout getLogs
 *   depuis ~2026-10-07) et chaque lecteur epingle sur lui tombe en silence (index nos-blocks a 270 000 blocs de retard, Map,
 *   Live). Le repli ne s applique qu aux eth_getLogs, n accepte qu un tableau, et rend l erreur du principal si tout echoue
 *   (repli-logs.js). Ce qui le rend visible : la sonde des noeuds de /sante (sonderNoeuds). */
/* ⛔⛔ 2026-10-09 — drpc N EST PAS UN REPLI, ET JE L AVAIS CRU. La sonde l avait mesure « archive ok » — sur UN SEUL bloc. Mesure
 *   directe ensuite (fenetres de 1/10/100/500/999 blocs, a trois profondeurs) : l offre gratuite sert au plus 10 BLOCS par getLogs
 *   (« You can make eth_getLogs requests with up to a 10 block range »), refuse 500 et 999 (« ranges over 10000 blocks are not
 *   supported on free plan »), et limite le debit. Nos balayages vont par 999 : drpc n en sert aucun. Seul publicnode sert les
 *   fenetres recentes (~9 000 blocs). L historique profond demande un noeud d archive — decision du proprietaire. */
/* ⛔ en MODE ESSAI (fork local), aucun repli : ce processus ne doit joindre aucun noeud public (garde du banc wallet-simule) */
/* ⛔ 2026-10-09 : TB_REPLIS=0 coupe tout repli PUBLIC. Un banc qui fait tourner ce serveur contre un RPC FICTIF (test-graine-nos-
 *   blocks-r9b) rend expres des fenetres « ratees » pour juger qu elles sont relues ; le repli publicnode les faisait lire sur le
 *   VRAI reseau, et le banc devenait aleatoire (ses KO variaient d une serie a l autre). En prod la variable n est pas posee. */
const REPLIS_PUBLICS_COUPES = process.env.TB_REPLIS === '0';
const REPLIS_LOGS_SERVEUR = ESSAI_SRV.actif || REPLIS_PUBLICS_COUPES ? [] : ['https://base-rpc.publicnode.com'];
/* ⛔⛔ 2026-10-09 — LE NOEUD D ARCHIVE (CDP Node, decision du proprietaire). Son URL porte la CLE dans son chemin
 *   (https://api.developer.coinbase.com/rpc/v1/base/<cle>, doc CDP) : elle vit SEULEMENT dans la variable BASE_RPC_ARCHIVE,
 *   posee par outils/poser-rpc-archive.mjs (la valeur ne passe ni par la conversation ni par un shell). Elle n est JAMAIS
 *   imprimee, jamais rendue par /sante (voir `libelleNoeud`), jamais servie au navigateur.
 *   ⛔ ORDRE : APRES publicnode. publicnode (gratuit) sert les fenetres recentes ; l archive ne paie que ce qu il refuse.
 *   ⛔ BUDGET : 10 M BU gratuits par mois chez CDP (doc) ; le cout en BU d un getLogs n est PAS documente. D ou un plafond
 *     d appels PAR JOUR (BASE_RPC_ARCHIVE_MAX_JOUR, 3 000 par defaut), compte et publie ; au-dela, refus nomme — la fenetre
 *     reste ratee et le dit, elle n est jamais lue comme vide.
 *   ⚠️ NON MESURE tant que la cle n est pas posee : que CDP serve l archive. La sonde de /sante (capacite « archive », fenetre de
 *     999 blocs a -20 000) le mesurera ; outils/poser-rpc-archive.mjs le mesure AVANT de poser. */
const RPC_ARCHIVE = (() => {
  /* 2026-10-26 (revue adverse de 8bcd051) : la relecture des trous par l archive n etait executee par AUCUN banc du vrai serveur.
   *   TB_ARCHIVE_BANC = un noeud d archive FICTIF de cette machine (http://127.0.0.1:port, rien d autre — urlLocale), accepte
   *   SEULEMENT avec TB_REPLIS=0 (aucun noeud reel) et hors mode essai. En production ni l un ni l autre n est pose. */
  if (!ESSAI_SRV.actif && process.env.TB_REPLIS === '0' && process.env.TB_ARCHIVE_BANC) return urlLocale(process.env.TB_ARCHIVE_BANC);
  if (ESSAI_SRV.actif || process.env.TB_REPLIS === '0') return null; /* banc a faux noeud : aucun noeud reel, archive comprise */
  const u = String(process.env.BASE_RPC_ARCHIVE || '').trim();
  try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch { return null; }
})();
/* game341: the relay's keyed node — BASE_RPC_RELAIS if set (its own quota), else the archive node above; https only, no credentials in
 *   the URL authority; never in test mode. Its label is the host only (libelleNoeud), the key in the path is never printed. */
const RELAIS_CLE = (() => {
  if (ESSAI_SRV.actif || process.env.TB_REPLIS === '0') return null;
  const u = String(process.env.BASE_RPC_RELAIS || '').trim();
  if (!u) return RPC_ARCHIVE;
  try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch { return null; }
})();
const RELAIS_MAX_JOUR = Number.isSafeInteger(Number(process.env.RELAIS_MAX_JOUR)) && Number(process.env.RELAIS_MAX_JOUR) >= 0 ? Number(process.env.RELAIS_MAX_JOUR) : 20000;
const RELAIS = { minute: 0, parIp: new Map(), jour: '', cles: 0, servis: 0, refus: 0, echecs: 0 };
const ARCHIVE_MAX_JOUR = Number.isSafeInteger(Number(process.env.BASE_RPC_ARCHIVE_MAX_JOUR)) && Number(process.env.BASE_RPC_ARCHIVE_MAX_JOUR) >= 0
  ? Number(process.env.BASE_RPC_ARCHIVE_MAX_JOUR) : 3000;
const archiveCompte = { jour: null, appels: 0, refusBudget: 0, erreurs: 0, servis: 0, relances: 0, derniereErreur: null, par: {}, erreursPar: {}, refusPar: {}, parQui: {}, refusParQui: {},
  nonEnvoyees: 0, nonEnvoyeesParQui: {} };
/* 2026-10-10 — nonEnvoyees / nonEnvoyeesParQui (lecteurLogs) : des fenetres eth_getLogs profondes NON ENVOYEES budget epuise (aucune
 *   requete n est partie). « Une fenetre » = une requete eth_getLogs (sa plage ET son filtre). Chacune est comptee UNE fois par
 *   lecteurLogs, c est-a-dire par TOUR : un tour de nos-blocks, un tour du routeur (ses relectures de la plage comprises : une fenetre
 *   deja non envoyee dans ce tour n est pas recomptee — la revue adverse du 2026-10-10 l avait vue recomptee jusqu a 4 fois),
 *   un appel de cleV4DuPoolId, une resolution de /api/cle. La meme fenetre redemandee a un tour SUIVANT (nos-blocks : toutes les
 *   5 min budget epuise ; routeur : chaque minute et chaque visite ; une route : chaque requete) est recomptee : ce n est PAS un
 *   nombre de fenetres distinctes. /sante le dit a cote (archiveNonEnvoyeesUnite). */
const ARCHIVE_NON_ENVOYEES_UNITE = 'deep windows not sent, each counted once per round (one tour of nos-blocks or of the routeur, re-reads included; one pool-key read; one /api/cle resolution); a window asked again in a later round is counted again, so this is not a number of distinct windows';
/* ⛔⛔ 2026-10-10 (prod, 00:00-00:31 UTC) — 2 321 appels d archive, dont 2 065 « repli eth_getLogs » (89 %) : l ORIGINE ne dit pas
 *   QUI. Chaque requete HTTP s execute sous l etiquette de sa route, chaque boucle de fond sous la sienne (AsyncLocalStorage suit les
 *   await, les minuteries et les promesses lancees depuis l appel) ; `parQui` (appels, relances comprises) et `refusParQui` (refus
 *   de budget) les comptent par etiquette. Un appel sans etiquette est compte « sans etiquette » — dit, jamais range ailleurs.
 *   ⚠️ BORNE : une minuterie programmee pendant une requete herite de l etiquette de CETTE route (c est elle qui l a lancee). */
const consommateurArchive = new AsyncLocalStorage();
const etiquetteArchive = () => String(consommateurArchive.getStore() || 'sans etiquette').slice(0, 60);
/* ⛔ 2026-10-09 (prod, 20 h UTC) : budget du jour EPUISE (10 000 / 10 000) et 549 erreurs — mais rien ne disait QUI avait depense
 *   (l histoire profonde ? le dernier repli de rpcServeur, quand base.org et publicnode refusent un eth_getLogs ?) ni de
 *   QUEL type etaient les erreurs : `derniereErreur` et `relances` vivaient en memoire et chaque redeploiement les jetait.
 *   ⛔ CORRIGE le meme jour (UTC) : j avais ecrit que ce dernier repli « prend TOUTE methode » — FAUX. avecRepliLogs (repli-logs.js)
 *     ne passe au repli QUE les eth_getLogs ; toute autre methode rend l erreur du principal sans jamais joindre l archive. L autre
 *     lecteur, rpcHistoire, ne lui envoie lui aussi que des eth_getLogs : les deux origines comptees (« histoire », « repli ») n y
 *     depensent que des getLogs (test-rpc-archive-20261009.mjs D2). HORS compteur : la sonde de /sante (sonderNoeuds) joint
 *     l archive par un fetch direct, 1 tour sur 6 (eth_blockNumber + 3 getLogs) — ni dans `appels`, ni sous le plafond.
 *   `par` = appels par « origine methode » (relances comprises) ; `erreursPar` = erreurs finales par classe ; `refusPar` = refus
 *   de BUDGET par « origine methode » (la demande non servie, et QUI la fait). Tout est sauve. */
const classeErreurArchive = (m) => /rate|limit|429/i.test(m) ? 'debit' : /timeout|aborted/i.test(m) ? 'delai' : /\b5\d\d\b/.test(m) ? '5xx'
  : /fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(m) ? 'reseau' : 'autre';
const compteurEntier = (o) => (o && typeof o === 'object' && !Array.isArray(o))
  ? Object.fromEntries(Object.entries(o).filter(([k, v]) => k.length <= 60 && Number.isSafeInteger(v) && v >= 0)) : {};
/* ⛔ 2026-10-09 : le compteur du jour vivait en memoire — chaque redeploiement (5 ce jour-la) le remettait a 0, et le plafond ne
 *   bornait plus rien. Il est garde sur le volume (relu s il est du MEME jour UTC), sauve tous les 25 appels. */
const FICHIER_ARCHIVE_COMPTE = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'archive-compte.json') : null;
try {
  if (FICHIER_ARCHIVE_COMPTE && existsSync(FICHIER_ARCHIVE_COMPTE)) {
    const x = JSON.parse(readFileSync(FICHIER_ARCHIVE_COMPTE, 'utf8'));
    if (x && x.jour === new Date().toISOString().slice(0, 10)) {
      for (const k of ['appels', 'refusBudget', 'erreurs', 'servis', 'relances', 'nonEnvoyees']) if (Number.isSafeInteger(x[k]) && x[k] >= 0) archiveCompte[k] = x[k];
      if (typeof x.derniereErreur === 'string') archiveCompte.derniereErreur = x.derniereErreur.slice(0, 80);
      if (x.derniereErreurForme && typeof x.derniereErreurForme === 'object') archiveCompte.derniereErreurForme = JSON.parse(JSON.stringify(x.derniereErreurForme).slice(0, 2000));
      archiveCompte.par = compteurEntier(x.par); archiveCompte.erreursPar = compteurEntier(x.erreursPar);
      archiveCompte.refusPar = compteurEntier(x.refusPar);
      archiveCompte.parQui = compteurEntier(x.parQui); archiveCompte.refusParQui = compteurEntier(x.refusParQui);
      archiveCompte.nonEnvoyeesParQui = compteurEntier(x.nonEnvoyeesParQui);
      archiveCompte.jour = x.jour;
    }
  }
} catch { /* fichier illisible : on compte depuis zero, et c est le seul cas */ }
function sauverArchiveCompte() {
  if (!FICHIER_ARCHIVE_COMPTE) return;
  try { writeFileSync(FICHIER_ARCHIVE_COMPTE + '.tmp', JSON.stringify(archiveCompte)); renameSync(FICHIER_ARCHIVE_COMPTE + '.tmp', FICHIER_ARCHIVE_COMPTE); } catch { /* le volume refuse : on reessaiera */ }
}
function lecteurArchive(origine = 'repli') {
  const lire = lecteurUrl(RPC_ARCHIVE, { delai: 20000 });
  return async (methode, params) => {
    const j = new Date().toISOString().slice(0, 10);
    if (archiveCompte.jour !== j) Object.assign(archiveCompte, { jour: j, appels: 0, refusBudget: 0, erreurs: 0, servis: 0, relances: 0, derniereErreur: null, par: {}, erreursPar: {}, refusPar: {}, parQui: {}, refusParQui: {}, nonEnvoyees: 0, nonEnvoyeesParQui: {} });
    const cle = origine + ' ' + String(methode).slice(0, 40);
    const qui = etiquetteArchive();
    /* les refus au-dela du plafond sont la DEMANDE NON SERVIE — la seule mesure de « le plafond suffit-il ». Une fois le plafond
     *   atteint, `appels` ne bouge plus : sans ce sauvetage, ces refus etaient perdus au redeploiement (prod : 53 -> 51).
     *   `refusPar` les range par « origine methode », comme `par` les appels : `cle` est donc construite AVANT le refus. */
    if (archiveCompte.appels >= ARCHIVE_MAX_JOUR) {
      archiveCompte.refusBudget++; archiveCompte.refusPar[cle] = (archiveCompte.refusPar[cle] || 0) + 1;
      archiveCompte.refusParQui[qui] = (archiveCompte.refusParQui[qui] || 0) + 1;
      if (archiveCompte.refusBudget % 25 === 0) sauverArchiveCompte();
      throw new Error('archive node daily budget reached (' + ARCHIVE_MAX_JOUR + ' calls)');
    }
    archiveCompte.appels++;
    archiveCompte.par[cle] = (archiveCompte.par[cle] || 0) + 1;
    archiveCompte.parQui[qui] = (archiveCompte.parQui[qui] || 0) + 1;
    if (archiveCompte.appels % 25 === 0) sauverArchiveCompte();
    /* ⛔ 2026-10-09 (prod : 19 erreurs sur 1 733 appels = exactement les 14 + 5 pages refusees du rattrapage, nombre qui varie d une
     *   passe a l autre -> transitoire) : un refus de DEBIT, un delai ou un 5xx est relance deux fois (pause 1 s puis 2 s), chaque
     *   relance comptee au budget. Une autre erreur (requete refusee pour de bon) n est pas relancee. */
    for (let essai = 0; ; essai++) {
      try { const r = await lire(methode, params); archiveCompte.servis++; return r; } catch (e) {
        const m = String((e && e.message) || e);
        if (essai >= 2 || !/rate|limit|429|5\d\d|timeout|aborted|temporar|unavailable|ECONNRESET|fetch failed/i.test(m)
          || archiveCompte.appels >= ARCHIVE_MAX_JOUR) {
          archiveCompte.erreurs++; archiveCompte.derniereErreur = masquerCle(m).slice(0, 80);
          const c = classeErreurArchive(m); archiveCompte.erreursPar[c] = (archiveCompte.erreursPar[c] || 0) + 1;
          /* ⛔ 2026-10-11..16 (prod : 441 puis 175 erreurs/jour « invalid argument 0: hex string without 0x prefix », classe « autre »,
           *   appelant INCONNU - le code relu porte partout des 0x) : la FORME de l appel fautif est gardee, EXPURGEE (jamais un
           *   parametre entier : la forme des champs seulement), avec son appelant, pour nommer la cause au lieu de la deviner. */
          archiveCompte.derniereErreurForme = { qui, methode, forme: formeParams(params) };
          if (archiveCompte.erreurs % 5 === 1) sauverArchiveCompte(); /* la forme survit a un redeploiement, sans ecrire a chaque erreur */
          throw e;
        }
        archiveCompte.relances = (archiveCompte.relances || 0) + 1;
        await new Promise((ok) => setTimeout(ok, 1000 * (essai + 1)));
        archiveCompte.appels++;
        archiveCompte.par[cle] = (archiveCompte.par[cle] || 0) + 1;
        archiveCompte.parQui[qui] = (archiveCompte.parQui[qui] || 0) + 1;
      }
    }
  };
}
/* ⛔⛔ 2026-10-09 (prod, 20 h 30 UTC) — UN REFUS DE BUDGET N EST PAS UNE PANNE DE NOEUD. Budget du jour epuise, chaque getLogs
 *   d archive est refuse A COUP SUR jusqu a 00 h UTC. Le rattrapage des createurs traitait ces refus comme des pannes : 3 passes
 *   refusees -> il SAUTAIT la fenetre (trou 50 889 029 -> 50 989 029, 51 pages, en une demi-heure). Un refus de budget se
 *   reconnait a sa cause ; devant lui, on ATTEND : ni compte de refus, ni curseur qui descend, ni trou.
 *   ⛔ JUMEAU dans repli-logs.js : quand l archive refuse par budget en DERNIER repli de rpcServeur, c est ce texte qui ouvre
 *     l erreur rendue (il etait avale, et c est le message de base.org qui sortait). test-rpc-archive-20261009.mjs D1 les lie. */
const RE_BUDGET_ARCHIVE = /archive node daily budget reached/;
/** Le budget du jour est-il epuise ? Lu sur le compteur, sans appel. */
const archiveEpuisee = () => Boolean(RPC_ARCHIVE) && archiveCompte.jour === new Date().toISOString().slice(0, 10)
  && archiveCompte.appels >= ARCHIVE_MAX_JOUR;
/** Toutes les fenetres ratees l ont-elles ete par le budget (et pas par le noeud) ? Une liste vide n est PAS un refus de budget. */
const refusDeBudget = (ratees) => Array.isArray(ratees) && ratees.length > 0
  && ratees.every((w) => RE_BUDGET_ARCHIVE.test(String((w && w.cause) || '')));
/* ⛔⛔ 2026-10-09 (mesure en prod, noeud d archive pose) — L HISTOIRE PROFONDE VA DIRECTEMENT AU NOEUD D ARCHIVE. Par la chaine de
 *   repli, chaque fenetre ancienne essayait d abord base.org (429, avec ses relances et leurs pauses) puis publicnode (403 au-dela de
 *   ~9 000 blocs) avant d arriver a CDP : le balayage des frais a avance de ~20 000 blocs en 15 min, et la relecture du trou s est
 *   figee derriere. Au-dela de PROFONDEUR_PUBLICNODE, aucun noeud gratuit ne sert ces fenetres (mesure du jour) : demander aux
 *   autres d abord ne coutait que du temps. Les autres methodes passent toujours par rpcServeur. */
const PROFONDEUR_PUBLICNODE = 9000;
let archiveDirect = null;
async function rpcHistoire(methode, params) {
  if (RPC_ARCHIVE && methode === 'eth_getLogs') { if (!archiveDirect) archiveDirect = lecteurArchive('histoire'); return archiveDirect(methode, params); }
  return rpcServeur(methode, params);
}
/* GET /api/usage (2026-10-27): the incremental on-chain usage counter. Seed = the published measure; a missing or unreadable seed
 *   answers ok:false (never a count started from an empty seed, which would be a zero by impossibility). */
let moteurUsageSrv = null;
let usageGraineErreur = null;
const USAGE_PAS_MS = 10 * 60 * 1000;
function usageServeur() {
  if (!moteurUsageSrv && !usageGraineErreur) {
    try {
      const graine = JSON.parse(readFileSync(join(ici, 'mesures', 'usage-onchain-20261027.json') /* module-level `ici` (read at call time): no import.meta here, benches eval this stretch as a script */, 'utf8'));
      if (!graine || !Array.isArray(graine.lignes) || !graine.fin || !Number.isInteger(graine.fin.bloc)) throw new Error('seed malformed');
      moteurUsageSrv = moteurUsage({ rpc: rpcServeur, graine,
        prixEth: async () => { try { const p = await prixEthUsd({ rpc: rpcServeur, stateView: STATE_VIEW_USAGE }); return p && p.etat === 'LU' ? p.usd : null; } catch (_) { return null; } } });
    } catch (e) { usageGraineErreur = String((e && e.message) || e).slice(0, 120); }
  }
  if (!moteurUsageSrv) return { ok: false, pourquoi: 'usage seed not readable: ' + usageGraineErreur };
  if (Date.now() - moteurUsageSrv.etat.lu > USAGE_PAS_MS && !moteurUsageSrv.etat.enCours) moteurUsageSrv.avancer();
  return moteurUsageSrv.resume();
}
/* BlockMissions : l etat lu par le verifier. rpcServeur d abord (base.org sert l etat a -24 h, sonde du 2026-10-17) ; un eth_call
 *   HISTORIQUE qu il ne sert pas va a l archive si elle est posee. Le reste (tete, en-tetes, tx, recu) ne touche jamais l archive. */
let archiveMissions = null;
const attestationsEnCours = new Set();
let sondeDetentionA = 0;
let revelationEnCours = false;
const apercuFace = { bloc: null, hash: null, lu: 0, enCours: false }; /* Face of the Day : une seule resolution du bloc E a la fois */
const sondeDetentionJour = { jour: '', n: 0 };
const SONDE_DETENTION_MAX_JOUR = Number.isSafeInteger(Number(process.env.SONDE_DETENTION_MAX_JOUR)) && Number(process.env.SONDE_DETENTION_MAX_JOUR) >= 0
  ? Number(process.env.SONDE_DETENTION_MAX_JOUR) : 6;
async function rpcMissionsEtat(methode, params) {
  const historique = methode === 'eth_call' && Array.isArray(params) && params[1] !== 'latest';
  try { return await rpcServeur(methode, params); } catch (e) { if (!historique || !RPC_ARCHIVE) throw e; }
  if (!archiveMissions) archiveMissions = lecteurArchive('missions');
  return archiveMissions(methode, params);
}
/* ══ 2026-10-10 — UN REFUS CERTAIN NE COUTE RIEN (lecteurLogs), VERSION REDUITE ══════════════════════════════════════════════════
 * ⛔⛔ MESURE PROD (2026-10-10, 16:27-16:31 UTC rapporte a l heure ; budget d archive epuise depuis ~03:00 UTC) : 4 044 refus de
 *   budget par heure, dont 'route /api/prix-usd' 1 468, 'fond routeur' 1 318, 'fond nos-blocks' 1 198. Chaque refus coutait D ABORD
 *   4 requetes publiques et 1,8 s de pauses : 3 a mainnet.base.org / developer-access (rpcServeurBrut, 0,3 + 0,6 + 0,9 s), 1 a
 *   publicnode, puis le refus LOCAL de lecteurArchive (aucune requete a l archive).
 * ⇒ UNE FENETRE eth_getLogs EST PROFONDE quand tete - fromBlock >= PROFONDEUR_PUBLICNODE : fromBlock est son bloc le plus profond,
 *   `tete` celle LUE par l appelant. >= et pas > : publicnode refuse « des -9 000 » (mesure du 2026-10-09, repli-logs.js).
 *   PROFONDE ET budget epuise (archiveEpuisee : lu sur le compteur, sans appel) : elle N EST PAS ENVOYEE (0 requete). Elle leve
 *   NON_ENVOYEE_BUDGET (RE_BUDGET_ARCHIVE le reconnait) et elle est comptee (archiveCompte.nonEnvoyees / nonEnvoyeesParQui : une fois
 *   par fenetre et par lecteurLogs, voir archiveCompte). C est le SEUL refus CERTAIN (`nonEnvoyee`) : l appelant la garde NON LUE
 *   (jamais vide, jamais couverte, jamais retenue comme absence) et ne la relit pas sur place.
 *   TOUT LE RESTE part a rpcServeur EXACTEMENT comme avant : fenetre recente, fenetre profonde AVEC du budget, autres methodes, tete
 *   ou fromBlock illisible.
 * ⛔ POURQUOI PAS L ARCHIVE EN DIRECT QUAND IL RESTE DU BUDGET (version precedente de ce correctif, par rpcHistoire, jamais livree) :
 *   la revue adverse du 2026-10-10 (simulation d une heure, latence SUPPOSEE 150 ms) a montre qu UNE fenetre profonde que l archive
 *   refuse sans cesse (503 relance, 400, ou une non-liste) fige `jusqua` de nos-blocks sous elle, et que chaque tour relit alors les
 *   ~147 fenetres au-dessus. Sans le detour public (1,8 s par fenetre) et a 4 s de cadence, nos-blocks passait de 9-10 a 68-91 tours
 *   par heure : 6 a 10 fois ses appels d archive a HEAD. Par rpcServeur, une fenetre profonde garde le frein d avant : memes
 *   requetes et memes pauses que HEAD (banc test-refus-certain-20261010.mjs, cas S1 a S3, contre le serveur-web.js de e84e936).
 *   SIMULE (harnais de la revue, une heure, latence SUPPOSEE 150 ms, fenetre coincee en 503) : 3 718 appels d archive a e84e936
 *   comme avec ce correctif, dont nos-blocks 1 375 et 1 375 ; budget epuise, 15 104 requetes publiques -> 4 734.
 *   Le prix de ce choix : budget LIBRE, une fenetre profonde coute toujours ses 4 requetes publiques et 1,8 s avant l archive.
 * ⛔ UNE FENETRE ENVOYEE dont l erreur COMMENCE par le texte du budget N EST PAS un refus certain : avecRepliLogs (repli-logs.js) met
 *   en tete le refus de budget du DERNIER repli, par exemple apres un 503 passager de publicnode sur une fenetre RECENTE. Elle garde
 *   le traitement d avant (nos-blocks et routeur : relue sur place, REPRISES) ; elle ne fait ni ralentir une boucle ni dire « wait
 *   for 00:00 UTC ».
 * ⇒ SEULE UNE LISTE EST UNE REPONSE d eth_getLogs (la doctrine de fraisEnAttente et de repli-logs.js) : null, '0x', un objet, un
 *   nombre levent 'not a list'. avecRepliLogs ecarte deja la non-liste d un REPLI, mais rend celle du PRINCIPAL telle quelle, et
 *   nos-blocks comme le routeur la lisaient en fenetre vide (`logs || []`) : la couverture avancait sur des blocs jamais lus. La
 *   fenetre est desormais ratee : nos-blocks et le routeur la relisent sur place (REPRISES) puis la gardent en attente ;
 *   cleV4DuPoolId la compte ratee (NON_LUE, comme avant) ; une resolution de /api/cle leve (comme avant : `for of` sur null levait).
 * ⚠️ LIMITE, non couverte : ne pas envoyer suppose qu AUCUN noeud gratuit ne sert l histoire profonde (base.org : 429 a tout
 *   eth_getLogs depuis ~2026-10-07, repli-logs.js ; publicnode : 403 des -9 000). lecteurLogs ne lit pas la sonde (/sante.noeuds).
 *   Si base.org la servait de nouveau, budget epuise, nos-blocks et le routeur resteraient figes jusqu a 00:00 UTC la ou HEAD
 *   rattrapait par base.org (SIMULE, harnais de la revue, une heure : nos-blocks +0 bloc ici contre +301 785 a e84e936).
 * ⚠️ LIMITE, non couverte : la profondeur est jugee sur la tete lue par l appelant, pas sur celle du noeud a l envoi. Une fenetre
 *   recente a la lecture de la tete (la 9e de /api/cle : fromBlock a -8 990) peut passer -9 000 pendant le balayage : elle part a
 *   rpcServeur et, budget epuise, coute ce qu elle coutait a HEAD (vu par la simulation de la revue, avant le passage a >=).
 * `suivi.nonEnvoyees` : les fenetres DISTINCTES non envoyees par ce lecteur ; `suivi.essais` : chaque refus sans envoi, une fenetre
 *   redemandee par le MEME lecteur comprise (le routeur relit sa plage) — c est lui qui dit « toutes les ratees de cette lecture sont
 *   non envoyees ». */
const NON_ENVOYEE_BUDGET = 'archive node daily budget reached — deep window not sent, it waits for 00:00 UTC';
/** Cette erreur (ou cette cause de fenetre ratee) est-elle celle d une fenetre NON ENVOYEE budget epuise ? Le seul refus certain. */
const nonEnvoyee = (x) => String((x && x.message) || x || '').startsWith(NON_ENVOYEE_BUDGET);
function lecteurLogs(tete) {
  const suivi = { nonEnvoyees: 0, essais: 0 };
  const vues = new Set(); /* les fenetres deja non envoyees par CE lecteur : comptees une fois (archiveCompte) */
  async function rpc(methode, params) {
    const q = methode === 'eth_getLogs' && Array.isArray(params) && params[0] && typeof params[0] === 'object' ? params[0] : null;
    const bas = q ? parseInt(q.fromBlock, 16) : NaN;
    const profonde = Number.isSafeInteger(tete) && Number.isSafeInteger(bas) && tete - bas >= PROFONDEUR_PUBLICNODE;
    if (profonde && archiveEpuisee()) {
      suivi.essais += 1;
      const cle = JSON.stringify(q);
      if (!vues.has(cle)) { vues.add(cle); suivi.nonEnvoyees += 1; noterNonEnvoyee(); }
      throw new Error(NON_ENVOYEE_BUDGET);
    }
    const r = await rpcServeur(methode, params);
    if (methode === 'eth_getLogs' && !Array.isArray(r)) throw new Error('not a list'); /* une reponse qui n est pas une liste n est pas une fenetre vide */
    return r;
  }
  return { rpc, nonEnvoyee, suivi };
}
/** Une fenetre profonde non envoyee (budget epuise), comptee pour le consommateur qui l a demandee (etiquette AsyncLocalStorage).
 *  ⛔ Sauve toutes les 100, pas toutes les 25 comme appels / refusBudget : a 25, la revue adverse avait compte en simulation 3 fois
 *    les ecritures d archive-compte.json de HEAD (111 -> 338 par heure). A 100, meme simulation budget epuise : 108 a e84e936,
 *    28 ici (SIMULE, pas mesure en prod). Entre deux, le compteur part avec le prochain sauvetage de n importe quel autre
 *    compteur ; un redeploiement perd au plus les 99 derniers. */
function noterNonEnvoyee() {
  const qui = etiquetteArchive();
  archiveCompte.nonEnvoyees = (archiveCompte.nonEnvoyees || 0) + 1;
  if (!archiveCompte.nonEnvoyeesParQui || typeof archiveCompte.nonEnvoyeesParQui !== 'object') archiveCompte.nonEnvoyeesParQui = {};
  archiveCompte.nonEnvoyeesParQui[qui] = (archiveCompte.nonEnvoyeesParQui[qui] || 0) + 1;
  if (archiveCompte.nonEnvoyees % 100 === 0) sauverArchiveCompte();
}
/** Un message de noeud peut recopier l URL qu il a recue : chaque segment du chemin du noeud d archive est masque avant publication. */
/** La FORME des parametres d un appel (jamais leurs valeurs) : pour nommer un appel mal forme sans publier une adresse ni une cle.
 *  Une chaine devient « 0x<n> » (hexadecimal prefixe, n = longueur) ou « s<n> » (autre chaine), un nombre « num », un tableau et
 *  un objet gardent leur structure (clefs d un objet, 8 au plus). Pur. */
function formeParams(p, prof = 0) {
  if (prof > 3) return '…';
  if (typeof p === 'string') return (/^0x[0-9a-fA-F]*$/.test(p) ? '0x' : /^[0-9]+$/.test(p) ? 'dec' : /^[0-9a-fA-F]+$/.test(p) ? 'hexSANS0x' : 's') + p.length;
  if (typeof p === 'number') return 'num'; if (typeof p === 'bigint') return 'bigint'; if (p === null) return 'null'; if (p === undefined) return 'undef';
  if (Array.isArray(p)) return p.slice(0, 8).map((x) => formeParams(x, prof + 1));
  if (typeof p === 'object') { const o = {}; for (const k of Object.keys(p).slice(0, 8)) o[k] = formeParams(p[k], prof + 1); return o; }
  return typeof p;
}
function masquerCle(s) {
  let out = String(s);
  if (RPC_ARCHIVE) { try { for (const seg of new URL(RPC_ARCHIVE).pathname.split('/')) if (seg.length >= 12) out = out.split(seg).join('«hidden»'); } catch { /* rien */ } }
  return out;
}
/** Le nom d un noeud tel qu il peut etre PUBLIE : l hote, jamais le chemin (une cle d API peut y vivre). */
function libelleNoeud(url) {
  try { const x = new URL(url); return x.host + (x.pathname && x.pathname !== '/' ? ' (path hidden)' : ''); } catch { return 'unparsable node'; }
}
let repliServeur = null;
async function rpcServeur(methode, params) {
  if (!repliServeur) repliServeur = avecRepliLogs(rpcServeurBrut, [...REPLIS_LOGS_SERVEUR.map((u) => lecteurUrl(u)), ...(RPC_ARCHIVE ? [lecteurArchive('repli')] : [])]);
  return repliServeur(methode, params);
}
/* game363 (measured on prod 15 min after game362: the pool reads stopped being limited — drpc 8.8 -> 1.5 limits/min, tenderly ~8 -> 0.5 —
 *   but mainnet.base.org still took 2,170 limits for 1,804 ok: the general reader had ONE host, and a breaker never drops a url). Reads AT THE
 *   HEAD that every node serves the same way also go to the healthy hosts; everything else keeps RPC_LIST: eth_getLogs (only mainnet.base.org
 *   serves multi-address logs), receipts and txs by hash (a pruned node answers null = an absence it did not measure), historical blocks
 *   (publicnode refuses the archive past ~10,000 blocks), and eth_call with a state override. */
const METHODES_TETE = new Set(['eth_call', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getBalance', 'eth_chainId']);
function hotesLecteurGeneral(methode, params, liste = RPC_LIST, large = RPC_FAITS_POOL) {
  if (!METHODES_TETE.has(methode)) return liste;
  const a = Array.isArray(params) ? params : [];
  if (methode === 'eth_call' && a.length > 2) return liste;                           /* state override: the node must apply it */
  const tag = methode === 'eth_getBlockByNumber' ? a[0] : (methode === 'eth_call' || methode === 'eth_getCode' || methode === 'eth_getBalance') ? a[1] : 'latest'; /* the block is always the 2nd param */
  if (!(tag === undefined || tag === 'latest' || tag === 'pending')) return liste;     /* a numbered / historical block: the archive question */
  return [...new Set([...liste, ...large])];
}
async function rpcServeurBrut(methode, params) {
  compterAppel('general', methode); /* game366 */
  let dernier = null;
  const hotesL = hotesLecteurGeneral(methode, params); /* game363 */
  const maxEssais = Math.max(3, hotesL.length);
  const ordreL = SANTE_RPC.ordonner(hotesL, rpcTour, libelleNoeud); /* game362 */
  for (let k = 0; k < maxEssais; k++) {
    const url = ordreL[k % ordreL.length];
    rpcTour++;
    /* 2026-10-10 : chaque requete envoyee, comptee UNE fois par hote et par issue (compterEnvoi) — les relances ci-dessous, inchangees */
    let r = null, compte = false;
    try {
      r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: methode, params }) });
      const j = await r.json();
      compte = true; compterEnvoi(url, classeEnvoi(r.status, j));
      if (!j.error) return j.result;
      const msg = String(j.error.message || 'rpc error');
      dernier = new Error(msg);
      if (j && j.error) dernier.data = j.error.data; /* 2026-10-11 : les octets du revert (NotEnoughLiquidity.) ne sont QUE la */
      /* tip 20260923-map-prebridge: NEVER retry range/413 — same window will always fail and hung Map 3d scan */
      if (/413|too large|range/i.test(msg)) throw dernier;
      if (!/rate|limit|timeout/i.test(msg)) throw dernier;
    } catch (e) {
      if (!compte) compterEnvoi(url, classeEnvoi(r ? r.status : 0, null, r === null || /abort|timeout/i.test(String(e && e.name))));
      dernier = e;
      if (/413|too large|range/i.test(String(e && e.message || e))) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 300 * (k + 1)));
  }
  throw dernier || new Error('node rate limit');
}
/* ⛔ 2026-10-09 : le scan des creations (factory B20) a un REPLI getLogs — publicnode, seul noeud public mesure qui servait
 *   ce getLogs ce jour-la (200, 13 logs sur 1 999 blocs ; identique a drpc sur la fenetre recoupee). Tableau exige, sinon erreur. */
const rpcScanCreations = avecRepliLogs(rpcServeur, ESSAI_SRV.actif || REPLIS_PUBLICS_COUPES ? [] : [lecteurUrl('https://base-rpc.publicnode.com')]);
/* ══ LA SONDE DES NOEUDS (2026-10-09) ═══════════════════════════════════════════════════════════════════════════════════
 * Le role de chaque noeud public a ete ecrit en dur d apres UNE mesure (« base.org sert les getLogs a plus de 9 adresses »,
 * « publicnode refuse l archive »). Quand un noeud change, rien ne le disait : on l apprenait par une capture d ecran, des
 * jours apres. Toutes les 10 min, chaque noeud est essaye sur les QUATRE capacites dont l app depend, et /sante.noeuds le rend :
 *   appel (eth_blockNumber) · logs (getLogs 1 bloc, USDC) · multi (getLogs 10 adresses) · archive (getLogs de 999 blocs a -20 000).
 * Trois etats par capacite : 'ok' (tableau / nombre rendu), 'refus' (une erreur nommee : 429, 403, plafond), 'muet' (rien).
 * `logsServis` = combien de noeuds servent un getLogs ; 0 = l historique est AVEUGLE, a lire comme une panne. */
const NOEUDS_SONDES = [...new Set([...RPC_LIST, 'https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://1rpc.io/base'])];
const etatNoeuds = { lu: null, noeuds: {}, logsServis: null, multiServis: null, archiveServis: null };
/* le noeud d archive (s il est pose) est sonde lui aussi, mais UNE fois par heure (1 tour sur 6) : ses appels sont factures */
let sondeTour = 0;
async function sonderNoeuds() {
  sondeTour += 1;
  const sondes = [...NOEUDS_SONDES, ...(RPC_ARCHIVE && sondeTour % 6 === 1 ? [RPC_ARCHIVE] : [])];
  const tete = await rpcServeur('eth_blockNumber', []).then((h) => parseInt(h, 16)).catch(() => null);
  const usdc = USDC_BASE.toLowerCase();
  const multi = [usdc, ...ACTIONS_COINBASE.slice(0, 9).map((a) => String(a.adr).toLowerCase())];
  const essai = async (url, methode, params) => {
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
      const j = await r.json().catch(() => null);
      if (j && j.result !== undefined && j.result !== null && !j.error) return 'ok';
      return j && j.error ? 'refus: ' + masquerCle(String(j.error.message || '')).slice(0, 60) : 'refus: HTTP ' + r.status;
    } catch (e) { return 'muet: ' + masquerCle(String((e && e.message) || e)).slice(0, 40); }
  };
  /* les verdicts du noeud d archive survivent aux tours ou il n est pas sonde */
  const res = Object.fromEntries(Object.entries(etatNoeuds.noeuds || {}).filter(([k]) => RPC_ARCHIVE && k === libelleNoeud(RPC_ARCHIVE)));
  for (const url of sondes) {
    const n = { appel: await essai(url, 'eth_blockNumber', []) };
    if (Number.isSafeInteger(tete)) {
      const b = '0x' + (tete - 2).toString(16), p = '0x' + (tete - 20000).toString(16), p999 = '0x' + (tete - 20000 + 998).toString(16);
      n.logs = await essai(url, 'eth_getLogs', [{ address: usdc, fromBlock: b, toBlock: b }]);
      n.multi = await essai(url, 'eth_getLogs', [{ address: multi, fromBlock: b, toBlock: b }]);
      /* ⛔⛔ L ARCHIVE SE MESURE COMME ON LA DEMANDE : une fenetre de 999 blocs (la taille de nos balayages), pas un bloc. La premiere
       *   version sondait UN bloc et a ecrit « drpc : archive ok » — alors que drpc gratuit refuse tout getLogs de plus de 10 blocs
       *   (mesure directe le meme jour). Une sonde qui ne pose pas la vraie question rend un vert qui ment. Adresse et topic : ceux
       *   du balayage des frais (Initialize du PoolManager v4), peu de logs par fenetre. */
      n.archive = await essai(url, 'eth_getLogs', [{ address: PM_V4, topics: [TOPIC_INITIALIZE], fromBlock: p, toBlock: p999 }]);
    }
    /* ⛔ LE LIBELLE PUBLIE EST L HOTE, JAMAIS L URL : celle du noeud d archive porte une cle d API dans son chemin */
    res[libelleNoeud(url)] = n;
    await new Promise((ok) => setTimeout(ok, 400));
  }
  const compte = (k) => Object.values(res).filter((n) => n[k] === 'ok').length;
  Object.assign(etatNoeuds, { lu: new Date().toISOString(), noeuds: res, tete,
    logsServis: Number.isSafeInteger(tete) ? compte('logs') : null, multiServis: Number.isSafeInteger(tete) ? compte('multi') : null,
    archiveServis: Number.isSafeInteger(tete) ? compte('archive') : null });
  console.log('[noeuds] logs servis par ' + etatNoeuds.logsServis + ' · multi ' + etatNoeuds.multiServis + ' · archive ' + etatNoeuds.archiveServis + ' / ' + Object.keys(res).length);
}
if (process.env.TB_SONDES !== '0' && !ESSAI_SRV.actif) setTimeout(() => { void sonderNoeuds().catch(() => {}); setInterval(() => { void sonderNoeuds().catch(() => {}); }, 10 * 60 * 1000).unref(); }, 60000).unref();
/* ══ LA VRAIE CLE DE POOL D UN BLOCK ══════════════════════════════════════════════════════════════
 * ⛔⛔ MESURE DU 2026-09-17, ET ELLE RENVERSE UNE CONCLUSION QUE J AVAIS PUBLIEE. On croyait que les
 *    pools des autres lanceurs REFUSAIENT notre routeur. Faux : on lisait la mauvaise cle. Pour
 *    bGYND, la pool vraie est fee 3000 / tickSpacing 60 / hooks 0xee0f… ; notre liste de candidats
 *    essayait bien 3000/60, mais TOUJOURS SANS HOOK — donc un autre poolId, donc « pas de marche ».
 *    Avec la cle exacte, le Quoter officiel rend un prix : 0,01 ETH -> 1,856e23 unites, gas 60 256.
 * ⛔ LA CLE EST IMMUABLE : une pool ne change jamais de fee, de tickSpacing ni de hook. Le cache n a
 *    donc pas de peremption — seul un ECHEC de lecture se reessaie.
 * ⛔ ET « PAS TROUVE » N EST PAS « PAS DE POOL » : on rend la fenetre balayee avec la reponse, pour
 *    qu un appelant ne transforme pas notre fenetre trop courte en verdict sur le block. */
const PM_V4 = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TOPIC_INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
/* ══ LES PARTS EN ATTENTE DANS NOS HOOKS (2026-09-19) ════════════════════════════════════════════════════════════════
 * ⛔ La part ETH du wallet de frais est versee PENDANT le swap ; les parts en JETON (block a l achat, action a la vente)
 *    s accumulent dans le hook (du[wallet][devise]) jusqu a handleHookFees — que n importe qui peut appeler, et qui paie
 *    TOUJOURS le wallet de frais. Ici : lecture seule de ce qui attend, pool par pool ouverte avec V2/V3 depuis leur
 *    deploiement. Rien n est signe ni envoye par le serveur. */
/* ⛔⛔ LES SIX, PAS DEUX. Cette liste n en contenait que V2 et V3 — et la mesure du 2026-09-21 dit
 *    que 39 des 39 encaissements des 72 dernieres heures viennent du V1, qui n y etait pas.
 *    Un hook absent de cette liste rend un zero qui se lit comme « rien n arrive ».
 * ⚠️ `depuis` est un PLANCHER de balayage, pas une date de deploiement : le bloc 50861088 est la
 *    naissance du block 0, donc anterieur a tous nos hooks. Mieux vaut balayer un peu trop que de
 *    rater des pools ouvertes avant une date qu on aurait devinee. */
const HOOKS_FRAIS = [
  /* ⛔ 2026-10-09 (bytecode lu sur la chaine) : V1 n a PAS de fonction du(address,address) — le selecteur 0xe69df140 est absent de
   *   ses 45 selecteurs PUSH4, present chez V2..V8. Ses 7 lectures du() rendaient « execution reverted » : rien n etait cache, il n y
   *   a aucune creance a lire. `sansDu` le dit au lieu de le compter comme « non lu ». */
  { nom: 'V1', adr: '0xaa6d7bd9fc7d394bc717137936f2939834382044', depuis: 50861088, sansDu: true },
  { nom: 'V2', adr: '0x8e1eb57ad2a87a4f7bc89ce94efd5cd77aec2044', depuis: 51518785 },
  { nom: 'V3', adr: '0x7a7cebb2ccb84c9fbfa2730e6cb23bb192166044', depuis: 51518785 },
  { nom: 'V4', adr: '0x11fcd588c96b1781cc88b8b9f349b6067d9be4c4', depuis: 51518785 },
  { nom: 'V5', adr: '0x799136c3f5f572f1597b5b7e067d3ee45fe4a4c4', depuis: 51567449 },
  { nom: 'V6', adr: '0xd71af554b5b3dcb6bb17946cfa3c41860a50a4cc', depuis: 51586920 },
  { nom: 'V7', adr: '0xb5680fc44ea440fc223d1ca62f2b4f261fda24cc', depuis: 51586920 },
  { nom: 'V8', adr: '0x5926abdabf5d0006ee960a8270f3e124e5a764cc', depuis: 51586920 },
];
const WALLET_FRAIS = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
let fraisCache = null;
/* balayage INCREMENTAL : les devises deja vues restent ; on ne relit que les blocs nouveaux. Une fenetre ratee arrete
 * l avancee (on la relira), jamais un trou recouvert par un « deja lu ». */
const fraisScan = { jusqua: null, devises: new Map(), pools: [] };
/* ⛔ 2026-10-09 — LE BALAYAGE REPARTAIT DE ZERO A CHAQUE DEPLOIEMENT : ~1 520 fenetres depuis le bloc 50861088, en memoire seulement.
 *   Il est garde sur le volume (comme le trending et les skins) : un redemarrage reprend ou il s etait arrete. Ce qui est sauve est
 *   ce qui a ete LU (jusqua n avance que sur des fenetres lues sans trou) ; un fichier illisible = on repart de zero, jamais d un
 *   « deja lu » invente. */
const FICHIER_FRAIS_SCAN = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'frais-scan.json') : null;
try {
  if (FICHIER_FRAIS_SCAN && existsSync(FICHIER_FRAIS_SCAN)) {
    const s = JSON.parse(readFileSync(FICHIER_FRAIS_SCAN, 'utf8'));
    if (Number.isSafeInteger(s.jusqua) && Array.isArray(s.devises) && Array.isArray(s.pools)) {
      fraisScan.jusqua = s.jusqua;
      for (const [h, ds] of s.devises) if (/^0x[0-9a-f]{40}$/.test(h) && Array.isArray(ds)) fraisScan.devises.set(h, new Set(ds.filter((d) => /^0x[0-9a-f]{40}$/.test(d))));
      fraisScan.pools = s.pools.filter((p) => p && typeof p.id === 'string');
    }
  }
} catch { fraisScan.jusqua = null; fraisScan.devises = new Map(); fraisScan.pools = []; }
function sauverFraisScan() {
  if (!FICHIER_FRAIS_SCAN || fraisScan.jusqua === null) return;
  try {
    writeFileSync(FICHIER_FRAIS_SCAN + '.tmp', JSON.stringify({ jusqua: fraisScan.jusqua, devises: [...fraisScan.devises].map(([h, s]) => [h, [...s]]), pools: fraisScan.pools }));
    renameSync(FICHIER_FRAIS_SCAN + '.tmp', FICHIER_FRAIS_SCAN);
  } catch { /* le volume refuse : on relira, rien n est perdu que du temps */ }
}
async function fraisEnAttente() {
  if (fraisCache && Date.now() - fraisCache.t < 120000) return fraisCache.r;
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  for (const h of HOOKS_FRAIS) if (!fraisScan.devises.has(h.adr)) fraisScan.devises.set(h.adr, new Set());
  const devises = fraisScan.devises;
  const depuis = fraisScan.jusqua === null ? Math.min(...HOOKS_FRAIS.map((h) => h.depuis)) : fraisScan.jusqua + 1;
  let fenetresRatees = 0, avance = true, refusDeSuite = 0, arret = null;
  for (let bas = depuis; bas <= tete; bas += 999) {
    /* ⛔ 2026-10-09 — 20 REFUS DE SUITE, ON S ARRETE ET ON LE DIT. Mesure : aucun noeud public gratuit ne sert ces fenetres
     *   anciennes (base.org 429, publicnode 403 archive, drpc 10 blocs max). Sans cet arret, chaque passage tentait ~1 520 fenetres
     *   refusees, avec leurs relances. La suite reprend a la premiere fenetre non lue au prochain passage. */
    if (refusDeSuite >= 20) { arret = 'stopped after 20 refused windows in a row from block ' + (fraisScan.jusqua === null ? depuis : fraisScan.jusqua + 1) + (RPC_ARCHIVE ? ': no node served them, archive node included (its budget and errors are in /sante.archive)' : ': no free node serves this depth (an archive node is needed)'); break; }
    const haut = Math.min(tete, bas + 998);
    try {
      const lecteur = tete - haut > PROFONDEUR_PUBLICNODE ? rpcHistoire : rpcServeur;
      const logs = await lecteur('eth_getLogs', [{ address: PM_V4, topics: [TOPIC_INITIALIZE], fromBlock: '0x' + bas.toString(16), toBlock: '0x' + haut.toString(16) }]);
      if (!Array.isArray(logs)) throw new Error('not a list'); /* une reponse qui n est pas une liste n est pas une fenetre vide */
      refusDeSuite = 0;
      for (const l of logs || []) {
        const hook = '0x' + String(l.data).slice(2 + 128 + 24, 2 + 192);
        if (!devises.has(hook)) continue;
        devises.get(hook).add('0x' + l.topics[2].slice(26));
        devises.get(hook).add('0x' + l.topics[3].slice(26));
        /* la pool elle-meme (id = topic 1) : pour savoir QUI en est le createur enregistre (parts createur) */
        if (!fraisScan.pools.some((x) => x.id === l.topics[1])) fraisScan.pools.push({ hook, id: l.topics[1], c0: '0x' + l.topics[2].slice(26), c1: '0x' + l.topics[3].slice(26) });
      }
      if (avance) fraisScan.jusqua = haut;
    } catch { fenetresRatees++; avance = false; refusDeSuite++; }
    /* toutes les 100 fenetres : la progression survit a un redemarrage en plein balayage */
    if (((bas - depuis) / 999) % 100 === 99) sauverFraisScan();
  }
  sauverFraisScan();
  const pad = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const lignes = [], creancesNonLues = [];
  /* ⛔ LES CREANCES SE LISENT SANS ARCHIVE : `du(wallet, devise)` est un eth_call, servi partout. USDC et TBLOCK, les deux devises
   *   d appariement connues, sont lues pour CHAQUE hook meme si le balayage ne les a pas encore trouvees — sinon un balayage arrete
   *   rendait « aucune creance » sur des devises qu on n a simplement pas eu le droit de lister. Elles ne sont PAS ajoutees au
   *   resultat du balayage (ce qu il a vu reste ce qu il a vu). */
  /* game354 (review): our LEGACY hooks are paired with the OLD test token — that is what du() can owe; the real TBLOCK is on basestonk's hook */
  const amorce = [USDC_BASE.toLowerCase(), String(TBLOCK_TEST_ANCIEN).toLowerCase()];
  for (const h of HOOKS_FRAIS) {
    if (h.sansDu) continue; /* pas de fonction du() dans son code (mesure) : rien a lire, et ce n est pas un echec */
    for (const d of new Set([...devises.get(h.adr), ...amorce])) {
      if (/^0x0{40}$/.test(d)) continue; /* ETH : deja verse pendant le swap */
      try {
        /* ⛔ 2026-10-09 (mesure prod) : 6 des 9 creances non lues l etaient sur « over rate limit » / « service temporarily
         *   unavailable » — un refus de DEBIT, pas une reponse. Deux relances espacees ; un « execution reverted » n est PAS relance
         *   (c est la reponse du contrat, la relire ne la changera pas). */
        const lireDu = () => rpcServeur('eth_call', [{ to: h.adr, data: '0xe69df140' /* du(address,address) */ + pad(WALLET_FRAIS) + pad(d) }, 'latest']);
        let brutDu;
        for (let essai = 0; ; essai++) {
          try { brutDu = await lireDu(); break; } catch (e) {
            if (essai >= 2 || !/rate limit|temporarily unavailable|429|503/i.test(String((e && e.message) || e))) throw e;
            await new Promise((ok) => setTimeout(ok, 1500 * (essai + 1)));
          }
        }
        const du = BigInt(brutDu);
        if (du === 0n) continue;
        let sym = null, dec = null;
        try { const x = await rpcServeur('eth_call', [{ to: d, data: '0x95d89b41' }, 'latest']); const bx = String(x).slice(2); const n = parseInt(bx.slice(64, 128), 16); sym = Buffer.from(bx.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12); } catch { sym = null; }
        try { dec = Number(BigInt(await rpcServeur('eth_call', [{ to: d, data: '0x313ce567' }, 'latest']))); } catch { dec = null; }
        lignes.push({ hook: h.nom, hookAdr: h.adr, devise: d, symbole: sym, decimales: dec, du: du.toString() });
      } catch (e) {
        /* ⛔ 2026-10-09 (mesure en prod) : ces echecs etaient comptes dans `fenetresRatees` — 13 « fenetres ratees » alors que le
         *   balayage avait lu TOUTES ses fenetres jusqu a la tete. Une creance non lue n est pas une fenetre ratee : elle est NOMMEE
         *   (hook, devise, raison) et rend `creancesCompletes` faux, sans brouiller le compte des fenetres. */
        creancesNonLues.push({ hook: h.nom, devise: d, pourquoi: String((e && e.message) || e).slice(0, 60) });
      }
    }
  }
  /* `balayageComplet` : toutes les fenetres depuis le Block 0 lues (jusqua = tete, aucun arret) ; `creancesCompletes` : chaque du()
   *   lu. Les lignes ne sont un COMPTE que si les deux sont vrais ; sinon un PLANCHER, et ce qui manque est nomme. */
  const balayageComplet = fenetresRatees === 0 && !arret && fraisScan.jusqua === tete;
  const r = { ok: true, lu: new Date().toISOString(), tete, fenetresRatees, balayageComplet, creancesCompletes: creancesNonLues.length === 0,
    complet: balayageComplet && creancesNonLues.length === 0, balayeJusqua: fraisScan.jusqua,
    ...(arret ? { arret } : {}), devisesAmorcees: amorce, devisesVues: [...devises.values()].reduce((s, x) => s + x.size, 0), pools: fraisScan.pools.length,
    creancesNonLues: creancesNonLues.slice(0, 40), hooksSansCreance: HOOKS_FRAIS.filter((h) => h.sansDu).map((h) => h.nom), lignes };
  fraisCache = { t: Date.now(), r };
  return r;
}
/* ⛔ CACHE COURT ET NOMME : un balayage de 72 h coute ~390 fenetres. Sans cache, chaque
 *    rafraichissement d onglet relancerait tout et le noeud finirait par refuser — et des fenetres
 *    refusees rendraient le total « PLANCHER » sans que personne ne comprenne pourquoi. */
let recentsCache = new Map();
/* /live : les soldes du wallet de frais, relus au plus toutes les 30 s (un robot qui recharge ne martele pas le noeud) ; null = non lu */
let liveSoldes = { t: 0, eth: null, usdc: null };
/** /live (HTML sans script) et /api/live (JSON) : frais des hooks verifies (calcul en fond partage avec /api/frais-recents?h=24),
 *  soldes du wallet de frais, 4 sondes. Rend vite : un calcul long ne tient pas la requete plus de 2,5 s (il dit EN_COURS). */
async function servirLive(res, chemin) {
  const c = enFond('frais-recents:24', () => fraisRecents(24), 300000);
  if (c.enVol) await Promise.race([c.enVol, new Promise((ok) => setTimeout(ok, 2500))]);
  if (!liveSoldes.t || Date.now() - liveSoldes.t > 30000) {
    const lireSolde = async (p) => { try { return await p; } catch (_) { return null; } };
    const [eth, usdc] = await Promise.all([
      lireSolde(rpcServeur('eth_getBalance', [FEE_WALLET, 'latest']).then((h) => BigInt(h))),
      lireSolde(rpcServeur('eth_call', [{ to: USDC_BASE, data: '0x70a08231' + FEE_WALLET.slice(2).toLowerCase().padStart(64, '0') }, 'latest']).then((h) => BigInt(h))),
    ]);
    /* prod 2026-10-11 : une lecture RATEE au boot etait gardee 30 s (« not read » servi alors que le noeud repondait) : on ne garde
     *   que ce qui a ete lu ; un echec est rendu tel quel et relu a la requete suivante */
    liveSoldes = (eth !== null && usdc !== null) ? { t: Date.now(), eth, usdc } : { t: 0, eth, usdc };
  }
  const frais = c.r ? { etat: 'LU', ...c.r, ageS: Math.round((Date.now() - c.t) / 1000) }
    : c.enVol ? { etat: 'EN_COURS' } : { etat: 'NON_LU', pourquoi: c.erreur || 'not read' };
  const e = etatLive({ frais, soldes: liveSoldes, sondes: { naissance: naissanceSonde.etat, ...autresSondes }, build: buildServi(), maintenant: Date.now() });
  if (chemin === '/api/live') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify(e));
  } else {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=30', 'x-content-type-options': 'nosniff' });
    res.end(htmlLive(e));
  }
}
/* ⛔ 2026-10-09 (audit budget archive) : h n etait que BORNE, pas arrondi — h=1.0001, 1.0002... ouvraient chacun une cle de cache
 *   NEUVE, donc un scan entier chacun (h=6 : 11 fenetres x 7 filtres = 77 getLogs, compte sur filtresScan ; les plus profondes peuvent
 *   finir au noeud d archive, dernier repli des getLogs de rpcServeur), et la Map grossissait sans fin. Et le cache n etant ecrit
 *   qu a la FIN du scan, deux requetes identiques en meme temps lancaient chacune le leur.
 *   Maintenant : h arrondi a un entier 1..6 ICI, ou vit le cache (6 cles au plus, quel que soit l appelant), et un seul scan en vol
 *   par cle, partage — la regle de enFond. Un echec n est pas mis en cache : la requete suivante relance. */
const etrangersCache = new Map();
const etrangersEnVol = new Map();
async function lancementsEtrangers(h) {
  const heures = Math.min(6, Math.max(1, Math.round(Number(h)) || 1));
  const cle = String(heures);
  const c = etrangersCache.get(cle);
  if (c && Date.now() - c.t < 300000) return c.r;
  if (etrangersEnVol.has(cle)) return etrangersEnVol.get(cle);
  const enVol = (async () => {
    const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    /* ⛔ DENIM (2026-10-23) : `heures` en blocs au temps MESURE (etait heures * 1800, soit 2 s/bloc) ; non mesure -> echec dit, pas d heures fausses */
    const recul = blocsPour(heures * 3600, await sParBlocSrv());
    if (recul === null) throw new Error('block time not measured');
    const deBloc = tete - recul;
    const scan = await scannerLancements({ rpc: rpcServeur, deBloc, aBloc: tete, maxAffinage: 250 });
    const r = {
      ok: true, lu: new Date().toISOString(), heures, deBloc, aBloc: tete,
      complet: scan.ratees === 0, fenetres: scan.fenetres, fenetresRatees: scan.ratees, nonAffines: scan.nonAffines,
      parLaunchpad: scan.parLaunchpad,
      lancements: scan.lancements.slice(-200),
      borne: 'Factory events only. LaunchBlitz is recognised by its metadata host on the o1 factory; bankr by its Doppler integrator / Clanker interface tag.',
    };
    etrangersCache.set(cle, { t: Date.now(), r });
    return r;
  })().finally(() => { etrangersEnVol.delete(cle); });
  etrangersEnVol.set(cle, enVol);
  return enVol;
}

/* ── CALCULS LONGS EN FOND : une route repond vite, le calcul continue (voir /api/frais-hook) ──────────────────────────────────
 * Un seul calcul en vol par cle ; relance seulement si le dernier resultat a plus de `ttl`. Une erreur est GARDEE et dite, elle ne
 * remplace jamais un resultat (on ne sert pas « 0 frais » parce qu un noeud a refuse). */
const calculsFond = new Map();
function enFond(cle, fn, ttl) {
  let c = calculsFond.get(cle);
  if (!c) { c = { enVol: null, r: null, t: 0, debut: null, erreur: null }; calculsFond.set(cle, c); }
  if (!c.enVol && (!c.r || Date.now() - c.t > ttl)) {
    c.debut = Date.now();
    c.enVol = Promise.resolve().then(fn)
      .then((r) => { c.r = r; c.t = Date.now(); c.erreur = null; })
      .catch((e) => { c.erreur = String((e && e.message) || e).slice(0, 160); })
      .finally(() => { c.enVol = null; });
  }
  return c;
}
async function repondreFond(res, c, extra = () => ({})) {
  /* un calcul court (cache chaud) repond dans la meme requete ; un long ne la tient pas plus de 2,5 s */
  if (c.enVol) await Promise.race([c.enVol, new Promise((ok) => setTimeout(ok, 2500))]);
  let corps;
  if (c.r) corps = { ...c.r, ageS: Math.round((Date.now() - c.t) / 1000), recalculEnCours: Boolean(c.enVol), ...(c.erreur ? { derniereErreur: c.erreur } : {}) };
  /* ⛔ 2026-10-09 : un calcul precedent qui a ECHOUE se taisait derriere « EN_COURS » (mesure : depuisS repartait a 47 s sans dire
   *   pourquoi). Son erreur est rendue a cote. */
  else if (c.enVol) corps = { ok: false, etat: 'EN_COURS', pourquoi: 'reading the chain in the background — ask again in a minute', depuisS: Math.round((Date.now() - c.debut) / 1000), ...(c.erreur ? { erreurPrecedente: c.erreur } : {}), ...extra() };
  else corps = { ok: false, etat: 'ECHEC', pourquoi: c.erreur || 'not read', ...extra() };
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(corps));
}

async function fraisRecents(heures) {
  const cle = String(heures);
  const dansLeCache = recentsCache.get(cle);
  if (dansLeCache && Date.now() - dansLeCache.t < 300000) return dansLeCache.r;
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  /* ⛔ DENIM (2026-10-23) : `heures` en blocs au temps MESURE (etait heures * 1800, soit 2 s/bloc) */
  const reculFrais = blocsPour(Number(heures) * 3600, await sParBlocSrv());
  if (reculFrais === null) throw new Error('block time not measured');
  const scan = await scanFrais({ rpc: rpcServeur, deBloc: tete - reculFrais, aBloc: tete });
  /* ⛔ ON NE VERIFIE PAS 400 SOLDES A CHAQUE APPEL : seuls les 25 derniers, et on DIT combien
   *    n ont pas ete verifies. Un plafond silencieux se lirait comme « tout est verifie ». */
  const aVerifier = scan.evenements.slice(-25);
  const verifies = [];
  for (const e of aVerifier) {
    const v = await verifierArrivee({ rpc: rpcServeur, evenement: e, wallet: WALLET_FRAIS });
    verifies.push({ hook: e.hook, bloc: e.bloc, tx: e.tx, type: e.type, devise: e.devise,
      montant: e.montant.toString(), etat: v.etat, pourquoi: v.pourquoi || null });
  }
  const resume = resumerFrais(scan);
  const r2 = {
    ok: true, lu: new Date().toISOString(), heures, tete,
    complet: scan.complet, fenetres: scan.fenetres, fenetresRatees: scan.fenetresRatees,
    evenements: resume.evenements,
    nonVerifies: Math.max(0, scan.evenements.length - aVerifier.length),
    parDevise: resume.devises.map((d) => ({ devise: d.devise, n: d.n, total: d.total.toString() })),
    derniers: verifies,
    borne: scan.borne + '. Balance deltas confirm arrival; a beneficiary who paid the transaction '
      + 'itself cannot be confirmed this way and is reported as NON_CONCLUANT, not as a failure.',
  };
  recentsCache.set(cle, { t: Date.now(), r: r2 });
  return r2;
}

/* ⛔⛔ 2026-10-09 — LE VEILLEUR RELISAIT TOUT, A CHAQUE REQUETE (audit du budget d archive, relu sur le code a b64634e).
 *   /api/veille remarchait toutes les fenetres de 2 000 blocs depuis 51 571 225 sans cache, sans partage du calcul en vol, sans
 *   curseur. Tete lue sur publicnode le 2026-10-09 a 23 h 33 UTC : 52 399 706, soit 415 fenetres, dont 409 a plus de
 *   PROFONDEUR_PUBLICNODE blocs de la tete — celles-la finissent au noeud d archive : ~409 appels d archive PAR REQUETE (calcul
 *   sur le code et cette tete, pas une mesure de prod), et deux requetes simultanees marchaient chacune. Budget du jour epuise,
 *   chacun de ces appels etait un refus connu d avance.
 *   APPELANTS (cherches le 2026-10-09 vers 23 h 30 UTC) : AUCUN. Dans ce depot (html/js/mjs/json/md..., fichiers ignores par git
 *   compris, node_modules exclu) comme dans les autres depots de veilleIA (git grep, suivis et non suivis), « api/veille »
 *   n apparait que dans cette route et ses copies. Aucun sondage, aucun intervalle : la route n est atteinte que par une requete
 *   EXTERNE, dont l origine et la frequence ne sont PAS mesurees (/sante de prod, 2026-10-09 23 h 34 UTC : 10 000 / 10 000
 *   appels, 9 778 refus de budget, `par` vide — rien n y attribue une part au veilleur).
 *   Maintenant : UNE marche en fond, partagee (enFond), le dernier resultat servi AVEC son age (repondreFond), une nouvelle
 *   marche au plus toutes les VEILLE_TTL_MS. Budget epuise : AUCUNE marche — le dernier resultat reste servi avec son age et la
 *   raison a cote (`derniereErreur`), sinon un etat NOMME. Budget epuise EN COURS de marche : la marche est COUPEE a la premiere
 *   fenetre profonde, et ne remplace pas le dernier resultat. Jamais « complet » sur des fenetres non lues.
 *   ⚠️ PLAFOND CALCULE, NON MESURE : au plus 8 marches par jour et par processus (+1 par redeploiement : le cache vit en
 *     memoire), soit ~8 x 409 = ~3 300 appels d archive hors relances, contre ~409 par requete avant. Un curseur (fenetres deja
 *     lues gardees) le ferait tomber a ~1 fenetre par marche ; il n est PAS fait ici.
 *   ⚠️ 3 h < 6 h (DELAI_CONTESTATION) : un second ancrage reste visible avant la fin de sa fenetre s il en restait plus de
 *     3 h + la duree d une marche. Le delai est un choix, pas une mesure. */
const VEILLE_DEPUIS = 51571225;
const VEILLE_TTL_MS = 3 * 3600 * 1000;
const VEILLE_BUDGET = 'archive node daily budget reached — deep windows unread until 00:00 UTC';
async function veilleUneFois() {
  /* budget epuise : chaque fenetre profonde serait refusee A COUP SUR. On ne marche pas ; enFond GARDE cette erreur et ne
   *   remplace jamais un resultat par elle. */
  if (archiveEpuisee()) throw new Error(VEILLE_BUDGET);
  /* ⛔ le budget peut s epuiser PENDANT la marche (~409 fenetres profondes ; les autres lecteurs d histoire le consomment aussi).
   *   La premiere fenetre profonde demandee budget epuise COUPE la marche : plus aucun appel, et la marche coupee est rendue comme
   *   une ERREUR — elle ne remplace pas le dernier resultat (une alerte lue en profondeur n est pas effacee par une relecture
   *   trouee) et ne se dit jamais complete. Les fenetres recentes (publicnode, gratuit) ne coupent rien. */
  let tete = null, coupeA = null;
  const rpc = async (methode, params) => {
    if (coupeA === null && methode === 'eth_getLogs' && tete !== null && archiveEpuisee()
      && tete - parseInt(params[0].toBlock, 16) > PROFONDEUR_PUBLICNODE) coupeA = parseInt(params[0].fromBlock, 16);
    if (coupeA !== null) throw new Error(VEILLE_BUDGET);
    const r = await rpcServeur(methode, params);
    if (methode === 'eth_blockNumber') tete = Number(BigInt(r));
    return r;
  };
  const v = await veiller({ rpc, pot: '0xc743f6aAff2c4caD67C30B9e5d1aF0e913FCE272', depuis: VEILLE_DEPUIS });
  if (coupeA !== null) throw new Error(VEILLE_BUDGET + ' (walk stopped at block ' + coupeA + ')');
  /* repondreFond serialise sans remplacant : un BigInt eventuel devient du texte ICI, comme le faisait la route */
  return JSON.parse(JSON.stringify(v, (k, x) => (typeof x === 'bigint' ? x.toString() : x)));
}

const clesPool = new Map();
/* ⛔⛔ 2026-10-03 — PRE-REMPLI (par JETON) depuis les logs Initialize MESURES. Mesure en prod : `/api/cle/<action>` rendait
 *   POOLID_ABSENT pour les 20 actions a pool v4 USDC (cles-v4-actions.js) — leurs Initialize datent de 2 a 12 jours, hors des
 *   40 fenetres de 999 blocs balayees ci-dessous. Sans cle, la fiche ne lisait ni n achetait ces 20 (planEchange, nourri de la
 *   cle exacte, rend APPROBATIONS 0,5 % USDC — BEc, ORCLc, QUBTc). Meme regle : seul un log dont le poolId se recalcule entre. */
for (const l of LOGS_INITIALIZE_MESURES) {
  const p = decoderInitialize(l);
  if (!p || p.erreur || !p.cle || !p.poolId) continue;
  const c = { poolId: p.poolId, currency0: p.cle.currency0, currency1: p.cle.currency1, fee: p.cle.fee, tickSpacing: p.cle.tickSpacing, hooks: p.cle.hooks, bloc: p.bloc };
  for (const j of p.jetons) {
    const t = String(j).toLowerCase();
    const r = clesPool.get(t) || { ok: true, cles: [], balaye: 0, mesure: true };
    if (!r.cles.some((x) => x.poolId === c.poolId)) r.cles.push(c);
    clesPool.set(t, r);
  }
}
async function resoudreClePool(token, fenetres = 40) {
  const t = String(token).toLowerCase();
  if (clesPool.has(t)) return clesPool.get(t);
  /* ⛔ une seule resolution EN VOL par jeton et par profondeur : douze requetes identiques = un balayage */
  const k = t + ':' + fenetres;
  if (clesPoolEnVol.has(k)) return clesPoolEnVol.get(k);
  const p = resoudreClePoolBrut(t, fenetres).finally(() => { clesPoolEnVol.delete(k); });
  clesPoolEnVol.set(k, p);
  return p;
}
/* ⛔⛔ 2026-10-10 (prod, compteur d archive par consommateur, 01:08-01:13 UTC) — `route /api/cle/:adr` : 136 appels d archive sur 347
 *   (39 %), premier consommateur. Un « aucun Initialize trouve » n etait JAMAIS retenu (on ne cache que les succes — juste pour un
 *   echec RESEAU, faux pour une absence LUE) : chaque visite d un block sans pool v4 recente rebalayait 40 fenetres x 2 getLogs, dont
 *   ~31 au-dela de la profondeur de publicnode, donc ~62 appels d archive PAR REQUETE.
 *   ⇒ L absence LUE retient la plage balayee { depuis, jusqua } ; la requete suivante ne lit que les blocs NOUVEAUX (recents : publicnode,
 *     gratuit) et, si on demande plus profond qu avant, la seule partie manquante. MEME COUVERTURE qu un balayage complet : une pool
 *     nee depuis est trouvee. Un getLogs qui leve fait toujours lever la resolution — un echec reseau n est jamais retenu. */
async function resoudreClePoolBrut(t, fenetres) {
  const t32 = '0x' + t.slice(2).padStart(64, '0');
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  /* ⛔ revue adversariale (2026-10-10) : un `eth_blockNumber` illisible (null, "0x" -> NaN) ou a 0 (noeud en synchro) inventait une
   *   absence SANS AUCUNE lecture, retenue pour toujours — ou faisait balayer tout l historique. Une tete non lue fait lever. */
  if (!Number.isSafeInteger(tete) || tete <= 0) throw new Error('chain head not read (eth_blockNumber gave ' + String(tete) + ')');
  const bas = tete - fenetres * 999 + 1; /* le bloc le plus bas de la couverture demandee (identique a l ancienne boucle) */
  const lu = clesPoolAbsentes.get(t) || null;
  /* ⛔⛔ revue adversariale (2026-10-10, constat HAUT, contre-exemple execute) : une memoire qui ne TOUCHE plus la fenetre demandee
   *   (son haut sous `bas`) faisait relire TOUT l ecart depuis elle — 606 getLogs une semaine plus tard au lieu de 80, et une pool
   *   plus ancienne que la fenetre rendue ok:true. On l oublie : balayage plein de [bas, tete], la couverture d avant exactement. */
  /* ⛔ et DES DEUX COTES (revue de cleV4DuPoolId, 2026-10-10, meme trou ici) : une tete qui recule sous le bas de la memoire faisait
   *   fusionner des blocs jamais lus [tete+1, depuis-1]. */
  const deja = lu && Number.isSafeInteger(lu.depuis) && Number.isSafeInteger(lu.jusqua) && lu.jusqua + 1 >= bas && lu.depuis <= tete + 1 ? lu : null;
  /* du plus recent au plus ancien, comme avant : la partie neuve d abord, puis la partie plus profonde jamais lue (plafonnee a la tete) */
  const plages = deja ? [[deja.jusqua + 1, tete], [bas, Math.min(deja.depuis - 1, tete)]].filter(([d, f]) => f >= d) : [[bas, tete]];
  const trouvees = [];
  /* 2026-10-10 : budget d archive epuise, la premiere fenetre PROFONDE (fromBlock a PROFONDEUR_PUBLICNODE blocs ou plus, lecteurLogs)
   *   n est PAS envoyee et fait lever la resolution : rien n est retenu. La route /api/cle le dit (NON_LU, « daily budget ») ;
   *   clesRails (recherche courte, 10 fenetres : la 10e, fromBlock a -9 989, est profonde) avale l erreur comme tout echec et rend [].
   *   Le reste de ses fenetres part a rpcServeur comme avant. */
  const lire = lecteurLogs(tete);
  for (const [d, f] of plages) {
    trouvees.push(...await scannerInitialize(t32, d, f, lire.rpc));
    if (trouvees.length) break;
  }
  if (!trouvees.length) {
    let couvert = { depuis: deja ? Math.min(deja.depuis, bas) : bas, jusqua: deja ? Math.max(deja.jusqua, tete) : tete };
    /* ⛔ une autre resolution (autre profondeur) a pu ecrire pendant ce balayage : si les deux plages LUES se touchent, on garde leur
     *   union (les deux sont vraies) ; sinon la plus recente lecture l emporte. Jamais une plage plus large que ce qui a ete lu. */
    const cur = clesPoolAbsentes.get(t);
    if (cur && cur !== lu && cur.depuis <= couvert.jusqua + 1 && couvert.depuis <= cur.jusqua + 1) {
      couvert = { depuis: Math.min(cur.depuis, couvert.depuis), jusqua: Math.max(cur.jusqua, couvert.jusqua) };
    }
    clesPoolAbsentes.delete(t); /* reinsere en fin : la borne retire le plus ancien */
    clesPoolAbsentes.set(t, couvert);
    if (clesPoolAbsentes.size > CLES_POOL_ABSENTES_MAX) clesPoolAbsentes.delete(clesPoolAbsentes.keys().next().value);
  } else clesPoolAbsentes.delete(t);
  apresAbsences();
  return clePoolDepuisLogs(t, trouvees, fenetres);
}
/** Les logs Initialize du jeton entre `deb` et `fin`, par fenetres de 999 blocs du plus recent au plus ancien ; s arrete apres la
 *  premiere fenetre qui en contient (la regle d avant). Un getLogs qui leve fait lever : jamais une absence inventee. */
async function scannerInitialize(t32, deb, fin, rpc) {
  const enHex = (n) => '0x' + n.toString(16);
  const trouvees = [];
  for (let f = fin; f >= deb && !trouvees.length; f -= 999) {
    const d = Math.max(deb, f - 998);
    for (const topics of [[TOPIC_INITIALIZE, null, null, t32], [TOPIC_INITIALIZE, null, t32]]) {
      const logs = await rpc('eth_getLogs', [{ fromBlock: enHex(d), toBlock: enHex(f), address: PM_V4, topics }]);
      for (const l of logs) trouvees.push(l);
    }
  }
  return trouvees;
}
function clePoolDepuisLogs(t, trouvees, fenetres) {
  if (!trouvees.length) {
    /* pas de cache : la pool peut etre plus ancienne que la fenetre, et demain la fenetre bougera */
    /* ⛔ LE CHIFFRE ANNONCAIT LE DOUBLE DE CE QUI EST BALAYE : la boucle avance de 999 blocs par
     *   fenetre (ligne 260), pas 2000. C est le message que lit un createur dont la pool n est pas
     *   trouvee — il en concluait que sa pool a plus de 22 h alors que c est possiblement 11 h, et
     *   donc qu il fallait chercher ailleurs. Un chiffre faux dans un diagnostic envoie enqueter
     *   au mauvais endroit. */
    return { ok: false, pourquoi: 'no Initialize found in the last ' + (fenetres * 999) + ' blocks', balaye: fenetres * 999 };
  }
  const cles = trouvees.map((l) => {
    const d = l.data.slice(2), mot = (i) => d.slice(i * 64, (i + 1) * 64);
    return {
      poolId: l.topics[1],
      currency0: '0x' + l.topics[2].slice(26),
      currency1: '0x' + l.topics[3].slice(26),
      fee: parseInt(mot(0), 16),
      tickSpacing: parseInt(mot(1), 16),
      hooks: '0x' + mot(2).slice(24),
      bloc: parseInt(l.blockNumber, 16),
    };
  });
  /* ⛔ meme correction que ci-dessus : 999 par fenetre, pas 2000. Le jumeau du chemin qui REUSSIT —
   *   c est toujours celui qu on oublie, parce qu on ne lit ses chiffres que quand tout va bien. */
  const r = { ok: true, cles, balaye: fenetres * 999 };
  clesPool.set(t, r);
  return r;
}
/* l absence LUE d un Initialize, par jeton : { depuis, jusqua } (bornee ; le plus ancien part) — et les resolutions en vol */
const CLES_POOL_ABSENTES_MAX = 5000;
const clesPoolAbsentes = new Map();
let apresAbsences = () => {}; /* branche sur la persistance juste en dessous (le banc garde la doublure muette) */
const clesPoolEnVol = new Map();
/* ⛔⛔ 2026-10-10 (prod, 16 min apres le deploiement du cache negatif) : `/api/cle` avait baisse d environ 40 %, pas plus — la memoire
 *   des absences vivait en MEMOIRE, et chaque redeploiement (4 cette nuit) la vidait : chaque jeton repayait son balayage complet
 *   (~62 appels d archive). Meme mecanisme que les cles trouvees (cles-pool.json) : volume, ecriture atomique, taille bornee,
 *   relecture qui n admet que des plages bien formees. Une plage relue trop vieille pour toucher la fenetre est de toute facon ignoree
 *   par resoudreClePoolBrut (regle d adjacence) : relire un fichier ancien ne peut jamais elargir ce qu on croit avoir lu. */
const FICHIER_CLES_ABSENTES = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'cles-absentes.json') : null;
let ecritureAbsentesPrevue = null;
apresAbsences = () => {
  if (!FICHIER_CLES_ABSENTES || ecritureAbsentesPrevue) return;
  ecritureAbsentesPrevue = setTimeout(() => {
    ecritureAbsentesPrevue = null;
    try {
      const payload = JSON.stringify([...clesPoolAbsentes]);
      if (payload.length > 2 * 1024 * 1024) return; /* plutot rien qu un volume plein */
      writeFileSync(FICHIER_CLES_ABSENTES + '.tmp', payload);
      renameSync(FICHIER_CLES_ABSENTES + '.tmp', FICHIER_CLES_ABSENTES);
    } catch { /* une ecriture ratee ne casse pas une lecture : la memoire suffit */ }
  }, 5000);
  ecritureAbsentesPrevue.unref?.();
};
(function relireClesAbsentes() {
  if (!FICHIER_CLES_ABSENTES || !existsSync(FICHIER_CLES_ABSENTES)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_CLES_ABSENTES, 'utf8'));
    if (!Array.isArray(brut)) return;
    for (const e of brut.slice(-CLES_POOL_ABSENTES_MAX)) {
      const [j, v] = Array.isArray(e) ? e : [];
      if (/^0x[0-9a-f]{40}$/.test(String(j)) && v && Number.isSafeInteger(v.depuis) && Number.isSafeInteger(v.jusqua) && v.jusqua >= v.depuis && v.depuis > 0) {
        clesPoolAbsentes.set(String(j), { depuis: v.depuis, jusqua: v.jusqua });
      }
    }
    console.log('[cles] ' + clesPoolAbsentes.size + ' absence(s) d Initialize relue(s) du volume');
  } catch (err) { console.warn('[cles] absences illisibles, on repart a vide : ' + err.message); }
})();

/* ══ LA FACE GRAVEE D UN BLOCK ════════════════════════════════════════════════════════════════════
 * ⛔⛔ CE QUE PHIL DEMANDE DE VERIFIER (2026-09-17) : « que les blocks correspondent a ce qu ils
 *    creent de base et a ce qui est affiche sur la map ». Mesure du jour : nos deux blocks de genese
 *    portent bien une face GRAVEE (facette lettre/verre et fleche/fil), trois blocks tiers n ont
 *    AUCUNE metadonnee (la face derivee de l adresse est alors la seule verite disponible), et neuf
 *    lectures ont ete REFUSEES par le noeud public depuis le navigateur — ni gravee, ni absente :
 *    non lue. C est pour ces neuf-la que la lecture passe cote serveur, qui reessaie et qui partage
 *    son cache avec tout le monde.
 * ⛔ CE QUI SE MET EN CACHE POUR TOUJOURS : « LU » et « AUCUNE ». Les deux sont immuables — mesure du
 *    2026-09-06 : updateContractURI est REFUSE sur les B20. Un ECHEC, lui, ne se cache jamais. */
const facesLues = new Map();
async function resoudreFace(token) {
  const t = String(token).toLowerCase();
  if (facesLues.has(t)) return facesLues.get(t);
  const r = await faceDuBlock({ rpc: rpcServeur, jeton: t });
  const rep = { ok: true, etat: r.etat, face: r.face || null, role: r.role || null,
    boutique: r.boutique || null, /* 2026-11-04 : la boutique Shopify gravee, deja re-validee par face.js */
    pourquoi: r.pourquoi || null };
  /* ⛔ TOUT CE QUI DECOULE DES METADONNEES EST IMMUABLE, donc cachable : LU, AUCUNE (aucun URI),
   * AUTRE_SOURCE (URI hebergee ailleurs — mesure du 2026-09-18 : un de nos blocks de genese est dans
   * ce cas) et INVALIDE (champs hors bornes). SEUL « NON_LUE » est un echec de LECTURE : jamais cache,
   * sinon une minute de noeud sature condamnerait la face d un block pour toute la vie du process. */
  if (r.etat !== 'NON_LUE') facesLues.set(t, rep);
  return rep;
}

/* ══ 2026-10-03 — L INDEX DES BLOCKS NES DU CreateRouter (/api/blocks-routeur) ═══════════════════════════════════════════
 * ⛔ Graine = les 7 createPaid de mainnet (adresse ET sel lus on-chain), qui couvre [PLANCHER_ROUTEUR, GRAINE_JUSQUA]. Le
 *    serveur lit ensuite VERS L AVANT (logs B20Created -> tx -> to == CreateRouter + createPaid -> sel -> neDuRouteur), par
 *    morceaux, et la plage n avance que sur une lecture sans trou. Chaque entree porte son sel : l app re-verifie la formule.
 * ⛔ « couvertureComplete » = contigu depuis le plancher ; « tete » voyage avec la reponse : l app juge le retard elle-meme
 *    (index-routeur.js, RETARD_MAX_INDEX). Une fenetre ratee est COMPTEE, jamais tue. Lecture seule, aucune signature.
 * ⛔ 2026-10-10 : l avancement (plage + entrees) survit au redeploiement — volume, progres-index.json (apres nosBlocksCorps). */
const PAS_ROUTEUR = 2000;
/* ⛔ R9b (Claude, prod : PEXRA/o1 clignotaient, 11-12 lectures sur 15) : une lecture ratee est RELUE sur place avec une attente
 *    croissante avant de conclure (index du routeur ET nos-blocks). Seule celle qui rate encore compte, et elle ne retire
 *    jamais la couverture deja acquise : la plage n avance simplement pas. */
const REPRISES_LECTURE_MS = [500, 1000, 2000];
/* ══ 2026-10-10 — LES DEUX INDEX ET LE REFUS CERTAIN : UN SEUL RYTHME, CELUI DE rythme-fond.js (1365dcc) ═══════════════════════════
 * Les fenetres des deux index passent par lecteurLogs : budget d archive epuise, une fenetre PROFONDE n est pas envoyee (0 requete).
 * ⇒ PAS DE RELECTURE SUR PLACE d une fenetre NON ENVOYEE (elle ne partira pas davantage avant 00:00 UTC) : nos-blocks la saute dans
 *   ses REPRISES ; le routeur, qui relit TOUTE sa plage, ne la relit que si au moins une ratee de la lecture a ete ENVOYEE. Une
 *   fenetre ENVOYEE et ratee, meme sur un texte de budget (repli-logs.js), est relue comme avant.
 * ⇒ `attenteBudget` (les deux boucles) = le NOMBRE de fenetres du dernier tour NON ENVOYEES ; 0 sans elles, ou budget revenu.
 *   Recalcule en FIN de tour seulement : jamais remis a zero au debut, un retour anticipe (tete illisible, reprise a confronter,
 *   graine illisible) garde la derniere valeur. La reponse le dit (libelleAttenteBudget : ce nombre-la, et seulement tant que le
 *   budget est epuise — jamais apres 00:00 UTC).
 * ⛔ UN SEUL MECANISME DE RYTHME : rythme-fond.js. La version precedente de ce correctif en ajoutait un second (pause de 60 s pour
 *   nos-blocks, porte des visites du routeur) : RETIRE. Ce qui change, c est ce qui declenche la pause de nos-blocks :
 *   · nos-blocks : pauseNosBlocks(attenteBudget > 0 && archiveEpuisee()) — PAUSE_EPUISE_MS (5 min) SEULEMENT si le dernier tour a
 *     laisse une fenetre NON ENVOYEE. Budget epuise, une fenetre ENVOYEE et ratee (503 passager de publicnode sur une fenetre
 *     recente) ou un tour propre gardent les 4 s : seule une fenetre non envoyee fait ralentir. Dans le cas vise par 1365dcc
 *     (nos-blocks a ~300 000 blocs de la tete : fenetres profondes), c est toujours 5 min, et un tour ne coute plus que son
 *     eth_blockNumber et ses fenetres recentes.
 *   · routeur : routeurEnchaine(archiveEpuisee()) INCHANGE. Il n est atteint qu apres un tour SANS fenetre ratee : un tour qui en a
 *     une (non envoyee ou non) arrete deja le declenchement (`ratees`, deja avant 1365dcc). Il ne reagit donc a aucune fenetre ; il
 *     borne a un par declenchement les tours PROPRES budget epuise. Chaque declenchement (minuterie de 60 s, visite) coute alors,
 *     fenetres profondes non envoyees : 1 eth_blockNumber, 0 requete pour elles, aucune relecture.
 *   Budget revenu (00:00 UTC, archiveEpuisee faux sans appel) : nos-blocks repart a la fin de sa pause en cours (au plus 5 min), le
 *   routeur au declenchement suivant (au plus 60 s). */
const libelleAttenteBudget = (n) => 'archive node daily budget reached: ' + n + ' window(s) wait for 00:00 UTC (deep windows are not sent while it is exhausted)';
const routeurEtat = { blocks: new Map(GRAINE_ROUTEUR.map((g) => [g.jeton, { ...g }])), depuis: PLANCHER_ROUTEUR, jusqua: GRAINE_JUSQUA,
  tete: null, teteLueA: null, ratees: 0, lu: null, reprise: null, repriseAVerifier: false, attenteBudget: 0 };
let routeurEnCours = null;
/* ══ 2026-10-25 — LE BLOC DE CREATION D UN BLOCK, QUAND CE SERVEUR L A LU LUI-MEME (debut de la recherche de naissance, /api/holders) ══
 * ⛔ MESURE PROD (2026-10-25 16:30 UTC, /api/holders/0xb2…579e) : NON_LU en boucle. reconstruireHolders cherchait le premier mint
 *   depuis PREMIER_BLOCK_TB jusqu a la tete : ~1 100 fenetres eth_getLogs de 2 000 blocs par passe, et la recherche repart de zero
 *   a la premiere fenetre refusee (regle du 2026-10-09, inchangee). Sur des noeuds en limite de debit, elle ne finit presque jamais.
 * ⛔ UN MINT NE PEUT PAS PRECEDER LA CREATION DU JETON : avant son B20Created, l adresse n emet rien. Commencer au bloc de creation
 *   ne saute donc aucune fenetre qui pourrait porter la naissance.
 * ⛔⛔ D OU VIENT CE BLOC — ET SEULEMENT DE LA :
 *   - GRAINE_ROUTEUR (index-routeur.js) : figee dans le code, lue on-chain (tx + recu), sel prouve par neDuRouteur ;
 *   - scannerNesDuRouteur DANS CE PROCESSUS (etendreBlocksRouteur) : `bloc` = blockNumber du log B20Created emis par la FACTORY
 *     (filtre address == FACTORY_B20 et topic B20Created), lu par ce serveur sur son noeud, entree gardee seulement si le sel de la
 *     transaction redonne le jeton (formule CREATE2).
 *   JAMAIS d une requete client, JAMAIS de la reprise du volume (progres-index.json : bloc non re-verifie sur la chaine), jamais
 *   d un commentaire ni d une liste statique. Jeton absent de cette table : PREMIER_BLOCK_TB, exactement comme avant.
 * ⛔ Un bloc incoherent (pas un entier > 0) : PREMIER_BLOCK_TB. Deux blocs pour un meme jeton : le plus BAS.
 * ⛔⛔ 2026-10-25 (actions tokenisees) : un bloc lu SOUS PREMIER_BLOCK_TB est GARDE. 9cc77f2 le remplacait par PREMIER_BLOCK_TB, c est-a-
 *   dire un debut plus TARD que la creation lue — contraire a la regle ci-dessus. Sans effet pour un block TB (aucun n est ne avant le
 *   plancher) ; faux pour les 12 actions de l emetteur creees a ~49,1 M (NVDAc 49145311, recu relu ce jour) : partir du plancher ne
 *   peut trouver qu un mint POSTERIEUR, jamais la vraie naissance. */
const creationsLuesIci = new Map(GRAINE_ROUTEUR.map((g) => [String(g.jeton).toLowerCase(), g.bloc]));
function noterCreationsLues(blocks) {
  for (const b of blocks || []) {
    const j = String((b && b.jeton) || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(j) || !Number.isSafeInteger(b.bloc)) continue;
    const deja = creationsLuesIci.get(j);
    creationsLuesIci.set(j, Number.isSafeInteger(deja) ? Math.min(deja, b.bloc) : b.bloc);
  }
}
/** Premier bloc ou chercher la naissance de `jeton` : son bloc de creation lu par ce serveur, sinon PREMIER_BLOCK_TB. */
function debutRechercheNaissance(jeton) {
  const b = creationsLuesIci.get(String(jeton).toLowerCase());
  return Number.isSafeInteger(b) && b > 0 ? b : PREMIER_BLOCK_TB;
}
/* ══ 2026-10-25 — LES ACTIONS TOKENISEES : LEUR BLOC DE CREATION, PROUVE PAR CE PROCESSUS AVANT DE SERVIR ══════════════════════════
 * ⛔ MESURE PROD (2026-10-25 ~17:05 UTC, /api/holders, x-ms-monitor) : AMZNc NON_LU (fenetre 50867088-50869087 refusee), NFLXc NON_LU
 *   (50863088-50865087 refusee) ; NVDAc, GOOGLc, TSLAc « a replay is running ». Les actions ne sont dans aucune source de 9cc77f2.
 * ⛔ LA SOURCE : prouverAction (actions-chaine.js, l aide canonique) relit le RECU de la tx de creation : statut 0x1, log B20Created
 *   emis par la FACTORY pour ce jeton, tx.from = le createur de l emetteur ; `bloc` = blockNumber de ce recu. Elle est REJOUEE ICI,
 *   dans ce processus, sur la tx d une preuve PROUVE de preuvesActions — jamais le bloc d une preuve relue du volume
 *   (actions-chaine.json) ni de la graine statique (CREATIONS_GRAINE : « ce n est pas une preuve ») tel quel.
 * ⛔ Pas une action prouvee, ou preuve rejouee non PROUVE (noeud muet, recu illisible) : rien n est note, PREMIER_BLOCK_TB comme avant,
 *   et la preuve est retentee a la passe suivante. Cout : au plus 3 lectures par passe, une seule fois par action une fois notee.
 * ⚠️ Mesure du meme jour (sonde-actions, mainnet.base.org) : la tx de creation d une action ne frappe RIEN (0 mint) — la creation
 *   borne la naissance par en dessous, elle ne l est pas. */
async function apprendreCreationAction(jeton) {
  const j = String(jeton).toLowerCase();
  if (creationsLuesIci.has(j)) return;
  const p = preuvesActions.get(j);
  if (!p || p.etat !== 'PROUVE' || !/^0x[0-9a-f]{64}$/.test(String(p.tx || ''))) return;
  const r = await prouverAction({ rpc: rpcServeur, adr: j, tx: p.tx });
  if (r && r.etat === 'PROUVE' && r.adr === j && Number.isSafeInteger(r.bloc)) noterCreationsLues([{ jeton: j, bloc: r.bloc }]);
}
/* ══ 2026-10-26 — UN BLOCK DU ROUTEUR REPRIS DU VOLUME : sa TX vient de l index, son BLOC du recu relu ICI (creation-b20-prouvee.js) ══
 * ⛔ MESURE PROD (game54) : UNIT est dans routeurEtat.blocks (reprise du volume, tx 0xe99513f6…8d65), absent de creationsLuesIci —
 *   /api/holders cherchait sa naissance depuis PREMIER_BLOCK_TB. Le bloc de la reprise n est jamais pris : seul le recu fait foi.
 *   Non prouve : rien n est note (le plancher, comme avant), retente a la passe suivante. Cout : une lecture, une fois par jeton. */
async function apprendreCreationRouteur(jeton) {
  const j = String(jeton).toLowerCase();
  if (creationsLuesIci.has(j)) return;
  const b = routeurEtat.blocks.get(j) || [...routeurEtat.blocks.values()].find((x) => x && String(x.jeton).toLowerCase() === j);
  if (!b || !/^0x[0-9a-fA-F]{64}$/.test(String(b.tx || ''))) return;
  const r = await prouverCreationB20({ rpc: rpcServeur, adr: j, tx: b.tx });
  if (r && r.etat === 'PROUVE' && r.adr === j && Number.isSafeInteger(r.bloc)) noterCreationsLues([{ jeton: j, bloc: r.bloc }]);
}
/* ══ 2026-10-25 — UNE NAISSANCE CHERCHEE PLUS HAUT QUE LA CREATION CONNUE N EST NI SERVIE, NI REJOUEE, NI ECRITE ══════════════════════
 * ⛔ MESURE PROD (17:2x UTC) : NVDAc, GOOGLc, TSLAc « a replay is running but 807/858/843 window(s) were refused » — leur naissance est
 *   POSEE en memoire, d une recherche partie du plancher, donc un mint POSTERIEUR (elles sont creees a ~49,1 M). jusqua null : pas encore
 *   ecrite, mais la premiere passe complete l ecrirait dans holders-cache.json, et elle ne serait plus jamais cherchee.
 * ⛔ LA REGLE : chaque entree garde `naissanceDepuis` (le bloc d ou sa recherche est partie, ecrit avec elle). Pour un jeton dont la
 *   creation est connue (creationsLuesIci) ou qui est une action PROUVEE, une entree SANS naissanceDepuis, ou cherchee depuis un bloc
 *   PLUS HAUT que cette creation, est oubliee (soldes, naissance, curseur) et recherchee : a la relecture du volume, avant de servir,
 *   et en debut de passe (apres apprendreCreationAction, qui peut apprendre une creation plus basse).
 *   - le bloc d une preuve relue du volume (p.bloc) sert ICI a DOUTER, jamais a partir : douter rebatit (fail-closed), partir de lui
 *     pourrait sauter la naissance ;
 *   - action prouvee sans bloc lisible : seule l absence de naissanceDepuis fait douter.
 * ⛔ TEMOIN : un jeton sans creation connue et pas une action (un block TB hors routeur) garde son entree exactement comme avant.
 * ⚠️ COUT : une action dont le recu ne se relit pas repart du plancher (comme avant), et sa naissance ainsi trouvee est oubliee a la
 *   passe suivante (p.bloc sous le plancher) — elle ne se publie jamais, et ce rejeu se repaie a chaque passe. */
function naissanceDouteuse(jeton, e) {
  if (!e || e.naissance === null || e.naissance === undefined) return false;
  const j = String(jeton).toLowerCase();
  const sans = !Number.isSafeInteger(e.naissanceDepuis);
  const c = creationsLuesIci.get(j);
  if (Number.isSafeInteger(c) && c > 0) return sans || e.naissanceDepuis > c;
  const p = preuvesActions.get(j);
  if (!p || p.etat !== 'PROUVE') return false;
  return sans || (Number.isSafeInteger(p.bloc) && p.bloc > 0 && e.naissanceDepuis > p.bloc);
}
function oublierNaissance(e) {
  e.soldes = new Map(); e.naissance = null; e.naissanceDepuis = null; e.jusqua = null; e.ratees = 0; e.rechercheNaissance = null;
}
async function etendreBlocksRouteur() {
  const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  if (!Number.isSafeInteger(tete)) return;
  routeurEtat.tete = tete;
  routeurEtat.teteLueA = Date.now(); /* R8 (C2 R6-3) : l app refuse une tete figee */
  noterTeteLue(tete);
  if (routeurEtat.repriseAVerifier) { /* 2026-10-10 : une reprise du volume n est acquise qu une fois confrontee a une tete lue ICI */
    const v = confronterReprise(routeurEtat.jusqua, tete);
    if (v === 'ATTENDRE') return; /* routeur : ni lu ni complet, toujours a verifier */
    if (v === 'ABANDONNER') {
      console.log('[routeur] ⛔ avancement du volume ABANDONNE : jusqua ' + routeurEtat.jusqua + ' > tete lue ' + tete + ' + ' + RETARD_MAX_INDEX + ' — la graine comme avant');
      routeurEtat.blocks.clear();
      for (const g of GRAINE_ROUTEUR) routeurEtat.blocks.set(g.jeton, { ...g });
      routeurEtat.jusqua = GRAINE_JUSQUA; routeurEtat.reprise = null;
    }
    routeurEtat.repriseAVerifier = false;
  }
  if (routeurEtat.jusqua >= tete) return;
  const aBloc = Math.min(tete, routeurEtat.jusqua + PAS_ROUTEUR);
  const lire = lecteurLogs(tete); /* 2026-10-10 : budget epuise, fenetres profondes NON ENVOYEES (en attente) ; le reste a rpcServeur */
  let avant = 0; /* refus sans envoi AVANT la lecture courante : la difference = ceux de la lecture courante */
  let r = await scannerNesDuRouteur({ rpc: lire.rpc, deBloc: routeurEtat.jusqua + 1, aBloc, pas: 1000 });
  for (const b of r.blocks) routeurEtat.blocks.set(b.jeton, b);
  noterCreationsLues(r.blocks); /* 2026-10-25 : bloc du log B20Created lu ICI (voir creationsLuesIci) */
  for (const ms of REPRISES_LECTURE_MS) {
    if (!r.fenetresRatees) break;
    /* toutes les ratees de cette lecture sont NON ENVOYEES : la relire ne changerait rien avant 00:00 UTC. Une seule ratee ENVOYEE
     *   (meme sur un texte de budget, repli-logs.js) et la plage est relue, comme avant. */
    if (r.fenetresRatees <= lire.suivi.essais - avant) break;
    await new Promise((ok) => setTimeout(ok, ms));
    avant = lire.suivi.essais;
    r = await scannerNesDuRouteur({ rpc: lire.rpc, deBloc: routeurEtat.jusqua + 1, aBloc, pas: 1000 });
    for (const b of r.blocks) routeurEtat.blocks.set(b.jeton, b);
    noterCreationsLues(r.blocks);
  }
  routeurEtat.ratees = r.fenetresRatees;
  routeurEtat.attenteBudget = r.fenetresRatees > 0 && archiveEpuisee() ? lire.suivi.essais - avant : 0; /* fin de tour seulement */
  if (!r.fenetresRatees) routeurEtat.jusqua = aBloc;
  routeurEtat.lu = new Date().toISOString();
  noterProgresIndex(); /* 2026-10-10 : la plage du routeur prouvee ici survit au redeploiement */
}
function rattraperBlocksRouteur() {
  if (routeurEnCours) return;
  routeurEnCours = (async () => {
    try {
      for (let k = 0; k < 40; k += 1) {
        await consommateurArchive.run('fond routeur', () => etendreBlocksRouteur());
        if (routeurEtat.ratees || routeurEtat.tete === null || routeurEtat.tete - routeurEtat.jusqua <= 0) break;
        if (!routeurEnchaine(archiveEpuisee())) break; /* 2026-10-10 : budget epuise, un tour par declenchement (rythme-fond.js ; voir REPRISES_LECTURE_MS) */
        await new Promise((ok) => setTimeout(ok, 1500));
      }
    } catch (e) { /* on reessaiera au prochain tour */ }
    routeurEnCours = null;
  })();
}
/* 2026-10-10 (revue adverse F4) : une reprise a confronter lance aussi le tour de fond — sinon, en ATTENTE (lu reste null), le
 *   routeur ne repartait qu a la visite suivante, et sa confrontation pouvait se faire tard, face a une tete deja montee. */
setInterval(() => { if (routeurEtat.lu !== null || routeurEtat.repriseAVerifier) rattraperBlocksRouteur(); }, 60000).unref?.();
function blocksRouteurCorps() {
  rattraperBlocksRouteur();
  /* R8 (C2 R6-3) : couverture REELLE — contigue depuis le plancher, 0 trou, et jusqu a la tete (retard borne).
   * R9b : `jusqua` n avance que sur une lecture sans trou, donc une lecture ratee AU-DELA de `jusqua` n ouvre aucun trou dans
   *   [depuis, jusqua] : elle est dite dans `fenetresEnAttente`, et c est le retard borne qui finit par couper si elle persiste. */
  const complet = routeurEtat.depuis <= PLANCHER_ROUTEUR && routeurEtat.tete !== null && !routeurEtat.repriseAVerifier
    && routeurEtat.tete - routeurEtat.jusqua <= RETARD_MAX_INDEX;
  return JSON.stringify({ ok: true, lu: routeurEtat.lu, blocks: [...routeurEtat.blocks.values()],
    depuis: routeurEtat.depuis, jusqua: routeurEtat.jusqua, tete: routeurEtat.tete, plancher: PLANCHER_ROUTEUR,
    couvertureComplete: complet, reprise: routeurEtat.reprise,
    teteLueA: routeurEtat.teteLueA, fenetresRatees: complet ? 0 : routeurEtat.ratees, fenetresEnAttente: routeurEtat.ratees,
    attenteBudget: routeurEtat.attenteBudget && archiveEpuisee() ? libelleAttenteBudget(routeurEtat.attenteBudget) : null });
}

/* ⛔⛔ « NOS BLOCKS », CALCULE ICI ET PAS DANS LA PAGE (Phil, 2026-09-20 : « faut expandre depuis le
 *    debut »). Avant, la page scannait une fenetre FIXE de 20 000 blocs (~11 h) sans cache : un block
 *    cree par nous plus tot cessait d etre « a nous » sans aucune erreur a l ecran.
 * ⛔ PLANCHER VERIFIE SUR LA CHAINE, PAS RECITE : le Block 0 a ete mine au bloc 50861088
 *    (tx 0x925bbfbb3c6b90362aed9dbd09816f6c3548a30938913f65f8025c46d1541c92, code 0xef). Rien de nous
 *    ne peut etre anterieur, donc il est inutile de descendre plus bas.
 * ⛔ PLAGE CONTIGUE [depuis, jusqua] QUI N AVANCE QUE SUR UN SCAN PROPRE : une fenetre refusee par le
 *    noeud ne doit JAMAIS etre recouverte par un « deja lu ». Meme discipline que mesFrappes.
 * ⚠️ CACHE EN MEMOIRE : un redeploiement le vide et la couverture repart — R9b : depuis la GRAINE (origine.js), pas
 *    depuis zero. C est DIT dans la reponse (depuis / jusqua / couvertureComplete), jamais masque.
 *    ⛔ 2026-10-10 : PLUS SEULEMENT EN MEMOIRE — la plage prouvee et ses blocks sont persistes sur le volume (progres-index.json,
 *    apres nosBlocksCorps) et relus au demarrage s ils valent mieux que la graine ; sans volume, la graine comme avant. */
const PREMIER_BLOCK_TB = 50861088;
const PAS_NOS_BLOCKS = 40000;
/* ⛔⛔ MESURE (2026-09-20, 706 985 blocs, balayage complet, 0 fenetre ratee) : les blocks sont frappes
 *    AU CREATEUR, pas au wallet de frais -- `repartitionFrappe` donne 100 % de la supply au compte qui
 *    cree. Chercher les frappes vers a6cf ne trouve donc qu UN block, la ou le compte createur en a SIX.
 *    La page affichait 2 « nos blocks » au lieu de 7, sans aucune erreur.
 * ⛔ AUCUNE ADRESSE PERSONNELLE ECRITE ICI : la liste se configure par TB_NOS_CREATEURS (adresses
 *    separees par des virgules). Le wallet de frais, lui, est deja public -- il est grave dans le hook.
 * ⛔ UNE ADRESSE MAL FORMEE EST REFUSEE ET DITE : une faute de frappe dans la variable d env ferait
 *    disparaitre des blocks en silence, ce qui est exactement le defaut qu on corrige. */
const CREATEURS_REFUSES = [];
const NOS_CREATEURS = (() => {
  const brut = String(process.env.TB_NOS_CREATEURS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const bons = [];
  for (const a of brut) {
    if (/^0x[0-9a-fA-F]{40}$/.test(a)) bons.push(a);
    else CREATEURS_REFUSES.push(a.slice(0, 12));
  }
  const tous = [FEE_WALLET, ...bons];
  return [...new Map(tous.map((a) => [a.toLowerCase(), a])).values()];
})();
if (CREATEURS_REFUSES.length) console.log('[nos-blocks] ⛔ ' + CREATEURS_REFUSES.length + ' adresse(s) de TB_NOS_CREATEURS mal formee(s), ignoree(s) : ' + CREATEURS_REFUSES.join(', '));
console.log('[nos-blocks] ' + NOS_CREATEURS.length + ' compte(s) surveille(s) · plancher bloc ' + PREMIER_BLOCK_TB);
/* ⛔ R9b : la GRAINE (origine.js) couvre [PREMIER_BLOCK_TB, GRAINE_NOS_JUSQUA] ; seul [jusqua + 1, tete] reste a lire. Graine
 *   refusee (entree hors comptes surveilles, hors plage, compte non couvert) : balayage complet, comme avant. La couverture
 *   n est COMPLETE qu apres une lecture propre jusqu a la tete (`teteAtteinte`), jamais sur la seule graine. */
/* ⛔ F2 (C2 R9b) : admise ici sur sa FORME seulement ; elle n est utilisee qu apres re-verification SUR LA CHAINE au premier tour
 *   (verifierGraineNos : jusqua <= tete, un recu par entree). Une entree qui ne passe pas : graine refusee, balayage complet.
 *   Recu illisible : rien n est complet, on reessaie au tour suivant. */
const GRAINE_NOS = graineNosBlocksAdmise({ comptes: NOS_CREATEURS, plancher: PREMIER_BLOCK_TB });
console.log(GRAINE_NOS.ok ? '[nos-blocks] graine recue : ' + GRAINE_NOS.blocks.length + ' block(s), jusqu au bloc ' + GRAINE_NOS.jusqua + ' — re-verification sur la chaine au premier tour'
  : '[nos-blocks] ⛔ graine refusee (' + GRAINE_NOS.pourquoi + ') : balayage complet depuis la tete jusqu au bloc ' + PREMIER_BLOCK_TB);
const nosBlocksEtat = { blocks: new Set(NOS_BLOCKS_GENESE),
  depuis: null, jusqua: null, graine: GRAINE_NOS.ok ? 'A_VERIFIER' : 'REFUSEE', ratees: 0, lu: null, teteAtteinte: false,
  tete: null, teteLueA: null, graineEssais: 0, reprise: null, repriseAVerifier: false, attenteBudget: 0 };
/* ⛔ G2 (C2) : un RPC sans archive qui ERRE sur les vieux recus (publicnode : « Archive requests require a personal token »)
 *   rendait NON_LU a chaque tour : jamais de balayage, jamais complet. Apres GRAINE_ESSAIS_MAX tours illisibles, la graine est
 *   abandonnee (jamais admise sans verification : fail-closed) et on balaie tout depuis la tete, comme une graine refusee. */
const GRAINE_ESSAIS_MAX = 5;
/* ⛔ F1 (C2, R9b) : « complete » RETOMBE si la couverture prend du retard sur la tete (meme borne que le routeur : RETARD_MAX_INDEX
 *   blocs). Une fenetre qui reste en attente fige `jusqua` : apres ~1 h, couvertureComplete repasse a faux. `tete` et `teteLueA`
 *   voyagent avec la reponse : le client juge aussi le retard et la fraicheur (index-routeur.js, chargerNosBlocksTb). */
const nosBlocksComplet = () => nosBlocksEtat.depuis !== null && nosBlocksEtat.depuis <= PREMIER_BLOCK_TB && nosBlocksEtat.teteAtteinte
  && nosBlocksEtat.tete !== null && nosBlocksEtat.tete - nosBlocksEtat.jusqua <= RETARD_MAX_INDEX;
let nbEnCours = null;
async function etendreNosBlocks() {
  const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
  if (!Number.isSafeInteger(fin)) return;
  nosBlocksEtat.tete = fin; nosBlocksEtat.teteLueA = Date.now(); /* F1 : seule une tete LUE rafraichit teteLueA */
  noterTeteLue(fin);
  if (nosBlocksEtat.repriseAVerifier) { /* 2026-10-10 : une reprise du volume n est acquise qu une fois confrontee a une tete lue ICI */
    const v = confronterReprise(nosBlocksEtat.jusqua, fin);
    if (v === 'ATTENDRE') return; /* nos-blocks : ni lu ni complet, toujours a verifier */
    if (v === 'ABANDONNER') {
      console.log('[nos-blocks] ⛔ avancement du volume ABANDONNE : jusqua ' + nosBlocksEtat.jusqua + ' > tete lue ' + fin + ' + ' + RETARD_MAX_INDEX + ' — la graine comme avant');
      nosBlocksEtat.blocks.clear();
      for (const b of NOS_BLOCKS_GENESE) nosBlocksEtat.blocks.add(b);
      nosBlocksEtat.depuis = null; nosBlocksEtat.jusqua = null; nosBlocksEtat.reprise = null;
      nosBlocksEtat.graine = GRAINE_NOS.ok ? 'A_VERIFIER' : 'REFUSEE'; /* l etat de depart, exactement */
    }
    nosBlocksEtat.repriseAVerifier = false;
  }
  if (nosBlocksEtat.graine === 'A_VERIFIER') {
    const v = await verifierGraineNos({ rpc: rpcServeur, tete: fin });
    if (v.etat === 'NON_LU' && ++nosBlocksEtat.graineEssais < GRAINE_ESSAIS_MAX) { nosBlocksEtat.lu = new Date().toISOString(); return; } /* rien de complet ; on reessaie au tour suivant */
    if (v.etat === 'NON_LU') {
      nosBlocksEtat.graine = 'REFUSEE';
      console.log('[nos-blocks] ⛔ graine non verifiable apres ' + GRAINE_ESSAIS_MAX + ' tours (' + v.pourquoi + ' — RPC sans archive ?) : balayage complet depuis la tete jusqu au bloc ' + PREMIER_BLOCK_TB);
    } else if (v.etat === 'OK') {
      nosBlocksEtat.graine = 'ADMISE';
      for (const b of GRAINE_NOS.blocks) nosBlocksEtat.blocks.add(b);
      nosBlocksEtat.depuis = PREMIER_BLOCK_TB; nosBlocksEtat.jusqua = GRAINE_NOS.jusqua;
      console.log('[nos-blocks] graine admise apres re-verification sur la chaine : ' + GRAINE_NOS.blocks.length + ' recu(s) OK, jusqua ' + GRAINE_NOS.jusqua + ' <= tete ' + fin);
    } else {
      nosBlocksEtat.graine = 'REFUSEE';
      console.log('[nos-blocks] ⛔ graine refusee sur la chaine (' + v.pourquoi + ') : balayage complet depuis la tete jusqu au bloc ' + PREMIER_BLOCK_TB);
    }
  }
  let deBloc, aBloc;
  const f = prochaineFenetre({ fin, depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua,
    plancher: PREMIER_BLOCK_TB, pas: PAS_NOS_BLOCKS });
  if (!f) return; /* tout est couvert : plus rien a lire */
  deBloc = f.deBloc; aBloc = f.aBloc;
  /* ⛔ TOUS LES COMPTES, ET LES RATES DE CHACUN COMPTENT. Un seul compte qui echoue doit empecher la
   *    plage d avancer — sinon un trou serait recouvert par un « deja lu ». */
  /* ⛔ R9b : une fenetre ratee est RELUE sur place (REPRISES_LECTURE_MS) ; seules celles qui ratent encore comptent. */
  let ratees = 0, enAttente = 0; const restent = []; /* enAttente : celles des ratees qui sont NON ENVOYEES (budget epuise) */
  const lire = lecteurLogs(fin); /* 2026-10-10 : budget epuise, fenetres profondes NON ENVOYEES (en attente, jamais couvertes) ; le reste a rpcServeur */
  for (const compte of NOS_CREATEURS) {
    const scan = await frappesVers({ rpc: lire.rpc, compte, deBloc, aBloc });
    for (const b of scan.blocks) nosBlocksEtat.blocks.add(String(b.jeton).toLowerCase());
    /* ⛔ F4 (C2 R9b) : une fenetre dont un jeton n a pas pu etre verifie (eth_getCode en echec) n est pas propre : relue, puis en attente */
    const aRelire = [...new Map([...(scan.fenetresRatees || []), ...(scan.fenetresNonVerifiees || [])].map((w) => [w.de + '-' + w.a, w])).values()];
    for (const w of aRelire) {
      /* 2026-10-10 : NON ENVOYEE (budget epuise) : jusqu a 00:00 UTC elle ne partira pas davantage — pas de relecture sur place, elle
       *   reste en attente et la plage n avance pas sur elle. Une fenetre ENVOYEE et ratee, meme sur un texte de budget (repli-logs.js
       *   le met en tete apres un 503 passager de publicnode), est relue comme avant (voir REPRISES_LECTURE_MS). */
      if (lire.nonEnvoyee(w.cause)) { ratees += 1; enAttente += 1; restent.push(w); continue; }
      let relue = false, nonEnvoyeeEnRelecture = false;
      for (const ms of REPRISES_LECTURE_MS) {
        await new Promise((ok) => setTimeout(ok, ms));
        const r = await frappesVers({ rpc: lire.rpc, compte, deBloc: w.de, aBloc: w.a });
        for (const b of r.blocks) nosBlocksEtat.blocks.add(String(b.jeton).toLowerCase());
        if (!(r.fenetresRatees || []).length && !(r.fenetresNonVerifiees || []).length) { relue = true; break; }
        /* le budget s est epuise pendant la relecture : elle n est plus envoyee, elle attend 00:00 UTC */
        if ((r.fenetresRatees || []).some((x) => lire.nonEnvoyee(x.cause))) { nonEnvoyeeEnRelecture = true; break; }
      }
      if (!relue) { ratees += 1; restent.push(w); if (nonEnvoyeeEnRelecture) enAttente += 1; }
    }
  }
  /* ⛔ LES BLOCKS TROUVES SONT GARDES MEME SI UNE FENETRE A RATE : ils sont vrais. C est la PLAGE qui
   *    n avance pas, pas l ensemble — et la couverture DEJA acquise [depuis, jusqua] n est jamais remise a zero. */
  nosBlocksEtat.attenteBudget = archiveEpuisee() ? enAttente : 0; /* fin de tour seulement (voir REPRISES_LECTURE_MS) */
  nosBlocksEtat.ratees = ratees;
  if (!nosBlocksEtat.ratees) {
    if (nosBlocksEtat.jusqua === null) { nosBlocksEtat.depuis = deBloc; nosBlocksEtat.jusqua = aBloc; }
    else if (aBloc === fin) nosBlocksEtat.jusqua = aBloc;
    else nosBlocksEtat.depuis = deBloc;
    if (aBloc === fin) nosBlocksEtat.teteAtteinte = true;
  } else if (f.sens === 'AVANT') {
    /* ⛔ F3 (C2 R9b) : RATTRAPAGE INCREMENTAL. Les fenetres de frappesVers partitionnent [deBloc, aBloc] de la meme facon pour
     *   chaque compte : tout ce qui est SOUS la plus basse fenetre encore ratee est lu proprement. jusqua avance jusque-la (et
     *   pas plus loin : fail-closed) ; une graine vieille sur un RPC instable progresse fenetre par fenetre au lieu de tout
     *   relire a chaque tour. */
    const basRate = Math.min(...restent.map((w) => w.de));
    if (basRate - 1 > nosBlocksEtat.jusqua) nosBlocksEtat.jusqua = basRate - 1;
  } else if (f.sens === 'ARRIERE') {
    const hautRate = Math.max(...restent.map((w) => w.a)); /* remontee : seule la partie propre AU-DESSUS de la ratee est acquise */
    if (hautRate + 1 < nosBlocksEtat.depuis) nosBlocksEtat.depuis = hautRate + 1;
  }
  nosBlocksEtat.lu = new Date().toISOString();
  noterProgresIndex(); /* 2026-10-10 : la plage de nos-blocks prouvee ici survit au redeploiement */
}
/* ⛔ LE RATTRAPAGE SE CONDUIT SEUL, ET IL SAIT S ARRETER. Tant que la couverture n atteint pas le
 *    plancher, on enchaine un morceau de plus apres une pause -- sinon la remontee n avancerait qu au
 *    rythme des visites (18 morceaux = 18 visites). Quand c est complet, plus rien n est planifie. */
let rattrapageArme = false;
function rattraperNosBlocks() {
  if (rattrapageArme) return;
  rattrapageArme = true;
  const pas = async () => {
    try { await consommateurArchive.run('fond nos-blocks', () => etendreNosBlocks()); } catch (e) { /* on reessaiera au prochain tour */ }
    if (nosBlocksComplet()) {
      rattrapageArme = false;
      console.log('[nos-blocks] couverture complete jusqu au bloc ' + PREMIER_BLOCK_TB
        + ' · ' + nosBlocksEtat.blocks.size + ' block(s) a nous');
      return;
    }
    /* 2026-10-10 : 5 min (rythme-fond.js) seulement si le dernier tour a laisse une fenetre NON ENVOYEE, budget toujours epuise ;
     *   sinon 4 s comme avant (voir REPRISES_LECTURE_MS : un seul mecanisme, et ce qui le declenche) */
    setTimeout(pas, pauseNosBlocks(nosBlocksEtat.attenteBudget > 0 && archiveEpuisee())).unref?.();
  };
  setTimeout(pas, 1500).unref?.();
}
/* ⛔ G1 (C2, revue F1-F5) : une fois complete, plus rien n etait planifie, et depuis F1 une tete lue il y a plus de 10 min
 *   (FRAICHEUR_MAX_TETE_MS) est refusee par le client. Serveur au repos, le premier visiteur recevait l etat d AVANT le tour
 *   qu il declenche : PEXRA/o1 INCONNUS ~20 s. Meme rafraichissement de fond que le routeur (60 s) : tete et jusqua restent
 *   fraiches sans visite (lecture legere : 1 eth_blockNumber + la fenetre [jusqua + 1, tete] par minute). */
setInterval(() => { if (nosBlocksEtat.lu !== null || nosBlocksEtat.repriseAVerifier) rattraperNosBlocks(); }, 60000).unref?.(); /* reprise : meme raison que le routeur */
function nosBlocksCorps() {
  rattraperNosBlocks();
  return JSON.stringify({
    ok: true, lu: nosBlocksEtat.lu,
    blocks: [...nosBlocksEtat.blocks],
    depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua,
    plancher: PREMIER_BLOCK_TB,
    tete: nosBlocksEtat.tete, teteLueA: nosBlocksEtat.teteLueA, graine: nosBlocksEtat.graine, reprise: nosBlocksEtat.reprise,
    couvertureComplete: nosBlocksComplet(),
    /* R9b : `fenetresRatees` = ce qui MANQUE a la couverture annoncee. Une fois complete, une lecture ratee au-dela de
     *   `jusqua` n y retire rien (la plage n avance simplement pas) : elle est dite dans `fenetresEnAttente`, pas en trou. */
    fenetresRatees: nosBlocksComplet() ? 0 : nosBlocksEtat.ratees,
    fenetresEnAttente: nosBlocksEtat.ratees,
    attenteBudget: nosBlocksEtat.attenteBudget && archiveEpuisee() ? libelleAttenteBudget(nosBlocksEtat.attenteBudget) : null,
    /* ⛔ LA BORNE VOYAGE AVEC LA REPONSE : un appelant qui lirait « blocks » sans « couvertureComplete »
     *    croirait tenir la liste entiere alors que la remontee est encore en cours. */
    comptesSurveilles: NOS_CREATEURS.length,
    borne: 'Blocks minted to any watched account between depuis and jusqua, plus the genesis pair. '
      + 'While couvertureComplete is false the walk back to block ' + PREMIER_BLOCK_TB + ' is still running.',
  });
}

/* ══ 2026-10-10 — L AVANCEMENT DES DEUX INDEX SURVIT AU REDEPLOIEMENT (volume, progres-index.json) ══════════════════════════════
 * ⛔⛔ MESURE PROD (2026-10-10 03:55 UTC, build 20261010-cle-v4-absente, /api/nos-blocks, /api/blocks-routeur, /sante.archive) :
 *     nos-blocks jusqua = 52109849 (= la graine) pour une tete a 52407542 ; routeur jusqua = 52095000 (= GRAINE_JUSQUA) pour
 *     52407532 — ~300 000 blocs sous la tete, couvertureComplete faux, 149 fenetres en attente. Journal Railway au demarrage :
 *     « graine recue : 2 block(s), jusqu au bloc 52109849 » puis « graine admise ». L avancement des deux boucles vivait en
 *     MEMOIRE : chaque redeploiement (~8 dans la nuit du 9 au 10) repartait de la graine figee (origine.js, index-routeur.js), et
 *     le rattrapage vers l avant (pages de getLogs presque toutes plus profondes que publicnode, donc a l archive, budget
 *     10 000/jour) recommencait sans jamais finir. Compteur par consommateur ce jour-la : 'fond nos-blocks' 550 + 'fond routeur'
 *     345 = 895 appels servis sur 4 850 etiquetes (18 %) ; et 1 303 + 568 = 1 871 des 2 506 refus de budget (75 %).
 * ⛔ MEME MECANISME que les autres etats du volume (cles-absentes.json, cles-pool.json, trending-cache.json) : chemin du volume,
 *     ecriture atomique (.tmp + rename) retardee de 5 s, taille bornee, relecture qui n admet qu un etat bien forme. Sans volume :
 *     rien n est ecrit ni relu, la graine comme avant.
 * ⛔⛔ CE QUI EST ECRIT = CE QUE LA MEMOIRE A PROUVE, RIEN DE PLUS (une section relue pas encore confrontee est re-ecrite telle
 *     quelle, voir plus bas). [depuis, jusqua] n avance que sur une lecture sans trou (fenetre
 *     refusee = curseur fige ; F3 incremental ; ARRIERE/AVANT de prochaineFenetre) : on ecrit ces deux bornes telles quelles, jamais
 *     la tete. L ensemble des blocks n est JAMAIS coupe : un ensemble tronque avec sa plage dirait « lu » sur un block manquant.
 *     Trop gros : RIEN n est ecrit (le fichier precedent, plus court et prouve lui aussi, reste), et c est dit une fois au journal.
 * ⛔ CE QUI EST RELU n est adopte que s il est MIEUX que la graine et COHERENT avec elle :
 *     - meme version, meme plancher, memes comptes surveilles (nos-blocks), meme CreateRouter (routeur) ;
 *     - chaque entree bien formee (adresse ; routeur : le sel redonne le jeton par neDuRouteur, comme le client le re-verifie) ;
 *       UNE entree mauvaise et la section ENTIERE est refusee : jamais une plage gardee sans un de ses blocks ;
 *     - chaque entree de la graine (et la genese) dont le bloc tombe dans la plage relue y est presente ;
 *     - nos-blocks, graine admissible : contigu depuis le plancher ET jusqua > celui de la graine, sinon la graine comme avant ;
 *       graine refusee sur sa forme : toute plage contigue bien formee vaut mieux que le balayage depuis la tete ;
 *     - routeur : contigu depuis le plancher ET jusqua > GRAINE_JUSQUA.
 * ⛔ teteAtteinte N EST NI ECRIT NI RELU (S1b) : nos-blocks n est complet qu apres une lecture propre jusqu a la tete DANS CE
 *     PROCESSUS, jamais sur la seule reprise. tete / teteLueA ne sont jamais relus (F1/G1 : seule une tete LUE compte).
 * ⛔ Reprise adoptee : la graine de nos-blocks n est plus re-verifiee (graine: 'VOLUME' — 2 recus d archive en moins) : la plage
 *     relue la contient, verifiee au tour ou elle a ete admise. Les deux reponses disent `reprise` (la plage relue), jamais masquee.
 * ⛔ MODE ESSAI (fork local) : ni ecrit ni relu — une plage lue sur un fork n est pas une plage lue sur Base mainnet.
 * ⛔⛔ UNE REPRISE N EST ACQUISE QU APRES CONFRONTATION A UNE TETE LUE DANS CE PROCESSUS (revue adverse du 2026-10-10, contre-
 *     exemple execute : routeur.jusqua = tete + 10 000 000 ADOPTE, couvertureComplete VRAI avec un retard de -9 999 100, aucune
 *     fenetre lue). Au demarrage la tete est inconnue : la reprise est adoptee « a verifier » (repriseAVerifier), ce qui lance
 *     aussi le tour de fond de sa boucle (60 s, sans attendre une visite), et chaque tour, tete lue (confronterReprise) — avec
 *     teteMin = la plus BASSE tete lue par l une OU l autre boucle depuis le demarrage :
 *       jusqua > teteMin + RETARD_MAX_INDEX      -> le fichier dit avoir lu des blocs qui n existaient pas : reprise ABANDONNEE,
 *                                                  etat de depart de cette boucle (graine, blocks de la graine), dit au journal ;
 *       jusqua <= tete                          -> acquise, le tour continue ;
 *       sinon (noeud un peu en retard)           -> on ATTEND : rien n est lu, le routeur ne se dit pas complet (nos-blocks ne
 *                                                  l est jamais sans lecture propre jusqu a la tete, teteAtteinte).
 *     Revue adverse du correctif (fuzz de l historique honnete : 0 violation sur 120 000 controles) : face a la tete du premier
 *     tour de CHAQUE boucle, un fichier refuse au demarrage etait admis par un premier tour du routeur venu tard (sa tete ayant
 *     monte) — d ou teteMin partagee et le tour de fond.
 *     ⚠️ CE QUE CETTE CONFRONTATION NE PROUVE PAS : jusqua <= tete est NECESSAIRE, pas suffisant. Un fichier abime dont jusqua
 *     reste sous la tete d un demarrage tardif (serveur arrete longtemps) n est pas detecte ; seul ce serveur ecrit ce fichier.
 *     ⚠️ Un noeud tres en retard (> RETARD_MAX_INDEX) fait abandonner une reprise juste : on repaie le rattrapage depuis la graine
 *     — le cout d avant ce correctif, jamais une couverture fausse.
 *     ⚠️ « Etat de depart » = celui de CETTE boucle. Avant la confrontation, ses reponses servent deja les entrees relues, et le
 *     module index-routeur.js (faireRail) les UNIT sans jamais les retirer : apres un abandon, une entree que seul le fichier
 *     disait y reste pour la vie du processus. Routeur : sans effet (chaque entree passe neDuRouteur, vraie par construction).
 *     nos-blocks : un jeton tiers y serait tenu pour « a nous » — donc refuse, jamais libere (fail-closed).
 *     ⚠️ Tant qu une section n est pas confrontee, l autre boucle la RE-ECRIT telle quelle (le fichier porte les deux) : jamais
 *     avancee, aucune lecture ne la touche avant ; le demarrage suivant la confronte de nouveau.
 * ⚠️ CE QUI N EST PAS COUVERT : une reprise de nos-blocks PARTIELLE (remontee ARRIERE pas finie) n est pas adoptee quand la graine
 *     est admissible (la graine est re-verifiee et le rattrapage repart d elle). Le dernier tour avant un arret peut etre perdu
 *     (ecriture retardee de 5 s, aucun crochet d arret dans ce serveur). */
const FICHIER_PROGRES_INDEX = !ESSAI_SRV.actif && (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'progres-index.json') : null;
const PROGRES_INDEX_VER = 1;
const PROGRES_INDEX_MAX_OCTETS = 2 * 1024 * 1024;
const comptesNosTries = () => NOS_CREATEURS.map((a) => a.toLowerCase()).sort();
function progresIndexCorps() {
  /* nos-blocks : rien tant que la plage est vide (graine pas encore re-verifiee, ou rien lu proprement) */
  const nos = nosBlocksEtat.depuis === null || nosBlocksEtat.jusqua === null ? null
    : { comptes: comptesNosTries(), plancher: PREMIER_BLOCK_TB, depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua, blocks: [...nosBlocksEtat.blocks] };
  const routeur = { routeur: CREATE_ROUTER.toLowerCase(), plancher: PLANCHER_ROUTEUR, depuis: routeurEtat.depuis, jusqua: routeurEtat.jusqua,
    blocks: [...routeurEtat.blocks.values()] };
  return JSON.stringify({ ver: PROGRES_INDEX_VER, nos, routeur });
}
let progresEcritureArmee = false, progresDernierEcrit = null, progresTropGrosDit = false;
function noterProgresIndex() {
  if (!FICHIER_PROGRES_INDEX || progresEcritureArmee) return;
  progresEcritureArmee = true; /* arme AVANT le minuteur : un minuteur qui partirait aussitot ne bloquerait pas les ecritures suivantes */
  const t = setTimeout(() => {
    progresEcritureArmee = false;
    try {
      const payload = progresIndexCorps(); /* l etat AU MOMENT d ecrire (il grandit, sauf l abandon d une reprise : retour a la graine) ; aucun await ne le coupe en deux */
      if (payload === progresDernierEcrit) return;
      if (payload.length > PROGRES_INDEX_MAX_OCTETS) {
        if (!progresTropGrosDit) { progresTropGrosDit = true; console.log('[progres-index] ⛔ ' + payload.length + ' octets > ' + PROGRES_INDEX_MAX_OCTETS + ' : rien n est ecrit (jamais un ensemble coupe) — le fichier precedent, plus court et prouve lui aussi, reste'); }
        return;
      }
      writeFileSync(FICHIER_PROGRES_INDEX + '.tmp', payload);
      renameSync(FICHIER_PROGRES_INDEX + '.tmp', FICHIER_PROGRES_INDEX);
      progresDernierEcrit = payload;
    } catch (err) { /* ⛔ une ecriture ratee ne casse pas une lecture : la memoire suffit */ }
  }, 5000);
  t.unref?.();
}
/* La plus BASSE tete lue par l une OU l autre boucle depuis le demarrage (revue adverse F1 : face a la tete du premier tour de
 *   CHAQUE boucle, un fichier refuse au demarrage etait admis par un premier tour du routeur venu tard, la tete ayant monte). */
let teteMinLue = null;
function noterTeteLue(t) { teteMinLue = teteMinLue === null ? t : Math.min(teteMinLue, t); }
/** Une plage relue du volume face aux tetes lues dans ce processus : 'VERIFIEE' | 'ATTENDRE' | 'ABANDONNER' (voir l en-tete). */
function confronterReprise(jusqua, tete) {
  if (jusqua - teteMinLue > RETARD_MAX_INDEX) return 'ABANDONNER';
  return jusqua <= tete ? 'VERIFIEE' : 'ATTENDRE';
}
const adrProgresSaine = (a) => /^0x[0-9a-f]{40}$/.test(String(a));
/** La section nos-blocks relue, si elle est admise : { depuis, jusqua, blocks } ; sinon null (la graine, comme avant). */
function repriseNosAdmise(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  if (x.plancher !== PREMIER_BLOCK_TB || !Array.isArray(x.comptes) || JSON.stringify(x.comptes) !== JSON.stringify(comptesNosTries())) return null;
  const { depuis, jusqua, blocks } = x;
  if (!Number.isSafeInteger(depuis) || !Number.isSafeInteger(jusqua) || depuis < PREMIER_BLOCK_TB || jusqua < depuis) return null;
  if (!Array.isArray(blocks) || !blocks.every(adrProgresSaine)) return null;
  const ens = new Set(blocks);
  if (!NOS_BLOCKS_GENESE.every((b) => ens.has(b))) return null;
  /* ⛔ une plage qui couvre le bloc d une entree de la graine SANS cette entree dirait plus qu elle n a lu */
  if (!GRAINE_NOS_BLOCKS.every((g) => g.bloc < depuis || g.bloc > jusqua || ens.has(g.jeton))) return null;
  if (GRAINE_NOS.ok && !(depuis === PREMIER_BLOCK_TB && jusqua > GRAINE_NOS.jusqua)) return null; /* pas mieux que la graine */
  return { depuis, jusqua, blocks };
}
/** La section routeur relue, si elle est admise : { jusqua, blocks } ; sinon null (la graine, comme avant). */
function repriseRouteurAdmise(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  if (x.routeur !== CREATE_ROUTER.toLowerCase() || x.plancher !== PLANCHER_ROUTEUR) return null;
  if (x.depuis !== PLANCHER_ROUTEUR || !Number.isSafeInteger(x.jusqua) || x.jusqua <= GRAINE_JUSQUA) return null;
  if (!Array.isArray(x.blocks)) return null;
  const saine = (b) => !!b && typeof b === 'object' && adrProgresSaine(b.jeton) && /^0x[0-9a-f]{64}$/.test(String(b.sel))
    && Number.isSafeInteger(b.bloc) && b.bloc >= PLANCHER_ROUTEUR && /^0x[0-9a-fA-F]{64}$/.test(String(b.tx))
    && (b.routeur === undefined ? neDuRouteur(b.jeton, b.sel) : ROUTEURS_ANCIENS.includes(b.routeur) && neDuRouteur(b.jeton, b.sel, b.routeur));
  if (!x.blocks.every(saine)) return null;
  const ens = new Set(x.blocks.map((b) => b.jeton));
  if (!GRAINE_ROUTEUR.every((g) => g.bloc < x.depuis || g.bloc > x.jusqua || ens.has(g.jeton))) return null;
  return { jusqua: x.jusqua, blocks: x.blocks.map((b) => (b.routeur === undefined ? { jeton: b.jeton, sel: b.sel, bloc: b.bloc, tx: b.tx }
    : { jeton: b.jeton, sel: b.sel, routeur: b.routeur, bloc: b.bloc, tx: b.tx })) };
}
(function relireProgresIndex() {
  if (!FICHIER_PROGRES_INDEX || !existsSync(FICHIER_PROGRES_INDEX)) return;
  try {
    const brut = readFileSync(FICHIER_PROGRES_INDEX, 'utf8');
    if (brut.length > PROGRES_INDEX_MAX_OCTETS) { console.log('[progres-index] fichier trop gros (' + brut.length + ' octets) : ignore, la graine comme avant'); return; }
    const x = JSON.parse(brut);
    if (!x || typeof x !== 'object' || Array.isArray(x) || x.ver !== PROGRES_INDEX_VER) { console.log('[progres-index] fichier ignore (forme ou version) : la graine comme avant'); return; }
    const n = repriseNosAdmise(x.nos);
    if (n) {
      for (const b of n.blocks) nosBlocksEtat.blocks.add(b);
      nosBlocksEtat.depuis = n.depuis; nosBlocksEtat.jusqua = n.jusqua;
      if (nosBlocksEtat.graine === 'A_VERIFIER') nosBlocksEtat.graine = 'VOLUME';
      nosBlocksEtat.reprise = { depuis: n.depuis, jusqua: n.jusqua };
      nosBlocksEtat.repriseAVerifier = true; /* acquise seulement face a une tete lue (confronterReprise) */
      console.log('[nos-blocks] avancement relu du volume : [' + n.depuis + ', ' + n.jusqua + '], ' + nosBlocksEtat.blocks.size + ' block(s)'
        + (GRAINE_NOS.ok ? ' — remplace la graine (jusqua ' + GRAINE_NOS.jusqua + ')' : '') + ' ; a confronter a la tete au premier tour ; complet seulement apres une lecture propre jusqu a elle');
    } else if (x.nos) console.log('[nos-blocks] avancement du volume NON adopte (forme, comptes, plancher, entree de la graine absente, ou pas mieux que la graine) : la graine comme avant');
    const r = repriseRouteurAdmise(x.routeur);
    if (r) {
      for (const b of r.blocks) routeurEtat.blocks.set(b.jeton, b);
      routeurEtat.jusqua = r.jusqua;
      routeurEtat.reprise = { depuis: routeurEtat.depuis, jusqua: r.jusqua };
      routeurEtat.repriseAVerifier = true; /* acquise seulement face a une tete lue (confronterReprise) */
      console.log('[routeur] avancement relu du volume : [' + routeurEtat.depuis + ', ' + r.jusqua + '], ' + routeurEtat.blocks.size + ' block(s) — graine jusqua ' + GRAINE_JUSQUA + ' ; a confronter a la tete au premier tour');
    } else if (x.routeur) console.log('[routeur] avancement du volume NON adopte (forme, routeur, plancher, sel, entree de la graine absente, ou pas mieux que la graine) : la graine comme avant');
  } catch (err) { console.warn('[progres-index] fichier illisible, on repart de la graine : ' + err.message); }
})();

/* ══ QUI DETIENT UN BLOCK, ET QUELLE PART DE RECOMPENSE LUI REVIENDRAIT ═══════════════════════════
 * ⛔ MESURE QUI JUSTIFIE TOUT CECI (2026-09-20, 5 marches, reconstruction verifiee au wei pres) :
 *    le PoolManager detient 99,89 % de la supply d un block, parce que le lancement y place 99,9 %.
 *    Un prorata BRUT enverrait donc la recompense dans une pool que personne ne peut vider.
 *    `partsHolders` exclut une liste NOMMEE, et rend ce qui est exclu pour qu on puisse le dire.
 * ⛔ LE POT EST FICTIF : cet ecran montre des PROPORTIONS, il ne distribue rien.
 * ⛔⛔ SON ECHELLE DOIT ETRE PLUS FINE QUE TOUT VRAI POT. Mesure du 2026-09-20 : a 1 000 000 d unites,
 *    deux porteurs que le pot reel (3e14 wei) paierait 149 999 992 et 14 999 999 wei tombaient a une
 *    part de ZERO et disparaissaient de l ecran — l apercu et le paiement ne repondaient plus la meme
 *    chose. A 1e18, l ecart mesure est de zero oubli.
 * ⚠️ CACHE EN MEMOIRE : un redeploiement le vide et la reconstruction repart. C est dit par `lu`. */
const POT_FICTIF = 10n ** 18n;
const holdersCache = new Map(); /* jeton -> { soldes, naissance, jusqua, ratees, lu, enCours, rechercheNaissance } */
const HOLDERS_MAX = 200;

/* ⛔⛔ CE CACHE NE SURVIVAIT A AUCUN REDEPLOIEMENT, et c est ce que Phil a vu : « Reading every
 *     transfer of this block from its birth… (7) ». Le rejeu coute ~42 lectures et des dizaines de
 *     secondes PAR BLOCK ; il etait refait a froid apres chaque mise en ligne — huit fois rien que
 *     le 2026-09-25. Le magasin existait, il etait juste volatil.
 *   ⛔ MEME MOTIF QUE L ENTONNOIR ET LE TRENDING : volume /data, ecriture atomique (.tmp puis
 *     rename). On ne reinvente pas un mecanisme de persistance a cote de deux qui marchent.
 *   ⛔⛔ ET ON ECHOUE OUVERT, TOUJOURS. Sans volume (local, ou volume absent), tout se comporte
 *     exactement comme avant : memoire seule. Un incident passe de ce depot est un VOLUME PLEIN qui
 *     a corrompu une base — donc ici : rien ne jette, on borne le nombre d entrees, et un echec
 *     d ecriture ne doit jamais empecher une lecture de reussir.
 *   ⛔ ON NE GARDE QUE LES PASSES COMPLETES (`jusqua` pose et zero fenetre ratee). Persister une
 *     passe partielle la ferait revivre a chaque demarrage, et un etat incomplet ressuscite est
 *     pire qu un etat absent : il a l air d une mesure. */
/* ⛔⛔ LES CLES DE POOL, GARDEES POUR TOUJOURS — et c est legitime parce qu une PoolKey est
 *     IMMUABLE : le poolId est le hash de ses propres champs. Ce n est pas un cache de prix, c est
 *     un annuaire. Le prix, lui, est relu a chaque visite et n entre jamais ici.
 *   ⛔ POURQUOI CE FICHIER EXISTE. Mesure du 2026-09-26 : `/api/cle/` rendait « over rate limit »
 *     pour MUc — 806 446 $ de volume 24 h, pool v4 lisible par notre propre StateView. Sans cle, le
 *     client devine, et 432 combinaisons essayees a la main ne retrouvent pas le poolId. Resultat a
 *     l ecran : « Market unread … Use Retry », ou Retry retape la meme route etranglee.
 *     Le meme etranglement cassait AU MOINS trois autres ecrans le meme jour : « 5 window(s)
 *     refused » sur les detenteurs, « 17 window(s) refused » sur les blocks du visiteur, et la
 *     lecture de vie. UN seul point de defaillance, quatre ecrans muets.
 *   ⚠️ CE QUE CE FICHIER NE REPARE PAS : les trois autres ecrans, qui relisent des LOGS et non une
 *     cle. Le remede de fond leur appartient — un noeud a cle (`BASE_RPC` est deja une variable
 *     d environnement, donc c est une CONFIGURATION, pas du code). */
const FICHIER_CLES = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'cles-pool.json') : null;
const CLES_FICHIER_MAX_OCTETS = 2 * 1024 * 1024;
const clesCache = new Map();
let clesEcritureEnCours = false;

function ecrireCles() {
  if (!FICHIER_CLES || clesEcritureEnCours) return;
  clesEcritureEnCours = true;
  try {
    const payload = JSON.stringify([...clesCache]);
    /* ⛔ plutot rien qu un volume plein — meme borne dure que les detenteurs */
    if (payload.length > CLES_FICHIER_MAX_OCTETS) return;
    writeFileSync(FICHIER_CLES + '.tmp', payload);
    renameSync(FICHIER_CLES + '.tmp', FICHIER_CLES);
  } catch (err) { /* ⛔ une ecriture ratee ne casse pas une lecture : la memoire suffit */ }
  finally { clesEcritureEnCours = false; }
}

(function relireCles() {
  if (!FICHIER_CLES || !existsSync(FICHIER_CLES)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_CLES, 'utf8'));
    if (!Array.isArray(brut)) return;
    for (const [jeton, v] of brut) {
      /* ⛔ ON NE RECHARGE QUE DES SUCCES BIEN FORMES : un fichier abime ne doit pas injecter des
       *   cles vides qui feraient croire au client qu il a une reponse. */
      if (typeof jeton === 'string' && v && v.ok === true && Array.isArray(v.cles) && v.cles.length) {
        clesCache.set(jeton.toLowerCase(), { ok: true, cles: v.cles });
      }
    }
    console.log('[cles] ' + clesCache.size + ' cle(s) de pool relue(s) du volume');
  } catch (err) { console.warn('[cles] fichier illisible, on repart a vide : ' + err.message); }
})();
/* ⛔⛔ 2026-10-03 (mesure prod, build actions-v4-cles-lues) : le cache du volume passe AVANT clesPool, et il tenait pour 16 des 20
 *   actions une AUTRE pool (memestock a hook tiers, ou une seconde pool USDC moins profonde) — la pool USDC lue restait invisible
 *   de /api/cle et des rails. On FUSIONNE : chaque cle mesuree (clesPool, `mesure: true`) rejoint la liste du jeton si son poolId
 *   n y est pas ; rien n est retire, vieDuBlock choisit la meilleure parmi toutes. */
(function fusionnerClesMesurees() {
  let ajoutees = 0;
  for (const [t, r] of clesPool) {
    if (!r || r.mesure !== true) continue;
    const c = clesCache.get(t);
    if (!c) continue;
    for (const k of r.cles) if (!c.cles.some((x) => String(x.poolId).toLowerCase() === k.poolId)) { c.cles.push(k); ajoutees += 1; }
  }
  if (ajoutees) console.log('[cles] ' + ajoutees + ' cle(s) mesuree(s) ajoutee(s) aux entrees du volume');
})();

/* ══ LES VOIX DES BLOCKS (Raksha, 2026-10-02) — memoire + volume, meme discipline que les cles ══════ */
const FICHIER_VOIX = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'voix-blocks.json') : null;
const VOIX_FICHIER_MAX_OCTETS = 8 * 1024 * 1024;
const VOIX_CORPS_MAX = 16 * 1024;
const VOIX_POSTS_MINUTE = 60;
const VOIX_POSTS_IP_MINUTE = 6;
const VOIX_MAX_BLOCKS = 3000;
const voixParBlock = new Map();
const voixPosts = { minute: 0, n: 0, parIp: new Map() };
/* ══ LES ROLLS DU JEU, POUR LA MAP (Phil 2026-10-17 23:50 : « ajoute sur la Map quand un block fait un roll ») ══════════════════
 * ⛔ UN ROLL EST UN EVENEMENT HORS CHAINE (practice : le contrat BlockRolls n est pas deploye). Il ne va JAMAIS dans le fil Live
 *   (/api/live) : un evenement n est pas une transaction. Il a sa propre route, et la Map le dessine a part.
 * ⛔ EN MEMOIRE SEULE, et c est voulu : perdu au redemarrage, les 200 derniers, AUCUNE identite (ni wallet, ni invite, ni IP) —
 *   seulement {t, bloc, score}. Le plafond a 200 est l intention (une fenetre de signaux), pas une sauvegarde qui coupe. */
const JEU_ROLLS_MAX = 200;
const JEU_ROLLS_IP_MINUTE = 30;
const JEU_ROLL_CORPS_MAX = 256;
const jeuRolls = [];
const jeuRollPosts = { minute: 0, parIp: new Map() };
/* ══ NOS RAILS, EXPOSES (2026-10-03) — GET /api/rails/plan (rails-api.js) ══════════════════════════════════════════════
 * ⛔ UN PLAN COUTE DES DIZAINES DE LECTURES (marche, cotations, simulation de la transaction exacte) sur le MEME noeud que
 *   tout le site. Plafond global + par IP + deux en vol ; seul un plan PRET est rendu depuis le cache (15 s) — jamais une
 *   reponse APPROBATIONS : l agent qui vient de signer ses autorisations doit relire, pas recevoir l etat d avant.
 * ⛔ COMPTEURS REMIS A ZERO A CHAQUE DEPLOIEMENT, et nos propres sondes (`x-ms-monitor: 1`) comptees A PART. */
const RAILS_MINUTE = 20;
const RAILS_IP_MINUTE = 4;
const RAILS_EN_VOL_MAX = 2;
const RAILS_CACHE_MS = 15000;
const railsBudget = { minute: 0, n: 0, parIp: new Map() };
/* 2026-10-10 : la liste des marches TokenizedBank (API Morpho), en memoire ; une seule lecture en vol */
const banqueMarches = { r: null, t: 0, enVol: null };
/* les positions par compte (API Morpho) : 30 s, une lecture en vol par compte, 500 comptes au plus en memoire */
const banquePositions = new Map();
/* 2026-10-10 : les avoirs d un compte (/api/avoirs, avoirs.js). Les jetons lus : les devises Base du registre (hors ETH natif) et
 *   TOUTES les actions du registre ; publicnode d abord (lot de 71 servi entier, mesure du 2026-10-10), coupe en essai/TB_REPLIS=0. */
const avoirsParCompte = new Map();
let avoirsEnVol = 0;
const decimalesAvoirs = new Map();
const JETONS_AVOIRS = new Map([
  ...DEVISES_BASE.filter((d) => d.type !== 'NATIF' && d.chaines.includes(8453) && /^0x[0-9a-fA-F]{40}$/.test(d.adr))
    .map((d) => [d.adr.toLowerCase(), { symbole: d.symbole, action: false }]),
  ...ACTIONS_COINBASE.filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a.adr)).map((a) => [a.adr.toLowerCase(), { symbole: a.symbole, action: true }]),
]);
const NOEUDS_AVOIRS = [...new Set([...(ESSAI_SRV.actif || REPLIS_PUBLICS_COUPES ? [] : ['https://base-rpc.publicnode.com']), ...RPC_LIST])];
async function envoyerLotAvoirs(url, corps) {
  let r = null;
  try {
    r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) });
    const j = await r.json().catch(() => null);
    compterEnvoi(url, classeLot(r.status, j));
    return j;
  } catch (e) { if (!r) compterEnvoi(url, 'reseau'); throw e; }
}
const railsCache = new Map();
const railsCompteurs = { plans: 0, prets: 0, approbations: 0, refus: 0, nonMesures: 0, trop: 0, sondes: 0 };
let railsEnVol = 0;
/* ⛔⛔ MESURE EN PROD (2026-10-03, build rails-api-parole-devise) : 3 sondes sur 3 en NON_MESURE — « over rate limit » —
 *   sur le lecteur du serveur (deux endpoints, partages avec tous les scans du site), alors que les memes plans sortaient
 *   PRET depuis une autre machine. Les eth_call d un plan passent donc par la liste LARGE (quatre endpoints), PARAMETRES
 *   ENTIERS : `from`, `value` et les surcharges d etat comptent dans une simulation — `callLarge` les jette, et prend `0x`
 *   pour un echec. Un refus de la chaine (revert) n est PAS reessaye : c est une reponse, pas une panne. */
let idRails = 0;
async function rpcRails(methode, params) {
  compterAppel('rails', methode); /* game366 */
  if (methode !== 'eth_call') return rpcServeur(methode, params);
  let dernier = new Error('no endpoint tried');
  const ordreF = SANTE_RPC.ordonner(RPC_FAITS_POOL, tourFaits++, libelleNoeud); /* game362: available hosts first */
  for (let k = 0; k < RPC_FAITS_POOL.length * 2; k += 1) {
    const url = ordreF[k % ordreF.length];
    let compte = false; /* 2026-10-10 : chaque requete envoyee, comptee une fois par hote et par issue (compterEnvoi) */
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idRails, method: methode, params }) });
      const j = await r.json().catch(() => null);
      compte = true; compterEnvoi(url, classeEnvoi(r.status, j));
      /* ⛔ MESURE EN PROD (build rails-lecteur-large) : 2 sondes sur 3 « decimals or supply unread ». Un endpoint qui rend
       *   `0x` a un decimals() de B20 rend une NON-reponse : sur une LECTURE (sans `from`) on passe a l endpoint suivant.
       *   Une SIMULATION (avec `from`) peut legitimement rendre `0x` (execute du routeur) : c est une reponse. */
      const lecture = !(params && params[0] && params[0].from);
      if (j && !j.error && j.result !== undefined && !(lecture && j.result === '0x')) return j.result;
      if (j && !j.error && j.result === '0x') { dernier = new Error('empty answer to a read'); await new Promise((ok) => setTimeout(ok, 200 * (k + 1))); continue; }
      const msg = j && j.error ? String(j.error.message || 'rpc error') : 'HTTP ' + r.status;
      dernier = new Error(msg);
      if (j && j.error) dernier.data = j.error.data; /* 2026-10-11 : les octets du revert (NotEnoughLiquidity.) ne sont QUE la */
      /* 2026-10-25 (revue misables) : « block not found » (-32001, mainnet.base.org, un bloc qu il n a pas encore — la tete vient d un autre
       *   lecteur, 200 ms/bloc) est une panne de CE noeud, pas une reponse de la chaine : on passe a l endpoint suivant, sans `definitif`. */
      if (j && j.error && !/rate|limit|timeout|exceed|too many|capacity|unavailable|busy|block not found|header not found|unknown block/i.test(msg)) { dernier.definitif = true; throw dernier; }
    } catch (e) {
      if (!compte) compterEnvoi(url, 'reseau');
      if (e && e.definitif) throw e;
      dernier = e;
    }
    await new Promise((ok) => setTimeout(ok, 200 * (k + 1)));
  }
  /* game362: every public host failed on a read — one try on the keyed node (never for a definitive answer of the chain, never in test mode) */
  const secours = await secoursCle(methode, params);
  if (secours.ok) return secours.result;
  throw dernier;
}
async function secoursCle(methode, params) {
  if (!RELAIS_CLE || ESSAI_SRV.actif || methode !== 'eth_call') return { ok: false };
  const jour = new Date().toISOString().slice(0, 10);
  if (secoursCompte.jour !== jour) { secoursCompte.jour = jour; secoursCompte.appels = 0; secoursCompte.servis = 0; secoursCompte.refusBudget = 0; secoursCompte.echecs = 0; }
  if (secoursCompte.appels >= SECOURS_MAX_JOUR) { secoursCompte.refusBudget += 1; return { ok: false }; }
  secoursCompte.appels += 1;
  try {
    const r = await fetch(RELAIS_CLE, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++idRails, method: methode, params }) });
    const j = await r.json().catch(() => null);
    compterEnvoi(RELAIS_CLE, classeEnvoi(r.status, j));
    const lecture = !(params && params[0] && params[0].from);
    if (j && !j.error && j.result !== undefined && !(lecture && j.result === '0x')) { secoursCompte.servis += 1; return { ok: true, result: j.result }; }
  } catch (_) { compterEnvoi(RELAIS_CLE, 'reseau'); }
  secoursCompte.echecs += 1;
  return { ok: false };
}
/* ══ 2026-10-26 — LA CLE D UN BLOCK PAR SON poolId (cle-par-pool-id.js) ══════════════════════════════════════════════════════
 * ⛔⛔ MESURE (prod 20261025-game46) : /api/trending 194 lignes, 153 sans cle connue, 0 achetable ; ADOF REFUSE depuis ETH et USDC
 *   (« no initialized pool among the 15 keys read »). La cle se cherchait par PROFONDEUR depuis la tete (10 fenetres pour un plan,
 *   40 pour /api/cle) : une pool de plus de ~5 h n etait pas dans la fenetre d un plan. DexScreener rend deja son poolId et sa date.
 * ⇒ `indicesPoolId` : jeton -> [{ poolId, creeLeMs }], rempli a chaque tour de /api/trending depuis les paires BRUTES (v4 seulement :
 *   pairAddress de 66 caracteres). `clesParIndices(jeton)` lit, pour chaque indice, le bloc de la date puis UN getLogs Initialize filtre
 *   par ce poolId (lecteurLogs : budget d archive epuise, la fenetre profonde n est pas envoyee -> NON_LUE). Une cle LUE rejoint
 *   clesCache (cles-pool.json) : /api/cle, les rails et le Buy de Market la voient.
 * ⛔ « NON LUE » N EST PAS « ABSENTE » : une NON_LUE n est jamais retenue (relue au prochain appel) ; une absence pres de la date
 *   (ABSENTE_PRES_DE_LA_DATE) ou un poolId qui n est pas celui du jeton (HORS_JETON) est retenu CLES_PAR_ID_ABSENCE_MS, puis relu —
 *   et ni l une ni l autre ne dit « ce block n a pas de pool » : la recherche par profondeur d avant reste derriere, inchangee. */
const indicesPoolId = new Map();
const INDICES_POOL_ID_MAX = 5000;
const clesParIdVerdicts = new Map(); /* poolId -> { t, r } : seulement ABSENTE_PRES_DE_LA_DATE / HORS_JETON (une LUE vit dans clesCache) */
const CLES_PAR_ID_ABSENCE_MS = 6 * 3600 * 1000;
const clesParIdEnVol = new Map();
/** retient les indices d un tour de /api/trending (les paires BRUTES de DexScreener) pour les jetons suivis */
function retenirIndicesPoolId(paires, suivis) {
  for (const [t, l] of indicesPoolIdDepuisPaires(paires, suivis)) { indicesPoolId.delete(t); indicesPoolId.set(t, l); }
  while (indicesPoolId.size > INDICES_POOL_ID_MAX) indicesPoolId.delete(indicesPoolId.keys().next().value);
}
/** une cle LUE rejoint clesCache du jeton (dedoublonnee par poolId) et le volume */
function garderCleLue(jeton, cle) {
  const t = String(jeton).toLowerCase();
  const cur = clesCache.get(t);
  const cles = cur && Array.isArray(cur.cles) ? cur.cles.slice() : [];
  if (cles.some((c) => String(c && c.poolId || '').toLowerCase() === cle.poolId)) return;
  /* marquee : une cle d indice S AJOUTE a la recherche par profondeur, elle ne la dispense pas (entreeComplete) */
  cles.push({ ...cle, source: 'poolId' });
  clesCache.set(t, { ok: true, cles });
  ecrireCles();
}
/* ⛔⛔ 2026-10-26 (revue, finding 4) — UNE CLE D INDICE NE MASQUE PAS LA RECHERCHE PAR PROFONDEUR. Gardee dans clesCache, elle faisait
 *   rendre a clesRails, /api/cle et createurDuBlock CET ensemble seul, pour toujours (cles-pool.json) : une pool template recente (NOTRE
 *   hook) que DexScreener n indique pas restait cachee derriere la pool a hook etranger de l indice. Desormais une entree n est
 *   « complete » (servie sans chercher) que si elle tient au moins une cle qui ne vient PAS d un indice (profondeur, mesuree, ou une
 *   entree d avant ce jour, qui n a pas la marque) ; sinon la recherche par profondeur tourne (ses propres caches et budget) et
 *   l UNION est rendue : d abord ses cles (l ordre d avant), puis celles des indices ; rien n est retire. */
const estCleIndice = (c) => !!c && c.source === 'poolId';
const entreeComplete = (e) => !!e && Array.isArray(e.cles) && e.cles.some((c) => c && !estCleIndice(c));
function unionCles(profondes, autres) {
  const out = [], vus = new Set();
  for (const c of [...(Array.isArray(profondes) ? profondes : []), ...(Array.isArray(autres) ? autres : [])]) {
    const id = String(c && c.poolId || '').toLowerCase();
    if (!c || (id && vus.has(id))) continue;
    if (id) vus.add(id);
    out.push(c);
  }
  return out;
}
/** les cles trouvees par profondeur rejoignent l entree du jeton (union, gardee sur le volume) ; rend l union */
function garderUnion(t, profondes) {
  const cur = clesCache.get(t);
  const cles = unionCles(profondes, cur && Array.isArray(cur.cles) ? cur.cles : []);
  if (cles.length) { clesCache.set(t, { ok: true, cles }); ecrireCles(); }
  return cles;
}
async function cleParUnIndice(jeton, ind) {
  const id = ind.poolId;
  const v = clesParIdVerdicts.get(id);
  if (v && Date.now() - v.t < CLES_PAR_ID_ABSENCE_MS) return { ...v.r, depuisCache: true };
  if (clesParIdEnVol.has(id)) return clesParIdEnVol.get(id);
  const p = (async () => {
    let tete;
    try { tete = parseInt(await rpcServeur('eth_blockNumber', []), 16); } catch (_) { tete = NaN; }
    if (!Number.isSafeInteger(tete) || tete <= 0) return { etat: 'NON_LUE', poolId: id, pourquoi: 'chain head not read' };
    const r = await clePoolParId({ rpc: rpcServeur, rpcLogs: lecteurLogs(tete).rpc, poolId: id, jeton, creeLeMs: ind.creeLeMs, tete });
    if (r.etat === 'LUE') garderCleLue(jeton, r.cle);
    else if (r.etat === 'ABSENTE_PRES_DE_LA_DATE' || r.etat === 'HORS_JETON') {
      clesParIdVerdicts.delete(id); clesParIdVerdicts.set(id, { t: Date.now(), r });
      if (clesParIdVerdicts.size > INDICES_POOL_ID_MAX) clesParIdVerdicts.delete(clesParIdVerdicts.keys().next().value);
    }
    return r;
  })().finally(() => clesParIdEnVol.delete(id));
  clesParIdEnVol.set(id, p);
  return p;
}
/** Les cles d un jeton lues par ses indices poolId : { cles, etats } (etats : un par indice essaye ; [] sans indice). Ne leve pas. */
async function clesParIndices(jeton) {
  const t = String(jeton || '').toLowerCase();
  const cles = [], etats = [];
  const deja = new Map([clesCache.get(t), clesPool.get(t)].flatMap((s) => (s && Array.isArray(s.cles) ? s.cles : [])).map((c) => [String(c && c.poolId || '').toLowerCase(), c]));
  for (const ind of indicesPoolId.get(t) || []) {
    if (deja.has(ind.poolId)) { etats.push({ etat: 'LUE', poolId: ind.poolId, cle: deja.get(ind.poolId), depuisCache: true }); cles.push(deja.get(ind.poolId)); continue; }
    let r;
    try { r = await cleParUnIndice(t, ind); } catch (e) { r = { etat: 'NON_LUE', poolId: ind.poolId, pourquoi: String((e && e.message) || e).slice(0, 100) }; }
    etats.push(r);
    if (r.etat === 'LUE' && r.cle) cles.push(r.cle);
  }
  return { cles, etats };
}
/** Le tour de /api/trending : les lignes SANS cle connue qui ont un indice, lues une a une (au plus CLES_PAR_ID_PAR_TOUR jetons). */
const CLES_PAR_ID_PAR_TOUR = 40;
let clesParIdDernier = null, clesParIdEnCours = false;
async function resoudreClesParIndices(lignes) {
  const compte = { essayees: 0, lues: 0, absentes: 0, horsJeton: 0, nonLues: 0, sansIndice: 0, reportees: 0 };
  for (const l of Array.isArray(lignes) ? lignes : []) {
    const t = String(l && l.adr || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(t)) continue;
    if (!indicesPoolId.has(t)) { if (!clesConnuesServeur(t).length) compte.sansIndice += 1; continue; }
    /* un jeton dont TOUS les poolId indiques sont deja connus n est pas relu ; une cle connue AUTRE (ex. une pool non ETH) ne
     *   dispense pas de lire la pool que le fil de marche voit */
    const connus = new Set([clesCache.get(t), clesPool.get(t)].flatMap((s) => (s && Array.isArray(s.cles) ? s.cles : [])).map((c) => String(c && c.poolId || '').toLowerCase()));
    if (indicesPoolId.get(t).every((x) => connus.has(x.poolId))) continue;
    if (compte.essayees >= CLES_PAR_ID_PAR_TOUR) { compte.reportees += 1; continue; }
    compte.essayees += 1;
    const { etats } = await clesParIndices(t);
    if (etats.some((e) => e.etat === 'LUE')) compte.lues += 1;
    else if (etats.some((e) => e.etat === 'NON_LUE')) compte.nonLues += 1;
    else if (etats.some((e) => e.etat === 'HORS_JETON') && !etats.some((e) => e.etat === 'ABSENTE_PRES_DE_LA_DATE')) compte.horsJeton += 1;
    else compte.absentes += 1;
  }
  return compte;
}
/** Lance la recherche des lignes sans cle EN FOND (non attendue, une seule a la fois), sous SA propre etiquette d archive.
 *  ⛔ 2026-10-26 (revue, finding 6) : lancee depuis le tour de trending, elle heritait de son etiquette — ses getLogs profonds se
 *    comptaient dans « fond trending » (parQui / refusParQui / nonEnvoyeesParQui de /sante). « fond cles poolId » les dit a part. */
function lancerClesParIndicesEnFond(lignes) {
  if (clesParIdEnCours) return;
  clesParIdEnCours = true;
  const aChercher = (Array.isArray(lignes) ? lignes : []).map((l) => ({ adr: l && l.adr }));
  void consommateurArchive.run('fond cles poolId', () => resoudreClesParIndices(aChercher))
    .then((c) => { clesParIdDernier = { ...c, fini: new Date().toISOString() }; })
    .catch((e) => { clesParIdDernier = { erreur: String((e && e.message) || e).slice(0, 100), fini: new Date().toISOString() }; })
    .finally(() => { clesParIdEnCours = false; });
}

/** La cle exacte d un block : le cache de /api/cle d abord, sinon ses indices poolId (2026-10-26) ET une recherche COURTE (10 fenetres,
 *  pas 40) — l union. Une entree faite des seules cles d indice n est pas complete : la recherche courte tourne encore (finding 4). */
async function clesRails(a) {
  const k = String(a || '').toLowerCase();
  const c = clesCache.get(k);
  if (entreeComplete(c)) return c.cles;
  let indices = c && Array.isArray(c.cles) ? c.cles : [];
  if (!indices.length) {
    try { indices = (await clesParIndices(k)).cles; } catch (_) { indices = []; /* indices illisibles : la recherche courte seule */ }
  }
  try {
    const r = await resoudreClePool(k, 10);
    if (r && r.ok === true && Array.isArray(r.cles) && r.cles.length) return garderUnion(k, r.cles);
  } catch (_) { /* cle illisible : vieDuBlock essaie ses cles standard et dit s il n a pas lu */ }
  return indices;
}

/* ── LE MARCHE D UN BLOCK LU PAR LE SERVEUR : GET /api/marche/0x… (2026-10-04) ───────────────────────────────────────────────
 * POURQUOI. Le cerveau d un block ne recevait que la lecture faite DEPUIS LE NAVIGATEUR, sur des noeuds publics. Mesure du jour, dans
 *   le panneau de commande ouvert sur IB022 : 10 reponses 429 (mainnet.base.org ×8, base.drpc.org ×2), `etatVie: null`, « Market on
 *   chain: not read yet », et la porte des taches qui refuse tout echange — pendant que la sonde du SERVEUR lisait ce meme marche
 *   (/sante.sondes.marche : PRET, 0.00163 ETH). Un echec de NOTRE lecture cote navigateur, affiche comme un etat du block.
 * CE QUE C EST. Le MEME lecteur (`vieDuBlock`, marche.js) sur les noeuds des rails. Le navigateur ne l appelle QUE si sa propre lecture
 *   n a pas abouti. ⛔ On ne garde en memoire que les FAITS MESURES (`LUE`, `NON_TROUVEE`), 30 s ; un `NON_LUE` n est jamais cache.
 * ⛔ BORNES : 3 lectures en vol au plus (au-dela : 429), une seule par block a la fois, 400 blocks en memoire. */
const marchesServeur = new Map(), marchesEnCours = new Map();
let marchesEnVol = 0;
async function lireMarcheServeur(token) {
  const c = marchesServeur.get(token);
  if (c && Date.now() - c.t < 30000) return { ...c.r, depuisCache: true };
  if (marchesEnCours.has(token)) return marchesEnCours.get(token);
  if (marchesEnVol >= 3) return { ok: false, occupe: true, etat: 'NON_LUE', pourquoi: 'the market reader is busy — try again in a moment' };
  marchesEnVol += 1;
  const p = (async () => {
    try {
      const v = await vieDuBlock({ rpc: rpcRails, stateView: V4_ADRESSES[8453].stateView, jeton: token, clesExactes: await clesRails(token) });
      const k = v && v.cle ? { currency0: String(v.cle.currency0), currency1: String(v.cle.currency1), fee: Number(v.cle.fee), tickSpacing: Number(v.cle.tickSpacing), hooks: String(v.cle.hooks) } : null;
      const r = { ok: true, etat: String((v && v.etat) || 'NON_LUE'), vie: v && typeof v.vie === 'number' && Number.isFinite(v.vie) ? v.vie : null,
        devise: v && v.devise ? String(v.devise) : null, via: v && v.via ? String(v.via) : null, pourquoi: v && v.pourquoi ? String(v.pourquoi).slice(0, 200) : null,
        cle: k, liquidite: v && v.liquidite !== null && v.liquidite !== undefined ? String(v.liquidite) : null,
        decimales: v && Number.isInteger(v.decimales) ? v.decimales : null, lu: new Date().toISOString(), source: 'server' };
      if (r.etat === 'LUE' || r.etat === 'NON_TROUVEE') {
        if (marchesServeur.size >= 400) marchesServeur.delete(marchesServeur.keys().next().value);
        marchesServeur.set(token, { t: Date.now(), r });
      }
      return r;
    } catch (e) {
      return { ok: false, etat: 'NON_LUE', pourquoi: String((e && e.message) || e).slice(0, 120) };
    } finally { marchesEnVol -= 1; marchesEnCours.delete(token); }
  })();
  marchesEnCours.set(token, p);
  return p;
}

/* ── LE MULTIPLICATEUR B20 ET LA REFERENCE CHAINLINK D UNE ACTION : GET /api/actions/reference/0x… (2026-10-09) ─────────────
 * CE QUE C EST. `lireReferenceAction` (reference-action.js) sur les noeuds des rails : le registre d oracles de l emetteur
 *   (multiplicateur + pause), la mise a jour programmee du jeton (ERC-8056) et le feed Chainlink publie par docs.base.org.
 *   LECTURE SEULE : rien n est signe, rien n est envoye.
 * ⛔ TROIS ETATS par partie (LU / NON_LU / NON_DISPONIBLE). On ne garde en memoire QUE ce qui a ete LU en entier (multiplicateur
 *   ET reference lus, ou reference NON_DISPONIBLE), 60 s ; un NON_LU n est jamais cache — il se relit a la demande suivante.
 * ⛔ BORNES : 3 lectures en vol au plus (au-dela : 429), une seule par jeton a la fois, 120 jetons en memoire, 5 eth_call par
 *   lecture. Une adresse hors du registre des actions ne coute AUCUN appel (NON_DISPONIBLE). */
const referencesServeur = new Map(), referencesEnCours = new Map();
let referencesEnVol = 0;
/* /api/fly/price/: last live pool price per stock (bounded by the pool table, ~40 entries) */
const flyPrices = new Map(), flyPricesInFlight = new Map();
function lirePrixMouche(token) {
  const entry = POOLS_ACTIONS_AERODROME.get(token);
  if (!entry) return Promise.resolve({ ok: false, why: 'not a stock of the measured pool table' });
  const hit = flyPrices.get(token);
  if (hit && Date.now() - hit.t < 8000) return Promise.resolve({ ...hit.r, cached: true });
  if (!flyPricesInFlight.has(token)) {
    flyPricesInFlight.set(token, readPoolPrice({ rpc: rpcRails, pool: entry.pool, token })
      .then((p) => { const r = { ok: true, token, symbol: entry.symbole, pool: entry.pool, ...p, readAt: new Date().toISOString(), source: 'Aerodrome CL slot0' };
        flyPrices.set(token, { t: Date.now(), r }); return r; })
      .catch((e) => ({ ok: false, why: 'price not read: ' + String((e && e.message) || e).slice(0, 120) }))
      .finally(() => flyPricesInFlight.delete(token)));
  }
  return flyPricesInFlight.get(token);
}

/* ── THE SHARED FLY (2026-11-08) ──────────────────────────────────────────────────────────────────────────────────────────────
 * The page's fly lives in each visitor's browser; this one lives in the server and trains on SNDKc (the most traded stock, Coinbase
 * 24 h volume 2026-11-07) every minute, whether anyone watches or not. SAME code as the page (fly-core.js).
 * ⛔ RPC BUDGET: one stock, one window a minute, sharing the 20 s activity cache and the 8 s price cache with visitors; a window whose
 *   price or trades are not read is skipped (nothing taught on a guess) and the next one waits 5 minutes. FLY_SERVER=off stops it.
 * 2026-11-08 (Phil : « ajoute lui une memoire persistante ») : its memory (synapses, tally, paper book, counters, last events) is kept on
 *   the Railway volume after every read window and reloaded at boot, so a deploy no longer makes it naive. Without a volume it says so
 *   (`persisted: false`) and stays volatile. Written atomically (.tmp then rename), like faits-pool.json. */
const FICHIER_MOUCHE = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'mouche-partagee.json') : null;
const MOUCHE = { symbol: 'SNDKc', fly: null, shadow: null, foresight: null, session: null, events: [], aliveSince: null, trainingSince: null, restored: false, windows: 0, windowsRead: 0, windowsMissed: 0, why: null, saveError: null };
function etatMoucheServeur() {
  if (!MOUCHE.fly) return { ok: false, why: MOUCHE.why || 'not started' };
  const m = MOUCHE.fly.exportMemory();
  return { ok: true, symbol: MOUCHE.symbol, aliveSince: MOUCHE.aliveSince, trainingSince: MOUCHE.trainingSince, persisted: !!FICHIER_MOUCHE && !MOUCHE.saveError,
    restored: MOUCHE.restored, saveError: MOUCHE.saveError, windows: MOUCHE.windows, windowsRead: MOUCHE.windowsRead, windowsMissed: MOUCHE.windowsMissed,
    weakened: m.filter((x) => x < 99900).length, session: MOUCHE.session.state(), events: MOUCHE.events.slice(-40), foresight: MOUCHE.foresight };
}
function sauverMouche() {
  if (!FICHIER_MOUCHE) return;
  try {
    const x = { v: 1, symbol: MOUCHE.symbol, trainingSince: MOUCHE.trainingSince, windows: MOUCHE.windows, windowsRead: MOUCHE.windowsRead, windowsMissed: MOUCHE.windowsMissed,
      memory: MOUCHE.fly.exportMemory(), session: MOUCHE.session.state(), events: MOUCHE.events.slice(-120), savedAt: new Date().toISOString() };
    writeFileSync(FICHIER_MOUCHE + '.tmp', JSON.stringify(x)); renameSync(FICHIER_MOUCHE + '.tmp', FICHIER_MOUCHE);
    MOUCHE.saveError = null;
  } catch (e) { MOUCHE.saveError = String((e && e.message) || e).slice(0, 120); }
}
function chargerMouche() {
  if (!FICHIER_MOUCHE || !existsSync(FICHIER_MOUCHE)) return;
  try {
    const x = JSON.parse(readFileSync(FICHIER_MOUCHE, 'utf8'));
    if (!x || x.v !== 1 || x.symbol !== MOUCHE.symbol || !Array.isArray(x.memory)) return;
    /* the trace (smells still waiting for their lessons) only if the save is recent: a smell of an hour ago is not taught by today's move */
    MOUCHE.fly.importMemory(x.memory); MOUCHE.session.restore(Date.now() - Date.parse(x.savedAt) < 600000 ? x.session : { ...x.session, recent: [] });
    MOUCHE.events = Array.isArray(x.events) ? x.events.slice(-120) : [];
    for (const k of ['windows', 'windowsRead', 'windowsMissed']) if (Number.isFinite(x[k])) MOUCHE[k] = x[k];
    if (x.trainingSince) MOUCHE.trainingSince = x.trainingSince;
    MOUCHE.restored = true;
  } catch (e) { MOUCHE.why = null; MOUCHE.saveError = 'memory not reloaded: ' + String((e && e.message) || e).slice(0, 100); }
}
async function fenetreMouche() {
  const token = [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === MOUCHE.symbol);
  if (!token) { MOUCHE.why = MOUCHE.symbol + ' not in the pool table'; return 3600000; }
  const [price, ac] = await Promise.all([lirePrixMouche(token[0]), lireActiviteServeur(token[0]).catch(() => null)]);
  MOUCHE.windows++;
  if (!price || !price.ok || !ac || !ac.ok || !Array.isArray(ac.transactions)) { MOUCHE.windowsMissed++; return 300000; }
  MOUCHE.windowsRead++;
  MOUCHE.session.window({ symbol: MOUCHE.symbol, price, transactions: ac.transactions });
  MOUCHE.fly.drain();
  /* Laplace's demon at this scale: the fly's NEXT decision, computed on a shadow copy per scenario of the coming move (never the market) */
  try { MOUCHE.foresight = { at: Date.now(), ...foreseeNext(MOUCHE.shadow, MOUCHE.fly, MOUCHE.session) }; } catch (e) { MOUCHE.foresight = { at: Date.now(), exact: false, scenarios: [], why: String((e && e.message) || e).slice(0, 100) }; }
  sauverMouche();
  return 60000;
}
/* the autonomous fly's relay guard (fly-relay.js): only calls this server planned, withdraw transfers, plain ETH sends */
const GARDE_MOUCHE = createRelayGuard({ usdc: USDC_BASE, isStock: (a) => !!POOLS_ACTIONS_AERODROME.get(a), transferSelector: selecteurSrv('transfer(address,uint256)') });
/* per IP and per minute, for each fly route */
const FLY_BUDGET = { minute: -1, parIp: new Map() }, FLY_LIMITES = { account: 60, estimate: 30, relay: 12, receipt: 60 };
function budgetMouche(req, route) {
  const m = Math.floor(Date.now() / 60000);
  if (FLY_BUDGET.minute !== m) { FLY_BUDGET.minute = m; FLY_BUDGET.parIp.clear(); }
  const k = ipClient(req) + '|' + route, n = (FLY_BUDGET.parIp.get(k) || 0) + 1;
  if (n > FLY_LIMITES[route]) return false;
  FLY_BUDGET.parIp.set(k, n); return true;
}
async function compteMouche(adresse, token) {
  const mot = adresse.slice(2).toLowerCase().padStart(64, '0'), bal = selecteurSrv('balanceOf(address)') + mot;
  const [nonce, blk, eth, usdc, stock] = await Promise.all([
    rpcServeur('eth_getTransactionCount', [adresse, 'pending']), rpcServeur('eth_getBlockByNumber', ['latest', false]), rpcServeur('eth_getBalance', [adresse, 'latest']),
    rpcRails('eth_call', [{ to: USDC_BASE, data: bal }, 'latest']), token ? rpcRails('eth_call', [{ to: token, data: bal }, 'latest']) : Promise.resolve(null)]);
  /* 09/11 (Phil's live fly: "Cannot convert undefined to a BigInt"): a node that answers nothing (rate limit) gave undefined; every value is
   *   checked and the one missing is NAMED, so the page knows it is a read that failed, not the chain refusing */
  const hex = (v, what) => { if (typeof v !== 'string' || !/^0x[0-9a-f]*$/i.test(v) || v === '0x') throw new Error('the node did not answer ' + what); return BigInt(v); };
  if (!blk || typeof blk !== 'object') throw new Error('the node did not answer the latest block');
  return { ok: true, address: adresse, nonce: hex(nonce, 'the nonce').toString(), baseFeePerGas: hex(blk.baseFeePerGas, 'the base fee').toString(), block: Number(hex(blk.number, 'the block number')),
    eth: hex(eth, 'the ETH balance').toString(), usdc: hex(usdc, 'the USDC balance').toString(), stock: token ? hex(stock, 'the stock balance').toString() : null, token: token || null };
}
function lireCorpsMouche(req, max) {
  return new Promise((ok, ko) => { let brut = '', trop = false;
    req.on('data', (c) => { if (trop) return; brut += c; if (brut.length > max) { trop = true; ko(new Error('request too large')); req.destroy(); } });
    req.on('end', () => { if (trop) return; try { ok(JSON.parse(brut)); } catch (_) { ko(new Error('JSON body expected')); } });
    req.on('error', ko); });
}
/* 2026-11-09 TBLOCK proof of hold (tblock-hold.js). The price pair (now, ~10 min ago) is cached 60 s: it costs a block search.
 * Challenges are single-use and expire; one invite per wallet per 24 h. The bot token and chat id are env secrets, never logged. */
/* tgCodes: one-time code -> { tgId, exp } (made when someone opens the bot in private); approved: String(tgId) -> { wallet, exp }
 * (the account that passed the proof; its join request to the private channel is the only one accepted). In memory: a deploy
 * forgets them and the person simply runs /hold again. */
/* tgGroup: String(tgId) -> the group chat id where that account sent /hold (game322: where the bot puts the "TBLOCK Holder" tag) */
const TB_HOLD = { prices: null, at: 0, pending: null, challenges: new Map(), invited: new Map(), tgCodes: new Map(), approved: new Map(), tgGroup: new Map() };
function tbNewTgCode(tgId) {
  const now = Date.now();
  for (const [k, c] of TB_HOLD.tgCodes) if (c.exp < now) TB_HOLD.tgCodes.delete(k);
  if (TB_HOLD.tgCodes.size > 5000) return null;
  const code = randomBytes(12).toString('hex');
  TB_HOLD.tgCodes.set(code, { tgId: String(tgId), exp: now + 900000 });
  return code;
}
async function tbTelegram(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token) return null;
  return fetch('https://api.telegram.org/bot' + token + '/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null);
}
const tbLire = (to, data, b) => rpcRails('eth_call', [{ to, data }, '0x' + Number(b).toString(16)]);
/* game372 Step B: block timestamps share horodatageBloc's cache (successful reads only, 5000-entry FIFO); a failed read is NaN as before */
const tbLireTs = async (n) => { const ts = await horodatageBloc(Number(n)); return ts === null ? NaN : ts; };
async function tbPrices() {
  /* ⛔ game340: a read where only the ~10-min-ago price failed was NEVER kept, so every visitor paid the whole read again (13 s
   *   measured locally, the archive read timing out each time) and the TBLOCK price button showed "not read". A whole read is kept
   *   60 s; a read with the current price but no older one 20 s (the hold rule still sees the missing price and stays fail-closed). */
  if (TB_HOLD.prices && Number.isFinite(TB_HOLD.prices.now.usd)
    && Date.now() - TB_HOLD.at < (Number.isFinite(TB_HOLD.prices.prev.usd) ? 60000 : 20000)) return TB_HOLD.prices;
  if (!TB_HOLD.pending) {
    const lirePrix = async () => {
      const tete = Number(BigInt(await rpcServeur('eth_blockNumber', [])));
      /* game372 Step B: the last answer's 10-min block is the hint (recentBlockAt: <= 4 timestamp reads when it holds, else the full search) */
      const p = await tbReadPrices({ lire: tbLire, lireTs: tbLireTs, tete, hint: TB_HOLD.prices && TB_HOLD.prices.before });
      TB_HOLD.prices = p; TB_HOLD.at = Date.now();
      return p;
    };
    /* game372 Step 0: a request keeps its own label; a read with no label is counted as 'fond prix tblock' */
    TB_HOLD.pending = (consommateurArchive.getStore() ? lirePrix() : consommateurArchive.run('fond prix tblock', lirePrix)).finally(() => { TB_HOLD.pending = null; });
  }
  return TB_HOLD.pending;
}
async function tbHoldOf(wallet) {
  const prices = await tbPrices();
  return tbReadHold({ lire: tbLire, lireTs: tbLireTs, tete: prices.tete, wallet, prices });
}
/* game329: TBLOCK out of circulation (tblock-burn.js). A whole read is kept 60 s, a failed one 10 s so an outage is not paid per visitor. */
const TB_BURN = { val: null, until: 0, pending: null };
function tbBurn() {
  if (TB_BURN.val && Date.now() < TB_BURN.until) return Promise.resolve(TB_BURN.val);
  if (!TB_BURN.pending) {
    TB_BURN.pending = (async () => {
      let b;
      try {
        const tete = Number(BigInt(await rpcServeur('eth_blockNumber', [])));
        b = await tbReadBurn({ lire: tbLire, block: tete });
      } catch (e) { b = { ok: false, state: 'NOT_READ', why: 'the chain did not answer: ' + String((e && e.message) || e).slice(0, 100) }; }
      TB_BURN.val = b; TB_BURN.until = Date.now() + (b.ok ? 60000 : 10000);
      return b;
    })().finally(() => { TB_BURN.pending = null; });
  }
  return TB_BURN.pending;
}
/* the bot token is never printed: only 'registered' / the reason without the URL */
async function tbRegisterWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '', secret = process.env.TELEGRAM_WEBHOOK_SECRET || '', base = process.env.TELEGRAM_WEBHOOK_BASE || 'https://tokenizedblock.space';
  if (!token || !secret) return 'off (TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET not both set)';
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(secret)) return 'off (TELEGRAM_WEBHOOK_SECRET must be 16+ letters, digits, _ or -)';
  const r = await fetch('https://api.telegram.org/bot' + token + '/setWebhook', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ url: base + '/api/tblock/telegram-webhook', secret_token: secret, allowed_updates: ['message', 'chat_join_request'], drop_pending_updates: true }) });
  const j = await r.json().catch(() => null);
  return j && j.ok ? 'registered' : 'refused: ' + String((j && j.description) || r.status).slice(0, 80);
}
function tbSecretOk(got) {
  const want = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET || ''), g = Buffer.from(String(got || ''));
  return want.length >= 16 && g.length === want.length && timingSafeEqual(g, want);
}
function tbChallenge(wallet) {
  const now = Date.now();
  for (const [k, c] of TB_HOLD.challenges) if (c.exp < now) TB_HOLD.challenges.delete(k);
  if (TB_HOLD.challenges.size > 5000) return null;
  const nonce = randomBytes(12).toString('hex'), issuedIso = new Date(now).toISOString();
  TB_HOLD.challenges.set(nonce, { wallet: String(wallet).toLowerCase(), issuedIso, exp: now + TB_CHALLENGE_TTL_S * 1000 });
  return { nonce, issuedIso, message: tbHoldMessage({ wallet, nonce, issuedIso }) };
}
function demarrerMoucheServeur() {
  if (process.env.FLY_SERVER === 'off' || ESSAI_SRV.actif) { MOUCHE.why = 'switched off on this server'; return; }
  try {
    const circuit = JSON.parse(readFileSync(join(ici, 'fly-brain-circuit.json'), 'utf8'));
    MOUCHE.fly = createFly(circuit); MOUCHE.shadow = createFly(circuit);
    /* 09/11: one decision per window fitted to the stock (fly-core 'auto'), like the page; the countdown events are not kept */
    MOUCHE.session = createSession(MOUCHE.fly, (e) => {
      if (e.type === 'gathering') return;
      const ev = { ...e, at: Date.now() }; if (Array.isArray(ev.top)) ev.top = ev.top.slice(0, 5);
      MOUCHE.events.push(ev); if (MOUCHE.events.length > 120) MOUCHE.events.splice(0, MOUCHE.events.length - 120);
    }, { windowMs: 'auto' });
    MOUCHE.aliveSince = MOUCHE.trainingSince = new Date().toISOString();
    chargerMouche();
  } catch (e) { MOUCHE.why = 'circuit not loaded: ' + String((e && e.message) || e).slice(0, 120); return; }
  const cycle = () => fenetreMouche().catch(() => { MOUCHE.windowsMissed++; return 300000; }).then((ms) => { const t = setTimeout(cycle, ms); if (t.unref) t.unref(); });
  /* 3 min apres le boot : pas au milieu des sondes de /sante (45 s) ni des prechauffages, que le noeud public limite deja (game293 :
   *   sonde echange en 429 au 1er passage, quand la mouche lisait aussi a +20 s) */
  const debut = Number(process.env.FLY_START_MS); /* reglable pour un essai local ; 3 min par defaut */
  const t = setTimeout(cycle, Number.isFinite(debut) && debut >= 0 ? debut : 180000); if (t.unref) t.unref();
}
async function lireReferenceServeur(token) {
  const c = referencesServeur.get(token);
  if (c && Date.now() - c.t < 60000) return { ...c.r, depuisCache: true };
  if (referencesEnCours.has(token)) return referencesEnCours.get(token);
  if (!estActionCoinbase(token)) return { ok: true, ...(await lireReferenceAction({ rpc: rpcRails, jeton: token })) };
  if (referencesEnVol >= 3) return { ok: false, occupe: true, pourquoi: 'the reference reader is busy — try again in a moment' };
  referencesEnVol += 1;
  const p = (async () => {
    try {
      const r = { ok: true, ...(await lireReferenceAction({ rpc: rpcRails, jeton: token })) };
      const complet = r.multiplicateur.etat === 'LU' && (r.reference.etat === 'LU' || r.reference.etat === 'NON_DISPONIBLE');
      if (complet) {
        if (referencesServeur.size >= 120) referencesServeur.delete(referencesServeur.keys().next().value);
        referencesServeur.set(token, { t: Date.now(), r });
      }
      return r;
    } catch (e) {
      return { ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) };
    } finally { referencesEnVol -= 1; referencesEnCours.delete(token); }
  })();
  referencesEnCours.set(token, p);
  return p;
}
/* ── L ETAT DES DEVISES DE PAIRE DE CREATE, LU UNE FOIS POUR TOUS : GET /api/paires/etat (2026-10-04) — etat-paires.js ──────────
 * POURQUOI. Des devises sans une seule unite en circulation restaient choisissables a Create (sim fork des 62 devises du hook 7030).
 *   Les griser depuis le NAVIGATEUR coutait 62 `totalSupply` par chargement sur des noeuds deja en 429, et une lecture ratee y valait
 *   « pas nee » : un noeud muet grisait tout sauf ETH (le motif des puces 13 -> 2 du 2026-09-29). Le serveur lit donc UNE fois, garde
 *   le resultat 5 minutes, et rend TROIS etats par devise : born (supply lue > 0), not_born (zero lu deux fois, avec un temoin dans la
 *   meme passe), not_read (tout le reste — jamais un verdict). L ecran ne grise que sur not_born.
 * ⛔ LA LISTE EST CELLE DE L ECRAN (`pairesProposees(8453)`, sans le natif) — 62 devises ce jour, les memes que DEVISES_ADMISES_7030 ;
 *   elle n est pas recopiee ici. Le lecteur est celui des rails (liste LARGE, `0x` = non-reponse pour une lecture).
 * MESURE (2026-10-04, le module contre le fork local base-anvil, bloc 52 137 185, lecture seule) : 42 born, 20 not_born, 0 not_read,
 *   82 `eth_call` (62 + les 20 zeros relus), 7,6 s. Les 20 sont exactement les « 20 a supply NULLE » notees dans paires.js le
 *   2026-10-03 (SOUNc, la 21e, a bien 843 unites).
 * ⛔ BORNES (dans le module, comptees par test-etat-paires-20261004.mjs) : 4 lectures a la fois, une passe a la fois, coupee apres
 *   3 echecs d affilee, pas de nouvelle passe avant 2 min apres une passe incomplete. /sante.paires lit la memoire, sans rien lire
 *   sur la chaine. ⛔ PAS MESURE : cette route en production (noeuds publics, depuis l IP de Railway) — ni sa duree, ni son taux
 *   de « not_read » sous 429. La premiere reponse apres un redemarrage attend la passe 8 s au plus ; au-dela elle part en
 *   `enCours: true` et l ecran relit 20 s plus tard. */
/* ⛔ 2026-10-09 : les paires que Create PROPOSE (regle du hook), pas tout le registre — douze actions y sont hors du hook 7030 */
const etatPaires = creerEtatPaires({ rpc: rpcRails, paires: () => pairesLancables(8453, OPTIONS_LANCEMENT) });

/* ── QUI BOUGE CE BLOCK, EN DIRECT : GET /api/activite/0x… (2026-10-04) ──────────────────────────────────────────────────────
 * Phil, devant l onglet Market du panneau (il listait les echanges d AUTRES blocks) : « l onglet Market est propre au block actuel —
 *   on doit voir qui interagit avec CE block en direct ».
 * CE QUE C EST. Les `Transfer` emis PAR LE JETON LUI-MEME (filtre `address` = le jeton : un contrat tiers ne peut pas les forger),
 *   groupes par transaction, les plus recentes d abord. ⛔ Un evenement n est pas une transaction : le SIGNATAIRE de chaque ligne
 *   est lu sur la transaction (`eth_getTransactionByHash`.from), jamais deduit du `from` d un Transfer. Non lu = null, et dit.
 * ⛔ BORNES, RENDUES AVEC LA REPONSE : la fenetre balayee (300 blocs, elargie a 999 puis 2 997 si moins de 12 transactions),
 *   12 transactions au plus, 6 mouvements par transaction. Cache 20 s ; 3 lectures en vol au plus ; une seule par block a la fois. */
const TOPIC_TRANSFER_SRV = topicSrv('Transfer(address,address,uint256)');
const activitesServeur = new Map(), activitesEnCours = new Map();
let activitesEnVol = 0;
/* ⛔ MESURE (local, 2026-10-04) : sur `rpcServeur` (2 noeuds, partages avec tout le site) cette lecture rendait « over rate limit ».
 *   Elle tourne donc sur une liste PLUS LARGE et ne retente pas le meme noeud : un noeud qui refuse, on passe au suivant.
 *   La tete est reculee de 2 blocs pour qu un noeud legerement en retard sache servir la fenetre. */
const RPC_ACTIVITE = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : [...new Set([...RPC_LIST, 'https://base-rpc.publicnode.com', 'https://base.drpc.org'])];
let tourActivite = 0;
async function rpcActivite(methode, params) {
  let dernier = new Error('no endpoint tried');
  for (let k = 0; k < RPC_ACTIVITE.length; k += 1) {
    const url = RPC_ACTIVITE[tourActivite++ % RPC_ACTIVITE.length];
    let r = null, compte = false; /* 2026-10-10 : chaque requete envoyee, comptee une fois par hote et par issue (compterEnvoi) */
    try {
      r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
      const j = await r.json();
      compte = true; compterEnvoi(url, classeEnvoi(r.status, j));
      if (j && !j.error && j.result !== undefined) return j.result;
      dernier = new Error(String((j && j.error && j.error.message) || 'rpc error').slice(0, 100));
    } catch (e) {
      if (!compte) compterEnvoi(url, classeEnvoi(r ? r.status : 0, null, r === null || /abort|timeout/i.test(String(e && e.name))));
      dernier = e;
    }
  }
  throw dernier;
}
async function lireActiviteServeur(token) {
  const c = activitesServeur.get(token);
  if (c && Date.now() - c.t < 20000) return { ...c.r, depuisCache: true };
  if (activitesEnCours.has(token)) return activitesEnCours.get(token);
  if (activitesEnVol >= 3) return { ok: false, occupe: true, pourquoi: 'the activity reader is busy — try again in a moment' };
  activitesEnVol += 1;
  const p = (async () => {
    try {
      const tete = parseInt(await rpcActivite('eth_blockNumber', []), 16) - 2;
      const enHex = (x) => '0x' + x.toString(16);
      const parTx = new Map();
      let balaye = 0, fin = tete;
      for (const taille of [300, 699, 999, 999]) {
        const deb = fin - taille + 1;
        const logs = await rpcActivite('eth_getLogs', [{ fromBlock: enHex(deb), toBlock: enHex(fin), address: token, topics: [TOPIC_TRANSFER_SRV] }]);
        balaye += taille; fin = deb - 1;
        for (const l of (Array.isArray(logs) ? logs : [])) {
          if (!l || !Array.isArray(l.topics) || l.topics.length < 3 || String(l.address).toLowerCase() !== token) continue;
          const h = String(l.transactionHash);
          if (!parTx.has(h)) parTx.set(h, { tx: h, bloc: parseInt(l.blockNumber, 16), mouvements: [] });
          let montant = null;
          try { montant = BigInt(String(l.data).slice(0, 66)).toString(); } catch (_) { montant = null; }
          parTx.get(h).mouvements.push({ de: '0x' + String(l.topics[1]).slice(26).toLowerCase(), vers: '0x' + String(l.topics[2]).slice(26).toLowerCase(), montant, i: parseInt(l.logIndex, 16) });
        }
        if (parTx.size >= 12) break;
      }
      const txs = [...parTx.values()].sort((a, b) => b.bloc - a.bloc || b.mouvements[0].i - a.mouvements[0].i).slice(0, 12);
      /* ⛔ MESURE (1er jet, 12 lectures en parallele sur les noeuds publics) : 9 signataires sur 12 revenaient null — le noeud etranglait
       *   la rafale. Les transactions se lisent donc TROIS par trois, avec une seconde tentative ; un signataire non lu reste null. */
      const lireTx = async (t) => {
        t.mouvements = t.mouvements.sort((a, b) => a.i - b.i).slice(0, 6).map(({ de, vers, montant }) => ({ de, vers, montant }));
        t.signataire = null; t.cible = null;
        for (let essai = 0; essai < 2 && t.signataire === null; essai += 1) {
          try {
            const x = await rpcActivite('eth_getTransactionByHash', [t.tx]);
            t.signataire = x && /^0x[0-9a-fA-F]{40}$/.test(String(x.from)) ? String(x.from).toLowerCase() : null;
            t.cible = x && /^0x[0-9a-fA-F]{40}$/.test(String(x.to)) ? String(x.to).toLowerCase() : null;
          } catch (_) { /* seconde tentative, puis null */ }
        }
      };
      for (let i = 0; i < txs.length; i += 3) await Promise.all(txs.slice(i, i + 3).map(lireTx));
      /* les pools de ce jeton que NOUS connaissons : le PoolManager v4, et sa pool Aerodrome mesuree s il en a une. Le client dit
       *   « bought » / « sold » par rapport a elles ; un mouvement qui ne touche aucune d elles reste « moved ». */
      const aero = POOLS_ACTIONS_AERODROME.get(token);
      /* 2026-10-23 DENIM : sParBloc = temps de bloc MESURE (null si non mesure) — l app en tire « N min », jamais blocs * 2.
       *   2026-11-05 : le temps SERVI (sParBlocServi), pas la mesure longue seule (2 s gardees ~10 min apres la bascule) */
      const r = { ok: true, block: token, tete, fenetreBlocs: balaye, sParBloc: sParBlocServi(), pools: [PM_V4.toLowerCase(), ...(aero ? [String(aero.pool).toLowerCase()] : [])],
        transactions: txs, lu: new Date().toISOString() };
      if (activitesServeur.size >= 200) activitesServeur.delete(activitesServeur.keys().next().value);
      activitesServeur.set(token, { t: Date.now(), r });
      return r;
    } catch (e) {
      return { ok: false, pourquoi: 'activity not read: ' + String((e && e.message) || e).slice(0, 120) };
    } finally { activitesEnVol -= 1; activitesEnCours.delete(token); }
  })();
  activitesEnCours.set(token, p);
  return p;
}

/* ── LES SKINS ACHETEES : UN INDEX DE TRANSACTIONS (2026-10-04, skins.js) ─────────────────────────────────────────────────────
 * L achat est UNE transaction sur la chaine : transfer(wallet des frais, 1 USDC) + memo `tb-skin:1:<block>:<recette>`. Le serveur ne
 *   detient rien et ne decide rien : il VERIFIE la transaction et son recu (verifierAchatSkin) puis garde une ligne
 *   { tx, bloc, payeur, block, recette } — un index, que n importe qui peut refaire en relisant la chaine.
 *   GET  /api/skins/prix            (2026-11-11) HOW TO BUY TODAY: the active BlockSkins contract, its price and the USDC contract,
 *                                   then an exact approve + mint(block, packed skin) (blockskins-actif.js skinsPrixCorps). It names
 *                                   no beneficiary and no memo: the contract fixes both. The transfer + memo rail below is LEGACY.
 *   GET  /api/skins/<block>         LEGACY pre-contract index: the skins paid by transfer + memo for this block (most recent first)
 *   GET  /api/skins/de/<account>    LEGACY pre-contract index: one buyer's last transfer + memo skin per block
 *   POST /api/skins/achat           LEGACY { tx, block, skin } -> checked on chain, then recorded (idempotent per transaction)
 * ⛔ Une transaction pas encore lisible (noeud en retard) rend NON_LU : le client reessaie ; ce n est jamais un refus.
 * ⛔ BORNES : 2 000 lignes en memoire et sur le volume, 3 verifications en vol ; sans volume, l index vit le temps du processus
 *   (la chaine, elle, garde tout : une ligne perdue se reenregistre avec le meme hash). */
const FICHIER_SKINS = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'skins-achetees.json') : null;
const skinsAchats = new Map();
let skinsEnVol = 0;
(function relireSkins() {
  if (!FICHIER_SKINS || !existsSync(FICHIER_SKINS)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_SKINS, 'utf8'));
    for (const l of (Array.isArray(brut) ? brut : [])) {
      /* ⛔ on ne recharge que des lignes BIEN FORMEES : un fichier abime ne doit pas inventer un achat */
      if (l && /^0x[0-9a-f]{64}$/.test(String(l.tx)) && /^0x[0-9a-f]{40}$/.test(String(l.payeur)) && /^0x[0-9a-f]{40}$/.test(String(l.block)) && validerRecette(l.recette).ok) skinsAchats.set(l.tx, l);
    }
  } catch (_) { /* fichier illisible : l index repart vide, la chaine garde les achats */ }
})();
function ecrireSkins() {
  if (!FICHIER_SKINS) return;
  try { writeFileSync(FICHIER_SKINS + '.tmp', JSON.stringify([...skinsAchats.values()].slice(-2000))); renameSync(FICHIER_SKINS + '.tmp', FICHIER_SKINS); }
  catch (_) { /* une ecriture ratee ne casse pas la reponse : la ligne est en memoire, et sur la chaine */ }
}
async function enregistrerAchatSkin({ tx, block, skin }) {
  const h = String(tx || '').toLowerCase(), b = String(block || '').toLowerCase(), vr = validerRecette(skin);
  if (!/^0x[0-9a-f]{64}$/.test(h)) return { ok: false, etat: 'REFUSE', pourquoi: 'tx must be a whole transaction hash' };
  if (!/^0x[0-9a-f]{40}$/.test(b)) return { ok: false, etat: 'REFUSE', pourquoi: 'block must be a whole address' };
  if (!vr.ok) return { ok: false, etat: 'REFUSE', pourquoi: vr.pourquoi };
  const deja = skinsAchats.get(h);
  /* idempotent : la meme transaction rend la meme ligne — et ne peut PAS etre reenregistree pour un autre block ou une autre skin */
  if (deja) return deja.block === b && JSON.stringify(deja.recette) === JSON.stringify(vr.recette) ? { ok: true, etat: 'ENREGISTRE', achat: deja, deja: true }
    : { ok: false, etat: 'REFUSE', pourquoi: 'this transaction already paid for another skin or another block' };
  if (skinsEnVol >= 3) return { ok: false, etat: 'NON_LU', occupe: true, pourquoi: 'the skin registry is busy — try again in a moment' };
  skinsEnVol += 1;
  try {
    let t = null, recu = null;
    try { [t, recu] = await Promise.all([rpcActivite('eth_getTransactionByHash', [h]), rpcActivite('eth_getTransactionReceipt', [h])]); } catch (_) { t = null; recu = null; }
    const v = verifierAchatSkin({ tx: t, recu, usdc: USDC_BASE, beneficiaire: FEE_WALLET, block: b, recette: vr.recette });
    if (!v.ok) return { ok: false, etat: v.etat, pourquoi: v.pourquoi };
    /* 2026-11-11: a v1 payment mined at or after the BlockSkins v2 deployment block (read from the record) is not recorded */
    const jv = jugerBlocSkinV1(v.bloc, COUPURE_SKINS_V1);
    if (!jv.ok) return { ok: false, etat: jv.etat, pourquoi: jv.pourquoi };
    const achat = { tx: h, bloc: v.bloc, payeur: v.payeur, block: b, recette: vr.recette, t: new Date().toISOString() };
    if (skinsAchats.size >= 2000) skinsAchats.delete(skinsAchats.keys().next().value);
    skinsAchats.set(h, achat); ecrireSkins();
    return { ok: true, etat: 'ENREGISTRE', achat };
  } finally { skinsEnVol -= 1; }
}
const skinsDuBlock = (b) => [...skinsAchats.values()].filter((l) => l.block === b).reverse().slice(0, 20);

/* ══ LA NAISSANCE PAR UN AGENT + LE MCP (2026-10-04) — naissance-api.js, mcp-tblock.js, caution-createur.js ════════════════════
 * ⛔ RIEN N EST SIGNE ICI : des appels NON SIGNES, simules avant d etre rendus. Le wallet de l agent signe.
 * ⛔ MEME BUDGET QUE LES RAILS (une naissance planifiee = ~20 lectures + une simulation, sur les noeuds de tout le site). */
const naissanceCompteurs = { plans: 0, prets: 0, refus: 0, nonMesures: 0, trop: 0, mcp: 0 };
/** Vrai = le budget est pris (a rendre par railsEnVol -= 1). Faux = occupe. */
function prendreBudgetPlan(ip) {
  const minute = Math.floor(Date.now() / 60000);
  if (railsBudget.minute !== minute) { railsBudget.minute = minute; railsBudget.n = 0; railsBudget.parIp.clear(); }
  const nIp = (railsBudget.parIp.get(ip) || 0) + 1;
  if (nIp > RAILS_IP_MINUTE || railsBudget.n >= RAILS_MINUTE || railsEnVol >= RAILS_EN_VOL_MAX) return false;
  railsBudget.parIp.set(ip, nIp);
  railsBudget.n += 1;
  railsEnVol += 1;
  return true;
}
/* eth_simulateV1 : mesure le 2026-10-04 — mainnet.base.org, publicnode et drpc l executent (surcharge de solde comprise) ; un
 *   endpoint qui ne le connait pas ou qui limite n est PAS une reponse : on passe au suivant. Un resultat (tableau) est la
 *   reponse, meme quand un appel y est en 0x0. Toute autre methode : le lecteur des rails. */
const RPC_SIMULATION = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org'];
let tourSim = 0;
async function rpcNaissance(methode, params) {
  if (methode !== 'eth_simulateV1') return rpcRails(methode, params);
  compterAppel('simulation', methode); /* game366 */
  let dernier = new Error('no endpoint tried');
  const ordreS = SANTE_RPC.ordonner(RPC_SIMULATION, tourSim++, libelleNoeud); /* game362 */
  for (let k = 0; k < RPC_SIMULATION.length * 2; k += 1) {
    const url = ordreS[k % ordreS.length];
    let compte = false; /* 2026-10-10 : chaque requete envoyee, comptee une fois par hote et par issue (compterEnvoi) */
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++idRails, method: methode, params }) });
      const j = await r.json().catch(() => null);
      compte = true; compterEnvoi(url, classeEnvoi(r.status, j));
      if (j && Array.isArray(j.result)) return j.result;
      dernier = new Error(j && j.error ? String(j.error.message || 'rpc error') : 'HTTP ' + r.status);
      /* « insufficient funds » est une REPONSE de la chaine (le compte ne peut pas payer) : inutile de la redemander ailleurs */
      if (/insufficient funds/i.test(dernier.message)) throw dernier;
    } catch (e) { if (!compte) compterEnvoi(url, 'reseau'); dernier = e; if (/insufficient funds/i.test(String(e && e.message))) throw e; }
    await new Promise((ok) => setTimeout(ok, 250 * (k + 1)));
  }
  throw dernier;
}
/* le prix en dollars que l ECRAN lirait : l ETH sur ses pools (prix-eth.js), une devise par notre propre /api/prix-usd (meme
 *   chiffre, meme cache). null = non lu : le plan s arrete en NON_MESURE, il n invente pas un minimum. */
let prixEthCache = { t: 0, usd: null };
async function prixUsdPourPlan(adr) {
  if (adr === null) {
    if (prixEthCache.usd !== null && Date.now() - prixEthCache.t < 60000) return prixEthCache.usd;
    try {
      const r = await prixEthUsd({ rpc: rpcRails, stateView: V4_ADRESSES[8453].stateView });
      if (r && r.etat === 'LU' && Number.isFinite(r.usd) && r.usd > 0) { prixEthCache = { t: Date.now(), usd: r.usd }; return r.usd; }
    } catch (_) { /* non lu */ }
    return null;
  }
  try {
    const d = await fetch('http://127.0.0.1:' + PORT + '/api/prix-usd?adr=' + encodeURIComponent(String(adr).toLowerCase()),
      { signal: AbortSignal.timeout(15000), headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
    return d && d.ok === true && Number(d.prixUsd) > 0 ? Number(d.prixUsd) : null;
  } catch (_) { return null; }
}
const selAleatoireServeur = () => 'block-' + randomBytes(8).toString('hex');
async function faireNaissance(demande, { sonde = false, soldeSuppose = null } = {}) {
  if (!sonde) naissanceCompteurs.plans += 1;
  const r = await planNaissance(demande, { rpc: rpcNaissance, prixUsd: prixUsdPourPlan, selAleatoire: selAleatoireServeur, chaine: 8453, soldeSuppose });
  if (!sonde) {
    if (r.etat === 'PRET') naissanceCompteurs.prets += 1;
    else if (r.etat === 'REFUSE') naissanceCompteurs.refus += 1;
    else naissanceCompteurs.nonMesures += 1;
  }
  return r;
}
async function faireRail(demande) {
  try { chargerIndexRouteur(JSON.parse(blocksRouteurCorps())); chargerNosBlocksTb(JSON.parse(nosBlocksCorps())); } catch (_) { /* sources non lues : fail-closed */ }
  /* ⛔ 2026-10-10 (e0b346d simule chaque plan Aerodrome par eth_simulateV1) : rpcNaissance, pas rpcRails — rpcRails n envoie que
   *   eth_call a sa liste large et passe le reste a rpcServeur (RPC_LIST : base.org, +1 231 refus de debit en 23 min mesures, et
   *   developer-access, DNS mort) ; rpcNaissance envoie eth_simulateV1 a RPC_SIMULATION (base.org, publicnode, drpc : les trois
   *   l executent, mesure depuis une page le 2026-10-10) et TOUT LE RESTE a rpcRails, comme avant. */
  const r = await planRail(demande, { rpc: rpcNaissance, clesDe: clesRails, chaine: 8453, reference: lireReferenceServeur, venueAction: venueActionServie, venueStable: venueStableServie });
  if (!sourcesTbLues() && r.etat === 'REFUSE') r.sourcesTb = 'not read on the server: router index or our-blocks list incomplete or stale — a block born elsewhere is refused until they are';
  return r;
}
/** Le minimum du createur d un block ne sur le hook 7030 : l etat lu, et l appel NON SIGNE de la prochaine etape de sortie. */
async function faireCaution({ block, pair, account }) {
  const hook = DESCRIPTEUR_7030.adresse;
  const devise = !pair || /^eth$/i.test(pair) ? '0x0000000000000000000000000000000000000000' : String(pair).toLowerCase();
  const cle = cleMarcheCreateur({ bloc: String(block).toLowerCase(), devise, hook });
  let maintenantSec = Math.floor(Date.now() / 1000);
  try { const b = await rpcRails('eth_getBlockByNumber', ['latest', false]); if (b && b.timestamp) maintenantSec = parseInt(b.timestamp, 16); } catch (_) { /* l horloge du serveur */ }
  const etat = await etatCautionCreateur({ rpc: rpcRails, hook, cle, maintenantSec });
  const sortie = account ? sortieCautionPour({ etat, compte: account, hook, cle }) : { appel: null, pourquoi: 'no account given: state only' };
  const j = (v) => (typeof v === 'bigint' ? v.toString() : v);
  return { ok: etat.etat === 'LUE', etat: etat.etat === 'NON_MESURE' ? 'NON_MESURE' : etat.etat === 'AUCUN' ? 'REFUSE' : 'PRET', pourquoi: etat.pourquoi || null,
    marche: { block: String(block).toLowerCase(), paire: devise, hook: hook.toLowerCase() },
    minimum: etat.etat === 'LUE' ? { createur: etat.createur, depose: j(etat.depose), minimum: j(etat.minimum), partActive: etat.partActive, phase: etat.phase,
      retraitDes: etat.retraitDes, secondesRestantes: etat.secondesRestantes, delaiSec: etat.delaiSec } : null,
    aSigner: sortie.appel ? [sortie.appel] : [], etape: sortie.etape || null, pourquoiPasDAppel: sortie.appel ? null : sortie.pourquoi,
    borne: 'state read at one block; the call is unsigned and NOT simulated here. A request stops the 0.03% creator share at once; the withdrawal opens 7 days later.' };
}
function pairesPourAgent() {
  return { ok: true, etat: 'PRET', frais: { naissanceEthWei: '1000000000000000', note: '0.001 ETH: 0.0007 at creation + 0.0003 at registration' },
    paires: pairesDeNaissance(8453).map((p) => { const pl = plancher7030(p.adr); return { adresse: p.adr, symbole: p.symbole, type: p.type, plancherMinimumCreateur: pl === null ? null : pl.toString() }; }),
    note: 'plancherMinimumCreateur = the contract floor of the creator minimum, in raw units of that currency; the amount asked at birth is the larger of that floor and about $1 at today’s price',
    /* 2026-10-11 (QA Grok M7) : `paires` = les devises de NAISSANCE ; un agent ne voyait aucun ECHANGE de devises. Derives de la route 6. */
    echanges: echangesDevisesAnnonces(),
    /* ⛔ revue adverse (2026-10-11, confirmee par 2 sceptiques) : « any Coinbase tokenized stock » etait FAUX - mesure prod du meme soir,
     *   achat de 20 USDC : 41/71 construits, 25 refuses (aucune pool), 5 non mesures (pool v4 vide). La phrase dit la regle, pas un chiffre. */
    noteEchanges: 'echanges = currency swaps tblock_plan_swap builds, both ways (OUSD against USDC only). Tokenized stocks: tblock_plan_swap also plans ETH or USDC to a Coinbase tokenized stock and back, only where that stock has a readable market; many listed here have none yet - it then answers REFUSE (no market) or NON_MESURE (not read), never a guess.' };
}
/* ── LA SONDE DE SANTE DE LA NAISSANCE (2026-10-04) ──────────────────────────────────────────────────────────────────────
 * ⛔⛔ POURQUOI : le 2026-10-03 un drapeau a route toutes les naissances vers un hook dont l inscription exigeait un sel que l app
 *   n envoyait pas — TOUS les Create refuses pendant ~5 h, et /sante disait ok. Cette sonde planifie ET SIMULE une naissance
 *   entiere (createPaid + approbations + inscription + ouverture) contre le hook deploye, avec le code DEPLOYE, depuis un compte
 *   de sonde au solde SUPPOSE (aucun fonds reel, rien d envoye). Son verdict est dans /sante.naissance : PRET, ou la raison.
 * ⛔ BORNE : paire ETH seulement (un minimum en devise ne se suppose pas), simulation et non execution, toutes les 10 minutes. */
/* ── LA TELECOMMANDE (2026-10-04) : les sessions de panneau, en memoire (panel-sessions.js) ── */
const registrePanel = creerRegistrePanel({ tirerId: () => randomBytes(16).toString('hex') });
/* le panneau vit DANS l app (extension de l onglet Brain : memes donnees que le cerveau de l app) ; panel.html y conduit les anciens liens */
const URL_PANEL = 'https://tokenizedblock.space/app.html?panel=1';
function ouvrirPanel(block) {
  const r = registrePanel.ouvrir({ block });
  if (!r.ok) return r;
  return { ok: true, session: r.session, url: URL_PANEL + '#s=' + r.session + (block ? '&b=' + String(block).toLowerCase() : ''),
    note: 'the link is for the user: it opens the control panel, where their own wallet signs. The session lasts 2 hours without activity and is lost if the server restarts.' };
}
/* le panneau interroge toutes les 2 s : 30 requetes/min par panneau ouvert. 240/min par adresse laisse plusieurs panneaux et l agent. */
const panelBudget = { minute: 0, parIp: new Map() };
function budgetPanel(ip) {
  const minute = Math.floor(Date.now() / 60000);
  if (panelBudget.minute !== minute) { panelBudget.minute = minute; panelBudget.parIp.clear(); }
  const n = (panelBudget.parIp.get(ip) || 0) + 1;
  panelBudget.parIp.set(ip, n);
  return n <= 240;
}
const COMPTE_SONDE = '0x00000000000000000000000000000000c0ffee77';
let naissanceSonde = { etat: 'PAS_ENCORE', pourquoi: 'not run yet', lu: null };
async function sonderNaissance() {
  try {
    const r = await faireNaissance({ nom: 'Probe', symbole: 'PROBE', compte: COMPTE_SONDE, paire: 'ETH', sel: 'sonde-' + Date.now() }, { sonde: true, soldeSuppose: 10n ** 17n });
    naissanceSonde = { etat: r.etat, pourquoi: r.pourquoi || null, lu: new Date().toISOString(),
      fraisEthWei: r.cout ? r.cout.fraisEthWei : null, totalEthWei: r.cout ? r.cout.totalEthWei : null, hook: r.block ? r.block.hook : null, appels: (r.aSigner || []).length };
  } catch (e) { naissanceSonde = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 160), lu: new Date().toISOString() }; }
}
/* ── LES TROIS AUTRES SONDES (Phil, 2026-10-04 : « fais pareil pour le brain, le market et le trade, avec ce que l app fait deja ») ──
 * Meme principe que la naissance : le code DEPLOYE, contre la chaine, toutes les 10 minutes, rien d envoye.
 *   marche  : vieDuBlock (le lecteur de l app) sur un block de reference dont le marche existe — doit rendre LUE ;
 *   echange : planRail ETH -> ce block depuis le compte de sonde — doit rendre PRET (le planificateur simule la transaction) ;
 *   cerveau : le reseau de l app (cerveau.js) nourri de CE marche, 24 battements — doit etre dans une phase vivante et sa porte
 *             (brain-tasks.js) doit accepter « trade ». Un cerveau qui refuserait tout echange sur un marche lu est une panne.
 * ⛔ BORNES : UN block de reference (IB022, cote en ETH sur notre hook) — une sonde verte ne dit rien des autres blocks ; des
 *   plans simules, pas des executions ; le cerveau de la sonde n a ni memoire ni nourriture (celui d un visiteur en a). */
const BLOCK_SONDE = '0xb200000000000000000000e4b0c5fbe9c8df579e';
let tamSrv = null; /* TAM phase C : cree au premier appel de /api/tam/* (tam-serveur.js) */
let autresSondes = { marche: { etat: 'PAS_ENCORE' }, echange: { etat: 'PAS_ENCORE' }, cerveau: { etat: 'PAS_ENCORE' } };
async function sonderLeReste() {
  const lu = new Date().toISOString();
  let v = null;
  try {
    v = await vieDuBlock({ rpc: rpcRails, stateView: V4_ADRESSES[8453].stateView, jeton: BLOCK_SONDE, clesExactes: await clesRails(BLOCK_SONDE) });
    autresSondes.marche = { etat: v && v.etat === 'LUE' ? 'PRET' : (v && v.etat) || 'NON_MESURE', pourquoi: v && v.etat !== 'LUE' ? (v.pourquoi || null) : null, vie: v && typeof v.vie === 'number' ? v.vie : null, devise: (v && v.devise) || null, lu };
  } catch (e) { autresSondes.marche = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120), lu }; }
  try {
    /* ⛔ MESURE (prod, 1er passage) : depuis le compte de sonde VIDE le planificateur repond « not enough ETH in your wallet » — une
     *   reponse juste, mais qui ne dit rien du chemin. La sonde simule donc depuis une adresse qui DETIENT de l ETH (le contrat WETH
     *   de Base, 0x4200…0006) : rien n est signe ni envoye, c est le `from` d une simulation. Resultat mesure : PRET. */
    const r = await faireRail({ de: 'ETH', vers: BLOCK_SONDE, montant: '100000000000000', compte: '0x4200000000000000000000000000000000000006' });
    autresSondes.echange = { etat: r.etat, pourquoi: r.pourquoi || null, route: r.route || null, appels: (r.aSigner || []).length, lu };
  } catch (e) { autresSondes.echange = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120), lu }; }
  try {
    const faits = { vie: v && v.etat === 'LUE' && typeof v.vie === 'number' ? v.vie : null, vieAvant: null, etatVie: v ? (v.etat === 'REFUSEE' ? 'NON_LUE' : v.etat) : 'NON_LUE' };
    let e = etatInitialCerveau(BLOCK_SONDE), vu = null;
    for (let i = 0; i < 24; i += 1) { const r = pasCerveau(e, faits); e = r.etat; vu = r.vu; }
    const snap = snapshotCerveau({ address: BLOCK_SONDE, symbole: 'IB022', vu, etat: e, journal: [], nourriture: null, vie: faits.vie, etatVie: faits.etatVie, marche: { etatVie: faits.etatVie, vie: faits.vie } });
    const g = tacheAutorisee('trade_tblock', snap);
    autresSondes.cerveau = { etat: g.ok ? 'PRET' : 'REFUSE', pourquoi: g.ok ? null : (g.pourquoi || null), phase: vu ? vu.phase : null, battements: e.tick, lu };
  } catch (e) { autresSondes.cerveau = { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120), lu }; }
}
/* 2026-10-04 — LES SONDES SE COUPENT PAR `TB_SONDES=0`. Elles partent 45 s apres le demarrage et lisent la chaine par les noeuds du
 *   serveur ; un banc qui demarre une copie du serveur contre un noeud FICTIF dont il compte les lectures (test-graine-nos-blocks-r9b)
 *   les recevait aussi : elles n ont rien a y faire, il les coupe. En production la variable n existe pas : sondes actives.
 *   ⛔ CE QUE JE N AI PAS PROUVE : que ce banc etait rouge A CAUSE d elles. Il est reste rouge une fois les sondes coupees, sur un KO
 *   different a chaque passage (C1, P1, mutant n24) — cause NON trouvee ; dit dans le compte rendu, pas masque. */
/* 2026-10-11 : apres CHAQUE deploiement, le 1er passage (45 s apres le boot) tombait sur un 429 du noeud public (« Public endpoint rate
 *   limit ») et 3 sondes sur 4 restaient fausses 10 min - mesure en prod a 17:43 et 18:25, cascade marche NON_LUE -> echange NON_MESURE
 *   -> cerveau REFUSE ; retablies au passage suivant. UNE relecture 90 s plus tard quand une sonde n a pas pu LIRE (NON_LUE / NON_MESURE) :
 *   jamais sur un refus mesure (REFUSE), jamais plus d une fois par passage (le noeud qui refuse est en limite de debit). */
const SONDE_RELECTURE_MS = 90000;
const sondeNonLue = (e) => e === 'NON_LUE' || e === 'NON_MESURE';
function passageSondes(relecture = false) {
  consommateurArchive.run(relecture ? 'fond sondes (relecture)' : 'fond sondes', () => sonderNaissance().then(sonderLeReste).then(() => {
    const rate = sondeNonLue(naissanceSonde && naissanceSonde.etat) || sondeNonLue(autresSondes.marche.etat) || sondeNonLue(autresSondes.echange.etat);
    if (rate && !relecture) setTimeout(() => passageSondes(true), SONDE_RELECTURE_MS).unref();
  }));
}
if (process.env.TB_SONDES !== '0') setTimeout(() => { passageSondes(); setInterval(() => passageSondes(), 10 * 60 * 1000).unref(); }, 45000).unref();
/* ── LE WIDGET MCP (mcp-widget-panneau.html) : le paquet officiel ext-apps 2.0.3 est EMBARQUE et inline (un bac a sable de chat
 *   bloque tout script distant). Son `export{…}` final devient `globalThis.ExtApps={…}` — la reecriture du guide officiel.
 *   ⛔ Empreinte VERIFIEE au demarrage : un paquet altere ou absent = pas de widget (les outils marchent sans lui). */
const WIDGET_BUNDLE_SHA256 = 'fb56376b7583ecafb4820bdebc150abee18feb6258ff84b83c2c944ebd9c3602';
let widgetHtml = null;
try {
  const brut = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mcp-ext-apps-2.0.3.bundle.js'));
  if (createHash('sha256').update(brut).digest('hex') === WIDGET_BUNDLE_SHA256) {
    const bundle = brut.toString('utf8').replace(/export\{([^}]+)\};?\s*$/, (_, corps) => 'globalThis.ExtApps={'
      + corps.split(',').map((p) => { const [local, exporte] = p.split(' as ').map((s) => s.trim()); return (exporte || local) + ':' + local; }).join(',') + '};');
    const modele = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'mcp-widget-panneau.html'), 'utf8');
    if (modele.includes('/*__EXT_APPS_BUNDLE__*/') && bundle.includes('globalThis.ExtApps={')) widgetHtml = modele.replace('/*__EXT_APPS_BUNDLE__*/', () => bundle);
  } else console.warn('[mcp] ext-apps bundle hash mismatch — widget disabled');
} catch (e) { console.warn('[mcp] widget not built: ' + e.message); }
function ecrireVoix() {
  if (!FICHIER_VOIX) return;
  try {
    while (voixParBlock.size > VOIX_MAX_BLOCKS) voixParBlock.delete(voixParBlock.keys().next().value);
    const payload = JSON.stringify([...voixParBlock]);
    if (payload.length > VOIX_FICHIER_MAX_OCTETS) return;
    writeFileSync(FICHIER_VOIX + '.tmp', payload);
    renameSync(FICHIER_VOIX + '.tmp', FICHIER_VOIX);
  } catch (err) { /* ⛔ une ecriture ratee ne casse pas une lecture : la memoire suffit */ }
}
(function relireVoix() {
  if (!FICHIER_VOIX || !existsSync(FICHIER_VOIX)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_VOIX, 'utf8'));
    if (!Array.isArray(brut)) return;
    /* ⛔ RE-NETTOYE AU CHARGEMENT : un fichier abime ou ancien ne passe pas sans le filtre d aujourd hui */
    for (const [j, v] of brut) {
      const { voix } = nettoyerVoix(v && v.voix);
      if (typeof j === 'string' && /^0x[0-9a-f]{40}$/.test(j) && voix && Number.isFinite(Number(v.horodatage))) {
        voixParBlock.set(j, { voix, horodatage: Number(v.horodatage), auteur: String(v.auteur || '') });
      }
    }
    console.log('[voix] ' + voixParBlock.size + ' voix relue(s) du volume');
  } catch (err) { console.warn('[voix] fichier illisible, on repart a vide : ' + err.message); }
})();

const FICHIER_HOLDERS = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'holders-cache.json') : null;
/* ⛔ borne dure du fichier : au-dela on n ecrit pas plutot que de remplir le volume */
const HOLDERS_FICHIER_MAX_OCTETS = 4 * 1024 * 1024;
let holdersEcritureEnCours = false;

function ecrireHolders() {
  if (!FICHIER_HOLDERS || holdersEcritureEnCours) return;
  holdersEcritureEnCours = true;
  try {
    const entrees = [];
    for (const [jeton, e] of holdersCache) {
      if (e.jusqua === null || e.ratees !== 0) continue; /* jamais une passe partielle */
      entrees.push([jeton, { soldes: [...e.soldes].map(([a, v]) => [a, String(v)]),
        naissance: e.naissance, naissanceDepuis: Number.isSafeInteger(e.naissanceDepuis) ? e.naissanceDepuis : null,
        jusqua: e.jusqua, ratees: 0, lu: e.lu }]);
    }
    const payload = JSON.stringify(entrees);
    if (payload.length > HOLDERS_FICHIER_MAX_OCTETS) return; /* ⛔ plutot rien qu un volume plein */
    writeFileSync(FICHIER_HOLDERS + '.tmp', payload);
    renameSync(FICHIER_HOLDERS + '.tmp', FICHIER_HOLDERS);
  } catch (err) { /* ⛔ une ecriture ratee ne casse pas une lecture : on retombe sur la memoire */ }
  finally { holdersEcritureEnCours = false; }
}

(function relireHolders() {
  if (!FICHIER_HOLDERS || !existsSync(FICHIER_HOLDERS)) return;
  try {
    const brut = JSON.parse(readFileSync(FICHIER_HOLDERS, 'utf8'));
    if (!Array.isArray(brut)) return;
    for (const [jeton, e] of brut.slice(0, HOLDERS_MAX)) {
      /* ⛔ on revalide l adresse a la relecture : un fichier est une entree comme une autre */
      if (!/^0xb20[0-9a-f]{37}$/.test(String(jeton))) continue;
      if (!e || typeof e !== 'object' || e.jusqua === null || e.ratees !== 0) continue;
      const soldes = new Map();
      for (const [a, v] of Array.isArray(e.soldes) ? e.soldes : []) {
        try { soldes.set(String(a), BigInt(v)); } catch (_) { /* une entree illisible est ignoree */ }
      }
      const relue = { soldes, naissance: e.naissance, naissanceDepuis: Number.isSafeInteger(e.naissanceDepuis) ? e.naissanceDepuis : null,
        jusqua: e.jusqua, ratees: 0, lu: e.lu, enCours: false };
      /* ⛔ 2026-10-25 : une naissance cherchee APRES la creation connue (ou sans dire d ou) n est pas relue — rebatie (naissanceDouteuse) */
      if (naissanceDouteuse(String(jeton), relue)) continue;
      holdersCache.set(String(jeton), relue);
    }
  } catch (err) { /* fichier absent ou abime : on repart de la memoire, comme avant */ }
})();

async function reconstruireHolders(jeton) {
  let e = holdersCache.get(jeton);
  if (!e) {
    /* ⛔ Une reconstruction ne demarre que pour un B20 : le prefixe est le seul filtre sur : il vient
     *    de l adresse elle-meme, pas d une liste qu on tiendrait a jour. */
    if (!/^0xb20[0-9a-f]{37}$/.test(jeton)) return null;
    if (holdersCache.size >= HOLDERS_MAX) holdersCache.delete(holdersCache.keys().next().value);
    e = { soldes: new Map(), naissance: null, jusqua: null, ratees: 0, lu: null, enCours: false, rechercheNaissance: null };
    holdersCache.set(jeton, e);
  }
  if (e.enCours) return e;
  e.enCours = true;
  try {
    /* ⛔ 2026-10-25 : la creation d une action prouvee est apprise AVANT tout (meme naissance deja posee) ; une naissance cherchee
     *   plus haut que la creation connue est oubliee et recherchee (naissanceDouteuse) — jamais rejouee ni ecrite. */
    await apprendreCreationAction(jeton);
    try { await apprendreCreationRouteur(jeton); } catch (_) { /* recu non lu : le plancher, comme avant ; retente a la passe suivante */ }
    if (naissanceDouteuse(jeton, e)) oublierNaissance(e);
    const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    /* ⛔ 2026-10-26 : une tete illisible (NaN) faisait sauter la boucle de lireNaissance -> ABSENTE « up to block <depuis - 1> »,
     *   zero fenetre lue. Une tete non lue est une passe ratee (ratees), jamais « aucun mint ». */
    if (!Number.isSafeInteger(fin) || fin <= 0) throw new Error('head not read');
    if (e.naissance === null) {
      /* ⛔⛔ AUDIT DU 2026-10-09 : une fenetre refusee ARRETE la recherche (lireNaissance). Avant, elle etait
       *    sautee : un mint posterieur devenait la naissance, le rejeu partait de la, l entree etait ecrite sur le
       *    volume, et cette ligne ne cherchait plus jamais (elle ne cherche que tant que naissance vaut null).
       *  ⛔ On garde l etat (NON_LUE ou ABSENTE) pour que holdersCorps le NOMME. Pas de point de reprise : la
       *    passe suivante relit depuis le MEME debut, comme avant -- un prefixe « lu vide » pres de la tete,
       *    servi par un noeud en retard, sauterait la naissance d un block tout juste cree (raisonne, pas mesure).
       *  ⛔ 2026-10-25 : ce debut est le bloc de creation du jeton QUAND CE SERVEUR L A LU (debutRechercheNaissance,
       *    voir creationsLuesIci), sinon PREMIER_BLOCK_TB comme avant. Un mint ne precede pas la creation : rien n est
       *    saute. La regle du refus ne change pas : une fenetre refusee arrete la recherche.
       *  ⛔ Rien n est ecrit ici : jusqua reste null, et ecrireHolders saute toute entree sans curseur. */
      const depuis = debutRechercheNaissance(jeton);
      const r = await lireNaissance({ rpc: rpcServeur, jeton, depuis, jusqua: fin });
      /* ⛔ Naissance non lue ou introuvable : on ne devine pas un point de depart, on laisse l etat vide. */
      if (r.etat !== 'LUE') { e.rechercheNaissance = r; e.enCours = false; return e; }
      e.naissance = r.bloc;
      e.naissanceDepuis = depuis; /* 2026-10-25 : d ou la recherche est partie, ecrit avec l entree (naissanceDouteuse) */
      e.rechercheNaissance = null;
    }
    /* ⛔ LA PASSE VIT DANS soldes-jeton.js POUR ETRE TESTABLE. Une copie ici serait testee par un
     *    test qui la recopie, ce qui ne prouverait rien. Voir passeIncrementale et son audit. */
    await passeIncrementale({ rpc: rpcServeur, jeton, etat: e, naissance: e.naissance, fin });
    e.lu = new Date().toISOString();
  } catch (err) { e.ratees = (e.ratees || 0) + 1; }
  e.enCours = false;
  /* ⛔ ON GARDE LA PASSE SUR LE VOLUME, mais SEULEMENT si elle est complete : une passe partielle
   *   ecrite sur disque ressusciterait a chaque demarrage un etat qu on refuse deja d afficher. */
  if (e.jusqua !== null && e.ratees === 0) ecrireHolders();
  return e;
}

async function holdersCorps(jeton) {
  /* ⛔ ON NE BLOQUE PAS LA REQUETE : la reconstruction d un block coute ~42 lectures et peut durer
   *    des dizaines de secondes. On lance (ou on laisse tourner) et on rend l etat CONNU tout de
   *    suite. Mesure du 2026-09-20 : la version bloquante pendait au-dela de 45 s. */
  const dejaLa = holdersCache.get(jeton);
  if (!dejaLa) {
    if (!/^0xb20[0-9a-f]{37}$/.test(jeton)) return JSON.stringify({ ok: false, pourquoi: 'not a B20 address' });
    void reconstruireHolders(jeton).catch(() => {});
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: null, naissance: null,
      pourquoi: 'reading every transfer of this block from its birth — ask again in a moment' });
  }
  /* ⛔ 2026-10-25 : jamais servir une naissance cherchee plus haut que la creation connue (naissanceDouteuse) : oubliee ici, avant la passe */
  if (!dejaLa.enCours && naissanceDouteuse(jeton, dejaLa)) oublierNaissance(dejaLa);
  void reconstruireHolders(jeton).catch(() => {}); /* rafraichit en tache de fond */
  const e = dejaLa;
  /* ⛔⛔ 2026-10-09 : LA RECHERCHE DE NAISSANCE A SES PROPRES ETATS, ET ILS PASSENT AVANT « un rejeu tourne ».
   *    La branche enCours ci-dessous attrape TOUTE entree sans curseur (l appel `void reconstruireHolders`
   *    ci-dessus vient de poser enCours), et la branche « no mint found » plus bas n etait donc jamais atteinte :
   *    une recherche arretee par une fenetre refusee sortait en « a replay is running », ratees 0 -- le refus
   *    etait INVISIBLE. Non lue n est pas absente, et ni l une ni l autre n est « un rejeu tourne ».
   *  ⛔ C est l etat de la DERNIERE recherche terminee : une nouvelle peut tourner, elle repart du meme debut (debutRechercheNaissance). */
  const rn = e.naissance === null ? e.rechercheNaissance : null;
  if (rn && rn.etat === 'NON_LUE') {
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu, ratees: Number(e.ratees || 0), naissance: null,
      naissanceNonLue: { de: rn.refusee.de, a: rn.refusee.a },
      pourquoi: 'the birth of this block is not read yet: blocks ' + rn.refusee.de + '-' + rn.refusee.a
        + ' were refused by the node, so the search stops there and starts over — no later mint is taken as the birth' });
  }
  if (rn && rn.etat === 'ABSENTE') {
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu, ratees: Number(e.ratees || 0), naissance: null,
      pourquoi: 'no mint found for this token up to block ' + rn.luJusqua + ' — reading, or it was never minted' });
  }
  /* ⛔⛔ AUDIT DU 2026-09-20, SECONDE TROUVAILLE : cette fonction ne lisait jamais `enCours`. Pendant
   *    un rejeu, la Map est deja mutee fenetre par fenetre alors que `ratees` et `jusqua` datent de
   *    la passe PRECEDENTE. Un visiteur pouvait donc lire un etat ou un detenteur a 30 % de la supply
   *    etait ABSENT, avec ratees=0 -- et le recevoir en PAYABLE.
   *    Le drapeau existait (il garde l ECRIVAIN) ; il ne gardait pas le LECTEUR. */
  if (e.enCours && e.jusqua === null) {
    /* ⛔⛔ UNE BOUCLE MUETTE N EST PAS UN ETAT, C EST UNE PANNE QU ON NE VOIT PAS. Mesure du
     *     2026-09-25 en production : sur un block a 4 185 transferts, `lu` etait DATE — donc une
     *     passe s etait bien terminee — mais `jusqua` restait null. Signe que la passe RATE des
     *     fenetres, se fait jeter en entier, et recommence. Indefiniment. De l exterieur, la route
     *     repetait « a replay is running » sans jamais dire qu elle n avancait pas d un bloc.
     *     C est ce que Phil voyait : « Reading every transfer of this block from its birth… (7) ».
     *   ⛔ ON EXPOSE `ratees` : un nombre transforme « ca tourne » en « ca tourne ET ca rate ».
     *     C est la difference entre attendre et diagnostiquer.
     *   ⚠️ CE QU ON NE FAIT PAS ICI, ET POURQUOI : avancer le curseur sur les fenetres reussies.
     *     Ce serait le vrai correctif — une passe qui s arrete a la PREMIERE fenetre ratee laisse
     *     un prefixe CONTIGU, donc un point de reprise sur, et le rejeu finirait par aboutir.
     *     Mais `passeIncrementale` est ATOMIQUE par decision, prise apres un audit ou des mutations
     *     gardees sans curseur avance avaient fait RECOMPTER des Transfer : un detenteur credite
     *     25 000 au lieu de 15 000, avec les trois gardes au vert. Retourner cet invariant demande
     *     sa propre garde et sa propre mesure — consigne dans REPRISE plutot que bricole ici. */
    const ratees = Number(e.ratees || 0);
    /* game59 1(a): the birth this replay started from, when known (the inspector shows it as the block's birth block) */
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu, ratees, naissance: Number.isSafeInteger(e.naissance) ? e.naissance : null,
      pourquoi: ratees > 0
        ? 'a replay is running but ' + ratees + ' window(s) were refused by the node, so it starts '
          + 'over each time — balances stay unpublishable until one full pass succeeds'
        : 'a replay is running — balances are not publishable until it finishes' });
  }
  if (e.naissance === null) {
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu, naissance: null,
      pourquoi: 'no mint found for this token yet — reading, or it was never minted' });
  }
  /* ⛔ TROIS RAISONS DE REFUSER D AFFICHER DES PARTS, chacune nommee. */
  let total = null;
  try {
    const t = await rpcServeur('eth_call', [{ to: jeton, data: '0x18160ddd' }, 'latest']);
    if (typeof t === 'string' && t !== '0x') total = BigInt(t);
  } catch (err) { total = null; }
  const somme = verifierSomme({ soldes: e.soldes, totalSupply: total });
  const negatifs = soldesNegatifs(e.soldes);
  /* ⛔⛔ « PAS FINI DE LIRE » A SA PROPRE BRANCHE, ET ELLE PASSE EN PREMIER. Sans elle, un balayage
   *    encore en cours (jusqua === null) tombait dans la derniere branche et sortait le message
   *    « reconstructed sum differs from totalSupply by 0 » : un ecart de ZERO presente comme une
   *    difference. Observe en production le 2026-09-20.
   *    Un etat qui se resout tout seul ne doit pas ressembler a un etat qui demande une enquete. */
  if (e.jusqua === null && e.ratees === 0) {
    return JSON.stringify({ ok: true, etat: 'NON_LU', jeton, lu: e.lu, naissance: e.naissance,
      pourquoi: 'still replaying this block transfers from block ' + e.naissance });
  }
  const complet = e.ratees === 0 && e.jusqua !== null && somme.etat === 'JUSTE' && negatifs.length === 0;
  if (!complet) {
    return JSON.stringify({ ok: true, etat: 'INCOMPLET', jeton, lu: e.lu,
      naissance: e.naissance, jusqua: e.jusqua,
      pourquoi: e.ratees ? e.ratees + ' window(s) refused by the node'
        : negatifs.length ? negatifs.length + ' impossible negative balance(s)'
          : somme.etat === 'NON_LU' ? 'totalSupply could not be read'
            : e.jusqua === null ? 'the replay has not finished yet'
              : 'reconstructed sum differs from totalSupply by ' + somme.ecart,
      borne: 'Balances are not trustworthy yet, so no share is shown. This is about our reading, '
        + 'not about the block.' });
  }
  const parts = partsHolders({ soldes: [...e.soldes.entries()], pot: POT_FICTIF });
  return JSON.stringify({
    ok: true, etat: parts.etat, jeton, lu: e.lu, naissance: e.naissance, jusqua: e.jusqua,
    /* ⛔ parts en dix-milliemes CALCULEES A PARTIR DU POT : `montant / 100n` ne tombait juste que
     *    parce que POT_FICTIF valait exactement 1e6. Un changement d echelle aurait fausse l affichage
     *    sans rien casser de visible. */
    detenteurs: parts.parts.map((x) => ({ adr: x.adr, part: Number((x.montant * 10000n) / POT_FICTIF) })),
    /* ⛔ COMBIEN SONT TROP PETITS POUR CETTE ECHELLE : zero attendu, mais un zero MESURE vaut mieux
     *    qu un silence. `poussiere` n est PAS publie ici : il se compare au gas d une reclamation, ce
     *    qui n a aucun sens contre un pot fictif. */
    tropPetits: parts.aZero || 0,
    horsBase: { adresses: parts.exclus.length, pourquoi: parts.exclus.map((x) => x.pourquoi) },
    partHorsBase: total && total > 0n ? Number((parts.baseExclue * 10000n) / total) : null,
    /* ⛔ BORNE CORRIGEE : « no reward contract exists yet » est devenu FAUX le 2026-09-20, le pot est
     *    deploye et la premiere periode est alimentee. Une borne perimee ment a l ecran. */
    borne: 'Shares are pro rata of the supply held OUTSIDE the market pool and our own contracts. '
      + 'At launch the pool holds 99.9% of a block by design. This screen shows proportions only: '
      + 'which block a round pays is decided when that round is anchored, not here.',
  });
}

const blocksConnus = new Set();
/* 2026-10-10 re-QA : la recherche par NOM (voir recherche-noms.js). name()/symbol() lus une fois par block, en fond, 40 blocks/min au plus,
 *   par eth_call 'latest' (jamais l archive). Un nom lu reste ; un echec se relit 10 min plus tard. */
const indexNoms = creerIndexNoms({ lire: (a, sel) => rpcServeur('eth_call', [{ to: a, data: sel }, 'latest']) });
const reponsesNoms = new Map(); /* q -> { t, corps } : 30 s */
let lignesNomsTrending = { t: 0, lignes: [] };
/* 2026-10-10 (QA Grok : IB022 introuvable 1 h apres le deploiement — 527 noms lus sur 2 924) : l index repart de zero a chaque
 *   deploiement ; a 40 noms par minute il lui fallait ~73 min. Tant qu il n a pas tout lu : 120 par tour (eth_call `latest`,
 *   jamais l archive), puis 40 comme avant. */
/* ⛔⛔ 2026-10-10 (mesure prod, x-ms-monitor) : /api/chercher?q=IB022 -> ABSENT avec « nomsLus 2 951 / blocksConnus 2 951 » — l index
 *   etait PLEIN et IB022 n y etait pas. CAUSE : `blocksConnus` ne tient que le scan VERS L AVANT (3 jours a froid) et le disque ; le
 *   rattrapage arriere (`relireUnTrouRattrapage`) remplit `createurParBlock` (14 928 en prod) SANS toucher `blocksConnus`. IB022
 *   (bloc 51653364) y est, createur compris (/api/voix, /api/blocks-de) : connu du serveur, introuvable par son nom. TBGAS idem.
 *   ⇒ on nomme l UNION, nos blocks D ABORD (ceux qu on cherche), puis le trending, puis l index des createurs.
 *   ⛔ COUT : le meme debit (120 adresses = 240 eth_call 'latest' par minute pendant le remplissage), plus LONGTEMPS : ~2 h apres un
 *   deploiement au lieu de ~25 min (l index des noms n est pas persiste). Jamais l archive.
 *   ⛔ un tour a la fois : 120 lectures sequentielles peuvent depasser 60 s, et deux tours lisaient alors les memes adresses. */
let nomsEnCours = false, aNommerTaille = 0;
/* ⛔⛔ 2026-10-26 (mesure prod game53, x-ms-monitor : /api/chercher « nomsLus 1 091 / aNommer 21 686 », UNIT ABSENT) — L INDEX DES NOMS EST
 *   PERSISTE (noms-b20.json, a cote des autres fichiers du volume) : relu au demarrage, ecrit au plus toutes les 5 min quand il a grandi.
 *   Un deploiement ne repaie plus ~3 h de lectures. Et UNIT (le block de l app) est nomme EN PREMIER, avant nos blocks. */
const FICHIER_NOMS = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'noms-b20.json') : null;
let nomsSauves = { t: 0, n: 0 };
function chargerNomsDisque() {
  try {
    if (!FICHIER_NOMS || !existsSync(FICHIER_NOMS)) return;
    const x = JSON.parse(readFileSync(FICHIER_NOMS, 'utf8'));
    const n = indexNoms.charger(x && x.v === 1 ? x.noms : []);
    nomsSauves = { t: Date.now(), n: indexNoms.taille() };
    console.log('[noms] disk: ' + n + ' name(s) loaded');
  } catch (e) { console.log('[noms] disk unread: ' + e.message); }
}
function sauverNomsDisque(force = false) {
  if (!FICHIER_NOMS || indexNoms.taille() === nomsSauves.n || (!force && Date.now() - nomsSauves.t < 5 * 60 * 1000)) return;
  try {
    writeFileSync(FICHIER_NOMS + '.tmp', JSON.stringify({ v: 1, a: Date.now(), noms: indexNoms.exporter() }));
    renameSync(FICHIER_NOMS + '.tmp', FICHIER_NOMS);
    nomsSauves = { t: Date.now(), n: indexNoms.taille() };
  } catch (e) { console.log('[noms] disk write failed: ' + e.message); }
}
chargerNomsDisque();
/* /api/recherche (recherche-b20.js) : l index fusionne, reconstruit au plus toutes les 30 s, a partir de ce que le serveur tient DEJA en
 *   memoire — le corps du trending (lignes + actions prouvees), les faits de creation, les noms lus, les adresses connues. */
const RECHERCHE_IP_MINUTE = 60, RECHERCHE_MINUTE = 3000;
const rechercheBudget = { minute: 0, n: 0, parIp: new Map() };
const reponsesRecherche = new Map();
let indexRechercheEtat = { t: 0, index: null, enVol: null };
async function indexRecherche() {
  if (indexRechercheEtat.index && Date.now() - indexRechercheEtat.t < 30000) return indexRechercheEtat;
  if (indexRechercheEtat.enVol) return indexRechercheEtat.enVol;
  indexRechercheEtat.enVol = (async () => {
    let corps = null;
    try { corps = JSON.parse(await trending()); } catch (_) { corps = null; }
    const lignes = corps && Array.isArray(corps.lignes) ? corps.lignes : [];
    const actions = corps && corps.actionsChaine && Array.isArray(corps.actionsChaine.liste) ? corps.actionsChaine.liste : [];
    const estAction = (l) => !!(l && (l.emetteur || l.routeAction));
    const sources = [
      { nom: 'app', entrees: [{ adr: UNIT_BLOCK, sym: 'UNIT', notre: true }, ...[...nosBlocksEtat.blocks].map((adr) => ({ adr, notre: true }))] },
      { nom: 'trending', entrees: lignes.map((l) => ({ adr: l && l.adr, sym: l && l.sym, nom: l && l.nom, marche: true, action: estAction(l), volume: l && l.volume24hUsd })) },
      { nom: 'actions', entrees: actions.map((a) => ({ adr: a && a.adr, sym: a && a.sym, action: true })) },
      { nom: 'creations', entrees: [...faitsCreation].map(([adr, f]) => ({ adr, sym: f.symbole, nom: f.nom })) },
      { nom: 'noms', entrees: indexNoms.entrees() },
      { nom: 'connus', entrees: [...adressesANommer(createurParBlock.keys(), blocksConnus)].map((adr) => ({ adr })) },
    ];
    indexRechercheEtat = { t: Date.now(), index: construireIndex(sources), enVol: null, actions: actions.length, trending: lignes.length, creations: faitsCreation.size };
    return indexRechercheEtat;
  })().catch((e) => { indexRechercheEtat.enVol = null; throw e; });
  return indexRechercheEtat.enVol;
}
if (process.env.TB_SONDES !== '0' && !ESSAI_SRV.actif) {
  setInterval(() => {
    if (nomsEnCours) return;
    /* UNIT_BLOCK d abord (declare plus bas, lu a l appel), puis l union d avant, dans le meme ordre */
    const liste = adressesANommer([UNIT_BLOCK], adressesANommer(nosBlocksEtat.blocks, blocksConnus, createurParBlock.keys())); /* lus a l appel : declares plus bas, c est sur */
    aNommerTaille = liste.length;
    nomsEnCours = true;
    void indexNoms.remplir(liste, indexNoms.taille() < liste.length ? 120 : 40).catch(() => {}).finally(() => { nomsEnCours = false; sauverNomsDisque(); });
  }, 60000).unref?.();
}
/* ⛔⛔ QUI A CREE QUOI — L INDEX QUI MANQUAIT, ET SON ABSENCE RENDAIT LES BLOCKS DES GENS INVISIBLES.
 *     Phil, 2026-09-27 : « je vais sur My blocks et je vois pas le block que j ai cree sur l autre
 *     machine, et le bug doit etre partout ». Il l est.
 *   ⛔ LA CAUSE, MESUREE : le navigateur cherchait les creations avec `listerCreations({ blocs:
 *     43200 })`. A ~2 s par bloc sur Base, 43 200 blocs font EXACTEMENT 24 heures. Un block cree il
 *     y a plus d un jour disparaissait donc de « mes blocks » — sur TOUTES les machines, pas
 *     seulement la seconde. Ce n est pas un defaut de synchronisation, c est une FENETRE.
 *   ⛔ ET ON NE POUVAIT PAS SIMPLEMENT L ELARGIR : le noeud plafonne les fenetres de logs, donc
 *     trente jours depuis un navigateur feraient des centaines de requetes. Le serveur, lui, scanne
 *     DEJA les creations en continu — il lui manquait seulement de retenir QUI a cree.
 *   ⛔⛔ ET L EVENEMENT DE CREATION NE PORTE PAS LE CREATEUR : `index-blocks.js` le dit en toutes
 *       lettres, « seule la transaction dit QUI A PAYE ». On reutilise donc `createurDe`, l aide
 *       canonique deja ecrite et deja eprouvee, plutot qu une version plus faible ecrite ici.
 *   ⚠️ BORNE HONNETE, ET ELLE EST DITE PAR L ENDPOINT : cet index ne connait que les creations vues
 *     depuis le premier scan du serveur. Il grandit avec le temps, il ne remonte pas le passe tout
 *     seul. « pas encore indexe » n est pas « pas a toi ». */
const createurParBlock = new Map();
/* ⛔ OU EN EST LE RATTRAPAGE DU PASSE. `null` = pas encore commence ; sinon, le plus BAS bloc deja
 *   remonte. Persiste, sinon chaque deploiement recommencerait le rattrapage depuis le present et
 *   ne finirait jamais. */
let rattrapageDepuis = null;
const CREATEURS_DISQUE_MAX = 100000;
let createursRelecture20261009 = false;
/* ⛔ COMBIEN DE REFUS DE SUITE SUR LA MEME FENETRE, et les plages qu on a fini par SAUTER. Un trou
 *   nomme vaut mieux qu un index qui ne finit jamais — et infiniment mieux qu un trou invisible. */
let refusDeSuite = 0;
/* ⛔⛔ 2026-10-09 : ces trous n etaient NI persistes NI relus — le curseur, lui, l etait. Apres un redeploiement, le trou
 *   disparaissait et `couvertureComplete` pouvait passer a VRAI sur des blocs jamais lus. Ils sont maintenant sauves avec
 *   l index, relus par `relireUnTrouRattrapage` (noeud d archive), et `trousRattrapageRelus` garde ce qui a ete relu. */
const trousRattrapage = [];
const trousRattrapageRelus = [];
/* ⛔ UNE RELECTURE COMPLETE, UNE SEULE (drapeau persiste) : avant ce correctif, chaque redeploiement du 2026-10-09 (au moins 7)
 *   a pu jeter un trou nomme. Absence de trou connu n est pas preuve d absence de trou : on relit tout depuis la tete, une fois. */
let createursRelecture20261010 = false;
let attenteBudgetDite = null;
/* ⛔⛔ 2026-10-09 (audit du budget d archive) — UN CREATEUR NON RESOLU ETAIT PERDU POUR TOUJOURS. `createurDe` rend `null` quand la tx
 *   n a pas pu etre lue ; on ne gravait rien (juste), mais le scan vers l avant, le curseur du rattrapage et `t.de` d un trou relu
 *   AVANCAIENT quand meme : plus aucune passe ne revoyait ce block, et `couvertureComplete` pouvait passer a VRAI sans lui.
 *   Il est maintenant GARDE ({ jeton, tx }), persiste, reessaye a chaque passe (`relireNonResolus`), et la couverture exige cette
 *   liste vide. Borne : au-dela, le plus ancien part, COMPTE dans `createursNonResolusJetes` (persiste, publie) — et la couverture
 *   ne se dit plus complete, puisqu un block est perdu. Non resolu n est pas « sans createur ». */
const CREATEURS_NON_RESOLUS_MAX = 5000;
const createursNonResolus = [];
let createursNonResolusJetes = 0;
function garderNonResolu(c) {
  const jeton = String((c && c.jeton) || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(jeton) || createurParBlock.has(jeton) || createursNonResolus.some((x) => x.jeton === jeton)) return;
  /* un hash mal forme (fichier ancien ou abime) devient `null` : `createurDe` le refuse sans appel, au lieu d un appel rate par passe */
  createursNonResolus.push({ jeton, tx: /^0x[0-9a-fA-F]{64}$/.test(String(c.tx || '')) ? c.tx : null });
  if (createursNonResolus.length > CREATEURS_NON_RESOLUS_MAX) {
    const jetes = createursNonResolus.splice(0, createursNonResolus.length - CREATEURS_NON_RESOLUS_MAX);
    createursNonResolusJetes += jetes.length;
    /* ⛔ 2026-10-09 (revue adversariale) : un jete ne se reessaie plus — et un compteur qui ne redescend JAMAIS gardait
     *   `couvertureComplete` a faux pour toujours (sortie constante). Le seul chemin qui le retrouve est une relecture depuis la
     *   tete : elle repasse sur sa creation, dont le createur manque a l index. On la programme ; `couvertureComplete` reste faux
     *   jusqu a ce qu elle touche le plancher, puis redevient vrai. Le compteur reste publie (cumul). */
    rattrapageDepuis = null;
    console.log('[createurs] ⛔ ' + jetes.length + ' unresolved creator(s) dropped at the cap of ' + CREATEURS_NON_RESOLUS_MAX
      + ' (' + createursNonResolusJetes + ' in all) — full re-read from the head scheduled to find them again');
  }
}
/** Reessaie AU PLUS 32 createurs non resolus par passe (lots de 8, comme les autres resolutions). Un resolu sort de la liste ; un echec
 *  repart en FIN de file (un block illisible ne bloque pas les autres). Rien n est retire AVANT la reponse : une passe interrompue
 *  laisse la liste entiere. */
async function relireNonResolus() {
  for (let k = createursNonResolus.length - 1; k >= 0; k--) if (createurParBlock.has(createursNonResolus[k].jeton)) createursNonResolus.splice(k, 1);
  const essai = createursNonResolus.slice(0, 32);
  if (!essai.length) return null;
  let resolus = 0;
  for (let i = 0; i < essai.length; i += 8) {
    const lot = essai.slice(i, i + 8);
    const res = await Promise.all(lot.map((c) => createurDe({ rpc: rpcServeur, tx: c.tx })));
    for (let j = 0; j < lot.length; j++) {
      const cre = res[j] && res[j].createur;
      const k = createursNonResolus.indexOf(lot[j]);
      if (k >= 0) createursNonResolus.splice(k, 1);
      if (cre) { createurParBlock.set(lot[j].jeton, String(cre).toLowerCase()); resolus++; } else if (k >= 0) createursNonResolus.push(lot[j]);
    }
  }
  return { essayes: essai.length, resolus, restent: createursNonResolus.length };
}
let blocsLusJusqua = null, trCache = { a: 0, corps: null }, trEnCours = null;
/* ⛔⛔ 2026-10-25 (revue adverse de 2855ce8 : les blocks servis par /api/blocks-de n avaient ni symbole ni bloc -> « ? » a la Wallet,
 *   ordre change) — LES FAITS DE CHAQUE CREATION LUE PAR UN SCAN DE LA FACTORY : jeton -> { bloc, symbole } (le log de creation les
 *   porte). Gardes 3 jours (faitsProfondeur, en blocs au temps mesure) sous la tete (la fenetre du navigateur fait 43 200 blocs), persistes avec le trending.
 *   `faitsDepuis` = le premier bloc a partir duquel CHAQUE creation lue est notee (pose au premier scan vers l avant qui avance) :
 *   en dessous, le navigateur relit lui-meme (creations-index.js). Sert aussi la Map (/api/creations-recentes). */
const faitsCreation = new Map();
/* ══ game376 (Phil 2026-11-12, CLOUD panel: « pourquoi pas vérifier ») — CAN ANYONE STILL CREATE MORE OF A BLOCK? ══════════════════
 * ⛔ The panel said « We did not check whether anyone can still create them ». emission-b20.js now checks it on the chain: the roles
 *   held at the end of the token's creation block (its own RoleGranted / RoleRevoked logs, ONE block, address-filtered), then
 *   hasRole() now for each holder found there and the creator. Measured 2026-11-12: CLOUD FIXE (no right given at creation, 1 log
 *   in its creation block), TBLOCK FIXE (rights given up in the same block), the 8 router-born seed blocks PEUT_CROITRE (an admin
 *   still holds DEFAULT_ADMIN_ROLE).
 * ⛔ COST, PER TOKEN AND ONCE: the creation block comes from THIS server's factory-log index (faitsCreation, creationsLuesIci) and is
 *   re-checked (2 eth_call); without it, a bisection on totalSupply() at past blocks (~26 eth_call). Then TWO eth_getLogs of that one block
 *   (the factory's B20Created for the token — the proof it IS the creation block, review 2026-11-12 — and the token's own logs) through lecteurLogs (deep window + archive budget exhausted = not sent: NON_LU, retried later) and a few hasRole. A FIXE verdict
 *   never goes stale (nobody can ever be given the right) and is saved; PEUT_CROITRE is re-read after 30 min; a failure after 60 s.
 *   At most VERIFS_PAR_MINUTE checks start per minute for the whole server, one at a time. The route never waits on the chain. */
const FICHIER_EMISSION = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'emission-cache.json') : null;
const serviceEmission = creerServiceEmission({
  verifier: ({ jeton, precedent }) => consommateurArchive.run('route /api/emission', async () => {
    const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    const f = faitsCreation.get(jeton);
    /* else the block the previous check found (re-checked by verifierEmission: born at b, not at b-1) — no new bisection per re-read */
    const bloc = f && Number.isSafeInteger(f.bloc) ? f.bloc : (creationsLuesIci.get(jeton)
      ?? (precedent && Number.isSafeInteger(precedent.blocCreation) ? precedent.blocCreation : null));
    return verifierEmission({ rpc: rpcServeur, rpcLogs: lecteurLogs(Number.isSafeInteger(tete) ? tete : null).rpc, jeton,
      blocCreation: bloc, createur: createurParBlock.get(jeton) || null, tete: Number.isSafeInteger(tete) ? tete : null,
      etiquettes: { [String(FEE_WALLET).toLowerCase()]: 'TokenizedBlock’s fee wallet' } });
  }),
  surFixe: () => {
    if (!FICHIER_EMISSION) return;
    try { writeFileSync(FICHIER_EMISSION + '.tmp', JSON.stringify(serviceEmission.exporter())); renameSync(FICHIER_EMISSION + '.tmp', FICHIER_EMISSION); }
    catch (_) { /* a failed save never breaks a read: the verdict stays in memory */ }
  },
});
try {
  if (FICHIER_EMISSION && existsSync(FICHIER_EMISSION)) console.log('[emission] ' + serviceEmission.importer(JSON.parse(readFileSync(FICHIER_EMISSION, 'utf8'))) + ' fixed-supply verdict(s) read back');
} catch (e) { console.warn('[emission] cache unreadable, starting empty: ' + e.message); }
/* ── game346 (Phil 2026-11-10: "the hearts given must show in the user's wallet, who gave them and how many the holder gave back; a
 *   leaderboard of the best contributors, live"; "a signal between blocks for those who heart"). The index reads BlockLikes' own `Liked`
 *   logs from its deploy block (coeurs-index.js: a failed window is read again, never skipped); creators come from `createurParBlock`
 *   (tx.from of each birth, already resolved by the trending index). Read-only; nothing signs. */
const COEURS = { index: null, minute: 0, parIp: new Map(), inverse: { t: 0, map: new Map() } };
const rpcCoeurs = async (methode, params) => {
  let derniere = 'no node answered';
  for (const url of [...(RELAIS_CLE ? [RELAIS_CLE] : []), ...RPC_LIST]) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }), signal: AbortSignal.timeout(15000) });
      compterEnvoi(url, r.status === 429 ? 'limite' : (r.ok ? 'ok' : 'erreur'));
      if (!r.ok) { derniere = 'HTTP ' + r.status; continue; }
      const j = await r.json();
      if (j && j.error) { derniere = String(j.error.message || 'node error').slice(0, 80); continue; }
      return j.result;
    } catch (e) { derniere = String((e && e.message) || e).slice(0, 80); }
  }
  throw new Error(derniere);
};
/* 2026-11-12 (the economy pack is live): hearts are now given on Hearts (economie-pack.js HEARTS, from the deployment record, read from its
 *   creation block); the first contract's hearts stay readable history. One index over both, same never-skip rule each. */
if (ECONOMIE_DEPLOIEMENT.adresseLikes || EP_PACK.HEARTS) {
  COEURS.index = creerIndexCoeursSuite({ rpc: rpcCoeurs, sources: [
    ...(ECONOMIE_DEPLOIEMENT.adresseLikes ? [{ likes: String(ECONOMIE_DEPLOIEMENT.adresseLikes).toLowerCase(), depuis: LIKES_DEPLOY_BLOC }] : []),
    ...(EP_PACK.HEARTS ? [{ likes: EP_PACK.HEARTS, depuis: EP_PACK.BLOC_DEPLOIEMENT.L }] : []),
  ] });
  /* game378: each pass then reads the receipts of the latest Hearts hearts (10 at most a pass; a verdict is kept, a miss is read again) */
  COEURS.signataires = creerSignataires({ rpc: rpcCoeurs });
  const avancerIndexCoeurs = COEURS.index.avancer;
  COEURS.index.avancer = async () => { const e = await avancerIndexCoeurs(); try { await COEURS.signataires.resoudre(derniersCoeurs(COEURS.index.coeurs().filter((c) => c.contrat === EP_PACK.HEARTS))); } catch (_) { /* read again next pass */ } return e; };
  if (process.env.TB_SONDES !== '0' && !ESSAI_SRV.actif) {
    setTimeout(() => { void COEURS.index.avancer(); setInterval(() => { void COEURS.index.avancer(); }, 60000).unref?.(); }, 20000).unref?.();
  }
}
/** creator -> its blocks (from createurParBlock), rebuilt at most once a minute */
function blocksDuCreateur() {
  if (Date.now() - COEURS.inverse.t > 60000) {
    const m = new Map();
    for (const [b, c] of createurParBlock) { const l = m.get(c); if (l) l.push(b); else m.set(c, [b]); }
    COEURS.inverse = { t: Date.now(), map: m };
  }
  return COEURS.inverse.map;
}
/* ── game353 (Phil 2026-11-11: "a community vault with every user's lock, the points it generates for an airdrop"): the lock events index
 *   (index-logs.js over TBlockLock, from its deploy block) + the hearts index -> points.js. Read-only; nothing signs. */
const POINTS = { index: null, minute: 0, parIp: new Map() };
if (LOCK_DEPLOIEMENT.adresse) {
  POINTS.index = creerIndexLogs({ rpc: rpcCoeurs, adresse: String(LOCK_DEPLOIEMENT.adresse).toLowerCase(), topics: Object.values(TOPICS_LOCK), decoder: decoderLock, depuis: LOCK_DEPLOY_BLOC });
  if (process.env.TB_SONDES !== '0' && !ESSAI_SRV.actif) {
    setTimeout(() => { void POINTS.index.avancer(); setInterval(() => { void POINTS.index.avancer(); }, 60000).unref?.(); }, 25000).unref?.();
  }
}


let faitsDepuis = null;
/* ⛔ DENIM (2026-11-05, 0,2 s/bloc mesure par nous ET par Grok) : 3 x 43 200 blocs faisaient 3 jours a 2 s, 7,2 h a 0,2 s — passe ce
 *   delai, la Wallet et la Map retombaient sur « ? ». La garde est en SECONDES (3 jours) au temps SERVI (sParBlocServi : la mesure courte
 *   l emporte des que les blocs accelerent -> plus de blocs, jamais moins de 3 jours) ; sans mesure, 0,2 s. Ne coute aucune requete :
 *   elle ne fait qu elaguer une table en memoire (le scan vers l avant ne depend pas d elle). */
const FAITS_PROFONDEUR_S = 3 * 86400, FAITS_PROFONDEUR_SANS_MESURE = 3 * 432000;
const faitsProfondeur = () => blocsPour(FAITS_PROFONDEUR_S, sParBlocServi()) ?? FAITS_PROFONDEUR_SANS_MESURE;
function noterFaits(creations, tete) {
  noterFaitsCreations(faitsCreation, creations);
  if (!Number.isSafeInteger(tete)) return;
  const coupe = tete - faitsProfondeur();
  for (const [j, f] of faitsCreation) if (f.bloc < coupe) faitsCreation.delete(j);
  if (faitsDepuis !== null && faitsDepuis < coupe) faitsDepuis = coupe;
}
/** Le premier scan vers l avant qui AVANCE fixe `faitsDepuis` a son debut : chaque creation lue depuis porte ses faits. */
function faitsScanAvance(debut) { if (faitsDepuis === null && Number.isSafeInteger(debut)) faitsDepuis = debut; }
/** Relecture du disque. `faitsDepuis` n est repris QUE si le scan vers l avant l est aussi (sinon il repart de null). */
function chargerFaits(x) {
  for (const e of (Array.isArray(x.faitsCreations) ? x.faitsCreations : [])) {
    if (Array.isArray(e)) noterFaitsCreations(faitsCreation, [{ jeton: e[0], bloc: e[1], symbole: e[2], decimales: e[3], nom: e[4] }]);
  }
  if (Number.isSafeInteger(x.faitsDepuis) && x.faitsDepuis >= 0 && Number.isSafeInteger(blocsLusJusqua) && x.faitsDepuis <= blocsLusJusqua + 1) faitsDepuis = x.faitsDepuis;
}
/** Ce que la sauvegarde ecrit des faits. */
function faitsPourDisque() { return { faitsCreations: [...faitsCreation].map(([j, f]) => [j, f.bloc, f.symbole, f.decimales, f.nom]), faitsDepuis }; }
/** Les bornes de l index publiees a /api/blocks-de ET /api/creations-recentes (une seule source : test-creations-index-serveur). */
function bornesPubliees() {
  /* ⛔⛔ Mesure du 2026-10-25 : la Wallet relisait 43 200 blocs de la factory depuis le navigateur (« 17 chain window(s) refused by
   *   the node ») alors que cet index etait complet. Sans ces bornes, ou au moindre trou non liste, le navigateur relit tout. Les
   *   trous des DEUX scans (vers l avant, rattrapage) et les createurs non resolus partent avec — le navigateur les relit. */
  return bornesIndex({ blocsLusJusqua, rattrapageDepuis,
    couvertureComplete: rattrapageDepuis !== null && rattrapageDepuis <= PREMIER_BLOCK_TB && trousRattrapage.length === 0,
    plancher: PREMIER_BLOCK_TB, trous: [...trousCreations, ...trousRattrapage], nonResolus: createursNonResolus, faitsDepuis });
}
/** jeton -> { bloc, symbole } pour ces jetons : faits lus par un scan, symbole a defaut depuis l index des noms. */
function faitsServis(jetons) {
  const o = {};
  let noms = null;
  for (const brut of jetons || []) {
    const j = String(brut || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(j) || o[j]) continue;
    const f = faitsCreation.get(j);
    let symbole = f ? f.symbole : null;
    if (!symbole) {
      if (!noms) noms = new Map(indexNoms.entrees().map((e) => [e.adr, e]));
      const e = noms.get(j);
      symbole = e && e.sym ? String(e.sym).slice(0, 32) : null;
    }
    if (f || symbole) o[j] = { bloc: f ? f.bloc : null, symbole };
  }
  return o;
}
/** Les plages de creations SAUTEES (fenetres refusees au moment ou le scan a avance) — voir lireTrending.
 *  ⛔ 2026-10-09 (noeud d archive pose) : PERSISTEES avec le trending et RELUES par `relireUnTrou` ; elles ne vivaient qu en memoire et
 *  le trou mesure ce matin avait disparu au premier redeploiement. `trousRelus` garde ce qui a ete relu, et combien de creations. */
const trousCreations = [];
const trousRelus = [];
/* ⛔⛔ 2026-10-09 (audit du budget d archive) — LE PLAFOND JETAIT LE TROU EN COURS DE RELECTURE, SANS UN MOT. Il etait de 50 et
 *   `splice(0, …)` jetait les PLUS ANCIENS, donc [0] — celui que `relireUnTrou` relit, et ou le trou mesure du 10-09 est seme par
 *   `unshift`. Un trou jete, ce sont des fenetres refusees qui deviennent « jamais a relire » : une fenetre refusee n est pas une
 *   fenetre vide. Plafond 200 comme `trousRattrapage` ; au-dela, rien n est JETE : les plus anciens APRES [0] sont FONDUS en une
 *   seule plage qui les couvre tous (relue entiere, blocs deja lus compris — un cout d archive, pas une perte), et c est dit dans
 *   le journal. Appele partout ou la file grandit (scan vers l avant, graine, chargement). */
const TROUS_CREATIONS_MAX = 200;
function bornerTrousCreations(ou) {
  if (trousCreations.length <= TROUS_CREATIONS_MAX) return 0;
  const fondus = trousCreations.splice(1, trousCreations.length - TROUS_CREATIONS_MAX + 1);
  const de = Math.min(...fondus.map((t) => t.de)), a = Math.max(...fondus.map((t) => t.a));
  /* `fondus` est CUMULE : une plage deja fondue compte pour les trous qu elle porte, pas pour un */
  trousCreations.splice(1, 0, { de, a, fenetres: fondus.reduce((s, t) => s + (Number(t.fenetres) || 0), 0), t: fondus[fondus.length - 1].t,
    fondus: fondus.reduce((s, t) => s + (Number.isSafeInteger(t.fondus) && t.fondus > 0 ? t.fondus : 1), 0) });
  console.log('[trous] ⛔ ' + ou + ' : cap of ' + TROUS_CREATIONS_MAX + ' gaps reached — ' + fondus.length + ' gap(s) merged into ' + de + '..' + a
    + ' (none dropped ; the gap being re-read stays first)');
  return fondus.length;
}
/* ⛔ LE TROU MESURE LE 2026-10-09 (lu dans /sante.trousCreations ce jour-la : 52302101 -> 52381409, 35 fenetres, base.org 429 a tout
 *   getLogs). Seme UNE fois (drapeau persiste `trouSeme20261009`), puis il vit comme les autres. */
const TROU_MESURE_20261009 = Object.freeze({ de: 52302101, a: 52381409, fenetres: 35, t: '2026-10-09T00:00:00.000Z', seme: true });
let trouSeme20261009 = false;
/** Relit AU PLUS 10 000 blocs du plus ancien trou (5 pages de 2 000). Le trou ne recule QUE sur une relecture complete : une page
 *  refusee laisse le trou tel quel (il sera relu au prochain passage) — jamais « relu » sur une lecture partielle. */
async function relireUnTrou() {
  /* ⛔ 2026-10-09 (audit du budget d archive) : budget du jour epuise, chaque page est refusee A COUP SUR — on n essaie meme pas
   *   (meme garde que relireUnTrouRattrapage). Le trou reste tel quel, en tete de file : il attend, il ne recule pas. */
  if (!RPC_ARCHIVE || !trousCreations.length || archiveEpuisee()) return null;
  const t = trousCreations[0];
  const haut = Math.min(t.a, t.de + 10000);
  /* un trou est de l histoire : directement au noeud d archive (rpcHistoire), pas derriere base.org et publicnode */
  const r = await listerCreations({ rpc: rpcHistoire, blocs: haut - t.de, fin: haut });
  if ((r.fenetresRatees || []).length) return { trou: t, haut, ratees: r.fenetresRatees.length, budget: refusDeBudget(r.fenetresRatees) };
  if (typeof noterFaits === 'function') noterFaits(r.creations, blocsLusJusqua); /* le trou recule ci-dessous : ses creations doivent avoir leurs faits AVANT (typeof : voir chargerFaits) */
  const nouvelles = (r.creations || []).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.jeton || '') && !blocksConnus.has(c.jeton.toLowerCase()));
  for (const c of r.creations || []) if (/^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')) blocksConnus.add(c.jeton.toLowerCase());
  for (let i = 0; i < nouvelles.length; i += 8) {
    const lot = nouvelles.slice(i, i + 8);
    const res = await Promise.all(lot.map((c) => createurDe({ rpc: rpcServeur, tx: c.tx })));
    for (let j = 0; j < lot.length; j++) { const cre = res[j] && res[j].createur; if (cre) createurParBlock.set(lot[j].jeton.toLowerCase(), String(cre).toLowerCase()); else garderNonResolu(lot[j]); }
  }
  t.relues = (t.relues || 0) + (r.creations || []).length;
  t.nouvelles = (t.nouvelles || 0) + nouvelles.length;
  t.de = haut;
  if (t.de >= t.a) {
    trousCreations.shift();
    trousRelus.push({ ...t, fini: new Date().toISOString() });
    if (trousRelus.length > 50) trousRelus.shift();
  }
  return { trou: t, haut, creations: (r.creations || []).length, nouvelles: nouvelles.length };
}
/** Relit AU PLUS 100 000 blocs du plus ancien trou du RATTRAPAGE DES CREATEURS (noeud d archive). Meme regle que relireUnTrou :
 *  le trou ne recule QUE sur une relecture complete ; un refus (de noeud OU de budget) le laisse tel quel. */
async function relireUnTrouRattrapage() {
  if (!RPC_ARCHIVE || !trousRattrapage.length || archiveEpuisee()) return null;
  const t = trousRattrapage[0];
  const haut = Math.min(t.a, t.de + 100000);
  const r = await listerCreations({ rpc: rpcHistoire, blocs: haut - t.de, fin: haut });
  if ((r.fenetresRatees || []).length) return { trou: t, haut, ratees: r.fenetresRatees.length, budget: refusDeBudget(r.fenetresRatees) };
  if (typeof noterFaits === 'function') noterFaits(r.creations, blocsLusJusqua); /* trou du rattrapage relu : ses faits AVANT qu il recule */
  const aFaire = (r.creations || []).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.jeton || '') && !createurParBlock.has(c.jeton.toLowerCase()));
  for (let i = 0; i < aFaire.length; i += 8) {
    const lot = aFaire.slice(i, i + 8);
    const res = await Promise.all(lot.map((c) => createurDe({ rpc: rpcServeur, tx: c.tx })));
    for (let j = 0; j < lot.length; j++) { const cre = res[j] && res[j].createur; if (cre) createurParBlock.set(lot[j].jeton.toLowerCase(), String(cre).toLowerCase()); else garderNonResolu(lot[j]); }
  }
  t.relues = (t.relues || 0) + (r.creations || []).length;
  t.nouvelles = (t.nouvelles || 0) + aFaire.length;
  t.de = haut;
  if (t.de >= t.a) {
    trousRattrapage.shift();
    trousRattrapageRelus.push({ ...t, fini: new Date().toISOString() });
    if (trousRattrapageRelus.length > 50) trousRattrapageRelus.shift();
  }
  return { trou: t, haut, creations: (r.creations || []).length, nouvelles: aFaire.length };
}
/* tip 20260923-map-trending: persist trending on volume so redeploy does not wipe Map soleils */
const FICHIER_TRENDING = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'trending-cache.json') : null;
/* ⛔⛔⛔ CETTE VERSION EXISTE POUR LA FORME DU PAYLOAD, ET J AI OUBLIE DE L INCREMENTER — MESURE.
 *      Le 2026-09-30 j ai ajoute `emetteur` par ligne et `emetteurEtat` a la charge utile, deploye,
 *      puis constate en production : `emetteurEtat: ABSENT`, 0 ligne marquee, 226 lignes servies.
 *      Le corps venait du cache PERSISTE sur le volume (`FICHIER_TRENDING`), ecrit par le code
 *      d AVANT et recharge au demarrage. Le code neuf tournait ; c est l ANCIEN CORPS qui etait
 *      servi. Rien ne l aurait dit : la reponse est bien formee, juste d une forme perimee.
 *    ⇒ MEME FAMILLE QUE L ESTAMPILLE DE BUILD REUTILISEE, qui aveugle la sonde : un artefact
 *      persiste dont la FORME change et dont la VERSION ne change pas se fait passer pour frais.
 *      Tout ajout ou retrait de champ dans le payload de trending DOIT incrementer cette chaine. */
const TRENDING_CACHE_VER = 'quote-v5'; /* bump to drop bad /data caches after RPC fenetre change */
function chargerTrendingDisque() {
  try {
    if (!FICHIER_TRENDING || !existsSync(FICHIER_TRENDING)) return;
    const x = JSON.parse(readFileSync(FICHIER_TRENDING, 'utf8'));
    if (!x || typeof x !== 'object' || Array.isArray(x)) { console.log('[trending] disk cache ignored (not an object)'); return; }
    /* ⛔⛔ 2026-10-09 (audit du budget d archive) — L AVANCEMENT EST RELU AVANT LE CORPS, QUOI QU IL ARRIVE AU CORPS. Les gardes plus
     *     bas (version, ok:false, vide+ratees, forme) protegent le CORPS servi ; elles faisaient `return` AVANT cette relecture, et la
     *     sauvegarde suivante ecrivait par-dessus des listes VIDES : index des createurs, blocks connus, curseurs, drapeaux de
     *     relecture, files de trous. Un corps rejete ne jette plus que le corps (`trCache`). Chaque champ reste valide un par un. */
    for (const a of (x.adrs || [])) if (/^0x[0-9a-fA-F]{40}$/.test(a)) blocksConnus.add(a.toLowerCase());
    /* ⛔ ON RELIT L INDEX DES CREATEURS, ET ON VALIDE LES DEUX COTES : une entree mal formee gravee
     *   par une ancienne version ferait repondre l endpoint avec des adresses qui n en sont pas. */
    for (const [j, c] of (x.createurs || [])) {
      if (/^0x[0-9a-fA-F]{40}$/.test(j || '') && /^0x[0-9a-fA-F]{40}$/.test(c || '')) {
        createurParBlock.set(String(j).toLowerCase(), String(c).toLowerCase());
      }
    }
    /* les createurs NON resolus : apres l index (un block deja resolu ne revient pas), valides par `garderNonResolu` */
    if (Number.isSafeInteger(x.createursNonResolusJetes) && x.createursNonResolusJetes > 0) createursNonResolusJetes = x.createursNonResolusJetes;
    for (const c of (Array.isArray(x.createursNonResolus) ? x.createursNonResolus : [])) garderNonResolu(c);
    if (typeof x.blocsLusJusqua === "number") blocsLusJusqua = x.blocsLusJusqua;
    if (typeof x.rattrapageDepuis === "number") rattrapageDepuis = x.rattrapageDepuis;
    /* 2026-10-25 : faits des creations (chargerFaits, pres de faitsCreation). ⚠️ `typeof` : plusieurs bancs EXTRAIENT cette fonction
     *   et la font tourner avec SES seules dependances declarees ; l aide absente y est sautee, le vrai serveur l a toujours. */
    if (typeof chargerFaits === 'function') chargerFaits(x);
    /* ⛔ UNE RELECTURE, UNE SEULE : un fichier ecrit sous l ancien plafond (5 000 createurs, sans le drapeau) a perdu des entrees que
     *   le rattrapage « complet » ne relirait jamais. On repart de la tete une fois ; le drapeau persiste empeche toute autre fois. */
    if (x.createursRelecture20261009 === true) createursRelecture20261009 = true;
    else if ((x.createurs || []).length >= 5000) { rattrapageDepuis = null; createursRelecture20261009 = true; console.log('[createurs] index saved under the old 5,000 cap — full re-read from the head, once'); }
    /* les trous de creations et leur relecture survivent au redeploiement ; une entree mal formee est ignoree, jamais inventee */
    const trouSain = (t) => t && Number.isSafeInteger(t.de) && Number.isSafeInteger(t.a) && t.a > t.de;
    for (const t of (Array.isArray(x.trousRattrapage) ? x.trousRattrapage : [])) if (trouSain(t)) trousRattrapage.push({ de: t.de, a: t.a, pages: Number.isSafeInteger(t.pages) ? t.pages : null });
    for (const t of (Array.isArray(x.trousRattrapageRelus) ? x.trousRattrapageRelus : [])) if (t && Number.isSafeInteger(t.a)) trousRattrapageRelus.push(t);
    if (x.createursRelecture20261010 === true) createursRelecture20261010 = true;
    else {
      /* fichier ecrit AVANT ce correctif : les trous nommes ont pu etre jetes a chaque redeploiement — on relit tout, une fois */
      rattrapageDepuis = null; createursRelecture20261010 = true;
      console.log('[createurs] gaps were not persisted before this build — full re-read from the head, once');
    }
    for (const t of (Array.isArray(x.trousCreations) ? x.trousCreations : [])) if (trouSain(t)) trousCreations.push(t);
    bornerTrousCreations('disk load');
    for (const t of (Array.isArray(x.trousRelus) ? x.trousRelus : [])) if (t && Number.isSafeInteger(t.a)) trousRelus.push(t);
    if (x.trouSeme20261009 === true) trouSeme20261009 = true;
    console.log('[trending] progress loaded · blocksConnus=' + blocksConnus.size + ' · createurs=' + createurParBlock.size
      + ' · blocsLusJusqua=' + blocsLusJusqua + ' · rattrapageDepuis=' + rattrapageDepuis + ' · trousCreations=' + trousCreations.length
      + ' · createursNonResolus=' + createursNonResolus.length);
    /* ── a partir d ici, le CORPS seulement : un `return` ne jette que `trCache`, jamais l avancement relu ci-dessus ── */
    if (x.ver !== TRENDING_CACHE_VER || typeof x.corps !== 'string' || x.corps.length < 20) {
      console.log('[trending] disk cache ignored (ver/empty) — body only, progress kept');
      return;
    }
    let parsed = null;
    try { parsed = JSON.parse(x.corps); } catch { parsed = null; }
    /* never revive a failed empty scan — that is what hid Map soleils after tip map-trending */
    if (parsed && parsed.ok === false) { console.log('[trending] disk cache ignored (ok:false) — body only, progress kept'); return; }
    if (parsed && !(parsed.lignes || []).length && (parsed.fenetresRatees || 0) > 0 && !(parsed.blocksSuivis > 0)) {
      console.log('[trending] disk cache ignored (empty+ratees) — body only, progress kept');
      return;
    }
    /* ⛔⛔⛔ LA FORME EST VERIFIEE, PAS SEULEMENT LA VERSION — ET C EST UNE MESURE, PAS UNE PRECAUTION.
     *      Le 2026-09-30 j ai ajoute `emetteur`/`emetteurEtat`, deploye, et lu en production :
     *      `emetteurEtat: ABSENT`, 0 ligne marquee, 226 lignes servies. Le code neuf tournait ; le
     *      CORPS venait du cache persiste, ecrit par le code d avant. La reponse etait bien formee,
     *      simplement d une forme PERIMEE — rien ne pouvait le crier.
     *    ⛔ J avais oublie d incrementer `TRENDING_CACHE_VER`. Mais compter sur ma memoire pour
     *      bouger une chaine a chaque changement de champ, c est une liste blanche sans garde de
     *      derive : elle tiendra jusqu a la fois ou j oublierai. La garde SOLIDE est de refuser un
     *      corps a qui manque un champ que le code d aujourd hui produit.
     *    ⚠️ CE QU ELLE NE COUVRE PAS : un champ RENOMME cote ligne, ou un champ dont le SENS change
     *      a nom constant. La version reste donc utile ; elle n est plus seule. */
    /* ⛔⛔ LA GARDE PORTE SUR LA CHARGE **ET** SUR LA LIGNE. Verifier seulement `emetteurEtat` en
     *     tete laisserait passer un corps dont les LIGNES ont perdu un champ — et c est par ligne
     *     que l ecran decide (`quoteAdr` choisit entre une route a deux sauts et une a trois). Une
     *     garde qui ne regarde que l enveloppe est vraie et couvre la mauvaise moitie.
     *   ⛔ TOUT AJOUT DE CHAMP DOIT ETRE AJOUTE ICI, et la version bumpee. Les deux, pas l une. */
    /* 2026-10-25 : `actionsChaine` (actions-chaine.js). Le champ de ligne `routeAction` n est pas ajoute a champsLigne : tout corps qui
     *   porte `actionsChaine` a ete ecrit par le code qui pose `routeAction` sur CHAQUE ligne (null compris) — l enveloppe le garantit. */
    /* 2026-10-25 (revue, fail-closed) : `routesFermees` — un corps ecrit AVANT le fail-closed porte des lignes d action a routeAction null
     *   (Buy DexScreener) : servi au demarrage, il rendrait le Buy que la regle retire. Il est refuse ici. */
    const champsAttendus = ['emetteurEtat', 'actionsChaine', 'routesFermees'];
    /* 2026-10-17 : `achat` (verdict serveur du Buy de Market) — champ de ligne ajoute SANS bumper TRENDING_CACHE_VER (meme choix que
     *   `trousRattrapage` : la bumper jetterait l index des createurs) ; un corps d avant est refuse par cette garde, le progres garde. */
    const champsLigne = ['emetteur', 'quoteAdr', 'achat'];
    if (parsed && (parsed.lignes || []).length > 0) {
      const manque = champsAttendus.find((c) => !Object.prototype.hasOwnProperty.call(parsed, c))
        || champsLigne.find((c) => !Object.prototype.hasOwnProperty.call(parsed.lignes[0] || {}, c));
      if (manque) {
        console.log('[trending] disk cache ignored (shape: no ' + manque + ' — written by older code) — body only, progress kept');
        return;
      }
    }
    trCache = { a: Number(x.a) || 0, corps: x.corps }; /* a=0 → force refresh path still kicks background */
    console.log('[trending] disk cache loaded · blocksConnus=' + blocksConnus.size + ' · lignes=' + ((parsed && parsed.lignes) || []).length);
  } catch (e) { console.log('[trending] disk cache unread:', e.message); }
}
function sauverTrendingDisque() {
  if (!FICHIER_TRENDING || !trCache.corps) return;
  try {
    let parsed = null;
    try { parsed = JSON.parse(trCache.corps); } catch { parsed = null; }
    if (parsed && !(parsed.lignes || []).length && (parsed.fenetresRatees || 0) > 0 && !(parsed.blocksSuivis > 0)) {
      console.log('[trending] skip disk save (empty+ratees)');
      return;
    }
    /* ⛔⛔ 2026-10-09 (revue de la Map) : `slice(-2000)` jetait ~600 blocks connus A CHAQUE DEPLOIEMENT (mesure en prod :
     *   blocksSuivis 2 622 -> 2 024 entre deux lectures, blocksAvecPaire 65 -> 56). Le tri etait l ordre d insertion : un block
     *   ancien AVEC un marche vivant partait avant un block recent sans marche. Maintenant : les blocks des lignes servies (ceux
     *   qui ont une paire, donc ceux de la Map) passent D ABORD, jamais coupes ; le reste, du plus recent au plus ancien, jusqu a
     *   ADRS_DISQUE_MAX. Ce qui est coupe est COMPTE dans le journal. ⚠️ Plafond garde : chaque bloc connu coute une place dans les
     *   lots DexScreener (30 par appel) a chaque rafraichissement. */
    if (createurParBlock.size > CREATEURS_DISQUE_MAX) console.log('[createurs] disk save keeps ' + CREATEURS_DISQUE_MAX + '/' + createurParBlock.size + ' — ' + (createurParBlock.size - CREATEURS_DISQUE_MAX) + ' oldest dropped');
    const ADRS_DISQUE_MAX = 5000;
    const avecPaire = new Set(((parsed && parsed.lignes) || []).map((l) => String((l && l.adr) || '').toLowerCase()).filter((a) => blocksConnus.has(a)));
    const autres = [...blocksConnus].filter((a) => !avecPaire.has(a));
    const gardes = [...avecPaire, ...autres.slice(-Math.max(0, ADRS_DISQUE_MAX - avecPaire.size))];
    if (gardes.length < blocksConnus.size) console.log('[trending] disk save keeps ' + gardes.length + '/' + blocksConnus.size + ' known blocks (' + avecPaire.size + ' with a pair, all kept) — ' + (blocksConnus.size - gardes.length) + ' oldest without a pair dropped');
    const payload = JSON.stringify({
      ver: TRENDING_CACHE_VER, a: trCache.a, corps: trCache.corps, blocsLusJusqua,
      adrs: gardes,
      /* ⛔⛔ L INDEX DES CREATEURS EST PERSISTE, SINON IL REPART DE ZERO A CHAQUE DEPLOIEMENT — et
       *     comme il ne se remplit qu avec les creations VUES depuis le dernier scan, un index
       *     volatil ne rattraperait JAMAIS le passe. Les gens reperdraient leurs blocks a chaque
       *     mise en ligne : exactement le defaut qu on repare.
       *   ⛔ 5000 ENTREES AU PLUS, et c est dit : le fichier reste borne. Un plafond tacite qui
       *     ferait disparaitre des entrees sans le signaler serait le meme defaut sous un autre nom. */
      /* ⛔⛔ 2026-10-09 (mesure prod : `blocksIndexes: 5001`, `couvertureComplete: true`) — le plafond de 5 000 COUPAIT l index a
       *   chaque sauvegarde, et le rattrapage, « complet », ne relisait jamais ce qui etait coupe. Plafond 100 000 ; ce qui depasse
       *   est COMPTE dans le journal. */
      createurs: [...createurParBlock.entries()].slice(-CREATEURS_DISQUE_MAX),
      createursRelecture20261009,
      /* ⛔ L AVANCEMENT DU RATTRAPAGE EST PERSISTE AVEC L INDEX : sans lui, chaque deploiement
       *   recommencerait a remonter depuis le present et ne finirait JAMAIS le passe. */
      rattrapageDepuis,
      /* ⛔ la file est bornee la ou elle grandit (`bornerTrousCreations`, qui fond sans jeter) : cette coupe n agit pas, et si elle
       *   agissait elle garderait [0], le trou en cours de relecture — l ancien `slice(-50)` le jetait en premier. */
      trousCreations: trousCreations.slice(0, TROUS_CREATIONS_MAX), trousRelus: trousRelus.slice(-50), trouSeme20261009,
      /* les createurs non resolus (bornes par `garderNonResolu`) et le compte de ceux que la borne a jetes */
      createursNonResolus, createursNonResolusJetes,
      /* ⛔ les trous du rattrapage des createurs : persistes, sinon un redeploiement les efface et « complet » ment. Champ ajoute
       *   SANS changer TRENDING_CACHE_VER : la changer jetterait tout le cache, index des createurs compris ; un ancien fichier
       *   sans ce champ se relit comme « aucun trou », et c est la relecture unique ci-dessus qui couvre ce cas. */
      trousRattrapage: trousRattrapage.slice(-200), trousRattrapageRelus: trousRattrapageRelus.slice(-50), createursRelecture20261010,
      /* 2026-10-25 : les faits des creations recentes (bornes par FAITS_PROFONDEUR) et le bloc depuis lequel ils sont complets.
       *   Sans eux, chaque deploiement remettrait `faitsDepuis` a la tete : la Wallet et la Map reliraient 24 h depuis le navigateur. */
      ...(typeof faitsPourDisque === 'function' ? faitsPourDisque() : {}), /* typeof : voir chargerFaits */
    });
    writeFileSync(FICHIER_TRENDING + '.tmp', payload);
    /* 2026-10-26 : sous Windows, un lecteur qui tient le fichier fait echouer le renommage (EPERM/EBUSY/EACCES, vu 1 fois sur 4 dans
     *   test-creations-index-serveur) ; la sauvegarde etait perdue jusqu a la passe suivante. Trois essais, 50 ms d ecart, puis
     *   l erreur part au journal comme avant. Linux (prod) ne verrouille pas : le premier essai passe. */
    for (let essai = 0; ; essai++) {
      try { renameSync(FICHIER_TRENDING + '.tmp', FICHIER_TRENDING); break; } catch (e) {
        if (essai >= 2 || !/^(EPERM|EBUSY|EACCES)$/.test(String(e && e.code))) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
  } catch (e) { console.log('[trending] disk cache write failed:', e.message); }
}
chargerTrendingDisque();
function trendingPlaceholder() {
  return JSON.stringify({
    ok: true, lu: new Date().toISOString(), blocksSuivis: blocksConnus.size,
    fenetresRatees: 0, lotsMarche: { ok: 0, ko: 0, statuts: {} },
    lignes: [], blocksAvecPaire: 0, volume24hUsd: 0,
    enCours: true,
    pourquoi: 'Trending refresh in progress — Map soleils will fill when the scan finishes.',
  });
}
function trending() {
  if (trCache.corps && Date.now() - trCache.a < 300_000) return Promise.resolve(trCache.corps);
  if (!trEnCours) trEnCours = lireTrending().finally(() => { trEnCours = null; });
  /* tip 20260923-map-trending: NEVER hang HTTP on cold scan — return disk/memory cache or placeholder */
  if (trCache.corps) return Promise.resolve(trCache.corps);
  return Promise.resolve(trendingPlaceholder());
}
async function lireTrending() {
  let corps;
  try {
    const fin = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    /* cold: 12h first (not 3d) so public RPC can finish; then incremental */
    const blocs = blocsLusJusqua === null ? 3 * 43200 : Math.max(1, fin - blocsLusJusqua); /* tip map-alive: 3d cold OK now fenetre≤999 */
    console.log('[trending] scan start · blocs=' + blocs + ' · connus=' + blocksConnus.size);
    /* ⛔⛔ 2026-10-09 : `rpcScanCreations` et non `rpcServeur` — base.org refusait tout getLogs (429), le scan
     *     restait a `fenetresRatees: 40` et aucun block ne depuis le 2026-10-07 n entrait dans l index. Voir repli-logs.js. */
    const cr = await listerCreations({ rpc: rpcScanCreations, blocs, fin });
    for (const c of cr.creations || []) if (/^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')) blocksConnus.add(c.jeton.toLowerCase());
    if (typeof noterFaits === 'function') noterFaits(cr.creations, fin); /* AVANT que blocsLusJusqua n avance (plus bas) : le navigateur croit le serveur jusqu a lui */
    /* ⛔⛔ ON RETIENT LE CREATEUR DE CHAQUE NOUVELLE CREATION. C est ce qui permet a n importe qui de
     *     retrouver SES blocks, d une machine ou d une autre, sans fenetre de 24 h.
     *   ⛔ SEULEMENT LES NOUVELLES : re-resoudre tout l index a chaque scan ferait des milliers
     *     d appels pour un resultat qui ne change jamais. Un createur ne change pas.
     *   ⛔ ET UN ECHEC DE RESOLUTION N EST PAS UN CREATEUR NUL : `createurDe` rend `null` avec une
     *     raison quand la transaction n a pas pu etre lue. On ne l enregistre PAS — sinon on
     *     graverait « personne » pour un block dont on n a simplement pas pu lire la tx, et la
     *     prochaine passe ne reessaierait jamais. */
    try {
      const aResoudre = (cr.creations || []).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')
        && !createurParBlock.has(c.jeton.toLowerCase()));
      for (let i = 0; i < aResoudre.length; i += 8) {
        const lot = aResoudre.slice(i, i + 8);
        const res = await Promise.all(lot.map((c) => createurDe({ rpc: rpcServeur, tx: c.tx })));
        for (let j = 0; j < lot.length; j++) {
          const cre = res[j] && res[j].createur;
          if (cre) createurParBlock.set(lot[j].jeton.toLowerCase(), String(cre).toLowerCase());
          else garderNonResolu(lot[j]); /* le scan vers l avant ne repassera plus ici : sans la liste, ce block etait perdu */
        }
      }
      if (aResoudre.length) {
        console.log('[createurs] ' + createurParBlock.size + ' block(s) rattache(s) a un createur ('
          + aResoudre.length + ' resolu(s) ce scan)');
      }
    } catch (e) { console.log('[createurs] resolution partielle : ' + e.message); }
    /* 2026-10-25 : une creation dont tx.from (resolu ci-dessus) est le createur de l emetteur devient CANDIDATE (actions-chaine.js la prouve) */
    try { retenirCreationsEmetteur(cr.creations, (j) => createurParBlock.get(j) || null); } catch (e) { console.log('[actions] issuer creations not kept this scan: ' + e.message); }
    /* ⛔⛔ ET LE PASSE, SANS QUOI LE CORRECTIF NE REPARE RIEN. L index ci-dessus ne se remplit que
     *     vers L AVANT : il resout les createurs des creations qu il VOIT PASSER. Mesure juste
     *     apres la mise en ligne : `blocksIndexes: 1` pour `blocksSuivis: 1967`. Les blocks deja
     *     crees — c est-a-dire TOUS ceux des gens aujourd hui — n auraient jamais ete rattaches.
     *     Un correctif qui ne couvre que l avenir laisse le probleme entier a ceux qui l ont signale.
     *   ⇒ On remonte donc le temps par fenetres, UNE PAR PASSE, et on persiste l avancement. Le
     *     serveur rattrape en tache de fond au lieu de marteler le noeud public d un coup.
     *   ⛔ UNE SEULE FENETRE PAR PASSE, ET C EST DELIBERE : le noeud public plafonne, et un
     *     rattrapage qui le fait tomber couterait la lecture de marche de tout le monde. Lent et
     *     vivant vaut mieux que rapide et refuse.
     *   ⛔ ET LE PLANCHER EST LE PREMIER BLOCK DE TBLOCK : au-dela il n y a rien a lire. Descendre
     *     plus bas serait scanner le vide indefiniment. */
    try {
      if (rattrapageDepuis === null) rattrapageDepuis = fin;
      /* ⛔ budget d archive epuise : on n essaie meme pas (le refus est certain), on ne compte rien, on ne descend pas. Dit une fois
       *   par jour dans le journal. */
      if (rattrapageDepuis > PREMIER_BLOCK_TB && RPC_ARCHIVE && archiveEpuisee()) {
        if (attenteBudgetDite !== archiveCompte.jour) { attenteBudgetDite = archiveCompte.jour; console.log('[createurs] archive budget spent for ' + archiveCompte.jour + ' — the walk back waits at ' + rattrapageDepuis + ' (no window skipped)'); }
      } else if (rattrapageDepuis > PREMIER_BLOCK_TB) {
        const haut = rattrapageDepuis;
        /* ⛔⛔ 10 000 ET NON 43 200, ET C EST UNE MESURE QUI L A IMPOSE. `listerCreations` pagine en
         *     interne par 2000 blocs : une fenetre de 43 200 fait donc 22 pages, et le log de
         *     production disait « +0 · ⛔ 2 fenetre(s) refusee(s), on ne descend pas ». Plus la
         *     fenetre est large, plus la probabilite qu AU MOINS UNE page soit refusee monte — et
         *     ma garde conservatrice bloquait alors la descente ENTIERE. Le rattrapage etait fige.
         *   ⇒ Cinq pages au lieu de vingt-deux : bien moins d occasions de tomber sur un refus. */
        /* ⛔ 2026-10-09 : avec le noeud d archive, 100 000 blocs par passe et directement chez lui (rpcHistoire) — une relecture
         *   complete en ~16 passes au lieu de ~150. Sans lui, la regle d avant (10 000, chaine de repli) reste. */
        const bas = Math.max(PREMIER_BLOCK_TB, haut - (RPC_ARCHIVE ? 100000 : 10000));
        const vieux = await listerCreations({ rpc: RPC_ARCHIVE ? rpcHistoire : rpcServeur, blocs: haut - bas, fin: haut });
        if (typeof noterFaits === 'function') noterFaits(vieux.creations, fin);
        const aFaire = (vieux.creations || []).filter((c) => /^0x[0-9a-fA-F]{40}$/.test(c.jeton || '')
          && !createurParBlock.has(c.jeton.toLowerCase()));
        for (let i = 0; i < aFaire.length; i += 8) {
          const lot = aFaire.slice(i, i + 8);
          const res = await Promise.all(lot.map((c) => createurDe({ rpc: rpcServeur, tx: c.tx })));
          for (let j = 0; j < lot.length; j++) {
            const cre = res[j] && res[j].createur;
            if (cre) createurParBlock.set(lot[j].jeton.toLowerCase(), String(cre).toLowerCase());
            else garderNonResolu(lot[j]); /* le curseur descend quand meme : sans la liste, ce block etait perdu */
          }
        }
        /* ⛔⛔ AVANT : « on n avance QUE si la fenetre a ete lue ». L INTENTION ETAIT JUSTE — ne
         *     jamais sauter de creations en silence — MAIS SA CONSEQUENCE ETAIT UN BLOCAGE
         *     PERMANENT. Mesure en production : « +0 · 2 fenetre(s) refusee(s), on ne descend
         *     pas », curseur immobile sur deux deploiements. Un rattrapage qui n avance jamais ne
         *     rattrape rien : la prudence absolue devenait la panne.
         *   ⇒ LA BONNE REPONSE N EST PAS DE SAUTER EN SILENCE, C EST DE SAUTER EN L ECRIVANT.
         *     On reessaie la MEME fenetre deux fois ; a la troisieme on descend quand meme, et on
         *     GARDE la plage manquee dans `trousRattrapage`, que l endpoint publie. Un trou connu
         *     et nomme vaut infiniment mieux qu un index qui ne finit jamais — et infiniment mieux
         *     qu un trou invisible. */
        if (!(vieux.fenetresRatees || []).length) {
          rattrapageDepuis = bas; refusDeSuite = 0;
        } else if (refusDeBudget(vieux.fenetresRatees)) {
          /* le budget s est epuise PENDANT la fenetre : ce n est pas un refus du noeud — on ne compte pas, on reprendra la meme */
        } else if (++refusDeSuite >= 3) {
          trousRattrapage.push({ de: bas, a: haut, pages: (vieux.fenetresRatees || []).length });
          if (trousRattrapage.length > 200) trousRattrapage.shift();
          rattrapageDepuis = bas; refusDeSuite = 0;
          console.log('[createurs] ⛔ TROU assume ' + bas + '..' + haut + ' apres 3 refus — on descend, et on le DIT');
        }
        console.log('[createurs] rattrapage ' + bas + '..' + haut + ' · +' + aFaire.length
          + ' · index=' + createurParBlock.size + '/' + blocksConnus.size
          + (rattrapageDepuis <= PREMIER_BLOCK_TB ? ' · COMPLET' : '')
          + ((vieux.fenetresRatees || []).length ? ' · ⛔ ' + vieux.fenetresRatees.length + ' fenetre(s) refusee(s), on ne descend pas (1re cause : '
            + masquerCle(String(vieux.fenetresRatees[0].cause || '?')).slice(0, 80) + ')' : ''));
      }
    } catch (e) { console.log('[createurs] rattrapage interrompu : ' + e.message); }
    /* ⛔⛔ 2026-10-09 — LES TROUS SE RELISENT maintenant qu un noeud d archive est pose (sans lui, relireUnTrou ne fait rien). */
    try {
      if (RPC_ARCHIVE && !trouSeme20261009) { trousCreations.unshift({ ...TROU_MESURE_20261009 }); trouSeme20261009 = true; }
      bornerTrousCreations('seed'); /* la graine entre en [0] : une file deja pleine ne depasse pas la borne (sans effet sinon) */
      const rt = await relireUnTrou();
      if (rt) console.log('[trous] ' + (rt.ratees ? '⛔ relecture ' + rt.trou.de + '..' + rt.haut + ' incomplete (' + rt.ratees + ' page(s) refusee(s)' + (rt.budget ? ', archive budget' : '') + ') — le trou reste'
        : 'relu ' + rt.haut + ' · ' + rt.creations + ' creation(s), ' + rt.nouvelles + ' nouvelle(s) · restent ' + trousCreations.length + ' trou(s)'));
    } catch (e) { console.log('[trous] relecture interrompue : ' + e.message); }
    try {
      const rr = await relireUnTrouRattrapage();
      if (rr) console.log('[createurs] ' + (rr.ratees ? '⛔ gap ' + rr.trou.de + '..' + rr.haut + ' not re-read (' + rr.ratees + ' page(s) refused' + (rr.budget ? ', archive budget' : '') + ') — the gap stays'
        : 'gap re-read up to ' + rr.haut + ' · ' + rr.creations + ' creation(s), ' + rr.nouvelles + ' creator(s) resolved · ' + trousRattrapage.length + ' gap(s) left'));
    } catch (e) { console.log('[createurs] gap re-read interrupted : ' + e.message); }
    try {
      const rn = await relireNonResolus();
      if (rn) console.log('[createurs] unresolved creators retried · ' + rn.resolus + '/' + rn.essayes + ' resolved · ' + rn.restent + ' left');
    } catch (e) { console.log('[createurs] unresolved retry interrupted : ' + e.message); }
    console.log('[trending] scan done · creations=' + (cr.creations || []).length + ' · ratees=' + (cr.fenetresRatees || []).length + ' · connus=' + blocksConnus.size);
    /* advance if any creations read OR zero ratees; partial progress beats permanent hang */
    if (!(cr.fenetresRatees || []).length || (cr.creations || []).length) {
      /* ⛔ 2026-10-09 (relecture adverse du repli publicnode) : avancer avec des fenetres refusees SAUTE ces fenetres pour de bon —
       *   publicnode ne sert pas l archive (403 des ~-9 000 blocs). Le saut est donc NOTE (borne, fenetres), garde en memoire et
       *   rendu par /sante, pour qu un noeud d archive puisse un jour les relire au lieu de les oublier en silence. */
      if ((cr.fenetresRatees || []).length) {
        trousCreations.push({ de: blocsLusJusqua === null ? fin - blocs : blocsLusJusqua, a: fin, fenetres: cr.fenetresRatees.length, t: new Date().toISOString() });
        bornerTrousCreations('forward scan'); /* ⛔ avant : plafond 50, `splice(0, …)` jetait [0] (le trou en relecture) sans un mot */
        console.log('[trending] ⛔ ' + cr.fenetresRatees.length + ' fenetre(s) refusee(s) sautee(s) — notees dans /sante.trousCreations');
      }
      /* ⛔ 2026-10-25 : le premier scan qui AVANCE fixe `faitsDepuis` a son debut — chaque creation lue depuis porte ses faits */
      if (typeof faitsScanAvance === 'function') faitsScanAvance(fin - blocs); /* typeof : voir chargerFaits */
      blocsLusJusqua = fin;
    }
    /* ── ⛔⛔ LES ACTIFS QU ON PROPOSE SOI-MEME EN PAIRE DOIVENT ETRE VUS ─────────────────────
     *     MESURE DU 2026-09-27, DexScreener interroge adresse par adresse sur les dix actions du
     *     registre `ACTIONS_COINBASE` : 10/10 ont une paire liquide, et 0/10 apparaissaient ici.
     *         MSTRc 4 914 070 $ de volume 24 h · METAc 3 312 309 $ · SNDKc 3 008 424 $
     *         GOOGLc 2 920 423 $ · AAPLc 2 792 105 $ · MSFTc 1 970 633 $ · NVDAc 1 765 509 $
     *     ≈ 20 M$ PAR JOUR, toutes sur Aerodrome — invisibles dans notre propre ecran.
     *   ⇒ CAUSE : `blocksConnus` ne contient que les creations B20 que NOTRE indexeur a scannees.
     *     Ces dix sont anterieures a la fenetre, donc elles n y entrent jamais. Le filtre
     *     `connus.has(adr)` de `resumerTrending` les jetait ensuite en silence — et c est un bon
     *     filtre : sans lui, n importe quel jeton renvoye par DexScreener entrerait dans la liste.
     *   ⇒ ON NE TOUCHE PAS AU FILTRE. On ajoute au jeu de reference les adresses que L APP ELLE-MEME
     *     propose en paire : elles sont ecrites dans notre registre, pas devinees sur la chaine.
     * ⛔ `Set` PUIS ETALEMENT : une adresse deja connue ne doit pas etre interrogee deux fois chez
     *   DexScreener — les lots sont de 30 et chaque doublon coute une place a un vrai block. */
    for (const p of pairesProposees(8453)) {
      if (p && p.adr && /^0xb2[0-9a-fA-F]{38}$/i.test(String(p.adr))) blocksConnus.add(String(p.adr).toLowerCase());
    }
    /* ⛔⛔ 2026-10-25 — ET LES ACTIONS DE L EMETTEUR PROUVEES SUR LA CHAINE (actions-chaine.js), pas seulement nos 71 : 202 emises au
     *   24/10. Seule une action PROUVEE entre ici — un prefixe 0xb2 ou un evenement ne suffisent pas. Lue AVANT DexScreener, sinon une
     *   action hors de notre fenetre de scan n y serait jamais demandee (meme cause que la mesure du 2026-09-27 ci-dessus). */
    const em = await actionsEmetteurServies();
    const ac = await actionsChaineTour(em);
    for (const a of ac.prouvees) blocksConnus.add(a);
    const adrs = [...blocksConnus], paires = [];
    /* ⛔⛔ BUG EN PROD (2026-09-19, capture de Phil) : « 0 blocks with a live market · $0 traded » et « Nothing is
     *    moving right now » — alors que 1 095 blocks etaient suivis. DexScreener n avait rien rendu, et `if (r.ok)`
     *    AVALAIT chaque refus sans le compter : un echec de lecture publie comme un marche calme. Chaque lot est
     *    maintenant compte (statut HTTP garde), un refus 429 est reessaye, et si AUCUN lot n a abouti on GARDE
     *    la derniere bonne liste au lieu de l ecraser par un vide. */
    const statuts = {};
    let lotsOk = 0, lotsKo = 0;
    for (let i = 0; i < adrs.length; i += 30) {
      let fait = false;
      for (let essai = 0; essai < 3 && !fait; essai++) {
        try {
          const r = await fetch('https://api.dexscreener.com/tokens/v1/base/' + adrs.slice(i, i + 30).join(','),
            { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
          statuts[r.status] = (statuts[r.status] || 0) + 1;
          if (r.ok) { const j = await r.json(); if (Array.isArray(j)) paires.push(...j); fait = true; }
          else if (r.status !== 429) break;
          else await new Promise((ok) => setTimeout(ok, 2000 * (essai + 1)));
        } catch (e) { statuts.erreur = (statuts.erreur || 0) + 1; }
      }
      if (fait) lotsOk++; else lotsKo++;
      await new Promise((ok) => setTimeout(ok, 250));
    }
    if (!lotsOk && lotsKo) {
      throw new Error('DexScreener refused all ' + lotsKo + ' reads (' + JSON.stringify(statuts) + ')');
    }
    /* 2026-10-26 : les poolId v4 et leur date, vus ici, deviennent les indices de cle des blocks suivis (clesParIndices) */
    try { retenirIndicesPoolId(paires, blocksConnus); } catch (_) { /* sans indice : la recherche par profondeur d avant */ }
    /* ⛔⛔ LA LISTE DE L EMETTEUR, LUE ICI POUR QUE CHAQUE LIGNE PORTE SON ORIGINE. Decision de Phil
     *     du 2026-09-30 : « Biggest blocks » garde les actions tokenisees, avec l origine DITE.
     *   ⛔ Notre registre en porte 15, l emetteur en declare 40 : marquer seulement les 15
     *     laisserait GMEc, DJTc, NFLXc, AMDc, RDDTc, HTZc, PFEc… non marquees, et une ligne non
     *     marquee se lit « block lance ici ». La retombee le SIGNALE au lieu de le taire. */
    /* la marque d origine : la liste de l emetteur (toutes ses pages) PLUS les actions prouvees sur la chaine — une API muette ne
     *   ramene plus la marque a nos 15 quand la chaine en a prouve 202 */
    const marquees = [...new Set([...em.adresses, ...ac.prouvees])];
    const marqueesSet = new Set(marquees);
    const resume = resumerTrending(paires, adrs, { max: 400, actionsEmetteur: marquees }); /* tip 0038 : tous les blocks vivants pour la map (Trade en montre 40) */
    /* la route de chaque action prouvee hors table : `routeAction` sur la ligne (null partout ailleurs, pour que la forme ne varie pas) */
    let listees = 0;
    /* ⛔⛔ 2026-10-25 (revue) — FAIL-CLOSED. Toute ligne d ACTION (liste de l emetteur, prouvee, graine du recensement, table mesuree)
     *   porte un verdict : celui de sa route (memoire ou disque, avec son bloc), ou ROUTE_EN_COURS (pas de Buy, « checking »). Elle ne
     *   retombe plus sur le verdict DexScreener le temps que sa route soit lue, ni apres un redemarrage. Les autres lignes : null. */
    const estAction = (a) => ac.prouvees.has(a) || marqueesSet.has(a) || CREATIONS_GRAINE.has(a) || POOLS_ACTIONS_AERODROME.has(a);
    for (const l of resume.lignes || []) {
      const a = String(l.adr || '').toLowerCase();
      if (ac.prouvees.has(a)) listees += 1;
      l.routeAction = estAction(a) ? routePourLigne({ v: ac.prouvees.has(a) ? routesActions.get(a) : null, table: POOLS_ACTIONS_AERODROME.get(a) || null }) : null;
    }
    const actionsChaine = resumeActions({ tour: ac.tour, unites: new Map([...unitesActions].map(([k, v]) => [k, v.v])),
      routes: new Map([...routesActions].map(([k, v]) => [k, v.r])), table: new Set(POOLS_ACTIONS_AERODROME.keys()), listees, emetteurEtat: em.etat, emetteurCompte: em.adresses.length });
    actionsChaine.liste = ((ac.tour && ac.tour.prouvees) || []).map((p) => {
      const u = unitesActions.get(p.adr), r = routesActions.get(p.adr);
      return { adr: p.adr, sym: p.symbole || p.symboleEmetteur || null, unites: u && u.v !== null ? String(u.v) : null,
        table: POOLS_ACTIONS_AERODROME.has(p.adr), route: r ? (r.r.achetable ? 'ACHETABLE' : r.r.code) : null,
        perteBps: r && r.r.perteBps !== undefined ? r.r.perteBps : null, bloc: r && r.r.bloc ? r.r.bloc : null,
        /* 2026-10-25 : la raison MESUREE d un refus — le Market la dit sous le nom d une action a unites que DexScreener ne rend pas */
        phrase: r && r.r && r.r.achetable === false && typeof r.r.phrase === 'string' ? r.r.phrase.slice(0, 220) : null };
    });
    /* le cout, servi : appels du dernier tour (par usage) et somme sur l heure glissante */
    actionsChaine.appels = { dernierTour: appelsActions.dernierTour, heure: appelsActions.heure.reduce((s, x) => s + x.n, 0), toursHeure: appelsActions.heure.length };
    const achatMarche = await achatsMarche(resume.lignes);
    /* 2026-10-26 : les lignes sans cle connue sont cherchees par leur poolId EN FOND, apres le Buy de ce tour (borne par tour, une
     *   seule recherche a la fois) : une cle lue entre dans clesCache et le Buy du tour SUIVANT la juge. Le tour de trending ne
     *   l attend pas (meme duree qu avant, y compris sur un noeud qui refuse). Le compte servi est celui de la derniere recherche finie. */
    achatMarche.clesParPoolId = clesParIdDernier;
    lancerClesParIndicesEnFond(resume.lignes || []);
    corps = JSON.stringify({ ok: true, lu: new Date().toISOString(), blocksSuivis: adrs.length,
      fenetresRatees: (cr.fenetresRatees || []).length, lotsMarche: { ok: lotsOk, ko: lotsKo, statuts },
      emetteurEtat: em.etat, emetteurCompte: em.adresses.length, achatMarche, actionsChaine, routesFermees: true,
      ...resume });
  } catch (e) {
    corps = trCache.corps || JSON.stringify({ ok: false, pourquoi: 'Trending not read: ' + String(e && e.message || e).slice(0, 80) });
  }
  trCache = { a: Date.now(), corps };
  sauverTrendingDisque();
  return corps;
}
/* ══ 2026-10-17 — LE BUY DE MARKET, JUGE ICI, PAR LIGNE (achat-marche.js) ═══════════════════════════════════════════════════════
 * ⛔⛔ MESURE (prod, 17:12Z) : 28 des 33 lignes qui avaient Buy par la decouverte CLIENT ne cotaient pas au Quoter (faux Buy) ; 16 lignes
 *   sans Buy avaient une pool ETH qui cote. Le client ne juge plus les pools tierces : il lit `achat` sur chaque ligne.
 * ⛔ AUCUNE LECTURE DE LOGS ICI : seules les cles DEJA connues du serveur (clesCache = /api/cle et volume ; clesPool = cles mesurees /
 *   resolues) entrent. Une ligne sans cle connue rend `achat: null` et est COMPTEE (sansCle) — « pas de Buy » n est pas « pas de marche ».
 * ⛔ LE DEVIS COUTE UN eth_call PAR POOL CANDIDATE (lecteur large rpcRails) : le verdict d un jeton est garde ACHAT_CACHE_MS (une pool
 *   peut se vider ou se remplir ; sa cle, elle, ne change pas) et le tour est borne a ACHAT_DEVIS_MAX devis — au-dela, `achat: null`
 *   et le compte `nonMesures` le dit. Les sources TB sont chargees AVANT de juger (sinon tout B20 inconnu est un block : fail-closed). */
const ACHAT_CACHE_MS = 10 * 60 * 1000;
const ACHAT_DEVIS_MAX = 120;
const achatsParJeton = new Map();
/** Les cles de pool que ce serveur connait DEJA pour un jeton (cache /api/cle + cles mesurees), dedoublonnees par poolId. Zero lecture. */
function clesConnuesServeur(jeton) {
  const t = String(jeton || '').toLowerCase(), vues = new Set(), out = [];
  for (const src of [clesCache.get(t), clesPool.get(t)]) {
    for (const c of (src && src.ok === true && Array.isArray(src.cles)) ? src.cles : []) {
      const id = String(c && c.poolId || '').toLowerCase();
      if (!c || !c.currency0 || !c.currency1 || vues.has(id)) continue;
      vues.add(id);
      out.push({ currency0: c.currency0, currency1: c.currency1, fee: c.fee, tickSpacing: c.tickSpacing, hooks: c.hooks });
    }
  }
  return out;
}
async function achatsMarche(lignes) {
  const compte = { lignes: 0, sansCle: 0, achetables: 0, refusees: 0, nonMesures: 0, devis: 0, depuisCache: 0, lecturesCause: 0, refusCauses: {}, lu: new Date().toISOString() };
  try { chargerIndexRouteur(JSON.parse(blocksRouteurCorps())); chargerNosBlocksTb(JSON.parse(nosBlocksCorps())); } catch (_) { /* sources non lues : fail-closed */ }
  compte.sourcesTbLues = sourcesTbLues();
  let quoter;
  try { quoter = quoterV4({ rpc: rpcRails, chaine: 8453 }); } catch (e) { quoter = null; compte.pourquoi = String(e.message || e); }
  const compteur = async (cle, montant) => { compte.devis += 1; return quoter(cle, montant); };
  for (const l of (Array.isArray(lignes) ? lignes : [])) {
    compte.lignes += 1;
    l.achat = null;
    l.achatRefus = null;
    const jeton = String(l && l.adr || '').toLowerCase();
    const cles = clesConnuesServeur(jeton);
    if (!cles.length) { compte.sansCle += 1; continue; }
    const empreinte = jeton + '|' + cles.map((c) => String(c.hooks).toLowerCase() + ':' + c.fee + ':' + c.tickSpacing + ':' + String(c.currency0).toLowerCase()).sort().join(',');
    const garde = achatsParJeton.get(jeton);
    let v = garde && garde.empreinte === empreinte && Date.now() - garde.t < ACHAT_CACHE_MS ? garde.v : null;
    if (v) compte.depuisCache += 1;
    else if (!quoter || compte.devis >= ACHAT_DEVIS_MAX) { compte.nonMesures += 1; continue; }
    else {
      try { v = await verdictAchatMarche({ jeton, cles, quoter: compteur }); }
      catch (e) { compte.nonMesures += 1; continue; }
      /* une lecture ratee (nonCotees sans aucune pool qui cote) n est pas gardee : elle sera relue au tour suivant */
      const lectureRatee = !v.achetable && v.essayees > 0 && v.nonCotees.some((x) => !/revert|quoted zero/i.test(x.raison));
      /* 2026-10-26 (pool-lanceur-taxe.js) : une pool v4 a hook tiers que le Quoter refuse -> sa cause LUE (liquidite en cours, taxBps du
       *   hook), dite sur la ligne. 2 a 3 eth_call, seulement au premier jugement du jeton (garde ACHAT_CACHE_MS avec le verdict). */
      if (!lectureRatee && !v.achetable && v.nonCotees.length) {
        const k = v.nonCotees[0];
        try {
          const cle = { currency0: k.currency0, currency1: k.currency1, fee: k.fee, tickSpacing: k.tickSpacing, hooks: k.hooks };
          const cause = await lireCauseRefusPool({ appel: (to, data) => rpcRails('eth_call', [{ to, data }, 'latest']),
            stateView: V4_ADRESSES[8453].stateView, cle, poolId: poolIdV4(cle) });
          compte.lecturesCause += 1;
          v = { ...v, refus: phraseRefusPool(cause) };
        } catch (_) { /* cause non lue : la phrase generale reste */ }
      }
      /* ⛔ game374 (audit R-launch-5): a QUOTED pool on a third-party hook could get a Buy while that hook taxes resale at 99.99 % (prod
       *   /api/trending 2026-11-12: 3 rows). The hook's taxBps() is now read BEFORE the Buy (pool-lanceur-taxe.js gardeTaxeAvantAchat):
       *   a tax above TAXE_MAX_FRACTION -> refused with TAXE_REVENTE (kept with the verdict); not read -> no Buy this round, not kept. */
      if (!lectureRatee && v.achetable && v.cle && !estNotreHookAchat(v.cle.hooks)) {
        const taxe = await gardeTaxeAvantAchat({ appel: (to, data) => rpcRails('eth_call', [{ to, data }, 'latest']), hook: v.cle.hooks });
        compte.lecturesTaxe = (compte.lecturesTaxe || 0) + 1;
        if (taxe && taxe.code === 'TAXE_NON_LUE') { compte.nonMesures += 1; continue; }
        if (taxe) v = { ...v, achetable: false, refus: taxe };
      }
      if (!lectureRatee) achatsParJeton.set(jeton, { t: Date.now(), empreinte, v });
      if (lectureRatee) { compte.nonMesures += 1; continue; }
    }
    if (v.achetable) {
      compte.achetables += 1;
      l.achat = { cle: v.cle, quote: String(v.quote), montant: String(v.montant), fraisPar: v.fraisPar, lu: compte.lu };
    } else {
      compte.refusees += 1;
      if (v.refus && v.refus.code) {
        l.achatRefus = { code: v.refus.code, phrase: v.refus.phrase };
        compte.refusCauses[v.refus.code] = (compte.refusCauses[v.refus.code] || 0) + 1;
      }
    }
  }
  if (achatsParJeton.size > 5000) for (const k of [...achatsParJeton.keys()].slice(0, achatsParJeton.size - 5000)) achatsParJeton.delete(k);
  console.log('[achat-marche] ' + compte.achetables + ' achetable(s) / ' + compte.lignes + ' lignes · ' + compte.sansCle + ' sans cle connue · '
    + compte.refusees + ' refusee(s) (causes lues ' + JSON.stringify(compte.refusCauses) + ') · ' + compte.nonMesures + ' non mesuree(s) · ' + compte.devis + ' devis (' + compte.depuisCache + ' du cache)'
    + (compte.sourcesTbLues ? '' : ' · ⛔ sources TB non lues : tout B20 inconnu juge en block'));
  return compte;
}
/* tip 20260923-map-trending: kick background scan; HTTP never waits on cold lireTrending */
setTimeout(() => { void consommateurArchive.run('fond trending (demarrage)', () => lireTrending()); }, 1500); /* always rescans on boot; HTTP stays fail-open via trending() */

const ici = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8', /* 2026-10-03 : llms.txt */
};

/* ⛔ CE QUI EST SERVI, NOMME UN PAR UN. Ajouter un fichier a l app demande de l ajouter ici — c est
 * volontairement un peu penible : la meme discipline a deja evite qu un module importe mais non
 * declare parte en production en 404 silencieux. */
/* l ordre de l entonnoir : visite -> pastille de la map -> clic Create -> cree -> vivant -> partage -> lien recu -> achat */
/* ⛔ `cree_echec` et `vie_echec` ajoutes le 2026-09-20 : sans eux, un parcours qui casse chez un
 *    visiteur se lit exactement comme un visiteur qui abandonne. On ne peut pas corriger ce qu on ne
 *    compte pas. */
/* ⛔⛔ CORRIGE LE 2026-09-23, APRES MESURE (`mesure-etapes-perdues.mjs`). Cette liste comptait 16
 *     noms. L app en appelait 48. Les 34 absents etaient JETES EN SILENCE par `/api/etape` : le
 *     serveur teste `includes(e)` et, si le nom manque, il ne compte rien et ne dit rien.
 *     ⇒ Tout l entonnoir d ACHAT (`achat_prepare`, `achat_ok`), toute la connexion de wallet
 *       (`wallet_connect_ok/refus`, `wallet_no_provider`), tout le Bridge et le clic « Fund wallet »
 *       affichaient 0. Et un 0 aveugle se lit exactement comme un 0 sincere : « personne n a fait
 *       ca ». C est la question que Phil pose depuis des jours — ou perd-on les gens — repondue
 *       par un instrument qui ne regardait pas.
 * ⛔ GARDE : `test-etapes-comptees.mjs` echoue si l app appelle un nom absent d ici. Sans elle,
 *   la liste redivergera au prochain bouton ajoute — c est exactement comme ca qu on en est arrive
 *   a 34. Une liste blanche sans garde n est pas une liste blanche, c est un souvenir. */
const ETAPES_ENTONNOIR = [
  'visite', 'map_cta', 'create_clic',
  'groupe_propose', 'groupe_ok', 'groupe_refus', 'groupe_echec',
  'cree', 'cree_echec', 'vivant', 'vie_echec',
  'premier_propose', 'premier_prepare', 'partage', 'lien_recu', 'achat',
  /* connexion du wallet — l entree de tout le reste, jamais comptee jusqu ici */
  'wallet_connect_ok', 'wallet_connect_refus', 'wallet_no_provider',
  /* ⛔⛔ LA CAPACITE DE GROUPEMENT, MESUREE A LA CONNEXION — ajoutee le 2026-09-28 parce que
   *     `groupe_propose` valait ZERO sur 354 visites. Ce zero n etait PAS « aucun wallet ne sait
   *     grouper » : l evenement n est emis que dans Instant Birth, derriere un preflight de solde et
   *     une simulation. Un compteur place derriere la porte la plus etroite rend un zero qui
   *     ressemble a un fait de marche.
   *   ⛔ TROIS ETATS ET PAS DEUX : `_non` est une REPONSE du wallet, `_illisible` est NOTRE
   *     aveuglement (delai, provider muet, appel qui jette). Les additionner ferait passer nos
   *     pannes pour un verdict, et on reparerait la mauvaise chose.
   *   ⇒ Ces trois compteurs decident si echanger un block contre une action exige un CONTRAT ou si
   *     un lot atomique suffit. Sans denominateur, cette question n a pas de reponse honnete. */
  'capacite_lot_oui', 'capacite_lot_non', 'capacite_lot_illisible',
  'chain_switch_ok', 'chain_switch_refus', 'pairer_clic',
  /* creation */
  'create_sign_propos', 'create_sign_refus', 'create_fund_bridge', 'create_go_bridge',
  'ib_preflight_ok', 'ib_preflight_fail', 'ib_balance_short',
  /* ⛔⛔ POURQUOI une creation echoue — mesure du 2026-09-23 : `cree` = 6, `cree_echec` = 8, et
   *     aucun moyen de savoir si ces 8 sont des refus polis dans le wallet ou des transactions qui
   *     revertent en brulant du gas. Les deux appellent des reponses OPPOSEES. Categories fermees
   *     produites par `causes-echec.js` ; `test-causes-echec.mjs` echoue si l une manque ici. */
  'cree_ko_refus', 'cree_ko_revert', 'cree_ko_envoi', 'cree_ko_reseau',
  'cree_ko_compte', 'cree_ko_attente',
  /* ⛔⛔ `cree_ko_partiel` — ajoute le 2026-10-01 avec la cause `partiel`. C est le lot dont UNE
   *   PARTIE seulement a ete appliquee : la personne detient un actif intermediaire qu elle n a pas
   *   demande. S il monte, ce n est pas un bug de notre code mais un wallet qui a casse son propre
   *   lot — et c est le seul compteur qui le dirait. Le noyer dans `cree_ko_revert` ferait chercher
   *   un revert qui n a pas eu lieu. */
  'cree_ko_partiel', 'cree_ko_autre',
  /* ⛔⛔ CE QUE NOUS REFUSONS AVANT MEME D ESSAYER — mesure du 2026-09-25 : `create_clic` = 45,
   *     `cree` = 6, `cree_echec` = 8. TRENTE-UN clics sans aucune trace. Or trois des sorties
   *     precoces de `creerBlock()` sont des refus que NOUS produisons : formulaire incomplet,
   *     create gratuit retire sur Base, un block encore a lancer. Un refus qu on s inflige sans le
   *     compter ressemble a « personne n a essaye » alors qu il veut dire « on a dit non ».
   *   ⛔ `cree_refus_*` et `cree_ko_*` ne disent PAS la meme chose : refuser avant d essayer et
   *     echouer en essayant ne se reparent pas de la meme facon. Le prefixe les separe. */
  'cree_refus_forme', 'cree_refus_gratuit', 'cree_refus_a_lancer', 'cree_refus_encours',
  /* ⛔⛔ ET LA SONDE M A CORRIGE : j avais dit TROIS refus muets, elle en a trouve DIX-HUIT dans la
   *     version d avant. Ces quatre noms-la regroupent les treize autres par REPARATION, pas par
   *     message — quatre familles, quatre reponses differentes :
   *     · `solde`       pas assez d ETH -> la reponse est l onramp / le Bridge, pas du code ;
   *     · `lecture`     prix ou chaine illisible -> la reponse est la resilience RPC ;
   *     · `frais`       les 0,001 ETH n ont pas abouti ou ne se prouvent pas -> le plus cher : le
   *                     geste a eu lieu, le resultat non ;
   *     · `preparation` notre requete n a pas pu etre construite -> defaut CHEZ NOUS, jamais chez
   *                     le visiteur. C est la distinction qui evite de chercher au mauvais endroit. */
  'cree_refus_solde', 'cree_refus_lecture', 'cree_refus_frais', 'cree_refus_preparation', 'cree_refus_ordre_sel', 'cree_refus_presim', 'cree_refus_presim_non_mesure',
  /* achat — l etape qui rapporte */
  /* ⛔ `achat_clic` = l INTENTION (clic sur Buy dans Market) · `achat_prepare` = on a passe les
   *   gardes et on prepare vraiment. Les deux partageaient le nom `achat_prepare` jusqu au
   *   2026-09-25, ce qui additionnait les deux bouts de l entonnoir et empechait d en calculer le
   *   taux. ⚠️ Les totaux d `achat_prepare` d avant ce build melangent les deux sens. */
  'achat_clic',
  /* ⛔⛔⛔ `achat_echec` AJOUTE LE 2026-09-30, ET IL COMBLE UN TROU QUI CACHAIT DE L ARGENT. Un
   *      achat que le visiteur SIGNE et qui ECHOUE ensuite sur la chaine n etait compte NULLE PART :
   *      `achat_sign_propos` partait, puis plus rien — exactement comme s il avait ferme l onglet.
   *      Un client perdu et un frais non pris, indiscernables d un abandon.
   *    ⛔ ET CE N EST PAS UNE REDEFINITION : `achat` et `achat_ok` gardent leur sens, sinon
   *      l historique d avant deviendrait incomparable avec celui d apres. On AJOUTE une ligne. */
  'achat_echec',
  /* ⛔ SANS CETTE LIGNE, L ETAPE EST JETEE EN SILENCE. `/api/etape` rend 204 qu il accepte ou
   *   qu il refuse : un nom hors liste blanche disparait sans un mot, et on croirait que
   *   personne n emprunte le chemin alors qu on ne le compte pas. C est ce qui m est deja
   *   arrive en postant du JSON a un endpoint qui lit `?e=` — le 204 ne prouve rien.
   *   `tokeniser_jeton_lu` = un jeton existant a ete LU et Create a ete pre-rempli. Ca ne dit
   *   RIEN d une creation : la signature reste un geste separe, compte par `cree`. */
  'tokeniser_jeton_lu',
  'achat_prepare', 'achat_sign_propos', 'achat_sign_refus', 'achat_ok', 'marche_rescan_ok',
  /* ⛔ UN NOM DISTINCT, PAS UN NOM RECYCLE. `marche_rescan_ok` est la relecture d UN block depuis sa
   *   fiche ; `stades_relire` est le rattrapage EN LOT depuis le panneau des paliers. Les fondre
   *   aurait reproduit le defaut que je venais de nommer le 2026-09-26 : `wallet_no_provider` porte
   *   un seul nom pour neuf chemins, et on ne peut donc pas dire lequel a ete tape 25 fois. */
  'stades_relire',
  /* ⛔⛔ LES DEUX PORTES DE SORTIE POUR UN NAVIGATEUR SANS WALLET. Mesure du 2026-09-26 : sur les
   *     trois jours pleins ou le compteur existe, 55 sessions, 29 `wallet_no_provider` et
   *     `wallet_connect_ok` = ZERO. Deux noms distincts, pas un : on veut savoir laquelle sert.
   *   ⚠️ UN CLIC N EST PAS UNE CONNEXION. Ces deux-la diront qu on a tape le lien ; seul
   *     `wallet_connect_ok` qui remonte dira que la porte menait quelque part. */
  'wallet_ouvrir_cbw', 'wallet_ouvrir_mm',
  /* ⛔⛔ LA PORTE QUI NE DEMANDE RIEN D INSTALLE. `wallet_base_clic` compte la tentative,
   *     `wallet_base_ko` l echec NOMME (SDK qui ne charge pas, passkey refuse par l appareil).
   *   ⛔ LE SUCCES N A PAS DE NOM A LUI, ET C EST VOULU : il passe par `connecter()`, donc il
   *     s ecrit dans `wallet_connect_ok`. Lui donner un nom separe aurait fait deux compteurs de
   *     succes concurrents, et on aurait fini par publier le plus flatteur des deux.
   *   ⇒ LE RAPPORT QUI DECIDE : `wallet_base_clic` -> `wallet_connect_ok`. Si le premier monte et
   *     que le second reste a zero, le passkey ne sert pas et il faut chercher ailleurs. */
  /* ⛔⛔ `wallet_base_attente` EST LE PLUS IMPORTANT DES TROIS, et il n existe que parce que le banc
   *     l a montre : la fenetre de connexion bloquee par le navigateur laissait le bouton mort
   *     25 secondes. C est l echec le plus probable ET le plus muet — sans ce compteur, il se
   *     lirait comme « personne n a essaye ». */
  'wallet_base_clic', 'wallet_base_ko', 'wallet_base_attente',
  /* ⛔⛔ `wallet_base_pret` MESURE LE CORRECTIF DU MUR N°1, ET SANS LUI IL SERAIT AVEUGLE. Le SDK
   *     (822 ko) se chargeait AU CLIC, donc le geste utilisateur expirait et le navigateur bloquait
   *     la fenetre de connexion : `wallet_base_clic` = 1 avait donne `wallet_base_attente` = 1, un
   *     sur un. Il est desormais prechauffe des que le panneau « sans wallet » s affiche.
   *   ⛔ CE COMPTEUR DIT SI LE PRECHAUFFAGE ABOUTIT *AVANT* LE CLIC. Le rapport a lire est
   *     `wallet_base_pret` / `wallet_no_provider` : s il reste bas, le SDK n arrive pas a temps et
   *     le correctif n a rien change — livrer sans lui aurait ete livrer a l aveugle. */
  'wallet_base_pret',
  /* ⛔⛔ `wallet_session_reprise` MESURE LE SECOND CORRECTIF DU RETOUR FIAT. Le rail exige une
   *     adresse, donc les 8 `onramp_retour_block` etaient connectes AVANT de partir payer — mais la
   *     page recharge au retour et rien ne restaurait la session : ils revoyaient « Connect wallet »
   *     avec un wallet deja autorise sous la main. `eth_accounts` (sans popup) le rend maintenant.
   *   ⛔ SANS CE COMPTEUR LE CORRECTIF SERAIT AVEUGLE : le rapport a lire est
   *     `wallet_session_reprise` / `visite` chez les visiteurs equipes. */
  'wallet_session_reprise',
  /* ⛔⛔ LES REFUS DU CHEMIN QUI RAPPORTE — mesure du 2026-09-25, balayage des 317 fonctions de
   *     l app : `preparerEchange` etait premiere du classement des refus non comptes, et TOUS
   *     tombaient AVANT `achat_prepare`. Donc `achat_prepare` = 0 ne disait pas si personne n avait
   *     essaye ou si on avait dit non a tout le monde. Les frais viennent des trades : c est le
   *     chemin le plus cher a laisser aveugle.
   *   ⛔ PREFIXE `echange_` ET NON `achat_` : la fonction sert l achat ET la vente, avec les memes
   *     causes. Les nommer « achat » ferait mentir la moitie des lignes.
   *   ⛔ NEUF NOMS, ENSEMBLE CLOS, UNE REPARATION CHACUN — et surtout des paires qui se ressemblent
   *     a l ecran et s opposent dans la cause :
   *     · marche_illisible / pas_de_pool  lecture ratee  vs  rien a lire
   *     · prix            / pool          lecture ratee  vs  la pool a repondu « non »
   *     · frais_pool                      NOTRE refus delibere au-dela de 5 % — savoir ce qu il coute
   *     · hors_app                        le hook d une autre app refuse notre routeur. Mesure du
   *       2026-09-17 : 0 des 56 blocks du Trending achetables ici. Si celui-la domine, le defaut est
   *       dans ce QU ON AFFICHE, pas dans ce chemin.
   *     · wallet · montant · plan (fourre-tout, a ouvrir seulement s il monte) */
  'echange_refus_marche_illisible', 'echange_refus_pas_de_pool', 'echange_refus_frais_pool',
  'echange_refus_wallet', 'echange_refus_montant', 'echange_refus_hors_app',
  'echange_refus_prix', 'echange_refus_pool', 'echange_refus_plan',
  /* ⛔⛔ LE RAIL MULTI-SAUTS A SES PROPRES COMPTEURS, SEPARES DE CEUX DU CHEMIN HISTORIQUE. Les
   *     fondre melangerait deux rails qui ont deux taux, deux assembleurs et deux publics : un
   *     achat en ETH sur la pool du block, et un achat en OUSD route sur trois sauts. On ne saurait
   *     plus lequel echoue.
   *   ⛔ `echange_refus_route_multi` est le SEUL qui dise quelque chose qu aucun autre ne dit : la
   *     route existait, et une de ses jambes n a pas pu etre resolue en PoolKey. S il domine, le
   *     defaut est dans la RESOLUTION des cles, pas dans la liquidite.
   *   ⛔ ET `echange_multi_pret` EST LE SEUL COMPTEUR POSITIF DU LOT : sans lui, on ne saurait que
   *     ce qui rate. Un entonnoir qui ne compte que ses echecs ne dit pas s il sert a quelqu un. */
  'echange_refus_route_multi', 'echange_multi_refus_prix', 'echange_multi_refus_pool',
  'echange_multi_refus_plan', 'echange_multi_refus_frais', 'echange_multi_pret',
  'echange_bloc_vers_bloc', /* 2026-10-03 : vente block -> block (bloc-vers-bloc.js) */
  /* ⛔⛔ `echange_multi_sign_propos` EST LE DENOMINATEUR QUI MANQUAIT. Sans lui on saurait combien
   *   de franchissements ABOUTISSENT, jamais combien ont ete PROPOSES a la signature — donc jamais
   *   le taux d abandon devant le wallet. Un entonnoir sans son denominateur ne mesure rien : il
   *   compte des succes dans le vide. */
  'echange_multi_sign_propos',
  /* ⛔⛔⛔ LA PERTE N°1 DEVIENT MESURABLE. `wallet_base_pret` melangeait DEUX populations : les
   *   visiteurs sans aucun wallet, pour qui la porte passkey est LA reponse, et ceux qui ont un
   *   wallet mais ne sont pas connectes, pour qui c est la MAUVAISE. Mesure du 2026-10-01 :
   *   98 `wallet_base_pret` pour 43 `wallet_no_provider` — le panneau s affiche deux fois plus
   *   souvent qu il n y a de visiteurs sans wallet.
   *   ⇒ Sans separation, « 98 fois prete, 1 clic » se lit comme un echec de l affordance alors
   *     qu on ignore combien de ces 98 etaient dans le groupe ou elle a un sens. Un numerateur
   *     sans son denominateur ne juge rien.
   *   ⛔ `wallet_base_pret` et `wallet_base_clic` RESTENT : ce sont les series historiques, et les
   *     casser rendrait incomparable tout ce qui precede. On AJOUTE. */
  'wallet_porte_sans', 'wallet_porte_deco',
  'wallet_base_clic_sans', 'wallet_base_clic_deco',
  /* ⛔⛔ LES DEUX GARDES QUI SE TIENNENT ENTRE UN TRADE ET NOTRE REVENU. Elles refusent d offrir Sign
   *     quand les 0,5 % vers FEE_WALLET manquent — le bon choix, mais un echange qui n a pas eu lieu
   *     ne se voyait NULLE PART. Ces deux compteurs disent combien ce garde-fou nous coute, et s il
   *     se declenche a tort.
   *   ⛔ DEUX NOMS POUR UNE MEME PHRASE A L ECRAN : `resume` = le recapitulatif du plan ne porte pas
   *     les 0,5 % ou le mauvais destinataire ; `calldata` = le resume le disait mais les OCTETS ne
   *     nomment pas FEE_WALLET. Un resume n est pas une preuve, seul le calldata part sur la chaine. */
  'echange_refus_frais_resume', 'echange_refus_frais_calldata',
  /* bridge et frais */
  'bridge_create', 'bridge_confirm_stub', 'bridge_fund_wallet',
  'bridge_fee_sign', 'bridge_fee_ok', 'bridge_fee_refuse', 'bridge_fee_fail',
  /* sortie d un block par sa propre pool — les refus AVANT signature, pour savoir ou ca bloque */
  'bridge_swap_sans_block', 'bridge_swap_montant', 'bridge_swap_ko', 'bridge_swap_approbations',
  /* « Tokenize a post » lance depuis la fiche d un block — mesure si ce bouton amene des creations */
  'tokenx_depuis_profil',
  /* le composeur de l onglet Post : mesure si preparer un message amene vraiment des gens a publier */
  'tokenx_composer',
  'bridge_fee_err', 'bridge_fee_plan_ko', 'bridge_fee_need_wallet', 'bridge_fee_wrong_chain',
  /* rail fiat -> Base */
  'onramp_session_ok', 'onramp_session_repli',
  /* second rail fiat (MoonPay, 2026-10-26) : session signee rendue / refusee ou injoignable */
  'moonpay_session_ok', 'moonpay_session_refus',
  /* ⛔ `onramp_retour_block` AJOUTE LE 2026-09-27, ET C EST LA SUITE DE TESTS QUI L A EXIGE, pas
   *   moi : une etape appelee par l app et absente de cette liste est JETEE EN SILENCE par
   *   /api/etape et affiche 0 pour toujours — un zero qui ne peut pas monter, donc indiscernable
   *   d un zero de succes. C est l etape qui mesure la SECONDE jambe du rail fiat : combien de
   *   personnes reviennent effectivement sur le block d ou elles etaient parties. */
  'onramp_retour_block',
  /* ⛔⛔ OU MEURT LA MISE EN VIE. `cree`=6 / `vivant`=2 en production, et `vie_echec` ABSENT des
   *     totaux : les quatre blocks perdus sortaient par 19 portes qui ne comptaient rien. On compte
   *     desormais l ETAPE ATTEINTE — mourir a l etape 2 (les approbations) n appelle pas la meme
   *     reparation que mourir a l etape 1 (la lecture du marche). Cardinalite fermee : 4 valeurs. */
  'vie_ko_etape1', 'vie_ko_etape2', 'vie_ko_etape3', 'vie_ko_etape4',
  /* brain */
  'brain_bot_propose', 'brain_bot_journal', 'brain_bot_pay_recog',
  /* ⛔⛔ D OU VIENNENT LES VISITES — le trou le plus gros de l app, mesure le 2026-09-29 : 384
   *     visites en 11 jours et AUCUNE trace de leur origine. Ni `Referer` ici, ni
   *     `document.referrer` dans la page, ni `utm_`, rien dans les logs. Consequence : le taux
   *     clic/visite est tombe de 16,73 % a 0,87 % et il a ete IMPOSSIBLE de dire si c etait une
   *     regression du bouton ou la fin de nos propres tests. Optimiser un entonnoir sans savoir qui
   *     on y met, c est tirer a l aveugle.
   *   ⛔ CATEGORIES FERMEES, PRODUITES PAR `source-visite.js`, jamais un hote ni une URL : un
   *     referrer porte des chemins et des parametres, donc potentiellement un identifiant. On ne
   *     garde que ce qui sert la decision. `test-source-visite.mjs` echoue si les deux listes
   *     divergent — un nom absent d ici serait jete EN SILENCE et vaudrait 0 pour toujours.
   *   ⚠️ `src_direct` veut dire « aucun referrer LU », PAS « la personne a tape l adresse » :
   *     copie-coller, app mobile, messagerie, `rel=noreferrer` et navigation privee le vident tous. */
  'src_direct', 'src_x', 'src_farcaster', 'src_telegram', 'src_discord', 'src_reddit',
  'src_recherche', 'src_github', 'src_base', 'src_interne', 'src_autre',
  /* ⛔⛔ LES GESTES D ENVOI — Phil, 2026-09-30 : « le send frag, c est ce qui se fait le plus sur
   *     notre app ». Le « send frag » est le GM, un VRAI transfert d un fragment de block. Or au
   *     moment ou il l a dit, RIEN ne le comptait : aucun nom d envoi dans cette liste, aucune des
   *     36 etapes actives. « Ce qui se fait le plus » etait donc une croyance, pas une mesure —
   *     comme « zero achat » l etait avant qu on instrumente le chemin d achat, ou il s est avere
   *     qu il y avait eu 2 achats reels.
   *   ⛔ LES TROIS GESTES PARTAGENT LE MEME PANNEAU, d ou trois `*_clic` distincts : sans eux on
   *     saurait qu il y a des envois, pas lequel domine — donc rien d actionnable. Les ISSUES sont
   *     partagees (`envoi_*`) parce que le code d envoi, lui, est le meme.
   *   ⛔ Produits par `geste-envoi.js` ; `test-geste-envoi.mjs` echoue si les deux listes divergent. */
  'gm_clic', 'gm_refus_wallet', 'gm_refus_solde',
  'message_clic', 'message_refus_wallet', 'message_refus_solde',
  'envoi_clic', 'envoi_refus_wallet', 'envoi_refus_solde',
  'envoi_sign_propos', 'envoi_ok', 'envoi_sign_refus',
];
/* ⛔ PERSISTANT (Phil, 2026-09-19 : « oui cree le volume ») : mesure — les compteurs repartaient de zero a CHAQUE deploiement
 *    (10 deploiements ce jour-la : aucun chiffre ne survivait). Volume Railway monte sur /data : lu au demarrage, ecrit
 *    au plus toutes les 30 s (fichier temporaire puis renommage : un arret brutal ne laisse jamais un JSON coupe).
 *    Sans volume (local, ou volume absent), on retombe sur la memoire, et /api/entonnoir le DIT (persistant:false). */
const FICHIER_ENTONNOIR = (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null))
  ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'entonnoir.json') : null;
const entonnoir = (() => {
  try {
    if (FICHIER_ENTONNOIR && existsSync(FICHIER_ENTONNOIR)) {
      const x = JSON.parse(readFileSync(FICHIER_ENTONNOIR, 'utf8'));
      /* ⛔ LES SEAUX INTERNES PEUVENT MANQUER dans un fichier ecrit avant le 2026-09-30 : on les
       *   AJOUTE sans toucher au reste. Refuser le fichier ferait repartir `depuis` a zero et on
       *   perdrait onze jours de mesure pour deux cles absentes. */
      if (x && x.total && x.parJour) {
        x.interne = x.interne || {};
        x.interneParJour = x.interneParJour || {};
        return x;
      }
    }
  } catch (e) { console.log('[entonnoir] fichier illisible, on repart de zero :', e.message); }
  return { depuis: new Date().toISOString(), total: {}, parJour: {}, interne: {}, interneParJour: {} };
})();
/* premiere ecriture des le demarrage : sinon, sans etape comptee, aucun fichier n existe et « depuis » repart a chaque deploiement */
let entonnoirSale = !!FICHIER_ENTONNOIR && !existsSync(FICHIER_ENTONNOIR);
setInterval(() => {
  if (!entonnoirSale || !FICHIER_ENTONNOIR) return;
  try { writeFileSync(FICHIER_ENTONNOIR + '.tmp', JSON.stringify(entonnoir)); renameSync(FICHIER_ENTONNOIR + '.tmp', FICHIER_ENTONNOIR); entonnoirSale = false; }
  catch (e) { console.log('[entonnoir] ecriture ratee :', e.message); }
}, 30000).unref();

/* 2026-10-16 : le compteur de revenu externe (route /api/paye), meme volume et meme ecriture atomique que l entonnoir */
const FICHIER_REVENU = FICHIER_ENTONNOIR ? join(dirname(FICHIER_ENTONNOIR), 'revenu.json') : null;
const revenu = (() => {
  try {
    if (FICHIER_REVENU && existsSync(FICHIER_REVENU)) {
      const x = JSON.parse(readFileSync(FICHIER_REVENU, 'utf8'));
      if (x && x.vus && x.parJour) return { externe: {}, interne: {}, tentatives: {}, registre: {}, ...x };
    }
  } catch (e) { console.log('[revenu] fichier illisible, on repart de zero :', e.message); }
  return { depuis: new Date().toISOString(), externe: {}, interne: {}, parJour: {}, tentatives: {}, vus: {}, registre: {} };
})();
/* 2026-10-17 — le createur d un block, LU sur la chaine : les pools de nos hooks ou il est une des deux devises (balayage fraisScan),
 *   `createurs(bytes32)` (hook 7030) puis `createurDe(bytes32)` (hooks V2/V3).
 * ⛔ MESURE 2026-10-17 sur UNIT (pool 0x79a40c32…, hook 7030) : createurs rend 0x31e0…, createurDe REVERT. Ne lire que createurDe
 *   (comme /api/parts-createur) sauterait en silence toutes les pools 7030. Rien de lu -> null (la ligne dit CREATEUR_NON_LU). */
/* 2026-10-17 — la valeur en dollars d un frais verifie, pour le tirage de saison. Decimales lues sur la chaine (cache : elles ne changent
 *   pas) ; prix = celui de l ecran (prixUsdPourPlan ; l ETH natif/WETH par son pool). Non lu -> la devise vaut 0, jamais devinee. */
const decimalesCache = new Map();
const WETH_SRV = WETH_BASE.toLowerCase();
/* Season Draw quotidien : UNIT (symbol() = « UNIT » lu sur Base le 2026-10-17) et SA pool sur notre hook 7030 — l id recalcule = 0x79a40c32…,
 *   la pool initialisee lue par StateView (test-volume-tirage le verifie). Les actions = jetons d actions connus (descripteur 7030 + Aerodrome). */
const UNIT_BLOCK = '0xb2000000000000000000007afa7ed748b0874f27';
const POOLS_UNIT_TB = new Set([poolIdDe({ currency0: '0x' + '0'.repeat(40), currency1: UNIT_BLOCK, fee: 0, tickSpacing: 200, hooks: HOOK_7030 })]);
/* ══ L ELIGIBILITE AU POT UNIT (2026-10-28, Phil) : ticket du jour ET >= 10 $ d UNIT au DERNIER bloc du jour UTC (eligibilite-unit.js).
 *   Solde et prix lus a ce bloc par l ARCHIVE (BASE_RPC_ARCHIVE ; sans elle : non lu, donc personne n est eligible, et c est dit) ; prix =
 *   le plus bas du spot de la pool UNIT de l app (POOLS_UNIT_TB) a ce bloc et ~10 min plus tot, fois l ETH median des pools ETH/USDC.
 *   Un jour entierement lu est garde pour toujours (le passe ne change plus) ; une lecture incomplete est relue apres 5 min. */
const IDS_ETH_USDC_ELIG = CLES_PRIX_ETH.map((k) => poolIdDe({ currency0: '0x' + '0'.repeat(40), currency1: USDC_SRV, fee: k.fee, tickSpacing: k.tickSpacing, hooks: '0x' + '0'.repeat(40) }));
const eligUnitCache = new Map();
let lireArchiveEligU = null;
async function eligibiliteUnitJour(day, wallets) {
  const cle = day + '|' + [...new Set(wallets.map((w) => String(w).toLowerCase()))].sort().join(',');
  const c = eligUnitCache.get(cle);
  if (c && (c.complet || Date.now() - c.t < 300000)) return c.r;
  if (!lireArchiveEligU && RPC_ARCHIVE) lireArchiveEligU = lecteurArchive('eligibilite-unit');
  const lire = async (to, data, bloc) => { if (!lireArchiveEligU) throw new Error('no archive node'); return lireArchiveEligU('eth_call', [{ to, data }, '0x' + Number(bloc).toString(16)]); };
  let tete = null; try { tete = Number(BigInt(await rpcServeur('eth_blockNumber', []))); } catch (_) { tete = null; }
  const r = await evaluerJourUnit({ day, wallets, tete, lire, stateView: V4_ADRESSES[8453].stateView, idUnit: [...POOLS_UNIT_TB][0], idsEth: IDS_ETH_USDC_ELIG, unit: UNIT_BLOCK,
    lireTs: async (n) => { const ts = await horodatageBloc(n); return ts === null ? NaN : ts; } });
  const complet = r.ok && Object.values(r.parWallet).every((x) => x.pourquoi !== 'UNIT balance not read' && x.pourquoi !== 'UNIT price not read');
  eligUnitCache.set(cle, { t: Date.now(), r, complet });
  if (eligUnitCache.size > 64) eligUnitCache.delete(eligUnitCache.keys().next().value);
  return r;
}
const JETONS_ACTIONS = new Set([...DESCRIPTEUR_7030.devises.filter((d) => /c$/.test(d.sym)).map((d) => d.adresse.toLowerCase()), ...[...POOLS_ACTIONS_AERODROME.keys()].map((x) => String(x).toLowerCase())]);
/* ══ LE JOUR DU BLOC (2026-10-24, revue adverse, audit-ticketpot 4) : le volume et le pass skin creditaient le jour ou le hash etait POSTE
 *   (Date.now) : un wallet gardait ses swaps et en postait un par jour (un ticket chaque jour sans trader), un vieux swap se postait
 *   aujourd hui, et un trade de 23:59:58 poste apres minuit tombait le lendemain. Le jour credite = celui de l horodatage du BLOC du recu
 *   (eth_getBlockByNumber, horodatageBloc) ; un bloc de plus de 48 h ne credite plus rien (dit dans la reponse) ; illisible -> NON_LU, rien
 *   n est marque vu (le hash se renvoie). */
const AGE_MAX_TICKET_MS = 48 * 3600 * 1000;
async function jourDuRecu(recu, maintenant = Date.now()) {
  const nb = recu && typeof recu.blockNumber === 'string' ? parseInt(recu.blockNumber, 16) : NaN;
  if (!Number.isSafeInteger(nb) || nb <= 0) return { ok: false, etat: 'NON_LU', pourquoi: 'the block of this transaction was not read: send it again in a moment' };
  let ts = null;
  try { ts = await horodatageBloc(nb); } catch (_) { ts = null; }
  if (!Number.isSafeInteger(ts) || ts <= 0) return { ok: false, etat: 'NON_LU', pourquoi: 'the time of block ' + nb + ' was not read: send it again in a moment' };
  const ms = ts * 1000;
  if (maintenant - ms > AGE_MAX_TICKET_MS) return { ok: false, etat: 'TROP_VIEUX', pourquoi: 'this transaction is more than 48 h old (block ' + nb + ', ' + new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC): it no longer earns a day ticket' };
  return { ok: true, ms, jourId: jourDe(ms).id, bloc: nb };
}
/* ⛔ 2026-10-24 (revue adverse, 2e tour ticketpot, defaut 3) : prixUsdPourPlan ne leve jamais, il rend null ; `|| 0` en faisait 0 $ : le
 *   hash etait marque vu (revenu.vus), rien credite, aucun message — le ticket perdu en silence. Un prix (ETH ou d une action) NON LU ->
 *   NON_LU dit (« price ») : /api/paye repond 202, le hash attend dans ticketsEnAttente et le renvoi le credite. Jamais 0 $ devine. */
async function crediterVolumeJour({ h, ligne, tx, recu, v, internes }) {
  if (ligne !== 'hook_block' && ligne !== 'swap_action') return;
  revenu.volVus = revenu.volVus || {};
  if (revenu.volVus[h]) return;
  const vol = volumeVerifie({ tx, recu, poolManager: V4_ADRESSES[8453].poolm, poolsUnit: POOLS_UNIT_TB, jetonsActions: v.ok ? JETONS_ACTIONS : new Set() });
  if (!vol.ok || internes.has(vol.payeur)) return;
  const bloc = await jourDuRecu(recu);
  if (!bloc.ok) return bloc;
  let usd = 0;
  const pEth = BigInt(vol.unitWei) > 0n ? await prixUsdPourPlan(null) : 1, manques = [];
  if (BigInt(vol.unitWei) > 0n) { if (pEth > 0) usd += Number(BigInt(vol.unitWei)) / 1e18 * pEth; else manques.push('ETH'); }
  if (vol.actions.length) usd += await valeurFraisUsd(vol.actions.map((x) => ({ devise: x.jeton, montant: x.montant })), manques);
  if (manques.length) { const nl = jambeSansPrix({ jourId: bloc.jourId, payeur: vol.payeur, usd, eth: manques.includes('ETH') }); if (nl) return nl; }
  if (!(usd > 0)) return;
  revenu.volVus[h] = 1;
  revenu.jours = crediter(revenu.jours || {}, { saison: bloc.jourId, payeur: vol.payeur, hash: h, usd });
  revenuSale = true;
  invaliderPartsTPJours([bloc.jourId]);
  return { ok: true, etat: 'CREDITE', jourId: bloc.jourId };
}
/* ⛔ 2026-10-24 (revue adverse, 3e tour ticketpot, D2) : une jambe SANS PRIX bloquait tout le trade (NON_LU a chaque envoi, 0 $ credite,
 *   le hash en attente jusqu a 49 h) meme quand l autre jambe valait deja 20 $ — la base creditait ces 20 $. Le cote PRICE est credite des
 *   qu il suffit au ticket du jour (avec les trades deja credites ce jour-la : au-dela du seuil, un dollar de plus ne change rien) ; NON_LU
 *   seulement quand le cote price reste SOUS le seuil ET qu une jambe n a pas de prix — et le pourquoi dit les deux. */
function jambeSansPrix({ jourId, payeur, usd, eth }) {
  const deja = Number(((((revenu.jours || {})[jourId] || {})[String(payeur || '').toLowerCase()]) || {}).usd) || 0;
  if (deja + usd >= SEUIL_VOLUME_JOUR_USD) return null;
  return { ok: false, etat: 'NON_LU', sansPrix: true, pourquoi: (eth ? 'the ETH price' : 'the price of a token of this trade') + ' was not read, and its priced side ($' + usd.toFixed(2)
    + (deja > 0 ? ', $' + (deja + usd).toFixed(2) + ' with your other trades of the day' : '') + ') is below the $' + SEUIL_VOLUME_JOUR_USD + ' of a day ticket: send it again in a moment' };
}
/* ⛔ 2026-10-24 (revue adverse, 3e tour ticketpot, D1) : /api/ticketpot/parts est en cache 60 s ; un ticket credite EN RETARD pour un jour
 *   deja ferme (renvoi de ticketsEnAttente, trade de 23:59 poste apres minuit) changeait tous ses digests pendant que le GET servait encore
 *   les anciens : chaque POST du verifier etait refuse. Un credit invalide les parts de son jour ET de sa semaine (le pot de la semaine vit
 *   sur son dernier jour). partsCacheTP est une constante du module (plus bas) : absente seulement d une tranche montee par un banc. */
function invaliderPartsTPJours(ids) {
  if (typeof partsCacheTP === 'undefined') return;
  for (const id of ids || []) {
    const ms = Date.parse(String(id).slice(1) + 'T00:00:00Z');
    if (!Number.isFinite(ms)) continue;
    partsCacheTP.invalider(id);
    partsCacheTP.invalider(jourDe(saisonDe(ms).fin - 86400000).id + '#S');
    /* 2026-10-27 : le pot UNIT a les MEMES tickets : ses parts du jour et de la semaine sont invalidees aussi */
    if (typeof partsCacheTPUnit !== 'undefined') { partsCacheTPUnit.invalider(id); partsCacheTPUnit.invalider(jourDe(saisonDe(ms).fin - 86400000).id + '#S'); }
  }
}
/* le PASS SKIN d un hash (2026-10-24, sorti de la route pour que le renvoi ET le balayage serveur le creditent) : un achat de skin VERIFIE
 *   (mint au payeur + le prix arrive au wallet de frais) = des jours de tickets garantis, a partir du jour du BLOC ; > 48 h -> rien ;
 *   bloc illisible -> NON_LU (rien de marque). null = pas un pass. */
async function crediterPassSkin({ h, tx, recu, internes }) {
  if ((revenu.passVus || {})[h]) return null;
  /* 2026-11-12 (the economy pack is live): a skin of the pack is paid to the TBLOCK payment ROUTER (which keeps the dev part for the fee wallet
   *   and buys TBLOCK with the rest, in the same tx): the price must leave the payer for the router; before, for the fee wallet */
  const ps = passSkinVerifie({ tx, recu, skins: BLOCKSKINS_SRV, usdc: USDC_BASE, wallet: BLOCKSKINS_ACTIF_SRV.routeur || FEE_WALLET, prix: SKIN_MINT_USDC_SRV });
  if (!(ps.ok && !internes.has(ps.payeur))) return null;
  const blocPass = await jourDuRecu(recu);
  if (!blocPass.ok) return blocPass;
  revenu.passVus = { ...(revenu.passVus || {}), [h]: 1 };
  revenu.passes = revenu.passes || {};
  const jp = joursPass(blocPass.ms);
  revenu.passes[ps.payeur] = [...new Set([...(revenu.passes[ps.payeur] || []), ...jp])].sort();
  revenuSale = true;
  invaliderPartsTPJours(jp);
  return { ok: true, etat: 'CREDITE', jourId: blocPass.jourId };
}
/* tx + recu + nos wallets internes + le frais verifie : la meme lecture pour /api/paye et pour le balayage des tickets en attente */
function internesRevenu() { return walletsInternes([COMPTE_SONDE, '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', ...String(process.env.REVENU_INTERNES || '').split(',')]); }
async function lireTxPaye(h) {
  const [tx, recu] = await Promise.all([rpcActivite('eth_getTransactionByHash', [h]), rpcActivite('eth_getTransactionReceipt', [h])]);
  const internes = internesRevenu();
  return { tx, recu, internes, v: verifierFrais({ tx, recu, internes, devises: devisesComptees([...POOLS_ACTIONS_AERODROME.keys()]) }) };
}
/* le ticket d un hash en attente, refait (jamais le frais) : la ligne GARDEE. Tx ou recu pas lus -> NON_LU (l entree reste : avant, un recu
 *   null rendait « rien » et l attente etait effacee sur un simple hoquet du noeud). */
async function retenterTicket({ h, ligne, tx, recu, v, internes }) {
  if (!tx || !recu) return { ok: false, etat: 'NON_LU', pourquoi: 'this transaction was not read: send it again in a moment' };
  try { return (ligne === 'skin_mint' ? await crediterPassSkin({ h, tx, recu, internes }) : await crediterVolumeJour({ h, ligne, tx, recu, v, internes })) || null; }
  catch (_) { return { ok: false, etat: 'NON_LU', pourquoi: 'the day ticket of this transaction was not read: send it again in a moment' }; }
}
/* ══ LES TICKETS EN ATTENTE, REESSAYES PAR LE SERVEUR (2026-10-24, revue adverse 3e tour) : l app renvoie 5 fois (~2 min) puis plus rien —
 *   un onglet ferme, et le ticket attendait un envoi qui ne venait jamais. Le serveur reessaie chaque entree de revenu.ticketsEnAttente
 *   jusqu a son credit (ou TROP_VIEUX) ou ses 49 h : 1er essai 3 min apres l entree, puis 5, 10, 20, 40, 80, 120 min (plafond) — ~25 essais
 *   au plus par hash ; 6 hash au plus par balayage ; jamais un hash en cours dans /api/paye (payesEnCours). Ne compte JAMAIS le frais. */
const TICKET_ATTENTE_MS = 49 * 3600 * 1000, BALAYAGE_TICKETS_MAX = 6;
function garderTicketEnAttente(h, ligne) {
  revenu.ticketsEnAttente = revenu.ticketsEnAttente || {};
  if (!revenu.ticketsEnAttente[h]) revenu.ticketsEnAttente[h] = { ligne, at: Date.now() };
  for (const [k, x] of Object.entries(revenu.ticketsEnAttente)) if (!x || !(Date.now() - Number(x.at) <= TICKET_ATTENTE_MS)) delete revenu.ticketsEnAttente[k];
  revenuSale = true;
}
async function balayerTicketsEnAttente(maintenant = Date.now()) {
  const t = revenu.ticketsEnAttente || {};
  let essayes = 0;
  for (const [h, x] of Object.entries(t)) {
    if (!x || !(maintenant - Number(x.at) <= TICKET_ATTENTE_MS)) { delete t[h]; revenuSale = true; continue; }
    const quand = Number.isFinite(Number(x.prochain)) ? Number(x.prochain) : Number(x.at) + 3 * 60000;
    if (essayes >= BALAYAGE_TICKETS_MAX || quand > maintenant || payesEnCours.has(h) || payesEnCours.size >= 3) continue;
    essayes += 1;
    payesEnCours.add(h);
    let tk = null;
    try { tk = await retenterTicket({ h, ligne: x.ligne, ...(await lireTxPaye(h)) }); } catch (_) { tk = { ok: false, etat: 'NON_LU' }; } finally { payesEnCours.delete(h); }
    if (!tk || tk.etat !== 'NON_LU') delete t[h];
    else { x.essais = (Number(x.essais) || 0) + 1; x.prochain = maintenant + Math.min(120, 5 * 2 ** Math.min(x.essais - 1, 5)) * 60000; }
    revenuSale = true;
  }
  return essayes;
}
/* manques (optionnel, 2026-10-24 defaut 3) : recoit chaque devise dont le prix ou les decimales n ont pas ete lus (valeurUsd la compte 0) */
async function valeurFraisUsd(recus, manques = null) {
  const prix = {}, decimales = {};
  for (const r of recus || []) {
    const d = String(r.devise).toLowerCase();
    if (d === '0x' + '0'.repeat(40)) { decimales[d] = 18; prix[d] = await prixUsdPourPlan(null); continue; }
    if (!decimalesCache.has(d)) {
      try { const x = Number(BigInt(await rpcActivite('eth_call', [{ to: d, data: '0x313ce567' }, 'latest']))); if (Number.isInteger(x) && x >= 0 && x <= 36) decimalesCache.set(d, x); } catch (_) { /* non lu */ }
    }
    if (decimalesCache.has(d)) decimales[d] = decimalesCache.get(d);
    prix[d] = d === WETH_SRV ? await prixUsdPourPlan(null) : await prixUsdPourPlan(d);
    if (Array.isArray(manques) && (!(Number.isFinite(prix[d]) && prix[d] > 0) || !Number.isInteger(decimales[d]))) manques.push(d);
  }
  return valeurUsd(recus, { prix, decimales });
}
const SEL_CREATEURS = selecteurSrv('createurs(bytes32)'), SEL_CREATEUR_DE = selecteurSrv('createurDe(bytes32)');
/* ⛔ 2026-10-17 (avant deploy) : le hook 7030 n est PAS dans HOOKS_FRAIS -> le balayage fraisScan ne voit AUCUNE pool 7030, donc aucune
 *   naissance recente. Les pools viennent d abord des CLES lues (clesCache / resoudreClePool, comme /api/cle : UNIT y rend sa pool 7030
 *   0x79a40c32…), le balayage n est qu un complement. */
async function createurDuBlock(b) {
  const entree = clesCache.get(b);
  let cles = entree && Array.isArray(entree.cles) ? entree.cles : [];
  /* 2026-10-26 (finding 4) : des cles d indice seules (souvent un hook etranger) ne dispensent pas de la recherche : l union */
  if (!entreeComplete(entree)) {
    try { const r = await resoudreClePool(b); if (r && r.ok === true && Array.isArray(r.cles)) cles = unionCles(r.cles, cles); } catch (_) { /* les cles deja la */ }
  }
  /* ⛔ NOS HOOKS SEULEMENT : n importe qui peut ouvrir une pool sur notre block avec SON hook ; un hook qui rend son propre
   *   `createurs()` se ferait devoir 30 %. Seuls HOOKS_FRAIS (V1..V8) et HOOK_7030 (lus dans le depot) sont interroges. */
  const nos = new Set([...HOOKS_FRAIS.map((x) => x.adr.toLowerCase()), String(HOOK_7030 || '').toLowerCase()].filter((x) => /^0x[0-9a-f]{40}$/.test(x)));
  const pools = [
    ...cles.filter((c) => c && /^0x[0-9a-f]{64}$/i.test(String(c.poolId)) && nos.has(String(c.hooks).toLowerCase()))
      .map((c) => ({ hook: String(c.hooks).toLowerCase(), id: String(c.poolId).toLowerCase() })),
    ...fraisScan.pools.filter((p) => nos.has(String(p.hook).toLowerCase()) && (String(p.c0).toLowerCase() === b || String(p.c1).toLowerCase() === b)),
  ];
  for (const p of pools) {
    for (const sel of [SEL_CREATEURS, SEL_CREATEUR_DE]) {
      try {
        const x = String(await rpcActivite('eth_call', [{ to: p.hook, data: '0x' + String(sel).replace(/^0x/, '') + String(p.id).slice(2) }, 'latest']));
        const a = ('0x' + x.slice(26, 66)).toLowerCase();
        if (/^0x[0-9a-f]{40}$/.test(a) && !/^0x0{40}$/.test(a)) return a;
      } catch (_) { /* getter absent sur ce hook : on essaie l autre */ }
    }
  }
  return null;
}
let revenuSale = !!FICHIER_REVENU && !existsSync(FICHIER_REVENU);
const payesEnCours = new Set();
/* ══ SKIN DETENU = TICKET DU JOUR GARANTI (Phil 2026-10-18 13:30 : « le skin garde 1 USDC, equivalent d un ticket journalier que le user
 *   garde comme garanti au reward »). Toutes les 10 min, les skins sont LUS sur le contrat BlockSkins actif (lireSkins, chaine) ; chaque
 *   detenteur EXTERNE recoit le jour courant dans revenu.passes (le meme registre que le pass skin) : la liste est figee jour par jour, donc le
 *   tirage d hier garde les detenteurs d hier. Lecture ratee -> rien n est retire ni ajoute ; le contrat lui-meme (tenu en vente) n est pas un
 *   detenteur. ⛔ Limite dite a Phil : un skin a 1 USDC = un ticket chaque jour tant qu il est detenu — plusieurs wallets = plusieurs tickets. */
const skinsDetenus = { lu: 0, enVol: false, n: null };
async function crediterDetenteursSkins() {
  if (skinsDetenus.enVol || Date.now() - skinsDetenus.lu < 600000) return;
  skinsDetenus.enVol = true;
  try {
    const r = await lireSkinsSrv({ rpc: rpcServeur });
    if (!r || r.etat !== 'LU') return;
    const internes = walletsInternes([COMPTE_SONDE, '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', ...String(process.env.REVENU_INTERNES || '').split(',')]);
    const jour = jourDe(Date.now()).id, contrat = String(BLOCKSKINS_SRV).toLowerCase();
    revenu.passes = revenu.passes || {};
    /* 2026-11-12: skins live on several contracts (blockskins.js BLOCKSKINS_LUS): none of them is a holder (a skin held for sale) */
    const externe = (a) => /^0x[0-9a-f]{40}$/.test(a) && a !== contrat && !BLOCKSKINS_LUS_SRV.includes(a) && !/^0x0{40}$/.test(a) && !internes.has(a);
    const detenteurs = new Set(r.skins.map((s) => String(s.detenteur || '').toLowerCase()).filter(externe));
    /* ⛔⛔ 2026-10-24 (revue adverse, audit-ticketpot 2, HIGH) : UN ticket par JETON et par jour. Avant, chaque detenteur vu a une lecture
     *   gagnait le jour : un seul skin (ERC-721 transferable) passe de wallet en wallet entre deux lectures donnait jusqu a 144 tickets par
     *   jour. revenu.skinsJour[jour][tokenId] = le PREMIER detenteur externe vu ce jour-la : il garde le ticket ; le jeton passe a un autre
     *   wallet le meme jour ne donne rien de plus. Un interne ou le contrat (skin en vente) ne consomme pas le ticket du jeton.
     * ⚠️ LIMITE CONNUE, LAISSEE (revue adverse du correctif, 2026-10-24, defaut 3, low) : le PASS de mint (/api/paye skin_mint : 7 jours de
     *   tickets au minteur, revenu.passes) est un registre A PART de ce ticket par jeton. Si le jeton passe du minteur A a un wallet B avant
     *   la premiere lecture du jour, B prend le ticket du jeton ET A garde son pass : un skin a 1 USDC donne 2 tickets par jour pendant les
     *   7 jours du pass (2, pas 144 ; ensuite 1). Non corrige : dit ici et a Phil. */
    revenu.skinsJour = revenu.skinsJour || {};
    const parJeton = revenu.skinsJour[jour] = revenu.skinsJour[jour] || {};
    for (const s of r.skins) {
      /* 2026-11-12: a token of the active contract keeps its plain id (the key used so far); one of an earlier contract is keyed by contract */
      const id = (!s.contrat || s.contrat === contrat ? '' : s.contrat + ':') + String(s.tokenId), a = String(s.detenteur || '').toLowerCase();
      if (!externe(a)) continue;
      if (parJeton[id]) continue;
      parJeton[id] = a; revenuSale = true;
      const ids = revenu.passes[a] || []; if (!ids.includes(jour)) { revenu.passes[a] = [...ids, jour].sort(); revenuSale = true; }
    }
    { const js = Object.keys(revenu.skinsJour).sort(); for (const k of js.slice(0, Math.max(0, js.length - 3))) delete revenu.skinsJour[k]; }
    /* 2026-10-23 : le JOUR de chaque lecture reussie est note (couverture de /api/ticketpot/parts : un jour sans lecture des skins n est
     *   pas couvert) ; 60 jours gardes au plus */
    revenu.skinsLus = revenu.skinsLus || {};
    if (!revenu.skinsLus[jour]) {
      revenu.skinsLus[jour] = new Date().toISOString(); revenuSale = true;
      const jl = Object.keys(revenu.skinsLus).sort(); for (const k of jl.slice(0, Math.max(0, jl.length - 60))) delete revenu.skinsLus[k];
    }
    skinsDetenus.n = detenteurs.size; skinsDetenus.lu = Date.now();
  } catch (_) { /* relu au prochain appel */ } finally { skinsDetenus.enVol = false; }
}
setInterval(() => { void crediterDetenteursSkins(); }, 600000).unref?.();
/* ══ DEPENSE DE JEU = VOLUME DU TICKET (Phil 2026-10-18 14:30 : « Auto-roll utilisera le pass… ca fera le volume requis ») : les logs du
 *   contrat BlockRolls DE LA FICHE (adresse ecrite par noter apres la signature) sont lus par fenetres de 2 000 blocs depuis son bloc de
 *   deploiement ; chaque (tx, joueur) externe est credite en USD (USDC brut / 1e6) au jour courant (volume-rolls.js depensesJeu). Un roll sur
 *   pass compte 0 (le pass est compte a l achat). Lecture ratee -> le curseur ne bouge pas, rien n est invente. */
/* ⛔ 2026-10-18 (revue adverse) : (1) le credit allait au jour du SCAN (Date.now) — un roll de 23:59 lu a 00:01 comptait pour le lendemain ;
 *   il va desormais au jour UTC du BLOC du log (horodatage lu, garde en cache). Un horodatage illisible -> la fenetre n est PAS creditee et
 *   le curseur ne bouge pas (relue au tour suivant). (2) Le curseur s arretait sur la tete EXACTE : un noeud en retard rendait une fenetre
 *   sans ses derniers logs, perdus pour toujours ; il s arrete a tete - margeBlocsRolls() (ROLLS_MARGE_S au temps mesure, >= 3 blocs). */
/* ⛔ DENIM (2026-10-23) : la marge est une duree (un noeud en retard de quelques SECONDES), pas un nombre de blocs. 3 blocs = 6 s a 2 s/bloc,
 *   0,6 s a 200 ms. Elle vaut donc ROLLS_MARGE_S au temps de bloc mesure, jamais moins de 3 blocs (inchangee avant Denim). */
const ROLLS_MARGE_S = 6;
/* ⛔ DENIM (2026-11-05) : au temps SERVI (sParBlocServi : la mesure courte l emporte des que les blocs accelerent), pas a la mesure longue
 *   seule — relue toutes les 10 min, elle garderait 2 s (3 blocs = 0,6 s de marge) jusqu a ~10 min apres la bascule. Plus de blocs de
 *   marge = plus prudent. sParBlocServi est une fonction hissee (definie plus bas) ; appelee seulement au scan, jamais a l import. */
const margeBlocsRolls = () => Math.max(3, blocsPour(ROLLS_MARGE_S, sParBlocServi()) ?? 3);
/* ══ LE TEMPS DE BLOC MESURE (2026-10-23, Denim : Base passe de 2 s a 200 ms/bloc, mainnet vise novembre 2026 — docs.base.org/upgrades/denim).
 *   Deux en-tetes (la tete et RECUL_MESURE_BLOCS plus bas, servis par les noeuds publics a cette profondeur), relus au plus toutes les
 *   10 min ; timestampMs si les deux en ont (champ optionnel de Denim), sinon les secondes. Non mesure -> null : les reculs exprimes en temps
 *   NE PARTENT PAS (la lecture attend le tour suivant), rien n est calcule a 2 s par defaut. Expose par /api/tirage (tempsDeBloc). */
const tempsDeBlocSrv = { sParBloc: null, de: null, a: null, source: null, lu: 0, enVol: null, erreur: null };
async function sParBlocSrv() {
  if (tempsDeBlocSrv.sParBloc !== null && Date.now() - tempsDeBlocSrv.lu < 600000) return tempsDeBlocSrv.sParBloc;
  if (tempsDeBlocSrv.enVol) return tempsDeBlocSrv.enVol;
  tempsDeBlocSrv.enVol = (async () => {
    try {
      const haut = enteteVersMesure(await rpcServeur('eth_getBlockByNumber', ['latest', false]));
      if (!haut || haut.bloc <= RECUL_MESURE_BLOCS) throw new Error('head header unreadable');
      const bas = enteteVersMesure(await rpcServeur('eth_getBlockByNumber', ['0x' + (haut.bloc - RECUL_MESURE_BLOCS).toString(16), false]));
      const s = sParBlocMesure({ haut, bas });
      if (s === null) throw new Error('block time not measurable from these headers');
      Object.assign(tempsDeBlocSrv, { sParBloc: s, de: bas.bloc, a: haut.bloc, source: haut.tsMs !== null && bas.tsMs !== null ? 'timestampMs' : 'timestamp', lu: Date.now(), erreur: null });
      return s;
    } catch (e) {
      /* la derniere mesure reste servie (avec son `lu`) ; jamais une valeur inventee */
      tempsDeBlocSrv.erreur = String((e && e.message) || e).slice(0, 120);
      return tempsDeBlocSrv.sParBloc;
    } finally { tempsDeBlocSrv.enVol = null; }
  })();
  return tempsDeBlocSrv.enVol;
}
function tempsDeBlocJson() {
  return { sParBloc: tempsDeBlocSrv.sParBloc, mesureEntre: tempsDeBlocSrv.de === null ? null : [tempsDeBlocSrv.de, tempsDeBlocSrv.a], source: tempsDeBlocSrv.source,
    lu: tempsDeBlocSrv.lu ? new Date(tempsDeBlocSrv.lu).toISOString() : null, erreur: tempsDeBlocSrv.erreur };
}
if (process.env.TB_SONDES !== '0') { setTimeout(() => { void sParBlocSrv(); setInterval(() => { void sParBlocSrv(); }, 600000).unref?.(); }, 3000).unref?.(); }
const horodatagesBlocsRolls = new Map();
async function horodatageBloc(n) {
  if (horodatagesBlocsRolls.has(n)) return horodatagesBlocsRolls.get(n);
  const b = await rpcServeur('eth_getBlockByNumber', ['0x' + n.toString(16), false]);
  const ts = b && parseInt(b.timestamp, 16);
  if (!Number.isSafeInteger(ts) || ts <= 0) return null;
  horodatagesBlocsRolls.set(n, ts);
  if (horodatagesBlocsRolls.size > 5000) horodatagesBlocsRolls.delete(horodatagesBlocsRolls.keys().next().value);
  return ts;
}
let rollsScanEnVol = false;
async function crediterVolumeRolls() {
  const contrat = String(BLOCKROLLS_DEPLOIEMENT.adresse || '').toLowerCase();
  if (rollsScanEnVol || !/^0x[0-9a-f]{40}$/.test(contrat) || !Number.isSafeInteger(BLOCKROLLS_DEPLOIEMENT.bloc)) return;
  rollsScanEnVol = true;
  try {
    const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    if (!Number.isSafeInteger(tete)) return;
    const sur = tete - margeBlocsRolls();
    let de = Number.isSafeInteger(revenu.rollsScan) ? revenu.rollsScan + 1 : BLOCKROLLS_DEPLOIEMENT.bloc;
    const internes = walletsInternes([COMPTE_SONDE, '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', ...String(process.env.REVENU_INTERNES || '').split(',')]);
    for (let tour = 0; tour < 10 && de <= sur; tour++) {
      const a = Math.min(sur, de + 1999);
      const logs = await rpcServeur('eth_getLogs', [{ address: contrat, fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16), topics: [[TOPIC_ROLLED_SRV, TOPIC_PASS_SRV]] }]);
      if (!Array.isArray(logs)) return;
      const depenses = depensesJeu(logs, contrat).filter((d) => !internes.has(d.joueur));
      /* le jour de CHAQUE bloc, lu AVANT tout credit : une fenetre est creditee entiere ou pas du tout */
      const jourDuBloc = new Map();
      for (const d of depenses) {
        if (!Number.isSafeInteger(d.bloc)) return;
        if (!jourDuBloc.has(d.bloc)) { const ts = await horodatageBloc(d.bloc); if (ts === null) return; jourDuBloc.set(d.bloc, jourDe(ts * 1000).id); }
      }
      for (const d of depenses) { revenu.jours = crediter(revenu.jours || {}, { saison: jourDuBloc.get(d.bloc), payeur: d.joueur, hash: d.tx, usd: Number(d.brut) / 1e6 }); revenuSale = true; }
      /* WEEK PASS (Phil 2026-10-18) : chaque PassBought des MEMES logs = le ticket des 7 jours UTC a partir du jour du BLOC (topic `day` du
       *   contrat) + 3 entrees bonus au tirage de cette semaine (tirage-saison.js crediterPassSemaine : pose, idempotent). Internes exclus. */
      for (const pa of passesAchetes(logs, contrat)) {
        if (internes.has(pa.joueur)) continue;
        const cp = crediterPassSemaine({ passes: revenu.passes || {}, bonusSemaine: revenu.bonusSemaine || {} }, pa);
        revenu.passes = cp.passes; revenu.bonusSemaine = cp.bonusSemaine; revenuSale = true;
      }
      revenu.rollsScan = a; revenuSale = true; de = a + 1;
    }
  } catch (_) { /* relu au prochain tour, depuis le meme curseur */ } finally { rollsScanEnVol = false; }
}
/* le pot des rolls LU sur le contrat (pot()), garde 30 s ; null tant qu il n a pas ete lu */
const potRollsSrv = { brut: null, lu: 0, enVol: false };
async function lirePotRollsSrv(contrat) {
  if (potRollsSrv.enVol || Date.now() - potRollsSrv.lu < 30000) return;
  potRollsSrv.enVol = true;
  try { const v = lireUintRolls(await rpcRails('eth_call', [{ to: contrat, data: appelPotRolls() }, 'latest'])); if (v !== null) { potRollsSrv.brut = v.toString(); potRollsSrv.lu = Date.now(); } }
  catch (_) { /* relu au prochain appel */ } finally { potRollsSrv.enVol = false; }
}
setInterval(() => { void crediterVolumeRolls(); }, 120000).unref?.();
/* ══ LE TEMPS DE BLOC SERVI (revue BlockDuelsV2 2026-10-24, n°2) — la mesure LONGUE (sParBlocSrv : 1 000 blocs, relue toutes les 10 min) met
 *   ~10 a 13 min a suivre un passage de 2 s a 200 ms : « Settle within about 512 s » aurait ete dit pour une fenetre de ~51 s. Ce qui est DIT
 *   aux clients (/api/tirage, /api/duels) est sParBlocPrudent(longue, courte) : la mesure COURTE (100 blocs, borne basse, relue au plus toutes
 *   les 15 s, a la demande et toutes les 30 s quand un contrat v2 des duels est servi) l emporte des que les blocs accelerent. Les reculs du
 *   serveur (logs, marges) gardent la mesure longue (tempsDeBlocSrv.sParBloc).
 *   ⛔ APRES le setInterval de crediterVolumeRolls : test-volume-rolls-jour-bloc execute la tranche de source qui le precede. */
const mesureCourteSrv = creerMesureCourte({ rpc: (m, p) => rpcServeur(m, p) });
function sParBlocServi() { return sParBlocPrudent(tempsDeBlocSrv.sParBloc, mesureCourteSrv.etat().sParBloc); }
function tempsDeBlocServiJson() {
  void mesureCourteSrv.lire();
  const c = mesureCourteSrv.etat();
  return { ...tempsDeBlocJson(), sParBloc: sParBlocServi(), sParBlocLong: tempsDeBlocSrv.sParBloc,
    court: { sParBloc: c.sParBloc, mesureEntre: c.de === null ? null : [c.de, c.a], lu: c.mesureLe !== null ? new Date(c.mesureLe).toISOString() : null, erreur: c.erreur } };
}
/* fin du temps de bloc servi */
/* 2026-10-24 (audit rolls-duels) : les REGLES vivantes (currentRules + rulesVersion + unitCreator + MAX_PRIZE), lues au plus toutes les 30 s
 *   (10 s apres un echec), servies si la derniere lecture reussie a moins de 2 min — sinon null (l app dit « could not be read »), JAMAIS la
 *   fiche de deploiement. Lecture au demarrage et toutes les 60 s, en plus de chaque /api/tirage.
 *   ⛔ APRES le setInterval de crediterVolumeRolls : test-volume-rolls-jour-bloc execute la tranche de source qui le precede. */
const contratRollsFiche = /^0x[0-9a-f]{40}$/i.test(String(BLOCKROLLS_DEPLOIEMENT.adresse || '')) ? String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase() : null;
const reglesRollsSrv = creerCacheRegles({ lire: () => lireReglesRolls({ rpc: rpcRails, contrat: contratRollsFiche }) });
if (contratRollsFiche) { setTimeout(() => { void reglesRollsSrv.rafraichir(); }, 0).unref?.(); setInterval(() => { void reglesRollsSrv.rafraichir(); }, 60000).unref?.(); }
/* ══ TICKETPOT (2026-10-18, LIVE) — le pot de la VEILLE lu sur la chaine toutes les 60 s (lireJour : ferme, potAtClose, reste, pause), servi
 *   dans /api/tirage.ticketpot. ⛔ AUCUNE cle ici : Phil signe les parts lui-meme avec le wallet verifier (0x37eb…) — le serveur ne signe rien
 *   et ne bouge rien. Sans fiche notee (adresse null) : null, et aucune lecture de chaine. En memoire ; une lecture ratee garde l etat d avant. */
const ticketpotSrv = { lu: 0, jourId: null, day: null, etat: null, erreur: null, enVol: false };
/* 2026-10-23 (revue adverse) : /api/ticketpot/parts en CACHE — la reponse 60 s par jour+mode (invalidee par un POST de signature), la
 *   lecture de chaine (lireJour, 6 appels) 60 s par jour, partagee par le GET et le POST. Un echec est garde 15 s. */
const partsCacheTP = cacheTemporise({ ttlMs: 60000, ttlEchecMs: 15000, max: 128 });
const jourChaineTP = cacheTemporise({ ttlMs: 60000, ttlEchecMs: 15000, max: 64 });
/* 2026-10-27 (docs/rachat-unit-simple-20261027.md) : le pot UNIT a SON etat, SES caches, SES signatures (revenu.ticketpotSigUnit) et SON gel
 *   (revenu.ticketpotGelUnit) : jamais melanges au pot USDC (un autre verifyingContract, donc d autres digests ; montants bruts en 18 decimales).
 *   Memes tickets (ticketsJour), meme part floor(potAtClose / n). Le financement reste manuel (le wallet owner achete l UNIT et fund) : rien ici. */
const ticketpotSrvUnit = { lu: 0, jourId: null, day: null, etat: null, erreur: null, enVol: false };
const partsCacheTPUnit = cacheTemporise({ ttlMs: 60000, ttlEchecMs: 15000, max: 128 });
const jourChaineTPUnit = cacheTemporise({ ttlMs: 60000, ttlEchecMs: 15000, max: 64 });
const POT_TP_USDC = Object.freeze({ fiche: TICKETPOT_DEPLOIEMENT, srv: ticketpotSrv, cleSig: 'ticketpotSig', jeton: 'USDC', decimales: 6 });
/* typeof : la fiche importee n est absente que d une tranche montee par un banc (comme partsCacheTP plus haut) -> pot UNIT non deploye */
const POT_TP_UNIT = Object.freeze({ fiche: typeof TICKETPOT_UNIT_DEPLOIEMENT === 'object' ? TICKETPOT_UNIT_DEPLOIEMENT : { adresse: null, bloc: null }, srv: ticketpotSrvUnit, cleSig: 'ticketpotSigUnit', jeton: 'UNIT', decimales: 18 });
async function lireTicketPotSrv(pot = POT_TP_USDC) {
  const ticketpotSrv = pot.srv; /* l etat de CE pot (USDC par defaut) */
  const contrat = pot.fiche.adresse;
  if (!contrat || ticketpotSrv.enVol) return;
  ticketpotSrv.enVol = true;
  try {
    const veilleJ = jourDe(Date.now() - JOUR_MS), day = dayDeJourIdPot(veilleJ.id);
    const j = await lireJourTicketPot({ rpc: rpcServeur, contrat }, day);
    /* l owner (close(day) avant 12 h ; n importe qui apres) — lu, jamais suppose ; illisible -> null et l app n offre que la fermeture « anyone » */
    let owner = null;
    try { const o = await rpcServeur('eth_call', [{ to: contrat, data: selecteurSrv('owner()') }, 'latest']); owner = /^0x[0-9a-f]{64}$/i.test(String(o)) ? '0x' + String(o).slice(-40).toLowerCase() : null; } catch (_) { owner = null; }
    /* 2026-10-23 (mesure prod game28) : une lecture ratee au demarrage (rafale d appels) servait owner vide 60 s et cachait « Close the pot ».
     *   Une lecture ratee garde l owner deja LU (il ne change que par transferOwnership, delai 2 etapes) — jamais un owner suppose. */
    if (owner === null && ticketpotSrv.etat && ticketpotSrv.etat.owner) owner = ticketpotSrv.etat.owner;
    ticketpotSrv.jourId = veilleJ.id; ticketpotSrv.day = day; ticketpotSrv.lu = Date.now(); ticketpotSrv.erreur = null;
    ticketpotSrv.etat = { ferme: j.ferme, enPause: j.enPause, potAtClose: j.potAtClose.toString(), reste: j.reste.toString(), verifier: j.verifier, owner };
    /* 2026-10-18 (Phil : « fini ca, on a tirage weekend et roll ») : le pot de la SEMAINE en cours = dayPot de son DERNIER jour (UTC), lu sur
     *   CE minuteur (jamais par requete). Le contrat refuse fund() d un jour futur (FutureDay) : il ne s alimente que CE jour-la — dit par l app.
     *   Lecture ratee : l etat de semaine d avant reste, l erreur est dite. */
    const sem = saisonDe(Date.now()), finJ = jourDe(sem.fin - JOUR_MS), daySem = dayDeJourIdPot(finJ.id);
    try {
      const js = await lireJourTicketPot({ rpc: rpcServeur, contrat }, daySem);
      ticketpotSrv.semaine = { id: sem.id, jourId: finJ.id, day: daySem, ferme: js.ferme, enPause: js.enPause, potAtClose: js.potAtClose.toString(), reste: js.reste.toString(),
        aujourdhui: jourDe(Date.now()).id === finJ.id, lu: new Date().toISOString() };
      ticketpotSrv.erreurSemaine = null;
    } catch (e) { ticketpotSrv.erreurSemaine = String((e && e.message) || e).slice(0, 120); }
    /* 2026-10-23 (revue adverse) : le pot de la semaine se FERME et se RECLAME apres sa semaine, pendant toute sa grace (claimableUntil,
     *   7 jours) — pas seulement le lendemain (veille). Le dernier jour de semaine deja termine et encore dans sa grace, lu sur CE minuteur ;
     *   le lundi c est la veille : sa lecture est reutilisee. Lecture ratee : l etat d avant reste (ticketpotJson ne le sert que si c est
     *   encore ce jour-la), l erreur est dite. */
    const dRec = jourSemaineReclamable(Math.floor(Date.now() / 1000), (ms) => saisonDe(ms).fin);
    if (dRec === null) { ticketpotSrv.semaineReclamable = null; ticketpotSrv.erreurSemaineReclamable = null; }
    else {
      try {
        const jr = dRec === day ? j : await lireJourTicketPot({ rpc: rpcServeur, contrat }, dRec);
        ticketpotSrv.semaineReclamable = { jourId: jourIdDeDayPot(dRec), day: dRec, ferme: jr.ferme, enPause: jr.enPause, potAtClose: jr.potAtClose.toString(), reste: jr.reste.toString(),
          verifier: jr.verifier, owner, reclamableJusqua: new Date(reclamablePotSrv(dRec) * 1000).toISOString(), lu: new Date().toISOString() };
        ticketpotSrv.erreurSemaineReclamable = null;
      } catch (e) { ticketpotSrv.erreurSemaineReclamable = String((e && e.message) || e).slice(0, 120); }
    }
    /* ⛔ 2026-10-24 (revue adverse du correctif ticketpot, defaut 3) : un pot de JOUR non ferme a J+1 n etait plus jamais propose (bouton
     *   et brain ne regardaient que la veille et la semaine reclamable). Chaque jour des 7 derniers (J-1..J-7, encore dans sa grace :
     *   claimableUntil) est lu ici : la veille reutilise sa lecture, un jour FERME n est plus relu (close est definitif ; son reste servi
     *   peut retarder sur les claims, `lu` le dit), un jour ouvert est relu toutes les 5 min au plus (un jour passe ouvert peut encore etre
     *   alimente). Cout : 6 eth_call par jour relu (lireJour), soit au plus ~6 jours x 6 / 5 min. Lecture ratee : l etat d avant reste. */
    {
      const tsJ = Math.floor(Date.now() / 1000), auj = dayDeJourIdPot(jourDe(Date.now()).id);
      ticketpotSrv.jours = ticketpotSrv.jours || {};
      for (const k of Object.keys(ticketpotSrv.jours)) { const d = Number(k); if (!(d < auj && d >= auj - 7 && tsJ <= reclamablePotSrv(d))) delete ticketpotSrv.jours[k]; }
      for (let d = auj - 1; d >= auj - 7; d--) {
        if (tsJ > reclamablePotSrv(d)) continue;
        const deja = ticketpotSrv.jours[d];
        if (d !== day && deja && (deja.ferme || Date.now() - deja.luMs < 300000)) continue;
        try {
          const jd = d === day ? j : await lireJourTicketPot({ rpc: rpcServeur, contrat }, d);
          const jid = jourIdDeDayPot(d);
          ticketpotSrv.jours[d] = { jourId: jid, day: d, ferme: jd.ferme, enPause: jd.enPause, potAtClose: jd.potAtClose.toString(), reste: jd.reste.toString(),
            dernierJourSemaine: jourDe(saisonDe(d * JOUR_MS).fin - JOUR_MS).id === jid, reclamableJusqua: new Date(reclamablePotSrv(d) * 1000).toISOString(), luMs: Date.now(), lu: new Date().toISOString() };
        } catch (_) { /* l etat d avant reste ; relu au prochain tour */ }
      }
    }
  } catch (e) { ticketpotSrv.erreur = String((e && e.message) || e).slice(0, 120); }
  finally { ticketpotSrv.enVol = false; }
}
if (TICKETPOT_DEPLOIEMENT.adresse) { setTimeout(() => { void lireTicketPotSrv(); setInterval(() => { void lireTicketPotSrv(); }, 60000).unref?.(); }, 5000).unref?.(); }
/* le pot UNIT : meme minuteur, decale de 20 s (pas de rafale d appels avec le pot USDC) */
if (POT_TP_UNIT.fiche.adresse) { setTimeout(() => { void lireTicketPotSrv(POT_TP_UNIT); setInterval(() => { void lireTicketPotSrv(POT_TP_UNIT); }, 60000).unref?.(); }, 25000).unref?.(); }
function ticketpotJson() {
  /* le pot USDC (typeof : POT_TP_USDC n est absent que d une tranche montee par un banc) */
  return ticketpotJsonDe(typeof POT_TP_USDC === 'object' ? POT_TP_USDC : { fiche: TICKETPOT_DEPLOIEMENT, srv: ticketpotSrv, cleSig: 'ticketpotSig', jeton: 'USDC', decimales: 6 });
}
function ticketpotJsonDe(pot) {
  const ticketpotSrv = pot.srv; /* l etat de CE pot (USDC par defaut) */
  const contrat = pot.fiche.adresse;
  if (!contrat) return null;
  /* la semaine servie seulement si c est encore LA semaine en cours (un etat d une semaine passee n est jamais montre comme celui-ci) */
  const semSrv = ticketpotSrv.semaine && ticketpotSrv.semaine.id === saisonDe(Date.now()).id ? ticketpotSrv.semaine : null;
  /* le pot de semaine reclamable : servi seulement s il est ENCORE le jour reclamable (calcul pur, aucune lecture de chaine ici) */
  const srSrv = ticketpotSrv.semaineReclamable && ticketpotSrv.semaineReclamable.day === jourSemaineReclamable(Math.floor(Date.now() / 1000), (ms) => saisonDe(ms).fin) ? ticketpotSrv.semaineReclamable : null;
  /* 2026-10-24 (revue adverse, audit-ticketpot 5) : TOUS les pots (jour ou semaine) qui ont au moins une part SIGNEE et sont encore dans
   *   leur grace (claimableUntil, 7 jours) — avant, l app ne regardait que la veille et la semaine : une part signee d il y a 3 jours n avait
   *   plus de bouton. Calcul pur sur revenu.ticketpotSig (aucune lecture de chaine) ; l app y cherche la part de SON wallet et relit claimed(). */
  const tS = Math.floor(Date.now() / 1000);
  const signes = Object.entries(revenu[pot.cleSig] || {}).filter(([, m]) => m && typeof m === 'object' && Object.keys(m).length > 0)
    .map(([k]) => { const semaine = k.endsWith('#S'), jourId = semaine ? k.slice(0, -2) : k; return { jourId, day: dayDeJourIdPot(jourId), semaine }; })
    .filter((x) => x.day !== null && tS <= reclamablePotSrv(x.day))
    .sort((x, y) => y.day - x.day || Number(y.semaine) - Number(x.semaine)).slice(0, 16);
  /* 2026-10-24 (defaut 3) : les pots des 7 derniers jours LUS par le minuteur (J-1..J-7, encore dans leur grace), du plus ancien au plus
   *   recent — l app et le brain y trouvent un pot ouvert a fermer, ou ferme a signer, au-dela de la veille. Calcul pur, aucune lecture ici. */
  const aujTP = Math.floor(Date.now() / 86400000); /* le jour du contrat (floor(ts / 86400)) */
  const ownerTP = ticketpotSrv.etat ? ticketpotSrv.etat.owner || null : null, verifTP = ticketpotSrv.etat ? ticketpotSrv.etat.verifier || null : null;
  const jours = Object.values(ticketpotSrv.jours || {}).filter((x) => x && Number.isInteger(x.day) && x.day < aujTP && x.day >= aujTP - 7 && tS <= reclamablePotSrv(x.day))
    .sort((x, y) => x.day - y.day).map(({ luMs, ...x }) => ({ ...x, owner: ownerTP, verifier: verifTP }));
  return { contrat, bloc: pot.fiche.bloc, jeton: pot.jeton, decimales: pot.decimales, veille: ticketpotSrv.etat ? { jourId: ticketpotSrv.jourId, day: ticketpotSrv.day, ...ticketpotSrv.etat } : null,
    semaine: semSrv, semaineReclamable: srSrv, signes, jours, erreurSemaineReclamable: ticketpotSrv.erreurSemaineReclamable || null, lu: ticketpotSrv.lu ? new Date(ticketpotSrv.lu).toISOString() : null, erreur: ticketpotSrv.erreur, erreurSemaine: ticketpotSrv.erreurSemaine || null };
}
/* ══ LES DUELS LUS SUR LA CHAINE (2026-10-18 ; PAR L ETAT depuis 2026-10-24) — LECTURE SEULE, AUCUN eth_getLogs.
 *   MESURE prod game33 2026-10-24 13:48 UTC : /api/duels rendait NON_LU « logs unreadable » a CHAQUE lecture, pour toujours. Le lecteur
 *   relisait les LOGS par fenetres de 2 000 blocs depuis max(deploiement 52 778 966, tete - 7 jours) — des fenetres d ARCHIVE ; une fenetre
 *   refusee jetait le tour, et le tour suivant relisait LA MEME fenetre (sonde : mainnet.base.org 429 a eth_getLogs meme recent).
 *   ⛔ La liste vient maintenant de l ETAT, par eth_call a la tete (duels-etat.js) : nextId() (l id du PROCHAIN duel), puis duels(id) du plus
 *   RECENT au plus ancien, au plus DUELS_IDS_PAR_TOUR ids par tour, dans les DUELS_GARDE_IDS ids les plus recents ; un duel au statut FINAL
 *   (Settled / Cancelled / Refunded) n est plus jamais relu ; un duel REGLE est complete UNE fois par l en-tete de son bloc cible (le hash :
 *   face, scores, gagnant, gain recalcules comme le contrat). Les non finaux (ouverts, rejoints, expires non rembourses) sont relus, le moins
 *   recemment lu d abord, sur la moitie du budget au moins.
 *   ⛔ Pas de recul en blocs : rien ici ne depend du temps de bloc (Denim, 200 ms/bloc, ne change rien a la lecture).
 *   ⛔ Un tour sans tete ou sans nextId lisible, ou dont AUCUN duel demande n a pu etre lu, echoue : l erreur est dite (/api/duels pourquoi),
 *   la liste deja lue reste servie (avec `erreur`), jamais une liste vide qui voudrait dire « aucun duel ». Un id illisible ce tour est relu
 *   au suivant. Un duel REGLE dont l en-tete n est pas lu sort du cache (sinon il serait pris pour un duel rejoint : un Refund qui revert).
 *   En memoire seulement (un redemarrage relit : 50 ids / 30 s). */
const DUELS_IDS_PAR_TOUR = 50;
const DUELS_GARDE_IDS = 2000;
const duelsSrv = { contrat: null, cache: new Map(), nextId: null, restants: 0, tete: null, lu: 0, luOk: 0, enVol: false, erreur: null };
function contratDuels() {
  const c = String((DUELS_DEPLOIEMENT && DUELS_DEPLOIEMENT.adresse) || '').toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(c) ? c : null;
}
async function lireDuelsSrv() {
  const contrat = contratDuels();
  if (!contrat || duelsSrv.enVol || Date.now() - duelsSrv.lu < 15000) return;
  duelsSrv.enVol = true;
  try {
    if (duelsSrv.contrat !== contrat) Object.assign(duelsSrv, { contrat, cache: new Map(), nextId: null, restants: 0, tete: null });
    const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    if (!Number.isSafeInteger(tete) || tete <= 0) throw new Error('head unreadable');
    const nextId = lireNextIdDuels(await rpcServeur('eth_call', [{ to: contrat, data: appelNextIdEtat() }, 'latest']));
    if (nextId === null) throw new Error('nextId() unreadable');
    const { ids, restants } = idsDuelsATour({ nextId, cache: duelsSrv.cache, budget: DUELS_IDS_PAR_TOUR, garde: DUELS_GARDE_IDS });
    let rates = 0, derniere = null;
    for (const id of ids) {
      try {
        const e = duelDepuisEtat(id, await rpcServeur('eth_call', [{ to: contrat, data: appelDuelEtat(id) }, 'latest']));
        if (!e) { rates += 1; derniere = 'duel #' + id + ' unreadable'; continue; }
        let d = e.duel;
        if (e.statut === 'Settled') {
          const b = await rpcServeur('eth_getBlockByNumber', ['0x' + d.targetBlock.toString(16), false]);
          d = reglerDepuisHash(d, b && b.hash);
          if (!d) { duelsSrv.cache.delete(String(id)); rates += 1; derniere = 'block of duel #' + id + ' unreadable'; continue; }
        }
        duelsSrv.cache.set(String(id), { duel: d, final: e.final, luA: Date.now() });
      } catch (err) { rates += 1; derniere = String((err && err.message) || err); }
    }
    for (const id of [...duelsSrv.cache.keys()]) if (Number(id) <= nextId - 1 - DUELS_GARDE_IDS) duelsSrv.cache.delete(id);
    if (ids.length && rates === ids.length) throw new Error(derniere || 'no duel could be read');
    duelsSrv.nextId = nextId; duelsSrv.restants = restants + ids.filter((id) => !duelsSrv.cache.has(String(id))).length;
    duelsSrv.tete = tete; duelsSrv.erreur = rates ? rates + ' of ' + ids.length + ' duel reads failed (' + String(derniere).slice(0, 60) + ')' : null;
    duelsSrv.luOk = Date.now();
  } catch (e) { duelsSrv.erreur = String((e && e.message) || e).slice(0, 120); }
  finally { duelsSrv.lu = Date.now(); duelsSrv.enVol = false; }
}
/* LA LISTE PAR L ETAT DONNEE AU REGLEUR (slots-regleur.js duels.joints / duels.connu ; revue fix2 2026-10-24, defaut 1 et porte D1) :
 *   joints(c) = les duels REJOINTS non finaux du cache, avec leurs deux guesses et leur mise (le regleur les classe sans aucun duels(id)) ;
 *   ⛔ elle JETTE si le cache n est pas celui de ce contrat ou si sa derniere lecture REUSSIE a plus de DUELS_ETAT_FRAIS_MS (3 tours du
 *   minuteur de 30 s) : le regleur ne prend jamais une liste perimee pour « aucun duel rejoint » (sans logs, sa lecture des duels echoue
 *   alors, et la porte des duels se ferme). connu(c, id) = ce que le cache sait d UN duel (guesses, mise : immuables une fois ecrits ;
 *   final : definitif) — sans fraicheur exigee, null s il ne le connait pas. */
const DUELS_ETAT_FRAIS_MS = 90000;
function duelsJointsKeeper(c) {
  if (!c || duelsSrv.contrat !== c) throw new Error('duels state list not read for this contract');
  if (!duelsSrv.luOk || Date.now() - duelsSrv.luOk > DUELS_ETAT_FRAIS_MS) throw new Error('duels state list stale (last good read ' + (duelsSrv.luOk ? Math.round((Date.now() - duelsSrv.luOk) / 1000) + ' s ago' : 'never') + ')');
  return [...duelsSrv.cache.values()].filter((e) => !e.final && e.duel.joiner && Number.isSafeInteger(e.duel.targetBlock))
    .map((e) => ({ id: e.duel.id, targetBlock: e.duel.targetBlock, guessA: e.duel.guessA, guessB: e.duel.guessB, stake: e.duel.stake }));
}
function duelConnuKeeper(c, id) {
  if (!c || duelsSrv.contrat !== c) return null;
  const e = duelsSrv.cache.get(String(id));
  return e ? { final: !!e.final, guessA: e.duel.guessA, guessB: e.duel.guessB, stake: e.duel.stake } : null;
}
setInterval(() => { if (contratDuels()) void lireDuelsSrv(); }, 30000).unref?.();
/* R2 (test live Grok game39) : le lecteur v2 ne lisait QUE mainnet.base.org (RPC_LIST par defaut) — des 429 faisaient rater des tours entiers.
 *   Il ne fait que eth_blockNumber, eth_call (latest) et eth_getBlockByNumber (en-tete d un bloc recent) : il prend une liste PLUS LARGE,
 *   publicnode D ABORD (mesure 2026-10-25 : les trois servis sur ce contrat), puis RPC_LIST, puis drpc, et passe au noeud suivant sur un refus.
 *   Un ORDRE fixe, pas une rotation : tete et duels lus sur le meme noeud tant qu il repond. Mode essai : le fork seul ; TB_REPLIS=0 : RPC_LIST. */
const RPC_DUELS_V2 = ESSAI_SRV.actif ? [ESSAI_SRV.rpc] : [...new Set([...(REPLIS_PUBLICS_COUPES ? [] : ['https://base-rpc.publicnode.com']), ...RPC_LIST, ...(REPLIS_PUBLICS_COUPES ? [] : ['https://base.drpc.org'])])];
async function rpcDuelsV2(methode, params) {
  let dernier = new Error('no endpoint tried');
  for (const url of RPC_DUELS_V2) {
    let r = null, compte = false; /* chaque requete envoyee, comptee une fois par hote et par issue (compterEnvoi) */
    try {
      r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }) });
      const j = await r.json();
      compte = true; compterEnvoi(url, classeEnvoi(r.status, j));
      if (j && !j.error && j.result !== undefined && !(methode === 'eth_call' && j.result === '0x')) return j.result;
      dernier = new Error(String((j && j.error && j.error.message) || (j && j.result === '0x' ? 'empty answer to a read' : 'rpc error')).slice(0, 100));
    } catch (e) {
      if (!compte) compterEnvoi(url, classeEnvoi(r ? r.status : 0, null, r === null || /abort|timeout/i.test(String(e && e.name))));
      dernier = e;
    }
  }
  throw dernier;
}
/* 2026-10-24 : le lecteur v2 (cree au premier contrat v2 lu dans la fiche ; un autre contrat = un lecteur neuf, jamais un cache melange) */
let lecteurDuelsV2 = null;
function duelsV2() {
  const c = contratDeFicheV2(DUELS_V2_DEPLOIEMENT);
  if (!c) return null;
  if (!lecteurDuelsV2 || lecteurDuelsV2.etat().contrat !== c) lecteurDuelsV2 = creerLecteurDuelsV2({ rpc: rpcDuelsV2, contrat: c });
  return lecteurDuelsV2;
}
setInterval(() => { const l = duelsV2(); if (l) void consommateurArchive.run('fond duels v2', () => l.lire()); }, 30000).unref?.();
/* revue 2026-10-24 n°2 : tant qu un contrat v2 est servi, la mesure courte du temps de bloc est tenue fraiche (2 en-tetes / 30 s) */
if (process.env.TB_SONDES !== '0') setInterval(() => { if (duelsV2()) void consommateurArchive.run('fond mesure courte', () => mesureCourteSrv.lire()); }, 30000).unref?.();

/* ══ LE REGLEUR DES SLOTS (2026-10-23, option 3 de Phil) — un spin non regle dans sa fenetre (256 blocs) est PERDU : le serveur regle donc
 *   les spins lui-meme quand le proprietaire a pose SLOTS_KEEPER_KEY (un wallet qu il cree et approvisionne en ETH pour le gas). La cle
 *   n est lue QU ICI, passee au module et jamais rendue ; /sante publie l etat (OFF / ON / ARRETE), l ADRESSE du regleur, le dernier
 *   reglement et les erreurs. Bornes et garde : slots-regleur.js (BORNES_DEFAUT, verifierEnvoi). Sans contrat ecrit dans la fiche, ou en
 *   mode essai : OFF, et pourquoi. */
const contratSlotsFiche = SPIN_ACTIF ? SPIN_ACTIF.contrat : null; /* 2026-11-12: the served Spin (spin-actif.js); before the new Spin is recorded, the record's as before */
if (SPIN_ACTIF && SPIN_ACTIF.refus) console.log('[slots] ' + SPIN_ACTIF.refus);
/* 2026-10-24 (audit rolls-duels) : la MEME cle regle aussi chaque duel rejoint dans sa fenetre (settle, sinon le joueur qui a rejoint garde
 *   une option gratuite : regler s il gagne, laisser rembourser s il perd) et tire le pot du pass de chaque jour fini (closeDay / drawDay,
 *   sinon un acheteur re-arme jusqu a etre choisi). Les adresses viennent des fiches (duels : import dynamique, relu a chaque tour), sur la
 *   chaine des slots seulement. */
/* integration 2026-10-24 : nom distinct de contratRollsFiche (lecture des regles, plus haut) -- les deux branches l avaient declare */
const contratRollsKeeper = /^0x[0-9a-f]{40}$/i.test(String(BLOCKROLLS_DEPLOIEMENT.adresse || '')) && BLOCKROLLS_DEPLOIEMENT.chaine === SLOTS_DEPLOIEMENT.chaine ? String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase() : null;
const contratDuelsKeeper = () => (DUELS_DEPLOIEMENT && DUELS_DEPLOIEMENT.chaine === SLOTS_DEPLOIEMENT.chaine ? contratDuels() : null);
/* DENIM 2026-11-05 : BlockDuelsV2 pour le regleur — la fiche v2 (adresse ET bloc, chaine 8453 : contratDeFicheV2), sur la chaine des slots */
const contratDuelsV2Keeper = () => (DUELS_V2_DEPLOIEMENT && DUELS_V2_DEPLOIEMENT.chaine === SLOTS_DEPLOIEMENT.chaine ? contratDeFicheV2(DUELS_V2_DEPLOIEMENT) : null);
/* la liste par l ETAT du lecteur v2 (duels-v2-serveur.js, minuteur de 30 s) : les duels REJOINTS non finaux, avec leur cible.
 *   ⛔ elle JETTE si le lecteur n est pas celui de ce contrat ou si sa tete servie a plus de DUELS_ETAT_FRAIS_MS (90 s) : une liste perimee
 *   n est jamais prise pour « aucun duel rejoint » (le regleur relit de toute facon duels(id) on chain avant tout envoi). */
function duelsV2JointsKeeper(c) {
  const l = c ? duelsV2() : null, s = l ? l.etat() : null;
  if (!s || s.contrat !== c) throw new Error('duels v2 state list not read for this contract');
  if (!s.luTete || Date.now() - s.luTete > DUELS_ETAT_FRAIS_MS) throw new Error('duels v2 state list stale (last head read ' + (s.luTete ? Math.round((Date.now() - s.luTete) / 1000) + ' s ago' : 'never') + ')');
  return [...s.cache.values()].filter((e) => !e.final && e.duel.joiner && Number.isSafeInteger(e.duel.targetBlock)).map((e) => ({ id: e.duel.id, targetBlock: e.duel.targetBlock }));
}
const regleurSlots = ESSAI_SRV.actif
  ? creerRegleur({ desactive: 'trial mode (ESSAI): the keeper never runs against a trial node' })
  : creerRegleur({ cle: process.env.SLOTS_KEEPER_KEY || null, contrat: contratSlotsFiche, chainId: SLOTS_DEPLOIEMENT.chaine, table: SPIN_ACTIF ? SPIN_ACTIF.config.prizes : SLOTS_DEPLOIEMENT.constructeur.prizes,
    blocDeploiement: (SPIN_ACTIF && SPIN_ACTIF.bloc) || 0, rpc: rpcServeur, journal: (t) => console.log(t),
    /* 2026-11-12: the earlier Spin, still settled (settleMany only) once the new one is served — its last spins are never lost */
    slotsAvant: SPIN_ACTIF && SPIN_ACTIF.avant ? { contrat: SPIN_ACTIF.avant.contrat, table: SPIN_ACTIF.avant.table, bloc: SPIN_ACTIF.avant.bloc } : null,
    duels: { contrat: contratDuelsKeeper, bloc: () => (DUELS_DEPLOIEMENT && Number.isSafeInteger(DUELS_DEPLOIEMENT.bloc) ? DUELS_DEPLOIEMENT.bloc : 0),
      /* 2026-10-24 : les duels REJOINTS lus par l ETAT (le cache de lireDuelsSrv) — un Joined dont le log n a pas ete lu n est plus perdu ;
       *   revue fix2 : avec guesses et mise (classes sans lecture), et la liste JETTE si le cache n est pas frais (duelsJointsKeeper) */
      joints: () => duelsJointsKeeper(contratDuelsKeeper()), connu: (id) => duelConnuKeeper(contratDuelsKeeper(), id) },
    rolls: { contrat: contratRollsKeeper },
    /* DENIM 2026-11-05 (Phil : OUI) : a 200 ms/bloc la fenetre de 256 blocs dure ~51 s. La MEME cle regle aussi :
     *   - BlockDuelsV2 (fiche duels-v2-deploiement.js, relue a chaque tour) : settle(id) d un duel que le REJOIGNANT gagne, pres de la fin
     *     de sa fenetre (sinon settleDefault le donne au createur) ; jamais un duel ou le createur gagne, jamais une egalite ;
     *   - les rolls JOUES de BlockRolls (meme adresse que `rolls`) : settleMany des rolls GAGNANTS dans leur fenetre (sinon ils sont perdus).
     *   Decouverte : les logs Joined / Rolled d une fenetre bornee ; v2 aussi par la liste de l ETAT du lecteur v2 (duelsV2JointsKeeper). */
    duelsV2: { contrat: contratDuelsV2Keeper, bloc: () => (DUELS_V2_DEPLOIEMENT && Number.isSafeInteger(DUELS_V2_DEPLOIEMENT.bloc) ? DUELS_V2_DEPLOIEMENT.bloc : 0),
      joints: () => duelsV2JointsKeeper(contratDuelsV2Keeper()) },
    rollsJoues: { contrat: contratRollsKeeper, bloc: Number.isSafeInteger(BLOCKROLLS_DEPLOIEMENT.bloc) ? BLOCKROLLS_DEPLOIEMENT.bloc : 0 } });
if (regleurSlots.demarrer()) console.log('[slots-keeper] on, keeper ' + regleurSlots.etat().adresse);
else console.log('[slots-keeper] off: ' + regleurSlots.etat().pourquoi);
/* 2026-11-12 : le keeper des buybacks. La fiche tblock-buyback-vault-deploiement.js (adresse null = OFF, rien ne change) ; ensuite il
 *   appelle le nouveau buyback (il est son KEEPER), et l ancien (economie-deploiement.js adresseBuyback, chemin public apres son delai)
 *   tant qu il tient au moins MIN_SPEND, puis plus jamais. La cle vient de process.env seulement et ne sort jamais de buyback-keeper.js. */
const verrouCleKeeper = creerExclusif();
const keeperBuyback = ESSAI_SRV.actif
  ? creerKeeperBuyback({ desactive: 'trial mode (ESSAI): the buyback keeper never runs against a trial node' })
  : creerKeeperBuyback({ cle: process.env.BUYBACK_KEEPER_KEY || null, rec: BUYBACK_VAULT_DEPLOIEMENT, ancien: ECONOMIE_DEPLOIEMENT.adresseBuyback || null,
    rpc: rpcServeur, journal: (t) => console.log(t), exclusif: verrouCleKeeper });
if (keeperBuyback.demarrer()) console.log('[buyback-keeper] on, keeper ' + keeperBuyback.etat().adresse);
else console.log('[buyback-keeper] off: ' + keeperBuyback.etat().pourquoi);
/* le keeper de payDev : rien tant que le nouveau Spin n est pas servi (SPIN_ACTIF.devRouteur) ; il ne tourne que si la cle est celle du keeper
 *   nomme dans la fiche du buyback (la meme adresse gas-only) ; meme verrou que le buyback pour le nonce */
const keeperSpinDev = ESSAI_SRV.actif
  ? creerKeeperSpinDev({ desactive: 'trial mode (ESSAI): the Spin dev keeper never runs against a trial node' })
  : creerKeeperSpinDev({ cle: process.env.BUYBACK_KEEPER_KEY || null, spin: SPIN_ACTIF && SPIN_ACTIF.devRouteur ? SPIN_ACTIF.contrat : null,
    chaine: BUYBACK_VAULT_DEPLOIEMENT.chaine, keeperAttendu: BUYBACK_VAULT_DEPLOIEMENT.parametres && BUYBACK_VAULT_DEPLOIEMENT.parametres.keeper,
    rpc: rpcServeur, journal: (t) => console.log(t), exclusif: verrouCleKeeper });
if (keeperSpinDev.demarrer()) console.log('[spin-dev-keeper] on, keeper ' + keeperSpinDev.etat().adresse);
else console.log('[spin-dev-keeper] off: ' + keeperSpinDev.etat().pourquoi);

/* ══ LE JOURNAL DU JOUR DU JEU (Phil 2026-10-18 : « les brains sont les occupants de la Map ») — journal-jeu.js, GET /api/jeu/journal.
 * ⛔ LU SUR UN MINUTEUR, JAMAIS PAR REQUETE : un tour toutes les JOURNAL_TOUR_MS, au plus JOURNAL_FENETRES_PAR_TOUR fenetres de
 *   JOURNAL_PAS_BLOCS, depuis un CURSEUR (le dernier bloc lu). La requete ne lit que la memoire : elle sert l etat, meme perime, avec `lu`.
 * ⛔ UNE SEULE requete eth_getLogs par fenetre pour TOUS nos contrats (address = [BlockRolls, BlockSkins, BlockDuels, BlockMissionsV3] —
 *   ceux dont la fiche porte une adresse —, topics = leurs evenements, 15 en OU) ; le module pur relit l adresse de CHAQUE log (un topic
 *   d un autre contrat est ignore). SONDE 2026-10-23 (tete 52 990 860) : publicnode SERT cette forme (4 adresses, 15 topics) a -2 000 blocs.
 * ⛔ LE DEBUT DU JOUR EST TROUVE, PAS ESTIME (2026-10-23) — mesure prod 2026-10-18 19:14 UTC : couvertureDepuis 52 771 652 alors qu un
 *   roll paye etait au bloc 52 771 493 le meme jour. Le temps de bloc est MESURE (tete vs tete - 1 000), le premier bloc du jour UTC est
 *   trouve par dichotomie sur les horodatages (premierBlocDuJour, une fois par jour), la borne de profondeur = UNE journee au temps
 *   mesure (profondeurJournee ; 2 s -> ~45 960 blocs, 200 ms Denim -> ~454 200).
 * ⛔ DEUX CURSEURS, AUCUN SAUT : `curseur` avance vers la tete (le direct, toujours lu en premier, a partir de JOURNAL_RECENT_BLOCS sous la
 *   tete au demarrage) ; `bas` recule vers le premier bloc du jour (le rattrapage, fenetre par fenetre, du plus recent au plus ancien).
 *   SONDE 2026-10-23 : publicnode sert eth_getLogs a -9 000 blocs, REFUSE a -30 000 (« Archive requests require a personal token ») ;
 *   mainnet.base.org 429 ; drpc gratuit refuse > 10 000 blocs de plage. Un rattrapage refuse NE SAUTE PAS : `bas` reste, l erreur est
 *   servie (`rattrapage`), et c est retente au tour suivant ; couvreLaJournee reste false tant que le premier bloc du jour n est pas LU.
 *   Memoire seule : perdu au redemarrage, relu a la borne.
 * ⛔ Un bloc dont l horodatage n est pas lu -> la fenetre n est PAS consommee (curseur immobile, relue au tour suivant). */
/* ⛔ 2026-10-23 (verdict adverse, defauts 3 et 4) :
 *   - `coupes` : les evenements du jour LUS mais jetes par la garde (JOURNAL_GARDE). Un journal coupe ne couvre pas la journee :
 *     couvreLaJournee est faux des que coupes > 0 (il etait vrai alors que les plus anciens du jour manquaient).
 *   - un rattrapage REFUSE n est plus retente a chaque tour : il attend tour x 2^(refus-1), plafonne a 32 tours (48 min en prod), remis a
 *     zero par une fenetre lue ou par un nouveau jour. `rattrapage` dit `refus` et `prochainEssai`. `fenetresRattrapage` COMPTE les fenetres
 *     lues par le rattrapage depuis le demarrage (le cout d un redemarrage, jusqu ici non mesure). */
const JOURNAL_PAS_BLOCS = 2000, JOURNAL_RECENT_BLOCS = 9000, JOURNAL_FENETRES_PAR_TOUR = 5, JOURNAL_TOUR_MS = 90000, JOURNAL_GARDE_DEFAUT = 400, JOURNAL_ASSOC_MAX = 5000;
/* TB_JOURNAL_GARDE : pour les bancs a faux noeud seulement (au moins 5) ; en prod, 400 */
const JOURNAL_GARDE = Number.isSafeInteger(Number(process.env.TB_JOURNAL_GARDE)) && Number(process.env.TB_JOURNAL_GARDE) >= 5 ? Number(process.env.TB_JOURNAL_GARDE) : JOURNAL_GARDE_DEFAUT;
/* TB_JOURNAL_TOUR_MS : pour les bancs a faux noeud seulement (au moins 1 s) ; en prod, JOURNAL_TOUR_MS */
const JOURNAL_TOUR_EFFECTIF_MS = Number(process.env.TB_JOURNAL_TOUR_MS) >= 1000 ? Number(process.env.TB_JOURNAL_TOUR_MS) : JOURNAL_TOUR_MS;
const JOURNAL_ATTENTE_MAX_TOURS = 32;
const journalEtat = { curseur: null, bas: null, premierBloc: null, sParBloc: null, profondeur: null, rattrapage: null, jour: null, lu: null,
  coupes: 0, refusRattrapage: 0, rattrapageApres: 0, fenetresRattrapage: 0, restaure: false, restaureDe: null, sauvegardesRefusees: 0,
  evenements: [], cibles: new Map(), devisesListees: new Map(), jetons: new Map(), enVol: false };
/* game372 Step A (measured: 174 catch-up windows per deploy, -2.7 eth_getLogs/min for ~65 min, x3 tries on base.org): the journal is
 *   SAVED on the volume (journal-jeu.json, .tmp then rename, at most once per JOURNAL_SAUVE_MS, the last change always written) and
 *   RESTORED once at boot when it is v1, same chain, same contracts, TODAY (UTC) and its cursor is not past the head. Anything else ->
 *   the normal path (premierBlocJournal): a bad file costs a re-read, never a lost event. Windows read after the last save are read
 *   again after a restart; journal-jeu.js de-duplicates by (tx, logIndex). An old refusal or 429 is NEVER restored (rattrapage,
 *   refusRattrapage, rattrapageApres start empty); fenetresRattrapage stays a count since boot. Over 2 MB or not serialisable (a
 *   BigInt): NOT written, never cut to fit, counted in sauvegardesRefusees (with a failed disk write). */
const FICHIER_JOURNAL = !ESSAI_SRV.actif && process.env.TB_JOURNAL_PERSIST !== '0' && (process.env.RAILWAY_VOLUME_MOUNT_PATH || (existsSync('/data') ? '/data' : null)) ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH || '/data', 'journal-jeu.json') : null;
const JOURNAL_SAUVE_MAX_OCTETS = 2 * 1024 * 1024;
/* TB_JOURNAL_SAUVE_MS: for fake-node benches only (at least 500 ms); in prod, 30 s */
const JOURNAL_SAUVE_MS = Number(process.env.TB_JOURNAL_SAUVE_MS) >= 500 ? Number(process.env.TB_JOURNAL_SAUVE_MS) : 30000;
const journalSauve = { dernier: 0, arme: false, chargeEssaye: false };
/** l attente avant de retenter un rattrapage refuse `refus` fois de suite : tour x 2^(refus-1), au plus JOURNAL_ATTENTE_MAX_TOURS tours */
const attenteRattrapageJournal = (refus) => JOURNAL_TOUR_EFFECTIF_MS * Math.min(JOURNAL_ATTENTE_MAX_TOURS, 2 ** Math.max(0, refus - 1));
const contratsJournal = () => {
  const ok = (x) => { const v = String(x || '').toLowerCase(); return /^0x[0-9a-f]{40}$/.test(v) ? v : null; };
  return { rolls: ok(BLOCKROLLS_DEPLOIEMENT.adresse), skins: ok(BLOCKSKINS_SRV), duels: contratDuels(), missions: ok(MISSIONS_DEPLOIEMENT && MISSIONS_DEPLOIEMENT.adresse) };
};
/** ce que l endpoint dit de la couverture du jour : mesure, jamais supposee */
function couvertureJournal() {
  return { couvertureDepuis: journalEtat.bas, couvreLaJournee: journalEtat.coupes === 0 && journeeCouverte({ premierBloc: journalEtat.premierBloc, basCouvert: journalEtat.bas, hautCouvert: journalEtat.curseur }),
    premierBlocDuJour: journalEtat.premierBloc, secondesParBloc: journalEtat.sParBloc, profondeurMax: journalEtat.profondeur, rattrapage: journalEtat.rattrapage,
    coupes: journalEtat.coupes, fenetresRattrapage: journalEtat.fenetresRattrapage,
    restaure: journalEtat.restaure, restaureDe: journalEtat.restaureDe, sauvegardesRefusees: journalEtat.sauvegardesRefusees };
}
function sauverJournal() {
  if (!FICHIER_JOURNAL) return;
  let payload;
  try {
    payload = JSON.stringify({ v: 1, chainId: 8453, contrats: contratsJournal(), jour: journalEtat.jour, curseur: journalEtat.curseur, bas: journalEtat.bas,
      premierBloc: journalEtat.premierBloc, sParBloc: journalEtat.sParBloc, profondeur: journalEtat.profondeur, coupes: journalEtat.coupes, lu: journalEtat.lu,
      evenements: journalEtat.evenements, cibles: [...journalEtat.cibles.entries()], devisesListees: [...journalEtat.devisesListees.entries()], jetons: [...journalEtat.jetons.entries()] });
  } catch (_) { journalEtat.sauvegardesRefusees++; return; }
  if (Buffer.byteLength(payload) > JOURNAL_SAUVE_MAX_OCTETS) { journalEtat.sauvegardesRefusees++; return; }
  try { writeFileSync(FICHIER_JOURNAL + '.tmp', payload); renameSync(FICHIER_JOURNAL + '.tmp', FICHIER_JOURNAL); journalSauve.dernier = Date.now(); }
  catch (_) { journalEtat.sauvegardesRefusees++; }
}
/** at most one write per JOURNAL_SAUVE_MS; a change inside the window is written when it ends (the state AT that moment) */
function noterJournal() {
  if (!FICHIER_JOURNAL || journalSauve.arme) return;
  const reste = journalSauve.dernier + JOURNAL_SAUVE_MS - Date.now();
  if (reste <= 0) { sauverJournal(); return; }
  journalSauve.arme = true;
  setTimeout(() => { journalSauve.arme = false; sauverJournal(); }, reste).unref?.();
}
/** restores the saved journal when every check holds; true if restored. Any failed check: false, nothing touched */
function chargerJournal(tete, sur) {
  if (!FICHIER_JOURNAL) return false;
  let o;
  try { if (!existsSync(FICHIER_JOURNAL)) return false; o = JSON.parse(readFileSync(FICHIER_JOURNAL, 'utf8')); } catch (_) { return false; }
  const ent = Number.isSafeInteger, c = contratsJournal();
  if (!o || typeof o !== 'object' || o.v !== 1 || o.chainId !== 8453 || !o.contrats) return false;
  if (['rolls', 'skins', 'duels', 'missions'].some((k) => (o.contrats[k] ?? null) !== c[k])) return false;
  if (o.jour !== jourDe(Date.now()).id) return false;
  if (!ent(o.curseur) || o.curseur > tete || !ent(o.bas) || o.bas < 1 || o.bas > o.curseur + 1) return false;
  /* game372 review: a cursor deeper than the normal boot's first direct window (sur - JOURNAL_RECENT_BLOCS) is NOT restored. The direct
   *  path has no refusal back-off and no published refusal: from a deep cursor the public node refuses (archive depth), and the direct
   *  stalls on that window every tour, showing no new event, while the deep part belongs to the catch-up (back-off, refusal shown). */
  if (!ent(sur) || o.curseur < sur - JOURNAL_RECENT_BLOCS) return false;
  if (!(o.premierBloc === null || ent(o.premierBloc))) return false;
  if (![o.evenements, o.cibles, o.devisesListees, o.jetons].every(Array.isArray)) return false;
  let cibles, devisesListees, jetons;
  try { cibles = new Map(o.cibles); devisesListees = new Map(o.devisesListees); jetons = new Map(o.jetons); } catch (_) { return false; }
  const fini = (x) => (Number.isFinite(x) ? x : null);
  Object.assign(journalEtat, { curseur: o.curseur, bas: o.bas, premierBloc: o.premierBloc, sParBloc: fini(o.sParBloc), profondeur: ent(o.profondeur) ? o.profondeur : null,
    jour: o.jour, lu: fini(o.lu), coupes: ent(o.coupes) && o.coupes >= 0 ? o.coupes : 0, evenements: o.evenements, cibles, devisesListees, jetons,
    rattrapage: null, refusRattrapage: 0, rattrapageApres: 0, restaure: true, restaureDe: o.curseur });
  return true;
}
/** le premier bloc du jour UTC `j`, au temps de bloc MESURE (tete vs tete - 1 000) ; pose sParBloc / profondeur ; null si illisible */
async function premierBlocJournal(tete, j) {
  const tsT = await horodatageBloc(tete), tsA = await horodatageBloc(tete - 1000);
  const s = tempsDeBlocJournal(tsT, tsA, 1000);
  if (s === null) return null;
  const prof = profondeurJournee(s);
  journalEtat.sParBloc = s; journalEtat.profondeur = prof;
  const r = await premierBlocDuJour(horodatageBloc, { tete, cibleS: Math.floor(j.debut / 1000), sParBloc: s, profondeurMax: prof });
  return r ? r.bloc : null;
}
/** UNE fenetre [de, a] de logs de nos contrats -> journalEtat ; true si elle est consommee entiere, false sinon (rien n est avance) */
async function lireFenetreJournal(de, a, c) {
  const adresses = [c.rolls, c.skins, c.duels, c.missions].filter(Boolean);
  const topics = [[...(c.rolls ? TOPICS_ROLLS_JOURNAL : []), ...(c.skins ? TOPICS_SKINS_JOURNAL : []), ...(c.duels ? TOPICS_DUELS_JOURNAL : []), ...(c.missions ? TOPICS_MISSIONS_JOURNAL : [])]];
  const logs = await rpcServeur('eth_getLogs', [{ address: adresses, fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16), topics }]);
  if (!Array.isArray(logs)) return false;
  const heures = new Map();
  for (const b of new Set(logs.map((l) => parseInt(l && l.blockNumber, 16)).filter(Number.isSafeInteger))) {
    const ts = await horodatageBloc(b); if (ts === null) return false; heures.set(b, ts);
  }
  /* le jeton de chaque duel deja LU par le lecteur des duels (par l etat, 2026-10-24) : un Settled du jour dont le Created est plus vieux dit son montant */
  const jetons = new Map(journalEtat.jetons);
  if (c.duels && duelsSrv.contrat === c.duels) { try { for (const [id, e] of duelsSrv.cache) if (!jetons.has('d:' + id)) jetons.set('d:' + id, e.duel.token); } catch (_) { /* sans graine : sans montant */ } }
  const r = lireEvenementsJeu(logs, c, { horodatage: (b) => (heures.has(b) ? heures.get(b) : null), cibles: journalEtat.cibles, devisesListees: journalEtat.devisesListees, jetons, devises: DEVISES_SKIN_SRV });
  if (r.sansHeure) return false;
  for (const [k, v] of r.cibles) journalEtat.cibles.set(k, v);
  /* ⛔ 2e verdict 2026-10-23 (defaut 2) : `set(k, v)` laissait un Listed PLUS VIEUX (le rattrapage lit a rebours) ecraser la devise d un
   *  relisting plus recent. Un historique par skin, insere a sa place (journal-jeu.js, ajouterListing) : rien n ecrase un listing plus recent. */
  for (const [k, v] of r.devisesListees) ajouterListing(journalEtat.devisesListees, k, v);
  for (const [k, v] of r.jetons) journalEtat.jetons.set(k, v);
  for (const m of [journalEtat.cibles, journalEtat.devisesListees, journalEtat.jetons]) while (m.size > JOURNAL_ASSOC_MAX) m.delete(m.keys().next().value);
  const g = garderJournal(journalEtat.evenements, r.evenements, { depuisMs: jourDe(Date.now()).debut, max: JOURNAL_GARDE });
  journalEtat.coupes += g.coupes;
  journalEtat.evenements = completerJournal(g.evenements, { cibles: journalEtat.cibles, devisesListees: journalEtat.devisesListees, devises: DEVISES_SKIN_SRV });
  return true;
}
async function lireJournalJeu() {
  const c = contratsJournal();
  if (journalEtat.enVol || (!c.rolls && !c.skins && !c.duels && !c.missions)) return;
  journalEtat.enVol = true;
  const avantJl = journalEtat.curseur + ':' + journalEtat.bas;
  try {
    const j = jourDe(Date.now());
    const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    if (!Number.isSafeInteger(tete) || tete <= 1000) return;
    const sur = tete - margeBlocsRolls();
    /* game372 Step A: once, before the first read of the day's first block */
    if (journalEtat.curseur === null && !journalSauve.chargeEssaye) { journalSauve.chargeEssaye = true; chargerJournal(tete, sur); }
    if (journalEtat.curseur === null) {
      /* DENIM : le premier bloc du jour est TROUVE en lisant des horodatages (premierBlocJournal), sans hypothese de temps de bloc */
      const premier = await premierBlocJournal(tete, j);
      if (premier === null) return; /* rien n est pose : retente au tour suivant */
      const depart = Math.max(premier, sur - JOURNAL_RECENT_BLOCS + 1, 1);
      Object.assign(journalEtat, { curseur: depart - 1, bas: depart, premierBloc: premier, jour: j.id, rattrapage: null, coupes: 0, refusRattrapage: 0, rattrapageApres: 0 });
    } else if (journalEtat.jour !== j.id || journalEtat.premierBloc === null) {
      /* un nouveau jour UTC (ou un premier bloc pas encore trouve), curseur continu : la plage lue est [bas, curseur], contigue. Pour le
       *  nouveau jour elle commence a max(bas, min(curseur + 1, premier)) : au premier bloc du jour s il est deja lu, sinon au prochain bloc a
       *  lire. Elle couvre la journee quand le premier bloc du jour est LU (journeeCouverte). */
      if (journalEtat.jour !== j.id) Object.assign(journalEtat, { jour: j.id, premierBloc: null, rattrapage: null, coupes: 0, refusRattrapage: 0, rattrapageApres: 0 });
      const premier = await premierBlocJournal(tete, j);
      if (premier !== null) { journalEtat.premierBloc = premier; journalEtat.bas = Math.max(journalEtat.bas, Math.min(journalEtat.curseur + 1, premier)); }
    }
    /* 1. le direct : vers la tete */
    let de = journalEtat.curseur + 1, fenetres = 0;
    for (; fenetres < JOURNAL_FENETRES_PAR_TOUR && de <= sur; fenetres++) {
      const a = Math.min(sur, de + JOURNAL_PAS_BLOCS - 1);
      if (!(await lireFenetreJournal(de, a, c))) return;
      journalEtat.curseur = a; journalEtat.lu = Date.now(); de = a + 1;
    }
    if (de > sur) journalEtat.lu = Date.now();
    /* 2. le rattrapage : vers le premier bloc du jour, du plus recent au plus ancien, avec ce qui reste du budget (au moins une fenetre) */
    const p = journalEtat.premierBloc;
    /* un refus recent : on ATTEND (tour x 2^(refus-1)) au lieu de redemander la meme fenetre a chaque tour ; `bas` ne bouge pas, rien n est saute */
    const attendRattrapage = Date.now() < journalEtat.rattrapageApres;
    for (let k = 0; !attendRattrapage && k < Math.max(1, JOURNAL_FENETRES_PAR_TOUR - fenetres) && Number.isSafeInteger(p) && journalEtat.bas > p; k++) {
      const a = journalEtat.bas - 1, d = Math.max(p, a - JOURNAL_PAS_BLOCS + 1);
      let fait = false, pourquoi = 'logs not read';
      try { fait = await lireFenetreJournal(d, a, c); } catch (e) { pourquoi = String((e && e.message) || e).slice(0, 120); }
      if (!fait) {
        journalEtat.refusRattrapage++;
        journalEtat.rattrapageApres = Date.now() + attenteRattrapageJournal(journalEtat.refusRattrapage);
        journalEtat.rattrapage = { de: d, a, pourquoi: masquerCle(pourquoi), lu: new Date().toISOString(), refus: journalEtat.refusRattrapage,
          prochainEssai: new Date(journalEtat.rattrapageApres).toISOString() };
        break;
      }
      journalEtat.bas = d; journalEtat.rattrapage = null; journalEtat.refusRattrapage = 0; journalEtat.rattrapageApres = 0; journalEtat.fenetresRattrapage++;
    }
  } catch (_) { /* relu au prochain tour, depuis le meme curseur */ } finally {
    journalEtat.enVol = false;
    if (journalEtat.curseur + ':' + journalEtat.bas !== avantJl) noterJournal(); /* game372 Step A: a pass that moved curseur or bas */
  }
}
if (process.env.TB_JOURNAL !== '0') {
  /* TB_JOURNAL_TOUR_MS : voir JOURNAL_TOUR_EFFECTIF_MS (bancs seulement) */
  const tourJl = JOURNAL_TOUR_EFFECTIF_MS;
  setTimeout(() => { void consommateurArchive.run('fond journal', () => lireJournalJeu()); setInterval(() => { void consommateurArchive.run('fond journal', () => lireJournalJeu()); }, tourJl).unref?.(); },
    Math.max(500, Number(process.env.TB_JOURNAL_PREMIER_MS) || 20000)).unref?.();
}
/* ══ NIVEAUX DU BRAIN (2026-10-18, niveaux-jeu.js) — l XP vient de gestes VERIFIES : les logs de NOS contrats (BlockRolls : Rolled paye,
 *   Settled, PassBought ; BlockSkins actif : SkinMinted, Sold ; BlockMissions : TaskClaimed — crochet, ferme tant qu aucune adresse + bloc
 *   n est notee), lus par fenetres de 2 000 blocs avec un curseur PAR SOURCE garde dans revenu.xpScan (jamais un balayage depuis le
 *   deploiement a chaque requete), et les jours avec ticket (revenu.jours / revenu.passes). Les rolls practice n ont pas de wallet : 0 XP.
 * ⛔ SONDE 2026-10-18 (tete 52 775 375) : publicnode sert eth_getLogs a -9 500 blocs et REFUSE a -12 000 (« Archive requests require a
 *   personal token ») ; mainnet.base.org rend 429. Sans RPC_ARCHIVE, une source dont le curseur (ou le deploiement) est plus vieux que
 *   tete - XP_RECUL_MAX commence a tete - XP_RECUL_MAX et le TROU est note (revenu.xpTrous, rendu par /api/jeu/niveau) : de l XP manquant,
 *   dit, jamais invente. Lecture ratee -> le curseur ne bouge pas (relu au tour suivant). */
const XP_RECUL_MAX = 9000, XP_FENETRE = 2000, XP_FENETRES_PAR_TOUR = 5;
function sourcesXp() {
  const adr = (x) => (/^0x[0-9a-f]{40}$/i.test(String(x || '')) ? String(x).toLowerCase() : null);
  return [
    { cle: 'rolls', contrat: adr(BLOCKROLLS_DEPLOIEMENT.adresse), bloc: BLOCKROLLS_DEPLOIEMENT.bloc, topics: [TOPICS_XP.rolled, TOPICS_XP.settled, TOPICS_XP.pass] },
    /* 2026-11-12 (the economy pack is live): skins are minted on the pack's Skins now. The earlier contract keeps its key and cursor ('skins');
     *   the pack's Skins gets its OWN key, read from its creation block (never resumed from the earlier contract's cursor) */
    /* 2026-11-12 (the 1 USDC Skins): 'skins' and 'skinsPack' exactly as before, then 'skinsUn' from its own creation block (blockskins-actif.js sourcesSkins) */
    ...sourcesSkins().map((s) => ({ cle: s.cle, genre: 'skins', contrat: adr(s.contrat), bloc: s.bloc, topics: [TOPICS_XP.skinMinted, TOPICS_XP.skinSold] })),
    { cle: 'missions', contrat: adr(MISSIONS_DEPLOIEMENT.adresse), bloc: MISSIONS_DEPLOIEMENT.bloc, topics: [TOPICS_XP.taskClaimed] },
  ].filter((s) => s.contrat && Number.isSafeInteger(s.bloc) && s.bloc > 0);
}
let xpScanEnVol = false;
async function crediterXp() {
  if (xpScanEnVol) return;
  xpScanEnVol = true;
  try {
    const tete = parseInt(await rpcServeur('eth_blockNumber', []), 16);
    if (!Number.isSafeInteger(tete)) return;
    const sur = tete - margeBlocsRolls();
    revenu.xpScan = revenu.xpScan || {}; revenu.xpTrous = revenu.xpTrous || [];
    const srcs = sourcesXp(), adresses = Object.fromEntries(srcs.map((s) => [s.cle, s.contrat]));
    for (const s of srcs) {
      let de = Number.isSafeInteger(revenu.xpScan[s.cle]) ? revenu.xpScan[s.cle] + 1 : s.bloc;
      if (!RPC_ARCHIVE && de < sur - XP_RECUL_MAX) {
        revenu.xpTrous.push({ source: s.cle, de, a: sur - XP_RECUL_MAX - 1, note: 'older than the public nodes serve logs' });
        if (revenu.xpTrous.length > 50) revenu.xpTrous.splice(0, revenu.xpTrous.length - 50);
        de = sur - XP_RECUL_MAX; revenuSale = true;
      }
      for (let tour = 0; tour < XP_FENETRES_PAR_TOUR && de <= sur; tour++) {
        const a = Math.min(sur, de + XP_FENETRE - 1);
        let logs;
        try { logs = await rpcServeur('eth_getLogs', [{ address: s.contrat, fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16), topics: [s.topics] }]); } catch (_) { break; }
        if (!Array.isArray(logs)) break;
        revenu.xpEtat = crediterActions(revenu.xpEtat || {}, actionsDesLogs(logs, s.genre ? { [s.genre]: s.contrat } : adresses));
        revenu.xpScan[s.cle] = a; revenuSale = true; de = a + 1;
      }
    }
  } catch (_) { /* relu au prochain tour, depuis les memes curseurs */ } finally { xpScanEnVol = false; }
}
setTimeout(() => { void consommateurArchive.run('fond xp', () => crediterXp()); }, 20000).unref?.();
setInterval(() => { void consommateurArchive.run('fond xp', () => crediterXp()); }, 120000).unref?.();
/* jours avec ticket par wallet : recalcules au plus toutes les 30 s (revenu.jours + revenu.passes, jusqu a aujourd hui inclus) */
const joursTicketCache = { t: 0, jour: null, carte: {} };
function joursTicketSrv() {
  const j = jourDe(Date.now()).id;
  if (Date.now() - joursTicketCache.t > 30000 || joursTicketCache.jour !== j) {
    joursTicketCache.carte = joursTicketParWallet(revenu.jours || {}, revenu.passes || {}, j, SEUIL_VOLUME_JOUR_USD);
    joursTicketCache.t = Date.now(); joursTicketCache.jour = j;
  }
  return joursTicketCache.carte;
}
const niveauxCache = new Map();
function niveauSrv(wallet) {
  const a = String(wallet || '').toLowerCase();
  return niveauWallet({ compteurs: ((revenu.xpEtat || {}).xp || {})[a] || {}, joursTicket: joursTicketSrv()[a] || 0 });
}
setInterval(() => {
  if (!revenuSale || !FICHIER_REVENU) return;
  try { writeFileSync(FICHIER_REVENU + '.tmp', JSON.stringify(revenu)); renameSync(FICHIER_REVENU + '.tmp', FICHIER_REVENU); revenuSale = false; }
  catch (e) { console.log('[revenu] ecriture ratee :', e.message); }
}, 30000).unref();
/* les tickets en attente reessayes par le serveur (balayerTicketsEnAttente, plus haut) : toutes les 3 min, un balayage a la fois */
let balayageTicketsEnVol = false;
setInterval(() => {
  if (balayageTicketsEnVol || !Object.keys(revenu.ticketsEnAttente || {}).length) return;
  balayageTicketsEnVol = true;
  void balayerTicketsEnAttente().catch(() => 0).finally(() => { balayageTicketsEnVol = false; });
}, 3 * 60000).unref();

const SERVIS = [
  /* ⛔⛔ LE MANIFESTE FARCASTER ETAIT ABSENT DE CETTE LISTE (releve par Zero 1 depuis un terminal,
   *     2026-09-21). Le fichier EXISTAIT sur le disque depuis le 8 septembre ; il n a simplement
   *     jamais ete servi. Resultat : l app declarait `fc:miniapp` et `fc:frame` dans son HTML — donc
   *     elle se presentait a Farcaster comme une Mini App — et rendait 404 quand Farcaster venait
   *     verifier. Un fichier qui existe et qu on ne sert pas n existe pas.
   * ⛔ ET SON CONTENU POINTAIT AILLEURS : toutes ses URL visaient tokenized-block.github.io,
   *    l ancien host, qui redirige. Meme servi, il aurait envoye les visiteurs dans le vide.
   * ⛔ C EST UN DEFAUT DE DECOUVRABILITE, et c est exactement le probleme qu on mesure par ailleurs :
   *    0 de nos 8 blocks connus de l index public. Un canal ferme de plus. */
  '.well-known/farcaster.json',
  'app.html', 'index.html', 'block-0.html', 'lien-x.html', 'privacy.html', 'terms.html', 'deployer-ticketpot-unit.html', 'ticketpot-unit-deploiement.js', 'deployer-tamart.html', 'deploy-v2.html', 'deploy-v2.json', 'deploy-v3.html', 'deploy-v3.json', 'deploy-v4.html', 'deploy-v4.json', 'deploy-v5.html', 'deploy-v5.json', 'deploy-v6.html', 'deploy-v6.json', 'deploy-v7.html', 'deploy-v7.json', 'deploy-v8.html', 'deploy-v8.json', 'deploy-pot.html', 'deploy-pot.json', 'pot.html', 'boucle-pot.js', 'keeper-pot.js', 'regle-snapshot.js', 'soldes-jeton.js', 'parts-holders.js', 'merkle-pot.js', 'reclamer.html', 'reclamation.js', 'veille-pot.js', 'veille-frais.js', 'comparer-frais.js', 'frais.html',
  /* 2026-10-18 : la page PUBLIQUE « Fees & risks » (liee depuis Learn et le Game), son module et ses deux sources neuves cote navigateur.
   *   Chaque chiffre vient d un module deja servi ; tirage-saison.js (pur, importe keccak.js) et frais-contrats.js (genere des .sol)
   *   s ajoutent. test-imports-servis suit ses imports, test-frais-et-risques-20261018 exige ces quatre lignes. */
  'frais-et-risques.html', 'frais-risques.js', 'frais-contrats.js', 'tirage-saison.js', 'banque-frais.js',
  /* game374: the fees page reads the holder rule (tblock-hold-regle.js, pure) and the launchpad measure + tax cap (pool-lanceur-taxe.js, pure) */
  'tblock-hold-regle.js', 'pool-lanceur-taxe.js',
  'motifs-noto.js', 'photo.js', 'retirer-fond.js', 'apparence.js', 'classement.js', 'consentement.js', 'criblage.js', 'encodeur.js',
  'index-blocks.js', 'keccak.js', 'lancement.js', 'lecteur.js', 'lien-x.js', 'marche.js',
  'montants.js', 'motssimples.js', 'photo.js', 'pointsdevie.js', 'pool.js', 'vitalite.js',
  'visage.js', 'logo.js', 'faits.js', 'envoi.js', 'cerveau.js', 'metiers.js', 'frais-creation.js', 'achat-tblock-usdc.js', 'prix-eth.js', 'messages.js', 'paires.js', 'face.js', 'face-hasard.js', 'lancement-guide.js', 'ref-vitrine.js', 'lancer-pool.js', 'nourriture.js', 'apercu.js', 'mes-blocks.js', 'tokenized-bank.js', 'bridge.js', 'x402-pay.js', 'fil-live.js', 'achats.js', 'tokenomics.js', 'lancer-pool-v2.js', 'memoire-chaine.js', 'resume-tx.js', 'origine.js', 'echange.js', 'journal-cerveau.js', 'cerveau-echange.js', 'tweet-grave.js', 'liquidite.js', 'regles-cerveau.js', 'fragments-cerveau.js', 'parole-cerveaux.js', 'export-cerveau.js', 'brain-tasks.js', 'stades.js', 'pools-du-jeton.js', 'messagerie-blocks.js', 'relais-cerveaux.js', 'pnl-swaps.js', 'openlaunch.js', 'openlaunch-launch.js', 'map3d.js', 'trending.js', 'locker.js', 'tirage.js', 'cube3d.js', 'groupe-wallet.js', 'causes-echec.js', 'verif-paiement.js', 'source-visite.js', 'choix-de-pool.js', 'pool-sans-hook.js', 'index-routeur.js', 'jetons-nes-launchpads.js', 'multiplicateur-action.js', 'geste-envoi.js', 'frais-du-geste.js',
  /* ⛔ AJOUTE LE 2026-09-26 — et c est `test-imports-servis` qui l a EXIGE, pas moi : un module
   *   importe par `app.html` et absent de cette liste rend la page MORTE en production, sans que
   *   rien d autre ne le dise. La garde a crie avant le deploiement. */
  'heures-marche.js',
  /* 2026-10-25 : ce que l index des createurs du serveur couvre deja (importe par app.html, mesCreations) */
  'creations-index.js',
  /* ⛔ 2026-10-25 : le parcours carte -> block (actif finance, retour lu sur le solde, moyens par pays), importe par `app.html`. */
  'retour-fiat.js',
  /* 2026-10-26 : la section Fiat de l onglet Wallet (pure), importee par `app.html`. */
  'wallet-fiat.js',
  /* ⛔ 2026-10-02 : debit et refus permanents des noeuds RPC publics, importe par `app.html`. */
  'regulateur-rpc.js',
  /* ⛔ 2026-10-04 : les lectures independantes d un plan, lancees ensemble et bornees. Importe par `echange.js`, `marche.js` et
   *   `plan-franchissement.js`, donc par la page : absent d ici = import 404 = app MORTE. C est `test-imports-servis` qui l a
   *   exige (rouge « 3 module(s) importe(s) mais non servi(s) » avant cette ligne), pas ma relecture. */
  'lectures-en-vol.js',
  /* ⛔ 2026-10-02 : les lignes groupees du Feed se deplient, leurs notes se lisent depuis leurs tx. */
  'notes-du-fil.js',
  /* ⛔ `pool-cl.js` LIT LES POOLS AERODROME CL (et tout fork Uniswap v3) — la ou `pool.js` ne sait
   *   que le v4. Ses deux dependances (`keccak.js`, `pool.js`) sont deja servies plus haut ; la
   *   garde ci-dessous ne relit QUE les imports DIRECTS de `app.html`, donc elle ne dirait rien
   *   d un manque transitif. C est ici qu il faut le declarer, et nulle part ailleurs. */
  'pool-cl.js',
  /* ⛔ `voix-block.js` : la voix choisie par le createur (importe par parole-cerveaux.js, donc par la page). */
  'voix-block.js',
  /* ⛔ `routage.js` CLASSE POURQUOI UN MARCHE N EST PAS ECHANGEABLE ICI. Il n a AUCUNE dependance,
   *   donc rien d autre a declarer — mais l oublier ici rendrait la page MORTE, et c est bien la
   *   garde ci-dessous qui l a crie avant ce deploiement, pas ma relecture. */
  'routage.js',
  /* 2026-11-05 : la page d ESSAI du mode autonome (Phil la teste avec SON Base Account). NON liee depuis l app ; le drapeau
   *   MODE_AUTONOME_DRAPEAU reste false. Ses imports (agent-autonome.js, agent-sous-compte.js) n etaient servis par personne. */
  'essai-autonome.html', 'essai-autonome.js', 'agent-autonome.js', 'agent-sous-compte.js',
  /* ⛔⛔ `actions-emetteur.js` PORTE LE LIBELLE « issued by Coinbase » DE LA PAGE, et il est importe
   *     PAR LE SERVEUR AUSSI (qui lit la liste des 40 et marque chaque ligne de trending). Le
   *     libelle est ecrit UNE fois et importe des deux cotes : deux copies d une phrase visible
   *     divergent, et c est alors l ecran qui mentira, pas le serveur.
   *   ⛔ L OUBLIER ICI REND LA PAGE MORTE — un import 404 arrete tout le module. */
  'actions-emetteur.js',
  /* ⛔⛔⛔ `espacements-cl.js` EST DEVENU UN MODULE DU NAVIGATEUR LE 2026-09-30 : `echange-eth.js`
   *      l importe pour balayer les NEUF espacements de la factory en cherchant la pool du block.
   *      Il n etait que cote serveur jusque-la, et l oublier ici aurait rendu la page MORTE en
   *      production — un import 404 arrete tout le module, silencieusement.
   *    ⇒ C est `test-imports-servis.mjs` qui l a crie, pas ma relecture. La garde a paye. */
  'espacements-cl.js',
  /* ⛔ `tokeniser-un-jeton.js` porte le refus de sosie et le frais FAIL-CLOSED du chemin
   *   « make a block from an existing token ». L oublier ici ne casserait pas ce champ :
   *   ca tuerait TOUTE la page, puisqu un import 404 arrete le module entier. */
  'tokeniser-un-jeton.js',
  /* ⛔ `profondeur-logs.js` decide vers quel noeud part une lecture d historique profond.
   *   L oublier ici tuerait TOUTE la page : un import 404 arrete le module entier. */
  'profondeur-logs.js',
  /* ⛔ `texte-onchain.js` decode les noms et symboles ecrits par n importe qui. L oublier ici
   *   tuerait TOUTE la page — et c est `test-imports-servis.mjs` qui l a crie, pas ma relecture :
   *   troisieme fois que cette garde paie. */
  'texte-onchain.js',
  /* 2026-11-04 « block marchand » : la boutique Shopify gravee a la naissance, validee a l ecriture ET a la lecture (importe
   *   texte-onchain.js, servi juste au-dessus). */
  'boutique-block.js',
  /* ⛔ `blocks-a-lancer.js` decide si un block deja cree bloque encore la creation suivante.
   *   L oublier ici tuerait TOUTE la page — un import 404 arrete le module entier. */
  'blocks-a-lancer.js',
  /* ⛔ `symbole-trompeur.js` marque les tickers qui se lisent comme une devise. L oublier ici
   *   tuerait TOUTE la page — un import 404 arrete le module entier. */
  'symbole-trompeur.js',
  /* ⛔ `place-sur-la-map.js` decide qui entre sur la map quand elle est pleine — et donc aussi
   *   qui a un cerveau, puisque le selecteur du Brain se construit sur les memes habitants.
   *   L oublier ici tuerait TOUTE la page : un import 404 arrete le module entier. */
  'place-sur-la-map.js',
  /* ⛔ `cobalt.js` porte la frontiere MESUREE du hardfork (bloc 52 000 927) et le REFUS d afficher
   *   un equivalent en actions quand `multiplier()` et `uiMultiplier()` se contredisent. Ajoute a
   *   la liste AVANT d etre importe, deliberement : un module servi et pas encore utilise ne coute
   *   rien, alors qu un module importe et pas servi rend un 404 qui arrete le module ENTIER —
   *   c est-a-dire toute la page. L ordre « servir d abord, cabler ensuite » est le seul sur. */
  'cobalt.js',
  /* ⛔ 2026-10-09 : `reference-action.js` porte la phrase de la reference Chainlink et le SEUIL d ecart du ticket ; importe par
   *   `app.html`. L oublier ici tuerait TOUTE la page — un import 404 arrete le module entier. */
  'reference-action.js',
  /* ⛔ 2026-10-09 : les interactions des cerveaux (parler, rencontre, cercle) — importe par `app.html`, servi AVANT d etre cable. */
  'interactions-cerveaux.js',
  /* ⛔ 2026-10-26 : « what its brain sees » (pur, lecture seule) — importe par `app.html`. */
  'vision-cerveau.js',
  /* ⛔ 2026-10-27 : les couleurs de la skin portee par un block (pur, sans reseau) — importe par `app.html`. */
  'vision-skin.js',
  /* ⛔ 2026-10-26 : le panneau Live (plusieurs vues Inside en direct ; pur, lecture seule) — importe par `app.html`. */
  'vision-live.js',
  'vision-inside.js',
  /* ⛔ game57 #5: one brain per address on the page (pure) — imported by `app.html`. */
  'page-brains.js',
  /* game57 #4b (d): the block inspect model (pure), imported by `app.html`. */
  'inspect-block.js',
  /* ⛔ `route-multi-factory.js` refuse une route a cheval sur deux factories — le cas ou CHAQUE
   *   jambe existe et ou l appel reverte quand meme (OUSD : 10 M$ au pair sur Uniswap V4, 0 pool
   *   Aerodrome CL). Servi AVANT d etre importe, comme `cobalt.js` : un module servi et pas encore
   *   utilise ne coute rien, un module importe et pas servi rend un 404 qui arrete toute la page. */
  'route-multi-factory.js',
  /* ⛔ `route-v4-multi-sauts.js` assemble une route V4 de 2 a 4 sauts, frais dans la devise
   *   d ENTREE. Servi AVANT d etre importe, comme les deux precedents : un module servi et pas
   *   encore utilise ne coute rien, un module importe et pas servi rend un 404 qui arrete le
   *   module ENTIER — donc toute la page. */
  'route-v4-multi-sauts.js',
  /* ⛔ `pont-de-liquidite.js` trouve le chemin entre deux jetons sur le graphe des pools MESUREES,
   *   le DECOUPE par factory (un segment = une transaction) et dit le frais TOTAL — 0,1 % PAR
   *   transaction, donc 0,2 % sur une route a deux segments. Servi avant d etre importe. */
  'pont-de-liquidite.js',
  /* ⛔⛔ `frais-degressif.js` est IMPORTE PAR `echange.js`, qui est servi : l oublier ici rendrait un
   *   404 qui arrete le module ENTIER, donc toute la page. C est `test-imports-servis.mjs` qui m a
   *   attrape — la garde a fait son travail avant le deploiement.
   *   Il porte le bareme : 0,2 % jusqu a 100 $ (p75 mesure), 0,1 % au-dela, et le PLANCHER qui
   *   empeche qu un cent de plus coute moitie moins. */
  'frais-degressif.js',
  /* ⛔ 2026-10-02 : importes par `echange.js` / `openlaunch-launch.js` / l app (part referrer o1, marche ouvert). */
  'referent-o1.js', 'lancements-etrangers.js', 'marche-ouvert.js',
  /* ⛔⛔ `devises-dentree.js` REPOND « avec quoi peut-on payer ce block ? ». Il ajoute au graphe des
   *   pools l ARETE DU BLOCK LUI-MEME — celle qui manquait, et sans laquelle `cheminEntre(OUSD,
   *   block)` rendait REFUSE non pas parce qu aucune route n existe, mais parce que personne n avait
   *   mesure l arete d arrivee. Le pont etait complet ET inatteignable depuis l ecran d echange.
   *   Il distingue SANS_ROUTE (on a REGARDE) de NON_MESUREE (on n a PAS regarde) : seule la
   *   premiere est un verdict, et confondre les deux transformerait notre incompletude en
   *   accusation. 60 assertions, ROUGE prouve par 9 mutations sur 10 — la 10e etait un temoin de
   *   non-sabotage, elle DEVAIT survivre. */
  'devises-dentree.js',
  /* ⛔⛔ `sauts-depuis-chemin.js` est le dernier pas entre « une route existe » et « on la batit » :
   *   il transforme un chemin `[{de, vers, famille}]` en sauts `[{cle, zeroForOne}]` en resolvant
   *   chaque jambe par un resolveur INJECTE. Il refuse toute la route si UN saut manque, et il dit
   *   LEQUEL — une route partielle produirait un calldata qui s arrete au milieu. 45 assertions,
   *   9/9 mutations attrapees. */
  'sauts-depuis-chemin.js',
  /* 2026-10-03 (Phil) : les sauts d un echange block -> block (importe par app.html : absent d ici = 404 = app morte) */
  'bloc-vers-bloc.js',
  'hook-7030-descripteur.js', 'deploy-7030.html', 'deploy-7030.json',
  /* 2026-10-04 : le panneau de commande (telecommande MCP) — ses modules sont ceux de l app, deja servis */
  'panel.html',
  /* 2026-10-04 : le minimum du createur, lu et rendu depuis la page du block (importe par app.html : absent d ici = 404 = app morte) */
  'caution-createur.js',
  /* 2026-10-17 : ajouter une seconde paire a un block deja ne (importe par app.html : absent d ici = 404 = app morte) */
  'ajouter-paire.js',
  /* 2026-10-04 : la grammaire des commandes ecrites au cerveau + les pre-commandes (importe par app.html) */
  'commandes-panel.js',
  'panneau-commandes.js', /* 2026-10-25 (Phil : « control panel upgrade ») : les quatre groupes du panneau, badges reads / you sign, actions suivantes (pur) */
  /* 2026-10-18 : la palette Ctrl+K du panneau — filtre et classement purs (importe par app.html : absent d ici = 404 = app morte) */
  'palette.js',
  'skins.js',
  /* 2026-10-11 : la skin du block sur le contrat BlockSkins DEPLOYE (importe par app.html : absent d ici = 404 = app morte) et sa fiche.
   *   2026-10-18 : blockskins-actif.js = le contrat ACTIF et son prix de mint, lus dans la fiche (importe par blockskins.js et skins.js :
   *   absent d ici = 404 = app morte). */
  'blockskins.js', 'blockskins-actif.js', 'blockskins-deploiement.js',
  /* 2026-10-23 : la section Skins de l onglet Market (logique pure : statut, filtres, apercu, « new bid ») — importee par app.html */
  'skins-marche.js',
  /* 2026-10-27 : la salle des encheres des skins (ce que dit le crieur) et la pensee du brain (gabarits fixes) — importees par app.html */
  'salle-encheres.js', 'pensee-cerveau.js', 'lexique-cerveau.js',
  /* 2026-10-04 : l etat des devises de paire (born / not_born / not_read) et LA regle de l ecran qui grise (importe par app.html :
   *   absent d ici = 404 = app morte). Sa seule dependance, keccak.js, est deja servie plus haut. */
  'etat-paires.js',
  /* 2026-10-04 : deployer-blockskins.html proposait AU WALLET CONNECTE le deploiement standalone de BlockSkins v3.
   * 2026-11-12: RETIRED, deliberately NOT served any more (same rule as economie-v2-deploiement.js): BlockSkins.sol is now a router
   *   game, deployed as step S of the economy pack (deployer-economie-v2.html). The standalone v3 creation frozen in
   *   blockskins-deploiement.js was built from the pre-pack source and must never be offered. blockskins-deploiement.js itself stays
   *   served (above): the app reads the DEPLOYED v2 from its `precedent` until the pack is deployed. */
  /* 2026-10-17 : la page qui propose AU WALLET CONNECTE le deploiement de BlockMissionsV3 et sa donnee figee (preparer-deploiement-missions.mjs).
   *   Elle ne signe rien ; bouton eteint tant que les 4 adresses de Phil (reserve, verifier, guardian, rail) manquent. noindex, aucun lien. */
  'deployer-missions.html',
  'missions-deploiement.js',
  /* 2026-10-17 soir : la route FIXE du rail et l encodeur des arguments de MissionsDeployer (la page recalcule la donnee avec) */
  'missions-rail.js',
  /* 2026-10-17 soir : Face of the Day (l app score ton ticket contre la face revelee par le bloc E) */
  'face-du-jour.js',
  /* 2026-10-23 DENIM : le temps de bloc mesure (pur), importe par app.html : absent d ici = 404 = page morte */
  'temps-de-bloc.js',
  /* 2026-10-17 soir : le tableau des missions construit le claim (planReclamer) dans le navigateur */
  'missions-plan.js',
  /* 2026-10-18 : BlockRolls — la page qui propose AU WALLET CONNECTE le deploiement (noindex, aucun lien), sa fiche figee, l encodeur pur de la
   *   config (la page recalcule et refuse une fiche alteree), les appels non signes (roll / pass / settle) et le pont app <-> contrat.
   *   ⛔ absent d ici = 404 = page morte (lecon integrer-sans-serie-complete, 11/10). */
  'deployer-blockrolls.html', 'blockrolls-deploiement.js', 'blockrolls-config.js', 'blockrolls-plan.js', 'rolls-jeu.js', 'rolls-en-attente.js',
  /* 2026-10-24 : les regles VIVANTES de BlockRolls (lues avant chaque signature par app.html, et par frais-risques.js) */
  'rolls-regles.js',
  /* 2026-10-18 : « Let the brain play » — la proposition suivante (pure), importee par app.html : absent d ici = page morte */
  'brain-jeu.js',
  /* 2026-10-18 : le Brain OS — nos lectures (safety, explain, wallet, gas), pur, importe par app.html : absent d ici = 404 = page morte */
  'brain-os.js',
  /* 2026-10-18 : les duels (encodeurs purs + lecteurs d evenements), importes par app.html et brain-jeu.js : absent d ici = page morte */
  'duels-plan-app.js',
  /* 2026-10-18 : TicketPot (pot du jour en parts egales) — page de deploiement (noindex, aucun lien), fiche, encodeur, appels non signes */
  'deployer-ticketpot.html', 'ticketpot-deploiement.js', 'ticketpot-config.js', 'ticketpot-plan.js',
  /* 2026-10-18 : la page du VERIFIER (Phil signe les parts lui-meme, eth_signTypedData_v4) — noindex, aucun lien depuis l app */
  'attester-ticketpot.html',
  /* 2026-10-18 : BlockDuels (duels entre deux wallets, 90 / 7 / 3) — page de deploiement (noindex, aucun lien), fiche, encodeur, appels non
   *   signes (duels-plan.js importe blockrolls-plan.js, deja servi). ⛔ absent d ici = 404 = page morte. */
  'deployer-duels.html', 'duels-deploiement.js', 'duels-config.js', 'duels-plan.js',
  /* 2026-10-24 : BlockDuelsV2 — page de deploiement (noindex, aucun lien), fiche, verification, et le module de plan v2 importe par app.html
   *   et brain-jeu.js (il importe temps-de-bloc.js, deja servi). ⛔ absent d ici = 404 = page morte. */
  'deployer-duels-v2.html', 'duels-v2-deploiement.js', 'duels-v2-config.js', 'duels-v2-plan.js',
  /* 2026-10-24 (revue v2, LOW n°3) : UNE creation au plus, importe par les trois pages de deploiement (duels v1, duels v2, slots) */
  'envoi-creation.js',
  /* 2026-10-23 (Phil) : BlockSlots (3 faces de bloc, points, prix fixes) — page de deploiement (noindex, aucun lien), fiche, encodeur,
   *   appels non signes ; slots-plan.js est importe par app.html. ⛔ absent d ici = 404 = page morte. */
  'deployer-slots.html', 'slots-deploiement.js', 'slots-config.js', 'slots-plan.js',
  /* 2026-11-05 : BlockSkinsVoucher (skins Shopify reclames avec un bon) — page de deploiement (noindex, aucun lien) ; Phil y COLLE l adresse
   *   du signataire, son wallet signe et devient owner. Fiche (code sans argument) + verifications pures. ⛔ absent d ici = 404 = page morte. */
  'deployer-voucher.html', 'voucher-deploiement.js', 'voucher-config.js',
  /* 2026-10-24 : les rouleaux de la carte Draws (pur), importes par app.html : absent d ici = 404 = page morte */
  'rouleaux.js',
  /* 2026-10-11 : la page qui propose AU WALLET PROPRIETAIRE setCurrency(action, true) pour les 9 actions choisies par Phil ; noindex,
   *   aucun lien depuis l app, elle relit owner() et currencyAllowed et ne signe rien. */
  'admettre-devises-skins.html',
  /* 2026-10-03 : la pool Aerodrome mesuree des actions tokenisees (importee par app.html) */
  'pools-actions-aerodrome.js',
  /* 2026-11-07 (human-brain branch): the real fly memory circuit (hemibrain v1.2, Janelia, CC BY 4.0) wired to stock prices, read-only */
  'fly-brain.html', 'fly-brain.js', 'fly-brain-circuit.json', 'fly-core.js', 'fly-tx.js', 'fly-wallet.js', 'fly-guard.js', 'fly-seal.js', 'fly-day.js',
  /* 2026-10-03 : les Initialize mesures (OUSD/USDC v4) — aretes de fait de « Pay with » (importe par app.html) */
  'cles-v4-mesurees.js',
  /* 2026-10-03 : les 20 pools v4 USDC des actions tokenisees, logs bruts (importe par cles-v4-mesurees.js) */
  'cles-v4-actions.js',
  /* 2026-10-03 (Phil) : ce que les assistants IA lisent du site — faits verifiables seulement, fondateur nomme et lie */
  'llms.txt',
  /* ⛔⛔ `franchissement-depuis-chemin.js` decide la FORME d un passage a deux mondes : exactement
   *   uniswap-v4 PUIS un seul saut aerodrome. Pas « au moins deux », pas « dans n importe quel
   *   ordre » — une forme differente produirait un lot dont les approbations sont dans le mauvais
   *   ordre, et ca reverte APRES la signature, donc aux frais de l acheteur. C est le chemin des
   *   actions tokenisees, celles qui portent 96,4 % du volume. Servi avant d etre importe.
   *   43 assertions, 9/9 mutations attrapees. */
  'franchissement-depuis-chemin.js',
  /* ⛔⛔ `plan-franchissement.js` ORCHESTRE le passage complet : resoudre la pool Aerodrome (les
   *   NEUF espacements declares, jamais une valeur supposee), batir la jambe 1 en V4 avec le bareme
   *   degressif, deriver le minimum de la jambe 2 du prix spot, et assembler le lot. Il LIT, mais il
   *   ne decide rien seul : la forme, la jambe 1 et le lot viennent des modules dedies. `rpc` lui
   *   est injecte, donc il est testable hors reseau — ce qui manquait au chemin ou l audit adverse
   *   a trouve deux defauts « gravite argent ». 25 assertions, et l EXECUTION est prouvee par
   *   `banc-franchissement-ousd-action-fork.mjs` (3 appels status 0x1, a6cf paye sur les DEUX
   *   jambes au wei). */
  'plan-franchissement.js',
  /* 2026-10-26 : l aiguillage « comment une entree paie un block » (route 1 de rails-api.js), charge par « Pay with » */
  'entree-vers-bloc.js',
  /* ⛔⛔ `plan-aerodrome-segment.js` : un segment Aerodrome de bout en bout, en UNE transaction.
   *   Mesure du 2026-10-01 : depuis USDC, 236/245 marches etaient offerts mais seulement 23,1 % du
   *   VOLUME — les neuf manquants (AAPLc, METAc, GOOGLc...) portaient 76,9 %. 40 assertions,
   *   10/10 mutations attrapees. */
  'plan-aerodrome-segment.js',
  /* ⛔⛔ `porte-achat.js` DECIDE QUI A UNE PUCE D ACHAT, et il est importe PAR LE SERVEUR AUSSI
   *     (`faitsDeLaPool` reutilise son `glissementBps` plutot que d en recopier un second). Deux
   *     implementations du meme calcul divergeraient, et c est le client qui ouvre la porte.
   *   ⛔ L oublier ici rendrait la page MORTE : la garde de liste blanche l a deja crie deux fois
   *     avant un deploiement, et c est elle qui compte, pas ma relecture. */
  'porte-achat.js',
  /* ⛔ `echelle-marche.js` : le total des marches suivis ET la phrase qui dit a qui il est. L oublier
   *   ici rendrait la page MORTE — c est la garde ci-dessous qui l a crie la derniere fois. */
  'echelle-marche.js',
  /* ⛔ Les trois modules du chemin USDC -> block. Les oublier ici rendrait la page MORTE : c est la
   *   garde de liste blanche qui l a deja crie deux fois avant un deploiement. */
  /* ⛔ calldata-aerodrome.js a rejoint cette liste le 2026-09-28 : il etait deliberement NON servi
   *   tant qu il n etait pas branche, et c est la garde de graphe (test-imports-servis) qui a crie
   *   des que plan-usdc-block.js et echange-v3.js ont commence a l importer. Sans elle, la page
   *   serait MORTE en prod sur un import 404.
   * ⛔⛔ ET CE COMMENTAIRE A ETE REPARE POUR LA TROISIEME FOIS AUJOURD HUI : je l ai injecte par une
   *     chaine shell, bash a interprete les accents graves comme une substitution de commande
   *     (« calldata-aerodrome.js: command not found ») et a mange le debut de la phrase. Trois fois
   *     le meme motif, dans la meme session, en connaissant la regle. Les accents graves sont
   *     desormais retires de ce commentaire : le pire des deux serait qu ils reviennent. */
  /* ⛔ Les six modules du chemin d achat. La garde de liste blanche a crie TROIS fois avant un
   *   deploiement depuis qu ils existent — chaque fois qu un nouveau maillon est arrive. C est
   *   exactement son travail : un import 404 ne degrade pas la page, il tue le module ENTIER. */
  'echange-v3.js', 'plan-usdc-block.js', 'calldata-v3.js', 'calldata-aerodrome.js',
  'echange-eth.js', 'plan-eth-block.js',
  /* ⛔ 2026-10-11 : les approbations au MONTANT EXACT (decision de Phil), importees par echange.js et echange-v3.js. Oubliees ici, la
   *   page locale etait MORTE (import 404 : aucun bouton, carte vide) - vu au navigateur, et la garde test-imports-servis l a crie. */
  'approbations-exactes.js',
  'rolls-en-action.js', /* 2026-10-18 : un roll paye en action tokenisee (vente Aerodrome + approve EXACT + roll, un lot) et le gain converti en action */
  'misables.js', /* 2026-10-24 : payer un jeu avec un autre jeton (swap exact-output USDC + les appels du jeu inchanges) et la regle « misable » */
  'payer-unit.js', /* 2026-10-28 : payer un jeu avec UNIT (UNIT -> ETH sur la pool UNIT, puis le chemin ETH natif), juge a la taille reelle */
  'payer-arret.js', /* 2026-10-24 (revue adverse D1/D2) : un paiement en jeton arrete en route — la phrase par etape et les approbations a remettre a 0 */
  'reponse-spin.js', /* 2026-10-24 (Phil : « un seul jeu au centre, une reponse ») : le panneau de reponse du Spin, pur */
  /* 2026-10-04 : le mode essai. `mode-essai.js` est importe par app.html (absent d ici = 404 = app morte) : il ne fait que
   *   DECIDER, et il decide non hors de localhost. `wallet-simule.js` n est charge par la page (`import()`) qu en mode essai :
   *   il est nomme ici pour que la garde des imports le suive, mais il n entre dans le cache — donc il n est SERVI — que si CE
   *   serveur est lui-meme en mode essai (`SERVIS_EN_ESSAI_SEULEMENT`, juste dessous). En production : 404. */
  'mode-essai.js', 'wallet-simule.js',
  /* 2026-10-31 (TAM phase C) : l onglet TAM (tam-onglet.js, importe a l ouverture de l onglet) et sa chaine : le moteur (phase A), la vue pure,
   *   le plan du mint, la fiche de deploiement de TamArt (phase B ; adresse null tant que Phil n a pas signe). */
  'tam-onglet.js', 'tam-vue.js', 'tam-moteur.js', 'tam-plan.js', 'tamart-deploiement.js',
  /* game76 : les sciences en direct de l onglet TAM (vue seule, pas de mint : TamArt v1 n accepte que les familles 1..16) */
  'tam-physique.js', 'tam-sciences.js', 'tam-fluides.js', 'tam-science.js',
  /* game78 : astres, cosmos, phenomenes « invisibles », quantique */
  'tam-astro.js', 'tam-cosmos.js', 'tam-invisible.js', 'tam-quantique.js',
  /* game79 : la fusion IMRPhenomB, et « Your formula » */
  'tam-fusion.js', 'tam-formule.js',
  /* game80 : les legendes (« What you are seeing ») */
  'tam-legendes.js',
  'tam-grandes-questions.js', 'tam-grandes-questions-2.js',
  /* game81 : champs quantiques, atomes, quarks */
  'tam-champs-quantiques.js',
  /* game82 : les elements de contexte (Soleil, horizons, couches de la Terre…) */
  'tam-decor.js',
  /* game88 : les principes du vide quantique (vide comprime, Casimir dynamique, Higgs, emission spontanee) */
  'tam-vide-quantique.js',
  /* game93 : six theories classiques (Ising, Lotka-Volterra, SIR, lentille, Kuramoto, Gibbs) */
  'tam-theories-2.js',
  /* game96 : Rutherford, logistique, chaleur, oscillateur force, brachistochrone, Galton */
  'tam-theories-3.js',
  /* game111 : sciences de la vie (ADN, ARN, genes) */
  'tam-biologie.js',
  /* game113 : chimie */
  'tam-chimie.js',
  /* game115 : mathematiques */
  'tam-maths.js',
  /* game315: the human brain numbers shared by tam-maths.js, tam-legendes.js and human-brain.html */
  'human-brain-data.js', 'human-brain-anatomy.js', 'human-brain.html', 'human-brain.js', 'human-brain-parts.js',
  /* game320: TBLOCK proof of hold (the page only; tblock-hold.js runs on the server) */
  'holders.html',
  /* game324: the unsigned deployment of the TBLOCK buyback contract (generated) and the page that offers it to the connected wallet */
  'deployer-tblock-buyback.html', 'tblock-buyback-deploiement.js',
  /* 2026-11-12: the TBLOCK buyback that pays the holders vault: its unsigned deployment (generated), the pure module that checks and judges
   *   it, and the page that offers its ONE signature (buyback-vault.js imports keccak.js, pack-economie-v2.js and the two pack records) */
  'deployer-tblock-buyback-vault.html', 'tblock-buyback-vault-deploiement.js', 'buyback-vault.js',
  /* game325: the unsigned deployment of the block contest (generated) and its page */
  'deployer-block-contest.html', 'block-contest-deploiement.js',
  /* the block contest page for users (reads Base, builds unsigned calls for the wallet of the user) and its pure module */
  'contest.html', 'block-contest.js',
  /* game386 task B: the pure side of the contest page (the pool key of a block read on the contest contract, the simulation from the wallet, the words) */
  'contest-vue.js',
  /* holders economy: the +1 burn and the holders vault, their page module, the unsigned deployment (generated) and its page.
   * 2026-11-12: deployer-economie-v2.html is the six-step pack (economie-v2-pack-deploiement.js + pack-economie-v2.js); the stale
   * two-signature record economie-v2-deploiement.js is deliberately NOT served any more, so no page can offer it. */
  'economie.js', 'economie-deploiement.js', 'deployer-economie.html', 'create-vault-tip.js', 'relais-rpc.js', 'etat-naissance.js', 'coffre-paye.js', 'carte-naissance.js', 'coeurs-vue.js', 'coeurs-fil.js', 'lock.js', 'lock-deploiement.js', 'deployer-lock.html', 'deployer-economie-v2.html', 'economie-v2-pack-deploiement.js', 'pack-economie-v2.js', 'points-vue.js', 'points.js',
  /* 2026-11-12: the economy pack is live: its deployment record (generated from the six receipts) and the page module that reads it */
  'economie-v2-pack-deploye.js', 'economie-pack.js',
  /* 2026-11-12 (Phil): the 1 USDC Skins and the Spin whose dev share goes through the router — the deploy page (noindex, no link), its
   *   record (generated, adresse null until noted), the pure module (record -> transactions, checks, what the app may follow), and the
   *   served-Spin choice imported by the fees page. ⛔ absent here = 404 = a dead page */
  'deployer-skins-spin.html', 'skins-spin-deploiement.js', 'skins-spin.js', 'spin-actif.js',
  /* 2026-11-12: the last step of the pack page, the hook payee moves its creator fee slot to the lock rewards (payee-slot.js) */
  'payee-slot.js',
  /* 2026-11-12: the pack page shows the six deployed steps without a wallet (record judged, code read on Base) */
  'pack-deployed-view.js',
  /* 2026-11-12: one plain TBLOCK transfer to the holders vault, as an advance on the first vault rescue (simulated, receipt checked) */
  'advance-vault.html',
  /* 2026-11-12 (game378): the creator gives up the admin role of a block (grant 0x…dEaD, then renounce): the page and its pure module */
  'renounce-admin.html', 'renounce-admin.js',
  /* 2026-11-12: move every TBLOCK of the first holders vault (and of the TBLOCK buyback that pays into it) to the holders vault:
   * the page and its pure module (reads Base, builds unsigned calls for the dev wallet, checks each receipt) */
  'move-first-vault.html', 'move-first-vault.js',
  /* 2026-11-12 (game377): the pure lines of the "Your wallet" card on holders.html (the lock for hearts and the vault, the wallet for the channel) */
  'holders-wallet.js',
  /* lot 378 task 6: the Holders cards drawn (bars, steps, gauge, timeline), imported by app.html */
  'holders-vue.js',
  /* game386: the claim page of a wallet (weeks of the holders vault, months of the lock rewards, the rules in words) and its pure module */
  'claim.html', 'claim-vue.js',
  /* review of game386: the ERC-4337 EntryPoints (one list for revenu-externe.js and claim-vue.js), imported by claim-vue.js */
  'entry-points.js',
  /* game120 : ondes, lumiere et son */
  'tam-ondes.js',
  /* game122 : electricite */
  'tam-electricite.js',
  /* game123 : mecanique */
  'tam-mecanique.js',
  /* game94 : les noms et cles des mesures en anglais */
  'tam-cles-en.js',
  'abi.json', 'known-bad.json', 'A-SIGNER-mainnet.json', 'brain-agent.json',
  'icon.png', 'splash.png', 'embed.png',
];

/* ⛔ L APP NEUVE EST LA RACINE. L ancien ecran reste atteignable a son nom, mais ce n est plus lui
 * qu on montre en premier — c est la decision produit du 2026-09-10. */
const RACINE = 'app.html';

/* ETag calcule au demarrage : les fichiers ne changent pas pendant la vie du processus, et un
 * recalcul par requete ferait lire le disque pour rien. */
const cache = new Map();
/* ⛔ Le wallet simule n existe pas pour un serveur hors mode essai : ni servi, ni compte dans `servis`. */
const SERVIS_EN_ESSAI_SEULEMENT = ['wallet-simule.js'];

/* ══ LES JETONS MISABLES (2026-10-24) — /api/misables ══════════════════════════════════════════════════════════════════════════════
 * Chaque candidat de misables.js (les pools CL d actions du registre + les pools WETH/USDC de la factory de notre routeur) cote en
 * EXACT-OUTPUT 0,50 / 5 / 10 USDC, toute la liste AU MEME BLOC ; la regle (ecart <= 1 % frais compris, profondeur >= 10 000 USDC, route
 * executable par nous, cout contre la pool de reference du Market) decide ligne par ligne. LECTURE SEULE (eth_call par rpcRails).
 * ⛔ BORNE : au plus MISABLES_APPELS_MAX appels de chaine par rafraichissement, 3 candidats en vol, un rafraichissement a la fois, 60 s de
 *   cache ; une liste plus vieille que 10 min n est plus servie (ok:false, etat PERIME) — la mise elle-meme re-cote toujours. */
const MISABLES_TTL_MS = 60_000, MISABLES_PERIME_MS = 600_000, MISABLES_EN_VOL = 3;
/* 2026-10-25 : + MISABLES_RELECTURES candidats relus un a un (un refus de debit n est pas une mesure) ; le plafond les compte */
const MISABLES_RELECTURES = 8, MISABLES_RELECTURE_PAUSE_MS = 1000;
const MISABLES_APPELS_MAX = 1 + (CANDIDATS_MISABLES.length + MISABLES_RELECTURES) * (TAILLES_MISABLES.length + 4) + UNIT_APPELS_MAX(TAILLES_MISABLES.length);
const misablesCache = { corps: null, a: 0, enVol: null };
/** la pool de reference de chaque jeton : celle que le Market (trending) montre pour lui, si elle est cotee en USDC (pas de lecture ici) */
function referencesMisables() {
  const refs = new Map();
  try {
    const t = trCache.corps ? JSON.parse(trCache.corps) : null;
    for (const l of (t && Array.isArray(t.lignes) ? t.lignes : [])) {
      const adr = String(l.adr || '').toLowerCase(), pool = String(l.poolAdr || '').toLowerCase();
      if (/^0x[0-9a-f]{40}$/.test(adr) && /^0x[0-9a-f]{40}$/.test(pool) && String(l.quoteAdr || '').toLowerCase() === USDC_MISABLES) refs.set(adr, { pool });
    }
  } catch (_) { /* pas de Market lu : pas de reference, et chaque ligne le dit (ecartReferenceBps null) */ }
  return refs;
}
async function lireMisablesSrv() {
  let appels = 0;
  const rpc = (m, p) => { appels += 1; if (appels > MISABLES_APPELS_MAX) return Promise.reject(new Error('call budget of this refresh spent')); return rpcRails(m, p); };
  const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
  if (!Number.isSafeInteger(bloc)) throw new Error('head block unread');
  const refs = referencesMisables();
  const lignes = new Array(CANDIDATS_MISABLES.length);
  let i = 0;
  const ouvrier = async () => {
    while (i < CANDIDATS_MISABLES.length) {
      const k = i++; const c = CANDIDATS_MISABLES[k];
      const cot = await coterMisableTailles({ rpc, candidat: c, sorties: TAILLES_MISABLES, reference: refs.get(c.jeton) || null, bloc }).catch((e) => ({ etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 100) }));
      lignes[k] = ligneMisable(c, cot);
    }
  };
  await Promise.all(Array.from({ length: MISABLES_EN_VOL }, ouvrier));
  /* 2026-10-25 (prod, bloc 53 065 453) : SANc et SONYc, misables par la regle, servis NON_MESURE « rate limit » de publicnode — absents
   *   du menu de paiement sous ok:true LU. Un refus de debit n est PAS une mesure : chaque candidat non lu (etat ou reference du Market)
   *   est RELU, UN a la fois apres une pause, AU MEME BLOC, au plus MISABLES_RELECTURES ; ce qui reste non lu est NOMME (nonMesures). */
  const aRelire = [];
  for (let k = 0; k < CANDIDATS_MISABLES.length; k += 1) {
    const l = lignes[k];
    if (l && l.tailles.some((t) => t.code === 'NON_MESURE' || t.code === 'REFERENCE_NON_LUE')) aRelire.push(k);
  }
  for (const k of aRelire.slice(0, MISABLES_RELECTURES)) {
    await new Promise((ok) => setTimeout(ok, MISABLES_RELECTURE_PAUSE_MS));
    const c = CANDIDATS_MISABLES[k];
    const cot = await coterMisableTailles({ rpc, candidat: c, sorties: TAILLES_MISABLES, reference: refs.get(c.jeton) || null, bloc }).catch((e) => ({ etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 100) }));
    lignes[k] = ligneMisable(c, cot);
  }
  /* 2026-10-28 : la ligne UNIT, AU MEME BLOC, de la meme forme ; triee par listeMisables comme les autres (jamais epinglee) */
  const cotUnit = await coterUnitTailles({ rpc, sorties: TAILLES_MISABLES, bloc }).catch((e) => ({ etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 100) }));
  lignes.push(ligneUnit(cotUnit));
  const liste = listeMisables(lignes);
  const nonMesures = liste.filter((l) => l.tailles.some((t) => t.code === 'NON_MESURE' || t.code === 'REFERENCE_NON_LUE')).map((l) => l.symbole);
  const j = (o) => JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
  return j({ ok: true, etat: 'LU', lu: new Date().toISOString(), bloc, appelsRpc: appels, appelsMax: MISABLES_APPELS_MAX, relus: Math.min(aRelire.length, MISABLES_RELECTURES), nonMesures,
    regle: { seuilEcartBps: SEUIL_MISABLE_BPS, profondeurMinUsdc: String(PROFONDEUR_MISABLE), devisBlocsMax: DEVIS_MISABLE_BLOCS, taillesUsdc: TAILLES_MISABLES.map(String),
      route: 'aerodrome-cl (factory of our Aerodrome router)', mesure: MESURE_MISABLES.fichier, mesureBloc: MESURE_MISABLES.bloc,
      borne: 'A listed price is a snapshot: every bet re-quotes at the block it is built and refuses a quote older than ' + DEVIS_MISABLE_BLOCS + ' blocks.' },
    misables: liste.filter((l) => l.misable).map((l) => l.jeton), lignes: liste });
}
function misables() {
  const age = Date.now() - misablesCache.a;
  if (misablesCache.corps && age < MISABLES_TTL_MS) return Promise.resolve(misablesCache.corps);
  if (!misablesCache.enVol) {
    misablesCache.enVol = lireMisablesSrv().then((c) => { misablesCache.corps = c; misablesCache.a = Date.now(); return c; })
      .catch((e) => ({ erreur: String((e && e.message) || e).slice(0, 120) }))
      .finally(() => { misablesCache.enVol = null; });
  }
  /* un cache encore frais (< 10 min) sert pendant le rafraichissement ; sinon on attend la lecture */
  if (misablesCache.corps && age < MISABLES_PERIME_MS) return Promise.resolve(misablesCache.corps);
  return misablesCache.enVol.then((r) => (typeof r === 'string' ? r : JSON.stringify({ ok: false, etat: misablesCache.corps ? 'PERIME' : 'NON_LU', pourquoi: r.erreur, misables: [], lignes: [] })));
}
for (const nom of SERVIS) {
  if (SERVIS_EN_ESSAI_SEULEMENT.includes(nom) && !ESSAI_SRV.actif) continue;
  const chemin = join(ici, nom);
  if (!existsSync(chemin)) {
    /* ⛔ ON LE DIT AU DEMARRAGE, PAS EN 404 SILENCIEUX A MINUIT. Un fichier declare et absent est un
     * defaut de deploiement, et il doit se voir dans les journaux tout de suite. */
    console.warn('[servi] DECLARE MAIS ABSENT : ' + nom);
    continue;
  }
  const corps = readFileSync(chemin);
  const image = nom.endsWith('.png');
  /* ⛔ ON PRE-COMPRESSE UNE FOIS, AU DEMARRAGE. Les fichiers ne changent pas pendant la vie du
   *    processus — c est deja l hypothese du cache juste au-dessus — donc gzipper a chaque requete
   *    brulerait du CPU pour un resultat identique.
   * ⛔ PAS LES IMAGES : un PNG est deja compresse. Le regzipper coute du temps et rend parfois un
   *    fichier PLUS GROS, donc la condition est explicite au lieu d etre devinee.
   * ⛔ ET ON GARDE LE GZIP SEULEMENT S IL EST PLUS PETIT. Sur un fichier minuscule, l en-tete gzip
   *    depasse le gain : servir une version plus lourde en croyant optimiser serait le defaut
   *    inverse, et il passerait inapercu. */
  const gz = image ? null : gzipSync(corps, { level: 9 });
  cache.set('/' + nom, {
    corps,
    gz: gz && gz.length < corps.length ? gz : null,
    type: TYPES[nom.slice(nom.lastIndexOf('.'))] || 'application/octet-stream',
    etag: '"' + createHash('sha256').update(corps).digest('hex').slice(0, 24) + '"',
    image,
  });
}

/* 2026-11-08: @noble/curves + @noble/hashes for the fly's in-browser wallet, served ONLY if each file's sha256 matches
 *   lib/noble/manifeste.json (the bytes of the npm tarballs, sha512-checked when vendored). A mismatch is logged and that file is not
 *   served: the fly's wallet then fails to load and says so, nothing else stops. Only the manifest's own paths, no directory walk. */
const nobleRefuses = [];
try {
  const man = JSON.parse(readFileSync(join(ici, 'lib', 'noble', 'manifeste.json'), 'utf8')).fichiers || {};
  for (const [p, h] of Object.entries(man)) {
    if (!/^lib\/noble\/(curves|hashes)\/[A-Za-z0-9_/-]+\.js$/.test(p) || p.includes('..')) { nobleRefuses.push(p + ' (path)'); continue; }
    const corps = readFileSync(join(ici, p));
    if (createHash('sha256').update(corps).digest('hex') !== h) { nobleRefuses.push(p + ' (sha256)'); continue; }
    const gz = gzipSync(corps, { level: 9 });
    cache.set('/' + p, { corps, gz: gz.length < corps.length ? gz : null, type: TYPES['.js'], etag: '"' + h.slice(0, 24) + '"', image: false });
  }
} catch (e) { nobleRefuses.push('manifest unreadable: ' + String(e.message).slice(0, 80)); }
if (nobleRefuses.length) console.error('[servi] ⛔ lib/noble NOT served: ' + nobleRefuses.join(', '));
/* 2026-11-08 (security review H2): the fly page holds a wallet key in this origin's storage. A strict CSP: scripts only from this
 *   site plus its ONE inline import map, pinned by its own sha256 (computed here from the served bytes, never typed); no frames, no
 *   plugins, network only to this site. A changed import map without a new hash is simply blocked: fail-closed. */
{
  const fb = cache.get('/fly-brain.html');
  const im = fb && /<script type="importmap">([\s\S]*?)<\/script>/.exec(fb.corps.toString('utf8'));
  if (fb) fb.csp = "default-src 'self'; script-src 'self'" + (im ? " 'sha256-" + createHash('sha256').update(im[1], 'utf8').digest('base64') + "'" : '')
    + "; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
}

/** Le build du fichier SERVI, lu dans son `data-build` — jamais une constante tapee a cote. */
function buildServi() {
  const e = cache.get('/' + RACINE);
  if (!e) return null;
  /* tip 20260922-eth-fixe: allow named tips e.g. 20260922-eth-fixe (not only digits). */
  /* ⛔⛔ 2026-10-04 (mesure prod, build panneau-pop-up-cerveau) : /sante rendait `build: null`. La lecture s arretait aux 200 000
   *   premiers caracteres, et le tampon etait passe au-dela (le panneau a ajoute des styles et du HTML AVANT lui). Un deploiement
   *   reussi devenait invisible : la boucle d attente ne voyait jamais son build et relancait l envoi. On lit TOUT le fichier, une
   *   fois par version servie (memo sur l entree du cache). */
  if (e.buildLu === undefined || e.buildLuSur !== e.corps) {
    const m = /data-build="([0-9A-Za-z_-]{6,40})"/.exec(e.corps.toString('utf8'));
    e.buildLu = m ? m[1] : null; e.buildLuSur = e.corps;
  }
  return e.buildLu;
}

/* ⛔⛔ INCIDENT 2026-09-17 : un deploiement fait hors git servait app.html SANS map3d.js / openlaunch.js /
 * openlaunch-launch.js (absents de SERVIS) -> 404 -> le module de l app ne se chargeait plus, map vide,
 * mais la page repondait 200 et /sante disait ok. Desormais on relit les imports de app.html au demarrage :
 * tout module importe et non servi est journalise ET fait repondre /sante ok:false avec la liste. */
const modulesManquants = [];
try {
  const html = readFileSync(join(ici, RACINE), 'utf8');
  for (const m of html.matchAll(/from\s+'\.\/([A-Za-z0-9_-]+\.m?js)'/g)) {
    if (!cache.has('/' + m[1]) && !modulesManquants.includes(m[1])) modulesManquants.push(m[1]);
  }
} catch (e) {
  modulesManquants.push('app.html illisible : ' + e.message);
}
if (modulesManquants.length) console.error('[servi] ⛔ MODULES IMPORTES MAIS NON SERVIS (app cassee) : ' + modulesManquants.join(', '));

/* ⛔⛔ XMTP VENDORISE, VERIFIE AU DEMARRAGE, FICHIER PAR FICHIER. Les fichiers viennent du CDN via
 * `vendor-xmtp.mjs` (lance avant ce serveur) ; ICI on recalcule chaque sha256 et on refuse de servir
 * tout fichier dont l empreinte differe du manifeste. Un seul fichier suspect n eteint pas l app :
 * seule la messagerie privee s arrete, et le journal le dit.
 * ⛔ UNIQUEMENT LES CHEMINS DU MANIFESTE, sous /npm/, sans `..` : pas de parcours de dossier. */
let xmtpServis = 0, xmtpRefuses = 0;
try {
  const manifeste = JSON.parse(readFileSync(join(ici, 'xmtp-manifeste.json'), 'utf8'));
  for (const [servi, attendu] of Object.entries(manifeste.fichiers || {})) {
    if (!servi.startsWith('/npm/') || servi.includes('..')) { xmtpRefuses++; continue; }
    const chemin = join(ici, 'vendor', ...servi.split('/').filter(Boolean));
    if (!existsSync(chemin)) { xmtpRefuses++; continue; }
    const corps = readFileSync(chemin);
    const empreinte = createHash('sha256').update(corps).digest('hex');
    if (empreinte !== attendu.sha256) {
      console.warn('[xmtp] EMPREINTE DIFFERENTE, non servi : ' + servi);
      xmtpRefuses++;
      continue;
    }
    cache.set(servi, {
      corps,
      type: servi.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8',
      etag: '"' + empreinte.slice(0, 24) + '"',
      image: false,
      /* ⛔⛔ VENDOR EPINGLE PAR VERSION : ces fichiers sont servis depuis `/npm/<paquet>@<version>/`
       *     et leur empreinte vient d etre verifiee juste au-dessus, fail-closed. Un cache ne peut
       *     donc pas servir autre chose que ce qu on a controle, et un changement de version change
       *     l URL. Sans ce drapeau, le SDK Base Account (822 ko) se retelechargeait a CHAQUE visite
       *     sans wallet depuis que je l ai prechauffe — une dette que j ai creee moi-meme.
       *   ⛔⛔ ET MON PREMIER MOTIF NE MATCHAIT RIEN, PARCE QUE LE PAQUET EST SCOPE. Le chemin reel
       *     est `/npm/@base-org/account@2.5.13/dist/…` : le premier segment est `@base-org`, SANS
       *     version, et la version est sur le SECOND. Un motif `[^/]+@[^/]+/` juste apres `/npm/`
       *     echouait donc, `vendorEpingle` valait faux, et tout ce correctif etait un no-op muet.
       *     Le scope est maintenant optionnel, et la version doit commencer par un CHIFFRE — sinon
       *     `@base-org/account` sans version passerait pour epingle.
       *   ⛔ VERIFIE SUR SEPT CHEMINS, DONT QUATRE NEGATIFS (`/npm/…` sans version, `/app.html`,
       *     `/routage.js`) : sans temoin negatif, un motif trop large mettrait NOS modules en cache
       *     d un an, et on reservirait du code mort pendant des mois. */
      vendorEpingle: /^\/npm\/(?:@[^/]+\/)?[^/]+@\d[^/]*\//.test(servi),
    });
    xmtpServis++;
  }
} catch (e) {
  console.warn('[xmtp] manifeste illisible — messagerie privee indisponible : ' + e.message);
}
console.log('[xmtp] ' + xmtpServis + ' fichier(s) servis, ' + xmtpRefuses + ' refuse(s)');

/* ══ APERCU D UN LIEN DE BLOCK (2026-09-19) ═══════════════════════════════════════════════════════════════════════
 * Les createurs arrivent par les liens partages (X, Farcaster). /?block=0x… rend la meme page, mais le bloc
 * <!--og:debut-->…<!--og:fin--> dit le SYMBOLE du block et montre SA face gravee (/face/0x….png) — sinon l image
 * generique : jamais une face inventee. Lecture seule, bornee a 2,5 s (un robot d apercu n attend pas), cachee. */
const apercusBlocs = new Map();
/* 2026-10-10 : /api/prix-usd fusionne les requetes identiques en vol (une promesse par adresse, retiree a la reponse) */
const prixUsdEnVol = new Map();
let prixUsdFusions = 0;
const prixUsdCache = new Map();
const htmlAttr = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function apercuBlock(adr) {
  const a = adr.toLowerCase();
  if (apercusBlocs.has(a)) return apercusBlocs.get(a);
  const borne = (p) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(null), 2500))]);
  const [f, symHex] = await Promise.all([
    borne(resoudreFace(a).catch(() => null)),
    borne(rpcServeur('eth_call', [{ to: a, data: '0x95d89b41' }, 'latest']).catch(() => null)),
  ]);
  let sym = '';
  try { const b = String(symHex || '').slice(2); const n = parseInt(b.slice(64, 128), 16); sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').trim().slice(0, 12); } catch (_) { sym = ''; }
  const U = 'https://tokenizedblock.space';
  const aFace = !!(f && f.etat === 'LU' && f.face);
  const img = aFace ? U + '/face/' + a + '.png' : U + '/embed.png';
  const nom = sym ? '$' + sym : 'This block';
  const titre = nom + ' is alive on TokenizedBlock';
  const desc = 'See it on the living map. Make your own: ≈ $1, once — born with its face and brain, market open.';
  const url = U + '/?block=' + a;
  const mini = JSON.stringify({ version: '1', imageUrl: img, button: { title: ('Open ' + nom).slice(0, 32),
    action: { type: 'launch_miniapp', url, name: 'TokenizedBlock', splashImageUrl: U + '/splash.png', splashBackgroundColor: '#000000' } } });
  const tags = [
    '<link rel="canonical" href="' + htmlAttr(url) + '">',
    '<meta name="description" content="' + htmlAttr(desc) + '">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="TokenizedBlock">',
    '<meta property="og:title" content="' + htmlAttr(titre) + '">',
    '<meta property="og:description" content="' + htmlAttr(desc) + '">',
    '<meta property="og:url" content="' + htmlAttr(url) + '">',
    '<meta property="og:image" content="' + htmlAttr(img) + '">',
    '<meta name="twitter:card" content="' + (aFace ? 'summary' : 'summary_large_image') + '">',
    '<meta name="twitter:title" content="' + htmlAttr(titre) + '">',
    '<meta name="twitter:description" content="' + htmlAttr(desc) + '">',
    '<meta name="twitter:image" content="' + htmlAttr(img) + '">',
    '<meta name="fc:miniapp" content="' + htmlAttr(mini) + '">',
    '<meta name="fc:frame" content="' + htmlAttr(mini) + '">',
  ].join('\n');
  /* on ne cache que ce qui a ete LU : un symbole manque (RPC lent) doit pouvoir etre relu au prochain robot */
  if (sym && f) { apercusBlocs.set(a, tags); if (apercusBlocs.size > 2000) apercusBlocs.delete(apercusBlocs.keys().next().value); }
  return tags;
}

/** ⛔ `gz` dit si on envoie la version compressee. `vary: accept-encoding` est OBLIGATOIRE des
 *  qu une reponse depend de cet en-tete : sans lui, un cache intermediaire pourrait servir un corps
 *  gzip a un client qui ne l a pas demande, et celui-la ne verrait que du binaire. */
const entete = (e, gz = false) => ({
  'content-type': e.type,
  ...(gz ? { 'content-encoding': 'gzip' } : {}),
  vary: 'accept-encoding',
  etag: e.etag,
  /* ⛔ LES IMAGES PEUVENT DORMIR, LE CODE NON. Une icone qui change est un evenement rare ; un
   * module JavaScript qui change est le quotidien de ce projet, et le servir depuis un cache
   * remettrait exactement le probleme qu on vient de fuir.
   * ⛔⛔ SAUF LE VENDOR EPINGLE PAR VERSION, ET C EST UNE DETTE QUE J AI CREEE MOI-MEME LE
   *     2026-09-29. En avançant le chargement du SDK Base Account (822 ko) pour que la fenetre de
   *     connexion s ouvre dans le geste de l utilisateur, j ai transforme un telechargement paye
   *     par UNE personne en un telechargement paye par CHAQUE visiteur sans wallet — et
   *     `no-store` le refaisait a chaque visite.
   *   ⛔ POURQUOI C EST SUR ICI, ET SEULEMENT ICI : l URL contient la version exacte
   *     (`@base-org/account@2.5.13`), donc un cache NE PEUT PAS servir une autre version — un
   *     changement de version change l URL. Et l empreinte de ce bundle est verifiee au demarrage,
   *     fail-closed, avant d etre servi.
   *   ⛔ L EXCEPTION EST BORNEE AU CHEMIN `/npm/` : nos propres modules restent en `no-store`. Les
   *     elargir serait remettre le probleme qu on vient de fuir, sur le code qui change tous les
   *     jours. */
  'cache-control': e.image ? 'public, max-age=86400'
    : (e.vendorEpingle ? 'public, max-age=31536000, immutable' : 'no-store, max-age=0'),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  ...(e.csp ? { 'content-security-policy': e.csp } : {}),
});

/** L etiquette d une requete pour le compteur d archive : la route, adresses et nombres generalises (une cle par ROUTE, pas par
 *  jeton : sinon chaque adresse ferait une ligne et le compteur n en dirait rien). */
function etiquetteRequete(req) {
  const p = String((req && req.url) || '/').split('?')[0].replace(/0x[0-9a-fA-F]{6,}/g, ':adr').replace(/\/\d+(?=\/|$)/g, '/:n');
  return ('route ' + p).slice(0, 60);
}
/* ══ 2026-10-10 — LA FENETRE DEXSCREENER D UN PROFIL EST REGARDEE AVANT D ETRE CHARGEE ══════════════════════════════════════════════
 * Capture de Phil : le cadre « Live pair window on DexScreener » montrait « 503 Service Unavailable — No server is available to handle
 *   this request », la page d erreur BRUTE de leur repartiteur de charge, dans un grand cadre noir. MESURE (10:27 UTC, embed de DJTc) :
 *   1er essai delai depasse (30 s), puis 200 deux fois — une panne PASSAGERE chez DexScreener ; leur API repondait (c est elle qui
 *   donne l URL). Une iframe d un autre domaine ne dit pas son statut : le serveur regarde la page avant que le navigateur la charge.
 *   EN_PANNE = 5xx ou delai depasse -> le navigateur montre une carte claire (« reessayer », « charger quand meme » ; le lien
 *   « Open DexScreener » au-dessus du cadre reste) ;
 *   OK = 2xx ; INCONNU = tout le reste (un 403 de garde anti-robots, un 3xx, un 4xx, le budget de verifications use) -> l iframe
 *   comme avant : on ne cache jamais un graphique qui marche peut-etre (et la carte garde « charger quand meme »).
 * ⛔ ANTI-SSRF : seule https://dexscreener.com/base/<0x + 40 ou 64 hexa>?embed=1 est demandee, SANS suivre de redirection
 *   (redirect: manual) ; le corps n est jamais lu (annule des l en-tete). Cache 60 s par paire, une lecture en vol par paire, et
 *   au plus 30 verifications par minute en tout : la route ne peut pas servir de relais pour marteler DexScreener. */
const ID_PAIRE_DEX = /^0x(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/* revue adverse (2026-10-10, executee) : un seul delai depasse cachait 60 s, pour TOUT le monde, un graphique revenu 1 s plus tard,
 *   et « Try again » relisait le meme cache. Une PANNE ne se garde donc que 15 s, et `frais` (le bouton « Try again ») la relit
 *   tout de suite — toujours dans le budget par minute et une seule lecture en vol par paire. */
const EMBED_DEX_TTL_MS = 60000, EMBED_DEX_TTL_PANNE_MS = 15000, EMBED_DEX_DELAI_MS = 6000, EMBED_DEX_PAR_MINUTE = 30;
const embedDexCache = new Map(), embedDexEnVol = new Map();
const embedDexFenetre = { debut: 0, n: 0 };
function etatEmbedDex(id, frais = false) {
  const c = embedDexCache.get(id);
  const ttl = c && c.r.etat === 'EN_PANNE' ? (frais ? 0 : EMBED_DEX_TTL_PANNE_MS) : EMBED_DEX_TTL_MS;
  if (c && Date.now() - c.t < ttl) return Promise.resolve(c.r);
  if (embedDexEnVol.has(id)) return embedDexEnVol.get(id);
  if (Date.now() - embedDexFenetre.debut > 60000) { embedDexFenetre.debut = Date.now(); embedDexFenetre.n = 0; }
  if (embedDexFenetre.n >= EMBED_DEX_PAR_MINUTE) return Promise.resolve({ ok: true, etat: 'INCONNU', status: null, pourquoi: 'check budget used for this minute' });
  embedDexFenetre.n += 1;
  const p = (async () => {
    let r;
    try {
      const x = await fetch('https://dexscreener.com/base/' + id + '?embed=1', { redirect: 'manual', signal: AbortSignal.timeout(EMBED_DEX_DELAI_MS),
        headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; TokenizedBlock embed check)' } });
      try { await x.body?.cancel(); } catch (_) { /* rien a lire */ }
      const s = x.status;
      r = { ok: true, etat: s >= 200 && s < 300 ? 'OK' : s >= 500 ? 'EN_PANNE' : 'INCONNU', status: s, lu: new Date().toISOString() };
    } catch (e) {
      const delai = /timeout|abort/i.test(String((e && (e.name + ' ' + e.message)) || e));
      r = { ok: true, etat: delai ? 'EN_PANNE' : 'INCONNU', status: null,
        pourquoi: delai ? 'no answer within ' + (EMBED_DEX_DELAI_MS / 1000) + ' s' : 'not reachable from the server', lu: new Date().toISOString() };
    }
    if (embedDexCache.size >= 500) embedDexCache.delete(embedDexCache.keys().next().value);
    embedDexCache.set(id, { t: Date.now(), r });
    return r;
  })().finally(() => embedDexEnVol.delete(id));
  embedDexEnVol.set(id, p);
  return p;
}
function traiterRequete(req, res) {
  /* ⛔ Old Railway host name must never serve content — always send people to MAIN. */
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  if (host === 'tokenized-block-production.up.railway.app') {
    const raw = String(req.url || '/');
    /* droit au nom public (un seul saut, plus deux) ; /face y est servi aussi */
    const dest = 'https://tokenizedblock.space' + (raw.startsWith('/') ? raw : '/' + raw);
    res.writeHead(301, { Location: dest, 'Cache-Control': 'public, max-age=3600' });
    res.end();
    return;
  }

  /* 2026-10-27 : /api/ticketpot-unit/(parts|signature) = la MEME route que /api/ticketpot/* sur le pot UNIT (la route relit req.url : uniteTP) */
  const cheminBrut = String(req.url || '/').split('?')[0];
  const chemin = /^\/api\/ticketpot-unit\/(parts|signature)$/.test(cheminBrut) ? cheminBrut.replace('/api/ticketpot-unit/', '/api/ticketpot/') : cheminBrut;

  /* ⛔⛔ UN SEUL NOM PUBLIC (Phil, 2026-09-19) : tokenizedblock.space. Les PAGES ouvertes sur les anciens noms y sont
   *    renvoyees (301, meme chemin, meme ?block=). Les ressources NE le sont PAS : les images gravees a jamais dans les
   *    blocks pointent vers /face/<adresse>.png sur l ancien nom — elles doivent y repondre pour toujours ; /api et
   *    /sante restent aussi servis la ou on les appelle. */
  {
    const hote = String(req.headers.host || '').toLowerCase().split(':')[0];
    const ANCIENS = ['tokenized-block.up.railway.app', 'tokenized-block.app', 'www.tokenized-block.app', 'www.tokenizedblock.space'];
    const estPage = chemin === '/' || chemin.endsWith('.html');
    if (ANCIENS.includes(hote) && estPage && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(301, { Location: 'https://tokenizedblock.space' + String(req.url || '/'), 'Cache-Control': 'public, max-age=3600' });
      res.end();
      return;
    }
  }

  /* ⛔ 2026-09-14: Instant Create retired — factory createB20 unpaid on MAIN.
   * Hard 301 → /#creer (app.html free factory create; life fee at Launch → a6cf).
   * tip 2349: Create free on MAIN + Practice; fee moment = Launch. */
  if (chemin === '/index.html' || chemin === '/block-0.html') {
    res.writeHead(301, {
      Location: '/#creer',
      'Cache-Control': 'no-store, max-age=0',
    });
    res.end();
    return;
  }

  /* ══ REFERENCEMENT (2026-09-19) : robots + sitemap. Les pages privees (frais, deploy-*) ne sont pas indexees ; les
   *    anciens noms repondent deja en 301 vers tokenizedblock.space (ils transmettent leur referencement). */
  if (chemin === '/robots.txt') {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' });
    res.end(['User-agent: *', 'Allow: /', 'Disallow: /frais.html', 'Disallow: /deploy-v2.html', 'Disallow: /deploy-v3.html', 'Disallow: /deploy-v4.html', 'Disallow: /deploy-v5.html', 'Disallow: /deploy-v6.html', 'Disallow: /deploy-v7.html', 'Disallow: /deploy-v8.html', 'Disallow: /deploy-pot.html', 'Disallow: /pot.html',
      'Disallow: /deployer-tblock-buyback.html', /* 2026-11-11: the retired buyback v1 page stays served, not indexed */
      'Disallow: /deployer-tblock-buyback-vault.html', /* 2026-11-12: a deploy page, served, not indexed */
      'Disallow: /api/', '', 'Sitemap: https://tokenizedblock.space/sitemap.xml', ''].join('\n'));
    return;
  }
  if (chemin === '/sitemap.xml') {
    const jour = new Date().toISOString().slice(0, 10);
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' });
    res.end('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + '  <url><loc>https://tokenizedblock.space/</loc><lastmod>' + jour + '</lastmod><changefreq>hourly</changefreq><priority>1.0</priority></url>\n'
      + '</urlset>\n');
    return;
  }

  /* ══ PRIX EN DOLLARS D UNE DEVISE DE PAIRE (2026-09-19) ═══════════════════════════════════════════════════════════
   * ⛔ BUG MESURE : a la mise en vie, choisir USDC ou une action ne changeait que l exemple ; la valeur restait « 10 » —
   *    un block a 10 USDC (10 $) au lieu de ~26 000 $ en ETH, sans aucun plancher. La valeur par defaut est desormais la
   *    MEME en dollars, convertie avec ce prix. Seulement les devises de la liste V3 ; paire la plus liquide sur Base
   *    (DexScreener), au moins 10 000 $ de liquidite, sinon « non lu ». Cache 5 min. */
  /* ⛔⛔ LES BLOCKS DE N IMPORTE QUI, SANS FENETRE DE 24 HEURES.
   *     Le navigateur cherchait les creations sur 43 200 blocs — EXACTEMENT 24 h a ~2 s le bloc.
   *     Un block cree la veille disparaissait donc de « mes blocks », sur toutes les machines.
   *     Le serveur scanne les creations en continu ; il retient desormais QUI a cree, et repond ici.
   *   ⛔ LA BORNE PART AVEC LA REPONSE, TOUJOURS. `indexeDepuis` dit a partir de quand l index
   *     existe, et `couvertureComplete` dit s il a rattrape le premier block de TBLOCK. Tant que
   *     c est faux, une liste VIDE ne veut PAS dire « tu n as rien cree » — elle veut dire « pas
   *     encore indexe ». Les deux se ressemblent a l ecran et n ont rien a voir.
   *   ⛔ AUCUNE DONNEE PERSONNELLE : on rend des adresses de contrats, jamais un lien vers une
   *     identite. L adresse demandee n est ni journalisee ni conservee. */
  /* ⛔⛔ 2026-10-25 — LA MAP NE RELIT PLUS 43 200 BLOCS DE LA FACTORY DEPUIS LE NAVIGATEUR (mesure, 375 px, 60 s : premiere charge
   *   restante sur mainnet.base.org). Les creations que les scans du serveur ont lues depuis `depuis`, avec les MEMES bornes que
   *   /api/blocks-de : le navigateur ne lit que ce qu elles ne couvrent pas (creations-index.js, creationsDeLaCarte). Au-dela de
   *   CREATIONS_SERVIES_MAX, `tronque: true` et le navigateur relit tout. Lecture seule, aucune donnee personnelle. */
  if (chemin === '/api/creations-recentes') {
    /* ⛔ 2026-10-26 (revue adverse de 8bcd051) : `depuis` absent faisait Number(null) = 0 et servait TOUT. Absent, vide ou pas un
     *   entier decimal = 400, jamais une valeur par defaut. */
    const brutD = new URL(req.url, 'http://x').searchParams.get('depuis');
    const depuis = brutD !== null && /^\d{1,15}$/.test(brutD.trim()) ? Number(brutD.trim()) : null;
    const repondre = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (depuis === null) { repondre({ ok: false, pourquoi: 'depuis=<block number> is required' }, 400); return; }
    const toutes = [];
    for (const [jeton, f] of faitsCreation) if (f.bloc >= depuis) toutes.push({ jeton, bloc: f.bloc, symbole: f.symbole, decimales: f.decimales, nom: f.nom });
    const triees = plusRecentesDabord(toutes);
    repondre({ ok: true, lu: new Date().toISOString(), depuis, ...bornesPubliees(),
      creations: triees.slice(0, CREATIONS_SERVIES_MAX), tronque: triees.length > CREATIONS_SERVIES_MAX, total: triees.length,
      borne: 'Creations read by this server\'s factory scans from block `faitsDepuis` on. Outside `luJusqua`/`couvertDepuis` and inside '
        + '`trousPlages` nothing is claimed: read those ranges yourself.' });
    return;
  }

  if (chemin === '/api/blocks-de') {
    const adr = String(new URL(req.url, 'http://x').searchParams.get('adr') || '').toLowerCase();
    const repondre = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!/^0x[0-9a-f]{40}$/.test(adr)) { repondre({ ok: false, pourquoi: 'an address is required' }); return; }
    const blocks = [];
    for (const [jeton, createur] of createurParBlock) if (createur === adr) blocks.push(jeton);
    repondre({
      ok: true,
      lu: new Date().toISOString(),
      blocks,
      /* ⛔ CE QUE L INDEX SAIT, ET CE QU IL NE SAIT PAS — les deux, sinon le vide ment. */
      blocksIndexes: createurParBlock.size,
      blocksSuivis: blocksConnus.size,
      /* ⛔⛔ LA COUVERTURE EST CALCULEE, PAS ECRITE EN DUR. Un `false` constant serait un aveu
       *     permanent qui cesserait d informer ; un `true` en dur serait un mensonge. Elle devient
       *     vraie quand le rattrapage a atteint le PREMIER block de TBLOCK — et c est seulement a
       *     ce moment-la qu une liste vide signifie vraiment « tu n as rien cree ».
       *   ⛔ UNE SORTIE CONSTANTE N EST PAS UNE MESURE : c est la meme regle que partout ailleurs
       *     dans ce depot, et elle vaut aussi pour un booleen. */
      /* ⛔⛔ ET LA COUVERTURE EXIGE AUSSI ZERO TROU. Atteindre le premier block ne suffit PAS si on
       *     a saute des plages en chemin : on se declarerait complet avec des creations
       *     manquantes, et une liste vide redeviendrait un mensonge — le defaut meme qu on repare.
       *     Les DEUX conditions, jamais une seule. */
      /* ⛔⛔ 2026-10-09 (audit du budget d archive) — ET ZERO TROU DU SCAN VERS L AVANT, ET ZERO CREATEUR NON RESOLU. Une creation
       *     dans une fenetre sautee par le scan vers l avant (`trousCreations`) n est pas indexee ; un block dont la tx n a pas pu
       *     etre lue (`createursNonResolus`), ou jete par la borne de cette liste, non plus. Le rattrapage ne repasse sur aucun des
       *     deux : sans ces conditions, « complet » mentait sur eux. */
      couvertureComplete: rattrapageDepuis !== null && rattrapageDepuis <= PREMIER_BLOCK_TB
        && trousRattrapage.length === 0
        && trousCreations.length === 0 && createursNonResolus.length === 0,
      rattrapageDepuis,
      trousCreations: trousCreations.length,
      createursNonResolus: createursNonResolus.length,
      createursNonResolusJetes,
      /* ⛔ LES PLAGES SAUTEES SONT PUBLIEES, PAS TUES : c est ce qui rend le saut acceptable. Un
       *   trou nomme se rattrape ; un trou tu ne se rattrape jamais. */
      trous: trousRattrapage.length,
      plagesManquees: trousRattrapage.slice(-5),
      /* ce qui a ete RELU depuis (noeud d archive) ; et si le rattrapage attend le budget du jour, c est dit — pas un silence */
      plagesRelues: trousRattrapageRelus.slice(-5),
      attendBudgetArchive: rattrapageDepuis !== null && rattrapageDepuis > PREMIER_BLOCK_TB && archiveEpuisee(),
      /* ⛔⛔ 2026-10-25 (creations-index.js) : les BORNES de l index, pour que le navigateur ne relise que ce qu il ne couvre pas.
       *   Mesure : la Wallet relisait 43 200 blocs de la factory depuis le navigateur (« 17 chain window(s) refused by the node »)
       *   alors que cet index etait complet. Sans ces bornes, ou au moindre trou non liste, le navigateur relit tout, comme avant. */
      ...bornesPubliees(),
      /* 2026-10-25 : bloc de creation et symbole de ces blocks (et des non resolus) quand le serveur les a lus ; symbole sinon pris
       *   a l index des noms. Absent = non lu, jamais « sans nom ». */
      faits: faitsServis([...blocks, ...createursNonResolus.map((c) => c.jeton)]),
      borne: 'Blocks whose creation transaction was read since this server started indexing. '
        + 'An empty list means "not indexed yet", never "you created nothing".',
    });
    return;
  }

  if (chemin === '/api/prix-usd') {
    const adr = String(new URL(req.url, 'http://x').searchParams.get('adr') || '').toLowerCase();
    /* ── ⛔⛔ LA PORTE S OUVRE AUX BLOCKS QU ON SUIT, ET A RIEN D AUTRE ──────────────────────────
     *     Le concept du produit est qu on rend N IMPORTE QUEL actif en block — donc n importe quel
     *     block doit pouvoir servir de paire. Un registre grave de 14 entrees ne peut pas porter ca :
     *     notre index suit deja ~2 000 blocks B20 decouverts SUR LA CHAINE.
     *   ⛔⛔ MAIS CET ENDPOINT RELAIE VERS DEXSCREENER, donc son filtre est une frontiere, pas une
     *       formalite. L ouvrir a une adresse arbitraire ferait de nous un proxy de prix pour
     *       n importe qui. `blocksConnus` n est PAS une entree utilisateur : c est l ensemble des
     *       creations B20 que NOTRE indexeur a lues sur la chaine. L appartenance a ce Set EST la
     *       validation — une adresse mal formee n y entre jamais (ligne 712 : regex a l insertion).
     *   ⛔ LE REGISTRE RESTE EN PREMIER : ETH, USDC, cbBTC et TOSHI ne sont pas des B20 et ne sont
     *     donc pas dans `blocksConnus`. Les deux sources sont complementaires, pas redondantes. */
    const admise = pairesProposees(8453).some((p) => ['STABLE', 'MAJEUR', 'ACTION'].includes(p.type) && p.adr.toLowerCase() === adr)
      || blocksConnus.has(adr);
    /* ⛔⛔⛔ CET ENDPOINT A ETE MUET, MESURE EN PRODUCTION LE 2026-10-01 : quatre `curl` de suite,
     *      HTTP 000 a 12 s puis 20 s, 20 s, 20 s — aucune reponse, jamais. Pas une lenteur : une
     *      ABSENCE. Et `/sante` rendait 200 pendant tout ce temps.
     *      ⇒ CONDITION : la fenetre FROIDE juste apres un deploiement. Le conteneur redemarre, le
     *        cache chaud est perdu, et le noeud RPC amont nous refuse — le serveur le DIT lui-meme
     *        sur ses voisins : `/api/cle` rendait « pool key not read: over rate limit » et
     *        `/api/face` « over rate limit », a la meme seconde.
     *      ⇒ ET LA FENETRE S EST REFERMEE SEULE : ~2 minutes plus tard, 0,44 s. J avais ecrit
     *        « reproductible, donc pas du froid » — c etait FAUX, et je le laisse ecrit ici :
     *        reproductible PENDANT la fenetre n est pas permanent. La correction de ce diagnostic
     *        ne change rien au defaut, mais elle change ce qu on peut en dire.
     *      ⚠️ ET LE 0,44 s NE PROUVE PAS LE CHEMIN FROID : `prixUsdCache` garde 300 s, donc cette
     *        reussite peut n etre qu un cache hit. Ce qui est prouve, c est le MUTISME ; la guerison
     *        est constatee, pas expliquee.
     *
     * ⛔⛔ LA CAUSE, ELLE, EST STRUCTURELLE. Le `fetch` DexScreener est borne
     *   (`AbortSignal.timeout(8000)`), mais la reponse n est envoyee qu A L INTERIEUR du `.then` de
     *   `faitsDeLaPool` puis de `alternativeAerodrome` — deux lectures ON-CHAIN sans aucune borne.
     *   Le prix, deja acquis en moins de 8 s, etait retenu en otage par son ENRICHISSEMENT.
     *   Ce fichier ecrit pourtant, vingt lignes plus bas : « LE PRIX EST UN FAIT, LA PORTE EST UNE
     *   POLITIQUE ». La mecanique disait le contraire : pas de politique, pas de fait.
     *   ⇒ C est le jumeau FAIBLE de `/api/trending`, qui porte « NEVER hang HTTP on cold scan » et
     *     rend un placeholder. Meme serveur, meme froid, une porte gardee et l autre pas.
     *
     * ⛔⛔ `repondu` : LA REPONSE EST A UN SEUL COUP, et ce verrou est la CONDITION pour poser une
     *   borne. Sans lui, la borne repond, puis l enrichissement se reveille et repond a son tour :
     *   Node leve `Cannot set headers after they are sent`. Une garde qui transforme un mutisme en
     *   crash n aurait rien repare — elle aurait change la FORME de la panne.
     *   ⚠️ CE HELPER EST RECOPIE A L IDENTIQUE DANS DEUX AUTRES HANDLERS (`/api/blocks-de`,
     *     `/api/parts-createur`), qui n ont PAS ce verrou. Mesure du jour : les deux repondent en
     *     0,32 s et 0,53 s, donc je n ai PAS de mutisme a leur reprocher et je ne les touche pas
     *     sur une symetrie. Nomme ici pour que le prochain qui pose une borne ailleurs sache
     *     qu il lui faut d abord ce verrou. */
    let repondu = false, borneFaits = null, libererVol = null, monVol = null;
    const repondre = (o) => {
      if (repondu) return;
      repondu = true;
      /* 2026-10-10 : la reponse du meneur est aussi celle des requetes identiques arrivees pendant son vol */
      if (libererVol) { if (prixUsdEnVol.get(adr) === monVol) prixUsdEnVol.delete(adr); const l = libererVol; libererVol = null; l(o); }
      /* ⛔ LE MINUTEUR SE DESARME ICI, PARCE QUE C EST LA SEULE SORTIE. Le desarmer dans chaque
       *   branche serait cinq endroits a ne pas oublier ; ici c est un seul, et il est sur le
       *   chemin de TOUTES. Un `setTimeout` laisse pendant retient le handler pour rien. */
      if (borneFaits) { clearTimeout(borneFaits); borneFaits = null; }
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o));
    };
    if (!admise) { repondre({ ok: false, pourquoi: 'not a pair currency of this app' }); return; }
    const c = prixUsdCache.get(adr);
    if (c && Date.now() - c.t < 300000) { repondre(c.r); return; }
    /* ⛔ 2026-10-10 (budget d archive epuise, /api/prix-usd 4 567 refus dans refusParQui) : les requetes IDENTIQUES (meme adresse)
     *   arrivees pendant qu une lecture est en vol ne relancent plus DexScreener + faitsDeLaPool (lectures d archive) : elles
     *   attendent la reponse du meneur et rendent la MEME. Rien n est garde apres la reponse (le cache reste celui d avant). */
    const enVol = prixUsdEnVol.get(adr);
    if (enVol) { prixUsdFusions += 1; enVol.then((o) => repondre(o)); return; }
    monVol = new Promise((ok) => { libererVol = ok; });
    prixUsdEnVol.set(adr, monVol);
    fetch('https://api.dexscreener.com/tokens/v1/base/' + adr, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } })
      .then((x) => (x.ok ? x.json() : Promise.reject(new Error('HTTP ' + x.status))))
      .then((j) => {
        const p = (Array.isArray(j) ? j : []).filter((x) => String(x.baseToken && x.baseToken.address).toLowerCase() === adr)
          .sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0))[0];
        const prix = p ? Number(p.priceUsd) : NaN, liq = p && p.liquidity ? Number(p.liquidity.usd) : 0;
        /* ── ⛔⛔ LE SEUIL DE TVL N EST PLUS LA PORTE, ET UNE MESURE L A DECIDE ─────────────────
         *     Il valait `liq >= 10000`. Mesure du 2026-09-28 en lisant `liquidity()` AU TICK
         *     COURANT : il ADMETTAIT BEc (TVL 10 072 $, 385 bps de glissement sur un achat de
         *     100 USDC) et REFUSAIT MUc (TVL 9 728 $, 8 bps) — quarante-huit fois mieux. En
         *     liquidite concentree, toute la liquidite peut etre LOIN du prix courant : la TVL ne
         *     dit pas le glissement, et le classement s inverse. La garde etait VRAIE et son
         *     critere le mauvais.
         *   ⛔ CE QUI RESTE ICI EST UN PLANCHER DE BRUIT, pas une politique : il ecarte les pools
         *     de poussiere avant qu on ne paie des lectures on-chain pour elles. La vraie porte
         *     est `porte-achat.js`, cote client, sur le GLISSEMENT — et elle ne peut pas vivre ici
         *     parce que cet endpoint sert AUSSI a convertir des FDV : y refuser un prix legitime
         *     casserait `valoDefautEnDevise`. LE PRIX EST UN FAIT, LA PORTE EST UNE POLITIQUE.
         *   ⛔ LES FAITS AJOUTES (`glissementBps`, `famille`) SONT LUS SUR LA CHAINE, et `famille`
         *     vient d un ALLER-RETOUR sur la factory Aerodrome, jamais du `dexId` de l agregateur :
         *     un nom rendu par un tiers n est pas une preuve de provenance. */
        const PLANCHER_DE_BRUIT_USD = 1000;
        if (!(prix > 0 && Number.isFinite(prix) && liq >= PLANCHER_DE_BRUIT_USD)) {
          repondre({ ok: false, pourquoi: 'no market above the ' + PLANCHER_DE_BRUIT_USD + ' USD noise floor' });
          return;
        }
        const r = { ok: true, prixUsd: prix, liquiditeUsd: liq, source: 'dexscreener', lu: new Date().toISOString() };
        /* ⛔⛔⛔ LA BORNE QUI EMPECHE LE MUTISME. A partir d ici le PRIX est acquis ; tout ce qui
         *      suit est de l ENRICHISSEMENT on-chain, et c est lui qui pouvait ne jamais rendre.
         *      Passe ce delai, on envoie le prix SANS les faits.
         *   ⛔ LA CHARGE EST EXACTEMENT CELLE DE LA BRANCHE `.catch` DEJA ECRITE PLUS BAS
         *     (`glissementBps: null`, `famille: 'NON_MESURE'`). Je n invente aucune semantique :
         *     un enrichissement qui expire est un enrichissement qui a echoue, et le client sait
         *     deja lire cet etat — `porte-achat.js` ne doit JAMAIS lire « non mesure » comme
         *     « bon marche », et c est deja sa regle.
         *   ⛔ `pourquoiFaits` DIT LA BORNE ET SA VALEUR, pas « unknown » : sans le delai dans la
         *     phrase, on ne saurait pas, en lisant un journal, si la lecture a echoue ou si c est
         *     NOUS qui avons coupe. Un chiffre absent de son propre message rend le message muet.
         *   ⛔ ET RIEN N EST MIS EN CACHE SUR CE CHEMIN : le code en aval ne cache que si
         *     `typeof f.glissementBps === 'number'`, donc la borne ne peut pas figer notre
         *     aveuglement pendant cinq minutes. C etait deja la bonne regle ; elle couvre ce cas.
         *   ⚠️ CE QUE LA BORNE NE FAIT PAS : elle n ANNULE pas la lecture on-chain, elle cesse de
         *     l attendre. Si elle aboutit apres coup, son resultat remplira le cache disque par le
         *     chemin normal et servira la requete SUIVANTE. Rien n est jete.
         *   ⛔ 6 s, ET PAS 8 : la borne doit rester SOUS celle de DexScreener (8 000 ms), sinon le
         *     pire des cas additionne les deux et depasse ce qu un navigateur attend sans broncher. */
        const BORNE_FAITS_MS = 6000;
        borneFaits = setTimeout(() => repondre({ ...r, glissementBps: null, famille: 'NON_MESURE',
          pourquoiFaits: 'pool facts not read within ' + BORNE_FAITS_MS + ' ms (chain read still pending); '
            + 'the price above is a measured fact, the missing ones are NOT a verdict' }), BORNE_FAITS_MS);
        /* ⛔ LES DEUX COTES DE LA PAIRE SONT PASSES, parce que la branche V4 en a besoin : depuis un
         *   `poolId` (un hash) on ne peut pas retrouver `currency0`, et sans lui le sens du
         *   glissement serait devine. Ils ne servent QU A cette lecture ; la famille, elle, reste
         *   prouvee par la chaine (`getSlot0` rend un prix non nul) et jamais par le `dexId`. */
        void faitsDeLaPool(p && p.pairAddress, {
          base: p && p.baseToken && p.baseToken.address,
          quote: p && p.quoteToken && p.quoteToken.address,
        }).then(async (f) => {
          /* ⛔ TROIS ETATS : une pool illisible rend `glissementBps: null` et
           *   `famille: 'NON_MESURE'`. Le client ne doit JAMAIS lire « non mesure » comme
           *   « bon marche ». */
          /* ⛔⛔ ET SI LA POOL SERVIE N EST PAS SUR AERODROME, ON CHERCHE CELLE QUI PORTE NOTRE
           *     FRAIS — sans rien decider. Le client compare les deux glissements et ne devie que
           *     si le surcout reste sous le frais (`choix-de-pool.js`). Rendre une alternative
           *     n est PAS la recommander : c est un chiffre de plus, pas une route choisie.
           *   ⛔ UNE ERREUR ICI NE DOIT PAS TUER LA REPONSE DE PRIX : le prix est un fait utile
           *     meme sans alternative. On la marque NON_MESURE et on continue. */
          let alt = null;
          try { alt = await alternativeAerodrome(adr, f.famille); }
          catch (e) { alt = { etat: 'NON_MESURE', pourquoi: 'alternative lookup failed: ' + String((e && e.message) || e).slice(0, 60) }; }
          const complet = { ...r, ...f, ...(alt ? { alternativeAerodrome: alt } : {}) };
          /* ⛔⛔ ON NE MET EN CACHE QUE CE QU ON A REELLEMENT LU. `faitsDeLaPool` se RESOUT (elle ne
           *     rejette pas) quand le RPC refuse, donc cacher sans regarder figerait un
           *     `glissementBps: null` pendant cinq minutes — et le prechauffage ne pourrait plus
           *     rien reparer. Mettre son propre aveuglement en cache est la facon la plus sure de
           *     le rendre permanent. */
          /* ⛔ 2026-10-09 : une cle v4 NON LUE (`cleNonLue: true`, `pourquoiCle` « NOT READ ») voyage dans `complet` : elle est
           *   cachee 300 s COMME non lue, jamais comme absente, et la cle n entre pas dans clesV4Lues (relue a la premiere requete
           *   apres ce cache). La retirer du cache (lu dans le code, non mesure) relancerait le balayage a CHAQUE requete : ≥ 1,8 s de
           *   pauses par fenetre que base.org refuse (rpcServeurBrut, 300 + 600 + 900 ms), donc la borne de 6 s tombe avant la fin
           *   -> NON_MESURE, et la file `enFile` reste tenue pour les autres devises : le glissement LU disparaitrait de l ecran. */
          if (typeof f.glissementBps === 'number') {
            prixUsdCache.set(adr, { t: Date.now(), r: complet });
            /* ⛔ ON GARDE LA LECTURE REUSSIE SUR LE DISQUE : c est elle qui portera la porte pendant
             *   la prochaine secheresse de RPC. */
            faitsPersistes.set(adr, { glissementBps: f.glissementBps, famille: f.famille,
              pool: f.pool || null, tickSpacing: f.tickSpacing || null, t: Date.now() });
            ecrireFaitsPersistes();
            repondre({ ...complet, ageFaitsMs: 0 });
            return;
          }
          /* ⛔⛔ RIEN LU AUJOURD HUI : ON REND LE DERNIER VERDICT CONNU, AVEC SON AGE. Rendre
           *     `NON_MESURE` alors qu on a un verdict d hier sur le disque serait jeter une mesure
           *     qu on possede — et laisser la porte inerte pour rien. `pourquoiFaits` dit quand
           *     meme pourquoi la lecture du jour a echoue : on ne cache pas la panne, on ne s en
           *     sert juste pas comme d un verdict. */
          const vieux = faitsPersistes.get(adr);
          if (vieux) {
            repondre({ ...r, glissementBps: vieux.glissementBps, famille: vieux.famille,
              pool: vieux.pool, tickSpacing: vieux.tickSpacing,
              ageFaitsMs: Date.now() - Number(vieux.t || 0),
              pourquoiFaits: 'live read failed (' + String(f.pourquoiFaits || 'unknown').slice(0, 60)
                + '), serving the last verdict read' });
            return;
          }
          repondre(complet);
        }).catch(() => {
          const sansFaits = { ...r, glissementBps: null, famille: 'NON_MESURE',
            pourquoiFaits: 'pool facts not read' };
          /* ⛔ PAS DE CACHE SUR UN RESULTAT INCOMPLET : le mettre en cache figerait notre
           *   aveuglement pendant cinq minutes. */
          repondre(sansFaits);
        });
      })
      .catch((e) => repondre({ ok: false, pourquoi: 'price not read: ' + String((e && e.message) || e).slice(0, 80) }));
    return;
  }

  /* ⛔ NOS BLOCKS — global, pas personnel. La page appelait une fenetre fixe de 20 000 blocs sans
   *    cache : un block cree par nous plus de ~11 h plus tot cessait d etre « a nous » en silence.
   *    La reponse porte sa propre BORNE (depuis / jusqua / couvertureComplete). */
  /* ⛔ NE MONTRE QUE CE QU ON A VERIFIE : si la reconstruction est trouee, l etat vaut INCOMPLET et
   *    aucune part n est rendue. Afficher des parts sur des soldes faux paierait la mauvaise adresse. */
  if (chemin.startsWith('/api/holders/')) {
    const jeton = chemin.slice('/api/holders/'.length).toLowerCase();
    holdersCorps(jeton).then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    }).catch(() => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'holders could not be read right now' }));
    });
    return;
  }

  /* ⛔ LE VEILLEUR, EXPOSE. Il crie sur ce que le contrat ACCEPTE : un second ancrage sur la meme
   *    periode. Le delai de contestation etant porte par la PERIODE et non par le jeton (trouvaille
   *    d audit du 2026-09-20, confirmee sous forge), tout jeton ancre plus de 6 h apres le premier
   *    n a AUCUNE fenetre. Le contrat n est pas modifiable : rendre visible est tout ce qui reste. */
  if (chemin === '/api/veille') {
    /* ⛔ 2026-10-09 : une marche en fond partagee, servie avec son age ; aucune marche budget d archive epuise (veilleUneFois). */
    const c = enFond('veille', veilleUneFois, VEILLE_TTL_MS);
    /* ⛔ UNE VEILLE QUI ECHOUE LE DIT. « 0 alerte » sur une lecture ratee endort : EN_COURS et ECHEC portent `complet: false`. */
    void repondreFond(res, c, () => ({ complet: false, alertes: [], attendBudgetArchive: archiveEpuisee(), depuisBloc: VEILLE_DEPUIS }));
    return;
  }

  /* ⛔ 2026-10-03 (Phil 00:20, spec Claude 00:27) : l index des blocks nes du CreateRouter (classement de ROUTAGE). */
  if (chemin === '/api/blocks-routeur') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(blocksRouteurCorps());
    return;
  }

  if (chemin === '/api/nos-blocks') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(nosBlocksCorps());
    return;
  }

  /* ⛔ 2026-10-10 : la fenetre DexScreener d un profil regardee AVANT d etre chargee (voir etatEmbedDex). */
  if (chemin === '/api/dex-embed-etat') {
    const id = String(new URL(req.url, 'http://x').searchParams.get('pair') || '').toLowerCase();
    const repondre = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    if (!ID_PAIRE_DEX.test(id)) { repondre({ ok: false, pourquoi: 'not a Base pair id' }); return; }
    void etatEmbedDex(id, new URL(req.url, 'http://x').searchParams.get('frais') === '1').then(repondre);
    return;
  }

  /* GET /api/chercher?q=<nom ou symbole> - lecture seule, en cache 30 s. TROUVE | AMBIGU (refus) | ABSENT (couverture dite). */
  if (chemin === '/api/chercher') {
    const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').slice(0, 64);
    const repondre = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    const cle = q.trim().toUpperCase(), deja = reponsesNoms.get(cle);
    if (deja && Date.now() - deja.t < 30000) { repondre(deja.corps); return; }
    (async () => {
      if (Date.now() - lignesNomsTrending.t > 60000) {
        try { const j = JSON.parse(await trending()); lignesNomsTrending = { t: Date.now(), lignes: Array.isArray(j.lignes) ? j.lignes.map((l) => ({ adr: l.adr, sym: l.sym, nom: l.nom })) : [] }; } catch (_) { /* on garde l ancienne liste */ }
      }
      const r = chercherNom(q, [...lignesNomsTrending.lignes, ...indexNoms.entrees()].filter((e) => !estJetonMasque(e && (e.adr || e.jeton)))); /* game354: never the old test TBLOCK */
      const corps = { ok: r.etat !== 'REFUSE', ...r, couverture: { nomsLus: indexNoms.taille(), aNommer: aNommerTaille, blocksConnus: blocksConnus.size, trending: lignesNomsTrending.lignes.length } };
      if (reponsesNoms.size > 500) reponsesNoms.clear();
      reponsesNoms.set(cle, { t: Date.now(), corps });
      repondre(corps);
    })().catch(() => repondre({ ok: false, etat: 'NON_MESURE', pourquoi: 'the name index could not be read' }));
    return;
  }

  /* ══ 2026-10-26 — GET /api/recherche?q=<symbole, nom ou adresse>&n=<1..20> : UNE recherche pour tout B20 (recherche-b20.js) ══════════
   *   Prefixe, sans casse ni diacritiques, classee (adresse exacte > symbole exact > nom exact > debut > contient ; a rang egal UNIT, puis
   *   les actions, puis les blocks a marche). Sources : UNIT et nos blocks, trending (lignes de marche), actions PROUVEES, faits de
   *   creation, noms lus, adresses connues (createurs + suivis). ⛔ AUCUNE lecture de chaine : la requete ne touche que la memoire.
   *   Requete validee (400 sinon), 60 par minute et par IP, resultats bornes, cache 15 s, couverture rendue (combien de blocks connus,
   *   combien ont un nom lu) pour qu un vide se dise « pas encore indexe » et jamais « n existe pas ». */
  if (chemin === '/api/recherche') {
    const rendreR = (code, o, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(JSON.stringify(o)); };
    if (req.method !== 'GET') { rendreR(405, { ok: false, etat: 'REFUSE', pourquoi: 'GET only' }); return; }
    const p = new URL(req.url, 'http://x').searchParams;
    const v = validerRequete(p.get('q'), p.get('n'));
    if (!v.ok) { rendreR(400, { ok: false, etat: 'REFUSE', pourquoi: v.pourquoi }); return; }
    const ipR = ipClient(req);
    const minuteR = Math.floor(Date.now() / 60000);
    if (rechercheBudget.minute !== minuteR) { rechercheBudget.minute = minuteR; rechercheBudget.n = 0; rechercheBudget.parIp.clear(); }
    const nIpR = (rechercheBudget.parIp.get(ipR) || 0) + 1;
    if (nIpR > RECHERCHE_IP_MINUTE || rechercheBudget.n >= RECHERCHE_MINUTE) { rendreR(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'too many searches - retry in a minute' }, { 'retry-after': '60' }); return; }
    if (rechercheBudget.parIp.size < 20000) rechercheBudget.parIp.set(ipR, nIpR);
    rechercheBudget.n += 1;
    const cleR = v.q + '|' + v.limite, dejaR = reponsesRecherche.get(cleR);
    if (dejaR && Date.now() - dejaR.t < 15000) { rendreR(200, dejaR.corps); return; }
    indexRecherche().then((idx) => {
      const r = chercherB20(v, idx.index);
      const corps = { ok: true, etat: r.resultats.length ? 'TROUVE' : 'ABSENT', q: v.q, mode: v.mode, ...r, lu: new Date(idx.t).toISOString(),
        couverture: { connus: idx.index.taille, nommes: idx.index.nommes, nomsLus: indexNoms.taille(), aNommer: aNommerTaille,
          actions: idx.actions, trending: idx.trending, creations: idx.creations,
          complet: aNommerTaille > 0 && indexNoms.taille() >= aNommerTaille },
        borne: 'Names and symbols are what each creator wrote on chain: they prove nothing. Open the whole address to check.' };
      if (reponsesRecherche.size > 500) reponsesRecherche.clear();
      reponsesRecherche.set(cleR, { t: Date.now(), corps });
      rendreR(200, corps);
    }).catch(() => rendreR(200, { ok: false, etat: 'NON_MESURE', pourquoi: 'the search index could not be built' }));
    return;
  }

  /* ══ 2026-10-10 — TOKENIZEDBANK PHASE 1 (banque-morpho.js) : preter / emprunter sur les marches Morpho Blue EXISTANTS dont la
   *   garantie est une action de notre registre. LECTURE SEULE : des plans NON SIGNES, simules (eth_simulateV1, rpcNaissance) avant
   *   PRET. Le budget est CELUI des rails (memes noeuds partages) : un plan banque compte comme un plan de trade.
   *   GET /api/banque/marches : la liste de l API Morpho (10 min ; un echec 1 min, dit NON_LU, jamais une liste vide).
   *   GET /api/banque/plan?action=emprunter|preter|rembourser|retirer&id=<bytes32>&compte=<adr>&garantie=&emprunt=&montant=&tout=1 */
  if (chemin === '/api/banque/marches') {
    const rendreB = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)); };
    const frais = banqueMarches.r && Date.now() - banqueMarches.t < (banqueMarches.r.ok ? 600000 : 60000);
    if (frais) { rendreB({ ...banqueMarches.r, lu: new Date(banqueMarches.t).toISOString() }); return; }
    /* 2026-10-26 (« colle toi au data de morpho ») : le frais Morpho de chaque marche liste est RELU SUR LA CHAINE (9 eth_call / 10 min,
     *   lecteur des rails) ; un echec laisse feeMorpho null - la page dit « not read », jamais 0 */
    if (!banqueMarches.enVol) banqueMarches.enVol = lireMarchesMorpho().then((r) => lireFraisMorphoChaine({ rpc: rpcRails, lu: r })).then((r) => { banqueMarches.r = r; banqueMarches.t = Date.now(); return r; }).finally(() => { banqueMarches.enVol = null; });
    banqueMarches.enVol.then((r) => rendreB({ ...r, lu: new Date(banqueMarches.t).toISOString(),
      borne: 'Figures from the Morpho API, except feeMorpho (each market\'s Morpho fee, re-read on chain; null = not read). A plan re-reads the market on chain and simulates it before it is offered.' }))
      .catch(() => rendreB({ ok: false, etat: 'NON_LU', pourquoi: 'Morpho markets not read' }));
    return;
  }
  /* ══ 2026-10-10 — LES AVOIRS D UN COMPTE PARMI LES ACTIFS DU REGISTRE (avoirs.js) ═══════════════════════════════════════════
   *   Test prod de Grok : l onglet Wallet cachait NVDAc (achete) - il ne lisait en direct qu ETH et USDC. Ici : balanceOf de chaque
   *   devise Base et de chaque action du registre, EN LOT (eth_call 'latest', jamais l archive), publicnode d abord (71/71 en un lot,
   *   mesure), puis RPC_LIST par lots de 20 pour ce qui manque. Chaque envoi compte dans /sante.envois (classeLot).
   *   30 s par compte, une lecture en vol par compte, 4 en vol au plus, 500 comptes en memoire. Un actif NON lu est rendu a part. */
  if (chemin === '/api/avoirs') {
    const rendreA = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    const compteA = String(new URL(req.url, 'http://x').searchParams.get('compte') || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(compteA)) { rendreA(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/avoirs?compte=<whole address>' }); return; }
    const deja = avoirsParCompte.get(compteA);
    if (deja && deja.corps && Date.now() - deja.t < 30000) { rendreA(200, deja.corps); return; }
    if (deja && deja.enVol) { deja.enVol.then((c) => rendreA(200, c)); return; }
    if (avoirsEnVol >= 4) { rendreA(429, { ok: false, etat: 'NON_LU', pourquoi: 'busy - retry in a few seconds' }); return; }
    if (avoirsParCompte.size > 500) avoirsParCompte.clear();
    avoirsEnVol += 1;
    const enVol = lireAvoirs({ compte: compteA, jetons: [...JETONS_AVOIRS.keys()], noeuds: NOEUDS_AVOIRS, envoyer: envoyerLotAvoirs, decimalesConnues: decimalesAvoirs })
      .then((r) => ({ ok: r.etat !== 'NON_LU', etat: r.etat, ...(r.pourquoi ? { pourquoi: r.pourquoi } : {}),
        avoirs: r.avoirs.map((v) => ({ ...v, ...JETONS_AVOIRS.get(v.adr) })), zeros: r.zeros, nonLus: r.nonLus.length,
        /* 2026-10-11 : LESQUELS (la Bank dit « ce que tu peux emprunter » action par action : une action absente des avoirs n est un
         *   zero que si elle n est PAS dans cette liste) */
        nonLusAdr: r.nonLus.map((a) => String(a).toLowerCase()), lu: new Date().toISOString(),
        borne: 'Balances of the currencies and stocks of our list only, read at the latest block. A token outside the list is not read here.' }))
      .catch(() => ({ ok: false, etat: 'NON_LU', pourquoi: 'holdings not read', avoirs: [], zeros: 0, nonLus: JETONS_AVOIRS.size }))
      .finally(() => { avoirsEnVol -= 1; });
    avoirsParCompte.set(compteA, { t: 0, corps: null, enVol });
    /* un echec n est garde que 5 s (relu vite), une lecture 30 s */
    enVol.then((corps) => { avoirsParCompte.set(compteA, { t: corps.ok ? Date.now() : Date.now() - 25000, corps, enVol: null }); rendreA(200, corps); });
    return;
  }
  if (chemin === '/api/banque/positions') {
    const rendreB = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)); };
    const compte = String(new URL(req.url, 'http://x').searchParams.get('compte') || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(compte)) { rendreB(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/banque/positions?compte=<whole address>' }); return; }
    const deja = banquePositions.get(compte);
    if (deja && deja.r && Date.now() - deja.t < 30000) { rendreB(200, { ...deja.r, lu: new Date(deja.t).toISOString() }); return; }
    if (!deja && banquePositions.size > 500) banquePositions.clear();
    const e = deja || { r: null, t: 0, enVol: null };
    if (!e.enVol) e.enVol = lirePositionsMorpho({ compte }).then((r) => { e.r = r; e.t = Date.now(); return r; }).finally(() => { e.enVol = null; });
    banquePositions.set(compte, e);
    e.enVol.then((r) => rendreB(200, { ...r, lu: new Date(e.t).toISOString(), borne: 'Figures from the Morpho API, for display. Repaying or withdrawing re-reads your position on chain.' }))
      .catch(() => rendreB(200, { ok: false, etat: 'NON_LU', pourquoi: 'positions not read' }));
    return;
  }
  if (chemin === '/api/banque/plan') {
    const rendreB = (code, o, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', ...extra }); res.end(JSON.stringify(o)); };
    if (req.method !== 'GET') { rendreB(405, { ok: false, pourquoi: 'GET only' }); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    const action = String(q.get('action') || ''), id = String(q.get('id') || ''), compte = String(q.get('compte') || '');
    const entier = (k) => { const v = String(q.get(k) || ''); return /^(0|[1-9][0-9]{0,40})$/.test(v) ? BigInt(v) : null; };
    /* 2026-10-11 (Phil : « plusieurs actions tokenisees en garantie en meme temps ») : action=panier&lignes=<id>:<garantie>:<emprunt>,...
     *   1 a PANIER_MAX lignes ; chaque action reste sa propre position Morpho (banque-morpho.js, planEmprunterPanier). */
    let lignesPanier = null;
    if (action === 'panier') {
      const brutes = String(q.get('lignes') || '').split(',').filter(Boolean);
      if (!/^0x[0-9a-fA-F]{40}$/.test(compte) || brutes.length < 1 || brutes.length > PANIER_MAX
        || !brutes.every((l) => /^0x[0-9a-fA-F]{64}:(0|[1-9][0-9]{0,40}):[1-9][0-9]{0,40}$/.test(l))) {
        rendreB(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/banque/plan?action=panier&lignes=<market id>:<raw collateral>:<raw borrow>,... (1 to ' + PANIER_MAX + ' lines)&compte=<the wallet that will sign>' });
        return;
      }
      lignesPanier = brutes.map((l) => { const [i, g, e] = l.split(':'); return { id: i, garantie: BigInt(g), emprunt: BigInt(e) }; });
    }
    const usage = 'usage: /api/banque/plan?action=emprunter|preter|rembourser|retirer|retirerpret&id=<Morpho market id, bytes32>&compte=<the wallet that will sign>'
      + ' and: emprunter -> garantie=<raw units of the stock, 0 for none>&emprunt=<raw units>; preter|retirer -> montant=<raw units>; rembourser|retirerpret -> montant=<raw units> or tout=1';
    if (action !== 'panier' && (!['emprunter', 'preter', 'rembourser', 'retirer', 'retirerpret'].includes(action) || !/^0x[0-9a-fA-F]{64}$/.test(id) || !/^0x[0-9a-fA-F]{40}$/.test(compte))) { rendreB(400, { ok: false, etat: 'REFUSE', pourquoi: usage }); return; }
    const ipB = ipClient(req);
    const minuteB = Math.floor(Date.now() / 60000);
    if (railsBudget.minute !== minuteB) { railsBudget.minute = minuteB; railsBudget.n = 0; railsBudget.parIp.clear(); }
    const nIpB = (railsBudget.parIp.get(ipB) || 0) + 1;
    if (nIpB > RAILS_IP_MINUTE || railsBudget.n >= RAILS_MINUTE || railsEnVol >= RAILS_EN_VOL_MAX) {
      rendreB(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'busy: each plan reads the chain on a node shared with the whole site — retry in a minute' }, { 'retry-after': '60' });
      return;
    }
    let plan;
    if (action === 'panier') plan = () => planEmprunterPanier({ rpc: rpcNaissance, compte, lignes: lignesPanier });
    else if (action === 'emprunter') { const g = entier('garantie') ?? 0n, e = entier('emprunt'); if (e === null) { rendreB(400, { ok: false, etat: 'REFUSE', pourquoi: usage }); return; } plan = () => planEmprunter({ rpc: rpcNaissance, compte, id, garantie: g, emprunt: e }); }
    else if (action === 'rembourser' || action === 'retirerpret') { const tout = q.get('tout') === '1', m = entier('montant'); if (!tout && m === null) { rendreB(400, { ok: false, etat: 'REFUSE', pourquoi: usage }); return; } plan = () => (action === 'rembourser' ? planRembourser : planRetirerPret)({ rpc: rpcNaissance, compte, id, montant: m, tout }); }
    else { const m = entier('montant'); if (m === null) { rendreB(400, { ok: false, etat: 'REFUSE', pourquoi: usage }); return; } plan = () => (action === 'preter' ? planPreter : planRetirerGarantie)({ rpc: rpcNaissance, compte, id, montant: m }); }
    railsBudget.parIp.set(ipB, nIpB); railsBudget.n += 1; railsEnVol += 1;
    plan().then((r) => rendreB(200, { ok: r.etat === 'PRET', action, ...r }, {}),
      (e) => rendreB(200, { ok: false, etat: 'NON_MESURE', action, pourquoi: 'plan not built: ' + String((e && e.message) || e).slice(0, 120), aSigner: [] }))
      .finally(() => { railsEnVol -= 1; });
    return;
  }

  if (chemin === '/api/trending') {
    trending().then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    });
    return;
  }

  /* ══ LE LOGO D UN BLOCK, A UNE URL (/face/0x….svg) ═════════════════════════════════════════════════
   * ⛔⛔ PHIL (2026-09-18) : « hors de l app, le block n a pas sa face — grosse erreur de design ». Mesure : la face
   *    EST deja gravee a la creation (champ image du contractURI, SVG). Mais DexScreener, les wallets et Basescan
   *    ne lisent pas le contractURI d un ERC-20 : ils demandent une URL de logo. Cette route la fournit, rendue
   *    depuis la face GRAVEE — la meme que l app dessine.
   * ⛔ SEULEMENT POUR UNE FACE GRAVEE (etat LU). Pour le token de quelqu un d autre, sans face gravee, on rend 404 :
   *    fabriquer un logo depuis son adresse, c est lui preter une identite qu il n a jamais choisie.
   * ⚠️ CE QUE CA NE FAIT PAS : l afficher automatiquement ailleurs. Il faut coller cette URL la ou chaque
   *    plateforme la demande (profil DexScreener, token list, fiche Basescan). */
  /* ══ KIT DEXSCREENER (Phil 2026-09-19 : « le block en 2D sur DexScreener ») ════════════════════════════════════════
   * Mesure (docs DexScreener) : AUCUN logo n est lu depuis la chaine ; il vient d une liste externe (CoinGecko…) ou de
   * « Enhanced Token Info », payant, commande par l equipe du token. On ne peut donc que PREPARER les images aux formats
   * demandes (logo carre, banniere 3:1). ⛔ Meme regle que /face : seulement pour une face GRAVEE, sinon 404. */
  const kit = chemin.match(/^\/face\/(0x[0-9a-fA-F]{40})\.(carre|banniere)\.png$/);
  if (kit) {
    const [, token, forme] = kit;
    Promise.all([
      resoudreFace(token),
      rpcServeur('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']).catch(() => null),
    ]).then(async ([f, symHex]) => {
      if (!f || f.etat !== 'LU' || !f.face) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('no engraved face for this block');
        return;
      }
      let sym = '';
      try { const b = String(symHex || '').slice(2); const n = parseInt(b.slice(64, 128), 16); sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12); } catch (_) { sym = ''; }
      const face = logoSvg(paramsLogoDepuisApparence(f.face, sym || '·'));
      const fond = (face.match(/<rect width="200" height="220" fill="([^"]+)"/) || [])[1] || '#0b0b14';
      const niche = (x, y, l, h) => face.replace(/^<svg /, '<svg x="' + x + '" y="' + y + '" width="' + l + '" height="' + h + '" ');
      const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const svg = forme === 'carre'
        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220"><rect width="220" height="220" fill="' + fond + '"/>' + niche(10, 0, 200, 220) + '</svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 500"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
          + '<stop offset="0" stop-color="#05070f"/><stop offset="1" stop-color="' + fond + '"/></linearGradient></defs>'
          + '<rect width="1500" height="500" fill="url(#g)"/>'
          /* sans son fond carre : la face flotte sur le degrade */
          + niche(90, 40, 382, 420).replace(/<rect width="200" height="220" fill="[^"]+"\s*\/?>(<\/rect>)?/, '')
          /* le titre tient dans 880 px quelle que soit la longueur du symbole (12 caracteres max) */
          + '<text x="560" y="250" font-family="DejaVu Sans" font-size="' + Math.min(120, Math.floor(880 / (Math.max(4, (sym ? sym.length + 1 : 7)) * 0.72))) + '" font-weight="700" fill="#f2fbff">' + esc(sym ? '$' + sym : 'A block') + '</text>'
          + '<text x="564" y="325" font-family="DejaVu Sans" font-size="32" fill="#9cc3cf">a living block on Base · tokenizedblock.space</text></svg>';
      const rendre = await obtenirRasteriseur();
      const png = rendre(svg, forme === 'carre' ? 512 : 1500);
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400',
        'content-disposition': 'inline; filename="' + (sym || 'block').replace(/[^A-Za-z0-9]/g, '') + '-' + (forme === 'carre' ? 'logo-512' : 'banner-1500x500') + '.png"',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      res.end(Buffer.from(png));
    }).catch(() => {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('image not rendered right now');
    });
    return;
  }

  if (/^\/face\/0x[0-9a-fA-F]{40}\.png$/.test(chemin)) {
    const token = chemin.slice('/face/'.length, -'.png'.length);
    Promise.all([
      resoudreFace(token),
      rpcServeur('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']).catch(() => null),
    ]).then(async ([f, symHex]) => {
      if (!f || f.etat !== 'LU' || !f.face) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('no engraved face for this block');
        return;
      }
      let sym = '';
      try {
        const b = String(symHex || '').slice(2);
        const n = parseInt(b.slice(64, 128), 16);
        sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12);
      } catch (_) { sym = ''; }
      const rendre = await obtenirRasteriseur();
      const png = rendre(logoSvg(paramsLogoDepuisApparence(f.face, sym || '·')));
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      res.end(Buffer.from(png));
    }).catch(() => {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('logo not rendered right now');
    });
    return;
  }

  if (/^\/face\/0x[0-9a-fA-F]{40}\.svg$/.test(chemin)) {
    const token = chemin.slice('/face/'.length, -'.svg'.length);
    Promise.all([
      resoudreFace(token),
      rpcServeur('eth_call', [{ to: token, data: '0x95d89b41' }, 'latest']).catch(() => null),
    ]).then(([r, symHex]) => {
      if (!r || r.etat !== 'LU' || !r.face) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('no engraved face for this block');
        return;
      }
      let sym = '';
      try {
        const b = String(symHex || '').slice(2);
        const n = parseInt(b.slice(64, 128), 16);
        sym = Buffer.from(b.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12);
      } catch (_) { sym = ''; }
      const svg = logoSvg(paramsLogoDepuisApparence(r.face, sym || '·'));
      /* la face est immuable : une journee de cache public ne peut jamais servir une face perimee */
      res.writeHead(200, { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=86400',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*' });
      res.end(svg);
    }).catch(() => {
      res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      res.end('face not read right now');
    });
    return;
  }

  /* la face GRAVEE d un block : /api/face/0x… — celle que son createur a choisie, pas celle qu on devine */
  if (chemin.startsWith('/api/face/')) {
    const token = chemin.slice('/api/face/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'whole address required' }));
      return;
    }
    resoudreFace(token).then((r) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(r));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, etat: 'NON_LUE', pourquoi: 'face not read: ' + String(e.message || e).slice(0, 120) }));
    });
    return;
  }

  /* ══ LE POST GRAVE, RECONSTITUE CHEZ NOUS : /api/post/0x… ═══════════════════════════════════════
   * ⛔⛔ POURQUOI COTE SERVEUR. Le widget officiel de X chargerait `platform.twitter.com` chez
   *     CHAQUE visiteur : un script externe, du pistage, et une dependance qui peut tomber ou
   *     changer sans prevenir. Trois refus d integration ont deja ete essuyes ici pour cette raison
   *     exacte. On demande donc a X une fois, d ici, et la page redessine avec ses propres balises.
   * ⛔ ON NE RENVOIE JAMAIS LEUR HTML : seulement l auteur et le TEXTE, extraits et bornes.
   * ⛔ CACHE : une reponse LUE ou INTROUVABLE decrit un fait stable, elle se garde. Un NON_MESURE
   *   est un echec de LECTURE : jamais cache, sinon une minute de reseau coupe condamnerait
   *   l affichage d un post pour toute la vie du processus. Meme discipline que les faces. */
  if (chemin.startsWith('/api/post/')) {
    const token = chemin.slice('/api/post/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'whole address required' }));
      return;
    }
    const t = token.toLowerCase();
    const rendre = (corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps));
    };
    if (postsLus.has(t)) { rendre(postsLus.get(t)); return; }
    resoudreFace(t).then(async (f) => {
      /* ⛔⛔ BUG QUE J AI MOI-MEME INTRODUIT ET LIVRE, corrige le 2026-09-25 apres mesure en
       *     production : `/api/face/` rendait bien le post grave de ce block, et `/api/post/`
       *     repondait « AUCUN ». Cause : `resoudreFace` rend `face: null` quand la LECTURE echoue,
       *     et mon code lisait ce `null` comme « pas de post grave ».
       *     C est `absence-of-evidence-vs-failure-to-look`, et j avais meme ecrit en commentaire
       *     que « pas de post est un fait stable » — ce qui n est vrai QUE si la face a ete lue.
       *   ⛔⛔ ET LE CACHE RENDAIT LA FAUTE DEFINITIVE : une seule lecture ratee condamnait
       *     l affichage du post de ce block pour toute la vie du processus. Une erreur qu on garde
       *     coute infiniment plus cher que la meme erreur oubliee.
       *   ⇒ On exige que la face ait ETE LUE avant de conclure quoi que ce soit sur son post. */
      if (!f || f.etat !== 'LU') {
        rendre({ ok: true, etat: 'NON_MESURE',
          pourquoi: 'this block\'s face could not be read right now — that is about our reading, not about the post' });
        return;
      }
      const lien = f.face && typeof f.face.tweet === 'string' ? f.face.tweet : null;
      if (!lien) {
        /* ⛔ ICI seulement « aucun post » est un FAIT : la face a ete lue, et elle ne porte pas de
         *   lien. C est stable, donc cachable. */
        const rep = { ok: true, etat: 'AUCUN', pourquoi: 'no post engraved on this block' };
        postsLus.set(t, rep);
        rendre(rep);
        return;
      }
      const p = await lirePostPublie({ lien });
      const rep = p.etat === 'LU'
        ? { ok: true, etat: 'LU', auteur: p.auteur, auteurLien: p.auteurLien, texte: p.texte, lien }
        : { ok: true, etat: p.etat, lien, pourquoi: p.pourquoi };
      if (p.etat !== 'NON_MESURE') postsLus.set(t, rep);
      rendre(rep);
    }).catch((e) => {
      rendre({ ok: false, etat: 'NON_MESURE', pourquoi: 'post not read: ' + String(e.message || e).slice(0, 120) });
    });
    return;
  }

  /* ══ game376 — /api/emission/0x… : can anyone still create more of this block? (emission-b20.js, cached per token) ══════════════
   * { ok, etat: FIXE | PEUT_CROITRE | INCERTAIN | NON_LU, detenteurs, enCours, reessayerDansS }. Never waits on the chain: a token not
   * checked yet answers NON_LU + enCours (the panel says « checking… » and asks again), and its check runs in the background. */
  if (chemin.startsWith('/api/emission/')) {
    const jetonE = chemin.slice('/api/emission/'.length).toLowerCase();
    const rendreE = (code, corps) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps));
    };
    if (!/^0x[0-9a-f]{40}$/.test(jetonE)) { rendreE(400, { ok: false, pourquoi: 'whole address required' }); return; }
    const d = serviceEmission.demander(jetonE);
    const v = d.v || { etat: 'NON_LU', jeton: jetonE, pourquoi: 'checking' };
    /* `phrase` = the screen sentence, written in ONE place (emission-b20.js) — the page shows it, it does not rebuild it */
    rendreE(200, { ok: true, ...v, phrase: phraseEmission(v), enCours: d.enCours, reessayerDansS: d.frais && v.etat !== 'NON_LU' ? null : 8 });
    return;
  }

  /* ══ LA VOIX D UN BLOCK : /api/voix (Raksha, 2026-10-02) ══════════════════════════════════════
   * GET  /api/voix?b=0x…,0x…   → les voix PUBLIQUES (sans le savoir entier, seulement son court resume), 60 au plus
   * GET  /api/voix/0x…         → la voix entiere d un block (pour sa fiche)
   * POST /api/voix/0x…         → { voix, horodatage, signature, tx? } — signe par le wallet qui a CREE le block.
   * ⛔ Ce qui coute du reseau (ecrecover, createur) ne tourne qu apres les verifications gratuites, et au plus
   *   VOIX_POSTS_MINUTE fois par minute pour tout le serveur. Aucune cle, aucun secret, aucun montant ici. */
  if (chemin === '/api/voix' || chemin.startsWith('/api/voix/')) {
    const rendreV = (code, corps) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps));
    };
    if (chemin === '/api/voix') {
      const q = new URL(req.url, 'http://x').searchParams;
      const liste = String(q.get('b') || '').toLowerCase().split(',').filter((a) => /^0x[0-9a-f]{40}$/.test(a)).slice(0, 60);
      const voix = {};
      for (const a of liste) { const v = voixParBlock.get(a); if (v) voix[a] = voixPublique(v.voix); }
      rendreV(200, { ok: true, voix });
      return;
    }
    const jetonV = chemin.slice('/api/voix/'.length).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(jetonV)) { rendreV(400, { ok: false, pourquoi: 'whole address required' }); return; }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const v = voixParBlock.get(jetonV);
      /* le createur est un fait public (expediteur de la tx de creation) : la fiche s en sert pour cacher l editeur aux autres */
      rendreV(200, { ok: true, voix: v ? v.voix : null, horodatage: v ? v.horodatage : null, createur: createurParBlock.get(jetonV) || null });
      return;
    }
    if (req.method !== 'POST') { rendreV(405, { ok: false, pourquoi: 'GET or POST only' }); return; }
    /* ⛔ le budget ne se compte qu AU MOMENT DU RESEAU : un corps mal forme ne prive personne de son enregistrement */
    const ipV = ipClient(req);
    const budgetV = () => {
      const minute = Math.floor(Date.now() / 60000);
      if (voixPosts.minute !== minute) { voixPosts.minute = minute; voixPosts.n = 0; voixPosts.parIp.clear(); }
      const n = (voixPosts.parIp.get(ipV) || 0) + 1;
      voixPosts.parIp.set(ipV, n);
      return ++voixPosts.n <= VOIX_POSTS_MINUTE && n <= VOIX_POSTS_IP_MINUTE;
    };
    let brut = '', trop = false;
    req.on('data', (c) => { if (trop) return; brut += c; if (brut.length > VOIX_CORPS_MAX) { trop = true; rendreV(413, { ok: false, pourquoi: 'too long' }); req.destroy(); } });
    req.on('end', async () => {
      if (trop) return;
      let corps;
      try { corps = JSON.parse(brut); } catch { rendreV(400, { ok: false, pourquoi: 'not JSON' }); return; }
      try {
        const avant = voixParBlock.get(jetonV);
        const r = await verifierEcriture({ jeton: jetonV, chaine: 8453, horodatage: corps && corps.horodatage, voix: corps && corps.voix,
          signature: corps && corps.signature, maintenant: Date.now(), precedent: avant ? avant.horodatage : null,
          recuperer: (texte, sig) => {
            if (!budgetV()) throw new Error('too many saves right now — try again in a minute');
            return recupererSignataire({ rpc: rpcServeur, texte, signature: sig });
          },
          proprietaire: () => proprietaireDuBlock({ rpc: rpcServeur, jeton: jetonV, connu: createurParBlock.get(jetonV) || null, tx: corps && corps.tx }) });
        if (!r.ok) { rendreV(r.pourquoi.startsWith('only the wallet') ? 403 : 400, r); return; }
        if (r.voix) voixParBlock.set(jetonV, { voix: r.voix, horodatage: r.horodatage, auteur: r.auteur });
        else voixParBlock.delete(jetonV);
        ecrireVoix();
        rendreV(200, { ok: true, voix: r.voix, horodatage: r.horodatage });
      } catch (e) { rendreV(200, { ok: false, pourquoi: 'not saved: ' + String((e && e.message) || e).slice(0, 80) }); }
    });
    return;
  }

  /* la vraie cle de pool d un block : /api/cle/0x… — lue sur la chaine, jamais devinee */
  if (chemin.startsWith('/api/cle/')) {
    const token = chemin.slice('/api/cle/'.length);
    if (!/^0x[0-9a-fA-F]{40}$/.test(token)) {
      res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: 'whole address required' }));
      return;
    }
    /* ⛔⛔ UNE CLE LUE UNE FOIS NE SE RELIT JAMAIS. Mesure du 2026-09-26 : cette route repondait
     *     `{"ok":false,"pourquoi":"pool key not read: over rate limit"}` pour MUc — un block qui
     *     trade 806 446 $ par 24 h et dont la pool v4 est PARFAITEMENT LISIBLE par notre propre
     *     StateView (`sqrtPriceX96 = 23726964141923096624193324578`, lu a la main).
     *     Sans cle, le client retombe sur ses devinettes de PoolKey ; 432 combinaisons essayees a la
     *     main n ont pas retrouve son poolId — un poolId est un HASH, on ne l inverse pas.
     *     ⇒ La fiche affichait « Market unread — that is about the network. Use Retry. » et le
     *       Retry retapait la MEME route etranglee. Un geste qui ne pouvait pas aboutir.
     *   ⛔ UNE CLE DE POOL EST IMMUABLE : elle est le hash de ses propres champs. La mettre en
     *     cache pour toujours n est donc pas un pari sur la fraicheur — c est un fait qui ne
     *     change pas. Le PRIX, lui, n est jamais cache ici : il est relu a chaque visite.
     *   ⛔ ON NE CACHE QUE LES SUCCES. Un `ok:false` mis en cache figerait un echec reseau en
     *     verdict permanent — exactement le defaut qu on corrige. */
    const cleCache = clesCache.get(token.toLowerCase());
    /* 2026-10-26 (finding 4) : une entree faite des SEULES cles d indice poolId n est pas complete — la recherche par profondeur tourne
     *   encore et l union est rendue ; une entree d avant (profondeur, mesuree) reste servie telle quelle */
    if (entreeComplete(cleCache)) {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify({ ...cleCache, depuisCache: true }));
      return;
    }
    /* 2026-10-26 : les indices poolId du fil de marche (un getLogs etroit) PUIS la recherche par profondeur d avant : l union */
    clesParIndices(token).catch(() => ({ cles: [] })).then((p) => {
      /* une cle LUE par son indice est deja dans clesCache (garderCleLue) */
      const indices = p && p.cles.length ? p.cles : (cleCache && Array.isArray(cleCache.cles) ? cleCache.cles : []);
      resoudreClePool(token).then((r) => {
        let corps = r;
        try {
          if (r && r.ok === true && Array.isArray(r.cles) && r.cles.length) corps = { ...r, cles: garderUnion(token.toLowerCase(), r.cles) };
          else if (indices.length) corps = { ok: true, cles: indices, viaPoolId: true, profondeur: { ok: false, pourquoi: String((r && r.pourquoi) || 'no key found by depth').slice(0, 120) } };
        } catch (_) { /* ⛔ une mise en cache ratee ne doit pas priver le client de sa reponse */ }
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(JSON.stringify(corps));
      }).catch((e) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        if (indices.length) res.end(JSON.stringify({ ok: true, cles: indices, viaPoolId: true, profondeur: { ok: false, etat: 'NON_LU', pourquoi: 'depth search not read: ' + String(e.message || e).slice(0, 120) } }));
        else res.end(JSON.stringify({ ok: false, etat: 'NON_LU', pourquoi: 'pool key not read: ' + String(e.message || e).slice(0, 120) }));
      });
    });
    return;
  }

  /* les skins : le prix, celles d un block, et l enregistrement d un achat verifie sur la chaine (skins.js) */
  if (chemin === '/api/skins/prix' || chemin === '/api/skins/achat' || chemin.startsWith('/api/skins/')) {
    const rendreS = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (chemin === '/api/skins/achat') {
      if (req.method !== 'POST') { rendreS(405, { ok: false, pourquoi: 'POST only' }); return; }
      let brutS = '', tropS = false;
      req.on('data', (c) => { if (tropS) return; brutS += c; if (brutS.length > 2048) { tropS = true; rendreS(413, { ok: false, pourquoi: 'request too large' }); req.destroy(); } });
      req.on('end', () => {
        if (tropS) return;
        let j;
        try { j = JSON.parse(brutS || '{}'); } catch { rendreS(400, { ok: false, pourquoi: 'not JSON' }); return; }
        if (!j || typeof j !== 'object' || Array.isArray(j)) { rendreS(400, { ok: false, pourquoi: 'a JSON object is expected' }); return; }
        enregistrerAchatSkin({ tx: j.tx, block: j.block, skin: j.skin }).then((r) => rendreS(r.occupe ? 429 : 200, r))
          .catch((e) => rendreS(200, { ok: false, etat: 'NON_LU', pourquoi: String((e && e.message) || e).slice(0, 120) }));
      });
      return;
    }
    if (req.method !== 'GET') { rendreS(405, { ok: false, pourquoi: 'GET only' }); return; }
    /* les skins d UN ACHETEUR (Phil, 2026-10-04 : « les skins sont propres a l utilisateur… chacun voit son propre block ») :
     *   GET /api/skins/de/<compte> — sa derniere skin payee pour chaque block. C est un index public de transactions publiques. */
    if (chemin.startsWith('/api/skins/de/')) {
      const qui = chemin.slice('/api/skins/de/'.length).toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(qui)) { rendreS(400, { ok: false, pourquoi: 'whole account address required' }); return; }
      const parBlock = new Map();
      for (const l of skinsAchats.values()) if (l.payeur === qui) parBlock.set(l.block, l); /* la plus recente ecrase les precedentes */
      rendreS(200, { ok: true, compte: qui, skins: [...parBlock.values()].slice(-200) });
      return;
    }
    if (chemin === '/api/skins/prix') { rendreS(200, skinsPrixCorps()); return; }
    const blockS = chemin.slice('/api/skins/'.length).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(blockS)) { rendreS(400, { ok: false, pourquoi: 'whole block address required' }); return; }
    rendreS(200, { ok: true, block: blockS, achats: skinsDuBlock(blockS) });
    return;
  }
  /* 2026-10-27 — on-chain usage counts (users, DAU, WAU, volume), read-only: GET /api/usage. Seeded with the published measure
   *   (mesures/usage-onchain-20261027.json), then caught up in the background, at most one step every 10 min, with the SAME rules
   *   (usage-onchain.js). Counts only: no address, no hash. */
  if (chemin === '/api/usage') {
    const rendreU = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') { rendreU(405, { ok: false, pourquoi: 'GET only' }); return; }
    try { rendreU(200, usageServeur()); } catch (e) { rendreU(200, { ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) }); }
    return;
  }
  /* qui bouge ce block, en direct (onglet Market du panneau) : /api/activite/0x… */
  if (chemin.startsWith('/api/activite/')) {
    const token = chemin.slice('/api/activite/'.length).toLowerCase();
    const rendreA = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') { rendreA(405, { ok: false, pourquoi: 'GET only' }); return; }
    if (!/^0x[0-9a-f]{40}$/.test(token)) { rendreA(400, { ok: false, pourquoi: 'whole address required' }); return; }
    lireActiviteServeur(token).then((r) => rendreA(r && r.occupe ? 429 : 200, r))
      .catch((e) => rendreA(200, { ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }
  /* le multiplicateur B20 et la reference Chainlink d une action Coinbase, en lecture seule : /api/actions/reference/0x… */
  if (chemin.startsWith('/api/actions/reference/')) {
    const token = chemin.slice('/api/actions/reference/'.length).toLowerCase();
    const rendreR = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') { rendreR(405, { ok: false, pourquoi: 'GET only' }); return; }
    if (!/^0x[0-9a-f]{40}$/.test(token)) { rendreR(400, { ok: false, pourquoi: 'whole address required' }); return; }
    lireReferenceServeur(token).then((r) => rendreR(r && r.occupe ? 429 : 200, r))
      .catch((e) => rendreR(200, { ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }
  /* 2026-11-07 (human-brain branch): the LIVE on-chain price of a tokenized stock, from its Aerodrome pool (slot0), 24/7, read-only.
   *   Only stocks of the measured pool table: never an open price proxy. 8 s cache, one read in flight per stock. */
  if (chemin.startsWith('/api/fly/price/')) {
    const token = chemin.slice('/api/fly/price/'.length).toLowerCase();
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') { send(405, { ok: false, why: 'GET only' }); return; }
    if (!POOLS_ACTIONS_AERODROME.get(token)) { send(404, { ok: false, why: 'not a stock of the measured pool table' }); return; }
    lirePrixMouche(token).then((r) => send(200, r));
    return;
  }
  /* 2026-11-08 (human-brain branch): THE AUTONOMOUS FLY (CLAUDE.md exception, Phil 2026-11-08). Its key is in the user's browser; these
   *   routes read for it and relay what it signed, through the guard of fly-relay.js. The server holds no key and signs nothing. */
  if (chemin.startsWith('/api/fly/account/') || chemin === '/api/fly/estimate' || chemin === '/api/fly/relay' || chemin.startsWith('/api/fly/receipt/')) {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };
    const route = chemin.startsWith('/api/fly/account/') ? 'account' : chemin.startsWith('/api/fly/receipt/') ? 'receipt' : chemin === '/api/fly/estimate' ? 'estimate' : 'relay';
    const post = route === 'estimate' || route === 'relay';
    if (req.method !== (post ? 'POST' : 'GET')) { send(405, { ok: false, why: (post ? 'POST' : 'GET') + ' only' }); return; }
    if (!budgetMouche(req, route)) { send(429, { ok: false, why: 'too many requests this minute: retry in a minute' }); return; }
    const panne = (e) => send(200, { ok: false, why: String((e && e.message) || e).slice(0, 160) });
    if (route === 'account') {
      const adr = chemin.slice('/api/fly/account/'.length).toLowerCase(), q = new URL(req.url, 'http://x').searchParams, tok = String(q.get('token') || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(adr)) { send(400, { ok: false, why: 'usage: /api/fly/account/<address>[?token=<stock of the pool table>]' }); return; }
      if (tok && !POOLS_ACTIONS_AERODROME.get(tok)) { send(404, { ok: false, why: 'token: not a stock of the measured pool table' }); return; }
      /* game366: + the ETH price (the server's own, cached 60 s) so the fly prices its gas; null when unread (the fly then does not buy) */
      compteMouche(adr, tok || null).then(async (r) => send(200, { ...r, ethUsd: await prixUsdPourPlan(null).catch(() => null) })).catch(panne);
      return;
    }
    if (route === 'receipt') {
      const h = chemin.slice('/api/fly/receipt/'.length).toLowerCase();
      if (!/^0x[0-9a-f]{64}$/.test(h)) { send(400, { ok: false, why: 'usage: /api/fly/receipt/<transaction hash>' }); return; }
      const avecTx = new URL(req.url, 'http://x').searchParams.get('tx') === '1';
      Promise.all([rpcServeur('eth_getTransactionReceipt', [h]), avecTx ? rpcServeur('eth_getTransactionByHash', [h]) : null]).then(([r, t]) => send(200, { ok: true,
        receipt: r ? { status: r.status, blockNumber: r.blockNumber, gasUsed: r.gasUsed } : null, ...(avecTx ? { tx: t ? { from: t.from, to: t.to, input: t.input } : null } : {}) })).catch(panne);
      return;
    }
    lireCorpsMouche(req, route === 'relay' ? 64 * 1024 : 16 * 1024).then(async (b) => {
      if (route === 'estimate') {
        const ok = (x) => typeof x === 'string';
        if (!b || !/^0x[0-9a-fA-F]{40}$/.test(b.from) || !/^0x[0-9a-fA-F]{40}$/.test(b.to) || !ok(b.data) || !/^0x[0-9a-fA-F]*$/.test(b.data) || (b.value != null && !/^0x[0-9a-fA-F]{1,64}$/.test(b.value))) {
          send(400, { ok: false, why: 'body: {from, to, data, value?} as hex' }); return; }
        /* `refused`: the CHAIN said no (a revert, no funds); otherwise the node did not answer, and the page must not call that a refusal
         *   (QA 08/11: a 429 was shown as "the chain refuses this call") */
        let gas; try { gas = await rpcServeur('eth_estimateGas', [{ from: b.from, to: b.to, data: b.data, value: b.value || '0x0' }]); }
        catch (e) { const m = String((e && e.message) || e); send(200, { ok: false, refused: /revert|insufficient funds|gas required exceeds/i.test(m) || (e && e.data != null), why: m.slice(0, 160) }); return; }
        send(200, { ok: true, gas: BigInt(gas).toString() }); return;
      }
      /* relay */
      if (!b || typeof b.raw !== 'string') { send(400, { ok: false, why: 'body: {raw: "0x02..."}' }); return; }
      let t; try { t = parseTx(b.raw); } catch (e) { send(400, { ok: false, why: 'not a signed type-2 transaction: ' + String(e.message).slice(0, 80) }); return; }
      const refus = GARDE_MOUCHE.refusal(t);
      if (refus) { send(403, { ok: false, why: refus }); return; }
      /* 09/11: a memory seal is relayed only to an address WITHOUT code (fly-relay.js sealOnlyTarget) ; a silent node is not a refusal */
      const sealTo = GARDE_MOUCHE.sealOnlyTarget(t);
      if (sealTo) {
        let code; try { code = await rpcServeur('eth_getCode', [sealTo, 'latest']); } catch (e) { send(503, { ok: false, why: 'node did not answer while checking the seal address: ' + String((e && e.message) || e).slice(0, 120) }); return; }
        if (typeof code !== 'string' || code !== '0x') { send(403, { ok: false, why: 'refused: a memory seal goes to an address without code (the fly\'s own wallet), not to a contract' }); return; }
      }
      const hash = keccak256HexSrv(t.bytes);
      try { await rpcServeur('eth_sendRawTransaction', [b.raw]); send(200, { ok: true, hash }); }
      catch (e) { const m = String((e && e.message) || e);
        /* the same bytes sent twice (a retry on another node): already in the pool, same hash */
        if (/already known|known transaction/i.test(m)) send(200, { ok: true, hash, already: true }); else send(200, { ok: false, hash, why: m.slice(0, 160) }); }
    }).catch(panne);
    return;
  }
  /* 2026-11-08 (human-brain branch): the SHARED fly the server trains on one stock every minute (fly-core.js, the page's own brain) */
  if (chemin === '/api/fly/state') {
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };
    if (req.method !== 'GET') { send(405, { ok: false, why: 'GET only' }); return; }
    send(200, etatMoucheServeur());
    return;
  }
  /* 2026-11-09 TBLOCK holders bot webhook: Telegram proves itself with the secret header; the bot only answers /start with the page link */
  if (chemin === '/api/tblock/telegram-webhook') {
    const fin = (code) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end('{"ok":' + (code === 200) + '}'); };
    if (req.method !== 'POST') { fin(405); return; }
    if (!tbSecretOk(req.headers['x-telegram-bot-api-secret-token'])) { fin(401); return; }
    lireCorpsMouche(req, 64 * 1024).then(async (u) => {
      fin(200); /* answer Telegram first: a slow sendMessage must not make it retry the update */
      const jr = tbJoinRequestDecision(u, { chatId: process.env.TELEGRAM_CHAT_ID || '', approved: TB_HOLD.approved, nowMs: Date.now() });
      if (jr) {
        await tbTelegram(jr.approve ? 'approveChatJoinRequest' : 'declineChatJoinRequest', { chat_id: process.env.TELEGRAM_CHAT_ID, user_id: jr.userId });
        if (jr.approve) TB_HOLD.approved.delete(String(jr.userId));
        return;
      }
      const reply = tbTelegramReply(u, { newCode: tbNewTgCode });
      if (reply) {
        const gm = u && u.message;
        if (gm && gm.chat && (gm.chat.type === 'group' || gm.chat.type === 'supergroup') && gm.from && TB_HOLD.tgGroup.size < 20000) TB_HOLD.tgGroup.set(String(gm.from.id), gm.chat.id);
        await tbTelegram('sendMessage', reply);
      }
    }).catch(() => fin(400));
    return;
  }
  /* game329: GET /api/tblock/burn -> what 0x…dEaD holds of TBLOCK and its share of the supply, read at one block */
  if (chemin === '/api/tblock/burn') {
    const code = req.method === 'GET' ? 200 : 405;
    const out = (body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(body)); };
    if (code === 405) { out({ ok: false, why: 'GET only' }); return; }
    tbBurn().then(out);
    return;
  }
  /* 2026-11-09 TBLOCK proof of hold: GET /api/tblock/hold?wallet=0x… (status + a message to sign), POST /api/tblock/telegram-invite */
  if (chemin === '/api/tblock/hold' || chemin === '/api/tblock/telegram-invite') {
    /* game370: every answer says whether the holders' bot is configured — a boolean, never the token nor the chat id — so the page shows
     *   "opening soon" instead of a button that can only answer TELEGRAM_NOT_CONFIGURED */
    const telegramReady = tbTelegramConfigured({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID });
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify({ ...body, telegramReady })); };
    const pubHold = (h) => ({ ok: h.ok, usd: h.usd, price: h.price, tblockNeeded: h.tblockNeeded, why: h.why, balance: h.balance, block: h.block,
      priceNow: h.priceNow, priceBefore: h.priceBefore, wtcoinUsd: h.wtcoinUsd, thresholdUsd: h.thresholdUsd ?? TB_HOLD_USD, poolId: TB_POOL.poolId });
    const panneTb = (e) => send(200, { ok: false, state: 'NOT_READ', why: 'the chain did not answer: ' + String((e && e.message) || e).slice(0, 100) });
    if (chemin === '/api/tblock/hold') {
      if (req.method !== 'GET') { send(405, { ok: false, why: 'GET only' }); return; }
      const w = String(new URL(req.url, 'http://x').searchParams.get('wallet') || '').toLowerCase();
      if (!w) { tbPrices().then((p) => send(200, { ok: true, thresholdUsd: TB_HOLD_USD, priceNow: p.now.usd, priceBefore: p.prev.usd, why: p.now.why || p.prev.why || null,
        wtcoinUsd: p.now.wtcoinUsd ?? null, poolId: TB_POOL.poolId, block: p.tete })).catch(panneTb); return; }
      if (!/^0x[0-9a-f]{40}$/.test(w)) { send(400, { ok: false, why: 'whole wallet address required' }); return; }
      tbHoldOf(w).then((h) => { const c = h.ok ? tbChallenge(w) : null; send(200, { ...pubHold(h), challenge: c }); }).catch(panneTb);
      return;
    }
    if (req.method !== 'POST') { send(405, { ok: false, why: 'POST only' }); return; }
    lireCorpsMouche(req, 8 * 1024).then(async (b) => {
      const w = String((b && b.wallet) || '').toLowerCase(), nonce = String((b && b.nonce) || ''), sig = String((b && b.signature) || '');
      const tgCode = String((b && b.tg) || '');
      if (!/^0x[0-9a-f]{40}$/.test(w) || !/^[0-9a-f]{24}$/.test(nonce) || !/^0x[0-9a-fA-F]{130,3000}$/.test(sig) || (tgCode && !/^[0-9a-f]{24}$/.test(tgCode))) {
        send(400, { ok: false, why: 'body: {wallet, nonce, signature, tg?}' }); return; }
      const tgc = tgCode ? TB_HOLD.tgCodes.get(tgCode) : null;
      if (tgCode && (!tgc || tgc.exp < Date.now())) { send(200, { ok: false, state: 'TG_CODE_EXPIRED', why: 'this Telegram link expired: send /hold to the bot again' }); return; }
      const c = TB_HOLD.challenges.get(nonce);
      if (!c || c.exp < Date.now() || c.wallet !== w) { send(200, { ok: false, state: 'CHALLENGE_EXPIRED', why: 'this message expired or was already used: ask for a new one' }); return; }
      TB_HOLD.challenges.delete(nonce); /* single use, even when the rest fails */
      const own = await tbVerifyOwnership({ rpc: rpcServeur, wallet: w, message: tbHoldMessage({ wallet: w, nonce, issuedIso: c.issuedIso }), signature: sig });
      if (!own.ok) { send(200, { ok: false, state: 'NOT_OWNER', why: own.why }); return; }
      const h = await tbHoldOf(w);
      if (!h.ok) { send(200, { ok: false, state: 'NOT_HOLDER', ...pubHold(h) }); return; }
      const last = TB_HOLD.invited.get(w);
      if (last && Date.now() - last < 86400000) { send(200, { ok: false, state: 'ALREADY_INVITED', why: 'one invite per wallet per 24 h' }); return; }
      const inv = await tbTelegramInvite({ token: process.env.TELEGRAM_BOT_TOKEN || '', chatId: process.env.TELEGRAM_CHAT_ID || '', wallet: w, nowS: Date.now() / 1000, joinRequest: !!tgc });
      let sentInTelegram = false, tagged = false;
      if (inv.ok) {
        TB_HOLD.invited.set(w, Date.now());
        if (tgc) {
          TB_HOLD.tgCodes.delete(tgCode);
          TB_HOLD.approved.set(tgc.tgId, { wallet: w, exp: Date.now() + 900000 });
          const dm = await tbTelegram('sendMessage', { chat_id: Number(tgc.tgId), disable_web_page_preview: true,
            text: 'Proof accepted: this wallet holds $' + (h.usd || 0).toFixed(2) + ' of TBLOCK. Tap to ask to join the holders channel; I approve this account only (15 minutes).',
            reply_markup: { inline_keyboard: [[{ text: 'Join the holders channel', url: inv.link }]] } });
          sentInTelegram = !!(dm && dm.ok);
          /* game322: the visible "TBLOCK Holder" tag in the public group where this account asked (/hold) — best effort, said in the answer */
          const tagCall = tbHolderTagCall(TB_HOLD.tgGroup.get(tgc.tgId), tgc.tgId);
          if (tagCall) { const tr = await tbTelegram('setChatMemberTag', tagCall); tagged = !!(tr && tr.ok); }
        }
      }
      send(200, { ...inv, hold: pubHold(h), kind: own.kind, sentInTelegram, tagged, joinRequest: !!tgc });
    }).catch((e) => /too large|JSON body/.test(String(e && e.message)) ? send(400, { ok: false, why: String(e.message) }) : panneTb(e));
    return;
  }
  /* le marche d un block lu par le serveur (repli du navigateur quand ses noeuds publics le refusent) : /api/marche/0x… */
  if (chemin.startsWith('/api/marche/')) {
    const token = chemin.slice('/api/marche/'.length).toLowerCase();
    const rendreM = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') { rendreM(405, { ok: false, pourquoi: 'GET only' }); return; }
    if (!/^0x[0-9a-f]{40}$/.test(token)) { rendreM(400, { ok: false, pourquoi: 'whole address required' }); return; }
    lireMarcheServeur(token).then((r) => rendreM(r && r.occupe ? 429 : 200, r))
      .catch((e) => rendreM(200, { ok: false, etat: 'NON_LUE', pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }
  /* l etat des devises de paire de Create (born / not_born / not_read), lu une fois par le serveur : /api/paires/etat
   *   ⛔ une panne ici rend `ok: false` : l ecran garde ce qu il avait et ne grise rien de plus (etatsDepuisReponse rend null). */
  if (chemin === '/api/paires/etat') {
    const rendreE = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'GET') { rendreE(405, { ok: false, pourquoi: 'GET only' }); return; }
    etatPaires.lire().then((r) => rendreE(200, r))
      .catch((e) => rendreE(200, { ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }

  /* ══ LA NAISSANCE PAR UN AGENT, ET LE MCP (2026-10-04) ═════════════════════════════════════════════════════════════════
   *   GET  /api/naissance/paires                                       les devises de naissance
   *   GET  /api/naissance/plan?nom=&symbole=&compte=[&paire=][&sel=]   les appels NON SIGNES d une naissance entiere, simules
   *   GET  /api/caution?block=[&paire=][&compte=]                      le minimum du createur + l appel de sortie non signe
   *   POST /mcp                                                        les memes outils, en MCP (JSON-RPC 2.0, sans session)
   * ⛔ RIEN N EST SIGNE NI ENVOYE ICI. Nom et symbole d un block sont publics (ils seront graves) : ils peuvent voyager en GET. */
  /* l apercu du widget MCP tel que le serveur le rend a un client (resources/read) — pour le relire dans un navigateur */
  if (chemin === '/mcp/widget') {
    res.writeHead(widgetHtml ? 200 : 404, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(widgetHtml || 'the widget is not built on this server');
    return;
  }
  if (chemin === '/api/naissance/paires' || chemin === '/api/naissance/plan' || chemin === '/api/caution' || chemin === '/mcp' || chemin.startsWith('/api/panel/')) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, x-ms-monitor' };
    const rendreN = (code, corps, extra = {}) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...cors, ...extra });
      res.end(corps === null ? '' : JSON.stringify(corps));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    const ipN = ipClient(req);
    const sondeN = req.headers['x-ms-monitor'] === '1';
    const occupe = () => rendreN(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'busy: each plan reads the chain on a node shared with the whole site — retry in a minute' }, { 'retry-after': '60' });
    const qN = new URL(req.url, 'http://x').searchParams;
    /* ── LA TELECOMMANDE (panel-sessions.js) : POST JSON seulement — l identifiant de session est un secret au porteur, il ne voyage
     *   JAMAIS dans une URL (ni journal, ni referer). Le panneau garde le sien dans le fragment (#s=…), que le navigateur n envoie pas.
     *     /api/panel/ouvrir     { block? }                 -> { session, url }          (le panneau lui-meme, ou un agent)
     *     /api/panel/commande   { s, commande }            -> { n }                     (l agent PROPOSE)
     *     /api/panel/commandes  { s, depuis }              -> { commandes }             (le panneau lit)
     *     /api/panel/evenement  { s, evenement }           -> { m }                     (le panneau rend compte)
     *     /api/panel/etat       { s, depuis }              -> { evenements }            (l agent lit la suite) */
    if (chemin.startsWith('/api/panel/')) {
      if (req.method !== 'POST') { rendreN(405, { ok: false, pourquoi: 'POST only' }, { allow: 'POST, OPTIONS' }); return; }
      if (!budgetPanel(ipN)) { rendreN(429, { ok: false, pourquoi: 'too many panel requests from this address — slow down' }, { 'retry-after': '30' }); return; }
      let brutP = '', tropP = false;
      req.on('data', (c) => { if (tropP) return; brutP += c; if (brutP.length > 4096) { tropP = true; rendreN(413, { ok: false, pourquoi: 'request too large' }); req.destroy(); } });
      req.on('end', () => {
        if (tropP) return;
        let j;
        try { j = JSON.parse(brutP || '{}'); } catch { rendreN(400, { ok: false, pourquoi: 'not JSON' }); return; }
        if (!j || typeof j !== 'object' || Array.isArray(j)) { rendreN(400, { ok: false, pourquoi: 'a JSON object is expected' }); return; }
        const depuis = Number.isInteger(j.depuis) ? j.depuis : 0;
        let r;
        if (chemin === '/api/panel/ouvrir') r = ouvrirPanel(j.block === undefined || j.block === null || j.block === '' ? null : j.block);
        else if (chemin === '/api/panel/commande') r = registrePanel.pousser(j.s, j.commande);
        else if (chemin === '/api/panel/commandes') r = registrePanel.lireCommandes(j.s, depuis);
        else if (chemin === '/api/panel/evenement') r = registrePanel.noter(j.s, j.evenement);
        else if (chemin === '/api/panel/etat') r = registrePanel.lireEvenements(j.s, depuis);
        /* le cablage direct : le panneau publie l etat du cerveau du block affiche ; l agent le lit dans tblock_panel_state */
        else if (chemin === '/api/panel/cerveau') r = registrePanel.noterCerveau(j.s, j.cerveau);
        else { rendreN(404, { ok: false, pourquoi: 'unknown panel route' }); return; }
        rendreN(r.ok ? 200 : r.inconnue ? 404 : r.tropVite ? 429 : 400, r);
      });
      return;
    }
    if (chemin === '/api/naissance/paires') {
      if (req.method !== 'GET') { rendreN(405, { ok: false, pourquoi: 'GET only' }); return; }
      rendreN(200, pairesPourAgent());
      return;
    }
    if (chemin === '/api/naissance/plan') {
      if (req.method !== 'GET') { rendreN(405, { ok: false, pourquoi: 'GET only' }); return; }
      const d = { nom: String(qN.get('nom') || ''), symbole: String(qN.get('symbole') || ''), compte: String(qN.get('compte') || ''),
        paire: String(qN.get('paire') || 'ETH'), sel: String(qN.get('sel') || ''), boutique: qN.get('boutique') };
      if (!d.nom.trim() || !d.symbole.trim() || !/^0x[0-9a-f]{40}$/i.test(d.compte) || !/^(eth|0x[0-9a-f]{40})$/i.test(d.paire) || d.sel.length > 64) {
        rendreN(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/naissance/plan?nom=<block name>&symbole=<ticker>&compte=<the wallet that will sign>'
          + '[&paire=<ETH or a currency address from /api/naissance/paires>][&sel=<free text that fixes the address>]' });
        return;
      }
      if (!prendreBudgetPlan(ipN)) { naissanceCompteurs.trop += 1; occupe(); return; }
      faireNaissance(d, { sonde: sondeN }).then((r) => rendreN(200, r))
        .catch((e) => rendreN(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) }))
        .finally(() => { railsEnVol -= 1; });
      return;
    }
    if (chemin === '/api/caution') {
      if (req.method !== 'GET') { rendreN(405, { ok: false, pourquoi: 'GET only' }); return; }
      const d = { block: String(qN.get('block') || ''), pair: String(qN.get('paire') || 'ETH'), account: String(qN.get('compte') || '') };
      if (!/^0x[0-9a-f]{40}$/i.test(d.block) || !/^(eth|0x[0-9a-f]{40})$/i.test(d.pair) || (d.account && !/^0x[0-9a-f]{40}$/i.test(d.account))) {
        rendreN(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/caution?block=<block address>[&paire=<ETH or the paired currency address>][&compte=<the creator wallet>]' });
        return;
      }
      if (!prendreBudgetPlan(ipN)) { naissanceCompteurs.trop += 1; occupe(); return; }
      faireCaution(d).then((r) => rendreN(200, r))
        .catch((e) => rendreN(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) }))
        .finally(() => { railsEnVol -= 1; });
      return;
    }
    /* ── /mcp ── */
    if (req.method === 'GET') { rendreN(405, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'this MCP server answers POST only (no event stream)' } }, { allow: 'POST, OPTIONS' }); return; }
    if (req.method !== 'POST') { rendreN(405, { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'POST only' } }, { allow: 'POST, OPTIONS' }); return; }
    let brutM = '', tropM = false;
    req.on('data', (c) => { if (tropM) return; brutM += c; if (brutM.length > 16 * 1024) { tropM = true; rendreN(413, { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'request too large' } }); req.destroy(); } });
    req.on('end', async () => {
      if (tropM) return;
      let msg;
      try { msg = JSON.parse(brutM); } catch { rendreN(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); return; }
      naissanceCompteurs.mcp += 1;
      /* chaque outil qui lit la chaine prend le budget des plans ; il le REND dans son finally */
      const avecBudget = (f) => async (a) => {
        if (!prendreBudgetPlan(ipN)) { naissanceCompteurs.trop += 1; const e = new Error('busy'); e.occupe = true; throw e; }
        try { return await f(a); } finally { railsEnVol -= 1; }
      };
      try {
        const rep = await traiterMcp(msg, { version: buildServi(), widget: () => widgetHtml, outils: {
          tblock_pairs: async () => pairesPourAgent(),
          tblock_plan_birth: avecBudget((a) => faireNaissance({ nom: a.name, symbole: a.symbol, compte: a.account, paire: a.pair || 'ETH', sel: a.salt || '', boutique: a.shopifyStore || null }, { sonde: sondeN })),
          tblock_plan_swap: avecBudget((a) => faireRail({ de: a.from, vers: a.to, montant: a.amount, compte: a.account })),
          tblock_creator_minimum: avecBudget((a) => faireCaution({ block: a.block, pair: a.pair || 'ETH', account: a.account || '' })),
          /* la telecommande : des PROPOSITIONS pour un panneau ouvert par l humain — aucune lecture de chaine, aucun envoi */
          tblock_panel_open: async (a) => { const r = ouvrirPanel(a.block || null); return r.ok ? { ...r, etat: 'PRET' } : { ...r, etat: 'REFUSE' }; },
          tblock_command: async (a) => {
            const { session, ...commande } = a;
            const r = registrePanel.pousser(session, commande);
            return r.ok ? { ok: true, etat: 'PRET', n: r.n, commande: r.commande, panneauOuvert: r.panneauOuvert,
              suite: r.panneauOuvert ? 'shown in the panel; read tblock_panel_state for the brain verdict and what the user signs'
                : 'queued, but no panel is open on this session right now — ask the user to open the link from tblock_panel_open' }
              : { ok: false, etat: 'REFUSE', pourquoi: r.pourquoi };
          },
          tblock_panel_state: async (a) => { const r = registrePanel.lireEvenements(a.session, a.since ? Number(a.since) : 0); return r.ok ? { ...r, etat: 'PRET' } : { ...r, etat: 'REFUSE' }; },
          /* ── LE GAME (2026-10-18, jeu-agent.js) : lecture seule, appels NON SIGNES ; sans contrat servi -> REFUSE, aucun appel ── */
          tblock_game_state: async (a) => {
            const t = corpsTirage();
            let pot = null;
            if (t.rolls && t.rolls.contrat) { try { pot = lireUintRolls(await rpcRails('eth_call', [{ to: t.rolls.contrat, data: appelPotRolls() }, 'latest'])); } catch (_) { pot = null; } }
            return etatJeuAgent({ tirage: t, wallet: a.wallet || null, rollsRecents: jeuRolls.slice(-10), pot });
          },
          tblock_plan_roll: avecBudget((a) => planRollAgent({ rpc: rpcRails, contrat: corpsTirage().rolls.contrat, usdc: USDC_BASE, wallet: a.wallet, guess: a.guess ? lireGuessAgent(a.guess) : null,
            rolls: a.rolls || '1', jourId: jourDe(Date.now()).id, rollPrice: BigInt((BLOCKROLLS_DEPLOIEMENT.constructeur || {}).rollPrice || 0), passRolls: Number((BLOCKROLLS_DEPLOIEMENT.constructeur || {}).passRolls || 0) })),
          tblock_plan_settle: avecBudget((a) => planSettleAgent({ rpc: rpcRails, contrat: corpsTirage().rolls.contrat, rollIds: a.rollIds })),
          tblock_plan_task: avecBudget(async (a) => planTaskAgent({ contrat: MISSIONS_DEPLOIEMENT.adresse, block: a.block, reward: a.reward, maxDone: a.maxDone, hold: a.hold,
            cles: MISSIONS_DEPLOIEMENT.adresse ? await clesRails(a.block) : [], poolManager: V4_ADRESSES[8453].poolm })),
          tblock_missions: async () => {
            if (!MISSIONS_DEPLOIEMENT.adresse) return { ok: false, etat: 'REFUSE', tableau: 'PAS_OUVERT', pourquoi: 'the mission board is coming soon' };
            try { const r = await lireMissions({ rpc: rpcServeur, contrat: MISSIONS_DEPLOIEMENT.adresse }); return { ok: true, etat: 'PRET', contrat: MISSIONS_DEPLOIEMENT.adresse, ...r }; }
            catch (_) { return { ok: false, etat: 'NON_MESURE', pourquoi: 'the mission board could not be read just now' }; }
          },
        } });
        if (rep === null) { res.writeHead(202, cors); res.end(); return; }
        rendreN(200, rep);
      } catch (e) {
        rendreN(200, { jsonrpc: '2.0', id: (msg && msg.id) === undefined ? null : msg.id, error: { code: -32603, message: 'internal error' } });
      }
    });
    return;
  }

  /* ══ NOS RAILS, EXPOSES : /api/rails/plan?de=&vers=&montant=&compte= (2026-10-03) ═══════════════════════════════════
   * ⛔ RIEN N EST SIGNE ICI : la reponse porte des appels NON SIGNES, construits par les planificateurs de l app. Le wallet
   *   de l agent les signe, dans l ordre de `aSigner`. Le budget ne se compte qu AU MOMENT DU RESEAU. */
  /* 2026-10-27 — la mesure servie des stables 'aero-new' (stables-neuve.js), pour la carte du Wallet : lecture de la Map, aucun reseau */
  if (chemin === '/api/stables-neuve') {
    const lignes = [...STABLES_NEUVE].map(([adr, s]) => {
      const r = stablesNeuve.get(adr);
      const frais = !!(r && Number.isFinite(r.t) && Date.now() - r.t <= STABLE_NEUVE_MAX_MS);
      return { adr, symbole: s.symbole, frais, t: r ? r.t : null, bloc: r ? r.bloc : null, verdict: r ? r.v : null };
    });
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify({ ok: true, maxAgeMs: STABLE_NEUVE_MAX_MS, stables: lignes }));
    return;
  }
  /* game343 CREATE-ONE-PATH: GET /api/naissance/etat?compte=0x…&bloc=0x…[&part=<TBLOCK wei>] — where a birth stands, read on chain
   *   (etat-naissance.js), with step 3 from coffre-paye.js (a TBLOCK transfer from this wallet to the vault after the block existed,
   *   checked against its transaction). On the keyed node first, then RPC_LIST. Cached 15 s per (wallet, block, part); 20 per IP per min. */
  if (chemin === '/api/naissance/etat') {
    const rendreE = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps, (k, v) => (typeof v === 'bigint' ? v.toString() : v))); };
    if (req.method !== 'GET') { rendreE(405, { etat: 'REFUSE', pourquoi: 'GET only' }); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    const compteE = String(q.get('compte') || '').toLowerCase(), blocE = String(q.get('bloc') || '').toLowerCase(), partE = String(q.get('part') || '');
    if (!/^0x[0-9a-f]{40}$/.test(compteE) || !/^0x[0-9a-f]{40}$/.test(blocE) || (partE && !/^[0-9]{1,40}$/.test(partE))) {
      rendreE(400, { etat: 'REFUSE', pourquoi: 'usage: /api/naissance/etat?compte=<wallet>&bloc=<block address>[&part=<TBLOCK wei of the vault step>]' }); return;
    }
    const cleE = compteE + '|' + blocE + '|' + partE, enC = NAISS_ETAT.cache.get(cleE);
    if (enC && Date.now() - enC.t < 15000) { rendreE(200, { ...enC.corps, depuisCache: true }); return; }
    const ipE = ipClient(req), minE = Math.floor(Date.now() / 60000);
    if (NAISS_ETAT.minute !== minE) { NAISS_ETAT.minute = minE; NAISS_ETAT.parIp.clear(); }
    const nE = (NAISS_ETAT.parIp.get(ipE) || 0) + 1;
    if (nE > 20) { rendreE(429, { etat: 'NON_MESURE', pourquoi: 'busy: retry in a minute' }); return; }
    NAISS_ETAT.parIp.set(ipE, nE);
    const rpcE = async (methode, params) => {
      let derniere = 'no node answered';
      for (const url of [...(RELAIS_CLE ? [RELAIS_CLE] : []), ...RPC_LIST]) {
        try {
          const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: methode, params }), signal: AbortSignal.timeout(12000) });
          compterEnvoi(url, r.status === 429 ? 'limite' : (r.ok ? 'ok' : 'erreur'));
          if (!r.ok) { derniere = 'HTTP ' + r.status; continue; }
          const j = await r.json();
          if (j && j.error) { if (/rate limit|too many|request limit/i.test(String(j.error.message))) { derniere = 'rate limited'; continue; } throw new Error(String(j.error.message)); }
          return j.result;
        } catch (e) { if (/execution reverted/i.test(String(e && e.message))) throw e; derniere = String((e && e.message) || e).slice(0, 80); }
      }
      throw new Error(derniere);
    };
    (async () => {
      /* task 377 (2026-11-12): the TBLOCK part now goes to the LIVE holders vault (create-vault-tip.js VAULT = EP_PACK.VAULT). Read it first;
       * only a whole "not paid" there reads the first vault too (a birth paid before the switch). An unread answer stops the loop: never "unpaid". */
      const coffres = [EP_PACK.VAULT, ECONOMIE_DEPLOIEMENT.adresseVault].filter(Boolean).map((a) => String(a).toLowerCase());
      let cp = { etat: 'NON_MESURE', pourquoi: 'no vault' };
      for (const coffre of coffres) { cp = await lireCoffrePaye({ rpc: rpcE, compte: compteE, bloc: blocE, coffre, tblock: TBLOCK_ADR }); if (cp.etat !== 'LU' || cp.paye === true) break; }
      const coffrePaye = cp.etat === 'LU' ? cp.paye === true : null;
      const r = await lireEtatNaissance({ rpc: rpcE, compte: compteE, bloc: blocE, partTblock: partE ? BigInt(partE) : null, coffrePaye });
      const corps = { ...r, coffre: cp };
      if (r.etat === 'LU') { NAISS_ETAT.cache.set(cleE, { t: Date.now(), corps }); if (NAISS_ETAT.cache.size > 500) NAISS_ETAT.cache.delete(NAISS_ETAT.cache.keys().next().value); }
      rendreE(200, corps);
    })().catch((e) => rendreE(200, { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 140) }));
    return;
  }
  /* game341 (live test 2026-11-10): POST /api/rpc { method, params } — the page's LAST resort when every public node refused (429).
   *   Reads only (relais-rpc.js validerRelais); node = BASE_RPC_RELAIS if set, else the keyed archive node (CDP), then RPC_LIST.
   *   Budgets: per IP 60 / min, and RELAIS_MAX_JOUR keyed calls per UTC day (20,000 by default, its own counter, apart from the archive's).
   *   A node's JSON-RPC error (a revert) is returned as is, with its data: the page must see a revert as a revert, never as an outage. */
  if (chemin === '/api/points') {
    const rendreP = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps, (k, v) => (typeof v === 'bigint' ? v.toString() : v))); };
    if (req.method !== 'GET') { rendreP(405, { ok: false, pourquoi: 'GET only' }); return; }
    const compteP = String(new URL(req.url, 'http://x').searchParams.get('compte') || '').toLowerCase();
    if (compteP && !/^0x[0-9a-f]{40}$/.test(compteP)) { rendreP(400, { ok: false, pourquoi: 'usage: /api/points[?compte=<wallet>]' }); return; }
    const ipP = ipClient(req), minP = Math.floor(Date.now() / 60000);
    if (POINTS.minute !== minP) { POINTS.minute = minP; POINTS.parIp.clear(); }
    const nP = (POINTS.parIp.get(ipP) || 0) + 1;
    if (nP > 60) { rendreP(429, { ok: false, pourquoi: 'busy: retry in a minute' }); return; }
    POINTS.parIp.set(ipP, nP);
    if (!POINTS.index || !COEURS.index) { rendreP(200, { ok: false, pourquoi: 'the lock and the hearts are coming soon' }); return; }
    const lockOk = POINTS.index.complet(), coeursOk = COEURS.index.complet();
    const evs = POINTS.index.recs().filter((r) => r.t !== undefined);
    const tab = tableauPoints({ evenementsLock: evs, coeurs: COEURS.index.coeurs(), maintenant: Math.floor(Date.now() / 1000) });
    const inv = blocksDuCreateur();
    const corps = {
      ok: true, complet: lockOk && coeursOk,
      lock: { complet: lockOk, lusJusqua: POINTS.index.etat.prochain - 1, trou: POINTS.index.etat.trou, sansTemps: POINTS.index.etat.sansTemps, evenements: evs.length },
      coeurs: { complet: coeursOk },
      /* game359: rule v2 (points.js); the old text said points share what the vault received — false (the vault pays by hearts) */
      regle: 'v2: lock points per day = TBLOCK locked / 100,000 x commitment multiplier (x1 under 30 days, x1.25 from 30, x1.5 from 90, x1.75 from 180, x2 from 365 days; set at the last Locked/Extended) while the lock is active; hearts: 1 point per ' + (TBLOCK_PAR_POINT_JEU / 10n ** 18n).toLocaleString('en-US') + ' TBLOCK burned (a heart earns what it burns, at the hearts contract price, which moves with TBLOCK). Points decide a share of a separate community drop, not live; no rate is promised.',
      board: tab.lignes.slice(0, 20).map((x) => ({ ...x, sesBlocks: (inv.get(x.holder) || []).slice(0, 3) })),
      somme: tab.somme,
    };
    if (compteP) corps.compte = tab.lignes.find((x) => x.holder === compteP) || { holder: compteP, lock: 0, jeu: 0, total: 0, rang: null, part: 0 };
    rendreP(200, corps);
    return;
  }
  if (chemin === '/api/coeurs') {
    const rendreC = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps, (k, v) => (typeof v === 'bigint' ? v.toString() : v))); };
    if (req.method !== 'GET') { rendreC(405, { ok: false, pourquoi: 'GET only' }); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    const compteC = String(q.get('compte') || '').toLowerCase(), blocC = String(q.get('bloc') || '').toLowerCase();
    if ((compteC && !/^0x[0-9a-f]{40}$/.test(compteC)) || (blocC && !/^0x[0-9a-f]{40}$/.test(blocC))) { rendreC(400, { ok: false, pourquoi: 'usage: /api/coeurs[?compte=<wallet>][&bloc=<block>]' }); return; }
    const ipC = ipClient(req), minC = Math.floor(Date.now() / 60000);
    if (COEURS.minute !== minC) { COEURS.minute = minC; COEURS.parIp.clear(); }
    const nC = (COEURS.parIp.get(ipC) || 0) + 1;
    if (nC > 60) { rendreC(429, { ok: false, pourquoi: 'busy: retry in a minute' }); return; }
    COEURS.parIp.set(ipC, nC);
    if (!COEURS.index) { rendreC(200, { ok: false, pourquoi: 'hearts are coming soon' }); return; }
    const ix = COEURS.index, tous = ix.coeurs(), inv = blocksDuCreateur();
    const crDe = (b) => createurParBlock.get(b) || null;
    const sesBlocks = (a) => (inv.get(a) || []).slice(0, 3);
    let likes = 0n, burned = 0n; for (const c of tous) { likes += c.likes; burned += c.burned; }
    const corps = {
      ok: true, complet: ix.complet(), lusJusqua: ix.etat.prochain - 1, tete: ix.etat.tete, trou: ix.etat.trou, depuis: LIKES_DEPLOY_BLOC, contrats: ix.contrats(),
      total: { coeurs: likes, burned, donneurs: new Set(tous.map((c) => c.liker)).size },
      board: classement(tous, 10).map((e) => ({ ...e, sesBlocks: sesBlocks(e.liker) })),
      /* game359 (Phil: "montre à combien de joueurs"): per week, the distinct wallets that gave a heart and the TBLOCK burned */
      semaines: joueursParSemaine(tous),
      /* 2026-11-12: the same, per hearts contract (the live vault counts only the hearts given on Hearts) */
      semainesParContrat: Object.fromEntries(ix.contrats().map((k) => [k.adresse, joueursParSemaine(tous.filter((c) => c.contrat === k.adresse))])),
      /* game378: the latest hearts given on Hearts, for the Live feed; signePar = tx.from of the checked receipt, null until it is read */
      fil: COEURS.signataires && EP_PACK.HEARTS ? coeursPourLeFil(tous, COEURS.signataires.de, { contrat: EP_PACK.HEARTS }) : [],
    };
    if (compteC) {
      const v = vueCompte(tous, compteC, crDe);
      corps.compte = { ...v, recus: { ...v.recus, de: v.recus.de.slice(0, 20).map((d) => ({ ...d, sesBlocks: sesBlocks(d.liker) })) }, donnes: { ...v.donnes, vers: v.donnes.vers.slice(0, 20) }, sesBlocks: sesBlocks(compteC) };
    }
    if (blocC) {
      const par = new Map(); let n = 0n;
      for (const c of tous) if (c.bloc === blocC) { n += c.likes; par.set(c.liker, (par.get(c.liker) || 0n) + c.likes); }
      corps.bloc = { adr: blocC, likes: n, createur: crDe(blocC), signaux: [...par.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).slice(0, 8).map(([liker, k]) => ({ liker, likes: k, sesBlocks: sesBlocks(liker) })) };
    }
    /* the blocks named in this answer, with the symbol the server already knows (its births, then the trending list); unknown = absent */
    const adrsC = new Set();
    for (const e of corps.board) for (const b of e.sesBlocks) adrsC.add(b);
    if (corps.compte) { for (const d of corps.compte.recus.de) for (const b of d.sesBlocks) adrsC.add(b); for (const v of corps.compte.donnes.vers) adrsC.add(v.bloc); for (const b of corps.compte.sesBlocks) adrsC.add(b); }
    if (corps.bloc) for (const s of corps.bloc.signaux) for (const b of s.sesBlocks) adrsC.add(b);
    for (const c of corps.fil) adrsC.add(c.bloc);
    const trendC = new Map((lignesNomsTrending.lignes || []).map((l) => [String(l.adr || '').toLowerCase(), l.sym]));
    corps.symboles = {};
    for (const b of adrsC) { const f = faitsCreation.get(b); const s = (f && f.symbole) || trendC.get(b); if (s) corps.symboles[b] = String(s).slice(0, 16); }
    rendreC(200, corps);
    return;
  }
  if (chemin === '/api/rpc') {
    const rendreP = (code, corps, extra = {}) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(JSON.stringify(corps)); };
    if (req.method !== 'POST') { rendreP(405, { error: { message: 'POST only' } }); return; }
    const ipP = ipClient(req), minuteP = Math.floor(Date.now() / 60000), jourP = new Date().toISOString().slice(0, 10);
    if (RELAIS.minute !== minuteP) { RELAIS.minute = minuteP; RELAIS.parIp.clear(); }
    if (RELAIS.jour !== jourP) { RELAIS.jour = jourP; RELAIS.cles = 0; }
    const nIpP = (RELAIS.parIp.get(ipP) || 0) + 1;
    if (nIpP > 60) { rendreP(429, { error: { message: 'relay busy for this address: retry in a minute' } }, { 'retry-after': '60' }); return; }
    RELAIS.parIp.set(ipP, nIpP);
    lireCorpsMouche(req, RELAIS_CORPS_MAX).then(async (b) => {
      const v = validerRelais(b);
      if (!v.ok) { RELAIS.refus++; rendreP(400, { error: { message: v.why } }); return; }
      const cle = RELAIS_CLE && RELAIS.cles < RELAIS_MAX_JOUR ? [RELAIS_CLE] : [];
      let derniere = 'no node answered';
      for (const url of [...cle, ...RPC_LIST]) {
        try {
          if (url === RELAIS_CLE) RELAIS.cles++;
          const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: b.method, params: b.params }), signal: AbortSignal.timeout(12000) });
          compterEnvoi(url, r.status === 429 ? 'limite' : (r.ok ? 'ok' : 'erreur'));
          if (r.status === 429) { derniere = 'rate limited'; continue; }
          if (!r.ok) { derniere = 'HTTP ' + r.status; continue; }
          const j = await r.json();
          if (j && j.error && /rate limit|too many requests|usage limit|request limit/i.test(String(j.error.message))) { derniere = 'rate limited'; continue; }
          RELAIS.servis++;
          if (j && j.error) { rendreP(200, { error: { message: String(j.error.message || 'error'), data: j.error.data, revert: true } }); return; }
          rendreP(200, { result: j ? j.result : null }); return;
        } catch (e) { compterEnvoi(url, 'reseau'); derniere = String((e && e.message) || e).slice(0, 80); }
      }
      RELAIS.echecs++;
      rendreP(503, { error: { message: 'every node refused just now (' + derniere + ')' + (RELAIS_CLE && RELAIS.cles >= RELAIS_MAX_JOUR ? '; the keyed node budget of the day is spent' : '') } }, { 'retry-after': '10' });
    }).catch((e) => rendreP(400, { error: { message: String((e && e.message) || e).slice(0, 80) } }));
    return;
  }
  /* game337 (Phil 2026-11-10): GET /api/tblock/vault-buy?compte=0x…&eth=<wei> — the TBLOCK part of a birth bought with ETH, sent to the
   *   holders vault in the same batch (tblock-route.js planAchatPourCoffre: no app fee, whole batch simulated from the account).
   *   Same per-minute budget as /api/rails/plan; the vault address comes from the deployment file, never from the request. */
  if (chemin === '/api/tblock/vault-buy') {
    const rendreV = (code, corps, extra = {}) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
      res.end(JSON.stringify(corps, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    };
    if (req.method !== 'GET') { rendreV(405, { ok: false, pourquoi: 'GET only' }); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    const compteV = String(q.get('compte') || '').toLowerCase(), ethV = String(q.get('eth') || '');
    /* game339: reprise=1&wt=<raw wtCOIN> resumes an interrupted step 1 from the wtCOIN already in the wallet (leg 2 only) */
    const repriseV = q.get('reprise') === '1', wtV = String(q.get('wt') || '');
    const coffreV = EP_PACK.VAULT; /* task 377: the live holders vault, the same one create-vault-tip.js pays (never from the request) */
    if (!coffreV) { rendreV(200, { ok: false, etat: 'REFUSE', pourquoi: 'the holders vault is coming soon' }); return; }
    if (repriseV && (!/^0x[0-9a-f]{40}$/.test(compteV) || !/^[1-9][0-9]{0,30}$/.test(wtV))) {
      rendreV(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/tblock/vault-buy?reprise=1&compte=<the wallet that will sign>&wt=<raw wtCOIN to resume from>' }); return;
    }
    if (!repriseV && (!/^0x[0-9a-f]{40}$/.test(compteV) || !/^[1-9][0-9]{0,20}$/.test(ethV) || BigInt(ethV) > 10n ** 17n)) {
      rendreV(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/tblock/vault-buy?compte=<the wallet that will sign>&eth=<wei, at most 0.1 ETH>' }); return;
    }
    const ipV = ipClient(req), minuteV = Math.floor(Date.now() / 60000);
    if (railsBudget.minute !== minuteV) { railsBudget.minute = minuteV; railsBudget.n = 0; railsBudget.parIp.clear(); }
    const nIpV = (railsBudget.parIp.get(ipV) || 0) + 1;
    if (nIpV > RAILS_IP_MINUTE || railsBudget.n >= RAILS_MINUTE || railsEnVol >= RAILS_EN_VOL_MAX) {
      rendreV(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'busy: retry in a minute' }, { 'retry-after': '60' }); return;
    }
    railsBudget.parIp.set(ipV, nIpV); railsBudget.n += 1; railsEnVol += 1;
    /* garder=1 (game338): step 1 of a birth, the TBLOCK bought stays in the buyer's wallet; it pays the vault at step 3 */
    (repriseV ? planWtcoinVersTblock({ rpc: rpcNaissance, compte: compteV, montant: BigInt(wtV) })
      : planAchatPourCoffre({ rpc: rpcNaissance, compte: compteV, montantEth: BigInt(ethV), coffre: coffreV, garder: q.get('garder') === '1' }))
      .then((r) => rendreV(200, { ok: r.etat === 'PRET', ...r }))
      .catch((e) => rendreV(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 160) }))
      .finally(() => { railsEnVol -= 1; });
    return;
  }
  /* 2026-11-12 (the economy pack is live): the FRESH quote the page turns into the payment router's minimum (quote x 0.99), for the USDC
   *   the router swaps after the game's own dev cut. Read only (two pool reads, two quotes); never cached; same budget as the rails. */
  if (chemin === '/api/tblock/devis-routeur') {
    const rendreQ = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps, (k, v) => (typeof v === 'bigint' ? v.toString() : v))); };
    if (req.method !== 'GET') { rendreQ(405, { ok: false, pourquoi: 'GET only' }); return; }
    const mQ = String(new URL(req.url, 'http://x').searchParams.get('montant') || '');
    if (!/^[1-9][0-9]{0,8}$/.test(mQ) || BigInt(mQ) > 50000000n) { rendreQ(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/tblock/devis-routeur?montant=<raw USDC, at most 50 USDC>' }); return; }
    const ipQ = ipClient(req), minuteQ = Math.floor(Date.now() / 60000);
    if (railsBudget.minute !== minuteQ) { railsBudget.minute = minuteQ; railsBudget.n = 0; railsBudget.parIp.clear(); }
    const nIpQ = (railsBudget.parIp.get(ipQ) || 0) + 1;
    if (nIpQ > RAILS_IP_MINUTE || railsBudget.n >= RAILS_MINUTE || railsEnVol >= RAILS_EN_VOL_MAX) { rendreQ(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'busy: retry in a minute' }); return; }
    railsBudget.parIp.set(ipQ, nIpQ); railsBudget.n += 1; railsEnVol += 1;
    devisUsdcVersTblock({ rpc: rpcRails, montant: BigInt(mQ) })
      .then((r) => rendreQ(200, { ok: r.etat === 'OK', montant: mQ, ...r }))
      .catch((e) => rendreQ(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 160) }))
      .finally(() => { railsEnVol -= 1; });
    return;
  }
  if (chemin === '/api/rails/plan') {
    const rendreR = (code, corps, extra = {}) => {
      res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
        'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', ...extra });
      res.end(JSON.stringify(corps));
    };
    if (req.method !== 'GET') { rendreR(405, { ok: false, pourquoi: 'GET only' }); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    const demande = { de: String(q.get('de') || ''), vers: String(q.get('vers') || ''),
      montant: String(q.get('montant') || ''), compte: String(q.get('compte') || '') };
    if (![demande.de, demande.vers].every((x) => /^(eth|0x[0-9a-f]{40})$/i.test(x))
      || !/^0x[0-9a-f]{40}$/i.test(demande.compte) || !/^[1-9][0-9]{0,40}$/.test(demande.montant)) {
      rendreR(400, { ok: false, etat: 'REFUSE', pourquoi: 'usage: /api/rails/plan?de=<token address or ETH>&vers=<token address or ETH>'
        + '&montant=<integer, raw units of the token paid>&compte=<the wallet that will sign>' });
      return;
    }
    const sonde = req.headers['x-ms-monitor'] === '1';
    /* game323: mouche=1 -> the fly's USDC <-> stock trade without the interface fee (rails-api.js); part of the cache key, so a plan with
     *   a fee is never served to the fly and a fee-free plan never to anyone who did not ask */
    demande.mouche = q.get('mouche') === '1';
    const cleR = [demande.de, demande.vers, demande.montant, demande.compte, demande.mouche ? 'mouche' : ''].join('|').toLowerCase();
    const enCache = railsCache.get(cleR);
    if (enCache && Date.now() - enCache.t < RAILS_CACHE_MS) { GARDE_MOUCHE.remember(enCache.corps); rendreR(200, { ...enCache.corps, depuisCache: true }); return; }
    const ipR = ipClient(req);
    const minuteR = Math.floor(Date.now() / 60000);
    if (railsBudget.minute !== minuteR) { railsBudget.minute = minuteR; railsBudget.n = 0; railsBudget.parIp.clear(); }
    const nIp = (railsBudget.parIp.get(ipR) || 0) + 1;
    if (nIp > RAILS_IP_MINUTE || railsBudget.n >= RAILS_MINUTE || railsEnVol >= RAILS_EN_VOL_MAX) {
      railsCompteurs.trop += 1;
      rendreR(429, { ok: false, etat: 'NON_MESURE', pourquoi: 'busy: each plan reads the chain on a node shared with the whole site — retry in a minute' },
        { 'retry-after': '60' });
      return;
    }
    railsBudget.parIp.set(ipR, nIp);
    railsBudget.n += 1;
    railsEnVol += 1;
    if (sonde) railsCompteurs.sondes += 1; else railsCompteurs.plans += 1;
    /* ⛔⛔ R10 (pool-sans-hook.js) : un B20 hors de nos sources TB n est libere que si ces sources sont LUES — dans CE processus,
     *   l etat module d index-routeur.js n est charge par personne (c est le client qui l appelle). Le serveur juge donc ses
     *   PROPRES corps, exactement comme le client les jugerait (meme chargeur, meme fraicheur) : index incomplet ou tete
     *   figee = sources non lues = tout B20 inconnu reste un block (fail-closed), et la reponse le DIT. */
    try { chargerIndexRouteur(JSON.parse(blocksRouteurCorps())); chargerNosBlocksTb(JSON.parse(nosBlocksCorps())); } catch (_) { /* sources non lues : fail-closed */ }
    /* game327: estHolderTblock = the proof-of-hold rule ($15 of TBLOCK, lower of now and ~10 min ago) on the paying wallet */
    const estHolderTblock = async (w) => { try { return (await tbHoldOf(w)).ok === true; } catch (_) { return false; } };
    planRail(demande, { rpc: rpcNaissance, estHolderTblock, clesDe: clesRails, chaine: 8453, reference: lireReferenceServeur, venueAction: venueActionServie, venueStable: venueStableServie }).then((r) => { /* rpcNaissance : voir faireRail */
      if (!sourcesTbLues() && r.etat === 'REFUSE') r.sourcesTb = 'not read on the server: router index or our-blocks list incomplete or stale — a block born elsewhere is refused until they are';
      if (!sonde) {
        if (r.etat === 'PRET') railsCompteurs.prets += 1;
        else if (r.etat === 'APPROBATIONS') railsCompteurs.approbations += 1;
        else if (r.etat === 'REFUSE') railsCompteurs.refus += 1;
        else railsCompteurs.nonMesures += 1;
      }
      if (r.etat === 'PRET') {
        railsCache.set(cleR, { t: Date.now(), corps: r });
        while (railsCache.size > 200) railsCache.delete(railsCache.keys().next().value);
      }
      GARDE_MOUCHE.remember(r);
      rendreR(200, r);
    }).catch((e) => {
      rendreR(200, { ok: false, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) });
    }).finally(() => { railsEnVol -= 1; });
    return;
  }

  /* ══ LE RAIL FIAT -> BASE (Phil, 2026-09-23 : « la raison est le bridge fiat to block ») ═══════
   * ⛔⛔ CETTE ROUTE NE RENVOIE RIEN DE FAUX. Sans cle CDP dans l environnement, elle repond
   *     `pret:false` avec le NOM de la variable manquante, et AUCUNE url. Le client retombe alors
   *     sur le lien public — un lien honnete qui ne pretend pas connaitre la destination.
   * ⛔ LE SECRET N ARRIVE JAMAIS ICI : il est lu par `cdp-jwt.js`, qui rend un jeton signe. Aucune
   *   reponse de cette route, y compris ses erreurs, ne peut le contenir.
   * ⚠️ NON EXERCE EN PRODUCTION : aucune cle n existe au moment ou j ecris ceci. Le chemin « OK »
   *   n a jamais tourne contre le vrai Coinbase. Personne ne doit lire cette route comme un revenu.
   * ⚠️ `GET` EXPRES, ET SANS DONNEE PERSONNELLE EN PARAMETRE : seule une adresse publique de wallet
   *   et un montant transitent. Rien d identifiant ne doit jamais entrer dans une query string. */
  /* ── ⛔⛔ CE QUE COINBASE SAIT VENDRE — LA QUESTION QU ON NE POUVAIT PAS POSER ────────────────
   *     Phil, 2026-09-27 : « le rail doit se faire fiat onramp Coinbase puis Block tokenise OU
   *     ACTION TOKENISEE direct ». Trois chemins avaient echoue avant celui-ci : la page d achat
   *     exige une connexion au compte Coinbase (refusee), `buy/options` rend 401 sans JWT, et
   *     `pay.coinbase.com/api/v1/buy/options` exige un app-id absent du depot.
   *     Ce serveur, lui, sait deja fabriquer le JWT — c est le meme signeur que pour la session.
   *   ⚠️ LECTURE SEULE, AUCUNE DONNEE PERSONNELLE : un code pays sur deux lettres, rien d autre.
   *     Aucun wallet, aucun montant, aucun identifiant ne transite.
   *   ⛔ LE JWT SIGNE `GET + hote + CHEMIN` SANS LA QUERY : mettre `?country=` dans la chaine
   *     signee rendrait un 401 que rien n expliquerait. Le chemin vient d une constante PARTAGEE
   *     avec le module qui appelle, pour que les deux ne puissent pas diverger. */
  if (chemin === '/api/onramp/options') {
    const q = new URL(req.url, 'http://x').searchParams;
    const etatO = etatCdp(process.env);
    if (!etatO.pret) {
      /* ⛔ 200 ET PAS 500, comme la route soeur : une capacite absente n est pas une panne. */
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: etatO.pourquoi }));
      return;
    }
    const signeO = signerJwtCdp({ cleId: process.env[etatO.cle], secretPem: process.env[etatO.secret],
      methode: 'GET', hote: 'api.developer.coinbase.com', chemin: CHEMIN_OPTIONS_ACHAT });
    if (signeO.etat !== 'OK') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: signeO.pourquoi }));
      return;
    }
    /* ⛔ Le JWT passe par un champ prive, JAMAIS par le vrai `process.env` — meme regle que la
     *   route de session : rien de ce qui sert a signer ne devient une variable globale. */
    lireOptionsAchat({ env: { [etatO.cle]: '1', [etatO.secret]: '1', __CDP_JWT: signeO.jwt },
      pays: q.get('pays') || 'US', subdivision: q.get('sub') })
      .then((r) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        /* ⛔ 2026-10-25 : `court=1` (le panneau Buy) ne veut que les moyens de paiement du pays — pas 400 actifs
         *   (~25 Ko par pays mesures) a chaque ouverture de fiche. Le compte `n` reste, la liste part seulement. */
        /* ⛔ 2026-10-26 : le corps est bati par `corpsReponseOptions` (onramp-session.js), qu un banc EXECUTE avec et sans
         *   `court` — ici il n avait aucun lecteur. Les deux listes (actifs, fiats) et les moyens y voyagent tels que lus :
         *   null = non lu, jamais « aucun ».
         * ⛔⛔ (garde du 2026-10-25) CE COMMENTAIRE AVAIT ETE REECRIT PARCE QU IL AVAIT D ABORD ETE INJECTE PAR UNE CHAINE
         *     SHELL : bash a interprete les accents graves comme une substitution de commande et a MANGE deux mots. Toute
         *     edition passe par Write/Edit, jamais par une chaine shell. La regle existe pour ca. */
        res.end(JSON.stringify(corpsReponseOptions(r, { court: q.get('court') === '1' })));
      })
      .catch((e) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, pret: true, etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 120) }));
      });
    return;
  }
  if (chemin === '/api/onramp/session') {
    const q = new URL(req.url, 'http://x').searchParams;
    const demande = validerDemande({ adresse: q.get('adresse'), actif: q.get('actif'),
      montantFiat: q.get('montant'), retourBlock: q.get('block') });
    if (demande.etat !== 'OK') {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: demande.pourquoi }));
      return;
    }
    const etat = etatCdp(process.env);
    if (!etat.pret) {
      /* ⛔ 200 ET PAS 500 : ce n est pas une panne, c est une capacite absente. Un 500 ferait
       *   chercher un bug la ou il n y a qu une variable a poser. Le client lit `pret:false`. */
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: etat.pourquoi }));
      return;
    }
    const HOTE = 'api.developer.coinbase.com', CHEMIN_CDP = '/onramp/v1/token';
    const signe = signerJwtCdp({ cleId: process.env[etat.cle], secretPem: process.env[etat.secret],
      methode: 'POST', hote: HOTE, chemin: CHEMIN_CDP });
    if (signe.etat !== 'OK') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pret: false, pourquoi: signe.pourquoi }));
      return;
    }
    /* ⛔ Le JWT signe est passe par un champ prive de l objet d environnement transmis, JAMAIS par
     *   le vrai `process.env` : rien de ce qui sert a signer ne devient une variable globale. */
    creerSession({ env: { [etat.cle]: '1', [etat.secret]: '1', __CDP_JWT: signe.jwt },
      adresse: demande.adresse, actif: demande.actif })
      .then((s) => {
        if (s.etat !== 'OK') {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ ok: false, pret: true, etat: s.etat, pourquoi: s.pourquoi }));
          return;
        }
        /* ⛔⛔ LE DOMAINE DE RETOUR EST DECIDE ICI, JAMAIS PAR L APPELANT. Seul un block DEJA
         *     VALIDE par `validerDemande` (0x + 40 hex, minuscules) s ajoute en query. Reflechir
         *     une url fournie par le client serait un open-redirect sur un ecran qui parle
         *     d argent. La concatenation ci-dessous ne peut produire que notre propre origine.
         *   ⇒ Sans ce parametre, quelqu un qui finance depuis l ecran d un block revenait sur la
         *     page d accueil et devait le retrouver a la main : le rail fiat marchait, et le
         *     parcours fiat -> BLOCK s arretait la. */
        /* ⛔ 2026-10-25 : l ACTIF voyage avec le block, pour que le retour sache QUOI relire dans le wallet (au lieu
         *   de poser 0,01 ETH fixe). `demande.actif` sort de `validerDemande` : ETH ou USDC, rien d autre. */
        const retour = 'https://tokenizedblock.space/'
          + (demande.retourBlock ? '?block=' + demande.retourBlock + '&actif=' + demande.actif : '');
        const u = urlOnramp({ sessionToken: s.sessionToken, actif: demande.actif,
          montantFiat: demande.montantFiat, retour });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        res.end(JSON.stringify(u.etat === 'OK' ? { ok: true, pret: true, url: u.url }
          : { ok: false, pret: true, pourquoi: u.pourquoi }));
      })
      .catch((e) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ok: false, pret: true, etat: 'NON_MESURE',
          pourquoi: 'onramp session failed: ' + String((e && e.message) || e).slice(0, 120) }));
      });
    return;
  }
  /* ══ LE SECOND RAIL FIAT : MOONPAY (2026-10-26) ══ moonpay-rail.js porte les deux corps ; ici on ne fait que cabler.
   * Sans MOONPAY_PUBLISHABLE_KEY + MOONPAY_SECRET_KEY : `pret:false`, aucune lecture reseau, et l app ne montre rien.
   * Le secret ne quitte pas moonpay-rail.js (signature seulement) ; aucune reponse ni erreur ne le contient. */
  if (chemin === '/api/moonpay/pays' || chemin === '/api/moonpay/session') {
    const q = new URL(req.url, 'http://x').searchParams;
    const rendreMp = (statut, corps) => {
      res.writeHead(statut, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps));
    };
    const travail = chemin === '/api/moonpay/pays'
      ? corpsPaysMoonpay({ env: process.env, pays: q.get('pays'), actif: q.get('actif'), lireCatalogue: catalogueMoonpay })
        .then((corps) => ({ statut: 200, corps }))
      : corpsSessionMoonpay({ env: process.env, adresse: q.get('adresse'), actif: q.get('actif'), block: q.get('block'),
        pays: q.get('pays'), lireCatalogue: catalogueMoonpay });
    travail.then((r) => rendreMp(r.statut, r.corps))
      .catch(() => rendreMp(200, { ok: false, pret: true, etat: 'NON_MESURE', pourquoi: 'MoonPay rail failed' }));
    return;
  }
  /* ══ SHOPIFY USDC (2026-11-04, PROTOTYPE) ══ shopify-usdc.js porte les corps ; ici on ne fait que cabler.
   * Sans SHOPIFY_API_SECRET + SHOPIFY_SHOP_DOMAIN + SHOPIFY_STORE_URL : le webhook rend 404 et l app ne montre rien.
   * Le corps du webhook est lu en OCTETS BRUTS (le HMAC porte sur eux, doc Shopify) ; aucune signature, aucun fonds ici. */
  if (chemin === '/api/shopify/etat' || chemin === '/api/shopify/droits' || chemin === '/api/shopify/webhook' || chemin === '/api/shopify/bon') {
    const rendreSh = (statut, corps) => {
      res.writeHead(statut, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(JSON.stringify(corps));
    };
    let magasinSh;
    try { magasinSh = magasinShopify(); } catch (_) { rendreSh(503, { ok: false, pourquoi: 'entitlement store unreadable' }); return; }
    if (chemin === '/api/shopify/etat') { rendreSh(200, { ...corpsEtat(process.env), dernierWebhook: dernierWebhookSh }); return; }
    if (chemin === '/api/shopify/droits') {
      if (req.method !== 'GET') { rendreSh(405, { ok: false, pourquoi: 'GET only' }); return; }
      const r = corpsDroits({ env: process.env, magasin: magasinSh, adresse: new URL(req.url, 'http://x').searchParams.get('adresse') });
      rendreSh(r.statut, r.corps); return;
    }
    /* le BON d un skin : signe par la cle dediee (pouvoir de mint seul), rendu au wallet ECRIT dans la commande ; le wallet de
     * l acheteur envoie lui-meme claim() — ce serveur n envoie aucune transaction */
    if (chemin === '/api/shopify/bon') {
      if (req.method !== 'GET') { rendreSh(405, { ok: false, pourquoi: 'GET only' }); return; }
      const q = new URL(req.url, 'http://x').searchParams;
      let r;
      try { r = corpsBon({ env: process.env, magasin: magasinSh, commande: q.get('commande'), adresse: q.get('adresse'), block: q.get('block'), recipe: q.get('recipe'), unite: Number(q.get('unite') || 1) }); }
      catch (_) { r = { statut: 500, corps: { ok: false, pret: true, pourquoi: 'voucher failed' } }; }
      rendreSh(r.statut, r.corps); return;
    }
    if (req.method !== 'POST') { rendreSh(405, { ok: false, pourquoi: 'POST only' }); return; }
    const morceaux = []; let tailleSh = 0; let tropSh = false;
    req.on('data', (c) => { if (tropSh) return; tailleSh += c.length; if (tailleSh > SHOPIFY_CORPS_MAX) { tropSh = true; rendreSh(413, { ok: false, pourquoi: 'request too large' }); req.destroy(); return; } morceaux.push(c); });
    req.on('end', () => {
      if (tropSh) return;
      let r;
      try { r = traiterWebhook({ env: process.env, entetes: req.headers, corpsBrut: Buffer.concat(morceaux), magasin: magasinSh }); }
      catch (_) { r = { statut: 503, corps: { ok: false, pourquoi: 'entitlement not saved' } }; } /* non-2xx : Shopify relivre */
      const en = (n) => { const v = req.headers[n]; return typeof v === 'string' ? v.slice(0, 80) : null; };
      dernierWebhookSh = { lu: new Date().toISOString(), sujet: en('x-shopify-topic'), domaine: en('x-shopify-shop-domain'), statut: r.statut,
        pourquoi: r.corps && typeof r.corps.pourquoi === 'string' ? r.corps.pourquoi.slice(0, 120) : null };
      rendreSh(r.statut, r.corps);
    });
    return;
  }

  if (chemin === '/api/ol/list') {
    listeOpenLaunch().then((corps) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(corps);
    });
    return;
  }

  /* ══ ENTONNOIR (Phil, 2026-09-19 : « fais l entonnoir, avec des resultats vrais ») ══════════════════════════
   * ⛔ ANONYME PAR CONSTRUCTION : on compte des ETAPES, rien d autre — ni adresse, ni IP, ni identifiant, ni cookie.
   * ⚠️ BORNES : persistant sur le volume /data (≤ 30 s de pertes a l arret) ; un curieux peut gonfler
   *    un compteur a la main — ce sont des ordres de grandeur, jamais une preuve d argent (l argent se lit sur a6cf). */
  if (chemin === '/api/etape') {
    const q = new URL(req.url, 'http://x').searchParams;
    const e = q.get('e') || '';
    /* ⛔⛔⛔ NOTRE PROPRE TRAFIC EST COMPTE A PART, ET C EST UNE MESURE QUI L A EXIGE. Le
     *      2026-09-30 j ai passe la journee a ouvrir l app dans un navigateur pour verifier mes
     *      deploiements — sans wallet, donc en declenchant `echange_refus_wallet`, `gm_refus_wallet`,
     *      `achat_clic`… Le meme jour, l entonnoir affichait 9 `echange_refus_wallet` pour
     *      10 `visite`, et j ai commence a en tirer des conclusions produit AVANT de realiser que
     *      je les avais fabriquees moi-meme. Rien ne distinguait mes taps de ceux d un visiteur.
     *    ⛔ ON SEPARE, ON NE JETTE PAS. Jeter notre trafic cacherait son volume : on ne saurait plus
     *      si un chiffre bas vient des visiteurs ou d un filtre trop large. Deux seaux, et les deux
     *      sont publies.
     *    ⚠️ ET CA NE REPARE PAS LE PASSE : les journees d avant restent melangees, sans moyen de
     *      les demeler. C est dit dans la reponse de `/api/entonnoir`, pas tu. */
    const interne = q.get('i') === '1';
    if (ETAPES_ENTONNOIR.includes(e)) {
      const jour = new Date().toISOString().slice(0, 10);
      const seau = interne ? entonnoir.interne : entonnoir.total;
      const seauJour = interne ? entonnoir.interneParJour : entonnoir.parJour;
      seau[e] = (seau[e] || 0) + 1;
      seauJour[jour] = seauJour[jour] || {};
      seauJour[jour][e] = (seauJour[jour][e] || 0) + 1;
      entonnoirSale = true;
      console.log('[entonnoir]', jour, e, interne ? '(INTERNE)' : '');
    }
    res.writeHead(204, { 'cache-control': 'no-store' });
    res.end();
    return;
  }
  if (chemin === '/api/entonnoir') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    /* ⛔⛔ LES DEUX SEAUX SONT PUBLIES, ET LA BORNE AVEC EUX. Ne rendre que `total` laisserait
     *     croire qu il est propre depuis toujours ; ne rendre que le notre cacherait le volume.
     *   ⛔ `melangeJusquau` DIT LA VERITE SUR LE PASSE : avant cette date, notre trafic de
     *     verification est DANS `total` et rien ne permet de l en sortir. Un chiffre dont on ne
     *     dit pas la borne se lit comme s il n en avait pas. */
    res.end(JSON.stringify({ ok: true, persistant: !!FICHIER_ENTONNOIR, depuis: entonnoir.depuis,
      etapes: ETAPES_ENTONNOIR, total: entonnoir.total, parJour: entonnoir.parJour,
      interne: entonnoir.interne || {}, interneParJour: entonnoir.interneParJour || {},
      melangeJusquau: '2026-09-30',
      borne: 'Steps counted before 2026-09-30 mix visitors with our own verification traffic, and '
        + 'they cannot be separated after the fact. From that date, our traffic is counted in '
        + '`interne` instead — separated, never dropped.' }));
    return;
  }

  /* ══ PARTS CREATEUR (Phil 2026-09-19 : « que a6cf soit l unique receveur ») ════════════════════════════════════════
   * Sur V2/V3, 1/3 des frais de swap va au CREATEUR enregistre de la pool ; il peut ceder cette part (transfererPart).
   * Lecture seule : les pools de nos hooks dont `compte` est le createur enregistre. Le serveur ne signe rien. */
  if (chemin === '/api/parts-createur') {
    const compte = String(new URL(req.url, 'http://x').searchParams.get('compte') || '').toLowerCase();
    const repondre = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!/^0x[0-9a-f]{40}$/.test(compte)) { repondre({ ok: false, pourquoi: 'not an address' }); return; }
    /* ⛔ 2026-10-09 : cette route attendait elle aussi le balayage ENTIER des frais (le banc test-frais-routes-fond l a trouvee,
     *   troisieme appelant du meme motif). Elle partage le calcul en fond de /api/frais-hook ; tant qu aucun balayage n a abouti,
     *   elle dit EN_COURS au lieu de rendre « aucune part » sur une liste de pools vide. */
    const fond = enFond('frais-hook', () => fraisEnAttente(), 120000);
    (async () => {
      if (fond.enVol) await Promise.race([fond.enVol, new Promise((ok) => setTimeout(ok, 2500))]);
      if (!fond.r) { repondre({ ok: false, etat: fond.enVol ? 'EN_COURS' : 'ECHEC', pourquoi: fond.enVol ? 'reading the chain in the background — ask again in a minute' : (fond.erreur || 'not read'), balayeJusqua: fraisScan.jusqua }); return; }
      const pools = [];
      for (const p of fraisScan.pools) {
        let createur = null;
        try { createur = '0x' + String(await rpcServeur('eth_call', [{ to: p.hook, data: '0x631245a7' /* createurDe(bytes32) */ + p.id.slice(2) }, 'latest'])).slice(-40); } catch { createur = null; }
        if (!createur || createur.toLowerCase() !== compte) continue;
        const bloc = [p.c0, p.c1].find((a) => a.startsWith('0xb2')) || p.c1;
        let sym = null;
        try { const x = await rpcServeur('eth_call', [{ to: bloc, data: '0x95d89b41' }, 'latest']); const bx = String(x).slice(2); const n = parseInt(bx.slice(64, 128), 16); sym = Buffer.from(bx.slice(128, 128 + n * 2), 'hex').toString('utf8').replace(/[^\x20-\x7e]/g, '').slice(0, 12); } catch { sym = null; }
        pools.push({ hook: p.hook, hookNom: (HOOKS_FRAIS.find((h) => h.adr === p.hook) || {}).nom || '?', id: p.id, bloc, symbole: sym });
      }
      /* ⛔⛔ 2026-10-17 (MESURE) : le hook 7030 — celui de TOUTES les naissances recentes, deploye au bloc 52 132 476, sans du() — n est PAS
       *   dans HOOKS_FRAIS : ce balayage ne voit aucune de ses pools, et `createurDe` y REVERT (son getter est `createurs`). En prod,
       *   0x31e0…, createur enregistre de UNIT, recevait ici 0 pool. On lit donc AUSSI les pools 7030 dont la CLE est deja connue du serveur
       *   (le cache de /api/cle), par createurs(bytes32). Borne dite : une pool 7030 dont personne n a encore lu la cle n apparait pas. */
      let pools7030 = 0;
      const h7030 = String(HOOK_7030).toLowerCase();
      for (const [jeton, v] of clesCache) {
        for (const c of (v && Array.isArray(v.cles) ? v.cles : [])) {
          if (String(c.hooks).toLowerCase() !== h7030 || !/^0x[0-9a-f]{64}$/i.test(String(c.poolId)) || pools.some((x) => x.id === String(c.poolId).toLowerCase())) continue;
          let createur = null;
          try { createur = ('0x' + String(await rpcServeur('eth_call', [{ to: h7030, data: '0x' + String(SEL_CREATEURS).replace(/^0x/, '') + String(c.poolId).slice(2) }, 'latest'])).slice(26, 66)).toLowerCase(); } catch { createur = null; }
          if (createur !== compte) continue;
          pools7030 += 1;
          pools.push({ hook: h7030, hookNom: '7030', id: String(c.poolId).toLowerCase(), bloc: String(jeton).toLowerCase(), symbole: null });
        }
      }
      /* `complet` : un balayage avec des fenetres ratees rend une liste PLANCHER, et c est dit */
      repondre({ ok: true, compte, pools, feeWallet: WALLET_FRAIS, complet: fond.r.fenetresRatees === 0, balayeJusqua: fraisScan.jusqua,
        pools7030, borne7030: 'hook 7030 pools are listed only when their pool key has already been read by this server (/api/cle)' });
    })().catch((e) => repondre({ ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) }));
    return;
  }

  /* ══ QUI LANCE QUOI SUR BASE, EN CE MOMENT (2026-10-02) ═══════════════════════════════════════
   * ⛔ LECTURE SEULE : eth_getLogs des factories (o1/LaunchBlitz, Clanker, Zora, Doppler/bankr, OpenLaunch,
   *    B20 auto). Fenetres ratees et fronts non lus sont COMPTES dans la reponse, jamais tus.
   * ⛔ 6 h maximum par appel, cache 5 min : un scan de 24 h (~260 getLogs + ~1 500 eth_call) n a rien a
   *    faire derriere un bouton. Les chiffres de 24 h sont dans canal/DIG-LAUNCHBLITZ-capture-2026-10-02.md. */
  if (chemin === '/api/lancements-etrangers') {
    /* h brut : lancementsEtrangers l arrondit a un entier 1..6 a cote de son cache (une seule regle, pas deux copies) */
    lancementsEtrangers(new URL(req.url, 'http://x').searchParams.get('h')).then((r) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(r));
    }).catch((e) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: false, pourquoi: String((e && e.message) || e).slice(0, 160) }));
    });
    return;
  }

  /* ⛔⛔ 2026-10-09 — CES DEUX ROUTES NE REPONDAIENT JAMAIS EN PROD (mesure : coupees a 60 s, les deux). Elles attendaient un balayage
   *   entier (frais-hook : ~1 520 fenetres a froid) pendant que base.org refusait tout getLogs. Elles repondent maintenant TOUT DE SUITE
   *   (au plus ~2,5 s) : le dernier resultat avec son age, ou « EN_COURS » avec la progression — et le calcul continue en fond. Un
   *   resultat perime est DIT perime (`ageS`), jamais servi comme frais. */
  if (chemin === '/api/frais-hook') {
    const c = enFond('frais-hook', () => fraisEnAttente(), 120000);
    void repondreFond(res, c, () => ({ balayeJusqua: fraisScan.jusqua, depuisBloc: Math.min(...HOOKS_FRAIS.map((h) => h.depuis)) }));
    return;
  }

  /* ══ CE QUI EST REELLEMENT ARRIVE, ET SI C EST BIEN ARRIVE ══════════════════════════════════
   * ⛔ DEUX QUESTIONS DIFFERENTES : /api/frais-hook dit ce qui DORT en claims, celui-ci dit ce qui
   *    EST ARRIVE — et confronte chaque evenement au SOLDE du beneficiaire. Un hook emet ce qu il
   *    veut ; seul un delta de solde prouve un encaissement.
   * ⚠️ QUATRE ETATS : ARRIVE, PAS_ARRIVE, NON_CONCLUANT (le beneficiaire a paye lui-meme, l argent
   *    fait un aller-retour et le gas rend le delta negatif), NON_LU. */
  if (chemin === '/api/frais-recents') {
    /* ⛔ 2026-10-09 (revue adversariale, meme defaut que /api/lancements-etrangers) : `h` borne mais PAS arrondi — h=24.001,
     *   24.002… ouvraient chacun une entree de calculsFond jamais evincee et un balayage de 168 h au plus. Arrondi : 168 cles au plus. */
    const heures = Math.min(168, Math.max(1, Math.round(Number(new URL(req.url, 'http://x').searchParams.get('h'))) || 24));
    const c = enFond('frais-recents:' + heures, () => fraisRecents(heures), 300000);
    void repondreFond(res, c, () => ({ heures }));
    return;
  }

  /* ══ /live (HTML sans script) et /api/live (JSON) — 2026-10-11, Phil : « que les tx puissent etre captees via X pour que Grok sur X
   *   puisse lire en live ». Ce que le wallet de frais a VRAIMENT recu (frais des hooks verifies par le solde, meme calcul en fond que
   *   /api/frais-recents?h=24), ses soldes, les 4 sondes. Lisible par un robot qui suit un lien ; rien n est publie sur X d ici. */
  if (chemin === '/live' || chemin === '/api/live') {
    void servirLive(res, chemin).catch(() => { try { res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }); res.end('live page failed'); } catch (_) { /* deja repondu */ } });
    return;
  }

  /* ══ REVENU EXTERNE (2026-10-16) — le client poste le hash d une transaction CONFIRMEE qui porte un frais ; le serveur relit
   *   tx + recu lui-meme et ne compte que ce qui est ARRIVE a a6cf (revenu-externe.js). ⛔ Le client ne dit QUE le hash et la ligne :
   *   montant, devise, payeur sont relus sur la chaine. ⛔ Un hash compte UNE fois (rejouer ne gonfle rien). ⛔ i=1 = notre trafic :
   *   compte, mais dans le seau interne, comme l entonnoir. NON_LU (recu pas encore lisible) = 202, rien de compte, le client peut renvoyer. */
  if (chemin === '/api/paye' && req.method === 'POST') {
    const q = new URL(req.url, 'http://x').searchParams;
    const h = String(q.get('h') || '').toLowerCase(), ligne = String(q.get('l') || '');
    const repondre = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(corps)); };
    if (!/^0x[0-9a-f]{64}$/.test(h) || !LIGNES_FRAIS.includes(ligne)) { repondre(400, { ok: false, pourquoi: 'a transaction hash and a known fee line are needed' }); return; }
    /* ⛔ 2026-10-24 (revue adverse du correctif ticketpot, defaut 2) : un frais VERIFIE marque le hash vu (revenu.vus) meme quand le jour
     *   du bloc n a pas ete lu (crediterVolumeJour -> NON_LU, « send it again in a moment ») : le renvoi recevait {deja:true} et le ticket du
     *   jour etait perdu pour toujours — la reponse mentait. Le hash attend alors dans revenu.ticketsEnAttente ; son renvoi ne recompte PAS
     *   le frais (compterRevenu, une fois), il ne refait que le ticket (crediterVolumeJour, idempotent par revenu.volVus). */
    const enAttenteTicket = (revenu.ticketsEnAttente || {})[h];
    if (revenu.vus[h] && !enAttenteTicket) { repondre(200, { ok: true, deja: true }); return; }
    if (payesEnCours.has(h) || payesEnCours.size >= 3) { repondre(429, { ok: false, pourquoi: 'busy, send it again in a moment' }); return; }
    payesEnCours.add(h);
    (async () => { try {
      /* nos wallets de TEST connus (0x31e0… = le wallet de test de Phil, cite dans les rapports du canal) + ceux declares par l env : internesRevenu */
      const { tx, recu, internes, v } = await lireTxPaye(h);
      /* PASS SKIN (Phil 2026-10-17 soir) : crediterPassSkin (module). ⛔ 2026-10-24 (defaut 5) : une fonction, pour que le RENVOI d un
       *   skin_mint en attente credite le pass ; 3e tour : au module, pour que le balayage serveur le credite aussi. */
      const crediterPass = (o) => crediterPassSkin({ h, ...o });
      /* le hash deja compte dont le ticket attend : seulement le ticket (la ligne gardee, pas celle du renvoi), jamais le frais une 2e fois */
      if (revenu.vus[h] && enAttenteTicket) {
        const tk = await retenterTicket({ h, ligne: enAttenteTicket.ligne, tx, recu, v, internes });
        if (!tk || tk.etat !== 'NON_LU') { delete revenu.ticketsEnAttente[h]; revenuSale = true; }
        repondre(tk && tk.etat === 'NON_LU' ? 202 : 200, tk ? { ok: true, deja: true, ticket: tk } : { ok: true, deja: true });
        return;
      }
      /* 2026-10-17 soir — SEASON DRAW QUOTIDIEN : le VOLUME verifie du jour (volume-tirage.js). UNIT : un Swap du PoolManager sur NOTRE pool
       *   UNIT (le frais du hook est pris DANS ce swap, en ETH natif : verifierFrais ne le voit pas, d ou ce chemin avant son refus).
       *   Actions : seulement si NOTRE frais est arrive (v.ok). Externes seulement ; un hash ne compte qu UNE fois, tous jours confondus. */
      /* 2026-10-24 : ce que le ticket du jour a fait de ce hash (jour du BLOC credite, ou pourquoi rien : plus de 48 h, bloc illisible) —
       *   rendu dans la reponse (ticket), jamais devine */
      let ticketTP = null;
      try { ticketTP = (await crediterVolumeJour({ h, ligne, tx, recu, v, internes })) || null; } catch (_) {
        /* le volume se relira au prochain envoi du hash (ticketsEnAttente si le frais, lui, est compte ci-dessous) */
        if (ligne === 'hook_block' || ligne === 'swap_action') ticketTP = { ok: false, etat: 'NON_LU', pourquoi: 'the day ticket of this transaction was not read: send it again in a moment' };
      }
      /* le PASS SKIN (crediterPass ci-dessus), avant la sortie sur frais : verifierFrais exige un swap */
      if (ligne === 'skin_mint' && !(revenu.passVus || {})[h]) {
        const tkPass = await crediterPass({ tx, recu, internes });
        if (tkPass) ticketTP = tkPass;
      }
      const avecTicket = (o) => (ticketTP ? { ...o, ticket: ticketTP } : o);
      /* 3e tour : un hash en attente SANS frais verifie (swap UNIT : jamais marque vu) repasse ici ; credite -> l attente sort */
      if (enAttenteTicket && ticketTP && ticketTP.etat !== 'NON_LU') { delete revenu.ticketsEnAttente[h]; revenuSale = true; }
      revenu.tentatives[v.ok ? 'ok' : v.etat] = (revenu.tentatives[v.ok ? 'ok' : v.etat] || 0) + 1;
      /* ⛔ 2026-10-24 (revue adverse, 2e tour ticketpot, defaut 2) : un ticket du jour NON_LU (bloc ou prix illisible) repond 202, plus 200 —
       *   l app (signalerPaye) ne renvoie que sur 202 / 429 : avec 200, le renvoi qui credite n arrivait jamais.
       * 3e tour : ce ticket-la attend aussi dans ticketsEnAttente (le balayage serveur le reessaie, l app peut etre fermee) */
      if (!v.ok && ticketTP && ticketTP.etat === 'NON_LU') garderTicketEnAttente(h, ligne);
      if (!v.ok) { revenuSale = true; repondre(v.etat === 'NON_LU' || (ticketTP && ticketTP.etat === 'NON_LU') ? 202 : 200, avecTicket({ ok: false, etat: v.etat, pourquoi: v.pourquoi })); return; }
      /* ⛔ chasse 2026-10-17 (HIGH, PoC) : `i=1` venait du CLIENT — n importe qui postait le hash d un autre avec i=1 (le premier post gagne)
       *   et lui retirait son ticket / sa ligne externe. Interne / externe se decide SEULEMENT par le wallet payeur (walletsInternes). */
      const verif = v;
      const jour = new Date().toISOString().slice(0, 10);
      const etat = compterRevenu(revenu, { ligne, verif });
      revenu.externe = etat.externe; revenu.interne = etat.interne;
      revenu.parJour[jour] = compterRevenu(revenu.parJour[jour] || {}, { ligne, verif });
      revenu.vus[h] = { jour, ligne, externe: verif.externe };
      /* le ticket du jour non lu (bloc illisible) : le hash attend son renvoi (la reponse dit « send it again » : c est vrai). Borne : au-dela
       *   de 49 h un renvoi rendrait TROP_VIEUX de toute facon (48 h), l entree sort. */
      if (ticketTP && ticketTP.etat === 'NON_LU') {
        garderTicketEnAttente(h, ligne);
      }
      /* 2026-10-17 — ETAPE 2, la vitrine : r=<block> (le client ne l envoie que si la page etait ce block, ref-vitrine.js). Une ligne au
       *   registre PUBLIC, seulement pour un frais EXTERNE verifie ; le createur est LU sur la chaine, jamais pris dans la requete. */
      /* ⛔⛔ chasse 2026-10-17 (HIGH, PoC) : `r` (le block de la vitrine) venait du CLIENT, et le premier post d un hash gagnait : un tiers
       *   postait le hash d un acheteur avec r = SON block et se faisait devoir 30 %. Tant que la ref n est pas PORTEE PAR LA TRANSACTION du
       *   payeur (signee par lui), elle n est plus lue : le registre reste vide plutot que faux. */
      const r = '';
      if (verif.externe && /^0x[0-9a-f]{40}$/.test(r) && !/^0x0{40}$/.test(r)) {
        const createur = await createurDuBlock(r);
        revenu.registre[h] = ligneRegistre({ hash: h, jour, ligne, bloc: r, verif, createur });
      }
      /* 2026-10-17 — TIRAGE DE SAISON (v1 BLANCHE) : un frais EXTERNE verifie sur une action (swap_action) credite son payeur dans la
       *   saison de la semaine. Valeur en dollars au prix que l ecran lit A LA RECEPTION (secondes apres le bloc) ; non lu -> 0. */
      if (verif.externe && ligne === 'swap_action') {
        const usd = await valeurFraisUsd(v.recus);
        revenu.saisons = crediter(revenu.saisons || {}, { saison: saisonDe(Date.now()).id, payeur: v.payeur, hash: h, usd });
      }
      revenuSale = true;
      console.log('[revenu]', jour, ligne, verif.externe ? 'EXTERNE' : 'interne', JSON.stringify(v.recus));
      repondre(ticketTP && ticketTP.etat === 'NON_LU' ? 202 : 200, avecTicket({ ok: true, externe: verif.externe }));
    } catch (e) {
      repondre(202, { ok: false, etat: 'NON_LU', pourquoi: 'the chain could not be read just now' });
    } finally { payesEnCours.delete(h); } })();
    return;
  }

  /* ══ REGISTRE DES CREATEURS (2026-10-17, etape 2) — PUBLIC et VERIFIABLE : chaque ligne porte le hash, le payeur, le block, le
   *   createur lu sur la chaine, les frais recus et la part due (30 % de NOTRE frais, devise par devise, unites brutes).
   * ⛔ Une part DUE n est PAS un paiement : le serveur ne signe rien ; elle est versee par un wallet humain, et ca se dit ici.
   * Les lignes CREATEUR_NON_LU sont relues (3 par appel au plus) : le balayage des pools peut ne pas avoir encore vu le block. */
  if (chemin === '/api/registre-createurs') {
    (async () => {
      const lignes = Object.values(revenu.registre || {});
      for (const l of lignes.filter((x) => x.etat === 'CREATEUR_NON_LU').slice(0, 3)) {
        const c = await createurDuBlock(l.bloc);
        if (c) {
          const v = { payeur: l.payeur, recus: Object.entries(l.frais).map(([devise, montant]) => ({ devise, montant })) };
          revenu.registre[l.hash] = ligneRegistre({ hash: l.hash, jour: l.jour, ligne: l.ligne, bloc: l.bloc, verif: v, createur: c });
          revenuSale = true;
        }
      }
      const toutes = Object.values(revenu.registre || {}).sort((a, b) => String(b.jour).localeCompare(String(a.jour)));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, depuis: revenu.depuis, lignes: toutes, dusParCreateur: totauxParCreateur(toutes),
        regle: 'A buyer who arrives through a block page link (?block=B&ref=B) and pays one of our fees: the creator of B, read on chain, '
          + 'is owed 30% of the fee we actually received, per token (we keep floor(70%)). Same wallet as the creator: nothing. '
          + 'Owed is not paid: payouts are sent by a human wallet, never by this server. Amounts are raw token units.' }));
    })().catch((e) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, pourquoi: String((e && e.message) || e).slice(0, 120) })); });
    return;
  }

  /* ══ TIRAGE DE SAISON (2026-10-17, v1 BLANCHE) — public et rejouable : la saison, le seuil, chaque wallet avec ses frais verifies et
   *   leurs hashes, les tickets, leur racine merkle. ⛔ Aucun pot en v1 : la reponse le dit. Le gagnant viendra d un bloc fixe a la cloture. */
  /* DENIM (2026-11-05) : le temps de bloc SERVI seul (le meme objet que /api/tirage.tempsDeBloc), pour les pages qui n ont besoin que de
   *   lui (index.html : l age des vignettes ; pot.html : les durees des periodes) — sans le corps du tirage. null = non mesure. */
  if (chemin === '/api/temps-de-bloc') {
    void sParBlocSrv();
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, tempsDeBloc: tempsDeBlocServiJson() }));
    return;
  }
  if (chemin === '/api/tirage') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(corpsTirage()));
    return;
  }
  /* 2026-10-18 : le corps de /api/tirage est une FONCTION (hissee), lue aussi par le MCP (tblock_game_state) — une seule source, pas une copie */
  function corpsTirage() {
    void crediterDetenteursSkins();
    /* 2026-10-17 soir — v2 QUOTIDIEN (Phil) : ticket du JOUR a 10 $ de volume verifie (UNIT sur notre pool, ou actions tokenisees via l app) ;
     *   chaque jour qualifie = 1 entree au tirage de la SEMAINE et du MOIS. Pas de pot (practice) : l ecran le dit.
     * ⛔ 2026-10-18 (Phil : « fini ca, on a tirage weekend et roll deja en place ») : PLUS de tirage du jour presente. Le ticket du jour = 1 entree
     *   au pot de la SEMAINE (TicketPot, dernier jour de la semaine, parts ponderees par entrees). veille / mois restent dans le JSON (d autres
     *   lecteurs les lisent) ; le mois n est qu un compte. */
    const now = Date.now(), j = jourDe(now), s = saisonDe(now), mo = moisDe(now);
    const jours = revenu.jours || {}, etatJ = jours[j.id] || {};
    /* tickets = volume >= seuil OU pass skin couvrant le jour (tirage-saison.js ticketsJour) */
    const passes = revenu.passes || {};
    const tJ = ticketsJour(jours, j.id, passes, SEUIL_VOLUME_JOUR_USD);
    /* NIVEAU DU BRAIN (2026-10-18) : +1 entree a L3, +2 a L6 (plafond 2), seulement pour un wallet qui a deja une entree de JOUR cette semaine
     *   (bonusNiveauxSemaine ET entreesPeriode le verifient) ; niveau = XP verifie (niveauSrv). Le mois ne recoit pas ce bonus. */
    const bonusNiveauS = bonusNiveauxSemaine(entreesPeriode(jours, joursEntre(s.debut, s.fin), SEUIL_VOLUME_JOUR_USD, passes), (a) => niveauSrv(a).level);
    const eS = entreesPeriode(jours, joursEntre(s.debut, s.fin), SEUIL_VOLUME_JOUR_USD, passes, (revenu.bonusSemaine || {})[s.id] || {}, bonusNiveauS), eM = entreesPeriode(jours, joursEntre(mo.debut, mo.fin), SEUIL_VOLUME_JOUR_USD, passes);
    const iso = (x) => new Date(x).toISOString();
    /* FACE OF THE DAY + tirage du jour (2026-10-17 soir) : HIER est resolu par le bloc E = le premier bloc horodate >= cloture + 120 s
     *   (face-du-jour.js). Son hash revele la face du jour ET tire le gagnant (tirer, domaine = id du jour). Resolu UNE fois, en fond,
     *   puis garde (revenu.revelations) ; pas encore resolu -> etat dit, rien d invente. */
    const veilleJ = jourDe(now - JOUR_MS);
    revenu.revelations = revenu.revelations || {};
    const rev = revenu.revelations[veilleJ.id];
    if (!rev && now >= veilleJ.fin + DELAI_REVELATION_S * 1000 && !revelationEnCours) {
      revelationEnCours = true;
      /* 2026-10-23 DENIM : le temps de bloc MESURE raccourcit la recherche (le resultat est exact sans lui : test-face-du-jour-denim) */
      premierBlocApres(rpcServeur, Math.floor(veilleJ.fin / 1000) + DELAI_REVELATION_S, { sParBloc: tempsDeBlocSrv.sParBloc ?? undefined })
        .then((e) => { if (e) { revenu.revelations[veilleJ.id] = { bloc: e.bloc, ts: e.ts, hash: e.hash }; revenuSale = true; } })
        .catch(() => { /* relu au prochain appel */ }).finally(() => { revelationEnCours = false; });
    }
    /* APERCU EN DIRECT (Phil : « la simulation du block cree au hasard qui definit le block gagnant ») : la face que tirerait le DERNIER bloc
     *   Base si la journee fermait maintenant. Un apercu : seul le bloc E compte. Tete lue au plus toutes les 6 s, en fond. */
    if (Date.now() - apercuFace.lu > 6000 && !apercuFace.enCours) {
      apercuFace.enCours = true;
      rpcServeur('eth_getBlockByNumber', ['latest', false])
        .then((b) => { if (b && /^0x[0-9a-f]{64}$/i.test(String(b.hash))) Object.assign(apercuFace, { bloc: parseInt(b.number, 16), hash: String(b.hash).toLowerCase(), lu: Date.now() }); })
        .catch(() => {}).finally(() => { apercuFace.enCours = false; });
    }
    const tV = ticketsJour(jours, veilleJ.id, passes, SEUIL_VOLUME_JOUR_USD);
    const veille = { id: veilleJ.id, blocE: rev ? rev.bloc : null, hashE: rev ? rev.hash : null, etat: rev ? 'REVELEE' : 'EN_ATTENTE', tickets: tV,
      gagnant: rev && tV.length ? (tirer({ hashE: rev.hash, saison: veilleJ.id, liste: tV }) || [null])[0] : null };
    /* BlockRolls (2026-10-18) : l adresse SIGNEE (fiche generee) ou null = practice ; les prix viennent de la fiche, jamais tapes ici */
    const rc = BLOCKROLLS_DEPLOIEMENT.constructeur || {};
    /* 2026-10-18 (revue adverse) : les 4 paliers (2/5 compris, lus dans la fiche), le pot LU sur le contrat (cache 30 s, null si pas lu —
     *   jamais un 0 ecrit) et le bloc de deploiement (l app relit les rolls en attente depuis lui) */
    const contratRolls = /^0x[0-9a-f]{40}$/i.test(String(BLOCKROLLS_DEPLOIEMENT.adresse || '')) ? String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase() : null;
    if (contratRolls) { void lirePotRollsSrv(contratRolls); void reglesRollsSrv.rafraichir(); }
    /* 2026-10-24 (audit rolls-duels) : prizes / minScore = currentRules() LU (rolls-regles.js), avec sa version, le createur de UNIT (qui peut
     *   les changer) et MAX_PRIZE ; non lus -> null (jamais les valeurs du constructeur : setRules les change) */
    const rgR = contratRolls ? reglesRollsSrv.servi() : null;
    const rolls = { contrat: contratRolls,
      prixRoll: String(rc.rollPrice || ''), prixPass: String(rc.passPrice || ''), passRolls: rc.passRolls, prizes: rgR ? rgR.prizes : null, minScore: rgR ? rgR.minScore : null,
      regles: rgR ? { version: rgR.version, createur: rgR.createur, maxPrize: rgR.maxPrize, lu: rgR.lu } : null,
      bloc: contratRolls && Number.isSafeInteger(BLOCKROLLS_DEPLOIEMENT.bloc) ? BLOCKROLLS_DEPLOIEMENT.bloc : null,
      pot: contratRolls && potRollsSrv.brut !== null ? potRollsSrv.brut : null, potLu: contratRolls && potRollsSrv.lu ? new Date(potRollsSrv.lu).toISOString() : null };
    /* 2026-10-23 DENIM : le temps de bloc MESURE (null tant qu il ne l est pas) — l app en tire les durees des fenetres et son rythme de relecture */
    void sParBlocSrv();
    return ({ ok: true, mode: 'SHADOW', pot: 0, seuilVolumeUsd: SEUIL_VOLUME_JOUR_USD, veille, rolls, ticketpot: ticketpotJson(), ticketpotUnit: ticketpotJsonDe(POT_TP_UNIT), tempsDeBloc: tempsDeBlocServiJson(),
      apercu: apercuFace.hash ? { bloc: apercuFace.bloc, hash: apercuFace.hash, lu: new Date(apercuFace.lu).toISOString() } : null,
      jour: { id: j.id, debut: iso(j.debut), fin: iso(j.fin), tickets: tJ, racine: racine(tJ),
        wallets: Object.entries(etatJ).map(([adresse, w]) => ({ adresse, volumeUsd: w.usd, hashes: w.hashes, ticket: tJ.includes(adresse) })),
        passes: Object.entries(passes).filter(([, ids]) => ids.includes(j.id)).map(([a, ids]) => ({ adresse: a, jusqua: ids[ids.length - 1] })) },
      semaine: { id: s.id, debut: iso(s.debut), fin: iso(s.fin), entrees: eS, n: eS.length, racine: racine(eS.map((e) => e.adresse)), bonusNiveau: bonusNiveauS },
      mois: { id: mo.id, debut: iso(mo.debut), fin: iso(mo.fin), entrees: eM, n: eM.length, racine: racine(eM.map((e) => e.adresse)) },
      regle: 'A day counts when your verified trading volume that day (UTC) reaches $' + SEUIL_VOLUME_JOUR_USD + ': trades of the UNIT block on its '
        + 'TokenizedBlock pool, tokenized-stock trades made in the app, and what you spend in BlockRolls (paid rolls and the Week pass; a roll taken on a pass '
        + 'counts once, at the pass); a skin minted that day also holds that day\'s ticket. Today\'s ticket = 1 entry in this week\'s reward pot. '
        + 'The week\'s pot is the TicketPot pot of the week\'s last UTC day; after the week closes (UTC) it is shared by entries: each wallet\'s share follows '
        + 'its entries that week, signed by the verifier wallet, and each holder claims it from their own wallet. Trading more in a day adds nothing. '
        + 'A Week pass bought on the BlockRolls contract holds the ticket for 7 UTC days from the day of the block it was bought in (still one ticket a day) '
        + 'and adds 3 entries that week. A brain at level 3 adds 1 entry that week, at level 6 it adds 2 (never more), and only when that wallet already '
        + 'has an entry that week; levels come from verified play (GET /api/jeu/niveau). There is no daily winner and no monthly prize: '
        + 'the month count is a tally only. Paid rolls are separate: the BlockRolls contract pays a winning roll from its roll pot.' });
  }

  /* ══ LE NIVEAU D UN WALLET (2026-10-18, niveaux-jeu.js) — GET /api/jeu/niveau?wallet=0x… (40 hex, rien d autre dans la requete) ->
   *   { ok, wallet, xp, level, base, next, perk, detail, couverture }. Rien n est lu sur la chaine ici : le registre XP (revenu.xpEtat, rempli
   *   par crediterXp) et les jours avec ticket. Garde 30 s par wallet. perk.appliesThisWeek = niveau >= 3 ET une entree de jour cette semaine
   *   — exactement ce que corpsTirage ajoute au tirage de la semaine (practice : pas de pot). */
  /* ══ TICKETPOT : LES PARTS A SIGNER ET LES SIGNATURES RECUES (2026-10-18, Phil : « je signe moi-meme »).
   *   GET /api/ticketpot/parts?day=JYYYY-MM-DD : pour un jour FERME sur la chaine (lireJour), une part par holder du ticket de ce jour
   *   (ticketsJour, la meme liste que /api/tirage), avec les donnees EIP-712 a signer et la signature deja recue s il y en a une.
   *   POST /api/ticketpot/signature { day, wallet, signature } : le signataire est RELU (recupererAdresse) et doit etre le verifier() du
   *   contrat ; sinon rien n est garde. ⛔ Aucune cle ici ; le serveur ne signe rien, ne bouge rien ; le holder reclame depuis SON wallet. */
  if (chemin === '/api/ticketpot/parts' || chemin === '/api/ticketpot/signature') {
    const rendreTP = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    /* 2026-10-27 : /api/ticketpot-unit/* = le pot UNIT — SA fiche (son verifyingContract : les digests EIP-712 sont les siens), SES caches,
     *   SES signatures et SON gel ; memes tickets, meme part floor(potAtClose / n) en UNIT brut (18 decimales). Le reste de la route est le meme. */
    const uniteTP = /^\/api\/ticketpot-unit\/(parts|signature)(\?|$)/.test(String(req.url || ''));
    const contratTP = uniteTP ? POT_TP_UNIT.fiche.adresse : TICKETPOT_DEPLOIEMENT.adresse;
    const cleSigTP = uniteTP ? 'ticketpotSigUnit' : 'ticketpotSig', cleGelTP = uniteTP ? 'ticketpotGelUnit' : 'ticketpotGel';
    const cachePartsTP = uniteTP ? partsCacheTPUnit : partsCacheTP, jetonTP = uniteTP ? 'UNIT' : 'USDC';
    if (!contratTP) { rendreTP(200, { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the ticket pot is coming soon' }); return; }
    /* mode SEMAINE (Phil 2026-10-18 : « chaque week on redistribue au nombre de tickets ») : le pot de la semaine vit sur son DERNIER jour ;
     *   poids = entrees de la semaine (jours avec ticket + Week pass +3 + niveau +1/+2, memes plafonds que /api/tirage). Signatures gardees
     *   sous la cle « jour#S » : une signature d un mode n est jamais rendue dans l autre (le digest differe de toute facon). */
    /* 2026-10-24 (revue adverse, audit-ticketpot) : le jour qui FERME une semaine porte le pot de la semaine (son dayPot) */
    const dernierDeSemaine = (jourId) => { const d = dayDeJourIdPot(jourId); return d !== null && jourDe(saisonDe(d * JOUR_MS).fin - JOUR_MS).id === jourId; };
    /* ⛔⛔ LE GEL (2026-10-24, audit-ticketpot 1, HIGH) : les parts etaient RECALCULEES a chaque lecture (niveau du jour, tickets credites en
     *   retard) ; une fois une part signee et servie, un recalcul changeait tous les montants -> signatures caduques, et une re-signature
     *   sur-allouait le pot (A ancien + B nouveau > potAtClose : le dernier a reclamer etait refuse AmountOverPot). A la PREMIERE signature
     *   gardee pour une cle (jour ou jour#S), la table exacte est gelee : { mode, poids | tickets, potAtClose, at } ; partsDe la relit pour
     *   toujours -> montants et digests ne changent plus. */
    const gelTP = (cle) => ((revenu[cleGelTP] || {})[cle]) || null;
    const gelerTP = (cle, { mode, poids, parts, potAtClose }) => {
      revenu[cleGelTP] = revenu[cleGelTP] || {};
      /* mode JOUR : les tickets = les wallets des parts (partsDuJour rend une part par ticket des que le pot couvre 1 unite chacun ; sinon
       *   aucune part, donc rien a signer ni a geler) */
      revenu[cleGelTP][cle] = { mode, poids: mode === 'SEMAINE' ? { ...poids } : null, tickets: mode === 'SEMAINE' ? null : parts.map((p) => p.wallet), potAtClose: String(potAtClose), at: new Date().toISOString() };
      revenuSale = true;
      return revenu[cleGelTP][cle];
    };
    const partsDe = async (jourId, semaine = false) => {
      const day = dayDeJourIdPot(jourId);
      if (day === null) return { ok: false, etat: 'REFUSE', pourquoi: 'day is JYYYY-MM-DD' };
      /* 2026-10-28 : le pot UNIT se partage par JOUR (son eligibilite est un solde au dernier bloc d UN jour) */
      if (uniteTP && semaine) return { ok: false, etat: 'REFUSE', pourquoi: 'the UNIT pot is shared by day only' };
      const cleTP = jourId + (semaine ? '#S' : '');
      let gel = gelTP(cleTP);
      let poids = null, semaineId = null;
      if (semaine) {
        const s = saisonDe(day * JOUR_MS);
        if (jourDe(s.fin - JOUR_MS).id !== jourId) return { ok: false, etat: 'REFUSE', pourquoi: 'the week pot lives on the LAST day of its week: ' + jourDe(s.fin - JOUR_MS).id };
        const jours = revenu.jours || {}, passes = revenu.passes || {}, ids = joursEntre(s.debut, s.fin);
        /* le bonus de niveau A LA DATE du dernier jour de la semaine (jourId) : les jours avec ticket comptes jusqu a ce jour inclus.
         *   ⛔ Les compteurs XP (revenu.xpEtat : rolls, settles, skins, missions…) sont CUMULES sans historique par jour : cette part-la est
         *   l XP COURANTE. Un niveau franchi apres la semaine par ces compteurs change encore une semaine NON signee ; le gel fige le reste. */
        const jtFin = joursTicketParWallet(jours, passes, jourId, SEUIL_VOLUME_JOUR_USD);
        const niveauFin = (a) => niveauWallet({ compteurs: ((revenu.xpEtat || {}).xp || {})[a] || {}, joursTicket: jtFin[a] || 0 }).level;
        const bonusNiv = bonusNiveauxSemaine(entreesPeriode(jours, ids, SEUIL_VOLUME_JOUR_USD, passes), niveauFin);
        poids = {};
        for (const e of entreesPeriode(jours, ids, SEUIL_VOLUME_JOUR_USD, passes, (revenu.bonusSemaine || {})[s.id] || {}, bonusNiv)) poids[e.adresse] = (poids[e.adresse] || 0) + 1;
        semaineId = s.id;
      }
      let j; try { j = await (uniteTP ? jourChaineTPUnit.obtenir(day, () => lireJourTicketPot({ rpc: rpcServeur, contrat: contratTP }, day), (x) => !!x) : jourChaineTP.obtenir(day, () => lireJourTicketPot({ rpc: rpcServeur, contrat: contratTP }, day), (x) => !!x)); } catch (_) { return { ok: false, etat: 'NON_LU', pourquoi: 'the ticket pot could not be read just now' }; }
      const ticketsCourants = () => (semaine ? Object.keys(poids) : ticketsJour(revenu.jours || {}, jourId, revenu.passes || {}, SEUIL_VOLUME_JOUR_USD));
      /* ⛔ 2026-10-28 (Phil) : le pot UNIT = la MEME liste filtree par >= 10 $ d UNIT au dernier bloc du jour ; non lu -> non eligible.
       *   Le pot USDC garde sa liste entiere. */
      let eligU = null;
      if (uniteTP) { try { eligU = await eligibiliteUnitJour(day, ticketsCourants()); } catch (_) { eligU = null; } }
      const ticketsDuPot = () => (uniteTP ? ticketsCourants().filter((w) => !!(eligU && eligU.parWallet && eligU.parWallet[w] && eligU.parWallet[w].ok === true)) : ticketsCourants());
      const sigs = (uniteTP ? ((revenu.ticketpotSigUnit || {})[jourId + (semaine ? '#S' : '')]) : ((revenu.ticketpotSig || {})[jourId + (semaine ? '#S' : '')])) || {};
      /* une cle signee AVANT le gel (aucune table gardee) : gelee a sa premiere lecture SI toutes ses signatures tiennent encore sur le calcul
       *   courant ; une cle deja derivee (une signature caduque) n est pas gelee sur une table qui n est pas celle qui a ete signee */
      const partsBrutes = j.ferme && !gel && Object.keys(sigs).length ? partsTicketPot({ chainId: 8453, contrat: contratTP, jourId, tickets: ticketsDuPot(), potAtClose: j.potAtClose, signatures: sigs, poids }) : [];
      const sigsTenues = () => Object.keys(sigs).length > 0 && Object.keys(sigs).every((w) => partsBrutes.some((p) => p.wallet === w && p.signature));
      if (!gel && j.ferme && sigsTenues()) gel = gelerTP(cleTP, { mode: semaine ? 'SEMAINE' : 'JOUR', poids, parts: partsBrutes, potAtClose: j.potAtClose });
      if (gel && semaine && gel.poids && typeof gel.poids === 'object') poids = { ...gel.poids };
      const tickets = gel && !semaine && Array.isArray(gel.tickets) ? [...gel.tickets] : ticketsDuPot();
      const potTP = gel ? BigInt(gel.potAtClose) : j.potAtClose;
      const parts = j.ferme ? partsTicketPot({ chainId: 8453, contrat: contratTP, jourId, tickets, potAtClose: potTP, signatures: sigs, poids }) : [];
      /* LA COUVERTURE des index qui font les tickets (ticketpot-parts-serveur.js) : inconnu -> complete false ; le brain ne propose alors
       *   pas de signer ces parts finales */
      const perTP = semaine ? saisonDe(day * JOUR_MS) : jourDe(day * JOUR_MS);
      let curseurTs = null;
      if (BLOCKROLLS_DEPLOIEMENT.adresse && Number.isSafeInteger(revenu.rollsScan)) { try { curseurTs = await horodatageBloc(revenu.rollsScan); } catch (_) { curseurTs = null; } }
      const couverture = couvertureParts({ debutMs: perTP.debut, finMs: perTP.fin, joursIds: joursEntre(perTP.debut, perTP.fin), registreDepuis: revenu.depuis,
        rolls: BLOCKROLLS_DEPLOIEMENT.adresse ? { curseurTs } : null, skins: BLOCKSKINS_SRV ? { joursLus: revenu.skinsLus || {} } : null });
      return { ok: true, day, jourId, mode: semaine ? 'SEMAINE' : 'JOUR', semaine: semaineId, poids, contrat: contratTP, jeton: jetonTP, decimales: uniteTP ? 18 : 6, verifier: j.verifier, ferme: j.ferme, enPause: j.enPause, potAtClose: j.potAtClose.toString(), reste: j.reste.toString(),
        dernierJourSemaine: dernierDeSemaine(jourId), gele: gel ? gel.at : null,
        ...(uniteTP ? { eligibilite: { seuilUsd: 10, lu: !!(eligU && eligU.ok), blocFin: eligU ? eligU.blocFin || null : null, blocAvant: eligU ? eligU.blocAvant || null : null,
          prixFin: eligU ? eligU.prixFin ?? null : null, prixAvant: eligU ? eligU.prixAvant ?? null : null, pourquoi: eligU ? eligU.pourquoi || null : 'not read',
          parWallet: Object.fromEntries(ticketsCourants().map((w) => [w, eligU && eligU.parWallet && eligU.parWallet[w] ? { ok: eligU.parWallet[w].ok, usd: eligU.parWallet[w].usd, pourquoi: eligU.parWallet[w].pourquoi } : { ok: false, usd: null, pourquoi: 'UNIT balance not read' }])) } } : {}),
        nTickets: tickets.length, parts,
        couverture };
    };
    if (chemin === '/api/ticketpot/parts') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { rendreTP(405, { ok: false, pourquoi: 'GET only' }); return; }
      const qTP = new URL(req.url, 'http://x').searchParams;
      const jourId = String(qTP.get('day') || jourDe(Date.now() - JOUR_MS).id);
      const semaineQ = qTP.get('week') === '1';
      (uniteTP ? partsCacheTPUnit.obtenir(jourId + (semaineQ ? '#S' : ''), () => partsDe(jourId, semaineQ)) : partsCacheTP.obtenir(jourId + (semaineQ ? '#S' : ''), () => partsDe(jourId, semaineQ))).then((r) => rendreTP(r.ok ? 200 : r.etat === 'NON_LU' ? 202 : 400, r)).catch(() => rendreTP(202, { ok: false, etat: 'NON_LU', pourquoi: 'the ticket pot could not be read just now' }));
      return;
    }
    if (req.method !== 'POST') { rendreTP(405, { ok: false, pourquoi: 'POST only' }); return; }
    let brutTP = '', tropTP = false;
    req.on('data', (c) => { if (tropTP) return; brutTP += c; if (brutTP.length > 2048) { tropTP = true; rendreTP(413, { ok: false, pourquoi: 'request too large' }); req.destroy(); } });
    req.on('end', () => { if (tropTP) return; (async () => {
      let b = null; try { b = JSON.parse(brutTP || '{}'); } catch (_) { b = null; }
      const jourId = String((b && b.day) || ''), wallet = String((b && b.wallet) || '').toLowerCase(), signature = String((b && b.signature) || '');
      if (!/^J\d{4}-\d{2}-\d{2}$/.test(jourId) || !/^0x[0-9a-f]{40}$/.test(wallet) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) { rendreTP(400, { ok: false, etat: 'REFUSE', pourquoi: 'day (JYYYY-MM-DD), wallet and a 65-byte signature are needed' }); return; }
      const semaine = !!(b && b.week === true);
      /* 2026-10-24 (audit-ticketpot 3) : le dernier jour d une semaine, son dayPot EST le pot de la semaine — ses parts du JOUR ne se signent pas */
      /* le pot UNIT n a pas de pot de semaine : son dernier jour de semaine se partage par jour comme les autres */
      if (!semaine && dernierDeSemaine(jourId)) if (!uniteTP) { rendreTP(400, { ok: false, etat: 'REFUSE', pourquoi: jourId + ' is the last day of its week: its pot is the weekly pot, sign its weekly shares (week: true)' }); return; }
      const r = await partsDe(jourId, semaine);
      if (!r.ok) { rendreTP(r.etat === 'NON_LU' ? 202 : 400, r); return; }
      if (!r.ferme) { rendreTP(400, { ok: false, etat: 'REFUSE', pourquoi: 'day ' + jourId + ' is not closed on chain: nothing is signed before close(day)' }); return; }
      const p = r.parts.find((x) => x.wallet === wallet);
      if (!p) { rendreTP(400, { ok: false, etat: 'REFUSE', pourquoi: wallet + ' held no ticket of ' + jourId }); return; }
      const cleSig = jourId + (semaine ? '#S' : '');
      if (!verifierSignaturePart({ digest: p.digest, signature, verifier: r.verifier })) {
        /* ⛔ 2026-10-24 (revue adverse, 3e tour ticketpot, D1) : le GET sert les parts en cache (60 s), ce POST les recalcule. Une
         *   signature qui recouvre au verifier sur la part SERVIE (en cache) mais pas sur la part fraiche = les parts ont change depuis la
         *   lecture (un ticket credite en retard) : 412 PERIME, le cache est invalide, la part se relit et se resigne — jamais un refus
         *   definitif (seul le 409 ci-dessous l est). */
        let servie = null;
        try { const c = await cachePartsTP.obtenir(cleSig, async () => r); servie = ((c && c.ok && Array.isArray(c.parts)) ? c.parts : []).find((x) => x.wallet === wallet) || null; } catch (_) { servie = null; }
        if (servie && String(servie.digest || '').toLowerCase() !== String(p.digest).toLowerCase() && verifierSignaturePart({ digest: servie.digest, signature, verifier: r.verifier })) {
          cachePartsTP.invalider(cleSig);
          rendreTP(412, { ok: false, etat: 'PERIME', pourquoi: 'the shares of ' + jourId + (semaine ? ' (week)' : '') + ' changed since they were read (a ticket was credited late): read them again and sign the new share of ' + wallet });
          return;
        }
        rendreTP(400, { ok: false, etat: 'REFUSE', pourquoi: 'this signature does not recover to the verifier ' + r.verifier + ' on the share of ' + wallet }); return;
      }
      /* ⛔⛔ GARDE DURE (2026-10-24, audit-ticketpot 1) : les montants deja gardes pour ce JOUR (cle du jour ET cle jour#S : un seul dayPot
       *   sur la chaine) + cette part ne depassent JAMAIS potAtClose, quelle qu en soit la cause ; la part re-deposee de ce wallet dans cette
       *   cle n est pas comptee deux fois (elle est remplacee). Un montant garde illisible -> refuse (jamais compte 0).
       * ⛔⛔ 2026-10-24 (revue adverse du correctif, defaut 1) : « remplacee » ne vaut QUE pour le MEME digest. La signature deja gardee a ete
       *   servie publiquement (GET /api/ticketpot/parts) et reste valide sur la chaine jusqu a sa deadline (claimableUntil) : la remplacer par
       *   une part d un AUTRE digest (table derivee, cle signee avant le gel) laissait l ancienne reclamable ET comptait la nouvelle -> le pot
       *   sur-alloue (A ancien 50 + B nouveau 57,1 > 100 : le dernier a reclamer revertait AmountOverPot). Un autre digest pour ce wallet et
       *   cette cle -> REFUSE ; le meme digest -> idempotent (rien ne change). */
      const dejaSig = (((revenu[cleSigTP] || {})[cleSig]) || {})[wallet];
      if (dejaSig && String(dejaSig.digest || '').toLowerCase() !== String(p.digest).toLowerCase()) { rendreTP(409, { ok: false, etat: 'REFUSE', pourquoi: 'a different share of ' + wallet + ' for ' + jourId + (semaine ? ' (week)' : '') + ' is already signed and served (' + String(dejaSig.amount) + ' raw ' + jetonTP + ', valid on chain until its deadline): it is never replaced by another amount' }); return; }
      let dejaGarde = 0n, illisible = false;
      for (const k of [jourId, jourId + '#S']) {
        for (const [w, x] of Object.entries((revenu[cleSigTP] || {})[k] || {})) {
          if (k === cleSig && w === wallet) continue;
          try { dejaGarde += BigInt(x && x.amount); } catch (_) { illisible = true; }
        }
      }
      if (illisible) { rendreTP(400, { ok: false, etat: 'REFUSE', pourquoi: 'a stored share of ' + jourId + ' has an unreadable amount: nothing more is stored for this day' }); return; }
      if (dejaGarde + BigInt(p.amount) > BigInt(r.potAtClose)) { rendreTP(400, { ok: false, etat: 'REFUSE', pourquoi: 'shares already stored for ' + jourId + ' (' + dejaGarde + ' raw ' + jetonTP + ') plus this one (' + p.amount + ') would exceed its pot at close (' + r.potAtClose + ')' }); return; }
      if (!gelTP(cleSig)) gelerTP(cleSig, r);
      revenu[cleSigTP] = revenu[cleSigTP] || {}; revenu[cleSigTP][cleSig] = revenu[cleSigTP][cleSig] || {};
      revenu[cleSigTP][cleSig][wallet] = { digest: p.digest, signature, amount: p.amount, deadline: p.deadline, ticket: p.ticket, recue: new Date().toISOString() };
      revenuSale = true;
      cachePartsTP.invalider(cleSig); /* le GET suivant rend cette signature (la lecture de chaine, elle, reste en cache) */
      rendreTP(200, { ok: true, jourId, mode: r.mode, wallet, amount: p.amount, deadline: p.deadline });
    })().catch(() => rendreTP(202, { ok: false, etat: 'NON_LU', pourquoi: 'the ticket pot could not be read just now' })); });
    return;
  }

  if (chemin === '/api/jeu/niveau') {
    const rendreN = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': code === 200 ? 'private, max-age=30' : 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { rendreN(405, { ok: false, pourquoi: 'GET only' }); return; }
    const qN = new URL(req.url, 'http://x').searchParams, clesN = [...qN.keys()];
    const wN = String(qN.get('wallet') || '');
    if (clesN.length !== 1 || clesN[0] !== 'wallet' || !/^0x[0-9a-fA-F]{40}$/.test(wN)) { rendreN(400, { ok: false, pourquoi: 'expected ?wallet=0x followed by 40 hex characters, and nothing else' }); return; }
    const aN = wN.toLowerCase(), s = saisonDe(Date.now());
    const enCache = niveauxCache.get(aN);
    if (enCache && Date.now() - enCache.t < 30000 && enCache.semaine === s.id) { rendreN(200, enCache.corps); return; }
    const nv = niveauSrv(aN);
    const aUneEntree = entreesPeriode(revenu.jours || {}, joursEntre(s.debut, s.fin), SEUIL_VOLUME_JOUR_USD, revenu.passes || {}).some((e) => e.adresse === aN);
    const corps = { ok: true, wallet: aN, xp: nv.xp, level: nv.level, base: nv.base, next: nv.next,
      perk: { entries: nv.perk.entrees, draw: 'week', week: s.id, appliesThisWeek: nv.perk.entrees > 0 && aUneEntree, practice: true },
      detail: nv.detail, xpParAction: XP_PAR_ACTION, niveaux: NIVEAUX_XP,
      couverture: { depuis: Object.fromEntries(sourcesXp().map((x) => [x.cle, x.bloc])), luJusqua: { ...(revenu.xpScan || {}) }, trous: (revenu.xpTrous || []).slice(-10) } };
    niveauxCache.set(aN, { t: Date.now(), semaine: s.id, corps });
    if (niveauxCache.size > 500) niveauxCache.delete(niveauxCache.keys().next().value);
    rendreN(200, corps);
    return;
  }

  /* ══ TAM (2026-10-31, phase C) — GET /api/tam/choix?graine=… (le choix du cerveau, par le moteur) et GET /api/tam/oeuvres (les Minted de
   *   TamArt, cache 60 s ; avant le deploiement : liste vide + raison). LECTURE SEULE (tam-serveur.js).
   * ⛔ 2026-11-01 : place AVANT la route /api/jeu, jamais entre elle et BLOCK MISSIONS — test-map-rolls lit cette tranche et y interdit
   *   toute lecture de chaine (cette route lit la chaine : rpcServeur / rpcRails). */
  if (chemin === '/api/tam/choix' || chemin === '/api/tam/oeuvres' || chemin === '/api/tam/certifier') {
    /* 2026-11-01 : un refus de la garde CPU (tam-serveur.js#admettre) porte son code : 503 OCCUPE, 429 TROP ; le reste 200 */
    const rendreT = (o) => { const { statut, ...corps } = o || {}; res.writeHead(statut === 503 || statut === 429 ? statut : 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(statut === 503 ? { 'retry-after': '5' } : statut === 429 ? { 'retry-after': '60' } : {}) }); res.end(JSON.stringify(corps)); };
    const ipT = ipClient(req); /* la meme source d IP que /api/jeu/roll */
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, pourquoi: 'GET only' })); return; }
    /* le cerveau d un block est nourri comme sonderLeReste nourrit celui de IB022 : sa vie lue par vieDuBlock (rpcRails), la tete de lecture, son symbol() */
    /* 2026-11-12: works are minted on TAM art of the economy pack (EP_PACK.TAM_DEPLOIEMENT); the first TamArt stays read (gallery, distinctness) */
    if (!tamSrv) tamSrv = serveurTam({ rpc: rpcServeur, deploiement: EP_PACK.TAM_DEPLOIEMENT, autres: [TAMART_DEPLOIEMENT],
      lireVie: async (jeton) => {
        const v = await vieDuBlock({ rpc: rpcRails, stateView: V4_ADRESSES[8453].stateView, jeton, clesExactes: await clesRails(jeton) });
        let bloc = null; try { bloc = parseInt(await rpcServeur('eth_blockNumber', []), 16); } catch (_) { bloc = null; }
        return v ? { etat: v.etat, vie: v.vie, bloc } : null;
      },
      lireSymbole: async (jeton) => { const x = String(await rpcServeur('eth_call', [{ to: jeton, data: '0x95d89b41' }, 'latest'])).slice(2); const n = parseInt(x.slice(64, 128), 16); return Buffer.from(x.slice(128, 128 + 2 * n), 'hex').toString('utf8'); } });
    const echec = (e) => rendreT({ ok: false, etat: 'NON_LU', pourquoi: String((e && e.message) || e).slice(0, 120) });
    if (chemin === '/api/tam/oeuvres') { void tamSrv.oeuvres().then(rendreT, echec); return; }
    const q = new URL(req.url, 'http://x').searchParams;
    /* 2026-11-01 : une oeuvre REGLEE (curseurs du joueur, ou coup de pouce du cerveau) : les memes certificats, distance contre les mintees */
    if (chemin === '/api/tam/certifier') { void tamSrv.oeuvres().catch(() => null).then(() => tamSrv.certifierParams(q.get('p'), ipT)).then(rendreT, echec); return; }
    void tamSrv.oeuvres().catch(() => null).then(() => tamSrv.choix(q.get('graine'), q.get('block'), q.get('minter'), ipT, q.get('draw'))).then(rendreT, echec);
    return;
  }

  /* ══ LES ROLLS DU JEU (Phil 2026-10-17 23:50) — POST /api/jeu/roll {bloc, score} apres un Roll de l onglet Game ; GET /api/jeu/rolls
   *   -> {ok, rolls:[{t, bloc, score}], maintenant} que la Map relit toutes les 10 s pour faire « rouler » le block UNIT.
   * ⛔ HORS CHAINE, HORS FIL LIVE (voir jeuRolls). 30 POST par minute et par IP ; corps <= JEU_ROLL_CORPS_MAX octets ; un corps qui n est
   *   pas EXACTEMENT {bloc: entier > 0, score: entier 0..5} -> 400. Rien n est lu sur la chaine, rien n est ecrit sur disque. */
  if (chemin === '/api/jeu/rolls' || chemin === '/api/jeu/roll') {
    const rendreJ = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    if (chemin === '/api/jeu/rolls') {
      if (req.method !== 'GET' && req.method !== 'HEAD') { rendreJ(405, { ok: false, pourquoi: 'GET only' }); return; }
      /* `maintenant` : l horloge du serveur, pour que la Map mesure l age d un roll sans comparer deux horloges */
      rendreJ(200, { ok: true, rolls: jeuRolls.slice(-JEU_ROLLS_MAX), maintenant: Date.now() });
      return;
    }
    if (req.method !== 'POST') { rendreJ(405, { ok: false, pourquoi: 'POST only' }); return; }
    const ipJ = ipClient(req);
    const minuteJ = Math.floor(Date.now() / 60000);
    if (jeuRollPosts.minute !== minuteJ) { jeuRollPosts.minute = minuteJ; jeuRollPosts.parIp.clear(); }
    const nJ = (jeuRollPosts.parIp.get(ipJ) || 0) + 1;
    jeuRollPosts.parIp.set(ipJ, nJ);
    if (nJ > JEU_ROLLS_IP_MINUTE) { rendreJ(429, { ok: false, pourquoi: 'too many rolls from here: ' + JEU_ROLLS_IP_MINUTE + ' a minute' }); return; }
    let brutJ = '', octetsJ = 0, tropJ = false;
    req.on('data', (c) => {
      if (tropJ) return;
      octetsJ += c.length; brutJ += c;
      if (octetsJ > JEU_ROLL_CORPS_MAX) { tropJ = true; rendreJ(400, { ok: false, pourquoi: 'body over ' + JEU_ROLL_CORPS_MAX + ' bytes' }); req.destroy(); }
    });
    req.on('end', () => {
      if (tropJ) return;
      let j;
      try { j = JSON.parse(brutJ); } catch { rendreJ(400, { ok: false, pourquoi: 'not JSON' }); return; }
      const forme = j && typeof j === 'object' && !Array.isArray(j) && Object.keys(j).length === 2
        && Number.isSafeInteger(j.bloc) && j.bloc > 0 && Number.isInteger(j.score) && j.score >= 0 && j.score <= 5;
      if (!forme) { rendreJ(400, { ok: false, pourquoi: 'expected {bloc: positive integer, score: 0..5} and nothing else' }); return; }
      jeuRolls.push({ t: Date.now(), bloc: j.bloc, score: j.score });
      if (jeuRolls.length > JEU_ROLLS_MAX) jeuRolls.splice(0, jeuRolls.length - JEU_ROLLS_MAX);
      rendreJ(200, { ok: true, n: jeuRolls.length });
    });
    return;
  }
  /* ══ LE JOURNAL DU JOUR (Phil 2026-10-18) — GET /api/jeu/journal : les evenements du jour UTC, du plus recent au plus ancien, au plus
   *   JOURNAL_MAX. ⛔ AUCUNE LECTURE DE CHAINE ICI : la memoire du minuteur (lireJournalJeu) + les rolls practice (LECTURE de jeuRolls,
   *   dans la route du jeu) ; `block` = le block cree par ce wallet, lu dans l index des createurs (createurParBlock), null sinon. Perime
   *   possible : `lu` dit quand la chaine a ete lue pour la derniere fois, `couvreLaJournee` si la lecture remonte a minuit UTC. */
  if (chemin === '/api/jeu/journal') {
    const rendreJl = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(req.method === 'HEAD' ? undefined : JSON.stringify(o)); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { rendreJl(405, { ok: false, pourquoi: 'GET only' }); return; }
    const jJl = jourDe(Date.now());
    /* ⛔ 2e verdict 2026-10-23 (defaut 3) : la reponse sert au plus JOURNAL_MAX (100) evenements, la memoire en garde JOURNAL_GARDE (400).
     *  Avec 101..400 evenements du jour, coupes valait 0 et couvreLaJournee true alors que les plus anciens n etaient PAS servis. Le drapeau
     *  dit ce qui est SERVI : coupes = coupes de la memoire + evenements du jour non servis ; couvreLaJournee faux des qu un seul manque. */
    const gJl = garderJournal(journalEtat.jour === jJl.id ? journalEtat.evenements : [], evenementsPractice(jeuRolls.slice(-JEU_ROLLS_MAX)), { depuisMs: jJl.debut, max: JOURNAL_MAX });
    const tousJl = gJl.evenements;
    const walletsJl = new Set(tousJl.map((e) => e.wallet).filter(Boolean)), blocDeJl = new Map();
    if (walletsJl.size) for (const [jeton, createur] of createurParBlock) if (walletsJl.has(createur) && !blocDeJl.has(createur)) blocDeJl.set(createur, jeton);
    const cJl = contratsJournal();
    const memeJourJl = journalEtat.jour === jJl.id, cvJl = couvertureJournal();
    const coupesMemoireJl = memeJourJl ? cvJl.coupes : 0;
    rendreJl(200, { ok: true, jour: jJl.id, lu: journalEtat.lu ? new Date(journalEtat.lu).toISOString() : null, maintenant: Date.now(),
      couvertureDepuis: memeJourJl ? cvJl.couvertureDepuis : null, couvreLaJournee: memeJourJl && cvJl.couvreLaJournee === true && gJl.coupes === 0,
      premierBlocDuJour: memeJourJl ? cvJl.premierBlocDuJour : null, secondesParBloc: cvJl.secondesParBloc, profondeurMax: cvJl.profondeurMax,
      rattrapage: memeJourJl ? cvJl.rattrapage : null, coupes: coupesMemoireJl + gJl.coupes, coupesMemoire: coupesMemoireJl, coupesEnvoi: gJl.coupes,
      fenetresRattrapage: cvJl.fenetresRattrapage, restaure: cvJl.restaure, restaureDe: cvJl.restaureDe, sauvegardesRefusees: cvJl.sauvegardesRefusees,
      scanJusqua: journalEtat.curseur, sources: { rolls: cJl.rolls, skins: cJl.skins, practice: true, duels: cJl.duels, missions: cJl.missions },
      evenements: avecBlocks(tousJl, (w) => blocDeJl.get(w) || null) });
    return;
  }

  /* ══ LES SLOTS (2026-10-23) — GET /api/slots : la fiche de BlockSlots, LECTURE SEULE, aucune lecture de chaine ici (l app lit le pot et
   *   ses points elle-meme, par eth_call). Sans adresse ecrite (noter-deploiement-slots.mjs) : PAS_OUVERT, et la carte reste cachee.
   *   Le prix, la part du pot et la table viennent de la FICHE (constructeur), jamais tapes ici. */
  /* ══ LES JETONS MISABLES (2026-10-24) — GET /api/misables : la liste des jetons qui peuvent payer un jeu (swap exact-output en USDC),
   *   leurs ecarts mesures a 0,50 / 5 / 10 USDC et la regle ; LECTURE SEULE, cache 60 s (misables()). */
  if (chemin === '/api/misables') {
    const rendreMi = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(o); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, pourquoi: 'GET only' })); return; }
    void misables().then(rendreMi, (e) => rendreMi(JSON.stringify({ ok: false, etat: 'NON_LU', pourquoi: String((e && e.message) || e).slice(0, 120), misables: [], lignes: [] })));
    return;
  }

  if (chemin === '/api/slots') {
    const rendreS = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, pourquoi: 'GET only' })); return; }
    /* 2026-11-12: the served Spin (spin-actif.js): the new Spin once recorded (its dev share paid through the router: devRouteur), else the live one */
    const contratSlots = SPIN_ACTIF ? SPIN_ACTIF.contrat : null;
    if (!contratSlots) { rendreS({ ok: false, etat: 'PAS_OUVERT' }); return; }
    const sc = SPIN_ACTIF.config;
    rendreS({ ok: true, etat: 'OUVERT', contrat: contratSlots, bloc: SPIN_ACTIF.bloc, usdc: String(sc.usdc).toLowerCase(), prixSpin: String(sc.spinPrice), potShareBps: Number(sc.potShareBps),
      prizes: sc.prizes.map(String), esperanceBrut: String(SPIN_ACTIF.esperanceBrut), probGainBps: Number(SPIN_ACTIF.probGainBps), fenetre: 256, delai: 2,
      devRouteur: SPIN_ACTIF.devRouteur, contratAvant: SPIN_ACTIF.avant ? SPIN_ACTIF.avant.contrat : null,
      /* v4 : l app dit si le serveur regle les spins tout seul (son regleur) ; le temps de bloc MESURE par le regleur s il tourne */
      regleur: (() => { const e = regleurSlots.etat(); return { etat: e.etat, adresse: e.adresse || null, msParBlocMesure: e.msParBlocMesure ?? null, dernierRegle: e.dernierRegle ? e.dernierRegle.a : null }; })() });
    return;
  }

  /* ══ LES DUELS (2026-10-18) — GET /api/duels : les duels lus sur la chaine (lireDuelsSrv), LECTURE SEULE. Sans fiche signee : PAS_OUVERT et
   *   aucune lecture de chaine. Pas encore lus : NON_LU (jamais une liste vide qui voudrait dire « aucun duel »). Chaque duel ouvert porte les
   *   blocks de son createur que le serveur connait (createurParBlock) : la Map pose le defi a cote de SON block. */
  if (chemin === '/api/duels') {
    const rendreD = (o) => { res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); };
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ ok: false, pourquoi: 'GET only' })); return; }
    /* 2026-10-24 : BlockDuelsV2 servi (fiche avec adresse ET bloc) -> /api/duels lit v2 (version: 2) ; sinon v1, inchange */
    const lv2 = duelsV2();
    if (lv2) {
      void sParBlocSrv();
      const blocsDuCreateur = (cr) => { const l = []; for (const [jeton, createur] of createurParBlock) if (createur === cr && l.length < 5) l.push(String(jeton).toLowerCase()); return l; };
      /* revue 2026-10-24 n°2 : la fenetre dite avant un join suit un changement de temps de bloc (mesure courte, sParBlocServi) */
      void mesureCourteSrv.lire();
      /* R2 (test live Grok game39) : apres un recu (?frais=1), le tour est force et ATTENDU (3 s au plus) avant de repondre ; sinon, comme avant */
      void (async () => {
        try { await lireAvantReponse(lv2, { frais: demandeFraiche(req.url) }); } catch (_) { /* la reponse dit l etat lu, quel qu il soit */ }
        rendreD(reponseDuelsV2({ lecteur: lv2, fiche: DUELS_V2_DEPLOIEMENT, maintenant: Math.floor(Date.now() / 1000), sParBloc: sParBlocServi(), blocksDe: blocsDuCreateur }));
      })();
      return;
    }
    const regles = { miseMin: MISE_MIN_DUEL.toString(), expirationMinS: EXP_MIN_DUEL, expirationMaxS: EXP_MAX_DUEL, partageBps: { gagnant: 9000, pool: 700, dev: 300 } };
    const contrat = contratDuels();
    if (!contrat) { rendreD({ ok: false, etat: 'PAS_OUVERT', regles }); return; }
    void lireDuelsSrv();
    const k = (DUELS_DEPLOIEMENT && DUELS_DEPLOIEMENT.constructeur) || {};
    const adrOk = (x) => (/^0x[0-9a-f]{40}$/i.test(String(x || '')) ? String(x).toLowerCase() : null);
    /* 2026-10-24 (audit rolls-duels, option gratuite de celui qui rejoint) : l app ne propose de creer / rejoindre un duel QUE si le regleur du
     *   serveur regle CE contrat (duels-plan-app.js regleurCouvre : ON et le contrat nomme dans etat().contrats) ; sinon regleDuels false.
     *   Revue fix2 (porte D1) : ET il a LU les duels il y a moins de 3 de ses tours, sans erreur depuis (contrats.duels.lu / erreurLecture).
     *   Round 4 (decision du lead) : sur BlockDuels v1 LIVE un regleur ne suffit pas (duels-plan-app.js DUELS_REGLEUR_SUFFIT) -> regleDuels
     *   est TOUJOURS false ici ; le regleur continue de regler les duels deja rejoints */
    const eReg = regleurSlots.etat();
    const regleur = { etat: eReg.etat, adresse: eReg.adresse || null, regleDuels: regleurCouvre(eReg, contrat, Date.now()) };
    const fiche = { contrat, bloc: Number.isSafeInteger(DUELS_DEPLOIEMENT.bloc) ? DUELS_DEPLOIEMENT.bloc : null, usdc: adrOk(k.usdc), devWallet: adrOk(k.devWallet), rewardPool: adrOk(k.rewardPool), regles, regleur };
    /* 2026-10-24 : `echec` = le dernier tour a ECHOUE (pourquoi = son erreur) ; false = la premiere lecture n est pas encore finie. L app ne
     *   promet plus « back in a few seconds » quand les lectures echouent : elle dit que la liste n a pas pu etre lue, et pourquoi. */
    if (duelsSrv.contrat !== contrat || duelsSrv.tete === null) { rendreD({ ok: false, etat: 'NON_LU', ...fiche, echec: !!duelsSrv.erreur, pourquoi: duelsSrv.erreur || 'first read in progress' }); return; }
    /* la liste vient de l ETAT (lireDuelsSrv : nextId + duels(id)), plus des logs : aucun orphelin possible */
    const duels = new Map([...duelsSrv.cache].map(([id, e]) => [id, e.duel])), orphelins = [];
    const maintenant = Math.floor(Date.now() / 1000);
    const tous = [...duels.values()].map((d) => ({ d, e: etatDuelSrv(d, duelsSrv.tete, maintenant).etat }));
    const vivants = tous.filter((x) => !FINIS_DUEL.includes(x.e)).sort((p, q) => (BigInt(q.d.id) > BigInt(p.d.id) ? 1 : -1)).slice(0, 200);
    const finis = tous.filter((x) => FINIS_DUEL.includes(x.e)).sort((p, q) => (BigInt(q.d.id) > BigInt(p.d.id) ? 1 : -1)).slice(0, 20);
    const createurs = new Set(vivants.map((x) => x.d.creator)), blocksDe = new Map();
    for (const [jeton, createur] of createurParBlock) if (createurs.has(createur)) { const l = blocksDe.get(createur) || []; if (l.length < 5) l.push(String(jeton).toLowerCase()); blocksDe.set(createur, l); }
    const enJson = (x) => ({ ...duelEnJson(x.d), etat: x.e, creatorBlocks: blocksDe.get(x.d.creator) || [] });
    rendreD({ ok: true, etat: 'LU', ...fiche, tete: duelsSrv.tete, nextId: duelsSrv.nextId, aLire: duelsSrv.restants, partiel: duelsSrv.restants > 0,
      lu: new Date(duelsSrv.lu).toISOString(), maintenant, erreur: duelsSrv.erreur, orphelins: orphelins.length,
      duels: vivants.map(enJson), recents: finis.map(enJson), exemplePartage: Object.fromEntries(Object.entries(partageDuel(1000000n)).map(([c, v]) => [c, v.toString()])) });
    return;
  }

  /* ══ BLOCK MISSIONS (2026-10-17) — la table des missions, et l ATTESTATION du verifier (missions-attestation.js).
   * ⛔ Le contrat vient du fichier GENERE missions-deploiement.js (adresse null tant que Phil n a pas deploye) : aucune variable
   *   d environnement ne peut le remplacer. Sans adresse -> PAS_OUVERT, AUCUNE lecture de chaine.
   * ⛔ La cle du verifier vit SEULEMENT dans MISSIONS_VERIFIER_KEY (posee par Phil) : jamais loggee, jamais rendue. attester() refuse
   *   de signer si elle n est pas le verifier() du contrat.
   * Lectures (SONDE 2026-10-17, tete 52 726 151) : l en-tete d un bloc vieux de 24 h est servi par base.org ET publicnode ; un eth_call
   *   a ce bloc est servi par base.org (USDC du PoolManager : 21 680 580 USDC vs 21 043 521 a la tete, valeur differente donc vraie) et
   *   REFUSE par publicnode (« Archive requests require a personal token »). D ou : rpcServeur d abord, l archive en repli pour l etat
   *   historique seulement. Les logs de la fenetre vont par rpcHistoire (l archive si posee) : sans archive, une fenetre plus
   *   profonde que ~9 000 blocs n est servie par aucun noeud gratuit -> NON_MESURE, rien signe. NE PROUVE PAS une fenetre de 7 j. */
  if (chemin === '/api/missions' && req.method === 'GET') {
    const repondreM = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!MISSIONS_DEPLOIEMENT.adresse) { repondreM(200, { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the mission board is coming soon' }); return; }
    lireMissions({ rpc: rpcServeur, contrat: MISSIONS_DEPLOIEMENT.adresse })
      .then((r) => repondreM(200, { ok: true, contrat: MISSIONS_DEPLOIEMENT.adresse, ...r }))
      .catch(() => repondreM(202, { ok: false, etat: 'NON_LU', pourquoi: 'the mission board could not be read just now' }));
    return;
  }
  if (chemin === '/api/missions/attestation' && req.method === 'POST') {
    const q = new URL(req.url, 'http://x').searchParams;
    const repondreA = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    if (!MISSIONS_DEPLOIEMENT.adresse) { repondreA(200, { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the mission board is coming soon' }); return; }
    const taskId = Number(q.get('task')), completer = String(q.get('wallet') || '').toLowerCase(), txHash = String(q.get('tx') || '').toLowerCase();
    if (!Number.isSafeInteger(taskId) || taskId < 0 || !/^0x[0-9a-f]{40}$/.test(completer) || !/^0x[0-9a-f]{64}$/.test(txHash)) {
      repondreA(400, { ok: false, etat: 'REFUSE', pourquoi: 'a mission id, a wallet and a transaction hash are needed' }); return;
    }
    if (RPC_ARCHIVE && archiveEpuisee()) { repondreA(202, { ok: false, etat: 'NON_MESURE', pourquoi: 'the archive reads for today are used up: try again after 00:00 UTC' }); return; }
    /* Phil 2026-10-17 soir : « ceux qui participent au draw sont eligibles pour les missions » — le ticket du JOUR (10 $ de volume verifie,
     *   ou pass skin) est exige AVANT toute lecture de chaine : pas de ticket, pas de signature. Le contrat exige en plus la detention. */
    if (!ticketsJour(revenu.jours || {}, jourDe(Date.now()).id, revenu.passes || {}, SEUIL_VOLUME_JOUR_USD).includes(completer)) {
      repondreA(200, { ok: false, etat: 'REFUSE', pourquoi: 'missions are for today\'s ticket holders: trade $' + SEUIL_VOLUME_JOUR_USD + ' today (UNIT or tokenized stocks in the app), or hold a skin pass' }); return;
    }
    const k = taskId + ':' + completer;
    if (attestationsEnCours.has(k) || attestationsEnCours.size >= 2) { repondreA(429, { ok: false, pourquoi: 'busy, send it again in a moment' }); return; }
    attestationsEnCours.add(k);
    attester({ rpcEtat: rpcMissionsEtat, rpcLogs: rpcHistoire, chaineId: 8453, contrat: MISSIONS_DEPLOIEMENT.adresse, cle: process.env.MISSIONS_VERIFIER_KEY || null },
      { taskId, completer, txHash })
      .then((r) => repondreA(r.ok || r.etat === 'REFUSE' || r.etat === 'PAS_OUVERT' ? 200 : 202, r))
      .catch(() => repondreA(202, { ok: false, etat: 'NON_LU', pourquoi: 'the chain could not be read just now' }))
      .finally(() => attestationsEnCours.delete(k));
    return;
  }

  /* ══ SONDE DE DETENTION (2026-10-17) — la mesure du verifier (missions-attestation.mesurerFenetre) sur Base REELLE, 24 h d histoire :
   *   le seul maillon que ni le banc anvil ni le fork « warp » de Grok n exercent (eth_call historique + getLogs sur ~43 200 blocs).
   * Lecture seule, soldes PUBLICS d un jeton et d un compte ; aucune cle, aucune signature. Archive posee exigee ; UN appel toutes les
   *   5 min (le budget d archive est commun) ; la reponse dit les appels d archive consommes. */
  if (chemin === '/api/missions/sonde-detention' && req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    const repondreS = (code, o) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
    const jeton = String(q.get('jeton') || '').toLowerCase(), compte = String(q.get('compte') || '').toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(jeton) || !/^0x[0-9a-f]{40}$/.test(compte)) { repondreS(400, { ok: false, pourquoi: 'jeton and compte addresses are needed' }); return; }
    if (!RPC_ARCHIVE) { repondreS(200, { ok: false, etat: 'NON_MESURE', pourquoi: 'no archive node on this server' }); return; }
    if (archiveEpuisee()) { repondreS(202, { ok: false, etat: 'NON_MESURE', pourquoi: 'archive budget used up for today' }); return; }
    if (Date.now() - sondeDetentionA < 300000) { repondreS(429, { ok: false, pourquoi: 'one probe every 5 minutes', dans: Math.ceil((300000 - (Date.now() - sondeDetentionA)) / 1000) }); return; }
    /* ⛔ chasse 2026-10-17 soir (MED, confirme) : 1 appel / 5 min = 288 / jour x ~44 getLogs d archive ~ 12 600, contre un budget de 3 000 :
     *   n importe qui epuisait l archive commune. Plafond du JOUR (UTC) : SONDE_DETENTION_MAX_JOUR (6 par defaut, ~264 lectures au pire). */
    const jourS = new Date().toISOString().slice(0, 10);
    if (sondeDetentionJour.jour !== jourS) Object.assign(sondeDetentionJour, { jour: jourS, n: 0 });
    if (sondeDetentionJour.n >= SONDE_DETENTION_MAX_JOUR) { repondreS(429, { ok: false, pourquoi: 'the probe budget for today is used up (' + SONDE_DETENTION_MAX_JOUR + ' a day)' }); return; }
    sondeDetentionJour.n += 1;
    sondeDetentionA = Date.now();
    const avant = archiveCompte.appels, t0 = Date.now();
    mesurerFenetre({ rpcEtat: rpcMissionsEtat, rpcLogs: rpcHistoire, tranche: 2000 }, jeton, compte, 86400)
      .then((m) => repondreS(200, { ok: m.ok, etat: m.etat || 'MESURE', pourquoi: m.pourquoi || null, jeton, compte, window: 86400, fin: m.fin, finTs: m.finTs, debut: m.debut,
        blocs: m.fin - m.debut, minimum: m.minimum === undefined ? null : String(m.minimum), soldeDebutLu: m.soldeDebutLu === undefined ? null : String(m.soldeDebutLu),
        soldeFin: m.soldeFin === undefined ? null : String(m.soldeFin), transferts: m.transferts ?? null, appelsArchive: archiveCompte.appels - avant, ms: Date.now() - t0 }))
      .catch((e) => repondreS(202, { ok: false, etat: 'NON_MESURE', pourquoi: masquerCle(String((e && e.message) || e)).slice(0, 160), appelsArchive: archiveCompte.appels - avant, ms: Date.now() - t0 }));
    return;
  }

  /* sonde de sante — pour qu un cron puisse demander « es-tu vivant » sans charger l app */
  if (chemin === '/sante') {
    /* ok:false (et 503) si un module importe par l app n est pas servi : la page repondrait 200 mais serait morte */
    const ok = modulesManquants.length === 0;
    res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    /* ⛔ LE BUILD SERVI, POUR QU UN ONGLET DEJA OUVERT SACHE QU IL EST PERIME (2026-09-17 : Phil lisait
     * une page d avant le deploiement et en concluait que le travail n avait pas ete fait). Lu dans le
     * fichier SERVI, jamais recopie a la main. */
    /* `naissance` : le verdict de la sonde qui simule une naissance entiere contre le hook deploye (voir sonderNaissance). Il ne
     *   change PAS `ok` (un 503 ferait redemarrer le conteneur pour une panne de noeud) — il se LIT : etat PRET, ou la raison. */
    res.end(JSON.stringify({ ok, servis: cache.size, racine: RACINE, build: buildServi(), rails: railsCompteurs,
      naissance: { sonde: naissanceSonde, ...naissanceCompteurs },
      /* les quatre sondes cote a cote : naissance, marche, echange, cerveau — chacune PRET, ou sa raison */
      sondes: { naissance: naissanceSonde.etat, marche: autresSondes.marche, echange: autresSondes.echange, cerveau: autresSondes.cerveau, block: BLOCK_SONDE },
      /* l etat des devises de paire, en compteurs (born / not_born / not_read, passes, lectures) : lu en MEMOIRE, aucune lecture de chaine */
      paires: etatPaires.resume(),
      /* 2026-10-23 : le regleur des slots — OFF (et pourquoi) / ON / ARRETE, son ADRESSE, le dernier reglement, les erreurs ; jamais la cle */
      slotsRegleur: regleurSlots.etat(),
      /* 2026-11-12 : le keeper des buybacks — OFF (et pourquoi) / ON / ARRETE, son adresse, ses compteurs ; jamais la cle */
      buybackKeeper: keeperBuyback.etat(),
      spinDevKeeper: keeperSpinDev.etat(),
      mcpWidget: widgetHtml !== null, trousCreations: trousCreations.slice(-10), trousRelus: trousRelus.slice(-10), noeuds: etatNoeuds, ...(ok ? {} : { modulesManquants }),
      /* 2026-10-16 : le revenu VERIFIE par recu, par ligne et par devise (unites brutes), externe et interne separes — jamais les hashes.
       *   ⛔ BORNES dites : seules les transactions que le client poste sont vues ; l ETH natif (sans log) n est pas compte. */
      revenu: { depuis: revenu.depuis, externe: revenu.externe, interne: revenu.interne, tentatives: revenu.tentatives, transactions: Object.keys(revenu.vus).length,
        bornes: 'only transactions the app reports are seen; native ETH fees (no log) are not counted; amounts are raw units per token' },
      /* le noeud d archive : pose ou non, et sa consommation du jour — jamais son URL */
      archive: { pose: Boolean(RPC_ARCHIVE), noeud: RPC_ARCHIVE ? libelleNoeud(RPC_ARCHIVE) : null, maxJour: ARCHIVE_MAX_JOUR, ...archiveCompte },
      /* 2026-10-10 : l unite de archive.nonEnvoyees, dite a cote (une fois par fenetre et par tour, pas des fenetres distinctes) */
      archiveNonEnvoyeesUnite: ARCHIVE_NON_ENVOYEES_UNITE,
      /* 2026-10-10 : chaque requete JSON-RPC envoyee, par hote (jamais le chemin) et par issue, depuis le demarrage (compterEnvoi ;
       *   ce qui est compte et ce qui ne l est pas : voir envoisNoeuds) */
      envois: envoisNoeuds,
      santeRpc: { appelsLecteurs, misDeCote: SANTE_RPC.instantane(), secoursCle: { ...secoursCompte, maxJour: SECOURS_MAX_JOUR, pose: !!RELAIS_CLE } }, /* game362 */
      /* game341: the page's last-resort read relay — counts only; the keyed node is named by its host, never its path */
      relais: { noeudCle: RELAIS_CLE ? libelleNoeud(RELAIS_CLE) : null, cleDediee: !!String(process.env.BASE_RPC_RELAIS || '').trim(),
        maxJour: RELAIS_MAX_JOUR, jour: RELAIS.jour, appelsCle: RELAIS.cles, servis: RELAIS.servis, refus: RELAIS.refus, echecs: RELAIS.echecs },
      /* 2026-10-10 : requetes /api/prix-usd identiques fusionnees depuis le demarrage (en memoire) */
      prixUsdFusions,
      /* le mode essai se DIT (et seulement quand il est actif : hors essai, cette reponse est celle d avant) */
      ...(ESSAI_SRV.actif ? { essai: { rpc: ESSAI_SRV.rpc } } : {}) }));
    return;
  }

  const cle = chemin === '/' ? '/' + RACINE : chemin;
  const e = cache.get(cle);
  if (!e) {
    /* ⛔ UN 404 EST UN 404. Rediriger vers l accueil ferait passer une faute de frappe pour une
     * page valide, et casserait le temoin negatif de nos sondes de production. */
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    res.end('not served');
    return;
  }
  /* ⛔ 2026-09-14: never 304 HTML/JS — Chrome kept Paid Create / Brain unread after Railway tip. Images still etag. */
  if (!e.image && req.headers['if-none-match'] === e.etag) {
    /* fall through to 200 with full body */
  } else if (e.image && req.headers['if-none-match'] === e.etag) {
    res.writeHead(304, entete(e));
    res.end();
    return;
  }
  /* ⛔ LE CLIENT DOIT AVOIR DEMANDE LE GZIP. On ne le devine pas : un client qui ne l annonce pas
   *    recevra le corps brut, exactement comme avant. */
  const accepteGz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  const blocDemande = cle === '/' + RACINE ? (String(req.url || '').match(/[?&]block=(0x[0-9a-fA-F]{40})(?:&|$)/) || [])[1] : null;
  if (blocDemande) {
    /* ⛔ CE CHEMIN REECRIT LE HTML PAR REQUETE (les balises og du block demande) : le gzip
     *    pre-calcule ne correspond donc PLUS au corps envoye. On compresse a la volee ici, et
     *    seulement ici — servir le gzip du fichier d origine enverrait les mauvaises balises, ce
     *    qui est precisement le genre d erreur qu un cache rendrait indebuggable. */
    apercuBlock(blocDemande).then((tags) => {
      const html = String(e.corps).replace(/<!--og:debut-->[\s\S]*?<!--og:fin-->/, () => '<!--og:debut-->\n' + tags + '\n<!--og:fin-->');
      if (accepteGz) {
        const c = gzipSync(Buffer.from(html, 'utf8'), { level: 6 });
        res.writeHead(200, entete(e, true));
        res.end(req.method === 'HEAD' ? undefined : c);
        return;
      }
      res.writeHead(200, entete(e));
      res.end(req.method === 'HEAD' ? undefined : html);
    }).catch(() => { res.writeHead(200, entete(e)); res.end(req.method === 'HEAD' ? undefined : e.corps); });
    return;
  }
  if (accepteGz && e.gz) {
    res.writeHead(200, entete(e, true));
    res.end(req.method === 'HEAD' ? undefined : e.gz);
    return;
  }
  res.writeHead(200, entete(e));
  res.end(req.method === 'HEAD' ? undefined : e.corps);
}
/* chaque requete s execute sous l etiquette de sa route : le compteur d archive dit QUI depense (parQui / refusParQui) */
createServer((req, res) => consommateurArchive.run(etiquetteRequete(req), () => traiterRequete(req, res))).listen(PORT, '0.0.0.0', () => {
  console.log('tokenized-block sert ' + cache.size + ' fichier(s) sur le port ' + PORT);
  console.log('racine -> ' + RACINE + '  ·  HTML et JS en no-cache, images 24 h');
  consommateurArchive.run('fond prechauffage prix', () => prechaufferFaitsDePool());
  /* 2026-11-08 : la mouche partagee demarre quand le VRAI serveur ecoute (jamais dans un banc qui evalue une tranche du fichier) */
  consommateurArchive.run('fond mouche', () => demarrerMoucheServeur());
  /* 2026-11-09 TBLOCK holders bot: register the webhook once the real server listens, only if the three env values exist */
  tbRegisterWebhook().then((r) => console.log('telegram webhook: ' + r)).catch(() => console.log('telegram webhook: not registered'));
});

/* ── ⛔⛔ POURQUOI UN PRECHAUFFAGE, ET PAS UNE LECTURE A L OUVERTURE DE LA PAGE ──────────────────
 *     MESURE EN PRODUCTION LE 2026-09-29 : les faits de pool lus a la demande echouaient en
 *     « over rate limit » sur le RPC public, donc `glissementBps` valait `null`, donc la porte
 *     d achat etait INERTE — 16 verdicts `NON_MESURE` sur 17 devises. Le filtre existait et ne
 *     filtrait rien : BEc gardait sa puce avec 385 bps de glissement.
 *   ⛔ LA FORME JUSTE EST DONC UN RYTHME LENT, PAS UNE RAFALE A CHAQUE VISITE. Dix-sept devises,
 *     une a la fois, espacees : le RPC ne bronche pas, et les pages lisent un cache tiede.
 *   ⛔ ET LE RESULTAT PORTE SON AGE. Un verdict vieux de dix minutes reste un verdict ; un verdict
 *     dont on ignore l age serait une photo qu on prendrait pour du direct.
 *   ⚠️ CE QUE CA NE CORRIGE PAS : si le RPC refuse pendant tout un cycle, les verdicts restent
 *     inconnus et la porte reste inerte. Elle ne fait alors pas PIRE qu avant, mais elle ne fait
 *     pas son travail — et c est `pourquoiFaits` qui le dira, pas un silence. */
const INTERVALLE_PRECHAUFFE_MS = 4 * 60 * 1000;
const ESPACEMENT_ENTRE_DEVISES_MS = 4000;
async function prechaufferFaitsDePool() {
  const devises = (() => {
    try {
      return pairesProposees(8453)
        .filter((p) => p && (p.type === 'ACTION' || p.type === 'MAJEUR') && /^0x[0-9a-fA-F]{40}$/.test(String(p.adr)))
        .map((p) => String(p.adr).toLowerCase());
    } catch (_) { return []; }
  })();
  if (!devises.length) { console.log('prechauffage : aucune devise a lire'); return; }
  let lus = 0, inconnus = 0;
  for (const adr of devises) {
    /* ⛔ ON PASSE PAR L ENDPOINT INTERNE : un second chemin de lecture aurait diverge du premier. */
    try {
      const j = await fetch('http://127.0.0.1:' + PORT + '/api/prix-usd?adr=' + adr,
        { signal: AbortSignal.timeout(25000) }).then((r) => r.json());
      if (j && typeof j.glissementBps === 'number') lus += 1; else inconnus += 1;
    } catch (_) { inconnus += 1; }
    await new Promise((ok) => setTimeout(ok, ESPACEMENT_ENTRE_DEVISES_MS));
  }
  /* ⛔ LE JOURNAL DIT LES DEUX CHIFFRES. « prechauffage fait » sans le nombre d inconnus serait la
   *   phrase qui a laisse la porte inerte une journee entiere sans que rien ne le crie. */
  /* ⛔⛔ LA TAILLE DU CACHE PERSISTE EST DITE ICI, ET C EST LE SEUL MOYEN DE SAVOIR SI L ECRITURE
   *     MARCHE. Le journal de demarrage annonce « fichier encore vide » AVANT que le premier fait
   *     n arrive : sans ce second chiffre, une ecriture qui echoue en silence laisserait la porte
   *     redevenir inerte au prochain redemarrage, et rien ne le crierait. Deux chiffres cote a
   *     cote : ce qu on vient de lire, et ce qui survivra. */
  console.log('prechauffage des faits de pool : ' + lus + ' lus, ' + inconnus + ' inconnus, sur '
    + devises.length + ' devises · ' + faitsPersistes.size + ' verdict(s) gardes'
    + (FICHIER_FAITS_POOL ? '' : ' (EN MEMOIRE SEULE, aucun volume)'));
  setTimeout(prechaufferFaitsDePool, INTERVALLE_PRECHAUFFE_MS);
}
