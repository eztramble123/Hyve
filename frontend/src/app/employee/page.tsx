"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface Loan {
  id: string;
  borrower: string;
  principal: number;
  remaining: number;
  status: string;
}

export default function EmployeeDashboard() {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  // Connection info
  const [vaultId, setVaultId] = useState("");
  const [employeeSeed, setEmployeeSeed] = useState("");
  const [employeeAddress, setEmployeeAddress] = useState("");
  const [connected, setConnected] = useState(false);

  // Balances
  const [rlusdBalance, setRlusdBalance] = useState(0);
  const [shares, setShares] = useState(0);
  const [credentials, setCredentials] = useState<string[]>([]);
  const [vaultBalance, setVaultBalance] = useState(0);

  // Actions
  const [depositAmount, setDepositAmount] = useState("200");
  const [loanAmount, setLoanAmount] = useState("100");
  const [repayAmount, setRepayAmount] = useState("");

  // Loans
  const [loans, setLoans] = useState<Loan[]>([]);

  async function handleConnect() {
    if (!vaultId || !employeeSeed) return;
    setLoading("Connecting...");
    setError("");
    try {
      const vault = await api.getVault(vaultId);
      const emp = vault.employees.find((e: { seed: string }) => e.seed === employeeSeed);
      if (!emp) throw new Error("Employee not found in this vault");

      setEmployeeAddress(emp.address);
      setRlusdBalance(emp.rlusdBalance);
      setShares(emp.shares);
      setCredentials(emp.credentials);
      setVaultBalance(vault.vaultBalance);
      setLoans(vault.loans.filter((l: Loan) => l.borrower === emp.address));
      setConnected(true);
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection failed");
      setLoading("");
    }
  }

  async function refresh() {
    try {
      const vault = await api.getVault(vaultId);
      const emp = vault.employees.find((e: { seed: string }) => e.seed === employeeSeed);
      if (emp) {
        setRlusdBalance(emp.rlusdBalance);
        setShares(emp.shares);
        setCredentials(emp.credentials);
      }
      setVaultBalance(vault.vaultBalance);
      setLoans(vault.loans.filter((l: Loan) => l.borrower === employeeAddress));
    } catch {}
  }

  async function handleDeposit() {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setLoading(`Depositing ${amt} RLUSD to vault...`);
    setError("");
    try {
      await api.deposit(vaultId, employeeSeed, amt);
      await refresh();
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Deposit failed");
      setLoading("");
    }
  }

  async function handleDrawLoan() {
    const amt = parseFloat(loanAmount);
    if (!amt || amt <= 0) return;
    setLoading(`Drawing ${amt} RLUSD loan...`);
    setError("");
    try {
      const result = await api.drawLoan(vaultId, employeeAddress, employeeSeed, amt);
      setLoans((prev) => [...prev, result.loan]);
      await refresh();
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Loan draw failed");
      setLoading("");
    }
  }

  async function handleRepay(loanId: string) {
    const loan = loans.find((l) => l.id === loanId);
    if (!loan) return;
    const amt = parseFloat(repayAmount) || loan.remaining;
    setLoading(`Repaying ${amt} RLUSD...`);
    setError("");
    try {
      const result = await api.repayLoan(vaultId, loanId, employeeSeed, amt);
      setCredentials(result.credentials);
      await refresh();
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Repayment failed");
      setLoading("");
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Employee Dashboard</h1>

      {loading && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6 text-accent">
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {loading}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 text-danger">
          {error}
        </div>
      )}

      {/* Connect */}
      {!connected && (
        <div className="border border-card-border bg-card-bg rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Connect to Vault</h2>
          <p className="text-foreground/60 mb-4 text-sm">
            Enter your vault ID and wallet seed (from your employer).
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={vaultId}
              onChange={(e) => setVaultId(e.target.value)}
              placeholder="Vault ID (e.g. vault_1)"
              className="w-full bg-background border border-card-border rounded-lg px-4 py-2 text-sm"
            />
            <input
              type="text"
              value={employeeSeed}
              onChange={(e) => setEmployeeSeed(e.target.value)}
              placeholder="Your wallet seed"
              className="w-full bg-background border border-card-border rounded-lg px-4 py-2 text-sm font-mono"
            />
            <button
              onClick={handleConnect}
              disabled={!!loading || !vaultId || !employeeSeed}
              className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {/* Dashboard */}
      {connected && (
        <div className="space-y-6">
          {/* Balances */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Your RLUSD</div>
              <div className="text-xl font-semibold text-accent">
                {rlusdBalance.toFixed(2)}
              </div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Vault Shares</div>
              <div className="text-xl font-semibold">{shares}</div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Vault Pool</div>
              <div className="text-xl font-semibold text-accent">
                {vaultBalance.toFixed(2)}
              </div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Credentials</div>
              <div className="flex gap-1 flex-wrap mt-1">
                {credentials.length === 0 && (
                  <span className="text-foreground/40 text-sm">None</span>
                )}
                {credentials.map((c) => (
                  <span
                    key={c}
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      c === "creditworthy"
                        ? "bg-success/20 text-success"
                        : "bg-accent/20 text-accent"
                    }`}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="text-xs text-foreground/40">
            Wallet: <code>{employeeAddress}</code>
          </div>

          {/* Deposit */}
          <div className="border border-card-border bg-card-bg rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Deposit to Vault</h2>
            <div className="flex gap-3">
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="Amount (RLUSD)"
                className="bg-background border border-card-border rounded-lg px-4 py-2 w-40 text-sm"
              />
              <button
                onClick={handleDeposit}
                disabled={!!loading}
                className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Deposit
              </button>
            </div>
          </div>

          {/* Request Loan */}
          <div className="border border-card-border bg-card-bg rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Request Emergency Loan</h2>
            <p className="text-foreground/50 text-xs mb-3">
              Draw RLUSD from the vault pool. Requires &quot;employee&quot; credential.
            </p>
            <div className="flex gap-3">
              <input
                type="number"
                value={loanAmount}
                onChange={(e) => setLoanAmount(e.target.value)}
                placeholder="Amount (RLUSD)"
                className="bg-background border border-card-border rounded-lg px-4 py-2 w-40 text-sm"
              />
              <button
                onClick={handleDrawLoan}
                disabled={!!loading}
                className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Draw Loan
              </button>
            </div>
          </div>

          {/* Active Loans */}
          {loans.length > 0 && (
            <div className="border border-card-border bg-card-bg rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Your Loans</h2>
              <div className="space-y-3">
                {loans.map((loan) => (
                  <div
                    key={loan.id}
                    className="bg-background/50 border border-card-border rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="text-sm">
                          Principal:{" "}
                          <span className="text-accent">{loan.principal} RLUSD</span>
                        </div>
                        <div className="text-sm mt-1">
                          Remaining:{" "}
                          <span
                            className={
                              loan.remaining > 0 ? "text-danger" : "text-success"
                            }
                          >
                            {loan.remaining} RLUSD
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          loan.status === "repaid"
                            ? "bg-success/20 text-success"
                            : "bg-accent/20 text-accent"
                        }`}
                      >
                        {loan.status}
                      </span>
                    </div>

                    {loan.status === "active" && (
                      <div className="flex gap-3">
                        <input
                          type="number"
                          value={repayAmount}
                          onChange={(e) => setRepayAmount(e.target.value)}
                          placeholder={`Full: ${loan.remaining}`}
                          className="bg-background border border-card-border rounded-lg px-4 py-2 w-40 text-sm"
                        />
                        <button
                          onClick={() => handleRepay(loan.id)}
                          disabled={!!loading}
                          className="bg-success hover:bg-success/80 text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Repay
                        </button>
                      </div>
                    )}

                    {loan.status === "repaid" && (
                      <div className="text-success text-sm mt-1">
                        Fully repaid — &quot;creditworthy&quot; credential issued!
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
