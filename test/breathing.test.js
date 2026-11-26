import { test } from "node:test";
import assert from "node:assert/strict";
import { breathKind, breathPhases } from "../src/breathing.js";
import { exercises } from "../src/recovery.js";
import { translations } from "../src/i18n.js";

test("every move with breath phases is a two-pose move with its spoken cue in both languages", () => {
  for (const [id, phases] of Object.entries(breathPhases)) {
    assert.ok(exercises[id], id);
    assert.equal(exercises[id].poses.length, 2, id);
    assert.ok(!exercises[id].hold, id);
    assert.equal(phases.length, 2, id);
    assert.ok(phases.every((phase) => phase === "in" || phase === "out"), id);
  }
  for (const [id, exercise] of Object.entries(exercises)) {
    if (!exercise.breath) continue;
    for (const language of Object.keys(translations)) assert.ok(translations[language][`recoveryBreath_${id}`], `${language} ${id}`);
  }
});

test("an exercise without its own cue gets one for its kind, the breathing exercises none", () => {
  assert.equal(breathKind("plank", exercises.plank), "brace");
  assert.equal(breathKind("butterfly", exercises.butterfly), "relax");
  assert.equal(breathKind("armSwings", exercises.armSwings), "flow");
  assert.equal(breathKind("resonant", exercises.resonant), null);
  assert.equal(breathKind("rollQuads", exercises.rollQuads), "roll");
  for (const language of Object.keys(translations)) for (const kind of ["flow", "relax", "brace", "roll"]) assert.ok(translations[language][`breathKind_${kind}`]);
});
