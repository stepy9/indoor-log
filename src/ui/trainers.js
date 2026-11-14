import { byId, sportLabel, t } from "./context.js";
import { saveDefaults, savedDefaults } from "./preferences.js";

// Trainers the user rows, cycles or runs on, each with its number of resistance levels and the level usually set.
// They live with the other remembered settings in this browser.
const sports = ["rowing", "cycling", "running"];

export const trainers = () => savedDefaults().trainers ?? [];

export const trainerFor = (id) => trainers().find((trainer) => trainer.id === id) ?? null;

export function saveTrainers(list) {
  saveDefaults({ trainers: list });
}

// The trainer used last for a sport, or the first one set up for it.
export const lastTrainerId = (sport) => {
  const remembered = savedDefaults().trainerBySport?.[sport];
  if (remembered && trainerFor(remembered)?.sport === sport) return remembered;
  return trainers().find((trainer) => trainer.sport === sport)?.id ?? "";
};

export function rememberTrainer(sport, id) {
  saveDefaults({ trainerBySport: { ...savedDefaults().trainerBySport, [sport]: id } });
}

// Kinomap plans give resistance as a percentage. The trainer spreads 0-100 % over the steps between its first and
// last level and rounds down: a 15-level rower sets 5 % as 1, 50 % as 8, 70 % as 10 and 80 % as 12, as tried on it.
export const formulaLevel = (percent, levels) => Math.max(1, Math.min(levels, Math.floor((percent / 100) * (levels - 1) + 1e-9) + 1));

// The percentages a trainer's own conversion is set for, every 5 % from 0 to 100.
export const percentSteps = Array.from({ length: 21 }, (_, index) => index * 5);

// The trainer's conversion as set in the settings (percentLevels, one level per step), else the formula's.
export const percentTable = (trainer) => percentSteps.map((percent, index) =>
  Math.min(trainer.levels, trainer.percentLevels?.[index] ?? formulaLevel(percent, trainer.levels)));

// A percentage between the steps takes the nearest one's level.
export const levelFromPercent = (percent, trainer) => {
  if (!trainer || !(percent > 0)) return null;
  if (!trainer.percentLevels) return formulaLevel(percent, trainer.levels);
  return percentTable(trainer)[Math.round(Math.min(100, percent) / 5)];
};

