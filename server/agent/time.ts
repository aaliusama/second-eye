// Owner: G. Replay-clock arithmetic on "YYYY-MM-DDTHH:MM:SS" strings. No wall clock.

const toMs = (t: string) => Date.parse(`${t}Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 19);

export const dayOf = (t: string) => t.slice(0, 10);
export const hourOf = (t: string) => Number(t.slice(11, 13));
export const atClock = (day: string, clock: string) => `${day}T${clock}`;

export function addMinutes(t: string, minutes: number): string {
  return fromMs(toMs(t) + minutes * 60_000);
}

export function nextDay(day: string): string {
  return dayOf(fromMs(toMs(`${day}T00:00:00`) + 86_400_000));
}

/** No crew DMs from 21:00 to 06:00. */
export const QUIET_FROM = 21;
export const QUIET_UNTIL = 6;

export function isQuiet(t: string): boolean {
  const h = hourOf(t);
  return h >= QUIET_FROM || h < QUIET_UNTIL;
}

/** The 06:00 that ends the quiet period `t` is in (same day before 06:00, else the next day). */
export function quietEnds(t: string): string {
  const day = hourOf(t) < QUIET_UNTIL ? dayOf(t) : nextDay(dayOf(t));
  return atClock(day, "06:00:00");
}

/** Every full hour from `from` to `to`, inclusive of whole hours in range. */
export function hourly(from: string, to: string): string[] {
  const out: string[] = [];
  let t = `${from.slice(0, 13)}:00:00`;
  if (t < from) t = addMinutes(t, 60);
  while (t <= to) {
    out.push(t);
    t = addMinutes(t, 60);
  }
  return out;
}
