import { z } from "zod";

/**
 * The contract we hold the model to.
 *
 * Prompting for a shape is a request, not a guarantee. Models return prose
 * around the JSON, wrap it in ```json fences, invent extra keys, emit "high"
 * instead of "HIGH", or return four questions when told three. Validating here
 * means a bad response becomes a FAILED row with the raw output kept for
 * inspection -- never a crash, and never garbage rendered to a doctor.
 */
export const preVisitSummarySchema = z.object({
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
  chiefComplaint: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(600),
  // Told to return exactly 3. Accept 1-5 and trim, because rejecting an
  // otherwise good summary over an off-by-one count serves nobody.
  suggestedQuestions: z.array(z.string().trim().min(1).max(300)).min(1).max(5),
});

export type PreVisitSummaryOutput = z.infer<typeof preVisitSummarySchema>;

/**
 * Strips the wrapper models add despite being told not to, then parses.
 * Returns a typed result rather than throwing.
 */
export function parseModelJson<T>(
  raw: string,
  schema: z.ZodType<T>,
): { ok: true; data: T } | { ok: false; error: string } {
  let text = raw.trim();

  // ```json ... ``` is by far the most common violation of "no fences".
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) text = fence[1].trim();

  // Some models still add a sentence before or after the object.
  if (!text.startsWith("{")) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : String(e)}` };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, error: `schema mismatch: ${z.prettifyError(result.error).slice(0, 300)}` };
  }
  return { ok: true, data: result.data };
}

export const postVisitSummarySchema = z.object({
  patientFriendlyText: z.string().trim().min(1).max(1200),
  medicationSchedule: z.string().trim().max(800),
  followUpSteps: z.array(z.string().trim().min(1).max(300)).min(1).max(6),
});

export type PostVisitSummaryOutput = z.infer<typeof postVisitSummarySchema>;
