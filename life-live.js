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

export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
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

export function createLifeLive({ rpc, dir = null, lignes, poolManager, log = () => {}, seasonBlocks = E.SEASON_BLOCKS, stepBudgetMs = 1200 }) {
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
    S.season = { id: s.id, de: s.de, end: s.end, blocks: s.blocks, hashes: s.hashes || [], startedAt: s.startedAt };
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
    S.season = { id, de: h + 1, end: h + 1 + seasonBlocks, blocks, hashes: [], startedAt: new Date().toISOString() };
    S.world = E.createLiveWorld(blocks, h + 1); S.readTo = h; S.recent = [];
    saveSeason(); saveCheckpoint(); log('[life] season ' + id + ' starts at block ' + (h + 1) + ' with ' + blocks.length + ' players');
    return true;
  }

  /* read every player's Transfer logs in (readTo, to]; all-or-nothing */
  async function read(to) {
    const from = S.readTo + 1, idx = index(), B = S.season.blocks, logs = [];
    /* a joined block is read from its join block only */
    const active = B.filter((b) => !b.joinedAt || b.joinedAt <= to);
    for (let k = 0; k < active.length; k += ADDR_PER_CALL) {
      const r = await call('eth_getLogs', [{ fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), address: active.slice(k, k + ADDR_PER_CALL).map((b) => b.adr), topics: [TRANSFER] }]);
      if (!Array.isArray(r)) throw new Error('eth_getLogs did not answer a list');
      logs.push(...r);
    }
    const faits = logs.map((l) => factFromLog(l, idx, B)).filter((x) => x && x.bloc >= from && x.bloc <= to && (!B[x.b].joinedAt || x.bloc >= B[x.b].joinedAt));
    faits.sort((x, y) => x.bloc - y.bloc || x.log - y.log || (x.tx < y.tx ? -1 : 1));
    return faits;
  }

  function stepFor(ms) {
    const t0 = Date.now(), w = S.world;
    while (w.chainBlock <= w.data.a && Date.now() - t0 < ms) {
      E.stepWorld(w);
      if (w.gen % CP_EVERY === 0) saveCheckpoint();
      if (w.gen % HASH_EVERY === 0) { S.season.hashes.push({ gen: w.gen, block: w.chainBlock - 1, hash: w.hash }); saveSeason(); }
    }
  }

  async function tick() {
    if (S.busy) return; S.busy = true; S.lastTickAt = Date.now();
    try {
      const h = await head();
      if (!S.season || S.readTo >= S.season.end - 1) { if (!startSeason(h)) return; }
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
