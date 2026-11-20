import assert from "node:assert/strict";
import test from "node:test";
import { changesFor, mergeSettings, emptyState, mergeStates, NewerSyncError, parseSettingsFile, parseSync, settingsText, syncSummary, syncText } from "../src/sync.js";

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

test("mergeStates takes each setting changed last", () => {
  const here = { defaults: { fitness: { goal: "here" }, trainers: [{ id: "a" }] }, changedAt: { fitness: 1000, trainers: 3000 } };
  const there = { defaults: { fitness: { goal: "there" }, trainers: [{ id: "b" }] }, changedAt: { fitness: 2000, trainers: 500 } };
  assert.deepEqual(mergeStates(state([], {}, here), state([], {}, there)).settings, {
    defaults: { fitness: { goal: "there" }, trainers: [{ id: "a" }] },
    changedAt: { fitness: 2000, trainers: 3000 },
  });
  assert.deepEqual(mergeStates(state([], {}, here), emptyState()).settings, here);
});

test("a blank setting never wipes a filled one, and an old single time counts for each key", () => {
  const filled = { defaults: { fitness: { weightHistory: [{ kg: 78 }] }, trainers: [{ id: "a" }] }, changedAt: 0 };
  const empty = { defaults: { fitness: {}, trainers: [] }, changedAt: { fitness: 9000, trainers: 9000 } };
  const merged = mergeStates(state([], {}, filled), state([], {}, empty)).settings;
  assert.deepEqual(merged.defaults, filled.defaults);
  assert.equal(changesFor(state([], {}, empty), { entries: [], settings: merged }).settings, true);
  assert.equal(changesFor(state([], {}, merged), { entries: [], settings: merged }).settings, false);
});

test("the excuses emptied later win over filled ones, as removing the last is on purpose", () => {
  const filled = { defaults: { trainingExcuses: { "2026-11-19": { reason: "rest" } } }, changedAt: { trainingExcuses: 1000 } };
  const emptied = { defaults: { trainingExcuses: {} }, changedAt: { trainingExcuses: 2000 } };
  assert.deepEqual(mergeStates(state([], {}, filled), state([], {}, emptied)).settings.defaults.trainingExcuses, {});
  assert.deepEqual(mergeStates(state([], {}, emptied), state([], {}, filled)).settings.defaults.trainingExcuses, {});
  // Filled later than emptied: filled.
  const refilled = { defaults: { trainingExcuses: { "2026-11-20": { reason: "work" } } }, changedAt: { trainingExcuses: 3000 } };
  assert.deepEqual(Object.keys(mergeStates(state([], {}, emptied), state([], {}, refilled)).settings.defaults.trainingExcuses), ["2026-11-20"]);
});

test("the strength and warm-up logs keep the days done on either device", () => {
  const phone = { defaults: { strengthLog: { "2026-11-19": ["squat"] } }, changedAt: { strengthLog: 1000 } };
  const desktop = { defaults: { strengthLog: { "2026-11-16": ["plank"] } }, changedAt: { strengthLog: 2000 } };
  const merged = mergeStates(state([], {}, phone), state([], {}, desktop)).settings.defaults.strengthLog;
  assert.deepEqual(Object.keys(merged).sort(), ["2026-11-16", "2026-11-19"]);
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

test("the settings go in their own file, and an old shared file still gives them", () => {
  const settings = { defaults: { fitness: { restHeartRate: 44 } }, changedAt: { fitness: 5 } };
  assert.equal(JSON.parse(syncText(state([], {}, settings))).settings, undefined);
  assert.deepEqual(parseSettingsFile(settingsText(settings)), settings);
  const old = JSON.stringify({ format: "indoor-log-sync", version: 1, entries: [], deleted: {}, settings: { defaults: {}, changedAt: 3 } });
  assert.deepEqual(parseSync(old).settings, { defaults: {}, changedAt: 3 });
});

test("a file from a newer version of the app is not read", () => {
  assert.throws(() => parseSync(JSON.stringify({ format: "indoor-log-sync", version: 99, entries: [] })), NewerSyncError);
  assert.throws(() => parseSettingsFile(JSON.stringify({ format: "indoor-log-settings", version: 99, settings: {} })), NewerSyncError);
});

test("a sync's summary counts the activities and trainers and tells which settings are set", () => {
  const settings = { defaults: { fitness: { restHeartRate: 44, weightHistory: [{ from: null, kg: 78 }], sports: { rowing: { maxHeartRate: null } } }, trainers: [{ id: "a" }] }, changedAt: 1 };
  assert.deepEqual(syncSummary(state([activity("a"), activity("b")], {}, settings)), { activities: 2, trainers: 1, weight: true, heartRate: true, thresholds: false });
});

test("a sport's plan without a history is not wiped by the other device saving its weight", () => {
  const plan = { longPerWeek: 2, intervalsPerWeek: 1 };
  const desktop = { defaults: { fitness: { sports: { rowing: { plan } } } }, changedAt: { fitness: 1000 } };
  const phone = { defaults: { fitness: { history: { weight: [{ from: "2026-11-18", value: 80, at: 2000 }] }, sports: { rowing: {} } } }, changedAt: { fitness: 2000 } };
  for (const merged of [mergeSettings(desktop, phone), mergeSettings(phone, desktop)]) {
    assert.deepEqual(merged.defaults.fitness.sports.rowing.plan, plan);
    assert.equal(merged.defaults.fitness.history.weight[0].value, 80);
  }
});

test("a plan removed through its history stays removed", () => {
  const plan = { longPerWeek: 2 };
  const older = { defaults: { fitness: { sports: { rowing: { plan, history: { plan: [{ from: "0000-00-00", value: null, at: 1 }, { from: "2026-11-02", value: plan, at: 1000 }] } } } } }, changedAt: { fitness: 1000 } };
  const newer = { defaults: { fitness: { sports: { rowing: { plan: null, history: { plan: [{ from: "0000-00-00", value: null, at: 1 }, { from: "2026-11-02", value: plan, at: 1000 }, { from: "2026-11-16", value: null, at: 2000 }] } } } } }, changedAt: { fitness: 2000 } };
  assert.equal(mergeSettings(older, newer).defaults.fitness.sports.rowing.plan, null);
});
