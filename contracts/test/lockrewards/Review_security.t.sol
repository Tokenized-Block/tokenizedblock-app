// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {MockERC20, MockLock, MockPoolManager} from "./TBlockLockRewards.t.sol";
import {PlayGateBase} from "./PlayGateBase.sol";

/// Security review of TBlockLockRewards (2026-11-11). Each SEC test either proves a finding or proves a suspected attack does NOT work.
/// PLAY GATE port: _closeThrough makes every standard actor play once in each epoch that has not ended yet (P == W).
contract ReviewSecurityTest is PlayGateBase {
    MockERC20 tblock;
    MockERC20 wt;
    MockLock lock;
    MockPoolManager pm;
    TBlockLockRewards rw;

    address guardian = address(0x6A4D);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);
    address dave = address(0xDA7E);
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
    function _closeThrough(uint256 last) internal {
        for (uint256 e = rw.nextEpochToClose(); e <= last; e++) {
            if (block.timestamp >= T0 + (e + 1) * E) continue;
            if (block.timestamp < T0 + e * E) vm.warp(T0 + e * E);
            _play(alice); _play(bob); _play(carol); _play(dave); _play(stranger);
        }
        vm.warp(T0 + (last + 1) * E);
        for (uint256 e = rw.nextEpochToClose(); e <= last; e++) rw.closeEpoch(e);
    }

    // ================================================================ SEC-1 (MEDIUM, FIXED): a top-up used to inherit the OLD band
    // points.js resets the commitment at EVERY Locked event (line 47: `engage = e.t`), a top-up included. The contract used to keep
    // commitStart when unlockAt did not change, so a 1-TBLOCK "anchor" locked long ago let a whale out-weigh an identical fresh lock.
    // Fixed: enroll restarts commitStart when lockedOf grew. This test was red on the old contract (alice x2) and is green now.
    function test_SEC1_topUpRestartsBand() public {
        // T0: alice locks 1 TBLOCK until T0+400d -> x2
        lock.set(alice, 1e18, T0 + 400 days, 0);
        rw.enroll(alice);
        assertEq(rw.weightOf(alice, 1), 2e18);

        // T0+300d (epoch 10): alice tops up to 1,000,000 (v1 keeps the later stored date); bob locks the same amount, same date, fresh
        vm.warp(T0 + 300 days);
        lock.set(alice, 1_000_000e18, T0 + 400 days, 0);
        lock.set(bob, 1_000_000e18, T0 + 400 days, 0);
        rw.enroll(alice);
        rw.enroll(bob);

        // 100 days of commitment left for BOTH: points.js gives both x1.5, and so does the contract now
        assertEq(rw.weightOf(bob, 11), 1_500_000e18, "bob: fresh 100-day commitment = x1.5");
        assertEq(rw.weightOf(alice, 11), 1_500_000e18, "alice: the top-up restarted the band, no x2 from the 1-TBLOCK anchor");
        // the epoch alice was in when she topped up keeps her old (tiny) weight; the new weight starts next epoch
        assertEq(rw.weightOf(alice, 10), 2e18);

        // money effect: same capital, same lock end, same share
        wt.mint(address(rw), 700e18);
        _closeThrough(11);
        vm.prank(alice);
        (uint256 a,) = rw.claim(_one(11));
        vm.prank(bob);
        (uint256 b,) = rw.claim(_one(11));
        (uint256 p,) = rw.pot(11);
        assertEq(a, p / 2, "alice 50%");
        assertEq(b, p / 2, "bob 50%");
    }

    // ================================================================ SEC-2 (LOW, FIXED): after a rescue cut, the remaining claimants raced
    // The old _share = floor((pot - cut) * w / W) capped by left: claims made BEFORE the cut were paid on the full pot, so the first
    // claimant after the cut was paid in full and the last got 0. Fixed: after a cut, what is left is shared pro-rata over the weight
    // that has not claimed yet. Red on the old contract (bob 10, carol 0), green now (5 / 5).
    function test_SEC2_postRescueClaimSplitFairly() public {
        lock.set(alice, 2000e18, T0 + 100 days, 0); // x1.5 -> 3000
        lock.set(bob, 1000e18, T0 + 100 days, 0);   // 1500
        lock.set(carol, 1000e18, T0 + 100 days, 0); // 1500
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        wt.mint(address(rw), 400e18);
        _closeThrough(1); // pot 100, unassigned 300, W 6000

        vm.prank(alice);
        (uint256 a,) = rw.claim(_one(1)); // 50 on the full pot
        assertEq(a, 50e18);

        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, 340e18); // 300 unassigned + 40 cut from epoch 1 (left 50 -> 10)
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute();
        (uint256 c,) = rw.cut(1);
        assertEq(c, 40e18);

        vm.prank(bob);
        (uint256 b,) = rw.claim(_one(1));   // 10 left over 3000 unclaimed weight: 1500 -> 5
        vm.prank(carol);
        (uint256 k,) = rw.claim(_one(1));   // same weight as bob: 5
        assertEq(b, 5e18, "post-cut share is pro-rata over the unclaimed weight");
        assertEq(k, 5e18, "equal weight, equal amount, whatever the order");
        (uint256 l,) = rw.left(1);
        assertEq(l, 0);
    }

    // ================================================================ NOT A BUG: flash-lock around closeEpoch
    // Weight is written from currentEpoch()+1 (l.267), so a lock + enroll made during epoch e adds nothing to e; to count in e+1 the
    // lock must also cover the whole of e+1 (lastFull), and TBlockLock v1 cannot release it before unlockAt.
    function test_SEC_notABug_flashLockAroundClose() public {
        lock.set(alice, 1000e18, T0 + 400 days, 0);
        rw.enroll(alice);
        wt.mint(address(rw), 100e18);
        // attacker locks a huge amount 1 second before epoch 1 ends, then closes epoch 1 right after it ends
        vm.warp(T0 + 2 * E - 1);
        lock.set(dave, 1_000_000e18, T0 + 2 * E + 7 days, 0); // v1 MIN_LOCK 7 days
        rw.enroll(dave);
        assertEq(rw.weightOf(dave, 1), 0, "nothing in the epoch being closed");
        assertEq(rw.weightOf(dave, 2), 0, "epoch 2 ends after his unlockAt: no weight either");
        _closeThrough(1);
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NoWeight.selector, uint256(1)));
        rw.claim(_one(1));
    }

    // ================================================================ NOT A BUG: a stranger cannot strip or lower a holder's weight
    function test_SEC_notABug_strangerSyncEnrollHarmless() public {
        lock.set(alice, 1000e18, T0 + 400 days, 0);
        vm.prank(alice);
        rw.enroll(alice);
        vm.warp(T0 + 45 days);
        vm.startPrank(stranger);
        rw.sync(alice);
        rw.enroll(alice);
        rw.sync(alice);
        vm.stopPrank();
        assertEq(rw.weightOf(alice, 1), 2000e18);
        assertEq(rw.weightOf(alice, 2), 2000e18);
        assertEq(rw.weightOf(alice, 12), 2000e18);
    }

    // ================================================================ NOT A BUG: exit request -> sync -> cancel -> enroll keeps deltas exact
    function test_SEC_notABug_requestCancelCycleNoDrift() public {
        lock.set(alice, 1000e18, T0 + 400 days, 0);
        lock.set(bob, 500e18, T0 + 400 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        for (uint256 i = 1; i <= 6; i++) {
            vm.warp(T0 + i * E + 1 days);
            lock.set(alice, 1000e18, T0 + 400 days, block.timestamp); // request
            rw.sync(alice);
            lock.set(alice, 1000e18, T0 + 400 days, 0);               // cancel
            rw.enroll(alice);
            rw.enroll(bob);
        }
        _closeThrough(8);
        // epochs 1..6: alice lost the epoch of each request; bob always counted
        for (uint256 e = 1; e <= 8; e++) {
            uint256 expect = rw.weightOf(alice, e) + rw.weightOf(bob, e);
            assertEq(rw.totalWeight(e), expect, "totalWeight == sum of weights");
        }
        assertEq(rw.weightOf(alice, 3), 0);
        assertEq(rw.weightOf(alice, 7), 2000e18);
    }

    // ================================================================ NOT A BUG: conservation under rescue + claims + release, any order
    function testFuzz_SEC_conservationWithRescue(uint96 fund, uint96 rescueAmt, uint8 order, bool claimBeforeRescue) public {
        vm.assume(fund > 100 && rescueAmt > 0);
        lock.set(alice, 3000e18, T0 + 200 days, 0);
        lock.set(bob, 1000e18, T0 + 400 days, 0);
        lock.set(carol, 7e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        wt.mint(address(rw), fund);
        tblock.mint(address(rw), uint256(fund) * 3);
        _closeThrough(2);

        address[3] memory hs = [alice, bob, carol];
        uint256 paid0;
        if (claimBeforeRescue) {
            address h = hs[order % 3];
            if (rw.weightOf(h, 1) > 0) { vm.prank(h); (uint256 x,) = rw.claim(_one(1)); paid0 += x; }
        }
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, rescueAmt);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute();

        for (uint256 j = 0; j < 3; j++) {
            address h = hs[(order + j) % 3];
            for (uint256 e = 1; e <= 2; e++) {
                if (rw.weightOf(h, e) == 0 || rw.claimed(h, e)) continue;
                vm.prank(h);
                (uint256 x,) = rw.claim(_one(e)); // must never revert
                paid0 += x;
            }
        }
        (uint256 o0,) = rw.outstanding();
        uint256 bal = wt.balanceOf(address(rw));
        assertGe(bal, o0, "balance covers outstanding");
        assertEq(paid0 + wt.balanceOf(guardian) + bal, fund, "every unit accounted for");
        // release everything; outstanding must return to exactly 0
        vm.warp(T0 + 10 * E);
        _closeThrough(8);
        // ECO-3 fix: epochs 3..8 were closed late, at T0 + 9E; release waits CLAIM_WINDOW epochs from the close
        vm.warp(T0 + 9 * E + 3 * E);
        while (rw.nextEpochToRelease() < 6) rw.release();
        (uint256 o0b,) = rw.outstanding();
        uint256 sumLeft;
        for (uint256 e = 6; e <= 8; e++) { (uint256 l,) = rw.left(e); sumLeft += l; }
        assertEq(o0b, sumLeft, "outstanding == sum of left over open epochs");
    }

    // ================================================================ NOT A BUG: unlockCallback cannot be driven from outside a redeem
    function test_SEC_notABug_unlockCallbackGated() public {
        wt.mint(address(pm), 5e18);
        pm.mint(address(rw), uint256(uint160(address(wt))), 5e18);
        // even the PoolManager address cannot call it outside redeemDeferred (_redeeming == false)
        vm.prank(address(pm));
        vm.expectRevert(TBlockLockRewards.NotPoolManager.selector);
        rw.unlockCallback(abi.encode(address(wt), uint256(5e18)));
    }

    // ================================================================ INFO-1 (FIXED): t0 far in the past was accepted
    // t0 = 0 started nextEpochToClose at 0 while currentEpoch was ~694: about 694 empty closeEpoch transactions before rewards worked.
    // Fixed: the constructor refuses a t0 more than one EPOCH before deploy. Red on the old contract (deployed), green now (reverts).
    function test_SEC_info_t0FarPastRefused() public {
        address[] memory gs = _games(address(game));
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        new TBlockLockRewards(address(tblock), address(wt), address(lock), address(pm), guardian, 0, 1e30, 1e40, gs);
    }
}
