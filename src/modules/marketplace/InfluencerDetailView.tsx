import { useEffect, useState, type ReactNode } from "react";
import type { CampaignAlert, CampaignPayment, CampaignPost, CampaignTask, InfluencerDetail } from "../../types";
import { api } from "../../api";
import { Avatar, RatingStars, RoiBadge, TierChip, fmtCount, fmtLakh } from "./bits";
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  ImageIcon,
  PlayIcon,
} from "../../components/Icons";

type Tab = "tasks" | "payments" | "alerts" | "posts";

interface InfluencerDetailViewProps {
  influencerId: string;
  onBack: () => void;
  onTrade: (id: string, type: "invest" | "divest") => void;
  /** Bumped after a trade/alert change to trigger a refetch. */
  refreshKey: number;
}

export default function InfluencerDetailView({
  influencerId,
  onBack,
  onTrade,
  refreshKey,
}: InfluencerDetailViewProps) {
  const [productId, setProductId] = useState<string | "overall">("overall");
  const [detail, setDetail] = useState<InfluencerDetail | null>(null);
  const [tab, setTab] = useState<Tab>("tasks");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getInfluencerDetail(influencerId, productId)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [influencerId, productId, refreshKey]);

  const resolveAlert = async (alertId: string) => {
    await api.resolveAlert(alertId);
    const d = await api.getInfluencerDetail(influencerId, productId);
    setDetail(d);
  };

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  const { summary, view, products, wallet } = detail;
  const p = summary.profile;
  const openAlerts = view.alerts.filter((a) => !a.resolved);

  return (
    <div className="mx-auto max-w-4xl animate-fade-up px-4 py-8 sm:px-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Marketplace
      </button>

      {/* Overview header */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <Avatar profile={p} size={56} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{p.name}</h1>
                <TierChip tier={p.tier} />
              </div>
              <div className="mt-0.5 text-sm text-slate-500">
                {p.handle} · {p.niche}
              </div>
              <p className="mt-2 max-w-md text-[13px] leading-relaxed text-slate-500">{p.bio}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  <strong className="text-slate-900">{fmtCount(p.followers)}</strong> followers
                </span>
                <span>
                  <strong className="text-slate-900">{p.engagementRate}%</strong> profile engagement
                </span>
                <RatingStars rating={summary.rating} />
              </div>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Your investment
              </div>
              <div className="text-xl font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtLakh(summary.investedLakh)}
              </div>
              <div className="text-[11px] text-slate-400">Wallet: {fmtLakh(wallet.balanceLakh)}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onTrade(p.id, "invest")}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:flex-none"
              >
                Invest
              </button>
              <button
                onClick={() => onTrade(p.id, "divest")}
                disabled={summary.investedLakh <= 0}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 sm:flex-none"
              >
                Divest
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Product scope */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          Analyse
          <select
            id="detail-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none"
          >
            <option value="overall">Overall — all products</option>
            {products.map((pr) => (
              <option key={pr.id} value={pr.id}>
                {pr.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-slate-400">
          {view.productId === "overall"
            ? `Aggregated across ${products.length} product campaigns`
            : "Scoped to one product campaign"}
        </span>
      </div>

      {/* Metric tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricTile label="Amount given" value={fmtLakh(view.spendLakh)} sub="campaign payouts" />
        <MetricTile label="Attributed sales" value={fmtLakh(view.salesLakh)} sub="tracked revenue" />
        <MetricTile label="ROI" value={<RoiBadge roi={view.roi} className="text-base" />} sub="sales / spend" />
        <MetricTile
          label="Engagement"
          value={`${view.engagementRate}%`}
          sub={`${fmtCount(view.reach)} reach · ${fmtCount(view.likes)} likes`}
        />
      </div>

      {/* ROI trend */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            ROI trend — last 12 weeks
          </div>
          <div className="text-sm font-bold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
            now {view.roiTrend[view.roiTrend.length - 1]?.toFixed(2)}x
          </div>
        </div>
        <div className="mt-2 w-full">
          <TrendChart data={view.roiTrend} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {(
          [
            ["tasks", `Tasks (${view.tasks.length})`],
            ["payments", `Payments (${view.payments.length})`],
            ["alerts", `Alerts (${openAlerts.length})`],
            ["posts", `Posts (${view.posts.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "tasks" && <TasksTab tasks={view.tasks} />}
        {tab === "payments" && <PaymentsTab payments={view.payments} />}
        {tab === "alerts" && <AlertsTab alerts={view.alerts} onResolve={resolveAlert} />}
        {tab === "posts" && <PostsTab posts={view.posts} />}
      </div>
    </div>
  );
}

function MetricTile({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>
    </div>
  );
}

/** Wider ROI trend line with a baseline grid at 1x. */
function TrendChart({ data }: { data: number[] }) {
  const w = 640;
  const h = 96;
  const pad = 8;
  if (data.length < 2) return null;
  const min = Math.min(...data, 1);
  const max = Math.max(...data, 1);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const path = data.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${path} L${x(data.length - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h + 16}`} className="min-w-[320px]" style={{ width: "100%" }} role="img" aria-label="ROI trend, last 12 weeks">
        <line x1={pad} x2={w - pad} y1={y(1)} y2={y(1)} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth="1" />
        <text x={w - pad} y={y(1) - 4} textAnchor="end" fontSize="10" fill="#94a3b8">
          1.0x breakeven
        </text>
        <path d={area} fill="#6366f1" opacity="0.08" />
        <path d={path} fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r="3.5" fill="#6366f1" stroke="#fff" strokeWidth="1.5" />
        <text x={pad} y={h + 12} fontSize="10" fill="#94a3b8">
          12 weeks ago
        </text>
        <text x={w - pad} y={h + 12} textAnchor="end" fontSize="10" fill="#94a3b8">
          this week
        </text>
      </svg>
    </div>
  );
}

/* ------------------------------- tabs ------------------------------- */

function TasksTab({ tasks }: { tasks: CampaignTask[] }) {
  const groups: [string, CampaignTask[], string][] = [
    ["Completed", tasks.filter((t) => t.status === "completed"), "text-emerald-600"],
    ["Ongoing", tasks.filter((t) => t.status === "ongoing"), "text-indigo-600"],
    ["Pending", tasks.filter((t) => t.status === "pending"), "text-slate-400"],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {groups.map(([label, items, tone]) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-widest ${tone}`}>
            {label}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
              {items.length}
            </span>
          </div>
          <ul className="mt-3 space-y-2">
            {items.length === 0 && <li className="text-xs text-slate-300">None</li>}
            {items.map((t) => (
              <li key={t.id} className="flex items-start gap-2 text-[13px] text-slate-700">
                {t.status === "completed" ? (
                  <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : t.status === "ongoing" ? (
                  <ClockIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                ) : (
                  <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-slate-300" />
                )}
                <span className="flex-1">
                  {t.title}
                  <span className="ml-1.5 text-[11px] text-slate-400">due {t.due}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function PaymentsTab({ payments }: { payments: CampaignPayment[] }) {
  const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountLakh, 0);
  const total = payments.reduce((s, p) => s + p.amountLakh, 0);
  const levelTone: Record<CampaignPayment["level"], string> = {
    advance: "bg-sky-50 text-sky-700 ring-sky-200",
    milestone: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    final: "bg-violet-50 text-violet-700 ring-violet-200",
  };
  const statusTone: Record<CampaignPayment["status"], string> = {
    paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    due: "bg-amber-50 text-amber-700 ring-amber-200",
    scheduled: "bg-slate-100 text-slate-500 ring-slate-200",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
        <div className="text-sm font-semibold text-slate-800">Payment schedule</div>
        <div className="text-sm text-slate-500" style={{ fontVariantNumeric: "tabular-nums" }}>
          Paid <strong className="text-slate-900">{fmtLakh(Math.round(paid * 10) / 10)}</strong> of{" "}
          {fmtLakh(Math.round(total * 10) / 10)}
        </div>
      </div>
      <ul className="divide-y divide-slate-100">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
            <div className="flex items-center gap-3">
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${levelTone[p.level]}`}>
                {p.level}
              </span>
              <div>
                <div className="text-sm font-medium text-slate-800">{p.label}</div>
                <div className="text-[11px] text-slate-400">{p.date}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmtLakh(p.amountLakh)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${statusTone[p.status]}`}>
                {p.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertsTab({ alerts, onResolve }: { alerts: CampaignAlert[]; onResolve: (id: string) => void }) {
  const open = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved);
  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
        No alerts for this scope — everything is on track.
      </div>
    );
  }
  const card = (a: CampaignAlert) => (
    <div
      key={a.id}
      className={`flex items-start gap-3 rounded-xl border p-4 shadow-sm ${
        a.resolved
          ? "border-slate-200 bg-slate-50 opacity-60"
          : a.kind === "warning"
            ? "border-amber-300 bg-amber-50/60"
            : "border-indigo-200 bg-indigo-50/40"
      }`}
    >
      <AlertIcon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${a.kind === "warning" ? "text-amber-500" : "text-indigo-500"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
          <span className={a.kind === "warning" ? "text-amber-600" : "text-indigo-600"}>
            {a.kind === "warning" ? "Alert" : "Clarification"}
          </span>
          <span className="font-medium normal-case tracking-normal text-slate-400">{a.createdAt}</span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{a.message}</p>
      </div>
      {!a.resolved ? (
        <button
          onClick={() => onResolve(a.id)}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-emerald-300 hover:text-emerald-700"
        >
          {a.kind === "clarification" ? "Mark answered" : "Resolve"}
        </button>
      ) : (
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">Resolved</span>
      )}
    </div>
  );
  return (
    <div className="space-y-3">
      {open.map(card)}
      {resolved.map(card)}
    </div>
  );
}

function PostsTab({ posts }: { posts: CampaignPost[] }) {
  const typeMeta: Record<CampaignPost["type"], { label: string; icon: JSX.Element }> = {
    reel: { label: "Reel", icon: <PlayIcon className="h-3.5 w-3.5" /> },
    story: { label: "Story", icon: <ClockIcon className="h-3.5 w-3.5" /> },
    short: { label: "Short", icon: <PlayIcon className="h-3.5 w-3.5" /> },
    post: { label: "Post", icon: <ImageIcon className="h-3.5 w-3.5" /> },
  };
  if (posts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400">
        No published posts in this scope yet.
      </div>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => {
        const meta = typeMeta[post.type];
        const eng = post.reach > 0 ? (((post.likes + post.comments) / post.reach) * 100).toFixed(1) : "0";
        return (
          <div key={post.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex h-20 items-center justify-center bg-gradient-to-br from-indigo-100 via-violet-100 to-fuchsia-100 text-indigo-400">
              <ImageIcon className="h-7 w-7" />
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                  {meta.icon}
                  {meta.label}
                </span>
                <span className="text-[11px] text-slate-400">{post.date}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-slate-700">{post.caption}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-2.5 text-center">
                <PostStat label="Reach" value={fmtCount(post.reach)} />
                <PostStat label="Likes" value={fmtCount(post.likes)} />
                <PostStat label="Eng." value={`${eng}%`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PostStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] font-bold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
