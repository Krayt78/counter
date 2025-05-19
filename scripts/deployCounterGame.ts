import { ethers } from "hardhat";
import { Wallet, NonceManager, Signer } from "ethers";
import { DeployUtils } from "@peer3/state-channels-plus";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config();
const PROVIDER_URL = process.env.PROVIDER_URL || "http://localhost:8545";

async function main() {
  // Get or create a signer
  let signer: Signer;
  
  if (process.env.PRIVATE_KEY) {
    const provider = new ethers.JsonRpcProvider(PROVIDER_URL);
    signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  } else {
    // For demo purposes, use a random wallet
    signer = Wallet.createRandom(new ethers.JsonRpcProvider(PROVIDER_URL));
  }
  
  signer = new NonceManager(signer);
  
  // Setup deployment utilities
  const contractsJSONpath = path.resolve(__dirname, "../contracts.json");
  const deployUtils = new DeployUtils(contractsJSONpath);
  
  console.log("Provider URL:", PROVIDER_URL);
  
  // Deploy the utility library
  console.log("Deploying StateChannelUtilLibrary...");
  let stateChannelUtilLibraryFactory = await ethers.getContractFactory("StateChannelUtilLibrary");
  stateChannelUtilLibraryFactory = stateChannelUtilLibraryFactory.connect(signer);
  let stateChannelUtilLibrary = await deployUtils.deployAsync(
    stateChannelUtilLibraryFactory,
    "StateChannelUtilLibrary"
  );
  let libraryAddress = await stateChannelUtilLibrary.getAddress();
  console.log("Deployed StateChannelUtilLibrary at", libraryAddress);
  
  // Deploy DisputeManagerFacet
  console.log("Deploying DisputeManagerFacet...");
  let disputeManagerFacetFactory = await ethers.getContractFactory(
    "DisputeManagerFacet",
    { libraries: { StateChannelUtilLibrary: libraryAddress } }
  );
  disputeManagerFacetFactory = disputeManagerFacetFactory.connect(signer);
  let disputeManagerFacet = await deployUtils.deployAsync(
    disputeManagerFacetFactory,
    "DisputeManagerFacet"
  );
  let disputeManagerFacetAddress = await disputeManagerFacet.getAddress();
  console.log("Deployed DisputeManagerFacet at", disputeManagerFacetAddress);
  
  // Deploy CounterGameStateMachine
  console.log("Deploying CounterGameStateMachine...");
  let counterGameSmFactory = await ethers.getContractFactory("CounterGameStateMachine");
  counterGameSmFactory = counterGameSmFactory.connect(signer);
  let counterGameInstance = await deployUtils.deployAsync(
    counterGameSmFactory,
    "CounterGameStateMachine"
  );
  console.log("Deployed CounterGameStateMachine at", await counterGameInstance.getAddress());
  
  // Deploy CounterGameChannelManagerProxy
  console.log("Deploying CounterGameChannelManagerProxy...");
  let counterGameChannelFactory = await ethers.getContractFactory(
    "CounterGameChannelManagerProxy",
    { libraries: { StateChannelUtilLibrary: libraryAddress } }
  );
  counterGameChannelFactory = counterGameChannelFactory.connect(signer);
  let counterGameChannelInstance = await deployUtils.deployAsync(
    counterGameChannelFactory,
    "CounterGameChannelManagerProxy",
    [await counterGameInstance.getAddress(), disputeManagerFacetAddress]
  );
  console.log("Deployed CounterGameChannelManagerProxy at", await counterGameChannelInstance.getAddress());
  
  console.log("All contracts deployed successfully!");
  console.log("Contract details saved to:", contractsJSONpath);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
