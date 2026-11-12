// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockBuybackVault as BB} from "../src/buyback/TBlockBuybackVault.sol";

/// @dev Unit tests (no fork) of TBlockBuybackVault. Part 1 ports every TBlockBuybackV2 unit test (TBlockBuybackV2.t.sol and
///      TBlockBuybackV2.dest.t.sol) on the same mocks. Part 2 tests the exit door. Part 3 runs the WHOLE buyback path on working
///      mocks (v3 pool, v4 PoolManager, WETH) so "the next buyback pays the new dest" is measured, and fuzzes the guardian.
contract VToken {
    mapping(address => uint256) public balanceOf;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function transfer(address to, uint256 a) external returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract VWeth is VToken {
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    function withdraw(uint256 a) external {
        balanceOf[msg.sender] -= a;
        (bool ok,) = msg.sender.call{value: a}("");
        require(ok, "weth: eth send");
    }
}

contract VMockV3 {
    address public token0;
    address public token1;
    constructor(address a, address b) { token0 = a; token1 = b; }
}

contract VMockPM {
    bytes32 public value;
    constructor(bytes32 v) { value = v; }
    function extsload(bytes32) external view returns (bytes32) { return value; }
}

contract VSender2300 {
    constructor() payable {}
    function send2300(address payable to, uint256 v) external returns (bool) { return to.send(v); }
}

/// @dev a stand-in vault: a contract that keeps what it receives (TBlockVaultV2 counts plain transfers the same way)
contract VVault { }

/// @dev a stand-in vault that counts a given TBLOCK (TBlockVaultV2 answers TBLOCK(); the door requires it)
contract VVaultOf {
    address public immutable TBLOCK;
    constructor(address t) { TBLOCK = t; }
}

interface IV3Cb { function uniswapV3SwapCallback(int256, int256, bytes calldata) external; }
interface IUnlockCb { function unlockCallback(bytes calldata) external returns (bytes memory); }

/// @dev working v3 pool: WETH (token0) -> wtCOIN at RATE wtCOIN per WETH, flat tick, TWAP = tick.
contract FV3 {
    address public token0; address public token1; int24 public tickNow; uint256 public constant RATE = 1000;
    constructor(address weth, address wt) { token0 = weth; token1 = wt; }
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) { return (uint160(2 ** 96), tickNow, 0, 0, 0, 0, true); }
    function observe(uint32[] calldata ago) external view returns (int56[] memory cum, uint160[] memory l) {
        cum = new int56[](2); l = new uint160[](2);
        cum[1] = int56(tickNow) * int56(uint56(ago[0]));
    }
    function swap(address to, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data) external returns (int256, int256) {
        require(zeroForOne && amountSpecified > 0, "fv3: dir");
        uint256 inA = uint256(amountSpecified);
        uint256 out = inA * RATE;
        uint256 before = VToken(token0).balanceOf(address(this));
        IV3Cb(msg.sender).uniswapV3SwapCallback(int256(inA), -int256(out), data);
        require(VToken(token0).balanceOf(address(this)) >= before + inA, "fv3: unpaid");
        VToken(token1).mint(to, out);
        return (int256(inA), -int256(out));
    }
}

/// @dev working v4 PoolManager for ONE pool at price 1 (sqrtP = 2^96, tick 0): out = in * outPpm / 1e6.
contract FPM {
    VToken public tb; uint256 public outPpm = 990_000;
    constructor(VToken t) { tb = t; }
    function extsload(bytes32) external pure returns (bytes32) { return bytes32(uint256(2 ** 96)); }
    function unlock(bytes calldata data) external returns (bytes memory) { return IUnlockCb(msg.sender).unlockCallback(data); }
    function swap(BB.PoolKey memory, BB.SwapParams memory p, bytes calldata) external view returns (int256) {
        uint256 inA = uint256(-p.amountSpecified);
        uint256 out = inA * outPpm / 1e6;
        (int128 d0, int128 d1) = p.zeroForOne ? (-int128(int256(inA)), int128(int256(out))) : (int128(int256(out)), -int128(int256(inA)));
        return int256((uint256(int256(d0)) << 128) | uint256(uint128(d1)));
    }
    function sync(address) external {}
    function settle() external payable returns (uint256) { return 0; }
    function take(address cur, address to, uint256 a) external { require(cur == address(tb), "fpm: cur"); tb.mint(to, a); }
}

// =====================================================================================================================
// Part 1: the V2 unit tests, ported
// =====================================================================================================================
contract TBlockBuybackVaultUnitTest is Test {
    address constant DEST = address(uint160(0x0000c0ffee000000000000000000000000000000c0)); // the vault stand-in
    address constant GUARDIAN = address(0x6A4D);
    address constant VETO = address(0x7E70);
    address constant KEEPER = address(0xF1F1);
    VToken weth; VToken wt; VToken tb;
    VMockV3 v3; VMockPM pm;
    BB bb;

    function _cfg() internal view returns (BB.Config memory c) {
        c.poolManager = address(pm);
        (address c0, address c1) = address(wt) < address(tb) ? (address(wt), address(tb)) : (address(tb), address(wt));
        c.v4Key = BB.PoolKey(c0, c1, 3000, 60, address(0x3e6B46810b1fd5085086Fd1417E8adB02f34a044));
        c.v3Pool = address(v3);
        c.weth = address(weth); c.wtcoin = address(wt); c.tblock = address(tb);
        c.maxPerCall = 0.002 ether; c.minSpend = 0.0001 ether; c.cooldown = 1 hours; c.twapWindow = 1800;
        c.maxV3DevTicks = 100; c.maxV4ImpactTicks = 60; c.maxHookPpm = 12_000; c.tipBps = 50; c.maxTip = 0.00002 ether; c.dest = DEST;
        c.keeper = KEEPER; c.publicDelay = 6 hours; c.guardian = GUARDIAN; c.veto = VETO;
    }

    /// @dev runtime code of a vault stand-in that counts THIS test's TBLOCK (etched where a dest "with code" is needed)
    function _vc() internal returns (bytes memory) { return address(new VVaultOf(address(tb))).code; }

    function setUp() public virtual {
        weth = new VToken(); wt = new VToken(); tb = new VToken();
        v3 = new VMockV3(address(weth), address(wt));
        pm = new VMockPM(bytes32(uint256(1) << 100)); // "initialized" pool
        vm.etch(DEST, _vc()); // DEST must be a contract (the vault)
        bb = new BB(_cfg());
    }

    function test_constructor_wiring() public view {
        assertEq(bb.POOL_MANAGER(), address(pm));
        assertEq(bb.MAX_PER_CALL(), 0.002 ether);
        assertEq(bb.COOLDOWN(), 1 hours);
        assertEq(bb.V3_ZERO_FOR_ONE(), address(weth) == v3.token0());
        assertEq(bb.V4_ZERO_FOR_ONE(), address(wt) < address(tb));
        (uint256 k, uint256 p) = bb.readyAt();
        assertEq(k, block.timestamp, "fundedAt starts at deployment");
        assertEq(p, type(uint256).max, "public path closed until armed");
        assertFalse(bb.armed());
        assertEq(bb.V4_FLOOR_PPM(), 1e6 - 3000 - 12_000 - 6000);
        assertEq(bb.DEST(), DEST);
        assertEq(bb.GUARDIAN(), GUARDIAN);
        assertEq(bb.KEEPER(), KEEPER);
        assertEq(bb.DEST_DELAY(), 7 days);
        assertEq(bb.DEST_WINDOW(), 2 days);
        assertEq(bb.VETO(), VETO);
        assertEq(bb.destCodehash(), DEST.codehash, "the vault's code is pinned at deploy");
        assertFalse(bb.doorRenounced());
        assertEq(bb.pendingDest(), address(0));
        assertEq(bb.pendingDestEta(), 0);
        assertEq(bb.pendingDestCodehash(), bytes32(0));
    }

    function test_constructor_rejects() public {
        BB.Config memory c;
        c = _cfg(); c.poolManager = address(0);
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.minSpend = c.maxPerCall + 1;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.maxPerCall = 0;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.cooldown = 0;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.twapWindow = 59;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.tipBps = 101;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.maxTip = 0;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.maxV4ImpactTicks = 0;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.maxV3DevTicks = -1;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.v3Pool = address(new VMockV3(address(weth), address(tb)));
        vm.expectRevert(BB.BadPool.selector); new BB(c);
        c = _cfg(); c.v4Key.currency0 = address(weth);
        vm.expectRevert(BB.BadPool.selector); new BB(c);
        c = _cfg(); c.poolManager = address(new VMockPM(bytes32(0)));
        vm.expectRevert(BB.BadPool.selector); new BB(c);
        c = _cfg(); c.publicDelay = 0; // keeper without delay
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.maxHookPpm = 1e6;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.v4Key.fee = 0x800000;
        vm.expectRevert(BB.BadPool.selector); new BB(c);
        c = _cfg(); c.keeper = address(0); c.publicDelay = 0; // public only
        assertEq(new BB(c).PUBLIC_DELAY(), 0);
        c = _cfg(); c.cooldown = 7 days + 1;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.cooldown = 7 days; new BB(c);
        c = _cfg(); c.publicDelay = 7 days + 1;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.publicDelay = 7 days; new BB(c);
        c = _cfg(); c.twapWindow = 1 hours + 1;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.twapWindow = 1 hours; new BB(c);
        c = _cfg(); c.twapWindow = 60; new BB(c);
        c = _cfg(); c.maxHookPpm = uint24(1e6 - 3000 - 6000 - 1000);
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.maxHookPpm = uint24(1e6 - 3000 - 6000 - 1001); new BB(c);
        c = _cfg(); c.tipBps = 0; c.maxTip = 0;
        new BB(c);
        // new: the guardian must be set and must not be the keeper
        c = _cfg(); c.guardian = address(0);
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.guardian = c.keeper;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        // fix: the veto must be set, and be neither the guardian nor the keeper
        c = _cfg(); c.veto = address(0);
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.veto = c.guardian;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.veto = c.keeper;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
    }

    function test_receive_fundedAt_and_badAmount() public {
        vm.prank(KEEPER);
        vm.expectRevert(BB.BadAmount.selector);
        bb.buyback(0.0001 ether);
        uint256 deployedAt = bb.fundedAt();
        assertEq(deployedAt, block.timestamp);
        vm.expectRevert(BB.NotArmed.selector);
        bb.buyback(0.0001 ether);
        vm.warp(block.timestamp + 1 days);
        (bool ok,) = payable(address(bb)).call{value: 0.00005 ether}("");
        assertTrue(ok);
        assertFalse(bb.armed());
        assertEq(bb.fundedAt(), deployedAt);
        VSender2300 s2300 = new VSender2300{value: 1 ether}();
        assertFalse(s2300.send2300(payable(address(bb)), 0.0001 ether), "2300-gas send that arms fails");
        (ok,) = payable(address(bb)).call{value: 1 ether}("");
        assertTrue(ok);
        assertTrue(bb.armed());
        assertEq(bb.fundedAt(), block.timestamp);
        vm.warp(block.timestamp + 1 hours);
        assertTrue(s2300.send2300(payable(address(bb)), 1 wei), "armed: 2300-gas transfer works, no write");
        assertEq(bb.fundedAt(), block.timestamp - 1 hours, "no re-arm while armed");
        vm.expectRevert(abi.encodeWithSelector(BB.TooEarly.selector, block.timestamp - 1 hours + 6 hours));
        bb.buyback(0.0001 ether);
    }

    function test_arm_unit() public {
        uint256 t0 = block.timestamp;
        assertFalse(bb.arm(), "empty: no arm");
        vm.deal(address(bb), 0.0001 ether - 1);
        assertFalse(bb.arm(), "below MIN_SPEND: no arm");
        assertEq(bb.fundedAt(), t0);
        vm.warp(t0 + 1 days);
        vm.deal(address(bb), 0.0001 ether);
        assertFalse(bb.armed());
        assertTrue(bb.arm());
        assertEq(bb.fundedAt(), t0 + 1 days);
        assertEq(address(bb).balance, 0.0001 ether, "arm() moves no ETH");
        vm.warp(t0 + 2 days);
        assertTrue(bb.arm());
        assertEq(bb.fundedAt(), t0 + 1 days, "already armed: no-op");
        (, uint256 p) = bb.readyAt();
        assertEq(p, t0 + 1 days + 6 hours);
    }

    function test_v4Floor_protocolFee() public view {
        uint160 one = uint160(2 ** 96);
        uint256 f = bb.V4_FLOOR_PPM();
        assertEq(bb.v4Floor(1e18, one, 0), 1e18 * f / 1e6);
        assertEq(bb.v4Floor(1e18, one, 1000), 1e18 * (f - 1000) / 1e6);
        assertEq(bb.v4Floor(1e18, one, 0) - bb.v4Floor(1e18, one, 1000), 1e18 * 1000 / 1e6);
    }

    function test_v4Floor_protocolFee_aboveMaxReverts() public {
        vm.expectRevert(BB.BadPool.selector);
        bb.v4Floor(1e18, uint160(2 ** 96), 1001);
    }

    function test_mulDiv() public view {
        assertEq(bb.mulDiv(6, 7, 3), 14);
        assertEq(bb.mulDiv(2 ** 200, 2 ** 100, 2 ** 96), 2 ** 204, "512-bit intermediate");
        assertEq(bb.mulDiv(type(uint256).max, type(uint256).max, type(uint256).max), type(uint256).max);
        assertEq(bb.mulDiv(type(uint256).max - 1, type(uint256).max - 2, type(uint256).max), type(uint256).max - 3);
    }

    function test_mulDiv_fuzz(uint256 a, uint256 b, uint256 d) public view {
        d = bound(d, 1, type(uint256).max);
        a = bound(a, 0, type(uint128).max);
        b = bound(b, 0, type(uint128).max);
        assertEq(bb.mulDiv(a, b, d), a * b / d);
    }

    function test_mulDiv_reverts() public {
        vm.expectRevert(BB.BadParams.selector);
        bb.mulDiv(1, 1, 0);
        vm.expectRevert(BB.BadParams.selector);
        bb.mulDiv(2 ** 255, 4, 1);
    }

    function test_callbacks_guarded() public {
        vm.expectRevert(BB.NotPool.selector);
        bb.uniswapV3SwapCallback(1, 0, "");
        vm.prank(address(v3));
        vm.expectRevert(BB.NotPool.selector);
        bb.uniswapV3SwapCallback(1, 0, "");
        vm.expectRevert(BB.NotPoolManager.selector);
        bb.unlockCallback(abi.encode(uint256(1)));
        vm.prank(address(pm));
        vm.expectRevert(BB.NotPoolManager.selector);
        bb.unlockCallback(abi.encode(uint256(1)));
    }

    function test_sweep_onlyTblock_onlyToDest() public {
        tb.mint(address(bb), 7 ether);
        wt.mint(address(bb), 3 ether);
        vm.deal(address(bb), 1 ether);
        vm.prank(address(0xBAD));
        assertEq(bb.sweepToDest(), 7 ether);
        assertEq(tb.balanceOf(DEST), 7 ether);
        assertEq(tb.balanceOf(address(bb)), 0);
        assertEq(wt.balanceOf(address(bb)), 3 ether, "other tokens untouched");
        assertEq(address(bb).balance, 1 ether, "ETH untouched");
        assertEq(bb.sweepToDest(), 0, "empty sweep is a no-op");
    }

    function test_sweep_byGuardian_stillToDest() public {
        tb.mint(address(bb), 7 ether);
        vm.prank(GUARDIAN);
        bb.sweepToDest();
        assertEq(tb.balanceOf(DEST), 7 ether);
        assertEq(tb.balanceOf(GUARDIAN), 0, "the guardian gets nothing");
    }

    function test_noWithdrawSurface(bytes4 sel, address who) public {
        vm.assume(sel != BB.buyback.selector && sel != BB.sweepToDest.selector);
        vm.assume(sel != bytes4(0));
        vm.assume(sel != BB.uniswapV3SwapCallback.selector && sel != BB.unlockCallback.selector);
        vm.deal(address(bb), 1 ether);
        vm.prank(who);
        (bool ok,) = address(bb).call(abi.encodePacked(sel, abi.encode(who, uint256(1 ether))));
        ok;
        assertEq(address(bb).balance, 1 ether, "no selector moves ETH");
    }

    // ---- ported from TBlockBuybackV2.dest.t.sol, plus the two new dest refusals
    function test_dest_guards() public {
        BB.Config memory c = _cfg();
        assertEq(new BB(c).DEST(), c.dest);
        c.dest = address(0);
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = c.poolManager;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = c.v3Pool;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = c.tblock;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = c.keeper;
        vm.etch(c.keeper, _vc());
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        vm.etch(c.keeper, "");
        c = _cfg(); c.dest = address(0xBEEF);
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = c.weth;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = c.wtcoin;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = c.v4Key.hooks; vm.etch(c.v4Key.hooks, _vc());
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        vm.etch(c.v4Key.hooks, "");
        // new: not the guardian (even with code), not an EIP-7702 delegated account
        c = _cfg(); c.dest = c.guardian; vm.etch(c.guardian, _vc());
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        vm.etch(c.guardian, "");
        address eoa7702 = address(0x7702);
        vm.etch(eoa7702, abi.encodePacked(hex"ef0100", address(0xC0DE)));
        c = _cfg(); c.dest = eoa7702;
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        // fix: not the veto (even with code); it must count the TBLOCK bought
        c = _cfg(); c.dest = VETO; vm.etch(VETO, _vc());
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        vm.etch(VETO, "");
        c = _cfg(); c.dest = address(new VVaultOf(address(wt)));
        vm.expectRevert(BB.BadParams.selector); new BB(c);
        c = _cfg(); c.dest = address(new VVault());
        vm.expectRevert(BB.BadParams.selector); new BB(c);
    }

    function test_dest_cannot_be_itself() public {
        BB.Config memory c = _cfg();
        c.dest = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(BB.BadParams.selector); new BB(c);
    }

    // =================================================================================================================
    // Part 2: the exit door
    // =================================================================================================================

    function _newVault() internal returns (address) { return address(new VVaultOf(address(tb))); }

    function test_door_propose_emits_and_sets_eta() public {
        address nv = _newVault();
        vm.expectEmit(true, false, false, true, address(bb));
        emit BB.DestProposed(nv, block.timestamp + 7 days, block.timestamp + 9 days, nv.codehash);
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        assertEq(eta, block.timestamp + 7 days);
        assertEq(bb.pendingDest(), nv);
        assertEq(bb.pendingDestEta(), eta);
        assertEq(bb.DEST(), DEST, "a proposal alone changes nothing");
    }

    function test_door_execute_before_eta_reverts() public {
        address nv = _newVault();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.warp(eta - 1);
        vm.expectRevert(abi.encodeWithSelector(BB.TooEarly.selector, eta));
        bb.executeDest();
        vm.prank(GUARDIAN); // the guardian is not faster than anyone
        vm.expectRevert(abi.encodeWithSelector(BB.TooEarly.selector, eta));
        bb.executeDest();
        assertEq(bb.DEST(), DEST);
    }

    function test_door_execute_at_eta_by_anyone(address anyone) public {
        address nv = _newVault();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.warp(eta);
        vm.expectEmit(true, true, true, true, address(bb));
        emit BB.DestChanged(DEST, nv, anyone);
        vm.prank(anyone);
        assertEq(bb.executeDest(), nv);
        assertEq(bb.DEST(), nv);
        assertEq(bb.pendingDest(), address(0));
        assertEq(bb.pendingDestEta(), 0);
        vm.expectRevert(BB.NoProposal.selector); // executes once
        bb.executeDest();
    }

    function test_door_cancel() public {
        address nv = _newVault();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.expectEmit(true, false, false, false, address(bb));
        emit BB.DestCancelled(nv, GUARDIAN);
        vm.prank(GUARDIAN);
        bb.cancelDest();
        assertEq(bb.pendingDest(), address(0));
        assertEq(bb.pendingDestEta(), 0);
        vm.warp(eta);
        vm.expectRevert(BB.NoProposal.selector);
        bb.executeDest();
        assertEq(bb.DEST(), DEST);
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.NoProposal.selector); // nothing to cancel
        bb.cancelDest();
        // a new proposal after a cancel restarts the full delay
        vm.prank(GUARDIAN);
        uint256 eta2 = bb.proposeDest(nv);
        assertEq(eta2, block.timestamp + 7 days);
    }

    function test_door_nonGuardian_reverts(address who) public {
        vm.assume(who != GUARDIAN && who != VETO);
        address nv = _newVault();
        vm.prank(who);
        vm.expectRevert(BB.NotGuardian.selector);
        bb.proposeDest(nv);
        vm.prank(GUARDIAN);
        bb.proposeDest(nv);
        vm.prank(who);
        vm.expectRevert(BB.NotGuardian.selector);
        bb.cancelDest();
        assertEq(bb.pendingDest(), nv, "a stranger cannot cancel");
    }

    function test_door_keeper_has_no_door() public {
        address nv = _newVault();
        vm.prank(KEEPER);
        vm.expectRevert(BB.NotGuardian.selector);
        bb.proposeDest(nv);
    }

    function test_door_second_propose_while_pending_reverts() public {
        address nv = _newVault();
        address nv2 = _newVault();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.ProposalPending.selector);
        bb.proposeDest(nv2);
        vm.warp(eta + 2 days); // still live until its window closes
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.ProposalPending.selector);
        bb.proposeDest(nv2);
        assertEq(bb.pendingDest(), nv);
        assertEq(bb.pendingDestEta(), eta, "eta not moved");
        // fix: once expired it cannot execute, and it no longer blocks a new proposal (with a new full delay)
        vm.warp(eta + 2 days + 1);
        vm.expectRevert(abi.encodeWithSelector(BB.Expired.selector, eta + 2 days));
        bb.executeDest();
        vm.prank(GUARDIAN);
        uint256 eta2 = bb.proposeDest(nv2);
        assertEq(eta2, block.timestamp + 7 days);
        assertEq(bb.pendingDest(), nv2);
    }

    function test_door_bad_dest_reverts() public {
        BB.Config memory c = _cfg();
        address[11] memory bad = [address(0), c.poolManager, c.v3Pool, c.tblock, address(bb), c.v4Key.hooks, c.keeper, c.weth, c.wtcoin, GUARDIAN, VETO];
        vm.etch(VETO, _vc());
        vm.etch(c.v4Key.hooks, _vc()); vm.etch(c.keeper, _vc()); vm.etch(GUARDIAN, _vc()); // even with code
        for (uint256 i; i < bad.length; i++) {
            vm.prank(GUARDIAN);
            vm.expectRevert(BB.BadParams.selector);
            bb.proposeDest(bad[i]);
        }
        vm.etch(GUARDIAN, "");
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.BadParams.selector);
        bb.proposeDest(address(0xBEEF)); // an EOA
        address eoa7702 = address(0x7702);
        vm.etch(eoa7702, abi.encodePacked(hex"ef0100", address(0xC0DE)));
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.BadParams.selector);
        bb.proposeDest(eoa7702); // a delegated EOA = a single key
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.BadParams.selector);
        bb.proposeDest(DEST); // no-op proposal
        assertEq(bb.pendingDest(), address(0));
    }

    function test_door_rechecked_at_execute() public {
        address nv = _newVault();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.etch(nv, ""); // the proposed contract lost its code
        vm.warp(eta);
        vm.expectRevert(BB.BadParams.selector);
        bb.executeDest();
        assertEq(bb.DEST(), DEST);
    }

/// @dev every 4-byte constant in the runtime code (the dispatcher's selectors among them) called by the GUARDIAN with
    ///      several argument shapes: none moves ETH, WETH, wtCOIN or TBLOCK to the guardian, and only TBLOCK may move, to DEST.
    ///      This finds a function a random-selector fuzz would never hit.
    function test_guardian_every_selector_moves_nothing() public {
        bytes memory code = address(bb).code;
        vm.deal(address(bb), 1 ether);
        weth.mint(address(bb), 1 ether); wt.mint(address(bb), 1 ether); tb.mint(address(bb), 1 ether);
        address nv = _newVault();
        uint256 hit;
        for (uint256 i; i < code.length; i++) {
            uint8 op = uint8(code[i]);
            if (op == 0x63 && i + 4 < code.length) {
                bytes4 sel = bytes4(bytes.concat(code[i + 1], code[i + 2], code[i + 3], code[i + 4]));
                hit++;
                bytes[4] memory args = [bytes(""), abi.encode(GUARDIAN), abi.encode(GUARDIAN, uint256(1 ether)), abi.encode(nv, GUARDIAN, uint256(1 ether))];
                for (uint256 j; j < 4; j++) {
                    uint256 s = vm.snapshotState();
                    vm.prank(GUARDIAN);
                    (bool ok,) = address(bb).call(abi.encodePacked(sel, args[j]));
                    ok;
                    assertEq(address(bb).balance, 1 ether, "ETH stays");
                    assertEq(weth.balanceOf(address(bb)), 1 ether, "WETH stays");
                    assertEq(wt.balanceOf(address(bb)), 1 ether, "wtCOIN stays");
                    assertEq(GUARDIAN.balance, 0, "guardian ETH");
                    assertEq(tb.balanceOf(GUARDIAN) + weth.balanceOf(GUARDIAN) + wt.balanceOf(GUARDIAN), 0, "guardian tokens");
                    assertEq(tb.balanceOf(address(bb)) + tb.balanceOf(DEST), 1 ether, "TBLOCK stays or goes to DEST");
                    vm.revertToState(s);
                }
            }
            if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; // skip push data
        }
        assertGt(hit, 15, "the scan saw the dispatcher");
    }


    function test_door_sweep_follows_current_dest() public {
        address nv = _newVault();
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        tb.mint(address(bb), 5 ether);
        bb.sweepToDest(); // pending only: still the old dest
        assertEq(tb.balanceOf(DEST), 5 ether);
        vm.warp(eta);
        bb.executeDest();
        tb.mint(address(bb), 2 ether);
        bb.sweepToDest();
        assertEq(tb.balanceOf(nv), 2 ether);
        assertEq(tb.balanceOf(DEST), 5 ether, "old dest unchanged");
    }
}

// =====================================================================================================================
// Part 3: the whole buyback path on working mocks
// =====================================================================================================================
contract TBlockBuybackVaultPathTest is Test {
    address constant GUARDIAN = address(0x6A4D);
    address constant VETO = address(0x7E70);
    address constant KEEPER = address(0xF1F1);
    VWeth weth; VToken wt; VToken tb; FV3 v3; FPM pm;
    address vault; BB bb;

    function _cfg() internal view returns (BB.Config memory c) {
        c.poolManager = address(pm);
        (address c0, address c1) = address(wt) < address(tb) ? (address(wt), address(tb)) : (address(tb), address(wt));
        c.v4Key = BB.PoolKey(c0, c1, 3000, 60, address(0x3e6B46810b1fd5085086Fd1417E8adB02f34a044));
        c.v3Pool = address(v3);
        c.weth = address(weth); c.wtcoin = address(wt); c.tblock = address(tb);
        c.maxPerCall = 0.002 ether; c.minSpend = 0.0001 ether; c.cooldown = 1 hours; c.twapWindow = 1800;
        c.maxV3DevTicks = 100; c.maxV4ImpactTicks = 60; c.maxHookPpm = 12_000; c.tipBps = 50; c.maxTip = 0.00002 ether;
        c.dest = vault; c.keeper = KEEPER; c.publicDelay = 6 hours; c.guardian = GUARDIAN; c.veto = VETO;
    }

    function setUp() public {
        weth = new VWeth(); wt = new VToken(); tb = new VToken();
        v3 = new FV3(address(weth), address(wt));
        pm = new FPM(tb);
        vault = address(new VVaultOf(address(tb)));
        bb = new BB(_cfg());
        vm.deal(address(this), 100 ether);
        (bool ok,) = address(bb).call{value: 1 ether}("");
        require(ok);
    }

    function test_mock_selector_matches() public pure {
        assertEq(FPM.swap.selector, bytes4(0xf3cd914c), "mock PM swap = v4 PoolManager.swap selector");
    }

    function test_buyback_pays_the_vault() public {
        vm.prank(KEEPER);
        (uint256 toDest, uint256 fromSwap) = bb.buyback(0.002 ether);
        uint256 expected = 0.002 ether * 1000 * 990_000 / 1e6;
        assertEq(fromSwap, expected);
        assertEq(toDest, expected);
        assertEq(tb.balanceOf(vault), expected, "the vault received every TBLOCK bought");
        assertEq(tb.balanceOf(address(bb)), 0);
        assertEq(address(bb).balance, 1 ether - 0.002 ether, "the keeper gets no tip");
        assertEq(weth.balanceOf(address(v3)), 0.002 ether, "the ETH went to the v3 pool only");
    }

    function test_after_switch_next_buyback_pays_new_dest() public {
        vm.prank(KEEPER);
        (uint256 first,) = bb.buyback(0.002 ether);
        assertEq(tb.balanceOf(vault), first);

        address nv = address(new VVaultOf(address(tb)));
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);

        vm.warp(block.timestamp + 1 hours); // a buy while pending still pays the current vault
        vm.prank(KEEPER);
        (uint256 second,) = bb.buyback(0.001 ether);
        assertEq(tb.balanceOf(vault), first + second);
        assertEq(tb.balanceOf(nv), 0);

        vm.warp(eta);
        vm.prank(address(0xA11CE));
        bb.executeDest();
        vm.prank(KEEPER);
        (uint256 third, uint256 fromSwap) = bb.buyback(0.002 ether);
        assertEq(third, fromSwap);
        assertGt(third, 0);
        assertEq(tb.balanceOf(nv), third, "the next buyback pays the NEW dest");
        assertEq(tb.balanceOf(vault), first + second, "the old dest gets nothing more");
    }

    function test_public_path_tip_after_switch() public {
        address nv = address(new VVaultOf(address(tb)));
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.warp(eta);
        bb.executeDest();
        address pub = address(0xB0B);
        vm.prank(pub);
        (uint256 toDest,) = bb.buyback(0.002 ether);
        assertEq(pub.balance, 0.00001 ether, "public tip = 50 bps of 0.002 ETH");
        assertEq(tb.balanceOf(nv), toDest);
        assertEq(tb.balanceOf(vault), 0);
    }

/// @dev the guardian has no buying right of its own: it is a public caller like anyone (armed + PUBLIC_DELAY, gets the tip).
    function test_guardian_is_only_a_public_caller() public {
        uint256 t0 = block.timestamp; // armed in setUp
        vm.prank(GUARDIAN);
        vm.expectRevert(abi.encodeWithSelector(BB.TooEarly.selector, t0 + 6 hours));
        bb.buyback(0.002 ether);
        vm.warp(t0 + 6 hours);
        vm.prank(GUARDIAN);
        bb.buyback(0.002 ether);
        assertEq(GUARDIAN.balance, 0.00001 ether, "the same public tip as anyone");
        // and after the buy it waits COOLDOWN + PUBLIC_DELAY, not COOLDOWN like the keeper
        vm.warp(t0 + 6 hours + 1 hours);
        vm.prank(GUARDIAN);
        vm.expectRevert(abi.encodeWithSelector(BB.TooEarly.selector, t0 + 6 hours + 1 hours + 6 hours));
        bb.buyback(0.002 ether);
        vm.prank(KEEPER);
        bb.buyback(0.002 ether);
    }


    // ---- the guardian can never move ETH / WETH / wtCOIN / TBLOCK out to itself or anyone

    function _call(address who, uint8 pick, address a, uint256 n, bytes4 rnd) internal returns (bool ok) {
        bytes memory data;
        pick = pick % 13;
        if (pick == 0) data = abi.encodeCall(BB.buyback, (bound(n, 0, 0.003 ether)));
        else if (pick == 1) data = abi.encodeCall(BB.sweepToDest, ());
        else if (pick == 2) data = abi.encodeCall(BB.arm, ());
        else if (pick == 3) data = abi.encodeCall(BB.proposeDest, (a));
        else if (pick == 4) data = abi.encodeCall(BB.cancelDest, ());
        else if (pick == 5) data = abi.encodeCall(BB.executeDest, ());
        else if (pick == 6) data = abi.encodeCall(BB.uniswapV3SwapCallback, (int256(n % 1e30), -int256(n % 1e30), ""));
        else if (pick == 7) data = abi.encodeCall(BB.unlockCallback, (abi.encode(n)));
        else if (pick == 8) data = abi.encodeWithSelector(rnd, a, n);
        else if (pick == 9) data = abi.encodeWithSelector(rnd, a, a, n);
        else if (pick == 10) data = abi.encodeWithSelector(rnd);
        else if (pick == 11) data = abi.encodePacked(rnd, n, a);
        else data = abi.encodeCall(BB.renounceDoor, ());
        vm.prank(who);
        (ok,) = address(bb).call(data);
    }

    struct Snap { uint256 ethBb; uint256 wtBb; uint256 tbBb; address dest; uint256 tbDest; uint256 gEth; uint256 gWeth; uint256 gWt; uint256 gTb; uint256 v3Weth; }

    function _snap() internal view returns (Snap memory s) {
        address g = GUARDIAN;
        s.ethBb = address(bb).balance + weth.balanceOf(address(bb));
        s.wtBb = wt.balanceOf(address(bb));
        s.tbBb = tb.balanceOf(address(bb));
        s.dest = bb.DEST();
        s.tbDest = tb.balanceOf(s.dest);
        s.gEth = g.balance; s.gWeth = weth.balanceOf(g); s.gWt = wt.balanceOf(g); s.gTb = tb.balanceOf(g);
        s.v3Weth = weth.balanceOf(address(v3));
    }

    function _checkAfter(Snap memory s) internal view {
        address g = GUARDIAN;
        // nothing reaches the guardian (it is never the keeper; as a public caller it gets the same tip as anyone)
        assertEq(weth.balanceOf(g), s.gWeth, "guardian WETH");
        assertEq(wt.balanceOf(g), s.gWt, "guardian wtCOIN");
        assertEq(tb.balanceOf(g), s.gTb, "guardian TBLOCK");
        uint256 gGain = g.balance - s.gEth;
        // wtCOIN never leaves the pot (the swap passes it through)
        assertEq(wt.balanceOf(address(bb)), s.wtBb, "pot wtCOIN");
        // ETH (+WETH) leaves only into the v3 pool, plus at most the public tip to the caller
        uint256 ethNow = address(bb).balance + weth.balanceOf(address(bb));
        uint256 intoPool = weth.balanceOf(address(v3)) - s.v3Weth;
        assertEq(s.ethBb - ethNow, intoPool + gGain, "ETH only to the pool (+ tip)");
        assertLe(gGain, bb.MAX_TIP(), "at most the public tip anyone gets");
        if (gGain != 0) assertGt(intoPool, 0, "a tip only comes with a real buy");
        // TBLOCK held leaves only to the dest that was current during the call
        if (bb.DEST() == s.dest) {
            assertGe(tb.balanceOf(s.dest) - s.tbDest, s.tbBb - tb.balanceOf(address(bb)), "TBLOCK only to DEST");
        } else {
            assertEq(tb.balanceOf(address(bb)), s.tbBb, "the switch call itself moves no TBLOCK");
        }
    }

    function test_guardian_cannot_move_funds(uint8[4] calldata picks, address a, uint256 n, bytes4 rnd, uint32[4] calldata gaps) public {
        // the pot holds every token it can hold; the stray TBLOCK may only ever go to the CURRENT dest
        weth.mint(address(bb), 0.5 ether); vm.deal(address(weth), 0.5 ether);
        wt.mint(address(bb), 3 ether);
        tb.mint(address(bb), 7 ether);
        for (uint256 i; i < 4; i++) {
            vm.warp(block.timestamp + gaps[i] % 4 days);
            Snap memory s = _snap();
            _call(GUARDIAN, picks[i], a, n, rnd);
            _checkAfter(s);
        }
    }

    /// @dev any dest change requires a DestProposed at least DEST_DELAY earlier, whoever calls in whatever order.
    function test_dest_changes_only_through_the_delay(uint8[6] calldata picks, address[6] calldata who, address a, uint32[6] calldata gaps) public {
        address cur = bb.DEST();
        uint256 proposedAt;
        address proposed;
        address nv = address(new VVaultOf(address(tb)));
        for (uint256 i; i < 6; i++) {
            vm.warp(block.timestamp + gaps[i] % 5 days);
            address caller = i % 2 == 0 ? GUARDIAN : (i == 3 ? VETO : who[i]);
            uint256 etaBefore = bb.pendingDestEta();
            _call(caller, picks[i], i % 3 == 0 ? nv : a, 0.001 ether, bytes4(0));
            // a new proposal (also one replacing an expired one) = a new eta
            if (bb.pendingDest() != address(0) && bb.pendingDestEta() != etaBefore) { proposedAt = block.timestamp; proposed = bb.pendingDest(); }
            if (bb.DEST() != cur) {
                assertEq(bb.DEST(), proposed, "only the proposed dest");
                assertGe(block.timestamp, proposedAt + 7 days, "only after the delay");
                assertLe(block.timestamp, proposedAt + 9 days, "only inside the window");
                assertEq(bb.destCodehash(), proposed.codehash, "the new dest's code is pinned");
                cur = bb.DEST();
            }
        }
    }
}
