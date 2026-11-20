import { excuseReasons, setExcuse } from "../training.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { t } from "./context.js";

// Why a day went without its workout, kept with the synced settings for every sport alike:
// { "YYYY-MM-DD": { reason, note } }.
export function excuses() {
  return savedDefaults().trainingExcuses ?? {};
}

// The excuse in words: the reason, or for "other" the words given.
export function excuseText(excuse) {
  if (!excuse) return "";
  return excuse.reason === "other" ? excuse.note || t("excuse_other") : t(`excuse_${excuse.reason}`);
}

const node = (tag, attributes = {}, text) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text != null) element.textContent = text;
  return element;
};

// The dialog to say why: the usual reasons as buttons, "other" with a field for one's own words, and the days it
// covers (from the day given, to a later one for a longer break). onDone runs after a save or a removal.
export function openExcuse(day, onDone) {
  const current = excuses()[day] ?? null;
  const dialog = node("dialog", { class: "intervals-dialog excuse-dialog" });
  const head = node("div", { class: "dialog-head" });
  head.append(node("h2", {}, t("excuseTitle")));
  let reason = current?.reason ?? null;
  const reasons = node("div", { class: "excuse-reasons", role: "group", "aria-label": t("excuseTitle") });
  const other = node("input", { type: "text", maxlength: "80", class: "excuse-other", placeholder: t("excuseOtherPlaceholder"), "aria-label": t("excuse_other") });
  other.value = current?.reason === "other" ? current.note ?? "" : "";
  const buttons = excuseReasons.map((value) => {
    const button = node("button", { type: "button", "aria-pressed": String(reason === value) }, t(`excuse_${value}`));
    button.addEventListener("click", () => {
      reason = value;
      for (const item of buttons) item.setAttribute("aria-pressed", String(item === button));
      other.hidden = value !== "other";
      save.disabled = false;
      if (value === "other") other.focus();
    });
    return button;
  });
  reasons.append(...buttons);
  other.hidden = reason !== "other";
  // The days covered: the day given, to a later one for a longer break.
  const range = node("div", { class: "excuse-range" });
  const from = node("input", { type: "date", "aria-label": t("excuseFrom") });
  const to = node("input", { type: "date", "aria-label": t("excuseTo") });
  from.value = day;
  to.value = day;
  from.addEventListener("change", () => {
    if (to.value < from.value) to.value = from.value;
  });
  const fromLabel = node("label", { class: "settings-field" });
  fromLabel.append(node("span", {}, t("excuseFrom")), from);
  const toLabel = node("label", { class: "settings-field" });
  toLabel.append(node("span", {}, t("excuseTo")), to);
  range.append(fromLabel, toLabel);
  const actions = node("div", { class: "dialog-actions" });
  const remove = node("button", { type: "button", class: "link-button" }, t("excuseRemove"));
  remove.hidden = !current;
  const cancel = node("button", { type: "button", class: "outline-button" }, t("cancel"));
  const save = node("button", { type: "button", class: "export-button" }, t("save"));
  save.disabled = !reason;
  actions.append(remove, node("span", { class: "dialog-spacer" }), cancel, save);
  const write = (excuse) => {
    const first = from.value || day;
    const last = to.value && to.value >= first ? to.value : first;
    saveDefaults({ trainingExcuses: setExcuse(excuses(), first, last, excuse) });
    dialog.close();
    onDone?.();
  };
  save.addEventListener("click", () => {
    if (!reason) return;
    write({ reason, note: reason === "other" ? other.value.trim() : null });
  });
  remove.addEventListener("click", () => write(null));
  cancel.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => dialog.remove());
  dialog.append(head, node("p", { class: "field-note" }, t("excuseNote")), reasons, other, range, actions);
  document.body.append(dialog);
  dialog.showModal();
}

// Two days of a sport's plan whose workouts trade places, by hand: { sport: { "YYYY-MM-DD": "YYYY-MM-DD" } },
// kept with the synced settings. A day is in one pair at most.
export function swaps(sport) {
  return savedDefaults().trainingSwaps?.[sport] ?? {};
}

// The day a day's workout is swapped with, or null.
export function swappedWith(sport, day) {
  const pairs = swaps(sport);
  return pairs[day] ?? Object.keys(pairs).find((key) => pairs[key] === day) ?? null;
}

// Swaps two days (other null: undoes the day's swap). Pairs wholly gone by are dropped.
export function setSwap(sport, day, other, today) {
  const pairs = Object.fromEntries(Object.entries(swaps(sport)).filter(([one, two]) => ![one, two].some((key) => key === day || key === other) && (one >= today || two >= today)));
  if (other) {
    const [one, two] = [day, other].sort();
    pairs[one] = two;
  }
  saveDefaults({ trainingSwaps: { ...(savedDefaults().trainingSwaps ?? {}), [sport]: pairs } });
}
