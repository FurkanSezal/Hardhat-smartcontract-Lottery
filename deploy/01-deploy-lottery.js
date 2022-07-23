const { network, ethers, deployments } = require("hardhat");
const { developmentChains, networkConfig } = require("../helper-config");
const { verify } = require("./../utils/verify");

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2");
module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const chainId = network.config.chainId;

  let VRFCoordinatorV2Address, subscriptionId;
  if (developmentChains.includes(network.name)) {
    const VRFCoordinatorV2Mock = await ethers.getContract(
      "VRFCoordinatorV2Mock"
    );
    VRFCoordinatorV2Address = VRFCoordinatorV2Mock.address;
    const tx = await VRFCoordinatorV2Mock.createSubscription();
    tx_receipt = await tx.wait(1);
    subscriptionId = tx_receipt.events[0].args.subId;
    await VRFCoordinatorV2Mock.fundSubscription(
      subscriptionId,
      VRF_SUB_FUND_AMOUNT
    );
  } else {
    VRFCoordinatorV2Address = networkConfig[chainId]["vrfCoordinatorV2"];
    subscriptionId = networkConfig[chainId]["subscriptionId"];
  }

  const enteranceFee = networkConfig[chainId]["enteranceFee"];
  const keyhash = networkConfig[chainId]["keyhash"];
  const callBackGasLimit = networkConfig[chainId]["callbackGasLimit"];
  const interval = networkConfig[chainId]["interval"];

  args = [
    VRFCoordinatorV2Address,
    enteranceFee,
    keyhash,
    subscriptionId,
    callBackGasLimit,
    interval,
  ];

  const lottery = await deploy("Lottery", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: network.config.blockConfirmations || 1,
  });

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verifying...");
    await verify(lottery.address, args);
  }
  log("----------------------------------------");
};

module.exports.tags = ["all", "lottery"];
