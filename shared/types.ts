/**
 * Domain types shared by the API server, the web client and the embedded
 * (in-browser) runtime. This is the single source of truth for the data
 * model of Modules 1 and 2.
 */

/* ============================== Module 1 ============================== */

export type ObjectiveKind = "holistic" | "influencer" | "email";

export interface MarketingObjective {
  text: string;
  kind: ObjectiveKind;
}

/** One conditional context question the planner decides to ask. */
export interface ContextField {
  id: string;
  category: string; // e.g. "B · Desired Outcome"
  label: string;
  helper?: string;
  type: "text" | "textarea";
  placeholder?: string;
  prefill: string;
  optional?: boolean;
}

export interface BusinessContext {
  [fieldId: string]: string;
}

export interface MarketingStrategy {
  id: string;
  name: string;
  executable: boolean; // can the platform execute it today?
  rationale: string;
}

export interface PlanMetrics {
  budgetLakh: number; // ₹ lakh
  coverageM: number; // estimated reach, millions
  efficiencyPct: number; // 0-100
  influencerCount: number;
}

export interface MarketingPlan {
  id: string;
  name: string;
  tagline: string;
  description: string;
  recommended?: boolean;
  metrics: PlanMetrics;
  strategies: MarketingStrategy[];
  keyActivities: string[];
  /** Full execution workflow for this plan. */
  steps: WorkflowStep[];
}

export type StepStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "awaiting_approval"
  | "rejected";

export interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  /** Step ids that must be completed before this step can start. */
  dependsOn: string[];
  /** Execution time in ms once the step starts (simulated executor). */
  durationMs: number;
  /** Execution pauses on this step until a human approves. */
  requiresApproval?: boolean;
  /** Steps sharing a parallelGroup run simultaneously and render side by side. */
  parallelGroup?: string;
  /** Shown once the step completes, e.g. "12 influencers shortlisted". */
  completedDetail?: string;
  /** Activity is outside the platform's current execution capability. */
  external?: boolean;
}

export interface ApprovalDecision {
  decision: "approved" | "rejected";
  at: number; // epoch ms
}

/** A persisted execution run of a selected plan. */
export interface RunRecord {
  id: string;
  objective: string;
  kind: ObjectiveKind;
  planId: string;
  planName: string;
  context: BusinessContext;
  steps: WorkflowStep[];
  startedAt: number; // epoch ms
  approvals: Record<string, ApprovalDecision>;
  createdAt: number;
}

/** Server-computed state of a run at a point in time. */
export interface RunState {
  run: RunRecord;
  statuses: Record<string, StepStatus>;
  completed: number;
  total: number;
  currentStepId: string | null;
  awaitingStepId: string | null;
  rejectedStepId: string | null;
  done: boolean;
}

/** Response of the planner analyze endpoint. */
export interface AnalyzeResponse {
  kind: ObjectiveKind;
  fields: ContextField[];
  note: string;
}

/** Response of the planner plans endpoint. */
export interface PlansResponse {
  summary: string;
  strategies: MarketingStrategy[];
  plans: MarketingPlan[];
}

/* ============================== Module 2 ============================== */

export interface Product {
  id: string;
  name: string;
  priceInr: number;
}

export type InfluencerTier = "macro" | "mid" | "micro";

export interface InfluencerProfile {
  id: string;
  name: string;
  handle: string;
  niche: string;
  bio: string;
  tier: InfluencerTier;
  followers: number;
  engagementRate: number; // %
  /** Hue (0-360) used to render the avatar gradient. */
  avatarHue: number;
}

export type TaskStatus = "completed" | "ongoing" | "pending";

export interface CampaignTask {
  id: string;
  title: string;
  status: TaskStatus;
  due: string; // ISO date
}

export type PaymentLevel = "advance" | "milestone" | "final";
export type PaymentStatus = "paid" | "due" | "scheduled";

export interface CampaignPayment {
  id: string;
  level: PaymentLevel;
  label: string;
  amountLakh: number;
  status: PaymentStatus;
  date: string; // ISO date
}

export type PostType = "reel" | "story" | "short" | "post";

export interface CampaignPost {
  id: string;
  productId: string;
  type: PostType;
  caption: string;
  date: string; // ISO date
  reach: number;
  likes: number;
  comments: number;
}

export type AlertKind = "clarification" | "warning" | "info";

export interface CampaignAlert {
  id: string;
  influencerId: string;
  productId: string;
  kind: AlertKind;
  message: string;
  createdAt: string; // ISO date
  resolved: boolean;
}

/** One influencer × product engagement/commercial record. */
export interface Campaign {
  influencerId: string;
  productId: string;
  spendLakh: number; // amount paid to the influencer for this product
  salesLakh: number; // attributed sales
  reach: number;
  likes: number;
  comments: number;
  tasks: CampaignTask[];
  payments: CampaignPayment[];
  posts: CampaignPost[];
  /** 12 weekly ROI points (sales/spend multiples). */
  roiHistory: number[];
}

/** The user's capital allocated to an influencer. */
export interface Position {
  influencerId: string;
  investedLakh: number;
}

export interface Transaction {
  id: string;
  influencerId: string;
  type: "invest" | "divest";
  amountLakh: number;
  at: number; // epoch ms
}

export interface Wallet {
  balanceLakh: number;
}

/* ---- computed marketplace views ---- */

export interface InfluencerSummary {
  profile: InfluencerProfile;
  investedLakh: number;
  spendLakh: number;
  salesLakh: number;
  /** Sales generated per rupee spent (multiple, e.g. 2.4x). */
  roi: number;
  /** 1.0 – 5.0 */
  rating: number;
  openAlerts: number;
  productCount: number;
  taskCompletionPct: number;
  roiTrend: number[];
}

export interface MarketplaceOverview {
  wallet: Wallet;
  totalInvestedLakh: number;
  portfolioRoi: number;
  influencers: InfluencerSummary[];
}

/** Aggregated stats for one product (or all products) of one influencer. */
export interface CampaignView {
  productId: string | "overall";
  spendLakh: number;
  salesLakh: number;
  roi: number;
  reach: number;
  likes: number;
  comments: number;
  engagementRate: number; // % of reach that engaged
  tasks: CampaignTask[];
  payments: CampaignPayment[];
  alerts: CampaignAlert[];
  posts: CampaignPost[];
  roiTrend: number[];
}

export interface InfluencerDetail {
  summary: InfluencerSummary;
  wallet: Wallet;
  products: Product[]; // products this influencer has campaigns for
  view: CampaignView;
}

export interface CompareEntry {
  summary: InfluencerSummary;
}

export interface TradeResult {
  wallet: Wallet;
  position: Position;
  transaction: Transaction;
}
