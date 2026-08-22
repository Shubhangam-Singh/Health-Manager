"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Highlights the section you are in. Needs the current path, which only the
 * client knows, so this is the one part of the nav that ships JavaScript.
 */
export default function NavLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  const pathname = usePathname();
  // startsWith so /patient/doctors/<id> still highlights "Find a doctor".
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]"
          : "text-[var(--text-muted)] hover:bg-gray-100 hover:text-[var(--text)]"
      }`}>
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
