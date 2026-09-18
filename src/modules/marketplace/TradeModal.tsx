import { useState } from "react";
import type { InfluencerSummary, Wallet } from "../../types";
import { api } from "../../api";
import { Avatar, fmtLakh } from "./bits";
import { CloseIcon } from "../../components/Icons";

interface TradeModalProps {
  summary: InfluencerSummary;
  wallet: Wallet;
  type: "invest" | "divest";
  onClose: () => void;
  onDone: () => void;
}

/** Invest/divest dialog — moves capital between the wallet and a position. */
export default function TradeModal({ summary, wallet, type, onClose, onDone }: TradeModalProps) {
  const isInvest = type === "invest";
  const max = isInvest ? wallet.balanceLakh : summary.investedLakh;
  const [amount, setAmount] = useState<string>(() => String(Math.min(1, max) || 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && parsed <= max;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.trade(summary.profile.id, type, parsed);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md animate-fade-up rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar profile={summary.profile} size={40} />
            <div>
              <div className="text-base font-bold text-slate-900">
                {isInvest ? "Invest in" : "Divest from"} {summary.profile.name}
              </div>
              <div className="text-xs text-slate-400">
                {summary.profile.handle} · currently {fmtLakh(summary.investedLakh)} invested
              </div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:text-slate-700" aria-label="Close">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          <label htmlFor="trade-amount" className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Amount (₹ lakh)
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="trade-amount"
              type="number"
              min={0.1}
              step={0.1}
              max={max}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-lg font-bold text-slate-900 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={() => setAmount(String(max))}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
            >
              Max
            </button>
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>
              {isInvest ? "Wallet balance" : "Invested in this influencer"}:{" "}
              <strong className="text-slate-600">{fmtLakh(max)}</strong>
            </span>
            {!valid && amount !== "" && (
              <span className="font-medium text-rose-500">
                {parsed > max ? `Max ${fmtLakh(max)}` : "Enter a positive amount"}
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-500">
          {isInvest
            ? "Funds move from your wallet into this influencer's allocation. The platform deploys allocated capital into campaign purchase orders as workflows execute."
            : "Unallocated funds return to your wallet. Committed purchase orders already in flight are unaffected."}
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className={`rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
              isInvest
                ? "bg-indigo-600 shadow-indigo-500/25 hover:bg-indigo-500"
                : "bg-rose-600 shadow-rose-500/25 hover:bg-rose-500"
            }`}
          >
            {busy ? "Processing…" : isInvest ? `Invest ${valid ? fmtLakh(parsed) : ""}` : `Divest ${valid ? fmtLakh(parsed) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
