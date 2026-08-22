import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getDoctorAppointment } from "@/server/services/appointment.service";
import { AppError } from "@/server/lib/errors";
import RegenerateSummary from "@/components/RegenerateSummary";

const URGENCY: Record<string, string> = {
  HIGH: "bg-red-100 text-red-800 border-red-300",
  MEDIUM: "bg-amber-100 text-amber-800 border-amber-300",
  LOW: "bg-green-100 text-green-800 border-green-300",
};

export default async function DoctorAppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  let data;
  try {
    data = await getDoctorAppointment(session!.user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { timezone, appointment: a } = data;
  const form = a.symptomForm;
  const s = a.preVisitSummary;

  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, weekday: "long", day: "numeric", month: "long",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/doctor/appointments" className="text-sm underline">← All appointments</Link>

      <h1 className="mt-4 text-xl font-bold">{a.patient.name}</h1>
      <p className="text-sm text-gray-600">{fmt.format(a.startAt)} · {a.status}</p>
      <p className="text-sm text-gray-500">
        {a.patient.email}{a.patient.phone ? ` · ${a.patient.phone}` : ""}
      </p>

      {/* ------------------------------------------------------------------
          THE AI SUMMARY. Three states, three different renderings. Never a
          blank card, and never a crash on a null field.
         ------------------------------------------------------------------ */}
      <section className="mt-6 rounded border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Pre-visit summary</h2>
          {s?.status === "READY" && s.urgency && (
            <span className={`rounded border px-2 py-0.5 text-xs font-medium ${URGENCY[s.urgency]}`}>
              {s.urgency} urgency
            </span>
          )}
        </div>

        {s?.status === "READY" ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="font-medium">{s.chiefComplaint}</p>
            <p className="text-gray-700">{s.summary}</p>
            {s.suggestedQuestions.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Suggested questions</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-gray-700">
                  {s.suggestedQuestions.map((q, i) => <li key={i}>{q}</li>)}
                </ol>
              </div>
            )}
            <p className="text-xs text-gray-400">
              AI-generated from the patient&apos;s form · {s.promptVersion}
            </p>
          </div>
        ) : s?.status === "PENDING" ? (
          <p className="mt-3 text-sm text-gray-500">
            Being prepared. The patient&apos;s own words are below and are complete.
          </p>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-gray-600">
              The summary could not be generated. The patient&apos;s own account is below
              and contains everything they reported — nothing has been lost.
            </p>
            {s?.lastError && (
              <p className="mt-1 text-xs text-gray-400">Reason: {s.lastError}</p>
            )}
          </div>
        )}

        {/* Regenerate offered whenever we do not have a good summary. */}
        {form && s?.status !== "READY" && <RegenerateSummary appointmentId={a.id} />}
      </section>

      {/* ------------------------------------------------------------------
          THE PATIENT'S OWN WORDS. Always rendered, never dependent on the LLM.
          This is what makes the summary an enhancement rather than a
          dependency: a doctor reading only this section is exactly as
          well-informed as one at a clinic with no AI at all.
         ------------------------------------------------------------------ */}
      <section className="mt-4 rounded border border-gray-200 p-4">
        <h2 className="text-sm font-semibold">Reported by the patient</h2>
        {form ? (
          <div className="mt-3 space-y-2 text-sm">
            <p className="whitespace-pre-wrap text-gray-800">{form.rawText}</p>
            <dl className="grid grid-cols-2 gap-1 pt-2 text-gray-600">
              <div><dt className="inline text-gray-400">Duration: </dt><dd className="inline">{form.durationDays} day(s)</dd></div>
              <div><dt className="inline text-gray-400">Severity: </dt><dd className="inline">{form.severity}/10</dd></div>
              <div className="col-span-2"><dt className="inline text-gray-400">Conditions: </dt><dd className="inline">{form.existingConditions || "none reported"}</dd></div>
              <div className="col-span-2"><dt className="inline text-gray-400">Medications: </dt><dd className="inline">{form.currentMedications || "none reported"}</dd></div>
            </dl>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-500">No symptom form was submitted.</p>
        )}
      </section>
    </main>
  );
}
