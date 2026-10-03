import { useState } from "react";
import { meta } from "../../api";
import { CAMPAIGN_OBJECTIVES, type AdCampaign, type MetaAdAccountSummary } from "../../../shared/metaTypes";
import StatTile from "../../components/StatTile";
import { ErrorNote, inputClass, primaryButton, useFormAction } from "../../auth/AuthGate";
import { Card, Dialog, fmtMoney, fmtNum, fmtPercent, Loading, Note, Picker, secondaryButton, useLoad } from "./common";

const objectiveLabel = (id: string) => CAMPAIGN_OBJECTIVES.find((o) => o.id === id)?.label ?? id.replace(/^OUTCOME_/, "").toLowerCase();

function StatusChip({ status }: { status: string }) {
  const tone =
    status === "ACTIVE"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status.includes("PAUSED")
        ? "bg-slate-100 text-slate-600 ring-slate-200"
        : "bg-amber-50 text-amber-700 ring-amber-200";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${tone}`}>
      {status.replace(/_/g, " ").toLowerCase()}
    </span>
  );
}

/** Your Meta ad accounts: last 30 days, campaigns, pause/start and new (paused) campaigns. */
export default function AdsPanel({ accounts }: { accounts: MetaAdAccountSummary[] }) {
  const [accountId, setAccountId] = useState(accounts[0].id);
  const { data, error, loading, reload } = useLoad(() => meta.ads(accountId), [accountId]);
  const [confirm, setConfirm] = useState<AdCampaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const setStatus = async (c: AdCampaign, status: "ACTIVE" | "PAUSED") => {
    setActionError(null);
    setBusyId(c.id);
    try {
      await meta.setCampaignStatus(accountId, c.id, status);
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const currency = data?.account.currency ?? accounts.find((a) => a.id === accountId)?.currency ?? "USD";
  const s = data?.summary;

  return (
    <div className="space-y-4">
      <Picker id="ad-account" label="Ad account" items={accounts} value={accountId} onChange={setAccountId} describe={(a) => `${a.name} (${a.currency})`} />
      <ErrorNote message={error ?? actionError} />
      {loading && !data && <Loading what="ads" />}
      {data && (
        <>
          {data.account.status !== 1 && (
            <Note tone="warn">Meta has paused or disabled this ad account. Check it in Meta Ads Manager → Account overview.</Note>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Spent" value={fmtMoney(s?.spend ?? 0, currency)} sub="Last 30 days" />
            <StatTile label="Impressions" value={fmtNum(s?.impressions ?? 0)} sub="Last 30 days" />
            <StatTile label="Reach" value={fmtNum(s?.reach ?? 0)} sub="Last 30 days" />
            <StatTile label="Clicks" value={fmtNum(s?.clicks ?? 0)} sub="Last 30 days" />
            <StatTile label="Click rate" value={fmtPercent(s?.ctr ?? 0, 2)} sub="Last 30 days" />
            <StatTile label="Cost per click" value={fmtMoney(s?.cpc ?? null, currency)} sub="Last 30 days" />
          </div>

          <Card
            title={`Campaigns (${data.campaigns.length})`}
            action={
              <button className={primaryButton} onClick={() => setCreating(true)}>
                New campaign
              </button>
            }
          >
            {data.campaigns.length === 0 && <p className="text-sm text-slate-500">No campaigns in this ad account yet.</p>}
            <ul className="divide-y divide-slate-100">
              {data.campaigns.map((c) => {
                const canStart = c.status === "PAUSED";
                const canPause = c.status === "ACTIVE";
                return (
                  <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center" data-campaign={c.id}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-800">{c.name}</span>
                        <StatusChip status={c.effectiveStatus} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                        <span>{objectiveLabel(c.objective)}</span>
                        {c.dailyBudget !== null && <span>{fmtMoney(c.dailyBudget, currency)}/day</span>}
                        {c.lifetimeBudget !== null && <span>{fmtMoney(c.lifetimeBudget, currency)} total</span>}
                        <span>Spent {fmtMoney(c.metrics?.spend ?? 0, currency)}</span>
                        <span>{fmtNum(c.metrics?.clicks ?? 0)} clicks</span>
                        <span>CTR {fmtPercent(c.metrics?.ctr ?? 0, 2)}</span>
                      </div>
                    </div>
                    {(canStart || canPause) && (
                      <button
                        className={secondaryButton}
                        disabled={busyId === c.id}
                        onClick={() => (canPause ? void setStatus(c, "PAUSED") : setConfirm(c))}
                      >
                        {busyId === c.id ? "Saving…" : canPause ? "Pause" : "Start"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          <p className="text-xs text-slate-400">
            Ad sets, audiences and ad designs are edited in Meta Ads Manager. Marketbing shows results and starts or pauses campaigns.
          </p>
        </>
      )}

      {confirm && (
        <Dialog title="Start this campaign?" onClose={() => setConfirm(null)}>
          <p className="text-sm text-slate-600">
            <b>{confirm.name}</b> will start running and <b>spending money</b> from this ad account
            {confirm.dailyBudget !== null ? `, up to ${fmtMoney(confirm.dailyBudget, currency)} a day` : ""}.
          </p>
          <div className="mt-5 flex gap-2">
            <button className={`${secondaryButton} flex-1`} onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              className={`${primaryButton} flex-1`}
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                void setStatus(c, "ACTIVE");
              }}
            >
              Start campaign
            </button>
          </div>
        </Dialog>
      )}
      {creating && (
        <NewCampaignDialog
          accountId={accountId}
          currency={currency}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function NewCampaignDialog({
  accountId,
  currency,
  onClose,
  onCreated,
}: {
  accountId: string;
  currency: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState<string>(CAMPAIGN_OBJECTIVES[1].id);
  const [budget, setBudget] = useState("");
  const { busy, error, run } = useFormAction();
  return (
    <Dialog title="New campaign" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={run(async () => {
          await meta.createCampaign(accountId, { name, objective, dailyBudget: budget ? Number(budget) : undefined });
          onCreated();
        })}
      >
        <label className="block text-sm font-medium text-slate-700">
          Name
          <input id="campaign-name" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Goal
          <select id="campaign-objective" value={objective} onChange={(e) => setObjective(e.target.value)} className={inputClass}>
            {CAMPAIGN_OBJECTIVES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Daily budget ({currency}, optional)
          <input
            id="campaign-budget"
            type="number"
            min="1"
            step="any"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-slate-400">Leave empty to set budgets per ad set in Ads Manager.</span>
        </label>
        <Note>The campaign is created <b>paused</b>, so nothing is spent. Add its ad sets and ads in Meta Ads Manager, then start it.</Note>
        <ErrorNote message={error} />
        <button className={`${primaryButton} w-full`} disabled={busy}>
          {busy ? "Creating…" : "Create paused campaign"}
        </button>
      </form>
    </Dialog>
  );
}
