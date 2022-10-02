import { ethers, network, run } from "hardhat";

import config from "../config";

const main = async () => {
  // Compile contracts
  await run("compile");
  console.log("Compiled contracts.");

  const networkName = network.name;

  // Sanity checks
  if (networkName === "mainnet") {
    if (!process.env.KEY_MAINNET) {
      throw new Error("Missing private key, refer to README 'Deployment' section");
    }
  } else if (networkName === "testnet") {
    if (!process.env.KEY_TESTNET) {
      throw new Error("Missing private key, refer to README 'Deployment' section");
    }
    // deploy erc20 tokens
  }

  if (!config.GdexRouter[networkName] || config.GdexRouter[networkName] === ethers.constants.AddressZero) {
    throw new Error("Missing router address, refer to README 'Deployment' section");
  }
  if (!config.FactoryFeeAddress[networkName] || config.FactoryFeeAddress[networkName] === ethers.constants.AddressZero) {
    throw new Error("Missing Factoryfee address, refer for  'Deployment' section");
  }
  if (!config.WBNB[networkName] || config.WBNB[networkName] === ethers.constants.AddressZero) {
    throw new Error("Missing WBNB address, refer to README 'Deployment' section");
  }

  console.log("Deploying to network:", networkName);

  // Deploy GdexZapV1
  console.log("Deploying GdexFactory ..");

  const _GdexFactory = await ethers.getContractFactory("GdexFactory");

  const GdexFactory = await _GdexFactory.deploy(config.FactoryFeeAddress[networkName]);

  await GdexFactory.deployed();
  try {
    await run("verify:verify", {
        address: GdexFactory.address,
        constructorArguments: [config.FactoryFeeAddress[networkName]],
    });
  } catch (e: any) {
    console.error(`error in verifying: ${e.message}`);
  }

};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
