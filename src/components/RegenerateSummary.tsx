"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        className="rounded border border-gray-300 px-3 py-1 text-sm hover:border-black disabled:opacity-50">
        {pending ? "Generating…" : "Regenerate summary"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
