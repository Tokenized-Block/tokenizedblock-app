/* muter-blockskinsrouter.mjs — each guard of BlockSkinsRouter (src/BlockSkins1.sol, 1 USDC skins) is removed or falsified, one at a
 * time, in a COPY; BlockSkinsRouterTest + BlockSkinsRouterRealRouterTest must turn red. Never touches the repo.
 * Usage (from contracts/): node muter-blockskinsrouter.mjs      [FORGE=path/to/forge] [MUT_DIR=folder for the copies] */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { muter } from './muter-routeur-commun.mjs';

const M = [
  /* the mint payment (new) */
  ['price back to 10 USDC', 'uint256 public constant MINT_PRICE = 1_000_000;', 'uint256 public constant MINT_PRICE = 10_000_000;'],
  ['fee wallet share 9 %', 'uint16 public constant DEV_BPS = 1000;', 'uint16 public constant DEV_BPS = 900;'],
  ['onPaid from anyone', '        if (msg.sender != ROUTER) revert NotRouter();\n', ''],
  ['onPaid takes any amount', 'if (usdcIn != PRICE_USDC || tblockOut == 0) revert BadPayment();', 'if (tblockOut == 0) revert BadPayment();'],
  ['onPaid trusts a claimed output it does not hold', '        if (got < tblockOut) revert BadPayment();\n', ''],
  ['TBLOCK to the fee wallet instead of the vault', 'abi.encodeWithSelector(0xa9059cbb, DEST, got)', 'abi.encodeWithSelector(0xa9059cbb, FEE_WALLET, got)'],
  ['onPaid without the lock', '        nonReentrant\n        returns (uint256 tokenId)', '        returns (uint256 tokenId)'],
  ['mint to the router instead of the payer', '        _ownerOf[tokenId] = payer;\n        _balanceOf[payer] += 1;', '        _ownerOf[tokenId] = msg.sender;\n        _balanceOf[msg.sender] += 1;'],
  /* the constructor (new: DEST is an existing vault) */
  ['vault of another TBLOCK accepted', 'if (!okD || retD.length < 32 || abi.decode(retD, (address)) != tb) revert BadAddress();', 'if (!okD || retD.length < 32) revert BadAddress();'],
  ['vault without TBLOCK() accepted', 'if (!okD || retD.length < 32 || abi.decode(retD, (address)) != tb) revert BadAddress();', 'if (okD && retD.length >= 32 && abi.decode(retD, (address)) != tb) revert BadAddress();'],
  ['router USDC not checked', 'if (expectedTblock == address(0) || tb != expectedTblock || usdc != expectedUsdc) revert BadToken();', 'if (expectedTblock == address(0) || tb != expectedTblock) revert BadToken();'],
  /* the market (unchanged from the live contract) */
  ['resale fee 9 %', 'uint256 public constant SALE_FEE_BPS = 1000; // 10 %', 'uint256 public constant SALE_FEE_BPS = 900; // 10 %'],
  ['no 5 % raise', 'uint256 floor = l.bid == 0 ? l.price : l.bid + (l.bid * MIN_RAISE_BPS) / 10_000;', 'uint256 floor = l.bid == 0 ? l.price : l.bid + 1;'],
  ['late bid extends past 7 days', 'l.end = uint64(e > cap ? cap : e);', 'l.end = uint64(e);'],
  ['fee-on-transfer token accepted', '        if (_balance(token, address(this)) - before != amount) revert FeeOnTransfer();\n', ''],
  ['TBLOCK allowed as a market currency', '        if (currency == TBLOCK) revert NotAllowed();\n', ''],
  ['validation survives a new listing', '        if (v.listing != l.id) revert ListingChanged();\n', ''],
  ['outbid bidder not credited', '        if (l.bidder != address(0)) pending[currency][l.bidder] += l.bid;\n', ''],
  /* review 2026-11-12, the fixes: F1 (DEST is the holders vault), F2 (fee wallet never a token), S1 (no transfer to the market),
   * M1 (withdrawTo) */
  ['F1: DEST ROUTER() not read', '        (okD, retD) = dest.staticcall(abi.encodeWithSelector(ISkinsDestToken.ROUTER.selector));\n        if (!okD || retD.length < 32 || abi.decode(retD, (address)) != router) revert BadAddress();\n', ''],
  ['F1: DEST naming another router accepted', 'if (!okD || retD.length < 32 || abi.decode(retD, (address)) != router) revert BadAddress();', 'if (!okD || retD.length < 32) revert BadAddress();'],
  ['F1: DEST without free() accepted', '        if (!okD || retD.length < 32) revert BadAddress();\n        USDC = usdc;', '        USDC = usdc;'],
  ['F2: fee wallet may be a token', '        if (feeWallet == tb || feeWallet == usdc) revert BadAddress();\n', ''],
  ['F2: fee wallet may be TBLOCK', 'if (feeWallet == tb || feeWallet == usdc) revert BadAddress();', 'if (feeWallet == usdc) revert BadAddress();'],
  ['S1: transfer to the market accepted', 'if (o != from || to == address(0) || to == address(this)) revert BadAddress();', 'if (o != from || to == address(0)) revert BadAddress();'],
  ['M1: withdrawTo pays the caller', '        _withdraw(currency, to);\n    }\n\n    function _withdraw', '        _withdraw(currency, msg.sender);\n    }\n\n    function _withdraw'],
  ['M1: withdrawTo to address 0', 'if (to == address(0) || to == address(this)) revert BadAddress();', 'if (to == address(this)) revert BadAddress();'],
  ['M1: withdrawTo to the market itself', 'if (to == address(0) || to == address(this)) revert BadAddress();', 'if (to == address(0)) revert BadAddress();'],
  ['M1: token credit paid to the caller', '            _push(currency, to, amount);', '            _push(currency, msg.sender, amount);'],
  /* review 2026-11-12: the reviewer's extra mutants (muter-extra.mjs + muter-extra2.mjs). Two are left out, as the reviewer found
   * them not real gaps: "TBLOCK transfer result ignored" (the post-forward balance check catches the same failure) and "DEST without
   * code accepted" (a codeless DEST answers empty data, the next check reverts BadAddress anyway). */
  ['onPaid: post-forward balance check removed', '        if (_balance(TBLOCK, DEST) - destBefore < got || _balance(TBLOCK, address(this)) != 0) revert TransferFailed();\n', ''],
  ['onPaid: recipe not checked', '        _checkRecipe(recipe);\n', ''],
  ['onPaid: block 0 accepted', 'if (blockToken == address(0) || payer == address(0)) revert BadAddress();', 'if (payer == address(0)) revert BadAddress();'],
  ['ctor: fee wallet 0 accepted', 'if (feeWallet == address(0) || feeWallet == router', 'if (feeWallet == router'],
  ['ctor: USDC decimals not checked', 'if (!ok || ret.length < 32 || abi.decode(ret, (uint256)) != 6) revert BadToken();', 'if (!ok || ret.length < 32) revert BadToken();'],
  ['unlist by anyone', '        if (msg.sender != l.seller) revert NotAllowed();\n', ''],
  ['unlist with a bid', '        if (l.bidder != address(0)) revert HasBids();\n', ''],
  ['settle before the end', '        if (block.timestamp < l.end) revert NotEnded();\n', ''],
  ['bid after the end', '        if (block.timestamp >= l.end) revert Ended();\n', ''],
  ['list a skin you do not own', '        if (_ownerOf[tokenId] != msg.sender) revert NotAllowed();\n', ''],
  ['list in a currency not allowed', '        if (!currencyAllowed[currency]) revert NotAllowed();\n', ''],
  ['buy in ETH for any value', '            if (msg.value != l.price) revert WrongValue();\n        } else {\n            if (msg.value != 0) revert WrongValue();\n            _pullIn(l.currency, msg.sender, l.price);', '        } else {\n            if (msg.value != 0) revert WrongValue();\n            _pullIn(l.currency, msg.sender, l.price);'],
  ['withdraw not zeroed', '        pending[currency][msg.sender] = 0;\n', ''],
  ['transferFrom without approval', '        if (msg.sender != o && getApproved[tokenId] != msg.sender && !isApprovedForAll[o][msg.sender]) revert NotAllowed();\n', ''],
  ['revalidation drops the first ETH', '        if (old.ethHeld != 0) pending[address(0)][msg.sender] += old.ethHeld;\n', ''],
  ['revoke keeps the ETH', '        if (v.ethHeld != 0) pending[address(0)][msg.sender] += v.ethHeld;\n', ''],
  ['execute without a validation', '        Validation memory v = validated[tokenId][buyer];\n        if (v.listing == 0) revert NotValidated();\n', '        Validation memory v = validated[tokenId][buyer];\n'],
  ['approval kept across a move', '        delete getApproved[tokenId];\n', ''],
  ['buy an auction at its opening price', '        if (l.start != 0) revert IsAuction();\n        delete listingOf[tokenId];\n        if (l.currency == address(0)) {', '        delete listingOf[tokenId];\n        if (l.currency == address(0)) {'],
  ['bid under the opening price', 'if (amount < floor || amount <= l.bid) revert BidTooLow();', 'if (amount <= l.bid) revert BidTooLow();'],
  ['safeTransferFrom to a contract that refuses', '            if (!ok || ret.length < 32 || abi.decode(ret, (bytes4)) != bytes4(0x150b7a02)) revert UnsafeRecipient();\n', ''],
  ['seller ETH sent with all gas (no stipend)', 'ok := call(50000, to, amount, 0, 0, 0, 0)', 'ok := call(gas(), to, amount, 0, 0, 0, 0)'],
  ['validateBuy on an auction', '        if (l.start != 0) revert IsAuction();\n        Validation memory old', '        Validation memory old'],
  ['execute on an auction', '        if (l.start != 0) revert IsAuction();\n        Validation memory v = validated[tokenId][buyer];', '        Validation memory v = validated[tokenId][buyer];'],
  ['bid on a fixed listing', '        if (l.start == 0) revert NotAuction();\n        if (block.timestamp >= l.end) revert Ended();', '        if (block.timestamp >= l.end) revert Ended();'],
  ['settle a fixed listing', '        if (l.start == 0) revert NotAuction();\n        if (block.timestamp < l.end) revert NotEnded();', '        if (block.timestamp < l.end) revert NotEnded();'],
];

const SRC = path.dirname(fileURLToPath(import.meta.url));
muter({
  SRC, nom: 'blockskinsrouter', source: 'src/BlockSkins1.sol',
  sources: ['src/BlockSkins1.sol', 'src/TblockPayRouter.sol', 'src/TBlockLock.sol'],
  tests: ['test/BlockSkinsRouter.t.sol', 'test/BlockSkinsRouter.real.t.sol', 'test/payrouter/Mocks.sol'],
  suites: 'BlockSkinsRouterTest|BlockSkinsRouterRealRouterTest', M,
});
