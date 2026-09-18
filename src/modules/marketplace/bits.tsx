import type { InfluencerProfile } from "../../types";
import { StarIcon, TrendDownIcon, TrendUpIcon } from "../../components/Icons";

/* Shared formatting + atoms for the Influencer Marketplace. */

export const fmtCount = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);

export const fmtLakh = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}L`;

export function Avatar({ profile, size = 40 }: { profile: InfluencerProfile; size?: number }) {
  const initials = profile.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, hsl(${profile.avatarHue} 70% 55%), hsl(${(profile.avatarHue + 40) % 360} 70% 45%))`,
      }}
    >
      {initials}
    </span>
  );
}

export function RatingStars({ rating }: { rating: number }) {
  const stars = (cls: string) => (
    <span className={`flex ${cls}`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <StarIcon key={i} className="h-3.5 w-3.5 shrink-0" />
      ))}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5" title={`${rating.toFixed(1)} / 5`}>
      <span className="relative inline-flex">
        {stars("text-slate-200")}
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${(rating / 5) * 100}%` }}>
          {stars("text-amber-400")}
        </span>
      </span>
      <span className="text-xs font-semibold text-slate-600" style={{ fontVariantNumeric: "tabular-nums" }}>
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

/** ROI badge: status is carried by icon + label, not color alone. */
export function RoiBadge({ roi, className = "" }: { roi: number; className?: string }) {
  const good = roi >= 1.5;
  const bad = roi < 1;
  const tone = good
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : bad
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";
  const Icon = bad ? TrendDownIcon : TrendUpIcon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold ring-1 ${tone} ${className}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
      title="Attributed sales per rupee of campaign spend"
    >
      <Icon className="h-3.5 w-3.5" />
      {roi.toFixed(2)}x
    </span>
  );
}

/** Compact single-series sparkline (ROI trend). */
export function Sparkline({
  data,
  width = 96,
  height = 28,
  stroke = "#6366f1",
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pad = 3;
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (width - pad * 2),
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ]);
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [ex, ey] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="2.5" fill={stroke} />
    </svg>
  );
}

export function TierChip({ tier }: { tier: InfluencerProfile["tier"] }) {
  const label = tier === "macro" ? "Macro" : tier === "mid" ? "Mid-tier" : "Micro";
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {label}
    </span>
  );
}
