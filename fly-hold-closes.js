/* fly-hold-closes.js — game392: the 6-hour closes of a stock's pool, rebuilt from its own Swap logs (read-only). A close = the price
 * MEDIAN of the swaps of the last 5 minutes before the window end (the last swap before it when there were none: a quiet hour).
 * Security review 2026-11-13: with the LAST swap, one dump at 05:59:59 in a thin pool set the close and sent every fly out at once;
 * a median needs most of 5 minutes of swaps moved. Replayed on 66 days it changes the results by under 0.3 points. Nothing is kept between deploys that cannot be read again: the closes come back from
 * the chain, so a restart costs reads, never a wrong number.
 * Takes rpc(method, params). Measured 2026-11-13 on publicnode: blocks are 0.2000 s apart (Base since 2026-11-05), logs carry
 * blockTimestamp, SNDKc had 8 swaps in the 2 minutes before a close 7 days back; mainnet.base.org answered 429. */
import { priceFromSqrt } from './fly-price.js';

/* keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)"), the CL pool event (computed in the study, probe-cost) */
export const TOPIC_SWAP = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
const MARGIN = 300; /* blocks (~60 s) read past the estimated end block */
const SPANS = [1800, 3000, 14400]; /* blocks read back from there: ~6 min (the 5-minute median), ~10 min more, ~48 min more; none -> not read */
export const MEDIAN_MS = 5 * 60 * 1000;
export const CONCURRENCY = 4; /* closes read at once in a build */
const HEAD_LEAD_MS = 60 * 1000; /* a close is read only once the head is 60 s past it: before, swaps of its last seconds may be missing */
const hexn = (h) => (typeof h === 'string' && /^0x[0-9a-f]+$/i.test(h) ? Number(BigInt(h)) : null);

/** a block whose timestamp is at or before tSec, near it: estimate from the head at `secPerBlock`, read, correct (at most 3 reads) */
export async function blockAt(rpc, head, tSec, secPerBlock = 0.2) {
  let b = head.number - Math.round((head.ts - tSec) / secPerBlock);
  for (let k = 0; k < 3; k++) {
    if (!(b > 0)) return null;
    const blk = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]);
    const ts = blk ? hexn(blk.timestamp) : null;
    if (ts == null) return null;
    if (ts <= tSec && tSec - ts < 5) return { number: b, ts };
    const nb = b - Math.ceil((ts - tSec) / secPerBlock);
    if (nb === b) return ts <= tSec ? { number: b, ts } : null;
    b = nb;
  }
  return null;
}

/** the time of a log's block in ms: blockTimestampMs when the node gives it; else the second, counted as its LAST ms (so a block in
 *  the end's own second is never taken as before it: 5 blocks share a second at 0.2 s); null when neither is given */
export function logTimeMs(l) {
  const ms = hexn(l && l.blockTimestampMs);
  if (ms != null) return ms;
  const s = hexn(l && l.blockTimestamp);
  return s == null ? null : s * 1000 + 999;
}

/** the swaps of `pool` in the logs timed at or before endMs: [{ bn, li, t, price }] (a log of another address or event is not a swap) */
export function swapsBefore(logs, endMs, meta, pool = null) {
  if (!Array.isArray(logs)) return [];
  const out = [];
  for (const l of logs) {
    const bn = hexn(l && l.blockNumber), li = hexn(l && l.logIndex), t = logTimeMs(l);
    if (bn == null || li == null || typeof l.data !== 'string' || l.data.length < 2 + 64 * 3) continue;
    if (l.removed === true) continue;
    if (pool && String(l.address || '').toLowerCase() !== String(pool).toLowerCase()) continue;
    if (pool && !(Array.isArray(l.topics) && String(l.topics[0] || '').toLowerCase() === TOPIC_SWAP)) continue;
    /* the block time decides, never the block number: the block of an end is an ESTIMATE (2026-11-13: a close read 935.856 instead of
     *   936.2856 when the estimate fell a few blocks early; then 5 of 27 closes off by blocks inside the end's own second, until the ms
     *   time). A log without its time is not used: a close not read beats a wrong one. */
    if (t == null || t > endMs) continue;
    const sqrt = BigInt('0x' + l.data.slice(2 + 128, 2 + 192));
    const price = sqrt === 0n ? null : priceFromSqrt({ sqrtPriceX96: sqrt, ...meta });
    if (price > 0) out.push({ bn, li, t, price });
  }
  return out;
}

/** the price of the last swap in the logs whose block time is <= endMs, or null */
export function lastPrice(logs, endMs, meta, pool = null) {
  let best = null;
  for (const x of swapsBefore(logs, endMs, meta, pool)) if (!best || x.bn > best.bn || (x.bn === best.bn && x.li > best.li)) best = x;
  return best ? best.price : null;
}

/** the close: the median of the swaps timed in (endMs - 5 min, endMs]; none there -> the last swap before; none at all -> null */
export function closePrice(logs, endMs, meta, pool = null) {
  const all = swapsBefore(logs, endMs, meta, pool);
  const win = all.filter((x) => x.t > endMs - MEDIAN_MS).map((x) => x.price).sort((a, b) => a - b);
  if (win.length) { const m = win.length >> 1; return win.length % 2 ? win[m] : (win[m - 1] + win[m]) / 2; }
  return lastPrice(logs, endMs, meta, pool);
}

/** closes [{ at, price }] for each end (ms, oldest first); price null where nothing was read. `known` (Map at -> price) skips reads. */
export async function readCloses({ rpc, pool, meta, ends, known = new Map() }) {
  const need = ends.filter((at) => !(known.get(at) > 0));
  const got = new Map();
  if (need.length) {
    const h = await rpc('eth_getBlockByNumber', ['latest', false]);
    const head = { number: hexn(h && h.number), ts: hexn(h && h.timestamp) };
    if (head.number == null || head.ts == null) throw new Error('the head block was not read');
    /* an end the head is not yet 60 s past is not read now (null, never kept): read again at the next build */
    const readable = need.filter((at) => head.ts * 1000 >= at + HEAD_LEAD_MS);
    /* one corrected anchor (the oldest end read), then straight lines to the head: blocks are evenly spaced */
    const a = readable.length ? await blockAt(rpc, head, Math.floor(readable[0] / 1000)) : null;
    if (readable.length && !a) throw new Error('the block of the oldest close was not found');
    const per = a && head.ts > a.ts ? (head.number - a.number) / (head.ts - a.ts) : 5;
    const one = async (at) => {
      const tSec = Math.floor(at / 1000);
      /* read up to ~60 s PAST the estimated end block; lastPrice keeps only the swaps timed at or before the end */
      const b = Math.min(head.number, a.number + Math.floor((tSec - a.ts) * per) + MARGIN);
      let price = null, to = b;
      for (const span of SPANS) {
        const from = Math.max(0, to - span + 1);
        const logs = await rpc('eth_getLogs', [{ address: pool, topics: [TOPIC_SWAP], fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) }]);
        if (!Array.isArray(logs)) throw new Error('eth_getLogs did not answer a list');
        price = closePrice(logs, at, meta, pool);
        if (price != null) break;
        to = from - 1;
      }
      got.set(at, price);
    };
    /* game396 (prod 2026-11-13: a cold build took 161 s, ~45 calls one after the other): CONCURRENCY ends read at once */
    for (let i = 0; i < readable.length; i += CONCURRENCY) await Promise.all(readable.slice(i, i + CONCURRENCY).map(one));
  }
  return ends.map((at) => ({ at, price: known.get(at) > 0 ? known.get(at) : (got.get(at) ?? null) }));
}
