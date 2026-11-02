import { isExportedFit } from "./fit.js";

// Saved activities for later analysis, kept in this browser's IndexedDB; nothing leaves the device.
// Each entry holds the summary, laps and the records as columns of numbers measured from the start.

const fields = ["distance", "heartRate", "power", "cadence", "speed"];
const backupFormat = "kinomap-fit-library";

const round = (value, digits = 0) => (Number.isFinite(value) ? Math.round(value * 10 ** digits) / 10 ** digits : null);

// The same sport starting in the same second is the same activity, so saving it again replaces it.
export const entryId = (sport, startMs) => `${sport}-${Math.round(startMs / 1000)}`;

function columns(records) {
  const startMs = records[0].timeMs;
  return {
    seconds: records.map((record) => round((record.timeMs - startMs) / 1000, 1)),
    ...Object.fromEntries(fields.map((field) => [field, records.map((record) => round(record[field], field === "speed" ? 3 : 1))])),
  };
}

const lapFields = ["startMs", "endMs", "timerSeconds", "distance", "avgHeartRate", "maxHeartRate", "avgPower", "maxPower", "avgCadence", "avgSpeed", "intensity", "target", "targetType"];

// A converted or merged workout, as buildWorkout returns it.
// exported marks the workout as saved when its FIT was exported, with every setting the user made.
export function entryFromWorkout(workout, { name = workout.activityName, savedAt = Date.now(), exported = false } = {}) {
  return {
    id: entryId(workout.sport, workout.startMs),
    name,
    sport: workout.sport,
    source: workout.mode,
    exported,
    // Laps split by workout intervals make it an interval workout, whatever the laps' types.
    intervalLaps: (workout.segments?.length ?? 0) >= 2,
    startMs: workout.startMs,
    endMs: workout.endMs,
    savedAt,
    summary: { ...workout.summary },
    laps: workout.laps.map((lap) => Object.fromEntries(lapFields.filter((field) => lap[field] != null).map((field) => [field, lap[field]]))),
    records: columns(workout.records),
  };
}

const fitSports = { rowing: "rowing", cycling: "cycling", running: "running" };
const finite = (list) => list.filter(Number.isFinite);
const average = (list) => (list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length) : null);
const highest = (list) => (list.length ? Math.max(...list) : null);

// A FIT as decodeGarminFit returns it: from the watch, or exported here with the laps and their types as they were set.
// The session fills what the records lack.
export function entryFromFit(fit, { name, savedAt = Date.now() } = {}) {
  const session = fit.sessions[0] ?? {};
  const sport = fitSports[session.sport] ?? "rowing";
  const exported = isExportedFit(fit.fileId);
  // FIT counts running cadence per leg; the library keeps steps/min like the converter.
  const cadenceScale = sport === "running" ? 2 : 1;
  const scaled = (value) => (value == null ? null : value * cadenceScale);
  const first = fit.records[0].distance ?? 0;
  const records = fit.records.map((record, index, list) => {
    const previous = list[index - 1];
    const speed = previous && record.distance != null && previous.distance != null && record.timeMs > previous.timeMs
      ? (record.distance - previous.distance) / ((record.timeMs - previous.timeMs) / 1000) : null;
    return { ...record, cadence: scaled(record.cadence), distance: record.distance == null ? null : record.distance - first, speed };
  });
  const pick = (field) => finite(records.map((record) => record[field]));
  const distance = session.totalDistance ?? highest(pick("distance")) ?? 0;
  const timerSeconds = session.totalTimerTime ?? (fit.endMs - fit.startMs) / 1000;
  const summary = {
    startMs: fit.startMs,
    endMs: fit.endMs,
    durationSeconds: session.totalElapsedTime ?? (fit.endMs - fit.startMs) / 1000,
    timerSeconds,
    distance,
    calories: session.totalCalories ?? null,
    avgHeartRate: session.avgHeartRate ?? average(pick("heartRate")),
    maxHeartRate: session.maxHeartRate ?? highest(pick("heartRate")),
    avgPower: session.avgPower ?? average(pick("power")),
    maxPower: session.maxPower ?? highest(pick("power")),
    avgCadence: scaled(session.avgCadence) ?? average(pick("cadence")),
    maxCadence: scaled(session.maxCadence) ?? highest(pick("cadence")),
    avgSpeed: timerSeconds > 0 ? distance / timerSeconds : null,
  };
  return {
    id: entryId(sport, fit.startMs),
    name: (exported && fit.workoutName) || name || "Garmin",
    sport,
    source: exported ? "export" : "fit",
    // An export carries one workout step per interval lap; a plain export has a single step.
    intervalLaps: exported && fit.workoutSteps >= 2,
    startMs: fit.startMs,
    endMs: fit.endMs,
    savedAt,
    summary,
    laps: fit.laps.map((lap) => ({ ...lap, avgCadence: scaled(lap.avgCadence), intensity: lap.intensity === "interval" ? "active" : lap.intensity ?? "active" })),
    records: columns(records),
  };
}

// The same workout recorded twice, such as the Kinomap file and the watch FIT: same sport,
// starts at most five minutes apart and at least half of the shorter one overlapping.
const duplicateStartMs = 5 * 60_000;

export function sameWorkout(a, b) {
  if (a.sport !== b.sport || Math.abs(a.startMs - b.startMs) > duplicateStartMs) return false;
  const overlap = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
  return overlap >= 0.5 * Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
}

// The fuller recording wins: an export, which holds the laps as they were set (a FIT exported here, or the workout
// saved when it was exported), then Kinomap with the watch, then Kinomap alone, then the watch alone.
const sourceRank = { merge: 3, convert: 2, fit: 1 };
const rank = (entry) => (entry.source === "export" || entry.exported ? 4 : sourceRank[entry.source] ?? 0);

// Adds entries to the library's, one per workout; on a tie the later entry wins. Returns what to write and what to delete.
export function mergeDuplicates(existing, incoming) {
  const kept = [];
  for (const entry of [...existing, ...incoming]) {
    const index = kept.findIndex((other) => sameWorkout(other, entry));
    if (index < 0) {
      kept.push(entry);
      continue;
    }
    const other = kept[index];
    const winner = rank(entry) >= rank(other) ? entry : other;
    const loser = winner === entry ? other : entry;
    // A kind picked by hand outlives the recording it was picked on.
    kept[index] = winner.kind || !loser.kind ? winner : { ...winner, kind: loser.kind };
  }
  const keptIds = new Set(kept.map((entry) => entry.id));
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));
  return {
    save: kept.filter((entry) => existingById.get(entry.id) !== entry),
    remove: existing.filter((entry) => !keptIds.has(entry.id)).map((entry) => entry.id),
    count: kept.length,
  };
}

// A backup is one JSON file with every entry, read back by parseBackup.
export function backupText(entries) {
  return JSON.stringify({ format: backupFormat, version: 1, entries });
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data?.format !== backupFormat || !Array.isArray(data.entries)) throw new Error("Soubor není záloha knihovny.");
  return data.entries.filter((entry) => entry?.id && entry.records?.seconds?.length);
}

// IndexedDB: one object store keyed by entry id.
const dbName = "kinomap-fit-library";
const storeName = "activities";
let opening = null;

function database() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

async function run(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const saveEntries = (entries) => run("readwrite", (store) => {
  for (const entry of entries) store.put(entry);
});

export const deleteEntry = (id) => run("readwrite", (store) => store.delete(id));

export const clearEntries = () => run("readwrite", (store) => store.clear());

// Saves entries, dropping duplicates already in the library or among themselves; with none it only tidies the library.
// Returns how many of the given entries were left out as duplicates of a fuller recording.
export async function addEntries(entries) {
  const existing = await run("readonly", (store) => store.getAll());
  const { save, remove } = mergeDuplicates(existing, entries);
  if (save.length || remove.length) {
    await run("readwrite", (store) => {
      for (const id of remove) store.delete(id);
      for (const entry of save) store.put(entry);
    });
  }
  const saved = new Set(save.map((entry) => entry.id));
  return { skipped: entries.filter((entry) => !saved.has(entry.id)).length };
}

export async function listEntries() {
  const entries = await run("readonly", (store) => store.getAll());
  return entries.sort((a, b) => b.startMs - a.startMs);
}
