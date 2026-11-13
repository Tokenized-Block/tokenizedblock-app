// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockLockRewardsWeekly} from "../../src/TBlockLockRewardsWeekly.sol";

/// Base mainnet FORK test of TBlockLockRewardsWeekly (R2) against the REAL TBlockLock v1, BlockLikesV2 (hearts), TBlockVaultV2 (V,
/// whose playOf decides "played"), TBLOCK (B20, so the Base build of forge), wtCOIN and the monthly TBlockLockRewards R (its rescue
/// door is R2's funding path from the hook fees). Every address below was READ ON CHAIN 2026-11-13 (R.LOCK(), R.TBLOCK(), R.WTCOIN(),
/// R.guardian(), R.games(), V.LIKES()), never from memory.
///   FOUNDRY_BASE=true base-v1.1.1/forge.exe test --match-path test/lockrewards/Weekly.fork.t.sol --fork-url http://127.0.0.1:9549 -vv
/// Impersonation (vm.prank) exists only inside this local fork; nothing is signed or sent from a real wallet.
/// NE PROUVE PAS: the deploy transaction itself, nor a TAM / Skins play (only a heart; the TAM/Skins half of playOf is V's own code).
interface IERC20W { function balanceOf(address) external view returns (uint256); function transfer(address, uint256) external returns (bool); function approve(address, uint256) external returns (bool); }
interface ILockW { function lock(uint256 amount, uint256 unlockAt) external; function lockedOf(address) external view returns (uint256); }
interface ILikesW { function like(address blockToken, uint256 n) external returns (uint256); function minHold() external view returns (uint256); function currentEpoch() external view returns (uint256); }
interface IVaultW { function playOf(uint256 e, address p) external view returns (uint256); }
interface IRW {
    function rescueRequest(address token, address to, uint256 amount) external;
    function rescueExecute() external;
    function unassigned(address token) external view returns (uint256);
}

contract WeeklyForkTest is Test {
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant LOCK = 0xEc46b02bb1f3A58Ce37c023f8668f2207bc2B0aA;
    address constant LIKES = 0xbDaa207c1C537DEe23Bc1Dc89fec9d204BB45FE1;
    address constant VAULT = 0x6C8075f4eA3bd37511574b47229d5242CD1eAfC0;
    address constant R = 0xdc29421e9d0e8fFc9e1d4CB26b35241B4635A6b9;
    address constant GUARDIAN = 0x264496cC303F8dbe49a241EA84cD42BE8392BC80;

    TBlockLockRewardsWeekly r2;
    address alice = makeAddr("alice-plays");
    address bob = makeAddr("bob-locks-only");

    function setUp() public {
        r2 = new TBlockLockRewardsWeekly(TBLOCK, WTCOIN, LOCK, VAULT, GUARDIAN, 0.25 ether, 12_500_000 ether);
    }

    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b; // R.POOL_MANAGER(), read 2026-11-13: holds the pool TBLOCK
    function _give(address to, uint256 a) internal { vm.prank(PM); require(IERC20W(TBLOCK).transfer(to, a), "give"); }
    function _lock(address who, uint256 a) internal {
        _give(who, a + 100_000 ether);
        vm.startPrank(who);
        IERC20W(TBLOCK).approve(LOCK, a);
        ILockW(LOCK).lock(a, block.timestamp + 60 days);
        vm.stopPrank();
    }

    function test_fork_wiring_isTheRealGrid() public view {
        assertEq(r2.LIKES(), LIKES, "the grid comes from V.LIKES()");
        assertEq(r2.EPOCH(), 7 days);
        assertEq(r2.START_EPOCH(), ILikesW(LIKES).currentEpoch(), "R2 week = the hearts week = the vault week");
        console2.log("START_EPOCH", r2.START_EPOCH(), "ends", r2.epochEnd(r2.START_EPOCH()));
    }

    function test_fork_realHeart_paysThePlayer_notTheLockerWhoDidNotPlay() public {
        uint256 need = ILikesW(LIKES).minHold();
        uint256 amt = need * 2;
        _lock(alice, amt); _lock(bob, amt * 3);
        r2.enroll(alice); r2.enroll(bob);
        uint256 e = r2.currentEpoch() + 1;
        assertEq(r2.weightOf(alice, e), amt * 12_500 / 10_000, "60-day lock: band x1.25 on the REAL lockedOf");

        vm.warp(r2.epochStart(e) + 1 hours);
        vm.startPrank(alice);
        IERC20W(TBLOCK).approve(LIKES, type(uint256).max);
        uint256 burned = ILikesW(LIKES).like(TBLOCK, 1);
        vm.stopPrank();
        assertGt(burned, 0);
        assertGt(IVaultW(VAULT).playOf(e, alice), 0, "the REAL vault saw the heart in week e");
        assertTrue(r2.hasPlayed(alice, e)); assertFalse(r2.hasPlayed(bob, e));

        _give(address(r2), 4_000_000 ether);
        vm.warp(r2.epochEnd(e) + 1);
        for (uint256 k = r2.START_EPOCH(); k <= e; k++) r2.closeEpoch(k);
        (, uint256 p1) = r2.pot(e);
        assertEq(p1, 1_000_000 ether, "25% of the stock, under the weekly cap");

        uint256[] memory one = new uint256[](1); one[0] = e;
        uint256 before = IERC20W(TBLOCK).balanceOf(alice);
        vm.prank(alice); (, uint256 a1) = r2.claim(one);
        assertEq(a1, p1 * r2.weightOf(alice, e) / r2.totalWeight(e), "alice = pot x w / W");
        assertEq(IERC20W(TBLOCK).balanceOf(alice) - before, a1, "the REAL B20 TBLOCK arrived");
        vm.prank(bob); vm.expectRevert(abi.encodeWithSelector(TBlockLockRewardsWeekly.NotPlayed.selector, e)); r2.claim(one);
        console2.log("week", e, "alice paid (raw TBLOCK)", a1);
    }

    function test_fork_R_rescueDoor_feedsR2() public {
        _give(R, 3_000_000 ether);
        uint256 free = IRW(R).unassigned(TBLOCK);
        vm.prank(GUARDIAN); IRW(R).rescueRequest(TBLOCK, address(r2), free);
        vm.warp(block.timestamp + 72 hours);
        vm.prank(GUARDIAN); IRW(R).rescueExecute();
        assertEq(r2.unassigned(TBLOCK), free, "what R held unassigned is now R2's weekly stock");
        console2.log("moved from R to R2 (raw TBLOCK)", free);
    }
}
