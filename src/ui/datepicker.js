import { state, t } from "./context.js";
import { monthLayout } from "../dates.js";

// A small month calendar of the app's own, as the browser's follows its language and starts weeks on Sunday:
// weeks from Monday, names in the app's language, Today and Clear. It opens under the anchor, inside the
// dialog the anchor is in (so it shows above it), and closes on a pick, a click elsewhere or Escape.

let open = null;

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const keyOf = (year, month, day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function close() {
  if (!open) return;
  open.element.remove();
  document.removeEventListener("pointerdown", open.outside, true);
  document.removeEventListener("keydown", open.escape, true);
  open = null;
}

export function openDatePicker(anchor, value, onPick) {
  if (open?.anchor === anchor) return close();
  close();
  const today = new Date();
  const todayKey = keyOf(today.getFullYear(), today.getMonth(), today.getDate());
  const start = value ? value.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
  let year = start[0];
  let month = start[1] - 1;
  const element = document.createElement("div");
  element.className = "date-picker";
  element.setAttribute("role", "dialog");
  const pick = (key) => {
    close();
    onPick(key);
  };
  const button = (text, className, action, label) => {
    const item = Object.assign(document.createElement("button"), { type: "button", className, textContent: text });
    if (label) item.setAttribute("aria-label", label);
    item.addEventListener("click", action);
    return item;
  };
  const render = () => {
    const head = document.createElement("div");
    head.className = "date-picker-head";
    const title = new Date(Date.UTC(year, month, 1)).toLocaleDateString(locale(), { month: "long", year: "numeric", timeZone: "UTC" });
    const step = (by) => () => {
      month += by;
      if (month < 0) [month, year] = [11, year - 1];
      if (month > 11) [month, year] = [0, year + 1];
      render();
    };
    head.append(button("‹", "date-picker-nav", step(-1), t("datePrevMonth")), Object.assign(document.createElement("strong"), { textContent: title }), button("›", "date-picker-nav", step(1), t("dateNextMonth")));
    const grid = document.createElement("div");
    grid.className = "date-picker-grid";
    // Weekday names from Monday: 2024-01-01 was one.
    for (let index = 0; index < 7; index += 1) {
      const name = new Date(Date.UTC(2024, 0, 1 + index)).toLocaleDateString(locale(), { weekday: "short", timeZone: "UTC" });
      grid.append(Object.assign(document.createElement("span"), { className: "date-picker-weekday", textContent: name }));
    }
    const { offset, days } = monthLayout(year, month);
    for (let index = 0; index < offset; index += 1) grid.append(document.createElement("span"));
    for (let day = 1; day <= days; day += 1) {
      const key = keyOf(year, month, day);
      const classes = ["date-picker-day", key === value ? "is-selected" : "", key === todayKey ? "is-today" : ""].filter(Boolean).join(" ");
      grid.append(button(String(day), classes, () => pick(key)));
    }
    const foot = document.createElement("div");
    foot.className = "date-picker-foot";
    foot.append(button(t("dateClear"), "link-button", () => pick(null)), button(t("dateToday"), "link-button", () => pick(todayKey)));
    element.replaceChildren(head, grid, foot);
  };
  render();
  const dialog = anchor.closest("dialog");
  (dialog ?? document.body).append(element);
  dialog?.addEventListener("close", close, { once: true });
  const box = anchor.getBoundingClientRect();
  const below = box.bottom + 6 + element.offsetHeight <= window.innerHeight;
  element.style.left = `${Math.max(8, Math.min(box.left, window.innerWidth - element.offsetWidth - 8))}px`;
  element.style.top = `${below ? box.bottom + 6 : Math.max(8, box.top - element.offsetHeight - 6)}px`;
  const outside = (event) => {
    if (!element.contains(event.target) && !anchor.contains(event.target)) close();
  };
  // Escape closes the calendar only, not the dialog under it.
  const escape = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", escape, true);
  open = { anchor, element, outside, escape };
}

export const closeDatePicker = close;
