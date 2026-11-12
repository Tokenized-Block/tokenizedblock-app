// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TblockPayRouter} from "../../src/TblockPayRouter.sol";
import {TamArtV2} from "../../src/TamArtV2.sol";
import {MockERC20, MockAeroPool, MockPoolManager, MockGame, MockVault, PlayRewardsRecorder} from "./Mocks.sol";

contract RouterBase is Test {
    MockERC20 usdc; MockERC20 wt; MockERC20 tb;
    MockAeroPool aero; MockPoolManager pm;
    TblockPayRouter router;
    MockGame game; TamArtV2 tam; MockVault vault; PlayRewardsRecorder rewards;
    address dev = address(0xD00D);
    address payer = address(0xBEEF);
    uint256 constant MAX = 50_000_000;
    uint256 constant WPU = 7_456_585_217; // mock Aerodrome rate, wtCOIN wei per USDC unit (= floor(1.0001^227335), its tick)
    uint256 F5; uint256 FMAX; // minOutFloor for 5 USDC and MAX at 10 % dev cut, read in setUp (mock state)
    address constant HOOKS = address(uint160(0x2044)); // afterSwap + afterSwapReturnDelta + beforeInitialize, no beforeSwap

    function _key(address h, uint24 fee) internal view returns (TblockPayRouter.PoolKey memory) {
        return TblockPayRouter.PoolKey(address(wt), address(tb), fee, 60, h);
    }

    function _cfg() internal view returns (TblockPayRouter.Config memory c) {
        TblockPayRouter.PoolKey memory k = _key(HOOKS, 3000);
        c = TblockPayRouter.Config({usdc: address(usdc), wtcoin: address(wt), tblock: address(tb), aeroPool: address(aero),
            poolManager: address(pm), v4Key: k, v4PoolId: keccak256(abi.encode(k)), maxUsdcPerPay: MAX,
            maxV4ImpactTicks: 300, maxHookPpm: 12_000, minOutBudgetPpm: 250_000,
            maxAeroImpactBps: 100, maxAeroFeePpm: 50_000});
    }

    function setUp() public virtual {
        vm.warp(1_794_397_085);
        usdc = new MockERC20("USD Coin", 6); wt = new MockERC20("wtCOIN", 18); tb = new MockERC20("TBLOCK", 18);
        aero = new MockAeroPool(address(wt), address(usdc));
        pm = new MockPoolManager(address(wt), address(tb));
        TblockPayRouter.Config memory c = _cfg();
        pm.setSlot(keccak256(abi.encode(c.v4PoolId, uint256(6))));
        router = new TblockPayRouter(c);
        game = new MockGame(router, 5_000_000, dev, 1000);
        vault = new MockVault(address(tb));
        rewards = new PlayRewardsRecorder();
        tam = new TamArtV2(address(router), dev, address(vault), address(tb), address(usdc), address(rewards));
        usdc.mint(payer, 1_000_000_000);
        vm.prank(payer); usdc.approve(address(router), type(uint256).max);
        F5 = router.minOutFloor(4_500_000);
        FMAX = router.minOutFloor(MAX - MAX / 10);
    }

    function _bals() internal view returns (uint256, uint256, uint256) {
        return (usdc.balanceOf(address(router)), wt.balanceOf(address(router)), tb.balanceOf(address(router)));
    }

    function _pay(address g, uint256 amt, uint256 minOut) internal returns (uint256) {
        vm.prank(payer);
        return router.pay(g, amt, minOut, block.timestamp, "");
    }

    function _work(uint8 salt) internal pure returns (bytes memory) {
        return abi.encode(abi.encodePacked("TAM", uint8(1), uint8(8), uint8(0), uint8(0), salt), bytes32(uint256(7)), bytes('{"p":1}'));
    }
}

contract TblockPayRouterUnit is RouterBase {
    // ---------------------------------------------------------------- happy paths
    function test_pay_happy_mockGame() public {
        uint256 devBefore = usdc.balanceOf(dev);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 out = _pay(address(game), 5_000_000, F5);
        assertEq(payerBefore - usdc.balanceOf(payer), 5_000_000, "exact P pulled");
        assertEq(usdc.balanceOf(dev) - devBefore, 500_000, "dev +0.5 USDC");
        assertEq(tb.balanceOf(address(game)), out, "game holds the TBLOCK");
        assertEq(game.received(), out);
        uint256 wtMid = 4_500_000 * WPU;
        assertEq(out, wtMid * 25_000_000 * (1e6 - 13_000) / 1e6, "out = mock math");
        (uint256 a, uint256 b, uint256 c) = _bals();
        assertEq(a + b + c, 0, "router keeps nothing");
    }

    function test_pay_happy_tamArtV2() public {
        vm.prank(payer);
        uint256 out = router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(1));
        assertEq(tam.ownerOf(1), payer, "minted to payer");
        assertEq(tb.balanceOf(address(vault)), out, "DEST got all");
        assertEq(tb.balanceOf(address(tam)), 0, "TAM keeps nothing");
        assertEq(usdc.balanceOf(dev), 500_000);
        assertEq(tam.totalSupply(), 1);
        (, bytes32 g, ) = abi.decode(_work(1), (bytes, bytes32, bytes));
        assertEq(tam.graine(1), g);
    }

    // ---------------------------------------------------------------- guard 1: P pulled exactly, only from msg.sender
    function test_pullsOnlyFromMsgSender() public {
        address attacker = address(0xBAD);
        uint256 before = usdc.balanceOf(payer);
        vm.prank(attacker);
        vm.expectRevert(TblockPayRouter.TransferFailed.selector); // pulls the ATTACKER's USDC, which he does not have (payer's approval unused)
        router.pay(address(game), 5_000_000, F5, block.timestamp, "");
        assertEq(usdc.balanceOf(payer), before);
    }

    function test_revert_priceMismatch_low() public {
        vm.expectRevert(TblockPayRouter.PriceMismatch.selector);
        _pay(address(game), 4_999_999, 1);
    }

    function test_revert_priceMismatch_high() public {
        vm.expectRevert(TblockPayRouter.PriceMismatch.selector);
        _pay(address(game), 5_000_001, 1);
    }

    // ---------------------------------------------------------------- guard 2: devBps cap
    function test_revert_devBpsTooHigh() public {
        game.set(5_000_000, dev, 1001, 0);
        vm.expectRevert(TblockPayRouter.DevBpsTooHigh.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_devBps_atCap_passes() public {
        game.set(5_000_000, dev, 1000, 0);
        _pay(address(game), 5_000_000, F5);
        assertEq(usdc.balanceOf(dev), 500_000);
    }

    function test_revert_devWalletZero() public {
        game.set(5_000_000, address(0), 1000, 0);
        vm.expectRevert(TblockPayRouter.BadGame.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_gameWithoutCode() public {
        vm.expectRevert(TblockPayRouter.BadGame.selector);
        _pay(address(0x1234), 5_000_000, 1);
    }

    // ---------------------------------------------------------------- guard 3: minOut
    function test_revert_zeroMinOut() public {
        vm.expectRevert(TblockPayRouter.ZeroMinOut.selector);
        _pay(address(game), 5_000_000, 0);
    }

    function test_revert_minOutNotReached() public {
        uint256 expected = 4_500_000 * WPU * 25_000_000 * (1e6 - 13_000) / 1e6;
        _pay(address(game), 5_000_000, expected); // exactly reached: passes
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.InsufficientOutput.selector, expected, expected + 1));
        _pay(address(game), 5_000_000, expected + 1);
    }

    // ---------------------------------------------------------------- guard 4: deadline
    function test_revert_expired() public {
        vm.prank(payer);
        vm.expectRevert(TblockPayRouter.Expired.selector);
        router.pay(address(game), 5_000_000, 1, block.timestamp - 1, "");
    }

    function test_deadline_now_passes() public {
        vm.prank(payer);
        router.pay(address(game), 5_000_000, F5, block.timestamp, "");
    }

    // ---------------------------------------------------------------- guard 5: MAX_USDC_PER_PAY
    function test_revert_amountTooLarge() public {
        game.set(MAX + 1, dev, 1000, 0);
        vm.expectRevert(TblockPayRouter.AmountTooLarge.selector);
        _pay(address(game), MAX + 1, 1);
    }

    function test_amountAtMax_passes() public {
        game.set(MAX, dev, 1000, 0);
        _pay(address(game), MAX, FMAX);
        assertEq(usdc.balanceOf(dev), 5_000_000);
    }

    // ---------------------------------------------------------------- v4 (owner decision, round 3): NO Aerodrome price guard
    /// a large Aerodrome move after our swap (+5000 ticks: the v3 TWAP guard refused +501) no longer blocks the payment
    function test_noAeroGuard_bigMoveAfterOurSwap_passes() public {
        aero.setTicks(-227335, -227335, -227335 + 5000);
        assertEq(_pay(address(game), 5_000_000, Q5 * 99 / 100), Q5);
    }

    /// a past price is never read: the mock's "TWAP" sits 5000 ticks away and observe() reverts; neither matters, and pay()
    /// makes no observe() call at all (count 0)
    function test_pastPriceNeverRead_observeNeverCalled() public {
        aero.setTicks(-227335, -227335 - 5000, -227335);
        assertEq(router.minOutFloor(4_500_000), F5, "the 'TWAP' does not move the floor");
        aero.setObserveReverts(true);
        vm.expectCall(address(aero), abi.encodeWithSignature("observe(uint32[])"), 0);
        assertEq(_pay(address(game), 5_000_000, Q5 * 99 / 100), Q5);
    }

    /// the floor reads the Aerodrome SPOT tick: 954 ticks lower spot (10 % cheaper wtCOIN) -> floor x 1.1; +100 ticks -> / 1.0101
    /// (round 5) the mock still fills at its fixed rate, i.e. 9.1 % under that spot: the Aerodrome leg bound refuses it BY NAME;
    /// a fill AT the leg bound passes with minOut = the moved floor.
    function test_floor_followsAeroSpot() public {
        aero.setTicks(-227335 - 954, -227335, -227335 - 954);
        uint256 f = router.minOutFloor(4_500_000);
        assertApproxEqRel(f, F5 * 11_000 / 10_000, 1e15, "floor x 1.1 (1.0001^954 = 1.1000)");
        assertLt(f, Q5 * 99 / 100);
        vm.expectPartialRevert(TblockPayRouter.AeroImpactTooHigh.selector);
        _pay(address(game), 5_000_000, Q5 * 99 / 100);
        aero.setOutOverride(router.aeroLegMin(4_500_000));
        _pay(address(game), 5_000_000, f);
        aero.setOutOverride(0);
        aero.setTicks(-227335 + 100, -227335, -227335 + 100);
        assertApproxEqRel(router.minOutFloor(4_500_000), F5 * 1e6 / 1_010_050, 1e12, "1.0001^-100");
    }

    /// the floor is read BEFORE our own swaps: the Aerodrome tick our swap leaves behind does not enter it
    function test_floor_readBeforeOurSwap() public {
        aero.setTicks(-227335, -227335, -227335 + 3000); // our swap would move the mock spot +3000 ticks
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.MinOutTooLow.selector, F5 - 1, F5)); // F5 = pre-swap spot floor
        _pay(address(game), 5_000_000, F5 - 1);
        _pay(address(game), 5_000_000, F5);
    }

    // ---------------------------------------------------------------- round 5: the Aerodrome leg bound
    uint256 constant AERO_SPOT5 = 4_500_000 * WPU; // the mock's value of 4.5 USDC at its spot tick -227335 (fixed-rate fill = spot)

    /// aeroLegMin = value at the spot sqrtPrice x (1e6 - fee 2452 - 100 x 100 bps) / 1e6; a fill of exactly that passes, 1 wei less
    /// reverts AeroImpactTooHigh(out, min), the payer keeps his USDC
    function test_aeroLeg_exactMinPasses_oneLessReverts() public {
        uint256 m = router.aeroLegMin(4_500_000);
        assertApproxEqRel(m, AERO_SPOT5 * (1e6 - 2452 - 10_000) / 1e6, 1e9, "spot x (1 - fee - 1 %)");
        assertEq(router.MAX_AERO_IMPACT_BPS(), 100); assertEq(router.MAX_AERO_FEE_PPM(), 50_000);
        uint256 b = usdc.balanceOf(payer);
        aero.setOutOverride(m - 1);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroImpactTooHigh.selector, m - 1, m));
        _pay(address(game), 5_000_000, F5);
        assertEq(usdc.balanceOf(payer), b, "refused: USDC kept");
        aero.setOutOverride(m);
        _pay(address(game), 5_000_000, F5);
        assertEq(aero.lastOut(), m);
    }

    /// the pool fee() is read in the call: at fee 5000 the bound is lower by exactly the fee difference
    function test_aeroLeg_feeReadInCall() public {
        uint256 m = router.aeroLegMin(4_500_000);
        aero.setFee(5000);
        uint256 m2 = router.aeroLegMin(4_500_000);
        assertApproxEqRel(m2 * (1e6 - 2452 - 10_000), m * (1e6 - 5000 - 10_000), 1e9, "ratio of the two (1 - fee - impact)");
        aero.setOutOverride(m2);
        _pay(address(game), 5_000_000, F5);
        aero.setFee(2452);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroImpactTooHigh.selector, m2, m));
        _pay(address(game), 5_000_000, F5);
    }

    /// a pool fee above MAX_AERO_FEE_PPM is refused BY NAME (it would widen the bound); at the cap it passes
    function test_aeroLeg_feeAboveCapReverts() public {
        aero.setFee(50_001);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroFeeTooHigh.selector, uint256(50_001)));
        _pay(address(game), 5_000_000, F5);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroFeeTooHigh.selector, uint256(50_001)));
        router.aeroLegMin(4_500_000);
        aero.setFee(50_000); // the module cap: a fee spike at its maximum still pays (fill = mock rate, 0 % under spot)
        _pay(address(game), 5_000_000, F5);
    }

    function test_aeroLeg_feeUnavailable_badPool() public {
        aero.setFeeReverts(true);
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        _pay(address(game), 5_000_000, F5);
    }

    /// the bound is read BEFORE our swap: the swap moves the mock spot +3000 ticks (wtCOIN 35 % dearer after it); a fill 2 % under
    /// the PRE-swap bound still reverts (read after the swap, that fill would look far ABOVE the bound)
    function test_aeroLeg_readBeforeOurSwap() public {
        uint256 m = router.aeroLegMin(4_500_000);
        aero.setTicks(-227335, -227335, -227335 + 3000);
        aero.setOutOverride(m * 98 / 100);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroImpactTooHigh.selector, m * 98 / 100, m));
        _pay(address(game), 5_000_000, F5);
    }

    /// a JIT-thinned pool: the fill 3 % under spot (the combined 75 % floor alone would accept it) reverts; 1 % under passes
    function test_aeroLeg_fill3pctUnderSpot_reverts_1pctPasses() public {
        aero.setShortPpm(30_000);
        vm.expectPartialRevert(TblockPayRouter.AeroImpactTooHigh.selector);
        _pay(address(game), 5_000_000, F5);
        aero.setShortPpm(10_000); // 1 % + fee 0.2452 % allowed
        _pay(address(game), 5_000_000, F5);
    }

    /// fill anywhere in +-5 % of the bound: pay passes iff the fill >= aeroLegMin (read before), else AeroImpactTooHigh(out, min)
    function testFuzz_aeroLeg_passesIffAtLeastMin(uint256 o) public {
        uint256 m = router.aeroLegMin(4_500_000);
        o = bound(o, m - m / 20, m + m / 20);
        aero.setOutOverride(o);
        if (o < m) vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroImpactTooHigh.selector, o, m));
        _pay(address(game), 5_000_000, F5);
    }

    function test_ctor_aeroBounds() public {
        TblockPayRouter.Config memory c = _cfg();
        c.maxAeroImpactBps = 0;
        vm.expectRevert(TblockPayRouter.BadParams.selector); new TblockPayRouter(c);
        c.maxAeroImpactBps = 100; c.maxAeroFeePpm = 90_001; // 90,001 + 10,000 > 100,000
        vm.expectRevert(TblockPayRouter.BadParams.selector); new TblockPayRouter(c);
        c.maxAeroFeePpm = 90_000; // exactly the 10 % slack: accepted
        TblockPayRouter r = new TblockPayRouter(c);
        assertEq(r.MAX_AERO_FEE_PPM(), 90_000);
        c.maxAeroFeePpm = 0; c.maxAeroImpactBps = 1001; // 100,100 > 100,000
        vm.expectRevert(TblockPayRouter.BadParams.selector); new TblockPayRouter(c);
        c.maxAeroImpactBps = 1000;
        r = new TblockPayRouter(c);
        assertEq(r.MAX_AERO_IMPACT_BPS(), 1000);
    }

    /// a wider impact bound (300 bps) lowers the bound by exactly 2 % of spot
    function test_aeroLeg_impactBpsScales() public {
        TblockPayRouter.Config memory c = _cfg();
        c.maxAeroImpactBps = 300;
        TblockPayRouter r = new TblockPayRouter(c);
        assertApproxEqRel(r.aeroLegMin(4_500_000) * (1e6 - 12_452), router.aeroLegMin(4_500_000) * (1e6 - 32_452), 1e9);
    }

    // ---------------------------------------------------------------- guard 7: v4 own impact
    function test_revert_v4Impact() public {
        pm.setTickAfter(170391 - 301);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.V4ImpactTooHigh.selector, int24(170391), int24(170391 - 301)));
        _pay(address(game), 5_000_000, F5);
    }

    function test_v4Impact_atBound_passes() public {
        pm.setTickAfter(170391 - 300);
        _pay(address(game), 5_000_000, F5);
    }

    // ---------------------------------------------------------------- guard 8: v4 floor
    function test_revert_belowFloor() public {
        pm.setTake(45_001); // floor allows 3000 + 12000 + 30000 = 45000 ppm
        vm.expectPartialRevert(TblockPayRouter.BelowFloor.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_floor_atBudget_passes() public {
        pm.setTake(45_000);
        _pay(address(game), 5_000_000, F5);
    }

    function test_protocolFee_widensBudget_byItsSize() public {
        pm.setProtocolFee(501); // zeroForOne half (low 12 bits): the floor allows 45000 + 501 ppm
        pm.setTake(45_501);
        _pay(address(game), 5_000_000, F5);
        pm.setTake(45_502);
        vm.expectPartialRevert(TblockPayRouter.BelowFloor.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_protocolFee_otherDirectionIgnored() public {
        pm.setProtocolFee(uint256(1000) << 12); // oneForZero half only: must NOT widen our budget
        pm.setTake(45_001);
        vm.expectPartialRevert(TblockPayRouter.BelowFloor.selector);
        _pay(address(game), 5_000_000, F5);
    }

    // ---------------------------------------------------------------- guard 9: callbacks only from the pinned pool / PM, only in flight
    function test_revert_aeroCallback_wrongSender() public {
        vm.expectRevert(TblockPayRouter.BadCallback.selector);
        router.uniswapV3SwapCallback(0, 1, "");
    }

    function test_revert_aeroCallback_rightSender_notInFlight() public {
        vm.prank(address(aero));
        vm.expectRevert(TblockPayRouter.BadCallback.selector);
        router.uniswapV3SwapCallback(0, 1, "");
    }

    function test_revert_v4Callback_wrongSender() public {
        vm.expectRevert(TblockPayRouter.BadCallback.selector);
        router.unlockCallback(abi.encode(uint256(1)));
    }

    function test_revert_v4Callback_rightSender_notInFlight() public {
        vm.prank(address(pm));
        vm.expectRevert(TblockPayRouter.BadCallback.selector);
        router.unlockCallback(abi.encode(uint256(1)));
    }

    function test_callbacks_fromGameDuringPay_refusedBySender() public {
        // inside onPaid the router's lock is 2: only the sender check stands between a game and the callbacks
        game.set(5_000_000, dev, 1000, 5);
        _pay(address(game), 5_000_000, F5);
        assertFalse(game.cbOk());
        assertEq(game.cbRet(), abi.encodeWithSelector(TblockPayRouter.BadCallback.selector), "aero cb refused by sender check");
        game.set(5_000_000, dev, 1000, 6);
        _pay(address(game), 5_000_000, F5);
        assertFalse(game.cbOk());
        assertEq(game.cbRet(), abi.encodeWithSelector(TblockPayRouter.BadCallback.selector), "v4 cb refused by sender check");
    }

    function test_revert_aeroReturnsWrongAmountIn() public {
        aero.setReturnTamper(-1);
        vm.expectRevert(TblockPayRouter.PartialFill.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_aeroSendsLessThanReported() public {
        aero.setShortOut(true);
        vm.expectRevert(TblockPayRouter.BalanceDrift.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_v4PartialFill() public {
        pm.setPartial(1);
        vm.expectRevert(TblockPayRouter.PartialFill.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_tam_destReceivesLess() public {
        tb.setFee(1); tb.setFeeTo(address(vault)); // only the TAM -> DEST hop is short
        vm.prank(payer);
        vm.expectRevert(TamArtV2.TransferFailed.selector);
        router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(9));
    }

    function test_revert_aeroCallback_wrongAmount() public {
        aero.setTamper(-1); // pool asks 1 less than we spend
        vm.expectRevert(TblockPayRouter.PartialFill.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_aeroCallback_skipped() public {
        aero.setSkip(true); // a pool that never calls back: the router refuses to keep its wtCOIN unpaid
        vm.expectRevert(TblockPayRouter.PartialFill.selector);
        _pay(address(game), 5_000_000, F5);
    }

    // ---------------------------------------------------------------- guard 10: onPaid only from ROUTER
    function test_revert_tamOnPaid_notRouter() public {
        vm.expectRevert(TamArtV2.NotRouter.selector);
        tam.onPaid(payer, 5_000_000, 1, _work(2));
    }

    function test_revert_tamOnPaid_wrongPrice_fromRouter() public {
        tb.mint(address(tam), 10);
        vm.prank(address(router));
        vm.expectRevert(TamArtV2.BadPayment.selector);
        tam.onPaid(payer, 4_000_000, 10, _work(2));
    }

    // ---------------------------------------------------------------- guard 11: the game credits its balance delta, not the argument
    function test_revert_tam_feeOnTransferToken() public {
        tb.setFee(1); // 0.01 % fee on transfer: TAM receives less than the router reports
        vm.prank(payer);
        vm.expectRevert(TamArtV2.BadPayment.selector);
        router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(3));
    }

    function test_revert_tam_routerOverstates() public {
        tb.mint(address(tam), 99);
        vm.prank(address(router));
        vm.expectRevert(TamArtV2.BadPayment.selector);
        tam.onPaid(payer, 5_000_000, 100, _work(3));
    }

    function test_tam_forwardsGiftToo() public {
        tb.mint(address(tam), 7); // stray gift: forwarded with the next payment, never kept
        vm.prank(payer);
        uint256 out = router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(4));
        assertEq(tb.balanceOf(address(vault)), out + 7);
        assertEq(tb.balanceOf(address(tam)), 0);
    }

    function test_revert_tam_duplicate() public {
        vm.prank(payer); router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(5));
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(TamArtV2.Duplicate.selector, uint256(1)));
        router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(5));
    }

    function test_revert_tam_badData() public {
        bytes memory w = abi.encode(bytes("XAM\x01\x08\x00\x00"), bytes32(0), bytes(""));
        vm.prank(payer);
        vm.expectRevert(TamArtV2.BadData.selector);
        router.pay(address(tam), 5_000_000, F5, block.timestamp, w);
    }

    // ---------------------------------------------------------------- finding 1 (v3): copy front-run of a TAM work, the honest rule
    address copier = address(0xC0C0);

    function _fundCopier() internal {
        usdc.mint(copier, 100_000_000);
        vm.prank(copier); usdc.approve(address(router), type(uint256).max);
    }

    /// a copier who saw the pending pay() must pay the FULL price first to own the bytes; the payer's pay() then reverts
    /// Duplicate and the payer loses NOTHING (USDC unchanged, no TBLOCK, no token) -- the copier's 5 USDC went the normal way.
    function test_tam_copierPaysFullPriceFirst_payerRevertsDuplicate_losesNothing() public {
        bytes memory w = _work(22);
        _fundCopier();
        uint256 copierB = usdc.balanceOf(copier);
        uint256 devB = usdc.balanceOf(dev);
        vm.prank(copier);
        uint256 outC = router.pay(address(tam), 5_000_000, F5, block.timestamp, w);
        assertEq(tam.ownerOf(1), copier, "whoever pays first owns the bytes");
        assertEq(copierB - usdc.balanceOf(copier), 5_000_000, "the copier paid the FULL price");
        assertEq(usdc.balanceOf(dev) - devB, 500_000, "the copier's 10 % went to DEV_WALLET");
        assertEq(tb.balanceOf(address(vault)), outC, "the copier's 90 % went to DEST as TBLOCK");

        uint256 payerUsdc = usdc.balanceOf(payer);
        uint256 payerTb = tb.balanceOf(payer);
        uint256 vaultTb = tb.balanceOf(address(vault));
        uint256 devNow = usdc.balanceOf(dev);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(TamArtV2.Duplicate.selector, uint256(1)));
        router.pay(address(tam), 5_000_000, F5, block.timestamp, w);
        assertEq(usdc.balanceOf(payer), payerUsdc, "the payer's USDC is unchanged on the Duplicate revert");
        assertEq(tb.balanceOf(payer), payerTb);
        assertEq(tam.balanceOf(payer), 0);
        assertEq(tb.balanceOf(address(vault)), vaultTb, "nothing reached DEST");
        assertEq(usdc.balanceOf(dev), devNow, "nothing reached DEV_WALLET");
        assertEq(usdc.allowance(payer, address(router)), type(uint256).max, "allowance untouched (max: never decremented)");
        assertEq(tam.totalSupply(), 1);
    }

    /// a work is minted once, whoever pays: the same bytes with another seed or params are still the same work
    function test_tam_sameBytesOtherSeedOrParams_duplicate() public {
        (bytes memory d, bytes32 g, bytes memory p) = abi.decode(_work(26), (bytes, bytes32, bytes));
        vm.prank(payer); router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(26));
        bytes[2] memory others = [abi.encode(d, bytes32(uint256(g) ^ 1), p), abi.encode(d, g, bytes('{"p":2}'))];
        for (uint256 i; i < 2; i++) {
            vm.prank(payer);
            vm.expectRevert(abi.encodeWithSelector(TamArtV2.Duplicate.selector, uint256(1)));
            router.pay(address(tam), 5_000_000, F5, block.timestamp, others[i]);
        }
        // one more byte = other bytes = another work
        vm.prank(payer); router.pay(address(tam), 5_000_000, F5, block.timestamp, abi.encode(abi.encodePacked(d, uint8(0)), g, p));
        assertEq(tam.totalSupply(), 2);
    }

    // ---------------------------------------------------------------- owner decision 2b: minOut floor = anti-absurd only (75 %)
    uint256 constant Q5 = 4_500_000 * WPU * 25_000_000 * (1e6 - 13_000) / 1e6; // the mock route's exact output = the app's quote

    function test_floor_1wei_reverts_quoteX099_passes() public {
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.MinOutTooLow.selector, uint256(1), F5));
        _pay(address(game), 5_000_000, 1);
        assertLt(F5, Q5 * 99 / 100);
        assertEq(_pay(address(game), 5_000_000, Q5 * 99 / 100), Q5);
    }

    /// a favourable v4 move between the quote and the inclusion raises the floor; minOut = quote x 0.99 must still pass.
    /// sqrtP = s * 2^96, P = s^2 TBLOCK per wtCOIN: 5000 -> 25e6 (quote), 5060 -> +2.41 %, 5245 -> +10.04 %.
    function _favourable(uint160 s) internal returns (uint256 f, uint256 out) {
        pm.setPrice(uint160(uint256(s) * 2 ** 96), uint256(s) * s);
        f = router.minOutFloor(4_500_000);
        out = _pay(address(game), 5_000_000, Q5 * 99 / 100);
    }

    function test_floor_favourableMove_2p4pct_passes() public {
        (uint256 f, uint256 out) = _favourable(5060);
        assertApproxEqRel(f, F5 * 25_603_600 / 25_000_000, 1e9, "floor rose with the move (+2.41 %)");
        assertLe(f, Q5 * 99 / 100, "floor stays under quote x 0.99");
        assertGt(out, Q5, "the payer got the better price");
    }

    function test_floor_favourableMove_10pct_passes() public {
        (uint256 f, uint256 out) = _favourable(5245);
        assertApproxEqRel(f, F5 * 27_510_025 / 25_000_000, 1e9, "floor rose with the move (+10.04 %)");
        assertLe(f, Q5 * 99 / 100, "floor stays under quote x 0.99");
        assertGt(out, Q5);
    }

    /// MEASURED LIMIT of the 75 % floor with the mock's 1.3 % cost: 0.75 x (1 + m) <= 0.99 x 0.987 -> m <= +30.3 %.
    /// At +35 % the floor passes quote x 0.99 and a STALE quote is refused (the app re-quotes); at +30 % it still passes.
    function test_floor_LIMIT_favourableMove_35pct_refusesStaleQuote() public {
        pm.setPrice(uint160(5477 * 2 ** 96), 5477 * 5477); // 29,997,529 -> +19.99 %
        _pay(address(game), 5_000_000, Q5 * 99 / 100);
        pm.setPrice(uint160(5700 * 2 ** 96), 5700 * 5700); // 32,490,000 -> +29.96 %
        _pay(address(game), 5_000_000, Q5 * 99 / 100);
        pm.setPrice(uint160(5810 * 2 ** 96), 5810 * 5810); // 33,756,100 -> +35.02 %
        uint256 f = router.minOutFloor(4_500_000);
        assertGt(f, Q5 * 99 / 100);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.MinOutTooLow.selector, Q5 * 99 / 100, f));
        _pay(address(game), 5_000_000, Q5 * 99 / 100);
    }

    // ---------------------------------------------------------------- finding 3: TamArtV2 constructor
    function test_tamCtor_rejectsRouterWithoutCode() public {
        vm.expectRevert(TamArtV2.BadAddress.selector);
        new TamArtV2(address(0x1234), dev, address(vault), address(tb), address(usdc), address(rewards));
    }

    function test_tamCtor_rejectsOtherTblock() public {
        address other = address(new MockERC20("old TBLOCK", 18));
        address v = address(new MockVault(other));
        vm.expectRevert(TamArtV2.BadToken.selector);
        new TamArtV2(address(router), dev, v, other, address(usdc), address(rewards));
    }

    function test_tamCtor_rejectsZeroExpectedTblock() public {
        vm.expectRevert(TamArtV2.BadToken.selector);
        new TamArtV2(address(router), dev, address(vault), address(0), address(usdc), address(rewards));
    }

    function test_tamCtor_rejectsOtherUsdc() public {
        address other = address(new MockERC20("USD Coin", 6));
        assertTrue(other != address(usdc));
        vm.expectRevert(TamArtV2.BadToken.selector);
        new TamArtV2(address(router), dev, address(vault), address(tb), other, address(rewards));
    }

    function test_tamCtor_rejectsBadDevWallet() public {
        address[3] memory bad = [address(0), address(router), address(vault)];
        for (uint256 i; i < 3; i++) {
            vm.expectRevert(TamArtV2.BadAddress.selector);
            new TamArtV2(address(router), bad[i], address(vault), address(tb), address(usdc), address(rewards));
        }
    }

    /// CHANGED by the economy v2 pack (2026-11-11): TAM deploys BEFORE the vault (one wallet, predicted addresses), so its constructor
    /// can no longer read DEST.TBLOCK(). The token check moved to TBlockVaultV2's constructor (game.TBLOCK() == its TBLOCK, tested in
    /// forge-pack); a vault of the other TBLOCK never lists this game, so TAM refuses every payment (NotWired).
    function test_tamCtor_vaultOfTheOtherTblock_neverPaid() public {
        MockVault v2 = new MockVault(address(new MockERC20("old TBLOCK", 18)));
        v2.setUnlisted(true); // what the real vault does: its constructor refused this game, so it does not list it
        TamArtV2 t = new TamArtV2(address(router), dev, address(v2), address(tb), address(usdc), address(rewards));
        _assertNotWired(t, 81);
    }

    /// CHANGED by the pack: a DEST without TBLOCK()/isGame() is accepted at construction (it may be a predicted address) and never paid
    function test_tamCtor_destWithoutViews_neverPaid() public {
        TamArtV2 t = new TamArtV2(address(router), dev, address(game), address(tb), address(usdc), address(rewards)); // a contract, no isGame()
        _assertNotWired(t, 82);
    }

    /// CHANGED by the pack: a codeless DEST is the normal case at construction (the vault deploys next); until a vault listing this game
    /// exists there, no payment is taken
    function test_tamCtor_destWithoutCode_neverPaid() public {
        TamArtV2 t = new TamArtV2(address(router), dev, address(0xDE57), address(tb), address(usdc), address(rewards));
        assertEq(t.VAULT(), address(0xDE57));
        _assertNotWired(t, 83);
    }

    /// pack: REWARDS not listing this game blocks the payment too (both records must have a home)
    function test_tamPay_rewardsNotListing_neverPaid() public {
        rewards.setUnlisted(true);
        _assertNotWired(tam, 84);
        rewards.setUnlisted(false);
        vault.setUnlisted(true);
        _assertNotWired(tam, 85);
    }

    /// economy v2 pack: a TAM whose DEST / REWARDS do not (yet) list it takes no payment at all -- the pay reverts NotWired, no USDC moves
    function _assertNotWired(TamArtV2 t, uint8 salt) internal {
        assertFalse(t.wired(), "not wired");
        uint256 before = usdc.balanceOf(payer);
        vm.prank(payer);
        vm.expectRevert(TamArtV2.NotWired.selector);
        router.pay(address(t), 5_000_000, F5, block.timestamp, _work(salt));
        assertEq(usdc.balanceOf(payer), before, "no USDC moved");
    }

    function test_tamCtor_rejectsDestIsRouter() public {
        vm.expectRevert(TamArtV2.BadAddress.selector);
        new TamArtV2(address(router), dev, address(router), address(tb), address(usdc), address(rewards));
    }

    // ---------------------------------------------------------------- finding 5: minOut sanity floor
    function test_revert_minOutBelowFloor() public {
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.MinOutTooLow.selector, uint256(1), F5));
        _pay(address(game), 5_000_000, 1);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.MinOutTooLow.selector, F5 - 1, F5));
        _pay(address(game), 5_000_000, F5 - 1);
        _pay(address(game), 5_000_000, F5); // exactly the floor: passes
    }

    /// the floor = spend at the Aerodrome spot price (1.0001^227335 wtCOIN wei per USDC unit), at the v4 spot price (25e6), times 75 %
    function test_minOutFloor_value() public view {
        uint256 expected = 4_500_000 * WPU * 25_000_000 * 750_000 / 1e6;
        assertApproxEqRel(F5, expected, 1e9, "within 1e-9 of the closed form"); // WPU is floored: F5 is a hair above
        assertGe(F5, expected);
        // the real mock output (1.3 % fee) sits above it
        assertGt(4_500_000 * WPU * 25_000_000 * (1e6 - 13_000) / 1e6, F5);
    }

    function test_minOutFloor_linearInSpend() public view {
        assertApproxEqRel(router.minOutFloor(1_000_000), F5 * 1_000_000 / 4_500_000, 1e9);
    }

    function test_ctor_rejectsMinOutBudget() public {
        TblockPayRouter.Config memory c = _cfg();
        c.minOutBudgetPpm = 0;
        vm.expectRevert(TblockPayRouter.BadParams.selector);
        new TblockPayRouter(c);
        c.minOutBudgetPpm = 250_001;
        vm.expectRevert(TblockPayRouter.BadParams.selector);
        new TblockPayRouter(c);
        c.minOutBudgetPpm = 250_000;
        new TblockPayRouter(c);
    }

    function test_ctor_rejectsZeroMaxUsdc_andZeroImpact() public {
        TblockPayRouter.Config memory c = _cfg();
        c.maxUsdcPerPay = 0;
        vm.expectRevert(TblockPayRouter.BadParams.selector);
        new TblockPayRouter(c);
        c = _cfg();
        c.maxV4ImpactTicks = 0;
        vm.expectRevert(TblockPayRouter.BadParams.selector);
        new TblockPayRouter(c);
        c.maxV4ImpactTicks = -1;
        vm.expectRevert(TblockPayRouter.BadParams.selector);
        new TblockPayRouter(c);
        c.maxV4ImpactTicks = 1;
        new TblockPayRouter(c);
    }

    /// the Aerodrome spot is read with slot0(): a pool whose slot0 fails is refused BY NAME (BadPool), floor view and pay() alike
    function test_aeroSlot0Fails_badPool() public {
        aero.setSlot0Reverts(true);
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        router.minOutFloor(4_500_000);
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        _pay(address(game), 5_000_000, F5);
    }

    // ---------------------------------------------------------------- finding 4: one orientation only (FAIL on the old code, which accepted both)
    function test_ctor_rejectsUsdcAsAeroToken0() public {
        TblockPayRouter.Config memory c = _cfg();
        c.aeroPool = address(new MockAeroPool(address(usdc), address(wt)));
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    /// token1 is USDC but token0 is not wtCOIN (each half of the orientation check is needed)
    function test_ctor_rejectsAeroToken0NotWtcoin() public {
        TblockPayRouter.Config memory c = _cfg();
        c.aeroPool = address(new MockAeroPool(address(tb), address(usdc)));
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    /// currency1 is TBLOCK but currency0 is not wtCOIN
    function test_ctor_rejectsV4Currency0NotWtcoin() public {
        TblockPayRouter.Config memory c = _cfg();
        c.v4Key = TblockPayRouter.PoolKey(address(usdc), address(tb), 3000, 60, HOOKS);
        c.v4PoolId = keccak256(abi.encode(c.v4Key));
        pm.setSlot(keccak256(abi.encode(c.v4PoolId, uint256(6))));
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    function test_sqrtPriceAtTick_outOfRange_reverts() public {
        vm.expectRevert();
        router.sqrtPriceAtTick(887273);
        vm.expectRevert();
        router.sqrtPriceAtTick(-887273);
        router.sqrtPriceAtTick(887272);
    }

    function test_ctor_rejectsTblockAsV4Currency0() public {
        TblockPayRouter.Config memory c = _cfg();
        c.v4Key = TblockPayRouter.PoolKey(address(tb), address(wt), 3000, 60, HOOKS);
        c.v4PoolId = keccak256(abi.encode(c.v4Key));
        pm.setSlot(keccak256(abi.encode(c.v4PoolId, uint256(6)))); // the pool exists: ONLY the orientation is wrong
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    // ---------------------------------------------------------------- guard 12: reentrancy
    function test_revert_reentrancy_game() public {
        game.set(5_000_000, dev, 1000, 1);
        usdc.mint(address(game), 100_000_000);
        vm.prank(address(game)); usdc.approve(address(router), type(uint256).max);
        vm.expectRevert(TblockPayRouter.Reentrancy.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_reentrancy_token() public {
        usdc.setReenter(address(router), abi.encodeCall(TblockPayRouter.pay, (address(game), 5_000_000, 1, block.timestamp, bytes(""))));
        _pay(address(game), 5_000_000, F5);
        assertFalse(usdc.reenterOk(), "reentry refused");
        assertEq(usdc.reenterRet(), abi.encodeWithSelector(TblockPayRouter.Reentrancy.selector), "refused BY the lock");
    }

    // ---------------------------------------------------------------- guard 13: end-of-call balance equality
    function test_revert_balanceDrift_tblockBack() public {
        game.set(5_000_000, dev, 1000, 2);
        vm.expectRevert(TblockPayRouter.BalanceDrift.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_balanceDrift_usdcGift() public {
        game.set(5_000_000, dev, 1000, 3);
        usdc.mint(address(game), 1);
        vm.expectRevert(TblockPayRouter.BalanceDrift.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_revert_feeOnTransferUsdc() public {
        usdc.setFee(1);
        vm.expectRevert(TblockPayRouter.BalanceDrift.selector);
        _pay(address(game), 5_000_000, F5);
    }

    function test_gifts_doNotBrick() public {
        usdc.mint(address(router), 1); wt.mint(address(router), 1); tb.mint(address(router), 1);
        _pay(address(game), 5_000_000, F5);
        (uint256 a, uint256 b, uint256 c) = _bals();
        assertEq(a, 1); assertEq(b, 1); assertEq(c, 1);
    }

    function test_revert_gameRevertsAll() public {
        game.set(5_000_000, dev, 1000, 4);
        uint256 before = usdc.balanceOf(payer);
        vm.expectRevert(bytes("game says no"));
        _pay(address(game), 5_000_000, F5);
        assertEq(usdc.balanceOf(payer), before);
    }

    // ---------------------------------------------------------------- guard 14: permit front-run
    function _sig(uint256 pk, address owner, uint256 value, uint256 dl) internal view returns (uint8 v, bytes32 r, bytes32 s) {
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), keccak256(abi.encode(
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"),
            owner, address(router), value, usdc.nonces(owner), dl))));
        (v, r, s) = vm.sign(pk, digest);
    }

    function test_permit_normal() public {
        uint256 pk = 0xA11CE; address alice = vm.addr(pk);
        usdc.mint(alice, 5_000_000);
        (uint8 v, bytes32 r, bytes32 s) = _sig(pk, alice, 5_000_000, block.timestamp);
        vm.prank(alice);
        router.payWithPermit(address(game), 5_000_000, F5, block.timestamp, "", block.timestamp, v, r, s);
        assertEq(usdc.balanceOf(alice), 0);
    }

    function test_permit_frontrun_stillPays() public {
        uint256 pk = 0xA11CE; address alice = vm.addr(pk);
        usdc.mint(alice, 5_000_000);
        (uint8 v, bytes32 r, bytes32 s) = _sig(pk, alice, 5_000_000, block.timestamp);
        vm.prank(address(0xF00)); // a third party submits alice's permit first
        usdc.permit(alice, address(router), 5_000_000, block.timestamp, v, r, s);
        vm.prank(alice);
        router.payWithPermit(address(game), 5_000_000, F5, block.timestamp, "", block.timestamp, v, r, s); // permit fails inside, allowance used
        assertEq(usdc.balanceOf(alice), 0);
        assertEq(usdc.balanceOf(dev), 500_000);
    }

    function test_revert_permitBad_noAllowance() public {
        address bob = address(0xB0B);
        usdc.mint(bob, 5_000_000);
        vm.prank(bob);
        vm.expectRevert(TblockPayRouter.TransferFailed.selector); // bad permit swallowed, then transferFrom has no allowance
        router.payWithPermit(address(game), 5_000_000, F5, block.timestamp, "", block.timestamp, 27, bytes32(0), bytes32(0));
    }

    // ---------------------------------------------------------------- constructor pins
    function test_ctor_rejectsOtherTblock() public {
        TblockPayRouter.Config memory c = _cfg();
        c.tblock = address(new MockERC20("old TBLOCK", 18));
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    function test_ctor_rejectsWrongPoolId() public {
        TblockPayRouter.Config memory c = _cfg();
        c.v4PoolId = bytes32(uint256(c.v4PoolId) ^ 1);
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    function test_ctor_rejectsBeforeSwapHook() public {
        TblockPayRouter.Config memory c = _cfg();
        c.v4Key = _key(address(uint160(0x2044 | 0x80)), 3000);
        c.v4PoolId = keccak256(abi.encode(c.v4Key));
        pm.setSlot(keccak256(abi.encode(c.v4PoolId, uint256(6)))); // the pool exists: ONLY the hook flag is wrong
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    function test_ctor_rejectsDynamicFee() public {
        TblockPayRouter.Config memory c = _cfg();
        c.v4Key = _key(HOOKS, 0x800000);
        c.v4PoolId = keccak256(abi.encode(c.v4Key));
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    function test_ctor_rejectsUninitializedPool() public {
        pm.setInit(false);
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(_cfg());
    }

    function test_ctor_rejectsWrongAeroPool() public {
        TblockPayRouter.Config memory c = _cfg();
        c.aeroPool = address(new MockAeroPool(address(wt), address(tb)));
        vm.expectRevert(TblockPayRouter.BadPool.selector);
        new TblockPayRouter(c);
    }

    function test_constants() public view {
        assertEq(router.MAX_DEV_BPS(), 1000);
        assertEq(router.MAX_USDC_PER_PAY(), MAX);
        assertEq(router.V4_FLOOR_PPM(), 1e6 - 45_000);
        assertEq(router.MIN_OUT_PPM(), 1e6 - 250_000);
        assertEq(router.MAX_MIN_OUT_BUDGET_PPM(), 250_000);
        assertEq(tam.PRICE_USDC(), 5_000_000);
        (address d, uint16 b) = tam.USDC_SPLIT();
        assertEq(d, dev); assertEq(b, 1000);
    }

    // ---------------------------------------------------------------- round 3 'equivalent' survivors: each overlapping check, ON ITS OWN
    /// wtCOIN LEFT on the router after the v4 leg (a PM handing 1 wei back): the post-v4 balance check refuses it BEFORE the
    /// TBLOCK leaves and BEFORE onPaid -- the end-of-call check alone would only refuse it after the game ran (count 0 here).
    function test_revert_wtLeftAfterV4Leg_beforeGameRuns() public {
        wt.mint(address(pm), 1);
        pm.setRefundWt(1);
        vm.expectCall(address(game), abi.encodeWithSelector(MockGame.onPaid.selector), 0);
        vm.expectCall(address(tb), abi.encodeWithSelector(MockERC20.transfer.selector, address(game)), 0);
        vm.expectRevert(TblockPayRouter.BalanceDrift.selector);
        _pay(address(game), 5_000_000, F5);
    }

    /// TamArtV2's own lock, without the router's: a router stand-in calls onPaid, and the TBLOCK transfer to DEST re-enters
    /// onPaid through it. The TAM lock (not the router's nonReentrant, absent here) must be what refuses it.
    function test_tamLock_refusesReentry_withoutRouterLock() public {
        FakeRouter fr = new FakeRouter(address(tb), address(usdc));
        TamArtV2 t2 = new TamArtV2(address(fr), dev, address(vault), address(tb), address(usdc), address(rewards));
        tb.mint(address(t2), 1000);
        tb.setReenter(address(fr), abi.encodeCall(FakeRouter.callOnPaid, (t2, payer, 5_000_000, 1, _work(41))));
        tb.setReenterOnTransfer(true);
        fr.callOnPaid(t2, payer, 5_000_000, 1000, _work(40));
        assertFalse(tb.reenterOk(), "re-entry refused");
        assertEq(tb.reenterRet(), abi.encodeWithSelector(TamArtV2.Reentrancy.selector), "refused BY the TAM lock");
        assertEq(t2.totalSupply(), 1);
        assertEq(tb.balanceOf(address(vault)), 1000);
    }

    /// CHANGED by the economy v2 pack: a codeless DEST is accepted at construction (predicted vault address). A codeless DEST that
    /// answers TBLOCK() (mocked) but not isGame() still takes no payment: the guard is the listing, not the token answer.
    function test_tamCtor_codelessDest_answeringTblock_neverPaid() public {
        address codeless = address(0xDE57);
        vm.mockCall(codeless, abi.encodeWithSignature("TBLOCK()"), abi.encode(address(tb)));
        vm.etch(codeless, bytes(""));
        assertEq(codeless.code.length, 0, "witness: no code at DEST");
        (bool ok, bytes memory ret) = codeless.staticcall(abi.encodeWithSignature("TBLOCK()"));
        assertTrue(ok); assertEq(abi.decode(ret, (address)), address(tb), "witness: the TBLOCK() answer is the right token");
        TamArtV2 t = new TamArtV2(address(router), dev, codeless, address(tb), address(usdc), address(rewards));
        _assertNotWired(t, 86);
    }

    /// expectedTblock == 0 with a router that answers TBLOCK() == 0 and code etched at address(0): the later "token has code"
    /// check passes, so only the expectedTblock == address(0) check refuses it.
    function test_tamCtor_rejectsZeroExpected_evenIfZeroHasCode() public {
        vm.etch(address(0), hex"00");
        assertGt(address(0).code.length, 0);
        FakeRouter fr = new FakeRouter(address(0), address(usdc));
        MockVault v0 = new MockVault(address(0));
        vm.expectRevert(TamArtV2.BadToken.selector);
        new TamArtV2(address(fr), dev, address(v0), address(0), address(usdc), address(rewards));
    }

    // ---------------------------------------------------------------- fuzz
    function testFuzz_pay_splitsAndKeepsNothing(uint256 price, uint16 bps) public {
        price = bound(price, 1, MAX);
        bps = uint16(bound(bps, 0, 1000));
        game.set(price, dev, bps, 0);
        uint256 devBefore = usdc.balanceOf(dev);
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 f = router.minOutFloor(price - price * bps / 10_000);
        uint256 out = _pay(address(game), price, f);
        uint256 devCut = price * bps / 10_000;
        assertEq(usdc.balanceOf(dev) - devBefore, devCut, "dev cut rounded down");
        assertEq(payerBefore - usdc.balanceOf(payer), price, "exact pull");
        assertEq(out, (price - devCut) * WPU * 25_000_000 * (1e6 - 13_000) / 1e6, "rest swapped");
        assertEq(tb.balanceOf(address(game)), out);
        (uint256 a, uint256 b, uint256 c) = _bals();
        assertEq(a + b + c, 0);
    }

    function testFuzz_revert_aboveMax(uint256 amt) public {
        amt = bound(amt, MAX + 1, type(uint128).max);
        game.set(amt, dev, 1000, 0);
        usdc.mint(payer, amt);
        vm.expectRevert(TblockPayRouter.AmountTooLarge.selector);
        _pay(address(game), amt, 1);
    }

    function testFuzz_revert_priceMismatch(uint256 amt) public {
        amt = bound(amt, 1, MAX);
        vm.assume(amt != 5_000_000);
        vm.expectRevert(TblockPayRouter.PriceMismatch.selector);
        _pay(address(game), amt, 1);
    }

    function testFuzz_revert_devBps(uint16 bps) public {
        bps = uint16(bound(bps, 1001, type(uint16).max));
        game.set(5_000_000, dev, bps, 0);
        vm.expectRevert(TblockPayRouter.DevBpsTooHigh.selector);
        _pay(address(game), 5_000_000, F5);
    }
}

/// invariant: whatever sequence of pays / gifts / failures happens, the router's balance of each token == what was gifted to it
contract RouterHandler is Test {
    TblockPayRouter router; MockGame game; MockERC20 usdc; MockERC20 wt; MockERC20 tb; MockAeroPool aero; MockPoolManager pm;
    uint256 public giftUsdc; uint256 public giftWt; uint256 public giftTb; uint256 public pays; uint256 public calls;
    constructor(TblockPayRouter r, MockGame g, MockERC20 u, MockERC20 w, MockERC20 t, MockAeroPool a, MockPoolManager p) {
        router = r; game = g; usdc = u; wt = w; tb = t; aero = a; pm = p;
        usdc.approve(address(router), type(uint256).max);
    }
    function pay(uint256 price, uint16 bps, uint256 minOut, uint8 mode) external {
        price = bound(price, 1, 60_000_000); bps = uint16(bound(bps, 0, 1200)); mode = uint8(bound(mode, 0, 4));
        game.set(price, address(0xD00D), bps, mode == 1 ? 0 : mode); // mode 1 (reenter) needs funding, covered by unit test
        if (mode == 3) usdc.mint(address(game), 1);
        usdc.mint(address(this), price);
        // mostly the floor (reachable), sometimes 0 (ZeroMinOut), floor - 1 (MinOutTooLow) or unreachable (InsufficientOutput)
        uint256 f = router.minOutFloor(price - price * bps / 10_000);
        minOut = minOut % 8 == 0 ? 0 : (minOut % 8 == 1 ? type(uint128).max : (minOut % 8 == 2 ? f - 1 : f));
        calls++;
        uint256 legMin = router.aeroLegMin(price - price * bps / 10_000);
        try router.pay(address(game), price, minOut, block.timestamp, "") {
            pays++;
            if (aero.lastOut() < legMin) badFills++;
        } catch (bytes memory e) { if (bytes4(e) == TblockPayRouter.AeroImpactTooHigh.selector) aeroRefused++; }
    }
    address public tam; uint256 public tamPays; uint256 nonce;
    function setTam(address t) external { require(tam == address(0), "once"); tam = t; } // the fuzzer calls it too: once only
    function payTam(uint256 minOut) external {
        usdc.mint(address(this), 5_000_000);
        minOut = minOut % 8 == 0 ? 0 : router.minOutFloor(4_500_000);
        bytes memory w = abi.encode(abi.encodePacked("TAM", uint8(1), uint8(8), uint8(0), uint8(0), ++nonce), bytes32(nonce), bytes(""));
        calls++;
        try router.pay(tam, 5_000_000, minOut, block.timestamp, w) { pays++; tamPays++; } catch {}
    }
    function setObserveReverts(bool b) external { aero.setObserveReverts(b); } // irrelevant since v4 (observe is never called): kept as noise
    function gift(uint8 which, uint256 a) external {
        a = bound(a, 1, 1e24);
        if (which % 3 == 0) { usdc.mint(address(router), a); giftUsdc += a; }
        else if (which % 3 == 1) { wt.mint(address(router), a); giftWt += a; }
        else { tb.mint(address(router), a); giftTb += a; }
    }
    uint256 public badFills; uint256 public aeroRefused; // pays that succeeded with a fill under aeroLegMin (must stay 0) / refused by the bound
    function setAeroShort(uint256 p) external { aero.setShortPpm(bound(p, 0, 30_000)); }
    function moveMarket(int24 aeroAfter, int24 v4After, uint256 take) external {
        aero.setTicks(-227335, -227335, int24(bound(aeroAfter, -227335 - 500, -227335 + 600)));
        pm.setTickAfter(int24(bound(v4After, 170391 - 400, 170391)));
        pm.setTake(bound(take, 0, 60_000));
    }
}

contract TblockPayRouterInvariant is RouterBase {
    RouterHandler h;
    function setUp() public override {
        super.setUp();
        h = new RouterHandler(router, game, usdc, wt, tb, aero, pm);
        h.setTam(address(tam));
        targetContract(address(h));
    }
    function invariant_routerBalancesEqualGifts() public view {
        assertEq(usdc.balanceOf(address(router)), h.giftUsdc());
        assertEq(wt.balanceOf(address(router)), h.giftWt());
        assertEq(tb.balanceOf(address(router)), h.giftTb());
    }
    function invariant_noFillUnderAeroLegMin() public view {
        assertEq(h.badFills(), 0);
    }
    function invariant_lockReleased() public view {
        // a stuck lock would make every later pay revert: the slot must read 1 between calls
        assertEq(uint256(vm.load(address(router), bytes32(uint256(0)))), 1);
    }
    function test_handlerCanPay() public {
        h.pay(5_000_000, 1000, 3, 0);
        assertEq(h.pays(), 1);
        h.payTam(1);
        assertEq(h.tamPays(), 1);
    }
    /// witness, outside the EVM state (which resets per run): one line per run with its successful pays and its calls
    function afterInvariant() public {
        vm.writeLine("scratch/invariant-witness.log", string.concat(vm.toString(h.pays()), " ", vm.toString(h.calls()), " ", vm.toString(h.tamPays()), " ", vm.toString(h.aeroRefused())));
    }
    function invariant_tamHoldsNothing() public view {
        assertEq(tb.balanceOf(address(tam)), 0);
        assertEq(tam.totalSupply(), h.tamPays(), "one TAM per successful TAM payment");
    }
}

/// a router stand-in for TamArtV2's constructor and onPaid (it has code and answers TBLOCK() / USDC()); no lock of its own
contract FakeRouter {
    address public TBLOCK; address public USDC;
    constructor(address t, address u) { TBLOCK = t; USDC = u; }
    function callOnPaid(TamArtV2 t, address payer, uint256 usdcIn, uint256 out, bytes calldata data) external {
        t.onPaid(payer, usdcIn, out, data); // a revert bubbles (Solidity high-level call)
    }
}
