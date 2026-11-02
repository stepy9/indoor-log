import { buildWorkout, decodeGarminFit, parseKinomap } from "../core.js";
import { titleFromKinomapFileName } from "../files.js";
import { detectedKind, workoutKinds } from "../analysis.js";
import { addEntries, backupText, deleteEntries, deleteEntry, entryFromFit, entryFromWorkout, listEntries, parseBackup, saveEntries } from "../library.js";
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
// kind is the workout type picked in the converter; empty leaves it to the data.
export async function rememberWorkout(workout, kind = "") {
  if (!savesToLibrary() || !workout) return;
  try {
    const entry = entryFromWorkout(workout, { exported: true });
    if (kind) entry.kind = kind;
    await addEntries([entry]);
  } catch (error) {
    setNotice(t("libraryFailed", { message: error.message }), "error");
  }
}

// Automatic, interval or steady; the automatic option names the kind the data gives.
// An easy session is a jog when running and recovery on the rower or the bike.
export const kindLabel = (kind, sport) => t(kind === "recovery" && sport === "running" ? "kindJog"
  : `kind${kind[0].toUpperCase()}${kind.slice(1)}`);

export function renderKindOptions(select, detected, value = select.value, sport = null) {
  select.replaceChildren(
    new Option(t("kindAuto", { kind: kindLabel(detected, sport) }), ""),
    ...workoutKinds.map((kind) => new Option(kindLabel(kind, sport), kind)),
  );
  select.value = value ?? "";
}

// The type of a saved activity, changed in place; className lets the comparison list show it as a tag.
export function kindSelect(entry, onChange, className = "kind-select") {
  const select = Object.assign(document.createElement("select"), { className });
  select.setAttribute("aria-label", t("workoutKindLabel"));
  renderKindOptions(select, detectedKind(entry), entry.kind ?? "", entry.sport);
  select.dataset.kind = entry.kind || detectedKind(entry);
  select.addEventListener("change", async () => {
    if (select.value) entry.kind = select.value;
    else delete entry.kind;
    await saveEntries([entry]).catch(() => {});
    onChange();
  });
  return select;
}

function shortDate(epochMs) {
  return new Intl.DateTimeFormat(state.language === "en" ? "en-GB" : "cs-CZ", {
    timeZone: zone, day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(epochMs));
}

const value = (number, unit) => (number == null ? "—" : `${displayNumber(number)} ${unit}`);

// The library shows one sport at a time; the tab opened last is kept for the next visit.
const sports = ["rowing", "cycling", "running"];
let librarySport = null;
let shown = [];

function renderSportTabs(all) {
  const counts = Object.fromEntries(sports.map((sport) => [sport, all.filter((entry) => entry.sport === sport).length]));
  if (!sports.includes(librarySport)) librarySport = savedDefaults().librarySport ?? all[0]?.sport ?? "rowing";
  byId("librarySports").replaceChildren(...sports.map((sport) => {
    const button = Object.assign(document.createElement("button"), { type: "button", textContent: `${sportLabel(sport)} (${counts[sport]})` });
    button.setAttribute("aria-pressed", String(sport === librarySport));
    button.addEventListener("click", () => {
      librarySport = sport;
      saveDefaults({ librarySport: sport });
      renderList();
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
  renderSportTabs(all);
  const entries = all.filter((entry) => entry.sport === librarySport);
  shown = entries;
  byId("libraryCount").textContent = t("libraryCount", { count: all.length });
  byId("libraryEmpty").hidden = entries.length > 0;
  byId("libraryBackupButton").disabled = !all.length;
  byId("libraryClearButton").disabled = !entries.length;
  byId("libraryRows").replaceChildren(...entries.map((entry) => {
    const row = document.createElement("tr");
    const cells = [
      shortDate(entry.startMs),
      entry.name.replace(/^Kinomap - /, ""),
      t(`librarySource_${entry.source}`),
      formatDuration(entry.summary.timerSeconds),
      `${displayNumber(entry.summary.distance / 1000, 2)} km`,
      value(entry.summary.avgPower, "W"),
      value(entry.summary.avgHeartRate, "bpm"),
    ];
    row.append(...cells.map((text) => Object.assign(document.createElement("td"), { textContent: text })));
    row.children[1].title = entry.name;
    const kind = document.createElement("td");
    kind.append(kindSelect(entry, renderList));
    row.children[2].after(kind);
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
  const { skipped } = entries.length ? await addEntries(entries) : { skipped: 0 };
  libraryNote([t("libraryAdded", { count: entries.length - skipped }), ...(skipped ? [t("libraryDuplicates", { count: skipped })] : []), ...failed].join(" · "), failed.length ? "error" : "success");
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
    const { skipped } = await addEntries(entries);
    libraryNote([t("libraryRestored", { count: entries.length - skipped }), ...(skipped ? [t("libraryDuplicates", { count: skipped })] : [])].join(" · "), "success");
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
  // Emptying the open sport cannot be undone, so it asks first and names the sport and how many activities go.
  byId("libraryClearButton").addEventListener("click", async () => {
    if (!window.confirm(t("libraryClearConfirm", { count: shown.length, sport: sportLabel(librarySport) }))) return;
    await deleteEntries(shown.map((entry) => entry.id));
    libraryNote(t("libraryCleared", { sport: sportLabel(librarySport) }), "success");
    renderList();
  });
  byId("libraryRestoreButton").addEventListener("click", () => backupInput.click());
  backupInput.addEventListener("change", () => {
    if (backupInput.files[0]) restoreBackup(backupInput.files[0]);
    backupInput.value = "";
  });
  if (typeof indexedDB === "undefined") byId("libraryButton").hidden = true;
}
