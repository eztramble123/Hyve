import { getClient, walletFromSeed, getCreatedNodeId } from "./xrpl-client.js";
import { rlusdAmount } from "./rlusd.js";

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

export async function createLoan(brokerSeed, loanBrokerId, borrowerAddress, principal) {
  const c = await getClient();
  const wallet = walletFromSeed(brokerSeed);

  const tx = {
    TransactionType: "LoanSet",
    Account: wallet.address,
    LoanBrokerID: loanBrokerId,
    Counterparty: borrowerAddress,
    PrincipalRequested: String(principal),
    InterestRate: 500,              // 5% annual
    LateInterestRate: 1000,         // 10% on late payments
    CloseInterestRate: 300,         // 3% for early payoff
    PaymentTotal: 6,                // 6 total payments
    PaymentInterval: 2592000,       // 30 days in seconds
    GracePeriod: 604800,            // 7 day grace period
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

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
