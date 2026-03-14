import xrpl from "xrpl";
import { getClient, walletFromSeed } from "./xrpl-client.js";

let rlusdIssuer = null;

export async function setupRLUSDIssuer() {
  if (rlusdIssuer) return rlusdIssuer;
  const c = await getClient();
  const { wallet } = await c.fundWallet();

  // Enable DefaultRipple + AllowTrustLineClawback (required for VaultClawback)
  const enableRipple = {
    TransactionType: "AccountSet",
    Account: wallet.address,
    SetFlag: xrpl.AccountSetAsfFlags.asfDefaultRipple,
  };
  let prepared = await c.autofill(enableRipple);
  let signed = wallet.sign(prepared);
  await c.submitAndWait(signed.tx_blob);

  const enableClawback = {
    TransactionType: "AccountSet",
    Account: wallet.address,
    SetFlag: xrpl.AccountSetAsfFlags.asfAllowTrustLineClawback,
  };
  prepared = await c.autofill(enableClawback);
  signed = wallet.sign(prepared);
  await c.submitAndWait(signed.tx_blob);

  rlusdIssuer = {
    address: wallet.address,
    seed: wallet.seed,
  };
  console.log("RLUSD Issuer created on Devnet:", rlusdIssuer.address);
  return rlusdIssuer;
}

export function getRLUSDIssuer() {
  return rlusdIssuer;
}

export function rlusdAmount(value) {
  return {
    currency: "RLUSD",
    issuer: rlusdIssuer.address,
    value: String(value),
  };
}

export function rlusdAsset() {
  return {
    currency: "RLUSD",
    issuer: rlusdIssuer.address,
  };
}

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
