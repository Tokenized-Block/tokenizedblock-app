// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import {TBlockLock} from "../src/TBlockLock.sol";
import {LockToken} from "./TBlockLock.t.sol";

/// Regression tests from the independent review (2026-11-10). Each case PROVED a weakness on the first version; after the fix each must
/// hold the other way. The gate here reads activeLockedOf (SEC-001), as every consumer must.
contract ActiveGate { TBlockLock L; constructor(TBlockLock l){L=l;} mapping(address=>bool) public claimed;
  function claim() external { require(L.activeLockedOf(msg.sender) >= 1000e18, "gate"); claimed[msg.sender]=true; } }
contract Gamer {
  function run(TBlockLock L, LockToken t) external { t.approve(address(L), type(uint256).max); L.lock(1000e18, block.timestamp + 7 days); }
  function pass(TBlockLock L, ActiveGate g) external { g.claim(); L.withdraw(); }
  function extend(TBlockLock L, uint256 at) external { L.extend(at); }
}
/// the holder's OWN contract re-enters withdraw while its first withdraw is paying it (the real reentrancy path, review weak-test 1)
contract Reentrant {
  TBlockLock public L; LockToken public t; bool armed; bytes4 public seen;
  constructor(TBlockLock l, LockToken tk) { L = l; t = tk; }
  function lock() external { t.approve(address(L), type(uint256).max); L.lock(100e18, block.timestamp + 7 days); }
  function go() external { armed = true; L.withdraw(); }
  /* the token calls back the receiver through setReenter: re-enter withdraw from the holder itself */
  function again() external { try L.withdraw() { seen = bytes4(0); } catch (bytes memory e) { seen = bytes4(e); } }
}

contract TBlockLockAuditTest is Test {
  LockToken t; TBlockLock L; ActiveGate g; Gamer m;
  function setUp() public { vm.warp(1_800_000_000); t = new LockToken(); L = new TBlockLock(address(t)); g = new ActiveGate(L); m = new Gamer(); t.mint(address(m), 1000e18); }

  function test_SEC001_expired_lock_cannot_pass_an_active_gate() public {
    m.run(L, t);
    assertEq(L.activeLockedOf(address(m)), 1000e18, "active while locked");
    vm.warp(block.timestamp + 30 days);
    assertEq(L.activeLockedOf(address(m)), 0, "0 once the date passed");
    assertEq(L.lockedOf(address(m)), 1000e18, "lockedOf still says the stored amount (that is why gates read activeLockedOf)");
    vm.expectRevert(bytes("gate")); m.pass(L, g);
  }
  function test_SEC001_active_ends_exactly_at_the_date() public {
    m.run(L, t); uint256 at = L.unlockAtOf(address(m));
    vm.warp(at - 1); assertEq(L.activeLockedOf(address(m)), 1000e18);
    vm.warp(at); assertEq(L.activeLockedOf(address(m)), 0);
  }
  function test_SEC002_extend_needs_seven_days_from_now() public {
    m.run(L, t); vm.warp(block.timestamp + 30 days);
    uint256 e = block.timestamp + 7 days;
    vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, e, block.timestamp + 4 * 365 days));
    m.extend(L, block.timestamp + 1);
    m.extend(L, e);
    assertEq(L.unlockAtOf(address(m)), e);
    assertEq(L.activeLockedOf(address(m)), 1000e18, "re-committed for 7 days");
  }
  function test_SEC002_extend_never_to_a_past_date() public {
    m.run(L, t); uint256 old = L.unlockAtOf(address(m)); vm.warp(old + 30 days);
    vm.expectRevert(); m.extend(L, old + 1);
  }
  function test_topup_onto_a_long_lock_with_a_short_date_is_accepted() public {
    t.mint(address(this), 10e18); t.approve(address(L), type(uint256).max);
    uint256 far = block.timestamp + 90 days;
    L.lock(5e18, far);
    L.lock(5e18, block.timestamp + 1 days);
    assertEq(L.lockedOf(address(this)), 10e18); assertEq(L.unlockAtOf(address(this)), far);
  }
  function test_topup_onto_an_expired_lock_needs_seven_days() public {
    t.mint(address(this), 10e18); t.approve(address(L), type(uint256).max);
    L.lock(5e18, block.timestamp + 7 days);
    vm.warp(block.timestamp + 8 days);
    vm.expectRevert(); L.lock(5e18, block.timestamp + 1 days);
    L.lock(5e18, block.timestamp + 7 days);
    assertEq(L.activeLockedOf(address(this)), 10e18, "the whole amount is locked again for 7 days");
  }
  function test_direct_transfer_is_stuck_and_said() public {
    t.mint(address(this), 5e18); t.transfer(address(L), 5e18);
    assertEq(t.balanceOf(address(L)) - L.totalLocked(), 5e18, "no rescue by design: the app must warn never to send TBLOCK to the lock directly");
  }
  function test_reentrancy_from_the_holder_itself_is_refused() public {
    Reentrant r = new Reentrant(L, t); t.mint(address(r), 100e18);
    r.lock(); vm.warp(block.timestamp + 7 days);
    t.setReenter(address(r), abi.encodeWithSelector(Reentrant.again.selector));
    r.go();
    assertEq(r.seen(), TBlockLock.Reentrancy.selector, "the inner withdraw hit the guard, not NothingLocked");
    assertEq(t.balanceOf(address(r)), 100e18, "paid once, exactly");
    assertEq(L.totalLocked(), 0);
  }
}
