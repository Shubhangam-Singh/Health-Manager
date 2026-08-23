import Link from "next/link";
import { auth } from "@/auth";
import { listPatientAppointments } from "@/server/services/booking.service";
import { Card, CardBody, PageHeader, ButtonLink, StatusBadge, EmptyState, Badge } from "@/components/ui";
import { IconClipboard } from "@/components/icons";
import CancelAppointment from "@/components/CancelAppointment";

export const metadata = { title: "My appointments · Health Manager", description: "Past and upcoming appointments, summaries and prescriptions." };

type Props = { searchParams: Promise<{ show?: string }> };

export default async function PatientAppointmentsPage({ searchParams }: Props) {
  const { show } = await searchParams;
  const session = await auth();
  const all = await listPatientAppointments(session!.user.id);

  // Filtering in the URL rather than in client state: the view is shareable,
  // survives a refresh, and needs no JavaScript.
  const now = Date.now();
  const isUpcoming = (d: Date) => d.getTime() >= now;
  const counts = {
    all: all.length,
    upcoming: all.filter((a) => isUpcoming(a.startAt) && a.status === "CONFIRMED").length,
    past: all.filter((a) => !isUpcoming(a.startAt) || a.status !== "CONFIRMED").length,
  };
  const appointments =
    show === "upcoming" ? all.filter((a) => isUpcoming(a.startAt) && a.status === "CONFIRMED")
    : show === "past" ? all.filter((a) => !isUpcoming(a.startAt) || a.status !== "CONFIRMED")
    : all;

  const tabs = [
    { key: undefined, label: "All", n: counts.all },
    { key: "upcoming", label: "Upcoming", n: counts.upcoming },
    { key: "past", label: "Past", n: counts.past },
  ];

  return (
    <>
      <PageHeader
        title="My appointments"
        subtitle="Everything booked, past and upcoming."
        action={<ButtonLink href="/patient/doctors">Book another</ButtonLink>}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const active = show === t.key || (!show && !t.key);
          return (
            <Link key={t.label} href={t.key ? `?show=${t.key}` : "/patient/appointments"}
              className={`rounded-full border px-3.5 py-1.5 text-xs transition ${active
                ? "border-[var(--brand)] bg-[var(--brand-soft)] font-medium text-[var(--brand-ink)]"
                : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)]"}`}>
              {t.label} <span className="tabular-nums opacity-70">{t.n}</span>
            </Link>
          );
        })}
      </div>

      {appointments.length === 0 && (
        <EmptyState
          icon={<IconClipboard className="h-5 w-5" />}
          title={
            counts.all === 0 ? "No appointments yet"
            : show === "upcoming" ? "Nothing coming up"
            : "No past appointments"
          }
          hint={
            counts.all === 0
              ? "Once you book, this is where you will find your confirmations, the summary your doctor writes afterwards, and any prescription."
              : show === "upcoming"
                ? "You have no confirmed appointments in the future."
                : "Appointments move here once they have happened or been cancelled."
          }
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

                {a.status === "CONFIRMED" && isUpcoming(a.startAt) && (
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <Link href={`/patient/appointments/${a.id}/reschedule`}
                      className="text-sm font-medium text-[var(--brand)] hover:underline">
                      Reschedule
                    </Link>
                    <CancelAppointment appointmentId={a.id} />
                  </div>
                )}

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
