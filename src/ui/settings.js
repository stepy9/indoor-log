import { allEntries } from "./entries.js";
import { sameValue } from "../values.js";
import { readJson, writeJson } from "./storage.js";
import { node } from "./dom.js";
import { ftpRecords, weightRecords, zoneLimits, estimateMaxHeartRate, forSport, weightOn, ftpOn, ftpTimeline, heartRateAt, heartRateZones, powerZones } from "../fitness.js";
import { changedTimesOf, restoreDefaults, saveDefaults, savedDefaults, settingsChanged } from "./preferences.js";
import { confirmDialog } from "./confirm.js";
import { showToast } from "./toast.js";
import { percentSteps, percentTable, saveTrainers, trainers } from "./trainers.js";

// Trainers whose percentage conversion is unfolded in the settings, kept across re-renders.
const openConversions = new Set();
import { byId, displayNumber, locale, shortDay, sportLabel, state as appState, t, zone } from "./context.js";
import { addDays, dayKey } from "../diary.js";
import { goalFor, withGoal } from "../year-goal.js";
import { changeDay, fromGoalHistory, fromRecords, withRecords, setValue, trackedGeneral, trackedSport, valueOn } from "../history.js";
import { openDatePicker } from "./datepicker.js";
import { backupIsDue, downloadBackup, libraryBlock, restoreBackup } from "./library.js";
import { cloudAvailable, cloudStatus, connectCloud, disconnectCloud, fitBackupOn, onCloudStatus, releaseSync, setFitBackup, setSyncHold, syncNow, uploadFitFiles, fitBackupCoverage, rebuildMissingFits, checkDropboxFits } from "./cloud.js";
import { formatDay, parseDay, todayKey } from "../dates.js";
import { parseKinomapPlan, setCalorieProfile } from "../core.js";
import { checkNumber, checkText, markField } from "./validate.js";
import { planPrefLimits, restAfterLongDefault } from "../plan.js";
import { defaultKinomapNotes, defaultKinomapPlans, defaultKinomapWorkouts, planForName, stepsFromSegments } from "../training.js";
import { editWorkoutOnShow, workoutList } from "./workouts.js";
import { withTip } from "./info.js";
import { bodyStatus } from "../reminders.js";
import { parseGarminCsv } from "../garmin-csv.js";

// The Settings dialog: general values, then one section per sport with its trainers, thresholds and zones.
// Everything is saved as it is typed and lives with the other remembered settings, so a backup carries it.

const sports = ["rowing", "cycling", "running"];
const defaultRestHeartRate = 60;

const remembered = () => savedDefaults().fitness ?? {};

// Each change of a setting with a history is kept from the day it holds from, the days before keeping theirs.
function withHistory(own, patch, keys) {
  const today = todayKey(zone);
  const history = { ...own.history, ...patch.history };
  for (const key of keys) {
    if (!(key in patch) || sameValue(own[key], patch[key])) continue;
    history[key] = setValue(history[key], own[key], patch[key], changeDay(key, today));
  }
  return history;
}

function saveFitness(patch) {
  const saved = remembered();
  const tracked = trackedGeneral.some((key) => key in patch);
  saveDefaults({ fitness: { ...saved, ...patch, ...(tracked ? { history: withHistory({ ...saved, history: savedHistory() }, patch, trackedGeneral) } : {}) } });
}

// One sport's typed values, with what older settings kept for every sport folded in.
function savedSport(sport) {
  const saved = remembered();
  const own = { ftp: saved.ftp?.[sport] ?? null, ...saved.sports?.[sport] };
  // A sport's own maximum overrides the general one; a copy of the general one, as earlier versions saved, is none.
  if (own.maxHeartRate === saved.maxHeartRate) own.maxHeartRate = null;
  // A single FTP, as earlier versions kept it, is a history holding from the start.
  own.history = { ...own.history };
  // The FTP records as earlier versions listed them, or a single FTP from the start, become the FTP's history.
  if (!own.history.ftp) {
    const listed = own.ftpHistory ?? (own.ftp ? [{ from: null, ftp: own.ftp }] : []);
    if (listed.length) own.history.ftp = fromRecords(listed, "ftp");
  }
  delete own.ftp;
  delete own.ftpHistory;
  // The weekly goals' own history, as the first version kept it, becomes theirs in the shared one.
  if (own.goalHistory) {
    for (const key of ["weeklyHours", "weeklyKm"]) if (!own.history[key]) own.history[key] = fromGoalHistory(own.goalHistory, key);
  }
  delete own.goalHistory;
  return own;
}

// The general histories; the weight records as earlier versions listed them, or a single weight from the start, as the weight's.
function savedHistory() {
  const saved = remembered();
  const history = { ...saved.history };
  if (!history.weight) {
    const listed = saved.weightHistory ?? (saved.weight ? [{ from: null, kg: saved.weight }] : []);
    if (listed.length) history.weight = fromRecords(listed, "kg");
  }
  return history;
}

const savedWeights = () => weightRecords({ history: savedHistory() });

// The body weight on the day of the moment, for the power per kilogram anywhere in the app; null without one.
export const weightOnDay = (ms) => weightOn({ history: savedHistory(), timeZone: zone }, ms);

// Sex, age in the moment's year and weight on its day, for the calories estimated from the heart rate.
setCalorieProfile((ms) => {
  const saved = remembered();
  const year = new Date(ms).getUTCFullYear();
  return { sex: saved.sex ?? null, age: saved.birthYear ? year - saved.birthYear : null, weight: weightOnDay(ms) };
});

// Power per kilogram as text by the weight on the day, empty without a weight.
export function perKgText(watts, ms) {
  const kg = weightOnDay(ms);
  return kg && Number.isFinite(watts) ? `${displayNumber(watts / kg, 2)} W/kg` : "";
}

// The weight and resting heart rate as they stand today, for the quick entry in the diary.
export const bodyToday = () => bodyStatus(remembered(), savedHistory(), todayKey(zone));

// The general histories, for the charts of the weight and the resting heart rate.
export const bodyHistory = () => savedHistory();

// A value entered in the diary: a new one is written from today; the same one, or none, only marks it checked
// today. The first weight ever holds from the first workout (firstDay), so the whole library gets its W/kg.
export function enterBodyValue(key, value, firstDay = null) {
  const saved = remembered();
  const today = todayKey(zone);
  const reminders = { ...saved.reminders, [key]: today };
  // The HRV and the sleep: a value of each night, written for the day woken up on.
  if (key === "hrv" || key === "sleep") {
    if (!(value > 0)) return;
    const list = [...(savedHistory()[key] ?? []).filter((record) => record.from !== today), { from: today, value, at: Date.now() }].sort((a, b) => a.from.localeCompare(b.from));
    saveFitness({ history: { ...savedHistory(), [key]: list } });
    return;
  }
  if (key === "weight") {
    const current = weightOn({ history: savedHistory(), timeZone: zone }, Date.now());
    if (value > 0 && value !== current) {
      const from = !savedWeights().length && firstDay && firstDay < today ? firstDay : today;
      const list = [...savedWeights().filter((item) => item.from !== from), { from, kg: value }];
      saveFitness({ reminders, history: { ...savedHistory(), weight: withRecords(savedHistory().weight, list, "kg") }, weightHistory: undefined, weight: undefined });
      return;
    }
  } else if (value > 0 && value !== saved.restHeartRate) {
    saveFitness({ reminders, restHeartRate: value });
    return;
  }
  saveFitness({ reminders });
}

// A weekly goal changed holds from this week's Monday on; the weeks before keep the goal they had
// (the first change keeps the one before it for all earlier weeks), as every setting with a history.
const saveGoal = (sport, key, value) => saveSport(sport, { [key]: value });

// The weekly goal that held in the week from the Monday given.
export const goalOn = (own, key, monday) => valueOn(own?.history?.[key], monday, own?.[key]) ?? 0;

function saveSport(sport, patch) {
  const saved = remembered();
  const own = savedSport(sport);
  saveFitness({ sports: { ...saved.sports, [sport]: { ...own, ...patch, history: withHistory(own, patch, trackedSport) } } });
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
    defaultRestHeartRate,
    typedMaxHeartRate: remembered().maxHeartRate || null,
    history: savedHistory(),
    sports: Object.fromEntries(sports.map((sport) => {
      const saved = savedSport(sport);
      return [sport, { ...saved, typedMaxHeartRate: saved.maxHeartRate || null, maxHeartRate: saved.maxHeartRate || generalMax }];
    })),
  };
}

// Suggestions the Analysis tab offers and the user takes or turns down; each turned down is not offered again.
export const dismissed = () => new Set(remembered().dismissed ?? []);

export function dismiss(key) {
  saveFitness({ dismissed: [...dismissed(), key].slice(-200) });
}

// The FTP records listed by hand, written as the FTP's history.
function writeFtp(sport, list) {
  const own = savedSport(sport);
  saveSport(sport, { history: { ...own.history, ftp: withRecords(own.history.ftp, list, "ftp") } });
}

export function addFtpRecord(sport, record) {
  writeFtp(sport, [...ftpRecords(savedSport(sport)).filter((item) => item.from !== record.from), record]);
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
  ? ftpRecords(savedSport(sport)).some((record) => record.ftp > 0 && (!record.from || record.from <= todayKey(zone)))
  : Boolean(savedSport(sport)[field]));

// tab: the open part of a sport's pane, the same for every sport.
const state = { pane: "general", tab: "trainers", entries: [], onTrainers: () => {}, sport: () => null };
const sportTabs = ["trainers", "zones", "plan", "kinomap"];


// Edits are written as they are made, so the panes show them, but count only once saved:
// cancelling, the cross or Escape put back what was there when the dialog opened.
const changed = () => {
  state.dirty = true;
  render();
};

const snapshot = () => {
  // Empty rather than missing, so putting it back clears what was typed into a fresh setup too; with the times
  // they last changed, put back with them.
  const { fitness, trainers: list } = savedDefaults();
  return { fitness: fitness ?? {}, trainers: list ?? [], changedAt: changedTimesOf(["fitness", "trainers"]) };
};
const putBack = ({ changedAt, ...values }) => restoreDefaults(values, changedAt);

// Saving needs a change and no field still marked wrong; the button says which field holds it back.
function updateSaveButton() {
  const button = byId("settingsSave");
  const wrong = byId("settingsDialog").querySelector('input[aria-invalid="true"]');
  button.disabled = !state.dirty || Boolean(wrong);
  byId("settingsUnsaved").hidden = !state.dirty;
  button.dataset.tip = wrong ? t("fieldsInvalid") : "";
}

function save() {
  if (byId("settingsDialog").querySelector('input[aria-invalid="true"]')) return;
  state.saved = true;
  byId("settingsDialog").close();
  if (!state.dirty) return;
  showToast(t("savedSettings"));
  settingsChanged();
  state.onTrainers();
}

function numberField(label, value, placeholder, apply, { min, max } = {}) {
  const field = node("label", { class: "settings-field" });
  const input = node("input", { type: "number", inputmode: "numeric", "data-key": label, ...(min ? { min } : {}), ...(max ? { max } : {}) });
  input.value = value ?? "";
  input.placeholder = placeholder;
  // A wrong number is marked and left unsaved; an empty field clears the value.
  input.addEventListener("change", () => {
    const value = checkNumber(input, { min, max });
    if (value !== undefined) apply(value);
  });
  field.append(node("span", {}, label), input);
  return field;
}

// A day typed in the app's language (13. 10. 2026, or 13/10/2026 in English) rather than the browser's,
// as a date field follows the browser; the app's own calendar (weeks from Monday) behind a button. onChange gets "YYYY-MM-DD" or null.
function dateField(key, value, onChange) {
  const box = node("span", { class: "date-field" });
  const text = node("input", { type: "text", inputmode: "numeric", "data-key": key, "aria-label": t("settingsFtpFrom") });
  const button = node("button", { type: "button", class: "date-field-button", "aria-label": t("settingsPickDate"), "data-tip": t("settingsPickDate") });
  button.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>`;
  const shown = (key) => formatDay(key, appState.language);
  text.value = shown(value);
  text.placeholder = appState.language === "en" ? "dd/mm/yyyy" : "d. m. rrrr";
  text.addEventListener("change", () => {
    const day = parseDay(text.value);
    if (markField(text, day === undefined ? t("fieldBadDate") : null)) onChange(day);
  });
  button.addEventListener("click", () => openDatePicker(box, value, onChange));
  box.append(text, button);
  return box;
}

const autoHint = (value) => (value ? `${t("fitnessAuto")} ${value}` : "—");

function renderNav() {
  updateSaveButton();
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
  const sexField = node("label", { class: "settings-field" });
  const sex = node("select", { "data-key": "sex" });
  sex.append(...[["", t("settingsSexUnset")], ["male", t("settingsSexMale")], ["female", t("settingsSexFemale")]].map(([value, label]) => new Option(label, value)));
  sex.value = remembered().sex ?? "";
  sex.addEventListener("change", () => {
    saveFitness({ sex: sex.value || null });
    changed();
  });
  sexField.append(node("span", {}, t("settingsSex")), sex);
  grid.append(sexField, numberField(t("settingsBirthYear"), remembered().birthYear, "—", (value) => {
    saveFitness({ birthYear: value });
    changed();
  }, { min: 1920, max: new Date().getFullYear() }));
  // The diary asks for the weight and the resting heart rate again after a while, unless turned off here.
  const remind = node("label", { class: "check-field" });
  const remindBox = node("input", { type: "checkbox", "data-key": "reminders" });
  remindBox.checked = !remembered().reminders?.off;
  remindBox.addEventListener("change", () => saveFitness({ reminders: { ...remembered().reminders, off: !remindBox.checked } }));
  remind.append(remindBox, " ", node("span", {}, t("settingsReminders")));
  pane.append(grid, node("p", { class: "field-note" }, t("settingsCaloriesNote")), weightBlock(), remind, node("p", { class: "field-note" }, t("settingsRemindersNote")), garminBlock(), cloudBlock(), backupBlock(), libraryBlock(state.entries));
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
  title.append(withTip(node("h4", {}, t("trainersTitle")), t("trainersHint")), add);
  block.append(title);
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
    name.maxLength = 60;
    name.addEventListener("change", () => {
      const text = checkText(name, { maxLength: 60 });
      if (text !== undefined) update({ name: text });
    });
    const level = (value, label, apply, max) => {
      const input = node("input", { type: "number", class: "level-input", min: "1", "aria-label": label, "data-key": `${trainer.id}-${label}` });
      input.value = String(value);
      input.addEventListener("change", () => {
        const next = checkNumber(input, { min: 1, max, required: true });
        if (next !== undefined) apply(next);
      });
      return input;
    };
    const levels = level(trainer.levels, t("trainerLevels"), (value) => update({ levels: value, defaultLevel: Math.min(trainer.defaultLevel, value) }), 100);
    const usual = level(trainer.defaultLevel, t("trainerDefault"), (value) => update({ defaultLevel: value }), trainer.levels);
    const remove = node("button", { type: "button", class: "link-button" }, t("delete"));
    remove.addEventListener("click", async () => {
      if (!(await confirmDialog({ title: t("trainerDeleteConfirm", { name: trainer.name }), ok: t("delete"), danger: true }))) return;
      saveTrainers(trainers().filter((item) => item.id !== trainer.id));
      state.dirty = true;
      render();
    });
    const open = openConversions.has(trainer.id);
    const toggle = node("button", { type: "button", class: "link-button", "aria-expanded": String(open) }, t("trainerConversion"));
    toggle.addEventListener("click", () => {
      if (open) openConversions.delete(trainer.id);
      else openConversions.add(trainer.id);
      render();
    });
    const actions = node("span", { class: "trainer-actions" });
    actions.append(toggle, remove);
    const row = node("tr");
    const labels = [t("trainerName"), t("trainerLevels"), t("trainerDefault"), ""];
    row.append(...[name, levels, usual, actions].map((control, column) => {
      const cell = node("td", { "data-label": labels[column] });
      cell.append(control);
      return cell;
    }));
    table.tBodies[0].append(row);
    if (open) table.tBodies[0].append(conversionRow(trainer, update));
  }
  const scroll = node("div", { class: "laps-scroll" });
  scroll.append(table);
  block.append(scroll);
  return block;
}

// The level a Kinomap plan's percentage becomes, every 5 %, filled from the formula until changed.
function conversionRow(trainer, update) {
  const row = node("tr", { class: "trainer-conversion" });
  const cell = node("td", { colspan: "4" });
  const grid = node("div", { class: "conversion-grid" });
  const levels = percentTable(trainer);
  percentSteps.forEach((percent, index) => {
    const input = node("input", { type: "number", class: "level-input", min: "1", max: String(trainer.levels), "aria-label": `${percent} %`, "data-key": `${trainer.id}-pct-${percent}` });
    input.value = String(levels[index]);
    input.addEventListener("change", () => {
      const next = checkNumber(input, { min: 1, max: trainer.levels, required: true });
      if (next === undefined) return;
      const table = percentTable(trainer);
      table[index] = next;
      update({ percentLevels: table });
    });
    const field = node("label", { class: "conversion-step" });
    field.append(node("span", {}, `${percent} %`), input);
    grid.append(field);
  });
  const note = node("p", { class: "field-note" }, t(trainer.percentLevels ? "trainerConversionOwn" : "trainerConversionFormula"));
  cell.append(note, grid);
  if (trainer.percentLevels) {
    const reset = node("button", { type: "button", class: "link-button" }, t("trainerConversionReset"));
    reset.addEventListener("click", () => update({ percentLevels: undefined }));
    cell.append(reset);
  }
  row.append(cell);
  return row;
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
  const heading = withTip(node("h4", {}, t(by === "power" ? "settingsPowerZones" : "settingsHeartRateZones")), by === "power" ? t("settingsPowerZonesNote")
    : own.heartRateBasis === "reserve" ? t("settingsReserveNote", { rest: displayNumber(own.restHeartRate) }) : t("settingsHeartRateZonesNote"));
  title.append(heading, reset);
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
  const list = node("div", { class: "settings-zones" });
  bounds.forEach((bound, index) => {
    const row = node("div", { class: "settings-zone", "data-field-row": "" });
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
      const limit = Math.round(zoneLimits[by] * 100);
      const input = node("input", { type: "number", min: "1", max: String(limit), inputmode: "numeric", "aria-label": `Z${index + 1} %`, "data-key": `${by}-${index}` });
      input.value = String(Math.round(bound * 100));
      input.addEventListener("change", () => {
        const percent = checkNumber(input, { min: 1, max: limit, required: true });
        if (percent === undefined) return;
        const typed = bounds.map((value, at) => (at === index ? percent / 100 : value));
        if (!typed.every((value, at) => !at || value > typed[at - 1])) {
          markField(input, t("settingsZonesRising"));
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
  block.append(list);
  return block;
}

// The FTP over time: each record holds from its day until the next; without one in force the estimate counts.
// The weight history as the FTP's: each record holds from its day, so a new weight leaves the past W/kg as it was.
// Syncing through Dropbox: connect, its state, sync now, disconnect. Only once the app has its Dropbox key.
// How many activities have their FIT in Dropbox, which do not, and a way to put theirs together from the library.
async function fitCoverageInto(container) {
  const { total, done, rebuilt, missing } = await fitBackupCoverage();
  const line = node("p", { class: `settings-cloud-state is-${missing.length ? "off" : "ok"}` });
  line.append(node("span", { class: "settings-cloud-icon", "aria-hidden": "true" }, missing.length ? "!" : "✓"),
    document.createTextNode(t("cloudFitCoverage", { done, total }) + (rebuilt ? " " + t("cloudFitRebuiltCount", { count: rebuilt }) : "")));
  const parts = [line];
  if (missing.length) {
    const details = node("details", { class: "settings-cloud-missing" });
    const list = node("ul");
    for (const entry of missing) list.append(node("li", {}, `${shortDay(entry.startMs)} · ${entry.name}`));
    details.append(node("summary", {}, t("cloudFitMissing", { count: missing.length })), list);
    const rebuild = node("button", { type: "button", class: "outline-button" }, t("cloudFitRebuild", { count: missing.length }));
    const progress = node("span", { class: "field-note" });
    rebuild.addEventListener("click", async () => {
      rebuild.disabled = true;
      try {
        await rebuildMissingFits((doneCount, all) => (progress.textContent = t("cloudFitUploading", { done: doneCount, total: all })));
        fitCoverageInto(container);
      } catch (error) {
        progress.textContent = t("cloudError", { message: error.message });
        rebuild.disabled = false;
      }
    });
    const row = node("div", { class: "settings-cloud-actions" });
    row.append(rebuild, progress);
    parts.push(details, node("p", { class: "field-note" }, t("cloudFitRebuildNote")), row);
  }
  container.replaceChildren(...parts);
}

function cloudBlock() {
  const block = node("div", { class: "settings-block" });
  if (!cloudAvailable()) return block;
  const draw = () => {
    const { connected, state, error, at } = cloudStatus();
    const line = !connected ? t("cloudOff")
      : state === "syncing" ? t("cloudSyncing")
      : state === "error" ? t("cloudError", { message: error })
      : at ? t("cloudSynced", { when: new Date(at).toLocaleString(locale(), { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) })
      : t("cloudConnected");
    const actions = node("div", { class: "settings-cloud-actions" });
    let extra = [];
    if (connected) {
      const now = node("button", { type: "button", class: "outline-button" }, t("cloudSyncNow"));
      // With unsaved edits it waits: they must not go up, nor what comes in land under them.
      now.disabled = state.dirty;
      if (state.dirty) now.dataset.tip = t("cloudSyncAfterSave");
      now.addEventListener("click", () => syncNow());
      const off = node("button", { type: "button", class: "link-button" }, t("cloudDisconnect"));
      off.addEventListener("click", async () => {
        if (await confirmDialog({ title: t("cloudDisconnectConfirm"), ok: t("cloudDisconnect") })) disconnectCloud();
      });
      actions.append(now, off);
      const fit = Object.assign(document.createElement("input"), { type: "checkbox", checked: fitBackupOn() });
      fit.addEventListener("change", () => setFitBackup(fit.checked));
      const fitLabel = node("label", { class: "settings-cloud-fit" });
      fitLabel.append(fit, document.createTextNode(t("cloudFitBackup")));
      const pick = node("input", { type: "file", multiple: "", accept: ".fit", class: "visually-hidden" });
      const upload = node("button", { type: "button", class: "outline-button" }, t("cloudFitUpload"));
      const progress = node("span", { class: "field-note" });
      upload.addEventListener("click", () => pick.click());
      pick.addEventListener("change", async () => {
        upload.disabled = true;
        try {
          const count = await uploadFitFiles(pick.files, (done, total) => (progress.textContent = t("cloudFitUploading", { done, total })));
          progress.textContent = t("cloudFitUploaded", { count });
          const coverage = block.querySelector(".settings-cloud-coverage");
          if (coverage) fitCoverageInto(coverage);
        } catch (error) {
          progress.textContent = t("cloudError", { message: error.message });
        } finally {
          upload.disabled = false;
          pick.value = "";
        }
      });
      const uploadRow = node("div", { class: "settings-cloud-actions" });
      uploadRow.append(upload, pick, progress);
      const fitGroup = node("div", { class: "settings-cloud-group" });
      const coverage = node("div", { class: "settings-cloud-indent settings-cloud-coverage" });
      // What is already in Dropbox is looked through first, then the count shown.
      coverage.replaceChildren(node("p", { class: "field-note" }, t("cloudFitChecking")));
      checkDropboxFits().then(() => fitCoverageInto(coverage), (error) => {
        fitCoverageInto(coverage).then(() => coverage.prepend(node("p", { class: "settings-cloud-state is-error" }, /scope/.test(error.message) ? t("cloudReconnect") : t("cloudError", { message: error.message }))));
      });
      fitGroup.append(fitLabel, node("p", { class: "field-note settings-cloud-indent" }, t("cloudFitNote")), uploadRow, coverage);
      uploadRow.classList.add("settings-cloud-indent");
      extra = [fitGroup];
    } else {
      const on = node("button", { type: "button", class: "export-button" }, t("cloudConnect"));
      on.addEventListener("click", () => connectCloud());
      actions.append(on);
    }
    // A mark before the state: grey when off, turning while syncing, green when synced, red on a failure.
    const kind = !connected ? "off" : state === "syncing" ? "syncing" : state === "error" ? "error" : "ok";
    const stateLine = node("p", { class: `settings-cloud-state is-${kind}` });
    stateLine.append(node("span", { class: "settings-cloud-icon", "aria-hidden": "true" }, { off: "○", syncing: "↻", error: "!", ok: "✓" }[kind]), document.createTextNode(line));
    const statusGroup = node("div", { class: "settings-cloud-group" });
    statusGroup.append(stateLine);
    // What the last sync left the same on every device: a tick for what is there, a dash for what is not set.
    const { summary } = cloudStatus();
    if (connected && summary) {
      const items = [
        [t("cloudItemActivities"), summary.activities > 0, summary.activities],
        [t("cloudItemTrainers"), summary.trainers > 0, summary.trainers],
        [t("cloudItemWeight"), summary.weight],
        [t("cloudItemHeartRate"), summary.heartRate],
        [t("cloudItemThresholds"), summary.thresholds],
      ];
      const list = node("ul", { class: "settings-cloud-items" });
      for (const [label, set, count] of items) {
        const item = node("li", { class: set ? "is-set" : "" });
        item.append(node("span", { class: "settings-cloud-tick", "aria-hidden": "true" }, set ? "✓" : "–"), document.createTextNode(count != null ? `${label} (${count})` : label));
        item.dataset.tip = set ? t("cloudItemSynced") : t("cloudItemNotSet");
        list.append(item);
      }
      statusGroup.append(list);
    }
    statusGroup.append(actions);
    block.replaceChildren(node("h4", {}, t("cloudTitle")), node("p", { class: "field-note" }, t("cloudNote")), statusGroup, ...extra);
  };
  draw();
  // Kept current while the dialog is open; the listener goes with the block.
  const stop = onCloudStatus(() => (block.isConnected ? draw() : stop()));
  return block;
}

// The days' values from Garmin Connect's CSV files written into their histories: a day already there takes the
// file's value, the others stay. The resting heart rate in force becomes that of the latest day it has.
export function importBodyValues(found) {
  const saved = remembered();
  const history = { ...savedHistory() };
  const at = Date.now();
  for (const key of ["hrv", "sleep", "restHeartRate", "skinTemp"]) {
    const days = found[key] ?? {};
    if (!Object.keys(days).length) continue;
    let kept = (history[key] ?? []).filter((record) => !(record.from in days));
    // The resting heart rate keeps the one set before for the days before the first record.
    if (key === "restHeartRate" && !kept.some((record) => record.from === "0000-00-00")) kept = [...kept, { from: "0000-00-00", value: saved.restHeartRate ?? null, at: 0 }];
    history[key] = [...kept, ...Object.entries(days).map(([from, value]) => ({ from, value, at }))].sort((a, b) => a.from.localeCompare(b.from));
  }
  const rest = valueOn(history.restHeartRate, "9999-12-31", saved.restHeartRate);
  // Written as it is: the resting heart rate's history is already whole, no change from today to add to it.
  saveDefaults({ fitness: { ...saved, history, ...(rest ? { restHeartRate: rest } : {}) } });
}

// What the last import read, shown until the dialog is opened again.
let garminMessage = "";

// Importing Garmin Connect's CSV exports: the HRV status, the sleep, the resting heart rate.
function garminBlock() {
  const block = node("div", { class: "settings-block" });
  const pick = node("input", { type: "file", accept: ".csv,text/csv", multiple: "", class: "visually-hidden" });
  const load = node("button", { type: "button", class: "outline-button" }, t("garminImport"));
  const message = node("p", { class: "field-note" }, garminMessage);
  message.hidden = !garminMessage;
  load.addEventListener("click", () => pick.click());
  pick.addEventListener("change", async () => {
    const today = todayKey(zone);
    const found = { hrv: {}, sleep: {}, restHeartRate: {}, skinTemp: {} };
    for (const file of pick.files) {
      const read = parseGarminCsv(await file.text(), today);
      for (const key of Object.keys(found)) Object.assign(found[key], read[key]);
    }
    pick.value = "";
    const counts = Object.entries(found).filter(([, days]) => Object.keys(days).length);
    message.hidden = false;
    if (!counts.length) {
      message.textContent = t("garminImportNone");
      return;
    }
    // As a restore: what was imported is where Cancel goes back to, as it came from a file.
    importBodyValues(found);
    const all = counts.flatMap(([, days]) => Object.keys(days)).sort();
    garminMessage = t("garminImportDone", {
      what: counts.map(([key, days]) => `${t(`body_${key}`)} ${Object.keys(days).length}`).join(", "),
      from: formatDay(all[0], appState.language),
      to: formatDay(all.at(-1), appState.language),
    });
    state.before = snapshot();
    changed();
  });
  block.append(node("span", { class: "settings-label" }, t("garminImportTitle")), node("p", { class: "field-note" }, t("garminImportNote")), load, pick, message);
  return block;
}

// A backup to a file and back: the whole library and the settings in one JSON file. A restore makes what it
// brought the settings this dialog started from, so Cancel does not take them back.
function backupBlock() {
  const block = node("div", { class: "settings-block settings-backup" });
  const due = node("p", { class: "field-note backup-due" }, t("backupDue"));
  due.hidden = true;
  const note = node("p", { class: "field-note backup-message" });
  const save = node("button", { type: "button", class: "outline-button" }, t("libraryBackup"));
  save.disabled = !state.entries.length && !snapshot().trainers.length;
  save.addEventListener("click", () => downloadBackup());
  const pick = node("input", { type: "file", accept: ".json,application/json", class: "visually-hidden" });
  const load = node("button", { type: "button", class: "outline-button" }, t("libraryRestore"));
  load.addEventListener("click", () => pick.click());
  pick.addEventListener("change", async () => {
    const file = pick.files[0];
    pick.value = "";
    if (!file) return;
    const { text, type } = await restoreBackup(file);
    if (type === "success") {
      state.entries = await allEntries();
      state.before = snapshot();
      keepUndo(state.before);
      render();
    }
    // A restore draws the pane anew, so the message goes into the block shown now.
    const shown = byId("settingsPanes").querySelector(".settings-backup .backup-message") ?? note;
    Object.assign(shown, { textContent: text, className: `field-note backup-message is-${type}` });
  });
  const actions = node("div", { class: "settings-cloud-actions" });
  actions.append(save, load, pick);
  const group = node("div", { class: "settings-cloud-group" });
  group.append(due, actions, note);
  block.append(node("h4", {}, t("backupTitle")), node("p", { class: "field-note" }, t("backupNote")), group);
  const showDue = () => backupIsDue().then((value) => (due.hidden = !value));
  showDue();
  const onReminder = () => (block.isConnected ? showDue() : window.removeEventListener("backup-reminder", onReminder));
  window.addEventListener("backup-reminder", onReminder);
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
  block.append(withTip(node("h4", {}, t("settingsGoal")), t("settingsGoalNote")));
  const row = node("div", { class: "settings-goal" });
  const name = node("input", { type: "text", "data-key": `goal-name-${sport}`, "aria-label": t("settingsGoalName"), placeholder: t("settingsGoalName") });
  name.value = goal.name ?? "";
  name.maxLength = 60;
  name.addEventListener("change", () => {
    const text = checkText(name, { required: false, maxLength: 60 });
    if (text !== undefined) write({ name: text || null });
  });
  row.append(dateField(`goal-day-${sport}`, goal.day ?? null, (day) => write({ day })), name);
  block.append(row);
  return block;
}

// Segmented buttons for one choice: "auto" (null) and the values given, each a value or { value, label };
// onPick gets the value or null.
function choiceRow(key, label, values, current, onPick, autoLabel = t("settingsPlanAuto")) {
  const row = node("div", { class: "segmented settings-days", role: "group", "aria-label": label });
  for (const item of [{ value: null, label: autoLabel }, ...values.map((value) => (typeof value === "object" ? value : { value, label: String(value) }))]) {
    const { value } = item;
    const button = node("button", { type: "button", "aria-pressed": String((current ?? null) === value), "data-key": `${key}-${value ?? "auto"}` }, item.label);
    button.addEventListener("click", () => onPick(value));
    row.append(button);
  }
  return row;
}

// The weekdays as toggles, Monday first; onChange gets the sorted list, or null with none picked.
function daysRow(key, label, picked, onChange) {
  const chosen = new Set(picked ?? []);
  const row = node("div", { class: "segmented settings-days", role: "group", "aria-label": label });
  for (let day = 0; day < 7; day += 1) {
    const name = new Date(Date.UTC(2024, 0, 1 + day)).toLocaleDateString(locale(), { weekday: "short", timeZone: "UTC" });
    const button = node("button", { type: "button", "aria-pressed": String(chosen.has(day)), "data-key": `${key}-${day}` }, name);
    button.addEventListener("click", () => {
      if (chosen.has(day)) chosen.delete(day);
      else chosen.add(day);
      onChange(chosen.size ? [...chosen].sort((a, b) => a - b) : null);
    });
    row.append(button);
  }
  return row;
}

// How the week's plan is built: the weekly volume, the days, the longer workouts (how many, on which days, up to
// what time and by what step), the usual workout's time and the interval workouts a week. Empty is the plan's own.
// The sport's plan preferences and a writer that drops what is left empty.
function planPrefs(sport) {
  const prefs = savedSport(sport).plan ?? {};
  const writePlan = (patch) => {
    const next = Object.fromEntries(Object.entries({ ...prefs, ...patch }).filter(([, value]) => value != null));
    saveSport(sport, { plan: Object.keys(next).length ? next : null });
    changed();
  };
  return { prefs, writePlan };
}

function trainingBlock(sport) {
  const block = node("div", { class: "settings-block" });
  const { prefs, writePlan } = planPrefs(sport);
  block.append(withTip(node("h4", {}, t("settingsTraining")), t("settingsTrainingNote")));
  // The time to train each week, in hours to the tenth, for the weekly summary to measure each week by.
  const weekly = node("label", { class: "settings-field settings-weekly" });
  // Number fields, so the arrows and the wheel step the value: half hours, whole kilometres.
  const hours = node("input", { type: "number", min: "0", step: "0.5", inputmode: "decimal", "data-key": `weekly-hours-${sport}`, placeholder: "—" });
  const typed = savedSport(sport).weeklyHours;
  hours.value = typed ? String(typed) : "";
  hours.addEventListener("change", () => {
    const value = checkNumber(hours, { min: 0.5, max: 40, decimals: 1 });
    if (value === undefined) return;
    saveGoal(sport, "weeklyHours", value);
    changed();
  });
  weekly.append(node("span", {}, t("settingsWeeklyHours")), hours);
  // Or the distance each week, in whole kilometres.
  const distance = node("label", { class: "settings-field settings-weekly" });
  const kmInput = node("input", { type: "number", min: "0", step: "1", inputmode: "numeric", "data-key": `weekly-km-${sport}`, placeholder: "—" });
  const typedKm = savedSport(sport).weeklyKm;
  kmInput.value = typedKm ? String(typedKm) : "";
  kmInput.addEventListener("change", () => {
    const value = checkNumber(kmInput, { min: 1, max: 2000 });
    if (value === undefined) return;
    saveGoal(sport, "weeklyKm", value);
    changed();
  });
  distance.append(node("span", {}, t("settingsWeeklyKm")), kmInput);
  // The distance for this year, for the Analysis tab and the diary's year to measure it by; each year keeps its own.
  const thisYear = todayKey(zone).slice(0, 4);
  const yearly = node("label", { class: "settings-field settings-weekly" });
  const yearInput = node("input", { type: "number", min: "0", step: "10", inputmode: "numeric", "data-key": `yearly-km-${sport}`, placeholder: "—" });
  const goalNow = goalFor(savedSport(sport), thisYear);
  yearInput.value = goalNow ? String(goalNow) : "";
  yearInput.addEventListener("change", () => {
    const value = checkNumber(yearInput, { min: 1, max: 100000 });
    if (value === undefined) return;
    saveSport(sport, { yearlyGoals: withGoal(savedSport(sport), thisYear, value), yearlyKm: null });
    changed();
  });
  yearly.append(node("span", {}, t("settingsYearlyKm", { year: thisYear })), yearInput);
  // The choices in rows, side by side where they fit.
  const row = (...cells) => {
    const line = node("div", { class: "settings-row" });
    line.append(...cells);
    block.append(line);
  };
  const choice = (text, note, control) => {
    const cell = node("div", { class: "settings-cell" });
    const title = node("span", { class: "settings-label" }, text);
    if (note) withTip(title, note);
    cell.append(title, control);
    return cell;
  };
  const field = (element, note) => {
    if (note) withTip(element.querySelector("span"), note);
    return element;
  };
  const minutes = (key, labelKey, limits, placeholder = t("settingsPlanAutoShort")) => numberField(t(labelKey), prefs[key], placeholder, (value) => writePlan({ [key]: value }), { min: limits[0], max: limits[1] });
  // The days of the week trained on, for the week's plan; none picked lets the plan take the usual ones.
  const days = daysRow(`training-day-${sport}`, t("settingsTrainingDays"), savedSport(sport).trainingDays, (list) => {
    saveSport(sport, { trainingDays: list });
    changed();
  });
  // In sections under small headings: the volume, the workouts' length, the days, intervals and tests, lighter weeks.
  block.append(node("h5", { class: "settings-subhead" }, t("settingsSectionVolume")));
  row(
    field(weekly, t("settingsTrainingDaysNote")),
    field(distance),
    field(yearly, t("settingsYearlyKmNote")),
  );
  block.append(node("h5", { class: "settings-subhead" }, t("settingsSectionLength")));
  row(
    field(minutes("usualMinutes", "settingsPlanUsual", planPrefLimits.usualMinutes)),
    field(minutes("minimalMinutes", "settingsPlanMinimal", planPrefLimits.minimalMinutes, "10"), t("settingsPlanMinimalNote")),
    field(minutes("longTargetMinutes", "settingsPlanLongTarget", planPrefLimits.longTargetMinutes), t("settingsPlanTimesNote")),
    field(minutes("longStepMinutes", "settingsPlanLongStep", planPrefLimits.longStepMinutes)),
  );
  block.append(node("h5", { class: "settings-subhead" }, t("settingsSectionDays")));
  row(
    choice(t("settingsTrainingDays"), null, days),
    choice(t("settingsPlanLongCount"), null, choiceRow(`plan-long-count-${sport}`, t("settingsPlanLongCount"), [1, 2, 3], prefs.longPerWeek, (value) => writePlan({ longPerWeek: value }))),
    choice(t("settingsPlanLongDays"), t("settingsPlanLongDaysNote"), daysRow(`plan-long-day-${sport}`, t("settingsPlanLongDays"), prefs.longDays, (list) => writePlan({ longDays: list }))),
  );
  block.append(node("h5", { class: "settings-subhead" }, t("settingsSectionIntervals")));
  row(
    choice(t("settingsPlanIntervals"), t("settingsPlanIntervalsNote"), choiceRow(`plan-intervals-${sport}`, t("settingsPlanIntervals"), [0, 1, 2, 3], prefs.intervalsPerWeek, (value) => writePlan({ intervalsPerWeek: value }))),
    choice(t("settingsPlanIntervalType"), t("settingsPlanIntervalTypeNote"), choiceRow(`plan-interval-type-${sport}`, t("settingsPlanIntervalType"), ["short", "medium", "tempo"].map((value) => ({ value, label: t(`settingsPlanIntervalType_${value}`) })), prefs.intervalType, (value) => writePlan({ intervalType: value }))),
    choice(t("settingsPlanIntervalDays"), t("settingsPlanIntervalDaysNote"), daysRow(`plan-interval-day-${sport}`, t("settingsPlanIntervalDays"), prefs.intervalDays, (list) => writePlan({ intervalDays: list }))),
  );
  row(
    choice(t("settingsPlanFtpTest"), t("settingsPlanFtpTestNote"), choiceRow(`plan-ftp-test-${sport}`, t("settingsPlanFtpTest"), [6, 8, 10].map((value) => ({ value, label: t("settingsPlanWeeks", { weeks: value }) })), prefs.ftpTestWeeks, (value) => writePlan({ ftpTestWeeks: value }), t("settingsPlanOff"))),
    field(minutes("restAfterLongMinutes", "settingsPlanRestAfterLong", planPrefLimits.restAfterLongMinutes, String(restAfterLongDefault)), t("settingsPlanRestAfterLongNote")),
  );
  block.append(node("h5", { class: "settings-subhead" }, t("settingsSectionLighter")));
  row(
    choice(t("settingsPlanLighter"), t("settingsPlanLighterNote"), choiceRow(`plan-lighter-${sport}`, t("settingsPlanLighter"), [3, 5].map((value) => ({ value, label: t("settingsPlanLighterEvery", { weeks: value }) })).concat({ value: 0, label: t("settingsPlanNever") }), prefs.lighterEvery, (value) => writePlan({ lighterEvery: value }), t("settingsPlanLighterAuto"))),
    choice(t("settingsPlanLighterBy"), null, choiceRow(`plan-lighter-by-${sport}`, t("settingsPlanLighterBy"), [10, 30, 40].map((value) => ({ value, label: `${value} %` })), prefs.lighterPercent, (value) => writePlan({ lighterPercent: value }), t("settingsPlanLighterByAuto"))),
  );
  return block;
}

// The own Kinomap workouts with their steps, in one list; the plan picks among them by name.
function kinomapBlock(sport) {
  const block = node("div", { class: "settings-block" });
  const { prefs, writePlan } = planPrefs(sport);
  block.append(
    withTip(node("h4", {}, t("settingsPlanKinomap")), t("settingsPlanKinomapNote")),
    workoutList(prefs.kinomapWorkouts ?? defaultKinomapWorkouts[sport] ?? [], ownPlans(sport, prefs), prefs.kinomapNotes ?? defaultKinomapNotes[sport] ?? {}, ({ names, plans, notes }) => {
      // Kept in prefs too, as the other fields write theirs over them.
      Object.assign(prefs, { kinomapWorkouts: names, kinomapPlans: plans, kinomapNotes: notes });
      writePlan({ kinomapWorkouts: names, kinomapPlans: plans, kinomapNotes: notes });
    }),
  );
  return block;
}

// The sport's workouts' steps by name; steps kept as plan text by an earlier version read into steps.
export function ownPlans(sport, prefs = savedSport(sport).plan ?? {}) {
  const plans = prefs.kinomapPlans ?? defaultKinomapPlans[sport] ?? {};
  return Object.fromEntries(Object.entries(plans).map(([name, steps]) => {
    if (Array.isArray(steps)) return [name, steps];
    const segments = parseKinomapPlan(String(steps ?? ""), 0);
    return [name, segments.length ? stepsFromSegments(segments, segments.at(-1).startMs / 1000 + 60) : []];
  }));
}

// The saved steps of the sport's own Kinomap workout of that name, or null.
export function kinomapPlanFor(sport, name) {
  return planForName(ownPlans(sport), name);
}

const weightRange = { min: 30, max: 250 };

function weightBlock() {
  const block = node("div", { class: "settings-ftp" });
  const title = node("div", { class: "panel-title-row" });
  const add = node("button", { type: "button", class: "outline-button" }, t("settingsWeightAdd"));
  const history = savedWeights();
  const write = (list) => {
    saveFitness({ history: { ...savedHistory(), weight: withRecords(savedHistory().weight, list, "kg") }, weightHistory: undefined, weight: undefined });
    changed();
  };
  // The first weight holds from the first workout, so the whole library gets its W/kg; later ones from today.
  const firstWorkout = state.entries.length ? dayKey(Math.min(...state.entries.map((entry) => entry.startMs)), zone) : null;
  const from = !history.length && firstWorkout ? firstWorkout : todayKey(zone);
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
  // Entered day by day the list grows long: the last week's records show (at least the latest), the rest on demand.
  const weekAgo = addDays(todayKey(zone), -6);
  const recent = order.filter(({ record }, at) => !at || (record.from && record.from >= weekAgo));
  const shown = showAllWeights ? order : recent;
  for (const { record, index } of shown) {
    const update = (patch) => write(history.map((item, at) => (at === index ? { ...item, ...patch } : item)));
    const from = dateField(`weight-from-${index}`, record.from, (value) => update({ from: value }));
    // Text with a decimal keyboard, as a number field drops a comma under some browser languages.
    const kg = node("input", { type: "text", inputmode: "decimal", pattern: "[0-9]+([.,][0-9])?", class: "level-input", "data-key": `weight-value-${index}`, "aria-label": t("settingsWeightLabel") });
    kg.value = displayNumber(record.kg, record.kg % 1 ? 1 : 0);
    // A weight outside the range, or no number, is marked and left unsaved, as in the other number fields.
    kg.addEventListener("change", () => {
      const value = checkNumber(kg, { ...weightRange, decimals: 1, required: true });
      if (value !== undefined) update({ kg: value });
    });
    const remove = node("button", { type: "button", class: "link-button" }, t("delete"));
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
  if (order.length > recent.length) {
    const toggle = node("button", { type: "button", class: "link-button settings-show-all" }, showAllWeights ? t("settingsShowRecent") : t("settingsShowAll", { count: order.length }));
    toggle.addEventListener("click", () => {
      showAllWeights = !showAllWeights;
      render();
    });
    block.append(toggle);
  }
  return block;
}

// Whether the whole weight history is unfolded, kept across re-renders.
let showAllWeights = false;

function ftpBlock(sport, settings, estimate) {
  const block = node("div", { class: "settings-ftp" });
  const title = node("div", { class: "panel-title-row" });
  const add = node("button", { type: "button", class: "outline-button" }, t("settingsFtpAdd"));
  const history = ftpRecords(savedSport(sport));
  const write = (list) => {
    writeFtp(sport, list);
    changed();
  };
  add.addEventListener("click", () => write([...history, { from: todayKey(zone), ftp: currentFtp(settings, sport) || 200 }]));
  const heading = withTip(node("span", { class: "settings-label" }, t("settingsFtpHistory")), t("settingsFtpNote", { estimate: estimate ? `${estimate} W` : "—" }));
  title.append(heading, add);
  block.append(title);
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
      const value = checkNumber(watts, { min: 30, max: 600, required: true });
      if (value !== undefined) update({ ftp: value });
    });
    const remove = node("button", { type: "button", class: "link-button" }, t("delete"));
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
  // The tabs, the same for every sport, so switching sports keeps the part open.
  const tabs = node("div", { class: "segmented settings-tabs", role: "tablist", "aria-label": sportLabel(sport) });
  for (const tab of sportTabs) {
    const button = node("button", { type: "button", role: "tab", "aria-selected": String(state.tab === tab), "aria-pressed": String(state.tab === tab), "data-key": `tab-${tab}` }, t(`settingsTab_${tab}`));
    button.addEventListener("click", () => {
      state.tab = tab;
      byId("settingsPanes").scrollTop = 0;
      render();
    });
    tabs.append(button);
  }
  pane.append(node("h3", {}, sportLabel(sport)), tabs);
  if (state.tab === "trainers") {
    pane.append(trainersBlock(sport));
    return pane;
  }
  if (state.tab === "plan") {
    pane.append(goalBlock(sport), trainingBlock(sport));
    return pane;
  }
  if (state.tab === "kinomap") {
    pane.append(kinomapBlock(sport));
    return pane;
  }
  const thresholds = node("div", { class: "settings-block" });
  thresholds.append(withTip(node("h4", {}, t("fitnessSettings")), t("settingsThresholdsNote")));
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
  pane.append(thresholds, zones);
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
  // Fields drawn anew hold no wrong values, so the button follows the new pane.
  updateSaveButton();
  if (focused) panes.querySelector(`[data-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

// The dialog keeps one height whichever section is open: the rowing section's, the fullest one, as it now stands.
function fitHeight() {
  const dialog = byId("settingsDialog");
  if (!dialog.open) return;
  const panes = byId("settingsPanes");
  // The tallest of the rowing tabs, so switching tabs keeps the height too.
  const open = state.tab;
  let height = 0;
  for (const tab of sportTabs) {
    state.tab = tab;
    dialog.style.height = "";
    panes.replaceChildren(sportPane("rowing"));
    height = Math.max(height, dialog.offsetHeight);
  }
  state.tab = open;
  dialog.style.height = `${height}px`;
}

// Opens on the pane given, or on the sport of the open activity or analysis, or where it was left.
// tab picks the part of a sport's pane to show.
export async function openSettings(pane, tab, workout) {
  garminMessage = "";
  // A Kinomap workout named opens its steps once its sport's Kinomap tab is shown.
  if (workout) editWorkoutOnShow(workout);
  if (sportTabs.includes(tab)) state.tab = tab;
  const sport = typeof pane === "string" ? pane : state.sport();
  if (sports.includes(sport) || sport === "general") state.pane = sport;
  state.entries = await allEntries();
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

const keepUndo = (before) => writeJson(undoKey, before || null);

function restoreUnsaved() {
  const before = readJson(undoKey);
  try {
    if (before) putBack(before);
  } catch {}
  writeJson(undoKey, null);
}

// At load, before anything reads the settings.
restoreUnsaved();

// onTrainers runs after a save, so the converter's trainer list stays current;
// currentSport gives the sport to open on.
export function setupSettings({ onTrainers, currentSport }) {
  state.onTrainers = onTrainers;
  state.sport = currentSport;
  byId("settingsButton").addEventListener("click", () => {
    setMoreMenu(false);
    openSettings();
  });
  // On a phone the gear opens a menu with the settings, the language and the appearance; a tap outside closes it.
  const moreButton = byId("topbarMoreButton");
  const more = byId("topbarMore");
  function setMoreMenu(open) {
    more.classList.toggle("is-open", open);
    moreButton.setAttribute("aria-expanded", String(open));
  }
  moreButton.addEventListener("click", () => setMoreMenu(!more.classList.contains("is-open")));
  document.addEventListener("click", (event) => {
    if (!more.contains(event.target) && !moreButton.contains(event.target)) setMoreMenu(false);
  });
  const dialog = byId("settingsDialog");
  // Closing without saving asks first when something changed: the changes would go.
  const leave = async () => {
    if (state.dirty && !(await confirmDialog({ title: t("settingsDiscardTitle"), text: t("settingsDiscardText"), ok: t("settingsDiscard"), cancel: t("settingsKeepEditing"), danger: true }))) return;
    dialog.close();
  };
  byId("settingsClose").addEventListener("click", leave);
  byId("settingsCancel").addEventListener("click", leave);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    leave();
  });
  byId("settingsSave").addEventListener("click", save);
  // Syncing waits while the settings hold unsaved edits, and runs once they are saved or dropped.
  setSyncHold(() => dialog.open && state.dirty);
  // What a sync brought while the dialog is open without edits becomes what Cancel goes back to.
  // Activities added or removed here count at once too.
  window.addEventListener("library-synced", async () => {
    if (!dialog.open) return;
    state.entries = await allEntries();
    if (!state.dirty) {
      state.before = snapshot();
      keepUndo(state.before);
    }
    render();
  });
  dialog.addEventListener("field-check", updateSaveButton);
  dialog.addEventListener("close", () => {
    if (!state.saved && state.dirty) putBack(state.before);
    keepUndo(null);
    releaseSync();
  });
}
