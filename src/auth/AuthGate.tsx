import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { auth } from "../api";
import { SparkIcon } from "../components/Icons";

interface Session {
  /** Signed-in email, or null in the embedded demo (no server, no sign-in). */
  email: string | null;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session>({ email: null, signOut: async () => {} });
export const useSession = () => useContext(SessionContext);

type State =
  | { status: "checking" }
  | { status: "unreachable"; message: string }
  | { status: "signed-out" }
  | { status: "signed-in"; email: string | null };

const initialState = (): State =>
  !auth.required
    ? { status: "signed-in", email: null }
    : auth.hasSession()
      ? { status: "checking" }
      : { status: "signed-out" };

/** Shows the sign-in screen until there is a valid session, then the app. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);

  useEffect(() => auth.onSignedOut(() => setState({ status: "signed-out" })), []);

  useEffect(() => {
    if (state.status !== "checking") return;
    let cancelled = false;
    auth
      .currentUser()
      .then((email) => !cancelled && setState({ status: "signed-in", email }))
      .catch((e: Error) => {
        if (cancelled) return;
        // A rejected session already switched to signed-out via onSignedOut.
        setState((s) => (s.status === "checking" ? { status: "unreachable", message: e.message } : s));
      });
    return () => {
      cancelled = true;
    };
  }, [state.status]);

  if (state.status === "signed-in") {
    const signOut = async () => {
      await auth.signOut();
      setState({ status: "signed-out" });
    };
    return <SessionContext.Provider value={{ email: state.email, signOut }}>{children}</SessionContext.Provider>;
  }
  if (state.status === "signed-out") {
    return <SignInPage onSignedIn={(email) => setState({ status: "signed-in", email })} />;
  }
  return (
    <Screen>
      {state.status === "checking" ? (
        <p className="text-center text-sm text-slate-500">Signing you in…</p>
      ) : (
        <div className="text-center">
          <p className="text-sm text-slate-600">{state.message}</p>
          <button
            onClick={() => setState({ status: "checking" })}
            className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Try again
          </button>
        </div>
      )}
    </Screen>
  );
}

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

function SignInPage({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await auth.signIn(email, password));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const input =
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100";

  return (
    <Screen>
      <h1 className="text-xl font-bold tracking-tight text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Use the account set up for this workspace.</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>
        {error && (
          <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </Screen>
  );
}
