/**
 * Core prototype entities.
 *
 * Everything here is backed by local mock data. The mock planner
 * (src/lib/planner.ts) and the simulated execution engine
 * (src/lib/useExecution.ts) are the two layers that would be replaced
 * by real AI / API services in a production implementation.
 */

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
  /** Simulated execution time in ms once the step starts. */
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

export interface Workflow {
  planId: string;
  steps: WorkflowStep[];
}

export interface Approval {
  stepId: string;
  title: string;
  message: string;
}

export interface Influencer {
  id: string;
  name: string;
  handle: string;
  niche: string;
  followers: string;
  engagement: string;
  poAmountLakh: number;
  deliverables: string;
}

export interface ExecutionStatus {
  completed: number;
  total: number;
  currentStep?: WorkflowStep;
  awaitingApproval: boolean;
  rejected: boolean;
  done: boolean;
}
