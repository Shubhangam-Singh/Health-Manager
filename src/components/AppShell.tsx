import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";

/**
 * Shared chrome for every signed-in page. A Server Component, so the nav is
 * rendered from the session with no client JavaScript beyond the sign-out
 * button.
 */
const NAV: Record<string, { href: string; label: string }[]> = {
  PATIENT: [
    { href: "/patient/dashboard", label: "Overview" },
    { href: "/patient/doctors", label: "Find a doctor" },
    { href: "/patient/appointments", label: "My appointments" },
    { href: "/patient/calendar", label: "Calendar" },
  ],
  DOCTOR: [
    { href: "/doctor/dashboard", label: "Overview" },
    { href: "/doctor/appointments", label: "Appointments" },
  ],
  ADMIN: [
    { href: "/admin/dashboard", label: "Overview" },
    { href: "/admin/doctors", label: "Doctors" },
  ],
};

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const role = session?.user?.role ?? "PATIENT";
  const links = NAV[role] ?? [];

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--brand)] text-xs font-bold text-white">
              H
            </span>
            Health Manager
          </Link>

          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href}
                className="rounded-md px-3 py-1.5 text-[var(--text-muted)] transition hover:bg-gray-100 hover:text-[var(--text)]">
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{session?.user?.name}</p>
              <p className="text-xs capitalize leading-tight text-[var(--text-muted)]">
                {role.toLowerCase()}
              </p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
