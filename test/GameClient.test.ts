import { expect } from 'chai';
import { CounterGameClient, CounterGameState } from '../scripts/GameClient';

describe('CounterGameClient', () => {
    let gameClient: CounterGameClient;

    describe('Initialization', () => {
        it('should initialize a game with participants, bet amount, and initial balances', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob'], 50, [100, 100]);
            const state = gameClient.getState();
            expect(state.participants).to.deep.equal(['Alice', 'Bob']);
            expect(state.betAmount).to.equal(50);
            expect(state.balances).to.deep.equal([100, 100]);
            expect(state.currentPlayer).to.equal('Alice');
            expect(state.gameActive).to.be.true;
            expect(state.counter).to.equal(0);
            expect(state.winner).to.equal('0x0000000000000000000000000000000000000000');
        });

        it('should throw an error if initialized with no participants', () => {
            expect(() => new CounterGameClient([], 50, [])).to.throw('Game must have at least one participant.');
        });

        it('should throw an error if initial balances length does not match participants length', () => {
            expect(() => new CounterGameClient(['Alice'], 50, [100, 100])).to.throw('Each participant must have an initial balance.');
        });
    });

    describe('increment', () => {
        beforeEach(() => {
            gameClient = new CounterGameClient(['Alice', 'Bob'], 50, [100, 100]);
        });

        it('should allow the current player to increment the counter', () => {
            gameClient.increment('Alice', 10);
            const state = gameClient.getState();
            expect(state.counter).to.equal(10);
            expect(state.currentPlayer).to.equal('Bob');
        });

        it('should throw an error if a non-current player tries to increment', () => {
            expect(() => gameClient.increment('Bob', 10)).to.throw('Not your turn.');
        });

        it('should throw an error if the game is not active', () => {
            // Alice needs to make 10 increments of 10 to reach 100
            // Bob will make minimal moves in between
            while(gameClient.getState().gameActive) {
                const currentPlayer = gameClient.getState().currentPlayer;
                if (currentPlayer === 'Alice') {
                    gameClient.increment('Alice', 10);
                } else if (currentPlayer === 'Bob') {
                    gameClient.increment('Bob', 1); // Bob makes a minimal move
                }
                // Safety break if loop runs too long (e.g. > 20 turns total), though not expected
                if (gameClient.getState().counter > 120) break; 
            }
            expect(gameClient.getState().gameActive).to.be.false; // Ensure game is inactive
            expect(gameClient.getState().winner).to.equal('Alice'); // Alice should be the winner
            expect(() => gameClient.increment('Bob', 1)).to.throw('Game is not active.');
        });

        it('should throw an error if increment value is less than 1', () => {
            expect(() => gameClient.increment('Alice', 0)).to.throw('Increment must be between 1 and 10.');
        });

        it('should throw an error if increment value is greater than 10', () => {
            expect(() => gameClient.increment('Alice', 11)).to.throw('Increment must be between 1 and 10.');
        });

        it('should set the player as winner if counter reaches 100 and distribute winnings', () => {
            // Simulate turns until Alice can win
            // Alice: 10, Bob: 1, Alice: 10, Bob: 1 ... 
            // Alice needs to get counter to >= 100
            // Total increments for Alice needed: 10 (each of 10 points)
            // Total increments for Bob: 9 (each of 1 point, as Alice wins on her 10th move)

            for (let i = 0; i < 10; i++) { // Alice makes 10 moves
                if (!gameClient.getState().gameActive) break;
                if (gameClient.getState().currentPlayer === 'Alice') {
                    gameClient.increment('Alice', 10);
                }
                
                if (!gameClient.getState().gameActive) break; // Check if Alice won
                
                if (gameClient.getState().currentPlayer === 'Bob') {
                     gameClient.increment('Bob', 1); // Bob makes a minimal move
                }
            }
            
            const state = gameClient.getState();
            expect(state.winner).to.equal('Alice');
            expect(state.gameActive).to.be.false;
            // Alice (winner) gets Bob's bet amount (50), Bob loses 50
            // Alice's balance: 100 (initial) - 50 (own bet part if lost, but won) + 50 (from Bob) = 100, conceptually. Solidity one is clearer.
            // Balances: Alice started 100, Bob started 100. Bet was 50.
            // Alice wins. Alice's balance becomes 100+50=150. Bob's balance becomes 100-50=50.
            expect(state.balances).to.deep.equal([150, 50]);
        });

         it('should handle win correctly when bet amount is greater than a loser\'s balance', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob'], 120, [200, 30]); // Bob has less than bet amount
            
            // Alice needs to make 10 increments of 10 to win (total 100)
            // Bob will make minimal moves in between if game is active
            for (let i = 0; i < 10; i++) { // Loop for Alice's 10 potential winning moves
                if (!gameClient.getState().gameActive) break; // Exit if game ended (Alice won)

                if (gameClient.getState().currentPlayer === 'Alice') {
                    gameClient.increment('Alice', 10);
                }
                
                if (!gameClient.getState().gameActive) break; // Exit if Alice just won

                if (gameClient.getState().currentPlayer === 'Bob') {
                    gameClient.increment('Bob', 1); // Bob makes a minimal move
                }
            }

            const state = gameClient.getState();
            expect(state.winner).to.equal('Alice');
            expect(state.gameActive).to.be.false;
            // Alice should get Bob's entire balance (30) as it's less than bet (120)
            // Alice's balance: 200 + 30 = 230
            // Bob's balance: 30 - 30 = 0
            expect(state.balances).to.deep.equal([230, 0]);
        });
    });

    describe('removeParticipant', () => {
        it('should remove a participant and their balance, returning their info', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob', 'Charlie'], 50, [100, 100, 100]);
            const removedInfo = gameClient.removeParticipant('Bob');
            const state = gameClient.getState();
            expect(removedInfo).to.deep.equal({ participant: 'Bob', amount: 100 });
            expect(state.participants).to.deep.equal(['Alice', 'Charlie']);
            expect(state.balances).to.deep.equal([100, 100]); // Alice and Charlie's balances unchanged initially
        });

        it('should return null if trying to remove a non-existent participant', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob'], 50, [100, 100]);
            expect(gameClient.removeParticipant('Charlie')).to.be.null;
        });

        it('should make the other player the winner if one leaves a 2-player game and transfer bet', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob'], 50, [100, 100]);
            gameClient.removeParticipant('Alice');
            const state = gameClient.getState();
            expect(state.winner).to.equal('Bob');
            expect(state.gameActive).to.be.false;
            // Bob (winner) gets Alice's bet (50)
            // Bob's balance: 100 + 50 = 150
            // Alice's balance was 100, she left, her stake is transferred.
            expect(state.balances).to.deep.equal([150]); // Only Bob remains
        });

        it('should handle winner declaration when a player leaves and their balance is less than bet', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob'], 100, [30, 100]); // Alice has less than bet
            gameClient.removeParticipant('Alice'); // Alice leaves
            const state = gameClient.getState();
            expect(state.winner).to.equal('Bob');
            expect(state.gameActive).to.be.false;
            // Bob should get Alice's entire balance (30) as it's less than bet (100)
            // Bob's balance: 100 + 30 = 130
            expect(state.balances).to.deep.equal([130]);
        });

        it('should correctly set the next player if the current player is removed', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob', 'Charlie'], 50, [100, 100, 100]);
            gameClient.increment('Alice', 10); // Bob is current player
            gameClient.removeParticipant('Bob'); // Bob (current player) is removed
            const state = gameClient.getState();
            expect(state.currentPlayer).to.equal('Charlie'); // Charlie should be next
            expect(state.participants).to.deep.equal(['Alice', 'Charlie']);
        });

        it('should set game to inactive with no winner if all participants leave', () => {
            gameClient = new CounterGameClient(['Alice'], 50, [100]);
            gameClient.removeParticipant('Alice');
            const state = gameClient.getState();
            expect(state.gameActive).to.be.false;
            expect(state.winner).to.equal('0x0000000000000000000000000000000000000000');
            expect(state.participants).to.deep.equal([]);
            expect(state.balances).to.deep.equal([]);
        });

        it('if current player is last in list and removed, next player is the first in the new list', () => {
            gameClient = new CounterGameClient(['Alice', 'Bob', 'Charlie'], 50, [100, 100, 100]);
            gameClient.increment('Alice', 10); // Bob is current
            gameClient.increment('Bob', 10);   // Charlie is current
            gameClient.removeParticipant('Charlie'); // Charlie (current player) is removed
            const state = gameClient.getState();
            expect(state.currentPlayer).to.equal('Alice'); // Alice should be next (loops back)
            expect(state.participants).to.deep.equal(['Alice', 'Bob']);
        });
    });

    describe('joinChannel', () => {
        beforeEach(() => {
            gameClient = new CounterGameClient(['Alice'], 50, [100]);
        });

        it('should allow a new player to join with a valid amount', () => {
            const result = gameClient.joinChannel('Bob', 150);
            const state = gameClient.getState();
            expect(result).to.be.true;
            expect(state.participants).to.deep.equal(['Alice', 'Bob']);
            expect(state.balances).to.deep.equal([100, 150]);
        });

        it('should not allow a player to join if they are already in the game', () => {
            const result = gameClient.joinChannel('Alice', 100);
            expect(result).to.be.false;
            // Could also spy on console.warn if using Jest mocks
        });

        it('should not allow a player to join with an amount less than or equal to 0', () => {
            let result = gameClient.joinChannel('Bob', 0);
            expect(result).to.be.false;
            result = gameClient.joinChannel('Charlie', -10);
            expect(result).to.be.false;
        });
    });
}); 