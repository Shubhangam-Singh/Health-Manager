import { z } from "zod";

export const symptomFormSchema = z.object({
  // Long enough to be useful to a doctor and to the model; capped so a single
  // request cannot blow up the prompt or the row.
  rawText: z
    .string()
    .trim()
    .min(10, "Please describe your symptoms in at least 10 characters")
    .max(2000, "Please keep this under 2000 characters"),
  durationDays: z
    .number("How many days have you had this?")
    .int()
    .min(0, "Duration cannot be negative")
    .max(3650, "Duration seems too long"),
  severity: z
    .number("Rate severity from 1 to 10")
    .int()
    .min(1, "Severity must be between 1 and 10")
    .max(10, "Severity must be between 1 and 10"),
  existingConditions: z.string().trim().max(500).optional(),
  currentMedications: z.string().trim().max(500).optional(),
});

export type SymptomFormInput = z.infer<typeof symptomFormSchema>;
