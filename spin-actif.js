/* spin-actif.js — WHICH Spin the server serves and settles, read from the records, never typed (Phil 2026-11-12).
 *   Before the noter writes the new Spin into skins-spin-deploiement.js: the live Spin of slots-deploiement.js, exactly as today.
 *   After: the NEW Spin (dev share paid through the TBLOCK payment router), and the earlier Spin as `avant`, so the keeper still settles the
 *   spins played on it before the switch (a spin not settled within 256 blocks is lost).
 * The new Spin is served ONLY if its price, pot share and 16 prizes are the earlier Spin's (the odds and the average the app and the fees
 *   page state, esperanceBrut / probGainBps of slots-deploiement.js, are computed on that table); otherwise the earlier Spin stays served
 *   and `refus` says why. Pure: no network. */
import { SLOTS_DEPLOIEMENT } from './slots-deploiement.js';
import { SKINS_SPIN_DEPLOIEMENT } from './skins-spin-deploiement.js';
import { deployes } from './skins-spin.js';

const ADR = /^0x[0-9a-f]{40}$/i;
const bas = (x) => String(x || '').toLowerCase();

/**
 * @returns {null | { contrat, bloc, config: { usdc, devWallet, spinPrice, potShareBps, prizes }, esperanceBrut, probGainBps,
 *   devRouteur: null | { routeur, vault, devBps, minBatch, maxBatch }, avant: null | { contrat, bloc, table }, refus: string|null }}
 */
export function spinActif(fiche = SLOTS_DEPLOIEMENT, rec = SKINS_SPIN_DEPLOIEMENT) {
  const vieux = fiche && ADR.test(String(fiche.adresse || '')) && Number.isSafeInteger(fiche.bloc) && fiche.bloc > 0
    ? { contrat: bas(fiche.adresse), bloc: fiche.bloc, table: fiche.constructeur.prizes.map(String) } : null;
  const base = (refus) => (vieux ? { contrat: vieux.contrat, bloc: vieux.bloc, config: fiche.constructeur, esperanceBrut: String(fiche.esperanceBrut), probGainBps: Number(fiche.probGainBps),
    devRouteur: null, avant: null, refus } : null);
  const neuf = deployes(rec).spin;
  if (!neuf) return base(null);
  const c = neuf.config;
  if (!vieux) return base('the earlier Spin record has no address: the new Spin is not served');
  const meme = String(c.spinPrice) === String(fiche.constructeur.spinPrice) && Number(c.potShareBps) === Number(fiche.constructeur.potShareBps)
    && Array.isArray(c.prizes) && c.prizes.map(String).join(',') === vieux.table.join(',') && bas(c.usdc) === bas(fiche.constructeur.usdc);
  if (!meme) return base('the new Spin does not keep the price, pot share and prizes of the earlier Spin: not served');
  return {
    contrat: neuf.adresse, bloc: neuf.bloc,
    config: Object.freeze({ usdc: bas(c.usdc), devWallet: bas(c.devWallet), spinPrice: String(c.spinPrice), potShareBps: Number(c.potShareBps), prizes: c.prizes.map(String) }),
    esperanceBrut: String(fiche.esperanceBrut), probGainBps: Number(fiche.probGainBps),
    devRouteur: Object.freeze({ routeur: bas(c.router), vault: bas(c.dest), devBps: Number(c.devBps), minBatch: String(c.minDevBatch), maxBatch: String(c.maxDevBatch) }),
    avant: Object.freeze(vieux), refus: null,
  };
}
export const SPIN_ACTIF = spinActif();
