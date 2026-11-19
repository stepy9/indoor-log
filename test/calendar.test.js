import assert from "node:assert/strict";
import test from "node:test";
import { planCalendar, plannedMinutes } from "../src/calendar.js";

const plan = { usual: { minutes: 32 }, long: { minutes: 47 }, intervals: { repeats: 4, minutes: 4, rest: 3 } };
const make = (extra = {}) => planCalendar({
  days: [{ day: "2026-11-20", type: "usual" }, { day: "2026-11-22", type: "long" }],
  sport: "rowing",
  time: "18:30",
  title: (type) => `Veslování · ${type}`,
  description: (type) => (type === "long" ? "6,5 km, klidně; tep 120–135" : ""),
  minutes: (type) => plannedMinutes(plan, type),
  now: Date.parse("2026-11-19T10:00:00Z"),
  ...extra,
});

test("plannedMinutes rounds each kind of day up to 5 minutes", () => {
  assert.equal(plannedMinutes(plan, "usual"), 35);
  assert.equal(plannedMinutes(plan, "long"), 50);
  assert.equal(plannedMinutes(plan, "intervals"), 45);
  assert.equal(plannedMinutes(plan, "ftpTest"), 60);
  assert.equal(plannedMinutes(plan, "opener"), 15);
  assert.equal(plannedMinutes({}, "usual"), 45);
});

test("planCalendar writes one event per day with its time, length and a reminder an hour before", () => {
  const text = make();
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
  assert.equal(text.match(/BEGIN:VEVENT/g).length, 2);
  assert.match(text, /DTSTART:20261120T183000\r\nDTEND:20261120T190500/);
  assert.match(text, /DTSTART:20261122T183000\r\nDTEND:20261122T192000/);
  assert.equal(text.match(/TRIGGER:-PT60M/g).length, 2);
  assert.match(text, /DTSTAMP:20261119T100000Z/);
});

test("planCalendar keeps the UID by day and sport, so a new import updates the event", () => {
  const first = make();
  const again = make({ time: "07:00", now: Date.parse("2026-11-21T10:00:00Z") });
  const uids = (text) => text.match(/UID:.*/g);
  assert.deepEqual(uids(first), ["UID:20261120-rowing@indoor-log", "UID:20261122-rowing@indoor-log"]);
  assert.deepEqual(uids(again), uids(first));
  assert.ok(Number(again.match(/SEQUENCE:(\d+)/)[1]) > Number(first.match(/SEQUENCE:(\d+)/)[1]));
});

test("planCalendar escapes commas and semicolons and folds long lines", () => {
  const text = make({ description: () => "a, b; c ".repeat(20) });
  assert.match(text, /DESCRIPTION:a\\, b\\; c/);
  for (const line of text.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
});

test("planCalendar crosses midnight into the next day", () => {
  const text = make({ time: "23:45" });
  assert.match(text, /DTSTART:20261120T234500\r\nDTEND:20261121T002000/);
});
