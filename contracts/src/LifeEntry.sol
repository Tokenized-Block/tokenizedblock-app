// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LifeEntry - "+1 block": drop a block into the live Game of Life Block season for $2 of TBLOCK, paid to the holders' vault.
/// @notice Phil 2026-11-16: "la map est gratuite pour voir mais payante pour ajouter son block dessus", "les TBLOCK vont dans le vault
///         des holders", option "Life Entry d'abord, puis V3".
///   - enter(blockToken, maxTblock) pulls ENTRY_USD_E18 worth of TBLOCK from the caller straight to VAULT and emits Entered. That is all.
///   - THE PRICE is the one the hearts contract stores (LIKES.price(): USD per whole TBLOCK * 1e18, written by a bounded keeper, floor
///     and ceiling engraved there). No pool is read here: a pool read can be pushed for one block. `maxTblock` is the caller's own cap
///     (the page quotes, the wallet signs): if the stored price moved against the payer, the call reverts instead of taking more.
///   - A STALE PRICE IS REFUSED (review Grok lot 21, 2026-11-16, measured: the hearts' price was 100 h old, set 2026-11-12 09:31 UTC):
///     an entry reverts with StalePrice when LIKES.priceSetAt() is older than MAX_PRICE_AGE. Without it, a market that fell while the
///     keeper slept would let an entry pay much less than $2. No keeper running = no entry, never a cheap one.
///   - this contract HOLDS NOTHING and pays nobody: the TBLOCK goes from the payer to VAULT in one transferFrom, measured by VAULT's
///     balance before/after (a token that delivered less than asked would revert, not under-pay silently).
///   - no owner, no admin, no setter, no upgrade, no withdraw: there is nothing to steal and nothing anybody can change.
///   - NOT a play of the weekly vault: TBlockVaultV2 counts only the games listed at its deploy. The entry still feeds the vault's
///     balance (the holders' pot). Counting it as a weekly play is the V3 pack's job.
///   - the game server reads Entered logs ONLY from this contract's address, with the receipt's status: the block enters the season at
///     the chain block of the log. The contract cannot know the game's state; a block already in the season is the page's to refuse.
interface IERC20Min {
    function transferFrom(address from, address to, uint256 v) external returns (bool);
    function balanceOf(address a) external view returns (uint256);
}
interface IPriceSource { function price() external view returns (uint256); function priceSetAt() external view returns (uint256); }

contract LifeEntry {
    address public immutable TBLOCK;
    address public immutable VAULT;
    address public immutable LIKES;          // the price source (BlockLikesV2)
    uint256 public immutable ENTRY_USD_E18;  // $2 = 2e18
    uint256 public immutable MAX_PRICE_AGE;  // seconds: an older stored price refuses the entry

    event Entered(address indexed payer, address indexed blockToken, uint256 tblockPaid, uint256 priceUsdE18);

    error BadParams();
    error NoPrice();
    error AboveYourCap(uint256 due, uint256 cap);
    error NotDelivered(uint256 got, uint256 due);
    error StalePrice(uint256 age, uint256 maxAge);

    constructor(address tblock, address vault, address likes, uint256 entryUsdE18, uint256 maxPriceAge) {
        if (tblock == address(0) || vault == address(0) || likes == address(0) || entryUsdE18 == 0) revert BadParams();
        if (maxPriceAge == 0 || maxPriceAge > 2 days) revert BadParams();
        if (tblock.code.length == 0 || likes.code.length == 0) revert BadParams();
        TBLOCK = tblock; VAULT = vault; LIKES = likes; ENTRY_USD_E18 = entryUsdE18; MAX_PRICE_AGE = maxPriceAge;
    }

    /// @notice the TBLOCK an entry costs right now (rounded up), from the hearts' stored price; reverts if that price is too old
    function entryPrice() public view returns (uint256) {
        uint256 p = IPriceSource(LIKES).price();
        if (p == 0) revert NoPrice();
        uint256 at = IPriceSource(LIKES).priceSetAt();
        uint256 age = block.timestamp > at ? block.timestamp - at : 0;
        if (age > MAX_PRICE_AGE) revert StalePrice(age, MAX_PRICE_AGE);
        return (ENTRY_USD_E18 * 1e18 + p - 1) / p;
    }

    /// @notice pay one entry for `blockToken`, at most `maxTblock` TBLOCK; the caller must have approved this contract for that amount
    function enter(address blockToken, uint256 maxTblock) external returns (uint256 due) {
        if (blockToken == address(0)) revert BadParams();
        due = entryPrice();
        if (due > maxTblock) revert AboveYourCap(due, maxTblock);
        uint256 before = IERC20Min(TBLOCK).balanceOf(VAULT);
        if (!IERC20Min(TBLOCK).transferFrom(msg.sender, VAULT, due)) revert NotDelivered(0, due);
        uint256 got = IERC20Min(TBLOCK).balanceOf(VAULT) - before;
        if (got != due) revert NotDelivered(got, due);
        emit Entered(msg.sender, blockToken, due, IPriceSource(LIKES).price());
    }
}
