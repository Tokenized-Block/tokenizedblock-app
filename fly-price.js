/* fly-price.js — the LIVE on-chain price of a tokenized stock, read from its Aerodrome CL pool (slot0), read-only.
 * Tokenized stocks trade 24/7 on Base: this is the price the market is paying right now, weekends included — unlike the Chainlink
 * reference (/api/actions/reference/), which holds its last value while US markets are closed.
 * Pure: takes an `rpc(method, params)` function, so it runs the same in the server and in a test. */

import { selecteur } from './keccak.js';

/* selectors are computed, never typed: a typed one that is wrong does not fail, it asks ANOTHER function */
const SEL = { slot0: selecteur('slot0()'), token0: selecteur('token0()'), token1: selecteur('token1()'), decimals: selecteur('decimals()'), fee: selecteur('fee()') };
const word = (hex, i) => '0x' + String(hex).slice(2 + 64 * i, 2 + 64 * (i + 1));
const asAddress = (hex) => '0x' + String(hex).slice(-40).toLowerCase();

/** USD price of one `token` given the pool's sqrtPriceX96 and both tokens' order and decimals (the other side is USDC). */
export function priceFromSqrt({ sqrtPriceX96, tokenIsToken0, decimals0, decimals1 }) {
  const s = Number(BigInt(sqrtPriceX96)) / 2 ** 96;
  /* token1 per token0, in whole units */
  const oneIn0 = s * s * 10 ** (decimals0 - decimals1);
  if (!(oneIn0 > 0) || !Number.isFinite(oneIn0)) return null;
  return tokenIsToken0 ? oneIn0 : 1 / oneIn0;
}

const decimalsCache = new Map(), poolCache = new Map();
async function decimalsOf(rpc, address) {
  if (decimalsCache.has(address)) return decimalsCache.get(address);
  const d = Number(BigInt(await rpc('eth_call', [{ to: address, data: SEL.decimals }, 'latest'])));
  if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error('decimals not read for ' + address);
  decimalsCache.set(address, d);
  return d;
}

/** game392: the pool's fixed facts (which side the stock is, both decimals, the fee), read once and cached: the 6-hour closes of
 *  /api/fly/hold/ price each Swap log's sqrtPriceX96 with them (priceFromSqrt). Throws when the pool does not hold the token. */
export async function readPoolMeta({ rpc, pool, token }) {
  await readPoolPrice({ rpc, pool, token });
  const m = poolCache.get(String(pool).toLowerCase()), t = String(token).toLowerCase();
  return { tokenIsToken0: m.token0 === t, decimals0: m.decimals0, decimals1: m.decimals1, feePips: m.feePips };
}

/** Reads slot0, token0, token1 and decimals; returns { priceUsd, tick, block } or throws. */
export async function readPoolPrice({ rpc, pool, token }) {
  const t = String(token).toLowerCase(), key = String(pool).toLowerCase();
  /* a pool's tokens and decimals never change: read once, then each price costs slot0 + blockNumber */
  if (!poolCache.has(key)) {
    const [a0, a1, f] = await Promise.all([SEL.token0, SEL.token1, SEL.fee].map((data) => rpc('eth_call', [{ to: pool, data }, 'latest'])));
    const token0 = asAddress(a0), token1 = asAddress(a1);
    const [decimals0, decimals1] = await Promise.all([decimalsOf(rpc, token0), decimalsOf(rpc, token1)]);
    /* the swap fee in millionths (500 = 0.05%), read on the pool: a paper trade pays it, never a typed guess */
    const feePips = Number(BigInt(f));
    if (!Number.isInteger(feePips) || feePips < 0 || feePips > 1000000) throw new Error('fee not read');
    poolCache.set(key, { token0, token1, decimals0, decimals1, feePips });
  }
  const { token0, token1, decimals0, decimals1, feePips } = poolCache.get(key);
  if (token0 !== t && token1 !== t) throw new Error('pool does not hold this token');
  const [s0, blockHex] = await Promise.all([rpc('eth_call', [{ to: pool, data: SEL.slot0 }, 'latest']), rpc('eth_blockNumber', [])]);
  const sqrtPriceX96 = BigInt(word(s0, 0));
  if (sqrtPriceX96 === 0n) throw new Error('pool not initialized');
  const tickRaw = BigInt(word(s0, 1)) & ((1n << 24n) - 1n);
  const tick = Number(tickRaw >= 1n << 23n ? tickRaw - (1n << 24n) : tickRaw);
  const priceUsd = priceFromSqrt({ sqrtPriceX96, tokenIsToken0: token0 === t, decimals0, decimals1 });
  if (priceUsd == null) throw new Error('price not computable');
  return { priceUsd, tick, block: Number(BigInt(blockHex)), tokenDecimals: token0 === t ? decimals0 : decimals1, feePips };
}
