// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {PlayGateBase} from "./PlayGateBase.sol";
import {Trader, PoolKey, Payee} from "./TBlockLockRewards.fork.t.sol";

/// Independent review, lens EXTERNAL TRUST. Base mainnet fork only (TBLOCK is B20):
///   FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/forge.exe test --match-path test/indep_external-trust.t.sol \
///     --fork-url https://mainnet.base.org -vv
/// Addresses: HOOK, PM, WTCOIN, TBLOCK, LOCK, PAYEE, POOL_ID copied from test/TBlockLockRewards.fork.t.sol. Every other address
/// (hook admin, pool locker, wtCOIN beacon, beacon owner, wtCOIN implementation) is READ on the fork inside the test, never typed.
/// Impersonation (vm.prank) exists only inside this local forge fork. Nothing signs or sends from a real wallet.

interface IHookX {
    function payees(PoolKey calldata key) external view returns (Payee[] memory);
    function setPayees(PoolKey calldata key, Payee[] calldata p) external;
    function transferPayeeSlot(PoolKey calldata key, address to) external;
    function renounceFees(PoolKey calldata key) external;
    function locker(bytes32 id) external view returns (address);
    function launcher() external view returns (address);
    function platformAdmin() external view returns (address);
    function renouncedBps(bytes32 id) external view returns (uint256);
}

interface IBeaconX {
    function implementation() external view returns (address);
    function owner() external view returns (address);
    function upgradeTo(address impl) external;
}

interface ITimelockX { function getMinDelay() external view returns (uint256); }

interface ILockX {
    function lock(uint256 amount, uint256 unlockAt) external;
    function requestWithdraw() external;
    function withdraw() external;
    function activeLockedOf(address) external view returns (uint256);
    function withdrawableAtOf(address) external view returns (uint256);
}

interface IERC20X {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// a wtCOIN implementation an upgrade could install: everything forwards to the CURRENT implementation, except transfer()
/// (a pause / blacklist of the sender, the most ordinary thing an issuer upgrade adds)
contract FrozenTransferImpl {
    address immutable OLD;
    constructor(address old) { OLD = old; }
    function transfer(address, uint256) external pure returns (bool) { revert("paused"); }
    fallback() external {
        address o = OLD;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), o, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if iszero(ok) { revert(0, returndatasize()) }
            return(0, returndatasize())
        }
    }
}

/// an implementation whose balanceOf reverts (a broken or hostile upgrade)
contract BrokenBalanceImpl {
    address immutable OLD;
    constructor(address old) { OLD = old; }
    function balanceOf(address) external pure returns (uint256) { revert("broken"); }
    fallback() external {
        address o = OLD;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let ok := delegatecall(gas(), o, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            if iszero(ok) { revert(0, returndatasize()) }
            return(0, returndatasize())
        }
    }
}

contract IndepExternalTrustTest is PlayGateBase {
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOOK = 0x3e6B46810b1fd5085086Fd1417E8adB02f34a044;
    bytes32 constant POOL_ID = 0x6869b9016937d97dfa595eb25bc72880e821b8eb22be32bc79c623bc64ce8a3e;
    address constant LOCK = 0xEc46b02bb1f3A58Ce37c023f8668f2207bc2B0aA;
    address constant PAYEE = 0x37Eb9b7ce0b51Fe12fBf092026e001918128580A;
    bytes32 constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50; // EIP-1967 beacon slot

    uint256 constant EPOCH = 30 days;

    TBlockLockRewards rw;
    Trader trader;
    PoolKey key;
    address guardian = address(0x6A4D1A4);
    address alice = address(0xA11CE0001);
    address bob = address(0xB0B0002);
    address evil = address(0xE1111);
    uint256 tNow;

    function setUp() public {
        if (block.chainid != 8453 || PM.code.length == 0) vm.skip(true);
        key = PoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK);
        tNow = block.timestamp;
        (rw, game) = _deployRewards(TBLOCK, WTCOIN, LOCK, PM, guardian, tNow - EPOCH + 1 days, type(uint128).max, type(uint128).max);
        trader = new Trader();
    }

    function _bal(address t, address w) internal view returns (uint256) { return IERC20X(t).balanceOf(w); }

    function _transferSlot() internal {
        vm.prank(PAYEE);
        IHookX(HOOK).transferPayeeSlot(key, address(rw));
        assertEq(IHookX(HOOK).payees(key)[0].to, address(rw));
    }

    function _getWtcoin() internal returns (uint256) {
        vm.deal(address(trader), 0.05 ether);
        trader.wrap(0.05 ether);
        trader.v3(true, 0.05 ether);
        return _bal(WTCOIN, address(trader));
    }

    function _lockEnroll(address who, uint256 amount, uint256 unlockAt) internal {
        trader.send(TBLOCK, who, amount);
        vm.startPrank(who);
        IERC20X(TBLOCK).approve(LOCK, amount);
        ILockX(LOCK).lock(amount, unlockAt);
        rw.enroll(who);
        vm.stopPrank();
    }

    function _one(uint256 e) internal pure returns (uint256[] memory a) { a = new uint256[](1); a[0] = e; }

    // ================================================================ 0. who holds power over the funding (exploration, logged)
    function test_explore_hookRoles() public {
        address admin = IHookX(HOOK).platformAdmin();
        address lockerA = IHookX(HOOK).locker(POOL_ID);
        address launcherA = IHookX(HOOK).launcher();
        console2.log("hook.platformAdmin", admin, admin.code.length);
        console2.log("hook.locker(pool)", lockerA, lockerA.code.length);
        console2.log("hook.launcher", launcherA);
        _transferSlot();
        Payee[] memory np = new Payee[](1);
        np[0] = Payee(evil, 3400);
        address[4] memory who = [admin, lockerA, PAYEE, address(rw)];
        string[4] memory nm = ["platformAdmin", "locker", "oldPayee", "rewards"];
        for (uint256 i; i < 4; i++) {
            uint256 snap = vm.snapshotState();
            vm.prank(who[i]);
            (bool ok, bytes memory r) = HOOK.call(abi.encodeWithSelector(IHookX.setPayees.selector, key, np));
            console2.log(string.concat("setPayees by ", nm[i], ok ? " OK" : " REVERT"), ok ? IHookX(HOOK).payees(key)[0].to : address(0));
            if (!ok) console2.logBytes(r);
            vm.revertToState(snap);
            snap = vm.snapshotState();
            vm.prank(who[i]);
            (ok, r) = HOOK.call(abi.encodeWithSelector(IHookX.renounceFees.selector, key));
            console2.log(string.concat("renounceFees by ", nm[i], ok ? " OK" : " REVERT"), IHookX(HOOK).renouncedBps(POOL_ID));
            if (!ok) console2.logBytes(r);
            vm.revertToState(snap);
            snap = vm.snapshotState();
            vm.prank(who[i]);
            (ok, r) = HOOK.call(abi.encodeWithSelector(IHookX.transferPayeeSlot.selector, key, evil));
            console2.log(string.concat("transferPayeeSlot by ", nm[i], ok ? " OK" : " REVERT"));
            if (!ok) console2.logBytes(r);
            vm.revertToState(snap);
        }
        address beacon = address(uint160(uint256(vm.load(WTCOIN, BEACON_SLOT))));
        console2.log("wtCOIN beacon", beacon);
        console2.log("beacon.implementation", IBeaconX(beacon).implementation());
        address bo = IBeaconX(beacon).owner();
        console2.log("beacon.owner", bo, bo.code.length);
        console2.log("beacon.owner minDelay (s)", ITimelockX(bo).getMinDelay());
    }

    // ================================================================ EXT-1: the hook's platformAdmin takes the slot back, alone, at once
    /// After the payee moves its slot to the rewards contract, hook.platformAdmin() (an address with no code on this fork) can call
    /// setPayees and point the 34% creator share anywhere, with no timelock. The next real swap pays the new payee and the rewards
    /// contract receives nothing; the rewards contract has no way to notice or to take the slot back (it never calls the hook).
    function test_EXT1_platformAdminRedirectsFunding() public {
        _transferSlot();
        uint256 wt = _getWtcoin();
        address admin = IHookX(HOOK).platformAdmin();
        assertEq(admin.code.length, 0, "platformAdmin has no code: a single key, no timelock contract");
        assertTrue(admin != PAYEE, "platformAdmin is not the payee that moved the slot");

        // baseline: one buy pays the rewards contract
        uint256 rb0 = _bal(TBLOCK, address(rw));
        trader.v4(true, wt / 4);
        uint256 toRewardsBefore = _bal(TBLOCK, address(rw)) - rb0;
        assertGt(toRewardsBefore, 0, "rewards contract funded while it holds the slot");

        Payee[] memory np = new Payee[](1);
        np[0] = Payee(evil, 3400);
        vm.prank(admin); // fork-only impersonation
        IHookX(HOOK).setPayees(key, np);
        assertEq(IHookX(HOOK).payees(key)[0].to, evil, "slot redirected by platformAdmin");

        uint256 rb1 = _bal(TBLOCK, address(rw));
        uint256 eb1 = _bal(TBLOCK, evil);
        trader.v4(true, wt / 4);
        uint256 toRewardsAfter = _bal(TBLOCK, address(rw)) - rb1;
        uint256 toEvil = _bal(TBLOCK, evil) - eb1;
        assertEq(toRewardsAfter, 0, "rewards contract receives nothing after the redirect");
        assertGt(toEvil, 0, "the new payee receives the creator share");
        console2.log("EXT-1 buy fee to rewards BEFORE setPayees (TBLOCK raw)", toRewardsBefore);
        console2.log("EXT-1 buy fee to rewards AFTER  setPayees (TBLOCK raw)", toRewardsAfter);
        console2.log("EXT-1 buy fee to platformAdmin's chosen payee (TBLOCK raw)", toEvil);
    }

    // ---------------------------------------------------------------- shared setup for the wtCOIN cases: fees in both tokens, alice
    // locks through the REAL TBlockLock, plays in epoch 1; epoch 0 closed
    function _fundedEpoch1() internal returns (uint256 aliceW) {
        _transferSlot();
        uint256 wt = _getWtcoin();
        trader.v4(true, wt / 3);                           // TBLOCK fee to rewards
        trader.v4(false, _bal(TBLOCK, address(trader)) / 10); // wtCOIN fee to rewards
        assertGt(_bal(WTCOIN, address(rw)), 0);
        assertGt(_bal(TBLOCK, address(rw)), 0);
        _lockEnroll(alice, _bal(TBLOCK, address(trader)) / 2, tNow + 60 days);
        aliceW = rw.weightOf(alice, 1);
        assertGt(aliceW, 0);
        vm.warp(tNow + 2 days);
        _play(alice);
        vm.warp(rw.epochEnd(1));
        rw.closeEpoch(0);
    }

    function _upgradeWtcoin(address newImpl) internal {
        address beacon = address(uint160(uint256(vm.load(WTCOIN, BEACON_SLOT))));
        address owner_ = IBeaconX(beacon).owner();
        vm.prank(owner_); // fork-only: stands for a TimelockController operation executed after its delay
        IBeaconX(beacon).upgradeTo(newImpl);
        assertEq(IBeaconX(beacon).implementation(), newImpl, "wtCOIN implementation replaced through its beacon");
    }

    // ================================================================ EXT-2: a wtCOIN upgrade that blocks transfer() also locks the TBLOCK
    /// claim() pays both tokens in one call, wtCOIN first. wtCOIN is a BeaconProxy whose beacon owner (a 48 h TimelockController,
    /// not this project) can replace the implementation. If the new one refuses transfer() from the rewards contract, every claim of an
    /// epoch with a nonzero wtCOIN share reverts, so the TBLOCK share of that epoch cannot be claimed either.
    function test_EXT2_wtcoinFreezeAlsoBlocksTblockClaim() public {
        _fundedEpoch1();
        rw.closeEpoch(1);
        (uint256 c0, uint256 c1) = rw.claimable(alice, _one(1));
        assertGt(c0, 0, "alice owed wtCOIN");
        assertGt(c1, 0, "alice owed TBLOCK");

        // control: without the upgrade the same claim pays both tokens (the stimulus, not the setup, causes the revert below)
        uint256 snap = vm.snapshotState();
        vm.prank(alice);
        (uint256 k0, uint256 k1) = rw.claim(_one(1));
        assertEq(k0, c0);
        assertEq(k1, c1);
        vm.revertToState(snap);

        address oldImpl = IBeaconX(address(uint160(uint256(vm.load(WTCOIN, BEACON_SLOT))))).implementation();
        _upgradeWtcoin(address(new FrozenTransferImpl(oldImpl)));

        uint256 tb0 = _bal(TBLOCK, alice);
        vm.prank(alice);
        vm.expectRevert(TBlockLockRewards.TransferFailed.selector);
        rw.claim(_one(1));
        assertEq(_bal(TBLOCK, alice), tb0, "alice got none of her TBLOCK");
        (, uint256 c1b) = rw.claimable(alice, _one(1));
        assertEq(c1b, c1, "TBLOCK still owed, unreachable while wtCOIN refuses transfer");
        console2.log("EXT-2 TBLOCK owed to alice but unclaimable after a wtCOIN transfer freeze (raw)", c1b);
        console2.log("EXT-2 wtCOIN owed (raw)", c0);
    }

    // ================================================================ EXT-3: a wtCOIN upgrade whose balanceOf reverts stops every close
    /// closeEpoch reads unassigned(WTCOIN) -> balanceOf. If that reverts, the epoch (and, closes being sequential, every later epoch)
    /// can never be closed: no TBLOCK pot is ever assigned again, although TBLOCK itself works.
    function test_EXT3_wtcoinBrokenBalanceStopsAllCloses() public {
        _fundedEpoch1();
        // control: without the upgrade epoch 1 closes with a TBLOCK pot
        uint256 snap = vm.snapshotState();
        rw.closeEpoch(1);
        (, uint256 ctrlPot1) = rw.pot(1);
        assertGt(ctrlPot1, 0, "control: TBLOCK pot assigned");
        vm.revertToState(snap);

        address oldImpl = IBeaconX(address(uint160(uint256(vm.load(WTCOIN, BEACON_SLOT))))).implementation();
        _upgradeWtcoin(address(new BrokenBalanceImpl(oldImpl)));
        uint256 tbHeld = rw.unassigned(TBLOCK);
        assertGt(tbHeld, 0, "TBLOCK side still readable");
        vm.expectRevert(TBlockLockRewards.TransferFailed.selector);
        rw.closeEpoch(1);
        vm.warp(rw.epochEnd(5));
        vm.expectRevert(abi.encodeWithSelector(TBlockLockRewards.EpochOutOfOrder.selector, uint256(1)));
        rw.closeEpoch(2);
        assertEq(rw.nextEpochToClose(), 1, "stuck at epoch 1");
        console2.log("EXT-3 TBLOCK held, no pot can ever be assigned (raw)", tbHeld);
    }

    // ================================================================ EXT-4: TBlockLock's gate rule is not applied to plays or claims
    /// TBlockLock v1 says a GATE must read activeLockedOf (0 once an exit is requested). recordPlay and claim read only the stored
    /// checkpoint: a holder who requested exit is still counted and paid unless a third party calls sync() during the epoch.
    /// (The principal stays locked until unlockAt >= end of every paid epoch: no TBLOCK escapes. The finding is the rule mismatch.)
    function test_EXT4_exitRequestedHolderStillPlaysAndIsPaid() public {
        _transferSlot();
        uint256 wt = _getWtcoin();
        trader.v4(true, wt / 3);
        _lockEnroll(alice, _bal(TBLOCK, address(trader)) / 2, tNow + 60 days);
        uint256 wA = rw.weightOf(alice, 1);
        vm.warp(tNow + 2 days);
        vm.prank(alice);
        ILockX(LOCK).requestWithdraw(); // the real TBlockLock
        assertEq(ILockX(LOCK).activeLockedOf(alice), 0, "TBlockLock: alice's lock is no longer active");
        _play(alice);
        assertTrue(rw.hasPlayed(alice, 1), "play recorded for a holder on her way out");
        assertEq(rw.playedWeight(1), wA);
        vm.warp(rw.epochEnd(1));
        rw.closeEpoch(0);
        rw.closeEpoch(1);
        vm.prank(alice);
        (, uint256 p1) = rw.claim(_one(1));
        assertGt(p1, 0, "paid in full for the epoch");
        assertGe(ILockX(LOCK).withdrawableAtOf(alice), rw.epochEnd(1), "principal was still locked through the paid epoch");
        console2.log("EXT-4 TBLOCK paid to a holder whose TBlockLock activeLockedOf was 0 (raw)", p1);
    }
}
