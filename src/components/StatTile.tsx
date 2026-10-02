import type { ReactNode } from "react";

/**
 * A small labelled number card. Put tiles side by side in a grid (or a
 * flex row): the value is pinned to the bottom of each tile, so values
 * stay on one line across a row even when one label wraps onto two
 * lines on a narrow phone.
 */
export default function StatTile({
  label,
  value,
  sub,
  icon,
  compact,
}: {
  label: ReactNode;
  value: ReactNode;
  /** One short line under the value; cut with "…" rather than wrapping. */
  sub?: string;
  icon?: ReactNode;
  /** Tighter padding, for header rows of three on a phone. */
  compact?: boolean;
}) {
  return (
    <div
      data-stat-tile
      className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm ${
        compact ? "px-3 py-2.5 sm:px-4" : "p-4"
      }`}
    >
      <div className="flex items-start gap-1.5 text-[10px] font-semibold uppercase leading-snug tracking-wider text-slate-400 sm:tracking-widest">
        {icon && <span className="mt-px shrink-0">{icon}</span>}
        <span className="min-w-0">{label}</span>
      </div>
      <div className="mt-auto pt-1">
        <div
          data-stat-value
          className={`${compact ? "text-lg" : "text-xl"} font-bold text-slate-900`}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}
