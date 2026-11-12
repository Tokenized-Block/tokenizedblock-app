// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TblockPayRouter, TickMathLib} from "../../src/TblockPayRouter.sol";

/// ERC-20 with EIP-2612 permit, optional fee-on-transfer and optional reentry hook on transferFrom.
contract MockERC20 {
    string public name;
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;
    uint256 public feeBps; // fee-on-transfer, burned
    address public reenterTarget; bytes public reenterData; // called once from transferFrom
    bool public reenterOk; bytes public reenterRet;
    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 constant PERMIT_TYPEHASH = keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    constructor(string memory n, uint8 d) {
        name = n; decimals = d;
        DOMAIN_SEPARATOR = keccak256(abi.encode(keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"), keccak256(bytes(n)), block.chainid, address(this)));
    }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setFee(uint256 b) external { feeBps = b; }
    address public feeTo; function setFeeTo(address t) external { feeTo = t; }
    function setReenter(address t, bytes calldata d) external { reenterTarget = t; reenterData = d; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    bool public reenterOnTransfer; function setReenterOnTransfer(bool b) external { reenterOnTransfer = b; }
    function transfer(address to, uint256 a) external returns (bool) {
        _move(msg.sender, to, a);
        if (reenterOnTransfer && reenterTarget != address(0)) _reenter(); // after the move: the sender's balance is already gone
        return true;
    }
    function _reenter() internal {
        address t = reenterTarget; reenterTarget = address(0);
        (bool ok, bytes memory ret) = t.call(reenterData);
        reenterOk = ok; reenterRet = ret;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        require(al >= a, "allowance");
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        _move(f, to, a);
        if (!reenterOnTransfer && reenterTarget != address(0)) _reenter(); // recorded, not bubbled: the test reads WHY the reentry failed
        return true;
    }
    function _move(address f, address to, uint256 a) internal {
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a;
        uint256 fee = (feeTo == address(0) || feeTo == to) ? a * feeBps / 10_000 : 0;
        balanceOf[to] += a - fee;
    }
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external {
        require(block.timestamp <= deadline, "permit expired");
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR,
            keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))));
        address rec = ecrecover(digest, v, r, s);
        require(rec != address(0) && rec == owner, "bad sig");
        allowance[owner][spender] = value;
    }
}

/// Aerodrome Slipstream-like pool: token0 = wtCOIN, token1 = USDC (as on Base). Fixed rate, configurable ticks.
contract MockAeroPool {
    address public token0; address public token1;
    int24 public tick; int24 public twapTick; int24 public tickAfterSwap;
    uint256 public wtPerUsdc = 7_456_585_217; // floor(1.0001^227335): wtCOIN wei per USDC unit (6 dec) AT tick -227335 (scratch/tickref.mjs)
    bool public underpayOut; int256 public callbackTamper; bool public skipCallback; bool public observeReverts;
    constructor(address t0, address t1) { token0 = t0; token1 = t1; tick = -227335; twapTick = -227335; tickAfterSwap = -227335; }
    function setTicks(int24 spot, int24 twap, int24 after_) external { tick = spot; twapTick = twap; tickAfterSwap = after_; }
    function setTamper(int256 t) external { callbackTamper = t; }
    int256 public returnTamper; bool public shortOut;
    function setReturnTamper(int256 t) external { returnTamper = t; }
    function setShortOut(bool s) external { shortOut = s; }
    function setSkip(bool s) external { skipCallback = s; }
    function setObserveReverts(bool s) external { observeReverts = s; }
    int56 public cumOffset; // makes the window's tick sum a non-multiple of the window
    function setCumOffset(int56 o) external { cumOffset = o; }
    bool public slot0Reverts; function setSlot0Reverts(bool b) external { slot0Reverts = b; }
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, bool) {
        require(!slot0Reverts, "mock: slot0 unavailable");
        return (TickMathLib.sqrtPriceAtTick(tick), tick, 0, 900, 900, true); // round 5: the spot sqrtPrice is read (Aerodrome leg bound)
    }
    uint24 internal fee_ = 2452; bool public feeReverts; // fee() as read on Base (fork block 56130900)
    function setFee(uint24 f) external { fee_ = f; }
    function setFeeReverts(bool r) external { feeReverts = r; }
    function fee() external view returns (uint24) { require(!feeReverts, "mock: fee unavailable"); return fee_; }
    uint256 public outOverride; // != 0: the swap pays exactly this many wtCOIN (a fill below / above spot)
    function setOutOverride(uint256 o) external { outOverride = o; }
    uint256 public shortPpm; uint256 public lastOut; // shortPpm: the fill sits this far under the fixed rate
    function setShortPpm(uint256 p) external { shortPpm = p; }
    function observe(uint32[] calldata ago) external view returns (int56[] memory cum, uint160[] memory l) {
        require(!observeReverts, "OLD");
        cum = new int56[](ago.length); l = new uint160[](ago.length);
        int56 nowCum = int56(twapTick) * 1_000_000;
        for (uint256 i; i < ago.length; i++) cum[i] = nowCum - int56(twapTick) * int56(uint56(ago[i])) - (ago[i] != 0 ? cumOffset : int56(0));
    }
    /// USDC (token1) in, wtCOIN (token0) out
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data) external returns (int256 a0, int256 a1) {
        require(!zeroForOne && amountSpecified > 0, "mock: only USDC exact in");
        uint256 inAmt = uint256(amountSpecified);
        uint256 out = outOverride != 0 ? outOverride : inAmt * wtPerUsdc * (1e6 - shortPpm) / 1e6;
        lastOut = out;
        MockERC20(token0).mint(address(this), out);
        MockERC20(token0).transfer(recipient, shortOut ? out - 1 : out);
        a0 = -int256(out); a1 = int256(inAmt) + callbackTamper;
        uint256 b = MockERC20(token1).balanceOf(address(this));
        if (!skipCallback) TblockPayRouter(msg.sender).uniswapV3SwapCallback(a0, a1, data);
        if (!skipCallback) require(MockERC20(token1).balanceOf(address(this)) >= b + inAmt, "mock: not paid");
        a1 = int256(inAmt) + returnTamper;
        tick = tickAfterSwap;
    }
}

/// v4 PoolManager-like: one pool, wtCOIN (currency0) -> TBLOCK (currency1), price 25e6 TBLOCK per wtCOIN.
contract MockPoolManager {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }
    address public wt; address public tb;
    uint160 public sqrtP = uint160(5000 * 2 ** 96); // P = 25e6
    int24 public tick = 170391; int24 public tickAfterSwap = 170391 - 50;
    uint256 public protocolFee; // low 12 bits = zeroForOne
    uint256 public takePpm = 13_000; // LP + hook, as measured (~130 bps)
    bytes32 public poolSlot; bool public initialized = true;
    address public locker; int256 internal owedWt; uint256 internal syncedBal;
    constructor(address wt_, address tb_) { wt = wt_; tb = tb_; }
    function setSlot(bytes32 s) external { poolSlot = s; }
    function setTake(uint256 p) external { takePpm = p; }
    uint256 public rate = 25_000_000; // TBLOCK wei per wtCOIN wei paid out (before takePpm); keep = sqrtP^2 / 2^192
    function setPrice(uint160 s, uint256 r) external { sqrtP = s; rate = r; }
    function setTickAfter(int24 t) external { tickAfterSwap = t; }
    function setProtocolFee(uint256 f) external { protocolFee = f; }
    function setInit(bool b) external { initialized = b; }
    uint256 public partialBy; function setPartial(uint256 p) external { partialBy = p; }
    uint256 public refundWt; function setRefundWt(uint256 a) external { refundWt = a; }
    function _packed() internal view returns (bytes32) {
        return bytes32(uint256(sqrtP) | (uint256(uint24(tick)) << 160) | (protocolFee << 184) | (uint256(3000) << 208));
    }
    function extsload(bytes32 s) external view returns (bytes32) { return (s == poolSlot && initialized) ? _packed() : bytes32(0); }
    function unlock(bytes calldata data) external returns (bytes memory r) {
        locker = msg.sender;
        r = TblockPayRouter(msg.sender).unlockCallback(data);
        require(owedWt == 0, "mock: CurrencyNotSettled");
        if (refundWt != 0) MockERC20(wt).transfer(msg.sender, refundWt); // a PM that hands wtCOIN back: some left on the router
        locker = address(0);
    }
    function swap(PoolKey calldata, SwapParams calldata p, bytes calldata) external returns (int256) {
        require(msg.sender == locker, "mock: locked");
        uint256 inAmt = uint256(-p.amountSpecified);
        uint256 out = inAmt * rate * (1e6 - takePpm) / 1e6;
        owedWt += int256(inAmt);
        tick = tickAfterSwap;
        int128 d0 = -int128(int256(inAmt - partialBy)); int128 d1 = int128(int256(out));
        pendingOut = out;
        return (int256(d0) << 128) | int256(uint256(uint128(d1)));
    }
    uint256 public pendingOut;
    function sync(address c) external { require(c == wt); syncedBal = MockERC20(wt).balanceOf(address(this)); }
    function settle() external payable returns (uint256 paid) {
        paid = MockERC20(wt).balanceOf(address(this)) - syncedBal; owedWt -= int256(paid);
    }
    function take(address c, address to, uint256 a) external {
        require(c == tb && a <= pendingOut, "mock: take");
        pendingOut -= a;
        MockERC20(tb).mint(to, a);
    }
}

/// A configurable game. Honest by default; knobs turn it into each kind of malicious game.
contract MockGame {
    TblockPayRouter public router; address public tb; address public usdc;
    uint256 public price; address public dev; uint16 public bps;
    uint8 public mode; // 0 honest, 1 reenter pay, 2 send TBLOCK back to router, 3 gift USDC to router, 4 revert
    uint256 public received; uint256 public calls; bool public cbOk; bytes public cbRet;
    constructor(TblockPayRouter r, uint256 p, address d, uint16 b) { router = r; tb = r.TBLOCK(); usdc = r.USDC(); price = p; dev = d; bps = b; }
    function set(uint256 p, address d, uint16 b, uint8 m) external { price = p; dev = d; bps = b; mode = m; }
    function PRICE_USDC() external view returns (uint256) { return price; }
    function USDC_SPLIT() external view returns (address, uint16) { return (dev, bps); }
    function onPaid(address, uint256, uint256 out, bytes calldata) external {
        require(msg.sender == address(router), "not router");
        calls++; received += out;
        if (mode == 1) router.pay(address(this), price, 1, block.timestamp, "");
        if (mode == 2) MockERC20(tb).transfer(address(router), 1);
        if (mode == 3) MockERC20(usdc).transfer(address(router), 1);
        if (mode == 4) revert("game says no");
        if (mode == 5) { (cbOk, cbRet) = address(router).call(abi.encodeWithSignature("uniswapV3SwapCallback(int256,int256,bytes)", int256(0), int256(1), bytes(""))); }
        if (mode == 6) { (cbOk, cbRet) = address(router).call(abi.encodeWithSignature("unlockCallback(bytes)", abi.encode(uint256(1e18)))); }
    }
}

/// Holders-vault stand-in: holds, names its token as TBlockVaultV2 does, lists every game (isGame) unless told not to, and records
/// every recordPlay(player, tblock) with its caller (no listing check here: the real vault lives in wt-tblock and is tested together
/// with TamArtV2 in forge-pack). `mode` 1 = revert, 2 = burn all gas, 3 = huge revert payload.
contract MockVault {
    address public immutable TBLOCK;
    constructor(address t) { TBLOCK = t; }
    bool public unlisted; function setUnlisted(bool u) external { unlisted = u; }
    function isGame(address) external view returns (bool) { return !unlisted; }
    /// @dev 3 fresh slots per record (~66k gas): it must fit in the game's PLAY_GAS (100k) like the real vault, or the record would be
    ///      swallowed by its own out-of-gas. Three pushed arrays cost ~133k and did exactly that (pack run, 2026-11-11).
    uint256 public count; mapping(uint256 => uint256) private _pa; mapping(uint256 => address) private _caller;
    uint8 public mode; function setMode(uint8 m) external { mode = m; }
    function players(uint256 i) external view returns (address) { require(i < count, "no record"); return address(uint160(_pa[i] >> 96)); }
    function amounts(uint256 i) external view returns (uint256) { require(i < count, "no record"); return uint96(_pa[i]); }
    function callers(uint256 i) external view returns (address) { require(i < count, "no record"); return _caller[i]; }
    function recordPlay(address player, uint256 tblock) external {
        if (mode == 1) revert("vault broken");
        if (mode == 2) while (true) {}
        if (mode == 3) assembly { revert(0, 1000000) }
        require(tblock < 2 ** 96, "mock: amount too large");
        uint256 i = count++;
        _pa[i] = (uint256(uint160(player)) << 96) | tblock;
        _caller[i] = msg.sender;
    }
}

/// TBlockLockRewards stand-in for the play gate: records every recordPlay(player) with its caller (no listing check here; the
/// real gate lives in forge-lockrewards). `mode` 1 = revert, 2 = burn all gas, 3 = huge revert payload.
contract PlayRewardsRecorder {
    address[] public players;
    address[] public callers;
    uint8 public mode;
    function setMode(uint8 m) external { mode = m; }
    bool public unlisted; function setUnlisted(bool u) external { unlisted = u; }
    function isGame(address) external view returns (bool) { return !unlisted; }
    function count() external view returns (uint256) { return players.length; }
    function recordPlay(address player) external {
        if (mode == 1) revert("rewards broken");
        if (mode == 2) while (true) {}
        if (mode == 3) assembly { revert(0, 1000000) }
        players.push(player);
        callers.push(msg.sender);
    }
}
