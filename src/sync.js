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
  // The settings changed last.
  const settings = [a.settings, b.settings].filter(Boolean).sort((x, y) => (y.changedAt ?? 0) - (x.changedAt ?? 0))[0] ?? null;
  return { entries: kept.sort((x, y) => y.startMs - x.startMs), deleted, settings };
}

// What a merge changes against one side: the activities to write there and the ids to delete there,
// and whether its settings are behind.
export function changesFor(side, merged) {
  const current = new Map((side?.entries ?? []).map((entry) => [entry.id, entry]));
  const keep = new Set(merged.entries.map((entry) => entry.id));
  return {
    write: merged.entries.filter((entry) => changedAt(entry) !== changedAt(current.get(entry.id) ?? {}) || !current.has(entry.id)),
    remove: [...current.keys()].filter((id) => !keep.has(id)),
    settings: Boolean(merged.settings) && (merged.settings.changedAt ?? 0) > (side?.settings?.changedAt ?? 0),
  };
}

// The file in the cloud, and reading it back; deletions older than a year are dropped to keep it small.
export function syncText(state, now = Date.now()) {
  const deleted = Object.fromEntries(Object.entries(state.deleted ?? {}).filter(([, at]) => now - at < 365 * 86_400_000));
  return JSON.stringify({ format: syncFormat, version: 1, entries: state.entries, deleted, settings: state.settings });
}

export function parseSync(text) {
  const data = JSON.parse(text);
  if (data?.format !== syncFormat || !Array.isArray(data.entries)) throw new Error("Not a sync file.");
  return {
    entries: data.entries.filter((entry) => entry?.id && entry.records?.seconds?.length),
    deleted: data.deleted && typeof data.deleted === "object" ? data.deleted : {},
    settings: data.settings && typeof data.settings === "object" ? data.settings : null,
  };
}
