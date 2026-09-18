/** Static UI content for Module 1 (prompt shortcuts, PO review lines). */

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

/** Purchase-order lines shown at the PO approval checkpoint. */
export interface POLine {
  id: string;
  name: string;
  handle: string;
  niche: string;
  followers: string;
  engagement: string;
  poAmountLakh: number;
  deliverables: string;
}

export const poLines: POLine[] = [
  { id: "inf-ananya", name: "Ananya Rao", handle: "@ananya.glow", niche: "Skincare reviews", followers: "1.2M", engagement: "4.8%", poAmountLakh: 3.5, deliverables: "2 Reels + 3 Stories" },
  { id: "inf-priya", name: "Priya Menon", handle: "@priyaskin", niche: "Beauty & routines", followers: "860k", engagement: "5.6%", poAmountLakh: 2.4, deliverables: "1 Reel + 4 Stories" },
  { id: "inf-sana", name: "Sana Kapoor", handle: "@sanacares", niche: "Dermatology-adjacent", followers: "540k", engagement: "6.1%", poAmountLakh: 1.8, deliverables: "2 Reels + 2 Stories" },
  { id: "inf-mira", name: "Mira Joshi", handle: "@mirajoshi", niche: "Lifestyle & beauty", followers: "410k", engagement: "5.2%", poAmountLakh: 1.4, deliverables: "1 Reel + 1 YouTube Short" },
  { id: "inf-divya", name: "Divya Nair", handle: "@divya.dailyskin", niche: "Budget skincare", followers: "290k", engagement: "7.3%", poAmountLakh: 0.9, deliverables: "2 Reels + 3 Stories" },
];
