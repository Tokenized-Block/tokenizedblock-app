/* muter-blockslotsrouter.mjs — each guard of BlockSlotsRouter (the Spin whose dev share goes through the router) is removed or
 * falsified, one at a time, in a COPY; BlockSlotsRouterTest + BlockSlotsRouterRealRouterTest must turn red. Never touches the repo.
 * Usage (from contracts/): node muter-blockslotsrouter.mjs      [FORGE=path/to/forge] [MUT_DIR=folder for the copies] */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { muter } from './muter-routeur-commun.mjs';

const M = [
  /* the spin: the pot stays USDC, the dev share is only counted (new: no router call) */
  ['spin: the whole price to the pot', '        pot += TO_POT;\n', '        pot += SPIN_PRICE;\n'],
  ['spin: dev share not owed', '        devOwed += DEV_SHARE;\n', ''],
  ['spin: pulls only the pot share', '_pull(msg.sender, address(this), SPIN_PRICE);', '_pull(msg.sender, address(this), TO_POT);'],
  /* payDev through the router (new) */
  /* CHANGED (review F1/F2, 2026-11-12): the caller names the batch, MIN_DEV_BATCH .. min(devOwed, MAX_DEV_BATCH) */
  ['payDev: no minimum batch', '        if (owed < MIN_DEV_BATCH || amount < MIN_DEV_BATCH) revert BatchTooSmall();\n', ''],
  ['payDev: an amount under the minimum accepted', 'if (owed < MIN_DEV_BATCH || amount < MIN_DEV_BATCH) revert BatchTooSmall();', 'if (owed < MIN_DEV_BATCH) revert BatchTooSmall();'],
  ['payDev: minimum off by one', 'amount < MIN_DEV_BATCH) revert BatchTooSmall();', 'amount <= MIN_DEV_BATCH) revert BatchTooSmall();'],
  ['payDev: no cap at MAX_DEV_BATCH', 'if (amount > owed || amount > MAX_DEV_BATCH) revert BatchTooLarge();', 'if (amount > owed) revert BatchTooLarge();'],
  ['payDev: cap off by one', 'amount > MAX_DEV_BATCH) revert BatchTooLarge();', 'amount >= MAX_DEV_BATCH) revert BatchTooLarge();'],
  ['payDev: more than owed (no BatchTooLarge)', 'if (amount > owed || amount > MAX_DEV_BATCH) revert BatchTooLarge();', 'if (amount > MAX_DEV_BATCH) revert BatchTooLarge();'],
  ['payDev: devOwed not reduced', '        devOwed = owed - amount;\n', ''],
  ['payDev: returns 0 as the batch', '        return (amount, tblockOut);', '        return (0, tblockOut);'],
  ['payDev: no check that onPaid ran', '        if (_batch != 0) revert BadPayment(); // onPaid ran, for this batch, and forwarded the TBLOCK\n', ''],
  ['payDev: no check of the USDC that left', '        if (before - _bal(USDC, address(this)) != amount) revert TransferFailed(); // exactly the batch left, nothing else\n', ''],
  ['payDev without the lock', '        external\n        nonReentrant\n        returns (uint256, uint256 tblockOut)', '        external\n        returns (uint256, uint256 tblockOut)'],
  ['dev share 0 % in USDC', 'uint16 public constant DEV_BPS = 1000;', 'uint16 public constant DEV_BPS = 0;'],
  ['price read by the router is devOwed at rest', '    function PRICE_USDC() external view returns (uint256) {\n        return _batch;', '    function PRICE_USDC() external view returns (uint256) {\n        return _batch == 0 ? devOwed : _batch;'],
  /* onPaid (new) */
  ['onPaid from anyone', '        if (msg.sender != ROUTER) revert NotRouter();\n', ''],
  ['onPaid outside payDev / any amount', 'if (b == 0 || usdcIn != b || payer != address(this) || tblockOut == 0) revert BadPayment();', 'if (tblockOut == 0) revert BadPayment();'],
  ['onPaid for another payer', 'if (b == 0 || usdcIn != b || payer != address(this) || tblockOut == 0) revert BadPayment();', 'if (b == 0 || usdcIn != b || tblockOut == 0) revert BadPayment();'],
  ['onPaid does not clear the batch', '        _batch = 0;\n', ''],
  ['TBLOCK to the dev wallet instead of the vault', '_call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, DEST, got));', '_call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, DEV_WALLET, got));'],
  ['onPaid forwards only the router output (keeps a donation)', '_call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, DEST, got));\n        if (_bal(TBLOCK, DEST) - destBefore < got || _bal(TBLOCK, address(this)) != 0) revert TransferFailed();', '_call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, DEST, tblockOut));\n        if (_bal(TBLOCK, DEST) - destBefore < tblockOut) revert TransferFailed();'],
  /* the constructor (new) */
  ['vault of another TBLOCK accepted', 'if (!okD || retD.length < 32 || abi.decode(retD, (address)) != tb) revert BadConfig();', 'if (!okD || retD.length < 32) revert BadConfig();'],
  ['router of another USDC accepted', '        if (ISlotsPayRouter(router).USDC() != c.usdc) revert BadConfig();\n', ''],
  ['vault may be the router', 'if (dest.code.length == 0 || dest == router || dest == tb', 'if (dest.code.length == 0 || dest == tb'],
  ['max batch above the router max accepted', 'if (minDevBatch == 0 || minDevBatch > maxDevBatch || maxDevBatch > maxBatch) revert BadConfig();', 'if (minDevBatch == 0 || minDevBatch > maxDevBatch) revert BadConfig();'],
  ['min batch above the max batch accepted', 'if (minDevBatch == 0 || minDevBatch > maxDevBatch || maxDevBatch > maxBatch) revert BadConfig();', 'if (minDevBatch == 0 || maxDevBatch > maxBatch) revert BadConfig();'],
  ['min batch 0 accepted', 'if (minDevBatch == 0 || minDevBatch > maxDevBatch || maxDevBatch > maxBatch) revert BadConfig();', 'if (minDevBatch > maxDevBatch || maxDevBatch > maxBatch) revert BadConfig();'],
  ['MAX_DEV_BATCH = the router max, not the constructor choice', '        MAX_DEV_BATCH = maxDevBatch;\n', '        MAX_DEV_BATCH = maxBatch;\n'],
  /* review 2026-11-12 (Skins F1, same check): DEST is the holders vault */
  ['DEST ROUTER() not read', '        (okD, retD) = dest.staticcall(abi.encodeWithSelector(ISlotsDestToken.ROUTER.selector));\n        if (!okD || retD.length < 32 || abi.decode(retD, (address)) != router) revert BadConfig();\n', ''],
  ['DEST naming another router accepted', 'if (!okD || retD.length < 32 || abi.decode(retD, (address)) != router) revert BadConfig();', 'if (!okD || retD.length < 32) revert BadConfig();'],
  ['DEST without free() accepted', '        if (!okD || retD.length < 32) revert BadConfig();\n        uint256 maxBatch', '        uint256 maxBatch'],
  /* review F4 (the reviewer's rv-muter-extra.mjs). Left out: "_call: codeless token accepted" -- unreachable: the constructor requires
   * code at USDC and TBLOCK and, after EIP-6780, that code cannot be removed (the reviewer's reasoning, not a test). */
  ['onPaid: no check that the router delivered tblockOut', '        if (got < tblockOut) revert BadPayment();\n', ''],
  ['onPaid: tblockOut 0 accepted', 'if (b == 0 || usdcIn != b || payer != address(this) || tblockOut == 0) revert BadPayment();', 'if (b == 0 || usdcIn != b || payer != address(this)) revert BadPayment();'],
  ['onPaid: any usdcIn accepted', 'if (b == 0 || usdcIn != b || payer != address(this) || tblockOut == 0) revert BadPayment();', 'if (b == 0 || payer != address(this) || tblockOut == 0) revert BadPayment();'],
  ['onPaid: no check that nothing stayed here', 'if (_bal(TBLOCK, DEST) - destBefore < got || _bal(TBLOCK, address(this)) != 0) revert TransferFailed();', 'if (_bal(TBLOCK, DEST) - destBefore < got) revert TransferFailed();'],
  ['onPaid: no check that DEST received', 'if (_bal(TBLOCK, DEST) - destBefore < got || _bal(TBLOCK, address(this)) != 0) revert TransferFailed();', 'if (_bal(TBLOCK, address(this)) != 0) revert TransferFailed();'],
  ['payDev: unlimited approve', '_call(USDC, abi.encodeWithSelector(0x095ea7b3, ROUTER, amount));', '_call(USDC, abi.encodeWithSelector(0x095ea7b3, ROUTER, type(uint256).max));'],
  ['payDev: batch in flight not set (price 0)', '        _batch = amount;\n', ''],
  ['ctor: codeless TBLOCK accepted', 'if (expectedTblock == address(0) || tb != expectedTblock || tb.code.length == 0) revert BadConfig();', 'if (expectedTblock == address(0) || tb != expectedTblock) revert BadConfig();'],
  ['ctor: codeless router accepted', '        if (router.code.length == 0) revert BadConfig();\n', ''],
  ['ctor: dest may be the dev wallet', ' || dest == c.usdc || dest == c.devWallet) revert BadConfig();', ' || dest == c.usdc) revert BadConfig();'],
  ['ctor: dev wallet may be TBLOCK', 'if (c.devWallet == router || c.devWallet == tb) revert BadConfig();', 'if (c.devWallet == router) revert BadConfig();'],
  ['dev wallet may be the router', '        if (c.devWallet == router || c.devWallet == tb) revert BadConfig();\n', ''],
  /* the game (unchanged from the live contract) */
  ['settle takes a capped prize', '        if (payout > pot) revert PotShort();\n', '        if (payout > pot) payout = pot;\n'],
  ['settleMany takes a capped prize', '            if (payout > pot) continue;\n', '            if (payout > pot) payout = pot;\n'],
  ['acceptCapped by a third party', '        if (msg.sender != s.player) revert NotPlayer();\n', ''],
  ['house edge not checked', '        if (expectedNumerator(c.prizes) >= toPot * DIST_DENOM) revert BadConfig();\n', ''],
  ['three faces on the target block only', 'h[r] = blockhash(t + r);', 'h[r] = blockhash(t);'],
  ['window 255', 'uint256 public constant SETTLE_WINDOW = 256;', 'uint256 public constant SETTLE_WINDOW = 255;'],
  ['prize to the caller', 'if (payout != 0) _push(player, payout);', 'if (payout != 0) _push(msg.sender, payout);'],
];

const SRC = path.dirname(fileURLToPath(import.meta.url));
muter({
  SRC, nom: 'blockslotsrouter', source: 'src/BlockSlotsRouter.sol',
  sources: ['src/BlockSlotsRouter.sol', 'src/TblockPayRouter.sol'],
  tests: ['test/BlockSlotsRouter.t.sol', 'test/BlockSlotsRouter.real.t.sol', 'test/payrouter/Mocks.sol'],
  suites: 'BlockSlotsRouterTest|BlockSlotsRouterRealRouterTest', M,
});
