/* contest-vue.js — the page side of contest.html (game386 task B, Phil 2026-11-12: "make the contest page logical and like the app").
 *   PURE: no DOM, no network of its own, no wallet of its own. Reads are injected: call(to, data) and callFrom(from, to, data), each
 *   returning the hex answer or throwing (a contract revert throws an Error with .reverted = true and .data = the revert bytes).
 *   Nothing here signs or sends: block-contest.js builds the unsigned calls and the person's own wallet signs them.
 * WHY THIS MODULE (measured 2026-11-12 on https://tokenizedblock.space with Grok's wallet 0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b):
 *   /api/blocks-de answered in 0.5 s with the three blocks it created (UNIT, TEST, TWO), but /api/cle took 47 s (TWO) and 72 s (TEST)
 *   and then said "no Initialize found in the last 39960 blocks": the server looks for the pool by scanning recent Initialize logs, and
 *   these pools are older than that window (and the server keeps no answer for an absence, so every visit pays the full scan again).
 *   The page waited up to 20 s per block, one block after the other, under one "Looking for the blocks this wallet created…" line.
 *   A block born by this app is paired on the contest's hook with fee 0 and tick spacing 200 (lancer-pool.js FEE_POOL and
 *   TICK_SPACING_POOL, caution-createur.js cleMarcheCreateur), against ETH or one of the hook's 62 pair currencies. So the key can be
 *   BUILT, and the contract itself says whether it is the one: creatorOf(keccak(key)) answers the recorded creator, or reverts. Measured:
 *   UNIT, TEST and TWO are each found on the ETH key at the first call, creator = that wallet, in about 0.3 to 1 s.
 * NOT READ IS NEVER 0: a failed read is null and is said "not read". */
import * as C from './block-contest.js';
import { cleMarcheCreateur } from './caution-createur.js';
import { DEVISES_7030 } from './hook-7030-descripteur.js';
import { selecteur } from './keccak.js';

export const ETH = '0x0000000000000000000000000000000000000000';
export const NOT_READ = 'not read';
const ADR = /^0x[0-9a-f]{40}$/;
const low = (x) => String(x == null ? '' : x).toLowerCase();
const strip = (h) => low(h).replace(/^0x/, '');

/** the currencies a block can be paired with on the contest's hook: ETH first (most blocks are born against ETH), then the hook's 62 */
export const PAIRED = Object.freeze([ETH, ...DEVISES_7030.map(low)]);

/** the pool key a block born by this app has against `paired` on the contest's hook (fee 0, tick spacing 200, currencies sorted) */
export function keyFor(blockToken, paired) {
  const k = cleMarcheCreateur({ bloc: low(blockToken), devise: low(paired), hook: C.HOOK });
  return Object.freeze({ currency0: low(k.currency0), currency1: low(k.currency1), fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: low(k.hooks) });
}
/** every key the contest could accept for `blockToken`, ETH first */
export const candidateKeys = (blockToken) => PAIRED.filter((p) => p !== low(blockToken)).map((p) => keyFor(blockToken, p));

/** run `p` but give up after `ms`: rejects with an Error whose .timeout is true (the work itself is not cancelled, its answer is ignored) */
export function withTimeout(p, ms, what = 'the read') {
  let t = null;
  const stop = new Promise((_, ko) => { t = setTimeout(() => { const e = new Error(what + ' took longer than ' + Math.round(ms / 1000) + ' s'); e.timeout = true; ko(e); }, ms); });
  return Promise.race([p, stop]).finally(() => clearTimeout(t));
}

/**
 * The pool key with which `wallet` can enter `blockToken`, read on the contest contract itself.
 *   ETH first (one call), then the other pair currencies `width` at a time. A creatorOf that reverts = no pool on that key; a read that
 *   failed is counted, never taken for "no pool". Stops at the first key whose recorded creator is `wallet` and checks it with
 *   readCreatorCheck (the same two views enter() uses: sidesOf + creatorOf).
 * @returns {Promise<{ etat:'OK'|'OTHER'|'NONE'|'NOT_READ', key?:object, why?:string, creator?:string, tried:number, failed:number }>}
 *   OK = enterable by this wallet; OTHER = a pool exists, recorded to another wallet; NONE = all keys read, no pool of this block;
 *   NOT_READ = some reads failed or the time ran out, nothing found among those that answered.
 */
export async function findBlockKey(call, { blockToken, wallet, width = 8, deadline = null, now = () => Date.now() }) {
  const b = low(blockToken), w = low(wallet);
  if (!ADR.test(b) || !ADR.test(w)) return { etat: 'NONE', why: 'that is not a full address', tried: 0, failed: 0 };
  const keys = candidateKeys(b);
  let tried = 0, failed = 0, other = null;
  for (let i = 0; i < keys.length;) {
    if (deadline !== null && now() > deadline) return { etat: other ? 'OTHER' : 'NOT_READ', why: other ? other.why : 'the check ran out of time after ' + tried + ' of ' + keys.length + ' pairs', creator: other && other.creator, tried, failed };
    const part = keys.slice(i, i + (i === 0 ? 1 : width));
    i += part.length;
    const res = await Promise.all(part.map(async (key) => {
      const v = C.VIEW.creatorOf(C.poolIdOfKey(key));
      try { return { key, creator: C.decodeAddress(await call(v.to, v.data)) }; } catch (e) { return { key, reverted: !!(e && e.reverted) }; }
    }));
    for (const r of res) {
      tried++;
      if (r.reverted) continue;
      if (!r.creator) { failed++; continue; }
      if (r.creator === w) {
        const chk = await C.readCreatorCheck(call, { blockToken: b, key: r.key, wallet: w });
        if (chk.ok) return { etat: 'OK', key: r.key, creator: w, tried, failed };
        other = { why: chk.why, creator: chk.creator || null };
      } else if (!other) other = { why: 'another wallet is recorded as the creator of its pool', creator: r.creator };
    }
  }
  if (other) return { etat: 'OTHER', why: other.why, creator: other.creator, tried, failed };
  if (failed) return { etat: 'NOT_READ', why: failed + ' of the ' + keys.length + ' pairs were not read just now', tried, failed };
  return { etat: 'NONE', why: 'no pool of this block is recorded on the hook the contest reads (ETH and its ' + DEVISES_7030.length + ' pair currencies checked)', tried, failed };
}

/* ═══════════════ simulating a gesture FROM the wallet before the wallet opens ═══════════════ */
const ERRORS = [
  ['BadParams()', 'the amounts sent are not valid'], ['Reentrancy()', 'the contract is busy, try again'],
  ['TransferFailed()', 'the TBLOCK transfer failed'], ['RoundEnded()', 'this round has ended'],
  ['NotEntryWindow()', 'entries are not open right now'], ['NotVoteWindow()', 'voting is not open right now'],
  ['NotB20()', 'this address is not a block the contest accepts'], ['AlreadyEntered()', 'this block is already entered in this round'],
  ['WrongHook()', 'this pool is not on the hook the contest reads'], ['NotInKey()', 'the block is not in this pool'],
  ['NotCreator()', 'this wallet is not the recorded creator of this block'], ['NoSuchEntry()', 'there is no such entry in this round'],
  ['NotEnded()', 'this round has not ended yet'], ['AlreadySettled()', 'this round is already settled'],
  ['NothingToClaim()', 'the contest holds nothing for this wallet'], ['PayeeAlreadyEntered()', 'this wallet already has an entry in this round'],
  ['RoundTooFar()', 'that round is too far ahead'], ['NotBlockSide()', 'the block is the paired side of this pool, not its block side'],
  ['PotFull(uint256,uint256)', 'the pot of this round is already at its cap'], ['GasReserve()', 'not enough gas was given'],
];
export const ERROR_BY_SEL = Object.freeze(Object.fromEntries(ERRORS.map(([sig, txt]) => [low(selecteur(sig)), txt])));
export const SEL_TRANSFER_FAILED = low(selecteur('TransferFailed()'));
/** the 4-byte revert selector carried by an error (its .data, or a 0x… inside its message); null when none */
export function revertSelector(e) {
  const m = /0x[0-9a-fA-F]{8}/.exec(String((e && e.data) || '') + ' ' + String((e && e.message) || ''));
  return m ? low(m[0]) : null;
}
/**
 * eth_call of the contest gesture FROM the wallet, before the wallet opens. The batch is approve(EXACT amount) then the gesture; an
 *   eth_call cannot carry the approval over, so the gesture alone is simulated:
 *   - it succeeds: OK;
 *   - it reverts TransferFailed() while the allowance read is below `need` and the balance read covers it: every rule of the contest
 *     before the payment passed (window, block, creator, entry, cap), and the payment is what the approval in the same batch allows: OK;
 *   - any other revert: refused, said in words; a read that failed: refused ("not read"), nothing is sent on a guess.
 * @returns {Promise<{ ok:boolean, why:string, viaApproval?:boolean }>}
 */
export async function simulateGesture(callFrom, { from, to, data, need = 0n, allowance = null, balance = null }) {
  const n = BigInt(need);
  if (n > 0n) {
    if (balance === null || balance === undefined) return { ok: false, why: 'the TBLOCK balance of this wallet was ' + NOT_READ + ' just now; nothing was sent' };
    if (BigInt(balance) < n) return { ok: false, why: 'this wallet holds ' + C.formatUnits18(balance) + ' TBLOCK and this needs ' + C.formatUnits18(n) + ' TBLOCK' };
  }
  try {
    await callFrom(from, to, data);
    return { ok: true, why: 'simulated from your wallet on Base: it goes through' };
  } catch (e) {
    if (!(e && e.reverted)) return { ok: false, why: 'the simulation was ' + NOT_READ + ' just now (' + String((e && e.message) || e).slice(0, 80) + '); nothing was sent' };
    const sel = revertSelector(e);
    if (sel === SEL_TRANSFER_FAILED && n > 0n && allowance !== null && allowance !== undefined && BigInt(allowance) < n) {
      return { ok: true, viaApproval: true, why: 'simulated from your wallet on Base: every rule of the contest passes; the TBLOCK moves with the approval of exactly ' + C.formatUnits18(n) + ' TBLOCK in the same batch' };
    }
    return { ok: false, why: 'the contract refuses it: ' + ((sel && ERROR_BY_SEL[sel]) || 'it reverts' + (sel ? ' (' + sel + ')' : '')) };
  }
}

/* ═══════════════ the round's timeline ═══════════════ */
/** the three steps of the round `now` falls in (entries, voting, paid), with the current one marked, and the next boundary */
export function timeline(p, now) {
  const w = C.phaseAt(p, now), r = w.round;
  const start = C.roundStart(p, r), vote = C.voteStart(p, r), end = C.roundEnd(p, r);
  const ph = w.phase;
  const steps = [
    { key: 'ENTRY', label: 'Entries', from: ph === 'BEFORE_START' ? p.genesis : start, to: ph === 'BEFORE_START' ? p.genesis + p.entryPeriod : vote, on: ph === 'ENTRY', done: ph === 'VOTE' },
    { key: 'VOTE', label: 'Voting', from: ph === 'BEFORE_START' ? p.genesis + p.entryPeriod : vote, to: ph === 'BEFORE_START' ? p.genesis + C.roundLength(p) : end, on: ph === 'VOTE', done: false },
    { key: 'PAID', label: 'Paid', from: ph === 'BEFORE_START' ? p.genesis + C.roundLength(p) : end, to: null, on: false, done: false },
  ];
  const next = ph === 'BEFORE_START' ? { what: 'Entries open in', at: p.genesis }
    : ph === 'ENTRY' ? { what: 'Voting opens in', at: vote } : { what: 'The round ends in', at: end };
  return { round: r, phase: ph, steps, next: { ...next, secondsLeft: next.at - BigInt(now) } };
}

/* ═══════════════ words for the numbers ═══════════════ */
/** "$1.23" from raw TBLOCK and the pool price in $ per TBLOCK; "under $0.01" below a cent; null when the price was not read */
export function usdOf(raw, usd) {
  if (!(Number(usd) > 0)) return null;
  const v = Number(BigInt(raw)) / 1e18 * Number(usd);
  if (v === 0) return '$0';
  return v < 0.01 ? 'under $0.01' : '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** whether the round pays as it stands, and what is still missing, in plain words (from the values read) */
export function quorumWords({ entryCount, qualifiedCount, pot }, p) {
  const need = Number(p.minQualifiedEntries), q = Number(qualifiedCount), e = Number(entryCount);
  const rule = 'an entry qualifies with at least ' + p.minVotes + ' votes from ' + p.minVoters + ' different addresses';
  if (q >= need) return { pays: true, missing: 0, head: 'This round pays: ' + q + ' entries qualify (' + need + ' needed).', rule };
  const missing = need - q;
  const lack = e < need
    ? (need - e) + ' more ' + (need - e === 1 ? 'block must enter' : 'blocks must enter') + ', and ' + missing + (missing === 1 ? ' entry' : ' entries') + ' must qualify'
    : missing + ' more ' + (missing === 1 ? 'entry must qualify' : 'entries must qualify');
  return { pays: false, missing, rule,
    head: 'Not paying yet: ' + q + ' of the ' + need + ' qualifying entries needed. ' + lack[0].toUpperCase() + lack.slice(1) + '.',
    ifNot: 'If the round ends short, nobody is paid: its pot (' + C.formatUnits18(pot) + ' TBLOCK) is carried to the rounds that follow, each filled up to its cap, and only what fits in none of the next ' + p.maxFundAhead + ' rounds is sent to the dead address.' };
}

/* ═══════════════ the holders vault and this pot (TBlockVaultV2.feedContest) ═══════════════ */
export const VAULT_SEL = Object.freeze({ CONTEST: strip(selecteur('CONTEST()')), MAX_FEED_PER_CALL: strip(selecteur('MAX_FEED_PER_CALL()')), FEED_COOLDOWN: strip(selecteur('FEED_COOLDOWN()')) });
/** what the vault says about this contest: CONTEST() (must be this contest), MAX_FEED_PER_CALL(), FEED_COOLDOWN(), free(). Each null when not read. */
export async function readFeed(call, { vault, freeView }) {
  const w = async (to, data) => { try { return C.decodeUint(await call(to, data)); } catch (_) { return null; } };
  const [contestWord, maxFeed, cooldown, free] = await Promise.all([w(vault, '0x' + VAULT_SEL.CONTEST), w(vault, '0x' + VAULT_SEL.MAX_FEED_PER_CALL), w(vault, '0x' + VAULT_SEL.FEED_COOLDOWN), w(freeView.to, freeView.data)]);
  const contest = contestWord === null || contestWord >> 160n ? null : '0x' + contestWord.toString(16).padStart(40, '0');
  return { contest, feedsThis: contest === C.CONTEST, maxFeed, cooldown, free };
}
/** the one line the contest page keeps about the vault; null unless the vault READ names this contest */
export function feedWords(f) {
  if (!f || !f.feedsThis) return null;
  const days = f.cooldown === null ? null : Number(f.cooldown) / 86400;
  const often = days === null ? '' : days === 1 ? ', at most once a day' : ', at most once every ' + (Number.isInteger(days) ? days + ' days' : C.formatDuration(f.cooldown));
  return 'The holders vault can top up this pot: once each week of its players is closed, anyone can move part of what it holds free ('
    + (f.free === null ? NOT_READ : C.formatUnits18(f.free) + ' TBLOCK now') + ') into the current round, up to '
    + (f.maxFeed === null ? NOT_READ : C.formatUnits18(f.maxFeed) + ' TBLOCK') + ' at a time' + often + ', never above the cap.';
}
