import { readNumberText, readText } from "../fields.js";
import { t } from "./context.js";

// Checking what is typed into the app's fields: a field with a wrong value gets a red border
// and a note under it, and the value is not used until it is fixed.

// The note under a field, made the first time it is needed: in the field's label or table cell, after the input
// (or after the box the input sits in, such as a date field with its button).
function hintFor(input) {
  if (input._hint) return input._hint;
  const hint = document.createElement("span");
  hint.className = "field-error";
  hint.setAttribute("role", "alert");
  hint.hidden = true;
  // A row laid out in columns (data-field-row) takes the note on a line of its own under it.
  const row = input.closest("[data-field-row]");
  if (row) row.append(hint);
  else (input.closest(".date-field") ?? input).after(hint);
  input._hint = hint;
  return hint;
}

// Marks the field with the message, or clears it with none. Returns whether the field is fine.
export function markField(input, message) {
  input.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", String(Boolean(message)));
  if (message || input._hint) {
    const hint = hintFor(input);
    hint.hidden = !message;
    hint.textContent = message ?? "";
  }
  // For a form around it to enable or disable its save button.
  input.dispatchEvent(new Event("field-check", { bubbles: true }));
  return !message;
}

const marked = (input, { value, error }) => {
  markField(input, error ? t(error.key, error.params) : null);
  return error ? undefined : value;
};

// The number in the field (null when empty and optional), or undefined with the field marked.
export const checkNumber = (input, options = {}) => marked(input, readNumberText(input.value, { ...options, badInput: Boolean(input.validity?.badInput) }));

// The trimmed text in the field, or undefined with the field marked.
export const checkText = (input, options) => marked(input, readText(input.value, options));
