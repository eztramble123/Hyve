import xrpl from "xrpl";

const DEVNET_URL = "wss://s.devnet.rippletest.net:51233/";
const DEVNET_FAUCET = "https://faucet.devnet.rippletest.net/accounts";

let client = null;

export async function getClient() {
  if (!client || !client.isConnected()) {
    client = new xrpl.Client(DEVNET_URL);
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

export async function createFundedWallet() {
  const c = await getClient();
  const { wallet, balance } = await c.fundWallet({
    faucetHost: undefined, // uses default for devnet
  });
  return {
    address: wallet.address,
    seed: wallet.seed,
    publicKey: wallet.publicKey,
    balance,
  };
}

export function walletFromSeed(seed) {
  return xrpl.Wallet.fromSeed(seed);
}

// Helper to extract created ledger object IDs from transaction metadata
export function getCreatedNodeId(meta, ledgerEntryType) {
  const nodes = meta.AffectedNodes || [];
  for (const node of nodes) {
    if (node.CreatedNode && node.CreatedNode.LedgerEntryType === ledgerEntryType) {
      return node.CreatedNode.LedgerIndex;
    }
  }
  return null;
}
