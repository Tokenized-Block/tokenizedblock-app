// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TblockPayRouter} from "../src/TblockPayRouter.sol";
import {BlockSlotsRouter} from "../src/BlockSlotsRouter.sol";
import {MockERC20, MockAeroPool, MockPoolManager, MockVault} from "./payrouter/Mocks.sol";

/// @dev review 2026-11-12: the payrouter suite's vault plus the two views the live holders vault answers and the constructor now
///      requires: ROUTER() (the router its games name) and free()
contract HoldersVaultMockSL is MockVault {
    address public immutable ROUTER;

    constructor(address t, address r) MockVault(t) {
        ROUTER = r;
    }

    function free() external view returns (uint256) {
        return MockERC20(TBLOCK).balanceOf(address(this));
    }
}

/// @dev review F1 (2026-11-12, the reviewer's ImpactPM): a v4 PoolManager stand-in whose OWN impact grows with the size of the swap
///      (the payrouter mock moves the tick by a fixed amount whatever the size). Fixed price otherwise (25e6 TBLOCK per wtCOIN, 1.3 %
///      LP + hook take, as the payrouter mock). The price comes back between payments: only a payment's own impact matters here.
contract ImpactPMSL {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    address public wt;
    address public tb;
    uint160 public sqrtP = uint160(5000 * 2 ** 96);
    int24 public tick = 170391;
    uint256 public rate = 25_000_000;
    uint256 public takePpm = 13_000;
    uint256 public wtPerTick;
    bytes32 public poolSlot;
    address public locker;
    int256 internal owedWt;
    uint256 internal syncedBal;
    uint256 public pendingOut;

    constructor(address wt_, address tb_) {
        wt = wt_;
        tb = tb_;
    }

    function setSlot(bytes32 s) external {
        poolSlot = s;
    }

    function setWtPerTick(uint256 w) external {
        wtPerTick = w;
    }

    function extsload(bytes32 s) external view returns (bytes32) {
        return s == poolSlot ? bytes32(uint256(sqrtP) | (uint256(uint24(tick)) << 160) | (uint256(3000) << 208)) : bytes32(0);
    }

    function unlock(bytes calldata data) external returns (bytes memory r) {
        locker = msg.sender;
        r = TblockPayRouter(msg.sender).unlockCallback(data);
        require(owedWt == 0, "pm: not settled");
        locker = address(0);
        tick = 170391;
    }

    function swap(PoolKey calldata, SwapParams calldata p, bytes calldata) external returns (int256) {
        require(msg.sender == locker, "pm: locked");
        uint256 inAmt = uint256(-p.amountSpecified);
        uint256 out = inAmt * rate * (1e6 - takePpm) / 1e6;
        owedWt += int256(inAmt);
        if (wtPerTick != 0) tick -= int24(int256(inAmt / wtPerTick));
        pendingOut = out;
        int128 d0 = -int128(int256(inAmt));
        int128 d1 = int128(int256(out));
        return (int256(d0) << 128) | int256(uint256(uint128(d1)));
    }

    function sync(address c) external {
        require(c == wt);
        syncedBal = MockERC20(wt).balanceOf(address(this));
    }

    function settle() external payable returns (uint256 paid) {
        paid = MockERC20(wt).balanceOf(address(this)) - syncedBal;
        owedWt -= int256(paid);
    }

    function take(address c, address to, uint256 a) external {
        require(c == tb && a <= pendingOut, "pm: take");
        pendingOut -= a;
        MockERC20(tb).mint(to, a);
    }
}

/// @dev the Spin's dev share through the REAL TblockPayRouter source (its guards, floors and balance checks), on the payrouter suite's
///      mock pools (fixed rates). Spins pay USDC into the pot exactly as the live contract; only payDev touches the router.
contract BlockSlotsRouterRealRouterTest is Test {
    MockERC20 usdc;
    MockERC20 wt;
    MockERC20 tb;
    MockAeroPool aero;
    MockPoolManager pm;
    TblockPayRouter router;
    MockVault vault;
    BlockSlotsRouter slots;
    address constant DEV = address(0xD3F);
    address player = address(0xA11);
    address stranger = address(0xB22);
    uint256 constant WPU = 7_456_585_217; // the mock Aerodrome rate (payrouter/Mocks.sol), wtCOIN wei per USDC unit
    uint256 constant SPIN = 500_000; // the live SPIN_PRICE (read on chain: 500,000)
    uint64[16] TABLE = [uint64(0), 0, 0, 250_000, 750_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000];

    function setUp() public {
        vm.warp(1_794_397_085);
        vm.roll(1000);
        usdc = new MockERC20("USD Coin", 6);
        wt = new MockERC20("wtCOIN", 18);
        tb = new MockERC20("TBLOCK", 18);
        aero = new MockAeroPool(address(wt), address(usdc));
        pm = new MockPoolManager(address(wt), address(tb));
        TblockPayRouter.PoolKey memory k = TblockPayRouter.PoolKey(address(wt), address(tb), 3000, 60, address(uint160(0x2044)));
        TblockPayRouter.Config memory c = TblockPayRouter.Config({usdc: address(usdc), wtcoin: address(wt), tblock: address(tb),
            aeroPool: address(aero), poolManager: address(pm), v4Key: k, v4PoolId: keccak256(abi.encode(k)), maxUsdcPerPay: 50_000_000,
            maxV4ImpactTicks: 300, maxHookPpm: 12_000, minOutBudgetPpm: 250_000, maxAeroImpactBps: 100, maxAeroFeePpm: 50_000});
        pm.setSlot(keccak256(abi.encode(c.v4PoolId, uint256(6))));
        router = new TblockPayRouter(c);
        vault = new HoldersVaultMockSL(address(tb), address(router));
        slots = new BlockSlotsRouter(BlockSlotsRouter.Config(address(usdc), DEV, SPIN, 5000, TABLE), address(router), address(vault), address(tb), 250_000, 50_000_000);
        usdc.mint(player, 100_000_000);
        usdc.mint(stranger, 100_000_000);
    }

    function _spin() internal returns (uint256 id) {
        vm.startPrank(player);
        usdc.approve(address(slots), SPIN);
        id = slots.spin();
        vm.stopPrank();
    }

    /// @dev one spin: the pot gets TO_POT in USDC; payDev sends the 0.25 dev share through the router: 0.025 USDC to DEV_WALLET,
    ///      0.225 USDC bought as TBLOCK, all of it in the vault; nothing kept anywhere, no play recorded
    function test_real_spin_then_payDev() public {
        _spin();
        assertEq(slots.pot(), 250_000, "pot gets TO_POT in USDC");
        assertEq(slots.devOwed(), 250_000);
        assertEq(usdc.balanceOf(address(router)), 0, "a spin does not touch the router");
        uint256 floor = router.minOutFloor(225_000);
        assertGt(floor, 0);
        vm.prank(stranger);
        (uint256 lot, uint256 out) = slots.payDev(250_000, floor, block.timestamp);
        assertEq(lot, 250_000);
        assertEq(usdc.balanceOf(DEV), 25_000, "10 % to DEV_WALLET");
        assertEq(out, (225_000 * WPU) * 25_000_000 * (1e6 - 13_000) / 1e6, "TBLOCK bought with 0.225 USDC (mock rates)");
        assertEq(tb.balanceOf(address(vault)), out, "every TBLOCK in the vault");
        assertEq(tb.balanceOf(address(slots)), 0);
        assertEq(usdc.balanceOf(address(slots)), slots.pot(), "solde = pot: only the winners' pot is left");
        assertEq(slots.devOwed(), 0);
        assertEq(slots.PRICE_USDC(), 0);
        assertEq(usdc.balanceOf(address(router)) + wt.balanceOf(address(router)) + tb.balanceOf(address(router)), 0, "router keeps nothing");
        assertEq(usdc.balanceOf(stranger), 100_000_000, "the caller pays nothing and gets nothing");
        assertEq(tb.balanceOf(stranger), 0);
        assertEq(vault.count(), 0, "no play recorded");
    }

    /// @dev ten spins, one batch of 2.5 USDC
    function test_real_ten_spins_one_batch() public {
        for (uint256 i; i < 10; i++) _spin();
        (uint256 lot, uint256 out) = slots.payDev(2_500_000, router.minOutFloor(2_250_000), block.timestamp);
        assertEq(lot, 2_500_000);
        assertEq(usdc.balanceOf(DEV), 250_000);
        assertEq(tb.balanceOf(address(vault)), out);
        assertEq(usdc.balanceOf(address(slots)), 2_500_000, "the pot: 10 x 0.25");
        assertEq(slots.pot(), 2_500_000);
    }

    /// @dev the router's guards hold for the batch: a minOut under its floor, a past deadline, a pool fee above the cap -> payDev reverts
    ///      WHOLE (devOwed intact), and spins still go on
    function test_real_router_guards_revert_whole_batch() public {
        _spin();
        uint256 floor = router.minOutFloor(225_000);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.MinOutTooLow.selector, floor - 1, floor));
        slots.payDev(250_000, floor - 1, block.timestamp);
        vm.expectRevert(TblockPayRouter.ZeroMinOut.selector);
        slots.payDev(250_000, 0, block.timestamp);
        vm.expectRevert(TblockPayRouter.Expired.selector);
        slots.payDev(250_000, floor, block.timestamp - 1);
        aero.setFee(50_001);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroFeeTooHigh.selector, uint256(50_001)));
        slots.payDev(250_000, floor, block.timestamp);
        assertEq(slots.devOwed(), 250_000, "still owed");
        assertEq(usdc.balanceOf(DEV), 0);
        assertEq(usdc.balanceOf(address(slots)), 500_000);
        uint256 id = _spin(); // a failing TBLOCK buy never stops a spin
        assertEq(id, 2);
        assertEq(slots.devOwed(), 500_000);
        aero.setFee(2452);
        slots.payDev(500_000, router.minOutFloor(450_000), block.timestamp);
        assertEq(usdc.balanceOf(DEV), 50_000);
        assertEq(usdc.balanceOf(address(slots)), slots.pot());
    }

    /// @dev nobody can pay this game through the router directly: outside payDev its price is 0
    function test_real_direct_router_payment_refused() public {
        _spin();
        vm.startPrank(stranger);
        usdc.approve(address(router), 250_000);
        vm.expectRevert(TblockPayRouter.PriceMismatch.selector);
        router.pay(address(slots), 250_000, 1, block.timestamp, "");
        vm.stopPrank();
        assertEq(slots.devOwed(), 250_000);
    }

    /// @dev winners are paid in USDC from the pot, as today; the dev batch never takes from the pot
    function test_real_winner_paid_from_pot_dev_batch_separate() public {
        vm.startPrank(stranger);
        usdc.approve(address(slots), 20_000_000);
        slots.fund(20_000_000);
        vm.stopPrank();
        uint256 id = _spin();
        vm.roll(1005);
        for (uint256 r = 0; r < 3; r++) vm.setBlockhash(1002 + r, keccak256(abi.encodePacked("v2slots24", uint8(r))));
        uint256 p0 = usdc.balanceOf(player);
        (uint8 points, uint256 payout) = slots.settle(id);
        assertEq(points, 5, "v2slots24: 5 points for spin 1 (live suite)");
        assertEq(payout, 2_000_000);
        assertEq(usdc.balanceOf(player) - p0, 2_000_000, "winner paid in USDC");
        slots.payDev(250_000, router.minOutFloor(225_000), block.timestamp);
        assertEq(slots.pot(), 20_000_000 + 250_000 - 2_000_000);
        assertEq(usdc.balanceOf(address(slots)), slots.pot());
    }

    /// @dev review F1 (2026-11-12), the reviewer's test_C with the fix: a pool whose own v4 impact for a 45 USDC leg passes the
    ///      router's 300-tick cap (310 ticks) while a 9 USDC leg moves it 62 ticks. On the reviewed source the batch was pinned at
    ///      min(devOwed, 50 USDC): every payDev reverted and all of devOwed was stuck. Now the caller pays it down in 10 USDC batches.
    function test_real_F1_thin_pool_paid_down_in_smaller_batches() public {
        ImpactPMSL ipm = new ImpactPMSL(address(wt), address(tb));
        TblockPayRouter.PoolKey memory k = TblockPayRouter.PoolKey(address(wt), address(tb), 3000, 60, address(uint160(0x2044)));
        TblockPayRouter.Config memory c = TblockPayRouter.Config({usdc: address(usdc), wtcoin: address(wt), tblock: address(tb),
            aeroPool: address(aero), poolManager: address(ipm), v4Key: k, v4PoolId: keccak256(abi.encode(k)), maxUsdcPerPay: 50_000_000,
            maxV4ImpactTicks: 300, maxHookPpm: 12_000, minOutBudgetPpm: 250_000, maxAeroImpactBps: 100, maxAeroFeePpm: 50_000});
        ipm.setSlot(keccak256(abi.encode(c.v4PoolId, uint256(6))));
        TblockPayRouter r2 = new TblockPayRouter(c);
        ipm.setWtPerTick(uint256(45_000_000) * WPU / 310);
        HoldersVaultMockSL v2 = new HoldersVaultMockSL(address(tb), address(r2));
        BlockSlotsRouter g = new BlockSlotsRouter(BlockSlotsRouter.Config(address(usdc), DEV, SPIN, 5000, TABLE), address(r2), address(v2), address(tb), 1_000_000, 50_000_000);
        usdc.mint(player, 1_000_000_000);
        vm.startPrank(player);
        usdc.approve(address(g), type(uint256).max);
        for (uint256 i; i < 240; i++) g.spin(); // devOwed 60 USDC
        vm.stopPrank();
        assertEq(g.devOwed(), 60_000_000);
        uint256 f50 = r2.minOutFloor(45_000_000);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.V4ImpactTooHigh.selector, int24(170391), int24(170391 - 310)));
        g.payDev(50_000_000, f50, block.timestamp); // the batch the reviewed source was pinned at
        assertEq(g.devOwed(), 60_000_000);
        uint256 toVault;
        for (uint256 i; i < 6; i++) {
            uint256 f10 = r2.minOutFloor(9_000_000);
            vm.prank(stranger);
            (uint256 lot, uint256 out) = g.payDev(10_000_000, f10, block.timestamp);
            assertEq(lot, 10_000_000);
            toVault += out;
        }
        assertEq(g.devOwed(), 0, "paid down: no USDC stuck");
        assertEq(usdc.balanceOf(DEV), 6_000_000, "10 % of 60 USDC");
        assertEq(tb.balanceOf(address(v2)), toVault, "every TBLOCK in the vault");
        assertEq(usdc.balanceOf(address(g)), g.pot(), "solde = pot");
        assertEq(tb.balanceOf(address(g)), 0);
        assertEq(usdc.allowance(address(g), address(r2)), 0);
    }

    /// @dev review F1/F2: with a constructor cap under the router's (10 USDC here), a larger batch is refused before any router call
    function test_real_F2_constructor_cap_bounds_every_batch() public {
        BlockSlotsRouter g = new BlockSlotsRouter(BlockSlotsRouter.Config(address(usdc), DEV, SPIN, 5000, TABLE), address(router), address(vault), address(tb), 1_000_000, 10_000_000);
        usdc.mint(player, 1_000_000_000);
        vm.startPrank(player);
        usdc.approve(address(g), type(uint256).max);
        for (uint256 i; i < 80; i++) g.spin(); // devOwed 20 USDC
        vm.stopPrank();
        uint256 f = router.minOutFloor(18_000_000);
        vm.expectRevert(BlockSlotsRouter.BatchTooLarge.selector);
        g.payDev(20_000_000, f, block.timestamp);
        (uint256 lot,) = g.payDev(10_000_000, router.minOutFloor(9_000_000), block.timestamp);
        assertEq(lot, 10_000_000);
        assertEq(g.devOwed(), 10_000_000);
    }

    /// @dev review 2026-11-12 (Skins F1, same check): with the real router, the payrouter vault (TBLOCK() only) and a vault naming
    ///      another router are refused as DEST
    function test_real_constructor_dest_must_be_the_holders_vault() public {
        BlockSlotsRouter.Config memory c = BlockSlotsRouter.Config(address(usdc), DEV, SPIN, 5000, TABLE);
        address[2] memory bad = [address(new MockVault(address(tb))), address(new HoldersVaultMockSL(address(tb), address(0xBAD)))];
        for (uint256 i; i < bad.length; i++) {
            vm.expectRevert(BlockSlotsRouter.BadConfig.selector);
            new BlockSlotsRouter(c, address(router), bad[i], address(tb), 250_000, 50_000_000);
        }
        assertEq(slots.DEST(), address(vault));
    }
}
