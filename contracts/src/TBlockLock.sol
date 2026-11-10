// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TBlockLock - a holder locks their OWN TBLOCK for a time they choose; the app's holder features read what is locked
///        (TokenizedBlock, Phil 2026-11-10: "to reach the real holder stage, a holder must LOCK their TBLOCK to use the app: a buyer can use
///        it and sell right after, a direct lock makes the difference").
/// @notice Why our own contract: basestonk's vesting vault exists only for a launch's dev buy, is created only by its V7 launcher
///         (create() reverts for anyone else, read on Base 2026-11-10) and vaultOf(TBLOCK) is 0. B20 launches earn no holder dividends,
///         so tokens locked here lose none.
/// THE RULES (all in code, nobody can change them):
///   - lock(amount, unlockAt): pulls `amount` TBLOCK from the caller, measured by this contract's balance before/after; unlockAt is at
///     least MIN_LOCK and at most MAX_LOCK from now; adding to an existing lock keeps the LATER of the two dates (never shortens).
///   - extend(unlockAt): only later, never earlier, at most MAX_LOCK from now.
///   - withdraw(): after unlockAt, the WHOLE lock back to the caller. Before it: reverts. Nobody else can withdraw anyone's lock.
///   - no owner, no admin, no fee, no pause, no rescue, no upgrade. The contract holds only what holders locked.
///   - lockedOf(a) is the amount the app (and future contracts) read; it is 0 once withdrawn.
contract TBlockLock {
    address public immutable TBLOCK;
    uint256 public constant MIN_LOCK = 7 days;
    uint256 public constant MAX_LOCK = 4 * 365 days;

    struct Lock { uint128 amount; uint64 unlockAt; }
    mapping(address => Lock) private _locks;
    uint256 public totalLocked;
    uint256 private _guard = 1;

    event Locked(address indexed holder, uint256 added, uint256 total, uint256 unlockAt);
    event Extended(address indexed holder, uint256 unlockAt);
    event Withdrawn(address indexed holder, uint256 amount);

    error BadToken();
    error BadAmount();
    error BadDate(uint256 earliest, uint256 latest);
    error StillLocked(uint256 unlockAt);
    error NothingLocked();
    error TransferFailed();
    error ShortArrival(uint256 expected, uint256 arrived);
    error Reentrancy();

    modifier nonReentrant() { if (_guard != 1) revert Reentrancy(); _guard = 2; _; _guard = 1; }

    constructor(address tblock) {
        if (tblock == address(0) || tblock.code.length == 0) revert BadToken();
        TBLOCK = tblock;
    }

    function lockedOf(address a) external view returns (uint256) { return _locks[a].amount; }
    function unlockAtOf(address a) external view returns (uint256) { return _locks[a].unlockAt; }
    /// @notice what a GATE must read (review SEC-001): 0 once the date has passed, so an expired lock cannot pass a gate and withdraw in
    ///         the same transaction. A reader that wants commitment also checks the time left: unlockAtOf(a) - block.timestamp.
    function activeLockedOf(address a) external view returns (uint256) {
        Lock memory l = _locks[a];
        return block.timestamp < l.unlockAt ? l.amount : 0;
    }

    function lock(uint256 amount, uint256 unlockAt) external nonReentrant {
        if (amount == 0) revert BadAmount();
        Lock memory l = _locks[msg.sender];
        uint256 earliest = block.timestamp + MIN_LOCK;
        uint256 latest = block.timestamp + MAX_LOCK;
        /* adding to a lock: the date is the LATER of the stored one and the one asked; that date must be at least MIN_LOCK away and the
         *   asked one at most MAX_LOCK away (a top-up onto a lock still >= 7 days away is accepted whatever date it asks) */
        uint256 date = unlockAt > l.unlockAt ? unlockAt : l.unlockAt;
        if (date < earliest || unlockAt > latest) revert BadDate(earliest, latest);
        uint256 before = _bal(address(this));
        _pull(msg.sender, amount);
        uint256 arrived = _bal(address(this)) - before;
        if (arrived != amount) revert ShortArrival(amount, arrived);
        uint256 total = uint256(l.amount) + amount;
        if (total > type(uint128).max) revert BadAmount();
        _locks[msg.sender] = Lock(uint128(total), uint64(date));
        totalLocked += amount;
        emit Locked(msg.sender, amount, total, date);
    }

    function extend(uint256 unlockAt) external {
        Lock memory l = _locks[msg.sender];
        if (l.amount == 0) revert NothingLocked();
        uint256 latest = block.timestamp + MAX_LOCK;
        /* review SEC-002: an extension is a new commitment, so it too is at least MIN_LOCK from now (no 1-second "active" lock) */
        uint256 earliest = block.timestamp + MIN_LOCK;
        if (uint256(l.unlockAt) + 1 > earliest) earliest = uint256(l.unlockAt) + 1;
        if (unlockAt < earliest || unlockAt > latest) revert BadDate(earliest, latest);
        _locks[msg.sender].unlockAt = uint64(unlockAt);
        emit Extended(msg.sender, unlockAt);
    }

    function withdraw() external nonReentrant {
        Lock memory l = _locks[msg.sender];
        if (l.amount == 0) revert NothingLocked();
        if (block.timestamp < l.unlockAt) revert StillLocked(l.unlockAt);
        delete _locks[msg.sender];
        totalLocked -= l.amount;
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, msg.sender, uint256(l.amount)));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
        emit Withdrawn(msg.sender, l.amount);
    }

    function _pull(address from, uint256 amount) private {
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0x23b872dd, from, address(this), amount));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
    }
    function _bal(address a) private view returns (uint256) {
        (bool ok, bytes memory r) = TBLOCK.staticcall(abi.encodeWithSelector(0x70a08231, a));
        if (!ok || r.length < 32) revert TransferFailed();
        return abi.decode(r, (uint256));
    }
}
