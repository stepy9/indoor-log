import { mergeDuplicates } from "./library.js";

// Keeping the library and the settings the same on every device through one file in the cloud.
// A state is { entries, deleted, settings }: the activities, each with changedAt (when it was last saved here),
// the ids deleted with when ({ id: ms }), so a deletion does not come back from another device, and the
// remembered settings with when they last changed ({ defaults, changedAt }).
// Merging two states keeps the later of each: no change made on one device is lost to another's.
// No DOM and no network here, so all of it is tested on its own.

export const syncFormat = "indoor-log-sync";

const changedAt = (entry) => entry.changedAt ?? entry.savedAt ?? 0;

export function emptyState() {
  return { entries: [], deleted: {}, settings: null };
}

export function mergeStates(local, remote) {
  const a = local ?? emptyState();
  const b = remote ?? emptyState();
  // Deletions from both, the later time of each.
  const deleted = { ...a.deleted };
  for (const [id, at] of Object.entries(b.deleted ?? {})) deleted[id] = Math.max(deleted[id] ?? 0, at);
  // Each activity in its latest version, unless deleted after it.
  const byId = new Map();
  for (const entry of [...a.entries, ...b.entries]) {
    const other = byId.get(entry.id);
    if (!other || changedAt(entry) > changedAt(other)) byId.set(entry.id, entry);
  }
  const alive = [...byId.values()].filter((entry) => !(deleted[entry.id] >= changedAt(entry)));
  // One workout saved on two devices under different ids is one activity: the fuller recording stays,
  // the other id is recorded as deleted so it does not come back.
  const { save, remove } = mergeDuplicates([], alive);
  const removed = new Set(remove);
  const kept = save.filter((entry) => !removed.has(entry.id));
  for (const entry of alive) {
    if (!kept.some((item) => item.id === entry.id)) deleted[entry.id] = Math.max(deleted[entry.id] ?? 0, changedAt(entry));
  }
  return { entries: kept.sort((x, y) => y.startMs - x.startMs), deleted, settings: mergeSettings(a.settings, b.settings) };
}

// Settings as { defaults, changedAt: { key: ms } }: each synced key with its own time. An older file kept one
// time for all of them, which counts for each key it holds.
export function normalizeSettings(settings) {
  if (!settings || typeof settings !== "object") return null;
  const defaults = settings.defaults && typeof settings.defaults === "object" ? settings.defaults : {};
  const times = settings.changedAt && typeof settings.changedAt === "object"
    ? settings.changedAt
    : Object.fromEntries(Object.keys(defaults).map((key) => [key, Number(settings.changedAt) || 0]));
  return { defaults, changedAt: times };
}

// A value that says nothing: missing, null, or an empty object or list.
const blank = (value) => value == null || (typeof value === "object" && Object.keys(value).length === 0);

// Each key from the side that changed it last; a blank value never wins over a filled one, whatever its time,
// so a device that has not set anything up cannot wipe what another has.
export function mergeSettings(local, remote) {
  const a = normalizeSettings(local);
  const b = normalizeSettings(remote);
  if (!a || !b) return a ?? b;
  const defaults = {};
  const changedAt = {};
  for (const key of new Set([...Object.keys(a.defaults), ...Object.keys(b.defaults)])) {
    const here = { value: a.defaults[key], at: a.changedAt[key] ?? 0 };
    const there = { value: b.defaults[key], at: b.changedAt[key] ?? 0 };
    const pick = blank(here.value) !== blank(there.value) ? (blank(here.value) ? there : here) : there.at > here.at ? there : here;
    if (pick.value !== undefined) defaults[key] = pick.value;
    changedAt[key] = pick.at;
  }
  return { defaults, changedAt };
}

const sameSettings = (x, y) => JSON.stringify(x?.defaults ?? null) === JSON.stringify(y?.defaults ?? null)
  && JSON.stringify(x?.changedAt ?? null) === JSON.stringify(y?.changedAt ?? null);

// What a merge changes against one side: the activities to write there and the ids to delete there,
// and whether its settings are behind.
export function changesFor(side, merged) {
  const current = new Map((side?.entries ?? []).map((entry) => [entry.id, entry]));
  const keep = new Set(merged.entries.map((entry) => entry.id));
  return {
    write: merged.entries.filter((entry) => changedAt(entry) !== changedAt(current.get(entry.id) ?? {}) || !current.has(entry.id)),
    remove: [...current.keys()].filter((id) => !keep.has(id)),
    settings: Boolean(merged.settings) && !sameSettings(normalizeSettings(side?.settings), merged.settings),
  };
}

// The files in the cloud: the library (activities and deletions) and the settings apart, so a change to one
// does not send the other again. Each carries the version of its format; a file from a newer version of the
// app is not read and not written over, so an older app left open somewhere cannot undo what it does not know.
export const syncVersion = 2;
export const settingsFormat = "indoor-log-settings";

export class NewerSyncError extends Error {
  constructor() {
    super("newer-sync");
    this.name = "NewerSyncError";
  }
}

const checkVersion = (data) => {
  if ((Number(data?.version) || 1) > syncVersion) throw new NewerSyncError();
};

// Deletions older than a year are dropped to keep the file small.
export function syncText(state, now = Date.now()) {
  const deleted = Object.fromEntries(Object.entries(state.deleted ?? {}).filter(([, at]) => now - at < 365 * 86_400_000));
  return JSON.stringify({ format: syncFormat, version: syncVersion, entries: state.entries, deleted });
}

// Reads the library file; one from before the split (version 1) also holds the settings.
export function parseSync(text) {
  const data = JSON.parse(text);
  if (data?.format !== syncFormat || !Array.isArray(data.entries)) throw new Error("Not a sync file.");
  checkVersion(data);
  return {
    entries: data.entries.filter((entry) => entry?.id && entry.records?.seconds?.length),
    deleted: data.deleted && typeof data.deleted === "object" ? data.deleted : {},
    settings: data.settings && typeof data.settings === "object" ? data.settings : null,
  };
}

export const settingsText = (settings) => JSON.stringify({ format: settingsFormat, version: syncVersion, settings });

export function parseSettingsFile(text) {
  const data = JSON.parse(text);
  if (data?.format !== settingsFormat) throw new Error("Not a settings file.");
  checkVersion(data);
  return normalizeSettings(data.settings);
}

// What a sync left the same on every device, for the settings to list: how many activities and trainers, and
// whether the weight, the heart rate and the sports' thresholds are set.
export function syncSummary(state) {
  const defaults = normalizeSettings(state?.settings)?.defaults ?? {};
  const fitness = defaults.fitness ?? {};
  const weight = (fitness.weightHistory ?? []).some((record) => record?.kg > 0) || fitness.weight > 0;
  const heartRate = fitness.restHeartRate > 0 || fitness.maxHeartRate > 0;
  const thresholds = Object.values(fitness.sports ?? {}).some((sport) => sport && Object.values(sport).some((value) => !blank(value)));
  return {
    activities: state?.entries?.length ?? 0,
    trainers: Array.isArray(defaults.trainers) ? defaults.trainers.length : 0,
    weight,
    heartRate,
    thresholds,
  };
}
