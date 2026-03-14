import xrpl from "xrpl";

const TESTNET_URL = "wss://s.altnet.rippletest.net:51233/";

// RLUSD issuer on testnet — we simulate with a custom "RLUSD" token
// In production this would be the real RLUSD issuer
let rlusdIssuer = null;

let client = null;

export async function getClient() {
  if (!client || !client.isConnected()) {
    client = new xrpl.Client(TESTNET_URL);
    await client.connect();
  }
  return client;
}

export async function disconnect() {
  if (client && client.isConnected()) {
    await client.disconnect();
    client = null;
  }
}

// --- Wallet Management ---

export async function createFundedWallet() {
  const c = await getClient();
  const { wallet, balance } = await c.fundWallet();
  return {
    address: wallet.address,
    seed: wallet.seed,
    publicKey: wallet.publicKey,
    balance,
  };
}

function walletFromSeed(seed) {
  return xrpl.Wallet.fromSeed(seed);
}

// --- RLUSD Issuer Setup (one-time for demo) ---

export async function setupRLUSDIssuer() {
  if (rlusdIssuer) return rlusdIssuer;
  const c = await getClient();
  const { wallet } = await c.fundWallet();

  // Configure issuer: enable default ripple
  const settings = {
    TransactionType: "AccountSet",
    Account: wallet.address,
    SetFlag: xrpl.AccountSetAsfFlags.asfDefaultRipple,
  };
  const prepared = await c.autofill(settings);
  const signed = wallet.sign(prepared);
  await c.submitAndWait(signed.tx_blob);

  rlusdIssuer = {
    address: wallet.address,
    seed: wallet.seed,
  };
  console.log("RLUSD Issuer created:", rlusdIssuer.address);
  return rlusdIssuer;
}

export function getRLUSDIssuer() {
  return rlusdIssuer;
}

// --- Trust Line Setup ---

export async function setupRLUSDTrustLine(userSeed) {
  const c = await getClient();
  const issuer = await setupRLUSDIssuer();
  const wallet = walletFromSeed(userSeed);

  const trustSet = {
    TransactionType: "TrustSet",
    Account: wallet.address,
    LimitAmount: {
      currency: "RLUSD",
      issuer: issuer.address,
      value: "1000000",
    },
  };

  const prepared = await c.autofill(trustSet);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);
  return result.result.meta.TransactionResult === "tesSUCCESS";
}

// --- Fund user with RLUSD (simulated payroll deposit) ---

export async function fundWithRLUSD(destinationAddress, amount) {
  const c = await getClient();
  const issuer = await setupRLUSDIssuer();
  const issuerWallet = walletFromSeed(issuer.seed);

  const payment = {
    TransactionType: "Payment",
    Account: issuerWallet.address,
    Destination: destinationAddress,
    DeliverMax: {
      currency: "RLUSD",
      issuer: issuer.address,
      value: String(amount),
    },
  };

  const prepared = await c.autofill(payment);
  const signed = issuerWallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);
  return result.result.meta.TransactionResult === "tesSUCCESS";
}

// --- Vault Operations (simulated via payments to employer vault wallet) ---

export async function depositToVault(employeeSeed, vaultAddress, amount) {
  const c = await getClient();
  const issuer = await setupRLUSDIssuer();
  const wallet = walletFromSeed(employeeSeed);

  const payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: vaultAddress,
    DeliverMax: {
      currency: "RLUSD",
      issuer: issuer.address,
      value: String(amount),
    },
  };

  const prepared = await c.autofill(payment);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);
  return result.result.meta.TransactionResult === "tesSUCCESS";
}

export async function withdrawFromVault(vaultSeed, employeeAddress, amount) {
  const c = await getClient();
  const issuer = await setupRLUSDIssuer();
  const wallet = walletFromSeed(vaultSeed);

  const payment = {
    TransactionType: "Payment",
    Account: wallet.address,
    Destination: employeeAddress,
    DeliverMax: {
      currency: "RLUSD",
      issuer: issuer.address,
      value: String(amount),
    },
  };

  const prepared = await c.autofill(payment);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);
  return result.result.meta.TransactionResult === "tesSUCCESS";
}

// --- Loan Operations ---

export async function drawLoan(vaultSeed, borrowerAddress, amount) {
  // Loan draw = vault sends RLUSD to borrower
  return withdrawFromVault(vaultSeed, borrowerAddress, amount);
}

export async function repayLoan(borrowerSeed, vaultAddress, amount) {
  // Repayment = borrower sends RLUSD back to vault
  return depositToVault(borrowerSeed, vaultAddress, amount);
}

// --- Balance Checking ---

export async function getRLUSDBalance(address) {
  const c = await getClient();
  const issuer = await setupRLUSDIssuer();

  try {
    const response = await c.request({
      command: "account_lines",
      account: address,
      ledger_index: "validated",
    });

    const rlusdLine = response.result.lines.find(
      (l) => l.currency === "RLUSD" && l.account === issuer.address
    );
    return rlusdLine ? parseFloat(rlusdLine.balance) : 0;
  } catch {
    return 0;
  }
}

export async function getXRPBalance(address) {
  const c = await getClient();
  try {
    const response = await c.request({
      command: "account_info",
      account: address,
      ledger_index: "validated",
    });
    return parseFloat(xrpl.dropsToXrp(response.result.account_data.Balance));
  } catch {
    return 0;
  }
}

// --- Credential Issuance (simulated via AccountSet domain field) ---
// In a full implementation, this would use XLS-70 Credentials
// For the hackathon demo, we track credentials in-memory

const credentials = new Map();

export function issueCredential(employerAddress, employeeAddress, credType) {
  const key = `${employeeAddress}`;
  const existing = credentials.get(key) || [];
  if (!existing.includes(credType)) {
    existing.push(credType);
  }
  credentials.set(key, existing);
  return { employeeAddress, credentials: existing, issuedBy: employerAddress };
}

export function getCredentials(employeeAddress) {
  return credentials.get(employeeAddress) || [];
}

export function hasCredential(employeeAddress, credType) {
  const creds = credentials.get(employeeAddress) || [];
  return creds.includes(credType);
}
