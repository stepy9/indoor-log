import { start, toRecords } from "./history.js";

// The weight and the resting heart rate, entered by hand as often as wished; each is asked for again once
// it has not been touched for a while: the weight after two weeks, the resting heart rate after a month.
export const reminderDays = { weight: 14, restHeartRate: 30 };
export const bodyKeys = ["weight", "restHeartRate"];

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

// The latest day a history was written from, the start not counting as a day.
function lastDay(history) {
  const days = (history ?? []).filter((record) => !record.deleted && record.from && record.from !== start).map((record) => record.from);
  return days.length ? days.sort().at(-1) : null;
}

// Each value as it stands today: [{ key, value, since, days, due }]. value is null when never entered;
// since the last day it was set or confirmed (null when unknown), days since then; due when it is to be asked
// for again (never for a value not entered, nor with the reminders turned off).
// fitness is the remembered fitness settings, history their general histories.
export function bodyStatus(fitness, history, today) {
  const confirmed = fitness?.reminders ?? {};
  const weights = toRecords(history?.weight, "kg").filter((record) => record.kg > 0)
    .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
  const values = {
    weight: { value: weights.at(-1)?.kg ?? null, last: [lastDay(history?.weight), confirmed.weight] },
    restHeartRate: { value: fitness?.restHeartRate > 0 ? fitness.restHeartRate : null, last: [lastDay(history?.restHeartRate), confirmed.restHeartRate] },
  };
  return bodyKeys.map((key) => {
    const { value, last } = values[key];
    const since = value === null ? null : last.filter(Boolean).sort().at(-1) ?? null;
    const days = since ? daysBetween(since, today) : null;
    const due = value !== null && !confirmed.off && (days === null || days >= reminderDays[key]);
    return { key, value, since, days, due };
  });
}

// The values due to be asked for again: [{ key, value, since, days }].
export const dueReminders = (fitness, history, today) => bodyStatus(fitness, history, today)
  .filter((item) => item.due).map(({ key, value, since, days }) => ({ key, value, since, days }));

// The values entered on their days within [from, to], for a chart: [{ day, value }], with the value holding
// on the first day when it was entered on a day before it (the value kept from the start does not count). history is one value's history ({ from, value } records).
export function bodyPoints(history, from, to) {
  const records = (history ?? []).filter((record) => !record.deleted && record.value > 0);
  const dated = records.filter((record) => record.from && record.from !== start && record.from >= from && record.from <= to)
    .map((record) => ({ day: record.from, value: record.value }));
  const before = records.filter((record) => record.from && record.from !== start && record.from < from).sort((a, b) => (a.from ?? start).localeCompare(b.from ?? start)).at(-1);
  const points = before && dated[0]?.day !== from ? [{ day: from, value: before.value, carried: true }, ...dated] : dated;
  return points.sort((a, b) => a.day.localeCompare(b.day));
}
