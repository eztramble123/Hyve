import express from "express";
import cors from "cors";
import {
  createFundedWallet,
  setupRLUSDIssuer,
  setupRLUSDTrustLine,
  fundWithRLUSD,
  depositToVault,
  drawLoan,
  repayLoan,
  getRLUSDBalance,
  getXRPBalance,
  issueCredential,
  getCredentials,
  hasCredential,
  getRLUSDIssuer,
} from "./xrpl-service.js";

const app = express();
app.use(cors());
app.use(express.json());

// --- In-memory state for demo ---
const vaults = new Map(); // vaultId -> { employer, vault wallet, employees, loans, totalDeposits }
let vaultCounter = 0;

// --- Health ---
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", rlusdIssuer: getRLUSDIssuer()?.address || null });
});

// --- Initialize RLUSD issuer ---
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

// --- Employer: Create Vault ---
app.post("/api/vault/create", async (req, res) => {
  try {
    const { employerSeed, companyName } = req.body;

    // Create vault wallet
    const vaultWallet = await createFundedWallet();

    // Set up RLUSD trust line on vault
    await setupRLUSDTrustLine(vaultWallet.seed);

    const vaultId = `vault_${++vaultCounter}`;
    vaults.set(vaultId, {
      id: vaultId,
      companyName: companyName || "Hyve Vault",
      employerSeed,
      vaultAddress: vaultWallet.address,
      vaultSeed: vaultWallet.seed,
      employees: [],
      loans: [],
      totalDeposits: 0,
    });

    res.json({
      success: true,
      vaultId,
      vaultAddress: vaultWallet.address,
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

    // Create employee wallet
    const empWallet = await createFundedWallet();

    // Set up RLUSD trust line
    await setupRLUSDTrustLine(empWallet.seed);

    // Fund employee with some RLUSD (simulated payroll)
    await fundWithRLUSD(empWallet.address, 1000);

    // Issue "employee" credential
    const cred = issueCredential(
      vault.vaultAddress,
      empWallet.address,
      "employee"
    );

    const employee = {
      name: employeeName,
      address: empWallet.address,
      seed: empWallet.seed,
      shares: 0,
      credentials: cred.credentials,
    };

    vault.employees.push(employee);

    res.json({
      success: true,
      employee: {
        name: employee.name,
        address: employee.address,
        seed: employee.seed,
        rlusdBalance: 1000,
        credentials: employee.credentials,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employee: Deposit to Vault ---
app.post("/api/vault/:vaultId/deposit", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const success = await depositToVault(
      employeeSeed,
      vault.vaultAddress,
      amount
    );
    if (!success) return res.status(400).json({ error: "Deposit failed" });

    // Update shares
    const emp = vault.employees.find(
      (e) => e.seed === employeeSeed
    );
    if (emp) {
      emp.shares += amount;
    }
    vault.totalDeposits += amount;

    res.json({
      success: true,
      deposited: amount,
      totalVaultBalance: vault.totalDeposits,
      shares: emp?.shares || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employee: Request Loan ---
app.post("/api/vault/:vaultId/loan/draw", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeAddress, employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    // Check credential
    if (!hasCredential(employeeAddress, "employee")) {
      return res.status(403).json({ error: "Missing employee credential" });
    }

    // Check vault has enough
    const vaultBalance = await getRLUSDBalance(vault.vaultAddress);
    if (vaultBalance < amount) {
      return res.status(400).json({ error: "Insufficient vault funds" });
    }

    // Draw loan
    const success = await drawLoan(vault.vaultSeed, employeeAddress, amount);
    if (!success) return res.status(400).json({ error: "Loan draw failed" });

    const loan = {
      id: `loan_${Date.now()}`,
      borrower: employeeAddress,
      borrowerSeed: employeeSeed,
      principal: amount,
      remaining: amount,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    vault.loans.push(loan);

    res.json({ success: true, loan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Employee: Repay Loan ---
app.post("/api/vault/:vaultId/loan/repay", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { loanId, employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const loan = vault.loans.find((l) => l.id === loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const repayAmount = Math.min(amount, loan.remaining);
    const success = await repayLoan(
      employeeSeed,
      vault.vaultAddress,
      repayAmount
    );
    if (!success) return res.status(400).json({ error: "Repayment failed" });

    loan.remaining -= repayAmount;
    if (loan.remaining <= 0) {
      loan.status = "repaid";
      // Issue creditworthy credential on full repayment
      issueCredential(vault.vaultAddress, loan.borrower, "creditworthy");
    }

    const credentials = getCredentials(loan.borrower);

    res.json({
      success: true,
      loan,
      credentials,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get Vault Info ---
app.get("/api/vault/:vaultId", async (req, res) => {
  try {
    const vault = vaults.get(req.params.vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const vaultBalance = await getRLUSDBalance(vault.vaultAddress);

    const employeesWithBalances = await Promise.all(
      vault.employees.map(async (emp) => ({
        name: emp.name,
        address: emp.address,
        seed: emp.seed,
        shares: emp.shares,
        rlusdBalance: await getRLUSDBalance(emp.address),
        credentials: getCredentials(emp.address),
      }))
    );

    res.json({
      id: vault.id,
      companyName: vault.companyName,
      vaultAddress: vault.vaultAddress,
      vaultSeed: vault.vaultSeed,
      vaultBalance,
      totalDeposits: vault.totalDeposits,
      employees: employeesWithBalances,
      loans: vault.loans,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Get Employee Balances ---
app.get("/api/balance/:address", async (req, res) => {
  try {
    const rlusd = await getRLUSDBalance(req.params.address);
    const xrp = await getXRPBalance(req.params.address);
    const credentials = getCredentials(req.params.address);
    res.json({ address: req.params.address, rlusd, xrp, credentials });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Hyve backend running on http://localhost:${PORT}`);
  console.log("Connecting to XRPL Testnet...");
});
