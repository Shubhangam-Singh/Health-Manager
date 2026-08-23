"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT, BTN } from "./ui";

const FREQUENCIES = [
  ["ONCE_DAILY", "Once a day"],
  ["TWICE_DAILY", "Twice a day"],
  ["THRICE_DAILY", "Three times a day"],
  ["FOUR_TIMES_DAILY", "Four times a day"],
  ["EVERY_OTHER_DAY", "Every other day"],
  ["WEEKLY", "Weekly"],
  ["AS_NEEDED", "As needed"],
] as const;

type Med = { drugName: string; dose: string; frequency: string; durationDays: number; instructions: string };
const blank = (): Med => ({ drugName: "", dose: "", frequency: "TWICE_DAILY", durationDays: 7, instructions: "" });

export default function VisitNotesForm({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [meds, setMeds] = useState<Med[]>([blank()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Med>) =>
    setMeds((m) => m.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true); setError(null);
    const f = new FormData(e.currentTarget);

    const res = await fetch(`/api/appointments/${appointmentId}/visit-notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: {
          clinicalNotes: f.get("clinicalNotes"),
          diagnosis: f.get("diagnosis") || undefined,
          followUpDays: f.get("followUpDays") ? Number(f.get("followUpDays")) : undefined,
        },
        prescriptionNotes: f.get("prescriptionNotes") || undefined,
        // Blank rows are dropped rather than sent as validation errors.
        medications: meds
          .filter((m) => m.drugName.trim() && m.dose.trim())
          .map((m) => ({ ...m, instructions: m.instructions || undefined })),
      }),
    });

    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not save the notes");
      return;
    }
    router.refresh();
  }

  const input = INPUT;

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3">
      <textarea name="clinicalNotes" required rows={5} minLength={10}
        placeholder="Clinical notes (what you observed, tests, plan)…" className={input} />
      <div className="flex gap-3">
        <input name="diagnosis" placeholder="Diagnosis (optional)" className={input} />
        <input name="followUpDays" type="number" min={0} placeholder="Follow-up in days" className="w-48 rounded border border-[var(--border-strong)] px-3 py-2 text-sm" />
      </div>

      <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-subtle)] p-4">
        <p className="text-sm font-semibold">Prescription</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Frequency and duration are structured, because medication reminders are
          computed from them.
        </p>
        {meds.map((m, i) => (
          <div key={i} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <input value={m.drugName} onChange={(e) => update(i, { drugName: e.target.value })}
              placeholder="Drug" className={input} />
            <input value={m.dose} onChange={(e) => update(i, { dose: e.target.value })}
              placeholder="Dose" className={input} />
            <select value={m.frequency} onChange={(e) => update(i, { frequency: e.target.value })} className={input}>
              {FREQUENCIES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <input type="number" min={1} value={m.durationDays}
              onChange={(e) => update(i, { durationDays: Number(e.target.value) })}
              placeholder="Days" className={input} />
            <input value={m.instructions} onChange={(e) => update(i, { instructions: e.target.value })}
              placeholder="Instructions" className={input} />
          </div>
        ))}
        <button type="button" onClick={() => setMeds((m) => [...m, blank()])}
          className={`${BTN.secondary} mt-3 px-3 py-1.5 text-xs`}>+ Add medication</button>
      </div>

      <input name="prescriptionNotes" placeholder="Prescription notes (optional)" className={input} />

      {error && <p className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}

      <button type="submit" disabled={pending}
        className={`${BTN.primary} w-full`}>
        {pending ? "Saving…" : "Save notes and prescription"}
      </button>
    </form>
  );
}
