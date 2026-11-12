// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {MockERC20, MockLock, MockPoolManager} from "./TBlockLockRewards.t.sol";
import {PlayGateBase} from "./PlayGateBase.sol";

/// Economics review of TBlockLockRewards. Each test proves one finding; names start with the finding id.
/// PLAY GATE port: where an epoch's pot or claims are checked, every holder of that epoch plays once during it (P == W).
contract ReviewEconomicsTest is PlayGateBase {
    MockERC20 tblock;
    MockERC20 wt;
    MockLock lock;
    MockPoolManager pm;
    TBlockLockRewards rw;

    address guardian = address(0x6A4D);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address whale = address(0xBEEF);
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

    function _coveredEpochs(address h) internal view returns (uint256 n) {
        TBlockLockRewards.Checkpoint[] memory c = rw.checkpointsOf(h);
        for (uint256 i = 0; i < c.length; i++) n += uint256(c[i].lastEpoch) - uint256(c[i].fromEpoch) + 1;
    }

    // ------------------------------------------------------------------------------------------------ ECO-1
    /// The UI offers 7 / 30 / 90 / 365-day locks (design section 4). With 30-day epochs that start AFTER enroll, a 30-day lock taken at
    /// any moment that is not exactly an epoch boundary covers no full epoch: zero reward, while its band reads x1.25.
    function testFuzz_ECO1_thirtyDayLockNeverEarns(uint256 offset) public {
        offset = bound(offset, 1, E - 1);
        vm.warp(T0 + 3 * E + offset);
        lock.set(alice, 1000e18, block.timestamp + 30 days, 0);
        rw.enroll(alice);
        assertEq(rw.multiplierBps(30 days), 12_500, "band says x1.25");
        assertEq(_coveredEpochs(alice), 0, "30-day lock covers no epoch");
        // a 7-day lock: same
        lock.set(bob, 1000e18, block.timestamp + 7 days, 0);
        rw.enroll(bob);
        assertEq(_coveredEpochs(bob), 0, "7-day lock covers no epoch");
    }

    /// A 90-day lock covers 2 epochs (60 of its 90 days) unless taken exactly on a boundary; a 365-day lock 11 or 12 epochs.
    /// A per-epoch APR shown next to the lock button therefore overstates the 90-day holder's return on capital by 90/60 = 1.5x.
    function testFuzz_ECO1_coverageFraction(uint256 offset) public {
        offset = bound(offset, 1, E - 1);
        vm.warp(T0 + 3 * E + offset);
        lock.set(alice, 1000e18, block.timestamp + 90 days, 0);
        rw.enroll(alice);
        assertEq(_coveredEpochs(alice), 2, "90 days -> 2 epochs");
        lock.set(bob, 1000e18, block.timestamp + 365 days, 0);
        rw.enroll(bob);
        uint256 n = _coveredEpochs(bob); // 365 d = 12 epochs + 5 d: 12 if taken in the LAST 5 days of an epoch, else 11
        assertEq(n, offset >= 25 days ? 12 : 11, "365 days -> 11 or 12 epochs");
    }

    // ------------------------------------------------------------------------------------------------ ECO-2
    /// Top-up keeps the band of the FIRST sighting of unlockAt (enrollmentOf.commitStart), while points.js resets the commitment on
    /// every Locked event (points.js l.47: `engage = e.t`). TBlockLock.lock() on an existing lock keeps the later date (l.78), so the
    /// date does not change and the contract keeps the old band.
    /// Scenario: whale parks 1 wei for ~1 year (x2). At day 290 he tops up 10M TBLOCK with the same date (77 days left).
    /// Bob locks the same 10M at the same moment until the same date. FIXED: the top-up restarts the whale's band, both get x1.25.
    /// Red on the old contract (whale x2, 61.5% / 38.5%), green now.
    function test_ECO2_topUpRestartsBand() public {
        vm.warp(T0 + 1);
        uint256 unlockAt = T0 + 1 + 366 days;
        lock.set(whale, 1, unlockAt, 0);
        rw.enroll(whale);

        vm.warp(T0 + 290 days); // epoch 9
        lock.set(whale, 10_000_000e18 + 1, unlockAt, 0); // lock(10M, anyDate): date kept = unlockAt
        rw.enroll(whale);
        lock.set(bob, 10_000_000e18, unlockAt, 0);
        rw.enroll(bob);

        uint256 ww = rw.weightOf(whale, 10);
        uint256 wb = rw.weightOf(bob, 10);
        assertEq(ww, uint256(10_000_000e18 + 1) * 12_500 / 10_000, "whale: x1.25 after the top-up, as points.js");
        assertEq(wb, 10_000_000e18 * 12_500 / 10_000, "bob: x1.25");
        // points.js for the whale after the top-up: multiplier(unlockAt - topUpTime) = 77 days -> x1.25, same as bob
        assertEq(rw.multiplierBps(unlockAt - (T0 + 290 days)), 12_500, "what points.js would show");

        // the pot of epoch 10 now splits ~50 / 50 for identical capital
        wt.mint(address(rw), 100e18);
        vm.warp(T0 + 10 * E);
        _play(whale); _play(bob);
        vm.warp(T0 + 11 * E);
        for (uint256 e = 0; e <= 10; e++) rw.closeEpoch(e);
        vm.prank(whale);
        (uint256 pw,) = rw.claim(_one(10));
        vm.prank(bob);
        (uint256 pb,) = rw.claim(_one(10));
        console2.log("ECO-2 epoch 10 pot split, whale / bob (wtCOIN raw):", pw, pb);
        assertEq(pw * 1000 / (pw + pb), 500);
    }

    // ------------------------------------------------------------------------------------------------ ECO-3
    /// CLAIM_WINDOW used to count from the epoch index, not from the close: after 4 months without a close, a stranger could close an
    /// epoch and release() it in the same transaction. FIXED: release waits CLAIM_WINDOW * EPOCH from the close. Red on the old
    /// contract (release succeeded, alice could not claim), green now.
    function test_ECO3_lateCloseKeepsClaimWindow() public {
        lock.set(alice, 1000e18, T0 + 65 days, 0); // weight in epoch 1 only
        rw.enroll(alice);
        wt.mint(address(rw), 100e18);
        vm.warp(T0 + E);
        _play(alice);

        vm.warp(T0 + 3 * E + 1); // epoch 3: whale enrolls for epochs 4..
        lock.set(whale, 1000e18, T0 + 200 days, 0);
        rw.enroll(whale);
        vm.warp(T0 + 4 * E);
        _play(whale);

        vm.warp(T0 + 5 * E); // epoch 5, nothing closed yet (no keeper)
        vm.startPrank(stranger);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        (uint256 p1,) = rw.pot(1);
        assertEq(p1, 25e18, "alice's epoch-1 pot assigned");
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.ReleaseTooEarly.selector, uint256(0)));
        rw.release(); // the window counts from the close, not from the epoch number
        vm.stopPrank();

        vm.prank(alice);
        (uint256 a,) = rw.claim(_one(1));
        assertEq(a, 25e18, "alice is paid her epoch-1 pot");

        rw.closeEpoch(2);
        rw.closeEpoch(3);
        rw.closeEpoch(4);
        vm.prank(whale);
        (uint256 got,) = rw.claim(_one(4));
        assertEq(got, 18.75e18, "whale's epoch 4 pot = 25% of the 75 left, alice's 25 not swept to him");
    }

    // ------------------------------------------------------------------------------------------------ ECO-4
    /// "Request stops your share" (TBlockLock NatSpec, points.js, design UI copy) holds only if someone calls sync(h). Without it, a holder
    /// who requested exit at the start of epoch 1 is paid the whole epoch-1 pot share. Principal stays backed (withdraw >= unlockAt).
    function test_ECO4_requestWithoutSyncStillPaid() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(bob);
        wt.mint(address(rw), 100e18);
        vm.warp(T0 + E + 1);
        lock.set(alice, 1000e18, T0 + 100 days, block.timestamp); // requestWithdraw, nobody syncs
        _play(alice); _play(bob);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(alice);
        (uint256 a,) = rw.claim(_one(1));
        assertEq(a, 12.5e18, "alice paid half the pot after asking to leave");
    }

    // ------------------------------------------------------------------------------------------------ ECO-5 (not a bug: the numbers the UI must use)
    /// Constant inflow F per epoch, everyone claims: pot_n = F * (1 - 0.75^(n+1)). First month pays 25% of that month's inflow; ~68% by
    /// month 4; ~90% by month 8. At the measured ~0.04 wtCOIN/month (18 decimals ASSUMED here, read decimals() on chain) the first pot
    /// is 0.01 wtCOIN.
    function test_ECO5_rampToSteadyState() public {
        uint256 F = 4e16;
        lock.set(alice, 1000e18, T0 + 4 * 365 days, 0);
        rw.enroll(alice);
        uint256[] memory expectedPermille = new uint256[](8);
        for (uint256 n = 0; n < 8; n++) {
            wt.mint(address(rw), F);
            vm.warp(T0 + n * E);
            _play(alice);
            vm.warp(T0 + (n + 1) * E);
            rw.closeEpoch(n);
            (uint256 p,) = rw.pot(n);
            if (n >= 1) { vm.prank(alice); rw.claim(_one(n)); }
            expectedPermille[n] = p * 1000 / F;
            console2.log("epoch", n, "pot permille of monthly inflow", expectedPermille[n]);
        }
        (uint256 p0,) = rw.pot(0);
        assertEq(p0, 0, "epoch 0: alice enrolled in epoch 0, weight starts at 1 -> nothing assigned");
        (uint256 p1,) = rw.pot(1);
        assertEq(p1, (2 * F) / 4, "epoch 1 pot = 25% of two months of inflow (epoch 0 had no weight)");
    }

    /// Realized trailing APR is computable from chain views alone (plus prices / decimals off chain).
    function test_ECO6_realizedAprFromViews() public {
        lock.set(alice, 1000e18, T0 + 400 days, 0); // x2
        rw.enroll(alice);
        lock.set(bob, 3000e18, T0 + 100 days, 0); // x1.5
        rw.enroll(bob);
        wt.mint(address(rw), 4e16);
        tblock.mint(address(rw), 1000e18);
        vm.warp(T0 + E);
        _play(alice); _play(bob);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);

        uint256 e = rw.nextEpochToClose() - 1;
        (uint256 pW, uint256 pT) = rw.pot(e);
        (uint256 cW, uint256 cT) = rw.cut(e);
        uint256 W = rw.totalWeight(e);
        assertEq(W, 2000e18 + 4500e18);
        // TBLOCK leg needs no price: tokens paid per weighted TBLOCK, annualised x12, in bps
        uint256 tblockLegAprBps = (pT - cT) * 12 * 10_000 / W;
        // wtCOIN leg with example prices (1e18-scaled USD): P_W = 134 USD, P_T = 5.4e-6 USD
        uint256 PW = 134e18;
        uint256 PT = 5.4e12;
        uint256 aprX1Bps = ((pW - cW) * PW + (pT - cT) * PT) * 12 * 10_000 / (W * PT);
        console2.log("TBLOCK-leg APR at x1 (bps):", tblockLegAprBps);
        console2.log("total APR at x1 (bps), example prices:", aprX1Bps);
        assertGt(aprX1Bps, tblockLegAprBps);
    }

    // ------------------------------------------------------------------------------------------------ ECO-7 (documented behaviour, order-dependent)
    /// After a rescue cut on a partly claimed epoch, the whole cut falls on those who had not yet claimed. This is inherent: what was
    /// already paid cannot be taken back. Since the SEC-2 fix the cut is at least shared pro-rata among the unclaimed weight; here bob
    /// is the only unclaimed holder and the cut (50) equals everything left, so he still gets 0.
    function test_ECO7_rescueCutFallsOnLateClaimers() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(bob);
        wt.mint(address(rw), 400e18);
        vm.warp(T0 + E);
        _play(alice); _play(bob);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1); // pot 100, 50/50
        vm.prank(alice);
        rw.claim(_one(1)); // 50
        // rescue everything unassigned (300) plus 50 from epoch 1
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, 350e18);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute();
        vm.prank(bob);
        (uint256 b,) = rw.claim(_one(1));
        assertEq(b, 0, "bob bears the whole 50 cut, alice none");
    }
}
