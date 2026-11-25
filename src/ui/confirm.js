// A question in the app's own dialog rather than the browser's: a title, a line under it and two buttons, the
// one that goes ahead marked as such. Resolves true when it goes ahead, false on the other button, the cross or
// Escape.
import { t } from "./context.js";

const node = (tag, attributes = {}, text) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text != null) element.textContent = text;
  return element;
};

export function confirmDialog({ title, text = "", ok, cancel = t("cancel"), danger = false }) {
  return new Promise((resolve) => {
    const dialog = node("dialog", { class: "intervals-dialog excuse-dialog confirm-dialog" });
    const head = node("div", { class: "dialog-head" });
    head.append(node("h2", {}, title));
    const actions = node("div", { class: "dialog-actions" });
    const back = node("button", { type: "button", class: "outline-button" }, cancel);
    const go = node("button", { type: "button", class: `export-button${danger ? " is-danger" : ""}` }, ok);
    actions.append(node("span", { class: "dialog-spacer" }), back, go);
    let answer = false;
    back.addEventListener("click", () => dialog.close());
    go.addEventListener("click", () => {
      answer = true;
      dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(answer);
    });
    dialog.append(head, ...(text ? [node("p", { class: "field-note" }, text)] : []), actions);
    document.body.append(dialog);
    dialog.showModal();
    back.focus();
  });
}
