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

// Kinomap plans give resistance as a percentage; on a trainer it is the nearest of its levels.
export const levelFromPercent = (percent, trainer) => (trainer && percent > 0
  ? Math.max(1, Math.min(trainer.levels, Math.round((percent / 100) * trainer.levels)))
  : null);

