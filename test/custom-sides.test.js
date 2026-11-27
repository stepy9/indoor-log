import test from "node:test";
import assert from "node:assert/strict";
import { buildRoutine } from "../src/routines.js";

test("a custom set's exercise can keep one side, done alone, the other later in the set", () => {
  const set = buildRoutine({ style: "custom", custom: [{ id: "lungeReach", seconds: 60, side: 1 }, { id: "archToHeels" }, { id: "lungeReach", seconds: 60, side: 2 }] });
  const work = set.steps.filter((step) => step.type === "work");
  assert.deepEqual(work.map((step) => [step.id, step.side, Boolean(step.alone)]), [["lungeReach", 1, true], ["archToHeels", null, false], ["lungeReach", 2, true]]);
  // The right side alone has a full rest before it, not the short switch.
  const rests = set.steps.filter((step) => step.type === "rest").map((step) => step.seconds);
  assert.equal(rests[2], rests[0]);
  assert.deepEqual(set.items.map((item) => item.side ?? null), [1, null, 2]);
});

test("both sides stay the default, the right one after a short switch", () => {
  const set = buildRoutine({ style: "custom", custom: [{ id: "lungeReach" }] });
  assert.deepEqual(set.steps.filter((step) => step.type === "work").map((step) => step.side), [1, 2]);
  assert.ok(set.steps[2].seconds < set.steps[0].seconds);
});
