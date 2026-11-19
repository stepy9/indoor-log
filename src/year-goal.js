// A yearly distance goal: the kilometres done this year, how far ahead or behind the share of the year gone by,
// and how many a day are left to reach it.

const dayOfYear = (key) => (Date.parse(`${key}T12:00:00Z`) - Date.parse(`${key.slice(0, 4)}-01-01T12:00:00Z`)) / 86_400_000 + 1;
const daysInYear = (year) => ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);

// workouts: [{ day: "YYYY-MM-DD", km }]; goal: km for the year; today: "YYYY-MM-DD", counted as done.
// { done, expected, ahead (km, negative behind), left, daysLeft, perDay } or null without a goal.
export function yearProgress({ workouts, goal, today }) {
  if (!(goal > 0)) return null;
  const year = today.slice(0, 4);
  const done = workouts.filter((workout) => workout.day.startsWith(year) && workout.day <= today).reduce((sum, workout) => sum + (workout.km || 0), 0);
  const total = daysInYear(Number(year));
  const passed = dayOfYear(today);
  const expected = (goal * passed) / total;
  const left = Math.max(0, goal - done);
  // Today counts as done, so what is left falls on the days after it; on the last day, on that day.
  const daysLeft = Math.max(1, total - passed);
  return { done, expected, ahead: done - expected, left, daysLeft, perDay: left / daysLeft };
}

// The year's kilometres added up day by day, against the even pace to the goal, for a chart: the running total as
// steps, from 0 on 1 January to the last day counted (today in this year, 31 December in one gone by, none ahead).
// { days, through (the last day counted, 1-based, 0 for a year ahead), points: [{ day, km }], total, goal }
export function yearLine({ workouts, goal, year, today }) {
  const days = daysInYear(Number(year));
  const thisYear = today.slice(0, 4);
  const through = year < thisYear ? days : year > thisYear ? 0 : dayOfYear(today);
  const byDay = new Map();
  for (const workout of workouts) {
    if (!workout.day.startsWith(year)) continue;
    const day = dayOfYear(workout.day);
    if (day <= through) byDay.set(day, (byDay.get(day) ?? 0) + (workout.km || 0));
  }
  const points = [{ day: 0, km: 0 }];
  let total = 0;
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    points.push({ day: day - 1, km: total });
    total += byDay.get(day);
    points.push({ day, km: total });
  }
  if (through) points.push({ day: through, km: total });
  return { days, through, points, total, goal };
}
