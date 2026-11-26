import { showToast } from "./toast.js";
import { fitFileName, kinomapExportKey } from "../files.js";
import { elements, setNotice, state, t } from "./context.js";
import { downloadFile } from "./dom.js";
import { entryFromWorkout } from "../library.js";
import { rememberWorkout } from "./library.js";
import { trainerFor } from "./trainers.js";

// The trainer and resistance picked in the converter, saved with the activity.
const trainerSettings = () => ({ trainer: trainerFor(elements.trainer.value)?.name, resistance: Number(elements.resistance.value) || null });

// What saving the open activity would keep, as one text: two equal ones mean nothing was changed in between.
export function workoutFingerprint() {
  if (!state.result) return null;
  return JSON.stringify({
    entry: entryFromWorkout(state.result, { name: elements.activityName.value, savedAt: 0 }),
    kind: elements.workoutKind.value,
    ...trainerSettings(),
  });
}
import { rememberExport } from "./preferences.js";
import { backupFit } from "./cloud.js";

// Writes the FIT next to the source files when a writable folder handle is available, otherwise downloads it.
export async function saveFit(fitBytes, filename, directoryHandle) {
  const blob = new Blob([fitBytes], { type: "application/octet-stream" });
  backupFit(fitBytes, filename);
  let fallbackMessage = "";
  if (directoryHandle) {
    try {
      let permission = await directoryHandle.queryPermission?.({ mode: "readwrite" });
      if (permission !== "granted") permission = await directoryHandle.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { saved: true, fallbackMessage };
      }
      fallbackMessage = t("savePermissionDenied");
    } catch (error) {
      fallbackMessage = error.message;
    }
  }
  downloadFile(blob, filename);
  return { saved: false, fallbackMessage };
}

// Without a folder to save beside, a save dialog lets the user pick where; it opens next to the source file when that is known.
async function saveFitAs(fitBytes, filename) {
  const options = {
    suggestedName: filename,
    types: [{ description: "FIT", accept: { "application/octet-stream": [".fit"] } }],
    ...(state.kinomapFileHandle ? { startIn: state.kinomapFileHandle } : { id: "kinomap-fit-save", startIn: "downloads" }),
  };
  const handle = await window.showSaveFilePicker(options);
  const writable = await handle.createWritable();
  await writable.write(new Blob([fitBytes], { type: "application/octet-stream" }));
  await writable.close();
  backupFit(fitBytes, handle.name);
  return handle.name;
}

// Save puts the activity in the library alone, without a FIT to download; it does so even with saving exports turned off.
export async function saveToLibrary() {
  if (!state.result) return;
  const saved = await rememberWorkout(state.result, elements.workoutKind.value, { ...trainerSettings(), edited: state.editingEntry, always: true });
  if (saved) showToast(t("savedToLibrary"));
  return saved;
}

export async function exportFit() {
  if (!state.result) return;
  const filename = fitFileName(elements.activityName.value || state.result.activityName, t("fallbackActivity"), state.result.startMs);
  if (state.outputDirectoryHandle) setNotice(t("savingBesideFiles"));
  try {
    if (!state.outputDirectoryHandle && typeof window.showSaveFilePicker === "function") {
      let savedName;
      try {
        savedName = await saveFitAs(state.result.fitBytes, filename);
      } catch (error) {
        if (error.name === "AbortError") return false;
        throw error;
      }
      rememberExport(kinomapExportKey(state.kinomapFile?.name));
      await rememberWorkout(state.result, elements.workoutKind.value, { ...trainerSettings(), edited: state.editingEntry });
      showToast(t("savedAs", { filename: savedName }));
      return true;
    }
    const { saved, fallbackMessage } = await saveFit(state.result.fitBytes, filename, state.outputDirectoryHandle);
    rememberExport(kinomapExportKey(state.kinomapFile?.name));
    await rememberWorkout(state.result, elements.workoutKind.value, { ...trainerSettings(), edited: state.editingEntry });
    if (saved) showToast(t("savedBesideFiles"));
    else if (fallbackMessage) setNotice(t("saveFallbackStarted", { message: fallbackMessage }));
    else showToast(t("downloadStarted", { filename }));
    return true;
  } catch (error) {
    setNotice(t("exportFailed", { message: error.message }), "error");
    return false;
  }
}
