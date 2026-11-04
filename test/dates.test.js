import assert from "node:assert/strict";
import test from "node:test";
import { axisTicks, formatDay, monthLayout, parseDay } from "../src/dates.js";

test("parseDay reads a day typed in any common way, null when empty, undefined when not a real day", () => {
  assert.equal(parseDay("13. 10. 2026"), "2026-10-13");
  assert.equal(parseDay("13.10.2026"), "2026-10-13");
  assert.equal(parseDay("1/11/2026"), "2026-11-01");
  assert.equal(parseDay("2026-10-13"), "2026-10-13");
  assert.equal(parseDay(""), null);
  assert.equal(parseDay("   "), null);
  // Anything unreadable keeps the day before rather than clearing it, which would mean "from the start".
  assert.equal(parseDay("abc"), undefined);
  assert.equal(parseDay("31. 2. 2026"), undefined);
  assert.equal(parseDay("13. 10."), undefined);
  assert.equal(parseDay("29. 2. 2028"), "2028-02-29");
  assert.equal(parseDay("29. 2. 2026"), undefined);
});

test("formatDay writes a day in the app's language and reads back the same", () => {
  assert.equal(formatDay("2026-10-13", "cs"), "13. 10. 2026");
  assert.equal(formatDay("2026-11-01", "en"), "01/11/2026");
  assert.equal(formatDay(null, "cs"), "");
  for (const language of ["cs", "en"]) assert.equal(parseDay(formatDay("2026-03-07", language)), "2026-03-07");
});

test("monthLayout starts the weeks on Monday", () => {
  // 1 October 2026 is a Thursday: three empty cells, Monday to Wednesday.
  assert.deepEqual(monthLayout(2026, 9), { offset: 3, days: 31 });
  // 1 June 2026 is a Monday, 1 November 2026 a Sunday.
  assert.equal(monthLayout(2026, 5).offset, 0);
  assert.equal(monthLayout(2026, 10).offset, 6);
  assert.equal(monthLayout(2028, 1).days, 29);
});

const dayX = (firstKey, pxPerDay) => (key) => ((Date.parse(`${key}T12:00:00Z`) - Date.parse(`${firstKey}T12:00:00Z`)) / 86_400_000) * pxPerDay;

test("axisTicks labels every day when there is room, the last day closing the axis", () => {
  const ticks = axisTicks("2026-10-13", "2026-11-04", dayX("2026-10-13", 70));
  assert.equal(ticks.length, 23);
  assert.equal(ticks[0].key, "2026-10-13");
  assert.deepEqual(ticks.at(-1), { key: "2026-11-04", kind: "last", spacing: 1 });
});

test("axisTicks falls back to weeks from Monday on a narrow chart, dropping a tick too close to the last day", () => {
  const x = dayX("2026-10-13", 10);
  const ticks = axisTicks("2026-10-13", "2026-11-04", x);
  assert.equal(ticks[0].spacing, 7);
  for (const tick of ticks.slice(0, -1)) assert.equal(new Date(`${tick.key}T12:00:00Z`).getUTCDay(), 1, `${tick.key} is a Monday`);
  // Monday 2 November is two days, 20 px, before the last day: it gives way.
  assert.ok(!ticks.some((tick) => tick.key === "2026-11-02"));
  assert.equal(ticks.at(-1).key, "2026-11-04");
  for (let index = 1; index < ticks.length; index += 1) assert.ok(x(ticks[index].key) - x(ticks[index - 1].key) >= 64);
});

test("axisTicks uses months over a long range", () => {
  const ticks = axisTicks("2025-11-06", "2026-11-04", dayX("2025-11-06", 3));
  assert.ok(ticks.slice(0, -1).every((tick) => tick.kind === "month" && tick.key.endsWith("-01")));
  assert.equal(ticks.at(-1).kind, "last");
  assert.deepEqual(axisTicks("2026-11-04", "2026-11-04", () => 0), [{ key: "2026-11-04", kind: "last", spacing: 1 }]);
});
