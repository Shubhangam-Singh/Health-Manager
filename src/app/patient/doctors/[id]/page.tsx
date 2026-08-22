import Link from "next/link";
import { notFound } from "next/navigation";
import { getDoctorPublic } from "@/server/services/doctor.service";
import { getAvailableSlots, isoDateInZone } from "@/server/services/slot.service";
import { AppError } from "@/server/lib/errors";
import { Card, CardBody, PageHeader, Badge, BTN } from "@/components/ui";
import SlotPicker from "@/components/SlotPicker";
import DatePicker from "@/components/DatePicker";
import { Suspense } from "react";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Shift a YYYY-MM-DD string by N days without touching timezones. */
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
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  // "Today" as the CLINIC sees it, not as the server happens to see it.
  const date = requested ?? isoDateInZone(new Date(), doctor.timezone);
  const slots = await getAvailableSlots(id, date);

  const timeFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: doctor.timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const dayLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <>
      <Link href="/patient/doctors" className="text-sm text-[var(--brand)] hover:underline">← Back to search</Link>

      <div className="mt-4">
        <PageHeader
          title={doctor.user.name}
          subtitle={doctor.bio ?? undefined}
          action={
            <div className="flex flex-wrap gap-2">
              <Badge tone="brand">{doctor.specialisation}</Badge>
              <Badge>{doctor.slotDurationMin} min</Badge>
            </div>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">{dayLabel}</h2>
                <p className="text-xs text-[var(--text-muted)]">All times in {doctor.timezone}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* useSearchParams needs a Suspense boundary in Next 15. */}
                <Suspense fallback={null}><DatePicker date={date} /></Suspense>
                <Link href={`?date=${addDays(date, -1)}`} className={BTN.secondary} aria-label="Previous day">←</Link>
                <Link href={`?date=${addDays(date, 1)}`} className={BTN.secondary} aria-label="Next day">→</Link>
              </div>
            </div>

            {/* Server-fetched data handed to a client island as plain props.
                Dates become strings: only JSON-serialisable values may cross
                the server/client boundary. */}
            <SlotPicker
              doctorId={doctor.id}
              slots={slots.map((s) => ({
                startAt: s.startAt.toISOString(),
                label: timeFmt.format(s.startAt),
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold">Weekly schedule</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-[var(--text-muted)]">
              {doctor.workingHours.length === 0 && <li>No hours configured yet.</li>}
              {doctor.workingHours.map((w) => (
                <li key={w.id} className="flex justify-between gap-3">
                  <span>{DAYS[w.dayOfWeek]}</span>
                  <span className="tabular-nums">{hhmm(w.startMinute)}–{hhmm(w.endMinute)}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
