"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT, BTN, Field } from "./ui";

export default function SymptomFormCard({ holdId, expiresAt }: { holdId: string; expiresAt: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));

  // A visible countdown. The hold is enforced on the SERVER regardless; this
  // only stops the patient being surprised.
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);
  const low = left < 120000;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true); setError(null);
    const f = new FormData(e.currentTarget);

    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdId,
        symptoms: {
          rawText: f.get("rawText"),
          durationDays: Number(f.get("durationDays")),
          severity: Number(f.get("severity")),
          existingConditions: f.get("existingConditions") || undefined,
          currentMedications: f.get("currentMedications") || undefined,
        },
      }),
    });

    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not confirm the appointment");
      return;
    }
    router.push("/patient/appointments");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className={`flex items-center justify-between rounded-[8px] px-3 py-2 text-sm ${
        left === 0 ? "bg-[var(--danger-soft)] text-[var(--danger)]"
        : low ? "bg-[var(--warn-soft)] text-[var(--warn)]"
        : "bg-[var(--brand-soft)] text-[var(--brand-ink)]"}`}>
        <span>{left === 0 ? "This hold has expired" : "Slot reserved for you"}</span>
        <span className="font-medium tabular-nums">
          {left === 0 ? "00:00" : `${mins}:${String(secs).padStart(2, "0")}`}
        </span>
      </div>

      <Field label="What are you experiencing?" hint="In your own words. Your doctor reads this exactly as written.">
        <textarea name="rawText" required rows={5} minLength={10}
          placeholder="Describe your symptoms, when they started, and anything that makes them better or worse."
          className={INPUT} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How many days have you had this?">
          <input name="durationDays" type="number" min={0} required placeholder="3" className={INPUT} />
        </Field>
        <Field label="Severity (1–10)">
          <input name="severity" type="number" min={1} max={10} required placeholder="6" className={INPUT} />
        </Field>
      </div>

      <Field label="Existing conditions (optional)">
        <input name="existingConditions" placeholder="High blood pressure, asthma…" className={INPUT} />
      </Field>
      <Field label="Current medications (optional)">
        <input name="currentMedications" placeholder="Amlodipine 5mg daily…" className={INPUT} />
      </Field>

      {error && (
        <p className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
      )}

      <button type="submit" disabled={pending || left === 0} className={`${BTN.primary} w-full`}>
        {pending ? "Confirming…" : "Confirm appointment"}
      </button>
    </form>
  );
}
