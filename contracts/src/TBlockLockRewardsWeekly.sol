// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The read surface of the deployed TBlockLock v1 (copied from contracts/src/TBlockLock.sol).
interface ITBlockLockW {
    function TBLOCK() external view returns (address);
    function lockedOf(address a) external view returns (uint256);
    function unlockAtOf(address a) external view returns (uint256);
    function requestedAtOf(address a) external view returns (uint256);
}

/// @notice The read surface of the deployed TBlockVaultV2 (the weekly holders vault): who played which week.
interface IVaultPlays {
    function LIKES() external view returns (address);
    function LOCK() external view returns (address);
    function TBLOCK() external view returns (address);
    /// raw TBLOCK a player put into play in week e: hearts burned (BlockLikesV2.spentIn) + TBLOCK bought by listed games (TAM, Skins v3)
    function playOf(uint256 e, address player) external view returns (uint256);
}

/// @notice The read surface of the deployed BlockLikesV2: its week grid is the grid of this contract.
interface ILikesWeeks {
    function GENESIS() external view returns (uint64);
    function EPOCH() external view returns (uint64);
    function LOCK() external view returns (address);
    function TBLOCK() external view returns (address);
}

/// @title TBlockLockRewardsWeekly - pays wtCOIN and TBLOCK, EVERY WEEK, to TBlockLock v1 lockers who PLAYED that week.
/// @notice Phil 2026-11-13: "faut pas attendre aussi longtemps [...] et le weekly paid aussi". The monthly TBlockLockRewards (R) is
///         immutable (EPOCH = 30 days, first payout 2027-01-11) and holds the hook's creator payee slot for good (it has no function to
///         pass it on). This contract is its weekly twin: same weights, same bands, same lock + play rule, same rescue door, derived
///         from R's reviewed code with these changes only:
///  - WEEKS: epoch e is BlockLikesV2's week e ([GENESIS + e*EPOCH, GENESIS + (e+1)*EPOCH), EPOCH = 7 days), read from the Likes contract
///    at deploy. The same grid as the holders vault V, so "played in week e" means the same thing everywhere.
///  - PLAY IS READ, NOT PUSHED: a locker played week e when V.playOf(e, holder) > 0 (hearts burned + TBLOCK bought by V's listed games:
///    TAM and Skins v3). No game calls this contract and none needs to be redeployed. markPlayed(holder, e) - PERMISSIONLESS (the app
///    adds it to the heart's batch; anyone may call it for anyone, it only makes the contract see what V already says) - records the
///    holder's weight for e once (PLAYED bit) and adds it to playedWeight[e], during week e or in the MARK_GRACE day after it, before
///    the close. playOf only grows and V writes a week only while it is current, so a mark can never become false. A weight cut during
///    e (exit request -> sync / enroll) is first taken back out of playedWeight[e] (_unplay, R's code).
///  - POT (R's rule, restored after review 2026-11-13 MEDIUM-1: paying full * w / W and reserving the non-players' parts for weeks
///    starved the pot to ~9 % of the stock): closeEpoch(e), once MARK_GRACE has passed after e, P = min(playedWeight, W),
///    pot = full * P / W with full = min(unassigned * REWARD_BPS / 10000, MAX_POT). A marked player is paid floor(pot * w / P) ~=
///    floor(full * w / W). The non-players' part is NEVER assigned: it stays in the stock for the next weeks. A player not marked
///    before the close is not paid for that week (its part stays in the stock too).
///  - PACE (review MEDIUM-2): REWARD_BPS = 700 per week, ~25 % of the stock per ~4.3 weeks, i.e. R's monthly 25 % spread over weeks.
///  - START: the first epoch that can be closed is the week of the deploy (no empty closes of past weeks). A weight counts from the week
///    AFTER the enroll (as in R: a lock taken just before a close cannot take that week), so the first payout is at most two weeks away.
///  - FUNDING: public deposit() and plain transfers. R's guardian can move R's unassigned rewards here only through R's own public
///    72-hour rescue door; that is R's rule, not a power of this contract. No PoolManager redeem: this contract is not a hook payee.
///  - No owner, no admin, no pause, no upgrade, no parameter change. THE ONLY WITHDRAW PATH is the same dev rescue door as R: an
///    immutable-at-deploy guardian, one request at a time, public 72-hour timelock, cancelable, renounceable one way.
contract TBlockLockRewardsWeekly {
    // ---------------------------------------------------------------- immutables and constants
    address public immutable TBLOCK;
    address public immutable WTCOIN;
    address public immutable LOCK;
    address public immutable VAULT;
    address public immutable LIKES;
    uint256 public immutable T0;
    uint256 public immutable EPOCH;
    uint256 public immutable START_EPOCH;
    uint256 public immutable MAX_POT_WTCOIN;
    uint256 public immutable MAX_POT_TBLOCK;
    address public guardian;

    uint256 public constant REWARD_BPS = 700;
    uint256 public constant MARK_GRACE = 1 days; // after a week ends: plays can still be marked, then the week can be closed
    uint256 public constant CLAIM_WINDOW = 8; // weeks after a week is closed before release() may sweep what nobody claimed
    uint256 public constant MAX_CLAIM_EPOCHS = 24;
    uint256 public constant RESCUE_DELAY = 72 hours;
    uint256 public constant BPS = 10_000;

    struct Rescue { address token; address to; uint256 amount; uint256 executeAt; }
    Rescue private _rescue;

    // ---------------------------------------------------------------- weights
    struct Checkpoint { uint64 fromEpoch; uint64 lastEpoch; uint128 weight; }
    struct Enrollment { uint64 unlockAt; uint64 commitStart; uint128 amount; } // amount = lockedOf at the last enroll

    mapping(address => Checkpoint[]) private _checkpoints;
    mapping(address => Enrollment) public enrollmentOf;
    mapping(uint256 => int256) private _delta;      // change of total weight starting at epoch e
    mapping(uint256 => uint256) public totalWeight;  // set when epoch e is closed
    int256 private _runningWeight;

    // ---------------------------------------------------------------- pots (index 0 = WTCOIN, 1 = TBLOCK)
    uint256 public nextEpochToClose;
    uint256 public nextEpochToRelease;
    mapping(uint256 => uint256[2]) private _pot;
    mapping(uint256 => uint256[2]) private _cut;
    mapping(uint256 => uint256[2]) private _left;
    uint256[2] private _outstanding;                  // sum of _left over open (closed, not released) epochs
    mapping(address => mapping(uint256 => bool)) public claimed;
    /// @notice true once markPlayed recorded the holder's weight for week e (the holder will be paid for e)
    mapping(address => mapping(uint256 => bool)) public marked;
    /// @notice during week e (and its grace day): the live sum of the marked holders' weights. At closeEpoch(e): P = min(sum, W).
    mapping(uint256 => uint256) public playedWeight;
    mapping(uint256 => uint256) public claimedWeight; // sum of the weights that have claimed epoch e
    mapping(uint256 => uint256) public closedAt;      // timestamp at which epoch e was closed (0 = not closed)

    uint256 private _guard = 1;

    // ---------------------------------------------------------------- events
    event Enrolled(address indexed holder, uint256 weight, uint256 fromEpoch, uint256 lastFullEpoch, uint256 bandBps);
    event Synced(address indexed holder, uint256 removedWeight, uint256 fromEpoch);
    event EpochClosed(uint256 indexed epoch, uint256 potWtcoin, uint256 potTblock, uint256 totalWeight, uint256 playedWeight);
    event Marked(address indexed holder, uint256 indexed epoch, uint256 weight);
    event PlayVoided(address indexed holder, uint256 indexed epoch, uint256 weight);
    event Claimed(address indexed holder, uint256 wtcoin, uint256 tblock, uint256 epochs);
    event Released(uint256 indexed epoch, uint256 wtcoin, uint256 tblock);
    event Deposited(address indexed from, address indexed token, uint256 amount);
    event RescueRequested(address indexed token, address indexed to, uint256 amount, uint256 executeAt);
    event RescueCancelled(address indexed token, address indexed to, uint256 amount);
    event RescueExecuted(address indexed token, address indexed to, uint256 amount, uint256 fromUnassigned, uint256 fromEpochs);
    event GuardianRenounced(address indexed oldGuardian);

    // ---------------------------------------------------------------- errors
    error BadConfig();
    error TokenHasNoCode(address token);
    error NotRewardToken(address token);
    error EpochNotEnded(uint256 epoch);
    error EpochOutOfOrder(uint256 expected);
    error EpochNotClosed(uint256 epoch);
    error EpochReleased(uint256 epoch);
    error ReleaseTooEarly(uint256 epoch);
    error AlreadyClaimed(uint256 epoch);
    error NoWeight(uint256 epoch);
    error TooManyEpochs();
    error NoEpochs();
    error BadAmount();
    error TransferFailed();
    error Reentrancy();
    error NotGuardian();
    error RescuePending(uint256 executeAt);
    error NoRescuePending();
    error RescueTooEarly(uint256 executeAt);
    error BadRecipient();
    error NotPlayed(uint256 epoch);
    error NotMarkable(uint256 epoch);

    modifier nonReentrant() { if (_guard != 1) revert Reentrancy(); _guard = 2; _; _guard = 1; }
    modifier onlyGuardian() { if (msg.sender != guardian || msg.sender == address(0)) revert NotGuardian(); _; }

    /// @param tblock TBLOCK token (must equal lock.TBLOCK(), vault.TBLOCK() and likes.TBLOCK())
    /// @param wtcoin wtCOIN token
    /// @param lock TBlockLock v1 (must equal vault.LOCK() and likes.LOCK())
    /// @param vault TBlockVaultV2: its playOf decides "played"; its LIKES() gives the week grid (EPOCH must be 7 days)
    /// @param guardian_ the rescue-door holder; Phil supplies it at deploy (address(0) = no door)
    /// @param maxPotWtcoin per-week cap on the wtCOIN pot (raw units)
    /// @param maxPotTblock per-week cap on the TBLOCK pot (raw units)
    constructor(
        address tblock,
        address wtcoin,
        address lock,
        address vault,
        address guardian_,
        uint256 maxPotWtcoin,
        uint256 maxPotTblock
    ) {
        if (tblock.code.length == 0) revert TokenHasNoCode(tblock);
        if (wtcoin.code.length == 0) revert TokenHasNoCode(wtcoin);
        if (lock.code.length == 0) revert TokenHasNoCode(lock);
        if (vault.code.length == 0) revert TokenHasNoCode(vault);
        if (tblock == wtcoin || ITBlockLockW(lock).TBLOCK() != tblock) revert BadConfig();
        if (IVaultPlays(vault).TBLOCK() != tblock || IVaultPlays(vault).LOCK() != lock) revert BadConfig();
        address likes = IVaultPlays(vault).LIKES();
        if (likes.code.length == 0) revert TokenHasNoCode(likes);
        if (ILikesWeeks(likes).TBLOCK() != tblock || ILikesWeeks(likes).LOCK() != lock) revert BadConfig();
        uint256 g = ILikesWeeks(likes).GENESIS();
        uint256 ep = ILikesWeeks(likes).EPOCH();
        if (ep != 7 days || g > block.timestamp || maxPotWtcoin == 0 || maxPotTblock == 0) revert BadConfig();
        TBLOCK = tblock;
        WTCOIN = wtcoin;
        LOCK = lock;
        VAULT = vault;
        LIKES = likes;
        T0 = g;
        EPOCH = ep;
        guardian = guardian_;
        MAX_POT_WTCOIN = maxPotWtcoin;
        MAX_POT_TBLOCK = maxPotTblock;
        uint256 s = (block.timestamp - g) / ep;
        START_EPOCH = s;
        nextEpochToClose = s;
        nextEpochToRelease = s;
    }

    // ================================================================ views

    function currentEpoch() public view returns (uint256) { return (block.timestamp - T0) / EPOCH; }
    function epochStart(uint256 e) public view returns (uint256) { return T0 + e * EPOCH; }
    function epochEnd(uint256 e) public view returns (uint256) { return T0 + (e + 1) * EPOCH; }

    /// @notice the commitment band in basis points, identical to points.js ENGAGEMENT (and to R)
    function multiplierBps(uint256 commitSeconds) public pure returns (uint256) {
        if (commitSeconds >= 365 days) return 20_000;
        if (commitSeconds >= 180 days) return 17_500;
        if (commitSeconds >= 90 days) return 15_000;
        if (commitSeconds >= 30 days) return 12_500;
        return 10_000;
    }

    /// @notice the last week that ends at or before `unlockAt`; returns (false, 0) when none does
    function lastFullEpoch(uint256 unlockAt) public view returns (bool ok, uint256 e) {
        if (unlockAt < T0 + EPOCH) return (false, 0);
        return (true, (unlockAt - T0) / EPOCH - 1);
    }

    /// @notice for the UI: the weeks a lock ending at `unlockAt` would be paid for if enrolled now (count == 0: it earns nothing)
    function rewardEpochsFor(uint256 unlockAt) external view returns (uint256 firstEpoch, uint256 lastEpoch, uint256 count) {
        firstEpoch = currentEpoch() + 1;
        (bool ok, uint256 last) = lastFullEpoch(unlockAt);
        if (!ok || last < firstEpoch || unlockAt <= block.timestamp) return (firstEpoch, 0, 0);
        return (firstEpoch, last, last - firstEpoch + 1);
    }

    function weightOf(address holder, uint256 epoch) public view returns (uint256) {
        Checkpoint[] storage cps = _checkpoints[holder];
        uint256 n = cps.length;
        for (uint256 i = n; i > 0; i--) {
            Checkpoint storage c = cps[i - 1];
            if (epoch >= c.fromEpoch) return epoch <= c.lastEpoch ? c.weight : 0;
        }
        return 0;
    }

    function checkpointsOf(address holder) external view returns (Checkpoint[] memory) { return _checkpoints[holder]; }

    /// @notice the total weight of a not-yet-closed week, as the lazy cursor would compute it now
    function projectedTotalWeight(uint256 epoch) external view returns (uint256) {
        if (epoch < nextEpochToClose) return totalWeight[epoch];
        int256 w = _runningWeight;
        for (uint256 e = nextEpochToClose; e <= epoch; e++) w += _delta[e];
        return uint256(w);
    }

    function pot(uint256 epoch) external view returns (uint256 wtcoin, uint256 tblock) { return (_pot[epoch][0], _pot[epoch][1]); }
    function cut(uint256 epoch) external view returns (uint256 wtcoin, uint256 tblock) { return (_cut[epoch][0], _cut[epoch][1]); }
    function left(uint256 epoch) external view returns (uint256 wtcoin, uint256 tblock) { return (_left[epoch][0], _left[epoch][1]); }
    function outstanding() external view returns (uint256 wtcoin, uint256 tblock) { return (_outstanding[0], _outstanding[1]); }

    /// @notice the balance not promised to any open week; this is what closeEpoch draws from and what a rescue takes first
    function unassigned(address token) public view returns (uint256) {
        uint256 i = _idx(token);
        uint256 bal = _balanceOf(token, address(this));
        return bal > _outstanding[i] ? bal - _outstanding[i] : 0;
    }

    /// @notice for the UI ("you played this week"): the vault recorded a play of `holder` in week `epoch`
    function hasPlayed(address holder, uint256 epoch) public view returns (bool) {
        return IVaultPlays(VAULT).playOf(epoch, holder) > 0;
    }

    /// @notice what `holder` would receive for `epochs` right now (0 for weeks not played, claimed, released, or not closed)
    function claimable(address holder, uint256[] calldata epochs) external view returns (uint256 wtcoin, uint256 tblock) {
        for (uint256 k = 0; k < epochs.length; k++) {
            uint256 e = epochs[k];
            if (e >= nextEpochToClose || e < nextEpochToRelease || claimed[holder][e]) continue;
            uint256 w = weightOf(holder, e);
            if (w == 0 || !marked[holder][e]) continue;
            wtcoin += _share(e, 0, w);
            tblock += _share(e, 1, w);
        }
    }

    /// @notice for the UI: "dev rescue pending, executes at T". executeAt == 0 means none pending.
    function pendingRescue() external view returns (address token, address to, uint256 amount, uint256 executeAt) {
        Rescue memory r = _rescue;
        return (r.token, r.to, r.amount, r.executeAt);
    }

    // ================================================================ weights

    /// @notice re-reads holder's lock in TBlockLock and rewrites its weight from the next week on. Permissionless (as in R).
    function enroll(address holder) external nonReentrant {
        uint256 cur = currentEpoch();
        ITBlockLockW L = ITBlockLockW(LOCK);
        uint256 amount = L.lockedOf(holder);
        uint256 unlockAt = L.unlockAtOf(holder);
        if (amount == 0 || L.requestedAtOf(holder) != 0 || unlockAt <= block.timestamp) {
            _unplay(holder, cur);
            _removeFrom(holder, cur);
            return;
        }

        Enrollment memory en = enrollmentOf[holder];
        if (en.unlockAt != unlockAt || amount > en.amount) {
            en = Enrollment(uint64(unlockAt), uint64(block.timestamp), uint128(amount));
            enrollmentOf[holder] = en;
        } else if (amount != en.amount) {
            en.amount = uint128(amount);
            enrollmentOf[holder] = en;
        }
        uint256 band = multiplierBps(unlockAt - en.commitStart);
        uint256 w = amount * band / BPS;

        _removeFrom(holder, cur + 1);
        (bool ok, uint256 last) = lastFullEpoch(unlockAt);
        if (!ok || last < cur + 1 || w == 0) {
            emit Enrolled(holder, 0, cur + 1, 0, band);
            return;
        }
        _checkpoints[holder].push(Checkpoint(uint64(cur + 1), uint64(last), uint128(w)));
        _delta[cur + 1] += int256(w);
        _delta[last + 1] -= int256(w);
        emit Enrolled(holder, w, cur + 1, last, band);
    }

    /// @notice if holder asked to exit (or has nothing locked), its weight stops from the CURRENT week on. No-op otherwise.
    function sync(address holder) external nonReentrant {
        ITBlockLockW L = ITBlockLockW(LOCK);
        if (L.requestedAtOf(holder) != 0 || L.lockedOf(holder) == 0) {
            uint256 cur = currentEpoch();
            _unplay(holder, cur);
            _removeFrom(holder, cur);
        }
    }

    // ================================================================ plays

    /// @notice records that `holder` played week `epoch` (V.playOf > 0), with its weight for that week, once. Permissionless.
    ///         `epoch` must be the current week, or a week that has ended but is not closed yet (its MARK_GRACE day, or later while
    ///         nobody closed it). A holder with zero weight for the week stores nothing.
    function markPlayed(address holder, uint256 epoch) external nonReentrant {
        if (epoch > currentEpoch() || epoch < nextEpochToClose) revert NotMarkable(epoch);
        if (marked[holder][epoch]) return;
        if (IVaultPlays(VAULT).playOf(epoch, holder) == 0) revert NotPlayed(epoch);
        uint256 w = weightOf(holder, epoch);
        if (w == 0) revert NoWeight(epoch);
        marked[holder][epoch] = true;
        playedWeight[epoch] += w;
        emit Marked(holder, epoch, w);
    }

    /// @dev R's code: called right BEFORE each _removeFrom(holder, current week), so playedWeight[e] stays the sum of the marked
    ///      holders' weights for e
    function _unplay(address holder, uint256 e) private {
        if (!marked[holder][e]) return;
        uint256 w = weightOf(holder, e);
        if (w != 0) {
            playedWeight[e] -= w;
            emit PlayVoided(holder, e, w);
        }
    }

    /// @dev cuts the holder's weight for weeks >= `from`. Only weeks >= currentEpoch are ever passed, and those are not closed.
    function _removeFrom(address holder, uint256 from) private {
        Checkpoint[] storage cps = _checkpoints[holder];
        uint256 removed;
        while (cps.length > 0) {
            Checkpoint storage c = cps[cps.length - 1];
            if (c.lastEpoch < from) break;
            uint256 w = c.weight;
            uint256 start = c.fromEpoch > from ? c.fromEpoch : from;
            _delta[start] -= int256(w);
            _delta[uint256(c.lastEpoch) + 1] += int256(w);
            removed = w;
            if (c.fromEpoch >= from) {
                cps.pop();
            } else {
                c.lastEpoch = uint64(from - 1);
                break;
            }
        }
        if (removed != 0) emit Synced(holder, removed, from);
    }

    // ================================================================ weeks

    /// @notice closes week `epoch` (the next one in order, MARK_GRACE after it ended). R's rule: W = total weight, P = min(marked
    ///         weight, W); pot = full * P / W, full = min(unassigned * REWARD_BPS / 10000, MAX_POT). P == 0: nothing is assigned.
    function closeEpoch(uint256 epoch) external nonReentrant {
        if (epoch != nextEpochToClose) revert EpochOutOfOrder(nextEpochToClose);
        if (block.timestamp < epochEnd(epoch) + MARK_GRACE) revert EpochNotEnded(epoch);
        _runningWeight += _delta[epoch];
        uint256 W = uint256(_runningWeight);
        uint256 P = playedWeight[epoch];
        if (P > W) P = W; // guard only: P <= W by construction
        totalWeight[epoch] = W;
        playedWeight[epoch] = P;
        closedAt[epoch] = block.timestamp;
        nextEpochToClose = epoch + 1;

        uint256 p0;
        uint256 p1;
        if (P > 0) {
            p0 = _assign(epoch, 0, WTCOIN, MAX_POT_WTCOIN, P, W);
            p1 = _assign(epoch, 1, TBLOCK, MAX_POT_TBLOCK, P, W);
        }
        emit EpochClosed(epoch, p0, p1, W, P);
    }

    function _assign(uint256 epoch, uint256 i, address token, uint256 maxPot, uint256 P, uint256 W) private returns (uint256 p) {
        uint256 full = unassigned(token) * REWARD_BPS / BPS;
        if (full > maxPot) full = maxPot;
        p = full * P / W;
        if (p == 0) return 0;
        _pot[epoch][i] = p;
        _left[epoch][i] = p;
        _outstanding[i] += p;
    }

    /// @notice returns to the unassigned balance what nobody claimed from the oldest open week, CLAIM_WINDOW weeks after its close
    function release() external nonReentrant {
        uint256 e = nextEpochToRelease;
        if (e >= nextEpochToClose) revert EpochNotClosed(e);
        if (block.timestamp < closedAt[e] + CLAIM_WINDOW * EPOCH) revert ReleaseTooEarly(e);
        nextEpochToRelease = e + 1;
        uint256 l0 = _left[e][0];
        uint256 l1 = _left[e][1];
        _left[e][0] = 0;
        _left[e][1] = 0;
        _outstanding[0] -= l0;
        _outstanding[1] -= l1;
        emit Released(e, l0, l1);
    }

    // ================================================================ claims

    /// @notice pays msg.sender, and only msg.sender, its share of each listed closed, unreleased week it PLAYED, in both tokens
    function claim(uint256[] calldata epochs) external nonReentrant returns (uint256 paid0, uint256 paid1) {
        uint256 n = epochs.length;
        if (n == 0) revert NoEpochs();
        if (n > MAX_CLAIM_EPOCHS) revert TooManyEpochs();
        for (uint256 k = 0; k < n; k++) {
            uint256 e = epochs[k];
            if (e >= nextEpochToClose) revert EpochNotClosed(e);
            if (e < nextEpochToRelease) revert EpochReleased(e);
            if (claimed[msg.sender][e]) revert AlreadyClaimed(e);
            uint256 w = weightOf(msg.sender, e);
            if (w == 0) revert NoWeight(e);
            if (!marked[msg.sender][e]) revert NotPlayed(e);
            claimed[msg.sender][e] = true;
            uint256 a0 = _share(e, 0, w);
            uint256 a1 = _share(e, 1, w);
            claimedWeight[e] += w; // after both shares: they use the unclaimed weight BEFORE this claim
            _left[e][0] -= a0;
            _left[e][1] -= a1;
            paid0 += a0;
            paid1 += a1;
        }
        _outstanding[0] -= paid0;
        _outstanding[1] -= paid1;
        if (paid0 != 0) _safeTransfer(WTCOIN, msg.sender, paid0);
        if (paid1 != 0) _safeTransfer(TBLOCK, msg.sender, paid1);
        emit Claimed(msg.sender, paid0, paid1, n);
    }

    /// @dev R's _share: min(floor((pot - cut) * w / P), floor(left * w / (P - claimedWeight))), never more than _left (SEC-2)
    function _share(uint256 e, uint256 i, uint256 w) private view returns (uint256 a) {
        uint256 P = playedWeight[e];
        if (P == 0) return 0;
        uint256 l = _left[e][i];
        a = (_pot[e][i] - _cut[e][i]) * w / P;
        uint256 cw = claimedWeight[e];
        uint256 unclaimedW = P > cw ? P - cw : 0;
        if (unclaimedW > w) {
            uint256 fair = l * w / unclaimedW;
            if (fair < a) a = fair;
        }
        if (a > l) a = l;
    }

    // ================================================================ funding

    /// @notice anyone may add wtCOIN or TBLOCK; the amount is measured by the balance before and after
    function deposit(address token, uint256 amount) external nonReentrant {
        _idx(token);
        if (amount == 0) revert BadAmount();
        uint256 before = _balanceOf(token, address(this));
        (bool ok, bytes memory r) = token.call(abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
        uint256 arrived = _balanceOf(token, address(this)) - before;
        if (arrived == 0) revert BadAmount();
        emit Deposited(msg.sender, token, arrived);
    }

    // ================================================================ rescue door (guardian, 72 h public timelock) - R's code

    function rescueRequest(address token, address to, uint256 amount) external onlyGuardian {
        _idx(token);
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

    function rescueExecute() external onlyGuardian nonReentrant {
        Rescue memory r = _rescue;
        if (r.executeAt == 0) revert NoRescuePending();
        if (block.timestamp < r.executeAt) revert RescueTooEarly(r.executeAt);
        delete _rescue;

        uint256 i = _idx(r.token);
        uint256 bal = _balanceOf(r.token, address(this));
        uint256 amount = r.amount < bal ? r.amount : bal;
        uint256 free = bal > _outstanding[i] ? bal - _outstanding[i] : 0;
        uint256 fromFree = amount < free ? amount : free;
        uint256 rest = amount - fromFree;
        uint256 fromEpochs;
        for (uint256 e = nextEpochToRelease; e < nextEpochToClose && rest != 0; e++) {
            uint256 l = _left[e][i];
            if (l == 0) continue;
            uint256 c = rest < l ? rest : l;
            _left[e][i] = l - c;
            _cut[e][i] += c;
            rest -= c;
            fromEpochs += c;
        }
        _outstanding[i] -= fromEpochs;
        uint256 sent = fromFree + fromEpochs;
        if (sent != 0) _safeTransfer(r.token, r.to, sent);
        emit RescueExecuted(r.token, r.to, sent, fromFree, fromEpochs);
    }

    function renounceGuardian() external onlyGuardian {
        address old = guardian;
        guardian = address(0);
        delete _rescue;
        emit GuardianRenounced(old);
    }

    // ================================================================ internals

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
}
