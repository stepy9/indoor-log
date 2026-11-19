import assert from "node:assert/strict";
import test from "node:test";
import { sameWorkoutHistory } from "../src/same-workout.js";

const day = (n) => Date.parse("2026-11-01T18:00:00Z") + n * 86_400_000;
const ride = (id, n, name, power, heartRate, sport = "rowing") => ({ id, sport, name, startMs: day(n), summary: { avgPower: power, avgHeartRate: heartRate, timerSeconds: 1800 } });

test("sameWorkoutHistory lists the earlier times of the same workout, newest first", () => {
  const entries = [
    ride("a", 1, "Lake Bled", 100, 140), ride("b", 5, " lake bled ", 105, 140), ride("c", 7, "Other", 120, 150),
    ride("d", 8, "Lake Bled", 110, 138, "cycling"), ride("e", 9, "Lake Bled", 110, 135), ride("f", 12, "Lake Bled", 115, 135),
  ];
  const { current, earlier } = sameWorkoutHistory(entries[4], entries);
  assert.equal(current.entry.id, "e");
  assert.deepEqual(earlier.map((item) => item.entry.id), ["b", "a"]);
  assert.deepEqual([earlier[0].change.power, earlier[0].change.heartRate], [5, -5]);
  // 110/135 against 105/140: about 8.6 % more power per beat.
  assert.ok(Math.abs(earlier[0].change.efficiency - ((110 / 135 - 105 / 140) / (105 / 140)) * 100) < 1e-9);
});

test("sameWorkoutHistory keeps the times without power or heart rate, without their change", () => {
  const entries = [ride("a", 1, "X", null, 140), ride("b", 2, "X", 100, 130)];
  const { earlier } = sameWorkoutHistory(entries[1], entries);
  assert.equal(earlier[0].power, null);
  assert.equal(earlier[0].change.power, null);
  assert.equal(earlier[0].change.heartRate, -10);
  assert.equal(earlier[0].change.efficiency, null);
});

test("sameWorkoutHistory finds the same intervals under another name, and stops at the limit", () => {
  const laps = (start) => [0, 300, 600, 900].map((offset, index) => ({ startMs: start + offset * 1000, intensity: index % 2 ? "rest" : "active" }));
  const withLaps = (id, n, name) => ({ ...ride(id, n, name, 100, 140), laps: laps(day(n)), records: { seconds: [0, 1200] } });
  const entries = [withLaps("a", 1, "Intervals 4×5"), withLaps("b", 2, "My intervals")];
  assert.equal(sameWorkoutHistory(entries[1], entries).earlier.length, 1);
  const many = Array.from({ length: 12 }, (_, index) => ride(String(index), index, "Y", 100, 140));
  assert.equal(sameWorkoutHistory(many[11], many, 8).earlier.length, 8);
});
