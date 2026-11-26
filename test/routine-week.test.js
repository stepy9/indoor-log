import { test } from "node:test";
import assert from "node:assert/strict";
import { morningSet, weekCount } from "../src/routines.js";

test("weekCount counts this week's days a saved set was done, out of its planned weekdays", () => {
  const entry = { id: "morning", name: "Ranní mobilita" };
  const plan = { 0: { style: "saved", saved: "morning" }, 2: { style: "saved", saved: "morning" }, 4: { style: "yin" } };
  // 2026-11-23 is a Monday; the 22nd belongs to the week before, the 25th had another set.
  const log = { "2026-11-22": [{ name: "Ranní mobilita" }], "2026-11-23": [{ name: "Ranní mobilita" }], "2026-11-25": [{ style: "yin" }], "2026-11-26": [{ name: "Ranní mobilita" }, { name: "Ranní mobilita" }] };
  assert.deepEqual(weekCount(log, plan, entry, "2026-11-26"), { done: 2, target: 2 });
  assert.deepEqual(weekCount({}, {}, entry, "2026-11-26"), { done: 0, target: 0 });
});

test("the morning mobility runs the book's dynamic moves, then two stretches", () => {
  const set = morningSet();
  assert.deepEqual(set.exercises, ["archToHeels", "forearmOpen", "hipSwitch", "reverseTable", "lungeReach", "downDog", "lungeTwist"]);
  assert.ok(set.minutes >= 7 && set.minutes <= 12, `${set.minutes} min`);
});
