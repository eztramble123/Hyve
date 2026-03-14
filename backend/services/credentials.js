import { getClient, walletFromSeed } from "./xrpl-client.js";

export async function issueCredential(issuerSeed, subjectAddress, credentialType) {
  const c = await getClient();
  const wallet = walletFromSeed(issuerSeed);

  const tx = {
    TransactionType: "CredentialCreate",
    Account: wallet.address,
    Subject: subjectAddress,
    CredentialType: Buffer.from(credentialType).toString("hex"),
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`CredentialCreate failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}

export async function acceptCredential(subjectSeed, issuerAddress, credentialType) {
  const c = await getClient();
  const wallet = walletFromSeed(subjectSeed);

  const tx = {
    TransactionType: "CredentialAccept",
    Account: wallet.address,
    Issuer: issuerAddress,
    CredentialType: Buffer.from(credentialType).toString("hex"),
  };

  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const result = await c.submitAndWait(signed.tx_blob);

  if (result.result.meta.TransactionResult !== "tesSUCCESS") {
    throw new Error(`CredentialAccept failed: ${result.result.meta.TransactionResult}`);
  }

  return { txHash: result.result.hash };
}

export async function getCredentials(address) {
  const c = await getClient();

  try {
    const response = await c.request({
      command: "account_objects",
      account: address,
      type: "credential",
      ledger_index: "validated",
    });

    return response.result.account_objects.map((obj) => ({
      credentialType: Buffer.from(obj.CredentialType, "hex").toString("utf8"),
      issuer: obj.Issuer,
      subject: obj.Subject,
      accepted: !!(obj.Flags & 0x00010000), // lsfAccepted
    }));
  } catch {
    return [];
  }
}

export async function hasCredential(address, credentialType) {
  const creds = await getCredentials(address);
  return creds.some((c) => c.credentialType === credentialType && c.accepted);
}
