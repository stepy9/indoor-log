// Days as "YYYY-MM-DD" keys: reading and writing them as people type them, laying out a month from Monday,
// and choosing which days a date axis labels. No DOM here, so all of it is tested on its own.

const dayMs = 86_400_000;
const noon = (key) => Date.parse(`${key}T12:00:00Z`);
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

// A day as the app's language writes it: 13. 10. 2026, or 13/10/2026 in English; empty without a day.
export function formatDay(key, language) {
  if (!key) return "";
  const [year, month, day] = key.split("-").map(Number);
  return language === "en" ? `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}` : `${day}. ${month}. ${year}`;
}

// A typed day: day, month and year in that order by any separators, or an ISO day.
// Null for an empty field (no day), undefined for anything that is not a real day.
export function parseDay(input) {
  const text = String(input ?? "").trim();
  if (!text) return null;
  const parts = text.match(/\d+/g);
  if (!parts || parts.length !== 3) return undefined;
  const [day, month, year] = (parts[0].length === 4 ? [parts[2], parts[1], parts[0]] : parts).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 && year > 1900 ? keyOf(date.getTime()) : undefined;
}

// A month laid out from Monday: how many empty cells come before the 1st, and how many days it has.
// month is 0 for January.
export function monthLayout(year, month) {
  return {
    offset: (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7,
    days: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  };
}

// Which days a date axis labels, at least minGap pixels apart: each day, every other day, weeks from Monday,
// or months (every one, two, three, six or twelve); the last day always closes it, a tick too close to it
// giving way. xForKey places a day; the result is [{ key, kind: "day" | "month" | "last", spacing }].
export function axisTicks(firstKey, lastKey, xForKey, minGap = 64) {
  const first = noon(firstKey);
  const last = noon(lastKey);
  const pxPerDay = first < last ? (xForKey(lastKey) - xForKey(firstKey)) / ((last - first) / dayMs) : Infinity;
  const spacing = [1, 2, 7, 14, 30, 61, 91, 182, 365].find((daysApart) => daysApart * pxPerDay >= minGap) ?? 365;
  const ticks = [];
  if (spacing <= 14) {
    for (let ms = first; ms <= last; ms += dayMs) {
      const offset = Math.round((ms - noon("2024-01-01")) / dayMs); // 2024-01-01 was a Monday.
      if (((offset % spacing) + spacing) % spacing === 0) ticks.push({ key: keyOf(ms), kind: "day", spacing });
    }
  } else {
    const every = Math.round(spacing / 30.4);
    for (let month = firstKey.slice(0, 7); ;) {
      const key = `${month}-01`;
      if (key > lastKey) break;
      const [year, number] = month.split("-").map(Number);
      if (key >= firstKey && (number - 1) % every === 0) ticks.push({ key, kind: "month", spacing });
      month = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
    }
  }
  while (ticks.length && (ticks.at(-1).key === lastKey || xForKey(lastKey) - xForKey(ticks.at(-1).key) < minGap)) ticks.pop();
  ticks.push({ key: lastKey, kind: "last", spacing });
  return ticks;
}
