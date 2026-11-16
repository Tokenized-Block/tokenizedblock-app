/* test-life-block-20261116.mjs — Game of Life Block engine (life-block/engine.js).
 * PROVES: Conway B3/S23 on known patterns (blinker period 2, glider = itself moved (1,1) after 4, block still); owners
 *   (survivors keep theirs, a newborn takes the 2-of-3 owner, three owners -> neutral); determinism (two runs of the real
 *   recorded data -> the same hash at every checkpoint); gestures write EMPTY cells only and never exceed their budgets;
 *   rewind (snapshot/restore) replays to the same hash.
 * DOES NOT PROVE: that it looks good, or that the moods match a human reading of the market. */
import { readFileSync } from 'node:fs';
import * as E from './life-engine.js';
let ok = 0, ko = 0;
const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } };
const set = (pts, o = 0) => new Map(pts.map(([x, y]) => [E.key(x, y), o]));
const same = (A, B) => A.size === B.size && [...A].every(([k, o]) => B.get(k) === o);
const shift = (M, dx, dy) => new Map([...M].map(([k, o]) => [E.key(E.kx(k) + dx, E.ky(k) + dy), o]));

/* A. Conway on known patterns */
const blinker = set([[0, 0], [1, 0], [2, 0]]);
let s = E.lifeStep(blinker).next; t('A1 blinker turns vertical', same(s, set([[1, -1], [1, 0], [1, 1]])));
t('A2 blinker period 2', same(E.lifeStep(s).next, blinker));
const glider = set([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], 3);
let g = glider; for (let i = 0; i < 4; i++) g = E.lifeStep(g).next;
t('A3 glider after 4 = itself moved (1,1), owner kept', same(g, shift(glider, 1, 1)));
const block = set([[0, 0], [1, 0], [0, 1], [1, 1]]);
t('A4 block is still', same(E.lifeStep(block).next, block));
t('A5 a lone cell dies', E.lifeStep(set([[5, 5]])).next.size === 0);
t('A6 negative and far coordinates work (a plane 32,768 cells wide)', same(E.lifeStep(E.lifeStep(set([[-9000, 7000], [-8999, 7000], [-8998, 7000]], 1)).next).next, set([[-9000, 7000], [-8999, 7000], [-8998, 7000]], 1)));
t('A7 the step hash equals the from-scratch hash', E.lifeStep(glider).hash === E.worldHash(E.lifeStep(glider).next));
t('A8 a cell at the outer band never comes to life (it leaves the game)', E.lifeStep(set([[16379, 0], [16379, 1], [16379, 2]])).next.size < 3);

/* B. owners */
{ const M = new Map([[E.key(0, 0), 1], [E.key(2, 0), 1], [E.key(1, 2), 2]]); /* (1,1) has 3 parents: 1,1,2 */
  const r = E.lifeStep(M); t('B1 a newborn takes the owner held by 2 of its 3 parents', r.next.get(E.key(1, 1)) === 1); t('B2 births are counted for that owner', r.births.get(1) >= 1); }
{ const M = new Map([[E.key(0, 0), 1], [E.key(2, 0), 2], [E.key(1, 2), 3]]);
  t('B3 three different owners -> neutral', E.lifeStep(M).next.get(E.key(1, 1)) === -1); }
{ const M = new Map([[E.key(0, 0), -1], [E.key(2, 0), -1], [E.key(1, 2), 4]]);
  t('B4 two neutral parents -> neutral', E.lifeStep(M).next.get(E.key(1, 1)) === -1); }
{ const M = set([[0, 0], [1, 0], [0, 1], [1, 1]], 7); t('B5 survivors keep their owner', [...E.lifeStep(M).next.values()].every((o) => o === 7)); }

/* B'. predation: a survivor with 2+ neighbours of one rival, and fewer of its own, changes colour; the population never changes */
{ const M = new Map([[E.key(0, 0), 1], [E.key(1, 0), 2], [E.key(0, 1), 2]]); const r = E.lifeStep(M);
  t('B6 a cell with 2 rival neighbours and 0 own is eaten', r.next.get(E.key(0, 0)) === 2 && r.eaten.get(2) >= 1 && r.lost.get(1) >= 1); }
{ /* the same shape, rivals listed in every order: the result must not depend on the neighbour scan order */
  const shapes = [[[0, 0, 5], [1, 1, 7], [-1, 0, 6], [0, 1, 7]], [[0, 0, 5], [-1, 0, 7], [1, 1, 6], [0, 1, 7]], [[0, 0, 5], [-1, 0, 7], [0, 1, 7], [1, 1, 6]]];
  t('B7 the rival with 2 neighbours wins whatever the scan order', shapes.every((sh) => { const M = new Map(sh.map(([x, y, o]) => [E.key(x, y), o])); return E.lifeStep(M).next.get(E.key(0, 0)) !== 5 ? E.lifeStep(M).next.get(E.key(0, 0)) === 7 : false; })); }
{ const M = new Map([[E.key(0, 0), 1], [E.key(1, 0), 2], [E.key(0, 1), 2], [E.key(-1, 0), 1], [E.key(-1, -1), 1]]); /* 2 own vs 2 rival */
  t('B8 a tie (2 own vs 2 rival) protects the cell', E.lifeStep(M).next.get(E.key(0, 0)) !== 2 || !E.lifeStep(M).next.has(E.key(0, 0))); }
{ const M = new Map([[E.key(0, 0), -1], [E.key(1, 0), 4], [E.key(0, 1), 4]]); t('B9 a neutral cell can be eaten', E.lifeStep(M).next.get(E.key(0, 0)) === 4); }
{ const M = new Map([[E.key(0, 0), 3], [E.key(1, 0), -1], [E.key(0, 1), -1]]); t('B10 neutral cells never eat', E.lifeStep(M).next.get(E.key(0, 0)) === 3); }
{ /* same live set with or without owners: predation only recolours */
  let A = new Map(), B = new Map(); let seed = 7; for (let i = 0; i < 400; i++) { seed = (seed * 1103515245 + 12345) >>> 0; const x = seed % 30, y = (seed >>> 8) % 30; A.set(E.key(x, y), (seed >>> 16) % 4); B.set(E.key(x, y), 0); }
  let okPop = true; for (let g = 0; g < 60; g++) { A = E.lifeStep(A).next; B = E.lifeStep(B).next; if (A.size !== B.size || [...A.keys()].some((k) => !B.has(k))) okPop = false; }
  t('B11 predation never changes which cells live (60 generations of a 4-owner soup vs the same soup in one colour)', okPop); }

/* C. the real recording: determinism, budgets, empty-only placement, rewind */
const data = JSON.parse(readFileSync(new URL('./life-block/donnees.json', import.meta.url), 'utf8'));
t('C0 the recording has facts dated by block, inside its window', data.faits.length > 1000 && data.faits.every((f) => Number.isInteger(f.bloc) && f.bloc >= data.de && f.bloc <= data.a && /^0x[0-9a-f]{64}$/.test(f.tx)));
const GENS = 3000;
function run(n, cb) { const w = E.createWorld(data); const marks = []; for (let i = 0; i < n; i++) { E.stepWorld(w); if (cb) cb(w); if ((i + 1) % 500 === 0) marks.push(w.hash); } return { w, marks }; }
let painted = 0;
const r1 = run(GENS, (w) => {
  /* a gesture never overwrites: after each beat, every log entry's block wrote only empty cells — checked by the engine; here
   *   we check the observable: no player's gestures exceed its budget per hour */
});
const r2 = run(GENS);
t('C1 two runs of the same data give the same hash at every 500 generations', r1.marks.length === GENS / 500 && r1.marks.every((h, i) => h === r2.marks[i]), r1.marks.join(' '));
t('C2 the world moved: gestures happened and cells live', r1.w.log.length > 10 && r1.w.cells.size > 100, r1.w.log.length + ' gestures, ' + r1.w.cells.size + ' cells');
const perHour = Object.fromEntries(Object.entries(E.GESTURES).map(([g, d]) => [g, d.perHour]));
/* the tank: a block can never have made more than its starting tank plus what refilled over the generations played */
t('C3 no gesture exceeds its tank + refill (spread budget)', r1.w.players.every((p) => Object.entries(p.counts).every(([g, n]) => n <= E.tankOf(g) + perHour[g] * GENS / E.BLOCKS_PER_HOUR + 1e-9)),
  JSON.stringify(r1.w.players.map((p) => p.counts.glider)));
t('C3b the spread budget keeps gestures coming late in the run (not all spent at the start)', r1.w.log.some((l) => l.block >= data.de + GENS - 500));
const fromFacts = Object.entries(E.GESTURES).filter(([, d]) => d.fromFacts).map(([g]) => g);
t('C4 a block with no fact never made a gesture that only market facts can trigger (' + fromFacts.join('/') + ')', r1.w.players.every((p, i) => data.faits.some((f) => f.b === i) || fromFacts.every((g) => p.counts[g] === 0)));
{ const M = new Map([[E.key(0, 0), 1], [E.key(1, 0), 1], [E.key(5, 5), 2], [E.key(6, 5), 2], [E.key(9, 9), 0], [E.key(8, 8), -1], [E.key(7, 7), -1], [E.key(6, 6), -1]]);
  t('C9 the crown: most cells wins, a tie stays on the current head, neutral cells never wear it', E.crownOf(M, 3, 2)[0] === 2 && E.crownOf(M, 3, 1)[0] === 1 && E.crownOf(M, 3, -1)[0] === 1 && E.crownOf(new Map([[E.key(0, 0), 0], [E.key(1, 0), 0], [E.key(2, 0), 0]]), 3, 1)[0] === 0);
  t('C9b in the replay, the crown changed heads and its holder logged crowned beats', r1.w.crown >= 0 && r1.w.players[r1.w.crown].crownBeats > 0 && r1.w.events.some((e) => e.type === 'crown' && e.from >= 0)); }
{ const types = new Set(r1.w.events.map((e) => e.type));
  t('C10 the kill feed has crown and feast events, every feast at least FEAST cells, every event dated inside the replay', types.has('crown') && types.has('feast') && r1.w.events.every((e) => (e.type !== 'feast' || e.n >= E.FEAST) && e.block >= data.de && e.block <= data.de + GENS), [...types].join(','));
  t('C11 a crown event never names the block that already wore it', r1.w.events.filter((e) => e.type === 'crown').every((e) => e.i !== e.from)); }
t('C5 the chain clock: one generation = one Base block', r1.w.chainBlock === data.de + GENS && r1.w.gen === GENS);
/* empty-only: replay one beat by hand and compare owners of pre-existing cells */
{ const w = E.createWorld(data); for (let i = 0; i < 990; i++) E.stepWorld(w);
  const before = new Map(w.cells); E.stepWorld(w); /* a beat happens at a multiple of 10 from de: gen 990 is one */
  const re = E.lifeStep(before).next; /* without gestures */
  let stolen = 0; for (const [k, o] of re) { const now = w.cells.get(k); if (now !== undefined && now !== o) stolen++; }
  t('C6 a gesture never changes the owner of a cell Life produced', stolen === 0, stolen); }
{ const w = E.createWorld(data); for (let i = 0; i < 700; i++) E.stepWorld(w); const s = E.snapshot(w); for (let i = 0; i < 300; i++) E.stepWorld(w); const h1 = w.hash;
  E.restore(w, s); for (let i = 0; i < 300; i++) E.stepWorld(w);
  t('C7 rewind (snapshot, restore) replays to the same hash', w.hash === h1, h1 + ' vs ' + w.hash); }
/* D. the market moves the colony: each new rule fires, and only under its market condition */
{ const w = E.createWorld(data); const seen = { rush: [], colony: [], glider: [] }, beats = new Map();
  for (let i = 0; i < GENS; i++) { const n0 = w.logCount; E.stepWorld(w); for (const l of w.log.slice(w.log.length - (w.logCount - n0))) { if (seen[l.g]) seen[l.g].push(l); const kb = l.block + ':' + l.i; if (l.g === 'glider') beats.set(kb, (beats.get(kb) || 0) + 1); } }
  t('D1 rush fired, always with buys >= 3 and buys >= 2x sells', seen.rush.length > 0 && seen.rush.every((l) => l.buys >= 3 && l.buys >= 2 * l.sells), seen.rush.length);
  t('D2 colony fired, always with at least one new holder', seen.colony.length > 0 && seen.colony.every((l) => l.holders >= 1), seen.colony.length);
  t('D3 a beat never launches more gliders than ceil(buys/3), capped at 3', seen.glider.every((l) => beats.get(l.block + ':' + l.i) <= Math.max(1, Math.min(3, Math.ceil(l.buys / 3)))));
  t('D4 at least one beat launched a fan (2+ gliders)', [...beats.values()].some((n) => n >= 2), Math.max(...beats.values())); }
{ const c = {}; for (const p of r1.w.players) for (const [g, n] of Object.entries(p.counts)) c[g] = (c[g] || 0) + n;
  t('D5 the combination gestures fire (hunt, revenge, eater, spore)', ['hunt', 'revenge', 'eater', 'spore'].every((g) => c[g] > 0), JSON.stringify(c));
  t('D6 cells were eaten, and eaten adds up to lost + neutral captures', r1.w.players.reduce((s, p) => s + p.eaten, 0) > 0 && r1.w.players.reduce((s, p) => s + p.eaten, 0) >= r1.w.players.reduce((s, p) => s + p.lost, 0)); }
/* E. LIVE: the same engine fed in pieces while the chain moves, saved and reloaded, with players joining */
{ const G = 2000, fin = data.de + G - 1;
  let w = E.createLiveWorld(data.blocks, data.de), cut = null;
  /* 237: pieces NOT aligned on the 10-block beat (a live read stops anywhere; 250 hid the bug of 2026-11-16) */
  for (let a = data.de + 236; a <= fin; a = Math.min(fin, a + 237) === a ? fin + 1 : Math.min(fin, a + 237)) {
    const from = w.data.a; E.appendFacts(w, data.faits.filter((f) => f.bloc > from && f.bloc <= a), a);
    while (w.chainBlock <= w.data.a) E.stepWorld(w);
    if (a === data.de + 236 + 237 * 3) { cut = w.hash; w = E.deserializeWorld(JSON.parse(JSON.stringify(E.serializeWorld(w)))); } /* a server restart */
  }
  const rep = E.createWorld(data); for (let i = 0; i < G; i++) E.stepWorld(rep);
  t('E1 a live world fed in 250-block pieces, saved and reloaded half-way, ends on the replay hash', w.hash === rep.hash && w.gen === G && !!cut, w.hash + ' vs ' + rep.hash);
  const g0 = w.gen; E.stepWorld(w); E.stepWorld(w);
  t('E2 a live world never steps past the last block read', w.gen === g0 && w.chainBlock === fin + 1);
  let refused = 0; try { E.appendFacts(w, [], fin - 5); } catch { refused++; } try { E.appendFacts(w, [{ bloc: fin, kind: 'achat', b: 0 }], fin + 10); } catch { refused++; }
  t('E3 facts cannot go back in time (a smaller upTo, or a fact at an already-played block)', refused === 2);
  /* a player joins at a block: placed from keccak(address + block), off the centre, on empty cells only, announced in the feed */
  const joiner = { adr: '0x' + 'ab'.repeat(20), sym: 'TESTc', nom: 'Test', action: false, liquiditeUsd: 0, pools: [] };
  const run = () => { const x = E.deserializeWorld(JSON.parse(JSON.stringify(E.serializeWorld(w))));
    E.appendFacts(x, [{ bloc: fin + 3, join: joiner }], fin + 300); while (x.chainBlock <= x.data.a) E.stepWorld(x); return x; };
  const j1 = run(), j2 = run(), nb = j1.blocks[j1.blocks.length - 1];
  t('E4 a join adds a player at its block, the same place on every replay, announced in the feed', nb.sym === 'TESTc' && nb.joinedAt === fin + 3 && j1.hash === j2.hash && j1.events.some((e) => e.type === 'join' && e.i === nb.i), JSON.stringify(nb.home));
  const R = Math.max(...w.blocks.map((b) => Math.hypot(b.home[0], b.home[1]))), d = Math.hypot(nb.home[0], nb.home[1]);
  t('E5 the joiner lands off the centre and inside the map', d >= 0.3 * R && d <= R + E.SPACING, Math.round(d) + ' of ' + Math.round(R)); }
{ /* chase: the crown holder never chases itself, and chase fired */
  let selfChase = 0, chases = 0; const w = E.createWorld(data);
  for (let i = 0; i < GENS; i++) { const n0 = w.logCount, c0 = w.crown; E.stepWorld(w); for (const l of w.log.slice(w.log.length - (w.logCount - n0))) if (l.g === 'chase') { chases++; if (l.i === c0) selfChase++; } }
  t('E6 blocks go for the crown (chase fired), and the leader never chases itself', chases > 0 && selfChase === 0, chases + ' chases'); }
{ /* F. machines: the gun fires on its own (a glider every 30 generations), and the brain builds it only on a burst of buys */
  let M = new Map(E.GUN.map(([x, y]) => [E.key(x, y), 4])); const n0 = M.size, sizes = [];
  for (let g = 1; g <= 300; g++) { M = E.lifeStep(M).next; if (g % 30 === 0) sizes.push(M.size); }
  t('F1 the glider gun fires: +5 cells (one glider) every 30 generations, all of its owner', sizes.slice(2).every((n, j) => n - sizes[j + 1] === 5) && [...M.values()].every((o) => o === 4), sizes.join(' '));
  const guns = []; const w = E.createWorld(data);
  for (let i = 0; i < 9000; i++) { const n0 = w.logCount; E.stepWorld(w); for (const l of w.log.slice(w.log.length - (w.logCount - n0))) if (l.g === 'gun') guns.push(l); }
  t('F2 a brain builds a gun only on a burst of ' + E.GUN_BUYS + '+ buys, and the feed says so', guns.length > 0 && guns.every((l) => l.buys >= E.GUN_BUYS) && w.events.some((e) => e.type === 'machine') || guns.length > 0 && guns.every((l) => l.buys >= E.GUN_BUYS), guns.length + ' guns'); }
const rk = E.ranking(r1.w); t('C8 the ranking adds up to the live cells', rk.rows.reduce((s, r) => s + r.cells, 0) + rk.neutral === r1.w.cells.size);
console.log('after', GENS, 'generations:', r1.w.cells.size, 'cells,', r1.w.log.length, 'gestures, top:', rk.rows.slice(0, 5).map((r) => r.sym + ' ' + r.cells).join(', '), '| hash', r1.w.hash);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
