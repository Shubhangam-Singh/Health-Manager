"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BTN } from "./ui";

export default function RegenerateSummary({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/appointments/${appointmentId}/summary`, { method: "POST" });
    setPending(false);

    if (!res.ok) {
      setError("Could not reach the server. Try again.");
      return;
    }
    // The endpoint returns the summary, but the page renders it server-side --
    // so refresh rather than duplicating the rendering logic in the client.
    router.refresh();
  }

  return (
    <div className="mt-3">
      <button onClick={run} disabled={pending}
        className={BTN.secondary}>
        {pending ? "Generating…" : "Regenerate summary"}
      </button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
    </div>
  );
}
