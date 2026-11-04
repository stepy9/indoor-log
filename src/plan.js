// The next step in training, worked out from the past weeks, for a gradual build that does not overdo it.
// Distances lead, as the Kinomap videos are picked by them: one longer steady workout a week, about 10 % over
// the usual one, the week's distance growing by at most 10 %, every fourth week lighter, and 1–2 interval
// workouts a week that grow slowly. Holds back when the heart drifts, the form is low or the fitness climbs fast.
// No DOM here, so all of it is tested on its own.

const dayMs = 86_400_000;
const noon = (key) => Date.parse(`${key}T12:00:00Z`);
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key, days) => keyOf(noon(key) + days * dayMs);
export const mondayOf = (key) => addDays(key, -((new Date(noon(key)).getUTCDay() + 6) % 7));

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
// Up to the next tenth of a kilometre, so a target is a distance a video can have.
const tenthUp = (km) => Math.ceil(km * 10 - 1e-9) / 10;

// workouts: one sport's, as [{ day: "YYYY-MM-DD", km, seconds, kind, decoupling: percent | null, hardShare: 0–1 | null }],
// hardShare being the time above zone 3 of the heart rate. form and ramp: today's form and the fitness gained
// over the last week. ftp in watts or null. today: "YYYY-MM-DD".
export function nextStep({ workouts, form = 0, ramp = 0, ftp = null, today }) {
  const steady = workouts.filter((workout) => workout.kind === "steady" && workout.km > 0);
  const since = (days) => addDays(today, -days);
  const recentSteady = steady.filter((workout) => workout.day > since(14));
  const base = recentSteady.length ? recentSteady : steady.filter((workout) => workout.day > since(28));
  if (!base.length) return null;
  const usualKm = median(base.map((workout) => workout.km));
  const longestKm = Math.max(...base.map((workout) => workout.km));
  // Speed of the usual workouts, to tell the time a distance takes.
  const speed = base.reduce((sum, workout) => sum + workout.km, 0) / base.reduce((sum, workout) => sum + workout.seconds, 0);

  // Weeks from Monday: this one so far, the last full one.
  const thisMonday = mondayOf(today);
  const lastMonday = addDays(thisMonday, -7);
  const inWeek = (monday) => workouts.filter((workout) => workout.day >= monday && workout.day < addDays(monday, 7));
  const kmOf = (list) => list.reduce((sum, workout) => sum + (workout.km || 0), 0);
  const lastWeekKm = kmOf(inWeek(lastMonday));
  const thisWeek = inWeek(thisMonday);

  // Every fourth week of training is lighter, counted from the first week with a workout.
  const firstMonday = mondayOf(workouts.reduce((first, workout) => (workout.day < first ? workout.day : first), today));
  const weekNumber = Math.round((noon(thisMonday) - noon(firstMonday)) / (7 * dayMs));
  const lighter = weekNumber % 4 === 3;

  // What holds the build back, most telling first.
  const drifts = recentSteady.map((workout) => workout.decoupling).filter(Number.isFinite).slice(-3);
  const holds = [];
  if (form < -20) holds.push("tired");
  if (ramp > 5) holds.push("ramp");
  if (drifts.length && drifts.reduce((sum, value) => sum + value, 0) / drifts.length > 5) holds.push("drift");
  const hardShares = recentSteady.map((workout) => workout.hardShare).filter(Number.isFinite);
  const tooHard = hardShares.length > 0 && hardShares.reduce((sum, value) => sum + value, 0) / hardShares.length > 0.3;

  // The longer workout: 10 % over the longest of late, held when something says so, the usual one in a lighter week.
  const longFrom = lighter ? tenthUp(usualKm) : holds.length ? tenthUp(longestKm) : tenthUp(Math.max(longestKm, usualKm) * 1.1);
  const long = { fromKm: longFrom, toKm: tenthUp(longFrom * 1.08), minutes: Math.round(longFrom / speed / 60) };
  const usual = { km: Math.round(usualKm * 10) / 10, minutes: Math.round(usualKm / speed / 60) };
  // The week's distance: at most 10 % over the last full week, 20 % under it in a lighter week.
  const weekKm = lastWeekKm > 0 ? Math.round(lastWeekKm * (lighter ? 0.8 : holds.length ? 1 : 1.1) * 10) / 10 : null;
  const doneLong = thisWeek.some((workout) => workout.kind === "steady" && workout.km >= long.fromKm - 0.05);

  // Intervals: one or two a week; a repeat more every two done in the last eight weeks, from four of two minutes.
  const intervalsDone = workouts.filter((workout) => workout.kind === "intervals" && workout.day > since(56)).length;
  const intervalsThisWeek = thisWeek.filter((workout) => workout.kind === "intervals").length;
  const repeats = Math.min(8, 4 + Math.floor(intervalsDone / 2) - (lighter ? 1 : 0));
  const intervals = {
    due: intervalsThisWeek < (lighter ? 1 : 2) && !holds.includes("tired"),
    done: intervalsThisWeek,
    repeats,
    minutes: 2,
    rest: 2,
    watts: ftp ? [Math.round(ftp * 1.0), Math.round(ftp * 1.1)] : null,
  };

  return {
    usual,
    long,
    doneLong,
    weekKm,
    lastWeekKm: Math.round(lastWeekKm * 10) / 10,
    thisWeekKm: Math.round(kmOf(thisWeek) * 10) / 10,
    lighter,
    holds,
    tooHard,
    intervals,
    steadyWatts: ftp ? [Math.round(ftp * 0.56), Math.round(ftp * 0.75)] : null,
  };
}
