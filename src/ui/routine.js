// The sets on demand, "On the mat": a style, an area and a length chosen, the set shown with its figures and run
// in the same player as the warm-up and the stretching. The choice is remembered; a set done is logged by day.
import { areasOf, buildRoutine, logRoutine, routineAims, routineAreas, routineMinutes, routineStyles } from "../routines.js";
import { exercises } from "../recovery.js";
import { dose, figures, minutesText, nameLine, playSteps } from "./recovery.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, t } from "./context.js";

const element = (tag, className, textContent = "") => Object.assign(document.createElement(tag), { className, textContent });
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export const routineLog = () => savedDefaults().routineLog ?? {};
const choice = () => ({ style: "mobility", area: "all", minutes: 10, aim: "keep", ...(savedDefaults().routine ?? {}) });

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
  byId("routineAimRow").hidden = byId("routineAim").hidden = picked.style !== "flexibility";
  const set = buildRoutine(picked);
  const hold = Object.values(set.seconds)[0];
  // Yin has nothing of its own for some areas: the set says it is for the whole body then.
  const noArea = picked.area !== "all" && !set.exercises.some((id) => areasOf(id).includes(picked.area));
  byId("routineNote").textContent = [
    t(`routineNote_${set.style}`, { time: hold >= 120 ? `${minutesText(hold)} min` : `${hold} s` }),
    ...(set.rounds > 1 ? [t("routineRounds", { rounds: set.rounds })] : []),
    ...(noArea ? [t("routineNoArea")] : []),
  ].join(" ");
  byId("routineStart").textContent = t("routineStart", { minutes: set.minutes });
  byId("routineList").replaceChildren(...set.exercises.map((id) => {
    const item = element("li", "recovery-item");
    const pictures = element("div", "recovery-views");
    pictures.append(...figures(id));
    const text = element("div", "recovery-text");
    text.append(nameLine(id), element("span", "recovery-dose", dose(id, set.seconds[id])), element("p", "", t(`recoveryHow_${id}`)));
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
    doneNote: t("routineDoneNote"),
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

// For the Training tab's day: what was done on the mat today, and a button choosing a set.
export function routineBlock(day = today()) {
  const block = element("div", "warmup-block");
  const done = routineLog()[day] ?? [];
  if (done.length) block.append(element("p", "training-today-done strength-done", t("routineDoneToday", { what: done.map((item) => t("routineWhat", { style: t(`routineStyle_${item.style}`), minutes: item.minutes })).join(", ") })));
  const button = element("button", "outline-button warmup-button", t("routineOpen"));
  button.type = "button";
  button.addEventListener("click", openRoutine);
  block.append(button);
  return block;
}
