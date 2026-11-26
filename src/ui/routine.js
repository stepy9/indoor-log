// The Exercises dialog's Set tab: a set built automatically (a style, an area and a length, or a style's own
// choices) or by hand (the exercises picked, ordered and dosed), shown with its figures and run in the same player
// as the warm-up and the stretching. A set can be saved to run again as it is, and put on weekdays in the plan.
// The choices are remembered; a set done is logged by day.
import { allEntries } from "./entries.js";
import { element } from "./dom.js";
import { dayKey, dayMs, todayKey } from "../dates.js";
import { confirmDialog } from "./confirm.js";
import { areasOf, gearStyleTools, gearTools, balanceReps, balanceWeak, pilatesLevels, breathTechniques, breathMinutes, buildRoutine, byLength, defaultDose, exerciseGroups, logRoutine, plannedRoutine, togglePlanDay, withoutSaved, morningSet, morningSetId, weekCount, nextLevel, recordFeel, stabilityFeels, routineAims, routineAreas, routineMinutes, routineStyles, stabilityChains, stabilityLevels, weakerExtra, trainingStyles, warmupKinds, stretchKinds } from "../routines.js";
import { exercises, strengthLevel } from "../recovery.js";
import { dose, figures, minutesText, nameLine, openExercises, playSteps, strengthLog, warmupLog } from "./recovery.js";
import { videoButton } from "./video.js";
import { hoverTip } from "./info.js";
import { saveDefaults, savedDefaults, settingsChanged } from "./preferences.js";
import { saveEntries } from "../library.js";
import { byId, locale, t, zone } from "./context.js";
import { showToast } from "./toast.js";

const button = (className, text, onClick, label = null) => {
  const item = element("button", className, text);
  item.type = "button";
  if (label) item.setAttribute("aria-label", label);
  item.addEventListener("click", onClick);
  return item;
};
// The day's last rowing workout not yet stretched after, which a stretching done here ticks as the Today card's does.
const unstretched = async (day) => (await allEntries()).filter((entry) => entry.sport === "rowing" && !entry.stretched && dayKey(entry.startMs, zone) === day).sort((a, b) => a.startMs - b.startMs).at(-1) ?? null;

export const routineLog = () => savedDefaults().routineLog ?? {};
export const routinePlan = () => savedDefaults().routinePlan ?? {};
// Saved sets, each as it was when saved: [{ id, name, set: { style, minutes, exercises, seconds, reps, steps } }].
export const routineSaved = () => savedDefaults().routineSaved ?? [];
export const stabilityLog = () => savedDefaults().stabilityLog ?? {};
// A weekday's short name in the app's language, 0 Monday (1 January 2024 was one).
const weekdayName = (weekday, form = "short") => new Intl.DateTimeFormat(locale(), { weekday: form, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + weekday)));
// A set's short description: its name when it has one, else "Yin yoga 15 min".
const setText = (set) => set.name ? `${set.name} · ${set.minutes} min` : t("routineWhat", { style: t(`routineStyle_${set.style}`), minutes: set.minutes });
// mode: "auto" or "custom"; levels: each stabilization chain's level; ball: the pelvis's ball moves; weak, reps:
// the balance's; custom: the hand-made set, [{ id, seconds | reps }].
const choice = () => ({ mode: "auto", tool: "band", style: "mobility", area: "all", minutes: 10, aim: "keep", levels: { front: 1, back: 1, side: 1 }, ball: true, weak: "none", reps: 10, level: "basic", technique: "resonant", breathMinutes: 5, custom: [], ...(savedDefaults().routine ?? {}) });
const saveChoice = (change) => saveDefaults({ routine: { ...choice(), ...change } });
// What the set is built from: the hand-made list, or the automatic choice, without the ball where there is none
// and with a tool that is there.
// Every piece of equipment is offered; each exercise's card names what it takes.
const owned = () => gearTools;
const ownTools = () => gearStyleTools;
const current = (picked = choice()) => {
  if (picked.mode === "custom") return { style: "custom", custom: picked.custom ?? [] };
  const tools = ownTools();
  // The sets around rowing: the short warm-up's and the stretching's turn by today, strength at the level reached.
  const around = { day: todayKey(zone), strengthSteps: strengthLevel(strengthLog(), todayKey(zone)).steps };
  return { ...picked, ...around, ball: picked.ball !== false, tool: tools.includes(picked.tool) ? picked.tool : tools[0] ?? null };
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
    row.append(name, amount, unit, up, down, button("link-button icon-x", "", () => update(list.filter((_, at) => at !== index)), t("routineRemove")));
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
  // Short labels, so all three fit in a card's row; the video's number in its tooltip.
  const video = exercises[id].book ? videoButton(exercises[id].book) : null;
  if (video) {
    video.textContent = `▶ ${t("videoShort")}`;
    hoverTip(video, t("videoPlay", { video: exercises[id].book }));
  }
  if (exercises[id].book && !video) text.append(element("span", "field-note exercises-sets", t("routineBook", { video: exercises[id].book })));
  // The buttons in one row at the card's foot, so cards side by side line them up.
  const actions = element("div", "recovery-actions");
  actions.append(...(video ? [video] : []), button("outline-button routine-try", `▶ ${t("routineTry")}`, () => tryExercise(id)), ...more);
  item.append(pictures, text, actions);
  return item;
}

// One exercise tried in the player, to see and hear it before a set: a short pause with its spoken cue, then a
// short go of it, one side only; two breaths of a breathing exercise. Nothing is logged.
const trySeconds = 30;
const tryReps = 5;
function tryExercise(id) {
  const exercise = exercises[id];
  const length = exercise.pattern ? 2 * exercise.pattern.reduce((sum, [, seconds]) => sum + seconds, 0) : Math.min(exercise.seconds ?? trySeconds, trySeconds);
  const work = { type: "work", id, side: exercise.sides > 1 ? 1 : null, ...(exercise.reps && !exercise.pattern ? { reps: Math.min(exercise.reps, tryReps) } : { seconds: length }) };
  playSteps([{ type: "rest", seconds: 5, next: id }, work], { doneKey: "routineTryDone" });
}

// Every exercise of a group to add to the hand-made set, the group picked by its buttons; one added says how often.
function renderCatalog(picked) {
  const groups = exerciseGroups(owned());
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
// day: the day it is for, so a set by area takes that day's turn.
function plannedSet(item, day = null) {
  // Stabilization in the plan goes at the levels reached since, not those it was planned at.
  if (item?.style === "stability") return buildRoutine({ ...item, levels: choice().levels });
  if (item?.style !== "saved") return item ? buildRoutine({ ...item, day }) : null;
  const entry = routineSaved().find((saved) => saved.id === item.saved);
  return entry ? { ...entry.set, name: entry.name } : null;
}

// The saved sets, each to start, put on weekdays in the plan or take out (its days in the plan with it).
function renderSaved() {
  const saved = routineSaved();
  // The morning mobility offered until it is saved (and again once taken out).
  const offer = saved.some((entry) => entry.id === morningSetId) ? [] : [button("link-button", t("routineMorningAdd"), () => {
    const { style, minutes, exercises: ids, seconds, reps, steps } = morningSet();
    saveDefaults({ routineSaved: [...routineSaved(), { id: morningSetId, name: t("routineMorningName"), set: { style, minutes, exercises: ids, seconds, reps, steps } }] });
    settingsChanged();
    renderSaved();
    showToast(t("routineSavedNote", { name: t("routineMorningName") }));
  })];
  byId("routineSavedBox").hidden = false;
  byId("routineSaved").replaceChildren(...offer.map((item) => { const row = element("li", "routine-saved-offer"); row.append(item); return row; }), ...saved.map((entry) => {
    const row = element("li", "routine-saved-item");
    // The name with its style and length under it, then its buttons on the same line.
    const text = element("span", "routine-saved-name", entry.name);
    text.append(element("span", "field-note", `${t(`routineStyle_${entry.set.style}`)} · ${entry.set.minutes} min`));
    const remove = button("link-button icon-x", "", async () => {
      // A set in the plan asks first, naming its days: they stay empty, what was there before does not come back.
      const days = Object.entries(routinePlan()).filter(([, item]) => item.style === "saved" && item.saved === entry.id).map(([weekday]) => weekdayName(Number(weekday), "long"));
      if (days.length && !(await confirmDialog({ title: t("routineSavedRemoveConfirm", { name: entry.name, days: days.join(", ") }), ok: t("delete"), danger: true }))) return;
      saveDefaults({ routineSaved: routineSaved().filter((item) => item.id !== entry.id), routinePlan: withoutSaved(routinePlan(), entry.id) });
      settingsChanged();
      render();
      showToast(t("savedSetRemoved"));
    }, t("routineRemove"));
    row.append(text, button("outline-button", t("routineSavedStart"), () => {
      playSet({ ...entry.set, name: entry.name }, todayKey(zone));
    }), remove);
    // Its weekdays in the plan; a day held by another set changes over to this one.
    const plan = routinePlan();
    const days = element("div", "segmented routine-saved-days");
    days.setAttribute("role", "group");
    days.setAttribute("aria-label", t("routinePlanLabel"));
    days.append(...[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const day = button("", weekdayName(weekday), () => {
        saveDefaults({ routinePlan: togglePlanDay(routinePlan(), weekday, { style: "saved", saved: entry.id }) });
        settingsChanged();
        render();
        showToast(t("savedRoutinePlan"));
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
  segmented(byId("routineTool"), ownTools(), (value) => t(`routineGear_${value}`), current(picked).tool, pick("tool"));
  segmented(byId("routineMode"), ["auto", "custom"], (value) => t(`routineMode_${value}`), picked.mode, pick("mode"));
  byId("routineAuto").hidden = custom;
  byId("routineCustom").hidden = !custom;
  segmented(byId("routineStyle"), routineStyles, (value) => t(`routineStyle_${value}`), picked.style, pick("style"));
  segmented(byId("routineTraining"), trainingStyles, (value) => t(`routineStyle_${value}`), picked.style, pick("style"));
  segmented(byId("routineWarmupKind"), warmupKinds, (value) => t(`routineWarmupKind_${value}`), picked.warmupKind ?? "short", pick("warmupKind"));
  segmented(byId("routineStretchKind"), stretchKinds, (value) => t(`routineStretchKind_${value}`), picked.stretchKind ?? "easy", pick("stretchKind"));
  segmented(byId("routineArea"), routineAreas, (value) => t(`routineArea_${value}`), picked.area, pick("area"));
  segmented(byId("routineMinutes"), routineMinutes, (value) => t("routineMinutesValue", { minutes: value }), picked.minutes, pick("minutes"));
  segmented(byId("routineAim"), routineAims, (value) => t(`routineAim_${value}`), picked.aim, pick("aim"));
  for (const chain of stabilityChains) {
    segmented(byId(`routineLevel_${chain}`), stabilityLevels, (value) => t("routineLevel", { level: value }), picked.levels?.[chain] ?? 1, (value) => pick("levels")({ ...picked.levels, [chain]: value }));
  }
  segmented(byId("routineBall"), [true, false], (value) => t(value ? "routineBallOn" : "routineBallOff"), picked.ball !== false, pick("ball"));
  segmented(byId("routineWeak"), balanceWeak, (value) => t(`routineWeak_${value}`), picked.weak, pick("weak"));
  segmented(byId("routineTechnique"), breathTechniques, (value) => t(`recovery_${value}`), picked.technique ?? "resonant", pick("technique"));
  segmented(byId("routineBreathMinutes"), breathMinutes, (value) => t("routineMinutesValue", { minutes: value }), picked.breathMinutes ?? 5, pick("breathMinutes"));
  segmented(byId("routinePilatesLevel"), pilatesLevels, (value) => t(`routinePilatesLevel_${value}`), picked.level ?? "basic", pick("level"));
  segmented(byId("routineReps"), balanceReps, String, picked.reps, pick("reps"));
  // The rows that belong to the style chosen; the ball's only with a ball at home.
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
  const training = !custom && trainingStyles.includes(picked.style);
  // What the set around rowing is for; these go by the day's workout on the Today card, so they are not planned here.
  byId("routinePlanDays").closest(".routine-plan").hidden = byId("routinePlanNote").hidden = training;
  byId("routineNote").textContent = custom ? "" : training ? (
    set.style === "warmup" ? t(`exercisesWarmupSet_${set.kind}`)
      : set.style === "stretch" ? t(`exercisesStretchSet_${set.kind}`)
        : t("routineNote_strengthLevel", { rounds: set.rounds })
  ) : [
    ...(set.style === "gear" && !set.steps.length ? [] : [t(`routineNote_${set.style === "stability" && !current(picked).ball ? "stabilityNoBall" : set.style}`, { time: hold >= 120 ? `${minutesText(hold)} min` : `${hold} s`, extra: weakerExtra, tool: t(`routineGear_${set.tool}`) })]),
    ...(set.rounds > 1 ? [t("routineRounds", { rounds: set.rounds })] : []),
    ...(noArea ? [t("routineNoArea")] : []),
    // What the equipment at home leaves out.
    ...(picked.style === "balance" ? [t("routineNeedsDumbbell")] : []),
  ].join(" ");
  byId("routineStart").textContent = t("routineStart", { minutes: set.minutes });
  byId("routineStart").disabled = byId("save").disabled = !set.steps.length;
  byId("routineName").placeholder = t("routineNamePlaceholder", { name: defaultName(picked, set) });
  // The plan: the days this style (or the hand-made set) is planned on pressed; a press puts the day in with the
  // choice now made.
  const plan = routinePlan();
  const style = custom ? "custom" : picked.style;
  byId("routinePlanDays").replaceChildren(...[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const day = button("", weekdayName(weekday), () => {
      saveDefaults({ routinePlan: togglePlanDay(routinePlan(), weekday, (({ day, strengthSteps, ...kept }) => kept)(current(choice()))) });
      settingsChanged();
      render();
      showToast(t("savedRoutinePlan"));
    });
    day.setAttribute("aria-pressed", String(plan[weekday]?.style === style));
    return day;
  }));
  const planned = Object.entries(plan).sort(([a], [b]) => a - b).flatMap(([weekday, item]) => { const set = plannedSet(item); return set ? [`${weekdayName(Number(weekday))} ${setText(set)}`] : []; });
  byId("routinePlanNote").textContent = planned.length ? t("routinePlanList", { list: planned.join(", ") }) : t("routinePlanEmpty");
  renderSaved();
  summarize(custom);
  const extra = set.weak && set.weak !== "none" ? ` · ${t(`routineWeakMore_${set.weak}`, { extra: weakerExtra })}` : "";
  if (!custom) byId("routineList").replaceChildren(...[...new Set(set.exercises)].map((id) => card(id, dose(id, set.seconds[id], set.reps?.[id]) + extra)));
  return set;
}

// The choices in one line, the head of their fold on a phone: "Ball, Dumbbells · Mobility · Whole body · 10 min".
function summarize(custom) {
  const pressed = (holder) => [...holder.querySelectorAll('[aria-pressed="true"]')].map((item) => item.textContent.replace(/^✓s*/, ""));
  const groups = custom ? [] : [...byId("routineAuto").querySelectorAll(".segmented")].filter((group) => !group.hidden && !group.closest("[hidden]"));
  byId("routineSummary").textContent = [...(custom ? [t("routineMode_custom")] : []), ...groups.flatMap(pressed)].filter(Boolean).join(" · ");
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
        settingsChanged();
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
    doneKey: set.style === "warmup" ? "warmupDone" : set.style === "strength" ? "strengthDone" : "routineDone",
    doneNote: t(set.style === "stability" ? "routineDoneNoteStability" : "routineDoneNote"),
    ...(intro ? { intro: { title: setText(set), note: "", exercises: [...new Set(set.exercises)].map((id) => ({ id, seconds: set.seconds[id], reps: set.reps?.[id] })) } } : {}),
    after: askFeel(set, day),
    onDone: async () => {
      // A stretching on a day rowed ticks that workout, as after it on the Today card; on another day it is a set.
      const rowed = set.style === "stretch" ? await unstretched(day) : null;
      if (rowed) {
        rowed.stretched = Date.now();
        rowed.stretchedExercises = set.exercises;
        await saveEntries([rowed]).catch(() => {});
        settingsChanged();
        showToast(t("savedSession"));
        return;
      }
      // The warm-up and strength count where the Today card's do: by day in their own logs.
      if (set.style === "warmup" || set.style === "strength") {
        const since = new Date(Date.now() - 28 * dayMs).toISOString().slice(0, 10);
        if (set.style === "warmup") saveDefaults({ warmupLog: { ...Object.fromEntries(Object.entries(warmupLog()).filter(([key]) => key >= since)), [day]: set.exercises } });
        else saveDefaults({ strengthLog: { ...strengthLog(), [day]: set.exercises } });
        settingsChanged();
        showToast(t("savedSession"));
        return;
      }
      saveDefaults({ routineLog: logRoutine(routineLog(), day, { style: set.style, minutes: set.minutes, exercises: set.exercises, ...(set.name ? { name: set.name } : {}) }) });
      settingsChanged();
      showToast(t("savedSession"));
    },
  });
}

// The Exercises dialog opened on its Set tab.
export function openRoutine() {
  render();
  openExercises();
}

let wired = false;
export function setupRoutine() {
  if (wired) return;
  wired = true;
  // Folded on a phone, so the cards come first; open on a wider screen, where the fold's head is not shown.
  const narrow = window.matchMedia("(max-width: 640px)");
  const fold = () => { byId("routineSetup").open = !narrow.matches; };
  fold();
  narrow.addEventListener("change", fold);
  // The dialog opened from the menu shows the set as now chosen. A set started here runs over it, so the page is
  // still there when it ends.
  byId("exercisesButton").addEventListener("click", render);
  byId("routineStart").addEventListener("click", () => {
    const set = render();
    playSet(set, todayKey(zone), { intro: false });
  });
  // Saved as it is now, so it runs the same however the automatic sets change later.
  byId("save").addEventListener("click", () => {
    const picked = choice();
    const set = buildRoutine(current(picked));
    if (!set.steps.length) return;
    const name = byId("routineName").value.trim() || defaultName(picked, set);
    const { style, minutes, exercises: ids, seconds, reps, steps } = set;
    saveDefaults({ routineSaved: [...routineSaved(), { id: Date.now().toString(36), name, set: { style, minutes, exercises: ids, seconds, reps: reps ?? {}, steps } }] });
    byId("routineName").value = "";
    settingsChanged();
    renderSaved();
    byId("routineNote").textContent = t("routineSavedNote", { name });
  });
}

// For the Training tab's day: the set planned for it with a button running it (until one of its style is done),
// what was done, and a button choosing any set.
export function routineBlock(day = todayKey(zone)) {
  const block = element("div", "warmup-block");
  const done = routineLog()[day] ?? [];
  const planned = plannedRoutine(routinePlan(), day);
  const set = plannedSet(planned, day);
  // Done once a set of its style (a saved one: of its name) is logged that day.
  if (set && !done.some((item) => item.style === set.style && (set.name == null || item.name === set.name))) {
    const head = element("div", "warmup-head");
    head.append(button("outline-button warmup-button", t("routinePlanned", { what: setText(set) }), () => playSet(set, day)));
    block.append(head);
  }
  // What was done, each set with a cross taking it out of the log (one tried by mistake, say), after asking.
  if (done.length) {
    const line = element("p", "training-today-done strength-done", t("routineDoneToday", { what: "" }).trim());
    done.forEach((item, index) => {
      line.append(element("span", "routine-done-item", setText(item)), button("link-button icon-x routine-done-remove", "", async () => {
        if (!(await confirmDialog({ title: t("routineDoneRemoveConfirm", { what: setText(item) }), ok: t("delete"), danger: true }))) return;
        // The day kept, empty at the last: syncing joins the days of both devices, so one dropped would come back.
        const log = routineLog();
        saveDefaults({ routineLog: { ...log, [day]: (log[day] ?? []).filter((_, at) => at !== index) } });
        settingsChanged();
        showToast(t("routineDoneRemoved"));
      }, t("routineRemove")));
    });
    block.append(line);
  }
  // Each saved set in the plan, counted for the week: green once its planned days are reached, never a streak lost.
  for (const entry of routineSaved()) {
    const { done: count, target } = weekCount(routineLog(), routinePlan(), entry, day);
    if (!target) continue;
    block.append(element("p", `field-note routine-week${count >= target ? " is-reached" : ""}`, t("routineWeek", { name: entry.name, done: count, target })));
  }
  block.append(button("link-button", t("routineOpen"), openRoutine));
  return block;
}

// A day's sets for a tooltip: the title, then each set one a line. "" when none.
// The breathing apart, under its own mark (🌬️), so a day breathed shows at a glance; the other sets under 🧎.
// A set is breathing when it is the breathing style, or a hand-made or saved set of breathing exercises only.
const isBreath = (item) => item.style === "breath" || (item.exercises?.length > 0 && item.exercises.every((id) => exercises[id]?.pattern));
export function routineTip(day) {
  const done = (routineLog()[day] ?? []).filter((item) => !isBreath(item));
  return done.length ? [t("routineTitle"), ...done.map((item) => `· ${setText(item)}`)].join("\n") : "";
}
export function breathTip(day) {
  const done = (routineLog()[day] ?? []).filter(isBreath);
  return done.length ? [t("routineStyle_breath"), ...done.map((item) => `· ${setText(item)}`)].join("\n") : "";
}
