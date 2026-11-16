// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/LifeEntry.sol";

contract PriceStub { uint256 public price; function set(uint256 p) external { price = p; } }
contract Tok {
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance; uint8 public mode; /* 0 normal, 1 short by 1 wei, 2 returns false */
    function setMode(uint8 m) external { mode = m; }
    function mint(address to, uint256 v) external { balanceOf[to] += v; }
    function approve(address s, uint256 v) external returns (bool) { allowance[msg.sender][s] = v; return true; }
    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        if (mode == 2) return false;
        uint256 a = allowance[from][msg.sender]; require(a >= v, 'allowance'); require(balanceOf[from] >= v, 'balance');
        if (a != type(uint256).max) allowance[from][msg.sender] = a - v;
        balanceOf[from] -= v; balanceOf[to] += mode == 1 ? v - 1 : v; return true;
    }
}

contract LifeEntryTest is Test {
    uint256 constant P0 = 4.36e12;
    Tok t; PriceStub ps; LifeEntry e;
    address vault = address(0xBEEF); address alice = address(0xA11CE); address blk = address(0xB10C);

    function setUp() public {
        t = new Tok(); ps = new PriceStub(); ps.set(P0); /* $0.00000436 per TBLOCK, the price shown on 16/11 */
        e = new LifeEntry(address(t), vault, address(ps), 2e18);
        t.mint(alice, 1e30);
    }

    function test_entryPrice_isTwoDollars_roundedUp() public view {
        uint256 due = e.entryPrice();
        assertEq(due, (2e18 * 1e18 + P0 - 1) / P0);
        assertGe(due * P0, 2e36); /* never under $2 */
        assertLt((due - 1) * P0, 2e36); /* and the least amount that reaches $2 */
    }

    function test_enter_paysTheVault_emits_holdsNothing() public {
        uint256 due = e.entryPrice();
        vm.startPrank(alice); t.approve(address(e), due);
        vm.expectEmit(true, true, false, true, address(e)); emit LifeEntry.Entered(alice, blk, due, P0);
        uint256 paid = e.enter(blk, due); vm.stopPrank();
        assertEq(paid, due); assertEq(t.balanceOf(vault), due); assertEq(t.balanceOf(address(e)), 0); assertEq(t.balanceOf(alice), 1e30 - due);
    }

    function test_enter_refusesAboveTheCallersCap() public {
        uint256 due = e.entryPrice();
        vm.startPrank(alice); t.approve(address(e), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(LifeEntry.AboveYourCap.selector, due, due - 1)); e.enter(blk, due - 1); vm.stopPrank();
        assertEq(t.balanceOf(vault), 0);
    }

    function test_enter_priceMovedAgainstThePayer_reverts() public {
        uint256 quoted = e.entryPrice(); ps.set(4e12); /* TBLOCK fell: an entry costs more TBLOCK now */
        vm.startPrank(alice); t.approve(address(e), type(uint256).max);
        vm.expectRevert(); e.enter(blk, quoted); vm.stopPrank();
    }

    function test_noPrice_reverts() public { ps.set(0); vm.expectRevert(LifeEntry.NoPrice.selector); e.entryPrice(); }
    function test_zeroBlock_reverts() public { vm.prank(alice); vm.expectRevert(LifeEntry.BadParams.selector); e.enter(address(0), type(uint256).max); }
    function test_noAllowance_reverts() public { vm.prank(alice); vm.expectRevert(); e.enter(blk, type(uint256).max); }

    function test_shortDelivery_reverts() public {
        t.setMode(1); vm.startPrank(alice); t.approve(address(e), type(uint256).max);
        vm.expectRevert(); e.enter(blk, type(uint256).max); vm.stopPrank(); assertEq(t.balanceOf(vault), 0);
    }
    function test_falseReturn_reverts() public {
        t.setMode(2); vm.startPrank(alice); t.approve(address(e), type(uint256).max); vm.expectRevert(); e.enter(blk, type(uint256).max); vm.stopPrank();
    }
    function test_constructor_refusesBadParams() public {
        vm.expectRevert(LifeEntry.BadParams.selector); new LifeEntry(address(0), vault, address(ps), 2e18);
        vm.expectRevert(LifeEntry.BadParams.selector); new LifeEntry(address(t), address(0), address(ps), 2e18);
        vm.expectRevert(LifeEntry.BadParams.selector); new LifeEntry(address(t), vault, address(0xdead1), 2e18); /* no code */
        vm.expectRevert(LifeEntry.BadParams.selector); new LifeEntry(address(t), vault, address(ps), 0);
    }
    /// fuzz: whatever the stored price, an entry is never under $2 and never takes more than the cap
    function testFuzz_neverUnderTwoDollars(uint96 p, uint256 cap) public {
        vm.assume(p > 1e6); ps.set(p);
        uint256 due = e.entryPrice(); assertGe(due * uint256(p), 2e36);
        vm.startPrank(alice); t.approve(address(e), type(uint256).max);
        if (due > cap || due > 1e30) { vm.expectRevert(); e.enter(blk, cap); }
        else { e.enter(blk, cap); assertEq(t.balanceOf(vault), due); }
        vm.stopPrank();
    }
}
