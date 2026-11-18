// The night's sleep, entered day by day on the day woken up, kept in hours (7.38 for 7 h 23 min).
// A night shorter than this holds the day's intervals: the body has not recovered for hard work.
export const shortSleepHours = 6;

// Hours from what is typed: "7:23", "7h 23", "7 h 23 min", "7,5" or "7.5"; null for anything else.
export function parseSleep(text) {
  const typed = String(text ?? "").trim().toLowerCase();
  const split = typed.match(/^(\d{1,2})\s*(?::|h)\s*(?:(\d{1,2})\s*(?:min|m)?)?$/);
  const hours = split ? Number(split[1]) + Number(split[2] ?? 0) / 60 : /^\d{1,2}([.,]\d+)?$/.test(typed) ? Number(typed.replace(",", ".")) : NaN;
  if (split && Number(split[2] ?? 0) >= 60) return null;
  return Number.isFinite(hours) && hours > 0 && hours <= 16 ? Math.round(hours * 100) / 100 : null;
}

// Hours and minutes: { hours, minutes }, rounded to the minute.
export function sleepParts(hours) {
  const minutes = Math.round(hours * 60);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

// The sleep of the day given, from the sleep's history; null without one entered for it.
export const sleepOn = (history, day) => (history ?? []).find((record) => !record.deleted && record.from === day && record.value > 0)?.value ?? null;
