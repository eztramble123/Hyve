"use client";

import { useState, useEffect, useRef } from "react";
import { api, EXPLORER } from "@/lib/api";

interface Employee {
  name: string;
  address: string;
  seed: string;
  rlusdBalance: number;
  shares: number;
  credentials: string[];
}

interface Loan {
  id: string;
  borrower: string;
  principal: number;
  remaining: string;
  status: string;
}

interface VaultData {
  id: string;
  companyName: string;
  vaultAddress: string;
  employerAddress: string;
  loanBrokerId: string;
  vaultBalance: string;
  totalDeposits: number;
  employees: Employee[];
  loans: Loan[];
  config?: {
    match?: { rate: number; capPerEmployee: number };
    vesting?: { type: string; periodMonths: number; totalPeriods: number; cliffMonths: number };
  };
}

interface TxHashes {
  vaultCreate?: string;
  loanBroker?: string;
  coverDeposit?: string;
  credentialCreate?: string;
  credentialAccept?: string;
}

/* ── Shared UI atoms ── */

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex ml-1 cursor-help">
      <svg className="h-3.5 w-3.5 text-foreground/30 group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" strokeWidth="2" />
        <path strokeLinecap="round" strokeWidth="2" d="M12 16v-4m0-4h.01" />
      </svg>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-foreground text-background text-xs leading-relaxed p-3 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
        {text}
      </span>
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs px-2 py-0.5 rounded bg-card-border hover:bg-accent/20 text-foreground/60 hover:text-accent transition-colors ml-2"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function TxLink({ hash, label }: { hash: string; label: string }) {
  return (
    <a
      href={EXPLORER(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs text-accent hover:underline font-mono"
      title="View this transaction on the XRPL Devnet explorer"
    >
      {label}: {hash.slice(0, 12)}...
    </a>
  );
}

function Spinner({ text }: { text: string }) {
  return (
    <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 mb-6 text-accent">
      <div className="flex items-center gap-2">
        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{text}</span>
        <span className="text-xs text-accent/60 ml-auto">~15–20s</span>
      </div>
    </div>
  );
}

const CREDENTIAL_TIPS: Record<string, string> = {
  employee: "On-chain proof this person works at your company. Required before they can deposit or borrow.",
  creditworthy: "Earned by fully repaying a loan. Unlocks better borrowing rates and higher limits.",
};

/* ── Page ── */

export default function EmployerDashboard() {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [employer, setEmployer] = useState<{ address: string; seed: string } | null>(null);
  const [vault, setVault] = useState<VaultData | null>(null);
  const [vaultTxHashes, setVaultTxHashes] = useState<TxHashes | null>(null);
  const [companyName, setCompanyName] = useState("Acme Corp");
  const [matchRate, setMatchRate] = useState("0.5");
  const [matchCap, setMatchCap] = useState("500");
  const [employeeName, setEmployeeName] = useState("");
  const [employeeAddress, setEmployeeAddress] = useState("");
  const [onboardMode, setOnboardMode] = useState<"demo" | "address">("demo");
  const [lastOnboardTx, setLastOnboardTx] = useState<TxHashes | null>(null);
  const [clawbackTarget, setClawbackTarget] = useState<string>("");
  const [clawbackAmount, setClawbackAmount] = useState("");

  // XUMM state
  const [xummAvailable, setXummAvailable] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [xummPayloadId, setXummPayloadId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [manualSeed, setManualSeed] = useState("");
  const [xummAddress, setXummAddress] = useState<string | null>(null); // address verified via XUMM, awaiting seed

  useEffect(() => {
    api.xummEnabled().then(setXummAvailable);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // XUMM QR sign-in flow
  async function handleXummConnect() {
    setLoading("Generating QR code...");
    setError("");
    try {
      await api.init();
      const payload = await api.xummSignIn();
      setQrUrl(payload.qrUrl);
      setXummPayloadId(payload.payloadId);
      setLoading("Scan the QR code with your Xaman wallet app...");

      // Poll for sign result
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.xummStatus(payload.payloadId);
          if (status.status === "signed") {
            if (pollRef.current) clearInterval(pollRef.current);
            setQrUrl(null);
            setXummPayloadId(null);
            // XUMM verified identity — now create a Devnet wallet linked to this user
            // On mainnet, transactions would be signed via XUMM payloads instead
            setLoading("Wallet verified! Setting up your Devnet vault wallet...");
            const wallet = await api.createWallet();
            setEmployer({ address: wallet.address, seed: wallet.seed });
            setXummAddress(status.address);
            setLoading("");
          } else if (status.status === "cancelled" || status.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            setQrUrl(null);
            setXummPayloadId(null);
            setLoading("");
            if (status.status === "expired") setError("QR code expired — try again");
          }
        } catch {}
      }, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "XUMM connect failed");
      setLoading("");
    }
  }

  // Demo wallet flow (auto-creates funded wallet)
  async function handleDemoInit() {
    setLoading("Creating demo wallet on XRPL Devnet...");
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

  // Connect with existing seed
  async function handleSeedConnect() {
    if (!manualSeed) return;
    setLoading("Connecting wallet...");
    setError("");
    try {
      await api.init();
      // Derive address from seed by creating a balance check
      // The backend walletFromSeed derives the address
      setEmployer({ address: "", seed: manualSeed });
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection failed");
      setLoading("");
    }
  }

  async function handleCreateVault() {
    if (!employer) return;
    setLoading("Creating vault on XRPL Devnet (3 on-chain transactions)...");
    setError("");
    try {
      const result = await api.createVault(employer.seed, companyName, {
        matchRate: parseFloat(matchRate) || 0,
        matchCap: parseFloat(matchCap) || 0,
      });
      setVaultTxHashes(result.txHashes);
      const vaultData = await api.getVault(result.vaultId);
      setVault(vaultData);
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Vault creation failed");
      setLoading("");
    }
  }

  async function handleOnboard() {
    if (!vault) return;
    if (onboardMode === "demo") {
      if (!employeeName) return;
      setLoading(`Onboarding ${employeeName} (wallet + trust line + credential txs)...`);
      setError("");
      try {
        const result = await api.onboardEmployee(vault.id, employeeName);
        setLastOnboardTx(result.txHashes);
        const updated = await api.getVault(vault.id);
        setVault(updated);
        setEmployeeName("");
        setLoading("");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Onboarding failed");
        setLoading("");
      }
    } else {
      if (!employeeAddress) return;
      setLoading(`Adding ${employeeName || employeeAddress.slice(0, 8)} by wallet address...`);
      setError("");
      try {
        const result = await api.addMember(vault.id, employeeAddress, employeeName || undefined);
        setLastOnboardTx({ credentialCreate: result.txHash });
        const updated = await api.getVault(vault.id);
        setVault(updated);
        setEmployeeName("");
        setEmployeeAddress("");
        setLoading("");
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Add member failed");
        setLoading("");
      }
    }
  }

  async function handleClawback(address: string) {
    if (!vault) return;
    const amt = clawbackAmount ? parseFloat(clawbackAmount) : undefined;
    setLoading(`Clawing back${amt ? ` ${amt} RLUSD` : " all RLUSD"} from ${address.slice(0, 8)}...`);
    setError("");
    try {
      await api.clawback(vault.id, address, amt);
      const updated = await api.getVault(vault.id);
      setVault(updated);
      setClawbackTarget("");
      setClawbackAmount("");
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Clawback failed");
      setLoading("");
    }
  }

  async function handleDefaultLoan(loanId: string) {
    if (!vault) return;
    setLoading("Defaulting loan on-chain...");
    setError("");
    try {
      await api.defaultLoan(vault.id, loanId);
      const updated = await api.getVault(vault.id);
      setVault(updated);
      setLoading("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Default failed");
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
      <h1 className="text-3xl font-bold mb-2">Employer Dashboard</h1>
      <p className="text-foreground/50 text-sm mb-6">Set up a savings vault for your team. Employees deposit, you match, they borrow at fair rates.</p>

      {loading && <Spinner text={loading} />}

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 text-danger text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Connect Wallet */}
      {!employer && (
        <div className="border border-card-border bg-card-bg rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">Step 1: Connect Your Wallet</h2>
          <p className="text-foreground/60 mb-5 text-sm">
            Connect your XRPL wallet to create and manage a vault. Choose how you want to connect:
          </p>

          {/* QR code display */}
          {qrUrl && (
            <div className="flex flex-col items-center mb-6 p-6 bg-background/50 border border-accent/30 rounded-xl">
              <p className="text-sm text-foreground/70 mb-3">Scan with your Xaman (XUMM) wallet app:</p>
              <img src={qrUrl} alt="XUMM QR Code" className="w-48 h-48 rounded-lg" />
              <p className="text-xs text-foreground/40 mt-3">Waiting for you to scan and approve...</p>
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  setQrUrl(null); setXummPayloadId(null); setLoading("");
                }}
                className="text-xs text-foreground/40 hover:text-foreground/60 mt-2"
              >
                Cancel
              </button>
            </div>
          )}

          {!qrUrl && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: XUMM QR */}
              <button
                onClick={handleXummConnect}
                disabled={!!loading || !xummAvailable}
                className={`text-left border-2 rounded-xl p-5 transition-all ${
                  xummAvailable
                    ? "border-card-border bg-card-bg hover:border-accent/40"
                    : "border-card-border bg-card-bg/50 opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  <span className="font-semibold">Scan with Xaman</span>
                </div>
                <p className="text-xs text-foreground/50">
                  {xummAvailable
                    ? "Scan a QR code with the Xaman (XUMM) wallet app to connect your existing XRPL wallet."
                    : "XUMM not configured on server. Set XUMM_API_KEY to enable."}
                </p>
              </button>

              {/* Option 2: Quick start */}
              <button
                onClick={handleDemoInit}
                disabled={!!loading}
                className="text-left border-2 border-accent bg-accent/5 rounded-xl p-5 hover:bg-accent/10 transition-all"
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span className="font-semibold">Quick Start</span>
                  <span className="text-xs bg-accent/20 text-accent rounded-full px-2 py-0.5">Recommended</span>
                </div>
                <p className="text-xs text-foreground/50">
                  We&apos;ll set everything up for you — wallet, funding, and RLUSD. Ready to go in seconds.
                </p>
              </button>
            </div>
          )}

          {/* Manual seed input (collapsed) */}
          {!qrUrl && (
            <details className="mt-4">
              <summary className="text-xs text-foreground/40 cursor-pointer hover:text-foreground/60 transition-colors">
                Connect with existing wallet seed
              </summary>
              <div className="flex gap-3 mt-3">
                <input
                  type="password"
                  value={manualSeed}
                  onChange={(e) => setManualSeed(e.target.value)}
                  placeholder="sEdXXX..."
                  className="bg-background border border-card-border rounded-lg px-4 py-2 flex-1 text-sm font-mono focus:outline-none focus:border-accent transition-colors"
                />
                <button
                  onClick={handleSeedConnect}
                  disabled={!!loading || !manualSeed}
                  className="bg-card-border hover:bg-foreground/10 text-foreground font-semibold px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  Connect
                </button>
              </div>
              <p className="text-xs text-foreground/30 mt-1">Paste your XRPL seed to connect an existing wallet.</p>
            </details>
          )}
        </div>
      )}

      {/* Step 2: Create Vault */}
      {employer && !vault && (
        <div className="border border-card-border bg-card-bg rounded-xl p-6">
          <h2 className="text-xl font-semibold mb-2">Step 2: Create Company Vault</h2>
          <p className="text-foreground/60 mb-4 text-sm">
            A vault is an on-chain savings pool where employees deposit RLUSD and earn shares.
            Loans are drawn from this pool. Configure how much you want to match below.
          </p>
          <div className="text-xs text-foreground/40 mb-4 font-mono break-all bg-background/50 rounded-lg px-3 py-2 border border-card-border">
            Your employer wallet: {employer.address}
            <CopyButton text={employer.address} />
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Corp"
                className="bg-background border border-card-border rounded-lg px-4 py-2.5 w-full text-sm focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center text-sm font-medium mb-1.5">
                  Employer Match Rate
                  <InfoTip text="How much you contribute for every dollar an employee deposits. 0.5 means you add 50 cents for every $1 they put in — like a 401k match." />
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    value={matchRate}
                    onChange={(e) => setMatchRate(e.target.value)}
                    className="bg-background border border-card-border rounded-lg px-4 py-2.5 w-full text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 text-sm">
                    = {((parseFloat(matchRate) || 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-foreground/40 text-xs mt-1">0.5 = 50% match, 1.0 = dollar-for-dollar</p>
              </div>
              <div>
                <label className="flex items-center text-sm font-medium mb-1.5">
                  Match Cap per Employee
                  <InfoTip text="The maximum total RLUSD you'll match per employee. Once reached, further deposits won't be matched. Protects your budget." />
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={matchCap}
                    onChange={(e) => setMatchCap(e.target.value)}
                    className="bg-background border border-card-border rounded-lg px-4 py-2.5 w-full text-sm focus:outline-none focus:border-accent transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 text-sm">RLUSD</span>
                </div>
                <p className="text-foreground/40 text-xs mt-1">Total lifetime match limit per person</p>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-background/50 border border-card-border rounded-lg p-4 text-sm text-foreground/60">
              <div className="font-medium text-foreground/80 mb-1">Preview</div>
              If an employee deposits <span className="text-accent font-medium">$200</span>, you auto-contribute{" "}
              <span className="text-accent font-medium">
                ${Math.min(200 * (parseFloat(matchRate) || 0), parseFloat(matchCap) || 0).toFixed(0)}
              </span>{" "}
              (up to your ${matchCap} cap).
            </div>

            <button
              onClick={handleCreateVault}
              disabled={!!loading}
              className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              Create Vault
            </button>
            <p className="text-foreground/40 text-xs">
              This sends 3 transactions to XRPL Devnet (~15–20s):
              <span className="group relative cursor-help ml-1 text-foreground/50 underline decoration-dotted">VaultCreate<span className="pointer-events-none absolute bottom-full left-0 mb-2 w-48 rounded-lg bg-foreground text-background text-xs p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">Creates the on-chain savings pool</span></span>,{" "}
              <span className="group relative cursor-help text-foreground/50 underline decoration-dotted">LoanBrokerSet<span className="pointer-events-none absolute bottom-full left-0 mb-2 w-52 rounded-lg bg-foreground text-background text-xs p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">Enables the vault to issue loans to employees</span></span>, and{" "}
              <span className="group relative cursor-help text-foreground/50 underline decoration-dotted">CoverDeposit<span className="pointer-events-none absolute bottom-full left-0 mb-2 w-56 rounded-lg bg-foreground text-background text-xs p-2 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">First-loss capital that protects depositors if a loan defaults</span></span>.
            </p>
          </div>
        </div>
      )}

      {/* Vault Dashboard */}
      {vault && (
        <div className="space-y-6">

          {/* Vault Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Company</div>
              <div className="text-xl font-semibold">{vault.companyName}</div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="flex items-center text-foreground/50 text-sm mb-1">
                Vault Balance
                <InfoTip text="Total RLUSD in the pool right now — employee deposits + employer matches. This is what backs the loans." />
              </div>
              <div className="text-xl font-semibold text-accent">{parseFloat(vault.vaultBalance).toFixed(2)}</div>
              <div className="text-foreground/30 text-xs">RLUSD</div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="text-foreground/50 text-sm mb-1">Employees</div>
              <div className="text-xl font-semibold">{vault.employees.length}</div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="flex items-center text-foreground/50 text-sm mb-1">
                Active Loans
                <InfoTip text="Loans currently outstanding — money borrowed by employees from the vault pool." />
              </div>
              <div className="text-xl font-semibold">
                {vault.loans.filter((l) => l.status === "active").length}
              </div>
            </div>
            <div className="border border-card-border bg-card-bg rounded-xl p-5">
              <div className="flex items-center text-foreground/50 text-sm mb-1">
                Employer Match
                <InfoTip text="Your match rate and per-employee cap. When an employee deposits, you automatically contribute this percentage on top." />
              </div>
              <div className="text-xl font-semibold">
                {vault.config?.match ? `${(vault.config.match.rate * 100).toFixed(0)}%` : "—"}
              </div>
              <div className="text-foreground/40 text-xs mt-0.5">
                {vault.config?.match?.capPerEmployee ? `up to $${vault.config.match.capPerEmployee}/person` : ""}
              </div>
            </div>
          </div>

          {/* Vault IDs — collapsed by default for cleanliness */}
          <details className="border border-card-border bg-card-bg rounded-xl group">
            <summary className="px-4 py-3 text-xs text-foreground/40 cursor-pointer hover:text-foreground/60 transition-colors flex items-center gap-2">
              <svg className="h-3 w-3 transition-transform group-open:rotate-90" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
              On-chain IDs &amp; transaction hashes
            </summary>
            <div className="px-4 pb-4 text-xs text-foreground/40 space-y-1 border-t border-card-border pt-3">
              <div className="font-mono break-all">
                <span className="text-foreground/50">Vault ID:</span> {vault.id} <CopyButton text={vault.id} />
              </div>
              {vault.loanBrokerId && (
                <div className="font-mono break-all">
                  <span className="text-foreground/50">LoanBroker:</span> {vault.loanBrokerId}
                </div>
              )}
              {vaultTxHashes && (
                <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-card-border">
                  {vaultTxHashes.vaultCreate && <TxLink hash={vaultTxHashes.vaultCreate} label="VaultCreate" />}
                  {vaultTxHashes.loanBroker && <TxLink hash={vaultTxHashes.loanBroker} label="LoanBroker" />}
                  {vaultTxHashes.coverDeposit && <TxLink hash={vaultTxHashes.coverDeposit} label="CoverDeposit" />}
                </div>
              )}
            </div>
          </details>

          {/* Onboard Employee */}
          <div className="border border-card-border bg-card-bg rounded-xl p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold">Add Employee</h2>
              <div className="flex gap-1 bg-background rounded-lg p-0.5">
                <button
                  onClick={() => setOnboardMode("demo")}
                  className={`text-xs px-3 py-1 rounded-md transition-all ${onboardMode === "demo" ? "bg-accent text-black font-medium" : "text-foreground/50 hover:text-foreground"}`}
                >
                  Set Up For Them
                </button>
                <button
                  onClick={() => setOnboardMode("address")}
                  className={`text-xs px-3 py-1 rounded-md transition-all ${onboardMode === "address" ? "bg-accent text-black font-medium" : "text-foreground/50 hover:text-foreground"}`}
                >
                  They Have a Wallet
                </button>
              </div>
            </div>

            {onboardMode === "demo" ? (
              <>
                <p className="text-foreground/50 text-sm mb-4">
                  We&apos;ll create their wallet, fund it with RLUSD, and issue their on-chain employee credential — all in one step.
                </p>
                <div className="flex gap-3">
                  <input type="text" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Employee Name"
                    className="bg-background border border-card-border rounded-lg px-4 py-2.5 flex-1 text-sm focus:outline-none focus:border-accent transition-colors" />
                  <button onClick={handleOnboard} disabled={!!loading || !employeeName}
                    className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                    Onboard
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-foreground/50 text-sm mb-4">
                  Add an employee who already has an XRPL wallet. Issues an &quot;employee&quot; credential to their address — they&apos;ll need to accept it.
                </p>
                <div className="space-y-3">
                  <input type="text" value={employeeAddress} onChange={(e) => setEmployeeAddress(e.target.value)}
                    placeholder="XRPL Address (rXXX...)"
                    className="bg-background border border-card-border rounded-lg px-4 py-2.5 w-full text-sm font-mono focus:outline-none focus:border-accent transition-colors" />
                  <div className="flex gap-3">
                    <input type="text" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)}
                      placeholder="Name (optional)"
                      className="bg-background border border-card-border rounded-lg px-4 py-2.5 flex-1 text-sm focus:outline-none focus:border-accent transition-colors" />
                    <button onClick={handleOnboard} disabled={!!loading || !employeeAddress}
                      className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                      Add Member
                    </button>
                  </div>
                </div>
              </>
            )}

            {lastOnboardTx && (
              <div className="flex gap-3 mt-3 flex-wrap">
                {lastOnboardTx.credentialCreate && <TxLink hash={lastOnboardTx.credentialCreate} label="CredentialCreate" />}
                {lastOnboardTx.credentialAccept && <TxLink hash={lastOnboardTx.credentialAccept} label="CredentialAccept" />}
              </div>
            )}
          </div>

          {/* Employee List */}
          {vault.employees.length > 0 && (
            <div className="border border-card-border bg-card-bg rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Employees</h2>
                <button onClick={refreshVault} className="text-accent hover:text-accent-light text-sm transition-colors">
                  Refresh
                </button>
              </div>
              <div className="space-y-3">
                {vault.employees.map((emp) => (
                  <div key={emp.address} className="bg-background/50 border border-card-border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <div className="font-medium">{emp.name}</div>
                        <div className="text-xs text-foreground/40 font-mono mt-1 break-all">
                          {emp.address} <CopyButton text={emp.address} />
                        </div>
                        <details className="mt-1">
                          <summary className="text-xs text-foreground/30 cursor-pointer hover:text-foreground/50 transition-colors">
                            Show wallet seed (share privately with employee)
                          </summary>
                          <div className="text-xs text-foreground/30 font-mono mt-1 break-all">
                            {emp.seed} <CopyButton text={emp.seed} />
                          </div>
                        </details>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <div className="text-sm">
                          <span className="text-accent">{emp.rlusdBalance.toFixed(2)}</span>{" "}
                          <span className="text-foreground/50">RLUSD</span>
                        </div>
                        <div className="flex items-center justify-end text-xs text-foreground/50 mt-1">
                          Shares: {emp.shares}
                          <InfoTip text="Vault shares represent this employee's ownership stake in the pool. More shares = more of the pool belongs to them." />
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {emp.credentials.map((cred) => (
                        <span
                          key={cred}
                          title={CREDENTIAL_TIPS[cred] || ""}
                          className={`text-xs px-2.5 py-0.5 rounded-full cursor-help ${
                            cred === "creditworthy" ? "bg-success/20 text-success border border-success/30" : "bg-accent/20 text-accent border border-accent/30"
                          }`}
                        >
                          {cred}
                        </span>
                      ))}
                    </div>

                    {/* Clawback */}
                    {clawbackTarget === emp.address ? (
                      <div className="flex gap-2 mt-3 items-center">
                        <input
                          type="number"
                          value={clawbackAmount}
                          onChange={(e) => setClawbackAmount(e.target.value)}
                          placeholder="Amount (blank = all)"
                          className="bg-background border border-card-border rounded-lg px-3 py-1.5 text-xs flex-1"
                        />
                        <button
                          onClick={() => handleClawback(emp.address)}
                          disabled={!!loading}
                          className="bg-danger hover:bg-danger/80 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setClawbackTarget("")}
                          className="text-xs text-foreground/50 hover:text-foreground px-3 py-1.5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setClawbackTarget(emp.address)}
                        title="Reclaim unvested employer match shares from this employee"
                        className="mt-3 text-xs text-danger/60 hover:text-danger transition-colors"
                      >
                        Clawback shares
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loans */}
          {vault.loans.length > 0 && (
            <div className="border border-card-border bg-card-bg rounded-xl p-6">
              <div className="flex items-center mb-4">
                <h2 className="text-lg font-semibold">Loans</h2>
                <InfoTip text="Loans drawn by employees from the vault pool. You can mark a loan as defaulted if the employee stops repaying." />
              </div>
              <div className="space-y-3">
                {vault.loans.map((loan) => (
                  <div
                    key={loan.id}
                    className="bg-background/50 border border-card-border rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div className="min-w-0">
                        <div className="text-sm font-mono text-foreground/60 break-all">
                          {loan.borrower}
                        </div>
                        <div className="text-xs text-foreground/40 mt-1">
                          Principal: {loan.principal} RLUSD
                        </div>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <div className="text-sm">
                          Remaining:{" "}
                          <span className={parseFloat(loan.remaining) > 0 ? "text-danger" : "text-success"}>
                            {parseFloat(loan.remaining).toFixed(2)} RLUSD
                          </span>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${
                            loan.status === "repaid"
                              ? "bg-success/20 text-success"
                              : loan.status === "defaulted"
                              ? "bg-danger/20 text-danger"
                              : "bg-accent/20 text-accent"
                          }`}
                        >
                          {loan.status}
                        </span>
                      </div>
                    </div>
                    {loan.status === "active" && (
                      <button
                        onClick={() => handleDefaultLoan(loan.id)}
                        disabled={!!loading}
                        title="Mark this loan as defaulted — the cover deposit absorbs the loss"
                        className="mt-3 text-xs text-danger/60 hover:text-danger transition-colors disabled:opacity-30"
                      >
                        Mark as Default
                      </button>
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
