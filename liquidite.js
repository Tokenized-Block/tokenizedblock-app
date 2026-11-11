// liquidite.js — les outils de liquidite d un block : AJOUTER ses blocks a son marche en gardant la position, et la RETIRER.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13) : « donne tous les outils au block pour etre liquide et facile d apport de fonds ».
// ⛔ DIFFERENT DU LANCEMENT : le lancement cree la pool et place la position au nom de 0x…dEaD (permanente, regle 1).
//    Ici la pool EXISTE deja, et la position appartient a CELUI QUI SIGNE : il peut la retirer quand il veut.
// ⛔ JAMAIS D INITIALISATION ICI : si le plan dit que la pool n existe pas, on refuse — un « ajout » qui creerait une
//    pool a un prix par defaut serait un lancement deguise, au mauvais prix.
// ⛔ SEULEMENT LES MARCHES AU FORMAT DE L APP (ETH ou TBLOCK, frais 0, espacement 200, hook nul OU HOOK_PREVU) :
//    un block qui trade sur une autre pool (autre frais, autre launcher, autre hook) ne recoit pas de liquidite
//    sur une pool voisine vide. Create+Launch default TBLOCK ; P0 2026-09-15 attaches TbFeeHook when DEPLOYE.
import { planLancement, V4_ADRESSES, FEE_POOL, TICK_SPACING_POOL, ADRESSE_NULLE, ETH_NATIF, sqrtDeTick } from './lancer-pool.js';
import { selecteur, montantsPosition, encodeRetraitPosition, decoderPoolEtPosition, poolId } from './pool.js';
import { vieDuBlock } from './marche.js';
import { TBLOCK_TEST_ANCIEN as TBLOCK, HOOK_PREVU, estNotreHook } from './tokenomics.js'; /* game354: in this file TBLOCK = the OLD test token, only to read its LEGACY pools (never shown as "TBLOCK"); the real TBLOCK is tokenomics.TBLOCK */

export const ETATS_LIQUIDITE = ['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE'];
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');

export async function planAjoutLiquidite({ rpc, chaine, jeton, compte, partPourMille, maintenant = Date.now(), marcheLu = null }) {
  const V = V4_ADRESSES[Number(chaine)];
  if (!V) return { etat: 'REFUSE', pourquoi: 'no Uniswap v4 addresses on this network here' };
  const lire = rpc;
  const marche = marcheLu && marcheLu.etat === 'LUE' ? marcheLu : await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton });
  if (marche.etat === 'NON_TROUVEE') return { etat: 'REFUSE', pourquoi: 'this block has no market yet — open it first' };
  if (marche.etat !== 'LUE' || !marche.cle) return { etat: 'NON_MESURE', pourquoi: 'its market could not be read' };
  const k = marche.cle;
  const h = String(k.hooks || ADRESSE_NULLE).toLowerCase();
  const hookOk = h === ADRESSE_NULLE || estNotreHook(h);
  const feeOk = Number(k.fee) === FEE_POOL && Number(k.tickSpacing) === TICK_SPACING_POOL && hookOk;
  const estEthApp = feeOk && String(k.currency0).toLowerCase() === ETH_NATIF;
  const t0 = String(k.currency0).toLowerCase() === TBLOCK.toLowerCase();
  const t1 = String(k.currency1).toLowerCase() === TBLOCK.toLowerCase();
  /* ⛔ AVAIL 2026-09-15: Create+Launch default TBLOCK — Add liquidity must deepen THAT pool, not refuse it.
   *    P0 same day: hooked pools (HOOK_PREVU) are still our format — pass the same hooks into the mint plan. */
  const estTblockApp = feeOk && (marche.paire === 'TBLOCK' || t0 || t1)
    && (t0 || t1);
  if (!estEthApp && !estTblockApp) {
    return { etat: 'REFUSE', pourquoi: 'its market is not a TokenizedBlock market (ETH or TBLOCK, 0 % LP fee, spacing 200, our hook or none) — liquidity tools only add to those' };
  }
  const devise = estTblockApp ? TBLOCK : ETH_NATIF;
  const plan = await planLancement({ rpc: lire, chaine, jeton, compte, valorisationEth: 1, maintenant, partPourMille, proprietaire: compte, devise, hooks: k.hooks });
  if (plan.etat === 'REFUSE' || plan.etat === 'NON_MESURE') return plan;
  if (!plan.poolExiste) return { etat: 'REFUSE', pourquoi: 'the pool was not found at the moment of planning — nothing is created here' };
  return { ...plan, ajout: true };
}

/** Les positions (ids) de ce compte : proprietaire, liquidite, pool et ticks — lus sur la chaine. */
export async function lirePosition({ rpc, chaine, tokenId }) {
  const V = V4_ADRESSES[Number(chaine)];
  const lire = rpc;
  const id = BigInt(tokenId).toString(16).padStart(64, '0');
  let proprietaire = null;
  try { proprietaire = '0x' + String(await lire('eth_call', [{ to: V.posm, data: '0x' + selecteur('ownerOf(uint256)') + id }, 'latest'])).slice(-40); }
  catch { return { tokenId: BigInt(tokenId), etat: 'BRULEE_OU_ABSENTE' }; }
  const L = BigInt(await lire('eth_call', [{ to: V.posm, data: '0x' + selecteur('getPositionLiquidity(uint256)') + id }, 'latest']));
  const pp = decoderPoolEtPosition(await lire('eth_call', [{ to: V.posm, data: '0x' + selecteur('getPoolAndPositionInfo(uint256)') + id }, 'latest']));
  return { tokenId: BigInt(tokenId), etat: 'LUE', proprietaire, liquidite: L, ...pp };
}

export async function planRetrait({ rpc, chaine, compte, tokenId, toleranceBps = 100n, maintenant = Date.now() }) {
  const V = V4_ADRESSES[Number(chaine)];
  if (!V) return { etat: 'REFUSE', pourquoi: 'no Uniswap v4 addresses on this network here' };
  const lire = rpc;
  let pos;
  try { pos = await lirePosition({ rpc: lire, chaine, tokenId }); }
  catch (e) { return { etat: 'NON_MESURE', pourquoi: 'the position could not be read' }; }
  if (pos.etat !== 'LUE') return { etat: 'REFUSE', pourquoi: 'this position no longer exists (already withdrawn?)' };
  if (pos.proprietaire.toLowerCase() !== String(compte).toLowerCase()) return { etat: 'REFUSE', pourquoi: 'this position belongs to another address' };
  if (pos.liquidite === 0n) return { etat: 'REFUSE', pourquoi: 'this position is empty' };
  let sqrt;
  try {
    const s0 = String(await lire('eth_call', [{ to: V.stateView, data: '0x' + selecteur('getSlot0(bytes32)') + poolId(pos.cle).slice(2) }, 'latest']));
    sqrt = BigInt('0x' + s0.slice(2, 66));
  } catch { return { etat: 'NON_MESURE', pourquoi: 'the pool price could not be read' }; }
  const m = montantsPosition(pos.liquidite, sqrt, sqrtDeTick(pos.tickLower), sqrtDeTick(pos.tickUpper));
  const tol = BigInt(toleranceBps);
  const min0 = (m.montant0 * (10000n - tol)) / 10000n, min1 = (m.montant1 * (10000n - tol)) / 10000n;
  const tx = { to: V.posm, value: '0x0',
    data: encodeRetraitPosition({ tokenId: pos.tokenId, min0, min1, cle: pos.cle, destinataire: compte, deadline: BigInt(Math.floor(maintenant / 1000) + 1800) }) };
  try { await lire('eth_call', [{ from: compte, ...tx }, 'latest']); }
  catch (e) { return { etat: 'REFUSE', pourquoi: 'the chain refuses this withdrawal: ' + String((e && e.message) || e).slice(0, 140) }; }
  return { etat: 'PRET', tx, position: pos, attendu: { eth: m.montant0, blocks: m.montant1 }, minimum: { eth: min0, blocks: min1 } };
}

/** Lit l id que recevra le PROCHAIN mint (a lire juste avant d envoyer l ajout, pour retrouver la position apres).
 * ⛔ 2026-10-11 (contre-test de Grok, Add liquidity IB022) : ce compteur est GLOBAL. Entre la lecture et l inclusion, d autres comptes
 *   mintent (mesure : #3129292 et #3129293 a d autres, puis #3129294 a Grok, 16 blocs) - l id lu etait celui d un tiers, la position
 *   reelle n etait jamais gardee (« None added from this browser yet »). Ne sert plus que de SECOURS : voir idsMintesDansRecu. */
export async function prochainIdPosition({ rpc, chaine }) {
  const V = V4_ADRESSES[Number(chaine)];
  return BigInt(await rpc('eth_call', [{ to: V.posm, data: '0x' + selecteur('nextTokenId()') }, 'latest']));
}

const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/** Les ids de position MINTES vers `compte` par CETTE transaction : Transfer(0x0 -> compte, id) emis par le PositionManager LUI-MEME
 *  (un log porte l adresse du contrat qui l emet : un autre contrat ne peut pas en ecrire un au nom du PositionManager).
 *  Rend [] si le recu n en porte aucun (l appelant dit alors ce qu il ne sait pas). */
export function idsMintesDansRecu({ recu, chaine, compte }) {
  const V = V4_ADRESSES[Number(chaine)];
  if (!V || !recu || !Array.isArray(recu.logs) || !/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) return [];
  const posm = V.posm.toLowerCase(), moi = String(compte).toLowerCase().slice(2).padStart(64, '0');
  return recu.logs.filter((l) => l && String(l.address || '').toLowerCase() === posm && Array.isArray(l.topics) && l.topics.length === 4
    && String(l.topics[0]).toLowerCase() === TOPIC_TRANSFER && /^0x0{64}$/i.test(String(l.topics[1]))
    && String(l.topics[2]).toLowerCase().slice(2) === moi)
    .map((l) => BigInt(l.topics[3]));
}
