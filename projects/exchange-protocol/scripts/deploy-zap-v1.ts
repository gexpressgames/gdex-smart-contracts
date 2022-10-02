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
  }

  if (!config.GdexRouter[networkName] || config.GdexRouter[networkName] === ethers.constants.AddressZero) {
    throw new Error("Missing router address, refer to README 'Deployment' section");
  }

  if (!config.WBNB[networkName] || config.WBNB[networkName] === ethers.constants.AddressZero) {
    throw new Error("Missing WBNB address, refer to README 'Deployment' section");
  }

  console.log("Deploying to network:", networkName);

  // Deploy GdexZapV1
  console.log("Deploying GdexZap V1..");

  const GdexZapV1 = await ethers.getContractFactory("GdexZapV1");

  const gdexZap = await GdexZapV1.deploy(
    config.WBNB[networkName],
    config.GdexRouter[networkName],
    config.MaxZapReverseRatio[networkName]
  );

  await gdexZap.deployed();

  console.log("GdexZap V1 deployed to:", gdexZap.address);
  try {
    await run("verify", {
        address: gdexZap.address,
        constructorArguments: [
          config.WBNB[networkName],
          config.GdexRouter[networkName],
          config.MaxZapReverseRatio[networkName]],
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
