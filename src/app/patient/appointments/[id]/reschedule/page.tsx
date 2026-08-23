import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/server/lib/prisma";
import { getAvailableSlots, isoDateInZone } from "@/server/services/slot.service";
import { Card, CardBody, PageHeader, Badge, BTN } from "@/components/ui";
import Breadcrumbs from "@/components/Breadcrumbs";
import ReschedulePicker from "@/components/ReschedulePicker";
import Link from "next/link";

export const metadata = { title: "Reschedule", description: "Move your appointment to another time." };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default async function ReschedulePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { date: requested } = await searchParams;
  const session = await auth();

  // Ownership in the query: another patient's appointment simply does not match.
  const appointment = await prisma.appointment.findFirst({
    where: { id, patientId: session!.user.id, status: "CONFIRMED" },
    include: {
      doctor: {
        select: { id: true, specialisation: true, timezone: true, user: { select: { name: true } } },
      },
    },
  });
  if (!appointment) notFound();

  const tz = appointment.doctor.timezone;
  const date = requested ?? isoDateInZone(appointment.startAt, tz);
  const slots = await getAvailableSlots(appointment.doctor.id, date);

  const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
  const fullFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const dayLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <>
      <Breadcrumbs items={[
        { href: "/patient/dashboard", label: "Overview" },
        { href: "/patient/appointments", label: "Appointments" },
        { label: "Reschedule" },
      ]} />

      <PageHeader
        title="Move your appointment"
        subtitle={`${appointment.doctor.user.name} · ${appointment.doctor.specialisation}`}
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[var(--text-subtle)]">Currently booked</p>
            <p className="mt-0.5 font-medium">{fullFmt.format(appointment.startAt)}</p>
          </div>
          <Badge tone="ok">confirmed</Badge>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{dayLabel}</h2>
              <p className="text-xs text-[var(--text-muted)]">All times in {tz}</p>
            </div>
            <div className="flex gap-2">
              <Link href={`?date=${addDays(date, -1)}`} className={BTN.secondary} aria-label="Previous day">←</Link>
              <Link href={`?date=${addDays(date, 1)}`} className={BTN.secondary} aria-label="Next day">→</Link>
            </div>
          </div>

          <ReschedulePicker
            appointmentId={appointment.id}
            slots={slots.map((s) => ({ startAt: s.startAt.toISOString(), label: timeFmt.format(s.startAt) }))}
          />
        </CardBody>
      </Card>
    </>
  );
}
