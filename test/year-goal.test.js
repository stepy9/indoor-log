import assert from "node:assert/strict";
import test from "node:test";
import { goalFor, withGoal, yearLine, yearProgress } from "../src/year-goal.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.01, `${actual} ≠ ${expected}`);

test("yearProgress compares the km done this year with the share of the year gone by", () => {
  // 1 July 2026 is day 182 of 365.
  const result = yearProgress({ workouts: [{ day: "2026-03-01", km: 300 }, { day: "2026-07-01", km: 250 }, { day: "2025-12-31", km: 99 }], goal: 1000, today: "2026-07-01" });
  close(result.done, 550);
  close(result.expected, (1000 * 182) / 365);
  close(result.ahead, 550 - (1000 * 182) / 365);
  close(result.left, 450);
  assert.equal(result.daysLeft, 183);
  close(result.perDay, 450 / 183);
});

test("yearProgress shows a loss behind, nothing left once reached, and the leap year's days", () => {
  const behind = yearProgress({ workouts: [{ day: "2028-01-10", km: 5 }], goal: 366, today: "2028-01-31" });
  close(behind.ahead, 5 - 31);
  assert.equal(behind.daysLeft, 335);
  const reached = yearProgress({ workouts: [{ day: "2026-12-31", km: 1200 }], goal: 1000, today: "2026-12-31" });
  assert.equal(reached.left, 0);
  assert.equal(reached.perDay, 0);
  assert.equal(reached.daysLeft, 1);
});

test("yearProgress leaves out days after today and needs a goal", () => {
  close(yearProgress({ workouts: [{ day: "2026-11-25", km: 10 }], goal: 100, today: "2026-11-19" }).done, 0);
  assert.equal(yearProgress({ workouts: [], goal: 0, today: "2026-11-19" }), null);
});

test("yearLine adds the year's km up as steps to today, against the year's days", () => {
  const line = yearLine({ workouts: [{ day: "2026-01-03", km: 5 }, { day: "2026-01-03", km: 2 }, { day: "2026-01-10", km: 3 }, { day: "2025-12-31", km: 9 }, { day: "2026-02-01", km: 4 }], goal: 500, year: "2026", today: "2026-01-20" });
  assert.equal(line.days, 365);
  assert.equal(line.through, 20);
  assert.equal(line.total, 10);
  assert.deepEqual(line.points, [{ day: 0, km: 0 }, { day: 2, km: 0 }, { day: 3, km: 7 }, { day: 9, km: 7 }, { day: 10, km: 10 }, { day: 20, km: 10 }]);
});

test("yearLine counts a past year to its end and draws nothing ahead", () => {
  assert.equal(yearLine({ workouts: [], goal: 100, year: "2024", today: "2026-01-20" }).through, 366);
  const ahead = yearLine({ workouts: [], goal: 100, year: "2027", today: "2026-01-20" });
  assert.equal(ahead.through, 0);
  assert.deepEqual(ahead.points, [{ day: 0, km: 0 }]);
});

test("goalFor keeps each year's goal and carries the latest one into a year without its own", () => {
  const own = { yearlyGoals: { 2026: 190, 2028: 0 } };
  assert.equal(goalFor(own, "2026"), 190);
  assert.equal(goalFor(own, "2025"), 0);
  assert.equal(goalFor(own, "2027"), 190);
  // A year set to none stays without one, and so do the years after it.
  assert.equal(goalFor(own, "2028"), 0);
  assert.equal(goalFor(own, "2029"), 0);
  assert.equal(goalFor({}, "2026"), 0);
});

test("goalFor takes the first version's single goal as 2026's, and withGoal changes one year only", () => {
  const old = { yearlyKm: 365 };
  assert.equal(goalFor(old, "2026"), 365);
  assert.equal(goalFor(old, "2027"), 365);
  const next = { yearlyGoals: withGoal(old, "2027", 800) };
  assert.deepEqual(next.yearlyGoals, { 2026: 365, 2027: 800 });
  assert.equal(goalFor(next, "2026"), 365);
  assert.equal(goalFor(next, "2027"), 800);
  assert.deepEqual(withGoal(next, "2027", null), { 2026: 365, 2027: 0 });
});
