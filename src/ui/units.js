// Values with their units as every view writes them: rowing pace per 500 m, running per km, cycling as speed,
// cadence in strokes or revolutions (steps when running). valueText and paceText give null for a missing value,
// so a list can leave it out; metricText always gives a text, a dash when there is nothing.
import { displayNumber, formatDuration, t } from "./context.js";

export const cadenceUnit = (sport) => (sport === "running" ? "spm" : "rpm");
export const paceUnit = (sport) => (sport === "cycling" ? "km/h" : sport === "rowing" ? "/500 m" : "/km");

export const valueText = (value, suffix, digits = 0) => (Number.isFinite(value) ? `${displayNumber(value, digits)} ${suffix}` : null);

// A pace in seconds per 500 m or km, or a cycling speed in km/h.
export function paceText(value, sport) {
  if (!Number.isFinite(value)) return null;
  if (sport === "cycling") return `${displayNumber(value, 1)} km/h`;
  return `${formatDuration(value)} ${paceUnit(sport)}`;
}

// The same from a speed in m/s.
export function speedText(speed, sport) {
  if (!(speed > 0)) return "—";
  return paceText(sport === "cycling" ? speed * 3.6 : (sport === "rowing" ? 500 : 1000) / speed, sport);
}

export function metricText(value, metric, sport) {
  if (!Number.isFinite(value)) return "—";
  if (metric === "pace") return paceText(value, sport);
  if (metric === "stroke") return `${displayNumber(value, 2)} m`;
  return valueText(value, { power: "W", heartRate: "bpm", cadence: cadenceUnit(sport) }[metric]);
}

// A change with its sign, +3 W, −2 bpm or ±0; a dash without one.
export const signedText = (value, digits, suffix) => (value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : "±"}${displayNumber(Math.abs(value), digits)}${suffix}`);

// The planned resistance after a workout's text, " · level 5" or " · level 5–6"; nothing without one.
export const planLevelText = (value) => (value == null ? "" : ` · ${t("planLevel", { level: Array.isArray(value) ? (value[0] === value[1] ? value[0] : `${value[0]}–${value[1]}`) : value })}`);

export function metricLabel(metric, sport) {
  if (metric === "pace") return t(sport === "cycling" ? "lapSpeed" : "lapPace");
  return t({ power: "lapPower", heartRate: "lapHeartRate", cadence: "lapCadence", stroke: "compareStroke" }[metric]);
}
