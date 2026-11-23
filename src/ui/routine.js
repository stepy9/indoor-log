// The Exercises dialog's Set tab: a set built automatically (a style, an area and a length, or a style's own
// choices) or by hand (the exercises picked, ordered and dosed), shown with its figures and run in the same player
// as the warm-up and the stretching. A set can be saved to run again as it is, and put on weekdays in the plan.
// The choices are remembered; a set done is logged by day.
import { areasOf, balanceReps, balanceWeak, buildRoutine, byLength, defaultDose, exerciseGroups, logRoutine, plannedRoutine, togglePlanDay, routineAims, routineAreas, routineMinutes, routineStyles, stabilityChains, stabilityLevels, weakerExtra } from "../routines.js";
import { exercises } from "../recovery.js";
import { dose, figures, minutesText, nameLine, playSteps } from "./recovery.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, state, t } from "./context.js";

const element = (tag, className, textContent = "") => Object.assign(document.createElement(tag), { className, textContent });
const button = (className, text, onClick, label = null) => {
  const item = element("button", className, text);
  item.type = "button";
  if (label) item.setAttribute("aria-label", label);
  item.addEventListener("click", onClick);
  return item;
};
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const changed = () => window.dispatchEvent(new Event("settings-change"));

export const routineLog = () => savedDefaults().routineLog ?? {};
export const routinePlan = () => savedDefaults().routinePlan ?? {};
// Saved sets, each as it was when saved: [{ id, name, set: { style, minutes, exercises, seconds, reps, steps } }].
export const routineSaved = () => savedDefaults().routineSaved ?? [];
// A weekday's short name in the app's language, 0 Monday (1 January 2024 was one).
const weekdayName = (weekday, form = "short") => new Intl.DateTimeFormat(state.language === "en" ? "en-GB" : "cs-CZ", { weekday: form, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + weekday)));
// A set's short description: its name when it has one, else "Yin yoga 15 min".
const setText = (set) => set.name ? `${set.name} · ${set.minutes} min` : t("routineWhat", { style: t(`routineStyle_${set.style}`), minutes: set.minutes });
// mode: "auto" or "custom"; levels: each stabilization chain's level; ball: the pelvis's ball moves; weak, reps:
// the balance's; custom: the hand-made set, [{ id, seconds | reps }].
const choice = () => ({ mode: "auto", style: "mobility", area: "all", minutes: 10, aim: "keep", levels: { front: 1, back: 1, side: 1 }, ball: true, weak: "none", reps: 10, custom: [], ...(savedDefaults().routine ?? {}) });
const saveChoice = (change) => saveDefaults({ routine: { ...choice(), ...change } });
// What the set is built from: the hand-made list, or the automatic choice.
const current = (picked = choice()) => (picked.mode === "custom" ? { style: "custom", custom: picked.custom ?? [] } : picked);

// A row of buttons, one pressed, its value saved on a click.
function segmented(holder, values, label, now, onPick) {
  holder.replaceChildren(...values.map((value) => {
    const item = button("", label(value), () => onPick(value));
    item.setAttribute("aria-pressed", String(value === now));
    return item;
  }));
}

// The hand-made set: the exercises in their order, each with its time or repeats, moved up or down or taken out.
function renderCustom(picked) {
  const list = picked.custom ?? [];
  const update = (next) => { saveChoice({ custom: next }); render(); };
  byId("routineCustomList").replaceChildren(...(list.length ? list.map((item, index) => {
    const row = element("li", "routine-custom-item");
    const name = element("span", "routine-custom-name", t(`recovery_${item.id}`));
    const counted = Boolean(item.reps);
    const amount = Object.assign(document.createElement("input"), { type: "number", min: "1", max: counted ? "50" : "600", step: counted ? "1" : "5", value: String(counted ? item.reps : item.seconds ?? exercises[item.id].seconds), className: "routine-custom-amount" });
    amount.setAttribute("aria-label", t(`recovery_${item.id}`));
    amount.addEventListener("change", () => {
      const value = Math.max(1, Math.round(Number(amount.value) || 0));
      update(list.map((entry, at) => (at === index ? { id: entry.id, ...(counted ? { reps: value } : { seconds: value }) } : entry)));
    });
    const unit = element("span", "routine-custom-unit", `${t(counted ? "routineUnitReps" : "routineUnitSeconds")}${exercises[item.id].sides > 1 ? ` ${t("sessionPerSide")}` : ""}`);
    const move = (by) => {
      const next = [...list];
      const [taken] = next.splice(index, 1);
      next.splice(index + by, 0, taken);
      update(next);
    };
    const up = button("link-button routine-custom-first", "↑", () => move(-1), t("routineUp"));
    up.disabled = index === 0;
    const down = button("link-button", "↓", () => move(1), t("routineDown"));
    down.disabled = index === list.length - 1;
    row.append(name, amount, unit, up, down, button("link-button", "✕", () => update(list.filter((_, at) => at !== index)), t("routineRemove")));
    return row;
  }) : [element("li", "field-note", t("routineCustomEmpty"))]));
}

// An exercise's card: its figures, name and mode, dose, how-to and the book's video; more: anything added under it.
function card(id, doseText, more = []) {
  const item = element("li", "recovery-item");
  const pictures = element("div", "recovery-views");
  pictures.append(...figures(id));
  const text = element("div", "recovery-text");
  text.append(nameLine(id), element("span", "recovery-dose", doseText), element("p", "", t(`recoveryHow_${id}`)));
  if (exercises[id].book) text.append(element("span", "field-note exercises-sets", t("routineBook", { video: exercises[id].book })));
  text.append(...more);
  item.append(pictures, text);
  return item;
}

// Every exercise of a group to add to the hand-made set, the group picked by its buttons; one added says how often.
function renderCatalog(picked) {
  const groups = exerciseGroups();
  const group = groups.some((item) => item.group === picked.group) ? picked.group : groups[0].group;
  segmented(byId("routineGroups"), groups.map((item) => item.group), (value) => t(`routineGroup_${value}`), group, (value) => { saveChoice({ group: value }); render(); });
  const list = picked.custom ?? [];
  byId("routineCatalog").replaceChildren(...groups.find((item) => item.group === group).ids.map((id) => {
    const count = list.filter((item) => item.id === id).length;
    const add = button("outline-button routine-add-button", `+ ${t("routineAdd")}${count ? ` · ${count}×` : ""}`, () => {
      saveChoice({ custom: [...(choice().custom ?? []), { id, ...defaultDose(id) }] });
      render();
    });
    return card(id, dose(id), [add]);
  }));
}

// The saved sets, each to start or take out.
function renderSaved() {
  const saved = routineSaved();
  byId("routineSavedBox").hidden = !saved.length;
  byId("routineSaved").replaceChildren(...saved.map((entry) => {
    const row = element("li", "routine-saved-item");
    // The name with its style and length under it, then its buttons on the same line.
    const text = element("span", "routine-saved-name", entry.name);
    text.append(element("span", "field-note", `${t(`routineStyle_${entry.set.style}`)} · ${entry.set.minutes} min`));
    const remove = button("link-button", "✕", () => {
      saveDefaults({ routineSaved: routineSaved().filter((item) => item.id !== entry.id) });
      changed();
      renderSaved();
    }, t("routineRemove"));
    row.append(text, button("outline-button", t("routineSavedStart"), () => {
      byId("exercisesDialog").close();
      playSet({ ...entry.set, name: entry.name }, today());
    }), remove);
    return row;
  }));
}

function render() {
  const picked = choice();
  const pick = (key) => (value) => { saveChoice({ [key]: value }); render(); };
  const custom = picked.mode === "custom";
  segmented(byId("routineMode"), ["auto", "custom"], (value) => t(`routineMode_${value}`), picked.mode, pick("mode"));
  byId("routineAuto").hidden = custom;
  byId("routineCustom").hidden = !custom;
  segmented(byId("routineStyle"), routineStyles, (value) => t(`routineStyle_${value}`), picked.style, pick("style"));
  segmented(byId("routineArea"), routineAreas, (value) => t(`routineArea_${value}`), picked.area, pick("area"));
  segmented(byId("routineMinutes"), routineMinutes, (value) => t("routineMinutesValue", { minutes: value }), picked.minutes, pick("minutes"));
  segmented(byId("routineAim"), routineAims, (value) => t(`routineAim_${value}`), picked.aim, pick("aim"));
  for (const chain of stabilityChains) {
    segmented(byId(`routineLevel_${chain}`), stabilityLevels, (value) => t("routineLevel", { level: value }), picked.levels?.[chain] ?? 1, (value) => pick("levels")({ ...picked.levels, [chain]: value }));
  }
  segmented(byId("routineBall"), [true, false], (value) => t(value ? "routineBallOn" : "routineBallOff"), picked.ball !== false, pick("ball"));
  segmented(byId("routineWeak"), balanceWeak, (value) => t(`routineWeak_${value}`), picked.weak, pick("weak"));
  segmented(byId("routineReps"), balanceReps, String, picked.reps, pick("reps"));
  // The rows that belong to the style chosen.
  for (const row of byId("exercisesRoutine").querySelectorAll("[data-routine-for]")) row.hidden = !row.dataset.routineFor.split(" ").includes(picked.style);
  if (custom) {
    renderCustom(picked);
    renderCatalog(picked);
  }
  byId("routineCatalogBox").hidden = !custom;
  byId("routineList").hidden = custom;
  const set = buildRoutine(current(picked));
  const hold = Object.values(set.seconds)[0];
  // Yin has nothing of its own for some areas: the set says it is for the whole body then.
  const noArea = !custom && byLength(picked.style) && picked.area !== "all" && !set.exercises.some((id) => areasOf(id).includes(picked.area));
  byId("routineNote").textContent = custom ? "" : [
    t(`routineNote_${set.style}`, { time: hold >= 120 ? `${minutesText(hold)} min` : `${hold} s`, extra: weakerExtra }),
    ...(set.rounds > 1 ? [t("routineRounds", { rounds: set.rounds })] : []),
    ...(noArea ? [t("routineNoArea")] : []),
  ].join(" ");
  byId("routineStart").textContent = t("routineStart", { minutes: set.minutes });
  byId("routineStart").disabled = byId("routineSave").disabled = !set.steps.length;
  byId("routineName").placeholder = t("routineNamePlaceholder", { name: defaultName(picked, set) });
  // The plan: the days this style (or the hand-made set) is planned on pressed; a press puts the day in with the
  // choice now made.
  const plan = routinePlan();
  const style = custom ? "custom" : picked.style;
  byId("routinePlanDays").replaceChildren(...[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const day = button("", weekdayName(weekday), () => {
      saveDefaults({ routinePlan: togglePlanDay(routinePlan(), weekday, current(choice())) });
      changed();
      render();
    });
    day.setAttribute("aria-pressed", String(plan[weekday]?.style === style));
    return day;
  }));
  const planned = Object.entries(plan).sort(([a], [b]) => a - b).map(([weekday, item]) => `${weekdayName(Number(weekday))} ${setText(buildRoutine(item))}`);
  byId("routinePlanNote").textContent = planned.length ? t("routinePlanList", { list: planned.join(", ") }) : t("routinePlanEmpty");
  renderSaved();
  const extra = set.weak && set.weak !== "none" ? ` · ${t(`routineWeakMore_${set.weak}`, { extra: weakerExtra })}` : "";
  if (!custom) byId("routineList").replaceChildren(...[...new Set(set.exercises)].map((id) => card(id, dose(id, set.seconds[id], set.reps?.[id]) + extra)));
  return set;
}

// A name the set would be saved under when none is typed: "Yin yoga · Hips", "Stability".
function defaultName(picked, set) {
  if (picked.mode === "custom") return t("routineStyle_custom");
  const style = t(`routineStyle_${set.style}`);
  return byLength(picked.style) && picked.area !== "all" ? `${style} · ${t(`routineArea_${picked.area}`)}` : style;
}

// A set in the player; done, the day is logged. intro: its list shown first (from the plan or the saved ones).
function playSet(set, day, { intro = true } = {}) {
  playSteps(set.steps, {
    doneKey: "routineDone",
    doneNote: t(set.style === "stability" ? "routineDoneNoteStability" : "routineDoneNote"),
    ...(intro ? { intro: { title: setText(set), note: "", exercises: [...new Set(set.exercises)].map((id) => ({ id, seconds: set.seconds[id], reps: set.reps?.[id] })) } } : {}),
    onDone: () => {
      saveDefaults({ routineLog: logRoutine(routineLog(), day, { style: set.style, minutes: set.minutes, exercises: set.exercises, ...(set.name ? { name: set.name } : {}) }) });
      changed();
    },
  });
}

// The Exercises dialog opened on its Set tab.
export function openRoutine() {
  byId("exercisesTabs").querySelector('[data-exercises-tab="Routine"]')?.click();
  render();
  const dialog = byId("exercisesDialog");
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

let wired = false;
export function setupRoutine() {
  if (wired) return;
  wired = true;
  // The dialog opened from the menu shows the set as now chosen.
  byId("exercisesButton").addEventListener("click", render);
  byId("routineStart").addEventListener("click", () => {
    const set = render();
    byId("exercisesDialog").close();
    playSet(set, today(), { intro: false });
  });
  // Saved as it is now, so it runs the same however the automatic sets change later.
  byId("routineSave").addEventListener("click", () => {
    const picked = choice();
    const set = buildRoutine(current(picked));
    if (!set.steps.length) return;
    const name = byId("routineName").value.trim() || defaultName(picked, set);
    const { style, minutes, exercises: ids, seconds, reps, steps } = set;
    saveDefaults({ routineSaved: [...routineSaved(), { id: Date.now().toString(36), name, set: { style, minutes, exercises: ids, seconds, reps: reps ?? {}, steps } }] });
    byId("routineName").value = "";
    changed();
    renderSaved();
    byId("routineNote").textContent = t("routineSavedNote", { name });
  });
}

// For the Training tab's day: the set planned for it with a button running it (until one of its style is done),
// what was done, and a button choosing any set.
export function routineBlock(day = today()) {
  const block = element("div", "warmup-block");
  const done = routineLog()[day] ?? [];
  const planned = plannedRoutine(routinePlan(), day);
  if (planned && !done.some((item) => item.style === planned.style)) {
    const set = buildRoutine(planned);
    const head = element("div", "warmup-head");
    head.append(button("outline-button warmup-button", t("routinePlanned", { what: setText(set) }), () => playSet(set, day)));
    block.append(head);
  }
  if (done.length) block.append(element("p", "training-today-done strength-done", t("routineDoneToday", { what: done.map((item) => setText(item)).join(", ") })));
  block.append(button("link-button", t("routineOpen"), openRoutine));
  return block;
}

// A day's sets for a tooltip: the title, then each set one a line. "" when none.
export function routineTip(day) {
  const done = routineLog()[day] ?? [];
  return done.length ? [t("routineTitle"), ...done.map((item) => `· ${setText(item)}`)].join("\n") : "";
}
