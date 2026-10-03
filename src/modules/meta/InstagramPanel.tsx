import { useState } from "react";
import { meta } from "../../api";
import type { IgComment, IgMedia, MetaInstagramAccount } from "../../../shared/metaTypes";
import StatTile from "../../components/StatTile";
import { ErrorNote, inputClass, primaryButton, useFormAction } from "../../auth/AuthGate";
import {
  Card,
  Dialog,
  fmtDate,
  fmtNum,
  fmtPercent,
  Loading,
  Note,
  Picker,
  Picture,
  secondaryButton,
  textareaClass,
  useLoad,
} from "./common";

const INSIGHT_LABELS: [string, string][] = [
  ["reach", "Reach"],
  ["views", "Views"],
  ["total_interactions", "Interactions"],
  ["accounts_engaged", "Accounts engaged"],
  ["profile_views", "Profile views"],
];

export function NoInstagram() {
  return (
    <Note>
      No Instagram account came with this Facebook connection. Instagram needs a <b>professional</b> (business or
      creator) account linked to one of your Facebook Pages: in Instagram, go to Settings → Account type and tools, and
      in Facebook, go to your Page's settings → Linked accounts. Then click <b>Refresh</b> above.
    </Note>
  );
}

/** Your Instagram account: stats, recent posts, comments and publishing. */
export default function InstagramPanel({ accounts }: { accounts: MetaInstagramAccount[] }) {
  const [igId, setIgId] = useState(accounts[0].id);
  const { data, error, loading, reload } = useLoad(() => meta.instagram(igId), [igId]);
  const [open, setOpen] = useState<IgMedia | null>(null);
  const [publishing, setPublishing] = useState(false);

  return (
    <div className="space-y-4">
      <Picker id="ig-account" label="Instagram account" items={accounts} value={igId} onChange={setIgId} describe={(a) => `@${a.username}`} />
      <ErrorNote message={error} />
      {loading && !data && <Loading what="Instagram" />}
      {data && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <Picture src={data.profile.pictureUrl} alt="" className="h-14 w-14 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold text-slate-900">@{data.profile.username}</div>
                {data.profile.name && <div className="truncate text-sm text-slate-500">{data.profile.name}</div>}
              </div>
              <button className={primaryButton} onClick={() => setPublishing(true)}>
                New post
              </button>
            </div>
            {data.profile.biography && <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{data.profile.biography}</p>}
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile label="Followers" value={fmtNum(data.profile.followers)} />
            <StatTile label="Posts" value={fmtNum(data.profile.posts)} />
            {data.insights &&
              INSIGHT_LABELS.filter(([key]) => key in data.insights!).map(([key, label]) => (
                <StatTile key={key} label={label} value={fmtNum(data.insights![key])} sub="Last 28 days" />
              ))}
          </div>
          {data.insightsError && <Note tone="warn">28-day stats aren't available: {data.insightsError}</Note>}

          <Card title="Recent posts" action={<button className={secondaryButton} onClick={reload} disabled={loading}>{loading ? "Loading…" : "Reload"}</button>}>
            {data.media.length === 0 ? (
              <p className="text-sm text-slate-500">No posts yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {data.media.map((m) => (
                  <button
                    key={m.id}
                    data-ig-media={m.id}
                    onClick={() => setOpen(m)}
                    className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 text-left"
                  >
                    <Picture src={m.thumbnailUrl ?? m.mediaUrl} alt={m.caption?.slice(0, 80) ?? "Post"} className="h-full w-full" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-semibold text-white">
                      ♥ {fmtNum(m.likes)} · 💬 {fmtNum(m.comments)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
      {open && <MediaDialog igId={igId} media={open} onClose={() => setOpen(null)} />}
      {publishing && (
        <PublishDialog
          igId={igId}
          onClose={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

/** One post: its stats and comments, with reply and hide. */
function MediaDialog({ igId, media, onClose }: { igId: string; media: IgMedia; onClose: () => void }) {
  const { data, error, loading, reload } = useLoad(() => meta.instagramMedia(igId, media.id), [igId, media.id]);
  return (
    <Dialog title="Post" onClose={onClose} wide>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Picture src={media.thumbnailUrl ?? media.mediaUrl} alt="" className="aspect-square w-full shrink-0 rounded-lg sm:w-48" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="text-xs text-slate-400">{fmtDate(media.timestamp)}</div>
          {media.caption && <p className="mt-1 whitespace-pre-line break-words text-slate-700">{media.caption}</p>}
          {media.permalink && (
            <a href={media.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-indigo-600 hover:underline">
              Open on Instagram ↗
            </a>
          )}
        </div>
      </div>
      <ErrorNote message={error} />
      {loading && !data && <Loading what="comments" />}
      {data && (
        <div className="mt-4 space-y-4">
          {data.insights && (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(data.insights).map(([k, v]) => (
                <StatTile key={k} compact label={k.replace(/_/g, " ")} value={fmtNum(v)} />
              ))}
            </div>
          )}
          {data.insightsError && <Note tone="warn">Post stats aren't available: {data.insightsError}</Note>}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Comments ({data.comments.length})</div>
            {data.comments.length === 0 && <p className="mt-2 text-sm text-slate-500">No comments yet.</p>}
            <ul className="mt-2 divide-y divide-slate-100">
              {data.comments.map((c) => (
                <CommentRow key={c.id} igId={igId} mediaId={media.id} comment={c} onChanged={reload} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function CommentRow({ igId, mediaId, comment, onChanged }: { igId: string; mediaId: string; comment: IgComment; onChanged: () => void }) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const { busy, error, run } = useFormAction();
  return (
    <li className="py-3" data-ig-comment={comment.id}>
      <div className={`text-sm ${comment.hidden ? "opacity-50" : ""}`}>
        <span className="font-semibold text-slate-800">@{comment.username ?? "someone"}</span>{" "}
        <span className="break-words text-slate-700">{comment.text}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span>{fmtDate(comment.timestamp)}</span>
        {comment.hidden && <span className="font-semibold text-amber-600">Hidden</span>}
        <button className="font-semibold text-indigo-600 hover:underline" onClick={() => setReplying((r) => !r)}>
          Reply
        </button>
        <button
          className="font-semibold text-slate-500 hover:underline disabled:opacity-60"
          disabled={busy}
          onClick={(e) => void run(async () => {
            await meta.hideComment(igId, mediaId, comment.id, !comment.hidden);
            onChanged();
          })(e)}
        >
          {comment.hidden ? "Unhide" : "Hide"}
        </button>
      </div>
      {comment.replies.length > 0 && (
        <ul className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
          {comment.replies.map((r) => (
            <li key={r.id} className="text-sm">
              <span className="font-semibold text-slate-800">@{r.username ?? "you"}</span> <span className="break-words text-slate-700">{r.text}</span>
            </li>
          ))}
        </ul>
      )}
      {replying && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={run(async () => {
            await meta.replyToComment(igId, mediaId, comment.id, reply);
            setReply("");
            setReplying(false);
            onChanged();
          })}
        >
          <input
            aria-label="Reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={2200}
            required
            placeholder="Write a reply…"
            className={`${inputClass} mt-0 min-w-0 flex-1`}
          />
          <button className={primaryButton} disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </button>
        </form>
      )}
      <div className="mt-2">
        <ErrorNote message={error} />
      </div>
    </li>
  );
}

function PublishDialog({ igId, onClose, onPublished }: { igId: string; onClose: () => void; onPublished: () => void }) {
  const [kind, setKind] = useState<"image" | "reel">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const { busy, error, run } = useFormAction();
  const [done, setDone] = useState<string | null>(null);

  if (done !== null) {
    return (
      <Dialog title="Published" onClose={onPublished}>
        <Note tone="good">Your {kind === "reel" ? "reel" : "post"} is live on Instagram.</Note>
        {done && (
          <a href={done} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:underline">
            Open on Instagram ↗
          </a>
        )}
        <button className={`${primaryButton} mt-4 w-full`} onClick={onPublished}>
          Done
        </button>
      </Dialog>
    );
  }

  return (
    <Dialog title="New Instagram post" onClose={busy ? () => {} : onClose}>
      <form
        className="space-y-4"
        onSubmit={run(async () => {
          const r = await meta.publishInstagram(igId, { kind, mediaUrl, caption });
          setDone(r.permalink ?? "");
        })}
      >
        <div className="flex gap-2" role="radiogroup" aria-label="Post type">
          {(["image", "reel"] as const).map((k) => (
            <button
              type="button"
              key={k}
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ring-1 ring-inset ${
                kind === k ? "bg-indigo-50 text-indigo-700 ring-indigo-200" : "bg-white text-slate-600 ring-slate-200"
              }`}
            >
              {k === "image" ? "Photo" : "Reel (video)"}
            </button>
          ))}
        </div>
        <label className="block text-sm font-medium text-slate-700">
          {kind === "image" ? "Image address" : "Video address"}
          <input
            id="ig-media-url"
            type="url"
            required
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="https://…"
            className={inputClass}
          />
          <span className="mt-1 block text-xs font-normal text-slate-400">
            A public https link to the {kind === "image" ? "JPEG image" : "MP4 video"}. Instagram downloads it from there.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Caption
          <textarea id="ig-caption" rows={4} maxLength={2200} value={caption} onChange={(e) => setCaption(e.target.value)} className={textareaClass} />
          <span className="mt-1 block text-right text-xs font-normal text-slate-400">{caption.length} / 2200</span>
        </label>
        <ErrorNote message={error} />
        {busy && kind === "reel" && <Note>Instagram is processing the video. This can take a minute or two.</Note>}
        <button className={`${primaryButton} w-full`} disabled={busy}>
          {busy ? "Publishing…" : "Publish now"}
        </button>
      </form>
    </Dialog>
  );
}

/** Public stats of any Instagram business or creator account, for vetting influencers. */
export function InfluencerLookup({ accounts }: { accounts: MetaInstagramAccount[] }) {
  const [username, setUsername] = useState("");
  const [result, setResult] = useState<Awaited<ReturnType<typeof meta.lookupInstagram>> | null>(null);
  const { busy, error, run } = useFormAction();
  return (
    <div className="space-y-4">
      <Card title="Look up an Instagram account">
        <p className="mb-3 text-sm text-slate-500">
          See followers, posting and average engagement of any public business or creator account, before you invest in them.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={run(async () => {
            setResult(null);
            setResult(await meta.lookupInstagram(accounts[0].id, username));
          })}
        >
          <input
            id="ig-lookup"
            aria-label="Instagram username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="@username"
            className={`${inputClass} mt-0 min-w-0 flex-1`}
          />
          <button className={primaryButton} disabled={busy}>
            {busy ? "Looking up…" : "Look up"}
          </button>
        </form>
        <div className="mt-3">
          <ErrorNote message={error} />
        </div>
      </Card>
      {result && (
        <>
          <Card>
            <div className="flex items-center gap-4">
              <Picture src={result.profile.pictureUrl} alt="" className="h-14 w-14 shrink-0 rounded-full" />
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-slate-900">@{result.profile.username}</div>
                {result.profile.name && <div className="truncate text-sm text-slate-500">{result.profile.name}</div>}
              </div>
            </div>
            {result.profile.biography && <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{result.profile.biography}</p>}
          </Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Followers" value={fmtNum(result.profile.followers)} />
            <StatTile label="Posts" value={fmtNum(result.profile.posts)} />
            <StatTile label="Avg likes" value={fmtNum(result.avgLikes)} sub={`Last ${result.recent.length} posts`} />
            <StatTile label="Avg comments" value={fmtNum(result.avgComments)} sub={`Last ${result.recent.length} posts`} />
            <StatTile label="Engagement rate" value={fmtPercent(result.engagementRate === null ? null : result.engagementRate * 100, 2)} sub="Likes + comments ÷ followers" />
          </div>
          {result.recent.length > 0 && (
            <Card title="Recent posts">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {result.recent.map((m) => (
                  <a key={m.id} href={m.permalink} target="_blank" rel="noreferrer" className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
                    <Picture src={m.thumbnailUrl ?? m.mediaUrl} alt={m.caption?.slice(0, 80) ?? "Post"} className="h-full w-full" />
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-5 text-[11px] font-semibold text-white">
                      ♥ {fmtNum(m.likes)} · 💬 {fmtNum(m.comments)}
                    </span>
                  </a>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
