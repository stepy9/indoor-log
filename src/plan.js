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

// The weekdays trained on, Monday 0 to Sunday 6: those set by hand, or else the ones trained on at least twice
// in the last four weeks, or else the commonest ones, as many as the usual workouts a week.
export function trainingDays(workouts, today, chosen = null) {
  if (chosen?.length) return [...chosen].sort((a, b) => a - b);
  const weekday = (key) => (new Date(noon(key)).getUTCDay() + 6) % 7;
  const recent = workouts.filter((workout) => workout.day > addDays(today, -28) && workout.day <= today);
  if (!recent.length) return [];
  const counts = Array(7).fill(0);
  for (const day of new Set(recent.map((workout) => workout.day))) counts[weekday(day)] += 1;
  const often = counts.map((count, day) => ({ count, day })).filter(({ count }) => count >= 2).map(({ day }) => day);
  if (often.length) return often;
  // Per week trained in, so a fresh start does not count the weeks before it.
  const weeksTrained = new Set(recent.map((workout) => mondayOf(workout.day))).size;
  const perWeek = Math.max(1, Math.round(new Set(recent.map((workout) => workout.day)).size / weeksTrained));
  return counts.map((count, day) => ({ count, day })).sort((a, b) => b.count - a.count || a.day - b.day).slice(0, perWeek).map(({ day }) => day).sort((a, b) => a - b);
}

// The next seven days from today laid out by a plan of nextStep: on the training days not yet trained on, the
// longer workout on the last of them (a weekend day first), intervals mid-way and never the day after the longer
// one, the usual workout on the rest. A longer workout already done this week moves to the next week's days.
// [{ day, type: "long" | "intervals" | "usual" }]
export function weekPlan(plan, workouts, today, days) {
  if (!plan || !days.length) return [];
  const weekday = (key) => (new Date(noon(key)).getUTCDay() + 6) % 7;
  const trained = new Set(workouts.map((workout) => workout.day));
  const open = Array.from({ length: 7 }, (_, index) => addDays(today, index)).filter((day) => days.includes(weekday(day)) && !trained.has(day));
  if (!open.length) return [];
  const nextMonday = addDays(mondayOf(today), 7);
  const types = new Map(open.map((day) => [day, "usual"]));
  // The longer workout: this week's if not done, on a weekend day if there is one, else the last open day.
  // Within this week unless it is done; the next week's days otherwise, or when this week has none left.
  const thisWeekOpen = open.filter((day) => day < nextMonday);
  const longDays = plan.doneLong || !thisWeekOpen.length ? open.filter((day) => day >= nextMonday) : thisWeekOpen;
  const longDay = [...longDays].reverse().find((day) => weekday(day) >= 5) ?? longDays.at(-1);
  if (longDay) types.set(longDay, "long");
  // Intervals: once a week, twice with five days or more to train on (once in a lighter week), never leaving the
  // week without a usual workout, on open days away from the longer one.
  const wanted = plan.intervals.due ? Math.max(0, (plan.lighter || open.length < 5 ? 1 : 2) - plan.intervals.done) : 0;
  const room = open.length >= 3 ? open.length - 2 : open.length === 2 ? 1 : 0;
  const free = open.filter((day) => types.get(day) === "usual" && day !== addDays(longDay ?? "", 1) && day !== addDays(longDay ?? "", -1));
  const picks = [];
  // Spread out: the middle open day first, then the one farthest from those taken.
  for (let count = 0; count < Math.min(wanted, free.length, room); count += 1) {
    const rest = free.filter((day) => !picks.includes(day));
    const pick = picks.length ? rest.sort((a, b) => Math.min(...picks.map((day) => Math.abs(noon(day) - noon(b)))) - Math.min(...picks.map((day) => Math.abs(noon(day) - noon(a)))))[0] : rest[Math.floor((rest.length - 1) / 2)];
    if (!pick) break;
    picks.push(pick);
  }
  for (const day of picks) types.set(day, "intervals");
  return open.map((day) => ({ day, type: types.get(day) }));
}

// This week, Monday to Sunday, as a checklist: each training day, and any other day trained on.
// A day trained on is done, with its workouts; a training day gone by without one is missed; the days ahead
// carry what weekPlan lays on them. [{ day, status: "done" | "missed" | "planned", type, workouts }]
export function weekChecklist(plan, workouts, today, days) {
  const weekday = (key) => (new Date(noon(key)).getUTCDay() + 6) % 7;
  const monday = mondayOf(today);
  const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const ahead = new Map(weekPlan(plan, workouts, today, days).map((item) => [item.day, item.type]));
  return week.flatMap((day) => {
    const done = workouts.filter((workout) => workout.day === day);
    if (done.length) return [{ day, status: "done", type: done.some((workout) => workout.kind === "intervals") ? "intervals" : done.some((workout) => plan && workout.km >= plan.long.fromKm - 0.05) ? "long" : "usual", workouts: done }];
    if (!days.includes(weekday(day))) return [];
    if (day < today) return [{ day, status: "missed", type: null, workouts: [] }];
    return [{ day, status: "planned", type: ahead.get(day) ?? "usual", workouts: [] }];
  });
}

// The longest steady workout of each of the last weeks, oldest first, this week last:
// [{ monday, km }] with km 0 for a week without one.
export function longestByWeek(workouts, today, weeks = 8) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, index) => {
    const monday = addDays(thisMonday, (index - weeks + 1) * 7);
    const inWeek = workouts.filter((workout) => workout.kind === "steady" && workout.day >= monday && workout.day < addDays(monday, 7));
    return { monday, km: inWeek.length ? Math.max(...inWeek.map((workout) => workout.km)) : 0 };
  });
}
