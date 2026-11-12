// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILikesView {
    function epochEnd(uint256 e) external view returns (uint256);
    function spentIn(uint256 e, address a) external view returns (uint256);
    function totalSpentIn(uint256 e) external view returns (uint256);
    function topOf(uint256 e) external view returns (address);
    function currentEpoch() external view returns (uint256);
    function minHold() external view returns (uint256);
    function LOCK() external view returns (address);
    function TBLOCK() external view returns (address);
}

/// TBlockLock (game349): what a holder has LOCKED and committed, and until when
interface ILockView {
    function TBLOCK() external view returns (address);
    function activeLockedOf(address a) external view returns (uint256);
    function unlockAtOf(address a) external view returns (uint256);
}

/// a listed game (TamArtV2): names the vault it reports plays to, and the TBLOCK it pays in (two TBLOCKs exist: this must be ours)
interface IVaultGame {
    function VAULT() external view returns (address);
    function TBLOCK() external view returns (address);
    function ROUTER() external view returns (address);
}

interface IContestFund {
    function currentRound() external view returns (uint256);
    function fundRoom(uint256 r) external view returns (uint256);
    function fund(uint256 r, uint256 amount) external;
}

/// @title TBlockVaultV2 - the HOLDERS vault (Phil 2026-11-10 night: "vault access from $15 of the token; the more he locks, the bigger the
///        reward"; 10/11: "the holders pot pays those who PLAY, never pro rata"). Derived from TBlockVault v1 by exact replacements: only
///        the claim rule and the share change; contest feeding, dev rescue, release and token plumbing are v1's reviewed code.
/// V2 CLAIM: the claimer must have LOCKED (TBlockLock.activeLockedOf) at least LIKES.minHold() ($15 at the bounded keeper price of
///        BlockLikesV2), still committed MIN_COMMIT ahead (unlockAtOf >= now + 7 days). V2 SHARE: v1's play share (capped at
///        spent x REBATE_BPS as in v1, BEFORE the factor) x lockFactor / MAX_FACTOR,
///        lockFactor = 10,000 + amountBonus + timeBonus, in [1.0, 1.75] (MAX_FACTOR = 17,500) - so the sum of every claim never
///        exceeds the players' budget, a bigger/longer lock only gets closer to the full play share, and a non-player gets 0.
/// TIERS (Phil 2026-11-11: "$15 locked gives ACCESS; bigger holders gain more from $100 locked"). The amount tiers are multiples of
///        the SAME minimum `need` ($15 in TBLOCK at the bounded keeper price, photographed per epoch by needFor(e)), compared with
///        exact integer math (locked x 15 >= need x 100 means "locked is worth at least $100"): no new oracle, no new admin.
///          $15 .. < $100 : amountBonus 0      (x1, access only)
///          >= $100       : amountBonus 1,500  (+15 %)
///          >= $500       : amountBonus 3,000  (+30 %)
///          >= $1,000     : amountBonus 5,000  (+50 %, the max)
///        timeBonus = 2,500 x min(time left, TIME_FULL) / TIME_FULL (+25 % at 90 days left); MIN_COMMIT (7 days) still required.
/// PLAY WEIGHT (Phil 2026-11-11, economy v2 pack: "played" = lock + play; a heart AND a TAM mint count). A player's play in week e is
///        playOf(e, p) = LIKES.spentIn(e, p) (TBLOCK burned in hearts) + gamePlayIn[e][p] (TBLOCK actually bought for a listed game by
///        its TblockPayRouter payment). Both are raw TBLOCK, so shares stay comparable; the week's total is totalPlayIn(e) =
///        LIKES.totalSpentIn(e) + gameTotalIn[e]. Every "spent" / "total" of the v1 rules below reads these sums.
///        - gamePlayIn is written ONLY by recordPlay, ONLY from a game listed at deploy (GAME_0..GAME_7, no setter, no admin). The
///          constructor requires each listed game to name this vault (VAULT() == this) and our TBLOCK (TBLOCK() == TBLOCK): games
///          deploy FIRST with the predicted address of this vault, so a mispredicted address reverts this deploy.
///        - recordPlay stores nothing for a payer who does not pass the hearts' hold rule at that moment (activeLockedOf >= minHold,
///          the same test like() applies): lock first, then play, exactly as for hearts.
///        - the TOP BONUS stays LIKES.topOf(e) (hearts only): the top over hearts + games cannot be kept exact without the likes
///          contract reporting to this vault. A game-only player gets the shared part, never the top bonus.
///        - a game's TBLOCK enters THIS vault (it is not burned): the rebate cap (<= 50 % of the play) still keeps what a player gets
///          back below what he paid, and the rest stays here for everyone.
/// (v1 notes below kept as written.)
/// @notice Holds TBLOCK sent to it (buyback v2 output, Create fees paid in TBLOCK, anyone) and pays it out ONLY by these
///         fixed rules. No upgrade, no burn. The ONLY hand on it is the dev rescue (rule 3): announced on chain, 7 days of delay,
///         free part only, and renounceable for good.
///
/// 1. PLAYERS FIRST. Each epoch of BlockLikes (people burn TBLOCK to +1 blocks), once the epoch has ended, anyone calls
///    closeEpoch(e). It reserves a budget = min(free * REWARD_BPS, MAX_EPOCH_BUDGET, what can actually be paid). Then each player
///    of that epoch calls claim(e) within CLAIM_WINDOW seconds:
///      share = budget * (1 - TOP_BPS) * spent / totalSpent, capped at spent * REBATE_BPS   (the "airdrop" to every player)
///      + if the player is the epoch's top contributor: budget * TOP_BPS, capped at spent * REBATE_BPS  (the top bonus)
///    With REBATE_BPS <= 5000 a player never gets back more than what they burned: liking cannot be farmed for profit.
///    claim() requires the claimer to HOLD at least MIN_HOLD TBLOCK at that call (read at the call, not over time).
///    After the window, release(e) returns what was not claimed to the free balance.
/// 2. THEN THE CONTEST. feedContest() (anyone, at most once per FEED_COOLDOWN) adds min(free, MAX_FEED_PER_CALL, room left
///    under the cap) to the pot of the contest's current round. Reserved budgets are never used for this.
/// "free" = TBLOCK held - TBLOCK reserved for open epochs.
/// 3. DEV RESCUE (Phil 2026-11-10: "le dev peut deverouiller le coffre au besoin"; then: TWO wallets, the TBLOCK dev wallet and Grok's).
///    DEV and DEV2 (immutable, set at construction, NOT the deployer) can take TBLOCK out by hand, but only in public and slowly:
///    either announces (announceRescue) a RESCUE_DELAY countdown visible on chain (event with who, amount, when, free now); after it,
///    ONLY the announcer can execute rescue(), and only during RESCUE_WINDOW (then the announcement expires and must be made again in
///    public); it pays at most min(amount, free) to the announcer, never a reserved player budget. Either dev can cancel any
///    announcement (the other's veto), and either can renounce the power FOR BOTH, for good: after that nobody can move the vault by hand.
contract TBlockVaultV2 {
    uint256 public constant BPS = 10_000;

    address public immutable TBLOCK;
    address public immutable LIKES;
    address public immutable CONTEST;
    address public immutable LOCK;              // TBlockLock
    uint256 public constant MIN_COMMIT = 7 days;   // a claimer stays locked at least this long after the claim
    uint256 public constant MAX_FACTOR = 17_500;   // lockFactor ceiling in bps (1.75x) = BPS + top amount bonus + full time bonus
    uint256 public constant ACCESS_USD = 15;       // the minimum `need` (LIKES.minHold()) is worth $15: tiers are multiples of it
    uint256 public constant TIER1_USD = 100;       // >= $100 locked: +TIER1_BONUS
    uint256 public constant TIER2_USD = 500;       // >= $500 locked: +TIER2_BONUS
    uint256 public constant TIER3_USD = 1_000;     // >= $1,000 locked: +TIER3_BONUS (the max)
    uint256 public constant TIER1_BONUS = 1_500;   // +15 %
    uint256 public constant TIER2_BONUS = 3_000;   // +30 %
    uint256 public constant TIER3_BONUS = 5_000;   // +50 %
    uint256 public constant TIME_BONUS = 2_500;    // +25 % at TIME_FULL left
    uint256 public constant TIME_FULL = 90 days;   // time bonus reaches its max at 90 days left
    uint256 public immutable REWARD_BPS;        // part of the free balance reserved for an epoch at close
    uint256 public immutable TOP_BPS;           // part of an epoch budget kept for its top contributor
    uint256 public immutable REBATE_BPS;        // a player's share (and the top bonus) never exceed spent * REBATE_BPS
    uint256 public immutable MAX_EPOCH_BUDGET;  // raw TBLOCK
    uint256 public immutable CLAIM_WINDOW;      // seconds after close
    uint256 public immutable MAX_FEED_PER_CALL; // raw TBLOCK
    uint256 public immutable FEED_COOLDOWN;     // seconds
    address public immutable DEV;               // first dev wallet (rescue rights)
    address public immutable DEV2;              // second dev wallet (same rights)
    uint256 public constant RESCUE_DELAY = 7 days;
    uint256 public constant FEED_QUIET = 1 days;  // no feeding in the last day of an epoch that has players
    uint256 public closeCursor;                   // every epoch below it is closed or had no players

    /* the games whose router-paid plays count (fixed at deploy, unused = 0) */
    uint256 public constant MAX_GAMES = 8;
    uint256 public immutable GAME_COUNT;
    /// @notice the ONE TblockPayRouter every listed game takes `payer` from (review F1/DT-3, 2026-11-11): all listed games must name
    ///         the same ROUTER(), answering TBLOCK() == TBLOCK; address(0) when no game is listed. The post-deploy check compares it
    ///         with the router deployed in the same nonce chain (pack-deploy-order.md).
    address public immutable ROUTER;
    address public immutable GAME_0;
    address public immutable GAME_1;
    address public immutable GAME_2;
    address public immutable GAME_3;
    address public immutable GAME_4;
    address public immutable GAME_5;
    address public immutable GAME_6;
    address public immutable GAME_7;
    /// @notice raw TBLOCK a listed game reported for `player` in week e (bought by the player's router payment)
    mapping(uint256 => mapping(address => uint256)) public gamePlayIn;
    /// @notice the sum of gamePlayIn over every player of week e
    mapping(uint256 => uint256) public gameTotalIn;

    uint256 public constant RESCUE_WINDOW = 2 days; // an announcement can be executed only in [rescueAt, rescueAt + RESCUE_WINDOW]
    uint256 public rescueAmount;   // announced amount, 0 = none pending
    uint256 public rescueAt;       // earliest time rescue() can run
    address public rescueBy;       // the dev who announced: the only one who can execute it
    bool public rescueRenounced;

    struct Epoch { uint256 budget; uint256 paid; uint64 closedAt; bool closed; bool released; }
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public claimed;
    uint256 public reserved;
    mapping(uint256 => uint256) public minHoldAt;   // review SEC-002: LIKES.minHold() photographed at closeEpoch(e)
    uint256 public lastFeedAt;
    uint256 private _lock = 1;

    event EpochClosed(uint256 indexed epoch, uint256 budget, uint256 totalSpent);
    event Claimed(uint256 indexed epoch, address indexed player, uint256 share, uint256 topBonus);
    event Released(uint256 indexed epoch, uint256 amount);
    event ContestFed(uint256 indexed round, uint256 amount);
    event RescueAnnounced(address indexed by, uint256 amount, uint256 executableAt, uint256 expiresAt, uint256 freeNow);
    event RescueCancelled(address indexed by);
    event Rescued(address indexed by, uint256 amount);
    event RescueRenounced(address indexed by);
    event GamePlayed(uint256 indexed epoch, address indexed player, address indexed game, uint256 tblock);

    error BadParams();
    error Locked();
    error EpochNotOver(uint256 endsAt);
    error AlreadyClosed();
    error NotClosed();
    error WindowClosed();
    error WindowOpen();
    error AlreadyClaimed();
    error AlreadyReleased();
    error NothingToClaim();
    error HoldTooLow(uint256 locked, uint256 minHold);
    error NotCommitted(uint256 unlockAt, uint256 needed);
    error Cooldown(uint256 nextAt);
    error NothingToFeed();
    error PlayersFirst(uint256 epochToClose);
    error NotDev();
    error Renounced();
    error NoRescue();
    error TooEarly(uint256 at);
    error Expired(uint256 at);
    error NotAnnouncer(address announcer);
    error TransferFailed();
    error NotGame();

    modifier lock() {
        if (_lock != 1) revert Locked();
        _lock = 2;
        _;
        _lock = 1;
    }

    struct Config {
        address tblock; address likes; address contest; address lock; uint256 rewardBps; uint256 topBps; uint256 rebateBps;
        uint256 maxEpochBudget; uint256 claimWindow; uint256 maxFeedPerCall; uint256 feedCooldown; address dev; address dev2;
    }

    /// @param games_ 0..MAX_GAMES games whose router-paid plays count. Each must already be deployed and answer VAULT() == this
    ///        contract and TBLOCK() == c.tblock (deploy order: games first, with the predicted CREATE address of this vault).
    constructor(Config memory c, address[] memory games_) {
        if (c.tblock == address(0) || c.likes == address(0) || c.contest == address(0)) revert BadParams();
        if (c.lock == address(0) || c.lock.code.length == 0) revert BadParams();
        /* review SEC-004: the hearts and the vault read the SAME lock, or the hold rule splits */
        if (ILikesView(c.likes).LOCK() != c.lock) revert BadParams();
        /* review DT-4 (2026-11-11): two tokens are named TBLOCK. The hearts burn, the lock locks and the vault pays the SAME one. */
        if (_addrOf(c.likes, ILikesView.TBLOCK.selector) != c.tblock) revert BadParams();
        if (_addrOf(c.lock, ILockView.TBLOCK.selector) != c.tblock) revert BadParams();
        if (c.rewardBps == 0 || c.rewardBps > BPS || c.rebateBps == 0 || c.rebateBps > 5_000) revert BadParams();
        if (c.maxEpochBudget == 0 || c.claimWindow == 0 || c.maxFeedPerCall == 0) revert BadParams();
        if (c.claimWindow > 365 days || c.feedCooldown > 30 days || c.topBps >= 5_000) revert BadParams();
        TBLOCK = c.tblock; LIKES = c.likes; CONTEST = c.contest; LOCK = c.lock; REWARD_BPS = c.rewardBps; TOP_BPS = c.topBps;
        REBATE_BPS = c.rebateBps; MAX_EPOCH_BUDGET = c.maxEpochBudget; CLAIM_WINDOW = c.claimWindow;
        MAX_FEED_PER_CALL = c.maxFeedPerCall; FEED_COOLDOWN = c.feedCooldown;
        if (c.dev == address(0) || c.dev2 == address(0) || c.dev == c.dev2) revert BadParams();
        DEV = c.dev; DEV2 = c.dev2;

        uint256 n = games_.length;
        if (n > MAX_GAMES) revert BadParams();
        address router;
        for (uint256 i = 0; i < n; i++) {
            address g = games_[i];
            if (g == address(0) || g.code.length == 0) revert BadParams();
            for (uint256 j = 0; j < i; j++) if (games_[j] == g) revert BadParams();
            /* two-way wiring: the game reports to THIS vault (a mispredicted address reverts the deploy) and pays in OUR TBLOCK */
            if (_addrOf(g, IVaultGame.VAULT.selector) != address(this)) revert BadParams();
            if (_addrOf(g, IVaultGame.TBLOCK.selector) != c.tblock) revert BadParams();
            /* review F1/DT-3: every listed game trusts the SAME router for `payer` (one wrong router address typed into one game
               reverts this deploy); that router has code and buys OUR TBLOCK */
            address r = _addrOf(g, IVaultGame.ROUTER.selector);
            if (i == 0) {
                if (r == address(0) || r.code.length == 0) revert BadParams();
                if (_addrOf(r, IVaultGame.TBLOCK.selector) != c.tblock) revert BadParams();
                router = r;
            } else if (r != router) {
                revert BadParams();
            }
        }
        ROUTER = router;
        GAME_COUNT = n;
        GAME_0 = n > 0 ? games_[0] : address(0);
        GAME_1 = n > 1 ? games_[1] : address(0);
        GAME_2 = n > 2 ? games_[2] : address(0);
        GAME_3 = n > 3 ? games_[3] : address(0);
        GAME_4 = n > 4 ? games_[4] : address(0);
        GAME_5 = n > 5 ? games_[5] : address(0);
        GAME_6 = n > 6 ? games_[6] : address(0);
        GAME_7 = n > 7 ? games_[7] : address(0);
    }

    function _addrOf(address target, bytes4 sel) private view returns (address) {
        (bool ok, bytes memory r) = target.staticcall(abi.encodeWithSelector(sel));
        if (!ok || r.length < 32) revert BadParams();
        uint256 v = abi.decode(r, (uint256));
        if (v >> 160 != 0) revert BadParams();
        return address(uint160(v));
    }

    // ------------------------------------------------------------------ 0. plays reported by the listed games

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

    /// @notice called by a listed game inside a PAID play, for the payer, with the TBLOCK that payment actually bought (the router's
    ///         measured output). Adds it to the payer's play of the CURRENT week if the payer passes the hearts' hold rule now
    ///         (activeLockedOf >= minHold); otherwise stores nothing. Views only, no transfer; the game ignores the outcome.
    function recordPlay(address player, uint256 tblock) external {
        if (!isGame(msg.sender)) revert NotGame();
        if (tblock == 0 || player == address(0)) return;
        ILikesView L = ILikesView(LIKES);
        if (ILockView(LOCK).activeLockedOf(player) < L.minHold()) return;
        uint256 e = L.currentEpoch();
        gamePlayIn[e][player] += tblock;
        gameTotalIn[e] += tblock;
        emit GamePlayed(e, player, msg.sender, tblock);
    }

    /// @notice a player's play of week e, in raw TBLOCK: hearts burned + TBLOCK bought through listed games
    function playOf(uint256 e, address player) public view returns (uint256) {
        return ILikesView(LIKES).spentIn(e, player) + gamePlayIn[e][player];
    }
    /// @notice the total play of week e, in raw TBLOCK: every heart burned + every TBLOCK bought through listed games
    function totalPlayIn(uint256 e) public view returns (uint256) {
        return ILikesView(LIKES).totalSpentIn(e) + gameTotalIn[e];
    }

    function _onlyDev() private view { if (msg.sender != DEV && msg.sender != DEV2) revert NotDev(); }

    // ------------------------------------------------------------------ 3. dev rescue: public, delayed, free part only

    function announceRescue(uint256 amount) external lock {
        _onlyDev();
        if (rescueRenounced) revert Renounced();
        if (amount == 0) revert BadParams();
        rescueAmount = amount;
        rescueAt = block.timestamp + RESCUE_DELAY;
        rescueBy = msg.sender;
        emit RescueAnnounced(msg.sender, amount, rescueAt, rescueAt + RESCUE_WINDOW, free());
    }
    /// @notice either dev can cancel any announcement (the other dev's veto during the 7 days)
    function cancelRescue() external lock {
        _onlyDev();
        if (rescueAmount == 0) revert NoRescue();
        rescueAmount = 0; rescueAt = 0; rescueBy = address(0);
        emit RescueCancelled(msg.sender);
    }
    /// @notice only the dev who announced, only within RESCUE_WINDOW after the delay, only the free part; paid to that dev
    function rescue() external lock returns (uint256 amount) {
        _onlyDev();
        if (rescueRenounced) revert Renounced();
        if (rescueAmount == 0) revert NoRescue();
        if (msg.sender != rescueBy) revert NotAnnouncer(rescueBy);
        if (block.timestamp < rescueAt) revert TooEarly(rescueAt);
        if (block.timestamp > rescueAt + RESCUE_WINDOW) revert Expired(rescueAt + RESCUE_WINDOW);
        amount = rescueAmount;
        uint256 f = free();
        if (amount > f) amount = f; // never a reserved player budget
        rescueAmount = 0; rescueAt = 0; rescueBy = address(0);
        if (amount == 0) revert NoRescue();
        _send(msg.sender, amount);
        emit Rescued(msg.sender, amount);
    }
    function renounceRescue() external lock {
        _onlyDev();
        if (rescueRenounced) revert Renounced();
        rescueRenounced = true; rescueAmount = 0; rescueAt = 0; rescueBy = address(0);
        emit RescueRenounced(msg.sender);
    }

    // ------------------------------------------------------------------ views

    function balance() public view returns (uint256) { return _bal(address(this)); }
    function free() public view returns (uint256) { uint256 b = balance(); return b > reserved ? b - reserved : 0; }

    /// @notice the lock bonus of `player` now, in bps: 10,000 (1x) .. MAX_FACTOR (1.75x); 0 when below the minimum or not committed
    function lockFactor(address player) public view returns (uint256) { return lockFactorAt(player, ILikesView(LIKES).minHold()); }
    /// @notice the minimum a claim of week e needs: the lower of the photo taken at its close and the minimum now (SEC-002)
    function needFor(uint256 e) public view returns (uint256) {
        uint256 now_ = ILikesView(LIKES).minHold();
        uint256 photo = minHoldAt[e];
        return photo != 0 && photo < now_ ? photo : now_;
    }
    /// @notice the amount bonus, in bps, of `locked` TBLOCK when `need` TBLOCK is worth $15: 0 under $100, then 1,500 / 3,000 / 5,000
    ///         at $100 / $500 / $1,000. Exact integer comparison (locked x 15 >= need x 100), no rounding. Callers guarantee
    ///         need <= locked (both real token amounts), so neither product can overflow.
    function amountBonusAt(uint256 locked, uint256 need) public pure returns (uint256) {
        uint256 l = locked * ACCESS_USD;
        if (l >= need * TIER3_USD) return TIER3_BONUS;
        if (l >= need * TIER2_USD) return TIER2_BONUS;
        if (l >= need * TIER1_USD) return TIER1_BONUS;
        return 0;
    }
    /// @notice the lock bonus of `player` against the minimum `need`: BPS + amountBonusAt + time bonus, at most MAX_FACTOR
    function lockFactorAt(address player, uint256 need) public view returns (uint256) {
        ILockView K = ILockView(LOCK);
        uint256 locked = K.activeLockedOf(player);
        if (need == 0 || locked < need) return 0;
        uint256 u = K.unlockAtOf(player);
        if (u < block.timestamp + MIN_COMMIT) return 0;
        uint256 left = u - block.timestamp;
        if (left > TIME_FULL) left = TIME_FULL;
        return BPS + amountBonusAt(locked, need) + TIME_BONUS * left / TIME_FULL;
    }

    /// @notice what claim(e) would pay `player` now (0,0 if nothing): v1's arithmetic x lockFactor / MAX_FACTOR, without the time checks.
    function owed(uint256 e, address player) public view returns (uint256 share, uint256 topBonus) {
        Epoch storage E = epochs[e];
        if (!E.closed || E.budget == 0 || claimed[e][player]) return (0, 0);
        ILikesView L = ILikesView(LIKES);
        uint256 spent = playOf(e, player);   /* hearts + listed games (PLAY WEIGHT) */
        uint256 total = totalPlayIn(e);
        if (spent == 0 || total == 0) return (0, 0);
        uint256 cap = spent * REBATE_BPS / BPS;
        uint256 f = lockFactorAt(player, needFor(e));
        if (f == 0) return (0, 0);
        /* review F1 (tiers 2026-11-11): v1's share is capped FIRST, then scaled by f / MAX_FACTOR. Scaling first let the rebate cap
         * cut every factor >= ~10,938 to the same spent x REBATE_BPS in a rich epoch, so a $15 lock was paid as much as a $1,000 one. */
        share = E.budget * (BPS - TOP_BPS) / BPS * spent / total;
        if (share > cap) share = cap;
        share = share * f / MAX_FACTOR;
        if (L.topOf(e) == player) {
            topBonus = E.budget * TOP_BPS / BPS;
            if (topBonus > cap) topBonus = cap;
            topBonus = topBonus * f / MAX_FACTOR;
        }
    }

    // ------------------------------------------------------------------ 1. players first

    function closeEpoch(uint256 e) external lock returns (uint256 budget) {
        Epoch storage E = epochs[e];
        if (E.closed) revert AlreadyClosed();
        ILikesView L = ILikesView(LIKES);
        uint256 end = L.epochEnd(e);
        if (block.timestamp < end) revert EpochNotOver(end);
        uint256 total = totalPlayIn(e);
        budget = free() * REWARD_BPS / BPS;
        if (budget > MAX_EPOCH_BUDGET) budget = MAX_EPOCH_BUDGET;
        uint256 payable_ = total * REBATE_BPS / BPS * 2; // most that can ever be paid: every share + the top bonus, both capped
        if (budget > payable_) budget = payable_;
        E.closed = true; E.closedAt = uint64(block.timestamp); E.budget = budget;
        minHoldAt[e] = ILikesView(LIKES).minHold();
        reserved += budget;
        emit EpochClosed(e, budget, total);
    }

    function claim(uint256 e) external lock returns (uint256 paid) {
        Epoch storage E = epochs[e];
        if (!E.closed) revert NotClosed();
        if (block.timestamp >= uint256(E.closedAt) + CLAIM_WINDOW) revert WindowClosed();
        if (claimed[e][msg.sender]) revert AlreadyClaimed();
        uint256 locked = ILockView(LOCK).activeLockedOf(msg.sender);
        uint256 need = needFor(e);
        if (locked < need) revert HoldTooLow(locked, need);
        uint256 u = ILockView(LOCK).unlockAtOf(msg.sender);
        if (u < block.timestamp + MIN_COMMIT) revert NotCommitted(u, block.timestamp + MIN_COMMIT);
        (uint256 share, uint256 bonus) = owed(e, msg.sender);
        paid = share + bonus;
        if (paid > E.budget - E.paid) paid = E.budget - E.paid; // never more than the epoch's budget
        if (paid == 0) revert NothingToClaim();
        claimed[e][msg.sender] = true;
        E.paid += paid;
        reserved -= paid;
        _send(msg.sender, paid);
        emit Claimed(e, msg.sender, share, bonus);
    }

    function release(uint256 e) external lock returns (uint256 back) {
        Epoch storage E = epochs[e];
        if (!E.closed) revert NotClosed();
        if (block.timestamp < uint256(E.closedAt) + CLAIM_WINDOW) revert WindowOpen();
        if (E.released) revert AlreadyReleased();
        E.released = true;
        back = E.budget - E.paid;
        reserved -= back;
        emit Released(e, back);
    }

    // ------------------------------------------------------------------ 2. then the contest

    function feedContest() external lock returns (uint256 amount) {
        if (lastFeedAt != 0 && block.timestamp < lastFeedAt + FEED_COOLDOWN) revert Cooldown(lastFeedAt + FEED_COOLDOWN);
        /* players first, ENFORCED: (a) every ended epoch with players must be closed (its budget reserved) before the contest is fed;
         * (b) no feeding during the last FEED_QUIET of an epoch that has players, so its budget cannot be drained just before close */
        ILikesView Lk = ILikesView(LIKES);
        uint256 cur = Lk.currentEpoch();
        uint256 k = closeCursor;
        while (k < cur && (epochs[k].closed || totalPlayIn(k) == 0)) k++;
        if (k < cur) revert PlayersFirst(k);
        closeCursor = k;
        if (block.timestamp + FEED_QUIET >= Lk.epochEnd(cur) && totalPlayIn(cur) > 0) revert PlayersFirst(cur);
        IContestFund C = IContestFund(CONTEST);
        uint256 r = C.currentRound();
        amount = free();
        if (amount > MAX_FEED_PER_CALL) amount = MAX_FEED_PER_CALL;
        uint256 room = C.fundRoom(r);
        if (amount > room) amount = room;
        if (amount == 0) revert NothingToFeed();
        lastFeedAt = block.timestamp;
        uint256 before = balance();
        _approve(CONTEST, amount);
        C.fund(r, amount);
        _approve(CONTEST, 0);
        uint256 gone = before - balance();
        if (gone > amount) revert TransferFailed(); // the contest pulled more than approved: impossible with a sane token
        emit ContestFed(r, gone);
        amount = gone;
    }

    // ------------------------------------------------------------------ token plumbing

    function _bal(address a) private view returns (uint256) {
        (bool ok, bytes memory r) = TBLOCK.staticcall(abi.encodeWithSelector(0x70a08231, a));
        if (!ok || r.length < 32) revert TransferFailed();
        return abi.decode(r, (uint256));
    }
    function _send(address to, uint256 a) private {
        uint256 before = _bal(to);
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, to, a));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
        if (_bal(to) - before != a) revert TransferFailed();
    }
    function _approve(address s, uint256 a) private {
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0x095ea7b3, s, a));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
    }
}
