/**
 * Slot generation. Every function here is PURE: output depends only on the
 * arguments, nothing outside is touched, and no clock or database is consulted.
 * `now` is passed IN for exactly that reason -- a function that calls
 * Date.now() internally cannot be tested, because any assertion about "past
 * slots are excluded" passes today and fails tomorrow.
 */

/** How many minutes ahead of UTC `timeZone` is at this particular instant. */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const p: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(instant)) p[type] = value;

  // Read the zone's wall clock, then pretend that reading was UTC. The gap
  // between that and the real instant IS the offset.
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return (asUtc - (instant.getTime() - instant.getMilliseconds())) / 60000;
}

/**
 * Turn a wall-clock time in a zone ("09:00 on 2026-08-25 in Asia/Kolkata")
 * into the UTC instant it refers to.
 *
 * Two passes are needed because the offset depends on the instant, and we are
 * trying to find the instant. The first guess lands close enough that the
 * second lookup is correct even across a daylight-saving boundary.
 */
export function zonedWallTimeToUtc(
  year: number, month: number, day: number,
  minutesFromMidnight: number, timeZone: string,
): Date {
  const guess = Date.UTC(
    year, month - 1, day,
    Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60,
  );

  const firstOffset = zoneOffsetMinutes(new Date(guess), timeZone);
  let utc = guess - firstOffset * 60000;

  const secondOffset = zoneOffsetMinutes(new Date(utc), timeZone);
  if (secondOffset !== firstOffset) utc = guess - secondOffset * 60000;

  return new Date(utc);
}

export type Slot = { startAt: Date; endAt: Date };

export type WorkingHourLike = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};

export type GenerateSlotsInput = {
  /** The calendar day being asked about, "YYYY-MM-DD" in the clinic's zone. */
  date: string;
  /** IANA zone, e.g. "Asia/Kolkata". From DoctorProfile.timezone. */
  timezone: string;
  slotDurationMin: number;
  workingHours: WorkingHourLike[];
  /** Days this doctor is on leave, "YYYY-MM-DD". */
  leaveDates: string[];
  /** Start instants already taken: appointments AND unexpired holds. */
  busyStarts: Date[];
  /** Injected, never read from the clock. This is what keeps it pure. */
  now: Date;
  /** How far ahead a slot must be to still be bookable. */
  minNoticeMinutes?: number;
};

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  // A leave day removes the whole day regardless of working hours.
  if (input.leaveDates.includes(input.date)) return [];

  const [year, month, day] = input.date.split("-").map(Number);

  // A calendar date's weekday does not depend on timezone, so this is safe.
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  const busy = new Set(input.busyStarts.map((d) => d.getTime()));
  const cutoff = input.now.getTime() + (input.minNoticeMinutes ?? 0) * 60000;

  const seen = new Set<number>(); // overlapping shifts must not duplicate slots
  const slots: Slot[] = [];

  for (const wh of input.workingHours) {
    if (wh.dayOfWeek !== dayOfWeek) continue;

    // `<=` on the END of the slot: a slot that would run past closing time is
    // never offered. 09:00-10:00 with 45min slots yields ONE slot, not two.
    for (
      let minute = wh.startMinute;
      minute + input.slotDurationMin <= wh.endMinute;
      minute += input.slotDurationMin
    ) {
      const startAt = zonedWallTimeToUtc(year, month, day, minute, input.timezone);
      const t = startAt.getTime();

      if (t < cutoff) continue; // in the past, or inside the notice window
      if (busy.has(t)) continue; // already booked or held
      if (seen.has(t)) continue; // produced by an overlapping shift

      seen.add(t);
      slots.push({
        startAt,
        endAt: new Date(t + input.slotDurationMin * 60000),
      });
    }
  }

  return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
