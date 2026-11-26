import { allEntries as readEntries } from "./entries.js";
import { readJson, writeJson } from "./storage.js";
import { tipOn } from "./info.js";
import { kindColor } from "./units.js";
import { downloadFile, node } from "./dom.js";
import { todayKey } from "../dates.js";
import { confirmDialog } from "./confirm.js";
import { buildWorkout, decodeGarminFit, parseKinomap } from "../core.js";
import { titleFromKinomapFileName } from "../files.js";
import { workoutKind, workoutKinds } from "../analysis.js";
import { addEntries, backupText, deleteEntries, deleteEntry, entryFromFit, entryFromWorkout, findWorkout, listEntries, parseBackup, backupDue, sameWorkout } from "../library.js";
import { showToast } from "./toast.js";
import { byId, setNotice, sportLabel, t, translateMessage, zone } from "./context.js";
import { restoreSettings, saveDefaults, savedDefaults, settingsSnapshot } from "./preferences.js";
import { cloudConnected, onCloudStatus } from "./cloud.js";
import { lastTrainerId, trainerFor } from "./trainers.js";


// Saving exported activities is on unless turned off.
export const savesToLibrary = () => savedDefaults().saveToLibrary !== false;

// Called after each export; a failure here never stops the export itself.
// kind is the workout type picked in the converter; empty leaves it to the data.
// extra holds the trainer's name and the resistance set for the activity.
// An activity opened from the library (edited) goes back to it whatever the setting, under the name it now has.
export async function rememberWorkout(workout, kind = "", { trainer, resistance, edited = null, always = false } = {}) {
  if (!workout || (!edited && !always && !savesToLibrary())) return false;
  try {
    const entry = entryFromWorkout(workout, { exported: true });
    if (kind) entry.kind = kind;
    if (trainer) entry.trainer = trainer;
    if (resistance > 0) entry.resistance = resistance;
    if (edited) entry.renamed = true;
    // Trimmed far enough to no longer count as the same workout, it still replaces the one it was opened from.
    if (edited && !sameWorkout(edited, entry)) await deleteEntry(edited.id);
    await addEntries([entry]);
    return true;
  } catch (error) {
    setNotice(t("libraryFailed", { message: error.message }), "error");
    return false;
  }
}

// Automatic, interval or steady; the automatic option names the kind the data gives.
// An easy session is a jog when running and recovery on the rower or the bike.
export const kindLabel = (kind, sport) => t(kind === "recovery" && sport === "running" ? "kindJog"
  : `kind${kind[0].toUpperCase()}${kind.slice(1)}`);

// compact leaves out the automatic option, for the narrow comparison list: it shows the kind in force,
// and going back to automatic is left to the library and the converter.
export function renderKindOptions(select, detected, value = select.value, sport = null, compact = false) {
  select.replaceChildren(
    ...(compact ? [] : [new Option(t("kindAuto", { kind: kindLabel(detected, sport) }), "")]),
    ...workoutKinds.map((kind) => new Option(kindLabel(kind, sport), kind)),
  );
  select.value = (compact ? value || detected : value) ?? "";
}

// The type of a saved activity as a badge in its colour; it is changed in the activity's editing, not here.
export function kindBadge(entry) {
  const kind = workoutKind(entry);
  const badge = Object.assign(document.createElement("span"), { className: "kind-tag", textContent: kindLabel(kind, entry.sport) });
  badge.style.setProperty("--kind", kindColor(kind));
  return badge;
}

// An action as an icon; its name is the tooltip and what a screen reader says.
function iconButton(label, paths) {
  const button = tipOn(Object.assign(document.createElement("button"), { type: "button", className: "row-icon-button" }), label);
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  return button;
}

// The pencil that opens an activity in its editing, the same in the library and the comparison list.
export function editButton(entry) {
  const button = iconButton(t("libraryEditTitle"), '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>');
  button.addEventListener("click", (event) => {
    event.preventDefault();
    onEditEntry(entry);
  });
  return button;
}

const sports = ["rowing", "cycling", "running"];

// TCX or PWX goes in as a plain conversion, a FIT from the watch as it was recorded.
async function entryFromFile(file) {
  if (/\.fit$/i.test(file.name)) {
    // Resistance recorded in the FIT is read in the levels of the sport's usual trainer.
    return entryFromFit(decodeGarminFit(await file.arrayBuffer()), { name: file.name.replace(/\.fit$/i, ""), trainerFor: (sport) => trainerFor(lastTrainerId(sport)) });
  }
  const kinomap = parseKinomap(await file.text(), { fallbackStartMs: file.lastModified || Date.now(), timeZone: zone });
  if (kinomap.needsManualStart) throw new Error(t("libraryNeedsDate"));
  const name = `Kinomap - ${titleFromKinomapFileName(file.name) || t("fallbackActivity")}`;
  return entryFromWorkout(buildWorkout(kinomap, null, { timeZone: zone, activityName: name }));
}

async function addFiles(files, note) {
  const entries = [];
  const failed = [];
  for (const file of files) {
    try {
      entries.push(await entryFromFile(file));
    } catch (error) {
      failed.push(`${file.name}: ${translateMessage(error.message)}`);
    }
  }
  const { skipped } = entries.length ? await addEntries(entries) : { skipped: 0 };
  const added = [t("libraryAdded", { count: entries.length - skipped }), ...(skipped ? [t("libraryDuplicates", { count: skipped })] : [])].join(" · ");
  if (failed.length) Object.assign(note, { textContent: [added, ...failed].join(" · "), className: "field-note is-error" });
  else showToast(added);
  libraryChanged();
}

// The views showing the library draw it again, as after a sync.
const libraryChanged = () => window.dispatchEvent(new Event("library-synced"));

// The library's part of Settings: whether downloads go in, files added straight to it, a sport emptied.
export function libraryBlock(entries) {
  const block = node("div", { class: "settings-block settings-library" });
  const saveBox = node("input", { type: "checkbox" });
  saveBox.checked = savesToLibrary();
  saveBox.addEventListener("change", () => saveDefaults({ saveToLibrary: saveBox.checked }));
  const saveField = node("label", { class: "check-field" });
  saveField.append(saveBox, " ", node("span", {}, t("librarySave")));
  const note = node("p", { class: "field-note" });
  const pick = node("input", { type: "file", multiple: "", accept: ".tcx,.pwx,.fit,application/xml,text/xml,application/octet-stream", class: "visually-hidden" });
  pick.addEventListener("change", () => {
    addFiles([...pick.files], note);
    pick.value = "";
  });
  const add = node("button", { type: "button", class: "outline-button" }, t("libraryAdd"));
  add.addEventListener("click", () => pick.click());
  // Emptying a sport cannot be undone, so it asks first and names the sport and how many activities go.
  const counts = sports.map((sport) => [sport, entries.filter((entry) => entry.sport === sport).length]).filter(([, count]) => count);
  const sport = node("select", { "aria-label": t("librarySport") });
  sport.append(...counts.map(([value, count]) => new Option(`${sportLabel(value)} (${count})`, value)));
  const clear = node("button", { type: "button", class: "link-button danger-link" }, t("libraryClear"));
  clear.disabled = !counts.length;
  sport.disabled = !counts.length;
  clear.addEventListener("click", async () => {
    const ids = entries.filter((entry) => entry.sport === sport.value).map((entry) => entry.id);
    if (!(await confirmDialog({ title: t("libraryClearConfirm", { count: ids.length, sport: sportLabel(sport.value) }), ok: t("delete"), danger: true }))) return;
    await deleteEntries(ids);
    showToast(t("libraryCleared", { sport: sportLabel(sport.value) }));
    libraryChanged();
  });
  const actions = node("div", { class: "settings-cloud-actions" });
  actions.append(add, pick, sport, clear);
  block.append(node("h4", {}, t("library")), node("p", { class: "field-note" }, t("libraryHint")), saveField, actions, note);
  return block;
}

// When the last backup was made and of how many activities, kept apart from the settings a backup carries.
const backupKey = "kinomap-backup-last";
const lastBackup = () => readJson(backupKey);
const markBackup = (count) => writeJson(backupKey, { at: Date.now(), count });

// Whether a backup is due. With Dropbox connected the library is kept there too, so never.
export async function backupIsDue() {
  const count = (await readEntries()).length;
  return !cloudConnected() && backupDue(count, lastBackup());
}

// The backup lives in Settings, so the gear (and Settings in its menu) carries a dot while one is due.
export async function updateBackupReminder() {
  const due = await backupIsDue();
  for (const button of [byId("topbarMoreButton"), byId("settingsButton")]) {
    button.classList.toggle("is-due", due);
    button.dataset.tip = due ? t("backupDueHint") : "";
  }
  window.dispatchEvent(new Event("backup-reminder"));
}

export async function downloadBackup() {
  const entries = await listEntries();
  const blob = new Blob([backupText(entries, settingsSnapshot())], { type: "application/json" });
  downloadFile(blob, `indoor-log-backup-${todayKey(zone)}.json`);
  markBackup(entries.length);
  updateBackupReminder();
}

// Brings a backup file in and says what came back, as { text, type } for the place that asked.
export async function restoreBackup(file) {
  try {
    const { entries: all, settings } = parseBackup(await file.text());
    // Only workouts the library lacks come in: one already here stays as it is, edits since the backup included.
    const existing = await listEntries();
    const entries = all.filter((entry) => !existing.some((item) => item.id === entry.id) && !findWorkout(existing, entry));
    const { skipped: duplicates } = await addEntries(entries);
    const skipped = duplicates + all.length - entries.length;
    if (settings) {
      restoreSettings(settings);
      onSettingsRestored();
    }
    const message = { type: "success", text: [
      t("libraryRestored", { count: entries.length - duplicates }),
      ...(skipped ? [t("libraryDuplicates", { count: skipped })] : []),
      ...(settings ? [t("librarySettingsRestored")] : []),
    ].join(" · ") };
    // What came back from a file is backed up by that file.
    markBackup((await listEntries()).length);
    updateBackupReminder();
    return message;
  } catch (error) {
    return { type: "error", text: t("libraryFailed", { message: error.message }) };
  }
}

let onSettingsRestored = () => {};

// onRestore lets the converter pick up trainers and defaults that a backup brought in.
let onEditEntry = () => {};

export function setupLibrary({ onRestore, onEdit } = {}) {
  if (onEdit) onEditEntry = onEdit;
  // Connecting or disconnecting Dropbox turns the reminder off or back on.
  let connected = cloudConnected();
  onCloudStatus((status) => {
    if (status.connected === connected) return;
    connected = status.connected;
    updateBackupReminder();
  });
  if (onRestore) onSettingsRestored = onRestore;
  if (typeof indexedDB !== "undefined") updateBackupReminder();
}
