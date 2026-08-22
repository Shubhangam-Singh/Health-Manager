import Link from "next/link";
import { auth } from "@/auth";
import { listDoctorAppointments } from "@/server/services/appointment.service";
import { Card, CardBody, PageHeader, StatusBadge, UrgencyBadge, Badge, EmptyState } from "@/components/ui";

export default async function DoctorAppointmentsPage() {
  const session = await auth();
  const { timezone, appointments } = await listDoctorAppointments(session!.user.id);

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  // High-urgency first within the list is tempting, but chronological order is
  // what a clinic day actually looks like; urgency is signalled by colour.
  return (
    <>
      <PageHeader title="Appointments" subtitle={`All times in ${timezone}`} />

      {appointments.length === 0 && (
        <EmptyState title="No appointments booked" hint="Patients will appear here as they book." />
      )}

      <div className="space-y-3">
        {appointments.map((a) => {
          const s = a.preVisitSummary;
          return (
            <Card key={a.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm tabular-nums text-[var(--text-muted)]">{fmt.format(a.startAt)}</p>
                    <p className="mt-0.5 font-medium">{a.patient.name}</p>

                    {s?.status === "READY" && s.chiefComplaint ? (
                      <p className="mt-1 text-sm">{s.chiefComplaint}</p>
                    ) : s?.status === "FAILED" ? (
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Summary unavailable — open to read the patient&apos;s own words
                      </p>
                    ) : a.symptomForm ? (
                      <p className="mt-1 text-sm text-[var(--text-subtle)]">Summary being prepared…</p>
                    ) : (
                      <p className="mt-1 text-sm text-[var(--text-subtle)]">No symptom form submitted</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {s?.status === "READY" && s.urgency && <UrgencyBadge urgency={s.urgency} />}
                    <StatusBadge status={a.status} />
                    {a.symptomForm && (
                      <Badge>severity {a.symptomForm.severity}/10</Badge>
                    )}
                  </div>
                </div>

                <Link href={`/doctor/appointments/${a.id}`}
                  className="mt-3 inline-block text-sm font-medium text-[var(--brand)] hover:underline">
                  Open patient →
                </Link>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
