"use client";

import { useState, useEffect, useRef } from "react";
import { api, EXPLORER } from "@/lib/api";

interface Loan {
  id: string;
  borrower: string;
  principal: number;
  remaining: string;
  status: string;
  tier?: string;
  loanInfo?: { PrincipalOutstanding?: string } | null;
}

interface LedgerEntry {
  txHash?: string;
  hash?: string;
  type?: string;
  amount?: string;
  timestamp?: string;
}

interface YieldData {
  deposits: { total: number; count: number };
  employerMatch: {
    totalMatched: number;
    vested: number;
    unvested: number;
    vestPercent: number;
    nextVestDate: string | null;
    nextVestAmount: number;
  };
  shares: { count: number; price: number; currentValue: number };
  yield: { earned: number; effectiveAPY: number };
  withdrawable: { max: number; note: string | null };
}

interface TierInfo {
  tierName: string;
  InterestRate: number;
  maxPrincipal: number;
  PaymentTotal: number;
  PaymentInterval: number;
  GracePeriod: number;
  requiredCredential: string;
  requiresDeposit?: boolean;
  eligible: boolean;
  reason: string | null;
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

const CREDENTIAL_META: Record<string, { color: string; description: string }> = {
  employee: {
    color: "bg-accent/20 text-accent border border-accent/30",
    description: "Verified employee — your employer issued this on-chain. Required to deposit and borrow.",
  },
  creditworthy: {
    color: "bg-success/20 text-success border border-success/30",
    description: "Earned by fully repaying a loan. Unlocks the creditworthy tier with better rates and higher limits.",
  },
};

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

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={EXPLORER(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono text-accent hover:underline text-xs"
      title="View on XRPL Devnet explorer"
    >
      {hash.slice(0, 16)}...
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
        <span className="text-xs text-accent/60 ml-auto">~5–20s</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent, tip }: { label: string; value: string; sub: string; accent?: boolean; tip?: string }) {
  return (
    <div className="border border-card-border bg-card-bg rounded-xl p-5 hover:border-accent/30 transition-colors">
      <div className="flex items-center text-foreground/50 text-xs font-medium uppercase tracking-wide mb-2">
        {label}
        {tip && <InfoTip text={tip} />}
      </div>
      <div className={`text-2xl font-bold ${accent ? "text-accent" : "text-foreground"}`}>{value}</div>
      <div className="text-foreground/30 text-xs mt-1">{sub}</div>
    </div>
  );
}

function RepaymentProgress({ principal, outstanding }: { principal: number; outstanding: number }) {
  const repaid = Math.max(0, principal - outstanding);
  const pct = principal > 0 ? Math.min(100, (repaid / principal) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-foreground/40 mb-1">
        <span>{repaid.toFixed(2)} repaid</span>
        <span>{outstanding.toFixed(2)} remaining</span>
      </div>
      <div className="h-1.5 bg-background rounded-full overflow-hidden">
        <div className="h-full bg-success rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function VestingBar({ vestPercent, vested, unvested }: { vestPercent: number; vested: number; unvested: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs text-foreground/40 mb-1">
        <span>${vested.toFixed(2)} vested</span>
        <span>${unvested.toFixed(2)} unvested</span>
      </div>
      <div className="h-2 bg-background rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${vestPercent}%` }} />
      </div>
      <div className="text-xs text-foreground/30 mt-1">{vestPercent}% vested</div>
    </div>
  );
}

/* ── Page ── */

export default function EmployeeDashboard() {
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");

  const [vaultId, setVaultId] = useState("");
  const [employeeSeed, setEmployeeSeed] = useState("");
  const [employeeAddress, setEmployeeAddress] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [connected, setConnected] = useState(false);

  // XUMM
  const [xummAvailable, setXummAvailable] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api.xummEnabled().then(setXummAvailable);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const [rlusdBalance, setRlusdBalance] = useState(0);
  const [xrpBalance, setXrpBalance] = useState(0);
  const [shares, setShares] = useState(0);
  const [credentials, setCredentials] = useState<string[]>([]);
  const [vaultBalance, setVaultBalance] = useState("0");
  const [loans, setLoans] = useState<Loan[]>([]);

  const [yieldData, setYieldData] = useState<YieldData | null>(null);
  const [loanTiers, setLoanTiers] = useState<Record<string, TierInfo>>({});

  const [depositAmount, setDepositAmount] = useState("200");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loanAmount, setLoanAmount] = useState("100");
  const [loanTier, setLoanTier] = useState("emergency");
  const [repayAmounts, setRepayAmounts] = useState<Record<string, string>>({});
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [creditworthyCelebration, setCreditworthyCelebration] = useState(false);

  const [activeTab, setActiveTab] = useState<"savings" | "loans" | "history">("savings");
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  useEffect(() => {
    try {
      const sv = localStorage.getItem("hyve_vault_id");
      const ss = localStorage.getItem("hyve_employee_seed");
      if (sv) setVaultId(sv);
      if (ss) setEmployeeSeed(ss);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (vaultId) localStorage.setItem("hyve_vault_id", vaultId);
      if (employeeSeed) localStorage.setItem("hyve_employee_seed", employeeSeed);
    } catch {}
  }, [vaultId, employeeSeed]);

  function clearSavedCredentials() {
    try { localStorage.removeItem("hyve_vault_id"); localStorage.removeItem("hyve_employee_seed"); } catch {}
    setVaultId(""); setEmployeeSeed("");
  }

  async function fetchLedger() {
    if (!vaultId) return;
    setLedgerLoading(true);
    try {
      const data = await api.getVaultLedger(vaultId);
      setLedger(Array.isArray(data) ? data : (data.transactions ?? data.ledger ?? []));
    } catch {} finally { setLedgerLoading(false); }
  }

  async function fetchYield(vid: string, addr: string) {
    try { setYieldData(await api.getYield(vid, addr)); } catch {}
  }

  async function fetchLoanTiers(vid: string, addr: string) {
    try { const d = await api.getLoanTiers(vid, addr); setLoanTiers(d.tiers || {}); } catch {}
  }

  async function handleConnect() {
    if (!vaultId || !employeeSeed) return;
    setLoading("Loading vault data from XRPL...");
    setError("");
    try {
      const vault = await api.getVault(vaultId);
      const emp = vault.employees.find((e: { seed: string }) => e.seed === employeeSeed);
      if (!emp) throw new Error("Employee not found in this vault — check your seed and vault ID");
      const balances = await api.getBalance(emp.address);
      setEmployeeAddress(emp.address);
      setEmployeeName(emp.name || "");
      setCompanyName(vault.companyName || "");
      setRlusdBalance(balances.rlusd);
      setXrpBalance(balances.xrp);
      setShares(emp.shares || 0);
      setCredentials(balances.credentials);
      setVaultBalance(vault.vaultBalance);
      setLoans(vault.loans.filter((l: Loan) => l.borrower === emp.address));
      setConnected(true);
      setLoading("");
      fetchYield(vaultId, emp.address);
      fetchLoanTiers(vaultId, emp.address);
      api.getVaultLedger(vaultId).then((data) => {
        setLedger(Array.isArray(data) ? data : (data.transactions ?? data.ledger ?? []));
      }).catch(() => {});
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Connection failed");
      setLoading("");
    }
  }

  function handleDisconnect() {
    setConnected(false); setEmployeeAddress(""); setEmployeeName(""); setCompanyName("");
    setRlusdBalance(0); setXrpBalance(0); setShares(0); setCredentials([]);
    setVaultBalance("0"); setLoans([]); setLedger([]); setYieldData(null); setLoanTiers({});
    setActiveTab("savings"); setLastTxHash(null); setCreditworthyCelebration(false); setError("");
  }

  async function refresh() {
    try {
      const vault = await api.getVault(vaultId);
      const emp = vault.employees.find((e: { seed: string }) => e.seed === employeeSeed);
      const balances = await api.getBalance(employeeAddress);
      if (emp) setShares(emp.shares || 0);
      setRlusdBalance(balances.rlusd); setXrpBalance(balances.xrp);
      setCredentials(balances.credentials); setVaultBalance(vault.vaultBalance);
      setLoans(vault.loans.filter((l: Loan) => l.borrower === employeeAddress));
      fetchYield(vaultId, employeeAddress);
      fetchLoanTiers(vaultId, employeeAddress);
    } catch {}
  }

  async function handleDeposit() {
    const amt = parseFloat(depositAmount);
    if (!amt || amt <= 0) return;
    setLoading(`Depositing ${amt} RLUSD to vault...`);
    setError(""); setLastTxHash(null);
    try {
      const result = await api.deposit(vaultId, employeeSeed, amt);
      if (result.txHash) setLastTxHash(result.txHash);
      await refresh();
      setLoading("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Deposit failed"); setLoading(""); }
  }

  async function handleWithdraw() {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) return;
    setLoading(`Withdrawing ${amt} RLUSD from vault...`);
    setError(""); setLastTxHash(null);
    try {
      const result = await api.withdraw(vaultId, employeeSeed, amt);
      if (result.txHash) setLastTxHash(result.txHash);
      await refresh(); setWithdrawAmount(""); setLoading("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Withdrawal failed"); setLoading(""); }
  }

  async function handleDrawLoan() {
    const amt = parseFloat(loanAmount);
    if (!amt || amt <= 0) return;
    setLoading(`Drawing ${amt} RLUSD ${loanTier} loan...`);
    setError(""); setLastTxHash(null);
    try {
      const result = await api.drawLoan(vaultId, employeeAddress, employeeSeed, amt, loanTier);
      if (result.txHash) setLastTxHash(result.txHash);
      setLoans((prev) => [...prev, result.loan]);
      await refresh(); setLoading("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Loan draw failed"); setLoading(""); }
  }

  async function handleRepay(loanId: string, fullAmount: string) {
    const amt = parseFloat(repayAmounts[loanId] || fullAmount);
    setLoading(`Repaying ${amt} RLUSD...`);
    setError(""); setLastTxHash(null); setCreditworthyCelebration(false);
    try {
      const result = await api.repayLoan(vaultId, loanId, employeeSeed, amt);
      if (result.txHash) setLastTxHash(result.txHash);
      if (result.credentials?.includes("creditworthy") && !credentials.includes("creditworthy")) {
        setCreditworthyCelebration(true);
      }
      setCredentials(result.credentials || credentials);
      await refresh(); setLoading("");
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Repayment failed"); setLoading(""); }
  }

  async function handlePayInFull(loanId: string, remaining: string) {
    setRepayAmounts((prev) => ({ ...prev, [loanId]: remaining }));
    await handleRepay(loanId, remaining);
  }

  const activeLoanCount = loans.filter((l) => l.status === "active").length;
  const hasEmployee = credentials.includes("employee");

  function formatAPR(rate: number) { return `${(rate / 100).toFixed(1)}%`; }
  function formatDays(seconds: number) { return `${Math.round(seconds / 86400)}d`; }

  const TX_TYPE_COLORS: Record<string, string> = {
    deposit: "bg-success/20 text-success", withdraw: "bg-accent/20 text-accent",
    loan: "bg-blue-500/20 text-blue-400", repay: "bg-purple-500/20 text-purple-400",
  };

  return (
    <div>
      {loading && <Spinner text={loading} />}

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-6 text-danger text-sm">{error}</div>
      )}

      {creditworthyCelebration && (
        <div className="bg-success/10 border border-success/40 rounded-xl p-5 mb-6 text-center">
          <div className="text-success font-semibold text-lg">Loan fully repaid!</div>
          <div className="text-success/70 text-sm mt-1">
            You&apos;ve earned the <strong>creditworthy</strong> credential on-chain — better loan rates are now unlocked.
          </div>
        </div>
      )}

      {lastTxHash && !loading && (
        <div className="bg-card-bg border border-card-border rounded-lg p-3 mb-4 text-xs flex items-center gap-2">
          <span className="text-foreground/50">Transaction:</span>
          <TxLink hash={lastTxHash} />
          <span className="text-foreground/30">View on XRPL Devnet explorer</span>
        </div>
      )}

      {/* ─── Connect Screen ─── */}
      {!connected && (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
          <h1 className="text-6xl font-bold mb-4"><span className="text-accent">Employee</span></h1>
          <p className="text-xl text-foreground/70 mb-2 max-w-xl">Your company savings vault, on-chain.</p>
          <p className="text-foreground/50 mb-10 max-w-md">
            Deposit savings, earn vault shares, and access emergency loans — all powered by XRPL and RLUSD.
          </p>

          {/* XUMM QR display */}
          {qrUrl && (
            <div className="w-full max-w-md flex flex-col items-center mb-6 p-6 bg-card-bg border border-accent/30 rounded-xl">
              <p className="text-sm text-foreground/70 mb-3">Scan with your Xaman (XUMM) wallet app:</p>
              <img src={qrUrl} alt="XUMM QR Code" className="w-48 h-48 rounded-lg" />
              <p className="text-xs text-foreground/40 mt-3">Waiting for you to scan and approve...</p>
              <button
                onClick={() => {
                  if (pollRef.current) clearInterval(pollRef.current);
                  setQrUrl(null); setLoading("");
                }}
                className="text-xs text-foreground/40 hover:text-foreground/60 mt-2"
              >
                Cancel
              </button>
            </div>
          )}

          {!qrUrl && (
            <div className="w-full max-w-md space-y-4">
              {/* XUMM connect button */}
              {xummAvailable && (
                <button
                  onClick={async () => {
                    if (!vaultId) { setError("Enter your Vault ID first"); return; }
                    setLoading("Generating QR code...");
                    setError("");
                    try {
                      const payload = await api.xummSignIn();
                      setQrUrl(payload.qrUrl);
                      setLoading("Scan the QR code with Xaman...");
                      pollRef.current = setInterval(async () => {
                        try {
                          const status = await api.xummStatus(payload.payloadId);
                          if (status.status === "signed") {
                            if (pollRef.current) clearInterval(pollRef.current);
                            setQrUrl(null);
                            setEmployeeAddress(status.address);
                            // Try auth via on-chain credential
                            try {
                              const auth = await api.authEmployee(status.address, vaultId);
                              setEmployeeName(auth.name || "");
                              setCompanyName("");
                              setRlusdBalance(auth.rlusdBalance || 0);
                              setXrpBalance(auth.xrpBalance || 0);
                              setCredentials(auth.credentials || []);
                              setConnected(true);
                              // Still need seed for signing — prompt user
                            } catch {
                              setError("Wallet connected but no employee credential found for this vault. Ask your employer to add you.");
                            }
                            setLoading("");
                          } else if (status.status === "cancelled" || status.status === "expired") {
                            if (pollRef.current) clearInterval(pollRef.current);
                            setQrUrl(null); setLoading("");
                            if (status.status === "expired") setError("QR code expired — try again");
                          }
                        } catch {}
                      }, 2000);
                    } catch (e: unknown) { setError(e instanceof Error ? e.message : "XUMM failed"); setLoading(""); }
                  }}
                  disabled={!!loading}
                  className="w-full border-2 border-card-border bg-card-bg hover:border-accent/40 rounded-xl p-5 text-left transition-all"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <span className="font-semibold">Connect with Xaman</span>
                  </div>
                  <p className="text-xs text-foreground/50">Scan QR with the Xaman wallet app to prove your identity.</p>
                </button>
              )}

              {/* Seed-based sign in */}
              <div className="border border-card-border bg-card-bg rounded-xl p-6 text-left space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="h-5 w-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span className="font-semibold text-sm">Sign in with Seed</span>
                </div>
                <div>
                  <label className="flex items-center text-sm font-medium mb-1.5">
                    Vault ID
                    <InfoTip text="A 64-character hex string that identifies your company's savings pool on the XRPL ledger. Your employer gives you this." />
                  </label>
                  <input type="text" value={vaultId} onChange={(e) => setVaultId(e.target.value)}
                    placeholder="64-character hex string"
                    className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-accent transition-colors" />
                </div>
                <div>
                  <label className="flex items-center text-sm font-medium mb-1.5">
                    Wallet Seed
                    <InfoTip text="Your private XRPL key (starts with 's'). Signs your transactions — never share it publicly." />
                  </label>
                  <input type="password" value={employeeSeed} onChange={(e) => setEmployeeSeed(e.target.value)}
                    placeholder="sXXX..."
                    className="w-full bg-background border border-card-border rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-accent transition-colors" />
                </div>
                <button onClick={handleConnect} disabled={!!loading || !vaultId || !employeeSeed}
                  className="w-full bg-accent hover:bg-accent-light text-black font-semibold px-6 py-3 rounded-lg transition-colors disabled:opacity-50 text-base">
                  Sign In
                </button>
                <button onClick={clearSavedCredentials} className="block text-xs text-foreground/30 hover:text-foreground/60 transition-colors mx-auto w-full text-center">
                  Clear saved credentials
                </button>
              </div>
            </div>
          )}

          <div className="mt-12 flex gap-3 text-xs text-foreground/40">
            <span className="bg-card-bg border border-card-border rounded-full px-3 py-1">XRPL Devnet</span>
            <span className="bg-card-bg border border-card-border rounded-full px-3 py-1">RLUSD</span>
            <span className="bg-card-bg border border-card-border rounded-full px-3 py-1">Credentials</span>
          </div>
        </div>
      )}

      {/* ─── Dashboard ─── */}
      {connected && (
        <div>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-card-border">
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                <h1 className="text-2xl font-bold">{employeeName || "Employee"}</h1>
                <span className="text-xs bg-success/20 text-success border border-success/30 rounded-full px-2.5 py-0.5 font-medium">Connected</span>
              </div>
              <div className="text-sm text-foreground/40 mb-1.5">{companyName}</div>
              <div className="flex items-center">
                <span className="text-xs text-foreground/30 font-mono bg-card-bg border border-card-border rounded px-2 py-0.5">
                  {employeeAddress.slice(0, 10)}...{employeeAddress.slice(-6)}
                </span>
                <CopyButton text={employeeAddress} />
              </div>
            </div>
            <div className="flex gap-3 items-center shrink-0">
              <button onClick={refresh} disabled={!!loading} className="flex items-center gap-1.5 text-sm text-foreground/50 hover:text-foreground border border-card-border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-5.65M20 15a9 9 0 01-14.65 5.65" /></svg>
                Refresh
              </button>
              <button onClick={handleDisconnect} className="text-sm text-foreground/30 hover:text-foreground/60 transition-colors">Disconnect</button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
            <StatCard label="Your RLUSD" value={rlusdBalance.toFixed(2)} sub="wallet balance" accent tip="RLUSD in your personal wallet, available to deposit into the vault or spend." />
            <StatCard label="Your XRP" value={xrpBalance.toFixed(2)} sub="for tx fees" tip="XRP covers transaction fees on the XRPL network. Each transaction costs a fraction of a cent." />
            <StatCard label="Vault Pool" value={parseFloat(vaultBalance).toFixed(2)} sub="RLUSD pooled" accent tip="Total RLUSD in the company vault — everyone's deposits + employer matches combined. Loans are drawn from this pool." />
            <StatCard label="Your Shares" value={String(shares)} sub={yieldData ? `$${yieldData.shares.currentValue.toFixed(2)} value` : "1 share ≈ 1 RLUSD"} tip="Shares represent your ownership stake in the vault pool. When you deposit RLUSD, you receive shares. Your share value can grow as loans generate interest." />
          </div>

          {/* Credentials */}
          <div className="flex items-center gap-3 flex-wrap mb-6 px-1">
            <span className="flex items-center text-xs text-foreground/40 font-medium uppercase tracking-wide">
              On-chain credentials
              <InfoTip text="Credentials are verifiable badges stored on the XRPL blockchain. They prove things about you (employee status, creditworthiness) without needing a bank or credit bureau." />
            </span>
            {credentials.length === 0 && <span className="text-foreground/30 text-xs italic">No credentials yet</span>}
            {credentials.map((c) => {
              const meta = CREDENTIAL_META[c];
              return (
                <span key={c} title={meta?.description} className={`text-xs px-3 py-1 rounded-full font-medium cursor-help ${meta?.color ?? "bg-card-border text-foreground/60"}`}>
                  {c}
                </span>
              );
            })}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-card-bg border border-card-border rounded-xl p-1 w-fit">
            {(["savings", "loans", "history"] as const).map((tab) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); if (tab === "history" && ledger.length === 0) fetchLedger(); }}
                  className={`relative px-5 py-2 text-sm font-medium rounded-lg transition-all ${isActive ? "bg-accent text-black shadow-sm" : "text-foreground/50 hover:text-foreground"}`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  {tab === "loans" && activeLoanCount > 0 && (
                    <span className={`ml-1.5 text-xs rounded-full px-1.5 py-0.5 font-semibold ${isActive ? "bg-black/20 text-black" : "bg-accent/20 text-accent"}`}>{activeLoanCount}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ═══ Savings Tab ═══ */}
          {activeTab === "savings" && (
            <div className="space-y-5">

              {/* 401k Yield Breakdown */}
              {yieldData && (
                <div className="border border-card-border bg-card-bg rounded-xl p-6">
                  <div className="flex items-center mb-4">
                    <h2 className="text-base font-semibold">401k Breakdown</h2>
                    <InfoTip text="A summary of your savings: what you deposited, what your employer matched, how much has vested, and what you can withdraw today." />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
                    <div>
                      <div className="flex items-center text-foreground/50 text-xs uppercase tracking-wide mb-1">
                        Your Deposits
                        <InfoTip text="Total RLUSD you've personally deposited into the vault over time." />
                      </div>
                      <div className="text-xl font-bold">${yieldData.deposits.total.toFixed(2)}</div>
                      <div className="text-foreground/30 text-xs">{yieldData.deposits.count} deposit{yieldData.deposits.count !== 1 ? "s" : ""}</div>
                    </div>
                    <div>
                      <div className="flex items-center text-foreground/50 text-xs uppercase tracking-wide mb-1">
                        Employer Match
                        <InfoTip text="RLUSD your employer contributed on top of your deposits. Think of it like a 401k match — free money that vests over time." />
                      </div>
                      <div className="text-xl font-bold text-accent">${yieldData.employerMatch.totalMatched.toFixed(2)}</div>
                      <div className="text-foreground/30 text-xs">${yieldData.employerMatch.vested.toFixed(2)} vested</div>
                    </div>
                    <div>
                      <div className="flex items-center text-foreground/50 text-xs uppercase tracking-wide mb-1">
                        Share Value
                        <InfoTip text="What your vault shares are worth right now. Share price can increase as loans generate interest for the pool." />
                      </div>
                      <div className="text-xl font-bold">${yieldData.shares.currentValue.toFixed(2)}</div>
                      <div className="text-foreground/30 text-xs">{yieldData.shares.count} shares @ ${yieldData.shares.price.toFixed(3)}</div>
                    </div>
                    <div>
                      <div className="flex items-center text-foreground/50 text-xs uppercase tracking-wide mb-1">
                        Withdrawable
                        <InfoTip text="How much you can take out today. If your employer match hasn't fully vested, that portion gets clawed back on withdrawal." />
                      </div>
                      <div className="text-xl font-bold text-success">${yieldData.withdrawable.max.toFixed(2)}</div>
                      {yieldData.withdrawable.note && <div className="text-danger/60 text-xs">{yieldData.withdrawable.note}</div>}
                    </div>
                  </div>

                  {yieldData.employerMatch.totalMatched > 0 && (
                    <div className="border-t border-card-border pt-4">
                      <div className="flex items-center text-foreground/50 text-xs uppercase tracking-wide mb-2">
                        Employer Match Vesting
                        <InfoTip text="Vesting means your employer's match becomes 'yours' gradually over time. If you withdraw before fully vested, the unvested portion is returned to the employer." />
                      </div>
                      <VestingBar vestPercent={yieldData.employerMatch.vestPercent} vested={yieldData.employerMatch.vested} unvested={yieldData.employerMatch.unvested} />
                      {yieldData.employerMatch.nextVestDate && (
                        <div className="text-xs text-foreground/40 mt-2">
                          Next vest: ${yieldData.employerMatch.nextVestAmount.toFixed(2)} on {yieldData.employerMatch.nextVestDate}
                        </div>
                      )}
                    </div>
                  )}

                  {yieldData.yield.earned > 0 && (
                    <div className="border-t border-card-border pt-4 mt-4">
                      <div className="flex items-center text-foreground/50 text-xs uppercase tracking-wide mb-1">
                        Yield Earned
                        <InfoTip text="Extra RLUSD your shares have earned from loan interest paid by other borrowers in the pool." />
                      </div>
                      <div className="text-xl font-bold text-success">${yieldData.yield.earned.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Deposit */}
              <div className="border border-card-border bg-card-bg rounded-xl p-6">
                <div className="flex items-center mb-1">
                  <h2 className="text-base font-semibold">Deposit to Vault</h2>
                  <InfoTip text="Move RLUSD from your wallet into the shared vault pool. You'll receive vault shares in return, and your employer may auto-match your deposit." />
                </div>
                <p className="text-foreground/40 text-xs mb-4">
                  Your employer matches deposits at their configured rate. Deposits earn you vault shares.
                </p>
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <div className="text-xs text-foreground/40 mb-1.5">Amount (RLUSD)</div>
                    <div className="flex gap-2">
                      <input type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.00" max={rlusdBalance}
                        className="bg-background border border-card-border rounded-lg px-4 py-2 w-36 text-sm focus:outline-none focus:border-accent transition-colors" />
                      <button onClick={() => setDepositAmount(rlusdBalance.toFixed(2))}
                        className="text-xs px-2.5 py-2 border border-card-border rounded-lg text-foreground/50 hover:text-accent hover:border-accent/40 transition-colors">Max</button>
                    </div>
                  </div>
                  <button onClick={handleDeposit} disabled={!!loading || parseFloat(depositAmount) > rlusdBalance || !depositAmount}
                    className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50">Deposit</button>
                </div>
                {parseFloat(depositAmount) > rlusdBalance && <p className="text-danger text-xs mt-2">Insufficient RLUSD balance</p>}
              </div>

              {/* Withdraw */}
              <div className={`border rounded-xl p-6 ${shares === 0 ? "border-card-border bg-card-bg/50 opacity-60" : "border-card-border bg-card-bg"}`}>
                <div className="flex items-center mb-1">
                  <h2 className="text-base font-semibold">Withdraw from Vault</h2>
                  <InfoTip text="Convert your vault shares back to RLUSD in your wallet. If your employer match hasn't fully vested, the unvested part is automatically returned to them." />
                </div>
                <p className="text-foreground/40 text-xs mb-4">Unvested employer match will be clawed back automatically on withdrawal.</p>
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <div className="text-xs text-foreground/40 mb-1.5">Amount (RLUSD)</div>
                    <div className="flex gap-2">
                      <input type="number" value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" max={shares} disabled={shares === 0}
                        className="bg-background border border-card-border rounded-lg px-4 py-2 w-36 text-sm focus:outline-none focus:border-accent transition-colors disabled:opacity-40" />
                      <button onClick={() => setWithdrawAmount(String(yieldData?.withdrawable.max || shares))} disabled={shares === 0}
                        className="text-xs px-2.5 py-2 border border-card-border rounded-lg text-foreground/50 hover:text-accent hover:border-accent/40 transition-colors disabled:opacity-40">Max</button>
                    </div>
                  </div>
                  <button onClick={handleWithdraw} disabled={!!loading || shares === 0 || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                    className="bg-card-border hover:bg-foreground/10 text-foreground font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50">Withdraw</button>
                </div>
                {shares === 0 && <p className="text-foreground/30 text-xs mt-2">Deposit first to earn shares.</p>}
              </div>
            </div>
          )}

          {/* ═══ Loans Tab ═══ */}
          {activeTab === "loans" && (
            <div className="space-y-6">
              {loans.length === 0 ? (
                <div className="border border-dashed border-card-border rounded-xl p-8 text-center">
                  <div className="text-foreground/30 text-sm">No loans yet. Select a tier and draw a loan below.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wide">Your Loans</h2>
                  {loans.map((loan) => {
                    const outstanding = loan.loanInfo?.PrincipalOutstanding ?? loan.remaining;
                    const outstandingNum = parseFloat(outstanding);
                    return (
                      <div key={loan.id} className="border border-card-border bg-card-bg rounded-xl p-5">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-sm font-medium">
                              Principal: <span className="text-accent font-semibold">{loan.principal} RLUSD</span>
                              {loan.tier && <span className="ml-2 text-xs text-foreground/40 bg-card-border rounded px-1.5 py-0.5">{loan.tier}</span>}
                            </div>
                            <div className="text-xs text-foreground/30 font-mono mt-1">{loan.id.slice(0, 20)}...</div>
                          </div>
                          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                            loan.status === "repaid" ? "bg-success/20 text-success border border-success/30"
                            : loan.status === "defaulted" ? "bg-danger/20 text-danger border border-danger/30"
                            : "bg-accent/20 text-accent border border-accent/30"
                          }`}>{loan.status}</span>
                        </div>
                        <RepaymentProgress principal={loan.principal} outstanding={outstandingNum} />
                        <div className="mt-1 text-xs text-foreground/40">
                          <span className={outstandingNum > 0 ? "text-danger" : "text-success"}>{outstandingNum.toFixed(2)} RLUSD</span> outstanding
                        </div>
                        {loan.status === "active" && outstandingNum > 0 && (
                          <div className="flex gap-2 flex-wrap mt-4">
                            <input type="number" value={repayAmounts[loan.id] || ""} onChange={(e) => setRepayAmounts((prev) => ({ ...prev, [loan.id]: e.target.value }))}
                              placeholder={`max ${outstandingNum.toFixed(2)}`}
                              className="bg-background border border-card-border rounded-lg px-3 py-1.5 w-44 text-sm focus:outline-none focus:border-accent transition-colors" />
                            <button onClick={() => handleRepay(loan.id, outstanding)} disabled={!!loading}
                              className="bg-success hover:bg-success/80 text-black font-semibold px-5 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50">Repay</button>
                            <button onClick={() => handlePayInFull(loan.id, outstanding)} disabled={!!loading}
                              className="border border-success text-success hover:bg-success/10 font-semibold px-5 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50">Pay in Full</button>
                          </div>
                        )}
                        {loan.status === "repaid" && <div className="text-success text-sm mt-3">Fully repaid — &quot;creditworthy&quot; credential issued on-chain!</div>}
                        {loan.status === "defaulted" && <div className="text-danger text-sm mt-3">This loan was defaulted by the employer.</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Loan Tiers */}
              <div>
                <div className="flex items-center mb-3">
                  <h2 className="text-sm font-medium text-foreground/50 uppercase tracking-wide">Select Loan Tier</h2>
                  <InfoTip text="Loan tiers determine your interest rate, repayment schedule, and max borrow amount. Higher tiers require better credentials but offer better terms." />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Object.entries(loanTiers).map(([tierName, tier]) => {
                    const isSelected = loanTier === tierName;
                    const isLocked = !tier.eligible;
                    return (
                      <button key={tierName} onClick={() => !isLocked && setLoanTier(tierName)} disabled={isLocked}
                        className={`text-left rounded-xl p-4 border-2 transition-all ${
                          isSelected ? "border-accent bg-accent/5"
                          : isLocked ? "border-card-border bg-card-bg/50 opacity-60 cursor-not-allowed"
                          : "border-card-border bg-card-bg hover:border-accent/40"
                        }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-sm capitalize">{tierName}</span>
                          {isLocked ? (
                            <span className="text-xs text-foreground/40 flex items-center gap-1">
                              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                              Locked
                            </span>
                          ) : isSelected ? <span className="text-xs text-accent font-medium">Selected</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
                          <span className={`text-sm font-bold ${isSelected ? "text-accent" : "text-foreground"}`}>{formatAPR(tier.InterestRate)} APR</span>
                          <span className="text-xs text-foreground/50">{tier.PaymentTotal} payments</span>
                          <span className="text-xs text-foreground/50">{formatDays(tier.PaymentInterval)} intervals</span>
                        </div>
                        <div className="text-xs text-foreground/40">
                          Max ${tier.maxPrincipal}{tier.GracePeriod > 0 && ` · ${formatDays(tier.GracePeriod)} grace period`}
                        </div>
                        {isLocked && tier.reason && <div className="text-xs text-danger/60 mt-1">{tier.reason}</div>}
                      </button>
                    );
                  })}
                  {Object.keys(loanTiers).length === 0 && <div className="col-span-3 text-foreground/30 text-sm text-center py-4">Loading loan tiers...</div>}
                </div>
              </div>

              {/* Draw Loan */}
              <div className="border border-card-border bg-card-bg rounded-xl p-6">
                <div className="flex items-center mb-1">
                  <h2 className="text-base font-semibold">Draw Loan</h2>
                  <InfoTip text="Borrow RLUSD from the vault pool. The money is transferred directly to your wallet. You repay in installments over the loan term." />
                </div>
                {loanTiers[loanTier] && (
                  <p className="text-foreground/40 text-xs mb-1">
                    {formatAPR(loanTiers[loanTier].InterestRate)} APR · {loanTiers[loanTier].PaymentTotal} payments · {formatDays(loanTiers[loanTier].PaymentInterval)} intervals
                    {loanTiers[loanTier].GracePeriod > 0 && ` · ${formatDays(loanTiers[loanTier].GracePeriod)} grace`}
                  </p>
                )}
                <p className="text-foreground/30 text-xs mb-4">
                  Requires the &quot;{loanTiers[loanTier]?.requiredCredential || "employee"}&quot; credential.
                </p>
                <div className="flex gap-3 flex-wrap items-end">
                  <div>
                    <div className="text-xs text-foreground/40 mb-1.5">Amount (RLUSD)</div>
                    <input type="number" value={loanAmount} onChange={(e) => setLoanAmount(e.target.value)} placeholder="0.00" max={loanTiers[loanTier]?.maxPrincipal}
                      className="bg-background border border-card-border rounded-lg px-4 py-2 w-36 text-sm focus:outline-none focus:border-accent transition-colors" />
                  </div>
                  <button onClick={handleDrawLoan} disabled={!!loading || !hasEmployee || (loanTiers[loanTier] && !loanTiers[loanTier].eligible)}
                    className="bg-accent hover:bg-accent-light text-black font-semibold px-6 py-2 rounded-lg transition-colors disabled:opacity-50">Draw Loan</button>
                </div>
                {!hasEmployee && <p className="text-danger text-xs mt-2">Missing &quot;employee&quot; credential — ask your employer to add you.</p>}
                {loanTiers[loanTier] && !loanTiers[loanTier].eligible && hasEmployee && <p className="text-danger text-xs mt-2">{loanTiers[loanTier].reason}</p>}
              </div>
            </div>
          )}

          {/* ═══ History Tab ═══ */}
          {activeTab === "history" && (
            <div className="border border-card-border bg-card-bg rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center">
                  <h2 className="text-base font-semibold">Transaction History</h2>
                  <InfoTip text="On-chain transactions for this vault. Every deposit, withdrawal, loan, and repayment is recorded on the XRPL ledger and can be independently verified." />
                </div>
                <button onClick={fetchLedger} disabled={ledgerLoading} className="flex items-center gap-1.5 text-sm text-accent hover:text-accent-light transition-colors disabled:opacity-50">
                  <svg className={`h-3.5 w-3.5 ${ledgerLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0114.65-5.65M20 15a9 9 0 01-14.65 5.65" />
                  </svg>
                  {ledgerLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
              {ledgerLoading && <Spinner text="Fetching vault ledger..." />}
              {!ledgerLoading && ledger.length === 0 && (
                <div className="text-center py-10 border border-dashed border-card-border rounded-xl">
                  <p className="text-foreground/30 text-sm">No transactions found for this vault.</p>
                </div>
              )}
              {ledger.length > 0 && (
                <div className="space-y-2">
                  {ledger.map((entry, i) => {
                    const hash = entry.txHash ?? entry.hash ?? "";
                    const typeKey = (entry.type ?? "").toLowerCase();
                    const typeColor = TX_TYPE_COLORS[typeKey] ?? "bg-card-border text-foreground/50";
                    return (
                      <div key={hash || i} className="bg-background/50 border border-card-border rounded-lg p-3.5 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 capitalize ${typeColor}`}>{entry.type ?? "tx"}</span>
                          <div className="min-w-0">
                            {entry.amount && <div className="text-sm font-medium">{entry.amount} RLUSD</div>}
                            {entry.timestamp && <div className="text-xs text-foreground/30 mt-0.5">{new Date(entry.timestamp).toLocaleString()}</div>}
                          </div>
                        </div>
                        {hash && <div className="shrink-0"><TxLink hash={hash} /></div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
