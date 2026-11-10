// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TBlockLock - a holder locks their OWN TBLOCK for a time they choose; the app's holder features read what is locked
///        (TokenizedBlock, Phil 2026-11-10: "to reach the real holder stage, a holder must LOCK their TBLOCK to use the app: a buyer can use
///        it and sell right after, a direct lock makes the difference"; "add a 7-day withdrawal period too").
/// @notice Why our own contract: basestonk's vesting vault exists only for a launch's dev buy, is created only by its V7 launcher
///         (create() reverts for anyone else, read on Base 2026-11-10) and vaultOf(TBLOCK) is 0. B20 launches earn no holder dividends,
///         so tokens locked here lose none.
/// THE RULES (all in code, nobody can change them):
///   - lock(amount, unlockAt): pulls `amount` TBLOCK from the caller, measured by this contract's balance before/after; the lock's date is
///     the LATER of the stored one and the one asked, at least MIN_LOCK and the asked one at most MAX_LOCK from now (never shortens).
///   - extend(unlockAt): only later, at least MIN_LOCK from now, at most MAX_LOCK.
///   - EXIT IN TWO STEPS (the 7-day withdrawal period): requestWithdraw() ends the holder perks AT ONCE (activeLockedOf = 0) and starts
///     WITHDRAW_DELAY; withdraw() pays the WHOLE lock back once BOTH the lock's date and the request + 7 days have passed. lock() or extend()
///     after a request re-commits (the request is cleared); cancelWithdraw() clears it too. Nobody else can request or withdraw anyone's lock.
///   - no owner, no admin, no fee, no pause, no rescue, no upgrade. The contract holds only what holders locked.
///   - a GATE reads activeLockedOf(a): the amount while the date is ahead AND no exit was requested, else 0.
contract TBlockLock {
    address public immutable TBLOCK;
    uint256 public constant MIN_LOCK = 7 days;
    uint256 public constant MAX_LOCK = 4 * 365 days;
    uint256 public constant WITHDRAW_DELAY = 7 days;

    struct Lock { uint128 amount; uint64 unlockAt; uint64 requestedAt; }
    mapping(address => Lock) private _locks;
    uint256 public totalLocked;
    uint256 private _guard = 1;

    event Locked(address indexed holder, uint256 added, uint256 total, uint256 unlockAt);
    event Extended(address indexed holder, uint256 unlockAt);
    event WithdrawRequested(address indexed holder, uint256 withdrawableAt);
    event WithdrawCancelled(address indexed holder);
    event Withdrawn(address indexed holder, uint256 amount);

    error BadToken();
    error BadAmount();
    error BadDate(uint256 earliest, uint256 latest);
    error NotRequested();
    error AlreadyRequested(uint256 withdrawableAt);
    error TooEarly(uint256 withdrawableAt);
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
    function requestedAtOf(address a) external view returns (uint256) { return _locks[a].requestedAt; }
    /// @notice what a GATE must read (review SEC-001): 0 once the date has passed OR an exit was requested, so a lock on its way out cannot
    ///         pass a gate. A reader that wants commitment also checks the time left: unlockAtOf(a) - block.timestamp.
    function activeLockedOf(address a) external view returns (uint256) {
        Lock memory l = _locks[a];
        return (l.requestedAt == 0 && block.timestamp < l.unlockAt) ? l.amount : 0;
    }
    /// @notice when withdraw() will pay: the later of the lock's date and request + WITHDRAW_DELAY; 0 when no exit was requested
    function withdrawableAtOf(address a) public view returns (uint256) {
        Lock memory l = _locks[a];
        if (l.requestedAt == 0) return 0;
        uint256 w = uint256(l.requestedAt) + WITHDRAW_DELAY;
        return w > l.unlockAt ? w : l.unlockAt;
    }

    function lock(uint256 amount, uint256 unlockAt) external nonReentrant {
        if (amount == 0) revert BadAmount();
        Lock memory l = _locks[msg.sender];
        uint256 earliest = block.timestamp + MIN_LOCK;
        uint256 latest = block.timestamp + MAX_LOCK;
        /* adding to a lock: the date is the LATER of the stored one and the one asked; that date must be at least MIN_LOCK away and the
         *   asked one at most MAX_LOCK away (a top-up onto a lock still >= 7 days away keeps that later date, whatever date it asks) */
        uint256 date = unlockAt > l.unlockAt ? unlockAt : l.unlockAt;
        if (date < earliest || unlockAt > latest) revert BadDate(earliest, latest);
        uint256 before = _bal(address(this));
        _pull(msg.sender, amount);
        uint256 arrived = _bal(address(this)) - before;
        if (arrived != amount) revert ShortArrival(amount, arrived);
        uint256 total = uint256(l.amount) + amount;
        if (total > type(uint128).max) revert BadAmount();
        /* locking more re-commits: a pending exit request is cleared */
        _locks[msg.sender] = Lock(uint128(total), uint64(date), 0);
        totalLocked += amount;
        emit Locked(msg.sender, amount, total, date);
    }

    function extend(uint256 unlockAt) external nonReentrant {
        Lock memory l = _locks[msg.sender];
        if (l.amount == 0) revert NothingLocked();
        uint256 latest = block.timestamp + MAX_LOCK;
        /* review SEC-002: an extension is a new commitment, so it too is at least MIN_LOCK from now (no 1-second "active" lock) */
        uint256 earliest = block.timestamp + MIN_LOCK;
        if (uint256(l.unlockAt) + 1 > earliest) earliest = uint256(l.unlockAt) + 1;
        if (unlockAt < earliest || unlockAt > latest) revert BadDate(earliest, latest);
        _locks[msg.sender].unlockAt = uint64(unlockAt);
        _locks[msg.sender].requestedAt = 0;
        emit Extended(msg.sender, unlockAt);
    }

    /// @notice step 1 of the exit: the perks end now (activeLockedOf = 0); withdraw() opens at withdrawableAtOf(msg.sender)
    function requestWithdraw() external nonReentrant {
        Lock memory l = _locks[msg.sender];
        if (l.amount == 0) revert NothingLocked();
        if (l.requestedAt != 0) revert AlreadyRequested(withdrawableAtOf(msg.sender));
        _locks[msg.sender].requestedAt = uint64(block.timestamp);
        emit WithdrawRequested(msg.sender, withdrawableAtOf(msg.sender));
    }

    /// @notice stay locked after all: clears the request (the perks come back while the date is ahead)
    function cancelWithdraw() external nonReentrant {
        if (_locks[msg.sender].requestedAt == 0) revert NotRequested();
        _locks[msg.sender].requestedAt = 0;
        emit WithdrawCancelled(msg.sender);
    }

    /// @notice step 2 of the exit: the WHOLE lock back to the caller, once the lock's date and the 7-day period have both passed
    function withdraw() external nonReentrant {
        Lock memory l = _locks[msg.sender];
        if (l.amount == 0) revert NothingLocked();
        if (l.requestedAt == 0) revert NotRequested();
        uint256 at = withdrawableAtOf(msg.sender);
        if (block.timestamp < at) revert TooEarly(at);
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
