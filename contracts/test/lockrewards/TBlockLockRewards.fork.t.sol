// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2, Vm} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {PlayGateBase, MockGame} from "./PlayGateBase.sol";

/// Base mainnet FORK test of TBlockLockRewards against the REAL hook, PoolManager, TBlockLock, TBLOCK (B20) and wtCOIN.
/// TBLOCK is a B20 token (code = the single byte 0xef): it only runs under the Base build of forge.
///   FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/forge.exe test --match-path test/TBlockLockRewards.fork.t.sol \
///     --fork-url http://127.0.0.1:8659 -vv
/// Addresses copied from (never from memory):
///   PM, WTCOIN, TBLOCK, HOOK, V3, WETH, POOL_ID : D:/tmp/wt-tblock/contracts/test/TBlockBuybackV2.fork.t.sol
///   LOCK                                         : D:/tmp/wt-tblock/lock-deploiement.js (adresse)
///   PAYEE                                        : design-lock-rewards.json probe ("payees(key) ... 0x37eb...580a", full in the file)
/// Nothing here signs or sends from a real wallet: impersonation (vm.prank) exists only inside this local fork.

struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }
struct Payee { address to; uint16 shareBps; }

interface IERC20F {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}

interface IWETHF { function deposit() external payable; }

interface IHookF {
    function payees(PoolKey calldata key) external view returns (Payee[] memory);
    function transferPayeeSlot(PoolKey calldata key, address to) external;
    function taxFor(PoolKey calldata key, bool zeroForOne) external view returns (uint16);
}

interface ILockF {
    function TBLOCK() external view returns (address);
    function lock(uint256 amount, uint256 unlockAt) external;
    function lockedOf(address) external view returns (uint256);
    function unlockAtOf(address) external view returns (uint256);
    function totalLocked() external view returns (uint256);
}

interface IPMF {
    function unlock(bytes calldata) external returns (bytes memory);
    function swap(PoolKey memory, SwapParams memory, bytes calldata) external returns (int256);
    function sync(address) external;
    function settle() external payable returns (uint256);
    function take(address, address, uint256) external;
    function mint(address to, uint256 id, uint256 amount) external;
    function balanceOf(address owner, uint256 id) external view returns (uint256);
}

interface IV3PoolF {
    function swap(address, bool, int256, uint160, bytes calldata) external returns (int256, int256);
}

/// @dev test-only trader: exact-input swaps on the real v4 TBLOCK pool and the real v3 WETH/wtCOIN pool, paid from its own balance.
///      Also mints a real ERC6909 claim to an address through the real PoolManager (to exercise redeemDeferred).
contract Trader {
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOOK = 0x3e6B46810b1fd5085086Fd1417E8adB02f34a044;
    address constant V3 = 0x8495444b5f3699D223baa01E67Bf534475620aff;
    address constant WETH = 0x4200000000000000000000000000000000000006;

    receive() external payable {}

    function wrap(uint256 amt) external { IWETHF(WETH).deposit{value: amt}(); }

    /// zeroForOne = true: wtCOIN in, TBLOCK out (a BUY of TBLOCK). false: TBLOCK in, wtCOIN out (a SELL).
    function v4(bool zeroForOne, uint256 amountIn) external returns (uint256 out) {
        return abi.decode(IPMF(PM).unlock(abi.encode(uint8(0), zeroForOne, amountIn, address(0))), (uint256));
    }

    /// pays `amount` wtCOIN into the PoolManager and mints the same amount of ERC6909 claim to `to`
    function mintClaimTo(address to, uint256 amount) external {
        IPMF(PM).unlock(abi.encode(uint8(1), false, amount, to));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == PM, "only PM");
        (uint8 mode, bool z, uint256 amt, address to) = abi.decode(data, (uint8, bool, uint256, address));
        if (mode == 1) {
            IPMF(PM).sync(WTCOIN);
            IERC20F(WTCOIN).transfer(PM, amt);
            IPMF(PM).settle();
            IPMF(PM).mint(to, uint256(uint160(WTCOIN)), amt);
            return "";
        }
        PoolKey memory k = PoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK);
        int256 d = IPMF(PM).swap(k, SwapParams(z, -int256(amt), z ? 4295128740 : 1461446703485210103287273052203988822378723970341), "");
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        (address tin, address tout, int128 dOut) = z ? (WTCOIN, TBLOCK, d1) : (TBLOCK, WTCOIN, d0);
        IPMF(PM).sync(tin);
        IERC20F(tin).transfer(PM, amt);
        IPMF(PM).settle();
        IPMF(PM).take(tout, address(this), uint256(int256(dOut)));
        return abi.encode(uint256(int256(dOut)));
    }

    function v3(bool zeroForOne, uint256 amountIn) external {
        IV3PoolF(V3).swap(address(this), zeroForOne, int256(amountIn), zeroForOne ? 4295128740 : 1461446703485210103287273052203988822378723970341, "");
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        require(msg.sender == V3, "only V3");
        if (a0 > 0) IERC20F(WETH).transfer(V3, uint256(a0));
        if (a1 > 0) IERC20F(WTCOIN).transfer(V3, uint256(a1));
    }

    function send(address token, address to, uint256 amt) external { require(IERC20F(token).transfer(to, amt), "send"); }
}

contract TBlockLockRewardsForkTest is PlayGateBase {
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOOK = 0x3e6B46810b1fd5085086Fd1417E8adB02f34a044;
    address constant V3 = 0x8495444b5f3699D223baa01E67Bf534475620aff;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    bytes32 constant POOL_ID = 0x6869b9016937d97dfa595eb25bc72880e821b8eb22be32bc79c623bc64ce8a3e;
    address constant LOCK = 0xEc46b02bb1f3A58Ce37c023f8668f2207bc2B0aA;
    address constant PAYEE = 0x37Eb9b7ce0b51Fe12fBf092026e001918128580A;

    uint256 constant EPOCH = 30 days;

    TBlockLockRewards rw;
    Trader trader;
    PoolKey key;

    address guardian = address(0x6A4D1A4);
    address rescueTo = address(0x7E5C0E);
    address alice = address(0xA11CE0001);
    address bob = address(0xB0B0002);
    address stranger = address(0x5157A9);

    uint256 t0;
    uint256 tNow;

    // fee accounting, measured
    uint256 wtFeesIn;
    uint256 tbFeesIn;
    uint256 swapsSeen;

    // scenario numbers (storage, to keep the stack small)
    uint256 aAmt;
    uint256 bAmt;
    uint256 wA;
    uint256 wB;
    uint256 W;
    uint256 pot0;
    uint256 pot1;

    bytes32 constant SPLIT_SIG = keccak256("CreatorShareSplit(bytes32,uint256,uint256,uint256)");
    bytes32 constant DEFERRED_SIG = keccak256("PayoutDeferred(address,address,uint256)");
    bytes32 constant FEE_SIG = keccak256("FeeTaken(bytes32,address,uint256,uint256)");

    function setUp() public {
        // without --fork-url this suite is skipped (reported as skipped, never as passed)
        if (block.chainid != 8453 || PM.code.length == 0) vm.skip(true);
        key = PoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK);
        tNow = block.timestamp;
        // epoch 0 ends one day from now, so one warp of 31 days ends epoch 1 (a full 30-day epoch after enrolling)
        t0 = tNow - EPOCH + 1 days;
        (rw, game) = _deployRewards(TBLOCK, WTCOIN, LOCK, PM, guardian, t0, type(uint128).max, type(uint128).max);
        trader = new Trader();
    }

    function _bal(address t, address w) internal view returns (uint256) { return IERC20F(t).balanceOf(w); }

    // ================================================================ facts read on the fork

    function test_fork_facts_codeAndWiring() public view {
        assertEq(TBLOCK.code.length, 1, "TBLOCK is a B20 (1 byte of code)");
        assertEq(uint8(TBLOCK.code[0]), 0xef, "B20 marker");
        assertGt(WTCOIN.code.length, 0, "wtCOIN has code");
        assertGt(HOOK.code.length, 0, "hook has code");
        assertGt(PM.code.length, 0, "PoolManager has code");
        assertGt(LOCK.code.length, 0, "TBlockLock has code");
        assertGt(V3.code.length, 0, "v3 pool has code");
        assertEq(ILockF(LOCK).TBLOCK(), TBLOCK, "TBlockLock.TBLOCK()");
        assertEq(keccak256(abi.encode(key)), POOL_ID, "pool key hashes to the pool id");
        Payee[] memory p = IHookF(HOOK).payees(key);
        assertEq(p.length, 1, "one payee");
        assertEq(p[0].to, PAYEE, "payee = design probe's payee");
        assertEq(p[0].shareBps, 3400, "34%");
        assertEq(PAYEE.code.length, 0, "payee is a wallet (no code)");
        console2.log("fork block", block.number);
        console2.log("fork time ", block.timestamp);
        console2.log("TBlockLock.totalLocked on this fork (raw)", ILockF(LOCK).totalLocked());
        console2.log("taxFor buy/sell bps", IHookF(HOOK).taxFor(key, true), IHookF(HOOK).taxFor(key, false));
    }

    // ================================================================ helpers

    /// @dev one real v4 swap by the trader; checks the hook paid the rewards contract exactly CreatorShareSplit.paid, nothing deferred
    function _swap(bool buy, uint256 amountIn) internal returns (uint256 out) {
        address feeToken = buy ? TBLOCK : WTCOIN; // exact-input: fee is in the unspecified (output) currency
        uint256 before = _bal(feeToken, address(rw));
        vm.recordLogs();
        out = trader.v4(buy, amountIn);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 paid;
        uint256 splits;
        bool fee;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != HOOK) continue;
            if (logs[i].topics[0] == SPLIT_SIG && logs[i].topics[1] == POOL_ID) {
                (,, uint256 p) = abi.decode(logs[i].data, (uint256, uint256, uint256));
                paid += p;
                splits++;
            }
            if (logs[i].topics[0] == FEE_SIG && logs[i].topics[1] == POOL_ID) fee = true;
            if (logs[i].topics[0] == DEFERRED_SIG) {
                assertTrue(address(uint160(uint256(logs[i].topics[1]))) != address(rw), "payout to rewards was DEFERRED");
            }
        }
        assertTrue(fee, "hook emitted FeeTaken");
        assertEq(splits, 1, "one CreatorShareSplit");
        uint256 got = _bal(feeToken, address(rw)) - before;
        assertGt(got, 0, "rewards contract received a fee");
        assertEq(got, paid, "rewards balance delta == CreatorShareSplit.paid (single payee = rewards)");
        if (buy) tbFeesIn += got; else wtFeesIn += got;
        swapsSeen++;
        console2.log(buy ? "BUY  fee to rewards (TBLOCK raw)" : "SELL fee to rewards (wtCOIN raw)", got);
    }

    function _transferSlot() internal {
        vm.prank(PAYEE); // fork-only impersonation of the current payee, calling the real hook
        IHookF(HOOK).transferPayeeSlot(key, address(rw));
        Payee[] memory p = IHookF(HOOK).payees(key);
        assertEq(p.length, 1);
        assertEq(p[0].to, address(rw), "slot now points to the rewards contract");
        assertEq(p[0].shareBps, 3400);
    }

    function _getWtcoin() internal returns (uint256 wt) {
        vm.deal(address(trader), 0.05 ether);
        trader.wrap(0.05 ether);
        trader.v3(true, 0.05 ether); // WETH (token0) -> wtCOIN (token1) on the real v3 pool
        wt = _bal(WTCOIN, address(trader));
        assertGt(wt, 0, "trader got wtCOIN");
    }

    function _lockAndEnroll(address who, uint256 amount, uint256 unlockAt) internal {
        trader.send(TBLOCK, who, amount);
        uint256 lockBal0 = _bal(TBLOCK, LOCK);
        vm.startPrank(who);
        IERC20F(TBLOCK).approve(LOCK, amount);
        ILockF(LOCK).lock(amount, unlockAt); // the REAL TBlockLock
        rw.enroll(who);
        vm.stopPrank();
        assertEq(_bal(TBLOCK, LOCK) - lockBal0, amount, "principal went into TBlockLock");
        assertEq(ILockF(LOCK).lockedOf(who), amount);
        assertEq(ILockF(LOCK).unlockAtOf(who), unlockAt);
    }

    // ================================================================ the full lifecycle

    function test_fork_lifecycle_feesLockCloseClaimRescue() public {
        uint256 rwTb0 = _bal(TBLOCK, address(rw));
        uint256 rwWt0 = _bal(WTCOIN, address(rw));
        assertEq(rwTb0, 0);
        assertEq(rwWt0, 0);

        // 1. the current payee moves its slot to the rewards contract (the real hook function, no admin)
        _transferSlot();

        // 2. real swaps through the v4 pool: two buys (TBLOCK fee) feed the lockers, one sell (wtCOIN fee)
        uint256 wt = _getWtcoin();
        uint256 tbA = _swap(true, wt / 3);
        uint256 tbB = _swap(true, wt / 3);
        assertGt(tbA, 0);
        assertGt(tbB, 0);
        uint256 tbTotal = _bal(TBLOCK, address(trader));
        uint256 sellAmt = tbTotal / 10;
        _swap(false, sellAmt);

        // 3. two lockers lock through the REAL TBlockLock and enroll
        aAmt = tbA * 4 / 10;
        bAmt = tbB * 4 / 10;
        _lockAndEnroll(alice, aAmt, tNow + 60 days);  // commitment 60 d -> x1.25, lastFull = epoch 1
        _lockAndEnroll(bob, bAmt, tNow + 120 days);   // commitment 120 d -> x1.5, lastFull = epoch 3
        wA = aAmt * 12_500 / 10_000;
        wB = bAmt * 15_000 / 10_000;
        assertEq(rw.weightOf(alice, 1), wA, "alice weight epoch 1");
        assertEq(rw.weightOf(bob, 1), wB, "bob weight epoch 1");
        assertEq(rw.weightOf(alice, 0), 0, "no weight in the enroll epoch");
        assertEq(rw.weightOf(alice, 2), 0, "alice's lock does not cover epoch 2");
        assertEq(rw.weightOf(bob, 3), wB, "bob covers epoch 3");
        assertEq(rw.weightOf(bob, 4), 0, "bob does not cover epoch 4");

        // 4. a sell in epoch 1 too (fees keep flowing in after enrollment)
        vm.warp(tNow + 2 days);
        assertEq(rw.currentEpoch(), 1);
        _swap(false, _bal(TBLOCK, address(trader)) / 10);
        // PLAY GATE port: both lockers make one paid play during epoch 1 (P == W, so every amount below is unchanged)
        _play(alice);
        _play(bob);
        assertEq(rw.playedWeight(1), wA + wB, "played weight epoch 1");

        assertEq(_bal(WTCOIN, address(rw)), wtFeesIn, "rewards wtCOIN == sum of measured sell fees");
        assertEq(_bal(TBLOCK, address(rw)), tbFeesIn, "rewards TBLOCK == sum of measured buy fees (no principal here)");

        // 5. warp past the end of epoch 1 (a full 30-day epoch after enrollment) and close 0 and 1
        vm.warp(rw.epochEnd(1));
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochOutOfOrder.selector, uint256(0)));
        rw.closeEpoch(1);
        rw.closeEpoch(0);
        (uint256 p00, uint256 p01) = rw.pot(0);
        assertEq(p00, 0, "epoch 0 had no weight: nothing assigned");
        assertEq(p01, 0);
        uint256 unWt = rw.unassigned(WTCOIN);
        uint256 unTb = rw.unassigned(TBLOCK);
        assertEq(unWt, wtFeesIn);
        assertEq(unTb, tbFeesIn);
        vm.prank(stranger);
        rw.closeEpoch(1); // permissionless
        W = rw.totalWeight(1);
        assertEq(W, wA + wB, "total weight epoch 1");
        (pot0, pot1) = rw.pot(1);
        assertEq(pot0, unWt * 2500 / 10_000, "wtCOIN pot = 25% of unassigned");
        assertEq(pot1, unTb * 2500 / 10_000, "TBLOCK pot = 25% of unassigned");
        assertGt(pot0, 0);
        assertGt(pot1, 0);

        // 6. a stranger cannot claim anyone's share
        uint256[] memory e1 = new uint256[](1);
        e1[0] = 1;
        (uint256 aliceC0, uint256 aliceC1) = rw.claimable(alice, e1);
        uint256 s0 = _bal(WTCOIN, stranger);
        uint256 s1 = _bal(TBLOCK, stranger);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NoWeight.selector, uint256(1)));
        rw.claim(e1);
        assertEq(_bal(WTCOIN, stranger), s0);
        assertEq(_bal(TBLOCK, stranger), s1);
        (uint256 aliceC0b, uint256 aliceC1b) = rw.claimable(alice, e1);
        assertEq(aliceC0b, aliceC0, "alice's claimable unchanged by the stranger");
        assertEq(aliceC1b, aliceC1);

        // 7. alice claims: exact balances before/after
        _claimExact(alice, e1, pot0 * wA / W, pot1 * wA / W);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.AlreadyClaimed.selector, uint256(1)));
        rw.claim(e1);

        // 8. the only withdraw path: the guardian rescue door (72 h timelock)
        _rescueChecks();

        // 9. bob, who had not claimed, still claims without revert, exact amounts after the cut
        (uint256 cut0,) = rw.cut(1);
        (uint256 left0, uint256 left1) = rw.left(1);
        uint256 expB0 = (pot0 - cut0) * wB / W;
        if (expB0 > left0) expB0 = left0;
        uint256 expB1 = pot1 * wB / W;
        if (expB1 > left1) expB1 = left1;
        _claimExact(bob, e1, expB0, expB1);
        console2.log("bob wtCOIN after cut (raw)", expB0);

        // accounting closes: what is still held covers what is still owed
        (uint256 o0, uint256 o1) = rw.outstanding();
        assertGe(_bal(WTCOIN, address(rw)), o0);
        assertGe(_bal(TBLOCK, address(rw)), o1);
        console2.log("swaps through the hook", swapsSeen);
        console2.log("wtCOIN fees in (raw)", wtFeesIn);
        console2.log("TBLOCK fees in (raw)", tbFeesIn);
        console2.log("pot epoch 1 wtCOIN / TBLOCK", pot0, pot1);
    }

    function _claimExact(address who, uint256[] memory epochs, uint256 exp0, uint256 exp1) internal {
        uint256 h0 = _bal(WTCOIN, who);
        uint256 h1 = _bal(TBLOCK, who);
        uint256 c0 = _bal(WTCOIN, address(rw));
        uint256 c1 = _bal(TBLOCK, address(rw));
        vm.prank(who);
        (uint256 p0, uint256 p1) = rw.claim(epochs);
        assertEq(p0, exp0, "claim wtCOIN return");
        assertEq(p1, exp1, "claim TBLOCK return");
        assertEq(_bal(WTCOIN, who) - h0, exp0, "holder wtCOIN delta");
        assertEq(_bal(TBLOCK, who) - h1, exp1, "holder TBLOCK delta");
        assertEq(c0 - _bal(WTCOIN, address(rw)), exp0, "contract wtCOIN delta");
        assertEq(c1 - _bal(TBLOCK, address(rw)), exp1, "contract TBLOCK delta");
    }

    function _rescueChecks() internal {
        // non-guardian: request, cancel and execute all revert
        vm.prank(stranger);
        vm.expectRevert(TBlockLockRewards.NotGuardian.selector);
        rw.rescueRequest(WTCOIN, stranger, 1);
        vm.prank(alice);
        vm.expectRevert(TBlockLockRewards.NotGuardian.selector);
        rw.rescueRequest(TBLOCK, alice, 1);
        vm.prank(PAYEE);
        vm.expectRevert(TBlockLockRewards.NotGuardian.selector);
        rw.rescueRequest(WTCOIN, PAYEE, 1);

        // other paths that could move funds do not: early release, a fake PoolManager callback, an empty redeem
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.ReleaseTooEarly.selector, uint256(0)));
        rw.release();
        vm.prank(stranger);
        vm.expectRevert(TBlockLockRewards.NotPoolManager.selector);
        rw.unlockCallback(abi.encode(WTCOIN, uint256(1)));
        vm.prank(PM);
        vm.expectRevert(TBlockLockRewards.NotPoolManager.selector); // not inside redeemDeferred
        rw.unlockCallback(abi.encode(WTCOIN, uint256(1)));
        assertEq(rw.redeemDeferred(WTCOIN), 0, "no ERC6909 claim held: redeem moves nothing");

        // the guardian asks for all the unassigned wtCOIN plus half of what is left in epoch 1, so the cut path runs
        uint256 free = rw.unassigned(WTCOIN);
        (uint256 l0,) = rw.left(1);
        uint256 amount = free + l0 / 2;
        vm.prank(guardian);
        rw.rescueRequest(WTCOIN, rescueTo, amount);
        (,, uint256 ra, uint256 at) = rw.pendingRescue();
        assertEq(ra, amount);
        assertEq(at, block.timestamp + 72 hours);

        vm.prank(stranger);
        vm.expectRevert(TBlockLockRewards.NotGuardian.selector);
        rw.rescueExecute();

        vm.warp(at - 1);
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.RescueTooEarly.selector, at));
        rw.rescueExecute();

        vm.warp(at);
        uint256 to0 = _bal(WTCOIN, rescueTo);
        uint256 c0 = _bal(WTCOIN, address(rw));
        uint256 tbC = _bal(TBLOCK, address(rw));
        vm.prank(guardian);
        rw.rescueExecute();
        assertEq(_bal(WTCOIN, rescueTo) - to0, amount, "rescue moved exactly the amount to the recipient");
        assertEq(c0 - _bal(WTCOIN, address(rw)), amount, "rescue took exactly the amount from the contract");
        assertEq(_bal(TBLOCK, address(rw)), tbC, "other token untouched");
        (uint256 cut0,) = rw.cut(1);
        assertEq(cut0, amount - free, "cut on epoch 1 = amount beyond the unassigned balance");
        (,,, uint256 at2) = rw.pendingRescue();
        assertEq(at2, 0, "request consumed");
        vm.prank(guardian);
        vm.expectRevert(TBlockLockRewards.NoRescuePending.selector);
        rw.rescueExecute();
        console2.log("rescued wtCOIN (raw)", amount);
        console2.log("  of which cut from epoch 1", amount - free);
    }

    // ================================================================ play gate on the real B20 TBLOCK, real hook fees, real TBlockLock
    /// alice and bob lock through the REAL TBlockLock; only alice plays in epoch 1. Alice is paid exactly full * wA / W in both
    /// tokens (real B20 transfer), bob's claim reverts NotPlayed, and bob's part stays unassigned to the wei.
    function test_fork_playGate_aliceBob() public {
        _transferSlot();
        uint256 wt = _getWtcoin();
        uint256 tbA = _swap(true, wt / 3);
        uint256 tbB = _swap(true, wt / 3);
        _swap(false, _bal(TBLOCK, address(trader)) / 10);
        aAmt = tbA * 4 / 10;
        bAmt = tbB * 4 / 10;
        _lockAndEnroll(alice, aAmt, tNow + 60 days);
        _lockAndEnroll(bob, bAmt, tNow + 120 days);
        wA = rw.weightOf(alice, 1);
        wB = rw.weightOf(bob, 1);
        assertGt(wA, 0);
        assertGt(wB, 0);

        vm.warp(tNow + 2 days);
        assertEq(rw.currentEpoch(), 1);
        _play(alice);
        assertTrue(rw.hasPlayed(alice, 1));
        assertFalse(rw.hasPlayed(bob, 1));

        vm.warp(rw.epochEnd(1));
        rw.closeEpoch(0);
        uint256 full0 = rw.unassigned(WTCOIN) * 2500 / 10_000;
        uint256 full1 = rw.unassigned(TBLOCK) * 2500 / 10_000;
        uint256 un0 = rw.unassigned(WTCOIN);
        uint256 un1 = rw.unassigned(TBLOCK);
        rw.closeEpoch(1);
        W = rw.totalWeight(1);
        assertEq(W, wA + wB);
        assertEq(rw.playedWeight(1), wA);
        (pot0, pot1) = rw.pot(1);
        assertEq(pot0, full0 * wA / W, "wtCOIN pot = full * P / W");
        assertEq(pot1, full1 * wA / W, "TBLOCK pot = full * P / W");
        assertGt(pot1, 0);
        assertEq(rw.unassigned(WTCOIN), un0 - pot0, "bob's part stays unassigned (wtCOIN)");
        assertEq(rw.unassigned(TBLOCK), un1 - pot1, "bob's part stays unassigned (TBLOCK, B20)");

        uint256[] memory e1 = new uint256[](1);
        e1[0] = 1;
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.NotPlayed.selector, uint256(1)));
        rw.claim(e1);
        _claimExact(alice, e1, full0 * wA / W, full1 * wA / W);
        console2.log("play gate fork: W, P", W, wA);
        console2.log("play gate fork: alice paid wtCOIN / TBLOCK", pot0, pot1);
    }

    // ================================================================ redeemDeferred against the REAL PoolManager

    /// The hook defers a payout by minting an ERC6909 claim when take() fails. That failure cannot be provoked on a plain token,
    /// so the claim is minted the same way the hook does (PoolManager.mint inside an unlock, paid by a real settle); then the
    /// rewards contract redeems it through the real PoolManager burn + take.
    function test_fork_redeemDeferred_realPoolManager() public {
        uint256 wt = _getWtcoin();
        uint256 amt = wt / 2;
        uint256 id = uint256(uint160(WTCOIN));
        trader.mintClaimTo(address(rw), amt);
        assertEq(IPMF(PM).balanceOf(address(rw), id), amt, "ERC6909 claim held by rewards");
        uint256 b0 = _bal(WTCOIN, address(rw));
        uint256 pm0 = _bal(WTCOIN, PM);
        vm.prank(stranger); // permissionless
        uint256 got = rw.redeemDeferred(WTCOIN);
        assertEq(got, amt);
        assertEq(_bal(WTCOIN, address(rw)) - b0, amt, "tokens arrived");
        assertEq(pm0 - _bal(WTCOIN, PM), amt, "tokens left the PoolManager");
        assertEq(IPMF(PM).balanceOf(address(rw), id), 0, "claim burnt");
        assertEq(rw.unassigned(WTCOIN), amt, "redeemed amount is unassigned, ready for the next pot");
    }
}
