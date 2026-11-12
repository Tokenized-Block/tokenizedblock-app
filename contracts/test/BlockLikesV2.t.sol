// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockLikesV2} from "../src/BlockLikesV2.sol";
import {TBlockLock} from "../src/TBlockLock.sol";

/// @dev minimal token: balances, allowances, transferFrom; mode 1 moves half to 0x...dEaD (fee-on-transfer), mode 2 returns false
contract V2Token {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public mode;
    address constant DEAD_ = 0x000000000000000000000000000000000000dEaD;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setMode(uint8 m) external { mode = m; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance");
        allowance[f][msg.sender] -= a;
        if (to == DEAD_ && mode == 2) return false;
        uint256 moved = (to == DEAD_ && mode == 1) ? a / 2 : a;
        require(balanceOf[f] >= a, "balance");
        balanceOf[f] -= a; balanceOf[to] += moved;
        return true;
    }
    function transfer(address to, uint256 a) external returns (bool) { require(balanceOf[msg.sender] >= a, "balance"); balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
}

contract BlockLikesV2Test is Test {
    V2Token t;
    TBlockLock K_;
    BlockLikesV2 L;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant BLK = address(uint160((uint256(0xb2000000000000000000) << 80) | 0xba9bf8330307f8830e));
    address A = address(0xA11CE); address K = address(0x4EE9E7); address D1 = address(0xD1D1); address D2 = address(0xD2D2);
    uint256 constant P0 = 5_000_000_000_000;          // $0.000005 per TBLOCK, 1e18-scaled
    uint256 constant FLOOR = 100_000_000_000;         // $0.0000001
    uint256 constant CEIL = P0 * 100;                 // the construction cap is start x 100 (review SEC-001)
    uint64 G;

    function cfg() internal view returns (BlockLikesV2.Config memory c) {
        c = BlockLikesV2.Config({ tblock: address(t), lock: address(K_), genesis: G, epoch: 7 days, likeUsdE18: 5e17, holdUsdE18: 15e18,
            priceFloor: FLOOR, priceCeil: CEIL, startPrice: P0, maxStepBps: 1_000, minInterval: 3600, keeper: K, dev: D1, dev2: D2,
            rewards: address(0x8E7A8D) });
    }
    function setUp() public {
        vm.warp(1_800_000_000);
        G = uint64(block.timestamp);
        t = new V2Token();
        K_ = new TBlockLock(address(t));
        L = new BlockLikesV2(cfg());
    }
    /// `pay` in the wallet for hearts, `locked` locked for 30 days (the holder stage)
    function fund(address who, uint256 pay, uint256 locked) internal {
        t.mint(who, pay + locked);
        vm.startPrank(who);
        t.approve(address(L), type(uint256).max);
        if (locked > 0) { t.approve(address(K_), locked); K_.lock(locked, block.timestamp + 30 days); }
        vm.stopPrank();
    }

    /* ── dollar prices ── */
    function test_prices_in_dollars() public view {
        assertEq(L.likePrice(), 100_000e18, "$0.50 at $0.000005 = 100,000 TBLOCK");
        assertEq(L.minHold(), 3_000_000e18, "$15 at $0.000005 = 3,000,000 TBLOCK");
    }
    function test_prices_round_up_never_under_the_dollar() public {
        vm.warp(block.timestamp + 3600);
        vm.prank(K); L.setPrice(P0 * 9 / 10 + 7);
        uint256 lp = L.likePrice();
        assertGe(lp * (P0 * 9 / 10 + 7), 5e17 * 1e18, "a heart is never worth less than $0.50");
        assertLt((lp - 1) * (P0 * 9 / 10 + 7), 5e17 * 1e18, "and never one raw unit more than needed");
    }
    function test_price_up_heart_cheaper_in_tblock() public {
        uint256 before = L.likePrice();
        vm.warp(block.timestamp + 3600); vm.prank(K); L.setPrice(P0 * 110 / 100);
        assertLt(L.likePrice(), before);
        assertLt(L.minHold(), 3_000_000e18);
    }

    /* ── like: paid from the wallet, the hold is LOCKED ── */
    function test_like_burns_dollar_price_and_counts() public {
        fund(A, 100_000e18, 3_000_000e18);
        vm.prank(A); L.like(BLK, 1);
        assertEq(t.balanceOf(DEAD), 100_000e18);
        assertEq(L.likesOf(BLK), 1);
        assertEq(L.spentIn(0, A), 100_000e18);
        assertEq(L.topOf(0), A);
        assertEq(K_.lockedOf(A), 3_000_000e18, "the lock is untouched: hearts are paid from the wallet");
    }
    function test_like_refused_below_the_locked_hold() public {
        fund(A, 10_000_000e18, 2_999_999e18);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.HoldTooLow.selector, 2_999_999e18, 3_000_000e18));
        L.like(BLK, 1);
    }
    function test_a_big_wallet_without_a_lock_is_refused() public {
        fund(A, 50_000_000e18, 0);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.HoldTooLow.selector, 0, 3_000_000e18));
        L.like(BLK, 1);
    }
    function test_exit_requested_or_expired_lock_is_refused() public {
        fund(A, 1_000_000e18, 3_000_000e18);
        vm.prank(A); K_.requestWithdraw();
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.HoldTooLow.selector, 0, 3_000_000e18)); L.like(BLK, 1);
        vm.prank(A); K_.cancelWithdraw();
        vm.prank(A); L.like(BLK, 1);
        vm.warp(block.timestamp + 31 days); /* the 30-day lock date passed: activeLockedOf = 0 */
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.HoldTooLow.selector, 0, 3_000_000e18)); L.like(BLK, 1);
    }
    function test_like_refuses_short_payment_and_false_return() public {
        fund(A, 10_000_000e18, 3_000_000e18);
        t.setMode(1); vm.prank(A); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.PaymentShort.selector, 100_000e18, 50_000e18)); L.like(BLK, 1);
        t.setMode(2); vm.prank(A); vm.expectRevert(BlockLikesV2.TransferFailed.selector); L.like(BLK, 1);
    }
    function test_like_refuses_non_block_and_bad_count() public {
        fund(A, 10_000_000e18, 3_000_000e18);
        vm.prank(A); vm.expectRevert(BlockLikesV2.NotABlock.selector); L.like(address(0xBEEF), 1);
        vm.prank(A); vm.expectRevert(BlockLikesV2.BadCount.selector); L.like(BLK, 0);
        vm.prank(A); vm.expectRevert(BlockLikesV2.BadCount.selector); L.like(BLK, 1001);
    }

    /* ── the keeper's price is bounded ── */
    function test_only_keeper_sets_price() public {
        vm.warp(block.timestamp + 3600);
        vm.prank(A); vm.expectRevert(BlockLikesV2.NotKeeper.selector); L.setPrice(P0);
        vm.prank(D1); vm.expectRevert(BlockLikesV2.NotKeeper.selector); L.setPrice(P0);
    }
    function test_price_once_per_interval() public {
        vm.prank(K); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.TooSoon.selector, block.timestamp + 3600)); L.setPrice(P0);
        vm.warp(block.timestamp + 3599); vm.prank(K); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.TooSoon.selector, block.timestamp + 1)); L.setPrice(P0);
        vm.warp(block.timestamp + 1); vm.prank(K); L.setPrice(P0);
    }
    function test_price_step_bounded_both_ways() public {
        vm.warp(block.timestamp + 3600);
        vm.prank(K); L.setPrice(P0 * 110 / 100);
        vm.warp(block.timestamp + 3600);
        uint256 cur = L.price();
        vm.prank(K); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.StepTooLarge.selector, cur, cur * 11_001 / 10_000)); L.setPrice(cur * 11_001 / 10_000);
        vm.prank(K); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.StepTooLarge.selector, cur, cur * 8_999 / 10_000)); L.setPrice(cur * 8_999 / 10_000);
        vm.prank(K); L.setPrice(cur * 90 / 100);
    }
    function test_price_floor_and_ceiling() public {
        BlockLikesV2.Config memory c = cfg(); c.startPrice = FLOOR; c.priceCeil = FLOOR * 100;
        BlockLikesV2 L2 = new BlockLikesV2(c);
        vm.warp(block.timestamp + 3600);
        vm.prank(K); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.OutOfBounds.selector, FLOOR - 1)); L2.setPrice(FLOOR - 1);
    }

    /* ── keeper replacement ── */
    function test_keeper_change_needs_dev_and_delay() public {
        address N = address(0x2EE9);
        vm.prank(A); vm.expectRevert(BlockLikesV2.NotDev.selector); L.announceKeeper(N);
        vm.prank(D1); L.announceKeeper(N);
        vm.prank(D2); vm.expectRevert(abi.encodeWithSelector(BlockLikesV2.TooSoon.selector, block.timestamp + 2 days)); L.applyKeeper();
        vm.warp(block.timestamp + 2 days); vm.prank(D2); L.applyKeeper();
        assertEq(L.keeper(), N);
        vm.warp(block.timestamp + 3600);
        vm.prank(K); vm.expectRevert(BlockLikesV2.NotKeeper.selector); L.setPrice(P0);
        vm.prank(N); L.setPrice(P0);
    }
    function test_keeper_renounce_is_final() public {
        vm.prank(D2); L.renounceKeeperChanges();
        vm.prank(D1); vm.expectRevert(BlockLikesV2.Renounced.selector); L.announceKeeper(address(0x2EE9));
        vm.prank(D1); vm.expectRevert(BlockLikesV2.Renounced.selector); L.renounceKeeperChanges();
    }
    function test_cancel_keeper() public {
        vm.prank(D1); L.announceKeeper(address(0x2EE9));
        vm.prank(D2); L.cancelKeeper();
        vm.warp(block.timestamp + 2 days);
        vm.prank(D1); vm.expectRevert(BlockLikesV2.NothingAnnounced.selector); L.applyKeeper();
    }

    /* ── constructor bounds ── */
    function test_constructor_guards() public {
        BlockLikesV2.Config memory c;
        c = cfg(); c.startPrice = CEIL + 1; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.maxStepBps = 1_001; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.minInterval = 3599; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.dev2 = D1; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.keeper = address(0); vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.priceFloor = 0; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.lock = address(0); vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.holdUsdE18 = 0; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);            /* SEC-003 */
        c = cfg(); c.priceCeil = P0 * 100 + 1; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);    /* SEC-001 range */
        c = cfg(); c.priceFloor = P0 / 100 - 1; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.lock = address(0xDEAD); vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
    }

    /* review DT-1 (2026-11-11): the keeper is never a dev, at construction and at every replacement */
    function test_DT1_keeper_is_never_a_dev() public {
        BlockLikesV2.Config memory c;
        c = cfg(); c.keeper = D2; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.keeper = D1; vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); new BlockLikesV2(c); /* control: a third key deploys */
        vm.prank(D1); vm.expectRevert(BlockLikesV2.BadParams.selector); L.announceKeeper(D2);
        vm.prank(D2); vm.expectRevert(BlockLikesV2.BadParams.selector); L.announceKeeper(D1);
        vm.prank(D1); vm.expectRevert(BlockLikesV2.BadParams.selector); L.announceKeeper(D1);
        vm.prank(D1); L.announceKeeper(address(0x2EE9)); /* control */
        assertEq(L.nextKeeper(), address(0x2EE9));
    }

    /* review DT-4 (2026-11-11): two tokens are named TBLOCK; the lock must lock the token the hearts burn */
    function test_DT4_lock_on_another_tblock_refused() public {
        V2Token other = new V2Token();
        TBlockLock otherLock = new TBlockLock(address(other));
        BlockLikesV2.Config memory c = cfg(); c.lock = address(otherLock);
        vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.tblock = address(other);
        vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
        c = cfg(); c.tblock = address(other); c.lock = address(otherLock);
        BlockLikesV2 ok = new BlockLikesV2(c); /* control: a lock of the same token deploys */
        assertEq(ok.TBLOCK(), address(other));
    }

    /* review SEC-001: a stolen keeper is stopped in ONE dev tx, the price back to the start; only a new keeper unfreezes */
    function test_dev_freezes_and_resets_a_hostile_keeper() public {
        uint256 t0 = block.timestamp;
        for (uint256 i = 0; i < 5; i++) { vm.warp(t0 + (i + 1) * 3600); uint256 nouveau = L.price() * 90 / 100; vm.prank(K); L.setPrice(nouveau); }
        assertLt(L.price(), P0);
        vm.prank(A); vm.expectRevert(BlockLikesV2.NotDev.selector); L.freezePrice(true);
        vm.prank(D2); L.freezePrice(true);
        assertEq(L.price(), P0, "back to the start price");
        vm.warp(block.timestamp + 3600);
        vm.prank(K); vm.expectRevert(BlockLikesV2.Frozen.selector); L.setPrice(P0);
        vm.prank(D1); L.announceKeeper(address(0x2EE9));
        vm.warp(block.timestamp + 2 days); vm.prank(D1); L.applyKeeper();
        assertFalse(L.frozen(), "a new keeper unfreezes");
        vm.prank(address(0x2EE9)); L.setPrice(P0 * 105 / 100);
    }
    function test_freeze_without_reset_keeps_the_price_and_works_after_renounce() public {
        vm.warp(block.timestamp + 3600); vm.prank(K); L.setPrice(P0 * 105 / 100);
        vm.prank(D1); L.renounceKeeperChanges();
        vm.prank(D1); L.freezePrice(false);
        assertEq(L.price(), P0 * 105 / 100); assertTrue(L.frozen());
        vm.warp(block.timestamp + 3600); vm.prank(K); vm.expectRevert(BlockLikesV2.Frozen.selector); L.setPrice(P0);
    }
    function test_epoch_views_like_v1() public view {
        assertEq(L.epochAt(G - 1), 0);
        assertEq(L.epochAt(G + 7 days), 1);
        assertEq(L.epochEnd(0), uint256(G) + 7 days);
        assertEq(L.currentEpoch(), 0);
    }

    function testFuzz_heart_always_worth_at_least_half_a_dollar(uint256 p) public {
        p = bound(p, P0 * 90 / 100, P0 * 110 / 100);
        vm.warp(block.timestamp + 3600); vm.prank(K); L.setPrice(p);
        assertGe(L.likePrice() * p, 5e17 * 1e18);
        assertGe(L.minHold() * p, 15e18 * 1e18);
    }
}
