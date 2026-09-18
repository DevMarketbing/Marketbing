import type { WorkflowStep } from "../../types";

/**
 * Groups an ordered step list into rows for the vertical timeline:
 * consecutive steps sharing a parallelGroup form one row and render
 * side by side; everything else renders as a single-step row.
 */
export function groupSteps(steps: WorkflowStep[]): WorkflowStep[][] {
  const rows: WorkflowStep[][] = [];
  for (const step of steps) {
    const last = rows[rows.length - 1];
    if (
      step.parallelGroup &&
      last &&
      last[0].parallelGroup === step.parallelGroup
    ) {
      last.push(step);
    } else {
      rows.push([step]);
    }
  }
  return rows;
}
