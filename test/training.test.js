import assert from "node:assert/strict";
import test from "node:test";
import { adherenceShare, dayStreak, lastMondays, logPlan, plannedDay, scoreWorkout, weekAdherence } from "../src/training.js";

const plan = {
  usual: { minutes: 13 },
  long: { minutes: 25 },
  minimal: { minutes: 10 },
  steadyHeartRate: [127, 141],
  intervals: { repeats: 6, minutes: 2, rest: 2, watts: [100, 110] },
};

test("the plan's log keeps the days gone by as planned and follows the plan from today on", () => {
  const before = { "2026-11-16": plannedDay("usual", plan), "2026-11-18": plannedDay("long", plan), "2026-01-01": plannedDay("usual", plan) };
  const log = logPlan(before, [{ day: "2026-11-18", type: "usual" }, { day: "2026-11-19", type: "intervals" }], plan, "2026-11-18");
  assert.equal(log["2026-11-16"].type, "usual");
  assert.equal(log["2026-11-18"].type, "usual");
  assert.equal(log["2026-11-19"].type, "intervals");
  // Older than half a year: gone.
  assert.equal(log["2026-01-01"], undefined);
  // Today already ridden, so not in the plan's days: kept as it was planned.
  assert.equal(logPlan(before, [{ day: "2026-11-19", type: "usual" }], plan, "2026-11-18")["2026-11-18"].type, "long");
});

test("a steady workout scores its time in zone 2, its length against the plan and the heart's drift", () => {
  const planned = plannedDay("long", plan);
  const good = scoreWorkout({ minutes: 25, kind: "steady", heart: { inside: 1200, below: 60, above: 60 }, drift: 3, laps: [] }, planned);
  assert.equal(good.as, "long");
  assert.ok(good.score >= 90, String(good.score));
  assert.equal(good.swapped, false);
  // Too short, above zone 2 half the time, drifting: low.
  const poor = scoreWorkout({ minutes: 12, kind: "steady", heart: { inside: 300, below: 0, above: 300 }, drift: 12, laps: [] }, planned);
  assert.ok(poor.score < 50, String(poor.score));
  assert.deepEqual(poor.parts.map((item) => item.key), ["zone", "time", "drift"]);
  // Without a heart rate: the length alone.
  assert.equal(scoreWorkout({ minutes: 25, kind: "steady", heart: null, drift: null, laps: [] }, planned).score, 100);
});

test("the least workout ridden easy on a usual day is a full score, not a short usual one", () => {
  const result = scoreWorkout({ minutes: 10, kind: "steady", heart: { inside: 200, below: 300, above: 0 }, drift: null, laps: [] }, plannedDay("usual", plan));
  assert.equal(result.as, "minimal");
  assert.equal(result.score, 100);
  assert.equal(result.swapped, false);
});

test("intervals score the repeats done, the work at the power and the easy rests", () => {
  const laps = [{ seconds: 300, power: 70 }];
  for (let index = 0; index < 6; index += 1) laps.push({ seconds: 120, power: index < 5 ? 105 : 90 }, { seconds: 120, power: 60 });
  const result = scoreWorkout({ minutes: 30, kind: "intervals", heart: null, drift: null, laps }, plannedDay("intervals", plan));
  assert.equal(result.as, "intervals");
  const parts = Object.fromEntries(result.parts.map((item) => [item.key, item]));
  assert.equal(parts.repeats.done, 6);
  assert.equal(parts.power.hit, 5);
  assert.equal(parts.rest.share, 1);
  assert.ok(result.score >= 90 && result.score < 100, String(result.score));
  // Ridden on a day planned as usual: scored as intervals, marked swapped.
  assert.equal(scoreWorkout({ minutes: 30, kind: "intervals", heart: null, drift: null, laps }, plannedDay("usual", plan)).swapped, true);
});

test("an FTP test scores how even it went and whether it lasted", () => {
  const even = scoreWorkout({ minutes: 45, kind: "intervals", ftpTest: true, testMinutes: 20, testHalves: [120, 118], laps: [] }, plannedDay("ftpTest", plan));
  assert.equal(even.as, "ftpTest");
  assert.equal(even.score, 100);
  const faded = scoreWorkout({ minutes: 45, kind: "intervals", ftpTest: true, testMinutes: 20, testHalves: [140, 112], laps: [] }, plannedDay("ftpTest", plan));
  assert.ok(faded.score <= 40, String(faded.score));
});

test("without a plan for the day the workout is scored by the current targets, marked approximate", () => {
  const result = scoreWorkout({ minutes: 13, kind: "steady", heart: { inside: 600, below: 0, above: 0 }, drift: null, laps: [] }, null, plannedDay(null, plan));
  assert.equal(result.approx, true);
  assert.equal(result.score, 100);
  assert.equal(scoreWorkout({ minutes: 13, kind: "steady", heart: null, drift: null, laps: [] }, null), null);
});

test("a week's adherence counts the planned days ridden, the longer and interval workouts and the score", () => {
  const log = {
    "2026-11-16": plannedDay("usual", plan),
    "2026-11-17": plannedDay("intervals", plan),
    "2026-11-18": plannedDay("usual", plan),
    "2026-11-19": plannedDay("long", plan),
    "2026-11-20": plannedDay("usual", plan),
  };
  const workouts = [
    { day: "2026-11-16", minutes: 13, kind: "steady", score: 90 },
    { day: "2026-11-17", minutes: 30, kind: "intervals", score: 80 },
    { day: "2026-11-19", minutes: 24, kind: "steady", score: 100 },
  ];
  const week = weekAdherence(log, workouts, "2026-11-16", "2026-11-19");
  assert.equal(week.planned, 4);
  assert.equal(week.ridden, 3);
  assert.deepEqual(week.long, [1, 1]);
  assert.deepEqual(week.intervals, [1, 1]);
  assert.equal(week.score, 90);
  assert.equal(adherenceShare([week, { planned: 4, ridden: 4 }]), 88);
  assert.equal(adherenceShare([]), null);
});

test("the streak counts days in a row up to today, or yesterday while today is still to ride", () => {
  assert.deepEqual(dayStreak(["2026-11-16", "2026-11-17", "2026-11-18"], "2026-11-18"), { days: 3, today: true });
  assert.deepEqual(dayStreak(["2026-11-16", "2026-11-17"], "2026-11-18"), { days: 2, today: false });
  assert.deepEqual(dayStreak(["2026-11-15"], "2026-11-18"), { days: 0, today: false });
  assert.deepEqual(lastMondays("2026-11-18", 3), ["2026-11-02", "2026-11-09", "2026-11-16"]);
});

test("intervals of another shape than the plan's, on a day without a plan kept, are not scored", () => {
  const laps = [{ seconds: 600, power: 90 }, { seconds: 30, power: 120 }, { seconds: 30, power: 60 }];
  assert.equal(scoreWorkout({ minutes: 12, kind: "intervals", heart: null, drift: null, laps }, null, plannedDay(null, plan)), null);
  // Planned that day: scored, and the efforts missed count.
  assert.equal(scoreWorkout({ minutes: 12, kind: "intervals", heart: null, drift: null, laps }, plannedDay("intervals", plan)).parts[0].done, 0);
});
