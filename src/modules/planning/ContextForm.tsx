import { useMemo, useState } from "react";
import type { BusinessContext, ContextField, ObjectiveKind } from "../../types";
import { getConditionalNote } from "../../lib/planner";
import { historicalSpend } from "../../data/demo";
import { ArrowLeftIcon, ArrowRightIcon, SparkIcon } from "../../components/Icons";

interface ContextFormProps {
  objective: string;
  kind: ObjectiveKind;
  fields: ContextField[];
  onBack: () => void;
  onSubmit: (context: BusinessContext) => void;
}

/**
 * Objective-first information collection: renders only the fields the mock
 * planner decided are relevant to this objective. Prefilled with demo data
 * so the flow can be walked end-to-end quickly.
 */
export default function ContextForm({ objective, kind, fields, onBack, onSubmit }: ContextFormProps) {
  const [values, setValues] = useState<BusinessContext>(() =>
    Object.fromEntries(fields.map((f) => [f.id, f.prefill])),
  );

  const requiredMissing = useMemo(
    () => fields.some((f) => !f.optional && !values[f.id]?.trim()),
    [fields, values],
  );

  const maxSpend = Math.max(...historicalSpend.map((q) => q.lakh));

  return (
    <div className="mx-auto max-w-3xl animate-fade-up px-4 py-10 sm:px-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Edit objective
      </button>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
        A few details before we plan
      </h1>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600 shadow-sm">
        <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          Objective
        </span>
        {objective}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
        <SparkIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
        <p className="text-[13px] leading-relaxed text-indigo-900">
          <span className="font-semibold">Only what&apos;s relevant: </span>
          {getConditionalNote(kind)}
        </p>
      </div>

      <div className="mt-6 space-y-5">
        {fields.map((f) => (
          <div key={f.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500">
                {f.category}
              </span>
              {f.optional && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Optional
                </span>
              )}
            </div>
            <label className="mt-1.5 block text-sm font-semibold text-slate-800">{f.label}</label>
            {f.helper && <p className="mt-0.5 text-xs text-slate-400">{f.helper}</p>}
            {f.type === "textarea" ? (
              <textarea
                value={values[f.id]}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                rows={2}
                placeholder={f.placeholder}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-800 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            ) : (
              <input
                value={values[f.id]}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                placeholder={f.placeholder}
                className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
              />
            )}

            {f.id === "budget" && (
              <div className="mt-4 rounded-lg bg-slate-50 p-4">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Historical marketing spend (context)
                </div>
                <div className="mt-3 space-y-2">
                  {historicalSpend.map((q) => (
                    <div key={q.quarter} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-xs font-medium text-slate-500">
                        {q.quarter}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-400"
                          style={{ width: `${(q.lakh / maxSpend) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs font-semibold text-slate-600">
                        ₹{q.lakh}L
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sticky bottom-4 mt-8 flex justify-end">
        <button
          onClick={() => !requiredMissing && onSubmit(values)}
          disabled={requiredMissing}
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
        >
          Generate Marketing Plans
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
