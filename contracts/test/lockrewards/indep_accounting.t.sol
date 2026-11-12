// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {MockERC20, MockLock, MockPoolManager} from "./TBlockLockRewards.t.sol";
import {PlayGateBase, MockGame} from "./PlayGateBase.sol";

/// Independent accounting review (2026-11-11). Local forge only, mocks only, nothing signed or sent anywhere.
contract IndepAccountingTest is PlayGateBase {
    MockERC20 tblock;
    MockERC20 wt;
    MockLock lock;
    MockPoolManager pm;
    TBlockLockRewards rw;

    address guardian = address(0x6A4D);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA201);
    address dave = address(0xDA5E);

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
    function _two(uint256 e, uint256 f) internal pure returns (uint256[] memory a) { a = new uint256[](2); a[0] = e; a[1] = f; }
    function _fund(uint256 w, uint256 t) internal { wt.mint(address(rw), w); tblock.mint(address(rw), t); }

    function _conserved(string memory tag) internal view {
        (uint256 o0, uint256 o1) = rw.outstanding();
        assertEq(wt.balanceOf(address(rw)), rw.unassigned(address(wt)) + o0, string.concat(tag, ": wt bal == unassigned + outstanding"));
        assertEq(tblock.balanceOf(address(rw)), rw.unassigned(address(tblock)) + o1, string.concat(tag, ": tb bal == unassigned + outstanding"));
        uint256 s0;
        uint256 s1;
        for (uint256 e = rw.nextEpochToRelease(); e < rw.nextEpochToClose(); e++) {
            (uint256 l0, uint256 l1) = rw.left(e);
            s0 += l0; s1 += l1;
        }
        assertEq(s0, o0, string.concat(tag, ": sum left == outstanding (wt)"));
        assertEq(s1, o1, string.concat(tag, ": sum left == outstanding (tb)"));
    }

    // ============================================================ F1: an exit request is enforced only if a third party syncs
    /// Alice asks to exit at the start of epoch 1, then plays. The rule says her weight leaves epoch 1. Two worlds from one snapshot:
    /// (A) nobody syncs: Alice is paid for epoch 1 and Bob (who did not ask to exit) is diluted by her weight;
    /// (B) Bob syncs her: Alice gets 0, Bob gets more. Same chain state, payout decided by who sent sync().
    function test_F1_exitRequest_paidUnlessSomeoneSyncs() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E + 1);
        lock.set(alice, 1000e18, T0 + 100 days, block.timestamp); // requestWithdraw() in epoch 1
        _play(alice);
        _play(bob);
        uint256 snap = vm.snapshotState();

        // (A) nobody syncs
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0); rw.closeEpoch(1);
        vm.prank(alice); (uint256 aA,) = rw.claim(_one(1));
        vm.prank(bob); (uint256 bA,) = rw.claim(_one(1));
        console2.log("F1 A (no sync): alice (exit requested) paid wt", aA);
        console2.log("F1 A (no sync): bob paid wt", bA);

        // (B) Bob syncs Alice during epoch 1
        vm.revertToState(snap);
        vm.prank(bob); rw.sync(alice);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0); rw.closeEpoch(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NoWeight.selector, uint256(1)));
        rw.claim(_one(1));
        vm.prank(bob); (uint256 bB,) = rw.claim(_one(1));
        console2.log("F1 B (bob synced alice): alice paid wt 0, bob paid wt", bB);

        assertGt(aA, 0, "A: exit-requested alice paid for the epoch the rule removes");
        assertGt(bB, bA, "B: bob earns more only if he spends gas to sync alice");
    }

    // ============================================================ F2: requesting exit 7 days before unlock (the earliest useful moment)
    /// TBlockLock v1: withdrawableAt = max(requestedAt + 7 days, unlockAt). A holder whose lock ends at the end of epoch 2 asks 7 days
    /// before it, so that he can leave AT unlockAt. That request frees nothing earlier (the principal stays locked to the end of epoch 2),
    /// yet sync() removes his weight from epoch 2 - the epoch his locked TBLOCK fully backs.
    function test_F2_exitRequestBeforeUnlock_losesEpochStillBacked() public {
        uint256 unlockAt = T0 + 3 * E; // lastFull = epoch 2
        lock.set(alice, 1000e18, unlockAt, 0);
        lock.set(bob, 1000e18, unlockAt, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 1000e18);
        vm.warp(T0 + 2 * E + 1);
        _play(alice); _play(bob);
        vm.warp(unlockAt - 7 days);
        uint256 withdrawableAt = (block.timestamp + 7 days) > unlockAt ? block.timestamp + 7 days : unlockAt; // TBlockLock v1 formula
        assertEq(withdrawableAt, unlockAt, "the request frees nothing before unlockAt");
        lock.set(alice, 1000e18, unlockAt, block.timestamp);
        rw.sync(alice); // anyone
        vm.warp(unlockAt);
        rw.closeEpoch(0); rw.closeEpoch(1); rw.closeEpoch(2);
        assertEq(rw.weightOf(alice, 2), 0, "weight removed from epoch 2");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NoWeight.selector, uint256(2)));
        rw.claim(_one(2));
        console2.log("F2: alice locked through end of epoch 2, weightOf(alice,2) =", rw.weightOf(alice, 2));
    }

    // ============================================================ F3: claimable() counts a repeated epoch id twice
    function test_F3_claimableDoubleCountsDuplicates() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E);
        _play(alice); _play(bob);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0); rw.closeEpoch(1);
        (uint256 one0,) = rw.claimable(alice, _one(1));
        (uint256 dup0,) = rw.claimable(alice, _two(1, 1));
        console2.log("F3 claimable([1]) wt  ", one0);
        console2.log("F3 claimable([1,1]) wt", dup0);
        assertEq(dup0, 2 * one0, "view reports twice the payable amount");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.AlreadyClaimed.selector, uint256(1)));
        rw.claim(_two(1, 1));
    }

    // ============================================================ check (no finding expected): conservation through every path
    function test_C_conservation_allPaths() public {
        lock.set(alice, 1000e18, T0 + 400 days, 0);
        lock.set(bob, 3000e18, T0 + 100 days, 0);
        lock.set(carol, 7e18, T0 + 200 days, 0);
        lock.set(dave, 500e18, T0 + 400 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol); rw.enroll(dave);
        _fund(1_000_003, 999_999_999_999);
        _conserved("after fund");
        vm.warp(T0 + E + 5);
        _play(alice); _play(bob); _play(carol); // dave never plays
        lock.set(carol, 7e18, T0 + 200 days, block.timestamp);
        rw.sync(carol); // carol played then exits: unplayed
        vm.warp(T0 + 2 * E + 5);
        rw.closeEpoch(0); rw.closeEpoch(1);
        _conserved("after close 1");
        assertEq(rw.playedWeight(1), rw.weightOf(alice, 1) + rw.weightOf(bob, 1), "P == sum of surviving players");
        _play(alice); _play(dave);
        // rescue a slice that spills from unassigned into epoch 1 after alice claimed it
        vm.prank(alice); rw.claim(_one(1));
        _conserved("after alice claim 1");
        uint256 freeW = rw.unassigned(address(wt));
        vm.prank(guardian); rw.rescueRequest(address(wt), guardian, freeW + 3);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian); rw.rescueExecute();
        _conserved("after rescue");
        vm.warp(T0 + 3 * E + 5);
        rw.closeEpoch(2);
        _conserved("after close 2");
        vm.prank(bob); rw.claim(_one(1));
        vm.prank(alice); rw.claim(_one(2));
        vm.prank(dave); rw.claim(_one(2));
        _conserved("after claims");
        (uint256 p1,) = rw.pot(1); (uint256 c1,) = rw.cut(1); (uint256 l1,) = rw.left(1);
        console2.log("C epoch1 pot/cut/left wt", p1, c1, l1);
        vm.warp(block.timestamp + 3 * E);
        rw.release(); rw.release(); rw.release();
        _conserved("after release");
        (uint256 o0, uint256 o1) = rw.outstanding();
        assertEq(o0 + o1, 0, "nothing outstanding after all released");
        console2.log("C final wt bal / unassigned", wt.balanceOf(address(rw)), rw.unassigned(address(wt)));
    }

    // ============================================================ check (no finding expected): fuzzed claim order after a cut
    function testFuzz_C_cutThenClaimOrder_neverOverpays(uint96 a, uint96 b, uint96 c, uint96 fund, uint64 cutAmt, uint8 order) public {
        uint256 wa = bound(a, 1, 1e24); uint256 wb = bound(b, 1, 1e24); uint256 wc = bound(c, 1, 1e24);
        lock.set(alice, wa, T0 + 100 days, 0);
        lock.set(bob, wb, T0 + 100 days, 0);
        lock.set(carol, wc, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        _fund(bound(fund, 1, 1e30), 1);
        vm.warp(T0 + E);
        _play(alice); _play(bob); _play(carol);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0); rw.closeEpoch(1);
        (uint256 pot1,) = rw.pot(1);
        address[3] memory who = [alice, bob, carol];
        uint256 first = order % 3;
        vm.prank(who[first]); rw.claim(_one(1));
        uint256 free = rw.unassigned(address(wt));
        uint256 req = free + bound(cutAmt, 1, pot1 + 1);
        vm.prank(guardian); rw.rescueRequest(address(wt), guardian, req);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian); rw.rescueExecute();
        for (uint256 k = 1; k < 3; k++) { vm.prank(who[(first + k) % 3]); rw.claim(_one(1)); }
        _conserved("fuzz");
        (, uint256 cut1) = (0, 0);
        (cut1,) = rw.cut(1);
        uint256 paid = wt.balanceOf(alice) + wt.balanceOf(bob) + wt.balanceOf(carol);
        assertLe(paid + cut1, pot1, "claims + cut <= pot");
    }
}
