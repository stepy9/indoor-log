// How the training went against the plan: each workout scored 0–100 against what was planned for its day,
// each week's plan against what was ridden, and the run of days ridden. The plan of each day is kept as it
// stood before the day (logPlan), as the plan itself moves on with every workout. No DOM here.

const dayMs = 86_400_000;
const noon = (key) => Date.parse(`${key}T12:00:00Z`);
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (key, days) => keyOf(noon(key) + days * dayMs);
const mondayOf = (key) => addDays(key, -((new Date(noon(key)).getUTCDay() + 6) % 7));
const clamp = (value) => Math.max(0, Math.min(1, value));
const round = (value) => Math.round(value);

// Why a day went without its workout: the usual reasons, "other" with words of one's own. Illness and injury hold
// the plan back for the week after; the others are no reason to ease off.
export const excuseReasons = ["illness", "injury", "fatigue", "work", "travel", "family", "time", "rest", "other"];
export const healthReasons = new Set(["illness", "injury"]);

// The excuses with the days from to (both kept) set to the reason, or cleared with none.
// excuses: { "YYYY-MM-DD": { reason, note } }.
export function setExcuse(excuses, from, to, excuse) {
  const next = { ...(excuses ?? {}) };
  for (let day = from; day <= (to ?? from); day = addDays(day, 1)) {
    if (excuse) next[day] = { reason: excuse.reason, ...(excuse.note ? { note: excuse.note } : {}) };
    else delete next[day];
  }
  return next;
}

// Whether illness or injury kept off training on a day of the week before today: the plan holds then.
export function recentlyUnwell(excuses, today) {
  return Object.entries(excuses ?? {}).some(([day, excuse]) => day < today && day >= addDays(today, -7) && healthReasons.has(excuse.reason));
}

// The plan's days kept this long, in days.
export const logDays = 26 * 7;

// What a day's plan keeps: its type and the targets of every kind, so a workout of another kind can be scored too.
// plan: nextStep's, with steadyHeartRate. { type, usualMinutes, longMinutes, minimalMinutes, heart, intervals }
export function plannedDay(type, plan) {
  return {
    type,
    usualMinutes: plan.usual?.minutes ?? null,
    longMinutes: plan.long?.minutes ?? null,
    minimalMinutes: plan.minimal?.minutes ?? null,
    heart: plan.steadyHeartRate ?? null,
    intervals: plan.intervals ? { repeats: plan.intervals.repeats, minutes: plan.intervals.minutes, rest: plan.intervals.rest, watts: plan.intervals.watts ?? null } : null,
  };
}

// The log with the days ahead set as now planned: today and later change with the plan, the days gone by stay as
// they were planned before them. Days older than logDays go. log: { "YYYY-MM-DD": plannedDay }.
export function logPlan(log, days, plan, today) {
  const next = Object.fromEntries(Object.entries(log ?? {}).filter(([day]) => day >= addDays(today, -logDays) && day < today));
  for (const { day, type } of days) if (day >= today) next[day] = plannedDay(type, plan);
  // Today's stays as planned when it is already done (weekPlan leaves out a day trained on).
  if (log?.[today] && !days.some((item) => item.day === today)) next[today] = log[today];
  return next;
}

// The score parts' weights, by the kind scored as.
const weights = {
  steady: { zone: 50, time: 30, drift: 20 },
  intervals: { repeats: 40, power: 40, rest: 20 },
  ftpTest: { even: 60, time: 40 },
  minimal: { easy: 60, time: 40 },
};

// A score from parts { key: share 0–1 or null }: the weighted average of those known, 0–100; null without any.
function weighted(kind, shares) {
  let sum = 0;
  let total = 0;
  for (const [key, share] of Object.entries(shares)) {
    if (share == null) continue;
    sum += weights[kind][key] * share;
    total += weights[kind][key];
  }
  return total ? round((sum / total) * 100) : null;
}

// A workout's score against its day's plan. facts: { minutes, kind: "steady" | "intervals", ftpTest,
// heart: { inside, below, above } seconds after the first three minutes (or null without a heart rate),
// drift: percent or null, laps: [{ seconds, power }], testHalves: [first, second] average power or null }.
// planned: plannedDay or null (no plan for the day: the kind ridden is scored by the targets given in fallback).
// Scored as what was ridden: an FTP test, intervals, or a steady workout (as the minimal one when only that was
// planned or it came no longer than it). { score, as, planned, swapped, parts: [{ key, share, ...params }] } or null.
export function scoreWorkout(facts, planned, fallback = null) {
  const targets = planned ?? fallback;
  if (!targets) return null;
  const type = planned?.type ?? null;
  const parts = [];
  const part = (key, share, params = {}) => {
    parts.push({ key, share: share == null ? null : Math.round(share * 100) / 100, ...params });
    return share;
  };
  let as;
  let score;
  if (facts.ftpTest) {
    as = "ftpTest";
    const minutes = type === "ftpTestShort" ? 5 : type === "ftpTest" ? 20 : facts.testMinutes ?? null;
    // The second half within 5 % of the first is even; 20 % down or more is a fade.
    const fade = facts.testHalves ? (facts.testHalves[0] - facts.testHalves[1]) / facts.testHalves[0] : null;
    const even = part("even", fade == null ? null : clamp(1 - (Math.abs(fade) - 0.05) / 0.15), { fade: fade == null ? null : round(fade * 100) });
    const time = part("time", minutes && facts.testMinutes ? clamp(facts.testMinutes / minutes) : null, { done: facts.testMinutes ? round(facts.testMinutes) : null, planned: minutes });
    score = weighted("ftpTest", { even, time });
  } else if ((facts.kind === "intervals" || facts.extra === "pyramid") && targets.intervals) {
    // A pyramid's efforts are of 1 to 3 minutes, five of them: counted from the shortest.
    as = facts.extra === "pyramid" ? "pyramid" : "intervals";
    const plan = as === "pyramid" ? { ...targets.intervals, repeats: 5, minutes: 1, rest: 1 } : targets.intervals;
    // Work laps: at least 80 % of the planned length and harder than the workout's middle.
    const powers = facts.laps.map((lap) => lap.power).filter((value) => value > 0).sort((a, b) => a - b);
    const middle = powers.length ? powers[Math.floor(powers.length / 2)] : 0;
    const floor = plan.watts ? plan.watts[0] * 0.95 : middle * 1.1;
    const work = facts.laps.filter((lap) => lap.seconds >= plan.minutes * 60 * 0.8 && lap.power > 0 && lap.power >= Math.min(floor, middle * 1.1));
    // Without a plan for the day, a workout of other efforts than the plan's is no failure of it: not scored.
    if (!planned && !work.length) return null;
    const repeats = part("repeats", clamp(work.length / plan.repeats), { done: work.length, planned: plan.repeats });
    const hit = work.filter((lap) => lap.power >= floor).length;
    const power = part("power", plan.watts && work.length ? hit / work.length : null, { hit, of: work.length, watts: plan.watts?.[0] ?? null });
    // The rests easy: the laps between under 80 % of the work's floor.
    const rests = facts.laps.filter((lap) => !work.includes(lap) && lap.seconds >= plan.rest * 60 * 0.5 && lap.power > 0);
    const rest = part("rest", rests.length && work.length ? rests.filter((lap) => lap.power < floor * 0.8).length / rests.length : null);
    score = weighted("intervals", { repeats, power, rest });
  } else {
    // The least workout: about its time, clearly short of the one planned, and easy (a heart rate above zone 2
    // for under a fifth of the time).
    const minimal = targets.minimalMinutes;
    const heartTotal = facts.heart ? facts.heart.inside + facts.heart.below + facts.heart.above : 0;
    const steadyMinutes = type === "long" ? targets.longMinutes : targets.usualMinutes;
    const isMinimal = minimal && (type === null || type === "usual" || type === "long")
      && facts.minutes >= minimal * 0.8 && facts.minutes <= minimal * 1.2 && (!steadyMinutes || facts.minutes < steadyMinutes * 0.8)
      && (!heartTotal || facts.heart.above / heartTotal < 0.2);
    if (isMinimal) {
      as = "minimal";
      const easy = part("easy", heartTotal ? clamp(1 - Math.max(0, facts.heart.above / heartTotal - 0.2) / 0.3) : null, { above: heartTotal ? round((facts.heart.above / heartTotal) * 100) : null });
      const time = part("time", clamp(facts.minutes / minimal), { done: round(facts.minutes), planned: minimal });
      score = weighted("minimal", { easy, time });
    } else {
      // A progression and a technique drill by their own length, without the drift (built on purpose, or the
      // stroke rate changing); the progression's build left out of its zone 2 by the facts.
      as = facts.extra === "progression" || facts.extra === "technique" ? facts.extra : type === "long" ? "long" : "usual";
      const plannedMinutes = facts.extraMinutes ?? (as === "long" ? targets.longMinutes : targets.usualMinutes);
      // In zone 2 counts whole, below it half (easy, if not the aim), above it nothing.
      const zone = part("zone", heartTotal ? (facts.heart.inside + facts.heart.below * 0.5) / heartTotal : null, { inside: heartTotal ? round((facts.heart.inside / heartTotal) * 100) : null, above: heartTotal ? round((facts.heart.above / heartTotal) * 100) : null });
      const time = part("time", plannedMinutes ? clamp(facts.minutes / plannedMinutes) : null, { done: round(facts.minutes), planned: plannedMinutes });
      // The heart drifting up to 5 % is fine, from 10 % on it is the full loss.
      const driftValue = facts.extra ? null : facts.drift;
      const drift = part("drift", driftValue == null ? null : clamp(1 - (driftValue - 5) / 5), { drift: driftValue == null ? null : Math.round(driftValue * 10) / 10 });
      score = weighted("steady", { zone, time, drift });
    }
  }
  if (score == null) return null;
  // Another kind than planned is no fault: scored as ridden, only told.
  // An extra in place of its kind is no swap: a pyramid for intervals, a progression or a drill for a steady day.
  const inPlace = (as === "minimal" || as === "progression" || as === "technique") ? type === "usual" || type === "long"
    : as === "pyramid" ? type === "intervals" : as === "ftpTest" ? type?.startsWith("ftpTest") : false;
  const swapped = Boolean(type) && type !== as && !inPlace;
  return { score, as, planned: type, swapped, approx: !planned, parts };
}

// One week of the plan against the workouts: the training days planned and ridden, the longer workouts and the
// interval workouts planned and done (a longer one counted as one of at least 90 % of its planned time), and the
// average score. log: the plan's days; workouts: [{ day, minutes, kind, ftpTest, score }]. Today counts only once
// ridden, as it is still open; the days after it not at all. { monday, planned, ridden, long: [done, planned], intervals: [done, planned], score }.
export function weekAdherence(log, workouts, monday, today, excuses = {}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index)).filter((day) => day <= today);
  const inWeek = workouts.filter((workout) => workout.day >= monday && workout.day < addDays(monday, 7) && workout.day <= today);
  const riddenOn = (day) => inWeek.some((workout) => workout.day === day);
  // A day excused and not ridden is no day missed: it leaves the plan.
  const plannedDays = days.filter((day) => log[day] && (riddenOn(day) || (day < today && !excuses[day])));
  const ridden = new Set(inWeek.map((workout) => workout.day));
  const count = (type) => plannedDays.filter((day) => log[day].type === type).length;
  const longPlanned = count("long");
  const longDone = inWeek.filter((workout) => workout.kind === "steady" && log[workout.day]?.longMinutes && workout.minutes >= log[workout.day].longMinutes * 0.9).length;
  const intervalsDone = inWeek.filter((workout) => workout.kind === "intervals" && !workout.ftpTest).length;
  const scores = inWeek.map((workout) => workout.score).filter(Number.isFinite);
  return {
    monday,
    planned: plannedDays.length,
    ridden: plannedDays.filter((day) => ridden.has(day)).length,
    extra: [...ridden].filter((day) => !log[day]).length,
    excused: days.filter((day) => log[day] && excuses[day] && !riddenOn(day)).length,
    long: [Math.min(longDone, Math.max(longPlanned, longDone)), longPlanned],
    intervals: [intervalsDone, count("intervals")],
    score: scores.length ? round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
  };
}

// Whether the week's summary shows: from Monday until the week's first workout, Wednesday at the latest.
export function showsWeekSummary(rideDays, today) {
  const monday = mondayOf(today);
  return today < addDays(monday, 3) && !rideDays.some((day) => day >= monday && day <= today);
}

// The share of the planned training days ridden over the weeks given, 0–100, or null without any planned.
export function adherenceShare(weeks) {
  const planned = weeks.reduce((sum, week) => sum + week.planned, 0);
  return planned ? round((weeks.reduce((sum, week) => sum + week.ridden, 0) / planned) * 100) : null;
}

// The run of days in a row with a workout, up to today (or yesterday while today is still to ride); a day excused
// neither breaks it nor adds to it. { days, today: whether today is ridden }.
export function dayStreak(rideDays, today, excused = {}) {
  const set = new Set(rideDays);
  const ridden = set.has(today);
  let day = ridden ? today : addDays(today, -1);
  let days = 0;
  for (;;) {
    if (set.has(day)) days += 1;
    else if (!excused[day]) break;
    day = addDays(day, -1);
    if (day < addDays(today, -logDays)) break;
  }
  return { days, today: ridden };
}

// The Mondays of the last weeks, oldest first, this week last.
export function lastMondays(today, weeks) {
  const monday = mondayOf(today);
  return Array.from({ length: weeks }, (_, index) => addDays(monday, (index - weeks + 1) * 7));
}

// The longest steady workout of each of the last weeks in minutes, oldest first, this week last:
// [{ monday, minutes }] with 0 for a week without one. workouts: [{ day, minutes, kind }].
export function longestMinutesByWeek(workouts, today, weeks = 8) {
  return lastMondays(today, weeks).map((monday) => {
    const inWeek = workouts.filter((workout) => workout.kind === "steady" && workout.day >= monday && workout.day < addDays(monday, 7));
    return { monday, minutes: inWeek.length ? Math.round(Math.max(...inWeek.map((workout) => workout.minutes))) : 0 };
  });
}

// The power at a zone 2 heart rate over time: each steady workout's point, and the line through the last ones'
// as watts gained per four weeks. points: [{ day, watts }]; { points, perFourWeeks } with perFourWeeks null
// under four points or two weeks.
export function zoneTwoTrend(points) {
  const sorted = [...points].filter((point) => point.watts > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (sorted.length < 4) return { points: sorted, perFourWeeks: null };
  const xs = sorted.map((point) => noon(point.day) / dayMs);
  if (xs.at(-1) - xs[0] < 14) return { points: sorted, perFourWeeks: null };
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = sorted.reduce((sum, point) => sum + point.watts, 0) / sorted.length;
  const slope = xs.reduce((sum, x, index) => sum + (x - meanX) * (sorted[index].watts - meanY), 0) / xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  return { points: sorted, perFourWeeks: Math.round(slope * 28 * 10) / 10 };
}

// Fatigue by feel: the last three rated workouts each felt harder than usual (an effort 2 or more above the median
// of the four weeks before them, or a weak feel) at a heart rate no higher than usual. workouts: [{ day, rpe, feel,
// avgHeartRate }], rpe 1–10 and feel 0–100 or null. { days, rpe, usualRpe } or null.
export function fatigueByFeel(workouts, today) {
  const rated = workouts.filter((workout) => workout.day <= today && (workout.rpe > 0 || Number.isFinite(workout.feel))).sort((a, b) => a.day.localeCompare(b.day));
  const last = rated.slice(-3);
  if (last.length < 3 || last[0].day < addDays(today, -10)) return null;
  const before = rated.filter((workout) => workout.day < last[0].day && workout.day >= addDays(last[0].day, -28));
  const median = (values) => {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  };
  const usualRpe = median(before.map((workout) => workout.rpe || null));
  const usualHeart = median(before.map((workout) => workout.avgHeartRate));
  const harder = (workout) => (usualRpe != null && workout.rpe >= usualRpe + 2) || (Number.isFinite(workout.feel) && workout.feel <= 25);
  const calmHeart = (workout) => usualHeart == null || !(workout.avgHeartRate > usualHeart + 3);
  if (!last.every((workout) => harder(workout) && calmHeart(workout))) return null;
  return { days: last.length, rpe: median(last.map((workout) => workout.rpe || null)), usualRpe };
}

// A week's overall score, 0–100: keeping to the plan (the planned days ridden 40, the longer workouts 15, the
// intervals 10) and riding well (the workouts' average score 35); the parts without a plan or a score left out and
// the rest weighed up. week: weekAdherence's. Null with nothing to go by.
export function weekScore(week) {
  const parts = [
    [40, week.planned ? week.ridden / week.planned : null],
    [15, week.long?.[1] ? Math.min(1, week.long[0] / week.long[1]) : null],
    [10, week.intervals?.[1] ? Math.min(1, week.intervals[0] / week.intervals[1]) : null],
    [35, week.score != null ? week.score / 100 : null],
  ].filter(([, share]) => share != null);
  const total = parts.reduce((sum, [weight]) => sum + weight, 0);
  return total ? Math.round((parts.reduce((sum, [weight, share]) => sum + weight * share, 0) / total) * 100) : null;
}

// Kinomap routes ridden before that fit a planned distance, those ridden longest ago first: each route (by name)
// with its usual distance and the last day ridden. rides: [{ name, km, day, kind }]; range: [fromKm, toKm].
// [{ name, km, last }] up to count; the nearest in length when none fits.
export function routeSuggestions(rides, range, count = 3) {
  const routes = new Map();
  for (const ride of rides) {
    if (ride.kind !== "steady" || !ride.name || !(ride.km > 0) || ride.workout) continue;
    const route = routes.get(ride.name) ?? { name: ride.name, kms: [], last: "" };
    route.kms.push(ride.km);
    if (ride.day > route.last) route.last = ride.day;
    routes.set(ride.name, route);
  }
  const list = [...routes.values()].map((route) => ({ name: route.name, km: Math.max(...route.kms), last: route.last }));
  const fits = list.filter((route) => route.km >= range[0] - 0.05 && route.km <= range[1] + 0.05).sort((a, b) => a.last.localeCompare(b.last));
  if (fits.length) return fits.slice(0, count);
  const middle = (range[0] + range[1]) / 2;
  return list.sort((a, b) => Math.abs(a.km - middle) - Math.abs(b.km - middle)).slice(0, Math.min(count, 2));
}

// The efforts a workout's name tells: "6x2 min", "6× 2 min" or "2 x 10 min" as { repeats, minutes }, or null.
export function effortsInName(name) {
  const match = /(\d+)\s*[x×]\s*(\d+)\s*min/i.exec(name ?? "");
  return match ? { repeats: Number(match[1]), minutes: Number(match[2]) } : null;
}

// The workouts made in the Kinomap creator, ridden before, for a planned day: the FTP test by "FTP" and its
// minutes in the name, intervals by the other workouts of efforts; for intervals the one whose name tells the
// planned efforts first, then those of the planned length, then the rest, each those ridden longest ago first.
// rides as routeSuggestions'; type: the plan's day type; intervals: the plan's { repeats, minutes }. [{ name, last, exact }].
export function workoutSuggestions(rides, type, count = 3, intervals = null) {
  const byName = new Map();
  for (const ride of rides) {
    if (!ride.name) continue;
    const isTest = /\bftp\b/i.test(ride.name);
    const wanted = type === "ftpTestShort" ? isTest && /\b5\s*min/i.test(ride.name)
      : type === "ftpTest" ? isTest && /\b20\s*min/i.test(ride.name)
      : type === "intervals" ? !isTest && ride.kind === "intervals" : false;
    if (!wanted) continue;
    const last = byName.get(ride.name)?.last ?? "";
    byName.set(ride.name, { name: ride.name, last: ride.day > last ? ride.day : last });
  }
  const rank = (item) => {
    const efforts = effortsInName(item.name);
    if (!intervals || !efforts) return 2;
    return efforts.minutes === intervals.minutes ? (efforts.repeats === intervals.repeats ? 0 : 1) : 2;
  };
  return [...byName.values()].map((item) => ({ ...item, exact: rank(item) === 0 }))
    .sort((a, b) => rank(a) - rank(b) || a.last.localeCompare(b.last)).slice(0, count);
}

// The FTP from a 20-minute test: 95 % of its best 20 minutes, the latest such test after the FTP typed last.
// tests: [{ day, best20 }] (watts, null without power); typedFrom: the day of the FTP typed last, or null.
// { day, best20, ftp } or null.
export function ftpFromTest(tests, typedFrom) {
  const latest = tests.filter((test) => test.best20 > 0 && (!typedFrom || test.day > typedFrom)).sort((a, b) => a.day.localeCompare(b.day)).at(-1);
  return latest ? { day: latest.day, best20: Math.round(latest.best20), ftp: Math.round(latest.best20 * 0.95) } : null;
}

// The Kinomap creator's workouts made for the plan, by name; a sport's list starts from these until changed.
export const defaultKinomapWorkouts = {
  rowing: ["FTP test 5 min", "FTP test 20 min", "Intervaly 4x2 min", "Intervaly 5x2 min", "Intervaly 6x2 min", "Intervaly 7x2 min", "Intervaly 8x2 min", "Pyramida 1-2-3-2-1 min", "Progrese 30 min", "Technika tempo záběrů 20 min", "Minimální jízda 10 min"],
};

// What a workout's name says it is: an FTP test by "FTP" and its minutes, intervals by "6x2 min", the least workout
// by "minimální" or "minimal", anything else an extra to ride for a change. { kind, repeats?, minutes? }.
export function workoutFromName(name) {
  if (/\bftp\b/i.test(name)) return /\b20\s*min/i.test(name) ? { kind: "ftpTest" } : /\b5\s*min/i.test(name) ? { kind: "ftpTestShort" } : { kind: "extra" };
  if (/minim/i.test(name)) return { kind: "minimal" };
  const efforts = effortsInName(name);
  if (efforts) return { kind: "intervals", ...efforts };
  // The extras the plan knows: a pyramid of efforts, a steady ride building at its end, a drill of stroke rates.
  const minutes = Number(/(\d+)\s*min\s*$/i.exec(name)?.[1]) || null;
  const extra = /pyramid/i.test(name) ? "pyramid" : /progres/i.test(name) ? "progression" : /techni/i.test(name) ? "technique" : null;
  return { kind: "extra", extra, minutes };
}

// The last minutes of a progression, built up above zone 2 on purpose: left out of its time in zone 2.
export const progressionBuild = 8;

// The workouts to ride for the plan, from the names of those made: the interval workout of the planned efforts, the
// two FTP tests, the least workout, and the rest as extras; each null when none fits. intervals: the plan's
// { repeats, minutes }. { intervals, ftpTestShort, ftpTest, minimal, extras: [name], wanted: "6x2 min" }.
export function pickWorkouts(names, intervals) {
  const list = (names ?? []).map((name) => name.trim()).filter(Boolean).map((name) => ({ name, ...workoutFromName(name) }));
  const first = (test) => list.find(test)?.name ?? null;
  return {
    intervals: intervals ? first((item) => item.kind === "intervals" && item.repeats === intervals.repeats && item.minutes === intervals.minutes) : null,
    ftpTestShort: first((item) => item.kind === "ftpTestShort"),
    ftpTest: first((item) => item.kind === "ftpTest"),
    minimal: first((item) => item.kind === "minimal"),
    extras: list.filter((item) => item.kind === "extra").map((item) => item.name),
    pyramid: first((item) => item.extra === "pyramid"),
    progression: first((item) => item.extra === "progression"),
    technique: first((item) => item.extra === "technique"),
    wanted: intervals ? `${intervals.repeats}x${intervals.minutes} min` : null,
  };
}
