"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // stop the browser's own full-page form POST
    setPending(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    // redirect:false => we handle the outcome ourselves instead of letting
    // Auth.js bounce the page and lose whatever the user typed.
    const res = await signIn("credentials", {
      email: form.get("email"),
      password: form.get("password"),
      redirect: false,
    });

    setPending(false);

    if (res?.error) {
      // Deliberately vague: never reveal whether the email exists (see D17).
      setError("Invalid email or password");
      return;
    }

    router.push("/"); // "/" decides which portal, on the server
    router.refresh(); // discard cached logged-out server content
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input name="email" type="email" required placeholder="Email"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
      <input name="password" type="password" required placeholder="Password"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={pending}
        className="w-full rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-xs text-gray-500">
        No account? <Link href="/register" className="underline">Register</Link>
      </p>
    </form>
  );
}
