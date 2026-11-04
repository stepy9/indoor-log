import { activityLoad, estimateMaxHeartRate, ftpOn, ftpSourceOn, ftpSuggestion, curveDurations, decoupling, fatigueDays, fitnessDays, forSport, formState, freshInDays, goalForecast, goalPlan, weightOn, heartRateZones, loadHistory, powerCurve, powerZones, timeInZones } from "../fitness.js";
import { bestTime, effortDistances, workoutKind } from "../analysis.js";
import { longestByWeek, nextStep, trainingDays, weekChecklist, weekPlan } from "../plan.js";
import { axisTicks } from "../dates.js";
import { addFtpRecord, currentFtp, dismiss, dismissed, openSettings, perKgText, setByHand, setMaxHeartRate, settingsFor, typedMaxHeartRate } from "./settings.js";
import { addDays, dayKey } from "../diary.js";
import { listEntries } from "../library.js";
import { renderLimited } from "./more.js";
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

// The goals of the sports shown, each with its plan from the load the page shows, nearest first.
// The form aimed at is fresh (+15), or above 0 when the fitness is too low for that, as in the Fresh tile.
function shownGoals(history, settings) {
  const level = freshInDays(history, 15) ? 15 : 0;
  const shown = view.sport === "all" ? sports.filter((sport) => view.entries.some((entry) => entry.sport === sport)) : [view.sport];
  return shown.map((sport) => {
    const goal = settings.sports[sport]?.goal;
    const plan = goal?.day ? goalPlan(history, goal.day, level) : null;
    return plan && { sport, goal, plan, level };
  }).filter(Boolean).sort((a, b) => a.goal.day.localeCompare(b.goal.day));
}

// The next step for one sport, the one shown or, with all of them, the one trained most in the last four weeks:
// the distance of the longer workout to pick a video by, the usual one, the week's distance and the intervals.
// The plan for one sport from the library: the one given or, with all, the one trained most in the last four
// weeks; with the next seven days laid out on its training days. Shared with the diary's calendar.
// { sport, plan, days: [{ day, type }] } or null without enough to go on.
export function trainingPlan(entries, chosen = "all") {
  const since = Date.now() - 28 * 86_400_000;
  const counts = new Map();
  for (const entry of entries) if (entry.startMs >= since) counts.set(entry.sport, (counts.get(entry.sport) ?? 0) + 1);
  const sport = chosen !== "all" ? chosen : [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!sport) return null;
  const settings = settingsFor(entries);
  const history = loadHistory(entries.filter((entry) => chosen === "all" || entry.sport === chosen), settings, zone, today());
  const last = history.at(-1);
  const workouts = entries.filter((entry) => entry.sport === sport).map((entry) => {
    const zones = timeInZones([entry], "heartRate", settings);
    const total = zones.reduce((sum, value) => sum + value, 0);
    return {
      day: dayKey(entry.startMs, zone),
      km: (entry.summary?.distance ?? 0) / 1000,
      seconds: entry.summary?.timerSeconds ?? 0,
      kind: workoutKind(entry),
      decoupling: decoupling(entry)?.percent ?? null,
      hardShare: total ? (zones[3] + zones[4]) / total : null,
    };
  });
  const plan = last ? nextStep({ workouts, form: last.fitness - last.fatigue, ramp: last.fitness - (history.at(-8)?.fitness ?? last.fitness), ftp: currentFtp(settings, sport), today: today() }) : null;
  if (!plan) return null;
  const weekdays = trainingDays(workouts, today(), settings.sports[sport]?.trainingDays);
  return { sport, plan, weekdays, chosenDays: Boolean(settings.sports[sport]?.trainingDays?.length), days: weekPlan(plan, workouts, today(), weekdays), checklist: weekChecklist(plan, workouts, today(), weekdays), longest: longestByWeek(workouts, today()) };
}

function renderNextStep() {
  const card = byId("fitnessNext");
  const result = trainingPlan(view.entries, view.sport);
  card.hidden = !result;
  if (!result) return;
  const { sport, plan } = result;
  const km = (value) => displayNumber(value, value % 1 ? 1 : 0);
  const watts = (range) => (range ? ` · ${range[0]}–${range[1]} W` : "");
  const line = (title, text, className = "") => {
    const row = node("div", { class: `fitness-next-row ${className}` });
    row.append(node("strong", {}, title), node("span", {}, text));
    return row;
  };
  const rows = [];
  // The longer workout, or the note that this week's is done.
  rows.push(plan.doneLong
    ? line(t("nextLong"), t("nextLongDone", { km: km(plan.long.fromKm) }), "is-done")
    : line(t("nextLong"), t("nextLongText", { from: km(plan.long.fromKm), to: km(plan.long.toKm), minutes: plan.long.minutes })));
  rows.push(line(t("nextUsual"), t("nextUsualText", { km: km(plan.usual.km), minutes: plan.usual.minutes }) + watts(plan.steadyWatts)));
  if (plan.weekKm) rows.push(line(t("nextWeek"), t("nextWeekText", { target: km(plan.weekKm), done: km(plan.thisWeekKm), last: km(plan.lastWeekKm) })));
  rows.push(plan.intervals.due
    ? line(t("nextIntervals"), t("nextIntervalsText", { repeats: plan.intervals.repeats, minutes: plan.intervals.minutes, rest: plan.intervals.rest }) + watts(plan.intervals.watts))
    : line(t("nextIntervals"), t(plan.holds.includes("tired") ? "nextIntervalsRest" : "nextIntervalsDone", { done: plan.intervals.done }), "is-done"));
  // Why it holds back, or that this is a lighter week.
  const notes = [
    ...(plan.lighter ? [t("nextLighter")] : []),
    ...plan.holds.map((hold) => t(`nextHold_${hold}`)),
    ...(plan.tooHard ? [t("nextTooHard")] : []),
  ];
  const head = node("div", { class: "panel-title-row" });
  head.append(node("span", { class: "field-label" }, `${t("nextTitle")} · ${sportLabel(sport)}`));
  card.replaceChildren(head, ...rows, ...notes.map((text) => node("p", { class: "field-note fitness-next-note" }, text)), node("p", { class: "field-note" }, t("nextNote")));
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
  // When a rest would make the form fresh, for planning a race or an FTP test.
  // With little fitness the form cannot reach +15, so then the day it turns positive.
  const level = freshInDays(history, 15) ? 15 : 0;
  const freshIn = freshInDays(history, level);
  // Each shown sport's goal from the settings: from when to rest for a fresh form on its day, by the same
  // level, from the load the page shows (that sport's, or all the sports' together).
  const goals = shownGoals(history, settings);
  for (const { sport, goal, plan } of goals) {
    const form = `${plan.form >= 0 ? "+" : ""}${displayNumber(plan.form, Math.abs(plan.form) < 10 ? 1 : 0)}`;
    const restNow = plan.restFrom && plan.restFrom <= addDays(last.day, 1);
    const note = !plan.restFrom ? t("fitnessGoalShort", { days: plan.days, form })
      : restNow ? t("fitnessGoalRestNow", { days: plan.days, form })
      : t("fitnessGoalRestFrom", { days: plan.days, level: level ? "+15" : "0", from: dayText(plan.restFrom, { weekday: "short", day: "numeric", month: "numeric" }) });
    const title = [goal.name || t("fitnessGoal"), ...(view.sport === "all" && goals.length > 1 ? [sportLabel(sport)] : [])].join(" · ");
    tiles.push(tile(title, dayText(goal.day, { weekday: "short", day: "numeric", month: "numeric" }), note));
  }
  if (last && freshIn) tiles.push(tile(t("fitnessFreshOn"), dayText(addDays(last.day, freshIn), { weekday: "short", day: "numeric", month: "numeric" }), t(freshIn === 1 ? "fitnessFreshTomorrow" : "fitnessFreshIn", { days: freshIn, level: level ? "+15" : "0" })));
  const shownSports = view.sport === "all" ? sports.filter((sport) => view.entries.some((entry) => entry.sport === sport)) : [view.sport];
  for (const sport of shownSports) {
    const ftp = currentFtp(settings, sport);
    const weight = weightOn(settings, Date.now());
    const perKg = weight ? ` · ${displayNumber(ftp / weight, 2)} W/kg` : "";
    if (ftp) tiles.push(tile(`FTP · ${sportLabel(sport)}`, `${displayNumber(ftp)} W`, `${setByHand(sport, "ftp") ? t("fitnessSetByHand") : t("fitnessEstimated")}${perKg}`));
  }
  byId("fitnessTiles").replaceChildren(...tiles);
}

// The date axis of a chart by days: ticks as dense as fit at least 64 px apart (each day, every other day, weeks
// from Monday, or months), the last day always closing it, each with a faint vertical grid line.
// xForKey places a day ("YYYY-MM-DD") at its centre.
function dateTicks(firstKey, lastKey, xForKey, { margin, width, height }) {
  const ticks = axisTicks(firstKey, lastKey, xForKey).map((tick, index) => ({
    ...tick,
    label: tick.kind === "month"
      ? dayText(tick.key, { month: "short", ...(tick.key.slice(5, 7) === "01" || !index ? { year: "numeric" } : {}) })
      : dayText(tick.key, { day: "numeric", month: "short", ...(tick.kind === "last" && tick.spacing > 14 ? { year: "numeric" } : {}) }),
  }));
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
// With a goal ahead the chart goes on past today to its day, dashed, by the goal's plan.
function renderLoadChart(history, settings) {
  const chart = byId("fitnessLoadChart");
  const past = Number.isFinite(ranges[view.range]) ? history.slice(-ranges[view.range]) : history;
  const next = shownGoals(history, settings)[0];
  const ahead = next ? goalForecast(history, next.goal.day, next.plan.restFrom) : [];
  const days = [...past, ...ahead];
  byId("fitnessLoadEmpty").hidden = days.length > 0;
  chart.hidden = !days.length;
  view.layout = null;
  if (!days.length) return;
  const width = Math.max(320, Math.round(chart.parentElement.getBoundingClientRect().width) || 1000);
  const height = 300;
  const margin = { left: 44, right: 12, top: ahead.length ? 24 : 14, bottom: 26 };
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
    if (day.load > 0) children.push(node("rect", { x: xFor(index) - barWidth / 2, y: yFor(day.load), width: barWidth, height: yFor(0) - yFor(day.load), class: `fitness-load-bar${day.projected ? " is-planned" : ""}` }));
  });
  // The past solid; the plan dashed from today on, joined to it.
  const path = (field, from, to) => days.slice(from, to).map((day, index) => `${index ? "L" : "M"}${xFor(from + index).toFixed(1)},${yFor(day[field]).toFixed(1)}`).join("");
  for (const [field, className] of [["form", "is-form"], ["fatigue", "is-fatigue"], ["fitness", "is-fitness"]]) {
    children.push(node("path", { class: `fitness-line ${className}`, d: path(field, 0, past.length) }));
    if (ahead.length) children.push(node("path", { class: `fitness-line ${className} is-ahead`, d: path(field, past.length - 1, days.length) }));
  }
  if (ahead.length) {
    // Today, where the plan starts, and the goal day with its name.
    const today = xFor(past.length - 1);
    const goal = xFor(days.length - 1);
    children.push(
      node("line", { x1: today, x2: today, y1: margin.top, y2: margin.top + plotHeight, class: "fitness-today" }),
      node("line", { x1: goal, x2: goal, y1: margin.top, y2: margin.top + plotHeight, class: "fitness-goal" }),
      // The goal named above the plot, clear of the lines and the band label.
      node("text", { x: goal, y: margin.top - 6, class: "fitness-goal-label" }, next.goal.name || t("fitnessGoal")),
    );
    if (next.plan.restFrom && indexOf.has(next.plan.restFrom)) {
      const rest = xFor(indexOf.get(next.plan.restFrom)) - plotWidth / days.length / 2;
      // Rest named right of its line, or left of it when the goal is too close for the word.
      const left = goal - rest < 44;
      children.push(node("text", { x: left ? rest - 4 : rest + 4, y: margin.top + plotHeight - 6, class: `fitness-goal-label is-rest${left ? " is-left" : ""}` }, t("fitnessRestFrom")));
      children.push(node("line", { x1: rest, x2: rest, y1: margin.top, y2: margin.top + plotHeight, class: "fitness-today" }));
    }
  }
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
    node("div", { class: "diary-tooltip-when" }, `${dayText(day.day, { weekday: "long", day: "numeric", month: "numeric", year: "numeric" })}${day.projected ? ` · ${t("fitnessPlanned")}` : ""}`),
    row(t("fitnessLoad"), displayNumber(day.load), "is-load"),
    row(t("fitnessFitness"), displayNumber(day.fitness), "is-fitness"),
    row(t("fitnessFatigue"), displayNumber(day.fatigue), "is-fatigue"),
    // A form that rounds to nothing reads 0, not −0.
    row(t("fitnessFormNext"), Math.abs(form) < 0.5 ? "0" : `${form > 0 ? "+" : ""}${displayNumber(form)}`, "is-form"),
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
function renderCurve(current, previous, earlier, settings) {
  const chart = byId("fitnessCurve");
  const curve = powerCurve(current);
  const before = Number.isFinite(ranges[view.range]) ? powerCurve(previous) : [];
  // Personal records: durations where the range beats everything before it (only when there is something before).
  const allTime = Number.isFinite(ranges[view.range]) ? powerCurve(earlier) : [];
  for (const point of curve) {
    const old = allTime.find((item) => item.duration === point.duration)?.value;
    point.record = point.value != null && old != null && point.value > old;
  }
  const has = curve.some((point) => point.value != null);
  byId("fitnessCurveEmpty").hidden = has;
  chart.hidden = !has;
  byId("fitnessCurveLegend").hidden = !has || !before.some((point) => point.value != null);
  renderCurveTable(curve, before, settings);
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
    const dot = node("circle", { cx: xFor(point.duration), cy: yFor(point.value), r: point.record ? 6 : 4.5, class: `fitness-curve-dot${point.record ? " is-record" : ""}` });
    const title = node("title", {}, `${durationText(point.duration)}: ${point.value} W${point.record ? ` · ${t("fitnessRecord")}` : ""} · ${point.entry.name ?? ""} ${dayText(dayKey(point.entry.startMs, zone))}`);
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

function renderCurveTable(curve, before, settings) {
  // Each best in W/kg by the weight on the day it was ridden.
  const weighed = (settings.weightHistory ?? []).length > 0;
  const table = byId("fitnessCurveTable");
  const shown = curve.filter((point) => point.value != null);
  table.hidden = !shown.length;
  const head = node("tr");
  const hasBefore = before.some((point) => point.value != null);
  head.append(...[t("fitnessDuration"), t("fitnessBestPower"), ...(weighed ? ["W/kg"] : []), ...(hasBefore ? [t("fitnessPrevious"), t("trendChange")] : []), t("fitnessFrom")].map((label) => node("th", {}, label)));
  const rows = shown.map((point) => {
    const row = node("tr");
    const old = before.find((item) => item.duration === point.duration)?.value;
    const change = old ? ((point.value - old) / old) * 100 : null;
    const changeCell = node("td", { class: change > 0 ? "is-better" : change < 0 ? "is-worse" : "" }, change == null ? "—" : `${change >= 0 ? "+" : ""}${displayNumber(change, 1)} %`);
    const link = node("button", { type: "button", class: "link-button" }, `${point.entry.name ?? ""} · ${dayText(dayKey(point.entry.startMs, zone))}`);
    link.addEventListener("click", () => openActivity(point.entry));
    const from = node("td");
    from.append(link);
    const best = node("td", {}, `${point.value} W`);
    if (point.record) best.append(" ", node("span", { class: "fitness-record" }, t("fitnessRecord")));
    row.append(node("td", {}, durationText(point.duration)), best, ...(weighed ? [node("td", {}, ((kg) => (kg ? displayNumber(point.value / kg, 2) : "—"))(weightOn(settings, point.entry.startMs)))] : []), ...(hasBefore ? [node("td", {}, old ? `${old} W` : "—"), changeCell] : []), from);
    return row;
  });
  table.replaceChildren(node("thead"), node("tbody"));
  table.tHead.append(head);
  table.tBodies[0].append(...rows);
}

// Week by week from Monday, the latest on top: workouts, time, distance and load (with a bar to compare),
// and how much the fitness rose or fell over the week, coloured when it climbs too fast.
// With a weekly time (or, for one sport, distance) set for the sports shown, each week tells how much of it was done, the running one what is left.
// A week's share of its time target, the running week with what is left: done in green, short of half in red.
// format writes what is left: a time or a distance.
function targetCell(done, target, running, format) {
  const share = (done / target) * 100;
  const left = target - done;
  const text = `${displayNumber(share)} %${running && left > 0 ? ` · ${t("fitnessTargetLeft", { time: format(left) })}` : ""}`;
  return node("td", { class: share >= 100 ? "is-better" : !running && share < 50 ? "is-worse" : "" }, text);
}

function renderWeeks(history, entries, settings) {
  const shownSports = view.sport === "all" ? sports : [view.sport];
  const target = shownSports.reduce((sum, sport) => sum + (settings.sports[sport]?.weeklyHours ?? 0) * 3600, 0);
  // A distance target only for one sport: kilometres rowed and ridden do not add up to one aim.
  const targetKm = view.sport === "all" ? 0 : settings.sports[view.sport]?.weeklyKm ?? 0;
  const km = (meters) => `${displayNumber(meters / 1000, 1)} km`;
  const table = byId("fitnessWeeks");
  const days = Number.isFinite(ranges[view.range]) ? history.slice(-ranges[view.range]) : history;
  const mondayOf = (key) => addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));
  const weeks = new Map();
  const weekOf = (monday) => weeks.get(monday) ?? weeks.set(monday, { monday, workouts: 0, seconds: 0, meters: 0, load: 0, fitness: null }).get(monday);
  for (const day of days) {
    const week = weekOf(mondayOf(day.day));
    week.load += day.load;
    week.fitness = day.fitness;
  }
  for (const entry of entries) {
    const monday = mondayOf(dayKey(entry.startMs, zone));
    if (!weeks.has(monday)) continue;
    const week = weeks.get(monday);
    week.workouts += 1;
    week.seconds += entry.summary?.timerSeconds ?? 0;
    week.meters += entry.summary?.distance ?? 0;
  }
  // The fitness the week started from: the day before its Monday.
  const fitnessBefore = (monday) => history.find((day) => day.day === addDays(monday, -1))?.fitness ?? null;
  const list = [...weeks.values()].reverse();
  byId("fitnessWeeksEmpty").hidden = list.length > 0;
  table.hidden = !list.length;
  const highest = Math.max(1, ...list.map((week) => week.load));
  const head = node("tr");
  head.append(...[t("fitnessWeek"), t("fitnessWorkouts"), t("lapTime"), ...(target ? [t("fitnessOfTarget", { target: formatDuration(target) })] : []), t("fitnessDistance"), ...(targetKm ? [t("fitnessOfTarget", { target: km(targetKm * 1000) })] : []), t("fitnessLoad"), t("fitnessRamp")].map((label) => node("th", {}, label)));
  const thisMonday = mondayOf(today());
  const rows = list.map((week) => {
    const row = node("tr");
    const sunday = addDays(week.monday, 6);
    const when = `${dayText(week.monday, { day: "numeric", month: "numeric" })} – ${dayText(sunday, { day: "numeric", month: "numeric" })}${week.monday === thisMonday ? ` (${t("fitnessWeekRunning")})` : ""}`;
    const loadCell = node("td");
    const loadBox = node("div", { class: "fitness-week-load" });
    const track = node("div", { class: "fitness-zone-track" });
    const fill = node("div", { class: "fitness-zone-fill" });
    fill.style.width = `${(week.load / highest) * 100}%`;
    fill.style.background = "var(--compare-1)";
    track.append(fill);
    loadBox.append(node("span", {}, displayNumber(week.load)), track);
    loadCell.append(loadBox);
    const before = fitnessBefore(week.monday);
    const ramp = before == null || week.fitness == null ? null : week.fitness - before;
    const rampClass = ramp == null ? "" : ramp > 8 ? "is-worse" : ramp > 5 ? "is-middle" : "";
    row.append(
      node("td", {}, when),
      node("td", {}, String(week.workouts)),
      node("td", {}, week.seconds ? formatDuration(week.seconds) : "—"),
      ...(target ? [targetCell(week.seconds, target, week.monday === thisMonday, formatDuration)] : []),
      node("td", {}, week.meters ? `${displayNumber(week.meters / 1000, 1)} km` : "—"),
      ...(targetKm ? [targetCell(week.meters, targetKm * 1000, week.monday === thisMonday, km)] : []),
      loadCell,
      node("td", { class: rampClass }, ramp == null ? "—" : Math.abs(ramp) < 0.05 ? "±0" : `${ramp > 0 ? "+" : ""}${displayNumber(ramp, 1)}`),
    );
    return row;
  });
  table.replaceChildren(node("thead"), node("tbody"));
  table.tHead.append(head);
  renderLimited(table.tBodies[0], rows, "fitness:weeks", { step: 12 });
}

// The efficiency factor of each steady workout over the range as dots, with a least-squares trend line.
// Power and speed do not share a scale, so the one with more workouts is shown.
function renderEfficiency(entries) {
  const chart = byId("fitnessEfficiencyChart");
  const all = entries.map((entry) => ({ entry, result: decoupling(entry) })).filter((item) => item.result?.efficiency > 0);
  const by = all.filter((item) => item.result.by === "power").length >= all.filter((item) => item.result.by === "speed").length ? "power" : "speed";
  const points = all.filter((item) => item.result.by === by).map((item) => ({ entry: item.entry, ms: item.entry.startMs, value: item.result.efficiency })).sort((a, b) => a.ms - b.ms);
  const has = points.length > 0;
  chart.hidden = !has;
  byId("fitnessEfficiencyEmpty").hidden = has;
  byId("fitnessEfficiencySummary").textContent = "";
  if (!has) return;
  const unit = by === "power" ? `W ${t("fitnessPerBeat")}` : `m/min ${t("fitnessPerBeat")}`;
  const width = Math.max(300, Math.round(chart.parentElement.getBoundingClientRect().width) || 600);
  const height = 200;
  const margin = { left: 48, right: 14, top: 14, bottom: 26 };
  const days = ranges[view.range];
  const lastKey = today();
  const firstKey = Number.isFinite(days) ? addDays(lastKey, 1 - days) : dayKey(points[0].ms, zone);
  const noonOf = (key) => Date.parse(`${key}T12:00:00Z`);
  const axisStart = noonOf(firstKey) - 43_200_000;
  const axisEnd = noonOf(lastKey) + 43_200_000;
  const xFor = (ms) => margin.left + ((ms - axisStart) / (axisEnd - axisStart)) * (width - margin.left - margin.right);
  const values = points.map((point) => point.value);
  const spread = Math.max(...values) - Math.min(...values) || Math.max(...values) * 0.1;
  const minY = Math.max(0, Math.min(...values) - spread * 0.25);
  const maxY = Math.max(...values) + spread * 0.25;
  const yFor = (value) => margin.top + ((maxY - value) / (maxY - minY)) * (height - margin.top - margin.bottom);
  // Enough decimals for the grid step, so no two labels read the same.
  const digits = Math.min(3, Math.max(0, Math.ceil(-Math.log10((maxY - minY) / 4)) + 1));
  const children = [];
  for (let index = 0; index <= 4; index += 1) {
    const value = minY + ((maxY - minY) * index) / 4;
    children.push(node("line", { x1: margin.left, x2: width - margin.right, y1: yFor(value), y2: yFor(value), class: index ? "diary-grid" : "diary-axis" }));
    children.push(node("text", { x: margin.left - 8, y: yFor(value) + 4, class: "diary-axis-label" }, displayNumber(value, digits)));
  }
  children.push(...dateTicks(firstKey, lastKey, (key) => xFor(noonOf(key)), { margin, width, height }));
  // The least-squares line, drawn between the first and the last workout.
  if (points.length >= 3) {
    const n = points.length;
    const meanX = points.reduce((sum, point) => sum + point.ms, 0) / n;
    const meanY = values.reduce((sum, value) => sum + value, 0) / n;
    const slope = points.reduce((sum, point) => sum + (point.ms - meanX) * (point.value - meanY), 0) / (points.reduce((sum, point) => sum + (point.ms - meanX) ** 2, 0) || 1);
    const at = (ms) => meanY + slope * (ms - meanX);
    const from = points[0].ms;
    const to = points.at(-1).ms;
    children.push(node("path", { class: "fitness-line is-trend", d: `M${xFor(from).toFixed(1)},${yFor(at(from)).toFixed(1)}L${xFor(to).toFixed(1)},${yFor(at(to)).toFixed(1)}` }));
    const change = ((at(to) - at(from)) / at(from)) * 100;
    byId("fitnessEfficiencySummary").textContent = t("fitnessEfficiencyTrend", { change: `${change >= 0 ? "+" : ""}${displayNumber(change, 1)}` });
  }
  for (const point of points) {
    const dot = node("circle", { cx: xFor(point.ms), cy: yFor(point.value), r: 4, class: "fitness-curve-dot" });
    dot.append(node("title", {}, `${dayText(dayKey(point.ms, zone))} · ${point.entry.name ?? ""}: ${displayNumber(point.value, digits)} ${unit}`));
    dot.addEventListener("click", () => openActivity(point.entry));
    children.push(dot);
  }
  chart.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chart.style.height = `${height}px`;
  chart.replaceChildren(...children);
}

// Personal records over the whole library of the sport shown, whatever the range: the best power for each
// duration and, for one sport, the fastest time for each distance; each with its workout, how long ago,
// and the W/kg by the weight on that day. A record from the last 30 days is marked new.
function renderRecords(entries) {
  const recent = Date.now() - 30 * 86_400_000;
  const ago = (ms) => {
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    return days < 1 ? t("fitnessToday") : days === 1 ? t("fitnessYesterday") : t("fitnessDaysAgo", { days });
  };
  const fromCell = (entry) => {
    const cell = node("td");
    const link = node("button", { type: "button", class: "link-button" }, `${entry.name ?? sportLabel(entry.sport)} · ${dayText(dayKey(entry.startMs, zone))}`);
    link.addEventListener("click", () => openActivity(entry));
    cell.append(link, node("span", { class: "field-note" }, ` · ${ago(entry.startMs)}`));
    return cell;
  };
  const valueCell = (text, ms) => {
    const cell = node("td", {}, text);
    if (ms >= recent) cell.append(" ", node("span", { class: "fitness-record" }, t("fitnessRecordNew")));
    return cell;
  };
  const fill = (table, head, rows) => {
    table.hidden = !rows.length;
    const header = node("tr");
    header.append(...head.map((label) => node("th", {}, label)));
    table.replaceChildren(node("thead"), node("tbody"));
    table.tHead.append(header);
    table.tBodies[0].append(...rows);
  };
  const power = powerCurve(entries).filter((point) => point.value != null);
  const weighed = power.some((point) => perKgText(point.value, point.entry.startMs));
  fill(byId("fitnessRecords"), [t("fitnessDuration"), t("fitnessBestPower"), ...(weighed ? ["W/kg"] : []), t("fitnessFrom")], power.map((point) => {
    const row = node("tr");
    row.append(node("td", {}, durationText(point.duration)), valueCell(`${point.value} W`, point.entry.startMs), ...(weighed ? [node("td", {}, perKgText(point.value, point.entry.startMs).replace(" W/kg", "") || "—")] : []), fromCell(point.entry));
    return row;
  }));
  // Times only for one sport: a kilometre rowed and one ridden are not the same record.
  const times = view.sport === "all" ? [] : (effortDistances[view.sport] ?? []).map((meters) => {
    let best = null;
    for (const entry of entries) {
      const seconds = bestTime(entry, meters);
      if (seconds != null && (!best || seconds < best.seconds)) best = { seconds, entry };
    }
    return best && { meters, ...best };
  }).filter(Boolean);
  const distanceLabel = (meters) => (meters >= 1000 ? `${displayNumber(meters / 1000, meters % 1000 ? 1 : 0)} km` : `${meters} m`);
  fill(byId("fitnessRecordTimes"), [t("fitnessDistance"), t("fitnessBestTime"), t("fitnessFrom")], times.map((item) => {
    const row = node("tr");
    row.append(node("td", {}, distanceLabel(item.meters)), valueCell(formatDuration(item.seconds), item.entry.startMs), fromCell(item.entry));
    return row;
  }));
  byId("fitnessRecordsEmpty").hidden = power.length > 0 || times.length > 0;
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
  renderLimited(table.tBodies[0], body, "fitness:decoupling", { step: 15 });
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
  renderNextStep();
  renderLoadChart(history, settings);
  const current = inRange(shown);
  renderWeeks(history, current, settings);
  renderZones(current, settings);
  const currentSet = new Set(current);
  renderCurve(current, inRange(shown, 1), shown.filter((entry) => !currentSet.has(entry)), settings);
  renderRecords(shown);
  renderEfficiency(current);
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
