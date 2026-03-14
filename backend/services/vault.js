import { getClient, walletFromSeed, getCreatedNodeId } from "./xrpl-client.js";
import { rlusdAsset, rlusdAmount, getRLUSDIssuer } from "./rlusd.js";

export async function createVault(ownerSeed, options = {}) {
  const c = await getClient();
  const wallet = walletFromSeed(ownerSeed);

  const tx = {
    TransactionType: "VaultCreate",
    Account: wallet.address,
    Asset: rlusdAsset(),
    AssetsMaximum: options.assetsMaximum || "1000000",
    WithdrawalPolicy: 1, // FirstComeFirstServe
  };

  // tfVaultShareNonTransferable — shares can't be traded, only withdrawn through vault
  if (options.nonTransferable) {
    tx.Flags = 131072;
  }

  // Store vault config in Data field (match rate, vesting type)
  if (options.configData) {
    tx.Data = Buffer.from(JSON.stringify(options.configData)).toString("hex");
  }

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`VaultCreate failed: ${result.result.meta.TransactionResult}`);
  }

  const vaultId = getCreatedNodeId(result.result.meta, "Vault");
  if (!vaultId) {
    throw new Error("VaultCreate succeeded but could not find VaultID in metadata");
  }

  return {
    vaultId,
    txHash: result.result.hash,
  };
}

export async function depositToVault(vaultId, depositorSeed, amount) {
  const c = await getClient();
  const wallet = walletFromSeed(depositorSeed);

  const tx = {
    TransactionType: "VaultDeposit",
    Account: wallet.address,
    VaultID: vaultId,
    Amount: rlusdAmount(amount),
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`VaultDeposit failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}

export async function withdrawFromVault(vaultId, withdrawerSeed, amount) {
  const c = await getClient();
  const wallet = walletFromSeed(withdrawerSeed);

  const tx = {
    TransactionType: "VaultWithdraw",
    Account: wallet.address,
    VaultID: vaultId,
    Amount: rlusdAmount(amount),
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`VaultWithdraw failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}

export async function getVaultInfo(vaultId) {
  const c = await getClient();
  const response = await c.request({
    command: "ledger_entry",
    index: vaultId,
  });
  return response.result.node;
}

export async function getVaultShareBalance(vaultId, holderAddress) {
  const c = await getClient();

  // Get vault's MPTokenIssuanceID from the vault ledger object
  const vaultObj = await getVaultInfo(vaultId);
  const issuanceId = vaultObj.MPTokenIssuanceID;
  if (!issuanceId) return 0;

  try {
    const response = await c.request({
      command: "account_objects",
      account: holderAddress,
      type: "mptoken",
      ledger_index: "validated",
    });

    const token = response.result.account_objects.find(
      (obj) => obj.MPTokenIssuanceID === issuanceId
    );
    return token ? parseFloat(token.MPTAmount || "0") : 0;
  } catch {
    return 0;
  }
}

export async function clawbackVaultShares(vaultId, holderAddress, amount) {
  const c = await getClient();
  const issuer = getRLUSDIssuer();
  const issuerWallet = walletFromSeed(issuer.seed);

  const tx = {
    TransactionType: "VaultClawback",
    Account: issuerWallet.address,
    VaultID: vaultId,
    Holder: holderAddress,
  };

  // If amount specified, claw back specific amount; otherwise claw back all
  if (amount) {
    tx.Amount = rlusdAmount(amount);
  }

  const prepared = await c.autofill(tx);
  const signed = issuerWallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`VaultClawback failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}
