import { z } from "zod";

// The ONLY shape the register endpoint will accept. Anything else is rejected
// before a single line of business logic runs.
export const registerSchema = z.object({
  // ORDER MATTERS. zod validates first and transforms after, so
  // `z.email().trim()` rejects "  a@b.com  " before trim ever runs.
  // `.pipe()` forces the sequence: normalise, THEN validate.
  // Mobile keyboards add trailing spaces constantly, so this is not academic.
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address")),

  // 8 is a floor, not a recommendation. Length beats complexity rules:
  // "correct horse battery staple" is far stronger than "P@ss1!".
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),

  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),

  // Optional. "" from an untouched form input is normalised to undefined.
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{7,20}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

// The parsed, trusted type. Inferred from the schema, so it can never drift
// out of sync with the validation rules.
export type RegisterInput = z.infer<typeof registerSchema>;

// Login is deliberately laxer than registration: we validate SHAPE only, never
// rules like minimum length. An old account whose password predates a rule
// change must still be able to log in -- the stored hash is the only authority.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
