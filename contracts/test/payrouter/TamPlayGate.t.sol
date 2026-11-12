// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {TblockPayRouter} from "../../src/TblockPayRouter.sol";
import {TamArtV2} from "../../src/TamArtV2.sol";
import {RouterBase} from "./TblockPayRouter.t.sol";
import {PlayRewardsRecorder} from "./Mocks.sol";

/// TamArtV2's side of the play gate (economy v2 pack, 2026-11-11): a paid mint reports the PAYER to BOTH the holders vault (with the
/// TBLOCK the router bought) and TBlockLockRewards, never blocks on either, and reverts whole when sent with too little gas for a record.
/// The real vault + rewards are tested together with this game in D:/tmp/forge-pack; here both are recording stand-ins.
contract TamPlayGateTest is RouterBase {
    function test_tamPlay_recordsThePayerOnce() public {
        vm.prank(payer);
        uint256 out = router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(1));
        assertEq(rewards.count(), 1);
        assertEq(rewards.players(0), payer, "player = the address the router pulled USDC from");
        assertEq(rewards.callers(0), address(tam), "reported by the game itself");
        assertEq(tam.REWARDS(), address(rewards));
        assertEq(vault.count(), 1, "the vault is told too");
        assertEq(vault.players(0), payer);
        assertEq(vault.amounts(0), out, "vault play weight = the TBLOCK the router measured it bought");
        assertEq(vault.callers(0), address(tam));
        assertEq(tam.VAULT(), address(vault));
        assertEq(tam.VAULT(), tam.DEST(), "the vault told is the vault paid");
    }

    /// a TBLOCK gift parked on TAM before a mint reaches the vault, but is NOT counted as the payer's play
    function test_tamPlay_donationDoesNotInflateThePlay() public {
        tb.mint(address(tam), 777e18);
        vm.prank(payer);
        uint256 out = router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(2));
        assertEq(tb.balanceOf(address(vault)), out + 777e18, "everything held went to DEST");
        assertEq(vault.amounts(0), out, "the play is the router's measured output only");
    }

    function test_tamPlay_onlyThroughThePaidPath() public {
        // onPaid is ROUTER-only: nobody can make TAM report a play without paying through the router
        vm.prank(payer);
        vm.expectRevert(TamArtV2.NotRouter.selector);
        tam.onPaid(payer, 5_000_000, 1, _work(2));
        assertEq(rewards.count(), 0);
        assertEq(vault.count(), 0);
        // a payment to ANOTHER game through the same router reports nothing
        _pay(address(game), 5_000_000, F5);
        assertEq(rewards.count(), 0);
        assertEq(vault.count(), 0);
    }

    function test_tamPlay_rewardsBrokenNeverBlocksTheMint() public {
        uint256 id;
        for (uint8 m = 1; m <= 3; m++) {
            rewards.setMode(m);
            vm.prank(payer);
            uint256 g0 = gasleft();
            uint256 out = router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(10 + m));
            uint256 used = g0 - gasleft();
            assertEq(tam.ownerOf(++id), payer, "minted anyway");
            assertGt(out, 0);
            console.log("pay() into TAM with broken rewards, mode / gas", m, used);
        }
        assertEq(rewards.count(), 0, "nothing recorded by a broken rewards contract");
        assertEq(vault.count(), 3, "the vault record is independent of the rewards one");
        rewards.setMode(0);
        for (uint8 m = 1; m <= 3; m++) {
            vault.setMode(m);
            vm.prank(payer);
            uint256 g0 = gasleft();
            router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(20 + m));
            uint256 used = g0 - gasleft();
            assertEq(tam.ownerOf(++id), payer, "minted anyway");
            console.log("pay() into TAM with broken vault record, mode / gas", m, used);
        }
        assertEq(vault.count(), 3, "nothing more recorded by a broken vault record");
        assertEq(rewards.count(), 3, "the rewards record is independent of the vault one");
        rewards.setMode(2);
        vault.setMode(2);
        vm.prank(payer);
        router.pay(address(tam), 5_000_000, F5, block.timestamp, _work(30));
        assertEq(tam.ownerOf(++id), payer, "both records burning all their gas: minted anyway");
    }

    /// for every gas limit: either pay() reverts as a whole (USDC untouched), or it mints AND both plays are recorded
    function test_tamPlay_noGasLimitLosesTheRecord() public {
        uint256 firstOk;
        uint256 sawGuard;
        for (uint256 gl = 150_000; gl <= 1_200_000; gl += 2_500) {
            uint256 snap = vm.snapshotState();
            uint256 usdcBefore = usdc.balanceOf(payer);
            vm.prank(payer);
            (bool ok, bytes memory ret) = address(router).call{gas: gl}(
                abi.encodeCall(TblockPayRouter.pay, (address(tam), 5_000_000, F5, block.timestamp, _work(50)))
            );
            if (ok) {
                assertEq(rewards.count(), 1, "a successful paid mint always carries its rewards record");
                assertEq(vault.count(), 1, "a successful paid mint always carries its vault record");
                if (firstOk == 0) firstOk = gl;
            } else {
                assertEq(usdc.balanceOf(payer), usdcBefore, "a failed pay moves no USDC");
                if (ret.length == 4 && bytes4(ret) == TamArtV2.PlayGasTooLow.selector) sawGuard++;
            }
            vm.revertToState(snap);
        }
        assertGt(firstOk, 0, "some gas limit succeeds");
        assertGt(sawGuard, 0, "the guard itself was hit (not only an out-of-gas elsewhere)");
        console.log("lowest pay() gas limit (2,500 steps) that mints TAM, mocks", firstOk);
        console.log("gas limits refused by PlayGasTooLow", sawGuard);
    }

    /// the SECOND record (rewards) has its own guard: there are gas limits where the vault record already RAN (seen in the call trace,
    /// reverted frames included) when the rewards guard refuses; the whole pay then reverts, the vault record with it.
    function test_tamPlay_secondRecordGuarded() public {
        // cheap scan first (no state-diff recording: 1,000+ recorded runs exhausted the test's memory): the lowest gas limit that mints
        uint256 firstOk;
        for (uint256 gl = 150_000; gl <= 1_200_000 && firstOk == 0; gl += 1_000) {
            uint256 s0 = vm.snapshotState();
            vm.prank(payer);
            (bool ok0,) = address(router).call{gas: gl}(
                abi.encodeCall(TblockPayRouter.pay, (address(tam), 5_000_000, F5, block.timestamp, _work(51)))
            );
            if (ok0) firstOk = gl;
            vm.revertToState(s0);
        }
        assertGt(firstOk, 0, "some gas limit mints");
        uint256 hits;
        // the second guard can only fire within one record's gas (PLAY_GAS) below the lowest limit that mints
        for (uint256 gl = firstOk - 120_000; gl < firstOk; gl += 1_000) {
            uint256 freeMem;
            assembly { freeMem := mload(0x40) } // each recorded diff is large: hand its memory back at the end of the iteration
            uint256 snap = vm.snapshotState();
            vm.startStateDiffRecording();
            vm.prank(payer);
            (bool ok, bytes memory ret) = address(router).call{gas: gl}(
                abi.encodeCall(TblockPayRouter.pay, (address(tam), 5_000_000, F5, block.timestamp, _work(51)))
            );
            Vm.AccountAccess[] memory acc = vm.stopAndReturnStateDiff();
            bool vaultRecordRan;
            bool rewardsRecordRan;
            for (uint256 i; i < acc.length; i++) {
                if (acc[i].accessor != address(tam) || acc[i].kind != VmSafe.AccountAccessKind.Call) continue;
                if (acc[i].account == address(vault) && acc[i].data.length == 68) vaultRecordRan = true; // recordPlay(address,uint256)
                if (acc[i].account == address(rewards) && acc[i].data.length == 36) rewardsRecordRan = true; // recordPlay(address)
            }
            if (!ok && ret.length == 4 && bytes4(ret) == TamArtV2.PlayGasTooLow.selector && vaultRecordRan && !rewardsRecordRan) {
                assertEq(vault.count(), 0, "reverted whole: the first record is rolled back too");
                assertEq(rewards.count(), 0);
                hits++;
            }
            vm.revertToState(snap);
            assembly { mstore(0x40, freeMem) }
        }
        assertGt(hits, 0, "some gas limit ran the vault record, then the rewards guard refused");
        console.log("gas limits where the SECOND guard refused after the first record ran", hits);
    }

    function test_tamCtor_rejectsBadRewards() public {
        address[6] memory bad = [address(0), address(router), address(vault), dev, address(tb), address(usdc)];
        for (uint256 i; i < bad.length; i++) {
            vm.expectRevert(TamArtV2.BadAddress.selector);
            new TamArtV2(address(router), dev, address(vault), address(tb), address(usdc), bad[i]);
        }
        address self = vm.computeCreateAddress(address(this), vm.getNonce(address(this)));
        vm.expectRevert(TamArtV2.BadAddress.selector);
        new TamArtV2(address(router), dev, address(vault), address(tb), address(usdc), self);
        // a codeless (not yet deployed) rewards address is accepted on purpose: games deploy first
        address predicted = address(0x7E3A11D5);
        assertEq(predicted.code.length, 0);
        TamArtV2 t = new TamArtV2(address(router), dev, address(vault), address(tb), address(usdc), predicted);
        assertEq(t.REWARDS(), predicted);
        assertFalse(t.wired(), "nothing at the rewards address yet: not wired");
    }
}
