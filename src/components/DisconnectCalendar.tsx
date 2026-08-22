"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BTN } from "./ui";

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
      className={`${BTN.secondary} mt-4`}
    >
      {pending ? "Disconnecting…" : "Disconnect"}
    </button>
  );
}
