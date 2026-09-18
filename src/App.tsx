import { useState } from "react";
import Sidebar, { type Route } from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import ComingSoon from "./pages/ComingSoon";
import { AccountPage, SettingsPage } from "./pages/SimplePages";
import PlanningModule from "./modules/planning/PlanningModule";
import MarketplaceModule from "./modules/marketplace/MarketplaceModule";
import { MenuIcon, SparkIcon } from "./components/Icons";

export default function App() {
  const [route, setRoute] = useState<Route>("planning");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <Sidebar
        route={route}
        onNavigate={setRoute}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Open menu"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
          <SparkIcon className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold tracking-tight text-slate-900">Marketbing</span>
      </header>

      <main className="lg:pl-72">
        {/* PlanningModule stays mounted so simulated execution keeps running
            while the user visits other sections. */}
        <div className={route === "planning" ? "" : "hidden"}>
          <PlanningModule />
        </div>
        {route === "dashboard" && <Dashboard onNavigate={setRoute} />}
        {/* Marketplace stays mounted too, preserving list/compare state. */}
        <div className={route === "influencers" ? "" : "hidden"}>
          <MarketplaceModule />
        </div>
        {route === "finance" && (
          <ComingSoon
            title="Finance, Sales & Products"
            description="Financial operations, sales tracking and product-level insight for everything the platform executes."
            futureItems={[
              "Wallet, balance, credits and debits",
              "Credit limits and financial operations",
              "Sales tracking and product-level insights",
            ]}
          />
        )}
        {route === "settings" && <SettingsPage />}
        {route === "account" && <AccountPage />}
      </main>
    </div>
  );
}
