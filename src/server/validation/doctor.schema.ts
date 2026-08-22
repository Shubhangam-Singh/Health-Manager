import { z } from "zod";

/** One continuous shift. 540 = 09:00, 1440 = midnight (allowed as an end). */
export const workingHourSchema = z
  .object({
    dayOfWeek: z.number("dayOfWeek must be a number").int().min(0, "dayOfWeek must be 0 (Sun) to 6 (Sat)").max(6, "dayOfWeek must be 0 (Sun) to 6 (Sat)"),
    startMinute: z.number("startMinute must be a number").int().min(0, "startMinute cannot be negative").max(1439, "startMinute must be before midnight"),
    endMinute: z.number("endMinute must be a number").int().min(1, "endMinute must be positive").max(1440, "endMinute cannot exceed 1440 (midnight)"),
  })
  // Cross-field rule: zod checks this AFTER both fields pass individually.
  // The database has the same rule as a CHECK constraint -- this exists to
  // return a readable 400 instead of a raw constraint violation.
  .refine((h) => h.startMinute < h.endMinute, {
    message: "startMinute must be before endMinute",
    path: ["endMinute"],
  });

export const createDoctorSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password must be at most 72 characters"),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name must be at most 100 characters"),
  phone: z.string().trim().max(20, "Phone must be at most 20 characters").optional(),
  specialisation: z.string().trim().min(2, "Specialisation must be at least 2 characters").max(80, "Specialisation must be at most 80 characters"),
  slotDurationMin: z.number("slotDurationMin must be a number").int().min(5, "Slot duration must be at least 5 minutes").max(240, "Slot duration must be at most 240 minutes").default(30),
  bio: z.string().trim().max(1000, "Bio must be at most 1000 characters").optional(),
  workingHours: z.array(workingHourSchema).max(21, "At most 21 working-hour blocks").default([]),
});

/**
 * PATCH: every field optional, at least one required.
 *
 * DECLARED FROM SCRATCH, NOT derived via createDoctorSchema.pick().partial().
 * That derivation looks tidy and is a data-corruption bug: `.pick()` and
 * `.partial()` both PRESERVE `.default(30)` on slotDurationMin, so an empty
 * body `{}` parses to `{ slotDurationMin: 30 }` -- one key, so the
 * "at least one field" check passes, and the service then overwrites a value
 * the caller never mentioned.
 *
 * A default turns "not mentioned" into "set it to this", which is precisely
 * the opposite of PATCH semantics. No defaults belong in a PATCH schema.
 */
export const updateDoctorSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
    phone: z.string().trim().max(20).optional(),
    specialisation: z
      .string()
      .trim()
      .min(2, "Specialisation must be at least 2 characters")
      .max(80)
      .optional(),
    slotDurationMin: z
      .number("slotDurationMin must be a number")
      .int()
      .min(5, "Slot duration must be at least 5 minutes")
      .max(240, "Slot duration must be at most 240 minutes")
      .optional(),
    bio: z.string().trim().max(1000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, {
    message: "Provide at least one field to update",
  });

/** PUT: the FULL replacement set for a doctor's week. Idempotent by design. */
export const replaceWorkingHoursSchema = z.object({
  workingHours: z.array(workingHourSchema).max(21, "At most 21 working-hour blocks"),
});

export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
