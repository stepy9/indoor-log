import { mean } from "./stats.js";
import { addDays } from "./diary.js";
import { start } from "./history.js";

// The heart rate variability (HRV, the watch's overnight average in ms), entered day by day.
// One night says little: what counts is the average of the last seven days against the usual range, the mean
// of the days of the last 60 give or take half their standard deviation (the smallest change that matters).
export const hrvWeek = 7;
export const hrvBaselineDays = 60;
// Too few values to tell: at least this many in the week and in the baseline.
export const hrvWeekMin = 3;
export const hrvBaselineMin = 14;

// The values entered on their days, [{ day, value }] sorted.
export const hrvDays = (history) => (history ?? [])
  .filter((record) => !record.deleted && record.value > 0 && record.from && record.from !== start)
  .map((record) => ({ day: record.from, value: record.value }))
  .sort((a, b) => a.day.localeCompare(b.day));


// How the HRV stands on the day: { average, low, high, status } with status "low", "balanced" or "high";
// the average alone (status null) without enough days for the range, null without enough for the week.
export function hrvOn(days, day) {
  const within = (count) => days.filter((item) => item.day <= day && item.day > addDays(day, -count)).map((item) => item.value);
  const week = within(hrvWeek);
  if (week.length < hrvWeekMin) return null;
  const average = mean(week);
  const baseline = within(hrvBaselineDays);
  if (baseline.length < hrvBaselineMin) return { average, low: null, high: null, status: null };
  const middle = mean(baseline);
  const spread = Math.sqrt(mean(baseline.map((value) => (value - middle) ** 2))) / 2;
  const low = middle - spread;
  const high = middle + spread;
  return { average, low, high, status: average < low ? "low" : average > high ? "high" : "balanced" };
}

// Each day of [from, to] with the value entered on it (null without one) and how the HRV stood then.
export function hrvSeries(days, from, to) {
  const byDay = new Map(days.map((item) => [item.day, item.value]));
  const series = [];
  for (let day = from; day <= to; day = addDays(day, 1)) series.push({ day, value: byDay.get(day) ?? null, ...hrvOn(days, day) });
  return series;
}
