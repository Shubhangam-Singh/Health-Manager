"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DisconnectCalendar() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      onClick={async () => {
        setPending(true);
        await fetch("/api/google/disconnect", { method: "POST" });
        setPending(false);
        router.refresh();
      }}
      disabled={pending}
      className="mt-3 rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
