// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TBlockLPLock, LPPoolKey} from "../src/TBlockLPLock.sol";

// ==================================================================== mocks

contract LPToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) public virtual returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        uint256 al = allowance[f][msg.sender];
        require(al >= a, "allowance");
        if (al != type(uint256).max) allowance[f][msg.sender] = al - a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev on transfer FROM the target, tries to re-enter claim(epoch) and records the outcome
contract ReentrantToken is LPToken {
    address public target;
    uint256 public epoch;
    bool public tried;
    bool public reentered;
    bytes public reason;
    function arm(address t, uint256 e) external { target = t; epoch = e; }
    function transfer(address to, uint256 a) public override returns (bool) {
        super.transfer(to, a);
        if (msg.sender == target && target != address(0) && !tried) {
            tried = true;
            try TBlockLPLock(target).claim(epoch) { reentered = true; } catch (bytes memory r) { reason = r; }
        }
        return true;
    }
}

/// @dev a reward token that can start refusing every transfer() (a pause or blocklist added by an upgrade of a proxy token)
contract PausableToken is LPToken {
    bool public paused;
    function setPaused(bool p) external { paused = p; }
    function transfer(address to, uint256 a) public override returns (bool) {
        require(!paused, "paused");
        return super.transfer(to, a);
    }
}

contract MockLikes {
    uint64 public GENESIS;
    uint64 public EPOCH = 7 days;
    constructor(uint64 g) { GENESIS = g; }
}

contract MockVault {
    address public TBLOCK;
    address public LIKES;
    mapping(uint256 => mapping(address => uint256)) public playOf;
    constructor(address t, address l) { TBLOCK = t; LIKES = l; }
    function setPlay(uint256 e, address a, uint256 v) external { playOf[e][a] = v; }
}

/// @dev R2's deposit surface: pulls `amount` by transferFrom from msg.sender (like TBlockLockRewardsWeekly.deposit) and records it
contract MockR2 {
    address public TBLOCK;
    address public WTCOIN;
    address public VAULT;
    struct Dep { address from; address token; uint256 amount; }
    Dep[] public deps;
    bool public fail;
    constructor(address t, address w, address v) { TBLOCK = t; WTCOIN = w; VAULT = v; }
    function setFail(bool f) external { fail = f; }
    function deposit(address token, uint256 amount) external {
        require(!fail, "r2 refuses");
        require(token == TBLOCK || token == WTCOIN, "token");
        require(LPToken(token).transferFrom(msg.sender, address(this), amount), "pull");
        deps.push(Dep(msg.sender, token, amount));
    }
    function depCount() external view returns (uint256) { return deps.length; }
}

interface IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4);
}

contract MockPM {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public getApproved;
    mapping(uint256 => LPPoolKey) internal _key;
    mapping(uint256 => uint256) internal _info;
    mapping(uint256 => uint128) public getPositionLiquidity;
    mapping(uint256 => uint256[2]) public pendingFees; // fees owed to the position, paid from this mock's balance on collect
    uint256 public nextId = 1;
    uint256 public collects;

    function mint(address to, LPPoolKey memory key, int24 lo, int24 hi, uint128 L) external returns (uint256 id) {
        id = nextId++;
        ownerOf[id] = to;
        _key[id] = key;
        _info[id] = (uint256(uint24(hi)) << 32) | (uint256(uint24(lo)) << 8);
        getPositionLiquidity[id] = L;
    }
    function setFees(uint256 id, uint256 f0, uint256 f1) external { pendingFees[id] = [f0, f1]; }
    function setSubscriberBit(uint256 id) external { _info[id] |= 1; }
    function approve(address s, uint256 id) external { require(ownerOf[id] == msg.sender, "owner"); getApproved[id] = s; }
    function getPoolAndPositionInfo(uint256 id) external view returns (LPPoolKey memory, uint256) { return (_key[id], _info[id]); }

    function transferFrom(address from, address to, uint256 id) public {
        require(ownerOf[id] == from, "from");
        require(msg.sender == from || getApproved[id] == msg.sender, "auth");
        ownerOf[id] = to;
        delete getApproved[id];
    }
    function safeTransferFrom(address from, address to, uint256 id) external {
        transferFrom(from, to, id);
        if (to.code.length != 0) {
            require(IERC721Receiver(to).onERC721Received(msg.sender, from, id, "") == IERC721Receiver.onERC721Received.selector, "rcv");
        }
    }

    function modifyLiquidities(bytes calldata unlockData, uint256) external payable {
        (bytes memory actions, bytes[] memory params) = abi.decode(unlockData, (bytes, bytes[]));
        require(keccak256(actions) == keccak256(hex"0111"), "actions");
        (uint256 id, uint256 liq,,,) = abi.decode(params[0], (uint256, uint256, uint128, uint128, bytes));
        require(liq == 0, "principal touched");
        require(ownerOf[id] == msg.sender, "not owner");
        (address c0, address c1, address to) = abi.decode(params[1], (address, address, address));
        require(c0 == _key[id].currency0 && c1 == _key[id].currency1, "currencies");
        uint256[2] memory f = pendingFees[id];
        delete pendingFees[id];
        collects++;
        if (f[0] != 0) LPToken(c0).transfer(to, f[0]);
        if (f[1] != 0) LPToken(c1).transfer(to, f[1]);
    }
}

// ==================================================================== tests

contract TBlockLPLockTest is Test {
    uint64 constant G = 1_700_000_000;
    uint256 constant E = 7 days;
    int24 constant LO = -887220;
    int24 constant HI = 887220;
    uint128 constant MIN_L = 1000;

    LPToken c0;
    LPToken c1;
    LPToken wt;
    LPToken tb;
    MockPM pm;
    MockVault vault;
    MockLikes likes;
    MockR2 r2;
    TBlockLPLock lp;
    LPPoolKey key;
    bytes32 poolId;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);
    address guard = address(0x6A2D);

    function setUp() public {
        vm.warp(G + 10 * E + 1 hours); // inside week 10
        LPToken a = new LPToken();
        LPToken b = new LPToken();
        (c0, c1) = address(a) < address(b) ? (a, b) : (b, a);
        wt = c0;
        tb = c1;
        pm = new MockPM();
        likes = new MockLikes(G);
        vault = new MockVault(address(tb), address(likes));
        r2 = new MockR2(address(tb), address(wt), address(vault));
        key = LPPoolKey(address(c0), address(c1), 3000, 60, address(bytes20(hex"3e6b46810b1fd5085086fd1417e8adb02f34a044")));
        poolId = keccak256(abi.encode(key));
        lp = new TBlockLPLock(address(pm), key, poolId, address(vault), guard, MIN_L, address(r2));
        wt.mint(address(pm), 1e30);
        tb.mint(address(pm), 1e30);
    }

    // ---------------------------------------------------------------- helpers
    function _mint(address to, uint128 L) internal returns (uint256 id) { id = pm.mint(to, key, LO, HI, L); }

    function _lock(address who, uint128 L, uint256 weeks_) internal returns (uint256 id) {
        id = _mint(who, L);
        vm.startPrank(who);
        pm.approve(address(lp), id);
        lp.lock(id, weeks_);
        vm.stopPrank();
    }

    function _week() internal view returns (uint256) { return lp.currentEpoch(); }
    function _to(uint256 t) internal { vm.warp(t); }

    function _depositBoth(uint256 a0, uint256 a1) internal {
        wt.mint(carol, a0);
        tb.mint(carol, a1);
        vm.startPrank(carol);
        wt.approve(address(lp), a0);
        tb.approve(address(lp), a1);
        if (a0 != 0) lp.deposit(address(wt), a0);
        if (a1 != 0) lp.deposit(address(tb), a1);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- config
    function test_config_readsGridAndTokens() public view {
        assertEq(lp.T0(), G);
        assertEq(lp.EPOCH(), E);
        assertEq(lp.TBLOCK(), address(tb));
        assertEq(lp.WTCOIN(), address(wt));
        assertEq(lp.POOL_ID(), poolId);
        assertEq(_week(), 10);
    }

    function test_constructor_rejectsWrongPoolId() public {
        vm.expectRevert(TBlockLPLock.BadConfig.selector);
        new TBlockLPLock(address(pm), key, bytes32(uint256(poolId) ^ 1), address(vault), guard, MIN_L, address(r2));
    }

    /// @dev the live key, copied from tblock-hold.js (TBLOCK, WTCOIN, TBLOCK_POOL): the hash must give the published poolId
    function test_realPoolIdMatchesRepoKey() public pure {
        LPPoolKey memory k = LPPoolKey(
            address(bytes20(hex"5cda0e1ca4ce2af96315f7f8963c85399c172204")), // WTCOIN (currency0)
            address(bytes20(hex"b200000000000000000000ba9bf8330307f8830e")), // TBLOCK (currency1)
            3000,
            60,
            address(bytes20(hex"3e6b46810b1fd5085086fd1417e8adb02f34a044"))
        );
        assertEq(keccak256(abi.encode(k)), bytes32(hex"6869b9016937d97dfa595eb25bc72880e821b8eb22be32bc79c623bc64ce8a3e"));
    }

    // ---------------------------------------------------------------- lock checks
    function test_lock_wrongPool() public {
        LPPoolKey memory other = LPPoolKey(address(c0), address(c1), 10000, 200, key.hooks);
        uint256 id = pm.mint(alice, other, -887200, 887200, 1e6);
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        vm.expectRevert(TBlockLPLock.WrongPool.selector);
        lp.lock(id, 4);
        vm.stopPrank();
    }

    function test_lock_notFullRange_lower() public {
        uint256 id = pm.mint(alice, key, -887160, HI, 1e6);
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        vm.expectRevert(TBlockLPLock.NotFullRange.selector);
        lp.lock(id, 4);
        vm.stopPrank();
    }

    function test_lock_notFullRange_upper() public {
        uint256 id = pm.mint(alice, key, LO, 600, 1e6);
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        vm.expectRevert(TBlockLPLock.NotFullRange.selector);
        lp.lock(id, 4);
        vm.stopPrank();
    }

    function test_lock_belowMinL() public {
        uint256 id = _mint(alice, MIN_L - 1);
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        vm.expectRevert(TBlockLPLock.LiquidityTooLow.selector);
        lp.lock(id, 4);
        vm.stopPrank();
        _lock(alice, MIN_L, 4); // exactly MIN_L is fine
    }

    function test_lock_wrongWeeks() public {
        uint256 id = _mint(alice, 1e6);
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        vm.expectRevert(TBlockLPLock.BadWeeks.selector);
        lp.lock(id, 3);
        vm.expectRevert(TBlockLPLock.BadWeeks.selector);
        lp.lock(id, 13);
        lp.lock(id, 12);
        vm.stopPrank();
    }

    function test_lock_notOwner() public {
        uint256 id = _mint(alice, 1e6);
        vm.prank(alice);
        pm.approve(address(lp), id);
        vm.prank(bob);
        vm.expectRevert(TBlockLPLock.NotOwner.selector);
        lp.lock(id, 4);
    }

    function test_lock_tooManyPositions() public {
        for (uint256 i = 0; i < 10; i++) _lock(alice, 1e6, 4);
        assertEq(lp.lockedCount(alice), 10);
        uint256 id = _mint(alice, 1e6);
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        vm.expectRevert(TBlockLPLock.TooManyPositions.selector);
        lp.lock(id, 4);
        vm.stopPrank();
    }

    function test_lock_rejectsSubscribedPosition() public {
        uint256 id = _mint(alice, 1e6);
        pm.setSubscriberBit(id);
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        vm.expectRevert(TBlockLPLock.Subscribed.selector);
        lp.lock(id, 4);
        vm.stopPrank();
        assertEq(pm.ownerOf(id), alice);
    }

    function test_lock_recordsWeeks() public {
        uint256 id = _lock(alice, 5000, 4);
        (address locker, uint128 L, uint64 s, uint64 en) = lp.positionOf(id);
        assertEq(locker, alice);
        assertEq(L, 5000);
        assertEq(s, 11);
        assertEq(en, 15);
        assertEq(lp.lockedLiquidityIn(alice, 10), 0);
        assertEq(lp.lockedLiquidityIn(alice, 11), 5000);
        assertEq(lp.lockedLiquidityIn(alice, 14), 5000);
        assertEq(lp.lockedLiquidityIn(alice, 15), 0);
        assertEq(pm.ownerOf(id), address(lp));
        assertEq(lp.unlockAtOf(id), G + 15 * E);
    }

    // ---------------------------------------------------------------- weight from next week only
    function test_weight_startsNextWeek() public {
        _lock(alice, 5000, 4);
        vault.setPlay(10, alice, 7);
        vault.setPlay(11, alice, 7);
        _to(lp.epochEnd(10));
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NoWeight.selector, 10));
        lp.markWeek(10, alice);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        assertEq(lp.weightOf(11, alice), 70 * 7); // floor(sqrt(5000)) = 70
        assertEq(lp.totalWeight(11), 490);
    }

    function test_weight_zeroPlayIsZeroWeight() public {
        _lock(alice, 5000, 4);
        _to(lp.epochEnd(11));
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NoWeight.selector, 11));
        lp.markWeek(11, alice);
        assertEq(lp.totalWeight(11), 0);
    }

    function test_weight_sumsPositions() public {
        _lock(alice, 5000, 4);
        _lock(alice, 2000, 12);
        vault.setPlay(12, alice, 3);
        _to(lp.epochEnd(12));
        lp.markWeek(12, alice);
        assertEq(lp.weightOf(12, alice), 83 * 3); // sqrt of the SUM: floor(sqrt(7000)) = 83
    }

    // ---------------------------------------------------------------- markWeek window
    function test_markWeek_window() public {
        _lock(alice, 5000, 4);
        vault.setPlay(11, alice, 1);
        _to(lp.epochEnd(11) - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NotMarkable.selector, 11));
        lp.markWeek(11, alice);
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NotMarkable.selector, 11));
        lp.markWeek(11, alice);
        _to(lp.epochEnd(11) + lp.MARK_GRACE() - 1);
        vm.prank(carol); // permissionless
        lp.markWeek(11, alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.AlreadyMarked.selector, 11));
        lp.markWeek(11, alice);
    }

    // ---------------------------------------------------------------- claim math
    function test_claim_twoHolders_exactShares() public {
        _lock(alice, 1600, 4);
        _lock(bob, 6400, 4);
        vault.setPlay(11, alice, 3); // w = 40 * 3 = 120
        vault.setPlay(11, bob, 2);   // w = 80 * 2 = 160, W = 280
        _to(lp.epochStart(11) + 1 hours);
        _depositBoth(1000, 100);
        (uint256 p0, uint256 p1) = lp.pot(11);
        assertEq(p0, 1000);
        assertEq(p1, 100);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        lp.markWeek(11, bob);
        assertEq(lp.totalWeight(11), 280);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.ClaimNotOpen.selector, 11));
        lp.claim(11);

        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        (uint256 a0, uint256 a1) = lp.claim(11);
        assertEq(a0, 428); // 1000 * 120 / 280
        assertEq(a1, 42);
        vm.prank(bob);
        (uint256 b0, uint256 b1) = lp.claim(11);
        assertEq(b0, 571);
        assertEq(b1, 57);
        assertEq(wt.balanceOf(alice), 428);
        assertEq(tb.balanceOf(bob), 57);
        // dust: 1 wtCOIN + 1 TBLOCK stay reserved, never rescuable
        (uint256 r0, uint256 r1) = lp.reserved();
        assertEq(r0, 1);
        assertEq(r1, 1);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.AlreadyClaimed.selector, 11));
        lp.claim(11);
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NoWeight.selector, 11));
        lp.claim(11);
    }

    function test_claim_playScales_sameLiquidity() public {
        _lock(alice, 1000, 4);
        _lock(bob, 1000, 4);
        vault.setPlay(11, alice, 1);  // one heart
        vault.setPlay(11, bob, 9);    // plays a lot
        _to(lp.epochStart(11) + 1);
        _depositBoth(1000, 0);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        lp.markWeek(11, bob);
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        (uint256 a0,) = lp.claim(11);
        vm.prank(bob);
        (uint256 b0,) = lp.claim(11);
        assertEq(a0, 100);
        assertEq(b0, 900);
    }

    function test_claim_largeNumbers_mulDiv() public {
        uint128 L = uint128(1) << 120;
        _lock(alice, L, 4);
        _lock(bob, L, 4);
        vault.setPlay(11, alice, uint256(1) << 100);
        vault.setPlay(11, bob, uint256(1) << 100);
        uint256 big = uint256(1) << 100;
        _to(lp.epochStart(11) + 1);
        _depositBoth(big, 0);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        lp.markWeek(11, bob);
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        (uint256 a0,) = lp.claim(11);
        assertEq(a0, big / 2); // pot * w overflows 256 bits without mulDiv
    }

    function test_mulDiv_matchesNaive() public view {
        assertEq(lp.mulDiv(7, 9, 4), 15);
        uint256 x = type(uint256).max;
        assertEq(lp.mulDiv(x, x, x), x);
        assertEq(lp.mulDiv(x, 3, 6), x / 2);
    }

    // ---------------------------------------------------------------- harvest
    function test_harvest_feesToCurrentPot_principalUntouched() public {
        uint256 id = _lock(alice, 5000, 4);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        _to(lp.epochStart(11) + 1 hours); // weight has started
        pm.setFees(id, 40, 70);
        vm.prank(carol);
        lp.harvest(ids);
        (uint256 p0, uint256 p1) = lp.pot(11);
        assertEq(p0, 40);
        assertEq(p1, 70);
        assertEq(pm.getPositionLiquidity(id), 5000);
        assertEq(pm.collects(), 2); // one inside lock() (fees owed before the lock), one harvest
        assertEq(lp.lastHarvestOf(id), block.timestamp);
    }

    /// finding: fees owed BEFORE the lock went to other lockers. Now lock() pays them to the locker, and harvest() skips a position
    /// during the week of its lock (its locker has no weight there): those fees reach the pot of a week where it has weight.
    function test_lock_paysPreLockFeesToLocker_andHarvestSkipsLockWeek() public {
        uint256 id = _mint(alice, 5000);
        pm.setFees(id, 1000, 3000); // owed before the lock
        vm.startPrank(alice);
        pm.approve(address(lp), id);
        lp.lock(id, 4);
        vm.stopPrank();
        assertEq(wt.balanceOf(alice), 1000, "pre-lock wtCOIN fees paid to the locker");
        assertEq(tb.balanceOf(alice), 3000, "pre-lock TBLOCK fees paid to the locker");
        assertEq(wt.balanceOf(address(lp)) + tb.balanceOf(address(lp)), 0);
        (uint256 r0, uint256 r1) = lp.reserved();
        assertEq(r0 + r1, 0);

        pm.setFees(id, 5, 7); // earned during the lock week (week 10)
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(bob);
        lp.harvest(ids); // skipped, not reverted
        (uint256 p0, uint256 p1) = lp.pot(10);
        assertEq(p0 + p1, 0, "pot of the lock week did not grow");
        assertEq(pm.pendingFees(id, 0), 5, "still in the position");
        _to(lp.epochStart(11));
        lp.harvest(ids);
        (p0, p1) = lp.pot(11);
        assertEq(p0, 5);
        assertEq(p1, 7);
    }

    /// finding: one ineligible id reverted the whole batch. Now it is skipped. Finding (2026-11-15, medium): an ended lock still
    /// held was harvested into a week where its locker has no weight, so waiting before unlock cost the locker its own fees. Now an
    /// ended lock is skipped too and its fees go back with the NFT.
    function test_harvest_skipsUnheldNotStartedAndEnded() public {
        uint256 a = _lock(alice, 5000, 4);   // ends at epochStart(15)
        uint256 b = _lock(bob, 5000, 12);
        _to(lp.unlockAtOf(a));               // week 15: a ended (still held), b running
        uint256 late = _lock(carol, 5000, 4); // locked this week: not started
        uint256 gone = _lock(alice, 5000, 4);
        pm.setFees(a, 10, 0);
        pm.setFees(b, 20, 0);
        pm.setFees(late, 40, 0);
        uint256[] memory ids = new uint256[](5);
        ids[0] = 999;  // never locked
        ids[1] = a;    // ended, still held: skipped, its fees stay in the position
        ids[2] = late; // not started: skipped
        ids[3] = b;    // running: harvested
        ids[4] = gone; // not started either
        vm.expectEmit(true, true, false, true, address(lp));
        emit TBlockLPLock.Harvested(carol, 15, 1, 4, 20, 0);
        vm.prank(carol);
        lp.harvest(ids);
        (uint256 p0,) = lp.pot(15);
        assertEq(p0, 20);
        assertEq(pm.pendingFees(late, 0), 40);
        assertEq(pm.pendingFees(a, 0), 10, "the ended lock's fees were not pooled");
        // after alice unlocks a, it is skipped too and the batch still passes; its fees went back with the NFT
        vm.prank(alice);
        lp.unlock(a);
        assertEq(pm.ownerOf(a), alice);
        assertEq(pm.pendingFees(a, 0), 10, "the fees left with the NFT");
        pm.setFees(b, 1, 0);
        vm.prank(carol);
        lp.harvest(ids);
        (p0,) = lp.pot(15);
        assertEq(p0, 21);
    }

    function test_harvest_emptyOrTooLarge() public {
        uint256[] memory none = new uint256[](0);
        vm.expectRevert(TBlockLPLock.TooManyTokenIds.selector);
        lp.harvest(none);
        uint256[] memory big = new uint256[](51);
        vm.expectRevert(TBlockLPLock.TooManyTokenIds.selector);
        lp.harvest(big);
    }

    // ---------------------------------------------------------------- rollover
    function test_rollover_whenNobodyMarked() public {
        _lock(alice, 1000, 4);
        _to(lp.epochStart(11) + 1);
        _depositBoth(500, 50);
        _to(lp.epochEnd(11) + lp.MARK_GRACE() - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.ClaimNotOpen.selector, 11));
        lp.rollover(11);
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        lp.rollover(11);
        (uint256 p0, uint256 p1) = lp.pot(12);
        assertEq(p0, 500);
        assertEq(p1, 50);
        (p0, p1) = lp.pot(11);
        assertEq(p0 + p1, 0);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NothingToRoll.selector, 11));
        lp.rollover(11);
        // week 12: alice plays and takes it all
        vault.setPlay(12, alice, 1);
        _to(lp.epochEnd(12));
        lp.markWeek(12, alice);
        _to(lp.epochEnd(12) + lp.MARK_GRACE());
        vm.prank(alice);
        (uint256 a0, uint256 a1) = lp.claim(12);
        assertEq(a0, 500);
        assertEq(a1, 50);
    }

    function test_rollover_lateGoesToCurrentWeek() public {
        _to(lp.epochStart(11) + 1);
        _depositBoth(500, 0);
        _to(lp.epochEnd(13) + 2 days); // week 14, week 12's claims already open
        lp.rollover(11);
        (uint256 p0,) = lp.pot(14);
        assertEq(p0, 500);
    }

    function test_rollover_refusedWhenWeighted() public {
        _lock(alice, 1000, 4);
        vault.setPlay(11, alice, 1);
        _to(lp.epochStart(11) + 1);
        _depositBoth(500, 0);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.HasWeight.selector, 11));
        lp.rollover(11);
    }

    // ---------------------------------------------------------------- unlock
    function test_unlock_timing_and_locker() public {
        uint256 id = _lock(alice, 5000, 4);
        uint256 at = lp.unlockAtOf(id);
        assertEq(at, G + 15 * E);
        _to(at - 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillLocked.selector, at));
        lp.unlock(id);
        _to(at);
        vm.prank(bob);
        vm.expectRevert(TBlockLPLock.NotLocker.selector);
        lp.unlock(id);
        assertEq(pm.ownerOf(id), address(lp));
        pm.setFees(id, 11, 22); // unharvested fees go with the position
        vm.prank(alice);
        lp.unlock(id);
        assertEq(pm.ownerOf(id), alice);
        assertEq(lp.lockedCount(alice), 0);
        (uint256 f0, uint256 f1) = (pm.pendingFees(id, 0), pm.pendingFees(id, 1));
        assertEq(f0, 11);
        assertEq(f1, 22);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NotLocked.selector, id));
        lp.unlock(id);
    }

    function test_unlock_lastWeekStillCountsAfterUnlock() public {
        uint256 id = _lock(alice, 5000, 4); // weeks 11..14
        vault.setPlay(14, alice, 2);
        _to(lp.unlockAtOf(id));
        vm.prank(alice);
        lp.unlock(id); // inside week 14's grace: unlock() itself marks the locker's last week
        assertEq(lp.weightOf(14, alice), 140); // floor(sqrt(5000)) * 2
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.AlreadyMarked.selector, 14));
        lp.markWeek(14, alice);
    }

    // ---------------------------------------------------------------- fixes of the 2026-11-15 review

    /// finding (high): with w = L x play a whale with one heart took ~47% of the pot against nine small lockers with 10 hearts each.
    /// With w = sqrt(L) x play the same case gives the whale ~9%.
    function test_weight_sqrtL_whaleWithOneHeartEarnsLittle() public {
        _lock(alice, 810_000, 4); // 90% of the liquidity: sqrt = 900
        address[9] memory small;
        for (uint256 i = 0; i < 9; i++) {
            small[i] = address(uint160(0x5000 + i));
            _lock(small[i], 10_000, 4); // ~1.1% each: sqrt = 100
            vault.setPlay(11, small[i], 10);
        }
        vault.setPlay(11, alice, 1);
        _to(lp.epochStart(11) + 1);
        _depositBoth(1_000_000, 0);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        for (uint256 i = 0; i < 9; i++) lp.markWeek(11, small[i]);
        assertEq(lp.weightOf(11, alice), 900);
        assertEq(lp.weightOf(11, small[0]), 1000);
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        (uint256 a0,) = lp.claim(11);
        vm.prank(small[0]);
        (uint256 s0,) = lp.claim(11);
        assertEq(a0, 90_909); // 1e6 * 900 / 9900: ~9.1%, was ~47.4% with L x play
        assertEq(s0, 101_010);
        assertGt(s0, a0, "a small locker who plays 10x beats the whale with one heart");
    }

    /// splitting the same liquidity over several addresses never raises the weight (play is per address and paid)
    function test_weight_splitDoesNotPay() public view {
        uint256 one = lp.sqrt(1_000_000) * 10;       // one address, all play
        uint256 two = 2 * lp.sqrt(500_000) * 5;      // same L, same total play, two addresses
        assertLt(two, one);
    }

    function test_sqrt_floor() public view {
        assertEq(lp.sqrt(0), 0);
        assertEq(lp.sqrt(1), 1);
        assertEq(lp.sqrt(3), 1);
        assertEq(lp.sqrt(4), 2);
        assertEq(lp.sqrt(99), 9);
        assertEq(lp.sqrt(type(uint128).max), type(uint64).max);
        assertEq(lp.sqrt(type(uint256).max), type(uint128).max);
        uint256 x = 123456789012345678901234567890;
        uint256 r = lp.sqrt(x);
        assertLe(r * r, x);
        assertGt((r + 1) * (r + 1), x);
    }

    /// finding (high/medium): a 1-day permissionless window let a self-marker take the pot of unmarked players.
    /// Now: 6-day grace, a batch mark that skips instead of reverting, and the locker's own lock/extend/unlock/claim mark it.
    function test_markWeek_graceIsSixDays_andBatchSkips() public {
        _lock(alice, 1600, 4);
        _lock(bob, 1600, 4);
        vault.setPlay(11, alice, 1);
        vault.setPlay(11, bob, 2);
        _to(lp.epochEnd(11) + 5 days);
        address[] memory hs = new address[](4);
        hs[0] = alice; hs[1] = carol; hs[2] = bob; hs[3] = alice; // carol no weight, alice twice
        vm.prank(carol);
        assertEq(lp.markWeekBatch(11, hs), 2);
        assertEq(lp.totalWeight(11), 120);
        assertEq(lp.markWeekBatch(11, hs), 0); // all done: no revert
        _to(lp.epochEnd(11) + 6 days);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NotMarkable.selector, 11));
        lp.markWeekBatch(11, hs);
        address[] memory none = new address[](0);
        vm.expectRevert(TBlockLPLock.BadAmount.selector);
        lp.markWeekBatch(11, none);
    }

    function test_selfMark_byOwnClaimAndLock() public {
        _lock(alice, 1600, 12);
        _lock(bob, 1600, 12);
        vault.setPlay(11, alice, 1);
        vault.setPlay(11, bob, 1);
        vault.setPlay(12, alice, 3);
        _to(lp.epochStart(11) + 1);
        _depositBoth(100, 0);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        lp.markWeek(11, bob);
        // week 12 ends; nobody runs a keeper; alice claims week 11 on day 6 of week 13 and is marked for week 12 by it
        _to(lp.epochEnd(12) + lp.MARK_GRACE() - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.ClaimNotOpen.selector, 12));
        lp.claim(12);
        _to(lp.epochEnd(11) + lp.MARK_GRACE() + 7 days - 1); // == epochEnd(12) + MARK_GRACE - 1
        vm.prank(alice);
        lp.claim(11);
        assertEq(lp.weightOf(12, alice), 120, "claim() marked the caller for the week in grace");
        // a new lock() marks too
        vault.setPlay(12, carol, 5);
        assertEq(lp.weightOf(12, carol), 0);
        _to(lp.epochEnd(13)); // week 13 in grace now; carol had no lock in 13: lock marks nothing, no revert
        _lock(carol, 1600, 4);
        assertEq(lp.weightOf(13, carol), 0);
        vault.setPlay(13, bob, 2);
        uint256 idB2 = _mint(bob, 1600);
        vm.startPrank(bob);
        pm.approve(address(lp), idB2);
        lp.lock(idB2, 4);
        vm.stopPrank();
        assertEq(lp.weightOf(13, bob), 80, "bob's own lock() marked him for week 13");
    }

    /// finding (medium): relocking at the end lost a week. extend() adds weeks with no gap, only before the end, within MAX_WEEKS.
    function test_extend_noGap_bounds() public {
        uint256 id = _lock(alice, 5000, 4); // 11..14, end 15
        vm.prank(bob);
        vm.expectRevert(TBlockLPLock.NotLocker.selector);
        lp.extend(id, 1);
        vm.startPrank(alice);
        vm.expectRevert(TBlockLPLock.BadWeeks.selector);
        lp.extend(id, 0);
        vm.expectRevert(TBlockLPLock.BadWeeks.selector);
        lp.extend(id, 9); // 4 + 9 = 13 weeks from next week > 12
        lp.extend(id, 8);  // exactly 12
        vm.stopPrank();
        (,,, uint64 en) = lp.positionOf(id);
        assertEq(en, 23);
        assertEq(lp.lockedLiquidityIn(alice, 15), 5000);
        assertEq(lp.lockedLiquidityIn(alice, 22), 5000);
        assertEq(lp.lockedLiquidityIn(alice, 23), 0);
        _to(lp.epochStart(22) + 1);
        vm.prank(alice);
        lp.extend(id, 1); // in the last week: next week follows with no gap
        assertEq(lp.lockedLiquidityIn(alice, 23), 5000);
        _to(lp.unlockAtOf(id));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.LockEnded.selector, id));
        lp.extend(id, 1);
        vm.prank(alice);
        lp.unlock(id);
        assertEq(pm.ownerOf(id), alice);
    }

    // ---------------------------------------------------------------- NFT never leaves except to its locker
    function test_nft_unsolicitedSafeTransferRefused() public {
        uint256 id = _mint(alice, 5000);
        vm.prank(alice);
        vm.expectRevert(TBlockLPLock.UnexpectedNFT.selector);
        pm.safeTransferFrom(alice, address(lp), id);
        assertEq(pm.ownerOf(id), alice);
    }

    function test_nft_receiverOnlyFromPM() public {
        vm.prank(alice);
        vm.expectRevert(TBlockLPLock.UnexpectedNFT.selector);
        lp.onERC721Received(alice, alice, 1, "");
    }

    function test_nft_rescueCannotTargetPM() public {
        _lock(alice, 5000, 4);
        vm.prank(guard);
        vm.expectRevert(TBlockLPLock.BadToken.selector);
        lp.rescueRequest(address(pm), guard, 1);
    }

    function test_nft_onlyLockerReceivesAcrossFlows() public {
        uint256 id = _lock(alice, 5000, 4);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        pm.setFees(id, 1, 1);
        lp.harvest(ids);
        assertEq(pm.ownerOf(id), address(lp));
        _to(lp.unlockAtOf(id) + 30 days);
        vm.prank(carol);
        vm.expectRevert(TBlockLPLock.NotLocker.selector);
        lp.unlock(id);
        vm.prank(alice);
        lp.unlock(id);
        assertEq(pm.ownerOf(id), alice);
    }

    // ---------------------------------------------------------------- rescue door
    function test_rescue_cannotTouchPots() public {
        _lock(alice, 1000, 4);
        vault.setPlay(11, alice, 1);
        _to(lp.epochStart(11) + 1);
        _depositBoth(1000, 0);
        wt.mint(address(lp), 5); // plain transfer: belongs to no pot
        assertEq(lp.free(address(wt)), 5);

        vm.prank(alice);
        vm.expectRevert(TBlockLPLock.NotGuardian.selector);
        lp.rescueRequest(address(wt), alice, 1);

        vm.prank(guard);
        lp.rescueRequest(address(wt), guard, 1005);
        vm.prank(guard);
        vm.expectRevert();
        lp.rescueExecute();
        _to(block.timestamp + 72 hours);
        vm.prank(guard);
        lp.rescueExecute();
        assertEq(wt.balanceOf(guard), 5);
        (uint256 p0,) = lp.pot(11);
        assertEq(p0, 1000);

        // the assigned reward is still fully claimable
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(guard);
        lp.rescueRequest(address(wt), guard, 1000);
        _to(block.timestamp + 72 hours);
        vm.prank(guard);
        lp.rescueExecute();
        assertEq(wt.balanceOf(guard), 5);
        vm.prank(alice);
        (uint256 a0,) = lp.claim(11);
        assertEq(a0, 1000);
    }

    function test_rescue_renounce() public {
        vm.prank(guard);
        lp.renounceGuardian();
        assertEq(lp.guardian(), address(0));
        vm.prank(guard);
        vm.expectRevert(TBlockLPLock.NotGuardian.selector);
        lp.rescueRequest(address(wt), guard, 1);
    }

    // ---------------------------------------------------------------- unlock pays the reward / sweep of unclaimed weeks
    /// alice L=1600 (sqrt 40), bob L=6400 (sqrt 80), both locked in week 10 for weeks 11..14 (unlockAt = epochStart(15)).
    /// week 11: alice 3, bob 2 -> W 280, pot 1000 wt / 100 tb.  week 12: alice 1, bob 1 -> W 120, pot 700 / 70.
    /// week 13: bob 1 only (pot 0).  week 14: alice 1 (marked by her own unlock), pot 50 / 5.
    uint256 idA;
    uint256 idB;

    function _fourWeeks() internal {
        idA = _lock(alice, 1600, 4);
        idB = _lock(bob, 6400, 4);
        vault.setPlay(11, alice, 3);
        vault.setPlay(11, bob, 2);
        vault.setPlay(12, alice, 1);
        vault.setPlay(12, bob, 1);
        vault.setPlay(13, bob, 1);
        vault.setPlay(14, alice, 1);
        _to(lp.epochStart(11) + 1 hours);
        _depositBoth(1000, 100);
        _to(lp.epochStart(12) + 1);
        lp.markWeek(11, alice);
        lp.markWeek(11, bob);
        _depositBoth(700, 70);
        _to(lp.epochStart(13) + 1);
        lp.markWeek(12, alice);
        lp.markWeek(12, bob);
        _to(lp.epochStart(14) + 1);
        lp.markWeek(13, bob);
        _depositBoth(50, 5);
        assertEq(lp.totalWeight(11), 280);
        assertEq(lp.totalWeight(12), 120);
    }

    function test_unlock_paysEveryClaimableWeek_andReturnsNft() public {
        _fourWeeks();
        _to(lp.unlockAtOf(idA)); // = epochStart(15): weeks 11, 12, 13 open; 14 in its grace
        vm.expectEmit(true, true, false, true, address(lp));
        emit TBlockLPLock.Claimed(alice, 11, 428, 42);   // 1000*120/280, 100*120/280
        vm.expectEmit(true, true, false, true, address(lp));
        emit TBlockLPLock.Claimed(alice, 12, 233, 23);   // 700*40/120, 70*40/120
        vm.expectEmit(true, true, false, true, address(lp));
        emit TBlockLPLock.UnlockPaid(alice, idA, 2, 661, 65);
        vm.prank(alice);
        lp.unlock(idA);
        assertEq(pm.ownerOf(idA), alice, "the NFT is back");
        assertEq(wt.balanceOf(alice), 661, "weeks 11 + 12 wtCOIN paid in the unlock");
        assertEq(tb.balanceOf(alice), 65, "weeks 11 + 12 TBLOCK paid in the unlock");
        assertTrue(lp.claimed(11, alice) && lp.claimed(12, alice));
        assertFalse(lp.claimed(13, alice), "no weight in 13: nothing booked");
        assertEq(lp.weightOf(14, alice), 40, "unlock marked the last week (in its grace)");
        assertFalse(lp.claimed(14, alice), "week 14 is still in its grace: not paid yet");
        (uint256 g0, uint256 g1) = lp.paid(11);
        assertEq(g0, 428);
        assertEq(g1, 42);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.AlreadyClaimed.selector, 11));
        lp.claim(11);
        // the week still in grace at unlock stays claimable later with claim(e)
        _to(lp.epochEnd(14) + lp.MARK_GRACE());
        vm.prank(alice);
        (uint256 k0, uint256 k1) = lp.claim(14);
        assertEq(k0, 50);
        assertEq(k1, 5);
        // bob's parts are untouched by alice's unlock
        vm.prank(bob);
        (uint256 b0, uint256 b1) = lp.claim(11);
        assertEq(b0, 571);
        assertEq(b1, 57);
        (uint256 r0, uint256 r1) = lp.reserved();
        assertEq(r0, 1 + 467, "week 11 dust + bob's unclaimed week 12 (700 - 233)");
        assertEq(r1, 1 + 47);
    }

    function test_unlock_skipsWeeksAlreadyClaimed() public {
        _fourWeeks();
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        lp.claim(11);
        assertEq(wt.balanceOf(alice), 428);
        _to(lp.unlockAtOf(idA));
        vm.prank(alice);
        lp.unlock(idA);
        assertEq(wt.balanceOf(alice), 428 + 233, "only week 12 added: week 11 is never paid twice");
        assertEq(tb.balanceOf(alice), 42 + 23);
    }

    function test_unlock_withNothingToClaim_returnsNft() public {
        uint256 id = _lock(alice, 5000, 4);
        _to(lp.unlockAtOf(id));
        vm.expectEmit(true, true, false, true, address(lp));
        emit TBlockLPLock.UnlockPaid(alice, id, 0, 0, 0);
        vm.prank(alice);
        lp.unlock(id);
        assertEq(pm.ownerOf(id), alice);
        assertEq(wt.balanceOf(alice) + tb.balanceOf(alice), 0);
        assertEq(lp.lockedCount(alice), 0);
    }

    /// finding (high, 2026-11-15): CLAIM_WINDOW counted from the week, so a 12-week locker who came back ~13 days late could already
    /// have lost week 1 to a permissionless sweep. Now no week is swept while a position covering it is still locked here.
    function test_unlock_late_weeksNotSweptWhileHeld() public {
        _fourWeeks();
        _to(lp.sweepOpensAt(12)); // ~13 weeks after unlockAt: both sweep windows of 11 and 12 have passed
        assertEq(lp.positionsIn(11), 2);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillHeld.selector, 11));
        lp.sweep(11);
        vm.prank(bob);
        lp.unlock(idB); // bob is paid 11, 12 (and 13, an empty pot)
        assertEq(wt.balanceOf(bob), 571 + 466);
        assertEq(lp.positionsIn(11), 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillHeld.selector, 11));
        lp.sweep(11); // alice still holds a position covering 11
        vm.prank(alice);
        lp.unlock(idA); // very late, still paid in full for 11 and 12
        assertEq(wt.balanceOf(alice), 661);
        assertEq(tb.balanceOf(alice), 65);
        assertEq(lp.weightOf(14, alice), 0, "too late to be marked for 14: a missed mark is never repaired");
        assertEq(lp.positionsIn(11), 0);
        (uint256 s0, uint256 s1) = lp.sweep(11);
        assertEq(s0, 1, "only the rounding dust is left");
        assertEq(s1, 1);
    }

    /// finding (high, 2026-11-15): a locker who extended could lose its early weeks to sweep while its NFT was still locked, and
    /// unlock() (26-week cap) could never pay them. Now the span is capped at MAX_SPAN_WEEKS, the weeks stay unsweepable while held,
    /// and unlock() pays every week of the position.
    function test_extend_spanCapped_earlyWeekNotSweptWhileHeld_unlockPaysIt() public {
        uint256 id = _lock(alice, 1600, 12); // week 10: weeks 11..22, end 23
        vault.setPlay(11, alice, 1);
        _to(lp.epochStart(11) + 1);
        _depositBoth(900, 90);
        for (uint256 w = 11; w <= 24; w++) {
            _to(lp.epochStart(w) + 1 hours);
            if (w == 12) lp.markWeek(11, alice);
            vm.prank(alice);
            lp.extend(id, 1);
        }
        (, , uint64 st, uint64 en) = lp.positionOf(id);
        assertEq(uint256(en) - st, lp.MAX_SPAN_WEEKS(), "26 weeks: 11..36");
        _to(lp.epochStart(25) + 1 hours);
        vm.prank(alice);
        vm.expectRevert(TBlockLPLock.BadWeeks.selector);
        lp.extend(id, 1); // only 12 weeks left from next week, but a 27th week of span is refused
        // week 11's sweep window has passed long before unlockAt (epochStart(37)): the week is still protected
        assertLt(lp.sweepOpensAt(11), lp.unlockAtOf(id));
        _to(lp.sweepOpensAt(11));
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillHeld.selector, 11));
        lp.sweep(11);
        _to(lp.unlockAtOf(id));
        vm.prank(alice);
        lp.unlock(id);
        assertEq(wt.balanceOf(alice), 900, "week 11, 26 weeks old, paid by the unlock");
        assertEq(tb.balanceOf(alice), 90);
        (uint256 r0, uint256 r1) = lp.reserved();
        assertEq(r0 + r1, 0, "nothing left reserved");
        for (uint256 e = 11; e < 37; e++) assertEq(lp.positionsIn(e), 0);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NothingToSweep.selector, 11));
        lp.sweep(11);
    }

    /// finding (medium, 2026-11-15): unlock() returned the NFT only if the reward transfers succeeded, and wtCOIN is an upgradeable
    /// proxy. unlockOnly() returns the NFT moving no ERC-20; the unpaid weeks stay claimable.
    function test_unlockOnly_returnsNftWhenRewardTokenRefuses() public {
        PausableToken pw = new PausableToken();
        LPToken ot = new LPToken();
        (address a, address b) = address(pw) < address(ot) ? (address(pw), address(ot)) : (address(ot), address(pw));
        MockVault v2 = new MockVault(address(ot), address(likes)); // pw = wtCOIN, ot = TBLOCK
        LPPoolKey memory k = LPPoolKey(a, b, 3000, 60, key.hooks);
        TBlockLPLock x = new TBlockLPLock(address(pm), k, keccak256(abi.encode(k)), address(v2), guard, MIN_L, address(new MockR2(address(ot), address(pw), address(v2))));
        assertEq(x.WTCOIN(), address(pw));
        uint256 id = pm.mint(alice, k, LO, HI, 1000);
        vm.startPrank(alice);
        pm.approve(address(x), id);
        x.lock(id, 4);
        vm.stopPrank();
        v2.setPlay(11, alice, 1);
        _to(x.epochStart(11) + 1);
        pw.mint(carol, 1000);
        ot.mint(carol, 10);
        vm.startPrank(carol);
        pw.approve(address(x), 1000);
        ot.approve(address(x), 10);
        x.deposit(address(pw), 1000);
        x.deposit(address(ot), 10);
        vm.stopPrank();
        _to(x.epochEnd(11));
        x.markWeek(11, alice);
        _to(x.unlockAtOf(id));
        pw.setPaused(true);
        vm.prank(alice);
        vm.expectRevert(TBlockLPLock.TransferFailed.selector);
        x.unlock(id); // the paying exit is blocked by the token
        assertEq(pm.ownerOf(id), address(x));
        vm.prank(bob);
        vm.expectRevert(TBlockLPLock.NotLocker.selector);
        x.unlockOnly(id);
        vm.expectEmit(true, true, false, true, address(x));
        emit TBlockLPLock.Unlocked(alice, id);
        vm.prank(alice);
        x.unlockOnly(id); // moves no ERC-20
        assertEq(pm.ownerOf(id), alice, "the NFT is back although the reward token refuses transfers");
        assertEq(x.lockedCount(alice), 0);
        assertFalse(x.claimed(11, alice), "week 11 not booked");
        (uint256 r0, uint256 r1) = x.reserved();
        assertEq(r0, 1000);
        assertEq(r1, 10);
        assertEq(pw.balanceOf(alice) + ot.balanceOf(alice), 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NotLocked.selector, id));
        x.unlockOnly(id);
        // once the token works again, the week is still claimable in full
        pw.setPaused(false);
        vm.prank(alice);
        (uint256 c0_, uint256 c1_) = x.claim(11);
        assertEq(c0_, 1000);
        assertEq(c1_, 10);
    }

    function test_unlockOnly_timing_noPay_weeksStayClaimable() public {
        _fourWeeks();
        uint256 at = lp.unlockAtOf(idA); // read before the prank: a view call would consume it
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.StillLocked.selector, at));
        lp.unlockOnly(idA);
        _to(at);
        vm.prank(alice);
        lp.unlockOnly(idA);
        assertEq(pm.ownerOf(idA), alice);
        assertEq(wt.balanceOf(alice) + tb.balanceOf(alice), 0, "nothing paid");
        assertEq(lp.weightOf(14, alice), 40, "unlockOnly also marks the week in its grace");
        assertEq(lp.positionsIn(11), 1, "bob still covers week 11");
        vm.prank(alice);
        (uint256 a0, uint256 a1) = lp.claim(11);
        assertEq(a0, 428);
        assertEq(a1, 42);
    }

    /// finding (low, 2026-11-15): one failing leg blocks the whole sweep. Accepted: nothing moves and the week stays claimable.
    function test_sweep_r2Refuses_nothingMoves_weekStaysClaimable() public {
        _fourWeeks();
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        lp.claim(11);
        _releaseBoth();
        _to(lp.sweepOpensAt(11));
        r2.setFail(true);
        (uint256 r0, uint256 r1) = lp.reserved();
        vm.expectRevert(bytes("r2 refuses"));
        lp.sweep(11);
        assertFalse(lp.swept(11));
        (uint256 q0, uint256 q1) = lp.reserved();
        assertEq(q0, r0);
        assertEq(q1, r1);
        assertEq(tb.balanceOf(address(vault)), 0, "the TBLOCK leg did not move either");
        assertEq(wt.allowance(address(lp), address(r2)), 0);
        vm.prank(bob);
        (uint256 b0,) = lp.claim(11);
        assertEq(b0, 571, "the week is still claimable");
        r2.setFail(false);
        (uint256 s0, uint256 s1) = lp.sweep(11);
        assertEq(s0, 1);
        assertEq(s1, 1);
        assertEq(wt.allowance(address(lp), address(r2)), 0, "no approval left after a sweep");
    }

    /// both lockers of _fourWeeks take their NFT back without being paid, so their weeks can be swept
    function _releaseBoth() internal {
        if (block.timestamp < lp.unlockAtOf(idA)) _to(lp.unlockAtOf(idA));
        vm.prank(alice);
        lp.unlockOnly(idA);
        vm.prank(bob);
        lp.unlockOnly(idB);
    }

    function test_sweep_window_exactToVaultAndR2_thenNoClaim() public {
        _fourWeeks();
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        lp.claim(11); // 428 / 42; bob never claims week 11
        _releaseBoth(); // nobody is paid by these exits; while a position still covers week 11 it cannot be swept
        uint256 opens = lp.sweepOpensAt(11);
        assertEq(opens, lp.epochEnd(11) + 6 days + 12 weeks);
        _to(opens - 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.SweepNotOpen.selector, opens));
        lp.sweep(11);
        vm.prank(bob);
        (uint256 late0,) = lp.claim(12); // a late claim before the sweep still works
        assertEq(late0, 466);
        _to(opens);
        (uint256 u0, uint256 u1) = lp.unclaimed(11);
        assertEq(u0, 572, "1000 - 428: bob's 571 + 1 dust");
        assertEq(u1, 58, "100 - 42: bob's 57 + 1 dust");
        (uint256 r0b, uint256 r1b) = lp.reserved();
        uint256 vb = tb.balanceOf(address(vault));
        vm.expectEmit(true, true, false, true, address(lp));
        emit TBlockLPLock.Swept(11, carol, 572, 58);
        vm.prank(carol); // permissionless
        (uint256 s0, uint256 s1) = lp.sweep(11);
        assertEq(s0, 572);
        assertEq(s1, 58);
        assertEq(tb.balanceOf(address(vault)) - vb, 58, "exact TBLOCK to V by plain transfer");
        assertEq(wt.balanceOf(address(vault)), 0, "no wtCOIN to V");
        assertEq(wt.balanceOf(address(r2)), 572, "exact wtCOIN to R2");
        assertEq(r2.depCount(), 1, "through R2.deposit");
        (address df, address dt, uint256 da) = r2.deps(0);
        assertEq(df, address(lp));
        assertEq(dt, address(wt));
        assertEq(da, 572);
        assertEq(wt.allowance(address(lp), address(r2)), 0, "the exact approve was consumed");
        assertEq(tb.balanceOf(address(r2)), 0);
        (uint256 r0a, uint256 r1a) = lp.reserved();
        assertEq(r0b - r0a, 572);
        assertEq(r1b - r1a, 58);
        assertTrue(lp.swept(11));
        (u0, u1) = lp.unclaimed(11);
        assertEq(u0 + u1, 0);
        (uint256 cb0, uint256 cb1) = lp.claimable(bob, 11);
        assertEq(cb0 + cb1, 0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.AlreadySwept.selector, 11));
        lp.claim(11);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.AlreadySwept.selector, 11));
        lp.sweep(11);
        assertEq(wt.balanceOf(alice), 428, "what was claimed is never swept");
    }

    function test_sweep_allClaimed_sendsOnlyTheDust() public {
        _fourWeeks();
        _to(lp.epochEnd(11) + lp.MARK_GRACE());
        vm.prank(alice);
        lp.claim(11);
        vm.prank(bob);
        lp.claim(11);
        _releaseBoth();
        _to(lp.sweepOpensAt(11));
        (uint256 s0, uint256 s1) = lp.sweep(11);
        assertEq(s0, 1, "rounding dust wtCOIN");
        assertEq(s1, 1, "rounding dust TBLOCK");
        assertEq(wt.balanceOf(address(r2)), 1);
        assertEq(tb.balanceOf(address(vault)), 1);
        assertEq(wt.balanceOf(alice) + wt.balanceOf(bob), 999, "the claims are intact");
    }

    function test_sweep_tblockOnly_noR2Call_and_nothingLeft() public {
        idA = _lock(alice, 1600, 4);
        vault.setPlay(11, alice, 1);
        _to(lp.epochStart(11) + 1);
        _depositBoth(0, 30);
        _to(lp.epochEnd(11));
        lp.markWeek(11, alice);
        _to(lp.sweepOpensAt(11));
        vm.prank(alice);
        lp.unlockOnly(idA);
        (uint256 s0, uint256 s1) = lp.sweep(11);
        assertEq(s0, 0);
        assertEq(s1, 30);
        assertEq(r2.depCount(), 0, "no wtCOIN, no deposit call");
        assertEq(tb.balanceOf(address(vault)), 30);
        // a week whose pot was fully claimed with no dust has nothing to sweep
        uint256 idb = _lock(bob, 6400, 4); // weight from next week
        uint256 e = lp.currentEpoch() + 1;
        vault.setPlay(e, bob, 1);
        _to(lp.epochStart(e) + 1);
        _depositBoth(10, 0);
        _to(lp.epochEnd(e));
        lp.markWeek(e, bob);
        _to(lp.epochEnd(e) + lp.MARK_GRACE());
        vm.prank(bob);
        lp.claim(e);
        _to(lp.sweepOpensAt(e));
        vm.prank(bob);
        lp.unlockOnly(idb);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NothingToSweep.selector, e));
        lp.sweep(e);
    }

    function test_sweep_weekWithNoWeight_usesRollover() public {
        uint256 id = _lock(alice, 1600, 4); // no play at all
        _to(lp.epochStart(11) + 1);
        _depositBoth(100, 10);
        _to(lp.sweepOpensAt(11));
        vm.prank(alice);
        lp.unlockOnly(id);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.NoWeight.selector, 11));
        lp.sweep(11);
        lp.rollover(11); // the fees stay with the LP lockers
        (uint256 p0, uint256 p1) = lp.pot(lp.currentEpoch());
        assertEq(p0, 100);
        assertEq(p1, 10);
        assertEq(tb.balanceOf(address(vault)) + wt.balanceOf(address(r2)), 0);
    }

    function test_constructor_rejectsMismatchedR2() public {
        MockR2 bad = new MockR2(address(tb), address(wt), address(0xBEEF));
        vm.expectRevert(TBlockLPLock.BadConfig.selector);
        new TBlockLPLock(address(pm), key, poolId, address(vault), guard, MIN_L, address(bad));
        bad = new MockR2(address(wt), address(tb), address(vault));
        vm.expectRevert(TBlockLPLock.BadConfig.selector);
        new TBlockLPLock(address(pm), key, poolId, address(vault), guard, MIN_L, address(bad));
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.TokenHasNoCode.selector, address(0xBEEF)));
        new TBlockLPLock(address(pm), key, poolId, address(vault), guard, MIN_L, address(0xBEEF));
        assertEq(lp.REWARDS(), address(r2));
    }

    // ---------------------------------------------------------------- reentrancy
    function test_reentrancy_onClaim() public {
        ReentrantToken evil = new ReentrantToken();
        LPToken other = new LPToken();
        (address a, address b) = address(evil) < address(other) ? (address(evil), address(other)) : (address(other), address(evil));
        MockVault v2 = new MockVault(address(other), address(likes)); // evil = wtCOIN, other = TBLOCK
        LPPoolKey memory k = LPPoolKey(a, b, 3000, 60, key.hooks);
        TBlockLPLock x = new TBlockLPLock(address(pm), k, keccak256(abi.encode(k)), address(v2), guard, MIN_L, address(new MockR2(address(other), address(evil), address(v2))));
        assertEq(x.WTCOIN(), address(evil));

        uint256 id = pm.mint(alice, k, LO, HI, 1000);
        vm.startPrank(alice);
        pm.approve(address(x), id);
        x.lock(id, 4);
        vm.stopPrank();
        v2.setPlay(11, alice, 1);
        _to(x.epochStart(11) + 1);
        evil.mint(carol, 1000);
        vm.startPrank(carol);
        evil.approve(address(x), 1000);
        x.deposit(address(evil), 1000);
        vm.stopPrank();
        _to(x.epochEnd(11));
        x.markWeek(11, alice);
        _to(x.epochEnd(11) + x.MARK_GRACE());
        evil.arm(address(x), 11);
        vm.prank(alice);
        x.claim(11);
        assertTrue(evil.tried());
        assertFalse(evil.reentered());
        assertEq(bytes4(evil.reason()), TBlockLPLock.Reentrancy.selector);
        assertEq(evil.balanceOf(alice), 1000);
        assertEq(evil.balanceOf(address(x)), 0);
    }

    // ---------------------------------------------------------------- audit 2026-11-15 fixes
    /// L-1: a vault whose playOf reverts must not trap the NFT: unlock and unlockOnly still return it (the self-mark counts no play)
    function test_audit_L1_revertingVaultDoesNotTrapExit() public {
        uint256 id1 = _lock(alice, 5000, 4);
        uint256 id2 = _lock(alice, 5000, 4);
        uint256 at = lp.unlockAtOf(id1);
        _to(at + 1 hours); // week 14's grace is open: the self-mark calls playOf
        vm.mockCallRevert(address(vault), abi.encodeWithSelector(bytes4(keccak256("playOf(uint256,address)"))), "vault down");
        vm.prank(alice);
        lp.unlock(id1);
        assertEq(pm.ownerOf(id1), alice);
        vm.prank(alice);
        lp.unlockOnly(id2);
        assertEq(pm.ownerOf(id2), alice);
        assertEq(lp.weightOf(14, alice), 0);
        assertEq(lp.lockedCount(alice), 0);
    }

    /// L-2: a rescue request expires RESCUE_WINDOW after its delay; executable inside the window, refused after
    function test_audit_L2_rescueRequestExpires() public {
        wt.mint(address(lp), 5);
        vm.prank(guard);
        lp.rescueRequest(address(wt), guard, 5);
        uint256 at = block.timestamp + 72 hours;
        uint256 win = lp.RESCUE_WINDOW();
        _to(at + win + 1);
        vm.expectRevert(abi.encodeWithSelector(TBlockLPLock.RescueExpired.selector, at + win));
        vm.prank(guard);
        lp.rescueExecute();
        vm.prank(guard);
        lp.rescueCancel(); // a stale request is cleared by cancel, then a fresh one works
        vm.prank(guard);
        lp.rescueRequest(address(wt), guard, 5);
        _to(block.timestamp + 72 hours + win); // the last second of the window still executes
        vm.prank(guard);
        lp.rescueExecute();
        assertEq(wt.balanceOf(guard), 5);
    }
}
