import assert from "node:assert/strict";
import test from "node:test";
import { mondayOf, nextStep } from "../src/plan.js";

// Four 2 km steady rows a week of about 11 minutes, from 6 October 2026, and an interval workout each week.
function weeks(count, { km = 2, decoupling = 2, hardShare = 0.1 } = {}) {
  const workouts = [];
  for (let week = 0; week < count; week += 1) {
    for (const offset of [0, 1, 3, 5]) {
      const day = new Date(Date.parse("2026-10-05T12:00:00Z") + (week * 7 + offset) * 86_400_000).toISOString().slice(0, 10);
      workouts.push({ day, km, seconds: km * 330, kind: offset === 3 ? "intervals" : "steady", decoupling, hardShare });
    }
  }
  return workouts;
}

test("mondayOf gives the week's Monday", () => {
  assert.equal(mondayOf("2026-11-04"), "2026-11-02");
  assert.equal(mondayOf("2026-11-02"), "2026-11-02");
  assert.equal(mondayOf("2026-11-08"), "2026-11-02");
});

test("nextStep asks for one workout about 10 % longer, the week up to 10 % more", () => {
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04", ftp: 110 });
  assert.equal(plan.usual.km, 2);
  assert.equal(plan.long.fromKm, 2.2);
  assert.ok(plan.long.toKm >= 2.3 && plan.long.toKm <= 2.4, String(plan.long.toKm));
  assert.equal(plan.long.minutes, 12);
  assert.equal(plan.lastWeekKm, 8);
  assert.equal(plan.weekKm, 8.8);
  assert.deepEqual(plan.holds, []);
  assert.deepEqual(plan.intervals.watts, [110, 121]);
  assert.deepEqual(plan.steadyWatts, [62, 83]);
});

test("nextStep holds the distance when the heart drifts, the form is low or the fitness climbs fast", () => {
  assert.deepEqual(nextStep({ workouts: weeks(4, { decoupling: 8 }), today: "2026-11-04" }).holds, ["drift"]);
  const tired = nextStep({ workouts: weeks(4), today: "2026-11-04", form: -25 });
  assert.deepEqual(tired.holds, ["tired"]);
  assert.equal(tired.long.fromKm, 2);
  assert.equal(tired.weekKm, 8);
  assert.equal(tired.intervals.due, false);
  assert.deepEqual(nextStep({ workouts: weeks(4), today: "2026-11-04", ramp: 6 }).holds, ["ramp"]);
  assert.equal(nextStep({ workouts: weeks(4, { hardShare: 0.5 }), today: "2026-11-04" }).tooHard, true);
});

test("nextStep makes every fourth week lighter", () => {
  // From the week of 5 October, the week of 26 October is the fourth.
  const plan = nextStep({ workouts: weeks(3), today: "2026-10-28" });
  assert.equal(plan.lighter, true);
  assert.equal(plan.long.fromKm, 2);
  assert.equal(plan.weekKm, 6.4);
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-04" }).lighter, false);
});

test("nextStep adds an interval repeat every two done, and knows when they are done this week", () => {
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04" });
  // Four interval workouts in the last eight weeks: two repeats more than four.
  assert.equal(plan.intervals.repeats, 6);
  // This week's Thursday interval is still to come on Wednesday the 4th.
  assert.equal(plan.intervals.done, 0);
  assert.equal(plan.intervals.due, true);
  assert.equal(nextStep({ workouts: [], today: "2026-11-04" }), null);
});
