import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getActiveHold } from "@/server/services/hold.service";
import SymptomFormCard from "@/components/SymptomFormCard";

export default async function BookPage() {
  const session = await auth();
  const hold = await getActiveHold(session!.user.id);

  // SERVER-SIDE GATE. Reaching this page without a live hold means the hold
  // expired or was never taken. The UI could hide the page, but the check that
  // matters is this one -- and the identical check runs again in the booking
  // transaction, because a hold can expire between rendering and submitting.
  if (!hold) redirect("/patient/doctors");

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: hold.doctor.timezone,
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-bold">Describe your symptoms</h1>
      <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        <p className="font-medium">{hold.doctor.user.name}</p>
        <p className="text-gray-600">{hold.doctor.specialisation}</p>
        <p className="mt-1">{fmt.format(hold.startAt)} ({hold.doctor.timezone})</p>
      </div>

      <SymptomFormCard holdId={hold.id} expiresAt={hold.expiresAt.toISOString()} />
    </main>
  );
}
