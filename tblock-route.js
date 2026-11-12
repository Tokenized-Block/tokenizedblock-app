/* tblock-route.js — BUY and SELL TBLOCK in the app (Phil 2026-11-09). Builds UNSIGNED calls only; a human wallet signs them.
 *
 * THE ROUTE (every pool is PINNED, then re-verified on chain at each plan — nothing is "discovered"):
 *   USDC  -> wtCOIN   Aerodrome Slipstream, newer factory 0x9cb2…7a76, pool 0x0892…7985 (ts 200), router 0x9ee3…d418
 *   ETH   -> USDC -> wtCOIN   the same router, ONE exactInput (WETH/USDC ts 50 pool 0x4a7a…366c, then the pool above);
 *                     the router wraps the ETH itself (WETH9() = Base WETH, read on chain 2026-11-09)
 *   wtCOIN -> TBLOCK  Uniswap v4, EXACTLY the key of TBLOCK_POOL (tblock-hold.js), through the Universal Router + Permit2
 *   TBLOCK -> USDC    the reverse: v4 first, then Aerodrome
 *
 * ⛔ WHY ETH GOES THROUGH USDC ON AERODROME AND NOT THROUGH THE UNISWAP v3 WETH/wtCOIN POOL (0x8495…0aff, fee 1 %):
 *   quoted on a fork of Base at block 55,352,192 (the two pinned newer-factory pools vs the v3 pool, same input):
 *     0.002 ETH: 31,134,647,128,631,740 vs 30,981,421,075,895,811 wtCOIN (+0.495 %); 0.02 ETH: +1.156 %; 0.2 ETH: +3.568 %; 1 ETH: +5.925 %
 *   — the Aerodrome path returns more at every size measured (pool fees 0.0477 % + 0.2452 % vs 1 %, and the v3 pool is thinner).
 *   (The app's other ETH->USDC leg, planEthVersUsdc on v4, takes a 0.5 % router fee: a second fee in one batch, refused.)
 *
 * ⛔ ONE APP FEE PER BATCH (Phil): FRAIS_INTERFACE_BPS_CL (0.1 %), a parameter (`fraisBps`) so a TBLOCK holder can later get 0.
 *   BUY  : taken at the ENTRY, in the currency paid (USDC transfer, or a plain ETH transfer) — never in wtCOIN or TBLOCK;
 *   SELL : taken at the EXIT, in USDC, by the router's sweepTokenWithFee (the Aerodrome CL leg).
 *   The v4 leg takes no app fee. The TBLOCK pool's HOOK (no owner, fixed) takes ~1 % of every swap OUTPUT and sends part of it to
 *   0x…dEaD: that is the pool's own cost, priced in the v4 quote, not an app fee — the plan names it apart (`hookTblock`).
 *
 * ⛔ DELIBERATE, NARROW EXCEPTION to pool-sans-hook.js (ROUTE_VIA_TBLOCK = false, "a block only on our hooks"): those rules keep
 *   TBLOCK out of the GENERIC router so that no guessed key can reach it. This module never guesses: it trades TBLOCK on ONE key,
 *   pinned, whose poolId is recomputed and compared, and whose hook flags are checked (no beforeSwap: anyone can swap). Any other
 *   key, block or pivot is not reachable from here.
 *
 * ⛔ THE PIVOT REMAINDER: a batch's calldata is frozen before it is sent, so the second leg spends the FIRST leg's guaranteed
 *   minimum (`pivotAuMoins`). What the first leg returns above it (at most the tolerance) stays in the wallet as wtCOIN — said in
 *   `resteAuCompte`, never hidden. ⛔ `exigeAtomique`: without a batch the first leg can pass alone.
 *
 * Every plan is SIMULATED as the exact call sequence from the signing account (eth_simulateV1) before it is PRET.
 * Reads are injected (`rpc(method, params)`): no network in the pure parts. */
import { selecteur } from './keccak.js';
import { encodeV4Swap, encodeQuote, ACTIONS_V4, paramsAction, SANS_MINHOP } from './pool.js';
import { etapesPermit2Exactes } from './approbations-exactes.js';
import { PERMIT2 } from './lancer-pool.js';
import { ROUTEUR, QUOTEUR } from './echange.js';
import { FEE_WALLET, USDC_BASE } from './frais-creation.js';
import { calldataExactInputSingleCL, calldataExactInputCL, calldataApprove, FRAIS_INTERFACE_BPS_CL, FRAIS_BPS_MAX_PRUDENT } from './calldata-aerodrome.js';
import { ROUTEUR_AERO_NOUVEAU, FACTORY_AERO_NOUVELLE, calldataEchangeNouvelle, lireCodeQuoteurNouvelle, overrideQuoteur, dataDevisCL, sortieMoyenne } from './liquidite-actions.js';
import { QUOTEUR_AERODROME_CL } from './rolls-en-action.js';
import { TBLOCK, WTCOIN, TBLOCK_POOL, poolIdOfKey } from './tblock-hold.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const word = (x) => BigInt(x).toString(16).padStart(64, '0');
const wordA = (a) => bas(a).replace(/^0x/, '').padStart(64, '0');
const wordI = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
const firstWord = (h) => { const s = String(h || ''); if (!/^0x[0-9a-fA-F]{64}/.test(s)) throw new Error('empty answer from the node'); return BigInt(s.slice(0, 66)); };
const short = (e) => String((e && e.message) || e).slice(0, 160);
/* a revert is the chain's answer; a rate limit / timeout is our blindness */
const isRevert = (e) => /revert|execution|STF|Too little/i.test(short(e)) && !/rate|limit|timeout|busy|429/i.test(short(e));

export const ETH = '0x0000000000000000000000000000000000000000';
export const WETH = '0x4200000000000000000000000000000000000006';
export const USDC = bas(USDC_BASE);
export const DEAD = '0x000000000000000000000000000000000000dead';
export const UNIVERSAL_ROUTER = bas(ROUTEUR[8453]);
export const QUOTER_V4 = bas(QUOTEUR[8453]);
/** the ONLY TBLOCK pool key this module trades on (copied from tblock-hold.js TBLOCK_POOL, itself read from the Initialize log) */
export const TBLOCK_KEY = Object.freeze({ currency0: bas(TBLOCK_POOL.currency0), currency1: bas(TBLOCK_POOL.currency1),
  fee: TBLOCK_POOL.fee, tickSpacing: TBLOCK_POOL.tickSpacing, hooks: bas(TBLOCK_POOL.hooks) });
/* v4 hook permission bits = the low 14 bits of the hook address (v4-core Hooks.sol) */
export const HOOK_FLAG_BEFORE_SWAP = 1n << 7n;
export const HOOK_FLAG_AFTER_SWAP = 1n << 6n;
export const HOOK_FLAG_AFTER_SWAP_RETURNS_DELTA = 1n << 2n;
/** the Aerodrome pools of the route, PINNED (read on a fork of Base, block 55,352,192, 2026-11-09):
 *   wtCOIN/USDC 0x0892…7985 factory 0x9cb2…7a76 ts 200 fee 2452 (0.2452 %), token0 = wtCOIN, 7,679.6 USDC in the pool;
 *   WETH/USDC  0x4a7a…366c same factory ts 50 fee 477, 3,217,381 USDC in the pool.
 *   (The other wtCOIN/USDC pool, 0x4618…d205, sits on factory 0xade6…716a: no router of this app reaches it.) */
export const POOL_WTCOIN_USDC = Object.freeze({ pool: '0x089262b9d991d7bc4a55b7cff0b7f26bde407985', tickSpacing: 200, a: WTCOIN, b: USDC });
export const POOL_WETH_USDC = Object.freeze({ pool: '0x4a7af46bc8abc00048c6c7920a1488daf568366c', tickSpacing: 50, a: WETH, b: USDC });
export const DEADLINE_S = 600;
export const ETATS = Object.freeze(['PRET', 'REFUSE', 'NON_MESURE']);

/** the pinned key is the pinned pool: poolId recomputed from the key, and the hook cannot block a swap. Pure. */
export function verifierCleTblock(cle = TBLOCK_KEY, poolIdAttendu = TBLOCK_POOL.poolId) {
  if (poolIdOfKey(cle) !== bas(poolIdAttendu)) return { ok: false, pourquoi: 'the TBLOCK key does not hash to the pinned poolId' };
  if (bas(cle.currency1) !== bas(TBLOCK) || bas(cle.currency0) !== bas(WTCOIN)) return { ok: false, pourquoi: 'the TBLOCK key does not pair wtCOIN with TBLOCK' };
  const flags = BigInt(cle.hooks) & 0x3fffn;
  if (flags & HOOK_FLAG_BEFORE_SWAP) return { ok: false, pourquoi: 'the TBLOCK pool hook has beforeSwap: it could refuse a swap' };
  return { ok: true, flags, prendSurSortie: !!(flags & HOOK_FLAG_AFTER_SWAP) && !!(flags & HOOK_FLAG_AFTER_SWAP_RETURNS_DELTA) };
}

/** which leg of this module serves (de, vers), or null — ETH is the native-ETH address 0x0 */
export function routeTblockDe(de, vers) {
  const d = bas(de), v = bas(vers), t = bas(TBLOCK);
  if (v === t && d === USDC) return 'USDC>TBLOCK';
  if (v === t && d === ETH) return 'ETH>TBLOCK';
  if (d === t && v === USDC) return 'TBLOCK>USDC';
  return null;
}

/** the hops of a leg sequence, in the {de, vers, famille} form the rails API returns */
export function cheminRouteTblock(sens) {
  const v4 = (de, vers) => ({ de, vers, famille: 'uniswap-v4' }), ae = (de, vers) => ({ de, vers, famille: 'aerodrome' });
  if (sens === 'USDC>TBLOCK') return [ae(USDC, WTCOIN), v4(WTCOIN, bas(TBLOCK))];
  if (sens === 'ETH>TBLOCK') return [ae(ETH, USDC), ae(USDC, WTCOIN), v4(WTCOIN, bas(TBLOCK))];
  if (sens === 'TBLOCK>USDC') return [v4(bas(TBLOCK), WTCOIN), ae(WTCOIN, USDC)];
  return [];
}

/** the v4 Universal Router call that swaps exactly `montant` of `entree` for at least `min` on the TBLOCK key. Pure. */
export function calldataSwapTblock({ entree, montant, min, deadline, cle = TBLOCK_KEY }) {
  const e = bas(entree);
  if (e !== bas(cle.currency0) && e !== bas(cle.currency1)) throw new Error('the input is not a currency of the TBLOCK key');
  const zeroForOne = e === bas(cle.currency0);
  const sortie = zeroForOne ? cle.currency1 : cle.currency0;
  const m = BigInt(montant), mn = BigInt(min);
  if (m <= 0n || mn <= 0n) throw new Error('amount and minimum must be above zero');
  const actions = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(e, m) },
    { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, mn) }];
  /* the Base Universal Router reads the 8-field ExactInputSingleParams (no minHopPriceX36): SANS_MINHOP, as echange.js's deferred legs */
  const data = encodeV4Swap({ cle, zeroForOne, montant: m, sortieMin: mn, deadline: BigInt(deadline), forme: SANS_MINHOP, actions });
  return { to: UNIVERSAL_ROUTER, data, value: '0x0', zeroForOne, sortie: bas(sortie) };
}

/** ERC-20 transfer calldata (the entry fee) */
export function calldataTransfer({ token, to, montant }) {
  return { to: bas(token), data: selecteur('transfer(address,uint256)') + wordA(to) + word(montant), value: '0x0' };
}

const minus = (x, bps) => (BigInt(x) * (10000n - BigInt(bps))) / 10000n;

/* ── reads ─────────────────────────────────────────────────────────────────────────────────────────── */
async function pinnedPoolOk(rpc, p) {
  const g = await rpc('eth_call', [{ to: FACTORY_AERO_NOUVELLE, data: selecteur('getPool(address,address,int24)') + wordA(p.a) + wordA(p.b) + wordI(p.tickSpacing) }, 'latest']);
  return '0x' + String(g).slice(-40).toLowerCase() === bas(p.pool);
}
/** quote one hop on the newer Aerodrome factory, and check the quote really comes from the pinned pool (its mid price) */
async function quoteAero(rpc, code, p, tin, tout, montant) {
  const q = firstWord(await rpc('eth_call', [{ to: QUOTEUR_AERODROME_CL, data: dataDevisCL({ tokenIn: tin, tokenOut: tout, montant, tickSpacing: p.tickSpacing }) }, 'latest', overrideQuoteur(code)]));
  if (!(q > 0n)) return { etat: 'REFUSE', pourquoi: 'the Aerodrome pool ' + p.pool.slice(0, 10) + '… quotes nothing for this amount' };
  const sq = firstWord(await rpc('eth_call', [{ to: p.pool, data: selecteur('slot0()') }, 'latest']));
  const mid = sortieMoyenne({ montant, sqrtP: sq, entreeEst0: BigInt(tin) < BigInt(tout) });
  const impactBps = mid > 0n ? Number(((mid - q) * 10000n) / mid) : null;
  if (impactBps === null) return { etat: 'NON_MESURE', pourquoi: 'pool price not read' };
  /* above the pool's own price: the node ignored the quoter override and quoted another factory's pool — not offered */
  if (impactBps < -10) return { etat: 'REFUSE', pourquoi: 'the quote is above the pinned pool’s own price: it does not come from that pool' };
  if (impactBps > 5000) return { etat: 'REFUSE', pourquoi: 'this amount would get more than 50 % below the pool price: try a smaller amount' };
  return { etat: 'OK', q, impactBps: Math.max(0, impactBps) };
}
async function quoteV4(rpc, entree, montant) {
  const zeroForOne = bas(entree) === TBLOCK_KEY.currency0;
  const q = firstWord(await rpc('eth_call', [{ to: QUOTER_V4, data: encodeQuote({ cle: TBLOCK_KEY, zeroForOne, montant: BigInt(montant) }) }, 'latest']));
  return q;
}
/** simulate the exact call sequence from the account; PRET only when every call returns status 0x1 */
async function simuler(rpc, compte, appels) {
  let sim;
  try {
    sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: appels.map((a) => ({ from: bas(compte), to: a.to, data: a.data, value: a.value || '0x0' })) }],
      validation: false, traceTransfers: false }, 'latest']);
  } catch (e) {
    /* a node refuses the whole simulation when the account cannot pay the ETH it sends: that is the wallet's balance, not our blindness */
    if (/insufficient funds/i.test(short(e))) return { etat: 'REFUSE', sansFonds: true, pourquoi: 'not enough ETH in this wallet for that amount' };
    return { etat: 'NON_MESURE', pourquoi: 'the exact batch could not be simulated just now: ' + short(e) };
  }
  const res = Array.isArray(sim) && sim[0] && Array.isArray(sim[0].calls) ? sim[0].calls : null;
  if (!res || res.length !== appels.length) return { etat: 'NON_MESURE', pourquoi: 'the node did not answer the simulation for every call' };
  const k = res.findIndex((x) => !x || x.status !== '0x1');
  if (k >= 0) {
    const msg = String((res[k] && res[k].error && res[k].error.message) || 'reverted');
    const sansFonds = /OutOfFunds|insufficient|exceeds balance|TRANSFER_FROM_FAILED|\bSTF\b/i.test(msg);
    return { etat: 'REFUSE', sansFonds, appelRefuse: k, pourquoi: sansFonds ? 'not enough of the token paid in this wallet for that amount'
      : 'the chain refuses call ' + (k + 1) + ' (' + (appels[k].role || '?') + '): ' + msg.slice(0, 140) };
  }
  return { etat: 'OK', gas: res.map((x) => BigInt(x.gasUsed || '0x0')) };
}

/**
 * THE PLAN. `de`/`vers`: USDC -> TBLOCK, ETH (0x0) -> TBLOCK, TBLOCK -> USDC. `montant` raw units of what is paid.
 * Returns the planner shape read by rails-api.js normaliser: { etat, appels, exigeAtomique, resume, pourquoi }.
 */
export async function planRouteTblock({ rpc, compte, de, vers, montant, fraisBps = FRAIS_INTERFACE_BPS_CL, beneficiaireFrais = FEE_WALLET,
  toleranceBps = 100n, maintenant = Date.now() } = {}) {
  const sens = routeTblockDe(de, vers);
  if (!sens) return { etat: 'REFUSE', pourquoi: 'this route only buys TBLOCK with USDC or ETH, or sells it for USDC' };
  if (typeof rpc !== 'function') return { etat: 'NON_MESURE', pourquoi: 'no chain reader' };
  if (!ADR.test(bas(compte))) return { etat: 'REFUSE', pourquoi: 'compte (the wallet that will sign) is required' };
  let m; try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'the amount must be a positive integer in raw units' };
  const b = (() => { try { return BigInt(fraisBps); } catch (_) { return -1n; } })();
  if (b < 0n || b > FRAIS_BPS_MAX_PRUDENT) return { etat: 'REFUSE', pourquoi: 'the interface fee must be between 0 and ' + FRAIS_BPS_MAX_PRUDENT + ' bps' };
  if (b > 0n && !ADR.test(bas(beneficiaireFrais))) return { etat: 'REFUSE', pourquoi: 'a whole fee-recipient address is required, with no default' };
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol >= 10000n) return { etat: 'REFUSE', pourquoi: 'slippage out of range' };
  const cleOk = verifierCleTblock();
  if (!cleOk.ok) return { etat: 'REFUSE', pourquoi: cleOk.pourquoi };
  /* ⛔ 2026-11-10 (holder buy reverted on a shared fork): the routers judge the deadline against the CHAIN's clock, not ours. Measured on
   *   base-anvil: the same 0-bps plan executes, and after evm_increaseTime(700) its Aerodrome call reverts with empty data, nothing debited;
   *   a chain clock already 609 s ahead makes the simulation REFUSE. The reference instant is the LATER of the server clock and the latest
   *   block's timestamp (equal within seconds on Base mainnet); a block not read leaves the server clock. */
  let t = Math.floor(Number(maintenant) / 1000);
  try {
    const blk = await rpc('eth_getBlockByNumber', ['latest', false]);
    const ts = blk && blk.timestamp ? Number(BigInt(blk.timestamp)) : 0;
    if (Number.isSafeInteger(ts) && ts > t) t = ts;
  } catch (_) { /* not read: the server clock stays the reference */ }
  const deadline = t + DEADLINE_S;
  /* the balance of what is paid, read first: a short wallet gets a plain sentence, not a revert code. Unread: the simulation judges. */
  try {
    const paid = sens === 'ETH>TBLOCK' ? ETH : (sens === 'USDC>TBLOCK' ? USDC : bas(TBLOCK));
    const bal = paid === ETH ? BigInt(await rpc('eth_getBalance', [bas(compte), 'latest']))
      : firstWord(await rpc('eth_call', [{ to: paid, data: selecteur('balanceOf(address)') + wordA(compte) }, 'latest']));
    if (bal < m) return { etat: 'REFUSE', sansFonds: true, pourquoi: 'this wallet holds less than the amount to pay' };
  } catch (_) { /* not read: the simulation below judges */ }

  /* the pinned Aerodrome pools must still be what the factory returns; the quoter must still have the patchable shape */
  let code;
  try {
    const pools = sens === 'ETH>TBLOCK' ? [POOL_WETH_USDC, POOL_WTCOIN_USDC] : [POOL_WTCOIN_USDC];
    for (const p of pools) if (!(await pinnedPoolOk(rpc, p))) return { etat: 'REFUSE', pourquoi: 'the factory no longer returns the pinned pool ' + p.pool + ': nothing is built on another pool' };
    code = await lireCodeQuoteurNouvelle(rpc);
  } catch (e) { return { etat: 'NON_MESURE', pourquoi: 'the pinned pools could not be read just now: ' + short(e) }; }
  if (!code) return { etat: 'NON_MESURE', pourquoi: 'the Aerodrome quoter no longer has the measured shape: no quote on the newer factory' };

  const hookTblock = { hook: TBLOCK_KEY.hooks, note: 'the TBLOCK pool hook keeps about 1 % of the swap output (part of it to 0x…dEaD); it is inside the quote and the minimum, not an app fee' };
  const commun = { fraisBps: b, beneficiaireFrais: b > 0n ? bas(beneficiaireFrais) : null, pivot: WTCOIN, toleranceBps: tol,
    poolTblock: TBLOCK_POOL.poolId, hookTblock, routeur: { aerodrome: ROUTEUR_AERO_NOUVEAU, uniswap: UNIVERSAL_ROUTER }, simule: true };

  try {
    if (sens === 'USDC>TBLOCK' || sens === 'ETH>TBLOCK') {
      const frais = (m * b) / 10000n, mSwap = m - frais;
      if (b > 0n && frais <= 0n) return { etat: 'REFUSE', pourquoi: 'Amount too small to trade here.' };
      /* leg 1 — Aerodrome: (ETH ->) USDC -> wtCOIN, quoted hop by hop on the pinned pools */
      let q1, impact1 = 0;
      if (sens === 'ETH>TBLOCK') {
        const a = await quoteAero(rpc, code, POOL_WETH_USDC, WETH, USDC, mSwap);
        if (a.etat !== 'OK') return a;
        const c = await quoteAero(rpc, code, POOL_WTCOIN_USDC, USDC, WTCOIN, a.q);
        if (c.etat !== 'OK') return c;
        q1 = c.q; impact1 = a.impactBps + c.impactBps;
      } else {
        const c = await quoteAero(rpc, code, POOL_WTCOIN_USDC, USDC, WTCOIN, mSwap);
        if (c.etat !== 'OK') return c;
        q1 = c.q; impact1 = c.impactBps;
      }
      const min1 = minus(q1, tol);
      /* leg 2 — Uniswap v4 on the pinned key, from leg 1's guaranteed minimum */
      const q2 = await quoteV4(rpc, WTCOIN, min1);
      if (!(q2 > 0n)) return { etat: 'REFUSE', pourquoi: 'the TBLOCK pool quotes nothing for this amount' };
      const min2 = minus(q2, tol);
      if (min1 <= 0n || min2 <= 0n) return { etat: 'REFUSE', pourquoi: 'the amount is too small for a meaningful minimum' };
      const appels = [];
      if (sens === 'USDC>TBLOCK') {
        const ap = calldataApprove({ token: USDC, montant: mSwap, beneficiaire: ROUTEUR_AERO_NOUVEAU });
        if (ap.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: ap.pourquoi };
        appels.push({ to: ap.to, data: ap.data, value: '0x0', role: 'approve exactly the USDC swapped for the Aerodrome router' });
        const sw = calldataExactInputSingleCL({ tokenIn: USDC, tokenOut: WTCOIN, tickSpacing: POOL_WTCOIN_USDC.tickSpacing, recipient: compte,
          deadline, amountIn: mSwap, amountOutMinimum: min1, maintenant: t });
        if (sw.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'Aerodrome swap refused: ' + sw.pourquoi };
        appels.push({ to: ROUTEUR_AERO_NOUVEAU, data: sw.data, value: '0x0', role: 'swap USDC to wtCOIN on Aerodrome' });
      } else {
        const sw = calldataExactInputCL({ sauts: [{ de: WETH, vers: USDC, tickSpacing: POOL_WETH_USDC.tickSpacing }, { de: USDC, vers: WTCOIN, tickSpacing: POOL_WTCOIN_USDC.tickSpacing }],
          recipient: compte, amountIn: mSwap, amountOutMinimum: min1, deadline, maintenant: t });
        if (sw.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'Aerodrome swap refused: ' + sw.pourquoi };
        /* same ABI as the older router (exactInput selector), sent to the newer one with the ETH as value: the router wraps it */
        appels.push({ to: ROUTEUR_AERO_NOUVEAU, data: sw.data, value: '0x' + mSwap.toString(16), role: 'swap ETH to USDC to wtCOIN on Aerodrome' });
      }
      const p2 = etapesPermit2Exactes({ jeton: WTCOIN, permit2: PERMIT2, routeur: UNIVERSAL_ROUTER, montant: min1, maintenantSec: t, libelleJeton: 'wtCOIN' });
      if (p2.etat !== 'OK') return { etat: 'REFUSE', pourquoi: p2.pourquoi };
      for (const s of p2.etapes) appels.push({ to: s.to, data: s.data, value: '0x0', role: s.nom });
      const v4 = calldataSwapTblock({ entree: WTCOIN, montant: min1, min: min2, deadline });
      appels.push({ to: v4.to, data: v4.data, value: '0x0', role: 'swap wtCOIN to TBLOCK on Uniswap v4 (the pinned TBLOCK pool)' });
      /* the app fee LAST: if anything before it would revert, no fee is paid */
      if (frais > 0n) {
        appels.push(sens === 'USDC>TBLOCK'
          ? { ...calldataTransfer({ token: USDC, to: beneficiaireFrais, montant: frais }), role: 'interface fee in USDC to the fee wallet' }
          : { to: bas(beneficiaireFrais), data: '0x', value: '0x' + frais.toString(16), role: 'interface fee in ETH to the fee wallet' });
      }
      const s = await simuler(rpc, compte, appels);
      if (s.etat !== 'OK') return { ...s, resume: null };
      return { etat: 'PRET', exigeAtomique: true, appels, pourquoi: null,
        resume: { ...commun, paye: m, payeDevise: sens === 'ETH>TBLOCK' ? ETH : USDC, montantEchange: mSwap, fraisMontant: frais,
          fraisDevise: sens === 'ETH>TBLOCK' ? ETH : USDC, fraisEntree: true,
          recoitAuMoins: min2, recoitDevise: bas(TBLOCK), devis: q2,
          devisPivot: q1, pivotAuMoins: min1, restePivot: q1 - min1, impactBpsAerodrome: impact1,
          resteAuCompte: 'up to ' + (Number(tol) / 100) + '% of the wtCOIN bought may stay in your wallet as wtCOIN (the TBLOCK leg spends the first leg’s guaranteed minimum)',
          chemin: sens === 'ETH>TBLOCK' ? ['ETH', 'USDC', 'wtCOIN', 'TBLOCK'] : ['USDC', 'wtCOIN', 'TBLOCK'],
          gasSimule: s.gas.reduce((x, y) => x + y, 0n) } };
    }

    /* TBLOCK -> USDC: v4 first (TBLOCK -> wtCOIN), then Aerodrome (wtCOIN -> USDC) with the fee in USDC on the way out */
    const q1 = await quoteV4(rpc, TBLOCK, m);
    if (!(q1 > 0n)) return { etat: 'REFUSE', pourquoi: 'the TBLOCK pool quotes nothing for this amount' };
    const min1 = minus(q1, tol);
    const c = await quoteAero(rpc, code, POOL_WTCOIN_USDC, WTCOIN, USDC, min1);
    if (c.etat !== 'OK') return c;
    const minPools = minus(c.q, tol);
    if (min1 <= 0n || minPools <= 0n) return { etat: 'REFUSE', pourquoi: 'the amount is too small for a meaningful minimum' };
    const appels = [];
    const p2 = etapesPermit2Exactes({ jeton: TBLOCK, permit2: PERMIT2, routeur: UNIVERSAL_ROUTER, montant: m, maintenantSec: t, libelleJeton: 'TBLOCK' });
    if (p2.etat !== 'OK') return { etat: 'REFUSE', pourquoi: p2.pourquoi };
    for (const s of p2.etapes) appels.push({ to: s.to, data: s.data, value: '0x0', role: s.nom });
    const v4 = calldataSwapTblock({ entree: TBLOCK, montant: m, min: min1, deadline });
    appels.push({ to: v4.to, data: v4.data, value: '0x0', role: 'swap TBLOCK to wtCOIN on Uniswap v4 (the pinned TBLOCK pool)' });
    const ap = calldataApprove({ token: WTCOIN, montant: min1, beneficiaire: ROUTEUR_AERO_NOUVEAU });
    if (ap.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: ap.pourquoi };
    appels.push({ to: ap.to, data: ap.data, value: '0x0', role: 'approve exactly the wtCOIN swapped for the Aerodrome router' });
    let recoitAuMoins;
    if (b > 0n) {
      const sw = calldataEchangeNouvelle({ tokenIn: WTCOIN, tokenOut: USDC, tickSpacing: POOL_WTCOIN_USDC.tickSpacing, recipient: compte,
        amountIn: min1, amountOutMinimum: minPools, deadline, maintenant: t, fraisBps: b, beneficiaireFrais });
      if (sw.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'Aerodrome swap refused: ' + sw.pourquoi };
      appels.push({ to: sw.to, data: sw.data, value: '0x0', role: 'swap wtCOIN to USDC on Aerodrome, interface fee in USDC on the way out' });
      recoitAuMoins = BigInt(sw.minUtilisateur);
    } else {
      const sw = calldataExactInputSingleCL({ tokenIn: WTCOIN, tokenOut: USDC, tickSpacing: POOL_WTCOIN_USDC.tickSpacing, recipient: compte,
        deadline, amountIn: min1, amountOutMinimum: minPools, maintenant: t });
      if (sw.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'Aerodrome swap refused: ' + sw.pourquoi };
      appels.push({ to: ROUTEUR_AERO_NOUVEAU, data: sw.data, value: '0x0', role: 'swap wtCOIN to USDC on Aerodrome' });
      recoitAuMoins = minPools;
    }
    const s = await simuler(rpc, compte, appels);
    if (s.etat !== 'OK') return { ...s, resume: null };
    return { etat: 'PRET', exigeAtomique: true, appels, pourquoi: null,
      resume: { ...commun, paye: m, payeDevise: bas(TBLOCK), recoitAuMoins, recoitDevise: USDC, devis: c.q, fraisEntree: false,
        fraisDevise: USDC, fraisSur: 'the USDC out of the Aerodrome leg (sweepTokenWithFee)',
        devisPivot: q1, pivotAuMoins: min1, restePivot: q1 - min1, impactBpsAerodrome: c.impactBps,
        resteAuCompte: 'up to ' + (Number(tol) / 100) + '% of the wtCOIN from the TBLOCK leg may stay in your wallet as wtCOIN (the USDC leg spends that leg’s guaranteed minimum)',
        chemin: ['TBLOCK', 'wtCOIN', 'USDC'], gasSimule: s.gas.reduce((x, y) => x + y, 0n) } };
  } catch (e) {
    return isRevert(e) ? { etat: 'REFUSE', pourquoi: 'a quote reverted: ' + short(e) } : { etat: 'NON_MESURE', pourquoi: 'a read failed just now: ' + short(e) };
  }
}

/**
 * game339 (Grok's live test 2026-11-10): RESUME an interrupted ETH > TBLOCK buy. Leg 1 (ETH -> wtCOIN) went through, then the wallet
 * stopped before leg 2: the wtCOIN sits in the buyer's wallet. This plans leg 2 alone on the pinned TBLOCK pool, from `montant` wtCOIN:
 * exact Permit2 steps + the v4 swap, no app fee, the whole batch simulated from the account. Same shape as planRouteTblock.
 */
export async function planWtcoinVersTblock({ rpc, compte, montant, toleranceBps = 100n, maintenant = Date.now() } = {}) {
  if (typeof rpc !== 'function') return { etat: 'NON_MESURE', pourquoi: 'no chain reader' };
  if (!ADR.test(bas(compte))) return { etat: 'REFUSE', pourquoi: 'compte (the wallet that will sign) is required' };
  let m; try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'no wtCOIN to resume from' };
  const tol = BigInt(toleranceBps);
  const cleOk = verifierCleTblock();
  if (!cleOk.ok) return { etat: 'REFUSE', pourquoi: cleOk.pourquoi };
  let t = Math.floor(Number(maintenant) / 1000);
  try { const blk = await rpc('eth_getBlockByNumber', ['latest', false]); const ts = blk && blk.timestamp ? Number(BigInt(blk.timestamp)) : 0; if (Number.isSafeInteger(ts) && ts > t) t = ts; } catch (_) { /* server clock */ }
  const deadline = t + DEADLINE_S;
  try {
    const bal = firstWord(await rpc('eth_call', [{ to: WTCOIN, data: selecteur('balanceOf(address)') + wordA(compte) }, 'latest']));
    if (bal < m) return { etat: 'REFUSE', sansFonds: true, pourquoi: 'this wallet holds less wtCOIN than the amount to resume' };
    const q = await quoteV4(rpc, WTCOIN, m);
    if (!(q > 0n)) return { etat: 'REFUSE', pourquoi: 'the TBLOCK pool quotes nothing for this amount' };
    const min = minus(q, tol);
    const appels = [];
    const p2 = etapesPermit2Exactes({ jeton: WTCOIN, permit2: PERMIT2, routeur: UNIVERSAL_ROUTER, montant: m, maintenantSec: t, libelleJeton: 'wtCOIN' });
    if (p2.etat !== 'OK') return { etat: 'REFUSE', pourquoi: p2.pourquoi };
    for (const s of p2.etapes) appels.push({ to: s.to, data: s.data, value: '0x0', role: s.nom });
    const v4 = calldataSwapTblock({ entree: WTCOIN, montant: m, min, deadline });
    appels.push({ to: v4.to, data: v4.data, value: '0x0', role: 'swap wtCOIN to TBLOCK on Uniswap v4 (the pinned TBLOCK pool)' });
    const s = await simuler(rpc, compte, appels);
    if (s.etat !== 'OK') return { ...s, resume: null };
    return { etat: 'PRET', exigeAtomique: true, appels, pourquoi: null,
      resume: { fraisBps: 0n, paye: m, payeDevise: WTCOIN, recoitAuMoins: min, recoitDevise: bas(TBLOCK), devis: q, reprise: true, chemin: ['wtCOIN', 'TBLOCK'],
        gasSimule: s.gas.reduce((x, y) => x + y, 0n) } };
  } catch (e) {
    return isRevert(e) ? { etat: 'REFUSE', pourquoi: 'a quote reverted: ' + short(e) } : { etat: 'NON_MESURE', pourquoi: 'a read failed just now: ' + short(e) };
  }
}

/**
 * 2026-11-12 (the economy pack is live): a FRESH quote of what `montant` raw USDC buys in TBLOCK on the route the payment router
 * (TblockPayRouter) swaps: USDC -> wtCOIN on the pinned Aerodrome pool (the router's AERO_POOL), then wtCOIN -> TBLOCK on the pinned v4 pool
 * (hook included). Nothing is built or simulated: the page turns it into the router's minimum (quote x 0.99) and checks it against the
 * router's own floor. Returns { etat: 'OK', devis, pivot } or { etat: 'REFUSE' | 'NON_MESURE', pourquoi }.
 */
export async function devisUsdcVersTblock({ rpc, montant } = {}) {
  if (typeof rpc !== 'function') return { etat: 'NON_MESURE', pourquoi: 'no chain reader' };
  let m; try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'the amount must be a positive integer in raw USDC units' };
  const cleOk = verifierCleTblock();
  if (!cleOk.ok) return { etat: 'REFUSE', pourquoi: cleOk.pourquoi };
  let code;
  try {
    if (!(await pinnedPoolOk(rpc, POOL_WTCOIN_USDC))) return { etat: 'REFUSE', pourquoi: 'the factory no longer returns the pinned pool ' + POOL_WTCOIN_USDC.pool + ': no quote on another pool' };
    code = await lireCodeQuoteurNouvelle(rpc);
  } catch (e) { return { etat: 'NON_MESURE', pourquoi: 'the pinned pool could not be read just now: ' + short(e) }; }
  if (!code) return { etat: 'NON_MESURE', pourquoi: 'the Aerodrome quoter no longer has the measured shape: no quote' };
  try {
    const c = await quoteAero(rpc, code, POOL_WTCOIN_USDC, USDC, WTCOIN, m);
    if (c.etat !== 'OK') return c;
    const q2 = await quoteV4(rpc, WTCOIN, c.q);
    if (!(q2 > 0n)) return { etat: 'REFUSE', pourquoi: 'the TBLOCK pool quotes nothing for this amount' };
    return { etat: 'OK', devis: q2, pivot: c.q, impactBpsAerodrome: c.impactBps };
  } catch (e) {
    return isRevert(e) ? { etat: 'REFUSE', pourquoi: 'a quote reverted: ' + short(e) } : { etat: 'NON_MESURE', pourquoi: 'a read failed just now: ' + short(e) };
  }
}

/**
 * game337 (Phil 2026-11-10): the TBLOCK part of a birth, BOUGHT WITH ETH and sent to the holders vault, in ONE atomic batch:
 * the ETH > TBLOCK buy above (with NO app fee: it is a gift to the vault) + TBLOCK.transfer(vault, the buy's guaranteed minimum).
 * Anything the pools give above that minimum stays with the buyer. The WHOLE batch is simulated from the account; PRET only if
 * every call passes. Returns the same shape as planRouteTblock, with resume.versCoffre = what the vault receives for sure.
 */
export async function planAchatPourCoffre({ rpc, compte, montantEth, coffre, garder = false, maintenant = Date.now() } = {}) {
  if (!ADR.test(bas(coffre))) return { etat: 'REFUSE', pourquoi: 'a whole vault address is required, with no default' };
  const p = await planRouteTblock({ rpc, compte, de: ETH, vers: bas(TBLOCK), montant: montantEth, fraisBps: 0n, maintenant });
  if (p.etat !== 'PRET') return p;
  /* game338 (Phil 2026-11-10): `garder` = STEP 1 of a birth, the TBLOCK is bought BEFORE the birth and stays in the buyer's wallet
   *   (no app fee: it is bought to pay the vault at step 3). The buy alone was already simulated whole by planRouteTblock. */
  if (garder) return { ...p, resume: { ...p.resume, fraisBps: 0n, garde: true } };
  const versCoffre = BigInt(p.resume.recoitAuMoins);
  if (versCoffre <= 0n) return { etat: 'REFUSE', pourquoi: 'the buy guarantees no TBLOCK for this amount' };
  const tr = calldataTransfer({ token: TBLOCK, to: coffre, montant: versCoffre });
  const appels = [...p.appels, { ...tr, role: 'send the TBLOCK bought (its guaranteed minimum) to the holders vault' }];
  const s = await simuler(rpc, compte, appels);
  if (s.etat !== 'OK') return { ...s, resume: null };
  return { etat: 'PRET', exigeAtomique: true, appels, pourquoi: null,
    resume: { ...p.resume, fraisBps: 0n, versCoffre, coffre: bas(coffre), gasSimule: s.gas.reduce((x, y) => x + y, 0n) } };
}

