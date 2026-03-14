# Hyve Frontend Spec — UI Flows & API Contract

Backend: `http://localhost:3001` | Network: XRPL Devnet (real on-chain transactions)

---

## Setup Flow (one-time)

### 1. Initialize RLUSD Issuer
Before anything works, the RLUSD issuer must be created on Devnet.

```
POST /api/init
Body: {}
Response: { success: true, issuerAddress: "rXXX..." }
```

This is a one-time action per backend session. Show a setup screen or auto-call on first load.

---

## Employer View (`/employer`)

### Flow: Create Vault

The employer initializes their company vault. This creates:
- A real on-chain Vault (XLS-65)
- A LoanBroker for issuing loans from the vault
- First-loss cover deposit (protects depositors if loans default)

**Step 1: Employer creates or imports a wallet**
```
POST /api/wallet/create
Response: { address, seed, publicKey, balance }
```

**Step 2: Create the vault**
```
POST /api/vault/create
Body: { employerSeed: "sXXX...", companyName: "Acme Corp" }
Response: {
  success: true,
  vaultId: "ABC123...",        // on-chain Vault ID (hex hash)
  loanBrokerId: "DEF456...",   // on-chain LoanBroker ID
  vaultAddress: "rXXX...",     // employer's XRPL address
  txHashes: {
    vaultCreate: "...",
    loanBroker: "...",
    coverDeposit: "..."
  }
}
```

**Important:** `vaultId` is now a 64-char hex hash (real ledger object ID), not `vault_1`. The frontend must store this — employees need it to connect.

**UI suggestions:**
- Show a "Creating vault..." loading state (takes ~15-20s for 3 on-chain txs)
- Display the vaultId prominently with a copy button
- Show tx hashes as links to devnet explorer
- Show the employer's XRP balance (they need XRP for transaction fees)

### Flow: Onboard Employees

Employer adds employees to the vault. Each onboarding:
- Creates a funded wallet
- Sets up RLUSD trust line
- Funds with 1000 RLUSD (simulated payroll)
- Issues + accepts an on-chain "employee" credential

```
POST /api/vault/:vaultId/onboard
Body: { employeeName: "Alice" }
Response: {
  success: true,
  employee: {
    name: "Alice",
    address: "rXXX...",
    seed: "sXXX...",        // employee needs this to connect
    rlusdBalance: 1000,
    credentials: ["employee"]
  },
  txHashes: {
    credentialCreate: "...",
    credentialAccept: "..."
  }
}
```

**UI suggestions:**
- Show each employee in a list/table: name, address, seed (with copy), balance
- Loading state per employee (~15-20s for wallet + trust line + fund + 2 credential txs)
- Warn: "Share the seed securely — employee needs it to connect"

### Flow: View Vault Dashboard

```
GET /api/vault/:vaultId
Response: {
  id: "ABC123...",
  companyName: "Acme Corp",
  employerAddress: "rXXX...",
  loanBrokerId: "DEF456...",
  vaultLedgerObject: { ... },     // raw on-chain Vault object
  vaultBalance: "2000",           // total RLUSD in vault
  employees: [
    {
      name: "Alice",
      address: "rXXX...",
      seed: "sXXX...",
      rlusdBalance: 500,
      credentials: ["employee"]
    },
    ...
  ],
  loans: [
    {
      id: "LOAN_HASH...",         // on-chain Loan ID
      borrower: "rXXX...",
      principal: 200,
      status: "active",           // "active" | "repaid" | "defaulted"
      remaining: "180",           // from ledger
      loanInfo: { ... }           // raw on-chain Loan object
    }
  ]
}
```

### Flow: Clawback (employer reclaims from employee)

```
POST /api/vault/:vaultId/clawback
Body: { employeeAddress: "rXXX...", amount: 100 }  // amount optional, omit for all
Response: { success: true, txHash: "..." }
```

### Flow: Default a Loan

```
POST /api/vault/:vaultId/loan/:loanId/default
Body: {}
Response: { success: true, txHash: "..." }
```

### Flow: View On-Chain History

```
GET /api/vault/:vaultId/ledger
Response: { transactions: [ ... ] }   // raw XRPL transaction objects
```

---

## Employee View (`/employee`)

### Flow: Connect to Vault

Employee needs: **vaultId** (from employer) + **their seed** (from onboarding).

No API call needed to "connect" — just store these locally and use them for subsequent calls.

**UI suggestions:**
- Two input fields: Vault ID, Your Seed
- On connect, call `GET /api/vault/:vaultId` and `GET /api/balance/:address` to populate the dashboard
- Derive address from seed client-side if needed, or just match by seed in the vault response

### Flow: Check Balance

```
GET /api/balance/:address
Response: {
  address: "rXXX...",
  rlusd: 800,
  xrp: 98.5,
  credentials: ["employee", "creditworthy"]
}
```

### Flow: Deposit RLUSD into Vault

```
POST /api/vault/:vaultId/deposit
Body: { employeeSeed: "sXXX...", amount: 200 }
Response: {
  success: true,
  deposited: 200,
  totalVaultBalance: "2200",   // from on-chain Vault object
  txHash: "..."
}
```

**UI suggestions:**
- Input field for amount
- Show current RLUSD balance, disable if insufficient
- Loading state (~5-10s for on-chain tx)
- Show updated vault balance after deposit

### Flow: Draw Emergency Loan

```
POST /api/vault/:vaultId/loan/draw
Body: {
  employeeAddress: "rXXX...",
  employeeSeed: "sXXX...",
  amount: 200
}
Response: {
  success: true,
  loan: {
    id: "LOAN_HASH...",       // on-chain Loan ID — store this!
    borrower: "rXXX...",
    principal: 200,
    status: "active",
    createdAt: "2026-03-14T..."
  },
  txHash: "..."
}
```

**Important:** Store the `loan.id` — it's needed for repayment. It's an on-chain ledger object hash.

**Loan terms (hardcoded in backend for now):**
- 5% annual interest
- 6 payments, 30-day intervals
- 7-day grace period
- 3% early payoff rate

### Flow: Repay Loan

```
POST /api/vault/:vaultId/loan/repay
Body: {
  loanId: "LOAN_HASH...",
  employeeSeed: "sXXX...",
  amount: 100
}
Response: {
  success: true,
  loan: { id, borrower, principal, status },    // status flips to "repaid" when done
  loanInfo: { PrincipalOutstanding, ... },       // null if fully repaid (ledger object deleted)
  credentials: ["employee", "creditworthy"],     // "creditworthy" appears on full repayment!
  txHash: "..."
}
```

**UI suggestions:**
- Show remaining balance from `loanInfo.PrincipalOutstanding`
- "Pay in full" button that sends the full remaining amount
- Celebrate when `credentials` includes "creditworthy" — this is the key moment
- If `loanInfo` is null and status is "repaid", loan is fully settled on-chain

---

## Credential Display

Credentials are on-chain (XLS-70). Both views should show them:

| Credential | Meaning | When Issued |
|-----------|---------|-------------|
| `employee` | Verified employee of the company | On onboarding |
| `creditworthy` | Has fully repaid a loan | On full loan repayment |

Show as badges/chips. They're real on-chain attestations, not just UI state.

---

## Key Differences from Old Backend

| Before | Now |
|--------|-----|
| `vaultId` was `vault_1`, `vault_2` | Now a 64-char hex hash (real ledger object) |
| `loanId` was `loan_1699...` | Now a 64-char hex hash (real ledger object) |
| Balances from in-memory state | Balances from real XRPL ledger |
| Credentials were in-memory | Real on-chain XLS-70 credentials |
| Deposits were Payment txs | Real VaultDeposit (get MPT shares) |
| Loans were Payment txs | Real LoanSet/LoanPay (interest, schedules, etc.) |
| No clawback/default | Real VaultClawback + LoanManage(default) |
| All responses have `txHash` fields | Link to devnet explorer |

## Error Handling

All errors return `{ error: "message" }` with appropriate HTTP status:
- `404` — Vault or loan not found
- `403` — Missing required credential
- `500` — XRPL transaction failure (message includes the XRPL error code)

On-chain operations take 5-20 seconds. Show loading states.

## Devnet Explorer

Transaction hashes can be linked to: `https://devnet.xrpl.org/transactions/{txHash}`
