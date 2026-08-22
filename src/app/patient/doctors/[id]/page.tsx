import Link from "next/link";
import { notFound } from "next/navigation";
import { getDoctorPublic } from "@/server/services/doctor.service";
import { getAvailableSlots, isoDateInZone } from "@/server/services/slot.service";
import { AppError } from "@/server/lib/errors";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Shift a "YYYY-MM-DD" string by N days without touching timezones. */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default async function DoctorAvailabilityPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { date: requested } = await searchParams;

  let doctor;
  try {
    doctor = await getDoctorPublic(id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound(); // renders 404
    throw e;
  }

  // Default to "today" as the CLINIC sees it, not as the server sees it.
  const date = requested ?? isoDateInZone(new Date(), doctor.timezone);
  const slots = await getAvailableSlots(id, date);

  // Render each instant back into clinic-local time for display.
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: doctor.timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/patient/doctors" className="text-sm underline">← Back to search</Link>

      <h1 className="mt-4 text-xl font-bold">{doctor.user.name}</h1>
      <p className="text-sm text-gray-600">{doctor.specialisation}</p>
      {doctor.bio && <p className="mt-1 text-sm text-gray-500">{doctor.bio}</p>}

      <section className="mt-6 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold">Weekly schedule</h2>
        <ul className="mt-2 space-y-1 text-sm text-gray-600">
          {doctor.workingHours.length === 0 && <li>No hours configured.</li>}
          {doctor.workingHours.map((w) => (
            <li key={w.id}>
              {DAYS[w.dayOfWeek]} · {hhmm(w.startMinute)}–{hhmm(w.endMinute)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-400">Times shown in {doctor.timezone}</p>
      </section>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Available on {date}</h2>
          <div className="flex gap-2 text-sm">
            <Link href={`?date=${addDays(date, -1)}`} className="rounded border px-2 py-1">← Prev</Link>
            <Link href={`?date=${addDays(date, 1)}`} className="rounded border px-2 py-1">Next →</Link>
          </div>
        </div>

        {slots.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No slots available on this date.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => (
              <li key={s.startAt.toISOString()}
                className="rounded border border-gray-300 px-3 py-2 text-center text-sm">
                {fmt.format(s.startAt)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-400">
          Booking arrives in Step 17 — selecting a slot will place a hold.
        </p>
      </section>
    </main>
  );
}
