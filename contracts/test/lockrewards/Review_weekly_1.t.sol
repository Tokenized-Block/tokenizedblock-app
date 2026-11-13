// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockLockRewardsWeekly} from "../../src/TBlockLockRewardsWeekly.sol";
import {WToken, WLock, WLikes, WVault} from "./Weekly.t.sol";

/// Adversarial review tests (2026-11-13), v2 API: markPlayed + MARK_GRACE + R's P/W rule. Mocks only.
contract ReviewWeekly1 is Test {
    WToken tb; WToken wt; WLock lock; WLikes likes; WVault vault; TBlockLockRewardsWeekly r;
    address guardian = address(0x6A);
    address alice = address(0xA1); address bob = address(0xB0); address carol = address(0xC0);
    uint64 constant G = 1794355200;
    uint256 constant WEEK = 7 days;

    function setUp() public {
        vm.warp(G + 2 * WEEK + 3 days);
        tb = new WToken(); wt = new WToken();
        lock = new WLock(address(tb));
        likes = new WLikes(G, uint64(WEEK), address(lock), address(tb));
        vault = new WVault(address(likes), address(lock), address(tb));
        r = new TBlockLockRewardsWeekly(address(tb), address(wt), address(lock), address(vault), guardian, type(uint128).max, type(uint128).max);
    }

    function _one(uint256 e) internal pure returns (uint256[] memory a) { a = new uint256[](1); a[0] = e; }
    function _closeReady() internal {
        while (r.epochEnd(r.nextEpochToClose()) + r.MARK_GRACE() <= block.timestamp) r.closeEpoch(r.nextEpochToClose());
    }

    /// grace: a close before epochEnd + 1 day reverts; a mark in the grace day counts
    function test_grace_markInGraceCounts_closeBeforeGraceReverts() public {
        lock.set(alice, 10 ether, block.timestamp + 400 days); r.enroll(alice);
        tb.mint(address(r), 1000 ether);
        vm.warp(r.epochEnd(2) + 1 days); r.closeEpoch(2);
        vault.play(3, alice);
        vm.warp(r.epochEnd(3) + 1 days - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.EpochNotEnded.selector, 3)); r.closeEpoch(3);
        r.markPlayed(alice, 3); // in week 4, grace of week 3
        vm.warp(r.epochEnd(3) + 1 days); r.closeEpoch(3);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotMarkable.selector, 3)); r.markPlayed(alice, 3);
        vm.prank(alice); (, uint256 a1) = r.claim(_one(3));
        assertEq(a1, 70 ether, "alone: 7% of 1000");
    }

    /// cut: under R's rule the pot holds only the players' part, so a cut falls on them in full (as in R)
    function test_cut_fallsOnPlayers() public {
        lock.set(alice, 10 ether, block.timestamp + 400 days);
        lock.set(bob, 90 ether, block.timestamp + 400 days);
        r.enroll(alice); r.enroll(bob);
        tb.mint(address(r), 1000 ether);
        vault.play(3, alice);
        vm.warp(r.epochEnd(2) + 1 days); r.closeEpoch(2);
        vm.warp(r.epochEnd(3)); r.markPlayed(alice, 3);
        vm.warp(r.epochEnd(3) + 1 days); r.closeEpoch(3);
        (, uint256 p) = r.pot(3); assertEq(p, 7 ether, "full 70 * P/W 10%");
        vm.prank(guardian); r.rescueRequest(address(tb), guardian, 993 ether + 3.5 ether);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian); r.rescueExecute();
        vm.prank(alice); (, uint256 a1) = r.claim(_one(3));
        assertEq(a1, 3.5 ether);
    }

    function test_emission_allPlay_noInflow() public {
        lock.set(alice, 1 ether, block.timestamp + 400 days); r.enroll(alice);
        tb.mint(address(r), 1000 ether);
        vm.warp(r.epochEnd(2) + 1 days); r.closeEpoch(2);
        for (uint256 e = 3; e <= 10; e++) {
            vault.play(e, alice);
            vm.warp(r.epochEnd(e)); r.markPlayed(alice, e);
            vm.warp(r.epochEnd(e) + 1 days); r.closeEpoch(e);
            vm.prank(alice); r.claim(_one(e));
            if (e == 6) emit log_named_uint("stock after 4 weeks (of 1000e18)", tb.balanceOf(address(r)));
        }
        emit log_named_uint("stock after 8 weeks (of 1000e18)", tb.balanceOf(address(r)));
        assertApproxEqRel(tb.balanceOf(address(r)), uint256(1000 ether) * 559582 / 1000000, 1e14); // 0.93^8
    }

    /// 10 % of the weight plays every week, no inflow
    function test_emission_tenPercentPlay() public {
        lock.set(alice, 10 ether, block.timestamp + 400 days); lock.set(bob, 90 ether, block.timestamp + 400 days);
        r.enroll(alice); r.enroll(bob);
        tb.mint(address(r), 1000 ether);
        vm.warp(r.epochEnd(2) + 1 days); r.closeEpoch(2);
        uint256 firstPot;
        for (uint256 e = 3; e <= 10; e++) {
            vault.play(e, alice);
            vm.warp(r.epochEnd(e)); r.markPlayed(alice, e);
            vm.warp(r.epochEnd(e) + 1 days); r.closeEpoch(e);
            if (e == 3) (, firstPot) = r.pot(e);
            vm.prank(alice); r.claim(_one(e));
        }
        (, uint256 o) = r.outstanding();
        emit log_named_uint("week-3 pot (bps of stock)", firstPot * 10000 / 1000 ether);
        emit log_named_uint("stock after 8 weeks (of 1000e18)", tb.balanceOf(address(r)));
        assertEq(o, 0, "non-players' part never reserved");
        assertEq(firstPot, 7 ether);
    }

    function test_emission_nobodyPlays_nothingAssigned() public {
        lock.set(alice, 1 ether, block.timestamp + 1400 days); r.enroll(alice);
        tb.mint(address(r), 1000 ether);
        vm.warp(r.epochEnd(40) + 1 days); _closeReady();
        (, uint256 o) = r.outstanding();
        assertEq(o, 0); assertEq(r.unassigned(address(tb)), 1000 ether);
    }

    // ------------------------------------------------------------------ fuzz: random enroll / exit+sync / sync / play+mark / warp+close
    function _run(uint256 seed) internal returns (uint256 start) {
        address[3] memory hs = [alice, bob, carol];
        start = r.nextEpochToClose();
        for (uint256 i; i < 3; i++) { lock.set(hs[i], (i + 1) * 10 ether, block.timestamp + 300 days); r.enroll(hs[i]); }
        vm.warp(r.epochEnd(r.currentEpoch()) + 1);
        for (uint256 step; step < 60; step++) {
            uint256 x = uint256(keccak256(abi.encode(seed, step)));
            address h = hs[x % 3];
            uint256 op = (x >> 8) % 6;
            if (op == 0) lock.set(h, 1 ether + (x >> 16) % 100 ether, block.timestamp + 7 days + (x >> 40) % 200 days);
            else if (op == 1) r.enroll(h);
            else if (op == 2) { if ((x >> 60) % 3 == 0) { lock.request(h); r.sync(h); } else r.enroll(h); }
            else if (op == 3) r.sync(h);
            else if (op == 4) {
                uint256 cur = r.currentEpoch();
                uint256 back = (x >> 48) % 3;
                uint256 e = cur >= back ? cur - back : cur;
                vault.play(e, h);
                try r.markPlayed(h, e) {} catch {}
            } else {
                vm.warp(block.timestamp + 1 + (x >> 24) % 5 days);
                if ((x >> 56) % 2 == 0) _closeReady();
            }
        }
    }

    function testFuzz_weightSum_equalsTotalWeight(uint256 seed) public {
        uint256 start = _run(seed);
        for (uint256 e = start; e < r.nextEpochToClose(); e++) {
            uint256 s = r.weightOf(alice, e) + r.weightOf(bob, e) + r.weightOf(carol, e);
            assertEq(s, r.totalWeight(e), "weight sum");
        }
    }

    /// probe of the stimulus: the random runs really mark, unplay and close
    function test_fuzzStimulus_marksUnplaysAndClosesHappen() public {
        bytes32 tM = keccak256("Marked(address,uint256,uint256)");
        bytes32 tV = keccak256("PlayVoided(address,uint256,uint256)");
        bytes32 tC = keccak256("EpochClosed(uint256,uint256,uint256,uint256,uint256)");
        uint256 m; uint256 v; uint256 c;
        for (uint256 s; s < 20; s++) {
            uint256 snap = vm.snapshotState();
            vm.recordLogs();
            _run(s);
            Vm.Log[] memory logs = vm.getRecordedLogs();
            for (uint256 i; i < logs.length; i++) {
                if (logs[i].topics[0] == tM) m++; else if (logs[i].topics[0] == tV) v++; else if (logs[i].topics[0] == tC) c++;
            }
            vm.revertToState(snap);
        }
        emit log_named_uint("marks", m); emit log_named_uint("unplays", v); emit log_named_uint("closes", c);
        assertGt(m, 0); assertGt(v, 0); assertGt(c, 0);
    }

    function _markedSum(uint256 e) internal view returns (uint256 s) {
        address[3] memory hs = [alice, bob, carol];
        for (uint256 i; i < 3; i++) if (r.marked(hs[i], e)) s += r.weightOf(hs[i], e);
    }

    function testFuzz_markedSum_equalsPlayedWeight(uint256 seed) public {
        uint256 start = _run(seed);
        uint256 cur = r.currentEpoch();
        for (uint256 e = start; e <= cur; e++) {
            assertEq(_markedSum(e), r.playedWeight(e), "marked sum");
            if (e < r.nextEpochToClose()) assertLe(r.playedWeight(e), r.totalWeight(e), "P <= W");
        }
    }
}
