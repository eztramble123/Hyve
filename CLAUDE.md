# Hyve — On-Chain Credit Union for SMBs

## What This Is
XRPL-based employer-sponsored financial wellness platform. Employees pool savings into a company vault (powered by RLUSD), earn yield, and can borrow at fair rates. Employers issue on-chain credentials to workers.

## Architecture

```
frontend/   — Next.js 15 (App Router, TypeScript, Tailwind)
backend/
  server.js                 -- Express routes (thin, delegates to services)
  services/
    xrpl-client.js          -- Singleton XRPL Devnet client + helpers
    rlusd.js                -- RLUSD issuer setup, trust lines, balances
    vault.js                -- Real VaultCreate, VaultDeposit, VaultWithdraw (XLS-65)
    loans.js                -- Real LoanBrokerSet, LoanSet, LoanPay (XLS-66)
    credentials.js          -- Real CredentialCreate, CredentialAccept (XLS-70)
```

Uses **XRPL Devnet** (`wss://s.devnet.rippletest.net:51233/`) with real XLS-65/66/70 amendments.

## How to Run

```bash
# Terminal 1: Backend (port 3001)
cd backend && npm install && npm run dev

# Terminal 2: Frontend (port 3000)
cd frontend && npm install && npm run dev
```

Then open http://localhost:3000

## Demo Flow
1. `POST /api/init` → RLUSD issuer created on Devnet
2. Employer: `POST /api/vault/create` → real VaultCreate + LoanBrokerSet on-chain
3. Employer: `POST /api/vault/:id/onboard` × 2 → wallets + trust lines + CredentialCreate("employee")
4. Employee: `POST /api/vault/:id/deposit` → real VaultDeposit, gets MPT shares
5. Employee: `POST /api/vault/:id/loan/draw` → real LoanSet, principal auto-transferred
6. Employee: `POST /api/vault/:id/loan/repay` → real LoanPay, then CredentialCreate("creditworthy") on full repayment
7. `GET /api/vault/:id` → all state read from real ledger objects

## Key XRPL Primitives Used
- **SingleAssetVault (XLS-65)** — VaultCreate, VaultDeposit, VaultWithdraw, VaultClawback
- **LendingProtocol (XLS-66)** — LoanBrokerSet, LoanBrokerCoverDeposit, LoanSet, LoanPay, LoanManage
- **Credentials (XLS-70)** — CredentialCreate, CredentialAccept (on-chain "employee" + "creditworthy")
- **MPTokensV1** — Vault share tokens (auto-issued by ledger on deposit)
- **RLUSD** — Custom issued token as vault base asset (with clawback enabled)

## Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/init` | Initialize RLUSD issuer on Devnet |
| POST | `/api/wallet/create` | Create funded Devnet wallet |
| POST | `/api/vault/create` | Real VaultCreate + LoanBrokerSet + cover deposit |
| POST | `/api/vault/:id/onboard` | Onboard employee (wallet + trust line + CredentialCreate + CredentialAccept) |
| POST | `/api/vault/:id/deposit` | Real VaultDeposit |
| POST | `/api/vault/:id/loan/draw` | Real LoanSet (principal auto-transferred) |
| POST | `/api/vault/:id/loan/repay` | Real LoanPay (creditworthy credential on full repay) |
| GET  | `/api/vault/:id` | Vault info from real ledger objects |
| GET  | `/api/balance/:address` | Wallet balances + on-chain credentials |
| POST | `/api/vault/:id/clawback` | VaultClawback — employer reclaims shares |
| POST | `/api/vault/:id/loan/:loanId/default` | LoanManage(tfLoanDefault) — default a loan |
| GET  | `/api/vault/:id/ledger` | On-chain transaction history |

## Frontend Pages
- `/` — Landing page
- `/employer` — Employer dashboard (create vault, onboard employees, view pool)
- `/employee` — Employee dashboard (deposit, loans, repayment, credentials)

## Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Express 5, xrpl.js 4.6.0
- XRPL Devnet (all XLS-65/66/70 amendments enabled)

## Notes
- Financial state (balances, shares, loans, credentials) comes from the real XRPL ledger
- App-level metadata (company name, employee list with seeds) is in-memory — restart clears it
- Devnet may reset periodically, wiping all on-chain state
- Wallet seeds are shown in the UI for demo purposes — never do this in production
- All responses include txHash fields linking to devnet explorer
