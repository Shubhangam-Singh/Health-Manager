import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Small presentational primitives. Server-safe by default -- none of these
 * needs "use client", so using them costs no JavaScript.
 */

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]", className)}>
      {children}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("p-5", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4">
      <h2 className="text-sm font-semibold tracking-tight text-[var(--text)]">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type Tone = "brand" | "neutral" | "ok" | "warn" | "danger";
const TONES: Record<Tone, string> = {
  brand: "bg-[var(--brand-soft)] text-[var(--brand-ink)] border-[var(--brand-soft)]",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
  ok: "bg-[var(--ok-soft)] text-[var(--ok)] border-[var(--ok-soft)]",
  warn: "bg-[var(--warn-soft)] text-[var(--warn)] border-[var(--warn-soft)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger-soft)]",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", TONES[tone])}>
      {children}
    </span>
  );
}

const BTN_BASE = "inline-flex items-center justify-center gap-2 rounded-[8px] px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";
export const BTN = {
  primary: cx(BTN_BASE, "bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)]"),
  secondary: cx(BTN_BASE, "border border-[var(--border-strong)] bg-white text-[var(--text)] hover:bg-gray-50"),
  ghost: cx(BTN_BASE, "text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)]"),
  danger: cx(BTN_BASE, "border border-[var(--danger)] bg-white text-[var(--danger)] hover:bg-[var(--danger-soft)]"),
};

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: keyof typeof BTN }) {
  return <Link href={href} className={BTN[variant]}>{children}</Link>;
}

export const INPUT =
  "w-full rounded-[8px] border border-[var(--border-strong)] bg-white px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)]";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--text-subtle)]">{hint}</span>}
    </label>
  );
}

export function EmptyState({ title, hint, action, icon }: {
  title: string; hint?: string; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <Card className="border-dashed">
      <div className="px-5 py-12 text-center">
        {icon && (
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-gray-100 text-[var(--text-subtle)]">
            {icon}
          </div>
        )}
        <p className="text-sm font-medium text-[var(--text)]">{title}</p>
        {hint && <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--text-muted)]">{hint}</p>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </Card>
  );
}

/** A labelled key/value row, used wherever small facts are listed. */
export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-[var(--text-subtle)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export function Alert({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={cx("rounded-[8px] border px-4 py-3 text-sm", TONES[tone])}>{children}</div>
  );
}

/** Status label for an appointment. */
export function StatusBadge({ status }: { status: string }) {
  const tone: Tone =
    status === "CONFIRMED" ? "ok" :
    status === "PENDING" ? "warn" :
    status === "CANCELLED" ? "danger" :
    "neutral";
  return <Badge tone={tone}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}

/** Triage urgency. Colour is a signal here, so it is deliberately strong. */
export function UrgencyBadge({ urgency }: { urgency: string }) {
  const tone: Tone = urgency === "HIGH" ? "danger" : urgency === "MEDIUM" ? "warn" : "ok";
  return <Badge tone={tone}>{urgency} urgency</Badge>;
}
