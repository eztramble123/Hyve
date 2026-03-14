# Hyve — On-Chain Credit Union for SMBs

## What This Is
XRPL-based employer-sponsored financial wellness platform. Employees pool savings into a company vault (powered by RLUSD), earn yield, and can borrow at fair rates. Employers issue on-chain credentials to workers.

## Architecture

```
frontend/   — Next.js 15 (App Router, TypeScript, Tailwind)
backend/    — Node.js/Express API server with xrpl.js
```

Both talk to **XRPL Testnet** (`wss://s.altnet.rippletest.net:51233/`).

## How to Run

```bash
# Terminal 1: Backend (port 3001)
cd backend && npm install && npm run dev

# Terminal 2: Frontend (port 3000)
cd frontend && npm install && npm run dev
```

Then open http://localhost:3000

## Demo Flow
1. Go to `/employer` → Initialize → Create Vault
2. Onboard 2 employees (each gets a wallet, RLUSD trust line, 1000 RLUSD, and "employee" credential)
3. Copy an employee's seed → go to `/employee` → Connect with vault ID + seed
4. Deposit RLUSD into the vault
5. Draw an emergency loan from the vault pool
6. Repay the loan → "creditworthy" credential is automatically issued

## Key XRPL Primitives Used
- **RLUSD** — stablecoin inside the vault (simulated via custom token on testnet)
- **Trust Lines** — each wallet sets up RLUSD trust line to receive tokens
- **Credentials** — "employee" and "creditworthy" (in-memory for hackathon, would be XLS-70 in prod)
- **Payments** — deposits, loan draws, and repayments are all XRPL Payment transactions

## Backend API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/init` | Initialize RLUSD issuer on testnet |
| POST | `/api/wallet/create` | Create funded testnet wallet |
| POST | `/api/vault/create` | Create company vault |
| POST | `/api/vault/:id/onboard` | Onboard employee (wallet + trust line + credential) |
| POST | `/api/vault/:id/deposit` | Employee deposits RLUSD |
| POST | `/api/vault/:id/loan/draw` | Draw loan from vault |
| POST | `/api/vault/:id/loan/repay` | Repay loan (issues "creditworthy" on full repay) |
| GET  | `/api/vault/:id` | Get vault info with balances |
| GET  | `/api/balance/:address` | Get wallet balances |

## Frontend Pages
- `/` — Landing page
- `/employer` — Employer dashboard (create vault, onboard employees, view pool)
- `/employee` — Employee dashboard (deposit, loans, repayment, credentials)

## Stack
- Next.js 15, React 19, TypeScript, Tailwind CSS 4
- Express 5, xrpl.js 4
- XRPL Testnet

## Notes
- All state is in-memory on the backend (no database) — restart clears everything
- Wallet seeds are shown in the UI for demo purposes — obviously never do this in production
- RLUSD is simulated as a custom issued token; in production it would be the real RLUSD issuer
