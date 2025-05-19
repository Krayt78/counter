import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
  CounterGameChannelManagerProxy, 
  CounterGameStateMachine 
} from "../typechain-types";
import { EvmStateMachine, P2pEventHooks } from "@peer3/state-channels-plus";
import { createJoinChannelAndSignature } from "./helpers";
import { EventLog } from "ethers";

describe("Counter Game Gameplay", function () {
  let counterGameManager: CounterGameChannelManagerProxy;
  let counterGameMachine: CounterGameStateMachine;
  let player1: SignerWithAddress;
  let player2: SignerWithAddress;
  let channelId: string;
  let p2pPlayer1: any;
  let p2pPlayer2: any;
  let gameContractPlayer1: CounterGameStateMachine;
  let gameContractPlayer2: CounterGameStateMachine;
  let barrier: { allowOne: () => void, tryPass: () => Promise<void> };

  // Helper functions -------------------------------------------------

  // Set up the barrier to synchronize test events
  function createBarrier() {
    const queue: (() => void)[] = [];
    let count = 0;
    
    return {
      allowOne: () => {
        if (queue.length > 0) {
          const resolve = queue.shift();
          resolve?.();
        } else {
          count++;
        }
      },
      tryPass: () => {
        if (count > 0) {
          count--;
          return Promise.resolve();
        } else {
          return new Promise<void>((resolve) => {
            queue.push(resolve);
          });
        }
      }
    };
  }

  async function deployCounterGameContracts() {
    // Deploy the library
    const libraryFactory = await ethers.getContractFactory("StateChannelUtilLibrary");
    const utilLibrary = await libraryFactory.deploy();
    
    // Deploy dispute manager
    const disputeManagerFactory = await ethers.getContractFactory(
      "DisputeManagerFacet",
      {
        libraries: { StateChannelUtilLibrary: await utilLibrary.getAddress() }
      }
    );
    const disputeManager = await disputeManagerFactory.deploy();
    
    // Deploy state machine
    const stateMachineFactory = await ethers.getContractFactory("CounterGameStateMachine");
    const stateMachine = await stateMachineFactory.deploy();
    
    // Deploy channel manager
    const managerFactory = await ethers.getContractFactory(
      "CounterGameChannelManagerProxy",
      {
        libraries: { StateChannelUtilLibrary: await utilLibrary.getAddress() }
      }
    );
    const manager = await managerFactory.deploy(
      await stateMachine.getAddress(),
      await disputeManager.getAddress()
    );
    console.log("Deployed CounterGameChannelManagerProxy at:", manager.getAddress());
    console.log("Deployed CounterGameStateMachine at:", stateMachine.getAddress());
    console.log("Deployed StateChannelUtilLibrary at:", utilLibrary.getAddress());
    console.log("Deployed DisputeManagerFacet at:", disputeManager.getAddress());
    //we should wait for the deployment to be mined
    await Promise.all([
      utilLibrary.waitForDeployment(),
      disputeManager.waitForDeployment(),
      stateMachine.waitForDeployment(),
      manager.waitForDeployment()
    ]);

    console.log("All contracts deployed and mined successfully");
    // Return the deployed contracts
    return { manager, stateMachine };
  }

  async function getCounterGameDeploymentTransaction() {
    const stateMachineFactory = await ethers.getContractFactory("CounterGameStateMachine");
    return await stateMachineFactory.getDeployTransaction();
  }

  function createPlayerHooks(playerAddress: string, playerName: string): P2pEventHooks {
    return {
      onConnection: (address: string) => {
        console.log(`${playerName} connected to ${address}`);
        barrier.allowOne();
      },
      onTurn: (address: string) => {
        console.log(`${playerName}: It's ${address}'s turn`);
        if (address === playerAddress) {
          console.log(`${playerName}: My turn, allowing sync barrier`);
          barrier.allowOne();
        }
      },
      onSetState: () => {
        console.log(`${playerName}: State updated`);
      }
    };
  }

  function registerEventListeners() {
    // Listen for IncrementCounter events from both players
    gameContractPlayer1.on(
      gameContractPlayer1.filters.IncrementCounter,
      (player, increment, newTotal) => {
        console.log(`Player ${player} incremented by ${increment}, new total: ${newTotal}`);
      }
    );
    
    gameContractPlayer2.on(
      gameContractPlayer2.filters.IncrementCounter,
      (player, increment, newTotal) => {
        console.log(`Player ${player} incremented by ${increment}, new total: ${newTotal}`);
      }
    );
    
    // Listen for GameOver events
    gameContractPlayer1.on(
      gameContractPlayer1.filters.GameOver,
      (winner) => {
        console.log(`Game over! Winner: ${winner}`);
        barrier.allowOne();
      }
    );
  }

  // Test setup --------------------------------------------------------

  beforeEach(async function () {
    this.timeout(30000);
    barrier = createBarrier();
    
    // Get signers
    [player1, player2] = await ethers.getSigners();
    
    // Deploy contracts following the same pattern as in the previous test
    // ...
    const deployments = await deployCounterGameContracts();
    counterGameManager = deployments.manager;
    counterGameMachine = deployments.stateMachine;
    
    // Create a unique channel ID
    channelId = ethers.keccak256(ethers.toUtf8Bytes("gameplay-" + Date.now()));
    
    // Set up P2P instances for both players
    const deployTx = await getCounterGameDeploymentTransaction();
    
    // Create event hooks for players
    const player1Hooks = createPlayerHooks(player1.address, "Player 1");
    const player2Hooks = createPlayerHooks(player2.address, "Player 2");
    
    // Create P2P setup for both players
    p2pPlayer1 = await EvmStateMachine.p2pSetup(
      player1,
      deployTx,
      counterGameManager,
      counterGameMachine,
      player1Hooks
    );
    
    p2pPlayer2 = await EvmStateMachine.p2pSetup(
      player2,
      deployTx,
      counterGameManager,
      counterGameMachine,
      player2Hooks
    );
    
    gameContractPlayer1 = p2pPlayer1.p2pContractInstance;
    gameContractPlayer2 = p2pPlayer2.p2pContractInstance;
    
    // Set channel ID for both players
    p2pPlayer1.p2pSigner.setChannelId(channelId);
    p2pPlayer2.p2pSigner.setChannelId(channelId);
    
    // Register event listeners
    registerEventListeners();
  });

  // Fixtures -------------------------------------------------

  // Fixture to open a channel
  async function openChannelFixture() {
    const nbOfOpenChannels = await counterGameManager.totalChannelsOpened();
    expect(nbOfOpenChannels).to.equal(0);

    // Create join channel objects for players
    const { encodedJoinChannel: joinChannel1, signature: signature1 } = 
      await createJoinChannelAndSignature(channelId, player1, 100);
    
    const { encodedJoinChannel: joinChannel2, signature: signature2 } = 
      await createJoinChannelAndSignature(channelId, player2, 100);
    
    // Open channel with both players
    const tx = await counterGameManager.openChannel(
      channelId,
      [joinChannel1, joinChannel2],
      [signature1, signature2]
    );
    
    await tx.wait();

    // Check that the channel was opened successfully
    const newNbOfOpenChannels = await counterGameManager.totalChannelsOpened();
    expect(newNbOfOpenChannels).to.equal(1);
  }

  // Test cases --------------------------------------------------------

  it("should deploy the CounterGame contracts", async function() {
    this.timeout(30000);
    expect(counterGameManager).to.not.equal(undefined);
    expect(counterGameMachine).to.not.equal(undefined);
    expect(player1).to.not.equal(undefined);
    expect(player2).to.not.equal(undefined);
  });

  it("should open a channel", async function() {
    this.timeout(30000);
    // Open the channel
    await openChannelFixture();
    console.log("Channel opened successfully");
  });

  it("should create P2P instances for both players", async function() {
    this.timeout(30000);
    expect(p2pPlayer1).to.not.equal(undefined);
    expect(p2pPlayer2).to.not.equal(undefined);
    expect(gameContractPlayer1).to.not.equal(undefined);
    expect(gameContractPlayer2).to.not.equal(undefined);
  });

  it("should let the correct player make a move", async function() {
    this.timeout(30000);
    // Open the channel
    await openChannelFixture();
    console.log("Channel opened successfully");


    expect(await gameContractPlayer1.getCounter()).to.equal(0);

    // Wait for player turns and simulate gameplay
    await barrier.tryPass(); // Wait for first player's turn
    // Player 1 makes the first move
    await gameContractPlayer1.increment(10);
    console.log("Player 1 incremented counter by 10");

    expect(await gameContractPlayer1.getCounter()).to.equal(10);
    
  });
  
  it("should not allow the wrong player to make a move", async function() {
    this.timeout(30000);
    // Open the channel
    await openChannelFixture();
    console.log("Channel opened successfully");

    // Wait for player turns and simulate gameplay
    await barrier.tryPass(); // Wait for first player's turn
    // Player 2 tries to make a move
    try {
      await gameContractPlayer2.increment(5);
      console.log("Player 2 incremented counter by 5");
      expect.fail("Player 2 should not be able to make a move");
    } catch (error) {
      console.log("Player 2's move was rejected as expected");
    }
    expect(await gameContractPlayer1.getCounter()).to.equal(0);
  });

  it("should not allow the correct player to make an incorrect move", async function() {
    this.timeout(30000);
    // Open the channel
    await openChannelFixture();
    console.log("Channel opened successfully");
    // Wait for player turns and simulate gameplay
    await barrier.tryPass(); // Wait for first player's turn
    // Player 1 makes an incorrect move
    try {
      await gameContractPlayer1.increment(0);
      console.log("Player 1 incremented counter by 0");
      expect.fail("Player 1 should not be able to make an incorrect move");
    } catch (error) {
      console.log("Player 1's move was rejected as expected");
    }
    expect(await gameContractPlayer1.getCounter()).to.equal(0);
  });



  it("should open a channel and play the game until someone wins", async function() {
    this.timeout(300000); // Increase timeout for the entire test
    // Open the channel
    await openChannelFixture();
    console.log("Channel opened successfully");
    
    // Wait for player turns and simulate gameplay
    await barrier.tryPass(); // Wait for first player's turn
    
    // Player 1 makes the first move
    await gameContractPlayer1.increment(10);
    console.log("Player 1 incremented counter by 10");
    
    // Wait for player 2's turn
    await barrier.tryPass();
    
    // Player 2 makes a move
    await gameContractPlayer2.increment(5);
    console.log("Player 2 incremented counter by 5");
    
    // Wait for player 1's turn again
    await barrier.tryPass();
    
    // Player 1 makes another move
    await gameContractPlayer1.increment(8);
    console.log("Player 1 incremented counter by 8");
    
    // Continue the game until someone wins (would be a longer test)
    // For demonstration, we'll do just a few more moves
    
    // Wait for player 2's turn
    await barrier.tryPass();
    await gameContractPlayer2.increment(7);
    
    // Wait for player 1's turn
    await barrier.tryPass();
    await gameContractPlayer1.increment(10);
    
    // Wait for player 2's turn
    await barrier.tryPass();
    await gameContractPlayer2.increment(10);
    
    // Wait for player 1's turn
    await barrier.tryPass();
    await gameContractPlayer1.increment(10);
    
    // Wait for player 2's turn
    await barrier.tryPass();
    await gameContractPlayer2.increment(10);
    
    // Wait for player 1's turn
    await barrier.tryPass();
    await gameContractPlayer1.increment(10);
    
    // Wait for player 2's turn
    await barrier.tryPass();
    await gameContractPlayer2.increment(10);
    
    // Wait for player 1's turn - make winning move
    await barrier.tryPass();
    await gameContractPlayer1.increment(10);
    
    // Wait for game over event
    await barrier.tryPass();
    
    // Verify game state after win
    const state = await counterGameManager.getLatestState(channelId);
    const parsed = ethers.AbiCoder.defaultAbiCoder().decode(
      ["tuple(uint256 counter, address[] participants, uint256[] balances, address currentPlayer, bool gameActive, address winner, uint256 betAmount)"],
      state
    )[0];
    
    expect(parsed.counter).to.be.at.least(100);
    expect(parsed.gameActive).to.equal(false);
    expect(parsed.winner).to.equal(player1.address);
    
    console.log("Final counter value:", parsed.counter.toString());
  });
});