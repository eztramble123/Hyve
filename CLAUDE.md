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
    vault.js                -- VaultCreate (non-transferable shares), VaultDeposit, VaultWithdraw, share balance query (XLS-65)
    loans.js                -- LoanBrokerSet, tier-based LoanSet, LoanPay (XLS-66)
    vesting.js              -- Vesting calculation + clawback logic (pure business logic, in-memory)
    credentials.js          -- Real CredentialCreate, CredentialAccept (XLS-70)
    xumm.js                 -- XUMM/Xaman wallet connect + tx payload signing
```

Uses **XRPL Devnet** (`wss://s.devnet.rippletest.net:51233/`) with real XLS-65/66/70 amendments.

## How to Run

```bash
# Terminal 1: Backend (port 3001)
cd backend && npm install && npm run dev

# Optional: Enable XUMM wallet connect
export XUMM_API_KEY=your-key
export XUMM_API_SECRET=your-secret

# Terminal 2: Frontend (port 3000)
cd frontend && npm install && npm run dev
```

## Authentication

- **XUMM Wallet Connect** — Employer and employee scan QR with Xaman app to prove wallet ownership
- **Credential-Based Membership** — Employee auth verified by on-chain "employee" credential (XLS-70)
- **Fallback** — Seed-based auth when XUMM is not configured (demo mode)

## Demo Flow
1. `POST /api/init` → RLUSD issuer created on Devnet
2. Employer connects via XUMM → `POST /api/vault/create` with match/vesting config → VaultCreate (non-transferable shares) + LoanBrokerSet
3. Employer adds members: `POST /api/vault/:id/member` → issues "employee" credential
4. Employee connects via XUMM → `POST /api/auth/employee` → verified by on-chain credential
5. Employee: `POST /api/vault/:id/deposit` → VaultDeposit + auto employer match deposit
6. `GET /api/vault/:id/loan/tiers?address=rXXX` → check eligible loan tiers
7. Employee: `POST /api/vault/:id/loan/draw` with `tier: "emergency"` → LoanSet at tier rates
8. Employee: `POST /api/vault/:id/loan/repay` → LoanPay, "creditworthy" credential on full repayment → unlocks creditworthy tier
9. `GET /api/vault/:id/employee/:addr/yield` → 401k breakdown (deposits, match, vesting, shares, yield)
10. Employee: `POST /api/vault/:id/withdraw` → vesting-aware withdrawal, unvested match clawed back

## Key XRPL Primitives Used
- **SingleAssetVault (XLS-65)** — VaultCreate, VaultDeposit, VaultWithdraw, VaultClawback
- **LendingProtocol (XLS-66)** — LoanBrokerSet, LoanBrokerCoverDeposit, LoanSet (co-signed), LoanPay, LoanManage
- **Credentials (XLS-70)** — CredentialCreate, CredentialAccept (on-chain "employee" + "creditworthy")
- **MPTokensV1** — Vault share tokens (auto-issued by ledger on deposit)
- **RLUSD** — Hex-encoded currency (`524C555344...`) matching mainnet standard

## Backend API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/xumm` | Create XUMM SignIn payload (returns QR URL) |
| GET  | `/api/auth/xumm/:payloadId` | Poll sign-in status → returns wallet address |
| POST | `/api/auth/employee` | Verify employee membership via on-chain credential |

### Vault Management
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/init` | Initialize RLUSD issuer on Devnet |
| POST | `/api/vault/create` | Real VaultCreate + LoanBrokerSet + cover deposit |
| POST | `/api/vault/:id/member` | Add member by XRPL address (issues credential) |
| POST | `/api/vault/:id/member/accept` | Employee accepts credential |
| POST | `/api/vault/:id/onboard` | Demo: create wallet + fund + credential in one call |
| POST | `/api/vault/:id/deposit` | Real VaultDeposit |
| POST | `/api/vault/:id/loan/draw` | Real LoanSet (co-signed by borrower) |
| POST | `/api/vault/:id/loan/repay` | Real LoanPay (creditworthy on full repay) |
| GET  | `/api/vault/:id` | Vault info from real ledger objects |
| GET  | `/api/balance/:address` | Wallet balances + on-chain credentials |
| POST | `/api/vault/:id/clawback` | VaultClawback — employer reclaims shares |
| POST | `/api/vault/:id/loan/:loanId/default` | LoanManage(tfLoanDefault) — default a loan |
| GET  | `/api/vault/:id/ledger` | On-chain transaction history |

### XUMM
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/xumm/payload` | Create XUMM tx signing payload |
| GET  | `/api/xumm/payload/:payloadId` | Check payload status |

## Frontend Pages
- `/` — Landing page
- `/employer` — Employer dashboard (create vault, add members, view pool)
- `/employee` — Employee dashboard (deposit, loans, repayment, credentials)

## Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Express 5, xrpl.js 4.6.0, xumm-sdk
- XRPL Devnet (all XLS-65/66/70 amendments enabled)

## Notes
- Financial state (balances, shares, loans, credentials) comes from the real XRPL ledger
- App-level metadata (company name, employee list) is in-memory — restart clears it
- Devnet may reset periodically, wiping all on-chain state
- XUMM wallet connect is optional — works without it using seed-based auth
- LoanSet requires counterparty co-signature (borrower + broker both sign)
- All responses include txHash fields linking to devnet explorer
- See `FRONTEND_SPEC.md` for detailed API contract and UI flow descriptions
