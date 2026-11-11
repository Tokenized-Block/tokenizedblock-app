// lancer-pool-v2.js — le marche d un block contre TBLOCK, avec le hook de frais (tokenomics v2).
// ================================================================================================
// ⛔⛔ GARDE CODE LU : absent / non lu = pas de plan V2. TbFeeHook LIVE Base 2026-09-15 (HOOK_PREVU).
// ⛔ LE MEME PLAN QUE LE MARCHE ETH (`planLancement`), paire = TBLOCK et hooks = le hook : Permit2, marge,
//    proprietaire 0x…dEaD, frais LP 0 — rien n est recopie. Seules s ajoutent la garde du hook et l inscription.
// ✅ App ETH Launch (2026-09-15 P0) also attaches HOOK_PREVU via `completerInscriptionHook` when DEPLOYE.
// ⛔ SMART WALLET : dans le multicall du PositionManager, le hook voit le PositionManager comme `sender` et le
//    bundler comme `tx.origin` — ni l un ni l autre n est l admin du block. Un compte qui a du code doit donc
//    s INSCRIRE d abord (`inscrire(key, sqrtPrice)`), au MEME prix que l initialisation (le hook l exige).
import { planLancement } from './lancer-pool.js';
import { TBLOCK_TEST_ANCIEN as TBLOCK, HOOK_PREVU, HOOK_V2, hookDeploye, estHook7030 } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */
import { encodeInitializePool, selecteur, poolId } from './pool.js';

export const ETATS_V2 = ['HOOK_ABSENT', 'PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE'];
export const FRAIS_V2 = { hookPourMillion: 30000, buyback: '2 %', createur: '1 %', lp: '0 %' };

/** `inscrire((address,address,uint24,int24,address),uint160)` : meme disposition d arguments qu initializePool. */
export function encodeInscrire(cle, sqrtPriceX96) {
  return '0x' + selecteur('inscrire((address,address,uint24,int24,address),uint160)')
    + encodeInitializePool(cle, sqrtPriceX96).slice(10);
}

/** 2026-10-02 — hook 7030 : `inscrireAvecCaution(key, sqrtPriceX96, uint128 minimum)` (cast sig = 0xfde76f6a).
 *  Meme disposition qu inscrire + le minimum de caution du createur, en unites brutes de la devise appariee. */
export const SIG_INSCRIRE_CAUTION = 'inscrireAvecCaution((address,address,uint24,int24,address),uint160,uint128)';
/* ⛔⛔ 2026-10-03 — LA SURCHARGE A 4 ARGUMENTS, CELLE QUI PORTE LE SEL DE createPaid. Lu dans la source du hook deploye
 *   (TBlockLaunchLockHook._du) et sur la chaine (0x32F3…64cc : fraisVie = 3e14, fraisCreation = 7e14, createRouter = notre
 *   CreateRouter, les deux selecteurs presents dans le bytecode) : SANS preuve, la premiere inscription doit
 *   fraisVie + fraisCreation = 0,001 ETH ; AVEC un sel qui redonne l adresse du block (neDuRouteur), fraisVie seul = 0,0003.
 *   L app n encodait que la surcharge a 3 arguments : apres createPaid (0,0007) l Instant Birth envoyait 0,0003 et le hook
 *   repondait MontantInsuffisant — AUCUN Create ne pouvait naitre sur le 7030 (drapeau allume en 3c89dba sans naissance reelle :
 *   les bancs d alors simulaient le hook). Un sel FAUX reverte PasNeDuRouteur : il n est passe que PROUVE par le hook. */
export const SIG_INSCRIRE_CAUTION_SEL = 'inscrireAvecCaution((address,address,uint24,int24,address),uint160,uint128,bytes32)';
const SEL_32 = /^0x[0-9a-fA-F]{64}$/;
export function encodeInscrireAvecCaution(cle, sqrtPriceX96, minimum, sel = null) {
  const m = BigInt(minimum);
  if (m <= 0n || m >= (1n << 128n)) throw new Error('caution minimum out of uint128 range');
  if (sel !== null && !SEL_32.test(String(sel))) throw new Error('createPaid salt is not a bytes32');
  return '0x' + selecteur(sel === null ? SIG_INSCRIRE_CAUTION : SIG_INSCRIRE_CAUTION_SEL) + encodeInitializePool(cle, sqrtPriceX96).slice(10)
    + m.toString(16).padStart(64, '0') + (sel === null ? '' : String(sel).slice(2).toLowerCase());
}
/** L etape qui inscrit (et paie la naissance) : `inscrire` (0xbb920fed, V2..V8) ou `inscrireAvecCaution` (7030, 3 ou 4 arguments). */
export function estEtapeInscription(data) {
  const d = String(data || '').toLowerCase();
  return d.startsWith('0xbb920fed') || d.startsWith('0x' + selecteur(SIG_INSCRIRE_CAUTION)) || d.startsWith('0x' + selecteur(SIG_INSCRIRE_CAUTION_SEL));
}
/** Des wei en ETH lisibles, sans zeros de queue (300000000000000n -> « 0.0003 »). */
function ethTexte(w) {
  const s = BigInt(w).toString().padStart(19, '0');
  return (s.slice(0, -18) + '.' + s.slice(-18)).replace(/\.?0+$/, '');
}
const ETH_CAUTION = '0x0000000000000000000000000000000000000000';

/** After `planLancement(..., hooks: HOOK_PREVU)`: add smart-wallet creator register if the pool is new. */
export async function completerInscriptionHook({ rpc, plan, compte }) {
  if (!plan || (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS')) return plan;
  const out = { ...plan, hook: HOOK_PREVU, frais: FRAIS_V2 };
  if (plan.poolExiste) return out;
  const lire = rpc;
  let code;
  try { code = String(await lire('eth_getCode', [compte, 'latest']) || '0x').toLowerCase(); }
  catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'could not tell whether your wallet is a smart wallet' }; }
  /* ⚠️ 0xef0100… = EIP-7702 EOA: tx.origin is the account. Only a real contract registers. */
  const contrat = code !== '0x' && !code.startsWith('0xef0100');
  if (!contrat) return out;
  let inscrit;
  try {
    const r = await lire('eth_call', [{ to: HOOK_PREVU, data: '0x' + selecteur('inscrit(bytes32)') + poolId(plan.cle).slice(2) }, 'latest']);
    inscrit = '0x' + String(r).slice(-40);
  } catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the creator registration could not be read' }; }
  const etapes = [...plan.etapes];
  if (inscrit.toLowerCase() !== String(compte).toLowerCase()) {
    etapes.push({ nom: 'Register as this market\'s creator (smart wallet)', to: HOOK_PREVU,
      data: encodeInscrire(plan.cle, plan.sqrtVise), value: '0x0' });
  }
  return { ...out, etapes, etat: etapes.length ? 'APPROBATIONS' : 'PRET' };
}

/**
 * Hook V2 : l ouverture exige une inscription PAYEE (≈ 1 $, versee par le contrat au wallet de frais).
 * ⛔ Pour TOUT compte, EOA comme smart wallet : sans elle, la chaine refuse d ouvrir le marche.
 * ⛔ L etat vient de la chaine (`payee`, `inscrit`) : deja payee -> pas de second paiement.
 */
export async function completerInscriptionPayee({ rpc, plan, compte, fraisWei, hook = HOOK_V2, caution = null, sel = null, blocMin = null }) {
  /* 2026-10-16 (UNIT 0xb200..4f27, tx 0x5afe0b77..) : inscription payee, puis REPROPOSEE au meme prix - la relecture suivait la
   *   confirmation sur un noeud en retard (createurs = 0). `blocMin` = bloc de l inscription confirmee : l etat est lu A ce bloc ;
   *   un noeud qui ne l a pas encore leve -> NON_MESURE, rien n est demande.
   * ⛔ 2026-10-17 (revue Claude) : on ne LIT PLUS A ce bloc. `blocMin` est persiste (localStorage) ; quelques heures plus tard un noeud
   *   non-archive refuse un eth_call a un vieux bloc (publicnode : ~10 000 blocs) -> NON_MESURE pour toujours, marche jamais ouvrable.
   *   L inscription est DEFINITIVE : on lit a 'latest', et une inscription confirmee lue « non payee » / « sans createur » ne peut
   *   venir que d un noeud en retard -> NON_MESURE, rien n est demande. Meme protection, sans dependre d une archive. */
  const tag = 'latest';
  const inscriptionConfirmee = typeof blocMin === 'string' && /^0x[0-9a-fA-F]+$/.test(blocMin);
  const enRetard = { etat: 'NON_MESURE', etapes: [], pourquoi: 'the network has not caught up with your registration yet — nothing was asked, try again in a moment' };
  if (!plan || (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS')) return plan;
  const out = { ...plan, hook, frais: FRAIS_V2, v2: true };
  if (plan.poolExiste) return out;
  if (typeof fraisWei !== 'bigint' || fraisWei <= 0n) {
    return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the price of bringing it to life could not be worked out' };
  }
  const id = poolId(plan.cle).slice(2);
  let payee, inscrit, prix;
  try {
    /* ⛔ le hook DONNE (V2 pour ETH, V3 pour une devise de sa liste) — mesure fork 2026-09-19 : ces lectures et l etape
     *    visaient encore HOOK_V2 en dur, et l inscription d une paire AAPLc est partie au V2, qui l a refusee. */
    payee = BigInt(await rpc('eth_call', [{ to: hook, data: '0x' + selecteur('payee(bytes32)') + id }, tag])) !== 0n;
    inscrit = '0x' + String(await rpc('eth_call', [{ to: hook, data: '0x' + selecteur('inscrit(bytes32)') + id }, tag])).slice(-40);
    prix = BigInt(await rpc('eth_call', [{ to: hook, data: '0x' + selecteur('prixInscrit(bytes32)') + id }, tag]));
  } catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the registration could not be read' }; }
  if (inscriptionConfirmee && !payee) return { ...out, ...enRetard };
  const etapes = [...plan.etapes];
  /* ⛔⛔ 2026-10-02 — HOOK 7030 : la naissance PASSE PAR inscrireAvecCaution, jamais par inscrire (sinon le createur ne
   *   toucherait jamais ses 0,03 % : sans caution, sa part part au collateral). Plancher fixe par l app (paires.js
   *   `minimumCautionCreateur`, ≈ 1 $). Caution absente / illisible -> NON_MESURE : rien n est demande au wallet. */
  if (estHook7030(hook)) {
    const min = caution && typeof caution.minimum === 'bigint' ? caution.minimum : null;
    const dev = String((caution && caution.devise) || ETH_CAUTION).toLowerCase();
    const c0 = String(plan.cle && plan.cle.currency0 || '').toLowerCase(), c1 = String(plan.cle && plan.cle.currency1 || '').toLowerCase();
    if (min === null || min <= 0n || min >= (1n << 128n) || (dev !== c0 && dev !== c1)) {
      return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: "the creator's minimum could not be worked out, so nothing was asked" };
    }
    let qui, allowance = null;
    try {
      qui = '0x' + String(await rpc('eth_call', [{ to: hook, data: '0x' + selecteur('createurs(bytes32)') + id }, tag])).slice(26, 66);
      if (dev !== ETH_CAUTION) {
        allowance = BigInt(await rpc('eth_call', [{ to: dev, data: '0x' + selecteur('allowance(address,address)')
          + String(compte).slice(2).toLowerCase().padStart(64, '0') + String(hook).slice(2).toLowerCase().padStart(64, '0') }, 'latest']));
      }
    } catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the registration could not be read' }; }
    const moi = String(compte).toLowerCase();
    if (inscriptionConfirmee && /^0x0{40}$/.test(qui)) return { ...out, ...enRetard };
    if (/^0x0{40}$/.test(qui)) {
      if (dev !== ETH_CAUTION && allowance < min) {
        etapes.push({ nom: "Allow the creator's minimum", to: dev,
          data: '0x' + selecteur('approve(address,uint256)') + String(hook).slice(2).toLowerCase().padStart(64, '0') + min.toString(16).padStart(64, '0'),
          value: '0x0' });
      }
      const cautionWei = dev === ETH_CAUTION ? min : 0n;
      /* ⛔⛔ LE HOOK DICTE LE FRAIS, l app ne le suppose plus. On LIT fraisVie et fraisCreation, et on demande au hook lui-meme
       *   si le sel prouve la naissance par le routeur (neDuRouteur — pas notre copie de la formule) :
       *     prouve     -> surcharge a 4 arguments, du = fraisVie (createPaid a deja paye le reste : jamais 0,0017) ;
       *     non prouve -> surcharge a 3 arguments, du = fraisVie + fraisCreation.
       *   Si ce que l appelant comptait payer (`fraisWei`) ne couvre pas `du`, on REFUSE ICI, avant toute signature : envoyer
       *   reverterait MontantInsuffisant. Lecture ratee -> NON_MESURE : rien n est demande au wallet. */
      let du = null, selProuve = null;
      if (!payee) {
        let vie, creation, prouve = false;
        try {
          vie = BigInt(await rpc('eth_call', [{ to: hook, data: '0x' + selecteur('fraisVie()') }, 'latest']));
          creation = BigInt(await rpc('eth_call', [{ to: hook, data: '0x' + selecteur('fraisCreation()') }, 'latest']));
          if (sel !== null && SEL_32.test(String(sel))) {
            const bloc = dev === c0 ? c1 : c0;
            prouve = BigInt(await rpc('eth_call', [{ to: hook, data: '0x' + selecteur('neDuRouteur(address,bytes32)')
              + bloc.slice(2).padStart(64, '0') + String(sel).slice(2).toLowerCase() }, 'latest'])) === 1n;
          }
        } catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the birth fee could not be read on chain, so nothing was asked' }; }
        if (vie <= 0n || creation <= 0n) return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the birth fee could not be read on chain, so nothing was asked' };
        du = prouve ? vie : vie + creation;
        if (fraisWei < du) {
          return { ...out, etat: 'REFUSE', etapes: [], fraisDu: du,
            pourquoi: 'this block could not be matched to its Create payment, so opening its market would cost more than announced — nothing was asked' };
        }
        if (prouve) selProuve = String(sel).toLowerCase();
      }
      const frais = payee ? 0n : (selProuve ? du : fraisWei);
      etapes.push({
        nom: payee ? "Confirm the starting price and lock the creator's minimum"
          : selProuve ? 'Bring it to life — ' + ethTexte(du) + ' ETH here, the rest was paid at Create'
            : 'Bring it to life — ' + ethTexte(frais) + ' ETH, paid on chain',
        to: hook, data: encodeInscrireAvecCaution(plan.cle, plan.sqrtVise, min, selProuve),
        value: '0x' + (frais + cautionWei).toString(16),
        payant: !payee, caution: min, cautionWei, du, selRouteur: selProuve,
      });
      return { ...out, etapes, etat: 'APPROBATIONS', inscriptionPayee: false, caution: min };
    }
    if (qui !== moi) return { ...out, etat: 'REFUSE', etapes: [], pourquoi: 'another admin already registered this market' };
    if (prix !== BigInt(plan.sqrtVise)) {
      return { ...out, etat: 'REFUSE', etapes: [], pourquoi: 'this market was registered at another starting price' };
    }
    return { ...out, etapes, etat: etapes.length ? 'APPROBATIONS' : 'PRET', inscriptionPayee: payee, caution: min };
  }
  const aJour = payee && inscrit.toLowerCase() === String(compte).toLowerCase() && prix === BigInt(plan.sqrtVise);
  if (!aJour) {
    etapes.push({
      nom: payee ? 'Confirm the starting price' : 'Bring it to life — 0.001 ETH, paid on chain',
      to: hook, data: encodeInscrire(plan.cle, plan.sqrtVise),
      value: payee ? '0x0' : '0x' + fraisWei.toString(16),
      payant: !payee,
    });
  }
  return { ...out, etapes, etat: etapes.length ? 'APPROBATIONS' : 'PRET', inscriptionPayee: payee && aJour };
}

export async function planLancementV2({ rpc, chaine, jeton, compte, valorisationTblock, maintenant = Date.now() }) {
  if (Number(chaine) !== 8453) return { etat: 'REFUSE', pourquoi: 'TBLOCK markets exist on Base mainnet only' };
  const h = await hookDeploye({ rpc });
  if (h === 'ABSENT') {
    return { etat: 'HOOK_ABSENT', pourquoi: 'the TBLOCK fee hook has no code on this network' };
  }
  if (h !== 'DEPLOYE') return { etat: 'NON_MESURE', pourquoi: 'the hook code could not be read' };

  const plan = await planLancement({ rpc, chaine, jeton, compte, valorisationEth: valorisationTblock, maintenant,
    devise: TBLOCK, hooks: HOOK_PREVU });
  if (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS') return plan;
  const complet = await completerInscriptionHook({ rpc, plan, compte });
  return { ...complet, devise: TBLOCK };
}
