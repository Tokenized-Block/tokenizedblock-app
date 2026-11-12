// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TBlockLockRewards} from "../../src/TBlockLockRewards.sol";
import {PlayRecorder} from "../../src/PlayRecorder.sol";

/// a listed game for the tests: play() stands for a paid play (roll / spin / mint) and records msg.sender, the payer
contract MockGame is PlayRecorder {
    uint256 public plays;
    constructor(address rewards) PlayRecorder(rewards) {}
    function play() external {
        plays++; // the game's own effect, which must happen whatever the rewards contract does
        _recordPlay(msg.sender);
    }
}

/// deploys a listed game, then the rewards contract at the address the game was given (the production deploy order)
abstract contract PlayGateBase is Test {
    MockGame game;

    function _deployRewards(
        address tblock_,
        address wt_,
        address lock_,
        address pm_,
        address guardian_,
        uint256 t0,
        uint256 maxW,
        uint256 maxT
    ) internal returns (TBlockLockRewards r, MockGame g) {
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        g = new MockGame(predicted);
        address[] memory gs = new address[](1);
        gs[0] = address(g);
        r = new TBlockLockRewards(tblock_, wt_, lock_, pm_, guardian_, t0, maxW, maxT, gs);
        assertEq(address(r), predicted, "rewards deployed at the predicted address");
    }

    function _games(address g) internal pure returns (address[] memory gs) {
        gs = new address[](1);
        gs[0] = g;
    }

    function _playOn(MockGame g, address who) internal {
        vm.prank(who);
        g.play();
    }

    function _play(address who) internal {
        _playOn(game, who);
    }
}
