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
import { etatInitial, pas } from './cerveau.js';
import { keccak256Hex } from './keccak.js';

/* the RULES' version: a season is replayed with the engine of its version only. 2 = the crown margin (2026-11-16). A server that loads
 *   a season of another version closes it and starts a new one (life-live.js), so "Verify" never compares two rule sets. */
export const ENGINE_VERSION = 2;
export const BEAT_BLOCKS = 10;          /* the brain beats every 10 chain blocks = 2 s */
export const BLOCKS_PER_HOUR = 18000;   /* 3600 s / 0.2 s */
export const CELL_CAP = 24000;          /* above this, growth gestures pause (defence still allowed) */
export const HARD_CAP = 400000;         /* the table size the engine accepts; past it the world stops and says so */
export const SPACING = 34;              /* spiral spacing: neighbours start ~60 cells apart */
export const FEAST = 12;
export const CHASE_REACH = 80;
export const GUN_BUYS = 8;              /* buys in one beat that make a brain build a glider gun */          /* a block goes for the crown when the leader has a cell within 80 cells of its edge */
export const SEASON_BLOCKS = 432000;    /* a live season = 24 h of Base blocks; the winner wore the crown for the most beats */                /* a block that eats at least this many cells of ONE rival in a beat makes the feed */
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
  /* THE GOAL IS THE CROWN (Phil 2026-11-16: "le but est d'avoir la couronne, donc le plus de territoire possible") */
  /* MACHINES (Phil 2026-11-16: "elles peuvent faire des machines automatisees si les brains le veulent"): a glider gun keeps firing
   *   on its own, one glider every 30 generations, until something breaks it — the block's market built it, Life runs it */
  gun: { mood: 'EXCITE', perHour: 1, grows: true, fromFacts: true, says: 'builds a glider gun (a machine that fires on its own)' },
  chase: { mood: 'EXCITE', perHour: 12, grows: true, fromFacts: true, says: 'goes for the crown: a glider aimed at the leader' },
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
  eater: [[0, 0], [1, 0], [0, 1], [2, 1], [2, 2], [2, 3], [3, 3]],
  /* Gosper's glider gun (1970): period 30, fires toward (+1,+1); mirrored by orient() like a glider */
  gun: [[24, 0], [22, 1], [24, 1], [12, 2], [13, 2], [20, 2], [21, 2], [34, 2], [35, 2], [11, 3], [15, 3], [20, 3], [21, 3], [34, 3], [35, 3],
    [0, 4], [1, 4], [10, 4], [16, 4], [20, 4], [21, 4], [0, 5], [1, 5], [10, 5], [14, 5], [16, 5], [17, 5], [22, 5], [24, 5], [10, 6], [16, 6], [24, 6],
    [11, 7], [15, 7], [12, 8], [13, 8]],               /* eater 1: still, it swallows a glider that hits it */
};
function orient(cells, dir, kind) {
  const [dx, dy] = dir;
  if (kind === 'glider') { const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1; return cells.map(([x, y]) => [x * sx, y * sy]); }
  if (Math.abs(dx) >= Math.abs(dy)) { const s = dx >= 0 ? -1 : 1; return cells.map(([x, y]) => [x * s, y]); }
  const s = dy >= 0 ? -1 : 1; return cells.map(([x, y]) => [y, x * s]);
}
/* ⛔ CAUSAL (2026-11-16): the beat at block de+10k reacts to the facts of the 10 blocks BEFORE it (de+10(k-1) .. de+10k-1).
 *   It used to read de+10k .. de+10k+9 — blocks not yet played. A replay has them all, so nothing showed; LIVE, a read that stopped
 *   inside a window let the beat run without its last facts, and the server drifted from its own journal (measured: buys 120 vs 125). */
const beatOf = (bloc, de) => Math.floor((bloc - de) / BEAT_BLOCKS) + 1;
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
  for (const f of data.faits) { const k = beatOf(f.bloc, data.de); if (k < 1 || k > beats) continue; if (!perBeat.has(k)) perBeat.set(k, []); perBeat.get(k).push(f); }
  const players = blocks.map((b) => newPlayer(b));
  return { data, blocks, players, cells, gen: 0, chainBlock: data.de, perBeat, beats, joins: new Map(), crown: -1, events: [], eventCount: 0, log: [], logCount: 0, hash: worldHash(cells), capped: false, stopped: null };
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
/* a machine only works whole: every cell of its footprint (and a 2-cell margin) must be empty, or nothing is written */
function placeWhole(cells, pts, at, owner) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  for (let x = x0 - 2; x <= x1 + 2; x++) for (let y = y0 - 2; y <= y1 + 2; y++) { if (!inside(at[0] + x, at[1] + y) || cells.has(key(at[0] + x, at[1] + y))) return 0; }
  return place(cells, pts, at, owner);
}
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
export const GUN = P.gun;
/* A MARGIN (Phil 2026-11-16, the crown jumped MSFTc <-> GOOGLc every beat at near-equal sizes): a challenger takes the crown only when it
 *   has more than the head's cells + CROWN_MARGIN (1 %, at least 5 cells). With no head yet, the largest colony takes it. */
export const crownMargin = (n) => Math.max(5, Math.ceil(n / 100));
export function crownOf(cells, players, current) {
  const n = new Array(players).fill(0); for (const o of cells.values()) if (o >= 0) n[o]++;
  const cur = current >= 0 ? n[current] : 0, bar = current >= 0 && cur > 0 ? cur + crownMargin(cur) : 0; /* a wiped-out head defends nothing */
  let best = current, bn = cur;
  for (let i = 0; i < n.length; i++) if (i !== current && n[i] > bar && n[i] > (best === current ? 0 : bn)) { bn = n[i]; best = i; }
  if (best === current) bn = cur;
  return [best >= 0 && (best !== current || cur > 0) ? best : current, bn];
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
      /* a big burst of buys (GUN_BUYS in one beat): the brain builds a machine, well outside its edge */
      if (buys >= GUN_BUYS) plan.push(['gun', orient(P.gun, dir, 'glider'), out(dir, 14)]);
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
    /* CHASE: an excited block that does not wear the crown aims one more glider at the leader's nearest cell, if the leader is
     *   within CHASE_REACH cells of its edge — everybody plays for the crown, so the leader is everybody's target */
    if (p.mood === 'EXCITE' && world.crown >= 0 && world.crown !== i && T[world.crown]) {
      let best = -1, bd = CHASE_REACH * CHASE_REACH;
      for (const kk of T[world.crown].list) { const dx = kx(kk) - edge[0], dy = ky(kk) - edge[1], d = dx * dx + dy * dy; if (d < bd || (d === bd && kk < best)) { bd = d; best = kk; } }
      if (best >= 0) { const d = toward([kx(best), ky(best)]); plan.push(['chase', orient(P.glider, d, 'glider'), out(d, 5)]); }
    }
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
      if (!(g === 'gun' ? placeWhole : place)(world.cells, pts, at, i)) continue;
      p.tank[g] -= 1; p.counts[g]++; p.last = { g, block: world.chainBlock, at };
      if (g === 'gun') event(world, { type: 'machine', i, at });
      world.log.push({ block: world.chainBlock, i, g, buys, sells, holders: newHolders, mood: p.mood, at }); world.logCount++; /* the log keeps 400; the count never stops */
      if (world.log.length > 400) world.log.splice(0, world.log.length - 400);
    }
  }
  holdCrown(world);
}

/* ── LIVE: the same engine, fed while the chain moves ── */
/** add facts read from the chain, up to chain block `upTo` (inclusive). The world never steps past what was read. A fact with
 *  `join` is a new player entering at that block. Facts must come in block order and never below what was already appended. */
export function appendFacts(world, faits, upTo) {
  if (!Number.isSafeInteger(upTo) || upTo < world.data.a) throw new Error('appendFacts: upTo must not go back (' + upTo + ' < ' + world.data.a + ')');
  for (const f of faits) {
    if (f.bloc <= world.data.a || f.bloc > upTo) throw new Error('appendFacts: fact at block ' + f.bloc + ' outside (' + world.data.a + ', ' + upTo + ']');
    if (f.join) { if (!world.joins.has(f.bloc)) world.joins.set(f.bloc, []); world.joins.get(f.bloc).push(f.join); continue; }
    const k = beatOf(f.bloc, world.data.de); if (!world.perBeat.has(k)) world.perBeat.set(k, []); world.perBeat.get(k).push(f);
  }
  world.data.a = upTo; world.beats = Math.ceil((upTo - world.data.de + 1) / BEAT_BLOCKS);
  return world;
}
/** a new player drops into the game: a place drawn from keccak(address + the block it enters), anywhere on the map out to its
 *  current edge (not the centre: nobody chooses, and nobody is handed the middle), its starting soup written on EMPTY cells only */
export function joinPlayer(world, b) {
  const adr0 = String(b.adr).toLowerCase(), h = seedBits(adr0, 'join:' + world.chainBlock);
  let R = SPACING; for (const x of world.blocks) R = Math.max(R, Math.hypot(x.home[0], x.home[1]));
  const ang = parseInt(h.slice(2, 10), 16) / 2 ** 32 * 2 * Math.PI, rad = (0.35 + 0.65 * Math.sqrt(parseInt(h.slice(10, 18), 16) / 2 ** 32)) * (R + SPACING / 2);
  const spot = [Math.round(Math.cos(ang) * rad), Math.round(Math.sin(ang) * rad)];
  const s = seedBits(adr0, 'soup') + seedBits(adr0, 'soup2').slice(2);
  /* A BLOCK ALREADY IN THE SEASON is not a second player: its entry REINFORCES it — a fresh soup of its own cells at a new drawn spot
   *   (empty cells only), announced in the feed. One address = one colour, whatever the number of entries. */
  const ex = world.blocks.findIndex((x) => x.adr === adr0);
  if (ex >= 0) {
    for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) if (parseInt(s[2 + ((y * 6 + x) % 128)], 16) < 6) for (const X of [spot[0] - 6 + x, spot[0] + 5 - x]) { const k = key(X, spot[1] - 6 + y); if (!world.cells.has(k)) world.cells.set(k, ex); }
    event(world, { type: 'reinforce', i: ex, at: spot });
    return ex;
  }
  const i = world.blocks.length;
  const nb = { ...b, adr: adr0, i, joinedAt: world.chainBlock, home: spot };
  world.blocks.push(nb); world.players.push(newPlayer(nb));
  for (let y = 0; y < 12; y++) for (let x = 0; x < 6; x++) if (parseInt(s[2 + ((y * 6 + x) % 128)], 16) < 6) for (const X of [nb.home[0] - 6 + x, nb.home[0] + 5 - x]) { const k = key(X, nb.home[1] - 6 + y); if (!world.cells.has(k)) world.cells.set(k, i); }
  event(world, { type: 'join', i });
  return i;
}

/** advance one generation (= one Base block); brains beat at the start of each beat */
export function stepWorld(world) {
  if (world.stopped || world.chainBlock > world.data.a) return world;
  const J = world.joins.get(world.chainBlock); if (J) { for (const b of [...J].sort((p, q) => (p.adr < q.adr ? -1 : 1))) joinPlayer(world, b); world.joins.delete(world.chainBlock); }
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

/** the whole state as JSON-safe data (a brain's wiring is NOT sent: it is rebuilt from the address, it never changes) */
export function serializeWorld(w) {
  const cells = new Array(w.cells.size * 2); let j = 0; for (const [k, o] of w.cells) { cells[j++] = k; cells[j++] = o; }
  const perBeat = []; for (const [k, v] of w.perBeat) if (k * BEAT_BLOCKS + w.data.de >= w.chainBlock - BEAT_BLOCKS) perBeat.push([k, v]);
  return { v: 1, de: w.data.de, a: w.data.a, gen: w.gen, chainBlock: w.chainBlock, crown: w.crown, hash: w.hash, capped: w.capped, stopped: w.stopped,
    eventCount: w.eventCount, logCount: w.logCount, events: w.events.slice(-40), log: w.log.slice(-60), cells, perBeat, joins: [...w.joins],
    blocks: w.blocks, players: w.players.map((p) => { const { c, ...brain } = p.brain; return { ...p, brain, seen: [...p.seen], lostBy: [...p.lostBy] }; }) };
}
export function deserializeWorld(s) {
  if (!s || s.v !== 1) throw new Error('deserializeWorld: unknown state version');
  const cells = new Map(); for (let j = 0; j < s.cells.length; j += 2) cells.set(s.cells[j], s.cells[j + 1]);
  const blocks = s.blocks.map((b) => ({ ...b }));
  const players = s.players.map((p, i) => ({ ...p, brain: { ...p.brain, c: etatInitial(blocks[i].adr).c }, seen: new Set(p.seen), lostBy: new Map(p.lostBy), tank: { ...p.tank }, counts: { ...p.counts }, cum: { ...p.cum } }));
  return { data: { de: s.de, a: s.a, blocks, faits: [] }, blocks, players, cells, gen: s.gen, chainBlock: s.chainBlock, perBeat: new Map(s.perBeat), beats: Math.ceil((s.a - s.de + 1) / BEAT_BLOCKS),
    joins: new Map(s.joins), crown: s.crown, events: s.events.slice(), eventCount: s.eventCount, log: s.log.slice(), logCount: s.logCount, hash: s.hash, capped: s.capped, stopped: s.stopped };
}
/** a live world with no fact yet: the season starts at chain block `de` */
export function createLiveWorld(blocks, de) { return createWorld({ blocks, faits: [], de, a: de - 1 }); }

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
    blocksLen: world.blocks.length, joins: [...world.joins].map(([k, v]) => [k, v.slice()]), crown: world.crown, eventsLen: world.events.length, eventCount: world.eventCount, players: world.players.map(copyPlayer) };
}
export function restore(world, s) {
  world.gen = s.gen; world.chainBlock = s.chainBlock; world.cells = new Map(s.cells); world.hash = s.hash; world.capped = s.capped; world.stopped = s.stopped;
  world.log.length = Math.min(world.log.length, s.logLen); world.logCount = s.logCount; world.blocks.length = s.blocksLen; world.joins = new Map(s.joins.map(([k, v]) => [k, v.slice()])); world.crown = s.crown; world.events.length = Math.min(world.events.length, s.eventsLen); world.eventCount = s.eventCount; world.players = s.players.map(copyPlayer);
  return world;
}
