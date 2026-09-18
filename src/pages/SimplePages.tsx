import { UserIcon } from "../components/Icons";

/** Minimal Settings / Account pages — demo placeholders with no real state. */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="text-sm text-slate-500">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-up px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Workspace preferences (demo values).</p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-2 shadow-sm">
        <Row label="Workspace" value="NovaSkin (Demo Workspace)" />
        <Row label="Default currency" value="INR (₹)" />
        <Row label="Approval policy" value="Require approval before spend & go-live" />
        <Row label="Execution mode" value="Autonomous with checkpoints" />
      </div>
      <p className="mt-4 text-xs text-slate-400">
        Settings are illustrative in this prototype and cannot be changed.
      </p>
    </div>
  );
}

export function AccountPage() {
  return (
    <div className="mx-auto max-w-2xl animate-fade-up px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account</h1>
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
          <UserIcon className="h-6 w-6" />
        </span>
        <div>
          <div className="text-sm font-semibold text-slate-900">Demo User</div>
          <div className="text-sm text-slate-500">Owner · NovaSkin (Demo Workspace)</div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-6 py-2 shadow-sm">
        <Row label="Plan" value="Prototype" />
        <Row label="Role" value="Business Owner" />
        <Row label="Notifications" value="Approvals only" />
      </div>
    </div>
  );
}
