"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level error boundary. Without this a thrown server error shows Next's
 * default page, which says nothing useful to a user and offers no way back.
 * Must be a client component -- it needs a reset handler.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production this is where an error reporter would go.
    console.error("[boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow)]">
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          This page could not be loaded. Your appointments and data are unaffected.
        </p>
        {/* The digest correlates this screen with a server log line, without
            exposing the error text itself — messages can leak table names. */}
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-[var(--text-subtle)]">ref: {error.digest}</p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={reset}
            className="rounded-[8px] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--on-brand)] transition hover:bg-[var(--brand-hover)]">
            Try again
          </button>
          <Link href="/"
            className="rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-sm font-medium transition hover:bg-[var(--bg-subtle)]">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
