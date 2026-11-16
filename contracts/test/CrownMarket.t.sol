// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CrownMarket.sol";

contract CMPrice { uint256 public price; uint256 public priceSetAt; function set(uint256 p) external { price = p; priceSetAt = block.timestamp; } }
contract CMTok {
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 v) external { balanceOf[to] += v; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transfer(address to, uint256 v) external returns (bool) { require(balanceOf[msg.sender] >= v, 'bal'); balanceOf[msg.sender] -= v; balanceOf[to] += v; return true; }
    function transferFrom(address f, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[f][msg.sender]; require(a >= v, 'allow'); require(balanceOf[f] >= v, 'bal');
        if (a != type(uint256).max) allowance[f][msg.sender] = a - v; balanceOf[f] -= v; balanceOf[to] += v; return true;
    }
}

contract CrownMarketTest is Test {
    CMTok t; CMPrice ps; CrownMarket m;
    address vault = address(0xBEEF); address res = address(0x5E5); address dev = address(0xD1); address dev2 = address(0xD2);
    address a = address(0xA); address b = address(0xB); address c = address(0xC);
    address NVDA = address(0x1001); address AAPL = address(0x1002); address TSLA = address(0x1003);
    uint256 constant G = 1000; uint256 constant RB = 3000;

    function setUp() public {
        t = new CMTok(); ps = new CMPrice(); ps.set(4.17e12);
        m = new CrownMarket(CrownMarket.Config({ tblock: address(t), vault: vault, likes: address(ps), resolver: res, dev: dev, dev2: dev2, genesisBlock: G,
            roundBlocks: RB, resolveDeadline: 600, challengeBlocks: 300, feeBps: 500, minBetUsdE18: 0.5e18, challengeBondUsdE18: 5e18, maxPriceAge: 6 hours }));
        for (uint256 i = 0; i < 4; i++) { address u = [a, b, c, address(0xCC)][i]; t.mint(u, 1e30); vm.prank(u); t.approve(address(m), type(uint256).max); }
        vm.roll(G + 10);
    }
    function _bet(address u, address blk, uint256 v) internal { vm.prank(u); m.bet(0, blk, v); }

    function test_betsOnlyInTheFirstHalf_andAboveTheMinimum() public {
        uint256 min = m.minBet();
        vm.prank(a); vm.expectRevert(abi.encodeWithSelector(CrownMarket.TooLow.selector, min)); m.bet(0, NVDA, min - 1);
        _bet(a, NVDA, min);
        vm.roll(G + RB / 2); vm.prank(a); vm.expectRevert(CrownMarket.Closed.selector); m.bet(0, NVDA, min);
        vm.prank(a); vm.expectRevert(CrownMarket.Closed.selector); m.bet(1, NVDA, min); /* round 1 not started */
    }

    function test_parimutuel_winnersShareNetPot_feeToVault_once() public {
        _bet(a, NVDA, 300e22); _bet(b, NVDA, 100e22); _bet(c, AAPL, 600e22);
        vm.roll(G + RB); vm.prank(res); m.post(0, NVDA, keccak256("world"));
        vm.prank(a); vm.expectRevert(CrownMarket.NothingToClaim.selector); m.claim(0); /* inside the challenge window */
        vm.roll(G + RB + 301);
        uint256 a0 = t.balanceOf(a); uint256 b0 = t.balanceOf(b);
        vm.prank(a); m.claim(0); vm.prank(b); m.claim(0);
        uint256 net = 1000e22 - 1000e22 * 500 / 10_000;
        assertEq(t.balanceOf(a) - a0, net * 300 / 400); assertEq(t.balanceOf(b) - b0, net * 100 / 400);
        assertEq(t.balanceOf(vault), 1000e22 * 500 / 10_000);
        vm.prank(c); vm.expectRevert(CrownMarket.NothingToClaim.selector); m.claim(0); /* the loser */
        vm.prank(a); vm.expectRevert(CrownMarket.NothingToClaim.selector); m.claim(0); /* twice */
        assertLe(t.balanceOf(address(m)), 2); /* only rounding dust */
    }

    function test_challenge_refundsEverybody_bondToVault_noFee() public {
        _bet(a, NVDA, 300e22); _bet(c, AAPL, 600e22);
        vm.roll(G + RB); vm.prank(res); m.post(0, NVDA, bytes32(0));
        uint256 bond = m.bondFor(0);
        assertGe(bond, (uint256(900e22) * 1_000 + 9_999) / 10_000); /* at least 10 % of the pot ($5 may be more) */
        vm.prank(b); m.challenge(0);
        assertEq(t.balanceOf(vault), bond);
        uint256 a0 = t.balanceOf(a); uint256 c0 = t.balanceOf(c);
        vm.prank(a); m.claim(0); vm.prank(c); m.claim(0);
        assertEq(t.balanceOf(a) - a0, 300e22); assertEq(t.balanceOf(c) - c0, 600e22); assertEq(t.balanceOf(vault), bond);
        vm.roll(G + RB + 400); vm.prank(b); vm.expectRevert(CrownMarket.NotPosted.selector); m.challenge(0);
    }

    /// review Grok point 1: a LOSER that challenges loses its own stakes (to the vault) and pays 10 % of the pot; the others are refunded
    function test_challengeByALoser_costsItsStakes_andTenPercent() public {
        _bet(a, NVDA, 300e22); _bet(c, AAPL, 600e22);
        vm.roll(G + RB); vm.prank(res); m.post(0, NVDA, bytes32(0));
        uint256 c0 = t.balanceOf(c); uint256 bond = m.bondFor(0);
        vm.prank(c); m.challenge(0);
        assertEq(c0 - t.balanceOf(c), bond); assertEq(t.balanceOf(vault), bond + 600e22);
        vm.prank(c); vm.expectRevert(CrownMarket.NothingToClaim.selector); m.claim(0);
        uint256 a0 = t.balanceOf(a); vm.prank(a); m.claim(0); assertEq(t.balanceOf(a) - a0, 300e22);
    }
    /// review Grok point 2: a stale hearts price blocks bets but NOT the challenge
    function test_stalePrice_stillLetsAWrongResultBeChallenged() public {
        _bet(a, NVDA, 300e22);
        vm.roll(G + RB); vm.prank(res); m.post(0, AAPL, bytes32(0));
        vm.warp(block.timestamp + 7 hours);
        vm.prank(b); m.challenge(0);
        (, CrownMarket.State st,,,,) = m.rounds(0); assertEq(uint256(st), uint256(CrownMarket.State.Challenged));
    }

    function test_noResultInTime_refunds() public {
        _bet(a, NVDA, 300e22);
        vm.roll(G + RB + 600 + 1);
        vm.prank(res); vm.expectRevert(CrownMarket.Closed.selector); m.post(0, NVDA, bytes32(0));
        uint256 a0 = t.balanceOf(a); vm.prank(a); m.claim(0); assertEq(t.balanceOf(a) - a0, 300e22);
    }

    function test_nobodyOnTheWinner_refunds_noFee() public {
        _bet(a, NVDA, 300e22);
        vm.roll(G + RB); vm.prank(res); m.post(0, TSLA, bytes32(0));
        uint256 a0 = t.balanceOf(a); vm.prank(a); m.claim(0); assertEq(t.balanceOf(a) - a0, 300e22); assertEq(t.balanceOf(vault), 0);
    }

    function test_onlyResolver_onlyAfterTheEnd_onlyOnce() public {
        vm.roll(G + RB - 1); vm.prank(res); vm.expectRevert(CrownMarket.TooEarly.selector); m.post(0, NVDA, bytes32(0));
        vm.roll(G + RB); vm.prank(a); vm.expectRevert(CrownMarket.NotResolver.selector); m.post(0, NVDA, bytes32(0));
        vm.prank(res); m.post(0, NVDA, bytes32(0));
        vm.prank(res); vm.expectRevert(CrownMarket.AlreadyPosted.selector); m.post(0, AAPL, bytes32(0));
    }

    function test_challengeWindowCloses() public {
        vm.roll(G + RB); vm.prank(res); m.post(0, NVDA, bytes32(0));
        vm.roll(G + RB + 301); vm.prank(b); vm.expectRevert(CrownMarket.ChallengeOver.selector); m.challenge(0);
    }

    function test_stalePrice_refusesBetsAndChallenges() public {
        vm.warp(block.timestamp + 6 hours + 1);
        vm.prank(a); vm.expectRevert(CrownMarket.StalePrice.selector); m.bet(0, NVDA, 1e30);
    }

    function test_resolverReplacement_announced_delayed_renounceable() public {
        address k = address(0x77);
        vm.prank(a); vm.expectRevert(CrownMarket.NotDev.selector); m.announceResolver(k);
        vm.prank(dev); m.announceResolver(k);
        vm.expectRevert(CrownMarket.TooEarly.selector); m.acceptResolver();
        vm.warp(block.timestamp + 2 days); m.acceptResolver(); assertEq(m.resolver(), k);
        vm.prank(dev2); m.renounceResolverChanges();
        vm.prank(dev); vm.expectRevert(CrownMarket.Renounced.selector); m.announceResolver(address(0x78));
    }

    /// fuzz: whatever the stakes, the contract never pays out more than it took in, and every winner + the vault add up to the pot
    function testFuzz_conservation(uint96 x, uint96 y, uint96 z) public {
        uint256 min = m.minBet(); vm.assume(x >= min && y >= min && z >= min);
        _bet(a, NVDA, x); _bet(b, NVDA, y); _bet(c, AAPL, z);
        uint256 pot = uint256(x) + y + z;
        vm.roll(G + RB); vm.prank(res); m.post(0, NVDA, bytes32(0)); vm.roll(G + RB + 301);
        uint256 a0 = t.balanceOf(a); uint256 b0 = t.balanceOf(b);
        vm.prank(a); m.claim(0); vm.prank(b); m.claim(0);
        uint256 paid = (t.balanceOf(a) - a0) + (t.balanceOf(b) - b0) + t.balanceOf(vault);
        assertLe(paid, pot); assertLe(pot - paid, 2);
    }
}
