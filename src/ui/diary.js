import { workoutKind, workoutKinds } from "../analysis.js";
import { addDays, calendarDays, dayKey, inPeriod, periodBuckets, periodRange, previousRange, shiftPeriod, totals } from "../diary.js";
import { listEntries } from "../library.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";
import { kindLabel } from "./library.js";

const svgNs = "http://www.w3.org/2000/svg";
const sports = ["rowing", "cycling", "running"];

const view = {
  entries: [],
  // "all" or one sport.
  sport: "all",
  period: "month",
  // Any day inside the period shown.
  day: null,
  // What the chart's bars add up: "distance", "seconds" or "count".
  barMetric: "distance",
};

// Opens an activity in the comparison; set by the app, which owns the switching between views.
let openActivity = () => {};

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const format = (key, options) => new Intl.DateTimeFormat(locale(), { timeZone: "UTC", ...options }).format(new Date(`${key}T12:00:00Z`));
// Each kind keeps its place in the categorical palette.
const kindColor = (kind) => `var(--compare-${workoutKinds.indexOf(kind) + 1})`;
const km = (meters, digits = 1) => `${displayNumber(meters / 1000, digits)} km`;
const hours = (seconds) => (seconds >= 3600 ? `${displayNumber(seconds / 3600, 1)} h` : `${Math.round(seconds / 60)} min`);

function periodTitle([from, to]) {
  if (view.period === "year") return from.slice(0, 4);
  if (view.period === "month") return format(from, { month: "long", year: "numeric" });
  return `${format(from, { day: "numeric", month: "numeric" })} – ${format(addDays(to, -1), { day: "numeric", month: "numeric", year: "numeric" })}`;
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
  // Back to today only from another period.
  const today = dayKey(Date.now(), zone);
  byId("diaryToday").hidden = today >= range[0] && today < range[1];
}

// The period's totals, each beside the change from the period before.
function renderTiles(current, previous) {
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
    [t("diaryDistance"), km(current.distance), change(current.distance, previous.distance, (value) => km(value))],
    [t("diaryTime"), hours(current.seconds), change(current.seconds, previous.seconds, hours)],
    [t("lapPower"), current.avgPower == null ? "—" : `${displayNumber(current.avgPower)} W`, change(current.avgPower, previous.avgPower, (value) => `${displayNumber(value)} W`)],
    [t("lapHeartRate"), current.avgHeartRate == null ? "—" : `${displayNumber(current.avgHeartRate)} bpm`, change(current.avgHeartRate, previous.avgHeartRate, (value) => `${displayNumber(value)} bpm`)],
  ];
  byId("diaryPrevious").textContent = previous.partial
    ? t("diaryVersusPart", { from: format(previous.range[0], { day: "numeric", month: "numeric" }), to: format(addDays(previous.range[1], -1), { day: "numeric", month: "numeric" }) })
    : t(`diaryVersus_${view.period}`);
  byId("diaryTiles").replaceChildren(...tiles.map(([label, value, delta]) => {
    const tile = Object.assign(document.createElement("div"), { className: "diary-tile" });
    tile.append(
      Object.assign(document.createElement("span"), { className: "diary-tile-label", textContent: label }),
      Object.assign(document.createElement("strong"), { className: "diary-tile-value", textContent: value }),
      Object.assign(document.createElement("span"), { className: "diary-tile-change", textContent: delta || " " }),
    );
    return tile;
  }));
}

const barValue = (entries) => (view.barMetric === "count" ? entries.length
  : entries.reduce((sum, entry) => sum + ((view.barMetric === "distance" ? entry.summary.distance : entry.summary.timerSeconds) ?? 0), 0));
const barText = (value) => (view.barMetric === "count" ? String(value) : view.barMetric === "distance" ? km(value) : hours(value));

// One bar per day of a week or month, per month of a year; each bar stacked by workout kind.
function renderBars(range, entries) {
  const buckets = periodBuckets(view.period, range, entries, zone);
  const svg = byId("diaryChart");
  const width = Math.max(320, Math.round(svg.getBoundingClientRect().width) || 1000);
  const height = 220;
  const left = 8;
  const top = 22;
  const bottom = 26;
  const plotHeight = height - top - bottom;
  const max = Math.max(...buckets.map((bucket) => barValue(bucket.entries)), 0);
  const slot = (width - left * 2) / buckets.length;
  const barWidth = Math.max(4, Math.min(48, slot * 0.6));
  const node = (name, attributes, text) => {
    const element = document.createElementNS(svgNs, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text != null) element.textContent = text;
    return element;
  };
  const children = [node("line", { x1: left, x2: width - left, y1: top + plotHeight, y2: top + plotHeight, class: "diary-axis" })];
  buckets.forEach((bucket, index) => {
    const x = left + slot * index + (slot - barWidth) / 2;
    const total = barValue(bucket.entries);
    const label = view.period === "year" ? format(`${bucket.key}-01`, { month: "short" })
      : view.period === "week" ? format(bucket.key, { weekday: "short", day: "numeric" }) : String(Number(bucket.key.slice(8)));
    children.push(node("text", { x: x + barWidth / 2, y: height - 8, class: "diary-tick" }, label));
    if (!total || !max) return;
    const group = node("g", { class: "diary-bar" });
    let y = top + plotHeight;
    // Kinds stack in their fixed order, each segment parted from the next by a surface gap.
    for (const kind of workoutKinds) {
      const value = barValue(bucket.entries.filter((entry) => workoutKind(entry) === kind));
      if (!value) continue;
      const segment = (value / max) * plotHeight;
      y -= segment;
      group.append(node("rect", { x, y, width: barWidth, height: Math.max(1, segment - 2), rx: 3, fill: kindColor(kind) }));
    }
    const when = view.period === "year" ? format(`${bucket.key}-01`, { month: "long", year: "numeric" }) : format(bucket.key, { weekday: "long", day: "numeric", month: "numeric" });
    group.append(node("title", {}, `${when}\n${barText(total)} · ${t("diarySessionsCount", { count: bucket.entries.length })}`));
    // A hit target the whole height of the column, wider than the bar.
    group.prepend(node("rect", { x: left + slot * index, y: top, width: slot, height: plotHeight, fill: "transparent" }));
    children.push(group);
    if (total === max || buckets.length <= 12) children.push(node("text", { x: x + barWidth / 2, y: y - 6, class: "diary-bar-label" }, barText(total)));
  });
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.replaceChildren(...children);
  byId("diaryChartEmpty").hidden = max > 0;
}

function activityButton(entry) {
  const button = Object.assign(document.createElement("button"), { type: "button", className: "diary-activity" });
  button.style.setProperty("--kind", kindColor(workoutKind(entry)));
  button.append(
    Object.assign(document.createElement("span"), { className: "diary-activity-name", textContent: entry.name.replace(/^Kinomap - /, "") }),
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

function renderLegend() {
  byId("diaryLegend").replaceChildren(...workoutKinds.map((kind) => {
    const item = Object.assign(document.createElement("span"), { className: "diary-legend-item" });
    const swatch = Object.assign(document.createElement("i"), { className: "compare-swatch" });
    swatch.style.background = kindColor(kind);
    item.append(swatch, kindLabel(kind, view.sport === "all" ? null : view.sport));
    return item;
  }));
}

function render() {
  if (byId("diaryView").hidden) return;
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
  renderTiles(totals(current), { ...totals(previous), range: before, partial: before[1] !== whole[1] });
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
  for (const [id, by] of [["diaryBack", -1], ["diaryForward", 1]]) {
    byId(id).addEventListener("click", () => {
      view.day = shiftPeriod(view.period, view.day, by);
      render();
    });
  }
  // The chart is drawn at its real width, so a new window width redraws it.
  window.addEventListener("resize", render);
  byId("diaryToday").addEventListener("click", () => {
    view.day = dayKey(Date.now(), zone);
    render();
  });
}
