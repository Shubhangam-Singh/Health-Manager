"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Slot = { startAt: string; label: string };

/**
 * The interactive ISLAND. Its parent page is a Server Component that queried
 * Postgres and passed plain, serialisable data down as props. Only this piece
 * ships JavaScript, because only this piece needs onClick.
 */
export default function SlotPicker({ doctorId, slots }: { doctorId: string; slots: Slot[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  async function hold(startAt: string) {
    setError(null);
    setSelected(startAt);

    const res = await fetch("/api/holds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctorId, startAt }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // 409 here means someone else took it between page render and click.
      setError(body.error ?? "Could not hold that slot");
      setSelected(null);
      startTransition(() => router.refresh()); // re-render with fresh availability
      return;
    }

    router.push("/patient/book");
  }

  if (slots.length === 0) {
    return (
      <p className="mt-6 rounded-[8px] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
        No slots available on this date. Try the next day.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="mt-3 rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
      )}
      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {slots.map((s) => (
          <li key={s.startAt}>
            <button
              onClick={() => hold(s.startAt)}
              disabled={pending || selected !== null}
              className="w-full rounded-[8px] border border-[var(--border-strong)] bg-white px-3 py-2 text-sm font-medium tabular-nums transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-ink)] disabled:opacity-40"
            >
              {selected === s.startAt ? "Holding…" : s.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-[var(--text-subtle)]">
        Selecting a time holds it for 10 minutes while you describe your symptoms, so
        nobody else can take it while you type.
      </p>
    </>
  );
}
