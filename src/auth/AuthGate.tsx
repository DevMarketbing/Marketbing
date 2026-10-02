import {
  createContext,
  useContext,
  useEffect,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { auth, type SessionUser } from "../api";
import { SparkIcon } from "../components/Icons";

interface Session {
  /** The signed-in account, or null in the embedded demo (no server, no sign-in). */
  user: SessionUser | null;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session>({ user: null, signOut: async () => {} });
export const useSession = () => useContext(SessionContext);

type State =
  | { status: "checking" }
  | { status: "unreachable"; message: string }
  | { status: "signed-out" }
  | { status: "invite"; token: string }
  | { status: "signed-in"; user: SessionUser | null };

/** An invite link looks like https://site/#invite=TOKEN. */
function takeInviteToken(): string | null {
  const match = /^#invite=([\w-]+)$/.exec(window.location.hash);
  if (!match) return null;
  // Drop the token from the address bar so it isn't bookmarked or shared by accident.
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  return match[1];
}

function initialState(): State {
  if (!auth.required) return { status: "signed-in", user: null };
  const invite = takeInviteToken();
  if (invite) return { status: "invite", token: invite };
  return auth.hasSession() ? { status: "checking" } : { status: "signed-out" };
}

/** Shows sign-in, sign-up or invite screens until there is a valid session, then the app. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);

  useEffect(() => auth.onSignedOut(() => setState({ status: "signed-out" })), []);

  useEffect(() => {
    if (state.status !== "checking") return;
    let cancelled = false;
    auth
      .currentUser()
      .then((user) => !cancelled && setState({ status: "signed-in", user }))
      .catch((e: Error) => {
        if (cancelled) return;
        // A rejected session already switched to signed-out via onSignedOut.
        setState((s) => (s.status === "checking" ? { status: "unreachable", message: e.message } : s));
      });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  const signedIn = () => setState({ status: "checking" });

  switch (state.status) {
    case "signed-in": {
      const signOut = async () => {
        await auth.signOut();
        setState({ status: "signed-out" });
      };
      return <SessionContext.Provider value={{ user: state.user, signOut }}>{children}</SessionContext.Provider>;
    }
    case "signed-out":
      return <SignInOrUp onSignedIn={signedIn} />;
    case "invite":
      return (
        <AcceptInvite
          token={state.token}
          onSignedIn={signedIn}
          onCancel={() => setState(auth.hasSession() ? { status: "checking" } : { status: "signed-out" })}
        />
      );
    case "checking":
      return (
        <Screen>
          <p className="text-center text-sm text-slate-500">Signing you in…</p>
        </Screen>
      );
    case "unreachable":
      return (
        <Screen>
          <div className="text-center">
            <p className="text-sm text-slate-600">{state.message}</p>
            <button onClick={() => setState({ status: "checking" })} className={`mt-4 ${primaryButton}`}>
              Try again
            </button>
          </div>
        </Screen>
      );
  }
}

/* ------------------------------- pieces -------------------------------- */

export const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";
export const primaryButton =
  "rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60";

function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-200">
            <SparkIcon className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-900">Marketbing</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input id={id} required className={inputClass} {...input} />
      {hint && <span className="mt-1 block text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </p>
  );
}

/** Runs an async form action with busy/error state. */
export function useFormAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/* ------------------------------- screens ------------------------------- */

function SignInOrUp({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [signupAllowed, setSignupAllowed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const { busy, error, run } = useFormAction();

  useEffect(() => {
    auth.signupAllowed().then(setSignupAllowed, () => setSignupAllowed(false));
  }, []);

  const signingUp = mode === "sign-up";
  const submit = run(async () => {
    if (signingUp) await auth.signUp(email, password, workspaceName);
    else await auth.signIn(email, password);
    onSignedIn();
  });

  return (
    <Screen>
      <h1 className="text-xl font-bold tracking-tight text-slate-900">
        {signingUp ? "Create your account" : "Sign in"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {signingUp
          ? "Your business gets its own private workspace. You can invite your team afterwards."
          : "Welcome back."}
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {signingUp && (
          <Field
            id="signup-workspace"
            label="Business name"
            autoComplete="organization"
            maxLength={80}
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
          />
        )}
        <Field
          id="login-email"
          label="Email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          id="login-password"
          label="Password"
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          minLength={signingUp ? 10 : undefined}
          hint={signingUp ? "At least 10 characters." : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorNote message={error} />
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}
        </button>
      </form>
      {signupAllowed && (
        <p className="mt-5 text-center text-sm text-slate-500">
          {signingUp ? "Already have an account? " : "New to Marketbing? "}
          <button
            type="button"
            onClick={() => setMode(signingUp ? "sign-in" : "sign-up")}
            className="font-semibold text-indigo-600 hover:text-indigo-500"
          >
            {signingUp ? "Sign in" : "Create an account"}
          </button>
        </p>
      )}
    </Screen>
  );
}

function AcceptInvite({ token, onSignedIn, onCancel }: { token: string; onSignedIn: () => void; onCancel: () => void }) {
  const [invite, setInvite] = useState<{ email: string; workspaceName: string } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const { busy, error, run } = useFormAction();

  useEffect(() => {
    auth.lookupInvite(token).then(setInvite, (e: Error) => setLookupError(e.message));
  }, [token]);

  const submit = run(async () => {
    await auth.acceptInvite(token, password);
    onSignedIn();
  });

  if (lookupError) {
    return (
      <Screen>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Invite not valid</h1>
        <p className="mt-2 text-sm text-slate-600">{lookupError}</p>
        <button onClick={onCancel} className={`mt-5 w-full ${primaryButton}`}>
          Go to sign in
        </button>
      </Screen>
    );
  }
  if (!invite) {
    return (
      <Screen>
        <p className="text-center text-sm text-slate-500">Checking your invite…</p>
      </Screen>
    );
  }
  return (
    <Screen>
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Join {invite.workspaceName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        You've been invited as <span className="font-medium text-slate-700">{invite.email}</span>. Choose a password
        to finish setting up your account.
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field
          id="invite-password"
          label="Password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          hint="At least 10 characters."
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorNote message={error} />
        <button type="submit" disabled={busy} className={`w-full ${primaryButton}`}>
          {busy ? "Please wait…" : "Join workspace"}
        </button>
      </form>
      <button onClick={onCancel} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-700">
        Cancel
      </button>
    </Screen>
  );
}
