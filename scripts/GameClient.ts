import EvmStateMachine from "@peer3/state-channels-plus/dist/src/evm/EvmStateMachine";
import { ContractExecuter } from "@peer3/state-channels-plus/dist/src/evm";
import { ethers } from "ethers";

export interface CounterGameState {
    counter: number;
    participants: string[];
    balances: number[];
    currentPlayer: string;
    gameActive: boolean;
    winner: string;
    betAmount: number;
}

export class CounterGameClient extends EvmStateMachine {
    private state: CounterGameState;

    constructor(
        contractExecuter: ContractExecuter,
        contractInterface: ethers.Interface,
        participants: string[],
        betAmount: number,
        initialBalances: number[]
    ) {
        super(contractExecuter, contractInterface);
        if (participants.length === 0) {
            throw new Error("Game must have at least one participant.");
        }
        if (initialBalances.length !== participants.length) {
            throw new Error("Each participant must have an initial balance.");
        }

        this.state = {
            counter: 0,
            participants: [...participants],
            balances: [...initialBalances],
            currentPlayer: participants[0],
            gameActive: true,
            winner: "0x0000000000000000000000000000000000000000", // Using address(0) equivalent
            betAmount: betAmount,
        };
    }

    getInternalState(): Readonly<CounterGameState> {
        return this.state;
    }

    increment(player: string, value: number): void {
        if (!this.state.gameActive) {
            throw new Error("Game is not active.");
        }
        if (player !== this.state.currentPlayer) {
            throw new Error("Not your turn.");
        }
        if (value < 1 || value > 10) {
            throw new Error("Increment must be between 1 and 10.");
        }

        this.state.counter += value;

        if (this.state.counter >= 100) {
            this.state.gameActive = false;
            this.state.winner = player;
            this.distributeWinnings();
        } else {
            const currentPlayerIndex = this.state.participants.indexOf(this.state.currentPlayer);
            this.state.currentPlayer = this.state.participants[(currentPlayerIndex + 1) % this.state.participants.length];
        }
    }

    private distributeWinnings(): void {
        const winnerIndex = this.state.participants.indexOf(this.state.winner);
        if (winnerIndex === -1) return; // Should not happen if winner is set

        for (let i = 0; i < this.state.participants.length; i++) {
            if (i === winnerIndex) continue;

            const amountToTransfer = Math.min(this.state.betAmount, this.state.balances[i]);
            this.state.balances[winnerIndex] += amountToTransfer;
            this.state.balances[i] -= amountToTransfer;
        }
    }

    removeParticipant(playerToRemove: string): { participant: string, amount: number } | null {
        const playerIndex = this.state.participants.indexOf(playerToRemove);
        if (playerIndex === -1) {
            // Player not found
            return null;
        }

        const removedParticipant = this.state.participants[playerIndex];
        const removedBalance = this.state.balances[playerIndex];

        // Remove participant and their balance
        this.state.participants.splice(playerIndex, 1);
        this.state.balances.splice(playerIndex, 1);

        if (this.state.participants.length === 0) {
            this.state.gameActive = false;
            // No winner if all players leave
            this.state.winner = "0x0000000000000000000000000000000000000000";
            return { participant: removedParticipant, amount: removedBalance };
        }
        
        // If it was a two-player game and one leaves, the other player wins
        if (this.state.participants.length === 1 && this.state.gameActive) {
             // This logic was for 2 players initially, if one leaves the other wins.
             // If we started with >2 players and now only 1 remains, that one is the winner.
            if (this.state.gameActive) { // Check if game was active before removal
                this.state.gameActive = false;
                this.state.winner = this.state.participants[0]; // The remaining player wins
                // The bet was already "staked" conceptually.
                // The original contract transfers the bet from the leaving player to the winner.
                // We need to ensure the winner gets the bet amount from the leaver's balance.
                const amountToTransfer = Math.min(this.state.betAmount, removedBalance);
                this.state.balances[0] += amountToTransfer; // Add to remaining player's balance
            }
        }


        // If the removed player was the current player, set the next player
        if (this.state.currentPlayer === playerToRemove && this.state.gameActive) {
            // The next player is determined by the new state of participants array
            // If the removed player was the last in the array, the new current player is the first one.
            // Otherwise, it's the one at the same index (as the array shifted).
            const newCurrentPlayerIndex = playerIndex % this.state.participants.length;
            this.state.currentPlayer = this.state.participants[newCurrentPlayerIndex];
        }


        return { participant: removedParticipant, amount: removedBalance };
    }

    // Helper to simulate joining a channel (adds participant and balance)
    // Note: The actual channel joining logic is more complex and involves signatures,
    // this is a simplified version for client-side state management.
    joinChannel(player: string, amount: number): boolean {
        if (this.state.participants.includes(player)) {
            console.warn(`Player ${player} is already in the game.`);
            return false;
        }
        if (amount <= 0) {
            console.warn(`Player ${player} must join with an amount greater than 0.`);
            return false;
        }
        this.state.participants.push(player);
        this.state.balances.push(amount);
        // If this is the first player joining after the game was perhaps reset or empty
        if (this.state.participants.length === 1 && !this.state.gameActive) {
            // Potentially reactivate game if it makes sense in the client flow
        }
        return true;
    }
}