import assert from "node:assert/strict";
import test from "node:test";
import { kindsOfWeek, plannedKm, kmByKindByWeek, longTires, nextWeekPlan, weekKmByKind, planRuleBreaks, longestByWeek, mondayOf, nextStep, steadyStartWatts, suggestedLevels, trainingDays, weekChecklist, weekPlan } from "../src/plan.js";

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
  // An FTP test counted as intervals by its kind adds no repeat: the same four and two tests still make six.
  const tests = [{ day: "2026-10-20", km: 5, seconds: 1800, kind: "intervals", ftpTest: true }, { day: "2026-10-22", km: 5, seconds: 1800, kind: "intervals", ftpTest: true }];
  assert.equal(nextStep({ workouts: weeks(4).concat(tests), today: "2026-11-04" }).intervals.repeats, 6);
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

test("an intense training focus allows one interval workout a week, an easy one asks for two", () => {
  const today = "2026-11-10";
  const workouts = Array.from({ length: 10 }, (_, index) => ({ day: `2026-11-0${(index % 9) + 1}`.replace("-010", "-10"), km: 2, seconds: 720, kind: "steady", decoupling: null, hardShare: 0 }))
    .filter((workout) => workout.day < today);
  const intense = nextStep({ workouts, today, focus: "intense" });
  assert.equal(intense.intervals.max, 1);
  assert.equal(intense.focus, "intense");
  assert.equal(nextStep({ workouts, today, focus: "easy" }).intervals.max, 2);
  const days = [0, 1, 2, 3, 4, 5, 6];
  const count = (plan) => weekPlan(plan, workouts, today, days).filter((item) => item.type === "intervals").length;
  assert.equal(count(intense), 1);
});

test("the suggested resistance is the steady level nearest zone 2's middle and the intervals' hard lap levels", () => {
  const steady = (day, level, avgHeartRate) => ({ day, kind: "steady", level, avgHeartRate, lapLevels: [] });
  const workouts = [
    steady("2026-11-01", 5, 118), steady("2026-11-02", 5, 122), steady("2026-11-03", 6, 132), steady("2026-11-04", 6, 136), steady("2026-11-05", 7, 150),
    { day: "2026-11-06", kind: "intervals", level: 6, avgHeartRate: 146, lapLevels: [12, 13, 12, 6] },
    { day: "2026-11-08", kind: "intervals", level: 6, avgHeartRate: 149, lapLevels: [11, 14, 6] },
  ];
  assert.deepEqual(suggestedLevels(workouts, [127, 141], "2026-11-10"), { steady: 6, intervals: [12, 14] });
  assert.deepEqual(suggestedLevels([], null, "2026-11-10"), { steady: null, intervals: null });
});

test("the steady start power is where the laps from the fifth minute put the heart rate at zone 2's middle", () => {
  const laps = (pairs) => pairs.map(([heartRate, power], index) => ({ offset: index * 170, heartRate, power }));
  const steady = (day, pairs) => ({ day, kind: "steady", laps: laps(pairs) });
  const workouts = [
    steady("2026-11-10", [[103, 77], [117, 86], [124, 89], [129, 88]]),
    steady("2026-11-13", [[105, 85], [133, 90], [137, 91], [144, 91]]),
    steady("2026-11-15", [[107, 67], [116, 68], [126, 72], [127, 70], [127, 70], [75, 112]]),
  ];
  // The first lap of each is left out, being before the fifth minute, and so is the strap's dropout to 75.
  assert.equal(steadyStartWatts(workouts, [127, 141], "2026-11-16"), 90);
  assert.equal(steadyStartWatts(workouts.slice(0, 1), [127, 141], "2026-11-16"), null);
  assert.equal(steadyStartWatts(workouts, null, "2026-11-16"), null);
});

test("the training settings set the usual and longer workouts' time, their number and the intervals", () => {
  // 2 km in 660 s: 3.03 m/s, so 13 minutes is 2.4 km and 25 minutes 4.6 km.
  const prefs = { usualMinutes: 13, longTargetMinutes: 25, longPerWeek: 2, intervalsPerWeek: 1 };
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04", prefs });
  assert.equal(plan.usual.km, 2.4);
  assert.equal(plan.usual.minutes, 13);
  // A target and no step: straight to the target.
  assert.equal(plan.long.fromKm, 4.6);
  assert.equal(plan.long.count, 2);
  assert.equal(plan.intervals.max, 1);
  // A step grows the longest of late by that time, never past the target.
  const stepped = nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { longStepMinutes: 5, longTargetMinutes: 13 } });
  assert.equal(stepped.long.fromKm, 2.4);
  const free = nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { longStepMinutes: 5 } });
  assert.equal(free.long.fromKm, 3);
  // No intervals when set to none.
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { intervalsPerWeek: 0 } }).intervals.due, false);
});

test("a weekly volume set caps the week's distance, which grows towards it", () => {
  // Last week 8 km at 3.03 m/s: 1 hour is 10.9 km, so the week grows 10 % to 8.8; half an hour caps it at 5.5.
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { weeklyHours: 1 } }).weekKm, 8.8);
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { weeklyHours: 0.5 } }).weekKm, 5.5);
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { weeklyKm: 8.5 } }).weekKm, 8.5);
});

test("weekPlan lays two longer workouts on the days set, or apart with a weekend day, intervals away from them", () => {
  const every = [0, 1, 2, 3, 4, 5, 6];
  const set = nextStep({ workouts: weeks(4), today: "2026-11-02", prefs: { longPerWeek: 2, longDays: [3, 6], intervalsPerWeek: 1, restAfterLongMinutes: 0 } });
  const days = weekPlan(set, [], "2026-11-02", every);
  assert.deepEqual(days.filter((item) => item.type === "long").map((item) => item.day), ["2026-11-05", "2026-11-08"]);
  const intervals = days.filter((item) => item.type === "intervals").map((item) => item.day);
  assert.equal(intervals.length, 1);
  assert.ok(!["2026-11-04", "2026-11-06", "2026-11-07"].includes(intervals[0]), intervals[0]);
  // Without days set: Sunday, the last weekend day, first; the other mid-week, as far from it round the week as can be.
  const auto = weekPlan(nextStep({ workouts: weeks(4), today: "2026-11-02", prefs: { longPerWeek: 2 } }), [], "2026-11-02", every);
  assert.deepEqual(auto.filter((item) => item.type === "long").map((item) => item.day), ["2026-11-05", "2026-11-08"]);
  // One of two done this week: one left.
  const oneDone = [{ day: "2026-11-02", km: 5, seconds: 1650, kind: "steady" }];
  const left = nextStep({ workouts: weeks(4).filter((workout) => workout.day < "2026-11-02").concat(oneDone), today: "2026-11-03", prefs: { longPerWeek: 2 } });
  assert.equal(left.longDone, 1);
  assert.equal(left.doneLong, false);
  assert.equal(weekPlan(left, oneDone, "2026-11-03", every).filter((item) => item.type === "long" && item.day < "2026-11-09").length, 1);
});

test("the lighter week comes as often and as light as set, or never", () => {
  // The week of 26 October is the fourth from 5 October, the third with every three weeks set.
  assert.equal(nextStep({ workouts: weeks(3), today: "2026-10-28" }).lighter, true);
  assert.equal(nextStep({ workouts: weeks(3), today: "2026-10-28", prefs: { lighterEvery: 0 } }).lighter, false);
  assert.equal(nextStep({ workouts: weeks(2), today: "2026-10-21", prefs: { lighterEvery: 3 } }).lighter, true);
  // 8 km last week, 30 % lighter: 5.6.
  assert.equal(nextStep({ workouts: weeks(3), today: "2026-10-28", prefs: { lighterPercent: 30 } }).weekKm, 5.6);
});

test("the interval kind sets the work, the rest, the repeats and the power", () => {
  const of = (intervalType) => nextStep({ workouts: weeks(4), today: "2026-11-04", ftp: 100, prefs: { intervalType } }).intervals;
  // Four interval workouts in the last eight weeks: two steps of growth.
  assert.deepEqual([of("short").minutes, of("short").rest, of("short").repeats, of("short").watts], [1, 1, 8, [115, 125]]);
  assert.deepEqual([of("medium").minutes, of("medium").repeats, of("medium").watts], [2, 6, [100, 110]]);
  assert.deepEqual([of("tempo").minutes, of("tempo").rest, of("tempo").repeats, of("tempo").watts], [10, 3, 2, [88, 95]]);
  assert.equal(of(null).kind, "medium");
});

test("the least workout is ten minutes unless set, and none with 0", () => {
  assert.deepEqual(nextStep({ workouts: weeks(4), today: "2026-11-04" }).minimal, { minutes: 10 });
  assert.deepEqual(nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { minimalMinutes: 8 } }).minimal, { minutes: 8 });
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { minimalMinutes: 0 } }).minimal, null);
});

test("the FTP test is due every so many weeks, laid out short first and the 20 minutes rested two days later", () => {
  const every = [0, 1, 2, 3, 4, 5, 6];
  // Never tested: due now, and no intervals that week.
  const due = nextStep({ workouts: weeks(4), today: "2026-11-02", prefs: { ftpTestWeeks: 6, longPerWeek: 2, longDays: [3, 6] } });
  assert.equal(due.ftpTest.due, true);
  assert.equal(due.intervals.max, 0);
  const days = weekPlan(due, [], "2026-11-02", every);
  assert.deepEqual(days.filter((item) => item.type.startsWith("ftpTest")).map((item) => [item.day, item.type]), [["2026-11-02", "ftpTestShort"], ["2026-11-04", "ftpTest"]]);
  assert.equal(days.filter((item) => item.type === "intervals").length, 0);
  // The short one done on Monday: the 20 minutes still due, from Wednesday.
  const short = [{ day: "2026-11-02", km: 1.5, seconds: 600, kind: "intervals", ftpTest: true }];
  const left = nextStep({ workouts: weeks(4).filter((workout) => workout.day < "2026-11-02").concat(short), today: "2026-11-03", prefs: { ftpTestWeeks: 6 } });
  assert.equal(left.ftpTest.due, true);
  assert.equal(weekPlan(left, short, "2026-11-03", every).find((item) => item.type === "ftpTest").day, "2026-11-04");
  // Tested three weeks ago by an FTP typed then: not due; off without the setting.
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-02", prefs: { ftpTestWeeks: 6 }, lastFtpTest: "2026-10-12" }).ftpTest.due, false);
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-02" }).ftpTest, null);
  assert.equal(weekChecklist(left, short, "2026-11-03", every)[0].type, "ftpTest");
});

test("the outlook grows the longer workouts by the step up to the target, with the lighter weeks and the FTP tests", () => {
  // From 2 km (11 min) by 5 minutes a week up to 25: from 5 October, the week of 23 November (index 3) is the 8th, lighter.
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: { longStepMinutes: 5, longTargetMinutes: 25, ftpTestWeeks: 4, intervalsPerWeek: 1 }, lastFtpTest: "2026-10-26" });
  assert.equal(plan.outlook.length, 6);
  assert.deepEqual(plan.outlook.map((week) => week.lighter), [false, false, false, true, false, false]);
  const minutes = plan.outlook.map((week) => week.longMinutes);
  assert.ok(minutes[1] > minutes[0] && minutes[2] > minutes[1] && minutes[3] < minutes[2] && minutes[4] >= minutes[2], minutes.join());
  assert.ok(Math.max(...minutes) <= 25, minutes.join());
  // Tested on 26 October, every 4 weeks: the week of 23 November.
  assert.deepEqual(plan.outlook.map((week) => week.ftpTest), [false, false, false, true, false, false]);
  assert.equal(plan.outlook[3].intervals, 0);
  assert.equal(plan.outlook[0].intervals, 1);
});

test("after illness or injury the plan holds the longer workouts and leaves out the intervals", () => {
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04", unwell: true });
  assert.ok(plan.holds.includes("unwell"));
  assert.equal(plan.long.fromKm, 2);
  assert.equal(plan.intervals.due, false);
});

test("days excused are no training days: the longer workout and the FTP test move to the others", () => {
  const every = [0, 1, 2, 3, 4, 5, 6];
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-02", prefs: { longPerWeek: 1, ftpTestWeeks: 6 } });
  // Without excuses the longer workout falls on Sunday the 8th; with the weekend off it moves to Friday.
  assert.equal(weekPlan(plan, [], "2026-11-02", every).find((item) => item.type === "long").day, "2026-11-08");
  const excused = { "2026-11-07": { reason: "travel" }, "2026-11-08": { reason: "travel" } };
  const days = weekPlan(plan, [], "2026-11-02", every, excused);
  assert.ok(!days.some((item) => item.day === "2026-11-07" || item.day === "2026-11-08"));
  assert.equal(days.find((item) => item.type === "long").day, "2026-11-06");
  // The FTP tests still both fit.
  assert.equal(days.filter((item) => item.type.startsWith("ftpTest")).length, 2);
  const list = weekChecklist(plan, [], "2026-11-02", every, excused);
  assert.equal(list.find((item) => item.day === "2026-11-08").type, "off");
});

test("nextStep tapers before a goal: a fifth fewer kilometres the week before, 40 % fewer and short intervals in its week", () => {
  const final = nextStep({ workouts: weeks(4), today: "2026-11-04", goal: "2026-11-07", prefs: { ftpTestWeeks: 6 } });
  assert.equal(final.taper, "final");
  assert.equal(final.weekKm, 4.8);
  assert.equal(final.long.fromKm, 2);
  assert.equal(final.intervals.max, 1);
  assert.ok(final.intervals.repeats <= 3, String(final.intervals.repeats));
  assert.equal(final.ftpTest.due, false);
  assert.equal(final.lighter, false);
  const first = nextStep({ workouts: weeks(4), today: "2026-11-04", goal: "2026-11-14" });
  assert.equal(first.taper, "first");
  assert.equal(first.weekKm, 6.4);
  assert.equal(first.long.fromKm, 2);
  assert.equal(first.outlook[1].taper, "final");
  assert.equal(first.outlook[1].goal, "2026-11-14");
  assert.equal(first.outlook[2].taper, null);
  assert.equal(nextStep({ workouts: weeks(4), today: "2026-11-04", goal: "2026-11-01" }).taper, null);
});

test("weekPlan puts the goal on its day, an opener the day before and nothing hard two days before", () => {
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04", goal: "2026-11-07" });
  const days = weekPlan(plan, weeks(4), "2026-11-04", [0, 1, 3, 4, 5]);
  const typeOn = (day) => days.find((item) => item.day === day)?.type;
  assert.equal(typeOn("2026-11-07"), "goal");
  assert.equal(typeOn("2026-11-06"), "opener");
  assert.equal(typeOn("2026-11-05"), "usual");
  // A goal on a day not trained on still shows in the week.
  const sunday = nextStep({ workouts: weeks(4), today: "2026-11-04", goal: "2026-11-08" });
  assert.ok(weekChecklist(sunday, weeks(4), "2026-11-04", [0, 1, 3, 5]).some((item) => item.day === "2026-11-08" && item.type === "goal"));
});

test("an FTP test the taper puts off comes the week after the goal", () => {
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04", goal: "2026-11-14", prefs: { ftpTestWeeks: 6 } });
  assert.deepEqual(plan.outlook.map((week) => week.ftpTest), [false, false, true, false, false, false]);
});

test("weekPlan swaps two days' workouts by hand, and planRuleBreaks tells what a swap breaks", async () => {
  const { planRuleBreaks } = await import("../src/plan.js");
  const plan = nextStep({ workouts: weeks(4), today: "2026-11-04", prefs: {} });
  const days = weekPlan(plan, weeks(4), "2026-11-04", [0, 1, 3, 5]);
  const [one, two] = days.filter((item, index, all) => all.findIndex((other) => other.type === item.type) === index);
  const swapped = weekPlan(plan, weeks(4), "2026-11-04", [0, 1, 3, 5], {}, { [one.day]: two.day });
  assert.equal(swapped.find((item) => item.day === one.day).type, two.type);
  assert.equal(swapped.find((item) => item.day === two.day).type, one.type);
  // A pair with a day not open is left as laid out.
  assert.deepEqual(weekPlan(plan, weeks(4), "2026-11-04", [0, 1, 3, 5], {}, { [one.day]: "2026-11-30" }), days);
  assert.deepEqual(planRuleBreaks([{ day: "2026-11-21", type: "long" }, { day: "2026-11-22", type: "intervals" }]), [{ day: "2026-11-22", rule: "afterLong" }]);
  assert.deepEqual(planRuleBreaks([{ day: "2026-11-20", type: "ftpTest" }], "2026-11-19"), [{ day: "2026-11-20", rule: "testGap" }]);
  assert.deepEqual(planRuleBreaks([{ day: "2026-11-20", type: "ftpTest" }], "2026-11-18"), []);
});

test("weekPlan keeps this week's intervals in it, the day before a longer workout when every day is next to one", () => {
  const plan = { long: { count: 2 }, intervals: { due: true, done: 0, max: 1, set: true }, longDone: 0 };
  const days = weekPlan(plan, [{ day: "2026-11-23" }, { day: "2026-11-24" }], "2026-11-25", [0, 1, 2, 3, 4, 5, 6]);
  const type = Object.fromEntries(days.map((item) => [item.day, item.type]));
  assert.equal(type["2026-11-26"], "long");
  assert.equal(type["2026-11-29"], "long");
  const intervals = days.filter((item) => item.type === "intervals").map((item) => item.day);
  assert.equal(intervals.length, 1);
  assert.ok(intervals[0] < "2026-11-30" && ["2026-11-25", "2026-11-28"].includes(intervals[0]), intervals[0]);
});

test("nextWeekPlan lays out next week afresh: its longer workouts and intervals, all of it ahead", () => {
  const plan = { long: { count: 1 }, intervals: { due: false, done: 1, max: 1, set: true }, longDone: 1, doneLong: true, ftpTest: { due: true } };
  const next = nextWeekPlan(plan, [{ day: "2026-11-23" }], "2026-11-25", [0, 2, 4, 6]);
  assert.deepEqual(next.checklist.map((item) => item.day), ["2026-11-30", "2026-12-02", "2026-12-04", "2026-12-06"]);
  assert.ok(next.checklist.every((item) => item.status === "planned"));
  const types = next.checklist.map((item) => item.type);
  assert.equal(types.filter((type) => type === "long").length, 1);
  assert.equal(types.filter((type) => type === "intervals").length, 1);
  assert.ok(!types.some((type) => type?.startsWith("ftpTest")));
  assert.deepEqual(nextWeekPlan(plan, [], "2026-11-25", []).checklist, []);
});

test("a longer workout shorter than the length set lets intervals go next to it; a swap there breaks nothing then", () => {
  const plan = { long: { count: 1, minutes: 30 }, intervals: { due: true, done: 0, max: 1, set: true }, longDone: 0, restAfterLongMinutes: 60 };
  // Training on Wednesday to Friday from Wednesday: the longer workout on Friday, Thursday next to it.
  const days = weekPlan(plan, [], "2026-11-25", [2, 3, 4]);
  assert.ok(days.some((item) => item.type === "intervals"));
  assert.equal(longTires(plan), false);
  assert.equal(longTires({ ...plan, long: { minutes: 60 } }), true);
  assert.equal(longTires({ ...plan, restAfterLongMinutes: 0 }), true);
  const swapped = [{ day: "2026-11-26", type: "long" }, { day: "2026-11-27", type: "intervals" }];
  assert.deepEqual(planRuleBreaks(swapped, null, false), []);
  assert.equal(planRuleBreaks(swapped, null, true)[0].rule, "afterLong");
  assert.equal(planRuleBreaks([{ day: "2026-11-26", type: "long" }, { day: "2026-11-27", type: "ftpTestShort" }], null, false)[0].rule, "afterLong");
});

test("intervals go on the weekdays set for them, not the day after a longer workout that tires", () => {
  const plan = { long: { count: 1, minutes: 70 }, longDays: [6], intervals: { due: true, done: 0, max: 1, set: true }, longDone: 0, restAfterLongMinutes: 60 };
  const every = [0, 1, 2, 3, 4, 5, 6];
  // From Monday 23 November: the longer workout on Sunday 29th.
  const on = (intervalDays) => weekPlan({ ...plan, intervalDays }, [], "2026-11-23", every).filter((item) => item.type === "intervals").map((item) => item.day);
  assert.deepEqual(on([4]), ["2026-11-27"]);
  // Saturday is the day before the longer workout: allowed when set.
  assert.deepEqual(on([5]), ["2026-11-28"]);
  // Monday 30th is the day after it, and next week: the plan picks another day.
  assert.notDeepEqual(on([0]), ["2026-11-30"]);
});

test("a week's distance splits by kind: ridden and still planned of each", () => {
  const plan = { long: { fromKm: 5 }, usual: { km: 2.4 } };
  const checklist = [
    { status: "done", workouts: [{ km: 2.6, kind: "steady" }] },
    { status: "done", workouts: [{ km: 5.2, kind: "steady" }, { km: 3, kind: "intervals" }] },
    { status: "done", workouts: [{ km: 5.9, kind: "test", ftpTest: true }] },
    { status: "planned", type: "long" },
    { status: "planned", type: "intervals" },
    { status: "planned", type: "usual" },
    { status: "missed", type: null, workouts: [] },
  ];
  const parts = weekKmByKind(checklist, plan);
  assert.deepEqual(parts.map((part) => part.kind), ["usual", "long", "intervals", "ftpTest"]);
  const of = (kind) => parts.find((part) => part.kind === kind);
  assert.deepEqual([of("usual").done, of("usual").ahead], [2.6, 2.4]);
  assert.deepEqual([of("long").done, of("long").ahead], [5.2, 5]);
  assert.deepEqual([of("intervals").done, of("intervals").ahead], [3, 2.4]);
  assert.deepEqual([of("ftpTest").done, of("ftpTest").ahead], [5.9, 0]);
  assert.deepEqual(weekKmByKind([{ status: "planned", type: "usual" }], plan).map((part) => part.kind), ["usual"]);
});

test("the distance by kind week by week, the week of the day given last", () => {
  const plan = { long: { fromKm: 5 }, usual: { km: 2.4 } };
  const workouts = [{ day: "2026-11-17", km: 2.5, kind: "steady" }, { day: "2026-11-22", km: 5.1, kind: "steady" }, { day: "2026-11-24", km: 3, kind: "intervals" }];
  const weeks = kmByKindByWeek(workouts, plan, "2026-11-25", 3);
  assert.deepEqual(weeks.map((week) => week.monday), ["2026-11-09", "2026-11-16", "2026-11-23"]);
  assert.deepEqual(weeks[0].parts, []);
  assert.deepEqual(weeks[1].parts.map((part) => [part.kind, part.done]), [["usual", 2.5], ["long", 5.1]]);
  assert.deepEqual(weeks[2].parts.map((part) => [part.kind, part.done]), [["intervals", 3]]);
});

test("planned intervals come to the distance of the last ones ridden, else their minutes at the usual speed", () => {
  const ridden = nextStep({ workouts: weeks(4), today: "2026-11-04" });
  assert.ok(ridden.intervals.km > 0);
  assert.equal(plannedKm("intervals", ridden), ridden.intervals.km);
  assert.ok(plannedKm("ftpTest", ridden) > plannedKm("ftpTestShort", ridden));
  assert.equal(plannedKm("intervals", { usual: { km: 2.4 }, intervals: {} }), 2.4);
  // Without intervals ridden: their minutes at the usual speed, a number.
  const none = nextStep({ workouts: weeks(4).filter((workout) => workout.kind !== "intervals"), today: "2026-11-04" });
  assert.ok(Number.isFinite(none.intervals.km) && none.intervals.km > 0, String(none.intervals.km));
});

test("a week gone by tells its longer workout by the plan kept for its day, else by standing out of the week", () => {
  const plan = { long: { fromKm: 5.6 }, usual: { km: 2.4 } };
  const week = [
    { day: "2026-11-02", km: 2.4, kind: "steady" },
    { day: "2026-11-04", km: 2.5, kind: "steady" },
    { day: "2026-11-06", km: 3.5, kind: "steady" },
    { day: "2026-11-07", km: 2.9, kind: "intervals" },
  ];
  // Planned as the longer workout: a longer one, however short of today's length.
  const kept = kindsOfWeek(week, plan, { "2026-11-06": { type: "long" }, "2026-11-02": { type: "usual" } });
  assert.deepEqual(week.map(kept), ["usual", "usual", "long", "intervals"]);
  // Without a kept plan: the longest, a fifth over the others, is the longer one.
  assert.deepEqual(week.map(kindsOfWeek(week, plan)), ["usual", "usual", "long", "intervals"]);
  // Hardly longer than the others: usual.
  const even = [{ day: "2026-11-02", km: 2.4, kind: "steady" }, { day: "2026-11-04", km: 2.6, kind: "steady" }];
  assert.deepEqual(even.map(kindsOfWeek(even, plan)), ["usual", "usual"]);
  assert.deepEqual(kmByKindByWeek(week, plan, "2026-11-04", 1)[0].parts.map((part) => [part.kind, part.done]), [["usual", 4.9], ["long", 3.5], ["intervals", 2.9]]);
});

test("before the plan began every workout is a usual one", () => {
  const plan = { long: { fromKm: 2 }, usual: { km: 2.4 } };
  const week = [{ day: "2026-10-13", km: 2.2, kind: "test", ftpTest: true }, { day: "2026-10-15", km: 3, kind: "intervals" }, { day: "2026-10-17", km: 3.1, kind: "steady" }];
  assert.deepEqual(week.map(kindsOfWeek(week, plan, {}, "2026-10-16")), ["usual", "usual", "long"]);
  assert.deepEqual(kmByKindByWeek(week, plan, "2026-10-14", 1, {}, "2026-10-20")[0].parts.map((part) => [part.kind, part.done]), [["usual", 8.3]]);
});
