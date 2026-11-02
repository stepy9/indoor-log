import { bestAverage, bestTime, downsample, effortDistances, invertedMetric, paceFrom, powerDurations, series } from "../analysis.js";
import { listEntries } from "../library.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";
import { openLibrary } from "./library.js";

// Up to six activities at once, each keeping its colour slot while it stays selected.
const slotCount = 6;
const svgNs = "http://www.w3.org/2000/svg";

const view = {
  entries: [],
  // Selected entry id → colour slot 1–6.
  slots: new Map(),
  sport: null,
  metric: "power",
  axis: "distance",
  smoothSeconds: 10,
  hoverX: null,
  layout: null,
};

let previousView = "setupView";

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const shortDate = (epochMs) => new Intl.DateTimeFormat(locale(), {
  timeZone: zone, day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit",
}).format(new Date(epochMs));

const selected = () => view.entries.filter((entry) => view.slots.has(entry.id));

function metricLabel(metric, sport) {
  if (metric !== "pace") return t({ power: "lapPower", heartRate: "lapHeartRate", cadence: "lapCadence" }[metric]);
  return sport === "cycling" ? t("lapSpeed") : t("lapPace");
}

function metricText(value, metric, sport) {
  if (!Number.isFinite(value)) return "—";
  if (metric === "pace") return sport === "cycling" ? `${displayNumber(value, 1)} km/h` : `${formatDuration(value)}${sport === "rowing" ? " /500 m" : " /km"}`;
  return `${displayNumber(value)} ${{ power: "W", heartRate: "bpm", cadence: sport === "running" ? "spm" : "rpm" }[metric]}`;
}

const axisText = (x) => (view.axis === "distance" ? (x >= 1000 ? `${displayNumber(x / 1000, 2)} km` : `${displayNumber(x)} m`) : formatDuration(x));

// Steps of 1, 2 or 5 times a power of ten, or the given steps, that give about the asked number of ticks.
function niceTicks(low, high, count, steps = null) {
  const span = high - low || 1;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = (steps ?? [1, 2, 5, 10].map((factor) => factor * power)).find((candidate) => candidate >= raw) ?? steps?.at(-1);
  const ticks = [];
  for (let value = Math.ceil(low / step) * step; value <= high + step * 1e-6; value += step) ticks.push(value);
  return ticks;
}

// Time ticks fall on whole minutes and distance ticks on round meters.
function xTicks(high) {
  if (view.axis === "distance") return niceTicks(0, high, 6);
  const step = 60 * ([1, 2, 5, 10, 15, 20, 30, 60].find((minutes) => high / (minutes * 60) <= 7) ?? 60);
  return Array.from({ length: Math.floor(high / step) + 1 }, (_, index) => index * step);
}

function svg(tag, attributes = {}) {
  const element = document.createElementNS(svgNs, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

async function refresh() {
  view.entries = await listEntries().catch(() => []);
  const ids = new Set(view.entries.map((entry) => entry.id));
  for (const id of view.slots.keys()) if (!ids.has(id)) view.slots.delete(id);
  const sports = [...new Set(view.entries.map((entry) => entry.sport))];
  if (!sports.includes(view.sport)) view.sport = sports[0] ?? null;
  render();
}

function renderSports() {
  const select = byId("compareSport");
  const sports = [...new Set(view.entries.map((entry) => entry.sport))];
  select.replaceChildren(...sports.map((sport) => new Option(sportLabel(sport), sport)));
  select.value = view.sport ?? "";
  select.disabled = sports.length < 2;
}

function toggle(entry, on) {
  if (!on) view.slots.delete(entry.id);
  else if (view.slots.size < slotCount) {
    const used = new Set(view.slots.values());
    view.slots.set(entry.id, [1, 2, 3, 4, 5, 6].find((slot) => !used.has(slot)));
  }
  render();
}

function renderList() {
  const entries = view.entries.filter((entry) => entry.sport === view.sport);
  byId("compareEmpty").hidden = view.entries.length > 0;
  byId("compareList").replaceChildren(...entries.map((entry) => {
    const slot = view.slots.get(entry.id);
    const row = document.createElement("label");
    row.className = `compare-item${slot ? " is-selected" : ""}`;
    const checkbox = Object.assign(document.createElement("input"), { type: "checkbox", checked: Boolean(slot) });
    checkbox.disabled = !slot && view.slots.size >= slotCount;
    checkbox.addEventListener("change", () => toggle(entry, checkbox.checked));
    const swatch = Object.assign(document.createElement("span"), { className: "compare-swatch" });
    if (slot) swatch.style.background = `var(--compare-${slot})`;
    const text = document.createElement("span");
    text.className = "compare-item-text";
    text.append(
      Object.assign(document.createElement("strong"), { textContent: entry.name }),
      Object.assign(document.createElement("span"), {
        textContent: `${shortDate(entry.startMs)} · ${formatDuration(entry.summary.timerSeconds)} · ${displayNumber(entry.summary.distance / 1000, 2)} km`,
      }),
    );
    row.append(checkbox, swatch, text);
    return row;
  }));
  byId("compareLimit").hidden = view.slots.size < slotCount;
}

function renderControls() {
  for (const button of document.querySelectorAll("[data-compare-metric]")) {
    button.textContent = metricLabel(button.dataset.compareMetric, view.sport);
    button.setAttribute("aria-pressed", String(button.dataset.compareMetric === view.metric));
  }
  for (const button of document.querySelectorAll("[data-compare-axis]")) {
    button.setAttribute("aria-pressed", String(button.dataset.compareAxis === view.axis));
  }
}

function renderChart() {
  const chart = byId("compareChart");
  const picked = selected();
  byId("compareChartEmpty").hidden = picked.length > 0;
  chart.replaceChildren();
  view.layout = null;
  if (!picked.length) return;
  const lines = picked.map((entry) => ({
    entry, slot: view.slots.get(entry.id),
    points: downsample(series(entry, view.metric, { axis: view.axis, smoothSeconds: view.smoothSeconds })),
  })).filter((line) => line.points.length);
  if (!lines.length) {
    byId("compareChartEmpty").hidden = false;
    return;
  }
  const width = chart.clientWidth || 800;
  const height = 320;
  const margin = { top: 12, right: 16, bottom: 30, left: 64 };
  const all = lines.flatMap((line) => line.points);
  const maxX = Math.max(...all.map((point) => point.x)) || 1;
  // The middle 98 % of values set the scale, so a single spike does not flatten the rest.
  const ys = all.map((point) => point.y).sort((a, b) => a - b);
  const low = ys[Math.floor(ys.length * 0.01)];
  const high = ys[Math.ceil(ys.length * 0.99) - 1];
  const pad = (high - low) * 0.08 || 1;
  const inverted = invertedMetric(view.metric, view.sport);
  // Paces tick on whole 5, 10, 15 or 30 seconds.
  const yTicks = niceTicks(Math.max(0, low - pad), high + pad, 5, inverted ? [1, 2, 5, 10, 15, 20, 30, 60, 120] : null);
  const yLow = Math.min(yTicks[0], low - pad);
  const yHigh = Math.max(yTicks.at(-1), high + pad);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xFor = (x) => margin.left + (x / maxX) * plotWidth;
  const yFor = (y) => {
    const share = (Math.min(yHigh, Math.max(yLow, y)) - yLow) / (yHigh - yLow || 1);
    return margin.top + (inverted ? share : 1 - share) * plotHeight;
  };
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.setAttribute("height", String(height));

  for (const tick of yTicks) {
    chart.append(svg("line", { class: "compare-grid", x1: margin.left, x2: width - margin.right, y1: yFor(tick), y2: yFor(tick) }));
    const label = svg("text", { class: "compare-tick", x: margin.left - 8, y: yFor(tick) + 4, "text-anchor": "end" });
    label.textContent = view.metric === "pace" && view.sport !== "cycling" ? formatDuration(tick) : displayNumber(tick, view.metric === "pace" ? 1 : 0);
    chart.append(label);
  }
  for (const tick of xTicks(maxX)) {
    const label = svg("text", { class: "compare-tick", x: xFor(tick), y: height - 10, "text-anchor": "middle" });
    label.textContent = axisText(tick);
    chart.append(label);
  }
  chart.append(svg("line", { class: "compare-axis", x1: margin.left, x2: width - margin.right, y1: margin.top + plotHeight, y2: margin.top + plotHeight }));
  for (const line of lines) {
    const d = line.points.map((point, index) => `${index ? "L" : "M"}${xFor(point.x).toFixed(1)},${yFor(point.y).toFixed(1)}`).join("");
    chart.append(svg("path", { class: "compare-line", d, stroke: `var(--compare-${line.slot})` }));
  }
  const guide = svg("g", { class: "compare-hover" });
  chart.append(guide);
  view.layout = { lines, margin, plotWidth, plotHeight, maxX, xFor, yFor, guide };
  renderHover();
}

// Value of a line at x, from the nearest point not past it.
function valueAt(points, x) {
  let low = 0;
  let high = points.length - 1;
  if (x < points[0].x || x > points[high].x) return null;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (points[middle].x <= x) low = middle;
    else high = middle - 1;
  }
  return points[low].y;
}

function renderHover() {
  const tooltip = byId("compareTooltip");
  const layout = view.layout;
  if (!layout || view.hoverX == null) {
    layout?.guide.replaceChildren();
    tooltip.hidden = true;
    return;
  }
  const x = layout.xFor(view.hoverX);
  const rows = layout.lines.map((line) => ({ line, value: valueAt(line.points, view.hoverX) }));
  layout.guide.replaceChildren(
    svg("line", { class: "compare-crosshair", x1: x, x2: x, y1: layout.margin.top, y2: layout.margin.top + layout.plotHeight }),
    ...rows.filter((row) => row.value != null).map((row) => svg("circle", {
      class: "compare-dot", cx: x, cy: layout.yFor(row.value), r: 4, fill: `var(--compare-${row.line.slot})`,
    })),
  );
  tooltip.replaceChildren(
    Object.assign(document.createElement("strong"), { textContent: axisText(view.hoverX) }),
    ...rows.map((row) => {
      const item = document.createElement("span");
      const swatch = Object.assign(document.createElement("i"), { className: "compare-swatch" });
      swatch.style.background = `var(--compare-${row.line.slot})`;
      item.append(swatch, `${shortDate(row.line.entry.startMs)}  ${metricText(row.value, view.metric, view.sport)}`);
      return item;
    }),
  );
  tooltip.hidden = false;
  const chartBox = byId("compareChart").getBoundingClientRect();
  const scale = chartBox.width / (layout.margin.left + layout.plotWidth + layout.margin.right);
  const left = x * scale;
  tooltip.style.left = `${left > chartBox.width / 2 ? left - tooltip.offsetWidth - 12 : left + 12}px`;
}

function renderTable(id, rows, picked) {
  const head = document.createElement("tr");
  head.append(document.createElement("th"), ...picked.map((entry) => {
    const th = document.createElement("th");
    const swatch = Object.assign(document.createElement("i"), { className: "compare-swatch" });
    swatch.style.background = `var(--compare-${view.slots.get(entry.id)})`;
    th.append(swatch, shortDate(entry.startMs));
    th.title = entry.name;
    return th;
  }));
  byId(id).replaceChildren(head, ...rows.map(([label, cell]) => {
    const row = document.createElement("tr");
    row.append(Object.assign(document.createElement("th"), { textContent: label }), ...picked.map((entry) => Object.assign(document.createElement("td"), { textContent: cell(entry) })));
    return row;
  }));
}

function renderTables() {
  const picked = selected();
  byId("compareTables").hidden = !picked.length;
  if (!picked.length) return;
  const sport = view.sport;
  const unit = (value, suffix, digits = 0) => (value == null ? "—" : `${displayNumber(value, digits)} ${suffix}`);
  const cadence = sport === "running" ? "spm" : "rpm";
  renderTable("compareSummary", [
    [t("lapTime"), (entry) => formatDuration(entry.summary.timerSeconds)],
    [t("lapDistanceColumn"), (entry) => unit(entry.summary.distance / 1000, "km", 2)],
    [metricLabel("pace", sport), (entry) => metricText(paceFrom(entry.summary.timerSeconds > 0 ? entry.summary.distance / entry.summary.timerSeconds : null, sport), "pace", sport)],
    [t("compareAvgPower"), (entry) => unit(entry.summary.avgPower, "W")],
    [t("compareMaxPower"), (entry) => unit(entry.summary.maxPower, "W")],
    [t("compareAvgHeartRate"), (entry) => unit(entry.summary.avgHeartRate, "bpm")],
    [t("compareMaxHeartRate"), (entry) => unit(entry.summary.maxHeartRate, "bpm")],
    [t("compareAvgCadence"), (entry) => unit(entry.summary.avgCadence, cadence)],
    [t("compareCalories"), (entry) => unit(entry.summary.calories, "kcal")],
  ], picked);
  const distanceLabel = (meters) => (meters >= 1000 ? `${meters / 1000} km` : `${meters} m`);
  renderTable("compareBest", [
    ...(effortDistances[sport] ?? []).map((meters) => [t("compareBestTime", { distance: distanceLabel(meters) }), (entry) => {
      const seconds = bestTime(entry, meters);
      return seconds == null ? "—" : formatDuration(seconds);
    }]),
    ...powerDurations.map((seconds) => [t("compareBestPower", { duration: formatDuration(seconds) }), (entry) => unit(bestAverage(entry, "power", seconds), "W")]),
  ], picked);
}

function render() {
  if (byId("compareView").hidden) return;
  renderSports();
  renderList();
  renderControls();
  renderChart();
  renderTables();
}

export function rerenderCompare() {
  render();
}

function showCompare(on) {
  const views = ["setupView", "workspaceView"];
  if (on) {
    previousView = views.find((id) => !byId(id).hidden) ?? previousView;
    for (const id of views) byId(id).hidden = true;
  } else {
    byId(previousView).hidden = false;
  }
  byId("compareView").hidden = !on;
  for (const button of document.querySelectorAll("[data-app-view]")) {
    button.setAttribute("aria-pressed", String((button.dataset.appView === "compare") === on));
  }
  window.scrollTo({ top: 0 });
  if (on) refresh();
}

export function setupCompare({ onConverter }) {
  for (const button of document.querySelectorAll("[data-app-view]")) {
    button.addEventListener("click", () => {
      const toCompare = button.dataset.appView === "compare";
      if (toCompare === !byId("compareView").hidden) return;
      showCompare(toCompare);
      if (!toCompare) onConverter();
    });
  }
  byId("compareSport").addEventListener("change", (event) => {
    view.sport = event.target.value;
    view.slots.clear();
    render();
  });
  for (const button of document.querySelectorAll("[data-compare-metric]")) {
    button.addEventListener("click", () => {
      view.metric = button.dataset.compareMetric;
      render();
    });
  }
  for (const button of document.querySelectorAll("[data-compare-axis]")) {
    button.addEventListener("click", () => {
      view.axis = button.dataset.compareAxis;
      view.hoverX = null;
      render();
    });
  }
  byId("compareSmooth").addEventListener("change", (event) => {
    view.smoothSeconds = Number(event.target.value);
    render();
  });
  byId("compareLibraryButton").addEventListener("click", openLibrary);
  byId("libraryDialog").addEventListener("close", () => {
    if (!byId("compareView").hidden) refresh();
  });
  const chart = byId("compareChart");
  chart.addEventListener("pointermove", (event) => {
    const layout = view.layout;
    if (!layout) return;
    const box = chart.getBoundingClientRect();
    const scale = (layout.margin.left + layout.plotWidth + layout.margin.right) / box.width;
    const x = (event.clientX - box.left) * scale;
    view.hoverX = x < layout.margin.left || x > layout.margin.left + layout.plotWidth ? null : ((x - layout.margin.left) / layout.plotWidth) * layout.maxX;
    renderHover();
  });
  chart.addEventListener("pointerleave", () => {
    view.hoverX = null;
    renderHover();
  });
  new ResizeObserver(() => {
    if (!byId("compareView").hidden) renderChart();
  }).observe(chart);
}
