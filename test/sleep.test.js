import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSleep, sleepOn, sleepParts } from "../src/sleep.js";

test("the sleep is read as typed, in hours and minutes or in hours", () => {
  assert.equal(parseSleep("7:23"), 7.38);
  assert.equal(parseSleep("7h 23"), 7.38);
  assert.equal(parseSleep("7 h 23 min"), 7.38);
  assert.equal(parseSleep("7h"), 7);
  assert.equal(parseSleep("7,5"), 7.5);
  assert.equal(parseSleep("6"), 6);
});

test("anything else is no sleep", () => {
  for (const text of ["", "abc", "7:75", "0", "20", "-3"]) assert.equal(parseSleep(text), null, text);
});

test("hours split into hours and minutes", () => {
  assert.deepEqual(sleepParts(7.38), { hours: 7, minutes: 23 });
  assert.deepEqual(sleepParts(4.97), { hours: 4, minutes: 58 });
});

test("the sleep of a day is the one entered on it", () => {
  const history = [{ from: "2026-11-17", value: 4.97, at: 1 }, { from: "2026-11-18", value: 7.38, at: 1 }];
  assert.equal(sleepOn(history, "2026-11-18"), 7.38);
  assert.equal(sleepOn(history, "2026-11-19"), null);
});
