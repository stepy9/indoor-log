import { applySynced, backupFitName, deletedIds, entryFromFit, findWorkout, fitCoverage, listEntries, saveEntries, workoutFromEntry } from "../library.js";
import { decodeGarminFit, encodeFit } from "../fit.js";
import { fitFileName } from "../files.js";
import { changesFor, mergeStates, parseSync, syncText } from "../sync.js";
import { applySyncedSettings, syncedSettings } from "./preferences.js";

// Keeping the library and the settings in one file in the user's Dropbox, in the app's own folder, so every
// browser that signs in shows the same. Signing in is OAuth with PKCE, as the app has no server: the browser
// asks Dropbox for a code, trades it for a long-lived refresh token kept here, and gets short access tokens
// from it. Each sync reads the file, merges it with what is here (sync.js), writes back what changed on
// either side. Nothing goes anywhere but between this browser and the user's Dropbox.

// The app's key from the Dropbox App Console; not a secret, as PKCE needs none.
export const dropboxAppKey = "yp3m2oa7u1h8qww";

const tokenKey = "kinomap-dropbox";
const verifierKey = "kinomap-dropbox-verifier";
const syncedKey = "kinomap-dropbox-synced";
const fitBackupKey = "kinomap-dropbox-fit";
const filePath = "/indoor-log.json";
const redirectUri = () => `${location.origin}${location.pathname}`;

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const cloudAvailable = () => Boolean(dropboxAppKey);
export const cloudConnected = () => Boolean(read(tokenKey)?.refresh);
export const lastSynced = () => read(syncedKey);

const status = { state: "idle", error: null };
const listeners = new Set();
export const cloudStatus = () => ({ ...status, connected: cloudConnected(), at: lastSynced() });
export function onCloudStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function setStatus(state, error = null) {
  Object.assign(status, { state, error });
  for (const listener of listeners) listener(cloudStatus());
}

const base64Url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Sends the browser to Dropbox to sign in; it comes back to this page with a code.
export async function connectCloud() {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  write(verifierKey, verifier);
  const params = new URLSearchParams({
    client_id: dropboxAppKey,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: redirectUri(),
    token_access_type: "offline",
    // Asked for by name, so a token never comes without them (Dropbox refuses here if the app lacks them).
    scope: "files.content.read files.content.write",
  });
  location.assign(`https://www.dropbox.com/oauth2/authorize?${params}`);
}

export function disconnectCloud() {
  const token = read(tokenKey);
  write(tokenKey, null);
  write(syncedKey, null);
  setStatus("idle");
  // Revoking is a courtesy; signing out here holds either way.
  if (token?.access) fetch("https://api.dropboxapi.com/2/auth/token/revoke", { method: "POST", headers: { Authorization: `Bearer ${token.access}` } }).catch(() => {});
}

// Dropbox says what went wrong in the body: a summary in JSON, or plain text for a missing permission.
async function dropboxError(response) {
  const text = await response.text().catch(() => "");
  let reason = text;
  try {
    const data = JSON.parse(text);
    reason = data.error_summary ?? data.error_description ?? data.error ?? text;
  } catch {}
  return new Error(`Dropbox ${response.status}${reason ? `: ${String(reason).slice(0, 160)}` : ""}`);
}

async function tokenRequest(body) {
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", { method: "POST", body: new URLSearchParams({ client_id: dropboxAppKey, ...body }) });
  if (!response.ok) throw await dropboxError(response);
  return response.json();
}

// Back from Dropbox with a code: trades it for tokens and takes the code out of the address.
async function finishSignIn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const verifier = read(verifierKey);
  if (!code || !verifier) return false;
  write(verifierKey, null);
  history.replaceState(null, "", redirectUri() + location.hash);
  const data = await tokenRequest({ code, grant_type: "authorization_code", code_verifier: verifier, redirect_uri: redirectUri() });
  write(tokenKey, { refresh: data.refresh_token, access: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 });
  return true;
}

async function accessToken() {
  const token = read(tokenKey);
  if (!token?.refresh) throw new Error("not connected");
  if (token.access && token.expires > Date.now()) return token.access;
  const data = await tokenRequest({ grant_type: "refresh_token", refresh_token: token.refresh });
  write(tokenKey, { ...token, access: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 });
  return data.access_token;
}

async function download() {
  const response = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Dropbox-API-Arg": JSON.stringify({ path: filePath }) },
  });
  // No file yet: the first sync writes it.
  if (response.status === 409) return null;
  if (!response.ok) throw await dropboxError(response);
  return parseSync(await response.text());
}

async function upload(state) {
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({ path: filePath, mode: "overwrite", mute: true }),
    },
    body: syncText(state),
  });
  if (!response.ok) throw await dropboxError(response);
}

// Exported FIT files copied into /FIT in the app's Dropbox folder, beside the local download. Set per device,
// as connecting is. One that fails to go up waits here (in memory) and goes with the next sync.
export const fitBackupOn = () => read(fitBackupKey) === true;
export const setFitBackup = (on) => write(fitBackupKey, on ? true : null);
const fitWaiting = new Map();

const asciiJson = (value) => [...JSON.stringify(value)]
  .map((c) => (c.charCodeAt(0) > 126 ? String.fromCharCode(92) + "u" + c.charCodeAt(0).toString(16).padStart(4, "0") : c))
  .join("");

async function uploadFit(filename, bytes) {
  const response = await fetch("https://content.dropboxapi.com/2/files/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/octet-stream",
      // Dropbox-API-Arg must be ASCII: a name with diacritics goes escaped.
      "Dropbox-API-Arg": asciiJson({ path: `/FIT/${filename}`, mode: "overwrite", mute: true }),
    },
    body: bytes,
  });
  if (!response.ok) throw await dropboxError(response);
}

// Activities whose FIT went up, marked in the library (and so synced) once the library has them: an export's
// activity is saved a moment after its FIT. A mark waits two minutes for it, then gives up.
const marks = [];
let marking = null;
async function applyMarks() {
  if (marking || !marks.length) return;
  marking = (async () => {
    const entries = await listEntries();
    const save = [];
    for (const mark of [...marks]) {
      const entry = findWorkout(entries, mark.probe);
      const settled = entry && (entry.fitBackup === "export" || entry.fitBackup === mark.kind);
      if (entry && !settled) save.push({ ...entry, fitBackup: mark.kind });
      if (settled || Date.now() - mark.at > 120_000) marks.splice(marks.indexOf(mark), 1);
    }
    if (save.length) await saveEntries(save);
  })().finally(() => (marking = null));
  return marking;
}
const markFit = (probe, kind) => {
  marks.push({ probe, kind, at: Date.now() });
  return applyMarks();
};

// A FIT goes up under a name starting with its date, and its activity is marked. One that is not a readable FIT
// goes up under its own name, unmarked.
async function backupFitBytes(bytes, filename, kind = "export") {
  let probe = null;
  try {
    probe = entryFromFit(decodeGarminFit(bytes), { name: filename });
  } catch {}
  await uploadFit(probe ? backupFitName(probe.startMs, filename) : filename, bytes);
  if (probe) await markFit(probe, kind);
}

async function sendWaitingFits() {
  for (const [filename, bytes] of fitWaiting) {
    await backupFitBytes(bytes, filename);
    fitWaiting.delete(filename);
  }
}

export async function fitBackupCoverage() {
  return fitCoverage(await listEntries());
}

// The activities without a FIT in Dropbox get one put together from what the library keeps.
export async function rebuildMissingFits(onProgress = () => {}) {
  const { missing } = await fitBackupCoverage();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let done = 0;
  onProgress(done, missing.length);
  for (const entry of missing) {
    const workout = workoutFromEntry(entry);
    if (workout.records.length >= 2) {
      const bytes = encodeFit(workout.records, workout.summary, workout.laps, workout.startMs, workout.endMs, zone, workout.activityName, workout.sport, workout.subSport);
      await uploadFit(backupFitName(entry.startMs, fitFileName(entry.name, "Activity")), bytes);
      await markFit(entry, "rebuilt");
    }
    onProgress(++done, missing.length);
  }
  return done;
}

// FIT files exported before, picked from the disk, go up one by one; the count gone up so far is reported.
export async function uploadFitFiles(files, onProgress = () => {}) {
  const fits = [...files].filter((file) => /\.fit$/i.test(file.name));
  let done = 0;
  onProgress(done, fits.length);
  for (const file of fits) {
    await backupFitBytes(await file.arrayBuffer(), file.name);
    onProgress(++done, fits.length);
  }
  return done;
}

// Called on every export; does nothing unless connected and switched on. Never holds up or fails the export.
export function backupFit(bytes, filename) {
  if (!cloudConnected() || !fitBackupOn()) return;
  fitWaiting.set(filename, bytes);
  sendWaitingFits().catch((error) => setStatus("error", error.message));
}

// One sync: read the file, merge, write here what came from there and there what is new here.
let running = null;
export function syncNow() {
  if (!cloudConnected()) return Promise.resolve(false);
  running ??= (async () => {
    setStatus("syncing");
    try {
      const local = { entries: await listEntries(), deleted: deletedIds(), settings: syncedSettings() };
      const remote = await download();
      const merged = mergeStates(local, remote);
      const here = changesFor(local, merged);
      const there = changesFor(remote, merged);
      const changedHere = here.write.length > 0 || here.remove.length > 0 || here.settings;
      if (here.write.length || here.remove.length || Object.keys(merged.deleted).length) await applySynced({ write: here.write, remove: here.remove, deleted: merged.deleted });
      if (here.settings) applySyncedSettings(merged.settings);
      const deletedChanged = JSON.stringify(Object.keys(merged.deleted).sort()) !== JSON.stringify(Object.keys(remote?.deleted ?? {}).sort());
      if (fitWaiting.size) await sendWaitingFits();
      if (!remote || there.write.length || there.remove.length || there.settings || deletedChanged) await upload(merged);
      write(syncedKey, Date.now());
      setStatus("idle");
      // The pages showing the library or the settings draw again with what came in.
      if (changedHere) window.dispatchEvent(new Event("library-synced"));
      return changedHere;
    } catch (error) {
      setStatus("error", error.message);
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

// A change here syncs a moment later, so a run of edits goes up once.
let pending = null;
function syncSoon() {
  if (!cloudConnected()) return;
  clearTimeout(pending);
  pending = setTimeout(syncNow, 3000);
}

export async function setupCloud() {
  if (!cloudAvailable()) return;
  try {
    await finishSignIn();
  } catch (error) {
    setStatus("error", error.message);
  }
  window.addEventListener("library-change", syncSoon);
  window.addEventListener("library-change", () => applyMarks());
  window.addEventListener("synced-settings-change", syncSoon);
  // Coming back to the window picks up what another device did meanwhile.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncNow();
  });
  syncNow();
}
