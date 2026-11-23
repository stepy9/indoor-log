import assert from "node:assert/strict";
import test from "node:test";
import { exercises } from "../src/recovery.js";
import { translations } from "../src/i18n.js";
import { areasOf, buildRoutine, logRoutine, routineAreas, routineMinutes, routineStyles } from "../src/routines.js";

test("every set comes out near its length, from its own style's exercises", () => {
  for (const style of routineStyles) {
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
