/* tools/prix-tblock-wtcoin.mjs - read-only: is there a live TBLOCK/wtCOIN market, and what are TBLOCK and wtCOIN worth in USD?
 * Reads (1) the pinned TBLOCK Uniswap v4 pool (key wtCOIN/TBLOCK, tblock-hold.js) through StateView getSlot0 + getLiquidity,
 * (2) the Aerodrome wtCOIN/USDC pool (tblock-route.js) slot0 + its token balances. Prices from sqrtPriceX96. No signing. */
import { TBLOCK, WTCOIN, TBLOCK_POOL } from '../tblock-hold.js';
import { POOL_WTCOIN_USDC } from '../tblock-route.js';
import { STATE_VIEW } from '../usage-onchain.js';
import { USDC_BASE } from '../frais-creation.js';
import { selecteur } from '../keccak.js';

const NODE = 'https://base-rpc.publicnode.com';
const call = async (to, data) => { const r = await fetch(NODE, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const S = (sig) => String(selecteur(sig)).replace(/^0x/, '');
const w = (h, i) => BigInt('0x' + h.slice(2 + 64 * i, 2 + 64 * (i + 1)));
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const dec = async (t) => Number(w(await call(t, '0x' + S('decimals()')), 0));
const bal = async (t, who) => w(await call(t, '0x' + S('balanceOf(address)') + u(who)), 0);

const [dT, dW, dU] = await Promise.all([dec(TBLOCK), dec(WTCOIN), dec(USDC_BASE)]);
/* v4: currency0 = wtCOIN, currency1 = TBLOCK (checked by tblock-route.js verifierCleTblock) -> price = TBLOCK per wtCOIN */
const s0 = await call(STATE_VIEW, '0x' + S('getSlot0(bytes32)') + TBLOCK_POOL.poolId.slice(2));
const L = w(await call(STATE_VIEW, '0x' + S('getLiquidity(bytes32)') + TBLOCK_POOL.poolId.slice(2)), 0);
const sq = Number(w(s0, 0)) / 2 ** 96;
const tblockPerWtcoin = sq * sq * 10 ** (dW - dT);
/* Aerodrome CL slot0: sqrtPriceX96 first word; token0 = wtCOIN, token1 = USDC (tblock-route.js note) */
const a0 = await call(POOL_WTCOIN_USDC.pool, '0x' + S('slot0()'));
const sqA = Number(w(a0, 0)) / 2 ** 96;
const usdcPerWtcoin = sqA * sqA * 10 ** (dW - dU);
const [wtInAero, usdcInAero] = await Promise.all([bal(WTCOIN, POOL_WTCOIN_USDC.pool), bal(USDC_BASE, POOL_WTCOIN_USDC.pool)]);
console.log(JSON.stringify({
  tblockPool: { poolId: TBLOCK_POOL.poolId, liquidity: L.toString(), tblockPerWtcoin: +tblockPerWtcoin.toPrecision(6) },
  wtcoinUsdcPool: { pool: POOL_WTCOIN_USDC.pool, usdcPerWtcoin: +usdcPerWtcoin.toPrecision(6), wtcoin: Number(wtInAero) / 10 ** dW, usdc: Number(usdcInAero) / 10 ** dU },
  usd: { wtcoin: +usdcPerWtcoin.toPrecision(6), tblock: +(usdcPerWtcoin / tblockPerWtcoin).toPrecision(6) },
}, null, 1));
