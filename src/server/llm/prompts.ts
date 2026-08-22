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

// ---------------------------------------------------------------------------
// POST-VISIT SUMMARY
// ---------------------------------------------------------------------------

export const POST_VISIT_PROMPT_VERSION = "post-visit@v1";

/**
 * Assignment baseline:
 *
 *   "Convert these clinical notes into a patient-friendly summary with
 *    medication schedule and follow-up steps: <notes>"
 *
 * Improvements, each deliberate:
 *
 *  1. READING LEVEL stated explicitly. "Patient-friendly" is vague; a target
 *     of plain English at roughly age 12 is actionable.
 *  2. JARGON RULE. Told to translate clinical terms rather than drop them, so
 *     a patient can still recognise the word on a letter or a pharmacy label.
 *  3. NO NEW CLINICAL CONTENT. The model must not add advice, dosages or
 *     warnings that the doctor did not write. This is the single most
 *     important instruction in the whole prompt.
 *  4. EXPLICIT JSON SCHEMA, since the output is parsed.
 *  5. MEDICATION SCHEDULE is passed in ALREADY COMPUTED, as text. The model
 *     rewrites it in plainer words but never derives times itself -- dose
 *     arithmetic is done in code and unit-tested, not by a language model.
 *  6. TONE. Calm and factual: this is read by someone who may be worried.
 *  7. SAFETY NET. Told to include a line about seeking urgent care if things
 *     worsen, without inventing specific red-flag symptoms.
 */
export const POST_VISIT_SYSTEM = `You rewrite a doctor's clinical notes into a summary the patient can understand.

Write in plain English a 12-year-old could follow. Short sentences. No jargon:
if a clinical term matters, give the everyday word and keep the medical one in
brackets so the patient recognises it later.

CRITICAL: do not add any clinical content the doctor did not write. No extra
advice, no dosages, no warnings, no diagnoses of your own. If the notes do not
say something, it does not appear in your summary.

The medication schedule is given to you already worked out. Rephrase it more
simply. Never calculate, change or invent timings or doses.

Tone: calm and factual. The reader may be worried.

Return ONLY a JSON object. No prose before or after. No markdown code fences.

Schema:
{
  "patientFriendlyText": string,   // 3-5 short sentences, max 800 characters
  "medicationSchedule": string,    // plain-English restatement, max 500 characters
  "followUpSteps": string[]        // 2-4 concrete next steps, each max 200 characters
}

Always include one follow-up step advising the patient to seek urgent care if
symptoms get significantly worse, without naming specific symptoms the doctor
did not mention.`;

export function buildPostVisitPrompt(input: {
  clinicalNotes: string;
  diagnosis?: string | null;
  followUpDays?: number | null;
  medications: { drugName: string; dose: string; schedule: string; durationDays: number; instructions?: string | null }[];
}): string {
  const meds = input.medications.length
    ? input.medications
        .map((m) => `- ${m.drugName} ${m.dose}, ${m.schedule}, for ${m.durationDays} day(s)${m.instructions ? ` (${m.instructions})` : ""}`)
        .join("\n")
    : "None prescribed.";

  return [
    `Clinical notes: ${input.clinicalNotes}`,
    input.diagnosis ? `Diagnosis recorded: ${input.diagnosis}` : "",
    input.followUpDays ? `Follow-up requested in: ${input.followUpDays} day(s)` : "",
    ``,
    `Medications (schedule already calculated — rephrase, do not recalculate):`,
    meds,
    ``,
    `Return the JSON object described in the schema.`,
  ].filter(Boolean).join("\n");
}
