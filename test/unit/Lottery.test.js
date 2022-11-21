const { ethers, deployments, getNamedAccounts, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-config");
const { assert, expect } = require("chai");

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Lottery unit tests", async () => {
      let lottery, vrfCoordinatorMock, deployer, enteranceFee, interval;
      const chainId = network.config.chainId;

      beforeEach(async () => {
        // before every test deploy our contracts
        // get the deployer account from getNamedAccount ( which come from hardhat-config)
        accounts = await ethers.getSigners();
        deployer = (await getNamedAccounts()).deployer;
        console.log(deployer);
        // deploy all our contracts
        await deployments.fixture("all");
        lottery = await ethers.getContract("Lottery", deployer);
        vrfCoordinatorMock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        enteranceFee = await lottery.getEnteranceFee();
        interval = await lottery.getInterval();
      });
      describe("constructor", async () => {
        it("Initializes the lottery correctly", async () => {
          const lotteryState = await lottery.getLotteryState();

          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
          assert.equal(lotteryState.toString(), "0");
        });
      });
      describe("enter lottery", async () => {
        it("revert when you dont pay enough", async () => {
          await expect(lottery.enterLottery()).to.be.revertedWith(
            "Lottery__NotEnoughEthEntered"
          );
        });
        it("record players when they enter", async () => {
          await lottery.enterLottery({ value: enteranceFee });
          const playerFromContract = await lottery.getPlayer(0);
          assert.equal(playerFromContract, deployer);
        });
        it("emits event on enter", async () => {
          await expect(lottery.enterLottery({ value: enteranceFee })).to.emit(
            lottery,
            "enteredLottery"
          );
        });
        it("doesnt allow entrance when lottery is not open", async () => {
          // to change lottery.state we must call the performUpkeep function
          // to call performUpkeep we must call checkUpkeep function

          await lottery.enterLottery({ value: enteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await lottery.performUpkeep([]);
          await expect(
            lottery.enterLottery({ value: enteranceFee })
          ).to.be.revertedWith("Lottery__LotteryIsNotOpen");
        });
      });
      describe("checkUpKeep", async () => {
        it("return false if people havent sent any ETH", async () => {
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          // normally calling checkUpKeep make a transaction
          // but We dont want to make a transaction
          // we want to simulate a transaction
          // so we use that callStatic
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert(!upkeepNeeded);
        });
        it("returns false if lottery isnt open", async () => {
          await lottery.enterLottery({ value: enteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          await lottery.performUpkeep([]);

          const lotteryState = await lottery.getLotteryState();
          const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
          assert.equal(lotteryState.toString(), "1");
          assert.equal(upkeepNeeded, false);
        });
      });
      describe("performUpKeep", async () => {
        it("it can only run if checkupkeep is true", async () => {
          await lottery.enterLottery({ value: enteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const tx = await lottery.performUpkeep([]);

          assert(tx);
        });
        it("it reverts when checkupkeep is false", async () => {
          await expect(lottery.performUpkeep([])).to.be.revertedWith(
            "Lottery__UpkeepNotNeeded"
          );
        });
        it("uptates the lottery state,emit and events, and call the vrfcoordinator", async () => {
          await lottery.enterLottery({ value: enteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
          const tx_response = await lottery.performUpkeep([]);
          const tx_receipt = await tx_response.wait(1);

          const requestId = tx_receipt.events[1].args.requestId;
          const lotteryState = await lottery.getLotteryState();

          assert(requestId.toNumber() > 0);
          assert(lotteryState == 1);
        });
      });

      describe("fulfillRandomWords", async () => {
        beforeEach(async () => {
          await lottery.enterLottery({ value: enteranceFee });
          await network.provider.send("evm_increaseTime", [
            interval.toNumber() + 1,
          ]);
          await network.provider.request({ method: "evm_mine", params: [] });
        });
        it("can only be called after performUpKeep", async function () {
          await expect(
            vrfCoordinatorMock.fulfillRandomWords(0, lottery.address)
          ).to.be.revertedWith("nonexistent request");
          await expect(
            vrfCoordinatorMock.fulfillRandomWords(1, lottery.address)
          ).to.be.revertedWith("nonexistent request");
        });

        it("picks a winner, reset the lottery, and send the money", async () => {
          const extraPlayers = 3;
          const startingAccountIndex = 1; // deployer
          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + extraPlayers;
            i++
          ) {
            const accountConnectedLottery = lottery.connect(accounts[i]);
            await accountConnectedLottery.enterLottery({ value: enteranceFee });
          }

          const startingTimeStamp = await lottery.getLastTimeStamp();

          // mock the performUpKeep ( chainlink keepers)

          // all this promise think do : listen to winnerpicked event
          await new Promise(async (resolve, reject) => {
            lottery.once("WinnerPicked", async () => {
              console.log("Found the event");
              try {
                const recentWinner = await lottery.getRecentWinner();
                const lotteryState = await lottery.getLotteryState();
                const endingTimeStamp = await lottery.getLastTimeStamp();
                const numPlayers = await lottery.getNumberOfPlayers();
                const winnerEndingBalance = await accounts[1].getBalance();

                assert.equal(numPlayers.toString(), "0");
                assert.equal(lotteryState.toString(), "0");

                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(enteranceFee.mul(extraPlayers + 1))
                );

                assert(endingTimeStamp > startingTimeStamp);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
            const tx = await lottery.performUpkeep([]);
            const tx_receipt = await tx.wait(1);

            const winnerStartingBalance = await accounts[1].getBalance();
            await vrfCoordinatorMock.fulfillRandomWords(
              tx_receipt.events[1].args.requestId,
              lottery.address
            );
          });
        });
      });
    });
