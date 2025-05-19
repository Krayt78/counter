import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { 
  CounterGameChannelManagerProxy, 
  CounterGameStateMachine,
  StateChannelUtilLibrary
} from "../typechain-types";
import { EventLog } from "ethers";
import { createJoinChannelAndSignature } from "./helpers";

xdescribe("CounterGame", function () {
  let counterGameManager: CounterGameChannelManagerProxy;
  let counterGameMachine: CounterGameStateMachine;
  let utilLibrary: StateChannelUtilLibrary;
  let player1: SignerWithAddress;
  let player2: SignerWithAddress;
  let channelId: string;

  const addressZero = "0x0000000000000000000000000000000000000000";

  // Fixture to deploy the contracts
  async function deployContracts() {
    // Get signers
    [player1, player2] = await ethers.getSigners();
    
    // Deploy the library
    const libraryFactory = await ethers.getContractFactory("StateChannelUtilLibrary");
    utilLibrary = await libraryFactory.deploy();
    
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
    counterGameMachine = await stateMachineFactory.deploy();
    
    // Deploy channel manager
    const managerFactory = await ethers.getContractFactory(
      "CounterGameChannelManagerProxy",
      {
        libraries: { StateChannelUtilLibrary: await utilLibrary.getAddress() }
      }
    );
    counterGameManager = await managerFactory.deploy(
      await counterGameMachine.getAddress(),
      await disputeManager.getAddress()
    );
    
    // Create a unique channel ID for this test
    channelId = ethers.keccak256(ethers.toUtf8Bytes("channel-" + Date.now()));
  }

  // Fixture to open a channel
  async function openChannelFixture() {
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
    const receipt = await tx.wait();
    expect(receipt?.logs.length).to.be.at.least(1);
    // Check state was initialized
    const state = await counterGameManager.getLatestState(channelId);
    expect(state).to.not.equal("0x");
    const parsed = ethers.AbiCoder.defaultAbiCoder().decode(
      ["tuple(uint256 counter, address[] participants, uint256[] balances, address currentPlayer, bool gameActive, address winner, uint256 betAmount)"],
      state
    )[0];
    expect(parsed.counter).to.equal(0);
    expect(parsed.participants.length).to.equal(2);
    expect(parsed.participants[0]).to.equal(player1.address);
    expect(parsed.participants[1]).to.equal(player2.address);
    expect(parsed.currentPlayer).to.equal(player1.address);
    expect(parsed.gameActive).to.equal(true);
    expect(parsed.winner).to.equal(addressZero);
  }

  beforeEach(async function () {
    // Deploy contracts before each test
    await deployContracts();
  });

  it("should open a channel and set initial state", async function () {
    await openChannelFixture();
  });

  it("should allow player that is the turn to play a correct amount", async function () {  });

  it("should not allow player that is not the turn to play", async function () {
  });

  it("should not allow player that is the turn to play, to play incorrect amount", async function () {
  });


});
