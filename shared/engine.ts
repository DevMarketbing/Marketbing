import type { RunRecord, RunState, StepStatus } from "./types";

/**
 * Execution engine.
 *
 * A run's state is a pure function of (run record, approvals, now): each
 * step starts when all of its dependencies finish, runs for its duration,
 * and — if it requires approval — waits in `awaiting_approval` until a
 * human decision is recorded. No scheduler or timers are needed; the API
 * computes state on read, which makes the engine deterministic, restart-
 * safe and identical on the server and in the embedded runtime.
 *
 * In production, steps backed by real integrations would report their own
 * completion events; this timing model is the stand-in executor.
 */
export function computeRunState(run: RunRecord, now: number): RunState {
  const byId = new Map(run.steps.map((s) => [s.id, s]));
  const finishMemo = new Map<string, number | null>();

  // When a step finishes, or null if it hasn't (blocked, awaiting, rejected).
  function finishTime(id: string): number | null {
    if (finishMemo.has(id)) return finishMemo.get(id)!;
    finishMemo.set(id, null); // guard against dependency cycles
    const step = byId.get(id)!;
    const start = startTime(id);
    let result: number | null = null;
    if (start !== null) {
      const ready = start + step.durationMs;
      if (step.requiresApproval) {
        const decision = run.approvals[id];
        if (decision?.decision === "approved") {
          result = Math.max(ready, decision.at);
        }
      } else {
        result = ready;
      }
      if (result !== null && result > now) result = null; // not finished yet
    }
    finishMemo.set(id, result);
    return result;
  }

  function startTime(id: string): number | null {
    const step = byId.get(id)!;
    if (step.dependsOn.length === 0) return run.startedAt;
    let latest = run.startedAt;
    for (const dep of step.dependsOn) {
      const f = finishTime(dep);
      if (f === null) return null;
      if (f > latest) latest = f;
    }
    return latest;
  }

  const statuses: Record<string, StepStatus> = {};
  for (const step of run.steps) {
    const start = startTime(step.id);
    if (start === null || now < start) {
      statuses[step.id] = "pending";
      continue;
    }
    const ready = start + step.durationMs;
    if (now < ready) {
      statuses[step.id] = "in_progress";
      continue;
    }
    if (step.requiresApproval) {
      const decision = run.approvals[step.id];
      if (!decision) statuses[step.id] = "awaiting_approval";
      else if (decision.decision === "rejected") statuses[step.id] = "rejected";
      else statuses[step.id] = now >= Math.max(ready, decision.at) ? "completed" : "in_progress";
      continue;
    }
    statuses[step.id] = "completed";
  }

  const completed = run.steps.filter((s) => statuses[s.id] === "completed").length;
  const awaiting = run.steps.find((s) => statuses[s.id] === "awaiting_approval");
  const rejected = run.steps.find((s) => statuses[s.id] === "rejected");
  const current = awaiting ?? run.steps.find((s) => statuses[s.id] === "in_progress");

  return {
    run,
    statuses,
    completed,
    total: run.steps.length,
    currentStepId: current?.id ?? null,
    awaitingStepId: awaiting?.id ?? null,
    rejectedStepId: rejected?.id ?? null,
    done: completed === run.steps.length,
  };
}

export type ApprovalAction = "approve" | "reject" | "reopen";

/** Apply a human decision to a run's approval step. Mutates and returns run. */
export function applyApproval(run: RunRecord, stepId: string, action: ApprovalAction, now: number): RunRecord {
  const step = run.steps.find((s) => s.id === stepId);
  if (!step?.requiresApproval) {
    throw new Error(`Step "${stepId}" does not exist or does not take approvals`);
  }
  if (action === "reopen") {
    delete run.approvals[stepId];
  } else {
    run.approvals[stepId] = { decision: action === "approve" ? "approved" : "rejected", at: now };
  }
  return run;
}
