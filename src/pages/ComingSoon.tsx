import { LockIcon } from "../components/Icons";

interface ComingSoonProps {
  title: string;
  description: string;
  futureItems: string[];
}

/**
 * Placeholder for Modules 2 & 3 — shown only to communicate product
 * architecture. No invented functionality.
 */
export default function ComingSoon({ title, description, futureItems }: ComingSoonProps) {
  return (
    <div className="mx-auto max-w-3xl animate-fade-up px-4 py-16 text-center sm:px-8">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <LockIcon className="h-7 w-7" />
      </span>
      <div className="mt-5 inline-block rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-indigo-600 ring-1 ring-indigo-100">
        Coming soon
      </div>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mx-auto mt-2 max-w-xl text-[15px] leading-relaxed text-slate-500">
        {description}
      </p>
      <div className="mx-auto mt-8 max-w-md rounded-xl border border-dashed border-slate-300 bg-white p-6 text-left">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Planned for this module
        </div>
        <ul className="mt-3 space-y-2">
          {futureItems.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-1.75 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-6 text-xs text-slate-400">
        This module is not part of the current prototype. It appears here to show the overall
        product architecture.
      </p>
    </div>
  );
}
