import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketingPlan, ObjectiveKind, RunState, StepStatus, WorkflowStep } from "../../types";
import { api } from "../../api";
import { groupSteps } from "./workflowLayout";
import { poLines } from "../../data/demo";
import { AlertIcon, CheckIcon, ClockIcon, SparkIcon } from "../../components/Icons";

interface ExecutionViewProps {
  runId: string;
  plan: MarketingPlan;
  kind: ObjectiveKind;
  onRestart: () => void;
}

/** Polls the API for run state; approvals round-trip through the server. */
function useRunState(runId: string) {
  const [state, setState] = useState<RunState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (doneRef.current) return;
      try {
        const s = await api.getRun(runId);
        if (cancelled) return;
        setState(s);
        setError(null);
        if (s.done) doneRef.current = true;
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    tick();
    const iv = setInterval(tick, 800);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [runId]);

  const decide = useCallback(
    async (stepId: string, action: "approve" | "reject" | "reopen") => {
      try {
        const s = await api.decideApproval(runId, stepId, action);
        setState(s);
        if (s.done) doneRef.current = true;
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [runId],
  );

  return { state, error, decide };
}

export default function ExecutionView({ runId, plan, kind, onRestart }: ExecutionViewProps) {
  const { state, error, decide } = useRunState(runId);

  if (!state) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  const { statuses } = state;
  const steps = state.run.steps;
  const rows = groupSteps(steps);
  const progressPct = Math.round((state.completed / state.total) * 100);
  const awaitingStep = steps.find((s) => s.id === state.awaitingStepId) ?? null;
  const rejectedStep = steps.find((s) => s.id === state.rejectedStepId) ?? null;
  const currentStep = steps.find((s) => s.id === state.currentStepId) ?? null;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up px-4 py-10 sm:px-8">
      {/* Header / overall status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            {state.done ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 animate-pop-in">
                <CheckIcon className="h-4 w-4" />
              </span>
            ) : (
              <span className="relative flex h-3 w-3">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    rejectedStep ? "bg-rose-400" : awaitingStep ? "bg-amber-400 animate-ping" : "bg-indigo-400 animate-ping"
                  }`}
                />
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    rejectedStep ? "bg-rose-500" : awaitingStep ? "bg-amber-500" : "bg-indigo-500"
                  }`}
                />
              </span>
            )}
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              {state.done
                ? "Execution completed"
                : rejectedStep
                  ? "Execution halted"
                  : awaitingStep
                    ? "Execution paused — approval required"
                    : "Campaign execution in progress"}
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {state.run.planName} · {state.completed} of {state.total} steps completed
            {currentStep && !state.done && (
              <span className="text-slate-400"> · current: {currentStep.title}</span>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-slate-900">{progressPct}%</div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Overall progress
          </div>
        </div>
      </div>

      <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            state.done
              ? "bg-gradient-to-r from-emerald-500 to-teal-500"
              : "bg-gradient-to-r from-indigo-500 to-violet-500 progress-active"
          }`}
          style={{ width: `${Math.max(progressPct, 3)}%` }}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      <ExecutionStats statuses={statuses} kind={kind} plan={plan} />

      {awaitingStep && (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 animate-fade-up">
          <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="text-sm leading-relaxed text-amber-900">
            <span className="font-semibold">Approval required. </span>
            Autonomous execution is paused at &ldquo;{awaitingStep.title}&rdquo; and will resume
            the moment you decide. Review the details below.
          </div>
        </div>
      )}
      {rejectedStep && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 animate-fade-up">
          <div className="flex items-start gap-3">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
            <div className="flex-1 text-sm leading-relaxed text-rose-900">
              <span className="font-semibold">You rejected &ldquo;{rejectedStep.title}&rdquo;. </span>
              Execution is halted — nothing has been sent or committed. You can re-open the
              request to review it again.
            </div>
            <button
              onClick={() => decide(rejectedStep.id, "reopen")}
              className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
            >
              Review again
            </button>
          </div>
        </div>
      )}

      {/* Vertical workflow timeline */}
      <div className="mt-8">
        {rows.map((row, ri) => (
          <div key={ri}>
            {ri > 0 && <Connector active={row.some((s) => statuses[s.id] !== "pending")} />}
            {row.length > 1 ? (
              <div className="relative">
                <div className="absolute -left-1 top-3 hidden text-[9px] font-bold uppercase tracking-widest text-slate-300 sm:block sm:-rotate-90 sm:-translate-x-8">
                  Parallel
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {row.map((step) => (
                    <StepCard key={step.id} step={step} status={statuses[step.id]} compact />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <StepCard step={row[0]} status={statuses[row[0].id]} />
                {statuses[row[0].id] === "awaiting_approval" && (
                  <ApprovalCard
                    step={row[0]}
                    plan={plan}
                    kind={kind}
                    onApprove={() => decide(row[0].id, "approve")}
                    onReject={() => decide(row[0].id, "reject")}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {state.done && (
        <div className="mt-10 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-6 text-white shadow-xl shadow-emerald-500/20 animate-fade-up sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-lg font-bold">Execution completed</div>
              <div className="text-sm text-emerald-100">
                All workflow steps finished. Campaign performance now tracks in the Influencer
                Marketplace.
              </div>
            </div>
          </div>
          <button
            onClick={onRestart}
            className="mt-5 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 shadow hover:bg-emerald-50"
          >
            Start a new objective
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- timeline pieces ---------- */

function Connector({ active }: { active: boolean }) {
  return (
    <div className="ml-4.5 h-6 w-px sm:ml-5" style={{ background: active ? "#818cf8" : "#cbd5e1" }} />
  );
}

function StepCard({
  step,
  status,
  compact,
}: {
  step: WorkflowStep;
  status: StepStatus;
  compact?: boolean;
}) {
  const isDone = status === "completed";
  const isActive = status === "in_progress";
  const isAwaiting = status === "awaiting_approval";
  const isRejected = status === "rejected";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 transition-all duration-500 ${
        isDone
          ? "border-emerald-200 bg-white shadow-sm"
          : isActive
            ? "border-indigo-300 bg-indigo-50/60 shadow-md shadow-indigo-500/10"
            : isAwaiting
              ? "border-amber-300 bg-amber-50/70 shadow-md shadow-amber-500/10"
              : isRejected
                ? "border-rose-300 bg-rose-50/70"
                : "border-slate-200 bg-slate-50/50 opacity-70"
      } ${compact ? "h-full" : ""}`}
    >
      <StatusBadge status={status} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${status === "pending" ? "text-slate-400" : "text-slate-800"}`}>
          {step.title}
        </div>
        {!compact || status !== "pending" ? (
          <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{step.description}</div>
        ) : null}
        {isDone && step.completedDetail && (
          <div className="mt-1.5 inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100 animate-fade-up">
            {step.completedDetail}
          </div>
        )}
        {isActive && (
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-500 animate-soft-pulse">
            In progress…
          </div>
        )}
        {isAwaiting && (
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            Awaiting your approval
          </div>
        )}
        {isRejected && (
          <div className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-600">
            Rejected — execution halted
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: StepStatus }) {
  switch (status) {
    case "completed":
      return (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm animate-pop-in">
          <CheckIcon className="h-3.5 w-3.5" />
        </span>
      );
    case "in_progress":
      return (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        </span>
      );
    case "awaiting_approval":
      return (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm">
          <ClockIcon className="h-4 w-4" />
        </span>
      );
    case "rejected":
      return (
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white">
          <AlertIcon className="h-3.5 w-3.5" />
        </span>
      );
    default:
      return <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full border-2 border-slate-300 bg-white" />;
  }
}

/* ---------- approval checkpoint ---------- */

function ApprovalCard({
  step,
  plan,
  kind,
  onApprove,
  onReject,
}: {
  step: WorkflowStep;
  plan: MarketingPlan;
  kind: ObjectiveKind;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isPO = step.id === "po_approval";
  const isSend = step.id === "send_approval";
  const poTotal = poLines.reduce((sum, i) => sum + i.poAmountLakh, 0);

  return (
    <div className="ml-0 mt-3 overflow-hidden rounded-2xl border-2 border-amber-300 bg-white shadow-xl shadow-amber-500/10 animate-fade-up sm:ml-9">
      <div className="border-b border-amber-100 bg-amber-50 px-5 py-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
          Approval required
        </div>
        <div className="mt-0.5 text-base font-bold text-slate-900">
          {isPO
            ? "Review purchase orders before they are sent"
            : isSend
              ? "Review the discount campaign before it is sent"
              : "Confirm campaign go-live"}
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-amber-900/80">
          {isPO
            ? "The system has prepared purchase orders for the selected influencers. Review and approve before they are sent."
            : isSend
              ? "The discount reduces margin and the send is a commitment to your customers. Nothing goes out until you approve."
              : "Approving publishes the campaign publicly across all confirmed channels."}
        </p>
      </div>

      <div className="px-5 py-4">
        {isPO ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    <th className="pb-2 pr-3">Influencer</th>
                    <th className="pb-2 pr-3">Followers</th>
                    <th className="pb-2 pr-3">Engagement</th>
                    <th className="pb-2 pr-3">Deliverables</th>
                    <th className="pb-2 text-right">PO amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {poLines.map((inf) => (
                    <tr key={inf.id}>
                      <td className="py-2.5 pr-3">
                        <div className="font-semibold text-slate-800">{inf.name}</div>
                        <div className="text-xs text-slate-400">
                          {inf.handle} · {inf.niche}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{inf.followers}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{inf.engagement}</td>
                      <td className="py-2.5 pr-3 text-xs text-slate-600">{inf.deliverables}</td>
                      <td className="py-2.5 text-right font-semibold text-slate-800">
                        ₹{inf.poAmountLakh}L
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={4} className="pt-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Total commitment
                    </td>
                    <td className="pt-2.5 text-right text-base font-bold text-slate-900">
                      ₹{poTotal.toFixed(1)}L
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Approved influencers appear in your Influencer Marketplace portfolio.
            </p>
          </>
        ) : isSend ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <ApprovalFact label="Recipients" value="96,400" note="3 segments" />
            <ApprovalFact label="Offer" value="15% off" note="30-day window" />
            <ApprovalFact label="Est. margin impact" value="₹2.1L" note="projected" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <ApprovalFact label="Confirmed creators" value="4" note="content scheduled" />
            <ApprovalFact label="Committed budget" value={`₹${plan.metrics.budgetLakh}L`} note="within approved plan" />
            <ApprovalFact label="Channels" value={kind === "email" ? "Email" : "IG + Meta"} note="go live on approval" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-5 py-4">
        <button
          onClick={onReject}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600"
        >
          Reject
        </button>
        <button
          onClick={onApprove}
          className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-500/25 hover:brightness-110"
        >
          Approve
        </button>
      </div>
    </div>
  );
}

function ApprovalFact({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-400">{note}</div>
    </div>
  );
}

/* ---------- live stats strip ---------- */

function ExecutionStats({
  statuses,
  kind,
  plan,
}: {
  statuses: Record<string, StepStatus>;
  kind: ObjectiveKind;
  plan: MarketingPlan;
}) {
  const [responses, setResponses] = useState(0);
  const responsesRunning = statuses["responses"] === "in_progress";
  const responsesDone = statuses["responses"] === "completed";
  const target = kind === "email" ? 39500 : 4;

  useEffect(() => {
    if (responsesDone) {
      setResponses(target);
      return;
    }
    if (!responsesRunning) return;
    const iv = setInterval(() => {
      setResponses((r) => Math.min(r + Math.max(1, Math.round(target / 8)), target));
    }, 650);
    return () => clearInterval(iv);
  }, [responsesRunning, responsesDone, target]);

  const contacted =
    statuses[kind === "email" ? "send" : "po_send"] === "completed"
      ? kind === "email"
        ? "96,400"
        : "5"
      : "—";
  const accepted =
    statuses[kind === "email" ? "followup" : "accepted"] === "completed"
      ? kind === "email"
        ? "7,900"
        : "4"
      : "—";

  const labels =
    kind === "email"
      ? { a: "Emails sent", b: "Opens", c: "Redemptions" }
      : { a: "Influencers contacted", b: "Responses", c: "Accepted" };

  return (
    <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile label="Plan budget" value={`₹${plan.metrics.budgetLakh}L`} />
      <StatTile label={labels.a} value={contacted} />
      <StatTile
        label={labels.b}
        value={responses > 0 ? responses.toLocaleString("en-IN") : "—"}
        live={responsesRunning}
      />
      <StatTile label={labels.c} value={accepted} />
    </div>
  );
}

function StatTile({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
        {live && <SparkIcon className="h-3 w-3 text-indigo-400 animate-soft-pulse" />}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
