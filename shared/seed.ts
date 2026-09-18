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
 * In production this data comes from real campaign tracking and social
 * integrations; the generator stands in for those feeds so every install
 * starts with a populated, self-consistent workspace. Same seed → same
 * data on every machine.
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

export const seedProducts: Product[] = [
  { id: "glow-serum", name: "Glow Serum", priceInr: 899 },
  { id: "hydra-cleanser", name: "Hydra Cleanser", priceInr: 549 },
  { id: "spf-shield", name: "SPF 50 Shield", priceInr: 699 },
  { id: "night-repair", name: "Night Repair Cream", priceInr: 1099 },
];

interface ProfileSeed {
  profile: Omit<InfluencerProfile, "followers" | "engagementRate">;
  followersK: number;
  engagementRate: number;
  /** Commercial performance multiplier — drives ROI and rating spread. */
  performance: number;
  productIds: string[];
}

const profileSeeds: ProfileSeed[] = [
  {
    profile: { id: "inf-ananya", name: "Ananya Rao", handle: "@ananya.glow", niche: "Skincare reviews", tier: "macro", avatarHue: 262, bio: "Skincare educator breaking down actives and routines for 1M+ followers." },
    followersK: 1200, engagementRate: 4.8, performance: 1.35,
    productIds: ["glow-serum", "spf-shield", "night-repair"],
  },
  {
    profile: { id: "inf-priya", name: "Priya Menon", handle: "@priyaskin", niche: "Beauty & routines", tier: "macro", avatarHue: 330, bio: "Morning-routine and GRWM content with a loyal 18–30 audience." },
    followersK: 860, engagementRate: 5.6, performance: 1.6,
    productIds: ["glow-serum", "hydra-cleanser", "night-repair"],
  },
  {
    profile: { id: "inf-sana", name: "Sana Kapoor", handle: "@sanacares", niche: "Dermatology-adjacent", tier: "mid", avatarHue: 190, bio: "Evidence-first skincare content reviewed with a consulting dermatologist." },
    followersK: 540, engagementRate: 6.1, performance: 1.9,
    productIds: ["glow-serum", "spf-shield"],
  },
  {
    profile: { id: "inf-mira", name: "Mira Joshi", handle: "@mirajoshi", niche: "Lifestyle & beauty", tier: "mid", avatarHue: 24, bio: "Lifestyle creator blending beauty, travel and everyday fashion." },
    followersK: 410, engagementRate: 5.2, performance: 0.85,
    productIds: ["glow-serum", "hydra-cleanser"],
  },
  {
    profile: { id: "inf-divya", name: "Divya Nair", handle: "@divya.dailyskin", niche: "Budget skincare", tier: "micro", avatarHue: 152, bio: "Affordable skincare finds and honest empties for students." },
    followersK: 290, engagementRate: 7.3, performance: 2.3,
    productIds: ["glow-serum", "hydra-cleanser", "spf-shield"],
  },
  {
    profile: { id: "inf-rhea", name: "Rhea Fernandes", handle: "@rheaglows", niche: "Makeup & skin prep", tier: "mid", avatarHue: 288, bio: "Makeup artist focused on skin prep — where skincare meets the brush." },
    followersK: 620, engagementRate: 4.1, performance: 1.1,
    productIds: ["glow-serum", "night-repair"],
  },
  {
    profile: { id: "inf-kavya", name: "Kavya Iyer", handle: "@kavya.skinlab", niche: "Ingredient science", tier: "micro", avatarHue: 210, bio: "Chemistry grad decoding INCI lists and ingredient interactions." },
    followersK: 180, engagementRate: 8.1, performance: 2.0,
    productIds: ["spf-shield", "night-repair"],
  },
  {
    profile: { id: "inf-tara", name: "Tara Bhatt", handle: "@tarabhatt", niche: "Fitness & wellness", tier: "mid", avatarHue: 84, bio: "Wellness and fitness creator — skincare for active, outdoor lifestyles." },
    followersK: 470, engagementRate: 3.6, performance: 0.6,
    productIds: ["spf-shield", "hydra-cleanser"],
  },
];

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

const captionTemplates: Record<string, string[]> = {
  "glow-serum": [
    "My honest 3-week results with the Glow Serum ✨",
    "Vitamin C serums ranked — and why this one stayed",
    "AM routine feat. the new Glow Serum",
    "The glow is real. Full review up now.",
  ],
  "hydra-cleanser": [
    "Double cleansing but make it gentle 🫧",
    "This cleanser doesn't strip — here's the proof",
    "My skin barrier's favourite first step",
  ],
  "spf-shield": [
    "No white cast. I repeat: NO white cast ☀️",
    "Reapplying SPF over makeup — full demo",
    "SPF 50 that doesn't pill under foundation",
  ],
  "night-repair": [
    "Night routine that actually repairs 🌙",
    "Woke up like this — Night Repair week 2",
    "Retinol nights, hydrated mornings",
  ],
};

const dayMs = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface SeedData {
  products: Product[];
  influencers: InfluencerProfile[];
  campaigns: Campaign[];
  alerts: CampaignAlert[];
  positions: Position[];
  transactions: Transaction[];
  wallet: Wallet;
}

export function generateSeed(now = Date.parse("2026-09-18T00:00:00Z")): SeedData {
  const rand = rng(20260918);
  const influencers: InfluencerProfile[] = [];
  const campaigns: Campaign[] = [];
  const alerts: CampaignAlert[] = [];

  const postTypes = ["reel", "story", "short", "post"] as const;

  for (const seed of profileSeeds) {
    influencers.push({
      ...seed.profile,
      followers: seed.followersK * 1000,
      engagementRate: seed.engagementRate,
    });

    for (const productId of seed.productIds) {
      const spendLakh = round1((0.4 + rand() * 0.8) * (seed.followersK / 250));
      const roi = seed.performance * (0.75 + rand() * 0.7);
      const salesLakh = round1(spendLakh * roi);
      const reach = Math.round(seed.followersK * 1000 * (0.55 + rand() * 0.9));
      const likes = Math.round((reach * seed.engagementRate * (0.75 + rand() * 0.4)) / 100);
      const comments = Math.round(likes * (0.03 + rand() * 0.04));

      // Tasks: campaign progress varies by influencer/product.
      const progress = 0.35 + rand() * 0.65;
      const tasks: CampaignTask[] = taskTemplates.map((title, i) => {
        const frac = i / (taskTemplates.length - 1);
        const status = frac < progress - 0.12 ? "completed" : frac < progress + 0.1 ? "ongoing" : "pending";
        return {
          id: `${seed.profile.id}-${productId}-task-${i}`,
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
        id: `${seed.profile.id}-${productId}-pay-${i}`,
        level,
        label,
        amountLakh: round1(spendLakh * share),
        status: completion >= threshold ? "paid" : completion >= threshold - 0.25 ? "due" : "scheduled",
        date: iso(now + (i * 18 - 20) * dayMs),
      }));

      // Posts published so far.
      const postCount = 2 + Math.floor(rand() * 3);
      const captions = captionTemplates[productId];
      const posts: CampaignPost[] = Array.from({ length: postCount }, (_, i) => {
        const postReach = Math.round((reach / postCount) * (0.6 + rand() * 0.9));
        const postLikes = Math.round((postReach * seed.engagementRate * (0.7 + rand() * 0.5)) / 100);
        return {
          id: `${seed.profile.id}-${productId}-post-${i}`,
          productId,
          type: postTypes[Math.floor(rand() * postTypes.length)],
          caption: captions[i % captions.length],
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
        influencerId: seed.profile.id,
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
          id: `${seed.profile.id}-${productId}-alert-c`,
          influencerId: seed.profile.id,
          productId,
          kind: "clarification",
          message: rand() < 0.5
            ? "Can I mention the launch discount code in the second reel, or keep it organic?"
            : "Draft submitted — does the brand want the before/after framing removed per guidelines?",
          createdAt: iso(now - Math.floor(rand() * 4 + 1) * dayMs),
          resolved: false,
        });
      }
      if (seed.performance < 0.9 && rand() < 0.8) {
        alerts.push({
          id: `${seed.profile.id}-${productId}-alert-w`,
          influencerId: seed.profile.id,
          productId,
          kind: "warning",
          message: "Deliverable overdue by 4 days — engagement pacing 30% below plan.",
          createdAt: iso(now - 2 * dayMs),
          resolved: false,
        });
      }
    }
  }

  // Initial portfolio: mirrors the POs sent from Module 1's demo run.
  const positions: Position[] = [
    { influencerId: "inf-ananya", investedLakh: 3.5 },
    { influencerId: "inf-priya", investedLakh: 2.4 },
    { influencerId: "inf-sana", investedLakh: 1.8 },
    { influencerId: "inf-mira", investedLakh: 1.4 },
    { influencerId: "inf-divya", investedLakh: 0.9 },
  ];

  const transactions: Transaction[] = positions.map((p, i) => ({
    id: `seed-tx-${i}`,
    influencerId: p.influencerId,
    type: "invest",
    amountLakh: p.investedLakh,
    at: now - (12 - i) * dayMs,
  }));

  const wallet: Wallet = { balanceLakh: 10 };

  return { products: seedProducts, influencers, campaigns, alerts, positions, transactions, wallet };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
