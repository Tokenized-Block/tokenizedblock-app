// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2, Vm} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {PlayRecorder} from "../../src/PlayRecorder.sol";
import {MockERC20, MockLock, MockPoolManager} from "./TBlockLockRewards.t.sol";
import {PlayGateBase, MockGame} from "./PlayGateBase.sol";

/// a contract that is NOT listed but claims to report to the rewards contract and tries to mark anyone
contract FakeGame {
    address public REWARDS;
    constructor(address r) { REWARDS = r; }
    function markDirect(address victim) external { TBlockLockRewards(REWARDS).recordPlay(victim); }
}

/// rewards stand-ins for the "game is never blocked" tests
contract RevertingRewards {
    fallback() external { revert("rewards broken"); }
}

contract GasBurnerRewards {
    fallback() external { while (true) {} }
}

contract ReturnBombRewards {
    fallback() external {
        assembly { revert(0, 1000000) } // a huge revert payload: the game copies no returndata, so it costs it nothing
    }
}

/// a game whose REWARDS() points elsewhere (or nowhere)
contract MisWiredGame {
    address public REWARDS;
    constructor(address r) { REWARDS = r; }
}

contract PlayGateTest is PlayGateBase {
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

    event Played(address indexed player, address indexed game, uint256 indexed epoch, uint256 weight);
    event PlayVoided(address indexed holder, uint256 indexed epoch, uint256 weight);
    event EpochClosed(uint256 indexed epoch, uint256 potWtcoin, uint256 potTblock, uint256 totalWeight, uint256 playedWeight);

    function setUp() public {
        vm.warp(T0);
        tblock = new MockERC20();
        wt = new MockERC20();
        lock = new MockLock(address(tblock));
        pm = new MockPoolManager();
        (rw, game) = _deployRewards(address(tblock), address(wt), address(lock), address(pm), guardian, T0, 1e30, 1e40);
    }

    function _one(uint256 e) internal pure returns (uint256[] memory a) { a = new uint256[](1); a[0] = e; }
    function _fund(uint256 w, uint256 t) internal { wt.mint(address(rw), w); tblock.mint(address(rw), t); }
    function _full(address token, uint256 cap) internal view returns (uint256 f) {
        f = rw.unassigned(token) * 2500 / 10_000;
        if (f > cap) f = cap;
    }

    // ================================================================ 1. a locker who did not play gets nothing for that epoch
    function test_PG_nonPlayerGetsNothing() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E);
        _play(alice); // bob never plays in epoch 1
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);

        assertTrue(rw.hasPlayed(alice, 1));
        assertFalse(rw.hasPlayed(bob, 1));
        (uint256 c0, uint256 c1) = rw.claimable(bob, _one(1));
        assertEq(c0 + c1, 0, "claimable 0 for a non-player");
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, uint256(1)));
        rw.claim(_one(1));
        assertEq(wt.balanceOf(bob) + tblock.balanceOf(bob), 0);
        assertGt(rw.weightOf(bob, 1), 0, "bob HAD weight: the gate, not the weight, refused him");
    }

    // ================================================================ 2. a player gets exactly full * w / W (Alice/Bob)
    function test_PG_aliceBob_playerExactShare_bobHalfStaysUnassigned() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0); // x1.5 -> 1500, epochs 1-2
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E);
        _play(alice);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        uint256 full0 = _full(address(wt), 1e30);
        uint256 full1 = _full(address(tblock), 1e40);
        assertEq(full0, 25e18);
        rw.closeEpoch(1);
        uint256 W = rw.totalWeight(1);
        uint256 w = rw.weightOf(alice, 1);
        assertEq(W, 3000e18);
        assertEq(rw.playedWeight(1), w);
        (uint256 p0, uint256 p1) = rw.pot(1);
        assertEq(p0, full0 * w / W, "pot = full * P / W");
        assertEq(p0, 12.5e18);
        assertEq(p1, full1 * w / W);
        assertEq(rw.unassigned(address(wt)), 100e18 - 12.5e18, "bob's half never assigned");
        vm.prank(alice);
        (uint256 a0, uint256 a1) = rw.claim(_one(1));
        assertEq(a0, full0 * w / W, "alice = full * w / W, as if everyone had played");
        assertEq(a1, full1 * w / W);
        assertEq(wt.balanceOf(alice), 12.5e18);

        // epoch 2: the reverse. The pot draws 25% of the larger unassigned balance (bob's unassigned half fed it).
        _play(bob); // now in epoch 2
        assertEq(rw.currentEpoch(), 2);
        vm.warp(T0 + 3 * E);
        uint256 full2 = _full(address(wt), 1e30);
        assertEq(full2, 87.5e18 * 2500 / 10_000);
        rw.closeEpoch(2);
        (uint256 q0,) = rw.pot(2);
        assertEq(q0, full2 * rw.weightOf(bob, 2) / rw.totalWeight(2));
        vm.prank(bob);
        (uint256 b0,) = rw.claim(_one(2));
        assertEq(b0, q0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, uint256(2)));
        rw.claim(_one(2));
    }

    /// several players with unequal weights: each gets floor(pot * w / P), within 1 wei of floor(full * w / W)
    function testFuzz_PG_playerShareExact(uint96 a, uint96 b, uint96 c, uint96 fund, uint8 mask) public {
        vm.assume(a > 0 && b > 0 && c > 0 && fund > 0);
        mask = uint8(bound(mask, 1, 7));
        address[3] memory hs = [alice, bob, carol];
        uint96[3] memory amts = [a, b, c];
        uint256[3] memory days_ = [uint256(100), 200, 400];
        for (uint256 i = 0; i < 3; i++) { lock.set(hs[i], amts[i], T0 + days_[i] * 1 days, 0); rw.enroll(hs[i]); }
        _fund(fund, fund);
        vm.warp(T0 + E);
        for (uint256 i = 0; i < 3; i++) if (mask & (1 << i) != 0) _play(hs[i]);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        uint256 full0 = _full(address(wt), 1e30);
        rw.closeEpoch(1);
        uint256 W = rw.totalWeight(1);
        uint256 P = rw.playedWeight(1);
        (uint256 p0,) = rw.pot(1);
        assertEq(p0, full0 * P / W);
        uint256 sum;
        for (uint256 i = 0; i < 3; i++) {
            uint256 w = rw.weightOf(hs[i], 1);
            if (mask & (1 << i) == 0) {
                if (w == 0) continue;
                vm.prank(hs[i]);
                vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, uint256(1)));
                rw.claim(_one(1));
                continue;
            }
            if (w == 0) continue;
            vm.prank(hs[i]);
            (uint256 x,) = rw.claim(_one(1));
            assertEq(x, p0 * w / P, "floor(pot * w / P)");
            uint256 ideal = full0 * w / W;
            assertLe(x > ideal ? x - ideal : ideal - x, 1, "within 1 wei of full * w / W");
            sum += x;
        }
        assertLe(sum, p0);
    }

    // ================================================================ 3. a play outside the epoch does not count
    function test_PG_playOutsideEpochDoesNotCount() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0); // weight epochs 1 and 2
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 0);

        // epoch 0 (the enroll epoch, weight 0): nothing stored, even at its very last second
        _play(alice);
        vm.warp(T0 + E - 1);
        _play(alice);
        assertFalse(rw.hasPlayed(alice, 0));
        assertFalse(rw.hasPlayed(alice, 1), "a play before epoch 1 starts never counts for epoch 1");
        assertEq(rw.playedWeight(0), 0);
        assertEq(rw.playedWeight(1), 0);

        // bob plays at the last second of epoch 1: that counts for 1
        vm.warp(T0 + 2 * E - 1);
        _play(bob);
        assertTrue(rw.hasPlayed(bob, 1));

        // alice plays one second after epoch 1 ended: that counts for epoch 2, not 1
        vm.warp(T0 + 2 * E);
        _play(alice);
        assertFalse(rw.hasPlayed(alice, 1));
        assertTrue(rw.hasPlayed(alice, 2));
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, uint256(1)));
        rw.claim(_one(1));
        vm.prank(bob);
        (uint256 b,) = rw.claim(_one(1));
        assertEq(b, 12.5e18, "bob: full * w / W");

        // once an epoch has ended, nothing can change its played weight
        uint256 p1 = rw.playedWeight(1);
        _play(bob);
        _play(carol);
        assertEq(rw.playedWeight(1), p1);
    }

    function test_PG_onePlayPerEpoch_repeatIsNoop() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E);
        vm.recordLogs();
        _play(alice);
        _play(alice);
        _play(alice);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 n;
        for (uint256 i = 0; i < logs.length; i++) if (logs[i].topics[0] == Played.selector) n++;
        assertEq(n, 1, "one Played event");
        assertEq(rw.playedWeight(1), 1500e18, "counted once");
        assertEq(game.plays(), 3, "the game itself ran three times");
    }

    function test_PG_nonLockerStoresNothing() public {
        vm.warp(T0 + E);
        vm.recordLogs();
        _play(stranger);
        assertEq(vm.getRecordedLogs().length, 0, "no event");
        assertFalse(rw.hasPlayed(stranger, 1));
        assertEq(rw.playedWeight(1), 0);
        assertEq(vm.load(address(rw), _statusSlot(stranger, 1)), bytes32(0), "status slot untouched");
    }

    // ================================================================ 4. an unauthorized source cannot mark a play
    function test_PG_unauthorizedSourceCannotMark() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E);
        address[5] memory callers = [stranger, alice, guardian, address(this), address(lock)];
        for (uint256 i = 0; i < callers.length; i++) {
            vm.prank(callers[i]);
            vm.expectRevert(TBlockLockRewards.NotGame.selector);
            rw.recordPlay(alice);
        }
        vm.prank(address(0));
        vm.expectRevert(TBlockLockRewards.NotGame.selector);
        rw.recordPlay(alice);
        assertFalse(rw.isGame(address(0)));
        assertFalse(rw.hasPlayed(alice, 1));
        assertEq(rw.playedWeight(1), 0);
    }

    // ================================================================ 5. a fake game contract cannot qualify anyone
    function test_PG_fakeGameCannotQualify() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E);
        // (a) claims to report to rw, calls recordPlay directly: refused
        FakeGame fake = new FakeGame(address(rw));
        assertEq(fake.REWARDS(), address(rw));
        vm.expectRevert(TBlockLockRewards.NotGame.selector);
        fake.markDirect(alice);
        // (b) a copy of the real game code (PlayRecorder, low-level call), deployed later with REWARDS = rw: its play "succeeds"
        //     because it ignores the outcome, but nothing is recorded
        MockGame clone = new MockGame(address(rw));
        vm.prank(alice);
        clone.play();
        assertEq(clone.plays(), 1);
        assertFalse(rw.hasPlayed(alice, 1));
        assertEq(rw.playedWeight(1), 0);
        assertFalse(rw.isGame(address(clone)));
        assertTrue(rw.isGame(address(game)));
        // epoch 1 closes with P = 0: nothing assigned
        _fund(100e18, 0);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        (uint256 p0,) = rw.pot(1);
        assertEq(p0, 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, uint256(1)));
        rw.claim(_one(1));
    }

    /// the listed game passes the PAYER (msg.sender): a caller cannot make the game record someone else
    function test_PG_listedGameRecordsOnlyThePayer() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E);
        vm.prank(stranger);
        game.play();
        assertFalse(rw.hasPlayed(alice, 1), "stranger's paid play does not qualify alice");
    }

    // ================================================================ constructor: the fixed game list and the two-way check
    function test_PG_constructorChecksGames() public {
        address[] memory gs;
        // empty list
        gs = new address[](0);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
        // zero address
        gs = new address[](1);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
        // EOA (no code)
        gs[0] = stranger;
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
        // contract without REWARDS()
        gs[0] = address(wt);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
        // REWARDS() names another contract (here: the first rewards contract)
        gs[0] = address(game);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
        // mispredicted address: the game names the address one nonce too far
        address wrong = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 2);
        MisWiredGame mw = new MisWiredGame(wrong);
        gs[0] = address(mw);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
        // duplicate
        address r = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        MockGame g1 = new MockGame(r);
        gs = new address[](2);
        gs[0] = address(g1);
        gs[1] = address(g1);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
        // more than 8
        gs = new address[](9);
        vm.expectRevert(TBlockLockRewards.BadConfig.selector);
        _newRw(gs);
    }

    function test_PG_eightGamesListedAndFixed() public {
        uint256 nonce = vm.getNonce(address(this));
        address r = vm.computeCreateAddress(address(this), nonce + 8);
        address[] memory gs = new address[](8);
        for (uint256 i = 0; i < 8; i++) gs[i] = address(new MockGame(r));
        TBlockLockRewards r8 = _newRw(gs);
        assertEq(address(r8), r);
        assertEq(r8.GAME_COUNT(), 8);
        address[] memory listed = r8.games();
        assertEq(listed.length, 8);
        for (uint256 i = 0; i < 8; i++) { assertEq(listed[i], gs[i]); assertTrue(r8.isGame(gs[i])); }
        assertFalse(r8.isGame(address(game)));
        // and a one-game contract lists exactly one, the unused slots are address(0) and never a game
        assertEq(rw.GAME_COUNT(), 1);
        assertEq(rw.GAME_1(), address(0));
        assertFalse(rw.isGame(address(0)));
    }

    function _newRw(address[] memory gs) internal returns (TBlockLockRewards) {
        return new TBlockLockRewards(address(tblock), address(wt), address(lock), address(pm), guardian, T0, 1e30, 1e40, gs);
    }

    // ================================================================ 6. the non-players' share follows the spec rule exactly
    /// pot = floor(full * P / W) per token, full = min(unassigned * 25%, MAX_POT); the rest stays unassigned to the wei, and the
    /// next epoch's full is drawn from that larger unassigned balance
    TBlockLockRewards rx;
    MockGame gx;
    uint256 capWx;
    uint256 capTx;

    function testFuzz_PG_nonPlayerShareRule(uint96 a, uint96 b, uint96 c, uint128 fundW, uint128 fundT, uint8 mask, bool capped) public {
        vm.assume(a > 0 && b > 0 && c > 0);
        (rx, gx, capWx, capTx) = (rw, game, 1e30, 1e40);
        if (capped) {
            capWx = uint256(fundW) / 10 + 1; // binds whenever 25% of the balance exceeds it
            capTx = uint256(fundT) / 7 + 1;
            (rx, gx) = _deployRewards(address(tblock), address(wt), address(lock), address(pm), guardian, T0, capWx, capTx);
        }
        address[3] memory hs = [alice, bob, carol];
        uint96[3] memory amts = [a, b, c];
        for (uint256 i = 0; i < 3; i++) { lock.set(hs[i], amts[i], T0 + 400 days, 0); rx.enroll(hs[i]); }
        wt.mint(address(rx), fundW);
        tblock.mint(address(rx), fundT);
        for (uint256 e = 1; e <= 3; e++) _checkEpochRule(e, uint8(uint256(keccak256(abi.encode(mask, e))) % 8));
    }

    function _checkEpochRule(uint256 e, uint8 m) internal {
        address[3] memory hs = [alice, bob, carol];
        vm.warp(T0 + e * E);
        for (uint256 i = 0; i < 3; i++) if (m & (1 << i) != 0) _playOn(gx, hs[i]);
        vm.warp(T0 + (e + 1) * E);
        if (e == 1) rx.closeEpoch(0);
        uint256 uW = rx.unassigned(address(wt));
        uint256 uT = rx.unassigned(address(tblock));
        uint256 fW = uW * 2500 / 10_000;
        if (fW > capWx) fW = capWx;
        uint256 fT = uT * 2500 / 10_000;
        if (fT > capTx) fT = capTx;
        uint256 S;
        for (uint256 i = 0; i < 3; i++) if (rx.hasPlayed(hs[i], e)) S += rx.weightOf(hs[i], e);
        rx.closeEpoch(e);
        uint256 W = rx.totalWeight(e);
        assertEq(rx.playedWeight(e), S, "P == sum of the players' weights");
        (uint256 pW, uint256 pT) = rx.pot(e);
        assertEq(pW, S == 0 ? 0 : fW * S / W, "wtCOIN pot = full * P / W");
        assertEq(pT, S == 0 ? 0 : fT * S / W, "TBLOCK pot = full * P / W");
        assertEq(rx.unassigned(address(wt)), uW - pW, "the non-players' part stays unassigned, to the wei");
        assertEq(rx.unassigned(address(tblock)), uT - pT);
    }

    function test_PG_noPlayerAtAll_nothingAssigned_eventCarriesP() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        _fund(100e18, 5e18);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        vm.expectEmit(true, true, true, true, address(rw));
        emit EpochClosed(1, 0, 0, 1500e18, 0);
        rw.closeEpoch(1);
        assertEq(rw.unassigned(address(wt)), 100e18);
        assertEq(rw.unassigned(address(tblock)), 5e18);
        (uint256 o0, uint256 o1) = rw.outstanding();
        assertEq(o0 + o1, 0);
    }

    // ================================================================ play, then exit: the play is voided
    function test_PG_playThenExit_viaSync_voids() public {
        lock.set(alice, 1000e18, T0 + 200 days, 0);
        lock.set(bob, 1000e18, T0 + 200 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 0);
        vm.warp(T0 + E + 1 days);
        _play(alice); _play(bob);
        assertEq(rw.playedWeight(1), 3500e18);
        lock.set(alice, 1000e18, T0 + 200 days, block.timestamp); // requestWithdraw
        vm.expectEmit(true, true, false, true, address(rw));
        emit PlayVoided(alice, 1, 1750e18);
        vm.prank(stranger);
        rw.sync(alice);
        assertEq(rw.playedWeight(1), 1750e18, "alice's weight left the played sum");
        assertEq(rw.weightOf(alice, 1), 0);
        rw.sync(alice); // twice: nothing more removed
        assertEq(rw.playedWeight(1), 1750e18);
        _play(alice); // replay after exit: weight 0, nothing
        assertEq(rw.playedWeight(1), 1750e18);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        (uint256 p0,) = rw.pot(1);
        assertEq(p0, 25e18, "bob alone played, and alice no longer weighs: P == W");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NoWeight.selector, uint256(1)));
        rw.claim(_one(1));
        vm.prank(bob);
        (uint256 b,) = rw.claim(_one(1));
        assertEq(b, 25e18);
    }

    function test_PG_playThenExit_viaEnroll_voids() public {
        lock.set(alice, 1000e18, T0 + 200 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E + 1 days);
        _play(alice);
        assertEq(rw.playedWeight(1), 1750e18);
        lock.set(alice, 1000e18, T0 + 200 days, block.timestamp);
        rw.enroll(alice); // the exit branch of enroll
        assertEq(rw.playedWeight(1), 0);
        assertEq(rw.projectedTotalWeight(1), 0);
    }

    // ================================================================ splitting a lock across wallets earns the same
    function test_PG_splitWalletsEarnSame() public {
        address bob2 = address(0xB0B2);
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        lock.set(bob, 500e18, T0 + 100 days, 0);
        lock.set(bob2, 500e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(bob2);
        _fund(1000e18 + 7, 333e18 + 1);
        vm.warp(T0 + E);
        _play(alice); _play(bob); _play(bob2); // the split holder pays one play per wallet
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(alice);
        (uint256 a0, uint256 a1) = rw.claim(_one(1));
        vm.prank(bob);
        (uint256 b0, uint256 b1) = rw.claim(_one(1));
        vm.prank(bob2);
        (uint256 c0, uint256 c1) = rw.claim(_one(1));
        assertLe(a0 > b0 + c0 ? a0 - b0 - c0 : b0 + c0 - a0, 1, "same wtCOIN within 1 wei of rounding");
        assertLe(a1 > b1 + c1 ? a1 - b1 - c1 : b1 + c1 - a1, 1, "same TBLOCK within 1 wei of rounding");
        assertGe(a0, b0 + c0, "splitting never earns more");
        assertGe(a1, b1 + c1);
    }

    // ================================================================ a listed game is never blocked by the rewards contract
    function test_PG_gameNotBlockedByRevertingOrGasBurningRewards() public {
        MockGame g1 = new MockGame(address(new RevertingRewards()));
        MockGame g2 = new MockGame(address(new GasBurnerRewards()));
        MockGame g3 = new MockGame(address(new ReturnBombRewards()));
        MockGame g4 = new MockGame(stranger); // no code at all
        MockGame[4] memory gs = [g1, g2, g3, g4];
        for (uint256 i = 0; i < 4; i++) {
            vm.prank(alice);
            uint256 g0 = gasleft();
            gs[i].play{gas: 500_000}();
            uint256 used = g0 - gasleft();
            assertEq(gs[i].plays(), 1, "the play went through");
            assertLt(used, 140_000, "the rewards call cannot take more than PLAY_GAS");
            console2.log("game with broken rewards, gas used by play()", i, used);
        }
    }

    // ================================================================ too little gas: the whole play reverts, the record is never lost
    function test_PG_tooLittleGasReverts() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E);
        vm.prank(alice);
        vm.expectRevert(PlayRecorder.PlayGasTooLow.selector);
        game.play{gas: 100_000}();
        assertEq(game.plays(), 0);
        assertFalse(rw.hasPlayed(alice, 1));
    }

    /// for every gas limit from far too little to plenty: either the play reverts as a whole, or it succeeds AND the record is
    /// stored. Never a successful paid play with a lost record (the failure eth_estimateGas would otherwise find).
    function test_PG_noGasLimitLosesTheRecordSilently() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E);
        uint256 firstOk;
        for (uint256 gl = 60_000; gl <= 200_000; gl += 250) {
            uint256 snap = vm.snapshotState();
            vm.cool(address(rw));
            vm.cool(address(game));
            vm.prank(alice);
            (bool ok,) = address(game).call{gas: gl}(abi.encodeWithSelector(MockGame.play.selector));
            if (ok) {
                assertTrue(rw.hasPlayed(alice, 1), "a successful play always carries its record");
                if (firstOk == 0) firstOk = gl;
            }
            vm.revertToState(snap);
        }
        assertGt(firstOk, 0);
        console2.log("lowest gas limit (250 steps) at which MockGame.play() succeeds, cold", firstOk);
    }

    // ================================================================ gas, measured (cold state, first player of the epoch)
    function test_gas_recordPlayWorstCase() public {
        // alice has several checkpoints (re-enrolled over epochs): weightOf walks back from the newest
        lock.set(alice, 1000e18, T0 + 400 days, 0);
        rw.enroll(alice);
        for (uint256 i = 1; i <= 5; i++) {
            vm.warp(T0 + i * E + 1);
            lock.set(alice, 1000e18 + i, T0 + 400 days, 0); // top-up: new checkpoint from the next epoch
            rw.enroll(alice);
        }
        lock.set(bob, 1000e18, T0 + 400 days, 0);
        rw.enroll(bob);
        vm.warp(T0 + 6 * E + 1);
        assertGt(rw.checkpointsOf(alice).length, 3);

        vm.cool(address(rw));
        vm.prank(address(game));
        uint256 g0 = gasleft();
        rw.recordPlay(alice); // first player of epoch 6: two zero -> nonzero SSTOREs
        uint256 first = g0 - gasleft();

        vm.cool(address(rw));
        vm.prank(address(game));
        g0 = gasleft();
        rw.recordPlay(bob); // second player of the epoch
        uint256 second = g0 - gasleft();

        vm.cool(address(rw));
        vm.prank(address(game));
        g0 = gasleft();
        rw.recordPlay(alice); // repeat
        uint256 repeat = g0 - gasleft();

        vm.cool(address(rw));
        vm.prank(address(game));
        g0 = gasleft();
        rw.recordPlay(stranger); // non-locker
        uint256 nonLocker = g0 - gasleft();

        console2.log("recordPlay gas, cold: first player of epoch", first);
        console2.log("recordPlay gas, cold: later first play     ", second);
        console2.log("recordPlay gas, cold: repeat               ", repeat);
        console2.log("recordPlay gas, cold: non-locker           ", nonLocker);
        assertLt(first, 100_000, "worst case fits PLAY_GAS");
        assertLt(first * 3 / 2, 100_000, "with a 50% margin");
    }

    // ================================================================ 7. conservation fuzz with players, non-players and a rescue
    function testFuzz_PG_conservation(uint96 fund, uint96 rescueAmt, uint8 mask, uint8 order, bool claimBeforeRescue) public {
        vm.assume(fund > 100 && rescueAmt > 0);
        address[3] memory hs = [alice, bob, carol];
        lock.set(alice, 3000e18, T0 + 200 days, 0);
        lock.set(bob, 1000e18, T0 + 400 days, 0);
        lock.set(carol, 7e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob); rw.enroll(carol);
        wt.mint(address(rw), fund);
        tblock.mint(address(rw), uint256(fund) * 3);
        for (uint256 e = 1; e <= 2; e++) {
            vm.warp(T0 + e * E);
            for (uint256 i = 0; i < 3; i++) if ((mask >> (i + 3 * (e - 1))) & 1 == 1) _play(hs[i]);
        }
        vm.warp(T0 + 3 * E);
        rw.closeEpoch(0); rw.closeEpoch(1); rw.closeEpoch(2);

        uint256 paid0;
        uint256 paid1;
        if (claimBeforeRescue) (paid0, paid1) = _claimAll(hs, order, 1, 1);
        vm.prank(guardian);
        rw.rescueRequest(address(wt), guardian, rescueAmt);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(guardian);
        rw.rescueExecute();
        (uint256 x0, uint256 x1) = _claimAll(hs, order, 1, 2);
        paid0 += x0;
        paid1 += x1;

        (uint256 o0, uint256 o1) = rw.outstanding();
        uint256 bal0 = wt.balanceOf(address(rw));
        uint256 bal1 = tblock.balanceOf(address(rw));
        assertGe(bal0, o0, "wtCOIN balance covers outstanding");
        assertGe(bal1, o1, "TBLOCK balance covers outstanding");
        assertEq(paid0 + wt.balanceOf(guardian) + bal0, fund, "every wtCOIN unit accounted for");
        assertEq(paid1 + bal1, uint256(fund) * 3, "every TBLOCK unit accounted for");
        for (uint256 e = 1; e <= 2; e++) {
            (uint256 l0, uint256 l1) = rw.left(e);
            (uint256 p0, uint256 p1) = rw.pot(e);
            (uint256 c0,) = rw.cut(e);
            assertLe(l0 + c0, p0);
            assertLe(l1, p1);
        }
        // release everything: outstanding returns to exactly 0
        vm.warp(block.timestamp + 3 * E);
        while (rw.nextEpochToRelease() < rw.nextEpochToClose()) rw.release();
        (o0, o1) = rw.outstanding();
        assertEq(o0 + o1, 0);
        assertEq(rw.unassigned(address(wt)), wt.balanceOf(address(rw)));
    }

    function _claimAll(address[3] memory hs, uint8 order, uint256 fromE, uint256 toE) internal returns (uint256 s0, uint256 s1) {
        for (uint256 j = 0; j < 3; j++) {
            address h = hs[(order + j) % 3];
            for (uint256 e = fromE; e <= toE; e++) {
                if (!rw.hasPlayed(h, e) || rw.claimed(h, e) || rw.weightOf(h, e) == 0) {
                    if (rw.weightOf(h, e) > 0 && !rw.hasPlayed(h, e)) {
                        vm.prank(h);
                        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, e));
                        rw.claim(_one(e));
                    }
                    continue;
                }
                vm.prank(h);
                (uint256 x, uint256 y) = rw.claim(_one(e)); // must never revert
                s0 += x;
                s1 += y;
            }
        }
    }

    // ================================================================ claim gas: the CLAIMED bit lands in a nonzero slot
    function test_gas_claimOneEpoch() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        lock.set(bob, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice); rw.enroll(bob);
        _fund(100e18, 1000e18);
        vm.warp(T0 + E);
        _play(alice); _play(bob);
        vm.warp(T0 + 2 * E);
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.cool(address(rw));
        vm.cool(address(wt));
        vm.cool(address(tblock));
        vm.prank(alice);
        uint256 g0 = gasleft();
        rw.claim(_one(1));
        console2.log("claim, one epoch, both tokens, cold (mock ERC20s)", g0 - gasleft());
    }

    /// `forge inspect TBlockLockRewards storageLayout`: _status is slot 17. test_PG_statusSlotProbe proves it at runtime.
    uint256 constant STATUS_SLOT = 17;

    function _statusSlot(address h, uint256 e) internal pure returns (bytes32) {
        return keccak256(abi.encode(e, keccak256(abi.encode(h, STATUS_SLOT))));
    }

    /// the slot used by test_PG_nonLockerStoresNothing is the real _status slot: a recorded play shows up there and only there
    function test_PG_statusSlotProbe() public {
        lock.set(alice, 1000e18, T0 + 100 days, 0);
        rw.enroll(alice);
        vm.warp(T0 + E);
        bytes32 slot = _statusSlot(alice, 1);
        assertEq(vm.load(address(rw), slot), bytes32(0));
        _play(alice);
        assertEq(uint256(vm.load(address(rw), slot)), 1, "PLAYED bit at the probed slot");
    }
}
