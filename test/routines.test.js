import assert from "node:assert/strict";
import test from "node:test";
import { exercises } from "../src/recovery.js";
import { translations } from "../src/i18n.js";
import { areasOf, balanceMoves, buildRoutine, byLength, extrasOf, logRoutine, pelvisMoves, routineAreas, routineMinutes, routineStyles, weakerExtra } from "../src/routines.js";

test("every set comes out near its length, from its own style's exercises", () => {
  for (const style of routineStyles.filter(byLength)) {
    for (const area of routineAreas) {
      for (const minutes of routineMinutes) {
        const set = buildRoutine({ style, area, minutes });
        const label = `${style} ${area} ${minutes}`;
        assert.ok(set.exercises.length >= 1, label);
        assert.ok(Math.abs(set.minutes - minutes) <= 2, `${label}: ${set.minutes}`);
        for (const id of set.exercises) assert.ok(exercises[id], `${label}: ${id}`);
        if (style !== "yin") for (const id of set.exercises) assert.ok(exercises[id].style === style || extrasOf(style).includes(id), `${label}: ${id}`);
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

test("the warm-up's moves and the stretches fill in where the book has few for an area", () => {
  const legs = buildRoutine({ style: "mobility", area: "legs", minutes: 10 });
  assert.equal(legs.exercises[0], "lungeReach");
  assert.ok(legs.exercises.some((id) => ["hipHinge", "squat", "legSwings"].includes(id)), legs.exercises.join());
  assert.ok(legs.exercises.every((id) => areasOf(id).includes("legs")), legs.exercises.join());
  const shoulders = buildRoutine({ style: "flexibility", area: "shoulders", minutes: 20, aim: "gain" });
  assert.ok(shoulders.exercises.includes("chest") || shoulders.exercises.includes("latStretch"), shoulders.exercises.join());
  // The whole body keeps to the book.
  assert.ok(buildRoutine({ style: "flexibility", minutes: 15 }).exercises.every((id) => exercises[id].style === "flexibility"));
});

test("a set by hand runs its exercises in the order given, each with its own time or repeats", async () => {
  const { exerciseGroups } = await import("../src/routines.js");
  const set = buildRoutine({ style: "custom", custom: [{ id: "swan", seconds: 120 }, { id: "ballLower", reps: 12 }, { id: "nothing" }] });
  assert.deepEqual(set.exercises, ["swan", "ballLower"]);
  assert.deepEqual(set.steps.filter((step) => step.type === "work").map((step) => [step.id, step.side, step.seconds ?? step.reps]), [["swan", 1, 120], ["swan", 2, 120], ["ballLower", null, 12]]);
  const groups = exerciseGroups();
  const all = groups.flatMap((group) => group.ids);
  assert.equal(new Set(all).size, all.length);
  assert.equal(all.length, Object.keys(exercises).length);
});

test("a saved set holds its weekdays by its id, and taking it out clears them", async () => {
  const { togglePlanDay, withoutSaved } = await import("../src/routines.js");
  let plan = togglePlanDay({}, 1, { style: "saved", saved: "a" });
  plan = togglePlanDay(plan, 3, { style: "saved", saved: "a" });
  // Another saved set on the same day takes it over; the same one again takes it out.
  plan = togglePlanDay(plan, 3, { style: "saved", saved: "b" });
  assert.deepEqual(plan, { 1: { style: "saved", saved: "a" }, 3: { style: "saved", saved: "b" } });
  assert.deepEqual(togglePlanDay(plan, 1, { style: "saved", saved: "a" }), { 3: { style: "saved", saved: "b" } });
  assert.deepEqual(withoutSaved({ ...plan, 5: { style: "yin" } }, "b"), { 1: { style: "saved", saved: "a" }, 5: { style: "yin" } });
});

test("with equipment: a tool's exercises fill the length, and what is not at home is left out of the catalogue", async () => {
  const { exerciseGroups, gearStyleTools, hasGear, toolMoves } = await import("../src/routines.js");
  for (const tool of gearStyleTools) {
    assert.ok(toolMoves(tool).length >= 4, tool);
    const set = buildRoutine({ style: "gear", tool, minutes: 10 });
    assert.ok(Math.abs(set.minutes - 10) <= 2, `${tool}: ${set.minutes}`);
    assert.ok(set.exercises.every((id) => exercises[id].gear === tool), tool);
  }
  assert.equal(buildRoutine({ style: "gear", tool: null }).steps.length, 0);
  const groups = exerciseGroups(["band"]);
  const ids = groups.flatMap((group) => group.ids);
  assert.ok(ids.includes("bandRow") && !ids.includes("rollQuads") && !ids.includes("chop") && !ids.includes("ballLower"));
  assert.ok(!groups.some((group) => group.group === "balance" || group.group === "roller"));
  assert.equal(hasGear("catCow", []), true);
});

test("a chain's level goes up after two easy minutes in a row at it, down after two hard ones, and stays for 'just right'", async () => {
  const { nextLevel, recordFeel } = await import("../src/routines.js");
  let log = recordFeel({}, "front", "2026-11-20", 2, "easy");
  assert.deepEqual(nextLevel(log.front, 2), { level: 2, change: 0 });
  log = recordFeel(log, "front", "2026-11-22", 2, "easy");
  assert.deepEqual(nextLevel(log.front, 2), { level: 3, change: 1 });
  // Done, but struggling: no rise however many times.
  const struggled = ["2026-11-20", "2026-11-22", "2026-11-24"].reduce((acc, day) => recordFeel(acc, "back", day, 1, "ok"), {});
  assert.deepEqual(nextLevel(struggled.back, 1), { level: 1, change: 0 });
  // One easy after a just-right is not two in a row.
  assert.deepEqual(nextLevel(recordFeel(struggled, "back", "2026-11-26", 1, "easy").back, 1).change, 0);
  const hard = recordFeel(recordFeel({}, "side", "2026-11-20", 3, "hard"), "side", "2026-11-22", 3, "hard");
  assert.deepEqual(nextLevel(hard.side, 3), { level: 2, change: -1 });
  // Answers at a level left behind do not count at the new one; a day answered again replaces its answer.
  assert.equal(nextLevel(log.front, 3).change, 0);
  assert.equal(recordFeel(log, "front", "2026-11-22", 2, "ok").front.at(-1).feel, "ok");
  assert.deepEqual(nextLevel(recordFeel({}, "front", "1", 4, "easy").front.concat({ day: "2", level: 4, feel: "easy" }), 4).change, 0);
});

test("every exercise from the book has its video", async () => {
  const { videoOf } = await import("../src/book-videos.js");
  const books = Object.values(exercises).filter((exercise) => exercise.book).map((exercise) => exercise.book);
  assert.equal(books.length, 32);
  for (const book of books) assert.ok(videoOf(book), book);
});
