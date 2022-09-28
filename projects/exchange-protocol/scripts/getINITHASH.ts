import { artifacts, contract } from "hardhat";
import { keccak256 } from '@ethersproject/solidity'
const GdexPair = artifacts.require("./GdexPair.sol");

const main = async()=>{
    
    const bytecode = await GdexPair.bytecode
    

    
    const COMPUTED_INIT_CODE_HASH =  keccak256(['bytes'], [`${bytecode}`])
    console.log(COMPUTED_INIT_CODE_HASH,"COMPUTED_INIT_CODE_HASH")
   
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
