import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getDoctorAppointment } from "@/server/services/appointment.service";
import { AppError } from "@/server/lib/errors";
import { Card, CardBody, PageHeader, StatusBadge, UrgencyBadge, Badge, Alert } from "@/components/ui";
import RegenerateSummary from "@/components/RegenerateSummary";
import VisitNotesForm from "@/components/VisitNotesForm";

export default async function DoctorAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  let data;
  try {
    data = await getDoctorAppointment(session!.user.id, id);
  } catch (e) {
    // Ownership lives in the QUERY, so another doctor's appointment simply does
    // not match — indistinguishable from one that does not exist.
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { timezone, appointment: a } = data;
  const form = a.symptomForm;
  const s = a.preVisitSummary;
  const note = a.visitNote;
  const meds = a.prescription?.items ?? [];

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <>
      <Link href="/doctor/appointments" className="text-sm text-[var(--brand)] hover:underline">
        ← All appointments
      </Link>

      <div className="mt-4">
        <PageHeader
          title={a.patient.name}
          subtitle={`${fmt.format(a.startAt)} · ${a.patient.email}${a.patient.phone ? ` · ${a.patient.phone}` : ""}`}
          action={<StatusBadge status={a.status} />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* AI SUMMARY — three states, three renderings, never a blank card. */}
        <Card>
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Pre-visit summary</h2>
              {s?.status === "READY" && s.urgency && <UrgencyBadge urgency={s.urgency} />}
            </div>

            {s?.status === "READY" ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="font-medium">{s.chiefComplaint}</p>
                <p className="leading-relaxed text-[var(--text-muted)]">{s.summary}</p>
                {s.suggestedQuestions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-subtle)]">
                      Suggested questions
                    </p>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[var(--text-muted)]">
                      {s.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}
                    </ol>
                  </div>
                )}
                <p className="border-t border-[var(--border)] pt-2 text-xs text-[var(--text-subtle)]">
                  AI-generated from the patient&apos;s form · {s.promptVersion}. Always read
                  their own words below.
                </p>
              </div>
            ) : s?.status === "PENDING" ? (
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Being prepared. The patient&apos;s own words below are complete.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                <Alert tone="warn">
                  The summary could not be generated. The patient&apos;s own account is
                  below and contains everything they reported — nothing has been lost.
                </Alert>
                {s?.lastError && (
                  <p className="text-xs text-[var(--text-subtle)]">Reason: {s.lastError}</p>
                )}
              </div>
            )}

            {form && s?.status !== "READY" && <RegenerateSummary appointmentId={a.id} />}
          </CardBody>
        </Card>

        {/* THE PATIENT'S OWN WORDS. Always rendered, never dependent on the LLM. */}
        <Card>
          <CardBody>
            <h2 className="text-sm font-semibold">Reported by the patient</h2>
            {form ? (
              <div className="mt-3 space-y-3 text-sm">
                <p className="whitespace-pre-wrap leading-relaxed">{form.rawText}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge>{form.durationDays} day(s)</Badge>
                  <Badge tone={form.severity >= 8 ? "danger" : form.severity >= 5 ? "warn" : "neutral"}>
                    severity {form.severity}/10
                  </Badge>
                </div>
                <dl className="space-y-1 border-t border-[var(--border)] pt-2 text-[var(--text-muted)]">
                  <div><dt className="inline text-[var(--text-subtle)]">Conditions: </dt>
                    <dd className="inline">{form.existingConditions || "none reported"}</dd></div>
                  <div><dt className="inline text-[var(--text-subtle)]">Medications: </dt>
                    <dd className="inline">{form.currentMedications || "none reported"}</dd></div>
                </dl>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-muted)]">No symptom form was submitted.</p>
            )}
          </CardBody>
        </Card>
      </div>

      {/* AFTER THE VISIT */}
      <Card className="mt-4">
        <CardBody>
          <h2 className="text-sm font-semibold">Visit notes and prescription</h2>
          {note ? (
            <>
              <div className="mt-3 space-y-2 text-sm">
                <p className="whitespace-pre-wrap leading-relaxed">{note.clinicalNotes}</p>
                <div className="flex flex-wrap gap-2">
                  {note.diagnosis && <Badge tone="brand">{note.diagnosis}</Badge>}
                  {note.followUpDays != null && <Badge>follow up in {note.followUpDays} days</Badge>}
                </div>
                {meds.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
                    {meds.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.drugName}</span>
                        <span className="text-[var(--text-muted)]">{m.dose}</span>
                        <Badge>{m.frequency.toLowerCase().replace(/_/g, " ")}</Badge>
                        <span className="text-xs text-[var(--text-subtle)]">
                          {m.durationDays} days{m.instructions ? ` · ${m.instructions}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-[var(--brand)]">
                  Edit notes and prescription
                </summary>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Saving replaces the prescription entirely and regenerates the patient
                  summary, so no doses from the old version are left scheduled.
                </p>
                <VisitNotesForm appointmentId={a.id} />
              </details>
            </>
          ) : (
            <VisitNotesForm appointmentId={a.id} />
          )}
        </CardBody>
      </Card>
    </>
  );
}
