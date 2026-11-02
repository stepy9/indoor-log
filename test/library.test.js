import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { buildWorkout, decodeGarminFit, parseKinomap } from "../src/core.js";
import { backupText, entryFromFit, entryFromWorkout, entryId, parseBackup } from "../src/library.js";

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
