import assert from "node:assert/strict";
import test from "node:test";
import { adherenceShare, dayStreak, defaultKinomapWorkouts, ftpFromTest, workoutFromName, fatigueByFeel, pickWorkouts, recentlyUnwell, routeSuggestions, setExcuse, workoutSuggestions, effortsInName, showsWeekSummary, weekScore, lastMondays, logPlan, longestMinutesByWeek, plannedDay, scoreWorkout, testPart, weekAdherence, zoneTwoTrend } from "../src/training.js";

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
  // Wednesday gone by unridden counts; Thursday, today, is ridden.
  assert.equal(week.planned, 4);
  assert.equal(week.ridden, 3);
  assert.deepEqual(week.long, [1, 1]);
  assert.deepEqual(week.intervals, [1, 1]);
  assert.equal(week.score, 90);
  assert.equal(adherenceShare([week, { planned: 4, ridden: 4 }]), 88);
  assert.equal(adherenceShare([]), null);
  // Today still to ride: not counted against the week.
  assert.equal(weekAdherence(log, workouts.slice(0, 2), "2026-11-16", "2026-11-19").planned, 3);
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

test("the longest workouts by week, in minutes", () => {
  const list = longestMinutesByWeek([{ day: "2026-11-10", minutes: 14.6, kind: "steady" }, { day: "2026-11-12", minutes: 30, kind: "intervals" }, { day: "2026-11-17", minutes: 20.2, kind: "steady" }], "2026-11-18", 3);
  assert.deepEqual(list.map((week) => week.minutes), [0, 15, 20]);
});

test("the zone 2 power's trend is the watts gained per four weeks, from four points over two weeks", () => {
  const points = [["2026-10-20", 80], ["2026-10-27", 82], ["2026-11-03", 84], ["2026-11-10", 86]].map(([day, watts]) => ({ day, watts }));
  assert.equal(zoneTwoTrend(points).perFourWeeks, 8);
  assert.equal(zoneTwoTrend(points.slice(0, 3)).perFourWeeks, null);
});

test("three workouts in a row felt harder than usual at a usual heart rate tell of fatigue", () => {
  const usual = ["2026-11-01", "2026-11-03", "2026-11-05", "2026-11-07"].map((day) => ({ day, rpe: 3, feel: 50, avgHeartRate: 132 }));
  const hard = ["2026-11-14", "2026-11-15", "2026-11-16"].map((day) => ({ day, rpe: 6, feel: 50, avgHeartRate: 131 }));
  assert.deepEqual(fatigueByFeel([...usual, ...hard], "2026-11-17"), { days: 3, rpe: 6, usualRpe: 3 });
  // Harder, but at a higher heart rate: ridden harder, not tired.
  assert.equal(fatigueByFeel([...usual, ...hard.map((workout) => ({ ...workout, avgHeartRate: 145 }))], "2026-11-17"), null);
  assert.equal(fatigueByFeel(usual, "2026-11-17"), null);
});

test("the week's summary shows from Monday until the first workout, Wednesday at the latest", () => {
  assert.equal(showsWeekSummary(["2026-11-22"], "2026-11-23"), true);
  assert.equal(showsWeekSummary(["2026-11-22"], "2026-11-24"), true);
  assert.equal(showsWeekSummary(["2026-11-23"], "2026-11-24"), false);
  assert.equal(showsWeekSummary([], "2026-11-26"), false);
});

test("a week's score weighs the plan kept and the workouts' average", () => {
  assert.equal(weekScore({ planned: 7, ridden: 7, long: [2, 2], intervals: [1, 1], score: 90 }), 97);
  // Two days missed, one longer workout of two: lower.
  assert.equal(weekScore({ planned: 7, ridden: 5, long: [1, 2], intervals: [1, 1], score: 90 }), 78);
  // Without a plan kept: the workouts' average alone.
  assert.equal(weekScore({ planned: 0, ridden: 0, long: [0, 0], intervals: [0, 0], score: 71 }), 71);
  assert.equal(weekScore({ planned: 0, ridden: 0, long: [0, 0], intervals: [0, 0], score: null }), null);
});

test("an excused day leaves the week's plan and keeps the streak, illness holds the plan", () => {
  const log = { "2026-11-16": plannedDay("usual", plan), "2026-11-17": plannedDay("usual", plan), "2026-11-18": plannedDay("usual", plan) };
  const excuses = setExcuse({}, "2026-11-17", "2026-11-18", { reason: "illness", note: "chřipka" });
  assert.deepEqual(Object.keys(excuses), ["2026-11-17", "2026-11-18"]);
  assert.equal(excuses["2026-11-17"].note, "chřipka");
  const week = weekAdherence(log, [{ day: "2026-11-16", minutes: 13, kind: "steady", score: 90 }], "2026-11-16", "2026-11-19", excuses);
  assert.equal(week.planned, 1);
  assert.equal(week.ridden, 1);
  assert.equal(week.excused, 2);
  // Ridden on the 14th to 16th, ill on the 17th and 18th: three days, unbroken.
  assert.deepEqual(dayStreak(["2026-11-14", "2026-11-15", "2026-11-16"], "2026-11-19", excuses), { days: 3, today: false });
  assert.equal(recentlyUnwell(excuses, "2026-11-19"), true);
  assert.equal(recentlyUnwell(setExcuse({}, "2026-11-17", null, { reason: "travel" }), "2026-11-19"), false);
  assert.deepEqual(setExcuse(excuses, "2026-11-17", "2026-11-18", null), {});
});

test("routes that fit the planned distance come ridden longest ago first, the nearest when none fits", () => {
  const rides = [
    { name: "Lake A", km: 4.6, day: "2026-11-10", kind: "steady" },
    { name: "Lake B", km: 4.8, day: "2026-10-20", kind: "steady" },
    { name: "Lake B", km: 4.8, day: "2026-10-01", kind: "steady" },
    { name: "River C", km: 2.4, day: "2026-11-01", kind: "steady" },
    { name: "Drill", km: 4.7, day: "2026-09-01", kind: "intervals" },
  ];
  assert.deepEqual(routeSuggestions(rides, [4.5, 4.9]).map((route) => [route.name, route.last]), [["Lake B", "2026-10-20"], ["Lake A", "2026-11-10"]]);
  assert.deepEqual(routeSuggestions(rides, [3, 3.3]).map((route) => route.name), ["River C", "Lake A"]);
});

test("the creator's workouts are offered for the FTP tests by name and for intervals by kind", () => {
  const rides = [
    { name: "FTP test 5 min", day: "2026-11-18", kind: "intervals" },
    { name: "FTP test 20 min", day: "2026-11-21", kind: "intervals" },
    { name: "6x2 min", day: "2026-11-05", kind: "intervals" },
    { name: "8x1 min", day: "2026-10-28", kind: "intervals" },
    { name: "Lake A", day: "2026-11-10", kind: "steady" },
  ];
  assert.deepEqual(workoutSuggestions(rides, "ftpTestShort").map((item) => item.name), ["FTP test 5 min"]);
  assert.deepEqual(workoutSuggestions(rides, "ftpTest").map((item) => item.name), ["FTP test 20 min"]);
  assert.deepEqual(workoutSuggestions(rides, "intervals").map((item) => item.name), ["8x1 min", "6x2 min"]);
  assert.deepEqual(workoutSuggestions(rides, "usual"), []);
});

test("the interval workout whose name tells the planned efforts comes first", () => {
  const rides = [
    { name: "Intervaly 4x2 min", day: "2026-10-01", kind: "intervals" },
    { name: "Intervaly 6× 2 min", day: "2026-11-10", kind: "intervals" },
    { name: "Krátké 8x1 min", day: "2026-09-01", kind: "intervals" },
  ];
  const list = workoutSuggestions(rides, "intervals", 3, { repeats: 6, minutes: 2 });
  assert.deepEqual(list.map((item) => item.name), ["Intervaly 6× 2 min", "Intervaly 4x2 min", "Krátké 8x1 min"]);
  assert.equal(list[0].exact, true);
  assert.deepEqual(effortsInName("Tempo 2 x 10 min"), { repeats: 2, minutes: 10 });
  assert.equal(effortsInName("Lake A"), null);
});

test("the plan's Kinomap workouts are picked from their names", () => {
  const picked = pickWorkouts(defaultKinomapWorkouts.rowing, { repeats: 6, minutes: 2 });
  assert.equal(picked.intervals, "Intervaly 6x2 min");
  assert.equal(picked.ftpTestShort, "FTP test 5 min");
  assert.equal(picked.ftpTest, "FTP test 20 min");
  assert.equal(picked.minimal, "Minimální jízda 10 min");
  assert.deepEqual(picked.extras, ["Pyramida 1-2-3-2-1 min", "Progrese 30 min", "Technika tempo záběrů 20 min"]);
  // Nine efforts planned and none made for them: none, and what to make.
  const missing = pickWorkouts(defaultKinomapWorkouts.rowing, { repeats: 9, minutes: 2 });
  assert.equal(missing.intervals, null);
  assert.equal(missing.wanted, "9x2 min");
  assert.deepEqual(pickWorkouts([], null), { intervals: null, ftpTestShort: null, ftpTest: null, minimal: null, extras: [], pyramid: null, progression: null, technique: null, wanted: null });
});

test("the FTP from the latest 20-minute test after the one typed is 95 % of its best 20 minutes", () => {
  const tests = [{ day: "2026-10-01", best20: 110 }, { day: "2026-11-21", best20: 124.4 }, { day: "2026-11-22", best20: null }];
  assert.deepEqual(ftpFromTest(tests, "2026-11-01"), { day: "2026-11-21", best20: 124, ftp: 118 });
  assert.equal(ftpFromTest(tests, "2026-11-21"), null);
  assert.equal(ftpFromTest([], null), null);
});

test("the extras are known by name and scored by their own measure", () => {
  assert.deepEqual(workoutFromName("Pyramida 1-2-3-2-1 min"), { kind: "extra", extra: "pyramid", minutes: 1 });
  assert.deepEqual(workoutFromName("Progrese 30 min"), { kind: "extra", extra: "progression", minutes: 30 });
  assert.equal(workoutFromName("Technika tempo záběrů 20 min").extra, "technique");
  const picked = pickWorkouts(defaultKinomapWorkouts.rowing, null);
  assert.deepEqual([picked.pyramid, picked.progression, picked.technique], ["Pyramida 1-2-3-2-1 min", "Progrese 30 min", "Technika tempo záběrů 20 min"]);
  // A pyramid on an interval day: five efforts of 1 to 3 minutes, no swap.
  const laps = [{ seconds: 600, power: 70 }, ...[1, 2, 3, 2, 1].flatMap((minutes) => [{ seconds: minutes * 60, power: 105 }, { seconds: minutes * 60, power: 60 }])];
  const pyramid = scoreWorkout({ minutes: 32, kind: "intervals", extra: "pyramid", heart: null, drift: null, laps }, plannedDay("intervals", plan));
  assert.equal(pyramid.as, "pyramid");
  assert.equal(pyramid.parts[0].done, 5);
  assert.equal(pyramid.swapped, false);
  // A progression on a long day: by its own 30 minutes, its build left out, no drift, no swap.
  const progression = scoreWorkout({ minutes: 33, kind: "steady", extra: "progression", extraMinutes: 30, heart: { inside: 1200, below: 0, above: 0 }, drift: 12, laps: [] }, plannedDay("long", plan));
  assert.equal(progression.as, "progression");
  assert.equal(progression.score, 100);
  assert.equal(progression.swapped, false);
});

test("an FTP test with laps by distance only is found by its minutes at the most power", () => {
  // 30 minutes at 90 W with 5 minutes at 140 W from the 18th, a little stronger in their second half; laps of 500 m.
  const seconds = Array.from({ length: 1800 }, (_, index) => index + 1);
  const power = seconds.map((second) => (second > 1080 && second <= 1380 ? (second <= 1230 ? 138 : 142) : 90));
  const laps = Array.from({ length: 12 }, (_, index) => ({ timerSeconds: 150, avgPower: 95, startMs: index * 150_000, endMs: (index + 1) * 150_000 }));
  const entry = { name: "Kinomap - FTP test 5 min", startMs: 0, laps, records: { seconds, power } };
  for (const minutes of [5, null]) {
    const part = testPart(entry, minutes);
    assert.equal(part.minutes, 5);
    assert.deepEqual(part.halves, [138, 142]);
  }
});
