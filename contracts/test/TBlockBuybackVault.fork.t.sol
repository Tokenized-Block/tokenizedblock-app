// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockBuybackVault as BB} from "../src/buyback/TBlockBuybackVault.sol";

interface IVaultV2View {
    function TBLOCK() external view returns (address);
    function balance() external view returns (uint256);
    function free() external view returns (uint256);
    function reserved() external view returns (uint256);
    function DEV() external view returns (address);
    function DEV2() external view returns (address);
}

interface IERC20B { function balanceOf(address) external view returns (uint256); }

/// @dev a dest stand-in that counts the real TBLOCK (the door requires TBLOCK() == TBLOCK)
contract ForkVault {
    address public immutable TBLOCK;
    constructor(address t) { TBLOCK = t; }
}

interface IWethB { function deposit() external payable; function transfer(address, uint256) external returns (bool); }
interface IV3B {
    function token0() external view returns (address);
    function swap(address, bool, int256, uint160, bytes calldata) external returns (int256, int256);
    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool);
}

/// @dev FORK-ONLY test tool (also used by banc-buyback-vault-fork-20261112.mjs): pushes the v3 WETH/wtCOIN price in the SAME
///      direction as the buyback (WETH in), the move a sandwich front-run makes. Never deployed on mainnet.
contract V3Pusher {
    address public immutable POOL;
    address public immutable WETH9;
    constructor(address pool, address weth) { POOL = pool; WETH9 = weth; }
    function push() external payable {
        IWethB(WETH9).deposit{value: msg.value}();
        bool z = IV3B(POOL).token0() == WETH9;
        IV3B(POOL).swap(address(this), z, int256(msg.value), z ? 4295128740 : 1461446703485210103287273052203988822378723970341, "");
    }
    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        require(msg.sender == POOL);
        uint256 owed = uint256(a0 > 0 ? a0 : a1);
        IWethB(WETH9).transfer(POOL, owed);
    }
}

/// @notice FORK tests with the LIVE TBlockVaultV2 as DEST (economie-v2-pack-deploye.js, letter V), on base-anvil only
///         (TBLOCK is a B20 token: plain anvil cannot run it). Parameters = the buyback record (economie-deploiement.js).
///   FOUNDRY_BASE=true ~/.foundry/versions/base-v1.1.1/forge.exe test --match-contract TBlockBuybackVaultFork --fork-url http://127.0.0.1:<port> -vv
/// NEVER --broadcast. The guardian is impersonated on the fork only.
contract TBlockBuybackVaultForkTest is Test {
    address constant PM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOOK = 0x3e6B46810b1fd5085086Fd1417E8adB02f34a044;
    address constant V3 = 0x8495444b5f3699D223baa01E67Bf534475620aff;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant VAULT = 0x6C8075f4eA3bd37511574b47229d5242CD1eAfC0;    // pack letter V (TBlockVaultV2)
    address constant GUARDIAN = 0x264496cC303F8dbe49a241EA84cD42BE8392BC80; // pack parametres.guardian (= dev)
    address keeper = address(0xF1F1); // test keeper: the deploy-time keeper is a decision, not a fork fact
    BB bb;

    function _cfg() internal view returns (BB.Config memory c) {
        c.poolManager = PM;
        c.v4Key = BB.PoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK);
        c.v3Pool = V3; c.weth = WETH; c.wtcoin = WTCOIN; c.tblock = TBLOCK;
        c.keeper = keeper; c.publicDelay = 21600;
        c.maxPerCall = 2000000000000000; c.minSpend = 100000000000000; c.cooldown = 3600; c.twapWindow = 1800;
        c.maxV3DevTicks = 100; c.maxV4ImpactTicks = 60; c.maxHookPpm = 12000; c.tipBps = 50; c.maxTip = 20000000000000;
        c.dest = VAULT; c.guardian = GUARDIAN;
        c.veto = IVaultV2View(VAULT).DEV2(); // read on the fork: the vault's second dev key = the door's veto
    }

    function setUp() public {
        if (PM.code.length == 0 || block.chainid != 8453 || VAULT.code.length == 0) vm.skip(true);
        bb = new BB(_cfg());
        // the live v3 pool can be > MAX_V3_DEV_TICKS off its 30-min TWAP at the fork block (measured 2026-11-12, block 56526286:
        // TWAP tick 27328, tick after a 0.002 ETH buy 27208: PriceOffTwap). No trade on the fork for TWAP_WINDOW + 60 s brings
        // the TWAP to the spot, so every test starts from a calm pool; the guard itself is tested on a pushed pool below.
        vm.warp(block.timestamp + bb.TWAP_WINDOW() + 60);
        vm.deal(address(0xF00D), 1 ether);
        vm.prank(address(0xF00D));
        (bool ok,) = address(bb).call{value: 0.01 ether}("");
        assertTrue(ok);
    }

    function test_fork_live_vault_is_accepted_and_wired() public view {
        assertEq(bb.DEST(), VAULT);
        assertEq(IVaultV2View(VAULT).TBLOCK(), TBLOCK, "the live vault counts TBLOCK");
        assertEq(bb.GUARDIAN(), GUARDIAN);
        assertEq(IVaultV2View(VAULT).DEV(), GUARDIAN, "the guardian is the vault's DEV");
        assertEq(bb.VETO(), IVaultV2View(VAULT).DEV2(), "the veto is the vault's DEV2");
        assertEq(bb.destCodehash(), VAULT.codehash, "the live vault's code is pinned");
        assertEq(bb.DEST_DELAY(), 7 days);
        assertEq(bb.DEST_WINDOW(), 2 days);
    }

    /// @dev review F1 on the real vault: the guardian proposes its own sink; the vault's DEV2 (impersonated on the fork only)
    ///      cancels it; at 72 h and at 7 days nothing executes, and the next buy still pays the live vault.
    function test_fork_veto_cancels_the_guardians_sink() public {
        address sink = address(new ForkVault(TBLOCK));
        vm.prank(GUARDIAN);
        bb.proposeDest(sink);
        vm.warp(block.timestamp + 72 hours);
        vm.expectRevert();
        bb.executeDest(); // 72 h is no longer enough
        vm.prank(IVaultV2View(VAULT).DEV2());
        bb.cancelDest();
        vm.warp(block.timestamp + 7 days);
        vm.expectRevert(BB.NoProposal.selector);
        bb.executeDest();
        uint256 v0 = IERC20B(TBLOCK).balanceOf(VAULT);
        vm.prank(keeper);
        (uint256 toDest,) = bb.buyback(0.001 ether);
        assertGt(toDest, 0);
        assertEq(IERC20B(TBLOCK).balanceOf(VAULT) - v0, toDest, "still the live vault");
        assertEq(IERC20B(TBLOCK).balanceOf(sink), 0, "the sink got nothing");
    }

    /// @dev renounce on the fork: DEST frozen to the live vault; buys still pay it.
    function test_fork_renounce_freezes_the_live_vault() public {
        vm.prank(GUARDIAN);
        bb.renounceDoor();
        address nv = address(new ForkVault(TBLOCK));
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.DoorClosed.selector);
        bb.proposeDest(nv);
        uint256 v0 = IERC20B(TBLOCK).balanceOf(VAULT);
        vm.prank(keeper);
        (uint256 toDest,) = bb.buyback(0.001 ether);
        assertEq(IERC20B(TBLOCK).balanceOf(VAULT) - v0, toDest);
    }

    /// @dev review F4 on chain data: a contract that answers another token's TBLOCK() is refused by the door.
    function test_fork_vault_of_another_token_is_refused() public {
        address other = address(new ForkVault(WTCOIN));
        vm.prank(GUARDIAN);
        vm.expectRevert(BB.BadParams.selector);
        bb.proposeDest(other);
    }

    function test_fork_buy_pays_the_live_vault() public {
        uint256 bal0 = IVaultV2View(VAULT).balance();
        uint256 free0 = IVaultV2View(VAULT).free();
        uint256 res0 = IVaultV2View(VAULT).reserved();
        vm.prank(keeper);
        (uint256 toDest, uint256 fromSwap) = bb.buyback(0.002 ether);
        emit log_named_uint("TBLOCK bought for 0.002 ETH", fromSwap);
        assertGt(fromSwap, 0);
        assertEq(toDest, fromSwap, "no stray, no hook transfer to the vault");
        assertEq(IVaultV2View(VAULT).balance() - bal0, toDest, "vault balance() up by every TBLOCK bought");
        assertEq(IVaultV2View(VAULT).free() - free0, toDest, "and all of it is free (week budget material)");
        assertEq(IVaultV2View(VAULT).reserved(), res0, "nothing reserved by the inflow");
        assertEq(IERC20B(TBLOCK).balanceOf(address(bb)), 0);
    }

    function test_fork_door_then_next_buy_pays_new_dest() public {
        address nv = address(new ForkVault(TBLOCK));
        vm.prank(GUARDIAN);
        uint256 eta = bb.proposeDest(nv);
        vm.prank(keeper);
        (uint256 first,) = bb.buyback(0.001 ether); // pending: still the live vault
        assertGt(first, 0);
        uint256 vaultAfterFirst = IERC20B(TBLOCK).balanceOf(VAULT);
        vm.warp(eta); // eta = proposal + 7 days
        vm.prank(address(0xA11CE));
        bb.executeDest();
        vm.prank(keeper);
        (uint256 second,) = bb.buyback(0.001 ether);
        assertGt(second, 0);
        assertEq(IERC20B(TBLOCK).balanceOf(nv), second, "the next buy pays the new dest");
        assertEq(IERC20B(TBLOCK).balanceOf(VAULT), vaultAfterFirst, "the live vault gets nothing more");
    }

    /// @dev the price guard on the real pools: a same-direction v3 push (0.05 ETH chunks until the tick is off by more than
    ///      MAX_V3_DEV_TICKS, a front-run) right before the keeper's buy
    ///      is refused with PriceOffTwap and nothing is spent.
    function test_fork_price_guard_refuses_a_pushed_pool() public {
        V3Pusher p = new V3Pusher(V3, WETH);
        (, int24 t0,,,,,) = IV3B(V3).slot0();
        vm.deal(address(this), 10 ether);
        uint256 pushed;
        (, int24 t1,,,,,) = IV3B(V3).slot0();
        while (int256(t0) - int256(t1) <= int256(bb.MAX_V3_DEV_TICKS()) && pushed < 4 ether) {
            p.push{value: 0.05 ether}();
            pushed += 0.05 ether;
            (, t1,,,,,) = IV3B(V3).slot0();
        }
        emit log_named_uint("ETH pushed (wei)", pushed);
        emit log_named_int("v3 tick moved by the push", int256(t1) - int256(t0));
        uint256 pot = address(bb).balance;
        vm.prank(keeper);
        vm.expectPartialRevert(BB.PriceOffTwap.selector);
        bb.buyback(0.002 ether);
        assertEq(address(bb).balance, pot, "fail closed: nothing spent");
    }

    /// @dev the public path waits PUBLIC_DELAY after the keeper could have called; then anyone may buy and earns the tip.
    function test_fork_public_caller_waits_public_delay() public {
        (uint256 keeperAt, uint256 publicAt) = bb.readyAt();
        assertEq(publicAt, keeperAt + 21600);
        address pub = address(0xB0B0);
        vm.warp(publicAt - 1);
        vm.prank(pub);
        vm.expectRevert(abi.encodeWithSelector(BB.TooEarly.selector, publicAt));
        bb.buyback(0.001 ether);
        vm.warp(publicAt);
        uint256 v0 = IERC20B(TBLOCK).balanceOf(VAULT);
        vm.prank(pub);
        (uint256 toDest,) = bb.buyback(0.001 ether);
        assertGt(toDest, 0);
        assertEq(IERC20B(TBLOCK).balanceOf(VAULT) - v0, toDest);
        assertEq(pub.balance, 0.001 ether * 50 / 10_000, "public tip = 0.5 %");
    }
}
