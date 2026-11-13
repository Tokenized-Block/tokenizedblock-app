/* fly-hold.js — game392 (Phil 2026-11-13, option A): the fly's REAL-money rule is "in by default, step out after a sharp drop".
 * PURE: no DOM, no fetch, no timers. The server builds the closes (serveur-web.js /api/fly/hold/), the page acts on the target, the panel
 * explains it, and the tests replay it on 66 days of real swaps: all three run THIS code.
 *
 * Why this rule (measured 2026-11-12/13 on ~1 M real swaps of SNDKc, NVDAc and AAPLc, 66 days, out of sample = the last half):
 *   - no "predict the next window" rule paid its round trip after costs (the fly's record: ~50.5%, a coin flip);
 *   - THIS code (holdSignal, 28 closes of lookback like the server), replayed at 5 USDC a trade with the measured costs, last half:
 *     SNDKc -30.6% vs -40.3% held, NVDAc -26.0% vs -27.4%, AAPLc +2.0% vs +5.6% (18 to 26 trades; closes = 5-minute medians as served;
 *     scratchpad fly-fix/replay-hold-med.mjs; with last-swap closes: -30.5 / -26.1 / +2.1).
 *     Ahead in the two falls, BEHIND in the rise, on ONE period of 66 days: it is not a better investment, it is a different risk.
 *     The same idea on 5-minute windows lost 60-97% (backtest.mjs): the 6-hour window is part of the rule.
 * What it can NOT know: the future. It holds a stock that can fall; a step out can be followed by a rise it misses. */

export const HOLD = Object.freeze({
  WINDOW_MS: 6 * 3600 * 1000, /* closes at 00:00, 06:00, 12:00, 18:00 UTC */
  DROP_X: 2,                  /* out when the last 6 h move < -DROP_X x the usual 6 h move */
  ALPHA: 0.1,                 /* the usual move: running mean of |move|, the weight of the newest (the backtest's) */
  CLOSES: 28,                 /* 7 days of closes are read */
  MIN_MOVES: 8,               /* fewer consecutive moves than this: the usual move is not known yet -> no target, nothing traded */
  MAX_AGE_MS: 7 * 3600 * 1000 /* a signal whose last close is older than this is stale -> nothing traded */
});

/** The ends of the last `n` 6-hour windows that are closed at `nowMs`, oldest first (multiples of WINDOW_MS since the epoch = UTC). */
export function windowEnds(nowMs, n = HOLD.CLOSES) {
  if (!(Number.isFinite(nowMs) && nowMs > 0) || !(Number.isInteger(n) && n > 0)) return [];
  const last = Math.floor(nowMs / HOLD.WINDOW_MS) * HOLD.WINDOW_MS, out = [];
  for (let k = n - 1; k >= 0; k--) out.push(last - k * HOLD.WINDOW_MS);
  return out;
}

const ok = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** The target from closes [{ at, price }] (oldest first). Only the newest CONSECUTIVE run counts: a close not read (price null)
 *  breaks the chain, because a move across a gap is a 12-hour move, not a 6-hour one.
 *  Returns { target: 'in' | 'out' | null, move, typical, threshold, at, moves, why } — target null means "not known: trade nothing". */
export function holdSignal(closes, { nowMs = null } = {}) {
  const none = (why, extra = {}) => ({ target: null, move: null, typical: null, threshold: null, at: null, moves: 0, why, ...extra });
  if (!Array.isArray(closes) || !closes.length) return none('no closes read');
  /* the newest consecutive run of read closes */
  let start = closes.length - 1;
  if (!ok(closes[start] && closes[start].price)) return none('the last close was not read');
  while (start > 0 && ok(closes[start - 1] && closes[start - 1].price) && closes[start].at - closes[start - 1].at === HOLD.WINDOW_MS) start--;
  const run = closes.slice(start);
  const at = run[run.length - 1].at;
  if (nowMs != null && !(nowMs - at <= HOLD.MAX_AGE_MS)) return none('the last close is stale', { at });
  /* the backtest's exact order (scratchpad fly-fix/backtest.mjs signals()): the usual move is updated WITH the newest move, then compared */
  let typical = 0, move = null;
  for (let i = 1; i < run.length; i++) {
    move = run[i].price / run[i - 1].price - 1;
    if (move !== 0) typical = typical > 0 ? typical * (1 - HOLD.ALPHA) + Math.abs(move) * HOLD.ALPHA : Math.abs(move);
  }
  const moves = run.length - 1;
  if (moves < HOLD.MIN_MOVES || !(typical > 0)) return none('too few 6-hour moves read to know the usual one (' + moves + ' of ' + HOLD.MIN_MOVES + ')', { at, moves, move, typical: typical > 0 ? typical : null });
  const threshold = -HOLD.DROP_X * typical;
  const out = move < threshold;
  return { target: out ? 'out' : 'in', move, typical, threshold, at, moves, why: out ? 'the last 6 hours fell more than ' + HOLD.DROP_X + 'x the usual move' : 'no sharp drop in the last 6 hours' };
}

/** What the fly does with a target and what it really holds: 'buy' (target in, holds none), 'sell' (target out, holds some), or null. */
export function holdAction(target, held) {
  if (typeof held !== 'bigint' || held < 0n) return null;
  if (target === 'in' && held === 0n) return 'buy';
  if (target === 'out' && held > 0n) return 'sell';
  return null;
}

/** The smallest buy the fly sends, in USDC: below it the gas of a round trip is more than ~0.5% of the trade (measured 2026-11-12:
 *  0.46% at 2 USDC, 0.25% at 5, 1.55% at 0.5). */
export const HOLD_MIN_BUY_USDC = 2;

/** The panel's lines for a signal (plain text; the page escapes nothing it does not build). */
export function holdLines(s, symbol = 'the stock') {
  const pc = (x, d = 2) => (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
  const when = s && s.at ? new Date(s.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : null;
  const rule = 'Its rule: it holds ' + symbol + ' by default and steps out for 6 hours when the last 6 hours fell more than ' + HOLD.DROP_X + 'x the usual 6-hour move. It checks at 00:00, 06:00, 12:00 and 18:00 UTC.';
  if (!s || s.target == null) return { rule, last: 'Last 6-hour close: ' + (s && s.why ? s.why : 'not read') + '.', verdict: 'Not known yet: it trades nothing until it is.' };
  const last = `Last 6-hour close (${when}): ${pc(s.move)} · usual 6-hour move ${(s.typical * 100).toFixed(2)}% · it steps out below ${pc(s.threshold)}.`;
  const verdict = s.target === 'out' ? 'Now: OUT. It sells what it holds and waits for the next close.' : 'Now: IN. It holds ' + symbol + ' (it buys if it holds none).';
  return { rule, last, verdict };
}
