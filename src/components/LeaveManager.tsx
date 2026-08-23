"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT, BTN } from "./ui";

type Affected = { id: string; startAt: string; patientName: string; patientEmail: string };

/**
 * Two-phase, deliberately. Checking a date is read-only; applying requires a
 * second, explicit action once the admin has seen exactly who is affected.
 */
export default function LeaveManager({ doctorId, timezone }: { doctorId: string; timezone: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState<Affected[] | null>(null);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(iso));

  async function check() {
    setPending(true); setMsg(null); setChecked(null);
    const res = await fetch(`/api/admin/doctors/${doctorId}/leave?date=${date}`);
    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setMsg({ tone: "bad", text: b.error ?? "Could not check that date" });
      return;
    }
    const body = (await res.json()) as { affected: Affected[] };
    setChecked(body.affected);
  }

  async function confirm() {
    setPending(true); setMsg(null);
    const res = await fetch(`/api/admin/doctors/${doctorId}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, reason: reason || undefined, confirm: true }),
    });
    setPending(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setMsg({ tone: "bad", text: b.error ?? "Could not record the leave" });
      return;
    }
    const body = (await res.json()) as { cancelled: number; alternatives: string[] };
    setChecked(null); setDate(""); setReason("");
    setMsg({
      tone: "ok",
      text: body.cancelled
        ? `Leave recorded. ${body.cancelled} appointment(s) cancelled and patients emailed with ${body.alternatives.length} alternative times.`
        : "Leave recorded. No appointments were affected.",
    });
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setChecked(null); }}
          className={`${INPUT} w-44`} />
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional)" className={`${INPUT} flex-1 min-w-[10rem]`} />
        <button type="button" onClick={check} disabled={!date || pending} className={BTN.secondary}>
          {pending ? "Checking…" : "Check date"}
        </button>
      </div>

      {checked && (
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--bg-subtle)] p-3">
          {checked.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No appointments on this date. Recording leave will affect nobody.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-[var(--danger)]">
                {checked.length} appointment{checked.length > 1 ? "s" : ""} will be cancelled
              </p>
              <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
                {checked.map((a) => (
                  <li key={a.id}>{fmt(a.startAt)} — {a.patientName} ({a.patientEmail})</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--text-subtle)]">
                Each patient is emailed a cancellation with three alternative times.
              </p>
            </>
          )}
          <button type="button" onClick={confirm} disabled={pending}
            className={`${checked.length ? BTN.danger : BTN.primary} mt-3`}>
            {pending ? "Applying…" : checked.length ? `Confirm and cancel ${checked.length}` : "Record leave"}
          </button>
        </div>
      )}

      {msg && (
        <p className={`rounded-[8px] px-3 py-2 text-sm ${msg.tone === "ok"
          ? "bg-[var(--ok-soft)] text-[var(--ok)]" : "bg-[var(--danger-soft)] text-[var(--danger)]"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
