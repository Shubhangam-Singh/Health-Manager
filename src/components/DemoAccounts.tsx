"use client";

import { useState } from "react";

/**
 * One-click demo credentials on the login screen.
 *
 * An evaluator opening this app cold should not have to hunt through a README
 * for a password. Only shown when NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS is on, so a
 * real deployment can switch it off with an env var rather than a code change.
 */
const ACCOUNTS = [
  { role: "Patient", email: "asha@example.test", password: "patient12345", hint: "book, symptoms, summaries" },
  { role: "Doctor", email: "mehta@clinic.test", password: "doctor12345", hint: "triage, notes, prescriptions" },
  { role: "Admin", email: "admin@clinic.test", password: "admin12345", hint: "doctors, schedules, leave" },
];

export default function DemoAccounts({ onPick }: { onPick: (email: string, password: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-4">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
        <span>Demo accounts</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>

      {open && (
        <ul className="mt-3 space-y-1.5">
          {ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button type="button" onClick={() => onPick(a.email, a.password)}
                className="w-full rounded-[8px] border border-[var(--border)] px-3 py-2 text-left transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)]">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{a.role}</span>
                  <span className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">fill</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{a.email}</span>
                <span className="block text-xs text-[var(--text-subtle)]">{a.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
