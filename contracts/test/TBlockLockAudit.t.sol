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
  function out(TBlockLock L) external { L.requestWithdraw(); }
  function exitNow(TBlockLock L) external { L.requestWithdraw(); L.withdraw(); }
  function claimThenExit(TBlockLock L, ActiveGate g) external { g.claim(); L.requestWithdraw(); }
  function pass(TBlockLock L, ActiveGate g) external { g.claim(); L.withdraw(); }
  function extend(TBlockLock L, uint256 at) external { L.extend(at); }
}
/// the holder's OWN contract re-enters withdraw while its first withdraw is paying it (the real reentrancy path, review weak-test 1)
contract Reentrant {
  TBlockLock public L; LockToken public t; bytes4 public seen;
  constructor(TBlockLock l, LockToken tk) { L = l; t = tk; }
  function lock() external { t.approve(address(L), type(uint256).max); L.lock(100e18, block.timestamp + 7 days); L.requestWithdraw(); }
  function go() external { L.withdraw(); }
  function again() external { try L.withdraw() { seen = bytes4(0); } catch (bytes memory e) { seen = bytes4(e); } }
}

/* review 2: an invariant over random lock / extend / request / cancel / warp sequences — the withdraw time is never sooner than the
 *   last moment the perks were active + 7 days, and the contract always holds exactly totalLocked */
contract LockHandler is Test {
  TBlockLock public L; LockToken public t; uint256 public lastActive; bool public wasActive; uint256 public violations; uint256 public paid;
  constructor(TBlockLock l, LockToken tk) { L = l; t = tk; t.mint(address(this), 1e30); t.approve(address(L), type(uint256).max); }
  function _note() internal { if (L.activeLockedOf(address(this)) > 0) { lastActive = block.timestamp; wasActive = true; } }
  function lockSome(uint96 a, uint32 d) external { _note(); a = uint96(bound(a, 1, 1e24)); try L.lock(a, block.timestamp + bound(d, 7 days, 400 days)) {} catch {} _note(); }
  function extendIt(uint32 d) external { _note(); try L.extend(block.timestamp + bound(d, 7 days, 400 days)) {} catch {} _note(); }
  function request() external { _note(); try L.requestWithdraw() {} catch {} _note(); }
  function cancel() external { _note(); try L.cancelWithdraw() {} catch {} _note(); }
  function wait(uint32 s) external { _note(); vm.warp(block.timestamp + bound(s, 1 hours, 9 days)); _note(); }
  function out() external {
    _note();
    uint256 before = L.lockedOf(address(this));
    try L.withdraw() { paid++; if ((wasActive && block.timestamp < lastActive + 7 days) || before == 0) violations++; wasActive = false; } catch {}
  }
}
contract TBlockLockInvariantTest is Test {
  LockToken t; TBlockLock L; LockHandler h;
  function setUp() public { vm.warp(1_800_000_000); t = new LockToken(); L = new TBlockLock(address(t)); h = new LockHandler(L, t); targetContract(address(h)); }
  function invariant_solvent() public view { assertEq(t.balanceOf(address(L)), L.totalLocked()); }
  function invariant_lock_bookkeeping() public view { assertEq(L.lockedOf(address(h)), L.totalLocked()); }
  function invariant_never_paid_within_7_days_of_perks() public view { assertEq(h.violations(), 0); }
  function afterInvariant() public view { console.log("withdrawals paid", h.paid()); }
  /* review 2: random SEQUENCES (24 ops) of lock / extend / request / cancel / wait / withdraw, driven explicitly (the invariant runner never
   *   reached a withdraw: 0 paid in 3 runs, measured). Property: never paid sooner than 7 days after the last moment the perks were active. */
  function testFuzz_sequences_never_pay_early(uint8[24] calldata ops, uint32[24] calldata args) public {
    for (uint256 i = 0; i < 24; i++) {
      uint8 o = ops[i] % 6;
      if (o == 0) h.lockSome(uint96(args[i]) + 1, args[i]);
      else if (o == 1) h.extendIt(args[i]);
      else if (o == 2) h.request();
      else if (o == 3) h.cancel();
      else if (o == 4) h.wait(args[i]);
      else h.out();
    }
    assertEq(h.violations(), 0, "paid within 7 days of the last active moment");
    assertEq(t.balanceOf(address(L)), L.totalLocked());
  }
  function test_sequence_that_must_not_pay_yet() public { h.lockSome(1e20, 0); h.wait(6 days); h.request(); h.wait(1 days); h.out(); assertEq(h.paid(), 0, "paid 1 day after a request made while active"); assertEq(h.violations(), 0); }
  function test_sequence_that_must_pay() public { h.lockSome(1e20, 0); h.wait(6 days); h.request(); h.wait(7 days); h.out(); assertEq(h.paid(), 1); assertEq(h.violations(), 0); }
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
  function test_exit_request_ends_perks_in_the_same_block() public {
    m.run(L, t);
    m.claimThenExit(L, g);
    assertTrue(g.claimed(address(m)), "claimed while committed");
    assertEq(L.activeLockedOf(address(m)), 0, "on its way out: no perk any more");
    vm.expectRevert(bytes("gate")); m.claimThenExit(L, g);
  }
  function test_no_same_tx_exit_ever() public {
    m.run(L, t); vm.warp(block.timestamp + 30 days);
    /* review 2: request + withdraw in ONE transaction, no claim in front: TooEarly(now + 7 days) */
    vm.expectRevert(abi.encodeWithSelector(TBlockLock.TooEarly.selector, block.timestamp + 7 days)); m.exitNow(L);
    m.out(L);
    uint256 at = L.withdrawableAtOf(address(m));
    assertEq(at, block.timestamp + 7 days);
    vm.warp(at - 1);
    vm.prank(address(m)); vm.expectRevert(abi.encodeWithSelector(TBlockLock.TooEarly.selector, at)); L.withdraw();
    vm.warp(at);
    vm.prank(address(m)); L.withdraw();
    assertEq(t.balanceOf(address(m)), 1000e18);
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
    vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, block.timestamp + 7 days, block.timestamp + 4 * 365 days)); m.extend(L, old + 1);
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
    vm.expectRevert(abi.encodeWithSelector(TBlockLock.BadDate.selector, block.timestamp + 7 days, block.timestamp + 4 * 365 days)); L.lock(5e18, block.timestamp + 1 days);
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
