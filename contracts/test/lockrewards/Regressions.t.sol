// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {MockERC20, MockLock, MockPoolManager} from "./TBlockLockRewards.t.sol";
import {PlayGateBase} from "./PlayGateBase.sol";

/// One regression test (or more) per fix applied from the 2026-11-11 security and economics reviews.
/// PLAY GATE port: where an epoch's pot or claims are checked, every holder of that epoch plays once during it (P == W).
contract RegressionsTest is PlayGateBase {
    MockERC20 tblock;
    MockERC20 wt;
    MockLock lock;
    MockPoolManager pm;
    TBlockLockRewards rw;

    address guardian = address(0x6A4D);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);
    address stranger = address(0x5157);

    uint256 constant T0 = 1_800_000_000;
    uint256 constant E = 30 days;

    function setUp() public {
        vm.warp(T0);
        tblock = new MockERC20();
        wt = new MockERC20();
        lock = new MockLock(address(tblock));
        pm = new MockPoolManager();
        (rw, game) = _deployRewards(address(tblock), address(wt), address(lock), address(pm), guardian, T0, 1e30, 1e40);
    }

    function _one(uint256 e) internal pure returns (uint256[] memory a) { a = new uint256[](1); a[0] = e; }

    function _covered(address h) internal view returns (uint256 n) {
        TBlockLockRewards.Checkpoint[] memory c = rw.checkpointsOf(h);
        for (uint256 i = 0; i < c.length; i++) n += uint256(c[i].lastEpoch) - uint256(c[i].fromEpoch) + 1;
    }

    // ------------------------------------------------------------------------------------------------ SEC-1 / ECO-2
    /// A top-up (same date, more TBLOCK) restarts commitStart; a re-enroll with nothing changed does not.
    function test_REG_SEC1_topUpRestartsCommitStart_noChangeKeepsIt() public {
        lock.set(alice, 1000e18, T0 + 400 days, 0);
        rw.enroll(alice);
        (uint64 u0, uint64 c0, uint128 a0) = rw.enrollmentOf(alice);
        assertEq(u0, T0 + 400 days);
        assertEq(c0, T0);
        assertEq(a0, 1000e18);

        vm.warp(T0 + 100 days);
        vm.prank(stranger);
        rw.enroll(alice); // nothing changed in TBlockLock
        (, uint64 c1,) = rw.enrollmentOf(alice);
        assertEq(c1, T0, "no change: commitStart kept, stranger cannot lower the band");
        assertEq(rw.weightOf(alice, 5), 2000e18);

        lock.set(alice, 1000e18 + 1, T0 + 400 days, 0); // top-up of 1 wei, date kept (TBlockLock v1 lock())
        rw.enroll(alice);
        (, uint64 c2, uint128 a2) = rw.enrollmentOf(alice);
        assertEq(c2, T0 + 100 days, "top-up restarts commitStart");
        assertEq(a2, 1000e18 + 1);
        // 300 days left -> x1.75, as points.js would show after a Locked event at day 100
        assertEq(rw.weightOf(alice, 5), uint256(1000e18 + 1) * 17_500 / 10_000);
        assertEq(rw.weightOf(alice, 3), 2000e18, "the current epoch keeps its old weight");
    }

    /// For any top-up moment, the topped-up holder weighs exactly what a fresh locker of the same total and date weighs.
    function testFuzz_REG_SEC1_topUpEqualsFreshLock(uint256 topUpAt, uint96 anchor, uint96 added) public {
        uint256 unlockAt = T0 + 400 days;
        topUpAt = bound(topUpAt, T0 + 1, unlockAt - 61 days);
        vm.assume(anchor > 0 && added > 0);
        lock.set(alice, anchor, unlockAt, 0);
        rw.enroll(alice);

        vm.warp(topUpAt);
        uint256 total = uint256(anchor) + added;
        lock.set(alice, total, unlockAt, 0);
        lock.set(bob, total, unlockAt, 0);
        rw.enroll(alice);
        rw.enroll(bob);
        uint256 next = rw.currentEpoch() + 1;
        assertEq(rw.weightOf(alice, next), rw.weightOf(bob, next), "top-up == fresh lock");
        assertEq(rw.weightOf(alice, next), total * rw.multiplierBps(unlockAt - topUpAt) / 10_000);
    }

    // ------------------------------------------------------------------------------------------------ SEC-2
    /// After a cut, equal unclaimed weights get the same amount (within 1 wei) in either claim order.
    function testFuzz_REG_SEC2_postCutOrderIndependent(uint96 fund, uint96 cutExtra, bool bobFirst) public {
        vm.assume(fund > 1000);
        lock.set(alice, 2000e18, T0 + 100 days, 0);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        lock.set(carol, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        wt.mint(address(rw), fund);
        vm.warp(T0 + E);
        _play(alice); _play(bob); _play(carol);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(alice);
        rw.claim(_one(1));
        (uint256 leftBefore,) = rw.left(1);
        uint256 free = rw.unassigned(address(wt));
        uint256 cutAmt = bound(uint256(cutExtra), 0, leftBefore);
        if (free + cutAmt == 0) return;
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, free + cutAmt);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute();

        (address first, address second) = bobFirst ? (bob, carol) : (carol, bob);
        vm.prank(first);
        (uint256 x,) = rw.claim(_one(1));
        vm.prank(second);
        (uint256 y,) = rw.claim(_one(1));
        assertLe(x > y ? x - y : y - x, 1, "equal weights, equal amounts");
        assertLe(x + y, leftBefore - cutAmt, "never more than what is left");
    }

    /// Without any cut the share is still exactly floor(pot * w / W): the fix changes nothing there.
    function test_REG_SEC2_noCutSharesUnchanged() public {
        lock.set(alice, 3, T0 + 100 days, 0);
        lock.set(bob, 5, T0 + 100 days, 0);
        lock.set(carol, 7, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        wt.mint(address(rw), 4_000_003);
        vm.warp(T0 + E);
        _play(alice); _play(bob); _play(carol);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        (uint256 p,) = rw.pot(1);
        uint256 W = rw.totalWeight(1);
        address[3] memory hs = [carol, alice, bob];
        uint256 paid;
        for (uint256 i = 0; i < 3; i++) {
            uint256 w = rw.weightOf(hs[i], 1);
            vm.prank(hs[i]);
            (uint256 x,) = rw.claim(_one(1));
            assertEq(x, p * w / W, "plain floor pro-rata");
            paid += x;
        }
        (uint256 l,) = rw.left(1);
        assertEq(l, p - paid, "rounding dust stays in the epoch");
        assertEq(rw.claimedWeight(1), W);
    }

    // ------------------------------------------------------------------------------------------------ ECO-3
    /// release() waits CLAIM_WINDOW * EPOCH from the close, to the second; a timely close keeps the old schedule.
    function test_REG_ECO3_releaseCountsFromClose() public {
        lock.set(alice, 1000e18, T0 + 65 days, 0);
        rw.enroll(alice);
        wt.mint(address(rw), 100e18);

        // late close: 4 epochs late
        uint256 closeAt = T0 + 5 * E + 123;
        vm.warp(closeAt);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        assertEq(rw.closedAt(1), closeAt);
        vm.warp(closeAt + 3 * E - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.ReleaseTooEarly.selector, uint256(0)));
        rw.release();
        vm.warp(closeAt + 3 * E);
        rw.release(); // epoch 0
        rw.release(); // epoch 1, a full window after its close
        assertEq(rw.nextEpochToRelease(), 2);
    }

    function test_REG_ECO3_timelyCloseSameScheduleAsBefore() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        wt.mint(address(rw), 100e18);
        vm.warp(T0 + E);
        rw.closeEpoch(0); // closed at its end
        vm.warp(T0 + 4 * E - 1); // old rule: currentEpoch 3 <= 0 + 3 -> too early
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.ReleaseTooEarly.selector, uint256(0)));
        rw.release();
        vm.warp(T0 + 4 * E); // old rule: currentEpoch 4 > 3 -> allowed; new rule: closedAt + 3E == T0 + 4E -> allowed
        rw.release();
    }

    // ------------------------------------------------------------------------------------------------ INFO-1
    function test_REG_INFO1_t0Bound() public {
        vm.warp(T0 + 400 days);
        _deployRewards(address(tblock), address(wt), address(lock), address(pm), guardian, block.timestamp - E, 1, 1);
        address[] memory gs = _games(address(game));
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        new TBlockLockRewards(address(tblock), address(wt), address(lock), address(pm), guardian, block.timestamp - E - 1, 1, 1, gs);
    }

    // ------------------------------------------------------------------------------------------------ ECO-1 (UI support view)
    /// rewardEpochsFor(unlockAt) tells the UI, before the lock, exactly which epochs enroll() would pay.
    function testFuzz_REG_ECO1_rewardEpochsForMatchesEnroll(uint256 offset, uint8 pick) public {
        offset = bound(offset, 0, E - 1);
        vm.warp(T0 + 3 * E + offset);
        uint256[4] memory durations = [uint256(7 days), 30 days, 90 days, 365 days];
        uint256 d = durations[pick % 4];
        uint256 unlockAt = block.timestamp + d;
        (uint256 first, uint256 last, uint256 count) = rw.rewardEpochsFor(unlockAt);
        lock.set(alice, 1000e18, unlockAt, 0);
        rw.enroll(alice);
        assertEq(count, _covered(alice), "count == epochs enroll() wrote");
        if (count > 0) {
            assertGt(rw.weightOf(alice, first), 0);
            assertGt(rw.weightOf(alice, last), 0);
            assertEq(rw.weightOf(alice, last + 1), 0);
            assertEq(first, rw.currentEpoch() + 1);
        }
        if (d == 7 days) assertEq(count, 0, "a 7-day lock never earns");
        if (d == 30 days && offset != 0) assertEq(count, 0, "a 30-day lock off a boundary earns nothing");
    }
}
