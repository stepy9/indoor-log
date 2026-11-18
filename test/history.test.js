import assert from "node:assert/strict";
import test from "node:test";
import { changeDay, fromGoalHistory, mergeHistory, mondayOf, setValue, start, valueOn } from "../src/history.js";
import { activityLoad, forSport } from "../src/fitness.js";
import { mergeSettings } from "../src/sync.js";

test("valueOn gives the value in force on the day, the fallback without a history", () => {
  const history = [{ from: start, value: 180 }, { from: "2026-11-10", value: 190 }];
  assert.equal(valueOn(history, "2026-11-09"), 180);
  assert.equal(valueOn(history, "2026-11-10"), 190);
  assert.equal(valueOn(history, "2027-01-01"), 190);
  assert.equal(valueOn(undefined, "2026-11-10", 175), 175);
  assert.equal(valueOn([{ from: null, value: 170 }], "2020-01-01"), 170);
});

test("the first change keeps the value before it for the whole past", () => {
  const history = setValue(undefined, 180, 190, "2026-11-18", 5);
  assert.deepEqual(history, [{ from: start, value: 180, at: 5 }, { from: "2026-11-18", value: 190, at: 5 }]);
  const again = setValue(history, 190, 195, "2026-11-18", 6);
  assert.deepEqual(again.map((record) => record.value), [180, 195]);
  // Setting back the value that held before the day leaves the day without a record.
  assert.deepEqual(setValue(again, 195, 180, "2026-11-18", 7).map((record) => record.value), [180]);
});

test("a weekly setting holds from the week's Monday, the rest from the day", () => {
  assert.equal(mondayOf("2026-11-18"), "2026-11-16");
  assert.equal(mondayOf("2026-11-16"), "2026-11-16");
  assert.equal(changeDay("weeklyHours", "2026-11-22"), "2026-11-16");
  assert.equal(changeDay("maxHeartRate", "2026-11-22"), "2026-11-22");
});

test("the weekly goals' earlier history becomes one history per goal", () => {
  const old = [{ from: start, weeklyHours: 3, weeklyKm: null }, { from: "2026-11-16", weeklyHours: 4, weeklyKm: 50 }];
  assert.deepEqual(fromGoalHistory(old, "weeklyHours").map((record) => [record.from, record.value]), [[start, 3], ["2026-11-16", 4]]);
  assert.equal(valueOn(fromGoalHistory(old, "weeklyKm"), "2026-11-09"), null);
});

test("mergeHistory joins two devices' days, the later written winning a day both changed", () => {
  const here = [{ from: start, value: 180, at: 1 }, { from: "2026-11-10", value: 185, at: 10 }];
  const there = [{ from: start, value: 180, at: 2 }, { from: "2026-11-10", value: 190, at: 20 }, { from: "2026-11-15", value: 195, at: 30 }];
  assert.deepEqual(mergeHistory(here, there).map((record) => [record.from, record.value]), [[start, 180], ["2026-11-10", 190], ["2026-11-15", 195]]);
  assert.deepEqual(mergeHistory(there, here), mergeHistory(here, there));
});

test("forSport takes the heart rate and zones in force on the activity's day", () => {
  const settings = {
    timeZone: "UTC", restHeartRate: 50, defaultRestHeartRate: 60, maxHeartRate: 190, typedMaxHeartRate: 190,
    history: { maxHeartRate: [{ from: start, value: 180 }, { from: "2026-11-10", value: 190 }], restHeartRate: [{ from: start, value: null }, { from: "2026-11-12", value: 50 }] },
    sports: { rowing: { typedMaxHeartRate: null, maxHeartRate: 190, heartRateBasis: "reserve", history: { heartRateBasis: [{ from: start, value: null }, { from: "2026-11-12", value: "reserve" }] } } },
  };
  const before = forSport(settings, "rowing", Date.parse("2026-11-05T08:00:00Z"));
  assert.deepEqual([before.maxHeartRate, before.restHeartRate, before.heartRateBasis], [180, 60, "max"]);
  const after = forSport(settings, "rowing", Date.parse("2026-11-15T08:00:00Z"));
  assert.deepEqual([after.maxHeartRate, after.restHeartRate, after.heartRateBasis], [190, 50, "reserve"]);
  // A sport's own maximum typed later does not reach back either.
  settings.sports.rowing.history.maxHeartRate = [{ from: start, value: null }, { from: "2026-11-14", value: 200 }];
  assert.equal(forSport(settings, "rowing", Date.parse("2026-11-13T08:00:00Z")).maxHeartRate, 190);
  assert.equal(forSport(settings, "rowing", Date.parse("2026-11-14T08:00:00Z")).maxHeartRate, 200);
});

test("an older activity's load stays as it was when the maximum heart rate changes", () => {
  const seconds = Array.from({ length: 1801 }, (_, index) => index);
  const entry = { sport: "rowing", startMs: Date.parse("2026-11-05T08:00:00Z"), records: { seconds, heartRate: seconds.map(() => 150) }, summary: { timerSeconds: 1800 } };
  const base = { timeZone: "UTC", restHeartRate: 60, maxHeartRate: 180, typedMaxHeartRate: 180, sports: { rowing: { typedMaxHeartRate: null } } };
  const changed = { ...base, maxHeartRate: 200, typedMaxHeartRate: 200, history: { maxHeartRate: [{ from: start, value: 180 }, { from: "2026-11-18", value: 200 }] } };
  const load = activityLoad(entry, base).load;
  assert.ok(load > 0);
  assert.equal(activityLoad(entry, changed).load, load);
  // Without the history the new maximum would have changed it.
  assert.notEqual(activityLoad(entry, { ...changed, history: {} }).load, load);
});

test("mergeSettings keeps the history changes of both devices", () => {
  const sideA = { defaults: { fitness: {
    maxHeartRate: 185, history: { maxHeartRate: [{ from: start, value: 180, at: 1 }, { from: "2026-11-10", value: 185, at: 10 }] },
    sports: { rowing: { weeklyHours: 4, history: { weeklyHours: [{ from: start, value: 3, at: 1 }, { from: "2026-11-09", value: 4, at: 11 }] } } },
  } }, changedAt: { fitness: 100 } };
  const sideB = { defaults: { fitness: {
    maxHeartRate: 192, history: { maxHeartRate: [{ from: start, value: 180, at: 2 }, { from: "2026-11-10", value: 188, at: 5 }, { from: "2026-11-15", value: 192, at: 50 }] },
    sports: { rowing: { weeklyHours: 3 }, cycling: { weeklyKm: 100, history: { weeklyKm: [{ from: start, value: null, at: 3 }, { from: "2026-11-16", value: 100, at: 60 }] } } },
  } }, changedAt: { fitness: 200 } };
  const merged = mergeSettings(sideA, sideB).defaults.fitness;
  assert.deepEqual(merged.history.maxHeartRate.map((record) => [record.from, record.value]), [[start, 180], ["2026-11-10", 185], ["2026-11-15", 192]]);
  assert.equal(merged.maxHeartRate, 192);
  assert.deepEqual(merged.sports.rowing.history.weeklyHours.map((record) => record.value), [3, 4]);
  assert.equal(merged.sports.rowing.weeklyHours, 4);
  assert.equal(merged.sports.cycling.weeklyKm, 100);
  assert.deepEqual(mergeSettings(sideB, sideA).defaults.fitness.history, merged.history);
});
