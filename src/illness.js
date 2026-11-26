import { median } from "./stats.js";
import { addDays } from "./diary.js";
import { start } from "./history.js";

// Signs that an illness may be coming before it is felt: the skin's temperature over the night well above the usual
// (Garmin gives its change from the person's own baseline, in °C) together with a resting heart rate above the usual,
// or the temperature alone far above it. The plan then holds the build and the intervals, as when unwell.
export const feverish = 0.5;
export const feverishAlone = 1;
export const restRise = 3;
// The usual resting heart rate: the median of the days entered in the four weeks before, seven at least.
const restDays = 28;
const restMin = 7;

const dated = (history) => (history ?? []).filter((record) => !record.deleted && record.from && record.from !== start && Number.isFinite(record.value));


// The signs on the day: { temperature, restRise } (restRise null without a usual to tell it by), or null without them.
export function illnessSigns(history, day) {
  const temperature = dated(history?.skinTemp).find((record) => record.from === day)?.value;
  if (!(temperature >= feverish)) return null;
  const rest = dated(history?.restHeartRate);
  const today = rest.find((record) => record.from === day)?.value;
  const usual = rest.filter((record) => record.from < day && record.from >= addDays(day, -restDays)).map((record) => record.value);
  const rise = Number.isFinite(today) && usual.length >= restMin ? today - median(usual) : null;
  if (temperature >= feverishAlone || rise >= restRise) return { temperature, restRise: rise };
  return null;
}
