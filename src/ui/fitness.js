import { activityLoad, estimateMaxHeartRate, ftpOn, ftpSourceOn, ftpSuggestion, curveDurations, decoupling, fatigueDays, fitnessDays, forSport, formState, heartRateZones, loadHistory, powerCurve, powerZones, timeInZones } from "../fitness.js";
import { addFtpRecord, currentFtp, dismiss, dismissed, openSettings, setByHand, setMaxHeartRate, settingsFor, typedMaxHeartRate } from "./settings.js";
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

// What the library says the thresholds typed by hand have fallen behind: a higher FTP since the record in force,
// or a heart rate above the maximum. Each can be taken into the settings or turned down for good.
function renderSuggestions(settings) {
  const turnedDown = dismissed();
  const items = [];
  const present = sports.filter((sport) => view.entries.some((entry) => entry.sport === sport));
  for (const sport of present) {
    const ftp = ftpSuggestion(settings, sport);
    if (ftp && !turnedDown.has(`ftp-${sport}-${ftp.from}-${ftp.ftp}`)) {
      items.push({
        key: `ftp-${sport}-${ftp.from}-${ftp.ftp}`,
        text: t("suggestFtp", { sport: sportLabel(sport), ftp: ftp.ftp, current: currentFtp(settings, sport), date: dayText(ftp.from), name: ftp.entry.name ?? "" }),
        apply: () => addFtpRecord(sport, { from: ftp.from, ftp: ftp.ftp }),
        entry: ftp.entry,
      });
    }
  }
  // A sport's own maximum, then the general one against every sport without its own.
  const maxFor = (sport) => {
    const typed = typedMaxHeartRate(sport);
    if (!typed) return;
    const own = view.entries.filter((entry) => (sport ? entry.sport === sport : !typedMaxHeartRate(entry.sport)));
    const recorded = estimateMaxHeartRate(own);
    if (!(recorded > typed)) return;
    const key = `max-${sport ?? "general"}-${recorded}`;
    if (turnedDown.has(key)) return;
    const entry = own.find((item) => item.summary.maxHeartRate === recorded);
    items.push({
      key,
      text: t(sport ? "suggestSportMax" : "suggestMax", { sport: sport ? sportLabel(sport) : "", recorded, typed, date: entry ? dayText(dayKey(entry.startMs, zone)) : "" }),
      apply: () => setMaxHeartRate(sport, recorded),
      entry,
    });
  };
  maxFor(null);
  for (const sport of present) maxFor(sport);
  const box = byId("fitnessSuggestions");
  box.hidden = !items.length;
  box.replaceChildren(...items.map((item) => {
    const row = node("div", { class: "fitness-suggestion" });
    const text = node("span", { class: "fitness-suggestion-text" }, item.text);
    const actions = node("div", { class: "fitness-suggestion-actions" });
    if (item.entry) {
      const open = node("button", { type: "button", class: "link-button" }, t("suggestOpen"));
      open.addEventListener("click", () => openActivity(item.entry));
      actions.append(open);
    }
    const ignore = node("button", { type: "button", class: "outline-button" }, t("suggestIgnore"));
    ignore.addEventListener("click", () => {
      dismiss(item.key);
      render();
    });
    const apply = node("button", { type: "button", class: "export-button" }, t("suggestApply"));
    apply.addEventListener("click", () => {
      item.apply();
      window.dispatchEvent(new Event("settings-change"));
    });
    actions.append(ignore, apply);
    row.append(text, actions);
    return row;
  }));
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
    const ftp = currentFtp(settings, sport);
    if (ftp) tiles.push(tile(`FTP · ${sportLabel(sport)}`, `${displayNumber(ftp)} W`, setByHand(sport, "ftp") ? t("fitnessSetByHand") : t("fitnessEstimated")));
  }
  byId("fitnessTiles").replaceChildren(...tiles);
}

// The date axis of a chart by days: ticks as dense as fit at least 64 px apart (each day, every other day, weeks
// from Monday, or months), the last day always closing it, each with a faint vertical grid line.
// xForKey places a day ("YYYY-MM-DD") at its centre.
function dateTicks(firstKey, lastKey, xForKey, { margin, width, height }) {
  const first = Date.parse(`${firstKey}T12:00:00Z`);
  const last = Date.parse(`${lastKey}T12:00:00Z`);
  const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10);
  const pxPerDay = first < last ? (xForKey(lastKey) - xForKey(firstKey)) / ((last - first) / 86_400_000) : width;
  const spacing = [1, 2, 7, 14, 30, 61, 91, 182, 365].find((daysApart) => daysApart * pxPerDay >= 64) ?? 365;
  const ticks = [];
  if (spacing <= 14) {
    for (let ms = first; ms <= last; ms += 86_400_000) {
      const offset = Math.round((ms - Date.parse("2024-01-01T12:00:00Z")) / 86_400_000); // 2024-01-01 was a Monday.
      if (((offset % spacing) + spacing) % spacing === 0) ticks.push({ key: keyOf(ms), label: dayText(keyOf(ms), { day: "numeric", month: "short" }) });
    }
  } else {
    const every = Math.round(spacing / 30.4);
    for (let month = firstKey.slice(0, 7); ;) {
      const key = `${month}-01`;
      if (key > lastKey) break;
      const [year, number] = month.split("-").map(Number);
      if (key >= firstKey && (number - 1) % every === 0) ticks.push({ key, label: dayText(key, { month: "short", ...(number === 1 || !ticks.length ? { year: "numeric" } : {}) }) });
      month = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
    }
  }
  // The last day always closes the axis; a regular tick too close to it gives way.
  while (ticks.length && (ticks.at(-1).key === lastKey || xForKey(lastKey) - xForKey(ticks.at(-1).key) < 64)) ticks.pop();
  ticks.push({ key: lastKey, label: dayText(lastKey, { day: "numeric", month: "short", ...(spacing > 14 ? { year: "numeric" } : {}) }) });
  return ticks.flatMap((tick) => {
    const x = xForKey(tick.key);
    // A label near the right edge is right-aligned so it is not cut off.
    const near = width - margin.right - x < 30;
    return [
      node("line", { x1: x, x2: x, y1: margin.top, y2: height - margin.bottom, class: "diary-grid" }),
      node("text", { x, y: height - 8, class: "diary-tick", ...(near ? { style: "text-anchor: end" } : {}) }, tick.label),
    ];
  });
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
  // Each day centred in its own slot, so the first and last have half a day of room like in the FTP chart.
  const xFor = (index) => margin.left + ((index + 0.5) / days.length) * plotWidth;
  const indexOf = new Map(days.map((day, index) => [day.day, index]));
  const yFor = (value) => margin.top + ((maxY - value) / (maxY - minY)) * plotHeight;
  const children = [];
  for (let value = minY; value <= maxY + 1e-9; value += step) {
    children.push(node("line", { x1: margin.left, x2: width - margin.right, y1: yFor(value), y2: yFor(value), class: value === 0 ? "diary-axis" : "diary-grid" }));
    children.push(node("text", { x: margin.left - 8, y: yFor(value) + 4, class: "diary-axis-label" }, displayNumber(value)));
  }
  children.push(...dateTicks(days[0].day, days.at(-1).day, (key) => xFor(indexOf.get(key) ?? 0), { margin, width, height }));
  // The form's zones: fresh above +15 and overreaching below −30, shaded where they fall in the scale.
  // Each named in its corner, as they are about the form line, not the load bars.
  const band = (from, to, className, label) => {
    const top = yFor(Math.min(maxY, to));
    const bottom = yFor(Math.max(minY, from));
    if (bottom <= top) return;
    children.push(node("rect", { x: margin.left, y: top, width: plotWidth, height: bottom - top, class: className }));
    if (bottom - top >= 16) children.push(node("text", { x: margin.left + 6, y: top + 13, class: `fitness-band-label ${className}` }, label));
  };
  band(15, maxY, "fitness-band-fresh", `${t("fitnessState_fresh")} · ${t("fitnessForm").toLowerCase()} > +15`);
  band(minY, -30, "fitness-band-over", `${t("fitnessState_overreaching")} · ${t("fitnessForm").toLowerCase()} < −30`);
  const barWidth = Math.max(1, Math.min(12, (plotWidth / days.length) * 0.7));
  days.forEach((day, index) => {
    if (day.load > 0) children.push(node("rect", { x: xFor(index) - barWidth / 2, y: yFor(day.load), width: barWidth, height: yFor(0) - yFor(day.load), class: "fitness-load-bar" }));
  });
  const line = (field, className) => node("path", { class: `fitness-line ${className}`, d: days.map((day, index) => `${index ? "L" : "M"}${xFor(index).toFixed(1)},${yFor(day[field]).toFixed(1)}`).join("") });
  children.push(line("form", "is-form"), line("fatigue", "is-fatigue"), line("fitness", "is-fitness"));
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
  const index = Math.floor(((x - layout.margin.left) / layout.plotWidth) * layout.days.length);
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
  const has = (sport) => (field === "ftp" ? currentFtp(settings, sport) : settings.sports[sport][field]);
  const missing = view.sport === "all" ? !sports.some(has) : !has(view.sport);
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

// The FTP each day of the range as a step line per sport, the 20-minute efforts it is estimated from as dots.
function renderFtpChart(settings) {
  const chart = byId("fitnessFtpChart");
  const shownSports = (view.sport === "all" ? sports : [view.sport]).filter((sport) => view.entries.some((entry) => entry.sport === sport));
  const end = Date.now();
  const days = ranges[view.range];
  const firstMs = Math.min(...view.entries.map((entry) => entry.startMs));
  const start = Number.isFinite(days) ? Math.max(firstMs, end - days * 86_400_000) : firstMs;
  const step = Math.max(86_400_000, Math.ceil((end - start) / 400 / 86_400_000) * 86_400_000);
  // Whole days on the axis: half a day before the first one and after today, each day centred on its noon.
  const noonOf = (ms) => Date.parse(`${dayKey(ms, zone)}T12:00:00Z`);
  const todayNoon = noonOf(end);
  const axisStart = noonOf(start) - 43_200_000;
  const axisEnd = todayNoon + 43_200_000;
  const lines = shownSports.map((sport, index) => {
    // The FTP a day ends with, stepping at the day's noon so a change sits right under its tick, the diamond in the corner.
    const points = [];
    for (let noon = noonOf(start); noon <= todayNoon; noon += step) points.push({ ms: noon, ftp: ftpOn(settings, sport, Math.min(end, noon + 43_199_999)) });
    // Each day the FTP changes on, with where the new value comes from.
    const changes = [];
    for (let noon = noonOf(start) + 86_400_000; noon <= todayNoon; noon += 86_400_000) {
      const before = ftpOn(settings, sport, noon - 43_200_001);
      const source = ftpSourceOn(settings, sport, Math.min(end, noon + 43_199_999));
      if (source && before && Math.round(source.ftp) !== Math.round(before)) changes.push({ ms: noon, before, ...source });
    }
    const efforts = (settings.estimatedFtp[sport] ?? []).filter((point) => point.ms >= start && point.best).map((point) => ({ ms: noonOf(point.ms), ftp: point.best * 0.95, entry: point.entry }));
    return { sport, color: `var(--compare-${index + 1})`, points: points.filter((point) => point.ftp), efforts, changes };
  }).filter((line) => line.points.length || line.efforts.length);
  const has = lines.length > 0;
  byId("fitnessFtpEmpty").hidden = has;
  chart.hidden = !has;
  byId("fitnessFtpLegend").replaceChildren(...(lines.length > 1 ? lines.map((line) => {
    const key = node("span", { class: "fitness-key" });
    const swatch = node("span", { class: "fitness-swatch" });
    swatch.style.background = line.color;
    key.append(swatch, node("span", {}, sportLabel(line.sport)));
    return key;
  }) : []));
  if (!has) return;
  const width = Math.max(300, Math.round(chart.parentElement.getBoundingClientRect().width) || 600);
  const height = 220;
  const margin = { left: 48, right: 14, top: 14, bottom: 26 };
  const values = lines.flatMap((line) => [...line.points, ...line.efforts].map((point) => point.ftp));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const yStep = [10, 20, 25, 50, 100].find((size) => (high - low) / size <= 4) ?? 100;
  const minY = Math.max(0, Math.floor(low / yStep) * yStep - yStep);
  const maxY = Math.ceil(high / yStep) * yStep + yStep;
  const xFor = (ms) => margin.left + ((ms - axisStart) / (axisEnd - axisStart)) * (width - margin.left - margin.right);
  const yFor = (value) => margin.top + ((maxY - value) / (maxY - minY)) * (height - margin.top - margin.bottom);
  const children = [];
  for (let value = minY; value <= maxY + 1e-9; value += yStep) {
    children.push(node("line", { x1: margin.left, x2: width - margin.right, y1: yFor(value), y2: yFor(value), class: value === minY ? "diary-axis" : "diary-grid" }));
    children.push(node("text", { x: margin.left - 8, y: yFor(value) + 4, class: "diary-axis-label" }, displayNumber(value)));
  }
  children.push(...dateTicks(dayKey(start, zone), dayKey(end, zone), (key) => xFor(Date.parse(`${key}T12:00:00Z`)), { margin, width, height }));
  for (const line of lines) {
    // A step line: the FTP holds until the next change.
    let d = "";
    line.points.forEach((point, index) => {
      const x = xFor(point.ms).toFixed(1);
      const y = yFor(point.ftp).toFixed(1);
      d += index ? `H${x}V${y}` : `M${x},${y}`;
    });
    if (d) d += `H${xFor(axisEnd).toFixed(1)}`;
    if (d) children.push(node("path", { class: "fitness-line", d, style: `stroke: ${line.color}` }));
    for (const effort of line.efforts) {
      // A hollow ring: an effort to compare with, not a value of the line.
      const dot = node("circle", { cx: xFor(effort.ms), cy: yFor(effort.ftp), r: 3.5, class: "fitness-ftp-dot", style: `stroke: ${line.color}` });
      dot.append(node("title", {}, `${dayText(dayKey(effort.ms, zone))} · ${effort.entry.name ?? ""}: 95 % ${t("fitnessBest20")} = ${Math.round(effort.ftp)} W`));
      dot.addEventListener("click", () => openActivity(effort.entry));
      children.push(dot);
    }
    // A filled diamond on the line where the FTP changes, under the day's tick.
    for (const change of line.changes) {
      const x = xFor(change.ms);
      const y = yFor(change.ftp);
      const mark = node("path", { d: `M${x.toFixed(1)},${(y - 5).toFixed(1)}l5,5l-5,5l-5,-5z`, class: `fitness-ftp-change${change.entry ? " is-link" : ""}`, style: `fill: ${line.color}` });
      mark.append(node("title", {}, `${dayText(dayKey(change.ms, zone))}: ${ftpChangeText(change)}`));
      if (change.entry) mark.addEventListener("click", () => openActivity(change.entry));
      children.push(mark);
    }
  }
  const guide = node("g");
  children.push(guide);
  view.ftpLayout = { lines, settings, start, end, noonOf, axisStart, axisEnd, xFor, margin, width, height, guide };
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.style.height = `${height}px`;
  chart.replaceChildren(...children);
}

// The day under the pointer: the FTP of each sport then, and the effort nearest within a few pixels.
function showFtpTooltip(event) {
  const layout = view.ftpLayout;
  const tooltip = byId("fitnessFtpTooltip");
  if (!layout) return;
  const box = byId("fitnessFtpChart").getBoundingClientRect();
  const x = ((event.clientX - box.left) / box.width) * layout.width;
  const plotWidth = layout.width - layout.margin.left - layout.margin.right;
  // Snapped to the day under the pointer, its guide at the day's noon like the ticks and dots.
  const ms = layout.noonOf(Math.min(layout.end, Math.max(layout.start, layout.axisStart + ((x - layout.margin.left) / plotWidth) * (layout.axisEnd - layout.axisStart))));
  const at = layout.xFor(ms);
  layout.guide.replaceChildren(node("line", { x1: at, x2: at, y1: layout.margin.top, y2: layout.height - layout.margin.bottom, class: "fitness-guide" }));
  const rows = [node("div", { class: "diary-tooltip-when" }, dayText(dayKey(ms, zone), { weekday: "long", day: "numeric", month: "numeric", year: "numeric" }))];
  const several = layout.lines.length > 1;
  for (const line of layout.lines) {
    const swatch = () => {
      const element = node("span", { class: "fitness-swatch" });
      element.style.background = line.color;
      return element;
    };
    const ftp = ftpOn(layout.settings, line.sport, Math.min(layout.end, ms + 43_199_999));
    if (ftp) {
      const row = node("div", { class: "diary-tooltip-row" });
      row.append(swatch(), node("span", {}, several ? `FTP · ${sportLabel(line.sport)}` : "FTP"), node("strong", {}, `${Math.round(ftp)} W`));
      rows.push(row);
    }
    const change = line.changes.find((item) => item.ms === ms);
    if (change) {
      const row = node("div", { class: "diary-tooltip-row" });
      row.append(swatch(), node("span", {}, ftpChangeSource(change)), node("strong", {}, `${Math.round(change.before)} → ${Math.round(change.ftp)} W`));
      rows.push(row);
    }
    const near = line.efforts.filter((effort) => effort.ms === ms).at(-1);
    if (near) {
      const row = node("div", { class: "diary-tooltip-row" });
      row.append(swatch(), node("span", {}, `${near.entry.name ?? ""} ${dayText(dayKey(near.ms, zone))} · 95 % ${t("fitnessBest20")}`), node("strong", {}, `${Math.round(near.ftp)} W`));
      rows.push(row);
    }
  }
  tooltip.replaceChildren(...rows);
  tooltip.hidden = false;
  const card = tooltip.offsetParent.getBoundingClientRect();
  const left = (at / layout.width) * box.width + box.left - card.left;
  const right = left + 14;
  tooltip.style.left = `${Math.max(8, right + tooltip.offsetWidth > card.width - 8 ? left - tooltip.offsetWidth - 14 : right)}px`;
  tooltip.style.top = `${box.top - card.top + 12}px`;
}

// A chart's tooltip by mouse or by touch: a tap shows the day, a sideways drag moves along the days
// (the page still scrolls up and down), and the tooltip stays after the finger lifts until a tap elsewhere.
function hoverable(chart, show, hide) {
  chart.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") show(event);
  });
  chart.addEventListener("pointermove", show);
  chart.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") hide();
  });
  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" && !chart.contains(event.target)) hide();
  });
}

// Where a new FTP comes from, as words.
function ftpChangeSource(change) {
  if (change.method === "manual") return t("fitnessFtpManual");
  const how = t(change.method === "cp" ? "fitnessFtpByCp" : "fitnessFtpBy20");
  return change.entry?.name ? `${how} · ${change.entry.name}` : how;
}

const ftpChangeText = (change) => `${Math.round(change.before)} → ${Math.round(change.ftp)} W · ${ftpChangeSource(change)}`;

function hideFtpTooltip() {
  byId("fitnessFtpTooltip").hidden = true;
  view.ftpLayout?.guide.replaceChildren();
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
  renderSuggestions(settings);
  renderTiles(history, settings);
  renderLoadChart(history);
  const current = inRange(shown);
  renderZones(current, settings);
  renderCurve(current, inRange(shown, 1));
  renderDecoupling(current, settings);
  renderFtpChart(settings);
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
  hoverable(chart, showLoadTooltip, hideLoadTooltip);
  hoverable(byId("fitnessFtpChart"), showFtpTooltip, hideFtpTooltip);
  let width = 0;
  new ResizeObserver(([item]) => {
    const next = Math.round(item.contentRect.width);
    if (next && next !== width && !byId("fitnessView").hidden && view.entries.length) {
      width = next;
      render();
    }
  }).observe(byId("fitnessView"));
}
