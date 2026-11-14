/* historique-recompenses.js — the history of every reward period, READ on Base (Phil 2026-11-14, item 4). Pure: reads go through an
 *   injected rpc(method, params); nothing is signed or sent. Used by rewards-history.html.
 * WHAT IS READ, per contract (addresses from the records only: economie-pack.js for V and R, lock-weekly-app.js for R2):
 *   - holders vault V (weeks of the hearts' clock): epochs(e) = (budget, paid, closedAt, closed, released) and totalPlayIn(e);
 *   - monthly R and weekly R2 lock rewards: pot(e), left(e), cut(e) (each wtCOIN, TBLOCK), totalWeight(e), playedWeight(e), closedAt(e),
 *     nextEpochToClose, nextEpochToRelease, currentEpoch, epochEnd(e).
 * WHAT IS SAID: for a closed, unreleased period of R / R2, claimed = pot - left - cut (exact from the views). Once released, what was not
 *   claimed went back to the contract's stock: the views no longer separate it, so "claimed" is then said as not read here, never guessed.
 *   A value that could not be read is null and the page says "not read". */
import { selecteur } from './keccak.js';
import * as EP from './economie-pack.js';
import * as LW from './lock-weekly-app.js';

const S_ = (sig) => String(selecteur(sig)).replace(/^0x/, '');
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const ADR = /^0x[0-9a-f]{40}$/;
const adr = (x) => (ADR.test(String(x || '').toLowerCase()) ? String(x).toLowerCase() : null);
export const V = adr(EP.VAULT), HEARTS = adr(EP.HEARTS), R = adr(EP.REWARDS), R2 = adr(LW.WEEKLY);
export const MAX_PERIODES = 26;

const SEL = Object.freeze({
  epochs: S_('epochs(uint256)'), totalPlayIn: S_('totalPlayIn(uint256)'), currentEpoch: S_('currentEpoch()'), epochEnd: S_('epochEnd(uint256)'),
  pot: S_('pot(uint256)'), left: S_('left(uint256)'), cut: S_('cut(uint256)'), totalWeight: S_('totalWeight(uint256)'), playedWeight: S_('playedWeight(uint256)'),
  closedAt: S_('closedAt(uint256)'), nextEpochToClose: S_('nextEpochToClose()'), nextEpochToRelease: S_('nextEpochToRelease()'),
});
export { SEL };

const mot = (h, i = 0) => { const m = String(h || '').replace(/^0x/, '').slice(64 * i, 64 * (i + 1)); return m.length === 64 ? BigInt('0x' + m) : null; };

function lecteur(rpc) {
  const brut = async (to, sel, args = '') => { try { return await rpc('eth_call', [{ to, data: '0x' + sel + args }, 'latest']); } catch (_) { return null; } };
  const un = async (to, sel, args = '', i = 0) => mot(await brut(to, sel, args), i);
  const deux = async (to, sel, args = '') => { const h = await brut(to, sel, args); const a = mot(h, 0), b = mot(h, 1); return a === null || b === null ? null : { wtcoin: a, tblock: b }; };
  return { brut, un, deux };
}

/** the holders vault's weeks, newest first: { courant, semaines: [{ e, fin, joue, budget, paye, closedAt, ferme, libere, etat }] } */
export async function lireVault(rpc) {
  if (!V || !HEARTS) return { absent: true };
  const L = lecteur(rpc);
  const courant = await L.un(HEARTS, SEL.currentEpoch);
  if (courant === null) return { courant: null, semaines: [] };
  const semaines = [];
  for (let e = courant; e >= 0n && semaines.length < MAX_PERIODES; e--) {
    const [h, joue, fin] = await Promise.all([L.brut(V, SEL.epochs, u(e)), L.un(V, SEL.totalPlayIn, u(e)), L.un(HEARTS, SEL.epochEnd, u(e))]);
    const budget = mot(h, 0), paye = mot(h, 1), closedAt = mot(h, 2), ferme = mot(h, 3), libere = mot(h, 4);
    const lu = budget !== null && ferme !== null;
    semaines.push({ e, fin, joue, budget, paye, closedAt, ferme: lu ? ferme === 1n : null, libere: libere === null ? null : libere === 1n,
      etat: !lu ? 'NON_LU' : e === courant ? 'EN_COURS' : ferme === 1n ? (libere === 1n ? 'LIBEREE' : 'FERMEE') : 'A_FERMER' });
    if (e === 0n) break;
  }
  return { courant, semaines };
}

/** R or R2 periods, newest first: { courant, prochain, aLiberer, periodes: [{ k, fin, pot, reste, coupe, poidsTotal, poidsJoue, closedAt, reclame, etat }] } */
export async function lireLock(rpc, contrat) {
  const C = adr(contrat);
  if (!C) return { absent: true };
  const L = lecteur(rpc);
  const [courant, prochain, aLiberer] = await Promise.all([L.un(C, SEL.currentEpoch), L.un(C, SEL.nextEpochToClose), L.un(C, SEL.nextEpochToRelease)]);
  if (courant === null || prochain === null || aLiberer === null) return { courant, prochain, aLiberer, periodes: [] };
  const periodes = [];
  for (let k = courant; k >= 0n && periodes.length < MAX_PERIODES; k--) {
    const ferme = k < prochain, libere = k < aLiberer;
    const [fin, pot, reste, coupe, poidsTotal, poidsJoue, closedAt] = await Promise.all([L.un(C, SEL.epochEnd, u(k)), ferme ? L.deux(C, SEL.pot, u(k)) : null,
      ferme ? L.deux(C, SEL.left, u(k)) : null, ferme ? L.deux(C, SEL.cut, u(k)) : null, ferme ? L.un(C, SEL.totalWeight, u(k)) : null, L.un(C, SEL.playedWeight, u(k)),
      ferme ? L.un(C, SEL.closedAt, u(k)) : null]);
    let reclame = null;
    if (ferme && !libere && pot && reste && coupe) reclame = { wtcoin: pot.wtcoin - reste.wtcoin - coupe.wtcoin, tblock: pot.tblock - reste.tblock - coupe.tblock };
    periodes.push({ k, fin, pot, reste, coupe, poidsTotal, poidsJoue, closedAt, reclame,
      etat: k === courant ? 'EN_COURS' : !ferme ? 'A_FERMER' : libere ? 'LIBEREE' : 'FERMEE' });
    if (k === 0n) break;
  }
  return { courant, prochain, aLiberer, periodes };
}

export async function lireTout(rpc) {
  const [v, r, h] = await Promise.all([lireVault(rpc), lireLock(rpc, R), lireLock(rpc, R2)]);
  return { v, r, h };
}

export const NON_LU = 'not read';
export const ETATS = Object.freeze({ EN_COURS: 'running', A_FERMER: 'ended, not closed yet', FERMEE: 'closed', LIBEREE: 'closed, unclaimed part back in the stock', NON_LU: 'not read' });
export const jour = (s) => (s === null || s === undefined ? NON_LU : new Date(Number(s) * 1000).toISOString().slice(0, 10));
export const tb = (x, d = 0) => (x === null || x === undefined ? NON_LU : EP.fmt(x, d) + ' TBLOCK');
export const wt = (x) => (x === null || x === undefined ? NON_LU : EP.fmt(x, 6) + ' wtCOIN');
/** a share of the locks' weight that played, in % (one decimal), or null */
export function partJoue(p) { if (p.poidsJoue === null || p.poidsTotal === null || p.poidsTotal === 0n) return null; return Number((p.poidsJoue * 1000n) / p.poidsTotal) / 10; }
