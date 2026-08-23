"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * Jump straight to a date instead of clicking Prev/Next repeatedly. It drives
 * the URL rather than local state, so the page stays server-rendered and the
 * chosen date remains shareable and bookmarkable.
 */
export default function DatePicker({ date }: { date: string }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <input
      type="date"
      value={date}
      aria-label="Jump to date"
      onChange={(e) => {
        const next = new URLSearchParams(params.toString());
        next.set("date", e.target.value);
        router.push(`?${next.toString()}`);
      }}
      className="rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-sm tabular-nums"
    />
  );
}
