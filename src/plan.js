// The next step in training, worked out from the past weeks, for a gradual build that does not overdo it.
// Distances lead, as the Kinomap videos are picked by them: one longer steady workout a week, about 10 % over
// the usual one, the week's distance growing by at most 10 %, every fourth week lighter, and 1–2 interval
// workouts a week that grow slowly. Holds back when the heart drifts, the form is low or the fitness climbs fast.
// No DOM here, so all of it is tested on its own.

import { isIntervalSession, weekOf } from "./workouts.js";
import { mean, median } from "./stats.js";
import { addDays, dayMs, mondayOf, noon, weekdayOf } from "./dates.js";

export { mondayOf };

// Up to the next tenth of a kilometre, so a target is a distance a video can have.
const tenthUp = (km) => Math.ceil(km * 10 - 1e-9) / 10;

// workouts: one sport's, as [{ day: "YYYY-MM-DD", km, seconds, kind, decoupling: percent | null, hardShare: 0–1 | null }],
// hardShare being the time above zone 3 of the heart rate. form and ramp: today's form and the fitness gained
// over the last week. ftp in watts or null. today: "YYYY-MM-DD". focus: how the last four weeks' training focus
// leans, "intense" (too little low aerobic load, or too much high aerobic or anaerobic), "easy" (too little
// intensity) or null when balanced; intense allows one interval workout a week, easy asks for two.
// prefs: the sport's training settings, each null or missing for the plan to work it out itself:
// { longPerWeek: 1–3, longDays: [weekday], intervalDays: [weekday], longTargetMinutes, longStepMinutes, usualMinutes, intervalsPerWeek: 0–3,
// intervalType: "short" | "medium" | "tempo", lighterEvery: 3–5 or 0 for never, lighterPercent: 10–40,
// minimalMinutes: 0 for none, ftpTestWeeks: 4–12, weeklyHours, weeklyKm, restAfterLongMinutes: the length from which
// a longer workout keeps intervals off the days next to it (0: always; 60 when not set) }. A step makes the longer workouts grow
// by minutes, not by 10 %; the target caps them.
export const planPrefLimits = { longPerWeek: [1, 3], longTargetMinutes: [10, 240], longStepMinutes: [1, 30], usualMinutes: [5, 120], intervalsPerWeek: [0, 3], minimalMinutes: [0, 30], restAfterLongMinutes: [0, 240] };

// The length of a longer workout from which intervals stay off the days next to it, when not set.
export const restAfterLongDefault = 60;

// Whether the plan's longer workout is long enough to keep intervals off the days next to it.
export const longTires = (plan) => (plan?.long?.minutes ?? Infinity) >= (plan?.restAfterLongMinutes ?? restAfterLongDefault);

// The interval workouts by kind: the work and rest in minutes, the repeats from the first to the most (one more
// every two done in the last eight weeks), and the power as shares of the FTP.
export const intervalKinds = {
  short: { minutes: 1, rest: 1, repeats: [6, 12], power: [1.15, 1.25] },
  medium: { minutes: 2, rest: 2, repeats: [4, 8], power: [1.0, 1.1] },
  tempo: { minutes: 8, rest: 3, repeats: [2, 2], grow: 1, most: 15, power: [0.88, 0.95] },
};

// The FTP test: a short all-out one first, the 20 minutes two days or more after it, each told by "FTP" in the
// workout's name (or an FTP typed by hand on the day).
export const ftpTestGap = 2;

// How many weeks the outlook shows, this one included.
export const outlookWeeks = 6;

// The taper before a goal day (a race or a test), by the week: the week of the goal (the goal within 7 days of its
// Monday) is the final one, the week before it the first. The final week rides 40 % fewer kilometres, its longer
// workout no longer than the usual one and at most one interval workout of half the repeats; the first week rides
// 20 % fewer and holds the longer workout. Neither is a lighter week nor takes an FTP test.
export const taperCut = { first: 0.2, final: 0.4 };
export function taperOf(monday, goal) {
  if (!goal) return null;
  const days = Math.round((noon(goal) - noon(monday)) / dayMs);
  return days >= 0 && days <= 7 ? "final" : days > 7 && days <= 14 ? "first" : null;
}

export function nextStep({ workouts, form = 0, ramp = 0, ftp = null, today, focus = null, prefs = {}, lastFtpTest = null, unwell = false, hrvLow = false, shortSleep = false, illnessSigns = false, goal = null }) {
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
  const inWeek = (monday) => weekOf(workouts, monday);
  const kmOf = (list) => list.reduce((sum, workout) => sum + (workout.km || 0), 0);
  const lastWeekKm = kmOf(inWeek(lastMonday));
  const thisWeek = inWeek(thisMonday);

  // Every fourth week of training is lighter (or as set, or never), counted from the first week with a workout,
  // by a fifth (or the share set).
  const firstMonday = mondayOf(workouts.reduce((first, workout) => (workout.day < first ? workout.day : first), today));
  const weekNumber = Math.round((noon(thisMonday) - noon(firstMonday)) / (7 * dayMs));
  const every = Number.isInteger(prefs.lighterEvery) ? prefs.lighterEvery : 4;
  // A goal day ahead (today included) tapers the weeks before it, in place of a lighter week.
  const goalDay = goal && goal >= today ? goal : null;
  const taper = taperOf(thisMonday, goalDay);
  const lighter = !taper && every > 0 && weekNumber % every === every - 1;
  const lighterBy = (prefs.lighterPercent > 0 ? prefs.lighterPercent : 20) / 100;

  // The FTP test, every so many weeks when set: due from that many weeks after the last one (now, without one),
  // and the 20 minutes still due in a week with only the short one done.
  const testsThisWeek = thisWeek.filter((workout) => workout.ftpTest).length;
  const lastTest = [lastFtpTest, ...workouts.filter((workout) => workout.ftpTest).map((workout) => workout.day)].filter(Boolean).sort().at(-1) ?? null;
  const ftpTest = prefs.ftpTestWeeks > 0 ? {
    every: prefs.ftpTestWeeks,
    last: lastTest,
    done: testsThisWeek,
    due: !taper && (testsThisWeek === 1 || (testsThisWeek === 0 && (!lastTest || lastTest <= addDays(today, -7 * prefs.ftpTestWeeks)))),
  } : null;

  // What holds the build back, most telling first.
  const drifts = recentSteady.map((workout) => workout.decoupling).filter(Number.isFinite).slice(-3);
  const holds = [];
  if (unwell) holds.push("unwell");
  if (illnessSigns) holds.push("illnessSigns");
  if (hrvLow) holds.push("hrvLow");
  if (shortSleep) holds.push("shortSleep");
  if (form < -20) holds.push("tired");
  if (ramp > 5) holds.push("ramp");
  if (drifts.length && mean(drifts) > 5) holds.push("drift");
  const hardShares = recentSteady.map((workout) => workout.hardShare).filter(Number.isFinite);
  const tooHard = hardShares.length > 0 && mean(hardShares) > 0.3;

  // The usual workout: the time set, else the median of late.
  const kmFor = (minutes) => minutes * 60 * speed;
  const usualFrom = prefs.usualMinutes > 0 ? kmFor(prefs.usualMinutes) : usualKm;
  const usual = { km: Math.round(usualFrom * 10) / 10, minutes: Math.round(usualFrom / speed / 60) };
  // The longer workout: 10 % over the longest of late, or the step set over it, up to the target set; held when
  // something says so, the usual one in a lighter week (a step back with a step set). A target above the longest of
  // late and no step: the target right away, as the steady pace is easy enough to go there.
  const target = prefs.longTargetMinutes > 0 ? kmFor(prefs.longTargetMinutes) : Infinity;
  const step = prefs.longStepMinutes > 0 ? kmFor(prefs.longStepMinutes) : null;
  // The longest before this week: one done this week would otherwise raise its own target and never count as done.
  const before = base.filter((workout) => workout.day < thisMonday);
  const longest = Math.max(before.length ? Math.max(...before.map((workout) => workout.km)) : longestKm, usualFrom);
  const grown = step != null ? longest + step : Number.isFinite(target) && !(prefs.longStepMinutes > 0) && target > longest ? target : longest * 1.1;
  const longKm = taper === "final" ? usualFrom : lighter ? (step != null ? Math.max(usualFrom, longest - step) : usualFrom) : holds.length || taper ? longest : grown;
  const longFrom = tenthUp(Math.min(longKm, Math.max(target, usualFrom)));
  const long = { fromKm: longFrom, toKm: tenthUp(longFrom * 1.08), minutes: Math.round(longFrom / speed / 60), count: taper === "final" ? 1 : prefs.longPerWeek > 0 ? prefs.longPerWeek : 1 };
  // The week's distance: at most 10 % over the last full week, 20 % under it in a lighter week; with a weekly
  // volume set, growing towards it and no further.
  const goalKm = prefs.weeklyHours > 0 ? prefs.weeklyHours * 3600 * speed : prefs.weeklyKm > 0 ? prefs.weeklyKm : null;
  const grownWeek = lastWeekKm * (lighter ? 1 - lighterBy : holds.length ? 1 : 1.1);
  const weekFrom = goalKm ? (lastWeekKm > 0 ? Math.min(grownWeek, lighter ? goalKm * (1 - lighterBy) : goalKm) : goalKm) : grownWeek;
  // A taper cuts the week's distance from the last full week, or from the volume set before it began.
  const taperFrom = goalKm && lastWeekKm > 0 ? Math.min(lastWeekKm, goalKm) : goalKm ?? lastWeekKm;
  const weekTo = taper ? taperFrom * (1 - taperCut[taper]) : weekFrom;
  const weekKm = weekTo > 0 ? Math.round(weekTo * 10) / 10 : null;
  const longDone = thisWeek.filter((workout) => workout.kind === "steady" && workout.km >= long.fromKm - 0.05).length;
  const doneLong = longDone >= long.count;

  // Intervals: one or two a week, of the kind set (two minutes by default); a repeat more every two done in the last
  // eight weeks, or for the tempo ones a minute more to each of the two. None in a week of the FTP test.
  const intervalsDone = workouts.filter((workout) => isIntervalSession(workout) && workout.day > since(56)).length;
  const intervalsThisWeek = thisWeek.filter(isIntervalSession).length;
  const kind = intervalKinds[prefs.intervalType] ? prefs.intervalType : "medium";
  const shape = intervalKinds[kind];
  const grownBy = Math.floor(intervalsDone / 2) - (lighter ? 1 : 0);
  const grownRepeats = Math.max(shape.repeats[0] - 1, Math.min(shape.repeats[1], shape.repeats[0] + (shape.grow ? 0 : grownBy)));
  // The final week keeps the efforts sharp but few: half the repeats, two at the least.
  const repeats = taper === "final" ? Math.max(2, Math.ceil(grownRepeats / 2)) : grownRepeats;
  const minutes = shape.grow ? Math.max(shape.minutes - 1, Math.min(shape.most, shape.minutes + grownBy * shape.grow)) : shape.minutes;
  // The number set holds, one at most in a lighter week; else by the focus.
  const intervalsSet = Number.isInteger(prefs.intervalsPerWeek);
  const intervalsMax = ftpTest?.due ? 0 : intervalsSet ? (lighter || taper === "final" ? Math.min(1, prefs.intervalsPerWeek) : prefs.intervalsPerWeek) : lighter || taper === "final" || focus === "intense" ? 1 : 2;
  const intervals = {
    set: intervalsSet || Boolean(ftpTest?.due),
    kind,
    due: intervalsThisWeek < intervalsMax && !holds.includes("tired") && !holds.includes("unwell") && !holds.includes("hrvLow") && !holds.includes("shortSleep") && !holds.includes("illnessSigns"),
    done: intervalsThisWeek,
    max: intervalsMax,
    repeats,
    minutes,
    rest: shape.rest,
    watts: ftp ? shape.power.map((share) => Math.round(ftp * share)) : null,
  };
  // The distance an interval workout comes to, warm-up, rests and cool-down in: the median of the last four ridden,
  // else its minutes with ten more for the warm-up and cool-down at the usual speed.
  const lastIntervals = workouts.filter((workout) => workout.kind === "intervals" && !workout.ftpTest && workout.km > 0).slice(-4).map((workout) => workout.km);
  intervals.km = tenthUp(lastIntervals.length ? median(lastIntervals) : kmFor(repeats * (minutes + shape.rest) + 10));
  // The FTP tests' at the usual speed: the effort with a warm-up of ten minutes and five easy after.
  const ftpTestKm = { ftpTestShort: tenthUp(kmFor(5 + 15)), ftpTest: tenthUp(kmFor(20 + 15)) };
  // The least to ride on a day without the will or the strength: easy, for the habit. Ten minutes unless set; 0 is none.
  const minimal = prefs.minimalMinutes === 0 ? null : { minutes: prefs.minimalMinutes > 0 ? prefs.minimalMinutes : 10 };

  // The weeks ahead as the plan would go if each were kept and nothing held it back: this week first, then
  // the next ones, each with its longer workouts' time, whether it is lighter, the FTP test and the intervals.
  const minutesOf = (km) => Math.round(km / speed / 60);
  // A test the taper puts off comes the week after the goal's.
  const afterGoal = goalDay ? addDays(mondayOf(goalDay), 7) : null;
  const testFrom = ftpTest && !ftpTest.due ? (lastTest ? mondayOf(addDays(lastTest, 7 * prefs.ftpTestWeeks)) : thisMonday) : thisMonday;
  const firstTestWeek = ftpTest ? (afterGoal && testFrom < afterGoal && taperOf(testFrom, goalDay) ? afterGoal : testFrom) : null;
  const outlook = [];
  let grownKm = longFrom;
  let peakKm = lighter ? longest : longFrom;
  for (let index = 0; index < outlookWeeks; index += 1) {
    const monday = addDays(thisMonday, index * 7);
    const weekTaper = taperOf(monday, goalDay);
    const isLighter = !weekTaper && every > 0 && (weekNumber + index) % every === every - 1;
    if (index > 0) {
      if (weekTaper === "final") grownKm = usualFrom;
      else if (weekTaper === "first") grownKm = peakKm;
      else if (isLighter) grownKm = step != null ? Math.max(usualFrom, peakKm - step) : usualFrom;
      else {
        grownKm = Math.min(Math.max(target, usualFrom), step != null ? peakKm + step : Number.isFinite(target) && !(prefs.longStepMinutes > 0) ? Math.max(target, peakKm) : peakKm * 1.1);
        peakKm = grownKm;
      }
    }
    const weeksSinceFirst = firstTestWeek ? Math.round((noon(monday) - noon(firstTestWeek)) / (7 * dayMs)) : -1;
    const testWeek = !weekTaper && weeksSinceFirst >= 0 && weeksSinceFirst % prefs.ftpTestWeeks === 0;
    const fewer = isLighter || weekTaper === "final";
    const intervalsCount = testWeek ? 0 : intervalsSet ? (fewer ? Math.min(1, prefs.intervalsPerWeek) : prefs.intervalsPerWeek) : fewer || focus === "intense" ? 1 : 2;
    const goalInWeek = goalDay && goalDay >= monday && goalDay < addDays(monday, 7) ? goalDay : null;
    outlook.push({ monday, lighter: isLighter, taper: weekTaper, goal: goalInWeek, longMinutes: minutesOf(tenthUp(grownKm)), longCount: weekTaper === "final" ? 1 : long.count, ftpTest: testWeek, intervals: intervalsCount });
  }

  return {
    usual,
    long,
    longDone,
    doneLong,
    longDays: prefs.longDays?.length ? [...prefs.longDays] : null,
    ftpTestKm,
    intervalDays: prefs.intervalDays?.length ? [...prefs.intervalDays] : null,
    restAfterLongMinutes: Number.isFinite(prefs.restAfterLongMinutes) ? prefs.restAfterLongMinutes : restAfterLongDefault,
    weekKm,
    lastWeekKm: Math.round(lastWeekKm * 10) / 10,
    thisWeekKm: Math.round(kmOf(thisWeek) * 10) / 10,
    lighter,
    taper,
    goal: goalDay,
    holds,
    tooHard,
    focus,
    intervals,
    minimal,
    ftpTest,
    outlook,
    steadyWatts: ftp ? [Math.round(ftp * 0.56), Math.round(ftp * 0.75)] : null,
  };
}

// The weekdays trained on, Monday 0 to Sunday 6: those set by hand, or else the ones trained on at least twice
// in the last four weeks, or else the commonest ones, as many as the usual workouts a week.
export function trainingDays(workouts, today, chosen = null) {
  if (chosen?.length) return [...chosen].sort((a, b) => a - b);
  const recent = workouts.filter((workout) => workout.day > addDays(today, -28) && workout.day <= today);
  if (!recent.length) return [];
  const counts = Array(7).fill(0);
  for (const day of new Set(recent.map((workout) => workout.day))) counts[weekdayOf(day)] += 1;
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
// Days excused ({ "YYYY-MM-DD": excuse }) are no training days: the workouts go to the others.
// swaps: { "YYYY-MM-DD": "YYYY-MM-DD" }, two days whose workouts trade places, laid out first as above; a pair with a
// day no longer open (ridden, excused, gone by) or with the goal or its opener in it is left as laid out.
export function weekPlan(plan, workouts, today, days, excused = {}, swaps = {}) {
  if (!plan || !days.length) return [];
  const trained = new Set(workouts.map((workout) => workout.day));
  // The goal day is planned whatever the weekday; the two days before it take nothing hard.
  const goal = plan.goal ?? null;
  const open = Array.from({ length: 7 }, (_, index) => addDays(today, index)).filter((day) => (days.includes(weekdayOf(day)) || day === goal) && !trained.has(day) && !excused[day]);
  if (!open.length) return [];
  const nearGoal = (day) => Boolean(goal) && day >= addDays(goal, -2) && day <= goal;
  const nextMonday = addDays(mondayOf(today), 7);
  const types = new Map(open.map((day) => [day, "usual"]));
  // The longer workouts: those of this week not yet done, on the weekdays set for them, else a weekend day first,
  // then the last open day, the others as far from the taken ones as can be. Within this week unless all are done;
  // the next week's days otherwise, or when this week has none left.
  const thisWeekOpen = open.filter((day) => day < nextMonday);
  const count = plan.long.count ?? 1;
  const toNextWeek = plan.doneLong || !thisWeekOpen.length;
  const longDays = (toNextWeek ? open.filter((day) => day >= nextMonday) : thisWeekOpen).filter((day) => !nearGoal(day));
  const wantedLong = Math.min(toNextWeek ? count : count - (plan.longDone ?? 0), Math.max(1, longDays.length - 1));
  const longPicks = longDays.filter((day) => plan.longDays?.includes(weekdayOf(day))).slice(0, wantedLong);
  // Days apart counted round the week too, as next week's longer workouts fall on the same weekdays.
  const gap = (day) => Math.min(...longPicks.map((taken) => {
    const apart = Math.abs(weekdayOf(taken) - weekdayOf(day));
    return Math.min(apart, 7 - apart);
  }));
  while (longPicks.length < wantedLong) {
    const rest = longDays.filter((day) => !longPicks.includes(day));
    if (!rest.length) break;
    const pick = longPicks.length
      ? rest.reduce((best, day) => (gap(day) > gap(best) || (gap(day) === gap(best) && day > best) ? day : best))
      : [...rest].reverse().find((day) => weekdayOf(day) >= 5) ?? rest.at(-1);
    longPicks.push(pick);
  }
  for (const day of longPicks) types.set(day, "long");
  const nearLong = (day) => longPicks.some((taken) => day === addDays(taken, 1) || day === addDays(taken, -1));
  // Intervals keep off the days next to a longer workout only once it is long enough to tire (an FTP test always).
  const tires = longTires(plan);
  // The FTP test when due: the short one on the first usual day not after a longer workout, the 20 minutes
  // ftpTestGap days or more after it (or after the short one done), rested, so not the day after a longer one either.
  if (plan.ftpTest?.due) {
    const rested = (day) => types.get(day) === "usual" && !longPicks.includes(addDays(day, -1)) && !nearGoal(day);
    let after = plan.ftpTest.done ? plan.ftpTest.last : null;
    for (const test of plan.ftpTest.done ? ["ftpTest"] : ["ftpTestShort", "ftpTest"]) {
      const day = open.find((candidate) => rested(candidate) && (!after || candidate >= addDays(after, ftpTestGap)));
      if (!day) break;
      types.set(day, test);
      after = day;
    }
  }
  // Intervals: once a week, twice with five days or more to train on (once in a lighter week or when the training
  // is too intense), never leaving the week without a usual workout, on open days away from the longer one.
  // A number set by hand holds whatever the days left, as long as a usual workout stays.
  const most = plan.intervals.set ? plan.intervals.max : Math.min(plan.intervals.max ?? (plan.lighter ? 1 : 2), open.length < 5 ? 1 : 2);
  const wanted = plan.intervals.due ? Math.max(0, most - plan.intervals.done) : 0;
  const usualLeft = open.filter((day) => types.get(day) === "usual").length;
  const room = usualLeft >= 2 ? usualLeft - 1 : open.length === 2 && usualLeft === 1 ? 1 : 0;
  // This week's are the ones still owed: on its days if any is away from the longer workouts, else on one the day
  // before a longer workout (never the day after), rather than slipping into next week.
  const usualDays = open.filter((day) => types.get(day) === "usual" && !nearGoal(day));
  const away = usualDays.filter((day) => !tires || !nearLong(day));
  const thisWeekAway = away.filter((day) => day < nextMonday);
  const notAfter = usualDays.filter((day) => day < nextMonday && !longPicks.includes(addDays(day, -1)));
  const free = thisWeekAway.length ? thisWeekAway : notAfter.length ? notAfter : away;
  // The weekdays set for them first, a usual day each, even the day before a longer workout (not the day after one
  // that tires); then spread out: the middle open day first, then the one farthest from those taken.
  const picks = usualDays.filter((day) => plan.intervalDays?.includes(weekdayOf(day)) && (!tires || !longPicks.includes(addDays(day, -1)))).slice(0, Math.min(wanted, room));
  for (let count = picks.length; count < Math.min(wanted, room); count += 1) {
    const rest = free.filter((day) => !picks.includes(day));
    const pick = picks.length ? rest.sort((a, b) => Math.min(...picks.map((day) => Math.abs(noon(day) - noon(b)))) - Math.min(...picks.map((day) => Math.abs(noon(day) - noon(a)))))[0] : rest[Math.floor((rest.length - 1) / 2)];
    if (!pick) break;
    picks.push(pick);
  }
  for (const day of picks) types.set(day, "intervals");
  // The goal itself, and the day before it a short easy ride with a few efforts at the goal's pace, to open up.
  if (goal && types.has(goal)) types.set(goal, "goal");
  if (goal && types.has(addDays(goal, -1))) types.set(addDays(goal, -1), "opener");
  for (const [one, other] of Object.entries(swaps ?? {})) {
    const pair = [types.get(one), types.get(other)];
    if (pair.some((type) => !type || type === "goal" || type === "opener")) continue;
    types.set(one, pair[1]);
    types.set(other, pair[0]);
  }
  return open.map((day) => ({ day, type: types.get(day) }));
}

// Next week, Monday to Sunday, laid out as this week's plan would lay it out then, for a look ahead: nothing of it
// done yet, the intervals owed again (unless the week has none), no FTP test (when it falls is known only then).
// Tentative: the plan works the week out anew from how this one goes. { plan, days, checklist } as weekPlan's and
// weekChecklist's, plan the one they were laid out by.
export function nextWeekPlan(plan, workouts, today, days, excused = {}, swaps = {}) {
  if (!plan || !days.length) return { plan, days: [], checklist: [] };
  const monday = addDays(mondayOf(today), 7);
  const ahead = { ...plan, longDone: 0, doneLong: false, ftpTest: null, intervals: { ...plan.intervals, done: 0, due: (plan.intervals.max ?? 1) > 0 } };
  return {
    plan: ahead,
    days: weekPlan(ahead, workouts, monday, days, excused, swaps),
    checklist: weekChecklist(ahead, workouts, monday, days, excused, swaps),
  };
}

// The kinds a week's distance splits into, in the order its bar shows them.
export const weekKinds = ["usual", "long", "intervals", "ftpTest"];

// A workout ridden by its kind for the week's distance: an FTP test, intervals, a longer workout by the plan's
// length, else a usual one (an easy or recovery one too).
export function ridingKind(workout, plan) {
  if (workout.ftpTest) return "ftpTest";
  if (workout.kind === "intervals") return "intervals";
  return plan && workout.kind === "steady" && workout.km >= plan.long.fromKm - 0.05 ? "long" : "usual";
}

// The distance a planned day adds: a longer workout at its least, intervals and an FTP test as they come to (see
// nextStep; a usual workout for a plan without), an opener half a usual one; a day off and the goal nothing known.
export function plannedKm(type, plan) {
  if (type === "long") return plan.long.fromKm;
  if (type === "intervals") return plan.intervals?.km ?? plan.usual.km;
  if (type === "ftpTestShort" || type === "ftpTest") return plan.ftpTestKm?.[type] ?? 0;
  if (["off", "goal"].includes(type)) return 0;
  return type === "opener" ? plan.usual.km / 2 : plan.usual.km;
}

// The kind of each workout of one week as it was meant then: a steady one on a day the plan kept as a longer
// workout is a longer one, on a day it kept as another a usual one; on a day without a kept plan the week's longest
// steady workout is a longer one when it is a fifth or more over the others' median. FTP tests and intervals by
// ridingKind. Before the plan began (start, "YYYY-MM-DD") every workout is a usual one: riding as it came, with no
// kinds to tell. log: { "YYYY-MM-DD": plannedDay }. A function of the workout.
export function kindsOfWeek(workouts, plan, log = {}, start = null) {
  const steady = workouts.filter((workout) => ridingKind(workout, null) === "usual" && workout.kind === "steady");
  const longest = steady.reduce((best, workout) => (!best || workout.km > best.km ? workout : best), null);
  const others = steady.filter((workout) => workout !== longest).map((workout) => workout.km).sort((a, b) => a - b);
  const middle = others.length ? (others.length % 2 ? others[(others.length - 1) / 2] : (others[others.length / 2 - 1] + others[others.length / 2]) / 2) : null;
  return (workout) => {
    if (start && workout.day < start) return "usual";
    const kind = ridingKind(workout, null);
    if (kind !== "usual" || workout.kind !== "steady") return kind;
    const planned = log[workout.day];
    if (planned) return planned.type === "long" ? "long" : "usual";
    if (workout === longest && middle != null) return workout.km >= middle * 1.2 ? "long" : "usual";
    return ridingKind(workout, plan);
  };
}

// A week's distance by kind: what was ridden and what is still planned of each, from a checklist as
// weekChecklist's; kindOf tells a ridden workout's kind (by the plan's length unless given).
// [{ kind, done, ahead }] in weekKinds' order, the kinds with none left out.
export function weekKmByKind(checklist, plan, kindOf = (workout) => ridingKind(workout, plan)) {
  const parts = Object.fromEntries(weekKinds.map((kind) => [kind, { kind, done: 0, ahead: 0 }]));
  for (const item of checklist) {
    if (item.status === "done") for (const workout of item.workouts) parts[kindOf(workout)].done += workout.km;
    else if (item.status === "planned") {
      const kind = item.type?.startsWith("ftpTest") ? "ftpTest" : item.type === "long" || item.type === "intervals" ? item.type : "usual";
      parts[kind].ahead += plannedKm(item.type, plan);
    }
  }
  return weekKinds.map((kind) => parts[kind]).filter((part) => part.done > 0 || part.ahead > 0);
}

// The distance ridden by kind in each of the last weeks, oldest first, the week of today last:
// [{ monday, parts }] with parts as weekKmByKind's (all ridden), each workout's kind as kindsOfWeek tells it.
export function kmByKindByWeek(workouts, plan, today, weeks = 8, log = {}, start = null) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, index) => {
    const monday = addDays(thisMonday, (index - weeks + 1) * 7);
    const inWeek = weekOf(workouts, monday);
    return { monday, parts: weekKmByKind([{ status: "done", workouts: inWeek }], plan, kindsOfWeek(inWeek.filter((workout) => !start || workout.day >= start), plan, log, start)) };
  });
}

// This week, Monday to Sunday, as a checklist: each training day, and any other day trained on.
// A day trained on is done, with its workouts; a training day gone by without one is missed; the days ahead
// carry what weekPlan lays on them. [{ day, status: "done" | "missed" | "planned", type, workouts }]
// A training day excused and not ridden shows as off ("off" planned ahead, missed gone by, the excuse telling why).
export function weekChecklist(plan, workouts, today, days, excused = {}, swaps = {}) {
  const monday = mondayOf(today);
  const week = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const ahead = new Map(weekPlan(plan, workouts, today, days, excused, swaps).map((item) => [item.day, item.type]));
  return week.flatMap((day) => {
    const done = workouts.filter((workout) => workout.day === day);
    if (done.length) return [{ day, status: "done", type: done.some((workout) => workout.ftpTest) ? "ftpTest" : done.some((workout) => workout.kind === "intervals") ? "intervals" : done.some((workout) => plan && workout.km >= plan.long.fromKm - 0.05) ? "long" : "usual", workouts: done }];
    if (!days.includes(weekdayOf(day)) && day !== plan?.goal) return [];
    if (day < today) return [{ day, status: "missed", type: null, workouts: [] }];
    return [{ day, status: "planned", type: excused[day] ? "off" : ahead.get(day) ?? "usual", workouts: [] }];
  });
}

// What a week laid out breaks of weekPlan's rules, for a swap made by hand: a hard day (intervals, an FTP test) the
// day after a longer workout, or the 20-minute test sooner than ftpTestGap days after the short one (planned or done).
// days: [{ day, type }] in order; shortDone: the day the short test was ridden this week, or null; tires: whether
// the longer workout is long enough to keep intervals off the day after (an FTP test keeps off it always).
// [{ day, rule: "afterLong" | "testGap" }]
export function planRuleBreaks(days, shortDone = null, tires = true) {
  const typeOn = new Map(days.map((item) => [item.day, item.type]));
  const breaks = [];
  for (const { day, type } of days) {
    const hard = (tires && type === "intervals") || type?.startsWith("ftpTest");
    if (hard && typeOn.get(addDays(day, -1)) === "long") breaks.push({ day, rule: "afterLong" });
    if (type === "ftpTest") {
      const short = days.find((item) => item.type === "ftpTestShort")?.day ?? shortDone;
      if (short && (short > day || day < addDays(short, ftpTestGap))) breaks.push({ day, rule: "testGap" });
    }
  }
  return breaks;
}

// The longest steady workout of each of the last weeks, oldest first, this week last:
// [{ monday, km }] with km 0 for a week without one.
export function longestByWeek(workouts, today, weeks = 8) {
  const thisMonday = mondayOf(today);
  return Array.from({ length: weeks }, (_, index) => {
    const monday = addDays(thisMonday, (index - weeks + 1) * 7);
    const inWeek = weekOf(workouts, monday).filter((workout) => workout.kind === "steady");
    return { monday, km: inWeek.length ? Math.max(...inWeek.map((workout) => workout.km)) : 0 };
  });
}

// The trainer's resistance to set, from the workouts of the last eight weeks: for the steady ones the level whose
// workouts kept the heart rate nearest the middle of the range given (zone 2), from two workouts at it; for the
// intervals the levels their hard laps ran at (the laps above the workout's own level), the medians of the
// lowest and highest. workouts as nextStep's, with level, lapLevels and avgHeartRate. { steady, intervals } with
// steady a level or null and intervals [low, high] or null.
export function suggestedLevels(workouts, heartRange, today) {
  const since = addDays(today, -56);
  const recent = workouts.filter((workout) => workout.day > since && workout.level > 0);
  let steady = null;
  if (heartRange) {
    const middle = (heartRange[0] + heartRange[1]) / 2;
    const byLevel = new Map();
    for (const workout of recent) {
      if (workout.kind !== "steady" || !(workout.avgHeartRate > 0)) continue;
      byLevel.set(workout.level, [...(byLevel.get(workout.level) ?? []), workout.avgHeartRate]);
    }
    let best = null;
    for (const [level, rates] of byLevel) {
      if (rates.length < 2) continue;
      const off = Math.abs(mean(rates) - middle);
      if (!best || off < best.off) best = { level, off };
    }
    steady = best?.level ?? null;
  }
  const hard = recent.filter((workout) => workout.kind === "intervals")
    .map((workout) => (workout.lapLevels ?? []).filter((level) => level > workout.level))
    .filter((levels) => levels.length);
  const intervals = hard.length ? [Math.round(median(hard.map((levels) => Math.min(...levels)))), Math.round(median(hard.map((levels) => Math.max(...levels))))] : null;
  return { steady, intervals };
}

// The power to start a steady workout at, from the laps of the last four weeks' steady workouts: the heart rate
// against the power of the laps from the fifth minute on (before that the heart is still catching up) whose heart
// rate came within 10 beats of the range given (zone 2), leaving out a strap's dropouts and all-out efforts; a
// straight line through them, read at the range's middle and rounded to 5 W. Kept within the powers
// the laps ran at, and null with fewer than four such laps over two workouts or when the heart does not rise with
// the power. workouts as nextStep's, with laps [{ offset, heartRate, power }] (offset in seconds from the start).
export function steadyStartWatts(workouts, heartRange, today) {
  if (!heartRange) return null;
  const since = addDays(today, -28);
  const near = (rate) => rate >= heartRange[0] - 10 && rate <= heartRange[1] + 10;
  const used = workouts.filter((workout) => workout.day > since && workout.kind === "steady")
    .map((workout) => (workout.laps ?? []).filter((lap) => lap.offset >= 300 && near(lap.heartRate) && lap.power > 0))
    .filter((laps) => laps.length);
  const points = used.flat();
  if (points.length < 4 || used.length < 2) return null;
  const mean = (pick) => points.reduce((sum, lap) => sum + pick(lap), 0) / points.length;
  const power = mean((lap) => lap.power);
  const heart = mean((lap) => lap.heartRate);
  const spread = points.reduce((sum, lap) => sum + (lap.power - power) ** 2, 0);
  const slope = spread ? points.reduce((sum, lap) => sum + (lap.power - power) * (lap.heartRate - heart), 0) / spread : 0;
  if (!(slope > 0)) return null;
  const at = power + ((heartRange[0] + heartRange[1]) / 2 - heart) / slope;
  const powers = points.map((lap) => lap.power);
  return Math.round(Math.min(Math.max(at, Math.min(...powers)), Math.max(...powers) * 1.1) / 5) * 5;
}

// The cadence to keep steady workouts at, by sport: strokes a minute on the rower, turns of the pedals on the bike.
// The effort changes with the force of each stroke or the resistance, not with a faster cadence.
export const steadyCadence = { rowing: [20, 24], cycling: [80, 95] };
