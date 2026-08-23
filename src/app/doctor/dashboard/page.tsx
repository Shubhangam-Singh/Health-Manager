import { auth } from "@/auth";
import { doctorOverview } from "@/server/services/dashboard.service";
import { Card, CardBody, PageHeader, ButtonLink, EmptyState, Badge } from "@/components/ui";
import { IconClock, IconCalendar, IconClipboard, IconAlert } from "@/components/icons";

export const metadata = { title: "Overview · Health Manager", description: "Your day at a glance." };

export default async function DoctorDashboard() {
  const session = await auth();
  const data = await doctorOverview(session!.user.id);

  if (!data) {
    return <EmptyState title="No doctor profile" hint="An administrator needs to finish setting up this account." />;
  }
  const { profile, today, upcoming, needingNotes, highUrgency } = data;

  const stats = [
    { label: "In the next 24 hours", value: today, Icon: IconClock },
    { label: "Upcoming total", value: upcoming, Icon: IconCalendar },
    { label: "Awaiting your notes", value: needingNotes, tone: (needingNotes ?? 0) > 0, Icon: IconClipboard },
    { label: "Flagged high urgency", value: highUrgency, tone: (highUrgency ?? 0) > 0, Icon: IconAlert },
  ];

  return (
    <>
      <PageHeader
        title={session?.user?.name ?? "Doctor"}
        subtitle={`${profile.specialisation} · ${profile.slotDurationMin}-minute appointments · ${profile.timezone}`}
        action={<ButtonLink href="/doctor/appointments">View appointments</ButtonLink>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <p className={`text-3xl font-semibold tracking-tight ${s.tone ? "text-[var(--danger)]" : ""}`}>
                  {s.value ?? "—"}
                </p>
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${
                  s.tone ? "bg-[var(--danger-soft)] text-[var(--danger)]" : "bg-[var(--brand-soft)] text-[var(--brand-ink)]"}`}>
                  <s.Icon />
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--text-muted)]">{s.label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {(highUrgency ?? 0) > 0 && (
        <div className="mt-6">
          <Card className="border-[var(--danger)]">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone="danger">attention</Badge>
                  <p className="font-medium">
                    {highUrgency} appointment{(highUrgency ?? 0) > 1 ? "s" : ""} flagged high urgency
                  </p>
                </div>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  The urgency is AI-generated from the patient&apos;s own description. Always read
                  their words as well.
                </p>
              </div>
              <ButtonLink href="/doctor/appointments" variant="secondary">Review</ButtonLink>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
