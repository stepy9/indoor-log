import assert from "node:assert/strict";
import test from "node:test";
import { calendarDays, dayKey, inPeriod, periodBuckets, periodRange, shiftPeriod, totals } from "../src/diary.js";

const zone = "Europe/Prague";

test("days follow the time zone and periods start on Monday, the first of the month or of the year", () => {
  // 23:30 UTC on 1 November is already 2 November in Prague.
  assert.equal(dayKey(Date.UTC(2026, 10, 1, 23, 30), zone), "2026-11-02");
  assert.deepEqual(periodRange("week", "2026-11-01"), ["2026-10-26", "2026-11-02"]);
  assert.deepEqual(periodRange("month", "2026-12-15"), ["2026-12-01", "2027-01-01"]);
  assert.deepEqual(periodRange("year", "2026-03-29"), ["2026-01-01", "2027-01-01"]);
  assert.equal(shiftPeriod("week", "2026-11-04", -1), "2026-10-26");
  assert.equal(shiftPeriod("month", "2026-01-20", -1), "2025-12-01");
  assert.equal(shiftPeriod("year", "2026-06-01", 1), "2027-01-01");
});

test("a month's calendar covers whole weeks", () => {
  const days = calendarDays("2026-11-01");
  assert.equal(days[0], "2026-10-26");
  assert.equal(days.at(-1), "2026-12-06");
  assert.equal(days.length % 7, 0);
});

test("totals add up the period and average power and heart rate over their time", () => {
  const entry = (day, seconds, distance, avgPower, avgHeartRate) => ({ startMs: Date.parse(`${day}T08:00:00Z`), summary: { timerSeconds: seconds, distance, avgPower, avgHeartRate } });
  const entries = [entry("2026-10-28", 600, 2000, 100, 130), entry("2026-10-30", 1200, 4000, 130, null), entry("2026-11-02", 600, 2000, 90, 120)];
  const week = inPeriod(entries, periodRange("week", "2026-10-28"), zone);
  assert.deepEqual(totals(week), { count: 2, seconds: 1800, distance: 6000, avgPower: 120, avgHeartRate: 130 });
  const year = periodBuckets("year", periodRange("year", "2026-10-28"), entries, zone);
  assert.equal(year.length, 12);
  assert.deepEqual(year.map((bucket) => bucket.entries.length).slice(9), [2, 1, 0]);
  const month = periodBuckets("month", periodRange("month", "2026-10-28"), entries, zone);
  assert.equal(month.length, 31);
  assert.equal(month[27].entries.length, 1);
});

test("a running period is set against as many days of the one before", async () => {
  const { previousRange } = await import("../src/diary.js");
  assert.deepEqual(previousRange("month", "2026-11-02", "2026-11-02"), ["2026-10-01", "2026-10-03"]);
  assert.deepEqual(previousRange("month", "2026-10-15", "2026-11-02"), ["2026-09-01", "2026-10-01"]);
  // 31 days of March run past the end of February, which then counts whole.
  assert.deepEqual(previousRange("month", "2026-03-31", "2026-03-31"), ["2026-02-01", "2026-03-01"]);
  assert.deepEqual(previousRange("week", "2026-11-04", "2026-11-04"), ["2026-10-26", "2026-10-29"]);
});
