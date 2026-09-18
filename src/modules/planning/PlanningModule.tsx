import { useCallback, useState } from "react";
import type {
  AnalyzeResponse,
  BusinessContext,
  MarketingPlan,
  PlansResponse,
} from "../../types";
import { api } from "../../api";
import ObjectiveInput from "./ObjectiveInput";
import ContextForm from "./ContextForm";
import AIPlanningState from "./AIPlanningState";
import PlansView from "./PlansView";
import PlanDetail from "./PlanDetail";
import ExecutionView from "./ExecutionView";

type Stage = "objective" | "context" | "analyzing" | "plans" | "detail" | "executing";

/**
 * Module 1 — Automatic Planning & Execution.
 * Stage machine over the planning API: objective → conditional context →
 * AI analysis → plan options → plan detail → server-driven execution run.
 */
export default function PlanningModule() {
  const [stage, setStage] = useState<Stage>("objective");
  const [objective, setObjective] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [context, setContext] = useState<BusinessContext>({});
  const [plansResp, setPlansResp] = useState<PlansResponse | null>(null);
  const [phasesDone, setPhasesDone] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<MarketingPlan | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => {
    setError((e as Error).message || "Something went wrong — is the API server running?");
    setBusy(false);
  };

  const handlePlanWorkflow = async (text: string) => {
    setBusy(true);
    setError(null);
    try {
      const a = await api.analyzeObjective(text);
      setObjective(text);
      setAnalysis(a);
      setStage("context");
    } catch (e) {
      fail(e);
      return;
    }
    setBusy(false);
  };

  const handleContextSubmit = async (ctx: BusinessContext) => {
    if (!analysis) return;
    setContext(ctx);
    setPlansResp(null);
    setPhasesDone(false);
    setStage("analyzing");
    setError(null);
    try {
      const plans = await api.getPlans(analysis.kind);
      setPlansResp(plans);
    } catch (e) {
      fail(e);
      setStage("context");
    }
  };

  // Plans stage begins once the analysis animation AND the API both finish.
  const handlePhasesDone = useCallback(() => setPhasesDone(true), []);
  if (stage === "analyzing" && phasesDone && plansResp) {
    setStage("plans");
    setPhasesDone(false);
  }

  const handleExecute = async () => {
    if (!analysis || !selectedPlan) return;
    setBusy(true);
    setError(null);
    try {
      const run = await api.createRun({
        objective,
        kind: analysis.kind,
        planId: selectedPlan.id,
        context,
      });
      setRunId(run.run.id);
      setStage("executing");
    } catch (e) {
      fail(e);
      return;
    }
    setBusy(false);
  };

  const restart = () => {
    setStage("objective");
    setObjective("");
    setAnalysis(null);
    setContext({});
    setPlansResp(null);
    setSelectedPlan(null);
    setRunId(null);
    setError(null);
  };

  const errorBanner = error && (
    <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-8">
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
        {error}
      </div>
    </div>
  );

  switch (stage) {
    case "objective":
      return (
        <>
          {errorBanner}
          <ObjectiveInput initialValue={objective} busy={busy} onPlan={handlePlanWorkflow} />
        </>
      );
    case "context":
      return analysis ? (
        <>
          {errorBanner}
          <ContextForm
            objective={objective}
            note={analysis.note}
            fields={analysis.fields}
            onBack={() => setStage("objective")}
            onSubmit={handleContextSubmit}
          />
        </>
      ) : null;
    case "analyzing":
      return <AIPlanningState onDone={handlePhasesDone} />;
    case "plans":
      return plansResp ? (
        <PlansView
          summary={plansResp.summary}
          strategies={plansResp.strategies}
          plans={plansResp.plans}
          onBack={() => setStage("context")}
          onSelect={(plan) => {
            setSelectedPlan(plan);
            setStage("detail");
          }}
        />
      ) : null;
    case "detail":
      return selectedPlan ? (
        <>
          {errorBanner}
          <PlanDetail
            plan={selectedPlan}
            executing={busy}
            onBack={() => setStage("plans")}
            onExecute={handleExecute}
          />
        </>
      ) : null;
    case "executing":
      return selectedPlan && runId && analysis ? (
        <ExecutionView
          key={runId}
          runId={runId}
          plan={selectedPlan}
          kind={analysis.kind}
          onRestart={restart}
        />
      ) : null;
  }
}
