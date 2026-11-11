/* banque-frais.js — the TokenizedBank (Morpho borrow / lend) fee rates and margin, in ONE browser-safe module (2026-11-11).
 * banque-morpho.js (server-only: it builds the plans and knows where fees go) re-exports these; the public "Fees & risks" page
 * (frais-risques.js) reads them here. No imports, no address: the fee recipient never leaves banque-morpho.js.
 * Decisions (Phil): 0.1% of what is borrowed (2026-10-11); the same 0.1% on top of what is lent (2026-10-26); exits are free. */

/** Borrow fee: 0.1% of the amount borrowed, rounded up, paid in the same simulated batch, after the borrow. */
export const FRAIS_EMPRUNT_BPS = 10n;
/** Lend fee: the same rate, charged ON TOP of the amount lent (the wallet sends amount + fee). */
export const FRAIS_PRET_BPS = FRAIS_EMPRUNT_BPS;
/** Repay, withdraw a loan, take collateral back: no app fee. */
export const FRAIS_SORTIE_BPS = 0n;
/** Borrow margin: at most 70% of what the market's LLTV allows (a proposal written once, not a Morpho rule). */
export const MARGE_EMPRUNT_BPS = 7000n;
/** Said with every multi-stock borrow plan and on the page: each stock is its own Morpho position. */
export const PHRASE_PANIER_SEPARE = 'Each stock is its own Morpho position: if one stock falls to its liquidation price, only that position is liquidated — the other stocks do not protect it.';
