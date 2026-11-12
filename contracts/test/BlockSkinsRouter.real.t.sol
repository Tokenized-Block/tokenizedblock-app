// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TblockPayRouter} from "../src/TblockPayRouter.sol";
import {BlockSkinsRouter} from "../src/BlockSkins1.sol";
import {MockERC20, MockAeroPool, MockPoolManager, MockVault} from "./payrouter/Mocks.sol";
import {TBlockLock} from "../src/TBlockLock.sol";

/// @dev review F1 (2026-11-12): the payrouter suite's vault plus the two views the live holders vault answers and the constructor now
///      requires: ROUTER() (the router its games name) and free()
contract HoldersVaultMockSR is MockVault {
    address public immutable ROUTER;

    constructor(address t, address r) MockVault(t) {
        ROUTER = r;
    }

    function free() external view returns (uint256) {
        return MockERC20(TBLOCK).balanceOf(address(this));
    }
}

/// @dev the 1 USDC skin through the REAL TblockPayRouter source (its guards, floors and balance checks), on the payrouter suite's
///      mock pools (fixed rates). The real pools are not here: see the fork test of the router for those.
contract BlockSkinsRouterRealRouterTest is Test {
    MockERC20 usdc;
    MockERC20 wt;
    MockERC20 tb;
    MockAeroPool aero;
    MockPoolManager pm;
    TblockPayRouter router;
    MockVault vault;
    BlockSkinsRouter skins;
    address constant FEE = address(0xFEE5);
    address constant BLOC = address(0xb200000000000000000000e4B0c5fBE9C8DF579E);
    address payer = address(0xBEEF);
    uint256 constant WPU = 7_456_585_217; // the mock Aerodrome rate (payrouter/Mocks.sol), wtCOIN wei per USDC unit
    uint64 recette;

    function setUp() public {
        vm.warp(1_794_397_085);
        usdc = new MockERC20("USD Coin", 6);
        wt = new MockERC20("wtCOIN", 18);
        tb = new MockERC20("TBLOCK", 18);
        aero = new MockAeroPool(address(wt), address(usdc));
        pm = new MockPoolManager(address(wt), address(tb));
        TblockPayRouter.PoolKey memory k = TblockPayRouter.PoolKey(address(wt), address(tb), 3000, 60, address(uint160(0x2044)));
        TblockPayRouter.Config memory c = TblockPayRouter.Config({usdc: address(usdc), wtcoin: address(wt), tblock: address(tb),
            aeroPool: address(aero), poolManager: address(pm), v4Key: k, v4PoolId: keccak256(abi.encode(k)), maxUsdcPerPay: 50_000_000,
            maxV4ImpactTicks: 300, maxHookPpm: 12_000, minOutBudgetPpm: 250_000, maxAeroImpactBps: 100, maxAeroFeePpm: 50_000});
        pm.setSlot(keccak256(abi.encode(c.v4PoolId, uint256(6))));
        router = new TblockPayRouter(c);
        vault = new HoldersVaultMockSR(address(tb), address(router));
        skins = new BlockSkinsRouter(address(router), FEE, address(vault), address(tb), address(usdc));
        usdc.mint(payer, 100_000_000);
        vm.prank(payer);
        usdc.approve(address(router), type(uint256).max);
        recette = skins.packRecipe([uint16(210), 267, 263, 92, 120, 300, 200]);
    }

    function _pay(uint256 amount, uint256 minOut) internal returns (uint256) {
        vm.prank(payer);
        return router.pay(address(skins), amount, minOut, block.timestamp, abi.encode(BLOC, recette));
    }

    /// @dev 1 USDC: 0.10 USDC to the fee wallet, 0.90 USDC bought as TBLOCK, all of it in the vault, nothing kept, no play recorded
    function test_real_mint_1_usdc_fee_wallet_and_vault() public {
        uint256 floor = router.minOutFloor(900_000);
        assertGt(floor, 0);
        uint256 out = _pay(1_000_000, floor);
        assertEq(usdc.balanceOf(payer), 100_000_000 - 1_000_000, "payer paid exactly 1 USDC");
        assertEq(usdc.balanceOf(FEE), 100_000, "fee wallet: 0.10 USDC");
        uint256 expected = (900_000 * WPU) * 25_000_000 * (1e6 - 13_000) / 1e6;
        assertEq(out, expected, "TBLOCK bought with 0.90 USDC (mock rates)");
        assertGe(out, floor);
        assertEq(tb.balanceOf(address(vault)), out, "every TBLOCK in the vault");
        assertEq(tb.balanceOf(address(skins)) + usdc.balanceOf(address(skins)), 0, "the skins contract keeps nothing");
        assertEq(usdc.balanceOf(address(router)) + wt.balanceOf(address(router)) + tb.balanceOf(address(router)), 0, "router keeps nothing");
        assertEq(skins.ownerOf(1), payer);
        assertEq(vault.count(), 0, "no play recorded in the vault");
    }

    function test_real_old_price_and_other_amounts_refused() public {
        vm.expectRevert(TblockPayRouter.PriceMismatch.selector);
        _pay(10_000_000, 1);
        vm.expectRevert(TblockPayRouter.PriceMismatch.selector);
        _pay(999_999, 1);
        assertEq(skins.totalSupply(), 0);
        assertEq(usdc.balanceOf(payer), 100_000_000);
    }

    function test_real_minOut_under_the_router_floor_refused() public {
        uint256 floor = router.minOutFloor(900_000);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.MinOutTooLow.selector, floor - 1, floor));
        _pay(1_000_000, floor - 1);
        assertEq(skins.totalSupply(), 0);
    }

    /// @dev the vault lists this game nowhere (its list is fixed): the mint still passes, the TBLOCK still reaches it
    function test_real_unlisted_vault_does_not_block() public {
        vault.setUnlisted(true);
        uint256 out = _pay(1_000_000, router.minOutFloor(900_000));
        assertEq(tb.balanceOf(address(vault)), out);
        assertEq(vault.count(), 0);
    }

    /// @dev a router guard that fails (an Aerodrome fee above the cap) reverts the whole mint: nothing moves
    function test_real_router_guard_reverts_whole_mint() public {
        aero.setFee(50_001);
        vm.expectRevert(abi.encodeWithSelector(TblockPayRouter.AeroFeeTooHigh.selector, uint256(50_001)));
        _pay(1_000_000, 1e30);
        assertEq(usdc.balanceOf(FEE), 0);
        assertEq(skins.totalSupply(), 0);
    }

    function test_real_constructor_dest_must_hold_the_router_tblock() public {
        MockVault other = new MockVault(address(wt));
        vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
        new BlockSkinsRouter(address(router), FEE, address(other), address(tb), address(usdc));
        (address dev, uint16 bps) = skins.USDC_SPLIT();
        assertEq(dev, FEE);
        assertEq(bps, 1000);
        assertEq(skins.ROUTER(), address(router));
        assertEq(skins.TBLOCK(), address(tb));
        assertEq(skins.USDC(), address(usdc));
    }

    /// @dev review F1: with the real router, DEST must be the holders vault. The payrouter vault (TBLOCK() only), the real lock, and
    ///      a vault naming another router are refused.
    function test_real_constructor_dest_must_be_the_holders_vault() public {
        address[3] memory bad = [
            address(new MockVault(address(tb))),
            address(new TBlockLock(address(tb))),
            address(new HoldersVaultMockSR(address(tb), address(0xBAD)))
        ];
        for (uint256 i; i < bad.length; i++) {
            vm.expectRevert(BlockSkinsRouter.BadAddress.selector);
            new BlockSkinsRouter(address(router), FEE, bad[i], address(tb), address(usdc));
        }
        assertEq(skins.DEST(), address(vault));
    }
}
