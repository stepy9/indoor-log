import { bestAverage, workoutKind } from "./analysis.js";
import { addDays, dayKey } from "./diary.js";
import { toRecords, valueOn } from "./history.js";

// The FTP and weight records, from their history or as older settings listed them.
export const ftpRecords = (own) => (own?.history?.ftp ? toRecords(own.history.ftp, "ftp") : own?.ftpHistory ?? []);
export const weightRecords = (settings) => (settings?.history?.weight ? toRecords(settings.history.weight, "kg") : settings?.weightHistory ?? []);

// Training load, fitness and form, time in zones, the power curve and aerobic decoupling, from library entries.

// A sample stands for the time since the one before it, but a pause does not count as riding on.
const longestStep = 5;

export function steps(seconds) {
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
  const { seconds } = entry.records;
  const heartRate = heartRateOf(entry);
  const dts = steps(seconds);
  let trimp = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    if (!Number.isFinite(heartRate[index])) continue;
    const fraction = Math.min(1, Math.max(0, (heartRate[index] - restHeartRate) / (maxHeartRate - restHeartRate)));
    trimp += (dts[index] / 60) * trimpWeight(fraction);
  }
  return (trimp / (60 * trimpWeight(thresholdReserve))) * 100;
}

// One sport's thresholds on the given moment (now by default): settings.sports[sport] holds them,
// older settings kept one maximum heart rate and an FTP per sport.
// Each value is the one in force on the moment's day (settings.history and each sport's history, see history.js);
// a maximum not typed then is the general one, then the estimate.
export function forSport(settings, sport, atMs = Date.now()) {
  const own = settings.sports?.[sport] ?? {};
  const day = dayKey(atMs, settings.timeZone ?? "UTC");
  const general = settings.history ?? {};
  const mine = own.history ?? {};
  const generalMax = "typedMaxHeartRate" in settings
    ? valueOn(general.maxHeartRate, day, settings.typedMaxHeartRate) || settings.estimates?.maxHeartRate || settings.maxHeartRate || null
    : settings.maxHeartRate ?? null;
  const maxHeartRate = "typedMaxHeartRate" in own
    ? valueOn(mine.maxHeartRate, day, own.typedMaxHeartRate) || generalMax
    : own.maxHeartRate ?? generalMax;
  return {
    restHeartRate: valueOn(general.restHeartRate, day, settings.restHeartRate) || settings.defaultRestHeartRate || settings.restHeartRate,
    maxHeartRate,
    ftp: ftpOn(settings, sport, atMs),
    heartRateZones: validZones(valueOn(mine.heartRateZones, day, own.heartRateZones), heartRateZones, zoneLimits.heartRate),
    // "max": zones as a share of the maximum; "reserve": of the reserve above the resting heart rate (Karvonen).
    heartRateBasis: valueOn(mine.heartRateBasis, day, own.heartRateBasis) === "reserve" ? "reserve" : "max",
    powerZones: validZones(valueOn(mine.powerZones, day, own.powerZones), powerZones, zoneLimits.power),
  };
}

// The FTP in force on the moment: the latest record of the sport's history up to that day, then a single FTP
// as older settings kept it, then the estimate from the activities up to then (settings.estimatedFtp, from ftpTimeline).
// A record without a date holds from the start.
export function ftpOn(settings, sport, atMs) {
  return ftpSourceOn(settings, sport, atMs)?.ftp ?? null;
}

// The body weight on the moment: the latest record of the history up to that day, one without a date holding
// from the start; null without any. see weightRecords.
export function weightOn(settings, atMs) {
  const day = dayKey(atMs, settings.timeZone ?? "UTC");
  const records = weightRecords(settings).filter((record) => record.kg > 0 && (!record.from || record.from <= day));
  if (!records.length) return null;
  return records.reduce((latest, record) => ((record.from ?? "") >= (latest.from ?? "") ? record : latest)).kg;
}

// The same FTP with where it comes from: { ftp, method: "manual", from } for a record typed,
// or { ftp, method: "cp" | "20min", entry } for the estimate; null without any.
export function ftpSourceOn(settings, sport, atMs) {
  const own = settings.sports?.[sport] ?? {};
  const day = dayKey(atMs, settings.timeZone ?? "UTC");
  const history = ftpRecords(own).filter((record) => record.ftp > 0 && (!record.from || record.from <= day));
  if (history.length) {
    const record = history.reduce((latest, item) => ((item.from ?? "") >= (latest.from ?? "") ? item : latest));
    return { ftp: record.ftp, method: "manual", from: record.from ?? null };
  }
  if (own.ftp ?? settings.ftp?.[sport]) return { ftp: own.ftp ?? settings.ftp[sport], method: "manual", from: null };
  const estimate = (settings.estimatedFtp?.[sport] ?? []).filter((point) => point.ms <= atMs).at(-1);
  return estimate?.ftp ? { ftp: estimate.ftp, method: estimate.method, entry: estimate.entry } : null;
}

// How the FTP estimate went, per sport and oldest first: at each activity with power, from the best efforts
// of the half year up to and including it. With hard efforts of 3 to 20 minutes the critical power model gives it;
// otherwise 95 % of the best 20 minutes. [{ ms, ftp, best, method: "cp" | "20min", entry }], best being the activity's own 20 minutes.
export const ftpWindowDays = 180;
export const cpDurations = [180, 300, 600, 1200];
const bests = new WeakMap();

function effortsOf(entry) {
  if (!bests.has(entry)) {
    bests.set(entry, coverage(entry, "power") >= 0.5
      ? Object.fromEntries(cpDurations.map((duration) => [duration, bestAverage(entry, "power", duration)]))
      : {});
  }
  return bests.get(entry);
}

// Critical power from the best mean powers by duration: the work done grows by CP each second beyond a fixed reserve
// (W'), so a straight line through work against time has CP as its slope. It needs three durations up to at least
// 10 minutes, or the line says little; returns { cp, wPrime } or null.
export function criticalPower(byDuration) {
  const points = cpDurations.filter((duration) => byDuration[duration] > 0).map((duration) => ({ t: duration, work: byDuration[duration] * duration }));
  if (points.length < 3 || points.at(-1).t < 600) return null;
  const meanT = points.reduce((sum, point) => sum + point.t, 0) / points.length;
  const meanWork = points.reduce((sum, point) => sum + point.work, 0) / points.length;
  const slope = points.reduce((sum, point) => sum + (point.t - meanT) * (point.work - meanWork), 0)
    / points.reduce((sum, point) => sum + (point.t - meanT) ** 2, 0);
  const wPrime = meanWork - slope * meanT;
  // A reserve below zero or a slope above the 20 minutes means the efforts were not all-out; the model is no use then.
  if (!(slope > 0) || !(wPrime > 0) || (byDuration[1200] && slope > byDuration[1200])) return null;
  return { cp: slope, wPrime };
}

export function ftpTimeline(entries) {
  const bySport = {};
  const sorted = [...entries].sort((a, b) => a.startMs - b.startMs);
  const seen = {};
  for (const entry of sorted) {
    const own = effortsOf(entry);
    if (!cpDurations.some((duration) => own[duration] > 0)) continue;
    const kept = (seen[entry.sport] ??= []);
    kept.push(entry);
    const since = entry.startMs - ftpWindowDays * 86_400_000;
    const window = {};
    for (const other of kept) {
      if (other.startMs <= since) continue;
      for (const duration of cpDurations) {
        const value = effortsOf(other)[duration];
        if (value > (window[duration] ?? 0)) window[duration] = value;
      }
    }
    const model = criticalPower(window);
    const ftp = model ? model.cp : window[1200] ? window[1200] * 0.95 : null;
    if (!ftp) continue;
    (bySport[entry.sport] ??= []).push({ ms: entry.startMs, best: own[1200] ?? null, ftp: Math.round(ftp), method: model ? "cp" : "20min", entry });
  }
  return bySport;
}

// A new FTP to offer when one typed by hand is in force: the highest estimate since that record began, when it is
// at least 2 % above it, with the day of the activity that gave it. Returns { ftp, from, entry } or null.
export function ftpSuggestion(settings, sport, nowMs = Date.now()) {
  const timeZone = settings.timeZone ?? "UTC";
  const today = dayKey(nowMs, timeZone);
  const records = ftpRecords(settings.sports?.[sport]).filter((record) => record.ftp > 0 && (!record.from || record.from <= today));
  if (!records.length) return null;
  const current = records.reduce((latest, record) => ((record.from ?? "") >= (latest.from ?? "") ? record : latest));
  const later = (settings.estimatedFtp?.[sport] ?? []).filter((point) => !current.from || dayKey(point.ms, timeZone) > current.from);
  const best = later.reduce((top, point) => (!top || point.ftp > top.ftp ? point : top), null);
  return best && best.ftp >= current.ftp * 1.02 ? { ftp: best.ftp, from: dayKey(best.ms, timeZone), entry: best.entry } : null;
}

// The highest bound a zone may start at, as a fraction: heart rate zones within the maximum (or the whole reserve),
// power zones up to three times the FTP.
export const zoneLimits = { heartRate: 1, power: 3 };

// Zone bounds as typed: as many as the defaults, starting at 0, rising and within the limit, or else the defaults.
function validZones(bounds, fallback, limit) {
  return Array.isArray(bounds) && bounds.length === fallback.length && bounds[0] === 0
    && bounds.every((value, index) => !index || (value > bounds[index - 1] && value <= limit)) ? bounds : fallback;
}

// The activity's load: TSS from power when the sport's FTP is known and most of it has power, else from the heart rate.
// Returns { load, by: "power" | "heartRate", intensity } or null.
export function activityLoad(entry, allSettings) {
  const settings = forSport(allSettings, entry.sport, entry.startMs);
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

// The average daily load of the last 28 days, the load a plan expects until its rest.
const recentAverage = (history) => {
  const recent = history.slice(-28);
  return recent.length ? recent.reduce((sum, day) => sum + day.load, 0) / recent.length : 0;
};

// The days from after the history's last one up to the goal day, by a plan: the recent average load until
// restFrom, nothing from then on (restFrom null: rest throughout). Shaped as loadHistory's days, each projected.
export function goalForecast(history, goalKey, restFrom) {
  const last = history.at(-1);
  if (!last || !goalKey || goalKey <= last.day) return [];
  const average = recentAverage(history);
  let { fitness, fatigue } = last;
  const days = [];
  for (let day = addDays(last.day, 1); day <= goalKey; day = addDays(day, 1)) {
    const load = restFrom && day < restFrom ? average : 0;
    const form = fitness - fatigue;
    fitness += (load - fitness) / fitnessDays;
    fatigue += (load - fatigue) / fatigueDays;
    days.push({ day, load, fitness, fatigue, form, projected: true });
  }
  return days;
}

// A plan for a goal day (a race or an FTP test): training on at the average daily load of the last 28 days,
// then rest, the latest day the rest can start for the form on the goal's morning to be above the level.
// { restFrom: "YYYY-MM-DD" | null, form, days } — restFrom null when even resting from tomorrow is not enough,
// form the goal's morning form by that plan (or by resting from tomorrow), days until the goal; null for a goal
// not after the history's last day.
export function goalPlan(history, goalKey, level = 15) {
  const last = history.at(-1);
  if (!last || !goalKey || goalKey <= last.day) return null;
  const days = Math.round((Date.parse(`${goalKey}T12:00:00Z`) - Date.parse(`${last.day}T12:00:00Z`)) / 86_400_000);
  const average = recentAverage(history);
  // The days after the last one up to the one before the goal: its morning form comes from them.
  const formWith = (trainingDays) => {
    let { fitness, fatigue } = last;
    for (let day = 1; day < days; day += 1) {
      const load = day <= trainingDays ? average : 0;
      fitness += (load - fitness) / fitnessDays;
      fatigue += (load - fatigue) / fatigueDays;
    }
    return fitness - fatigue;
  };
  for (let trainingDays = days - 1; trainingDays >= 0; trainingDays -= 1) {
    const form = formWith(trainingDays);
    if (form > level) return { restFrom: addDays(last.day, trainingDays + 1), form, days };
  }
  return { restFrom: null, form: formWith(0), days };
}

// How many days of rest after the last day of the history until the form is above the level (fresh: +15):
// 1 when it already is for tomorrow, null when not within 60 days or without history.
export function freshInDays(history, level = 15) {
  const last = history.at(-1);
  if (!last) return null;
  let { fitness, fatigue } = last;
  for (let days = 1; days <= 60; days += 1) {
    if (fitness - fatigue > level) return days;
    fitness -= fitness / fitnessDays;
    fatigue -= fatigue / fatigueDays;
  }
  return null;
}

// The load chart in words: how fitness moved over the last week and four weeks, how fatigue sits against it,
// and what to do next. history: loadHistory's days, today last. Keys and numbers only, the wording is the UI's.
// { few: true } with under three weeks of history, too short for fitness to mean much.
export function formSummary(history) {
  if (history.length < 21) return { few: true };
  const last = history.at(-1);
  const weekAgo = history.at(-8);
  const monthAgo = history.at(-29) ?? history[0];
  const ramp = last.fitness - weekAgo.fitness;
  const trend = ramp > 5 ? "fast" : ramp >= 0.5 ? "rising" : ramp > -0.5 ? "flat" : "falling";
  const state = formState(last.form);
  // Overreaching for most of the last two weeks is worse than a single hard day.
  const longTired = history.slice(-14).filter((day) => day.form < -30).length >= 7;
  const advice = longTired || state === "overreaching" ? "ease" : trend === "fast" ? "hold" : state === "fresh" || trend === "flat" || trend === "falling" ? "add" : "keep";
  return { trend, state, longTired, advice, fitness: last.fitness, fitnessBefore: monthAgo.fitness, ramp, fatigue: last.fatigue, form: last.form };
}

// What the form says: fresh and ready, in balance, building fitness, or overreaching.
export function formState(form) {
  if (form > 15) return "fresh";
  if (form > -10) return "neutral";
  if (form > -30) return "productive";
  return "overreaching";
}

// Default zones as fractions of the maximum heart rate (or its reserve) or of the FTP; each zone runs from its bound up to the next one.
export const heartRateZones = [0, 0.6, 0.7, 0.8, 0.9];
export const powerZones = [0, 0.55, 0.75, 0.9, 1.05, 1.2];

// Seconds spent in each zone over the activities; by "heartRate" against the maximum, by "power" against each sport's FTP.
// Each sport counts against its own zones.
export function timeInZones(entries, by, allSettings) {
  const totals = (by === "power" ? powerZones : heartRateZones).map(() => 0);
  for (const entry of entries) {
    const settings = forSport(allSettings, entry.sport, entry.startMs);
    const bounds = by === "power" ? settings.powerZones : settings.heartRateZones;
    const reference = by === "power" ? settings.ftp : settings.maxHeartRate;
    if (!(reference > 0)) continue;
    const { seconds } = entry.records;
    const values = by === "heartRate" ? heartRateOf(entry) : entry.records[by] ?? [];
    const dts = steps(seconds);
    for (let index = 0; index < seconds.length; index += 1) {
      const value = values[index];
      if (!Number.isFinite(value) || (by === "heartRate" && value <= 0)) continue;
      const fraction = zoneFraction(value, by, settings);
      let zone = 0;
      while (zone + 1 < bounds.length && fraction >= bounds[zone + 1]) zone += 1;
      totals[zone] += dts[index];
    }
  }
  return totals;
}

// The workout's primary benefit, as Garmin names it, from its time in zones: by heart rate when the maximum is known
// and most of it has heart rate, as Garmin does, else by power; short anaerobic efforts still by power, which the
// heart rate lags behind. The hardest zone held long enough wins; a workout under 25 minutes
// that wins none is a recovery. Bounds fitted to Garmin's labels of 57 runs and rowing workouts, 44 of them matching.
// Returns { benefit, by } with benefit one of benefits, or null without zones to go by.
export const benefits = ["recovery", "base", "tempo", "threshold", "vo2max", "anaerobic", "sprint"];
// Garmin's groups of the benefits.
export const benefitGroup = { recovery: "lowAerobic", base: "lowAerobic", tempo: "highAerobic", threshold: "highAerobic", vo2max: "highAerobic", anaerobic: "anaerobic", sprint: "anaerobic" };

// The longest stretch in seconds the power stayed at or above the watts, a dip of up to two seconds not ending it.
function longestAbove(entry, watts) {
  const { seconds, power = [] } = entry.records;
  let longest = 0;
  let start = null;
  let lastAbove = null;
  for (let index = 0; index < seconds.length; index += 1) {
    if (!(power[index] >= watts)) continue;
    if (lastAbove == null || seconds[index] - lastAbove > 3) start = seconds[index];
    lastAbove = seconds[index];
    longest = Math.max(longest, lastAbove - start + 1);
  }
  return longest;
}

export function primaryBenefit(entry, allSettings) {
  const settings = forSport(allSettings, entry.sport, entry.startMs);
  const hasPower = settings.ftp > 0 && coverage(entry, "power") >= 0.5;
  const by = settings.maxHeartRate > 0 && coverage(entry, "heartRate") >= 0.5 ? "heartRate" : hasPower ? "power" : null;
  if (!by) return null;
  const zones = timeInZones([entry], by, allSettings);
  const total = zones.reduce((sum, value) => sum + value, 0);
  if (total < 300) return null;
  const from = (index) => zones.slice(index).reduce((sum, value) => sum + value, 0);
  // Power has six zones, the sixth anaerobic, heart rate five; the zone below the anaerobic one (or the top heart
  // rate zone) is VO2max, the one below it the threshold, then tempo.
  const top = zones.length - 1;
  const vo2max = by === "power" ? top - 1 : top;
  // Anaerobic efforts none longer than half a minute make a sprint workout.
  const powerZoneTimes = hasPower ? (by === "power" ? zones : timeInZones([entry], "power", allSettings)) : null;
  // They lose to a longer time in the VO2max zone itself, as the openers of a 20-minute FTP test do: Garmin
  // calls that VO2 Max with no anaerobic effect.
  const anaerobicSeconds = powerZoneTimes?.at(-1) ?? 0;
  const anaerobic = anaerobicSeconds >= 120 && anaerobicSeconds >= zones[vo2max]
    ? (longestAbove(entry, settings.ftp * settings.powerZones.at(-1)) <= 30 ? "sprint" : "anaerobic") : null;
  const benefit = anaerobic ?? (from(vo2max) >= 300 ? "vo2max"
    : from(vo2max - 1) >= Math.max(900, total * 0.45) ? "threshold"
    : from(vo2max - 2) >= Math.max(300, total * 0.5) ? "tempo"
    : total >= 1500 ? "base"
    : "recovery");
  return { benefit, by };
}

// Aerobic Training Effect (0–5) estimated from the activity's load: fitted to Garmin's values for the same
// workouts, where it rose with the logarithm of the load. Returns { value, level } with level one of teLevels, or null.
export const teLevels = ["none", "some", "maintaining", "improving", "highlyImproving", "overreaching"];

export function aerobicEffect(entry, allSettings) {
  // From the heart rate when most of the workout has one, as Garmin's own: a low FTP estimate would inflate a load from power.
  const settings = forSport(allSettings, entry.sport, entry.startMs);
  const fromHeartRate = settings.maxHeartRate > 0 && coverage(entry, "heartRate") >= 0.5 ? heartRateLoad(entry, settings) : null;
  const load = fromHeartRate ?? activityLoad(entry, allSettings)?.load;
  if (!(load > 0)) return null;
  const value = Math.round(Math.min(5, Math.max(0, 0.43 + 0.73 * Math.log(load))) * 10) / 10;
  return { value, level: teLevels[Math.min(5, Math.floor(value))] };
}

// The work done in kilojoules: the power summed over the time, or null without power.
export function workKilojoules(entry) {
  if (coverage(entry, "power") < 0.5) return null;
  const { seconds, power = [] } = entry.records;
  const dts = steps(seconds);
  let joules = 0;
  for (let index = 0; index < seconds.length; index += 1) if (isPower(power[index])) joules += power[index] * dts[index];
  return joules / 1000;
}

// Where a value falls against the sport's reference: a share of the FTP, of the maximum heart rate,
// or of the reserve between the resting and the maximum heart rate.
function zoneFraction(value, by, settings) {
  if (by === "power") return value / settings.ftp;
  if (settings.heartRateBasis === "reserve" && settings.maxHeartRate > settings.restHeartRate) {
    return (value - settings.restHeartRate) / (settings.maxHeartRate - settings.restHeartRate);
  }
  return value / settings.maxHeartRate;
}

// The beats a zone bound comes to, the inverse of zoneFraction for heart rate.
export function heartRateAt(fraction, settings) {
  if (!settings.maxHeartRate) return null;
  return settings.heartRateBasis === "reserve" && settings.maxHeartRate > settings.restHeartRate
    ? settings.restHeartRate + fraction * (settings.maxHeartRate - settings.restHeartRate)
    : fraction * settings.maxHeartRate;
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
  const { seconds } = entry.records;
  const heartRate = heartRateOf(entry);
  const field = coverage(entry, "power") >= 0.5 ? "power" : "speed";
  const output = entry.records[field] ?? [];
  if (coverage(entry, "heartRate") < 0.5) return null;
  const start = seconds[0] + warmUpSeconds;
  const end = seconds.at(-1);
  if (end - start < decouplingMinimum) return null;
  const middle = (start + end) / 2;
  const halves = [{ output: 0, heart: 0, time: 0 }, { output: 0, heart: 0, time: 0 }];
  const dts = steps(seconds);
  for (let index = 0; index < seconds.length; index += 1) {
    if (seconds[index] < start || !Number.isFinite(output[index]) || !(heartRate[index] > 0)) continue;
    const half = halves[seconds[index] < middle ? 0 : 1];
    half.output += output[index] * dts[index];
    half.heart += heartRate[index] * dts[index];
    half.time += dts[index];
  }
  if (!halves.every((half) => half.output > 0 && half.heart > 0)) return null;
  const [first, second] = halves.map((half) => half.output / half.heart);
  // The efficiency factor of the whole after the warm-up: watts, or metres a minute, per heartbeat a minute.
  const efficiency = ((halves[0].output + halves[1].output) / (halves[0].heart + halves[1].heart)) * (field === "speed" ? 60 : 1);
  // The averages after the warm-up, the output in watts or metres a minute, for the output at a set heart rate.
  const time = halves[0].time + halves[1].time;
  const heart = (halves[0].heart + halves[1].heart) / time;
  const average = ((halves[0].output + halves[1].output) / time) * (field === "speed" ? 60 : 1);
  return { percent: ((first - second) / first) * 100, by: field, efficiency, heart, output: average };
}

// The output at a set heart rate: the steady workouts whose average heart rate after the warm-up lies within
// 6 bpm of it, each one's average output scaled to that heart rate by its efficiency factor. The scaling holds
// over a few beats only, so workouts further off are left out rather than stretched.
export const heartRateWindow = 6;

export function outputAtHeartRate(result, bpm) {
  if (!result || !(result.heart > 0) || Math.abs(result.heart - bpm) > heartRateWindow) return null;
  return result.output * (bpm / result.heart);
}

// The reference heart rate on a 5 bpm step that takes the most workouts in; a tie goes to the lower one.
export function commonHeartRate(results) {
  const hearts = results.map((result) => result?.heart).filter((value) => value > 0);
  if (!hearts.length) return null;
  let best = null;
  for (let bpm = Math.floor(Math.min(...hearts) / 5) * 5; bpm <= Math.ceil(Math.max(...hearts) / 5) * 5; bpm += 5) {
    const count = hearts.filter((value) => Math.abs(value - bpm) <= heartRateWindow).length;
    if (!best || count > best.count) best = { bpm, count };
  }
  return best.bpm;
}

// A watch that lost the strap's contact reads the heart rate far too low until it is set right, which shows as a
// jump of over 30 bpm within 15 seconds. The readings before such a jump that lie more than 15 bpm under the
// level it reached are left out (null), back to where the heart rate last was near that level or to the start.
const dropoutJumpBpm = 30;
const dropoutJumpSeconds = 15;
const dropoutMargin = 15;

export function withoutHeartRateDropouts(records) {
  const { seconds = [], heartRate } = records ?? {};
  if (!heartRate?.length) return records;
  const values = heartRate.slice();
  let changed = false;
  let next = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (!(values[index] > 0)) continue;
    next = Math.max(next, index + 1);
    while (next < values.length && seconds[next] - seconds[index] <= dropoutJumpSeconds) next += 1;
    let peak = -1;
    for (let ahead = index + 1; ahead < next; ahead += 1) if (values[ahead] > 0 && (peak < 0 || values[ahead] > values[peak])) peak = ahead;
    if (peak < 0 || values[peak] - values[index] <= dropoutJumpBpm) continue;
    const level = values[peak] - dropoutMargin;
    // The rise itself, then the low readings before it.
    for (let ahead = index; ahead < peak; ahead += 1) {
      if (values[ahead] != null && values[ahead] < level) {
        values[ahead] = null;
        changed = true;
      }
    }
    for (let back = index - 1; back >= 0; back -= 1) {
      if (values[back] >= level) break;
      if (values[back] != null) {
        values[back] = null;
        changed = true;
      }
    }
    index = peak - 1;
  }
  return changed ? { ...records, heartRate: values } : records;
}

// The heart rate the loads, zones and averages count: without what a watch read too low. The charts and the saved
// activity keep it as recorded. Kept per recording, so each is cleaned once.
const cleanHeartRates = new WeakMap();

export function heartRateOf(entry) {
  const { records } = entry;
  if (!records?.heartRate) return [];
  if (!cleanHeartRates.has(records)) cleanHeartRates.set(records, withoutHeartRateDropouts(records).heartRate);
  return cleanHeartRates.get(records);
}

// The activity as the analysis reads it: its average heart rate over the clean readings, the records as recorded.
export function withCleanHeartRate(entry) {
  if (!entry.records?.heartRate || !entry.summary) return entry;
  const values = heartRateOf(entry);
  if (values === entry.records.heartRate) return entry;
  const dts = steps(entry.records.seconds);
  let sum = 0;
  let time = 0;
  values.forEach((value, index) => {
    if (value > 0) {
      sum += value * dts[index];
      time += dts[index];
    }
  });
  return time ? { ...entry, summary: { ...entry.summary, avgHeartRate: Math.round(sum / time) } } : entry;
}

// Each lap's average heart rate over the clean readings (the records' seconds counted from the activity's start),
// the lap's own when there are no records or no clean reading in it.
export function lapHeartRates(entry) {
  const laps = entry.laps ?? [];
  if (!entry.records?.heartRate) return laps.map((lap) => lap.avgHeartRate ?? null);
  const values = heartRateOf(entry);
  const { seconds } = entry.records;
  const dts = steps(seconds);
  return laps.map((lap) => {
    const from = (lap.startMs - entry.startMs) / 1000;
    const to = (lap.endMs - entry.startMs) / 1000;
    let sum = 0;
    let time = 0;
    seconds.forEach((second, index) => {
      if (second > from && second <= to && values[index] > 0) {
        sum += values[index] * dts[index];
        time += dts[index];
      }
    });
    return time ? Math.round(sum / time) : lap.avgHeartRate ?? null;
  });
}

// The load of the activities split by the primary benefit's group, with how many activities each benefit had:
// { load: { lowAerobic, highAerobic, anaerobic }, total, counts: { benefit: n } }. Activities without a benefit
// are left out.
export const benefitGroups = ["lowAerobic", "highAerobic", "anaerobic"];

export function trainingFocus(entries, allSettings) {
  const load = Object.fromEntries(benefitGroups.map((group) => [group, 0]));
  const counts = {};
  for (const entry of entries) {
    const benefit = primaryBenefit(entry, allSettings);
    if (!benefit) continue;
    counts[benefit.benefit] = (counts[benefit.benefit] ?? 0) + 1;
    load[benefitGroup[benefit.benefit]] += activityLoad(entry, allSettings)?.load ?? 0;
  }
  const total = benefitGroups.reduce((sum, group) => sum + load[group], 0);
  return { load, total, counts };
}

// The share of the load each group should have, in percent, after the 80/20 split proven for endurance training:
// most of it easy, some around the threshold, little anaerobic. Garmin's own ranges follow the fitness and the
// four weeks' load and are not published.
export const focusTargets = { lowAerobic: [60, 80], highAerobic: [15, 30], anaerobic: [0, 10] };

// The group furthest out of its range and which way, as { group, side: "low" | "high" }, or null when all are in.
export function focusAdvice(focus) {
  if (!focus.total) return null;
  let worst = null;
  for (const group of benefitGroups) {
    const share = (focus.load[group] / focus.total) * 100;
    const [low, high] = focusTargets[group];
    const off = share < low ? low - share : share > high ? share - high : 0;
    if (off > (worst?.off ?? 0)) worst = { group, side: share < low ? "low" : "high", off };
  }
  return worst && { group: worst.group, side: worst.side };
}
