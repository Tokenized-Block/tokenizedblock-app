// faire-vault-v2.mjs <v1 path> <v2 path> — derives TBlockVaultV2 from the REVIEWED TBlockVault v1 by EXACT replacements (each anchor must exist
// once), so everything not named here (contest feeding, dev rescue, release, token plumbing) stays byte-identical to v1.
import fs from 'node:fs';
/* RETIRED 2026-11-11 (game370): TBlockVaultV2.sol is now edited directly (USD tiers $15/$100/$500/$1000, MAX_FACTOR 17,500, cap before the factor).
 * Re-running this generator would bring back the old 1.0x-1.5x factor and overwrite the reviewed source. */
throw new Error('faire-vault-v2.mjs is retired: edit contracts/src/TBlockVaultV2.sol directly');
let s = fs.readFileSync(process.argv[2], 'utf8');
const rep = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw new Error('anchor x' + n + ': ' + a.slice(0, 80)); s = s.replace(a, () => b); };

rep('    function currentEpoch() external view returns (uint256);\n}', '    function currentEpoch() external view returns (uint256);\n    function minHold() external view returns (uint256);\n}\n\n/// TBlockLock (game349): what a holder has LOCKED and committed, and until when\ninterface ILockView {\n    function activeLockedOf(address a) external view returns (uint256);\n    function unlockAtOf(address a) external view returns (uint256);\n}');
rep('/// @title TBlockVault - the community vault of TokenizedBlock (Phil 2026-11-10).', '/// @title TBlockVaultV2 - the HOLDERS vault (Phil 2026-11-10 night: "vault access from $15 of the token; the more he locks, the bigger the\n///        reward"; 10/11: "the holders pot pays those who PLAY, never pro rata"). Derived from TBlockVault v1 by exact replacements: only\n///        the claim rule and the share change; contest feeding, dev rescue, release and token plumbing are v1\'s reviewed code.\n/// V2 CLAIM: the claimer must have LOCKED (TBlockLock.activeLockedOf) at least LIKES.minHold() ($15 at the bounded keeper price of\n///        BlockLikesV2), still committed MIN_COMMIT ahead (unlockAtOf >= now + 7 days). V2 SHARE: v1\'s play share x lockFactor / MAX_FACTOR,\n///        lockFactor in [1.0, 1.5] from the amount locked (up to 4x the minimum) and the time left (up to 90 days) - so the sum of every\n///        claim never exceeds the players\' budget, a bigger/longer lock only gets closer to the full play share, and a non-player gets 0.\n/// (v1 notes below kept as written.)');
rep('contract TBlockVault {', 'contract TBlockVaultV2 {');
rep('    address public immutable CONTEST;\n', '    address public immutable CONTEST;\n    address public immutable LOCK;              // TBlockLock\n    uint256 public constant MIN_COMMIT = 7 days;   // a claimer stays locked at least this long after the claim\n    uint256 public constant MAX_FACTOR = 15_000;   // lockFactor ceiling in bps (1.5x)\n    uint256 public constant AMOUNT_STEPS = 3;      // amount bonus reaches its max at 4x the minimum\n    uint256 public constant TIME_FULL = 90 days;   // time bonus reaches its max at 90 days left\n');
rep('    uint256 public immutable MIN_HOLD;          // raw TBLOCK a claimer must hold\n', '');
rep('    error HoldTooLow(uint256 balance, uint256 minHold);', '    error HoldTooLow(uint256 locked, uint256 minHold);\n    error NotCommitted(uint256 unlockAt, uint256 needed);');
rep('        address tblock; address likes; address contest; uint256 minHold; uint256 rewardBps;', '        address tblock; address likes; address contest; address lock; uint256 rewardBps;');
rep('        if (c.tblock == address(0) || c.likes == address(0) || c.contest == address(0)) revert BadParams();', '        if (c.tblock == address(0) || c.likes == address(0) || c.contest == address(0)) revert BadParams();\n        if (c.lock == address(0) || c.lock.code.length == 0) revert BadParams();');
rep('TBLOCK = c.tblock; LIKES = c.likes; CONTEST = c.contest; MIN_HOLD = c.minHold; REWARD_BPS', 'TBLOCK = c.tblock; LIKES = c.likes; CONTEST = c.contest; LOCK = c.lock; REWARD_BPS');
/* the share: v1's arithmetic x lockFactor / MAX_FACTOR, the factor read from the lock NOW */
rep('    /// @notice what claim(e) would pay `player` now (0,0 if nothing): the same arithmetic as claim, without the checks on time/hold.\n    function owed(uint256 e, address player) public view returns (uint256 share, uint256 topBonus) {',
  '    /// @notice the lock bonus of `player` now, in bps: 10,000 (1x) .. MAX_FACTOR (1.5x); 0 when below the minimum or not committed\n    function lockFactor(address player) public view returns (uint256) {\n        ILockView K = ILockView(LOCK);\n        uint256 locked = K.activeLockedOf(player);\n        uint256 need = ILikesView(LIKES).minHold();\n        if (need == 0 || locked < need) return 0;\n        uint256 u = K.unlockAtOf(player);\n        if (u < block.timestamp + MIN_COMMIT) return 0;\n        uint256 steps = locked / need - 1;                       // 0 at the minimum\n        if (steps > AMOUNT_STEPS) steps = AMOUNT_STEPS;\n        uint256 left = u - block.timestamp;\n        if (left > TIME_FULL) left = TIME_FULL;\n        return BPS + 2_500 * steps / AMOUNT_STEPS + 2_500 * left / TIME_FULL;\n    }\n\n    /// @notice what claim(e) would pay `player` now (0,0 if nothing): v1\'s arithmetic x lockFactor / MAX_FACTOR, without the time checks.\n    function owed(uint256 e, address player) public view returns (uint256 share, uint256 topBonus) {');
rep('        share = E.budget * (BPS - TOP_BPS) / BPS * spent / total;\n        if (share > cap) share = cap;',
  '        uint256 f = lockFactor(player);\n        if (f == 0) return (0, 0);\n        share = E.budget * (BPS - TOP_BPS) / BPS * spent / total * f / MAX_FACTOR;\n        if (share > cap) share = cap;');
rep('            topBonus = E.budget * TOP_BPS / BPS;\n            if (topBonus > cap) topBonus = cap;',
  '            topBonus = E.budget * TOP_BPS / BPS * f / MAX_FACTOR;\n            if (topBonus > cap) topBonus = cap;');
/* the claim gate: LOCKED, committed, read at the call */
rep('        uint256 held = _bal(msg.sender);\n        if (held < MIN_HOLD) revert HoldTooLow(held, MIN_HOLD);',
  '        uint256 locked = ILockView(LOCK).activeLockedOf(msg.sender);\n        uint256 need = ILikesView(LIKES).minHold();\n        if (locked < need) revert HoldTooLow(locked, need);\n        uint256 u = ILockView(LOCK).unlockAtOf(msg.sender);\n        if (u < block.timestamp + MIN_COMMIT) revert NotCommitted(u, block.timestamp + MIN_COMMIT);');
/* ── review 2026-11-11 (LikesV2 + VaultV2) ── */
/* SEC-004: the hearts and the vault read the SAME lock */
rep('    function minHold() external view returns (uint256);\n}', '    function minHold() external view returns (uint256);\n    function LOCK() external view returns (address);\n}');
rep('        if (c.lock == address(0) || c.lock.code.length == 0) revert BadParams();',
  '        if (c.lock == address(0) || c.lock.code.length == 0) revert BadParams();\n        /* review SEC-004: the hearts and the vault read the SAME lock, or the hold rule splits */\n        if (ILikesView(c.likes).LOCK() != c.lock) revert BadParams();');
/* SEC-002: the minimum is photographed when the week closes; a claim needs the LOWER of that photo and the minimum now, so an honest price
 *   move after the close never takes away a share already earned */
rep('    uint256 public reserved;\n', '    uint256 public reserved;\n    mapping(uint256 => uint256) public minHoldAt;   // review SEC-002: LIKES.minHold() photographed at closeEpoch(e)\n');
rep('        E.closed = true; E.closedAt = uint64(block.timestamp); E.budget = budget;', '        E.closed = true; E.closedAt = uint64(block.timestamp); E.budget = budget;\n        minHoldAt[e] = ILikesView(LIKES).minHold();');
rep('    function lockFactor(address player) public view returns (uint256) {\n        ILockView K = ILockView(LOCK);\n        uint256 locked = K.activeLockedOf(player);\n        uint256 need = ILikesView(LIKES).minHold();\n',
  '    function lockFactor(address player) public view returns (uint256) { return lockFactorAt(player, ILikesView(LIKES).minHold()); }\n'
  + '    /// @notice the minimum a claim of week e needs: the lower of the photo taken at its close and the minimum now (SEC-002)\n'
  + '    function needFor(uint256 e) public view returns (uint256) {\n        uint256 now_ = ILikesView(LIKES).minHold();\n        uint256 photo = minHoldAt[e];\n        return photo != 0 && photo < now_ ? photo : now_;\n    }\n'
  + '    /// @notice the lock bonus of `player` against the minimum `need`\n    function lockFactorAt(address player, uint256 need) public view returns (uint256) {\n        ILockView K = ILockView(LOCK);\n        uint256 locked = K.activeLockedOf(player);\n');
rep('        uint256 f = lockFactor(player);\n', '        uint256 f = lockFactorAt(player, needFor(e));\n');
rep('        uint256 locked = ILockView(LOCK).activeLockedOf(msg.sender);\n        uint256 need = ILikesView(LIKES).minHold();\n', '        uint256 locked = ILockView(LOCK).activeLockedOf(msg.sender);\n        uint256 need = needFor(e);\n');
fs.writeFileSync(process.argv[3], s);
console.log('TBlockVaultV2 written: ' + s.length + ' chars');
