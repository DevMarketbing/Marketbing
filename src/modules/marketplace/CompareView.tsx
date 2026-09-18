import { useEffect, useState } from "react";
import type { CompareEntry } from "../../types";
import { api } from "../../api";
import { Avatar, fmtCount, fmtLakh } from "./bits";
import { ArrowLeftIcon } from "../../components/Icons";

/** Fixed categorical palette (validated for CVD separation on light surface). */
const SERIES = ["#6366f1", "#0ea5e9", "#d97706"];

interface CompareViewProps {
  ids: string[];
  onBack: () => void;
  onOpen: (id: string) => void;
}

interface MetricRow {
  label: string;
  values: number[];
  format: (v: number) => string;
  hint?: string;
  /** Lower is better (e.g. open alerts). */
  invert?: boolean;
}

export default function CompareView({ ids, onBack, onOpen }: CompareViewProps) {
  const [entries, setEntries] = useState<CompareEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .compare(ids)
      .then((e) => !cancelled && setEntries(e))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      </div>
    );
  }
  if (!entries) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  const s = entries.map((e) => e.summary);
  const rows: MetricRow[] = [
    { label: "Your investment", values: s.map((x) => x.investedLakh), format: fmtLakh },
    { label: "Amount given (spend)", values: s.map((x) => x.spendLakh), format: fmtLakh, hint: "total campaign payouts" },
    { label: "Attributed sales", values: s.map((x) => x.salesLakh), format: fmtLakh },
    { label: "ROI", values: s.map((x) => x.roi), format: (v) => `${v.toFixed(2)}x`, hint: "sales / spend" },
    { label: "Rating", values: s.map((x) => x.rating), format: (v) => `${v.toFixed(1)} / 5` },
    { label: "Followers", values: s.map((x) => x.profile.followers), format: (v) => fmtCount(v) },
    { label: "Engagement rate", values: s.map((x) => x.profile.engagementRate), format: (v) => `${v}%` },
    { label: "Task completion", values: s.map((x) => x.taskCompletionPct), format: (v) => `${v}%` },
    { label: "Open alerts", values: s.map((x) => x.openAlerts), format: (v) => String(v), invert: true },
  ];

  return (
    <div className="mx-auto max-w-4xl animate-fade-up px-4 py-8 sm:px-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Marketplace
      </button>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Compare influencers</h1>
      <p className="mt-1 text-sm text-slate-500">
        Side-by-side performance across your selected creators. Bars are scaled to the best value
        in each row.
      </p>

      {/* Legend / identity */}
      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: `repeat(${s.length}, minmax(0, 1fr))` }}>
        {s.map((x, i) => (
          <button
            key={x.profile.id}
            onClick={() => onOpen(x.profile.id)}
            className="flex items-center gap-2.5 rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:shadow-md"
            style={{ borderColor: SERIES[i] }}
          >
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: SERIES[i] }} />
            <Avatar profile={x.profile} size={34} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-800">{x.profile.name}</div>
              <div className="truncate text-[11px] text-slate-400">{x.profile.handle}</div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {rows.map((row) => {
          const max = Math.max(...row.values, 0.0001);
          const best = row.invert ? Math.min(...row.values) : Math.max(...row.values);
          return (
            <div key={row.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{row.label}</span>
                {row.hint && <span className="text-[11px] text-slate-400">{row.hint}</span>}
              </div>
              <div className="mt-3 space-y-2">
                {row.values.map((v, i) => (
                  <div key={s[i].profile.id} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-500">
                      {s[i].profile.name.split(" ")[0]}
                    </span>
                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                      <div
                        className="h-full rounded transition-all duration-500"
                        style={{ width: `${Math.max((v / max) * 100, 2)}%`, background: SERIES[i] }}
                      />
                    </div>
                    <span
                      className={`w-20 shrink-0 text-right text-sm ${v === best ? "font-bold text-slate-900" : "font-medium text-slate-500"}`}
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {row.format(v)}
                      {v === best && <span className="ml-1 text-[10px] font-bold text-emerald-600">★</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-400">★ marks the best value in each row (fewest for open alerts).</p>
    </div>
  );
}
