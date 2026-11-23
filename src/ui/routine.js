// The Exercises dialog's Set tab: a set built automatically (a style, an area and a length, or a style's own
// choices) or by hand (the exercises picked, ordered and dosed), shown with its figures and run in the same player
// as the warm-up and the stretching. A set can be saved to run again as it is, and put on weekdays in the plan.
// The choices are remembered; a set done is logged by day.
import { areasOf, defaultGear, gearStyleTools, gearTools, balanceReps, balanceWeak, buildRoutine, byLength, defaultDose, exerciseGroups, logRoutine, plannedRoutine, togglePlanDay, withoutSaved, nextLevel, recordFeel, stabilityFeels, routineAims, routineAreas, routineMinutes, routineStyles, stabilityChains, stabilityLevels, weakerExtra } from "../routines.js";
import { exercises } from "../recovery.js";
import { dose, figures, minutesText, nameLine, playSteps } from "./recovery.js";
import { videoButton } from "./video.js";
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
export const stabilityLog = () => savedDefaults().stabilityLog ?? {};
// A weekday's short name in the app's language, 0 Monday (1 January 2024 was one).
const weekdayName = (weekday, form = "short") => new Intl.DateTimeFormat(state.language === "en" ? "en-GB" : "cs-CZ", { weekday: form, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + weekday)));
// A set's short description: its name when it has one, else "Yin yoga 15 min".
const setText = (set) => set.name ? `${set.name} · ${set.minutes} min` : t("routineWhat", { style: t(`routineStyle_${set.style}`), minutes: set.minutes });
// mode: "auto" or "custom"; levels: each stabilization chain's level; ball: the pelvis's ball moves; weak, reps:
// the balance's; custom: the hand-made set, [{ id, seconds | reps }].
const choice = () => ({ mode: "auto", gear: defaultGear, tool: "band", style: "mobility", area: "all", minutes: 10, aim: "keep", levels: { front: 1, back: 1, side: 1 }, ball: true, weak: "none", reps: 10, custom: [], ...(savedDefaults().routine ?? {}) });
const saveChoice = (change) => saveDefaults({ routine: { ...choice(), ...change } });
// What the set is built from: the hand-made list, or the automatic choice, without the ball where there is none
// and with a tool that is there.
const owned = (picked = choice()) => picked.gear ?? defaultGear;
const ownTools = (picked) => gearStyleTools.filter((tool) => owned(picked).includes(tool));
const current = (picked = choice()) => {
  if (picked.mode === "custom") return { style: "custom", custom: picked.custom ?? [] };
  const tools = ownTools(picked);
  return { ...picked, ball: picked.ball !== false && owned(picked).includes("ball"), tool: tools.includes(picked.tool) ? picked.tool : tools[0] ?? null };
};

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
  if (exercises[id].book) text.append(videoButton(exercises[id].book) ?? element("span", "field-note exercises-sets", t("routineBook", { video: exercises[id].book })));
  text.append(...more);
  item.append(pictures, text);
  return item;
}

// Every exercise of a group to add to the hand-made set, the group picked by its buttons; one added says how often.
function renderCatalog(picked) {
  const groups = exerciseGroups(owned(picked));
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

// A planned day's set: a saved one as it was saved (null when it has since been taken out), else built from its choice.
function plannedSet(item) {
  // Stabilization in the plan goes at the levels reached since, not those it was planned at.
  if (item?.style === "stability") return buildRoutine({ ...item, levels: choice().levels });
  if (item?.style !== "saved") return item ? buildRoutine(item) : null;
  const entry = routineSaved().find((saved) => saved.id === item.saved);
  return entry ? { ...entry.set, name: entry.name } : null;
}

// The saved sets, each to start, put on weekdays in the plan or take out (its days in the plan with it).
function renderSaved() {
  const saved = routineSaved();
  byId("routineSavedBox").hidden = !saved.length;
  byId("routineSaved").replaceChildren(...saved.map((entry) => {
    const row = element("li", "routine-saved-item");
    // The name with its style and length under it, then its buttons on the same line.
    const text = element("span", "routine-saved-name", entry.name);
    text.append(element("span", "field-note", `${t(`routineStyle_${entry.set.style}`)} · ${entry.set.minutes} min`));
    const remove = button("link-button", "✕", () => {
      // A set in the plan asks first, naming its days: they stay empty, what was there before does not come back.
      const days = Object.entries(routinePlan()).filter(([, item]) => item.style === "saved" && item.saved === entry.id).map(([weekday]) => weekdayName(Number(weekday), "long"));
      if (days.length && !window.confirm(t("routineSavedRemoveConfirm", { name: entry.name, days: days.join(", ") }))) return;
      saveDefaults({ routineSaved: routineSaved().filter((item) => item.id !== entry.id), routinePlan: withoutSaved(routinePlan(), entry.id) });
      changed();
      render();
    }, t("routineRemove"));
    row.append(text, button("outline-button", t("routineSavedStart"), () => {
      byId("exercisesDialog").close();
      playSet({ ...entry.set, name: entry.name }, today());
    }), remove);
    // Its weekdays in the plan; a day held by another set changes over to this one.
    const plan = routinePlan();
    const days = element("div", "segmented routine-saved-days");
    days.setAttribute("role", "group");
    days.setAttribute("aria-label", t("routinePlanLabel"));
    days.append(...[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const day = button("", weekdayName(weekday), () => {
        saveDefaults({ routinePlan: togglePlanDay(routinePlan(), weekday, { style: "saved", saved: entry.id }) });
        changed();
        render();
      });
      day.setAttribute("aria-pressed", String(plan[weekday]?.style === "saved" && plan[weekday].saved === entry.id));
      return day;
    }));
    row.append(days);
    return row;
  }));
}

function render() {
  const picked = choice();
  const pick = (key) => (value) => { saveChoice({ [key]: value }); render(); };
  const custom = picked.mode === "custom";
  // The equipment at home, each on or off.
  byId("routineGear").replaceChildren(...gearTools.map((tool) => {
    const item = button("", t(`routineGear_${tool}`), () => {
      const now = owned(choice());
      saveChoice({ gear: now.includes(tool) ? now.filter((each) => each !== tool) : [...now, tool] });
      render();
    });
    item.setAttribute("aria-pressed", String(owned(picked).includes(tool)));
    return item;
  }));
  segmented(byId("routineTool"), ownTools(picked), (value) => t(`routineGear_${value}`), current(picked).tool, pick("tool"));
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
  // The rows that belong to the style chosen; the ball's only with a ball at home.
  for (const row of byId("exercisesRoutine").querySelectorAll("[data-routine-for]")) row.hidden = !row.dataset.routineFor.split(" ").includes(picked.style);
  for (const id of ["routineBall"]) byId(id).hidden = byId(id).previousElementSibling.hidden = !owned(picked).includes("ball");
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
    ...(set.style === "gear" && !set.steps.length ? [] : [t(`routineNote_${set.style === "stability" && !current(picked).ball ? "stabilityNoBall" : set.style}`, { time: hold >= 120 ? `${minutesText(hold)} min` : `${hold} s`, extra: weakerExtra, tool: t(`routineGear_${set.tool}`) })]),
    ...(set.rounds > 1 ? [t("routineRounds", { rounds: set.rounds })] : []),
    ...(noArea ? [t("routineNoArea")] : []),
    // What the equipment at home leaves out.
    ...(picked.style === "balance" && !owned(picked).includes("dumbbell") ? [t("routineNoDumbbell")] : []),
    ...(picked.style === "gear" && !ownTools(picked).length ? [t("routineNoTool")] : []),
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
  const planned = Object.entries(plan).sort(([a], [b]) => a - b).flatMap(([weekday, item]) => { const set = plannedSet(item); return set ? [`${weekdayName(Number(weekday))} ${setText(set)}`] : []; });
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

// At the end of a set with stabilization chains: how each chain's minute went. An answer is kept by day and moves
// the chain's level by nextLevel (two easy in a row up, two hard down); changing one's mind recounts from the level
// the set began at. A chain done at another level than its current one (an old saved set) is kept but moves nothing.
function askFeel(set, day) {
  const chains = [...new Set(set.exercises)].filter((id) => exercises[id].chain && exercises[id].level).map((id) => ({ chain: exercises[id].chain, level: exercises[id].level }));
  if (!chains.length) return null;
  return (holder) => {
    holder.append(element("p", "stability-feel-title", t("feelTitle")));
    for (const { chain, level } of chains) {
      const base = choice().levels?.[chain] ?? 1;
      const row = element("div", "stability-feel-row");
      const buttons = element("div", "segmented");
      buttons.setAttribute("role", "group");
      const result = element("span", "stability-feel-result");
      const answer = (feel) => {
        const log = recordFeel(stabilityLog(), chain, day, level, feel);
        const next = level === base ? nextLevel(log[chain], base) : { level: base, change: 0 };
        saveDefaults({ stabilityLog: log, routine: { ...choice(), levels: { ...choice().levels, [chain]: next.level } } });
        for (const item of buttons.children) item.setAttribute("aria-pressed", String(item.dataset.feel === feel));
        result.textContent = next.change > 0 ? t("feelUp", { level: next.level }) : next.change < 0 ? t("feelDown", { level: next.level }) : t(`feelSame_${feel}`, { level: base });
        changed();
      };
      buttons.append(...stabilityFeels.map((feel) => {
        const item = button("", t(`feel_${feel}`), () => answer(feel));
        item.dataset.feel = feel;
        item.setAttribute("aria-pressed", "false");
        return item;
      }));
      buttons.setAttribute("aria-label", t(`routineChain_${chain}`));
      row.append(element("span", "field-label", t("feelChain", { chain: t(`routineChain_${chain}`), level })), buttons, result);
      holder.append(row);
    }
  };
}

// A set in the player; done, the day is logged. intro: its list shown first (from the plan or the saved ones).
function playSet(set, day, { intro = true } = {}) {
  playSteps(set.steps, {
    doneKey: "routineDone",
    doneNote: t(set.style === "stability" ? "routineDoneNoteStability" : "routineDoneNote"),
    ...(intro ? { intro: { title: setText(set), note: "", exercises: [...new Set(set.exercises)].map((id) => ({ id, seconds: set.seconds[id], reps: set.reps?.[id] })) } } : {}),
    after: askFeel(set, day),
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
  const set = plannedSet(planned);
  // Done once a set of its style (a saved one: of its name) is logged that day.
  if (set && !done.some((item) => item.style === set.style && (set.name == null || item.name === set.name))) {
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
