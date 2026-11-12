// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice the one call a listed game makes into TBlockLockRewards
interface IPlayRewards {
    function recordPlay(address player) external;
}

/// @title PlayRecorder - the game side of the TBlockLockRewards play gate (reference; TamArtV2 carries the same body inline).
/// @notice A game calls _recordPlay(payer) ONLY after the payment was pulled, in the same function, always for the address that paid.
///         REVIEW RULE for any listed game: no path that does not cost the player can reach _recordPlay, and its argument is never
///         chosen by the caller.
/// @dev - REWARDS is immutable and NOT code-checked: games deploy first, with the predicted address of the rewards contract, whose
///        constructor then checks game.REWARDS() == itself.
///      - the call is low level, its gas capped at PLAY_GAS and its outcome ignored: a broken or reverting rewards contract cannot
///        block the game.
///      - the gasleft() guard makes a transaction sent with too little gas revert as a whole (eth_estimateGas then searches above it)
///        instead of the record silently running out of gas while the paid play succeeds.
abstract contract PlayRecorder {
    address public immutable REWARDS;
    /// @dev measured worst case of recordPlay (cold, first player of an epoch, 6 checkpoints): 53,502 gas including the cold call
    ///      (test_gas_recordPlayWorstCase, forge, mock lock); 100k leaves a ~1.8x margin
    uint256 internal constant PLAY_GAS = 100_000;

    error PlayGasTooLow();

    constructor(address rewards) {
        REWARDS = rewards;
    }

    function _recordPlay(address p) internal {
        if (gasleft() < PLAY_GAS + PLAY_GAS / 63 + 5_000) revert PlayGasTooLow();
        address r = REWARDS;
        bytes memory cd = abi.encodeWithSelector(IPlayRewards.recordPlay.selector, p);
        assembly {
            pop(call(PLAY_GAS, r, 0, add(cd, 32), mload(cd), 0, 0))
        }
    }
}
