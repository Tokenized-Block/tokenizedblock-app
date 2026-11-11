// echange.js — acheter / vendre un block DANS l app, avec le frais d interface de 0,5 %, et le buyback.
// ================================================================================================
// ⛔ HARD RULE tip 2349/2350 / 20260922-2023: every in-app Buy/Sell 0.5% → FEE_WALLET only (never 37eb, never skip — including hooked pools).
//    Hooked Dex may add hook chop on top; zero interface fees worse than stacked. Birth=V8 only on MAIN.
//    tip 20260922-2026: fee asset ETH or USDC only at FEE_WALLET — never TBLOCK/TBGAS/block tokens.
//    External Dex on unhooked pools = 0 forever — chop that volume only via TbFeeHook Launch (new pool id).
// ⛔ DECISION DE PHIL (2026-09-13) : 0,5 % de chaque achat / vente fait via l app va au wallet de frais, DIT avant
//    la signature. Mesure qui l a motivee : 459 creations B20 en 22 h sur la factory publique de Base, 2 chez nous.
// ⛔ LE FRAIS EST PRIS EN ETH, DANS LA MEME TRANSACTION, PAR LES ACTIONS DU ROUTEUR v4 (lues a la source) :
//    · achat (ETH -> block) : swap du NET, SETTLE du TOTAL paye par l utilisateur, TAKE du frais vers le wallet
//      de frais, TAKE_ALL du block vers l utilisateur — la difference total − net cree le credit que TAKE preleve ;
//    · vente (block -> ETH) : swap, SETTLE_ALL du block, TAKE_PORTION 50 bips de l ETH vers le wallet de frais,
//      TAKE_ALL du reste vers l utilisateur.
//    Rien n est signe ici ; le wallet de l utilisateur signe. Aucune seconde transaction de frais a oublier.
// ⛔ BUYBACK : le wallet de frais qui achete TBLOCK ne se paie pas de frais a lui-meme (frais = 0).
// ⛔ AVANT DE PROPOSER LA SIGNATURE, LA CHAINE EST INTERROGEE : quote (prix reel), forme de struct acceptee,
//    puis eth_call de la transaction exacte. Une lecture ratee = rien a signer.
import { TBLOCK_TEST_ANCIEN as TBLOCK, HOOK_PREVU, HOOK_V8, estNotreHook, hookPaieDejaA6cf, deviseFraisHook, filtrerHooksPayeurs, HOOKS_PAIENT_DEJA_A6CF, refusMarcheOuvertIncoherent, estHook7030, fraisHookBps, HOOK_V9, V9_PAIE_DEJA_A6CF, HOOK_7030, HOOK_7030_ACTIF } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */
import { encodeV4Swap, encodeQuote, formeAcceptee, paramsAction, paramsSwapExactInSingle, ACTIONS_V4, selecteur,
  AVEC_MINHOP, SANS_MINHOP, cleDePool, poolId, estErreurTransportRpc } from './pool.js';
import { etapesPermit2Exactes } from './approbations-exactes.js';
import { vieDuBlock, cleEstUnMarche } from './marche.js';
import { choisirPool, MARGE_BPS } from './choix-de-pool.js';
import { poolSansHookInterdite, indexPoolSansHookInterdite, MESSAGE_SANS_POOL, ROUTE_VIA_TBLOCK, cleTouchTblock,
  REFUS_FRAIS_HOOK_EN_BLOCK, fraisHookEnBlock, MESSAGE_PAS_ICI, estDeviseConnue, cleSansHook, formatOpenLaunch, estBlockDeRoute, hookAdmisPourBlock, hooksDeRoute } from './pool-sans-hook.js';
/* ⛔ L ASSEMBLAGE DE LA ROUTE MULTI-SAUTS VIT A PART, teste et mute (45 cas, 14/14 mutations). Ici
 *   on ne fait que LIRE les prix et APPELER : melanger la lecture et la decision rendrait un refus
 *   indistinguable d une lecture ratee — le defaut numero un de ce depot. */
import { actionsMultiSauts, routePrete, SAUTS_MIN, SAUTS_MAX } from './route-v4-multi-sauts.js';
/* ⛔ LE BAREME VIT A PART, avec son plancher monotone et ses paliers tires de la distribution
 *   MESUREE. Le recopier ici ferait deux baremes qui divergeraient. */
import { fraisPourMontant } from './frais-degressif.js';
import { hookDataReferentO1 } from './referent-o1.js';
import { FEE_WALLET, WALLET_TRESOR_SMART } from './frais-creation.js';
import { PERMIT2, V4_ADRESSES } from './lancer-pool.js';
import { USDC_BASE, CLES_PRIX } from './prix-eth.js';
import { ACTIONS_COINBASE } from './paires.js';
/* 2026-10-04 : les lectures INDEPENDANTES d un plan partent ensemble, bornees (voir lectures-en-vol.js pour la mesure). */
import { enVolBorne, lireEnsemble, LECTURES_EN_VOL_MAX } from './lectures-en-vol.js';

/** ⛔ RECOPIEES de index.html (const ROUTEUR, const QUOTER) — un test compare. */
export const ROUTEUR = { 84532: '0x492E6456D9528771018DeB9E87ef7750EF184104', 8453: '0x6ff5693b99212DA76aD316178A184AB56D299b43' };
export const QUOTEUR = { 84532: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba', 8453: '0x0d5e0F971ED27FBfF6c2837bf31316121532048D' };
export const FRAIS_INTERFACE_BPS = 50n;
/** tip 0036 / 20260922-2026: MUST stay false — fee lands ETH/USDC at a6cf; never auto-buy TBLOCK/TBGAS as fee asset. */
export const RACHAT_AUTO = false;
export const ETATS_ECHANGE = ['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE'];
const ETH = '0x0000000000000000000000000000000000000000';
/** ⛔ 2026-10-02 (fix-2) — UN FRAIS PAR JAMBE, QUELLE QUE SOIT currency0. Le hook de cette jambe verse-t-il a6cf
 *  dans une devise VENDABLE (ETH, USDC, ou une devise dont l appelant a lu le prix) — jamais le block lui-meme ?
 *  Oui : le routeur ne prend rien. Non (hook qui paie en block, ou pas de hook payeur) : le routeur garde son frais.
 *  Rend { paie, devise } ; `devise` sert a calculer l assiette du frais du hook (garde anti-poussiere). */
export function hookPaieEnDeviseVendable({ cle, sens, zeroForOne, jeton = null, fraisDevisesOk = null, liste = HOOKS_PAIENT_DEJA_A6CF }) {
  const d = deviseFraisHook(cle, sens, zeroForOne, liste);
  if (!d || (jeton && d === String(jeton).toLowerCase())) return { paie: false, devise: d };
  /* ⛔ 2026-10-02 14:49 (Zero 1, PREUVE-FRAIS-VIEILLES-POOLS) : le V8 verse a6cf dans la devise appariee, dans les deux
   *   sens, QUELLE QU ELLE SOIT (TBLOCK(e7e9)/SPCXc mesure : hook 4 975 + routeur 5 000 = double frais). Sur une pool V8 dont
   *   le block n est pas currency0, le hook paie toujours : le routeur ne prend rien, prix lu ou non. */
  /* 2026-10-02 (hook 7030) : meme regle pour le 7030 (drapeau allume) — il preleve dans la devise admise, jamais le block. */
  const v8 = String((cle && cle.hooks) || '').toLowerCase() === String(HOOK_V8).toLowerCase() || estHook7030(cle && cle.hooks);
  const ok = v8 || d === ETH || d === USDC_BASE.toLowerCase() || (fraisDevisesOk instanceof Set && fraisDevisesOk.has(d));
  return { paie: ok, devise: d };
}
/** Le SENS d une jambe de route, RELATIF AU BLOCK : ACHAT = le block sort de la jambe. Le block est le cote qui
 *  n est pas une devise connue. Deux devises connues (ETH/USDC) ou deux blocks : convention historique
 *  « zeroForOne = ACHAT » (juste quand la devise est currency0). */
export function sensRelatifAuBlock(x) {
  const c0 = String(x.cle.currency0).toLowerCase(), c1 = String(x.cle.currency1).toLowerCase();
  const k0 = estDeviseConnue(c0), k1 = estDeviseConnue(c1);
  if (k0 === k1) return x.zeroForOne ? 'ACHAT' : 'VENTE';
  return (x.zeroForOne ? c1 : c0) === (k0 ? c1 : c0) ? 'ACHAT' : 'VENTE';
}
/** ⛔ 2026-10-02 (fix-2, Claude C) — jambe TBLOCK/ETH de `routeViaTblock` : le frais du hook n y compte QUE s il est en ETH.
 *  Avant, la sortie du routeur reposait sur la seule construction (cleT est TBLOCK/ETH). Garde explicite, testee. */
export function hookPaieJambeTblock(cleT, sens) {
  if (!cleT || String(cleT.currency0 || '').toLowerCase() !== ETH) return false;
  const r = hookPaieEnDeviseVendable({ cle: cleT, sens, zeroForOne: sens === 'ACHAT', jeton: TBLOCK });
  return r.paie && r.devise === ETH;
}
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
/** tip 20260916-0012: actions hold BigInt — JSON.stringify throws «serialize a BigInt» and kills Buy/Sell quotes. */
function jsonSafe(x) {
  return JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v));
}

/** Le frais sur un montant : tronque vers le bas, le reste va au swap — la somme est exacte. */
export function fraisSur(total, bps) {
  const t = BigInt(total), b = BigInt(bps);
  const frais = (t * b) / 10000n;
  return { frais, net: t - frais };
}

/** ⛔⛔ L EXEMPTION SUIT LE TRESOR, PAS LA DESTINATION (2026-09-17). Depuis que les frais partent vers
 * le wallet perso de Phil, lier l exemption a la DESTINATION aurait rendu ses propres trades gratuits
 * — donc invisibles, donc impossibles a prouver : on aurait rejoue « le wallet ne recoit rien »
 * exactement comme avec le rachat automatique. Ce qui ne se paie pas de frais a lui-meme, c est le
 * smart wallet qui rachete du TBLOCK. */
export const estWalletDeFrais = (compte) => String(compte || '').toLowerCase() === WALLET_TRESOR_SMART.toLowerCase();

/** tip 2350 / 20260922-2023 / 20260922-2026: fail-closed — TAKE/TAKE_PORTION → FEE_WALLET in ETH or USDC only (never TBLOCK/TBGAS/block).
 *  Hooked pools may ALSO chop on-chain; zero interface fees were worse than stacked fees. */
/* ⛔⛔ `bpsAttendu` EXISTE PARCE QUE LES RAILS N ONT PAS LE MEME TAUX, ET IL EST EXIGE, PAS DEVINE.
 *   Decision de Phil (2026-10-01) : le rail multi-sauts prend 0,1 % par transaction, la ou le
 *   chemin in-app historique prend 0,5 %. Sans ce parametre, le garde refusait 10 bps et la route
 *   entiere tombait.
 * ⛔ CE N EST PAS UN ASSOUPLISSEMENT : le taux reste EXIGE A L IDENTIQUE, seule sa valeur attendue
 *   est passee par l appelant. Tous les autres controles — beneficiaire, devise vendable, presence
 *   d un TAKE vers a6cf — sont inchanges. Un appelant qui oublierait le parametre retombe sur
 *   `FRAIS_INTERFACE_BPS`, donc sur le comportement d avant : le defaut est le plus strict. */
/* ⛔ 2026-10-02 (Zero 1) : la poussiere (frais arrondi a 0) se dit en anglais simple, jamais « fee path broken » ;
 *   la raison exacte reste dans `causeInterne` (diagnostic, tests), elle n est pas affichee. */
export const MESSAGE_TROP_PETIT = 'Amount too small to trade here.';
function refusFraisEchange(ko, resume) {
  if (/^fee amount is zero\b/.test(String(ko))) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_TROP_PETIT, refusPoussiere: true, causeInterne: 'Buy/Sell fee path broken: ' + ko, resume };
  }
  return { etat: 'REFUSE', pourquoi: 'Buy/Sell fee path broken: ' + ko, resume };
}
function assertFraisInterfaceA6cf({ compte, bps, resume, actions, fraisDevisesOk = null,
  bpsAttendu = FRAIS_INTERFACE_BPS, hookPaie = false, assietteHook = null }) {
  if (estWalletDeFrais(compte)) return null; /* le tresor ne se facture pas lui-meme */
  /* ⛔ 2026-10-02 : le hook verse deja a6cf sur cette jambe -> le routeur ne prend RIEN (un frais par jambe). */
  if (hookPaie) {
    if (bps !== 0n) return 'double fee: the hook already pays the fee wallet on this leg';
    const ko = jsonSafe(actions || []).toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase())
      ? 'double fee: a router TAKE to the fee wallet on a leg the hook already pays'
      /* ⛔ 2026-10-02 (fix-2, poussiere) : f319fc9 refusait « fee amount is zero » ; 0d870cf rendait ici AVANT ce controle,
       *   et un achat V8/ETH de 199 wei passait avec 0 wei a a6cf (le hook arrondit a 0). Meme garde, sur l assiette du hook. */
      : (assietteHook == null || (BigInt(assietteHook) * FRAIS_INTERFACE_BPS) / 10000n <= 0n)
        ? 'fee amount is zero — amount too small for 0.5%' : null;
    /* ⛔⛔ 2026-10-02 (KO prod, Grok Super) : les gardes de l ECRAN exigeaient 0,5 % > 0 sans exception et refusaient
     *   tout Buy/Sell dont le hook paie deja a6cf. Le plan le DIT explicitement, et seulement apres CE controle :
     *   l ecran ne doit pas deviner a partir de fraisBps = 0 (le cas « wallet de frais » vaut aussi 0). */
    if (!ko && resume) resume.fraisParHook = true;
    return ko;
  }
  if (bps !== bpsAttendu) return 'interface fee bps missing (want ' + bpsAttendu + ')';
  if (String(resume && resume.beneficiaireFrais || '').toLowerCase() !== FEE_WALLET.toLowerCase()) {
    return 'fee beneficiary is not the configured fee wallet';
  }
  const asset = String(resume && resume.fraisDevise || '');
  const deviseResume = String(resume && resume.devise || '').toLowerCase();
  const pairIsUsdc = asset === 'pair' && deviseResume === USDC_BASE.toLowerCase();
  /* ⛔⛔ LA DEVISE DE FRAIS EST AUTORISEE PAR L APPELANT, SUR MESURE — jamais par une liste ecrite
   *     ici. Ce verrou n existait pas pour embeter : a6cf a DEJA ete paye en jetons invendables
   *     (mesure d aout 2026 — 7 detentions verifiees, ZERO avec un marche, part reelle 0 $). Un
   *     frais paye dans un jeton qu on ne peut pas vendre n est pas un revenu, c est un decor.
   *   ⛔ MAIS TOUT REFUSER ETAIT FAUX AUSSI : mesure du 2026-09-25, 8 des 13 actions Coinbase ont
   *     un marche reel (prix lisible, liquidite au-dessus du seuil). Les refuser fermait des
   *     echanges qui nous auraient payes en quelque chose de VENDABLE.
   *   ⇒ L appelant passe l ensemble des devises dont il a LU le prix. Absent ou vide, on retombe
   *     exactement sur le comportement d avant : ETH ou USDC. Fail-closed par construction — une
   *     devise qu on n a pas su mesurer n entre jamais dans cet ensemble. */
  const pairAutorisee = asset === 'pair' && deviseResume
    && fraisDevisesOk instanceof Set && fraisDevisesOk.has(deviseResume);
  if (asset !== 'ETH' && asset !== 'USDC' && !pairIsUsdc && !pairAutorisee) {
    return 'fee asset must be ETH, USDC or a currency with a measured market (not block tokens)';
  }
  const blob = jsonSafe(actions || []).toLowerCase();
  const sink = FEE_WALLET.slice(2).toLowerCase();
  if (!blob.includes(sink)) return 'fee TAKE/TAKE_PORTION to the fee wallet missing from actions';
  const usdc = USDC_BASE.slice(2).toLowerCase();
  const ethWord = '0'.repeat(64); /* native ETH currency padded in TAKE params */
  const takeEth = blob.includes(ethWord + '000000000000000000000000' + sink)
    || blob.includes('0000000000000000000000000000000000000000000000000000000000000000'
      + '000000000000000000000000' + sink);
  const takeUsdc = blob.includes(usdc) && blob.includes(sink);
  /* ⛔ LE CALLDATA DOIT NOMMER LA DEVISE AUTORISEE, pas seulement le resume. Un resume est une
   *   promesse ; seuls les OCTETS partent sur la chaine. Meme lecon que sur le Bridge ce matin. */
  const takeDeviseOk = !!pairAutorisee && blob.includes(deviseResume.slice(2)) && blob.includes(sink);
  if (!takeEth && !takeUsdc && !takeDeviseOk) {
    return 'fee TAKE/TAKE_PORTION must reach the fee wallet in an allowed currency';
  }
  if (resume.frais == null || BigInt(resume.frais) <= 0n) return 'fee amount is zero — amount too small for 0.5%';
  return null;
}

async function appelOuErreur(rpc, tx) {
  try { return { result: await rpc('eth_call', [tx, 'latest']) }; }
  catch (e) { return { error: { message: String((e && e.message) || e) } }; }
}

/**
 * @param {object} o
 * @param {'ACHAT'|'VENTE'} o.sens
 * @param {bigint} o.montant  achat : wei d ETH payes (frais compris) ; vente : unites brutes du block vendues
 */
/* ══ 2026-10-02 22:19 (Phil) — UN BLOCK V1 (HOOK_PREVU) EST RAMENE SUR LA BONNE V ═════════════════════════════════════════
 * ⛔⛔ Achat ET vente d un block dont le marche lu est V1 passent par sa pool de VERSION ACTUELLE (meme paire, format Launch
 *     frais 0 / espacement 200 ; 7030 si drapeau allume, V9 si mesure payant, puis V8) quand elle est initialisee ET a de
 *     la liquidite : un frais, verse par le hook, jamais en block. Sans pool actuelle : achat REFUSE (le V1 preleve du
 *     block a l achat), vente laissee sur V1 (un frais, en ETH) pour ne pas pieger les detenteurs, marquee
 *     `migrationEnAttente`. Une lecture ratee n est pas une absence : `ratees` > 0 => NON_MESURE. */
export const HOOKS_VERSION_ACTUELLE = Object.freeze([...(HOOK_7030_ACTIF ? [HOOK_7030] : []),
  ...(HOOK_V9 && V9_PAIE_DEJA_A6CF === true ? [HOOK_V9] : []), HOOK_V8]);
export async function poolActuelleDuBlock({ rpc, stateView, cle, hooks = HOOKS_VERSION_ACTUELLE }) {
  let ratees = 0;
  const mot = (r) => (r && String(r).length >= 66 ? BigInt(String(r).slice(0, 66)) : null);
  for (const h of hooks) {
    const c = { currency0: cle.currency0, currency1: cle.currency1, fee: 0, tickSpacing: 200, hooks: h };
    const id = poolId(c).slice(2);
    let s0, lq;
    try {
      /* 2026-10-04 : le prix et la liquidite d une MEME pool ne dependent pas l un de l autre — lus ensemble. Les hooks, eux,
       *   restent lus l un apres l autre : le premier qui a une pool gagne, et lire les suivants serait des lectures en plus. */
      const [brutS0, brutLq] = await lireEnsemble([
        () => rpc('eth_call', [{ to: stateView, data: '0x' + selecteur('getSlot0(bytes32)') + id }, 'latest']),
        () => rpc('eth_call', [{ to: stateView, data: '0x' + selecteur('getLiquidity(bytes32)') + id }, 'latest']),
      ]);
      s0 = mot(brutS0);
      lq = mot(brutLq);
    } catch { ratees += 1; continue; }
    if (s0 === null || lq === null) { ratees += 1; continue; }
    if (s0 !== 0n && lq > 0n) return { cle: c, ratees };
  }
  return { cle: null, ratees };
}

/** Au-dela de cet impact (bps, frais LP de la pool inclus), l ecran AVERTIT avant la signature. ⛔ PROPOSITION a confirmer par le
 *  proprietaire : rien n est refuse sur ce seuil. Repere mesure le 2026-10-09 : la plupart des pools v4 d actions coutent 5 a 8 %
 *  des 10 USDC (leur frais LP) ; MRVLc 16 % a 100 USDC. */
export const IMPACT_AVERTIR_BPS = 1000n;
/**
 * L impact d un devis contre le prix INSTANTANE de la meme pool. Tout en BigInt sur les unites brutes.
 *   prix (currency1 par currency0, brut) = sqrtPriceX96^2 / 2^192
 *   zeroForOne : sortieSpot = entree * sqrt^2 / 2^192   ;   sinon : sortieSpot = entree * 2^192 / sqrt^2
 * @returns {{ impactBps: bigint|null, sortieSpot: bigint|null }}  null = non lu (jamais 0 par defaut)
 */
export async function impactDuDevis({ lire, stateView, cle, zeroForOne, entree, sortie }) {
  try {
    const r = await lire('eth_call', [{ to: stateView, data: '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2) }, 'latest']);
    if (!r || String(r).length < 66) return { impactBps: null, sortieSpot: null };
    const s = BigInt(String(r).slice(0, 66));
    if (s <= 0n) return { impactBps: null, sortieSpot: null };
    const Q192 = 1n << 192n;
    const spot = zeroForOne ? (BigInt(entree) * s * s) / Q192 : (BigInt(entree) * Q192) / (s * s);
    if (spot <= 0n) return { impactBps: null, sortieSpot: null };
    const q = BigInt(sortie);
    return { impactBps: q >= spot ? 0n : ((spot - q) * 10000n) / spot, sortieSpot: spot };
  } catch (_) { return { impactBps: null, sortieSpot: null }; }
}
export async function planEchange({ rpc, chaine, jeton, compte, sens, montant, toleranceBps = 100n, maintenant = Date.now(),
  marcheLu = null, cleImposee = null, fraisDevisesOk = null,
  /* injectable pour les tests : actif + hooks du marche ouvert ; defaut = marche-ouvert.js */
  marcheOuvert = undefined }) {
  const R = ROUTEUR[Number(chaine)], Q = QUOTEUR[Number(chaine)], V = V4_ADRESSES[Number(chaine)];
  if (!R || !Q || !V) return { etat: 'REFUSE', pourquoi: 'no Uniswap router on this network here' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  if (sens !== 'ACHAT' && sens !== 'VENTE') return { etat: 'REFUSE', pourquoi: 'buy or sell' };
  const m = BigInt(montant);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'enter an amount above zero' };
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol >= 10000n) return { etat: 'REFUSE', pourquoi: 'slippage out of range' };

  const lire = rpc;
  /* ⛔⛔ BUG TROUVE EN VERIFIANT (2026-09-13, WOFI) : le profil venait de LIRE le marche (12,67 ETH), et le clic
   * « Prepare buy » le relisait — refuse par le noeud public sature : « its market could not be read ». Le marche
   * deja lu par `vieDuBlock` (meme fonction, meme cle) est reutilise ; sinon on lit, et on relit UNE fois. */
  /* ⛔ « PAIRED WITH » (2026-09-19) : un block peut avoir plusieurs marches (ETH, AAPLc, NVDAc…). Le marche CHOISI arrive
   *    avec sa cle exacte ; il n est pas relu, on le prend tel quel (la simulation de la transaction exacte le verifie). */
  let marche = cleImposee ? { etat: 'LUE', cle: cleImposee, paire: null }
    : (marcheLu && marcheLu.etat === 'LUE' && marcheLu.cle ? marcheLu : null);
  if (!marche) {
    marche = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton });
    if (marche.etat === 'NON_LUE') {
      await new Promise((ok) => setTimeout(ok, 1500));
      marche = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton });
    }
  }
  if (marche.etat !== 'LUE' || !marche.cle) {
    return { etat: marche.etat === 'NON_TROUVEE' ? 'REFUSE' : 'NON_MESURE',
      pourquoi: marche.etat === 'NON_TROUVEE' ? 'this block has no market to trade on yet' : 'its market could not be read' };
  }
  /* ⛔⛔ 2026-10-17 (trou (c), lu en construisant le Buy de Market) : le piege a frais LP STATIQUE > 10 % n etait ecarte QUE par
   *   vieDuBlock (cleEstUnMarche) — une cle recue par `marcheLu` ou `cleImposee` (la fiche, poolDecouvertPour, un appelant des rails)
   *   n etait jamais jugee ici. Mesure du jour : NGMI a deux pools ETH sans hook a 89,369 % et 88,475 % de frais LP a cote de sa pool
   *   o1 a 0 %. Un jeton TIERS (sources TB lues) passait les gardes suivantes avec une telle cle. Meme regle, meme fonction. */
  if (!cleEstUnMarche(marche.cle)) {
    return { etat: 'REFUSE', refusPiegeLp: true,
      pourquoi: 'this pool charges a static LP fee above 10% (' + (Number(marche.cle.fee) / 10000).toFixed(2) + '%): a trap, not a market — nothing was sent' };
  }
  let migrationEnAttente = false;
  if (String(marche.cle.hooks || '').toLowerCase() === HOOK_PREVU.toLowerCase()) {
    const actuelle = await poolActuelleDuBlock({ rpc: lire, stateView: V.stateView, cle: marche.cle });
    if (actuelle.cle) marche = { ...marche, etat: 'LUE', cle: actuelle.cle, remplaceV1: true };
    else if (actuelle.ratees > 0) return { etat: 'NON_MESURE', pourquoi: 'its market could not be read' };
    else if (sens === 'VENTE') migrationEnAttente = true;
    /* ACHAT sans pool actuelle : refuse plus bas (fraisHookEnBlock, texte « Not tradable here yet ») */
  }
  /* ⛔⛔ 2026-10-02 (regle du fondateur) : jamais une pool sans hook pour un block TB — refus avant toute cotation. */
  /* ⛔⛔ 2026-10-02 13:58 (fondateur) : plus aucune route par TBLOCK — ni TBLOCK lui-meme, ni un block apparie a TBLOCK. */
  if (!ROUTE_VIA_TBLOCK && (marche.paire === 'TBLOCK' || cleTouchTblock(marche.cle))) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusTblock: true };
  }
  if (marche.paire !== 'TBLOCK' && poolSansHookInterdite(marche.cle, [jeton])) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusSansHook: true };
  }
  /* ⛔ garde a l execution : drapeau marche ouvert ON + liste V8-open vide -> aucun hook inclassable */
  const refusMO = refusMarcheOuvertIncoherent([{ cle: marche.cle }], marcheOuvert);
  if (refusMO) return { etat: 'REFUSE', pourquoi: refusMO };
  /* ⛔⛔ 2026-10-02 (C2, F1, apres la garde marche ouvert) : un block sur une pool a hook TIERS (ni TB, ni OpenLaunch sans hook, ni o1 Standard) -> refus. */
  if (!hookAdmisPourBlock(marche.cle)) return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusBlocSansHookTb: true, refusHookTiers: true };
  /* tip 20260922-2023: ALWAYS take interface 0.5% → FEE_WALLET on in-app Buy/Sell (unless fee-wallet buyback).
   *    Prior skip when estNotreHook assumed hook TAKE ~3% already hit a6cf — live dig 2026-09-22: sink got 0
   *    from Buy/Sell volume (hooked path skipped interface AND hook was not depositing). Stacked fees
   *    (hook chop + 0.5% interface) beat zero fees. hooked Dex may add hook chop on top. Birth=V8 only. */
  const hookPaieDeja = !!(marche.cle && estNotreHook(marche.cle.hooks));
  /* ⛔ 2026-10-02 : mesure fork — V8 achat/vente, V1/V2 vente : le hook verse deja a6cf en ETH. */
  /*   Mesure faite sur des pools ETH seulement : une pool contre une devise ERC-20 garde le frais routeur. */
  /* ⛔ 2026-10-02 (fix-2) : plus de condition currency0 === ETH — elle laissait le routeur empiler ses 0,5 % sur le V8 des
   *   pools USDC et actions (Zero 1 : 34 075 hook + 33 904 routeur USDC sur la meme vente). La devise du hook decide. */
  const zfMarche = !!(marche.cle && (String(marche.cle.currency0).toLowerCase() === String(jeton).toLowerCase()
    ? sens === 'VENTE' : sens === 'ACHAT'));
  /* ⛔⛔ 2026-10-02 13:59 (fondateur) : jamais de frais en block a a6cf — une pool dont le hook preleverait en block est refusee. */
  if (REFUS_FRAIS_HOOK_EN_BLOCK && fraisHookEnBlock(marche.cle, jeton, sens, zfMarche)) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusFraisEnBlock: true };
  }
  const hookPaie = marche.paire !== 'TBLOCK' && !!marche.cle
    && hookPaieEnDeviseVendable({ cle: marche.cle, sens, zeroForOne: zfMarche, jeton, fraisDevisesOk }).paie;
  const bps = (estWalletDeFrais(compte) || hookPaie) ? 0n : FRAIS_INTERFACE_BPS;
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);
  /* ⛔⛔ ACHAT VIA TBLOCK (Phil, 2026-09-13 : « fait l achat via TBLOCK ») : un block apparie a TBLOCK se paie en ETH
   *    et se vend pour de l ETH, en DEUX sauts dans UNE transaction — ETH -> TBLOCK -> block, ou l inverse. */
  if (marche.paire === 'TBLOCK') {
    const route = await routeViaTblock({ lire, Q, V, marche, jeton, sens, m, tol, bps });
    if (!route.actions) return route;
    const koFrais = assertFraisInterfaceA6cf({ compte, bps: route.bps, resume: route.resume, actions: route.actions, hookPaie: route.hookPaie, assietteHook: route.assietteHook });
    if (koFrais) return refusFraisEchange(koFrais, route.resume);
    const { bps: _b, hookPaie: _h, assietteHook: _a, ...routeF } = route;
    return finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, ...routeF });
  }
  const cle = marche.cle;
  if (String(cle.currency0).toLowerCase() !== ETH) {
    /* ⛔⛔ MARCHE CONTRE UNE DEVISE ERC-20 (V3, 2026-09-19) : on paie la devise pour acheter, on la recoit en vendant — un saut.
     *    Seulement sur NOTRE hook : c est lui qui preleve (3 %) ; l interface n ajoute rien. Permit2 sur le jeton PAYE. */
    const c0 = String(cle.currency0).toLowerCase(), c1 = String(cle.currency1).toLowerCase(), j = String(jeton).toLowerCase();
    /* ⛔⛔ 2026-10-03 (Phil : « l app attrape le marche », taux 0,5 %, « un seul frais ») : un MEMESTOCK TIERS — block cote
     *   en action Coinbase sur un hook qui n est pas le notre (BLUEPILL/HIMSc 26 952 $ / 24 h, SI/NVDAc, mesures le meme
     *   jour) — se trade ici avec NOTRE frais de 0,5 %, pris DANS L ACTION (TAKE a l achat, TAKE_PORTION a la vente, plus
     *   bas) : un seul frais vers a6cf, le hook tiers ne nous verse rien. Toutes les gardes d apres jugent comme avant :
     *   l action doit etre MESUREE vendable (`fraisDevisesOk` : prix + liquidite lus), sinon refus. Tout AUTRE marche
     *   tiers cote en ERC-20 reste refuse. */
    const deviseTiers = c0 === j ? c1 : c0;
    /* ⛔ 2026-10-03 (Phil : « l appliquer de partout ») : meme regle pour TOUTE devise connue et vendable (USDC, OUSD, cbBTC,
     *   TOSHI, actions) — mesure prod : OCTO/OUSD, 100X et COBALT/USDC sur des hooks tiers. La garde « prix + liquidite
     *   LUS » (fraisDevisesOk, USDC admis d office) decide ensuite, comme pour une action. */
    const deviseVendable = estDeviseConnue(deviseTiers) || ACTIONS_COINBASE.some((a) => String(a.adr).toLowerCase() === deviseTiers);
    if (!hookPaieDeja && !deviseVendable) return { etat: 'REFUSE', pourquoi: 'this market is not a TokenizedBlock market — only those are traded here in another currency' };
    if (c0 !== j && c1 !== j) return { etat: 'REFUSE', pourquoi: 'this market is not this block' };
    const devise = deviseTiers;
    const zf = sens === 'ACHAT' ? devise === c0 : j === c0; // on paie currency0 -> zeroForOne
    /* ⛔⛔ CE REFUS FERMAIT TOUT MARCHE COTE AUTREMENT QU EN USDC, actions Coinbase comprises —
     *     alors que l ecran de Create promettait « buyers will need INTCc to trade your block ».
     *     Vrai sur la chaine, FAUX dans l app, et affiche juste avant de demander 0,001 ETH.
     *   ⇒ On accepte desormais une devise dont l appelant a MESURE le prix (`fraisDevisesOk`), et
     *     on refuse toujours le reste. Le frais atterrit dans cette devise — c est deja ce que fait
     *     le plan ci-dessous — donc la seule question qui compte est : saura-t-on la revendre ?
     *     a6cf a deja ete paye en jetons invendables une fois ; ca n arrivera pas par ce chemin. */
    const deviseBas = String(devise).toLowerCase();
    const deviseMesuree = fraisDevisesOk instanceof Set && fraisDevisesOk.has(deviseBas);
    if (bps > 0n && deviseBas !== USDC_BASE.toLowerCase() && !deviseMesuree) {
      return { etat: 'REFUSE', pourquoi: 'this market is priced in a currency we could not price in '
        + 'dollars, so the 0.5% fee could not be taken in something sellable — nothing was sent' };
    }
    const { frais: fraisPair, net: netPair } = sens === 'ACHAT' ? fraisSur(m, bps) : { frais: 0n, net: m };
    const montantQuote = sens === 'ACHAT' ? netPair : m;
    let q;
    try {
      const rq = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne: zf, montant: montantQuote }) }, 'latest']);
      q = BigInt('0x' + String(rq).slice(2, 66));
    } catch (e) {
      /* ⛔⛔ 2026-10-09 (post public sur MRVLc : « un achat de 1 000 $ fait +100 % » ; mesure le meme jour : la pool v4 MRVLc/USDC
       *   ne remplit qu environ 448 USDC, 500 et 1 000 revertent ; toute l offre MRVLc vaut ~1 800 $). Ce revert rendait
       *   NON_MESURE « could not be quoted » — le contraire de la verite : la pool a REPONDU, elle ne peut pas remplir CETTE taille.
       *   On recote au dixieme : s il passe, la pool est trop fine pour ce montant et on le DIT (REFUSE). S il revert aussi,
       *   c est bien une lecture ratee ou une pool morte : NON_MESURE comme avant. */
      let dixiemeCote = false;
      if (montantQuote / 10n > 0n) {
        try {
          const r10 = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne: zf, montant: montantQuote / 10n }) }, 'latest']);
          dixiemeCote = BigInt('0x' + String(r10).slice(2, 66)) > 0n;
        } catch (_) { dixiemeCote = false; }
      }
      if (dixiemeCote) return { etat: 'REFUSE', poolTropFine: true, pourquoi: 'this pool is too thin for this amount: it quotes a tenth of it, not all of it — try a much smaller amount' };
      return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
    }
    if (q <= 0n) return { etat: 'REFUSE', pourquoi: 'the pool returns nothing for this amount' };
    /* ⛔ L IMPACT DE PRIX, LU DANS LE DEVIS (2026-10-09, meme mesure) : 100 USDC de MRVLc coutaient +16 % sur le prix de la pool,
     *   400 USDC ~ +45 %, et le ticket ne disait que « au moins … (1 % de glissement) » — le minimum protege contre un mouvement
     *   APRES le devis, pas contre l impact DEJA dans le devis. `impactBps` = sortie au prix instantane (slot0 de CETTE pool) moins
     *   la sortie cotee, en bps de la premiere ; il inclut le frais LP de la pool. Lecture ratee = null (non lu), jamais 0. */
    const impact = await impactDuDevis({ lire, stateView: V.stateView, cle, zeroForOne: zf, entree: montantQuote, sortie: q });
    const entree = sens === 'ACHAT' ? devise : j, sortie = sens === 'ACHAT' ? j : devise;
    let actionsD, resumeD, valeurD = 0n;
    if (sens === 'ACHAT') {
      const min = (q * (10000n - tol)) / 10000n;
      actionsD = bps > 0n
        ? [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(devise, m, true) },
          { code: ACTIONS_V4.TAKE, params: paramsAction.take(devise, FEE_WALLET, fraisPair) },
          { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, min) }]
        : [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(entree, m) },
          { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, min) }];
      resumeD = { paye: m, payeDevise: 'pair', recoitAuMoins: min, recoitDevise: 'block',
        quote: q, frais: fraisPair, fraisDevise: 'pair', montantSwap: netPair, devise,
        fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null, fraisMarcheBps: hookPaieDeja ? fraisHookBps(cle.hooks) : null };
    } else {
      const fraisVente = (q * bps) / 10000n;
      const min = ((q - fraisVente) * (10000n - tol)) / 10000n;
      actionsD = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(entree, m) },
        ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE_PORTION, params: paramsAction.takePortion(sortie, FEE_WALLET, bps) }] : []),
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, min) }];
      resumeD = { paye: m, payeDevise: 'block', recoitAuMoins: min, recoitDevise: 'pair',
        quote: q, frais: fraisVente, fraisDevise: 'pair', montantSwap: m, devise,
        fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null, fraisMarcheBps: hookPaieDeja ? fraisHookBps(cle.hooks) : null };
    }
    resumeD.impactBps = impact.impactBps; resumeD.sortieAuPrixPool = impact.sortieSpot;
    if (marche.remplaceV1) resumeD.remplaceV1 = true;
    if (migrationEnAttente) resumeD.migrationEnAttente = true;
    const koPair = assertFraisInterfaceA6cf({ compte, bps, resume: resumeD, actions: actionsD, fraisDevisesOk, hookPaie,
      assietteHook: sens === 'ACHAT' ? m : q });
    if (koPair) return refusFraisEchange(koPair, resumeD);
    return finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, actions: actionsD, valeur: valeurD, resume: resumeD,
      cle, zeroForOne: zf, sortieMinTete: 0n, jetonPaye: entree, valeurEth: false });
  }
  const zeroForOne = sens === 'ACHAT'; // ETH est currency0 : acheter = payer currency0

  /* ── quote : le prix REEL, sur le montant qui passe vraiment dans la pool ── */
  const { frais: fraisAchat, net: netAchat } = sens === 'ACHAT' ? fraisSur(m, bps) : { frais: 0n, net: m };
  let quote;
  try {
    const r = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne, montant: netAchat }) }, 'latest']);
    quote = BigInt('0x' + String(r).slice(2, 66));
  } catch (e) {
    /* ⛔⛔ 2026-10-10 (Grok, vente E.T.FFB du hook 7030) : la pool a REPONDU NotEnoughLiquidity (0x7a5ed734, enveloppe dans
     *   UnexpectedRevertBytes) — une pool lancee d un seul cote n a, cote ETH, que ce que les achats y ont mis (~988 E.T.FFB
     *   vendables, bloc ~52 437 600). Rendre NON_MESURE disait « non lu » ; on recote a 1/10, 1/100, 1/1000 : si l un passe,
     *   la pool est trop fine pour CE montant et on le DIT (REFUSE). Si aucun ne passe, NON_MESURE comme avant. */
    const fraction = estRevertDeChaine(e) ? await coteAPlusPetit((mt) => lire('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne, montant: mt }) }, 'latest']), netAchat) : 0;
    if (fraction) return { etat: 'REFUSE', poolTropFine: true, fractionCotee: fraction, pourquoi: 'this pool is too thin for this amount: it quotes 1/' + fraction + ' of it, not all of it — try a much smaller amount' };
    return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
  }
  if (quote <= 0n) return { etat: 'REFUSE', pourquoi: 'the pool returns nothing for this amount' };

  /* ⛔⛔ BUYBACK AUTOMATIQUE (Phil, 2026-09-13 : « si frais alors buyback direct ») : quand le marche TBLOCK/ETH est
   *    LU, le frais n arrive pas en ETH — il RACHETE du TBLOCK dans la meme transaction, livre au wallet de frais.
   *    Sinon (marche TBLOCK absent ou illisible, ou echange de TBLOCK lui-meme), le frais reste en ETH. Le second
   *    swap a sa propre sortie minimale (quote reel) : un rachat qui se ferait voler son prix ne rachete rien. */
  let rachat = null;
  /* ⛔ tip 0036 (Phil : dollars/ETH sur le wallet de frais) : smoke test sur fork 2026-09-17, 3 achats de 0,01 ETH avec le
   *    buyback auto -> 0 wei d ETH au wallet de frais (le frais repartait en TBLOCK). Buyback garde, desactive. */
  if (RACHAT_AUTO && bps > 0n && String(jeton).toLowerCase() !== TBLOCK.toLowerCase()) {
    try {
      const mt = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton: TBLOCK });
      if (mt.etat === 'LUE' && mt.cle && String(mt.cle.currency0).toLowerCase() === ETH) rachat = { cle: mt.cle };
    } catch { rachat = null; }
  }
  const quoteTblock = async (eth) => {
    const r = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle: rachat.cle, zeroForOne: true, montant: eth }) }, 'latest']);
    return BigInt('0x' + String(r).slice(2, 66));
  };

  let actions, valeur, resume;
  if (sens === 'ACHAT' && rachat && fraisAchat > 0n) {
    const min = (quote * (10000n - tol)) / 10000n;
    let minT;
    try { minT = ((await quoteTblock(fraisAchat)) * (10000n - tol)) / 10000n; } catch { minT = null; }
    if (minT !== null && minT > 0n) {
      actions = [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
        /* le credit ETH restant = le frais exact ; OPEN_DELTA le depense en entier */
        { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { cle: rachat.cle, zeroForOne: true, montant: 0n, sortieMin: minT } },
        { code: ACTIONS_V4.TAKE, params: paramsAction.take(TBLOCK, FEE_WALLET, 0n) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }];
      valeur = m;
      resume = { paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'block', quote, frais: fraisAchat, fraisDevise: 'ETH',
        montantSwap: netAchat, rachatAuto: true, tblockRachetesAuMoins: minT };
    }
  }
  if (!actions && sens === 'VENTE' && rachat && bps > 0n) {
    const brutMin = (quote * (10000n - tol)) / 10000n;
    const fraisExact = (brutMin * bps) / 10000n;
    let minT;
    try { minT = fraisExact > 0n ? ((await quoteTblock(fraisExact)) * (10000n - tol)) / 10000n : null; } catch { minT = null; }
    if (minT !== null && minT > 0n) {
      actions = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(jeton, m) },
        { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { cle: rachat.cle, zeroForOne: true, montant: fraisExact, sortieMin: minT } },
        { code: ACTIONS_V4.TAKE, params: paramsAction.take(TBLOCK, FEE_WALLET, 0n) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(ETH, brutMin - fraisExact) }];
      valeur = 0n;
      resume = { paye: m, payeDevise: 'block', recoitAuMoins: brutMin - fraisExact, recoitDevise: 'ETH', quote, frais: fraisExact, fraisDevise: 'ETH',
        montantSwap: m, rachatAuto: true, tblockRachetesAuMoins: minT };
    }
  }
  if (actions) {
    /* le second swap est encode maintenant que la forme de struct sera connue — voir plus bas */
  } else if (sens === 'ACHAT') {
    const min = (quote * (10000n - tol)) / 10000n;
    actions = bps > 0n
      ? [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
        { code: ACTIONS_V4.TAKE, params: paramsAction.take(ETH, FEE_WALLET, fraisAchat) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }]
      : [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(ETH, m) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }];
    valeur = m;
    resume = { paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'block', quote, frais: fraisAchat, fraisDevise: 'ETH', montantSwap: netAchat };
  } else {
    const fraisVente = (quote * bps) / 10000n;
    const min = ((quote - fraisVente) * (10000n - tol)) / 10000n;
    actions = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(jeton, m) },
      ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE_PORTION, params: paramsAction.takePortion(ETH, FEE_WALLET, bps) }] : []),
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(ETH, min) }];
    valeur = 0n;
    resume = { paye: m, payeDevise: 'block', recoitAuMoins: min, recoitDevise: 'ETH', quote, frais: fraisVente, fraisDevise: 'ETH', montantSwap: m };
  }
  resume.fraisBps = bps;
  resume.beneficiaireFrais = bps > 0n ? FEE_WALLET : null;
  resume.fraisMarcheBps = hookPaieDeja ? fraisHookBps(cle.hooks) : null;
  if (marche.remplaceV1) resume.remplaceV1 = true;
  if (migrationEnAttente) resume.migrationEnAttente = true;
  const koFrais = assertFraisInterfaceA6cf({ compte, bps, resume, actions, hookPaie, assietteHook: sens === 'ACHAT' ? m : quote });
  if (koFrais) return refusFraisEchange(koFrais, resume);
  return finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, actions, valeur, resume, cle, zeroForOne, sortieMinTete: 0n });
}

/**
 * Route a deux sauts pour un block dont le marche est TBLOCK/block.
 * tip 20260922-2026: interface fee ALWAYS lands as ETH at FEE_WALLET (never TBLOCK/TBGAS TAKE).
 *  · ACHAT: SETTLE ETH total, TAKE ETH fee, head-swap net ETH→TBLOCK, then TBLOCK→block.
 *  · VENTE: block→TBLOCK→ETH, TAKE_PORTION ETH fee, TAKE_ALL remaining ETH to user.
 */
async function routeViaTblock({ lire, Q, V, marche, jeton, sens, m, tol, bps }) {
  let mt;
  try { mt = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton: TBLOCK }); } catch { mt = { etat: 'NON_LUE' }; }
  if (mt.etat !== 'LUE' || !mt.cle || String(mt.cle.currency0).toLowerCase() !== ETH) {
    return { etat: 'NON_MESURE', pourquoi: 'this block trades against TBLOCK, and the TBLOCK/ETH market could not be read' };
  }
  const cleB = marche.cle, cleT = mt.cle;
  /* ⛔⛔ 2026-10-02 (regle du fondateur) : les DEUX jambes doivent porter un hook — la jambe TBLOCK/ETH comprise. */
  if (indexPoolSansHookInterdite([cleT, cleB], [jeton]) >= 0) return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusSansHook: true };
  /* ⛔ 2026-10-02 : le frais ETH se prend sur la jambe TBLOCK/ETH ; si SON hook verse deja a6cf, rien de plus. */
  const hookPaie = hookPaieJambeTblock(cleT, sens);
  if (hookPaie) bps = 0n;
  const tblockEst0 = String(cleB.currency0).toLowerCase() === TBLOCK.toLowerCase();
  const saut1 = sens === 'ACHAT' ? { cle: cleT, zeroForOne: true } : { cle: cleB, zeroForOne: !tblockEst0 };
  const saut2 = sens === 'ACHAT' ? { cle: cleB, zeroForOne: tblockEst0 } : { cle: cleT, zeroForOne: false };
  const moinsTol = (x) => (x * (10000n - tol)) / 10000n;
  if (sens === 'ACHAT') {
    const { frais, net } = fraisSur(m, bps);
    let t, sortie;
    try {
      t = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut1, montant: net }) }, 'latest'])).slice(2, 66));
      if (t <= 0n) return { etat: 'REFUSE', pourquoi: 'the first pool returns nothing for this amount' };
      sortie = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut2, montant: t }) }, 'latest'])).slice(2, 66));
    } catch (e) {
      return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
    }
    if (sortie <= 0n) return { etat: 'REFUSE', pourquoi: 'the second pool returns nothing for this amount' };
    const min = moinsTol(sortie);
    const actions = [
      { code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
      ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE, params: paramsAction.take(ETH, FEE_WALLET, frais) }] : []),
      { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { ...saut2, montant: 0n, sortieMin: 0n } },
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }];
    const resume = { paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'block',
      quote: sortie, frais, fraisDevise: 'ETH', montantSwap: net, via: 'TBLOCK',
      fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null };
    return { actions, valeur: m, resume, cle: saut1.cle, zeroForOne: saut1.zeroForOne, sortieMinTete: moinsTol(t), bps, hookPaie, assietteHook: m };
  }
  /* VENTE: fee in ETH from the final hop */
  let t, sortie;
  try {
    t = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut1, montant: m }) }, 'latest'])).slice(2, 66));
    if (t <= 0n) return { etat: 'REFUSE', pourquoi: 'the first pool returns nothing for this amount' };
    sortie = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut2, montant: t }) }, 'latest'])).slice(2, 66));
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
  }
  if (sortie <= 0n) return { etat: 'REFUSE', pourquoi: 'the second pool returns nothing for this amount' };
  const fraisVente = (sortie * bps) / 10000n;
  const min = ((sortie - fraisVente) * (10000n - tol)) / 10000n;
  const actions = [
    { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { ...saut2, montant: 0n, sortieMin: 0n } },
    { code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(jeton, m) },
    ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE_PORTION, params: paramsAction.takePortion(ETH, FEE_WALLET, bps) }] : []),
    { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(ETH, min) }];
  const resume = { paye: m, payeDevise: 'block', recoitAuMoins: min, recoitDevise: 'ETH',
    quote: sortie, frais: fraisVente, fraisDevise: 'ETH', montantSwap: m, via: 'TBLOCK',
    fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null };
  return { actions, valeur: 0n, resume, cle: saut1.cle, zeroForOne: saut1.zeroForOne, sortieMinTete: moinsTol(t), bps, hookPaie, assietteHook: sortie };
}

/** Approbations mesurees (vente), forme de struct demandee a la chaine, encodage, simulation de la transaction exacte. */
async function finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, actions, valeur, resume, cle, zeroForOne, sortieMinTete,
  jetonPaye = null, valeurEth = null, simulationDifferee = false }) {
  /* ── les deux autorisations Permit2 sur le jeton PAYE (le block a la vente ; la devise ERC-20 a l achat), MESUREES ── */
  const etapes = [];
  const paye = jetonPaye || (sens === 'VENTE' ? jeton : null);
  if (simulationDifferee) {
    if (!paye) return { etat: 'REFUSE', pourquoi: 'a deferred leg must pay with a token', resume };
    const actionsEncodees = actions.map((x) => (x.params === '__SWAP__' ? { code: x.code, params: paramsSwapExactInSingle({ ...x.swap, forme: SANS_MINHOP }) } : x));
    const hookData = hookDataReferentO1({ cle });
    const data = encodeV4Swap({ cle, zeroForOne, montant: resume.montantSwap, sortieMin: sortieMinTete, deadline, forme: SANS_MINHOP, actions: actionsEncodees, hookData });
    /* 2026-10-11 (decision de Phil : « montant exact partout ») : les deux autorisations au montant de CET echange, 1 h (approbations-exactes.js) */
    const ap = etapesPermit2Exactes({ jeton: paye, permit2: PERMIT2, routeur: R, montant: m, maintenantSec: Math.floor(maintenant / 1000), libelleJeton: 'this token' });
    if (ap.etat !== 'OK') return { etat: 'REFUSE', pourquoi: ap.pourquoi, resume };
    return { etat: 'PRET', nonSimule: true, resume, cle, forme: SANS_MINHOP, pourquoi: null, tx: { to: R, data, value: '0x' + valeur.toString(16) },
      etapes: ap.etapes };
  }
  /* ⛔ audit rails R9 (2026-10-03) : le libelle disait « this block » sur un multi-sauts paye en OUSD. Le jeton
   *    autorise n est le block qu a la VENTE du block lui-meme ; sinon c est la devise payee. */
  const payeEstLeBlock = sens === 'VENTE' && String(paye || '').toLowerCase() === String(jeton || '').toLowerCase();
  if (paye) {
    const jeton = paye; // la suite du bloc lit et autorise CE jeton
    let okP2, okR;
    try {
      /* 2026-10-04 : les deux autorisations (jeton -> Permit2, Permit2 -> routeur) sont deux lectures INDEPENDANTES, lues
       *   ensemble. ⛔ Jamais gardees en memoire : une autorisation change a chaque signature. Une seule illisible = NON_MESURE,
       *   comme avant. */
      const [brutP2, brutR] = await lireEnsemble([
        () => lire('eth_call', [{ to: jeton, data: '0x' + selecteur('allowance(address,address)') + pad(compte) + pad(PERMIT2) }, 'latest']),
        () => lire('eth_call', [{ to: PERMIT2, data: '0x' + selecteur('allowance(address,address,address)') + pad(compte) + pad(jeton) + pad(R) }, 'latest']),
      ]);
      okP2 = BigInt(brutP2) >= m;
      const raw = String(brutR);
      const montantP2 = BigInt('0x' + raw.slice(2, 66));
      const expiration = BigInt('0x' + raw.slice(66, 130));
      okR = montantP2 >= m && expiration > BigInt(Math.floor(maintenant / 1000) + 60);
    } catch (e) {
      return { etat: 'NON_MESURE', pourquoi: 'an approval could not be read', resume };
    }
    /* 2026-10-11 (decision de Phil : « montant exact partout ») : au montant de CET echange, valables 1 h ; plus jamais MAX (approbations-exactes.js) */
    const ap = etapesPermit2Exactes({ jeton, permit2: PERMIT2, routeur: R, montant: m, maintenantSec: Math.floor(maintenant / 1000), okP2, okR,
      libelleJeton: payeEstLeBlock ? 'this block' : 'this token' });
    if (ap.etat !== 'OK') return { etat: 'REFUSE', pourquoi: ap.pourquoi, resume };
    etapes.push(...ap.etapes);
    if (etapes.length) return { etat: 'APPROBATIONS', etapes, resume, cle, pourquoi: null };
  }

  /* ── la chaine dit quelle forme de struct elle accepte, puis on simule la transaction EXACTE ── */
  const appelBrut = (demande) => appelOuErreur(lire, demande);
  const enEth = valeurEth === null ? sens === 'ACHAT' : valeurEth;
  const f = await formeAcceptee({ appelBrut, ur: R, de: compte, cle, zeroForOne, montant: resume.montantSwap, deadline,
    value: enEth ? '0x' + resume.montantSwap.toString(16) : undefined });
  if (f.forme === null) {
    /* ⛔ capture de Phil (Rabby mobile) : « the router refuses this swap: {"avecMinHop":"EVM error: OutOfFunds",…} » — il
     *    voulait acheter 0.001 ETH avec 0.00085 ETH. La cause se dit en clair ; le reste garde le detail technique. */
    const brut = jsonSafe(f.causes);
    /* ⛔ TRANSFER_FROM_FAILED|STF : alignes sur les jumeaux echange-eth.js et echange-v3.js (audit rails R9 :
     *    une vente IB022 sans solde rendait le JSON brut ici, la phrase claire chez eux). */
    const sansFonds = /OutOfFunds|insufficient funds|exceeds balance|TRANSFER_FROM_FAILED|\bSTF\b/i.test(brut);
    return { etat: f.transport ? 'NON_MESURE' : 'REFUSE', resume, cle,
      pourquoi: f.transport ? 'the node refused the check — try again'
        : sansFonds ? 'not enough ' + (enEth ? 'ETH' : 'funds') + ' in your wallet for this amount plus gas — try a smaller amount'
          : 'the router refuses this swap: ' + brut.slice(0, 160) };
  }
  /* ⛔⛔ MESURE SUR FORK (2026-09-13, route via TBLOCK) : la forme sondee sur UN swap ne vaut pas pour les suivants —
   *    « avecMinHop » passait sur ETH -> TBLOCK et revertait SANS DONNEE sur TBLOCK -> block, ou « sansMinHop » passait.
   *    Des qu il y a un second swap, la forme se choisit sur la TRANSACTION EXACTE : la sondee d abord, puis l autre. */
  const construire = (forme) => {
    const actionsEncodees = actions.map((a) => (a.params === '__SWAP__'
      ? { code: a.code, params: paramsSwapExactInSingle({ ...a.swap, forme }) }
      : a));
    /* ⛔ 2026-10-02 : part referrer o1 (0,20 % des 1 % deja payes) -> a6cf. '' tant que le drapeau est OFF. */
    const hookData = hookDataReferentO1({ cle });
    /* ⛔⛔ CORRECTIF ZERO 1 (2026-10-02, KO sur e93e9e2) : le struct du Universal Router de Base est
     *   (key, zeroForOne, amountIn, amountOutMin, bytes hookData). La forme AVEC_MINHOP met un 0 la ou
     *   l UR lit l offset de hookData : hookData est alors lu VIDE, en silence — le referrer o1 ne
     *   recevait rien. Des qu il y a des hookData, la tete est encodee SANS_MINHOP. Sans hookData
     *   (pool hors LaunchHook o1 Standard, ou drapeau OFF), l octet emis est inchange. Teste par test-referent-o1-plan-echange-20261002.mjs. */
    const formeTete = hookData ? SANS_MINHOP : forme;
    const data = encodeV4Swap({ cle, zeroForOne, montant: resume.montantSwap, sortieMin: sortieMinTete, deadline, forme: formeTete, actions: actionsEncodees, hookData });
    return { to: R, data, value: '0x' + valeur.toString(16) };
  };
  const formes = actions.some((a) => a.params === '__SWAP__')
    ? [f.forme, f.forme === AVEC_MINHOP ? SANS_MINHOP : AVEC_MINHOP] : [f.forme];
  let refus = null;
  for (const forme of formes) {
    const tx = construire(forme);
    const sim = await appelOuErreur(lire, { from: compte, ...tx });
    if (!sim.error) return { etat: 'PRET', etapes: [], tx, resume, cle, forme, pourquoi: null };
    refus = sim.error;
  }
  /* 2026-11-08 : une PANNE de noeud (429, debit, delai, reseau) n est pas un refus de la chaine : NON_MESURE, et la relecture peut partir */
  if (estPanneDeNoeud(refus)) return { etat: 'NON_MESURE', resume, cle, pourquoi: 'the transaction could not be simulated right now (node unavailable: ' + refus.message.slice(0, 120) + ') — try again' };
  return { etat: 'REFUSE', resume, cle, pourquoi: 'the chain refuses this exact transaction: ' + refus.message.slice(0, 160) };
}

/**
 * LA MEILLEURE POOL V4 POUR UNE PAIRE, A CE MONTANT — et la DIRECTION qui va avec.
 *
 * @param {function} p.rpc        le lecteur, injecte (donc testable hors reseau)
 * @param {number}   p.chaine
 * @param {string}   p.de         le jeton qu on PAIE
 * @param {string}   p.vers       le jeton qu on VEUT
 * @param {bigint}   p.montant    en unites du jeton paye
 * @param {object[]} [p.candidates]  les combinaisons fee/tickSpacing a essayer
 *
 * ⛔⛔⛔ LA DIRECTION EST DERIVEE DE LA PAIRE, JAMAIS SUPPOSEE. Une PoolKey classe ses deux jetons
 *   par ordre d adresse : `zeroForOne` est donc vrai si et seulement si le jeton PAYE est
 *   `currency0`. Le code d ou vient cette fonction CALCULAIT cette valeur puis passait `true` en
 *   dur — ce qui etait juste uniquement parce que l ETH vaut `0x000...0` et gagne donc toujours le
 *   classement. Une garde correcte par accident d une valeur particuliere. Sur OUSD/USDC, le `true`
 *   en dur serait FAUX dans un sens sur deux, et le swap irait a l envers.
 *
 * ⛔⛔ « ESSAYEES » ET « COTEES » SONT DEUX CHIFFRES DIFFERENTS. Le premier dit combien de
 *   combinaisons on a tapees, le second combien ont REPONDU. Les confondre ferait lire « 4 pools
 *   existent » la ou on a seulement frappe quatre fois dans le vide — la confusion exacte qui a
 *   deja rendu 49,8 % du volume invisible ici.
 * ⛔ UN DEVIS DE ZERO N EST PAS UN DEVIS. Le retenir ferait construire un ordre dont le minimum de
 *   sortie est nul, c est-a-dire un ordre qui accepte de tout perdre. C est le motif
 *   « Number(null) = 0 » qui a deja fait passer un glissement non mesure pour un marche parfait.
 * ⛔ UNE POOL QUI LEVE N ARRETE PAS LE BALAYAGE : l absence d une combinaison ne dit rien des
 *   autres, et s arreter au premier echec rendrait « aucune pool » sur un simple trou.
 *
 * ⚠️ SA BORNE, ECRITE ICI PARCE QU ELLE SE LIT MAL AILLEURS : `CLES_PRIX` ne porte que QUATRE
 *   combinaisons, toutes SANS hook. Une pool hookee, ou a un tickSpacing hors de ces quatre, ne
 *   sera pas trouvee — et ca ne veut pas dire qu elle n existe pas, ca veut dire qu on n a pas
 *   regarde. Le resultat ne doit jamais se lire « il n y a pas de pool ».
 */
/** L echec d une lecture est-il un REFUS DE LA CHAINE (revert) ? Une panne de noeud (429, debit, delai, reseau) n en est PAS un.
 *  ⛔ 2026-10-10 (revue Claude de 63006c0) : la sonde partait sur N IMPORTE QUEL echec ; un 429 sur le montant entier puis un noeud
 *    retabli pour 1/10 faisait dire « this pool is too thin » - accuser le marche pour NOTRE lecture ratee (prouve : REFUSE
 *    poolTropFine sur un 429). Seul un revert ouvre la sonde ; un message qui parle de debit n est jamais un revert. */
export function estRevertDeChaine(e) {
  const msg = String((e && e.message) || e || '');
  /* 2026-10-18 : « 429 » seulement comme NOMBRE isole — il apparaissait dans les octets d un revert (0x82b42900) et le classait en limite de debit */
  return /revert/i.test(msg) && !/rate|limit|\b429\b|too many|timeout|timed out|capacity|unavailable|busy/i.test(msg);
}
/** L echec d une simulation est-il une PANNE DE NOEUD, a dire NON_MESURE ? Seulement si le message parle clairement de transport ET n est
 *  pas un revert. Le reste reste REFUSE : un vrai refus sans le mot « revert » (« insufficient funds for gas ») n est jamais efface.
 *  ⛔ 2026-11-08 (prod game293) : la sonde echange disait « the chain refuses this exact transaction: HTTP 429 ». */
export function estPanneDeNoeud(e) {
  return estErreurTransportRpc(String((e && e.message) || e || ''), e && e.code);
}
/** Une pool qui revert sur m cote-t-elle m/10, m/100 ou m/1000 ? Rend le diviseur qui cote (> 0), sinon 0.
 *  ⛔ Seulement apres un ECHEC (zero lecture de plus sur le chemin heureux) ; au plus 3 lectures, en file, arret au premier. */
export async function coteAPlusPetit(lireQuote, m) {
  return (await sonderFractions(lireQuote, m)).fraction;
}
/** NotEnoughLiquidity(poolId) enveloppe dans UnexpectedRevertBytes, lu dans error.data (puis le message en secours). */
const NEL = /6190b2b0[0-9a-f]{128}7a5ed734/i;
export function estRevertPasAssezDeLiquidite(er) {
  return NEL.test(String((er && er.data) || '') + ' ' + String((er && er.message) || er || ''));
}
/** Le detail des 3 sondes : `fraction` (le diviseur qui cote, 0 sinon), `sondees` (fractions reellement lues : un montant trop petit
 *  n en lit pas 3), `nel` (fractions qui ont reverte NotEnoughLiquidity - pas un 429, pas un delai).
 *  ⛔ 2026-10-11 (revue adverse, 3/3) : le refus « hook » disait « nor 1/10, 1/100 or 1/1000 » alors que ces sondes avalaient TOUT
 *   (429, delai) : une panne de lecture devenait un REFUSE definitif. Il exige desormais sondees === 3 ET nel === 3. */
export async function sonderFractions(lireQuote, m) {
  let sondees = 0, nel = 0;
  for (const d of [10n, 100n, 1000n]) {
    const mt = BigInt(m) / d;
    if (mt <= 0n) break;
    sondees += 1;
    try {
      const r = await lireQuote(mt);
      if (BigInt('0x' + String(r).slice(2, 66)) > 0n) return { fraction: Number(d), sondees, nel };
    } catch (e) { if (estRevertPasAssezDeLiquidite(e)) nel += 1; /* plus petit encore */ }
  }
  return { fraction: 0, sondees, nel };
}

export async function meilleureClePourMontant({ rpc, chaine, de, vers, montant, candidates = CLES_PRIX, detail = false } = {}) {
  const Q = QUOTEUR[Number(chaine)];
  const adr = (x) => String(x || '').toLowerCase();
  const estAdr = (x) => /^0x[0-9a-f]{40}$/.test(adr(x));
  if (!Q) return { etat: 'REFUSE', cle: null, pourquoi: 'no v4 quoter on this network here' };
  if (!estAdr(de) || !estAdr(vers)) {
    return { etat: 'REFUSE', cle: null, pourquoi: 'both tokens must be whole addresses' };
  }
  if (adr(de) === adr(vers)) {
    return { etat: 'REFUSE', cle: null, pourquoi: 'the two tokens are the same' };
  }
  let m;
  try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', cle: null, pourquoi: 'the amount must be above zero' };

  const liste = Array.isArray(candidates) ? candidates : [];
  /* ⛔⛔ 2026-10-04 — LES DEVIS PARTENT ENSEMBLE, LE CHOIX RESTE DANS L ORDRE DE LA LISTE.
   *   MESURE (fork, compter-lectures-plan-20261004.mjs) : les devis de CETTE fonction etaient 4 a 10 des 7 a 24 lectures d un
   *   plan v4 a plusieurs sauts, lus l un APRES l autre alors qu aucun ne depend d un autre (meme paire, meme montant, une cle
   *   chacun). En prod, ou une lecture coute 2 a 4 s, une route a deux sauts mettait 27 a 56 s.
   *   Ils partent donc au plus `LECTURES_EN_VOL_MAX` a la fois, et le resultat est EXACTEMENT celui d avant :
   *     - on juge dans l ORDRE DE LA LISTE, jamais dans l ordre d arrivee : a devis egal le PREMIER candidat gagne (`>` strict) —
   *       sinon le noeud le plus rapide choisirait la pool, et deux plans identiques pourraient en rendre deux ;
   *     - un candidat dont la lecture leve est saute, sans arreter les autres ;
   *     - les cles sont baties AVANT toute lecture, dans l ordre : un candidat mal forme leve comme avant, et sans rien lire.
   *   ⛔ RIEN N EST GARDE EN MEMOIRE : un devis depend du prix et de la liquidite du bloc lu.
   *   ⛔ NON MESURE : le gain en production (noeuds publics a debit limite). Hors reseau, 4 candidats a 40 ms chacun passent de
   *     ~160 ms a ~40 ms (test-lectures-paralleles-20261004.mjs). */
  const essais = liste.map((k) => {
    const cle = cleDePool(adr(de), adr(vers), k);
    return { k, cle, zeroForOne: adr(cle.currency0) === adr(de) };
  });
  const issues = await enVolBorne(essais, async (e) => {
    const r = await rpc('eth_call', [{ to: Q, data: encodeQuote({ cle: e.cle, zeroForOne: e.zeroForOne, montant: m }) }, 'latest']);
    return BigInt('0x' + String(r).slice(2, 66));
  }, LECTURES_EN_VOL_MAX);
  let best = null, cotees = 0;
  /* 2026-10-17 (toutes les pools d un block) : avec `detail`, la liste des candidats NON cotes est RENDUE, pour que l appelant
   *   puisse DIRE quelle pool a ete sautee et pourquoi (jamais devinee). Sans `detail`, la reponse est OCTET POUR OCTET celle d avant
   *   (test-lectures-paralleles-20261004 compare champs ET ordre des champs) ; le choix ci-dessous est inchange dans les deux cas. */
  const nonCotees = [];
  for (const [i, e] of essais.entries()) {
    if (!issues[i].ok) nonCotees.push({ fee: e.k.fee, tickSpacing: e.k.tickSpacing, hooks: e.cle.hooks, raison: String((issues[i].erreur && issues[i].erreur.message) || issues[i].erreur || 'no answer').slice(0, 80) });
    if (!issues[i].ok) continue; /* ⛔ une combinaison absente ne dit rien des autres */
    const quote = issues[i].valeur;
    if (quote <= 0n) { nonCotees.push({ fee: e.k.fee, tickSpacing: e.k.tickSpacing, hooks: e.cle.hooks, raison: 'quoted zero' }); continue; }
    cotees += 1;
    if (!best || quote > best.quote) {
      best = { cle: e.cle, zeroForOne: e.zeroForOne, quote, fee: e.k.fee, tickSpacing: e.k.tickSpacing };
    }
  }
  if (!best) {
    /* ⛔⛔ 2026-10-10 (Grok, vente E.T.FFB) : une pool qui revert a CETTE taille mais cote une fraction n est pas « introuvable »,
     *   elle est trop fine : REFUSE nomme. Sondes en ordre de liste, seulement sur les candidats qui ont LEVE, arret au premier. */
    const sondes = [];
    for (let i = 0; i < essais.length; i += 1) {
      const e = essais[i];
      /* les gabarits de prix (CLES_PRIX, sans hook) ne sont pas sondes : leur absence dit l absence, et le plan « rien » garde ses 4 lectures */
      if (issues[i].ok || CLES_PRIX.includes(e.k) || !estRevertDeChaine(issues[i].erreur)) continue;
      sondes[i] = await sonderFractions((mt) => rpc('eth_call', [{ to: Q, data: encodeQuote({ cle: e.cle, zeroForOne: e.zeroForOne, montant: mt }) }, 'latest']), m);
      const fraction = sondes[i].fraction;
      if (fraction) {
        return { etat: 'REFUSE', poolTropFine: true, fractionCotee: fraction, cle: e.cle, zeroForOne: e.zeroForOne, quote: null,
          essayees: liste.length, cotees,
          pourquoi: 'this pool is too thin for this amount: it quotes 1/' + fraction + ' of it, not all of it — try a much smaller amount' };
      }
    }
    /* ⛔ 2026-10-11 (Grok, achat USDC -> Polytopia, launchpad tiers) : la cle REELLE (lue, hookee) a ete essayee EN PREMIER ; la pool
     *   repond NotEnoughLiquidity (0x7a5ed734 dans UnexpectedRevertBytes) au montant entier ET a 1/10, 1/100, 1/1000 (mesure : liquidite
     *   active 0 ; 13:40, fork + blockscout : le LP a RETIRE la liquidite, PositionManager.modifyLiquidities, et le plan exact via le hook revert V4TooLittleReceived a min 1). Dire « aucune pool parmi les 5 combinaisons » etait faux : la pool existe, c est
     *   elle est vide. REFUSE nomme (hook non verifie : le refus reste), jamais un OK. */
    for (let i = 0; i < essais.length; i += 1) {
      const e = essais[i], h = adr(e.cle.hooks);
      if (issues[i].ok || CLES_PRIX.includes(e.k) || !/^0x[0-9a-f]{40}$/.test(h) || /^0x0{40}$/.test(h)) continue;
      /* 13:10 (Claude, 3 noeuds) : les octets du revert sont dans error.data, PAS dans le message ; data d abord, message en secours */
      if (!estRevertPasAssezDeLiquidite(issues[i].erreur)) continue;
      /* le message dit « nor 1/10, 1/100 or 1/1000 » : il n est dit que si les 3 fractions ont ete LUES et ont reverte NotEnoughLiquidity */
      if (!sondes[i] || sondes[i].sondees !== 3 || sondes[i].nel !== 3) continue;
      return { etat: 'REFUSE', hookSansDevis: true, cle: null, zeroForOne: null, quote: null, essayees: liste.length, cotees,
        pourquoi: 'this block\'s v4 pool (hook ' + h.slice(0, 8) + '...) can\'t fill this amount, nor '
          + '1/10, 1/100 or 1/1000 of it: it has no usable liquidity right now - not tradable here' };
    }
    return { etat: 'NON_MESURE', cle: null, zeroForOne: null, quote: null,
      essayees: liste.length, cotees, ...(detail ? { nonCotees } : {}),
      pourquoi: 'no v4 pool among the ' + liste.length + ' tried combinations quoted this pair at this '
        + 'size — that is what we looked at, not proof that none exists' };
  }
  return { etat: 'OK', ...best, essayees: liste.length, cotees, ...(detail ? { nonCotees } : {}), pourquoi: null };
}

/* ══ 2026-10-17 — TOUTES LES POOLS D UN BLOCK, PAS UNE SEULE ═════════════════════════════════════════════════════════════
 * ⛔⛔ MESURE (dig du 2026-10-17, relu ici) : `/api/cle` de UNIT rend DEUX cles — sa pool ETH sur le hook 7030 et une pool contre
 *   mmETH (0x4fc5…4131) sur un autre hook — et la jambe du block (rails-api `resolveurAvec`, app.html `resoudreA` / `resoudre`)
 *   ne passait au quoter QU UNE cle : celle que `vieDuBlock` avait trouvee la premiere (premiere slot0 non nulle, sans montant).
 *   Une seconde pool de la MEME paire, meilleure a ce montant, n etait jamais cotee.
 * ⇒ `clesDeLaPaire` fait de TOUTES les cles lues du block sur la paire du saut des candidats ; `meilleureClePourBloc` les donne
 *   au comparateur CANONIQUE (`meilleureClePourMontant`, aucun second comparateur) : le meilleur devis a ce montant gagne.
 * ⛔ CE QUI NE CHANGE PAS, et qui est la condition de ce changement :
 *   · la cle deja choisie avant (le marche lu) reste candidate SANS filtre nouveau — l ancien chemin est un sous-cas exact :
 *     si aucune autre pool ne cote mieux, le plan est le meme qu avant ;
 *   · une cle AJOUTEE n entre que si le planificateur l accepterait : pas de piege a frais LP > 10 % (`cleEstUnMarche`), pas de
 *     pool sans hook pour un block TB (`poolSansHookInterdite`), pas de hook tiers pour un block TB (`hookAdmisPourBlock`, avec
 *     TOUTES les cles du block en contexte : un block qui a une pool sur NOTRE hook est TB, et ses pools a hook tiers sont
 *     ecartees — regle du fondateur C2/F1), pas de hook qui preleve en block (`fraisHookEnBlock`) ;
 *   · « une fois par swap » reste juge par `planEchangeMultiSauts` / `planEchange` sur la cle choisie (hook payeur -> routeur 0) ;
 *   · « router vers la pool qui paie » (choix-de-pool.js, MARGE_BPS, decision de Phil 2026-09-30) : si la meilleure pool ne
 *     paie pas a6cf et qu une pool qui paie a ete COTEE, la pool qui paie est prise SEULEMENT si le surcout pour la personne
 *     est <= MARGE_BPS (meme fonction `choisirPool`, meme marge, non recopiee). Au-dela, la meilleure pool.
 *   · une pool qui ne cote pas est SAUTEE et DITE (`nonCotees`, `ecartees`), jamais devinee.
 * ⚠️ BORNE ECRITE : une cle d une AUTRE paire (UNIT/mmETH pour un saut UNIT -> ETH) n est PAS une route vers ETH — elle est
 *   ecartee et nommee. Atteindre ETH par elle exigerait un saut mmETH -> ETH : non construit ici. Et la comparaison est faite sur
 *   les devis BRUTS : le frais routeur (10-20 bps du bareme) d une pool qui ne paie pas n est pas dans son devis. */
const basE = (x) => String(x || '').toLowerCase();
export function clesDeLaPaire({ cles = [], de, vers, cleConnue = null } = {}) {
  const d = basE(de), v = basE(vers);
  const toutes = (Array.isArray(cles) ? cles : []).filter((c) => c && c.currency0 && c.currency1);
  const contexte = cleConnue ? [cleConnue, ...toutes] : toutes;
  const block = !estDeviseConnue(v) ? v : (!estDeviseConnue(d) ? d : null);
  const sens = block === v ? 'ACHAT' : 'VENTE';
  const vues = new Set(), candidats = [], ecartees = [];
  const decrire = (c) => ({ currency0: c.currency0, currency1: c.currency1, fee: Number(c.fee), tickSpacing: Number(c.tickSpacing), hooks: c.hooks || ETH });
  for (const [i, c] of (cleConnue ? [cleConnue, ...toutes] : toutes).entries()) {
    const connue = !!cleConnue && i === 0;
    const c0 = basE(c.currency0), c1 = basE(c.currency1);
    if (!((c0 === d && c1 === v) || (c0 === v && c1 === d))) {
      if (!connue) ecartees.push({ ...decrire(c), pourquoi: 'another pair (' + c0.slice(0, 6) + '…/' + c1.slice(0, 6) + '…): not a pool of this hop' });
      continue;
    }
    let id;
    try { id = poolId(decrire(c)); } catch (_) { ecartees.push({ ...decrire(c), pourquoi: 'malformed key' }); continue; }
    if (vues.has(id)) continue;
    vues.add(id);
    const cle = decrire(c);
    const zf = basE(cle.currency0) === d;
    if (!connue) {
      let refus = null;
      if (!cleEstUnMarche(cle)) refus = 'static LP fee above 10%: a trap, not a market';
      else if (block && poolSansHookInterdite(cle, [block], contexte)) refus = 'no hook on a TokenizedBlock block (founder rule)';
      else if (!hookAdmisPourBlock(cle, contexte)) refus = 'third-party hook on a TokenizedBlock block (founder rule)';
      else if (block && REFUS_FRAIS_HOOK_EN_BLOCK && fraisHookEnBlock(cle, block, sens, zf)) refus = 'its hook would take the fee in the block';
      if (refus) { ecartees.push({ ...cle, pourquoi: refus }); continue; }
    }
    const paie = !!hookPaieEnDeviseVendable({ cle, sens, zeroForOne: zf, jeton: block }).paie;
    candidats.push({ fee: cle.fee, tickSpacing: cle.tickSpacing, hooks: cle.hooks, paie, connue, poolId: id });
  }
  /* la pool qui paie a6cf passe devant : a devis EGAL, `meilleureClePourMontant` garde le PREMIER (`>` strict) */
  candidats.sort((a, b) => Number(b.paie) - Number(a.paie));
  return { candidats, ecartees };
}

/** Le meilleur devis parmi TOUTES les pools du block sur ce saut (+ `autres`, ex. CLES_PRIX, passees telles quelles). */
export async function meilleureClePourBloc({ rpc, chaine, de, vers, montant, cles = [], cleConnue = null, autres = [], margeBps = MARGE_BPS } = {}) {
  const { candidats, ecartees } = clesDeLaPaire({ cles, de, vers, cleConnue });
  const enK = (c) => ({ fee: c.fee, tickSpacing: c.tickSpacing, hooks: c.hooks });
  const r = await meilleureClePourMontant({ rpc, chaine, de, vers, montant, candidates: [...candidats.map(enK), ...(Array.isArray(autres) ? autres : [])], detail: true });
  const pools = { duBloc: candidats.length, ecartees, nonCotees: r.nonCotees || [] };
  const phrase = (choix) => 'pools of this block on this hop: ' + candidats.length + ' tried'
    + (pools.nonCotees.length ? ', ' + pools.nonCotees.length + ' did not quote' : '')
    + (ecartees.length ? ', ' + ecartees.length + ' set aside (' + ecartees.map((e) => e.pourquoi).join('; ') + ')' : '')
    + (choix ? ' — ' + choix : '');
  if (r.etat !== 'OK') return { ...r, pools, pourquoiPools: phrase(null) };
  const meme = (c) => basE(c.hooks) === basE(r.cle.hooks) && Number(c.fee) === Number(r.cle.fee) && Number(c.tickSpacing) === Number(r.cle.tickSpacing);
  const gagnante = candidats.find(meme) || null;
  const payeurs = candidats.filter((c) => c.paie);
  if ((gagnante && gagnante.paie) || !payeurs.length) {
    return { ...r, pools, choixPool: { verdict: gagnante && gagnante.paie ? 'PAYEUSE_MEILLEURE' : 'AUCUNE_PAYEUSE', surcoutBps: 0n }, pourquoiPools: phrase(null) };
  }
  /* la meilleure ne paie pas a6cf, une payeuse existe : son devis, puis la regle de Phil (choisirPool, MARGE_BPS) */
  const rp = await meilleureClePourMontant({ rpc, chaine, de, vers, montant, candidates: payeurs.map(enK) });
  if (rp.etat !== 'OK' || !(rp.quote > 0n)) {
    return { ...r, pools, choixPool: { verdict: 'PAYEUSE_NON_COTEE', surcoutBps: null }, pourquoiPools: phrase('the pool that pays could not be quoted: kept the best pool') };
  }
  /* arrondi AU-DESSUS : un surcout de 10,4 bps ne doit jamais se lire 10 et passer la marge au detriment de la personne */
  const surcout = ((r.quote - rp.quote) * 10000n + r.quote - 1n) / r.quote;
  const ch = choisirPool({ aerodrome: { pool: 'payeuse', glissementBps: surcout }, autre: { pool: 'meilleure', glissementBps: 0n }, margeBps });
  if (ch.verdict === 'AERODROME') {
    return { ...rp, essayees: r.essayees, cotees: r.cotees, pools, choixPool: { verdict: 'PAYEUSE_DANS_LA_MARGE', surcoutBps: surcout },
      pourquoiPools: phrase('the pool that pays costs you ' + surcout + ' bps more, within the ' + margeBps + ' bps margin') };
  }
  return { ...r, pools, choixPool: { verdict: 'MEILLEURE_HORS_MARGE', surcoutBps: surcout },
    pourquoiPools: phrase('the pool that pays would cost you ' + surcout + ' bps more, above the ' + margeBps + ' bps margin: kept the best pool') };
}

/**
 * ETH → USDC on Base v4 — same 0.5% interface fee → FEE_WALLET.
 * ⛔ HARD OBJECTIVE: exit conversion that still pays FEE_WALLET (external DEX pays 0). tip 2220 → smart wallet a6cf….
 * ⛔ Fail-closed: no Sign unless Quoter returns >0 on a measured ETH/USDC key (CLES_PRIX).
 */
export async function planEthVersUsdc({ rpc, chaine, compte, montantWei, toleranceBps = 100n, maintenant = Date.now() }) {
  const R = ROUTEUR[Number(chaine)], Q = QUOTEUR[Number(chaine)], V = V4_ADRESSES[Number(chaine)];
  if (!R || !Q || !V) return { etat: 'REFUSE', pourquoi: 'no Uniswap router on this network here' };
  if (Number(chaine) !== 8453) return { etat: 'REFUSE', pourquoi: 'ETH→USDC exit is Base mainnet only here' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  const m = BigInt(montantWei);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'enter an ETH amount above zero' };
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol >= 10000n) return { etat: 'REFUSE', pourquoi: 'slippage out of range' };
  const lire = rpc;
  const bps = estWalletDeFrais(compte) ? 0n : FRAIS_INTERFACE_BPS;
  const { frais: fraisAchat, net: netAchat } = fraisSur(m, bps);
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);

  /* ⛔⛔ CE BALAYAGE VIT MAINTENANT DANS `meilleureClePourMontant`, et ce n est pas une
   *   reorganisation de confort : la MEME logique est necessaire au rail multi-sauts pour resoudre
   *   la jambe USDC <-> ETH, et en ecrire un second exemplaire ferait DEUX resolveurs qui
   *   divergeraient — le motif « helper canonique et sa copie plus faible », deja paye ici.
   * ⛔⛔⛔ ET L EXTRACTION A SORTI UN DEFAUT DORMANT : ce code CALCULAIT `zeroForOne` puis passait
   *   `true` EN DUR au quoter. La valeur calculee etait jetee. Le `true` n etait juste que parce
   *   que l ETH vaut `0x000...0` et se classe donc TOUJOURS en `currency0` — une garde correcte
   *   PAR ACCIDENT d une valeur particuliere. Inoffensif tant que cette fonction ne servait qu a
   *   l ETH ; faux une fois sur deux des qu on la reutilise sur une paire quelconque, ce qui est
   *   exactement ce qu on fait maintenant. Le helper DERIVE la direction, et son test exige que
   *   les deux sens DIFFERENT. */
  const best = await meilleureClePourMontant({ rpc: lire, chaine, de: ETH, vers: USDC_BASE, montant: netAchat });
  if (best.etat !== 'OK') {
    return { etat: 'NON_MESURE', pourquoi: 'no ETH/USDC v4 pool quoted for this size — try again or a smaller amount' };
  }
  const min = (best.quote * (10000n - tol)) / 10000n;
  if (min <= 0n) return { etat: 'REFUSE', pourquoi: 'the pool returns nothing for this amount' };

  const actions = bps > 0n
    ? [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
      { code: ACTIONS_V4.TAKE, params: paramsAction.take(ETH, FEE_WALLET, fraisAchat) },
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(USDC_BASE, min) }]
    : [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(ETH, m) },
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(USDC_BASE, min) }];
  const resume = {
    paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'USDC', quote: best.quote,
    frais: fraisAchat, fraisDevise: 'ETH', montantSwap: netAchat,
    fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null,
    via: 'ETH/USDC · fee ' + best.fee, usdcExit: true,
  };
  const koFrais = assertFraisInterfaceA6cf({ compte, bps, resume, actions });
  if (koFrais) return refusFraisEchange(koFrais, resume);
  return finaliser({
    lire, R, compte, jeton: USDC_BASE, sens: 'ACHAT', m, maintenant, deadline,
    /* ⛔ `best.zeroForOne` ET PLUS `true` EN DUR : la valeur est DERIVEE de la paire. Elle vaut
     *   `true` ici — l ETH est `0x0`, donc toujours `currency0` — donc le comportement est
     *   IDENTIQUE. C est voulu : une extraction qui change le resultat n est pas une extraction,
     *   c est un changement deguise en refactor. Ce qui change, c est qu elle cesse d etre juste
     *   par accident. */
    actions, valeur: m, resume, cle: best.cle, zeroForOne: best.zeroForOne, sortieMinTete: 0n,
  });
}

/**
 * UNE ROUTE V4 DE 2 A 4 SAUTS, EN UNE TRANSACTION — pour atteindre ce qu un seul saut n atteint pas.
 *
 * ⭐ LE CAS QUI L A FAIT NAITRE, prouve par un devis REEL le 2026-10-01 :
 *       100 OUSD -> 99,987552 USDC -> 328 166 unites NVDAc
 *   Deux sauts, Uniswap V4, fee 100 / ts 1. Une seule factory, donc UN appel.
 *   ⛔ ET LA BORNE : 1 action sur 15 est atteignable ainsi (`USDC/<action>` en V4 = 1/15,
 *     `ETH/<action>` = 0/15). Les 14 autres sont sur Aerodrome, ou OUSD n a RIEN — il faudrait un
 *     lot atomique de DEUX routeurs, qu une part IMPORTANTE des wallets ne tient pas (le chiffre exact n est PAS etabli : voir la borne dans frais-hors-routeur.js).
 *
 * ⛔⛔ POINT D ENTREE SEPARE, DELIBEREMENT. `planEchange` fonctionne et porte de l argent : on
 *   AJOUTE un chemin, on ne modifie pas celui qui marche. Une regression sur `planEchange` coute
 *   tous les echanges ; un bug ici ne coute que ce chemin-ci, et il refuse plutot que de construire.
 *
 * ⛔ LES SAUTS ARRIVENT DEJA RESOLUS (`{ cle, zeroForOne }`), et c est voulu : la DECOUVERTE des
 *   pools est un autre probleme — une cle devinee ne trouve pas une pool hookee, et j ai deja paye
 *   cette cecite deux fois aujourd hui. L appelant les lit ; cette fonction les cote et construit.
 */
export async function planEchangeMultiSauts({ rpc, chaine, compte, sauts, entree, sortie, montant,
  toleranceBps = 100n, maintenant = Date.now(), fraisDevisesOk = null,
  /* ⛔ 2026-10-02 (Phil : UN frais par swap) : seul `planFranchissement` le pose — le frais unique du lot est pris
   *   sur la jambe CL. Sans hook payeur, le routeur ne prend alors RIEN ici (et aucun TAKE vers a6cf n est admis). */
  fraisRouteurAilleurs = false,
  /* 2026-10-10 (P4, NVDAc paie un block v4) : la jambe v4 d un LOT ATOMIQUE dont la jambe precedente (Aerodrome) livre l USDC
   *   payee ici. Le compte ne l a pas encore : ni les autorisations ni la transaction ne se lisent/simulent maintenant. Les deux
   *   autorisations Permit2 sont mises au lot, la forme est SANS_MINHOP (celle de l UR de Base), et le plan le DIT
   *   (`nonSimule`). Defaut false : tout appelant d avant est inchange. */
  simulationDifferee = false,
  /* ⛔ LES DECIMALES ET LE PRIX DE LA DEVISE D ENTREE SONT LUS PAR L APPELANT, pas supposes ici :
   *   ils servent a situer le montant dans le bareme degressif. 18 par defaut serait un pari — et
   *   OUSD en a SIX. Sans PRIX, le bareme applique le taux le plus haut et le dit. */
  decimalesEntree = 18, prixUsdEntree = null,
  /* injectable pour les tests (redeploiement V8-open) ; defaut = la liste unique de tokenomics.js */
  hooksPaieurs = HOOKS_PAIENT_DEJA_A6CF, marcheOuvert = undefined }) {
  const R = ROUTEUR[Number(chaine)], Q = QUOTEUR[Number(chaine)];
  if (!R || !Q) return { etat: 'REFUSE', pourquoi: 'no Uniswap router on this network here' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) {
    return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  }
  if (!Array.isArray(sauts) || sauts.length < SAUTS_MIN || sauts.length > SAUTS_MAX) {
    return { etat: 'REFUSE',
      pourquoi: 'between ' + SAUTS_MIN + ' and ' + SAUTS_MAX + ' resolved hops are required' };
  }
  const m = BigInt(montant);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'enter an amount above zero' };
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol >= 10000n) return { etat: 'REFUSE', pourquoi: 'slippage out of range' };
  const lire = rpc;
  /* ⛔⛔ CE RAIL PREND 0,1 % PAR TRANSACTION, pas les 0,5 % du chemin in-app historique — decision
   *   de Phil (2026-10-01), et le taux est LU dans `pont-de-liquidite.js` au lieu d etre tape ici.
   *   ⛔ ET C EST PROPORTIONNEL, PAS FIXE : 0,1 % de 100 OUSD fait 0,1 OUSD, de 10 000 OUSD fait
   *     10 OUSD. Un frais FIXE serait confiscatoire en bas (5 % sur un echange de 10) et
   *     negligeable en haut — c est la confusion que le test de 100 OUSD avait rendue possible,
   *     puisque 0,1 % de 100 vaut justement 0,1.
   *   ⛔ LE CHEMIN HISTORIQUE N EST PAS TOUCHE : `planEchange` garde ses 0,5 %. Deux rails, deux
   *     taux, et c est explicite — baisser le chemin existant aurait coupe un revenu qui existe. */
  if (!ROUTE_VIA_TBLOCK && sauts.some((x) => x && cleTouchTblock(x.cle))) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusTblock: true };
  }
  /* ⛔⛔ 2026-10-02 (Phil 22:19, item e) : une jambe V1 (HOOK_PREVU) d une route est RAMENEE sur la pool de version
   *   actuelle du meme couple (poolActuelleDuBlock : meme paire, donc meme zeroForOne). Sans elle, la jambe est REFUSEE
   *   dans les deux sens — la vente V1 reste ouverte en echange simple (planEchange, migrationEnAttente). */
  if (sauts.some((x) => x && x.cle && String(x.cle.hooks || '').toLowerCase() === HOOK_PREVU.toLowerCase())) {
    const V4a = V4_ADRESSES[Number(chaine)];
    const neufs = [];
    for (const x of sauts) {
      if (!(x && x.cle && String(x.cle.hooks || '').toLowerCase() === HOOK_PREVU.toLowerCase())) { neufs.push(x); continue; }
      const a = V4a ? await poolActuelleDuBlock({ rpc: lire, stateView: V4a.stateView, cle: x.cle }) : { cle: null, ratees: 1 };
      if (a.cle) { neufs.push({ ...x, cle: a.cle }); continue; }
      if (a.ratees > 0) return { etat: 'NON_MESURE', pourquoi: 'its market could not be read' };
      return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusV1Route: true };
    }
    sauts = neufs;
  }
  /* ⛔⛔ 2026-10-02 (regle du fondateur) : aucun saut sur une pool sans hook qui contient un block TB, et aucun frais de
   *   hook verse EN BLOCK. Les jambes entre devises (ETH/USDC…) restent permises.
   *   ⛔ R4 (fix bloc au milieu) : les blocks se lisent sur TOUS les sauts — (currency0, currency1) de chaque cle —, pas
   *   sur [entree, sortie]. ETH -> (sans hook) -> block -> (V8, block = currency0) -> NVDAc passait les deux gardes :
   *   signable, deux frais dont un en block. Block = ni devise connue (ETH, USDC, OUSD, actions…), ni devise dont
   *   l appelant a lu le prix (`fraisDevisesOk`) — un B20 non connu reste un block meme prixe (`estBlockDeRoute`).
   *   Fail-closed, saut par saut, cote block par cote block. */
  const blocsRoute = [...new Set(sauts.flatMap((x) => (x && x.cle ? [x.cle.currency0, x.cle.currency1] : []))
    .map((a) => String(a || '').toLowerCase()))]
    .filter((a) => estBlockDeRoute(a, fraisDevisesOk, sauts.map((x) => x && x.cle)));
  for (const x of sauts) {
    if (!(x && x.cle)) continue;
    for (const b of [x.cle.currency0, x.cle.currency1].map((a) => String(a || '').toLowerCase())) {
      if (!blocsRoute.includes(b)) continue;
      /* format OpenLaunch (frais 3 %, espacement 200) : seule exception de la regle (pool-sans-hook.js) */
      if (cleSansHook(x.cle) && !formatOpenLaunch(x.cle)) return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusSansHook: true };
      if (REFUS_FRAIS_HOOK_EN_BLOCK && fraisHookEnBlock(x.cle, b, sensRelatifAuBlock(x), !!x.zeroForOne)) {
        return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusFraisEnBlock: true };
      }
    }
  }
  if (indexPoolSansHookInterdite(sauts.map((x) => x && x.cle), blocsRoute) >= 0) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusSansHook: true };
  }
  /* ⛔⛔ 2026-10-02 (Zero 1, RESULT-once-per-swap-6fc35ab : R4a-g, R5a/R5c KO sur fork) — AU PLUS UN FRAIS VERS a6cf.
   *   L app ne pilote que le routeur ; chaque jambe hookee preleve SON frais sur la chaine. Fail-closed :
   *   (1) un block qui n est ni l entree ni la sortie (block INTERMEDIAIRE) -> refus ;
   *   (2) deux jambes hookees ou plus -> refus (sinon deux frais de hook, ou plus, pour un seul echange). */
  const bouts = new Set([String(entree || '').toLowerCase(), String(sortie || '').toLowerCase()]);
  if (blocsRoute.some((b) => !bouts.has(b))) return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusBlocIntermediaire: true };
  /* ⛔⛔ 2026-10-03 (Phil) : (2) devient — 2 jambes hookees admises SEULEMENT pour block A -> ... -> block B, chaque
   *   jambe etant le marche de SON block (pool-sans-hook.js `hooksDeRoute`, regle unique avec sauts-depuis-chemin.js). */
  const regleHooks = hooksDeRoute({ sauts, entree, sortie, estBlock: (a) => blocsRoute.includes(String(a || '').toLowerCase()) });
  if (!regleHooks.ok) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusPlusieursHooks: true };
  }
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);
  /* ⛔⛔ LE BAREME EST DEGRESSIF : 0,2 % jusqu a 100 $, 0,1 % au-dela — decision de Phil
   *   (2026-10-01), dans sa derniere formulation : « fait comme il a de mieux pour peu taxer donc
   *   le 0.1 % 0.2 % et ca soit rentable pour dev ».
   *   ⛔ CE COMMENTAIRE ANNONCAIT ENCORE « PLANCHER 50 bps » ET UN PALIER A 1 700 $, ecrits quand
   *     Phil avait dit « mini 50 bps » — une version du bareme que le code a quittee. Le seul
   *     palier reel est 100 $. Un commentaire qui survit a la decision qu il decrit est pire
   *     qu aucun commentaire : c est lui qu on croit en relisant.
   *   ⛔ ET LE PALIER VIENT DE LA DISTRIBUTION MESUREE, pas d un nombre rond : p75 = 95,94 $ sur
   *     les 250 lignes servies le 2026-10-01. Les trois quarts des echanges paient donc 0,2 %.
   *   ⛔ SANS PRIX LU POUR LA DEVISE D ENTREE, `frais-degressif.js` applique le taux LE PLUS HAUT et
   *     le DIT : le doute nous coute un revenu potentiel sur les gros montants, jamais une surprise
   *     a l utilisateur, et jamais une sous-facturation sur une supposition.
   *   ⛔ ET LE MONTANT EXACT EST IMPOSE A L ASSEMBLEUR, pas recalcule : le plancher fait que le
   *     frais ne vaut PAS `montant * bps / 10000`, et recalculer donnerait deux chiffres pour le
   *     meme prelevement — celui annonce et celui preleve. */
  let frais = 0n, bps = 0n, degressif = null;
  /* ⛔ garde a l execution (Zero 1, patch runtime-guard-empty-v8open) : drapeau marche ouvert ON + liste V8-open vide
   *   -> toute jambe sur un hook inclassable est refusee avant toute lecture. */
  /* ⛔ R8 (C2, R5-2) : seuls NOS hooks et HOOKS_PAIENT_DEJA_A6CF restent dans la liste de l appelant. */
  hooksPaieurs = filtrerHooksPayeurs(hooksPaieurs);
  const refusMO = refusMarcheOuvertIncoherent(sauts, { ...(marcheOuvert || {}), liste: hooksPaieurs });
  if (refusMO) return { etat: 'REFUSE', pourquoi: refusMO };
  /* ⛔⛔ 2026-10-02 (C2, F1) : meme regle saut par saut (apres les regles R4 et la garde marche ouvert, qui restent seules juges de leurs cas) — un block sur une pool a hook tiers -> refus avant la cotation. */
  /*   Un hook que l appelant passe comme PAYEUR (`hooksPaieurs`, ex. un V8-open liste) est un hook TB : admis. */
  const listePayeurs = new Set((Array.isArray(hooksPaieurs) ? hooksPaieurs : []).map((e) => String((e && e.hook) || e || '').toLowerCase()));
  if (sauts.some((x) => x && x.cle && !cleSansHook(x.cle) && !hookAdmisPourBlock(x.cle, sauts.map((y) => y && y.cle)) && !listePayeurs.has(String(x.cle.hooks || '').toLowerCase()))) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusBlocSansHookTb: true, refusHookTiers: true };
  }
  /* ⛔⛔⛔ UNE FOIS PAR SWAP — DECISION DE RAKSHA, 2026-10-02 (et deja ecrite « definitive » le 2026-10-01
   *      23:25 dans multipool.js : « 0,09 % NET vers a6cf, pris EXACTEMENT UNE FOIS par swap »).
   *      La version precedente (14:49) faisait « une fois par JAMBE » : le routeur ne s effacait que si
   *      TOUS les sauts payaient deja a6cf. Sur une route block -> ETH -> action dont UNE jambe passe par
   *      un hook payeur, a6cf etait donc payee DEUX fois pour un seul swap — le hook sur sa jambe, le
   *      routeur sur l entree. C etait un choix raisonne, pas un accident ; il a ete tranche dans
   *      l autre sens par le proprietaire.
   *   ⇒ DES QU UNE JAMBE PAIE DEJA a6cf, DANS UNE DEVISE VENDABLE, LE ROUTEUR NE PREND RIEN.
   *   ⛔ ET L ASSIETTE DE LA GARDE ANTI-POUSSIERE SUIT LA JAMBE QUI PAIE. Avant, elle etait calculee
   *     sur le saut 1 (`hookS1`) : correct tant que seul le saut 1 pouvait dispenser le routeur. Avec
   *     « n importe quelle jambe », garder le saut 1 ferait verifier la poussiere sur un montant qui
   *     n est pas celui que le hook preleve. On prend la PREMIERE jambe payeuse, et son assiette est le
   *     montant qui ENTRE dans ce saut si le hook preleve dans la devise d entree, sinon ce qui en
   *     SORT — exactement la regle de l ancienne ligne, generalisee du saut 1 au saut i. */
  /* ⛔⛔ 2026-10-02 (matrice test-matrice-une-fois-par-swap, 12 cas) : le court-circuit V8 de
   *   hookPaieEnDeviseVendable compte comme « payee » une jambe V8 dont le block est currency0 — son hook verse
   *   a6cf EN BLOCK. Le garde « frais en block » plus haut ne voit que l ENTREE et la SORTIE : avec un block AU
   *   MILIEU (X -> block -> Y), le routeur s effacait et a6cf ne recevait que du block. Ici, un frais de hook ne
   *   compte que s il est verse dans une devise CONNUE ou prixee — sinon le routeur garde le sien. */
  const parJambe = sauts.map((x) => {
    if (!(x && x.cle)) return { paie: false, devise: null };
    /* ⛔ 2026-10-02 (matrice, 16 doubles frais V2/PREVU) : le SENS est relatif au BLOCK — ACHAT = le block sort
     *   de la jambe. « zeroForOne = ACHAT » n est vrai que si la devise est currency0 ; block en currency0, il
     *   s inverse, et un hook qui ne paie qu a la VENTE etait lu comme non payeur (routeur + hook = double frais).
     *   Le block = le cote qui n est pas une devise connue ; deux devises connues ou deux blocks : convention. */
    const r = hookPaieEnDeviseVendable({ cle: x.cle, sens: sensRelatifAuBlock(x),
      zeroForOne: !!x.zeroForOne, fraisDevisesOk, liste: hooksPaieurs });
    const vendable = !!r.devise && (estDeviseConnue(r.devise) || (fraisDevisesOk instanceof Set && fraisDevisesOk.has(r.devise)));
    return r.paie && !vendable ? { paie: false, devise: r.devise } : r;
  });
  const iPayeuse = parJambe.findIndex((r) => r.paie);
  const hookPaie = iPayeuse >= 0;
  /* ⛔ 2026-10-03 : block -> block — les DEUX jambes hookees doivent payer a6cf dans une devise vendable. Sinon une jambe
   *   preleverait un frais que a6cf ne recoit pas (ou en block), et le routeur, efface par l autre, ne le rattraperait pas. */
  const jambesPayantes = regleHooks.blocAbloc ? regleHooks.jambesHook : (hookPaie ? [iPayeuse] : []);
  if (regleHooks.blocAbloc && !regleHooks.jambesHook.every((i) => parJambe[i] && parJambe[i].paie)) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusPlusieursHooks: true,
      causeInterne: 'block-to-block: a hooked leg does not pay the fee wallet in a sellable currency' };
  }
  if (!estWalletDeFrais(compte) && !hookPaie && !fraisRouteurAilleurs) {
    degressif = fraisPourMontant({ montant: m, decimales: decimalesEntree, prixUsd: prixUsdEntree });
    if (degressif.etat !== 'OK') {
      return { etat: 'REFUSE', pourquoi: 'fee could not be priced: ' + (degressif.pourquoi || 'unknown') };
    }
    frais = degressif.frais;
    /* ⛔ LE TAUX QU ON DECLARE EST L EFFECTIF, celui qu on prend REELLEMENT — plancher compris. Le
     *   taux du palier serait faux des que le plancher joue, et le garde `assertFraisInterfaceA6cf`
     *   verifie justement la coherence entre ce taux et le TAKE. */
    bps = BigInt(degressif.bpsEffectif === null ? degressif.bps : degressif.bpsEffectif);
  }
  const net = m - frais;
  const moinsTol = (x) => (x * (10000n - tol)) / 10000n;

  /* ── LE DEVIS, SAUT PAR SAUT : la sortie de l un est l entree du suivant ────────────────────
   * ⛔⛔ UNE LECTURE RATEE N EST PAS UN PRIX NUL. Une limite de debit qui rendrait 0 ferait croire
   *   a une pool vide, et on refuserait une route vivante — ou pire, on construirait sur un
   *   minimum faux. On distingue donc NON_MESURE de REFUSE, et on NOMME le saut.
   * ⛔ ET LE PREMIER SAUT PART DU NET : le frais est retenu AVANT, donc le coter sur le total
   *   promettrait plus que ce qui sera reellement echange. */
  const sorties = [];
  let courant = net;
  for (const [i, s] of sauts.entries()) {
    let brut;
    try {
      brut = await lire('eth_call', [{ to: Q, data: encodeQuote({ ...s, montant: courant }) }, 'latest']);
    } catch (e) {
      return { etat: 'NON_MESURE',
        pourquoi: 'hop ' + (i + 1) + ' could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
    }
    /* ⛔ 2026-11-08 : une reponse VIDE (« 0x ») ou tronquee n est pas un prix nul : c est une lecture RATEE (un noeud public sous charge
     *   rend « 0x »). Avant, l echec du decodage valait 0 et la route vivante etait REFUSEE « returns nothing ». Seul un zero DECODE refuse. */
    if (!/^0x[0-9a-fA-F]{64}/.test(String(brut))) {
      return { etat: 'NON_MESURE', pourquoi: 'hop ' + (i + 1) + ' could not be quoted: empty answer from the node' };
    }
    const out = BigInt('0x' + String(brut).slice(2, 66));
    if (out <= 0n) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + (i + 1) + ' returns nothing for this amount' };
    }
    sorties.push(out);
    courant = out;
  }
  const sortieFinale = sorties[sorties.length - 1];
  const minFinal = moinsTol(sortieFinale);
  /* ⛔ UN MINIMUM QUI TOMBE A ZERO N EST PAS UN MINIMUM : il laisserait passer n importe quelle
   *   sortie. Ca arrive sur de tres petits montants, et c est un refus, pas un detail. */
  if (minFinal <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'the amount is too small for a meaningful minimum on the output' };
  }

  /* ⛔ LE MONTANT EXACT EST IMPOSE, PAS RECALCULE : le plancher monotone du bareme fait que le frais
   *   ne vaut PAS `montant * bps / 10000`. Le recalculer donnerait deux chiffres pour le meme
   *   prelevement — celui annonce a l ecran et celui reellement pris. */
  const route = actionsMultiSauts({ sauts, entree, sortie, montant: m, minSortie: minFinal, bps,
    fraisImpose: frais,
    beneficiaireFrais: frais > 0n ? FEE_WALLET : null, actionsV4: ACTIONS_V4, paramsAction });
  /* ⛔ `routePrete` suppose un TAKE de frais ou un 2e saut (>= 3 actions). Sous `fraisRouteurAilleurs`, un saut unique sans
   *   frais routeur fait SETTLE + TAKE_ALL (la tete est encodee a part) : forme exacte exigee, rien de plus. */
  const formeSansTake = fraisRouteurAilleurs && !!route && route.etat === 'OK' && route.frais === 0n
    && Array.isArray(route.actions) && route.actions.length === sauts.length + 1;
  if (!routePrete(route) && !formeSansTake) {
    return { etat: 'REFUSE', pourquoi: route.pourquoi || 'this route could not be assembled' };
  }
  const enEth = route.fraisDevise === 'ETH';
  const resume = {
    paye: m, payeDevise: enEth ? 'ETH' : 'token',
    recoitAuMoins: minFinal, recoitDevise: 'token',
    quote: sortieFinale, montantSwap: route.montantTete,
    frais, fraisDevise: route.fraisDevise, devise: route.devise,
    via: 'V4_' + sauts.length + '_SAUTS', sauts: sauts.length,
    fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null,
    /* ⛔ 2026-10-03 : ce que les HOOKS prennent sur la chaine (le routeur, lui, est dans fraisBps). Somme des taux par marche
     *   de block traverse (tokenomics.fraisHookBps) : ~1 % pour deux V8 ; le compose reel est a peine plus bas. */
    /* (champs poses SEULEMENT quand un hook paie : une route a frais routeur reste octet pour octet celle d avant — test-r6 T3) */
    ...(hookPaie ? { fraisMarcheBps: jambesPayantes.reduce((t, i) => t + fraisHookBps(sauts[i].cle.hooks), 0),
      jambesHook: jambesPayantes.length, blocAbloc: regleHooks.blocAbloc } : {}),
  };
  /* ⛔⛔ LE VERROU DE LA DEVISE DE FRAIS EST CELUI D ICI, PAS UNE SECONDE REGLE. `route-v4-multi-sauts`
   *   NOMME la devise, il ne la juge pas : `assertFraisInterfaceA6cf` decide, et il n admet ETH,
   *   USDC, ou une devise dont L APPELANT A LU LE PRIX. a6cf a deja ete paye en jetons invendables
   *   (7 detentions, part reelle 0 $) — c est ce verrou qui l empeche de recommencer. */
  /* ⛔ `bpsAttendu` EST LE TAUX EFFECTIF DE CE RAIL, pas les 50 bps du chemin historique. Le garde
   *   verifie donc exactement ce qu on a declare — beneficiaire, devise vendable et presence d un
   *   TAKE vers a6cf restent inchanges. Le defaut du parametre reste le plus strict. */
  /* l assiette du hook sur la PREMIERE jambe payeuse : ce qui ENTRE dans ce saut si le hook preleve
   *   dans la devise d entree du saut, sinon ce qui en SORT.
   *   · saut 0 : comparaison a `entree`, A L IDENTIQUE de la regle precedente — aucun changement de
   *     comportement la ou l ancienne regle s appliquait deja ; il entre `m` (routeur a 0, net = m).
   *   · saut i > 0 : la devise d entree se lit sur la cle et le sens du saut ; il entre la sortie i-1. */
  const assietteDe = (i) => {
    const s = sauts[i];
    const devEntree = i === 0
      ? String(entree).toLowerCase()
      : String(s.zeroForOne ? s.cle.currency0 : s.cle.currency1).toLowerCase();
    const montantEntree = i === 0 ? m : sorties[i - 1];
    return parJambe[i].devise === devEntree ? montantEntree : sorties[i];
  };
  /* ⛔ 2026-10-03 : block -> block, la garde anti-poussiere porte sur CHAQUE jambe payante. Le seuil est le meme pour
   *   toutes (assiette * 50 / 10000 > 0, en unites brutes) : la PLUS PETITE assiette les verifie toutes. */
  let assietteHook = null;
  if (hookPaie) {
    assietteHook = jambesPayantes.map(assietteDe).reduce((a, b) => (b < a ? b : a));
  }
  const koFrais = fraisRouteurAilleurs && !hookPaie && !estWalletDeFrais(compte)
    ? (bps !== 0n || frais !== 0n || jsonSafe(route.actions || []).toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase())
      ? 'double fee: a router fee on a leg whose batch pays its single fee elsewhere' : null)
    : assertFraisInterfaceA6cf({ compte, bps, resume, actions: route.actions,
      fraisDevisesOk, bpsAttendu: bps, hookPaie, assietteHook });
  /* ⛔ 2026-10-02 (Zero 1) : le texte montre est « Not tradable here yet », jamais le jargon du verrou ;
   *   la raison exacte reste dans `causeInterne` (diagnostic, tests), elle n est pas affichee. */
  if (koFrais && /^fee amount is zero\b/.test(koFrais)) return refusFraisEchange(koFrais, resume);
  if (koFrais) return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusCheminFrais: true, causeInterne: 'fee path broken: ' + koFrais, resume };

  /* ⛔ `sortieMinTete` BORNE LE PREMIER SAUT, et seulement lui : les suivants sont a 0 (OPEN_DELTA),
   *   et le minimum qui protege l acheteur est celui du TAKE_ALL final, deja dans les actions. */
  return finaliser({
    lire, R, compte, jeton: sortie, sens: 'ACHAT', m, maintenant, deadline,
    actions: route.actions, valeur: route.valeur, resume,
    cle: route.cle, zeroForOne: route.zeroForOne, sortieMinTete: moinsTol(sorties[0]),
    /* ⛔ LE JETON PAYE DECLENCHE LES AUTORISATIONS PERMIT2. Nul quand on paie en ETH natif : il n y
     *   a rien a autoriser, et en demander une bloquerait l achat sur une etape inutile. */
    jetonPaye: enEth ? null : entree,
    valeurEth: enEth,
    simulationDifferee,
  });
}

