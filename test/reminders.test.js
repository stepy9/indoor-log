import { test } from "node:test";
import assert from "node:assert/strict";
import { dueReminders } from "../src/reminders.js";

const history = { weight: [{ from: "0000-00-00", value: 80, at: 0 }, { from: "2026-11-01", value: 78, at: 1 }] };

test("the weight is asked for two weeks after its last record", () => {
  assert.deepEqual(dueReminders({}, history, "2026-11-10"), []);
  assert.deepEqual(dueReminders({}, history, "2026-11-15"), [{ key: "weight", value: 78, since: "2026-11-01", days: 14 }]);
});

test("a confirmation counts as a new record, and reminders can be turned off", () => {
  assert.deepEqual(dueReminders({ reminders: { weight: "2026-11-12" } }, history, "2026-11-15"), []);
  assert.deepEqual(dueReminders({ reminders: { off: true } }, history, "2026-12-31"), []);
});

test("the resting heart rate is asked for only when set, after a month or when its age is unknown", () => {
  assert.deepEqual(dueReminders({}, {}, "2026-11-15"), []);
  assert.deepEqual(dueReminders({ restHeartRate: 52 }, {}, "2026-11-15"), [{ key: "restHeartRate", value: 52, since: null, days: null }]);
  const rest = { restHeartRate: [{ from: "0000-00-00", value: 55, at: 0 }, { from: "2026-10-20", value: 52, at: 1 }] };
  assert.deepEqual(dueReminders({ restHeartRate: 52 }, rest, "2026-11-15"), []);
  assert.equal(dueReminders({ restHeartRate: 52 }, rest, "2026-11-19").length, 1);
});

import { bodyPoints, bodyStatus } from "../src/reminders.js";

test("every value is listed, the one never entered without a value and never due", () => {
  assert.deepEqual(bodyStatus({}, history, "2026-11-03"), [
    { key: "weight", value: 78, since: "2026-11-01", days: 2, due: false },
    { key: "restHeartRate", value: null, since: null, days: null, due: false },
  ]);
});

test("a chart's points are the days entered, the value before the range holding from its first day", () => {
  const list = [{ from: "0000-00-00", value: 80, at: 0 }, { from: "2026-10-01", value: 79, at: 1 }, { from: "2026-11-02", value: 78, at: 2 }, { from: "2026-11-05", deleted: true, at: 3 }];
  assert.deepEqual(bodyPoints(list, "2026-10-15", "2026-11-18"), [{ day: "2026-10-15", value: 79, carried: true }, { day: "2026-11-02", value: 78 }]);
  assert.deepEqual(bodyPoints(list, "2026-09-01", "2026-11-18").map((point) => point.value), [80, 79, 78]);
});
