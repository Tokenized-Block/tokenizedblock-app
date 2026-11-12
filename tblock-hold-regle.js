/* tblock-hold-regle.js — THE TBLOCK HOLDER RULE, as numbers only (game374). Pure, no import: the server's proof of hold (tblock-hold.js,
 * which re-exports these) and the public fees page (frais-risques.js, in the browser) read the SAME values, so a change here moves both.
 *   HOLD_THRESHOLD_USD ..... a wallet holding at least this many dollars of TBLOCK is a holder (usd >= threshold, tblock-hold.js holdVerdict)
 *   HOLD_PRICE_LOOKBACK_S .. the price used is the LOWER of the price now and the price this many seconds earlier
 * ⛔ The heart rule's $15 (economie.js SEUIL_USD) is a DIFFERENT rule that happens to be equal today: never read one for the other. */
export const HOLD_THRESHOLD_USD = 15;
export const HOLD_PRICE_LOOKBACK_S = 600;
