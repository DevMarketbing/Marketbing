import { useState } from "react";
import { promptTemplates } from "../../data/planningContent";
import {
  ClipboardIcon,
  MailIcon,
  MegaphoneIcon,
  SparkIcon,
  ArrowRightIcon,
} from "../../components/Icons";

const templateIcons = {
  plan: ClipboardIcon,
  megaphone: MegaphoneIcon,
  mail: MailIcon,
};

interface ObjectiveInputProps {
  initialValue: string;
  busy?: boolean;
  onPlan: (objective: string) => void;
}

export default function ObjectiveInput({ initialValue, busy, onPlan }: ObjectiveInputProps) {
  const [value, setValue] = useState(initialValue);
  const canSubmit = value.trim().length >= 10 && !busy;

  return (
    <div className="mx-auto max-w-3xl animate-fade-up px-4 py-12 sm:px-8 sm:py-16">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-600 ring-1 ring-indigo-100">
          <SparkIcon className="h-3.5 w-3.5" />
          Automatic Planning &amp; Execution
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          What do you want to achieve?
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">
          Describe your marketing objective and we&apos;ll build the strategy and execution plan
          for you.
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg shadow-slate-900/5 focus-within:border-indigo-300 focus-within:ring-4 focus-within:ring-indigo-100">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          placeholder="Increase sales of our new skincare product among women aged 18–30 in India over the next 60 days."
          className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 px-2 pb-2">
          <span className="hidden text-xs text-slate-400 sm:block">
            The system determines the work — you manage the objective.
          </span>
          <button
            onClick={() => canSubmit && onPlan(value.trim())}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition-all hover:shadow-lg hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
          >
            {busy ? "Analyzing…" : "Plan Workflow"}
            <ArrowRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="text-center text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Or start from a shortcut
        </div>
        <div className="mt-3 flex flex-wrap justify-center gap-2.5">
          {promptTemplates.map((t) => {
            const Icon = templateIcons[t.icon];
            return (
              <button
                key={t.id}
                onClick={() => setValue(t.objective)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-slate-700 shadow-sm transition-all hover:border-indigo-300 hover:text-indigo-700 hover:shadow"
              >
                <Icon className="h-4 w-4 text-slate-400" />
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">
          Shortcuts pre-fill the objective — you can edit it before planning.
        </p>
      </div>
    </div>
  );
}
