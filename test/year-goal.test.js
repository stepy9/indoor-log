import assert from "node:assert/strict";
import test from "node:test";
import { yearProgress } from "../src/year-goal.js";

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
