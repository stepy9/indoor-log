import assert from "node:assert/strict";
import test from "node:test";
import { afterWorkout, exercises, restSeconds, steps, switchSeconds } from "../src/recovery.js";

test("afterWorkout picks the set by the benefit and the length", () => {
  assert.equal(afterWorkout({ benefit: "recovery", seconds: 3600 }).set, "easy");
  assert.equal(afterWorkout({ benefit: "base", seconds: 20 * 60 }).set, "easy");
  assert.equal(afterWorkout({ benefit: "base", seconds: 60 * 60 }).set, "long");
  assert.equal(afterWorkout({ benefit: null, seconds: 50 * 60 }).set, "long");
  const hard = afterWorkout({ benefit: "vo2max", seconds: 30 * 60 });
  assert.equal(hard.set, "hard");
  assert.equal(hard.cooldown, true);
});

test("afterWorkout's sets take a few minutes and name known exercises", () => {
  for (const benefit of ["recovery", "base", "threshold"]) {
    const plan = afterWorkout({ benefit, seconds: 3600 });
    assert.ok(plan.minutes >= 3 && plan.minutes <= 12, `${benefit}: ${plan.minutes}`);
    for (const id of plan.exercises) assert.ok(exercises[id], id);
  }
});

test("steps rest before each exercise and between its sides", () => {
  assert.deepEqual(steps(["catCow", "hamstring"]), [
    { type: "rest", seconds: restSeconds, next: "catCow" },
    { type: "work", id: "catCow", side: null, seconds: 60 },
    { type: "rest", seconds: restSeconds, next: "hamstring" },
    { type: "work", id: "hamstring", side: 1, seconds: 30 },
    { type: "rest", seconds: switchSeconds, next: "hamstring" },
    { type: "work", id: "hamstring", side: 2, seconds: 30 },
  ]);
});

test("each figure's poses have the same parts, so they animate", () => {
  for (const [id, { poses, focus = [] }] of Object.entries(exercises)) {
    if (!poses) continue;
    const [a, b] = poses;
    assert.equal(a.arms.length, b.arms.length, id);
    assert.equal(a.legs.length, b.legs.length, id);
    a.legs.forEach((leg, index) => assert.equal(leg.length, b.legs[index].length, id));
    a.arms.forEach((arm, index) => assert.equal(arm.length, b.arms[index].length, id));
    for (const name of focus) {
      const [, kind, index] = name.match(/^(arm|leg|thigh)(\d+)$/) ?? [null, "trunk"];
      if (kind !== "trunk") assert.ok((kind === "arm" ? a.arms : a.legs)[index], `${id}: ${name}`);
    }
  }
});

test("warmupBefore gives the full set before a hard day and the short one before a steady row", async () => {
  const { warmupBefore, warmupRest } = await import("../src/recovery.js");
  const hard = warmupBefore("intervals");
  assert.equal(hard.set, "full");
  assert.equal(hard.onRower, 5);
  assert.equal(warmupBefore("goal").set, "full");
  const easy = warmupBefore("usual");
  assert.equal(easy.set, "short");
  assert.equal(easy.onRower, 0);
  for (const plan of [hard, easy]) {
    assert.ok(plan.minutes >= 1 && plan.minutes <= 6, String(plan.minutes));
    for (const id of plan.exercises) assert.ok(exercises[id], id);
  }
  // The warm-up's pauses are short and an exercise takes the set's own time.
  const list = steps(["catCow"], { rest: warmupRest, seconds: { catCow: 30 } });
  assert.deepEqual(list, [{ type: "rest", seconds: warmupRest, next: "catCow" }, { type: "work", id: "catCow", side: null, seconds: 30 }]);
});
