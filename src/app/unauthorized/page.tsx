import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow)]">
        <p className="text-3xl">🔒</p>
        <h1 className="mt-3 text-lg font-semibold tracking-tight">Not your portal</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          You are signed in, but this area belongs to a different role.
        </p>
        <Link href="/"
          className="mt-5 inline-flex items-center rounded-[8px] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--on-brand)] transition hover:bg-[var(--brand-hover)]">
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
