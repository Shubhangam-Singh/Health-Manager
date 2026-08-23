"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Slot = { startAt: string; label: string };

/**
 * Picking a new time is a single request, unlike booking: there is no hold,
 * because the appointment already exists and moving it is one atomic update.
 * If someone else takes the slot in between, the partial unique index rejects
 * it and the server returns 409, which is shown here.
 */
export default function ReschedulePicker({
  appointmentId,
  slots,
}: {
  appointmentId: string;
  slots: Slot[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function move(startAt: string) {
    setPending(startAt);
    setError(null);

    const res = await fetch(`/api/appointments/${appointmentId}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startAt }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not move the appointment");
      setPending(null);
      router.refresh(); // availability may have changed under us
      return;
    }

    router.push("/patient/appointments");
    router.refresh();
  }

  if (slots.length === 0) {
    return (
      <p className="mt-6 rounded-[8px] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
        No free slots on this date. Try another day.
      </p>
    );
  }

  return (
    <>
      {error && (
        <p className="mt-3 rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {slots.map((s) => (
          <li key={s.startAt}>
            <button
              onClick={() => move(s.startAt)}
              disabled={pending !== null}
              className="w-full rounded-[8px] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-sm font-medium tabular-nums transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-ink)] disabled:opacity-40"
            >
              {pending === s.startAt ? "Moving…" : s.label}
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-xs text-[var(--text-subtle)]">
        Your symptom form, summaries and any prescription stay attached to this
        appointment. Both you and your doctor are emailed the new time, and the
        calendar event is updated rather than recreated.
      </p>
    </>
  );
}
