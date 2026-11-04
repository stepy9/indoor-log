import { t } from "./context.js";

// Long lists show their first rows and a button under them for the next ones, rather than pages:
// it reads well on a phone, and the rows kept back stay part of the list for whatever acts on it all.
// How many rows each list shows is remembered for the session, so a re-render does not fold it back.

const shownCounts = new Map();

export function renderLimited(container, rows, key, { step = 25, before = [] } = {}) {
  const limit = Math.max(step, shownCounts.get(key) ?? step);
  container.replaceChildren(...before, ...rows.slice(0, limit));
  // The button sits after the list, or after the scrolling box a table is wrapped in.
  const anchor = container.closest(".laps-scroll") ?? (container.tagName === "TBODY" ? container.closest("table") : container);
  const id = `${container.id || anchor.id || key}-more`;
  let button = document.getElementById(id);
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.id = id;
    button.className = "outline-button show-more";
    anchor.after(button);
  }
  const left = rows.length - limit;
  button.hidden = left <= 0;
  button.textContent = t("showMore", { count: Math.min(step, left), left });
  button.onclick = () => {
    shownCounts.set(key, limit + step);
    renderLimited(container, rows, key, { step, before });
  };
}
