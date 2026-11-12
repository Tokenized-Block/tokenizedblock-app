/* pool-lanceur-taxe.js — POURQUOI UNE POOL v4 A HOOK TIERS QUE LE QUOTER REFUSE NE S ACHETE PAS ICI : la cause LUE, dite par ligne.
 *
 * ⛔⛔ MESURE du 2026-10-26 (lecture seule, base-rpc.publicnode.com, tete 53 107 719 ; forks anvil sur port dedie) — les 129 lignes
 *   du trending (mesures/cles-par-pool-id-trending-20261026.json) dont la pool est ETH / jeton B20, fee 100, tickSpacing 1, un hook par jeton :
 *   · 2 gabarits de hook : 85 x 16 817 octets (permissions 0xcc : beforeSwap, afterSwap, beforeSwapReturnDelta, afterSwapReturnDelta ;
 *     deployes par CREATE2 via 0xfc13fdbccf03654e784e5792448bd70d3ded12fb, selecteur 0xcdcb760a) et 44 x 8 490 octets (permissions 0x28c4 ;
 *     via 0x0000000000ffe8b47b3e2130213b802212439497, selecteur 0x64e03087). 129 EOA deployeurs DISTINCTS, chacun owner() de son hook,
 *     et le meme EOA initialise la pool par le PositionManager (0x7c5f…9bdc) 3 a 8 blocs apres. Pas UN contrat lanceur : un gabarit.
 *   · taxBps() (0x3eacd2f8) = 9999 sur 10000 (0xe1a45218) : 129 / 129.
 *   · historique PoolManager par poolId : 129 / 129 = UN ajout de liquidite, puis TOUTE la liquidite retiree par le MEME EOA, 894 a 941 blocs
 *     apres l ajout (mediane 913) ; liquidite en cours aujourd hui (StateView.getLiquidity) = 0 sur 129 / 129 ; le Quoter v4 revert
 *     0x6190b2b0 (UnexpectedRevertBytes) enveloppant 0x7a5ed734 = NotEnoughLiquidity(poolId) — juste : il n y a rien a echanger.
 *   · 14 725 Swap, dont 14 714 par 0xfdf682f5…fbc7 (Swap.sender, un evenement) ; tx.to relu de 387 transactions : 0x215199f6…b2e7 (255)
 *     et 0x1491033b…689c (132). Sur ADOF et replicas, 117 / 117 et 112 / 112 des tx.from qui ont echange repondent 1 a
 *     0x054a0b38…8c44.fe9fbb80(adresse) ; un wallet neuf, notre routeur, 0xfdf682f5 et 0x215199f6 y repondent 0.
 *   · FORK aux blocs ou la pool etait vivante (ADOF 53 056 300, BaseDay 53 081 600, replicas 53 082 000), wallet neuf impersonne :
 *     achat 0,001 ETH par NOTRE routeur (0x6ff5…9b43) = devis exact ; revente de TOUT par le meme routeur = 99 980 006 964 wei rendus,
 *     0,0100 % de ce qui a ete paye (devis de vente == recu). Meme resultat par 0xfdf682f5 directement. Autorisations revenues a 0.
 * ⇒ AUCUN routeur atteignable par l app n y achete aujourd hui (liquidite 0 partout) ; et quand elles en avaient, un wallet hors de la
 *   liste de 0x054a… revendait a 0,01 %. On le DIT, par ligne, avec le chiffre lu ; pas de Buy. Rien n est dit de l intention de qui que
 *   ce soit : la structure seulement.
 * ⛔ Ce module NE SIGNE RIEN. Il lit (eth_call) et rend une phrase ; une lecture ratee est « non lue », jamais une absence. */

export const SEL_TAX_BPS = '3eacd2f8';      /* taxBps() — lu sur les 2 gabarits */
export const SEL_TAX_DENOM = 'e1a45218';    /* rend 10000 sur les 2 gabarits (le denominateur de taxBps) */
export const SEL_GET_LIQUIDITY = 'fa6793d5'; /* StateView.getLiquidity(bytes32) */
/** Au-dela de ce taux de taxe (en fraction du denominateur), la revente n est pas un marche. 50 % : tres au-dessus de tout frais reel. */
export const TAXE_MAX_FRACTION = 0.5;

const mot = (h) => (typeof h === 'string' && /^0x[0-9a-fA-F]{64}/.test(h) ? BigInt(h.slice(0, 66)) : null);

/**
 * Lit la cause d un refus sur une cle v4 : liquidite en cours (StateView), taxBps / denominateur du hook (s il les a).
 * @param {{ appel:(to:string,data:string)=>Promise<string>, stateView:string, cle:object, poolId:string }} o
 * @returns {Promise<{ liquidite:bigint|null, taxBps:bigint|null, denom:bigint|null, lu:boolean }>} `lu` faux si la liquidite n est pas lue.
 */
export async function lireCauseRefusPool({ appel, stateView, cle, poolId }) {
  const id = String(poolId || '').replace(/^0x/, '').toLowerCase();
  const hook = String(cle && cle.hooks || '').toLowerCase();
  const essai = async (to, data) => { try { return mot(await appel(to, data)); } catch (_) { return null; } };
  const liquidite = /^[0-9a-f]{64}$/.test(id) ? await essai(stateView, '0x' + SEL_GET_LIQUIDITY + id) : null;
  let taxBps = null, denom = null;
  if (/^0x[0-9a-f]{40}$/.test(hook) && hook !== '0x0000000000000000000000000000000000000000') {
    taxBps = await essai(hook, '0x' + SEL_TAX_BPS);
    if (taxBps !== null) denom = await essai(hook, '0x' + SEL_TAX_DENOM);
  }
  return { liquidite, taxBps, denom, lu: liquidite !== null };
}

/** taxBps / denom en pourcent, ou null si non lu ou incoherent (denominateur 0 ou taxe > denominateur). */
export function tauxTaxe({ taxBps, denom }) {
  if (typeof taxBps !== 'bigint' || typeof denom !== 'bigint' || denom <= 0n || taxBps > denom) return null;
  return Number(taxBps * 1000000n / denom) / 10000;
}

/**
 * La phrase de la ligne, depuis la cause LUE. null quand rien de mesure ne l explique (l appelant garde sa phrase generale).
 * @returns {?{ code:'POOL_VIDE'|'POOL_VIDE_TAXE_REVENTE'|'TAXE_REVENTE', phrase:string }}
 */
export function phraseRefusPool(c) {
  if (!c) return null;
  const pct = tauxTaxe(c);
  const taxe = pct !== null && pct / 100 > TAXE_MAX_FRACTION;
  const pctTexte = pct === null ? '' : (pct >= 99.99 ? pct.toFixed(2) : String(Math.round(pct * 100) / 100)) + '%';
  const vide = c.liquidite === 0n;
  if (vide && taxe) {
    return { code: 'POOL_VIDE_TAXE_REVENTE', phrase: 'No buy: its pool is empty (0 liquidity at its price, read on chain), and its hook takes '
      + pctTexte + ' of a resale by any wallet not on its own list.' };
  }
  if (vide) return { code: 'POOL_VIDE', phrase: 'No buy: its pool is empty (0 liquidity at its price, read on chain). Nothing can be bought there by any router.' };
  if (taxe) {
    return { code: 'TAXE_REVENTE', phrase: 'No buy: its hook takes ' + pctTexte + ' of a resale by any wallet not on its own list (read on chain): '
      + 'what you buy could not be sold back for its value.' };
  }
  return null;
}

/* game374 (audit of the fees page, R-launch-5) — the measure of 2026-10-26 above, as data: what a wallet off the hook's list got back when it
 *   sold everything it had just bought (fork, 0.001 ETH paid). The fees page computes its percentage from these two integers. */
export const MESURE_ALLER_RETOUR = Object.freeze({ date: '2026-10-26', taxBps: 9999, payeWei: '1000000000000000', rendusWei: '99980006964', poolsVides: 129, poolsLues: 129 });

/**
 * ⛔ game374 (R-launch-5) — LA TAXE AVANT LE BUY. Before, the hook's taxBps() was read only for a pool the Quoter REFUSED; a pool on such a
 * hook that still held liquidity was quoted and got a Buy (prod /api/trending 2026-11-12: 3 rows, taxBps 9999). Now the server reads the tax of
 * a third-party hook BEFORE it offers a Buy on a quoted pool:
 *   - the hook answers taxBps() and its denominator, and the tax is above TAXE_MAX_FRACTION -> TAXE_REVENTE (no Buy, the phrase says why);
 *   - the hook REVERTS on taxBps() (it has no such function — the normal case) -> null, the Buy stays;
 *   - any other failure (node down, empty answer, incoherent numbers) -> TAXE_NON_LUE: no Buy this round, never a guess (fail closed).
 * `appel(to, data)` rejects with an Error; a revert of the chain is told by `e.definitif === true` (rpcRails) or « revert » in its message.
 * @returns {Promise<null|{ code:'TAXE_REVENTE'|'TAXE_NON_LUE', phrase:string }>}
 */
export async function gardeTaxeAvantAchat({ appel, hook }) {
  const h = String(hook || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(h) || h === '0x0000000000000000000000000000000000000000') return null;
  const nonLue = { code: 'TAXE_NON_LUE', phrase: 'No buy right now: the resale tax of its pool\'s hook was not read just now.' };
  const estRevert = (e) => !!(e && (e.definitif === true || /revert/i.test(String(e.message || e))));
  let taxBps;
  try { taxBps = mot(await appel(h, '0x' + SEL_TAX_BPS)); } catch (e) { return estRevert(e) ? null : nonLue; }
  if (taxBps === null) return nonLue;
  let denom;
  try { denom = mot(await appel(h, '0x' + SEL_TAX_DENOM)); } catch (e) { return nonLue; }
  if (tauxTaxe({ taxBps, denom }) === null) return nonLue;
  return phraseRefusPool({ liquidite: null, taxBps, denom });
}
