import { start, toRecords } from "./history.js";

// Values that change over time and are asked for again once they have not been touched for a while:
// the weight after two weeks, the resting heart rate after a month. Only a value set before is asked for.
export const reminderDays = { weight: 14, restHeartRate: 30 };

const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);

// The latest day a history was written from, the start not counting as a day.
function lastDay(history) {
  const days = (history ?? []).filter((record) => !record.deleted && record.from && record.from !== start).map((record) => record.from);
  return days.length ? days.sort().at(-1) : null;
}

// The reminders due today: [{ key, value, since, days }], since the last day the value was set or confirmed
// (null when unknown), days since then. fitness is the remembered fitness settings with their histories.
export function dueReminders(fitness, history, today) {
  if (fitness?.reminders?.off) return [];
  const confirmed = fitness?.reminders ?? {};
  const weights = toRecords(history?.weight, "kg").filter((record) => record.kg > 0);
  const latestWeight = weights.sort((a, b) => (a.from ?? "").localeCompare(b.from ?? "")).at(-1);
  const candidates = [
    latestWeight && { key: "weight", value: latestWeight.kg, last: [lastDay(history?.weight), confirmed.weight] },
    fitness?.restHeartRate > 0 && { key: "restHeartRate", value: fitness.restHeartRate, last: [lastDay(history?.restHeartRate), confirmed.restHeartRate] },
  ].filter(Boolean);
  return candidates.map(({ key, value, last }) => {
    const since = last.filter(Boolean).sort().at(-1) ?? null;
    return { key, value, since, days: since ? daysBetween(since, today) : null };
  }).filter((item) => item.days === null || item.days >= reminderDays[item.key]);
}
