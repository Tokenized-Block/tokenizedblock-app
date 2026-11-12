// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {PlayGateBase, MockGame} from "./PlayGateBase.sol";

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "bal");
        balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a && balanceOf[f] >= a, "allow");
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}

/// mirrors TBlockLock v1's read surface; state set directly by the test
contract MockLock {
    address public TBLOCK;
    struct L { uint256 amount; uint256 unlockAt; uint256 requestedAt; }
    mapping(address => L) public locks;
    constructor(address t) { TBLOCK = t; }
    function set(address h, uint256 amount, uint256 unlockAt, uint256 requestedAt) external { locks[h] = L(amount, unlockAt, requestedAt); }
    function lockedOf(address a) external view returns (uint256) { return locks[a].amount; }
    function unlockAtOf(address a) external view returns (uint256) { return locks[a].unlockAt; }
    function requestedAtOf(address a) external view returns (uint256) { return locks[a].requestedAt; }
}

interface IUnlockCallback { function unlockCallback(bytes calldata) external returns (bytes memory); }

/// minimal v4-like PoolManager: ERC6909 balances, unlock -> callback, burn credits, take debits; deltas must net to zero
contract MockPoolManager {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;
    int256 public delta;
    bool public unlocked;
    function mint(address to, uint256 id, uint256 a) external { balanceOf[to][id] += a; }
    function unlock(bytes calldata data) external returns (bytes memory r) {
        unlocked = true;
        r = IUnlockCallback(msg.sender).unlockCallback(data);
        require(delta == 0, "CurrencyNotSettled");
        unlocked = false;
    }
    function burn(address from, uint256 id, uint256 a) external {
        require(unlocked && from == msg.sender, "burn");
        balanceOf[from][id] -= a; delta += int256(a);
    }
    function take(address currency, address to, uint256 a) external {
        require(unlocked, "locked");
        delta -= int256(a);
        MockERC20(currency).transfer(to, a);
    }
}

contract TBlockLockRewardsTest is PlayGateBase {
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
    uint256 constant MAXW = 1e30;
    uint256 constant MAXT = 1e40;

    function setUp() public {
        vm.warp(T0);
        tblock = new MockERC20();
        wt = new MockERC20();
        lock = new MockLock(address(tblock));
        pm = new MockPoolManager();
        (rw, game) = _deployRewards(address(tblock), address(wt), address(lock), address(pm), guardian, T0, MAXW, MAXT);
    }

    // ---------------------------------------------------------------- helpers
    function _fund(uint256 w, uint256 t) internal { wt.mint(address(rw), w); tblock.mint(address(rw), t); }
    function _one(uint256 e) internal pure returns (uint256[] memory a) { a = new uint256[](1); a[0] = e; }
    /// PLAY GATE port: every standard actor makes one paid play during epoch e (when e has not ended yet), then e is closed. With
    /// everyone playing, P == W and every pre-play-gate expectation of this file is unchanged (pot = full * W / W = full).
    function _close(uint256 e) internal {
        if (block.timestamp < T0 + (e + 1) * E) {
            if (block.timestamp < T0 + e * E) vm.warp(T0 + e * E);
            _play(alice); _play(bob); _play(carol); _play(stranger);
        }
        vm.warp(T0 + (e + 1) * E);
        rw.closeEpoch(e);
    }

    // ---------------------------------------------------------------- C4: bands pinned to points.js ENGAGEMENT
    // points.js: ENGAGEMENT = [[365, 20000], [180, 17500], [90, 15000], [30, 12500], [0, 10000]] (days, bps)
    function test_bandsMatchPointsJs() public view {
        uint256[5] memory dayMin = [uint256(365), 180, 90, 30, 0];
        uint256[5] memory bps = [uint256(20000), 17500, 15000, 12500, 10000];
        for (uint256 i = 0; i < 5; i++) {
            assertEq(rw.multiplierBps(dayMin[i] * 1 days), bps[i], "band at threshold");
            if (dayMin[i] > 0) assertEq(rw.multiplierBps(dayMin[i] * 1 days - 1), bps[i + 1], "band just below");
        }
        assertEq(rw.multiplierBps(0), 10000);
        assertEq(rw.multiplierBps(4 * 365 days), 20000);
    }

    // ---------------------------------------------------------------- enroll
    function test_enroll_weightAndWindow() public {
        // 100 days from now: band x1.5; epochs end at T0+30d,60d,90d,120d -> lastFull = epoch 2 (ends at 90d <= 100d)
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        assertEq(rw.weightOf(alice, 0), 0, "current epoch never counts");
        assertEq(rw.weightOf(alice, 1), 1500e18);
        assertEq(rw.weightOf(alice, 2), 1500e18);
        assertEq(rw.weightOf(alice, 3), 0, "epoch 3 ends after unlockAt");
        assertEq(rw.projectedTotalWeight(1), 1500e18);
        assertEq(rw.projectedTotalWeight(3), 0);
    }

    function test_enroll_eachBand() public {
        uint256[5] memory d = [uint256(400), 200, 120, 61, 60];
        uint256[5] memory bps = [uint256(20000), 17500, 15000, 12500, 12500];
        for (uint256 i = 0; i < 5; i++) {
            address h = address(uint160(0x1000 + i));
            lock.set(h, 1e18, T0 + d[i] * 1 days, 0);
            rw.enroll(h);
            assertEq(rw.weightOf(h, 1), 1e18 * bps[i] / 10000, "band weight");
        }
        // a 7..29 day lock (band x1) can never cover a whole NEXT 30-day epoch -> no weight, ever
        lock.set(carol, 1e18, T0 + 20 days, 0);
        rw.enroll(carol);
        assertEq(rw.weightOf(carol, 1), 0);
    }

    function test_enroll_strangerCannotLowerBand() public {
        lock.set(alice, 1000e18, T0 + 400 days, 0);
        vm.prank(alice);
        rw.enroll(alice);
        assertEq(rw.weightOf(alice, 1), 2000e18);
        // 50 days later a stranger re-enrolls: commitment still counted from the first sighting of this unlockAt
        vm.warp(T0 + 50 days);
        vm.prank(stranger);
        rw.enroll(alice);
        assertEq(rw.weightOf(alice, 2), 2000e18, "band kept");
        assertEq(rw.weightOf(alice, 1), 2000e18, "current epoch untouched");
    }

    function test_enroll_idempotentSameEpoch() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        rw.enroll(alice);
        rw.enroll(alice);
        assertEq(rw.projectedTotalWeight(1), 1500e18, "no double count");
        assertEq(rw.checkpointsOf(alice).length, 1);
    }

    function test_syncAfterRelock_topUpAndExtend() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + 35 days); // epoch 1
        // top-up + extend to 400 days from deploy (365 days from now): new commitment clock
        lock.set(alice, 3000e18, T0 + 400 days, 0);
        rw.enroll(alice);
        assertEq(rw.weightOf(alice, 1), 1500e18, "current epoch keeps old weight");
        assertEq(rw.weightOf(alice, 2), 6000e18, "x2 on 3000 from next epoch");
        assertEq(rw.weightOf(alice, 12), 6000e18);
        assertEq(rw.weightOf(alice, 13), 0, "epoch 13 ends at 420 d > 400 d");
        assertEq(rw.projectedTotalWeight(2), 6000e18);
        assertEq(rw.projectedTotalWeight(1), 1500e18);
    }

    function test_exitRequest_syncRemovesFromCurrentEpoch() public {
        lock.set(alice, 1000e18, T0 + 200 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + 65 days); // epoch 2
        lock.set(alice, 1000e18, T0 + 200 days, T0 + 65 days);
        vm.prank(stranger);
        rw.sync(alice);
        assertEq(rw.weightOf(alice, 1), 1750e18, "past epoch kept (200 d = x1.75)");
        assertEq(rw.weightOf(alice, 2), 0, "current epoch removed");
        assertEq(rw.projectedTotalWeight(2), 0);
        assertEq(rw.projectedTotalWeight(5), 0);
    }

    function test_syncNoOpWithoutRequest() public {
        lock.set(alice, 1000e18, T0 + 200 days, 0);
        rw.enroll(alice);
        rw.sync(alice);
        assertEq(rw.weightOf(alice, 1), 1750e18);
    }

    function test_lockExpiry_weightStopsAutomatically() public {
        lock.set(alice, 1000e18, T0 + 65 days, 0);
        rw.enroll(alice);
        assertEq(rw.weightOf(alice, 1), 1250e18);
        assertEq(rw.weightOf(alice, 2), 0);
        // after expiry + withdraw (amount 0), enroll/sync remove nothing more and the total is 0
        vm.warp(T0 + 70 days);
        lock.set(alice, 0, 0, 0);
        rw.sync(alice);
        rw.enroll(alice);
        assertEq(rw.projectedTotalWeight(2), 0);
        assertEq(rw.weightOf(alice, 1), 1250e18, "closed history kept");
    }

    // ---------------------------------------------------------------- epochs
    function test_monthRollover() public {
        assertEq(rw.currentEpoch(), 0);
        vm.warp(T0 + 30 days - 1);
        assertEq(rw.currentEpoch(), 0);
        vm.warp(T0 + 30 days);
        assertEq(rw.currentEpoch(), 1);
        rw.closeEpoch(0); // epoch 0 ended exactly now
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochNotEnded.selector, uint256(1)));
        rw.closeEpoch(1);
        assertEq(rw.epochStart(1), T0 + 30 days);
        assertEq(rw.epochEnd(1), T0 + 60 days);
    }

    function test_closeEpoch_notEnded_and_order() public {
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochNotEnded.selector, uint256(0)));
        rw.closeEpoch(0);
        vm.warp(T0 + 90 days - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochOutOfOrder.selector, uint256(0)));
        rw.closeEpoch(1);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochNotEnded.selector, uint256(2)));
        rw.closeEpoch(2);
    }

    function test_closeEpoch_idempotentPerEpoch() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        _fund(100e18, 0);
        _close(0);
        _close(1);
        (uint256 p,) = rw.pot(1);
        assertEq(p, 25e18);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochOutOfOrder.selector, uint256(2)));
        rw.closeEpoch(1);
        (uint256 p2,) = rw.pot(1);
        assertEq(p2, 25e18, "pot unchanged");
        (uint256 o,) = rw.outstanding();
        assertEq(o, 25e18);
    }

    function test_zeroLockerEpoch_leavesFundsUnassigned() public {
        _fund(100e18, 5e18);
        _close(0);
        (uint256 p0, uint256 p1) = rw.pot(0);
        assertEq(p0, 0);
        assertEq(p1, 0);
        assertEq(rw.unassigned(address(wt)), 100e18);
        assertEq(rw.unassigned(address(tblock)), 5e18);
    }

    function test_potCap() public {
        (TBlockLockRewards capped, MockGame cg) =
            _deployRewards(address(tblock), address(wt), address(lock), address(pm), guardian, T0, 10e18, 1e18);
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        capped.enroll(alice);
        wt.mint(address(capped), 1000e18); // 25% = 250 > cap 10
        tblock.mint(address(capped), 2e18); // 25% = 0.5 < cap 1
        vm.warp(T0 + 30 days);
        _playOn(cg, alice); // PLAY GATE port: alice plays epoch 1
        vm.warp(T0 + 60 days);
        capped.closeEpoch(0);
        capped.closeEpoch(1);
        (uint256 p0, uint256 p1) = capped.pot(1);
        assertEq(p0, 10e18, "wt capped");
        assertEq(p1, 0.5e18, "tblock under cap");
    }

    function test_rewardBpsOfUnassignedOnly() public {
        lock.set(alice, 1000e18, T0 + 200 days, 0);
        rw.enroll(alice);
        _fund(100e18, 0);
        _close(0);
        _close(1); // pot 25, unassigned 75
        _close(2); // pot 25% of 75 = 18.75
        (uint256 p,) = rw.pot(2);
        assertEq(p, 18.75e18);
        assertEq(rw.unassigned(address(wt)), 100e18 - 25e18 - 18.75e18);
    }

    // ---------------------------------------------------------------- claims
    function test_twoTokens_proRata() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0); // x1.5 -> 1500
        lock.set(bob, 1000e18, T0 + 65 days, 0);    // x1.25 -> 1250 (epoch 1 only)
        rw.enroll(alice);
        rw.enroll(bob);
        _fund(110e18, 11_000e18);
        _close(0);
        _close(1);
        // pot = 27.5 wt / 2750 TBLOCK, W = 2750
        vm.prank(alice);
        (uint256 a0, uint256 a1) = rw.claim(_one(1));
        assertEq(a0, 15e18);
        assertEq(a1, 1500e18);
        vm.prank(bob);
        (uint256 b0, uint256 b1) = rw.claim(_one(1));
        assertEq(b0, 12.5e18);
        assertEq(b1, 1250e18);
        assertEq(wt.balanceOf(alice), 15e18);
        assertEq(tblock.balanceOf(bob), 1250e18);
    }

    function test_claimOnlyByMsgSender() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        _fund(100e18, 0);
        _close(0);
        _close(1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NoWeight.selector, uint256(1)));
        rw.claim(_one(1));
        assertEq(wt.balanceOf(stranger), 0);
        assertEq(wt.balanceOf(alice), 0, "nobody can push alice's claim either");
    }

    function test_doubleClaimRefused() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        _fund(100e18, 0);
        _close(0);
        _close(1);
        vm.startPrank(alice);
        rw.claim(_one(1));
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.AlreadyClaimed.selector, uint256(1)));
        rw.claim(_one(1));
        uint256[] memory dup = new uint256[](2);
        dup[0] = 1; dup[1] = 1;
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.AlreadyClaimed.selector, uint256(1)));
        rw.claim(dup);
        vm.stopPrank();
    }

    function test_claimNotClosed_andTooMany() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochNotClosed.selector, uint256(1)));
        rw.claim(_one(1));
        uint256[] memory many = new uint256[](25);
        vm.prank(alice);
        vm.expectRevert(TBlockLockRewards.TooManyEpochs.selector);
        rw.claim(many);
    }

    function test_roundingDustNeverOverpays() public {
        // three holders with weights 1, 1, 1 (raw) and an odd pot: floor shares, dust stays outstanding
        lock.set(alice, 1, T0 + 100 days, 0);
        lock.set(bob, 1, T0 + 100 days, 0);
        lock.set(carol, 1, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        _fund(4, 4); // pot = 1 each token
        _close(0);
        _close(1);
        // weights: 1 * 15000 / 10000 = 1 each
        vm.prank(alice); rw.claim(_one(1));
        vm.prank(bob); rw.claim(_one(1));
        vm.prank(carol); rw.claim(_one(1));
        assertEq(wt.balanceOf(alice) + wt.balanceOf(bob) + wt.balanceOf(carol), 0, "1/3 floors to 0");
        (uint256 l0,) = rw.left(1);
        assertEq(l0, 1, "dust stays in the epoch");
    }

    function testFuzz_sumOfClaimsLePot(uint96 a, uint96 b, uint96 c, uint128 fund) public {
        vm.assume(a > 0 && b > 0 && c > 0 && fund > 0);
        lock.set(alice, a, T0 + 100 days, 0);
        lock.set(bob, b, T0 + 200 days, 0);
        lock.set(carol, c, T0 + 400 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        _fund(fund, fund);
        _close(0);
        _close(1);
        (uint256 p0, uint256 p1) = rw.pot(1);
        address[3] memory hs = [alice, bob, carol];
        uint256 s0;
        uint256 s1;
        for (uint256 i = 0; i < 3; i++) {
            if (rw.weightOf(hs[i], 1) == 0) continue;
            vm.prank(hs[i]);
            (uint256 x0, uint256 x1) = rw.claim(_one(1));
            s0 += x0; s1 += x1;
        }
        assertLe(s0, p0);
        assertLe(s1, p1);
        assertGe(wt.balanceOf(address(rw)), 0);
        (uint256 o0, uint256 o1) = rw.outstanding();
        assertEq(o0, p0 - s0);
        assertEq(o1, p1 - s1);
    }

    function test_release_afterWindow() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        _fund(100e18, 0);
        _close(0);
        _close(1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.ReleaseTooEarly.selector, uint256(0)));
        rw.release();
        vm.warp(T0 + 5 * E); // current = 5 > 1 + 3
        rw.release(); // epoch 0 (empty)
        rw.release(); // epoch 1, unclaimed 25 back to unassigned
        assertEq(rw.unassigned(address(wt)), 100e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochReleased.selector, uint256(1)));
        rw.claim(_one(1));
    }

    // ---------------------------------------------------------------- funding
    function test_depositsByStrangers() public {
        wt.mint(stranger, 5e18);
        tblock.mint(stranger, 7e18);
        vm.startPrank(stranger);
        wt.approve(address(rw), 5e18);
        tblock.approve(address(rw), 7e18);
        rw.deposit(address(wt), 5e18);
        rw.deposit(address(tblock), 7e18);
        vm.stopPrank();
        assertEq(rw.unassigned(address(wt)), 5e18);
        assertEq(rw.unassigned(address(tblock)), 7e18);
        MockERC20 other = new MockERC20();
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotRewardToken.selector, address(other)));
        rw.deposit(address(other), 1);
    }

    function test_redeemDeferred() public {
        // the hook's fallback path: pm.mint(rewards, uint160(wtcoin), amount); the PM holds the tokens
        wt.mint(address(pm), 3e18);
        pm.mint(address(rw), uint256(uint160(address(wt))), 3e18);
        vm.prank(stranger);
        uint256 got = rw.redeemDeferred(address(wt));
        assertEq(got, 3e18);
        assertEq(wt.balanceOf(address(rw)), 3e18);
        assertEq(pm.balanceOf(address(rw), uint256(uint160(address(wt)))), 0);
        vm.expectRevert(TBlockLockRewards.NotPoolManager.selector);
        rw.unlockCallback(abi.encode(address(wt), uint256(1)));
    }

    // ---------------------------------------------------------------- rescue door
    function test_rescue_onlyGuardian_timelock_cancel() public {
        _fund(100e18, 0);
        vm.expectRevert(TBlockLockRewards.NotGuardian.selector);
        rw.rescueRequest(address(wt), stranger, 1);
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, 40e18);
        (address t, address to, uint256 amt, uint256 at) = rw.pendingRescue();
        assertEq(t, address(wt)); assertEq(to, guardian); assertEq(amt, 40e18); assertEq(at, T0 + 72 hours);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.RescuePending.selector, T0 + 72 hours));
        rw.rescueRequest(address(wt), guardian, 1);
        vm.warp(T0 + 72 hours - 1);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.RescueTooEarly.selector, T0 + 72 hours));
        rw.rescueExecute();
        vm.prank(guardian);
        rw.rescueCancel();
        (,,, uint256 at2) = rw.pendingRescue();
        assertEq(at2, 0);
        vm.warp(T0 + 100 hours);
        vm.prank(guardian);
        vm.expectRevert(TBlockLockRewards.NoRescuePending.selector);
        rw.rescueExecute();
        assertEq(wt.balanceOf(guardian), 0);
    }

    function test_rescue_fromUnassigned() public {
        _fund(100e18, 0);
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, 40e18);
        vm.warp(T0 + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute();
        assertEq(wt.balanceOf(guardian), 40e18);
        assertEq(rw.unassigned(address(wt)), 60e18);
    }

    function test_rescue_cutsAssignedEpoch_claimsStayConsistent() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0); // 1500
        lock.set(bob, 1000e18, T0 + 100 days, 0);   // 1500
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 0);
        _close(0);
        _close(1); // pot 25, outstanding 25, unassigned 75
        // lockers claim during the 72 h
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, 90e18);
        vm.prank(alice);
        (uint256 a,) = rw.claim(_one(1));
        assertEq(a, 12.5e18);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute(); // 75 unassigned + 12.5 left in epoch 1 -> only 87.5 there; takes 75 + 12.5? amount 90 > balance 87.5
        assertEq(wt.balanceOf(guardian), 87.5e18, "capped at balance");
        (uint256 l,) = rw.left(1);
        assertEq(l, 0);
        // bob's claim does not revert and pays what is left (0); recorded as claimed
        vm.prank(bob);
        (uint256 b,) = rw.claim(_one(1));
        assertEq(b, 0);
        assertTrue(rw.claimed(bob, 1));
        (uint256 o,) = rw.outstanding();
        assertEq(o, 0);
        assertEq(wt.balanceOf(address(rw)), 0);
    }

    function test_rescue_partialCut_proRataReduced() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 0);
        _close(0);
        _close(1); // pot 25, unassigned 75
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, 80e18); // 75 free + 5 from epoch 1
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute();
        (uint256 c,) = rw.cut(1);
        assertEq(c, 5e18);
        vm.prank(alice);
        (uint256 a,) = rw.claim(_one(1));
        vm.prank(bob);
        (uint256 b,) = rw.claim(_one(1));
        assertEq(a, 10e18);
        assertEq(b, 10e18);
        assertEq(wt.balanceOf(address(rw)), 0);
    }

    function test_rescue_onlyRewardTokens_andRenounce() public {
        MockERC20 other = new MockERC20();
        vm.startPrank(guardian);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotRewardToken.selector, address(other)));
        rw.rescueRequest(address(other), guardian, 1);
        rw.rescueRequest(address(wt), guardian, 1);
        rw.renounceGuardian();
        vm.expectRevert(TBlockLockRewards.NotGuardian.selector);
        rw.rescueRequest(address(wt), guardian, 1);
        vm.stopPrank();
        assertEq(rw.guardian(), address(0));
        (,,, uint256 at) = rw.pendingRescue();
        assertEq(at, 0, "pending request dropped");
        vm.warp(T0 + 100 hours);
        vm.prank(address(0));
        vm.expectRevert(TBlockLockRewards.NotGuardian.selector);
        rw.rescueExecute();
    }

    function test_constructorChecks() public {
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        address[] memory gs = _games(address(game));
        new TBlockLockRewards(address(wt), address(tblock), address(lock), address(pm), guardian, T0, 1, 1, gs); // lock.TBLOCK mismatch
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.TokenHasNoCode.selector, address(0xdead)));
        new TBlockLockRewards(address(0xdead), address(wt), address(lock), address(pm), guardian, T0, 1, 1, gs);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        new TBlockLockRewards(address(tblock), address(wt), address(lock), address(pm), guardian, T0 + 1, 1, 1, gs); // future t0
    }
}
