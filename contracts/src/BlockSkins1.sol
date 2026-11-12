// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice what the pay router answers (TblockPayRouter): the two tokens it was built with
interface ISkinsRouterTokens {
    function TBLOCK() external view returns (address);
    function USDC() external view returns (address);
}

/// @notice the reads this game makes of the holders vault (DEST), at construction only: the TBLOCK it holds, the router its games
///         name, and its free balance (review F1, 2026-11-12: these three together single out the holders vault TBlockVaultV2)
interface ISkinsDestToken {
    function TBLOCK() external view returns (address);
    function ROUTER() external view returns (address);
    function free() external view returns (uint256);
}

/// @title BlockSkinsRouter — a skin bound to one block (an ERC-721 token, so wallets list it); its market lives in the same contract.
/// @notice 1 USDC SKINS (Phil 2026-11-12). A copy of the live router game BlockSkins (0x1cf4…bde9, 10 USDC) with exactly three changes:
///   1. MINT_PRICE = PRICE_USDC = 1 USDC (1_000_000). Paid through the same immutable ROUTER the same way: 10 % (0.10 USDC) to
///      FEE_WALLET in USDC, the other 0.90 USDC bought as TBLOCK and forwarded to DEST (the holders vault).
///   2. NO PLAY RECORD. The holders vault and the lock rewards list their games at their own deploy, for ever (vault [TAM art,
///      Skins], rewards [Hearts, TAM art, Skins]); this contract is in neither list, so a mint here is NOT a play for either
///      (accepted by Phil). There is no REWARDS address, no wired() gate, no recordPlay call, no PLAY_GAS guard: onPaid makes no
///      call into the vault other than the TBLOCK transfer to it, and none into the lock rewards.
///   3. the wired() gate was the only thing that stopped a mispredicted DEST from receiving TBLOCK. DEST is an EXISTING contract now,
///      so the constructor checks it instead: DEST must have code, DEST.TBLOCK() must be the router's TBLOCK, DEST.ROUTER() must be
///      this ROUTER and DEST.free() must answer. Review F1 (2026-11-12): code + TBLOCK() alone also passed the lock, Hearts, TAM art,
///      the old Skins and the lock rewards (TBLOCK stuck in the lock and in Hearts for good, counted for lockers in the rewards);
///      measured on Base by eth_call, of L, P, T, S, V, R and the lock, only the holders vault V answers both ROUTER() == P and free().
///      A plain transfer to the vault counts in its free balance (balance - reserved). At an epoch close the vault reserves for players
///      only min(free * REWARD_BPS / BPS, MAX_EPOCH_BUDGET, the week's play total * REBATE_BPS / BPS * 2); the rest stays free (for the
///      contest feed, or the dev rescue). A mint here adds no play, so it raises a week's player budget only up to that play bound.
///   4. review 2026-11-12, also new: the fee wallet is never one of the two tokens (F2); a skin can never be sent to this contract
///      by a plain transfer, where it was stuck for good (S1); withdrawTo lets an account that cannot receive ETH (a fee wallet or a
///      seller contract) take its OWN credit to another address (M1).
///   The recipe, the block binding, the market, the auction, the 10 % resale fee, the owner powers and every other guard are the
///   live contract's, unchanged in their logic. The notes below are the live contract's, kept for the history of each rule.
/// @notice (live contract) v3 ROUTER GAME (Phil 2026-11-11, economy v2 pack: "skins count as play"). The ONLY change from the v3 record of 2026-10-18 is
///         the MINT PAYMENT (and what it reports); the recipe, the block binding, the market, the auction and the 10 % resale fee are
///         unchanged, byte for byte in their logic:
///   - there is no direct mint() any more. A skin is minted ONLY through the immutable ROUTER (TblockPayRouter): the payer calls
///     ROUTER.pay(this, 10 USDC, minTblockOut, deadline, abi.encode(blockToken, recipe)). The router pulls EXACTLY PRICE_USDC
///     (= MINT_PRICE, 10 USDC) from the payer, sends 10 % (USDC_SPLIT: FEE_WALLET, 1,000 bps) in USDC to FEE_WALLET, buys TBLOCK with
///     the other 90 %, sends that TBLOCK here, then calls onPaid LAST.
///   - onPaid (ROUTER only) mints the skin to the PAYER (the address the router pulled the USDC from: the router passes its own
///     msg.sender), forwards EVERY TBLOCK this contract holds to the immutable DEST (the holders vault TBlockVaultV2, the same DEST
///     TamArtV2 uses) and checks DEST's balance rose by that much. This contract keeps no TBLOCK. TBLOCK can never be a market
///     currency (setCurrency refuses it), so no escrow of TBLOCK can ever sit here to be swept by a mint.
///   - PLAY: the paid mint is ONE play, recorded in BOTH contracts that pay players: DEST.recordPlay(payer, tblockOut) (tblockOut =
///     the router's measured swap output, never this contract's balance, which a donation could inflate) and REWARDS.recordPlay(payer)
///     (TBlockLockRewards). Each call is low level, capped at PLAY_GAS, its outcome ignored: a broken vault or rewards record cannot
///     block a mint. A gasleft() guard before EACH call makes a mint sent with too little gas revert whole (PlayGasTooLow) instead of
///     silently losing a record. Same body as TamArtV2.
///   - WIRING (one wallet deploys the pack in sequence): this game deploys BEFORE the vault and the rewards contract, with their
///     PREDICTED CREATE addresses; neither is code-checked here. Each of them requires VAULT() / REWARDS() == itself in its own
///     constructor (the vault also requires TBLOCK() == its TBLOCK). onPaid refuses (NotWired) unless BOTH DEST and REWARDS list this
///     game: a mispredicted address can only make a later deploy revert and leave this game unable to take a payment -- it can
///     never send TBLOCK, or a play, to a wrong address.
///   - the BlockSkinsVoucher contract (skins bought on Shopify, claimed with a voucher) is separate and unchanged: a voucher claim
///     pays nothing on chain, so it records no play.
/// @notice v2, 2026-10-11: the same rules as v1 (0xea6c…e77d, deployed 2026-10-04, never minted); only tokenURI changed — it now
///         carries the skin's image, painted here from its recipe, so a wallet can show the skin (Phil: "visible in the wallet").
/// @notice Phil, 2026-10-04: "when the user pays 1 USDC he receives the NFT of the skin he chose"; "he can resell it on a market
///         made only of block skins"; "auctions with a set duration, one week at most"; "sale and auction in ETH, USDC or a
///         tokenized stock with a deep pool"; "if both tick 'valid' the transaction is automatic, agents make the exchange";
///         "fees: 1 USDC on creation, 10 % on each sale".
///
/// WHAT IT IS
///   - mint(): pulls exactly 1 USDC from the caller to the fee wallet and mints one token. The token stores WHICH block it dresses
///     and its recipe — seven hues from 0 to 359 (ring turn, three ring hues, edges, core, background), the same recipe the app
///     paints. The skin is a look: it gives no right over the block.
///   - a fixed-price listing and an auction. The NFT is held by this contract while listed. A sale pays 10 % to the fee wallet and
///     the rest to the seller, in the listing's currency: ETH (address(0)), USDC, or a token the owner has allowed.
///   - an auction lasts at most 7 days from its start. A bid in the last 5 minutes extends it by 5 minutes, never past the 7 days.
///     An outbid bidder is credited and WITHDRAWS (pull): a bidder that cannot receive can never block the auction.
///     A new bid must raise the highest one by at least 5 %.
///   - "both ticked": the seller's listing is one validation; a buyer's validateBuy() is the other (it is bound to THAT listing
///     — its price and currency never change — and for ETH it holds his payment). Then ANYONE — an agent — may call
///     executeValidated(): the trade happens between the two of them. The agent never holds the funds nor the NFT. A listing
///     that is withdrawn and opened again is a NEW listing: an old validation never applies to it.
///
/// WHAT IT IS NOT, said plainly
///   - not upgradeable, no pause, no way for anyone to move a user's NFT or funds outside the rules above;
///   - the owner can ONLY allow or disallow a payment currency for NEW listings ("deep pool" is judged off chain) and hand
///     over ownership. Disallowing a currency never blocks an existing listing, bid, settlement or withdrawal;
///   - a token that takes a fee on transfer is refused wherever this contract receives it (the amount received must equal the
///     amount asked), otherwise a sale would be paid out of other users' escrow;
///   - a seller or fee wallet that cannot RECEIVE (ETH refused, token transfer reverting — a blacklist) is credited and
///     withdraws later: it can never block a sale or a settlement.
/// @dev No external library: a minimal ERC-721 is written here so the whole behaviour is in one file to read.
contract BlockSkinsRouter {
    // ───────────────────────────── constants
    uint256 public constant MINT_PRICE = 1_000_000; // 1 USDC (6 decimals) — Phil 2026-11-12: a new Skins contract at 1 USDC per mint
    uint256 public constant PRICE_USDC = MINT_PRICE; // read by the router: a mint is paid exactly this
    uint16 public constant DEV_BPS = 1000; // 10 % of the mint price stays USDC, to FEE_WALLET (Phil 2026-11-11)
    uint256 public constant SALE_FEE_BPS = 1000; // 10 %
    uint256 public constant MAX_AUCTION = 7 days;
    uint256 public constant EXTENSION = 5 minutes;
    uint256 public constant MIN_RAISE_BPS = 500; // a bid must raise the highest one by 5 %
    uint256 private constant MAX_HUE = 359;

    address public immutable USDC;
    address public immutable FEE_WALLET;
    address public immutable ROUTER; // TblockPayRouter: the only way to mint
    address public immutable TBLOCK; // the canonical TBLOCK the router buys (two tokens are named TBLOCK)
    address public immutable DEST; // the holders vault (TBlockVaultV2): every TBLOCK paid for a mint ends there (no play is recorded)

    // ───────────────────────────── ERC-721 state
    string public constant name = "TokenizedBlock Skins";
    string public constant symbol = "TBSKIN";
    uint256 public totalSupply;
    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    // ───────────────────────────── skins
    struct Skin {
        address blockToken; // the block this skin dresses
        uint64 recipe; // seven 9-bit hues: turn | h1 | h2 | h3 | edges | core | background
        address minter;
    }

    mapping(uint256 => Skin) public skinOf;

    // ───────────────────────────── market
    address public owner;
    mapping(address => bool) public currencyAllowed; // address(0) = ETH

    struct Listing {
        address seller;
        address currency;
        uint256 price; // fixed price, or the minimum bid of an auction
        uint64 start; // 0 = fixed price ; otherwise the auction's start
        uint64 end;
        uint64 id; // a new number at every listing: a buyer's validation is for ONE listing, never a later one
        address bidder; // highest bidder (auction)
        uint256 bid; // highest bid, held by this contract
    }

    mapping(uint256 => Listing) public listingOf;
    uint64 private _listingSeq;
    /// @notice credits to withdraw: pending[currency][account]
    mapping(address => mapping(address => uint256)) public pending;

    struct Validation {
        uint64 listing; // the listing he agreed to (0 = none)
        uint256 ethHeld;
    }

    /// @notice a buyer's "valid" tick on a fixed-price listing: validated[tokenId][buyer]
    mapping(uint256 => mapping(address => Validation)) public validated;

    uint256 private _lock = 1;

    // ───────────────────────────── events
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event SkinMinted(uint256 indexed tokenId, address indexed minter, address indexed blockToken, uint64 recipe);
    event PaidTblock(uint256 indexed tokenId, address indexed payer, uint256 usdcIn, uint256 tblockToDest);
    event Listed(uint256 indexed tokenId, address indexed seller, address currency, uint256 price, uint64 end);
    event Unlisted(uint256 indexed tokenId);
    event Bid(uint256 indexed tokenId, address indexed bidder, uint256 amount, uint64 end);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, address currency, uint256 price, uint256 fee);
    event BuyValidated(uint256 indexed tokenId, address indexed buyer, address currency, uint256 price);
    event BuyRevoked(uint256 indexed tokenId, address indexed buyer);
    event CurrencySet(address indexed currency, bool allowed);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ───────────────────────────── errors
    error NotOwner();
    error NotAllowed();
    error BadRecipe();
    error BadAddress();
    error BadPrice();
    error BadDuration();
    error NotListed();
    error NotAuction();
    error IsAuction();
    error Ended();
    error NotEnded();
    error BidTooLow();
    error WrongValue();
    error NothingToWithdraw();
    error NotValidated();
    error ListingChanged();
    error TransferFailed();
    error Reentrancy();
    error UnsafeRecipient();
    error FeeOnTransfer();
    error HasBids();
    error NotRouter();
    error BadToken();
    error BadPayment();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    /// @param router the live TblockPayRouter
    /// @param feeWallet receives the 10 % USDC of each mint (via the router) and the 10 % fee of each resale
    /// @param dest the live holders vault (TBlockVaultV2): must have code and hold the router's TBLOCK
    /// @param expectedTblock / expectedUsdc the canonical tokens, written by the deployer: the router must answer exactly these
    constructor(address router, address feeWallet, address dest, address expectedTblock, address expectedUsdc) {
        if (router.code.length == 0 || dest == address(0)) revert BadAddress();
        if (feeWallet == address(0) || feeWallet == router || feeWallet == dest || feeWallet == address(this)) revert BadAddress();
        address tb = ISkinsRouterTokens(router).TBLOCK();
        address usdc = ISkinsRouterTokens(router).USDC();
        if (expectedTblock == address(0) || tb != expectedTblock || usdc != expectedUsdc) revert BadToken();
        if (tb.code.length == 0 || usdc.code.length == 0) revert BadToken();
        (bool ok, bytes memory ret) = usdc.staticcall(abi.encodeWithSelector(0x313ce567)); // decimals()
        if (!ok || ret.length < 32 || abi.decode(ret, (uint256)) != 6) revert BadToken();
        // review F2: the fee wallet is never one of the two tokens (a deploy typo would send every 0.10 USDC to a token contract)
        if (feeWallet == tb || feeWallet == usdc) revert BadAddress();
        // DEST is not this, the router, a token, or the fee wallet
        if (dest == router || dest == tb || dest == usdc || dest == address(this)) revert BadAddress();
        // DEST exists and holds THIS TBLOCK (replaces the live wired() gate: nothing else stops TBLOCK going to a wrong address)
        if (dest.code.length == 0) revert BadAddress();
        (bool okD, bytes memory retD) = dest.staticcall(abi.encodeWithSelector(ISkinsDestToken.TBLOCK.selector));
        if (!okD || retD.length < 32 || abi.decode(retD, (address)) != tb) revert BadAddress();
        // review F1: ... and is the holders vault: it names THIS router and answers free() (only V does, of the live contracts)
        (okD, retD) = dest.staticcall(abi.encodeWithSelector(ISkinsDestToken.ROUTER.selector));
        if (!okD || retD.length < 32 || abi.decode(retD, (address)) != router) revert BadAddress();
        (okD, retD) = dest.staticcall(abi.encodeWithSelector(ISkinsDestToken.free.selector));
        if (!okD || retD.length < 32) revert BadAddress();
        USDC = usdc;
        FEE_WALLET = feeWallet;
        ROUTER = router;
        TBLOCK = tb;
        DEST = dest;
        owner = msg.sender;
        currencyAllowed[address(0)] = true;
        currencyAllowed[usdc] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit CurrencySet(address(0), true);
        emit CurrencySet(usdc, true);
    }

    // ───────────────────────────── owner (currencies only)
    function setCurrency(address currency, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        // v3 router game: TBLOCK is never escrowed here, so onPaid can forward every TBLOCK it holds to DEST
        if (currency == TBLOCK) revert NotAllowed();
        currencyAllowed[currency] = allowed;
        emit CurrencySet(currency, allowed);
    }

    function transferOwnership(address to) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0)) revert BadAddress();
        emit OwnershipTransferred(owner, to);
        owner = to;
    }

    // ───────────────────────────── recipe
    /// @notice packs seven hues (each 0..359) into a recipe. Reverts on a hue above 359.
    function packRecipe(uint16[7] calldata hues) public pure returns (uint64 recipe) {
        for (uint256 i = 0; i < 7; i++) {
            if (hues[i] > MAX_HUE) revert BadRecipe();
            recipe |= uint64(hues[i]) << uint64(9 * i);
        }
    }

    /// @notice the seven hues of a recipe: ring turn, ring 1, ring 2, ring 3, edges, core, background.
    function unpackRecipe(uint64 recipe) public pure returns (uint16[7] memory hues) {
        for (uint256 i = 0; i < 7; i++) hues[i] = uint16((recipe >> uint64(9 * i)) & 0x1FF);
    }

    function _checkRecipe(uint64 recipe) private pure {
        if (recipe >> 63 != 0) revert BadRecipe();
        for (uint256 i = 0; i < 7; i++) if (((recipe >> uint64(9 * i)) & 0x1FF) > MAX_HUE) revert BadRecipe();
    }

    // ───────────────────────────── router game: views
    /// @notice the holders vault every mint's TBLOCK goes to (= DEST). No play is reported to it.
    function VAULT() external view returns (address) {
        return DEST;
    }

    /// @notice read by the router: 10 % of PRICE_USDC to FEE_WALLET in USDC, the rest bought as TBLOCK
    function USDC_SPLIT() external view returns (address devWallet, uint16 devBps) {
        return (FEE_WALLET, DEV_BPS);
    }

    // ───────────────────────────── mint: through the router only (1 USDC: 0.10 to FEE_WALLET, 0.90 bought as TBLOCK for DEST)
    /// @notice called by ROUTER, LAST, after it sent `tblockOut` TBLOCK here. data = abi.encode(address blockToken, uint64 recipe).
    ///         Mints the skin to `payer` and forwards every TBLOCK held here to DEST. No play is recorded anywhere.
    function onPaid(address payer, uint256 usdcIn, uint256 tblockOut, bytes calldata data)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        if (msg.sender != ROUTER) revert NotRouter();
        if (usdcIn != PRICE_USDC || tblockOut == 0) revert BadPayment();
        // this contract holds no TBLOCK at rest (never a market currency): what it holds now is what reached it
        uint256 got = _balance(TBLOCK, address(this));
        if (got < tblockOut) revert BadPayment();
        (address blockToken, uint64 recipe) = abi.decode(data, (address, uint64));
        if (blockToken == address(0) || payer == address(0)) revert BadAddress();
        _checkRecipe(recipe);
        tokenId = ++totalSupply;
        skinOf[tokenId] = Skin({blockToken: blockToken, recipe: recipe, minter: payer});
        _ownerOf[tokenId] = payer;
        _balanceOf[payer] += 1;
        emit Transfer(address(0), payer, tokenId);
        emit SkinMinted(tokenId, payer, blockToken, recipe);

        uint256 destBefore = _balance(TBLOCK, DEST);
        (bool ok, bytes memory ret) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, DEST, got));
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) revert TransferFailed();
        if (_balance(TBLOCK, DEST) - destBefore < got || _balance(TBLOCK, address(this)) != 0) revert TransferFailed();
        emit PaidTblock(tokenId, payer, usdcIn, got);
    }

    // ───────────────────────────── fixed price
    function list(uint256 tokenId, address currency, uint256 price) external nonReentrant {
        _open(tokenId, currency, price, 0);
    }

    /// @notice the seller takes his NFT back. An auction with a bid cannot be cancelled.
    function unlist(uint256 tokenId) external nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (msg.sender != l.seller) revert NotAllowed();
        if (l.bidder != address(0)) revert HasBids();
        delete listingOf[tokenId];
        _move(address(this), l.seller, tokenId);
        emit Unlisted(tokenId);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start != 0) revert IsAuction();
        delete listingOf[tokenId];
        if (l.currency == address(0)) {
            if (msg.value != l.price) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            _pullIn(l.currency, msg.sender, l.price);
        }
        _payOut(tokenId, l.seller, msg.sender, l.currency, l.price);
    }

    // ───────────────────────────── "both ticked": validated buy, executed by anyone
    /// @notice the buyer agrees to THIS listing (its price and currency). For ETH his payment is held here; for a token he must
    ///         also have approved this contract. Anyone may then call executeValidated.
    function validateBuy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start != 0) revert IsAuction();
        Validation memory old = validated[tokenId][msg.sender];
        if (old.ethHeld != 0) pending[address(0)][msg.sender] += old.ethHeld;
        if (l.currency == address(0)) {
            if (msg.value != l.price) revert WrongValue();
        } else if (msg.value != 0) {
            revert WrongValue();
        }
        validated[tokenId][msg.sender] = Validation({listing: l.id, ethHeld: msg.value});
        emit BuyValidated(tokenId, msg.sender, l.currency, l.price);
    }

    function revokeBuy(uint256 tokenId) external nonReentrant {
        Validation memory v = validated[tokenId][msg.sender];
        if (v.listing == 0) revert NotValidated();
        delete validated[tokenId][msg.sender];
        if (v.ethHeld != 0) pending[address(0)][msg.sender] += v.ethHeld;
        emit BuyRevoked(tokenId, msg.sender);
    }

    /// @notice anyone (an agent) executes a trade both sides have validated. It moves funds only between the two of them and
    ///         the fee wallet.
    function executeValidated(uint256 tokenId, address buyer) external nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start != 0) revert IsAuction();
        Validation memory v = validated[tokenId][buyer];
        if (v.listing == 0) revert NotValidated();
        if (v.listing != l.id) revert ListingChanged();
        delete validated[tokenId][buyer];
        delete listingOf[tokenId];
        if (l.currency != address(0)) _pullIn(l.currency, buyer, l.price);
        _payOut(tokenId, l.seller, buyer, l.currency, l.price);
    }

    // ───────────────────────────── auction
    function startAuction(uint256 tokenId, address currency, uint256 minBid, uint256 duration) external nonReentrant {
        if (duration == 0 || duration > MAX_AUCTION) revert BadDuration();
        _open(tokenId, currency, minBid, duration);
    }

    function bid(uint256 tokenId, uint256 amount) external payable nonReentrant {
        Listing storage l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start == 0) revert NotAuction();
        if (block.timestamp >= l.end) revert Ended();
        uint256 floor = l.bid == 0 ? l.price : l.bid + (l.bid * MIN_RAISE_BPS) / 10_000;
        if (amount < floor || amount <= l.bid) revert BidTooLow();
        address currency = l.currency;
        if (currency == address(0)) {
            if (msg.value != amount) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            _pullIn(currency, msg.sender, amount);
        }
        if (l.bidder != address(0)) pending[currency][l.bidder] += l.bid;
        l.bidder = msg.sender;
        l.bid = amount;
        // a late bid extends the auction, never past 7 days from its start
        uint256 cap = uint256(l.start) + MAX_AUCTION;
        if (uint256(l.end) - block.timestamp < EXTENSION) {
            uint256 e = block.timestamp + EXTENSION;
            l.end = uint64(e > cap ? cap : e);
        }
        emit Bid(tokenId, msg.sender, amount, l.end);
    }

    /// @notice after the end, anyone settles: the winner gets the NFT, the seller 90 %, the fee wallet 10 %. No bid = the NFT
    ///         goes back to the seller.
    function settle(uint256 tokenId) external nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start == 0) revert NotAuction();
        if (block.timestamp < l.end) revert NotEnded();
        delete listingOf[tokenId];
        if (l.bidder == address(0)) {
            _move(address(this), l.seller, tokenId);
            emit Unlisted(tokenId);
        } else {
            _payOut(tokenId, l.seller, l.bidder, l.currency, l.bid);
        }
    }

    function withdraw(address currency) external nonReentrant {
        _withdraw(currency, msg.sender);
    }

    /// @notice review M1 (2026-11-12): the caller's OWN credit, paid to `to`. An account that cannot receive ETH (a fee wallet or a
    ///         seller contract without receive()) could otherwise never take its ETH credit. Never to 0 or to this contract.
    function withdrawTo(address currency, address to) external nonReentrant {
        if (to == address(0) || to == address(this)) revert BadAddress();
        _withdraw(currency, to);
    }

    function _withdraw(address currency, address to) private {
        uint256 amount = pending[currency][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pending[currency][msg.sender] = 0;
        if (currency == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            _push(currency, to, amount);
        }
    }

    // ───────────────────────────── internals
    function _open(uint256 tokenId, address currency, uint256 price, uint256 duration) private {
        if (_ownerOf[tokenId] != msg.sender) revert NotAllowed();
        if (!currencyAllowed[currency]) revert NotAllowed();
        if (price == 0) revert BadPrice();
        _move(msg.sender, address(this), tokenId);
        uint64 start = duration == 0 ? 0 : uint64(block.timestamp);
        uint64 end = duration == 0 ? 0 : uint64(block.timestamp + duration);
        uint64 id = ++_listingSeq;
        listingOf[tokenId] = Listing({
            seller: msg.sender,
            currency: currency,
            price: price,
            start: start,
            end: end,
            id: id,
            bidder: address(0),
            bid: 0
        });
        emit Listed(tokenId, msg.sender, currency, price, end);
    }

    /// @dev the contract holds `price` of `currency`; pays 10 % to the fee wallet, the rest to the seller, the NFT to the buyer.
    ///      A payment the receiver cannot take (ETH refused, token transfer reverting) is CREDITED instead of reverting:
    ///      nobody can block a sale or a settlement by being unable to receive.
    function _payOut(uint256 tokenId, address seller, address buyer, address currency, uint256 price) private {
        uint256 fee = (price * SALE_FEE_BPS) / 10_000;
        uint256 rest = price - fee;
        _move(address(this), buyer, tokenId);
        if (currency == address(0)) {
            _sendEthOrCredit(FEE_WALLET, fee);
            _sendEthOrCredit(seller, rest);
        } else {
            _pushOrCredit(currency, FEE_WALLET, fee);
            _pushOrCredit(currency, seller, rest);
        }
        emit Sold(tokenId, seller, buyer, currency, price, fee);
    }

    /// @dev no return data is copied: a receiver cannot make the payer burn gas on a huge answer.
    function _sendEthOrCredit(address to, uint256 amount) private {
        if (amount == 0) return;
        bool ok;
        assembly ("memory-safe") {
            ok := call(50000, to, amount, 0, 0, 0, 0)
        }
        if (!ok) pending[address(0)][to] += amount;
    }

    function _pull(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || token.code.length == 0) revert TransferFailed();
    }

    /// @dev pulls `amount` INTO this contract and proves it arrived in full: a token that takes a fee on transfer would
    ///      otherwise be paid out of other users' escrow.
    function _pullIn(address token, address from, uint256 amount) private {
        uint256 before = _balance(token, address(this));
        _pull(token, from, address(this), amount);
        if (_balance(token, address(this)) - before != amount) revert FeeOnTransfer();
    }

    function _push(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _pushOrCredit(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) pending[token][to] += amount;
    }

    function _balance(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    function _move(address from, address to, uint256 tokenId) private {
        delete getApproved[tokenId];
        _balanceOf[from] -= 1;
        _balanceOf[to] += 1;
        _ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    // ───────────────────────────── ERC-721 (minimal)
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _ownerOf[tokenId];
        if (o == address(0)) revert BadAddress();
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert BadAddress();
        return _balanceOf[account];
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !isApprovedForAll[o][msg.sender]) revert NotAllowed();
        getApproved[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address o = ownerOf(tokenId);
        // review S1: never to this contract by a transfer (only a listing escrows a skin here; a sent one would be stuck for good)
        if (o != from || to == address(0) || to == address(this)) revert BadAddress();
        if (msg.sender != o && getApproved[tokenId] != msg.sender && !isApprovedForAll[o][msg.sender]) revert NotAllowed();
        _move(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length != 0) {
            (bool ok, bytes memory ret) =
                to.call(abi.encodeWithSelector(0x150b7a02, msg.sender, from, tokenId, data));
            if (!ok || ret.length < 32 || abi.decode(ret, (bytes4)) != bytes4(0x150b7a02)) revert UnsafeRecipient();
        }
    }

    // ───────────────────────────── one read for the app
    struct SkinView {
        uint256 tokenId;
        address holder; // the owner, or the SELLER while the skin is listed (the contract holds it then)
        address blockToken;
        uint64 recipe;
        bool listed;
        bool auction;
        address currency;
        uint256 price;
        uint64 end;
        address bidder;
        uint256 bid;
    }

    /// @notice `count` skins starting at token `from` (the first token is 1). Reads nothing outside this contract.
    function skinsPage(uint256 from, uint256 count) external view returns (SkinView[] memory page) {
        if (from == 0) from = 1;
        uint256 last = totalSupply;
        if (from > last) return new SkinView[](0);
        if (count > last - from + 1) count = last - from + 1;
        page = new SkinView[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = from + i;
            Listing storage l = listingOf[id];
            SkinView memory v = page[i];
            v.tokenId = id;
            v.blockToken = skinOf[id].blockToken;
            v.recipe = skinOf[id].recipe;
            v.listed = l.seller != address(0);
            v.holder = v.listed ? l.seller : _ownerOf[id];
            v.auction = l.start != 0;
            v.currency = l.currency;
            v.price = l.price;
            v.end = l.end;
            v.bidder = l.bidder;
            v.bid = l.bid;
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; // ERC-165, ERC-721, ERC-721 metadata
    }

    /// @notice on-chain metadata a wallet can show: the name, the block it dresses, its seven hues and its IMAGE — the skin painted
    ///         from its recipe by this contract (nothing hosted anywhere, no server, no IPFS).
    /// @dev v2 (2026-10-11). v1's tokenURI had no image (a wallet could show a name at best) and its raw JSON carried "#", which a
    ///      standards-conforming reader (fetch) takes as a URL fragment: measured on a fork, 29 characters returned out of 219, invalid
    ///      JSON. Here the JSON and the image are both base64: no character of either data URI can be read as a fragment or delimiter.
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        Skin memory s = skinOf[tokenId];
        uint16[7] memory h = unpackRecipe(s.recipe);
        string memory b = _hex(s.blockToken);
        string memory head = string.concat(
            '{"name":"TokenizedBlock skin #',
            _u(tokenId),
            '","description":"A skin for one block: a look, not a right over the block.","image":"data:image/svg+xml;base64,',
            _b64(bytes(_svg(h))),
            '","block":"',
            b
        );
        string memory hues = string.concat(_u(h[0]), ",", _u(h[1]), ",", _u(h[2]), ",", _u(h[3]));
        hues = string.concat(hues, ",", _u(h[4]), ",", _u(h[5]), ",", _u(h[6]));
        string memory json = string.concat(head, '","hues":[', hues, '],"attributes":[{"trait_type":"Block","value":"', b, '"}]}');
        return string.concat("data:application/json;base64,", _b64(bytes(json)));
    }

    /// @dev the skin as the app paints it, as a still image: a dark background (hue 6), the ring's three hues turned by hue 0 (the
    ///      app's conic ring, drawn as a rotated gradient), and the block's cube (edges: hue 4) around its glowing core (hue 5).
    function _svg(uint16[7] memory h) private pure returns (string memory) {
        string memory defs = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><defs>',
            '<linearGradient id="a" gradientTransform="rotate(',
            _u(h[0]),
            ' .5 .5)"><stop offset="0" stop-color="',
            _hsl(h[1], 62),
            '"/><stop offset=".33" stop-color="',
            _hsl(h[2], 38),
            '"/><stop offset=".66" stop-color="',
            _hsl(h[3], 70)
        );
        defs = string.concat(
            defs,
            '"/><stop offset="1" stop-color="',
            _hsl(h[2], 30),
            '"/></linearGradient><radialGradient id="c"><stop offset="0" stop-color="',
            _hsl(h[5], 70),
            '"/><stop offset="1" stop-color="',
            _hsl(h[5], 25),
            '"/></radialGradient></defs>'
        );
        return string.concat(
            defs,
            '<rect width="400" height="400" fill="hsl(',
            _u(h[6]),
            ',45%,9%)"/><circle cx="200" cy="200" r="182" fill="none" stroke="url(#a)" stroke-width="14"/>',
            '<circle cx="200" cy="200" r="58" fill="url(#c)"/><g fill="none" stroke="',
            _hsl(h[4], 60),
            '" stroke-width="5" stroke-linejoin="round"><path d="M200 90 295 145 295 255 200 310 105 255 105 145Z"/>',
            '<path d="M105 145 200 200 295 145M200 200V310"/></g></svg>'
        );
    }

    function _hsl(uint256 hue, uint256 light) private pure returns (string memory) {
        return string.concat("hsl(", _u(hue), ",90%,", _u(light), "%)");
    }

    /// @dev standard base64 (RFC 4648, "=" padding), written here like the rest: the whole behaviour is in this one file.
    function _b64(bytes memory data) private pure returns (string memory) {
        uint256 n = data.length;
        if (n == 0) return "";
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory out = new bytes(4 * ((n + 2) / 3));
        uint256 j;
        for (uint256 i = 0; i < n; i += 3) {
            uint256 t = uint256(uint8(data[i])) << 16;
            if (i + 1 < n) t |= uint256(uint8(data[i + 1])) << 8;
            if (i + 2 < n) t |= uint256(uint8(data[i + 2]));
            out[j++] = table[(t >> 18) & 63];
            out[j++] = table[(t >> 12) & 63];
            out[j++] = i + 1 < n ? table[(t >> 6) & 63] : bytes1("=");
            out[j++] = i + 2 < n ? table[t & 63] : bytes1("=");
        }
        return string(out);
    }

    function _u(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 len;
        while (n != 0) {
            len++;
            n /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }

    function _hex(address a) private pure returns (string memory) {
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        bytes16 digits = "0123456789abcdef";
        uint160 v = uint160(a);
        for (uint256 i = 0; i < 40; i++) {
            out[41 - i] = digits[v & 0xf];
            v >>= 4;
        }
        return string(out);
    }
}
