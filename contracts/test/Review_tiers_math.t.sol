// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockVaultV2} from "../src/TBlockVaultV2.sol";
import {TBlockLock} from "../src/TBlockLock.sol";
import {V2VToken, FakeLikesV2, FakeContest2} from "./TBlockVaultV2.t.sol";

/// Adversarial review, math lens, of the amount tiers of TBlockVaultV2 (Phil 2026-11-11).
/// Every test here is a PROOF; each logs a "REVIEW-MATH" line with its measured numbers.
contract ReviewTiersMathTest is Test {
    V2VToken t; FakeLikesV2 L; TBlockLock K; TBlockVaultV2 V;
    uint256 constant MIN = 3_000_000e18; // $15 at $0.000005, same as TBlockVaultV2.t.sol
    uint64 G; uint64 constant EP = 7 days;
    address D2 = address(0xD2D2);

    function _vault(uint256 maxBudget) internal returns (TBlockVaultV2) {
        return new TBlockVaultV2(TBlockVaultV2.Config({ tblock: address(t), likes: address(L), contest: address(new FakeContest2()),
            lock: address(K), rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: maxBudget, claimWindow: 7 days,
            maxFeedPerCall: 862_000e18, feedCooldown: 1 days, dev: address(this), dev2: D2 }), new address[](0));
    }
    function setUp() public {
        vm.warp(1_800_000_000); G = uint64(block.timestamp);
        t = new V2VToken(); K = new TBlockLock(address(t)); L = new FakeLikesV2(G, EP, MIN, address(K));
        V = _vault(50_000_000e18);
    }
    function _player(uint256 i, uint256 amount, uint256 dur) internal returns (address p) {
        p = address(uint160(0x20_000 + i));
        t.mint(p, amount); vm.prank(p); t.approve(address(K), type(uint256).max);
        vm.prank(p); K.lock(amount, block.timestamp + dur);
    }
    function _usd(uint256 cents) internal pure returns (uint256) { return MIN * cents / 1_500; }

    /// 1. overflow: the tier products locked*15 and need*1000 at the whole 1e27 supply, end to end through claim()
    function test_math_no_overflow_at_full_supply() public {
        uint256 S = 1e27;
        assertEq(V.amountBonusAt(S, 1), 5_000);
        assertEq(V.amountBonusAt(S, S), 0);
        assertEq(V.amountBonusAt(S, S * 15 / 100), 1_500);
        uint256 headroom = type(uint256).max / 15 / S; // how many times the supply fits before locked*15 overflows
        TBlockVaultV2 W = _vault(type(uint256).max);
        address p = _player(1, S, 400 days);
        assertEq(W.lockFactorAt(p, MIN), 17_500);
        L.play(0, p, S); t.mint(address(W), 4 * S);
        vm.warp(G + EP);
        uint256 budget = W.closeEpoch(0);
        vm.prank(p); uint256 paid = W.claim(0);
        assertLe(paid, budget);
        console.log("REVIEW-MATH overflow: locked 1e27 claims fine, budget", budget, "paid", paid);
        console.log("REVIEW-MATH overflow: locked*15 overflows only above supply x", headroom);
    }

    /// 2. rounding at exact boundaries, with a need that is NOT a multiple of 3 (thresholds are fractional tokens)
    function test_math_boundaries_round_up_never_down() public view {
        uint256 need = 7; // $15 = 7 wei -> $100 = 46.67, $500 = 233.33, $1000 = 466.67 wei
        assertEq(V.amountBonusAt(46, need), 0);     // 46 wei = $98.57
        assertEq(V.amountBonusAt(47, need), 1_500); // 47 wei = $100.71
        assertEq(V.amountBonusAt(233, need), 1_500);
        assertEq(V.amountBonusAt(234, need), 3_000);
        assertEq(V.amountBonusAt(466, need), 3_000);
        assertEq(V.amountBonusAt(467, need), 5_000);
        /* exact multiples (need divisible by 3): equality is >=, so exactly $100 is tier 1 */
        assertEq(V.amountBonusAt(_usd(10_000), MIN), 1_500);
        assertEq(V.amountBonusAt(_usd(10_000) - 1, MIN), 0);
        console.log("REVIEW-MATH boundaries: need=7 wei -> thresholds 47/234/467 wei (ceil of 46.67/233.33/466.67), never below the dollar line");
    }

    /// 3. the factor range: the max reachable is exactly MAX_FACTOR, the min claimable is 10,194
    function test_math_factor_range() public {
        address top = _player(1, _usd(100_000), 4 * 365 days); // $1,000, 4 years (MAX_LOCK)
        address low = _player(2, MIN, 14 days);                // $15, 14 days -> 7 days left after 7
        assertEq(V.lockFactorAt(top, MIN), V.MAX_FACTOR());
        vm.warp(block.timestamp + 7 days);
        uint256 fLow = V.lockFactorAt(low, MIN);
        uint256 week = 7 days; uint256 full = 90 days;
        assertEq(fLow, 10_000 + 2_500 * week / full);
        assertEq(V.lockFactorAt(top, MIN), V.MAX_FACTOR());
        console.log("REVIEW-MATH range: max factor", V.MAX_FACTOR(), "min claimable factor", fLow);
        console.log("REVIEW-MATH range: min claimer gets play share x bps", fLow * 10_000 / V.MAX_FACTOR());
    }

    /// 4. sum(claims) <= budget for any spends, every player at the max factor (the worst case for the budget)
    function testFuzz_math_sum_of_claims_le_budget(uint256 seed, uint8 nRaw, uint256 fund) public {
        uint256 n = bound(nRaw, 1, 8);
        fund = bound(fund, 1e18, 1e27);
        address[] memory ps = new address[](n);
        for (uint256 i; i < n; i++) {
            ps[i] = _player(i, _usd(100_000) + (seed >> i) % 1e24, 400 days);
            L.play(0, ps[i], bound(uint256(keccak256(abi.encode(seed, i))), 1, 1e26));
        }
        t.mint(address(V), fund);
        vm.warp(G + EP);
        uint256 budget = V.closeEpoch(0);
        uint256 sum;
        for (uint256 i; i < n; i++) {
            (uint256 s, uint256 b) = V.owed(0, ps[i]);
            if (s + b == 0) continue;
            vm.prank(ps[i]); sum += V.claim(0);
        }
        assertLe(sum, budget);
        (uint256 eb, uint256 epaid,,,) = V.epochs(0);
        assertEq(epaid, sum); assertEq(eb, budget);
    }
    /// the same invariant, one fixed run whose numbers are logged
    function test_math_sum_of_claims_le_budget_logged() public {
        address a = _player(1, _usd(100_000), 400 days); address b = _player(2, _usd(100_000), 400 days);
        L.play(0, a, 3e24); L.play(0, b, 1e24);
        t.mint(address(V), 1e27);
        vm.warp(G + EP);
        uint256 budget = V.closeEpoch(0);
        vm.prank(a); uint256 pa = V.claim(0);
        vm.prank(b); uint256 pb = V.claim(0);
        assertLe(pa + pb, budget);
        console.log("REVIEW-MATH sum: budget", budget, "sum of claims", pa + pb);
    }

    /// 5. needFor (lower of photo and now) x tiers: a price move after close changes the tier, never the budget bound
    function test_math_needFor_photo_vs_now() public {
        address a = _player(1, _usd(6_000), 400 days);  // $60 at the close price
        address b = _player(2, _usd(12_000), 400 days); // $120 at the close price
        L.play(0, a, 1e24); L.play(0, b, 1e24);
        t.mint(address(V), 1e27);
        vm.warp(G + EP);
        uint256 budget = V.closeEpoch(0);
        /* (i) TBLOCK halves after close: minHold now = 2 x MIN -> need = photo; b keeps tier 1 */
        L.setMin(MIN * 2);
        assertEq(V.needFor(0), MIN);
        assertEq(V.lockFactor(b), 10_000 + 2_500, "the live view (today's minimum) shows b at $60, access tier");
        assertEq(V.lockFactorAt(b, V.needFor(0)), 10_000 + 1_500 + 2_500, "the claim uses the photo: tier 1");
        /* (ii) TBLOCK doubles after close: minHold now = MIN / 2 -> need = now; a moves up to tier 1 ($120 today) */
        L.setMin(MIN / 2);
        assertEq(V.needFor(0), MIN / 2);
        assertEq(V.lockFactorAt(a, V.needFor(0)), 10_000 + 1_500 + 2_500);
        vm.prank(a); uint256 pa = V.claim(0);
        vm.prank(b); uint256 pb = V.claim(0);
        assertLe(pa + pb, budget);
        console.log("REVIEW-MATH needFor: price x2 after close lifts a $60 lock to tier 1; budget", budget, "paid", pa + pb);
    }
}
