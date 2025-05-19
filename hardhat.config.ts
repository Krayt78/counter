import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PROVIDER_URL = process.env.PROVIDER_URL || "http://localhost:8545";

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      gasPrice: 0, // Set gas price to 0
      initialBaseFeePerGas: 0, // Set initial base fee per gas to 0
      mining: {
        auto: false, // Disable automatic mining
        interval: 2000 // Set block interval to 2 seconds (2000ms)
      }
    },
    custom: {
      url: PROVIDER_URL,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  solidity: {
    version: "0.8.26",
    settings: {
      viaIR: true, // Enable the via-IR pipeline
      optimizer: {
        enabled: true,
        runs: 100
      }
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};

export default config;
