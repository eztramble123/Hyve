import { XummSdk } from "xumm-sdk";

let xumm = null;

export function getXumm() {
  if (!xumm) {
    const apiKey = process.env.XUMM_API_KEY;
    const apiSecret = process.env.XUMM_API_SECRET;
    if (!apiKey || !apiSecret) {
      throw new Error("XUMM_API_KEY and XUMM_API_SECRET must be set");
    }
    xumm = new XummSdk(apiKey, apiSecret);
  }
  return xumm;
}

// Create a SignIn payload — user scans QR in Xaman app to prove wallet ownership
export async function createSignIn() {
  const sdk = getXumm();
  const payload = await sdk.payload.create({
    txjson: {
      TransactionType: "SignIn",
    },
  });

  return {
    payloadId: payload.uuid,
    qrUrl: payload.refs.qr_png,
    deepLink: payload.next.always,
    webSocket: payload.refs.websocket_status,
  };
}

// Check payload status — returns wallet address if signed
export async function getPayloadStatus(payloadId) {
  const sdk = getXumm();
  const result = await sdk.payload.get(payloadId);

  if (!result) {
    return { status: "not_found" };
  }

  if (result.meta.expired) {
    return { status: "expired" };
  }

  if (result.meta.signed) {
    return {
      status: "signed",
      address: result.response.account,
      userToken: result.application.issued_user_token,
    };
  }

  if (result.meta.cancelled) {
    return { status: "cancelled" };
  }

  return { status: "pending" };
}

// Create a transaction payload for user to sign in Xaman
export async function createTxPayload(txjson, userToken) {
  const sdk = getXumm();
  const options = { txjson };
  if (userToken) {
    options.user_token = userToken;
  }
  const payload = await sdk.payload.create(options);

  return {
    payloadId: payload.uuid,
    qrUrl: payload.refs.qr_png,
    deepLink: payload.next.always,
    webSocket: payload.refs.websocket_status,
  };
}

// Wait for a payload to be resolved (signed/cancelled/expired)
export async function waitForPayload(payloadId) {
  const sdk = getXumm();
  const resolved = await sdk.payload.createAndSubscribe(
    { txjson: {} }, // dummy, we use get instead
    (event) => {
      // This is for createAndSubscribe pattern
    }
  );
  // For existing payloads, just poll
  return getPayloadStatus(payloadId);
}

// Get the signed tx blob from a resolved payload
export async function getSignedTxBlob(payloadId) {
  const sdk = getXumm();
  const result = await sdk.payload.get(payloadId);

  if (!result?.meta?.signed) {
    throw new Error("Payload not signed");
  }

  return {
    txBlob: result.response.hex,
    txHash: result.response.txid,
    account: result.response.account,
  };
}
