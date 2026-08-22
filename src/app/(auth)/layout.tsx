import Link from "next/link";

// Route group: (auth) never appears in the URL. It exists so /login and
// /register share this centred shell without sharing a path prefix.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="mb-6 flex items-center gap-2 font-semibold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--brand)] text-sm font-bold text-white">H</span>
        Health Manager
      </Link>
      <div className="w-full max-w-sm rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow)]">
        {children}
      </div>
      <p className="mt-6 text-xs text-[var(--text-subtle)]">Demo application. Not for real clinical use.</p>
    </div>
  );
}
