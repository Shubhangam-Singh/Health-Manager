import Link from "next/link";
import { auth } from "@/auth";
import { listDoctorAppointments } from "@/server/services/appointment.service";

const URGENCY: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export default async function DoctorAppointmentsPage() {
  const session = await auth();
  const { timezone, appointments } = await listDoctorAppointments(session!.user.id);

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-bold">My appointments</h1>
      <p className="mt-1 text-sm text-gray-500">Times shown in {timezone}</p>

      {appointments.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">No appointments booked yet.</p>
      )}

      <ul className="mt-6 space-y-3">
        {appointments.map((a) => {
          const s = a.preVisitSummary;
          return (
            <li key={a.id} className="rounded border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold">{fmt.format(a.startAt)}</p>
                  <p className="text-sm text-gray-600">{a.patient.name}</p>

                  {/* Chief complaint when we have one; otherwise say WHY not.
                      Never render a blank space and leave the doctor guessing. */}
                  {s?.status === "READY" && s.chiefComplaint ? (
                    <p className="mt-1 truncate text-sm">{s.chiefComplaint}</p>
                  ) : s?.status === "FAILED" ? (
                    <p className="mt-1 text-sm text-gray-500">
                      Summary unavailable — open to read the patient&apos;s own words
                    </p>
                  ) : a.symptomForm ? (
                    <p className="mt-1 text-sm text-gray-400">Summary being prepared…</p>
                  ) : (
                    <p className="mt-1 text-sm text-gray-400">No symptom form submitted</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  {s?.status === "READY" && s.urgency && (
                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${URGENCY[s.urgency]}`}>
                      {s.urgency}
                    </span>
                  )}
                  {a.symptomForm && (
                    <span className="text-xs text-gray-400">
                      severity {a.symptomForm.severity}/10
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{a.status}</span>
                </div>
              </div>

              <Link href={`/doctor/appointments/${a.id}`}
                className="mt-3 inline-block text-sm underline">
                Open →
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
