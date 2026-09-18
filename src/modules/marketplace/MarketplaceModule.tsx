import { useCallback, useEffect, useState } from "react";
import type { MarketplaceOverview } from "../../types";
import { api } from "../../api";
import MarketplaceList from "./MarketplaceList";
import InfluencerDetailView from "./InfluencerDetailView";
import CompareView from "./CompareView";
import TradeModal from "./TradeModal";

type View = { type: "list" } | { type: "detail"; id: string } | { type: "compare"; ids: string[] };

/** Module 2 — Influencer Marketplace. */
export default function MarketplaceModule() {
  const [overview, setOverview] = useState<MarketplaceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ type: "list" });
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [trade, setTrade] = useState<{ id: string; type: "invest" | "divest" } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const reload = useCallback(async () => {
    try {
      setOverview(await api.getMarketplaceOverview());
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Could not reach the Marketbing API.");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const toggleCompare = (id: string) =>
    setCompareIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : ids.length >= 3 ? ids : [...ids, id],
    );

  if (error && !overview) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-8">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
          {error}
          <div className="mt-3">
            <button
              onClick={() => reload()}
              className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!overview) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  const tradeSummary = trade ? overview.influencers.find((i) => i.profile.id === trade.id) : null;

  return (
    <>
      {view.type === "list" && (
        <MarketplaceList
          overview={overview}
          compareIds={compareIds}
          onToggleCompare={toggleCompare}
          onCompare={() => compareIds.length >= 2 && setView({ type: "compare", ids: compareIds })}
          onOpen={(id) => setView({ type: "detail", id })}
          onTrade={(id, type) => setTrade({ id, type })}
        />
      )}
      {view.type === "detail" && (
        <InfluencerDetailView
          influencerId={view.id}
          refreshKey={refreshKey}
          onBack={() => setView({ type: "list" })}
          onTrade={(id, type) => setTrade({ id, type })}
        />
      )}
      {view.type === "compare" && (
        <CompareView
          ids={view.ids}
          onBack={() => setView({ type: "list" })}
          onOpen={(id) => setView({ type: "detail", id })}
        />
      )}

      {trade && tradeSummary && (
        <TradeModal
          summary={tradeSummary}
          wallet={overview.wallet}
          type={trade.type}
          onClose={() => setTrade(null)}
          onDone={() => {
            setTrade(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}
