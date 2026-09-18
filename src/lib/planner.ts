import type {
  ContextField,
  MarketingPlan,
  MarketingStrategy,
  ObjectiveKind,
  Workflow,
  WorkflowStep,
} from "../types";
import { demoScenario } from "../data/demo";

/**
 * Deterministic mock AI planner.
 *
 * This module is the seam where a real LLM / planning service would be
 * plugged in later: classifyObjective(), getRequiredFields(),
 * buildStrategySummary(), buildPlans() and buildWorkflow() are the calls
 * a production implementation would route to an AI backend. No API keys,
 * no network — everything is derived deterministically from the objective.
 */

export function classifyObjective(text: string): ObjectiveKind {
  const t = text.toLowerCase();
  if (/influencer|creator|collab/.test(t)) return "influencer";
  if (/email|discount|offer|coupon|newsletter/.test(t)) return "email";
  return "holistic";
}

const F = (
  id: string,
  category: string,
  label: string,
  prefill: string,
  opts: Partial<ContextField> = {},
): ContextField => ({
  id,
  category,
  label,
  prefill,
  type: opts.type ?? "text",
  ...opts,
});

/**
 * Objective-first information collection: only the categories relevant to
 * the classified objective are requested. Prefills come from the demo
 * scenario so the flow can be walked through quickly.
 */
export function getRequiredFields(kind: ObjectiveKind): ContextField[] {
  const outcome = F(
    "desiredOutcome",
    "B · Desired Outcome",
    "What measurable result do you want?",
    demoScenario.desiredOutcome,
    { helper: "Revenue, orders, customers, reach or leads." },
  );
  const products = F(
    "products",
    "C · Products / Services",
    "What are you marketing?",
    demoScenario.products,
    { type: "textarea" },
  );
  const targetMarket = F(
    "targetMarket",
    "D · Target Market",
    "Region and target audience",
    `${demoScenario.region} — ${demoScenario.targetAudience}`,
    { type: "textarea", helper: "Geography, demographics and audience characteristics." },
  );
  const existing = F(
    "existingCustomers",
    "E · Existing Customer Profile",
    "Who currently buys from you?",
    demoScenario.existingCustomers,
  );
  const currentMarketing = F(
    "currentMarketing",
    "F · Current Marketing Setup",
    "What marketing do you run today?",
    demoScenario.currentMarketing,
    { type: "textarea", helper: "Active channels, campaigns and current performance." },
  );
  const budget = F(
    "budget",
    "G · Budget",
    "Available budget for this objective",
    demoScenario.budget,
    { helper: "Historical spend is shown below for context." },
  );
  const timeline = F(
    "timeline",
    "H · Timeline",
    "Timeline or deadline",
    demoScenario.timeline,
    { helper: "Launch date, campaign duration or an associated event." },
  );
  const competitors = F(
    "competitors",
    "I · Competition",
    "Who are your main competitors?",
    demoScenario.competitors,
  );
  const brand = F(
    "brandMessaging",
    "J · Brand Guidelines",
    "Brand positioning, key messages and tone",
    demoScenario.brandMessaging,
    { type: "textarea" },
  );
  const assets = F(
    "assets",
    "K · Available Assets",
    "Existing assets and resources we can use",
    demoScenario.assets,
    { type: "textarea" },
  );
  const restrictions = F(
    "restrictions",
    "L · Restrictions",
    "Anything we must not do? (optional)",
    demoScenario.restrictions,
    {
      optional: true,
      helper: "Excluded channels, influencer restrictions, promotional limits.",
    },
  );

  switch (kind) {
    case "influencer":
      // Influencer campaign → influencer-relevant context only.
      return [outcome, products, targetMarket, budget, timeline, brand, assets, restrictions];
    case "email":
      // Email/discount campaign → existing-audience context, no competitor research.
      return [outcome, products, existing, currentMarketing, budget, timeline, brand, restrictions];
    case "holistic":
    default:
      // Full marketing plan → broader business context.
      return [
        outcome,
        products,
        targetMarket,
        existing,
        currentMarketing,
        budget,
        timeline,
        competitors,
        brand,
        assets,
        restrictions,
      ];
  }
}

export function getConditionalNote(kind: ObjectiveKind): string {
  switch (kind) {
    case "influencer":
      return "Your objective is influencer-led, so we're only asking for context relevant to an influencer campaign — audience, budget, timeline and brand guidelines. Broader business context isn't needed.";
    case "email":
      return "Your objective targets your existing audience, so we're asking about current customers and channels rather than competitor or acquisition context.";
    default:
      return "You've asked for a holistic marketing plan, so we're requesting broader business context. Only the fields relevant to this objective are shown — nothing else.";
  }
}

/** Simulated AI analysis phases shown during planning. */
export const planningPhases = [
  "Understanding your objective...",
  "Analyzing your audience...",
  "Evaluating marketing strategies...",
  "Building your execution workflow...",
  "Preparing execution options...",
];

export function buildStrategySummary(kind: ObjectiveKind): string {
  switch (kind) {
    case "influencer":
      return "Based on your objective, audience, budget and timeline, the recommended approach centres on influencer-led acquisition, amplified with targeted paid promotion and supported by conversion-focused landing content.";
    case "email":
      return "Based on your existing audience and objective, the recommended approach combines segmented discount emails, re-engagement of lapsed customers and social proof content to reinforce the offer.";
    default:
      return "Based on your objective, audience, budget and timeline, the recommended approach combines influencer-led acquisition, targeted digital promotion and customer re-engagement.";
  }
}

const strategy = (
  id: string,
  name: string,
  executable: boolean,
  rationale: string,
): MarketingStrategy => ({ id, name, executable, rationale });

export function buildStrategies(kind: ObjectiveKind): MarketingStrategy[] {
  const influencer = strategy(
    "influencer",
    "Influencer Marketing",
    true,
    "Creators aged 18–30 in beauty/skincare drive the strongest new-customer acquisition for this audience.",
  );
  const paid = strategy(
    "paid",
    "Paid Advertising",
    true,
    "Meta and Instagram ads retarget influencer audiences and scale proven creative.",
  );
  const email = strategy(
    "email",
    "Email Marketing",
    true,
    "Your existing subscriber base can be re-engaged at near-zero incremental cost.",
  );
  const offers = strategy(
    "offers",
    "Launch Offer",
    true,
    "A time-bound launch discount creates urgency within the 60-day window.",
  );
  const content = strategy(
    "content",
    "Organic Social & Content",
    false,
    "Supports the campaign but requires your content team — outside platform execution today.",
  );
  const affiliate = strategy(
    "affiliate",
    "Affiliate Marketing",
    false,
    "Worth piloting after launch; currently outside platform execution capability.",
  );

  switch (kind) {
    case "influencer":
      return [influencer, paid, content];
    case "email":
      return [email, offers, content];
    default:
      return [influencer, paid, email, offers, content, affiliate];
  }
}

/**
 * Three execution options for the same strategy. Values are illustrative
 * demo values, not real-world predictions.
 */
export function buildPlans(kind: ObjectiveKind): MarketingPlan[] {
  const strategies = buildStrategies(kind);
  const pick = (...ids: string[]) => strategies.filter((s) => ids.includes(s.id));

  const isEmail = kind === "email";

  return [
    {
      id: "max-reach",
      name: "Maximum Reach",
      tagline: "Go broad, fast",
      description: isEmail
        ? "Send the offer to your full list, boost with paid social and add a broad win-back segment for maximum coverage."
        : "Deploy the full budget across a wide influencer roster and broad paid targeting to maximise audience coverage in 60 days.",
      metrics: {
        budgetLakh: 20,
        coverageM: 4.2,
        efficiencyPct: 62,
        influencerCount: isEmail ? 3 : 12,
      },
      strategies: isEmail
        ? pick("email", "offers", "content")
        : pick("influencer", "paid", "email"),
      keyActivities: isEmail
        ? [
            "Full-list discount email blast",
            "3 creator posts amplifying the offer",
            "Win-back segment for lapsed customers",
            "Paid social boost of the offer",
          ]
        : [
            "12 influencers across macro and mid tiers",
            "Broad Meta/Instagram prospecting ads",
            "Launch announcement to full email list",
            "Retargeting of all engaged audiences",
          ],
    },
    {
      id: "efficiency",
      name: "Efficiency",
      tagline: "Every rupee accountable",
      description: isEmail
        ? "Target only high-propensity segments with a tighter discount, prioritising margin over volume."
        : "Concentrate spend on a hand-picked set of high-engagement creators and tightly targeted ads for the best cost per acquisition.",
      metrics: {
        budgetLakh: 9.5,
        coverageM: 1.5,
        efficiencyPct: 91,
        influencerCount: isEmail ? 1 : 4,
      },
      strategies: isEmail
        ? pick("email", "offers")
        : pick("influencer", "paid"),
      keyActivities: isEmail
        ? [
            "High-propensity segment targeting",
            "Smaller, margin-safe discount",
            "Single creator testimonial",
            "Automated follow-up sequence",
          ]
        : [
            "4 high-engagement micro/mid influencers",
            "Narrow interest + lookalike ad targeting",
            "Conversion-optimised landing content",
            "Weekly spend reallocation to top performers",
          ],
    },
    {
      id: "balanced",
      name: "Balanced",
      tagline: "Coverage with control",
      recommended: true,
      description: isEmail
        ? "Segmented offers to engaged and lapsed customers with moderate paid amplification — a balance of reach and margin."
        : "A curated influencer roster plus focused paid promotion and email re-engagement — balancing coverage against efficiency.",
      metrics: {
        budgetLakh: 14,
        coverageM: 2.8,
        efficiencyPct: 78,
        influencerCount: isEmail ? 2 : 7,
      },
      strategies: isEmail
        ? pick("email", "offers", "content")
        : pick("influencer", "paid", "email"),
      keyActivities: isEmail
        ? [
            "Segmented discount emails (engaged + lapsed)",
            "2 creator posts for social proof",
            "Moderate paid amplification",
            "Post-purchase cross-sell email",
          ]
        : [
            "7 curated mid-tier influencers",
            "Focused Meta/Instagram campaigns",
            "Email re-engagement of existing customers",
            "Launch offer for first 30 days",
          ],
    },
  ];
}

/**
 * Strategy → workflow conversion. Steps carry dependencies so independent
 * tasks execute in parallel; steps with requiresApproval pause execution
 * until a human authorises them.
 */
export function buildWorkflow(plan: MarketingPlan, kind: ObjectiveKind): Workflow {
  const n = plan.metrics.influencerCount;

  if (kind === "email") {
    const steps: WorkflowStep[] = [
      {
        id: "segment",
        title: "Audience segments built",
        description: "Segmenting subscribers by engagement and purchase history.",
        dependsOn: [],
        durationMs: 2600,
        parallelGroup: "prep",
        completedDetail: "3 segments · 96,400 recipients",
      },
      {
        id: "offer",
        title: "Discount offer structured",
        description: "Sizing the discount against margin and objective.",
        dependsOn: [],
        durationMs: 3000,
        parallelGroup: "prep",
        completedDetail: "15% launch offer, 30-day window",
      },
      {
        id: "creative",
        title: "Email creative drafted",
        description: "Drafting subject lines and body copy in brand tone.",
        dependsOn: [],
        durationMs: 3400,
        parallelGroup: "prep",
        completedDetail: "2 variants for A/B test",
      },
      {
        id: "campaign_setup",
        title: "Campaign assembled",
        description: "Combining segments, offer and creative into a send plan.",
        dependsOn: ["segment", "offer", "creative"],
        durationMs: 2400,
      },
      {
        id: "send_approval",
        title: "Send approval",
        description:
          "The discount involves a cost and the send is a public commitment — your authorisation is required.",
        dependsOn: ["campaign_setup"],
        durationMs: 1200,
        requiresApproval: true,
      },
      {
        id: "send",
        title: "Emails sent",
        description: "Dispatching the campaign to approved segments.",
        dependsOn: ["send_approval"],
        durationMs: 2600,
        completedDetail: "96,400 emails dispatched",
      },
      {
        id: "responses",
        title: "Engagement tracked",
        description: "Monitoring opens, clicks and redemptions.",
        dependsOn: ["send"],
        durationMs: 5200,
        completedDetail: "41% opens · 8.2% clicks",
      },
      {
        id: "followup",
        title: "Follow-up sequence triggered",
        description: "Automated reminders to openers who haven't redeemed.",
        dependsOn: ["responses"],
        durationMs: 3000,
      },
      {
        id: "performance",
        title: "Performance tracked",
        description: "Attributing redemptions and revenue to the campaign.",
        dependsOn: ["followup"],
        durationMs: 3200,
        completedDetail: "₹6.8L attributed revenue (demo)",
      },
    ];
    return { planId: plan.id, steps };
  }

  const steps: WorkflowStep[] = [
    {
      id: "shortlist",
      title: "Influencers shortlisted",
      description: `Matching creators to your audience and shortlisting the top ${n}.`,
      dependsOn: [],
      durationMs: 3000,
      parallelGroup: "prep",
      completedDetail: `${n * 2} matched · ${n} shortlisted`,
    },
    {
      id: "contacts",
      title: "Contact information found",
      description: "Finding manager and business contacts for each creator.",
      dependsOn: [],
      durationMs: 3800,
      parallelGroup: "prep",
      completedDetail: `${n} contacts verified`,
    },
    {
      id: "requirements",
      title: "Campaign requirements prepared",
      description: "Defining deliverables, timelines and brand guidelines per creator.",
      dependsOn: [],
      durationMs: 3400,
      parallelGroup: "prep",
      completedDetail: "Briefs + usage rights defined",
    },
    {
      id: "po_create",
      title: "Purchase orders created",
      description: "Drafting a PO for each shortlisted influencer.",
      dependsOn: ["shortlist", "contacts", "requirements"],
      durationMs: 2600,
      completedDetail: `${Math.min(n, 5)} POs drafted`,
    },
    {
      id: "po_approval",
      title: "PO approval",
      description:
        "Money will be committed to third parties — your authorisation is required before POs are sent.",
      dependsOn: ["po_create"],
      durationMs: 1200,
      requiresApproval: true,
    },
    {
      id: "po_send",
      title: "POs sent to influencers",
      description: "Dispatching approved purchase orders to each creator's contact.",
      dependsOn: ["po_approval"],
      durationMs: 2400,
      completedDetail: `${Math.min(n, 5)} POs dispatched`,
    },
    {
      id: "responses",
      title: "Influencer responses received",
      description: "Tracking replies and negotiating within approved terms.",
      dependsOn: ["po_send"],
      durationMs: 6000,
      completedDetail: "4 of 5 responded",
    },
    {
      id: "accepted",
      title: "Influencers accepted",
      description: "Confirming accepted POs and locking content schedules.",
      dependsOn: ["responses"],
      durationMs: 2400,
      completedDetail: "4 creators confirmed",
    },
    {
      id: "golive_approval",
      title: "Go-live approval",
      description:
        "The campaign is about to go live publicly — final authorisation required.",
      dependsOn: ["accepted"],
      durationMs: 1000,
      requiresApproval: true,
    },
    {
      id: "campaign",
      title: "Campaign execution",
      description: "Creator posts go live; paid promotion amplifies top content.",
      dependsOn: ["golive_approval"],
      durationMs: 4600,
      parallelGroup: "live",
      completedDetail: "All deliverables live",
    },
    {
      id: "email_push",
      title: "Email re-engagement sent",
      description: "Launch announcement sent to your existing customers.",
      dependsOn: ["golive_approval"],
      durationMs: 3600,
      parallelGroup: "live",
      completedDetail: "120k subscribers reached",
    },
    {
      id: "performance",
      title: "Performance tracked",
      description: "Aggregating reach, engagement and attributed sales.",
      dependsOn: ["campaign", "email_push"],
      durationMs: 3400,
      completedDetail: "Live dashboard updating (demo)",
    },
  ];

  // Efficiency-style plans skip the email leg.
  if (!plan.strategies.some((s) => s.id === "email")) {
    const filtered = steps.filter((s) => s.id !== "email_push");
    const perf = filtered.find((s) => s.id === "performance");
    if (perf) perf.dependsOn = ["campaign"];
    return { planId: plan.id, steps: filtered };
  }

  return { planId: plan.id, steps };
}
