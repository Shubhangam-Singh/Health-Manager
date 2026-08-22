/**
 * Versioned prompts. Every generated summary stores the promptVersion that
 * produced it, so when output quality changes you can tell whether the model
 * moved or the prompt did. Bump the version on ANY edit to the text.
 *
 * These constants are the source for the README's "LLM prompts" section.
 */

export const PRE_VISIT_PROMPT_VERSION = "pre-visit@v1";

/**
 * The assignment supplies a baseline prompt:
 *
 *   "Analyse these symptoms and return: urgency level (Low / Medium / High),
 *    chief complaint, and three suggested questions for the doctor.
 *    Symptoms: <symptoms>"
 *
 * Kept and improved. Each change below is deliberate:
 *
 *  1. ROLE. "Clinical intake assistant" anchors register and vocabulary.
 *  2. EXPLICIT JSON SCHEMA with exact key names. The baseline says what to
 *     return but not in what shape, so the model narrates. We parse this, so
 *     the shape is not optional.
 *  3. "JSON only, no markdown fences" — the single most common cause of a
 *     JSON.parse failure is a ```json wrapper.
 *  4. ENUM values spelled exactly as stored (LOW/MEDIUM/HIGH), so no
 *     normalisation step is needed and zod can reject anything else.
 *  5. LENGTH LIMITS, so a doctor sees a summary rather than an essay.
 *  6. SAFETY BOUNDARY. It must not diagnose or prescribe: this output goes to
 *     a clinician as triage context, not to a patient as advice.
 *  7. STRUCTURED CONTEXT (duration, severity, conditions, medications) rather
 *     than free text alone. Severity and duration drive urgency, so they are
 *     given as their own fields instead of being buried in prose.
 *  8. UNCERTAINTY RULE. Told explicitly to use the patient's own words rather
 *     than invent specifics -- an LLM asked to be helpful will otherwise
 *     supply plausible detail that was never reported.
 */
export const PRE_VISIT_SYSTEM = `You are a clinical intake assistant for a healthcare booking system.
You summarise patient-reported symptoms for a doctor to read before a consultation.

You do NOT diagnose. You do NOT recommend treatment or medication.
You describe what the patient reported and flag how soon they may need to be seen.
If information is missing, say so plainly. Never invent symptoms, timelines or
history that the patient did not report.

Return ONLY a JSON object. No prose before or after. No markdown code fences.

Schema:
{
  "urgency": "LOW" | "MEDIUM" | "HIGH",
  "chiefComplaint": string,        // one sentence, max 120 characters
  "summary": string,               // 2-3 sentences for the doctor, max 400 characters
  "suggestedQuestions": string[]   // exactly 3 questions the doctor should ask
}

Urgency guidance:
- HIGH: red-flag features (chest pain, breathing difficulty, severe bleeding,
  sudden neurological changes, severity 9-10, or rapid worsening)
- MEDIUM: persistent or worsening symptoms, moderate severity, or symptoms
  lasting more than two weeks
- LOW: mild, stable, or clearly self-limiting complaints`;

export function buildPreVisitPrompt(input: {
  rawText: string;
  durationDays: number;
  severity: number;
  existingConditions?: string | null;
  currentMedications?: string | null;
  patientAgeNote?: string;
}): string {
  return [
    `Symptoms (patient's own words): ${input.rawText}`,
    `Duration: ${input.durationDays} day(s)`,
    `Severity (patient-rated, 1-10): ${input.severity}`,
    `Existing conditions: ${input.existingConditions?.trim() || "none reported"}`,
    `Current medications: ${input.currentMedications?.trim() || "none reported"}`,
    input.patientAgeNote ?? "",
    ``,
    `Return the JSON object described in the schema.`,
  ].filter(Boolean).join("\n");
}
