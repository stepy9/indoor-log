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
