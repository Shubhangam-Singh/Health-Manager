"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT, BTN } from "./ui";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type Block = { dayOfWeek: number; startMinute: number; endMinute: number };

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export default function WorkingHoursEditor({ doctorId, initial }: { doctorId: string; initial: Block[] }) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(initial);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const update = (i: number, patch: Partial<Block>) =>
    setBlocks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  async function save() {
    setPending(true); setMsg(null);
    // PUT replaces the entire week, which makes it idempotent: sending the
    // same payload twice leaves exactly the same state.
    const res = await fetch(`/api/admin/doctors/${doctorId}/working-hours`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingHours: blocks }),
    });
    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      const detail = b.fields?.workingHours?.[0];
      setMsg({ tone: "bad", text: detail ?? b.error ?? "Could not save the schedule" });
      return;
    }
    setMsg({ tone: "ok", text: "Schedule saved." });
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-2">
      {blocks.length === 0 && (
        <p className="text-sm text-[var(--text-subtle)]">
          No working hours. This doctor has no bookable slots.
        </p>
      )}

      {blocks.map((b, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select value={b.dayOfWeek} onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })}
            className={`${INPUT} w-32`}>
            {DAYS.map((d, n) => <option key={n} value={n}>{d}</option>)}
          </select>
          <input type="time" value={toTime(b.startMinute)}
            onChange={(e) => update(i, { startMinute: toMinutes(e.target.value) })}
            className={`${INPUT} w-28`} />
          <span className="text-sm text-[var(--text-subtle)]">to</span>
          <input type="time" value={toTime(b.endMinute)}
            onChange={(e) => update(i, { endMinute: toMinutes(e.target.value) })}
            className={`${INPUT} w-28`} />
          <button type="button" onClick={() => setBlocks((x) => x.filter((_, j) => j !== i))}
            className="rounded-md px-2 py-1 text-sm text-[var(--danger)] hover:bg-[var(--danger-soft)]">
            Remove
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-2">
        <button type="button" className={BTN.secondary}
          onClick={() => setBlocks((b) => [...b, { dayOfWeek: 1, startMinute: 540, endMinute: 780 }])}>
          + Add block
        </button>
        <button type="button" onClick={save} disabled={pending} className={BTN.primary}>
          {pending ? "Saving…" : "Save week"}
        </button>
      </div>

      {msg && (
        <p className={`rounded-[8px] px-3 py-2 text-sm ${msg.tone === "ok"
          ? "bg-[var(--ok-soft)] text-[var(--ok)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
