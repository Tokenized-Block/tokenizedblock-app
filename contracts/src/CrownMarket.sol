// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CrownMarket - "who wears the crown at the end of this round?" on the live Game of Life Block season, paid in TBLOCK.
/// @notice Phil 2026-11-16: "rends le comme un prediction market mini paiement aussi en TBLOCK", "oui je valide le modele" (a keeper posts
///         the winner with the world's fingerprint, a challenge window, refunds when nothing is posted). For the V3 pack.
/// THE RULES, AND WHY:
///   - ROUNDS are fixed windows of ROUND_BLOCKS chain blocks counted from GENESIS_BLOCK (10 min = 3,000 Base blocks). Bets on round r are
///     open only in its FIRST half (block < start + ROUND_BLOCKS / 2): late bets would read the map too close to the end.
///   - A BET names a block token (the colony) and stakes at least MIN_BET_USD_E18 worth of TBLOCK at the hearts' stored price (refused if
///     that price is older than MAX_PRICE_AGE, as in LifeEntry). Stakes stay in this contract until the round is settled or refunded.
///   - PARI-MUTUEL: the winners share (pot - FEE_BPS) pro rata of their stake on the winner; the fee goes to the holders' VAULT (in the V3
///     pack this contract is a listed game: the fee is recorded as a play of the bettor there). If nobody staked on the winner: everybody
///     is refunded in full (no fee).
///   - THE RESULT is posted by RESOLVER (the server's gas-only keeper) after the round ends: the winner and the world's fingerprint at the
///     round's last block (anyone can replay the public journal with the engine and compare). It can be posted once, and only before
///     RESOLVE_DEADLINE blocks after the end; past that, the round is refunded.
///   - THE CHALLENGE: during CHALLENGE_BLOCKS after a result, anyone may challenge by paying CHALLENGE_BOND_USD_E18 of TBLOCK. A challenged
///     round is refunded to every bettor in full and the bond goes to the vault. Nobody judges: a challenge does not pick another winner,
///     it cancels the round (so a wrong result can never be paid, and griefing costs the bond).
///   - no owner, no withdraw, no upgrade. RESOLVER is replaced only by DEV/DEV2 after RESOLVER_DELAY, announced (the hearts' pattern), and
///     the replacement can be renounced for good.
interface IERC20M {
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function transfer(address to, uint256 v) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}
interface IPriceM { function price() external view returns (uint256); function priceSetAt() external view returns (uint256); }

contract CrownMarket {
    uint256 internal constant BPS = 10_000;
    address public immutable TBLOCK;
    address public immutable VAULT;
    address public immutable LIKES;              // price source
    address public immutable DEV;
    address public immutable DEV2;
    uint256 public immutable GENESIS_BLOCK;
    uint256 public immutable ROUND_BLOCKS;
    uint256 public immutable RESOLVE_DEADLINE;   // blocks after a round's end to post a result
    uint256 public immutable CHALLENGE_BLOCKS;   // blocks after a result during which it can be challenged
    uint256 public immutable FEE_BPS;            // <= 1,000 (10 %)
    uint256 public immutable MIN_BET_USD_E18;
    uint256 public immutable CHALLENGE_BOND_USD_E18;
    uint256 public immutable MAX_PRICE_AGE;
    uint256 public constant RESOLVER_DELAY = 2 days;

    address public resolver;
    address public pendingResolver;
    uint256 public pendingResolverAt;
    bool public resolverRenounced;

    enum State { Open, Posted, Challenged }
    struct Round { uint256 pot; State state; address winner; bytes32 worldHash; uint256 postedAt; uint256 onWinner; }
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => uint256)) public stakeOn;                         // round => block => total stake
    mapping(uint256 => mapping(address => mapping(address => uint256))) public stakeOf;     // round => bettor => block => stake
    mapping(uint256 => mapping(address => uint256)) public totalOf;                         // round => bettor => all its stakes
    mapping(uint256 => mapping(address => bool)) public claimed;
    uint256 private _lock = 1;

    event Bet(uint256 indexed round, address indexed bettor, address indexed blockToken, uint256 tblock);
    event Posted(uint256 indexed round, address indexed winner, bytes32 worldHash, uint256 atBlock);
    event Challenged(uint256 indexed round, address indexed by, uint256 bond);
    event Claimed(uint256 indexed round, address indexed bettor, uint256 paid, bool refund);
    event FeePaid(uint256 indexed round, uint256 fee);
    event ResolverAnnounced(address next, uint256 at);
    event ResolverChanged(address next);

    error BadParams(); error Closed(); error TooLow(uint256 due); error StalePrice(); error NotResolver(); error NotDev(); error TooEarly();
    error AlreadyPosted(); error NotPosted(); error ChallengeOver(); error NothingToClaim(); error Locked(); error Renounced(); error NotDelivered();

    modifier nonReentrant() { if (_lock != 1) revert Locked(); _lock = 2; _; _lock = 1; }

    struct Config {
        address tblock; address vault; address likes; address resolver; address dev; address dev2; uint256 genesisBlock; uint256 roundBlocks;
        uint256 resolveDeadline; uint256 challengeBlocks; uint256 feeBps; uint256 minBetUsdE18; uint256 challengeBondUsdE18; uint256 maxPriceAge;
    }
    constructor(Config memory c) {
        if (c.tblock == address(0) || c.vault == address(0) || c.likes == address(0) || c.resolver == address(0)) revert BadParams();
        if (c.dev == address(0) || c.dev2 == address(0) || c.dev == c.dev2 || c.resolver == c.dev || c.resolver == c.dev2) revert BadParams();
        if (c.roundBlocks < 100 || c.roundBlocks % 2 != 0 || c.resolveDeadline == 0 || c.challengeBlocks == 0 || c.feeBps > 1_000) revert BadParams();
        if (c.minBetUsdE18 == 0 || c.challengeBondUsdE18 == 0 || c.maxPriceAge == 0 || c.maxPriceAge > 2 days) revert BadParams();
        if (c.tblock.code.length == 0 || c.likes.code.length == 0) revert BadParams();
        TBLOCK = c.tblock; VAULT = c.vault; LIKES = c.likes; DEV = c.dev; DEV2 = c.dev2; GENESIS_BLOCK = c.genesisBlock; ROUND_BLOCKS = c.roundBlocks;
        RESOLVE_DEADLINE = c.resolveDeadline; CHALLENGE_BLOCKS = c.challengeBlocks; FEE_BPS = c.feeBps; MIN_BET_USD_E18 = c.minBetUsdE18;
        CHALLENGE_BOND_USD_E18 = c.challengeBondUsdE18; MAX_PRICE_AGE = c.maxPriceAge; resolver = c.resolver;
    }

    /* ── clock ── */
    function roundAt(uint256 blk) public view returns (uint256) { if (blk < GENESIS_BLOCK) revert TooEarly(); return (blk - GENESIS_BLOCK) / ROUND_BLOCKS; }
    function roundStart(uint256 r) public view returns (uint256) { return GENESIS_BLOCK + r * ROUND_BLOCKS; }
    function roundEnd(uint256 r) public view returns (uint256) { return roundStart(r) + ROUND_BLOCKS - 1; } /* the round's last block */

    /* ── price ── */
    function tblockFor(uint256 usdE18) public view returns (uint256) {
        uint256 p = IPriceM(LIKES).price(); uint256 at = IPriceM(LIKES).priceSetAt();
        if (p == 0 || block.timestamp > at + MAX_PRICE_AGE) revert StalePrice();
        return (usdE18 * 1e18 + p - 1) / p;
    }
    function minBet() external view returns (uint256) { return tblockFor(MIN_BET_USD_E18); }

    /* ── betting ── */
    function bet(uint256 r, address blockToken, uint256 amount) external nonReentrant {
        if (blockToken == address(0)) revert BadParams();
        if (block.number < roundStart(r) || block.number >= roundStart(r) + ROUND_BLOCKS / 2) revert Closed();
        uint256 due = tblockFor(MIN_BET_USD_E18);
        if (amount < due) revert TooLow(due);
        _pull(msg.sender, amount);
        Round storage R = rounds[r];
        R.pot += amount; stakeOn[r][blockToken] += amount; stakeOf[r][msg.sender][blockToken] += amount; totalOf[r][msg.sender] += amount;
        emit Bet(r, msg.sender, blockToken, amount);
    }

    /* ── result, challenge ── */
    function post(uint256 r, address winner, bytes32 worldHash) external {
        if (msg.sender != resolver) revert NotResolver();
        Round storage R = rounds[r];
        if (R.state != State.Open || R.postedAt != 0) revert AlreadyPosted();
        uint256 end = roundEnd(r);
        if (block.number <= end) revert TooEarly();
        if (block.number > end + RESOLVE_DEADLINE) revert Closed();
        if (winner == address(0)) revert BadParams();
        R.state = State.Posted; R.winner = winner; R.worldHash = worldHash; R.postedAt = block.number; R.onWinner = stakeOn[r][winner];
        emit Posted(r, winner, worldHash, end);
    }
    function challenge(uint256 r) external nonReentrant {
        Round storage R = rounds[r];
        if (R.state != State.Posted) revert NotPosted();
        if (block.number > R.postedAt + CHALLENGE_BLOCKS) revert ChallengeOver();
        uint256 bond = tblockFor(CHALLENGE_BOND_USD_E18);
        R.state = State.Challenged;
        _pullTo(msg.sender, VAULT, bond);
        emit Challenged(r, msg.sender, bond);
    }

    /* ── what a bettor gets: refund (challenged, unresolved in time, or nobody on the winner) or its share of the pot ── */
    function refundable(uint256 r) public view returns (bool) {
        Round storage R = rounds[r];
        if (R.state == State.Challenged) return true;
        if (R.state == State.Open) return block.number > roundEnd(r) + RESOLVE_DEADLINE;
        return R.onWinner == 0; /* posted, nobody staked on the winner */
    }
    function payable_(uint256 r, address bettor) public view returns (uint256 amount, bool refund) {
        Round storage R = rounds[r];
        if (claimed[r][bettor]) return (0, false);
        if (refundable(r)) return (totalOf[r][bettor], true);
        if (R.state != State.Posted || block.number <= R.postedAt + CHALLENGE_BLOCKS) return (0, false);
        uint256 s = stakeOf[r][bettor][R.winner];
        if (s == 0) return (0, false);
        uint256 net = R.pot - (R.pot * FEE_BPS) / BPS;
        return ((net * s) / R.onWinner, false);
    }
    function claim(uint256 r) external nonReentrant {
        (uint256 amount, bool refund) = payable_(r, msg.sender);
        if (amount == 0) revert NothingToClaim();
        claimed[r][msg.sender] = true;
        Round storage R = rounds[r];
        if (!refund && !_feeSent[r]) { _feeSent[r] = true; uint256 fee = (R.pot * FEE_BPS) / BPS; if (fee > 0) { _send(VAULT, fee); emit FeePaid(r, fee); } }
        _send(msg.sender, amount);
        emit Claimed(r, msg.sender, amount, refund);
    }
    mapping(uint256 => bool) private _feeSent;

    /* ── resolver replacement (hearts pattern): announced by DEV/DEV2, effective after RESOLVER_DELAY, renounceable ── */
    function announceResolver(address k) external {
        if (msg.sender != DEV && msg.sender != DEV2) revert NotDev();
        if (resolverRenounced) revert Renounced();
        if (k == address(0) || k == DEV || k == DEV2) revert BadParams();
        pendingResolver = k; pendingResolverAt = block.timestamp + RESOLVER_DELAY; emit ResolverAnnounced(k, pendingResolverAt);
    }
    function acceptResolver() external {
        if (pendingResolver == address(0) || block.timestamp < pendingResolverAt) revert TooEarly();
        resolver = pendingResolver; pendingResolver = address(0); emit ResolverChanged(resolver);
    }
    function renounceResolverChanges() external { if (msg.sender != DEV && msg.sender != DEV2) revert NotDev(); resolverRenounced = true; pendingResolver = address(0); }

    /* ── token moves, measured ── */
    function _pull(address from, uint256 v) private {
        uint256 b = IERC20M(TBLOCK).balanceOf(address(this));
        if (!IERC20M(TBLOCK).transferFrom(from, address(this), v)) revert NotDelivered();
        if (IERC20M(TBLOCK).balanceOf(address(this)) - b != v) revert NotDelivered();
    }
    function _pullTo(address from, address to, uint256 v) private {
        uint256 b = IERC20M(TBLOCK).balanceOf(to);
        if (!IERC20M(TBLOCK).transferFrom(from, to, v)) revert NotDelivered();
        if (IERC20M(TBLOCK).balanceOf(to) - b != v) revert NotDelivered();
    }
    function _send(address to, uint256 v) private { if (!IERC20M(TBLOCK).transfer(to, v)) revert NotDelivered(); }
}
