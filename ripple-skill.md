# XRP Ledger Developer Portal Documentation

The XRP Ledger (XRPL) is a decentralized public blockchain built for enterprise use. It provides a global payment and financial infrastructure with native support for multiple currencies and tokens, a built-in decentralized exchange, and fast, low-cost transactions. The XRPL Dev Portal serves as the authoritative documentation source for the XRP Ledger, including the `rippled` core server, client libraries (xrpl.js, xrpl-py), and related tools.

The XRPL network uses a consensus protocol that validates transactions in 3-5 seconds without mining, making it energy-efficient and highly scalable. The ledger supports various features including direct XRP payments, cross-currency payments via the decentralized exchange, token issuance (fungible and NFTs), payment channels, escrow, checks, AMMs (Automated Market Makers), and multi-signing for enhanced security. All API interactions occur through WebSocket or JSON-RPC protocols.

---

## Account Information API (account_info)

Retrieves comprehensive information about an XRP Ledger account including its XRP balance, sequence number, account flags, and optionally queued transactions. This is the primary method for checking account status and balance.

```javascript
// JavaScript (xrpl.js) - Get account information
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const response = await client.request({
  "command": "account_info",
  "account": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
  "ledger_index": "validated",
  "queue": true,
  "signer_lists": true
})

console.log("Account:", response.result.account_data.Account)
console.log("Balance:", response.result.account_data.Balance, "drops")
console.log("Sequence:", response.result.account_data.Sequence)
console.log("Owner Count:", response.result.account_data.OwnerCount)

// Response structure:
// {
//   "account_data": {
//     "Account": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
//     "Balance": "999999999960",
//     "Flags": 8388608,
//     "LedgerEntryType": "AccountRoot",
//     "OwnerCount": 0,
//     "Sequence": 6
//   },
//   "ledger_current_index": 4,
//   "validated": true
// }

await client.disconnect()
```

```bash
# cURL - JSON-RPC account_info request
curl -X POST https://s1.ripple.com:51234/ \
  -H "Content-Type: application/json" \
  -d '{
    "method": "account_info",
    "params": [{
      "account": "rG1QQv2nh2gr7RCZ1P8YYcBUKCCN633jCn",
      "ledger_index": "validated",
      "queue": true
    }]
  }'
```

---

## Transaction History API (account_tx)

Retrieves a paginated list of validated transactions that involve a specific account. Supports filtering by ledger range and transaction type, with options for binary or JSON output format.

```javascript
// JavaScript - Get transaction history with pagination
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

let marker = null
let allTransactions = []

do {
  const response = await client.request({
    "command": "account_tx",
    "account": "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w",
    "ledger_index_min": -1,
    "ledger_index_max": -1,
    "limit": 10,
    "forward": false,
    "marker": marker,
    "api_version": 2
  })

  for (const tx of response.result.transactions) {
    console.log("Hash:", tx.hash)
    console.log("Type:", tx.tx_json.TransactionType)
    console.log("Result:", tx.meta.TransactionResult)
    console.log("Ledger:", tx.ledger_index)
    console.log("---")
  }

  allTransactions = allTransactions.concat(response.result.transactions)
  marker = response.result.marker
} while (marker && allTransactions.length < 50)

await client.disconnect()
```

```bash
# cURL - JSON-RPC account_tx request
curl -X POST https://s1.ripple.com:51234/ \
  -H "Content-Type: application/json" \
  -d '{
    "method": "account_tx",
    "params": [{
      "account": "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w",
      "ledger_index_min": -1,
      "ledger_index_max": -1,
      "limit": 10,
      "api_version": 2
    }]
  }'
```

---

## Submit Transaction API (submit)

Sends a transaction to the network for validation and inclusion in future ledgers. Supports both submit-only mode (pre-signed transactions) and sign-and-submit mode (for testing). Always use submit-only mode with pre-signed transactions in production.

```javascript
// JavaScript - Complete payment transaction workflow
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

// Get funded wallet from testnet faucet
const { wallet, balance } = await client.fundWallet()
console.log("Wallet address:", wallet.address)
console.log("Initial balance:", balance, "XRP")

// Prepare transaction with autofill
const prepared = await client.autofill({
  "TransactionType": "Payment",
  "Account": wallet.address,
  "DeliverMax": xrpl.xrpToDrops("22"),
  "Destination": "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe"
})

console.log("Fee:", xrpl.dropsToXrp(prepared.Fee), "XRP")
console.log("LastLedgerSequence:", prepared.LastLedgerSequence)

// Sign the transaction
const signed = wallet.sign(prepared)
console.log("Transaction hash:", signed.hash)
console.log("Signed blob:", signed.tx_blob)

// Submit and wait for validation
const result = await client.submitAndWait(signed.tx_blob)

console.log("Result:", result.result.meta.TransactionResult)
console.log("Balance changes:", JSON.stringify(
  xrpl.getBalanceChanges(result.result.meta), null, 2
))

// Alternative: Submit-only mode for pre-signed transactions
const submitOnlyResult = await client.request({
  "command": "submit",
  "tx_blob": signed.tx_blob,
  "fail_hard": false
})
console.log("Engine result:", submitOnlyResult.result.engine_result)

await client.disconnect()
```

```bash
# cURL - Submit pre-signed transaction blob
curl -X POST https://s1.ripple.com:51234/ \
  -H "Content-Type: application/json" \
  -d '{
    "method": "submit",
    "params": [{
      "tx_blob": "1200002280000000240000001E61D4838D7EA4C6800000000000000000000000000055534400000000004B4E9C06F24296074F7BC48F92A97916C6DC5EA968400000000000000B732103AB40A0490F9B7ED8DF29D246BF2D6269820A0EE7742ACDD457BEA7C7D0931EDB7447304502210095D23D8AF107DF50651F266259CC7139D0CD0C64ABBA3A958156352A0D95A21E02207FCF9B77D7510380E49FF250C21B57169E14E9B4ACFD314CEDC79DDD0A38B8A681144B4E9C06F24296074F7BC48F92A97916C6DC5EA983143E9D4A2B8AA0780F682D136F7A56D6724EF53754"
    }]
  }'
```

---

## Transaction Lookup API (tx)

Retrieves information about a specific transaction by its identifying hash or CTID (Compact Transaction Identifier). Use this to verify transaction status and get the final outcome.

```javascript
// JavaScript - Look up transaction by hash
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

// Look up by transaction hash
const response = await client.request({
  "command": "tx",
  "transaction": "C53ECF838647FA5A4C780377025FEC7999AB4182590510CA461444B207AB74A9",
  "binary": false,
  "api_version": 2
})

console.log("Transaction Type:", response.result.tx_json.TransactionType)
console.log("Account:", response.result.tx_json.Account)
console.log("Destination:", response.result.tx_json.Destination)
console.log("Ledger Index:", response.result.ledger_index)
console.log("Close Time:", response.result.close_time_iso)
console.log("Validated:", response.result.validated)
console.log("Result:", response.result.meta.TransactionResult)

// Look up by CTID (Compact Transaction Identifier)
const ctidResponse = await client.request({
  "command": "tx",
  "ctid": "C363B1DD00000000",
  "binary": false,
  "api_version": 2
})

// Search within specific ledger range (useful for verification)
try {
  const rangeResponse = await client.request({
    "command": "tx",
    "transaction": "E08D6E9754025BA2534A78707605E0601F03ACE063687A0CA1BDDACFCD1698C7",
    "min_ledger": 54368573,
    "max_ledger": 54368673
  })
} catch (error) {
  if (error.data.searched_all === true) {
    console.log("Transaction definitely not in range")
  } else {
    console.log("Server may not have all ledgers in range")
  }
}

await client.disconnect()
```

---

## Ledger Information API (ledger)

Retrieves information about a specific ledger version including its header data, optionally with transactions and expanded details. Essential for tracking blockchain state.

```javascript
// JavaScript - Get ledger information
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

// Get validated ledger with transactions
const response = await client.request({
  "command": "ledger",
  "ledger_index": "validated",
  "transactions": true,
  "expand": true,
  "owner_funds": true,
  "api_version": 2
})

console.log("Ledger Index:", response.result.ledger.ledger_index)
console.log("Ledger Hash:", response.result.ledger.ledger_hash)
console.log("Close Time:", response.result.ledger.close_time_iso)
console.log("Parent Hash:", response.result.ledger.parent_hash)
console.log("Total XRP:", response.result.ledger.total_coins, "drops")
console.log("Transaction Count:", response.result.ledger.transactions?.length || 0)
console.log("Validated:", response.result.validated)

// Get current open ledger with queued transactions
const currentLedger = await client.request({
  "command": "ledger",
  "ledger_index": "current",
  "queue": true
})

if (currentLedger.result.queue_data) {
  console.log("Queued transactions:", currentLedger.result.queue_data.length)
}

await client.disconnect()
```

```bash
# cURL - Get validated ledger
curl -X POST https://s1.ripple.com:51234/ \
  -H "Content-Type: application/json" \
  -d '{
    "method": "ledger",
    "params": [{
      "ledger_index": "validated",
      "transactions": false,
      "expand": false
    }]
  }'
```

---

## Server Information API (server_info)

Retrieves human-readable status information about the rippled server including version, sync status, load factors, and validated ledger information. Essential for monitoring server health.

```javascript
// JavaScript - Get server status
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const response = await client.request({
  "command": "server_info",
  "counters": false
})

const info = response.result.info
console.log("Server Version:", info.build_version)
console.log("Server State:", info.server_state)
console.log("Complete Ledgers:", info.complete_ledgers)
console.log("Peers:", info.peers)
console.log("Load Factor:", info.load_factor)
console.log("Uptime:", info.uptime, "seconds")

if (info.validated_ledger) {
  console.log("Validated Ledger:")
  console.log("  Index:", info.validated_ledger.seq)
  console.log("  Age:", info.validated_ledger.age, "seconds")
  console.log("  Base Fee:", info.validated_ledger.base_fee_xrp, "XRP")
  console.log("  Reserve Base:", info.validated_ledger.reserve_base_xrp, "XRP")
  console.log("  Reserve Inc:", info.validated_ledger.reserve_inc_xrp, "XRP")
}

await client.disconnect()
```

---

## WebSocket Subscriptions API (subscribe/unsubscribe)

Subscribe to real-time notifications for ledger closes, transactions, account activity, and order book changes. Essential for building reactive applications.

```javascript
// JavaScript - Subscribe to multiple streams
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

// Subscribe to ledger stream
await client.request({
  "command": "subscribe",
  "streams": ["ledger"]
})

// Listen for new validated ledgers
client.on("ledgerClosed", (ledger) => {
  console.log(`Ledger #${ledger.ledger_index} closed`)
  console.log(`  Hash: ${ledger.ledger_hash}`)
  console.log(`  Transactions: ${ledger.txn_count}`)
  console.log(`  Close Time: ${ledger.ledger_time}`)
})

// Subscribe to specific account transactions
await client.request({
  "command": "subscribe",
  "accounts": ["rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1"]
})

// Listen for account transactions
client.on("transaction", (tx) => {
  console.log("Transaction detected:")
  console.log(`  Type: ${tx.tx_json?.TransactionType || tx.transaction?.TransactionType}`)
  console.log(`  Hash: ${tx.hash}`)
  console.log(`  Result: ${tx.engine_result}`)
  console.log(`  Validated: ${tx.validated}`)
})

// Subscribe to order book with snapshot
await client.request({
  "command": "subscribe",
  "books": [{
    "taker_pays": { "currency": "XRP" },
    "taker_gets": {
      "currency": "USD",
      "issuer": "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq"
    },
    "snapshot": true,
    "both": true
  }]
})

// Unsubscribe when done
await client.request({
  "command": "unsubscribe",
  "streams": ["ledger"],
  "accounts": ["rrpNnNLKrartuEqfJGpqyDwPj1AFPg9vn1"]
})

await client.disconnect()
```

---

## Payment Transaction Type

The Payment transaction sends value from one account to another. Supports direct XRP transfers, token payments, cross-currency exchanges, and partial payments. The most commonly used transaction type.

```javascript
// JavaScript - Various payment types
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const { wallet } = await client.fundWallet()

// 1. Direct XRP Payment
const xrpPayment = await client.autofill({
  "TransactionType": "Payment",
  "Account": wallet.address,
  "Destination": "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  "DeliverMax": xrpl.xrpToDrops("25")  // 25 XRP
})

// 2. Token Payment (requires trust line)
const tokenPayment = await client.autofill({
  "TransactionType": "Payment",
  "Account": wallet.address,
  "Destination": "ra5nK24KXen9AHvsdFTKHSANinZseWnPcX",
  "DeliverMax": {
    "currency": "USD",
    "value": "100",
    "issuer": "rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn"
  },
  "SendMax": {
    "currency": "USD",
    "value": "105",  // Allow 5% slippage
    "issuer": "rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn"
  }
})

// 3. Partial Payment (with tfPartialPayment flag)
const partialPayment = await client.autofill({
  "TransactionType": "Payment",
  "Account": wallet.address,
  "Destination": "ra5nK24KXen9AHvsdFTKHSANinZseWnPcX",
  "DeliverMax": {
    "currency": "USD",
    "value": "1000",
    "issuer": "rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn"
  },
  "DeliverMin": {
    "currency": "USD",
    "value": "500",  // Minimum acceptable
    "issuer": "rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn"
  },
  "SendMax": xrpl.xrpToDrops("1000"),
  "Flags": xrpl.PaymentFlags.tfPartialPayment
})

// Sign and submit
const signed = wallet.sign(xrpPayment)
const result = await client.submitAndWait(signed.tx_blob)

// Check delivered amount for partial payments
const deliveredAmount = result.result.meta.delivered_amount
console.log("Delivered:", deliveredAmount)

await client.disconnect()
```

---

## Trust Line Setup (TrustSet Transaction)

Creates or modifies a trust line between two accounts, enabling the holding of tokens issued by another account. Required before receiving non-XRP tokens.

```javascript
// JavaScript - Set up trust lines for token issuance
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const { wallet: hotWallet } = await client.fundWallet()
const { wallet: coldWallet } = await client.fundWallet()

const currencyCode = "FOO"

// Create trust line from hot wallet to cold (issuer)
const trustSetTx = {
  "TransactionType": "TrustSet",
  "Account": hotWallet.address,
  "LimitAmount": {
    "currency": currencyCode,
    "issuer": coldWallet.address,
    "value": "10000000000"  // Maximum amount willing to hold
  },
  "Flags": 0
  // Optional flags:
  // xrpl.TrustSetFlags.tfSetNoRipple - Disable rippling
  // xrpl.TrustSetFlags.tfSetFreeze - Freeze the trust line
}

const prepared = await client.autofill(trustSetTx)
const signed = hotWallet.sign(prepared)
const result = await client.submitAndWait(signed.tx_blob)

if (result.result.meta.TransactionResult === "tesSUCCESS") {
  console.log("Trust line created successfully")

  // Verify trust line with account_lines
  const lines = await client.request({
    "command": "account_lines",
    "account": hotWallet.address,
    "ledger_index": "validated"
  })
  console.log("Trust lines:", JSON.stringify(lines.result.lines, null, 2))
}

await client.disconnect()
```

---

## Token Issuance Complete Workflow

Complete example of issuing fungible tokens on the XRPL including account configuration, trust line setup, token minting, and distribution.

```javascript
// JavaScript - Full token issuance workflow
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

// Create issuer (cold) and distribution (hot) wallets
const { wallet: coldWallet } = await client.fundWallet()
const { wallet: hotWallet } = await client.fundWallet()
const { wallet: customerWallet } = await client.fundWallet()

const currencyCode = "USD"

// Step 1: Configure issuer account settings
const issuerSettings = {
  "TransactionType": "AccountSet",
  "Account": coldWallet.address,
  "TransferRate": 0,  // No transfer fee (or 1000000000 = 0%, 1002000000 = 0.2%)
  "TickSize": 5,
  "Domain": Buffer.from("example.com").toString("hex"),
  "SetFlag": xrpl.AccountSetAsfFlags.asfDefaultRipple,
  "Flags": (xrpl.AccountSetTfFlags.tfDisallowXRP |
           xrpl.AccountSetTfFlags.tfRequireDestTag)
}

let prepared = await client.autofill(issuerSettings)
let signed = coldWallet.sign(prepared)
await client.submitAndWait(signed.tx_blob)
console.log("Issuer account configured")

// Step 2: Create trust line from hot wallet to issuer
const trustLine = {
  "TransactionType": "TrustSet",
  "Account": hotWallet.address,
  "LimitAmount": {
    "currency": currencyCode,
    "issuer": coldWallet.address,
    "value": "10000000000"
  }
}

prepared = await client.autofill(trustLine)
signed = hotWallet.sign(prepared)
await client.submitAndWait(signed.tx_blob)
console.log("Trust line created: hot -> issuer")

// Step 3: Create trust line from customer to issuer
const customerTrustLine = {
  "TransactionType": "TrustSet",
  "Account": customerWallet.address,
  "LimitAmount": {
    "currency": currencyCode,
    "issuer": coldWallet.address,
    "value": "1000000"
  }
}

prepared = await client.autofill(customerTrustLine)
signed = customerWallet.sign(prepared)
await client.submitAndWait(signed.tx_blob)
console.log("Trust line created: customer -> issuer")

// Step 4: Issue tokens from cold to hot wallet
const issueTokens = {
  "TransactionType": "Payment",
  "Account": coldWallet.address,
  "Destination": hotWallet.address,
  "DestinationTag": 1,
  "DeliverMax": {
    "currency": currencyCode,
    "value": "10000",
    "issuer": coldWallet.address
  }
}

prepared = await client.autofill(issueTokens)
signed = coldWallet.sign(prepared)
await client.submitAndWait(signed.tx_blob)
console.log("Tokens issued to hot wallet")

// Step 5: Distribute tokens to customer
const distributeTokens = {
  "TransactionType": "Payment",
  "Account": hotWallet.address,
  "Destination": customerWallet.address,
  "DestinationTag": 1,
  "DeliverMax": {
    "currency": currencyCode,
    "value": "100",
    "issuer": coldWallet.address
  }
}

prepared = await client.autofill(distributeTokens)
signed = hotWallet.sign(prepared)
await client.submitAndWait(signed.tx_blob)
console.log("Tokens distributed to customer")

// Step 6: Check balances
const coldBalances = await client.request({
  "command": "gateway_balances",
  "account": coldWallet.address,
  "hotwallet": [hotWallet.address],
  "ledger_index": "validated"
})
console.log("Issuer balances:", JSON.stringify(coldBalances.result, null, 2))

await client.disconnect()
```

---

## Account Lines and Balances API (account_lines)

Retrieves information about an account's trust lines, showing token balances and trust line settings. Essential for checking non-XRP token holdings.

```javascript
// JavaScript - Get account trust lines and balances
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const response = await client.request({
  "command": "account_lines",
  "account": "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w",
  "ledger_index": "validated"
})

for (const line of response.result.lines) {
  console.log(`Currency: ${line.currency}`)
  console.log(`  Issuer: ${line.account}`)
  console.log(`  Balance: ${line.balance}`)
  console.log(`  Limit: ${line.limit}`)
  console.log(`  No Ripple: ${line.no_ripple}`)
  console.log("---")
}

// For issuers, use gateway_balances to see obligations
const gatewayBalances = await client.request({
  "command": "gateway_balances",
  "account": "rLNaPoKeeBjZe2qs6x52yVPZpZ8td4dc6w",
  "ledger_index": "validated",
  "hotwallet": ["rHotWalletAddress"]  // Exclude from obligations
})

console.log("Assets (owed to this account):", gatewayBalances.result.assets)
console.log("Obligations (owed by this account):", gatewayBalances.result.obligations)

await client.disconnect()
```

---

## Order Book and DEX API (book_offers)

Queries the decentralized exchange order book for offers between two currencies. Essential for building trading interfaces and finding exchange rates.

```javascript
// JavaScript - Query order book and create offers
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

// Get order book: XRP -> USD
const orderBook = await client.request({
  "command": "book_offers",
  "taker_pays": { "currency": "XRP" },
  "taker_gets": {
    "currency": "USD",
    "issuer": "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq"
  },
  "limit": 10
})

for (const offer of orderBook.result.offers) {
  const takerPays = typeof offer.TakerPays === 'string'
    ? xrpl.dropsToXrp(offer.TakerPays) + " XRP"
    : offer.TakerPays.value + " " + offer.TakerPays.currency

  console.log(`Offer: Pay ${takerPays} to get ${offer.TakerGets.value} USD`)
  console.log(`  Owner: ${offer.Account}`)
  console.log(`  Quality: ${offer.quality}`)
}

// Create an offer (OfferCreate transaction)
const { wallet } = await client.fundWallet()

const offerCreate = {
  "TransactionType": "OfferCreate",
  "Account": wallet.address,
  "TakerPays": {
    "currency": "USD",
    "issuer": "rhub8VRN55s94qWKDv6jmDy1pUykJzF3wq",
    "value": "10"
  },
  "TakerGets": xrpl.xrpToDrops("50"),  // 50 XRP
  "Flags": xrpl.OfferCreateFlags.tfSell  // Optional flags
}

const prepared = await client.autofill(offerCreate)
const signed = wallet.sign(prepared)
const result = await client.submitAndWait(signed.tx_blob)

console.log("Offer result:", result.result.meta.TransactionResult)

await client.disconnect()
```

---

## Path Finding API (ripple_path_find)

Finds payment paths between two accounts for cross-currency payments. The server calculates optimal paths through the order book and trust lines.

```javascript
// JavaScript - Find payment paths
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const pathResponse = await client.request({
  "command": "ripple_path_find",
  "source_account": "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59",
  "destination_account": "r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59",
  "destination_amount": {
    "currency": "USD",
    "issuer": "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    "value": "100"
  },
  "source_currencies": [
    { "currency": "XRP" },
    { "currency": "EUR", "issuer": "rEURIssuerAddress" }
  ]
})

for (const alt of pathResponse.result.alternatives) {
  console.log("Source amount:", JSON.stringify(alt.source_amount))
  console.log("Paths:", JSON.stringify(alt.paths_computed, null, 2))
}

await client.disconnect()
```

---

## Fee Estimation API (fee)

Gets the current transaction cost requirements including the base fee, median fee, and queue fee levels. Essential for determining appropriate transaction fees.

```javascript
// JavaScript - Get current fee levels
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const feeResponse = await client.request({
  "command": "fee"
})

const drops = feeResponse.result.drops
console.log("Base fee:", drops.base_fee, "drops")
console.log("Median fee:", drops.median_fee, "drops")
console.log("Minimum fee:", drops.minimum_fee, "drops")
console.log("Open ledger fee:", drops.open_ledger_fee, "drops")

// Queue statistics
const levels = feeResponse.result.levels
console.log("Median level:", levels.median_level)
console.log("Minimum level:", levels.minimum_level)
console.log("Open ledger level:", levels.open_ledger_level)

// Use this to set appropriate fees
const appropriateFee = Math.max(
  parseInt(drops.open_ledger_fee),
  parseInt(drops.minimum_fee) * 2
)
console.log("Recommended fee:", appropriateFee, "drops")

await client.disconnect()
```

---

## NFT Operations (NFTokenMint, NFTokenCreateOffer, NFTokenAcceptOffer)

Create, trade, and manage non-fungible tokens on the XRP Ledger. NFTs support royalties, transferability controls, and burning capabilities.

```javascript
// JavaScript - NFT minting and trading
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const { wallet: minter } = await client.fundWallet()
const { wallet: buyer } = await client.fundWallet()

// Mint an NFT
const mintTx = {
  "TransactionType": "NFTokenMint",
  "Account": minter.address,
  "URI": xrpl.convertStringToHex("ipfs://QmExample..."),
  "Flags": xrpl.NFTokenMintFlags.tfTransferable,
  "TransferFee": 5000,  // 5% royalty (0-50000 = 0-50%)
  "NFTokenTaxon": 0
}

let prepared = await client.autofill(mintTx)
let signed = minter.sign(prepared)
let result = await client.submitAndWait(signed.tx_blob)

// Get the minted NFT ID from transaction metadata
const nftokenID = result.result.meta.nftoken_id
console.log("Minted NFT:", nftokenID)

// Get account's NFTs
const nfts = await client.request({
  "command": "account_nfts",
  "account": minter.address
})
console.log("Account NFTs:", nfts.result.account_nfts)

// Create sell offer
const sellOffer = {
  "TransactionType": "NFTokenCreateOffer",
  "Account": minter.address,
  "NFTokenID": nftokenID,
  "Amount": xrpl.xrpToDrops("100"),  // 100 XRP
  "Flags": xrpl.NFTokenCreateOfferFlags.tfSellNFToken
}

prepared = await client.autofill(sellOffer)
signed = minter.sign(prepared)
result = await client.submitAndWait(signed.tx_blob)

const offerID = result.result.meta.offer_id
console.log("Sell offer created:", offerID)

// Accept the offer (buyer)
const acceptOffer = {
  "TransactionType": "NFTokenAcceptOffer",
  "Account": buyer.address,
  "NFTokenSellOffer": offerID
}

prepared = await client.autofill(acceptOffer)
signed = buyer.sign(prepared)
result = await client.submitAndWait(signed.tx_blob)

console.log("NFT purchased:", result.result.meta.TransactionResult)

await client.disconnect()
```

---

## AMM (Automated Market Maker) Operations

Create and interact with automated market makers for decentralized token swaps with constant-product pricing.

```javascript
// JavaScript - AMM creation and interaction
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const { wallet } = await client.fundWallet()

// Create an AMM pool
const ammCreate = {
  "TransactionType": "AMMCreate",
  "Account": wallet.address,
  "Amount": xrpl.xrpToDrops("1000"),  // 1000 XRP
  "Amount2": {
    "currency": "USD",
    "issuer": "rIssuerAddress",
    "value": "500"
  },
  "TradingFee": 500  // 0.5% fee (0-1000 = 0-1%)
}

let prepared = await client.autofill(ammCreate)
let signed = wallet.sign(prepared)
let result = await client.submitAndWait(signed.tx_blob)
console.log("AMM created:", result.result.meta.TransactionResult)

// Get AMM info
const ammInfo = await client.request({
  "command": "amm_info",
  "asset": { "currency": "XRP" },
  "asset2": {
    "currency": "USD",
    "issuer": "rIssuerAddress"
  }
})

console.log("AMM Account:", ammInfo.result.amm.account)
console.log("LP Token:", ammInfo.result.amm.lp_token)
console.log("Trading Fee:", ammInfo.result.amm.trading_fee)

// Deposit to AMM
const ammDeposit = {
  "TransactionType": "AMMDeposit",
  "Account": wallet.address,
  "Asset": { "currency": "XRP" },
  "Asset2": {
    "currency": "USD",
    "issuer": "rIssuerAddress"
  },
  "Amount": xrpl.xrpToDrops("100"),
  "Flags": xrpl.AMMDepositFlags.tfSingleAsset
}

// Withdraw from AMM
const ammWithdraw = {
  "TransactionType": "AMMWithdraw",
  "Account": wallet.address,
  "Asset": { "currency": "XRP" },
  "Asset2": {
    "currency": "USD",
    "issuer": "rIssuerAddress"
  },
  "LPTokenIn": {
    "currency": "03...",  // LP token currency
    "issuer": "rAMMAccount",
    "value": "100"
  },
  "Flags": xrpl.AMMWithdrawFlags.tfLPToken
}

await client.disconnect()
```

---

## Escrow Operations

Create time-locked or condition-locked escrows for XRP. Useful for scheduled payments, atomic swaps, and conditional transfers.

```javascript
// JavaScript - Escrow creation and completion
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const { wallet: sender } = await client.fundWallet()
const { wallet: receiver } = await client.fundWallet()

// Create time-based escrow (releases after specific time)
const finishAfter = Math.floor(Date.now() / 1000) + 60  // 60 seconds from now

const escrowCreate = {
  "TransactionType": "EscrowCreate",
  "Account": sender.address,
  "Destination": receiver.address,
  "Amount": xrpl.xrpToDrops("100"),
  "FinishAfter": xrpl.isoTimeToRippleTime(new Date(finishAfter * 1000).toISOString()),
  "CancelAfter": xrpl.isoTimeToRippleTime(new Date((finishAfter + 3600) * 1000).toISOString())
}

let prepared = await client.autofill(escrowCreate)
let signed = sender.sign(prepared)
let result = await client.submitAndWait(signed.tx_blob)

const escrowSequence = result.result.tx_json.Sequence
console.log("Escrow created with sequence:", escrowSequence)

// After FinishAfter time passes, complete the escrow
const escrowFinish = {
  "TransactionType": "EscrowFinish",
  "Account": receiver.address,
  "Owner": sender.address,
  "OfferSequence": escrowSequence
}

// For crypto-condition escrow, include:
// "Condition": "A0258020...",  // PREIMAGE-SHA-256 condition
// "Fulfillment": "A0228020..."  // Fulfillment matching condition

prepared = await client.autofill(escrowFinish)
signed = receiver.sign(prepared)
result = await client.submitAndWait(signed.tx_blob)

console.log("Escrow finished:", result.result.meta.TransactionResult)

await client.disconnect()
```

---

## Multi-Signing Setup and Usage

Configure multi-signature requirements for an account and submit multi-signed transactions for enhanced security.

```javascript
// JavaScript - Multi-signing setup
import xrpl from "xrpl"

const client = new xrpl.Client("wss://s.altnet.rippletest.net:51233/")
await client.connect()

const { wallet: mainAccount } = await client.fundWallet()
const { wallet: signer1 } = await client.fundWallet()
const { wallet: signer2 } = await client.fundWallet()
const { wallet: signer3 } = await client.fundWallet()

// Set up signer list (2-of-3 multisig)
const signerListSet = {
  "TransactionType": "SignerListSet",
  "Account": mainAccount.address,
  "SignerQuorum": 2,  // Require 2 signatures
  "SignerEntries": [
    {
      "SignerEntry": {
        "Account": signer1.address,
        "SignerWeight": 1
      }
    },
    {
      "SignerEntry": {
        "Account": signer2.address,
        "SignerWeight": 1
      }
    },
    {
      "SignerEntry": {
        "Account": signer3.address,
        "SignerWeight": 1
      }
    }
  ]
}

let prepared = await client.autofill(signerListSet)
let signed = mainAccount.sign(prepared)
await client.submitAndWait(signed.tx_blob)
console.log("Signer list configured")

// Create a multi-signed transaction
const paymentTx = await client.autofill({
  "TransactionType": "Payment",
  "Account": mainAccount.address,
  "Destination": "rDestination...",
  "DeliverMax": xrpl.xrpToDrops("50"),
  "Fee": xrpl.xrpToDrops("0.000030"),  // Higher fee for multisig
  "Sequence": await client.getNextValidSequenceNumber(mainAccount.address)
})

// Each signer signs separately
const sig1 = signer1.sign(paymentTx, true)  // true = multisign
const sig2 = signer2.sign(paymentTx, true)

// Combine signatures
const multisignedTx = xrpl.multisign([sig1.tx_blob, sig2.tx_blob])

// Submit multi-signed transaction
const result = await client.request({
  "command": "submit_multisigned",
  "tx_json": multisignedTx
})

console.log("Multi-signed result:", result.result.engine_result)

await client.disconnect()
```

---

The XRP Ledger provides a comprehensive platform for building payment applications, tokenization solutions, and decentralized finance (DeFi) protocols. Common use cases include cross-border payments with instant settlement and minimal fees, stablecoin issuance with built-in compliance features, NFT marketplaces with native royalty support, and decentralized exchanges without counterparty risk. The ledger's deterministic transaction ordering and guaranteed finality make it suitable for high-value financial applications.

Integration typically follows a pattern of connecting via WebSocket for real-time updates, using the xrpl.js or xrpl-py client libraries for transaction construction and signing, and leveraging the testnet faucet for development. Production applications should implement reliable transaction submission with proper error handling, monitor account balances and trust lines, subscribe to relevant streams for real-time notifications, and use appropriate fee levels based on network conditions. The combination of high throughput, low latency, and rich feature set makes XRPL well-suited for both consumer applications and enterprise-grade financial infrastructure.
