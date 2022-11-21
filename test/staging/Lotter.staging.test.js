const { ethers, deployments, getNamedAccounts, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-config");
const { assert, expect } = require("chai");

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery staging tests", async () => {
      let lottery, deployer, enteranceFee;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        // before every test deploy our contracts
        // get the deployer account from getNamedAccount ( which come from hardhat-config)

        deployer = (await getNamedAccounts()).deployer;
        // deploy all our contracts

        lottery = await ethers.getContract("Lottery", deployer);

        enteranceFee = await lottery.getEnteranceFee();
      });
      describe("fulfillRandomWords", () => {
        it("works with live chainlink keepers and chainlink vrf, we get a random winner", async () => {
          // enter the lottery
          const startingTimeStamp = await lottery.getLastTimeStamp();
          accounts = await ethers.getSigners();
          // set up the listener first
          await new Promise(async (resolve, reject) => {
            // listen for WinnerPicked event
            lottery.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired!");
              try {
                // put assert here
                console.log(deployer);
                const recentWinner = await lottery.getRecentWinner();
                const lotteryState = await lottery.getLotteryState();
                const winnerEndingBalance = await accounts[0].getBalance();
                const endingTimeStamp = await lottery.getLastTimeStamp();

                await expect(lottery.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(lotteryState, 0);

                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(enteranceFee).toString()
                );
                assert(endingTimeStamp > startingTimeStamp);
                resolve();
              } catch (error) {
                console.log(error);
                reject(error);
              }
            });
            console.log("Entering lottery...");
            const tx = await lottery.enterLottery({ value: enteranceFee });
            // never forget the await! Spend 2 days for that.
            await tx.wait(1);
            console.log("EnteranceFee paid!");
            const winnerStartingBalance = await accounts[0].getBalance();
          });
        });
      });
    });
