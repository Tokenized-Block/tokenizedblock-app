// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import {BlockLikesV2} from "../src/BlockLikesV2.sol";
import {TBlockVaultV2} from "../src/TBlockVaultV2.sol";
import {TBlockLock} from "../src/TBlockLock.sol";

contract RTok {
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { _m(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) { require(allowance[f][msg.sender] >= a); allowance[f][msg.sender] -= a; _m(f, to, a); return true; }
    function _m(address f, address to, uint256 a) internal { require(balanceOf[f] >= a, "bal"); balanceOf[f] -= a; balanceOf[to] += a; }
}
contract RContest { function currentRound() external pure returns (uint256) { return 0; } function fundRoom(uint256) external pure returns (uint256) { return 0; } function fund(uint256, uint256) external pure {} }

contract ReviewV2Test is Test {
    RTok t; TBlockLock K_; BlockLikesV2 L; TBlockVaultV2 V;
    address A = address(0xA11CE); address B = address(0xB0B); address KP = address(0x4EE9E7); address D1 = address(0xD1D1); address D2 = address(0xD2D2);
    address constant BLK = address(uint160((uint256(0xb2000000000000000000) << 80) | 0xba9bf8330307f8830e));
    uint256 constant P0 = 5e12; uint256 constant FLOOR = 1e11; uint256 constant CEIL = P0 * 100; /* construction cap after the review: start x 100 */ uint64 G;

    function cfg(uint256 hold) internal view returns (BlockLikesV2.Config memory) {
        return BlockLikesV2.Config({ tblock: address(t), lock: address(K_), genesis: G, epoch: 7 days, likeUsdE18: 5e17, holdUsdE18: hold,
            priceFloor: FLOOR, priceCeil: CEIL, startPrice: P0, maxStepBps: 1_000, minInterval: 3600, keeper: KP, dev: D1, dev2: D2 });
    }
    function build(uint256 hold) internal {
        L = new BlockLikesV2(cfg(hold));
        V = new TBlockVaultV2(TBlockVaultV2.Config({ tblock: address(t), likes: address(L), contest: address(new RContest()), lock: address(K_),
            rewardBps: 5_000, topBps: 2_000, rebateBps: 5_000, maxEpochBudget: 50_000_000e18, claimWindow: 7 days,
            maxFeedPerCall: 1e18, feedCooldown: 1 days, dev: D1, dev2: D2 }));
        address[2] memory ps = [A, B];
        for (uint256 i; i < 2; i++) { t.mint(ps[i], 1e30); vm.startPrank(ps[i]); t.approve(address(K_), type(uint256).max); t.approve(address(L), type(uint256).max); vm.stopPrank(); }
    }
    function setUp() public { vm.warp(1_800_000_000); G = uint64(block.timestamp); t = new RTok(); K_ = new TBlockLock(address(t)); }

    /// R1: same-block lock+claim+requestWithdraw works, but the tokens stay stuck >= 7 days (the commitment binds)
    function test_R1_jit_lock_claim_exit_still_binds_7_days() public {
        build(15e18);
        { uint256 mh = L.minHold(); vm.prank(A); K_.lock(mh, block.timestamp + 7 days); }
        vm.prank(A); L.like(BLK, 1);
        vm.prank(A); K_.requestWithdraw(); vm.warp(block.timestamp + 7 days); vm.prank(A); K_.withdraw(); // A left during the epoch
        t.mint(address(V), 1_000_000e18);
        vm.warp(uint256(G) + 7 days); V.closeEpoch(0);
        vm.startPrank(A);
        K_.lock(L.minHold(), block.timestamp + 7 days);   // just-in-time re-lock, same block as the claim
        uint256 paid = V.claim(0);
        K_.requestWithdraw();
        vm.expectRevert(); K_.withdraw();
        vm.warp(block.timestamp + 7 days - 1); vm.expectRevert(); K_.withdraw();
        vm.warp(block.timestamp + 1); K_.withdraw();
        vm.stopPrank();
        assertGt(paid, 0);
        emit log_named_uint("JIT claim paid", paid);
    }

    /// R2 (after the fix): a stolen keeper needs many more hourly writes (10 % max), and ONE dev tx freezes it back to the start price
    function test_R2_stolen_keeper_reach_and_instant_freeze() public {
        build(15e18);
        uint256 n; uint256 p = P0;
        while (p > FLOOR) { vm.warp(block.timestamp + 3600); uint256 q = p * 9_000 / 10_000; if (q < FLOOR) q = FLOOR; vm.prank(KP); L.setPrice(q); p = q; n++; }
        emit log_named_uint("writes to floor", n);
        emit log_named_uint("heart at floor (whole TBLOCK)", L.likePrice() / 1e18);
        emit log_named_uint("minHold at floor (whole TBLOCK)", L.minHold() / 1e18);
        assertGe(n, 37, "10 % per hour: at least 37 hours to the floor (was 14 at 25 %)");
        vm.prank(D1); L.freezePrice(true);
        assertEq(L.price(), P0, "one dev tx: back to the start price");
        vm.warp(block.timestamp + 3600); vm.prank(KP); vm.expectRevert(BlockLikesV2.Frozen.selector); L.setPrice(P0);
        assertGt(L.likePrice(), 0);
    }

    /// R3 (after the fix): an honest 1-step price drop after the close no longer takes the earned claim away (minimum photographed at close)
    function test_R3_price_move_keeps_earned_claim() public {
        build(15e18);
        { uint256 mh = L.minHold(); vm.prank(A); K_.lock(mh, block.timestamp + 60 days); }
        vm.prank(A); L.like(BLK, 1);
        t.mint(address(V), 1_000_000e18);
        vm.warp(uint256(G) + 7 days); V.closeEpoch(0);
        vm.warp(block.timestamp + 3600); vm.prank(KP); L.setPrice(P0 * 9_900 / 10_000);  // -1 %: the $15 minimum now asks more TBLOCK
        vm.prank(A); uint256 paid = V.claim(0);
        assertGt(paid, 0, "claimed with the minimum photographed at close");
    }

    /// R4 (after the fix): holdUsdE18 = 0 is refused at construction
    function test_R4_hold_zero_refused() public {
        BlockLikesV2.Config memory c = cfg(0);
        vm.expectRevert(BlockLikesV2.BadParams.selector); new BlockLikesV2(c);
    }
}
