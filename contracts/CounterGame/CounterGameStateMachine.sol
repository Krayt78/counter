// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

import "@peer3/state-channels-plus/contracts/V1/AStateMachine.sol";

struct CounterGameState {
    uint256 counter;            // Current counter value
    address[] participants;     // Players in the game
    uint256[] balances;         // Player balances (for stakes)
    address currentPlayer;      // Player whose turn it is
    bool gameActive;            // Whether the game is still active
    address winner;             // Winner of the game (address(0) if no winner yet)
    uint256 betAmount;          // Amount players bet on the game
}

contract CounterGameStateMachine is AStateMachine {
    CounterGameState state;
    
    event IncrementCounter(address player, uint256 increment, uint256 newTotal);
    event GameOver(address winner);
    event RemovedParticipant(address participant, uint256 amount);
    
    modifier onlyCurrentPlayer() {
        require(_tx.header.participant == state.currentPlayer, "Not your turn");
        _;
    }
    
    modifier isActiveGame() {
        require(state.gameActive, "Game is not active");
        _;
    }
    
    function getBalance(address adr) public view returns (uint256) {
        for (uint i = 0; i < state.participants.length; i++) {
            if (state.participants[i] == adr) {
                return state.balances[i];
            }
        }
        return 0;
    }
    
    function increment(uint256 value) public onlyCurrentPlayer isActiveGame {
        require(value >= 1 && value <= 10, "Increment must be between 1 and 10");
        
        state.counter += value;
        emit IncrementCounter(_tx.header.participant, value, state.counter);
        
        // Check for win condition
        if (state.counter >= 100) {
            state.gameActive = false;
            state.winner = _tx.header.participant;
            
            // Transfer the bet amount to the winner
            for (uint i = 0; i < state.participants.length; i++) {
                if (state.participants[i] == state.winner) {
                    for (uint j = 0; j < state.participants.length; j++) {
                        if (j != i) {
                            uint256 transferAmount = state.betAmount > state.balances[j] ? state.balances[j] : state.betAmount;
                            state.balances[i] += transferAmount;
                            state.balances[j] -= transferAmount;
                        }
                    }
                    break;
                }
            }
            
            emit GameOver(state.winner);
        } else {
            // Update the current player to the next one in the array
            for (uint i = 0; i < state.participants.length; i++) {
                if (state.participants[i] == state.currentPlayer) {
                    state.currentPlayer = state.participants[(i + 1) % state.participants.length];
                    break;
                }
            }
        }
    }
    
    function getCounter() public view returns (uint256) {
        return state.counter;
    }
    
    function getWinner() public view returns (address) {
        return state.winner;
    }
    
    function isGameActive() public view returns (bool) {
        return state.gameActive;
    }
    
    //AStateMachine implementation
    function _setState(bytes memory encodedState) internal virtual override {
        state = abi.decode(encodedState, (CounterGameState));
    }
    
    function getState() public view virtual override returns (bytes memory) {
        return abi.encode(state);
    }
    
    function getParticipants() public view virtual override returns (address[] memory) {
        return state.participants;
    }
    
    function getNextToWrite() public view virtual override returns (address) {
        if (state.participants.length == 0) {
            return _tx.header.participant;
        }
        return state.currentPlayer;
    }
    
    function _slashParticipant(address adr) internal virtual override returns (bool, ProcessExit memory) {
        return _removeParticipant(adr);
    }
    
    function _removeParticipant(address adr) internal virtual override returns (bool, ProcessExit memory) {
        uint256 length = state.participants.length;
        ProcessExit memory processExit;
        
        for (uint256 i = 0; i < length; i++) {
            if (state.participants[i] == adr) {
                processExit.participant = adr;
                processExit.amount = state.balances[i];
                
                // If it's a two-player game and one leaves, the other player wins
                if (length == 2 && state.gameActive) {
                    state.gameActive = false;
                    state.winner = state.participants[1 - i]; // Other player wins
                    
                    // Transfer the bet amount to the winner
                    uint256 transferAmount = state.betAmount > state.balances[i] ? state.balances[i] : state.betAmount;
                    state.balances[1 - i] += transferAmount;
                    state.balances[i] -= transferAmount;
                    
                    emit GameOver(state.winner);
                }
                
                // Remove participant
                state.participants[i] = state.participants[length - 1];
                state.participants.pop();
                state.balances[i] = state.balances[length - 1];
                state.balances.pop();
                
                emit RemovedParticipant(adr, processExit.amount);
                return (true, processExit);
            }
        }
        
        return (false, processExit);
    }
    
    function _joinChannel(JoinChannel memory joinChannel) internal virtual override returns (bool) {
        // Logic for joining the channel
        // This would typically be called when a new player joins
        return true;
    }
}