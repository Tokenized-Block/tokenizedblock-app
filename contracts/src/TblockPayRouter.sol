// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice what a game must expose to be paid through TblockPayRouter. All three values are the game's own (immutable there).
interface ITblockGame {
    function PRICE_USDC() external view returns (uint256);
    function USDC_SPLIT() external view returns (address devWallet, uint16 devBps);
    function onPaid(address payer, uint256 usdcIn, uint256 tblockOut, bytes calldata data) external;
}

/// @title TblockPayRouter -- pay a game in exact USDC; the dev share stays USDC, the rest buys TBLOCK in the same call.
/// @notice pay(game, usdcIn, minTblockOut, deadline, data):
///   1. pulls exactly usdcIn (== game.PRICE_USDC()) from msg.sender ONLY (no "from" parameter);
///   2. sends devCut = usdcIn * devBps / 10_000 (rounded DOWN, devBps <= MAX_DEV_BPS) to the game's devWallet, in USDC;
///   3. swaps the rest USDC -> wtCOIN on ONE pinned Aerodrome Slipstream pool (direct pool swap + callback from that pool only).
///      No observe() call (the router never reverts because of a past price). PER-LEG BOUND (round-4 review): the wtCOIN received must be
///      >= its value at the Aerodrome SPOT sqrtPrice read in this call just before the swap x (1e6 - pool fee - 100 x
///      MAX_AERO_IMPACT_BPS) / 1e6, else AeroImpactTooHigh. The fee is the pool's own fee() read in the same call, refused above
///      MAX_AERO_FEE_PPM (AeroFeeTooHigh). The fee is DYNAMIC on Base: fee() runs the pool swap-fee module (base 2452 ppm, raised with
///      the 600 s TWAP deviation, cap 50,000 ppm = the module MAX_FEE_CAP). Fork block 56130900: 60 s after a 4415-tick down spike
///      fee() read 39,127 ppm (spike held 200 s) and 50,000 ppm, the cap (held 300 s; test_fork_downSpike_v3Blocked_v4Passes,
///      pay() passed at every wait). A 1 % fee cap would have blocked pay() there; the deployment cap is the module MAX_FEE_CAP,
///      so a fee spike never blocks pay() (the round-3 lesson). A spike-raised fee goes to the LPs; that spike cost the spiker
///      7.05 wtCOIN (fees + impact) for a fee worth at most 5 % of one payment.
///      The bound limits what a payer who controls the Aerodrome liquidity (JIT removal, or a spot
///      parked at the edge of a thin band) can make his own fill lose, which before was bounded only by the combined 75 % floor.
///      Measured on a Base fork at block 56130900 (test_fork_aeroImpact_measured): fee() 2452 ppm, own impact 17 ppm at 50 USDC
///      (15 ppm at 45): the deployment bound 100 bps (10,000 ppm) has ~588x margin at 50 USDC; a 45 USDC leg in the thinnest populated band above the spot
///      loses 5304 ppm with the fee and passes; parked at the band edge it loses 30862 ppm and reverts (the round-4 code accepted it);
///   4. swaps that wtCOIN -> TBLOCK on ONE pinned v4 key (PoolManager.unlock, callback from the PoolManager only), with the
///      BuybackV2 guards: own impact <= MAX_V4_IMPACT_TICKS and output >= floor(price at our call, combined fee+hook+impact budget);
///   0. BEFORE any transfer: minTblockOut must be >= minOutFloor(usdcIn - devCut) = what the swapped USDC buys at the Aerodrome
///      SPOT tick then at the v4 SPOT price, both read in this call before the swaps, times MIN_OUT_PPM / 1e6 (75 % at
///      deployment: minOutBudgetPpm 250,000). This floor ONLY refuses an absurd minOut (1 wei): it FOLLOWS a front-run (a pushed
///      spot lowers it with it), so it is NOT the payer's protection. THE REAL PROTECTION IS THE PAYER'S minTblockOut: the app
///      sends a fresh quote x 0.99. A favourable move between quote and inclusion raises the floor; quote x 0.99 stays above it
///      up to +29.8 % (298,159 ppm; test_fork_floorHeadroom, Base fork block 56109362).
///      Why no TWAP: the review (round 3) showed that a short DOWNWARD spike on the thin Aerodrome pool drags the 1800 s TWAP and
///      made every pay() revert for ~30 min (reproduced on the v3 code: test_fork_downSpike_v3Blocked_v4Passes). The
///      self-sandwich the TWAP and the floor were meant to stop does not pay at the current depth: re-measured on
///      a Base fork at block 56109362 (test_fork_selfSandwich_unprofitable), the payer front-running his own payment of
///      0.5 / 5 / 50 USDC with 0.5 / 5 / 50 / 500 USDC on Aerodrome, on v4, or both, paying minOut = the floor, then back-running:
///      36 of 36 combinations LOST money (best case -0.002172 USDC: v4 leg, 0.5 USDC front-run, 50 USDC payment; worst
///      -14.49 USDC). The fees of each leg (Aerodrome round trip -0.49 %, v4 round trip with its hook -2.4 % to -2.6 % of
///      the front-run at 0.5-5 USDC payments) exceed what the payment's own price impact gives back;
///   5. measures the TBLOCK received by balance delta, requires it >= minTblockOut (> 0 required), sends it to the game,
///   6. calls game.onPaid LAST, then checks that this router's USDC / wtCOIN / TBLOCK balances equal their values before the call.
/// @dev NO owner, no admin, no setter, no pause, no sweep, no proxy, no game registry, no receive/fallback.
///      A token sent here by mistake stays here forever (the end check is "equal to before", not "zero", so a 1-wei gift can
///      never brick payments).
/// @dev HONEST LIMITS: every in-call guard (Aerodrome leg bound, v4 impact, v4 floor, minOut floor) is relative to the pool state AT our call: a price
///      pushed BEFORE our call (front-run, on either pool) is bounded only by the payer's minTblockOut. "Loss bounded by
///      minTblockOut", never "MEV-proof". The self-sandwich numbers above hold for the depth and fees measured at that block
///      only (the loss shrinks as the payment grows: -0.46 % of a 50 USDC v4 front-run at a 50 USDC payment vs -2.35 % at
///      5 USDC); a thinner pool or lower fees could turn it: they are a measurement, not a bound.
/// @dev ONE ORIENTATION ONLY. Both pools sort their tokens by address. For the pinned Base tokens wtCOIN (0x5cda...) < USDC
///      (0x8335...) < TBLOCK (0xb200...), so wtCOIN is token0 of the Aerodrome pool and currency0 of the v4 key: the router always
///      swaps oneForZero on Aerodrome (USDC in) and zeroForOne on v4 (wtCOIN in). The constructor REJECTS any other orientation,
///      so the other-direction branches (never executable with these addresses) are not in the code at all.
contract TblockPayRouter {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }

    struct Config {
        address usdc;
        address wtcoin;
        address tblock;
        address aeroPool;         // wtCOIN / USDC Slipstream pool
        address poolManager;      // Uniswap v4 PoolManager
        PoolKey v4Key;            // wtCOIN / TBLOCK
        bytes32 v4PoolId;         // expected keccak256(abi.encode(v4Key)), checked
        uint256 maxUsdcPerPay;
        int24 maxV4ImpactTicks;
        uint24 maxHookPpm;
        uint24 minOutBudgetPpm;   // minOut floor = value at the Aerodrome spot / v4 spot * (1e6 - this) / 1e6
        uint16 maxAeroImpactBps;  // Aerodrome leg: own impact allowed on top of the pool fee
        uint24 maxAeroFeePpm;     // Aerodrome leg: highest pool fee() accepted
    }

    uint16 public constant MAX_DEV_BPS = 1000; // 10 %
    uint160 internal constant MIN_SQRT_PRICE_P1 = 4295128739 + 1;
    uint160 internal constant MAX_SQRT_PRICE_M1 = 1461446703485210103287273052203988822378723970342 - 1;
    uint256 internal constant V4_POOLS_SLOT = 6; // PoolManager.pools mapping slot (as TBlockBuybackV2, verified on Base)
    uint24 internal constant DYNAMIC_FEE_FLAG = 0x800000;
    uint160 internal constant BEFORE_SWAP_FLAG = 1 << 7;
    uint256 internal constant Q96 = 2 ** 96;
    uint256 internal constant MAX_PROTOCOL_FEE = 1000;
    uint24 public constant MAX_MIN_OUT_BUDGET_PPM = 250_000; // the floor never sits more than 25 % under the reference value
    uint256 public constant MAX_AERO_SLACK_PPM = 100_000; // fee cap + impact bound of the Aerodrome leg never above 10 %

    address public immutable USDC;
    address public immutable WTCOIN;
    address public immutable TBLOCK;
    address public immutable AERO_POOL;
    address public immutable POOL_MANAGER;
    bytes32 public immutable V4_POOL_ID;
    bytes32 internal immutable V4_STATE_SLOT;
    uint256 public immutable MAX_USDC_PER_PAY;
    int24 public immutable MAX_V4_IMPACT_TICKS;
    uint24 public immutable MAX_HOOK_PPM;
    uint256 public immutable V4_FLOOR_PPM;
    uint256 public immutable MIN_OUT_PPM;
    uint256 public immutable MAX_AERO_IMPACT_BPS;
    uint256 public immutable MAX_AERO_FEE_PPM;
    uint24 internal immutable V4_FEE;
    int24 internal immutable V4_TICK_SPACING;
    address internal immutable V4_HOOKS;

    uint256 private _lock = 1;
    uint256 private _aeroDue; // USDC owed to the Aerodrome pool by the swap in flight (0 outside it)

    event Paid(address indexed payer, address indexed game, uint256 usdcIn, uint256 devUsdc, address devWallet, uint256 tblockOut);

    error Reentrancy(); error BadParams(); error BadPool();
    error PriceMismatch(); error DevBpsTooHigh(); error ZeroMinOut(); error Expired(); error AmountTooLarge();
    error V4ImpactTooHigh(int24 tickBefore, int24 tickAfter);
    error BelowFloor(uint256 out, uint256 floor); error InsufficientOutput(uint256 out, uint256 minOut);
    error BadCallback(); error BalanceDrift(); error PartialFill(); error TransferFailed(); error BadGame();
    error MinOutTooLow(uint256 minOut, uint256 floor);
    error AeroImpactTooHigh(uint256 out, uint256 minOut); error AeroFeeTooHigh(uint256 fee);

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(Config memory c) {
        if (c.usdc == address(0) || c.wtcoin == address(0) || c.tblock == address(0) || c.aeroPool == address(0) || c.poolManager == address(0)) revert BadParams();
        if (c.maxUsdcPerPay == 0 || c.maxV4ImpactTicks <= 0) revert BadParams();
        if (c.minOutBudgetPpm == 0 || c.minOutBudgetPpm > MAX_MIN_OUT_BUDGET_PPM) revert BadParams();
        if (c.maxAeroImpactBps == 0 || uint256(c.maxAeroFeePpm) + 100 * uint256(c.maxAeroImpactBps) > MAX_AERO_SLACK_PPM) revert BadParams();
        PoolKey memory k = c.v4Key;
        if (k.fee & DYNAMIC_FEE_FLAG != 0) revert BadPool(); // the floor needs a static LP fee
        if (uint160(k.hooks) & BEFORE_SWAP_FLAG != 0) revert BadPool(); // a beforeSwap hook could change the swap under us
        uint256 slack = uint256(k.fee) + c.maxHookPpm + 100 * uint256(uint24(c.maxV4ImpactTicks));
        if (slack + MAX_PROTOCOL_FEE >= 1e6) revert BadParams();

        address t0 = _addr(c.aeroPool, abi.encodeWithSignature("token0()"));
        address t1 = _addr(c.aeroPool, abi.encodeWithSignature("token1()"));
        if (t0 != c.wtcoin || t1 != c.usdc) revert BadPool(); // the only orientation the pinned addresses allow (see @dev)
        // the canonical TBLOCK passed here must BE the v4 key's other currency (two tokens are called TBLOCK)
        if (k.currency0 != c.wtcoin || k.currency1 != c.tblock) revert BadPool();
        bytes32 id = keccak256(abi.encode(k));
        if (id != c.v4PoolId) revert BadPool();
        bytes32 slot = keccak256(abi.encode(id, V4_POOLS_SLOT));

        USDC = c.usdc; WTCOIN = c.wtcoin; TBLOCK = c.tblock; AERO_POOL = c.aeroPool; POOL_MANAGER = c.poolManager;
        V4_POOL_ID = id; V4_STATE_SLOT = slot;
        V4_FEE = k.fee; V4_TICK_SPACING = k.tickSpacing; V4_HOOKS = k.hooks;
        MAX_USDC_PER_PAY = c.maxUsdcPerPay;
        MAX_V4_IMPACT_TICKS = c.maxV4ImpactTicks; MAX_HOOK_PPM = c.maxHookPpm;
        V4_FLOOR_PPM = 1e6 - slack;
        MIN_OUT_PPM = 1e6 - c.minOutBudgetPpm;
        MAX_AERO_IMPACT_BPS = c.maxAeroImpactBps; MAX_AERO_FEE_PPM = c.maxAeroFeePpm;

        if (_extsload(c.poolManager, slot) == 0) revert BadPool(); // not initialized (or wrong PoolManager)
    }

    // ------------------------------------------------------------------ entry points

    function pay(address game, uint256 usdcIn, uint256 minTblockOut, uint256 deadline, bytes calldata data)
        external nonReentrant returns (uint256 tblockOut)
    {
        return _pay(game, usdcIn, minTblockOut, deadline, data);
    }

    /// @notice same as pay, with an EIP-2612 permit first. The permit is in try/catch: if someone already submitted it (front-run),
    ///         it reverts here and we go on with the allowance it created; transferFrom then checks the allowance anyway.
    function payWithPermit(address game, uint256 usdcIn, uint256 minTblockOut, uint256 deadline, bytes calldata data,
        uint256 permitDeadline, uint8 v, bytes32 r, bytes32 s) external nonReentrant returns (uint256 tblockOut)
    {
        try IERC20Permit(USDC).permit(msg.sender, address(this), usdcIn, permitDeadline, v, r, s) {} catch {}
        return _pay(game, usdcIn, minTblockOut, deadline, data);
    }

    function _pay(address game, uint256 usdcIn, uint256 minTblockOut, uint256 deadline, bytes calldata data)
        private returns (uint256 tblockOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (minTblockOut == 0) revert ZeroMinOut();
        if (usdcIn > MAX_USDC_PER_PAY) revert AmountTooLarge();
        if (game.code.length == 0) revert BadGame();
        if (usdcIn != ITblockGame(game).PRICE_USDC()) revert PriceMismatch();
        (address devWallet, uint16 devBps) = ITblockGame(game).USDC_SPLIT();
        if (devBps > MAX_DEV_BPS) revert DevBpsTooHigh();
        if (devBps != 0 && devWallet == address(0)) revert BadGame();
        uint256 devCut = usdcIn * devBps / 10_000;
        uint256 floor = _minOutFloor(usdcIn - devCut); // step 0: Aerodrome spot, then v4 spot, read BEFORE any swap
        if (minTblockOut < floor) revert MinOutTooLow(minTblockOut, floor);

        uint256[3] memory before = [_bal(USDC, address(this)), _bal(WTCOIN, address(this)), _bal(TBLOCK, address(this))];
        tblockOut = _buy(usdcIn, devCut, devWallet, before);
        if (tblockOut < minTblockOut) revert InsufficientOutput(tblockOut, minTblockOut);

        _call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, game, tblockOut));
        emit Paid(msg.sender, game, usdcIn, devCut, devWallet, tblockOut);
        ITblockGame(game).onPaid(msg.sender, usdcIn, tblockOut, data); // LAST external effect

        if (_bal(USDC, address(this)) != before[0] || _bal(WTCOIN, address(this)) != before[1] || _bal(TBLOCK, address(this)) != before[2]) {
            revert BalanceDrift();
        }
    }

    /// @dev pull usdcIn from msg.sender, pay the dev cut, buy TBLOCK with the rest; returns the TBLOCK received (balance delta).
    function _buy(uint256 usdcIn, uint256 devCut, address devWallet, uint256[3] memory before)
        private returns (uint256 tblockOut)
    {
        _call(USDC, abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), usdcIn)); // transferFrom(msg.sender)
        if (_bal(USDC, address(this)) != before[0] + usdcIn) revert BalanceDrift();

        if (devCut != 0) _call(USDC, abi.encodeWithSelector(0xa9059cbb, devWallet, devCut));

        uint256 wtMid = _swapAero(usdcIn - devCut);
        if (_bal(WTCOIN, address(this)) != before[1] + wtMid) revert BalanceDrift();
        _swapV4(wtMid);
        if (_bal(WTCOIN, address(this)) != before[1]) revert BalanceDrift();
        tblockOut = _bal(TBLOCK, address(this)) - before[2]; // reverts (underflow) if TBLOCK left instead of arriving
    }

    // ------------------------------------------------------------------ Aerodrome leg (USDC -> wtCOIN)

    /// @dev USDC (token1) in, wtCOIN (token0) out: oneForZero, which RAISES the tick (wtCOIN dearer for us)
    function _swapAero(uint256 spend) private returns (uint256 out) {
        uint256 minWt = _aeroLegMin(spend); // read BEFORE the swap
        _aeroDue = spend;
        (bool ok, bytes memory ret) = AERO_POOL.call(abi.encodeWithSignature(
            "swap(address,bool,int256,uint160,bytes)", address(this), false, int256(spend), MAX_SQRT_PRICE_M1, bytes("")
        ));
        if (!ok) _bubble(ret);
        if (_aeroDue != 0) revert PartialFill(); // callback did not run / did not pay in full
        (int256 aOut, int256 aIn) = abi.decode(ret, (int256, int256));
        if (aIn != int256(spend) || aOut >= 0) revert PartialFill();
        out = uint256(-aOut);
        if (out < minWt) revert AeroImpactTooHigh(out, minWt);
    }

    /// @notice the least wtCOIN pay() accepts from the Aerodrome leg for `usdcSpend` USDC, read now: value at the SPOT sqrtPrice
    ///         (slot0) x (1e6 - fee() - 100 x MAX_AERO_IMPACT_BPS) / 1e6. Reverts AeroFeeTooHigh if fee() > MAX_AERO_FEE_PPM.
    function aeroLegMin(uint256 usdcSpend) external view returns (uint256) {
        return _aeroLegMin(usdcSpend);
    }

    function _aeroLegMin(uint256 spend) private view returns (uint256) {
        (uint160 sP,) = _aeroSlot0();
        (bool ok, bytes memory ret) = AERO_POOL.staticcall(abi.encodeWithSignature("fee()"));
        if (!ok || ret.length < 32) revert BadPool();
        uint256 fee = abi.decode(ret, (uint256));
        if (fee > MAX_AERO_FEE_PPM) revert AeroFeeTooHigh(fee);
        uint256 atSpot = mulDiv(mulDiv(spend, Q96, sP), Q96, sP); // price = USDC (token1) per wtCOIN (token0) = sP^2
        return mulDiv(atSpot, 1e6 - fee - 100 * MAX_AERO_IMPACT_BPS, 1e6);
    }

    /// @dev paid exactly once, by the pinned pool, during our own swap, for exactly what we asked to spend.
    function uniswapV3SwapCallback(int256, int256 amount1Delta, bytes calldata) external {
        if (msg.sender != AERO_POOL || _lock != 2) revert BadCallback();
        int256 owed = amount1Delta;
        uint256 due = _aeroDue;
        if (owed <= 0 || uint256(owed) != due) revert PartialFill();
        _aeroDue = 0;
        _call(USDC, abi.encodeWithSelector(0xa9059cbb, AERO_POOL, due));
    }

    /// @notice the smallest minTblockOut pay() accepts when `usdcSpend` USDC (after the dev cut) is swapped, read now:
    ///         usdcSpend -> wtCOIN at the Aerodrome SPOT tick (slot0), -> TBLOCK at the v4 pool's SPOT price, times MIN_OUT_PPM / 1e6.
    ///         No past price is read anywhere: nothing in pay() can revert because of a price that is no longer the pool's.
    function minOutFloor(uint256 usdcSpend) external view returns (uint256) {
        return _minOutFloor(usdcSpend);
    }

    function _minOutFloor(uint256 usdcSpend) private view returns (uint256) {
        uint256 sA = sqrtPriceAtTick(_aeroTick()); // Aerodrome spot: price = USDC (token1) per wtCOIN (token0)
        uint256 wt = mulDiv(mulDiv(usdcSpend, Q96, sA), Q96, sA);
        (uint160 sV,,) = _v4Slot0(); // v4 spot: price = TBLOCK (currency1) per wtCOIN (currency0)
        uint256 tb = mulDiv(mulDiv(wt, sV, Q96), sV, Q96);
        return mulDiv(tb, MIN_OUT_PPM, 1e6);
    }

    /// @notice sqrt(1.0001^tick) * 2^96, rounded up (TickMathLib below).
    function sqrtPriceAtTick(int24 tick) public pure returns (uint160) { return TickMathLib.sqrtPriceAtTick(tick); }

    function _aeroTick() private view returns (int24 tick) {
        (, tick) = _aeroSlot0();
    }

    function _aeroSlot0() private view returns (uint160 sqrtP, int24 tick) {
        (bool ok, bytes memory ret) = AERO_POOL.staticcall(abi.encodeWithSignature("slot0()"));
        if (!ok || ret.length < 64) revert BadPool();
        (sqrtP, tick) = abi.decode(ret, (uint160, int24));
    }

    // ------------------------------------------------------------------ v4 leg (wtCOIN -> TBLOCK)

    function _swapV4(uint256 wtIn) private returns (uint256) {
        (bool ok, bytes memory ret) = POOL_MANAGER.call(abi.encodeWithSignature("unlock(bytes)", abi.encode(wtIn)));
        if (!ok) _bubble(ret);
        return abi.decode(abi.decode(ret, (bytes)), (uint256));
    }

    /// @dev exact-input wtCOIN -> TBLOCK; pay wtCOIN in, take TBLOCK to this router (measured by balance delta in _pay).
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER || _lock != 2) revert BadCallback();
        uint256 wtIn = abi.decode(data, (uint256));
        uint256 out = _v4SwapChecked(wtIn);
        _pm(abi.encodeWithSignature("sync(address)", WTCOIN));
        _call(WTCOIN, abi.encodeWithSelector(0xa9059cbb, POOL_MANAGER, wtIn));
        _pm(abi.encodeWithSignature("settle()"));
        _pm(abi.encodeWithSignature("take(address,address,uint256)", TBLOCK, address(this), out));
        return abi.encode(out);
    }

    function _v4SwapChecked(uint256 wtIn) private returns (uint256 out) {
        (uint160 sqrtBefore, int24 tickBefore, uint256 protocolFee) = _v4Slot0();
        uint256 floor = v4Floor(wtIn, sqrtBefore, protocolFee);
        SwapParams memory p = SwapParams(true, -int256(wtIn), MIN_SQRT_PRICE_P1); // zeroForOne: wtCOIN (currency0) in
        int256 d = abi.decode(_pm(abi.encodeWithSelector(0xf3cd914c, _v4Key(), p, bytes(""))), (int256));
        int128 dIn = int128(d >> 128);
        int128 dOut = int128(d);
        if (dIn != -int128(int256(wtIn)) || dOut <= 0) revert PartialFill();
        (, int24 tickAfter,) = _v4Slot0();
        int256 moved = int256(tickBefore) - int256(tickAfter); // zeroForOne lowers the tick
        if (moved > MAX_V4_IMPACT_TICKS) revert V4ImpactTooHigh(tickBefore, tickAfter);
        out = uint256(int256(dOut));
        if (out < floor) revert BelowFloor(out, floor);
    }

    /// @notice floor: wtIn * P(sqrtPriceX96) * (V4_FLOOR_PPM - protocolFee) / 1e6, P = TBLOCK per wtCOIN at that price.
    function v4Floor(uint256 wtIn, uint160 sqrtP, uint256 protocolFee) public view returns (uint256) {
        uint256 atMid = mulDiv(mulDiv(wtIn, sqrtP, Q96), sqrtP, Q96);
        if (protocolFee > MAX_PROTOCOL_FEE) revert BadPool();
        return mulDiv(atMid, V4_FLOOR_PPM - protocolFee, 1e6);
    }

    function _v4Key() private view returns (PoolKey memory) {
        return PoolKey(WTCOIN, TBLOCK, V4_FEE, V4_TICK_SPACING, V4_HOOKS);
    }

    /// @dev Pool.Slot0 packing: sqrtPriceX96 (160) | tick (24) | protocolFee (24: low 12 = zeroForOne, high 12 = oneForZero) | lpFee (24)
    function _v4Slot0() private view returns (uint160 sqrtP, int24 tick, uint256 protocolFee) {
        uint256 v = uint256(_extsload(POOL_MANAGER, V4_STATE_SLOT));
        sqrtP = uint160(v);
        tick = int24(uint24(v >> 160));
        protocolFee = (v >> 184) & 0xfff; // the zeroForOne half (low 12 bits): the only direction we swap
    }

    // ------------------------------------------------------------------ math (FullMath, as TBlockBuybackV2)

    function mulDiv(uint256 a, uint256 b, uint256 d) public pure returns (uint256 result) {
        unchecked {
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            if (prod1 == 0) {
                if (d == 0) revert BadParams();
                return prod0 / d;
            }
            if (d <= prod1) revert BadParams();
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, d)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            uint256 twos = d & (~d + 1);
            assembly {
                d := div(d, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            uint256 inv = (3 * d) ^ 2;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            result = prod0 * inv;
        }
    }

    // ------------------------------------------------------------------ low level

    function _extsload(address pm, bytes32 slot) private view returns (bytes32 v) {
        (bool ok, bytes memory ret) = pm.staticcall(abi.encodeWithSignature("extsload(bytes32)", slot));
        if (!ok || ret.length < 32) revert BadPool();
        v = abi.decode(ret, (bytes32));
    }

    function _pm(bytes memory data) private returns (bytes memory ret) {
        bool ok;
        (ok, ret) = POOL_MANAGER.call(data);
        if (!ok) _bubble(ret);
    }

    function _bubble(bytes memory ret) private pure { assembly { revert(add(ret, 32), mload(ret)) } }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) revert TransferFailed();
    }

    function _bal(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    function _addr(address target, bytes memory data) private view returns (address) {
        (bool ok, bytes memory ret) = target.staticcall(data);
        if (!ok || ret.length < 32) revert BadPool();
        return abi.decode(ret, (address));
    }
}

interface IERC20Permit {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external;
}

/// @notice Uniswap TickMath.getSqrtPriceAtTick (MIT), same constants; checked in test/TickMathRef.t.sol against an independent BigInt reference.
library TickMathLib {
    error TickOutOfRange();
    /// @notice sqrt(1.0001^tick) * 2^96, rounded up (Uniswap TickMath.getSqrtPriceAtTick, MIT, same constants).
    function sqrtPriceAtTick(int24 tick) internal pure returns (uint160) {
        unchecked {
            uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
            if (absTick > uint256(887272)) revert TickOutOfRange();
            uint256 r = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
            if (absTick & 0x2 != 0) r = (r * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0) r = (r * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0) r = (r * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (absTick & 0x10 != 0) r = (r * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (absTick & 0x20 != 0) r = (r * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (absTick & 0x40 != 0) r = (r * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (absTick & 0x80 != 0) r = (r * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (absTick & 0x100 != 0) r = (r * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (absTick & 0x200 != 0) r = (r * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (absTick & 0x400 != 0) r = (r * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (absTick & 0x800 != 0) r = (r * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (absTick & 0x1000 != 0) r = (r * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (absTick & 0x2000 != 0) r = (r * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (absTick & 0x4000 != 0) r = (r * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (absTick & 0x8000 != 0) r = (r * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (absTick & 0x10000 != 0) r = (r * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (absTick & 0x20000 != 0) r = (r * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (absTick & 0x40000 != 0) r = (r * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (absTick & 0x80000 != 0) r = (r * 0x48a170391f7dc42444e8fa2) >> 128;
            if (tick > 0) r = type(uint256).max / r;
            return uint160((r >> 32) + (r % (1 << 32) == 0 ? 0 : 1));
        }
    }

}
