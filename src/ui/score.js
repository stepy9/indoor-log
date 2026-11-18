import { workoutKind } from "../analysis.js";
import { dayKey } from "../diary.js";
import { decoupling, heartRateOf, steps } from "../fitness.js";
import { logPlan, plannedDay, progressionBuild, scoreWorkout, workoutFromName } from "../training.js";
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

// An FTP test's all-out part: the lap nearest the planned length (or of four minutes or more at the most power),
// with its two halves' average power. { minutes, halves } or nulls.
function testPart(entry, minutes) {
  const laps = (entry.laps ?? []).filter((lap) => lap.timerSeconds >= 180 && lap.avgPower > 0);
  if (!laps.length) return { minutes: null, halves: null };
  const lap = minutes
    ? laps.reduce((best, item) => (Math.abs(item.timerSeconds - minutes * 60) < Math.abs(best.timerSeconds - minutes * 60) ? item : best))
    : laps.reduce((best, item) => (item.avgPower > best.avgPower ? item : best));
  const { seconds, power = [] } = entry.records;
  const from = (lap.startMs - entry.startMs) / 1000;
  const to = (lap.endMs - entry.startMs) / 1000;
  const middle = (from + to) / 2;
  const sums = [[0, 0], [0, 0]];
  seconds.forEach((second, index) => {
    if (second <= from || second > to || !Number.isFinite(power[index])) return;
    const half = sums[second <= middle ? 0 : 1];
    half[0] += power[index];
    half[1] += 1;
  });
  const halves = sums.every(([, count]) => count) ? sums.map(([sum, count]) => sum / count) : null;
  return { minutes: lap.timerSeconds / 60, halves };
}

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

// A workout's score against its day's plan, or against the current plan's targets for a day without one; null
// for a sport without the Training section or with nothing to score by. plan: the sport's current plan.
export function scoreFor(entry, plan) {
  if (!plan) return null;
  const day = dayKey(entry.startMs, zone);
  const planned = planLog(entry.sport)[day] ?? null;
  const targets = planned ?? plannedDay(null, plan);
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
