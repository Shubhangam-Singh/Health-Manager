"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BTN, INPUT } from "./ui";

/**
 * Two-step, deliberately. Cancelling emails the other party and removes their
 * calendar event, so it should not be one stray click away.
 */
export default function CancelAppointment({ appointmentId, label = "Cancel appointment" }: {
  appointmentId: string; label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setPending(true); setError(null);
    const res = await fetch(`/api/appointments/${appointmentId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined }),
    });
    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not cancel");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}
        className="text-sm font-medium text-[var(--danger)] hover:underline">
        {label}
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-[8px] border border-[var(--danger)] bg-[var(--danger-soft)] p-3">
      <p className="text-sm font-medium text-[var(--danger)]">Cancel this appointment?</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        The other party is emailed and the calendar event is removed. This cannot be undone —
        you would need to book again.
      </p>
      <input value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)" className={`${INPUT} mt-2`} />
      {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={cancel} disabled={pending} className={BTN.danger}>
          {pending ? "Cancelling…" : "Yes, cancel it"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className={BTN.secondary}>
          Keep it
        </button>
      </div>
    </div>
  );
}
