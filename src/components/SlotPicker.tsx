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
    return <p className="mt-4 text-sm text-gray-500">No slots available on this date.</p>;
  }

  return (
    <>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {slots.map((s) => (
          <li key={s.startAt}>
            <button
              onClick={() => hold(s.startAt)}
              disabled={pending || selected !== null}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm hover:border-black disabled:opacity-40"
            >
              {selected === s.startAt ? "Holding…" : s.label}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-gray-400">
        Selecting a time holds it for 10 minutes while you describe your symptoms.
      </p>
    </>
  );
}
