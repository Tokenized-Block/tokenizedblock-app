/* move-first-vault.js — move every TBLOCK of the FIRST holders vault (TBlockVault, economie.js VAULT) and of the TBLOCK buyback that
 *   pays into it (economie-deploiement.js adresseBuyback, DEST = that vault) into the LIVE holders vault V (economie-v2-pack-deploye.js,
 *   letter V). Phil 2026-11-12. Pure: no DOM, no wallet; every read goes through an injected rpc(method, params).
 * ⛔ NOTHING HERE SIGNS OR SENDS. It reads the chain, builds UNSIGNED calls for the person's own wallet, and judges the receipts.
 * ⛔ NO ADDRESS IS TYPED HERE: the first vault and TBLOCK come from economie.js, the buyback from economie-deploiement.js, V from the
 *   deployment record of the pack, the two dev wallets from the first vault's deploy record AND are read on chain (DEV(), DEV2()); any
 *   difference between a record and the chain = nothing is offered.
 *
 * THE ONLY PATH (contracts/src/TBlockVault.sol, contracts/src/buyback/TBlockBuybackV2.sol; no other withdrawal exists):
 *   1. anyone calls buyback.sweepToDest(): every TBLOCK the buyback holds goes to its DEST, the first vault;
 *   2. DEV or DEV2 calls firstVault.announceRescue(amount): a public notice on chain (RescueAnnounced), RESCUE_DELAY = 7 days;
 *   3. in [rescueAt, rescueAt + RESCUE_WINDOW (2 days)] ONLY the announcer calls rescue(): it pays min(amount, free()) TO THE ANNOUNCER;
 *      the announcer then sends exactly that amount to V with a plain TBLOCK.transfer. V counts it as free TBLOCK
 *      (TBlockVaultV2.free() = balance - reserved; checked before step 3 on a simulation: V.free() before/after).
 *
 * THE AMOUNT (decided 2026-11-12 from the source, every figure below read on Base that day):
 *   - rescue() pays min(rescueAmount, free()) AT EXECUTION and reverts only if that is 0 (NoRescue). The announced amount is a ceiling.
 *   - What can LOWER free() during the 7 days, without any dev:
 *     (a) feedContest(): ANYONE, at most once per FEED_COOLDOWN (1 day), moves min(free, MAX_FEED_PER_CALL = 862,000 TBLOCK,
 *         contest.fundRoom(round)) to the block contest's current round. Read 2026-11-12: lastFeedAt = 0, fundRoom(0) = 862,000 TBLOCK, and
 *         feedContest() simulated from a random address SUCCEEDS: one public call today moves ALL the free TBLOCK of the first vault to
 *         the contest pot (paid to contest winners by its fixed rules, not to the holders vault). No page and no keeper of this tree calls
 *         it, but nothing on chain stops a stranger. This is the main risk of the 7 days; the reader shows it (`menaces`).
 *     (b) closeEpoch(e): ANYONE, once week e of the FIRST BlockLikes has ended, reserves min(free x 50%, 50,000,000, totalSpentIn(e)):
 *         at most the TBLOCK burned in hearts on that OLD BlockLikes that week. Week 0 ends 2026-11-18 00:00 UTC with 0 spent so far
 *         (the app now sends hearts to the pack's BlockLikes; a direct like() on the old one is still possible). A reserved part comes
 *         back to free by release(e) 14 days after the close, minus claims.
 *     Claims do not change free() (balance and reserved fall together); release() raises it.
 *   - What can RAISE free(): any TBLOCK sent to the first vault (a new ETH funding of the old buyback then buyback(); a stray transfer).
 *   - DECISION: announce A = free() read right before the announcement, AFTER the sweep (step 2 is not offered while the buyback still
 *     holds TBLOCK). Not a bigger number: the notice on chain (amount and freeNow in the event) must say what is really there. If free()
 *     falls before step 3, rescue pays less and the rest stays (moved by a new round once it is free again); if free() rises, the excess
 *     stays (a new round: sweep if needed, announce, 7 days). The reader shows what is left after step 3.
 *   - announceRescue() OVERWRITES a pending announcement and restarts the 7 days: step 2 is never offered while one is pending and not
 *     expired. The other dev wallet can cancelRescue() or overwrite with its own announcement (then only it could execute). Either dev can
 *     renounceRescue() for both, for good: after that this path is closed forever. This page never builds those calls.
 *   - STEP 3 amount P = min(rescueAmount, free()) read right before. ONE wallet_sendCalls batch [rescue(), TBLOCK.transfer(V, P)] with
 *     atomicRequired, offered ONLY when the wallet reports atomic batches on Base AND no public call can lower free() right now (feedContest()
 *     and every closable week simulate as reverting). Why: the announcer's wallet holds TBLOCK of its own (246,365 TBLOCK on 2026-11-12):
 *     if a feed landed first in the same block, rescue would pay less than P and the transfer would complete the difference from the
 *     wallet's OWN TBLOCK. Otherwise TWO transactions: rescue(), then transfer(V, exactly what the rescue receipt shows arriving).
 *
 * An event is not a transaction: every check after a receipt reads the transaction itself (tx.from = the signer), its status, and only
 * the logs EMITTED BY TBLOCK / the first vault / the buyback inside that receipt. */
import { selecteur, topic } from './keccak.js';
import { TBLOCK as TBLOCK_ECO, VAULT as VAULT_ECO } from './economie.js';
import { ECONOMIE_DEPLOIEMENT as D } from './economie-deploiement.js';
import { ADRESSES_PACK_ECONOMIE_V2 as A } from './economie-v2-pack-deploye.js';

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x == null ? '' : x).toLowerCase();
const adr = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('not an address: ' + x); return s; };
const strip = (h) => String(h).replace(/^0x/, '');
const wAddr = (a) => strip(adr(a)).padStart(64, '0');
const wUint = (x) => { const n = BigInt(x); if (n < 0n || n >= 1n << 256n) throw new Error('out of range'); return n.toString(16).padStart(64, '0'); };
const hex = (n) => '0x' + BigInt(n).toString(16);

export const CHAINE_HEX = '0x2105';
export const TBLOCK = adr(TBLOCK_ECO);
export const VAULT1 = adr(VAULT_ECO);
export const BUYBACK = adr(D.adresseBuyback);
export const V = adr(A.V);
/** the two dev wallets of the first vault, from its deploy record (checked against DEV() / DEV2() on chain before anything is offered) */
export const DEV_RECORD = adr(D.vault.config.dev);
export const DEV2_RECORD = adr(D.vault.config.dev2); /* Grok's wallet, the one Phil signs with */
export const RESCUE_DELAY = 7n * 86400n;
export const RESCUE_WINDOW = 2n * 86400n;
export const MARGE_FIN_S = 300n; /* step 3 is not offered in the last 5 minutes of the window: the transaction could land after it */
export const NEUTRE = '0x000000000000000000000000000000000000dead'; /* from-address of the threat simulations (anyone) */

export const SIG = Object.freeze({
  sweep: 'sweepToDest()', announce: 'announceRescue(uint256)', rescue: 'rescue()', transfer: 'transfer(address,uint256)',
  balanceOf: 'balanceOf(address)', free: 'free()', reserved: 'reserved()', TBLOCK: 'TBLOCK()', DEST: 'DEST()', DEV: 'DEV()', DEV2: 'DEV2()',
  rescueAmount: 'rescueAmount()', rescueAt: 'rescueAt()', rescueBy: 'rescueBy()', rescueRenounced: 'rescueRenounced()',
  RESCUE_DELAY: 'RESCUE_DELAY()', RESCUE_WINDOW: 'RESCUE_WINDOW()', closeCursor: 'closeCursor()', lastFeedAt: 'lastFeedAt()',
  MAX_FEED_PER_CALL: 'MAX_FEED_PER_CALL()', FEED_COOLDOWN: 'FEED_COOLDOWN()', LIKES: 'LIKES()', CONTEST: 'CONTEST()',
  feedContest: 'feedContest()', closeEpoch: 'closeEpoch(uint256)', epochs: 'epochs(uint256)', currentEpoch: 'currentEpoch()',
  epochEnd: 'epochEnd(uint256)', totalSpentIn: 'totalSpentIn(uint256)', currentRound: 'currentRound()', fundRoom: 'fundRoom(uint256)',
});
export const SEL = Object.freeze(Object.fromEntries(Object.entries(SIG).map(([k, s]) => [k, selecteur(s)])));
export const TOPIC = Object.freeze({
  Transfer: topic('Transfer(address,address,uint256)'), Swept: topic('Swept(uint256)'), Rescued: topic('Rescued(address,uint256)'),
  RescueAnnounced: topic('RescueAnnounced(address,uint256,uint256,uint256,uint256)'),
});

// ------------------------------------------------------------------ the unsigned calls

export const appelSweep = () => Object.freeze({ to: BUYBACK, data: SEL.sweep, value: '0x0' });
export function appelAnnonce(montant) {
  if (BigInt(montant) <= 0n) throw new Error('nothing to announce');
  return Object.freeze({ to: VAULT1, data: SEL.announce + wUint(montant), value: '0x0' });
}
export const appelRescue = () => Object.freeze({ to: VAULT1, data: SEL.rescue, value: '0x0' });
export function appelVersV(montant) {
  if (BigInt(montant) <= 0n) throw new Error('nothing to send');
  return Object.freeze({ to: TBLOCK, data: SEL.transfer + wAddr(V) + wUint(montant), value: '0x0' });
}

// ------------------------------------------------------------------ reading

export function word(h, i = 0) {
  const s = strip(String(h || ''));
  if (!/^[0-9a-f]*$/i.test(s) || s.length < 64 * (i + 1)) throw new Error('short answer');
  return BigInt('0x' + s.slice(64 * i, 64 * (i + 1)));
}
const motAdr = (h, i = 0) => { const n = word(h, i); if (n >> 160n) throw new Error('not an address word'); return '0x' + n.toString(16).padStart(40, '0'); };

/** every value the steps depend on, read at ONE pinned block. wallet (optional) = the connected account: its TBLOCK balance is read too. */
export async function lireEtat(rpc, wallet = null) {
  const chaine = bas(await rpc('eth_chainId', []));
  const b = await rpc('eth_getBlockByNumber', ['latest', false]);
  if (!b || !b.number || !b.timestamp) throw new Error('no latest block');
  const tag = bas(b.number);
  const c = (to, data, from) => rpc('eth_call', [from ? { from, to, data } : { to, data }, tag]);
  const u = async (to, data) => word(await c(to, data));
  const ad = async (to, data) => motAdr(await c(to, data));
  const bal = (who) => u(TBLOCK, SEL.balanceOf + wAddr(who));
  const [codeV1, codeBB, codeV] = await Promise.all([VAULT1, BUYBACK, V].map((a) => rpc('eth_getCode', [a, tag])));
  const e = { chaine, bloc: BigInt(tag), now: BigInt(b.timestamp), codes: { vault1: codeV1, buyback: codeBB, v: codeV } };
  e.vault1 = {
    tblock: await ad(VAULT1, SEL.TBLOCK), dev: await ad(VAULT1, SEL.DEV), dev2: await ad(VAULT1, SEL.DEV2),
    likes: await ad(VAULT1, SEL.LIKES), contest: await ad(VAULT1, SEL.CONTEST),
    balance: await bal(VAULT1), free: await u(VAULT1, SEL.free), reserved: await u(VAULT1, SEL.reserved),
    rescueAmount: await u(VAULT1, SEL.rescueAmount), rescueAt: await u(VAULT1, SEL.rescueAt), rescueBy: await ad(VAULT1, SEL.rescueBy),
    renounced: (await u(VAULT1, SEL.rescueRenounced)) !== 0n, delay: await u(VAULT1, SEL.RESCUE_DELAY), window: await u(VAULT1, SEL.RESCUE_WINDOW),
    closeCursor: await u(VAULT1, SEL.closeCursor), lastFeedAt: await u(VAULT1, SEL.lastFeedAt),
    feedMax: await u(VAULT1, SEL.MAX_FEED_PER_CALL), feedCooldown: await u(VAULT1, SEL.FEED_COOLDOWN),
  };
  e.buyback = { tblock: await ad(BUYBACK, SEL.TBLOCK), dest: await ad(BUYBACK, SEL.DEST), balance: await bal(BUYBACK) };
  e.v = { tblock: await ad(V, SEL.TBLOCK), balance: await bal(V), free: await u(V, SEL.free), reserved: await u(V, SEL.reserved) };
  e.wallet = wallet ? { adresse: adr(wallet), tblock: await bal(wallet) } : null;
  /* who could LOWER the first vault's free() right now, without any dev (see THE AMOUNT above) */
  e.menaces = [];
  try { const r = await c(VAULT1, SEL.feedContest, NEUTRE); const m = word(r); if (m > 0n) e.menaces.push({ quoi: 'feedContest', montant: m }); } catch (_) { /* reverts: cannot feed now */ }
  const L = e.vault1.likes;
  const cur = await u(L, SEL.currentEpoch);
  e.semaines = [];
  for (let k = e.vault1.closeCursor; k <= cur && k < e.vault1.closeCursor + 12n; k++) {
    const fin = await u(L, SEL.epochEnd + wUint(k));
    const depense = await u(L, SEL.totalSpentIn + wUint(k));
    const ferme = word(await c(VAULT1, SEL.epochs + wUint(k)), 3) !== 0n;
    e.semaines.push({ e: k, fin, depense, ferme });
    if (!ferme && depense > 0n && fin <= e.now) {
      try { const r = await c(VAULT1, SEL.closeEpoch + wUint(k), NEUTRE); const m = word(r); if (m > 0n) e.menaces.push({ quoi: 'closeEpoch', semaine: k, montant: m }); } catch (_) { /* reverts */ }
    }
  }
  e.semaineCourante = cur;
  try { const r = await u(e.vault1.contest, SEL.currentRound); e.contest = { round: r, room: await u(e.vault1.contest, SEL.fundRoom + wUint(r)) }; } catch (_) { e.contest = null; }
  return e;
}

/** [] when the records and the chain agree; otherwise the reasons (then nothing is offered) */
export function coherence(e) {
  const f = [];
  if (e.chaine !== CHAINE_HEX) f.push('the wallet is on another network (' + e.chaine + '): switch it to Base');
  if (!e.codes || [e.codes.vault1, e.codes.buyback, e.codes.v].some((x) => !x || x === '0x')) f.push('a contract has no code on this network');
  if (e.vault1.tblock !== TBLOCK || e.buyback.tblock !== TBLOCK || e.v.tblock !== TBLOCK) f.push('a contract names another TBLOCK');
  if (e.buyback.dest !== VAULT1) f.push('the buyback does not pay the first vault');
  if (e.vault1.dev !== DEV_RECORD || e.vault1.dev2 !== DEV2_RECORD) f.push('the first vault names other dev wallets than its record');
  if (e.vault1.delay !== RESCUE_DELAY || e.vault1.window !== RESCUE_WINDOW) f.push('the first vault has another rescue delay or window');
  if (V === VAULT1) f.push('the destination is the first vault itself');
  return f;
}

/** the announcement window, from the chain's own clock (latest block timestamp), never the computer's */
export function fenetre(e) {
  const a = e.vault1;
  if (a.rescueAmount === 0n) return { etat: 'aucune' };
  const ouvre = a.rescueAt, ferme = a.rescueAt + RESCUE_WINDOW;
  if (e.now < ouvre) return { etat: 'attente', ouvre, ferme, resteS: ouvre - e.now, par: a.rescueBy, montant: a.rescueAmount };
  if (e.now > ferme) return { etat: 'expiree', ouvre, ferme, resteS: 0n, par: a.rescueBy, montant: a.rescueAmount };
  return { etat: 'ouverte', ouvre, ferme, resteS: ferme - e.now, par: a.rescueBy, montant: a.rescueAmount };
}

export const estDev = (e, w) => !!w && (bas(w) === e.vault1.dev || bas(w) === e.vault1.dev2);
export const paiementPrevu = (e) => (e.vault1.rescueAmount < e.vault1.free ? e.vault1.rescueAmount : e.vault1.free);

/** pure: the three steps as the chain shows them, and what (if anything) this wallet may sign now.
 *  suivi = receipts already judged by this module: { rescue: { montant, hash } | null, versV: { montant, hash } | null }.
 *  opts.atomique = the wallet reported atomic batches on Base. */
export function etapes(e, wallet, suivi = {}, opts = {}) {
  const w = wallet ? bas(wallet) : null;
  const faux = coherence(e);
  const f = fenetre(e);
  /* a round already sent to the holders vault does not hide a NEW announcement (a later round for what was left) */
  if (suivi && suivi.versV && f.etat !== 'aucune') suivi = {};
  suivi = suivi || {};
  const s1 = { k: 1, qui: 'any wallet (the call is public)', offert: false };
  const s2 = { k: 2, qui: 'only a dev wallet of the first vault: ' + e.vault1.dev2 + ' (Grok) or ' + e.vault1.dev, offert: false };
  const s3 = { k: 3, qui: 'only the wallet that announced' + (f.par && f.par !== '0x' + '0'.repeat(40) ? ': ' + f.par : ''), offert: false };
  const out = [s1, s2, s3];
  if (faux.length) { for (const s of out) { s.statut = 'bloque'; s.raison = faux.join(' · '); } return out; }
  if (e.vault1.renounced) { for (const s of out) { s.statut = 'bloque'; s.raison = 'the dev rescue was renounced for good: the first vault can no longer be moved by hand'; } return out; }
  /* 1 */
  if (e.buyback.balance === 0n) { s1.statut = 'fait'; s1.raison = 'the buyback holds no TBLOCK'; }
  else {
    s1.statut = 'a-faire'; s1.montant = e.buyback.balance; s1.appels = [appelSweep()];
    s1.offert = !!w; s1.raison = w ? 'ready: the buyback sends its ' + fmtTb(e.buyback.balance) + ' TBLOCK to the first vault' : 'connect any wallet';
  }
  /* 3 first: a confirmed rescue changes what 2 means */
  if (suivi.versV) { s3.statut = 'fait'; s3.raison = fmtTb(suivi.versV.montant) + ' TBLOCK arrived at the holders vault'; s3.montant = suivi.versV.montant; }
  else if (suivi.rescue) {
    s3.statut = 'a-faire'; s3.mode = 'suite'; s3.montant = suivi.rescue.montant; s3.appels = [appelVersV(suivi.rescue.montant)];
    s3.qui = 'only the wallet that received the rescue: ' + suivi.rescue.par;
    if (!w) s3.raison = 'connect ' + suivi.rescue.par;
    else if (w !== bas(suivi.rescue.par)) s3.raison = 'this wallet did not receive the rescue: only ' + suivi.rescue.par + ' can send it on';
    else if (!e.wallet || e.wallet.tblock < suivi.rescue.montant) s3.raison = 'this wallet holds less TBLOCK than the rescued amount';
    else { s3.offert = true; s3.raison = 'ready: send exactly the rescued ' + fmtTb(suivi.rescue.montant) + ' TBLOCK to the holders vault'; }
  } else if (f.etat === 'aucune') { s3.statut = 'attente'; s3.raison = 'nothing announced yet (step 2)'; }
  else if (f.etat === 'attente') { s3.statut = 'attente'; s3.raison = 'the window opens in ' + duree(f.resteS); }
  else if (f.etat === 'expiree') { s3.statut = 'expiree'; s3.raison = 'the window closed: the announcement must be made again (step 2)'; }
  else {
    const P = paiementPrevu(e);
    s3.statut = 'ouverte'; s3.montant = P;
    const lot = !!opts.atomique && e.menaces.length === 0;
    s3.mode = lot ? 'lot' : 'sequence';
    s3.appels = lot ? [appelRescue(), appelVersV(P)] : [appelRescue()];
    if (P === 0n) s3.raison = 'the first vault has no free TBLOCK left to rescue';
    else if (!w) s3.raison = 'connect ' + f.par;
    else if (w !== bas(f.par)) s3.raison = 'this wallet did not announce: only ' + f.par + ' can execute the rescue';
    else if (f.resteS < MARGE_FIN_S) s3.raison = 'the window closes in less than 5 minutes: too late to send, announce again';
    else {
      s3.offert = true;
      s3.raison = lot ? 'ready: one batch, rescue then send exactly ' + fmtTb(P) + ' TBLOCK to the holders vault'
        : 'ready: rescue now (' + fmtTb(P) + ' TBLOCK to this wallet), then a second signature sends exactly what arrived to the holders vault'
          + (opts.atomique && e.menaces.length ? ' (no batch: a public call could lower the amount in the same block)' : '');
    }
  }
  /* 2 */
  if (suivi.rescue && !suivi.versV) { s2.statut = 'fait'; s2.raison = 'announced and executed'; }
  else if (f.etat === 'attente' || f.etat === 'ouverte') {
    s2.statut = 'fait'; s2.montant = f.montant;
    s2.raison = 'announced by ' + f.par + ': ' + fmtTb(f.montant) + ' TBLOCK (a new announcement would restart the 7 days: not offered)';
  } else {
    s2.statut = 'a-faire';
    const A2 = e.vault1.free;
    if (e.buyback.balance > 0n) s2.raison = 'step 1 first: the buyback still holds ' + fmtTb(e.buyback.balance) + ' TBLOCK';
    else if (A2 === 0n) { s2.statut = 'fait'; s2.raison = 'the first vault holds no free TBLOCK: nothing to move'; }
    else if (!w) s2.raison = 'connect a dev wallet of the first vault';
    else if (!estDev(e, w)) s2.raison = 'this wallet is not a dev wallet of the first vault: only ' + e.vault1.dev2 + ' or ' + e.vault1.dev + ' can announce';
    else { s2.offert = true; s2.montant = A2; s2.appels = [appelAnnonce(A2)]; s2.raison = 'ready: announce ' + fmtTb(A2) + ' TBLOCK (free() now)' + (f.etat === 'expiree' ? ', the previous announcement expired' : ''); }
  }
  return out;
}

// ------------------------------------------------------------------ simulations

/** eth_call of ONE call from the wallet at the latest block; returns the answer or throws with the revert */
export const simulerAppel = (rpc, wallet, a) => rpc('eth_call', [{ from: adr(wallet), to: a.to, data: a.data, value: '0x0' }, 'latest']);

/** step 3 on eth_simulateV1 (one block, calls in order, from the wallet, no signature): V.free() before / after the plain transfer.
 *  avecRescue = true: [rescue(), transfer(V, P)]; false: [transfer(V, P)] (the rescued TBLOCK is already in the wallet).
 *  { ok, raison, vAvant, vApres, paye, walletAvant, walletApres } — ok only when every call succeeds, rescue pays P, and V.free() grows by
 *  exactly P while the wallet ends where it started (with rescue) or P lower (without). */
export async function simulerVersV(lecteur, wallet, P, avecRescue) {
  const w = adr(wallet);
  const q = (to, data) => ({ from: w, to, data });
  const calls = [q(V, SEL.free), q(TBLOCK, SEL.balanceOf + wAddr(w))];
  if (avecRescue) calls.push(q(VAULT1, SEL.rescue));
  const t = appelVersV(P);
  calls.push(q(t.to, t.data), q(V, SEL.free), q(TBLOCK, SEL.balanceOf + wAddr(w)));
  let r;
  try { r = await lecteur('eth_simulateV1', [{ blockStateCalls: [{ calls }], validation: false }, 'latest']); }
  catch (x) { return { ok: false, raison: 'the simulation could not run: ' + ((x && x.message) || x) }; }
  const cs = r && r[0] && r[0].calls;
  if (!Array.isArray(cs) || cs.length !== calls.length) return { ok: false, raison: 'the simulation answered another shape' };
  const ko = cs.findIndex((c) => bas(c.status) !== '0x1');
  if (ko >= 0) return { ok: false, raison: 'call ' + (ko + 1) + ' of the simulation reverts' + (cs[ko].error ? ': ' + (cs[ko].error.message || '') : '') };
  const i = avecRescue ? 1 : 0;
  const vAvant = word(cs[0].returnData), walletAvant = word(cs[1].returnData);
  const paye = avecRescue ? word(cs[2].returnData) : P;
  const vApres = word(cs[3 + i].returnData), walletApres = word(cs[4 + i].returnData);
  const res = { vAvant, vApres, paye, walletAvant, walletApres };
  if (paye !== P) return { ok: false, raison: 'the rescue would pay ' + fmtTb(paye) + ', not ' + fmtTb(P), ...res };
  if (vApres - vAvant !== P) return { ok: false, raison: 'the holders vault would count ' + fmtTb(vApres - vAvant) + ' free TBLOCK, not ' + fmtTb(P), ...res };
  if (walletAvant - walletApres !== (avecRescue ? 0n : P)) return { ok: false, raison: 'the wallet balance would not end where expected', ...res };
  return { ok: true, raison: 'simulated: the holders vault counts exactly ' + fmtTb(P) + ' more free TBLOCK', ...res };
}

/** everything checked before the wallet opens for step k: fresh reads, the step offered to THIS wallet, each call simulated from it
 *  (eth_call), and step 3 also on eth_simulateV1 (lecteur = a public node). { pret, raison, etape, etat, appels, simulation } */
export async function preparer(rpc, lecteur, wallet, k, suivi = {}, opts = {}) {
  let e;
  try { e = await lireEtat(rpc, wallet); } catch (x) { return { pret: false, raison: 'cannot read the chain: ' + ((x && x.message) || x) }; }
  const s = etapes(e, wallet, suivi, opts)[k - 1];
  if (!s.offert) return { pret: false, raison: s.raison, etape: s, etat: e };
  const non = (raison, extra = {}) => ({ pret: false, raison, etape: s, etat: e, ...extra });
  const simulation = [];
  if (k === 3) {
    const sim = await simulerVersV(lecteur, wallet, s.montant, s.mode !== 'suite');
    if (!sim.ok) return non('before step 3: ' + sim.raison, { simulation: [sim] });
    simulation.push(sim);
    /* the call the wallet signs first is also simulated alone, from the wallet, through the wallet's own node */
    try { simulation.push({ appel: 1, reponse: await simulerAppel(rpc, wallet, s.appels[0]) }); }
    catch (x) { return non('the call reverts when simulated from this wallet: ' + ((x && x.message) || x), { simulation }); }
  } else {
    for (const [i, a] of s.appels.entries()) {
      try { simulation.push({ appel: i + 1, reponse: await simulerAppel(rpc, wallet, a) }); }
      catch (x) { return non('the call reverts when simulated from this wallet: ' + ((x && x.message) || x), { simulation }); }
    }
  }
  return { pret: true, raison: s.raison, etape: s, etat: e, appels: s.appels, simulation };
}

// ------------------------------------------------------------------ after the receipt

const adrTopic = (t) => { const n = BigInt(t); if (n >> 160n) throw new Error('not an address topic'); return '0x' + n.toString(16).padStart(40, '0'); };
/** the TBLOCK Transfer logs EMITTED BY TBLOCK in this receipt (an event from another emitter is ignored, never trusted) */
export function transfertsTblock(recu) {
  return (recu && Array.isArray(recu.logs) ? recu.logs : []).filter((l) => bas(l.address) === TBLOCK && Array.isArray(l.topics)
    && bas(l.topics[0]) === TOPIC.Transfer && l.topics.length === 3).map((l) => ({ from: adrTopic(l.topics[1]), to: adrTopic(l.topics[2]), value: word(l.data) }));
}
const logsDe = (recu, emetteur, t0) => (recu && Array.isArray(recu.logs) ? recu.logs : []).filter((l) => bas(l.address) === emetteur && Array.isArray(l.topics) && bas(l.topics[0]) === t0);

/** the transaction itself: found, from the signer, to/data/value exactly the offered call, mined with status 1 */
export function controleTx(appel, wallet, tx, recu) {
  const ko = [];
  if (!tx) ko.push('transaction not found');
  if (!recu) ko.push('receipt not found');
  if (!tx || !recu) return ko;
  if (bas(tx.from) !== bas(wallet)) ko.push('signed by ' + bas(tx.from) + ', not by ' + bas(wallet));
  if (appel) {
    if (bas(tx.to) !== bas(appel.to)) ko.push('sent to ' + bas(tx.to) + ', not to ' + appel.to);
    if (bas(tx.input || tx.data) !== bas(appel.data)) ko.push('the signed data is not the offered call');
  }
  if (BigInt(tx.value || 0) !== 0n) ko.push('the transaction carried ETH');
  if (tx.hash && recu.transactionHash && bas(tx.hash) !== bas(recu.transactionHash)) ko.push('the receipt is for another transaction');
  if (bas(recu.status) !== '0x1') ko.push('the transaction failed (status ' + recu.status + ')');
  return ko;
}

/** step 1: exactly one TBLOCK transfer buyback -> first vault of `attendu` (the buyback balance read before) */
export function controleSweep(appel, wallet, tx, recu, attendu) {
  const ko = controleTx(appel, wallet, tx, recu);
  if (ko.length) return { ko };
  const t = transfertsTblock(recu);
  const bon = t.filter((x) => x.from === BUYBACK && x.to === VAULT1);
  if (bon.length !== 1 || t.length !== 1) ko.push('expected one TBLOCK transfer from the buyback to the first vault, saw ' + t.length);
  else if (attendu !== undefined && bon[0].value !== BigInt(attendu)) ko.push('moved ' + fmtTb(bon[0].value) + ' TBLOCK, ' + fmtTb(attendu) + ' were read before');
  return { ko, montant: bon[0] ? bon[0].value : 0n };
}

/** step 2: the first vault emitted RescueAnnounced(by = the signer, amount = the announced amount) in this receipt */
export function controleAnnonce(appel, wallet, tx, recu, montant) {
  const ko = controleTx(appel, wallet, tx, recu);
  if (ko.length) return { ko };
  const l = logsDe(recu, VAULT1, TOPIC.RescueAnnounced);
  if (l.length !== 1) { ko.push('expected one announcement from the first vault, saw ' + l.length); return { ko }; }
  if (l[0].topics.length !== 2 || adrTopic(l[0].topics[1]) !== bas(wallet)) ko.push('the announcement names another wallet');
  const a = word(l[0].data, 0), at = word(l[0].data, 1), exp = word(l[0].data, 2);
  if (a !== BigInt(montant)) ko.push('announced ' + fmtTb(a) + ' TBLOCK, not ' + fmtTb(montant));
  if (exp - at !== RESCUE_WINDOW) ko.push('the announced window is not 2 days');
  if (tx.input && bas(tx.input) !== bas(appelAnnonce(montant).data)) ko.push('the signed amount is not the offered one');
  return { ko, montant: a, ouvre: at, ferme: exp };
}

/** step 3a: Rescued(by = signer, P) from the first vault AND exactly one TBLOCK transfer first vault -> signer of the same P */
export function controleRescue(appel, wallet, tx, recu) {
  const ko = controleTx(appel, wallet, tx, recu);
  if (ko.length) return { ko };
  const l = logsDe(recu, VAULT1, TOPIC.Rescued);
  if (l.length !== 1 || l[0].topics.length !== 2 || adrTopic(l[0].topics[1]) !== bas(wallet)) { ko.push('no rescue by this wallet in the receipt'); return { ko }; }
  const P = word(l[0].data);
  const t = transfertsTblock(recu);
  if (t.length !== 1 || t[0].from !== VAULT1 || t[0].to !== bas(wallet) || t[0].value !== P) ko.push('the TBLOCK that left the first vault is not exactly the rescued amount, paid to this wallet');
  return { ko, montant: P, par: bas(wallet), bloc: recu.blockNumber ? BigInt(recu.blockNumber) : null };
}

/** step 3b: the offered transfer(V, montant), exactly one TBLOCK transfer signer -> V of montant */
export function controleVersV(appel, wallet, tx, recu, montant) {
  const ko = controleTx(appel, wallet, tx, recu);
  if (ko.length) return { ko };
  if (bas(appel.data) !== bas(appelVersV(montant).data)) ko.push('the offered call is not transfer(holders vault, rescued amount)');
  const t = transfertsTblock(recu);
  if (t.length !== 1 || t[0].from !== bas(wallet) || t[0].to !== V || t[0].value !== BigInt(montant)) ko.push('the TBLOCK did not go exactly to the holders vault for the rescued amount');
  return { ko, montant: t[0] ? t[0].value : 0n };
}

/** the batch: every transaction from the signer, status 1; across its receipts: Rescued(signer, P) from the first vault, TBLOCK
 *  first vault -> signer P, TBLOCK signer -> V P, and nothing else moved in TBLOCK. paires = [{ tx, recu }] (one for a 7702 batch). */
export function controleLot(wallet, paires, P) {
  const ko = [];
  if (!Array.isArray(paires) || !paires.length) return { ko: ['no receipt for the batch'] };
  for (const { tx, recu } of paires) for (const x of controleTx(null, wallet, tx, recu)) ko.push(x);
  if (ko.length) return { ko };
  const recus = paires.map((p) => p.recu);
  const res = recus.flatMap((r) => logsDe(r, VAULT1, TOPIC.Rescued));
  if (res.length !== 1 || adrTopic(res[0].topics[1]) !== bas(wallet)) { ko.push('no rescue by this wallet in the batch'); return { ko }; }
  const paye = word(res[0].data);
  if (paye !== BigInt(P)) ko.push('the rescue paid ' + fmtTb(paye) + ' TBLOCK, the batch sent ' + fmtTb(P) + ' on: compare the wallet balance');
  const t = recus.flatMap(transfertsTblock);
  const entree = t.filter((x) => x.from === VAULT1 && x.to === bas(wallet));
  const sortie = t.filter((x) => x.from === bas(wallet) && x.to === V);
  if (entree.length !== 1 || entree[0].value !== paye) ko.push('the rescue did not pay this wallet exactly once');
  if (sortie.length !== 1 || sortie[0].value !== BigInt(P)) ko.push('the holders vault did not receive exactly ' + fmtTb(P) + ' TBLOCK');
  if (t.length !== 2) ko.push('the batch moved TBLOCK ' + t.length + ' times, 2 expected');
  return { ko, montant: sortie[0] ? sortie[0].value : 0n, paye };
}

/** the TBLOCK transfers wallet -> holders vault since block `depuis` (TBLOCK logs, topics from + to), in windows that shrink when a node
 *  refuses a range. Used before step 3b is offered again: a rescue already sent on (from another browser) must not be sent twice. */
export async function envoisVersV(rpc, wallet, depuis, jusqua = null) {
  const fin = jusqua === null ? BigInt(await rpc('eth_blockNumber', [])) : BigInt(jusqua);
  const out = [];
  let pas = 50000n;
  for (let a = BigInt(depuis); a <= fin;) {
    const b = a + pas - 1n < fin ? a + pas - 1n : fin;
    let logs;
    try { logs = await rpc('eth_getLogs', [{ address: TBLOCK, fromBlock: hex(a), toBlock: hex(b), topics: [TOPIC.Transfer, '0x' + wAddr(wallet), '0x' + wAddr(V)] }]); }
    catch (x) { if (pas > 1000n) { pas /= 5n; continue; } throw x; }
    for (const l of logs || []) if (bas(l.address) === TBLOCK) out.push({ hash: bas(l.transactionHash), bloc: BigInt(l.blockNumber), value: word(l.data) });
    a = b + 1n;
  }
  return out;
}

// ------------------------------------------------------------------ words

export function fmtTb(raw, digits = 2) {
  const n = BigInt(raw), neg = n < 0n, a = neg ? -n : n;
  const ent = (a / 10n ** 18n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const dec = (a % 10n ** 18n).toString().padStart(18, '0').slice(0, digits);
  return (neg ? '-' : '') + ent + (digits ? '.' + dec : '');
}
export function duree(s) {
  let x = Number(s); if (!(x > 0)) return '0 s';
  const d = Math.floor(x / 86400); x -= d * 86400; const h = Math.floor(x / 3600); x -= h * 3600; const m = Math.floor(x / 60);
  return (d ? d + ' d ' : '') + (d || h ? h + ' h ' : '') + m + ' min';
}
export const iso = (ts) => new Date(Number(ts) * 1000).toISOString().replace('.000Z', ' UTC').replace('T', ' ');
export { hex };
