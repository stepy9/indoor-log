import { activityLoad, curveDurations, decoupling, fatigueDays, fitnessDays, forSport, formState, heartRateZones, loadHistory, powerCurve, powerZones, timeInZones } from "../fitness.js";
import { openSettings, setByHand, settingsFor } from "./settings.js";
import { addDays, dayKey } from "../diary.js";
import { listEntries } from "../library.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";

// The Analysis tab: training load with fitness, fatigue and form, time in zones, the power curve and aerobic decoupling.

const svgNs = "http://www.w3.org/2000/svg";
const sports = ["rowing", "cycling", "running"];
const ranges = { six: 42, quarter: 91, year: 365, all: Infinity };

const remembered = () => savedDefaults().fitness ?? {};

const view = {
  entries: [],
  sport: remembered().sport ?? "all",
  range: Object.hasOwn(ranges, remembered().range) ? remembered().range : "quarter",
  layout: null,
};

let openActivity = () => {};

function node(tag, attributes = {}, text = "") {
  const element = tag === "svg" || ["line", "path", "rect", "text", "g", "circle", "title"].includes(tag)
    ? document.createElementNS(svgNs, tag) : document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text) element.textContent = text;
  return element;
}

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const dayText = (key, options = { day: "numeric", month: "numeric", year: "numeric" }) => new Intl.DateTimeFormat(locale(), { timeZone: "UTC", ...options }).format(new Date(`${key}T12:00:00Z`));
const today = () => dayKey(Date.now(), zone);

const ofSport = (entries) => (view.sport === "all" ? entries : entries.filter((entry) => entry.sport === view.sport));

function inRange(entries, offset = 0) {
  const days = ranges[view.range];
  if (!Number.isFinite(days)) return offset ? [] : entries;
  const to = addDays(today(), 1 - offset * days);
  const from = addDays(to, -days);
  return entries.filter((entry) => {
    const day = dayKey(entry.startMs, zone);
    return day >= from && day < to;
  });
}

function save(patch) {
  saveDefaults({ fitness: { ...remembered(), ...patch } });
}

function tile(label, value, note = "", className = "") {
  const element = node("div", { class: `diary-tile ${className}` });
  element.append(node("span", { class: "diary-tile-label" }, label), node("span", { class: "diary-tile-value" }, value));
  if (note) element.append(node("span", { class: "diary-tile-change" }, note));
  return element;
}

function renderTiles(history, settings) {
  const last = history.at(-1);
  const week = history.slice(-7).reduce((sum, day) => sum + day.load, 0);
  const before = history.at(-8);
  const change = (now, then) => (then ? `${now - then >= 0 ? "+" : ""}${displayNumber(now - then)} ${t("fitnessVsWeek")}` : "");
  const tiles = last ? [
    tile(t("fitnessFitness"), displayNumber(last.fitness), change(last.fitness, before?.fitness), "is-fitness"),
    tile(t("fitnessFatigue"), displayNumber(last.fatigue), change(last.fatigue, before?.fatigue), "is-fatigue"),
    tile(t("fitnessForm"), `${last.fitness - last.fatigue >= 0 ? "+" : ""}${displayNumber(last.fitness - last.fatigue)}`, t(`fitnessState_${formState(last.fitness - last.fatigue)}`), "is-form"),
    tile(t("fitnessWeekLoad"), displayNumber(week)),
  ] : [];
  const shownSports = view.sport === "all" ? sports.filter((sport) => view.entries.some((entry) => entry.sport === sport)) : [view.sport];
  for (const sport of shownSports) {
    const ftp = settings.sports[sport].ftp;
    if (ftp) tiles.push(tile(`FTP · ${sportLabel(sport)}`, `${displayNumber(ftp)} W`, setByHand(sport, "ftp") ? t("fitnessSetByHand") : t("fitnessEstimated")));
  }
  byId("fitnessTiles").replaceChildren(...tiles);
}

// Fitness, fatigue and form over the range, with each day's load as faint bars behind.
function renderLoadChart(history) {
  const chart = byId("fitnessLoadChart");
  const days = Number.isFinite(ranges[view.range]) ? history.slice(-ranges[view.range]) : history;
  byId("fitnessLoadEmpty").hidden = days.length > 0;
  chart.hidden = !days.length;
  view.layout = null;
  if (!days.length) return;
  const width = Math.max(320, Math.round(chart.parentElement.getBoundingClientRect().width) || 1000);
  const height = 300;
  const margin = { left: 44, right: 12, top: 14, bottom: 26 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = days.flatMap((day) => [day.fitness, day.fatigue, day.form, day.load]);
  const niceStep = (span) => [5, 10, 20, 25, 50, 100, 200].find((step) => span / step <= 6) ?? 500;
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(10, ...values);
  const step = niceStep(rawMax - rawMin);
  const minY = Math.floor(rawMin / step) * step;
  const maxY = Math.ceil(rawMax / step) * step;
  const xFor = (index) => margin.left + (days.length > 1 ? (index / (days.length - 1)) * plotWidth : plotWidth / 2);
  const yFor = (value) => margin.top + ((maxY - value) / (maxY - minY)) * plotHeight;
  const children = [];
  for (let value = minY; value <= maxY + 1e-9; value += step) {
    children.push(node("line", { x1: margin.left, x2: width - margin.right, y1: yFor(value), y2: yFor(value), class: value === 0 ? "diary-axis" : "diary-grid" }));
    children.push(node("text", { x: margin.left - 8, y: yFor(value) + 4, class: "diary-axis-label" }, displayNumber(value)));
  }
  // The form's zones: fresh above +15 and overreaching below −30, shaded where they fall in the scale.
  const band = (from, to, className) => {
    const top = yFor(Math.min(maxY, to));
    const bottom = yFor(Math.max(minY, from));
    if (bottom > top) children.push(node("rect", { x: margin.left, y: top, width: plotWidth, height: bottom - top, class: className }));
  };
  band(15, maxY, "fitness-band-fresh");
  band(minY, -30, "fitness-band-over");
  const barWidth = Math.max(1, Math.min(12, (plotWidth / days.length) * 0.7));
  days.forEach((day, index) => {
    if (day.load > 0) children.push(node("rect", { x: xFor(index) - barWidth / 2, y: yFor(day.load), width: barWidth, height: yFor(0) - yFor(day.load), class: "fitness-load-bar" }));
  });
  const line = (field, className) => node("path", { class: `fitness-line ${className}`, d: days.map((day, index) => `${index ? "L" : "M"}${xFor(index).toFixed(1)},${yFor(day[field]).toFixed(1)}`).join("") });
  children.push(line("form", "is-form"), line("fatigue", "is-fatigue"), line("fitness", "is-fitness"));
  // Month ticks along the bottom, or weeks over a short range.
  const tickEvery = days.length > 120 ? "month" : "week";
  // Labels at least 48 px apart, so a narrow chart skips some.
  let lastTick = -Infinity;
  days.forEach((day, index) => {
    const isTick = tickEvery === "month" ? day.day.endsWith("-01") : new Date(`${day.day}T12:00:00Z`).getUTCDay() === 1;
    if (!isTick || xFor(index) - lastTick < 48) return;
    lastTick = xFor(index);
    const label = tickEvery === "month" ? dayText(day.day, { month: "short", ...(day.day.slice(5, 7) === "01" ? { year: "numeric" } : {}) }) : dayText(day.day, { day: "numeric", month: "numeric" });
    children.push(node("text", { x: xFor(index), y: height - 8, class: "diary-tick" }, label));
  });
  const guide = node("g");
  children.push(guide);
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.style.height = `${height}px`;
  chart.replaceChildren(...children);
  view.layout = { days, xFor, yFor, margin, plotWidth, plotHeight, guide, width };
}

function showLoadTooltip(event) {
  const layout = view.layout;
  const tooltip = byId("fitnessTooltip");
  if (!layout) return;
  const box = byId("fitnessLoadChart").getBoundingClientRect();
  const x = ((event.clientX - box.left) / box.width) * layout.width;
  const index = Math.round(((x - layout.margin.left) / layout.plotWidth) * (layout.days.length - 1));
  const day = layout.days[Math.min(layout.days.length - 1, Math.max(0, index))];
  if (!day) return;
  const at = layout.xFor(layout.days.indexOf(day));
  layout.guide.replaceChildren(node("line", { x1: at, x2: at, y1: layout.margin.top, y2: layout.margin.top + layout.plotHeight, class: "fitness-guide" }));
  const row = (label, value, className) => {
    const element = node("div", { class: "diary-tooltip-row" });
    element.append(node("span", { class: `fitness-swatch ${className}` }), node("span", {}, label), node("strong", {}, value));
    return element;
  };
  const form = day.fitness - day.fatigue;
  tooltip.replaceChildren(
    node("div", { class: "diary-tooltip-when" }, dayText(day.day, { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })),
    row(t("fitnessLoad"), displayNumber(day.load), "is-load"),
    row(t("fitnessFitness"), displayNumber(day.fitness), "is-fitness"),
    row(t("fitnessFatigue"), displayNumber(day.fatigue), "is-fatigue"),
    row(t("fitnessFormNext"), `${form >= 0 ? "+" : ""}${displayNumber(form)}`, "is-form"),
  );
  tooltip.hidden = false;
  const card = tooltip.offsetParent.getBoundingClientRect();
  const left = (at / layout.width) * box.width + box.left - card.left;
  const right = left + 14;
  tooltip.style.left = `${Math.max(8, right + tooltip.offsetWidth > card.width - 8 ? left - tooltip.offsetWidth - 14 : right)}px`;
  tooltip.style.top = `${box.top - card.top + 12}px`;
}

function hideLoadTooltip() {
  byId("fitnessTooltip").hidden = true;
  view.layout?.guide.replaceChildren();
}

// Heart rate and power zones one below the other, each with its note when the threshold or the data is missing.
function renderZones(entries, settings) {
  byId("fitnessZones").replaceChildren(...["heartRate", "power"].map((by) => zoneGroup(entries, settings, by)));
}

function zoneGroup(entries, settings, by) {
  const group = node("div", { class: "fitness-zone-group" });
  group.append(node("h4", { class: "fitness-zone-title" }, t(by === "power" ? "settingsPowerZones" : "settingsHeartRateZones")));
  // One sport shows its own bounds; several show the defaults as a guide.
  const own = view.sport === "all" ? null : forSport(settings, view.sport);
  const bounds = own ? own[by === "power" ? "powerZones" : "heartRateZones"] : by === "power" ? powerZones : heartRateZones;
  const totals = timeInZones(entries, by, settings);
  const sum = totals.reduce((total, value) => total + value, 0);
  const field = by === "power" ? "ftp" : "maxHeartRate";
  const missing = view.sport === "all" ? !sports.some((sport) => settings.sports[sport][field]) : !settings.sports[view.sport][field];
  const note = missing ? t(by === "power" ? "fitnessNeedFtp" : "fitnessNeedMaxHr") : !sum ? t("fitnessNoData") : "";
  if (note) {
    group.append(node("p", { class: "field-note" }, note));
    return group;
  }
  const highest = Math.max(...totals);
  group.append(...totals.map((seconds, index) => {
    const from = Math.round(bounds[index] * 100);
    const to = bounds[index + 1] ? Math.round(bounds[index + 1] * 100) : null;
    const reference = by === "power" ? "FTP" : own?.heartRateBasis === "reserve" ? "HRR" : "HRmax";
    const range = to ? (from ? `${from}–${to} %` : `< ${to} %`) : `> ${from} %`;
    const row = node("div", { class: "fitness-zone" });
    const bar = node("div", { class: "fitness-zone-track" });
    const fill = node("div", { class: "fitness-zone-fill" });
    fill.style.width = `${(seconds / highest) * 100}%`;
    fill.style.background = `var(--zone-${index + 1})`;
    bar.append(fill);
    row.append(
      node("span", { class: "fitness-zone-name" }, `Z${index + 1}`),
      node("span", { class: "fitness-zone-range" }, `${range} ${reference}`),
      bar,
      node("span", { class: "fitness-zone-time" }, formatDuration(seconds)),
      node("span", { class: "fitness-zone-share" }, `${displayNumber((seconds / sum) * 100)} %`),
    );
    return row;
  }));
  return group;
}

const durationText = (seconds) => (seconds < 60 ? `${seconds} s` : seconds < 3600 ? `${seconds / 60} min` : `${seconds / 3600} h`);

// The best power for each duration on a log scale, the range before as a dashed line.
function renderCurve(current, previous) {
  const chart = byId("fitnessCurve");
  const curve = powerCurve(current);
  const before = Number.isFinite(ranges[view.range]) ? powerCurve(previous) : [];
  const has = curve.some((point) => point.value != null);
  byId("fitnessCurveEmpty").hidden = has;
  chart.hidden = !has;
  byId("fitnessCurveLegend").hidden = !has || !before.some((point) => point.value != null);
  renderCurveTable(curve, before);
  if (!has) return;
  const width = Math.max(300, Math.round(chart.parentElement.getBoundingClientRect().width) || 600);
  const height = 260;
  const margin = { left: 48, right: 14, top: 14, bottom: 26 };
  const values = [...curve, ...before].map((point) => point.value).filter(Number.isFinite);
  const step = [10, 20, 25, 50, 100, 200].find((size) => (Math.max(...values) - Math.min(...values)) / size <= 5) ?? 250;
  const minY = Math.max(0, Math.floor(Math.min(...values) / step) * step - step);
  const maxY = Math.ceil(Math.max(...values) / step) * step;
  const logMin = Math.log(curveDurations[0]);
  const logMax = Math.log(curveDurations.at(-1));
  const xFor = (duration) => margin.left + ((Math.log(duration) - logMin) / (logMax - logMin)) * (width - margin.left - margin.right);
  const yFor = (value) => margin.top + ((maxY - value) / (maxY - minY)) * (height - margin.top - margin.bottom);
  const children = [];
  for (let value = minY; value <= maxY + 1e-9; value += step) {
    children.push(node("line", { x1: margin.left, x2: width - margin.right, y1: yFor(value), y2: yFor(value), class: value === minY ? "diary-axis" : "diary-grid" }));
    children.push(node("text", { x: margin.left - 8, y: yFor(value) + 4, class: "diary-axis-label" }, `${displayNumber(value)}`));
  }
  // Labels at least 44 px apart, the hour always shown: the log scale crowds the long durations.
  let lastTick = Infinity;
  for (const duration of [...curveDurations].reverse()) {
    if (lastTick - xFor(duration) < 44) continue;
    lastTick = xFor(duration);
    children.push(node("text", { x: lastTick, y: height - 8, class: "diary-tick" }, durationText(duration)));
  }
  const path = (points) => points.filter((point) => point.value != null).map((point, index) => `${index ? "L" : "M"}${xFor(point.duration).toFixed(1)},${yFor(point.value).toFixed(1)}`).join("");
  if (before.some((point) => point.value != null)) children.push(node("path", { class: "fitness-line is-previous", d: path(before) }));
  children.push(node("path", { class: "fitness-line is-curve", d: path(curve) }));
  for (const point of curve) {
    if (point.value == null) continue;
    const dot = node("circle", { cx: xFor(point.duration), cy: yFor(point.value), r: 4.5, class: "fitness-curve-dot" });
    const title = node("title", {}, `${durationText(point.duration)}: ${point.value} W · ${point.entry.name ?? ""} ${dayText(dayKey(point.entry.startMs, zone))}`);
    dot.append(title);
    dot.addEventListener("click", () => openActivity(point.entry));
    children.push(dot);
  }
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.style.height = `${height}px`;
  chart.replaceChildren(...children);
}

function renderCurveTable(curve, before) {
  const table = byId("fitnessCurveTable");
  const shown = curve.filter((point) => point.value != null);
  table.hidden = !shown.length;
  const head = node("tr");
  const hasBefore = before.some((point) => point.value != null);
  head.append(...[t("fitnessDuration"), t("fitnessBestPower"), ...(hasBefore ? [t("fitnessPrevious"), t("trendChange")] : []), t("fitnessFrom")].map((label) => node("th", {}, label)));
  const rows = shown.map((point) => {
    const row = node("tr");
    const old = before.find((item) => item.duration === point.duration)?.value;
    const change = old ? ((point.value - old) / old) * 100 : null;
    const changeCell = node("td", { class: change > 0 ? "is-better" : change < 0 ? "is-worse" : "" }, change == null ? "—" : `${change >= 0 ? "+" : ""}${displayNumber(change, 1)} %`);
    const link = node("button", { type: "button", class: "link-button" }, `${point.entry.name ?? ""} · ${dayText(dayKey(point.entry.startMs, zone))}`);
    link.addEventListener("click", () => openActivity(point.entry));
    const from = node("td");
    from.append(link);
    row.append(node("td", {}, durationText(point.duration)), node("td", {}, `${point.value} W`), ...(hasBefore ? [node("td", {}, old ? `${old} W` : "—"), changeCell] : []), from);
    return row;
  });
  table.replaceChildren(node("thead"), node("tbody"));
  table.tHead.append(head);
  table.tBodies[0].append(...rows);
}

function renderDecoupling(entries, settings) {
  const table = byId("fitnessDecoupling");
  const rows = entries.map((entry) => ({ entry, result: decoupling(entry), load: activityLoad(entry, settings) })).filter((item) => item.result);
  byId("fitnessDecouplingEmpty").hidden = rows.length > 0;
  table.hidden = !rows.length;
  const head = node("tr");
  head.append(...[t("libraryDate"), t("libraryName"), t("lapTime"), t("fitnessLoad"), t("fitnessDecouplingBy"), t("fitnessDecouplingColumn")].map((label) => node("th", {}, label)));
  const body = rows.map(({ entry, result, load }) => {
    const row = node("tr");
    const link = node("button", { type: "button", class: "link-button" }, entry.name ?? sportLabel(entry.sport));
    link.addEventListener("click", () => openActivity(entry));
    const name = node("td");
    name.append(link);
    const percent = result.percent;
    row.append(
      node("td", {}, dayText(dayKey(entry.startMs, zone))),
      name,
      node("td", {}, formatDuration(entry.summary.timerSeconds)),
      node("td", {}, load ? displayNumber(load.load) : "—"),
      node("td", {}, t(result.by === "power" ? "fitnessByPower" : "fitnessBySpeed")),
      node("td", { class: percent < 5 ? "is-better" : percent > 10 ? "is-worse" : "is-middle" }, `${percent >= 0 ? "+" : ""}${displayNumber(percent, 1)} %`),
    );
    return row;
  });
  table.replaceChildren(node("thead"), node("tbody"));
  table.tHead.append(head);
  table.tBodies[0].append(...body);
}

function render() {
  const select = byId("fitnessSport");
  const present = sports.filter((sport) => view.entries.some((entry) => entry.sport === sport));
  select.replaceChildren(new Option(t("diaryAllSports"), "all"), ...present.map((sport) => new Option(sportLabel(sport), sport)));
  if (view.sport !== "all" && !present.includes(view.sport)) view.sport = "all";
  select.value = view.sport;
  for (const button of document.querySelectorAll("[data-fitness-range]")) button.setAttribute("aria-pressed", String(button.dataset.fitnessRange === view.range));
  byId("fitnessEmpty").hidden = view.entries.length > 0;
  byId("fitnessContent").hidden = !view.entries.length;
  if (!view.entries.length) return;
  const settings = settingsFor(view.entries);
  const shown = ofSport(view.entries);
  const history = loadHistory(shown, settings, zone, today());
  renderTiles(history, settings);
  renderLoadChart(history);
  const current = inRange(shown);
  renderZones(current, settings);
  renderCurve(current, inRange(shown, 1));
  renderDecoupling(current, settings);
  byId("fitnessLoadNote").textContent = t("fitnessLoadNote", { fitness: fitnessDays, fatigue: fatigueDays });
}

export async function showFitness() {
  view.entries = await listEntries().catch(() => []);
  render();
}

export const rerenderFitness = () => {
  if (!byId("fitnessView").hidden) render();
};

export function setupFitness({ onOpen }) {
  openActivity = onOpen;
  byId("fitnessSettingsLink").addEventListener("click", () => openSettings(view.sport === "all" ? undefined : view.sport));
  window.addEventListener("settings-change", rerenderFitness);
  byId("fitnessSport").addEventListener("change", (event) => {
    view.sport = event.target.value;
    save({ sport: view.sport });
    render();
  });
  for (const button of document.querySelectorAll("[data-fitness-range]")) {
    button.addEventListener("click", () => {
      view.range = button.dataset.fitnessRange;
      save({ range: view.range });
      render();
    });
  }
  const chart = byId("fitnessLoadChart");
  chart.addEventListener("pointermove", showLoadTooltip);
  chart.addEventListener("pointerleave", hideLoadTooltip);
  let width = 0;
  new ResizeObserver(([item]) => {
    const next = Math.round(item.contentRect.width);
    if (next && next !== width && !byId("fitnessView").hidden && view.entries.length) {
      width = next;
      render();
    }
  }).observe(byId("fitnessView"));
}
