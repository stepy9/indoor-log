import { workoutKind } from "../analysis.js";
import { dayKey } from "../diary.js";
import { decoupling, forSport, heartRateAt, heartRateOf, steps } from "../fitness.js";
import { valueOn } from "../history.js";
import { logPlan, plannedDay, progressionBuild, scoreWorkout, testPart, workoutFromName } from "../training.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { zone } from "./context.js";

// The plan of each day as it stood before it, per sport, kept with the synced settings so every device scores alike.
export function planLog(sport) {
  return savedDefaults().trainingLog?.[sport] ?? {};
}

// Keeps the days ahead as now planned; the days gone by stay. Written only when something changed.
export function keepPlan(sport, days, plan, today) {
  const all = savedDefaults().trainingLog ?? {};
  const next = logPlan(all[sport], days, plan, today);
  if (JSON.stringify(next) !== JSON.stringify(all[sport] ?? {})) saveDefaults({ trainingLog: { ...all, [sport]: next } });
}

// Whether the sport has the Training section filled in: then it gets the Training tab and its workouts a score.
export const hasTraining = (settings, sport) => Boolean(settings.sports?.[sport]?.plan);
export const anyTraining = (settings) => Object.keys(settings.sports ?? {}).some((sport) => hasTraining(settings, sport));

// What scoring reads from a workout: its time, kind, the heart rate against the zone 2 range after the first three
// minutes, the drift, the laps and an FTP test's all-out part.
export function workoutFacts(entry, heart, planned) {
  const ftpTest = /\bftp\b/i.test(entry.name ?? "");
  const named = workoutFromName(entry.name ?? "");
  const extra = named.kind === "extra" ? named.extra : null;
  let heartTimes = null;
  if (heart && entry.records?.heartRate) {
    const { seconds } = entry.records;
    const values = heartRateOf(entry);
    const dts = steps(seconds);
    const start = (seconds[0] ?? 0) + 180;
    // A progression's last minutes go above zone 2 on purpose: left out.
    const end = extra === "progression" ? (seconds.at(-1) ?? 0) - progressionBuild * 60 : Infinity;
    const times = { inside: 0, below: 0, above: 0 };
    seconds.forEach((second, index) => {
      const value = values[index];
      if (second < start || second > end || !(value > 0)) return;
      times[value < heart[0] ? "below" : value > heart[1] ? "above" : "inside"] += dts[index];
    });
    // Too little heart rate to go by (a strap off most of the time): left out.
    if (times.inside + times.below + times.above >= Math.max(60, ((entry.summary?.timerSeconds ?? 0) - 180) * 0.5)) heartTimes = times;
  }
  const test = ftpTest ? testPart(entry, planned?.type === "ftpTestShort" ? 5 : planned?.type === "ftpTest" ? 20 : null) : null;
  return {
    minutes: (entry.summary?.timerSeconds ?? 0) / 60,
    extra,
    extraMinutes: extra === "progression" || extra === "technique" ? named.minutes : null,
    kind: workoutKind(entry),
    ftpTest,
    heart: heartTimes,
    drift: decoupling(entry)?.percent ?? null,
    laps: (entry.laps ?? []).map((lap) => ({ seconds: lap.timerSeconds ?? (lap.endMs - lap.startMs) / 1000, power: lap.avgPower ?? null })),
    testMinutes: test?.minutes ?? null,
    testHalves: test?.halves ?? null,
  };
}

// The Training section and zone 2 as they stood on the workout's day; null when the section was not filled in then.
export function dayTargets(settings, entry) {
  const own = settings.sports?.[entry.sport] ?? {};
  if (!valueOn(own.history?.plan, dayKey(entry.startMs, settings.timeZone ?? zone), own.plan)) return null;
  const then = forSport(settings, entry.sport, entry.startMs);
  const bounds = [then.heartRateZones[1], then.heartRateZones[2]].map((fraction) => heartRateAt(fraction, then));
  return { heart: bounds.every(Number.isFinite) ? bounds.map(Math.round) : null };
}

// A workout's score against its day's plan, or against the current plan's targets for a day without one; null
// for a sport without the Training section or with nothing to score by. plan: the sport's current plan.
// With the settings, a day without its plan goes by the settings of its day: no score before the Training section
// was filled in, and zone 2 by the heart rate zones of then.
export function scoreFor(entry, plan, settings = null) {
  if (!plan) return null;
  const day = dayKey(entry.startMs, zone);
  const planned = planLog(entry.sport)[day] ?? null;
  const then = planned || !settings ? {} : dayTargets(settings, entry);
  if (!then) return null;
  const targets = planned ?? { ...plannedDay(null, plan), ...then };
  return scoreWorkout(workoutFacts(entry, targets.heart, planned), planned, targets);
}

// The average power while the heart rate was in zone 2, from the fifth minute on (the heart catching up before);
// null with under three minutes of it or without power.
export function zoneTwoWatts(entry, heart) {
  if (!heart || !entry.records?.heartRate || !entry.records?.power) return null;
  const { seconds, power } = entry.records;
  const values = heartRateOf(entry);
  const dts = steps(seconds);
  const start = (seconds[0] ?? 0) + 300;
  let sum = 0;
  let time = 0;
  seconds.forEach((second, index) => {
    if (second < start || !(values[index] >= heart[0] && values[index] <= heart[1]) || !Number.isFinite(power[index])) return;
    sum += power[index] * dts[index];
    time += dts[index];
  });
  return time >= 180 ? sum / time : null;
}
