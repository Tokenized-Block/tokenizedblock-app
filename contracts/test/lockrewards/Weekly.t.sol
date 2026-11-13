// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockLockRewardsWeekly} from "../../src/TBlockLockRewardsWeekly.sol";

/// Unit tests of TBlockLockRewardsWeekly (R2, Phil 2026-11-13 "weekly paid"). Mocks only: the real-contract wiring is the fork test.
/// NE PROUVE PAS: the real V.playOf / Likes grid / B20 TBLOCK (see Weekly.fork.t.sol).
contract WToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a && balanceOf[f] >= a, "tf");
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "t"); balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
}

contract WLock {
    address public TBLOCK;
    mapping(address => uint256) public lockedOf;
    mapping(address => uint256) public unlockAtOf;
    mapping(address => uint256) public requestedAtOf;
    constructor(address t) { TBLOCK = t; }
    function set(address a, uint256 amt, uint256 at) external { lockedOf[a] = amt; unlockAtOf[a] = at; }
    function request(address a) external { requestedAtOf[a] = block.timestamp; }
}

contract WLikes {
    uint64 public GENESIS; uint64 public EPOCH; address public LOCK; address public TBLOCK;
    constructor(uint64 g, uint64 e, address l, address t) { GENESIS = g; EPOCH = e; LOCK = l; TBLOCK = t; }
}

contract WVault {
    address public LIKES; address public LOCK; address public TBLOCK;
    mapping(uint256 => mapping(address => uint256)) public playOf;
    constructor(address li, address l, address t) { LIKES = li; LOCK = l; TBLOCK = t; }
    function play(uint256 e, address p) external { playOf[e][p] += 1; }
}

contract WeeklyTest is Test {
    WToken tb; WToken wt; WLock lock; WLikes likes; WVault vault; TBlockLockRewardsWeekly r;
    address guardian = address(0x6A);
    address alice = address(0xA1); address bob = address(0xB0); address carol = address(0xC0);
    uint64 constant G = 1794355200; // the real Likes GENESIS (read on chain 2026-11-13)
    uint256 constant WEEK = 7 days;

    function setUp() public {
        vm.warp(G + 2 * WEEK + 3 days); // deploy in week 2
        tb = new WToken(); wt = new WToken();
        lock = new WLock(address(tb));
        likes = new WLikes(G, uint64(WEEK), address(lock), address(tb));
        vault = new WVault(address(likes), address(lock), address(tb));
        r = new TBlockLockRewardsWeekly(address(tb), address(wt), address(lock), address(vault), guardian, 0.25 ether, 12_500_000 ether);
    }

    function _fund(uint256 a0, uint256 a1) internal { wt.mint(address(r), a0); tb.mint(address(r), a1); }
    function _one(uint256 e) internal pure returns (uint256[] memory a) { a = new uint256[](1); a[0] = e; }
    function _endOf(uint256 e) internal view returns (uint256) { return r.epochEnd(e); }

    function test_grid_isTheLikesGrid_andStartsAtTheDeployWeek() public view {
        assertEq(r.T0(), G); assertEq(r.EPOCH(), WEEK); assertEq(r.START_EPOCH(), 2); assertEq(r.currentEpoch(), 2);
        assertEq(r.nextEpochToClose(), 2); assertEq(r.nextEpochToRelease(), 2);
    }

    function test_ctor_refusesAnotherGridOrWiring() public {
        WLikes l2 = new WLikes(G, uint64(30 days), address(lock), address(tb));
        WVault v2 = new WVault(address(l2), address(lock), address(tb));
        vm.expectRevert(TBlockLockRewardsWeekly.BadConfig.selector);
        new TBlockLockRewardsWeekly(address(tb), address(wt), address(lock), address(v2), guardian, 1, 1);
        WLock lock2 = new WLock(address(tb));
        WVault v3 = new WVault(address(likes), address(lock2), address(tb));
        vm.expectRevert(TBlockLockRewardsWeekly.BadConfig.selector);
        new TBlockLockRewardsWeekly(address(tb), address(wt), address(lock), address(v3), guardian, 1, 1);
        vm.expectRevert(TBlockLockRewardsWeekly.BadConfig.selector);
        new TBlockLockRewardsWeekly(address(tb), address(wt), address(lock), address(vault), guardian, 0, 1);
    }

    function _close(uint256 e) internal { vm.warp(_endOf(e) + 1 days); r.closeEpoch(e); }
    function _mark(address who, uint256 e) internal { vault.play(e, who); r.markPlayed(who, e); }

    function test_enroll_countsFromNextWeek_firstPayoutWithinTwoWeeks() public {
        lock.set(alice, 1000 ether, block.timestamp + 60 days);
        r.enroll(alice);
        assertEq(r.weightOf(alice, 2), 0);
        assertEq(r.weightOf(alice, 3), 1000 ether * 12_500 / 10_000); // 60 days committed: band x1.25
        _fund(10 ether, 1000 ether); // 7% of 10 = 0.7 > the 0.25 cap: the cap is what pays
        _close(2);
        (uint256 p0,) = r.pot(2); assertEq(p0, 0, "week 2: nobody marked, nothing assigned");
        vm.warp(_endOf(2) + 2 days); _mark(alice, 3);
        _close(3);
        assertLe(block.timestamp - (G + 2 * WEEK + 3 days), 13 days, "first payout within ~2 weeks of the enroll");
        vm.prank(alice); (uint256 a0, uint256 a1) = r.claim(_one(3));
        assertEq(a0, 0.25 ether, "capped weekly pot, alone = all of it");
        assertEq(a1, 70 ether, "7% of the stock");
        assertEq(wt.balanceOf(alice), a0); assertEq(tb.balanceOf(alice), a1);
    }

    function test_nonPlayersPart_isNeverAssigned_staysInTheStock() public {
        lock.set(alice, 100 ether, block.timestamp + 60 days);
        lock.set(bob, 300 ether, block.timestamp + 60 days);
        r.enroll(alice); r.enroll(bob);
        _fund(0, 4000 ether);
        _close(2);
        vm.warp(_endOf(2) + 2 days); _mark(alice, 3);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotPlayed.selector, 3)); r.markPlayed(bob, 3);
        _close(3);
        (, uint256 pot1) = r.pot(3); assertEq(pot1, 280 ether * 100 / 400, "pot = full x P / W, the rule of R");
        (, uint256 o1) = r.outstanding(); assertEq(o1, 70 ether, "only the players part is reserved (review MEDIUM-1)");
        vm.prank(bob); vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotPlayed.selector, 3)); r.claim(_one(3));
        vm.prank(alice); (, uint256 a1) = r.claim(_one(3));
        assertEq(a1, 70 ether, "alice = full x w / W, as in R");
    }

    function test_nobodyPlays_nothingIsReserved_weekAfterWeek() public {
        lock.set(bob, 300 ether, block.timestamp + 200 days); r.enroll(bob);
        _fund(0, 1000 ether);
        for (uint256 e = 2; e < 12; e++) _close(e);
        assertEq(r.unassigned(address(tb)), 1000 ether, "no play, no starvation: the whole stock stays free");
    }

    function test_mark_window_andAnyoneCanMark() public {
        lock.set(alice, 100 ether, block.timestamp + 60 days); r.enroll(alice);
        vault.play(3, alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotMarkable.selector, 3)); r.markPlayed(alice, 3);
        vm.warp(_endOf(2) + 1 hours);
        vm.prank(carol); r.markPlayed(alice, 3);
        assertTrue(r.marked(alice, 3)); assertEq(r.playedWeight(3), 100 ether * 12_500 / 10_000);
        r.markPlayed(alice, 3); assertEq(r.playedWeight(3), 100 ether * 12_500 / 10_000, "twice = once");
        _close(2); _close(3);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotMarkable.selector, 3)); r.markPlayed(alice, 3);
    }

    function test_closeWaitsTheGraceDay() public {
        vm.warp(_endOf(2));
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.EpochNotEnded.selector, 2)); r.closeEpoch(2);
        vm.warp(_endOf(2) + 1 days); r.closeEpoch(2);
    }

    function test_playInAnotherWeek_doesNotCount() public {
        lock.set(alice, 100 ether, block.timestamp + 60 days);
        r.enroll(alice); _fund(0, 100 ether);
        vault.play(4, alice);
        _close(2);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotPlayed.selector, 3)); r.markPlayed(alice, 3);
        _close(3);
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotPlayed.selector, 3)); r.claim(_one(3));
    }

    function test_claims_neverExceedThePot_andOnlyOnce() public {
        lock.set(alice, 1 ether, block.timestamp + 60 days); lock.set(bob, 2 ether, block.timestamp + 60 days); lock.set(carol, 7 ether, block.timestamp + 60 days);
        r.enroll(alice); r.enroll(bob); r.enroll(carol);
        _fund(0.333 ether, 3333);
        _close(2);
        vm.warp(_endOf(2) + 2 days); _mark(alice, 3); _mark(bob, 3); _mark(carol, 3);
        _close(3);
        (uint256 p0, uint256 p1) = r.pot(3);
        uint256 s0; uint256 s1;
        address[3] memory who = [alice, bob, carol];
        for (uint256 i; i < 3; i++) { vm.prank(who[i]); (uint256 a, uint256 b) = r.claim(_one(3)); s0 += a; s1 += b; }
        assertLe(s0, p0); assertLe(s1, p1);
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.AlreadyClaimed.selector, 3)); r.claim(_one(3));
    }

    function test_exitAfterMark_voidsThePlay() public {
        lock.set(alice, 100 ether, block.timestamp + 60 days); r.enroll(alice);
        vm.warp(_endOf(2) + 1 days);
        _mark(alice, 3);
        lock.request(alice); r.sync(alice);
        assertEq(r.weightOf(alice, 3), 0); assertEq(r.playedWeight(3), 0, "the cut weight left the played sum");
        _fund(0, 100 ether);
        _close(2); _close(3);
        assertEq(r.totalWeight(3), 0);
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NoWeight.selector, 3)); r.claim(_one(3));
    }

    function test_releaseReturnsUnclaimedPlayersPart() public {
        lock.set(alice, 100 ether, block.timestamp + 60 days); r.enroll(alice); _fund(0, 1000 ether);
        _close(2); vm.warp(_endOf(2) + 2 days); _mark(alice, 3); _close(3);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.ReleaseTooEarly.selector, 2)); r.release();
        vm.warp(r.closedAt(3) + 8 * WEEK); r.release(); r.release();
        assertEq(r.unassigned(address(tb)), 1000 ether, "alice never claimed: back in the stock");
    }

    function test_cannotClaimOrCloseEarly_orOutOfOrder() public {
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.EpochNotEnded.selector, 2)); r.closeEpoch(2);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.EpochOutOfOrder.selector, 2)); r.closeEpoch(1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.EpochNotClosed.selector, 2)); r.claim(_one(2));
    }

    function test_rescue_onlyGuardian_after72h() public {
        _fund(0, 100 ether);
        vm.expectRevert(TBlockLockRewardsWeekly.NotGuardian.selector); r.rescueRequest(address(tb), alice, 1);
        vm.prank(guardian); r.rescueRequest(address(tb), guardian, 40 ether);
        vm.prank(guardian); vm.expectRevert(); r.rescueExecute();
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian); r.rescueExecute();
        assertEq(tb.balanceOf(guardian), 40 ether);
    }

    function test_deposit_andPlainTransfer_bothFeedTheStock() public {
        tb.mint(alice, 10 ether);
        vm.startPrank(alice); tb.approve(address(r), 4 ether); r.deposit(address(tb), 4 ether); tb.transfer(address(r), 6 ether); vm.stopPrank();
        assertEq(r.unassigned(address(tb)), 10 ether);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotRewardToken.selector, address(0xdead))); r.deposit(address(0xdead), 1);
    }
}
