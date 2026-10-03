/** What the Meta (Facebook & Instagram) API endpoints return. Shared by the server and the web app. */

export interface MetaInstagramAccount {
  id: string;
  username: string;
  name?: string;
  pictureUrl?: string;
  followers?: number;
}

export interface MetaPageSummary {
  id: string;
  name: string;
  category?: string;
  instagram?: MetaInstagramAccount;
}

export interface MetaAdAccountSummary {
  id: string;
  name: string;
  currency: string;
  /** 1 = active; anything else means Meta has paused or disabled the account. */
  status: number;
}

export interface MetaStatus {
  /** Whether the server has a Meta app (META_APP_ID / META_APP_SECRET). */
  configured: boolean;
  connected: boolean;
  /** Owners connect and disconnect; everyone in the workspace uses the connection. */
  canManage: boolean;
  /** Addresses to enter in the Meta app's settings (for the owner). */
  setup?: { redirectUri: string; deauthorizeUrl: string; dataDeletionUrl: string };
  account?: {
    name: string;
    connectedAt: number;
    refreshedAt: number;
    tokenExpiresAt: number | null;
    /** Permissions Marketbing asked for that weren't granted. */
    missingScopes: string[];
  };
  pages: MetaPageSummary[];
  adAccounts: MetaAdAccountSummary[];
}

export interface IgProfile {
  id: string;
  username: string;
  name?: string;
  biography?: string;
  website?: string;
  pictureUrl?: string;
  followers: number | null;
  following: number | null;
  posts: number | null;
}

export interface IgMedia {
  id: string;
  caption?: string;
  /** IMAGE, VIDEO or CAROUSEL_ALBUM */
  mediaType: string;
  /** FEED, REELS, STORY, … */
  productType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp: string;
  likes: number | null;
  comments: number | null;
}

export interface IgOverview {
  profile: IgProfile;
  /** Totals for the last 28 days, by metric name (reach, views, total_interactions, …). */
  insights: Record<string, number> | null;
  /** Why insights are missing, when they are. */
  insightsError?: string;
  media: IgMedia[];
}

export interface IgComment {
  id: string;
  text: string;
  username?: string;
  timestamp: string;
  hidden?: boolean;
  likes?: number;
  replies: { id: string; text: string; username?: string; timestamp: string }[];
}

export interface IgMediaDetail {
  insights: Record<string, number> | null;
  insightsError?: string;
  comments: IgComment[];
}

export interface IgLookup {
  profile: IgProfile;
  /** Averages over the recent posts shown (null when Meta hides the counts). */
  avgLikes: number | null;
  avgComments: number | null;
  /** (avg likes + avg comments) / followers, e.g. 0.034 = 3.4%. */
  engagementRate: number | null;
  recent: IgMedia[];
}

export interface FbPagePost {
  id: string;
  message?: string;
  createdAt: string;
  permalink?: string;
  picture?: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
}

export interface FbPageOverview {
  page: { id: string; name: string; category?: string; link?: string; fans: number | null; followers: number | null; pictureUrl?: string };
  posts: FbPagePost[];
  scheduled: { id: string; message?: string; scheduledAt: number }[];
}

export interface AdMetrics {
  /** In the ad account's currency (major units). */
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  /** Percent, e.g. 1.25 = 1.25% */
  ctr: number;
  cpc: number | null;
}

export interface AdCampaign {
  id: string;
  name: string;
  /** What was set: ACTIVE, PAUSED, ARCHIVED, DELETED */
  status: string;
  /** What is actually happening, e.g. ACTIVE, PAUSED, CAMPAIGN_PAUSED, IN_PROCESS, WITH_ISSUES */
  effectiveStatus: string;
  objective: string;
  /** Major units of the account currency. */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  /** Last 30 days; null when the campaign hasn't run in that time. */
  metrics: AdMetrics | null;
}

export interface AdsOverview {
  account: MetaAdAccountSummary;
  /** Whole account, last 30 days. */
  summary: AdMetrics | null;
  campaigns: AdCampaign[];
}

export const CAMPAIGN_OBJECTIVES = [
  { id: "OUTCOME_AWARENESS", label: "Awareness" },
  { id: "OUTCOME_TRAFFIC", label: "Traffic" },
  { id: "OUTCOME_ENGAGEMENT", label: "Engagement" },
  { id: "OUTCOME_LEADS", label: "Leads" },
  { id: "OUTCOME_SALES", label: "Sales" },
  { id: "OUTCOME_APP_PROMOTION", label: "App promotion" },
] as const;
