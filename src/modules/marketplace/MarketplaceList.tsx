import { useMemo, useState, type ReactNode } from "react";
import type { InfluencerSummary, MarketplaceOverview } from "../../types";
import { Avatar, RatingStars, RoiBadge, Sparkline, TierChip, fmtCount, fmtLakh } from "./bits";
import { AlertIcon, ScaleIcon, SearchIcon, WalletIcon } from "../../components/Icons";

type SortKey = "roi" | "invested" | "rating" | "followers" | "sales";

interface MarketplaceListProps {
  overview: MarketplaceOverview;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
  onCompare: () => void;
  onOpen: (id: string) => void;
  onTrade: (id: string, type: "invest" | "divest") => void;
}

export default function MarketplaceList({
  overview,
  compareIds,
  onToggleCompare,
  onCompare,
  onOpen,
  onTrade,
}: MarketplaceListProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("roi");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = overview.influencers.filter(
      (i) =>
        !q ||
        i.profile.name.toLowerCase().includes(q) ||
        i.profile.handle.toLowerCase().includes(q) ||
        i.profile.niche.toLowerCase().includes(q),
    );
    const val = (i: InfluencerSummary): number =>
      sort === "roi" ? i.roi
      : sort === "invested" ? i.investedLakh
      : sort === "rating" ? i.rating
      : sort === "sales" ? i.salesLakh
      : i.profile.followers;
    return [...filtered].sort((a, b) => val(b) - val(a));
  }, [overview, query, sort]);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up px-4 py-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-indigo-600">
            Influencer Marketplace
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Your influencer portfolio
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Track every creator like a position — performance, payouts and alerts in one screen.
          </p>
        </div>
        <div className="flex gap-3">
          <HeaderStat
            icon={<WalletIcon className="h-4 w-4" />}
            label="Wallet balance"
            value={fmtLakh(overview.wallet.balanceLakh)}
          />
          <HeaderStat label="Invested" value={fmtLakh(overview.totalInvestedLakh)} />
          <HeaderStat
            label="Portfolio ROI"
            value={<RoiBadge roi={overview.portfolioRoi} className="text-sm" />}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="marketplace-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, handle or niche"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          Sort by
          <select
            id="marketplace-sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 shadow-sm focus:border-indigo-300 focus:outline-none"
          >
            <option value="roi">ROI</option>
            <option value="rating">Rating</option>
            <option value="invested">Amount invested</option>
            <option value="sales">Attributed sales</option>
            <option value="followers">Followers</option>
          </select>
        </label>
        <button
          onClick={onCompare}
          disabled={compareIds.length < 2}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <ScaleIcon className="h-4 w-4" />
          Compare{compareIds.length > 0 ? ` (${compareIds.length})` : ""}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Tick up to three influencers to compare them side by side.
      </p>

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <th className="px-4 py-3 font-semibold">Compare</th>
              <th className="px-4 py-3 font-semibold">Influencer</th>
              <th className="px-4 py-3 font-semibold">Invested</th>
              <th className="px-4 py-3 font-semibold">Stats</th>
              <th className="px-4 py-3 font-semibold">ROI · 12w trend</th>
              <th className="px-4 py-3 font-semibold">Rating</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.profile.id} className="transition-colors hover:bg-indigo-50/40">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    id={`cmp-${row.profile.id}`}
                    aria-label={`Compare ${row.profile.name}`}
                    checked={compareIds.includes(row.profile.id)}
                    onChange={() => onToggleCompare(row.profile.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
                  />
                </td>
                <td className="cursor-pointer px-4 py-3" onClick={() => onOpen(row.profile.id)}>
                  <div className="flex items-center gap-3">
                    <Avatar profile={row.profile} size={36} />
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-slate-800">
                        {row.profile.name}
                        {row.openAlerts > 0 && (
                          <span
                            className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 ring-1 ring-amber-200"
                            title={`${row.openAlerts} open alert(s)`}
                          >
                            <AlertIcon className="h-3 w-3" />
                            {row.openAlerts}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {row.profile.handle} · {row.profile.niche}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {row.investedLakh > 0 ? fmtLakh(row.investedLakh) : <span className="font-normal text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCount(row.profile.followers)} followers</div>
                  <div className="text-xs text-slate-400">
                    {row.profile.engagementRate}% eng · {row.productCount} campaigns
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <RoiBadge roi={row.roi} />
                    <Sparkline data={row.roiTrend} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <RatingStars rating={row.rating} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => onTrade(row.profile.id, "invest")}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-500"
                    >
                      Invest
                    </button>
                    <button
                      onClick={() => onTrade(row.profile.id, "divest")}
                      disabled={row.investedLakh <= 0}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Divest
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="mt-4 space-y-3 lg:hidden">
        {rows.map((row) => (
          <div key={row.profile.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3" onClick={() => onOpen(row.profile.id)}>
              <Avatar profile={row.profile} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-800">{row.profile.name}</span>
                  <TierChip tier={row.profile.tier} />
                </div>
                <div className="truncate text-xs text-slate-400">
                  {row.profile.handle} · {fmtCount(row.profile.followers)} · {row.profile.engagementRate}% eng
                </div>
              </div>
              <RoiBadge roi={row.roi} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Invested{" "}
                <span className="font-semibold text-slate-800">
                  {row.investedLakh > 0 ? fmtLakh(row.investedLakh) : "—"}
                </span>
              </div>
              <RatingStars rating={row.rating} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => onTrade(row.profile.id, "invest")}
                className="flex-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Invest
              </button>
              <button
                onClick={() => onTrade(row.profile.id, "divest")}
                disabled={row.investedLakh <= 0}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-40"
              >
                Divest
              </button>
              <button
                onClick={() => onOpen(row.profile.id)}
                className="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"
              >
                Analyse
              </button>
              <label className="flex items-center gap-1 pl-1 text-[11px] font-medium text-slate-500">
                <input
                  type="checkbox"
                  checked={compareIds.includes(row.profile.id)}
                  onChange={() => onToggleCompare(row.profile.id)}
                  className="h-4 w-4 accent-indigo-600"
                />
                Cmp
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderStat({
  icon,
  label,
  value,
}: {
  icon?: JSX.Element;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
