// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockVaultV2} from "../src/TBlockVaultV2.sol";
import {TBlockLock} from "../src/TBlockLock.sol";

contract V2VToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { _move(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance"); allowance[f][msg.sender] -= a; _move(f, to, a); return true;
    }
    function _move(address f, address to, uint256 a) internal { require(balanceOf[f] >= a, "balance"); balanceOf[f] -= a; balanceOf[to] += a; }
}
/// the views TBlockVaultV2 reads from BlockLikesV2, settable (spent per epoch, total, top, the $15 minimum in TBLOCK)
contract FakeLikesV2 {
    uint64 G; uint64 EP; uint256 public minHold; address public LOCK;
    mapping(uint256 => mapping(address => uint256)) public spentIn; mapping(uint256 => uint256) public totalSpentIn; mapping(uint256 => address) public topOf;
    constructor(uint64 g, uint64 ep, uint256 m, address lock_) { G = g; EP = ep; minHold = m; LOCK = lock_; }
    function setMin(uint256 m) external { minHold = m; }
    function play(uint256 e, address a, uint256 s) external { spentIn[e][a] += s; totalSpentIn[e] += s; if (spentIn[e][a] > spentIn[e][topOf[e]]) topOf[e] = a; }
    function epochEnd(uint256 e) external view returns (uint256) { return uint256(G) + (e + 1) * uint256(EP); }
    function currentEpoch() external view returns (uint256) { return block.timestamp < G ? 0 : (block.timestamp - G) / EP; }
}
contract FakeContest2 {
    function currentRound() external pure returns (uint256) { return 0; }
    function fundRoom(uint256) external pure returns (uint256) { return 0; }
    function fund(uint256, uint256) external pure {}
}

contract TBlockVaultV2Test is Test {
    V2VToken t; FakeLikesV2 L; TBlockLock K; TBlockVaultV2 V;
    address A = address(0xA11CE); address B = address(0xB0B); address N = address(0x9999); address D2 = address(0xD2D2);
    uint256 constant MIN = 3_000_000e18;   // $15 at $0.000005
    uint64 G; uint64 constant EP = 7 days;

    function setUp() public {
        vm.warp(1_800_000_000); G = uint64(block.timestamp);
        t = new V2VToken(); K = new TBlockLock(address(t)); L = new FakeLikesV2(G, EP, MIN, address(K));
        V = new TBlockVaultV2(TBlockVaultV2.Config({ tblock: address(t), likes: address(L), contest: address(new FakeContest2()), lock: address(K),
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: 50_000_000e18, claimWindow: 7 days,
            maxFeedPerCall: 862_000e18, feedCooldown: 1 days, dev: address(this), dev2: D2 }));
        for (uint256 i; i < 3; i++) { address p = i == 0 ? A : (i == 1 ? B : N); t.mint(p, 100_000_000e18); vm.prank(p); t.approve(address(K), type(uint256).max); }
    }
    function _lock(address p, uint256 amount, uint256 dur) internal { vm.prank(p); K.lock(amount, block.timestamp + dur); }
    /// A spent 3, B spent 1 (in epoch 0); vault funded; epoch 0 closed with a budget of `fund` * 50 % (capped as v1)
    function _week(uint256 fund) internal returns (uint256 budget) {
        L.play(0, A, 300_000e18); L.play(0, B, 100_000e18);
        t.mint(address(V), fund);
        vm.warp(G + EP);
        budget = V.closeEpoch(0);
    }

    function test_no_lock_no_claim() public {
        _week(100_000e18);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockVaultV2.HoldTooLow.selector, 0, MIN)); V.claim(0);
    }
    function test_below_fifteen_dollars_locked_no_claim() public {
        _lock(A, MIN - 1, 30 days);
        _week(100_000e18);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockVaultV2.HoldTooLow.selector, MIN - 1, MIN)); V.claim(0);
    }
    function test_must_stay_committed_seven_days() public {
        _lock(A, MIN, 10 days);        /* at the claim (day 7) only 3 days are left */
        _week(100_000e18);
        uint256 u = K.unlockAtOf(A);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockVaultV2.NotCommitted.selector, u, block.timestamp + 7 days)); V.claim(0);
        vm.prank(A); K.extend(block.timestamp + 30 days);
        vm.prank(A); V.claim(0);
    }
    function test_exit_requested_no_claim() public {
        _lock(A, MIN, 60 days);
        _week(100_000e18);
        vm.prank(A); K.requestWithdraw();
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockVaultV2.HoldTooLow.selector, 0, MIN)); V.claim(0);
    }
    function test_a_big_lock_without_play_gets_nothing() public {
        _lock(N, 4 * MIN, 400 days);
        _week(100_000e18);
        vm.prank(N); vm.expectRevert(TBlockVaultV2.NothingToClaim.selector); V.claim(0);
    }
    function test_lock_factor_bounds() public {
        _lock(A, MIN, 7 days + 1 hours);
        assertEq(V.lockFactor(A), 10_000 + uint256(2_500) * (7 days + 1 hours) / 90 days, "minimum amount, ~7 days left");
        _lock(B, 4 * MIN, 400 days);
        assertEq(V.lockFactor(B), 15_000, "4x the minimum and >= 90 days: the ceiling");
        assertEq(V.lockFactor(N), 0, "no lock");
        _lock(N, 30 * MIN, 400 days);
        assertEq(V.lockFactor(N), 15_000, "never above the ceiling");
    }
    /* mutants 2026-11-11: the VIEWS must say 0 too (the app shows owed() as "what you would get") */
    function test_views_say_zero_below_minimum_or_not_committed() public {
        _lock(A, MIN - 1, 60 days);      /* below the $15 minimum */
        _lock(B, MIN, 8 days);           /* committed, but < 7 days left at the claim */
        _week(100_000e18);
        assertEq(V.lockFactor(A), 0, "below the minimum: factor 0");
        (uint256 sA, uint256 bA) = V.owed(0, A);
        assertEq(sA + bA, 0, "below the minimum: owes nothing, even as the top player");
        assertEq(V.lockFactor(B), 0, "not committed 7 days ahead: factor 0");
        (uint256 sB,) = V.owed(0, B);
        assertEq(sB, 0, "not committed: owes nothing");
    }
    function test_top_bonus_is_weighted_by_the_lock_too() public {
        _lock(A, MIN, 14 days);          /* A is the top player, with a small/short lock */
        uint256 budget = _week(100_000e18);
        (, uint256 bA) = V.owed(0, A);
        uint256 f = V.lockFactor(A);
        assertLt(f, 15_000);
        assertEq(bA, budget * 2_000 / 10_000 * f / 15_000, "top bonus x lockFactor / MAX_FACTOR");
    }
    function test_bigger_longer_lock_gets_more_never_above_play_share() public {
        _lock(A, MIN, 14 days);          /* small, short */
        _lock(B, 4 * MIN, 400 days);     /* big, long */
        uint256 budget = _week(100_000e18);
        (uint256 sA,) = V.owed(0, A); (uint256 sB,) = V.owed(0, B);
        uint256 baseA = budget * 8_000 / 10_000 * 3 / 4; uint256 baseB = budget * 8_000 / 10_000 * 1 / 4;
        assertEq(sB, baseB, "the max lock gets its full play share");
        assertLt(sA, baseA, "a smaller/shorter lock gets less than its full play share");
        assertEq(sA, baseA * V.lockFactor(A) / 15_000);
    }
    function test_every_claim_together_never_exceeds_the_budget() public {
        _lock(A, 4 * MIN, 400 days); _lock(B, 4 * MIN, 400 days);
        uint256 budget = _week(100_000e18);
        vm.prank(A); uint256 pa = V.claim(0); vm.prank(B); uint256 pb = V.claim(0);
        assertLe(pa + pb, budget); assertEq(V.reserved(), budget - pa - pb);
    }
    function test_never_more_than_half_of_what_was_burned() public {
        _lock(A, 4 * MIN, 400 days); _lock(B, 4 * MIN, 400 days);
        _week(100_000_000e18);
        (uint256 sA, uint256 bA) = V.owed(0, A);
        assertLe(sA, 150_000e18); assertLe(bA, 150_000e18);
    }
    function test_constructor_needs_the_lock() public {
        TBlockVaultV2.Config memory c = TBlockVaultV2.Config({ tblock: address(t), likes: address(L), contest: address(new FakeContest2()), lock: address(0),
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: 50_000_000e18, claimWindow: 7 days,
            maxFeedPerCall: 862_000e18, feedCooldown: 1 days, dev: address(this), dev2: D2 });
        vm.expectRevert(TBlockVaultV2.BadParams.selector); new TBlockVaultV2(c);
        c.lock = address(0xDEAD); vm.expectRevert(TBlockVaultV2.BadParams.selector); new TBlockVaultV2(c);
    }
    /* review SEC-002: the minimum is photographed at close; an honest price move after it does not take an earned share away */
    function test_price_move_after_close_keeps_an_earned_claim() public {
        _lock(A, MIN, 60 days);
        _week(100_000e18);
        assertEq(V.minHoldAt(0), MIN, "photographed at close");
        L.setMin(MIN * 101 / 100);                                  /* TBLOCK -1 %: the $15 minimum now asks 1 % more */
        assertEq(V.needFor(0), MIN, "the lower of the photo and now");
        vm.prank(A); uint256 paid = V.claim(0);
        assertGt(paid, 0, "claimed with exactly the minimum photographed at close");
        L.setMin(MIN * 99 / 100);
        assertEq(V.needFor(0), MIN * 99 / 100, "and a lower minimum now applies too");
    }
    function test_a_week_not_closed_uses_the_minimum_now() public {
        assertEq(V.minHoldAt(5), 0); assertEq(V.needFor(5), MIN);
    }
    /* review SEC-004: the vault refuses a hearts contract wired to another lock */
    function test_constructor_refuses_a_different_lock_in_the_hearts() public {
        TBlockLock other = new TBlockLock(address(t));
        FakeLikesV2 L2 = new FakeLikesV2(G, EP, MIN, address(other));
        FakeContest2 c2 = new FakeContest2();
        vm.expectRevert(TBlockVaultV2.BadParams.selector);
        new TBlockVaultV2(TBlockVaultV2.Config({ tblock: address(t), likes: address(L2), contest: address(c2), lock: address(K),
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: 50_000_000e18, claimWindow: 7 days,
            maxFeedPerCall: 862_000e18, feedCooldown: 1 days, dev: address(this), dev2: D2 }));
    }
    function testFuzz_claims_bounded_by_budget(uint96 la, uint96 lb, uint32 da, uint32 db) public {
        la = uint96(bound(la, MIN, 20 * MIN)); lb = uint96(bound(lb, MIN, 20 * MIN));
        _lock(A, la, bound(da, 15 days, 4 * 365 days)); _lock(B, lb, bound(db, 15 days, 4 * 365 days));
        uint256 budget = _week(1_000_000e18);
        vm.prank(A); uint256 pa = V.claim(0); vm.prank(B); uint256 pb = V.claim(0);
        assertLe(pa + pb, budget);
        assertLe(pa, 150_000e18 * 2); assertLe(pb, 50_000e18 * 2);
    }
}
