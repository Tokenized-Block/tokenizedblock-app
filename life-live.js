// life-live.js — GAME OF LIFE BLOCK, LIVE (Phil 2026-11-16: "construis la partie en direct, sans paiement d'abord").
// ONE game for everybody: the server reads the Transfer logs of the players' tokens at the head of Base, appends them as facts,
// and steps the SAME engine the page uses (life-block/engine.js), one generation per Base block. A season lasts SEASON_BLOCKS
// (24 h of chain); the winner is the block that wore the crown for the most beats. READ-ONLY on chain: nothing is signed here.
// VERIFIABLE: the season's facts are a public journal (one JSON line each) and a hash is recorded every hour of chain; anybody can
//   replay the journal with the engine and must land on the same hashes.
// NE PROUVE PAS: a buy/sell is inferred from a transfer touching the block's pool (as in tools/enregistrer-life-block.mjs).
// ⛔ The world NEVER steps past the last block whose logs were ALL read: a failed read waits, it is not a quiet beat.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import * as E from './life-engine.js';
import { keccak256Hex } from './keccak.js';

export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
/** LifeEntry's event: Entered(address indexed payer, address indexed blockToken, uint256 tblockPaid, uint256 priceUsdE18) */
export const ENTERED = '0x' + keccak256Hex(new TextEncoder().encode('Entered(address,address,uint256,uint256)')).replace(/^0x/, '');
const SEL_SYMBOL = '0x' + keccak256Hex(new TextEncoder().encode('symbol()')).replace(/^0x/, '').slice(0, 8);
/** an ABI-encoded string answer (symbol(), name()) -> text, or '' */
export function texteAbi(hex) {
  try { const h = String(hex || '').replace(/^0x/, ''); if (h.length < 128) return ''; const n = Number(BigInt('0x' + h.slice(64, 128))); if (n > 64) return '';
    const b = h.slice(128, 128 + n * 2); let t = ''; for (let i = 0; i < b.length; i += 2) t += String.fromCharCode(parseInt(b.slice(i, i + 2), 16)); return t.replace(/[^\x20-\x7e]/g, '').slice(0, 24); } catch { return ''; }
}
const bas = (a) => String(a || '').toLowerCase();
const READ_MAX = 600;          /* blocks read per tick at most (2 min of chain): a long outage catches up in steps */
const ADDR_PER_CALL = 10;      /* publicnode: "A maximum of 10 addresses is allowed" (measured 2026-11-16) */
const CP_EVERY = 1500;         /* a checkpoint every 1,500 generations (5 min of chain): a restart replays at most that */
const HASH_EVERY = 18000;      /* one public hash per hour of chain */
const RECENT_BLOCKS = 3000;    /* facts kept in memory for the page's polls (10 min of chain); older ones: reload the state */

/** the players of a new season: the app's tokenized stocks (issuer lines of /api/trending), with the pools a buy/sell is read on */
export function playersFromTrending(lignes, poolManager) {
  return (lignes || []).filter((x) => x && x.emetteur && /^0x[0-9a-fA-F]{40}$/.test(x.adr || '') && !/xhamster|porn|sex/i.test((x.nom || '') + ' ' + (x.sym || '')))
    .sort((a, b) => (b.trades24h || 0) - (a.trades24h || 0) || (bas(a.adr) < bas(b.adr) ? -1 : 1))
    .map((x) => ({ adr: bas(x.adr), sym: String(x.sym || '').slice(0, 16), nom: String(x.nom || '').slice(0, 60), action: true, liquiditeUsd: Math.round(Number(x.liquiditeUsd) || 0),
      pools: [...new Set([x.poolAdr, x.routeAction && x.routeAction.pool, x.emetteur ? null : poolManager].filter(Boolean).map(bas))] }));
}
/** one Transfer log -> one fact (buy when it leaves the block's pool, sell when it enters it, otherwise a transfer) */
export function factFromLog(l, index, blocks) {
  const i = index.get(bas(l.address)); if (i === undefined || !l.topics || l.topics.length < 3) return null;
  const from = '0x' + l.topics[1].slice(26), to = '0x' + l.topics[2].slice(26), P = blocks[i].pools;
  return { bloc: parseInt(l.blockNumber, 16), tx: l.transactionHash, log: parseInt(l.logIndex, 16), b: i, kind: P.includes(from) ? 'achat' : P.includes(to) ? 'vente' : 'transfert', vers: to };
}

export function createLifeLive({ rpc, dir = null, lignes, poolManager, log = () => {}, seasonBlocks = E.SEASON_BLOCKS, stepBudgetMs = 1200, lifeEntry = null, crownRounds = null }) {
  /* CrownMarket rounds (game433): who wears the crown at each round's LAST block, with the world's fingerprint there. crownRounds =
   *   { genesis, roundBlocks } read from the deployed market. Kept in memory (the last 200 rounds) and in season.json. */
  const CR = crownRounds && Number.isSafeInteger(crownRounds.genesis) && Number.isSafeInteger(crownRounds.roundBlocks) && crownRounds.roundBlocks > 0 ? crownRounds : null;
  const LIFE_ENTRY = /^0x[0-9a-fA-F]{40}$/.test(String(lifeEntry || '')) ? String(lifeEntry).toLowerCase() : null;
  const S = { season: null, world: null, readTo: 0, recent: [], busy: false, lastError: null, lastTickAt: 0, calls: 0, reads: 0, stateCache: null, history: [] };
  const f = (n) => (dir ? join(dir, n) : null);
  if (dir) mkdirSync(dir, { recursive: true });
  const writeJson = (n, v) => { if (!dir) return; const p = f(n), t = p + '.tmp'; writeFileSync(t, JSON.stringify(v)); renameSync(t, p); };
  const readJson = (n) => { try { return dir && existsSync(f(n)) ? JSON.parse(readFileSync(f(n), 'utf8')) : null; } catch (e) { log('[life] unreadable ' + n + ': ' + e.message); return null; } };
  const journalName = (id) => 'faits-' + id + '.jsonl';
  const index = () => new Map(S.season.blocks.map((b, i) => [b.adr, i]));
  const saveSeason = () => writeJson('season.json', { ...S.season, readTo: S.readTo });
  const saveCheckpoint = () => writeJson('cp-' + S.season.id + '.json', E.serializeWorld(S.world));

  /* ── load what a previous process left (a deploy must not reset the game) ── */
  function load() {
    S.history = readJson('seasons.json') || [];
    const s = readJson('season.json'); if (!s || !s.id || !Array.isArray(s.blocks)) return;
    if ((s.engine || 1) !== E.ENGINE_VERSION) {
      S.history.unshift({ id: s.id, de: s.de, end: s.end, winner: null, closed: 'the game rules changed (engine ' + (s.engine || 1) + ' -> ' + E.ENGINE_VERSION + '): a new season starts' });
      S.history = S.history.slice(0, 60); writeJson('seasons.json', S.history);
      log('[life] season ' + s.id + ' was played with engine ' + (s.engine || 1) + ': closed, a new season starts'); return;
    }
    S.season = { id: s.id, de: s.de, end: s.end, blocks: s.blocks, hashes: s.hashes || [], rounds: s.rounds || [], engine: s.engine, startedAt: s.startedAt };
    const readTo = Number(s.readTo) || s.de - 1;
    /* facts written past the saved readTo belong to a window whose readTo never got saved: dropped, that window is read again */
    let faits = [];
    if (dir && existsSync(f(journalName(s.id)))) {
      const lines = readFileSync(f(journalName(s.id)), 'utf8').split('\n').filter(Boolean);
      faits = lines.map((x) => JSON.parse(x)).filter((x) => x.bloc <= readTo);
      if (faits.length !== lines.length) writeFileSync(f(journalName(s.id)), faits.map((x) => JSON.stringify(x) + '\n').join(''));
    }
    const cp = readJson('cp-' + s.id + '.json');
    try { S.world = cp ? E.deserializeWorld(cp) : E.createLiveWorld(s.blocks.filter((b) => !b.joinedAt), s.de); } catch (e) { log('[life] checkpoint refused, replaying the journal: ' + e.message); S.world = E.createLiveWorld(s.blocks.filter((b) => !b.joinedAt), s.de); }
    const after = faits.filter((x) => x.bloc > S.world.data.a);
    if (readTo > S.world.data.a) E.appendFacts(S.world, after, readTo);
    S.readTo = readTo; S.recent = faits.filter((x) => x.bloc > readTo - RECENT_BLOCKS);
    log('[life] season ' + s.id + ' resumed at gen ' + S.world.gen + ', read to ' + readTo + ' (' + after.length + ' facts after the checkpoint)');
  }

  async function call(m, p) { S.calls++; return rpc(m, p); }
  async function head() { return parseInt(await call('eth_blockNumber', []), 16) - 3; /* 3 blocks behind the tip: no reorg dance */ }

  function startSeason(h) {
    const blocks = playersFromTrending(lignes(), poolManager);
    if (blocks.length < 5) { S.lastError = 'not enough tokenized stocks read yet (' + blocks.length + ')'; return false; }
    if (S.season && S.world) {
      const rk = E.ranking(S.world), win = [...S.world.players.keys()].sort((a, b) => S.world.players[b].crownBeats - S.world.players[a].crownBeats || a - b)[0];
      S.history.unshift({ id: S.season.id, de: S.season.de, end: S.season.end, winner: S.world.blocks[win].sym, winnerAdr: S.world.blocks[win].adr, crownBeats: S.world.players[win].crownBeats,
        top: rk.rows.slice(0, 3).map((r) => ({ sym: r.sym, cells: r.cells })), finalHash: S.world.hash });
      S.history = S.history.slice(0, 60); writeJson('seasons.json', S.history);
    }
    const id = 's' + h;
    S.season = { id, de: h + 1, end: h + 1 + seasonBlocks, blocks, hashes: [], engine: E.ENGINE_VERSION, startedAt: new Date().toISOString() };
    S.world = E.createLiveWorld(blocks, h + 1); S.readTo = h; S.recent = [];
    saveSeason(); saveCheckpoint(); log('[life] season ' + id + ' starts at block ' + (h + 1) + ' with ' + blocks.length + ' players');
    return true;
  }

  /* read every player's Transfer logs in (readTo, to]; all-or-nothing */
  /* "Add your block": the Entered logs of LifeEntry in (from, to], each from THAT contract's address and from a transaction whose receipt
   *   says status 1 (an event is not a transaction: the receipt is read). A block already in the season is reinforced, never duplicated.
   *   New players are listed in (block, address) order: the engine adds them in that same order, so a fact's index means one block. */
  async function readEntries(from, to) {
    if (!LIFE_ENTRY) return [];
    const r = await call('eth_getLogs', [{ fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), address: LIFE_ENTRY, topics: [ENTERED] }]);
    if (!Array.isArray(r)) throw new Error('eth_getLogs (entries) did not answer a list');
    const out = [];
    for (const l of r) {
      if (String(l.address).toLowerCase() !== LIFE_ENTRY || !l.topics || l.topics[0] !== ENTERED || l.topics.length < 3) continue;
      const rc = await call('eth_getTransactionReceipt', [l.transactionHash]);
      if (!rc || rc.status !== '0x1' || !(rc.logs || []).some((x) => String(x.address).toLowerCase() === LIFE_ENTRY && x.logIndex === l.logIndex)) continue;
      out.push({ bloc: parseInt(l.blockNumber, 16), log: parseInt(l.logIndex, 16), tx: l.transactionHash, adr: ('0x' + l.topics[2].slice(26)).toLowerCase(), payer: ('0x' + l.topics[1].slice(26)).toLowerCase() });
    }
    out.sort((x, y) => x.bloc - y.bloc || (x.adr < y.adr ? -1 : x.adr > y.adr ? 1 : 0));
    const facts = [];
    for (const e of out) {
      const line = (lignes() || []).find((x) => x && String(x.adr || '').toLowerCase() === e.adr);
      let sym = line && line.sym ? String(line.sym).slice(0, 16) : '', nom = line && line.nom ? String(line.nom).slice(0, 60) : '';
      if (!sym) { try { sym = texteAbi(await call('eth_call', [{ to: e.adr, data: SEL_SYMBOL }, 'latest'])); } catch { sym = ''; } } 
      const b = { adr: e.adr, sym: sym || e.adr.slice(0, 6), nom, action: !!(line && line.emetteur), liquiditeUsd: Math.round(Number(line && line.liquiditeUsd) || 0),
        pools: line ? [...new Set([line.poolAdr, line.routeAction && line.routeAction.pool, line.emetteur ? null : poolManager].filter(Boolean).map((x) => String(x).toLowerCase()))] : [] };
      if (!S.season.blocks.some((x) => x.adr === b.adr)) S.season.blocks.push({ ...b, joinedAt: e.bloc });
      facts.push({ bloc: e.bloc, join: b, tx: e.tx, payer: e.payer });
    }
    return facts;
  }

  async function read(to) {
    const entries = await readEntries(S.readTo + 1, to);
    const from = S.readTo + 1, idx = index(), B = S.season.blocks, logs = [];
    /* a joined block is read from its join block only */
    const active = B.filter((b) => !b.joinedAt || b.joinedAt <= to);
    for (let k = 0; k < active.length; k += ADDR_PER_CALL) {
      const r = await call('eth_getLogs', [{ fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), address: active.slice(k, k + ADDR_PER_CALL).map((b) => b.adr), topics: [TRANSFER] }]);
      if (!Array.isArray(r)) throw new Error('eth_getLogs did not answer a list');
      logs.push(...r);
    }
    const faits = logs.map((l) => factFromLog(l, idx, B)).filter((x) => x && x.bloc >= from && x.bloc <= to && (!B[x.b].joinedAt || x.bloc >= B[x.b].joinedAt));
    faits.push(...entries);
    faits.sort((x, y) => x.bloc - y.bloc || (x.join ? 0 : 1) - (y.join ? 0 : 1) || (x.log || 0) - (y.log || 0) || (x.tx < y.tx ? -1 : 1));
    return faits;
  }

  function stepFor(ms) {
    const t0 = Date.now(), w = S.world;
    while (w.chainBlock <= w.data.a && Date.now() - t0 < ms) {
      E.stepWorld(w);
      if (w.gen % CP_EVERY === 0) saveCheckpoint();
      if (w.gen % HASH_EVERY === 0) { S.season.hashes.push({ gen: w.gen, block: w.chainBlock - 1, hash: w.hash }); saveSeason(); }
      /* the block just played is a round's last block: note the crown there */
      if (CR) { const b = w.chainBlock - 1; if (b >= CR.genesis && (b - CR.genesis + 1) % CR.roundBlocks === 0) {
        const r = (b - CR.genesis + 1) / CR.roundBlocks - 1;
        S.season.rounds = (S.season.rounds || []).filter((x) => x.r !== r).concat([{ r, block: b, winner: w.crown >= 0 ? w.blocks[w.crown].adr : null, sym: w.crown >= 0 ? w.blocks[w.crown].sym : null, hash: w.hash, gen: w.gen }]).slice(-200);
        saveSeason(); } }
    }
  }

  /* A SEASON CLOSED FOR A RULES CHANGE (not ended) keeps its PAID entries: they re-enter the running season at the next block read, as
   *   join facts in its journal (so "Verify" still replays it). Read from the closed season's own journal on the volume; done once
   *   (history[k].carried). Measured 2026-11-16: OUSD paid $2 at 58,259,553 in the season closed by engine v2. */
  function carryPaidEntries() {
    if (!dir || !S.season || !S.world) return;
    for (const h of S.history) {
      if (!h.closed || h.carried || h.id === S.season.id) continue;
      h.carried = true;
      let joins = [];
      try { joins = readFileSync(f(journalName(h.id)), 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)).filter((x) => x.join && x.tx); } catch { joins = []; }
      for (const j of joins) {
        if (S.season.blocks.some((b) => b.adr === j.join.adr) || (S.pendingJoins || []).some((p) => p.join.adr === j.join.adr)) continue;
        const last = Math.max(0, ...S.season.blocks.map((x) => x.joinedAt || 0), ...(S.pendingJoins || []).map((p) => p.bloc)), at = Math.max(S.readTo + 1, last + 1);
        const nb = { ...j.join, joinedAt: at }; S.season.blocks.push(nb);
        S.pendingJoins = (S.pendingJoins || []).concat({ bloc: at, join: j.join, tx: j.tx, payer: j.payer, carriedFrom: h.id });
        log('[life] paid entry ' + j.join.sym + ' (tx ' + j.tx + ') carried from season ' + h.id);
      }
      writeJson('seasons.json', S.history); saveSeason();
    }
  }

  async function tick() {
    if (S.busy) return; S.busy = true; S.lastTickAt = Date.now();
    try {
      const h = await head();
      if (!S.season || S.readTo >= S.season.end - 1) { if (!startSeason(h)) return; }
      carryPaidEntries();
      const to = Math.min(h, S.readTo + READ_MAX, S.season.end - 1);
      if (to > S.readTo) {
        const faits = await read(to);
        /* joins waiting for this window go into the journal at their block, before that block's transfers */
        const J = (S.pendingJoins || []).filter((x) => x.bloc <= to); S.pendingJoins = (S.pendingJoins || []).filter((x) => x.bloc > to);
        if (J.length) { faits.push(...J); faits.sort((x, y) => x.bloc - y.bloc || (x.join ? -1 : 0) - (y.join ? -1 : 0) || (x.log || 0) - (y.log || 0)); }
        if (dir && faits.length) appendFileSync(f(journalName(S.season.id)), faits.map((x) => JSON.stringify(x) + '\n').join(''));
        E.appendFacts(S.world, faits, to); S.readTo = to; S.reads++;
        S.recent.push(...faits); const cut = to - RECENT_BLOCKS; if (S.recent.length && S.recent[0].bloc <= cut) S.recent = S.recent.filter((x) => x.bloc > cut);
        saveSeason(); S.lastError = null;
      }
    } catch (e) { S.lastError = String(e && e.message || e).slice(0, 200); }
    finally { S.busy = false; }
  }

  let timer = null, stepper = null;
  function start(ms = 10000) {
    load();
    tick(); timer = setInterval(tick, ms);
    /* stepping is time-sliced (a few ms at a time) so the server keeps answering while the world catches up */
    const slice = () => { if (S.world) stepFor(40); stepper = setTimeout(slice, S.world && S.world.chainBlock <= S.world.data.a ? 5 : 200); };
    slice();
  }
  function stop() { clearInterval(timer); clearTimeout(stepper); }

  return {
    start, stop, tick, load, stepFor, startSeason,
    /** the current world as a JSON STRING, for a page to continue it locally (cached 3 s: many viewers, one serialisation).
     *  ⛔ A STRING, frozen at the moment it is made: serializeWorld shares nested objects with the living world (cum, tank, counts),
     *    so a cached OBJECT stringified 2 s later mixed the cells of T with the counters of T+2 s — measured 2026-11-16: the page's
     *    "Verify" replay of the journal disagreed with the page while the server agreed with the journal. */
    state() {
      if (!S.world) return JSON.stringify({ ok: false, etat: 'NOT_STARTED', pourquoi: S.lastError });
      const now = Date.now(); if (S.stateCache && now - S.stateCache.at < 3000) return S.stateCache.v;
      const v = JSON.stringify({ ok: true, season: { id: S.season.id, de: S.season.de, end: S.season.end, players: S.season.blocks.length, hashes: S.season.hashes, startedAt: S.season.startedAt },
        readTo: S.readTo, world: E.serializeWorld(S.world), history: S.history.slice(0, 5) });
      S.stateCache = { at: now, v }; return v;
    },
    /** facts after block `depuis` (the page appends them); `reload` when the page is too far behind the memory window or in another season */
    faits(depuis, seasonId) {
      if (!S.world) return { ok: false, etat: 'NOT_STARTED' };
      if (seasonId !== S.season.id || !Number.isSafeInteger(depuis) || depuis < S.readTo - RECENT_BLOCKS + 1 || depuis > S.readTo) return { ok: true, reload: true, season: S.season.id, readTo: S.readTo };
      return { ok: true, season: S.season.id, readTo: S.readTo, faits: S.recent.filter((x) => x.bloc > depuis) };
    },
    /** the whole season journal, for anybody to replay and check the hashes */
    journal() { return S.season && dir && existsSync(f(journalName(S.season.id))) ? readFileSync(f(journalName(S.season.id)), 'utf8') : ''; },
    /** the crown noted at round r's last block, or null (not played yet, or another season) */
    roundCrown(r) { return S.season && (S.season.rounds || []).find((x) => x.r === r) || null; },
    status() { return { season: S.season && S.season.id, players: S.season && S.season.blocks.length, gen: S.world && S.world.gen, chainBlock: S.world && S.world.chainBlock, readTo: S.readTo, behind: S.world ? S.readTo - S.world.chainBlock + 1 : null, calls: S.calls, reads: S.reads, lastError: S.lastError, lastTickAt: S.lastTickAt }; },
    /** TEST ONLY until the TBLOCK entry exists: a block enters at the next block read (the server wires this only in test mode) */
    joinForTest(b) {
      if (!S.world) throw new Error('no season');
      /* one join per block: two joins at the same block would need an order the journal does not carry */
      const last = Math.max(0, ...S.season.blocks.map((x) => x.joinedAt || 0)), at = Math.max(S.readTo + 1, last + 1), nb = { adr: bas(b.adr), sym: String(b.sym || '').slice(0, 16), nom: String(b.nom || '').slice(0, 60), action: !!b.action, liquiditeUsd: Math.round(Number(b.liquiditeUsd) || 0), pools: (b.pools || []).map(bas), joinedAt: at };
      if (S.season.blocks.some((x) => x.adr === nb.adr)) throw new Error('already in the game');
      S.season.blocks.push(nb); const fact = { bloc: at, join: nb };
      S.pendingJoins = (S.pendingJoins || []).concat(fact); /* appended with the next read, so the journal stays in block order */
      return { at };
    },
    _S: S,
  };
}
