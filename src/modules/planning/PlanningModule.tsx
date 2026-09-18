import { useMemo, useState } from "react";
import type { BusinessContext, MarketingPlan, ObjectiveKind } from "../../types";
import {
  buildPlans,
  buildWorkflow,
  classifyObjective,
  getRequiredFields,
} from "../../lib/planner";
import ObjectiveInput from "./ObjectiveInput";
import ContextForm from "./ContextForm";
import AIPlanningState from "./AIPlanningState";
import PlansView from "./PlansView";
import PlanDetail from "./PlanDetail";
import ExecutionView from "./ExecutionView";

type Stage = "objective" | "context" | "analyzing" | "plans" | "detail" | "executing";

/**
 * Module 1 — Automatic Planning & Execution.
 * Stage machine: objective → conditional context → AI analysis →
 * plan options → plan detail → simulated autonomous execution.
 */
export default function PlanningModule() {
  const [stage, setStage] = useState<Stage>("objective");
  const [objective, setObjective] = useState("");
  const [kind, setKind] = useState<ObjectiveKind>("holistic");
  const [, setContext] = useState<BusinessContext>({});
  const [selectedPlan, setSelectedPlan] = useState<MarketingPlan | null>(null);
  const [runId, setRunId] = useState(0);

  const fields = useMemo(() => getRequiredFields(kind), [kind]);
  const plans = useMemo(() => buildPlans(kind), [kind]);
  const workflow = useMemo(
    () => (selectedPlan ? buildWorkflow(selectedPlan, kind) : null),
    [selectedPlan, kind],
  );

  const handlePlanWorkflow = (text: string) => {
    setObjective(text);
    setKind(classifyObjective(text));
    setStage("context");
  };

  const restart = () => {
    setStage("objective");
    setObjective("");
    setSelectedPlan(null);
    setContext({});
    setRunId((r) => r + 1);
  };

  switch (stage) {
    case "objective":
      return <ObjectiveInput initialValue={objective} onPlan={handlePlanWorkflow} />;
    case "context":
      return (
        <ContextForm
          objective={objective}
          kind={kind}
          fields={fields}
          onBack={() => setStage("objective")}
          onSubmit={(ctx) => {
            setContext(ctx);
            setStage("analyzing");
          }}
        />
      );
    case "analyzing":
      return <AIPlanningState onDone={() => setStage("plans")} />;
    case "plans":
      return (
        <PlansView
          kind={kind}
          plans={plans}
          onBack={() => setStage("context")}
          onSelect={(plan) => {
            setSelectedPlan(plan);
            setStage("detail");
          }}
        />
      );
    case "detail":
      return selectedPlan && workflow ? (
        <PlanDetail
          plan={selectedPlan}
          workflow={workflow}
          onBack={() => setStage("plans")}
          onExecute={() => setStage("executing")}
        />
      ) : null;
    case "executing":
      return selectedPlan && workflow ? (
        <ExecutionView
          key={`${selectedPlan.id}-${runId}`}
          plan={selectedPlan}
          workflow={workflow}
          kind={kind}
          onRestart={restart}
        />
      ) : null;
  }
}
