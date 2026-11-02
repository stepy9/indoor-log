import { workoutKind, workoutKinds } from "../analysis.js";
import { addDays, calendarDays, dayKey, weekNumber, inPeriod, periodBuckets, periodRange, previousRange, shiftPeriod, totals } from "../diary.js";
import { listEntries } from "../library.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";
import { kindLabel } from "./library.js";

const svgNs = "http://www.w3.org/2000/svg";
const sports = ["rowing", "cycling", "running"];

// The sport, period and chart measure picked last come back with the page.
const remembered = savedDefaults().diary ?? {};

const view = {
  entries: [],
  // "all" or one sport.
  sport: remembered.sport ?? "all",
  period: ["week", "month", "year"].includes(remembered.period) ? remembered.period : "month",
  // Any day inside the period shown.
  day: null,
  // Sports or kinds turned off in the chart's legend.
  hidden: new Set(),
  // What the chart's bars add up: "distance" or "seconds".
  barMetric: remembered.barMetric === "seconds" ? "seconds" : "distance",
};

// Opens an activity in the comparison; set by the app, which owns the switching between views.
let openActivity = () => {};

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const format = (key, options) => new Intl.DateTimeFormat(locale(), { timeZone: "UTC", ...options }).format(new Date(`${key}T12:00:00Z`));
// Each kind keeps its place in the categorical palette.
const kindColor = (kind) => `var(--compare-${workoutKinds.indexOf(kind) + 1})`;
const sportIcon = { rowing: "🚣", cycling: "🚴", running: "🏃" };

// Several sports at once: their distances do not add up, so the chart counts time and is split by sport.
const mixedSports = () => view.sport === "all" && new Set(view.entries.map((entry) => entry.sport)).size > 1;

// What a bar is split into: sports when several are shown, workout kinds within one.
function barGroups() {
  if (mixedSports()) {
    return sports.filter((sport) => view.entries.some((entry) => entry.sport === sport)).map((sport, index) => ({
      key: sport, label: sportLabel(sport), color: `var(--compare-${index + 1})`, has: (entry) => entry.sport === sport,
    }));
  }
  return workoutKinds.map((kind) => ({
    key: kind, label: kindLabel(kind, view.sport === "all" ? null : view.sport), color: kindColor(kind), has: (entry) => workoutKind(entry) === kind,
  }));
}
const km = (meters, digits = 1) => `${displayNumber(meters / 1000, digits)} km`;
const hours = (seconds) => (seconds >= 3600 ? `${displayNumber(seconds / 3600, 1)} h` : `${Math.round(seconds / 60)} min`);

function periodTitle([from, to]) {
  if (view.period === "year") return from.slice(0, 4);
  if (view.period === "month") return format(from, { month: "long", year: "numeric" });
  return `${t("diaryWeekNumber", { week: weekNumber(from) })} · ${format(from, { day: "numeric", month: "numeric" })} – ${format(addDays(to, -1), { day: "numeric", month: "numeric", year: "numeric" })}`;
}

// The years to jump to: from the first activity, or this year, up to this year.
function jumpYears() {
  const thisYear = Number(dayKey(Date.now(), zone).slice(0, 4));
  const first = Math.min(thisYear, ...view.entries.map((entry) => Number(dayKey(entry.startMs, zone).slice(0, 4))));
  return Array.from({ length: thisYear - first + 1 }, (_, index) => thisYear - index);
}

// The jump list for the period shown: its year, and its month or week within that year.
function renderJump(range) {
  const year = Number(range[0].slice(0, 4));
  const years = jumpYears();
  if (!years.includes(year)) years.push(year);
  byId("diaryJumpYear").replaceChildren(...years.sort((a, b) => b - a).map((value) => new Option(String(value), String(value))));
  byId("diaryJumpYear").value = String(year);
  byId("diaryJumpMonthField").hidden = view.period !== "month";
  byId("diaryJumpWeekField").hidden = view.period !== "week";
  if (view.period === "month") {
    byId("diaryJumpMonth").replaceChildren(...Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, "0")}-01`;
      return new Option(format(key, { month: "long" }), key);
    }));
    byId("diaryJumpMonth").value = range[0];
  }
  if (view.period === "week") {
    // Every week numbered in the year: from the one holding 4 January to the last before the next year's first.
    const options = [];
    for (let from = periodRange("week", `${year}-01-04`)[0]; from < periodRange("week", `${year + 1}-01-04`)[0]; from = addDays(from, 7)) {
      options.push(new Option(`${weekNumber(from)}. · ${format(from, { day: "numeric", month: "numeric" })} – ${format(addDays(from, 6), { day: "numeric", month: "numeric" })}`, from));
    }
    byId("diaryJumpWeek").replaceChildren(...options);
    byId("diaryJumpWeek").value = range[0];
  }
}

function toggleJump(open = byId("diaryJump").hidden) {
  byId("diaryJump").hidden = !open;
  byId("diaryTitle").setAttribute("aria-expanded", String(open));
}

const shown = () => view.entries.filter((entry) => view.sport === "all" || entry.sport === view.sport);

function renderControls(range) {
  const sport = byId("diarySport");
  const present = sports.filter((value) => view.entries.some((entry) => entry.sport === value));
  sport.replaceChildren(new Option(t("diaryAllSports"), "all"), ...present.map((value) => new Option(sportLabel(value), value)));
  sport.value = present.includes(view.sport) ? view.sport : "all";
  view.sport = sport.value;
  for (const button of byId("diaryPeriod").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.period === view.period));
  for (const button of byId("diaryBarMetric").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.metric === view.barMetric));
  byId("diaryTitle").textContent = periodTitle(range);
  byId("diaryCalendarTitle").textContent = periodTitle(range);
  renderJump(range);
  // Back to today only from another period.
  const today = dayKey(Date.now(), zone);
  byId("diaryToday").hidden = today >= range[0] && today < range[1];
}

// The period's totals, each beside the change from the period before.
// Distance sport by sport, as several sports' kilometres do not add up.
function distanceBySport(entries) {
  return sports.map((sport) => [sport, entries.filter((entry) => entry.sport === sport)])
    .filter(([, list]) => list.length)
    .map(([sport, list]) => `${sportIcon[sport]} ${km(list.reduce((sum, entry) => sum + (entry.summary.distance ?? 0), 0))}`);
}

function renderTiles(current, previous, entries) {
  // A change that rounds away in its own units reads as none.
  const change = (now, before, text) => {
    if (now == null || before == null) return "";
    const difference = now - before;
    const shown = text(Math.abs(difference));
    if (!/[1-9]/.test(shown)) return t("diarySame");
    return `${difference > 0 ? "+" : "−"}${shown}`;
  };
  const tiles = [
    [t("diarySessions"), String(current.count), change(current.count, previous.count, (value) => String(value))],
    mixedSports()
      ? [t("diaryDistance"), distanceBySport(entries).join("\n") || "0 km", "", "is-split"]
      : [t("diaryDistance"), km(current.distance), change(current.distance, previous.distance, (value) => km(value))],
    [t("diaryTime"), hours(current.seconds), change(current.seconds, previous.seconds, hours)],
    [t("lapPower"), current.avgPower == null ? "—" : `${displayNumber(current.avgPower)} W`, change(current.avgPower, previous.avgPower, (value) => `${displayNumber(value)} W`)],
    [t("lapHeartRate"), current.avgHeartRate == null ? "—" : `${displayNumber(current.avgHeartRate)} bpm`, change(current.avgHeartRate, previous.avgHeartRate, (value) => `${displayNumber(value)} bpm`)],
  ];
  byId("diaryPrevious").textContent = previous.partial
    ? t("diaryVersusPart", { from: format(previous.range[0], { day: "numeric", month: "numeric" }), to: format(addDays(previous.range[1], -1), { day: "numeric", month: "numeric" }) })
    : t(`diaryVersus_${view.period}`);
  byId("diaryTiles").replaceChildren(...tiles.map(([label, value, delta, modifier]) => {
    const tile = Object.assign(document.createElement("div"), { className: `diary-tile${modifier ? ` ${modifier}` : ""}` });
    tile.append(
      Object.assign(document.createElement("span"), { className: "diary-tile-label", textContent: label }),
      Object.assign(document.createElement("strong"), { className: "diary-tile-value", textContent: value }),
      Object.assign(document.createElement("span"), { className: "diary-tile-change", textContent: delta || " " }),
    );
    return tile;
  }));
}

const barValue = (entries, metric) => entries.reduce((sum, entry) => sum + ((metric === "distance" ? entry.summary.distance : entry.summary.timerSeconds) ?? 0), 0);
const barText = (value, metric) => (metric === "distance" ? km(value) : hours(value));

const svgNode = (name, attributes, text) => {
  const element = document.createElementNS(svgNs, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text != null) element.textContent = text;
  return element;
};

// A round step for the value axis, about three to a chart: 1, 2, 2.5 or 5 times a power of ten in metres,
// whole minutes or hours in time.
function axisStep(max, metric) {
  const rough = max / 3;
  const steps = metric === "distance"
    ? [1, 2, 2.5, 5].flatMap((factor) => [1, 10, 100, 1000, 10_000, 100_000].map((power) => factor * power))
    : [5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 600, 1200, 1800, 3000, 6000].map((minutes) => minutes * 60);
  return steps.sort((a, b) => a - b).find((step) => step >= rough) ?? rough;
}

const axisText = (value, metric) => (metric === "distance"
  ? (value >= 1000 ? `${displayNumber(value / 1000, value % 1000 ? 1 : 0)} km` : `${displayNumber(value)} m`)
  : value >= 3600 ? `${displayNumber(value / 3600, value % 3600 ? 1 : 0)} h` : `${Math.round(value / 60)} min`);

// The bar's day or month, its total and what it is made of (the sessions are in the calendar), beside the bar under the pointer.
function showTooltip(bar, { when, total, parts }) {
  const tooltip = byId("diaryTooltip");
  const line = (className, text) => Object.assign(document.createElement("div"), { className, textContent: text });
  const rows = parts.length > 1 ? parts.map(({ label, color, value }) => {
    const row = Object.assign(document.createElement("div"), { className: "diary-tooltip-row" });
    const swatch = Object.assign(document.createElement("i"), { className: "compare-swatch" });
    swatch.style.background = color;
    row.append(swatch, Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("strong"), { textContent: value }));
    return row;
  }) : [];
  tooltip.replaceChildren(line("diary-tooltip-when", when), line("diary-tooltip-total", total), ...rows);
  tooltip.hidden = false;
  // Beside the bar, flipped to its left near the right edge, and kept inside the card.
  const card = tooltip.offsetParent.getBoundingClientRect();
  const box = bar.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const rightSide = box.right - card.left + 10;
  const left = rightSide + width > card.width - 8 ? box.left - card.left - width - 10 : rightSide;
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, box.top - card.top)}px`;
}

function hideTooltip() {
  byId("diaryTooltip").hidden = true;
}

// One chart of bars, a day of a week or month or a month of a year each, stacked by the groups given.
function drawBars(buckets, groups, metric, height) {
  const svg = svgNode("svg", { class: "diary-chart", role: "img" });
  svg.setAttribute("aria-label", t("diaryChart"));
  const width = Math.max(320, Math.round(byId("diaryCharts").getBoundingClientRect().width) || 1000);
  // The value axis takes the left edge, its labels right-aligned against the plot.
  const left = 56;
  const right = 8;
  const top = 22;
  const bottom = 26;
  const plotHeight = height - top - bottom;
  // Only what the chart draws counts, for the bar totals and the scale alike.
  const drawn = (entries) => entries.filter((entry) => groups.some(({ has }) => has(entry)));
  const highest = Math.max(...buckets.map((bucket) => barValue(drawn(bucket.entries), metric)), 0);
  const step = highest ? axisStep(highest, metric) : 0;
  // Bars are scaled to the round value above the highest, so the top gridline is labelled.
  const max = step ? Math.ceil(highest / step) * step : 0;
  const slot = (width - left - right) / buckets.length;
  const barWidth = Math.max(4, Math.min(48, slot * 0.6));
  const children = [];
  for (let value = step; step && value <= max + 1e-9; value += step) {
    const y = top + plotHeight - (value / max) * plotHeight;
    children.push(svgNode("line", { x1: left, x2: width - right, y1: y, y2: y, class: "diary-grid" }));
    children.push(svgNode("text", { x: left - 8, y: y + 4, class: "diary-axis-label" }, axisText(value, metric)));
  }
  children.push(svgNode("line", { x1: left, x2: width - right, y1: top + plotHeight, y2: top + plotHeight, class: "diary-axis" }));
  children.push(svgNode("text", { x: left - 8, y: top + plotHeight + 4, class: "diary-axis-label" }, "0"));
  buckets.forEach((bucket, index) => {
    const x = left + slot * index + (slot - barWidth) / 2;
    const total = barValue(drawn(bucket.entries), metric);
    const label = view.period === "year" ? format(`${bucket.key}-01`, { month: "short" })
      : view.period === "week" ? format(bucket.key, { weekday: "short", day: "numeric" }) : String(Number(bucket.key.slice(8)));
    children.push(svgNode("text", { x: x + barWidth / 2, y: height - 8, class: "diary-tick" }, label));
    if (!total || !max) return;
    const group = svgNode("g", { class: "diary-bar" });
    let y = top + plotHeight;
    // Groups stack in their fixed order, each segment parted from the next by a surface gap.
    for (const { has, color } of groups) {
      const value = barValue(bucket.entries.filter(has), metric);
      if (!value) continue;
      const segment = (value / max) * plotHeight;
      y -= segment;
      group.append(svgNode("rect", { x, y, width: barWidth, height: Math.max(1, segment - 2), rx: 3, fill: color }));
    }
    const when = view.period === "year" ? format(`${bucket.key}-01`, { month: "long", year: "numeric" }) : format(bucket.key, { weekday: "long", day: "numeric", month: "numeric" });
    const parts = groups.map(({ has, label, color }) => ({ label, color, value: barValue(bucket.entries.filter(has), metric) })).filter(({ value }) => value);
    group.addEventListener("pointerenter", () => showTooltip(group, { when, total: barText(total, metric), parts: parts.map((part) => ({ ...part, value: barText(part.value, metric) })) }));
    group.addEventListener("pointerleave", hideTooltip);
    // A hit target the whole height of the column, wider than the bar.
    group.prepend(svgNode("rect", { x: left + slot * index, y: top, width: slot, height: plotHeight, fill: "transparent" }));
    children.push(group);
  });
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.height = `${height}px`;
  svg.replaceChildren(...children);
  return svg;
}

// Time adds up across sports, so it is one chart split by sport (or by kind within one).
// Distance does not: with several sports each gets its own row on its own scale.
function renderBars(range, entries) {
  const buckets = periodBuckets(view.period, range, entries, zone);
  const metric = view.barMetric;
  const charts = [];
  const shownGroups = barGroups().filter(({ key }) => !view.hidden.has(key));
  // A single sport left shown needs no rows of its own.
  if (metric === "distance" && mixedSports() && shownGroups.length > 1) {
    for (const group of shownGroups) {
      const row = Object.assign(document.createElement("div"), { className: "diary-chart-row" });
      row.append(Object.assign(document.createElement("span"), { className: "diary-chart-caption", textContent: `${sportIcon[group.key]} ${group.label}` }));
      row.append(drawBars(buckets, [group], metric, 130));
      charts.push(row);
    }
  } else {
    charts.push(drawBars(buckets, shownGroups, metric, 220));
  }
  byId("diaryCharts").replaceChildren(...charts);
  byId("diaryChartEmpty").hidden = entries.length > 0;
}

function activityButton(entry) {
  const button = Object.assign(document.createElement("button"), { type: "button", className: "diary-activity" });
  // The stripe matches the chart's legend: the sport's colour when several are shown, the kind's within one.
  const group = barGroups().find(({ has }) => has(entry));
  button.style.setProperty("--kind", group?.color ?? kindColor(workoutKind(entry)));
  const name = Object.assign(document.createElement("span"), { className: "diary-activity-name", textContent: entry.name.replace(/^Kinomap - /, "") });
  // With several sports shown, each activity also names its sport by an icon.
  if (mixedSports()) name.prepend(Object.assign(document.createElement("span"), { className: "diary-sport", textContent: `${sportIcon[entry.sport]} `, ariaHidden: "true" }));
  button.append(
    name,
    Object.assign(document.createElement("span"), { className: "diary-activity-meta", textContent: `${km(entry.summary.distance ?? 0, 2)} · ${formatDuration(entry.summary.timerSeconds)}` }),
  );
  button.title = `${entry.name}\n${kindLabel(workoutKind(entry), entry.sport)} · ${sportLabel(entry.sport)}\n${t("diaryOpen")}`;
  button.addEventListener("click", () => openActivity(entry));
  return button;
}

// A month's calendar, or a week's single row; a year has its chart only.
function renderCalendar(range, entries) {
  const card = byId("diaryCalendarCard");
  card.hidden = view.period === "year";
  if (card.hidden) return;
  const days = view.period === "week" ? periodBuckets("week", range, [], zone).map((bucket) => bucket.key) : calendarDays(range[0]);
  const today = dayKey(Date.now(), zone);
  const head = days.slice(0, 7).map((day) => Object.assign(document.createElement("div"), { className: "diary-weekday", textContent: format(day, { weekday: "short" }) }));
  const cells = days.map((day) => {
    const cell = Object.assign(document.createElement("div"), { className: "diary-day" });
    // Days of the months around only keep the weekdays in line, so they stay empty.
    if (day < range[0] || day >= range[1]) {
      cell.className = "diary-day is-outside";
      return cell;
    }
    cell.classList.toggle("is-today", day === today);
    cell.append(Object.assign(document.createElement("span"), { className: "diary-date", textContent: format(day, { day: "numeric" }) }));
    cell.append(...entries.filter((entry) => dayKey(entry.startMs, zone) === day).sort((a, b) => a.startMs - b.startMs).map(activityButton));
    return cell;
  });
  byId("diaryCalendar").replaceChildren(...head, ...cells);
}

// Each legend entry turns its sport or kind on and off in the chart; the last one shown stays on.
function renderLegend() {
  const groups = barGroups();
  byId("diaryLegend").replaceChildren(...groups.map(({ key, label, color }) => {
    const item = Object.assign(document.createElement("button"), { type: "button", className: "diary-legend-item" });
    item.setAttribute("aria-pressed", String(!view.hidden.has(key)));
    item.title = t("diaryLegendToggle");
    const swatch = Object.assign(document.createElement("i"), { className: "compare-swatch" });
    swatch.style.background = color;
    item.append(swatch, label);
    item.addEventListener("click", () => {
      if (view.hidden.has(key)) view.hidden.delete(key);
      else if (groups.filter((group) => !view.hidden.has(group.key)).length > 1) view.hidden.add(key);
      render();
    });
    return item;
  }));
}

function render() {
  if (byId("diaryView").hidden) return;
  saveDefaults({ diary: { sport: view.sport, period: view.period, barMetric: view.barMetric } });
  view.day ??= dayKey(Date.now(), zone);
  const range = periodRange(view.period, view.day);
  const entries = shown();
  const current = inPeriod(entries, range, zone);
  const today = dayKey(Date.now(), zone);
  const before = previousRange(view.period, view.day, today);
  const previous = inPeriod(entries, before, zone);
  const whole = periodRange(view.period, shiftPeriod(view.period, view.day, -1));
  byId("diaryEmpty").hidden = view.entries.length > 0;
  renderControls(range);
  renderTiles(totals(current), { ...totals(previous), range: before, partial: before[1] !== whole[1] }, current);
  renderBars(range, current);
  renderLegend();
  renderCalendar(range, current);
}

export async function showDiary() {
  view.entries = await listEntries().catch(() => []);
  render();
}

export const rerenderDiary = render;

export function setupDiary({ onOpen }) {
  openActivity = onOpen;
  byId("diarySport").addEventListener("change", (event) => {
    view.sport = event.target.value;
    render();
  });
  byId("diaryPeriod").addEventListener("click", (event) => {
    const period = event.target.closest("button")?.dataset.period;
    if (!period) return;
    view.period = period;
    render();
  });
  byId("diaryBarMetric").addEventListener("click", (event) => {
    const metric = event.target.closest("button")?.dataset.metric;
    if (!metric) return;
    view.barMetric = metric;
    render();
  });
  // The calendar has its own arrows, so a long month need not be scrolled back up to move on.
  for (const [id, by] of [["diaryBack", -1], ["diaryForward", 1], ["diaryCalendarBack", -1], ["diaryCalendarForward", 1]]) {
    byId(id).addEventListener("click", () => {
      view.day = shiftPeriod(view.period, view.day, by);
      render();
    });
  }
  // The chart is drawn at its real width, so a new window width redraws it.
  window.addEventListener("resize", render);
  byId("diaryTitle").addEventListener("click", () => toggleJump());
  // A new year keeps the month, or the week number as near as that year has it.
  byId("diaryJumpYear").addEventListener("change", (event) => {
    const year = event.target.value;
    const [from] = periodRange(view.period, view.day);
    if (view.period === "week") {
      const firstWeek = periodRange("week", `${year}-01-04`)[0];
      const lastWeek = addDays(periodRange("week", `${Number(year) + 1}-01-04`)[0], -7);
      const wanted = addDays(firstWeek, 7 * (weekNumber(from) - 1));
      view.day = wanted > lastWeek ? lastWeek : wanted;
    } else {
      view.day = `${year}${from.slice(4)}`;
    }
    render();
  });
  for (const id of ["diaryJumpMonth", "diaryJumpWeek"]) {
    byId(id).addEventListener("change", (event) => {
      view.day = event.target.value;
      toggleJump(false);
      render();
    });
  }
  // A click elsewhere or Escape closes the jump list.
  document.addEventListener("click", (event) => {
    if (!byId("diaryJump").hidden && !event.target.closest(".diary-jump-wrap")) toggleJump(false);
  });
  byId("diaryJump").addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    toggleJump(false);
    byId("diaryTitle").focus();
  });
  byId("diaryToday").addEventListener("click", () => {
    view.day = dayKey(Date.now(), zone);
    render();
  });
}
