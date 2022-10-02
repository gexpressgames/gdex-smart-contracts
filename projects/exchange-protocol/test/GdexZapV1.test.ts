import { formatUnits, parseEther } from "ethers/lib/utils";
import { artifacts, contract } from "hardhat";
import { assert, expect } from "chai";
import { BN, constants, expectEvent, expectRevert, time } from "@openzeppelin/test-helpers";

const MockERC20 = artifacts.require("./utils/MockERC20.sol");
const GdexFactory = artifacts.require("./GdexFactory.sol");
const GdexPair = artifacts.require("./GdexPair.sol");
const GdexRouter = artifacts.require("./GdexRouter.sol");
const GdexZapV1 = artifacts.require("./GdexZapV1.sol");
const WBNB = artifacts.require("./WBNB.sol");

contract("GdexZapV1", ([alice, bob, carol, david, erin]) => {
  let maxZapReverseRatio;
  let pairAB;
  let pairBC;
  let pairAC;
  let gdexZap;
  let gdec;
  let gdexFactory;
  let tokenA;
  let tokenC;
  let wrappedBNB;

  before(async () => {
    // Deploy Factory
    gdexFactory = await GdexFactory.new(alice, { from: alice });

    // Deploy Wrapped BNB
    wrappedBNB = await WBNB.new({ from: alice });

    // Deploy Router
    gdec = await GdexRouter.new(gdexFactory.address, wrappedBNB.address, { from: alice });

    // Deploy ZapV1
    maxZapReverseRatio = 100; // 1%
    gdexZap = await GdexZapV1.new(wrappedBNB.address, gdec.address, maxZapReverseRatio, { from: alice });

    // Deploy ERC20s
    tokenA = await MockERC20.new("Token A", "TA", parseEther("10000000"), { from: alice });
    tokenC = await MockERC20.new("Token C", "TC", parseEther("10000000"), { from: alice });

    // Create 3 LP tokens
    let result = await gdexFactory.createPair(tokenA.address, wrappedBNB.address, { from: alice });
    pairAB = await GdexPair.at(result.logs[0].args[2]);

    result = await gdexFactory.createPair(wrappedBNB.address, tokenC.address, { from: alice });
    pairBC = await GdexPair.at(result.logs[0].args[2]);

    result = await gdexFactory.createPair(tokenA.address, tokenC.address, { from: alice });
    pairAC = await GdexPair.at(result.logs[0].args[2]);

    assert.equal(String(await pairAB.totalSupply()), parseEther("0").toString());
    assert.equal(String(await pairBC.totalSupply()), parseEther("0").toString());
    assert.equal(String(await pairAC.totalSupply()), parseEther("0").toString());

    // Mint and approve all contracts
    for (let thisUser of [alice, bob, carol, david, erin]) {
      await tokenA.mintTokens(parseEther("2000000"), { from: thisUser });
      await tokenC.mintTokens(parseEther("2000000"), { from: thisUser });

      await tokenA.approve(gdec.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await tokenA.approve(gdexZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await tokenC.approve(gdec.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await tokenC.approve(gdexZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await wrappedBNB.approve(gdec.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await wrappedBNB.approve(gdexZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await pairAB.approve(gdexZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await pairBC.approve(gdexZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });

      await pairAC.approve(gdexZap.address, constants.MAX_UINT256, {
        from: thisUser,
      });
    }
  });

  describe("Normal cases for liquidity provision and zap ins", async () => {
    it("User adds liquidity to LP tokens", async function () {
      const deadline = new BN(await time.latest()).add(new BN("100"));
      /* Add liquidity (Gdex Router)
       * address tokenB,
       * uint256 amountADesired,
       * uint256 amountBDesired,
       * uint256 amountAMin,
       * uint256 amountBMin,
       * address to,
       * uint256 deadline
       */

      // 1 A = 1 C
      let result = await gdec.addLiquidity(
        tokenC.address,
        tokenA.address,
        parseEther("1000000"), // 1M token A
        parseEther("1000000"), // 1M token B
        parseEther("1000000"),
        parseEther("1000000"),
        bob,
        deadline,
        { from: bob }
      );

      expectEvent.inTransaction(result.receipt.transactionHash, tokenA, "Transfer", {
        from: bob,
        to: pairAC.address,
        value: parseEther("1000000").toString(),
      });

      expectEvent.inTransaction(result.receipt.transactionHash, tokenC, "Transfer", {
        from: bob,
        to: pairAC.address,
        value: parseEther("1000000").toString(),
      });

      assert.equal(String(await pairAC.totalSupply()), parseEther("1000000").toString());
      assert.equal(String(await tokenA.balanceOf(pairAC.address)), parseEther("1000000").toString());
      assert.equal(String(await tokenC.balanceOf(pairAC.address)), parseEther("1000000").toString());

      // 1 BNB = 100 A
      result = await gdec.addLiquidityETH(
        tokenA.address,
        parseEther("100000"), // 100k token A
        parseEther("100000"), // 100k token A
        parseEther("1000"), // 1,000 BNB
        bob,
        deadline,
        { from: bob, value: parseEther("1000").toString() }
      );

      expectEvent.inTransaction(result.receipt.transactionHash, tokenA, "Transfer", {
        from: bob,
        to: pairAB.address,
        value: parseEther("100000").toString(),
      });

      assert.equal(String(await pairAB.totalSupply()), parseEther("10000").toString());
      assert.equal(String(await wrappedBNB.balanceOf(pairAB.address)), parseEther("1000").toString());
      assert.equal(String(await tokenA.balanceOf(pairAB.address)), parseEther("100000").toString());

      // 1 BNB = 100 C
      result = await gdec.addLiquidityETH(
        tokenC.address,
        parseEther("100000"), // 100k token C
        parseEther("100000"), // 100k token C
        parseEther("1000"), // 1,000 BNB
        bob,
        deadline,
        { from: bob, value: parseEther("1000").toString() }
      );

      expectEvent.inTransaction(result.receipt.transactionHash, tokenC, "Transfer", {
        from: bob,
        to: pairBC.address,
        value: parseEther("100000").toString(),
      });

      assert.equal(String(await pairBC.totalSupply()), parseEther("10000").toString());
      assert.equal(String(await wrappedBNB.balanceOf(pairBC.address)), parseEther("1000").toString());
      assert.equal(String(await tokenC.balanceOf(pairBC.address)), parseEther("100000").toString());
    });

    it("User completes zapIn with tokenA (pair tokenA/tokenC)", async function () {
      const lpToken = pairAC.address;
      const tokenToZap = tokenA.address;
      const tokenAmountIn = parseEther("1");

      const estimation = await gdexZap.estimateZapInSwap(tokenToZap, parseEther("1"), lpToken);
      assert.equal(estimation[2], tokenC.address);

      // Setting up slippage at 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await gdexZap.zapInToken(tokenToZap, tokenAmountIn, lpToken, minTokenAmountOut, {
        from: carol,
      });

      expectEvent(result, "ZapIn", {
        tokenToZap: tokenToZap,
        lpToken: lpToken,
        tokenAmountIn: parseEther("1").toString(),
        lpTokenAmountReceived: parseEther("0.499373703104732887").toString(),
        user: carol,
      });

      expectEvent.inTransaction(result.receipt.transactionHash, pairAC, "Transfer", {
        from: constants.ZERO_ADDRESS,
        to: carol,
        value: parseEther("0.499373703104732887").toString(),
      });

      assert.equal(String(await pairAC.balanceOf(carol)), parseEther("0.499373703104732887").toString());
      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(gdexZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(gdexZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(gdexZap.address)), 18));
    });

    it("User completes zapIn with BNB (pair BNB/tokenC)", async function () {
      const lpToken = pairBC.address;
      const tokenAmountIn = parseEther("1");

      const estimation = await gdexZap.estimateZapInSwap(wrappedBNB.address, parseEther("1"), lpToken);
      assert.equal(estimation[2], tokenC.address);

      // Setting up slippage at 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await gdexZap.zapInBNB(lpToken, minTokenAmountOut, {
        from: carol,
        value: tokenAmountIn.toString(),
      });

      expectEvent(result, "ZapIn", {
        tokenToZap: constants.ZERO_ADDRESS,
        lpToken: lpToken,
        tokenAmountIn: parseEther("1").toString(),
        lpTokenAmountReceived: parseEther("4.992493116557219690").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(gdexZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(gdexZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(gdexZap.address)), 18));
    });

    it("User completes zapInRebalancing with BNB (pair BNB/tokenC)", async function () {
      const lpToken = pairBC.address;
      const token0AmountIn = parseEther("1"); // 1 BNB
      const token1AmountIn = parseEther("50"); // 50 token C

      const estimation = await gdexZap.estimateZapInRebalancingSwap(
        wrappedBNB.address,
        tokenC.address,
        token0AmountIn,
        token1AmountIn,
        lpToken
      );

      assert.equal(estimation[2], true);

      // Setting up slippage at 2x 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));
      const maxTokenAmountIn = new BN(estimation[0].toString()).mul(new BN("10005")).div(new BN("10000"));

      const result = await gdexZap.zapInBNBRebalancing(
        tokenC.address,
        token1AmountIn,
        lpToken,
        maxTokenAmountIn,
        minTokenAmountOut,
        estimation[2],
        {
          from: carol,
          value: token0AmountIn.toString(),
        }
      );

      expectEvent(result, "ZapInRebalancing", {
        token0ToZap: constants.ZERO_ADDRESS,
        token1ToZap: tokenC.address,
        lpToken: lpToken,
        token0AmountIn: token0AmountIn.toString(),
        token1AmountIn: token1AmountIn.toString(),
        lpTokenAmountReceived: parseEther("7.495311264946730291").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(gdexZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(gdexZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(gdexZap.address)), 18));
    });

    it("User completes zapInRebalancing with tokens (tokenA/tokenC)", async function () {
      const lpToken = pairAC.address;
      const token0AmountIn = parseEther("1000"); // 1000 token A
      const token1AmountIn = parseEther("5000"); // 5000 token C

      const estimation = await gdexZap.estimateZapInRebalancingSwap(
        tokenA.address,
        tokenC.address,
        token0AmountIn,
        token1AmountIn,
        lpToken
      );

      assert.equal(estimation[2], false);

      // Setting up slippage at 2x 0.5%
      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));
      const maxTokenAmountIn = new BN(estimation[0].toString()).mul(new BN("10005")).div(new BN("10000"));

      const result = await gdexZap.zapInTokenRebalancing(
        tokenA.address,
        tokenC.address,
        token0AmountIn,
        token1AmountIn,
        lpToken,
        maxTokenAmountIn,
        minTokenAmountOut,
        estimation[2],
        {
          from: carol,
        }
      );

      expectEvent(result, "ZapInRebalancing", {
        token0ToZap: tokenA.address,
        token1ToZap: tokenC.address,
        lpToken: lpToken,
        token0AmountIn: token0AmountIn.toString(),
        token1AmountIn: token1AmountIn.toString(),
        lpTokenAmountReceived: "2995503304234356879808",
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(gdexZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(gdexZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(gdexZap.address)), 18));
    });

    it("User completes zapOut to token (tokenA/tokenC)", async function () {
      const lpToken = pairAC.address;
      const lpTokenAmount = parseEther("1");
      const tokenToReceive = tokenA.address;

      const estimation = await gdexZap.estimateZapOutSwap(lpToken, lpTokenAmount, tokenToReceive);
      assert.equal(estimation[2], tokenC.address);

      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await gdexZap.zapOutToken(lpToken, tokenToReceive, lpTokenAmount, minTokenAmountOut, {
        from: carol,
      });

      expectEvent(result, "ZapOut", {
        lpToken: lpToken,
        tokenToReceive: tokenToReceive,
        lpTokenAmount: lpTokenAmount.toString(),
        tokenAmountReceived: parseEther("1.999586848572742784").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(gdexZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(gdexZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(gdexZap.address)), 18));
    });

    it("User completes zapOut to BNB (BNB/tokenC)", async function () {
      const lpToken = pairBC.address;
      const lpTokenAmount = parseEther("1");
      const tokenToReceive = wrappedBNB.address;

      const estimation = await gdexZap.estimateZapOutSwap(lpToken, lpTokenAmount, tokenToReceive);
      assert.equal(estimation[2], tokenC.address);

      const minTokenAmountOut = new BN(estimation[1].toString()).mul(new BN("9995")).div(new BN("10000"));

      const result = await gdexZap.zapOutBNB(lpToken, lpTokenAmount, minTokenAmountOut, {
        from: carol,
      });

      expectEvent(result, "ZapOut", {
        lpToken: lpToken,
        tokenToReceive: constants.ZERO_ADDRESS,
        lpTokenAmount: lpTokenAmount.toString(),
        tokenAmountReceived: parseEther("0.199890295552765397").toString(),
        user: carol,
      });

      console.info("Balance tokenA: " + formatUnits(String(await tokenA.balanceOf(gdexZap.address)), 18));
      console.info("Balance WBNB: " + formatUnits(String(await wrappedBNB.balanceOf(gdexZap.address)), 18));
      console.info("Balance tokenC: " + formatUnits(String(await tokenC.balanceOf(gdexZap.address)), 18));
    });

    it("Zap estimation fail if wrong tokens", async function () {
      await expectRevert(
        gdexZap.estimateZapInSwap(wrappedBNB.address, parseEther("1"), pairAC.address),
        "Zap: Wrong tokens"
      );
      await expectRevert(
        gdexZap.estimateZapInRebalancingSwap(
          tokenA.address,
          wrappedBNB.address,
          parseEther("1"),
          parseEther("1"),
          pairAC.address
        ),
        "Zap: Wrong token1"
      );

      await expectRevert(
        gdexZap.estimateZapInRebalancingSwap(
          wrappedBNB.address,
          tokenA.address,
          parseEther("1"),
          parseEther("1"),
          pairAC.address
        ),
        "Zap: Wrong token0"
      );
      await expectRevert(
        gdexZap.estimateZapInRebalancingSwap(
          tokenA.address,
          tokenA.address,
          parseEther("1"),
          parseEther("1"),
          pairAC.address
        ),
        "Zap: Same tokens"
      );

      await expectRevert(
        gdexZap.estimateZapOutSwap(pairAC.address, parseEther("1"), wrappedBNB.address),
        "Zap: Token not in LP"
      );
    });

    it("Zap estimations work as expected", async function () {
      // Verify estimations are the same regardless of the argument ordering
      const estimation0 = await gdexZap.estimateZapInRebalancingSwap(
        tokenA.address,
        tokenC.address,
        parseEther("0.5"),
        parseEther("1"),
        pairAC.address
      );
      const estimation1 = await gdexZap.estimateZapInRebalancingSwap(
        tokenC.address,
        tokenA.address,
        parseEther("1"),
        parseEther("0.5"),
        pairAC.address
      );

      assert.equal(estimation0[0].toString(), estimation1[0].toString());
      assert.equal(estimation0[1].toString(), estimation1[1].toString());
      assert.equal(!estimation0[2], estimation1[2]);

      // Verify estimations are the same for zapIn and zapInRebalancing with 0 for one of the quantity
      const estimation2 = await gdexZap.estimateZapInSwap(tokenA.address, parseEther("5"), pairAC.address);
      const estimation3 = await gdexZap.estimateZapInRebalancingSwap(
        tokenA.address,
        tokenC.address,
        parseEther("5"),
        parseEther("0"),
        pairAC.address
      );

      assert.equal(estimation2[0].toString(), estimation3[0].toString());
      assert.equal(estimation2[1].toString(), estimation3[1].toString());
    });

    it("Cannot zap if wrong direction/tokens used", async function () {
      await expectRevert(
        gdexZap.zapInToken(tokenA.address, parseEther("1"), pairBC.address, parseEther("0.51"), { from: carol }),
        "Zap: Wrong tokens"
      );
      await expectRevert(
        gdexZap.zapInBNB(pairAC.address, parseEther("0.51"), { from: carol, value: parseEther("0.51").toString() }),
        "Zap: Wrong tokens"
      );

      await expectRevert(
        gdexZap.zapOutToken(pairBC.address, tokenA.address, parseEther("0.51"), parseEther("0.51"), { from: carol }),
        "Zap: Token not in LP"
      );

      await expectRevert(
        gdexZap.zapOutBNB(pairAC.address, parseEther("0.51"), parseEther("0.51"), { from: carol }),
        "Zap: Token not in LP"
      );

      await expectRevert(
        gdexZap.zapInTokenRebalancing(
          tokenA.address,
          tokenC.address,
          parseEther("1"),
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol }
        ),
        "Zap: Wrong token0"
      );

      await expectRevert(
        gdexZap.zapInTokenRebalancing(
          tokenC.address,
          tokenA.address,
          parseEther("1"),
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol }
        ),
        "Zap: Wrong token1"
      );

      await expectRevert(
        gdexZap.zapInTokenRebalancing(
          tokenC.address,
          tokenC.address,
          parseEther("1"),
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol }
        ),
        "Zap: Same tokens"
      );

      await expectRevert(
        gdexZap.zapInBNBRebalancing(
          tokenC.address,
          parseEther("1"),
          pairAB.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol, value: parseEther("0.1").toString() }
        ),
        "Zap: Wrong token1"
      );
      await expectRevert(
        gdexZap.zapInBNBRebalancing(
          tokenA.address,
          parseEther("1"),
          pairAC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: carol, value: parseEther("0.1").toString() }
        ),
        "Zap: Wrong token0"
      );

      // David gets WBNB
      const result = await wrappedBNB.deposit({ from: david, value: parseEther("1").toString() });
      expectEvent(result, "Deposit", { dst: david, wad: parseEther("1").toString() });

      await expectRevert(
        gdexZap.zapInBNBRebalancing(
          wrappedBNB.address,
          parseEther("1"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          false,
          { from: david, value: parseEther("0.1").toString() }
        ),
        "Zap: Same tokens"
      );

      // TokenC (token0) > BNB (token1) --> sell token1 (should be false)
      await expectRevert(
        gdexZap.zapInBNBRebalancing(
          tokenC.address,
          parseEther("0.05"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: david, value: parseEther("0.0000000001").toString() }
        ),
        "Zap: Wrong trade direction"
      );

      // TokenC (token0) < BNB (token1) --> sell token0 (should be true)
      await expectRevert(
        gdexZap.zapInBNBRebalancing(
          tokenC.address,
          parseEther("0.0000000001"),
          pairBC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          false,
          { from: david, value: parseEther("0.05").toString() }
        ),
        "Zap: Wrong trade direction"
      );

      // TokenA (token0) > tokenC (token1) --> sell token0 (should be true)
      await expectRevert(
        gdexZap.zapInTokenRebalancing(
          tokenA.address,
          tokenC.address,
          parseEther("1"),
          parseEther("0"),
          pairAC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          false,
          { from: david }
        ),
        "Zap: Wrong trade direction"
      );

      // TokenA (token0) < tokenC (token1) --> sell token0 (should be true)
      await expectRevert(
        gdexZap.zapInTokenRebalancing(
          tokenA.address,
          tokenC.address,
          parseEther("0"),
          parseEther("1"),
          pairAC.address,
          parseEther("0.5"),
          parseEther("0.5"),
          true,
          { from: david }
        ),
        "Zap: Wrong trade direction"
      );
    });
  });
});
