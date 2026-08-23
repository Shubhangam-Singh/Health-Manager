import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

// Route group: (auth) never appears in the URL. It exists so /login and
// /register share this centred shell without sharing a path prefix.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--brand)] text-sm font-bold text-[var(--on-brand)]">
            H
          </span>
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">Health Manager</span>
            <span className="block text-[10px] text-[var(--text-subtle)]">by Shubhangam</span>
          </span>
        </Link>
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
        {children}
      </div>
      <p className="mt-6 text-xs text-[var(--text-subtle)]">Demo application. Not for real clinical use.</p>
    </div>
  );
}
