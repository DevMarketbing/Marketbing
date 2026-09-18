import type { MarketingPlan, ObjectiveKind } from "../../types";
import { buildStrategies, buildStrategySummary } from "../../lib/planner";
import { ArrowLeftIcon, CheckIcon, SparkIcon } from "../../components/Icons";

interface PlansViewProps {
  kind: ObjectiveKind;
  plans: MarketingPlan[];
  onSelect: (plan: MarketingPlan) => void;
  onBack: () => void;
}

export default function PlansView({ kind, plans, onSelect, onBack }: PlansViewProps) {
  const strategies = buildStrategies(kind);
  const maxBudget = Math.max(...plans.map((p) => p.metrics.budgetLakh));
  const maxCoverage = Math.max(...plans.map((p) => p.metrics.coverageM));

  return (
    <div className="mx-auto max-w-6xl animate-fade-up px-4 py-10 sm:px-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Adjust context
      </button>

      {/* Recommended Marketing Strategy */}
      <div className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-ink-900 to-ink-800 shadow-xl shadow-slate-900/10">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-indigo-300">
            <SparkIcon className="h-4 w-4" />
            Recommended Marketing Strategy
          </div>
          <p className="mt-3 max-w-3xl text-[15px] leading-relaxed text-slate-200">
            {buildStrategySummary(kind)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {strategies.map((s) => (
              <span
                key={s.id}
                title={s.rationale}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                  s.executable
                    ? "bg-indigo-500/15 text-indigo-200 ring-indigo-400/30"
                    : "bg-white/5 text-slate-400 ring-white/15"
                }`}
              >
                {s.name}
                {!s.executable && <span className="text-[10px] text-slate-500">· advisory</span>}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            &ldquo;Advisory&rdquo; components are part of the holistic plan but outside the
            platform&apos;s execution capability today — you&apos;ll get guidance, not automation.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            Choose how to execute
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Three ways to run this strategy. Select one to review its full workflow.
          </p>
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">
          Illustrative demo values — not real-world predictions
        </span>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            maxBudget={maxBudget}
            maxCoverage={maxCoverage}
            onSelect={() => onSelect(plan)}
          />
        ))}
      </div>
    </div>
  );
}

function Meter({
  label,
  display,
  pct,
  tone,
}: {
  label: string;
  display: string;
  pct: number;
  tone: "indigo" | "emerald" | "sky";
}) {
  const bar =
    tone === "indigo"
      ? "bg-gradient-to-r from-indigo-500 to-violet-500"
      : tone === "emerald"
        ? "bg-gradient-to-r from-emerald-500 to-teal-500"
        : "bg-gradient-to-r from-sky-500 to-cyan-500";
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
          {label}
        </span>
        <span className="text-sm font-bold text-slate-800">{display}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  maxBudget,
  maxCoverage,
  onSelect,
}: {
  plan: MarketingPlan;
  maxBudget: number;
  maxCoverage: number;
  onSelect: () => void;
}) {
  const m = plan.metrics;
  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        plan.recommended ? "border-indigo-300 ring-2 ring-indigo-100" : "border-slate-200"
      }`}
    >
      {plan.recommended && (
        <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white shadow-md shadow-indigo-500/30">
          Recommended
        </span>
      )}
      <div className="text-lg font-bold tracking-tight text-slate-900">{plan.name}</div>
      <div className="text-xs font-medium uppercase tracking-wider text-indigo-500">
        {plan.tagline}
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{plan.description}</p>

      <div className="mt-5 space-y-3.5">
        <Meter
          label="Estimated budget"
          display={`₹${m.budgetLakh}L`}
          pct={(m.budgetLakh / maxBudget) * 100}
          tone="indigo"
        />
        <Meter
          label="Expected coverage"
          display={`${m.coverageM}M reach`}
          pct={(m.coverageM / maxCoverage) * 100}
          tone="sky"
        />
        <Meter label="Efficiency" display={`${m.efficiencyPct}%`} pct={m.efficiencyPct} tone="emerald" />
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Influencers
          </span>
          <span className="text-sm font-bold text-slate-800">{m.influencerCount}</span>
        </div>
      </div>

      <div className="mt-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Strategy composition
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {plan.strategies.map((s) => (
            <span
              key={s.id}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              {s.name}
            </span>
          ))}
        </div>
      </div>

      <ul className="mt-4 flex-1 space-y-1.5">
        {plan.keyActivities.map((a) => (
          <li key={a} className="flex items-start gap-2 text-[13px] text-slate-600">
            <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            {a}
          </li>
        ))}
      </ul>

      <button
        onClick={onSelect}
        className={`mt-6 w-full rounded-lg py-2.5 text-sm font-semibold transition-all ${
          plan.recommended
            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-500/25 hover:brightness-110"
            : "border border-slate-300 bg-white text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
        }`}
      >
        Select Plan
      </button>
    </div>
  );
}
