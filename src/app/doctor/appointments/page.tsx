import Link from "next/link";
import { auth } from "@/auth";
import { listDoctorAppointments } from "@/server/services/appointment.service";
import { Card, CardBody, PageHeader, StatusBadge, UrgencyBadge, Badge, EmptyState } from "@/components/ui";
import { IconClock, IconAlert, IconArrowRight } from "@/components/icons";

export default async function DoctorAppointmentsPage() {
  const session = await auth();
  const { timezone, appointments } = await listDoctorAppointments(session!.user.id);

  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const fmtDay = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, weekday: "long", day: "numeric", month: "long",
  });

  // Group by day, in the clinic's timezone. A clinic thinks in days, not in a
  // flat list, and the grouping is what makes a schedule readable at a glance.
  const groups = new Map<string, typeof appointments>();
  for (const a of appointments) {
    const key = fmtDay.format(a.startAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle={`${appointments.length} total · all times in ${timezone}`}
      />

      {appointments.length === 0 && (
        <EmptyState title="No appointments booked" hint="Patients will appear here as they book." />
      )}

      <div className="space-y-8">
        {[...groups.entries()].map(([day, list]) => (
          <section key={day}>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-sm font-semibold">{day}</h2>
              <span className="h-px flex-1 bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-subtle)]">{list.length} appointment{list.length > 1 ? "s" : ""}</span>
            </div>

            <div className="space-y-2.5">
              {list.map((a) => {
                const s = a.preVisitSummary;
                const past = a.startAt.getTime() < now;
                const needsNotes = past && a.status === "CONFIRMED";

                return (
                  <Card key={a.id} className={s?.urgency === "HIGH" ? "border-l-4 border-l-[var(--danger)]" : undefined}>
                    <CardBody className="flex flex-wrap items-start gap-4">
                      {/* Time rail: scanning a day means scanning times. */}
                      <div className="w-16 shrink-0">
                        <p className="text-lg font-semibold tabular-nums leading-tight">{fmtTime.format(a.startAt)}</p>
                        <p className="text-xs text-[var(--text-subtle)]">
                          {Math.round((a.endAt.getTime() - a.startAt.getTime()) / 60000)} min
                        </p>
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.patient.name}</p>
                        {s?.status === "READY" && s.chiefComplaint ? (
                          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{s.chiefComplaint}</p>
                        ) : s?.status === "FAILED" ? (
                          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                            Summary unavailable — open to read the patient&apos;s own words
                          </p>
                        ) : a.symptomForm ? (
                          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-[var(--text-subtle)]">
                            <IconClock className="h-3.5 w-3.5" /> Summary being prepared…
                          </p>
                        ) : (
                          <p className="mt-0.5 text-sm text-[var(--text-subtle)]">No symptom form submitted</p>
                        )}

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {s?.status === "READY" && s.urgency && <UrgencyBadge urgency={s.urgency} />}
                          <StatusBadge status={a.status} />
                          {a.symptomForm && <Badge>severity {a.symptomForm.severity}/10</Badge>}
                          {needsNotes && (
                            <Badge tone="warn">
                              <IconAlert className="mr-1 h-3 w-3" /> notes due
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Link href={`/doctor/appointments/${a.id}`}
                        className="flex shrink-0 items-center gap-1.5 self-center text-sm font-medium text-[var(--brand)] hover:underline">
                        Open <IconArrowRight className="h-4 w-4" />
                      </Link>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
