// Days, weeks, months and years of the training diary, and what was done in them.
// A day is its "YYYY-MM-DD" in the chosen time zone; arithmetic on days goes through UTC noon, so no clock change shifts it.

export const dayKey = (epochMs, timeZone) => new Intl.DateTimeFormat("en-CA", {
  timeZone, year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date(epochMs));

const toDate = (key) => new Date(`${key}T12:00:00Z`);
const toKey = (date) => date.toISOString().slice(0, 10);
const monthKey = (year, monthIndex) => toKey(new Date(Date.UTC(year, monthIndex, 1, 12)));

export function addDays(key, days) {
  const date = toDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return toKey(date);
}

// Weeks start on Monday.
export const weekStart = (key) => addDays(key, -((toDate(key).getUTCDay() + 6) % 7));

// The period ("week", "month" or "year") holding the day, as its first day and the first day after it.
export function periodRange(period, key) {
  if (period === "week") {
    const from = weekStart(key);
    return [from, addDays(from, 7)];
  }
  const [year, month] = key.split("-").map(Number);
  if (period === "month") return [monthKey(year, month - 1), monthKey(year, month)];
  return [`${year}-01-01`, `${year + 1}-01-01`];
}

// The first day of the period that many periods away.
export function shiftPeriod(period, key, by) {
  const [from] = periodRange(period, key);
  if (period === "week") return addDays(from, 7 * by);
  const [year, month] = from.split("-").map(Number);
  return period === "month" ? monthKey(year, month - 1 + by) : `${year + by}-01-01`;
}

// The period before, cut to as many days as have gone by of the current one when it is still running,
// so a month two days old is set against the first two days of the month before.
export function previousRange(period, key, today) {
  const [from, to] = periodRange(period, key);
  const [previousFrom, previousTo] = periodRange(period, shiftPeriod(period, key, -1));
  if (today < from || today >= to) return [previousFrom, previousTo];
  let elapsed = 0;
  for (let day = from; day <= today; day = addDays(day, 1)) elapsed += 1;
  const cut = addDays(previousFrom, elapsed);
  return [previousFrom, cut < previousTo ? cut : previousTo];
}

export const inPeriod = (entries, [from, to], timeZone) => entries.filter((entry) => {
  const day = dayKey(entry.startMs, timeZone);
  return day >= from && day < to;
});

// Sessions, distance and moving time added up; power and heart rate averaged over the time they were recorded for.
export function totals(entries) {
  const sums = { seconds: 0, distance: 0, power: 0, powerSeconds: 0, heartRate: 0, heartRateSeconds: 0 };
  for (const { summary } of entries) {
    const seconds = summary.timerSeconds ?? 0;
    sums.seconds += seconds;
    sums.distance += summary.distance ?? 0;
    if (summary.avgPower != null) {
      sums.power += summary.avgPower * seconds;
      sums.powerSeconds += seconds;
    }
    if (summary.avgHeartRate != null) {
      sums.heartRate += summary.avgHeartRate * seconds;
      sums.heartRateSeconds += seconds;
    }
  }
  return {
    count: entries.length,
    seconds: sums.seconds,
    distance: sums.distance,
    avgPower: sums.powerSeconds ? sums.power / sums.powerSeconds : null,
    avgHeartRate: sums.heartRateSeconds ? sums.heartRate / sums.heartRateSeconds : null,
  };
}

// The period split for its chart: a week or a month by day, a year by month; each part with its activities.
export function periodBuckets(period, [from, to], entries, timeZone) {
  const keys = [];
  if (period === "year") {
    for (let month = 1; month <= 12; month += 1) keys.push(`${from.slice(0, 4)}-${String(month).padStart(2, "0")}`);
  } else {
    for (let day = from; day < to; day = addDays(day, 1)) keys.push(day);
  }
  const length = period === "year" ? 7 : 10;
  return keys.map((key) => ({ key, entries: entries.filter((entry) => dayKey(entry.startMs, timeZone).slice(0, length) === key) }));
}

// The days a month's calendar shows: whole weeks, Monday to Sunday, covering the month.
export function calendarDays(monthStart) {
  const [, to] = periodRange("month", monthStart);
  const first = weekStart(monthStart);
  const last = addDays(weekStart(addDays(to, -1)), 7);
  const days = [];
  for (let day = first; day < last; day = addDays(day, 1)) days.push(day);
  return days;
}
