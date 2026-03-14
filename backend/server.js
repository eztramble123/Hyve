import express from "express";
import cors from "cors";
import { createFundedWallet } from "./services/xrpl-client.js";
import { setupRLUSDIssuer, getRLUSDIssuer, setupRLUSDTrustLine, fundWithRLUSD, getRLUSDBalance, getXRPBalance } from "./services/rlusd.js";
import { createVault, depositToVault, withdrawFromVault, getVaultInfo, clawbackVaultShares } from "./services/vault.js";
import { setupLoanBroker, depositCover, createLoan, repayLoan, getLoanInfo, defaultLoan } from "./services/loans.js";
import { issueCredential, acceptCredential, getCredentials, hasCredential } from "./services/credentials.js";
import { getClient } from "./services/xrpl-client.js";

const app = express();
app.use(cors());
app.use(express.json());

// --- In-memory app-level state (not financial state — that's on-chain) ---
const vaults = new Map(); // vaultId -> { companyName, employerSeed, employerAddress, loanBrokerId, employees[] }

// --- Health ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", network: "devnet", rlusdIssuer: getRLUSDIssuer()?.address || null });
});

// --- Initialize RLUSD issuer on Devnet ---
app.post("/api/init", async (req, res) => {
  try {
    const issuer = await setupRLUSDIssuer();
    res.json({ success: true, issuerAddress: issuer.address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Wallet ---
app.post("/api/wallet/create", async (req, res) => {
  try {
    const wallet = await createFundedWallet();
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employer: Create Vault (real VaultCreate + LoanBrokerSet) ---
app.post("/api/vault/create", async (req, res) => {
  try {
    const { employerSeed, companyName } = req.body;

    // Ensure RLUSD issuer exists
    await setupRLUSDIssuer();

    // Employer needs RLUSD trust line + funds for cover deposit
    await setupRLUSDTrustLine(employerSeed);
    await fundWithRLUSD(
      (await import("./services/xrpl-client.js")).walletFromSeed(employerSeed).address,
      5000
    );

    // Real VaultCreate on-chain
    const { vaultId, txHash: vaultTxHash } = await createVault(employerSeed);

    // Set up LoanBroker attached to vault
    const { loanBrokerId, txHash: brokerTxHash } = await setupLoanBroker(employerSeed, vaultId);

    // Deposit first-loss cover capital (employer funds the cover)
    const { txHash: coverTxHash } = await depositCover(employerSeed, loanBrokerId, 500);

    const employerAddress = (await import("./services/xrpl-client.js")).walletFromSeed(employerSeed).address;

    vaults.set(vaultId, {
      id: vaultId,
      companyName: companyName || "Hyve Vault",
      employerSeed,
      employerAddress,
      loanBrokerId,
      employees: [],
      loans: [],
    });

    res.json({
      success: true,
      vaultId,
      loanBrokerId,
      vaultAddress: employerAddress,
      txHashes: { vaultCreate: vaultTxHash, loanBroker: brokerTxHash, coverDeposit: coverTxHash },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employer: Onboard Employee ---
app.post("/api/vault/:vaultId/onboard", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeName } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    // Create employee wallet on Devnet
    const empWallet = await createFundedWallet();

    // Set up RLUSD trust line
    await setupRLUSDTrustLine(empWallet.seed);

    // Fund employee with RLUSD (simulated payroll)
    await fundWithRLUSD(empWallet.address, 1000);

    // Issue real on-chain "employee" credential
    const { txHash: credTxHash } = await issueCredential(
      vault.employerSeed,
      empWallet.address,
      "employee"
    );

    // Employee accepts the credential
    const { txHash: acceptTxHash } = await acceptCredential(
      empWallet.seed,
      vault.employerAddress,
      "employee"
    );

    const employee = {
      name: employeeName,
      address: empWallet.address,
      seed: empWallet.seed,
    };

    vault.employees.push(employee);

    res.json({
      success: true,
      employee: {
        name: employee.name,
        address: employee.address,
        seed: employee.seed,
        rlusdBalance: 1000,
        credentials: ["employee"],
      },
      txHashes: { credentialCreate: credTxHash, credentialAccept: acceptTxHash },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employee: Deposit to Vault (real VaultDeposit) ---
app.post("/api/vault/:vaultId/deposit", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const { txHash } = await depositToVault(vaultId, employeeSeed, amount);

    // Read real vault state from ledger
    const vaultInfo = await getVaultInfo(vaultId);

    res.json({
      success: true,
      deposited: amount,
      totalVaultBalance: vaultInfo.AssetsTotal || vaultInfo.Asset?.value || 0,
      txHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employee: Draw Loan (real LoanSet) ---
app.post("/api/vault/:vaultId/loan/draw", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeAddress, employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    // Check real on-chain credential
    const hasEmpCred = await hasCredential(employeeAddress, "employee");
    if (!hasEmpCred) {
      return res.status(403).json({ error: "Missing employee credential" });
    }

    // Real LoanSet — principal auto-transferred from vault to borrower
    const { loanId, txHash } = await createLoan(
      vault.employerSeed,
      vault.loanBrokerId,
      employeeAddress,
      amount
    );

    const loan = {
      id: loanId,
      borrower: employeeAddress,
      borrowerSeed: employeeSeed,
      principal: amount,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    vault.loans.push(loan);

    res.json({ success: true, loan, txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employee: Repay Loan (real LoanPay) ---
app.post("/api/vault/:vaultId/loan/repay", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { loanId, employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const loan = vault.loans.find((l) => l.id === loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    // Real LoanPay
    const { txHash } = await repayLoan(employeeSeed, loanId, amount);

    // Read loan state from ledger to check if fully repaid
    let loanInfo;
    let fullyRepaid = false;
    try {
      loanInfo = await getLoanInfo(loanId);
      fullyRepaid = loanInfo.PrincipalOutstanding === "0" || !loanInfo;
    } catch {
      // Loan object deleted = fully repaid
      fullyRepaid = true;
    }

    if (fullyRepaid) {
      loan.status = "repaid";
      // Issue "creditworthy" credential on full repayment
      try {
        await issueCredential(vault.employerSeed, loan.borrower, "creditworthy");
        await acceptCredential(loan.borrowerSeed, vault.employerAddress, "creditworthy");
      } catch (credErr) {
        console.warn("Failed to issue creditworthy credential:", credErr.message);
      }
    }

    const credentials = await getCredentials(loan.borrower);

    res.json({
      success: true,
      loan,
      loanInfo,
      credentials: credentials.map((c) => c.credentialType),
      txHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get Vault Info (reads real ledger objects) ---
app.get("/api/vault/:vaultId", async (req, res) => {
  try {
    const vault = vaults.get(req.params.vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    // Read real vault state from ledger
    let vaultInfo;
    try {
      vaultInfo = await getVaultInfo(req.params.vaultId);
    } catch {
      vaultInfo = null;
    }

    // Read real balances and credentials for each employee
    const employeesWithBalances = await Promise.all(
      vault.employees.map(async (emp) => {
        const credentials = await getCredentials(emp.address);
        return {
          name: emp.name,
          address: emp.address,
          seed: emp.seed,
          rlusdBalance: await getRLUSDBalance(emp.address),
          credentials: credentials.map((c) => c.credentialType),
        };
      })
    );

    // Read real loan info from ledger
    const loansWithInfo = await Promise.all(
      vault.loans.map(async (loan) => {
        let loanInfo = null;
        try {
          loanInfo = await getLoanInfo(loan.id);
        } catch {
          // Loan may be deleted if fully repaid
        }
        return {
          ...loan,
          remaining: loanInfo?.PrincipalOutstanding || "0",
          loanInfo,
        };
      })
    );

    res.json({
      id: vault.id,
      companyName: vault.companyName,
      employerAddress: vault.employerAddress,
      loanBrokerId: vault.loanBrokerId,
      vaultLedgerObject: vaultInfo,
      vaultBalance: vaultInfo?.AssetsTotal || "0",
      employees: employeesWithBalances,
      loans: loansWithInfo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get Balances ---
app.get("/api/balance/:address", async (req, res) => {
  try {
    const rlusd = await getRLUSDBalance(req.params.address);
    const xrp = await getXRPBalance(req.params.address);
    const credentials = await getCredentials(req.params.address);
    res.json({
      address: req.params.address,
      rlusd,
      xrp,
      credentials: credentials.map((c) => c.credentialType),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employer: Clawback vault shares from employee ---
app.post("/api/vault/:vaultId/clawback", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeAddress, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const { txHash } = await clawbackVaultShares(vaultId, employeeAddress, amount);
    res.json({ success: true, txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employer: Default a delinquent loan ---
app.post("/api/vault/:vaultId/loan/:loanId/default", async (req, res) => {
  try {
    const { vaultId, loanId } = req.params;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const { txHash } = await defaultLoan(vault.employerSeed, loanId);

    const loan = vault.loans.find((l) => l.id === loanId);
    if (loan) loan.status = "defaulted";

    res.json({ success: true, txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- On-chain transaction history for vault ---
app.get("/api/vault/:vaultId/ledger", async (req, res) => {
  try {
    const vault = vaults.get(req.params.vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const c = await getClient();
    const response = await c.request({
      command: "account_tx",
      account: vault.employerAddress,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 50,
    });

    res.json({
      transactions: response.result.transactions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Hyve backend running on http://localhost:${PORT}`);
  console.log("Connecting to XRPL Devnet...");
});
