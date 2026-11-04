import { cleanTitle } from "./files.js";
import { isExportedFit, levelFromFit } from "./fit.js";

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

const lapFields = ["startMs", "endMs", "timerSeconds", "distance", "avgHeartRate", "maxHeartRate", "avgPower", "maxPower", "avgCadence", "avgSpeed", "intensity", "target", "targetType", "resistance"];

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

// An export's name, tidied like a new conversion's: "Kinomap - _ Easy" becomes "Kinomap - Easy".
const exportName = (name) => name && name.replace(/^(Kinomap - )?(.*)$/s, (_, prefix = "", title) => `${prefix}${cleanTitle(title)}`);

// A FIT as decodeGarminFit returns it: from the watch, or exported here with the laps and their types as they were set.
// The session fills what the records lack.
// trainerFor(sport) gives the trainer ({ name, levels }) whose levels a FIT's recorded resistance is read back in.
export function entryFromFit(fit, { name, savedAt = Date.now(), trainerFor = () => null } = {}) {
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
  const entry = {
    id: entryId(sport, fit.startMs),
    name: (exported && exportName(fit.workoutName)) || name || "Garmin",
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
  const { lapResistance, ...resistance } = resistanceFromFit(fit, trainerFor(sport));
  return lapResistance
    ? { ...entry, ...resistance, laps: entry.laps.map((lap, index) => (lapResistance[index] ? { ...lap, resistance: lapResistance[index] } : lap)) }
    : entry;
}

// The level most of the activity, and of each lap, was rowed on, from the resistance the FIT recorded.
function resistanceFromFit(fit, trainer) {
  const level = (records) => {
    const counts = new Map();
    for (const { resistance } of records) if (resistance) counts.set(resistance, (counts.get(resistance) ?? 0) + 1);
    const [value] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
    return value ? levelFromFit(value, trainer.levels) : null;
  };
  if (!trainer?.levels || !fit.records.some((record) => record.resistance)) return {};
  const laps = fit.laps.map((lap) => level(fit.records.filter((record) => record.timeMs >= lap.startMs && record.timeMs < lap.endMs)));
  return {
    trainer: trainer.name,
    resistance: level(fit.records),
    lapResistance: laps,
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
    // A kind picked, a name typed or a resistance set by hand outlives the recording it was set on.
    const kind = !winner.kind && loser.kind ? { kind: loser.kind } : null;
    const name = !winner.renamed && loser.renamed ? { name: loser.name, renamed: true } : null;
    const trainer = !winner.trainer && loser.trainer ? { trainer: loser.trainer } : null;
    const resistance = !winner.resistance && loser.resistance ? { resistance: loser.resistance } : null;
    // Knowing its FIT is in Dropbox outlives the recording too.
    const backup = !winner.fitBackup && loser.fitBackup ? { fitBackup: loser.fitBackup } : null;
    const lapLevels = loser.laps?.some((lap) => lap.resistance) && !winner.laps?.some((lap) => lap.resistance) && winner.laps?.length === loser.laps.length
      ? { laps: winner.laps.map((lap, lapIndex) => (loser.laps[lapIndex].resistance ? { ...lap, resistance: loser.laps[lapIndex].resistance } : lap)) }
      : null;
    kept[index] = kind || name || trainer || resistance || lapLevels || backup ? { ...winner, ...kind, ...name, ...trainer, ...resistance, ...lapLevels, ...backup } : winner;
  }
  const keptIds = new Set(kept.map((entry) => entry.id));
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));
  return {
    save: kept.filter((entry) => existingById.get(entry.id) !== entry),
    remove: existing.filter((entry) => !keptIds.has(entry.id)).map((entry) => entry.id),
    count: kept.length,
  };
}

// FIT backups in Dropbox: each activity marked "export" (its own FIT went up) or "rebuilt" (put together
// from the library). How many have one and which do not.
export function fitCoverage(entries) {
  const missing = entries.filter((entry) => !entry.fitBackup);
  return { total: entries.length, done: entries.length - missing.length, rebuilt: entries.filter((entry) => entry.fitBackup === "rebuilt").length, missing };
}

// The library's activity a FIT belongs to: same sport, overlapping in time.
export const findWorkout = (entries, probe) => entries.find((entry) => sameWorkout(entry, probe)) ?? null;

// A backup's name starts with the day and time, so two activities of one name do not overwrite each other.
export function backupFitName(startMs, filename) {
  if (/^\d{4}-\d{2}-\d{2}/.test(filename)) return filename;
  const date = new Date(startMs);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())} ${filename}`;
}

const subSports = { rowing: "indoorRowing", cycling: "indoorCycling", running: "treadmill" };

// What encodeFit needs, from a library entry: the records back from columns, the laps and the summary as kept.
export function workoutFromEntry(entry) {
  const { seconds = [] } = entry.records ?? {};
  const records = seconds.map((second, index) => ({
    timeMs: entry.startMs + second * 1000,
    ...Object.fromEntries(fields.map((field) => [field, entry.records[field]?.[index] ?? null])),
  }));
  return {
    records, summary: entry.summary ?? {}, laps: entry.laps ?? [], startMs: entry.startMs, endMs: entry.endMs,
    sport: entry.sport, subSport: subSports[entry.sport] ?? "indoorRowing", activityName: entry.name,
  };
}

// The level each lap is rowed on, from plan steps (parsed against the activity's start) and the trainer's levels;
// a lap takes the step running two seconds after it starts, so a lap cut at a step's own start gets that step.
// Laps the plan gives no resistance keep theirs.
export function lapLevelsFromPlan(laps, steps, toLevel) {
  return laps.map((lap) => {
    const step = steps.filter((candidate) => candidate.startMs <= lap.startMs + 2000).at(-1);
    const level = step ? toLevel(step.resistancePercent) : null;
    return level ? { ...lap, resistance: level } : lap;
  });
}

// Whether it is time to back up: the activities live only in this browser. Due with a few activities and
// never a backup, or with activities added since one more than 30 days old. last is { at, count } or null.
export function backupDue(count, last, now = Date.now()) {
  if (count < 3) return false;
  if (!last?.at) return true;
  return count > (last.count ?? 0) && now - last.at > 30 * 86_400_000;
}

// A backup is one JSON file with every entry and the remembered settings (trainers among them), read back by parseBackup.
// Version 1 backups carry no settings.
export function backupText(entries, settings = null) {
  return JSON.stringify({ format: backupFormat, version: 2, entries, settings });
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  if (data?.format !== backupFormat || !Array.isArray(data.entries)) throw new Error("Soubor není záloha knihovny.");
  const settings = data.settings && typeof data.settings === "object" ? data.settings : null;
  return { entries: data.entries.filter((entry) => entry?.id && entry.records?.seconds?.length), settings };
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

// For keeping devices in step (sync.js): each activity saved here carries when, and each deletion is kept with
// when, so a merge knows which change came last.
const deletedKey = "kinomap-sync-deleted";
const stamp = (entry) => ({ ...entry, changedAt: Date.now() });
// Tells a sync there is something new to take up; a sync's own writes do not.
const changed = () => globalThis.dispatchEvent?.(new Event("library-change"));

export function deletedIds() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(deletedKey)) ?? {};
  } catch {
    return {};
  }
}

function recordDeleted(ids) {
  const deleted = deletedIds();
  for (const id of ids) deleted[id] = Date.now();
  try {
    globalThis.localStorage?.setItem(deletedKey, JSON.stringify(deleted));
  } catch {}
}

export const saveEntries = (entries) => run("readwrite", (store) => {
  for (const entry of entries) store.put(stamp(entry));
}).then(changed);

export const deleteEntry = (id) => {
  recordDeleted([id]);
  return run("readwrite", (store) => store.delete(id)).then(changed);
};

export const deleteEntries = (ids) => {
  recordDeleted(ids);
  return run("readwrite", (store) => {
    for (const id of ids) store.delete(id);
  }).then(changed);
};

// What a sync brings: activities written as they came, with their own times, and ids deleted on another device,
// with the deletions merged into the ones kept here.
export async function applySynced({ write = [], remove = [], deleted = {} }) {
  if (write.length || remove.length) {
    await run("readwrite", (store) => {
      for (const id of remove) store.delete(id);
      for (const entry of write) store.put(entry);
    });
  }
  const kept = deletedIds();
  for (const [id, at] of Object.entries(deleted)) kept[id] = Math.max(kept[id] ?? 0, at);
  try {
    globalThis.localStorage?.setItem(deletedKey, JSON.stringify(kept));
  } catch {}
}

// Saves entries, dropping duplicates already in the library or among themselves; with none it only tidies the library.
// Returns how many of the given entries were left out as duplicates of a fuller recording.
export async function addEntries(entries) {
  const existing = await run("readonly", (store) => store.getAll());
  const { save, remove } = mergeDuplicates(existing, entries);
  if (save.length || remove.length) {
    recordDeleted(remove);
    await run("readwrite", (store) => {
      for (const id of remove) store.delete(id);
      for (const entry of save) store.put(stamp(entry));
    });
    changed();
  }
  const saved = new Set(save.map((entry) => entry.id));
  return { skipped: entries.filter((entry) => !saved.has(entry.id)).length };
}

export async function listEntries() {
  const entries = await run("readonly", (store) => store.getAll());
  return entries.sort((a, b) => b.startMs - a.startMs);
}
