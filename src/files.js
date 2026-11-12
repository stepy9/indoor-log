export async function collectDirectoryFiles(directoryHandle, relativePath = "", files = []) {
  for await (const [name, entry] of directoryHandle.entries()) {
    const entryPath = relativePath ? `${relativePath}/${name}` : name;
    if (entry.kind === "directory") {
      await collectDirectoryFiles(entry, entryPath, files);
    } else if (/\.(tcx|pwx|fit)$/i.test(name)) {
      const file = await entry.getFile();
      files.push({
        name: file.name,
        lastModified: file.lastModified,
        webkitRelativePath: entryPath,
        sourceDirectoryHandle: directoryHandle,
        text: () => file.text(),
        arrayBuffer: () => file.arrayBuffer(),
      });
    }
  }
  return files;
}

export function titleFromKinomapFileName(name) {
  return cleanTitle(name.replace(/\.(tcx|pwx)$/i, "").replace(/--\d+$/, ""));
}

// Kinomap titles often carry emoji and full-width punctuation; keep letters, digits and plain punctuation,
// and drop the underscores, dashes or dots some titles start or end with, as in "_ Easy Comeback".
export function cleanTitle(title) {
  return title
    .normalize("NFKC")
    .replace(/[\p{Extended_Pictographic}\p{So}\p{Cf}\u{FE0E}\u{FE0F}\u{20E3}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s_\-–—.,:;|]+|[\s_\-–—,:;|]+$/gu, "");
}

// Identifies a Kinomap recording across folders: its activity number, or the file name without one.
export function kinomapExportKey(fileName) {
  const name = String(fileName ?? "");
  return name.match(/--(\d+)\.(tcx|pwx)$/i)?.[1] ?? name.replace(/\.(tcx|pwx)$/i, "");
}

// A saved FIT's name ends with the activity's day and time, so a workout repeated under one name does not collide.
export function fitFileName(activityName, fallback, startMs) {
  const safeName = String(activityName ?? "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/[. ]+$/g, "") || fallback;
  if (!Number.isFinite(startMs)) return `${safeName}.fit`;
  const date = new Date(startMs);
  const pad = (value) => String(value).padStart(2, "0");
  return `${safeName} ${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}.fit`;
}

