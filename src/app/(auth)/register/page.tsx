"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

type FieldErrors = Record<string, string[]>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFields({});

    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        name: f.get("name"),
        phone: f.get("phone") || undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPending(false);
      // 400 carries per-field messages; 409 carries a single message.
      if (body.fields) setFields(body.fields);
      setError(body.error ?? "Could not create your account");
      return;
    }

    // Registering does NOT sign you in -- the API only creates the row. Sign
    // in with the same credentials so the user is not asked to type them
    // again immediately.
    const signed = await signIn("credentials", { email, password, redirect: false });
    setPending(false);

    if (signed?.error) {
      router.push("/login"); // account exists; let them sign in manually
      return;
    }
    router.push("/"); // "/" routes by role, exactly as after login
    router.refresh();
  }

  const err = (name: string) =>
    fields[name]?.[0] ? <p className="text-xs text-red-600">{fields[name][0]}</p> : null;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-gray-600">Create a patient account</p>

      <div className="space-y-1">
        <input name="name" required placeholder="Full name"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        {err("name")}
      </div>
      <div className="space-y-1">
        <input name="email" type="email" required placeholder="Email"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        {err("email")}
      </div>
      <div className="space-y-1">
        <input name="password" type="password" required minLength={8}
          placeholder="Password (min 8 characters)"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        {err("password")}
      </div>
      <div className="space-y-1">
        <input name="phone" placeholder="Phone (optional)"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
        {err("phone")}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={pending}
        className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-xs text-gray-500">
        Already registered? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </form>
  );
}
