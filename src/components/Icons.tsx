interface IconProps {
  className?: string;
}

const base = (className?: string) => className ?? "w-5 h-5";

export const SparkIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)}>
    <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z" />
    <path d="M19 15l1 2.7 2.7 1-2.7 1-1 2.7-1-2.7-2.7-1 2.7-1 1-2.7z" opacity="0.7" />
  </svg>
);

const stroke = (className?: string) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: base(className),
});

export const DashboardIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const WorkflowIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <circle cx="6" cy="5" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <circle cx="6" cy="19" r="2.2" />
    <path d="M8.2 5H13a3 3 0 013 3v1.8M15.8 12H11a3 3 0 00-3 3v1.8" />
  </svg>
);

export const UsersIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20c.5-3.5 2.8-5.5 5.5-5.5s5 2 5.5 5.5" />
    <path d="M15.5 8.5a2.8 2.8 0 110 5" />
    <path d="M17 14.8c2 .5 3.3 2.2 3.6 4.7" />
  </svg>
);

export const WalletIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <rect x="3" y="6" width="18" height="14" rx="2.5" />
    <path d="M3 10h18M16.5 15h.9" />
    <path d="M7 6l9-2.6a1.5 1.5 0 011.9 1.4V6" />
  </svg>
);

export const SettingsIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1 1.55V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.11-1.55 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.55-1H3a2 2 0 110-4h.09a1.7 1.7 0 001.55-1.11 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.09a1.7 1.7 0 001-1.55V3a2 2 0 114 0v.09a1.7 1.7 0 001 1.55 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87v.09a1.7 1.7 0 001.55 1H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.51 1z" />
  </svg>
);

export const UserIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20.5c.7-4 3.5-6 7-6s6.3 2 7 6" />
  </svg>
);

export const CheckIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)} strokeWidth={2.4}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

export const ClockIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const ArrowRightIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)} strokeWidth={2}>
    <path d="M4 12h15M13.5 6.5L19 12l-5.5 5.5" />
  </svg>
);

export const ArrowLeftIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)} strokeWidth={2}>
    <path d="M20 12H5M10.5 6.5L5 12l5.5 5.5" />
  </svg>
);

export const PlayIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={base(className)}>
    <path d="M8 5.8v12.4c0 .9 1 1.5 1.8 1L19.6 13a1.2 1.2 0 000-2L9.8 4.8c-.8-.5-1.8.1-1.8 1z" />
  </svg>
);

export const AlertIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <path d="M12 3.5l9.5 16.5h-19L12 3.5z" />
    <path d="M12 10v4.2M12 17.2v.1" />
  </svg>
);

export const MailIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3.5 7l8.5 6 8.5-6" />
  </svg>
);

export const MegaphoneIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <path d="M3 11v2a2 2 0 002 2h1.5l1 5h2.6l-.9-5H11l8 3.5v-15L11 9H5a2 2 0 00-2 2z" />
  </svg>
);

export const ClipboardIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
  </svg>
);

export const MenuIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)} strokeWidth={2}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const CloseIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)} strokeWidth={2}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const LockIcon = ({ className }: IconProps) => (
  <svg {...stroke(className)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 018 0v3" />
  </svg>
);
