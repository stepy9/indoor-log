import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildWorkout, decodeGarminFit, parseKinomap } from "../src/core.js";
import { encodeFit as encodeFitBytes } from "../src/fit.js";
import { backupDue, backupFitName, findWorkout, fitCoverage, workoutFromEntry, backupText, entryFromFit, entryFromWorkout, entryId, mergeDuplicates, parseBackup, sameWorkout } from "../src/library.js";

const folder = path.resolve("test", "fixtures", "rowing");

test("a converted workout becomes a library entry with its records as columns", () => {
  const workout = buildWorkout(parseKinomap(fs.readFileSync(path.join(folder, "activity.tcx"), "utf8")), null, { activityName: "Row" });
  const entry = entryFromWorkout(workout, { savedAt: 1 });
  assert.equal(entry.id, entryId("rowing", workout.startMs));
  assert.equal(entry.source, "convert");
  assert.equal(entry.name, "Row");
  assert.equal(entry.records.seconds.length, workout.records.length);
  assert.equal(entry.records.seconds[0], 0);
  assert.equal(entry.records.power.length, workout.records.length);
  assert.equal(entry.laps.length, workout.laps.length);
  assert.equal(entry.summary.avgPower, workout.summary.avgPower);
});

test("a watch FIT becomes a library entry measured from its first distance", () => {
  const fit = decodeGarminFit(fs.readFileSync(path.join(folder, "watch.fit")));
  const entry = entryFromFit(fit, { name: "watch", savedAt: 1 });
  assert.equal(entry.source, "fit");
  assert.equal(entry.records.seconds.length, fit.records.length);
  assert.ok(entry.summary.timerSeconds > 0);
  assert.ok(entry.records.distance.filter((value) => value != null).every((value) => value >= 0));
});

test("a backup reads back its entries and refuses other files", () => {
  const entry = { id: "rowing-1", records: { seconds: [0, 1] } };
  const settings = { defaults: { trainers: [{ id: "t1", name: "Concept2", sport: "rowing", levels: 10, defaultLevel: 5 }] }, exports: ["a"] };
  assert.deepEqual(parseBackup(backupText([entry], settings)), { entries: [entry], settings });
  assert.deepEqual(parseBackup(JSON.stringify({ format: "kinomap-fit-library", version: 1, entries: [entry] })), { entries: [entry], settings: null });
  assert.throws(() => parseBackup(JSON.stringify({ entries: [] })));
});

test("the same workout saved twice keeps the fuller recording and a hand-picked kind", () => {
  const entry = (id, source, startMs, extra = {}) => ({ id, source, sport: "rowing", startMs, endMs: startMs + 600_000, ...extra });
  const watch = entry("watch", "fit", 1_000_000, { kind: "steady" });
  const kinomap = entry("kinomap", "convert", 1_007_000);
  const other = entry("other", "convert", 9_000_000);
  const { save, remove, count } = mergeDuplicates([watch, other], [kinomap]);
  assert.deepEqual(save.map((item) => item.id), ["kinomap"]);
  assert.equal(save[0].kind, "steady");
  assert.deepEqual(remove, ["watch"]);
  assert.equal(count, 2);
  // A watch FIT added after the Kinomap one is left out.
  assert.deepEqual(mergeDuplicates([kinomap], [{ ...watch, kind: undefined }]).save, []);
  // Workouts far apart or of another sport are not duplicates.
  assert.ok(!sameWorkout(kinomap, other));
  assert.ok(!sameWorkout(kinomap, { ...kinomap, sport: "cycling" }));
});

test("a FIT exported here keeps its name and lap types and outranks the Kinomap file", () => {
  const kinomap = parseKinomap(fs.readFileSync(path.join(folder, "activity.tcx"), "utf8"));
  const workout = buildWorkout(kinomap, null, {
    activityName: "Stripes", lapDistanceMeters: "intervals",
    segments: [
      { startMs: kinomap.records[0].timeMs, intensity: "warmup" },
      { startMs: kinomap.records[0].timeMs + 60_000, intensity: "active" },
      { startMs: kinomap.records[0].timeMs + 120_000, intensity: "recovery" },
      { startMs: kinomap.records[0].timeMs + 180_000, intensity: "active" },
      { startMs: kinomap.records[0].timeMs + 240_000, intensity: "recovery" },
    ],
  });
  const exported = entryFromFit(decodeGarminFit(workout.fitBytes), { name: "file name" });
  assert.equal(exported.source, "export");
  assert.equal(exported.name, "Stripes");
  assert.deepEqual(exported.laps.map((lap) => lap.intensity).slice(0, 5), ["warmup", "active", "recovery", "active", "recovery"]);
  const converted = entryFromWorkout(buildWorkout(kinomap, null, {}));
  assert.deepEqual(mergeDuplicates([converted], [exported]).save.map((entry) => entry.source), ["export"]);
  assert.deepEqual(mergeDuplicates([exported], [converted]).save, []);
});

test("interval laps make an interval workout even when every lap is work, and the latest export wins", async () => {
  const { workoutKind } = await import("../src/analysis.js");
  const kinomap = parseKinomap(fs.readFileSync(path.join(folder, "activity.tcx"), "utf8"));
  const start = kinomap.records[0].timeMs;
  const fartlek = buildWorkout(kinomap, null, {
    lapDistanceMeters: "intervals",
    segments: [0, 60, 120, 180].map((second, index) => ({ startMs: start + second * 1000, intensity: "active", targetType: "cadence", target: index % 2 ? 24 : 20 })),
  });
  const saved = entryFromWorkout(fartlek, { exported: true });
  assert.equal(workoutKind(saved), "intervals");
  const fromFit = entryFromFit(decodeGarminFit(fartlek.fitBytes));
  assert.equal(workoutKind(fromFit), "intervals");
  // Converting again after the FIT was added replaces it.
  assert.deepEqual(mergeDuplicates([fromFit], [saved]).save, [saved]);
});

test("a name typed by hand outlives the recording it was typed on", () => {
  const entry = (id, source, extra = {}) => ({ id, source, sport: "rowing", startMs: 0, endMs: 600_000, name: "Kinomap - _ Easy", ...extra });
  const renamed = entry("old", "convert", { name: "Kinomap - Easy", renamed: true });
  const { save } = mergeDuplicates([renamed], [entry("new", "export")]);
  assert.equal(save[0].name, "Kinomap - Easy");
  assert.equal(save[0].source, "export");
});

test("a plan's resistance lands on the laps it covers, and hand-set resistance outlives a newer recording", async () => {
  const { lapLevelsFromPlan } = await import("../src/library.js");
  const { parseKinomapPlan } = await import("../src/core.js");
  const start = 1_000_000;
  const laps = [0, 69, 101, 161].map((second) => ({ startMs: start + second * 1000 }));
  const steps = parseKinomapPlan("00:07  70%  20rpm  A\n01:09  80%  24rpm  A\n01:41  70%  20rpm  A\n02:41  0%  0rpm  CD", start);
  const toLevel = (percent) => (percent > 0 ? Math.round((percent / 100) * 15) : null);
  // The first lap starts before the plan's first step and the last one on a step without resistance.
  assert.deepEqual(lapLevelsFromPlan(laps, steps, toLevel).map((lap) => lap.resistance), [undefined, 12, 11, undefined]);

  const entry = (id, source, extra = {}) => ({ id, source, sport: "rowing", startMs: 0, endMs: 600_000, name: "A", laps: [{}, {}], ...extra });
  const set = entry("old", "fit", { trainer: "Woodrower", resistance: 6, laps: [{ resistance: 11 }, { resistance: 12 }] });
  const { save } = mergeDuplicates([set], [entry("new", "export")]);
  assert.equal(save[0].id, "new");
  assert.equal(save[0].trainer, "Woodrower");
  assert.equal(save[0].resistance, 6);
  assert.deepEqual(save[0].laps.map((lap) => lap.resistance), [11, 12]);
});

test("a backup is due with activities and none made, or with new ones since one over 30 days old", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const day = 86_400_000;
  assert.equal(backupDue(2, null, now), false);
  assert.equal(backupDue(3, null, now), true);
  assert.equal(backupDue(20, { at: now - 40 * day, count: 20 }, now), false);
  assert.equal(backupDue(21, { at: now - 40 * day, count: 20 }, now), true);
  assert.equal(backupDue(21, { at: now - 10 * day, count: 20 }, now), false);
});

test("a FIT rebuilt from a library entry reads back as the same activity", () => {
  const workout = buildWorkout(parseKinomap(fs.readFileSync(path.join(folder, "activity.tcx"), "utf8")), null, { activityName: "Row" });
  const entry = entryFromWorkout(workout);
  const rebuilt = workoutFromEntry(entry);
  assert.equal(rebuilt.records.length, workout.records.length);
  const bytes = encodeFitBytes(rebuilt.records, rebuilt.summary, rebuilt.laps, rebuilt.startMs, rebuilt.endMs, "Europe/Prague", rebuilt.activityName, rebuilt.sport, rebuilt.subSport);
  const back = entryFromFit(decodeGarminFit(bytes), { name: "Row" });
  assert.ok(sameWorkout(back, entry));
  assert.equal(back.laps.length, entry.laps.length);
  assert.ok(Math.abs(back.summary.distance - entry.summary.distance) < 1);
});

test("FIT backup coverage, matching and names", () => {
  const a = { id: "a", sport: "rowing", startMs: 0, endMs: 600_000, fitBackup: "export" };
  const b = { id: "b", sport: "rowing", startMs: 86_400_000, endMs: 86_400_000 + 600_000, fitBackup: "rebuilt" };
  const c = { id: "c", sport: "cycling", startMs: 0, endMs: 600_000 };
  const coverage = fitCoverage([a, b, c]);
  assert.deepEqual([coverage.total, coverage.done, coverage.rebuilt, coverage.missing.map((e) => e.id)], [3, 2, 1, ["c"]]);
  assert.equal(findWorkout([a, b, c], { sport: "cycling", startMs: 30_000, endMs: 590_000 }), c);
  assert.equal(findWorkout([a, b, c], { sport: "running", startMs: 0, endMs: 600_000 }), null);
  assert.match(backupFitName(new Date(2026, 10, 4, 7, 5).getTime(), "Row.fit"), /^2026-11-04 0705 Row\.fit$/);
  assert.equal(backupFitName(0, "2026-11-04 0705 Row.fit"), "2026-11-04 0705 Row.fit");
  // A re-recording keeps the mark of the one it replaces.
  const { save } = mergeDuplicates([{ ...a, source: "convert" }], [{ ...a, id: "a2", source: "merge", fitBackup: undefined }]);
  assert.equal(save[0].fitBackup, "export");
});
