import assert from "node:assert/strict";
import test from "node:test";
import { bestAverage, bestTime, downsample, inLengthRange, invertedMetric, paceFrom, series, trendIsTime, trendValue, workoutKind } from "../src/analysis.js";

// Ten minutes at 1 Hz: 4 m/s with 200 W, except a minute at 5 m/s and 300 W from 5:00.
function entry(sport = "rowing") {
  const seconds = Array.from({ length: 601 }, (_, index) => index);
  const fast = (second) => second > 300 && second <= 360;
  const speed = seconds.map((second) => (fast(second) ? 5 : 4));
  const distance = seconds.reduce((list, second, index) => [...list, index ? list[index - 1] + speed[index] : 0], []);
  return {
    sport,
    records: {
      seconds, distance, speed,
      power: seconds.map((second) => (fast(second) ? 300 : 200)),
      heartRate: seconds.map(() => 150),
      cadence: seconds.map(() => null),
    },
  };
}

test("paces rowing per 500 m, running per km and cycling as km/h", () => {
  assert.equal(paceFrom(4, "rowing"), 125);
  assert.equal(paceFrom(4, "running"), 250);
  assert.equal(paceFrom(10, "cycling"), 36);
  assert.equal(paceFrom(0.1, "rowing"), null);
  assert.ok(invertedMetric("pace", "rowing"));
  assert.ok(!invertedMetric("pace", "cycling"));
});

test("series follows the chosen axis, smooths over the window and leaves out missing values", () => {
  const byDistance = series(entry(), "power", { axis: "distance" });
  assert.equal(byDistance.length, 601);
  assert.equal(byDistance.at(-1).x, entry().records.distance.at(-1));
  const smoothed = series(entry(), "power", { axis: "time", smoothSeconds: 10 });
  assert.equal(smoothed[305].y, (5 * 300 + 6 * 200) / 11);
  assert.equal(series(entry(), "cadence").length, 0);
});

test("downsample keeps peaks and order", () => {
  const points = Array.from({ length: 5000 }, (_, x) => ({ x, y: x === 2500 ? 99 : 0 }));
  const kept = downsample(points, 200);
  assert.ok(kept.length <= 202);
  assert.ok(kept.some((point) => point.y === 99));
  assert.ok(kept.every((point, index) => !index || point.x > kept[index - 1].x));
});

test("best efforts find the fast minute and stay empty when the activity is too short", () => {
  assert.equal(bestAverage(entry(), "power", 60), 300);
  assert.equal(bestAverage(entry(), "power", 1200), null);
  assert.equal(bestTime(entry(), 300), 60);
  assert.equal(bestTime(entry(), 100000), null);
});

test("tells interval workouts from steady ones, and a hand-picked kind wins", () => {
  const steady = { ...entry(), laps: [] };
  steady.records = { ...steady.records, power: steady.records.seconds.map(() => 200) };
  assert.equal(workoutKind(steady), "steady");
  const intervals = { ...entry(), laps: [] };
  intervals.records = { ...intervals.records, power: intervals.records.seconds.map((second) => (Math.floor(second / 60) % 2 ? 300 : 120)) };
  assert.equal(workoutKind(intervals), "intervals");
  assert.equal(workoutKind({ ...intervals, kind: "steady" }), "steady");
});

test("sorts activities into time and sport-specific distance ranges", () => {
  const activity = (minutes, km, sport = "rowing") => ({ sport, summary: { timerSeconds: minutes * 60, distance: km * 1000 } });
  assert.ok(inLengthRange(activity(10, 2), "time:0"));
  assert.ok(inLengthRange(activity(20, 4), "time:1"));
  assert.ok(!inLengthRange(activity(20, 4), "time:2"));
  assert.ok(inLengthRange(activity(90, 20), "time:3"));
  assert.ok(inLengthRange(activity(20, 4), "distance:1"));
  // A 1.98 km test sits in both neighbouring ranges, 2.2 km only in the upper one.
  assert.ok(inLengthRange(activity(8, 1.98), "distance:0") && inLengthRange(activity(8, 1.98), "distance:1"));
  assert.ok(!inLengthRange(activity(9, 2.2), "distance:0"));
  assert.ok(!inLengthRange(activity(20, 4, "cycling"), "distance:1"));
  assert.ok(inLengthRange(activity(90, 30, "cycling"), "distance:1"));
  assert.ok(inLengthRange(activity(90, 20), "all"));
});

test("trend values give one number per activity, with times improving downwards", () => {
  const activity = { ...entry(), laps: [], summary: { timerSeconds: 600, distance: 2460, avgPower: 210, avgHeartRate: 150 } };
  assert.equal(trendValue(activity, "avgPower"), 210);
  assert.equal(trendValue(activity, "efficiency"), 1.4);
  assert.equal(trendValue(activity, "powerPerKg", 70), 3);
  assert.equal(trendValue(activity, "powerPerKg"), null);
  assert.equal(Math.round(trendValue(activity, "pace")), 122);
  assert.equal(trendValue(activity, "bestShort"), 110);
  assert.equal(trendValue(activity, "bestLong"), 485);
  assert.equal(trendValue(activity, "bestPower"), 220);
  assert.ok(trendIsTime("bestShort", "rowing"));
  assert.ok(!trendIsTime("pace", "cycling"));
});

test("a slice of an activity has its own summary and best efforts", async () => {
  const { sliceEntry } = await import("../src/analysis.js");
  const activity = { ...entry(), laps: [], summary: { timerSeconds: 600, distance: 2460, calories: 60 } };
  const fast = sliceEntry(activity, "time", 300, 360);
  assert.equal(fast.summary.timerSeconds, 60);
  assert.equal(fast.summary.avgPower, 298);
  assert.equal(fast.summary.calories, 6);
  assert.equal(bestTime(fast, 250), 50);
  assert.equal(sliceEntry(activity, "distance", 99999, 100000).records.seconds.length, 0);
});

test("a lap gives its value for each compared metric", async () => {
  const { lapValue } = await import("../src/analysis.js");
  const lap = { avgPower: 150, avgHeartRate: 140, avgCadence: 24, distance: 500, timerSeconds: 120 };
  assert.equal(lapValue(lap, "power", "rowing"), 150);
  assert.equal(Math.round(lapValue(lap, "pace", "rowing")), 120);
  assert.equal(lapValue({ ...lap, avgSpeed: 5 }, "pace", "rowing"), 100);
});

test("laps on the same resistance are put together, weighted by their time", async () => {
  const { levelValues } = await import("../src/analysis.js");
  const entry = { resistance: 6, laps: [
    { resistance: 11, timerSeconds: 60, distance: 250, avgPower: 100 },
    { resistance: 12, timerSeconds: 30, distance: 150, avgPower: 150 },
    { resistance: 11, timerSeconds: 120, distance: 500, avgPower: 130 },
    { timerSeconds: 30, distance: 100, avgPower: 80 },
  ] };
  const power = levelValues(entry, "power", "rowing");
  assert.deepEqual([...power.keys()], [11, 12, 6]);
  assert.deepEqual(power.get(11), { seconds: 180, value: 120 });
  assert.equal(power.get(6).value, 80);
  const pace = levelValues(entry, "pace", "rowing");
  // 750 m in 180 s is 120 s per 500 m.
  assert.equal(Math.round(pace.get(11).value), 120);
});

test("the trend puts activities together by week, keeps the best effort and the best value", async () => {
  const { groupTrend, movingAverage, recordFlags } = await import("../src/analysis.js");
  const at = (day, y, seconds = 600) => ({ x: Date.parse(`${day}T08:00:00Z`), y, entry: { summary: { timerSeconds: seconds, distance: seconds * 4 } } });
  // Monday and Wednesday of one week, then the Monday after.
  const points = [at("2026-10-26", 100, 600), at("2026-10-28", 200, 1800), at("2026-11-02", 150)];
  const weeks = groupTrend(points, "week", "avgPower", "rowing", "UTC");
  assert.deepEqual(weeks.map((week) => [week.from, week.y, week.entries.length]), [["2026-10-26", 175, 2], ["2026-11-02", 150, 1]]);
  const best = groupTrend(points, "week", "bestShort", "rowing", "UTC");
  assert.equal(best[0].y, 100);
  assert.deepEqual(movingAverage([1, 2, 3, 4], 3), [1, 1.5, 2, 3]);
  assert.deepEqual(recordFlags([5, 4, 7, 6, 7], 1), [false, false, true, false, false]);
  assert.deepEqual(recordFlags([120, 118, 121], -1), [false, true, false]);
  assert.deepEqual(recordFlags([120], -1), [false]);
  assert.deepEqual(recordFlags([140, 150], 0), [false, false]);
});
