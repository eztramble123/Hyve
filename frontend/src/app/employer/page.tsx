"use client";

import { useState } from "react";
import { api } from "@/lib/api";

interface Employee {
  name: string;
  address: string;
  seed: string;
  rlusdBalance: number;
  shares: number;
  credentials: string[];
}

interface VaultData {
  id: string;
  companyName: string;
  vaultAddress: string;
  vaultSeed: string;
  vaultBalance: number;
  totalDeposits: number;
  employees: Employee[];
  loans: { id: string; borrower: string; principal: number; remaining: number; status: string }[];
}

export default function EmployerDashboard() {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [employer, setEmployer] = useState<{ address: string; seed: string } | null>(null);
  const [vault, setVault] = useState<VaultData | null>(null);
  const [companyName, setCompanyName] = useState("Acme Corp");
  const [employeeName, setEmployeeName] = useState("");

  async function handleInit() {
    setLoading("Initializing RLUSD issuer on XRPL Testnet...");
    setError("");
    try {
      await api.init();
      const wallet = await api.createWallet();
      setEmployer({ address: wallet.address, seed: wallet.seed });
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Init failed");
      setLoading("");
    }
  }

  async function handleCreateVault() {
    if (!employer) return;
    setLoading("Creating vault on XRPL...");
    setError("");
    try {
      const result = await api.createVault(employer.seed, companyName);
      const vaultData = await api.getVault(result.vaultId);
      setVault(vaultData);
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Vault creation failed");
      setLoading("");
    }
  }

  async function handleOnboard() {
    if (!vault || !employeeName) return;
    setLoading(`Onboarding ${employeeName}...`);
    setError("");
    try {
      await api.onboardEmployee(vault.id, employeeName);
      const updated = await api.getVault(vault.id);
      setVault(updated);
      setEmployeeName("");
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Onboarding failed");
      setLoading("");
    }
  }

  async function refreshVault() {
    if (!vault) return;
    const updated = await api.getVault(vault.id);
    setVault(updated);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Employer Dashboard</h1>

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

      {/* Step 1: Initialize */}
      {!employer && (
        <div className="border border-card-border bg-card-bg rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Step 1: Connect to XRPL</h2>
          <p className="text-foreground/60 mb-4 text-sm">
            Initialize the RLUSD issuer and create your employer wallet on XRPL Testnet.
          </p>
          <button
            onClick={handleInit}
            disabled={!!loading}
            className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            Initialize
          </button>
        </div>
      )}

      {/* Step 2: Create Vault */}
      {employer && !vault && (
        <div className="border border-card-border bg-card-bg rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-4">Step 2: Create Company Vault</h2>
          <p className="text-foreground/60 mb-4 text-sm">
            Employer wallet: <code className="text-accent text-xs">{employer.address}</code>
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company Name"
              className="bg-background border border-card-border rounded-lg px-4 py-2 flex-1 text-sm"
            />
            <button
              onClick={handleCreateVault}
              disabled={!!loading}
              className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              Create Vault
            </button>
          </div>
        </div>
      )}

      {/* Vault Dashboard */}
      {vault && (
        <div className="space-y-6">
          {/* Vault Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Company</div>
              <div className="text-xl font-semibold">{vault.companyName}</div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Vault Balance (RLUSD)</div>
              <div className="text-xl font-semibold text-accent">{vault.vaultBalance.toFixed(2)}</div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Employees</div>
              <div className="text-xl font-semibold">{vault.employees.length}</div>
            </div>
          </div>

          <div className="text-xs text-foreground/40">
            Vault address: <code>{vault.vaultAddress}</code>
          </div>

          {/* Onboard Employee */}
          <div className="border border-card-border bg-card-bg rounded-xl p-6">
            <h2 className="text-lg font-semibold mb-4">Onboard Employee</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                placeholder="Employee Name"
                className="bg-background border border-card-border rounded-lg px-4 py-2 flex-1 text-sm"
              />
              <button
                onClick={handleOnboard}
                disabled={!!loading || !employeeName}
                className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                Onboard
              </button>
            </div>
            <p className="text-foreground/40 text-xs mt-2">
              Creates wallet, sets up RLUSD trust line, issues &quot;employee&quot; credential, and funds with 1000 RLUSD.
            </p>
          </div>

          {/* Employee List */}
          {vault.employees.length > 0 && (
            <div className="border border-card-border bg-card-bg rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Employees</h2>
                <button
                  onClick={refreshVault}
                  className="text-accent hover:text-accent-light text-sm transition-colors"
                >
                  Refresh
                </button>
              </div>
              <div className="space-y-3">
                {vault.employees.map((emp) => (
                  <div
                    key={emp.address}
                    className="bg-background/50 border border-card-border rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{emp.name}</div>
                        <div className="text-xs text-foreground/40 font-mono mt-1">
                          {emp.address}
                        </div>
                        <div className="text-xs text-foreground/40 font-mono mt-1">
                          Seed: {emp.seed}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">
                          <span className="text-accent">{emp.rlusdBalance.toFixed(2)}</span>{" "}
                          <span className="text-foreground/50">RLUSD</span>
                        </div>
                        <div className="text-xs text-foreground/50 mt-1">
                          Shares: {emp.shares}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {emp.credentials.map((cred) => (
                        <span
                          key={cred}
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            cred === "creditworthy"
                              ? "bg-success/20 text-success"
                              : "bg-accent/20 text-accent"
                          }`}
                        >
                          {cred}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Loans */}
          {vault.loans.length > 0 && (
            <div className="border border-card-border bg-card-bg rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Loans</h2>
              <div className="space-y-3">
                {vault.loans.map((loan) => (
                  <div
                    key={loan.id}
                    className="bg-background/50 border border-card-border rounded-lg p-4 flex justify-between items-center"
                  >
                    <div>
                      <div className="text-sm font-mono text-foreground/60">
                        {loan.borrower.slice(0, 12)}...
                      </div>
                      <div className="text-xs text-foreground/40 mt-1">
                        Principal: {loan.principal} RLUSD
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">
                        Remaining:{" "}
                        <span
                          className={
                            loan.remaining > 0 ? "text-danger" : "text-success"
                          }
                        >
                          {loan.remaining} RLUSD
                        </span>
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
