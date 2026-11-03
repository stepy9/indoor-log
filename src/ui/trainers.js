import { byId, sportLabel, t } from "./context.js";
import { saveDefaults, savedDefaults } from "./preferences.js";

// Trainers the user rows, cycles or runs on, each with its number of resistance levels and the level usually set.
// They live with the other remembered settings in this browser.
const sports = ["rowing", "cycling", "running"];

export const trainers = () => savedDefaults().trainers ?? [];

export const trainerFor = (id) => trainers().find((trainer) => trainer.id === id) ?? null;

function saveTrainers(list) {
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

function renderRows(onChange) {
  const list = trainers();
  byId("trainersEmpty").hidden = list.length > 0;
  byId("trainersRows").replaceChildren(...list.map((trainer) => {
    const update = (patch) => {
      saveTrainers(trainers().map((item) => (item.id === trainer.id ? { ...item, ...patch } : item)));
      onChange();
    };
    const name = Object.assign(document.createElement("input"), { type: "text", className: "name-input", value: trainer.name });
    name.setAttribute("aria-label", t("trainerName"));
    name.addEventListener("change", () => update({ name: name.value.trim() || trainer.name }));
    const sport = document.createElement("select");
    sport.className = "kind-select";
    sport.setAttribute("aria-label", t("librarySport"));
    sport.append(...sports.map((value) => new Option(sportLabel(value), value)));
    sport.value = trainer.sport;
    sport.addEventListener("change", () => update({ sport: sport.value }));
    const number = (value, label, apply) => {
      const input = Object.assign(document.createElement("input"), { type: "number", className: "level-input", min: "1", value: String(value) });
      input.setAttribute("aria-label", label);
      input.addEventListener("change", () => {
        const level = Math.round(Number(input.value));
        if (level >= 1) apply(level);
        else input.value = String(value);
      });
      return input;
    };
    const levels = number(trainer.levels, t("trainerLevels"), (value) => update({ levels: value, defaultLevel: Math.min(trainer.defaultLevel, value) }));
    const level = number(trainer.defaultLevel, t("trainerDefault"), (value) => update({ defaultLevel: Math.min(value, trainer.levels) }));
    const remove = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: t("libraryDelete") });
    remove.addEventListener("click", () => {
      if (!window.confirm(t("trainerDeleteConfirm", { name: trainer.name }))) return;
      saveTrainers(trainers().filter((item) => item.id !== trainer.id));
      onChange();
      renderRows(onChange);
    });
    const row = document.createElement("tr");
    row.append(...[name, sport, levels, level, remove].map((control) => {
      const cell = document.createElement("td");
      cell.append(control);
      return cell;
    }));
    return row;
  }));
}

// The trainers' part of the Settings dialog, filled as it opens; a new trainer takes the open activity's sport.
// onChange runs after every edit, so the converter's trainer list stays current.
export function renderTrainersSettings(sport, onChange) {
  byId("trainerAdd").onclick = () => {
    const id = `trainer-${Date.now().toString(36)}`;
    saveTrainers([...trainers(), { id, name: t("newTrainer"), sport: sport ?? "rowing", levels: 10, defaultLevel: 5 }]);
    onChange();
    renderRows(onChange);
  };
  renderRows(onChange);
}
