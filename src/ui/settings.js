import { estimateMaxHeartRate, forSport, weightOn, ftpOn, ftpTimeline, heartRateAt, heartRateZones, powerZones } from "../fitness.js";
import { listEntries } from "../library.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { saveTrainers, trainers } from "./trainers.js";
import { byId, displayNumber, sportLabel, state as appState, t, zone } from "./context.js";
import { dayKey } from "../diary.js";
import { openDatePicker } from "./datepicker.js";
import { cloudAvailable, cloudStatus, connectCloud, disconnectCloud, onCloudStatus, syncNow } from "./cloud.js";
import { formatDay, parseDay } from "../dates.js";

// The Settings dialog: general values, then one section per sport with its trainers, thresholds and zones.
// Everything is saved as it is typed and lives with the other remembered settings, so a backup carries it.

const sports = ["rowing", "cycling", "running"];
const defaultRestHeartRate = 60;

const remembered = () => savedDefaults().fitness ?? {};
const saveFitness = (patch) => saveDefaults({ fitness: { ...remembered(), ...patch } });

// One sport's typed values, with what older settings kept for every sport folded in.
function savedSport(sport) {
  const saved = remembered();
  const own = { ftp: saved.ftp?.[sport] ?? null, ...saved.sports?.[sport] };
  // A sport's own maximum overrides the general one; a copy of the general one, as earlier versions saved, is none.
  if (own.maxHeartRate === saved.maxHeartRate) own.maxHeartRate = null;
  // A single FTP, as earlier versions kept it, is a history holding from the start.
  if (!own.ftpHistory && own.ftp) own.ftpHistory = [{ from: null, ftp: own.ftp }];
  delete own.ftp;
  return own;
}

// The weight history; a single weight, as the first version kept it, holds from the start.
function savedWeights() {
  const saved = remembered();
  return saved.weightHistory ?? (saved.weight ? [{ from: null, kg: saved.weight }] : []);
}

// The body weight on the day of the moment, for the power per kilogram anywhere in the app; null without one.
export const weightOnDay = (ms) => weightOn({ weightHistory: savedWeights(), timeZone: zone }, ms);

// Power per kilogram as text by the weight on the day, empty without a weight.
export function perKgText(watts, ms) {
  const kg = weightOnDay(ms);
  return kg && Number.isFinite(watts) ? `${displayNumber(watts / kg, 2)} W/kg` : "";
}

function saveSport(sport, patch) {
  const saved = remembered();
  saveFitness({ sports: { ...saved.sports, [sport]: { ...savedSport(sport), ...patch } } });
}

// What the user typed, the estimate from the library in its place; estimates kept apart to show as hints.
export function settingsFor(entries) {
  const estimatedFtp = ftpTimeline(entries);
  const estimates = Object.fromEntries(sports.map((sport) => [sport, { ftp: ftpOn({ estimatedFtp }, sport, Date.now()) }]));
  // The maximum heart rate is the athlete's, so one serves every sport unless a sport sets its own.
  const generalMax = remembered().maxHeartRate || estimateMaxHeartRate(entries);
  return {
    estimates: { ...estimates, maxHeartRate: estimateMaxHeartRate(entries), generalMax },
    estimatedFtp,
    timeZone: zone,
    maxHeartRate: generalMax,
    restHeartRate: remembered().restHeartRate || defaultRestHeartRate,
    weightHistory: savedWeights(),
    sports: Object.fromEntries(sports.map((sport) => {
      const saved = savedSport(sport);
      return [sport, { ...saved, maxHeartRate: saved.maxHeartRate || generalMax }];
    })),
  };
}

// Suggestions the Analysis tab offers and the user takes or turns down; each turned down is not offered again.
export const dismissed = () => new Set(remembered().dismissed ?? []);

export function dismiss(key) {
  saveFitness({ dismissed: [...dismissed(), key].slice(-200) });
}

export function addFtpRecord(sport, record) {
  const history = savedSport(sport).ftpHistory ?? [];
  saveSport(sport, { ftpHistory: [...history.filter((item) => item.from !== record.from), record] });
}

export function setMaxHeartRate(sport, value) {
  if (sport) saveSport(sport, { maxHeartRate: value });
  else saveFitness({ maxHeartRate: value });
}

// The maximum typed by hand: the sport's own, or with no sport the general one.
export const typedMaxHeartRate = (sport) => (sport ? savedSport(sport).maxHeartRate : remembered().maxHeartRate) || null;

// The sport's FTP now, with the history and the estimate it comes from.
export const currentFtp = (settings, sport) => ftpOn(settings, sport, Date.now());

// Whether the sport's value was typed rather than estimated; the FTP by a record in force today.
export const setByHand = (sport, field) => (field === "ftp"
  ? (savedSport(sport).ftpHistory ?? []).some((record) => record.ftp > 0 && (!record.from || record.from <= dayKey(Date.now(), zone)))
  : Boolean(savedSport(sport)[field]));

const state = { pane: "general", entries: [], onTrainers: () => {}, sport: () => null };

function node(tag, attributes = {}, text = "") {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text) element.textContent = text;
  return element;
}

// Edits are written as they are made, so the panes show them, but count only once saved:
// cancelling, the cross or Escape put back what was there when the dialog opened.
const changed = () => {
  state.dirty = true;
  render();
};

const snapshot = () => {
  // Empty rather than missing, so putting it back clears what was typed into a fresh setup too.
  const { fitness, trainers: list } = savedDefaults();
  return { fitness: fitness ?? {}, trainers: list ?? [] };
};

function save() {
  state.saved = true;
  byId("settingsDialog").close();
  if (!state.dirty) return;
  window.dispatchEvent(new Event("settings-change"));
  state.onTrainers();
}

const typedNumber = (input) => {
  const value = Number(input.value);
  return input.value.trim() && value > 0 ? Math.round(value) : null;
};

function numberField(label, value, placeholder, apply, { min, max } = {}) {
  const field = node("label", { class: "settings-field" });
  const input = node("input", { type: "number", inputmode: "numeric", "data-key": label, ...(min ? { min } : {}), ...(max ? { max } : {}) });
  input.value = value ?? "";
  input.placeholder = placeholder;
  input.addEventListener("change", () => apply(typedNumber(input)));
  field.append(node("span", {}, label), input);
  return field;
}

// A day typed in the app's language (13. 10. 2026, or 13/10/2026 in English) rather than the browser's,
// as a date field follows the browser; the app's own calendar (weeks from Monday) behind a button. onChange gets "YYYY-MM-DD" or null.
function dateField(key, value, onChange) {
  const box = node("span", { class: "date-field" });
  const text = node("input", { type: "text", inputmode: "numeric", "data-key": key, "aria-label": t("settingsFtpFrom") });
  const button = node("button", { type: "button", class: "date-field-button", "aria-label": t("settingsPickDate"), title: t("settingsPickDate") });
  button.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>`;
  const shown = (key) => formatDay(key, appState.language);
  text.value = shown(value);
  text.placeholder = appState.language === "en" ? "dd/mm/yyyy" : "d. m. rrrr";
  text.addEventListener("change", () => {
    const day = parseDay(text.value);
    if (day === undefined) text.value = shown(value);
    else onChange(day);
  });
  button.addEventListener("click", () => openDatePicker(box, value, onChange));
  box.append(text, button);
  return box;
}

const autoHint = (value) => (value ? `${t("fitnessAuto")} ${value}` : "—");

function renderNav() {
  byId("settingsSave").disabled = !state.dirty;
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
  pane.append(grid, weightBlock(), cloudBlock());
  return pane;
}

function trainersBlock(sport) {
  const block = node("div", { class: "settings-block" });
  const title = node("div", { class: "panel-title-row" });
  const add = node("button", { type: "button", class: "outline-button" }, t("trainerAdd"));
  add.addEventListener("click", () => {
    saveTrainers([...trainers(), { id: `trainer-${Date.now().toString(36)}`, name: t("newTrainer"), sport, levels: 10, defaultLevel: 5 }]);
    state.dirty = true;
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
      state.dirty = true;
      render();
    };
    const name = node("input", { type: "text", class: "name-input", "aria-label": t("trainerName"), "data-key": `${trainer.id}-name` });
    name.value = trainer.name;
    name.addEventListener("change", () => update({ name: name.value.trim() || trainer.name }));
    const level = (value, label, apply) => {
      const input = node("input", { type: "number", class: "level-input", min: "1", "aria-label": label, "data-key": `${trainer.id}-${label}` });
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
      state.dirty = true;
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
      const input = node("input", { type: "number", min: "1", max: "300", inputmode: "numeric", "aria-label": `Z${index + 1} %`, "data-key": `${by}-${index}` });
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

// The FTP over time: each record holds from its day until the next; without one in force the estimate counts.
// The weight history as the FTP's: each record holds from its day, so a new weight leaves the past W/kg as it was.
// Syncing through Dropbox: connect, its state, sync now, disconnect. Only once the app has its Dropbox key.
function cloudBlock() {
  const block = node("div", { class: "settings-block" });
  if (!cloudAvailable()) return block;
  const draw = () => {
    const { connected, state, error, at } = cloudStatus();
    const line = !connected ? t("cloudOff")
      : state === "syncing" ? t("cloudSyncing")
      : state === "error" ? t("cloudError", { message: error })
      : at ? t("cloudSynced", { when: new Date(at).toLocaleString(appState.language === "en" ? "en-GB" : "cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) })
      : t("cloudConnected");
    const actions = node("div", { class: "settings-cloud-actions" });
    if (connected) {
      const now = node("button", { type: "button", class: "outline-button" }, t("cloudSyncNow"));
      now.addEventListener("click", () => syncNow());
      const off = node("button", { type: "button", class: "link-button" }, t("cloudDisconnect"));
      off.addEventListener("click", () => {
        if (window.confirm(t("cloudDisconnectConfirm"))) disconnectCloud();
      });
      actions.append(now, off);
    } else {
      const on = node("button", { type: "button", class: "export-button" }, t("cloudConnect"));
      on.addEventListener("click", () => connectCloud());
      actions.append(on);
    }
    block.replaceChildren(node("h4", {}, t("cloudTitle")), node("p", { class: "field-note" }, t("cloudNote")), node("p", { class: `settings-cloud-state${state === "error" ? " is-error" : ""}` }, line), actions);
  };
  draw();
  // Kept current while the dialog is open; the listener goes with the block.
  const stop = onCloudStatus(() => (block.isConnected ? draw() : stop()));
  return block;
}

// The sport's next race or FTP test: a day and an optional name, for the analysis to plan the rest before it
// from that sport's workouts.
function goalBlock(sport) {
  const block = node("div", { class: "settings-block" });
  const goal = savedSport(sport).goal ?? {};
  const write = (patch) => {
    const next = { ...goal, ...patch };
    saveSport(sport, { goal: next.day ? next : null });
    changed();
  };
  block.append(node("h4", {}, t("settingsGoal")), node("p", { class: "field-note" }, t("settingsGoalNote")));
  const row = node("div", { class: "settings-goal" });
  const name = node("input", { type: "text", "data-key": `goal-name-${sport}`, "aria-label": t("settingsGoalName"), placeholder: t("settingsGoalName") });
  name.value = goal.name ?? "";
  name.addEventListener("change", () => write({ name: name.value.trim() || null }));
  row.append(dateField(`goal-day-${sport}`, goal.day ?? null, (day) => write({ day })), name);
  block.append(row);
  // The time to train each week, in hours to the tenth, for the weekly summary to measure each week by.
  const weekly = node("label", { class: "settings-field settings-weekly" });
  // Number fields, so the arrows and the wheel step the value: half hours, whole kilometres.
  const hours = node("input", { type: "number", min: "0", step: "0.5", inputmode: "decimal", "data-key": `weekly-hours-${sport}`, placeholder: "—" });
  const typed = savedSport(sport).weeklyHours;
  hours.value = typed ? String(typed) : "";
  hours.addEventListener("change", () => {
    const value = Math.round(Number(hours.value.replace(",", ".")) * 10) / 10;
    if (!hours.value.trim() || value > 0) {
      saveSport(sport, { weeklyHours: hours.value.trim() ? value : null });
      changed();
    } else hours.value = typed ? String(typed) : "";
  });
  weekly.append(node("span", {}, t("settingsWeeklyHours")), hours);
  // Or the distance each week, in whole kilometres.
  const distance = node("label", { class: "settings-field settings-weekly" });
  const kmInput = node("input", { type: "number", min: "0", step: "1", inputmode: "numeric", "data-key": `weekly-km-${sport}`, placeholder: "—" });
  const typedKm = savedSport(sport).weeklyKm;
  kmInput.value = typedKm ? String(typedKm) : "";
  kmInput.addEventListener("change", () => {
    const value = Math.round(Number(kmInput.value.replace(",", ".")));
    if (!kmInput.value.trim() || value > 0) {
      saveSport(sport, { weeklyKm: kmInput.value.trim() ? value : null });
      changed();
    } else kmInput.value = typedKm ? String(typedKm) : "";
  });
  distance.append(node("span", {}, t("settingsWeeklyKm")), kmInput);
  const both = node("div", { class: "settings-weekly-row" });
  both.append(weekly, distance);
  block.append(both);
  // The days of the week trained on, for the week's plan; none picked lets the plan take the usual ones.
  const chosen = new Set(savedSport(sport).trainingDays ?? []);
  const daysRow = node("div", { class: "segmented settings-days", role: "group", "aria-label": t("settingsTrainingDays") });
  for (let day = 0; day < 7; day += 1) {
    const name = new Date(Date.UTC(2024, 0, 1 + day)).toLocaleDateString(appState.language === "en" ? "en-GB" : "cs-CZ", { weekday: "short", timeZone: "UTC" });
    const button = node("button", { type: "button", "aria-pressed": String(chosen.has(day)), "data-key": `training-day-${sport}-${day}` }, name);
    button.addEventListener("click", () => {
      if (chosen.has(day)) chosen.delete(day);
      else chosen.add(day);
      saveSport(sport, { trainingDays: chosen.size ? [...chosen].sort((a, b) => a - b) : null });
      changed();
    });
    daysRow.append(button);
  }
  block.append(node("span", { class: "settings-label settings-days-label" }, t("settingsTrainingDays")), daysRow, node("p", { class: "field-note" }, t("settingsTrainingDaysNote")));
  return block;
}

function weightBlock() {
  const block = node("div", { class: "settings-ftp" });
  const title = node("div", { class: "panel-title-row" });
  const add = node("button", { type: "button", class: "outline-button" }, t("settingsWeightAdd"));
  const history = savedWeights();
  const write = (list) => {
    saveFitness({ weightHistory: list, weight: null });
    changed();
  };
  // The first weight holds from the first workout, so the whole library gets its W/kg; later ones from today.
  const firstWorkout = state.entries.length ? dayKey(Math.min(...state.entries.map((entry) => entry.startMs)), zone) : null;
  const from = !history.length && firstWorkout ? firstWorkout : dayKey(Date.now(), zone);
  add.addEventListener("click", () => write([...history.filter((item) => item.from !== from), { from, kg: weightOn({ weightHistory: history, timeZone: zone }, Date.now()) || 75 }]));
  title.append(node("span", { class: "settings-label" }, t("settingsWeightHistory")), add);
  block.append(title, node("p", { class: "field-note" }, t("settingsWeightNote")));
  if (!history.length) return block;
  const table = node("table", { class: "laps-table settings-ftp-table" });
  const head = node("tr");
  head.append(...[t("settingsFtpFrom"), t("settingsWeightLabel"), ""].map((label) => node("th", {}, label)));
  table.append(node("thead"), node("tbody"));
  table.tHead.append(head);
  const order = history.map((record, index) => ({ record, index })).sort((a, b) => (b.record.from ?? "").localeCompare(a.record.from ?? ""));
  for (const { record, index } of order) {
    const update = (patch) => write(history.map((item, at) => (at === index ? { ...item, ...patch } : item)));
    const from = dateField(`weight-from-${index}`, record.from, (value) => update({ from: value }));
    // Text with a decimal keyboard, as a number field drops a comma under some browser languages.
    const kg = node("input", { type: "text", inputmode: "decimal", pattern: "[0-9]+([.,][0-9])?", class: "level-input", "data-key": `weight-value-${index}`, "aria-label": t("settingsWeightLabel") });
    kg.value = displayNumber(record.kg, record.kg % 1 ? 1 : 0);
    kg.addEventListener("change", () => {
      const value = Math.round(Number(kg.value.replace(",", ".")) * 10) / 10;
      if (value >= 30) update({ kg: value });
      else kg.value = displayNumber(record.kg, record.kg % 1 ? 1 : 0);
    });
    const remove = node("button", { type: "button", class: "link-button" }, t("libraryDelete"));
    remove.addEventListener("click", () => write(history.filter((_, at) => at !== index)));
    const row = node("tr");
    const fromCell = node("td");
    fromCell.append(from);
    if (!record.from) fromCell.append(node("span", { class: "settings-ftp-start" }, t("settingsFtpStart")));
    row.append(fromCell, ...[kg, remove].map((control) => {
      const cell = node("td");
      cell.append(control);
      return cell;
    }));
    table.tBodies[0].append(row);
  }
  block.append(table);
  return block;
}

function ftpBlock(sport, settings, estimate) {
  const block = node("div", { class: "settings-ftp" });
  const title = node("div", { class: "panel-title-row" });
  const add = node("button", { type: "button", class: "outline-button" }, t("settingsFtpAdd"));
  const history = savedSport(sport).ftpHistory ?? [];
  const write = (list) => {
    saveSport(sport, { ftpHistory: list });
    changed();
  };
  add.addEventListener("click", () => write([...history, { from: dayKey(Date.now(), zone), ftp: currentFtp(settings, sport) || 200 }]));
  title.append(node("span", { class: "settings-label" }, t("settingsFtpHistory")), add);
  block.append(title, node("p", { class: "field-note" }, t("settingsFtpNote", { estimate: estimate ? `${estimate} W` : "—" })));
  if (!history.length) return block;
  const table = node("table", { class: "laps-table settings-ftp-table" });
  const head = node("tr");
  head.append(...[t("settingsFtpFrom"), "FTP (W)", ""].map((label) => node("th", {}, label)));
  table.append(node("thead"), node("tbody"));
  table.tHead.append(head);
  // Newest first; the order typed does not matter, as each record counts from its own day.
  const order = history.map((record, index) => ({ record, index })).sort((a, b) => (b.record.from ?? "").localeCompare(a.record.from ?? ""));
  for (const { record, index } of order) {
    const update = (patch) => write(history.map((item, at) => (at === index ? { ...item, ...patch } : item)));
    const from = dateField(`ftp-from-${index}`, record.from, (value) => update({ from: value }));
    const watts = node("input", { type: "number", min: "30", max: "600", inputmode: "numeric", class: "level-input", "data-key": `ftp-value-${index}`, "aria-label": "FTP" });
    watts.value = String(record.ftp);
    watts.addEventListener("change", () => {
      const value = Math.round(Number(watts.value));
      if (value >= 30) update({ ftp: value });
      else watts.value = String(record.ftp);
    });
    const remove = node("button", { type: "button", class: "link-button" }, t("libraryDelete"));
    remove.addEventListener("click", () => write(history.filter((_, at) => at !== index)));
    const row = node("tr");
    const fromCell = node("td");
    fromCell.append(from);
    if (!record.from) fromCell.append(node("span", { class: "settings-ftp-start" }, t("settingsFtpStart")));
    row.append(fromCell, ...[watts, remove].map((control) => {
      const cell = node("td");
      cell.append(control);
      return cell;
    }));
    table.tBodies[0].append(row);
  }
  block.append(table);
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
  );
  thresholds.append(grid, ftpBlock(sport, settings, estimate.ftp));
  const zones = node("div", { class: "settings-zone-grid" });
  zones.append(zonesBlock(sport, "heartRate", settings), zonesBlock(sport, "power", settings));
  pane.append(thresholds, zones, goalBlock(sport));
  return pane;
}

// A redraw after an edit keeps the field being edited focused, so arrow keys go on stepping it
// rather than scrolling the page behind the dialog.
function render() {
  const focused = byId("settingsPanes").contains(document.activeElement) ? document.activeElement.dataset.key : null;
  const panes = byId("settingsPanes");
  const scroll = panes.scrollTop;
  renderNav();
  fitHeight();
  panes.replaceChildren(state.pane === "general" ? generalPane() : sportPane(state.pane));
  panes.scrollTop = scroll;
  if (focused) panes.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

// The dialog keeps one height whichever section is open: the rowing section's, the fullest one, as it now stands.
function fitHeight() {
  const dialog = byId("settingsDialog");
  if (!dialog.open) return;
  const panes = byId("settingsPanes");
  dialog.style.height = "";
  panes.replaceChildren(sportPane("rowing"));
  dialog.style.height = `${dialog.offsetHeight}px`;
}

// Opens on the pane given, or on the sport of the open activity or analysis, or where it was left.
export async function openSettings(pane) {
  const sport = typeof pane === "string" ? pane : state.sport();
  if (sports.includes(sport) || sport === "general") state.pane = sport;
  state.entries = await listEntries().catch(() => []);
  state.before = snapshot();
  keepUndo(state.before);
  state.dirty = false;
  state.saved = false;
  byId("settingsDialog").showModal();
  render();
}

// What the settings were when the dialog opened, kept in storage until it closes: edits are written as typed,
// so a reload or a closed tab with the dialog open would otherwise keep them unsaved. The next start puts it back.
const undoKey = "kinomap-settings-undo";

function keepUndo(before) {
  try {
    if (before) localStorage.setItem(undoKey, JSON.stringify(before));
    else localStorage.removeItem(undoKey);
  } catch {}
}

function restoreUnsaved() {
  try {
    const before = JSON.parse(localStorage.getItem(undoKey));
    if (before) saveDefaults(before);
    localStorage.removeItem(undoKey);
  } catch {}
}

// At load, before anything reads the settings.
restoreUnsaved();

// onTrainers runs after a save, so the converter's trainer list stays current;
// currentSport gives the sport to open on.
export function setupSettings({ onTrainers, currentSport }) {
  state.onTrainers = onTrainers;
  state.sport = currentSport;
  byId("settingsButton").addEventListener("click", () => openSettings());
  const dialog = byId("settingsDialog");
  byId("settingsClose").addEventListener("click", () => dialog.close());
  byId("settingsCancel").addEventListener("click", () => dialog.close());
  byId("settingsSave").addEventListener("click", save);
  dialog.addEventListener("close", () => {
    if (!state.saved && state.dirty) saveDefaults(state.before);
    keepUndo(null);
  });
}
