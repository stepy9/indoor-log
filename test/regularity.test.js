import assert from "node:assert/strict";
import test from "node:test";
import { regularity } from "../src/regularity.js";

// Thursday 19 November 2026; its week starts on Monday the 16th.
const today = "2026-11-19";

test("regularity counts the last eight weeks from Monday, the running one last", () => {
  const result = regularity({ workouts: [{ day: "2026-11-17", stretched: true }, { day: "2026-09-27", stretched: true }], strengthDays: [], today });
  assert.equal(result.weeks.length, 8);
  assert.equal(result.weeks[0].monday, "2026-09-28");
  assert.equal(result.weeks.at(-1).monday, "2026-11-16");
  assert.equal(result.weeks.at(-1).running, true);
  // 27 September falls in the week before the first one.
  assert.equal(result.totals.workouts, 1);
});

test("regularity keeps a week with workouts, most of them stretched and strength twice", () => {
  const result = regularity({
    workouts: [
      { day: "2026-11-09", stretched: true }, { day: "2026-11-11", stretched: false },
      { day: "2026-10-26", stretched: true },
      { day: "2026-11-02", stretched: false }, { day: "2026-11-04", stretched: false }, { day: "2026-11-06", stretched: true },
    ],
    strengthDays: ["2026-11-10", "2026-11-12", "2026-11-03", "2026-11-05"],
    today,
  });
  const [before, last] = result.weeks.slice(-3, -1);
  assert.deepEqual([before.workouts, before.stretched, before.strength, before.kept], [3, 1, 2, false]);
  assert.deepEqual([last.workouts, last.stretched, last.strength, last.kept], [2, 1, 2, true]);
  assert.equal(result.totals.stretched, 3);
  assert.equal(result.totals.strength, 4);
});

test("regularity's streak runs back from the last week, the running week counted once kept", () => {
  const workouts = [];
  const strengthDays = [];
  for (const monday of ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]) {
    workouts.push({ day: monday, stretched: true });
    strengthDays.push(monday, monday.replace(/\d\d$/, (day) => String(Number(day) + 2).padStart(2, "0")));
  }
  assert.equal(regularity({ workouts, strengthDays, today }).streak, 4);
  // The running week not kept yet leaves the run as it was.
  assert.equal(regularity({ workouts, strengthDays: strengthDays.slice(0, -1), today }).streak, 3);
  // Strength done the same day twice counts once.
  assert.equal(regularity({ workouts, strengthDays: [...strengthDays.slice(0, -1), "2026-11-16"], today }).streak, 3);
});

test("regularity leaves out days after today", () => {
  const result = regularity({ workouts: [{ day: "2026-11-21", stretched: true }], strengthDays: ["2026-11-22"], today });
  assert.equal(result.totals.workouts, 0);
  assert.equal(result.totals.strength, 0);
});

test("regularity counts stretching and strength only from the first time each was done", () => {
  const result = regularity({
    workouts: [{ day: "2026-10-20", stretched: false }, { day: "2026-11-03", stretched: false }, { day: "2026-11-05", stretched: true }, { day: "2026-11-10", stretched: true }],
    strengthDays: ["2026-11-11", "2026-11-12"],
    today,
  });
  const week = (monday) => result.weeks.find((item) => item.monday === monday);
  // Before either: judged by the workouts alone.
  assert.deepEqual([week("2026-10-19").stretchTracked, week("2026-10-19").strengthTracked, week("2026-10-19").kept], [false, false, true]);
  // Stretching began on the 5th: of that week only the workouts from then count; strength not yet.
  assert.deepEqual([week("2026-11-02").stretchable, week("2026-11-02").kept], [1, true]);
  assert.equal(week("2026-11-09").strengthTracked, true);
  assert.equal(week("2026-11-09").kept, true);
  assert.equal(result.totals.stretchable, 2);
  assert.equal(result.totals.strengthGoal, 4);
  // The running week needs both now: a workout, stretched, and strength twice.
  assert.equal(week("2026-11-16").kept, false);
  assert.equal(result.streak, 2);
});

test("regularity without any stretching or strength yet judges the past by the workouts", () => {
  const result = regularity({ workouts: [{ day: "2026-11-10", stretched: false }], strengthDays: [], today });
  assert.equal(result.weeks.at(-2).kept, true);
  assert.equal(result.weeks.at(-1).stretchTracked, true);
});
