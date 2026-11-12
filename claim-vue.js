/* claim-vue.js — the page side of claim.html (game386, Phil 2026-11-12: "a page that sticks to claim and details"). Wallet → Holders →
 *   "Claim and details" used to open the block contest; this module is what the claim page reads, decides and checks instead.
 *   Pure: no DOM, no wallet of its own. Every read goes through an injected rpc(method, params); every send through an injected
 *   envoyer(appel). It builds UNSIGNED calls only; the person's own wallet signs. Nothing here holds, signs or sends.
 * ⛔ NO ADDRESS IS TYPED HERE: the holders vault V and the lock rewards R come from economie-pack.js (the record of the six receipts),
 *   TBLOCK from economie.js through it, the lock from lock.js, wtCOIN from create-vault-tip.js; R.TBLOCK() and R.WTCOIN() are READ and
 *   must equal them, V.LIKES() is READ and its week clock is the one used (the vault closes a week by LIKES.epochEnd).
 * ⛔ THE RULES ARE THE CONTRACTS' (contracts/src/TBlockVaultV2.sol, contracts/src/TBlockLockRewards.sol):
 *   V.claim(e): week e CLOSED, now < closedAt + CLAIM_WINDOW, not claimed yet, needFor(e) LOCKED (activeLockedOf), a lock date at least
 *     MIN_COMMIT ahead, owed(e, wallet) > 0. Pays min(share + topBonus, budget - paid) to msg.sender in TBLOCK; emits Claimed(e, player,
 *     share, topBonus).
 *   R.claim(uint256[]): 1 to 24 CLOSED, unreleased months the wallet PLAYED with a weight; pays msg.sender wtCOIN and TBLOCK; emits
 *     Claimed(holder, wtcoin, tblock, n). A month is released (swept) CLAIM_WINDOW months after its close.
 * ⛔ A VALUE THAT WAS NOT READ IS null AND SAYS "not read", never 0 and never a verdict.
 * ⛔ BEFORE THE WALLET OPENS: the account is re-read (another wallet = refused), the call is simulated with eth_call FROM the wallet.
 *   AFTER: the transaction itself is read (an event is not a transaction): signer (tx.from, or the smart account named by the EntryPoint's
 *   UserOperationEvent), status, the exact call, and the token Transfer logs EMITTED BY THE TOKEN from the contract to the wallet. */
import { selecteur, topic } from './keccak.js';
import * as EP from './economie-pack.js';
import * as LK from './lock.js';
import { WTCOIN as WTCOIN_REC } from './create-vault-tip.js';
import { displayShort } from './frais-creation.js';
import { ENTRY_POINTS } from './entry-points.js';

export const CHAINE = 8453;
export const CHAINE_HEX = '0x2105';
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => { const s = bas(x); return ADR.test(s) ? s : null; };
export const V = adr(EP.VAULT);
export const R = adr(EP.REWARDS);
export const TBLOCK = adr(EP.TBLOCK);
export const WTCOIN = adr(WTCOIN_REC);
export const NON_LU = 'not read';
/** past weeks of the vault listed (the claim window is 14 days: older weeks are shown as over) */
export const SEMAINES_MAX = 8;
/** R.MAX_CLAIM_EPOCHS: at most 24 months in one claim */
export const MOIS_MAX = 24;
/** the commitment bands R pays (TBlockLockRewards.multiplierBps), READ at these lengths */
export const BANDES_JOURS = Object.freeze([0, 30, 90, 180, 365]);

const strip = (h) => String(h).replace(/^0x/, '');
const S_ = (sig) => strip(selecteur(sig));
export const SEL = Object.freeze({
  LIKES: S_('LIKES()'), TBLOCK: S_('TBLOCK()'), WTCOIN: S_('WTCOIN()'), EPOCH: S_('EPOCH()'), REWARD_BPS: S_('REWARD_BPS()'),
  CLAIM_WINDOW: S_('CLAIM_WINDOW()'), closedAt: S_('closedAt(uint256)'), multiplierBps: S_('multiplierBps(uint256)'),
  closeEpoch: S_('closeEpoch(uint256)'), currentEpoch: S_('currentEpoch()'), epochEnd: S_('epochEnd(uint256)'),
});
export const TOPIC = Object.freeze({
  Transfer: topic('Transfer(address,address,uint256)'),
  ClaimedV: topic('Claimed(uint256,address,uint256,uint256)'),
  ClaimedR: topic('Claimed(address,uint256,uint256,uint256)'),
  EpochClosedV: topic('EpochClosed(uint256,uint256,uint256)'),
  EpochClosedR: topic('EpochClosed(uint256,uint256,uint256,uint256,uint256)'),
  /* ERC-4337 EntryPoint v0.6 / v0.7: UserOperationEvent(userOpHash, sender indexed, paymaster indexed, nonce, success, gasCost, gasUsed) */
  UserOp: topic('UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)'),
});
/** the ERC-4337 EntryPoints whose UserOperationEvent names the smart account that acted: entry-points.js, the list revenu-externe.js reads
 *  too (read on Base on 2026-10-17). Review 2026-11-12: any contract can emit an event with this topic, so one from another emitter names
 *  nobody (an event is not a transaction). */
export { ENTRY_POINTS };
/** the custom errors of V and R, said in words (a revert is a sentence, never a code) */
const ERREURS = [
  ['NotClosed()', 'this week is not closed yet'], ['WindowClosed()', 'the 14-day claim window of this week is over'],
  ['AlreadyClaimed()', 'this wallet already claimed this week'], ['HoldTooLow(uint256,uint256)', 'not enough TBLOCK locked for this week'],
  ['NotCommitted(uint256,uint256)', 'the lock must last at least 7 more days after the claim'], ['NothingToClaim()', 'nothing to claim for this wallet'],
  ['EpochNotOver(uint256)', 'this week has not ended yet'], ['AlreadyClosed()', 'this week is already closed'], ['Locked()', 'the contract is busy, try again'],
  ['EpochNotClosed(uint256)', 'that month is not closed yet'], ['EpochReleased(uint256)', 'that month was released: its claim window is over'],
  ['AlreadyClaimed(uint256)', 'this wallet already claimed that month'], ['NoWeight(uint256)', 'this lock does not cover that month'],
  ['NotPlayed(uint256)', 'this wallet did not play that month'], ['TooManyEpochs()', 'at most 24 months in one claim'], ['NoEpochs()', 'no month to claim'],
  ['EpochNotEnded(uint256)', 'that month has not ended yet'], ['EpochOutOfOrder(uint256)', 'months close in order: an earlier month must close first'],
  ['TransferFailed()', 'the token transfer failed'], ['Reentrancy()', 'the contract is busy, try again'],
];
export const ERREUR_PAR_SEL = Object.freeze(Object.fromEntries(ERREURS.map(([sig, txt]) => [bas(selecteur(sig)), txt])));
/** a revert's data (or a node message carrying it) -> a sentence; null when it is not one of the two contracts' errors */
export function texteRevert(donnees) {
  const m = /0x[0-9a-fA-F]{8}/.exec(String(donnees || ''));
  return m ? ERREUR_PAR_SEL[bas(m[0])] || null : null;
}

/* ═══════════════ words ═══════════════ */
const big = (x) => (typeof x === 'bigint' ? x : null);
/** an amount (raw, 18 decimals) or "not read"; never 0 for a value that was not read */
export function montant(raw, unite = 'TBLOCK', digits = 4) { const b = big(raw); return b === null ? NON_LU : EP.fmt(b, digits) + ' ' + unite; }
export const minute = (s) => (s === null || s === undefined ? NON_LU : new Date(Number(s) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
export const jourTexte = (s) => (s === null || s === undefined ? NON_LU : new Date(Number(s) * 1000).toISOString().slice(0, 10));
const jours = (s) => Math.round(Number(s) / 86400);

/* ═══════════════ calls (unsigned) ═══════════════ */
const appel = (to, data) => { if (!to) throw new Error('this contract is not on this network'); return Object.freeze({ to, data, value: '0x0' }); };
/** V.claim(e): exactly the call economie-pack.js builds (one uint256) */
export const claimSemaineCall = (e) => EP.claimCall(BigInt(e));
/** R.claim(uint256[]) for 1..24 months */
export const claimMoisCall = (mois) => EP.claimRewardsCall(mois);
/** V.closeEpoch(e) (anyone, once week e has ended) */
export const closeSemaineCall = (e) => EP.closeEpochCall(BigInt(e));
/** R.closeEpoch(k) (anyone, once month k has ended, months in order) */
export const closeMoisCall = (k) => appel(R, '0x' + SEL.closeEpoch + EP.wUint(k));

/* ═══════════════ reading ═══════════════ */
const vue = (to, sel, args = '') => ({ to, data: '0x' + sel + args });
const motAdr = (w) => { const n = BigInt(w); return n >> 160n ? null : '0x' + n.toString(16).padStart(40, '0'); };

/** everything the page shows, READ on Base for `wallet` (or null: the rules and the clock only). Every value that could not be read is
 *  null. { wallet, maintenant, v: {...}, moi: {...}, r: {...} } */
export async function lireTout(rpc, wallet, maintenant) {
  const w = wallet ? adr(wallet) : null;
  const brut = async (v) => { try { return await rpc('eth_call', [{ to: v.to, data: v.data }, 'latest']); } catch (_) { return null; } };
  const lit = async (v, i = 0) => { const h = await brut(v); if (h === null) return null; try { return EP.word(h, i); } catch (_) { return null; } };
  const lit2 = async (v) => { const h = await brut(v); if (h === null) return null; try { return [EP.word(h, 0), EP.word(h, 1)]; } catch (_) { return null; } };
  const out = { wallet: w, maintenant: Number(maintenant), v: { semaines: [] }, moi: {}, r: { mois: [] } };

  /* ── V: its own clock is LIKES (read from V), its window and commitment are its own immutables ── */
  const v = out.v;
  const likesMot = await lit(vue(V, SEL.LIKES));
  v.likes = likesMot === null ? null : motAdr(likesMot);
  v.likesOk = v.likes !== null && v.likes === adr(EP.HEARTS);
  const L = v.likesOk ? v.likes : null; /* a vault naming another clock than the pack's hearts: no week is read on a guess */
  const [semaine, longueur, claimWindow, minCommit] = await Promise.all([L ? lit(vue(L, SEL.currentEpoch)) : null, L ? lit(vue(L, SEL.EPOCH)) : null,
    lit(EP.VIEW.claimWindow()), lit(EP.VIEW.minCommit())]);
  Object.assign(v, { semaine, longueur, claimWindow, minCommit });
  [v.fin, v.fin0, v.need] = await Promise.all([L && semaine !== null ? lit(vue(L, SEL.epochEnd, EP.wUint(semaine))) : null, L ? lit(vue(L, SEL.epochEnd, EP.wUint(0))) : null,
    semaine !== null ? lit(EP.VIEW.needFor(semaine)) : null]);
  const regles = {};
  for (const k of EP.REGLES_VAULT) regles[k] = await lit(EP.VIEW.regleVault(k));
  v.regles = EP.REGLES_VAULT.every((k) => typeof regles[k] === 'bigint') ? regles : null;
  if (L && semaine !== null && w) {
    for (let k = semaine - 1n; k >= 0n && k >= semaine - BigInt(SEMAINES_MAX); k--) {
      const [ep, owed, claimed, jeu, need, fin] = await Promise.all([brut(EP.VIEW.epochs(k)), lit2(EP.VIEW.owed(k, w)), lit(EP.VIEW.claimed(k, w)),
        lit(EP.VIEW.playOf(k, w)), lit(EP.VIEW.needFor(k)), lit(vue(L, SEL.epochEnd, EP.wUint(k)))]);
      let epoque = null; try { epoque = ep === null ? null : EP.decoderEpoque(ep); } catch (_) { epoque = null; }
      v.semaines.push({ e: k, fin, epoque, owed: owed ? { share: owed[0], bonus: owed[1] } : null, claimed: claimed === null ? null : claimed !== 0n, jeu, need });
    }
  }

  /* ── this wallet: its lock (the value the contracts count: activeLockedOf), its factor and its play of the week ── */
  if (w) {
    const [locked, unlockAt, facteur, jeuSemaine] = await Promise.all([lit(LK.VIEW.activeLockedOf(w)), lit(LK.VIEW.unlockAtOf(w)), lit(EP.VIEW.lockFactor(w)),
      semaine !== null ? lit(EP.VIEW.playOf(semaine, w)) : null]);
    Object.assign(out.moi, { locked, unlockAt, facteur, jeuSemaine });
  }

  /* ── R: the monthly lock rewards ── */
  const r = out.r;
  const [rt, rw] = await Promise.all([lit(vue(R, SEL.TBLOCK)), lit(vue(R, SEL.WTCOIN))]);
  r.tokensOk = rt !== null && rw !== null && motAdr(rt) === TBLOCK && motAdr(rw) === WTCOIN;
  const [courant, prochain, aLiberer, fenetre, mois, rewardBps] = await Promise.all([lit(EP.VIEW.rCurrentEpoch()), lit(EP.VIEW.nextEpochToClose()), lit(EP.VIEW.nextEpochToRelease()),
    lit(vue(R, SEL.CLAIM_WINDOW)), lit(vue(R, SEL.EPOCH)), lit(vue(R, SEL.REWARD_BPS))]);
  Object.assign(r, { courant, prochain, aLiberer, fenetre, longueur: mois, rewardBps });
  [r.fin, r.fin0, r.finProchain] = await Promise.all([courant !== null ? lit(EP.VIEW.rEpochEnd(courant)) : null, lit(EP.VIEW.rEpochEnd(0)),
    prochain !== null ? lit(EP.VIEW.rEpochEnd(prochain)) : null]);
  const bandes = await Promise.all(BANDES_JOURS.map((j) => lit(vue(R, SEL.multiplierBps, EP.wUint(BigInt(j) * 86400n)))));
  r.bandes = bandes.every((b) => b !== null) ? BANDES_JOURS.map((j, i) => ({ jours: j, bps: bandes[i] })) : null;
  if (w) {
    const [joue, poids] = await Promise.all([courant !== null ? lit(EP.VIEW.hasPlayed(w, courant)) : null, courant !== null ? lit(EP.VIEW.weightOf(w, courant)) : null]);
    r.joue = joue === null ? null : joue !== 0n; r.poids = poids;
    const u = out.moi.unlockAt;
    if (u !== null && u !== undefined && u > 0n) { const h = await brut(EP.VIEW.rewardEpochsFor(u)); try { r.gains = h === null ? null : EP.decoderMois(h); } catch (_) { r.gains = null; } } else r.gains = u === 0n ? { premier: 0, dernier: 0, n: 0 } : null;
    /* review 2026-11-12: rewardEpochsFor is the months a lock with that DATE would cover, whoever holds it; only the weight R recorded
     *   (weightOf, written by enroll) says this wallet will be paid for them. A lock never enrolled has 0 there and claim() refuses NoWeight. */
    if (r.gains && r.gains.n > 0) [r.finPremierGain, r.poidsPremierGain] = await Promise.all([lit(EP.VIEW.rEpochEnd(r.gains.premier)), lit(EP.VIEW.weightOf(w, BigInt(r.gains.premier)))]);
    if (r.tokensOk && prochain !== null && aLiberer !== null) {
      for (let k = prochain - 1n; k >= aLiberer && k >= 0n && r.mois.length < MOIS_MAX; k--) {
        const [ferme, q, claimed, played, poidsK, finK] = await Promise.all([lit(vue(R, SEL.closedAt, EP.wUint(k))), lit2(EP.VIEW.claimable(w, [k])), lit(EP.VIEW.rewardsClaimed(w, k)),
          lit(EP.VIEW.hasPlayed(w, k)), lit(EP.VIEW.weightOf(w, k)), lit(EP.VIEW.rEpochEnd(k))]);
        r.mois.push({ k, fin: finK, closedAt: ferme, claimable: q ? { wtcoin: q[0], tblock: q[1] } : null, claimed: claimed === null ? null : claimed !== 0n,
          played: played === null ? null : played !== 0n, poids: poidsK });
      }
    }
  }
  return out;
}

/* ═══════════════ deciding ═══════════════ */
/** the state of one past week of the vault for the wallet read. cle: NON_LU | A_FERMER | EN_COURS | RECLAMEE | FENETRE_FINIE | A_RECLAMER |
 *  LOCK_REQUIS | PAS_JOUE | RIEN. finFenetre = closedAt + CLAIM_WINDOW (the contract refuses a claim at or after it). */
export function etatSemaine(s, L) {
  const t = BigInt(Math.floor(Number(L.maintenant))), v = L.v, moi = L.moi || {};
  const out = (cle, texte, extra = {}) => ({ cle, texte, e: s.e, ...extra });
  if (!s.epoque) return out('NON_LU', 'week ' + s.e + ': ' + NON_LU);
  if (!s.epoque.closed) {
    if (s.fin === null) return out('NON_LU', 'week ' + s.e + ': its end was ' + NON_LU);
    if (t < s.fin) return out('EN_COURS', 'week ' + s.e + ' ends ' + minute(s.fin));
    return out('A_FERMER', 'week ' + s.e + ' ended ' + minute(s.fin) + ' and is not closed yet: anyone can close it, then each player claims');
  }
  const finFenetre = v.claimWindow === null ? null : BigInt(s.epoque.closedAt) + v.claimWindow;
  const x = { finFenetre };
  if (s.claimed === null) return out('NON_LU', 'whether this wallet claimed week ' + s.e + ': ' + NON_LU, x);
  if (s.claimed) return out('RECLAMEE', 'this wallet already claimed week ' + s.e, x);
  if (finFenetre === null) return out('NON_LU', 'the claim window of week ' + s.e + ': ' + NON_LU, x);
  if (t >= finFenetre) return out('FENETRE_FINIE', 'the claim window of week ' + s.e + ' ended ' + minute(finFenetre), x);
  if (!s.owed) return out('NON_LU', 'what week ' + s.e + ' owes this wallet: ' + NON_LU, x);
  const total = s.owed.share + s.owed.bonus;
  const court = (moi.locked === null || moi.locked === undefined || s.need === null || moi.unlockAt === null || moi.unlockAt === undefined || v.minCommit === null) ? null
    : EP.claimCheck({ locked: moi.locked, need: s.need, unlockAt: moi.unlockAt, minCommit: v.minCommit, maintenantSec: Number(t), owed: 1n });
  if (total === 0n) {
    if (s.jeu === 0n) return out('PAS_JOUE', 'this wallet did not play in week ' + s.e, x);
    if (court && !court.ok) return out('LOCK_REQUIS', 'week ' + s.e + ': ' + court.why, x);
    if (s.jeu === null) return out('NON_LU', 'the play of this wallet in week ' + s.e + ': ' + NON_LU, x);
    return out('RIEN', 'week ' + s.e + ' owes this wallet nothing (its budget was ' + montant(s.epoque.budget) + ')', x);
  }
  if (court === null) return out('NON_LU', 'the lock of this wallet: ' + NON_LU, x);
  if (!court.ok) return out('LOCK_REQUIS', 'week ' + s.e + ' owes ' + montant(total) + ', but ' + court.why, x);
  const reste = s.epoque.budget - s.epoque.paid;
  const attendu = total < reste ? total : reste;
  return out('A_RECLAMER', 'week ' + s.e + ': ' + montant(attendu) + ' to claim before ' + minute(finFenetre), { ...x, attendu, share: s.owed.share, bonus: s.owed.bonus });
}

/** the state of one closed month of the lock rewards. cle: NON_LU | RECLAMEE | PAS_COUVERT | PAS_JOUE | A_RECLAMER | RIEN.
 *  finFenetre = closedAt + CLAIM_WINDOW × EPOCH (after it, release() may sweep the month) */
export function etatMois(m, L) {
  const r = L.r;
  const out = (cle, texte, extra = {}) => ({ cle, texte, k: m.k, ...extra });
  const finFenetre = m.closedAt === null || r.fenetre === null || r.longueur === null ? null : m.closedAt + r.fenetre * r.longueur;
  const x = { finFenetre };
  if (m.claimed === null) return out('NON_LU', 'month ' + m.k + ': ' + NON_LU, x);
  if (m.claimed) return out('RECLAMEE', 'this wallet already claimed month ' + m.k, x);
  if (m.poids === 0n) return out('PAS_COUVERT', 'this lock did not cover month ' + m.k, x);
  if (m.played === false) return out('PAS_JOUE', 'this wallet did not play in month ' + m.k, x);
  if (!m.claimable || m.poids === null || m.played === null) return out('NON_LU', 'what month ' + m.k + ' owes this wallet: ' + NON_LU, x);
  const { wtcoin, tblock } = m.claimable;
  if (wtcoin === 0n && tblock === 0n) return out('RIEN', 'month ' + m.k + ' owes this wallet nothing', x);
  return out('A_RECLAMER', 'month ' + m.k + ': ' + montant(tblock) + ' + ' + montant(wtcoin, 'wtCOIN', 6) + (finFenetre === null ? '' : ' to claim before ' + minute(finFenetre)),
    { ...x, wtcoin, tblock });
}

const refus = (why) => ({ ok: false, why });
/** the connected account must be the wallet this page READ: a page read for one wallet never signs for another */
function memeWallet(L, compte) {
  if (!compte) return refus('connect a wallet first');
  if (!L || !L.wallet) return refus('this page has not read a wallet yet');
  if (bas(compte) !== L.wallet) return refus('your wallet is now ' + displayShort(bas(compte)) + ', this page read ' + displayShort(L.wallet) + ': reading again for your wallet, nothing was sent');
  return null;
}
/** the claim of week e by `compte`, or a refusal in words. { ok, type, e, appel, attendu } */
export function planClaimSemaine(L, e, compte) {
  const no = memeWallet(L, compte); if (no) return no;
  const s = L.v.semaines.find((x) => x.e === BigInt(e));
  if (!s) return refus('week ' + e + ' was not read');
  const st = etatSemaine(s, L);
  if (st.cle !== 'A_RECLAMER') return refus(st.texte);
  return { ok: true, type: 'semaine', e: s.e, appel: claimSemaineCall(s.e), attendu: st.attendu, wallet: L.wallet };
}
/** ONE claim of every closed month that owes this wallet something (1..24), or a refusal. { ok, type, mois, appel, attendu: {wtcoin, tblock} } */
export function planClaimMois(L, compte) {
  const no = memeWallet(L, compte); if (no) return no;
  if (!L.r.tokensOk) return refus('the reward tokens of the lock rewards were ' + NON_LU);
  const bons = L.r.mois.map((m) => etatMois(m, L)).filter((x) => x.cle === 'A_RECLAMER').slice(0, MOIS_MAX);
  if (!bons.length) return refus('no closed month owes this wallet anything');
  const mois = bons.map((x) => x.k).sort((a, b) => (a < b ? -1 : 1));
  const attendu = { wtcoin: bons.reduce((s, x) => s + x.wtcoin, 0n), tblock: bons.reduce((s, x) => s + x.tblock, 0n) };
  return { ok: true, type: 'mois', mois, appel: claimMoisCall(mois), attendu, wallet: L.wallet };
}
/** closing an ended week of V (anyone) — offered only when it ended and is not closed */
export function planCloseSemaine(L, e, compte) {
  const no = memeWallet(L, compte); if (no) return no;
  const s = L.v.semaines.find((x) => x.e === BigInt(e));
  if (!s) return refus('week ' + e + ' was not read');
  if (etatSemaine(s, L).cle !== 'A_FERMER') return refus('week ' + e + ' cannot be closed now');
  return { ok: true, type: 'fermeSemaine', e: s.e, appel: closeSemaineCall(s.e), wallet: L.wallet };
}
/** closing the next month of R (anyone, in order) — offered only once it ended */
export function planCloseMois(L, compte) {
  const no = memeWallet(L, compte); if (no) return no;
  const r = L.r;
  if (r.prochain === null || r.finProchain === null) return refus('the next month to close was ' + NON_LU);
  if (BigInt(Math.floor(L.maintenant)) < r.finProchain) return refus('month ' + r.prochain + ' ends ' + minute(r.finProchain));
  return { ok: true, type: 'fermeMois', k: r.prochain, appel: closeMoisCall(r.prochain), wallet: L.wallet };
}

/* ═══════════════ before the wallet: simulate FROM the wallet ═══════════════ */
/** eth_call of the plan's call from the wallet at the latest block. { ok, retour, why }. For a claim, `retour` is what the contract
 *  would pay now (V: paid; R: [wtcoin, tblock]) and a claim that would pay nothing is refused. */
export async function simuler(rpc, plan) {
  let h;
  try { h = await rpc('eth_call', [{ from: plan.wallet, to: plan.appel.to, data: plan.appel.data, value: '0x0' }, 'latest']); }
  catch (x) {
    const t = texteRevert((x && x.data) || '') || texteRevert((x && x.message) || '');
    return { ok: false, why: 'the call reverts when simulated from your wallet: ' + (t || String((x && x.message) || x).slice(0, 140)) };
  }
  try {
    if (plan.type === 'semaine') { const p = EP.word(h, 0); return p > 0n ? { ok: true, retour: p } : { ok: false, why: 'the simulation pays nothing' }; }
    if (plan.type === 'mois') { const a = EP.word(h, 0), b = EP.word(h, 1); return a + b > 0n ? { ok: true, retour: { wtcoin: a, tblock: b } } : { ok: false, why: 'the simulation pays nothing' }; }
    return { ok: true, retour: null };
  } catch (_) { return { ok: false, why: 'the simulation answered another shape' }; }
}

/* ═══════════════ after the receipt ═══════════════ */
const motTopic = (t) => { try { return motAdr(t); } catch (_) { return null; } };
const logs = (recu) => (recu && Array.isArray(recu.logs) ? recu.logs : []);
/** the Transfer logs EMITTED BY `jeton` in this receipt (an event from another emitter is never trusted) */
export function transferts(recu, jeton) {
  return logs(recu).filter((l) => bas(l.address) === jeton && Array.isArray(l.topics) && l.topics.length === 3 && bas(l.topics[0]) === TOPIC.Transfer)
    .map((l) => { let value = null; try { value = EP.word(l.data); } catch (_) { value = null; } return { from: motTopic(l.topics[1]), to: motTopic(l.topics[2]), value }; });
}
/** who signed: the wallet itself (tx.from), or the wallet as a smart account (a SUCCESSFUL UserOperationEvent EMITTED BY AN ENTRYPOINT in
 *  this receipt whose sender is the wallet). null = neither. */
export function signataire(wallet, tx, recu) {
  if (tx && bas(tx.from) === wallet) return 'wallet';
  for (const l of logs(recu)) {
    if (!Array.isArray(l.topics) || bas(l.topics[0]) !== TOPIC.UserOp || l.topics.length < 3 || !ENTRY_POINTS.includes(bas(l.address))) continue;
    if (motTopic(l.topics[2]) !== wallet) continue;
    let ok = false; try { ok = EP.word(l.data, 1) === 1n; } catch (_) { ok = false; }
    if (ok) return 'smart account';
  }
  return null;
}
/** the receipt of a plan, judged. { ok, ko: [..], paye, signe } — paye = what really arrived (V: TBLOCK; R: {wtcoin, tblock}) */
export function verifierRecu(plan, tx, recu, simule = null) {
  const ko = [], w = plan.wallet;
  if (!tx) ko.push('the transaction was ' + NON_LU);
  if (!recu) ko.push('the receipt was ' + NON_LU);
  if (ko.length) return { ok: false, ko };
  if (tx.hash && recu.transactionHash && bas(tx.hash) !== bas(recu.transactionHash)) ko.push('the receipt is for another transaction');
  if (bas(recu.status) !== '0x1') ko.push('the transaction failed on Base (status ' + recu.status + ')');
  const signe = signataire(w, tx, recu);
  if (!signe) ko.push('signed by ' + bas(tx.from) + ', not by this wallet');
  if (signe === 'wallet') {
    if (bas(tx.to) !== bas(plan.appel.to)) ko.push('sent to ' + bas(tx.to) + ', not to the contract offered');
    else if (bas(tx.input || tx.data) !== bas(plan.appel.data)) ko.push('the signed data is not the offered call');
    if (BigInt(tx.value || 0) !== 0n) ko.push('the transaction carried ETH');
  }
  if (ko.length) return { ok: false, ko, signe };
  const de = (emetteur, t0) => logs(recu).filter((l) => bas(l.address) === emetteur && Array.isArray(l.topics) && bas(l.topics[0]) === t0);
  if (plan.type === 'semaine') {
    const c = de(V, TOPIC.ClaimedV).filter((l) => l.topics.length === 3 && BigInt(l.topics[1]) === plan.e && motTopic(l.topics[2]) === w);
    if (c.length !== 1) { ko.push('no claim of week ' + plan.e + ' by this wallet in the receipt'); return { ok: false, ko, signe }; }
    const du = EP.word(c[0].data, 0) + EP.word(c[0].data, 1);
    const t = transferts(recu, TBLOCK).filter((x) => x.from === V);
    if (t.length !== 1 || t[0].to !== w) ko.push('expected one TBLOCK transfer from the holders vault to this wallet, saw ' + t.length);
    else if (t[0].value !== du) ko.push('the holders vault paid ' + montant(t[0].value) + ', the contract owed ' + montant(du));
    const paye = t.length === 1 && t[0].to === w ? t[0].value : null;
    return { ok: !ko.length, ko, signe, paye, du, simule };
  }
  if (plan.type === 'mois') {
    const c = de(R, TOPIC.ClaimedR).filter((l) => l.topics.length === 2 && motTopic(l.topics[1]) === w);
    if (c.length !== 1) { ko.push('no claim of the lock rewards by this wallet in the receipt'); return { ok: false, ko, signe }; }
    const dw = EP.word(c[0].data, 0), dt = EP.word(c[0].data, 1), n = EP.word(c[0].data, 2);
    if (n !== BigInt(plan.mois.length)) ko.push('the receipt claimed ' + n + ' months, ' + plan.mois.length + ' were offered');
    const paye = {};
    for (const [jeton, du, cle, unite] of [[TBLOCK, dt, 'tblock', 'TBLOCK'], [WTCOIN, dw, 'wtcoin', 'wtCOIN']]) {
      const t = transferts(recu, jeton).filter((x) => x.from === R);
      if (du === 0n) { if (t.length) ko.push('the lock rewards moved ' + unite + ' it did not owe'); paye[cle] = 0n; continue; }
      if (t.length !== 1 || t[0].to !== w) { ko.push('expected one ' + unite + ' transfer from the lock rewards to this wallet, saw ' + t.length); continue; }
      if (t[0].value !== du) ko.push('the lock rewards paid ' + montant(t[0].value, unite) + ', the contract owed ' + montant(du, unite));
      paye[cle] = t[0].value;
    }
    return { ok: !ko.length, ko, signe, paye, du: { wtcoin: dw, tblock: dt }, simule };
  }
  /* a close: the EpochClosed event of THAT contract for THAT period */
  const [emetteur, t0, k] = plan.type === 'fermeSemaine' ? [V, TOPIC.EpochClosedV, plan.e] : [R, TOPIC.EpochClosedR, plan.k];
  if (de(emetteur, t0).filter((l) => l.topics.length >= 2 && BigInt(l.topics[1]) === BigInt(k)).length !== 1) ko.push('the receipt does not close period ' + k);
  return { ok: !ko.length, ko, signe };
}

/** the whole path of one plan, with every dependency injected (the page passes the public-node rpc, window.ethereum and envoi.js):
 *  1. the wallet's account and network are read again: another account or another network = refused, the wallet never opens;
 *  2. the call is simulated FROM the wallet (eth_call): a revert = refused, the wallet never opens;
 *  3. envoyer(appel) opens the wallet (it returns { etat, hash, pourquoi });
 *  4. the transaction and its receipt are read and judged (verifierRecu).
 *  { etape: 'REFUS' | 'SIMULATION' | 'ENVOI' | 'RECU', ok, why, sim, envoi, verdict, hash } */
export async function executerClaim({ rpc, eth, plan, envoyer, essais = 20, pause = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!plan || !plan.ok) return { etape: 'REFUS', ok: false, why: (plan && plan.why) || 'nothing to send' };
  if (!eth || typeof eth.request !== 'function') return { etape: 'REFUS', ok: false, why: 'no wallet found in this browser' };
  let compte = null, chaine = null;
  try { const a = await eth.request({ method: 'eth_accounts' }); compte = a && a[0] ? bas(a[0]) : null; } catch (_) { compte = null; }
  if (compte !== plan.wallet) return { etape: 'REFUS', ok: false, why: compte ? 'your wallet account changed: this claim was read for ' + displayShort(plan.wallet) + ', nothing was sent' : 'your wallet account was ' + NON_LU + ', nothing was sent' };
  try { chaine = BigInt(await eth.request({ method: 'eth_chainId' })); } catch (_) { chaine = null; }
  if (chaine !== BigInt(CHAINE)) return { etape: 'REFUS', ok: false, why: 'your wallet is not on Base: switch it to Base, nothing was sent' };
  const sim = await simuler(rpc, plan);
  if (!sim.ok) return { etape: 'SIMULATION', ok: false, why: sim.why, sim };
  let envoi;
  try { envoi = await envoyer(plan.appel); } catch (x) { envoi = { etat: 'ECHEC_ENVOI', pourquoi: String((x && x.message) || x) }; }
  if (!envoi || envoi.etat !== 'CONFIRME' || !envoi.hash) return { etape: 'ENVOI', ok: false, sim, envoi, hash: envoi && envoi.hash, why: (envoi && (envoi.pourquoi || envoi.etat)) || 'no answer' };
  let tx = null, recu = null;
  for (let i = 0; i < essais && !(tx && recu); i++) {
    try { tx = tx || await rpc('eth_getTransactionByHash', [envoi.hash]); } catch (_) { /* read again */ }
    try { recu = recu || await rpc('eth_getTransactionReceipt', [envoi.hash]); } catch (_) { /* read again */ }
    if (!(tx && recu)) await pause(1500);
  }
  const verdict = verifierRecu(plan, tx, recu, sim.retour);
  return { etape: 'RECU', ok: verdict.ok, sim, envoi, verdict, hash: envoi.hash, why: verdict.ok ? '' : verdict.ko.join('; ') };
}

/* ═══════════════ the words of the page ═══════════════ */
/** what was paid, said after a checked receipt */
export function texteVerdict(plan, res) {
  if (!res.ok) return null;
  const v = res.verdict;
  const sig = v.signe === 'smart account' ? ' (signed by your smart account)' : '';
  if (plan.type === 'semaine') {
    const ecart = typeof v.simule === 'bigint' && v.simule !== v.paye ? ' The simulation showed ' + montant(v.simule) + ' a moment before: the lock time bonus is read at the block.' : '';
    return 'Claimed on Base' + sig + ': ' + montant(v.paye) + ' from the holders vault to your wallet, exactly what the contract owed for week ' + plan.e + '.' + ecart;
  }
  if (plan.type === 'mois') return 'Claimed on Base' + sig + ': ' + montant(v.paye.tblock) + ' and ' + montant(v.paye.wtcoin, 'wtCOIN', 6) + ' from the lock rewards to your wallet, exactly what the contract owed for month' + (plan.mois.length === 1 ? ' ' : 's ') + plan.mois.join(', ') + '.';
  return 'Closed on Base' + sig + '.';
}
/** the months this lock earns, said only from the weight R RECORDED for the first of them (review 2026-11-12: a lock that never joined
 *  the monthly rewards earns nothing, whatever its date covers) */
function texteGains(r) {
  const g = r.gains, mois = g.n === 1 ? 'month ' + g.premier : 'months ' + g.premier + ' to ' + g.dernier;
  if (r.poidsPremierGain === null || r.poidsPremierGain === undefined) return ' Whether your lock counts for ' + mois + ': ' + NON_LU + '.';
  if (r.poidsPremierGain === 0n) return ' Your lock covers ' + mois + ' but has not joined the monthly lock rewards: join them from your lock card in the app (one signature) to earn ' + (g.n === 1 ? 'it' : 'them') + '.';
  return (g.n === 1 ? ' Your lock earns month ' + g.premier + ', which ends ' : ' Your lock earns months ' + g.premier + ' to ' + g.dernier + '; the first ends ')
    + minute(r.finPremierGain) + ': play in it to be paid for it.';
}
/** "the first claim opens..." — said when nothing is claimable yet, from the clocks READ (V's LIKES.epochEnd, R.epochEnd) */
export function premiereOuverture(L) {
  const v = L.v, r = L.r, t = BigInt(Math.floor(L.maintenant));
  const out = [];
  const fenetre = v.claimWindow === null ? NON_LU : jours(v.claimWindow) + ' days';
  if (v.semaine === null || v.fin0 === null) out.push('Holders vault: the end of week 0 was ' + NON_LU + '.');
  else if (v.semaine === 0n && t < v.fin0) out.push('Holders vault: week 0 closes ' + minute(v.fin0) + '. The first weekly claim opens as soon as it is closed (anyone can close it from that minute), then ' + fenetre + ' to claim.');
  else if (v.fin !== null) out.push('Holders vault: week ' + v.semaine + ' closes ' + minute(v.fin) + '; its claim opens once it is closed, then ' + fenetre + ' to claim.');
  if (r.fin0 === null || r.courant === null) out.push('Monthly lock rewards: the end of month 0 was ' + NON_LU + '.');
  else if (r.prochain === 0n) out.push('Monthly lock rewards: month 0 ends ' + minute(r.fin0) + '. The first monthly claim opens once it is closed, for the holders whose lock covered it and who played in it.'
    + (r.gains && r.gains.n > 0 && r.finPremierGain ? texteGains(r) : ''));
  else if (r.finProchain !== null) out.push('Monthly lock rewards: month ' + r.prochain + ' ends ' + minute(r.finProchain) + '.');
  return out;
}
/** the "this wallet now" lines: [label, value]; a value not read says so */
export function lignesMoi(L) {
  const v = L.v, moi = L.moi || {}, r = L.r;
  const l = [];
  l.push(['This week', v.semaine === null ? NON_LU : 'week ' + v.semaine + ', closes ' + minute(v.fin)]);
  if (!L.wallet) return l;
  l.push(['Your play this week', moi.jeuSemaine === null || moi.jeuSemaine === undefined ? NON_LU : montant(moi.jeuSemaine) + (moi.jeuSemaine === 0n ? ' (play to be paid: a heart, a TAM art mint or a skin mint)' : '')]);
  l.push(['Your lock factor now', moi.facteur === null || moi.facteur === undefined ? NON_LU : EP.texteFacteur(moi.facteur)]);
  l.push(['Your lock', moi.locked === null || moi.locked === undefined ? NON_LU : montant(moi.locked, 'TBLOCK', 0) + (moi.locked > 0n ? ' until ' + jourTexte(moi.unlockAt) : '')
    + (typeof v.need === 'bigint' ? ' · a claim needs ' + montant(v.need, 'TBLOCK', 0) : '')]);
  l.push(['This month', r.courant === null ? NON_LU : 'month ' + r.courant + ', ends ' + minute(r.fin) + (r.joue === null || r.joue === undefined ? '' : r.joue ? ' · you played this month' : r.poids === 0n ? ' · your lock does not count for this month' : ' · not played yet this month')]);
  const g = r.gains, nomMois = g && g.n > 0 ? (g.n === 1 ? 'month ' + g.premier : 'months ' + g.premier + ' to ' + g.dernier) : '';
  l.push(['Months your lock earns', !g ? NON_LU : g.n > 0 ? (r.poidsPremierGain === null || r.poidsPremierGain === undefined ? NON_LU
    : r.poidsPremierGain === 0n ? 'none yet: your lock covers ' + nomMois + ' but has not joined the monthly lock rewards' : nomMois) : 'none (a lock must cover a whole month after this one)']);
  return l;
}
/** the arguments of holders-vue.js etapesPaiement (the three steps of a weekly payment), or null when the week's clock was not read.
 *  The wallet's ticks are given ONLY when its lock, its date and its play were all read: etapesPaiement reads a missing value as 0, and a
 *  value not read must never become "you have 0 locked". */
export function argsEtapes(L) {
  const v = L.v, moi = L.moi || {};
  const lu = (x) => typeof x === 'bigint';
  if (!lu(v.semaine) || !lu(v.fin) || !lu(v.need)) return null;
  const avecWallet = !!L.wallet && lu(moi.locked) && lu(moi.unlockAt) && lu(moi.jeuSemaine);
  return { wallet: avecWallet ? L.wallet : null, locked: avecWallet ? moi.locked : 0n, need: v.need, unlockAt: avecWallet ? moi.unlockAt : 0n,
    minCommit: lu(v.minCommit) ? v.minCommit : null, maintenant: L.maintenant, mien: avecWallet ? moi.jeuSemaine : 0n, finSemaine: v.fin, semaineNo: v.semaine,
    accesUsd: v.regles ? v.regles.ACCESS_USD : null, fmt: EP.fmt, fenetreJours: lu(v.claimWindow) ? jours(v.claimWindow) : null, complet: avecWallet };
}
/** the monthly rewards' rules in words, from the values READ on R; null when any is missing (no sentence on a guess) */
export function texteRegleMois(r) {
  if (r.rewardBps === null || r.fenetre === null || r.longueur === null || !r.bandes) return null;
  const x = (bps) => '×' + (Number(bps) / 10000).toString();
  const b = r.bandes;
  return 'Each month (' + jours(r.longueur) + ' days) the lock rewards set aside up to ' + (Number(r.rewardBps) / 100) + '% of the wtCOIN and TBLOCK they hold for the lockers. '
    + 'A month pays the holders whose lock covers the WHOLE month and who played in it (a heart, a TAM art mint or a skin mint); a locker who did not play leaves their part for the next months. '
    + 'Your weight is what you lock times your commitment: ' + b.map((y) => x(y.bps) + (y.jours ? ' from ' + y.jours + ' days' : ' under ' + b[1].jours + ' days')).join(', ') + '. '
    + 'Claim within ' + r.fenetre + ' months after a month is closed. No rate is promised.';
}
