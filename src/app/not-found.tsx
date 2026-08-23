import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow)]">
        <p className="text-sm font-medium text-[var(--brand)]">404</p>
        <h1 className="mt-1 text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This page does not exist — or it belongs to someone else, in which case it
          looks the same from here.
        </p>
        <Link href="/"
          className="mt-5 inline-flex rounded-[8px] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--on-brand)] transition hover:bg-[var(--brand-hover)]">
          Go home
        </Link>
      </div>
    </div>
  );
}
