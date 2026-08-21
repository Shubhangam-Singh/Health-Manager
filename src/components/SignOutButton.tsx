"use client";

import { signOut } from "next-auth/react";

// Client component: it needs an onClick. Signing out clears the session cookie,
// then sends the user to "/", which renders the logged-out landing page.
export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded border border-gray-300 px-3 py-1 text-sm"
    >
      Sign out
    </button>
  );
}
