import { workoutKind, workoutKinds } from "../analysis.js";
import { addDays, calendarDays, dayKey, weekNumber, inPeriod, periodBuckets, periodRange, periodsWith, previousRange, shiftPeriod, totals } from "../diary.js";
import { listEntries } from "../library.js";
import { aerobicEffect, benefitGroup, benefitGroups, benefits, focusAdvice, focusTargets, primaryBenefit, trainingFocus, withCleanHeartRate } from "../fitness.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";
import { kindLabel } from "./library.js";
import { steadyGuide, trainingPlan, zoneGroups } from "./fitness.js";
import { settingsFor } from "./settings.js";
import { infoHint } from "./info.js";
import { anyTraining, hasTraining, scoreFor } from "./score.js";
import { excuses, excuseText, openExcuse } from "./excuse.js";

// A workout's score as a small coloured number: green from 80, amber from 50, red below.
export function scoreBadge(score, title = "") {
  const badge = Object.assign(document.createElement("span"), { className: `score-badge is-${score >= 80 ? "good" : score >= 50 ? "fair" : "poor"}`, textContent: String(score) });
  badge.title = title || t("scoreTitle", { score });
  return badge;
}


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
  // What the chart's bars add up: "distance", "seconds" or "calories".
  barMetric: ["seconds", "calories"].includes(remembered.barMetric) ? remembered.barMetric : "distance",
  // What the period is set against: "previous", "lastYear" (a week or a month only) or "pick", the period picked by hand.
  basis: ["lastYear", "pick"].includes(remembered.basis) ? remembered.basis : "previous",
  // While the period runs, the other one counts "whole" or only as many days as have gone by ("same").
  span: remembered.span === "same" ? "same" : "whole",
  // A day of the period picked by hand, kept per period type.
  picked: {},
  // The week's plan above the calendar, on unless turned off.
  showPlan: remembered.showPlan !== false,
};

// This week's plan in the diary, until a sport has the Training section filled in: then it lives in the
// Training tab alone, and so does its switch.
function renderPlan() {
  const card = byId("diaryPlan");
  const inTraining = anyTraining(settingsFor(view.entries));
  byId("diaryShowPlan").closest("label").hidden = inTraining;
  byId("diaryShowPlan").checked = view.showPlan;
  const result = view.showPlan && !inTraining ? trainingPlan(view.entries, view.sport) : null;
  card.hidden = !result?.checklist.length;
  if (!card.hidden) drawPlanCard(card, result);
}

// What a planned day asks for, in words: the workout, its length and how to ride it.
export function plannedText(plan, sport, type, { detail = false } = {}) {
  return plannedWords(plan, sport, type, detail) + kinomapPart(plan, type);
}

// The Kinomap workout for the day: its name, or for intervals none made yet, the name to give one.
function kinomapPart(plan, type) {
  const picked = plan.kinomap;
  if (!picked || !(type === "intervals" || type.startsWith("ftpTest"))) return "";
  const name = picked[type];
  if (name) return ` · ${t("planKinomap", { name })}`;
  return type === "intervals" ? ` · ${t("planKinomapMissing", { name: `Intervaly ${picked.wanted}` })}` : "";
}

function plannedWords(plan, sport, type, detail) {
  if (type === "off") return t("planOff");
  if (detail && type.startsWith("ftpTest")) return t(`plan${type[0].toUpperCase()}${type.slice(1)}Detail`);
  const km = (value) => displayNumber(value, value % 1 ? 1 : 0);
  const watts = (range) => (range ? ` · ${range[0]}–${range[1]} W` : "");
  // The trainer's resistance, a level or a range of them.
  const level = (value) => (value == null ? "" : ` · ${t("planLevel", { level: Array.isArray(value) ? (value[0] === value[1] ? value[0] : `${value[0]}–${value[1]}`) : value })}`);
  const steady = steadyGuide(plan, sport);
  return type === "ftpTestShort" ? t("planFtpTestShort")
    : type === "ftpTest" ? t("planFtpTest")
    : type === "long" ? t("planLong", { from: km(plan.long.fromKm), to: km(plan.long.toKm), minutes: plan.long.minutes }) + steady
    : type === "intervals" ? t(`planIntervalsKind_${plan.intervals.kind}`) + t("planIntervals", { repeats: plan.intervals.repeats, minutes: plan.intervals.minutes, rest: plan.intervals.rest }) + watts(plan.intervals.watts) + level(plan.levels?.intervals)
    : t("planUsual", { km: km(plan.usual.km), minutes: plan.usual.minutes }) + steady;
}

// This week's plan as a checklist: each training day marked done by its workouts (with their scores when given),
// missed, or what is planned; beside it the week's distance and the longest workouts.
export function drawPlanCard(card, result, { scores = null, withNextStep = false, excused = null, onExcuse = null } = {}) {
  const { plan, checklist, sport, chosenDays, longest } = result;
  const today = dayKey(Date.now(), zone);
  const km = (value) => displayNumber(value, value % 1 ? 1 : 0);
  const planned = (type) => plannedText(plan, sport, type);
  const rows = checklist.map((item) => {
    const row = Object.assign(document.createElement("div"), { className: `diary-plan-row is-${item.status}${item.day === today ? " is-today" : ""}` });
    // A mark, not a checkbox: the app marks a day by the workouts in the library.
    const mark = Object.assign(document.createElement("span"), { className: "diary-plan-mark", textContent: { done: "✓", missed: "–", planned: "" }[item.status] });
    mark.setAttribute("aria-label", t(`planStatus_${item.status}`));
    const when = Object.assign(document.createElement("span"), { className: "diary-plan-day", textContent: format(item.day, { weekday: "short", day: "numeric", month: "numeric" }) });
    const excuse = item.status !== "done" ? excused?.[item.day] : null;
    if (excuse) {
      row.classList.add("is-excused");
      mark.textContent = "–";
    }
    const text = item.status === "done"
      ? item.workouts.map((workout) => `${km(Math.round(workout.km * 10) / 10)} km · ${kindLabel(workout.kind, sport)}`).join(", ")
      : excuse ? excuseText(excuse) : item.status === "missed" ? t("planMissed") : planned(item.type);
    row.append(mark, when);
    // The scores in a column of their own after the day, empty on the days not ridden, so the text lines up.
    if (scores) {
      const cell = Object.assign(document.createElement("span"), { className: "diary-plan-score" });
      cell.append(...(scores[item.day] ?? []).map((score) => scoreBadge(score)));
      row.append(cell);
      row.classList.add("has-score");
    }
    row.append(Object.assign(document.createElement("span"), { className: "diary-plan-text", textContent: text }));
    // Why a day went unridden: to say on a day gone by or today, or ahead for a break known (a trip, an illness),
    // in a column of its own at the row's end, empty on the days ridden, so the links line up.
    if (onExcuse) {
      row.classList.add("has-why");
      const cell = Object.assign(document.createElement("span"), { className: "diary-plan-why-cell" });
      if (item.status !== "done") {
        const why = Object.assign(document.createElement("button"), { type: "button", className: "link-button diary-plan-why", textContent: excuse ? t("excuseEdit") : t(item.status === "missed" ? "excuseAsk" : "excuseSkip") });
        why.addEventListener("click", () => onExcuse(item.day));
        cell.append(why);
      }
      row.append(cell);
    }
    return row;
  });
  const head = Object.assign(document.createElement("div"), { className: "panel-title-row" });
  head.append(Object.assign(document.createElement("span"), { className: "field-label", textContent: `${t("planTitle")} · ${sportLabel(sport)}` }));
  const done = checklist.filter((item) => item.status === "done").reduce((sum, item) => sum + item.workouts.reduce((total, workout) => total + workout.km, 0), 0);
  // What the days ahead add, an interval workout counted as a usual one.
  const ahead = checklist.filter((item) => item.status === "planned").reduce((sum, item) => sum + (item.type === "long" ? plan.long.fromKm : ["ftpTestShort", "ftpTest", "off"].includes(item.type) ? 0 : plan.usual.km), 0);
  const list = Object.assign(document.createElement("div"), { className: "diary-plan-list" });
  list.append(...rows);
  if (plan.lighter) list.append(Object.assign(document.createElement("p"), { className: "field-note", textContent: t("planLighter") }));
  // How the training focus steers the week, as on the fitness page.
  // The least to ride on a day without the will: easy, for the habit.
  if (plan.minimal) list.append(Object.assign(document.createElement("p"), { className: "field-note", textContent: t("planMinimal", { minutes: plan.minimal.minutes }) }));
  if (plan.focus && !withNextStep) list.append(Object.assign(document.createElement("p"), { className: "field-note", textContent: t(`nextFocus_${plan.focus}`) }));
  const side = Object.assign(document.createElement("div"), { className: "diary-plan-side" });
  const body = Object.assign(document.createElement("div"), { className: "diary-plan-body" });
  body.append(list, side);
  card.replaceChildren(head, body, infoHint(`${t("planInfo")}\n${t(chosenDays ? "planDaysChosen" : "planDaysAuto")}`));
  // Drawn at the column's own width, so the text keeps its size.
  const width = Math.max(240, Math.round(side.getBoundingClientRect().width) || 320);
  side.append(weekBar(done, ahead, plan.weekKm, km, width), longestChart(longest, plan.long.fromKm, km, width));
}

// The week's distance as a bar: done solid, planned dashed, the target marked.
function weekBar(done, ahead, target, km, width) {
  const box = Object.assign(document.createElement("div"), { className: "diary-plan-figure" });
  const total = Math.max(target ?? 0, done + ahead, 0.1);
  const at = (value) => (value / total) * width;
  const svg = svgNode("svg", { viewBox: `0 0 ${width} 18`, class: "diary-plan-bar", role: "img", "aria-label": t("planWeek", { done: km(done), target: km(target ?? done + ahead) }) });
  svg.append(
    svgNode("rect", { x: 0, y: 3, width, height: 12, rx: 6, class: "diary-plan-track" }),
    svgNode("rect", { x: 0, y: 3, width: Math.max(0, at(done)), height: 12, rx: 6, class: "diary-plan-done" }),
    svgNode("rect", { x: at(done), y: 3, width: Math.max(0, at(ahead)), height: 12, class: "diary-plan-ahead" }),
  );
  if (target) svg.append(svgNode("line", { x1: at(target), x2: at(target), y1: 0, y2: 18, class: "diary-plan-target" }));
  const label = Object.assign(document.createElement("div"), { className: "diary-plan-figure-head" });
  label.append(
    Object.assign(document.createElement("span"), { className: "field-label", textContent: t("planWeekTitle") }),
    Object.assign(document.createElement("strong"), { textContent: target ? t("planWeek", { done: km(Math.round(done * 10) / 10), target: km(target) }) : `${km(Math.round(done * 10) / 10)} km` }),
  );
  const legend = Object.assign(document.createElement("div"), { className: "diary-plan-legend" });
  legend.append(...[["is-done", t("planLegendDone")], ["is-ahead", t("planLegendAhead", { km: km(Math.round(ahead * 10) / 10) })], ...(target ? [["is-target", t("planLegendTarget")]] : [])].map(([className, text]) => {
    const item = Object.assign(document.createElement("span"), { className: `diary-plan-key ${className}` });
    item.append(Object.assign(document.createElement("i"), {}), text);
    return item;
  }));
  box.append(label, svg, legend);
  return box;
}

// The longest steady workout of each of the last weeks as bars, this week's aim dashed after them.
function longestChart(weeks, aim, km, width) {
  const box = Object.assign(document.createElement("div"), { className: "diary-plan-figure" });
  const height = 130;
  const bottom = 18;
  const bars = [...weeks.slice(0, -1).map((week) => ({ ...week, aim: false })), { monday: weeks.at(-1).monday, km: Math.max(weeks.at(-1).km, 0), aim }];
  const top = Math.max(aim, ...bars.map((bar) => bar.km), 0.5) * 1.15;
  const slot = width / bars.length;
  const yFor = (value) => height - bottom - (value / top) * (height - bottom - 14);
  const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, class: "diary-plan-chart", role: "img", "aria-label": t("planLongestTitle") });
  bars.forEach((bar, index) => {
    const x = index * slot + slot * 0.2;
    const barWidth = slot * 0.6;
    const isNow = index === bars.length - 1;
    if (isNow) svg.append(svgNode("rect", { x, y: yFor(bar.aim), width: barWidth, height: yFor(0) - yFor(bar.aim), rx: 3, class: "diary-plan-aim" }));
    if (bar.km > 0) svg.append(svgNode("rect", { x, y: yFor(bar.km), width: barWidth, height: yFor(0) - yFor(bar.km), rx: 3, class: isNow ? "diary-plan-done" : "diary-plan-past" }));
    const value = isNow ? Math.max(bar.km, bar.aim) : bar.km;
    if (value > 0) svg.append(svgNode("text", { x: x + barWidth / 2, y: yFor(value) - 3, class: "diary-plan-value" }, km(Math.round(value * 10) / 10)));
    svg.append(svgNode("text", { x: x + barWidth / 2, y: height - 4, class: "diary-plan-week" }, isNow ? t("planThisWeek") : String(weekNumber(bar.monday))));
  });
  const label = Object.assign(document.createElement("div"), { className: "diary-plan-figure-head" });
  label.append(Object.assign(document.createElement("span"), { className: "field-label", textContent: t("planLongestTitle") }), Object.assign(document.createElement("span"), { className: "field-note", textContent: t("planLongestNote") }));
  box.append(label, svg);
  return box;
}

const basisFor = (period) => (period === "year" && view.basis === "lastYear" ? "previous" : view.basis);

// The period picked by hand, or else the latest before the one shown that has activities, or else the one before.
function pickedStart(range) {
  const kept = view.picked[view.period];
  if (kept) return kept;
  return periodsWith(view.period, shown(), zone).find((start) => start < range[0]) ?? shiftPeriod(view.period, range[0], -1);
}

// Opens an activity in the comparison; set by the app, which owns the switching between views.
let openActivity = () => {};

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const format = (key, options) => new Intl.DateTimeFormat(locale(), { timeZone: "UTC", ...options }).format(new Date(`${key}T12:00:00Z`));
// Each kind keeps its place in the categorical palette.
const kindColor = (kind) => `var(--compare-${workoutKinds.indexOf(kind) + 1})`;
const sportIcon = { rowing: "🚣", cycling: "🚴", running: "🏃" };
// Each reason for a day off by an icon, in the calendar.
const excuseIcons = { illness: "🤒", injury: "🩹", fatigue: "😴", work: "💼", travel: "✈️", family: "👪", time: "⏰", rest: "🛋️", other: "💬" };

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
const kcal = (value) => `${displayNumber(Math.round(value))} kcal`;
const hours = (seconds) => (seconds >= 3600 ? `${displayNumber(seconds / 3600, 1)} h` : `${Math.round(seconds / 60)} min`);

function periodTitle([from, to]) {
  if (view.period === "year") return from.slice(0, 4);
  if (view.period === "month") return format(from, { month: "long", year: "numeric" });
  return `${t("diaryWeekNumber", { week: weekNumber(from) })} · ${format(from, { day: "numeric", month: "numeric" })} – ${format(addDays(to, -1), { day: "numeric", month: "numeric", year: "numeric" })}`;
}

// The period's name without its dates, for a note that gives them anyway.
const shortTitle = (start) => (view.period === "week" ? t("diaryWeekNumber", { week: weekNumber(start) }) : periodTitle(periodRange(view.period, start)));

// The years to jump to: from the first activity, or this year, up to this year.
function jumpYears() {
  const thisYear = Number(dayKey(Date.now(), zone).slice(0, 4));
  const first = Math.min(thisYear, ...view.entries.map((entry) => Number(dayKey(entry.startMs, zone).slice(0, 4))));
  return Array.from({ length: thisYear - first + 1 }, (_, index) => thisYear - index);
}

// The jump list for the period shown: its year, and its month or week within that year.
// A year, then a month or a week of it: the lists of the jump under the title and of the period picked to compare with.
function fillPeriodPicker(yearSelect, partSelect, start) {
  const year = Number(start.slice(0, 4));
  const years = jumpYears();
  if (!years.includes(year)) years.push(year);
  yearSelect.replaceChildren(...years.sort((a, b) => b - a).map((value) => new Option(String(value), String(value))));
  yearSelect.value = String(year);
  if (view.period === "month") {
    partSelect.replaceChildren(...Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, "0")}-01`;
      return new Option(format(key, { month: "long" }), key);
    }));
  }
  if (view.period === "week") {
    // Every week numbered in the year: from the one holding 4 January to the last before the next year's first.
    const options = [];
    for (let from = periodRange("week", `${year}-01-04`)[0]; from < periodRange("week", `${year + 1}-01-04`)[0]; from = addDays(from, 7)) {
      options.push(new Option(`${weekNumber(from)}. · ${format(from, { day: "numeric", month: "numeric" })} – ${format(addDays(from, 6), { day: "numeric", month: "numeric" })}`, from));
    }
    partSelect.replaceChildren(...options);
  }
  if (view.period !== "year") partSelect.value = start;
}

// The same period in another year: the month kept, or the week number as near as that year has it.
function inYear(year, from) {
  if (view.period !== "week") return `${year}${from.slice(4)}`;
  const firstWeek = periodRange("week", `${year}-01-04`)[0];
  const lastWeek = addDays(periodRange("week", `${Number(year) + 1}-01-04`)[0], -7);
  const wanted = addDays(firstWeek, 7 * (weekNumber(from) - 1));
  return wanted > lastWeek ? lastWeek : wanted;
}

function renderJump(range) {
  byId("diaryJumpMonthField").hidden = view.period !== "month";
  byId("diaryJumpWeekField").hidden = view.period !== "week";
  fillPeriodPicker(byId("diaryJumpYear"), byId(view.period === "week" ? "diaryJumpWeek" : "diaryJumpMonth"), range[0]);
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
  const basis = basisFor(view.period);
  for (const button of byId("diaryBasis").querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.basis === basis));
    if (button.dataset.basis === "previous") button.textContent = t(`diaryBasisPrevious_${view.period}`);
    if (button.dataset.basis === "lastYear") button.hidden = view.period === "year";
  }
  // Only a running period has days still to come, and the choice of span.
  const today = dayKey(Date.now(), zone);
  const running = today >= range[0] && today < range[1];
  byId("diarySpan").hidden = !running;
  for (const button of byId("diarySpan").querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.span === view.span));
  byId("diaryBasisPick").hidden = basis !== "pick";
  byId("diaryBasisPickPart").hidden = view.period === "year";
  if (basis === "pick") fillPeriodPicker(byId("diaryBasisPickYear"), byId("diaryBasisPickPart"), pickedStart(range));
  byId("diaryTitle").textContent = periodTitle(range);
  byId("diaryCalendarTitle").textContent = periodTitle(range);
  renderJump(range);
  // Back to today only from another period.
  byId("diaryToday").hidden = running;
}

// The period's totals, each beside the change from the period before.
// Distance sport by sport, as several sports' kilometres do not add up.
function distanceBySport(entries) {
  return sports.map((sport) => [sport, entries.filter((entry) => entry.sport === sport)])
    .filter(([, list]) => list.length)
    .map(([sport, list]) => `${sportIcon[sport]} ${km(list.reduce((sum, entry) => sum + (entry.summary.distance ?? 0), 0))}`);
}

function renderTiles(current, previous, entries) {
  // A change that rounds away in its own units reads as none; amounts also show it in percent of what was before.
  const change = (now, before, text, percent = false) => {
    if (now == null || before == null) return "";
    const difference = now - before;
    const shown = text(Math.abs(difference));
    if (!/[1-9]/.test(shown)) return t("diarySame");
    const sign = difference > 0 ? "+" : "−";
    const share = percent && before > 0 ? ` (${sign}${displayNumber(Math.round((Math.abs(difference) / before) * 100))} %)` : "";
    return `${sign}${shown}${share}`;
  };
  const tiles = [
    [t("diarySessions"), String(current.count), change(current.count, previous.count, (value) => String(value), true)],
    mixedSports()
      ? [t("diaryDistance"), distanceBySport(entries).join("\n") || "0 km", "", "is-split"]
      : [t("diaryDistance"), km(current.distance), change(current.distance, previous.distance, (value) => km(value), true)],
    [t("diaryTime"), hours(current.seconds), change(current.seconds, previous.seconds, hours, true)],
    [t("calories"), kcal(current.calories), change(current.calories, previous.calories, kcal, true)],
    [t("lapPower"), current.avgPower == null ? "—" : `${displayNumber(current.avgPower)} W`, change(current.avgPower, previous.avgPower, (value) => `${displayNumber(value)} W`)],
    [t("lapHeartRate"), current.avgHeartRate == null ? "—" : `${displayNumber(current.avgHeartRate)} bpm`, change(current.avgHeartRate, previous.avgHeartRate, (value) => `${displayNumber(value)} bpm`)],
  ];
  byId("diaryPrevious").textContent = previous.partial && basisFor(view.period) !== "previous"
    ? t("diaryVersusPartOf", { name: shortTitle(previous.range[0]), from: format(previous.range[0], { day: "numeric", month: "numeric" }), to: format(addDays(previous.range[1], -1), { day: "numeric", month: "numeric" }) })
    : previous.partial
    ? t("diaryVersusPart", { from: format(previous.range[0], { day: "numeric", month: "numeric" }), to: format(addDays(previous.range[1], -1), { day: "numeric", month: "numeric" }) })
    : basisFor(view.period) === "pick"
      ? t("diaryVersusPick", { name: periodTitle(previous.range) })
      : t(basisFor(view.period) === "lastYear" ? `diaryVersusLastYear_${view.period}` : `diaryVersus_${view.period}`);
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

const barField = { distance: "distance", seconds: "timerSeconds", calories: "calories" };
const barValue = (entries, metric) => entries.reduce((sum, entry) => sum + (entry.summary[barField[metric]] ?? 0), 0);
const barText = (value, metric) => (metric === "distance" ? km(value) : metric === "calories" ? kcal(value) : hours(value));

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
  const steps = metric !== "seconds"
    ? [1, 2, 2.5, 5].flatMap((factor) => [1, 10, 100, 1000, 10_000, 100_000].map((power) => factor * power))
    : [5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 600, 1200, 1800, 3000, 6000].map((minutes) => minutes * 60);
  return steps.sort((a, b) => a - b).find((step) => step >= rough) ?? rough;
}

const axisText = (value, metric) => (metric === "calories" ? kcal(value) : metric === "distance"
  ? (value >= 1000 ? `${displayNumber(value / 1000, value % 1000 ? 1 : 0)} km` : `${displayNumber(value)} m`)
  : value >= 3600 ? `${displayNumber(value / 3600, value % 3600 ? 1 : 0)} h` : `${Math.round(value / 60)} min`);

// The bar's day or month, its total and what it is made of (the sessions are in the calendar), beside the bar under the pointer.
function showTooltip(bar, { when, total, parts, hint, detail }, tooltip = byId("diaryTooltip")) {
  const line = (className, text) => Object.assign(document.createElement("div"), { className, textContent: text });
  const rows = parts.length > 1 ? parts.map(({ label, color, value }) => {
    const row = Object.assign(document.createElement("div"), { className: "diary-tooltip-row" });
    const swatch = Object.assign(document.createElement("i"), { className: "compare-swatch" });
    swatch.style.background = color;
    row.append(swatch, Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("strong"), { textContent: value }));
    return row;
  }) : [];
  tooltip.replaceChildren(line("diary-tooltip-when", when), line("diary-tooltip-total", total), ...(detail ? [line("diary-tooltip-detail", detail)] : []), ...rows, ...(hint ? [line("diary-tooltip-hint", hint)] : []));
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

// The calendar's own tooltip, as the chart's, on hovering an activity, a planned workout or a day off.
function calendarTip(element, content) {
  element.addEventListener("pointerenter", () => showTooltip(element, content, byId("diaryCalendarTooltip")));
  element.addEventListener("pointerleave", hideTooltip);
}

function hideTooltip() {
  byId("diaryTooltip").hidden = true;
  byId("diaryCalendarTooltip").hidden = true;
}

document.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "mouse" && !event.target.closest?.(".diary-bar, .diary-day-planned, .diary-activity, .diary-day-off")) hideTooltip();
});

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
  // A week keeps all its days, by the weekday alone when the date does not fit.
  const shortWeek = view.period === "week" && slot < 44;
  const labelWidth = { year: 30, week: shortWeek ? 0 : 44 }[view.period] ?? 22;
  const labelStep = Math.max(1, Math.ceil(labelWidth / slot));
  buckets.forEach((bucket, index) => {
    const x = left + slot * index + (slot - barWidth) / 2;
    const total = barValue(drawn(bucket.entries), metric);
    const label = view.period === "year" ? format(`${bucket.key}-01`, { month: "short" })
      : view.period === "week" ? format(bucket.key, shortWeek ? { weekday: "short" } : { weekday: "short", day: "numeric" }) : String(Number(bucket.key.slice(8)));
    // A narrow chart labels every few bars only, as many as fit side by side.
    if (index % labelStep === 0) children.push(svgNode("text", { x: x + barWidth / 2, y: height - 8, class: "diary-tick" }, label));
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
    group.addEventListener("pointerenter", () => showTooltip(group, { when, total: barText(total, metric), parts: parts.map((part) => ({ ...part, value: barText(part.value, metric) })), hint: view.period === "year" ? t("diaryOpenMonth") : "" }));
    // A finger lifting is not leaving: its tooltip stays until a tap elsewhere.
    group.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") hideTooltip();
    });
    // A month of the year's chart opens that month.
    if (view.period === "year") {
      group.classList.add("is-link");
      group.addEventListener("click", () => {
        hideTooltip();
        view.period = "month";
        view.day = `${bucket.key}-01`;
        render();
      });
    }
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
  // Only the sports the period has get rows of their own, and a single one needs none.
  const present = shownGroups.filter(({ has }) => entries.some(has));
  if (metric === "distance" && mixedSports() && present.length > 1) {
    for (const group of present) {
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

// The primary benefit, coloured by its group as Garmin does, with the aerobic Training Effect; both estimates.
function benefitLine(entry, settings) {
  const benefit = primaryBenefit(entry, settings);
  if (!benefit) return null;
  const effect = aerobicEffect(entry, settings);
  const name = t(`benefit_${benefit.benefit}`);
  const group = benefitGroup[benefit.benefit];
  const node = Object.assign(document.createElement("span"), { className: `diary-activity-benefit is-${group}` });
  node.append(Object.assign(document.createElement("i"), { ariaHidden: "true" }), `${name}${effect ? ` · ${displayNumber(effect.value, 1)}` : ""}`);
  const text = `${t("compareBenefit")}: ${name} (${t(`benefitGroup_${group}`)})${effect ? ` · ${t("compareAerobicEffect")} ${displayNumber(effect.value, 1)} ${t(`teLevel_${effect.level}`)}` : ""} · ${t("estimate")}`;
  return { node, text };
}

// The workout's score in the diary, for a sport with the Training section filled in.
let scoreCache = new WeakMap();
function scoreNode(entry) {
  if (!scoreCache.has(entry)) {
    const plan = view.plans?.get(entry.sport) ?? null;
    const scored = plan ? scoreFor(entry, plan, view.scoreSettings) : null;
    scoreCache.set(entry, scored ? scoreBadge(scored.score) : null);
  }
  return scoreCache.get(entry);
}

function activityButton(entry, settings) {
  const effect = benefitLine(entry, settings);
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
    ...(effect ? [effect.node] : []),
    ...(scoreNode(entry) ? [scoreNode(entry)] : []),
    // A phone's narrow day shows only the kilometres, to one decimal.
    Object.assign(document.createElement("span"), { className: "diary-activity-short", ariaHidden: "true", textContent: displayNumber((entry.summary.distance ?? 0) / 1000, 1) }),
  );
  calendarTip(button, { when: `${kindLabel(workoutKind(entry), entry.sport)} · ${sportLabel(entry.sport)}`, total: entry.name.replace(/^Kinomap - /, ""), detail: effect?.text ?? "", parts: [], hint: t("diaryOpen") });
  button.addEventListener("click", () => {
    hideTooltip();
    openActivity(entry);
  });
  return button;
}

// A month's calendar, or a week's single row; a year has its chart only.
function renderCalendar(range, entries) {
  const card = byId("diaryCalendarCard");
  card.hidden = view.period === "year";
  if (card.hidden) return;
  const days = view.period === "week" ? periodBuckets("week", range, [], zone).map((bucket) => bucket.key) : calendarDays(range[0]);
  const today = dayKey(Date.now(), zone);
  const settings = settingsFor(view.entries);
  const excused = excuses();
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
    // A phone lists a week's days one under another, each named by its weekday and date.
    cell.append(Object.assign(document.createElement("span"), { className: "diary-day-label", textContent: format(day, { weekday: "short", day: "numeric", month: "numeric" }) }));
    const ridden = entries.filter((entry) => dayKey(entry.startMs, zone) === day).sort((a, b) => a.startMs - b.startMs);
    cell.append(...ridden.map((entry) => activityButton(entry, settings)));
    // A day off with its reason, as said in the Training tab, so the calendar tells why it is empty.
    const excuse = !ridden.length ? excused[day] : null;
    if (excuse) {
      // Unlike an activity: a dashed outline without a stripe and one line, the reason by its icon and its words,
      // so the kinds' colours stay the activities' own.
      const off = Object.assign(document.createElement("div"), { className: "diary-day-off" });
      calendarTip(off, { when: format(day, { weekday: "long", day: "numeric", month: "numeric" }), total: t("diaryDayOff", { reason: excuseText(excuse) }), parts: [], hint: day >= today ? t("diaryOffChange") : "" });
      off.append(Object.assign(document.createElement("span"), { className: "diary-day-off-name", textContent: `${excuseIcons[excuse.reason] ?? excuseIcons.other} ${excuseText(excuse)}` }));
      cell.append(off);
    }
    // This week's days ahead: the planned workout, faint, a click to take the day off instead.
    if (!ridden.length && !excuse) {
      for (const item of (view.planned ?? []).filter((item) => item.day === day)) {
        const text = plannedText(item.plan, item.sport, item.type);
        const planned = Object.assign(document.createElement("button"), { type: "button", className: "diary-day-planned" });
        const [name, ...rest] = text.split(" · ");
        calendarTip(planned, { when: format(day, { weekday: "long", day: "numeric", month: "numeric" }), total: name, detail: rest.join(" · "), parts: [], hint: t("diaryPlannedSkip") });
        planned.append(Object.assign(document.createElement("span"), { className: "diary-day-planned-name", textContent: name }));
        planned.addEventListener("click", () => {
          hideTooltip();
          openExcuse(day, render);
        });
        cell.append(planned);
      }
    }
    // Today or a day ahead off: a click changes or cancels it.
    if (excuse && day >= today) {
      const off = cell.querySelector(".diary-day-off");
      off.classList.add("is-editable");
      off.setAttribute("role", "button");
      off.tabIndex = 0;
      off.addEventListener("click", () => {
        hideTooltip();
        openExcuse(day, render);
      });
    }
    return cell;
  });
  // Each row opens with its week number, which opens that week.
  const weekCell = (day) => {
    const button = Object.assign(document.createElement("button"), { type: "button", className: "diary-week-number", textContent: String(weekNumber(day)) });
    button.title = t("diaryOpenWeek", { week: weekNumber(day) });
    button.setAttribute("aria-pressed", String(view.period === "week"));
    button.addEventListener("click", () => {
      view.period = "week";
      view.day = day;
      render();
    });
    return button;
  };
  const rows = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(weekCell(days[index]), ...cells.slice(index, index + 7));
  const corner = Object.assign(document.createElement("div"), { className: "diary-weekday", textContent: t("diaryWeekShort") });
  byId("diaryCalendar").replaceChildren(corner, ...head, ...rows);
  byId("diaryCalendar").classList.toggle("is-week", view.period === "week");
}

// Each legend entry turns its sport or kind on and off in the chart; the last one shown stays on.
// Only the sports or kinds the period has are listed.
function renderLegend(entries) {
  const groups = barGroups().filter(({ has }) => entries.some(has));
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

// Time in the heart rate and power zones over the period, each zone set against the period it is compared with.
// How the period's load splits by the primary benefit's group, against the period before, with the count of
// each benefit and a note when the base is missing or the high aerobic load outweighs the rest.
function renderFocus(current, previous) {
  const card = byId("diaryFocusCard");
  const settings = settingsFor(view.entries);
  const focus = trainingFocus(current, settings);
  card.hidden = !focus.total;
  if (card.hidden) return;
  if (!card.querySelector(".tile-info")) card.append(infoHint());
  card.querySelector(".tile-info").set(t("diaryFocusInfo"));
  const before = trainingFocus(previous, settings);
  const share = (value, total) => (total ? (value / total) * 100 : 0);
  const span = (className, textContent) => Object.assign(document.createElement("span"), { className, textContent });
  const rows = benefitGroups.map((group) => {
    const now = share(focus.load[group], focus.total);
    const difference = before.total ? now - share(before.load[group], before.total) : null;
    const row = Object.assign(document.createElement("div"), { className: `diary-focus-row is-${group}` });
    const track = Object.assign(document.createElement("div"), { className: "fitness-zone-track" });
    const fill = Object.assign(document.createElement("div"), { className: "fitness-zone-fill" });
    fill.style.width = `${now}%`;
    // The range the share should fall in, dashed over the bar.
    const [low, high] = focusTargets[group];
    const target = Object.assign(document.createElement("div"), { className: "diary-focus-target", title: t("diaryFocusTarget", { low, high }) });
    target.style.left = `${low}%`;
    target.style.width = `${high - low}%`;
    track.append(fill, target);
    const name = span(`diary-activity-benefit diary-focus-name is-${group}`, "");
    name.append(Object.assign(document.createElement("i"), { ariaHidden: "true" }), t(`benefitGroup_${group}`));
    row.append(
      name,
      track,
      span("fitness-zone-time", displayNumber(focus.load[group])),
      span("fitness-zone-share", `${displayNumber(now)} %`),
      span("fitness-zone-change", difference == null ? "" : Math.abs(difference) < 1 ? "=" : `${difference > 0 ? "+" : "−"}${displayNumber(Math.abs(difference))} %`),
    );
    return row;
  });
  const counts = benefits.filter((benefit) => focus.counts[benefit]).map((benefit) => `${t(`benefit_${benefit}`)} ${focus.counts[benefit]}`).join(" · ");
  // The advice for the group furthest out of its range; a week of a few workouts only hints at it.
  const advice = focusAdvice(focus);
  const notes = [
    advice ? `${t(`diaryFocus_${advice.group}_${advice.side}`)}${view.period === "week" ? ` ${t("diaryFocusWeek")}` : ""}` : t("diaryFocusBalanced"),
    t("diaryFocusTargetNote"),
  ];
  const note = (text, extra = "") => Object.assign(document.createElement("p"), { className: `field-note${extra}`, textContent: text });
  byId("diaryFocus").replaceChildren(...rows, note(`${counts} · ${t("estimate")}`), ...notes.map((text) => note(text, " diary-focus-note")));
}

function renderZones(current, previous) {
  byId("diaryZonesCard").hidden = !current.length;
  if (!current.length) return;
  const card = byId("diaryZonesCard");
  if (!card.querySelector(".tile-info")) card.append(infoHint());
  card.querySelector(".tile-info").set(t("fitnessZonesNote"));
  byId("diaryZones").replaceChildren(...zoneGroups(current, settingsFor(view.entries), view.sport, previous));
}

function render() {
  if (byId("diaryView").hidden) return;
  saveDefaults({ diary: { sport: view.sport, period: view.period, barMetric: view.barMetric, basis: view.basis, span: view.span, showPlan: view.showPlan } });
  view.day ??= dayKey(Date.now(), zone);
  // Each sport's current plan, for its workouts' scores; drawn anew, as the settings or the library may have changed.
  const settings = settingsFor(view.entries);
  const results = Object.keys(settings.sports).filter((sport) => hasTraining(settings, sport)).map((sport) => [sport, trainingPlan(view.entries, sport)]);
  view.scoreSettings = settings;
  view.plans = new Map(results.map(([sport, result]) => [sport, result?.plan ?? null]));
  // The days ahead of this week with what the plan lays on them, for the calendar.
  view.planned = results.filter(([sport, result]) => result?.plan && (view.sport === "all" || view.sport === sport))
    .flatMap(([sport, result]) => result.checklist.filter((item) => item.status === "planned" && item.type !== "off").map((item) => ({ ...item, sport, plan: result.plan })));
  scoreCache = new WeakMap();
  const range = periodRange(view.period, view.day);
  const entries = shown();
  const current = inPeriod(entries, range, zone);
  const today = dayKey(Date.now(), zone);
  const basis = basisFor(view.period);
  const picked = basis === "pick" ? pickedStart(range) : null;
  const before = previousRange(view.period, view.day, view.span === "same" ? today : "", basis, picked);
  const previous = inPeriod(entries, before, zone);
  // With no day of the period gone by, the range before is never cut.
  const whole = previousRange(view.period, view.day, "", basis, picked);
  byId("diaryEmpty").hidden = view.entries.length > 0;
  renderControls(range);
  renderTiles(totals(current), { ...totals(previous), range: before, partial: before[1] !== whole[1] }, current);
  renderBars(range, current);
  renderLegend(current);
  renderCalendar(range, current);
  renderZones(current, previous);
  renderFocus(current, previous);
  renderPlan();
}

export async function showDiary() {
  view.entries = (await listEntries().catch(() => [])).map(withCleanHeartRate);
  render();
}

export const rerenderDiary = render;

export function setupDiary({ onOpen }) {
  byId("diaryShowPlan").addEventListener("change", (event) => {
    view.showPlan = event.target.checked;
    render();
  });
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
  byId("diaryBasis").addEventListener("click", (event) => {
    const basis = event.target.closest("button")?.dataset.basis;
    if (!basis) return;
    view.basis = basis;
    render();
  });
  byId("diarySpan").addEventListener("click", (event) => {
    const span = event.target.closest("button")?.dataset.span;
    if (!span) return;
    view.span = span;
    render();
  });
  byId("diaryBasisPickYear").addEventListener("change", (event) => {
    const range = periodRange(view.period, view.day);
    view.picked[view.period] = inYear(event.target.value, pickedStart(range));
    render();
  });
  byId("diaryBasisPickPart").addEventListener("change", (event) => {
    view.picked[view.period] = event.target.value;
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
    view.day = inYear(event.target.value, periodRange(view.period, view.day)[0]);
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
