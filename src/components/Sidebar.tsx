import {
  CloseIcon,
  DashboardIcon,
  SettingsIcon,
  SparkIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
  WorkflowIcon,
} from "./Icons";

export type Route =
  | "dashboard"
  | "planning"
  | "influencers"
  | "finance"
  | "settings"
  | "account";

interface SidebarProps {
  route: Route;
  onNavigate: (route: Route) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  route: Route;
  label: string;
  icon: (props: { className?: string }) => JSX.Element;
  comingSoon?: boolean;
}

const mainNav: NavItem[] = [
  { route: "dashboard", label: "Dashboard", icon: DashboardIcon },
  { route: "planning", label: "Automatic Planning & Execution", icon: WorkflowIcon },
  { route: "influencers", label: "Influencer Marketplace", icon: UsersIcon },
  { route: "finance", label: "Finance, Sales & Products", icon: WalletIcon, comingSoon: true },
];

const bottomNav: NavItem[] = [
  { route: "settings", label: "Settings", icon: SettingsIcon },
  { route: "account", label: "Account", icon: UserIcon },
];

function NavButton({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
        active
          ? "bg-indigo-500/15 text-white ring-1 ring-inset ring-indigo-400/30"
          : item.comingSoon
            ? "text-slate-500 hover:bg-white/5 hover:text-slate-400"
            : "text-slate-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active ? "text-indigo-300" : item.comingSoon ? "text-slate-600" : "text-slate-400 group-hover:text-slate-200"
        }`}
      />
      <span className="flex-1 leading-tight">{item.label}</span>
      {item.comingSoon && (
        <span className="rounded-full border border-slate-600/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
          Soon
        </span>
      )}
    </button>
  );
}

export default function Sidebar({ route, onNavigate, mobileOpen, onCloseMobile }: SidebarProps) {
  const nav = (target: Route) => {
    onNavigate(target);
    onCloseMobile();
  };

  const content = (
    <div className="flex h-full flex-col bg-ink-950 text-slate-200">
      <div className="flex items-center gap-2.5 px-5 pb-6 pt-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-900/40">
          <SparkIcon className="h-4.5 w-4.5" />
        </span>
        <div>
          <div className="text-[15px] font-bold tracking-tight text-white">Marketbing</div>
          <div className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            AI Marketing OS
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          className="ml-auto rounded-md p-1 text-slate-400 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {mainNav.map((item) => (
          <NavButton
            key={item.route}
            item={item}
            active={route === item.route}
            onClick={() => nav(item.route)}
          />
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/10 px-3 py-4">
        {bottomNav.map((item) => (
          <NavButton
            key={item.route}
            item={item}
            active={route === item.route}
            onClick={() => nav(item.route)}
          />
        ))}
        <div className="px-3 pt-3 text-[10px] leading-relaxed text-slate-600">
          Prototype build · simulated data
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 lg:block">{content}</aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={onCloseMobile} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">{content}</aside>
        </div>
      )}
    </>
  );
}
