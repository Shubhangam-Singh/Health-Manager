import { prisma } from "@/server/lib/prisma";
import { generateJson } from "@/server/llm/client";
import {
  PRE_VISIT_SYSTEM,
  PRE_VISIT_PROMPT_VERSION,
  buildPreVisitPrompt,
} from "@/server/llm/prompts";
import { preVisitSummarySchema, postVisitSummarySchema, parseModelJson } from "@/server/llm/schemas";
import {
  POST_VISIT_SYSTEM,
  POST_VISIT_PROMPT_VERSION,
  buildPostVisitPrompt,
} from "@/server/llm/prompts";
import { medicationLines } from "./visit.service";

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

// ---------------------------------------------------------------------------
// POST-VISIT SUMMARY — same three-state pattern, same failure discipline.
// ---------------------------------------------------------------------------


/** Never throws. Worst case is a FAILED row; the patient still sees the notes. */
export async function generatePostVisitSummary(appointmentId: string): Promise<void> {
  const existing = await prisma.postVisitSummary.findUnique({ where: { appointmentId } });
  if (existing?.status === "READY") return;

  const note = await prisma.visitNote.findUnique({ where: { appointmentId } });
  if (!note) return;

  const result = await generateJson(
    POST_VISIT_SYSTEM,
    buildPostVisitPrompt({
      clinicalNotes: note.clinicalNotes,
      diagnosis: note.diagnosis,
      followUpDays: note.followUpDays,
      medications: await medicationLines(appointmentId),
    }),
  );

  const attempts = (existing?.attempts ?? 0) + 1;

  if (!result.ok) {
    await failPost(appointmentId, attempts, result.error, null);
    return;
  }

  const parsed = parseModelJson(result.text, postVisitSummarySchema);
  if (!parsed.ok) {
    await failPost(appointmentId, attempts, parsed.error, result.text);
    return;
  }

  const data = {
    status: "READY" as const,
    ...parsed.data,
    rawModelOutput: result.text,
    promptVersion: POST_VISIT_PROMPT_VERSION,
    attempts,
    generatedAt: new Date(),
    lastError: null,
  };
  await prisma.postVisitSummary.upsert({
    where: { appointmentId },
    create: { appointmentId, ...data },
    update: data,
  });
}

async function failPost(appointmentId: string, attempts: number, error: string, raw: string | null) {
  const data = {
    status: "FAILED" as const,
    lastError: error.slice(0, 500),
    rawModelOutput: raw,
    promptVersion: POST_VISIT_PROMPT_VERSION,
    attempts,
  };
  await prisma.postVisitSummary.upsert({
    where: { appointmentId },
    create: { appointmentId, ...data },
    update: data,
  });
}

/**
 * Sweep summaries that are not READY and try again.
 *
 * Two gaps this closes:
 *  - `after()` is best effort. If the serverless instance is torn down before
 *    generation runs, the row stays PENDING for ever.
 *  - A transient failure (a 429 from a free-tier quota, a timeout) leaves a
 *    FAILED row that nothing would ever revisit, even though the next attempt
 *    would likely succeed.
 *
 * Bounded by `maxAttempts` so a genuinely broken prompt is not retried
 * indefinitely; those stay FAILED and visible, and a doctor can still press
 * Regenerate by hand.
 */
export async function retryStuckSummaries(maxAttempts = 4, batchSize = 10) {
  const [pre, post] = await Promise.all([
    prisma.preVisitSummary.findMany({
      where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: maxAttempts } },
      select: { appointmentId: true },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    }),
    prisma.postVisitSummary.findMany({
      where: { status: { in: ["PENDING", "FAILED"] }, attempts: { lt: maxAttempts } },
      select: { appointmentId: true },
      orderBy: { updatedAt: "asc" },
      take: batchSize,
    }),
  ]);

  // Sequential, not parallel: the failure being retried is often a rate limit,
  // and firing ten concurrent requests at a throttled API makes it worse.
  for (const p of pre) await generatePreVisitSummary(p.appointmentId);
  for (const p of post) await generatePostVisitSummary(p.appointmentId);

  return { preVisitRetried: pre.length, postVisitRetried: post.length };
}
