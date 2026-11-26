// Comparing stored values, the same way for settings, history and sync.

// Nothing there: null, undefined, or an empty object or list.
export const isBlank = (value) => value == null || (typeof value === "object" && Object.keys(value).length === 0);

// Equal as stored, missing and null alike.
export const sameValue = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
