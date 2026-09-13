const DAY = 86_400_000;
export const TIME_ZONE = 'Europe/Berlin';
const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function validDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = Date.parse(value + 'T12:00:00Z');
  return Number.isFinite(instant) && new Date(instant).toISOString().slice(0, 10) === value;
}
export function dayNumber(day: string): number { return Date.parse(day + 'T00:00:00Z') / DAY; }
export function dayAfter(day: string, offset: number): string {
  return new Date((dayNumber(day) + offset) * DAY).toISOString().slice(0, 10);
}
function berlinParts(instant: number): Record<string, string> {
  return Object.fromEntries(clock.formatToParts(instant).map(p => [p.type, p.value]));
}
export function todayInBerlin(instant = Date.now()): string {
  const p = berlinParts(instant);
  return `${p.year}-${p.month}-${p.day}`;
}
/** Resolves a Berlin wall time. Invalid spring-gap times return NaN; fall overlaps use the first occurrence. */
export function berlinTimestamp(day: string, time: string): number {
  if (!validDay(day) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return NaN;
  const utcGuess = Date.parse(`${day}T${time}:00Z`);
  const matches: number[] = [];
  for (let offset = -180; offset <= 180; offset += 30) {
    const candidate = utcGuess + offset * 60_000, p = berlinParts(candidate);
    if (`${p.year}-${p.month}-${p.day}` === day && `${p.hour}:${p.minute}` === time) matches.push(candidate);
  }
  return matches.length ? Math.min(...matches) : NaN;
}
export function deadlineEndsAt(deadline: { day: string; time?: string }): number {
  if (!validDay(deadline.day)) return NaN;
  return !deadline.time || deadline.time === 'day'
    ? berlinTimestamp(dayAfter(deadline.day, 1), '00:00')
    : berlinTimestamp(deadline.day, deadline.time);
}
export function historyStamp(instant = Date.now()): string {
  return new Intl.DateTimeFormat('de-DE', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant);
}
