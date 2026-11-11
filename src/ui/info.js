import { t } from "./context.js";

// On a phone the explanations under a card's content (marked .info-note) stay out of sight: an ⓘ beside the
// card's title opens the one it belongs to in a sheet. A desktop keeps them in the card and the buttons hidden,
// but on the Analysis page, where they would crowd the charts, as a tooltip of the ⓘ.
// The sheet reads the note when it opens, so notes the page rewrites (a translation, a computed text) stay current.

function sheet() {
  let dialog = document.getElementById("infoDialog");
  if (dialog) return dialog;
  dialog = Object.assign(document.createElement("dialog"), { id: "infoDialog", className: "intervals-dialog info-dialog" });
  const head = Object.assign(document.createElement("div"), { className: "dialog-head" });
  const title = Object.assign(document.createElement("h2"), { id: "infoDialogTitle" });
  const close = Object.assign(document.createElement("button"), { type: "button", className: "settings-close", textContent: "✕" });
  close.dataset.i18nAria = "libraryCloseLabel";
  close.setAttribute("aria-label", t("libraryCloseLabel"));
  close.addEventListener("click", () => dialog.close());
  head.append(title, close);
  dialog.setAttribute("aria-labelledby", title.id);
  dialog.append(head, Object.assign(document.createElement("p"), { id: "infoDialogText", className: "info-dialog-text" }));
  // A tap on the backdrop, outside the sheet, closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

export function setupInfoNotes() {
  for (const note of document.querySelectorAll(".info-note")) {
    // A converter setting's note belongs to its own panel, headed by that setting's name (.info-title).
    const box = note.closest(".panel:has(.info-title), .card, dialog");
    const title = box?.querySelector(".info-title, .field-label, h2");
    if (!title) continue;
    const button = Object.assign(document.createElement("button"), { type: "button", className: "info-button", textContent: "i" });
    button.dataset.i18nAria = "infoOpen";
    button.setAttribute("aria-label", t("infoOpen"));
    button.addEventListener("click", () => {
      // The desktop's Analysis page shows the note as the tooltip instead.
      if (button.closest("#fitnessView") && matchMedia("(min-width: 641px)").matches) return;
      const dialog = sheet();
      document.getElementById("infoDialogTitle").textContent = title.textContent;
      document.getElementById("infoDialogText").textContent = note.textContent;
      dialog.showModal();
    });
    // On a desktop the Analysis page keeps its notes behind the ⓘ too, shown as a tooltip on hover or focus.
    const tip = Object.assign(document.createElement("span"), { className: "tile-info-text info-tip", role: "tooltip" });
    button.append(tip);
    const fill = () => { tip.textContent = note.textContent; };
    button.addEventListener("mouseenter", fill);
    button.addEventListener("focus", fill);
    title.after(button);
    // A note left empty has nothing to open.
    const sync = () => { button.hidden = !note.textContent.trim(); };
    new MutationObserver(sync).observe(note, { childList: true, characterData: true, subtree: true });
    sync();
  }
}
