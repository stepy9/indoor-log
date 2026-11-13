// Reading what is typed into a field, without the page: a number with a comma or a dot, or text,
// checked against the field's limits. The problem comes back as a text key with its values.

// { value } when fine (null for an empty optional field), { error: { key, params } } otherwise.
// badInput is a number field's own flag for text it could not read, which then reads as empty.
export function readNumberText(text, { min = null, max = null, decimals = 0, required = false, badInput = false } = {}) {
  const typed = String(text ?? "").trim();
  if (badInput) return { error: { key: "fieldNotNumber" } };
  if (!typed) return required ? { error: { key: "fieldRequired" } } : { value: null };
  const number = Number(typed.replace(",", "."));
  if (!Number.isFinite(number)) return { error: { key: "fieldNotNumber" } };
  const value = Math.round(number * 10 ** decimals) / 10 ** decimals;
  if ((min != null && value < min) || (max != null && value > max)) {
    if (max == null) return { error: { key: "fieldAtLeast", params: { min } } };
    if (min == null) return { error: { key: "fieldAtMost", params: { max } } };
    return { error: { key: "settingsOutOfRange", params: { min, max } } };
  }
  return { value };
}

// Trimmed text, or the problem with it: empty when it is needed, or longer than allowed.
export function readText(text, { required = true, maxLength = null } = {}) {
  const typed = String(text ?? "").trim();
  if (required && !typed) return { error: { key: "fieldRequired" } };
  if (maxLength && typed.length > maxLength) return { error: { key: "fieldTooLong", params: { max: maxLength } } };
  return { value: typed };
}
