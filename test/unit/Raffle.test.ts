import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { assert, expect } from "chai";
import { BigNumber } from "ethers";
import { network, getNamedAccounts, deployments, ethers } from "hardhat";
import { developmentChains, networkConfig } from "../../helper-hardhat-config";
import { Raffle, VRFCoordinatorV2Mock } from "../../typechain-types";

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", () => {
          let raffle: Raffle,
              raffleContract: Raffle,
              vrfCoordinatorV2Mock: VRFCoordinatorV2Mock,
              raffleEntranceFee: BigNumber,
              interval: BigNumber,
              player: SignerWithAddress,
              accounts: SignerWithAddress[],
              chainId: number;
          beforeEach(async () => {
              accounts = await ethers.getSigners();
              const deployer = accounts[0];
              player = accounts[1];
              await deployments.fixture(["mocks", "raffle"]); // Deploys modules with the tags "mocks" and "raffle"
              vrfCoordinatorV2Mock = await ethers.getContract(
                  "VRFCoordinatorV2Mock"
              ); // Returns a new connection to the VRFCoordinatorV2Mock contract
              raffleContract = await ethers.getContract("Raffle"); // Returns a new connection to the Raffle contract
              raffle = raffleContract.connect(player); // Returns a new instance of the Raffle contract connected to player
              raffleEntranceFee = await raffle.getEntranceFee();
              interval = await raffle.getInterval();
              chainId = network.config.chainId!;
          });
          describe("constructor", () => {
              it("initializes the raffle correctly", async () => {
                  console.log(`Chain ID = ${chainId}`);
                  // Ideally, we'd separate these out so that only 1 assert per "it" block
                  // And ideally, we'd make this check everything
                  const raffleState = (
                      await raffle.getRaffleState()
                  ).toString();
                  assert.equal(raffleState, "0");
                  assert.equal(
                      interval.toString(),
                      networkConfig[chainId].keepersUpdateInterval
                  );
              });
          });
          describe("enterRaffle", () => {
              it("reverts when you don't pay enough", async () => {
                  await expect(raffle.enterRaffle()).to.be.revertedWith(
                      "Raffle__SendMoreToEnterRaffle"
                  );
              });
              it("records player when they enter", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  const contractPlayer = await raffle.getPlayer(0);
                  assert.equal(player.address, contractPlayer);
              });
              it("emits event on enter", async () => {
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.emit(raffle, "RaffleEnter");
              });
              it("doesn't allow entrance when raffle is calculating", async () => {
                  console.log(1);
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  console.log(2);
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  console.log(3);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  console.log(4);
                  // we pretend to be a keeper for a second
                  await raffle.performUpkeep([]);
                  console.log(5);
                  await expect(
                      raffle.enterRaffle({ value: raffleEntranceFee })
                  ).to.be.revertedWith("Raffle__RaffleNotOpen");
              });
          });
          describe("checkUpKeep", () => {
              it("returns false if people haven't sent any ETH", async () => {
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  ); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded);
              });
              it("returns false if raffle isn't open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  await raffle.performUpkeep([]); // changes the state to calculating
                  const raffleState = await raffle.getRaffleState(); // stores the new state
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  ); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert.equal(
                      raffleState.toString() == "1",
                      upkeepNeeded == false
                  );
              });
              it("returns false if enough time hasn't passed", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() - 5,
                  ]); // use a higher number here if this test fails
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  ); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded);
              });
              it("returns true if enough time has passed, has players, eth, and is open", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  const { upkeepNeeded } = await raffle.callStatic.checkUpkeep(
                      "0x"
                  ); // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded);
              });
          });
          describe("performUpKeep", () => {
              it("performUpKeep can on run when checkUpKeep is true", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  const tx = await raffle.performUpkeep([]);
                  assert(tx);
              });
              it("it reverts when checkUpKeep is false", async () => {
                  await expect(raffle.performUpkeep([])).to.be.revertedWith(
                      "Raffle__UpkeepNotNeeded"
                  );
              });
              it("updates the raffle state and emits a requestId", async () => {
                  // Too many asserts in this test!
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  const txResponse = await raffle.performUpkeep("0x"); // emits requestId
                  const txReceipt = await txResponse.wait(1); // waits 1 block
                  const raffleState = await raffle.getRaffleState(); // updates state
                  //@ts-ignore
                  const requestId = txReceipt.events[1].args.requestId;
                  assert(requestId.toNumber() > 0);
                  assert(raffleState == 1); // 0 = open, 1 = calculating
              });
              it("updates the raffle state, calls an event and calls the vrfCoodinator", async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
                  const txResponse = await raffle.performUpkeep("0x");
                  const txReceipt = await txResponse.wait(1);
                  const raffleState = await raffle.getRaffleState(); //updates the state
                  const requsetId = txReceipt.events![1].args!.requestId;
                  assert(requsetId.toNumber() > 0);
                  assert.equal(raffleState, 1);
              });
          });
          describe("fulfillRandomWords", () => {
              beforeEach(async () => {
                  await raffle.enterRaffle({ value: raffleEntranceFee });
                  await network.provider.send("evm_increaseTime", [
                      interval.toNumber() + 1,
                  ]);
                  await network.provider.request({
                      method: "evm_mine",
                      params: [],
                  });
              });
              it("can only be called after performUpKeep", async () => {
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
                  await expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
                  ).to.be.revertedWith("nonexistent request");
              });
              it("it takes a winner,resets a lottery,and sends money", async () => {
                  const additionalEntrants = 3; //additional people who are entering this lottery
                  const startingAccountIndex = 2; //deployer = 0
                  for (
                      let i = startingAccountIndex;
                      i < additionalEntrants + startingAccountIndex;
                      i++
                  ) {
                      raffle = raffleContract.connect(accounts[i]);
                      await raffle.enterRaffle({ value: raffleEntranceFee });
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp();
                  //performUpKeep(mock being chainlink keepers)
                  //fulfillrandomwords (mock being chainlink vrf)
                  //We will have to wait for fulfillRandomWords to be called
                  await new Promise<void>(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked Event fired!!");
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              // Now lets get the ending values...
                              const recentWinner =
                                  await raffle.getRecentWinner();
                              //some random console logging
                              console.log(`Recent Winner = ${recentWinner}`);
                              for (
                                  let i = startingAccountIndex;
                                  i < startingAccountIndex + additionalEntrants;
                                  i++
                              ) {
                                  console.log(accounts[i]);
                              }

                              const raffleState = await raffle.getRaffleState();
                              const winnerBalance =
                                  await accounts[2].getBalance();
                              const endingTimeStamp =
                                  await raffle.getLastTimeStamp();
                              await expect(raffle.getPlayer(0)).to.be.reverted;
                              assert.equal(
                                  recentWinner.toString(),
                                  accounts[2].address
                              );
                              assert.equal(raffleState, 0);
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrants)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              );
                              assert(endingTimeStamp > startingTimeStamp);
                              resolve();
                          } catch (e) {
                              reject(e);
                          }
                      });
                      //Setting up the listener
                      //below,we will fire the event ,and the listener will
                      //pick it up and resolve
                      // kicking off the event by mocking the chainlink keepers and vrf coordinator
                      const txResponse = await raffle.performUpkeep("0x");
                      const txReceipt = txResponse.wait(1);
                      const startingBalance = await accounts[2].getBalance();
                      await vrfCoordinatorV2Mock.fulfillRandomWords(
                          (
                              await txReceipt
                          ).events![1].args!.requestId,
                          raffle.address
                      );
                  });
              });
          });
      });
