import type { MarketingPlan } from "../../types";
import { groupSteps } from "./workflowLayout";
import { ArrowLeftIcon, LockIcon, PlayIcon } from "../../components/Icons";

interface PlanDetailProps {
  plan: MarketingPlan;
  executing: boolean;
  onBack: () => void;
  onExecute: () => void;
}

/** Detailed pre-execution view: strategy composition + full workflow preview. */
export default function PlanDetail({ plan, executing, onBack, onExecute }: PlanDetailProps) {
  const rows = groupSteps(plan.steps);
  const approvals = plan.steps.filter((s) => s.requiresApproval).length;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up px-4 py-10 sm:px-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Compare plans
      </button>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{plan.name}</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">{plan.description}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-right shadow-sm">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Budget
          </div>
          <div className="text-xl font-bold text-slate-900">₹{plan.metrics.budgetLakh}L</div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Marketing strategy
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {plan.strategies.map((s, i) => (
            <span key={s.id} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300">+</span>}
              <span className="rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 ring-1 ring-indigo-100">
                {s.name}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Execution workflow
        </h2>
        <p className="mt-1 text-[13px] text-slate-500">
          Steps in the same row run in parallel. Execution pauses at {approvals} approval
          checkpoint{approvals === 1 ? "" : "s"} — nothing is committed without you.
        </p>

        <div className="mt-5 space-y-0">
          {rows.map((row, ri) => (
            <div key={ri}>
              {ri > 0 && <div className="ml-4.5 h-5 w-px bg-slate-300 sm:ml-5" />}
              <div className={row.length > 1 ? "grid gap-2 sm:grid-cols-3" : ""}>
                {row.map((step) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 rounded-xl border bg-white p-4 shadow-sm ${
                      step.requiresApproval ? "border-amber-200 bg-amber-50/50" : "border-slate-200"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                        step.requiresApproval
                          ? "bg-amber-100 text-amber-600"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {step.requiresApproval ? (
                        <LockIcon className="h-3.5 w-3.5" />
                      ) : (
                        plan.steps.indexOf(step) + 1
                      )}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{step.title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-slate-500">
                        {step.description}
                      </div>
                      {step.requiresApproval && (
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
                          Requires your approval
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-4 mt-10 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-slate-500">
            Selecting a plan doesn&apos;t start anything — execution begins only when you click
            Execute Plan.
          </p>
          <button
            onClick={onExecute}
            disabled={executing}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 disabled:opacity-60"
          >
            <PlayIcon className="h-4 w-4" />
            {executing ? "Starting execution…" : "Execute Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
