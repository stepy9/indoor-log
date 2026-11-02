import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildWorkout, decodeGarminFit, parseKinomap } from "../src/core.js";
import { backupText, entryFromFit, entryFromWorkout, entryId, mergeDuplicates, parseBackup, sameWorkout } from "../src/library.js";

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
  assert.deepEqual(parseBackup(backupText([entry])), [entry]);
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
