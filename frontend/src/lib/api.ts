const API_BASE = "http://localhost:3001/api";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  init: () => request("/init", { method: "POST" }),

  health: () => request("/health"),

  createWallet: () => request("/wallet/create", { method: "POST" }),

  createVault: (employerSeed: string, companyName: string) =>
    request("/vault/create", {
      method: "POST",
      body: JSON.stringify({ employerSeed, companyName }),
    }),

  getVault: (vaultId: string) => request(`/vault/${vaultId}`),

  getVaultLedger: (vaultId: string) => request(`/vault/${vaultId}/ledger`),

  onboardEmployee: (vaultId: string, employeeName: string) =>
    request(`/vault/${vaultId}/onboard`, {
      method: "POST",
      body: JSON.stringify({ employeeName }),
    }),

  deposit: (vaultId: string, employeeSeed: string, amount: number) =>
    request(`/vault/${vaultId}/deposit`, {
      method: "POST",
      body: JSON.stringify({ employeeSeed, amount }),
    }),

  drawLoan: (
    vaultId: string,
    employeeAddress: string,
    employeeSeed: string,
    amount: number,
    tier?: string
  ) =>
    request(`/vault/${vaultId}/loan/draw`, {
      method: "POST",
      body: JSON.stringify({ employeeAddress, employeeSeed, amount, ...(tier && { tier }) }),
    }),

  repayLoan: (
    vaultId: string,
    loanId: string,
    employeeSeed: string,
    amount: number
  ) =>
    request(`/vault/${vaultId}/loan/repay`, {
      method: "POST",
      body: JSON.stringify({ loanId, employeeSeed, amount }),
    }),

  clawback: (vaultId: string, employeeAddress: string, amount?: number) =>
    request(`/vault/${vaultId}/clawback`, {
      method: "POST",
      body: JSON.stringify({ employeeAddress, ...(amount !== undefined && { amount }) }),
    }),

  defaultLoan: (vaultId: string, loanId: string) =>
    request(`/vault/${vaultId}/loan/${loanId}/default`, {
      method: "POST",
      body: JSON.stringify({}),
    }),

  getBalance: (address: string) => request(`/balance/${address}`),

  withdraw: (vaultId: string, seed: string, amount: number) =>
    request(`/vault/${vaultId}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ seed, amount }),
    }),
};

export const EXPLORER = (txHash: string) =>
  `https://devnet.xrpl.org/transactions/${txHash}`;
