import type {
  Campaign,
  CampaignAlert,
  CampaignPayment,
  CampaignPost,
  CampaignTask,
  InfluencerProfile,
  Position,
  Product,
  Transaction,
  Wallet,
} from "./types";

/**
 * Deterministic seed data for a fresh workspace.
 *
 * The workspace's editable inputs (products, influencer roster, wallet)
 * can be overridden from the `config/` folder — see SeedOverrides. The
 * generator derives self-consistent campaign metrics, tasks, payments,
 * posts and alerts from those inputs; in production these would come from
 * real campaign tracking and social integrations. Same inputs → same data
 * on every machine.
 */

/* Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultProducts: Product[] = [
  { id: "glow-serum", name: "Glow Serum", priceInr: 899 },
  { id: "hydra-cleanser", name: "Hydra Cleanser", priceInr: 549 },
  { id: "spf-shield", name: "SPF 50 Shield", priceInr: 699 },
  { id: "night-repair", name: "Night Repair Cream", priceInr: 1099 },
];

/**
 * One influencer as edited in config/influencers.json — plain fields a
 * non-developer can maintain. Everything else is derived.
 */
export interface EditableInfluencerSeed {
  /** Stable id; derived from the name when omitted. */
  id?: string;
  name: string;
  handle: string;
  niche: string;
  bio?: string;
  tier: "macro" | "mid" | "micro";
  followers: number;
  /** Profile engagement rate in percent, e.g. 5.6 */
  engagementRate: number;
  /**
   * Commercial effectiveness multiplier: 1 ≈ breakeven ROI, 2 ≈ roughly
   * 2x sales per rupee spent. Defaults to 1.2.
   */
  performance?: number;
  /** Product ids (from products.json) this influencer runs campaigns for. */
  products: string[];
  /** Capital already allocated to this influencer, in ₹ lakh. */
  investedLakh?: number;
  /** Avatar hue 0–360; derived from the handle when omitted. */
  avatarHue?: number;
}

export const defaultInfluencers: EditableInfluencerSeed[] = [
  { id: "inf-ananya", name: "Ananya Rao", handle: "@ananya.glow", niche: "Skincare reviews", tier: "macro", avatarHue: 262, bio: "Skincare educator breaking down actives and routines for 1M+ followers.", followers: 1200000, engagementRate: 4.8, performance: 1.35, products: ["glow-serum", "spf-shield", "night-repair"], investedLakh: 3.5 },
  { id: "inf-priya", name: "Priya Menon", handle: "@priyaskin", niche: "Beauty & routines", tier: "macro", avatarHue: 330, bio: "Morning-routine and GRWM content with a loyal 18–30 audience.", followers: 860000, engagementRate: 5.6, performance: 1.6, products: ["glow-serum", "hydra-cleanser", "night-repair"], investedLakh: 2.4 },
  { id: "inf-sana", name: "Sana Kapoor", handle: "@sanacares", niche: "Dermatology-adjacent", tier: "mid", avatarHue: 190, bio: "Evidence-first skincare content reviewed with a consulting dermatologist.", followers: 540000, engagementRate: 6.1, performance: 1.9, products: ["glow-serum", "spf-shield"], investedLakh: 1.8 },
  { id: "inf-mira", name: "Mira Joshi", handle: "@mirajoshi", niche: "Lifestyle & beauty", tier: "mid", avatarHue: 24, bio: "Lifestyle creator blending beauty, travel and everyday fashion.", followers: 410000, engagementRate: 5.2, performance: 0.85, products: ["glow-serum", "hydra-cleanser"], investedLakh: 1.4 },
  { id: "inf-divya", name: "Divya Nair", handle: "@divya.dailyskin", niche: "Budget skincare", tier: "micro", avatarHue: 152, bio: "Affordable skincare finds and honest empties for students.", followers: 290000, engagementRate: 7.3, performance: 2.3, products: ["glow-serum", "hydra-cleanser", "spf-shield"], investedLakh: 0.9 },
  { id: "inf-rhea", name: "Rhea Fernandes", handle: "@rheaglows", niche: "Makeup & skin prep", tier: "mid", avatarHue: 288, bio: "Makeup artist focused on skin prep — where skincare meets the brush.", followers: 620000, engagementRate: 4.1, performance: 1.1, products: ["glow-serum", "night-repair"] },
  { id: "inf-kavya", name: "Kavya Iyer", handle: "@kavya.skinlab", niche: "Ingredient science", tier: "micro", avatarHue: 210, bio: "Chemistry grad decoding INCI lists and ingredient interactions.", followers: 180000, engagementRate: 8.1, performance: 2.0, products: ["spf-shield", "night-repair"] },
  { id: "inf-tara", name: "Tara Bhatt", handle: "@tarabhatt", niche: "Fitness & wellness", tier: "mid", avatarHue: 84, bio: "Wellness and fitness creator — skincare for active, outdoor lifestyles.", followers: 470000, engagementRate: 3.6, performance: 0.6, products: ["spf-shield", "hydra-cleanser"] },
];

/** Editable workspace inputs, typically loaded from the config/ folder. */
export interface SeedOverrides {
  products?: Product[];
  influencers?: EditableInfluencerSeed[];
  /** Wallet balance for a fresh workspace, in ₹ lakh (default 10). */
  walletLakh?: number;
}

const taskTemplates = [
  "Sign campaign agreement",
  "Receive product kit",
  "Submit content concept",
  "Concept approved by brand",
  "Shoot deliverables",
  "Submit draft for review",
  "Publish deliverables",
  "Share performance screenshots",
];

const genericCaptions = [
  "My honest 3-week results with {product} ✨",
  "{product} — full review up now",
  "AM routine feat. {product}",
  "Week 2 with {product}: here's the truth",
  "Does {product} live up to the hype?",
];

const dayMs = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

const slug = (name: string) =>
  "inf-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const hueFrom = (text: string) => {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
};

export interface SeedData {
  products: Product[];
  influencers: InfluencerProfile[];
  campaigns: Campaign[];
  alerts: CampaignAlert[];
  positions: Position[];
  transactions: Transaction[];
  wallet: Wallet;
}

export function generateSeed(
  now = Date.parse("2026-09-18T00:00:00Z"),
  overrides: SeedOverrides = {},
): SeedData {
  const products = overrides.products ?? defaultProducts;
  const seeds = overrides.influencers ?? defaultInfluencers;
  const rand = rng(20260918);

  const influencers: InfluencerProfile[] = [];
  const campaigns: Campaign[] = [];
  const alerts: CampaignAlert[] = [];
  const positions: Position[] = [];
  const transactions: Transaction[] = [];

  const postTypes = ["reel", "story", "short", "post"] as const;

  seeds.forEach((seed, seedIndex) => {
    const id = seed.id ?? slug(seed.name);
    const performance = seed.performance ?? 1.2;
    influencers.push({
      id,
      name: seed.name,
      handle: seed.handle,
      niche: seed.niche,
      bio: seed.bio ?? "",
      tier: seed.tier,
      avatarHue: seed.avatarHue ?? hueFrom(seed.handle),
      followers: seed.followers,
      engagementRate: seed.engagementRate,
    });

    if (seed.investedLakh && seed.investedLakh > 0) {
      positions.push({ influencerId: id, investedLakh: seed.investedLakh });
      transactions.push({
        id: `seed-tx-${seedIndex}`,
        influencerId: id,
        type: "invest",
        amountLakh: seed.investedLakh,
        at: now - (12 - seedIndex) * dayMs,
      });
    }

    for (const productId of seed.products) {
      const product = products.find((p) => p.id === productId);
      if (!product) continue; // unknown product ids are skipped
      const followersK = seed.followers / 1000;
      const spendLakh = round1((0.4 + rand() * 0.8) * (followersK / 250));
      const roi = performance * (0.75 + rand() * 0.7);
      const salesLakh = round1(spendLakh * roi);
      const reach = Math.round(seed.followers * (0.55 + rand() * 0.9));
      const likes = Math.round((reach * seed.engagementRate * (0.75 + rand() * 0.4)) / 100);
      const comments = Math.round(likes * (0.03 + rand() * 0.04));

      // Tasks: campaign progress varies by influencer/product.
      const progress = 0.35 + rand() * 0.65;
      const tasks: CampaignTask[] = taskTemplates.map((title, i) => {
        const frac = i / (taskTemplates.length - 1);
        const status = frac < progress - 0.12 ? "completed" : frac < progress + 0.1 ? "ongoing" : "pending";
        return {
          id: `${id}-${productId}-task-${i}`,
          title,
          status,
          due: iso(now + (i - 4) * 5 * dayMs),
        };
      });
      const completion = tasks.filter((t) => t.status === "completed").length / tasks.length;

      // Payments: 30/40/30 split; status follows task completion.
      const payments: CampaignPayment[] = (
        [
          ["advance", "Advance on signing", 0.3, 0.1],
          ["milestone", "Milestone — deliverables approved", 0.4, 0.55],
          ["final", "Final — campaign completed", 0.3, 0.95],
        ] as const
      ).map(([level, label, share, threshold], i) => ({
        id: `${id}-${productId}-pay-${i}`,
        level,
        label,
        amountLakh: round1(spendLakh * share),
        status: completion >= threshold ? "paid" : completion >= threshold - 0.25 ? "due" : "scheduled",
        date: iso(now + (i * 18 - 20) * dayMs),
      }));

      // Posts published so far.
      const postCount = 2 + Math.floor(rand() * 3);
      const posts: CampaignPost[] = Array.from({ length: postCount }, (_, i) => {
        const postReach = Math.round((reach / postCount) * (0.6 + rand() * 0.9));
        const postLikes = Math.round((postReach * seed.engagementRate * (0.7 + rand() * 0.5)) / 100);
        const caption = genericCaptions[(i + seedIndex) % genericCaptions.length].replace(
          "{product}",
          product.name,
        );
        return {
          id: `${id}-${productId}-post-${i}`,
          productId,
          type: postTypes[Math.floor(rand() * postTypes.length)],
          caption,
          date: iso(now - (2 + i * 6 + Math.floor(rand() * 3)) * dayMs),
          reach: postReach,
          likes: postLikes,
          comments: Math.round(postLikes * (0.03 + rand() * 0.05)),
        };
      });

      // 12-week ROI trend: random walk converging on the final ROI.
      const roiHistory: number[] = [];
      let v = roi * (0.45 + rand() * 0.4);
      for (let w = 0; w < 12; w++) {
        v = v + (roi - v) * 0.28 + (rand() - 0.5) * 0.3;
        roiHistory.push(Math.max(0.1, round2(v)));
      }
      roiHistory[11] = round2(roi);

      campaigns.push({
        influencerId: id,
        productId,
        spendLakh,
        salesLakh,
        reach,
        likes,
        comments,
        tasks,
        payments,
        posts,
        roiHistory,
      });

      // Alerts: clarifications for mid-progress campaigns, warnings for laggards.
      if (progress > 0.4 && progress < 0.8 && rand() < 0.6) {
        alerts.push({
          id: `${id}-${productId}-alert-c`,
          influencerId: id,
          productId,
          kind: "clarification",
          message: rand() < 0.5
            ? "Can I mention the launch discount code in the second reel, or keep it organic?"
            : "Draft submitted — does the brand want the before/after framing removed per guidelines?",
          createdAt: iso(now - Math.floor(rand() * 4 + 1) * dayMs),
          resolved: false,
        });
      }
      if (performance < 0.9 && rand() < 0.8) {
        alerts.push({
          id: `${id}-${productId}-alert-w`,
          influencerId: id,
          productId,
          kind: "warning",
          message: "Deliverable overdue by 4 days — engagement pacing 30% below plan.",
          createdAt: iso(now - 2 * dayMs),
          resolved: false,
        });
      }
    }
  });

  return {
    products,
    influencers,
    campaigns,
    alerts,
    positions,
    transactions,
    wallet: { balanceLakh: overrides.walletLakh ?? 10 },
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
