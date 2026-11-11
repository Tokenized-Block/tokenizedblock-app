/* achat-tblock-usdc.js — game358 (Phil 2026-11-11: "vérifie bien que les paiements en usdc font bien une pression acheteuse";
 *   "Mint this work — 5 USDC … même chose ici ça ouvre un buy sur tblock, vérifie ça doit marcher").
 *
 * MEASURED BEFORE THIS FILE (2026-11-11, read in the code, map workflow): NO USDC payment of the app bought TBLOCK. TamArt, BlockSkins,
 *   BlockRolls, BlockSlots, messages… move USDC by plain transfers to a pot or the fee wallet, and the deployed contracts cannot be
 *   changed. So the buy happens in the PAYER's own wallet, right after the payment: a share of the price (10 % by default, the payer can
 *   untick it) buys TBLOCK on its pool through the app's route (/api/rails/plan -> tblock-route.js planRouteTblock: USDC -> wtCOIN on
 *   Aerodrome -> TBLOCK on the pinned Uniswap v4 pool, simulated as a batch before it is offered). The TBLOCK lands in the payer's wallet.
 *   Fork-proven route (banc-tblock-route-fork-20261109.mjs 53/53 on 2026-11-11). Nothing here signs: the page's wallet does.
 *
 * This module is PURE (no DOM, no network): the amounts, the URL, the check of the plan the server returns, and the words. */
import { USDC_BASE } from './frais-creation.js';
import { TBLOCK } from './tokenomics.js'; /* served to the page; equal to tblock-hold.js TBLOCK (what tblock-route.js puts in recoitDevise) — the test checks it */

export const PART_ACHAT_BPS = 1000n;            /* 10 % of the price, by default */
export const ACHAT_MIN_USDC = 100_000n;         /* 0.10 USDC: below it, gas outweighs the buy — no leg is offered */
const bas = (a) => String(a || '').toLowerCase();

/** the USDC (raw, 6 decimals) the leg spends for a price `prix` (raw USDC); 0n when below ACHAT_MIN_USDC */
export function montantAchat(prix, bps = PART_ACHAT_BPS) {
  let p, b; try { p = BigInt(prix); b = BigInt(bps); } catch (_) { return 0n; }
  if (p <= 0n || b <= 0n || b > 10000n) return 0n;
  const m = p * b / 10000n;
  return m >= ACHAT_MIN_USDC ? m : 0n;
}

/** the server route that plans the buy (the same one the swap panel uses) */
export function urlPlanAchat({ montant, compte }) {
  return '/api/rails/plan?de=' + bas(USDC_BASE) + '&vers=' + bas(TBLOCK) + '&montant=' + String(BigInt(montant)) + '&compte=' + bas(compte);
}

/** the plan is offered ONLY if it is ready, pays exactly `montant` USDC, and delivers the REAL TBLOCK, with a minimum above zero */
export function verifierPlanAchat(p, { montant }) {
  if (!p || typeof p !== 'object') return { ok: false, pourquoi: 'no plan' };
  if (p.etat !== 'PRET') return { ok: false, pourquoi: String(p.pourquoi || p.etat || 'not ready') };
  /* review 358: the route's two legs only make sense together — without the batch the USDC can become wtCOIN with no TBLOCK after it */
  if (p.atomique !== true) return { ok: false, pourquoi: 'the plan is not an all-or-nothing batch' };
  /* review 358: a plan served from the 15 s cache carries the minimum of an earlier read (maybe before your own last buy) */
  if (p.depuisCache === true) return { ok: false, pourquoi: 'a fresh price is needed — try again in a few seconds' };
  const r = p.resume || {};
  let paye, min; try { paye = BigInt(r.paye); min = BigInt(r.recoitAuMoins); } catch (_) { return { ok: false, pourquoi: 'the plan summary could not be read' }; }
  if (bas(r.payeDevise) !== bas(USDC_BASE)) return { ok: false, pourquoi: 'the plan does not pay in USDC' };
  if (paye !== BigInt(montant)) return { ok: false, pourquoi: 'the plan pays another amount than asked' };
  if (bas(r.recoitDevise) !== bas(TBLOCK)) return { ok: false, pourquoi: 'the plan does not deliver TBLOCK (0xb200…830e)' };
  if (min <= 0n) return { ok: false, pourquoi: 'the plan promises no TBLOCK' };
  const appels = Array.isArray(p.appels) ? p.appels : [];
  if (!appels.length || appels.some((a) => !a || !/^0x[0-9a-fA-F]{40}$/.test(String(a.to || '')))) return { ok: false, pourquoi: 'the plan has no valid calls' };
  let frais = 0n; try { frais = BigInt(r.fraisMontant || 0); } catch (_) { frais = 0n; }
  return { ok: true, appels, recoitAuMoins: min, frais };
}

const usd = (raw) => (Number(BigInt(raw)) / 1e6).toFixed(2);
/** the checkbox label, before paying */
export function texteOption(montant) { return 'Also buy TBLOCK with ' + usd(montant) + ' USDC (10%) — it goes to your wallet'; }
/** after the payment: what is asked next */
export function texteEtape(montant) { return 'Now the TBLOCK buy: ' + usd(montant) + ' USDC → TBLOCK on its pool, in your wallet (one more signature, all or nothing).'; }
/** review 358: what the wallet is about to sign, the app fee and the possible wtCOIN leftover named (from the plan, never a constant) */
export function texteAttente({ montant, recoitAuMoins, frais = 0n, fmt }) {
  return 'Waiting for your wallet: ' + usd(montant) + ' USDC → at least ' + fmt(recoitAuMoins) + ' TBLOCK'
    + (frais > 0n ? ' (incl. a ' + (Number(frais) / 1e6).toFixed(4) + ' USDC app fee)' : ' (no app fee)')
    + '; a little wtCOIN (the route’s pivot) may stay in your wallet…';
}
