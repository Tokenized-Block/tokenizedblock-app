/* test-life-live-20261116.mjs — the LIVE Game of Life Block server module (life-live.js).
 * PROVES, against a fake node that serves the recorded transfers as Transfer logs:
 *   L1 the live game, read in ticks at the head, lands on the SAME hash as the replay of the same blocks (one engine, one world);
 *   L2 a failed read moves nothing (the world never steps past what was read);
 *   L3 a restart (same volume) resumes and ends on the same hash;
 *   L4 a join is written in the journal and anybody replaying the journal gets the same world;
 *   L5 the page's polls: facts after a block, or "reload" when too far behind / another season;
 *   L6 a season ends at its block count and the next one starts, the winner recorded.
 * DOES NOT PROVE: a real node's behaviour (limits, lags), or the page. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as E from './life-engine.js';
import { createLifeLive, TRANSFER, ENTERED, playersFromTrending } from './life-live.js';
let ok = 0, ko = 0; const t = (m, c, v = '') => { if (c) ok++; else { ko++; console.log('KO', m, v); } };
const data = JSON.parse(readFileSync(new URL('./life-block/donnees.json', import.meta.url), 'utf8'));
const pad = (a) => '0x' + '0'.repeat(24) + a.slice(2);
/* the trending lines the server would read, in the recording's order */
const lignes = () => data.blocks.map((b, i) => ({ adr: b.adr, sym: b.sym, nom: b.nom, emetteur: '0x1', liquiditeUsd: b.liquiditeUsd, trades24h: 1000 - i, poolAdr: b.pools[0], routeAction: b.pools[1] ? { pool: b.pools[1] } : null }));
t('L0 the players are read from the trending lines, same order and pools as the recording', JSON.stringify(playersFromTrending(lignes(), '0x0').map((b) => [b.adr, b.pools])) === JSON.stringify(data.blocks.map((b) => [b.adr, b.pools])));
/* the recorded facts as Transfer logs */
const LOGS = data.faits.map((f) => { const b = data.blocks[f.b], from = f.kind === 'achat' ? b.pools[0] : '0x' + '11'.repeat(20);
  return { address: b.adr, blockNumber: '0x' + f.bloc.toString(16), transactionHash: f.tx, logIndex: '0x' + f.log.toString(16), topics: [TRANSFER, pad(from), pad(f.vers)] }; });
function fakeNode(state) {
  return async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + state.tip.toString(16);
    if (m === 'eth_getLogs') { if (state.fail && state.fail-- > 0) throw new Error('429 too many requests');
      const q = p[0], de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16), A = new Set(q.address);
      if (q.address.length > 10) throw new Error('A maximum of 10 addresses is allowed');
      return LOGS.filter((l) => A.has(l.address) && parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a); }
    throw new Error('unexpected ' + m);
  };
}
const G = 2000, fin = data.de + G - 1;
async function play(live, node, upTo) { while (live._S.readTo < upTo) { node.tip = Math.min(upTo + 3, node.tip + 293); /* 293: reads NOT aligned on the 10-block beat */ await live.tick(); if (node.fail === undefined || node.fail <= 0) live.stepFor(1e9); } }
const replay = E.createWorld(data); for (let i = 0; i < G; i++) E.stepWorld(replay);

{ const node = { tip: data.de - 1 + 3 }, live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0' });
  await live.tick();
  t('L1a a season starts at the head with every tokenized stock', live._S.season && live._S.season.de === data.de && live._S.season.blocks.length === data.blocks.length);
  await play(live, node, fin); live.stepFor(1e9);
  t('L1 the live game read in ticks lands on the replay hash', live._S.world.hash === replay.hash && live._S.world.gen === G, live._S.world.hash + ' vs ' + replay.hash);
  const s = live.status(); t('L1b getLogs never asked more than 10 addresses (the fake node refuses it), and the status adds up', s.readTo === fin && s.behind === 0 && s.lastError === null, JSON.stringify(s));
  /* L2: a failed read */
  node.fail = 1; node.tip = fin + 303; const r0 = live._S.readTo, g0 = live._S.world.gen; await live.tick(); live.stepFor(1e9);
  t('L2 a failed read moves nothing and says why', live._S.readTo === r0 && live._S.world.gen === g0 && /429/.test(live.status().lastError || ''));
  /* L5 */
  const fa = live.faits(fin - 100, live._S.season.id);
  t('L5 the page gets the facts after its block', fa.ok && !fa.reload && fa.faits.every((x) => x.bloc > fin - 100) && fa.faits.length === data.faits.filter((x) => x.bloc > fin - 100 && x.bloc <= fin).length);
  t('L5b too far behind, or another season: reload', live.faits(fin + 50, live._S.season.id).reload === true && live.faits(fin - 3001, live._S.season.id).reload === true && live.faits(fin - 10, 'other').reload === true);
  const st = JSON.parse(live.state()); t('L5c the state is JSON and rebuilds the same world', E.deserializeWorld(st.world).hash === live._S.world.hash && st.season.players === data.blocks.length);
  /* L5d: the cached state is FROZEN: the world moves on, the cached answer still rebuilds the world as it was (counters included) */
  const frozen = live.state(); node.tip = fin + 600; await live.tick(); live.stepFor(1e9);
  const again = live.state(), back = E.deserializeWorld(JSON.parse(again).world), mine = E.deserializeWorld(st.world);
  E.appendFacts(mine, live._S.recent.filter((x) => x.bloc > mine.data.a), live._S.readTo); while (mine.chainBlock <= mine.data.a) E.stepWorld(mine);
  t('L5d a page that loads a (cached) state then appends the facts lands on the server hash', typeof frozen === 'string' && typeof again === 'string' && back.gen > 0 && mine.hash === live._S.world.hash, mine.hash + ' vs ' + live._S.world.hash); }

{ /* L3 + L4: a volume, a restart, a join, the journal */
  const dir = mkdtempSync(join(tmpdir(), 'life-live-'));
  try {
    const node = { tip: data.de - 1 + 3 }; let live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0', dir });
    await live.tick(); await play(live, node, data.de + 999); live.stepFor(1e9);
    live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0', dir }); live.load();   /* a deploy */
    t('L3a the restart resumes the season where it was read', live._S.readTo === data.de + 999 && live._S.season.blocks.length === data.blocks.length);
    await play(live, node, fin); live.stepFor(1e9);
    t('L3 after a restart the game still lands on the replay hash', live._S.world.hash === replay.hash, live._S.world.hash);
    const j = live.joinForTest({ adr: '0x' + 'ab'.repeat(20), sym: 'TESTc', nom: 'Test block' });
    let refused = false; try { live.joinForTest({ adr: '0x' + 'ab'.repeat(20) }); } catch { refused = true; }
    await play(live, node, fin + 300); live.stepFor(1e9);
    const W = live._S.world, nb = W.blocks[W.blocks.length - 1];
    t('L4a the joiner entered at its block, once', nb.sym === 'TESTc' && nb.joinedAt === j.at && refused && W.events.some((e) => e.type === 'join'));
    /* anybody: the season's first players + the journal -> the same world */
    const lines = live.journal().split('\n').filter(Boolean).map((x) => JSON.parse(x));
    const mine = E.createLiveWorld(live._S.season.blocks.filter((b) => !b.joinedAt), live._S.season.de); E.appendFacts(mine, lines, live._S.readTo); while (mine.chainBlock <= mine.data.a) E.stepWorld(mine);
    t('L4 replaying the public journal gives the same hash', mine.hash === W.hash && lines.some((x) => x.join), mine.hash + ' vs ' + W.hash);
    live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0', dir }); live.load(); live.stepFor(1e9);
    t('L4b a restart after a join keeps the joiner', live._S.world.hash === W.hash && live._S.world.blocks.length === W.blocks.length, live._S.world.hash);
  } finally { rmSync(dir, { recursive: true, force: true }); } }

{ /* L6: the season rolls over */
  const node = { tip: data.de - 1 + 3 }, live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0', seasonBlocks: 500 });
  await live.tick(); await play(live, node, data.de + 499); live.stepFor(1e9);
  node.tip = data.de + 520; await live.tick();
  t('L6 a season ends at its block count, the next starts, the winner is recorded', live._S.season.de === data.de + 518 && live._S.history.length === 1 && !!live._S.history[0].winner, JSON.stringify(live._S.history[0])); }

{ /* L7: "Add your block" — Entered logs of LifeEntry become joins, only from LifeEntry's address and from a status-1 transaction */
  const LE = '0x' + 'e7'.repeat(20), NEW = '0x' + 'cd'.repeat(20), OTHER = '0x' + '99'.repeat(20), at = data.de + 700, at2 = data.de + 900;
  const symHex = '0x' + (32).toString(16).padStart(64, '0') + (5).toString(16).padStart(64, '0') + Buffer.from('NEWc1').toString('hex').padEnd(64, '0');
  const ent = (adrLog, blk, li, payer, tok, txh) => ({ address: adrLog, blockNumber: '0x' + blk.toString(16), transactionHash: txh, logIndex: '0x' + li.toString(16), topics: [ENTERED, pad(payer), pad(tok)], data: '0x' });
  const LOGS_E = [ent(LE, at, 1, '0x' + 'aa'.repeat(20), NEW, '0x' + '01'.repeat(32)), ent(LE, at2, 2, '0x' + 'aa'.repeat(20), data.blocks[0].adr, '0x' + '02'.repeat(32)),
    ent(OTHER, at, 3, '0x' + 'aa'.repeat(20), '0x' + 'ee'.repeat(20), '0x' + '03'.repeat(32)), ent(LE, at, 4, '0x' + 'aa'.repeat(20), '0x' + 'ef'.repeat(20), '0x' + '04'.repeat(32))];
  /* the new block trades right after it entered: 3 transfers out of a wallet */
  const NEWT = [at + 5, at + 50, at + 120].map((b, k) => ({ address: NEW, blockNumber: '0x' + b.toString(16), transactionHash: '0x' + (k + 10).toString(16).padStart(64, '0'), logIndex: '0x0', topics: [TRANSFER, pad('0x' + '11'.repeat(20)), pad('0x' + (k + 20).toString(16).padStart(40, '0'))] }));
  const base = fakeNode({ tip: 0 }), node = { tip: data.de - 1 + 3 };
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + node.tip.toString(16);
    if (m === 'eth_getLogs') { const q = p[0], de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16);
      if (q.topics && q.topics[0] === ENTERED) return LOGS_E.filter((l) => l.address === q.address && parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a);
      const A = new Set(q.address); if (q.address.length > 10) throw new Error('A maximum of 10 addresses is allowed');
      return [...LOGS, ...NEWT].filter((l) => A.has(l.address) && parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a); }
    if (m === 'eth_getTransactionReceipt') { const l = LOGS_E.find((x) => x.transactionHash === p[0]); return l ? { status: l.logIndex === '0x4' ? '0x0' : '0x1', logs: [l] } : null; }
    if (m === 'eth_call') return symHex;
    throw new Error('unexpected ' + m);
  };
  const live = createLifeLive({ rpc, lignes, poolManager: '0x0', lifeEntry: LE });
  await live.tick(); await play(live, node, data.de + 1200); live.stepFor(1e9);
  const W = live._S.world, nb = W.blocks.find((b) => b.adr === NEW);
  t('L7a a paid entry from LifeEntry adds the block at its block, with its symbol read on chain', !!nb && nb.joinedAt === at && nb.sym === 'NEWc1' && W.blocks.length === data.blocks.length + 1, JSON.stringify(nb && { s: nb.sym, j: nb.joinedAt }));
  t('L7b an Entered log from another address, or from a failed transaction, is NOT a join', !W.blocks.some((b) => b.adr === '0x' + 'ee'.repeat(20) || b.adr === '0x' + 'ef'.repeat(20)));
  t('L7c an entry for a block already in the season reinforces it (no second player), the feed says so', W.events.some((e) => e.type === 'reinforce' && e.i === 0) && W.blocks.filter((b) => b.adr === data.blocks[0].adr).length === 1);
  t('L7d the new block\'s own trades after its entry are read (its brain has facts)', W.players[nb.i].cum.detenteurs >= 3, String(W.players[nb.i].cum.detenteurs));
  /* a second server reading the same chain from scratch */
  const live2 = createLifeLive({ rpc, lignes, poolManager: '0x0', lifeEntry: LE }); node.tip = data.de - 1 + 3;
  await live2.tick(); await play(live2, node, data.de + 1200); live2.stepFor(1e9);
  t('L7e two servers reading the same chain reach the same world (entries included)', live2._S.world.hash === W.hash, live2._S.world.hash + ' vs ' + W.hash); }
{ /* L9: with CrownMarket rounds, an entry paid in a round's SECOND half takes effect at the next round's first block */
  const LE = '0x' + 'e7'.repeat(20), NEW = '0x' + 'cd'.repeat(20), G0 = data.de, RBk = 400, paidAt = G0 + 300; /* round 0 = [de, de+399]: 300 is in its second half */
  const lg = { address: LE, blockNumber: '0x' + paidAt.toString(16), transactionHash: '0x' + '05'.repeat(32), logIndex: '0x1', topics: [ENTERED, pad('0x' + 'aa'.repeat(20)), pad(NEW)], data: '0x' };
  const node = { tip: data.de - 1 + 3 };
  const rpc = async (m, p) => { if (m === 'eth_blockNumber') return '0x' + node.tip.toString(16);
    if (m === 'eth_getLogs') { const q = p[0], de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16); if (q.topics && q.topics[0] === ENTERED) return [lg].filter((l) => paidAt >= de && paidAt <= a); const A = new Set(q.address); return LOGS.filter((l) => A.has(l.address) && parseInt(l.blockNumber, 16) >= de && parseInt(l.blockNumber, 16) <= a); }
    if (m === 'eth_getTransactionReceipt') return { status: '0x1', logs: [lg] }; if (m === 'eth_call') return '0x'; throw new Error(m); };
  const live = createLifeLive({ rpc, lignes, poolManager: '0x0', lifeEntry: LE, crownRounds: { genesis: G0, roundBlocks: RBk } });
  await live.tick(); await play(live, node, data.de + 900); live.stepFor(1e9);
  const nb = live._S.world.blocks.find((b) => b.adr === NEW);
  t('L9 an entry paid at block 300 of a 400-block round enters at the next round start (block 400)', !!nb && nb.joinedAt === G0 + RBk, nb && nb.joinedAt); }

{ /* L8: a season closed for a RULES change keeps its PAID entries: the next season re-adds them, once, as journal facts */
  const dir = mkdtempSync(join(tmpdir(), 'life-carry-'));
  try {
    const node = { tip: data.de - 1 + 3 }; let live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0', dir });
    await live.tick(); await play(live, node, data.de + 300); live.stepFor(1e9);
    /* a paid entry, written as the server writes one (join fact WITH its tx) */
    const paid = { adr: '0x' + '0e'.repeat(20), sym: 'OUSD', nom: 'OpenUSD', action: false, liquiditeUsd: 0, pools: [] };
    live._S.season.blocks.push({ ...paid, joinedAt: data.de + 301 }); live._S.pendingJoins = [{ bloc: data.de + 301, join: paid, tx: '0x' + 'aa'.repeat(32), payer: '0x' + '31'.repeat(20) }];
    await play(live, node, data.de + 600); live.stepFor(1e9);
    /* the rules change: the saved season says engine 1 */
    const sp = join(dir, 'season.json'); const sj = JSON.parse(readFileSync(sp, 'utf8')); sj.engine = 1; writeFileSync(sp, JSON.stringify(sj));
    live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0', dir }); live.load();
    node.tip = data.de + 900; await live.tick(); await play(live, node, data.de + 1200); live.stepFor(1e9);
    const W = live._S.world;
    t('L8a the old season is closed for the rules change and a new one runs', live._S.history[0] && /rules changed/.test(live._S.history[0].closed || '') && live._S.season.id !== sj.id);
    t('L8b the paid block is in the new season, once', W.blocks.filter((b) => b.adr === paid.adr).length === 1 && W.events.some((e) => e.type === 'join'));
    const lines = live.journal().split('\n').filter(Boolean).map((x) => JSON.parse(x));
    const mine = E.createLiveWorld(live._S.season.blocks.filter((b) => !b.joinedAt), live._S.season.de); E.appendFacts(mine, lines, live._S.readTo); while (mine.chainBlock <= mine.data.a) E.stepWorld(mine);
    t('L8c the new season\'s journal (carried join included) replays to the same hash', mine.hash === W.hash && lines.some((x) => x.join && x.carriedFrom === sj.id), mine.hash + ' vs ' + W.hash);
    live = createLifeLive({ rpc: fakeNode(node), lignes, poolManager: '0x0', dir }); live.load(); await live.tick(); live.stepFor(1e9);
    t('L8d a restart does not carry it twice', live._S.world.blocks.filter((b) => b.adr === paid.adr).length === 1);
  } finally { rmSync(dir, { recursive: true, force: true }); } }

console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
