import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "../src/diary.js";
import { illnessSigns } from "../src/illness.js";

const day = "2026-11-18";
// Resting heart rate of 45 on the 14 days before, the day's given.
const rest = (today) => [...Array.from({ length: 14 }, (_, index) => ({ from: addDays(day, -1 - index), value: 45, at: 1 })), { from: day, value: today, at: 1 }];
const temp = (value) => [{ from: day, value, at: 1 }];

test("a warm night with the resting heart rate up is a sign", () => {
  assert.deepEqual(illnessSigns({ skinTemp: temp(0.6), restHeartRate: rest(49) }, day), { temperature: 0.6, restRise: 4 });
});

test("a warm night alone is not, unless far warmer", () => {
  assert.equal(illnessSigns({ skinTemp: temp(0.6), restHeartRate: rest(46) }, day), null);
  assert.equal(illnessSigns({ skinTemp: temp(0.6) }, day), null);
  assert.deepEqual(illnessSigns({ skinTemp: temp(1.1) }, day), { temperature: 1.1, restRise: null });
});

test("a usual night, or none entered, is no sign", () => {
  assert.equal(illnessSigns({ skinTemp: temp(0.2), restHeartRate: rest(52) }, day), null);
  assert.equal(illnessSigns({ restHeartRate: rest(52) }, day), null);
});
