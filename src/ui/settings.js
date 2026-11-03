import { estimateFtp, estimateMaxHeartRate, forSport, heartRateAt, heartRateZones, powerZones } from "../fitness.js";
import { listEntries } from "../library.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { saveTrainers, trainers } from "./trainers.js";
import { byId, displayNumber, sportLabel, t } from "./context.js";

// The Settings dialog: general values, then one section per sport with its trainers, thresholds and zones.
// Everything is saved as it is typed and lives with the other remembered settings, so a backup carries it.

const sports = ["rowing", "cycling", "running"];
const defaultRestHeartRate = 60;
// The FTP is estimated from the best 20 minutes of this many days back, so an old peak does not hold it up.
const ftpDays = 180;

const remembered = () => savedDefaults().fitness ?? {};
const saveFitness = (patch) => saveDefaults({ fitness: { ...remembered(), ...patch } });

// One sport's typed values, with what older settings kept for every sport folded in.
function savedSport(sport) {
  const saved = remembered();
  const own = { ftp: saved.ftp?.[sport] ?? null, ...saved.sports?.[sport] };
  // A sport's own maximum overrides the general one; a copy of the general one, as earlier versions saved, is none.
  if (own.maxHeartRate === saved.maxHeartRate) own.maxHeartRate = null;
  return own;
}

function saveSport(sport, patch) {
  const saved = remembered();
  saveFitness({ sports: { ...saved.sports, [sport]: { ...savedSport(sport), ...patch } } });
}

// What the user typed, the estimate from the library in its place; estimates kept apart to show as hints.
export function settingsFor(entries) {
  const since = Date.now() - ftpDays * 86_400_000;
  const estimates = Object.fromEntries(sports.map((sport) => {
    const own = entries.filter((entry) => entry.sport === sport);
    return [sport, { ftp: estimateFtp(own.filter((entry) => entry.startMs >= since)) }];
  }));
  // The maximum heart rate is the athlete's, so one serves every sport unless a sport sets its own.
  const generalMax = remembered().maxHeartRate || estimateMaxHeartRate(entries);
  return {
    estimates: { ...estimates, maxHeartRate: estimateMaxHeartRate(entries), generalMax },
    maxHeartRate: generalMax,
    restHeartRate: remembered().restHeartRate || defaultRestHeartRate,
    sports: Object.fromEntries(sports.map((sport) => {
      const saved = savedSport(sport);
      return [sport, {
        ...saved,
        maxHeartRate: saved.maxHeartRate || generalMax,
        ftp: saved.ftp || estimates[sport].ftp,
      }];
    })),
  };
}

// Whether the sport's value was typed rather than estimated.
export const setByHand = (sport, field) => Boolean(savedSport(sport)[field]);

const state = { pane: "general", entries: [], onTrainers: () => {}, sport: () => null };

function node(tag, attributes = {}, text = "") {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text) element.textContent = text;
  return element;
}

const changed = () => {
  window.dispatchEvent(new Event("settings-change"));
  render();
};

const typedNumber = (input) => {
  const value = Number(input.value);
  return input.value.trim() && value > 0 ? Math.round(value) : null;
};

function numberField(label, value, placeholder, apply, { min, max } = {}) {
  const field = node("label", { class: "settings-field" });
  const input = node("input", { type: "number", inputmode: "numeric", ...(min ? { min } : {}), ...(max ? { max } : {}) });
  input.value = value ?? "";
  input.placeholder = placeholder;
  input.addEventListener("change", () => apply(typedNumber(input)));
  field.append(node("span", {}, label), input);
  return field;
}

const autoHint = (value) => (value ? `${t("fitnessAuto")} ${value}` : "—");

function renderNav() {
  const nav = byId("settingsNav");
  const button = (pane, label) => {
    const element = node("button", { type: "button", "aria-pressed": String(state.pane === pane) }, label);
    element.addEventListener("click", () => {
      state.pane = pane;
      render();
    });
    return element;
  };
  nav.replaceChildren(
    button("general", t("settingsGeneral")),
    node("span", { class: "settings-nav-group" }, t("settingsSports")),
    ...sports.map((sport) => button(sport, sportLabel(sport))),
  );
}

function generalPane() {
  const pane = node("section", { class: "settings-section" });
  pane.append(
    node("h3", {}, t("settingsGeneral")),
    node("p", { class: "field-note" }, t("settingsGeneralNote")),
  );
  const grid = node("div", { class: "fitness-settings" });
  const estimate = estimateMaxHeartRate(state.entries);
  grid.append(numberField(t("fitnessMaxHrLabel"), remembered().maxHeartRate, autoHint(estimate), (value) => {
    saveFitness({ maxHeartRate: value });
    changed();
  }, { min: 100, max: 230 }));
  grid.append(numberField(t("fitnessRestHrLabel"), remembered().restHeartRate, autoHint(defaultRestHeartRate), (value) => {
    saveFitness({ restHeartRate: value });
    changed();
  }, { min: 30, max: 100 }));
  pane.append(grid);
  return pane;
}

function trainersBlock(sport) {
  const block = node("div", { class: "settings-block" });
  const title = node("div", { class: "panel-title-row" });
  const add = node("button", { type: "button", class: "outline-button" }, t("trainerAdd"));
  add.addEventListener("click", () => {
    saveTrainers([...trainers(), { id: `trainer-${Date.now().toString(36)}`, name: t("newTrainer"), sport, levels: 10, defaultLevel: 5 }]);
    state.onTrainers();
    render();
  });
  title.append(node("h4", {}, t("trainersTitle")), add);
  block.append(title, node("p", { class: "field-note" }, t("trainersHint")));
  const list = trainers().filter((trainer) => trainer.sport === sport);
  if (!list.length) {
    block.append(node("p", { class: "field-note" }, t("trainersEmpty")));
    return block;
  }
  const table = node("table", { class: "laps-table trainers-table" });
  const head = node("tr");
  head.append(...[t("trainerName"), t("trainerLevels"), t("trainerDefault"), ""].map((label) => node("th", {}, label)));
  table.append(node("thead"), node("tbody"));
  table.tHead.append(head);
  for (const trainer of list) {
    const update = (patch) => {
      saveTrainers(trainers().map((item) => (item.id === trainer.id ? { ...item, ...patch } : item)));
      state.onTrainers();
      render();
    };
    const name = node("input", { type: "text", class: "name-input", "aria-label": t("trainerName") });
    name.value = trainer.name;
    name.addEventListener("change", () => update({ name: name.value.trim() || trainer.name }));
    const level = (value, label, apply) => {
      const input = node("input", { type: "number", class: "level-input", min: "1", "aria-label": label });
      input.value = String(value);
      input.addEventListener("change", () => {
        const next = Math.round(Number(input.value));
        if (next >= 1) apply(next);
        else input.value = String(value);
      });
      return input;
    };
    const levels = level(trainer.levels, t("trainerLevels"), (value) => update({ levels: value, defaultLevel: Math.min(trainer.defaultLevel, value) }));
    const usual = level(trainer.defaultLevel, t("trainerDefault"), (value) => update({ defaultLevel: Math.min(value, trainer.levels) }));
    const remove = node("button", { type: "button", class: "link-button" }, t("libraryDelete"));
    remove.addEventListener("click", () => {
      if (!window.confirm(t("trainerDeleteConfirm", { name: trainer.name }))) return;
      saveTrainers(trainers().filter((item) => item.id !== trainer.id));
      state.onTrainers();
      render();
    });
    const row = node("tr");
    row.append(...[name, levels, usual, remove].map((control) => {
      const cell = node("td");
      cell.append(control);
      return cell;
    }));
    table.tBodies[0].append(row);
  }
  const scroll = node("div", { class: "laps-scroll" });
  scroll.append(table);
  block.append(scroll);
  return block;
}

// The zones' lower bounds in percent, each with the beats or watts it comes to; Z1 always starts at 0.
function zonesBlock(sport, by, settings) {
  const own = forSport(settings, sport);
  const defaults = by === "power" ? powerZones : heartRateZones;
  const bounds = forSport({ sports: { [sport]: savedSport(sport) } }, sport)[by === "power" ? "powerZones" : "heartRateZones"];
  const field = by === "power" ? "powerZones" : "heartRateZones";
  const unit = by === "power" ? "W" : "bpm";
  const block = node("div", { class: "settings-block" });
  const title = node("div", { class: "panel-title-row" });
  const reset = node("button", { type: "button", class: "link-button" }, t("settingsZonesReset"));
  reset.hidden = bounds === defaults;
  reset.addEventListener("click", () => {
    saveSport(sport, { [field]: null });
    changed();
  });
  title.append(node("h4", {}, t(by === "power" ? "settingsPowerZones" : "settingsHeartRateZones")), reset);
  block.append(title);
  // Heart rate zones count from the maximum or from the reserve above the resting heart rate.
  if (by === "heartRate") {
    const basis = node("div", { class: "segmented settings-basis", role: "group", "aria-label": t("settingsZonesBasis") });
    for (const value of ["max", "reserve"]) {
      const button = node("button", { type: "button", "aria-pressed": String(own.heartRateBasis === value) }, t(value === "max" ? "settingsBasisMax" : "settingsBasisReserve"));
      button.addEventListener("click", () => {
        saveSport(sport, { heartRateBasis: value });
        changed();
      });
      basis.append(button);
    }
    block.append(basis);
  }
  block.append(node("p", { class: "field-note" }, by === "power" ? t("settingsPowerZonesNote")
    : own.heartRateBasis === "reserve" ? t("settingsReserveNote", { rest: displayNumber(own.restHeartRate) }) : t("settingsHeartRateZonesNote")));
  const note = node("p", { class: "field-note settings-zones-error", hidden: "" });
  const list = node("div", { class: "settings-zones" });
  bounds.forEach((bound, index) => {
    const row = node("div", { class: "settings-zone" });
    const swatch = node("span", { class: "settings-zone-swatch" });
    swatch.style.background = `var(--zone-${index + 1})`;
    const next = bounds[index + 1];
    const amount = (fraction) => {
      const value = by === "power" ? (own.ftp ? fraction * own.ftp : null) : heartRateAt(fraction, own);
      return value == null ? "—" : displayNumber(value);
    };
    // Without the maximum or the FTP the bounds come to nothing yet.
    const span = amount(bound) === "—" ? "—" : next ? `${amount(bound)}–${amount(next)} ${unit}` : `> ${amount(bound)} ${unit}`;
    row.append(swatch, node("span", { class: "settings-zone-name" }, `Z${index + 1}`));
    if (index === 0) {
      row.append(node("span", { class: "settings-zone-from" }, "0 %"));
    } else {
      const input = node("input", { type: "number", min: "1", max: "300", inputmode: "numeric", "aria-label": `Z${index + 1} %` });
      input.value = String(Math.round(bound * 100));
      input.addEventListener("change", () => {
        const typed = bounds.map((value, at) => (at === index ? Number(input.value) / 100 : value));
        const rising = typed.every((value, at) => !at || value > typed[at - 1]);
        if (!rising || !(Number(input.value) > 0)) {
          note.textContent = t("settingsZonesRising");
          note.hidden = false;
          input.value = String(Math.round(bound * 100));
          return;
        }
        saveSport(sport, { [field]: typed });
        changed();
      });
      const from = node("span", { class: "settings-zone-from" });
      from.append(input, document.createTextNode(" %"));
      row.append(from);
    }
    row.append(node("span", { class: "settings-zone-span" }, span));
    list.append(row);
  });
  block.append(list, note);
  return block;
}

function sportPane(sport) {
  const settings = settingsFor(state.entries);
  const own = settings.sports[sport];
  const estimate = settings.estimates[sport];
  const pane = node("section", { class: "settings-section" });
  pane.append(node("h3", {}, sportLabel(sport)), trainersBlock(sport));
  const thresholds = node("div", { class: "settings-block" });
  thresholds.append(node("h4", {}, t("fitnessSettings")), node("p", { class: "field-note" }, t("settingsThresholdsNote")));
  const grid = node("div", { class: "fitness-settings" });
  grid.append(
    numberField(t("settingsSportMaxHr"), savedSport(sport).maxHeartRate, settings.estimates.generalMax ? `${t("settingsFromGeneral")} ${settings.estimates.generalMax}` : "—", (value) => {
      saveSport(sport, { maxHeartRate: value });
      changed();
    }, { min: 100, max: 230 }),
    numberField("FTP (W)", savedSport(sport).ftp, autoHint(estimate.ftp), (value) => {
      saveSport(sport, { ftp: value });
      changed();
    }, { min: 30, max: 600 }),
  );
  thresholds.append(grid);
  const zones = node("div", { class: "settings-zone-grid" });
  zones.append(zonesBlock(sport, "heartRate", settings), zonesBlock(sport, "power", settings));
  pane.append(thresholds, zones);
  return pane;
}

function render() {
  renderNav();
  byId("settingsPanes").replaceChildren(state.pane === "general" ? generalPane() : sportPane(state.pane));
}

// Opens on the pane given, or on the sport of the open activity or analysis, or where it was left.
export async function openSettings(pane) {
  const sport = typeof pane === "string" ? pane : state.sport();
  if (sports.includes(sport) || sport === "general") state.pane = sport;
  state.entries = await listEntries().catch(() => []);
  render();
  byId("settingsDialog").showModal();
}

// onTrainers runs after every trainer edit, so the converter's trainer list stays current;
// currentSport gives the sport to open on.
export function setupSettings({ onTrainers, currentSport }) {
  state.onTrainers = onTrainers;
  state.sport = currentSport;
  byId("settingsButton").addEventListener("click", () => openSettings());
  byId("settingsClose").addEventListener("click", () => byId("settingsDialog").close());
}
