# Marketbing — AI Marketing Operations Platform (Prototype)

A working web prototype of an AI-powered end-to-end marketing management
platform. The core idea:

> The business owner manages the **objective** and the **approvals** —
> the system manages the marketing **operations**.

```
Business objective → required information → AI analysis → marketing strategies
→ holistic plan → multiple execution options → user selects plan → execute
→ autonomous execution → human approval when required → completion / results
```

**This is a prototype/demonstration, not a production implementation.**
All data is local mock data — no influencer APIs, no email sending, no ad
platforms, no payments, no external communication of any kind.

## Running it

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production build
npm run preview    # serve the production build
```

## Modules

1. **Automatic Planning & Execution** — fully interactive (this prototype).
2. **Influencer Marketplace** — visible in navigation, marked *Coming Soon*.
3. **Finance, Sales & Products** — visible in navigation, marked *Coming Soon*.

Modules 2 and 3 exist only to communicate the overall product architecture.

## The demo journey

1. Enter an objective (or click a pre-created prompt such as
   *"Create Marketing Plan"*). Demo scenario: the fictional brand
   **NovaSkin** launching its **Glow Serum** in India.
2. Click **Plan Workflow** — the system asks only for the context relevant
   to that objective (an influencer objective asks for less than a holistic
   plan; try different prompts to see the field set change).
3. Watch the AI planning state, then review the **Recommended Marketing
   Strategy** and three execution options: **Maximum Reach**, **Efficiency**
   and **Balanced** (all values are illustrative demo values).
4. Select a plan, review its full workflow, and click **Execute Plan**.
5. Watch the vertical execution timeline progress — independent steps run in
   parallel — until it pauses at the **PO approval** checkpoint.
6. **Approve** (execution resumes automatically) or **Reject** (execution
   halts until you review again). A second checkpoint gates campaign
   go-live, then execution runs to completion.

## Architecture

```
src/
  types.ts                     Entities: MarketingObjective, BusinessContext,
                               MarketingStrategy, MarketingPlan, Workflow,
                               WorkflowStep, Approval, Influencer, ExecutionStatus
  data/demo.ts                 Demo scenario, prompt templates, influencers
  lib/planner.ts               Deterministic mock AI planner — the seam where a
                               real LLM/planning service would plug in
  lib/useExecution.ts          Simulated autonomous execution engine
                               (dependency-driven, parallel, approval gates) —
                               replaceable by real backend job events
  components/                  Sidebar, icons
  pages/                       Dashboard, Coming Soon, Settings, Account
  modules/planning/            Module 1: ObjectiveInput, ContextForm,
                               AIPlanningState, PlansView, PlanDetail,
                               ExecutionView (timeline + approvals + stats)
```

Stack: React 18 + TypeScript + Tailwind CSS 4 + Vite. Local state only; no
backend, no API keys.
