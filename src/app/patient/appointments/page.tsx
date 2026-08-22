import { auth } from "@/auth";
import { listPatientAppointments } from "@/server/services/booking.service";
import { Card, CardBody, PageHeader, ButtonLink, StatusBadge, EmptyState, Badge } from "@/components/ui";

export default async function PatientAppointmentsPage() {
  const session = await auth();
  const appointments = await listPatientAppointments(session!.user.id);

  return (
    <>
      <PageHeader
        title="My appointments"
        subtitle="Everything booked, past and upcoming."
        action={<ButtonLink href="/patient/doctors">Book another</ButtonLink>}
      />

      {appointments.length === 0 && (
        <EmptyState
          title="No appointments yet"
          hint="Find a doctor by specialisation and pick a time."
          action={<ButtonLink href="/patient/doctors">Find a doctor</ButtonLink>}
        />
      )}

      <div className="space-y-4">
        {appointments.map((a) => {
          const fmt = new Intl.DateTimeFormat("en-GB", {
            timeZone: a.doctor.timezone, weekday: "short", day: "numeric", month: "short",
            hour: "2-digit", minute: "2-digit", hour12: false,
          });
          const post = a.postVisitSummary;

          return (
            <Card key={a.id}>
              <CardBody>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{a.doctor.user.name}</p>
                    <p className="text-sm text-[var(--text-muted)]">{a.doctor.specialisation}</p>
                    <p className="mt-1 text-sm tabular-nums">{fmt.format(a.startAt)}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>

                {a.symptomForm && (
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                      What you reported
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {a.symptomForm.rawText.slice(0, 180)}
                      {a.symptomForm.rawText.length > 180 ? "…" : ""}
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-subtle)]">
                      severity {a.symptomForm.severity}/10 · {a.symptomForm.durationDays} day(s)
                    </p>
                  </div>
                )}

                {/* Three states again. FAILED still shows the prescription,
                    which is the part that actually matters. */}
                {post?.status === "READY" && (
                  <div className="mt-4 rounded-[8px] bg-[var(--brand-soft)]/40 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--brand-ink)]">
                      After your visit
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed">{post.patientFriendlyText}</p>
                    {post.medicationSchedule && (
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        <span className="font-medium text-[var(--text)]">Medication: </span>
                        {post.medicationSchedule}
                      </p>
                    )}
                    {post.followUpSteps.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-muted)]">
                        {post.followUpSteps.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    )}
                  </div>
                )}
                {post?.status === "PENDING" && (
                  <p className="mt-4 text-sm text-[var(--text-subtle)]">Your visit summary is being prepared…</p>
                )}

                {a.prescription && a.prescription.items.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border)] pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                      Prescription
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {a.prescription.items.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{m.drugName}</span>
                          <span className="text-[var(--text-muted)]">{m.dose}</span>
                          <Badge>{m.frequency.toLowerCase().replace(/_/g, " ")}</Badge>
                          <span className="text-xs text-[var(--text-subtle)]">{m.durationDays} days</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </>
  );
}
