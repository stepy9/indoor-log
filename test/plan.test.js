import assert from "node:assert/strict";
import test from "node:test";
import { longestByWeek, mondayOf, nextStep, trainingDays, weekChecklist, weekPlan } from "../src/plan.js";

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

test("trainingDays takes the days set, or the weekdays trained on at least twice in four weeks", () => {
  const workouts = weeks(4);
  // Mondays, Tuesdays, Thursdays and Saturdays.
  assert.deepEqual(trainingDays(workouts, "2026-11-01"), [0, 1, 3, 5]);
  assert.deepEqual(trainingDays(workouts, "2026-11-01", [4, 0]), [0, 4]);
  assert.deepEqual(trainingDays([], "2026-11-01"), []);
});

test("weekPlan lays the week out: the longer workout at the weekend, intervals away from it", () => {
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04" });
  // From Wednesday 4 November, training on Mondays, Tuesdays, Thursdays and Saturdays.
  const days = weekPlan(plan, weeks(4), "2026-11-04", [0, 1, 3, 5]);
  assert.deepEqual(days.map((item) => item.day), ["2026-11-05", "2026-11-07", "2026-11-09", "2026-11-10"]);
  assert.equal(days.find((item) => item.day === "2026-11-07").type, "long");
  const intervals = days.filter((item) => item.type === "intervals").map((item) => item.day);
  assert.ok(intervals.length >= 1 && intervals.length <= 2);
  assert.ok(!intervals.includes("2026-11-08") && !intervals.includes("2026-11-06"));
  // Nothing to lay out without training days or a plan.
  assert.deepEqual(weekPlan(plan, [], "2026-11-04", []), []);
  assert.deepEqual(weekPlan(null, [], "2026-11-04", [0]), []);
});

test("weekPlan moves a longer workout done this week to the next one", () => {
  const plan = { ...nextStep({ workouts: weeks(4), today: "2026-11-04" }), doneLong: true };
  const days = weekPlan(plan, [], "2026-11-04", [0, 1, 3, 5]);
  const long = days.find((item) => item.type === "long");
  assert.ok(!long || long.day >= "2026-11-09", long?.day);
});

test("weekChecklist ticks the days trained on, marks the training days missed and plans the ones ahead", () => {
  const workouts = weeks(4).filter((workout) => workout.day < "2026-11-03").concat([{ day: "2026-11-03", km: 2.4, seconds: 800, kind: "steady" }]);
  const plan = nextStep({ workouts, today: "2026-11-04" });
  const list = weekChecklist(plan, workouts, "2026-11-04", [0, 1, 3, 5]);
  assert.deepEqual(list.map((item) => [item.day, item.status]), [["2026-11-02", "missed"], ["2026-11-03", "done"], ["2026-11-05", "planned"], ["2026-11-07", "planned"]]);
  assert.equal(list[1].workouts.length, 1);
  assert.ok(list.slice(2).every((item) => item.type));
});

test("weekPlan keeps a usual workout: intervals once a week, twice only with five days or more", () => {
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04" });
  const three = weekPlan(plan, [], "2026-11-04", [2, 4, 6]);
  assert.deepEqual(three.map((item) => item.type).sort(), ["intervals", "long", "usual"]);
  const five = weekPlan(plan, [], "2026-11-02", [0, 1, 2, 4, 6]);
  assert.equal(five.filter((item) => item.type === "intervals").length, 2);
  // One week trained in, four days in it: four training days, not one.
  const fresh = [0, 1, 2, 3].map((offset) => ({ day: `2026-10-2${6 + offset}`, km: 2, seconds: 660, kind: "steady" }));
  assert.deepEqual(trainingDays(fresh, "2026-11-04"), [0, 1, 2, 3]);
});

test("weekPlan keeps the longer workout in this week while it has days left", () => {
  const fresh = [0, 1, 2, 3].map((offset) => ({ day: `2026-10-2${6 + offset}`, km: 2, seconds: 660, kind: offset === 2 ? "intervals" : "steady" }));
  const plan = nextStep({ workouts: fresh, today: "2026-11-04" });
  const days = weekPlan(plan, fresh, "2026-11-04", [0, 1, 2, 3]);
  assert.equal(days.find((item) => item.type === "long").day, "2026-11-05");
});

test("longestByWeek gives each week's longest steady workout, this week last", () => {
  const list = longestByWeek(weeks(4, { km: 2 }).concat([{ day: "2026-10-31", km: 2.6, seconds: 900, kind: "steady" }]), "2026-11-04", 6);
  assert.deepEqual(list.map((week) => week.monday), ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
  assert.deepEqual(list.map((week) => week.km), [0, 2, 2, 2, 2.6, 0]);
});
