// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockLock} from "../src/TBlockLock.sol";

/// mode 1: fee on transfer INTO the lock (half arrives); mode 2: transferFrom returns false; mode 3: transfer (out) returns false
contract LockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint8 public mode; address public reenter; bytes public reenterData;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setMode(uint8 m) external { mode = m; }
    function setReenter(address t, bytes calldata d) external { reenter = t; reenterData = d; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        if (mode == 2) return false;
        require(allowance[f][msg.sender] >= a && balanceOf[f] >= a, "funds");
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += (mode == 1 ? a / 2 : a);
        return true;
    }
    function transfer(address to, uint256 a) external returns (bool) {
        if (mode == 3) return false;
        if (reenter != address(0)) { address t = reenter; reenter = address(0); (bool ok,) = t.call(reenterData); require(ok, "reentered call failed"); }
        require(balanceOf[msg.sender] >= a, "funds"); balanceOf[msg.sender] -= a; balanceOf[to] += a; return true;
    }
}

contract TBlockLockTest is Test {
    LockToken t; TBlockLock L;
    address A = address(0xA11CE); address B = address(0xB0B);
    uint256 constant E = 1e18;

    function setUp() public {
        vm.warp(1_800_000_000);
        t = new LockToken(); L = new TBlockLock(address(t));
        t.mint(A, 10_000_000 * E); t.mint(B, 10_000_000 * E);
        vm.prank(A); t.approve(address(L), type(uint256).max);
        vm.prank(B); t.approve(address(L), type(uint256).max);
    }

    function test_lock_request_wait_withdraw() public {
        uint256 at = block.timestamp + 30 days;
        vm.prank(A); L.lock(3_000_000 * E, at);
        assertEq(L.lockedOf(A), 3_000_000 * E); assertEq(L.unlockAtOf(A), at); assertEq(L.totalLocked(), 3_000_000 * E);
        assertEq(L.activeLockedOf(A), 3_000_000 * E);
        vm.prank(A); vm.expectRevert(TBlockLock.NotRequested.selector); L.withdraw();
        vm.warp(at);
        vm.prank(A); vm.expectRevert(TBlockLock.NotRequested.selector); L.withdraw();
        vm.prank(A); L.requestWithdraw();
        assertEq(L.withdrawableAtOf(A), at + 7 days, "after the date: request + 7 days");
        vm.warp(at + 7 days - 1);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.TooEarly.selector, at + 7 days)); L.withdraw();
        vm.warp(at + 7 days);
        vm.prank(A); L.withdraw();
        assertEq(L.lockedOf(A), 0); assertEq(L.totalLocked(), 0); assertEq(t.balanceOf(A), 10_000_000 * E);
        vm.prank(A); vm.expectRevert(TBlockLock.NothingLocked.selector); L.withdraw();
    }

    function test_request_before_the_date_ends_perks_now_but_pays_at_the_later_date() public {
        uint256 at = block.timestamp + 30 days;
        vm.prank(A); L.lock(1_000 * E, at);
        vm.warp(block.timestamp + 1 days);
        vm.prank(A); L.requestWithdraw();
        assertEq(L.activeLockedOf(A), 0, "perks end at the request");
        assertEq(L.withdrawableAtOf(A), at, "the lock's own date is later than request + 7 days");
        vm.warp(at - 1);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.TooEarly.selector, at)); L.withdraw();
        vm.warp(at); vm.prank(A); L.withdraw();
        assertEq(t.balanceOf(A), 10_000_000 * E);
    }

    function test_request_once_cancel_relock_clear_it() public {
        uint256 at = block.timestamp + 30 days;
        vm.prank(A); L.lock(1_000 * E, at);
        vm.prank(A); L.requestWithdraw();
        uint256 w = L.withdrawableAtOf(A);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.AlreadyRequested.selector, w)); L.requestWithdraw();
        vm.prank(A); L.cancelWithdraw();
        assertEq(L.requestedAtOf(A), 0); assertEq(L.activeLockedOf(A), 1_000 * E, "perks back");
        vm.prank(A); vm.expectRevert(TBlockLock.NotRequested.selector); L.cancelWithdraw();
        vm.prank(A); L.requestWithdraw();
        vm.prank(A); L.lock(1 * E, at);
        assertEq(L.requestedAtOf(A), 0, "locking more re-commits");
        vm.prank(A); L.requestWithdraw();
        vm.prank(A); L.extend(at + 1 days);
        assertEq(L.requestedAtOf(A), 0, "extending re-commits");
        vm.prank(B); vm.expectRevert(TBlockLock.NothingLocked.selector); L.requestWithdraw();
    }

    function test_nobody_else_can_take_a_lock() public {
        vm.prank(A); L.lock(1_000 * E, block.timestamp + 7 days);
        vm.prank(A); L.requestWithdraw();
        vm.warp(block.timestamp + 8 days);
        vm.prank(B); vm.expectRevert(TBlockLock.NothingLocked.selector); L.withdraw();
        assertEq(L.lockedOf(A), 1_000 * E);
    }

    function test_date_bounds() public {
        uint256 e = block.timestamp + 7 days;
        uint256 l = block.timestamp + 4 * 365 days;
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, e, l)); L.lock(1, e - 1);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, e, l)); L.lock(1, l + 1);
        vm.prank(A); L.lock(1, e);
        vm.prank(B); L.lock(1, l);
        vm.prank(A); vm.expectRevert(TBlockLock.BadAmount.selector); L.lock(0, e);
    }

    function test_adding_never_shortens() public {
        uint256 far = block.timestamp + 365 days;
        uint256 near = block.timestamp + 30 days;
        vm.prank(A); L.lock(100 * E, far);
        vm.prank(A); L.lock(50 * E, near);
        assertEq(L.lockedOf(A), 150 * E); assertEq(L.unlockAtOf(A), far, "the later date is kept");
        vm.prank(A); L.lock(1 * E, far + 1 days);
        assertEq(L.unlockAtOf(A), far + 1 days, "a later date moves it");
    }

    function test_extend_only_later() public {
        uint256 at = block.timestamp + 30 days;
        vm.prank(B); vm.expectRevert(TBlockLock.NothingLocked.selector); L.extend(at);
        vm.prank(A); L.lock(1 * E, at);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, at + 1, block.timestamp + 4 * 365 days)); L.extend(at);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, at + 1, block.timestamp + 4 * 365 days)); L.extend(at - 1);
        vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, at + 1, block.timestamp + 4 * 365 days)); L.extend(block.timestamp + 4 * 365 days + 1);
        vm.prank(A); L.extend(at + 1);
        assertEq(L.unlockAtOf(A), at + 1);
    }

    function test_token_tricks_refused() public {
        uint256 at = block.timestamp + 7 days;
        t.setMode(1); vm.prank(A); vm.expectRevert(abi.encodeWithSelector(TBlockLock.ShortArrival.selector, 100 * E, 50 * E)); L.lock(100 * E, at);
        t.setMode(2); vm.prank(A); vm.expectRevert(TBlockLock.TransferFailed.selector); L.lock(100 * E, at);
        t.setMode(0); vm.prank(A); L.lock(100 * E, at);
        vm.prank(A); L.requestWithdraw();
        vm.warp(at); t.setMode(3);
        vm.prank(A); vm.expectRevert(TBlockLock.TransferFailed.selector); L.withdraw();
        assertEq(L.lockedOf(A), 100 * E, "a failed withdraw keeps the lock");
    }

    function test_constructor_needs_a_contract() public {
        vm.expectRevert(TBlockLock.BadToken.selector); new TBlockLock(address(0));
        vm.expectRevert(TBlockLock.BadToken.selector); new TBlockLock(address(0xDEAD));
    }

    function testFuzz_solvent(uint96 a, uint96 b, uint32 da, uint32 db, uint32 ra) public {
        a = uint96(bound(a, 1, 10_000_000 * E)); b = uint96(bound(b, 1, 10_000_000 * E));
        uint256 ta = block.timestamp + bound(da, 7 days, 4 * 365 days);
        uint256 tb = block.timestamp + bound(db, 7 days, 4 * 365 days);
        vm.prank(A); L.lock(a, ta); vm.prank(B); L.lock(b, tb);
        assertEq(t.balanceOf(address(L)), L.totalLocked());
        vm.warp(block.timestamp + bound(ra, 0, 5 * 365 days));
        vm.prank(B); L.requestWithdraw(); vm.prank(A); L.requestWithdraw();
        uint256 wa = L.withdrawableAtOf(A); uint256 wb = L.withdrawableAtOf(B);
        assertGe(wa, ta); assertGe(wa, block.timestamp + 7 days);
        vm.warp(wa > wb ? wa : wb);
        vm.prank(B); L.withdraw(); vm.prank(A); L.withdraw();
        assertEq(t.balanceOf(address(L)), 0); assertEq(t.balanceOf(A), 10_000_000 * E); assertEq(t.balanceOf(B), 10_000_000 * E);
    }
}
