import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";
import NavLink from "./NavLink";
import { IconHome, IconSearch, IconCalendar, IconClipboard, IconUsers, IconStethoscope } from "./icons";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: Record<string, Item[]> = {
  PATIENT: [
    { href: "/patient/dashboard", label: "Overview", icon: IconHome },
    { href: "/patient/doctors", label: "Find a doctor", icon: IconSearch },
    { href: "/patient/appointments", label: "Appointments", icon: IconClipboard },
    { href: "/patient/calendar", label: "Calendar", icon: IconCalendar },
  ],
  DOCTOR: [
    { href: "/doctor/dashboard", label: "Overview", icon: IconHome },
    { href: "/doctor/appointments", label: "Appointments", icon: IconStethoscope },
  ],
  ADMIN: [
    { href: "/admin/dashboard", label: "Overview", icon: IconHome },
    { href: "/admin/doctors", label: "Doctors", icon: IconUsers },
  ],
};

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role ?? "PATIENT";
  const items = NAV[role] ?? [];
  const initials = (session?.user?.name ?? "?")
    .split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">H</span>
            <span className="hidden sm:inline">Health Manager</span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {items.map((i) => (
              <NavLink key={i.href} href={i.href} label={i.label}>
                <i.icon className="h-4 w-4 shrink-0" />
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden text-right md:block">
              <p className="text-sm font-medium leading-tight">{session?.user?.name}</p>
              <p className="text-xs capitalize leading-tight text-[var(--text-muted)]">{role.toLowerCase()}</p>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand-ink)]">
              {initials}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>

      <footer className="border-t border-[var(--border)] py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 text-xs text-[var(--text-subtle)]">
          <span>Health Manager — demo application, not for real clinical use.</span>
          <span>AI summaries are assistive only. Always read the patient&apos;s own words.</span>
        </div>
      </footer>
    </div>
  );
}
