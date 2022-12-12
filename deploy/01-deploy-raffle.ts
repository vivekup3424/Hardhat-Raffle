import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { ethers } from "hardhat";
import verify from "../utils/verify";
import {
    networkConfig,
    developmentChains,
    VERIFICATION_BLOCK_CONFIRMATIONS,
} from "../helper-hardhat-config";
import { VRFCoordinatorV2Mock, Raffle } from "../typechain-types";
const FUND_AMOUNT = ethers.utils.parseEther("1").toString();

const deployRaffle: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
    const { deployments, getNamedAccounts, network } = hre;
    const { deployer } = await getNamedAccounts();
    const { log, deploy } = deployments;
    const chainId = network.config.chainId!;
    let vrfCoordinatorV2Address: string,
        subscriptionId: string,
        vrfCoordinatorV2Mock: VRFCoordinatorV2Mock;

    if (chainId == 31337) {
        vrfCoordinatorV2Mock = await ethers.getContract(
            "VRFCoordinatorV2Mock",
            deployer
        );
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;

        const transactionResponse =
            await vrfCoordinatorV2Mock.createSubscription();
        const transactionReceipt = await transactionResponse.wait(1);

        //@ts-ignore
        subscriptionId = transactionReceipt.events[0].args.subId;
        //Fund the transaction
        //Our project makes it so we don't have to worry about sending fund
        await vrfCoordinatorV2Mock.fundSubscription(
            subscriptionId,
            FUND_AMOUNT
        );
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId].vrfCoordinatorV2!;
        subscriptionId = networkConfig[chainId].subscriptionId!;
    }

    const waitBlockConfirmations = developmentChains.includes(network.name)
        ? 1
        : VERIFICATION_BLOCK_CONFIRMATIONS; //ternary assignment

    log("-----------------------------------------------------");

    const args: any[] = [
        vrfCoordinatorV2Address,
        subscriptionId,
        networkConfig[chainId].gasLane,
        networkConfig[chainId].keepersUpdateInterval,
        networkConfig[chainId].raffleEntranceFee,
        networkConfig[chainId].callbackGasLimit,
    ];

    //Deploy the raffle Contract
    const raffle = await deploy("Raffle", {
        from: deployer,
        args: args,
        log: true,
        waitConfirmations: waitBlockConfirmations,
    });

    // Ensure the Raffle contract is a valid consumer of the VRFCoordinatorV2Mock contract.
    if (developmentChains.includes(network.name)) {
        const vrfCoordinatorV2Mock = await ethers.getContract(
            "VRFCoordinatorV2Mock"
        );
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, raffle.address);
    }

    //Verify the deployment of Raffle Contract
    if (
        !developmentChains.includes(network.name) &&
        process.env.ETHERSCAN_API_KEY
    ) {
        log("Verifying...");
        await verify(raffle.address, args);
    }
    log("Run Price Feed contract with command:");
    const networkName = network.name == "hardhat" ? "localhost" : network.name;
    log(`yarn hardhat run scripts/enterRaffle.js --network ${networkName}`);
    log("----------------------------------------------------");
};
export default deployRaffle;
deployRaffle.tags = ["all", "raffle"];
