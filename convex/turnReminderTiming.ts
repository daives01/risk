export const DEFAULT_TIME_ZONE = "America/Denver";
const HOUR = 60 * 60 * 1000;

function localParts(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function localHour(at: number, hour: number, dayOffset: number, timeZone: string) {
  const p = localParts(at, timeZone);
  const target = Date.UTC(p.year, p.month - 1, p.day + dayOffset, hour);
  let result = target;
  for (let i = 0; i < 4; i++) {
    const actual = localParts(result, timeZone);
    result += target - Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
  }
  return result;
}

export function reminderTimes(start: number, deadline: number, timeZone: string) {
  const expiry = localParts(deadline, timeZone);
  const morning = localHour(deadline, 9, expiry.hour < 12 ? -1 : 0, timeZone);
  let final = deadline - 2 * HOUR;
  const finalHour = localParts(final, timeZone).hour;
  if (finalHour < 8) final = localHour(final, 20, -1, timeZone);
  else if (finalHour >= 20) final = localHour(final, 20, 0, timeZone);
  return [ ...(final - morning >= 4 * HOUR ? [{ at: morning, kind: "morning" as const }] : []), { at: final, kind: "final" as const } ].filter(r => r.at >= start + 4 * HOUR && r.at < deadline);
}
