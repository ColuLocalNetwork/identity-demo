require('dotenv').config()
const Web3 = require('web3')
const Constants = require('./constants')
const Contracts = require('./contracts')

const {
  RPC_PROVIDER,
  FUSE_ID_MANAGMENT_ACCOUNT_PRIVATE_KEY,
  FUSE_ID_CLAIM_ACCOUNT_PRIVATE_KEY,
  USER_ACCOUNT_PRIVATE_KEY,
  TOKEN_AND_SALE_ACCOUNT_PRIVATE_KEY
} = process.env

const web3 = new Web3(new Web3.providers.HttpProvider(RPC_PROVIDER))
Contracts.init(web3)

const claimHolderBuild = require('../build/contracts/ClaimHolder')
const superTokenBuild = require('../build/contracts/SuperToken')
const superTokenSaleBuild = require('../build/contracts/SuperTokenSale')

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
  const UserAccount = privateKeyToAddress(USER_ACCOUNT_PRIVATE_KEY)
  console.log(`UserAccount: ${UserAccount}`)

  // token & sale deployment account
  const TokenAndSaleDeploymentAccount = privateKeyToAddress(TOKEN_AND_SALE_ACCOUNT_PRIVATE_KEY)
  console.log(`TokenAndSaleDeploymentAccount: ${TokenAndSaleDeploymentAccount}`)

  let FuseIdManagementAccountNonce
  let UserAccountNonce
  let TokenAndSaleDeploymentAccountNonce

  /*********************************************************************************/
  console.log(`\n===== deploying FuseIdClaimHolder =====`)
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
  console.log(`\n===== FuseIdClaimAccount is adding a claim to FuseIdClaimHolder =====`)
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
  console.log(`\n===== deploying UserClaimHolder =====`)
  UserAccountNonce = await web3.eth.getTransactionCount(UserAccount)
  const UserClaimHolder = await Contracts.deploy(
    claimHolderBuild.abi,
    claimHolderBuild.bytecode,
    null,
    UserAccount,
    Buffer.from(USER_ACCOUNT_PRIVATE_KEY, 'hex'),
    UserAccountNonce
  )
  console.log(`UserClaimHolder: ${UserClaimHolder.options.address}`)

  /*********************************************************************************/
  console.log(`\n===== FuseIDClaimAccount signs a KYC claim for user to add to his ClaimHolder (after on/off chain process) =====`)
  const hexedData = web3.utils.asciiToHex('This guy is legit')
  const hashedDataToSign = web3.utils.soliditySha3(
    UserClaimHolder.options.address,
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
  console.log(`\n===== user adds the signed FuseID claim to his ClaimHolder =====`)
  const claimIssuer = FuseIdClaimHolder.options.address
  console.log(`claimIssuer: ${claimIssuer}`)
  const addClaimABI = await UserClaimHolder.methods.
    addClaim(
      Constants.CLAIM_TYPES.KYC,
      Constants.CLAIM_SCHEMES.ECDSA,
      claimIssuer,
      signatureObj.signature,
      hexedData,
      'https://www.fuse.io'
    ).encodeABI({
      from: UserAccount
    })

  const addClaimExecuteABI = await UserClaimHolder.methods.execute(
    UserClaimHolder.options.address,
    0,
    addClaimABI,
  ).encodeABI({
    from: UserAccount
  })

  UserAccountNonce = await web3.eth.getTransactionCount(UserAccount)
  const addClaimExecuteResult = await Contracts.call(
    addClaimExecuteABI,
    UserAccountNonce,
    UserClaimHolder.options.address,
    Buffer.from(USER_ACCOUNT_PRIVATE_KEY, 'hex')
  )

  /*********************************************************************************/
  console.log(`\n===== check the claim =====`)
  const kycClaimId = web3.utils.soliditySha3(claimIssuer, Constants.CLAIM_TYPES.KYC)
  console.log(`kycClaimId: ${kycClaimId}`)
  const theKycClaim = await UserClaimHolder.methods.getClaim(kycClaimId).call()
  console.log(`theKycClaim: ${JSON.stringify(theKycClaim)}`)

  /*********************************************************************************/
  console.log(`\n===== deploy SuperToken =====`)
  TokenAndSaleDeploymentAccountNonce = await web3.eth.getTransactionCount(TokenAndSaleDeploymentAccount)
  const superToken = await Contracts.deploy(
    superTokenBuild.abi,
    superTokenBuild.bytecode,
    [],
    TokenAndSaleDeploymentAccount,
    Buffer.from(TOKEN_AND_SALE_ACCOUNT_PRIVATE_KEY, 'hex'),
    TokenAndSaleDeploymentAccountNonce
  )
  console.log(`superToken: ${superToken.options.address}`)

  /*********************************************************************************/
  console.log(`\n===== deploy SuperTokenSale =====`)
  TokenAndSaleDeploymentAccountNonce = await web3.eth.getTransactionCount(TokenAndSaleDeploymentAccount)
  const superTokenSale = await Contracts.deploy(
    superTokenSaleBuild.abi,
    superTokenSaleBuild.bytecode,
    [10, TokenAndSaleDeploymentAccount, superToken.options.address, FuseIdClaimHolder.options.address],
    TokenAndSaleDeploymentAccount,
    Buffer.from(TOKEN_AND_SALE_ACCOUNT_PRIVATE_KEY, 'hex'),
    TokenAndSaleDeploymentAccountNonce
  )
  console.log(`superTokenSale: ${superTokenSale.options.address}`)

  /*********************************************************************************/
  console.log(`\n===== transfer SuperToken ownership to SuperTokenSale =====`)
  TokenAndSaleDeploymentAccountNonce = await web3.eth.getTransactionCount(TokenAndSaleDeploymentAccount)
  const transferOwnershipABI = await superToken.methods.transferOwnership(
    superTokenSale.options.address
  ).encodeABI({
    from: TokenAndSaleDeploymentAccount
  })
  const transferOwnershipResult = await Contracts.call(
    transferOwnershipABI,
    TokenAndSaleDeploymentAccountNonce,
    TokenAndSaleDeploymentAccount,
    Buffer.from(TOKEN_AND_SALE_ACCOUNT_PRIVATE_KEY, 'hex')
  )

  /*********************************************************************************/
  console.log(`\n===== user buys the SuperToken from the SuperTokenSale (which will check the KYC claim) =====`)

  const initialBalance = await superToken.methods.balanceOf(UserAccount).call()
  console.log(`\tUser initial balance: ${initialBalance}`)

  const buyTokensABI = await superTokenSale.methods.buyTokens(
    UserClaimHolder.options.address
  ).encodeABI({
    from: UserAccount
  })
  console.log(`buyTokensABI: ${buyTokensABI}`)
  const buyTokensExecuteABI = await UserClaimHolder.methods.execute(
    superTokenSale.options.address,
    web3.utils.toWei('1', 'ether'),
    buyTokensABI
  ).encodeABI({
    from: UserAccount
  })
  console.log(`buyTokensExecuteABI: ${buyTokensExecuteABI}`)
  UserAccountNonce = await web3.eth.getTransactionCount(UserAccount)
  const buyTokensExecuteResult = await Contracts.call(
    buyTokensExecuteABI,
    UserAccountNonce,
    UserClaimHolder.options.address,
    Buffer.from(USER_ACCOUNT_PRIVATE_KEY, 'hex')
  )

  const userAccountNewBalance = await superToken.methods.balanceOf(UserAccount).call()
  console.log(`\tUser new balance: ${userAccountNewBalance}`)
  const userClaimHolderNewBalance = await superToken.methods.balanceOf(UserClaimHolder.options.address).call()
  console.log(`\tUserClaimHolder new balance: ${userClaimHolderNewBalance}`)
}

main()
