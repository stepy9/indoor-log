// Swapping two days of the week's plan by hand: a dialog listing the other days planned, each with its workout and
// a warning where the swap would break a rule the plan keeps (a hard day after the longer one, the 20-minute test
// too soon after the short one); a swap is allowed anyway.
import { node } from "./dom.js";
import { noon } from "../dates.js";
import { longTires, planRuleBreaks } from "../plan.js";
import { setSwap, swappedWith } from "./excuse.js";
import { plannedText } from "./diary.js";
import { locale, t } from "./context.js";
import { showToast } from "./toast.js";

const format = (key) => new Intl.DateTimeFormat(locale(), { timeZone: "UTC", weekday: "short", day: "numeric", month: "numeric" }).format(new Date(noon(key)));

// result: the sport's trainingPlan; day: the day whose workout to swap; today: "YYYY-MM-DD". onDone after a change.
export function openSwap(result, day, today, onDone) {
  const { plan, sport } = result;
  const typeOf = new Map(result.days.map((item) => [item.day, item.type]));
  const current = swappedWith(sport, day);
  // The short test ridden this week, for the 20 minutes' gap.
  const shortDone = plan.ftpTest?.done ? plan.ftpTest.last : null;
  const dialog = node("dialog", { class: "intervals-dialog excuse-dialog swap-dialog" });
  const head = node("div", { class: "dialog-head" });
  head.append(node("h2", {}, t("swapTitle", { day: format(day) })));
  const list = node("div", { class: "swap-list" });
  const others = result.days.filter((item) => item.day !== day && item.type !== typeOf.get(day) && !["goal", "opener"].includes(item.type));
  for (const other of others) {
    // The week as it would be after the swap, and what of the plan's rules it breaks.
    const after = result.days.map((item) => ({ day: item.day, type: item.day === day ? other.type : item.day === other.day ? typeOf.get(day) : item.type }));
    const breaks = planRuleBreaks(after, shortDone, longTires(plan)).filter((item) => item.day === day || item.day === other.day);
    const button = node("button", { type: "button", class: "swap-option" });
    button.append(node("strong", {}, format(other.day)), node("span", {}, plannedText(plan, sport, other.type)));
    // The day it is swapped with already: choosing it swaps back.
    const back = other.day === current;
    if (back) button.append(node("span", { class: "field-note" }, t("swapBack")));
    for (const item of back ? [] : breaks) button.append(node("span", { class: "swap-warning" }, `⚠ ${t(`swapRule_${item.rule}`, { day: format(item.day) })}`));
    button.addEventListener("click", () => {
      setSwap(sport, day, back ? null : other.day, today);
      dialog.close();
      showToast(back ? t("savedSwapUndone") : t("savedSwap", { one: format(day), other: format(other.day) }));
      onDone?.();
    });
    list.append(button);
  }
  if (!others.length) list.append(node("p", { class: "field-note" }, t("swapNone")));
  const actions = node("div", { class: "dialog-actions" });
  const undo = node("button", { type: "button", class: "link-button" }, t("swapUndo"));
  undo.hidden = !current;
  undo.addEventListener("click", () => {
    setSwap(sport, day, null, today);
    dialog.close();
    showToast(t("savedSwapUndone"));
    onDone?.();
  });
  const cancel = node("button", { type: "button", class: "outline-button" }, t("cancel"));
  cancel.addEventListener("click", () => dialog.close());
  actions.append(undo, node("span", { class: "dialog-spacer" }), cancel);
  dialog.addEventListener("close", () => dialog.remove());
  dialog.append(head, node("p", { class: "field-note" }, t("swapNote", { what: plannedText(plan, sport, typeOf.get(day)) })), list, actions);
  document.body.append(dialog);
  dialog.showModal();
}
