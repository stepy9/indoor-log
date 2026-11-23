// The sets on demand, "On the mat": a style, an area and a length chosen, the set shown with its figures and run
// in the same player as the warm-up and the stretching. The choice is remembered; a set done is logged by day.
import { areasOf, balanceReps, balanceWeak, buildRoutine, byLength, logRoutine, plannedRoutine, togglePlanDay, routineAims, routineAreas, routineMinutes, routineStyles, stabilityChains, stabilityLevels, weakerExtra } from "../routines.js";
import { exercises } from "../recovery.js";
import { dose, figures, minutesText, nameLine, playSteps } from "./recovery.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, state, t } from "./context.js";

const element = (tag, className, textContent = "") => Object.assign(document.createElement(tag), { className, textContent });
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const routineLog = () => savedDefaults().routineLog ?? {};
export const routinePlan = () => savedDefaults().routinePlan ?? {};
// A weekday's short name in the app's language, 0 Monday (1 January 2024 was one).
const weekdayName = (weekday, form = "short") => new Intl.DateTimeFormat(state.language === "en" ? "en-GB" : "cs-CZ", { weekday: form, timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + weekday)));
// A set's short description: "Yin yoga 15 min", "Stability 8 min".
const setText = (set) => t("routineWhat", { style: t(`routineStyle_${set.style}`), minutes: set.minutes });
// levels: each stabilization chain's level; ball: the pelvis's ball moves; weak, reps: the balance's.
const choice = () => ({ style: "mobility", area: "all", minutes: 10, aim: "keep", levels: { front: 1, back: 1, side: 1 }, ball: true, weak: "none", reps: 10, ...(savedDefaults().routine ?? {}) });

// A row of buttons, one pressed, its value saved on a click.
function segmented(holder, values, label, current, onPick) {
  holder.replaceChildren(...values.map((value) => {
    const button = element("button", "", label(value));
    button.type = "button";
    button.setAttribute("aria-pressed", String(value === current));
    button.addEventListener("click", () => onPick(value));
    return button;
  }));
}

function render() {
  const picked = choice();
  const pick = (key) => (value) => {
    saveDefaults({ routine: { ...choice(), [key]: value } });
    render();
  };
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
  for (const row of byId("routineDialog").querySelectorAll("[data-routine-for]")) row.hidden = !row.dataset.routineFor.split(" ").includes(picked.style);
  const set = buildRoutine(picked);
  const hold = Object.values(set.seconds)[0];
  // Yin has nothing of its own for some areas: the set says it is for the whole body then.
  const noArea = byLength(picked.style) && picked.area !== "all" && !set.exercises.some((id) => areasOf(id).includes(picked.area));
  byId("routineNote").textContent = [
    t(`routineNote_${set.style}`, { time: hold >= 120 ? `${minutesText(hold)} min` : `${hold} s`, extra: weakerExtra }),
    ...(set.rounds > 1 ? [t("routineRounds", { rounds: set.rounds })] : []),
    ...(noArea ? [t("routineNoArea")] : []),
  ].join(" ");
  byId("routineStart").textContent = t("routineStart", { minutes: set.minutes });
  // The plan: the days this style is planned on pressed; a press puts the day in with the choice now made.
  const plan = routinePlan();
  byId("routinePlanDays").replaceChildren(...[0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const button = element("button", "", weekdayName(weekday));
    button.type = "button";
    button.setAttribute("aria-pressed", String(plan[weekday]?.style === picked.style));
    button.addEventListener("click", () => {
      saveDefaults({ routinePlan: togglePlanDay(routinePlan(), weekday, choice()) });
      window.dispatchEvent(new Event("settings-change"));
      render();
    });
    return button;
  }));
  const planned = Object.entries(plan).sort(([a], [b]) => a - b).map(([weekday, item]) => `${weekdayName(Number(weekday))} ${setText(buildRoutine(item))}`);
  byId("routinePlanNote").textContent = planned.length ? t("routinePlanList", { list: planned.join(", ") }) : t("routinePlanEmpty");
  byId("routineList").replaceChildren(...set.exercises.map((id) => {
    const item = element("li", "recovery-item");
    const pictures = element("div", "recovery-views");
    pictures.append(...figures(id));
    const text = element("div", "recovery-text");
    const extra = set.weak && set.weak !== "none" ? ` · ${t(`routineWeakMore_${set.weak}`, { extra: weakerExtra })}` : "";
    text.append(nameLine(id), element("span", "recovery-dose", dose(id, set.seconds[id], set.reps?.[id]) + extra), element("p", "", t(`recoveryHow_${id}`)));
    if (exercises[id].book) text.append(element("span", "field-note exercises-sets", t("routineBook", { video: exercises[id].book })));
    item.append(pictures, text);
    return item;
  }));
  return set;
}

// The set run from the dialog's button: the dialog closes, the player opens and, at the end, the day is logged.
function startRoutine() {
  const set = render();
  byId("routineDialog").close();
  playSteps(set.steps, {
    doneKey: "routineDone",
    doneNote: t(set.style === "stability" ? "routineDoneNoteStability" : "routineDoneNote"),
    onDone: () => {
      saveDefaults({ routineLog: logRoutine(routineLog(), today(), { style: set.style, area: set.area, minutes: set.minutes, exercises: set.exercises }) });
      window.dispatchEvent(new Event("settings-change"));
    },
  });
}

export function openRoutine() {
  render();
  const dialog = byId("routineDialog");
  dialog.showModal();
  dialog.scrollTop = 0;
}

let wired = false;
export function setupRoutine(beforeOpen = () => {}) {
  if (wired) return;
  wired = true;
  byId("routineButton").addEventListener("click", () => { beforeOpen(); openRoutine(); });
  byId("routineClose").addEventListener("click", () => byId("routineDialog").close());
  byId("routineStart").addEventListener("click", startRoutine);
}

// A set run straight from the plan: its list shown first in the player, then the steps.
function playPlanned(set, day) {
  playSteps(set.steps, {
    doneKey: "routineDone",
    doneNote: t(set.style === "stability" ? "routineDoneNoteStability" : "routineDoneNote"),
    intro: { title: setText(set), note: "", exercises: set.exercises.map((id) => ({ id, seconds: set.seconds[id], reps: set.reps?.[id] })) },
    onDone: () => {
      saveDefaults({ routineLog: logRoutine(routineLog(), day, { style: set.style, area: set.area, minutes: set.minutes, exercises: set.exercises }) });
      window.dispatchEvent(new Event("settings-change"));
    },
  });
}

// For the Training tab's day: the set planned for it with a button running it (until one of its style is done),
// what was done on the mat, and a button choosing any set.
export function routineBlock(day = today()) {
  const block = element("div", "warmup-block");
  const done = routineLog()[day] ?? [];
  const planned = plannedRoutine(routinePlan(), day);
  if (planned && !done.some((item) => item.style === planned.style)) {
    const set = buildRoutine(planned);
    const head = element("div", "warmup-head");
    const start = element("button", "outline-button warmup-button", t("routinePlanned", { what: setText(set) }));
    start.type = "button";
    start.addEventListener("click", () => playPlanned(set, day));
    head.append(start);
    block.append(head);
  }
  if (done.length) block.append(element("p", "training-today-done strength-done", t("routineDoneToday", { what: done.map((item) => setText(item)).join(", ") })));
  const button = element("button", "link-button", t("routineOpen"));
  button.type = "button";
  button.addEventListener("click", openRoutine);
  block.append(button);
  return block;
}

// A day's sets on the mat for a tooltip: the title, then each set one a line. "" when none.
export function routineTip(day) {
  const done = routineLog()[day] ?? [];
  return done.length ? [t("routineTitle"), ...done.map((item) => `· ${setText(item)}`)].join("\n") : "";
}
