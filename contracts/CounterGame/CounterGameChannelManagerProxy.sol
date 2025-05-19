// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@peer3/state-channels-plus/contracts/V1/StateChannelDiamondProxy/AStateChannelManagerProxy.sol";
import "./CounterGameStateMachine.sol";

contract CounterGameChannelManagerProxy is AStateChannelManagerProxy {
    uint256 public totalChannelsOpened;

    constructor(
        address aStateMachineAddress,
        address disputeManagerFacet
    ) AStateChannelManagerProxy(aStateMachineAddress, disputeManagerFacet) {
        // Set timeouts for the state channel
        p2pTime = 5;            // 5 seconds for P2P communication
        agreementTime = 5;      // 5 seconds for agreement
        chainFallbackTime = 5;  // 5 seconds for chain fallback
        challengeTime = 5;      // 5 seconds for challenge
    }

    function openChannel(
        bytes32 channelId,
        bytes[] calldata openChannelData,
        bytes[] calldata signatures
    ) public virtual override {
        require(
            openChannelData.length > 0 &&
                openChannelData.length == signatures.length,
            "CounterGameChannelManagerProxy: openChannel incorrect length"
        );

        JoinChannel[] memory joinChannels = new JoinChannel[](
            openChannelData.length
        );
        for (uint i = 0; i < openChannelData.length; i++) {
            joinChannels[i] = abi.decode(openChannelData[i], (JoinChannel));
        }

        bool isValid = true;
        for (uint i = 0; i < openChannelData.length; i++) {
            address[] memory addressesInThreshold = new address[](1);
            addressesInThreshold[0] = joinChannels[i].participant;
            bytes[] memory signature = new bytes[](1);
            signature[0] = signatures[i];
            (bool succeeds, ) = StateChannelUtilLibrary.verifyThresholdSigned(
                addressesInThreshold,
                openChannelData[i],
                signatures
            );
            if (!succeeds) {
                isValid = false;
                break;
            }
        }

        require(
            isValid,
            "CounterGameChannelManagerProxy: openChannel signatures don't match"
        );

        require(
            channelId != bytes32(0),
            "CounterGameChannelManagerProxy: openChannel channelId cannot be 0x0"
        );

        require(
            !isChannelOpen(channelId),
            "CounterGameChannelManagerProxy: openChannel - channel already open"
        );
        
        for (uint i = 0; i < joinChannels.length; i++) {
            require(
                channelId == joinChannels[i].channelId,
                "CounterGameChannelManagerProxy: openChannel channelId doesn't match"
            );

            require(
                joinChannels[i].amount > 0,
                "CounterGameChannelManagerProxy: openChannel amount must be greater than 0"
            );

            require(
                joinChannels[i].deadlineTimestamp > block.timestamp,
                "CounterGameChannelManagerProxy: openChannel timestampDeadline must be in the future"
            );
        }
        
        // Create genesis state for the game
        CounterGameState memory genesisState;
        genesisState.counter = 0;
        genesisState.gameActive = true;
        genesisState.winner = address(0);
        genesisState.participants = new address[](joinChannels.length);
        genesisState.balances = new uint256[](joinChannels.length);
        
        for (uint i = 0; i < joinChannels.length; i++) {
            genesisState.participants[i] = joinChannels[i].participant;
            genesisState.balances[i] = joinChannels[i].amount;
        }
        
        // Set the first player as the starting player
        genesisState.currentPlayer = genesisState.participants[0];
        genesisState.betAmount = 50; // Default bet amount
        
        bytes memory genesisStateEncoded = abi.encode(genesisState);
        encodedStates[channelId][0] = genesisStateEncoded;
        genesisTimestamps[channelId][0] = block.timestamp;
        totalChannelsOpened++;
        
        emit SetState(channelId, genesisStateEncoded, 0, block.timestamp);
    }

    function closeChannel(
        bytes32 channelId,
        bytes[] calldata closeChannelData,
        bytes[] calldata signatures
    ) public virtual override {}

    function removeParticipant(
        bytes32 channelId,
        bytes[] calldata removeParticipantData,
        bytes[] calldata signatures
    ) public virtual override {}

    function addParticipant(
        bytes32 channelId,
        bytes[] calldata removeParticipantData,
        bytes[] calldata signatures
    ) public virtual override {}

    function _addParticipantComposable(
        JoinChannel memory joinChannel
    ) internal virtual override returns (bool) {}

    function _removeParticipantComposable(
        bytes32 channelId,
        ProcessExit memory processExit
    ) internal virtual override returns (bool) {}
}