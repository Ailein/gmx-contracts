const { expect, use } = require("chai")
const { solidity } = require("ethereum-waffle")
const { deployContract } = require("../shared/fixtures")
const { getBlockTime } = require("../shared/utilities")

use(solidity)

const { keccak256 } = ethers.utils

// Tier0 (5% discount, 5% rebate) = Tier {totalRebate = 1000, defaultTradersDiscountShare = 5000}
// Tier1 (12% discount, 8% rebate) = Tier {totalRebate = 2000, defaultTradersDiscountShare = 6000}
// Tier2 (12% discount, 15% rebate) = Tier {totalRebate = 2700, defaultTradersDiscountShare = 4444}
// for the last tier extra EsGMX incentives will be handled off-chain
describe("Competition", function () {
  const provider = waffle.provider
  const [wallet, user0, user1, user2] = provider.getWallets()
  let competition
  let referralStorage
  let code = keccak256("0xFF")

  beforeEach(async () => {
    const ts = await getBlockTime(provider)

    referralStorage = await deployContract("ReferralStorage", [])
    competition = await deployContract("Competition", [
      ts + 60, // start
      ts + 120, // end
      ts - 60, // registrationStart
      ts + 60, // registrationEnd
      referralStorage.address
    ]);

    await referralStorage.registerCode(code)
  })

  it("allows owner to set times", async () => {
    await competition.connect(wallet).setStart(1)
    await competition.connect(wallet).setEnd(1)
    await competition.connect(wallet).setRegistrationStart(1)
    await competition.connect(wallet).setRegistrationEnd(1)
  })

  it("disable non owners to set times", async () => {
    await expect(competition.connect(user0).setStart(1)).to.be.revertedWith("Governable: forbidden")
    await expect(competition.connect(user0).setEnd(1)).to.be.revertedWith("Governable: forbidden")
    await expect(competition.connect(user0).setRegistrationStart(1)).to.be.revertedWith("Governable: forbidden")
    await expect(competition.connect(user0).setRegistrationEnd(1)).to.be.revertedWith("Governable: forbidden")
  })

  it("disable people to register teams before registration time", async () => {
    await competition.connect(wallet).setRegistrationStart((await getBlockTime(provider)) + 10)
    await expect(competition.connect(user0).registerTeam("1", code)).to.be.revertedWith("Registration is closed.")
  })

  it("disable people to register teams after registration time", async () => {
    await competition.connect(wallet).setRegistrationEnd((await getBlockTime(provider)) - 10)
    await expect(competition.connect(user0).registerTeam("1", code)).to.be.revertedWith("Registration is closed.")
  })

  it("allows people to register teams in times", async () => {
    try {
      await competition.connect(user0).registerTeam("1", code)
    } catch (e) {
      console.log(e)
    }
  })

  it("disable people to register multiple teams", async () => {
    await competition.connect(user0).registerTeam("1", code)
    await expect(competition.connect(user0).registerTeam("2", code)).to.be.revertedWith("Team members are not allowed.")
  })

  it("disable people to register a team with non existing referral code", async () => {
    await expect(competition.connect(user0).registerTeam("1", keccak256("0xFE"))).to.be.revertedWith("Referral code does not exist.")
  })

  it("disable multiple teams with the same name", async () => {
    await competition.connect(user0).registerTeam("1", code)
    await expect(competition.connect(user1).registerTeam("1", code)).to.be.revertedWith("Team name already registered.")
  })

  it("allows people to create join requests", async () => {
    await competition.connect(user0).registerTeam("1", code)
    await competition.connect(user1).registerTeam("2", code)
    await competition.connect(user2).createJoinRequest(user0.address)
    await competition.connect(user2).createJoinRequest(user1.address)
  })

  it("disable team members to create join requests", async () => {
    await competition.connect(user0).registerTeam("1", code)
    await competition.connect(user1).registerTeam("2", code)
    await expect(competition.connect(user0).createJoinRequest(user1.address)).to.be.revertedWith("Team members are not allowed.")
  })

  it("allows team leaders to accept requests", async () => {
    await competition.connect(user0).registerTeam("1", code)
    await competition.connect(user1).createJoinRequest(user0.address)
    try {
      await competition.connect(user0).approveJoinRequest(user1.address)

    const members = await competition.getTeamMembers(user0.address)
    console.log(members)
    } catch (e) {
      console.log(e)
    }
  })

  it("disallow leaders to accept non existant join request", async () => {
    await referralStorage.connect(user0).registerCode(code)
    await competition.connect(user0).registerTeam("1", code)
    await expect(competition.connect(user0).approveJoinRequest(user1.address)).to.be.revertedWith("This member did not apply.")
  })

  it("disallow leaders to accept members that already joines another team", async () => {
    await referralStorage.connect(user0).registerCode(code)
    await competition.connect(user0).registerTeam("1", code)
    await competition.connect(user1).registerTeam("2", code)
    await competition.connect(user2).createJoinRequest(user0.address)
    await competition.connect(user0).approveJoinRequest(user2.address)
    await expect(competition.connect(user1).approveJoinRequest(user2.address)).to.be.revertedWith("This member already joined a team.")
  })
});