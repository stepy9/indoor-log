import assert from "node:assert/strict";
import test from "node:test";
import { afterWorkout, exerciseCatalog as exerciseCatalogOf, exercises, restSeconds, steps, switchSeconds } from "../src/recovery.js";

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

test("exerciseCatalog lists every exercise once per group with the sets it is in", async () => {
  const { exerciseCatalog } = await import("../src/recovery.js");
  const { warmup, stretch } = exerciseCatalog();
  assert.deepEqual(warmup.map((item) => item.id), ["catCow", "bridge", "armSwings", "hipHinge", "squat", "legSwings"]);
  assert.deepEqual(warmup.find((item) => item.id === "catCow").sets, ["short", "full"]);
  assert.equal(stretch.length, 12);
  assert.deepEqual(stretch.find((item) => item.id === "chest").sets, ["hard"]);
  assert.equal(new Set([...warmup, ...stretch].map((item) => item.id)).size, 17);
});

test("the warm-up's moves and cat–cow repeat, the other stretches are held", async () => {
  const { exerciseCatalog } = await import("../src/recovery.js");
  const { warmup, stretch } = exerciseCatalog();
  for (const { id } of warmup) assert.ok(!exercises[id].hold, id);
  assert.deepEqual(stretch.filter(({ id }) => !exercises[id].hold).map(({ id }) => id), ["catCow", "openBook"]);
});

test("every view's poses have the same parts as its first, so they animate, and its focus names a part", () => {
  for (const [id, exercise] of Object.entries(exercises)) {
    if (!exercise.poses) continue;
    const views = [{ poses: exercise.poses, focus: exercise.focus ?? [] }, ...(exercise.more ?? []).map((view) => ({ focus: exercise.focus ?? [], ...view }))];
    for (const [number, { poses, focus }] of views.entries()) {
      const [first, ...rest] = poses;
      const label = `${id} view ${number}`;
      assert.ok(poses.length >= 2, label);
      for (const pose of rest) {
        assert.equal(Boolean(pose.trunk), Boolean(first.trunk), label);
        assert.equal(pose.arms.length, first.arms.length, label);
        assert.equal(pose.legs.length, first.legs.length, label);
        pose.arms.forEach((arm, index) => assert.equal(arm.length, first.arms[index].length, label));
        pose.legs.forEach((leg, index) => assert.equal(leg.length, first.legs[index].length, label));
        assert.equal((pose.bands ?? []).length, (first.bands ?? []).length, label);
        assert.equal(Boolean(pose.strap), Boolean(first.strap), label);
      }
      for (const name of focus) {
        if (name.startsWith("band")) {
          assert.ok(first.bands?.[Number(name.slice(4))], `${label}: ${name}`);
          continue;
        }
        if (name === "chest" || name === "lat") {
          assert.ok(first.arms.length >= 2, `${label}: ${name}`);
          continue;
        }
        const [, kind, index] = name.match(/^(arm|leg|thigh|fore)(\d+)$/) ?? [null, "trunk"];
        if (kind === "trunk") assert.ok(first.trunk, `${label}: ${name}`);
        else assert.ok((kind === "arm" || kind === "fore" ? first.arms : first.legs)[index], `${label}: ${name}`);
      }
    }
  }
});

test("figureMarkup animates a view's poses, ghosts a move's start and draws far limbs behind the body", async () => {
  const { figureMarkup } = await import("../src/figure-svg.js");
  const { exerciseViews } = await import("../src/recovery.js");
  const [hip] = exerciseViews("hipFlexor");
  const held = figureMarkup(hip, { hold: true });
  assert.ok(held.includes("<animate"));
  assert.ok(!held.includes('class="ghost"'));
  assert.ok(held.indexOf("limb leg far") < held.indexOf('class="trunk"'));
  assert.ok(held.includes('class="mat pad"'));
  const [arms] = exerciseViews("armSwings");
  const moving = figureMarkup(arms);
  assert.ok(moving.includes('class="ghost"') && moving.includes("move-arrow"));
  assert.ok(!figureMarkup(arms, { frame: 1 }).includes("<animate"));
  assert.deepEqual(exerciseViews("chest").map((view) => view.key), ["side", "front"]);
});

test("the sets take their core every day and the rest in turn, each of the pool within a few days", () => {
  const days = Array.from({ length: 7 }, (_, index) => `2026-11-${String(10 + index).padStart(2, "0")}`);
  for (const benefit of ["recovery", "base", "threshold"]) {
    const plans = days.map((day) => afterWorkout({ benefit, seconds: 3600, day }));
    for (const plan of plans) {
      for (const id of ["catCow", "hamstring", "hipFlexor"]) assert.ok(plan.exercises.includes(id), `${benefit}: ${id}`);
      assert.ok(plan.minutes >= 3 && plan.minutes <= 12, `${benefit}: ${plan.minutes}`);
    }
    assert.ok(new Set(plans.map((plan) => plan.exercises.join())).size > 1, benefit);
    const seen = new Set(plans.flatMap((plan) => plan.exercises));
    const { stretch } = exerciseCatalogOf();
    for (const item of stretch.filter((entry) => entry.sets.includes(plans[0].set))) assert.ok(seen.has(item.id), `${benefit}: ${item.id}`);
  }
  // The same day gives the same set.
  assert.deepEqual(afterWorkout({ benefit: "base", seconds: 3600, day: "2026-11-19" }), afterWorkout({ benefit: "base", seconds: 3600, day: "2026-11-19" }));
});

test("a warm-up goes from the floor up and the short one varies by day", async () => {
  const { warmupBefore } = await import("../src/recovery.js");
  assert.equal(warmupBefore("intervals").exercises[0], "catCow");
  assert.equal(warmupBefore("intervals").exercises.at(-1), "legSwings");
  const shorts = ["2026-11-19", "2026-11-20", "2026-11-21"].map((day) => warmupBefore("usual", day).exercises);
  for (const list of shorts) assert.equal(list[0], "catCow");
  assert.ok(new Set(shorts.map((list) => list.join())).size > 1);
});
