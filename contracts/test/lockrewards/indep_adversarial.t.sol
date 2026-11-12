// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {MockERC20} from "./TBlockLockRewards.t.sol";
import {PlayGateBase, MockGame} from "./PlayGateBase.sol";
// the REAL TBlockLock v1 source, byte-exact copy of D:/tmp/wt-tblock/contracts/src/TBlockLock.sol (not a mock), so top-up / extend / exit-request semantics are the deployed ones
import {TBlockLock} from "./vendor/TBlockLock.sol";

/// a pooled-lock wrapper: many depositors, ONE TBlockLock position, ONE address that plays
contract PooledLocker {
    function lockFor(address tok, address lk, uint256 amount, uint256 unlockAt) external {
        MockERC20(tok).approve(lk, amount);
        TBlockLock(lk).lock(amount, unlockAt);
    }
    function playOnce(MockGame g) external { g.play(); }
    function claimFor(TBlockLockRewards r, uint256[] calldata es) external returns (uint256 a, uint256 b) { return r.claim(es); }
}

/// Independent adversarial review of TBlockLockRewards (play gate, bands, epochs, gas). Uses the REAL TBlockLock v1 source.
contract IndepAdversarialTest is PlayGateBase {
    MockERC20 tblock;
    MockERC20 wt;
    TBlockLock lock;
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
        lock = new TBlockLock(address(tblock));
        (rw, game) = _deployRewards(address(tblock), address(wt), address(lock), address(0), guardian, T0, 1e30, 1e40);
    }

    function _lock(address who, uint256 amount, uint256 unlockAt) internal {
        tblock.mint(who, amount);
        vm.startPrank(who);
        tblock.approve(address(lock), amount);
        lock.lock(amount, unlockAt);
        vm.stopPrank();
    }

    function _one(uint256 e) internal pure returns (uint256[] memory a) { a = new uint256[](1); a[0] = e; }
    function _fund(uint256 w, uint256 t) internal { wt.mint(address(rw), w); tblock.mint(address(rw), t); }

    // ======================================================== ADV-1: a 1-wei top-up (or a 1-second extend) collapses the band
    // of the WHOLE lock, and any stranger can apply it with enroll(). More commitment -> less reward.
    function test_ADV1_oneWeiTopUp_strangerEnroll_dropsWholeLockBand() public {
        _lock(alice, 1000e18, T0 + 400 days);
        _lock(bob, 1000e18, T0 + 400 days);
        rw.enroll(alice);
        rw.enroll(bob);
        uint256 wA0 = rw.weightOf(alice, 7);
        uint256 wB0 = rw.weightOf(bob, 7);
        assertEq(wA0, 2000e18, "x2 at enroll");

        vm.warp(T0 + 200 days); // epoch 6; 200 days left on the lock
        // alice adds ONE wei to her own lock (same date); bob extends his by ONE second
        tblock.mint(alice, 1);
        vm.startPrank(alice);
        tblock.approve(address(lock), 1);
        lock.lock(1, 0);
        vm.stopPrank();
        vm.prank(bob);
        lock.extend(T0 + 400 days + 1);

        // a stranger applies both
        vm.prank(stranger);
        rw.enroll(alice);
        vm.prank(stranger);
        rw.enroll(bob);
        uint256 wA1 = rw.weightOf(alice, 7);
        uint256 wB1 = rw.weightOf(bob, 7);
        console2.log("ADV1 alice weight e7 before / after 1-wei top-up + stranger enroll", wA0, wA1);
        console2.log("ADV1 bob   weight e7 before / after 1-second extend + stranger enroll", wB0, wB1);
        assertEq(wA1, uint256(1000e18 + 1) * 17_500 / 10_000, "whole lock re-banded x1.75");
        assertLt(wA1, wA0, "more TBLOCK locked, less weight");
        assertLt(wB1, wB0, "longer lock, less weight");
    }

    // ======================================================== ADV-2: a holder whose exit is requested (TBlockLock perks already 0)
    // still plays and is paid in full unless a third party calls sync() in time; the other players are diluted by him.
    function test_ADV2_exitRequested_unsynced_paidInFull_dilutesOthers() public {
        _lock(alice, 1000e18, T0 + 100 days);
        _lock(bob, 1000e18, T0 + 100 days);
        rw.enroll(alice);
        rw.enroll(bob);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E); // epoch 1
        vm.prank(alice);
        lock.requestWithdraw();
        assertEq(lock.activeLockedOf(alice), 0, "TBlockLock: alice's perks ended");
        _play(alice);
        _play(bob);
        assertTrue(rw.hasPlayed(alice, 1), "an exit-requested holder records a play");

        uint256 snap = vm.snapshotState();
        // world A: nobody syncs alice
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(alice);
        (uint256 a0,) = rw.claim(_one(1));
        vm.prank(bob);
        (uint256 b0,) = rw.claim(_one(1));
        vm.revertToState(snap);
        // world B: a keeper syncs alice before the epoch ends
        rw.sync(alice);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(bob);
        (uint256 b1,) = rw.claim(_one(1));
        console2.log("ADV2 unsynced: alice(exit requested) wt / bob wt", a0, b0);
        console2.log("ADV2 synced:   bob wt", b1);
        assertEq(a0, b0, "exit-requested alice paid exactly like bob");
        assertGt(b1, b0, "bob is diluted when nobody syncs");
    }

    // ======================================================== ADV-3: the gate is per ADDRESS: a pooled locker pays ONE play per
    // epoch for any number of depositors, while each individual must pay its own.
    function test_ADV3_pooledLocker_onePlayCoversAllDepositors() public {
        PooledLocker pool = new PooledLocker();
        tblock.mint(address(pool), 10_000e18); // stands for 10 depositors x 1000
        pool.lockFor(address(tblock), address(lock), 10_000e18, T0 + 100 days);
        _lock(carol, 1000e18, T0 + 100 days);
        rw.enroll(address(pool));
        rw.enroll(carol);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E);
        uint256 plays0 = game.plays();
        pool.playOnce(game);
        _play(carol);
        uint256 poolPlays = game.plays() - plays0 - 1;
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        (uint256 p0,) = pool.claimFor(rw, _one(1));
        vm.prank(carol);
        (uint256 c0,) = rw.claim(_one(1));
        console2.log("ADV3 pool plays / pool wt paid / carol wt paid", poolPlays, p0, c0);
        assertEq(poolPlays, uint256(1));
        assertApproxEqAbs(p0, c0 * 10, 10, "one play paid the share of 10x the capital (floor dust)");
    }

    // ======================================================== ADV-4: boundary timing: a lock taken 1 s before an epoch boundary
    // for 30 d + 1 s earns the same as a lock taken at the epoch start for 60 d (same epoch, same band x1.25).
    function test_ADV4_boundaryLock_halfTheCapitalTime_sameReward() public {
        _lock(dave, 1000e18, T0 + 2 * E); // at the start of epoch 0, 60 days
        rw.enroll(dave);
        vm.warp(T0 + E - 1); // last second of epoch 0
        _lock(carol, 1000e18, T0 + 2 * E); // 30 days + 1 s
        rw.enroll(carol);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E);
        _play(carol);
        _play(dave);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(carol);
        (uint256 c0,) = rw.claim(_one(1));
        vm.prank(dave);
        (uint256 d0,) = rw.claim(_one(1));
        console2.log("ADV4 carol locked secs / paid wt", uint256(E + 1), c0);
        console2.log("ADV4 dave  locked secs / paid wt", uint256(2 * E), d0);
        assertEq(c0, d0, "half the capital-time, same reward");
    }

    // ======================================================== NEG-1 (negative control): a stranger forcing one checkpoint per epoch
    // on a victim for 40 epochs does NOT push recordPlay toward the game's 100k PLAY_GAS cap.
    function test_NEG1_checkpointSpam_recordPlayGasStaysFlat() public {
        _lock(alice, 1000e18, T0 + 4 * 365 days);
        rw.enroll(alice);
        for (uint256 i = 1; i <= 40; i++) {
            vm.warp(T0 + i * E + 1);
            vm.prank(stranger);
            rw.enroll(alice);
        }
        uint256 n = rw.checkpointsOf(alice).length;
        vm.prank(address(game));
        uint256 g0 = gasleft();
        rw.recordPlay(alice);
        uint256 used = g0 - gasleft();
        console2.log("NEG1 checkpoints / recordPlay gas (test-measured, warm game addr)", n, used);
        assertGe(n, 40);
        assertTrue(rw.hasPlayed(alice, rw.currentEpoch()));
        assertLt(used, 100_000);
    }

    // ======================================================== NEG-2 (negative control): a sybil split of the same capital earns no more
    // than one address, and pays one 5-USDC play per address.
    function test_NEG2_sybilSplit_noGain() public {
        _lock(alice, 2000e18, T0 + 100 days);
        _lock(bob, 1000e18, T0 + 100 days);
        _lock(carol, 1000e18, T0 + 100 days);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E);
        _play(alice); _play(bob); _play(carol);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0); rw.closeEpoch(1);
        vm.prank(alice); (uint256 a,) = rw.claim(_one(1));
        vm.prank(bob); (uint256 b,) = rw.claim(_one(1));
        vm.prank(carol); (uint256 c,) = rw.claim(_one(1));
        console2.log("NEG2 one address 2000 / two addresses 1000+1000", a, b + c);
        assertGe(a, b + c);
    }
}
