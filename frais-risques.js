/* frais-risques.js — LES CHIFFRES ET LE TEXTE de la page publique « Fees & risks » (frais-et-risques.html). Pur : aucune lecture reseau,
 * aucune signature, aucune cle. Chaque montant vient d UNE source du depot, importee ici, jamais tapee :
 *   hook 7030 ............ tokenomics.js (HOOK_7030, HOOK_7030_PPM, HOOKS_PAIENT_DEJA_A6CF) — relu sur la chaine 2026-10-18 : feeWallet a6cf
 *   naissance ............ frais-creation.js (FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR) — hook : fraisCreation 7e14, fraisVie 3e14 (eth_call)
 *   routeur / GM ......... echange.js FRAIS_INTERFACE_BPS, frais-degressif.js PALIERS, frais-du-geste.js FRAIS_GESTE_BPS
 *   BlockRolls ........... blockrolls-deploiement.js (fiche generee ; ROLL_PRICE, PASS_*, POT_SHARE_BPS, rules(1) relus sur 0x0c5b…0fe9)
 *   skins ................ blockskins-actif.js (contrat ACTIF, prix relu) + frais-contrats.js (SALE_FEE_BPS… genere depuis BlockSkins.sol)
 *   missions ............. frais-contrats.js (genere depuis BlockMissionsV3.sol) + missions-deploiement.js (adresse : null = pas deploye)
 *   tirage du jour ....... tirage-saison.js (SEUIL_VOLUME_JOUR_USD, JOURS_PASS_*, BONUS_PASS_SEMAINE)
 *   TicketPot ............ ticketpot-deploiement.js (adresse) ; Duels : AUCUNE fiche dans le depot -> pas deploye
 * ⛔ `rendre(chiffres, live)` prend les chiffres EN PARAMETRE : test-frais-et-risques l appelle avec des sources FAUSSES et exige que la
 *   page dise les valeurs fausses — un chiffre tape a la main ne suivrait pas, et le test rougit.
 * ⛔ `live` = la reponse de /api/tirage (mode du tirage, pot des rolls lu par le serveur), ou null : non lu -> « not read », jamais 0.
 * ⛔ Les risques disent la STRUCTURE (qui signe, d ou vient le hasard, ce que le contrat permet), jamais l intention de quiconque. */
import { HOOK_7030, HOOK_7030_PPM, HOOKS_PAIENT_DEJA_A6CF } from './tokenomics.js';
import { FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR, displayShort } from './frais-creation.js';
import { FRAIS_INTERFACE_BPS } from './echange.js';
import { PALIERS } from './frais-degressif.js';
import { FRAIS_GESTE_BPS } from './frais-du-geste.js';
import { BLOCKROLLS_DEPLOIEMENT } from './blockrolls-deploiement.js';
import { TAILLES, FENETRE } from './blockrolls-plan.js';
import { usdc6 } from './blockrolls-config.js';
import { BLOCKSKINS_ACTIF } from './blockskins-actif.js';
/* 2026-11-12 (the economy pack is live): its rules come from the frozen pack record (configs) and from the generated constants of the very
 *   sources that record hashes (frais-contrats.js); the addresses from the deployment record (economie-pack.js). Never typed. */
import { PACK_ECONOMIE_V2 } from './economie-v2-pack-deploiement.js';
import * as EPK from './economie-pack.js';
import { MISSIONS_DEPLOIEMENT } from './missions-deploiement.js';
import { TICKETPOT_DEPLOIEMENT } from './ticketpot-deploiement.js';
import { DUELS_DEPLOIEMENT } from './duels-deploiement.js';
/* 2026-10-24 : BlockDuelsV2 (le createur gagne par defaut apres la fenetre) — fiche duels-v2-deploiement.js (adresse null tant que Phil n a pas
 *   signe) ; le partage et la fenetre viennent de duels-plan.js (constantes verifiees contre la source compilee par test-duels-plan) */
import { DUELS_V2_DEPLOIEMENT } from './duels-v2-deploiement.js';
import { WINNER_BPS as DUEL_WINNER_BPS, POOL_BPS as DUEL_POOL_BPS, BPS as DUEL_BPS } from './duels-plan.js';
import { secondesPour } from './temps-de-bloc.js';
import { SEUIL_VOLUME_JOUR_USD, JOURS_PASS_SEMAINE, BONUS_PASS_SEMAINE, JOURS_PASS_SKIN } from './tirage-saison.js';
import { FRAIS_CONTRATS } from './frais-contrats.js';
import { reglesValides } from './rolls-regles.js';
/* game360 (audit of this page, 2026-11-11): every new figure read from the module the app runs, never typed */
import { FRAIS_INTERFACE_BPS_CL } from './calldata-aerodrome.js';
import { SEUIL_USD, LIKE_PRICE, LIKE_MIN_HOLD, fmt as fmtTb } from './economie.js';
import { TARGET_USD } from './create-vault-tip.js';
import { SLOTS_DEPLOIEMENT } from './slots-deploiement.js';
import { PRIX_TAM } from './tam-plan.js';
import { FRAIS_MESSAGE_USDC, FRAIS_MESSAGE_TBLOCK } from './messagerie-blocks.js';
import { CONTEST_DEPLOIEMENT } from './block-contest-deploiement.js';
import { LOCK_DEPLOIEMENT } from './lock-deploiement.js';
import { PART_ACHAT_BPS, ACHAT_MIN_USDC } from './achat-tblock-usdc.js';
import { TBLOCK as TBLOCK_REEL } from './tokenomics.js';
/* 2026-11-11: the Bank (Morpho borrow / lend) — rates from banque-frais.js, the browser-safe source banque-morpho.js re-exports */
import { FRAIS_EMPRUNT_BPS, FRAIS_PRET_BPS, FRAIS_SORTIE_BPS, MARGE_EMPRUNT_BPS, PHRASE_PANIER_SEPARE } from './banque-frais.js';
/* game374 (audit of this page, 2026-11-12: 40 claims checked against code and chain) — every figure the audit found typed or wrong now
 *   comes from the module or record that holds it */
import { HOOK_V8, fraisHookBps, HOOK_7030_LU } from './tokenomics.js';
import { DESCRIPTEUR_7030 } from './hook-7030-descripteur.js';
import { ACTIONS_COINBASE, CAUTION_CREATEUR_USD } from './paires.js';
import { HOLD_THRESHOLD_USD, HOLD_PRICE_LOOKBACK_S } from './tblock-hold-regle.js';
import { CLAIM_MIN_HOLD, VAULT_DEVS } from './economie.js';
import { ECONOMIE_DEPLOIEMENT } from './economie-deploiement.js';
import { BUYBACK_DEPLOIEMENT } from './tblock-buyback-deploiement.js';
import { DUREES_JOURS } from './lock.js';
import { REGLE_COURTE as REGLE_POINTS } from './points-vue.js';
import { MESURE_ALLER_RETOUR, TAXE_MAX_FRACTION } from './pool-lanceur-taxe.js';

const ADR = /^0x[0-9a-fA-F]{40}$/;
const deploye = (a) => ADR.test(String(a || ''));
const rc = BLOCKROLLS_DEPLOIEMENT.constructeur;
const skinsActif = BLOCKSKINS_ACTIF; /* 2026-11-12: the contract the app mints and sells on (the pack's Skins) */
const MI = FRAIS_CONTRATS.BlockMissionsV3, SK = FRAIS_CONTRATS.BlockSkins;
const missionsTb = BigInt(MI.FEE_BPS) * BigInt(MI.TB_SHARE_BPS) / 10000n;

/* ⛔ MESURE, PAS UNE CONSTANTE DE CONTRAT : hooks de launchpads TIERS. game374 : la mesure la plus RECENTE, celle de pool-lanceur-taxe.js
 *   (2026-10-26 : 129/129 pools lues vides ; aller-retour sur fork : 99 980 006 964 wei rendus pour 0,001 ETH paye). L ancienne (2026-10-18,
 *   15/15, « 0.0099% ») etait perimee et tronquait 0,0099980 % au lieu de l arrondir. Le pourcentage est CALCULE des deux entiers.
 *   Rien n est dit de l intention de quiconque : c est la structure de ces contrats. */
export const MESURE_LAUNCHPAD = Object.freeze({ taxBps: MESURE_ALLER_RETOUR.taxBps, payeWei: BigInt(MESURE_ALLER_RETOUR.payeWei),
  rendusWei: BigInt(MESURE_ALLER_RETOUR.rendusWei), poolsVides: MESURE_ALLER_RETOUR.poolsVides, poolsLues: MESURE_ALLER_RETOUR.poolsLues,
  date: MESURE_ALLER_RETOUR.date, taxeMaxPct: Math.round(TAXE_MAX_FRACTION * 100) });

/* ⛔ MESURE (game374, R-buyback-2) : l etat des deux contrats de rachat, LU par eth_call sur https://mainnet.base.org le 2026-11-12 (bloc
 *   >= 56 267 519) : solde ETH 0 et lastBuyAt() 0 sur les deux ; TBLOCK.balanceOf = 0 (v1) et 150 000e18 (v2). La page dit la date de la
 *   lecture : ce n est pas un etat garanti apres. Les adresses viennent des fiches (tblock-buyback-deploiement.js, economie-deploiement.js). */
export const MESURE_BUYBACK = Object.freeze({ date: '2026-11-12', ethWei: [0n, 0n], derniersAchats: [0, 0],
  tblock: [0n, 150000000000000000000000n], adresses: Object.freeze([BUYBACK_DEPLOIEMENT.adresse, ECONOMIE_DEPLOIEMENT.adresseBuyback].map((a) => String(a || '').toLowerCase())) });

const FC = FRAIS_CONTRATS;
const ACTIONS = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));
const VC = ECONOMIE_DEPLOIEMENT.vault.config;
const cfgPack = (l) => PACK_ECONOMIE_V2.etapes.find((e) => e.lettre === l).config;
const LC = cfgPack('L'), PC = cfgPack('P'), VC2 = cfgPack('V'), V2 = FRAIS_CONTRATS.TBlockVaultV2, RW = FRAIS_CONTRATS.TBlockLockRewards;

export const CHIFFRES = Object.freeze({
  /* game360: the products the page did not list, read from their deployment data / modules */
  slots: { spinPrice: BigInt(SLOTS_DEPLOIEMENT.constructeur.spinPrice), potShareBps: BigInt(SLOTS_DEPLOIEMENT.constructeur.potShareBps),
    prizes: SLOTS_DEPLOIEMENT.constructeur.prizes.map(BigInt), probGainBps: Number(SLOTS_DEPLOIEMENT.probGainBps), esperance: BigInt(SLOTS_DEPLOIEMENT.esperanceBrut) },
  /* 2026-11-12: TAM art of the pack, paid through the TBLOCK payment router (TamArtV2.sol PRICE_USDC, DEV_BPS); the optional buy after a
   *   USDC payment is gone (the payment itself buys TBLOCK) */
  tam: { prix: BigInt(FRAIS_CONTRATS.TamArtV2.PRICE_USDC), devBps: BigInt(FRAIS_CONTRATS.TamArtV2.DEV_BPS) },
  pack: {
    coeur: { usd: BigInt(LC.likeUsdE18), garde: BigInt(LC.holdUsdE18), pasBps: BigInt(LC.maxStepBps), intervalleS: Number(LC.minInterval) },
    routeur: { minOutPpm: 1000000n - BigInt(PC.minOutBudgetPpm), toleranceBps: EPK.TOLERANCE_BPS },
    skinDevBps: BigInt(FRAIS_CONTRATS.BlockSkinsPack.DEV_BPS),
    vault: { rewardBps: BigInt(VC2.rewardBps), rabaisBps: BigInt(VC2.rebateBps), topBps: BigInt(VC2.topBps), fenetreClaimS: Number(VC2.claimWindow),
      minCommitS: Number(V2.MIN_COMMIT), accessUsd: Number(V2.ACCESS_USD), maxFactor: BigInt(V2.MAX_FACTOR), timeBonus: BigInt(V2.TIME_BONUS), timeFullS: Number(V2.TIME_FULL),
      tiers: [[V2.TIER1_USD, V2.TIER1_BONUS], [V2.TIER2_USD, V2.TIER2_BONUS], [V2.TIER3_USD, V2.TIER3_BONUS]].map(([u, b]) => ({ usd: Number(u), bonus: BigInt(b) })),
      annonceS: Number(V2.RESCUE_DELAY), fenetreS: Number(V2.RESCUE_WINDOW), feedQuietS: Number(V2.FEED_QUIET), feedMax: BigInt(VC2.maxFeedPerCall), feedPauseS: Number(VC2.feedCooldown),
      devs: new Set([VC2.dev, VC2.dev2].map((a) => String(a).toLowerCase())).size },
    recompenses: { moisS: Number(RW.EPOCH), rewardBps: BigInt(RW.REWARD_BPS), fenetreMois: Number(RW.CLAIM_WINDOW), rescueS: Number(RW.RESCUE_DELAY), minJours: EPK.MOIS_MIN_JOURS },
  },
  message: { usdc: FRAIS_MESSAGE_USDC, tblock: FRAIS_MESSAGE_TBLOCK },
  coeur: { prix: LIKE_PRICE, garde: LIKE_MIN_HOLD, seuilUsd: SEUIL_USD,
    /* game374 (F-heart-2): the holders vault's weekly rebate to heart players, from the vault's deployment config + economie.js */
    rabaisBps: BigInt(VC.rebateBps), fenetreClaimS: Number(VC.claimWindow), gardeClaim: CLAIM_MIN_HOLD },
  /* game374 (F-holder-*): the fee exemption's OWN rule (tblock-hold-regle.js), not the heart rule's $15 */
  holder: { seuilUsd: HOLD_THRESHOLD_USD, reculS: HOLD_PRICE_LOOKBACK_S },
  banque: { empruntBps: FRAIS_EMPRUNT_BPS, pretBps: FRAIS_PRET_BPS, sortieBps: FRAIS_SORTIE_BPS, margeBps: MARGE_EMPRUNT_BPS },
  contest: { entree: BigInt(CONTEST_DEPLOIEMENT.config.entryFee), vote: BigInt(CONTEST_DEPLOIEMENT.config.votePrice), maxPot: BigInt(CONTEST_DEPLOIEMENT.config.maxPot), burnBps: BigInt(CONTEST_DEPLOIEMENT.config.burnBps),
    split1: BigInt(CONTEST_DEPLOIEMENT.config.split1), minVotes: Number(CONTEST_DEPLOIEMENT.config.minVotes), minVoters: Number(CONTEST_DEPLOIEMENT.config.minVoters),
    minQualifiees: Number(CONTEST_DEPLOIEMENT.config.minQualifiedEntries) },
  /* game374 (F-lock-3): the app's longest choice (lock.js) and the contract's bound (TBlockLock.sol MAX_LOCK, generated) */
  lock: { minS: Number(LOCK_DEPLOIEMENT.minLockSecondes), retraitS: Number(LOCK_DEPLOIEMENT.retraitSecondes),
    appMaxS: Math.max(...DUREES_JOURS) * 86400, appMinS: Math.min(...DUREES_JOURS) * 86400, contratMaxS: Number(FC.TBlockLock.MAX_LOCK) },
  coffre: { annonceS: Number(FC.TBlockVault.RESCUE_DELAY), fenetreS: Number(FC.TBlockVault.RESCUE_WINDOW), devs: VAULT_DEVS.length,
    feedMax: BigInt(VC.maxFeedPerCall), feedPauseS: Number(VC.feedCooldown) },
  ticketpotRegles: { graceS: Number(FC.TicketPot.GRACE), adminDelaiS: Number(FC.TicketPot.ADMIN_DELAY) },
  slotsFenetre: Number(FC.BlockSlots.SETTLE_WINDOW),
  rollsScoreMin: Number(FC.BlockRolls.MIN_SCORE_FLOOR), rollsScoreMax: TAILLES.length,
  naissanceCaution: { usd: CAUTION_CREATEUR_USD, retraitS: HOOK_7030_LU.delaiRetraitS },
  cl: { bps: FRAIS_INTERFACE_BPS_CL }, naissanceUsd: TARGET_USD,
  hook: { adresse: HOOK_7030.toLowerCase(), walletPpm: BigInt(HOOK_7030_PPM.walletDeFrais), createurPpm: BigInt(HOOK_7030_PPM.createur),
    routeurEnPlus: !HOOKS_PAIENT_DEJA_A6CF.some((h) => h.hook.toLowerCase() === HOOK_7030.toLowerCase()),
    /* game374 (F-trade-4/5, H-1): what the hook does with the creator part when the gate is closed; the non-stock currencies it admits;
     *   and the OLDER V8 hook, whose markets the app still trades (estNotreHook) at fraisHookBps(V8) */
    modeCollateral: HOOK_7030_LU.modeCollateral,
    devisesHorsActions: DESCRIPTEUR_7030.devises.filter((d) => !ACTIONS.has(String(d.adresse).toLowerCase())).map((d) => d.sym),
    v8Bps: BigInt(fraisHookBps(HOOK_V8)), v8PaieDeja: HOOKS_PAIENT_DEJA_A6CF.some((h) => h.hook.toLowerCase() === HOOK_V8.toLowerCase()) },
  naissance: { totalWei: FRAIS_OUVERTURE_WEI, creationWei: FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR, inscriptionWei: CREATE_FEE_WEI_FLOOR },
  routeur: { marcheBps: FRAIS_INTERFACE_BPS, paliers: PALIERS.map((p) => ({ jusquaUsd: p.jusquaUsd, bps: p.bps })) },
  geste: { bps: FRAIS_GESTE_BPS },
  rolls: { adresse: BLOCKROLLS_DEPLOIEMENT.adresse, rollPrice: BigInt(rc.rollPrice), passPrice: BigInt(rc.passPrice), passRolls: Number(rc.passRolls),
    passWindow: Number(rc.passWindow), potShareBps: Number(rc.potShareBps), prize5: BigInt(rc.prize5), prize4: BigInt(rc.prize4),
    prize3: BigInt(rc.prize3), prize2: BigInt(rc.prize2), minScore: Number(rc.minScore), fenetreBlocs: FENETRE },
  skins: { adresse: String(skinsActif.adresse).toLowerCase(), version: skinsActif.version, mintUsdc: BigInt(skinsActif.mintPriceUsdc),
    /* 2026-11-12: no `prochain` any more. The standalone v3 record (blockskins-deploiement.js, adresse null) is retired: Skins ships as
     *   step S of the economy pack. The page shows only the ACTIVE contract and its read-back price, never a contract that is not live. */
    venteBps: BigInt(SK.SALE_FEE_BPS), encherePlusBps: BigInt(SK.MIN_RAISE_BPS), enchereMaxS: BigInt(SK.MAX_AUCTION) },
  missions: { deploye: deploye(MISSIONS_DEPLOIEMENT.adresse), feeBps: BigInt(MI.FEE_BPS), faiseurBps: 10000n - BigInt(MI.FEE_BPS),
    reserveBps: missionsTb * BigInt(MI.RESERVE_SHARE_BPS) / 10000n, devBps: missionsTb * (10000n - BigInt(MI.RESERVE_SHARE_BPS)) / 10000n,
    createurBps: BigInt(MI.FEE_BPS) - missionsTb },
  ticketpot: { deploye: deploye(TICKETPOT_DEPLOIEMENT.adresse) },
  duels: { deploye: deploye(DUELS_DEPLOIEMENT.adresse), /* 2026-10-18 18:20 UTC : LIVE 0x6b76…602c (bloc 52 778 966), lu dans la fiche */
    v2: { deploye: deploye(DUELS_V2_DEPLOIEMENT.adresse), adresse: DUELS_V2_DEPLOIEMENT.adresse },
    gagnantBps: DUEL_WINNER_BPS, poolBps: DUEL_POOL_BPS, devBps: DUEL_BPS - DUEL_WINNER_BPS - DUEL_POOL_BPS, fenetreBlocs: FENETRE },
  tirage: { seuilUsd: SEUIL_VOLUME_JOUR_USD, joursPassSemaine: JOURS_PASS_SEMAINE, bonusPassSemaine: BONUS_PASS_SEMAINE, joursPassSkin: JOURS_PASS_SKIN },
});

/* ------------------------------------------------------------------ l esperance d un roll, EXACTE (fractions BigInt) */
/** la loi de chaque trait de faceOf(hash) si les octets de keccak sont uniformes : bande = ((o0*256+o1) % 361 + 30) % 360 / 60 ; les
 *  quatre autres = un octet % taille. Rend [{ comptes: BigInt[], den }]. Le modulo biaise : 256 % 10 = 6 -> les valeurs 0..5 sortent plus. */
export function loisFace(tailles) {
  const bande = Array(tailles[0]).fill(0n);
  const q = BigInt(Math.floor(65536 / 361)), r = 65536 % 361;
  for (let t = 0; t < 361; t++) bande[Math.floor(((t + 30) % 360) / 60)] += q + (t < r ? 1n : 0n);
  const octet = (m) => Array.from({ length: m }, (_, v) => BigInt(Math.floor(256 / m)) + (v < 256 % m ? 1n : 0n));
  return [{ comptes: bande, den: 65536n }, ...tailles.slice(1).map((m) => ({ comptes: octet(m), den: 256n }))];
}
function distribution(probas) { /* probas = [{ a, d }] (a/d) -> { num: BigInt[k], den } = P(score = k) */
  let num = [1n], den = 1n;
  for (const { a, d } of probas) {
    const nv = Array(num.length + 1).fill(0n);
    num.forEach((x, k) => { nv[k] += x * (d - a); nv[k + 1] += x * a; });
    num = nv; den *= d;
  }
  return { num, den };
}
/** l esperance de gain d UN roll (unites brutes USDC), AVANT le plafond du pot (qui ne peut que la baisser) :
 *  uniforme = guess au hasard (p = 1/taille) ; meilleur = la valeur la plus probable de chaque trait (le maximum atteignable). */
export function esperanceRoll(cfg, tailles = TAILLES) {
  const prix = (k) => (k < cfg.minScore ? 0n : k === 5 ? BigInt(cfg.prize5) : k === 4 ? BigInt(cfg.prize4) : k === 3 ? BigInt(cfg.prize3) : k === 2 ? BigInt(cfg.prize2) : 0n);
  const ev = (probas) => { const d = distribution(probas); return { num: d.num.reduce((s, x, k) => s + x * prix(k), 0n), den: d.den, pScore: d }; };
  const lois = loisFace(tailles);
  return {
    uniforme: ev(tailles.map((t) => ({ a: 1n, d: BigInt(t) }))),
    meilleur: ev(lois.map((l) => ({ a: l.comptes.reduce((m, x) => (x > m ? x : m), 0n), d: l.den }))),
  };
}

/* ------------------------------------------------------------------ formats (exacts, BigInt, zeros de queue retires) */
function decimal(num, den, maxDec) {
  const n = BigInt(num), d = BigInt(den), e = 10n ** BigInt(maxDec);
  const v = (n * e * 2n + d) / (2n * d); /* arrondi au plus proche */
  const ent = v / e, fr = (v % e).toString().padStart(maxDec, '0').replace(/0+$/, '');
  return ent.toString() + (fr ? '.' + fr : '');
}
export const pctBps = (bps) => decimal(bps, 100n, 4) + '%';
export const pctPpm = (ppm) => decimal(ppm, 10000n, 4) + '%';
export const eth = (wei) => decimal(wei, 10n ** 18n, 18);
export const usdc = (brut) => usdc6(brut) + ' USDC';
/** une fraction d unites brutes USDC -> « 0.0549 » (4 decimales, arrondi au plus proche) */
export const usdc4 = (f) => { const v = (f.num * 10000n * 2n + f.den * 1000000n) / (2n * f.den * 1000000n); return (v / 10000n).toString() + '.' + (v % 10000n).toString().padStart(4, '0'); };
const pctFrac = (num, den) => decimal(num * 100n, den, 1) + '%';
const heures = (s) => decimal(s, 3600n, 2) + ' hours';
const jours = (s) => { const j = decimal(s, 86400n, 2); return j + (j === '1' ? ' day' : ' days'); };
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const court = (a) => esc(displayShort(String(a)));
const lienBase = (a) => '<a href="https://basescan.org/address/' + esc(a) + '" target="_blank" rel="noopener">' + court(a) + '</a>';

/* ------------------------------------------------------------------ le rendu */
const ligne = (quoi, combien, detail) => '<tr><th scope="row">' + quoi + '</th><td class="n">' + combien + '</td><td>' + detail + '</td></tr>';
const carte = (kick, titre, corps) => '<section class="carte"><span class="kick">' + kick + '</span><h2>' + titre + '</h2>' + corps + '</section>';
const table = (lignes) => '<table class="frais"><tbody>' + lignes.join('') + '</tbody></table>';
const pasDeploye = (quoi) => '<p class="note"><b class="etat">Coming soon.</b> ' + quoi + '</p>';

/** le risque des duels, dit par la regle du contrat SERVI : v2 signe -> le defaut au createur, la fenetre au temps de bloc MESURE (live
 *  .tempsDeBloc.sParBloc, sinon « not measured ») ; v2 pas encore signe -> la structure de v1, et pourquoi l app n ouvre pas de nouveau duel. */
export function duelsRisque(du, live) {
  const s = live && live.tempsDeBloc ? Number(live.tempsDeBloc.sParBloc) : NaN;
  const sec = secondesPour(du.fenetreBlocs, Number.isFinite(s) ? s : null);
  const duree = sec === null ? 'the block time was not measured just now' : 'about ' + Math.round(sec) + ' s at the measured block time';
  if (du.v2 && du.v2.deploye) return '<li><b>Duels: settle in time, or the creator wins.</b> A joined duel must be settled in the ' + du.fenetreBlocs
    + ' blocks after its result block (' + duree + '). After that, the creator wins by default: anyone can send it, and it pays like a creator win ('
    + pctBps(du.gagnantBps) + ' to the creator). That includes a tie not settled in time. So the player who joins and wins, or ties, must settle in time. A duel nobody joined can be refunded to its creator once it expires: anyone can send that refund, nothing sends it on its own, and until someone joins, the creator can cancel it at any time. Contract: '
    + lienBase(du.v2.adresse) + '.</li>';
  return '<li><b>Duels: new duels are closed.</b> On the duels contract live on Base today, a joined duel not settled in the ' + du.fenetreBlocs
    + ' blocks after its result block is refunded to both players. The player who joins sees the result first, so they could settle only their wins; the app therefore opens no new duel on it. '
    + 'A second version, where the creator wins by default once that window has passed, is prepared and not signed on Base yet.</li>';
}

/**
 * Le contenu HTML de la page. `C` = CHIFFRES (ou une copie modifiee par le test) ; `live` = /api/tirage ou null.
 */
export function rendre(C, live) {
  const h = C.hook, nb = C.naissance, sk = C.skins, mi = C.missions, ti = C.tirage, bq = C.banque || null, pk = C.pack || null;
  const usdE18 = (x) => EPK.usd(x);
  /* 2026-10-24 (audit rolls-duels) : les gains et le score minimum sont ceux LUS sur le contrat (currentRules, servis par /api/tirage) quand
   *   ils le sont — setRules les change ; sinon ceux de la fiche, DITS comme ceux du deploiement. Qui peut les changer : unitCreator() LU. */
  const lr = live && live.rolls ? live.rolls : null;
  const rgLu = lr && reglesValides({ prizes: lr.prizes, minScore: lr.minScore }) ? lr : null;
  const ro = rgLu ? { ...C.rolls, prize5: BigInt(rgLu.prizes[0]), prize4: BigInt(rgLu.prizes[1]), prize3: BigInt(rgLu.prizes[2]), prize2: BigInt(rgLu.prizes[3]), minScore: rgLu.minScore } : C.rolls;
  const rgMeta = rgLu && rgLu.regles ? rgLu.regles : null;
  const createurLu = lr && lr.regles && /^0x[0-9a-fA-F]{40}$/.test(String(lr.regles.createur || '')) ? String(lr.regles.createur).toLowerCase() : null;
  const maxLu = lr && lr.regles && /^\d+$/.test(String(lr.regles.maxPrize || '')) ? BigInt(lr.regles.maxPrize) : null;
  const E = esperanceRoll(ro);
  const evU = usdc4(E.uniforme), evM = usdc4(E.meilleur);
  const partPot = BigInt(ro.potShareBps), partDev = 10000n - partPot;
  const passPot = ro.passPrice * partPot / 10000n;
  const passRollsEv = { num: E.meilleur.num * BigInt(ro.passRolls), den: E.meilleur.den };
  /* le pass perd-il en moyenne ? 30 x EV (meilleur guess) + part du pot du pass (si chaque acheteur a pris UN pass) < prix -- CALCULE, pas affirme */
  const passPerd = passRollsEv.num + passPot * passRollsEv.den < ro.passPrice * passRollsEv.den;
  const potLu = live && live.rolls && live.rolls.pot != null && /^\d+$/.test(String(live.rolls.pot));
  /* ⛔ 2026-10-18 (Phil : « fini ca, on a tirage weekend et roll ») : plus de « Daily draw » — le pot de la SEMAINE lu par le serveur
   *   (/api/tirage.ticketpot.semaine : dayPot du dernier jour UTC de la semaine) ; non lu -> « not read », jamais un 0 ecrit */
  const ps = live && live.ticketpot && live.ticketpot.semaine ? live.ticketpot.semaine : null;
  const potSemBrut = ps ? String(ps.ferme ? ps.potAtClose : ps.reste) : null;
  const potSemLu = potSemBrut !== null && /^\d+$/.test(potSemBrut);
  /* game374 (F-route-6): the tiers AS frais-degressif.js applies them — `usd <= jusquaUsd` (the top of a tier pays that tier), the monotonic
   *   floor (above a tier, the fee never drops below that tier's top fee, so the lower rate is reached only later), and BPS_MAX when no USD
   *   price is read: rails-api.js passes prixUsdEntree null on every plan of the trade panel (test-frais-verite-374 checks it) */
  const pal = C.routeur.paliers;
  const bpsMax = pal.reduce((m, p) => (p.bps > m ? p.bps : m), 0n);
  const usdTxt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(2));
  const paliers = pal.map((p, i) => {
    if (i === 0) return pctBps(p.bps) + ' up to $' + p.jusquaUsd;
    const plancher = pal.slice(0, i).reduce((m, q) => Math.max(m, q.jusquaUsd * Number(q.bps) / 10000), 0);
    const atteint = plancher * 10000 / Number(p.bps);
    return 'above $' + pal[i - 1].jusquaUsd + ' the fee never drops below $' + plancher.toFixed(2) + ', so the rate falls gradually and reaches '
      + pctBps(p.bps) + ' from $' + usdTxt(atteint) + (p.jusquaUsd != null ? ' up to $' + p.jusquaUsd : '');
  }).join('; ');
  /* game374 (R-custody-5, R-draw-5): the game keeper's state, READ from our server (/api/slots .regleur.etat) — never typed */
  const regEtat = live && live.regleur && typeof live.regleur.etat === 'string' && /^[A-Z_]{2,20}$/.test(live.regleur.etat) ? live.regleur.etat : null;
  const gardien = regEtat === null ? 'its state was not read just now'
    /* game374 review: only 'ON' runs (slots-regleur.js states ON / OFF / ARRETE); any other state is said as not running, never as running */
    : regEtat === 'ON' ? 'running today, read from our server'
      : 'not running today (' + (regEtat === 'OFF' ? 'off' : regEtat === 'ARRETE' ? 'stopped' : 'state ' + regEtat) + ', read from our server)';
  const gardienTirage = regEtat === null ? 'Whether our server\'s game keeper draws them was not read just now.'
    : regEtat === 'ON' ? 'Our server\'s game keeper is running (read from our server) and can close and draw them too.'
      : 'Our server does not draw them today: its game keeper is not running (read from our server).';
  const listeDevises = h.devisesHorsActions && h.devisesHorsActions.length ? h.devisesHorsActions.map(esc).join(', ') + ' or the stock' : 'the stock';
  const partCreateur = pctPpm(h.createurPpm);
  const ct = C.contest, cf = C.coffre, tpr = C.ticketpotRegles, ho = C.holder || { seuilUsd: C.coeur.seuilUsd, reculS: null };
  const splits = [ct.split1].concat(ct.split2 != null ? [ct.split2, ct.split3] : []);
  const rangs = ['top', 'second', 'third'];
  const partage = splits.map((s, i) => [s, i]).filter(([s]) => s > 0n).map(([s, i]) => pctBps(s) + ' of the pot to the ' + rangs[i] + ' entry').join(', ');
  const mb = MESURE_BUYBACK, nbRachats = mb.adresses.filter(deploye).length;
  const minutes = ho.reculS ? 'about ' + Math.round(ho.reculS / 60) + ' minutes ago' : 'a few minutes ago';

  const frais = carte('Fees', 'What each action costs', table([
    ligne('Trade a block', pctPpm(h.walletPpm + h.createurPpm),
      'Taken by the block market\'s hook on every buy and sell: ' + pctPpm(h.walletPpm) + ' to TokenizedBlock, ' + partCreateur
      + ' to the block\'s creator while their deposit stays at or above its minimum and no withdrawal has been asked; that share builds up in the hook and anyone can trigger its payment to the creator. '
      + (h.modeCollateral === 1 ? 'Otherwise that ' + partCreateur + ' is still taken and stays locked in the hook as the block\'s collateral: nothing pays it out. '
        : h.modeCollateral === 0 ? 'Otherwise that ' + partCreateur + ' is not charged. ' : 'Otherwise that ' + partCreateur + ' goes to the block\'s collateral in the hook. ')
      + 'Always in the paired currency (' + listeDevises + '), never in the block. '
      + (h.routeurEnPlus ? 'The app may add its router fee.' : 'The app adds nothing on top for this market.')),
    ...(h.v8Bps != null ? [ligne('Trade a block born on the earlier market contract', pctBps(h.v8Bps),
      'Blocks born before the current market contract keep their rate: ' + pctBps(h.v8Bps) + ' of each buy and sell, all of it to TokenizedBlock. '
      + (h.v8PaieDeja ? 'The app adds nothing on top for these markets.' : 'The app may add its router fee.'))] : []),
    ligne('Other trades routed by the app', pctBps(C.routeur.marcheBps) + ' max',
      'Only when the pool\'s own hook does not already pay us: ' + pctBps(C.routeur.marcheBps) + ' on a single Uniswap v4 market; ' + pctBps(C.cl.bps)
      + ' on an Aerodrome or Uniswap v3 pool (USDC ↔ a stock on its Aerodrome pool, buying or selling TBLOCK), one fee per batch; on a route through several pools, ' + paliers
      + '. When the app cannot read a USD price for what you pay, ' + pctBps(bpsMax) + ' applies at any size; routes built by the trade panel do not read that price today, so they pay '
      + pctBps(bpsMax) + '. Shown on the screen before you sign.'),
    ligne('TBLOCK holders: TBLOCK and USDC ↔ stock trades', '0% app fee',
      'A wallet holding at least $' + ho.seuilUsd + ' of TBLOCK pays no app fee on TBLOCK buys and sells and on USDC ↔ stock trades on Aerodrome made from the trade panel. '
      + 'A stock bought from its own page still pays ' + pctBps(C.cl.bps) + ', and other routes (a single Uniswap v4 market, a route through several pools) still pay their app fee. '
      + 'Our server checks the wallet balance (not the lock) at the lower of the price now and ' + minutes + '; if the check fails, the normal fee applies. Pool and hook fees still apply.'),
    ligne('Buy or sell TBLOCK', pctBps(C.cl.bps) + ' app fee',
      'Route: USDC (or ETH, swapped to USDC first) → wtCOIN on Aerodrome → TBLOCK on its Uniswap v4 pool. A sell goes TBLOCK → wtCOIN on Uniswap v4 → USDC on Aerodrome and pays out in USDC only. '
      + 'One app fee per batch, 0 for TBLOCK holders. On top: the pools\' own fees and the TBLOCK pool\'s hook, which keeps part of each swap and burns part of it. All of it is inside the quote you see before you sign.'),
    ligne('Bring a block to life', eth(nb.totalWei) + ' ETH',
      eth(nb.creationWei) + ' ETH when it is created + ' + eth(nb.inscriptionWei) + ' ETH when its market is registered, inside the same signatures. '
      + 'You also deposit a creator minimum: $' + C.naissanceCaution.usd + ' of the paired currency at today\'s price, or the hook\'s fixed floor for that currency if higher (the hook refuses less than its floor). '
      + 'It stays yours, held by the market\'s hook; taking it back takes a request, then ' + jours(C.naissanceCaution.retraitS) + ', and the creator share stops at the request. '
      + 'The app offers the birth as $' + C.naissanceUsd + ': the ' + eth(nb.totalWei) + ' ETH fee plus the rest in TBLOCK for the holders vault; the creator deposit, gas and the TBLOCK buy\'s pool fees are on top. '
      + 'If your wallet lacks that TBLOCK, the app first offers to buy it with ETH (no app fee; pool fees and the TBLOCK hook apply); if you decline that buy, this birth attempt stops and nothing is sent. '
      + 'After the birth, a separate signature sends that TBLOCK to the holders vault — a gift, not refunded; skipping that one never undoes the birth.'),
    ligne('GM (send tokens to a friend)', pctBps(C.geste.bps),
      'A separate, visible transfer: your friend receives exactly what you typed. Too small to take, or an ETH send: no fee.'),
    ligne('Roll', usdc(ro.rollPrice),
      pctBps(partPot) + ' goes to the roll pot, ' + pctBps(partDev) + ' to TokenizedBlock at once.'),
    /* game370: ONE product. The app's "Week pass" button buys BlockRolls buyPass(); the server reads PassBought and adds the week's tickets.
     *   The page used to list it twice ("Roll pass" here + a price-less "Week pass" in the Game card). */
    ligne('Week pass', usdc(ro.passPrice),
      'From the BlockRolls contract: ' + ro.passRolls + ' rolls to use within ' + heures(ro.passWindow) + ' and one entry per wallet in that UTC day\'s pass pot (a second pass the same day adds to the pot but not a second entry); ' + pctBps(partPot) + ' of the price goes to that pot, ' + pctBps(partDev) + ' to TokenizedBlock. '
      + 'From our server, once it reads the purchase on Base: a ticket every day for ' + jours(ti.joursPassSemaine * 86400) + ' and ' + ti.bonusPassSemaine + ' bonus entries in that week\'s pot (once per wallet per week; a second pass the same week adds none).'),
    ligne('Skin', usdc(sk.mintUsdc),
      (pk ? 'Paid through the TBLOCK payment router, like TAM art: ' + pctBps(pk.skinDevBps) + ' (' + usdc(sk.mintUsdc * pk.skinDevBps / 10000n) + ') stays USDC for TokenizedBlock, the rest buys TBLOCK, all of it for the holders vault. ' : 'All of it to TokenizedBlock. ')
      + 'On a resale (fixed price or auction), the contract takes ' + pctBps(sk.venteBps) + ' of each sale; the seller gets the rest.' + (pk ? ' Skins bought earlier stay yours, each on its own contract and market.' : '')),
    ligne('Mission reward', pctBps(mi.feeBps),
      'Doer ' + pctBps(mi.faiseurBps) + ' · community reward wallet ' + pctBps(mi.reserveBps) + ' (a wallet TokenizedBlock holds, not a contract) · TokenizedBlock ' + pctBps(mi.devBps)
      + (mi.createurBps > 0n ? ' · creator ' + pctBps(mi.createurBps) : '') + ' of each reward.'),
    ligne('Duel', pctBps(C.duels.poolBps + C.duels.devBps) + ' of the pot',
      'Both players stake the same. A decided duel pays ' + pctBps(C.duels.gagnantBps) + ' of the pot to the winner, ' + pctBps(C.duels.poolBps) + ' to the reward pool wallet (an ordinary wallet, not a contract: what it pays out is decided by whoever holds it, not by code) and '
      + pctBps(C.duels.devBps) + ' to TokenizedBlock (plus rounding dust). A tie settled in its window refunds both, no fee.'),
    ligne('Slots spin', usdc(C.slots.spinPrice),
      pctBps(C.slots.potShareBps) + ' goes to the slots prize pot, the rest to TokenizedBlock. Prizes from '
      + usdc(C.slots.prizes.filter((x) => x > 0n).reduce((a, b) => (b < a ? b : a))) + ' to ' + usdc(C.slots.prizes.reduce((a, b) => (b > a ? b : a)))
      + ', paid by the contract from the pot only. A spin wins something ' + (C.slots.probGainBps / 100).toFixed(2) + '% of the time.'),
    ligne('TAM art mint', usdc(C.tam.prix), pk ? 'Paid through the TBLOCK payment router: ' + pctBps(C.tam.devBps) + ' (' + usdc(C.tam.prix * C.tam.devBps / 10000n) + ') stays USDC for TokenizedBlock; the router swaps the rest to TBLOCK '
      + '(USDC → wtCOIN on Aerodrome → TBLOCK on its Uniswap v4 pool; the pools\' fees and the TBLOCK hook apply) and all of it goes to the holders vault. The app sets your minimum at a fresh quote less ' + pctBps(pk.routeur.toleranceBps)
      + ', and the router refuses any minimum under ' + pctPpm(pk.routeur.minOutPpm) + ' of the pools\' spot value: if the pools move past your minimum, the payment is refused whole and nothing is paid. The TAM art contract has no owner and takes no resale fee; works minted on the first TamArt stay readable.'
      : 'All of it goes from you to TokenizedBlock in the mint itself. The TamArt contract has no owner and takes no resale fee.'),
    ligne('Message to a block', usdc(C.message.usdc) + ' or ' + fmtTb(C.message.tblock) + ' TBLOCK', 'One transfer to TokenizedBlock with your message attached: a fee, not a buyback; nothing comes back.'),
    /* 2026-11-12: the hearts of the pack (BlockLikesV2): a dollar price at the contract's kept price, a hold LOCKED, not in the wallet */
    pk ? ligne('Heart (+1)', usdE18(pk.coeur.usd) + ' of TBLOCK', 'Burned from your wallet (sent to the dead address): the TBLOCK you pay is never refunded. The TBLOCK amount is ' + usdE18(pk.coeur.usd)
      + ' at the price the hearts contract keeps: a keeper key writes it, at most ' + (pk.coeur.intervalleS === 3600 ? 'once an hour' : 'once every ' + heures(pk.coeur.intervalleS)) + ' and by at most ' + pctBps(pk.coeur.pasBps) + ' a write, within fixed bounds. '
      + 'A heart needs ' + usdE18(pk.coeur.garde) + ' of TBLOCK locked (at that price); paying never touches the lock. It counts as play for the holders vault and the monthly lock rewards.')
      : ligne('Heart (+1)', fmtTb(C.coeur.prix) + ' TBLOCK', 'Sent to the dead address (burned): the TBLOCK you pay is never refunded. '
      + (C.coeur.rabaisBps != null ? 'Separately, after each week the holders vault may pay that week\'s heart players a share of its free TBLOCK: each player at most ' + pctBps(C.coeur.rabaisBps)
        /* game374 review (TBlockVault.sol owed): the share AND the top player's bonus are each capped at spent * REBATE_BPS */
        + ' of what they burned, plus, for the week\'s top player, a bonus capped at another ' + pctBps(C.coeur.rabaisBps) + ' of what they burned; claimed within ' + jours(C.coeur.fenetreClaimS) + ' by a wallet holding at least ' + fmtTb(C.coeur.gardeClaim) + ' TBLOCK. It pays only if the vault has free TBLOCK; nothing is guaranteed. ' : '')
      + 'After paying, your wallet must still hold the larger of ' + fmtTb(C.coeur.garde) + ' TBLOCK (the contract\'s rule) and $' + C.coeur.seuilUsd + ' of TBLOCK (the app\'s rule).'),
    ...(pk ? [ligne('Holders vault (every week)', 'no fee', 'After each week the vault keeps a budget for that week\'s players: at most ' + pctBps(pk.vault.rewardBps) + ' of its free TBLOCK. '
      /* TBlockVaultV2.owed: the share and the top bonus are each capped at play x REBATE_BPS, THEN scaled by lockFactor / MAX_FACTOR */
      + 'Each player gets at most ' + pctBps(pk.vault.rabaisBps) + ' of what they put in that week (hearts burned + the TBLOCK their TAM art and skin mints bought), plus, for the week\'s top player, a bonus capped at another '
      + pctBps(pk.vault.rabaisBps) + '; each is then scaled by the lock factor out of its maximum ×' + decimal(pk.vault.maxFactor, 10000n, 2) + ': ' + pctFrac(10000n, pk.vault.maxFactor) + ' of it at ×1 ($' + pk.vault.accessUsd + ' locked), '
      + pk.vault.tiers.map((t) => '+' + pctBps(t.bonus) + ' from $' + t.usd.toLocaleString('en-US') + ' locked').join(', ') + ', and up to +' + pctBps(pk.vault.timeBonus) + ' more for ' + jours(pk.vault.timeFullS) + ' left on the lock. '
      + 'Claimed within ' + jours(pk.vault.fenetreClaimS) + ' of the week\'s close by a wallet with $' + pk.vault.accessUsd + ' of TBLOCK locked and a lock date at least ' + jours(pk.vault.minCommitS) + ' ahead. '
      + 'Weeks of the first holders vault stay claimable under its own rule (' + fmtTb(C.coeur.gardeClaim) + ' TBLOCK held in the wallet). It pays only if the vault has free TBLOCK; nothing is guaranteed.')] : []),
    ligne('Block contest', 'entry ' + fmtTb(ct.entree) + ' TBLOCK · vote ' + fmtTb(ct.vote) + ' TBLOCK',
      'An entry goes into the prize pot (capped at ' + fmtTb(ct.maxPot) + ' TBLOCK). A vote is ' + pctBps(ct.burnBps) + ' burned: never refunded. '
      + (ct.split1 != null ? 'After a round ends, anyone (the winner too) can send settle; nothing sends it on its own. The contract then pays ' + partage + ', but only if at least '
        + ct.minQualifiees + ' entries each got ' + ct.minVotes + ' or more votes from ' + ct.minVoters + ' or more wallets; otherwise the whole pot rolls over to later rounds (any part no later round has room for is burned). ' : '')
      + 'The contract has no owner and no withdraw function: the pot leaves only by these rules.'),
    /* 2026-11-11: the Bank row — every rate from banque-frais.js through CHIFFRES.banque; the fee wallet is never printed */
    ...(bq ? [ligne('Bank (borrow or lend on Morpho)', pctBps(bq.empruntBps) + ' to borrow · ' + pctBps(bq.pretBps) + ' to lend',
      'The Bank uses existing Morpho Blue markets on Base. No TokenizedBlock contract holds your funds. '
      + 'Borrow: ' + pctBps(bq.empruntBps) + ' of what you borrow, rounded up, sent to TokenizedBlock right after the borrow: the last call of one batch if your wallet can batch, otherwise a separate transfer your wallet asks you to sign right after the loan. '
      + 'Lend: ' + pctBps(bq.pretBps) + ' on top of what you lend, so your wallet needs the amount plus the fee. '
      + 'Repaying, withdrawing and taking back collateral: ' + (bq.sortieBps === 0n ? 'no app fee' : pctBps(bq.sortieBps) + ' app fee') + '. '
      + 'Morpho\'s own market fee is read on chain for each market and shown in the plan before you sign.')] : []),
    ligne('TBLOCK lock', 'no fee', 'You lock your own TBLOCK for ' + jours(C.lock.appMinS != null ? C.lock.appMinS : C.lock.minS)
      + (C.lock.appMaxS != null ? ' to ' + jours(C.lock.appMaxS) + ' in the app (the contract itself accepts up to ' + jours(C.lock.contratMaxS) + ')' : '')
      + '. While the lock is active (its date ahead, no exit requested), our server counts community points from its on-chain events. ' + esc(REGLE_POINTS)
      + (pk ? ' Monthly lock rewards: the app enrolls the lock in the same batch. Each ' + decimal(pk.recompenses.moisS, 86400n, 2) + '-day month pays the enrolled locks that cover it whole — ' + pk.recompenses.minJours + ' days minimum to be sure of one — and only their holders who played in it (a heart, a TAM art mint or a skin mint): at its close, '
        + pctBps(pk.recompenses.rewardBps) + ' of what the rewards contract holds unassigned, capped, shared by TBLOCK locked × the same commitment bands as the points; claimable for ' + pk.recompenses.fenetreMois + ' months after the close. '
        + 'What it pays is what was deposited into it (wtCOIN or TBLOCK); no rate is promised.' : '')
      + ' Leaving takes two steps (see Risks).'),
    ligne('Daily ticket', 'no entry fee', 'Reach $' + ti.seuilUsd + ' of verified volume in a UTC day (trades, or rolls and the Week pass) and that day\'s ticket is yours: 1 entry in that week\'s reward pot. '
      + 'The ticket costs nothing extra; the trades or rolls that make the volume pay their own fees.'),
  ]) + (mi.deploye ? '' : pasDeploye('Missions: nothing can be posted or paid yet.')));

  const jeux = carte('Game', 'Prizes, and what is real today', table([
    ligne('Roll prizes', usdc([0n, 0n, ro.prize2, ro.prize3, ro.prize4][ro.minScore] ?? ro.prize5) + ' – ' + usdc(ro.prize5),
      'Traits in common with the block\'s face, out of 5: ' + [[2, ro.prize2], [3, ro.prize3], [4, ro.prize4], [5, ro.prize5]].filter(([k]) => k >= ro.minScore).map(([k, p]) => k + ' → ' + usdc(p)).join(', ')
      + '; fewer than ' + ro.minScore + ' → nothing. Never more than the pot holds when the roll is settled. '
      + (rgLu ? 'Read from the contract by our server' + (rgMeta && rgMeta.version ? ' (rules version ' + esc(rgMeta.version) + ')' : '') + '.'
        : 'These are the rules set at deployment: the contract\'s current rules were not read just now.')),
    ligne('Roll pot right now', potLu ? usdc(BigInt(live.rolls.pot)) : '—',
      potLu ? 'Read from the contract by our server' + (live.rolls.potLu ? ' at ' + esc(String(live.rolls.potLu).replace('T', ' ').slice(0, 16)) + ' UTC' : '') + '. It can be empty.'
        : 'The pot was not read just now. It can be empty.'),
    ligne('Pass pot', usdc(passPot) + ' per pass', 'The whole pot of a UTC day goes to one pass buyer of that day (one entry per wallet), drawn from a later block.'),
    ligne('Week\'s reward pot', potSemLu ? usdc(BigInt(potSemBrut)) : '—',
      'Today\'s ticket = 1 entry in this week\'s reward pot. This pot is the TicketPot pot of the week\'s last day'
      + (potSemLu ? ' (' + esc(String(ps.jourId).slice(1)) + ')' : '') + ': the contract refuses deposits before that day. On that day anyone can deposit USDC into it (TokenizedBlock does so by hand) or roll an earlier day\'s unclaimed leftovers into it. Nothing fills it automatically, and no amount is promised. '
      + 'After the week ends (UTC), the pot is split by entries: each share is paid only when TokenizedBlock\'s verifier signs it and the holder (or anyone) claims it within '
      + jours(tpr.graceS) + '; what is not claimed can then be rolled into a later day\'s pot. '
      + (potSemLu ? 'Read from the TicketPot contract by our server (pot of ' + esc(String(ps.jourId).slice(1)) + ', the week\'s last day).' : 'The week\'s pot was not read just now.')),
    ligne('Skin as a ticket', jours(ti.joursPassSkin * 86400), 'Minting a skin gives the ticket of the day it is minted.'),
  ]) + '<p class="note">BlockRolls contract: ' + (deploye(ro.adresse) ? lienBase(ro.adresse) + ' (it has no withdraw function: USDC leaves only through a winning settle or a day draw; who can change the prizes is under Risks).' : 'coming soon.') + '</p>'
    + (C.ticketpot.deploye ? '' : pasDeploye('The week\'s reward pot, shared by entries.'))
    + (C.duels.deploye ? '' : pasDeploye('Duels.')));

  const slotsEv = C.slots.esperance;
  const risques = carte('Risks', 'Read this before you sign', '<ul class="risques">'
    + '<li><b>No custody for your main wallet.</b> It signs every transaction you make in the app; a brain or a batch only prepares the calls, which your wallet shows before you sign. Our server never holds your keys. '
      + 'The server code has room for keys of its own: a game keeper that settles slot spins, winning rolls and joined duels, and closes and draws the pass day (' + gardien + '), and a missions verifier that signs mission completions. Neither can move your wallet, but mission payouts depend on the verifier\'s signature.</li>'
    + '<li><b>The fly trader signs on its own.</b> If you fund the fly (its own page, fly-brain.html), it gets its own wallet, whose key is kept unencrypted in this browser only. That key signs the fly\'s trades with no wallet preview. It can spend only what its wallet holds (the budget and gas you sent). Its caps are enforced by this site\'s page code, not by a contract, so you trust the site\'s code with that budget. '
      + 'Stop halts its trading from this page; Withdraw all sends what the fly wallet holds (stocks as stocks, USDC, ETH) back to the wallet that funded it. Both work only from this browser while it still holds the fly\'s key and a little ETH for gas; if this browser\'s data is cleared without exporting the key, or the key is taken from this browser, they cannot help. Your real protection is a small budget. The money can be lost.</li>'
    + '<li><b>' + (E.meilleur.num < E.meilleur.den * ro.rollPrice ? 'Rolls lose on average.' : 'Rolls can win on average with the best guess — check the numbers.') + '</b> A ' + usdc(ro.rollPrice) + ' roll pays back ' + evU + ' USDC on average with a random guess (' + pctFrac(E.uniforme.num, E.uniforme.den * ro.rollPrice) + ' of its price), and at most '
      + evM + ' USDC (' + pctFrac(E.meilleur.num, E.meilleur.den * ro.rollPrice) + ') with the best possible guess — computed exactly from the contract\'s rules, before the pot cap, which can only lower it.</li>'
    + '<li><b>' + (passPerd ? 'A pass loses on average too.' : 'A pass, on average:') + '</b> Its ' + ro.passRolls + ' rolls pay back at most ' + usdc4(passRollsEv) + ' USDC on average. The pass pot is a draw: the whole pot of a UTC day goes to ONE of that day\'s buyers (one entry per wallet). '
      + 'With n buyers your chance is 1 in n, so on average you get back that day\'s pot divided by its buyers — ' + usdc(passPot) + ' per pass when each buyer bought one; most buyers get nothing from it. '
      + 'Together that ' + (passPerd ? 'stays below' : 'is not below') + ' its price of ' + usdc(ro.passPrice) + ' on average.</li>'
    + '<li><b>Settle in time.</b> A roll must be settled within ' + ro.fenetreBlocs + ' blocks of its target block, or it is lost — no refund (a refund would let players reveal only their wins). Anyone can settle it for you; the prize always goes to the player.</li>'
    /* 2026-10-24 (audit rolls-duels, BlockRolls.sol:193-200 + PoC test_V_SetRulesDrain) : la STRUCTURE, jamais une intention */
    + '<li><b>Who can change the roll prizes.</b> One wallet can: the UNIT creator, as the contract reads it from the TokenizedBlock hook ('
      + (createurLu ? lienBase(createurLu) + ', read by our server' : 'not read just now') + '). It can set each prize up to '
      + (maxLu !== null ? usdc(maxLu) : 'a cap fixed in the contract (not read just now)') + ' and the minimum score from ' + C.rollsScoreMin + ' to ' + C.rollsScoreMax + '; a change applies only to rolls made after it. '
      + 'Nothing in the contract stops that wallet from raising the prizes and then rolling itself, so the roll pot is not out of its reach.</li>'
    /* 2026-10-24 (audit rolls-duels, BlockRolls.sol:261-288 + PoC test_V_DayPotGrind) */
    + '<li><b>The day-pass draw can be re-armed.</b> After a UTC day ends, anyone can close it, which picks a draw block; the draw must then be made within ' + ro.fenetreBlocs
      + ' blocks after that block. If nobody draws in time, the day can be closed again on a new block. A buyer who sees that the hash does not pick them can wait and close again until it does, unless someone else draws in time. '
      + 'With a connected wallet, anyone can close and draw yesterday\'s pass pot from the Game tab; older days are not offered there and can only be drawn by calling the contract directly. ' + gardienTirage + '</li>'
    /* 2026-10-24 (audit rolls-duels, BlockDuels.sol settle / refundExpired + PoC test_V_DuelEV ; v2 : BlockDuelsV2.settleDefault) */
    + duelsRisque(C.duels, live)
    + '<li><b>Where the luck comes from.</b> Faces come from the hash of a Base block, which the Base sequencer produces. The sequencer chooses what goes into each block, so it could in principle steer a block\'s hash; the game trusts it not to. There is no extra randomness source, said rather than hidden.</li>'
    + '<li><b>Launchpad tokens that tax resale.</b> Some third-party launchpad pools on Base use a hook that charges sellers. We measured hooks reporting taxBps() = ' + MESURE_LAUNCHPAD.taxBps
      + ': a wallet not on the hook\'s list that bought and then sold everything got back about ' + decimal(MESURE_LAUNCHPAD.rendusWei * 100n, MESURE_LAUNCHPAD.payeWei, 2) + '% of the ETH it paid, in a test on a copy of the chain ('
      + MESURE_LAUNCHPAD.date + '). New pools on these hooks keep appearing; some hold liquidity, many are empty: on ' + MESURE_LAUNCHPAD.date + ', ' + MESURE_LAUNCHPAD.poolsVides + ' of ' + MESURE_LAUNCHPAD.poolsLues
      + ' we read were empty. The app shows no Buy when such a pool is empty; before it offers a Buy on any other pool with a third-party hook, our server reads the resale tax that hook reports (taxBps()) and refuses above '
      + MESURE_LAUNCHPAD.taxeMaxPct + '%, and if that read fails, it shows no Buy. A hook with no such function is not checked this way and can still tax sellers. This describes how those contracts are built, not anyone\'s intent.</li>'
    + '<li><b>Third-party data can be late.</b> Prices, token lists and charts come from public nodes and indexers that lag or refuse at times. Where the app could not read something, it aims to say so instead of showing a guess. '
      + 'Check your wallet\'s own preview before you sign: it shows what you are signing, but the result is settled on chain (a swap lands within its slippage limit, a spin\'s outcome comes from later blocks).</li>'
    + '<li><b>' + (slotsEv < C.slots.spinPrice ? 'Slots lose on average.' : 'Slots, on average:') + '</b> A ' + usdc(C.slots.spinPrice) + ' spin pays back at most ' + usdc4({ num: slotsEv, den: 1n }) + ' USDC on average (the prize table, before the pot limit). '
      + 'A prize larger than the pot is paid only in part (if the player accepts that) or not at all once ' + C.slotsFenetre + ' blocks have passed.</li>'
    + (pk ? '<li><b>Holders vault.</b> ' + (pk.vault.devs === 2 ? 'Two' : String(pk.vault.devs)) + ' fixed dev wallets can take TBLOCK out of the vault\'s free part: one announces the amount on chain, and after ' + jours(pk.vault.annonceS)
      + ' only that dev can execute it, within ' + jours(pk.vault.fenetreS) + ' after that. A budget already reserved for an ended week (by closeEpoch) is never touched; TBLOCK not yet reserved can be taken, and until an ended week is closed, none of it is reserved. This power has not been given up. '
      + 'Anyone can also call feedContest(): at most ' + (pk.vault.feedPauseS === 86400 ? 'once a day' : 'once every ' + jours(pk.vault.feedPauseS)) + ', it moves up to ' + fmtTb(pk.vault.feedMax) + ' free TBLOCK (and no more than the contest round has room for) to the current contest round\'s pot, only after every ended week with players has been closed, and never in the last '
      + (pk.vault.feedQuietS === 86400 ? 'day' : jours(pk.vault.feedQuietS)) + ' of a week that has players. The first holders vault keeps the same kind of rule for what it still holds.</li>'
      + '<li><b>Monthly lock rewards.</b> A guardian wallet can move reward tokens out of the rewards contract, only after a public notice of ' + heures(pk.recompenses.rescueS) + ' on chain; lockers keep claiming meanwhile, and the role can only be given up. '
      + 'A month pays only the holders who played in it.</li>'
      + '<li><b>The hearts\' dollar price is kept by a key.</b> A keeper key writes the TBLOCK price the hearts contract uses for its dollar rules, within fixed bounds and steps; if it lags the pool, a heart and the $' + pk.vault.accessUsd + ' minimum are worth more or less than their dollar amount at the pool price.</li>'
      + '<li><b>A router payment can be refused.</b> TAM art and skin payments buy TBLOCK in the same transaction; if the pools moved past your minimum, or past the router\'s own bounds, the whole payment reverts and only gas is spent.</li>'
      : '<li><b>Holders vault.</b> ' + (cf.devs === 2 ? 'Two' : String(cf.devs)) + ' fixed dev wallets can take TBLOCK out of the vault\'s free part: one announces the amount on chain, and after ' + jours(cf.annonceS)
      + ' only that dev can execute it, within ' + jours(cf.fenetreS) + ' after that. A budget already reserved for an ended week (by closeEpoch) is never touched; TBLOCK not yet reserved can be taken, and until an ended week is closed, none of it is reserved. This power has not been given up. '
      + 'Anyone can also call feedContest(): at most ' + (cf.feedPauseS === 86400 ? 'once a day' : 'once every ' + jours(cf.feedPauseS)) + ', it moves up to ' + fmtTb(cf.feedMax) + ' free TBLOCK (and no more than the contest round has room for) to the current contest round\'s pot, only after every ended week with players has been closed, and never in the last '
      + (Number(FC.TBlockVault.FEED_QUIET) === 86400 ? 'day' : jours(Number(FC.TBlockVault.FEED_QUIET))) + ' of a week that has players.</li>')
    + '<li><b>Who controls the week\'s reward pot.</b> TicketPot pays each ticket holder only with a signature from TokenizedBlock\'s verifier key, and that signature also sets the amount, so claims depend on that key. '
      + 'No function lets the owner withdraw the pot: USDC leaves only through claims signed by the verifier key. That key decides who is paid and how much, and the owner can replace it after a public notice of '
      + heures(tpr.adminDelaiS) + ' on chain. The owner or a guardian can pause claims.</li>'
    + '<li><b>The holder 0% fee is a server decision, not an on-chain right.</b> It stops if your TBLOCK falls below $' + ho.seuilUsd + ' or if our price read fails.</li>'
    + '<li><b>Locked TBLOCK cannot leave at once.</b> Requesting the withdrawal stops your points at once; you take it back ' + jours(C.lock.retraitS) + ' after the request, or at the lock date if that is later. Cancelling the request keeps the lock.</li>'
    + '<li><b>Contest votes are burned.</b> Anyone willing to burn enough votes can move a small contest.</li>'
    + '<li><b>Buybacks are not running.</b> ' + nbRachats + ' TBLOCK buyback contracts are deployed with no owner. Read on chain on ' + mb.date + ': neither had received ETH or made a buy'
      + (mb.tblock.some((x) => x > 0n) ? '; ' + mb.tblock.map((x, i) => (x > 0n ? 'the ' + (['first', 'second', 'third'][i] || String(i + 1) + 'th') + ' one held ' + fmtTb(x) + ' TBLOCK sent to it by a project wallet, which anyone can move to the holders vault with sweepToDest()' : null)).filter(Boolean).join('; ') : '')
      + '.</li>'
    + '<li><b>Two tokens are named TBLOCK.</b> The real one is ' + lienBase(TBLOCK_REEL) + '. Check the address before you buy or lock: the app hides the old test token that used the same name, but another token can copy the name too.</li>'
    + (bq ? '<li><b>Bank: you can be liquidated.</b> ' + PHRASE_PANIER_SEPARE + ' The app lets you borrow at most ' + pctBps(bq.margeBps)
      + ' of what Morpho allows before liquidation. Morpho is a third-party protocol: its contracts, oracles and liquidations are not ours.</li>' : '')
    + '<li><b>Prices move.</b> A block or a tokenized stock can lose value quickly, and a small pool moves a lot on a small trade.</li>'
    + '</ul>');

  return frais + jeux + risques
    + '<p class="note source">Fees, prices and contract limits on this page come from the deployed contracts\' records, the app\'s fee modules and live reads by our server, not typed into the page. '
    + 'Two figures are dated measurements, given with their date: the launchpad test and the buyback contracts\' state. Hook: '
    + lienBase(h.adresse) + ' · Skins: ' + lienBase(sk.adresse) + '.</p>';
}
