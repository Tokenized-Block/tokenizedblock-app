// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockLikesV2} from "../../src/BlockLikesV2.sol";
import {TBlockLock} from "../../src/TBlockLock.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";

/// plain 18-decimal token: mint, approve, transferFrom, transfer
contract HeartToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
    function transfer(address to, uint256 a) external returns (bool) {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// a rewards contract whose recordPlay burns every gas unit it is given
contract GasEaterRewards {
    function isGame(address) external pure returns (bool) { return true; }
    function recordPlay(address) external pure {
        while (true) {}
    }
}

/// a rewards contract that tries to heart again from inside the record (re-entry)
contract ReenteringRewards {
    BlockLikesV2 public likes;
    bool public reentryFailed;
    function setLikes(BlockLikesV2 l) external { likes = l; }
    function isGame(address) external pure returns (bool) { return true; }
    function recordPlay(address) external {
        try likes.like(address(0xb200000000000000000000e4B0c5fBE9C8DF579E), 1) { } catch { reentryFailed = true; }
    }
}

/// Phil 2026-11-12: "a HEART counts as play everywhere". BlockLikesV2.like() records the heart in TBlockLockRewards (recordPlay(payer),
/// the same capped path as TamArtV2 / BlockSkins v3), and the lock rewards list [Likes, ...] with the two-way check REWARDS() == R.
/// Fixture values only (Phil 2026-11-12): t0 = 2026-11-12 00:00 UTC, caps 1 wtCOIN and 50,000,000 TBLOCK, guardian = DEV of the
/// economie-v2 record, keeper = makeAddr("likes-keeper") until Phil creates the keeper wallet.
contract HeartPlayTest is Test {
    uint256 constant T0 = 1_794_441_600;              // Date.UTC(2026, 10, 12) / 1000, computed with node
    uint64 constant GENESIS = 1_794_355_200;          // likes genesis of economie-v2-deploiement.js
    uint256 constant START = 5_516_735_596_691;       // startPrice of economie-v2-deploiement.js
    uint256 constant CAP_WT = 1e18;                   // 1 wtCOIN per epoch
    uint256 constant CAP_TB = 50_000_000e18;          // 50,000,000 TBLOCK per epoch (5e25 raw)
    uint256 constant LOCKED = 10_000_000e18;
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;
    address constant BLOC = 0xb200000000000000000000e4B0c5fBE9C8DF579E; // a B20 block

    HeartToken tb;
    HeartToken wt;
    TBlockLock lock;
    BlockLikesV2 likes;
    TBlockLockRewards rewards;

    address DEPLOYER = makeAddr("pack-wallet");
    address KEEPER = makeAddr("likes-keeper");
    address DEV;   // economie-v2-deploiement.js likes.config.dev, also the guardian fixture
    address DEV2;  // economie-v2-deploiement.js likes.config.dev2
    address alice = makeAddr("alice"); // locked, hearts only
    address dave = makeAddr("dave");   // locked, plays nothing

    function _cfg(address r) internal view returns (BlockLikesV2.Config memory) {
        return BlockLikesV2.Config({tblock: address(tb), lock: address(lock), genesis: GENESIS, epoch: 7 days, likeUsdE18: 5e17,
            holdUsdE18: 15e18, priceFloor: START / 50, priceCeil: START * 100, startPrice: START, maxStepBps: 1_000,
            minInterval: 1 hours, keeper: KEEPER, dev: DEV, dev2: DEV2, rewards: r});
    }

    function _one(address a) internal pure returns (address[] memory g) {
        g = new address[](1);
        g[0] = a;
    }

    function _newRewards(address[] memory games) internal returns (TBlockLockRewards) {
        return new TBlockLockRewards(address(tb), address(wt), address(lock), address(0), DEV, T0, CAP_WT, CAP_TB, games);
    }

    function setUp() public {
        DEV = vm.parseAddress("0x264496cc303f8dbe49a241ea84cd42be8392bc80");
        DEV2 = vm.parseAddress("0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b");
        vm.warp(T0 + 1 hours);
        tb = new HeartToken();
        wt = new HeartToken();
        lock = new TBlockLock(address(tb));
        // one wallet: Likes at nonce n with R = addr(n + 1) predicted, then the rewards listing it (the pack puts R at n + 5)
        uint256 n = vm.getNonce(DEPLOYER);
        address R = vm.computeCreateAddress(DEPLOYER, n + 1);
        vm.startPrank(DEPLOYER, DEPLOYER);
        likes = new BlockLikesV2(_cfg(R));
        rewards = _newRewards(_one(address(likes)));
        vm.stopPrank();
        assertEq(address(rewards), R, "rewards at the predicted address");
        assertEq(likes.REWARDS(), address(rewards));
        assertTrue(likes.wired());
        assertTrue(rewards.isGame(address(likes)));
        _locker(alice);
        _locker(dave);
    }

    function _locker(address p) internal {
        tb.mint(p, 2 * LOCKED);
        vm.startPrank(p);
        tb.approve(address(lock), type(uint256).max);
        tb.approve(address(likes), type(uint256).max);
        lock.lock(LOCKED, T0 + 300 days);
        vm.stopPrank();
        rewards.enroll(p); // weight from epoch 1 on
    }

    function _toEpoch1() internal {
        vm.warp(T0 + 30 days + 1 hours);
        assertEq(rewards.currentEpoch(), 1);
    }

    // ------------------------------------------------------------------ a heart records a play
    function test_heart_recordsPlayInLockRewards() public {
        _toEpoch1();
        uint256 w = rewards.weightOf(alice, 1);
        assertGt(w, 0);
        uint256 e = likes.currentEpoch();
        uint256 deadBefore = tb.balanceOf(DEAD);
        vm.expectEmit(true, true, true, true, address(rewards));
        emit TBlockLockRewards.Played(alice, address(likes), 1, w);
        vm.prank(alice);
        uint256 burned = likes.like(BLOC, 3);
        assertEq(burned, 3 * likes.likePrice());
        assertEq(tb.balanceOf(DEAD) - deadBefore, burned, "the hearts burned their TBLOCK");
        assertEq(likes.spentIn(e, alice), burned, "vault side unchanged: the TBLOCK burned is the heart's weight in spentIn");
        assertTrue(rewards.hasPlayed(alice, 1), "lock rewards: a heart is a play of the month");
        assertEq(rewards.playedWeight(1), w, "lock rewards weight = alice's LOCK weight (recordPlay takes no amount)");
        // more hearts the same month: more TBLOCK burned, still one play in the lock rewards
        vm.prank(alice);
        uint256 burned2 = likes.like(BLOC, 2);
        assertEq(likes.spentIn(e, alice), burned + burned2);
        assertEq(rewards.playedWeight(1), w, "counted once per month");
        assertFalse(rewards.hasPlayed(dave, 1), "dave hearted nothing");
    }

    // ------------------------------------------------------------------ a like never fails because of the record
    function test_like_neverFailsBecauseOfTheRecord() public {
        _toEpoch1();
        uint256 e = likes.currentEpoch();
        // (1) the rewards contract reverts on recordPlay: the heart still burns and counts
        vm.mockCallRevert(address(rewards), abi.encodeWithSelector(TBlockLockRewards.recordPlay.selector), "rewards down");
        vm.prank(alice);
        uint256 b1 = likes.like(BLOC, 1);
        assertEq(likes.spentIn(e, alice), b1, "hearted with the record reverting");
        assertFalse(rewards.hasPlayed(alice, 1));
        vm.clearMockedCalls();

        // (2) a Likes wired to a rewards contract that eats all gas: capped at PLAY_GAS, the heart goes through
        GasEaterRewards eater = new GasEaterRewards();
        BlockLikesV2 l2 = new BlockLikesV2(_cfg(address(eater)));
        vm.startPrank(alice);
        tb.approve(address(l2), type(uint256).max);
        uint256 g0 = gasleft();
        uint256 b2 = l2.like(BLOC, 1);
        uint256 used = g0 - gasleft();
        vm.stopPrank();
        assertEq(l2.spentIn(e, alice), b2, "hearted with a gas-eating record");
        assertLt(used, 300_000, "the record took at most PLAY_GAS");

        // (3) a Likes wired to an address with no code (rewards not deployed yet): hearts work, nothing is recorded
        BlockLikesV2 l3 = new BlockLikesV2(_cfg(makeAddr("not-deployed-yet")));
        assertFalse(l3.wired());
        vm.startPrank(alice);
        tb.approve(address(l3), type(uint256).max);
        uint256 b3 = l3.like(BLOC, 1);
        vm.stopPrank();
        assertEq(l3.spentIn(e, alice), b3);

        // (4) a rewards contract that re-enters like() from recordPlay: the re-entry is refused (Locked), the outer heart succeeds
        ReenteringRewards re = new ReenteringRewards();
        BlockLikesV2 l4 = new BlockLikesV2(_cfg(address(re)));
        re.setLikes(l4);
        vm.startPrank(alice);
        tb.approve(address(l4), type(uint256).max);
        uint256 b4 = l4.like(BLOC, 1);
        vm.stopPrank();
        assertTrue(re.reentryFailed(), "re-entry refused");
        assertEq(l4.spentIn(e, alice), b4, "exactly one heart counted");
        assertEq(l4.totalLikes(), 1);
    }

    // ------------------------------------------------------------------ gas sweep: no heart succeeds without its record
    function test_gasSweep_noLikeSucceedsWithoutItsRecord() public {
        _toEpoch1();
        uint256 e = likes.currentEpoch();
        uint256 firstOk;
        uint256 guardHits;
        uint256 oks;
        for (uint256 gl = 40_000; gl <= 400_000; gl += 1_000) {
            uint256 snap = vm.snapshotState();
            uint256 balBefore = tb.balanceOf(alice);
            vm.prank(alice);
            (bool ok, bytes memory ret) = address(likes).call{gas: gl}(abi.encodeCall(BlockLikesV2.like, (BLOC, 1)));
            if (ok) {
                oks++;
                assertTrue(rewards.hasPlayed(alice, 1), "a successful heart always carries its rewards record");
                assertEq(rewards.playedWeight(1), rewards.weightOf(alice, 1));
                assertGt(likes.spentIn(e, alice), 0);
                if (firstOk == 0) firstOk = gl;
            } else {
                assertEq(tb.balanceOf(alice), balBefore, "a failed heart burns nothing");
                if (ret.length == 4 && bytes4(ret) == BlockLikesV2.PlayGasTooLow.selector) guardHits++;
            }
            vm.revertToState(snap);
        }
        assertGt(firstOk, 0, "some limit hearts");
        assertGt(guardHits, 0, "the PlayGasTooLow guard itself was hit");
        console.log("lowest like() gas limit that hearts (1,000 steps), PlayGasTooLow hits, successes", firstOk, guardHits, oks);
    }

    // ------------------------------------------------------------------ two-way check
    function test_twoWay_rewardsRefusesLikesWiredToAnotherR() public {
        // a Likes that names another rewards address cannot be listed
        BlockLikesV2 other = new BlockLikesV2(_cfg(makeAddr("another-R")));
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRewards(_one(address(other)));
        // the predicted R is taken by a stray transaction: the rewards lands elsewhere and refuses the Likes that named R
        uint256 n = vm.getNonce(DEPLOYER);
        address R = vm.computeCreateAddress(DEPLOYER, n + 1);
        vm.startPrank(DEPLOYER, DEPLOYER);
        BlockLikesV2 l = new BlockLikesV2(_cfg(R));
        new HeartToken(); // the stray transaction uses nonce n + 1
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRewards(_one(address(l)));
        vm.stopPrank();
        assertGt(R.code.length, 0, "R holds the stray contract, not a rewards");
        assertFalse(l.wired());
        // control: the Likes deployed in setUp names the rewards that lists it
        assertEq(likes.REWARDS(), address(rewards));
    }

    function test_likesCtor_refusesBadRewards() public {
        BlockLikesV2.Config memory c = _cfg(address(0));
        vm.expectRevert(BlockLikesV2.BadParams.selector);
        new BlockLikesV2(c);
        address[5] memory bad = [address(tb), address(lock), KEEPER, DEV, DEV2];
        for (uint256 i; i < bad.length; i++) {
            c = _cfg(bad[i]);
            vm.expectRevert(BlockLikesV2.BadParams.selector);
            new BlockLikesV2(c);
        }
        // its own address
        address self = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        c = _cfg(self);
        vm.expectRevert(BlockLikesV2.BadParams.selector);
        new BlockLikesV2(c);
    }

    // ------------------------------------------------------------------ a heart-only locker gets its monthly share, a non-player 0
    function test_heartOnlyLocker_getsMonthlyShare_nonPlayerZero() public {
        wt.mint(address(this), 10e18);
        tb.mint(address(this), 100_000_000e18);
        wt.approve(address(rewards), type(uint256).max);
        tb.approve(address(rewards), type(uint256).max);
        rewards.deposit(address(wt), 10e18);
        rewards.deposit(address(tb), 100_000_000e18);

        _toEpoch1();
        vm.prank(alice);
        likes.like(BLOC, 1); // alice's only play of month 1: one heart
        uint256 wA = rewards.weightOf(alice, 1);
        uint256 wD = rewards.weightOf(dave, 1);
        assertEq(wA, wD, "same lock, same weight");

        vm.warp(T0 + 60 days + 1 hours);
        rewards.closeEpoch(0);
        rewards.closeEpoch(1);
        // expected, from the rules: full = min(unassigned x 25 %, cap); pot = full x P / W; alice's share = pot x wA / P
        uint256 W = wA + wD;
        uint256 fullWt = 10e18 * 2_500 / 10_000;
        if (fullWt > CAP_WT) fullWt = CAP_WT;
        uint256 fullTb = 100_000_000e18 * 2_500 / 10_000;
        if (fullTb > CAP_TB) fullTb = CAP_TB;
        uint256 potWt = fullWt * wA / W;
        uint256 potTb = fullTb * wA / W;
        (uint256 pw, uint256 pt) = rewards.pot(1);
        assertEq(pw, potWt, "wtCOIN pot of month 1");
        assertEq(pt, potTb, "TBLOCK pot of month 1");

        uint256[] memory ep = new uint256[](1);
        ep[0] = 1;
        uint256 wtBefore = wt.balanceOf(alice);
        uint256 tbBefore = tb.balanceOf(alice);
        vm.prank(alice);
        (uint256 a0, uint256 a1) = rewards.claim(ep);
        assertEq(a0, potWt, "alice (hearts only) is paid her monthly wtCOIN share");
        assertEq(a1, potTb, "and her monthly TBLOCK share");
        assertGt(a0, 0);
        assertGt(a1, 0);
        assertEq(wt.balanceOf(alice) - wtBefore, a0);
        assertEq(tb.balanceOf(alice) - tbBefore, a1);
        // dave locked the same and played nothing: 0, and his part was never assigned
        vm.prank(dave);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, 1));
        rewards.claim(ep);
        assertEq(rewards.unassigned(address(wt)), 10e18 - a0, "dave's share stays unassigned for later months");
        console.log("heart-only locker month-1 share: wtCOIN raw, TBLOCK raw", a0, a1);
    }
}
