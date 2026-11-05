import { drawChart } from "./chart.js";
import { elements } from "./context.js";

export function setTheme(theme, persist = true) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  elements.lightThemeButton.setAttribute("aria-pressed", String(!isDark));
  elements.darkThemeButton.setAttribute("aria-pressed", String(isDark));
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#060a12" : "#0b1220";
  if (persist) {
    try {
      localStorage.setItem("kinomap-fit-theme", isDark ? "dark" : "light");
    } catch {}
  }
  drawChart();
}

export function savedTheme() {
  try {
    return localStorage.getItem("kinomap-fit-theme") === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

// Last-used lap distance per sport and feel/effort, offered as defaults for the next activity.
const defaultsKey = "kinomap-fit-defaults";

export function savedDefaults() {
  try {
    return JSON.parse(localStorage.getItem(defaultsKey)) ?? {};
  } catch {
    return {};
  }
}

export function saveDefaults(patch) {
  try {
    const before = savedDefaults();
    const after = { ...before, ...patch };
    localStorage.setItem(defaultsKey, JSON.stringify(after));
    // Only a real change to a synced value counts, each key with its own time: the fitness page remembering
    // its sport, or saving the same value again, leaves the time alone.
    const changed = syncedKeys.filter((key) => key in patch && JSON.stringify(syncedValue(key, before)) !== JSON.stringify(syncedValue(key, after)));
    if (changed.length) {
      const times = changedTimes();
      for (const key of changed) times[key] = Date.now();
      localStorage.setItem(syncedChangedKey, JSON.stringify(times));
      window.dispatchEvent(new Event("synced-settings-change"));
    }
  } catch {}
}

// The settings kept the same on every device: thresholds, weight, goals and trainers. What a page shows last
// (a sport, a period, a range, the trainer used last) stays with each device, so browsing on one does not undo
// a change on another.
export const syncedKeys = ["fitness", "trainers"];
const localFitness = ["sport", "range"];
const syncedChangedKey = "kinomap-settings-changed";

function syncedValue(key, defaults) {
  const value = defaults[key];
  if (key !== "fitness" || !value) return value;
  return Object.fromEntries(Object.entries(value).filter(([name]) => !localFitness.includes(name)));
}

// When each synced key last changed here; an older version kept one time for all of them.
function changedTimes() {
  try {
    const stored = JSON.parse(localStorage.getItem(syncedChangedKey));
    if (stored && typeof stored === "object") return stored;
    return Object.fromEntries(syncedKeys.map((key) => [key, Number(stored) || 0]));
  } catch {
    return {};
  }
}

export function syncedSettings() {
  const defaults = savedDefaults();
  const times = changedTimes();
  const keys = syncedKeys.filter((key) => key in defaults);
  return {
    defaults: Object.fromEntries(keys.map((key) => [key, syncedValue(key, defaults)])),
    changedAt: Object.fromEntries(keys.map((key) => [key, times[key] ?? 0])),
  };
}

// Settings that came from another device, written with their own times so they do not count as a change here;
// what this device keeps for itself stays.
export function applySyncedSettings({ defaults, changedAt }) {
  try {
    const current = savedDefaults();
    const incoming = { ...defaults };
    if (incoming.fitness) incoming.fitness = { ...incoming.fitness, ...Object.fromEntries(localFitness.filter((name) => current.fitness && name in current.fitness).map((name) => [name, current.fitness[name]])) };
    localStorage.setItem(defaultsKey, JSON.stringify({ ...current, ...incoming }));
    localStorage.setItem(syncedChangedKey, JSON.stringify({ ...changedTimes(), ...changedAt }));
  } catch {}
}

// Recordings already exported, kept by browser so an export into another folder still counts.
const exportsKey = "kinomap-fit-exports";
const exportsLimit = 2000;

export function exportedKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(exportsKey)) ?? []);
  } catch {
    return new Set();
  }
}

export function rememberExport(key) {
  if (!key) return;
  try {
    const keys = [...exportedKeys()].filter((existing) => existing !== key);
    localStorage.setItem(exportsKey, JSON.stringify([...keys, key].slice(-exportsLimit)));
  } catch {}
}

// Remembered settings as a backup carries them to another browser.
export const settingsSnapshot = () => ({ defaults: savedDefaults(), exports: [...exportedKeys()] });

// A backup only fills in: what is set here stays, and the backup adds what is missing, down into nested
// values (a sport's thresholds, the weight history); its trainers join those here that are not already set up.
const blankValue = (value) => value == null || (typeof value === "object" && Object.keys(value).length === 0);
const isPlain = (value) => value && typeof value === "object" && !Array.isArray(value);

export function fillMissing(current, backup) {
  if (blankValue(current)) return backup;
  if (!isPlain(current) || !isPlain(backup)) return current;
  const filled = { ...current };
  for (const [key, value] of Object.entries(backup)) filled[key] = key in current ? fillMissing(current[key], value) : value;
  return filled;
}

export function restoreSettings({ defaults = {}, exports = [] } = {}) {
  const current = savedDefaults();
  const here = Array.isArray(current.trainers) ? current.trainers : [];
  const backupOnly = (Array.isArray(defaults.trainers) ? defaults.trainers : []).filter((trainer) => !here.some((item) => item.id === trainer.id));
  const filled = fillMissing(current, defaults);
  saveDefaults({ ...filled, trainers: [...here, ...backupOnly] });
  if (Array.isArray(exports)) {
    const keys = [...new Set([...exportedKeys(), ...exports])].slice(-exportsLimit);
    try {
      localStorage.setItem(exportsKey, JSON.stringify(keys));
    } catch {}
  }
}

export function savedLanguage() {
  try {
    return localStorage.getItem("kinomap-fit-language") === "en" ? "en" : "cs";
  } catch {
    return "cs";
  }
}

export function setLanguageMenu(open) {
  elements.languageMenu.hidden = !open;
  elements.languageButton.setAttribute("aria-expanded", String(open));
}
