import assert from "node:assert/strict";
import test from "node:test";
import { changesFor, emptyState, mergeStates, parseSync, syncText } from "../src/sync.js";

const hour = 3_600_000;
// An activity as the library keeps it, enough of it for merging.
const activity = (id, { day = 1, changedAt = 1000, name = id, source = "convert" } = {}) => ({
  id, name, source, sport: "rowing",
  startMs: Date.parse(`2026-10-${String(day).padStart(2, "0")}T07:00:00Z`),
  endMs: Date.parse(`2026-10-${String(day).padStart(2, "0")}T07:00:00Z`) + hour / 6,
  changedAt, records: { seconds: [0, 1] },
});
const state = (entries, deleted = {}, settings = null) => ({ entries, deleted, settings });

test("mergeStates keeps the activities of both devices", () => {
  const merged = mergeStates(state([activity("a", { day: 1 })]), state([activity("b", { day: 2 })]));
  assert.deepEqual(merged.entries.map((entry) => entry.id), ["b", "a"]);
});

test("mergeStates keeps the later change of one activity", () => {
  const merged = mergeStates(state([activity("a", { changedAt: 2000, name: "renamed here" })]), state([activity("a", { changedAt: 1000 })]));
  assert.equal(merged.entries[0].name, "renamed here");
  const other = mergeStates(state([activity("a", { changedAt: 1000 })]), state([activity("a", { changedAt: 3000, name: "renamed there" })]));
  assert.equal(other.entries[0].name, "renamed there");
});

test("mergeStates does not bring a deleted activity back, unless it changed after the deletion", () => {
  const gone = mergeStates(state([], { a: 2000 }), state([activity("a", { changedAt: 1000 })]));
  assert.deepEqual(gone.entries, []);
  assert.equal(gone.deleted.a, 2000);
  const back = mergeStates(state([], { a: 2000 }), state([activity("a", { changedAt: 3000 })]));
  assert.deepEqual(back.entries.map((entry) => entry.id), ["a"]);
});

test("mergeStates keeps one activity of a workout saved on two devices, and remembers the other as deleted", () => {
  const merged = mergeStates(state([activity("here", { source: "convert", changedAt: 1000 })]), state([activity("there", { source: "export", changedAt: 1500 })]));
  assert.deepEqual(merged.entries.map((entry) => entry.id), ["there"]);
  assert.ok(merged.deleted.here >= 1000);
  // Merging again changes nothing.
  assert.deepEqual(mergeStates(merged, merged).entries.map((entry) => entry.id), ["there"]);
});

test("mergeStates takes the settings changed last", () => {
  const here = { defaults: { fitness: { goal: "here" } }, changedAt: 1000 };
  const there = { defaults: { fitness: { goal: "there" } }, changedAt: 2000 };
  assert.equal(mergeStates(state([], {}, here), state([], {}, there)).settings, there);
  assert.equal(mergeStates(state([], {}, here), emptyState()).settings, here);
});

test("changesFor tells each side what to write and delete", () => {
  const here = state([activity("a", { changedAt: 1000 }), activity("c", { day: 3 })]);
  const there = state([activity("a", { changedAt: 2000 }), activity("b", { day: 2 })], { c: 5000 });
  const merged = mergeStates(here, there);
  const local = changesFor(here, merged);
  assert.deepEqual(local.write.map((entry) => entry.id).sort(), ["a", "b"]);
  assert.deepEqual(local.remove, ["c"]);
  assert.deepEqual(changesFor(there, merged).write, []);
});

test("a sync file reads back, dropping deletions over a year old", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const text = syncText(state([activity("a")], { old: now - 400 * 86_400_000, recent: now - 86_400_000 }, { defaults: {}, changedAt: 1 }), now);
  const back = parseSync(text);
  assert.deepEqual(back.entries.map((entry) => entry.id), ["a"]);
  assert.deepEqual(Object.keys(back.deleted), ["recent"]);
  assert.throws(() => parseSync("{}"));
});
