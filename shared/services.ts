import type { DataStore } from "./store";
import type {
  BusinessContext,
  Campaign,
  CampaignAlert,
  CampaignView,
  CompareEntry,
  InfluencerDetail,
  InfluencerProfile,
  InfluencerSummary,
  MarketplaceOverview,
  ObjectiveKind,
  Position,
  RunRecord,
  RunState,
  TradeResult,
} from "./types";
import { computeRunState, applyApproval, type ApprovalAction } from "./engine";
import { generatePlans } from "./planner";

/**
 * Service layer: all business rules for Modules 1 & 2, written against the
 * DataStore interface so the API server and the embedded runtime share one
 * implementation.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/* ---------------------------- marketplace ---------------------------- */

interface MarketData {
  influencers: InfluencerProfile[];
  campaigns: Campaign[];
  alerts: CampaignAlert[];
  positions: Position[];
}

async function loadMarket(store: DataStore): Promise<MarketData> {
  const [influencers, campaigns, alerts, positions] = await Promise.all([
    store.listInfluencers(),
    store.listCampaigns(),
    store.listAlerts(),
    store.listPositions(),
  ]);
  return { influencers, campaigns, alerts, positions };
}

function summarize(data: MarketData, influencerId: string): InfluencerSummary {
  const profile = data.influencers.find((i) => i.id === influencerId);
  if (!profile) throw new ApiError(404, `Unknown influencer "${influencerId}"`);
  const campaigns = data.campaigns.filter((c) => c.influencerId === influencerId);
  const alerts = data.alerts.filter((a) => a.influencerId === influencerId && !a.resolved);
  const position = data.positions.find((p) => p.influencerId === influencerId);

  const spendLakh = round1(campaigns.reduce((s, c) => s + c.spendLakh, 0));
  const salesLakh = round1(campaigns.reduce((s, c) => s + c.salesLakh, 0));
  const roi = spendLakh > 0 ? round2(salesLakh / spendLakh) : 0;

  const allTasks = campaigns.flatMap((c) => c.tasks);
  const taskCompletionPct = allTasks.length
    ? Math.round((allTasks.filter((t) => t.status === "completed").length / allTasks.length) * 100)
    : 0;

  // Rating: weighted blend of ROI, engagement, delivery reliability and
  // open-alert penalty, clamped to 1.0–5.0.
  const roiScore = Math.min(roi / 3, 1); // 3x+ ROI = full marks
  const engScore = Math.min(profile.engagementRate / 8, 1);
  const taskScore = taskCompletionPct / 100;
  const alertPenalty = Math.min(alerts.filter((a) => a.kind === "warning").length * 0.35, 1);
  const rating = round1(
    Math.min(5, Math.max(1, 1 + roiScore * 2.2 + engScore * 1.2 + taskScore * 0.9 - alertPenalty)),
  );

  // Overall ROI trend: spend-weighted mean of campaign trends.
  const roiTrend = Array.from({ length: 12 }, (_, w) => {
    const total = campaigns.reduce((s, c) => s + c.spendLakh, 0);
    if (total === 0) return 0;
    return round2(campaigns.reduce((s, c) => s + c.roiHistory[w] * c.spendLakh, 0) / total);
  });

  return {
    profile,
    investedLakh: position?.investedLakh ?? 0,
    spendLakh,
    salesLakh,
    roi,
    rating,
    openAlerts: alerts.length,
    productCount: campaigns.length,
    taskCompletionPct,
    roiTrend,
  };
}

export async function getMarketplaceOverview(store: DataStore): Promise<MarketplaceOverview> {
  const [data, wallet] = await Promise.all([loadMarket(store), store.getWallet()]);
  const influencers = data.influencers.map((i) => summarize(data, i.id));
  const totalInvestedLakh = round1(influencers.reduce((s, i) => s + i.investedLakh, 0));
  const totalSpend = influencers.reduce((s, i) => s + i.spendLakh, 0);
  const totalSales = influencers.reduce((s, i) => s + i.salesLakh, 0);
  return {
    wallet,
    totalInvestedLakh,
    portfolioRoi: totalSpend > 0 ? round2(totalSales / totalSpend) : 0,
    influencers,
  };
}

function buildView(data: MarketData, influencerId: string, productId: string | "overall"): CampaignView {
  let campaigns: Campaign[] = data.campaigns.filter((c) => c.influencerId === influencerId);
  if (productId !== "overall") {
    campaigns = campaigns.filter((c) => c.productId === productId);
    if (campaigns.length === 0) {
      throw new ApiError(404, `No campaign for influencer "${influencerId}" and product "${productId}"`);
    }
  }
  const spendLakh = round1(campaigns.reduce((s, c) => s + c.spendLakh, 0));
  const salesLakh = round1(campaigns.reduce((s, c) => s + c.salesLakh, 0));
  const reach = campaigns.reduce((s, c) => s + c.reach, 0);
  const likes = campaigns.reduce((s, c) => s + c.likes, 0);
  const comments = campaigns.reduce((s, c) => s + c.comments, 0);
  const alerts = data.alerts.filter(
    (a) => a.influencerId === influencerId && (productId === "overall" || a.productId === productId),
  );

  const totalSpend = campaigns.reduce((s, c) => s + c.spendLakh, 0);
  const roiTrend = Array.from({ length: 12 }, (_, w) =>
    totalSpend === 0
      ? 0
      : round2(campaigns.reduce((s, c) => s + c.roiHistory[w] * c.spendLakh, 0) / totalSpend),
  );

  return {
    productId,
    spendLakh,
    salesLakh,
    roi: spendLakh > 0 ? round2(salesLakh / spendLakh) : 0,
    reach,
    likes,
    comments,
    engagementRate: reach > 0 ? round2(((likes + comments) / reach) * 100) : 0,
    tasks: campaigns.flatMap((c) => c.tasks),
    payments: campaigns.flatMap((c) => c.payments),
    alerts,
    posts: campaigns
      .flatMap((c) => c.posts)
      .sort((a, b) => b.date.localeCompare(a.date)),
    roiTrend,
  };
}

export async function getInfluencerDetail(
  store: DataStore,
  influencerId: string,
  productId: string | "overall",
): Promise<InfluencerDetail> {
  const [data, wallet, products] = await Promise.all([
    loadMarket(store),
    store.getWallet(),
    store.listProducts(),
  ]);
  const summary = summarize(data, influencerId);
  const productIds = new Set(
    data.campaigns.filter((c) => c.influencerId === influencerId).map((c) => c.productId),
  );
  return {
    summary,
    wallet,
    products: products.filter((p) => productIds.has(p.id)),
    view: buildView(data, influencerId, productId),
  };
}

export async function compareInfluencers(store: DataStore, ids: string[]): Promise<CompareEntry[]> {
  if (ids.length < 2 || ids.length > 3) {
    throw new ApiError(400, "Compare takes 2 or 3 influencer ids");
  }
  const data = await loadMarket(store);
  return ids.map((id) => ({ summary: summarize(data, id) }));
}

export async function trade(
  store: DataStore,
  influencerId: string,
  type: "invest" | "divest",
  amountLakh: number,
  now: number,
): Promise<TradeResult> {
  if (!Number.isFinite(amountLakh) || amountLakh <= 0) {
    throw new ApiError(400, "Amount must be a positive number of lakhs");
  }
  amountLakh = round1(amountLakh);
  const profile = (await store.listInfluencers()).find((i) => i.id === influencerId);
  if (!profile) throw new ApiError(404, `Unknown influencer "${influencerId}"`);
  return store.transaction((tx) => applyTrade(tx, influencerId, type, amountLakh, now));
}

async function applyTrade(
  store: DataStore,
  influencerId: string,
  type: "invest" | "divest",
  amountLakh: number,
  now: number,
): Promise<TradeResult> {
  // Read the wallet first: in a transaction it takes the lock that serializes trades.
  const wallet = await store.getWallet();
  const position = (await store.listPositions()).find((p) => p.influencerId === influencerId) ?? {
    influencerId,
    investedLakh: 0,
  };

  if (type === "invest") {
    if (amountLakh > wallet.balanceLakh) {
      throw new ApiError(400, `Insufficient wallet balance (₹${wallet.balanceLakh}L available)`);
    }
    wallet.balanceLakh = round1(wallet.balanceLakh - amountLakh);
    position.investedLakh = round1(position.investedLakh + amountLakh);
  } else {
    if (amountLakh > position.investedLakh) {
      throw new ApiError(400, `Cannot divest more than the ₹${position.investedLakh}L invested`);
    }
    wallet.balanceLakh = round1(wallet.balanceLakh + amountLakh);
    position.investedLakh = round1(position.investedLakh - amountLakh);
  }

  const transaction = {
    id: `tx-${now}-${Math.floor(Math.random() * 1e6)}`,
    influencerId,
    type,
    amountLakh,
    at: now,
  };
  await store.saveWallet(wallet);
  await store.savePosition(position);
  await store.addTransaction(transaction);
  return { wallet, position, transaction };
}

export async function resolveAlert(store: DataStore, alertId: string): Promise<void> {
  const alert = (await store.listAlerts()).find((a) => a.id === alertId);
  if (!alert) throw new ApiError(404, `Unknown alert "${alertId}"`);
  await store.saveAlert({ ...alert, resolved: true });
}

/* ------------------------------- runs ------------------------------- */

export interface CreateRunInput {
  objective: string;
  kind: ObjectiveKind;
  planId: string;
  context: BusinessContext;
}

export async function createRun(store: DataStore, input: CreateRunInput, now: number): Promise<RunState> {
  const { plans } = generatePlans(input.kind);
  const plan = plans.find((p) => p.id === input.planId);
  if (!plan) throw new ApiError(400, `Unknown plan "${input.planId}"`);
  if (typeof input.objective !== "string" || input.objective.trim().length < 10) {
    throw new ApiError(400, "Objective is required");
  }
  const run: RunRecord = {
    id: `run-${now}-${Math.floor(Math.random() * 1e6)}`,
    objective: input.objective,
    kind: input.kind,
    planId: plan.id,
    planName: plan.name,
    context: input.context ?? {},
    steps: plan.steps,
    startedAt: now,
    approvals: {},
    createdAt: now,
  };
  await store.saveRun(run);
  return computeRunState(run, now);
}

export async function getRunState(store: DataStore, runId: string, now: number): Promise<RunState> {
  const run = await store.getRun(runId);
  if (!run) throw new ApiError(404, `Unknown run "${runId}"`);
  return computeRunState(run, now);
}

export async function decideApproval(
  store: DataStore,
  runId: string,
  stepId: string,
  action: ApprovalAction,
  now: number,
): Promise<RunState> {
  return store.transaction(async (tx) => {
    const run = await tx.getRun(runId);
    if (!run) throw new ApiError(404, `Unknown run "${runId}"`);
    try {
      applyApproval(run, stepId, action, now);
    } catch (e) {
      throw new ApiError(400, (e as Error).message);
    }
    await tx.saveRun(run);
    return computeRunState(run, now);
  });
}
