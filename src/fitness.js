import { bestAverage, workoutKind } from "./analysis.js";
import { addDays, dayKey } from "./diary.js";

// Training load, fitness and form, time in zones, the power curve and aerobic decoupling, from library entries.

// A sample stands for the time since the one before it, but a pause does not count as riding on.
const longestStep = 5;

function steps(seconds) {
  return seconds.map((second, index) => (index ? Math.min(longestStep, Math.max(0, second - seconds[index - 1])) : 0));
}

const isPower = (value) => Number.isFinite(value) && value >= 0;

// Normalized power: the fourth-power mean of the 30-second rolling average, which weighs hard surges as the body does.
export function normalizedPower(entry) {
  const { seconds, power = [] } = entry.records;
  const dts = steps(seconds);
  let from = 0;
  let sum = 0;
  let span = 0;
  let total = 0;
  let weight = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    if (isPower(power[index])) {
      sum += power[index] * dts[index];
      span += dts[index];
    }
    while (seconds[from] <= seconds[index] - 30) {
      if (isPower(power[from])) {
        sum -= power[from] * dts[from];
        span -= dts[from];
      }
      from += 1;
    }
    if (seconds[index] - seconds[0] >= 30 && span > 0 && dts[index] > 0) {
      total += (sum / span) ** 4 * dts[index];
      weight += dts[index];
    }
  }
  return weight > 0 ? (total / weight) ** 0.25 : null;
}

// Share of the activity's samples with a value of the field.
const coverage = (entry, field) => {
  const values = entry.records[field] ?? [];
  return values.length ? values.filter(Number.isFinite).length / values.length : 0;
};

// Heart rate reserve held at the lactate threshold, roughly; one hour there makes a load of 100, as with power.
const thresholdReserve = 0.88;
const trimpWeight = (fraction) => fraction * 0.64 * Math.exp(1.92 * fraction);

// Banister's TRIMP from the heart rate, scaled so an hour at the threshold makes 100.
export function heartRateLoad(entry, { maxHeartRate, restHeartRate }) {
  if (!(maxHeartRate > restHeartRate)) return null;
  const { seconds, heartRate = [] } = entry.records;
  const dts = steps(seconds);
  let trimp = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    if (!Number.isFinite(heartRate[index])) continue;
    const fraction = Math.min(1, Math.max(0, (heartRate[index] - restHeartRate) / (maxHeartRate - restHeartRate)));
    trimp += (dts[index] / 60) * trimpWeight(fraction);
  }
  return (trimp / (60 * trimpWeight(thresholdReserve))) * 100;
}

// One sport's thresholds: settings.sports[sport] holds them, older settings kept one maximum heart rate and an FTP per sport.
export function forSport(settings, sport) {
  const own = settings.sports?.[sport] ?? {};
  return {
    restHeartRate: settings.restHeartRate,
    maxHeartRate: own.maxHeartRate ?? settings.maxHeartRate ?? null,
    ftp: own.ftp ?? settings.ftp?.[sport] ?? null,
    heartRateZones: validZones(own.heartRateZones, heartRateZones),
    powerZones: validZones(own.powerZones, powerZones),
  };
}

// Zone bounds as typed: as many as the defaults, starting at 0 and rising, or else the defaults.
function validZones(bounds, fallback) {
  return Array.isArray(bounds) && bounds.length === fallback.length && bounds[0] === 0
    && bounds.every((value, index) => !index || value > bounds[index - 1]) ? bounds : fallback;
}

// The activity's load: TSS from power when the sport's FTP is known and most of it has power, else from the heart rate.
// Returns { load, by: "power" | "heartRate", intensity } or null.
export function activityLoad(entry, allSettings) {
  const settings = forSport(allSettings, entry.sport);
  const ftp = settings.ftp;
  const seconds = entry.summary.timerSeconds ?? 0;
  if (ftp > 0 && coverage(entry, "power") >= 0.5) {
    const np = normalizedPower(entry);
    if (np) {
      const intensity = np / ftp;
      return { load: (seconds * np * intensity) / (ftp * 3600) * 100, by: "power", intensity };
    }
  }
  if (coverage(entry, "heartRate") >= 0.5) {
    const load = heartRateLoad(entry, settings);
    if (load != null) return { load, by: "heartRate", intensity: null };
  }
  return null;
}

// Fitness (42-day load average), fatigue (7-day) and form (yesterday's fitness less fatigue), day by day
// from the first activity to the last day asked for. Each day: { day, load, fitness, fatigue, form }.
export const fitnessDays = 42;
export const fatigueDays = 7;

export function loadHistory(entries, settings, timeZone, lastDay) {
  const byDay = new Map();
  for (const entry of entries) {
    const result = activityLoad(entry, settings);
    if (!result) continue;
    const day = dayKey(entry.startMs, timeZone);
    byDay.set(day, (byDay.get(day) ?? 0) + result.load);
  }
  if (!byDay.size) return [];
  const first = [...byDay.keys()].sort()[0];
  const days = [];
  let fitness = 0;
  let fatigue = 0;
  for (let day = first; day <= lastDay; day = addDays(day, 1)) {
    const load = byDay.get(day) ?? 0;
    const form = fitness - fatigue;
    fitness += (load - fitness) / fitnessDays;
    fatigue += (load - fatigue) / fatigueDays;
    days.push({ day, load, fitness, fatigue, form });
  }
  return days;
}

// What the form says: fresh and ready, in balance, building fitness, or overreaching.
export function formState(form) {
  if (form > 15) return "fresh";
  if (form > -10) return "neutral";
  if (form > -30) return "productive";
  return "overreaching";
}

// Default zones as fractions of the maximum heart rate or of the FTP; each zone runs from its bound up to the next one.
export const heartRateZones = [0, 0.6, 0.7, 0.8, 0.9];
export const powerZones = [0, 0.55, 0.75, 0.9, 1.05, 1.2];

// Seconds spent in each zone over the activities; by "heartRate" against the maximum, by "power" against each sport's FTP.
// Each sport counts against its own zones.
export function timeInZones(entries, by, allSettings) {
  const totals = (by === "power" ? powerZones : heartRateZones).map(() => 0);
  for (const entry of entries) {
    const settings = forSport(allSettings, entry.sport);
    const bounds = by === "power" ? settings.powerZones : settings.heartRateZones;
    const reference = by === "power" ? settings.ftp : settings.maxHeartRate;
    if (!(reference > 0)) continue;
    const { seconds } = entry.records;
    const values = entry.records[by] ?? [];
    const dts = steps(seconds);
    for (let index = 0; index < seconds.length; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value) || (by === "heartRate" && value <= 0)) continue;
      const fraction = value / reference;
      let zone = 0;
      while (zone + 1 < bounds.length && fraction >= bounds[zone + 1]) zone += 1;
      totals[zone] += dts[index];
    }
  }
  return totals;
}

// The power curve's durations, in seconds.
export const curveDurations = [5, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

// The best mean power held for each duration across the activities, with the activity it came from.
export function powerCurve(entries) {
  return curveDurations.map((duration) => {
    let best = null;
    for (const entry of entries) {
      if (coverage(entry, "power") < 0.5) continue;
      const value = bestAverage(entry, "power", duration);
      if (value != null && (best == null || value > best.value)) best = { value, entry };
    }
    return { duration, value: best?.value ?? null, entry: best?.entry ?? null };
  });
}

// FTP estimated as 95 % of the best 20 minutes of the activities, or null without one long enough.
export function estimateFtp(entries) {
  const [point] = powerCurve(entries).filter((item) => item.duration === 1200);
  return point?.value ? Math.round(point.value * 0.95) : null;
}

// The highest heart rate recorded, ignoring single readings beyond 220 that only a loose strap gives.
export function estimateMaxHeartRate(entries) {
  const values = entries.map((entry) => entry.summary.maxHeartRate).filter((value) => Number.isFinite(value) && value > 100 && value <= 220);
  return values.length ? Math.max(...values) : null;
}

// Aerobic decoupling: how much the output per heartbeat drops from the first half of a steady workout to the second.
// The output is power, or the speed when there is none. Below 5 % the heart kept pace with the work.
// The first ten minutes are left out as warm-up; the workout needs 20 minutes after them.
const warmUpSeconds = 600;
const decouplingMinimum = 1200;

export function decoupling(entry) {
  if (workoutKind(entry) !== "steady") return null;
  const { seconds, heartRate = [] } = entry.records;
  const field = coverage(entry, "power") >= 0.5 ? "power" : "speed";
  const output = entry.records[field] ?? [];
  if (coverage(entry, "heartRate") < 0.5) return null;
  const start = seconds[0] + warmUpSeconds;
  const end = seconds.at(-1);
  if (end - start < decouplingMinimum) return null;
  const middle = (start + end) / 2;
  const halves = [{ output: 0, heart: 0 }, { output: 0, heart: 0 }];
  const dts = steps(seconds);
  for (let index = 0; index < seconds.length; index += 1) {
    if (seconds[index] < start || !Number.isFinite(output[index]) || !(heartRate[index] > 0)) continue;
    const half = halves[seconds[index] < middle ? 0 : 1];
    half.output += output[index] * dts[index];
    half.heart += heartRate[index] * dts[index];
  }
  if (!halves.every((half) => half.output > 0 && half.heart > 0)) return null;
  const [first, second] = halves.map((half) => half.output / half.heart);
  return { percent: ((first - second) / first) * 100, by: field };
}
