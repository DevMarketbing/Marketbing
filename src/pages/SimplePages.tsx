import { useState } from "react";
import { UserIcon } from "../components/Icons";
import { auth } from "../api";
import { ErrorNote, Field, primaryButton, useFormAction, useSession } from "../auth/AuthGate";

/** Settings / Account pages. Settings values are illustrative in this prototype. */

const DEMO_WORKSPACE = "NovaSkin (Demo Workspace)";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-slate-100 py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="text-sm text-slate-500">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useSession();
  return (
    <div className="mx-auto max-w-2xl animate-fade-up px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Workspace preferences (demo values).</p>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white px-6 py-2 shadow-sm">
        <Row label="Workspace" value={user?.workspaceName ?? DEMO_WORKSPACE} />
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
  const { user, signOut } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const role = user?.role === "member" ? "Team member" : "Owner";
  return (
    <div className="mx-auto max-w-2xl animate-fade-up px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Account</h1>
      <div className="mt-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
          <UserIcon className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{user?.email ?? "Demo User"}</div>
          <div className="text-sm text-slate-500">
            {role} · {user?.workspaceName ?? DEMO_WORKSPACE}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-6 py-2 shadow-sm">
        <Row label="Plan" value="Prototype" />
        <Row label="Role" value={role} />
        <Row label="Notifications" value="Approvals only" />
      </div>
      {user && (
        <>
          <ChangePassword />
          <button
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
            disabled={signingOut}
            className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60 sm:w-auto"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </>
      )}
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [done, setDone] = useState(false);
  const { busy, error, run } = useFormAction();

  const submit = run(async () => {
    setDone(false);
    await auth.changePassword(current, next);
    setCurrent("");
    setNext("");
    setDone(true);
  });

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
      <Field
        id="current-password"
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
      />
      <Field
        id="new-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        hint="At least 10 characters. Your other devices will be signed out."
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <ErrorNote message={error} />
      {done && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Password changed.</p>}
      <button type="submit" disabled={busy} className={`w-full sm:w-auto ${primaryButton}`}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
