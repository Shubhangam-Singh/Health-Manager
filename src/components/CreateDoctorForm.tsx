"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { INPUT, BTN, Field } from "./ui";

export default function CreateDoctorForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOk] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true); setError(null); setOk(null);
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;

    const res = await fetch("/api/admin/doctors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: f.get("email"),
        password: f.get("password"),
        name: f.get("name"),
        specialisation: f.get("specialisation"),
        slotDurationMin: Number(f.get("slotDurationMin")),
        bio: f.get("bio") || undefined,
        workingHours: [], // set on the doctor's own page, as a whole week
      }),
    });
    setPending(false);

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Could not create the doctor");
      return;
    }
    form.reset();
    setOk("Doctor created. Set their working hours from the list.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <Field label="Full name">
        <input name="name" required placeholder="Dr Rajiv Mehta" className={INPUT} />
      </Field>
      <Field label="Email">
        <input name="email" type="email" required placeholder="mehta@clinic.test" className={INPUT} />
      </Field>
      <Field label="Temporary password" hint="At least 8 characters.">
        <input name="password" type="password" required minLength={8} className={INPUT} />
      </Field>
      <Field label="Specialisation">
        <input name="specialisation" required placeholder="Cardiology" className={INPUT} />
      </Field>
      <Field label="Slot duration (minutes)">
        <input name="slotDurationMin" type="number" min={5} max={240} defaultValue={30} required className={INPUT} />
      </Field>
      <Field label="Bio (optional)">
        <input name="bio" placeholder="Interventional cardiologist" className={INPUT} />
      </Field>

      {error && <p className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
      {okMsg && <p className="rounded-[8px] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">{okMsg}</p>}

      <button type="submit" disabled={pending} className={`${BTN.primary} w-full`}>
        {pending ? "Creating…" : "Create doctor"}
      </button>
    </form>
  );
}
