// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The read surface of the deployed TBlockLock v1 (copied from contracts/src/TBlockLock.sol).
interface ITBlockLock {
    function TBLOCK() external view returns (address);
    function lockedOf(address a) external view returns (uint256);
    function unlockAtOf(address a) external view returns (uint256);
    function requestedAtOf(address a) external view returns (uint256);
}

/// @notice The Uniswap v4 PoolManager calls used to redeem deferred ERC6909 payout claims.
/// @dev The hook (AdvancedFeeHookV6B `_payOut`) first tries `poolManager.take{gas: 500_000}(currency, to, amount)`; if that reverts it
///      calls `poolManager.mint(to, currency.toId(), amount)` and emits PayoutDeferred. These signatures follow v4-core's IPoolManager;
///      they are exercised here only against a mock and MUST be checked on a Base fork before mainnet.
interface IPoolManagerLike {
    function unlock(bytes calldata data) external returns (bytes memory);
    function burn(address from, uint256 id, uint256 amount) external;
    function take(address currency, address to, uint256 amount) external;
    function balanceOf(address owner, uint256 id) external view returns (uint256);
}

/// @notice A listed game names the rewards contract it reports plays to; the rewards constructor requires it to name this contract.
interface IPlayGame {
    function REWARDS() external view returns (address);
}

/// @title TBlockLockRewards - pays wtCOIN and TBLOCK to TBlockLock v1 lockers who PLAYED, per full 30-day epoch their lock covers.
/// @notice Funding: the TBLOCK hook's creator payee slot (the current payee calls transferPayeeSlot once, himself) plus public deposit().
///         Principal never enters this contract: weights are read from TBlockLock v1.
///
/// THE RULES (all in code):
///  - Epoch e is [T0 + e*EPOCH, T0 + (e+1)*EPOCH), EPOCH = 30 days, T0 fixed at deploy.
///  - weight = lockedOf(h) * band(commitment) / 10000, band pinned to points.js ENGAGEMENT: x1 / x1.25 / x1.5 / x1.75 / x2 at
///    0 / 30 / 90 / 180 / 365 days. The commitment is unlockAt minus commitStart, the time of the enroll that first saw the current
///    (unlockAt, lockedOf) pair. As in points.js, where every Locked or Extended event restarts the clock, commitStart restarts when
///    unlockAt changes OR lockedOf grew (a top-up). A stranger re-enrolling a holder whose lock did not change cannot lower the band;
///    TBlockLock v1 lock() only adds to msg.sender's own lock, so nobody else can trigger a top-up reset. (Review SEC-1 / ECO-2.)
///  - A weight counts for epochs current+1 .. lastFull, lastFull = the last epoch that ENDS at or before unlockAt. Every paid epoch is
///    therefore backed by TBLOCK that TBlockLock cannot release before it ends.
///  - enroll(h) and sync(h) are permissionless; they only re-read TBlockLock. A pending exit request (requestedAtOf != 0) removes the
///    weight from the CURRENT epoch on.
///  - PLAY GATE (Phil 2026-11-11, "Lock + play"): only a locker who PLAYED during epoch e is paid for e. A play is recorded ONLY by one
///    of the games fixed at deploy (GAME_0..GAME_7, no setter, no admin), calling recordPlay(payer) inside the paid transaction. Each
///    listed game's REWARDS() must equal this contract (checked in the constructor). recordPlay stores the holder's weight for the
///    CURRENT epoch once (PLAYED bit) and adds it to playedWeight[e]; a holder with zero weight for e stores nothing. A weight that is
///    cut during e (exit request -> sync / enroll) is first taken back out of playedWeight[e] (_unplay), so
///    playedWeight[e] == sum of weightOf(h, e) over the holders who played e.
///  - closeEpoch(e), in order, once e has ended: W = total weight, P = min(playedWeight[e], W). For each token T,
///    full = min(unassigned(T) * REWARD_BPS / 10000, MAX_POT[T]) and pot[T][e] = full * P / W, only when P > 0. The share of the lockers
///    who did not play, full * (W - P) / W, is NEVER assigned: it stays unassigned and feeds later epochs through the 25% draw.
///  - claim(epochs) pays msg.sender only, for epochs it played: min(floor((pot - cut) * w / P), floor(left * w / (P - claimedWeight))),
///    capped by left. With no rescue cut this is floor(pot * w / P) ~= floor(full * w / W): exactly what the player would have had if
///    every locker had played. Sum of claims <= pot.
///  - release(): once CLAIM_WINDOW * EPOCH seconds have passed since the epoch was CLOSED, returns what nobody claimed to the unassigned
///    balance. Counting from the close (not from the epoch number) means a late close never lets its lockers be swept unpaid (ECO-3).
///  - No owner, no admin, no pause, no upgrade, no parameter change.
///  - THE ONLY WITHDRAW PATH (Phil 2026-11-11, "dev rescue door"): an immutable-at-deploy `guardian` may move reward tokens out, only through
///    a public 72-hour timelock (rescueRequest -> rescueExecute after RESCUE_DELAY; rescueCancel). One request at a time. The guardian has
///    no other power; the role can only be renounced, one way, to address(0). Lockers keep claiming during the 72 h.
///  - Rescue accounting: the amount is taken first from the unassigned balance, then from assigned-but-unclaimed epochs, oldest open
///    epoch first. A cut on epoch e raises cut[T][e] and lowers left[T][e]. What is left is then shared pro-rata among the weight that
///    has not claimed e yet (left * w / (W - claimedWeight)), so equal weights get equal amounts whatever the claim order (SEC-2).
///    Holders who claimed before the cut keep what they were paid: the cut can only fall on the unclaimed weight. No claim can
///    underflow or get stuck (a claim that finds left == 0 is recorded and pays 0 for that token).
contract TBlockLockRewards {
    // ---------------------------------------------------------------- immutables and constants
    address public immutable TBLOCK;
    address public immutable WTCOIN;
    address public immutable LOCK;
    address public immutable POOL_MANAGER; // address(0) disables redeemDeferred
    uint256 public immutable T0;
    uint256 public immutable MAX_POT_WTCOIN;
    uint256 public immutable MAX_POT_TBLOCK;

    uint256 public constant EPOCH = 30 days;
    uint256 public constant REWARD_BPS = 2500;
    uint256 public constant CLAIM_WINDOW = 3; // epochs (~90 days) after an epoch ends before release() may sweep it
    uint256 public constant MAX_CLAIM_EPOCHS = 24;
    uint256 public constant RESCUE_DELAY = 72 hours;
    uint256 public constant BPS = 10_000;

    // ---------------------------------------------------------------- the games whose paid plays count (fixed at deploy, unused = 0)
    uint256 public constant MAX_GAMES = 8;
    uint256 public immutable GAME_COUNT;
    address public immutable GAME_0;
    address public immutable GAME_1;
    address public immutable GAME_2;
    address public immutable GAME_3;
    address public immutable GAME_4;
    address public immutable GAME_5;
    address public immutable GAME_6;
    address public immutable GAME_7;

    uint8 private constant PLAYED = 1;
    uint8 private constant CLAIMED = 2;

    // ---------------------------------------------------------------- guardian (only rescue + renounce)
    address public guardian;

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
    mapping(address => mapping(uint256 => uint8)) private _status; // PLAYED | CLAIMED bits per (holder, epoch)
    /// @notice during epoch e: the live sum of the weights of the holders who played e. At closeEpoch(e): overwritten with P = min(sum, W).
    mapping(uint256 => uint256) public playedWeight;
    mapping(uint256 => uint256) public claimedWeight; // sum of the weights that have claimed epoch e
    mapping(uint256 => uint256) public closedAt;      // timestamp at which epoch e was closed (0 = not closed)

    uint256 private _guard = 1;
    bool private _redeeming;

    // ---------------------------------------------------------------- events
    event Enrolled(address indexed holder, uint256 weight, uint256 fromEpoch, uint256 lastFullEpoch, uint256 bandBps);
    event Synced(address indexed holder, uint256 removedWeight, uint256 fromEpoch);
    event EpochClosed(uint256 indexed epoch, uint256 potWtcoin, uint256 potTblock, uint256 totalWeight, uint256 playedWeight);
    event Played(address indexed player, address indexed game, uint256 indexed epoch, uint256 weight);
    event PlayVoided(address indexed holder, uint256 indexed epoch, uint256 weight);
    event Claimed(address indexed holder, uint256 wtcoin, uint256 tblock, uint256 epochs);
    event Released(uint256 indexed epoch, uint256 wtcoin, uint256 tblock);
    event Deposited(address indexed from, address indexed token, uint256 amount);
    event DeferredRedeemed(address indexed token, uint256 amount);
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
    error RedeemDisabled();
    error NotPoolManager();
    error NotGame();
    error NotPlayed(uint256 epoch);

    modifier nonReentrant() { if (_guard != 1) revert Reentrancy(); _guard = 2; _; _guard = 1; }
    modifier onlyGuardian() { if (msg.sender != guardian || msg.sender == address(0)) revert NotGuardian(); _; }

    /// @param tblock TBLOCK token (must equal lock.TBLOCK())
    /// @param wtcoin wtCOIN token, copied from the pool key at deploy time
    /// @param lock TBlockLock v1
    /// @param poolManager Uniswap v4 PoolManager the hook pays through (address(0) disables redeemDeferred)
    /// @param guardian_ the rescue-door holder; Phil supplies it at deploy (address(0) = no door)
    /// @param t0 start of epoch 0, at or before deploy time and at most one EPOCH before it
    /// @param maxPotWtcoin per-epoch cap on the wtCOIN pot (raw units)
    /// @param maxPotTblock per-epoch cap on the TBLOCK pot (raw units)
    /// @param games_ 1..MAX_GAMES game contracts whose paid plays count; each must already be deployed with REWARDS() == this contract
    ///        (deploy order: games first, with the predicted CREATE address of this contract). Fixed forever: no setter.
    constructor(
        address tblock,
        address wtcoin,
        address lock,
        address poolManager,
        address guardian_,
        uint256 t0,
        uint256 maxPotWtcoin,
        uint256 maxPotTblock,
        address[] memory games_
    ) {
        if (tblock.code.length == 0) revert TokenHasNoCode(tblock);
        if (wtcoin.code.length == 0) revert TokenHasNoCode(wtcoin);
        if (lock.code.length == 0) revert TokenHasNoCode(lock);
        if (poolManager != address(0) && poolManager.code.length == 0) revert TokenHasNoCode(poolManager);
        if (tblock == wtcoin || ITBlockLock(lock).TBLOCK() != tblock) revert BadConfig();
        // t0 at most one epoch in the past, else many empty closeEpoch calls are needed before rewards work (review INFO-1)
        if (t0 > block.timestamp || block.timestamp - t0 > EPOCH || maxPotWtcoin == 0 || maxPotTblock == 0) revert BadConfig();
        TBLOCK = tblock;
        WTCOIN = wtcoin;
        LOCK = lock;
        POOL_MANAGER = poolManager;
        guardian = guardian_;
        T0 = t0;
        MAX_POT_WTCOIN = maxPotWtcoin;
        MAX_POT_TBLOCK = maxPotTblock;

        uint256 n = games_.length;
        if (n == 0 || n > MAX_GAMES) revert BadConfig();
        for (uint256 i = 0; i < n; i++) {
            address g = games_[i];
            if (g == address(0) || g.code.length == 0) revert BadConfig();
            for (uint256 j = 0; j < i; j++) if (games_[j] == g) revert BadConfig();
            // two-way wiring: the game must report to THIS contract (a mispredicted address reverts the deploy)
            (bool ok, bytes memory r) = g.staticcall(abi.encodeWithSelector(IPlayGame.REWARDS.selector));
            if (!ok || r.length < 32 || abi.decode(r, (address)) != address(this)) revert BadConfig();
        }
        GAME_COUNT = n;
        GAME_0 = games_[0];
        GAME_1 = n > 1 ? games_[1] : address(0);
        GAME_2 = n > 2 ? games_[2] : address(0);
        GAME_3 = n > 3 ? games_[3] : address(0);
        GAME_4 = n > 4 ? games_[4] : address(0);
        GAME_5 = n > 5 ? games_[5] : address(0);
        GAME_6 = n > 6 ? games_[6] : address(0);
        GAME_7 = n > 7 ? games_[7] : address(0);
    }

    // ================================================================ views

    function currentEpoch() public view returns (uint256) { return (block.timestamp - T0) / EPOCH; }
    function epochStart(uint256 e) public view returns (uint256) { return T0 + e * EPOCH; }
    function epochEnd(uint256 e) public view returns (uint256) { return T0 + (e + 1) * EPOCH; }

    /// @notice the commitment band in basis points, identical to points.js ENGAGEMENT
    function multiplierBps(uint256 commitSeconds) public pure returns (uint256) {
        if (commitSeconds >= 365 days) return 20_000;
        if (commitSeconds >= 180 days) return 17_500;
        if (commitSeconds >= 90 days) return 15_000;
        if (commitSeconds >= 30 days) return 12_500;
        return 10_000;
    }

    /// @notice the last epoch that ends at or before `unlockAt`; returns (false, 0) when none does
    function lastFullEpoch(uint256 unlockAt) public view returns (bool ok, uint256 e) {
        if (unlockAt < T0 + EPOCH) return (false, 0);
        return (true, (unlockAt - T0) / EPOCH - 1);
    }

    /// @notice for the UI (ECO-1): the epochs a lock ending at `unlockAt` would be paid for if enrolled now. count == 0 means the lock
    ///         earns nothing (any lock that does not cover a whole epoch after the current one, e.g. 7 days, or 30 days off a boundary).
    function rewardEpochsFor(uint256 unlockAt) external view returns (uint256 firstEpoch, uint256 lastEpoch, uint256 count) {
        firstEpoch = currentEpoch() + 1;
        (bool ok, uint256 last) = lastFullEpoch(unlockAt);
        if (!ok || last < firstEpoch || unlockAt <= block.timestamp) return (firstEpoch, 0, 0);
        return (firstEpoch, last, last - firstEpoch + 1);
    }

    function weightOf(address holder, uint256 epoch) public view returns (uint256) {
        Checkpoint[] storage cps = _checkpoints[holder];
        uint256 n = cps.length;
        // checkpoints are non-overlapping and sorted by fromEpoch; walk from the newest (few entries per holder in practice)
        for (uint256 i = n; i > 0; i--) {
            Checkpoint storage c = cps[i - 1];
            if (epoch >= c.fromEpoch) return epoch <= c.lastEpoch ? c.weight : 0;
        }
        return 0;
    }

    function checkpointsOf(address holder) external view returns (Checkpoint[] memory) { return _checkpoints[holder]; }

    /// @notice the total weight of a not-yet-closed epoch, as the lazy cursor would compute it now
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

    /// @notice the balance not promised to any open epoch; this is what closeEpoch draws from and what a rescue takes first
    function unassigned(address token) public view returns (uint256) {
        uint256 i = _idx(token);
        uint256 bal = _balanceOf(token, address(this));
        return bal > _outstanding[i] ? bal - _outstanding[i] : 0;
    }

    /// @notice true when `a` is one of the games fixed at deploy (address(0) never is)
    function isGame(address a) public view returns (bool) {
        if (a == address(0)) return false;
        return a == GAME_0 || a == GAME_1 || a == GAME_2 || a == GAME_3 || a == GAME_4 || a == GAME_5 || a == GAME_6 || a == GAME_7;
    }

    /// @notice the games fixed at deploy, in order
    function games() external view returns (address[] memory list) {
        address[8] memory all = [GAME_0, GAME_1, GAME_2, GAME_3, GAME_4, GAME_5, GAME_6, GAME_7];
        list = new address[](GAME_COUNT);
        for (uint256 i = 0; i < GAME_COUNT; i++) list[i] = all[i];
    }

    /// @notice same ABI as the former `claimed` mapping getter
    function claimed(address holder, uint256 epoch) external view returns (bool) { return _status[holder][epoch] & CLAIMED != 0; }

    /// @notice for the UI ("you have played this month"): a listed game recorded a play of `holder` with nonzero weight during `epoch`
    function hasPlayed(address holder, uint256 epoch) external view returns (bool) { return _status[holder][epoch] & PLAYED != 0; }

    /// @notice what `holder` would receive for `epochs` right now (0 for epochs not played, already claimed, released, or not closed)
    function claimable(address holder, uint256[] calldata epochs) external view returns (uint256 wtcoin, uint256 tblock) {
        for (uint256 k = 0; k < epochs.length; k++) {
            uint256 e = epochs[k];
            uint8 s = _status[holder][e];
            if (e >= nextEpochToClose || e < nextEpochToRelease || s & PLAYED == 0 || s & CLAIMED != 0) continue;
            uint256 w = weightOf(holder, e);
            if (w == 0) continue;
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

    /// @notice re-reads holder's lock in TBlockLock and rewrites its weight from the next epoch on. Permissionless: a stranger can only
    ///         make the contract see what TBlockLock already says; the band clock restarts only when unlockAt changed or lockedOf grew.
    function enroll(address holder) external nonReentrant {
        uint256 cur = currentEpoch();
        ITBlockLock L = ITBlockLock(LOCK);
        uint256 amount = L.lockedOf(holder);
        uint256 unlockAt = L.unlockAtOf(holder);
        if (amount == 0 || L.requestedAtOf(holder) != 0 || unlockAt <= block.timestamp) {
            _unplay(holder, cur);
            _removeFrom(holder, cur);
            return;
        }

        Enrollment memory en = enrollmentOf[holder];
        // points.js restarts the commitment on every Locked (top-up included) and Extended event: a new date or more TBLOCK both
        // restart commitStart here, so new capital never inherits an older, higher band (SEC-1 / ECO-2)
        if (en.unlockAt != unlockAt || amount > en.amount) {
            en = Enrollment(uint64(unlockAt), uint64(block.timestamp), uint128(amount));
            enrollmentOf[holder] = en;
        } else if (amount != en.amount) {
            en.amount = uint128(amount);
            enrollmentOf[holder] = en;
        }
        uint256 band = multiplierBps(unlockAt - en.commitStart);
        uint256 w = amount * band / BPS;

        // the lock is valid now, so the old weight keeps the current epoch; replace everything after it
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

    /// @notice if holder asked to exit (or has nothing locked), its weight stops from the CURRENT epoch on. No-op otherwise.
    function sync(address holder) external nonReentrant {
        ITBlockLock L = ITBlockLock(LOCK);
        if (L.requestedAtOf(holder) != 0 || L.lockedOf(holder) == 0) {
            uint256 cur = currentEpoch();
            _unplay(holder, cur);
            _removeFrom(holder, cur);
        }
    }

    // ================================================================ plays

    /// @notice called by a listed game inside a PAID play, for the payer. Records, once per epoch, the payer's weight for the CURRENT
    ///         epoch. No external calls; never reverts for a listed game. A payer with zero weight stores nothing (its weight for the
    ///         current epoch can never rise during that epoch: enroll writes from the next epoch on).
    function recordPlay(address player) external {
        if (!isGame(msg.sender)) revert NotGame();
        uint256 e = currentEpoch();
        uint8 s = _status[player][e];
        if (s & PLAYED != 0) return;
        uint256 w = weightOf(player, e);
        if (w == 0) return;
        _status[player][e] = s | PLAYED;
        playedWeight[e] += w;
        emit Played(player, msg.sender, e, w);
    }

    /// @dev called right BEFORE each _removeFrom(holder, current epoch): takes the weight that is about to be cut back out of the
    ///      played sum, so playedWeight[e] stays equal to the sum of the played holders' weights for e
    function _unplay(address holder, uint256 e) private {
        if (_status[holder][e] & PLAYED == 0) return;
        uint256 w = weightOf(holder, e);
        if (w != 0) {
            playedWeight[e] -= w;
            emit PlayVoided(holder, e, w);
        }
    }

    /// @dev cuts the holder's weight for epochs >= `from`. Only epochs >= currentEpoch are ever passed, and those are not closed.
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

    // ================================================================ epochs

    /// @notice closes epoch `epoch`, which must be the next one in order and must have ended. full = REWARD_BPS of each token's
    ///         unassigned balance, capped by MAX_POT; the pot is full * P / W, P = min(playedWeight, W). With P == 0 nothing is assigned.
    ///         The non-players' part, full * (W - P) / W, is never assigned and stays in the unassigned balance.
    function closeEpoch(uint256 epoch) external nonReentrant {
        if (epoch != nextEpochToClose) revert EpochOutOfOrder(nextEpochToClose);
        if (block.timestamp < epochEnd(epoch)) revert EpochNotEnded(epoch);
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

    /// @notice returns to the unassigned balance what nobody claimed from the oldest open epoch, once CLAIM_WINDOW * EPOCH seconds have
    ///         passed since that epoch was closed. Counting from the close (ECO-3): a late close still leaves its lockers the full window.
    ///         closedAt >= epochEnd(e), so this is never earlier than the old rule (currentEpoch > e + CLAIM_WINDOW).
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

    /// @notice pays msg.sender, and only msg.sender, its share of each listed closed, unreleased epoch it PLAYED, in both tokens
    function claim(uint256[] calldata epochs) external nonReentrant returns (uint256 paid0, uint256 paid1) {
        uint256 n = epochs.length;
        if (n == 0) revert NoEpochs();
        if (n > MAX_CLAIM_EPOCHS) revert TooManyEpochs();
        for (uint256 k = 0; k < n; k++) {
            uint256 e = epochs[k];
            if (e >= nextEpochToClose) revert EpochNotClosed(e);
            if (e < nextEpochToRelease) revert EpochReleased(e);
            uint8 s = _status[msg.sender][e];
            if (s & CLAIMED != 0) revert AlreadyClaimed(e);
            uint256 w = weightOf(msg.sender, e);
            if (w == 0) revert NoWeight(e);
            if (s & PLAYED == 0) revert NotPlayed(e);
            _status[msg.sender][e] = s | CLAIMED; // the slot is already nonzero (PLAYED)
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

    /// @dev min(floor((pot - cut) * w / P), floor(left * w / unclaimedW)), never more than _left, so the subtraction cannot underflow.
    ///      P = playedWeight[e] (closed), unclaimedW = P - claimedWeight[e]. Without a cut, left / unclaimedW >= pot / P (earlier claims
    ///      were floored), so the first term wins and the result is the plain pro-rata share, rounding dust staying in the epoch. After a
    ///      cut, the second term shares what is left pro-rata over the played weight that has not claimed yet (SEC-2).
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

    /// @notice turns ERC6909 claims the hook minted to this contract (PayoutDeferred) back into tokens held here. Permissionless.
    function redeemDeferred(address token) external nonReentrant returns (uint256 amount) {
        _idx(token);
        if (POOL_MANAGER == address(0)) revert RedeemDisabled();
        amount = IPoolManagerLike(POOL_MANAGER).balanceOf(address(this), uint256(uint160(token)));
        if (amount == 0) return 0;
        uint256 before = _balanceOf(token, address(this));
        _redeeming = true;
        IPoolManagerLike(POOL_MANAGER).unlock(abi.encode(token, amount));
        _redeeming = false;
        uint256 arrived = _balanceOf(token, address(this)) - before;
        if (arrived != amount) revert TransferFailed();
        emit DeferredRedeemed(token, amount);
    }

    /// @dev PoolManager callback: burn our ERC6909 claim (credit) and take the same amount out (debit); deltas net to zero
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER || !_redeeming) revert NotPoolManager();
        (address token, uint256 amount) = abi.decode(data, (address, uint256));
        IPoolManagerLike(POOL_MANAGER).burn(address(this), uint256(uint160(token)), amount);
        IPoolManagerLike(POOL_MANAGER).take(token, address(this), amount);
        return "";
    }

    // ================================================================ rescue door (guardian, 72 h public timelock)

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

    /// @notice moves min(requested, balance) out. Taken first from unassigned, then from open epochs oldest first (cut/left updated so
    ///         later claims on a cut epoch are paid floor((pot-cut)*w/W) capped by what is left: no underflow, no stuck claim).
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

    /// @notice one-way: the rescue door closes for good; any pending request is dropped
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
