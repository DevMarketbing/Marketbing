import { useState, type ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { meta } from "../../api";
import type { MetaStatus } from "../../../shared/metaTypes";
import { ErrorNote, primaryButton } from "../../auth/AuthGate";
import AdsPanel from "./AdsPanel";
import InstagramPanel, { InfluencerLookup, NoInstagram } from "./InstagramPanel";
import PagesPanel from "./PagesPanel";
import { Card, Dialog, fmtDate, Loading, Note, secondaryButton, useLoad } from "./common";

/** What Meta's sign-in page sent back, read from the address (#meta=…) when the app opens. */
export type MetaReturn = { kind: "connected" } | { kind: "cancelled" } | { kind: "error"; message: string };

/** Reads and removes #meta=… from the address; null when there is none. */
export function takeMetaReturn(): MetaReturn | null {
  const match = /^#meta=(connected|cancelled|error:(.*))$/.exec(window.location.hash);
  if (!match) return null;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (match[1] === "connected") return { kind: "connected" };
  if (match[1] === "cancelled") return { kind: "cancelled" };
  let message = "Connecting Facebook didn't work. Try again.";
  try {
    message = decodeURIComponent(match[2]);
  } catch {
    /* keep the generic message */
  }
  return { kind: "error", message };
}

type Tab = "instagram" | "pages" | "ads" | "lookup";
const TABS: { id: Tab; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "pages", label: "Facebook Pages" },
  { id: "ads", label: "Ads" },
  { id: "lookup", label: "Find influencers" },
];

const DAY = 24 * 60 * 60 * 1000;

/** Facebook & Instagram: connect once, then stats, posting, comments, influencer lookup and ads. */
export default function MetaModule({ returned }: { returned: MetaReturn | null }) {
  const [notice, setNotice] = useState(returned);
  const { data: status, error, loading, reload } = useLoad(() => meta.status(), []);
  const [tab, setTab] = useState<Tab>("instagram");

  if (!meta.available) {
    return (
      <Page>
        <Note>Facebook & Instagram need the Marketbing server, so they aren't part of this demo build.</Note>
      </Page>
    );
  }

  return (
    <Page>
      {notice && (
        <div className="mb-4">
          <Note tone={notice.kind === "connected" ? "good" : notice.kind === "cancelled" ? "info" : "bad"}>
            {notice.kind === "connected"
              ? "Facebook is connected."
              : notice.kind === "cancelled"
                ? "Connecting Facebook was cancelled. Nothing was changed."
                : notice.message}
            <button className="ml-2 font-semibold underline" onClick={() => setNotice(null)}>
              OK
            </button>
          </Note>
        </div>
      )}
      <ErrorNote message={error} />
      {loading && !status && <Loading what="your Facebook connection" />}
      {status && !status.configured && <NotConfigured status={status} />}
      {status?.configured && !status.connected && <Connect status={status} />}
      {status?.connected && (
        <div className="space-y-5">
          <ConnectionCard status={status} onChanged={reload} />
          <div className="overflow-x-auto">
            <div className="flex w-max gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold ${
                    tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <TabContent tab={tab} status={status} />
        </div>
      )}
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl animate-fade-up px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Facebook & Instagram</h1>
      <p className="mb-6 mt-1 text-sm text-slate-500">
        Your Instagram and Facebook Page stats, posting, comments, influencer lookup and Meta ads, in one place.
      </p>
      {children}
    </div>
  );
}

function TabContent({ tab, status }: { tab: Tab; status: MetaStatus }) {
  const igAccounts = status.pages.flatMap((p) => (p.instagram ? [p.instagram] : []));
  if (tab === "instagram") return igAccounts.length ? <InstagramPanel accounts={igAccounts} /> : <NoInstagram />;
  if (tab === "lookup") return igAccounts.length ? <InfluencerLookup accounts={igAccounts} /> : <NoInstagram />;
  if (tab === "pages") {
    return status.pages.length ? (
      <PagesPanel pages={status.pages} />
    ) : (
      <Note>
        This Facebook account doesn't manage any Pages, or didn't share them with Marketbing. Click <b>Reconnect</b> and tick
        your Pages when Facebook asks.
      </Note>
    );
  }
  return status.adAccounts.length ? (
    <AdsPanel accounts={status.adAccounts} />
  ) : (
    <Note>
      No ad accounts came with this connection. Make sure this Facebook account can use an ad account in Meta Business
      Suite, then click <b>Reconnect</b> and allow access to it.
    </Note>
  );
}

function ConnectionCard({ status, onChanged }: { status: MetaStatus; onChanged: () => void }) {
  const account = status.account!;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const expiresSoon = account.tokenExpiresAt !== null && account.tokenExpiresAt - Date.now() < 7 * DAY;
  const expired = account.tokenExpiresAt !== null && account.tokenExpiresAt < Date.now();

  const act = (name: string, action: () => Promise<void>) => async () => {
    setBusy(name);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">
            Connected as <span data-meta-account>{account.name}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {status.pages.length} Page{status.pages.length === 1 ? "" : "s"} ·{" "}
            {status.pages.filter((p) => p.instagram).length} Instagram · {status.adAccounts.length} ad account
            {status.adAccounts.length === 1 ? "" : "s"} · updated {fmtDate(account.refreshedAt)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className={secondaryButton} disabled={busy !== null} onClick={act("refresh", meta.refresh)}>
            {busy === "refresh" ? "Refreshing…" : "Refresh"}
          </button>
          {status.canManage && <ConnectButton label="Reconnect" secondary />}
          {status.canManage && (
            <button className={secondaryButton} disabled={busy !== null} onClick={() => setConfirmDisconnect(true)}>
              Disconnect
            </button>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <ErrorNote message={error} />
        {(expiresSoon || expired) && (
          <Note tone={expired ? "bad" : "warn"}>
            {expired ? "The Facebook connection has expired." : `The Facebook connection expires on ${fmtDate(account.tokenExpiresAt!)}.`}{" "}
            {status.canManage ? "Click Reconnect to renew it." : "Ask the workspace owner to reconnect it."}
          </Note>
        )}
        {account.missingScopes.length > 0 && (
          <Note tone="warn">
            Some permissions weren't granted, so parts of this page may not work: {account.missingScopes.join(", ")}.{" "}
            {status.canManage ? "Click Reconnect and allow everything Facebook asks." : "Ask the workspace owner to reconnect."}
          </Note>
        )}
      </div>
      {confirmDisconnect && (
        <Dialog title="Disconnect Facebook?" onClose={() => setConfirmDisconnect(false)}>
          <p className="text-sm text-slate-600">
            Marketbing will forget this connection and withdraw its access on Facebook. Nothing on your Pages, Instagram or ad
            accounts is deleted. You can connect again at any time.
          </p>
          <div className="mt-5 flex gap-2">
            <button className={`${secondaryButton} flex-1`} onClick={() => setConfirmDisconnect(false)}>
              Cancel
            </button>
            <button
              className={`${primaryButton} flex-1 bg-rose-600 hover:bg-rose-500`}
              onClick={() => {
                setConfirmDisconnect(false);
                void act("disconnect", meta.disconnect)();
              }}
            >
              Disconnect
            </button>
          </div>
        </Dialog>
      )}
    </Card>
  );
}

/** Starts "Connect Facebook". Facebook doesn't allow its sign-in inside apps, so the Android app sends people to the website. */
function ConnectButton({ label, secondary }: { label: string; secondary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (Capacitor.isNativePlatform()) {
    return (
      <span className="text-xs text-slate-500">
        To {label.toLowerCase()}, open Marketbing on the website: Facebook doesn't allow signing in inside apps.
      </span>
    );
  }
  return (
    <>
      <button
        className={secondary ? secondaryButton : primaryButton}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await meta.connect();
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening Facebook…" : label}
      </button>
      {error && (
        <div className="w-full">
          <ErrorNote message={error} />
        </div>
      )}
    </>
  );
}

function Connect({ status }: { status: MetaStatus }) {
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-bold text-slate-900">Connect Facebook</h2>
        <p className="mt-1 text-sm text-slate-600">
          Sign in with the Facebook account that manages your business's Facebook Pages, Instagram and ad accounts. Facebook
          will ask which of them to share with Marketbing. Everyone in this workspace can then use them here.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {status.canManage ? (
            <ConnectButton label="Connect Facebook" />
          ) : (
            <Note>Ask the workspace owner to connect Facebook.</Note>
          )}
        </div>
      </Card>
      {status.setup && <SetupAddresses setup={status.setup} />}
    </div>
  );
}

function NotConfigured({ status }: { status: MetaStatus }) {
  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-bold text-slate-900">Not set up on this server yet</h2>
        {status.canManage ? (
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
            <li>
              Create an app at <a className="font-semibold text-indigo-600 hover:underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">developers.facebook.com/apps</a> (type: Business).
            </li>
            <li>In the app's Settings → Basic, copy the <b>App ID</b> and <b>App secret</b>.</li>
            <li>
              Add them to the server as <code>META_APP_ID</code> and <code>META_APP_SECRET</code> (on Render: your service →
              Environment), and let it restart.
            </li>
            <li>
              In Facebook Login for Business → Configurations, create one (User access token, with your Pages, Instagram
              and ad accounts) and add its ID as <code>META_LOGIN_CONFIG_ID</code>.
            </li>
            <li>Enter the addresses below in the Meta app's settings.</li>
          </ol>
        ) : (
          <p className="mt-1 text-sm text-slate-600">Ask the workspace owner to set up Facebook & Instagram.</p>
        )}
      </Card>
      {status.setup && <SetupAddresses setup={status.setup} />}
    </div>
  );
}

function SetupAddresses({ setup }: { setup: NonNullable<MetaStatus["setup"]> }) {
  const rows: [string, string, string][] = [
    ["Valid OAuth Redirect URI", "Facebook Login (for Business) → Settings", setup.redirectUri],
    ["Deauthorize callback URL", "Facebook Login (for Business) → Settings", setup.deauthorizeUrl],
    ["Data deletion request URL", "Settings → Basic (choose “Data deletion callback URL”)", setup.dataDeletionUrl],
  ];
  return (
    <Card title="Addresses for your Meta app">
      <p className="mb-3 text-sm text-slate-500">Copy each one into the place shown in your app at developers.facebook.com.</p>
      <dl className="space-y-3">
        {rows.map(([label, where, value]) => (
          <div key={label}>
            <dt className="text-sm font-medium text-slate-700">
              {label} <span className="font-normal text-slate-400">· {where}</span>
            </dt>
            <dd className="mt-1 flex gap-2">
              <input readOnly value={value} className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" onFocus={(e) => e.target.select()} />
              <button
                className={secondaryButton}
                onClick={() => void navigator.clipboard?.writeText(value).catch(() => {})}
              >
                Copy
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
