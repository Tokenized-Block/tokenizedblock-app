// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Adversarial review (lens: gaming) of the TBlockVaultV2 amount tiers (Phil 2026-11-11: "$15 locked gives ACCESS; bigger holders gain
/// more from $100 locked"). Real TBlockLock + real BlockLikesV2 (bounded keeper price), a plain ERC-20 mock for TBLOCK. Unit tests only.

import "forge-std/Test.sol";
import {TBlockVaultV2} from "../src/TBlockVaultV2.sol";
import {TBlockLock} from "../src/TBlockLock.sol";
import {BlockLikesV2} from "../src/BlockLikesV2.sol";

contract RTGToken {
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
contract RTGContest {
    function currentRound() external pure returns (uint256) { return 0; }
    function fundRoom(uint256) external pure returns (uint256) { return 0; }
    function fund(uint256, uint256) external pure {}
}

contract ReviewTiersGamingTest is Test {
    RTGToken t; TBlockLock K; BlockLikesV2 L; TBlockVaultV2 V;
    address KEEPER = address(0x4EE9); address D2 = address(0xD2D2);
    address W = address(0x3A1E);                                   // the epoch's top player (keeps the top bonus out of comparisons)
    address BLOCK_TOKEN = address(uint160((uint256(0xb2000000000000000000) << 80) | 1));
    uint256 constant START = 5e12;                                  // $0.000005 per TBLOCK (1e18-scaled)
    uint256 constant MIN = 3_000_000e18;                            // $15 at START
    uint64 G; uint64 constant EP = 7 days;
    uint256 nextId;

    function setUp() public {
        vm.warp(1_800_000_000); G = uint64(block.timestamp);
        t = new RTGToken(); K = new TBlockLock(address(t));
        L = new BlockLikesV2(BlockLikesV2.Config({ tblock: address(t), lock: address(K), genesis: G, epoch: EP,
            likeUsdE18: 5e17, holdUsdE18: 15e18, priceFloor: START / 100, priceCeil: START * 100, startPrice: START,
            maxStepBps: 1_000, minInterval: 1 hours, keeper: KEEPER, dev: address(this), dev2: D2,
            rewards: address(0x8E7A8D) }));
        V = new TBlockVaultV2(TBlockVaultV2.Config({ tblock: address(t), likes: address(L), contest: address(new RTGContest()), lock: address(K),
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: type(uint128).max, claimWindow: 7 days,
            maxFeedPerCall: 1e18, feedCooldown: 1 days, dev: address(this), dev2: D2 }), new address[](0));
        assertEq(L.minHold(), MIN, "$15 at START");
        W = _fresh(); _lock(W, MIN, 400 days); _like(W, 200);
    }

    /* helpers */
    function _fresh() internal returns (address p) {
        p = address(uint160(0x20_000 + nextId++));
        t.mint(p, 1e33); vm.startPrank(p); t.approve(address(K), type(uint256).max); t.approve(address(L), type(uint256).max); vm.stopPrank();
    }
    function _usd(uint256 cents) internal pure returns (uint256) { return MIN * cents / 1_500; }   // exact at START
    function _lock(address p, uint256 amount, uint256 dur) internal { vm.prank(p); K.lock(amount, block.timestamp + dur); }
    function _like(address p, uint256 n) internal { vm.prank(p); L.like(BLOCK_TOKEN, n); }
    function _close() internal returns (uint256 budget) {
        t.mint(address(V), 1e24);
        vm.warp(L.epochEnd(0));
        budget = V.closeEpoch(0);
    }
    function _setPrice(uint256 p) internal { vm.warp(block.timestamp + 1 hours); vm.prank(KEEPER); L.setPrice(p); }
    function _share(address p) internal view returns (uint256 s) { (s,) = V.owed(0, p); }

    // ---------------------------------------------------------------------------------------------------------- 1. split / merge
    /// splitting a lock (and the play) across wallets never beats one wallet holding it all: the tier bonus is non-decreasing in the
    /// amount and the share is linear in `spent`, so sum(s_i x f(l_i)) <= S x f(L). Floors only make the split smaller.
    function testFuzz_split_never_beats_merge(uint256 totalCents, uint256 cutCents, uint8 h1, uint8 h2) public {
        totalCents = bound(totalCents, 3_000, 300_000);              // $30 .. $3,000 in total
        cutCents = bound(cutCents, 1_500, totalCents - 1_500);       // both parts keep access ($15+)
        h1 = uint8(bound(h1, 1, 50)); h2 = uint8(bound(h2, 1, 50));
        address m = _fresh(); address s1 = _fresh(); address s2 = _fresh();
        _lock(m, _usd(totalCents), 400 days); _lock(s1, _usd(cutCents), 400 days); _lock(s2, _usd(totalCents - cutCents), 400 days);
        _like(m, uint256(h1) + h2); _like(s1, h1); _like(s2, h2);
        _close();
        assertLe(_share(s1) + _share(s2), _share(m), "split <= merge");
    }
    function test_split_examples_output() public {
        address m = _fresh(); address a = _fresh(); address b = _fresh();
        address m2 = _fresh(); address c = _fresh(); address d = _fresh();
        _lock(m, _usd(100_000), 400 days); _lock(a, _usd(50_000), 400 days); _lock(b, _usd(50_000), 400 days);
        _lock(m2, _usd(19_900), 400 days); _lock(c, _usd(10_000), 400 days); _lock(d, _usd(9_900), 400 days);
        _like(m, 20); _like(a, 10); _like(b, 10); _like(m2, 20); _like(c, 10); _like(d, 10);
        _close();
        console2.log("merge $1000 one wallet  :", _share(m));
        console2.log("split $500 + $500       :", _share(a) + _share(b));
        console2.log("merge $199 one wallet   :", _share(m2));
        console2.log("split $100 + $99        :", _share(c) + _share(d));
        assertLt(_share(a) + _share(b), _share(m)); assertLt(_share(c) + _share(d), _share(m2));
    }

    // ---------------------------------------------------------------------------------------------------------- 2. lock just before claim
    /// BY DESIGN (spec: the amount tier reads the lock AT the claim; MIN_COMMIT unchanged): a $15 player tops up to $1,000 in the claim's
    /// block with only 7 days of commitment and gets tier 3. The capital cannot leave before 7 days, and the gain is bounded by the
    /// player's own play share (no one else's share moves).
    function test_topup_in_the_claim_block_gets_tier3_capital_stuck_7_days() public {
        address p = _fresh(); address q = _fresh();
        _lock(p, MIN, 7 days); _like(p, 10);                         // access only while playing (7-day lock)
        _lock(q, MIN, 30 days); _like(q, 10);
        _close();
        uint256 before = _share(p); uint256 qBefore = _share(q);
        vm.prank(p); K.lock(_usd(100_000) - MIN, block.timestamp + 7 days);   // top-up to $1,000, committed exactly MIN_COMMIT
        uint256 afterTop = _share(p);
        console2.log("share before top-up (7-day lock ended at close, no access):", before);
        console2.log("share after $985 top-up :", afterTop);
        assertEq(V.lockFactorAt(p, V.needFor(0)), 10_000 + 5_000 + 194, "tier 3 + 7 days of time bonus");
        assertEq(_share(q), qBefore, "another player's share does not move");
        vm.prank(p); uint256 paid = V.claim(0);
        assertEq(paid, afterTop);
        vm.prank(p); K.requestWithdraw();
        vm.prank(p); vm.expectRevert(); K.withdraw();                // capital stuck at least 7 days
        vm.warp(block.timestamp + 7 days);
        vm.prank(p); K.withdraw();
        console2.log("capital returned after  : 7 days");
    }
    /// no flash lock: a lock cannot be taken and returned in one transaction (MIN_LOCK 7 days + 7-day withdraw period)
    function test_no_flash_lock() public {
        address p = _fresh();
        vm.prank(p); vm.expectRevert(); K.lock(_usd(100_000), block.timestamp + 7 days - 1);
        _lock(p, _usd(100_000), 7 days);
        vm.prank(p); K.requestWithdraw();
        vm.prank(p); vm.expectRevert(); K.withdraw();
    }

    // ---------------------------------------------------------------------------------------------------------- 3. keeper within bounds
    /// after close, the keeper (one +10 % step, after 1 h) can push a claimer UP a tier (needFor = the lower of photo and now),
    /// never DOWN below the photo; no other claimer's share moves in either direction.
    function test_keeper_after_close_pushes_up_never_down_others_unmoved() public {
        address a = _fresh(); address b = _fresh(); address c = _fresh();
        _lock(a, _usd(9_500), 400 days);                               // $95 at close: tier 0
        _lock(b, _usd(10_000), 400 days);                              // exactly $100 at close: tier 1
        _lock(c, _usd(5_000), 400 days);
        _like(a, 10); _like(b, 10); _like(c, 10);
        _close();
        uint256 a0 = _share(a); uint256 b0 = _share(b); uint256 c0 = _share(c);
        _setPrice(START * 11_000 / 10_000);                            // +10 %
        console2.log("A $95 share at photo    :", a0);
        console2.log("A share after +10% price:", _share(a));
        assertGt(_share(a), a0, "pushed up to tier 1");
        assertEq(_share(c), c0, "bystander unmoved");
        _setPrice(START);                                              // back
        _setPrice(START * 9_000 / 10_000);                             // -10 % below the photo
        assertEq(V.needFor(0), V.minHoldAt(0), "need = the photo");
        assertEq(_share(b), b0, "B keeps the $100 tier of the close");
        assertEq(_share(a), a0, "A back to tier 0, not lower");
        assertEq(_share(c), c0, "bystander unmoved");
        console2.log("B $100 share at -10%    :", _share(b), "(= at close)");
    }

    // ---------------------------------------------------------------------------------------------------------- 4. front-run closeEpoch
    /// whoever closes chooses the photo. Closing just after a keeper -10 % step drops a $100 lock to tier 0 (if the price stays there),
    /// but nobody else gains: the other claimers' shares are identical, the victim's lost part is released to the free balance.
    function test_close_timing_moves_only_the_victims_own_share() public {
        address a = _fresh(); address b = _fresh();
        _lock(a, _usd(10_000), 400 days); _lock(b, _usd(200_000), 400 days);   // B $2,000: tier 3 even after -10 %
        _like(a, 10); _like(b, 10);
        t.mint(address(V), 1e24);
        vm.warp(L.epochEnd(0));
        uint256 snap = vm.snapshotState();
        V.closeEpoch(0);
        uint256 aHonest = _share(a); uint256 bHonest = _share(b);
        vm.revertToState(snap);
        _setPrice(START * 9_000 / 10_000);                             // keeper -10 % right before close
        V.closeEpoch(0);
        console2.log("A $100 close at START   :", aHonest);
        console2.log("A close after -10%      :", _share(a));
        console2.log("B share both closes     :", bHonest, _share(b));
        assertLt(_share(a), aHonest, "A loses its tier");
        assertEq(_share(b), bHonest, "B gains nothing from A's loss");
        _setPrice(START * 99 / 100); _setPrice(START);                 // price recovers within the window (two bounded steps)
        assertEq(_share(a), aHonest, "A can still claim at the recovered price: need = min(photo, now)");
    }

    // ---------------------------------------------------------------------------------------------------------- 5. boundary rounding
    /// a UI computing "$100 of TBLOCK" as ceil(100e36 / price) (rounding up like minHold) can fall a few wei under the tier, because the
    /// threshold is ceil(15e36 / price) x 100 / 15 (the $15 minimum is rounded UP before being multiplied). Never the other way: a lock
    /// under $100 never gets tier 1. Size: < 7 wei (1e-17 TBLOCK).
    function test_ui_hundred_dollars_can_miss_tier1_by_wei() public view {
        uint256 misses; uint256 worst; uint256 firstP;
        for (uint256 p = START; p < START + 200; p++) {
            uint256 need = (uint256(15e18) * 1e18 + p - 1) / p;
            uint256 ui = (uint256(100e18) * 1e18 + p - 1) / p;
            if (V.amountBonusAt(ui, need) == 0) {
                misses++; if (firstP == 0) firstP = p;
                uint256 gap = (need * 100 + 14) / 15 - ui;
                if (gap > worst) worst = gap;
            }
            /* a lock strictly under $100 at that price never gets the tier */
            uint256 under = uint256(100e18) * 1e18 / p; if (under * p == uint256(100e18) * 1e18) under -= 1;
            assertEq(V.amountBonusAt(under, need), 0, "under $100 never tier 1");
        }
        console2.log("prices tried / UI misses:", uint256(200), misses);
        console2.log("first price / worst gap :", firstP, worst);
        assertGt(misses, 0); assertLt(worst, 7);
    }

    // ---------------------------------------------------------------------------------------------------------- 6. the ceiling holds
    function testFuzz_factor_never_above_max(uint256 cents, uint256 dur) public {
        cents = bound(cents, 1_500, 1e8); dur = bound(dur, 7 days, 4 * 365 days);
        address p = _fresh(); _lock(p, _usd(cents), dur);
        assertLe(V.lockFactor(p), V.MAX_FACTOR());
    }

    // ---------------------------------------------------------------------------------------------------------- 7. rebate cap vs tiers
    /// F1 REGRESSION. With the planned config (topBps 2,000, rebateBps 5,000) and a vault rich enough that closeEpoch's budget reaches its
    /// payable_ ceiling (= total spent), the old owed() scaled first (0.8 x spent x f / 17,500) and capped after (0.5 x spent): every
    /// factor >= 10,938 was cut to the same 0.5 x spent, so a $15 lock with 43 days left got exactly what a $1,000 lock for 4 years got.
    /// Fixed: the cap applies to v1's share BEFORE the factor, so the tiers count in every epoch, rich or lean.
    function test_rich_epoch_cap_keeps_the_tiers() public {
        address small = _fresh(); address big = _fresh();
        _lock(small, MIN, 50 days);                                      // $15, 43 days left at close: f = 10,000 + 2,500 x 43/90 = 11,194
        _lock(big, _usd(100_000), 4 * 365 days);                         // $1,000, 4 years: f = 17,500
        _like(small, 10); _like(big, 10);
        t.mint(address(V), 1e30);                                        // rich vault
        vm.warp(L.epochEnd(0));
        uint256 snap = vm.snapshotState();
        uint256 budget = V.closeEpoch(0);
        console2.log("rich: budget / total    :", budget, L.totalSpentIn(0));
        console2.log("rich: $15/43d vs $1000  :", _share(small), _share(big));
        assertEq(budget, L.totalSpentIn(0), "budget at payable_ ceiling");
        uint256 cap = L.spentIn(0, big) * V.REBATE_BPS() / 10_000;
        assertEq(L.spentIn(0, small), L.spentIn(0, big), "same play");
        assertEq(V.lockFactorAt(big, V.needFor(0)), V.MAX_FACTOR(), "big at the max factor");
        assertEq(_share(big), cap, "the max factor gets the full capped share");
        assertEq(_share(small), cap * V.lockFactorAt(small, V.needFor(0)) / V.MAX_FACTOR(), "small: capped share x its factor");
        assertLt(_share(small), _share(big), "the tiers still count in a rich epoch");
        vm.revertToState(snap);
        /* modest vault: the budget is well under total spent, the tiers show */
        uint256 bal = t.balanceOf(address(V));
        vm.prank(address(V)); t.transfer(address(0xBEEF), bal - 1e24);
        V.closeEpoch(0);
        console2.log("lean: $15/43d vs $1000  :", _share(small), _share(big));
        assertLt(_share(small), _share(big));
    }
}
