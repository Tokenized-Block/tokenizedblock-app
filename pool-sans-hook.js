/* ══ 2026-10-02 — REGLE DU FONDATEUR (13:27) : AUCUNE POOL SANS HOOK POUR UN BLOCK TokenizedBlock ═════════════════════
 * ⛔⛔ Le routage de l app (cotations, achat, vente, pont, sortie de route) ne choisit JAMAIS une pool dont `hooks` vaut
 *     0x0 quand un block TokenizedBlock en est une des deux devises. C est une regle de ROUTAGE, pas d affichage :
 *     aucun libelle, aucun badge, aucun avertissement ne la montre a l ecran. Le message de refus reste generique.
 *   · Un block TB = TBLOCK, TBGAS, ou le jeton B20 (0xb2…) echange par l appelant (`blocks`) — sauf s il est une devise de base
 *     (ETH, USDC, cbBTC, actions Coinbase…) : une jambe ETH→USDC hors hook (pont) n est pas une pool de block.
 *   · Exception unique : le format OpenLaunch (frais 3 %, espacement 200) — pools partenaires, hors de notre perimetre.
 *   Fait mesure (fork 52074517) : TBLOCK n a AUCUNE pool ETH avec hook ; sa seule pool ETH (frais 0, espacement 200)
 *   est sans hook — elle n est donc plus jamais choisie, et ce qui en dependait est refuse avant le wallet. */
import { TBLOCK_TEST_ANCIEN as TBLOCK, TBLOCK as TBLOCK_REEL, TBGAS, HOOK_PREVU, deviseFraisHook, estNotreHook } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */
import { REFERENT_O1_ACTIF, estHookO1Standard } from './referent-o1.js';
import { estHookMarcheOuvert } from './marche-ouvert.js';
import { DEVISES_BASE, ACTIONS_COINBASE } from './paires.js';
import { estNeDuRouteur, estNotreBlockServi, sourcesTbLues } from './index-routeur.js';
import { NES_LAUNCHPADS_O1 } from './jetons-nes-launchpads.js';

const bas = (a) => String(a || '').toLowerCase();
const ZERO = '0x0000000000000000000000000000000000000000';
const BLOCKS_TB = new Set([bas(TBLOCK), bas(TBLOCK_REEL), bas(TBGAS)]); /* game354 (review): the real TBLOCK too */
const DEVISES = new Set([ZERO, ...DEVISES_BASE.map((d) => bas(d.adr)), ...ACTIONS_COINBASE.map((d) => bas(d.adr))]
  .filter((a) => !BLOCKS_TB.has(a)));

export const MESSAGE_SANS_POOL = 'this block has no market the app can trade on right now — nothing was sent';

/** Vrai = devise CONNUE et vendable (ETH, devises de base hors TBLOCK/TBGAS, actions Coinbase). Tout autre
 *  jeton — un block en particulier — n en est pas une. */
export function estDeviseConnue(adr) {
  return DEVISES.has(bas(adr));
}
/** Vrai = ce jeton est un BLOCK pour une route multi-sauts (2026-10-02, fix R4) : ni devise connue, ni devise dont
 *  l appelant a lu le prix (`fraisDevisesOk`). ⛔ Un B20 (0xb2…) qui n est pas une devise connue reste un block MEME
 *  prixe : app.html met dans `fraisDevisesOk` les blocks lus avec prix et liquidite. Sans `fraisDevisesOk` : tout jeton
 *  inconnu est un block (fail-closed). */
export function estBlockDeRoute(adr, fraisDevisesOk = null, cles = []) {
  const a = bas(adr);
  /* ⛔ 2026-10-03 (Phil 00:20) : un B20 n est un block que s il est TB (classeBlock) ; un B20 d un autre launchpad, non. */
  return !pasUnBlockConnu(a) && (estBlockTbClasse(a, cles) || (!RE_B20.test(a) && !(fraisDevisesOk instanceof Set && fraisDevisesOk.has(a))));
}
/* ⛔⛔ 2026-10-02 (Zero 1, R4 item 2) : « B20 » = 0xb2 SUIVI DE 20 ZEROS, pas le seul prefixe 0xb2 (70 pools V3/Aerodrome et
 *   192 V4 de jetons ordinaires 0xb2… etaient refusees a tort). Une devise ou une action CONNUE du registre (OUSD, HTZc, PFEc,
 *   PMc, GMEc… — B20 elles aussi, ajoutees par 56878eb) n est jamais un block. */
export const RE_B20 = /^0xb20{20}/i;
function pasUnBlockConnu(a) { return estDeviseConnue(a); }
export function cleSansHook(cle) {
  return !!cle && /^0x0{40}$/i.test(String(cle.hooks || ZERO));
}
/** Combien de jambes a hook une route peut-elle traverser ? ⛔ UNE SEULE REGLE, lue par echange.js (planEchangeMultiSauts)
 *  ET sauts-depuis-chemin.js — deux copies ont deja diverge ici (jumeaux).
 *  ⛔⛔ DECISION DE PHIL, 2026-10-03 : un block s echange contre un AUTRE block en une transaction (A -> ETH -> B). Chaque
 *   marche de block traverse preleve SON frais de hook sur la chaine ; le routeur ne prend rien ; le total est affiche
 *   avant signature. La regle « une fois par swap » devient « jamais de frais routeur EN PLUS d un hook, et un frais par
 *   marche de block traverse ».
 *  · 0 ou 1 jambe a hook : inchange.
 *  · 2 jambes a hook : admis SEULEMENT si l entree ET la sortie sont deux blocks distincts, que la PREMIERE jambe est le
 *    marche du block d entree et la DERNIERE celui du block de sortie (chacune ne contient que son block). Tout le reste —
 *    un hook sur une jambe de devises, deux hooks du meme block, 3 hooks — reste refuse (fail-closed).
 *  @returns {{ ok: boolean, jambesHook: number[], blocAbloc: boolean }} */
export function hooksDeRoute({ sauts = [], entree, sortie, estBlock = () => false }) {
  const jambesHook = [];
  for (const [i, x] of sauts.entries()) if (x && x.cle && !cleSansHook(x.cle)) jambesHook.push(i);
  if (jambesHook.length <= 1) return { ok: true, jambesHook, blocAbloc: false };
  const e = bas(entree), s = bas(sortie), dernier = sauts.length - 1;
  const contient = (i, a) => [sauts[i].cle.currency0, sauts[i].cle.currency1].some((c) => bas(c) === a);
  const ok = jambesHook.length === 2 && e !== s && !!estBlock(e) && !!estBlock(s)
    && jambesHook[0] === 0 && jambesHook[1] === dernier
    && contient(0, e) && !contient(0, s) && contient(dernier, s) && !contient(dernier, e);
  return { ok, jambesHook, blocAbloc: ok };
}
export function estBlockTb(adr, blocks = [], cles = []) {
  const a = bas(adr);
  if (!/^0x[0-9a-f]{40}$/.test(a)) return false;
  if (BLOCKS_TB.has(a)) return true;
  /* R8 (logique inversee) : regle R5 — un jeton 0xb2… echange par l appelant, hors devise connue, est un block — SAUF un
   * jeton tiers LIBERE (classeBlock 'TIERS'). Un jeton hors 0xb2 n est un block que s il est TB prouve (regle (c)). */
  if (!blocks.map(bas).includes(a)) return false;
  const c = classeBlock(a, cles);
  return c === 'TB' || (a.startsWith('0xb2') && !DEVISES.has(a) && c !== 'TIERS');
}
export function formatOpenLaunch(cle) {
  return Number(cle.fee) === 30000 && Number(cle.tickSpacing) === 200;
}
/** Vrai = cette cle est INTERDITE au routage (pool sans hook avec un block TB dedans). */
export function poolSansHookInterdite(cle, blocks = [], cles = [cle]) {
  if (!cleSansHook(cle) || formatOpenLaunch(cle)) return false;
  return estBlockTb(cle.currency0, blocks, cles) || estBlockTb(cle.currency1, blocks, cles);
}
/** Le premier indice de cle interdite, ou -1. */
export function indexPoolSansHookInterdite(cles, blocks = []) {
  return (cles || []).findIndex((c) => poolSansHookInterdite(c, blocks, cles || []));
}

/* ══ 2026-10-02 13:58 — DECISION DU FONDATEUR : PLUS AUCUNE ROUTE PAR TBLOCK ═════════════════════════════════════════
 * ⛔⛔ TBLOCK n est plus une jambe intermediaire : un block s echange directement contre sa devise appariee (action
 *     tokenisee, USDC, ETH) sur une pool hookee, et le frais va a a6cf dans CETTE devise — jamais en block. TBLOCK
 *     lui-meme reste bloque dans l app (aucune pool hookee TBLOCK/ETH). `ROUTE_VIA_TBLOCK` ferme `routeViaTblock`. */
export const ROUTE_VIA_TBLOCK = false;
/** Vrai = cette cle passe par TBLOCK (une de ses deux devises). */
export function cleTouchTblock(cle) {
  return !!cle && [bas(TBLOCK), bas(TBLOCK_REEL)].some((t) => bas(cle.currency0) === t || bas(cle.currency1) === t);
}

/* ══ 2026-10-02 13:59 — FONDATEUR : a6cf recoit ETH, USDC ou l action appariee, JAMAIS le block ═══════════════════════
 * ⛔⛔ Mesure fork (stock-proof, NVDAc) : sur une pool V8 ou le block est currency0, le HOOK verse a6cf en BLOCK
 *     (69 549 931 494 498 013 106 unites sur un achat de 71 247 NVDAc) et le routeur ajoutait 356 NVDAc — deux frais,
 *     dont un en block. Le contrat ne se change pas : l app REFUSE ces pools (Create ne les fabrique plus : item 2). */
export const REFUS_FRAIS_HOOK_EN_BLOCK = true;
/** Texte EXACT montre a l ecran pour ces blocks (decision 14:07 : rien d autre). */
export const MESSAGE_PAS_ICI = 'Not tradable here yet';
/** Vrai = le hook de cette pool verserait son frais dans le block `jeton` pour ce sens. */
export function fraisHookEnBlock(cle, jeton, sens, zeroForOne) {
  const d = deviseFraisHook(cle, sens, zeroForOne) || deviseFraisHookHorsListe(cle, sens, zeroForOne);
  return !!d && bas(d) === bas(jeton);
}
/* ══ 2026-10-02 (porte de livraison, revue Claude) — LES HOOKS QUI PRELEVENT EN BLOCK SANS ETRE DANS LA LISTE DES PAYEURS ══
 * ⛔ HOOK_PREVU (V1) a l ACHAT verse a6cf en BLOCK (fork 52072599 callTracer, tokenomics.js : « V1 achat : le hook prend du
 *   BLOCK (non compte) »). Il n est pas dans HOOKS_PAIENT_DEJA_A6CF (le routeur garde son frais) : sans cette table, un achat
 *   V1 payait deux frais, dont un en block, et `fraisHookEnBlock` ne le voyait pas. Devise prelevee : la SORTIE (le block). */
export const HOOKS_FRAIS_EN_BLOCK_HORS_LISTE = Object.freeze([Object.freeze({ hook: bas(HOOK_PREVU), sens: 'ACHAT' })]);
export function deviseFraisHookHorsListe(cle, sens, zeroForOne) {
  if (!cle || !HOOKS_FRAIS_EN_BLOCK_HORS_LISTE.some((e) => e.hook === bas(cle.hooks) && e.sens === sens)) return null;
  return bas(zeroForOne ? cle.currency1 : cle.currency0);
}

/* ══ 2026-10-02 (porte de livraison, revue Claude) — UN BLOCK A UNE JONCTION DE SEGMENTS ═════════════════════════════════
 * ⛔⛔ Les rails qui enchainent Aerodrome et Uniswap (franchissement V4 -> Aerodrome, segment Aerodrome a plusieurs sauts,
 *     ETH -> pivot -> action -> block, multipool) passaient un block A LA JONCTION : ETH ->(Aerodrome) blockC ->(V4 V8) NVDAc.
 *     Meme classe que R4, et la regle du fondateur casse : la pool Aerodrome du block n a pas de hook TB. Refus,
 *     texte exact MESSAGE_PAS_ICI. Un block ici = TBLOCK/TBGAS, ou un B20 (0xb2…) qui n est pas une devise connue — son prix
 *     lu ne change rien (meme choix que estBlockDeRoute). Rend l indice du premier block parmi `noeuds`, ou -1. */
export function estBlockAJonction(adr, cles = []) {
  return estBlockTbClasse(adr, cles);
}
export function indexBlocAJonction(noeuds, cles = []) {
  return (Array.isArray(noeuds) ? noeuds : []).findIndex((t) => estBlockAJonction(t, cles));
}

/* ══ 2026-10-02 (C2, F1) — UN BLOCK SUR UNE POOL V4 A HOOK TIERS ═══════════════════════════════════════════════════════
 * ⛔⛔ Une cle V4 dont une devise est un block (estBlockAJonction : TBLOCK/TBGAS, ou B20 hors devises connues — PAS
 *     estBlockDeRoute, sinon un memecoin o1 non prixe hors B20, ex. BRIAN, serait refuse) n est admise que si :
 *     (1) estNotreHook, ou un hook V8-open LISTE (marche-ouvert.js) — les regles existantes (frais en block, V1, une jambe
 *         payante, garde marche ouvert) s appliquent ensuite ;
 *     (2) sans hook ET format OpenLaunch (3 % / 200) ;
 *     (3) le LaunchHook Standard d o1 avec REFERENT_O1_ACTIF (la part referrer a6cf, GO).
 *     Tout autre hook (o1 Tax, anciens o1, Clanker, Doppler, inconnu) -> refus avant toute cotation. Sans cle : rien a juger. */
export function hookAdmisPourBlock(cle, cles = [cle]) {
  if (!cle) return true;
  if (!estBlockAJonction(cle.currency0, cles) && !estBlockAJonction(cle.currency1, cles)) return true;
  const h = bas(cle.hooks || ZERO);
  if (estNotreHook(h) || estHookMarcheOuvert(h)) return true;
  if (h === ZERO) return formatOpenLaunch(cle);
  return REFERENT_O1_ACTIF === true && estHookO1Standard(h);
}

/* ══ 2026-10-03 R8 (C2 KO R6 ; decision Raksha) — LOGIQUE INVERSEE : PAR DEFAUT, R5 ═══════════════════════════════════════
 * ⛔⛔ Par defaut tout B20 (0xb2 + 20 zeros) qui n est pas une devise connue est un BLOCK : refuse hors hooks TB, OpenLaunch
 *     3 % / 200 et o1 avec REFERENT_O1_ACTIF — exactement R5. classeBlock rend :
 *       'TB'      prouve TB : BLOCKS_TB, blocks V1 de test, liste statique sur nos hooks / fondateur, ne d un de nos
 *                 routeurs (graine + index), /api/nos-blocks, ou marche sur un de NOS hooks (contexte / poolsLive) ;
 *       'TIERS'   LIBERE : B20 absent de l ensemble TB, ET dans la liste blanche, ET toutes les sources TB servies LUES
 *                 (index routeur + /api/nos-blocks). R9 (C2 R8 F1/F2) : la liste blanche est un ensemble d ADRESSES (PEXRA +
 *                 les B20 nes d un lancement o1) — plus aucun contexte de hook ni de route : chaque saut est juge seul ;
 *       'INCONNU' tout autre B20 : traite en block (defaut R5) ;
 *       null      devise connue, adresse invalide, ou jeton hors B20 sans marche sur nos hooks.
 * ⛔ Une erreur de l index ou de la liste blanche ne peut que GARDER un jeton tiers bloque ; elle ne libere jamais un block TB
 *   (la liberation exige l absence de l ensemble TB et des sources lues). L index ne fait que RESSERRER.
 * ⛔ CLASSEMENT DE ROUTAGE SEULEMENT : rien ici ne decide de l affichage (carte, fil, profils, listes).
 * ⛔ Point d entree futur « migrer vers un hook TB » : un jeton TIERS qui ouvre une pool sur nos hooks devient TB (regle (c)). */
const BLOCKS_V1_TEST = new Set(['0xb2000000000000000000004ff41cbd5ef8e49f14', '0xb20000000000000000000071224edc6587e362d2',
  '0xb2000000000000000000006d6f9102e9e4b221e0', '0xb200000000000000000000a3f3e63b48ef57c481']);
/* ⛔⛔ R7 (Zero 1, K2) : liste STATIQUE et COMPLETE des jetons qui ont une pool sur un de NOS hooks (estNotreHook : V1
 *   HOOK_PREVU, V2…V8 ; 7030 sans code), lue sur la chaine : Initialize du PoolManager 0x4985…2b2b de 51 355 025 a
 *   52 098 430, 744 fenetres, 0 ratee, 10 pools (fix-r4-logs/r7/scan-hooks.json). R8 : SPCXc (0xb2…7b9fcbd005511acbd5, une
 *   action, devise connue) retire. Plus les blocks du fondateur servis par /api/nos-blocks (lu 2026-10-02 22:37 UTC). */
export const BLOCKS_SUR_NOS_HOOKS = Object.freeze([
  '0xb200000000000000000000df3ffcd9be89b3843c', /* TBGAS     V1 51360108 */
  '0xb2000000000000000000004ff41cbd5ef8e49f14', /* RNG       V1 51478831 */
  '0xb20000000000000000000071224edc6587e362d2', /* TUTU      V1 51479454 */
  '0xb2000000000000000000006d6f9102e9e4b221e0', /* OK        V1 51484540 */
  '0xb200000000000000000000a3f3e63b48ef57c481', /* O         V1 51486012 */
  '0xb200000000000000000000ab549fa65ad4edae3f', /*           V2 51527429 (aussi /api/nos-blocks) */
  '0xb200000000000000000000809778b2d38d114351', /*           V2 51531218 */
  '0xb200000000000000000000e4b0c5fbe9c8df579e', /* IB022     V8 51653364 */
  '0xb200000000000000000000baa5356bfc210cc30a', /* routeur   V8 51662444 */
  '0xb200000000000000000000e7e9db76e8234f8f56', /* routeur   V8 51955308 */
  '0xb20000000000000000000003d296be435ae4bbe3', /* fondateur /api/nos-blocks, sans marche v4 */
  /* R9 (C2 R8 F3) : blocks TB crees en DIRECT par la fabrique (empreinte TB « tokenizedblock.space » / « "face" » dans les
   *   metadonnees de creation), absents de toute autre source (r8-review-logs/tb-fingerprint-uncovered.json) : */
  '0xb200000000000000000000eedb997f91ceb22b8a', /* EFIX      51659522, fabrique directe, createur 0x6acc… (celui d IB022) */
  '0xb200000000000000000000e7e544d1292a095c36', /* SMOKE14   51310697, fabrique directe, createur 0x4106…0dea */
]);
/* BACKLOG (non construit) : version durable = le serveur indexe aussi les Initialize du PoolManager sur nos hooks, et
 *   l empreinte TB des creations directes par la fabrique (lecture des metadonnees de chaque B20Created : pas leger). */
const SUR_NOS_HOOKS = new Set(BLOCKS_SUR_NOS_HOOKS);
/* ── LISTE BLANCHE R9 (liberation des seuls vrais jetons tiers) : des ADRESSES, rien d autre ──
 * ⛔ R9 (C2 R8 F1/F2) : plus de liberation par le hook d un marche. Clanker StaticFeeV2 (initializePoolOpen public) et 0xe1ef…
 *   (aucun controle d Initialize) laissaient n importe qui ouvrir une pool pour un block TB ; et le contexte etait pris sur
 *   N IMPORTE QUELLE cle de la route, des DEUX cotes (ETH→(sans hook)EFIX→(0xe1ef)USDC passait a 20 bps). Un jeton est
 *   libere par son adresse seule, saut par saut ; le cote cotation d une pool n est jamais libere par elle. */
/** Liste explicite de B20 tiers (verifies : hors routeur, hors nos hooks, hors /api/nos-blocks). */
export const JETONS_TIERS_EXPLICITES = Object.freeze([
  '0xb200000000000000000000c21042dc554628d2ac', /* PEXRA : B20Created 52 091 810 par l EOA 0xe417…c3b8, pool sur 0xe1ef… */
]);
const TIERS_EXPLICITES = new Set([...JETONS_TIERS_EXPLICITES, ...NES_LAUNCHPADS_O1]);
const marchesSurNosHooks = new Set();
/** L app a lu un marche (cle V4) sur un de NOS hooks : ses devises non connues sont des blocks TB (regle (c)). */
export function noterMarcheSurNotreHook(cle) {
  if (!cle || !estNotreHook(cle.hooks)) return false;
  for (const a of [bas(cle.currency0), bas(cle.currency1)]) if (/^0x[0-9a-f]{40}$/.test(a) && !DEVISES.has(a)) marchesSurNosHooks.add(a);
  return true;
}
function surNotreHook(a, cles) {
  return marchesSurNosHooks.has(a) || (Array.isArray(cles) ? cles : []).some((c) => !!c && estNotreHook(c.hooks)
    && (bas(c.currency0) === a || bas(c.currency1) === a));
}
function listeBlanche(a) { return TIERS_EXPLICITES.has(a); }
/** 'TB' | 'TIERS' | 'INCONNU' | null — voir l en-tete R8 ci-dessus. */
export function classeBlock(adr, cles = []) {
  const a = bas(adr);
  if (!/^0x[0-9a-f]{40}$/.test(a) || DEVISES.has(a)) return null;
  if (BLOCKS_TB.has(a) || BLOCKS_V1_TEST.has(a) || SUR_NOS_HOOKS.has(a) || estNeDuRouteur(a) || estNotreBlockServi(a) || surNotreHook(a, cles)) return 'TB';
  if (!RE_B20.test(a)) return null;
  /* ⛔⛔ R10 (2026-10-03, decision du fondateur : « l appliquer de partout ») — LIBERATION PAR ABSENCE DES SOURCES TB, LUES.
   *   Mesure du jour (prod, 177 blocks suivis) : R8 ne liberait que 29 blocks (liste o1, figee au bloc 52 108 727) et
   *   refusait 148 blocks = 280 340 $ / 24 h, 88 % du volume des blocks — 92 d entre eux sur un lanceur a hook unique par
   *   jeton (bytecode identique, 16 724 o, init par PositionManager), hors de toute liste par lanceur. Un B20 absent de
   *   TOUTES les sources TB (ensemble statique, routeur, /api/nos-blocks, nos hooks), ces sources LUES, est un jeton tiers :
   *   tradable sur son propre hook, notre 0,5 % dans la devise (echange.js). La liste blanche R9 n est plus la condition
   *   (elle reste exportee). ⛔ Sources NON lues = INCONNU = block : le fail-closed de R8 est inchange. */
  return sourcesTbLues() ? 'TIERS' : 'INCONNU';
}
/** Vrai = traiter ce jeton en block TB au routage (TB prouve, ou INCONNU : fail-closed). */
export function estBlockTbClasse(adr, cles = []) {
  const c = classeBlock(adr, cles);
  return c === 'TB' || c === 'INCONNU';
}
