import { auth } from "@/auth";
import { patientOverview } from "@/server/services/dashboard.service";
import { Card, CardBody, PageHeader, ButtonLink, Badge, EmptyState } from "@/components/ui";
import { IconCalendar, IconClipboard, IconPill } from "@/components/icons";

export default async function PatientDashboard() {
  const session = await auth();
  const { upcoming, past, activeMeds, nextAppointment } = await patientOverview(session!.user.id);

  const stats = [
    { label: "Upcoming appointments", value: upcoming, Icon: IconCalendar },
    { label: "Past appointments", value: past, Icon: IconClipboard },
    { label: "Active medication reminders", value: activeMeds, Icon: IconPill },
  ];

  return (
    <>
      <PageHeader
        title={`Hello, ${session?.user?.name?.split(" ")[0] ?? "there"}`}
        subtitle="Book an appointment, or check what is coming up."
        action={<ButtonLink href="/patient/doctors">Find a doctor</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <p className="text-3xl font-semibold tracking-tight">{s.value}</p>
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand-ink)]">
                  <s.Icon />
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{s.label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold">Next appointment</h2>
      {nextAppointment ? (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">{nextAppointment.doctor.user.name}</p>
              <p className="text-sm text-[var(--text-muted)]">{nextAppointment.doctor.specialisation}</p>
              <p className="mt-1 text-sm">
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: nextAppointment.doctor.timezone, weekday: "long", day: "numeric",
                  month: "long", hour: "2-digit", minute: "2-digit", hour12: false,
                }).format(nextAppointment.startAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone="ok">confirmed</Badge>
              <ButtonLink href="/patient/appointments" variant="secondary">View all</ButtonLink>
            </div>
          </CardBody>
        </Card>
      ) : (
        <EmptyState
          title="No upcoming appointments"
          hint="Search by specialisation and pick a time that suits you."
          action={<ButtonLink href="/patient/doctors">Find a doctor</ButtonLink>}
        />
      )}
    </>
  );
}
