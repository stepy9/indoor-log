import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "../src/diary.js";
import { hrvDays, hrvOn, hrvSeries } from "../src/hrv.js";

// A history of daily values ending on the day given, the last first.
const historyTo = (end, values) => [{ from: "0000-00-00", value: null, at: 0 }, ...values.map((value, index) => ({ from: addDays(end, -index), value, at: 1 }))];

test("the days entered leave out the value from the start and the removed ones", () => {
  const history = [{ from: "0000-00-00", value: 50, at: 0 }, { from: "2026-11-02", value: 48, at: 1 }, { from: "2026-11-01", deleted: true, at: 2 }];
  assert.deepEqual(hrvDays(history), [{ day: "2026-11-02", value: 48 }]);
});

test("the week's average needs three days, the range fourteen", () => {
  assert.equal(hrvOn(hrvDays(historyTo("2026-11-18", [50, 52])), "2026-11-18"), null);
  assert.deepEqual(hrvOn(hrvDays(historyTo("2026-11-18", [50, 52, 54])), "2026-11-18"), { average: 52, low: null, high: null, status: null });
});

test("a week well under the usual range is low, within it balanced", () => {
  const usual = Array.from({ length: 30 }, (_, index) => (index % 2 ? 48 : 52));
  assert.equal(hrvOn(hrvDays(historyTo("2026-11-18", usual)), "2026-11-18").status, "balanced");
  const low = hrvOn(hrvDays(historyTo("2026-11-18", [40, 41, 42, 40, 41, 42, 40, ...usual])), "2026-11-18");
  assert.equal(low.status, "low");
  assert.ok(low.average < low.low);
});

test("the series has every day, with the value where one was entered", () => {
  const series = hrvSeries(hrvDays(historyTo("2026-11-18", [50, 52, 54])), "2026-11-15", "2026-11-18");
  assert.deepEqual(series.map((item) => item.value), [null, 54, 52, 50]);
  assert.equal(series[0].average, undefined);
  assert.equal(series[3].average, 52);
});
