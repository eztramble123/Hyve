# Hyve

**The on-chain credit union your team deserves.**

Hyve is an XRPL-based employer-sponsored financial wellness platform for small and medium businesses. Employees pool savings into a company vault powered by RLUSD, earn yield, build on-chain credit history, and access fair-rate emergency loans — no bank, no charter, no credit score required.

Built for the [Ripple Track](https://ripple.com/) using real XRPL Devnet transactions with XLS-65, XLS-66, and XLS-70 amendments.

---

## The Problem

78% of Americans live paycheck to paycheck. When an emergency hits — a car repair, a medical bill — their options are brutal:

| Option | Typical Rate |
|--------|-------------|
| Payday loan | **300%+ APR** |
| Credit card | **25% APR** |
| **Hyve vault loan** | **1.5–4% APR** |

SMBs want to help but can't afford 401k infrastructure or credit union charters. Hyve solves this with a self-funding model where **employees fund the pool themselves** — the employer just provides the rails.

## How It Works

```
1. Employer creates a vault     → On-chain savings pool (XLS-65)
2. Employees deposit RLUSD      → Earn vault shares + employer match
3. Employee needs emergency $   → Draws a loan from the pool (XLS-66)
4. Employee repays              → Earns "creditworthy" credential (XLS-70)
5. Credit history is portable   → On-chain, no bank needed
```

### For Employers
- Spin up a vault in minutes — no bank partnership needed
- Configure employer match rate and cap (like a 401k)
- Employees fund the pool — zero capital required from you
- You're the credential issuer, not the lender — no liability

### For Employees
- Deposit savings and earn vault shares
- Access emergency loans at 1.5–4% APR instead of 300%
- No credit score, no SSN required — just your wallet
- Full repayment earns a portable on-chain credit credential
- Vesting schedule on employer match (like a 401k)

## XRPL Primitives Used

Every XRPL primitive in Hyve does real work — this isn't a single-feature demo.

| Primitive | Standard | Role in Hyve |
|-----------|----------|-------------|
| **Single Asset Vault** | XLS-65 | Pools employee RLUSD deposits. Workers receive non-transferable vault shares. |
| **Lending Protocol** | XLS-66 | Fixed-term loans drawn from the vault. Tiered rates, co-signed by employer broker. |
| **Credentials** | XLS-70 | Employer issues "employee" on onboarding. "creditworthy" minted on full repayment. |
| **RLUSD** | — | All deposits, loans, and repayments denominated in Ripple's stablecoin. |
| **MPTokens** | XLS-33 | Vault share tokens auto-issued on deposit. Non-transferable (401k model). |
| **LoanBroker** | XLS-66 | Employer-controlled trust anchor. Gates who can borrow, manages first-loss cover. |

## Architecture

```
frontend/                        — Next.js 15 (App Router, TypeScript, Tailwind CSS 4)
  src/app/
    page.tsx                     — Landing page
    employer/page.tsx            — Employer dashboard (create vault, onboard, manage)
    employee/page.tsx            — Employee dashboard (deposit, borrow, repay, yield)
    about/page.tsx               — About & mission
    contact/page.tsx             — Contact
  src/lib/api.ts                 — API client (all backend calls)

backend/
  server.js                      — Express 5 routes (thin, delegates to services)
  services/
    xrpl-client.js               — Singleton XRPL Devnet client + helpers
    rlusd.js                     — RLUSD issuer setup, trust lines, balances
    vault.js                     — VaultCreate, VaultDeposit, VaultWithdraw, share queries
    loans.js                     — LoanBrokerSet, tiered LoanSet, LoanPay, LoanManage
    credentials.js               — CredentialCreate, CredentialAccept (XLS-70)
    vesting.js                   — Vesting calculation + clawback logic
    xumm.js                      — XUMM/Xaman wallet connect (optional)
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm

### Run Locally

```bash
# Terminal 1: Backend (port 3001)
cd backend
npm install
npm run dev

# Terminal 2: Frontend (port 3000)
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: XUMM Wallet Connect

```bash
export XUMM_API_KEY=your-key
export XUMM_API_SECRET=your-secret
```

Without XUMM configured, the app uses seed-based auth (demo mode).

## Demo Flow

The full end-to-end flow, all on real XRPL Devnet:

### 1. Employer: Initialize & Create Vault
- Go to `/employer` → click **Initialize** (creates RLUSD issuer + employer wallet)
- Set company name, match rate (e.g. 50%), match cap → **Create Vault**
- 3 on-chain transactions: `VaultCreate` + `LoanBrokerSet` + `LoanBrokerCoverDeposit`

### 2. Employer: Onboard Employees
- Enter employee name → **Onboard**
- Creates wallet, funds with test RLUSD, issues on-chain "employee" credential
- Copy the **Vault ID** and **employee seed** — employee needs these to sign in

### 3. Employee: Deposit & Earn Match
- Go to `/employee` → paste Vault ID and seed → **Sign In**
- Deposit RLUSD → employer auto-matches at configured rate
- View 401k breakdown: deposits, match, vesting schedule, share value

### 4. Employee: Draw Emergency Loan
- Select loan tier (Emergency, Standard, or Creditworthy)
- Each tier has different rates, limits, and credential requirements
- Loan principal transferred directly from vault pool to employee wallet

### 5. Employee: Repay & Earn Credit
- Repay in installments or pay in full
- Full repayment triggers "creditworthy" credential on-chain
- Unlocks the creditworthy tier with better rates and higher limits

### 6. Employee: Withdraw
- Withdraw converts vault shares back to RLUSD
- Unvested employer match is automatically clawed back
- Vested portion is yours to keep

## Loan Tiers

| Tier | APR | Max | Payments | Requires |
|------|-----|-----|----------|----------|
| **Emergency** | 1.5% | $500 | 3 (14-day) | `employee` credential |
| **Standard** | 4% | $2,000 | 6 (30-day) | `employee` + vault deposit |
| **Creditworthy** | 2% | $5,000 | 12 (30-day) | `creditworthy` credential |

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/xumm` | Create XUMM SignIn payload |
| GET | `/api/auth/xumm/:payloadId` | Poll sign-in status |
| POST | `/api/auth/employee` | Verify employee via on-chain credential |

### Vault
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/init` | Initialize RLUSD issuer on Devnet |
| POST | `/api/vault/create` | Create vault + loan broker + cover deposit |
| GET | `/api/vault/:id` | Vault info with employees, loans, balances |
| GET | `/api/vault/:id/config` | Vault configuration (match, vesting, tiers) |
| POST | `/api/vault/:id/onboard` | Demo: create wallet + fund + credential |
| POST | `/api/vault/:id/deposit` | Employee deposit + auto employer match |
| POST | `/api/vault/:id/withdraw` | Vesting-aware withdrawal with clawback |

### Loans
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vault/:id/loan/tiers` | Available tiers + eligibility for employee |
| POST | `/api/vault/:id/loan/draw` | Tier-based loan (co-signed by broker) |
| POST | `/api/vault/:id/loan/repay` | Repay loan (creditworthy cred on full repay) |

### Employee
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vault/:id/employee/:addr/yield` | 401k breakdown (deposits, match, vesting, shares) |
| GET | `/api/balance/:address` | Wallet balances + on-chain credentials |

## Deployment (Railway)

Deploy as two services from one repo:

### Backend
- **Root Directory:** `backend`
- Railway auto-detects Node.js, runs `npm start`
- Generate a public domain

### Frontend
- **Root Directory:** `frontend`
- Add env variable: `NEXT_PUBLIC_API_URL=https://your-backend.up.railway.app`
- Generate a public domain

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS 4 |
| Backend | Express 5, xrpl.js 4.6.0, xumm-sdk |
| Blockchain | XRPL Devnet (XLS-65/66/70 amendments) |
| Stablecoin | RLUSD (hex-encoded, mainnet-compatible format) |

## Key Design Decisions

- **Financial state lives on-chain** — balances, shares, loans, and credentials are read from the real XRPL ledger
- **App-level metadata is in-memory** — company name, employee roster, vesting state are lost on restart (acceptable for hackathon)
- **Non-transferable shares** — vault shares can't be traded, only withdrawn through the vault (401k model)
- **Employer match auto-fires** — on employee deposit, employer match is deposited automatically (silently skips if insufficient balance)
- **Credential-gated loans** — on-chain credentials control who can borrow and at what tier
- **Co-signed loans** — every loan requires both borrower and broker signatures (prevents unauthorized borrowing)

## Notes

- Uses **XRPL Devnet** (`wss://s.devnet.rippletest.net:51233/`) — Devnet may reset periodically, wiping all on-chain state
- All test tokens — no real money involved
- Every action produces a real transaction hash viewable on [devnet.xrpl.org](https://devnet.xrpl.org)

---

Built for the Ripple Hackathon Track.
