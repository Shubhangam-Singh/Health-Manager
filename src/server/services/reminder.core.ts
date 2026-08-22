/**
 * Pure medication schedule maths. NO IMPORTS, so it is unit-testable.
 *
 * Turns "TWICE_DAILY for 5 days" into ten timestamped doses.
 */
export type Frequency =
  | "ONCE_DAILY" | "TWICE_DAILY" | "THRICE_DAILY"
  | "FOUR_TIMES_DAILY" | "EVERY_OTHER_DAY" | "WEEKLY" | "AS_NEEDED";

/** Clinic-local times of day for each dose, in minutes from midnight. */
const DOSE_TIMES: Record<Frequency, number[]> = {
  ONCE_DAILY: [9 * 60],                                  // 09:00
  TWICE_DAILY: [9 * 60, 21 * 60],                        // 09:00, 21:00
  THRICE_DAILY: [8 * 60, 14 * 60, 20 * 60],              // 08:00, 14:00, 20:00
  FOUR_TIMES_DAILY: [8 * 60, 12 * 60, 16 * 60, 20 * 60],
  EVERY_OTHER_DAY: [9 * 60],
  WEEKLY: [9 * 60],
  AS_NEEDED: [],                                          // no schedule
};

/** How many days apart doses repeat. */
function dayStep(f: Frequency): number {
  if (f === "EVERY_OTHER_DAY") return 2;
  if (f === "WEEKLY") return 7;
  return 1;
}

export type DoseInput = {
  frequency: Frequency;
  durationDays: number;
  /** When the course begins — normally the end of the consultation. */
  startFrom: Date;
  /** Converts a clinic wall-clock time on a date into a UTC instant. */
  toUtc: (year: number, month: number, day: number, minutes: number) => Date;
  /** Doses already in the past are not scheduled. */
  now: Date;
};

/**
 * AS_NEEDED yields nothing: there is no schedule to remind about, and inventing
 * one would tell a patient to take medication they were told to take only when
 * symptoms appear.
 */
export function computeDoseTimes(input: DoseInput): Date[] {
  const times = DOSE_TIMES[input.frequency];
  if (!times.length || input.durationDays <= 0) return [];

  const step = dayStep(input.frequency);
  const out: Date[] = [];

  const start = input.startFrom;
  const y = start.getUTCFullYear(), m = start.getUTCMonth() + 1, d = start.getUTCDate();

  for (let day = 0; day < input.durationDays; day += step) {
    const cursor = new Date(Date.UTC(y, m - 1, d + day));
    for (const minutes of times) {
      const at = input.toUtc(
        cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate(), minutes,
      );
      // Skip doses whose time has already passed, e.g. the 08:00 dose when the
      // consultation finished at 14:00.
      if (at.getTime() <= input.now.getTime()) continue;
      out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** Human-readable schedule line for the email and the summary prompt. */
export function describeFrequency(f: Frequency): string {
  switch (f) {
    case "ONCE_DAILY": return "once a day (09:00)";
    case "TWICE_DAILY": return "twice a day (09:00 and 21:00)";
    case "THRICE_DAILY": return "three times a day (08:00, 14:00, 20:00)";
    case "FOUR_TIMES_DAILY": return "four times a day (08:00, 12:00, 16:00, 20:00)";
    case "EVERY_OTHER_DAY": return "every other day (09:00)";
    case "WEEKLY": return "once a week (09:00)";
    case "AS_NEEDED": return "only when needed";
  }
}
