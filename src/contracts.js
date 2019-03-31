require('dotenv').config()
const Tx = require('ethereumjs-tx')
const Web3Utils = require('web3-utils')
const fetch = require('node-fetch')
const assert = require('assert')

let web3

const {
  RPC_PROVIDER,
  GAS_PRICE,
  GAS_LIMIT,
  GET_RECEIPT_TIMEOUT
} = process.env

const sendRawTx = async ({ data, nonce, to, privateKey, url, gasPrice, gasLimit, value }) => {
  try {
    const rawTx = {
      nonce,
      gasPrice: Web3Utils.toHex(gasPrice),
      gasLimit: Web3Utils.toHex(gasLimit),
      to,
      data,
      value
    }

    const tx = new Tx(rawTx)
    tx.sign(privateKey)
    const serializedTx = tx.serialize()
    const txHash = await sendNodeRequest(
      url,
      'eth_sendRawTransaction',
      `0x${serializedTx.toString('hex')}`
    )
    console.log('pending txHash', txHash)
    const receipt = await getReceipt(txHash, url)
    return receipt
  } catch (e) {
    console.error(e)
  }
}

const sendNodeRequest = async (url, method, signedData) => {
  const request = await fetch(url, {
    headers: {
      'Content-type': 'application/json'
    },
    method: 'POST',
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params: [signedData],
      id: 1
    })
  })
  const json = await request.json()
  if (method === 'eth_sendRawTransaction') {
    assert.strictEqual(json.result.length, 66, `Tx wasn't sent ${json}`)
  }
  return json.result
}

const timeout = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const getReceipt = async (txHash, url) => {
  await timeout(GET_RECEIPT_TIMEOUT)
  let receipt = await sendNodeRequest(url, 'eth_getTransactionReceipt', txHash)
  if (receipt === null || receipt.blockNumber === null) {
    receipt = await getReceipt(txHash, url)
  }
  return receipt
}

module.exports = {
  init: (_web3) => (web3 = _web3),
  deploy: async (abi, bytecode, constructorArgs, from, privateKey, nonce) => {
    const instance = new web3.eth.Contract(abi, { from })
    const result = await instance
      .deploy({
        data: bytecode,
        arguments: constructorArgs
      })
      .encodeABI()
    const tx = await sendRawTx({
      data: result,
      nonce: Web3Utils.toHex(nonce),
      to: null,
      privateKey: Buffer.from(privateKey, 'hex'),
      url: RPC_PROVIDER,
      gasPrice: GAS_PRICE,
      gasLimit: GAS_LIMIT
    })
    if (Web3Utils.hexToNumber(tx.status) !== 1) {
      throw new Error('Tx failed')
    }
    instance.options.address = tx.contractAddress
    instance.deployedBlockNumber = tx.blockNumber
    return instance
  },
  call: async (data, value, nonce, contractAddress, privateKey) => {
    const opts = {
      data: data,
      nonce: nonce,
      to: contractAddress,
      privateKey: Buffer.from(privateKey, 'hex'),
      url: RPC_PROVIDER,
      gasPrice: GAS_PRICE,
      gasLimit: GAS_LIMIT
    }
    if (value) opts.value = Buffer.from(value.toString(), 'hex')
    const result = await sendRawTx(opts)
    assert.equal(Web3Utils.hexToNumber(result.status), 1, 'Transaction Failed')
  }
}
