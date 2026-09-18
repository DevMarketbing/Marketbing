import { useEffect, useState } from "react";
import { planningPhases } from "../../lib/planner";
import { CheckIcon, SparkIcon } from "../../components/Icons";

const PHASE_MS = 1050;

/** Simulated AI analysis: phases tick through, then hands off to the plans view. */
export default function AIPlanningState({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (phase < planningPhases.length) {
      const t = setTimeout(() => setPhase((p) => p + 1), PHASE_MS);
      return () => clearTimeout(t);
    }
    setReady(true);
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [phase, onDone]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="relative">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-indigo-400/30" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/40">
          <SparkIcon className="h-8 w-8" />
        </span>
      </div>

      <h2 className="mt-8 text-xl font-bold tracking-tight text-slate-900">
        {ready ? "Your marketing plans are ready." : "Building your marketing plan"}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        {ready
          ? "Three execution options prepared for your objective."
          : "Analyzing your business context and objective."}
      </p>

      <div className="mt-8 w-full space-y-2.5 text-left">
        {planningPhases.map((label, i) => {
          const done = i < phase;
          const active = i === phase && !ready;
          return (
            <div
              key={label}
              className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition-all ${
                done
                  ? "border-slate-200 bg-white text-slate-500"
                  : active
                    ? "border-indigo-200 bg-indigo-50/70 font-medium text-indigo-900"
                    : "border-transparent text-slate-300"
              }`}
            >
              {done ? (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 animate-pop-in">
                  <CheckIcon className="h-3 w-3" />
                </span>
              ) : active ? (
                <span className="h-5 w-5">
                  <span className="block h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                </span>
              ) : (
                <span className="h-5 w-5 rounded-full border-2 border-slate-200" />
              )}
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
