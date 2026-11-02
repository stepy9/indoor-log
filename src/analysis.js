import { detectIntervals } from "./core.js";
import { dayKey, periodRange } from "./diary.js";

// Comparing saved activities: series for the overlay chart and best efforts, from library entries.

// Below this speed the athlete has stopped and a pace would run off to infinity.
const stoppedSpeed = 0.3;

export const metrics = ["power", "heartRate", "cadence", "pace"];

// Rowing pace per 500 m and running per km, both in seconds; cycling shows km/h instead.
export function paceFrom(speed, sport) {
  if (!(speed > stoppedSpeed)) return null;
  if (sport === "cycling") return speed * 3.6;
  return (sport === "rowing" ? 500 : 1000) / speed;
}

// Lower pace is faster, so its axis runs upside down; cycling speed does not.
export const invertedMetric = (metric, sport) => metric === "pace" && sport !== "cycling";

function rawValues(entry, metric) {
  const { records } = entry;
  if (metric !== "pace") return records[metric] ?? [];
  return records.speed.map((speed) => paceFrom(speed, entry.sport));
}

// Mean over the trailing window of smoothSeconds, ignoring gaps; points without a value stay out.
export function series(entry, metric, { axis = "distance", smoothSeconds = 0 } = {}) {
  const { seconds, distance } = entry.records;
  const values = rawValues(entry, metric);
  const points = [];
  let from = 0;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    if (Number.isFinite(values[index])) {
      sum += values[index];
      count += 1;
    }
    while (seconds[index] - seconds[from] > smoothSeconds) {
      if (Number.isFinite(values[from])) {
        sum -= values[from];
        count -= 1;
      }
      from += 1;
    }
    const x = axis === "distance" ? distance[index] : seconds[index];
    if (count && Number.isFinite(values[index]) && Number.isFinite(x)) points.push({ x, y: sum / count });
  }
  return points;
}

// Keeps at most limit points, taking the extremes of each bucket so peaks survive.
export function downsample(points, limit = 900) {
  if (points.length <= limit) return points;
  const size = points.length / (limit / 2);
  const kept = [];
  for (let start = 0; start < points.length; start += size) {
    const bucket = points.slice(Math.floor(start), Math.floor(start + size));
    if (!bucket.length) continue;
    let low = bucket[0];
    let high = bucket[0];
    for (const point of bucket) {
      if (point.y < low.y) low = point;
      if (point.y > high.y) high = point;
    }
    if (low === high) kept.push(low);
    else kept.push(...(low.x <= high.x ? [low, high] : [high, low]));
  }
  return kept;
}

// Highest mean of a field held for the given number of seconds, or null when the activity is shorter.
export function bestAverage(entry, field, durationSeconds) {
  const { seconds } = entry.records;
  const values = entry.records[field] ?? [];
  if (!seconds.length || seconds.at(-1) < durationSeconds) return null;
  let best = null;
  let from = 0;
  let sum = 0;
  let count = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    if (Number.isFinite(values[index])) {
      sum += values[index];
      count += 1;
    }
    // Each sample stands for the second leading up to it, so the window holds the samples after its start.
    while (seconds[from] <= seconds[index] - durationSeconds) {
      if (Number.isFinite(values[from])) {
        sum -= values[from];
        count -= 1;
      }
      from += 1;
    }
    if (count && seconds[index] - seconds[0] >= durationSeconds) best = Math.max(best ?? -Infinity, sum / count);
  }
  return best == null ? null : Math.round(best);
}

// Fastest time to cover the given distance, in seconds, or null when the activity is shorter.
export function bestTime(entry, meters) {
  const { seconds, distance } = entry.records;
  let best = null;
  let from = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    if (!Number.isFinite(distance[index])) continue;
    while (from < index && (!Number.isFinite(distance[from + 1]) || distance[index] - distance[from + 1] >= meters)) from += 1;
    if (Number.isFinite(distance[from]) && distance[index] - distance[from] >= meters) {
      const covered = distance[index] - distance[from];
      // Scales the window down to exactly the distance asked for.
      const time = (seconds[index] - seconds[from]) * meters / covered;
      if (best == null || time < best) best = time;
    }
  }
  return best;
}

// Best efforts to look for; the comparison shows only those at least one activity is long enough for.
export const powerDurations = [60, 300, 1200, 1800, 3600];
export const effortDistances = {
  rowing: [500, 1000, 2000, 5000, 10000, 20000, 30000],
  running: [1000, 5000, 10000, 21097.5, 42195],
  cycling: [5000, 10000, 20000, 40000, 50000, 100000],
};

// Interval or steady: a hand-picked kind wins, then rest laps saved with the activity, then the shape of the data.
const kinds = new WeakMap();
// A rest counts when it is at least this much easier than the work on either side of it.
const restContrast = 0.8;

// Easy stretches between two harder ones that drop clearly below them; warm-up and cool-down do not count.
function clearRests(entry) {
  const { seconds } = entry.records;
  const records = seconds.map((second, index) => ({
    timeMs: second * 1000, power: entry.records.power[index], cadence: entry.records.cadence[index], speed: entry.records.speed[index],
  }));
  const { field, segments } = detectIntervals(records);
  const means = segments.map((segment, index) => {
    const until = segments[index + 1]?.startMs ?? Infinity;
    return average(finiteValues(records.filter((record) => record.timeMs >= segment.startMs && record.timeMs < until).map((record) => record[field])));
  });
  return segments.filter((segment, index) => segment.intensity === "recovery"
    && means[index] != null && means[index - 1] && means[index + 1]
    && means[index] <= restContrast * (means[index - 1] + means[index + 1]) / 2).length;
}

const finiteValues = (list) => list.filter(Number.isFinite);
const average = (list) => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null);

// Kinds a workout can have; the data only tells intervals from steady, the rest are picked by hand.
export const workoutKinds = ["steady", "intervals", "tempo", "race", "recovery"];

export const workoutKind = (entry) => entry.kind || detectedKind(entry);

// The kind the data and laps give, ignoring any hand-picked one.
export function detectedKind(entry) {
  if (!kinds.has(entry)) {
    const restLaps = entry.laps.filter((lap) => lap.intensity === "recovery" || lap.intensity === "rest").length;
    // Interval laps, even when every one is work, as in a stroke-rate fartlek; older entries show them by their targets.
    const intervalLaps = entry.intervalLaps || entry.laps.filter((lap) => lap.target != null).length >= 2;
    kinds.set(entry, intervalLaps || restLaps >= 2 || clearRests(entry) >= 2 ? "intervals" : "steady");
  }
  return kinds.get(entry);
}

// Length filters by moving time in minutes or by distance in km, which depends on the sport.
export const lengthRanges = {
  time: [[0, 15], [15, 30], [30, 60], [60, Infinity]],
  distance: {
    rowing: [[0, 2], [2, 5], [5, 10], [10, Infinity]],
    running: [[0, 5], [5, 10], [10, 21.1], [21.1, Infinity]],
    cycling: [[0, 20], [20, 40], [40, 80], [80, Infinity]],
  },
};

export const rangesFor = (by, sport) => (by === "time" ? lengthRanges.time : lengthRanges.distance[sport] ?? lengthRanges.distance.rowing);

// The filter reads "time:1" or "distance:0", the range's place in its list; anything else lets every activity through.
// Neighbouring ranges overlap by 100 m or half a minute, so a 1.98 km test counts as both "under 2 km" and "2–5 km".
const rangeTolerance = { time: 0.5, distance: 0.1 };

export function inLengthRange(entry, filter) {
  const [by, index] = String(filter).split(":");
  const range = by === "time" || by === "distance" ? rangesFor(by, entry.sport)[Number(index)] : null;
  if (!range) return true;
  const amount = by === "time" ? entry.summary.timerSeconds / 60 : entry.summary.distance / 1000;
  const tolerance = rangeTolerance[by];
  return amount >= range[0] - tolerance && amount < range[1] + tolerance;
}

// One number per activity for the trend over time.
export const trendMetrics = ["avgPower", "pace", "avgHeartRate", "efficiency", "bestShort", "bestLong", "bestPower"];

// The short and long best-effort distances the trend follows: 500 m and 2 km for rowing.
export const trendDistances = (sport) => {
  const distances = effortDistances[sport] ?? effortDistances.rowing;
  return { short: distances[0], long: distances[2] };
};

export function trendValue(entry, metric) {
  const { summary, sport } = entry;
  switch (metric) {
    case "avgPower": return summary.avgPower ?? null;
    case "avgHeartRate": return summary.avgHeartRate ?? null;
    case "pace": return summary.timerSeconds > 0 ? paceFrom(summary.distance / summary.timerSeconds, sport) : null;
    // Watts per heartbeat: more power for the same heart rate means better fitness.
    case "efficiency": return summary.avgPower && summary.avgHeartRate ? summary.avgPower / summary.avgHeartRate : null;
    case "bestShort": return bestTime(entry, trendDistances(sport).short);
    case "bestLong": return bestTime(entry, trendDistances(sport).long);
    case "bestPower": return bestAverage(entry, "power", 300);
    default: return null;
  }
}

// Times and paces improve downwards, except cycling, whose pace is a speed.
export const trendIsTime = (metric, sport) => metric === "bestShort" || metric === "bestLong" || (metric === "pace" && sport !== "cycling");

// The part of an activity between from and to on the axis, with its own summary, for a zoomed chart.
export function sliceEntry(entry, axis, from, to) {
  const { records } = entry;
  const key = axis === "distance" ? records.distance : records.seconds;
  const kept = key.map((value, index) => (Number.isFinite(value) && value >= from && value <= to ? index : -1)).filter((index) => index >= 0);
  const pick = (column) => kept.map((index) => column[index]);
  const sliced = Object.fromEntries(Object.entries(records).map(([field, column]) => [field, pick(column)]));
  if (kept.length < 2) return { ...entry, records: sliced, laps: [], summary: {} };
  const values = (field) => sliced[field].filter(Number.isFinite);
  const mean = (field) => (values(field).length ? Math.round(values(field).reduce((sum, value) => sum + value, 0) / values(field).length) : null);
  const highest = (field) => (values(field).length ? Math.max(...values(field)) : null);
  const timerSeconds = sliced.seconds.at(-1) - sliced.seconds[0];
  const distance = Math.max(0, (values("distance").at(-1) ?? 0) - (values("distance")[0] ?? 0));
  return {
    ...entry,
    records: sliced,
    laps: [],
    summary: {
      timerSeconds,
      distance,
      avgPower: mean("power"), maxPower: highest("power"),
      avgHeartRate: mean("heartRate"), maxHeartRate: highest("heartRate"),
      avgCadence: mean("cadence"), maxCadence: highest("cadence"),
      avgSpeed: timerSeconds > 0 ? distance / timerSeconds : null,
      // Calories go by the share of the moving time.
      calories: entry.summary.calories && entry.summary.timerSeconds > 0 ? Math.round(entry.summary.calories * timerSeconds / entry.summary.timerSeconds) : null,
    },
  };
}

// A lap's value for the metric the comparison shows.
export function lapValue(lap, metric, sport) {
  if (metric === "power") return lap.avgPower ?? null;
  if (metric === "heartRate") return lap.avgHeartRate ?? null;
  if (metric === "cadence") return lap.avgCadence ?? null;
  const speed = lap.avgSpeed ?? (lap.timerSeconds > 0 && lap.distance != null ? lap.distance / lap.timerSeconds : null);
  return paceFrom(speed, sport);
}

// The laps rowed on each resistance level put together: the metric over them all, weighted by time
// (pace and speed from their distance and time), and the time spent on the level.
// A lap without its own resistance is on the activity's.
export function levelValues(entry, metric, sport) {
  const groups = new Map();
  for (const lap of entry.laps ?? []) {
    const level = lap.resistance ?? entry.resistance;
    const seconds = lap.timerSeconds ?? 0;
    if (!level || !(seconds > 0)) continue;
    const group = groups.get(level) ?? { seconds: 0, distance: 0, weighted: 0, weight: 0 };
    group.seconds += seconds;
    group.distance += lap.distance ?? 0;
    const value = lapValue(lap, metric, sport);
    if (value != null) {
      group.weighted += value * seconds;
      group.weight += seconds;
    }
    groups.set(level, group);
  }
  const byDistance = !["power", "heartRate", "cadence"].includes(metric);
  return new Map([...groups].map(([level, group]) => [level, {
    seconds: group.seconds,
    value: byDistance
      ? (group.distance > 0 ? lapValue({ distance: group.distance, timerSeconds: group.seconds }, metric, sport) : null)
      : (group.weight > 0 ? group.weighted / group.weight : null),
  }]));
}

// Which way the trend improves: up, down for times and paces other than cycling's speed, or neither for heart rate.
export const trendDirection = (metric, sport) => (metric === "avgHeartRate" ? 0 : trendIsTime(metric, sport) ? -1 : 1);

// Best efforts take the period's best; averages weigh each activity by its moving time, and a pace comes from the totals.
const bestMetrics = new Set(["bestShort", "bestLong", "bestPower"]);

// The trend's points put together by week or month, each at its period's first day, with the activities in it.
export function groupTrend(points, period, metric, sport, timeZone) {
  const groups = new Map();
  for (const point of points) {
    const [from] = periodRange(period, dayKey(point.x, timeZone));
    if (!groups.has(from)) groups.set(from, []);
    groups.get(from).push(point);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([from, list]) => {
    const entries = list.map((point) => point.entry);
    let y;
    if (bestMetrics.has(metric)) {
      const values = list.map((point) => point.y);
      y = trendDirection(metric, sport) < 0 ? Math.min(...values) : Math.max(...values);
    } else if (metric === "pace") {
      const seconds = entries.reduce((sum, entry) => sum + (entry.summary.timerSeconds ?? 0), 0);
      const distance = entries.reduce((sum, entry) => sum + (entry.summary.distance ?? 0), 0);
      y = seconds > 0 ? paceFrom(distance / seconds, sport) : null;
    } else {
      const weights = list.map((point) => point.entry.summary.timerSeconds || 1);
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      y = list.reduce((sum, point, index) => sum + point.y * weights[index], 0) / total;
    }
    return { x: Date.parse(`${from}T12:00:00Z`), y, from, entries };
  }).filter((group) => Number.isFinite(group.y));
}

// The mean of each value with the ones before it, as many as the window holds.
export function movingAverage(values, size) {
  return values.map((_, index) => {
    const window = values.slice(Math.max(0, index + 1 - size), index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
}

// The values that beat every one before them; the first sets the mark but is no record yet.
export function recordFlags(values, direction) {
  let best = null;
  return values.map((value) => {
    const record = best != null && direction !== 0 && (direction > 0 ? value > best : value < best);
    if (best == null || record) best = value;
    return record;
  });
}
