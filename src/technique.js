import { steps } from "./fitness.js";

// Rowing technique: the distance each stroke carries the boat, speed × 60 / stroke rate, compared within one band of
// stroke rates, since a higher rate always gives a shorter stroke. The first ten minutes, the warm-up, are left out.

export const strokeBands = [[18, 20], [20, 22], [22, 24], [24, 26]];
export const techniqueSkipSeconds = 600;
// The least time in the band for a workout to count, so a few strokes passing through do not.
export const techniqueMinimumSeconds = 120;

// The metres per stroke of one workout within the band [from, to) SPM: the distance rowed in it over the strokes
// taken in it. { metersPerStroke, seconds } or null with too little time in the band.
export function strokeDistance(entry, [from, to]) {
  const { seconds = [], speed = [], cadence = [] } = entry.records ?? {};
  if (!seconds.length) return null;
  const start = seconds[0] + techniqueSkipSeconds;
  const dts = steps(seconds);
  let meters = 0;
  let strokes = 0;
  let time = 0;
  for (let index = 0; index < seconds.length; index += 1) {
    const rate = cadence[index];
    if (seconds[index] < start || !(speed[index] > 0) || !(rate >= from && rate < to)) continue;
    meters += speed[index] * dts[index];
    strokes += (rate / 60) * dts[index];
    time += dts[index];
  }
  if (time < techniqueMinimumSeconds || !strokes) return null;
  return { metersPerStroke: meters / strokes, seconds: time };
}

// The band with the most time rowed in it over the workouts given; the first band without any.
export function busiestBand(entries) {
  let best = strokeBands[0];
  let most = 0;
  for (const band of strokeBands) {
    const time = entries.reduce((sum, entry) => sum + (strokeDistance(entry, band)?.seconds ?? 0), 0);
    if (time > most) {
      most = time;
      best = band;
    }
  }
  return best;
}
