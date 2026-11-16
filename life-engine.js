// life-block/engine.js — "Game of Life Block": the world as a pure function of public data.
// ================================================================================================
// RULES (all of them, nothing else moves the world):
//  - Conway's rule B3/S23. The plane is 32,768 cells wide (unbounded in practice: colonies live within a few thousand cells);
//    a cell that reaches its outer band leaves the game.
//  - Every live cell belongs to a block (an index into the player list) or is NEUTRAL (-1). A surviving cell keeps its owner.
//    A newborn cell takes the owner held by at least 2 of its 3 parents, else it is born neutral (the multi-colour Life known as
//    "Immigration", generalised to many colours; three different parents give a neutral cell).
//  - ONE GENERATION = ONE BASE BLOCK (0.2 s). The world clock is the chain's clock.
//  - Every BEAT_BLOCKS blocks each player's brain (cerveau.js: 128 spiking neurons wired from its own address) takes one step,
//    fed with the facts of its OWN market read on chain during that beat (buys, sells, new receivers), each dated by its block.
//    Its mood decides ONE gesture at the edge of its territory (GESTURES). The brain REACTS with fixed rules, no strategy.
//  - A gesture only writes EMPTY cells: no block can paint over another block's territory.
//  - Budgets cap the gestures per block and per hour of chain; above CELL_CAP live cells, growth gestures pause.
//  - THE CROWN (replaced the fixed hills on 2026-11-16: fixed rings did not reach most colonies): each beat, the block with the
//    most live cells wears it; a tie leaves it where it was. EVENTS (the kill feed) are computed here, so they replay too.
//  - Starting places come from keccak(address) on a golden-angle spiral: nobody chooses where a block lands.
// VERIFIABLE: no Math.random, no clock. Same data in, same world out; `hash` fingerprints every cell and its owner, order-free.
import { etatInitial, pas } from '../cerveau.js';
import { keccak256Hex } from '../keccak.js';

export const BEAT_BLOCKS = 10;          /* the brain beats every 10 chain blocks = 2 s */
export const BLOCKS_PER_HOUR = 18000;   /* 3600 s / 0.2 s */
export const CELL_CAP = 24000;          /* above this, growth gestures pause (defence still allowed) */
export const HARD_CAP = 400000;         /* the table size the engine accepts; past it the world stops and says so */
export const SPACING = 34;              /* spiral spacing: neighbours start ~60 cells apart */
export const FEAST = 12;                /* a block that eats at least this many cells of ONE rival in a beat makes the feed */
export const GESTURES = Object.freeze({
  glider: { mood: 'EXCITE', perHour: 60, grows: true, fromFacts: true, says: 'launches gliders' },
  rush: { mood: 'EXCITE', perHour: 12, grows: true, fromFacts: true, says: 'rushes a fast ship (buys far ahead of sells)' },
  colony: { mood: 'any', perHour: 20, grows: false, fromFacts: true, says: 'settles an outpost (new holders)' },
  bloom: { mood: 'EXCITE', perHour: 4, grows: true, fromFacts: true, says: 'blooms on a burst of buys' },
  scout: { mood: 'CURIEUX', perHour: 12, grows: true, fromFacts: false, says: 'sends a scout ship' },
  shield: { mood: 'INQUIET', perHour: 30, grows: false, fromFacts: true, says: 'sets a still shield' },
  wall: { mood: 'INQUIET', perHour: 6, grows: false, fromFacts: true, says: 'builds a wall on a burst of sells' },
  heartbeat: { mood: 'CALME', perHour: 20, grows: false, fromFacts: false, says: 'keeps a heartbeat' },
  /* COMBINATIONS: a mood crossed with what is around the colony (Phil 2026-11-16: "d'autres reactions pour plus de combinaisons") */
  hunt: { mood: 'EXCITE', perHour: 20, grows: true, fromFacts: true, says: 'hunts: a glider aimed at the nearest rival' },
  revenge: { mood: 'any', perHour: 10, grows: true, fromFacts: false, says: 'strikes back at the rival that ate its cells' },
  eater: { mood: 'CURIEUX', perHour: 8, grows: false, fromFacts: false, says: 'lays an eater in a rival path' },
  spore: { mood: 'INQUIET', perHour: 8, grows: true, fromFacts: true, says: 'sends a spore away from danger (losing ground)' },
});
const BURST = 5;

/* ── cells: 30-bit integer keys (small integers stay fast in a Map) ── */
const HALF = 16384, EDGE = HALF - 8;
export const key = (x, y) => ((x + HALF) << 15) | (y + HALF);
export const kx = (k) => (k >> 15) - HALF;
export const ky = (k) => (k & 32767) - HALF;
const NOFF = [-32769, -32768, -32767, -1, 1, 32767, 32768, 32769];
const inside = (x, y) => x > -EDGE && x < EDGE && y > -EDGE && y < EDGE;

/* a reusable open-addressing table for neighbour counts (cleared by a generation stamp, not by writing zeros) */
const CAP = 1 << 21, MASK = CAP - 1;
const tKeys = new Int32Array(CAP), tCnt = new Uint8Array(CAP), tStamp = new Uint32Array(CAP), tUsed = new Int32Array(CAP);
let stamp = 0;

function mix(k, o) { let h = (k ^ Math.imul(o + 2, 0x9e3779b1)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; }
const hex8 = (n) => ('00000000' + (n >>> 0).toString(16)).slice(-8);

/** one Life generation (B3/S23 with owners): { next, births, hash } */
export function lifeStep(cells) {
  if (cells.size * 9 > CAP * 0.6) throw new Error('world too large for the table: ' + cells.size + ' cells');
  stamp = (stamp + 1) >>> 0 || 1; let used = 0;
  for (const k of cells.keys()) for (let j = 0; j < 8; j++) {
    const n = k + NOFF[j]; let s = Math.imul(n, 0x9e3779b1) >>> 11 & MASK;
    while (tStamp[s] === stamp && tKeys[s] !== n) s = (s + 1) & MASK;
    if (tStamp[s] !== stamp) { tStamp[s] = stamp; tKeys[s] = n; tCnt[s] = 1; tUsed[used++] = s; } else tCnt[s]++;
  }
  const next = new Map(), births = new Map(), eaten = new Map(), lost = new Map(), pairs = new Map(); /* pairs: victim*4096+eater -> cells */ let hs = 0, hx = 0;
  for (let u = 0; u < used; u++) {
    const s = tUsed[u], c = tCnt[s]; if (c !== 2 && c !== 3) continue;
    const k = tKeys[s], cur = cells.get(k); let o;
    if (cur !== undefined) {
      /* PREDATION (Phil 2026-11-16: "les cellules peuvent manger celles des autres"): a surviving cell with 2 or more neighbours
       *   of ONE rival block, and fewer of its own kind, is eaten: it changes colour. Life's population is unchanged (no cell
       *   appears or dies), only the owner moves, so B3/S23 stays exact. A survivor has at most 3 neighbours, so at most one rival
       *   can reach 2: the rule never has to break a tie. Neutral cells (-1) never eat, but can be eaten. */
      o = cur; let a = -2, b = -2, own = 0, r = -2, rn = 0; /* the (at most 3) rival neighbours: two of them equal = that rival has 2 */
      for (let j = 0; j < 8; j++) { const v = cells.get(k + NOFF[j]); if (v === undefined) continue; if (v === cur) own++; else if (v >= 0) { if (v === a || v === b) { r = v; rn = 2; } else if (a === -2) a = v; else b = v; } }
      if (rn >= 2 && rn > own) { o = r; eaten.set(r, (eaten.get(r) || 0) + 1); if (cur >= 0) { lost.set(cur, (lost.get(cur) || 0) + 1); const pk = cur * 4096 + r; pairs.set(pk, (pairs.get(pk) || 0) + 1); } }
    } else {
      if (c !== 3) continue;
      const x = kx(k), y = ky(k); if (!inside(x, y)) continue;
      let a = null, b = null, d = null;
      for (let j = 0; j < 8; j++) { const v = cells.get(k + NOFF[j]); if (v !== undefined) { if (a === null) a = v; else if (b === null) b = v; else { d = v; break; } } }
      o = a === b || a === d ? a : b === d ? b : -1;
      if (o >= 0) births.set(o, (births.get(o) || 0) + 1);
    }
    next.set(k, o); const m = mix(k, o); hs = (hs + m) >>> 0; hx = (hx ^ Math.imul(m, 2654435761)) >>> 0;
  }
  return { next, births, eaten, lost, pairs, hash: hex8(hs) + hex8(hx) + ':' + next.size };
}
/** the same fingerprint, computed from scratch (to check a world built another way) */
export function worldHash(cells) { let hs = 0, hx = 0; for (const [k, o] of cells) { const m = mix(k, o); hs = (hs + m) >>> 0; hx = (hx ^ Math.imul(m, 2654435761)) >>> 0; } return hex8(hs) + hex8(hx) + ':' + cells.size; }

/* the patterns a gesture can place, as [x, y]; gliders and ships are turned toward the gesture's direction */
const P = {
  glider: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],                              /* moves (+1,+1) every 4 generations */
  lwss: [[1, 0], [4, 0], [0, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3]], /* moves (-1,0) every 2 generations */
  rpent: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],                                /* the R-pentomino: a long burst of growth */
  block: [[0, 0], [1, 0], [0, 1], [1, 1]],
  beehive: [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2]],
  blinker: [[0, 0], [1, 0], [2, 0]],
  eater: [[0, 0], [1, 0], [0, 1], [2, 1], [2, 2], [2, 3], [3, 3]],               /* eater 1: still, it swallows a glider that hits it */
};
function orient(cells, dir, kind) {
  const [dx, dy] = dir;
  if (kind === 'glider') { const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1; return cells.map(([x, y]) => [x * sx, y * sy]); }
  if (Math.abs(dx) >= Math.abs(dy)) { const s = dx >= 0 ? -1 : 1; return cells.map(([x, y]) => [x * s, y]); }
  const s = dy >= 0 ? -1 : 1; return cells.map(([x, y]) => [y, x * s]);
}
function seedBits(addr, salt) { return keccak256Hex(new TextEncoder().encode(addr + ':' + salt)); }

/** The world at generation 0, from the recorded data { blocks, faits, de, a }. */
export function createWorld(data) {
  const blocks = data.blocks.map((b, i) => ({ ...b, i }));
  const order = blocks.map((b) => ({ b, h: seedBits(b.adr, 'place') })).sort((p, q) => (p.h < q.h ? -1 : 1));
  const golden = Math.PI * (3 - Math.sqrt(5));
  order.forEach(({ b }, r) => { const rad = SPACING * Math.sqrt(r + 0.5), a = r * golden; b.home = [Math.round(Math.cos(a) * rad), Math.round(Math.sin(a) * rad)]; });
  const cells = new Map();
  for (const b of blocks) {
    const h = seedBits(b.adr, 'soup') + seedBits(b.adr, 'soup2').slice(2);
    for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) {
      if (parseInt(h[2 + ((y * 6 + x) % 128)], 16) < 6) { cells.set(key(b.home[0] - 6 + x, b.home[1] - 6 + y), b.i); cells.set(key(b.home[0] + 5 - x, b.home[1] - 6 + y), b.i); }
    }
  }
  const beats = Math.ceil((data.a - data.de + 1) / BEAT_BLOCKS), perBeat = new Map();
  for (const f of data.faits) { const k = Math.floor((f.bloc - data.de) / BEAT_BLOCKS); if (k < 0 || k >= beats) continue; if (!perBeat.has(k)) perBeat.set(k, []); perBeat.get(k).push(f); }
  const players = blocks.map((b) => newPlayer(b));
  return { data, blocks, players, cells, gen: 0, chainBlock: data.de, perBeat, beats, crown: -1, events: [], eventCount: 0, log: [], logCount: 0, hash: worldHash(cells), capped: false, stopped: null };
}
function newPlayer(b) {
  return { brain: etatInitial(b.adr), cum: { achats: 0, ventes: 0, detenteurs: 0 }, prev: null, seen: new Set(), mood: 'NON_LU', vu: null,
    tank: Object.fromEntries(Object.keys(GESTURES).map((g) => [g, tankOf(g)])), counts: Object.fromEntries(Object.keys(GESTURES).map((g) => [g, 0])), births: 0, crownBeats: 0, everAlive: false, eaten: 0, lost: 0, lostBy: new Map(), lastN: 0, last: null };
}

function feedBrain(world, i, beatFacts, block) {
  const p = world.players[i], b = world.blocks[i];
  for (const f of beatFacts) {
    if (f.kind === 'achat') p.cum.achats++; else if (f.kind === 'vente') p.cum.ventes++;
    if (!b.pools.includes(f.vers) && !p.seen.has(f.vers)) { p.seen.add(f.vers); p.cum.detenteurs++; }
  }
  const prev = p.prev, vie = b.liquiditeUsd > 0 ? b.liquiditeUsd : null;
  const r = pas(p.brain, { vie, vieAvant: vie, achats: p.cum.achats, ventes: p.cum.ventes, detenteurs: p.cum.detenteurs,
    achatsAvant: prev ? prev.achats : null, ventesAvant: prev ? prev.ventes : null, detenteursAvant: prev ? prev.detenteurs : null, bloc: block });
  p.brain = r.etat; p.vu = r.vu; p.mood = r.vu.phase; p.prev = { ...p.cum };
  return r.vu;
}
function territories(cells, n) {
  const t = Array.from({ length: n }, () => ({ n: 0, list: [] }));
  for (const [k, o] of cells) if (o >= 0) { const T = t[o]; T.n++; if (T.list.length < 3000) T.list.push(k); }
  return t;
}
function edgePoint(T, home, dir) { let best = -1, bv = -Infinity; for (const k of T.list) { const v = (kx(k) - home[0]) * dir[0] + (ky(k) - home[1]) * dir[1]; if (v > bv || (v === bv && k < best)) { bv = v; best = k; } } return best >= 0 ? [kx(best), ky(best)] : [home[0], home[1]]; }
function nearestEnemy(cells, from, me, R = 30) {
  for (let r = 1; r <= R; r++) for (let d = -r; d <= r; d++) for (const [x, y] of [[from[0] + d, from[1] - r], [from[0] + d, from[1] + r], [from[0] - r, from[1] + d], [from[0] + r, from[1] + d]]) {
    const o = cells.get(key(x, y)); if (o !== undefined && o !== me && o >= 0) return [x, y];
  }
  return null;
}
/* BUDGETS ARE A TANK THAT REFILLS: perHour spread over the hour (measured on the first build: with a plain "N per hour" the busy
 *   stocks spent their hour's gliders in about 80 s of chain, then the world went quiet). A block keeps at most TANK gestures ahead. */
export const tankOf = (g) => Math.max(2, Math.ceil(GESTURES[g].perHour / 10));
function refill(p) { for (const g of Object.keys(GESTURES)) p.tank[g] = Math.min(tankOf(g), p.tank[g] + GESTURES[g].perHour * BEAT_BLOCKS / BLOCKS_PER_HOUR); }
function canUse(p, g) { return p.tank[g] >= 1; }
function place(cells, pts, at, owner) { let n = 0; for (const [x, y] of pts) { const X = at[0] + x, Y = at[1] + y; if (!inside(X, Y)) continue; const k = key(X, Y); if (!cells.has(k)) { cells.set(k, owner); n++; } } return n; }

function event(world, e) { world.events.push({ block: world.chainBlock, ...e }); world.eventCount++; if (world.events.length > 200) world.events.splice(0, world.events.length - 200); }
/* the kill feed, read at the start of a beat from what Life did since the last one (the loss ledger is reset by the beat after) */
function feedEvents(world, T) {
  for (let i = 0; i < world.players.length; i++) {
    const p = world.players[i], n = T[i].n;
    for (const [e, c] of p.lostBy) if (c >= FEAST) event(world, { type: 'feast', i: e, v: i, n: c });
    if (p.everAlive && p.lastN > 0 && n === 0) event(world, { type: 'wiped', i });
    if (p.everAlive && p.lastN === 0 && n > 0 && world.gen > 0) event(world, { type: 'back', i });
    if (n > 0) p.everAlive = true;
  }
}
/** who wears the crown: the most live cells; a tie (or an empty world) leaves it on the current head. Returns [head, cells]. */
export function crownOf(cells, players, current) {
  const n = new Array(players).fill(0); for (const o of cells.values()) if (o >= 0) n[o]++;
  let best = current, bn = best >= 0 ? n[best] : 0; for (let i = 0; i < n.length; i++) if (n[i] > bn) { bn = n[i]; best = i; }
  return [bn > 0 ? best : current, bn];
}
function holdCrown(world) {
  const [best, bn] = crownOf(world.cells, world.players.length, world.crown);
  if (best >= 0 && best !== world.crown) { event(world, { type: 'crown', i: best, from: world.crown, n: bn }); world.crown = best; }
  if (world.crown >= 0) world.players[world.crown].crownBeats++;
}

function beat(world) {
  const k = Math.floor((world.chainBlock - world.data.de) / BEAT_BLOCKS), facts = world.perBeat.get(k) || [];
  const byBlock = new Map(); for (const f of facts) { if (!byBlock.has(f.b)) byBlock.set(f.b, []); byBlock.get(f.b).push(f); }
  const T = territories(world.cells, world.blocks.length);
  feedEvents(world, T);
  world.capped = world.cells.size >= CELL_CAP;
  for (let i = 0; i < world.blocks.length; i++) {
    const b = world.blocks[i], p = world.players[i], mine = byBlock.get(i) || [];
    const holdersBefore = p.cum.detenteurs;
    const vu = feedBrain(world, i, mine, world.chainBlock);
    refill(p);
    const buys = mine.filter((f) => f.kind === 'achat').length, sells = mine.filter((f) => f.kind === 'vente').length, newHolders = p.cum.detenteurs - holdersBefore;
    const base = Math.atan2(b.home[1], b.home[0]) + vu.virage * Math.PI / 2, dirAt = (a) => [Math.cos(a), Math.sin(a)], dir = dirAt(base);
    const Ti = T[i], edge = edgePoint(Ti, b.home, dir), out = (d, n = 3) => [Math.round(edge[0] + d[0] * n), Math.round(edge[1] + d[1] * n)];
    /* THE MARKET MOVES THE COLONY (Phil 2026-11-16: "des regles qui lient le marche avec leur mouvement"): a beat can carry several
     *   gestures, each paid from its own tank — the mood picks the family, the numbers of the beat pick how much and how fast. */
    const plan = [];
    if (p.mood === 'EXCITE') {
      if (buys >= BURST) plan.push(['bloom', P.rpent, out(dir)]);
      /* buys far ahead of sells: a fast ship (c/2) instead of gliders (c/4) — the colony moves at the speed of its market */
      if (buys >= 3 && buys >= 2 * sells) plan.push(['rush', orient(P.lwss, dir, 'lwss'), out(dir, 4)]);
      /* one glider per 3 buys (at least one, at most 3), fanned 25 degrees apart */
      const n = Math.max(1, Math.min(3, Math.ceil(buys / 3)));
      for (let j = 0; j < n; j++) { const d = dirAt(base + (j - (n - 1) / 2) * 0.44); plan.push(['glider', orient(P.glider, d, 'glider'), out(d, 3 + j)]); }
    } else if (p.mood === 'CURIEUX') plan.push(['scout', orient(P.lwss, dir, 'lwss'), out(dir)]);
    else if (p.mood === 'INQUIET') {
      const foe = nearestEnemy(world.cells, edge, i) || [edge[0] + dir[0] * 6, edge[1] + dir[1] * 6];
      const at = [Math.round((edge[0] * 2 + foe[0]) / 3), Math.round((edge[1] * 2 + foe[1]) / 3)];
      if (sells >= BURST) { const px = -dir[1], py = dir[0]; plan.push(['wall', [-5, 0, 5].flatMap((s) => P.block.map(([x, y]) => [x + Math.round(px * s), y + Math.round(py * s)])), at]); }
      else plan.push(['shield', k % 2 ? P.beehive : P.block, at]);
    } else if (p.mood === 'CALME' && Ti.n < 60) plan.push(['heartbeat', P.blinker, [b.home[0] + 2, b.home[1] + 2]]);
    /* COMBINATIONS — the mood crossed with the neighbourhood and the war:
     *   EXCITE + a rival within 30 cells of the edge: a hunting glider aimed at it (predation then eats what it hits).
     *   CURIEUX + a rival near: an eater laid one third of the way to it, across its path.
     *   INQUIET + the colony shrank by a fifth since the last beat: a spore (glider) sent AWAY from the rival, to restart elsewhere.
     *   any mood but asleep + cells eaten since the last beat: revenge, a glider aimed at the block that ate the most. */
    const foeNear = p.mood === 'DORMANT' ? null : nearestEnemy(world.cells, edge, i);
    const toward = (to) => { const dx = to[0] - edge[0], dy = to[1] - edge[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; };
    if (foeNear && p.mood === 'EXCITE') { const d = toward(foeNear); plan.push(['hunt', orient(P.glider, d, 'glider'), out(d, 3)]); }
    if (foeNear && p.mood === 'CURIEUX') plan.push(['eater', P.eater, [Math.round((edge[0] * 2 + foeNear[0]) / 3), Math.round((edge[1] * 2 + foeNear[1]) / 3)]]);
    if (foeNear && p.mood === 'INQUIET' && p.lastN > 0 && Ti.n < p.lastN * 0.8) { const d = toward(foeNear); const away = [-d[0], -d[1]]; plan.push(['spore', orient(P.glider, away, 'glider'), out(away, 4)]); }
    if (p.mood !== 'DORMANT' && p.lostBy.size) {
      let foe = -1, fn = 0; for (const [o, n] of p.lostBy) if (n > fn || (n === fn && o < foe)) { foe = o; fn = n; }
      const tgt = T[foe] && T[foe].list.length ? T[foe].list.reduce((best, kk) => { const d = Math.hypot(kx(kk) - edge[0], ky(kk) - edge[1]); return d < best[0] ? [d, kk] : best; }, [Infinity, -1])[1] : -1;
      if (tgt >= 0) { const d = toward([kx(tgt), ky(tgt)]); plan.push(['revenge', orient(P.glider, d, 'glider'), out(d, 3)]); }
    }
    p.lostBy = new Map(); p.lastN = Ti.n;
    /* new holders, whatever the mood: an outpost (a beehive) settled 9 to 14 cells beyond the edge, one per new receiver (max 2) */
    for (let j = 0; j < Math.min(2, newHolders); j++) { const d = dirAt(base + (j ? -0.9 : 0.9)); plan.push(['colony', P.beehive, out(d, 9 + j * 5)]); }
    for (const [g, pts, at] of plan) {
      if (!canUse(p, g) || (GESTURES[g].grows && world.capped)) continue;
      if (!place(world.cells, pts, at, i)) continue;
      p.tank[g] -= 1; p.counts[g]++; p.last = { g, block: world.chainBlock, at };
      world.log.push({ block: world.chainBlock, i, g, buys, sells, holders: newHolders, mood: p.mood, at }); world.logCount++; /* the log keeps 400; the count never stops */
      if (world.log.length > 400) world.log.splice(0, world.log.length - 400);
    }
  }
  holdCrown(world);
}

/** advance one generation (= one Base block); brains beat at the start of each beat */
export function stepWorld(world) {
  if (world.stopped || world.chainBlock > world.data.a) return world;
  if ((world.chainBlock - world.data.de) % BEAT_BLOCKS === 0) beat(world);
  if (world.cells.size > HARD_CAP) { world.stopped = 'the world grew past ' + HARD_CAP + ' cells'; return world; }
  const { next, births, eaten, lost, pairs, hash } = lifeStep(world.cells);
  for (const [o, n] of births) world.players[o].births += n;
  for (const [o, n] of eaten) world.players[o].eaten += n;
  for (const [o, n] of lost) world.players[o].lost += n;
  /* who ate whom since the last beat: read by "revenge" (the eater of most cells is the target) */
  for (const [pk, n] of pairs) { const m = world.players[Math.floor(pk / 4096)].lostBy, e = pk % 4096; m.set(e, (m.get(e) || 0) + n); }
  world.cells = next; world.gen++; world.chainBlock++; world.hash = hash;
  return world;
}

export function ranking(world) {
  const n = new Array(world.blocks.length).fill(0); let neutral = 0;
  for (const o of world.cells.values()) { if (o >= 0) n[o]++; else neutral++; }
  return { neutral, rows: world.blocks.map((b, i) => ({ i, sym: b.sym, cells: n[i], mood: world.players[i].mood, births: world.players[i].births, eaten: world.players[i].eaten, lost: world.players[i].lost, crowns: world.players[i].crownBeats, counts: world.players[i].counts }))
    .sort((p, q) => q.cells - p.cells || q.crowns - p.crowns || (p.sym < q.sym ? -1 : 1)) };
}

const copyPlayer = (p) => ({ brain: structuredClone(p.brain), cum: { ...p.cum }, prev: p.prev && { ...p.prev }, seen: new Set(p.seen), mood: p.mood, vu: p.vu,
  tank: { ...p.tank }, counts: { ...p.counts }, births: p.births, crownBeats: p.crownBeats, everAlive: p.everAlive, eaten: p.eaten, lost: p.lost, lostBy: new Map(p.lostBy), lastN: p.lastN, last: p.last });
export function snapshot(world) {
  return { gen: world.gen, chainBlock: world.chainBlock, cells: new Map(world.cells), hash: world.hash, capped: world.capped, stopped: world.stopped, logLen: world.log.length, logCount: world.logCount,
    crown: world.crown, eventsLen: world.events.length, eventCount: world.eventCount, players: world.players.map(copyPlayer) };
}
export function restore(world, s) {
  world.gen = s.gen; world.chainBlock = s.chainBlock; world.cells = new Map(s.cells); world.hash = s.hash; world.capped = s.capped; world.stopped = s.stopped;
  world.log.length = Math.min(world.log.length, s.logLen); world.logCount = s.logCount; world.crown = s.crown; world.events.length = Math.min(world.events.length, s.eventsLen); world.eventCount = s.eventCount; world.players = s.players.map(copyPlayer);
  return world;
}
