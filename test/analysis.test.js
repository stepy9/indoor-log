import assert from "node:assert/strict";
import test from "node:test";
import { bestAverage, bestTime, downsample, inLengthRange, invertedMetric, paceFrom, series, workoutKind } from "../src/analysis.js";

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
  assert.ok(!inLengthRange(activity(20, 4, "cycling"), "distance:1"));
  assert.ok(inLengthRange(activity(90, 30, "cycling"), "distance:1"));
  assert.ok(inLengthRange(activity(90, 20), "all"));
});
