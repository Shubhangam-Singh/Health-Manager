import { prisma } from "@/server/lib/prisma";
import { generateJson } from "@/server/llm/client";
import {
  PRE_VISIT_SYSTEM,
  PRE_VISIT_PROMPT_VERSION,
  buildPreVisitPrompt,
} from "@/server/llm/prompts";
import { preVisitSummarySchema, parseModelJson } from "@/server/llm/schemas";

/**
 * Generate the pre-visit summary for an appointment.
 *
 * NEVER throws and NEVER blocks booking. The appointment is already committed
 * before this runs; the worst outcome here is a FAILED row, and the doctor's
 * UI falls back to the raw symptom text.
 *
 * Safe to call repeatedly: it exits early if the summary is already READY.
 */
export async function generatePreVisitSummary(appointmentId: string): Promise<void> {
  const existing = await prisma.preVisitSummary.findUnique({ where: { appointmentId } });
  if (existing?.status === "READY") return;

  const form = await prisma.symptomForm.findUnique({ where: { appointmentId } });
  if (!form) return; // nothing to summarise

  const result = await generateJson(
    PRE_VISIT_SYSTEM,
    buildPreVisitPrompt({
      rawText: form.rawText,
      durationDays: form.durationDays,
      severity: form.severity,
      existingConditions: form.existingConditions,
      currentMedications: form.currentMedications,
    }),
  );

  const attempts = (existing?.attempts ?? 0) + 1;

  // The model never answered: timeout, 5xx, missing key.
  if (!result.ok) {
    await fail(appointmentId, attempts, result.error, null);
    return;
  }

  // It answered, but the answer may still be unusable.
  const parsed = parseModelJson(result.text, preVisitSummarySchema);
  if (!parsed.ok) {
    // rawModelOutput is kept precisely for this case -- you cannot fix a
    // prompt you cannot see the output of.
    await fail(appointmentId, attempts, parsed.error, result.text);
    return;
  }

  await prisma.preVisitSummary.upsert({
    where: { appointmentId },
    create: {
      appointmentId,
      status: "READY",
      ...parsed.data,
      rawModelOutput: result.text,
      promptVersion: PRE_VISIT_PROMPT_VERSION,
      attempts,
      generatedAt: new Date(),
      lastError: null,
    },
    update: {
      status: "READY",
      ...parsed.data,
      rawModelOutput: result.text,
      promptVersion: PRE_VISIT_PROMPT_VERSION,
      attempts,
      generatedAt: new Date(),
      lastError: null,
    },
  });
}

async function fail(appointmentId: string, attempts: number, error: string, raw: string | null) {
  const data = {
    status: "FAILED" as const,
    lastError: error.slice(0, 500),
    rawModelOutput: raw,
    promptVersion: PRE_VISIT_PROMPT_VERSION,
    attempts,
  };
  await prisma.preVisitSummary.upsert({
    where: { appointmentId },
    create: { appointmentId, ...data },
    update: data,
  });
}
