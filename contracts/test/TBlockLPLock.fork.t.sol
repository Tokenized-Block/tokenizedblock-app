// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockLPLock, LPPoolKey} from "../src/TBlockLPLock.sol";

/// Base mainnet FORK test of TBlockLPLock against the REAL Uniswap v4 PositionManager, PoolManager, Permit2, the REAL TBLOCK/wtCOIN
/// pool and its hook, the REAL holders vault V (playOf), the REAL BlockLikesV2 (hearts) and the REAL TBlockLock (hold rule).
/// Addresses are copied from the repo, never recalled:
///   PositionManager, Permit2, StateView : etat-naissance.js (POSITION_MANAGER, PERMIT2, STATE_VIEW)
///   pool key / poolId / hook            : tblock-hold.js TBLOCK_POOL (+ tblock-buyback-deploiement.js v4Key, checksummed)
///   TBLOCK, wtCOIN, LIKES, VAULT, POOLM  : test/lockrewards/Weekly.fork.t.sol (read on chain 2026-11-13); economie-pack.js HEARTS/VAULT
///   TBlockLock                          : read on chain at run time, LIKES.LOCK()
/// Run (from contracts/), against a LOCAL base-anvil fork only:
///   base-anvil --fork-url https://mainnet.base.org --port 9561 --silent
///   FOUNDRY_BASE=true base-v1.1.1/forge.exe test --match-path test/TBlockLPLock.fork.t.sol --fork-url http://127.0.0.1:9561 -vv
/// Impersonation (vm.prank) and time moves (vm.warp, forge's in-process equivalent of evm_setNextBlockTimestamp) exist only inside
/// this local fork; nothing is signed or sent from a real wallet.

interface IERC20F {
    function balanceOf(address) external view returns (uint256);
    function transfer(address, uint256) external returns (bool);
    function approve(address, uint256) external returns (bool);
}
interface IPermit2F { function approve(address token, address spender, uint160 amount, uint48 expiration) external; }
interface IPosMF {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
    function ownerOf(uint256) external view returns (address);
    function getApproved(uint256) external view returns (address);
    function isApprovedForAll(address, address) external view returns (bool);
    function approve(address, uint256) external;
    function setApprovalForAll(address, bool) external;
    function transferFrom(address, address, uint256) external;
    function getPositionLiquidity(uint256) external view returns (uint128);
    function getPoolAndPositionInfo(uint256) external view returns (LPPoolKey memory, uint256);
}
interface IStateViewF {
    function getSlot0(bytes32 id) external view returns (uint160, int24, uint24, uint24);
    function getFeeGrowthInside(bytes32 id, int24 lo, int24 hi) external view returns (uint256, uint256);
    function getPositionInfo(bytes32 id, address owner, int24 lo, int24 hi, bytes32 salt) external view returns (uint128, uint256, uint256);
}
interface ILockF { function lock(uint256 amount, uint256 unlockAt) external; function activeLockedOf(address) external view returns (uint256); }
interface ILikesF {
    function like(address blockToken, uint256 n) external returns (uint256);
    function minHold() external view returns (uint256);
    function likePrice() external view returns (uint256);
    function LOCK() external view returns (address);
}
interface IVaultF {
    function playOf(uint256 e, address p) external view returns (uint256);
    function free() external view returns (uint256);
    function reserved() external view returns (uint256);
}
interface IR2F {
    function unassigned(address token) external view returns (uint256);
    function VAULT() external view returns (address);
    function WTCOIN() external view returns (address);
    function TBLOCK() external view returns (address);
}

struct SwapParamsF { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }
interface IPoolManagerF {
    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(LPPoolKey memory key, SwapParamsF memory params, bytes calldata hookData) external returns (int256);
    function sync(address currency) external;
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
}

/// exact-input swaps on the real pool through PoolManager.unlock; pays/takes exactly the caller delta the PoolManager returns
contract ForkSwapper {
    address public immutable POOLM;
    LPPoolKey public key;
    uint160 constant MIN_P1 = 4295128739 + 1;
    uint160 constant MAX_M1 = 1461446703485210103287273052203988822378723970342 - 1;
    constructor(address poolm, LPPoolKey memory k) { POOLM = poolm; key = k; }

    function swap(bool zeroForOne, uint256 amountIn) external returns (int128 d0, int128 d1) {
        int256 d = abi.decode(IPoolManagerF(POOLM).unlock(abi.encode(zeroForOne, amountIn)), (int256));
        d0 = int128(d >> 128); d1 = int128(d);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == POOLM, "not PoolManager");
        (bool z, uint256 a) = abi.decode(data, (bool, uint256));
        int256 d = IPoolManagerF(POOLM).swap(key, SwapParamsF(z, -int256(a), z ? MIN_P1 : MAX_M1), "");
        _net(key.currency0, int128(d >> 128));
        _net(key.currency1, int128(d));
        return abi.encode(d);
    }

    function _net(address c, int128 x) private {
        if (x < 0) {
            IPoolManagerF(POOLM).sync(c);
            require(IERC20F(c).transfer(POOLM, uint256(int256(-x))), "pay");
            IPoolManagerF(POOLM).settle();
        } else if (x > 0) {
            IPoolManagerF(POOLM).take(c, address(this), uint256(int256(x)));
        }
    }
}

contract TBlockLPLockForkTest is Test {
    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant WTCOIN = 0x5cDa0E1CA4ce2af96315f7F8963C85399c172204;
    address constant LIKES = 0xbDaa207c1C537DEe23Bc1Dc89fec9d204BB45FE1;
    address constant VAULT = 0x6C8075f4eA3bd37511574b47229d5242CD1eAfC0;
    address constant R2 = 0xC552260bb7ae266FE3b16b738eA2563f45589911; // lock-weekly-deploiement.js adresse (receipt), checksummed by cast
    address constant POOLM = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address constant POSM = 0x7C5f5A4bBd8fD63184577525326123B519429bDc;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    address constant STATE_VIEW = 0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71;
    address constant HOOK = 0x3e6B46810b1fd5085086Fd1417E8adB02f34a044;
    bytes32 constant POOL_ID = 0x6869b9016937d97dfa595eb25bc72880e821b8eb22be32bc79c623bc64ce8a3e;
    int24 constant LO = -887220;
    int24 constant HI = 887220;

    uint8 constant A_DECREASE = 0x01; uint8 constant A_MINT = 0x02; uint8 constant A_BURN = 0x03;
    uint8 constant A_SETTLE_PAIR = 0x0d; uint8 constant A_TAKE_PAIR = 0x11;
    uint8 constant A_INCREASE = 0x00; uint8 constant A_INCREASE_FD = 0x04; // v4-periphery Actions.sol (GitHub main, read 2026-11-15)

    LPPoolKey key;
    TBlockLPLock lp;
    ForkSwapper sw;
    address LOCK;
    address alice = makeAddr("alice-plays-a-lot");
    address bob = makeAddr("bob-plays-a-little");
    address carol = makeAddr("carol-never-plays");
    address operator = makeAddr("alice-operator");
    address keeper = makeAddr("anyone-harvests");
    address guardian = makeAddr("guardian");
    uint256 idA; uint256 idB; uint256 idC;
    uint256 c; // the week of the locks
    uint256 constant L_POS = 1e21;

    function setUp() public {
        key = LPPoolKey(WTCOIN, TBLOCK, 3000, 60, HOOK);
        assertEq(keccak256(abi.encode(key)), POOL_ID, "the key rebuilt from the repo hashes to the published poolId");
        LOCK = ILikesF(LIKES).LOCK();
        lp = new TBlockLPLock(POSM, key, POOL_ID, VAULT, guardian, 1e18, R2);
        sw = new ForkSwapper(POOLM, key);
        c = lp.currentEpoch();
        idA = _mintFullRange(alice, L_POS);
        idB = _mintFullRange(bob, L_POS);
        idC = _mintFullRange(carol, L_POS);
    }

    // ------------------------------------------------------------------ helpers

    function _giveTblock(address to, uint256 a) internal { vm.prank(POOLM); require(IERC20F(TBLOCK).transfer(to, a), "give TBLOCK"); }
    function _giveWt(address to, uint256 a) internal { deal(WTCOIN, to, IERC20F(WTCOIN).balanceOf(to) + a); }

    function _mintFullRange(address who, uint256 L) internal returns (uint256 id) {
        _giveWt(who, 10 ether);
        _giveTblock(who, 100_000_000 ether);
        vm.startPrank(who);
        IERC20F(WTCOIN).approve(PERMIT2, type(uint256).max);
        IERC20F(TBLOCK).approve(PERMIT2, type(uint256).max);
        IPermit2F(PERMIT2).approve(WTCOIN, POSM, type(uint160).max, uint48(block.timestamp + 400 days));
        IPermit2F(PERMIT2).approve(TBLOCK, POSM, type(uint160).max, uint48(block.timestamp + 400 days));
        uint256 w0 = IERC20F(WTCOIN).balanceOf(who); uint256 t0 = IERC20F(TBLOCK).balanceOf(who);
        id = IPosMF(POSM).nextTokenId();
        bytes[] memory p = new bytes[](2);
        p[0] = abi.encode(key, LO, HI, L, type(uint128).max, type(uint128).max, who, bytes(""));
        p[1] = abi.encode(WTCOIN, TBLOCK);
        IPosMF(POSM).modifyLiquidities(abi.encode(abi.encodePacked(A_MINT, A_SETTLE_PAIR), p), block.timestamp);
        vm.stopPrank();
        assertEq(IPosMF(POSM).ownerOf(id), who, "minted to who");
        assertEq(IPosMF(POSM).getPositionLiquidity(id), L, "liquidity minted");
        console2.log("minted tokenId / liquidity:", id, L);
        console2.log("  paid wtCOIN / TBLOCK (wei):", w0 - IERC20F(WTCOIN).balanceOf(who), t0 - IERC20F(TBLOCK).balanceOf(who));
    }

    function _lockLp(address who, uint256 id) internal {
        vm.startPrank(who);
        IPosMF(POSM).approve(address(lp), id);
        lp.lock(id, 4);
        vm.stopPrank();
    }

    function _lockTblockForHearts(address who) internal {
        uint256 need = ILikesF(LIKES).minHold();
        _giveTblock(who, need * 2 + 10_000_000 ether);
        vm.startPrank(who);
        IERC20F(TBLOCK).approve(LOCK, need * 2);
        ILockF(LOCK).lock(need * 2, block.timestamp + 60 days);
        IERC20F(TBLOCK).approve(LIKES, type(uint256).max);
        vm.stopPrank();
    }

    function _swaps(uint256 rounds, uint256 wtIn) internal {
        _giveWt(address(sw), wtIn * rounds);
        for (uint256 k; k < rounds; k++) {
            (int128 d0, int128 d1) = sw.swap(true, wtIn);             // wtCOIN -> TBLOCK
            assertEq(d0, -int128(int256(wtIn)), "exact input");
            assertGt(d1, 0, "TBLOCK out");
            (int128 e0, int128 e1) = sw.swap(false, uint256(int256(d1))); // the TBLOCK back -> wtCOIN
            assertEq(e1, -d1, "exact input back");
            assertGt(e0, 0, "wtCOIN out");
        }
    }

    function _owedFees(uint256 id) internal view returns (uint256 f0, uint256 f1) {
        (uint128 L, uint256 last0, uint256 last1) =
            IStateViewF(STATE_VIEW).getPositionInfo(POOL_ID, POSM, LO, HI, bytes32(id));
        (uint256 in0, uint256 in1) = IStateViewF(STATE_VIEW).getFeeGrowthInside(POOL_ID, LO, HI);
        unchecked { f0 = lp.mulDiv(in0 - last0, L, 1 << 128); f1 = lp.mulDiv(in1 - last1, L, 1 << 128); }
    }

    function _decrease(uint256 id, uint256 L, address to) internal {
        bytes[] memory p = new bytes[](2);
        p[0] = abi.encode(id, L, uint128(0), uint128(0), bytes(""));
        p[1] = abi.encode(WTCOIN, TBLOCK, to);
        IPosMF(POSM).modifyLiquidities(abi.encode(abi.encodePacked(A_DECREASE, A_TAKE_PAIR), p), block.timestamp);
    }

    function _burn(uint256 id, address to) internal {
        bytes[] memory p = new bytes[](2);
        p[0] = abi.encode(id, uint128(0), uint128(0), bytes(""));
        p[1] = abi.encode(WTCOIN, TBLOCK, to);
        IPosMF(POSM).modifyLiquidities(abi.encode(abi.encodePacked(A_BURN, A_TAKE_PAIR), p), block.timestamp);
    }

    /// INCREASE_LIQUIDITY (0x00) + SETTLE_PAIR, or INCREASE_LIQUIDITY_FROM_DELTAS (0x04) + SETTLE_PAIR, as `who`; returns revert data
    function _tryIncrease(address who, uint256 id, bool fromDeltas) internal returns (bool ok, bytes memory err) {
        bytes[] memory p = new bytes[](2);
        p[0] = fromDeltas
            ? abi.encode(id, type(uint128).max, type(uint128).max, bytes(""))
            : abi.encode(id, uint256(1), type(uint128).max, type(uint128).max, bytes(""));
        p[1] = abi.encode(WTCOIN, TBLOCK);
        bytes memory data = abi.encode(abi.encodePacked(fromDeltas ? A_INCREASE_FD : A_INCREASE, A_SETTLE_PAIR), p);
        vm.prank(who);
        try IPosMF(POSM).modifyLiquidities(data, block.timestamp) { ok = true; } catch (bytes memory r) { err = r; }
    }

    // ------------------------------------------------------------------ tests

    /// review finding: fees owed BEFORE the lock used to be harvested into a week where the locker had no weight.
    /// Now lock() pays them to the locker (exactly the StateView owed amount), and harvest() skips the position during its lock week.
    function test_fork_lock_paysPreLockFeesToLocker() public {
        _swaps(3, 1 ether); // fees accrue on A, B, C before any lock
        (uint256 o0, uint256 o1) = _owedFees(idA);
        assertGt(o0 + o1, 0, "A owes fees before the lock");
        uint256 aw = IERC20F(WTCOIN).balanceOf(alice); uint256 at_ = IERC20F(TBLOCK).balanceOf(alice);
        _lockLp(alice, idA);
        assertEq(IERC20F(WTCOIN).balanceOf(alice) - aw, o0, "pre-lock wtCOIN fees paid to the locker, exactly");
        assertEq(IERC20F(TBLOCK).balanceOf(alice) - at_, o1, "pre-lock B20 TBLOCK fees paid to the locker, exactly");
        assertEq(IERC20F(WTCOIN).balanceOf(address(lp)) + IERC20F(TBLOCK).balanceOf(address(lp)), 0, "the lock kept nothing");
        (uint256 z0, uint256 z1) = _owedFees(idA); assertEq(z0 + z1, 0, "nothing owed after lock");
        console2.log("pre-lock fees paid to alice in lock() wtCOIN / TBLOCK:", o0, o1);

        _swaps(2, 1 ether); // fees earned during the lock week c
        (uint256 w0, uint256 w1) = _owedFees(idA);
        assertGt(w0 + w1, 0);
        uint256[] memory one = new uint256[](1); one[0] = idA;
        vm.prank(keeper); lp.harvest(one);
        (uint256 p0c, uint256 p1c) = lp.pot(c);
        assertEq(p0c + p1c, 0, "pot of the lock week did not grow");
        (uint256 s0, uint256 s1) = _owedFees(idA);
        assertEq(s0, w0); assertEq(s1, w1);
        vm.warp(lp.epochStart(c + 1));
        vm.prank(keeper); lp.harvest(one);
        (uint256 q0, uint256 q1) = lp.pot(c + 1);
        assertEq(q0, w0, "lock-week fees land in week c+1, where alice has weight");
        assertEq(q1, w1);
    }

    function test_fork_wiring() public view {
        assertEq(address(lp.PM()), POSM);
        assertEq(lp.TBLOCK(), TBLOCK, "V.TBLOCK()");
        assertEq(lp.WTCOIN(), WTCOIN);
        assertEq(lp.EPOCH(), 7 days, "V.LIKES().EPOCH()");
        (uint160 sp, int24 tick,,) = IStateViewF(STATE_VIEW).getSlot0(POOL_ID);
        console2.log("fork block / week c / T0:", block.number, c, lp.T0());
        console2.log("pool sqrtPriceX96:", uint256(sp));
        console2.log("pool tick (abs, negative?):", uint256(int256(tick < 0 ? -tick : tick)), tick < 0);
        console2.log("LIKES.LOCK() read on chain:", LOCK);
    }

    /// the previous owner, its single-token approval and its operator lose every control over the locked NFT
    function test_fork_lockedNft_previousOwnerApprovedOperatorCannotTouchIt() public {
        vm.startPrank(alice);
        IPosMF(POSM).setApprovalForAll(operator, true);
        IPosMF(POSM).approve(address(lp), idA);
        lp.lock(idA, 4);
        vm.stopPrank();
        assertEq(IPosMF(POSM).ownerOf(idA), address(lp), "the lock holds the NFT");
        assertEq(IPosMF(POSM).getApproved(idA), address(0), "single-token approval cleared by the transfer");
        assertFalse(IPosMF(POSM).isApprovedForAll(address(lp), operator), "alice's operator is not an operator of the lock");
        assertFalse(IPosMF(POSM).isApprovedForAll(address(lp), alice));

        _swaps(2, 1 ether); // the locked NFT now owes fees: an increase would credit them to its caller
        (uint256 owed0, uint256 owed1) = _owedFees(idA);
        assertGt(owed0 + owed1, 0);
        address[3] memory who = [alice, operator, bob];
        for (uint256 k; k < 3; k++) {
            (bool ok, bytes memory err) = _tryIncrease(who[k], idA, false);
            assertFalse(ok, "INCREASE_LIQUIDITY refused");
            assertEq(err, abi.encodeWithSignature("NotApproved(address)", who[k]), "INCREASE: NotApproved(caller)");
            (ok, err) = _tryIncrease(who[k], idA, true);
            assertFalse(ok, "INCREASE_LIQUIDITY_FROM_DELTAS refused");
            bool notApproved = keccak256(err) == keccak256(abi.encodeWithSignature("NotApproved(address)", who[k]));
            bool unsupported = keccak256(err) == keccak256(abi.encodeWithSignature("UnsupportedAction(uint256)", uint256(4)));
            assertTrue(notApproved || unsupported, "FROM_DELTAS: NotApproved(caller) or not supported by the deployed PM");
            if (k == 0) console2.log("INCREASE_FROM_DELTAS on the deployed PM: NotApproved?", notApproved);
            vm.prank(who[k]);
            vm.expectRevert(abi.encodeWithSignature("NotApproved(address)", who[k]));
            _decrease(idA, L_POS, who[k]);
            vm.prank(who[k]);
            vm.expectRevert(abi.encodeWithSignature("NotApproved(address)", who[k]));
            _burn(idA, who[k]);
            vm.prank(who[k]);
            vm.expectRevert(abi.encodeWithSignature("NotApproved(address)", who[k]));
            _decrease(idA, 0, who[k]); // not even a fee collect
        }
        vm.prank(alice);
        vm.expectRevert(); // solmate ERC721: WRONG_FROM / NOT_AUTHORIZED
        IPosMF(POSM).transferFrom(address(lp), alice, idA);
        vm.prank(operator);
        vm.expectRevert();
        IPosMF(POSM).transferFrom(address(lp), operator, idA);
        assertEq(IPosMF(POSM).getPositionLiquidity(idA), L_POS, "liquidity untouched");
        assertEq(IPosMF(POSM).ownerOf(idA), address(lp));
        (uint256 after0, uint256 after1) = _owedFees(idA);
        assertEq(after0, owed0, "owed wtCOIN fees unchanged by the refused calls");
        assertEq(after1, owed1, "owed TBLOCK fees unchanged by the refused calls");
        uint256 at = lp.unlockAtOf(idA); // read BEFORE the prank: a view call would consume it
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillLocked.selector, at));
        lp.unlock(idA);
        console2.log("NotApproved for alice / operator / bob on DECREASE(L), DECREASE(0), BURN; transferFrom refused");
    }

    // full flow state (storage, to keep the stack small)
    uint256 e; uint256 playA; uint256 playB; uint256 infoA0; uint256 p0; uint256 p1; uint256 hw; uint256 ht;

    // second played week (c+3): alice is paid by her unlock, bob never claims and the week is swept to the holders
    uint256 e2; uint256 q0; uint256 q1; uint256 wA2; uint256 wB2; uint256 ua0; uint256 ua1;

    function test_fork_fullFlow_lock_play_harvest_mark_claim_unlock() public {
        assertEq(lp.REWARDS(), R2);
        assertEq(IR2F(R2).VAULT(), VAULT, "the real R2 names the real V");
        _phaseLockAndPlay();
        _phaseSwapAndHarvest();
        _phaseMarkAndClaim();
        _phaseSecondWeek();
        _phaseUnlock();
        _phaseSweep();
    }

    function _phaseSecondWeek() internal {
        e2 = c + 3;
        vm.warp(lp.epochStart(e2) + 1 hours);
        vm.prank(alice); ILikesF(LIKES).like(TBLOCK, 2);
        vm.prank(bob); ILikesF(LIKES).like(TBLOCK, 1);
        uint256 pa = IVaultF(VAULT).playOf(e2, alice);
        uint256 pb = IVaultF(VAULT).playOf(e2, bob);
        assertGt(pa, 0); assertGt(pb, 0);
        _swaps(2, 1 ether);
        uint256[] memory ids = new uint256[](3); ids[0] = idA; ids[1] = idB; ids[2] = idC;
        vm.prank(keeper); lp.harvest(ids);
        _giveWt(keeper, 0.01 ether);
        vm.startPrank(keeper); IERC20F(WTCOIN).approve(address(lp), 0.01 ether); lp.deposit(WTCOIN, 0.01 ether); vm.stopPrank();
        (q0, q1) = lp.pot(e2);
        assertGt(q0, 0.01 ether - 1); assertGt(q1, 0);
        vm.warp(lp.epochEnd(e2));
        lp.markWeek(e2, alice); lp.markWeek(e2, bob);
        wA2 = lp.weightOf(e2, alice); wB2 = lp.weightOf(e2, bob);
        assertEq(wA2, lp.sqrt(L_POS) * pa); assertEq(wB2, lp.sqrt(L_POS) * pb);
        console2.log("week e2 / pot wtCOIN / TBLOCK:", e2, q0, q1);
    }

    /// the lock has ended but the contract still holds the NFT: harvest SKIPS it, its fees stay in the position for the locker
    function _checkEndedLockNotHarvested() internal returns (uint256 h0, uint256 h1) {
        (h0, h1) = _owedFees(idA);
        assertGt(h0 + h1, 0, "fees earned during the lock are owed");
        uint256 ce = lp.currentEpoch();
        (uint256 pb0, uint256 pb1) = lp.pot(ce);
        uint256[] memory one = new uint256[](1); one[0] = idA;
        vm.prank(keeper); lp.harvest(one);
        (uint256 pa0, uint256 pa1) = lp.pot(ce);
        assertEq(pa0, pb0, "ended-but-held position NOT harvested (wtCOIN)");
        assertEq(pa1, pb1, "ended-but-held position NOT harvested (TBLOCK)");
        (uint256 k0, uint256 k1) = _owedFees(idA);
        assertEq(k0, h0, "still owed to the position (wtCOIN)");
        assertEq(k1, h1, "still owed to the position (TBLOCK)");
        console2.log("left in the ended lock at unlockAt wtCOIN / TBLOCK:", h0, h1);
    }

    function _unlockAliceAndCheckPay() internal {
        (ua0, ua1) = lp.claimable(alice, e2);
        assertEq(ua0, lp.mulDiv(q0, wA2, wA2 + wB2)); assertEq(ua1, lp.mulDiv(q1, wA2, wA2 + wB2));
        assertGt(ua0, 0); assertGt(ua1, 0);
        assertFalse(lp.claimed(e2, alice));
        uint256 bw0 = IERC20F(WTCOIN).balanceOf(alice); uint256 bt0 = IERC20F(TBLOCK).balanceOf(alice);
        vm.prank(alice); lp.unlock(idA);
        assertEq(IERC20F(WTCOIN).balanceOf(alice) - bw0, ua0, "unlock paid alice's week e2 wtCOIN in the same tx");
        assertEq(IERC20F(TBLOCK).balanceOf(alice) - bt0, ua1, "unlock paid alice's week e2 B20 TBLOCK in the same tx");
        assertTrue(lp.claimed(e2, alice));
        console2.log("unlock paid alice week e2 wtCOIN / TBLOCK:", ua0, ua1);
    }

    function _phaseSweep() internal {
        uint256 opens = lp.sweepOpensAt(e2);
        assertEq(opens, lp.epochEnd(e2) + 6 days + 12 weeks);
        vm.warp(opens - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.SweepNotOpen.selector, opens)); lp.sweep(e2);
        vm.warp(opens);
        // bob and carol still hold their NFTs here: no week they covered can be swept yet
        assertEq(lp.positionsIn(e2), 2);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillHeld.selector, e2)); lp.sweep(e2);
        uint256 bw = IERC20F(WTCOIN).balanceOf(bob); uint256 bt = IERC20F(TBLOCK).balanceOf(bob);
        vm.prank(bob); lp.unlockOnly(idB); // bob takes his NFT back unpaid: his week e2 part stays unclaimed
        assertEq(IPosMF(POSM).ownerOf(idB), bob);
        assertEq(IERC20F(WTCOIN).balanceOf(bob), bw, "unlockOnly moved no wtCOIN");
        assertEq(IERC20F(TBLOCK).balanceOf(bob), bt, "unlockOnly moved no TBLOCK");
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillHeld.selector, e2)); lp.sweep(e2);
        vm.prank(carol); lp.unlock(idC); // carol has no weight: nothing paid
        assertEq(IPosMF(POSM).ownerOf(idC), carol);
        assertEq(lp.positionsIn(e2), 0);
        (uint256 u0, uint256 u1) = lp.unclaimed(e2);
        assertEq(u0, q0 - ua0, "unclaimed wtCOIN = pot - alice's unlock payment (bob's part + dust)");
        assertEq(u1, q1 - ua1, "unclaimed TBLOCK = pot - alice's unlock payment");
        assertGe(u0, lp.mulDiv(q0, wB2, wA2 + wB2)); assertGe(u1, lp.mulDiv(q1, wB2, wA2 + wB2));
        uint256 vBal = IERC20F(TBLOCK).balanceOf(VAULT); uint256 vFree = IVaultF(VAULT).free(); uint256 vRes = IVaultF(VAULT).reserved();
        uint256 rBal = IERC20F(WTCOIN).balanceOf(R2); uint256 rUn = IR2F(R2).unassigned(WTCOIN);
        uint256 lw = IERC20F(WTCOIN).balanceOf(address(lp)); uint256 lt = IERC20F(TBLOCK).balanceOf(address(lp));
        vm.prank(keeper); (uint256 s0, uint256 s1) = lp.sweep(e2);
        assertEq(s0, u0); assertEq(s1, u1);
        assertEq(IERC20F(TBLOCK).balanceOf(VAULT) - vBal, u1, "REAL V: TBLOCK balance up by the exact unclaimed amount");
        assertEq(IVaultF(VAULT).reserved(), vRes, "V's reserved budgets untouched");
        assertEq(IVaultF(VAULT).free() - vFree, u1, "REAL V: free budget up by the exact amount");
        assertEq(IERC20F(WTCOIN).balanceOf(R2) - rBal, u0, "REAL R2: wtCOIN balance up by the exact amount");
        assertEq(IR2F(R2).unassigned(WTCOIN) - rUn, u0, "REAL R2: unassigned(wtCOIN) up by the exact amount");
        assertEq(lw - IERC20F(WTCOIN).balanceOf(address(lp)), u0); assertEq(lt - IERC20F(TBLOCK).balanceOf(address(lp)), u1);
        assertTrue(lp.swept(e2));
        vm.prank(bob); vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.AlreadySwept.selector, e2)); lp.claim(e2);
        console2.log("swept e2 to R2 wtCOIN / to V TBLOCK:", u0, u1);
        // week e: both claimed; only the rounding dust is left
        vm.warp(lp.sweepOpensAt(e));
        (uint256 d0, uint256 d1) = lp.unclaimed(e);
        console2.log("week e dust wtCOIN / TBLOCK:", d0, d1);
        if (d0 + d1 == 0) {
            vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NothingToSweep.selector, e)); lp.sweep(e);
        } else {
            vBal = IERC20F(TBLOCK).balanceOf(VAULT); rBal = IERC20F(WTCOIN).balanceOf(R2);
            lp.sweep(e);
            assertEq(IERC20F(TBLOCK).balanceOf(VAULT) - vBal, d1, "dust TBLOCK to V");
            assertEq(IERC20F(WTCOIN).balanceOf(R2) - rBal, d0, "dust wtCOIN to R2");
        }
        (uint256 r0, uint256 r1) = lp.reserved();
        console2.log("reserved left wtCOIN / TBLOCK (pots of later weeks):", r0, r1);
    }

    function _phaseLockAndPlay() internal {
        (, infoA0) = IPosMF(POSM).getPoolAndPositionInfo(idA);
        _lockLp(alice, idA); _lockLp(bob, idB); _lockLp(carol, idC);
        (address lk, uint128 lq, uint64 s, uint64 en) = lp.positionOf(idA);
        assertEq(lk, alice); assertEq(lq, L_POS); assertEq(s, c + 1, "weight starts next week"); assertEq(en, c + 5);
        assertEq(lp.lockedLiquidityIn(alice, c), 0); assertEq(lp.lockedLiquidityIn(alice, c + 1), L_POS);
        console2.log("locked A/B/C in week c, unlockAt:", lp.unlockAtOf(idA));

        _lockTblockForHearts(alice); _lockTblockForHearts(bob); _lockTblockForHearts(carol);
        console2.log("TBlockLock activeLockedOf(alice) / minHold:", ILockF(LOCK).activeLockedOf(alice), ILikesF(LIKES).minHold());

        e = c + 1;
        vm.warp(lp.epochStart(e) + 1 hours);
        vm.prank(alice); uint256 burnA = ILikesF(LIKES).like(TBLOCK, 3);
        vm.prank(bob); uint256 burnB = ILikesF(LIKES).like(TBLOCK, 1);
        playA = IVaultF(VAULT).playOf(e, alice);
        playB = IVaultF(VAULT).playOf(e, bob);
        assertEq(playA, burnA, "V.playOf = hearts burned (alice)"); assertEq(playB, burnB, "(bob)");
        assertEq(IVaultF(VAULT).playOf(e, carol), 0);
        console2.log("week e / playOf alice / bob:", e, playA, playB);
    }

    function _owedSum() internal view returns (uint256 s0, uint256 s1) {
        uint256[3] memory ids = [idA, idB, idC];
        for (uint256 k; k < 3; k++) { (uint256 f0, uint256 f1) = _owedFees(ids[k]); s0 += f0; s1 += f1; }
    }

    function _phaseSwapAndHarvest() internal {
        _swaps(4, 1 ether);
        (uint256 fa0, uint256 fa1) = _owedFees(idA);
        assertGt(fa0 + fa1, 0, "the swaps earned fees for A");
        console2.log("fees owed to A (StateView) wtCOIN / TBLOCK:", fa0, fa1);
        (uint256 s0, uint256 s1) = _owedSum();

        address[3] memory ppl = [alice, bob, carol];
        uint256[3] memory bw; uint256[3] memory bt;
        for (uint256 k; k < 3; k++) { bw[k] = IERC20F(WTCOIN).balanceOf(ppl[k]); bt[k] = IERC20F(TBLOCK).balanceOf(ppl[k]); }
        uint256 lw0 = IERC20F(WTCOIN).balanceOf(address(lp)); uint256 lt0 = IERC20F(TBLOCK).balanceOf(address(lp));
        uint256[] memory ids = new uint256[](3); ids[0] = idA; ids[1] = idB; ids[2] = idC;
        vm.prank(keeper); lp.harvest(ids);
        hw = IERC20F(WTCOIN).balanceOf(address(lp)) - lw0;
        ht = IERC20F(TBLOCK).balanceOf(address(lp)) - lt0;
        assertEq(hw, s0, "harvest = the exact owed wtCOIN fees (the hook took nothing on a 0-liquidity decrease)");
        assertEq(ht, s1, "harvest = the exact owed TBLOCK fees");
        for (uint256 k; k < 3; k++) {
            assertEq(IERC20F(WTCOIN).balanceOf(ppl[k]), bw[k], "harvest pays the contract, not the locker (wtCOIN)");
            assertEq(IERC20F(TBLOCK).balanceOf(ppl[k]), bt[k], "harvest pays the contract, not the locker (TBLOCK)");
        }
        assertEq(IERC20F(WTCOIN).balanceOf(keeper), 0); assertEq(IERC20F(TBLOCK).balanceOf(keeper), 0);
        (p0, p1) = lp.pot(e);
        assertEq(p0, hw); assertEq(p1, ht);
        assertEq(IPosMF(POSM).getPositionLiquidity(idA), L_POS, "harvest leaves the principal");
        (uint256 z0, uint256 z1) = _owedSum(); assertEq(z0 + z1, 0, "nothing left owed after harvest");
        console2.log("harvested into pot e, wtCOIN / TBLOCK:", hw, ht);

        _giveTblock(keeper, 1_000 ether);
        vm.startPrank(keeper); IERC20F(TBLOCK).approve(address(lp), 1_000 ether); lp.deposit(TBLOCK, 1_000 ether); vm.stopPrank();
        (p0, p1) = lp.pot(e);
        assertEq(p1, ht + 1_000 ether, "B20 deposit arrived in full in pot e");
    }

    function _phaseMarkAndClaim() internal {
        vm.warp(lp.epochEnd(e));
        lp.markWeek(e, alice); lp.markWeek(e, bob);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NoWeight.selector, e)); lp.markWeek(e, carol);
        assertEq(lp.weightOf(e, alice), lp.sqrt(L_POS) * playA); assertEq(lp.weightOf(e, bob), lp.sqrt(L_POS) * playB);
        uint256 W = lp.totalWeight(e);
        vm.warp(lp.epochEnd(e) + lp.MARK_GRACE());
        uint256 aw0 = IERC20F(WTCOIN).balanceOf(alice); uint256 at0 = IERC20F(TBLOCK).balanceOf(alice);
        vm.prank(alice); (uint256 ca0, uint256 ca1) = lp.claim(e);
        assertEq(IERC20F(WTCOIN).balanceOf(alice) - aw0, ca0, "real wtCOIN arrived");
        assertEq(IERC20F(TBLOCK).balanceOf(alice) - at0, ca1, "real B20 TBLOCK arrived");
        vm.prank(bob); (uint256 cb0, uint256 cb1) = lp.claim(e);
        assertEq(ca0, lp.mulDiv(p0, lp.sqrt(L_POS) * playA, W)); assertEq(ca1, lp.mulDiv(p1, lp.sqrt(L_POS) * playA, W));
        assertEq(cb0, lp.mulDiv(p0, lp.sqrt(L_POS) * playB, W)); assertEq(cb1, lp.mulDiv(p1, lp.sqrt(L_POS) * playB, W));
        assertGt(ca1, cb1, "more play, more reward");
        assertLe(ca0 + cb0, p0); assertLe(ca1 + cb1, p1);
        vm.prank(carol); vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NoWeight.selector, e)); lp.claim(e);
        console2.log("claim alice wtCOIN / TBLOCK:", ca0, ca1);
        console2.log("claim bob   wtCOIN / TBLOCK:", cb0, cb1);
        (uint256 r0, uint256 r1) = lp.reserved();
        console2.log("dust left reserved wtCOIN / TBLOCK:", r0, r1);
    }

    function _phaseUnlock() internal {
        vm.warp(lp.epochStart(c + 4) + 1 hours);
        _swaps(2, 1 ether); // trading during the lock, NOT harvested: those fees must leave with the NFT
        uint256 at = lp.unlockAtOf(idA);
        vm.warp(at - 1);
        vm.prank(alice); vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillLocked.selector, at)); lp.unlock(idA);
        vm.warp(at);
        (uint256 h0, uint256 h1) = _checkEndedLockNotHarvested();
        _swaps(1, 1 ether); // more fees after the lock ended: they leave with the NFT too
        (uint256 u0, uint256 u1) = _owedFees(idA);
        assertGt(u0 + u1, 0, "fees since the last harvest are in the position");
        assertGe(u0, h0); assertGe(u1, h1); // the skipped fees of the ended lock are among them
        vm.prank(bob); vm.expectRevert(TBlockLPLock.NotLocker.selector); lp.unlock(idA);
        _unlockAliceAndCheckPay();
        assertEq(IPosMF(POSM).ownerOf(idA), alice, "the NFT is back with its locker");
        assertEq(IPosMF(POSM).getPositionLiquidity(idA), L_POS, "liquidity unchanged");
        (, uint256 infoA1) = IPosMF(POSM).getPoolAndPositionInfo(idA);
        assertEq(infoA1, infoA0, "position info (pool, ticks, subscriber) unchanged");
        uint256 aw1 = IERC20F(WTCOIN).balanceOf(alice); uint256 at1 = IERC20F(TBLOCK).balanceOf(alice);
        vm.prank(alice); _decrease(idA, 0, alice); // alice collects the fees that went with the NFT
        assertEq(IERC20F(WTCOIN).balanceOf(alice) - aw1, u0, "the unharvested wtCOIN fees went with the NFT");
        assertEq(IERC20F(TBLOCK).balanceOf(alice) - at1, u1, "the unharvested TBLOCK fees went with the NFT");
        console2.log("unlocked at / fees collected by alice after unlock wtCOIN / TBLOCK:", at, u0, u1);
        vm.prank(alice); _decrease(idA, L_POS, alice); // and the principal is fully hers again
        assertEq(IPosMF(POSM).getPositionLiquidity(idA), 0);
    }
}
