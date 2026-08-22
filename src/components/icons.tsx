/**
 * Inline SVG icons. Inline rather than an icon package: each is a few hundred
 * bytes, they inherit currentColor, and there is no dependency to keep updated.
 * aria-hidden throughout — every icon here sits beside a text label.
 */
type P = { className?: string };
const base = (className?: string) => ({
  className: className ?? "h-4 w-4",
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const IconHome = (p: P) => (<svg {...base(p.className)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>);
export const IconSearch = (p: P) => (<svg {...base(p.className)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconCalendar = (p: P) => (<svg {...base(p.className)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>);
export const IconClipboard = (p: P) => (<svg {...base(p.className)}><path d="M9 4h6v3H9z" /><path d="M9 5.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-2" /><path d="M9 12h6M9 16h4" /></svg>);
export const IconUsers = (p: P) => (<svg {...base(p.className)}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M17 11.5a3 3 0 1 0-2-5.3" /><path d="M18 20a5.5 5.5 0 0 0-3-4.9" /></svg>);
export const IconStethoscope = (p: P) => (<svg {...base(p.className)}><path d="M6 3v5a4 4 0 0 0 8 0V3" /><path d="M6 3H4.5M14 3h1.5" /><path d="M10 12v2a5 5 0 0 0 5 5h.5" /><circle cx="18" cy="17" r="2.5" /></svg>);
export const IconClock = (p: P) => (<svg {...base(p.className)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const IconAlert = (p: P) => (<svg {...base(p.className)}><path d="M12 4.5 2.8 20h18.4z" /><path d="M12 10v4M12 17h.01" /></svg>);
export const IconCheck = (p: P) => (<svg {...base(p.className)}><path d="m5 13 4.5 4.5L19 7" /></svg>);
export const IconArrowRight = (p: P) => (<svg {...base(p.className)}><path d="M5 12h13M13 6l6 6-6 6" /></svg>);
export const IconPill = (p: P) => (<svg {...base(p.className)}><rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" /><path d="M8.5 8.5 15.5 15.5" /></svg>);
export const IconSparkle = (p: P) => (<svg {...base(p.className)}><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" /><path d="M18.5 4v3M20 5.5h-3" /></svg>);
