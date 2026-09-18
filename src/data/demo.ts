import type { Influencer } from "../types";

/**
 * DEMO DATA ONLY — fictional brand scenario used to demonstrate the
 * end-to-end flow without external integrations.
 */

export const demoScenario = {
  brand: "NovaSkin",
  product: "NovaSkin Glow Serum",
  objective:
    "Launch our new Glow Serum and increase sales among women aged 18–30 in India over the next 60 days.",
  desiredOutcome: "Generate ₹50 lakh in sales.",
  products:
    "NovaSkin Glow Serum — a new vitamin-C based face serum for daily use.",
  region: "India",
  targetAudience: "Women aged 18–30 interested in skincare and beauty.",
  existingCustomers:
    "Women aged 25–40, primarily existing skincare customers.",
  currentMarketing:
    "Instagram, Meta Ads and email marketing. ~85k Instagram followers, 120k email subscribers.",
  budget: "₹20 lakh",
  timeline: "60 days",
  competitors: "GlowCo, SkinPure, DermaGlow",
  brandMessaging:
    "Science-backed skincare for everyday routines. Honest, clinical, approachable tone.",
  restrictions: "Do not use misleading before/after claims.",
  assets:
    "Product photography, product video, brand logo, product descriptions.",
};

/** Previous-quarter marketing spend, illustrative. */
export const historicalSpend = [
  { quarter: "Q3 FY25", lakh: 12 },
  { quarter: "Q4 FY25", lakh: 15 },
  { quarter: "Q1 FY26", lakh: 18 },
];

export interface PromptTemplate {
  id: string;
  label: string;
  icon: "plan" | "megaphone" | "mail";
  objective: string;
}

export const promptTemplates: PromptTemplate[] = [
  {
    id: "plan",
    label: "Create Marketing Plan",
    icon: "plan",
    objective:
      "Create a complete marketing plan to launch our new Glow Serum and generate ₹50 lakh in sales among women aged 18–30 in India within 60 days.",
  },
  {
    id: "influencer",
    label: "Launch Ad Campaign With Influencers",
    icon: "megaphone",
    objective:
      "Launch an influencer-led ad campaign for our new Glow Serum targeting women aged 18–30 in India, with a ₹20 lakh budget over the next 60 days.",
  },
  {
    id: "email",
    label: "Send Discount Emails",
    icon: "mail",
    objective:
      "Send a discount email campaign to our existing customers to drive repeat purchases of NovaSkin products this month.",
  },
];

/** Fictional influencers used in the PO approval checkpoint. */
export const demoInfluencers: Influencer[] = [
  {
    id: "inf-1",
    name: "Ananya Rao",
    handle: "@ananya.glow",
    niche: "Skincare reviews",
    followers: "1.2M",
    engagement: "4.8%",
    poAmountLakh: 3.5,
    deliverables: "2 Reels + 3 Stories",
  },
  {
    id: "inf-2",
    name: "Priya Menon",
    handle: "@priyaskin",
    niche: "Beauty & routines",
    followers: "860k",
    engagement: "5.6%",
    poAmountLakh: 2.4,
    deliverables: "1 Reel + 4 Stories",
  },
  {
    id: "inf-3",
    name: "Sana Kapoor",
    handle: "@sanacares",
    niche: "Dermatology-adjacent",
    followers: "540k",
    engagement: "6.1%",
    poAmountLakh: 1.8,
    deliverables: "2 Reels + 2 Stories",
  },
  {
    id: "inf-4",
    name: "Mira Joshi",
    handle: "@mirajoshi",
    niche: "Lifestyle & beauty",
    followers: "410k",
    engagement: "5.2%",
    poAmountLakh: 1.4,
    deliverables: "1 Reel + 1 YouTube Short",
  },
  {
    id: "inf-5",
    name: "Divya Nair",
    handle: "@divya.dailyskin",
    niche: "Budget skincare",
    followers: "290k",
    engagement: "7.3%",
    poAmountLakh: 0.9,
    deliverables: "2 Reels + 3 Stories",
  },
];
