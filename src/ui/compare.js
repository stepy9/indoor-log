import { bestAverage, bestTime, downsample, effortDistances, inLengthRange, invertedMetric, rangesFor, trendDistances, trendIsTime, trendMetrics, trendValue, paceFrom, powerDurations, series, workoutKind, workoutKinds, sliceEntry, lapValue } from "../analysis.js";
import { listEntries } from "../library.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";
import { kindLabel, kindSelect, openLibrary } from "./library.js";

// Up to six activities at once, each keeping its colour slot while it stays selected.
const slotCount = 6;
const svgNs = "http://www.w3.org/2000/svg";

const view = {
  entries: [],
  // Selected entry id → colour slot 1–6.
  slots: new Map(),
  sport: null,
  search: "",
  length: "all",
  kind: "all",
  // "overlay" lays the selected activities over each other; "trend" follows every filtered one over time.
  mode: "overlay",
  trendMetric: "avgPower",
  metric: "power",
  axis: "distance",
  smoothSeconds: 10,
  hoverX: null,
  // The stretch of the x axis zoomed into by dragging over the chart, as [from, to]; null shows it all.
  zoom: null,
  // Where a drag over the chart started, in chart pixels.
  dragFrom: null,
  // A Shift-drag moving the zoomed stretch: where it started, in chart pixels, and the stretch at that moment.
  panFrom: null,
  // Where the longest selected activity ends on the x axis, so panning stops there.
  fullMaxX: 0,
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
function xTicks(low, high) {
  if (view.axis === "distance") return niceTicks(low, high, 6);
  const span = high - low;
  const step = [1, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600].find((seconds) => span / seconds <= 7) ?? 3600;
  const ticks = [];
  for (let tick = Math.ceil(low / step) * step; tick <= high; tick += step) ticks.push(tick);
  return ticks;
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

// Time ranges, then the sport's distance ranges; a choice the new options lack falls back to any length.
function renderLengths() {
  const select = byId("compareLength");
  const label = ([from, to], unit) => (from === 0 ? t("rangeUpTo", { to: `${displayNumber(to, 1)} ${unit}` })
    : to === Infinity ? t("rangeOver", { from: `${displayNumber(from, 1)} ${unit}` })
    : `${displayNumber(from, 1)}–${displayNumber(to, 1)} ${unit}`);
  const group = (by, key, unit) => {
    const optgroup = Object.assign(document.createElement("optgroup"), { label: t(key) });
    optgroup.append(...rangesFor(by, view.sport).map((range, index) => new Option(label(range, unit), `${by}:${index}`)));
    return optgroup;
  };
  select.replaceChildren(new Option(t("compareLengthAll"), "all"), group("time", "compareByTimeGroup", "min"), group("distance", "compareByDistanceGroup", "km"));
  select.value = view.length;
  if (select.value !== view.length) view.length = select.value = "all";
}

function renderKindFilter() {
  const select = byId("compareKind");
  select.replaceChildren(new Option(t("compareKindAll"), "all"), ...workoutKinds.map((kind) => new Option(kindLabel(kind, view.sport), kind)));
  select.value = view.kind;
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

// Name, length and kind narrow the list; selected activities stay listed so they can still be unticked.
function matches(entry) {
  const search = view.search.trim().toLocaleLowerCase();
  return (!search || entry.name.toLocaleLowerCase().includes(search))
    && inLengthRange(entry, view.length)
    && (view.kind === "all" || workoutKind(entry) === view.kind);
}


function renderList() {
  const entries = view.entries.filter((entry) => entry.sport === view.sport && (view.slots.has(entry.id) || matches(entry)));
  byId("compareEmpty").hidden = view.entries.length > 0;
  byId("compareNoMatch").hidden = !view.entries.length || entries.length > 0;
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
      // Every converted name starts with "Kinomap - "; the list leaves it out, the tooltip keeps it.
      Object.assign(document.createElement("strong"), { textContent: entry.name.replace(/^Kinomap - /, ""), title: entry.name }),
    );
    // Under the name: date, time and distance, with the workout type at the end of the line.
    const meta = Object.assign(document.createElement("span"), { className: "compare-item-meta" });
    meta.append(
      Object.assign(document.createElement("span"), {
        // Each value keeps together, so a narrow row wraps only between them.
        textContent: [shortDate(entry.startMs), formatDuration(entry.summary.timerSeconds), `${displayNumber(entry.summary.distance / 1000, 2)} km`]
          .map((part) => part.replaceAll(" ", " ")).join(" · "),
      }),
      kindSelect(entry, render, "kind-tag"),
    );
    text.append(meta);
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

// The points inside a zoomed stretch and the nearest one on each side, so the lines run to its edges.
function zoomed(points, zoom) {
  if (!zoom) return points;
  const first = points.findIndex((point) => point.x >= zoom[0]);
  if (first < 0) return [];
  let last = first;
  while (last + 1 < points.length && points[last + 1].x <= zoom[1]) last += 1;
  return points.slice(Math.max(0, first - 1), last + 2);
}

// Zooming stops at 20 m or 10 s, around the middle of what was dragged.
function widened([from, to]) {
  const shortest = view.axis === "distance" ? 20 : 10;
  if (to - from >= shortest) return [from, to];
  const middle = (from + to) / 2;
  const start = Math.max(0, middle - shortest / 2);
  return [start, start + shortest];
}

// Moves the zoomed stretch by the given amount on the x axis, keeping it within the activities.
function pan(by) {
  if (!view.zoom) return;
  const span = view.zoom[1] - view.zoom[0];
  const from = Math.min(Math.max(0, view.zoom[0] + by), Math.max(0, view.fullMaxX - span));
  view.zoom = [from, from + span];
  view.hoverX = null;
  renderZoomed();
}

function renderChart() {
  const chart = byId("compareChart");
  const picked = selected();
  byId("compareChartEmpty").hidden = picked.length > 0;
  chart.replaceChildren();
  view.layout = null;
  byId("compareZoomBar").hidden = true;
  byId("compareZoomHint").hidden = true;
  if (!picked.length) return;
  const zoom = view.zoom;
  const full = picked.map((entry) => ({ entry, points: series(entry, view.metric, { axis: view.axis, smoothSeconds: view.smoothSeconds }) }));
  view.fullMaxX = Math.max(0, ...full.map(({ points }) => points.at(-1)?.x ?? 0));
  const lines = full.map(({ entry, points }) => ({
    entry, slot: view.slots.get(entry.id),
    // Thinning comes after the zoom, so a zoomed stretch keeps its detail.
    points: downsample(zoomed(points, zoom)),
  })).filter((line) => line.points.length);
  byId("compareZoomBar").hidden = !zoom;
  byId("compareZoomHint").hidden = !lines.length;
  // The arrows move by half the zoomed stretch; their tooltips say how far.
  if (zoom) {
    const step = axisText((zoom[1] - zoom[0]) / 2);
    for (const [id, key] of [["compareZoomLeft", "zoomLeftBy"], ["compareZoomRight", "zoomRightBy"]]) {
      byId(id).title = t(key, { step });
      byId(id).setAttribute("aria-label", byId(id).title);
    }
  }
  if (!lines.length) {
    const empty = byId("compareChartEmpty");
    empty.textContent = t(zoom ? "zoomEmpty" : "compareChartEmpty");
    empty.hidden = false;
    return;
  }
  byId("compareChartEmpty").textContent = t("compareChartEmpty");
  const width = chart.clientWidth || 800;
  const height = 320;
  const margin = { top: 12, right: 16, bottom: 30, left: 64 };
  const all = lines.flatMap((line) => line.points);
  const minX = zoom ? zoom[0] : 0;
  const maxX = zoom ? zoom[1] : Math.max(...all.map((point) => point.x)) || 1;
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
  const xFor = (x) => margin.left + ((x - minX) / (maxX - minX)) * plotWidth;
  const yFor = (y) => {
    const share = (Math.min(yHigh, Math.max(yLow, y)) - yLow) / (yHigh - yLow || 1);
    return margin.top + (inverted ? share : 1 - share) * plotHeight;
  };
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.setAttribute("height", String(height));
  // Lines reaching past a zoomed stretch are cut at the edges of the plot.
  const clip = svg("clipPath", { id: "comparePlot" });
  clip.append(svg("rect", { x: margin.left, y: 0, width: plotWidth, height }));
  chart.append(clip);

  for (const tick of yTicks) {
    chart.append(svg("line", { class: "compare-grid", x1: margin.left, x2: width - margin.right, y1: yFor(tick), y2: yFor(tick) }));
    const label = svg("text", { class: "compare-tick", x: margin.left - 8, y: yFor(tick) + 4, "text-anchor": "end" });
    label.textContent = view.metric === "pace" && view.sport !== "cycling" ? formatDuration(tick) : displayNumber(tick, view.metric === "pace" ? 1 : 0);
    chart.append(label);
  }
  for (const tick of xTicks(minX, maxX)) {
    const label = svg("text", { class: "compare-tick", x: xFor(tick), y: height - 10, "text-anchor": "middle" });
    label.textContent = axisText(tick);
    chart.append(label);
  }
  chart.append(svg("line", { class: "compare-axis", x1: margin.left, x2: width - margin.right, y1: margin.top + plotHeight, y2: margin.top + plotHeight }));
  for (const line of lines) {
    const d = line.points.map((point, index) => `${index ? "L" : "M"}${xFor(point.x).toFixed(1)},${yFor(point.y).toFixed(1)}`).join("");
    chart.append(svg("path", { class: "compare-line", d, stroke: `var(--compare-${line.slot})`, "clip-path": "url(#comparePlot)" }));
  }
  const guide = svg("g", { class: "compare-hover" });
  chart.append(guide);
  view.layout = { lines, margin, plotWidth, plotHeight, minX, maxX, xFor, yFor, guide };
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
  if (view.layout?.trend) {
    renderTrendHover();
    return;
  }
  if (view.dragFrom != null) return;
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
    // The date alone keeps six columns narrow; the time and name are in the tooltip.
    th.append(swatch, dayDate(entry.startMs));
    th.title = `${entry.name} · ${shortDate(entry.startMs)}`;
    return th;
  }));
  // A row none of the activities has a value for stays out.
  const filled = rows.map(([label, cell]) => [label, picked.map(cell)]).filter(([, values]) => values.some((value) => value !== "—"));
  byId(id).replaceChildren(head, ...filled.map(([label, values]) => {
    const row = document.createElement("tr");
    row.append(Object.assign(document.createElement("th"), { textContent: label }), ...values.map((text) => Object.assign(document.createElement("td"), { textContent: text })));
    return row;
  }));
}

// Lap by lap for the activities with laps: the metric the chart shows, under the lap number and the type of the first.
function renderLapTable(picked) {
  const withLaps = picked.filter((entry) => entry.laps?.length >= 2);
  const card = byId("compareLapsCard");
  card.hidden = !withLaps.length;
  if (!withLaps.length) return;
  byId("compareLapsTitle").textContent = t("compareLaps", { metric: metricLabel(view.metric, view.sport) });
  const count = Math.max(...withLaps.map((entry) => entry.laps.length));
  const intensityKey = { warmup: "intensityWarmup", active: "intensityActive", recovery: "intensityRecovery", rest: "intensityRest", cooldown: "intensityCooldown" };
  const rows = Array.from({ length: count }, (_, index) => {
    const lap = withLaps.find((entry) => entry.laps[index])?.laps[index];
    const type = intensityKey[lap?.intensity];
    return [`${index + 1}${type ? ` · ${t(type)}` : ""}`, (entry) => {
      const value = entry.laps[index] ? lapValue(entry.laps[index], view.metric, view.sport) : null;
      return metricText(value, view.metric, view.sport);
    }];
  });
  renderTable("compareLapsTable", rows, withLaps);
}

function renderTables() {
  const all = selected();
  byId("compareTables").hidden = !all.length;
  if (!all.length) return;
  const sport = view.sport;
  // A zoomed chart narrows the summary and best efforts to its stretch; laps stay whole.
  const zoom = view.zoom;
  const picked = zoom ? all.map((entry) => sliceEntry(entry, view.axis, zoom[0], zoom[1])) : all;
  const rangeNote = byId("compareRangeNote");
  rangeNote.hidden = !zoom;
  if (zoom) rangeNote.textContent = t("compareRange", { from: axisText(zoom[0]), to: axisText(zoom[1]) });
  renderLapTable(all);
  const unit = (value, suffix, digits = 0) => (!Number.isFinite(value) ? "—" : `${displayNumber(value, digits)} ${suffix}`);
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
  const distanceLabel = (meters) => (meters >= 1000 ? `${displayNumber(meters / 1000, 1)} km` : `${meters} m`);
  renderTable("compareBest", [
    ...(effortDistances[sport] ?? []).map((meters) => [t("compareBestTime", { distance: distanceLabel(meters) }), (entry) => {
      const seconds = bestTime(entry, meters);
      return seconds == null ? "—" : formatDuration(seconds);
    }]),
    ...powerDurations.map((seconds) => [t("compareBestPower", { duration: formatDuration(seconds) }), (entry) => unit(bestAverage(entry, "power", seconds), "W")]),
  ], picked);
}


// Trend: one point per activity that passes the filters, oldest to newest.
const trendEntries = () => view.entries.filter((entry) => entry.sport === view.sport && matches(entry)).sort((a, b) => a.startMs - b.startMs);

function trendLabel(metric, sport) {
  const { short, long } = trendDistances(sport);
  const distance = (meters) => (meters >= 1000 ? `${meters / 1000} km` : `${meters} m`);
  if (metric === "pace") return metricLabel("pace", sport);
  if (metric === "bestShort") return t("compareBestTime", { distance: distance(short) });
  if (metric === "bestLong") return t("compareBestTime", { distance: distance(long) });
  if (metric === "bestPower") return t("compareBestPower", { duration: formatDuration(300) });
  return t({ avgPower: "compareAvgPower", avgHeartRate: "compareAvgHeartRate", efficiency: "trendEfficiency" }[metric]);
}

function trendText(value, metric, sport) {
  if (!Number.isFinite(value)) return "—";
  if (metric === "pace") return metricText(value, "pace", sport);
  if (trendIsTime(metric, sport)) return formatDuration(value);
  if (metric === "efficiency") return `${displayNumber(value, 2)} W/bpm`;
  return `${displayNumber(value)} ${metric === "avgHeartRate" ? "bpm" : "W"}`;
}

const dayDate = (epochMs) => new Intl.DateTimeFormat(locale(), { timeZone: zone, day: "numeric", month: "numeric", year: "2-digit" }).format(new Date(epochMs));

function renderTrendControls() {
  const select = byId("trendMetric");
  select.replaceChildren(...trendMetrics.map((metric) => new Option(trendLabel(metric, view.sport), metric)));
  select.value = view.trendMetric;
}

function renderTrendChart() {
  const chart = byId("compareChart");
  const metric = view.trendMetric;
  const points = trendEntries().map((entry) => ({ entry, x: entry.startMs, y: trendValue(entry, metric) })).filter((point) => Number.isFinite(point.y));
  chart.replaceChildren();
  view.layout = null;
  const empty = byId("compareChartEmpty");
  empty.hidden = points.length > 0;
  empty.textContent = t("trendEmpty");
  byId("trendNote").textContent = t("trendCount", { count: points.length });
  if (!points.length) return;
  const width = chart.clientWidth || 800;
  const height = 320;
  const margin = { top: 16, right: 24, bottom: 30, left: 72 };
  const day = 86_400_000;
  const minX = points[0].x - day;
  const maxX = points.at(-1).x + day;
  const ys = points.map((point) => point.y);
  const low = Math.min(...ys);
  const high = Math.max(...ys);
  const pad = (high - low) * 0.15 || Math.abs(high) * 0.05 || 1;
  const isTime = trendIsTime(metric, view.sport);
  const yTicks = niceTicks(Math.max(0, low - pad), high + pad, 5, isTime ? [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600] : metric === "efficiency" ? [0.05, 0.1, 0.2, 0.25, 0.5, 1] : null);
  const yLow = Math.min(yTicks[0], low - pad);
  const yHigh = Math.max(yTicks.at(-1), high + pad);
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const xFor = (x) => margin.left + ((x - minX) / (maxX - minX)) * plotWidth;
  const yFor = (y) => {
    const share = (y - yLow) / (yHigh - yLow || 1);
    return margin.top + (isTime ? share : 1 - share) * plotHeight;
  };
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.setAttribute("height", String(height));
  for (const tick of yTicks) {
    chart.append(svg("line", { class: "compare-grid", x1: margin.left, x2: width - margin.right, y1: yFor(tick), y2: yFor(tick) }));
    const label = svg("text", { class: "compare-tick", x: margin.left - 8, y: yFor(tick) + 4, "text-anchor": "end" });
    label.textContent = isTime ? formatDuration(tick) : displayNumber(tick, metric === "efficiency" ? 2 : 0);
    chart.append(label);
  }
  // Date ticks spread evenly; a short span shows fewer of them.
  const tickCount = Math.min(6, Math.max(2, Math.round((maxX - minX) / day)));
  for (let index = 0; index < tickCount; index += 1) {
    const x = minX + ((maxX - minX) * (index + 0.5)) / tickCount;
    const label = svg("text", { class: "compare-tick", x: xFor(x), y: height - 10, "text-anchor": "middle" });
    label.textContent = dayDate(x);
    chart.append(label);
  }
  chart.append(svg("line", { class: "compare-axis", x1: margin.left, x2: width - margin.right, y1: margin.top + plotHeight, y2: margin.top + plotHeight }));
  const d = points.map((point, index) => `${index ? "L" : "M"}${xFor(point.x).toFixed(1)},${yFor(point.y).toFixed(1)}`).join("");
  chart.append(svg("path", { class: "compare-line trend-line", d, stroke: "var(--compare-1)" }));
  for (const point of points) chart.append(svg("circle", { class: "compare-dot", cx: xFor(point.x), cy: yFor(point.y), r: 4.5, fill: "var(--compare-1)" }));
  const guide = svg("g", { class: "compare-hover" });
  chart.append(guide);
  view.layout = { trend: true, points, margin, plotWidth, plotHeight, minX, maxX, xFor, yFor, guide };
  renderHover();
}

// The activity nearest the pointer, marked with a ring and described in the tooltip.
function renderTrendHover() {
  const tooltip = byId("compareTooltip");
  const layout = view.layout;
  const point = view.hoverX == null ? null : layout.points.reduce((best, candidate) => (Math.abs(candidate.x - view.hoverX) < Math.abs(best.x - view.hoverX) ? candidate : best));
  if (!point) {
    layout.guide.replaceChildren();
    tooltip.hidden = true;
    return;
  }
  const x = layout.xFor(point.x);
  layout.guide.replaceChildren(svg("circle", { class: "trend-ring", cx: x, cy: layout.yFor(point.y), r: 8 }));
  tooltip.replaceChildren(
    Object.assign(document.createElement("strong"), { textContent: trendText(point.y, view.trendMetric, view.sport) }),
    Object.assign(document.createElement("span"), { textContent: shortDate(point.entry.startMs) }),
    Object.assign(document.createElement("span"), { textContent: point.entry.name }),
  );
  tooltip.hidden = false;
  const chartBox = byId("compareChart").getBoundingClientRect();
  const left = x * (chartBox.width / (layout.margin.left + layout.plotWidth + layout.margin.right));
  tooltip.style.left = `${left > chartBox.width / 2 ? left - tooltip.offsetWidth - 12 : left + 12}px`;
}

// Every activity in the trend, newest first, with the change against the one before it.
function renderTrendTable() {
  const entries = trendEntries();
  const metric = view.trendMetric;
  const sport = view.sport;
  const isTime = trendIsTime(metric, sport);
  const head = document.createElement("tr");
  head.append(...[t("libraryDate"), t("libraryName"), t("lapTime"), t("lapDistanceColumn"), trendLabel(metric, sport), t("trendChange")]
    .map((title) => Object.assign(document.createElement("th"), { textContent: title })));
  let previous = null;
  const rows = entries.map((entry) => {
    const value = trendValue(entry, metric);
    let change = "";
    let tone = "";
    if (Number.isFinite(value) && Number.isFinite(previous)) {
      const delta = value - previous;
      const better = metric === "avgHeartRate" ? null : isTime ? delta < 0 : delta > 0;
      change = `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${isTime ? formatDuration(Math.abs(delta)) : displayNumber(Math.abs(delta), metric === "efficiency" ? 2 : 0)}`;
      tone = delta === 0 || better == null ? "" : better ? "is-better" : "is-worse";
    }
    if (Number.isFinite(value)) previous = value;
    const row = document.createElement("tr");
    const cells = [shortDate(entry.startMs), entry.name, formatDuration(entry.summary.timerSeconds), `${displayNumber(entry.summary.distance / 1000, 2)} km`, trendText(value, metric, sport), change];
    row.append(...cells.map((text, index) => Object.assign(document.createElement("td"), { textContent: text, className: index === 5 ? tone : "" })));
    return row;
  }).reverse();
  byId("trendTable").replaceChildren(head, ...rows);
  byId("trendTableCard").hidden = !entries.length;
}

function renderMode() {
  const trend = view.mode === "trend";
  for (const button of document.querySelectorAll("[data-compare-mode]")) button.setAttribute("aria-pressed", String((button.dataset.compareMode === "trend") === trend));
  byId("overlayControls").hidden = trend;
  // Zooming belongs to the overlay; the trend shows every workout.
  if (trend) byId("compareZoomBar").hidden = byId("compareZoomHint").hidden = true;
  byId("trendControls").hidden = !trend;
  byId("compareList").classList.toggle("is-trend", trend);
  byId("compareChartEmpty").textContent = t(trend ? "trendEmpty" : "compareChartEmpty");
}

// A new zoom redraws the chart and the tables under it, which follow the zoomed stretch.
function renderZoomed() {
  renderChart();
  renderTables();
}

function drawChart() {
  if (view.mode === "trend") renderTrendChart();
  else renderChart();
}

function render() {
  if (byId("compareView").hidden) return;
  renderSports();
  renderLengths();
  renderKindFilter();
  renderList();
  renderMode();
  if (view.mode === "trend") {
    renderTrendControls();
    renderTrendChart();
    renderTrendTable();
    byId("compareTables").hidden = true;
  } else {
    renderControls();
    renderChart();
    renderTables();
    byId("trendTableCard").hidden = true;
  }
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
  // The comparison may use a wider window than the converter, so six activities fit side by side.
  document.body.classList.toggle("is-comparing", on);
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
  for (const button of document.querySelectorAll("[data-compare-mode]")) {
    button.addEventListener("click", () => {
      view.mode = button.dataset.compareMode;
      view.hoverX = null;
      render();
    });
  }
  byId("trendMetric").addEventListener("change", (event) => {
    view.trendMetric = event.target.value;
    view.hoverX = null;
    render();
  });
  // The trend follows the filters, so they redraw it; the overlay only narrows the list.
  const filtered = () => (view.mode === "trend" ? render() : renderList());
  byId("compareSearch").addEventListener("input", (event) => {
    view.search = event.target.value;
    filtered();
  });
  for (const [id, key] of [["compareLength", "length"], ["compareKind", "kind"]]) {
    byId(id).addEventListener("change", (event) => {
      view[key] = event.target.value;
      filtered();
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
      view.zoom = null;
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
  // Pointer position in chart pixels, kept inside the plot.
  const plotX = (event) => {
    const layout = view.layout;
    const box = chart.getBoundingClientRect();
    const x = (event.clientX - box.left) * ((layout.margin.left + layout.plotWidth + layout.margin.right) / box.width);
    return Math.min(layout.margin.left + layout.plotWidth, Math.max(layout.margin.left, x));
  };
  const valueAtPixel = (x) => {
    const layout = view.layout;
    return layout.minX + ((x - layout.margin.left) / layout.plotWidth) * (layout.maxX - layout.minX);
  };
  // Dragging across the overlay chart marks a stretch to zoom into.
  chart.addEventListener("pointerdown", (event) => {
    if (!view.layout || view.layout.trend || event.button !== 0) return;
    // Shift-dragging a zoomed chart moves the stretch instead of zooming further.
    if (event.shiftKey && view.zoom) {
      view.panFrom = { x: plotX(event), zoom: view.zoom };
      chart.setPointerCapture(event.pointerId);
      chart.classList.add("is-panning");
      byId("compareTooltip").hidden = true;
      return;
    }
    view.dragFrom = plotX(event);
    chart.setPointerCapture(event.pointerId);
    byId("compareTooltip").hidden = true;
  });
  chart.addEventListener("pointerup", (event) => {
    if (view.panFrom) {
      view.panFrom = null;
      chart.classList.remove("is-panning");
      return;
    }
    if (view.dragFrom == null) return;
    const [from, to] = [view.dragFrom, plotX(event)].sort((a, b) => a - b);
    view.dragFrom = null;
    // A click or a tiny drag is not a zoom.
    if (to - from >= 8) {
      view.zoom = widened([valueAtPixel(from), valueAtPixel(to)]);
      view.hoverX = null;
      renderZoomed();
    } else renderHover();
  });
  chart.addEventListener("dblclick", () => {
    if (!view.zoom) return;
    view.zoom = null;
    renderZoomed();
  });
  chart.addEventListener("pointermove", (event) => {
    const layout = view.layout;
    if (!layout) return;
    if (view.panFrom) {
      const { x, zoom } = view.panFrom;
      const perPixel = (zoom[1] - zoom[0]) / layout.plotWidth;
      view.zoom = zoom;
      pan((x - plotX(event)) * perPixel);
      return;
    }
    if (view.dragFrom != null) {
      const x = plotX(event);
      layout.guide.replaceChildren(svg("rect", {
        class: "compare-brush", x: Math.min(x, view.dragFrom), y: layout.margin.top, width: Math.abs(x - view.dragFrom), height: layout.plotHeight,
      }));
      return;
    }
    const box = chart.getBoundingClientRect();
    const scale = (layout.margin.left + layout.plotWidth + layout.margin.right) / box.width;
    const x = (event.clientX - box.left) * scale;
    view.hoverX = x < layout.margin.left || x > layout.margin.left + layout.plotWidth ? null : layout.minX + ((x - layout.margin.left) / layout.plotWidth) * (layout.maxX - layout.minX);
    renderHover();
  });
  byId("compareZoomLeft").addEventListener("click", () => view.zoom && pan(-(view.zoom[1] - view.zoom[0]) / 2));
  byId("compareZoomRight").addEventListener("click", () => view.zoom && pan((view.zoom[1] - view.zoom[0]) / 2));
  byId("compareZoomReset").addEventListener("click", () => {
    view.zoom = null;
    renderZoomed();
  });
  chart.addEventListener("pointerleave", () => {
    view.hoverX = null;
    renderHover();
  });
  new ResizeObserver(() => {
    if (!byId("compareView").hidden) drawChart();
  }).observe(chart);
}
