import { useCallback, useEffect, useState } from "react";
import { team, type PendingInvite, type TeamMember } from "../api";
import { ErrorNote, Field, primaryButton, useFormAction, useSession } from "../auth/AuthGate";
import { UserIcon } from "../components/Icons";

/**
 * The people in this workspace. Owners invite teammates by link (there is
 * no email sending yet, so the owner passes the link on) and can remove
 * them; team members see who is in the workspace.
 */
export default function TeamPage() {
  const { user } = useSession();
  const isOwner = user?.role === "owner";
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(() => {
    team.list().then(
      (t) => {
        setMembers(t.members);
        setInvites(t.invites);
        setLoadError(null);
      },
      (e: Error) => setLoadError(e.message),
    );
  }, []);
  useEffect(reload, [reload]);

  const act = (action: () => Promise<void>) => async () => {
    setActionError(null);
    try {
      await action();
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-2xl animate-fade-up px-4 py-10 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Team</h1>
      <p className="mt-1 text-sm text-slate-500">
        Everyone here can use {user?.workspaceName ?? "this workspace"}: its wallet, influencers and campaigns.
        {isOwner ? " Only you, the owner, can invite or remove people." : ""}
      </p>

      {isOwner && <InviteForm onInvited={reload} />}

      <ErrorNote message={loadError ?? actionError} />

      <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
              <UserIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-800">
                {m.email}
                {m.email === user?.email && <span className="text-slate-400"> (you)</span>}
              </div>
              <div className="text-xs text-slate-500">{m.role === "owner" ? "Owner" : "Team member"}</div>
            </div>
            {isOwner && m.role !== "owner" && (
              <button
                onClick={act(async () => {
                  if (window.confirm(`Remove ${m.email}? They will be signed out and lose access.`)) {
                    await team.removeMember(m.id);
                  }
                })}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700"
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {invites.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 text-slate-400">
              <UserIcon className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-600">{i.email}</div>
              <div className="text-xs text-slate-400">
                Invited · link expires {new Date(i.expiresAt).toLocaleDateString()}
              </div>
            </div>
            <button
              onClick={act(() => team.revokeInvite(i.id))}
              className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700"
            >
              Cancel invite
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: () => void }) {
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, error, run } = useFormAction();

  const submit = run(async () => {
    const invite = await team.invite(email);
    setCreated({ email: invite.email, link: invite.link });
    setCopied(false);
    setEmail("");
    onInvited();
  });

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.link);
      setCopied(true);
    } catch {
      /* clipboard blocked — the link is selectable in the box */
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-sm font-semibold text-slate-900">Invite a teammate</h2>
        <Field
          id="invite-email"
          label="Their email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <ErrorNote message={error} />
        <button type="submit" disabled={busy} className={`w-full sm:w-auto ${primaryButton}`}>
          {busy ? "Creating…" : "Create invite link"}
        </button>
      </form>
      {created && (
        <div className="mt-5 rounded-lg bg-indigo-50 p-4">
          <p className="text-sm text-slate-700">
            Send this link to <span className="font-semibold">{created.email}</span> (by WhatsApp, email…). It works
            once, for 7 days, and is shown only now.
          </p>
          <input
            id="invite-link"
            readOnly
            value={created.link}
            onFocus={(e) => e.target.select()}
            className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-xs text-slate-700"
          />
          <button onClick={copy} className="mt-3 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100">
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
