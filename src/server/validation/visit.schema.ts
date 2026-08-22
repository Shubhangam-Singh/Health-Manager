import { z } from "zod";

const FREQUENCIES = [
  "ONCE_DAILY", "TWICE_DAILY", "THRICE_DAILY", "FOUR_TIMES_DAILY",
  "EVERY_OTHER_DAY", "WEEKLY", "AS_NEEDED",
] as const;

export const medicationSchema = z.object({
  drugName: z.string().trim().min(1, "Drug name is required").max(120),
  dose: z.string().trim().min(1, "Dose is required").max(80),
  // Structured, not free text: reminders are computed from these.
  frequency: z.enum(FREQUENCIES, `frequency must be one of: ${FREQUENCIES.join(", ")}`),
  durationDays: z.number().int().min(1, "Duration must be at least 1 day").max(365),
  instructions: z.string().trim().max(300).optional(),
});

export const visitNoteSchema = z.object({
  note: z.object({
    clinicalNotes: z.string().trim().min(10, "Clinical notes must be at least 10 characters").max(5000),
    diagnosis: z.string().trim().max(300).optional(),
    followUpDays: z.number().int().min(0).max(365).optional(),
  }),
  prescriptionNotes: z.string().trim().max(1000).optional(),
  medications: z.array(medicationSchema).max(20).default([]),
});

export type VisitNoteInput = z.infer<typeof visitNoteSchema>;
