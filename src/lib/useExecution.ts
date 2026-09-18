import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ExecutionStatus, StepStatus, WorkflowStep } from "../types";

/**
 * Simulated autonomous execution engine.
 *
 * Steps start as soon as their dependencies complete (independent steps run
 * in parallel), run for their simulated duration, then either complete or
 * pause in `awaiting_approval` until a human decision arrives. In a real
 * implementation this state machine would be driven by backend job events
 * rather than timers.
 */
export function useExecution(steps: WorkflowStep[], started: boolean) {
  const [statuses, setStatuses] = useState<Record<string, StepStatus>>(() =>
    Object.fromEntries(steps.map((s) => [s.id, "pending"])),
  );
  const timers = useRef<Map<string, number>>(new Map());

  // Kick off any pending step whose dependencies are all complete.
  useEffect(() => {
    if (!started) return;
    const anyRejected = Object.values(statuses).includes("rejected");
    if (anyRejected) return; // execution halted until the user reconsiders
    for (const step of steps) {
      if (
        statuses[step.id] === "pending" &&
        step.dependsOn.every((d) => statuses[d] === "completed")
      ) {
        setStatuses((prev) =>
          prev[step.id] === "pending" ? { ...prev, [step.id]: "in_progress" } : prev,
        );
      }
    }
  }, [started, statuses, steps]);

  // Schedule completion (or approval pause) for running steps.
  useEffect(() => {
    for (const step of steps) {
      if (statuses[step.id] === "in_progress" && !timers.current.has(step.id)) {
        const t = window.setTimeout(() => {
          timers.current.delete(step.id);
          setStatuses((prev) => ({
            ...prev,
            [step.id]: step.requiresApproval ? "awaiting_approval" : "completed",
          }));
        }, step.durationMs);
        timers.current.set(step.id, t);
      }
    }
  }, [statuses, steps]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((id) => clearTimeout(id));
      t.clear();
    };
  }, []);

  const approve = useCallback((stepId: string) => {
    setStatuses((prev) => ({ ...prev, [stepId]: "completed" }));
  }, []);

  const reject = useCallback((stepId: string) => {
    setStatuses((prev) => ({ ...prev, [stepId]: "rejected" }));
  }, []);

  const reconsider = useCallback((stepId: string) => {
    setStatuses((prev) => ({ ...prev, [stepId]: "awaiting_approval" }));
  }, []);

  const status: ExecutionStatus = useMemo(() => {
    const completed = steps.filter((s) => statuses[s.id] === "completed").length;
    const currentStep =
      steps.find((s) => statuses[s.id] === "awaiting_approval") ??
      steps.find((s) => statuses[s.id] === "in_progress");
    return {
      completed,
      total: steps.length,
      currentStep,
      awaitingApproval: steps.some((s) => statuses[s.id] === "awaiting_approval"),
      rejected: steps.some((s) => statuses[s.id] === "rejected"),
      done: completed === steps.length,
    };
  }, [statuses, steps]);

  return { statuses, status, approve, reject, reconsider };
}
