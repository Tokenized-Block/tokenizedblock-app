// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {MockERC20, MockLock, MockPoolManager} from "./TBlockLockRewards.t.sol";
import {MockGame} from "./PlayGateBase.sol";

/// drives enroll / exit / sync / play / fake plays / close / claim / release / funding in random order
contract PlayGateHandler is Test {
    TBlockLockRewards public rw;
    MockGame public game;
    MockLock public lock;
    MockERC20 public wt;
    MockERC20 public tb;
    address[5] public actors = [address(0xA1), address(0xA2), address(0xA3), address(0xA4), address(0xA5)];

    uint256 public fundedW;
    uint256 public fundedT;
    uint256 public paidW;
    uint256 public paidT;
    uint256 public fakeAccepted; // must stay 0
    uint256 public badClaimAccepted; // must stay 0
    uint256 public eligibleReverted; // must stay 0
    uint256 public plays;
    uint256 public claims;

    constructor(TBlockLockRewards r, MockGame g, MockLock l, MockERC20 w, MockERC20 t) {
        rw = r; game = g; lock = l; wt = w; tb = t;
    }

    function actorCount() external pure returns (uint256) { return 5; }

    function enroll(uint256 who, uint256 amount, uint256 daysOut) external {
        address h = actors[who % 5];
        amount = bound(amount, 1, 1e24);
        daysOut = bound(daysOut, 40, 500); // mostly locks that cover whole epochs, so plays and claims are reachable
        lock.set(h, amount, block.timestamp + daysOut * 1 days, 0);
        rw.enroll(h);
    }

    function requestExit(uint256 who, bool viaSync) external {
        address h = actors[who % 5];
        lock.set(h, lock.lockedOf(h), lock.unlockAtOf(h), block.timestamp);
        if (viaSync) rw.sync(h); else rw.enroll(h);
    }

    function cancelExit(uint256 who) external {
        address h = actors[who % 5];
        lock.set(h, lock.lockedOf(h), lock.unlockAtOf(h), 0);
    }

    function play(uint256 who) external {
        address a = actors[who % 5];
        bool before = rw.hasPlayed(a, rw.currentEpoch());
        vm.prank(a);
        game.play();
        if (!before && rw.hasPlayed(a, rw.currentEpoch())) plays++;
    }

    uint256 public voids;

    function exitAfterPlay(uint256 who, bool viaSync) external {
        // aims at the _unplay path: an actor that played this epoch asks to exit
        address a = actors[who % 5];
        uint256 e = rw.currentEpoch();
        if (!rw.hasPlayed(a, e) || rw.weightOf(a, e) == 0) return;
        uint256 before = rw.playedWeight(e);
        lock.set(a, lock.lockedOf(a), lock.unlockAtOf(a), block.timestamp);
        if (viaSync) rw.sync(a); else rw.enroll(a);
        if (rw.playedWeight(e) < before) voids++;
    }

    function fakePlay(uint256 who, uint256 from) external {
        address[3] memory srcs = [actors[from % 5], address(this), address(lock)];
        vm.prank(srcs[from % 3]);
        try rw.recordPlay(actors[who % 5]) { fakeAccepted++; } catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 1 days, 20 days));
    }

    function close() external {
        uint256 e = rw.nextEpochToClose();
        if (block.timestamp >= rw.epochEnd(e)) rw.closeEpoch(e);
    }

    function fund(uint256 w, uint256 t) external {
        w = bound(w, 0, 1e24);
        t = bound(t, 0, 1e24);
        wt.mint(address(rw), w);
        tb.mint(address(rw), t);
        fundedW += w;
        fundedT += t;
    }

    /// every actor tries to claim one open epoch: eligible ones must be paid, the others must be refused
    function claim(uint256 k) external {
        uint256 lo = rw.nextEpochToRelease();
        uint256 hi = rw.nextEpochToClose();
        if (hi <= lo) return;
        uint256 e = lo + k % (hi - lo);
        for (uint256 i = 0; i < 5; i++) _claimOne(actors[i], e);
    }

    function _claimOne(address h, uint256 e) internal {
        bool ok = rw.hasPlayed(h, e) && !rw.claimed(h, e) && rw.weightOf(h, e) > 0;
        uint256[] memory es = new uint256[](1);
        es[0] = e;
        vm.prank(h);
        try rw.claim(es) returns (uint256 a, uint256 b) {
            if (!ok) badClaimAccepted++;
            claims++;
            paidW += a;
            paidT += b;
        } catch {
            if (ok) eligibleReverted++; // counted, not required: fail_on_revert = false would swallow a revert here
        }
    }

    function release() external {
        uint256 e = rw.nextEpochToRelease();
        if (e < rw.nextEpochToClose() && block.timestamp >= rw.closedAt(e) + 3 * rw.EPOCH()) rw.release();
    }
}

contract PlayGateInvariantTest is Test {
    PlayGateHandler h;
    TBlockLockRewards rw;
    MockERC20 wt;
    MockERC20 tb;

    function setUp() public {
        vm.warp(1_800_000_000);
        tb = new MockERC20();
        wt = new MockERC20();
        MockLock lock = new MockLock(address(tb));
        MockPoolManager pm = new MockPoolManager();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        MockGame g = new MockGame(predicted);
        address[] memory gs = new address[](1);
        gs[0] = address(g);
        rw = new TBlockLockRewards(address(tb), address(wt), address(lock), address(pm), address(0x6A4D), block.timestamp, 1e30, 1e40, gs);
        h = new PlayGateHandler(rw, g, lock, wt, tb);
        // bootstrap: every actor starts with a 400-day lock, so plays count from epoch 1 and claims are reachable
        for (uint256 i = 0; i < 5; i++) { lock.set(h.actors(i), (i + 1) * 1e21, block.timestamp + 400 days, 0); rw.enroll(h.actors(i)); }
        targetContract(address(h));
    }

    /// playedWeight[e] == sum of weightOf(h, e) over the holders with the PLAYED bit, for every epoch up to the current one
    /// (open epochs: the live sum; closed epochs: P = min(sum, W), and sum <= W always)
    /// forge-config: default.invariant.depth = 200
    function invariant_playedWeightIsSumOfPlayersWeights() public view {
        uint256 cur = rw.currentEpoch();
        for (uint256 e = 0; e <= cur; e++) {
            uint256 s;
            for (uint256 i = 0; i < 5; i++) {
                address a = h.actors(i);
                if (rw.hasPlayed(a, e)) s += rw.weightOf(a, e);
            }
            assertEq(rw.playedWeight(e), s, "playedWeight == sum of played weights");
            if (e < rw.nextEpochToClose()) assertLe(s, rw.totalWeight(e), "P <= W");
            else assertLe(s, rw.projectedTotalWeight(e), "live P <= live W");
        }
    }

    /// forge-config: default.invariant.depth = 200
    function invariant_noUnauthorizedPlayNoBadClaim() public view {
        assertEq(h.fakeAccepted(), 0, "a non-game marked a play");
        assertEq(h.badClaimAccepted(), 0, "a non-player / double / zero-weight claim was paid");
        assertEq(h.eligibleReverted(), 0, "an eligible claim reverted");
    }

    /// proof of stimulus: how often each run actually reached a recorded play, a voided play and a paid claim
    function afterInvariant() external {
        vm.writeLine(
            "scratch/playgate-invariant-stimulus.log",
            string.concat(
                "plays=", vm.toString(h.plays()), " voids=", vm.toString(h.voids()), " claims=", vm.toString(h.claims()),
                " closed=", vm.toString(rw.nextEpochToClose())
            )
        );
    }

    /// forge-config: default.invariant.depth = 200
    function invariant_conservation() public view {
        (uint256 o0, uint256 o1) = rw.outstanding();
        assertGe(wt.balanceOf(address(rw)), o0, "wtCOIN covers outstanding");
        assertGe(tb.balanceOf(address(rw)), o1, "TBLOCK covers outstanding");
        assertEq(h.paidW() + wt.balanceOf(address(rw)), h.fundedW(), "wtCOIN: paid + held == funded");
        assertEq(h.paidT() + tb.balanceOf(address(rw)), h.fundedT(), "TBLOCK: paid + held == funded");
        for (uint256 e = rw.nextEpochToRelease(); e < rw.nextEpochToClose(); e++) {
            (uint256 p0, uint256 p1) = rw.pot(e);
            (uint256 l0, uint256 l1) = rw.left(e);
            assertLe(l0, p0);
            assertLe(l1, p1);
            assertLe(rw.claimedWeight(e), rw.playedWeight(e), "claimed weight <= played weight");
        }
    }
}
