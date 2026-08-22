"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-[8px] border border-[var(--border-strong)] bg-white px-3 py-1.5 text-sm text-[var(--text)] transition hover:bg-gray-50"
    >
      Sign out
    </button>
  );
}
