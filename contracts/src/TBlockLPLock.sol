// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Uniswap v4 PoolKey, field order and types copied from v4-core (Currency is an address).
struct LPPoolKey {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// @notice The read/write surface of the Uniswap v4 PositionManager used here (v4-periphery PositionManager.sol / solmate ERC721).
interface ILPPositionManager {
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function getPoolAndPositionInfo(uint256 tokenId) external view returns (LPPoolKey memory, uint256);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128);
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
}

/// @notice The read surface of the deployed holders vault V (TBlockVaultV2).
interface ILPVaultPlays {
    function TBLOCK() external view returns (address);
    function LIKES() external view returns (address);
    /// raw TBLOCK a player put into play in week e (hearts burned + TBLOCK bought by V's listed games)
    function playOf(uint256 e, address player) external view returns (uint256);
}

/// @notice The surface of the deployed weekly lock rewards R2 (TBlockLockRewardsWeekly) used here: its public deposit (transferFrom
///         msg.sender, measured by balance diff) and the three addresses checked at deploy.
interface ILPRewardsWeekly {
    function TBLOCK() external view returns (address);
    function WTCOIN() external view returns (address);
    function VAULT() external view returns (address);
    function deposit(address token, uint256 amount) external;
}

/// @notice The read surface of BlockLikesV2: its week grid is V's grid, R2's grid and this contract's grid.
interface ILPLikesWeeks {
    function GENESIS() external view returns (uint64);
    function EPOCH() external view returns (uint64);
}

/// @title TBlockLPLock - lock a full-range TBLOCK/wtCOIN Uniswap v4 position; its swap fees are shared among lockers who PLAY.
/// @notice WHAT THIS IS, PLAINLY:
///  - The rewards are the swap fees earned by the locked positions themselves (plus anything anyone chooses to deposit). Nobody
///    funds this contract and NOTHING IS PROMISED: if the pool trades little, the fees are small; if nobody who locked plays, the
///    pot rolls to the next week. A locked position is not insured against price moves (impermanent loss) of the pool.
///  - Fees are pooled: harvest() moves the fees of the locked positions into the current week's pot (the week in which harvest()
///    is CALLED, not the week in which the fees were earned). They are then redistributed to the lockers who played that week, with
///    weight sqrt(locked liquidity) x (how much they played that week, V.playOf). Play counts in full, liquidity only by its square
///    root: for the same position, twice the play is twice the weight; a position 100x larger with the same play weighs only 10x.
///    Who does not play earns nothing that week, and their own position's fees that week go to the lockers who played.
///    Caveat, said plainly: if only one locker plays in a week, that locker takes the whole pot of that week, however little it played.
///  - Lock: lock(tokenId, weeks) takes a PositionManager NFT of the TBLOCK/wtCOIN pool, full range only, for 4 to 12 whole weeks.
///    The fees the position owed BEFORE the lock are paid to the locker inside lock(). Its weight starts the NEXT week (a lock
///    taken during week c counts for weeks c+1 .. c+weeks); harvest() skips it until then, so the fees it earns during week c are
///    harvested later into a week where it has weight. The NFT can be taken back with unlock() once the last of its weeks has
///    ended (epochStart(c+1+weeks)): up to about 13 weeks after lock(). No early exit, even if the price falls. extend() adds
///    weeks with no gap; a position never spans more than MAX_SPAN_WEEKS (26) weeks in total. The NFT only ever goes back to the
///    address that locked it. Once the lock has ended, harvest() skips the position: every fee it earned since its last harvest
///    stays in the position and goes back with the NFT (waiting before unlock() costs the locker nothing).
///    unlock() also PAYS, in the same call, every reward the locker can claim at that moment for the weeks of that position (marked,
///    claims open, not yet claimed, not swept). The LAST week is still in its 6-day grace at unlockAt: unlock() marks it (if it
///    has weight) but cannot pay it; it must be claimed later with claim(end - 1), from unlockAt + 6 days, before sweepOpensAt.
///    unlockOnly() gives the NFT back WITHOUT moving any ERC-20 (for the case where a reward token refuses transfers, e.g. a pause
///    or a blocklist added by an upgrade of wtCOIN, which is an upgradeable proxy): the weeks it does not pay stay claimable with
///    claim(e) until they are swept.
///  - Weeks: week e is [T0 + e*EPOCH, T0 + (e+1)*EPOCH), EPOCH = 7 days, read from V.LIKES() at deploy (the grid of V and R2).
///  - Weight: after week e ends, during MARK_GRACE (6 days), anyone may call markWeek(e, holder) or markWeekBatch(e, holders);
///    a locker's own lock(), extend(), unlock() and claim() also mark it for the week whose grace is open. It records
///    w = sqrt(L_e(holder)) * V.playOf(e, holder), where L_e is the sum of the liquidity of the holder's positions locked for all
///    of e. Both inputs are fixed once week e has ended, so the late mark changes nothing but who is counted.
///    A holder NOT MARKED during the grace is not counted for week e (it gets nothing for e; its part goes to the marked ones,
///    it is not swept). THIS IS THE REAL DEADLINE: being marked within 6 days after the week ends is the condition to earn anything
///    for that week, and neither unlock() nor claim() can repair a missed mark. A locker who never calls this contract relies on a
///    keeper calling markWeekBatch for every locker every week.
///  - Claim: after the grace, a marked holder claims pot_e * w / W_e of each token (W_e = sum of the marked weights). If W_e == 0
///    rollover(e) moves pot_e to the next week whose claims have not opened yet (fees with no player stay with the LP lockers).
///  - Unclaimed rewards leave this contract: anyone may call sweep(e) (only when W_e > 0) once BOTH hold: sweepOpensAt(e) has
///    passed (CLAIM_WINDOW, 12 weeks, after the grace of week e ends) AND no position that covered week e is still locked here
///    (positionsIn(e) == 0). So a week is never swept while one of its lockers still has its NFT in this contract, however
///    late that locker unlocks or however far it extended; unlock() then pays it. Consequence, said plainly: a position that is
///    never unlocked keeps the unclaimed part of its weeks here (still reserved, still claimable) for good.
///    sweep(e) sends what is still unclaimed of week e (pot_e minus what was claimed, rounding dust included): the TBLOCK part by
///    plain transfer to V, where it joins V's FREE balance (V.free() = balance - reserved). That free balance is shared: V's
///    closeEpoch reserves part of it each week for V's own players (TBlockLock lockers who played, not the LP lockers of this
///    contract), feedContest() can move part of it to the block contest, and V's dev rescue (public 7-day announcement) can take it
///    until V renounces it. The wtCOIN part goes to R2's unassigned stock through R2's public deposit(): R2 pays it out slowly
///    (7 % of its stock per week, capped) to R2's marked playing lockers, and R2's guardian rescue (public 72-hour timelock) can
///    take it until R2's guardian renounces. So "unclaimed goes to the holders" is NOT a promise: it goes to those two contracts
///    and follows their rules. Until sweep(e) is called a late claim still works; ONCE A WEEK IS SWEPT IT CAN NO LONGER BE
///    CLAIMED (claim reverts AlreadySwept, event Swept). What was claimed is never swept. Both legs are one transaction: if one
///    of them fails (e.g. wtCOIN refusing transfers), the whole sweep reverts, nothing moves and the week stays claimable.
///  - No owner, no admin, no setter, no pause, no upgrade. The only other withdraw path is a guardian rescue door (public
///    72-hour timelock, cancelable, renounceable) that can take ONLY tokens that belong to no pot: it can never take a locked NFT,
///    never the PositionManager NFTs at all, and never a pot (assigned or not yet claimed).
contract TBlockLPLock {
    // ---------------------------------------------------------------- constants (Uniswap v4-periphery Actions.sol)
    uint8 private constant DECREASE_LIQUIDITY = 0x01;
    uint8 private constant TAKE_PAIR = 0x11;
    int24 public constant FULL_RANGE_LOWER = -887220; // TickMath.MIN_TICK rounded to tickSpacing 60
    int24 public constant FULL_RANGE_UPPER = 887220;

    uint256 public constant MIN_WEEKS = 4;
    uint256 public constant MAX_WEEKS = 12;
    uint256 public constant MAX_POSITIONS = 10; // positions locked at the same time per address
    uint256 public constant MAX_HARVEST = 50;   // tokenIds per harvest call
    uint256 public constant MAX_MARK = 200;     // holders per markWeekBatch call
    /// @dev must stay < 7 days: then at most one week (currentEpoch() - 1) is markable at a time
    uint256 public constant MARK_GRACE = 6 days;
    uint256 public constant RESCUE_DELAY = 72 hours;
    /// @notice a rescue request not executed within this window after its delay expires (audit L-2: no stale request later)
    uint256 public constant RESCUE_WINDOW = 2 days;
    /// @notice after a week's grace ends, how long its claims stay reserved for its lockers before sweep() may send the rest away
    uint256 public constant CLAIM_WINDOW = 12 weeks;
    /// @notice the most weeks a position may span in total (endEpoch - startEpoch), extend() included. Bounds the unlock() loops
    ///         (every week of the position is paid by unlock(), none is left behind) to MAX_SPAN_WEEKS iterations.
    uint256 public constant MAX_SPAN_WEEKS = 26;

    // ---------------------------------------------------------------- immutables
    ILPPositionManager public immutable PM;
    address public immutable CURRENCY0;
    address public immutable CURRENCY1;
    uint24 public immutable FEE;
    int24 public immutable TICK_SPACING;
    address public immutable HOOKS;
    bytes32 public immutable POOL_ID;
    address public immutable WTCOIN;
    address public immutable TBLOCK;
    address public immutable VAULT;
    /// @notice the weekly lock rewards R2: receives the swept wtCOIN through its public deposit()
    address public immutable REWARDS;
    uint256 public immutable T0;
    uint256 public immutable EPOCH;
    uint128 public immutable MIN_L;
    address public guardian;

    // ---------------------------------------------------------------- positions and weights
    struct Position { address locker; uint128 liquidity; uint64 startEpoch; uint64 endEpoch; } // weeks [startEpoch, endEpoch)
    mapping(uint256 => Position) public positionOf;
    mapping(address => uint256) public lockedCount;
    /// @notice sum of the liquidity of `holder`'s positions locked for all of week e
    mapping(address => mapping(uint256 => uint256)) public lockedLiquidityIn;
    /// @notice how many positions covering week e are still locked in this contract; sweep(e) waits until it is 0
    mapping(uint256 => uint256) public positionsIn;

    mapping(uint256 => mapping(address => uint256)) public weightOf; // set by markWeek (0 = not marked)
    mapping(uint256 => uint256) public totalWeight;                  // W_e
    mapping(uint256 => mapping(address => bool)) public claimed;
    /// @notice timestamp of the last harvest() that collected `tokenId` (0 = never)
    mapping(uint256 => uint256) public lastHarvestOf;

    // ---------------------------------------------------------------- pots (index 0 = WTCOIN, 1 = TBLOCK)
    mapping(uint256 => uint256[2]) private _pot;
    mapping(uint256 => bool) public rolledOver;
    mapping(uint256 => uint256[2]) private _paid; // what claims took out of _pot[e]
    /// @notice true once sweep(e) sent week e's unclaimed part to V (TBLOCK) and R2 (wtCOIN): week e can no longer be claimed
    mapping(uint256 => bool) public swept;
    uint256[2] private _reserved; // sum over weeks of pot - claimed: never rescuable

    struct Rescue { address token; address to; uint256 amount; uint256 executeAt; }
    Rescue private _rescue;

    uint256 private _pendingTokenId; // tokenId + 1 while lock() is pulling it, else 0
    address private _pendingFrom;
    uint256 private _guard = 1;

    // ---------------------------------------------------------------- events
    event Locked(address indexed locker, uint256 indexed tokenId, uint256 liquidity, uint256 startEpoch, uint256 endEpoch);
    event FeesReturned(address indexed locker, uint256 indexed tokenId, uint256 wtcoin, uint256 tblock);
    event Extended(address indexed locker, uint256 indexed tokenId, uint256 oldEndEpoch, uint256 newEndEpoch);
    event Unlocked(address indexed locker, uint256 indexed tokenId);
    event Harvested(address indexed caller, uint256 indexed epoch, uint256 harvested, uint256 skipped, uint256 wtcoin, uint256 tblock);
    event Deposited(address indexed from, address indexed token, uint256 indexed epoch, uint256 amount);
    event Marked(address indexed holder, uint256 indexed epoch, uint256 liquidity, uint256 play, uint256 weight);
    event Claimed(address indexed holder, uint256 indexed epoch, uint256 wtcoin, uint256 tblock);
    event RolledOver(uint256 indexed fromEpoch, uint256 indexed toEpoch, uint256 wtcoin, uint256 tblock);
    /// @notice week `epoch` was swept: its unclaimed wtCOIN went to R2.deposit, its unclaimed TBLOCK to V; it is closed to claims
    event Swept(uint256 indexed epoch, address indexed caller, uint256 wtcoinToRewards, uint256 tblockToVault);
    event UnlockPaid(address indexed locker, uint256 indexed tokenId, uint256 weeksPaid, uint256 wtcoin, uint256 tblock);
    event RescueRequested(address indexed token, address indexed to, uint256 amount, uint256 executeAt);
    event RescueCancelled(address indexed token, address indexed to, uint256 amount);
    event RescueExecuted(address indexed token, address indexed to, uint256 amount);
    event GuardianRenounced(address indexed oldGuardian);

    // ---------------------------------------------------------------- errors
    error BadConfig();
    error TokenHasNoCode(address token);
    error NotRewardToken(address token);
    error NotOwner();
    error WrongPool();
    error NotFullRange();
    error LiquidityTooLow();
    error BadWeeks();
    error TooManyPositions();
    error UnexpectedNFT();
    error NotLocked(uint256 tokenId);
    error NotLocker();
    error StillLocked(uint256 unlockAt);
    error LockEnded(uint256 tokenId);
    error TooManyTokenIds();
    error NotMarkable(uint256 epoch);
    error AlreadyMarked(uint256 epoch);
    error NoWeight(uint256 epoch);
    error ClaimNotOpen(uint256 epoch);
    error AlreadyClaimed(uint256 epoch);
    error NothingToRoll(uint256 epoch);
    error HasWeight(uint256 epoch);
    error AlreadySwept(uint256 epoch);
    error SweepNotOpen(uint256 opensAt);
    error StillHeld(uint256 epoch);
    error NothingToSweep(uint256 epoch);
    error BadAmount();
    error TransferFailed();
    error Reentrancy();
    error NotGuardian();
    error RescuePending(uint256 executeAt);
    error NoRescuePending();
    error RescueTooEarly(uint256 executeAt);
    error RescueExpired(uint256 expiredAt);
    error BadRecipient();
    error BadToken();
    error Subscribed();

    modifier nonReentrant() { if (_guard != 1) revert Reentrancy(); _guard = 2; _; _guard = 1; }
    modifier onlyGuardian() { if (msg.sender != guardian || msg.sender == address(0)) revert NotGuardian(); _; }

    /// @param pm the Uniswap v4 PositionManager
    /// @param key the TBLOCK/wtCOIN pool key; keccak256(abi.encode(key)) must equal poolId
    /// @param poolId the pool id (as published in tblock-hold.js TBLOCK_POOL)
    /// @param vault the holders vault V: V.playOf decides how much a holder played; V.TBLOCK() must be one of the pool currencies;
    ///        V.LIKES() gives the week grid (EPOCH must be 7 days)
    /// @param guardian_ the rescue-door holder (address(0) = no door)
    /// @param minL the minimum liquidity of a lockable position
    /// @param rewards the weekly lock rewards R2: must answer TBLOCK() == V.TBLOCK(), WTCOIN() == the pool's other currency,
    ///        VAULT() == vault
    constructor(address pm, LPPoolKey memory key, bytes32 poolId, address vault, address guardian_, uint128 minL, address rewards) {
        if (pm.code.length == 0) revert TokenHasNoCode(pm);
        if (vault.code.length == 0) revert TokenHasNoCode(vault);
        if (key.currency0.code.length == 0) revert TokenHasNoCode(key.currency0);
        if (key.currency1.code.length == 0) revert TokenHasNoCode(key.currency1);
        if (key.currency0 >= key.currency1) revert BadConfig();
        if (keccak256(abi.encode(key)) != poolId || minL == 0) revert BadConfig();
        address tblock = ILPVaultPlays(vault).TBLOCK();
        if (tblock != key.currency0 && tblock != key.currency1) revert BadConfig();
        address likes = ILPVaultPlays(vault).LIKES();
        if (likes.code.length == 0) revert TokenHasNoCode(likes);
        uint256 g = ILPLikesWeeks(likes).GENESIS();
        uint256 ep = ILPLikesWeeks(likes).EPOCH();
        if (ep != 7 days || g > block.timestamp) revert BadConfig();
        if (rewards.code.length == 0) revert TokenHasNoCode(rewards);
        address wtcoin = tblock == key.currency0 ? key.currency1 : key.currency0;
        if (ILPRewardsWeekly(rewards).TBLOCK() != tblock || ILPRewardsWeekly(rewards).WTCOIN() != wtcoin) revert BadConfig();
        if (ILPRewardsWeekly(rewards).VAULT() != vault) revert BadConfig();
        REWARDS = rewards;
        PM = ILPPositionManager(pm);
        CURRENCY0 = key.currency0;
        CURRENCY1 = key.currency1;
        FEE = key.fee;
        TICK_SPACING = key.tickSpacing;
        HOOKS = key.hooks;
        POOL_ID = poolId;
        TBLOCK = tblock;
        WTCOIN = wtcoin;
        VAULT = vault;
        T0 = g;
        EPOCH = ep;
        MIN_L = minL;
        guardian = guardian_;
    }

    // ================================================================ views

    function currentEpoch() public view returns (uint256) { return (block.timestamp - T0) / EPOCH; }
    function epochStart(uint256 e) public view returns (uint256) { return T0 + e * EPOCH; }
    function epochEnd(uint256 e) public view returns (uint256) { return T0 + (e + 1) * EPOCH; }
    function unlockAtOf(uint256 tokenId) public view returns (uint256) { return epochStart(positionOf[tokenId].endEpoch); }

    function poolKey() public view returns (LPPoolKey memory) {
        return LPPoolKey(CURRENCY0, CURRENCY1, FEE, TICK_SPACING, HOOKS);
    }

    function pot(uint256 epoch) external view returns (uint256 wtcoin, uint256 tblock) { return (_pot[epoch][0], _pot[epoch][1]); }
    function reserved() external view returns (uint256 wtcoin, uint256 tblock) { return (_reserved[0], _reserved[1]); }
    /// @notice what claims of `epoch` have paid so far
    function paid(uint256 epoch) external view returns (uint256 wtcoin, uint256 tblock) { return (_paid[epoch][0], _paid[epoch][1]); }
    /// @notice pot - claimed of `epoch` (0 once swept): what sweep(epoch) sends when it is allowed
    function unclaimed(uint256 epoch) public view returns (uint256 wtcoin, uint256 tblock) {
        if (swept[epoch]) return (0, 0);
        return (_pot[epoch][0] - _paid[epoch][0], _pot[epoch][1] - _paid[epoch][1]);
    }
    /// @notice the first timestamp at which sweep(epoch) MAY be allowed: it also needs positionsIn(epoch) == 0
    function sweepOpensAt(uint256 epoch) public view returns (uint256) { return epochEnd(epoch) + MARK_GRACE + CLAIM_WINDOW; }

    /// @notice what `holder` can claim for `epoch` now (0 if not marked, already claimed, swept, or claims not open)
    function claimable(address holder, uint256 epoch) external view returns (uint256 wtcoin, uint256 tblock) {
        if (block.timestamp < epochEnd(epoch) + MARK_GRACE || claimed[epoch][holder] || swept[epoch]) return (0, 0);
        uint256 w = weightOf[epoch][holder];
        uint256 W = totalWeight[epoch];
        if (w == 0 || W == 0) return (0, 0);
        return (mulDiv(_pot[epoch][0], w, W), mulDiv(_pot[epoch][1], w, W));
    }

    /// @notice the balance of a reward token that belongs to no pot (rounding dust, plain transfers); the only rescuable part
    function free(address token) public view returns (uint256) {
        uint256 bal = _balanceOf(token, address(this));
        uint256 i = _isReward(token) ? _idx(token) : 2;
        if (i == 2) return bal;
        return bal > _reserved[i] ? bal - _reserved[i] : 0;
    }

    function pendingRescue() external view returns (address token, address to, uint256 amount, uint256 executeAt) {
        Rescue memory r = _rescue;
        return (r.token, r.to, r.amount, r.executeAt);
    }

    // ================================================================ lock / unlock

    /// @notice locks the caller's PositionManager NFT `tokenId` for `weeks` whole weeks starting NEXT week.
    ///         The caller must own it and have approved this contract (approve or setApprovalForAll on the PositionManager).
    function lock(uint256 tokenId, uint256 weeks_) external nonReentrant {
        if (weeks_ < MIN_WEEKS || weeks_ > MAX_WEEKS) revert BadWeeks();
        if (PM.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (lockedCount[msg.sender] >= MAX_POSITIONS) revert TooManyPositions();
        (LPPoolKey memory key, uint256 info) = PM.getPoolAndPositionInfo(tokenId);
        if (keccak256(abi.encode(key)) != POOL_ID) revert WrongPool();
        if (_tickLower(info) != FULL_RANGE_LOWER || _tickUpper(info) != FULL_RANGE_UPPER) revert NotFullRange();
        uint128 L = PM.getPositionLiquidity(tokenId);
        if (L < MIN_L) revert LiquidityTooLow();

        uint256 start = currentEpoch() + 1;
        uint256 end = start + weeks_;
        positionOf[tokenId] = Position(msg.sender, L, uint64(start), uint64(end));
        lockedCount[msg.sender] += 1;
        for (uint256 e = start; e < end; e++) {
            lockedLiquidityIn[msg.sender][e] += L;
            positionsIn[e] += 1;
        }

        _pendingTokenId = tokenId + 1;
        _pendingFrom = msg.sender;
        PM.safeTransferFrom(msg.sender, address(this), tokenId);
        if (_pendingTokenId != 0) revert UnexpectedNFT(); // the callback must have consumed it
        _pendingFrom = address(0);
        if (PM.ownerOf(tokenId) != address(this)) revert UnexpectedNFT();
        (, uint256 infoAfter) = PM.getPoolAndPositionInfo(tokenId);
        if (infoAfter & 0xff != 0) revert Subscribed(); // nobody may stay notified of (and able to revert) our harvests
        // the fees the position owed BEFORE this lock are the locker's: pay them to the locker now, so no harvest can pool them
        uint256 w0 = _balanceOf(WTCOIN, msg.sender);
        uint256 t0 = _balanceOf(TBLOCK, msg.sender);
        _collect(tokenId, msg.sender);
        emit FeesReturned(msg.sender, tokenId, _balanceOf(WTCOIN, msg.sender) - w0, _balanceOf(TBLOCK, msg.sender) - t0);
        emit Locked(msg.sender, tokenId, L, start, end);
        _selfMark(msg.sender);
    }

    /// @notice adds `addWeeks` weeks right after the current end of the caller's lock, with no gap. Only before the lock ends;
    ///         the remaining locked weeks (from next week) may not exceed MAX_WEEKS, and the whole position may not span more than
    ///         MAX_SPAN_WEEKS weeks.
    function extend(uint256 tokenId, uint256 addWeeks) external nonReentrant {
        Position memory p = positionOf[tokenId];
        if (p.locker == address(0)) revert NotLocked(tokenId);
        if (msg.sender != p.locker) revert NotLocker();
        if (block.timestamp >= epochStart(p.endEpoch)) revert LockEnded(tokenId);
        uint256 newEnd = uint256(p.endEpoch) + addWeeks;
        if (addWeeks == 0 || newEnd - (currentEpoch() + 1) > MAX_WEEKS) revert BadWeeks();
        if (newEnd - p.startEpoch > MAX_SPAN_WEEKS) revert BadWeeks();
        for (uint256 e = p.endEpoch; e < newEnd; e++) {
            lockedLiquidityIn[msg.sender][e] += p.liquidity;
            positionsIn[e] += 1;
        }
        positionOf[tokenId].endEpoch = uint64(newEnd);
        emit Extended(msg.sender, tokenId, p.endEpoch, newEnd);
        _selfMark(msg.sender);
    }

    /// @notice accepts an NFT only from the PositionManager, only the one lock() is pulling, only from its locker
    function onERC721Received(address, address from, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(PM) || _pendingTokenId != tokenId + 1 || from != _pendingFrom) revert UnexpectedNFT();
        _pendingTokenId = 0;
        return this.onERC721Received.selector;
    }

    /// @notice gives the NFT back to its locker once its last locked week has ended, AND pays in the same call every reward the
    ///         locker can claim now for the weeks of this position: each week e in [startEpoch, endEpoch) (at most MAX_SPAN_WEEKS)
    ///         that is marked for the locker, whose claims are open, not claimed and not swept (claim()'s rule and amounts, one
    ///         Claimed event per week). Nothing to pay is not an error. A week still in its grace (usually the last one, marked
    ///         here) stays claimable later with claim(e). Fees earned since the last harvest stay in the position and go with it
    ///         (no harvest is forced here: a failing PositionManager call can never trap the NFT). If a reward transfer reverts
    ///         (a paused or blocklisting reward token), this call reverts: use unlockOnly(), which moves no ERC-20.
    function unlock(uint256 tokenId) external nonReentrant {
        Position memory p = _release(tokenId);
        uint256 t0;
        uint256 t1;
        uint256 n;
        for (uint256 e = p.startEpoch; e < p.endEpoch; e++) {
            if (block.timestamp < epochEnd(e) + MARK_GRACE) break; // the later weeks are not open either
            if (claimed[e][p.locker] || swept[e] || weightOf[e][p.locker] == 0) continue;
            (uint256 a0, uint256 a1) = _book(e, p.locker);
            t0 += a0;
            t1 += a1;
            n++;
        }
        PM.transferFrom(address(this), p.locker, tokenId);
        emit Unlocked(p.locker, tokenId);
        if (t0 != 0) _safeTransfer(WTCOIN, p.locker, t0);
        if (t1 != 0) _safeTransfer(TBLOCK, p.locker, t1);
        emit UnlockPaid(p.locker, tokenId, n, t0, t1);
    }

    /// @notice the way out that moves NO ERC-20: gives the NFT back to its locker once its last locked week has ended and pays
    ///         nothing. Every week of the position that is not paid stays claimable with claim(e) until it is swept (and, since the
    ///         position no longer holds it, week e may be swept as soon as sweepOpensAt(e) has passed and no other position covers
    ///         it). Meant for the case where a reward token refuses transfers (unlock() would revert and trap the NFT).
    function unlockOnly(uint256 tokenId) external nonReentrant {
        Position memory p = _release(tokenId);
        PM.transferFrom(address(this), p.locker, tokenId);
        emit Unlocked(p.locker, tokenId);
    }

    /// @dev the checks and bookkeeping shared by unlock() and unlockOnly(): only the locker, only once the lock has ended; marks
    ///      the week whose grace is open, deletes the position and releases its weeks (positionsIn)
    function _release(uint256 tokenId) private returns (Position memory p) {
        p = positionOf[tokenId];
        if (p.locker == address(0)) revert NotLocked(tokenId);
        if (msg.sender != p.locker) revert NotLocker();
        uint256 at = epochStart(p.endEpoch);
        if (block.timestamp < at) revert StillLocked(at);
        _selfMark(p.locker); // the last locked week is in its grace right at unlockAt: count it before the NFT leaves
        delete positionOf[tokenId];
        lockedCount[p.locker] -= 1;
        for (uint256 e = p.startEpoch; e < p.endEpoch; e++) positionsIn[e] -= 1;
    }

    // ================================================================ funding

    /// @notice permissionless: collects the swap fees of the listed positions held by this contract into the current week's pot.
    ///         DECREASE_LIQUIDITY of 0 liquidity + TAKE_PAIR to this contract: the principal is never touched.
    ///         Skipped, never reverting the batch: ids not held here, and ids whose weight has not started yet (locked this week;
    ///         their fees are harvested from next week on, into a week where their locker has weight), and ended locks still held
    ///         (their locker has no weight in the current week: what they earned since their last harvest goes back with the NFT).
    function harvest(uint256[] calldata tokenIds) external nonReentrant {
        uint256 n = tokenIds.length;
        if (n == 0 || n > MAX_HARVEST) revert TooManyTokenIds();
        uint256 b0 = _balanceOf(WTCOIN, address(this));
        uint256 b1 = _balanceOf(TBLOCK, address(this));
        uint256 e = currentEpoch();
        uint256 done;
        for (uint256 k = 0; k < n; k++) {
            uint256 id = tokenIds[k];
            Position memory p = positionOf[id];
            if (p.locker == address(0) || e < p.startEpoch || e >= p.endEpoch) continue;
            _collect(id, address(this));
            lastHarvestOf[id] = block.timestamp;
            done++;
        }
        uint256 a0 = _balanceOf(WTCOIN, address(this)) - b0;
        uint256 a1 = _balanceOf(TBLOCK, address(this)) - b1;
        _addToPot(e, 0, a0);
        _addToPot(e, 1, a1);
        emit Harvested(msg.sender, e, done, n - done, a0, a1);
    }

    /// @dev DECREASE_LIQUIDITY(tokenId, 0) + TAKE_PAIR(currency0, currency1, to): pays the position's owed fees to `to`
    function _collect(uint256 tokenId, address to) private {
        bytes memory actions = abi.encodePacked(DECREASE_LIQUIDITY, TAKE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(CURRENCY0, CURRENCY1, to);
        PM.modifyLiquidities(abi.encode(actions, params), block.timestamp);
    }

    /// @notice anyone may add wtCOIN or TBLOCK to the current week's pot; the amount is measured by the balance before and after
    function deposit(address token, uint256 amount) external nonReentrant {
        uint256 i = _idx(token);
        if (amount == 0) revert BadAmount();
        uint256 before = _balanceOf(token, address(this));
        (bool ok, bytes memory r) = token.call(abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
        uint256 arrived = _balanceOf(token, address(this)) - before;
        if (arrived == 0) revert BadAmount();
        uint256 e = currentEpoch();
        _addToPot(e, i, arrived);
        emit Deposited(msg.sender, token, e, arrived);
    }

    function _addToPot(uint256 e, uint256 i, uint256 a) private {
        if (a == 0) return;
        _pot[e][i] += a;
        _reserved[i] += a;
    }

    // ================================================================ weeks

    /// @notice permissionless: records holder's weight for week `epoch` = sqrt(locked liquidity for all of it) x V.playOf(epoch,
    ///         holder). Only after the week ended and before MARK_GRACE ends. Unmarked holders are not counted.
    function markWeek(uint256 epoch, address holder) external nonReentrant {
        if (!_markable(epoch)) revert NotMarkable(epoch);
        if (weightOf[epoch][holder] != 0) revert AlreadyMarked(epoch);
        if (!_mark(epoch, holder)) revert NoWeight(epoch);
    }

    /// @notice permissionless batch of markWeek: holders already marked or with no weight are skipped, never reverting the batch
    /// @return marked how many holders this call marked
    function markWeekBatch(uint256 epoch, address[] calldata holders) external nonReentrant returns (uint256 marked) {
        if (holders.length == 0 || holders.length > MAX_MARK) revert BadAmount();
        if (!_markable(epoch)) revert NotMarkable(epoch);
        for (uint256 k = 0; k < holders.length; k++) {
            if (weightOf[epoch][holders[k]] == 0 && _mark(epoch, holders[k])) marked++;
        }
    }

    function _markable(uint256 epoch) private view returns (bool) {
        uint256 end = epochEnd(epoch);
        return block.timestamp >= end && block.timestamp < end + MARK_GRACE;
    }

    /// @dev records the weight if positive; the caller checked the window and that holder is not marked yet
    function _mark(uint256 epoch, address holder) private returns (bool) {
        uint256 L = lockedLiquidityIn[holder][epoch];
        if (L == 0) return false;
        // audit L-1: a reverting vault read must never trap an exit (unlock/unlockOnly self-mark): it counts as no play
        uint256 play;
        try ILPVaultPlays(VAULT).playOf(epoch, holder) returns (uint256 p_) { play = p_; } catch { return false; }
        uint256 w = sqrt(L) * play;
        if (w == 0) return false;
        weightOf[epoch][holder] = w;
        totalWeight[epoch] += w;
        emit Marked(holder, epoch, L, play, w);
        return true;
    }

    /// @dev marks `holder` for the one week whose grace is open (currentEpoch() - 1), if it is not marked yet and has weight
    function _selfMark(address holder) private {
        uint256 c = currentEpoch();
        if (c == 0) return;
        uint256 e = c - 1;
        if (_markable(e) && weightOf[e][holder] == 0) _mark(e, holder);
    }

    /// @notice permissionless: when nobody was marked for `epoch` (W == 0), moves its pot to the next week whose claims are not open
    function rollover(uint256 epoch) external nonReentrant {
        if (block.timestamp < epochEnd(epoch) + MARK_GRACE) revert ClaimNotOpen(epoch);
        if (totalWeight[epoch] != 0) revert HasWeight(epoch);
        uint256 p0 = _pot[epoch][0];
        uint256 p1 = _pot[epoch][1];
        if (p0 == 0 && p1 == 0) revert NothingToRoll(epoch);
        uint256 to = block.timestamp < epochEnd(epoch + 1) + MARK_GRACE ? epoch + 1 : currentEpoch();
        _pot[epoch][0] = 0;
        _pot[epoch][1] = 0;
        _pot[to][0] += p0;
        _pot[to][1] += p1;
        rolledOver[epoch] = true;
        emit RolledOver(epoch, to, p0, p1);
    }

    /// @notice pays msg.sender, and only msg.sender, pot_e * w / W_e of each token, once, after MARK_GRACE, until the week is
    ///         swept (a swept week can no longer be claimed: AlreadySwept)
    function claim(uint256 epoch) external nonReentrant returns (uint256 a0, uint256 a1) {
        if (block.timestamp < epochEnd(epoch) + MARK_GRACE) revert ClaimNotOpen(epoch);
        if (swept[epoch]) revert AlreadySwept(epoch);
        if (claimed[epoch][msg.sender]) revert AlreadyClaimed(epoch);
        if (weightOf[epoch][msg.sender] == 0) revert NoWeight(epoch);
        (a0, a1) = _book(epoch, msg.sender);
        if (a0 != 0) _safeTransfer(WTCOIN, msg.sender, a0);
        if (a1 != 0) _safeTransfer(TBLOCK, msg.sender, a1);
        _selfMark(msg.sender);
    }

    /// @dev books holder's claim of `epoch` (the caller checked: open, not swept, not claimed, weight > 0); the transfer is the
    ///      caller's
    function _book(uint256 epoch, address holder) private returns (uint256 a0, uint256 a1) {
        uint256 w = weightOf[epoch][holder];
        uint256 W = totalWeight[epoch];
        claimed[epoch][holder] = true;
        a0 = mulDiv(_pot[epoch][0], w, W);
        a1 = mulDiv(_pot[epoch][1], w, W);
        _paid[epoch][0] += a0;
        _paid[epoch][1] += a1;
        _reserved[0] -= a0;
        _reserved[1] -= a1;
        emit Claimed(holder, epoch, a0, a1);
    }

    /// @notice permissionless, from sweepOpensAt(epoch) (CLAIM_WINDOW after the grace of `epoch` ended) AND only once no position
    ///         covering `epoch` is still locked here (positionsIn(epoch) == 0), once, only for a week with weight (W == 0 uses
    ///         rollover): sends what is still unclaimed of `epoch` (pot - claimed, rounding dust included) away. TBLOCK: plain
    ///         transfer to V, where it joins V.free() (shared by V's weekly player budgets, feedContest and V's dev rescue until
    ///         renounced). wtCOIN: approve R2 the exact amount, then R2.deposit(wtCOIN, amount): R2's unassigned stock (paid at 7 %
    ///         a week to R2's playing lockers, reachable by R2's guardian rescue until renounced). Both are checked by balance diff.
    ///         Atomic: if either leg reverts, nothing moves and the week stays claimable. Week `epoch` can no longer be claimed
    ///         afterwards.
    function sweep(uint256 epoch) external nonReentrant returns (uint256 a0, uint256 a1) {
        uint256 opens = sweepOpensAt(epoch);
        if (block.timestamp < opens) revert SweepNotOpen(opens);
        if (positionsIn[epoch] != 0) revert StillHeld(epoch);
        if (swept[epoch]) revert AlreadySwept(epoch);
        if (totalWeight[epoch] == 0) revert NoWeight(epoch);
        (a0, a1) = unclaimed(epoch);
        if (a0 == 0 && a1 == 0) revert NothingToSweep(epoch);
        swept[epoch] = true;
        _reserved[0] -= a0;
        _reserved[1] -= a1;
        if (a1 != 0) {
            uint256 vb = _balanceOf(TBLOCK, VAULT);
            uint256 sb = _balanceOf(TBLOCK, address(this));
            _safeTransfer(TBLOCK, VAULT, a1);
            if (_balanceOf(TBLOCK, VAULT) - vb != a1 || sb - _balanceOf(TBLOCK, address(this)) != a1) revert TransferFailed();
        }
        if (a0 != 0) {
            uint256 rb = _balanceOf(WTCOIN, REWARDS);
            uint256 sb = _balanceOf(WTCOIN, address(this));
            (bool ok, bytes memory r) = WTCOIN.call(abi.encodeWithSelector(0x095ea7b3, REWARDS, a0));
            if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
            ILPRewardsWeekly(REWARDS).deposit(WTCOIN, a0);
            if (_balanceOf(WTCOIN, REWARDS) - rb != a0 || sb - _balanceOf(WTCOIN, address(this)) != a0) revert TransferFailed();
        }
        emit Swept(epoch, msg.sender, a0, a1);
    }

    // ================================================================ rescue door (guardian, 72 h public timelock)

    /// @notice the guardian may ask to move an ERC-20 balance that belongs to no pot. Never the PositionManager (no NFT path).
    function rescueRequest(address token, address to, uint256 amount) external onlyGuardian {
        if (token == address(PM) || token.code.length == 0) revert BadToken();
        if (to == address(0) || to == address(this)) revert BadRecipient();
        if (amount == 0) revert BadAmount();
        if (_rescue.executeAt != 0) revert RescuePending(_rescue.executeAt);
        uint256 at = block.timestamp + RESCUE_DELAY;
        _rescue = Rescue(token, to, amount, at);
        emit RescueRequested(token, to, amount, at);
    }

    function rescueCancel() external onlyGuardian {
        Rescue memory r = _rescue;
        if (r.executeAt == 0) revert NoRescuePending();
        delete _rescue;
        emit RescueCancelled(r.token, r.to, r.amount);
    }

    /// @notice sends min(amount, free(token)): a pot (claimed or not, current or past) is never reachable
    function rescueExecute() external onlyGuardian nonReentrant {
        Rescue memory r = _rescue;
        if (r.executeAt == 0) revert NoRescuePending();
        if (block.timestamp < r.executeAt) revert RescueTooEarly(r.executeAt);
        if (block.timestamp > r.executeAt + RESCUE_WINDOW) revert RescueExpired(r.executeAt + RESCUE_WINDOW);
        delete _rescue;
        uint256 f = free(r.token);
        uint256 amount = r.amount < f ? r.amount : f;
        if (amount != 0) _safeTransfer(r.token, r.to, amount);
        emit RescueExecuted(r.token, r.to, amount);
    }

    function renounceGuardian() external onlyGuardian {
        address old = guardian;
        guardian = address(0);
        delete _rescue;
        emit GuardianRenounced(old);
    }

    // ================================================================ internals

    /// @dev v4-periphery PositionInfoLibrary: 200 bits poolId | 24 bits tickUpper | 24 bits tickLower | 8 bits hasSubscriber
    function _tickLower(uint256 info) private pure returns (int24) { return int24(uint24(info >> 8)); }
    function _tickUpper(uint256 info) private pure returns (int24) { return int24(uint24(info >> 32)); }

    function _isReward(address token) private view returns (bool) { return token == WTCOIN || token == TBLOCK; }

    function _idx(address token) private view returns (uint256) {
        if (token == WTCOIN) return 0;
        if (token == TBLOCK) return 1;
        revert NotRewardToken(token);
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        if (token.code.length == 0) revert TokenHasNoCode(token);
        (bool ok, bytes memory r) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
    }

    function _balanceOf(address token, address a) private view returns (uint256) {
        if (token.code.length == 0) revert TokenHasNoCode(token);
        (bool ok, bytes memory r) = token.staticcall(abi.encodeWithSelector(0x70a08231, a));
        if (!ok || r.length < 32) revert TransferFailed();
        return abi.decode(r, (uint256));
    }

    /// @notice floor(sqrt(x)) (Babylonian method from a power-of-two first guess, as OpenZeppelin Math.sqrt)
    function sqrt(uint256 x) public pure returns (uint256) {
        if (x == 0) return 0;
        uint256 r = 1;
        uint256 xx = x;
        if (xx >= 1 << 128) { xx >>= 128; r <<= 64; }
        if (xx >= 1 << 64) { xx >>= 64; r <<= 32; }
        if (xx >= 1 << 32) { xx >>= 32; r <<= 16; }
        if (xx >= 1 << 16) { xx >>= 16; r <<= 8; }
        if (xx >= 1 << 8) { xx >>= 8; r <<= 4; }
        if (xx >= 1 << 4) { xx >>= 4; r <<= 2; }
        if (xx >= 1 << 2) { r <<= 1; }
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        r = (r + x / r) >> 1;
        uint256 q = x / r;
        return r < q ? r : q;
    }

    /// @notice floor(x * y / d) with a 512-bit intermediate product (Remco Bloemen / OpenZeppelin Math.mulDiv). Reverts if d == 0
    ///         or the result does not fit in 256 bits.
    function mulDiv(uint256 x, uint256 y, uint256 d) public pure returns (uint256 result) {
        unchecked {
            uint256 prod0 = x * y;
            uint256 prod1;
            assembly {
                let mm := mulmod(x, y, not(0))
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            if (prod1 == 0) return prod0 / d; // checked division: d == 0 panics
            require(d > prod1, "mulDiv overflow");
            uint256 remainder;
            assembly {
                remainder := mulmod(x, y, d)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            uint256 twos = d & (0 - d);
            assembly {
                d := div(d, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            uint256 inverse = (3 * d) ^ 2;
            inverse *= 2 - d * inverse;
            inverse *= 2 - d * inverse;
            inverse *= 2 - d * inverse;
            inverse *= 2 - d * inverse;
            inverse *= 2 - d * inverse;
            inverse *= 2 - d * inverse;
            result = prod0 * inverse;
        }
    }
}
