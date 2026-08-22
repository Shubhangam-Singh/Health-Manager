"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { INPUT, BTN, Field } from "./ui";
import DemoAccounts from "./DemoAccounts";

export default function LoginForm({ initialError, showDemo }: { initialError?: string; showDemo?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);
  // Controlled so the demo buttons can fill them.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);

    // redirect:false so a failure renders inline instead of reloading the page
    // and discarding whatever the user typed.
    const res = await signIn("credentials", { email, password, redirect: false });
    setPending(false);

    if (res?.error) {
      // Deliberately vague: never reveal whether the email exists (D17).
      setError("Invalid email or password");
      return;
    }
    router.push("/");   // "/" routes by role, on the server
    router.refresh();   // drop cached logged-out server content
  }

  return (
    <>
      <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">Welcome back.</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <Field label="Email">
          <input name="email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com" className={INPUT} />
        </Field>
        <Field label="Password">
          <input name="password" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" className={INPUT} />
        </Field>

        {error && (
          <p className="rounded-[8px] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <button type="submit" disabled={pending} className={`${BTN.primary} w-full`}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {showDemo && (
        <DemoAccounts onPick={(e, p) => { setEmail(e); setPassword(p); setError(null); }} />
      )}

      <p className="mt-5 text-center text-sm text-[var(--text-muted)]">
        No account?{" "}
        <Link href="/register" className="font-medium text-[var(--brand)] hover:underline">
          Create one
        </Link>
      </p>
    </>
  );
}
