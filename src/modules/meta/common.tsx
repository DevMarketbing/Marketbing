import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "../../components/Icons";
import { BackLevel, useBackLayer } from "../../backButton";

/* Shared formatting + pieces for the Facebook & Instagram section. */

export const fmtNum = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "–";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(n) >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return Math.round(n).toLocaleString();
};

export const fmtMoney = (n: number | null | undefined, currency: string) => {
  if (n === null || n === undefined) return "–";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};

export const fmtPercent = (n: number | null | undefined, digits = 1) =>
  n === null || n === undefined ? "–" : `${n.toFixed(digits)}%`;

export const fmtDate = (value: string | number) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

export const secondaryButton =
  "rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60";

export const textareaClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

/** Loads data with loading/error state; reload() fetches again. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(load, deps);
  const reload = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    run().then(
      (d) => {
        if (id !== seq.current) return;
        setData(d);
        setLoading(false);
      },
      (e: Error) => {
        if (id !== seq.current) return;
        setError(e.message);
        setLoading(false);
      },
    );
  }, [run]);
  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}

export function Card({ title, action, children }: { title?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading({ what }: { what: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">Loading {what}…</p>;
}

export function Note({ tone = "info", children }: { tone?: "info" | "warn" | "good" | "bad"; children: ReactNode }) {
  const tones = {
    info: "bg-slate-50 text-slate-600 ring-slate-200",
    warn: "bg-amber-50 text-amber-800 ring-amber-200",
    good: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    bad: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return (
    <div role={tone === "bad" ? "alert" : undefined} className={`rounded-lg px-3.5 py-2.5 text-sm ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </div>
  );
}

/** A labelled dropdown, shown only when there is more than one thing to choose. */
export function Picker<T extends { id: string }>({
  id,
  label,
  items,
  value,
  onChange,
  describe,
}: {
  id: string;
  label: string;
  items: T[];
  value: string;
  onChange: (id: string) => void;
  describe: (item: T) => string;
}) {
  if (items.length < 2) return null;
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm sm:max-w-sm"
      >
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {describe(item)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A dialog over the page; the Android back button closes it. */
export function Dialog({ title, onClose, children, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useBackLayer(true, BackLevel.dialog, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-2 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-label={typeof title === "string" ? title : undefined}
        className={`relative flex max-h-[92vh] w-full ${wide ? "max-w-2xl" : "max-w-md"} animate-fade-up flex-col rounded-2xl bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0 text-base font-bold text-slate-900">{title}</div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** A square picture for an Instagram post or profile; a grey box when there is none. */
export function Picture({ src, alt, className = "" }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <div className={`bg-slate-100 ${className}`} aria-label={alt} />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}
