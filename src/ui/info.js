import { t } from "./context.js";

// On a phone the explanations under a card's content (marked .info-note) stay out of sight: an ⓘ beside the
// card's title opens the one it belongs to in a sheet. A desktop keeps them in the card and the buttons hidden,
// but on the Analysis page, where they would crowd the charts, as a tooltip of the ⓘ.
// The sheet reads the note when it opens, so notes the page rewrites (a translation, a computed text) stay current.

// An explanation laid out into box: the first line says what it is about; each "range: meaning" line after it
// becomes a row of a table, coloured by tones in order ("fresh", "neutral", "building", "over" or none);
// any other line a note of its own.
export function renderInfo(box, text, tones = []) {
  const span = (className, content) => Object.assign(document.createElement("span"), { className, textContent: content });
  const [intro, ...lines] = text.trim().split(/\n/);
  const table = span("tile-info-table", "");
  box.replaceChildren(span("tile-info-intro", intro));
  let row = 0;
  for (const line of lines) {
    const at = line.indexOf(": ");
    if (at < 0) {
      box.append(span("tile-info-note", line));
      continue;
    }
    if (!table.isConnected) box.append(table);
    const tone = tones[row++];
    table.append(span(`tile-info-range${tone ? ` is-${tone}` : ""}`, line.slice(0, at)), span("", line.slice(at + 2)));
  }
}

// The app's own tooltip on an element instead of the browser's title: the text in the box the ⓘ use, on hover or focus.
export function hoverTip(element, text) {
  if (!text) return element;
  element.classList.add("has-tip");
  if (element.tabIndex < 0 && element.tagName !== "BUTTON") element.tabIndex = 0;
  const box = Object.assign(document.createElement("span"), { className: "tile-info-text hover-tip-text", textContent: text });
  box.setAttribute("role", "tooltip");
  element.setAttribute("aria-label", text);
  element.append(box);
  return element;
}

// The same tooltip laid out as the diary calendar's: for each of blocks ({ when, total, detail, parts }, or an array of
// them) a dimmed line, the name in bold, a muted note, then each part ({ label, value, color }) a row with a dot of its
// colour and its value on the right. Used where the diary's own tooltip box is not at hand.
export function richTip(element, blocks) {
  const list = [blocks].flat().filter(Boolean);
  if (!list.length) return element;
  element.classList.add("has-tip");
  if (element.tabIndex < 0 && element.tagName !== "BUTTON") element.tabIndex = 0;
  const line = (className, text) => Object.assign(document.createElement("div"), { className, textContent: text });
  const box = Object.assign(document.createElement("span"), { className: "tile-info-text hover-tip-text rich-tip" });
  box.setAttribute("role", "tooltip");
  for (const { when, total, detail, parts = [] } of list) {
    const block = Object.assign(document.createElement("div"), { className: "rich-tip-block" });
    block.append(...(when ? [line("diary-tooltip-when", when)] : []), line("diary-tooltip-total", total), ...(detail ? [line("diary-tooltip-detail", detail)] : []));
    for (const { label, value, color } of parts) {
      const row = Object.assign(document.createElement("div"), { className: "diary-tooltip-row" });
      const swatch = Object.assign(document.createElement("i"), { className: "compare-swatch" });
      if (color) swatch.style.background = color;
      row.append(swatch, Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("strong"), { textContent: value ?? "" }));
      block.append(row);
    }
    box.append(block);
  }
  // A screen reader hears it as plain lines.
  element.setAttribute("aria-label", list.map(({ when, total, parts = [] }) => [when, total, ...parts.map(({ label, value }) => [label, value].filter(Boolean).join(" "))].filter(Boolean).join(", ")).join("; "));
  element.append(box);
  return element;
}

// Marks element for the shared tooltip below, as hoverTip does with a box of its own; returns it for chaining.
export function tipOn(element, text) {
  if (text) element.dataset.tip = text;
  else delete element.dataset.tip;
  return element;
}

// The same tooltip for any element marked data-tip, where a child box would not do (a button whose text a
// translation rewrites, a disabled one, a table cell): one box shown under the element, or above it near the
// bottom, kept on screen and inside an open dialog, which would cover one outside it.
export function setupTips() {
  if (!matchMedia("(hover: hover)").matches) return;
  const box = Object.assign(document.createElement("div"), { className: "tile-info-text app-tip" });
  box.setAttribute("role", "tooltip");
  let current = null;
  const hide = () => {
    current = null;
    box.remove();
  };
  const show = (element) => {
    const text = element.dataset.tip;
    if (!text) return hide();
    current = element;
    box.textContent = text;
    (element.closest("dialog[open]") ?? document.body).append(box);
    const target = element.getBoundingClientRect();
    const tip = box.getBoundingClientRect();
    const left = Math.min(Math.max(8, target.left + target.width / 2 - tip.width / 2), innerWidth - tip.width - 8);
    const below = target.bottom + 6;
    box.style.left = `${left}px`;
    box.style.top = `${below + tip.height > innerHeight - 8 ? target.top - 6 - tip.height : below}px`;
  };
  document.addEventListener("mouseover", (event) => {
    const element = event.target.closest?.("[data-tip]");
    if (element === current) return;
    if (element) show(element);
    else if (current) hide();
  });
  document.addEventListener("focusin", (event) => {
    if (event.target.matches?.("[data-tip]:focus-visible")) show(event.target);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("pointerdown", hide);
  addEventListener("scroll", hide, true);
}

// An ⓘ whose tooltip, opened by hover or a tap, lays out text as renderInfo does; set() changes the text later,
// an empty text hiding the ⓘ.
export function infoHint(text = "", tones = []) {
  const hint = Object.assign(document.createElement("span"), { className: "tile-info", tabIndex: 0, textContent: "i" });
  hint.setAttribute("role", "button");
  const box = Object.assign(document.createElement("span"), { className: "tile-info-text" });
  box.setAttribute("role", "tooltip");
  hint.append(box);
  let current = text, currentTones = tones;
  // On a phone a tap opens the explanation in the sheet from the bottom, as the other explanations do, headed by the
  // card's title; a tooltip there would run off the screen. The settings' ⓘ (withTip) opens its own.
  hint.addEventListener("click", (event) => {
    if (!matchMedia("(max-width: 640px)").matches || hint.classList.contains("settings-tip")) return;
    event.preventDefault();
    hint.blur();
    const box = hint.closest(".diary-tile, .card, section, dialog");
    const heading = box?.querySelector("h2, h3, h4, .diary-tile-label, .field-label, .chart-title, .info-title, .panel-title, strong")?.cloneNode(true);
    heading?.querySelectorAll(".tile-info").forEach((inner) => inner.remove());
    // A card titled by its select (the trend's metric) is headed by the chosen option.
    const title = heading?.textContent.trim() || box?.querySelector("select")?.selectedOptions[0]?.text || "";
    openInfoSheet(title, current, currentTones);
  });
  hint.set = (value, valueTones = []) => {
    current = value;
    currentTones = valueTones;
    hint.hidden = !value;
    hint.setAttribute("aria-label", value);
    if (value) renderInfo(box, value, valueTones);
  };
  hint.set(text, tones);
  return hint;
}

function sheet() {
  let dialog = document.getElementById("infoDialog");
  if (dialog) return dialog;
  dialog = Object.assign(document.createElement("dialog"), { id: "infoDialog", className: "intervals-dialog info-dialog" });
  const head = Object.assign(document.createElement("div"), { className: "dialog-head" });
  const title = Object.assign(document.createElement("h2"), { id: "infoDialogTitle" });
  const close = Object.assign(document.createElement("button"), { type: "button", className: "settings-close" });
  close.dataset.i18nAria = "close";
  close.setAttribute("aria-label", t("close"));
  close.addEventListener("click", () => dialog.close());
  head.append(title, close);
  dialog.setAttribute("aria-labelledby", title.id);
  dialog.append(head, Object.assign(document.createElement("div"), { id: "infoDialogText", className: "info-dialog-text" }));
  // A tap on the backdrop, outside the sheet, closes it.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.body.append(dialog);
  return dialog;
}

// The explanation in the sheet from the bottom, as a phone shows it.
export function openInfoSheet(heading, text, tones = []) {
  const dialog = sheet();
  document.getElementById("infoDialogTitle").textContent = heading;
  renderInfo(document.getElementById("infoDialogText"), text, tones);
  dialog.showModal();
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
      openInfoSheet(title.textContent, note.textContent);
    });
    // On a desktop the Analysis page keeps its notes behind the ⓘ too, shown as a tooltip on hover or focus.
    const tip = Object.assign(document.createElement("span"), { className: "tile-info-text info-tip", role: "tooltip" });
    button.append(tip);
    const fill = () => renderInfo(tip, note.textContent);
    button.addEventListener("mouseenter", fill);
    button.addEventListener("focus", fill);
    title.after(button);
    // A note left empty has nothing to open.
    const sync = () => { button.hidden = !note.textContent.trim(); };
    new MutationObserver(sync).observe(note, { childList: true, characterData: true, subtree: true });
    sync();
  }
}

// An ⓘ put into the title, its explanation in a tooltip on hover or a tap, as elsewhere in the app; returns the title.
export function withTip(title, text) {
  const hint = infoHint(text);
  hint.classList.add("is-inline", "opens-right", "settings-tip");
  const heading = title.textContent;
  // On a phone a tap opens it in the sheet from the bottom, as the other explanations; a label holding it is not clicked through.
  hint.addEventListener("click", (event) => {
    if (!matchMedia("(max-width: 640px)").matches) return;
    event.preventDefault();
    hint.blur();
    openInfoSheet(heading, text);
  });
  title.append(hint);
  return title;
}
