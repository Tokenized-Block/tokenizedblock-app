// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Economy v2 tiers on a Base FORK (forge only, impersonation inside forge only; nothing is signed or sent on mainnet).
/// BlockLikesV2 + TBlockVaultV2 are deployed on the fork, wired to the REAL TBlockLock and the REAL TBLOCK (B20). Four fresh wallets get
/// TBLOCK from the Uniswap v4 PoolManager (impersonated inside forge) and lock it on the REAL lock: ~$15, ~$120, ~$600, ~$1,200 at the
/// fork price (the likes start price = START_PRICE_E18, the live lower price frozen for the deploy). lockFactor must be exact per tier.
/// Run (from contracts/):
///   START_PRICE_E18=<int> FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/forge.exe test --match-contract EconomieV2TiersFork \
///     --fork-url https://mainnet.base.org -vv

import "forge-std/Test.sol";
import {TBlockVaultV2} from "../src/TBlockVaultV2.sol";
import {BlockLikesV2} from "../src/BlockLikesV2.sol";

interface IERC20Fork {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}
interface ILockFork {
    function lock(uint256 amount, uint256 unlockAt) external;
    function activeLockedOf(address) external view returns (uint256);
    function unlockAtOf(address) external view returns (uint256);
}

contract EconomieV2TiersFork is Test {
    /* copied from contracts/preparer-deploiement-economie-v2.mjs and test/TBlockBuybackV2.fork.t.sol, not recalled */
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant LOCK = 0xEc46b02bb1f3A58Ce37c023f8668f2207bc2B0aA;      // checksum by `cast to-check-sum-address`
    address constant CONTEST = 0x001EaD57218F3AB79e2DcAcb05DdFC4574Ef177c;
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;   // Uniswap v4 PoolManager: holds the pool's TBLOCK
    address constant D1 = address(0xD001); address constant D2 = address(0xD002); address constant KEEP = address(0xCE);
    uint256 constant E = 1e18;

    BlockLikesV2 L; TBlockVaultV2 V; uint256 START; uint256 need;
    address[4] who; uint256[4] usd = [uint256(15), 120, 600, 1_200]; uint256[4] bonus = [uint256(0), 1_500, 3_000, 5_000];

    function setUp() public {
        assertGt(LOCK.code.length, 0, "the real lock is on this fork");
        START = vm.envOr("START_PRICE_E18", uint256(0));
        require(START > 0, "START_PRICE_E18 is required (the live lower price x 1e18)");
        L = new BlockLikesV2(BlockLikesV2.Config({ tblock: TBLOCK, lock: LOCK, genesis: uint64(block.timestamp), epoch: 7 days,
            likeUsdE18: 5e17, holdUsdE18: 15e18, priceFloor: START / 50, priceCeil: START * 100, startPrice: START,
            maxStepBps: 1_000, minInterval: 1 hours, keeper: KEEP, dev: D1, dev2: D2, rewards: address(0x8E7A8D) }));
        V = new TBlockVaultV2(TBlockVaultV2.Config({ tblock: TBLOCK, likes: address(L), contest: CONTEST, lock: LOCK,
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: 50_000_000e18, claimWindow: 14 days,
            maxFeedPerCall: 862_000e18, feedCooldown: 1 days, dev: D1, dev2: D2 }), new address[](0));
        need = L.minHold();
        assertEq(need, (15e18 * E + START - 1) / START, "$15 minimum = ceil(15 / price)");
        console2.log("fork block / start price e18 :", block.number, START);
        console2.log("$15 minimum (whole TBLOCK)   :", need / E);
        console2.log("PoolManager TBLOCK (whole)   :", IERC20Fork(TBLOCK).balanceOf(PM) / E);
        for (uint256 i; i < 4; i++) {
            who[i] = address(uint160(0x7E57_0000 + i));
            uint256 amt = need * usd[i] / 15;                           // an exact multiple of the $15 minimum: $15 / $120 / $600 / $1,200
            vm.prank(PM); assertTrue(IERC20Fork(TBLOCK).transfer(who[i], amt + need));   // + $15 unlocked, to pay hearts
            assertEq(IERC20Fork(TBLOCK).balanceOf(who[i]), amt + need, "funded");
            vm.startPrank(who[i]);
            IERC20Fork(TBLOCK).approve(LOCK, amt);
            ILockFork(LOCK).lock(amt, block.timestamp + 120 days);     // > TIME_FULL: the full time bonus
            IERC20Fork(TBLOCK).approve(address(L), type(uint256).max);
            vm.stopPrank();
            assertEq(ILockFork(LOCK).activeLockedOf(who[i]), amt, "locked on the REAL lock");
        }
    }

    function test_fork_tiers_exact_at_15_120_600_1200() public view {
        for (uint256 i; i < 4; i++) {
            uint256 f = V.lockFactor(who[i]);
            console2.log("usd / locked (whole) / factor:", usd[i], ILockFork(LOCK).activeLockedOf(who[i]) / E, f);
            assertEq(f, 10_000 + bonus[i] + 2_500, "tier exact: 1x + amount bonus + full time bonus");
            assertEq(V.amountBonusAt(ILockFork(LOCK).activeLockedOf(who[i]), need), bonus[i]);
        }
        /* one wei under the $100 line keeps tier 0, the line itself is tier 1 (the threshold is need x 100 / 15, rounded up) */
        uint256 line = (need * 100 + 14) / 15;
        assertEq(V.amountBonusAt(line - 1, need), 0, "one wei under $100: access only");
        assertEq(V.amountBonusAt(line, need), 1_500, "$100: +15 %");
    }

    /// the same four lockers play the same week (2 hearts each, a real burn), the vault is funded from the PoolManager, closed and
    /// claimed on the fork: a bigger lock is paid strictly more for the same play, and the sum never exceeds the budget.
    function test_fork_claims_follow_the_tiers() public {
        for (uint256 i; i < 4; i++) { vm.prank(who[i]); L.like(TBLOCK, 2); }
        vm.prank(PM); IERC20Fork(TBLOCK).transfer(address(V), need * 100);
        vm.warp(L.epochEnd(0));
        uint256 budget = V.closeEpoch(0);
        uint256 sum; uint256 prev;
        console2.log("budget / total spent (wei)   :", budget, L.totalSpentIn(0));
        for (uint256 i; i < 4; i++) {
            (uint256 share, uint256 top) = V.owed(0, who[i]);           // the top bonus (one player) is kept out of the comparison
            uint256 b0 = IERC20Fork(TBLOCK).balanceOf(who[i]);
            vm.prank(who[i]); uint256 paid = V.claim(0);
            assertEq(paid, share + top, "claim pays owed()");
            assertEq(IERC20Fork(TBLOCK).balanceOf(who[i]) - b0, paid, "paid what claim() returned");
            console2.log("usd / share / top (wei)      :", usd[i], share, top);
            assertGt(share, prev, "a bigger tier is paid more for the same play");
            prev = share; sum += paid;
        }
        assertLe(sum, budget, "never more than the budget");
    }
}
