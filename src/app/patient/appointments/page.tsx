import Link from "next/link";
import { auth } from "@/auth";
import { listPatientAppointments } from "@/server/services/booking.service";

const BADGE: Record<string, string> = {
  CONFIRMED: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  CANCELLED: "bg-red-100 text-red-800",
  COMPLETED: "bg-gray-100 text-gray-700",
  NO_SHOW: "bg-gray-100 text-gray-700",
};

export default async function PatientAppointmentsPage() {
  const session = await auth();
  const appointments = await listPatientAppointments(session!.user.id);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">My appointments</h1>
        <Link href="/patient/doctors" className="text-sm underline">Book another →</Link>
      </div>

      {appointments.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">No appointments yet.</p>
      )}

      <ul className="mt-6 space-y-3">
        {appointments.map((a) => {
          const fmt = new Intl.DateTimeFormat("en-GB", {
            timeZone: a.doctor.timezone, weekday: "short", day: "numeric",
            month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
          });
          return (
            <li key={a.id} className="rounded border border-gray-200 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{a.doctor.user.name}</p>
                  <p className="text-sm text-gray-600">{a.doctor.specialisation}</p>
                  <p className="mt-1 text-sm">{fmt.format(a.startAt)}</p>
                </div>
                <span className={`rounded px-2 py-1 text-xs ${BADGE[a.status] ?? ""}`}>
                  {a.status}
                </span>
              </div>
              {a.symptomForm && (
                <p className="mt-3 border-t pt-2 text-sm text-gray-600">
                  <span className="text-gray-400">Reported: </span>
                  {a.symptomForm.rawText.slice(0, 140)}
                  {a.symptomForm.rawText.length > 140 ? "…" : ""}
                  <span className="text-gray-400"> · severity {a.symptomForm.severity}/10</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
