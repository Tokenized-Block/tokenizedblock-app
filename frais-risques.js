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
import { contratActif } from './blockskins-actif.js';
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
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

const ADR = /^0x[0-9a-fA-F]{40}$/;
const deploye = (a) => ADR.test(String(a || ''));
const rc = BLOCKROLLS_DEPLOIEMENT.constructeur;
const skinsActif = contratActif();
const MI = FRAIS_CONTRATS.BlockMissionsV3, SK = FRAIS_CONTRATS.BlockSkins;
const missionsTb = BigInt(MI.FEE_BPS) * BigInt(MI.TB_SHARE_BPS) / 10000n;

/* ⛔ MESURE, PAS UNE CONSTANTE DE CONTRAT : hooks de launchpads TIERS (agent, 2026-10-18, fork 52754400 + chaine). Source : le commentaire
 *   d app.html (fil Trending, « taxBps() = 9999 … revend a 0,0099 % … 15/15 ») et les commits 365b7af / 0442070. Le test exige que app.html
 *   porte encore ces chiffres. Rien n est dit de l intention de quiconque : c est la structure de ces contrats. */
export const MESURE_LAUNCHPAD = Object.freeze({ taxBps: 9999, retourHorsListe: '0.0099%', poolsVides: 15, poolsLues: 15, date: '2026-10-18' });

export const CHIFFRES = Object.freeze({
  /* game360: the products the page did not list, read from their deployment data / modules */
  slots: { spinPrice: BigInt(SLOTS_DEPLOIEMENT.constructeur.spinPrice), potShareBps: BigInt(SLOTS_DEPLOIEMENT.constructeur.potShareBps),
    prizes: SLOTS_DEPLOIEMENT.constructeur.prizes.map(BigInt), probGainBps: Number(SLOTS_DEPLOIEMENT.probGainBps), esperance: BigInt(SLOTS_DEPLOIEMENT.esperanceBrut) },
  tam: { prix: PRIX_TAM, achatBps: PART_ACHAT_BPS, achatMin: ACHAT_MIN_USDC },
  message: { usdc: FRAIS_MESSAGE_USDC, tblock: FRAIS_MESSAGE_TBLOCK },
  coeur: { prix: LIKE_PRICE, garde: LIKE_MIN_HOLD, seuilUsd: SEUIL_USD },
  banque: { empruntBps: FRAIS_EMPRUNT_BPS, pretBps: FRAIS_PRET_BPS, sortieBps: FRAIS_SORTIE_BPS, margeBps: MARGE_EMPRUNT_BPS },
  contest: { entree: BigInt(CONTEST_DEPLOIEMENT.config.entryFee), vote: BigInt(CONTEST_DEPLOIEMENT.config.votePrice), maxPot: BigInt(CONTEST_DEPLOIEMENT.config.maxPot), burnBps: BigInt(CONTEST_DEPLOIEMENT.config.burnBps) },
  lock: { minS: Number(LOCK_DEPLOIEMENT.minLockSecondes), retraitS: Number(LOCK_DEPLOIEMENT.retraitSecondes) },
  cl: { bps: FRAIS_INTERFACE_BPS_CL }, naissanceUsd: TARGET_USD,
  hook: { adresse: HOOK_7030.toLowerCase(), walletPpm: BigInt(HOOK_7030_PPM.walletDeFrais), createurPpm: BigInt(HOOK_7030_PPM.createur),
    routeurEnPlus: !HOOKS_PAIENT_DEJA_A6CF.some((h) => h.hook.toLowerCase() === HOOK_7030.toLowerCase()) },
  naissance: { totalWei: FRAIS_OUVERTURE_WEI, creationWei: FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR, inscriptionWei: CREATE_FEE_WEI_FLOOR },
  routeur: { marcheBps: FRAIS_INTERFACE_BPS, paliers: PALIERS.map((p) => ({ jusquaUsd: p.jusquaUsd, bps: p.bps })) },
  geste: { bps: FRAIS_GESTE_BPS },
  rolls: { adresse: BLOCKROLLS_DEPLOIEMENT.adresse, rollPrice: BigInt(rc.rollPrice), passPrice: BigInt(rc.passPrice), passRolls: Number(rc.passRolls),
    passWindow: Number(rc.passWindow), potShareBps: Number(rc.potShareBps), prize5: BigInt(rc.prize5), prize4: BigInt(rc.prize4),
    prize3: BigInt(rc.prize3), prize2: BigInt(rc.prize2), minScore: Number(rc.minScore), fenetreBlocs: FENETRE },
  skins: { adresse: String(skinsActif.adresse).toLowerCase(), version: skinsActif.version, mintUsdc: BigInt(skinsActif.mintPriceUsdc),
    prochain: deploye(BLOCKSKINS_DEPLOIEMENT.adresse) ? null : { version: BLOCKSKINS_DEPLOIEMENT.version, mintUsdc: BigInt(BLOCKSKINS_DEPLOIEMENT.mintPriceUsdc) },
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
const pasDeploye = (quoi) => '<p class="note"><b class="etat">Not deployed yet.</b> ' + quoi + '</p>';

/** le risque des duels, dit par la regle du contrat SERVI : v2 signe -> le defaut au createur, la fenetre au temps de bloc MESURE (live
 *  .tempsDeBloc.sParBloc, sinon « not measured ») ; v2 pas encore signe -> la structure de v1, et pourquoi l app n ouvre pas de nouveau duel. */
export function duelsRisque(du, live) {
  const s = live && live.tempsDeBloc ? Number(live.tempsDeBloc.sParBloc) : NaN;
  const sec = secondesPour(du.fenetreBlocs, Number.isFinite(s) ? s : null);
  const duree = sec === null ? 'the block time was not measured just now' : 'about ' + Math.round(sec) + ' s at the measured block time';
  if (du.v2 && du.v2.deploye) return '<li><b>Duels: settle in time, or the creator wins.</b> A joined duel must be settled in the ' + du.fenetreBlocs
    + ' blocks after its result block (' + duree + '). After that, the creator wins by default: anyone can send it, and it pays like a creator win ('
    + pctBps(du.gagnantBps) + ' to the creator). That includes a tie not settled in time. So the player who joins and wins, or ties, must settle in time. A duel nobody joined goes back to its creator once it expires. Contract: '
    + lienBase(du.v2.adresse) + '.</li>';
  return '<li><b>Duels: new duels are closed.</b> On the duels contract live on Base today, a joined duel not settled in the ' + du.fenetreBlocs
    + ' blocks after its result block is refunded to both players. The player who joins sees the result first, so they could settle only their wins; the app therefore opens no new duel on it. '
    + 'A second version, where the creator wins by default once that window has passed, is prepared and not signed on Base yet.</li>';
}

/**
 * Le contenu HTML de la page. `C` = CHIFFRES (ou une copie modifiee par le test) ; `live` = /api/tirage ou null.
 */
export function rendre(C, live) {
  const h = C.hook, nb = C.naissance, sk = C.skins, mi = C.missions, ti = C.tirage, bq = C.banque || null;
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
  const paliers = C.routeur.paliers.map((p, i, t) => (p.jusquaUsd != null ? pctBps(p.bps) + ' below $' + p.jusquaUsd
    : pctBps(p.bps) + ' from $' + (t[i - 1] ? t[i - 1].jusquaUsd : 0))).join(', ');

  const frais = carte('Fees', 'What each action costs', table([
    ligne('Trade a block', pctPpm(h.walletPpm + h.createurPpm),
      'Taken by the block market\'s hook on every buy and sell: ' + pctPpm(h.walletPpm) + ' to TokenizedBlock, ' + pctPpm(h.createurPpm)
      + ' to the block\'s creator (while the creator\'s deposit stays in place). Always in the paired currency (ETH, USDC or the stock), never in the block. '
      + (h.routeurEnPlus ? 'The app may add its router fee.' : 'The app adds nothing on top for this market.')),
    ligne('Other trades routed by the app', pctBps(C.routeur.marcheBps) + ' max',
      'Only when the pool\'s own hook does not already pay us: ' + pctBps(C.routeur.marcheBps) + ' on a single Uniswap v4 market; ' + pctBps(C.cl.bps)
      + ' on an Aerodrome or Uniswap v3 pool (USDC ↔ a stock on its Aerodrome pool, buying or selling TBLOCK), one fee per batch; ' + paliers
      + ' on a route through several pools. Shown on the screen before you sign.'),
    ligne('TBLOCK holders', '0% app fee',
      'A wallet holding at least $' + C.coeur.seuilUsd + ' of TBLOCK pays no app fee on TBLOCK buys and sells and on USDC ↔ stock trades on Aerodrome. Our server checks the wallet balance (not the lock) at the lower of the price now and about 10 minutes ago; if the check fails, the normal fee applies. Pool and hook fees still apply.'),
    ligne('Buy or sell TBLOCK', pctBps(C.cl.bps) + ' app fee',
      'Route: USDC (or ETH via USDC) → wtCOIN on Aerodrome → TBLOCK on its Uniswap v4 pool, reversed for a sell; one app fee per batch, 0 for TBLOCK holders. On top: the pools\' own fees and the TBLOCK pool\'s hook, which keeps part of each swap and burns part of it. All of it is inside the quote you see before you sign.'),
    ligne('Optional TBLOCK buy after a USDC payment', pctBps(C.tam.achatBps) + ' of the price',
      'After a USDC payment (today: the TAM mint) the app offers a box, ticked by default, that spends ' + pctBps(C.tam.achatBps) + ' of the price (' + usdc(C.tam.prix * C.tam.achatBps / 10000n) + ' on a ' + usdc(C.tam.prix) + ' mint) to buy TBLOCK into your own wallet, after the payment: one batch when your wallet can group calls, otherwise the same calls signed one by one (if a step stops, the app offers to finish the buy without a new mint). Not offered below ' + usdc(C.tam.achatMin) + '. It pays the TBLOCK route\'s fees above. Untick it to skip.'),
    ligne('Bring a block to life', eth(nb.totalWei) + ' ETH',
      eth(nb.creationWei) + ' ETH when it is created + ' + eth(nb.inscriptionWei) + ' ETH when its market is registered, inside the same signatures. You also deposit a minimum of about $1 in the paired currency (the hook refuses less); it stays yours and, while it stays in place, earns the creator share of each trade. The app offers the birth as $' + C.naissanceUsd + ' in all: after the birth, an optional separate signature sends the rest in TBLOCK to the holders vault — a gift, not refunded; skipping it never stops the birth.'),
    ligne('GM (send tokens to a friend)', pctBps(C.geste.bps),
      'A separate, visible transfer: your friend receives exactly what you typed. Too small to take, or an ETH send: no fee.'),
    ligne('Roll', usdc(ro.rollPrice),
      pctBps(partPot) + ' goes to the roll pot, ' + pctBps(partDev) + ' to TokenizedBlock at once.'),
    ligne('Roll pass', usdc(ro.passPrice),
      ro.passRolls + ' rolls to use within ' + heures(ro.passWindow) + '. ' + pctBps(partPot) + ' goes to that day\'s pass pot, ' + pctBps(partDev) + ' to TokenizedBlock.'),
    ligne('Skin', usdc(sk.mintUsdc),
      'All of it to TokenizedBlock. On a resale (fixed price or auction), the contract takes ' + pctBps(sk.venteBps) + ' of each sale; the seller gets the rest.'
      + (sk.prochain ? ' A new skin contract at ' + usdc(sk.prochain.mintUsdc) + ' is prepared but not signed yet; until it is, the price is this one.' : '')),
    ligne('Mission reward', pctBps(mi.feeBps),
      'Doer ' + pctBps(mi.faiseurBps) + ' · earn pool ' + pctBps(mi.reserveBps) + ' · TokenizedBlock ' + pctBps(mi.devBps)
      + (mi.createurBps > 0n ? ' · creator ' + pctBps(mi.createurBps) : '') + ' of each reward.'),
    ligne('Duel', pctBps(C.duels.poolBps + C.duels.devBps) + ' of the pot',
      'Both players stake the same. A decided duel pays ' + pctBps(C.duels.gagnantBps) + ' of the pot to the winner, ' + pctBps(C.duels.poolBps) + ' to the community reward pool and '
      + pctBps(C.duels.devBps) + ' to TokenizedBlock (plus rounding dust). A tie settled in its window refunds both, no fee.'),
    ligne('Slots spin', usdc(C.slots.spinPrice),
      pctBps(C.slots.potShareBps) + ' goes to the slots prize pot, the rest to TokenizedBlock. Prizes from '
      + usdc(C.slots.prizes.filter((x) => x > 0n).reduce((a, b) => (b < a ? b : a))) + ' to ' + usdc(C.slots.prizes.reduce((a, b) => (b > a ? b : a)))
      + ', paid by the contract from the pot only. A spin wins something ' + (C.slots.probGainBps / 100).toFixed(2) + '% of the time.'),
    ligne('TAM art mint', usdc(C.tam.prix), 'All of it goes from you to TokenizedBlock in the mint itself. The TamArt contract has no owner and takes no resale fee.'),
    ligne('Message to a block', usdc(C.message.usdc) + ' or ' + fmtTb(C.message.tblock) + ' TBLOCK', 'One transfer to TokenizedBlock with your message attached: a fee, not a buyback; nothing comes back.'),
    ligne('Heart (+1)', fmtTb(C.coeur.prix) + ' TBLOCK', 'Sent to the dead address (burned); nothing comes back. After paying, your wallet must still hold the larger of ' + fmtTb(C.coeur.garde) + ' TBLOCK (the contract\'s rule) and $' + C.coeur.seuilUsd + ' of TBLOCK (the app\'s rule).'),
    ligne('Block contest', 'entry ' + fmtTb(C.contest.entree) + ' TBLOCK · vote ' + fmtTb(C.contest.vote) + ' TBLOCK',
      'An entry goes into the prize pot (capped at ' + fmtTb(C.contest.maxPot) + ' TBLOCK). A vote is ' + pctBps(C.contest.burnBps) + ' burned: never refunded. The contract pays the pot by its fixed rules; nobody pays by hand.'),
    /* 2026-11-11: the Bank row — every rate from banque-frais.js through CHIFFRES.banque; the fee wallet is never printed */
    ...(bq ? [ligne('Bank (borrow or lend on Morpho)', pctBps(bq.empruntBps) + ' to borrow · ' + pctBps(bq.pretBps) + ' to lend',
      'The Bank uses existing Morpho Blue markets on Base. No TokenizedBlock contract holds your funds. '
      + 'Borrow: ' + pctBps(bq.empruntBps) + ' of what you borrow, rounded up, sent to TokenizedBlock in the same batch, after the borrow. '
      + 'Lend: ' + pctBps(bq.pretBps) + ' on top of what you lend, so your wallet needs the amount plus the fee. '
      + 'Repaying, withdrawing and taking back collateral: ' + (bq.sortieBps === 0n ? 'no app fee' : pctBps(bq.sortieBps) + ' app fee') + '. '
      + 'Morpho\'s own market fee is read on chain for each market and shown in the plan before you sign.')] : []),
    ligne('TBLOCK lock', 'no fee', 'You lock your own TBLOCK for ' + jours(C.lock.minS) + ' up to 4 years; it earns community points. Leaving takes two steps (see Risks).'),
    ligne('Daily ticket', 'free', 'Reach $' + ti.seuilUsd + ' of verified volume in a UTC day and that day\'s ticket is yours — nothing extra to pay.'),
  ]) + (mi.deploye ? '' : pasDeploye('Missions: the contract is written and tested, not signed on Base. Nothing can be posted or paid yet.')));

  const jeux = carte('Game', 'Prizes, and what is real today', table([
    ligne('Roll prizes', usdc([0n, 0n, ro.prize2, ro.prize3, ro.prize4][ro.minScore] ?? ro.prize5) + ' – ' + usdc(ro.prize5),
      'Traits in common with the block\'s face, out of 5: ' + [[2, ro.prize2], [3, ro.prize3], [4, ro.prize4], [5, ro.prize5]].filter(([k]) => k >= ro.minScore).map(([k, p]) => k + ' → ' + usdc(p)).join(', ')
      + '; fewer than ' + ro.minScore + ' → nothing. Never more than the pot holds when the roll is settled. '
      + (rgLu ? 'Read from the contract by our server' + (rgMeta && rgMeta.version ? ' (rules version ' + esc(rgMeta.version) + ')' : '') + '.'
        : 'These are the rules set at deployment: the contract\'s current rules were not read just now.')),
    ligne('Roll pot right now', potLu ? usdc(BigInt(live.rolls.pot)) : '—',
      potLu ? 'Read from the contract by our server' + (live.rolls.potLu ? ' at ' + esc(String(live.rolls.potLu).replace('T', ' ').slice(0, 16)) + ' UTC' : '') + '. It can be empty.'
        : 'The pot was not read just now. It can be empty.'),
    ligne('Pass pot', usdc(passPot) + ' per pass', 'The whole pot of a UTC day goes to one pass buyer of that day, drawn from a later block.'),
    ligne('Week\'s reward pot', potSemLu ? usdc(BigInt(potSemBrut)) : '—',
      'Today\'s ticket = 1 entry in this week\'s reward pot; the pot is shared by entries after the week closes (UTC). '
      + (potSemLu ? 'Read from the TicketPot contract by our server (pot of ' + esc(String(ps.jourId).slice(1)) + ', the week\'s last day).' : 'The week\'s pot was not read just now.')),
    ligne('Week pass', jours(ti.joursPassSemaine * 86400), 'A ticket every day for ' + jours(ti.joursPassSemaine * 86400) + ' and ' + ti.bonusPassSemaine + ' bonus entries in that week\'s pot.'),
    ligne('Skin as a ticket', jours(ti.joursPassSkin * 86400), 'Minting a skin gives the ticket of the day it is minted.'),
  ]) + '<p class="note">BlockRolls contract: ' + (deploye(ro.adresse) ? lienBase(ro.adresse) + ' (it has no withdraw function: USDC leaves only through a winning settle or a day draw; who can change the prizes is under Risks).' : 'not deployed.') + '</p>'
    + (C.ticketpot.deploye ? '' : pasDeploye('TicketPot (the week\'s reward pot, shared by entries): no contract on Base.'))
    + (C.duels.deploye ? '' : pasDeploye('Duels: no contract exists for them in this app.')));

  const risques = carte('Risks', 'Read this before you sign', '<ul class="risques">'
    + '<li><b>No custody for your main wallet.</b> It signs every transaction you make in the app; a brain or a batch only prepares the calls, which your wallet shows before you sign. Our server never holds your keys. The server holds two operational keys (a slots keeper and a missions verifier): they cannot move your wallet, but mission payouts depend on the verifier\'s signature.</li>'
    + '<li><b>The fly trader signs on its own.</b> If you fund the fly (its own page, fly-brain.html), it gets its own wallet, whose key is kept unencrypted in this browser only. That key signs the fly\'s trades with no wallet preview, within the budget you sent and its caps. Stop and Withdraw all are your protection. The money can be lost.</li>'
    + '<li><b>' + (E.meilleur.num < E.meilleur.den * ro.rollPrice ? 'Rolls lose on average.' : 'Rolls can win on average with the best guess — check the numbers.') + '</b> A ' + usdc(ro.rollPrice) + ' roll pays back ' + evU + ' USDC on average with a random guess (' + pctFrac(E.uniforme.num, E.uniforme.den * ro.rollPrice) + ' of its price), and at most '
      + evM + ' USDC (' + pctFrac(E.meilleur.num, E.meilleur.den * ro.rollPrice) + ') with the best possible guess — computed exactly from the contract\'s rules, before the pot cap, which can only lower it.</li>'
    + '<li><b>' + (passPerd ? 'A pass loses on average too.' : 'A pass, on average:') + '</b> Its ' + ro.passRolls + ' rolls pay back at most ' + usdc4(passRollsEv) + ' USDC on average; your share of the pass pot is that day\'s pot divided by its buyers — '
      + usdc(passPot) + ' per pass when each buyer bought one. Together that ' + (passPerd ? 'stays below' : 'is not below') + ' its price of ' + usdc(ro.passPrice) + '.</li>'
    + '<li><b>Settle in time.</b> A roll must be settled within ' + ro.fenetreBlocs + ' blocks of its target block, or it is lost — no refund (a refund would let players reveal only their wins). Anyone can settle it for you; the prize always goes to the player.</li>'
    /* 2026-10-24 (audit rolls-duels, BlockRolls.sol:193-200 + PoC test_V_SetRulesDrain) : la STRUCTURE, jamais une intention */
    + '<li><b>Who can change the roll prizes.</b> One wallet can: the UNIT creator, as the contract reads it from the TokenizedBlock hook ('
      + (createurLu ? lienBase(createurLu) + ', read by our server' : 'not read just now') + '). It can set each prize up to '
      + (maxLu !== null ? usdc(maxLu) : 'a cap fixed in the contract (not read just now)') + ' and the minimum score from 2 to 5; a change applies only to rolls made after it. '
      + 'Nothing in the contract stops that wallet from raising the prizes and then rolling itself, so the roll pot is not out of its reach.</li>'
    /* 2026-10-24 (audit rolls-duels, BlockRolls.sol:261-288 + PoC test_V_DayPotGrind) */
    + '<li><b>The day-pass draw can be re-armed.</b> After a UTC day ends, anyone can close it, which picks a draw block; the draw must then be made within ' + ro.fenetreBlocs
      + ' blocks after that block. If nobody draws in time, the day can be closed again on a new block. A buyer who sees that the hash does not pick them can wait and close again until it does, unless someone else draws in time. Anyone can draw from the Game tab.</li>'
    /* 2026-10-24 (audit rolls-duels, BlockDuels.sol settle / refundExpired + PoC test_V_DuelEV ; v2 : BlockDuelsV2.settleDefault) */
    + duelsRisque(C.duels, live)
    + '<li><b>Where the luck comes from.</b> Faces come from the hash of a Base block, which the Base sequencer produces. That is the same trust as every block on Base, said rather than hidden.</li>'
    + '<li><b>Launchpad tokens that tax resale.</b> Some third-party launchpad pools on Base use a hook that charges sellers. We measured hooks reporting taxBps() = ' + MESURE_LAUNCHPAD.taxBps
      + ': a wallet off the hook\'s list got back ' + MESURE_LAUNCHPAD.retourHorsListe + ' of its sale in a test on a copy of the chain, and ' + MESURE_LAUNCHPAD.poolsVides + ' of ' + MESURE_LAUNCHPAD.poolsLues
      + ' such ETH pools had no liquidity to quote (' + MESURE_LAUNCHPAD.date + '). The app shows no Buy for them. This describes how those contracts are built, not anyone\'s intent.</li>'
    + '<li><b>Third-party data can be late.</b> Prices, token lists and charts come from public nodes and indexers that lag or refuse at times. When something was not read, the app says so instead of showing a guess; your wallet\'s own preview is the final word.</li>'
    + '<li><b>Slots lose on average.</b> A ' + usdc(C.slots.spinPrice) + ' spin pays back ' + usdc4({ num: C.slots.esperance, den: 1n }) + ' USDC on average.</li>'
    + '<li><b>Holders vault.</b> Two fixed dev wallets can take TBLOCK out of the vault\'s free part: one announces the amount on chain, and after 7 days only that dev can execute it, within a 2-day window. Budgets reserved for players are never touched. This power has not been given up. Anyone can also call feedContest(), which moves free vault TBLOCK to the contest pot.</li>'
    + '<li><b>Who controls the week\'s reward pot.</b> TicketPot pays a winner only with a signature from our server\'s verifier key, so claims depend on that server; the owner or a guardian can pause claims; the owner can never withdraw the pot.</li>'
    + '<li><b>The holder 0% fee is a server decision, not an on-chain right.</b> It stops if your TBLOCK falls below $' + C.coeur.seuilUsd + ' or if our price read fails.</li>'
    + '<li><b>Locked TBLOCK cannot leave at once.</b> Requesting the withdrawal stops your points at once; you take it back ' + jours(C.lock.retraitS) + ' after the request, or at the lock date if that is later. Cancelling the request keeps the lock.</li>'
    + '<li><b>Contest votes are burned.</b> Anyone willing to burn enough votes can move a small contest.</li>'
    + '<li><b>Buybacks are not running.</b> Two TBLOCK buyback contracts are deployed with no owner; neither has been funded or has bought yet.</li>'
    + '<li><b>Two tokens are named TBLOCK.</b> The real one is ' + lienBase(TBLOCK_REEL) + '. Check the address before you buy or lock; the app hides the old test token and any other token showing that name.</li>'
    + (bq ? '<li><b>Bank: you can be liquidated.</b> ' + PHRASE_PANIER_SEPARE + ' The app lets you borrow at most ' + pctBps(bq.margeBps)
      + ' of what Morpho allows before liquidation. Morpho is a third-party protocol: its contracts, oracles and liquidations are not ours.</li>' : '')
    + '<li><b>Prices move.</b> A block or a tokenized stock can lose value quickly, and a small pool moves a lot on a small trade.</li>'
    + '</ul>');

  return frais + jeux + risques
    + '<p class="note source">Every number on this page is read from the files the app itself runs (the deployed contracts\' records and the app\'s fee modules), not typed into the page. Hook: '
    + lienBase(h.adresse) + ' · Skins: ' + lienBase(sk.adresse) + '.</p>';
}
