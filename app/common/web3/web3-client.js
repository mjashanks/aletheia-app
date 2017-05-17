const Web3 = require('web3')
const EventEmitter = require('events').EventEmitter
const config = require('config')
const EncodingHelper = require('../encoding-helper')
const Web3Helper = require('./web3-helper')
const contract = require('truffle-contract')
const SubmittedPapersIndexJson = require('../../../build/contracts/SubmittedPapersIndex.json')

// TODO: implement all methods in a nonblocking way, or use another means to prevent blocking the UI thread.
class Web3Client extends EventEmitter {
  static instance (web3Url, pollIntervalMs, submittedPapersIndexAddress) {
    const provider = new Web3.providers.HttpProvider(web3Url)
    const indexContract = contract(SubmittedPapersIndexJson)
    indexContract.setProvider(provider)
    return indexContract.at(submittedPapersIndexAddress).then((indexInstance) => {
      return this({
        web3Provider: provider,
        pollIntervalMs,
        submittedPapersIndexInstance: indexInstance
      })
    })
  }
  constructor ({web3Provider, pollIntervalMs, submittedPapersIndexInstance}) {
    super()
    this._web3Provider = web3Provider

    this._SubmittedPapersIndex = submittedPapersIndexInstance

    this._web3 = new Web3(this._web3Provider)
    this._poll = setInterval(this._checkConnection.bind(this), pollIntervalMs)
    this._checkConnection()
  }
  stop () {
    clearInterval(this._poll)
  }
  isConnected () {
    return this._web3.isConnected()
  }
  createAccountIfNotExist () {
    return new Promise((res, rej) => {
      const existingAcc = this._web3.personal.listAccounts
      if (existingAcc[0]) {
        return res(existingAcc[0])
      } else {
        const resp = this._web3.personal.newAccount()
        res(resp)
      }
    }).then((resp) => {
      this._address = resp
      return resp
    })
  }

  indexNewFile (fileHash) {
    const bytesOfAddress = EncodingHelper.ipfsAddressToHexSha256(fileHash)
    const from = this._web3.eth.accounts[0]
// todo: ensure that we have created an account.
    return this._SubmittedPapersIndex.push(bytesOfAddress, {from}).then((transactionInfo) => {
      return transactionInfo.receipt.transactionHash
    })
  }

  awaitIndexNewFile (txnHash) {
    return Web3Helper.getTransactionReceiptMined(txnHash)
    .then((result) => {
      console.log('transaction mined!', result)
      return result.blockHash
    })
  }

  _checkConnection () {
    this._web3.net.getPeerCount((err, numPeers) => {
      if (err) {
        this.emit('peer-update', err, numPeers)
        console.error(err, err.stack)
        return
      } else {
        this.emit('peer-update', null, numPeers)
      }
    })
  }
}

module.exports = Web3Client
