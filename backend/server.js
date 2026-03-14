import express from "express";
import cors from "cors";
import { createFundedWallet, walletFromSeed } from "./services/xrpl-client.js";
import { setupRLUSDIssuer, getRLUSDIssuer, setupRLUSDTrustLine, fundWithRLUSD, getRLUSDBalance, getXRPBalance } from "./services/rlusd.js";
import { createVault, depositToVault, withdrawFromVault, getVaultInfo, clawbackVaultShares, getVaultShareBalance } from "./services/vault.js";
import { setupLoanBroker, depositCover, createLoan, repayLoan, getLoanInfo, defaultLoan, getLoanTierDefaults, mergeTierOverrides } from "./services/loans.js";
import { issueCredential, acceptCredential, getCredentials, hasCredential } from "./services/credentials.js";
import { calculateVestedAmount, calculateClawbackOnWithdraw } from "./services/vesting.js";
import { createSignIn, getPayloadStatus, createTxPayload, getSignedTxBlob } from "./services/xumm.js";
import { getClient } from "./services/xrpl-client.js";

const app = express();
app.use(cors());
app.use(express.json());

// --- In-memory app-level state (not financial state — that's on-chain) ---
const vaults = new Map(); // vaultId -> { companyName, employerSeed, employerAddress, loanBrokerId, employees[] }

// Check if XUMM is configured
function xummEnabled() {
  return !!(process.env.XUMM_API_KEY && process.env.XUMM_API_SECRET);
}

// ==========================================
// AUTH — XUMM Wallet Connect
// ==========================================

// Create a XUMM SignIn request — frontend shows QR for user to scan with Xaman
app.post("/api/auth/xumm", async (req, res) => {
  try {
    if (!xummEnabled()) {
      return res.status(501).json({ error: "XUMM not configured. Set XUMM_API_KEY and XUMM_API_SECRET." });
    }
    const payload = await createSignIn();
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Poll XUMM payload status — returns wallet address once user signs
app.get("/api/auth/xumm/:payloadId", async (req, res) => {
  try {
    if (!xummEnabled()) {
      return res.status(501).json({ error: "XUMM not configured" });
    }
    const result = await getPayloadStatus(req.params.payloadId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee auth: connect wallet + verify membership via on-chain credential
app.post("/api/auth/employee", async (req, res) => {
  try {
    const { address, vaultId } = req.body;
    if (!address || !vaultId) {
      return res.status(400).json({ error: "address and vaultId required" });
    }

    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    // Check on-chain "employee" credential issued by this vault's employer
    const creds = await getCredentials(address);
    const employeeCred = creds.find(
      (c) => c.credentialType === "employee" && c.issuer === vault.employerAddress && c.accepted
    );

    if (!employeeCred) {
      return res.status(403).json({
        error: "No valid employee credential found for this vault",
        hint: "Ask your employer to add you as a member",
      });
    }

    // Find employee in vault's member list
    const emp = vault.employees.find((e) => e.address === address);

    const rlusd = await getRLUSDBalance(address);
    const xrp = await getXRPBalance(address);

    res.json({
      authenticated: true,
      address,
      vaultId,
      name: emp?.name || null,
      rlusdBalance: rlusd,
      xrpBalance: xrp,
      credentials: creds.map((c) => c.credentialType),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// SYSTEM
// ==========================================

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    network: "devnet",
    rlusdIssuer: getRLUSDIssuer()?.address || null,
    xummEnabled: xummEnabled(),
  });
});

app.post("/api/init", async (req, res) => {
  try {
    const issuer = await setupRLUSDIssuer();
    res.json({ success: true, issuerAddress: issuer.address });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/wallet/create", async (req, res) => {
  try {
    const wallet = await createFundedWallet();
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// EMPLOYER — Vault Management
// ==========================================

// Create Vault (real VaultCreate + LoanBrokerSet)
app.post("/api/vault/create", async (req, res) => {
  try {
    const {
      employerSeed, companyName,
      matchRate = 0.5, matchCap = 500,
      vestingType = "linear", vestingPeriods = 4, cliffMonths = 12,
      loanTierOverrides = {},
    } = req.body;

    await setupRLUSDIssuer();

    const employerAddress = walletFromSeed(employerSeed).address;

    // Employer needs RLUSD trust line + funds for cover deposit
    await setupRLUSDTrustLine(employerSeed);
    await fundWithRLUSD(employerAddress, 5000);

    const vaultConfig = {
      match: { rate: matchRate, capPerEmployee: matchCap },
      vesting: { type: vestingType, periodMonths: 12, totalPeriods: vestingPeriods, cliffMonths },
      loanTiers: {
        emergency: { enabled: true, ...(loanTierOverrides.emergency || {}) },
        standard: { enabled: true, ...(loanTierOverrides.standard || {}) },
        creditworthy: { enabled: true, ...(loanTierOverrides.creditworthy || {}) },
      },
    };

    // Real VaultCreate on-chain with non-transferable shares
    const { vaultId, txHash: vaultTxHash } = await createVault(employerSeed, {
      nonTransferable: true,
      configData: { matchRate, vestingType },
    });

    // Set up LoanBroker attached to vault
    const { loanBrokerId, txHash: brokerTxHash } = await setupLoanBroker(employerSeed, vaultId);

    // Deposit first-loss cover capital
    const { txHash: coverTxHash } = await depositCover(employerSeed, loanBrokerId, 500);

    vaults.set(vaultId, {
      id: vaultId,
      companyName: companyName || "Hyve Vault",
      employerSeed,
      employerAddress,
      loanBrokerId,
      config: vaultConfig,
      employees: [],
      loans: [],
    });

    res.json({
      success: true,
      vaultId,
      loanBrokerId,
      vaultAddress: employerAddress,
      config: vaultConfig,
      txHashes: { vaultCreate: vaultTxHash, loanBroker: brokerTxHash, coverDeposit: coverTxHash },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add Member — employer adds an employee by their XRPL address
// Issues on-chain "employee" credential. Employee must accept it.
app.post("/api/vault/:vaultId/member", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeAddress, employeeName } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    if (!employeeAddress) {
      return res.status(400).json({ error: "employeeAddress required" });
    }

    // Check if already a member
    const existing = vault.employees.find((e) => e.address === employeeAddress);
    if (existing) {
      return res.status(409).json({ error: "Already a member of this vault" });
    }

    // Issue real on-chain "employee" credential
    const { txHash: credTxHash } = await issueCredential(
      vault.employerSeed,
      employeeAddress,
      "employee"
    );

    const employee = {
      name: employeeName || null,
      address: employeeAddress,
      deposits: [],
      matchDeposits: [],
      totalDeposited: 0,
      totalMatched: 0,
    };
    vault.employees.push(employee);

    res.json({
      success: true,
      employee,
      credentialStatus: "issued_pending_accept",
      txHash: credTxHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept credential — employee accepts the "employee" credential
// Called after employer adds them as a member
app.post("/api/vault/:vaultId/member/accept", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeSeed } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const { txHash } = await acceptCredential(
      employeeSeed,
      vault.employerAddress,
      "employee"
    );

    const address = walletFromSeed(employeeSeed).address;
    const creds = await getCredentials(address);

    res.json({
      success: true,
      address,
      credentials: creds.map((c) => c.credentialType),
      txHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Onboard Employee (demo helper — creates wallet + trust line + funds + credential in one call)
// For real usage, use /member + /member/accept with user's existing Xaman wallet
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
      deposits: [],
      matchDeposits: [],
      totalDeposited: 0,
      totalMatched: 0,
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

// ==========================================
// EMPLOYEE — Vault Operations
// ==========================================

// Deposit to Vault (real VaultDeposit + auto employer match)
app.post("/api/vault/:vaultId/deposit", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const employeeAddress = walletFromSeed(employeeSeed).address;

    // 1. Employee deposit
    const { txHash } = await depositToVault(vaultId, employeeSeed, amount);

    // Track employee deposit
    let emp = vault.employees.find((e) => e.address === employeeAddress);
    if (emp) {
      emp.deposits = emp.deposits || [];
      emp.deposits.push({ amount: Number(amount), timestamp: new Date().toISOString(), txHash });
      emp.totalDeposited = (emp.totalDeposited || 0) + Number(amount);
    }

    // 2. Auto employer match
    let matchAmount = 0;
    let matchTxHash = null;
    const matchConfig = vault.config?.match;
    if (matchConfig && matchConfig.rate > 0 && emp) {
      const alreadyMatched = emp.totalMatched || 0;
      const rawMatch = Number(amount) * matchConfig.rate;
      matchAmount = Math.min(rawMatch, (matchConfig.capPerEmployee || Infinity) - alreadyMatched);
      matchAmount = Math.max(0, Math.round(matchAmount * 100) / 100);

      if (matchAmount > 0) {
        try {
          const matchResult = await depositToVault(vaultId, vault.employerSeed, matchAmount);
          matchTxHash = matchResult.txHash;
          emp.matchDeposits = emp.matchDeposits || [];
          emp.matchDeposits.push({ amount: matchAmount, timestamp: new Date().toISOString(), txHash: matchTxHash });
          emp.totalMatched = alreadyMatched + matchAmount;
        } catch (matchErr) {
          console.warn("Employer match deposit failed (employee deposit still succeeded):", matchErr.message);
          matchAmount = 0;
        }
      }
    }

    const vaultInfo = await getVaultInfo(vaultId);

    res.json({
      success: true,
      deposited: amount,
      matchAmount,
      totalVaultBalance: vaultInfo.AssetsTotal || vaultInfo.Asset?.value || 0,
      txHash,
      matchTxHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Draw Loan (real LoanSet — broker + borrower co-sign, tier-based)
app.post("/api/vault/:vaultId/loan/draw", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeAddress, employeeSeed, amount, tier = "emergency" } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    // Resolve tier config (defaults + employer overrides)
    const tierOverrides = vault.config?.loanTiers?.[tier] || {};
    if (tierOverrides.enabled === false) {
      return res.status(400).json({ error: `Loan tier "${tier}" is disabled for this vault` });
    }
    const tierConfig = mergeTierOverrides(tier, tierOverrides);

    // Validate principal
    if (Number(amount) > tierConfig.maxPrincipal) {
      return res.status(400).json({
        error: `Amount exceeds max for ${tier} tier ($${tierConfig.maxPrincipal})`,
      });
    }

    // Check eligibility — required credential
    const hasRequiredCred = await hasCredential(employeeAddress, tierConfig.requiredCredential);
    if (!hasRequiredCred) {
      return res.status(403).json({
        error: `Missing "${tierConfig.requiredCredential}" credential for ${tier} tier`,
      });
    }

    // Check deposit requirement (standard tier)
    if (tierConfig.requiresDeposit) {
      const shareBalance = await getVaultShareBalance(vaultId, employeeAddress);
      if (shareBalance <= 0) {
        return res.status(403).json({
          error: `${tier} tier requires a vault deposit first`,
        });
      }
    }

    // Real LoanSet — borrower co-signs, principal auto-transferred from vault to borrower
    const { loanId, txHash } = await createLoan(
      vault.employerSeed,
      vault.loanBrokerId,
      employeeSeed,
      amount,
      tierConfig
    );

    const loan = {
      id: loanId,
      borrower: employeeAddress,
      borrowerSeed: employeeSeed,
      principal: amount,
      status: "active",
      tier,
      createdAt: new Date().toISOString(),
    };
    vault.loans.push(loan);

    res.json({ success: true, loan, tier: tierConfig, txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Repay Loan (real LoanPay)
app.post("/api/vault/:vaultId/loan/repay", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { loanId, employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const loan = vault.loans.find((l) => l.id === loanId);
    if (!loan) return res.status(404).json({ error: "Loan not found" });

    const { txHash } = await repayLoan(employeeSeed, loanId, amount);

    // Read loan state from ledger to check if fully repaid
    let loanInfo;
    let fullyRepaid = false;
    try {
      loanInfo = await getLoanInfo(loanId);
      fullyRepaid = !loanInfo.PrincipalOutstanding ||
        loanInfo.PrincipalOutstanding === "0" ||
        parseFloat(loanInfo.PrincipalOutstanding) === 0;
    } catch {
      // Loan object deleted = fully repaid
      fullyRepaid = true;
    }

    if (fullyRepaid) {
      loan.status = "repaid";
      try {
        await issueCredential(vault.employerSeed, loan.borrower, "creditworthy");
        if (loan.borrowerSeed) {
          await acceptCredential(loan.borrowerSeed, vault.employerAddress, "creditworthy");
        }
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

// ==========================================
// READ — Vault & Balance Info
// ==========================================

app.get("/api/vault/:vaultId", async (req, res) => {
  try {
    const vault = vaults.get(req.params.vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    let vaultInfo;
    try {
      vaultInfo = await getVaultInfo(req.params.vaultId);
    } catch {
      vaultInfo = null;
    }

    const employeesWithBalances = await Promise.all(
      vault.employees.map(async (emp) => {
        const credentials = await getCredentials(emp.address);
        return {
          name: emp.name,
          address: emp.address,
          rlusdBalance: await getRLUSDBalance(emp.address),
          credentials: credentials.map((c) => ({
            type: c.credentialType,
            accepted: c.accepted,
          })),
        };
      })
    );

    const loansWithInfo = await Promise.all(
      vault.loans.map(async (loan) => {
        let loanInfo = null;
        try {
          loanInfo = await getLoanInfo(loan.id);
        } catch {
          // Loan may be deleted if fully repaid
        }
        return {
          id: loan.id,
          borrower: loan.borrower,
          principal: loan.principal,
          status: loan.status,
          createdAt: loan.createdAt,
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
      config: vault.config || null,
      vaultLedgerObject: vaultInfo,
      vaultBalance: vaultInfo?.AssetsTotal || "0",
      employees: employeesWithBalances,
      loans: loansWithInfo,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/balance/:address", async (req, res) => {
  try {
    const rlusd = await getRLUSDBalance(req.params.address);
    const xrp = await getXRPBalance(req.params.address);
    const credentials = await getCredentials(req.params.address);
    res.json({
      address: req.params.address,
      rlusd,
      xrp,
      credentials: credentials.map((c) => ({
        type: c.credentialType,
        issuer: c.issuer,
        accepted: c.accepted,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// EMPLOYEE — Withdraw (vesting-aware)
// ==========================================

app.post("/api/vault/:vaultId/withdraw", async (req, res) => {
  try {
    const { vaultId } = req.params;
    const { employeeSeed, amount } = req.body;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const employeeAddress = walletFromSeed(employeeSeed).address;
    const emp = vault.employees.find((e) => e.address === employeeAddress);

    let clawedBack = 0;
    let clawbackTxHash = null;

    // Check vesting — claw back unvested match if needed
    if (emp && emp.matchDeposits && emp.matchDeposits.length > 0 && vault.config?.vesting) {
      const { clawbackAmount } = calculateClawbackOnWithdraw(
        emp, vault.config.vesting, Number(amount), 1.0
      );
      if (clawbackAmount > 0) {
        try {
          const clawResult = await clawbackVaultShares(vaultId, employeeAddress, clawbackAmount);
          clawbackTxHash = clawResult.txHash;
          clawedBack = clawbackAmount;
          // Clear unvested match records
          emp.matchDeposits = [];
          emp.totalMatched = 0;
        } catch (clawErr) {
          console.warn("Vesting clawback failed:", clawErr.message);
        }
      }
    }

    // Withdraw
    const { txHash } = await withdrawFromVault(vaultId, employeeSeed, amount);

    const vesting = emp?.matchDeposits
      ? calculateVestedAmount(emp.matchDeposits, vault.config?.vesting)
      : null;

    res.json({
      success: true,
      withdrawn: amount,
      clawedBack,
      vestedRemaining: vesting?.vestedAmount || 0,
      txHash,
      clawbackTxHash,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// CONFIG & YIELD — Vault Configuration + Employee Yield
// ==========================================

// Get vault config
app.get("/api/vault/:vaultId/config", (req, res) => {
  const vault = vaults.get(req.params.vaultId);
  if (!vault) return res.status(404).json({ error: "Vault not found" });

  // Build effective loan tiers (defaults + employer overrides)
  const tiers = {};
  for (const tierName of ["emergency", "standard", "creditworthy"]) {
    const overrides = vault.config?.loanTiers?.[tierName] || {};
    tiers[tierName] = mergeTierOverrides(tierName, overrides);
    tiers[tierName].enabled = overrides.enabled !== false;
  }

  res.json({
    vaultId: vault.id,
    companyName: vault.companyName,
    match: vault.config?.match || { rate: 0, capPerEmployee: 0 },
    vesting: vault.config?.vesting || { type: "immediate" },
    loanTiers: tiers,
  });
});

// Update vault config (in-memory)
app.put("/api/vault/:vaultId/config", async (req, res) => {
  try {
    const vault = vaults.get(req.params.vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const { matchRate, matchCap, loanTierOverrides } = req.body;

    if (matchRate !== undefined) vault.config.match.rate = matchRate;
    if (matchCap !== undefined) vault.config.match.capPerEmployee = matchCap;
    if (loanTierOverrides) {
      for (const [tier, overrides] of Object.entries(loanTierOverrides)) {
        vault.config.loanTiers[tier] = { ...vault.config.loanTiers[tier], ...overrides };
      }
    }

    res.json({ success: true, config: vault.config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Loan tiers available for an employee
app.get("/api/vault/:vaultId/loan/tiers", async (req, res) => {
  try {
    const vault = vaults.get(req.params.vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "address query param required" });

    const tiers = {};
    for (const tierName of ["emergency", "standard", "creditworthy"]) {
      const overrides = vault.config?.loanTiers?.[tierName] || {};
      if (overrides.enabled === false) continue;

      const config = mergeTierOverrides(tierName, overrides);
      let eligible = true;
      let reason = null;

      // Check credential
      const hasCred = await hasCredential(address, config.requiredCredential);
      if (!hasCred) {
        eligible = false;
        reason = `Requires "${config.requiredCredential}" credential`;
      }

      // Check deposit requirement
      if (eligible && config.requiresDeposit) {
        const shares = await getVaultShareBalance(req.params.vaultId, address);
        if (shares <= 0) {
          eligible = false;
          reason = "Requires vault deposit";
        }
      }

      tiers[tierName] = {
        ...config,
        eligible,
        reason,
      };
    }

    res.json({ vaultId: req.params.vaultId, address, tiers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Employee yield breakdown
app.get("/api/vault/:vaultId/employee/:address/yield", async (req, res) => {
  try {
    const { vaultId, address } = req.params;
    const vault = vaults.get(vaultId);
    if (!vault) return res.status(404).json({ error: "Vault not found" });

    const emp = vault.employees.find((e) => e.address === address);
    if (!emp) return res.status(404).json({ error: "Employee not found in vault" });

    // Vesting calculation
    const vesting = calculateVestedAmount(
      emp.matchDeposits || [],
      vault.config?.vesting
    );

    // Share balance + price from on-chain
    let shares = 0;
    let sharePrice = 1.0;
    try {
      shares = await getVaultShareBalance(vaultId, address);
      const vaultInfo = await getVaultInfo(vaultId);
      const assetsTotal = parseFloat(vaultInfo.AssetsTotal || "0");
      const sharesTotal = parseFloat(vaultInfo.SharesTotal || "0");
      if (sharesTotal > 0) sharePrice = assetsTotal / sharesTotal;
    } catch {}

    const currentValue = Math.round(shares * sharePrice * 100) / 100;
    const totalIn = (emp.totalDeposited || 0) + vesting.vestedAmount;
    const yieldEarned = Math.max(0, Math.round((currentValue - totalIn) * 100) / 100);

    // Withdrawable = currentValue minus unvested match
    const withdrawable = Math.max(0, Math.round((currentValue - vesting.unvestedAmount) * 100) / 100);

    res.json({
      deposits: {
        total: emp.totalDeposited || 0,
        count: emp.deposits?.length || 0,
      },
      employerMatch: {
        totalMatched: emp.totalMatched || 0,
        vested: vesting.vestedAmount,
        unvested: vesting.unvestedAmount,
        vestPercent: vesting.vestPercent,
        nextVestDate: vesting.nextVestDate,
        nextVestAmount: vesting.nextVestAmount,
      },
      shares: {
        count: shares,
        price: Math.round(sharePrice * 1000) / 1000,
        currentValue,
      },
      yield: {
        earned: yieldEarned,
        effectiveAPY: 0, // Would need time-weighted calc for real APY
      },
      withdrawable: {
        max: withdrawable,
        note: vesting.unvestedAmount > 0
          ? `Unvested match ($${vesting.unvestedAmount}) clawed back on withdrawal`
          : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// EMPLOYER — Risk Management
// ==========================================

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

// ==========================================
// XUMM — Transaction Signing Payloads
// ==========================================

// Create a XUMM payload for any transaction (user signs in Xaman)
app.post("/api/xumm/payload", async (req, res) => {
  try {
    if (!xummEnabled()) {
      return res.status(501).json({ error: "XUMM not configured" });
    }
    const { txjson, userToken } = req.body;
    const payload = await createTxPayload(txjson, userToken);
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get signed tx blob from a resolved XUMM payload
app.get("/api/xumm/payload/:payloadId", async (req, res) => {
  try {
    if (!xummEnabled()) {
      return res.status(501).json({ error: "XUMM not configured" });
    }
    const result = await getPayloadStatus(req.params.payloadId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// LEDGER — On-chain History
// ==========================================

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
  if (xummEnabled()) {
    console.log("XUMM wallet connect: enabled");
  } else {
    console.log("XUMM wallet connect: disabled (set XUMM_API_KEY + XUMM_API_SECRET to enable)");
  }
});
