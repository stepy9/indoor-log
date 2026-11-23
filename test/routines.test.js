import assert from "node:assert/strict";
import test from "node:test";
import { exercises } from "../src/recovery.js";
import { translations } from "../src/i18n.js";
import { areasOf, balanceMoves, buildRoutine, byLength, logRoutine, pelvisMoves, routineAreas, routineMinutes, routineStyles, weakerExtra } from "../src/routines.js";

test("every set comes out near its length, from its own style's exercises", () => {
  for (const style of routineStyles.filter(byLength)) {
    for (const area of routineAreas) {
      for (const minutes of routineMinutes) {
        const set = buildRoutine({ style, area, minutes });
        const label = `${style} ${area} ${minutes}`;
        assert.ok(set.exercises.length >= 1, label);
        assert.ok(Math.abs(set.minutes - minutes) <= 2, `${label}: ${set.minutes}`);
        for (const id of set.exercises) assert.ok(exercises[id], `${label}: ${id}`);
        if (style !== "yin") for (const id of set.exercises) assert.equal(exercises[id].style, style, `${label}: ${id}`);
        const total = set.steps.reduce((sum, step) => sum + step.seconds, 0);
        assert.equal(set.minutes, Math.max(1, Math.round(total / 60)), label);
      }
    }
  }
});

test("an area's own exercises come first, and only they when there are enough", () => {
  const hips = buildRoutine({ style: "flexibility", area: "hips", minutes: 5 });
  for (const id of hips.exercises) assert.ok(areasOf(id).includes("hips"), id);
  // Too few for the time: the style's others join after them.
  const legs = buildRoutine({ style: "mobility", area: "legs", minutes: 20 });
  assert.equal(legs.steps.find((step) => step.type === "work").id, "lungeReach");
  assert.ok(legs.exercises.length > 1);
});

test("mobility moves 45 s, flexibility holds 20 s or a minute, yin holds for minutes and never repeats", () => {
  const work = (set) => set.steps.filter((step) => step.type === "work");
  assert.ok(work(buildRoutine({ style: "mobility" })).every((step) => step.seconds === 45 && !exercises[step.id].hold));
  assert.ok(work(buildRoutine({ style: "flexibility", aim: "keep" })).every((step) => step.seconds === 20 && exercises[step.id].hold));
  assert.ok(work(buildRoutine({ style: "flexibility", aim: "gain" })).every((step) => step.seconds === 60));
  const yin = buildRoutine({ style: "yin", minutes: 20 });
  assert.ok(work(yin).every((step) => step.seconds === 180));
  assert.equal(yin.rounds, 1);
  assert.equal(new Set(work(yin).filter((step) => step.side !== 2).map((step) => step.id)).size, work(yin).filter((step) => step.side !== 2).length);
});

test("a set going round again numbers its rounds for the player; two sides switch with a short pause", () => {
  const set = buildRoutine({ style: "flexibility", area: "all", minutes: 10 });
  assert.equal(set.rounds, 2);
  assert.ok(set.steps.every((step) => step.round === 1 || step.round === 2));
  const sides = set.steps.filter((step) => step.id === "triangle" || step.next === "triangle").slice(0, 4);
  assert.deepEqual(sides.map((step) => [step.type, step.side ?? null, step.seconds]), [["rest", null, 10], ["work", 1, 20], ["rest", null, 5], ["work", 2, 20]]);
});

test("the log keeps each day's sets and drops the old ones", () => {
  const log = logRoutine({ "2026-01-01": [{ style: "yin" }], "2026-11-20": [{ style: "mobility" }] }, "2026-11-20", { style: "yin", minutes: 10 });
  assert.deepEqual(Object.keys(log), ["2026-11-20"]);
  assert.equal(log["2026-11-20"].length, 2);
});

test("the new exercises have a name and a how-to in both languages", () => {
  for (const id of Object.keys(exercises).filter((key) => exercises[key].style)) {
    for (const language of ["cs", "en"]) {
      assert.ok(translations[language][`recovery_${id}`], `${language} ${id}`);
      assert.ok(translations[language][`recoveryHow_${id}`], `${language} how ${id}`);
    }
  }
  for (const key of ["routineTitle", ...routineStyles.map((style) => `routineStyle_${style}`), ...routineAreas.map((area) => `routineArea_${area}`)]) {
    assert.ok(translations.cs[key] && translations.en[key], key);
  }
});

test("stabilization takes each chain at its level, then the ball moves counted, or none without a ball", () => {
  const set = buildRoutine({ style: "stability", levels: { front: 2, back: 4, side: 1 } });
  assert.deepEqual(set.exercises, ["stabFront2", "stabBack4", "stabSide1", ...pelvisMoves]);
  const work = set.steps.filter((step) => step.type === "work");
  assert.deepEqual(work.filter((step) => step.id === "stabSide1").map((step) => [step.side, step.seconds]), [[1, 60], [2, 60]]);
  assert.ok(work.filter((step) => pelvisMoves.includes(step.id)).every((step) => step.reps > 0 && !step.seconds));
  assert.deepEqual(buildRoutine({ style: "stability", ball: false }).exercises, ["stabFront1", "stabBack1", "stabSide1"]);
  for (const chain of ["Front", "Back", "Side"]) for (let level = 1; level <= 4; level += 1) assert.equal(exercises[`stab${chain}${level}`].level, level);
});

test("balance does every move on the left, then the right, the weaker side more", () => {
  const set = buildRoutine({ style: "balance", weak: "right", reps: 12 });
  assert.deepEqual(set.exercises, balanceMoves);
  const chop = set.steps.filter((step) => step.type === "work" && step.id === "chop");
  assert.deepEqual(chop.map((step) => [step.side, step.reps]), [[1, 12], [2, 12 + weakerExtra]]);
  assert.ok(set.minutes >= 3 && set.minutes <= 12, String(set.minutes));
  for (const id of balanceMoves) assert.equal(exercises[id].gear, "dumbbell");
});

test("the plan keeps a set by weekday, a second tap on its style taking the day out", async () => {
  const { plannedRoutine, togglePlanDay, weekdayOf } = await import("../src/routines.js");
  assert.equal(weekdayOf("2026-11-23"), 0);
  assert.equal(weekdayOf("2026-11-29"), 6);
  let plan = togglePlanDay({}, 2, { style: "yin", minutes: 15 });
  assert.equal(plannedRoutine(plan, "2026-11-25").style, "yin");
  assert.equal(plannedRoutine(plan, "2026-11-24"), null);
  plan = togglePlanDay(plan, 2, { style: "stability" });
  assert.equal(plannedRoutine(plan, "2026-11-25").style, "stability");
  assert.deepEqual(togglePlanDay(plan, 2, { style: "stability" }), {});
});
