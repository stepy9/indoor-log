import { buildWorkout, decodeGarminFit, parseKinomap } from "../core.js";
import { titleFromKinomapFileName } from "../files.js";
import { backupText, deleteEntry, entryFromFit, entryFromWorkout, listEntries, parseBackup, saveEntries } from "../library.js";
import { byId, displayNumber, formatDuration, setNotice, sportLabel, state, t, translateMessage, zone } from "./context.js";
import { saveDefaults, savedDefaults } from "./preferences.js";

const dialog = byId("libraryDialog");
const toggle = byId("librarySaveToggle");
const filesInput = byId("libraryFilesInput");
const backupInput = byId("libraryBackupInput");

const libraryNote = (text, type = "") => {
  const note = byId("libraryNote");
  note.textContent = text;
  note.className = `field-note${type ? ` is-${type}` : ""}`;
};

// Saving exported activities is on unless turned off.
export const savesToLibrary = () => savedDefaults().saveToLibrary !== false;

// Called after each export; a failure here never stops the export itself.
export async function rememberWorkout(workout) {
  if (!savesToLibrary() || !workout) return;
  try {
    await saveEntries([entryFromWorkout(workout)]);
  } catch (error) {
    setNotice(t("libraryFailed", { message: error.message }), "error");
  }
}

function shortDate(epochMs) {
  return new Intl.DateTimeFormat(state.language === "en" ? "en-GB" : "cs-CZ", {
    timeZone: zone, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(epochMs));
}

const value = (number, unit) => (number == null ? "—" : `${displayNumber(number)} ${unit}`);

async function renderList() {
  let entries;
  try {
    entries = await listEntries();
  } catch (error) {
    libraryNote(t("libraryFailed", { message: error.message }), "error");
    return;
  }
  byId("libraryCount").textContent = t("libraryCount", { count: entries.length });
  byId("libraryEmpty").hidden = entries.length > 0;
  byId("libraryBackupButton").disabled = !entries.length;
  byId("libraryRows").replaceChildren(...entries.map((entry) => {
    const row = document.createElement("tr");
    const cells = [
      shortDate(entry.startMs),
      entry.name,
      sportLabel(entry.sport),
      t(`librarySource_${entry.source}`),
      formatDuration(entry.summary.timerSeconds),
      `${displayNumber(entry.summary.distance / 1000, 2)} km`,
      value(entry.summary.avgPower, "W"),
      value(entry.summary.avgHeartRate, "bpm"),
    ];
    row.append(...cells.map((text) => Object.assign(document.createElement("td"), { textContent: text })));
    const remove = Object.assign(document.createElement("button"), { type: "button", className: "link-button", textContent: t("libraryDelete") });
    remove.addEventListener("click", async () => {
      if (!window.confirm(t("libraryDeleteConfirm", { name: entry.name }))) return;
      await deleteEntry(entry.id);
      renderList();
    });
    const actions = document.createElement("td");
    actions.append(remove);
    row.append(actions);
    return row;
  }));
}

// TCX or PWX goes in as a plain conversion, a FIT from the watch as it was recorded.
async function entryFromFile(file) {
  if (/\.fit$/i.test(file.name)) {
    return entryFromFit(decodeGarminFit(await file.arrayBuffer()), { name: file.name.replace(/\.fit$/i, "") });
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
  if (entries.length) await saveEntries(entries);
  libraryNote([t("libraryAdded", { count: entries.length }), ...failed].join(" · "), failed.length ? "error" : "success");
  renderList();
}

async function downloadBackup() {
  const blob = new Blob([backupText(await listEntries())], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: `kinomap-fit-library-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

async function restoreBackup(file) {
  try {
    const entries = parseBackup(await file.text());
    await saveEntries(entries);
    libraryNote(t("libraryRestored", { count: entries.length }), "success");
  } catch (error) {
    libraryNote(t("libraryFailed", { message: error.message }), "error");
  }
  renderList();
}

export function openLibrary() {
  toggle.checked = savesToLibrary();
  libraryNote("");
  renderList();
  dialog.showModal();
}

export function setupLibrary() {
  byId("libraryButton").addEventListener("click", openLibrary);
  byId("libraryClose").addEventListener("click", () => dialog.close());
  toggle.addEventListener("change", () => saveDefaults({ saveToLibrary: toggle.checked }));
  byId("libraryAddButton").addEventListener("click", () => filesInput.click());
  filesInput.addEventListener("change", () => {
    addFiles([...filesInput.files]);
    filesInput.value = "";
  });
  byId("libraryBackupButton").addEventListener("click", downloadBackup);
  byId("libraryRestoreButton").addEventListener("click", () => backupInput.click());
  backupInput.addEventListener("change", () => {
    if (backupInput.files[0]) restoreBackup(backupInput.files[0]);
    backupInput.value = "";
  });
  if (typeof indexedDB === "undefined") byId("libraryButton").hidden = true;
}
