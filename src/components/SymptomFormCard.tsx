"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function SymptomFormCard({ holdId, expiresAt }: { holdId: string; expiresAt: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [left, setLeft] = useState(() => Math.max(0, new Date(expiresAt).getTime() - Date.now()));

  // A visible countdown. The hold is enforced on the SERVER regardless -- this
  // only stops the patient being surprised.
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, new Date(expiresAt).getTime() - Date.now())), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  const mins = Math.floor(left / 60000);
  const secs = Math.floor((left % 60000) / 1000);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
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
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <p className={`text-xs ${left < 120000 ? "text-red-600" : "text-gray-500"}`}>
        {left === 0 ? "This hold has expired." : `Slot held for ${mins}:${String(secs).padStart(2, "0")}`}
      </p>

      <textarea name="rawText" required rows={5} placeholder="What are you experiencing?"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
      <div className="flex gap-3">
        <input name="durationDays" type="number" min={0} required placeholder="Days"
          className="w-1/2 rounded border border-gray-300 px-3 py-2 text-sm" />
        <input name="severity" type="number" min={1} max={10} required placeholder="Severity 1-10"
          className="w-1/2 rounded border border-gray-300 px-3 py-2 text-sm" />
      </div>
      <input name="existingConditions" placeholder="Existing conditions (optional)"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
      <input name="currentMedications" placeholder="Current medications (optional)"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={pending || left === 0}
        className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Confirming…" : "Confirm appointment"}
      </button>
    </form>
  );
}
