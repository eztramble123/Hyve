import { signLoanSetByCounterparty } from "xrpl";
import { getClient, walletFromSeed, getCreatedNodeId } from "./xrpl-client.js";
import { rlusdAmount } from "./rlusd.js";

// --- Loan Tier Defaults ---
const LOAN_TIER_DEFAULTS = {
  emergency: {
    InterestRate: 150,           // 1.5%
    LateInterestRate: 500,       // 5%
    CloseInterestRate: 100,      // 1%
    PaymentTotal: 3,
    PaymentInterval: 1209600,    // 14 days
    GracePeriod: 259200,         // 3 days
    maxPrincipal: 500,
    requiredCredential: "employee",
  },
  standard: {
    InterestRate: 400,           // 4%
    LateInterestRate: 800,
    CloseInterestRate: 200,
    PaymentTotal: 6,
    PaymentInterval: 2592000,    // 30 days
    GracePeriod: 604800,         // 7 days
    maxPrincipal: 2000,
    requiredCredential: "employee",
    requiresDeposit: true,       // must have shares in vault
    LoanOriginationFee: "10",
  },
  creditworthy: {
    InterestRate: 200,           // 2%
    LateInterestRate: 600,
    CloseInterestRate: 100,
    PaymentTotal: 12,
    PaymentInterval: 2592000,    // 30 days
    GracePeriod: 1209600,        // 14 days
    maxPrincipal: 5000,
    requiredCredential: "creditworthy",
  },
};

export function getLoanTierDefaults() {
  return JSON.parse(JSON.stringify(LOAN_TIER_DEFAULTS));
}

export function mergeTierOverrides(tierName, overrides = {}) {
  const defaults = LOAN_TIER_DEFAULTS[tierName];
  if (!defaults) throw new Error(`Unknown loan tier: ${tierName}`);
  return { ...defaults, ...overrides, tierName };
}

export async function setupLoanBroker(ownerSeed, vaultId) {
  const c = await getClient();
  const wallet = walletFromSeed(ownerSeed);

  const tx = {
    TransactionType: "LoanBrokerSet",
    Account: wallet.address,
    VaultID: vaultId,
    ManagementFeeRate: 100,        // 0.1%
    DebtMaximum: "10000",          // max total outstanding
    CoverRateMinimum: 1000,        // 10% first-loss cover
    CoverRateLiquidation: 500,     // 5% liquidation threshold
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`LoanBrokerSet failed: ${result.result.meta.TransactionResult}`);
  }

  const loanBrokerId = getCreatedNodeId(result.result.meta, "LoanBroker");
  if (!loanBrokerId) {
    throw new Error("LoanBrokerSet succeeded but could not find LoanBrokerID in metadata");
  }

  return {
    loanBrokerId,
    txHash: result.result.hash,
  };
}

export async function depositCover(ownerSeed, loanBrokerId, amount) {
  const c = await getClient();
  const wallet = walletFromSeed(ownerSeed);

  const tx = {
    TransactionType: "LoanBrokerCoverDeposit",
    Account: wallet.address,
    LoanBrokerID: loanBrokerId,
    Amount: rlusdAmount(amount),
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`LoanBrokerCoverDeposit failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}

export async function createLoan(brokerSeed, loanBrokerId, borrowerSeed, principal, tierConfig = {}) {
  const c = await getClient();
  const brokerWallet = walletFromSeed(brokerSeed);
  const borrowerWallet = walletFromSeed(borrowerSeed);

  const tx = {
    TransactionType: "LoanSet",
    Account: brokerWallet.address,
    LoanBrokerID: loanBrokerId,
    Counterparty: borrowerWallet.address,
    PrincipalRequested: String(principal),
    InterestRate: tierConfig.InterestRate ?? 500,
    LateInterestRate: tierConfig.LateInterestRate ?? 1000,
    CloseInterestRate: tierConfig.CloseInterestRate ?? 300,
    PaymentTotal: tierConfig.PaymentTotal ?? 6,
    PaymentInterval: tierConfig.PaymentInterval ?? 2592000,
    GracePeriod: tierConfig.GracePeriod ?? 604800,
  };

  if (tierConfig.LoanOriginationFee) {
    tx.LoanOriginationFee = tierConfig.LoanOriginationFee;
  }

  // Store tier name on-chain in Data field
  if (tierConfig.tierName) {
    tx.Data = Buffer.from(tierConfig.tierName).toString("hex");
  }

  const prepared = await c.autofill(tx);
  // Broker signs first
  const brokerSigned = brokerWallet.sign(prepared);
  // Borrower co-signs via CounterpartySignature
  const cosigned = signLoanSetByCounterparty(borrowerWallet, brokerSigned.tx_blob);
  const result = await c.submitAndWait(cosigned.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`LoanSet failed: ${result.result.meta.TransactionResult}`);
  }

  const loanId = getCreatedNodeId(result.result.meta, "Loan");
  if (!loanId) {
    throw new Error("LoanSet succeeded but could not find LoanID in metadata");
  }

  return {
    loanId,
    txHash: result.result.hash,
  };
}

export async function repayLoan(borrowerSeed, loanId, amount) {
  const c = await getClient();
  const wallet = walletFromSeed(borrowerSeed);

  const tx = {
    TransactionType: "LoanPay",
    Account: wallet.address,
    LoanID: loanId,
    Amount: rlusdAmount(amount),
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`LoanPay failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}

export async function getLoanInfo(loanId) {
  const c = await getClient();
  const response = await c.request({
    command: "ledger_entry",
    index: loanId,
  });
  return response.result.node;
}

export async function defaultLoan(brokerSeed, loanId) {
  const c = await getClient();
  const wallet = walletFromSeed(brokerSeed);

  const tx = {
    TransactionType: "LoanManage",
    Account: wallet.address,
    LoanID: loanId,
    Flags: 65536, // tfLoanDefault
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`LoanManage(default) failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}
