// The user's own Kinomap workouts in the Training settings: one list, each workout with its steps, made and changed
// in a table like the intervals' (length, resistance, target, type), or read from Kinomap Creator's workout JSON or
// a plan pasted as text. An import of a workout of that name splits its laps by its steps.
import { parseKinomapPlan } from "../core.js";
import { noteFromCreator, stepsFromCreator, stepsFromSegments } from "../training.js";
import { formatDuration, t } from "./context.js";
import { intensitySelectElement } from "./intervals.js";
import { withTip } from "./info.js";
import { checkNumber, markField } from "./validate.js";

const el = (tag, attributes = {}, text = "") => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
};

// "4:30" or "1:04:30" as seconds; null when it is not one.
function seconds(text) {
  const parts = String(text).trim().split(":").map(Number);
  if (!parts.length || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

const total = (steps) => steps.reduce((sum, item) => sum + (item.seconds || 0), 0);

// Steps from what was pasted: Creator's JSON, or a plan as text (its last step a minute until changed).
function stepsFromPaste(text) {
  try {
    const read = stepsFromCreator(JSON.parse(text));
    if (read) return read;
  } catch { /* not JSON */ }
  const segments = parseKinomapPlan(text, 0);
  if (!segments.length) return null;
  return stepsFromSegments(segments, segments.at(-1).startMs / 1000 + 60);
}

// The dialog, made once; open() fills it for one workout and calls back with { name, steps, note } on Save.
let dialog = null;
function editor() {
  if (dialog) return dialog;
  dialog = el("dialog", { class: "intervals-dialog workout-dialog", "aria-labelledby": "workoutDialogTitle" });
  dialog.innerHTML = `
    <div class="dialog-head"><h2 id="workoutDialogTitle"></h2><span class="estimate-note" data-role="count"></span></div>
    <label class="settings-field workout-name"><span></span><input type="text" data-role="name" /></label>
    <label class="settings-field workout-note"><span></span><textarea rows="3" data-role="note"></textarea></label>
    <details class="plan-paste"><summary data-role="paste-title"></summary>
      <textarea rows="4" data-role="paste" placeholder='{"data":{"intervals":[…]}}  /  00:00  37%  22rpm  WU'></textarea>
      <button class="accent-button" type="button" data-role="paste-apply"></button>
    </details>
    <div class="laps-scroll"><table class="laps-table intervals-table">
      <thead><tr><th></th><th>#</th><th data-role="h-start"></th><th data-role="h-length"></th><th data-role="h-resistance"></th><th data-role="h-target"></th><th data-role="h-type"></th><th></th></tr></thead>
      <tbody data-role="rows"></tbody>
    </table></div>
    <div class="dialog-actions">
      <button class="outline-button" type="button" data-role="add"></button>
      <span class="dialog-spacer"></span>
      <button class="outline-button" type="button" data-role="cancel"></button>
      <button class="export-button" type="button" data-role="save"></button>
    </div>`;
  document.body.append(dialog);
  return dialog;
}

function open({ name, steps, note, taken }, onSave) {
  const box = editor();
  const part = (role) => box.querySelector(`[data-role="${role}"]`);
  let draft = steps.map((item) => ({ ...item }));
  // The explanation behind an ⓘ by the title, as the settings' own.
  const title = box.querySelector("h2");
  title.textContent = name ? t("workoutEdit") : t("workoutNew");
  withTip(title, t("workoutHint"));
  box.querySelector(".workout-name span").textContent = t("workoutName");
  part("paste-title").textContent = t("workoutPaste");
  part("paste-apply").textContent = t("pastePlanApply");
  for (const [role, key] of [["h-start", "segmentStart"], ["h-length", "segmentDuration"], ["h-resistance", "workoutResistance"], ["h-target", "segmentTarget"], ["h-type", "lapType"], ["add", "workoutAddStep"], ["cancel", "cancel"], ["save", "save"]]) part(role).textContent = t(key);
  const nameInput = part("name");
  nameInput.value = name ?? "";
  part("paste").value = "";
  box.querySelector(".workout-note span").textContent = t("workoutNote");
  part("note").value = note ?? "";

  const wrong = () => box.querySelector('input[aria-invalid="true"]:not([hidden])');
  const update = () => {
    part("count").textContent = t("workoutSummary", { count: draft.length, total: formatDuration(total(draft)) });
    part("save").disabled = Boolean(wrong()) || !draft.length;
  };
  // The name is needed, and one no other workout has.
  const checkName = () => {
    const value = nameInput.value.trim();
    markField(nameInput, !value ? t("workoutNameMissing") : taken.includes(value.toLowerCase()) ? t("workoutNameTaken") : null);
    update();
  };
  nameInput.oninput = checkName;

  const render = () => {
    let at = 0;
    part("rows").replaceChildren(...draft.map((item, index) => {
      const row = el("tr", { class: `is-${item.intensity}` });
      const start = at;
      at += item.seconds || 0;
      const length = el("input", { type: "text", inputmode: "numeric", "aria-label": `${t("segmentDuration")} ${index + 1}` });
      length.value = formatDuration(item.seconds || 0);
      length.addEventListener("change", () => {
        const value = seconds(length.value);
        if (markField(length, value > 0 ? null : t("fieldNotNumber"))) {
          item.seconds = value;
          render();
        } else update();
      });
      const resistance = el("input", { type: "number", min: "0", max: "100", class: "level-input", placeholder: "—", "aria-label": `${t("workoutResistance")} ${index + 1}` });
      resistance.value = item.percent ?? "";
      resistance.addEventListener("input", () => {
        item.percent = resistance.value === "" ? (markField(resistance, null), null) : checkNumber(resistance, { min: 0, max: 100 }) ?? null;
        update();
      });
      // Target: none, cadence or power, with its value.
      const target = el("span", { class: "target-cell" });
      const targetType = el("select", { "aria-label": `${t("segmentTarget")} ${index + 1}` });
      targetType.append(new Option(t("targetNone"), ""), new Option("rpm", "cadence"), new Option("W", "power"));
      targetType.value = item.targetType ?? "";
      const targetValue = el("input", { type: "number", min: "1", "aria-label": `${t("segmentTarget")} ${index + 1}` });
      targetValue.value = item.target ?? "";
      targetValue.hidden = !targetType.value;
      const readTarget = () => {
        if (!targetType.value) {
          markField(targetValue, null);
          Object.assign(item, { targetType: null, target: null });
        } else {
          item.targetType = targetType.value;
          item.target = checkNumber(targetValue, { min: 1, max: targetType.value === "power" ? 2000 : 250 }) ?? null;
        }
        update();
      };
      targetType.addEventListener("change", () => {
        targetValue.hidden = !targetType.value;
        readTarget();
        if (!targetValue.hidden) targetValue.focus();
      });
      targetValue.addEventListener("input", readTarget);
      target.append(targetValue, targetType);
      const type = intensitySelectElement(item.intensity ?? "active", `${t("lapType")} ${index + 1}`, (value) => {
        item.intensity = value;
        row.className = `is-${value}`;
      });
      const remove = el("button", { type: "button", class: "link-button", title: t("removeSegment"), "aria-label": `${t("removeSegment")} ${index + 1}` }, "×");
      remove.addEventListener("click", () => {
        draft.splice(index, 1);
        render();
      });
      // Up and down by one, so a step put in the wrong place is moved rather than typed again; at the row's start,
      // away from the cross, and as large as the library's icons for a finger.
      const moves = el("span", { class: "step-moves" });
      for (const [by, path, key] of [[-1, "M6 15l6-6 6 6", "workoutStepUp"], [1, "M6 9l6 6 6-6", "workoutStepDown"]]) {
        const to = index + by;
        const button = el("button", { type: "button", class: "row-icon-button", title: t(key), "aria-label": `${t(key)} ${index + 1}` });
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
        button.disabled = to < 0 || to >= draft.length;
        button.addEventListener("click", () => {
          [draft[index], draft[to]] = [draft[to], draft[index]];
          render();
          part("rows").rows[to]?.querySelectorAll(".step-moves button")[by < 0 ? 0 : 1]?.focus();
        });
        moves.append(button);
      }
      const cells = [moves, String(index + 1), formatDuration(start), length, resistance, target, type, remove];
      row.append(...cells.map((content) => {
        const cell = el("td");
        if (content instanceof Node) cell.append(content);
        else cell.textContent = content;
        return cell;
      }));
      return row;
    }));
    update();
  };

  part("add").onclick = () => {
    // A new step like the last one, so a workout of repeats grows by a click each.
    const last = draft.at(-1);
    draft.push(last ? { ...last } : { seconds: 60, percent: null, targetType: null, target: null, intensity: "active" });
    render();
  };
  part("paste-apply").onclick = () => {
    const read = stepsFromPaste(part("paste").value);
    part("paste").classList.toggle("is-invalid", !read);
    if (!read) return;
    draft = read;
    // Creator's JSON brings its description too, which takes the place of the one typed.
    try {
      const pasted = noteFromCreator(JSON.parse(part("paste").value));
      if (pasted) part("note").value = pasted;
    } catch { /* a plan as text has none */ }
    part("paste").closest("details").open = false;
    render();
  };
  part("cancel").onclick = () => box.close();
  part("save").onclick = () => {
    checkName();
    if (wrong() || !draft.length) return;
    onSave({ name: nameInput.value.trim(), steps: draft, note: part("note").value.trim() });
    box.close();
  };
  render();
  checkName();
  box.showModal();
  if (!name) nameInput.focus();
}

// The list in the settings: each workout's name, its steps in short, and buttons to change or remove it; a button
// adds one. names: the workouts in order; plans: the steps by name; notes: the descriptions by name;
// write({ names, plans, notes }) saves them.
export function workoutList(names, plans, notes, write) {
  const box = el("div", { class: "workout-list" });
  const save = (nextNames, nextPlans, nextNotes) => {
    names = nextNames;
    plans = nextPlans;
    notes = nextNotes;
    write({ names, plans, notes });
    render();
  };
  const render = () => {
    const rows = names.map((name) => {
      const steps = plans[name] ?? [];
      const row = el("div", { class: "workout-row" });
      const text = el("div", { class: "workout-row-text" });
      text.append(el("strong", {}, name), el("span", { class: "field-note" }, steps.length ? t("workoutSummary", { count: steps.length, total: formatDuration(total(steps)) }) : t("workoutNoSteps")));
      const edit = el("button", { type: "button", class: "outline-button" }, t(steps.length ? "workoutEditButton" : "workoutAddSteps"));
      edit.addEventListener("click", () => open({ name, steps, note: notes[name], taken: names.filter((other) => other !== name).map((other) => other.toLowerCase()) }, (result) => {
        const nextPlans = { ...plans };
        delete nextPlans[name];
        nextPlans[result.name] = result.steps;
        const nextNotes = { ...notes };
        delete nextNotes[name];
        if (result.note) nextNotes[result.name] = result.note;
        save(names.map((other) => (other === name ? result.name : other)), nextPlans, nextNotes);
      }));
      const remove = el("button", { type: "button", class: "row-icon-button", title: t("workoutRemove"), "aria-label": `${t("workoutRemove")} ${name}` }, "×");
      remove.addEventListener("click", () => {
        if (!confirm(t("workoutRemoveConfirm", { name }))) return;
        const nextPlans = { ...plans };
        delete nextPlans[name];
        const nextNotes = { ...notes };
        delete nextNotes[name];
        save(names.filter((other) => other !== name), nextPlans, nextNotes);
      });
      row.append(text, edit, remove);
      return row;
    });
    const add = el("button", { type: "button", class: "outline-button workout-add" }, t("workoutAdd"));
    add.addEventListener("click", () => open({ name: "", steps: [], taken: names.map((other) => other.toLowerCase()) }, (result) => {
      save([...names, result.name], { ...plans, [result.name]: result.steps }, result.note ? { ...notes, [result.name]: result.note } : notes);
    }));
    box.replaceChildren(...rows, add);
  };
  render();
  return box;
}
