// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockLikesV2 - a heart priced in DOLLARS of TBLOCK (TokenizedBlock, Phil 2026-11-10: "the heart is worth $0.50 of TBLOCK
///        computed live", "the hold is $15 at the current price").
/// @notice Same counters and views as BlockLikes v1 (likesOf, spentIn, totalSpentIn, topOf, epochAt/currentEpoch/epochEnd), so
///         TBlockVaultV2 (lock-aware) reads them with this address as its LIKES. What changes: the price of a heart and the hold are
///         computed from a STORED TBLOCK price (USD per whole TBLOCK, 1e18-scaled), not engraved in TBLOCK amounts.
///
/// THE PRICE (why a keeper, and why bounded):
///   - a pool price read inside the call can be pushed for one block (flash loan); Uniswap v4 has no built-in TWAP. So a keeper writes
///     the price, from the app server's read (the lower of now and ~10 minutes ago).
///   - the keeper can write at most once per MIN_INTERVAL, and only within +/- MAX_STEP_BPS of the last price: a wrong or stolen
///     keeper moves the price at most that much per interval, and every write is an event anyone can audit.
///   - PRICE_FLOOR / PRICE_CEIL (immutable) bound the price forever, so a heart can never become free or impossible.
///   - the keeper is replaced only by DEV or DEV2, announced, after KEEPER_DELAY; renounceable for good.
///   - this contract holds nothing and pays nobody: every heart goes to 0x...dEaD, measured by its balance before/after.
/// the holder stage: what a holder has LOCKED in TBlockLock, 0 once its date passed or an exit was requested (game349, review SEC-001)
interface ILockView { function activeLockedOf(address a) external view returns (uint256); }

contract BlockLikesV2 {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant B20_PREFIX = 0xb2000000000000000000;
    uint256 public constant MAX_LIKES_PER_CALL = 1000;
    uint256 public constant BPS = 10_000;
    uint256 public constant KEEPER_DELAY = 2 days;

    address public immutable TBLOCK;
    address public immutable LOCK;           // TBlockLock: the hold rule reads what is LOCKED (Phil 2026-11-10), not a balance
    uint64 public immutable GENESIS;
    uint64 public immutable EPOCH;
    uint256 public immutable LIKE_USD_E18;   // a heart, in USD * 1e18 (0.50 USD = 5e17)
    uint256 public immutable HOLD_USD_E18;   // the hold after paying, in USD * 1e18 (15 USD = 15e18)
    uint256 public immutable PRICE_FLOOR;    // USD per whole TBLOCK * 1e18, lowest storable
    uint256 public immutable PRICE_CEIL;     // highest storable
    uint256 public immutable MAX_STEP_BPS;   // largest move of one write, in bps of the last price
    uint256 public immutable MIN_INTERVAL;   // seconds between two writes
    address public immutable DEV;
    address public immutable DEV2;

    uint256 public price;          // USD per whole TBLOCK * 1e18
    uint256 public priceSetAt;
    address public keeper;
    address public nextKeeper;
    uint256 public nextKeeperAt;
    bool public keeperRenounced;
    /// review 2026-11-11 SEC-001: DEV or DEV2 can FREEZE the price at once (a stolen keeper key is stopped in one tx, not after 2 days),
    /// optionally back to START_PRICE; only a NEW keeper (announced, 2 days) unfreezes. Freezing stays possible after renounceKeeperChanges.
    bool public frozen;
    uint256 public immutable START_PRICE;
    uint256 public constant MAX_STEP_CAP_BPS = 1_000;  // at most 10 % per write, enforced at construction
    uint256 public constant MIN_INTERVAL_FLOOR = 1 hours;
    uint256 public constant RANGE_CAP = 100;           // floor >= start / 100 and ceiling <= start x 100

    mapping(address => uint256) public likesOf;
    mapping(uint256 => mapping(address => uint256)) public spentIn;
    mapping(uint256 => uint256) public totalSpentIn;
    mapping(uint256 => address) public topOf;
    uint256 public totalLikes;
    uint256 public totalBurned;
    uint256 private _lock = 1;

    event Liked(uint256 indexed epoch, address indexed blockToken, address indexed liker, uint256 likes, uint256 burned);
    event PriceSet(uint256 oldPrice, uint256 newPrice, address indexed by);
    event KeeperAnnounced(address indexed next, uint256 at, address indexed by);
    event KeeperChanged(address indexed oldKeeper, address indexed newKeeper);
    event KeeperRenounced(address indexed by);
    event PriceFrozen(address indexed by, bool resetToStart, uint256 price);

    error BadParams();
    error NotABlock();
    error BadCount();
    error PaymentShort(uint256 expected, uint256 arrived);
    error HoldTooLow(uint256 locked, uint256 minHold);
    error TransferFailed();
    error Locked();
    error NotKeeper();
    error NotDev();
    error TooSoon(uint256 at);
    error StepTooLarge(uint256 oldPrice, uint256 newPrice);
    error OutOfBounds(uint256 newPrice);
    error Renounced();
    error NothingAnnounced();
    error Frozen();

    modifier lock() { if (_lock != 1) revert Locked(); _lock = 2; _; _lock = 1; }

    struct Config {
        address tblock; address lock; uint64 genesis; uint64 epoch;
        uint256 likeUsdE18; uint256 holdUsdE18;
        uint256 priceFloor; uint256 priceCeil; uint256 startPrice;
        uint256 maxStepBps; uint256 minInterval;
        address keeper; address dev; address dev2;
    }

    constructor(Config memory c) {
        if (c.lock == address(0) || c.lock.code.length == 0) revert BadParams();
        if (c.tblock == address(0) || c.epoch == 0 || c.genesis == 0 || c.likeUsdE18 == 0 || c.holdUsdE18 == 0) revert BadParams();
        if (c.priceFloor == 0 || c.priceCeil < c.priceFloor || c.startPrice < c.priceFloor || c.startPrice > c.priceCeil) revert BadParams();
        if (c.maxStepBps == 0 || c.maxStepBps > MAX_STEP_CAP_BPS || c.minInterval < MIN_INTERVAL_FLOOR || c.minInterval > 1 days) revert BadParams();
        if (c.priceFloor < c.startPrice / RANGE_CAP || c.priceCeil > c.startPrice * RANGE_CAP) revert BadParams();
        if (c.keeper == address(0) || c.dev == address(0) || c.dev2 == address(0) || c.dev == c.dev2) revert BadParams();
        /* the largest heart (at the floor) times the call cap must not overflow */
        if (_tokensFor(c.likeUsdE18, c.priceFloor) > type(uint256).max / MAX_LIKES_PER_CALL) revert BadParams();
        TBLOCK = c.tblock; LOCK = c.lock; GENESIS = c.genesis; EPOCH = c.epoch;
        LIKE_USD_E18 = c.likeUsdE18; HOLD_USD_E18 = c.holdUsdE18;
        PRICE_FLOOR = c.priceFloor; PRICE_CEIL = c.priceCeil; MAX_STEP_BPS = c.maxStepBps; MIN_INTERVAL = c.minInterval;
        DEV = c.dev; DEV2 = c.dev2; keeper = c.keeper;
        price = c.startPrice; priceSetAt = block.timestamp; START_PRICE = c.startPrice;
        emit PriceSet(0, c.startPrice, msg.sender);
    }

    /* ── epochs, exactly as v1 ─────────────────────────────────────────────────────────────── */
    function epochAt(uint256 t) public view returns (uint256) { return t < GENESIS ? 0 : (t - GENESIS) / EPOCH; }
    function currentEpoch() public view returns (uint256) { return epochAt(block.timestamp); }
    function epochEnd(uint256 e) public view returns (uint256) { return uint256(GENESIS) + (e + 1) * uint256(EPOCH); }

    /* ── the dollar prices, in raw TBLOCK units (18 decimals), rounded UP so a heart is never under its dollar price ── */
    function _tokensFor(uint256 usdE18, uint256 p) private pure returns (uint256) { return (usdE18 * 1e18 + p - 1) / p; }
    function likePrice() public view returns (uint256) { return _tokensFor(LIKE_USD_E18, price); }
    function minHold() public view returns (uint256) { return HOLD_USD_E18 == 0 ? 0 : _tokensFor(HOLD_USD_E18, price); }

    /// @notice heart `blockToken` n times; pays n * likePrice() TBLOCK to 0x...dEaD from the wallet; the caller must have at least minHold()
    ///         LOCKED and committed (TBlockLock.activeLockedOf: date ahead, no exit requested), read at this call.
    function like(address blockToken, uint256 n) external lock returns (uint256 burned) {
        if (uint256(uint160(blockToken)) >> 80 != B20_PREFIX) revert NotABlock();
        if (n == 0 || n > MAX_LIKES_PER_CALL) revert BadCount();
        uint256 locked = ILockView(LOCK).activeLockedOf(msg.sender);
        uint256 need = minHold();
        if (locked < need) revert HoldTooLow(locked, need);
        burned = n * likePrice();
        uint256 deadBefore = _bal(DEAD);
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0x23b872dd, msg.sender, DEAD, burned));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
        uint256 arrived = _bal(DEAD) - deadBefore;
        if (arrived != burned) revert PaymentShort(burned, arrived);
        uint256 e = currentEpoch();
        likesOf[blockToken] += n;
        totalLikes += n;
        totalBurned += burned;
        uint256 mine = spentIn[e][msg.sender] + burned;
        spentIn[e][msg.sender] = mine;
        totalSpentIn[e] += burned;
        address top = topOf[e];
        if (top != msg.sender && mine > spentIn[e][top]) topOf[e] = msg.sender;
        emit Liked(e, blockToken, msg.sender, n, burned);
    }

    /* ── the keeper's price, bounded ───────────────────────────────────────────────────────── */
    function setPrice(uint256 p) external {
        if (msg.sender != keeper) revert NotKeeper();
        if (frozen) revert Frozen();
        if (block.timestamp < priceSetAt + MIN_INTERVAL) revert TooSoon(priceSetAt + MIN_INTERVAL);
        if (p < PRICE_FLOOR || p > PRICE_CEIL) revert OutOfBounds(p);
        uint256 old = price;
        if (p > old * (BPS + MAX_STEP_BPS) / BPS || p < old * (BPS - MAX_STEP_BPS) / BPS) revert StepTooLarge(old, p);
        price = p; priceSetAt = block.timestamp;
        emit PriceSet(old, p, msg.sender);
    }

    /* ── keeper replacement: DEV or DEV2, announced, after KEEPER_DELAY; renounceable for good ── */
    function _onlyDev() private view { if (msg.sender != DEV && msg.sender != DEV2) revert NotDev(); }
    function announceKeeper(address k) external {
        _onlyDev();
        if (keeperRenounced) revert Renounced();
        if (k == address(0)) revert BadParams();
        nextKeeper = k; nextKeeperAt = block.timestamp + KEEPER_DELAY;
        emit KeeperAnnounced(k, nextKeeperAt, msg.sender);
    }
    function applyKeeper() external {
        _onlyDev();
        if (keeperRenounced) revert Renounced();
        if (nextKeeper == address(0)) revert NothingAnnounced();
        if (block.timestamp < nextKeeperAt) revert TooSoon(nextKeeperAt);
        emit KeeperChanged(keeper, nextKeeper);
        keeper = nextKeeper; nextKeeper = address(0); nextKeeperAt = 0;
        frozen = false; /* a new keeper, announced 2 days in public, is what unfreezes */
    }
    /// @notice DEV or DEV2, at once: stop the keeper's writes; resetToStart puts the price back to START_PRICE (bounded by construction)
    function freezePrice(bool resetToStart) external {
        _onlyDev();
        frozen = true;
        if (resetToStart) { uint256 old = price; price = START_PRICE; priceSetAt = block.timestamp; emit PriceSet(old, START_PRICE, msg.sender); }
        emit PriceFrozen(msg.sender, resetToStart, price);
    }
    function cancelKeeper() external { _onlyDev(); nextKeeper = address(0); nextKeeperAt = 0; }
    function renounceKeeperChanges() external {
        _onlyDev();
        if (keeperRenounced) revert Renounced();
        keeperRenounced = true; nextKeeper = address(0); nextKeeperAt = 0;
        emit KeeperRenounced(msg.sender);
    }

    function _bal(address a) private view returns (uint256) {
        (bool ok, bytes memory r) = TBLOCK.staticcall(abi.encodeWithSelector(0x70a08231, a));
        if (!ok || r.length < 32) revert TransferFailed();
        return abi.decode(r, (uint256));
    }
}
