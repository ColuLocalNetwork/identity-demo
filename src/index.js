require('dotenv').config()
const Web3 = require('web3')
const Constants = require('./constants')
const Contracts = require('./contracts')

const {
  RPC_PROVIDER,
  FUSE_ID_MANAGMENT_ACCOUNT_PRIVATE_KEY,
  FUSE_ID_CLAIM_ACCOUNT_PRIVATE_KEY,
  USER_ACCOUNT_PRIVATE_KEY,
  GAS_LIMIT
} = process.env

const web3 = new Web3(new Web3.providers.HttpProvider(RPC_PROVIDER))
Contracts.init(web3)

const claimHolderBuild = require('../build/contracts/ClaimHolder')
const counterBuild = require('../build/contracts/Counter')

const privateKeyToAddress = (privateKey) => {
  const add0xPrefix = (s) => s.indexOf('0x') === 0 ? s : `0x${s}`
  return privateKey ? new Web3().eth.accounts.privateKeyToAccount(add0xPrefix(privateKey)).address : null
}

const main = async () => {
  console.log(`\n===== accounts =====`)
   // fuse id management account
  const FuseIdManagementAccount = privateKeyToAddress(FUSE_ID_MANAGMENT_ACCOUNT_PRIVATE_KEY)
  console.log(`FuseIdManagementAccount: ${FuseIdManagementAccount}`)

  // fuse id signing claim account
  const FuseIdClaimAccount = privateKeyToAddress(FUSE_ID_CLAIM_ACCOUNT_PRIVATE_KEY)
  console.log(`FuseIdClaimAccount: ${FuseIdClaimAccount}`)

  // user account
  const userAccount = privateKeyToAddress(USER_ACCOUNT_PRIVATE_KEY)
  console.log(`userAccount: ${userAccount}`)

  let FuseIdManagementAccountNonce
  let userAccountNonce

  /*********************************************************************************/
  console.log(`\n===== fuse id deploying a ClaimHolder =====`)
  FuseIdManagementAccountNonce = await web3.eth.getTransactionCount(FuseIdManagementAccount)
  const FuseIdClaimHolder = await Contracts.deploy(
    claimHolderBuild.abi,
    claimHolderBuild.bytecode,
    null,
    FuseIdManagementAccount,
    Buffer.from(FUSE_ID_MANAGMENT_ACCOUNT_PRIVATE_KEY, 'hex'),
    FuseIdManagementAccountNonce
  )
  console.log(`FuseIdClaimHolder: ${FuseIdClaimHolder.options.address}`)

  /*********************************************************************************/
  console.log(`\n===== fuse id claim account is adding a claim to ClaimHolder =====`)
  const FuseIdClaimKey = web3.utils.keccak256(FuseIdClaimAccount)
  console.log(`FuseIdClaimKey: ${FuseIdClaimKey}`)
  const addKeyABI = await FuseIdClaimHolder.methods
    .addKey(
      FuseIdClaimKey,
      Constants.KEY_PURPOSES.CLAIM,
      Constants.KEY_TYPES.ECDSA
    )
    .encodeABI({
      from: FuseIdManagementAccount
    })
  FuseIdManagementAccountNonce = await web3.eth.getTransactionCount(FuseIdManagementAccount)
  const addKeyResult = await Contracts.call(
    addKeyABI,
    FuseIdManagementAccountNonce,
    FuseIdClaimHolder.options.address,
    Buffer.from(FUSE_ID_MANAGMENT_ACCOUNT_PRIVATE_KEY, 'hex')
  )

  /*********************************************************************************/
  console.log(`\n===== user deploying a ClaimHolder =====`)
  userAccountNonce = await web3.eth.getTransactionCount(userAccount)
  const userClaimHolder = await Contracts.deploy(
    claimHolderBuild.abi,
    claimHolderBuild.bytecode,
    null,
    userAccount,
    Buffer.from(USER_ACCOUNT_PRIVATE_KEY, 'hex'),
    userAccountNonce
  )
  console.log(`userClaimHolder: ${userClaimHolder.options.address}`)

  /*********************************************************************************/
  console.log(`\n===== fuse id signs a KYC claim for user to add to his ClaimHolder (after on/off chain process) =====`)
  const hexedData = web3.utils.asciiToHex('This guy is legit')
  const hashedDataToSign = web3.utils.soliditySha3(
    userClaimHolder.options.address,
    Constants.CLAIM_TYPES.KYC,
    hexedData,
  )
  const FuseIdClaimAccountWallet = await web3.eth.accounts.wallet.add(FUSE_ID_CLAIM_ACCOUNT_PRIVATE_KEY)
  const signatureObj = await FuseIdClaimAccountWallet.sign(
    hashedDataToSign,
    FuseIdClaimAccount
  )
  console.log(`signatureObj: ${JSON.stringify(signatureObj)}`)

  /*********************************************************************************/
  console.log(`\n===== user adds the signed fuse ID claim to his ClaimHolder =====`)
  const claimIssuer = FuseIdClaimHolder.options.address
  console.log(`claimIssuer: ${claimIssuer}`)
  const addClaimABI = await userClaimHolder.methods.
    addClaim(
      Constants.CLAIM_TYPES.KYC,
      Constants.CLAIM_SCHEMES.ECDSA,
      claimIssuer,
      signatureObj.signature,
      hexedData,
      'https://www.fuse.io'
    ).encodeABI({
      from: userAccount
    })
  userAccountNonce = await web3.eth.getTransactionCount(userAccount)
  const addClaimResult = await Contracts.call(
    addClaimABI,
    userAccountNonce,
    userClaimHolder.options.address,
    Buffer.from(USER_ACCOUNT_PRIVATE_KEY, 'hex')
  )

  /*********************************************************************************/
  console.log(`\n===== check the claim =====`)
  const kycClaimId = web3.utils.soliditySha3(claimIssuer, Constants.CLAIM_TYPES.KYC)
  console.log(`kycClaimId: ${kycClaimId}`)
  const theKycClaim = await userClaimHolder.methods.getClaim(kycClaimId).call()
  console.log(`theKycClaim: ${JSON.stringify(theKycClaim)}`)

  /*********************************************************************************/
  console.log(`\n===== deploy Counter =====`)
  nonce = await web3.eth.getTransactionCount(FuseIdManagementAccount)
  const counter = await Contracts.deploy(
    counterBuild.abi,
    counterBuild.bytecode,
    [FuseIdClaimHolder.options.address],
    FuseIdManagementAccount,
    Buffer.from(FUSE_ID_MANAGMENT_ACCOUNT_PRIVATE_KEY, 'hex'),
    nonce
  )
  console.log(`counter: ${counter.options.address}`)

  /*********************************************************************************/
  console.log(`\n===== increment Counter =====`)
  const incrCounterABI = await counter.methods.incrementCounter().encodeABI()
  const executeABI = await userClaimHolder.methods.execute(
    counter.options.address,
    web3.utils.toWei('0', 'ether'),
    incrCounterABI
  ).encodeABI({
    from: userAccount
  })
  userAccountNonce = await web3.eth.getTransactionCount(userAccount)
  const executeResult = await Contracts.call(
    executeABI,
    userAccountNonce,
    userClaimHolder.options.address,
    Buffer.from(USER_ACCOUNT_PRIVATE_KEY, 'hex')
  )
}

main()
