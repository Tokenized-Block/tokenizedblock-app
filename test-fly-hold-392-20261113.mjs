/* test-fly-hold-392-20261113.mjs — game392 (Phil 2026-11-13, option A): the fly's real money follows the HOLD rule (fly-hold.js), from
 *   6-hour closes rebuilt from the pool's Swap logs (fly-hold-closes.js), served by /api/fly/hold/ and acted on by fly-brain.js.
 * AFFIRME: the rule's exact order (the usual move updated WITH the newest move, then compared — backtest.mjs signals()); a gap, a missing
 *   last close, a stale close or a short history give NO target (nothing traded); the action follows the REAL holdings; the closes take
 *   the last swap timed at or before the end, in ms (2026-11-13: 5 of 27 closes were off by blocks inside the end's second until the ms
 *   time); the close is the MEDIAN of the last 5 minutes of swaps (security review: one swap set it); only logs of the pool's Swap event
 *   count; an end the head is not 60 s past is not read; a real fixture (28 SNDKc closes, 27/27 equal to the study's swap file) gives IN, -3.86%;
 *   the page trades only on a fresh signal of the stock it watches, once per close and action, from 2 USDC, never with an interface fee.
 * NE PROUVE PAS: that the rule makes money (the replay says: ahead in 2 falls, behind in 1 rise, one 66-day period); the swap itself
 *   (fork bench banc-fly-hold-fork-20261113.mjs); the browser rendering (checked on prod). */
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const lire = (f) => readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');
const SRC_H = lire('fly-hold.js'), SRC_C = lire('fly-hold-closes.js'), JS = lire('fly-brain.js'), HT = lire('fly-brain.html'), SRV = lire('serveur-web.js');
let ok = 0, ko = 0;
const t = (m, c) => { if (c) ok++; else { ko++; console.log('KO', m); } };

/* 28 SNDKc closes (median of the last 5 min of swaps) read on chain (publicnode) 2026-11-13, oldest first; 27/27 overlapping equal to the
 *   same median computed from scratchpad fly-fix/hist-SNDKc.csv */
const REAL = [[1793966400000,897.9116742389482],[1793988000000,827.4302206670714],[1794009600000,837.3302335343118],[1794031200000,835.1327108276238],[1794052800000,834.9560582358454],[1794074400000,838.5970825398938],[1794096000000,837.281516084531],[1794117600000,834.7412333242426],[1794139200000,835.4959568403556],[1794160800000,835.8674530691661],[1794182400000,818.2077216836385],[1794204000000,825.0108267306002],[1794225600000,820.2856891112027],[1794247200000,891.0128154993906],[1794268800000,897.0422465870381],[1794290400000,889.60380502696],[1794312000000,878.0781073877537],[1794333600000,841.0957608407826],[1794355200000,870.5373015419893],[1794376800000,908.5881819128563],[1794398400000,928.3471978027087],[1794420000000,1004.3463747798152],[1794441600000,958.22707688807],[1794463200000,934.996835252398],[1794484800000,936.2763486620693],[1794506400000,945.0842132646469],[1794528000000,955.3612935179954],[1794549600000,918.4873734839745]].map(([at, price]) => ({ at, price }));
const W = 6 * 3600 * 1000;
/* a series of closes from moves, starting at 100, ending at `end` */
const serie = (moves, end = Date.UTC(2026, 10, 13, 6)) => { const out = [{ at: end - moves.length * W, price: 100 }]; for (const m of moves) out.push({ at: out[out.length - 1].at + W, price: out[out.length - 1].price * (1 + m) }); return out; };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

/* ── checks of the two modules, run on the real ones and on each mutant ── */
async function checks(H, C) {
  let bad = 0; const c = (x) => { if (!x) bad++; };
  /* windowEnds */
  const now = Date.UTC(2026, 10, 13, 9, 35);
  const e = H.windowEnds(now);
  c(e.length === 28 && e[27] === Date.UTC(2026, 10, 13, 6) && e[0] === Date.UTC(2026, 10, 13, 6) - 27 * W && e.every((x, i) => !i || x - e[i - 1] === W));
  c(H.windowEnds(Date.UTC(2026, 10, 13, 6))[27] === Date.UTC(2026, 10, 13, 6)); /* an end exactly now is closed */
  c(H.windowEnds(NaN).length === 0 && H.windowEnds(now, 0).length === 0);
  /* the exact order: 10 moves of 1% then -3%: usual = 0.9 x 1% + 0.1 x 3% = 1.2% -> threshold -2.4% -> OUT */
  const ten = Array(10).fill(0).map((_, i) => (i % 2 ? -0.01 : 0.01));
  const s1 = H.holdSignal(serie([...ten, -0.03]));
  c(s1.target === 'out' && near(s1.typical, 0.012, 1e-12) && near(s1.threshold, -0.024, 1e-12) && s1.moves === 11);
  /* -2% -> usual 1.1%, threshold -2.2% -> IN (updated BEFORE the comparison: compared first, -2% < -2% x 1% would say OUT) */
  const s2 = H.holdSignal(serie([...ten, -0.02]));
  c(s2.target === 'in' && near(s2.typical, 0.011, 1e-12));
  /* just under / just over the threshold */
  c(H.holdSignal(serie([...ten, -0.0226])).target === 'out' && H.holdSignal(serie([...ten, -0.0224])).target === 'in'); /* out iff 0.8|m| > 0.018, i.e. |m| > 2.25% */
  /* a rise is never OUT */
  c(H.holdSignal(serie([...ten, 0.2])).target === 'in');
  /* too few moves -> nothing */
  const few = H.holdSignal(serie([0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01]));
  c(few.target === null && few.moves === 7);
  c(H.holdSignal(serie([0.01, -0.01, 0.01, -0.01, 0.01, -0.01, 0.01, -0.05])).target === 'out'); /* 8 moves are enough */
  /* all moves flat -> usual 0 -> nothing */
  c(H.holdSignal(serie(Array(12).fill(0))).target === null);
  /* a gap breaks the chain: only the newest run counts */
  const g = serie([...ten, ...ten, -0.03]); g[12] = { at: g[12].at, price: null };
  const sg = H.holdSignal(g); c(sg.moves === 8 && sg.target === 'out'); /* closes 13..21 */
  const g2 = serie([...ten, 0.01, 0.01, -0.03]); g2[g2.length - 4] = { at: g2[g2.length - 4].at, price: null };
  c(H.holdSignal(g2).target === null); /* 2 moves after the gap: too few */
  /* closes not 6 h apart are not consecutive */
  const g3 = serie([...ten, -0.03]); g3[5] = { ...g3[5], at: g3[5].at + 1 }; c(H.holdSignal(g3).moves < 11);
  /* the last close not read -> nothing, whatever came before */
  const l = serie([...ten, -0.03]); l[l.length - 1] = { at: l[l.length - 1].at, price: null }; c(H.holdSignal(l).target === null);
  /* stale */
  const st = serie([...ten, -0.03]), last = st[st.length - 1].at;
  c(H.holdSignal(st, { nowMs: last + 7 * 3600 * 1000 }).target === 'out' && H.holdSignal(st, { nowMs: last + 7 * 3600 * 1000 + 1 }).target === null);
  c(H.holdSignal([]).target === null && H.holdSignal(null).target === null);
  c(H.holdSignal(serie([...ten, -0.03]).map((x, i) => (i === 3 ? { ...x, price: 0 } : x))).moves === 7); /* a 0 price is not read */
  /* the real fixture */
  const r = H.holdSignal(REAL, { nowMs: Date.UTC(2026, 10, 13, 9, 35) });
  c(r.target === 'in' && r.moves === 27 && near(r.move, -0.03859683272098813, 1e-12) && near(r.typical, 0.02880503757069685, 1e-12) && r.at === 1794549600000);
  /* holdAction: the real holdings decide */
  c(H.holdAction('in', 0n) === 'buy' && H.holdAction('in', 5n) === null && H.holdAction('out', 5n) === 'sell' && H.holdAction('out', 0n) === null);
  c(H.holdAction(null, 0n) === null && H.holdAction(null, 5n) === null && H.holdAction('in', 0) === null && H.holdAction('out', -1n) === null && H.holdAction('in', undefined) === null);
  c(H.HOLD_MIN_BUY_USDC === 2 && H.HOLD.DROP_X === 2 && H.HOLD.WINDOW_MS === W && H.HOLD.ALPHA === 0.1 && H.HOLD.MIN_MOVES === 8 && H.HOLD.CLOSES === 28);
  /* holdLines */
  const L0 = H.holdLines(null, 'SNDKc'), L1 = H.holdLines(s1, 'SNDKc'), L2 = H.holdLines(s2, 'SNDKc');
  c(/trades nothing/.test(L0.verdict) && /not read/.test(L0.last) && /OUT/.test(L1.verdict) && /IN/.test(L2.verdict) && /-3\.00%/.test(L1.last) && /below -2\.40%/.test(L1.last) && /1\.20%/.test(L1.last));
  c(/2x the usual 6-hour move/.test(L0.rule) && /00:00, 06:00, 12:00 and 18:00 UTC/.test(L0.rule));

  /* ── closes ── */
  const meta = { tokenIsToken0: false, decimals0: 6, decimals1: 8 };
  const sq = (p) => { /* sqrtPriceX96 for a USD price of token1 (8 dec) in token0 USDC (6 dec): token1 per token0 = 1/p x 10^(6-8)... inverted */
    const oneIn0 = 1 / p; const s = Math.sqrt(oneIn0 / 10 ** (6 - 8)); return BigInt(Math.round(s * 2 ** 48)) * (1n << 48n); };
  const POOLX = '0x' + '1'.repeat(40);
  const log = (bn, li, tms, p, extra = {}) => ({ blockNumber: '0x' + bn.toString(16), logIndex: '0x' + li.toString(16), blockTimestampMs: tms == null ? undefined : '0x' + tms.toString(16),
    address: POOLX, topics: [C.TOPIC_SWAP], data: '0x' + '0'.repeat(128) + sq(p).toString(16).padStart(64, '0') + '0'.repeat(128), ...extra });
  const end = Date.UTC(2026, 10, 13, 6);
  const P = (logs) => C.lastPrice(logs, end, meta);
  c(near(P([log(10, 0, end - 5000, 900), log(11, 2, end - 100, 910), log(11, 1, end - 100, 905)]), 910, 1e-3)); /* the last by (block, index) */
  c(near(P([log(11, 1, end - 100, 905), log(11, 2, end - 100, 910), log(10, 0, end - 5000, 900)]), 910, 1e-3)); /* in any order */
  c(near(P([log(10, 0, end - 5000, 900), log(12, 0, end + 400, 950)]), 900, 1e-3)); /* after the end: not taken */
  c(near(P([log(10, 0, end - 5000, 900), log(12, 0, end, 930)]), 930, 1e-3)); /* exactly at the end: taken */
  c(near(P([log(10, 0, end - 5000, 900), log(12, 0, null, 950)]), 900, 1e-3)); /* no time: not taken */
  c(near(P([log(10, 0, end - 5000, 900), log(12, 0, end - 1, 950, { removed: true })]), 900, 1e-3));
  c(P([]) === null && P(null) === null && P([{ blockNumber: '0x1', logIndex: '0x0', blockTimestampMs: '0x1', data: '0x00' }]) === null);
  /* seconds only: a block in the end's own second is AFTER (5 blocks share a second); the second before is before */
  const sec = (bn, s, p) => ({ blockNumber: '0x' + bn.toString(16), logIndex: '0x0', blockTimestamp: '0x' + s.toString(16), data: log(1, 0, 1, p).data });
  c(near(P([sec(10, end / 1000 - 1, 900), sec(11, end / 1000, 960)]), 900, 1e-3));
  /* the close: the MEDIAN of the last 5 minutes (one dump 1 s before the end does not set it), the last swap only when none */
  const M = (logs) => C.closePrice(logs, end, meta, POOLX);
  c(near(M([log(10, 0, end - 200000, 900), log(11, 0, end - 100000, 1000), log(12, 0, end - 1000, 500)]), 900, 1e-3));
  c(near(M([log(10, 0, end - 200000, 900), log(11, 0, end - 100000, 1000)]), 950, 1e-3));
  c(near(M([log(10, 0, end - 400000, 880)]), 880, 1e-3)); /* none in 5 min: the last before */
  c(near(M([log(10, 0, end - 400000, 880), log(11, 0, end - 100000, 900)]), 900, 1e-3)); /* 6 min 40 s ago is outside */
  c(near(M([log(10, 0, end - 300000, 700), log(11, 0, end - 100, 900)]), 900, 1e-3)); /* exactly 5 min ago is outside */
  c(near(M([log(10, 0, end - 100, 900), log(11, 0, end - 50, 100, { address: '0x' + '2'.repeat(40) })]), 900, 1e-3)); /* another address */
  c(near(M([log(10, 0, end - 100, 900), log(11, 0, end - 50, 100, { topics: ['0x' + 'd'.repeat(64)] })]), 900, 1e-3)); /* another event */
  c(M([]) === null && C.MEDIAN_MS === 300000);
  c(C.logTimeMs({ blockTimestamp: '0x10' }) === 16999 && C.logTimeMs({ blockTimestampMs: '0x10', blockTimestamp: '0x1' }) === 16 && C.logTimeMs({}) === null);
  /* readCloses on a fake chain: 0.2 s blocks, one swap 30 s before each end except a quiet one found in the 2nd span */
  const T0 = Date.UTC(2026, 10, 1) / 1000, headN = 1_000_000 + (Date.UTC(2026, 10, 13, 9) / 1000 - T0) / 0.2; /* the head at 09:00 UTC */
  /* blocks 0.2 s apart, then a 40 s sequencer pause 10 blocks before the head: the straight-line estimate of an end falls EARLY */
  const tsOf = (b) => T0 + (b - 1_000_000) * 0.2 + (b >= headN - 10 ? 40 : 0);
  const ends = H.windowEnds(Date.UTC(2026, 10, 13, 9), 6);
  const swaps = ends.map((at, i) => ({ t: at - (i === 2 ? 400_000 : i === 5 ? 2_000 : 30_000), p: 900 + i }));
  swaps.push({ t: ends[3] + 20_000, p: 1 }); /* a swap 20 s AFTER an end, inside the margin: must not be taken */
  let calls = 0, logsCalls = 0;
  const rpc = async (m, p) => { calls++;
    if (m === 'eth_getBlockByNumber') { const b = p[0] === 'latest' ? headN : Number(BigInt(p[0])); return { number: '0x' + b.toString(16), timestamp: '0x' + Math.floor(tsOf(b)).toString(16) }; }
    if (m === 'eth_getLogs') { logsCalls++; const f = Number(BigInt(p[0].fromBlock)), to = Number(BigInt(p[0].toBlock));
      return swaps.map((s, k) => ({ s, k, b: 1_000_000 + Math.round((s.t / 1000 - T0) / 0.2) })).filter((x) => x.b >= f && x.b <= to).map((x) => log(x.b, x.k, x.s.t, x.s.p)); }
    throw new Error('unexpected ' + m); };
  const got = await C.readCloses({ rpc, pool: '0x' + '1'.repeat(40), meta, ends });
  c(got.length === 6 && got.every((x, i) => x.at === ends[i] && near(x.price, 900 + i, 1e-3)));
  c(logsCalls === 7); /* one span each, two for the quiet one */
  /* known closes are not read again */
  calls = 0; logsCalls = 0;
  const again = await C.readCloses({ rpc, pool: '0x' + '1'.repeat(40), meta, ends, known: new Map(got.slice(0, 5).map((x) => [x.at, x.price])) });
  c(logsCalls === 1 && near(again[5].price, 905, 1e-3) && near(again[0].price, 900, 1e-3));
  calls = 0; c((await C.readCloses({ rpc, pool: '0x' + '1'.repeat(40), meta, ends, known: new Map(got.map((x) => [x.at, x.price])) })).length === 6 && calls === 0);
  /* nothing found in all spans -> null, not a neighbour's price */
  const quiet = async (m, p) => (m === 'eth_getLogs' ? [] : rpc(m, p));
  c((await C.readCloses({ rpc: quiet, pool: '0x' + '1'.repeat(40), meta, ends: ends.slice(0, 1) }))[0].price === null);
  /* an end the head is not 60 s past: not read now (null), the others are; nothing thrown */
  const freshHead = 1_000_000 + Math.round((ends[5] / 1000 + 30 - T0) / 0.2);
  const rpcFresh = (m, p) => (m === 'eth_getBlockByNumber' && p[0] === 'latest' ? rpc(m, ['0x' + freshHead.toString(16), false]) : rpc(m, p));
  const fr = await C.readCloses({ rpc: rpcFresh, pool: '0x' + '1'.repeat(40), meta, ends });
  c(fr[5].price === null && near(fr[4].price, 904, 1e-3) && near(fr[0].price, 900, 1e-3));
  /* a node that answers logs with something else is an error, never an empty close */
  let threw = false; try { await C.readCloses({ rpc: async (m, p) => (m === 'eth_getLogs' ? null : rpc(m, p)), pool: '0x' + '1'.repeat(40), meta, ends: ends.slice(0, 1) }); } catch (_) { threw = true; } c(threw);
  return bad;
}

const H = await import(pathToFileURL(path.join(ICI, 'fly-hold.js')).href), C = await import(pathToFileURL(path.join(ICI, 'fly-hold-closes.js')).href);
const base = await checks(H, C);
t('the rule and the closes, on the real modules (' + base + ' failed checks)', base === 0);

/* ── the page acts on it ── */
const trade = JS.slice(JS.indexOf('async function autoTrade(e) {'), JS.indexOf('/* the session is remembered'));
const code = trade.replace(/\/\*[\s\S]*?\*\//g, '');
t('page imports the rule', JS.includes("import { holdAction, holdLines, HOLD, HOLD_MIN_BUY_USDC } from './fly-hold.js';"));
t('page: reads the signal of the stock it trades, fresh only (MAX_AGE), and acts on the REAL holdings', code.includes('const sig = await readHold(stock.address);')
  && code.includes('const fresh = sig.target != null && sig.token === stock.address && Number.isInteger(sig.at) && sig.at % HOLD.WINDOW_MS === 0 && sig.at <= Date.now() && Date.now() - sig.at <= HOLD.MAX_AGE_MS;')
  && code.includes('const action = fresh ? holdAction(sig.target, held) : null;') && code.indexOf('const a = await autoAccount(stock.address), held = a.stock ? BigInt(a.stock) : 0n;') < code.indexOf('holdAction('));
t('page: the auto-stop is checked before the signal is acted on', code.indexOf('verdictPerte(') > 0 && code.indexOf('verdictPerte(') < code.indexOf('holdAction('));
t('page: no brain word in the money path', !/decide\(e\.word|e\.word ===/.test(code));
t('page: once per close and action, 3 tries at most, counted in the SAVED state (a reload gives no more)', code.includes("const tryKey = seenKey + '|' + action;")
  && code.includes('autoRefresh(); const tr = auto.s.holdTries && auto.s.holdTries.key === tryKey ? auto.s.holdTries.n + 1 : 1;') && code.includes('auto.s.holdTries = { key: tryKey, n: tr }; autoSave();') && code.includes('if (tr > 3) return;'));
t('page: buys from 2 USDC, said otherwise', code.includes('if (amt < BigInt(HOLD_MIN_BUY_USDC * 1e6)) { autoNote('));
t('page: daily cap and 24 h volume cap still checked before planning', code.indexOf('mayTrade(autoRefresh(), today, maxDay)') > 0 && code.indexOf('mayBuyVolume(') > code.indexOf('mayTrade(') && code.indexOf('mayBuyVolume(') < code.indexOf("fetch('/api/rails/plan?"));
/* the fee condition, EXECUTED on the values a planner can send: only "0" (what it sends, fork 2026-11-13) and 0 pass */
{ const COND = "(typeof bps === 'string' || typeof bps === 'number') && String(bps) === '0'";
  const pass = code.includes('if (!(' + COND + '))') ? new Function('bps', 'return ' + COND + ';') : null;
  t('page: an interface fee other than exactly 0 -> nothing signed (executed: "0" and 0 pass; null, "", [], "10", 10, undefined do not)',
    !!pass && pass('0') && pass(0) && ![null, '', [], '10', 10, undefined, '00', ' 0'].some((v) => pass(v)) && code.indexOf("String(bps) === '0'") < code.indexOf('checkPlanCalls(')
    && !code.includes('if (round === 0) { const bps')); }
t('page: a sell counts in the 24 h volume at what its plan receives', code.includes("if (action === 'sell' && round === 0 && /^\\d+$/.test(String(p.resume.recoitAuMoins || ''))) volumeDuTrade = Number(p.resume.recoitAuMoins) / 1e6;"));
t('page: the guard still checks every call before its key signs', code.includes('const refused = checkPlanCalls({ calls: p.aSigner, fly: s.address, pay: de, receive: vers, amount: montant,') && code.includes("if (refused) throw new Error('the fly refused to sign: ' + refused.why);"));
t('page: looked at every minute and at each brain decision', JS.includes("setInterval(() => { void autoTrade({ type: 'tick' }); }, 60000);") && JS.includes("if (e.type === 'decision') { renderDecision(e); autoTrade(e);")
  && trade.includes("if (!auto.s || !e || e.sim || (e.type !== 'decision' && e.type !== 'tick')) return;"));
t('page: a trade in flight -> the tick does nothing (no second trade)', code.includes('if (auto.busy) return;'));
t('page: the start note and the rules say the hold rule', JS.includes('in by default and out for 6 hours after a sharp 6-hour drop') && JS.includes("'Its rule: it holds the stock by default and steps out for 6 hours after a 6-hour move below ' + HOLD.DROP_X"));
t('html: the rule is written for the user, with what it can miss', HT.includes('<li><b>It holds the stock by default and steps out after a sharp drop.</b>') && HT.includes('A step out can be followed by a rise it misses'));

/* ── the server serves it ── */
const route = SRV.slice(SRV.indexOf("if (chemin.startsWith('/api/fly/hold/')) {"), SRV.indexOf("if (chemin.startsWith('/api/fly/hold/')) {") + 900);
t('server: GET only, stocks of the pool table only, budgeted per IP', route.includes("if (req.method !== 'GET')") && route.includes('if (!POOLS_ACTIONS_AERODROME.get(token)) { send(404') && route.includes("if (!budgetMouche(req, 'hold'))") && /FLY_LIMITES = \{[^}]*hold: \d+ \}/.test(SRV));
const lect = SRV.slice(SRV.indexOf('function lireSignalMouche(token) {'), SRV.indexOf('/* ── THE SHARED FLY (2026-11-08)'));
t('server: one build per stock, two at most, 60 s kept, closes read once, the rule called (not rewritten)', lect.includes('if (flyHoldInFlight.has(token)) return flyHoldInFlight.get(token);') && lect.includes('if (flyHoldInFlight.size >= 2)')
  && lect.includes('Date.now() - memo.t < 60000') && lect.includes('known: memo.known') && lect.includes('const s = holdSignal(closes, { nowMs: Date.now() });') && !/typical \* \(1 -/.test(lect));
t('server: a failure is said, never a target, and kept 60 s (no rebuild storm)', lect.includes("const r = { ok: false, target: null, why: 'closes not read: '") && lect.includes('flyHold.set(token, { known: memo.known, r, t: Date.now() });'));
t('server: fly-hold.js is served (the page imports it); fly-hold-closes.js is not needed by the page', /\r?\n {2}'fly-hold\.js',\r?\n/.test(SRV) && !JS.includes('fly-hold-closes'));

/* ── mutants: each must be killed by checks() ── */
const MUT_H = [
  ['compared before the update', "    if (move !== 0) typical = typical > 0 ? typical * (1 - HOLD.ALPHA) + Math.abs(move) * HOLD.ALPHA : Math.abs(move);\n  }", "  }"],
  ['drop factor 1', 'DROP_X: 2,', 'DROP_X: 1,'],
  ['out on <=', 'const out = move < threshold;', 'const out = move <= threshold - 1e-3;'],
  ['gap not breaking', "&& closes[start].at - closes[start - 1].at === HOLD.WINDOW_MS) start--;", ') start--;'],
  ['stale accepted', 'if (nowMs != null && !(nowMs - at <= HOLD.MAX_AGE_MS))', 'if (false)'],
  ['short history traded', 'if (moves < HOLD.MIN_MOVES ||', 'if (moves < 2 ||'],
  ['last close missing -> earlier close', "if (!ok(closes[start] && closes[start].price)) return none('the last close was not read');", 'while (start > 0 && !ok(closes[start].price)) start--;'],
  ['buys while holding', "if (target === 'in' && held === 0n) return 'buy';", "if (target === 'in') return 'buy';"],
  ['sells while out', "if (target === 'out' && held > 0n) return 'sell';", "if (target === 'out') return 'sell';"],
  ['number holdings accepted', "if (typeof held !== 'bigint' || held < 0n) return null;", 'held = BigInt(held || 0);'],
  ['minimum buy 0.5', 'export const HOLD_MIN_BUY_USDC = 2;', 'export const HOLD_MIN_BUY_USDC = 0.5;'],
  ['ends one window late', 'const last = Math.floor(nowMs / HOLD.WINDOW_MS) * HOLD.WINDOW_MS', 'const last = Math.ceil(nowMs / HOLD.WINDOW_MS) * HOLD.WINDOW_MS'],
];
const MUT_C = [
  ['time by the second, inclusive', 'return s == null ? null : s * 1000 + 999;', 'return s == null ? null : s * 1000;'],
  ['log without time used', 'if (t == null || t > endMs) continue;', 'if (t != null && t > endMs) continue;'],
  ['first log kept, not the last', 'if (!best || x.bn > best.bn || (x.bn === best.bn && x.li > best.li)) best = x;', 'if (!best) best = x;'],
  ['index ignored', '(x.bn === best.bn && x.li > best.li)', 'false'],
  ['removed logs used', 'if (l.removed === true) continue;', ''],
  ['no margin past the end', '* per) + MARGIN);', '* per));'],
  ['one span only', 'const SPANS = [1800, 3000, 14400];', 'const SPANS = [1800];'],
  ['median replaced by the last swap', '  if (win.length) {', '  if (false) {'],
  ['median over 10 minutes', 'export const MEDIAN_MS = 5 * 60 * 1000;', 'export const MEDIAN_MS = 10 * 60 * 1000;'],
  ['5 minutes counted inclusive', '.filter((x) => x.t > endMs - MEDIAN_MS)', '.filter((x) => x.t >= endMs - MEDIAN_MS)'],
  ['logs of other addresses used', "if (pool && String(l.address || '').toLowerCase() !== String(pool).toLowerCase()) continue;", ''],
  ['logs of other events used', "if (pool && !(Array.isArray(l.topics) && String(l.topics[0] || '').toLowerCase() === TOPIC_SWAP)) continue;", ''],
  ['fresh ends read', 'const readable = need.filter((at) => head.ts * 1000 >= at + HEAD_LEAD_MS);', 'const readable = need;'],
  ['known closes read again', 'const need = ends.filter((at) => !(known.get(at) > 0));', 'const need = ends.slice();'],
  ['a non-list logs answer is empty', "if (!Array.isArray(logs)) throw new Error('eth_getLogs did not answer a list');", 'if (!Array.isArray(logs)) continue;'],
];
let killed = 0, total = 0;
for (const [set, src, file] of [[MUT_H, SRC_H, 'fly-hold.js'], [MUT_C, SRC_C, 'fly-hold-closes.js']]) {
  for (const [nom, de, vers] of set) {
    total++;
    if (!src.includes(de)) { t('mutant applies: ' + nom, false); continue; }
    const f = path.join(ICI, '.mutant-392-' + process.pid + '-' + total + '-' + file);
    try {
      writeFileSync(f, src.replace(de, () => vers));
      const M = await import(pathToFileURL(f).href);
      let bad; try { bad = file === 'fly-hold.js' ? await checks(M, C) : await checks(H, M); } catch (_) { bad = 1; }
      t('mutant killed: ' + nom, bad > 0); if (bad > 0) killed++;
    } finally { if (existsSync(f)) rmSync(f); }
  }
}
console.log('mutants killed: ' + killed + '/' + total);
console.log(ok + '/' + (ok + ko) + (ko ? ' — RED' : ' — green'));
process.exit(ko ? 1 : 0);
