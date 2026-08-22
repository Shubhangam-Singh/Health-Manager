"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { INPUT, BTN, Field } from "@/components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true); setError(null); setFields({});

    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: f.get("name"), phone: f.get("phone") || undefined }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPending(false);
      if (body.fields) setFields(body.fields);        // 400: per-field messages
      setError(body.error ?? "Could not create your account");  // 409: one message
      return;
    }

    // Registering only creates the row, so sign in straight away rather than
    // making a new user type the same credentials again.
    const signed = await signIn("credentials", { email, password, redirect: false });
    setPending(false);
    if (signed?.error) { router.push("/login"); return; } // account exists regardless
    router.push("/");
    router.refresh();
  }

  const err = (n: string) =>
    fields[n]?.[0] ? <p className="mt-1 text-xs text-[var(--danger)]">{fields[n][0]}</p> : null;

  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">Create your account</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Patients can register here.</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <Field label="Full name">
          <input name="name" required autoComplete="name" placeholder="Asha Verma" className={INPUT} />
          {err("name")}
        </Field>
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email" placeholder="you@example.com" className={INPUT} />
          {err("email")}
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input name="password" type="password" required minLength={8} autoComplete="new-password"
            placeholder="••••••••" className={INPUT} />
          {err("password")}
        </Field>
        <Field label="Phone (optional)">
          <input name="phone" autoComplete="tel" placeholder="+91 90000 00000" className={INPUT} />
          {err("phone")}
        </Field>

        {error && (
          <p className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>
        )}

        <button type="submit" disabled={pending} className={`${BTN.primary} w-full`}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-[var(--text-muted)]">
        Already registered?{" "}
        <Link href="/login" className="font-medium text-[var(--brand)] hover:underline">Sign in</Link>
      </p>
    </>
  );
}
