// The browser's storage, read and written the same way everywhere: a private window or a full disk that refuses
// it reads as nothing stored and writes nothing, never an error.

export function readJson(key, fallback = null) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

// null or undefined removes the key.
export function writeJson(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function readText(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
