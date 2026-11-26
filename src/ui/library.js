import { allEntries as readEntries } from "./entries.js";
import { readJson, writeJson } from "./storage.js";
import { tipOn } from "./info.js";
import { kindColor } from "./units.js";
import { downloadFile } from "./dom.js";
import { todayKey } from "../dates.js";
import { confirmDialog } from "./confirm.js";
import { buildWorkout, decodeGarminFit, parseKinomap } from "../core.js";
import { titleFromKinomapFileName } from "../files.js";
import { workoutKind, workoutKinds } from "../analysis.js";
import { addEntries, backupText, deleteEntries, deleteEntry, entryFromFit, entryFromWorkout, findWorkout, listEntries, parseBackup, backupDue, sameWorkout } from "../library.js";
import { showToast } from "./toast.js";
import { byId, displayNumber, formatDuration, setNotice, shortDateTime, sportLabel, t, translateMessage, zone } from "./context.js";
import { restoreSettings, saveDefaults, savedDefaults, settingsSnapshot } from "./preferences.js";
import { renderLimited } from "./more.js";
import { cloudConnected, onCloudStatus } from "./cloud.js";
import { lastTrainerId, trainerFor } from "./trainers.js";

const dialog = byId("libraryDialog");
const toggle = byId("librarySaveToggle");
const filesInput = byId("libraryFilesInput");

const libraryNote = (text, type = "") => {
  const note = byId("libraryNote");
  note.textContent = text;
  note.className = `field-note${type ? ` is-${type}` : ""}`;
};

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

// A row's action as an icon; its name is the tooltip and what a screen reader says.
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

// The library shows one sport at a time; the tab opened last is kept for the next visit.
const sports = ["rowing", "cycling", "running"];
let librarySport = null;
let shown = [];
let allEntries = [];

function renderSportTabs(all) {
  const counts = Object.fromEntries(sports.map((sport) => [sport, all.filter((entry) => entry.sport === sport).length]));
  if (!sports.includes(librarySport)) librarySport = savedDefaults().librarySport ?? all[0]?.sport ?? "rowing";
  byId("librarySports").replaceChildren(...sports.map((sport) => {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: `${sportLabel(sport)} (${counts[sport]})` });
    button.setAttribute("aria-pressed", String(sport === librarySport));
    button.addEventListener("click", () => {
      librarySport = sport;
      saveDefaults({ librarySport: sport });
      renderRows();
    });
    return button;
  }));
}

async function renderList() {
  let all;
  try {
    // Duplicates saved before the library looked for them go away when it opens.
    await addEntries([]);
    all = await listEntries();
  } catch (error) {
    libraryNote(t("libraryFailed", { message: error.message }), "error");
    return;
  }
  allEntries = all;
  renderRows();
}

function renderRows() {
  const all = allEntries;
  renderSportTabs(all);
  const entries = all.filter((entry) => entry.sport === librarySport);
  shown = entries;
  byId("libraryCount").textContent = t("libraryCount", { count: all.length });
  byId("libraryEmpty").hidden = entries.length > 0;
  byId("libraryClearButton").disabled = !entries.length;
  renderLimited(byId("libraryRows"), entries.map((entry) => {
    const row = document.createElement("tr");
    const cells = [
      shortDateTime(entry.startMs),
      "",
      formatDuration(entry.summary.timerSeconds),
      `${displayNumber(entry.summary.distance / 1000, 2)} km`,
    ];
    row.append(...cells.map((text) => Object.assign(document.createElement("td"), { textContent: text })));
    // The name without the "Kinomap - " every conversion starts with; all of it on hovering.
    row.children[1].textContent = entry.name.replace(/^Kinomap - /, "");
    row.children[1].dataset.tip = entry.name;
    row.children[1].className = "library-name";
    // Where it came from, on hovering the date rather than in a column of its own: it is the same for most.
    // A conversion saved as a FIT is the same file an import of that FIT would give.
    row.children[0].dataset.tip = t(`librarySource_${entry.exported ? "export" : entry.source}`);
    // The type reads only: the pencil opens the activity to change it, its trainer and resistance among the rest.
    row.children[1].after(Object.assign(document.createElement("td"), { textContent: kindLabel(workoutKind(entry), entry.sport) }));
    const remove = iconButton(t("delete"), '<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
    remove.classList.add("is-danger");
    remove.addEventListener("click", async () => {
      if (!(await confirmDialog({ title: t("libraryDeleteConfirm", { name: entry.name }), ok: t("delete"), danger: true }))) return;
      await deleteEntry(entry.id);
      renderList();
      showToast(t("savedDeleted"));
    });
    // Editing opens the activity in the converter, where saving its FIT also puts it back here.
    const edit = editButton(entry);
    edit.addEventListener("click", () => dialog.close(), { capture: true });
    const actions = document.createElement("td");
    actions.className = "library-actions";
    actions.append(edit, remove);
    row.append(actions);
    // The row opens the activity's detail; the pencil and the bin stay shortcuts.
    row.className = "is-link";
    row.addEventListener("click", (event) => {
      if (event.target.closest("button, select, a")) return;
      dialog.close();
      onOpenEntry(entry);
    });
    return row;
  }), `library:${librarySport}`);
}

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

async function addFiles(files) {
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
  if (failed.length) libraryNote([added, ...failed].join(" · "), "error");
  else showToast(added);
  renderList();
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
      toggle.checked = savesToLibrary();
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
    if (dialog.open) renderList();
    return message;
  } catch (error) {
    return { type: "error", text: t("libraryFailed", { message: error.message }) };
  }
}

export function openLibrary() {
  toggle.checked = savesToLibrary();
  libraryNote("");
  renderList();
  dialog.showModal();
}

let onSettingsRestored = () => {};

// onRestore lets the converter pick up trainers and defaults that a backup brought in.
let onEditEntry = () => {};
let onOpenEntry = () => {};

export function setupLibrary({ onRestore, onEdit, onOpen } = {}) {
  if (onOpen) onOpenEntry = onOpen;
  if (onEdit) onEditEntry = onEdit;
  // Connecting or disconnecting Dropbox turns the reminder off or back on.
  let connected = cloudConnected();
  onCloudStatus((status) => {
    if (status.connected === connected) return;
    connected = status.connected;
    updateBackupReminder();
  });
  if (onRestore) onSettingsRestored = onRestore;
  byId("libraryButton").addEventListener("click", openLibrary);
  byId("libraryClose").addEventListener("click", () => dialog.close());
  toggle.addEventListener("change", () => saveDefaults({ saveToLibrary: toggle.checked }));
  byId("libraryAddButton").addEventListener("click", () => filesInput.click());
  filesInput.addEventListener("change", () => {
    addFiles([...filesInput.files]);
    filesInput.value = "";
  });
  // Emptying the open sport cannot be undone, so it asks first and names the sport and how many activities go.
  byId("libraryClearButton").addEventListener("click", async () => {
    if (!(await confirmDialog({ title: t("libraryClearConfirm", { count: shown.length, sport: sportLabel(librarySport) }), ok: t("delete"), danger: true }))) return;
    await deleteEntries(shown.map((entry) => entry.id));
    showToast(t("libraryCleared", { sport: sportLabel(librarySport) }));
    renderList();
  });
  if (typeof indexedDB === "undefined") byId("libraryButton").hidden = true;
  else updateBackupReminder();
  // The library may grow from the converter too; a closed library dialog checks again.
  byId("libraryDialog").addEventListener("close", updateBackupReminder);
}
