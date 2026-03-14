"use client";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
      <h1 className="text-6xl font-bold mb-4">
        <span className="text-accent">Hyve</span>
      </h1>
      <p className="text-xl text-foreground/70 mb-2 max-w-2xl">
        The on-chain credit union for small businesses.
      </p>
      <p className="text-foreground/50 mb-10 max-w-xl">
        Employees pool savings into a company vault, earn yield, and borrow at
        fair rates — all powered by XRPL and RLUSD.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
        <a
          href="/employer"
          className="group border border-card-border bg-card-bg rounded-xl p-8 hover:border-accent transition-all"
        >
          <h2 className="text-2xl font-semibold mb-2 group-hover:text-accent transition-colors">
            Employer
          </h2>
          <p className="text-foreground/60 text-sm">
            Create a vault, onboard employees, and manage your company credit
            union.
          </p>
        </a>

        <a
          href="/employee"
          className="group border border-card-border bg-card-bg rounded-xl p-8 hover:border-accent transition-all"
        >
          <h2 className="text-2xl font-semibold mb-2 group-hover:text-accent transition-colors">
            Employee
          </h2>
          <p className="text-foreground/60 text-sm">
            Deposit savings, track your shares, and access emergency loans.
          </p>
        </a>
      </div>

      <div className="mt-16 flex gap-3 text-xs text-foreground/40">
        <span className="bg-card-bg border border-card-border rounded-full px-3 py-1">
          XRPL Testnet
        </span>
        <span className="bg-card-bg border border-card-border rounded-full px-3 py-1">
          RLUSD
        </span>
        <span className="bg-card-bg border border-card-border rounded-full px-3 py-1">
          Credentials
        </span>
      </div>
    </div>
  );
}
