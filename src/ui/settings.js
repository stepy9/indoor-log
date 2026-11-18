import { zoneLimits, estimateMaxHeartRate, forSport, weightOn, ftpOn, ftpTimeline, heartRateAt, heartRateZones, powerZones } from "../fitness.js";
import { listEntries } from "../library.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { percentSteps, percentTable, saveTrainers, trainers } from "./trainers.js";

// Trainers whose percentage conversion is unfolded in the settings, kept across re-renders.
const openConversions = new Set();
import { byId, displayNumber, sportLabel, state as appState, t, zone } from "./context.js";
import { dayKey } from "../diary.js";
import { openDatePicker } from "./datepicker.js";
import { backupIsDue, downloadBackup, restoreBackup } from "./library.js";
import { cloudAvailable, cloudStatus, connectCloud, disconnectCloud, fitBackupOn, onCloudStatus, setFitBackup, syncNow, uploadFitFiles, fitBackupCoverage, rebuildMissingFits, checkDropboxFits } from "./cloud.js";
import { formatDay, parseDay } from "../dates.js";
import { setCalorieProfile } from "../core.js";
import { checkNumber, checkText, markField } from "./validate.js";
import { planPrefLimits } from "../plan.js";
import { defaultKinomapWorkouts } from "../training.js";

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

// A weekly goal changed holds from this week's Monday on; the weeks before keep the goal they had
// (the first change keeps the one before it for all earlier weeks).
function saveGoal(sport, key, value) {
  const own = savedSport(sport);
  const day = new Date();
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const monday = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  let history = own.goalHistory ?? [];
  if (!history.length) history = [{ from: "0000-00-00", weeklyHours: own.weeklyHours ?? null, weeklyKm: own.weeklyKm ?? null }];
  const last = history.at(-1);
  const next = { ...last, from: monday, [key]: value };
  history = [...history.filter((item) => item.from !== monday), next].sort((a, b) => a.from.localeCompare(b.from));
  saveSport(sport, { [key]: value, goalHistory: history });
}

// The weekly goal that held in the week from the Monday given.
export function goalOn(own, key, monday) {
  const held = (own?.goalHistory ?? []).filter((item) => item.from <= monday).at(-1);
  return held ? held[key] ?? 0 : own?.[key] ?? 0;
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

// Saving needs a change and no field still marked wrong; the button says which field holds it back.
function updateSaveButton() {
  const button = byId("settingsSave");
  const wrong = byId("settingsDialog").querySelector('input[aria-invalid="true"]');
  button.disabled = !state.dirty || Boolean(wrong);
  button.title = wrong ? t("fieldsInvalid") : "";
}

function save() {
  if (byId("settingsDialog").querySelector('input[aria-invalid="true"]')) return;
  state.saved = true;
  byId("settingsDialog").close();
  if (!state.dirty) return;
  window.dispatchEvent(new Event("settings-change"));
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
  const button = node("button", { type: "button", class: "date-field-button", "aria-label": t("settingsPickDate"), title: t("settingsPickDate") });
  button.innerHTML = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>`;
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
  pane.append(grid, node("p", { class: "field-note" }, t("settingsCaloriesNote")), weightBlock(), cloudBlock(), backupBlock());
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
    const remove = node("button", { type: "button", class: "link-button" }, t("libraryDelete"));
    remove.addEventListener("click", () => {
      if (!window.confirm(t("trainerDeleteConfirm", { name: trainer.name }))) return;
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
    row.append(...[name, levels, usual, actions].map((control) => {
      const cell = node("td");
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
    for (const entry of missing) list.append(node("li", {}, `${new Date(entry.startMs).toLocaleDateString(appState.language === "en" ? "en-GB" : "cs-CZ")} · ${entry.name}`));
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
      : at ? t("cloudSynced", { when: new Date(at).toLocaleString(appState.language === "en" ? "en-GB" : "cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) })
      : t("cloudConnected");
    const actions = node("div", { class: "settings-cloud-actions" });
    let extra = [];
    if (connected) {
      const now = node("button", { type: "button", class: "outline-button" }, t("cloudSyncNow"));
      now.addEventListener("click", () => syncNow());
      const off = node("button", { type: "button", class: "link-button" }, t("cloudDisconnect"));
      off.addEventListener("click", () => {
        if (window.confirm(t("cloudDisconnectConfirm"))) disconnectCloud();
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
        item.title = set ? t("cloudItemSynced") : t("cloudItemNotSet");
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
      state.entries = await listEntries().catch(() => []);
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
  block.append(node("h4", {}, t("settingsGoal")), node("p", { class: "field-note" }, t("settingsGoalNote")));
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
    const name = new Date(Date.UTC(2024, 0, 1 + day)).toLocaleDateString(appState.language === "en" ? "en-GB" : "cs-CZ", { weekday: "short", timeZone: "UTC" });
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
function trainingBlock(sport) {
  const block = node("div", { class: "settings-block" });
  const prefs = savedSport(sport).plan ?? {};
  const writePlan = (patch) => {
    const next = Object.fromEntries(Object.entries({ ...prefs, ...patch }).filter(([, value]) => value != null));
    saveSport(sport, { plan: Object.keys(next).length ? next : null });
    changed();
  };
  block.append(node("h4", {}, t("settingsTraining")), node("p", { class: "field-note" }, t("settingsTrainingNote")));
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
  const both = node("div", { class: "settings-weekly-row" });
  both.append(weekly, distance);
  block.append(both);
  // The days of the week trained on, for the week's plan; none picked lets the plan take the usual ones.
  const days = daysRow(`training-day-${sport}`, t("settingsTrainingDays"), savedSport(sport).trainingDays, (list) => {
    saveSport(sport, { trainingDays: list });
    changed();
  });
  block.append(node("span", { class: "settings-label settings-days-label" }, t("settingsTrainingDays")), days, node("p", { class: "field-note" }, t("settingsTrainingDaysNote")));
  // The longer workouts: how many a week and on which days.
  const label = (text) => node("span", { class: "settings-label settings-days-label" }, text);
  block.append(
    label(t("settingsPlanLongCount")),
    choiceRow(`plan-long-count-${sport}`, t("settingsPlanLongCount"), [1, 2, 3], prefs.longPerWeek, (value) => writePlan({ longPerWeek: value })),
    label(t("settingsPlanLongDays")),
    daysRow(`plan-long-day-${sport}`, t("settingsPlanLongDays"), prefs.longDays, (list) => writePlan({ longDays: list })),
    node("p", { class: "field-note" }, t("settingsPlanLongDaysNote")),
  );
  // Minutes: the longer workouts' target and step, the usual workout's time.
  const minutes = (key, labelKey, limits) => numberField(t(labelKey), prefs[key], t("settingsPlanAutoShort"), (value) => writePlan({ [key]: value }), { min: limits[0], max: limits[1] });
  const times = node("div", { class: "fitness-settings" });
  times.append(
    minutes("longTargetMinutes", "settingsPlanLongTarget", planPrefLimits.longTargetMinutes),
    minutes("longStepMinutes", "settingsPlanLongStep", planPrefLimits.longStepMinutes),
    minutes("usualMinutes", "settingsPlanUsual", planPrefLimits.usualMinutes),
  );
  block.append(times, node("p", { class: "field-note" }, t("settingsPlanTimesNote")));
  block.append(
    label(t("settingsPlanIntervals")),
    choiceRow(`plan-intervals-${sport}`, t("settingsPlanIntervals"), [0, 1, 2, 3], prefs.intervalsPerWeek, (value) => writePlan({ intervalsPerWeek: value })),
    node("p", { class: "field-note" }, t("settingsPlanIntervalsNote")),
    label(t("settingsPlanIntervalType")),
    choiceRow(`plan-interval-type-${sport}`, t("settingsPlanIntervalType"), ["short", "medium", "tempo"].map((value) => ({ value, label: t(`settingsPlanIntervalType_${value}`) })), prefs.intervalType, (value) => writePlan({ intervalType: value })),
    node("p", { class: "field-note" }, t("settingsPlanIntervalTypeNote")),
    label(t("settingsPlanFtpTest")),
    choiceRow(`plan-ftp-test-${sport}`, t("settingsPlanFtpTest"), [6, 8, 10].map((value) => ({ value, label: t("settingsPlanWeeks", { weeks: value }) })), prefs.ftpTestWeeks, (value) => writePlan({ ftpTestWeeks: value }), t("settingsPlanOff")),
    node("p", { class: "field-note" }, t("settingsPlanFtpTestNote")),
    label(t("settingsPlanLighter")),
    choiceRow(`plan-lighter-${sport}`, t("settingsPlanLighter"), [3, 5].map((value) => ({ value, label: t("settingsPlanLighterEvery", { weeks: value }) })).concat({ value: 0, label: t("settingsPlanNever") }), prefs.lighterEvery, (value) => writePlan({ lighterEvery: value }), t("settingsPlanLighterAuto")),
    label(t("settingsPlanLighterBy")),
    choiceRow(`plan-lighter-by-${sport}`, t("settingsPlanLighterBy"), [10, 30, 40].map((value) => ({ value, label: `${value} %` })), prefs.lighterPercent, (value) => writePlan({ lighterPercent: value }), t("settingsPlanLighterByAuto")),
    node("p", { class: "field-note" }, t("settingsPlanLighterNote")),
  );
  const least = node("div", { class: "fitness-settings" });
  least.append(numberField(t("settingsPlanMinimal"), prefs.minimalMinutes, "10", (value) => writePlan({ minimalMinutes: value }), { min: planPrefLimits.minimalMinutes[0], max: planPrefLimits.minimalMinutes[1] }));
  block.append(least, node("p", { class: "field-note" }, t("settingsPlanMinimalNote")));
  const workouts = node("textarea", { rows: "6", class: "settings-kinomap", "data-key": `plan-kinomap-${sport}`, "aria-label": t("settingsPlanKinomap") });
  workouts.value = (prefs.kinomapWorkouts ?? defaultKinomapWorkouts[sport] ?? []).join("\n");
  workouts.addEventListener("change", () => writePlan({ kinomapWorkouts: workouts.value.split("\n").map((line) => line.trim()).filter(Boolean) }));
  block.append(node("span", { class: "settings-label settings-days-label" }, t("settingsPlanKinomap")), workouts, node("p", { class: "field-note" }, t("settingsPlanKinomapNote")));
  return block;
}

const weightRange = { min: 30, max: 250 };

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
    // A weight outside the range, or no number, is marked and left unsaved, as in the other number fields.
    kg.addEventListener("change", () => {
      const value = checkNumber(kg, { ...weightRange, decimals: 1, required: true });
      if (value !== undefined) update({ kg: value });
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
      const value = checkNumber(watts, { min: 30, max: 600, required: true });
      if (value !== undefined) update({ ftp: value });
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
  pane.append(thresholds, zones, trainingBlock(sport), goalBlock(sport));
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
  byId("settingsClose").addEventListener("click", () => dialog.close());
  byId("settingsCancel").addEventListener("click", () => dialog.close());
  byId("settingsSave").addEventListener("click", save);
  dialog.addEventListener("field-check", updateSaveButton);
  dialog.addEventListener("close", () => {
    if (!state.saved && state.dirty) saveDefaults(state.before);
    keepUndo(null);
  });
}
