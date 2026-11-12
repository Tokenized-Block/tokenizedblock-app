// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VToken, VWeth, FV3, FPM, VVault} from "./TBlockBuybackVault.t.sol";

/// @dev The door fixes (reviews 2026-11-12, "money" findings 1-4 and "vault/door" F1, F4, F5, F7). This file does NOT import the
///      contract: it deploys it by artifact with an ABI-compatible config and calls it through an interface, so the SAME tests
///      compile and run against the source before and after the fix (red before, green after).
///   FIX-1 (money 1 / F1): DEST_DELAY 7 days (= the vault's RESCUE_DELAY); a second key (VETO) may cancel; the door can be
///         renounced (by the guardian or the veto), which freezes DEST for good.
///   FIX-2 (money 2 / F5): a proposal can be executed only in [eta, eta + 2 days], then it expires.
///   FIX-3 (money 3 / F7): the code proposed is the code executed (codehash pinned at propose), and every buy / sweep refuses a
///         DEST whose code is no longer the pinned code (a dest emptied or replaced after the switch is never paid).
///   FIX-4 (money 4 / F4): a dest must answer TBLOCK() == the TBLOCK bought.
struct DKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
struct DCfg {
    address poolManager; DKey v4Key; address v3Pool; address weth; address wtcoin; address tblock; address keeper;
    uint256 publicDelay; uint256 maxPerCall; uint256 minSpend; uint256 cooldown; uint32 twapWindow; int24 maxV3DevTicks;
    int24 maxV4ImpactTicks; uint24 maxHookPpm; uint16 tipBps; uint256 maxTip; address dest; address guardian; address veto;
}

interface IBB {
    function proposeDest(address) external returns (uint256);
    function cancelDest() external;
    function executeDest() external returns (address);
    function renounceDoor() external;
    function DEST() external view returns (address);
    function pendingDest() external view returns (address);
    function buyback(uint256) external returns (uint256, uint256);
    function sweepToDest() external returns (uint256);
}

/// @dev a vault stand-in that counts a given TBLOCK (TBlockVaultV2 answers TBLOCK())
contract DVault {
    address public immutable TBLOCK;
    constructor(address t) { TBLOCK = t; }
}

/// @dev same TBLOCK() answer, different code: anyone may pull what it holds
contract DSieve {
    address public immutable TBLOCK;
    constructor(address t) { TBLOCK = t; }
    function pull(address to) external { VToken(TBLOCK).transfer(to, VToken(TBLOCK).balanceOf(address(this))); }
}

/// @dev a legitimate new vault with DIFFERENT code from the current one (so the pin must follow the switch)
contract DVaultB {
    address public immutable TBLOCK;
    constructor(address t) { TBLOCK = t; }
    function version() external pure returns (uint256) { return 2; }
}

contract TBlockBuybackVaultDoorFixTest is Test {
    address constant GUARDIAN = address(0x6A4D);
    address constant VETO = address(0x7E70);
    address constant KEEPER = address(0xF1F1);
    address constant STRANGER = address(0xA11CE);
    VWeth weth; VToken wt; VToken tb; FV3 v3; FPM pm;
    address vault; IBB bb;

    function _cfg() internal view returns (DCfg memory c) {
        c.poolManager = address(pm);
        (address c0, address c1) = address(wt) < address(tb) ? (address(wt), address(tb)) : (address(tb), address(wt));
        c.v4Key = DKey(c0, c1, 3000, 60, address(0x3e6B46810b1fd5085086Fd1417E8adB02f34a044));
        c.v3Pool = address(v3);
        c.weth = address(weth); c.wtcoin = address(wt); c.tblock = address(tb);
        c.maxPerCall = 0.002 ether; c.minSpend = 0.0001 ether; c.cooldown = 1 hours; c.twapWindow = 1800;
        c.maxV3DevTicks = 100; c.maxV4ImpactTicks = 60; c.maxHookPpm = 12_000; c.tipBps = 50; c.maxTip = 0.00002 ether;
        c.dest = vault; c.keeper = KEEPER; c.publicDelay = 6 hours; c.guardian = GUARDIAN; c.veto = VETO;
    }

    /// @dev address(0) when the constructor reverts
    function _deploy(DCfg memory c) internal returns (address a) {
        bytes memory init = bytes.concat(vm.getCode("TBlockBuybackVault.sol:TBlockBuybackVault"), abi.encode(c));
        assembly { a := create(0, add(init, 32), mload(init)) }
    }

    function setUp() public {
        weth = new VWeth(); wt = new VToken(); tb = new VToken();
        v3 = new FV3(address(weth), address(wt));
        pm = new FPM(tb);
        vault = address(new DVault(address(tb)));
        address a = _deploy(_cfg());
        require(a != address(0), "deploy");
        bb = IBB(a);
        vm.deal(address(this), 10 ether);
        (bool ok,) = a.call{value: 1 ether}("");
        require(ok);
    }

    function _nv() internal returns (address) { return address(new DVault(address(tb))); }

    // ------------------------------------------------------------------ FIX-1: 7 days, a veto, a renounce

    function test_FIX1_delay_is_seven_days_not_72h() public {
        address nv = _nv();
        uint256 t0 = block.timestamp;
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        assertEq(eta, t0 + 7 days, "eta = now + 7 days");
        vm.warp(t0 + 72 hours);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.executeDest();
        vm.warp(t0 + 7 days - 1);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.executeDest();
        vm.warp(t0 + 7 days);
        vm.prank(STRANGER);
        bb.executeDest();
        assertEq(bb.DEST(), nv);
    }

    function test_FIX1_veto_can_cancel_and_nothing_else() public {
        address nv = _nv();
        vm.prank(GUARDIAN);
        bb.proposeDest(nv);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.cancelDest();
        vm.prank(VETO);
        bb.cancelDest();
        assertEq(bb.pendingDest(), address(0), "the veto cancelled the guardian's proposal");
        vm.warp(block.timestamp + 30 days);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.executeDest();
        assertEq(bb.DEST(), vault);
        // the veto cannot propose
        address nv2 = _nv();
        vm.prank(VETO);
        vm.expectRevert();
        bb.proposeDest(nv2);
    }

    function test_FIX1_guardian_renounce_freezes_dest_for_good() public {
        address nv = _nv();
        vm.prank(GUARDIAN);
        bb.proposeDest(nv);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.renounceDoor();
        vm.prank(GUARDIAN);
        bb.renounceDoor();
        assertEq(bb.pendingDest(), address(0), "renounce drops the pending proposal");
        vm.warp(block.timestamp + 8 days);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.executeDest();
        vm.prank(GUARDIAN);
        vm.expectRevert();
        bb.proposeDest(nv);
        assertEq(bb.DEST(), vault, "DEST frozen");
        vm.prank(VETO);
        vm.expectRevert();
        bb.renounceDoor(); // already closed
    }

    function test_FIX1_veto_may_renounce_too() public {
        vm.prank(VETO);
        bb.renounceDoor();
        address nv = _nv();
        vm.prank(GUARDIAN);
        vm.expectRevert();
        bb.proposeDest(nv);
        // buys still pay the frozen DEST
        vm.prank(KEEPER);
        (uint256 toDest,) = bb.buyback(0.002 ether);
        assertGt(toDest, 0);
        assertEq(tb.balanceOf(vault), toDest);
    }

    // ------------------------------------------------------------------ FIX-2: a proposal expires 2 days after eta

    function test_FIX2_proposal_expires_after_the_window() public {
        address nv = _nv();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.warp(eta + 2 days + 1);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.executeDest();
        assertEq(bb.DEST(), vault, "a stale proposal never executes");
        // the stale proposal does not block a fresh one (with a fresh full delay)
        address nv2 = _nv();
        vm.prank(GUARDIAN);
        uint256 eta2 = bb.proposeDest(nv2);
        assertEq(eta2, block.timestamp + 7 days);
        assertEq(bb.pendingDest(), nv2);
    }

    function test_FIX2_last_second_of_the_window_executes() public {
        address nv = _nv();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.warp(eta + 2 days);
        vm.prank(STRANGER);
        bb.executeDest();
        assertEq(bb.DEST(), nv);
    }

    // ------------------------------------------------------------------ FIX-3: the code proposed is the code paid

    function test_FIX3_code_swapped_after_propose_cannot_execute() public {
        address nv = _nv();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        // metamorphic stand-in: same address, other code (still answers TBLOCK() with the right token)
        vm.etch(nv, address(new DSieve(address(tb))).code);
        vm.warp(eta);
        vm.prank(STRANGER);
        vm.expectRevert();
        bb.executeDest();
        assertEq(bb.DEST(), vault);
    }

    function test_FIX3_buy_and_sweep_refuse_a_dest_whose_code_changed() public {
        vm.etch(vault, address(new DSieve(address(tb))).code);
        vm.prank(KEEPER);
        vm.expectRevert();
        bb.buyback(0.002 ether);
        tb.mint(address(bb), 3 ether);
        vm.expectRevert();
        bb.sweepToDest();
        vm.etch(vault, "");
        vm.prank(KEEPER);
        vm.expectRevert();
        bb.buyback(0.002 ether);
        assertEq(tb.balanceOf(vault), 0, "nothing paid to a dest that is not the pinned code");
        // the original code back: paid again
        vm.etch(vault, address(new DVault(address(tb))).code);
        vm.prank(KEEPER);
        (uint256 toDest,) = bb.buyback(0.002 ether);
        assertEq(tb.balanceOf(vault), toDest);
    }

    function test_FIX3_after_switch_the_new_dest_code_is_pinned() public {
        address nv = _nv();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.warp(eta);
        bb.executeDest();
        vm.etch(nv, "");
        vm.prank(KEEPER);
        vm.expectRevert();
        bb.buyback(0.002 ether);
    }

    function test_FIX3_switch_to_other_code_moves_the_pin() public {
        address nv = address(new DVaultB(address(tb)));
        assertTrue(nv.codehash != vault.codehash, "different code");
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.warp(eta);
        bb.executeDest();
        vm.prank(KEEPER);
        (uint256 toDest,) = bb.buyback(0.002 ether);
        assertGt(toDest, 0);
        assertEq(tb.balanceOf(nv), toDest, "the new vault (other code) is paid");
    }

    // ------------------------------------------------------------------ FIX-4: the dest counts the same TBLOCK

    function test_FIX4_dest_of_another_token_is_refused() public {
        VToken other = new VToken();
        address wrong = address(new DVault(address(other)));
        vm.prank(GUARDIAN);
        vm.expectRevert();
        bb.proposeDest(wrong);
        address mute = address(new VVault()); // no TBLOCK() at all
        vm.prank(GUARDIAN);
        vm.expectRevert();
        bb.proposeDest(mute);
        DCfg memory c = _cfg();
        c.dest = wrong;
        assertEq(_deploy(c), address(0), "constructor refuses a vault of another token");
        c.dest = mute;
        assertEq(_deploy(c), address(0), "constructor refuses a dest without TBLOCK()");
    }

    // ------------------------------------------------------------------ constructor: the veto key

    function test_FIX1_constructor_checks_the_veto() public {
        DCfg memory c = _cfg();
        c.veto = address(0);
        assertEq(_deploy(c), address(0), "veto must be set");
        c = _cfg(); c.veto = GUARDIAN;
        assertEq(_deploy(c), address(0), "veto != guardian");
        c = _cfg(); c.veto = KEEPER;
        assertEq(_deploy(c), address(0), "veto != keeper");
        c = _cfg(); vm.etch(VETO, address(new DVault(address(tb))).code); c.dest = VETO;
        assertEq(_deploy(c), address(0), "dest != veto");
        vm.etch(VETO, "");
        assertTrue(_deploy(_cfg()) != address(0), "control: the good config deploys");
    }

    function test_FIX1_dest_cannot_be_the_veto_through_the_door() public {
        vm.etch(VETO, address(new DVault(address(tb))).code);
        vm.prank(GUARDIAN);
        vm.expectRevert();
        bb.proposeDest(VETO);
    }
}
