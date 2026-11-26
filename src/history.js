import { sameValue } from "./values.js";
import { mondayOf } from "./dates.js";

export { mondayOf };

// Settings that change what is worked out hold from the day they change on; the days before keep what they had.
// A history is [{ from: "YYYY-MM-DD", value, at }], sorted by from; at is when it was written, for merging.
// A record removed stays as { from, deleted: true, at }, so a merge does not bring it back from another device.
// The first change keeps the value before it from the start (from "0000-00-00").

export const start = "0000-00-00";

// The general settings with a history, and each sport's; the weekly ones hold from the week's Monday.
export const trackedGeneral = ["maxHeartRate", "restHeartRate"];
export const trackedSport = ["maxHeartRate", "heartRateZones", "powerZones", "heartRateBasis", "weeklyHours", "weeklyKm", "plan", "trainingDays"];
export const weeklyKeys = new Set(["weeklyHours", "weeklyKm", "plan", "trainingDays"]);

// The Monday of the day's week.

// The value in force on the day: the latest record from it or before; the fallback without a history.
export function valueOn(history, day, fallback = null) {
  if (!Array.isArray(history) || !history.length) return fallback;
  let held = null;
  for (const record of history) if (!record.deleted && (record.from ?? start) <= day && (!held || (record.from ?? start) >= (held.from ?? start))) held = record;
  return held ? held.value ?? null : fallback;
}


// The history with the value set from the day given; the first change keeps the one before it for the past.
// Setting the value that held before the day removes the day's record instead.
export function setValue(history, previous, value, from, at = Date.now()) {
  let list = Array.isArray(history) && history.length ? history.filter((record) => record.from !== from) : [{ from: start, value: previous ?? null, at }];
  if (from === start) list = list.filter((record) => record.from !== start);
  const before = valueOn(list.filter((record) => record.from < from), from, undefined);
  if (from !== start && list.some((record) => record.from < from) && sameValue(before, value) && !list.some((record) => record.from > from)) {
    return list.sort((a, b) => a.from.localeCompare(b.from));
  }
  return [...list, { from, value: value ?? null, at }].sort((a, b) => a.from.localeCompare(b.from));
}

// Two devices' histories as one: every day either holds, the later written on a day both changed.
export function mergeHistory(a, b) {
  const byDay = new Map();
  for (const record of [...(a ?? []), ...(b ?? [])]) {
    const key = record.from ?? start;
    const held = byDay.get(key);
    if (!held || (record.at ?? 0) > (held.at ?? 0)) byDay.set(key, { ...record, from: key });
  }
  return [...byDay.values()].sort((a, b) => a.from.localeCompare(b.from));
}

const day = (record) => record.from ?? start;

// The records listed by hand (the FTP and the weight: [{ from: "YYYY-MM-DD" | null, [field] }], null from the start)
// and their history: each way.
export const toRecords = (history, field) => (history ?? []).filter((record) => !record.deleted)
  .map((record) => ({ from: day(record) === start ? null : record.from, [field]: record.value }));
export const fromRecords = (list, field, at = 0) => (list ?? []).map((record) => ({ from: day(record), value: record[field] ?? null, at }))
  .sort((a, b) => a.from.localeCompare(b.from));

// The history after the records were edited to the list given: a record gone is kept as removed, one unchanged
// keeps its time.
export function withRecords(history, list, field, at = Date.now()) {
  const next = new Map(fromRecords(list, field, at).map((record) => [record.from, record]));
  const kept = (history ?? []).filter((record) => !next.has(day(record))).map((record) => (record.deleted ? record : { from: day(record), deleted: true, at }));
  const written = [...next.values()].map((record) => {
    const old = (history ?? []).find((item) => !item.deleted && day(item) === record.from);
    return old && sameValue(old.value, record.value) ? old : record;
  });
  return [...kept, ...written].sort((a, b) => a.from.localeCompare(b.from));
}

// The weekly goals as the first version of their history kept them, [{ from, weeklyHours, weeklyKm }], as two histories.
export function fromGoalHistory(goalHistory, key) {
  return (goalHistory ?? []).map((item) => ({ from: item.from ?? start, value: item[key] ?? null, at: 0 }));
}

// The day a change made today holds from: today, or this week's Monday for a weekly setting.
export const changeDay = (key, today) => (weeklyKeys.has(key) ? mondayOf(today) : today);
