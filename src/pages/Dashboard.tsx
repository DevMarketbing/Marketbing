import { ArrowRightIcon, SparkIcon, UsersIcon, WalletIcon, WorkflowIcon } from "../components/Icons";
import type { Route } from "../components/Sidebar";

export default function Dashboard({ onNavigate }: { onNavigate: (r: Route) => void }) {
  return (
    <div className="mx-auto max-w-5xl animate-fade-up px-4 py-10 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-600">
        Welcome back
      </p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
        Your marketing, run by objectives.
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-500">
        Tell Marketbing what you want to achieve. It builds the strategy, converts it into an
        execution workflow, runs it autonomously and only comes back to you for approvals.
      </p>

      <button
        onClick={() => onNavigate("planning")}
        className="mt-8 flex w-full items-center gap-5 rounded-2xl bg-gradient-to-br from-ink-900 to-ink-800 p-6 text-left shadow-xl shadow-slate-900/10 transition-transform hover:scale-[1.01] sm:p-8"
      >
        <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white sm:flex">
          <SparkIcon className="h-6 w-6" />
        </span>
        <span className="flex-1">
          <span className="block text-lg font-semibold text-white">
            What do you want to achieve?
          </span>
          <span className="mt-1 block text-sm text-slate-400">
            Start in Automatic Planning &amp; Execution — describe your objective and let the
            system build and run the workflow.
          </span>
        </span>
        <ArrowRightIcon className="h-5 w-5 shrink-0 text-indigo-300" />
      </button>

      <h2 className="mt-12 text-sm font-semibold uppercase tracking-wider text-slate-400">
        Platform modules
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <ModuleCard
          icon={<WorkflowIcon className="h-5 w-5" />}
          title="Automatic Planning & Execution"
          body="Objective → strategy → workflow → autonomous execution with human approvals."
          status="active"
          onClick={() => onNavigate("planning")}
        />
        <ModuleCard
          icon={<UsersIcon className="h-5 w-5" />}
          title="Influencer Marketplace"
          body="View associated influencers, their statistics, and allocate budget and resources."
          status="soon"
          onClick={() => onNavigate("influencers")}
        />
        <ModuleCard
          icon={<WalletIcon className="h-5 w-5" />}
          title="Finance, Sales & Products"
          body="Wallet, balances, credit limits, sales tracking and product-level insights."
          status="soon"
          onClick={() => onNavigate("finance")}
        />
      </div>
    </div>
  );
}

function ModuleCard({
  icon,
  title,
  body,
  status,
  onClick,
}: {
  icon: JSX.Element;
  title: string;
  body: string;
  status: "active" | "soon";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white p-5 text-left shadow-sm transition-all hover:shadow-md ${
        status === "active" ? "border-indigo-200 ring-1 ring-indigo-100" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            status === "active" ? "bg-indigo-50 text-indigo-600" : "bg-slate-100 text-slate-400"
          }`}
        >
          {icon}
        </span>
        {status === "active" ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 ring-1 ring-emerald-200">
            Active
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Coming soon
          </span>
        )}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-slate-500">{body}</div>
    </button>
  );
}
