// tokenomics.js — la tokenomics v2 de TokenizedBlock (DECISIONS-regles-du-jeu-2026-09-13, section 1bis).
// ================================================================================================
// ⛔ RAKSHA 2026-09-14 : Create MAIN fee = ETH ≈ $1 → FEE_WALLET. No 5% / 50M token mint to fee.
//    Sealed 1B supply mints 100% to the creator (CreateRouter + Practice factory path).
// ⛔ TBLOCK EXISTE (cree par Phil le 2026-09-13, adresse LUE dans le log B20Created de sa transaction).
// ✅ TbFeeHook LIVE Base CREATE2 HOOK_PREVU 0xaa6D…2044 — FEE_WALLET() = a6cf (tip 2356). Legacy 0x34E3…6044 still 37eb — unused by new Launch.
/** @deprecated Was 5n (50M of 1B). Create fee is ETH only — keep 0 so Social never keys on a fee mint. */
export const PART_FRAIS_POUR_CENT = 0n;
/** Fixed sealed supply for every TB Create: 1 billion units × 18 decimals. Indestructible = cap == mint, nobody can mint more. */
export const DECIMALES_FIXES = 18;
export const SUPPLY_FIXE = 1_000_000_000n * 10n ** BigInt(DECIMALES_FIXES);
/** ⛔⛔ game354 (Phil 2026-11-11: "this new TBLOCK is the right one and must be everywhere; replace the old TBLOCK by the new one — leaving it
 *   is a serious error"). TBLOCK = THE token, launched on basestonk (pool vs wtCOIN): copied from tblock-hold.js / economie.js, verified on
 *   basestonk.io/tokens/<address> ("TokenizedBlock ($TBLOCK)") and by every on-chain read of this week. */
export const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
/** The OLD test token with the SAME name and symbol (created by the app, B20Created in tx 0xda396460…4cf3, block 51,260,745). NEVER shown
 *  as "TBLOCK": kept ONLY to read its old pools (legacy markets keyed on it) and to HIDE it from every list (JETONS_MASQUES). */
export const TBLOCK_TEST_ANCIEN = '0xb20000000000000000000024c30d3fcb7931272e';
/** tokens the app never lists, names or proposes (a second "TBLOCK" on screen is what scams use) */
export const JETONS_MASQUES = Object.freeze([TBLOCK_TEST_ANCIEN]);
export const estJetonMasque = (a) => JETONS_MASQUES.includes(String(a || '').toLowerCase());
/** TBGAS — Tokenized Gas · MAIN Launch 2026-09-15 hooked HOOK_PREVU → a6cf (tip 2357). */
export const TBGAS = '0xb200000000000000000000df3ffcd9be89b3843c';
/** tip 0016: Uniswap v4 PoolId = Initialize topic1 · Launch 0x17d20e41…dcc5 · Dex/Gecko pairAddress. */
export const TBGAS_POOL_ID = '0x085294111dc0da95e5496d5c81deaa094fdf73bd5a1e08163679e5ea3b062a46';
/** tip 0019: keep HOOK_PREVU aa6D (proven TBGAS) — do NOT redeploy same bytecode. FEE_WALLET=a6cf. Dollar visibility = ETH→USDC / USDC-side volume (Launch refuses USDC pair: 6 vs 18 decimals). */
/** TbFeeHook LIVE on Base — CREATE2 a6cf (salt 56999). FEE_WALLET() = a6cf. */
export const HOOK_PREVU = '0xaa6D7bD9FC7D394bc717137936f2939834382044';
/* ⛔⛔ HOOK V2 (2026-09-19) : la mise en vie est PAYEE ON-CHAIN (inscrire payable, beforeInitialize refuse sans paiement).
 *    Mesure qui l a motivee : 2 marches sur 4 ouverts avec HOOK_PREVU en 72 h, sans les frais de vie (appel direct au
 *    PositionManager). Adresse = celle MINEE par script/DeployTBlockFeeHookV2.s.sol (simulation du 2026-09-19), deployee
 *    par Phil. Tant qu elle n a pas de code, l app garde HOOK_PREVU : la bascule est lue sur la chaine, jamais supposee. */
export const HOOK_V2 = '0x8E1Eb57AD2A87a4f7bc89ce94eFD5cd77aEc2044';
/* ⛔ HOOK V3 (2026-09-19) : le V2 + les ACTIONS TOKENISEES et gros jetons (USDC, cbBTC, 13 actions Coinbase), liste FIXEE au
 *    deploiement. Adresse = celle minee par script/DeployTBlockFeeHookV3.s.sol (simulation du 2026-09-19). Tant qu elle n a
 *    pas de code, ces paires restent « soon » dans Create : la bascule est lue sur la chaine. */
export const HOOK_V3 = '0x7a7cEBB2Ccb84C9fBfa2730e6cB23Bb192166044';
/* ⛔⛔ HOOK V4 (deploye le 2026-09-20, tx 0x3fcf05cd10ac0cef1bde29e9c877cd32b37d52bf6b5187c63283b50677786484,
 *    bloc 51555444). Le V3 + DEUX verrous, chacun prouve ROUGE avant d etre vert dans tblock-hook :
 *    1. AUCUN ECHANGE TANT QUE LA POOL EST VIDE. Sur le V2/V3, entre le paiement de la mise en vie et le
 *       mint du createur, n importe qui pouvait ouvrir la pool et pousser son prix au tick plancher avec
 *       un swap de 1 wei : le lancement revertait ensuite et les ~1 $ etaient perdus, pour le prix du gas.
 *    2. SANS LE LABEL, PAS DE MARCHE. « inscrire » relit « contractURI() » du block et exige le marqueur grave
 *       par notre Create. La factory B20 etant publique, la naissance ailleurs ne se bloque pas ; le
 *       MARCHE, si. ⚠️ C est une STRUCTURE, pas une identite : quelqu un peut graver les memes octets.
 *    Relu sur la chaine apres deploiement : feeWallet a6cf, fraisVie 3e14, marqueur 16 octets, 15 devises,
 *    exigerB20 true, porteLeLabel(BASED)=true et porteLeLabel(un block ne ailleurs)=false.
 *    ⛔ IL REMPLACE V2 ET V3 POUR LES NOUVEAUX LANCEMENTS (il porte la meme liste de devises). Les pools
 *       deja ouvertes sur V1/V2/V3 continuent de tourner et de payer a6cf — rien n est casse. */
export const HOOK_V4 = '0x11FCd588c96b1781cc88B8B9F349B6067D9BE4c4';
/* ⛔ HOOK V5 — DEPLOYE ET RELU SUR LA CHAINE LE 2026-09-20.
 *    tx 0x7fb52a1f449546e8babe55f7c9351c477735374694658b4c63a867b2859fed47, recu status 0x1,
 *    bloc 51567449, 12 463 octets de code a l adresse.
 *    Relectures faites une par une, pas prises sur un ecran : feeWallet a6cf · tailleMarqueur 16 ·
 *    DIME_CREATEUR_POUR_CENT 20 · DIVISEUR_PART_CREATEUR 3 · HOOK_FEE 30 000 (3 %) ·
 *    GAS_POUSSEE 150 000 · porteLeLabel(BASED)=true ET porteLeLabel(un block ne ailleurs)=FALSE.
 *    ⛔ Ce dernier temoin est le seul qui donne sa valeur au precedent.
 *    CE QUE LE V5 CHANGE : les frais sont VERSES pendant le swap (repli sur les claims si la devise
 *    refuse, pour qu un jeton casse ne puisse pas tuer sa pool), et le wallet prend 20 % du tiers du
 *    createur (33,33 % -> 26,67 % du frais).
 *    ⚠️ IL NE REPARE RIEN DU PASSE : le hook est dans la PoolKey, donc chaque pool garde le sien. */
export const HOOK_V5 = '0x799136c3F5f572f1597b5B7E067D3eE45Fe4A4C4';
/* ⛔ HOOK V6 — DEPLOYE (code LU sur la chaine le 2026-09-21 ; le commentaire disait encore
 *    « pas encore deploye » un jour apres la transaction — un commentaire perime ment aussi longtemps
 *    qu on le lit).
 *    Adresse obtenue par CREATE2 et verifiee par DEUX chemins independants : HookMiner dans forge, et
 *    un recalcul keccak en JavaScript a partir du meme sel et du meme initcode. Bits de permission
 *    0x24cc = beforeInitialize, afterAddLiquidity, beforeSwap, afterSwap, afterSwapReturnsDelta et
 *    beforeSwapReturnsDelta — le bit de plus que le V5, celui qui autorise un delta avant le swap.
 *    CE QUE LE V6 CHANGE : un ACHAT « entree exacte en ETH » paie son frais EN ETH, pris avant le
 *    swap, au lieu d etre pris apres coup sur le jeton de block.
 *    MESURE QUI L A DICTE : 14 jours du V1 deploye, 303/303 fenetres lues, 39 encaissements — 19 en
 *    ETH (0,001019868 ETH au wallet) et 20 en jetons (0,002000588 ETH d equivalent qui dort).
 *    ⛔ BORNE : un swap a SORTIE EXACTE en ETH paie toujours en jeton, et ce frais part en claims.
 *    ⚠️ SON ETAT EST TOUJOURS LU SUR LA CHAINE, jamais ecrit en dur : tant que la transaction n est
 *       pas signee, l app doit continuer de lancer sur le V5. */
export const HOOK_V6 = '0xD71af554b5b3dCb6bb17946cfA3C41860A50a4cC';
/* ⛔ HOOK V7 — DEPLOYE (code LU sur la chaine le 2026-09-21).
 *    Adresse verifiee par DEUX chemins independants (HookMiner dans forge + recalcul keccak en JS),
 *    et un eth_call de la transaction rend exactement cette adresse.
 *    CE QUE LE V7 DEVAIT CHANGER : 100 % du frais au wallet, part du createur SUPPRIMEE.
 *    ⛔⛔ CETTE PHRASE EST CONTREDITE PAR LA CHAINE, mesure du 2026-09-26. `dime()` — selecteur
 *        `0xfabd2365`, LU dans `deploy-v8.json` et non calcule — rend **20** sur le V6, le V7 ET le
 *        V8. Les trois manifestes de deploiement disent la meme chose : `"dimeCreateurPourCent": 20`.
 *        Seul ce commentaire dit le contraire, et c est lui qu on relit.
 *      ⚠️ ET SON ARITHMETIQUE NE TIENT PAS : il annonce « +50 % ». Supprimer une part de 20 % fait
 *        passer notre prise de 80 % a 100 %, soit **+25 %**. Un +50 % supposerait une part de 33 %.
 *      ⛔ CE QUI N EST PAS PROUVE POUR AUTANT : que le hook APPLIQUE cette part. Un getter peut
 *        survivre a la logique qui le lisait, et la source des hooks n est pas dans ce depot. Seule
 *        une trace de versement a un createur trancherait.
 *      ⇒ AUCUN DES DEUX CHIFFRES NE SE PUBLIE tant que ce n est pas tranche : dire « 0 % au
 *        createur » comme « 20 % au createur » serait une affirmation non mesuree.
 *        Sonde : `mesure-frais-des-deux-cotes.mjs`.
 *    ⚠️ CE QUE CA COUTERAIT SI C ETAIT VRAI : c etait le seul argument d un createur exterieur.
 *       Mesure du 2026-09-21 (14 j, 303/303 fenetres) : 2 lancements, tous deux par nos wallets —
 *       aucun createur exterieur sur la fenetre. Gain mesure : +0,001019868 ETH sur 14 j, soit +50 %.
 *    ⛔ Bits 0x24cc, IDENTIQUES au V6 : le V7 n ajoute aucune capacite, il ne touche aucun verrou. */
export const HOOK_V7 = '0xb5680Fc44ea440fC223D1ca62F2b4F261fdA24Cc';
/* ⛔ HOOK V8 — DEPLOYE (code LU sur la chaine le 2026-09-21) et HOOK_FEE() lu a 5000 / 1e6 = 0,5 %.
 *    CE QU IL CHANGE, ET RIEN D AUTRE : le taux passe de 3 % a 0,5 % (HOOK_FEE 30000 -> 5000).
 *    ⛔⛔ POURQUOI IL DOIT EXISTER AVANT LE PREMIER MARCHE : le taux est une CONSTANTE et le hook
 *       est dans la PoolKey. Un marche ouvert sur le V7 paierait 3 % POUR TOUJOURS — aucune
 *       migration n existe, c est le piege ou sont enfermees les 5 pools du V1.
 *    ⚠️ MESURE : a 3 %, 14 jours ont rendu 0,003059603 ETH de frais ; les memes volumes a 0,5 %
 *       rendraient 0,000509934 ETH. Il faut SIX FOIS plus de volume pour egaler. C est un PARI.
 *    ⛔ Memes bits 0x24cc que le V7 : aucune capacite ajoutee. */
export const HOOK_V8 = '0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc';
import { HOOKS_MARCHE_OUVERT, MARCHE_OUVERT_ACTIF, incoherenceMarcheOuvert } from './marche-ouvert.js';
import { hookDeLancementPour, DEVISES_ADMISES_7030 } from './paires.js';
import { DESCRIPTEUR_7030 } from './hook-7030-descripteur.js';
/* ⛔ HOOK V9 (« quote fee hook ») — PAS DEPLOYE (2026-10-01). `null` tant qu un deploiement GATE
 *    (sel mine pour 0x4e59, exigerB20 = true, chaque getter relu sur la chaine) n a pas eu lieu.
 *    CE QU IL CHANGE PAR RAPPORT AU V8 : un frais de 0,09 % (9 bps) pris TOUJOURS dans la devise de
 *    cotation, jamais dans le block, 100 % au wallet de frais (Raksha, 2026-10-01 22:15) — et sa liste admet les 7 devises que le V8 refuse (OUSD, TOSHI, AVGOc,
 *    BEc, HIMSc, MUc, PLTRc). Memes bits 0x24cc, meme `inscrire` (0xbb920fed), memes getters
 *    `payee` / `inscrit` / `prixInscrit` : lancer-pool-v2.js n a rien a changer.
 *    Preuve sur fork et sur un vrai noeud Base : /workspace/tb-v9/V9-DESIGN-AND-FORK-PROOF-2026-10-01.md
 * ⛔ Tant qu il vaut null, RIEN ne change : `hookCourant` rend le V8 comme avant. */
export const HOOK_V9 = null;
/* ⛔⛔⛔ EST-CE QUE LE V9 VERSE DEJA a6cf, EN DEVISE DE COTATION, DANS LA TRANSACTION ? TROIS ETATS,
 *      ET LE DEFAUT EST « PAS MESURE ».
 *      `null` = pas mesure · `true` = mesure sur fork, il paie · `false` = mesure, il ne paie pas.
 *
 *   ⛔ POURQUOI CETTE CONSTANTE EXISTE, mesure du 2026-10-02. `hookPaieDejaA6cf` traitait le V9
 *     comme PAYANT, dans les DEUX sens, des l instant ou `HOOK_V9` cesse d etre `null` :
 *         if (x === HOOK_V8 || (!!HOOK_V9 && x === HOOK_V9)) return true;
 *     Or V9 n est pas deploye : rien n a pu etre mesure. Poser l adresse aurait donc fait passer le
 *     routeur a 0 bps sur toutes les pools V9 sur la foi d une SUPPOSITION.
 *
 *   ⛔⛔ ET LE SENS DE LA FAUTE EST CELUI QUI COUTE. Un faux « non » fait DOUBLE facturer, et
 *      `echange.js` l attrape (« double fee »). Un faux « oui » fait prendre ZERO, et RIEN ne
 *      l attrape : un prelevement nul ressemble a un succes. C est le motif
 *      `zero-par-impossibilite` a l envers — un zero qu on prendrait pour normal.
 *   ⇒ LE DEFAUT VA DONC VERS « LE ROUTEUR PREND SON FRAIS ». Le pire cas devient une double
 *     facturation refusee par une garde existante, au lieu d une fuite silencieuse.
 *
 *   ⚠️ CE N EST PAS UN VERDICT SUR LE V9. Il n existe pas encore : il ne peut etre ni innocente ni
 *     coupable. C est le code qui ne doit pas trancher a sa place.
 *   ⛔ POUR LA PASSER A `true` : une mesure fork au callTracer sur une pool V9 reelle, dans les DEUX
 *     sens, comme celle qui a produit la table V1/V2/V8 (bloc 52072599). Pas une lecture de la
 *     source du hook — `guards-measured-transport-not-execution` a deja coute ici. */
export const V9_PAIE_DEJA_A6CF = null;
/* ══ 2026-10-02 — HOOK 7030 (fee lot 2) : 0,07 % au wallet de frais + 0,03 % au createur, TOUJOURS dans la devise
 *    appariee (ETH, USDC, cbBTC, TOSHI, OUSD ou l action), jamais dans le block. Source contracts/launch-lock
 *    TBlockLaunchLockHook.sol (contrat valide par Zero 1 a a7fc46c) ; liste fixe Devises7030 = V9 19 + 18 actions
 *    Coinbase (0ea4661), branche feat/hook-7030-37-devises-20261002 @ e7a9c17 : CREATE2 0x4e59, sel 0x…253955. PAS DEPLOYE : tant que HOOK_7030_ACTIF vaut false, RIEN ne change (memes octets de tx).
 *    Mesure Zero 1 (fork 52079022) : achat 0,001 ETH -> wallet de frais 7e11 + createur 3e11, routeur 0 = 10 bps.
 *    Le createur ne touche ses 0,03 % que tant que sa caution (inscrireAvecCaution) est en place ; sinon -> collateral. */
/* ⛔ 2026-10-03 (fondateur : « la plus large ») : 62 devises sur l arbre a040db5 de Zero 1 — adresse, liste et planchers
 *   viennent de hook-7030-descripteur.js (UNE source), plan contracts/launch-lock/plan de feat/hook-7030-62-sur-a040db5-20261003.
 *   0x907e…24cc (37), 0xDe294c…64Cc (41) et 0xd68B…24cC (62 sur e7a9c17) sont PERIMES. Drapeau toujours ETEINT : pas deploye. */
export const HOOK_7030 = DESCRIPTEUR_7030.adresse;
/* ⛔⛔ ALLUME le 2026-10-03 : contrat DEPLOYE par Phil — tx 0xdb6f2f416be45ae1a730e2357e1bf7c09cb57aac35380c54d67d232b28f66b6f, bloc
 *   52 132 476, 22 117 octets a 0x32F3…64cc, relu sur la chaine : feeWallet a6cf, 700/300, 63/63 admises, 63/63 planchers =
 *   plan, adresse hors liste refusee. `hookCourant` ne le rend que code LU sur la chaine. */
export const HOOK_7030_ACTIF = true;
export const HOOK_7030_PPM = Object.freeze({ walletDeFrais: 700, createur: 300 });
/** Ce hook est-il le 7030 ET le drapeau est-il allume ? Drapeau eteint = le 7030 n existe pas pour l app. */
export function estHook7030(h) {
  return HOOK_7030_ACTIF === true && String(h || '').toLowerCase() === HOOK_7030.toLowerCase();
}
/** Taux de marche (bps) que prend le hook de cette pool. ⛔ UNE SEULE TABLE : app.html (libelle) et echange.js
 *  (`resume.fraisMarcheBps`) la lisent toutes deux. Avant le 2026-10-03, echange.js ne connaissait que « 7030 -> 10,
 *  sinon 300 » : sur V8 il rendait 300 alors que HOOK_FEE() relu = 5000 / 1e6 (audit rails R9).
 *  Les hooks plus anciens : 300 = 2 % + 1 %, mesures (app.html `HOOK_PREVU_FRAIS_BPS`). */
export function fraisHookBps(h) {
  const x = String(h || '').toLowerCase();
  if (x === HOOK_V8.toLowerCase()) return 50;
  if (HOOK_V9 && x === String(HOOK_V9).toLowerCase()) return 9;
  if (estHook7030(x)) return 10;
  return 300;
}
/** Un lancement cote dans cette devise doit-il aller sur le V9 ? ⛔ PAS DE SECONDE LISTE ICI : la
 *  reponse vient de paires.js `hookDeLancementPour` (la liste du V9 y vit, a cote de celle du V8),
 *  la meme source que la garde de Create et la garde de lancement. */
export function deviseVaSurV9(devise) {
  return hookDeLancementPour(devise, 8453, { v9: true }) === 'V9';
}
/** Les options de routage tant que l app tourne : le V9 compte seulement s il est pose. */
export const OPTIONS_LANCEMENT = Object.freeze({ v9: !!HOOK_V9, ...(HOOK_7030_ACTIF ? { h7030: true } : {}) });
/** Le V9 est-il deploye ? `ABSENT` tant que HOOK_V9 vaut null — jamais suppose. */
export async function hookV9Deploye({ rpc }) {
  if (!HOOK_V9) return 'ABSENT';
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V9, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le 7030 est-il deploye ? Lu sur son code. ⛔⛔ 2026-10-10 — TROIS ETATS STRICTS, parce que de cette lecture depend le hook
 *  sur lequel nait un vrai block (hookCourant) : DEPLOYE = un code hexa non vide LU ; ABSENT = un code VIDE lu ('0x' ou '') ;
 *  NON_LU = tout le reste — le noeud jette, ou rend null / undefined / autre chose que du texte / un texte qui n est pas de
 *  l hexa en octets entiers. Avant, `String(x || '')` faisait d une reponse null un code vide, donc un « absent ». */
export async function hook7030Deploye({ rpc }) {
  let code;
  try { code = await rpc('eth_getCode', [HOOK_7030, 'latest']); } catch (_) { return 'NON_LU'; }
  if (code === '0x' || code === '') return 'ABSENT';
  return typeof code === 'string' && /^0x(?:[0-9a-fA-F]{2})+$/.test(code) ? 'DEPLOYE' : 'NON_LU';
}
/** Le hook d une Naissance permanente sur Base : le V8, ou le V9 une fois pose. */
export function estHookDeNaissance(h) {
  const x = String(h || '').toLowerCase();
  if (!x) return false;
  return x === HOOK_V8.toLowerCase() || (!!HOOK_V9 && x === String(HOOK_V9).toLowerCase()) || estHook7030(x);
}
/** Un marche est-il sur NOTRE hook (V1, V2, V3, V4 ou V5) ? La seule fonction qui en decide.
 *  ⛔ LES ANCIENS RESTENT : une pool ouverte sur le V1 est toujours la notre et paie toujours a6cf.
 *     Les retirer d ici ferait disparaitre nos propres marches du fil Live et des frais affiches. */
export function estNotreHook(h) {
  const x = String(h || '').toLowerCase();
  return x === HOOK_PREVU.toLowerCase() || x === HOOK_V2.toLowerCase()
    || x === HOOK_V3.toLowerCase() || x === HOOK_V4.toLowerCase() || x === HOOK_V5.toLowerCase()
    || x === HOOK_V6.toLowerCase() || x === HOOK_V7.toLowerCase() || x === HOOK_V8.toLowerCase()
    || (!!HOOK_V9 && x === String(HOOK_V9).toLowerCase()) || estHook7030(x);
}
/** ⛔ 2026-10-02 — UNE FOIS PAR SWAP (Phil) : si UNE jambe porte un hook de cette liste qui paie dans une devise
 *  vendable, le routeur ne prend rien (le planificateur, echange.js, decide via hookPaieEnDeviseVendable ; la
 *  fonction routePaieDejaA6cf ci-dessous ne regarde que les jambes ETH et n est PAS la garde en production). LA LISTE des hooks qui versent DEJA a6cf, en ETH, dans la
 *  transaction, et pour quel sens. Mesure sur fork (bloc 52072599, callTracer) :
 *    V8 achat + vente : oui (0,5 % ETH) · V1 HOOK_PREVU et V2 : vente seulement (ETH) ·
 *    V1 achat : le hook prend du BLOCK (non compte) · V2 achat : rien dans la tx · V3–V7 : aucune pool.
 *    V8-open (TBlockOpenMarketHook) : achat + vente en ETH (fork 52074194) — TOUTES ses adresses,
 *    anciennes comprises (marche-ouvert.js > HOOKS_MARCHE_OUVERT ; vide tant que non deploye).
 *  ⛔ APPLIQUEE A CHAQUE JAMBE (planEchange, route via TBLOCK, multi-sauts) : aucun frais routeur sur une
 *    route dont une jambe ETH porte un hook de cette liste dans son sens. Une liste vide ferait payer
 *    deux fois chaque marche V8 : test-hooks-paient-deja-20261002.mjs echoue alors.
 *  ⛔⛔ V9 (fix-2, live 87a49cb) : JAMAIS deduit de la seule adresse — il n entre dans la liste que si
 *    V9_PAIE_DEJA_A6CF === true (mesure fork). `null` = pas mesure = le routeur prend son frais. */
const DEUX_SENS = Object.freeze(['ACHAT', 'VENTE']);
export const HOOKS_PAIENT_DEJA_A6CF = Object.freeze([
  { hook: HOOK_V8, sens: DEUX_SENS, preuve: 'fork 52072599 callTracer' },
  ...(HOOK_V9 && V9_PAIE_DEJA_A6CF === true ? [{ hook: HOOK_V9, sens: DEUX_SENS, preuve: 'V9 mesure (V9_PAIE_DEJA_A6CF)' }] : []),
  ...HOOKS_MARCHE_OUVERT.map((h) => ({ hook: h, sens: DEUX_SENS, preuve: 'V8-open fork 52074194' })),
  /* 2026-10-02 : hook 7030, SEULEMENT drapeau allume (mesure fork app : 0,001 ETH -> 7e11 + 3e11, routeur 0). */
  ...(HOOK_7030_ACTIF ? [{ hook: HOOK_7030, sens: DEUX_SENS, preuve: 'fork 52079875 app path, 10 bps' }] : []),
  { hook: HOOK_PREVU, sens: Object.freeze(['VENTE']), preuve: 'fork 52072599 callTracer' },
  { hook: HOOK_V2, sens: Object.freeze(['VENTE']), preuve: 'fork 52072599 callTracer' },
].map((e) => Object.freeze(e)));
/** R8 (C2, R5-2) : une liste de hooks « payeurs / facturants » passee par un APPELANT ne garde que NOS hooks (estNotreHook)
 *  et ceux de HOOKS_PAIENT_DEJA_A6CF — jamais un hook quelconque (qui serait alors admis sur une pool de block ou
 *  dispenserait le routeur de son frais). Entrees { hook, … } ou adresses ; l ordre est garde. */
export function filtrerHooksPayeurs(liste) {
  const connus = new Set(HOOKS_PAIENT_DEJA_A6CF.map((e) => String(e.hook).toLowerCase()));
  return (Array.isArray(liste) ? liste : []).filter((e) => {
    const h = String((e && e.hook) || e || '').toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(h) && (estNotreHook(h) || connus.has(h));
  });
}
/** Vrai = ce hook verse deja a6cf en ETH pour ce sens -> le routeur ne prend PAS son frais en plus. */
export function hookPaieDejaA6cf(h, sens, liste = HOOKS_PAIENT_DEJA_A6CF) {
  const x = String(h || '').toLowerCase();
  if (!x || (sens !== 'ACHAT' && sens !== 'VENTE')) return false;
  return liste.some((e) => !!e.hook && String(e.hook).toLowerCase() === x && e.sens.includes(sens));
}
/** UNE ROUTE (liste de sauts { cle, zeroForOne }) : une de ses jambes ETH porte-t-elle un hook qui verse deja
 *  a6cf dans le sens de CETTE jambe ? (ETH en currency0 : zeroForOne = ETH entre = ACHAT.)
 *  ⛔ Cas Zero 1 n° 3 : ne regarder que le saut 1 faisait payer deux fois une route ou le V8-open
 *    n est pas la premiere jambe. Les jambes sans ETH gardent le frais routeur (mesure faite en ETH). */
export function routePaieDejaA6cf(sauts, liste = HOOKS_PAIENT_DEJA_A6CF) {
  if (!Array.isArray(sauts)) return false;
  return sauts.some((s) => !!(s && s.cle && String(s.cle.currency0).toLowerCase() === '0x0000000000000000000000000000000000000000'
    && hookPaieDejaA6cf(s.cle.hooks, s.zeroForOne ? 'ACHAT' : 'VENTE', liste)));
}
/** ⛔ 2026-10-02 (fix-2) — DANS QUELLE DEVISE le hook verse-t-il a6cf sur cette jambe ? `null` s il ne verse rien.
 *  Mesure fork (Zero 1, bloc 52073896, callTracer) : le V8 preleve TOUJOURS en currency0, dans les deux sens —
 *    V8 USDC/block vente : USDC · V8 NVDAc/block (NVDAc = currency0) : NVDAc · V8 block/NVDAc (block = currency0) : BLOCK.
 *  V1/V2 a la vente : la devise de SORTIE (ETH mesure). V9 : currency0 suppose, et seulement si V9_PAIE_DEJA_A6CF === true. */
export function deviseFraisHook(cle, sens, zeroForOne, liste = HOOKS_PAIENT_DEJA_A6CF) {
  if (!cle || !hookPaieDejaA6cf(cle.hooks, sens, liste)) return null;
  const x = String(cle.hooks).toLowerCase();
  const c0 = String(cle.currency0 || '').toLowerCase(), c1 = String(cle.currency1 || '').toLowerCase();
  /* V1/V2 (vente seulement) : la devise de SORTIE. Tout autre hook de la liste — V8, V9 mesure, V8-open (ETH/<token>,
   *   preleve en ETH dans les deux sens, fork 52074194) — preleve en currency0. */
  if (x === HOOK_PREVU.toLowerCase() || x === HOOK_V2.toLowerCase()) return zeroForOne ? c1 : c0;
  /* 7030 : la devise ADMISE par le hook (ETH ou sa liste fixe) — l autre cote est le block, jamais preleve. */
  if (estHook7030(x)) return c0 === '0x0000000000000000000000000000000000000000' || DEVISES_ADMISES_7030.includes(c0) ? c0 : c1;
  return c0;
}
/** ⛔ GARDE A L EXECUTION (crosscheck Zero 1 sur ee8de19, 2026-10-02) : « drapeau ON refuse si la liste
 *  V8-open est vide » n etait verifie QUE par un test (incoherenceMarcheOuvert). A l execution, rien ne
 *  l empechait : drapeau ON + liste vide, une pool V8-open (qui verse deja a6cf) est indiscernable d un
 *  hook etranger quelconque, et le routeur reprendrait son frais EN PLUS (double frais).
 *  ⇒ Tant que la configuration est incoherente, toute route dont une jambe porte un hook que l app ne sait
 *    pas classer (ni sans hook, ni un des notres, ni dans HOOKS_PAIENT_DEJA_A6CF) est REFUSEE — le chemin
 *    referent o1 compris (LaunchHook o1 = hook etranger). Configuration coherente : null, rien ne change.
 *  @param {Array<{cle:{hooks:string}}>} sauts — les jambes de la route ; @returns {string|null} la raison du refus */
export function refusMarcheOuvertIncoherent(sauts, { actif = MARCHE_OUVERT_ACTIF, hooks = HOOKS_MARCHE_OUVERT,
  liste = HOOKS_PAIENT_DEJA_A6CF } = {}) {
  const inc = incoherenceMarcheOuvert({ actif, hooks });
  if (!inc) return null;
  const inclasse = (Array.isArray(sauts) ? sauts : []).some((s) => {
    const h = String((s && s.cle && s.cle.hooks) || '').toLowerCase();
    if (!h || /^0x0{40}$/.test(h)) return false;
    if (estNotreHook(h)) return false;
    return !liste.some((e) => !!e.hook && String(e.hook).toLowerCase() === h);
  });
  return inclasse ? inc + ' — a pool on a hook we cannot classify could be charged twice; nothing was sent' : null;
}
/** ⛔ Selecteur de « porteLeLabel(address) » — MESURE avec « cast sig », jamais ecrit de memoire. */
export const SEL_PORTE_LABEL = '0x330676aa';
export const ETATS_LABEL = ['OUI', 'NON', 'NON_LU'];
/**
 * Le block porte-t-il le label que le V4 exige ? Lecture seule, AVANT de demander une signature.
 * ⛔ TROIS ETATS, JAMAIS UN BOOLEEN. « pas lu » n est ni « oui » ni « non » : le confondre avec l un
 *    des deux ferait soit payer pour rien, soit refuser un createur legitime sur un RPC qui tousse.
 */
export async function blockPorteLeLabel({ rpc, jeton }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton || ''))) return 'NON_LU';
  try {
    const data = SEL_PORTE_LABEL + String(jeton).replace(/^0x/, '').toLowerCase().padStart(64, '0');
    /* ⛔ ON LIT LE VERROU DU HOOK QUI REFUSE. C est le V5 qui gate desormais les inscriptions ;
     *    interroger le V4 repondrait pour un contrat qui ne decide plus rien. Les deux portent le
     *    meme marqueur aujourd hui — ce sera faux le jour ou l un des deux changera. */
    const x = await rpc('eth_call', [{ to: HOOK_V5, data }, 'latest']);
    if (typeof x !== 'string' || !/^0x[0-9a-f]*$/i.test(x) || x.length < 4) return 'NON_LU';
    return BigInt(x) === 1n ? 'OUI' : 'NON';
  } catch { return 'NON_LU'; }
}
/** Le V4 est-il deploye ? Lu sur son code. */
export async function hookV4Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V4, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V5 est-il deploye ? Lu sur son code, jamais suppose. */
export async function hookV8Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V8, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V7 est-il deploye ? Lu sur son code. */
export async function hookV7Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V7, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V6 est-il deploye ? Lu sur son code. */
export async function hookV6Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V6, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V5 est-il deploye ? Lu sur son code. */
export async function hookV5Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V5, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** Le V3 est-il deploye ? Lu sur son code. */
export async function hookV3Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V3, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** La V2 est-elle deployee ? Lu sur son code. */
export async function hookV2Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V2, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/* tip 2300/2356: HOOK_PREVU = 0xaa6D…2044 a6cf. Legacy 0x34E3…6044 still 37eb — unused by new Launch. */
export const ETATS_HOOK = ['DEPLOYE', 'ABSENT', 'NON_LU'];

/** Destinataires et montants de la frappe initiale d un nouveau block — 100% creator. */
export function repartitionFrappe(supply, compte) {
  if (typeof supply !== 'bigint' || supply <= 0n) throw new Error('supply must be a positive bigint');
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) throw new Error('creator account required');
  return { destinataires: [compte], montants: [supply], frais: 0n, createur: supply };
}

/** Le hook existe-t-il sur la chaine ? Lu sur son code, jamais suppose. */
export async function hookDeploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_PREVU, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * LE CHOIX DU HOOK D UN NOUVEAU MARCHE — UNE SEULE FONCTION, POUR LES DEUX CHEMINS.
 *
 * ⛔⛔ LE DEFAUT QUE CETTE FONCTION EXISTE POUR TUER (mesure du 2026-09-21). L app avait DEUX
 *     chemins d ouverture de marche, et ils ne choisissaient pas le meme hook :
 *       · Launch pas a pas (app.html:7089) lisait la chaine et prenait le plus recent deploye ;
 *       · Create « une seule signature » (app.html:8999) ecrivait `const hook = HOOK_V5;` EN DUR.
 *     Or la garde censee desactiver ce second chemin, `$('#cVieDirecte')`, interroge un element qui
 *     N EXISTE PAS dans la page : elle est donc toujours fausse, et ce chemin tourne TOUJOURS.
 *     Consequence mesuree : 0 marche sur les V6, V7 et V8 apres leur deploiement. On cherchait une
 *     explication du cote de la demande ; elle etait dans une constante.
 *
 * ⛔ LA LECON, ECRITE ICI PARCE QU ELLE S EST DEJA PRODUITE AILLEURS : quand un choix existe en deux
 *    exemplaires, le correctif applique a l un ne suit pas l autre. Le choix n a donc plus qu un
 *    seul exemplaire, et un test refuse qu un second reapparaisse.
 *
 * ⛔ « NON_LU » N EST PAS « DEPLOYE » : un noeud qui tousse fait retomber sur le hook precedent,
 *    jamais l inverse. Un hook absent ne doit jamais etre choisi par accident.
 * ⛔⛔ SAUF LE 7030 (2026-10-10) : quand il s applique a la devise, « NON_LU » ne retombe sur RIEN — `undefined`.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

/** Le hook sur lequel un NOUVEAU marche doit s ouvrir. Rend `undefined` si aucun ne convient — ou si le 7030 s applique a la
 *  devise et que son code n a pas pu etre LU (alors : « non lu, reessayez », jamais un autre hook).
 * @param {object} o
 * @param {Function} o.rpc          appel JSON-RPC
 * @param {boolean}  o.mainnet      sur Base mainnet, V4 et V5 sont deployes pour toujours (code LU)
 * @param {boolean}  o.avecDevise   la paire n est pas l ETH natif — le V1 ne sait pas les traiter
 * @param {string}   o.etatV1       etat deja lu du V1, pour ne pas le relire
 * @param {string}   [o.devise]     adresse de la devise de cotation (route les actions/B20 vers le V9)
 */
export async function hookCourant({ rpc, mainnet = false, avecDevise = false, etatV1 = 'NON_LU', devise = null }) {
  /* ⛔ 2026-10-02 : 7030 d abord, SEULEMENT drapeau allume ET code lu sur la chaine, pour toute devise qu il admet.
   * ⛔⛔ 2026-10-10 — UNE LECTURE RATEE DU 7030 NE CHOISIT JAMAIS UN AUTRE HOOK. Le catch d avant « retombait sur la suite » :
   *   un seul hoquet de noeud sur eth_getCode faisait planifier une vraie naissance sur le V8 (liste figee : ETH, TBLOCK + les
   *   12 de paires.js DEVISES_ADMISES_V8) au lieu du 7030 (live depuis le bloc 52 132 476 ; son code ne peut plus disparaitre,
   *   EIP-6780). NON_LU rend donc `undefined`, sans lire aucun autre hook : chaque appelant dit « non lu, reessayez » et ne
   *   propose RIEN a signer. Test : test-hook-7030-non-lu-20261010.mjs.
   * ⛔⛔ ET SUR MAINNET, UN CODE VIDE N EST PAS UNE ABSENCE (decision du lead, 2026-10-10, revue adverse : une seule reponse « 0x »
   *   menait encore a un plan PRET sur le V8). Le code du 7030 existe sur mainnet depuis le bloc 52 132 476 et ne peut plus
   *   disparaitre : un « 0x » y vient d un noeud en retard ou de secours (ce depot l a deja paye : app.html, « un RPC de secours
   *   rendait 0x » faisait choisir le V1). Sur mainnet, ABSENT vaut donc NON_LU -> `undefined`, comme V4/V5 y sont tenus pour
   *   deployes. Hors mainnet (Sepolia, fork d avant le deploiement), un code vide garde l ancienne echelle, a l identique. */
  if (HOOK_7030_ACTIF && hookDeLancementPour(devise || '0x0000000000000000000000000000000000000000', 8453, { h7030: true }) === '7030') {
    const etat7030 = await hook7030Deploye({ rpc });
    if (etat7030 === 'DEPLOYE') return HOOK_7030;
    if (etat7030 !== 'ABSENT' || mainnet) return undefined;
  }
  /* ⛔ V9 D ABORD pour une action / un B20 de sa liste — et SEULEMENT s il est deploye (code LU).
   *    « NON_LU » ou « ABSENT » : on retombe sur le V8, exactement comme avant. */
  if (devise && deviseVaSurV9(devise) && await hookV9Deploye({ rpc }) === 'DEPLOYE') return HOOK_V9;
  if (await hookV8Deploye({ rpc }) === 'DEPLOYE') return HOOK_V8;
  if (await hookV7Deploye({ rpc }) === 'DEPLOYE') return HOOK_V7;
  if (await hookV6Deploye({ rpc }) === 'DEPLOYE') return HOOK_V6;
  if ((mainnet ? 'DEPLOYE' : await hookV5Deploye({ rpc })) === 'DEPLOYE') return HOOK_V5;
  if ((mainnet ? 'DEPLOYE' : await hookV4Deploye({ rpc })) === 'DEPLOYE') return HOOK_V4;
  /* ⛔ Le V1 n admet que l ETH : lui donner une devise ouvrirait un marche qu il ne sait pas taxer. */
  if (avecDevise) return undefined;
  return etatV1 === 'DEPLOYE' ? HOOK_PREVU : undefined;
}
