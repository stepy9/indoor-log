import assert from "node:assert/strict";
import test from "node:test";
import { readNumberText, readText } from "../src/fields.js";
import { translations } from "../src/i18n.js";

test("a typed number is read with a comma or a dot and checked against the field's limits", () => {
  assert.deepEqual(readNumberText("72,5", { min: 30, max: 250, decimals: 1 }), { value: 72.5 });
  assert.deepEqual(readNumberText("1991", { min: 1920, max: 2026 }), { value: 1991 });
  assert.deepEqual(readNumberText("5", { min: 30, max: 250 }), { error: { key: "settingsOutOfRange", params: { min: 30, max: 250 } } });
  assert.deepEqual(readNumberText("-3", { min: 0 }), { error: { key: "fieldAtLeast", params: { min: 0 } } });
  assert.deepEqual(readNumberText("abc"), { error: { key: "fieldNotNumber" } });
  assert.deepEqual(readNumberText("", { badInput: true }), { error: { key: "fieldNotNumber" } });
  assert.deepEqual(readNumberText(""), { value: null });
  assert.deepEqual(readNumberText("  ", { required: true }), { error: { key: "fieldRequired" } });
});

test("typed text must not be empty when needed nor too long", () => {
  assert.deepEqual(readText("  Veslo  "), { value: "Veslo" });
  assert.deepEqual(readText(" "), { error: { key: "fieldRequired" } });
  assert.deepEqual(readText("", { required: false }), { value: "" });
  assert.deepEqual(readText("abcd", { maxLength: 3 }), { error: { key: "fieldTooLong", params: { max: 3 } } });
});

test("every field problem has a text in both languages", () => {
  for (const key of ["fieldNotNumber", "fieldRequired", "fieldAtLeast", "fieldAtMost", "fieldTooLong", "fieldBadDate", "fieldsInvalid", "settingsOutOfRange", "trimTooLong"]) {
    for (const language of Object.keys(translations)) assert.ok(translations[language][key], `${language}.${key}`);
  }
});
