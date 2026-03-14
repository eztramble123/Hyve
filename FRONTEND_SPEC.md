# Hyve Frontend Spec — UI Flows & API Contract

Backend: `http://localhost:3001` | Network: XRPL Devnet (real on-chain transactions)

---

## Authentication — XUMM Wallet Connect

Both employers and employees authenticate by connecting their Xaman (XUMM) wallet. No seeds are passed around for auth — the user proves wallet ownership by signing in their Xaman app.

### Sign-In Flow

**Step 1: Create sign-in request**
```
POST /api/auth/xumm
Body: {}
Response: {
  payloadId: "uuid-here",
  qrUrl: "https://xumm.app/sign/uuid/qr.png",   // show this QR code
  deepLink: "https://xumm.app/sign/uuid",         // for mobile users
  webSocket: "wss://xumm.app/sign/uuid"           // real-time status
}
```

**Step 2: Show QR code, poll for result**
- Display the QR image from `qrUrl`
- On mobile, show a "Open in Xaman" button linking to `deepLink`
- Poll the status endpoint or use the WebSocket for real-time updates:

```
GET /api/auth/xumm/:payloadId
Response (pending):  { status: "pending" }
Response (signed):   { status: "signed", address: "rXXX...", userToken: "..." }
Response (expired):  { status: "expired" }
Response (cancelled):{ status: "cancelled" }
```

Once `status: "signed"`, you have the user's XRPL address. Store it in local state.

**If XUMM is not configured**, the backend returns `501`. Fall back to seed-based auth (enter seed manually).

### Employee Auth — Credential-Based Membership

After wallet connect, employees prove vault membership via their on-chain credential:

```
POST /api/auth/employee
Body: { address: "rXXX...", vaultId: "ABC123..." }
Response (success): {
  authenticated: true,
  address: "rXXX...",
  vaultId: "ABC123...",
  name: "Alice",              // null if employer didn't set a name
  rlusdBalance: 800,
  xrpBalance: 98.5,
  credentials: ["employee", "creditworthy"]
}
Response (no credential): {
  error: "No valid employee credential found for this vault",
  hint: "Ask your employer to add you as a member"
}
```

This checks the real on-chain XLS-70 credential. The employee must have an accepted "employee" credential issued by the vault's employer.

---

## Setup (one-time)

```
POST /api/init
Body: {}
Response: { success: true, issuerAddress: "rXXX..." }
```

Auto-call on first load or show a setup button.

---

## Employer View (`/employer`)

### Flow 1: Connect Wallet
1. Call `POST /api/auth/xumm` → show QR
2. User scans with Xaman → get employer's address
3. Store address locally

### Flow 2: Create Vault

**Step 1: Create employer wallet (for demo)**
```
POST /api/wallet/create
Response: { address, seed, publicKey, balance }
```

**Step 2: Create vault** (with 401k config)
```
POST /api/vault/create
Body: {
  employerSeed: "sXXX...",
  companyName: "Acme Corp",
  matchRate: 0.5,              // 50% employer match (optional, default 0.5)
  matchCap: 500,               // max match per employee (optional, default 500)
  vestingType: "linear",       // "linear" or "immediate" (optional, default "linear")
  vestingPeriods: 4,           // 4-year vesting (optional, default 4)
  cliffMonths: 12,             // 1-year cliff (optional, default 12)
  loanTierOverrides: {         // optional employer overrides on loan tiers
    standard: { InterestRate: 350 }
  }
}
Response: {
  success: true,
  vaultId: "ABC123...",        // 64-char hex hash (on-chain Vault ID)
  loanBrokerId: "DEF456...",
  vaultAddress: "rXXX...",
  config: {
    match: { rate: 0.5, capPerEmployee: 500 },
    vesting: { type: "linear", periodMonths: 12, totalPeriods: 4, cliffMonths: 12 },
    loanTiers: { emergency: { enabled: true }, standard: { enabled: true, InterestRate: 350 }, creditworthy: { enabled: true } }
  },
  txHashes: { vaultCreate, loanBroker, coverDeposit }
}
```

**UI:** Loading state ~15-20s. Display vaultId with copy button. Show tx hashes as explorer links. Show config summary (match rate, vesting schedule).

Vault shares are **non-transferable** on-chain (`tfVaultShareNonTransferable`) — they can only be withdrawn through the vault, not traded. This makes the vault act like a 401k, not a tradeable fund.

### Flow 2b: View / Update Vault Config

```
GET /api/vault/:vaultId/config
Response: {
  vaultId: "ABC123...",
  companyName: "Acme Corp",
  match: { rate: 0.5, capPerEmployee: 500 },
  vesting: { type: "linear", periodMonths: 12, totalPeriods: 4, cliffMonths: 12 },
  loanTiers: {
    emergency: { tierName: "emergency", InterestRate: 150, maxPrincipal: 500, eligible: true, ... },
    standard: { tierName: "standard", InterestRate: 350, maxPrincipal: 2000, ... },
    creditworthy: { tierName: "creditworthy", InterestRate: 200, maxPrincipal: 5000, ... }
  }
}

PUT /api/vault/:vaultId/config
Body: { matchRate: 0.75, matchCap: 1000, loanTierOverrides: { emergency: { maxPrincipal: 750 } } }
Response: { success: true, config: { ... } }
```

**UI suggestions:**
- Settings panel showing match rate, cap, vesting schedule
- Loan tier table with effective rates (defaults + overrides)
- Toggle to enable/disable individual tiers

### Flow 3: Add Members

Employer adds employees by their XRPL address. Employee must already have a Xaman wallet.

```
POST /api/vault/:vaultId/member
Body: { employeeAddress: "rXXX...", employeeName: "Alice" }
Response: {
  success: true,
  employee: { name: "Alice", address: "rXXX..." },
  credentialStatus: "issued_pending_accept",
  txHash: "..."
}
```

This issues an on-chain "employee" credential. The employee must accept it (see Employee flows).

**UI suggestions:**
- Input field for employee's XRPL address + optional name
- Show member list with credential status: "pending" (issued, not accepted) vs "active" (accepted)
- The employee sees this credential when they connect their wallet

### Flow 3b: Onboard Employee (demo shortcut)

For demo purposes — creates a new wallet, funds it, and issues+accepts credential in one call:

```
POST /api/vault/:vaultId/onboard
Body: { employeeName: "Alice" }
Response: {
  success: true,
  employee: { name, address, seed, rlusdBalance: 1000, credentials: ["employee"] },
  txHashes: { credentialCreate, credentialAccept }
}
```

### Flow 4: View Vault Dashboard

```
GET /api/vault/:vaultId
Response: {
  id: "ABC123...",
  companyName: "Acme Corp",
  employerAddress: "rXXX...",
  loanBrokerId: "DEF456...",
  config: { match: {...}, vesting: {...}, loanTiers: {...} },
  vaultLedgerObject: { ... },
  vaultBalance: "2000",
  employees: [
    {
      name: "Alice",
      address: "rXXX...",
      rlusdBalance: 500,
      credentials: [
        { type: "employee", accepted: true },
        { type: "creditworthy", accepted: true }
      ]
    }
  ],
  loans: [
    {
      id: "LOAN_HASH...",
      borrower: "rXXX...",
      principal: 200,
      status: "active",
      remaining: "180",
      loanInfo: { ... }
    }
  ]
}
```

### Flow 5: Clawback / Default

```
POST /api/vault/:vaultId/clawback
Body: { employeeAddress: "rXXX...", amount: 100 }
Response: { success: true, txHash: "..." }

POST /api/vault/:vaultId/loan/:loanId/default
Body: {}
Response: { success: true, txHash: "..." }
```

---

## Employee View (`/employee`)

### Flow 1: Connect Wallet + Verify Membership

1. Call `POST /api/auth/xumm` → show QR
2. User scans with Xaman → get employee's address
3. Enter vault ID (given by employer)
4. Call `POST /api/auth/employee` with `{ address, vaultId }`
5. If `authenticated: true` → show dashboard
6. If `403` → show "Not a member" message with hint

### Flow 1b: Accept Credential (first-time setup)

If the employer added the employee via `/member` but the credential isn't accepted yet:

```
POST /api/vault/:vaultId/member/accept
Body: { employeeSeed: "sXXX..." }
Response: {
  success: true,
  address: "rXXX...",
  credentials: ["employee"],
  txHash: "..."
}
```

Then retry `POST /api/auth/employee`.

### Flow 2: Check Balance

```
GET /api/balance/:address
Response: {
  address: "rXXX...",
  rlusd: 800,
  xrp: 98.5,
  credentials: [
    { type: "employee", issuer: "rXXX...", accepted: true },
    { type: "creditworthy", issuer: "rXXX...", accepted: true }
  ]
}
```

### Flow 3: Deposit RLUSD into Vault (with auto employer match)

```
POST /api/vault/:vaultId/deposit
Body: { employeeSeed: "sXXX...", amount: 200 }
Response: {
  success: true,
  deposited: 200,
  matchAmount: 100,              // employer auto-matched 50% (if configured)
  totalVaultBalance: "2500",
  txHash: "...",                  // employee deposit tx
  matchTxHash: "..."             // employer match tx (null if no match)
}
```

**UI:** Show both the employee deposit and employer match as separate line items. If `matchAmount > 0`, show a "Your employer matched $100!" confirmation.

### Flow 4: Draw Loan (tier-based)

**Step 1: Check available tiers**
```
GET /api/vault/:vaultId/loan/tiers?address=rXXX...
Response: {
  vaultId: "ABC123...",
  address: "rXXX...",
  tiers: {
    emergency: {
      tierName: "emergency", InterestRate: 150, maxPrincipal: 500,
      PaymentTotal: 3, PaymentInterval: 1209600, GracePeriod: 259200,
      requiredCredential: "employee",
      eligible: true, reason: null
    },
    standard: {
      tierName: "standard", InterestRate: 350, maxPrincipal: 2000,
      requiresDeposit: true,
      eligible: true, reason: null
    },
    creditworthy: {
      tierName: "creditworthy", InterestRate: 200, maxPrincipal: 5000,
      requiredCredential: "creditworthy",
      eligible: false, reason: "Requires \"creditworthy\" credential"
    }
  }
}
```

**Step 2: Draw loan with selected tier**
```
POST /api/vault/:vaultId/loan/draw
Body: {
  employeeAddress: "rXXX...",
  employeeSeed: "sXXX...",
  amount: 200,
  tier: "emergency"             // "emergency" | "standard" | "creditworthy"
}
Response: {
  success: true,
  loan: {
    id: "LOAN_HASH...",
    borrower: "rXXX...",
    principal: 200,
    status: "active",
    tier: "emergency",
    createdAt: "2026-03-14T..."
  },
  tier: { tierName: "emergency", InterestRate: 150, ... },
  txHash: "..."
}
```

**Store `loan.id`** — needed for repayment.

**UI suggestions:**
- Show tier selector as cards: Emergency (1.5%, up to $500), Standard (4%, up to $2000), Creditworthy (2%, up to $5000)
- Grey out / disable ineligible tiers with the `reason` message
- Amount input with max validation based on selected tier's `maxPrincipal`

### Loan Tier Summary

| Tier | Rate | Max | Payments | Requires |
|------|------|-----|----------|----------|
| Emergency | 1.5% | $500 | 3 (biweekly) | "employee" credential |
| Standard | 4% | $2,000 | 6 (monthly) | "employee" credential + vault deposit |
| Creditworthy | 2% | $5,000 | 12 (monthly) | "creditworthy" credential (earned by repaying a loan) |

### Flow 5: Repay Loan

```
POST /api/vault/:vaultId/loan/repay
Body: { loanId: "LOAN_HASH...", employeeSeed: "sXXX...", amount: 100 }
Response: {
  success: true,
  loan: { id, borrower, principal, status },
  loanInfo: { PrincipalOutstanding, TotalValueOutstanding, ... },
  credentials: ["employee", "creditworthy"],
  txHash: "..."
}
```

- `loanInfo` is null when fully repaid (ledger object deleted)
- `"creditworthy"` appears in credentials on full repayment

### Flow 6: View Yield Dashboard (401k breakdown)

```
GET /api/vault/:vaultId/employee/:address/yield
Response: {
  deposits: { total: 400, count: 4 },
  employerMatch: {
    totalMatched: 200,
    vested: 50,
    unvested: 150,
    vestPercent: 25,
    nextVestDate: "2027-03-14",
    nextVestAmount: 50
  },
  shares: {
    count: 580,
    price: 1.034,
    currentValue: 599.72
  },
  yield: {
    earned: 0,
    effectiveAPY: 0
  },
  withdrawable: {
    max: 449.72,
    note: "Unvested match ($150) clawed back on withdrawal"
  }
}
```

**UI suggestions:**
- Show deposits and employer match as stacked bar chart
- Vesting progress ring: "25% vested — 1 year cliff"
- Next vest date countdown
- Withdrawable amount prominently displayed with warning about unvested forfeit

### Flow 7: Withdraw (vesting-aware)

```
POST /api/vault/:vaultId/withdraw
Body: { employeeSeed: "sXXX...", amount: 200 }
Response: {
  success: true,
  withdrawn: 200,
  clawedBack: 150,               // unvested employer match forfeited
  vestedRemaining: 50,
  txHash: "...",
  clawbackTxHash: "..."          // null if no clawback needed
}
```

**UI:** Show a confirmation dialog before withdrawal if `unvested > 0`:
> "Withdrawing will forfeit $150 in unvested employer match. Are you sure?"

After withdrawal, show: "Withdrawn: $200 | Forfeited match: $150"

---

## XUMM Transaction Signing

For operations that require signing (deposit, loan draw, repay), the frontend can optionally use XUMM payloads instead of passing seeds:

```
POST /api/xumm/payload
Body: { txjson: { TransactionType: "...", ... }, userToken: "..." }
Response: { payloadId, qrUrl, deepLink, webSocket }

GET /api/xumm/payload/:payloadId
Response: { status: "signed" | "pending" | ... , address: "rXXX..." }
```

For the hackathon demo, seed-based signing works. XUMM payloads are the production path.

---

## Credential Display

| Credential | Meaning | When Issued | On-Chain |
|-----------|---------|-------------|----------|
| `employee` | Verified member of the company vault | Employer adds member | XLS-70 CredentialCreate |
| `creditworthy` | Has fully repaid a loan | Full loan repayment | XLS-70 CredentialCreate |

Show as badges. Credential objects now include `accepted` status:
- `accepted: false` — credential issued but employee hasn't accepted yet
- `accepted: true` — fully active on-chain credential

---

## Auth Architecture Summary

```
Employer:
  1. Connect wallet (XUMM QR scan) → get address
  2. Create vault (seed-based for now)
  3. Add members by their XRPL address

Employee:
  1. Connect wallet (XUMM QR scan) → get address
  2. Enter vault ID
  3. Backend checks on-chain "employee" credential → authenticated
  4. If no credential → "Not a member, ask your employer"
```

---

## Key API Changes from Previous Version

| Before | Now |
|--------|-----|
| No auth | XUMM wallet connect + credential-based membership |
| `POST /api/vault/:id/onboard` only | `POST /api/vault/:id/member` (add by address) + `/member/accept` |
| Employee connected with seed | Employee connects with Xaman wallet, verified by on-chain credential |
| `credentials` was string array | `credentials` now has `{ type, accepted, issuer }` structure |
| No XUMM endpoints | `POST /api/auth/xumm`, `GET /api/auth/xumm/:id`, `POST /api/auth/employee` |
| No credential accept flow | Employee must accept credential after being added |
| Hardcoded 5% loan terms | 3 loan tiers (emergency/standard/creditworthy) with employer-overridable rates |
| No employer match | Auto employer match on deposit (configurable rate + cap) |
| No vesting | Linear vesting with cliff on employer match (configurable schedule) |
| No withdraw endpoint | `POST /api/vault/:id/withdraw` with vesting-aware clawback |
| No yield tracking | `GET /api/vault/:id/employee/:addr/yield` — full 401k breakdown |
| No vault config | `GET/PUT /api/vault/:id/config` — match, vesting, loan tier settings |
| Vault shares transferable | Non-transferable shares (`tfVaultShareNonTransferable`) |

## Error Handling

All errors: `{ error: "message" }` with HTTP status:
- `400` — Missing required fields
- `403` — Missing credential / not a member
- `404` — Vault or loan not found
- `409` — Already a member
- `500` — XRPL transaction failure
- `501` — XUMM not configured

## Environment Variables

```
XUMM_API_KEY=your-key       # Get from https://apps.xumm.dev/
XUMM_API_SECRET=your-secret
PORT=3001                    # Optional, defaults to 3001
```

## Devnet Explorer

`https://devnet.xrpl.org/transactions/{txHash}`
