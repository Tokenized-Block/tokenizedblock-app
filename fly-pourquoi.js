/* fly-pourquoi.js — "Why it has not traded": the fly's buy rule (fly-core.js aRetourPaye) explained with the numbers it decides on.
 * PURE: no DOM, no fetch. The verdict IS aRetourPaye's answer (called, never re-implemented); the cost shown is the same expression on the
 * same inputs, so the screen cannot disagree with the decision (test-fly-pourquoi-391-20261113 checks both over a grid).
 * A number that was not read is null here and "not read" on screen, never 0. Nothing here changes what the fly may do. */
import { aRetourPaye, edgeOf, recordEdge, FLY } from './fly-core.js';

/** the sizes of the hint table, in USDC */
export const SIZES_USDC = Object.freeze([0.5, 2, 5, 10, 20]);
const num = (x) => typeof x === 'number' && Number.isFinite(x);

/** The cost of a round trip as a share of the trade: 2 x (pool fee + interface fee) + 2 x one side's gas in USD / size in USD.
 *  The same expression and the same validity checks as aRetourPaye's threshold; null when any input was not read. */
export function roundTripCost({ feePips, interfaceFee = FLY.INTERFACE_FEE, gasUsd, tailleUsd } = {}) {
  if (!(num(feePips) && feePips >= 0 && num(interfaceFee) && interfaceFee >= 0)) return null;
  if (!(num(gasUsd) && gasUsd > 0 && num(tailleUsd) && tailleUsd > 0)) return null;
  return 2 * (feePips / 1e6 + interfaceFee) + 2 * gasUsd / tailleUsd;
}

/** the record in words, from the exact binomial tails both ways */
export function recordWords(tally) {
  const r = recordEdge(tally);
  if (!r.n) return 'nothing judged yet';
  if (r.n < 10) return 'too few to tell yet';
  if (r.p < 0.1) return 'better than a coin flip so far';
  const worse = recordEdge({ consistent: r.n - r.k, opposite: r.k });
  if (worse.p < 0.1) return 'worse than a coin flip so far';
  return 'about a coin flip so far';
}

const tallyRead = (t) => !!t && typeof t === 'object' && num(t.consistent) && num(t.opposite) && t.consistent >= 0 && t.opposite >= 0;

/** Everything the explainer shows, from the inputs aRetourPaye takes. Fields are null when not read.
 *  state: 'not-read' (something missing: it stays out, as aRetourPaye does), 'out' (the round trip costs more), 'in' (the edge pays it). */
export function whyNoTrade({ tally, typical, feePips, interfaceFee = FLY.INTERFACE_FEE, gasUsd, tailleUsd } = {}) {
  const rec = tallyRead(tally) ? recordEdge(tally) : null;
  const record = rec ? { right: rec.k, wrong: rec.n - rec.k, n: rec.n, rate: rec.rate, p: rec.p, words: recordWords(tally) } : null;
  const typicalRead = num(typical) && typical > 0;
  const edge = record && typicalRead ? edgeOf(tally, typical) : null;
  const cost = roundTripCost({ feePips, interfaceFee, gasUsd, tailleUsd });
  /* aRetourPaye reads the tally by destructuring: an unread tally (null) is answered here as it would answer: no trade */
  const pays = (size) => (rec ? aRetourPaye({ tally, typical, feePips, interfaceFee, gasUsd, tailleUsd: size }) : false);
  const trades = pays(tailleUsd);
  const state = edge == null || cost == null ? 'not-read' : trades ? 'in' : 'out';
  /* the long-run share of right calls it would need: (2p - 1) x typical > cost  <=>  p > (1 + cost / typical) / 2 */
  const needOf = (c) => (c != null && typicalRead ? (1 + c / typical) / 2 : null);
  const need = needOf(cost);
  const table = SIZES_USDC.map((size) => { const c = roundTripCost({ feePips, interfaceFee, gasUsd, tailleUsd: size }), n = needOf(c);
    return { size, cost: c, need: n, impossible: n != null && n >= 1, trades: pays(size) }; });
  return { record, typical: typicalRead ? typical : null, edge, cost, trades, state, need, impossible: need != null && need >= 1,
    savesUsd: state === 'out' ? (cost - edge) * tailleUsd : null, size: num(tailleUsd) && tailleUsd > 0 ? tailleUsd : null, table };
}

const pc = (x, d) => (x * 100).toFixed(d) + '%';
const NR = 'not read';
/** one record as a sentence: right / wrong, the share right, and its words; no record -> not read */
export function recordText(r, label = 'Its record') {
  if (!r) return label + ': ' + NR + '.';
  return r.n ? `${label}: ${r.right} right, ${r.wrong} wrong (${pc(r.rate, 1)}): ${r.words}.` : label + ': nothing judged yet.';
}
/** another fly's numbers at your size, in one sentence (the shared fly on the server, for context): the same rule, the same words */
export function numbersLine(w) {
  if (w.state === 'not-read') return 'On its numbers: ' + (w.edge == null ? 'what a window can earn' : 'the round trip cost') + ': ' + NR + '.';
  return `On its numbers, one window in can earn ${pc(w.edge, 3)} against ${pc(w.cost, 3)} for a round trip at your size: ${w.state === 'in' ? 'that would pay' : 'it would stay out'}.`;
}
/** The explainer as plain-English lines (text only; the page escapes nothing it does not build itself). */
export function whyLines(w, label = '1 · Its record') {
  const record = recordText(w.record, label);
  const edge = '2 · What one window in can earn: ' + (w.edge == null ? NR : pc(w.edge, 3) + ' of the trade (its record pulled toward a coin flip, times the usual move of '
    + pc(w.typical, 3) + ')') + '.';
  const cost = '3 · What a round trip costs at your size (' + (w.size == null ? NR : w.size + ' USDC') + '): '
    + (w.cost == null ? NR : pc(w.cost, 3) + ' (the pool fee on both sides plus the network fee of both sides)') + '.';
  let verdict;
  if (w.state === 'not-read') verdict = 'It trades only when 2 beats 3. Today one of them was not read, so it stays out.';
  else if (w.state === 'out') verdict = `It trades only when 2 beats 3. Today 2 is ${pc(w.edge, 3)} and 3 is ${pc(w.cost, 3)}: it stays out, which saves you about ${w.savesUsd.toFixed(4)} USDC per round trip.`;
  else verdict = `It trades only when 2 beats 3. Today 2 is ${pc(w.edge, 3)} and 3 is ${pc(w.cost, 3)}: it may buy at its next live decision. This is a live experiment: it can lose.`;
  const needWord = (n, imp) => (n == null ? NR : imp ? 'impossible (over 100%)' : 'more than ' + pc(n, 1));
  const need = 'The record it would need to pay at this size, over the long run: ' + (w.need == null ? NR : w.impossible ? 'right more than 100% of the time, which is impossible' : 'right more than ' + pc(w.need, 1) + ' of the time') + '.';
  const table = w.table.map((x) => ({ size: x.size + ' USDC', cost: x.cost == null ? NR : pc(x.cost, 3), need: needWord(x.need, x.impossible) }));
  return { record, edge, cost, verdict, need, table };
}
