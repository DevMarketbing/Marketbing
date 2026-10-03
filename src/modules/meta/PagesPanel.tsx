import { useState } from "react";
import { meta } from "../../api";
import type { MetaPageSummary } from "../../../shared/metaTypes";
import StatTile from "../../components/StatTile";
import { ErrorNote, inputClass, primaryButton, useFormAction } from "../../auth/AuthGate";
import { Card, fmtDate, fmtNum, Loading, Note, Picker, Picture, textareaClass, useLoad } from "./common";

/** "2026-10-05T14:30" for a datetime-local input, in local time. */
const localInputValue = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** Your Facebook Pages: followers, recent posts and posting (now or scheduled). */
export default function PagesPanel({ pages }: { pages: MetaPageSummary[] }) {
  const [pageId, setPageId] = useState(pages[0].id);
  const { data, error, loading, reload } = useLoad(() => meta.page(pageId), [pageId]);

  return (
    <div className="space-y-4">
      <Picker id="fb-page" label="Facebook Page" items={pages} value={pageId} onChange={setPageId} describe={(p) => p.name} />
      <ErrorNote message={error} />
      {loading && !data && <Loading what="the Page" />}
      {data && (
        <>
          <Card>
            <div className="flex items-center gap-4">
              <Picture src={data.page.pictureUrl} alt="" className="h-12 w-12 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-bold text-slate-900">{data.page.name}</div>
                {data.page.category && <div className="truncate text-sm text-slate-500">{data.page.category}</div>}
              </div>
              {data.page.link && (
                <a href={data.page.link} target="_blank" rel="noreferrer" className="shrink-0 text-sm font-semibold text-indigo-600 hover:underline">
                  Open ↗
                </a>
              )}
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label="Followers" value={fmtNum(data.page.followers)} />
            <StatTile label="Likes" value={fmtNum(data.page.fans)} />
            <StatTile label="Scheduled posts" value={fmtNum(data.scheduled.length)} />
          </div>

          <Composer pageId={pageId} onPosted={reload} />

          {data.scheduled.length > 0 && (
            <Card title="Scheduled">
              <ul className="divide-y divide-slate-100">
                {data.scheduled.map((s) => (
                  <li key={s.id} className="py-2.5 text-sm">
                    <div className="text-xs font-semibold text-indigo-600">{fmtDate(s.scheduledAt)}</div>
                    <div className="break-words text-slate-700">{s.message || "(picture)"}</div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="Recent posts">
            {data.posts.length === 0 && <p className="text-sm text-slate-500">No posts yet.</p>}
            <ul className="divide-y divide-slate-100">
              {data.posts.map((p) => (
                <li key={p.id} className="flex gap-3 py-3" data-fb-post={p.id}>
                  {p.picture && <Picture src={p.picture} alt="" className="h-16 w-16 shrink-0 rounded-lg" />}
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="text-xs text-slate-400">{fmtDate(p.createdAt)}</div>
                    {p.message && <p className="mt-0.5 line-clamp-3 break-words text-slate-700">{p.message}</p>}
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>👍 {fmtNum(p.reactions)}</span>
                      <span>💬 {fmtNum(p.comments)}</span>
                      <span>↗ {fmtNum(p.shares)}</span>
                      {p.permalink && (
                        <a href={p.permalink} target="_blank" rel="noreferrer" className="font-semibold text-indigo-600 hover:underline">
                          View
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

function Composer({ pageId, onPosted }: { pageId: string; onPosted: () => void }) {
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState<"none" | "link" | "image">("none");
  const [url, setUrl] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState(() => localInputValue(Date.now() + 60 * 60_000));
  const [posted, setPosted] = useState<string | null>(null);
  const { busy, error, run } = useFormAction();

  return (
    <Card title="Write a post">
      <form
        className="space-y-3"
        onSubmit={run(async () => {
          setPosted(null);
          await meta.postToPage(pageId, {
            message,
            link: attach === "link" ? url : undefined,
            imageUrl: attach === "image" ? url : undefined,
            scheduledAt: schedule ? new Date(when).getTime() : undefined,
          });
          setPosted(schedule ? `Scheduled for ${fmtDate(new Date(when).getTime())}.` : "Posted to your Page.");
          setMessage("");
          setUrl("");
          onPosted();
        })}
      >
        <textarea
          id="fb-message"
          aria-label="Post text"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What do you want to share?"
          className={`${textareaClass} mt-0`}
        />
        <div className="flex flex-wrap gap-2 text-sm">
          {(
            [
              ["none", "Text only"],
              ["link", "Add a link"],
              ["image", "Add a picture"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5 text-slate-600">
              <input type="radio" name="fb-attach" checked={attach === k} onChange={() => setAttach(k)} />
              {label}
            </label>
          ))}
        </div>
        {attach !== "none" && (
          <input
            id="fb-url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={attach === "link" ? "https://your-site.com/page" : "https://… (public link to the picture)"}
            aria-label={attach === "link" ? "Link" : "Picture address"}
            className={`${inputClass} mt-0`}
          />
        )}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
          Schedule for later
        </label>
        {schedule && (
          <input
            id="fb-when"
            type="datetime-local"
            required
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="When to post"
            className={`${inputClass} mt-0 sm:max-w-xs`}
          />
        )}
        <ErrorNote message={error} />
        {posted && <Note tone="good">{posted}</Note>}
        <button className={primaryButton} disabled={busy}>
          {busy ? "Posting…" : schedule ? "Schedule post" : "Post now"}
        </button>
      </form>
    </Card>
  );
}
