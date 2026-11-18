import { bestAverage, workoutKind } from "../analysis.js";
import { addDays, dayKey, weekNumber } from "../diary.js";
import { listEntries } from "../library.js";
import { ftpOn, ftpSourceOn, withCleanHeartRate } from "../fitness.js";
import { adherenceShare, dayStreak, fatigueByFeel, ftpFromTest, workoutFromName, routeSuggestions, workoutSuggestions, showsWeekSummary, weekScore, lastMondays, longestMinutesByWeek, weekAdherence, zoneTwoTrend } from "../training.js";
import { drawPlanCard, plannedText, scoreBadge } from "./diary.js";
import { lastFtpTyped, renderNextStep, trainingPlan } from "./fitness.js";
import { anyTraining, hasTraining, planLog, scoreFor, zoneTwoWatts } from "./score.js";
import { addFtpRecord, currentFtp, dismiss, dismissed, openSettings, settingsFor } from "./settings.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, displayNumber, sportLabel, state, t, zone } from "./context.js";
import { infoHint } from "./info.js";
import { excuses, excuseText, openExcuse } from "./excuse.js";
import { kindLabel } from "./library.js";

// The Training tab: this week's plan with the workouts' scores, the next step, how the plan was kept week by week,
// and the last workouts each with its score and why. For the sports with the Training section filled in.

const view = {
  entries: [],
  sport: savedDefaults().training?.sport ?? null,
};

let openActivity = () => {};

const node = (tag, attributes = {}, text) => {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text != null) element.textContent = text;
  return element;
};

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const format = (key, options) => new Intl.DateTimeFormat(locale(), { timeZone: "UTC", ...options }).format(new Date(`${key}T12:00:00Z`));
const today = () => dayKey(Date.now(), zone);

// The sports with the Training section, the one picked first.
function sportsWithTraining(settings) {
  return Object.keys(settings.sports).filter((sport) => hasTraining(settings, sport));
}

// Whether the tab shows: a sport has the Training section filled in.
export function trainingShown(entries) {
  return anyTraining(settingsFor(entries));
}

// The reasons under a score: each part marked ✓ (80 % and more), ~ (50 %) or ✗, with its numbers.
function partsText(scored) {
  const mark = (share) => (share >= 0.8 ? "✓" : share >= 0.5 ? "~" : "✗");
  const parts = scored.parts.filter((part) => part.share != null).map((part) => `${mark(part.share)} ${t(`scorePart_${part.key}`, part)}`);
  if (scored.swapped) parts.push(t("scoreSwapped", { planned: t(`scorePlanned_${scored.planned}`) }));
  if (scored.approx) parts.push(t("scoreApprox"));
  return parts.join(" · ");
}

// How the plan was kept: the last four weeks' share of the training days ridden, the run of days, the average score,
// and the last eight weeks one by one.
function adherenceCard(sport, workouts, log) {
  const card = node("section", { class: "card training-adherence" });
  const head = node("div", { class: "panel-title-row" });
  head.append(node("span", { class: "field-label" }, t("trainingAdherence")));
  card.append(head);
  const now = today();
  const excused = excuses();
  const weeks = lastMondays(now, 8).map((monday) => weekAdherence(log, workouts, monday, now, excused));
  const recent = weeks.slice(-4);
  const share = adherenceShare(recent);
  const scores = workouts.filter((workout) => workout.day > addDays(now, -28) && Number.isFinite(workout.score)).map((workout) => workout.score);
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  const streak = dayStreak(workouts.map((workout) => workout.day), now, excused);
  const tiles = node("div", { class: "diary-tiles training-tiles" });
  const tile = (label, value, note) => {
    const box = node("div", { class: "diary-tile" });
    box.append(node("span", { class: "field-label" }, label), node("strong", {}, value), node("span", { class: "field-note" }, note));
    return box;
  };
  tiles.append(
    tile(t("trainingKept"), share == null ? "—" : `${share} %`, t("trainingKeptNote")),
    tile(t("trainingStreak"), t("trainingStreakDays", { days: streak.days }), t(streak.today ? "trainingStreakToday" : "trainingStreakOpen")),
    tile(t("trainingAverage"), average == null ? "—" : String(average), t("trainingAverageNote")),
  );
  card.append(tiles);
  if (!weeks.some((week) => week.planned)) {
    card.append(node("p", { class: "field-note" }, t("trainingNoLog")));
    return card;
  }
  const table = node("table", { class: "laps-table training-weeks" });
  const headRow = node("tr");
  headRow.append(...["trainingWeek", "trainingDays", "trainingLong", "trainingIntervals", "trainingScore"].map((key) => node("th", {}, t(key))));
  table.append(node("thead"), node("tbody"));
  table.tHead.append(headRow);
  for (const week of [...weeks].reverse()) {
    if (!week.planned && !week.extra) continue;
    const row = node("tr");
    const pair = ([done, planned]) => (planned || done ? `${done}/${planned}` : "—");
    row.append(
      node("td", {}, `${weekNumber(week.monday)} · ${format(week.monday, { day: "numeric", month: "numeric" })}`),
      node("td", {}, `${week.ridden}/${week.planned}${week.extra ? ` +${week.extra}` : ""}${week.excused ? ` (${t("weeksExcused", { days: week.excused })})` : ""}`),
      node("td", {}, pair(week.long)),
      node("td", {}, pair(week.intervals)),
    );
    const scoreCell = node("td");
    const overall = weekScore(week);
    if (overall != null) scoreCell.append(scoreBadge(overall, t("weekScoreTitle", { score: overall })));
    row.append(scoreCell);
    table.tBodies[0].append(row);
  }
  card.append(table, infoHint(t("trainingWeeksNote")));
  return card;
}

// The last two weeks' workouts, each with its score and the reasons.
function workoutsCard(sport, scored) {
  const card = node("section", { class: "card training-workouts" });
  card.append(node("span", { class: "field-label" }, t("trainingWorkouts")));
  const since = addDays(today(), -14);
  const recent = scored.filter((item) => item.day > since).sort((a, b) => b.entry.startMs - a.entry.startMs);
  if (!recent.length) {
    card.append(node("p", { class: "field-note" }, t("trainingNoWorkouts")));
    return card;
  }
  const list = node("div", { class: "training-workout-list" });
  for (const { entry, day, result } of recent) {
    const row = node("button", { type: "button", class: "training-workout" });
    row.addEventListener("click", () => openActivity(entry));
    const top = node("span", { class: "training-workout-head" });
    top.append(
      node("span", { class: "training-workout-day" }, format(day, { weekday: "short", day: "numeric", month: "numeric" })),
      node("span", { class: "training-workout-name" }, `${entry.name.replace(/^Kinomap - /, "")} · ${t(`scoreAs_${result?.as ?? "none"}`)}`),
    );
    if (result) top.append(scoreBadge(result.score));
    // How it felt, when rated: the feel and the effort (RPE).
    const feel = [entry.summary?.workoutFeel != null ? t("trainingFeel", { feel: t(`feel${entry.summary.workoutFeel}`) }) : null, entry.summary?.workoutRpe ? t("trainingRpe", { rpe: entry.summary.workoutRpe }) : null].filter(Boolean).join(" · ");
    row.append(top, node("span", { class: "field-note training-workout-why" }, [result ? partsText(result) : t("scoreNone"), feel].filter(Boolean).join(" · ")));
    list.append(row);
  }
  card.append(list, infoHint(t("trainingScoreNote")));
  return card;
}

// Last week day by day, as the week's plan shows this one: each day ridden ticked with its score and workouts,
// a planned day not ridden with what was planned, a free day left out; under it the week's numbers. Open from
// Monday until the week's first workout, folded to one line for the rest of the week.
function summaryCard(scored, workouts, log, sport) {
  const now = today();
  const excused = excuses();
  const monday = lastMondays(now, 2)[0];
  const sunday = addDays(monday, 6);
  const card = node("details", { class: "card training-summary" });
  card.open = showsWeekSummary(workouts.map((workout) => workout.day), now);
  const list = node("div", { class: "diary-plan-list" });
  for (let index = 0; index < 7; index += 1) {
    const day = addDays(monday, index);
    const ridden = scored.filter((item) => item.day === day);
    const planned = log[day];
    if (!ridden.length && !planned) continue;
    const status = ridden.length ? "done" : "missed";
    const excuse = !ridden.length ? excused[day] : null;
    const row = node("div", { class: `diary-plan-row has-score is-${status}${excuse ? " is-excused" : ""}` });
    const mark = node("span", { class: "diary-plan-mark" }, status === "done" ? "✓" : "–");
    mark.setAttribute("aria-label", t(`planStatus_${status}`));
    const score = node("span", { class: "diary-plan-score" });
    for (const item of ridden) if (item.result) score.append(scoreBadge(item.result.score));
    const km = (entry) => displayNumber(Math.round((entry.summary?.distance ?? 0) / 100) / 10, 1);
    const text = ridden.length
      ? ridden.map((item) => `${km(item.entry)} km · ${kindLabel(workoutKind(item.entry), sport)}`).join(", ")
      : excuse ? `${excuseText(excuse)} · ${t("summaryPlanned", { planned: t(`scorePlanned_${planned.type}`) })}` : t("summaryMissed", { planned: t(`scorePlanned_${planned.type}`) });
    const whyCell = node("span", { class: "diary-plan-why-cell" });
    if (!ridden.length) {
      const why = node("button", { type: "button", class: "link-button diary-plan-why" }, excuse ? t("excuseEdit") : t("excuseAsk"));
      why.addEventListener("click", () => openExcuse(day, render));
      whyCell.append(why);
    }
    row.classList.add("has-why");
    row.append(mark, node("span", { class: "diary-plan-day" }, format(day, { weekday: "short", day: "numeric", month: "numeric" })), score, node("span", { class: "diary-plan-text" }, text), whyCell);
    list.append(row);
  }
  // The week as a whole in the line that folds, in the rows' columns: a fold mark for the tick, the week for the day,
  // its score (the plan kept and the workouts' average) under theirs; what makes it up in the score's title.
  const week = weekAdherence(log, workouts, monday, sunday, excused);
  const overall = weekScore(week);
  const numbers = [
    ...(week.planned ? [t("summaryDays", { ridden: week.ridden, planned: week.planned })] : []),
    ...(week.excused ? [t("summaryExcused", { days: week.excused })] : []),
    ...(week.long[1] ? [t("summaryLong", { done: week.long[0], planned: week.long[1] })] : []),
    ...(week.intervals[1] ? [t("summaryIntervals", { done: week.intervals[0], planned: week.intervals[1] })] : []),
    ...(week.score != null ? [t("summaryScore", { score: week.score })] : []),
  ];
  const head = node("summary", { class: "diary-plan-row has-score training-summary-head" });
  const score = node("span", { class: "diary-plan-score" });
  if (overall != null) score.append(scoreBadge(overall, [t("weekScoreTitle", { score: overall }), numbers.join(" · ")].join("\n")));
  head.append(
    node("span", { class: "training-summary-fold", "aria-hidden": "true" }, "▸"),
    node("span", { class: "field-label" }, t("summaryWeek", { week: weekNumber(monday) })),
    score,
    node("span", { class: "diary-plan-text" }, t("summaryLast")),
  );
  card.append(head, list);
  return card;
}

// What to ride for a planned day: Kinomap routes of the length for a steady one, the creator's workouts for intervals
// and the FTP test, those ridden longest ago first; for workouts not made yet, the way to the creator. A small
// button with a play mark that opens them in a dialog, out of the way of the day's text.
function suggestionsButton(result, entries, type) {
  const rides = entries.map((entry) => ({ name: entry.name.replace(/^Kinomap - /, ""), km: (entry.summary?.distance ?? 0) / 1000, day: dayKey(entry.startMs, zone), kind: workoutKind(entry), workout: /\bftp\b/i.test(entry.name ?? "") }));
  const plan = result.plan;
  // The creator's workouts are no routes, even the steady ones.
  const made = new Set([...(plan.kinomap?.extras ?? []), plan.kinomap?.minimal].filter(Boolean));
  for (const ride of rides) if (made.has(ride.name)) ride.workout = true;
  const when = (day) => format(day, { day: "numeric", month: "numeric", year: "numeric" });
  const steady = type === "usual" || type === "long";
  const range = type === "long" ? [plan.long.fromKm, plan.long.toKm] : [plan.usual.km * 0.9, plan.usual.km * 1.1];
  const items = steady
    ? routeSuggestions(rides, range, 5).map((route) => ({ name: route.name, note: t("suggestRouteNote", { km: displayNumber(Math.round(route.km * 10) / 10, 1), last: when(route.last) }), exact: route.km >= range[0] - 0.05 && route.km <= range[1] + 0.05 }))
    : workoutSuggestions(rides, type, 5, plan.intervals).map((workout) => ({ name: workout.name, note: t("suggestWorkoutNote", { last: when(workout.last) }), exact: workout.exact || type !== "intervals" }));
  if (steady && !items.length && !(plan.kinomap?.extras ?? []).length) return null;
  const button = node("button", { type: "button", class: "outline-button training-suggest-button" });
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4.5-2.5z"/>';
  button.append(icon, node("span", {}, t(steady ? "suggestRoutesButton" : "suggestWorkoutsButton")));
  button.addEventListener("click", () => {
    const dialog = node("dialog", { class: "intervals-dialog suggest-dialog" });
    const head = node("div", { class: "dialog-head" });
    head.append(node("h2", {}, t(steady ? "suggestRoutesTitle" : "suggestWorkoutsTitle")));
    const intro = steady
      ? t("suggestRoutesIntro", { from: displayNumber(range[0], 1), to: displayNumber(range[1], 1) })
      : t(type === "intervals" ? "suggestIntervalsIntro" : "suggestTestIntro", { repeats: plan.intervals.repeats, minutes: plan.intervals.minutes });
    const list = node("ul", { class: "suggest-list" });
    for (const item of items) {
      const row = node("li", { class: item.exact ? "is-exact" : "" });
      row.append(node("strong", {}, item.name), node("span", { class: "field-note" }, item.note));
      list.append(row);
    }
    const body = [node("p", { class: "field-note" }, intro)];
    if (items.length) body.push(list);
    // For a change instead of a steady workout: the workouts made that the plan does not lay out itself.
    const extras = steady ? plan.kinomap?.extras ?? [] : [];
    if (extras.length) {
      const extraList = node("ul", { class: "suggest-list" });
      for (const name of extras) {
        const row = node("li");
        row.append(node("strong", {}, name));
        extraList.append(row);
      }
      body.push(node("p", { class: "field-label" }, t("suggestExtras")), extraList);
    }
    if (!steady && !items.some((item) => item.exact)) body.push(node("p", { class: "field-note" }, t(type === "intervals" ? "suggestNoIntervals" : "suggestNoTest", { repeats: plan.intervals.repeats, minutes: plan.intervals.minutes })));
    if (!steady) body.push(node("a", { href: "https://creator.kinomap.com/workout", target: "_blank", rel: "noopener", class: "suggest-creator" }, t("suggestCreator")));
    const actions = node("div", { class: "dialog-actions" });
    const close = node("button", { type: "button", class: "outline-button" }, t("close"));
    close.addEventListener("click", () => dialog.close());
    actions.append(node("span", { class: "dialog-spacer" }), close);
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(head, ...body, actions);
    document.body.append(dialog);
    dialog.showModal();
  });
  return button;
}

// After a 20-minute FTP test newer than the FTP typed: its result, to take as the FTP or turn down.
function ftpTestCard(sport, entries, settings, onOpen) {
  const typedFrom = lastFtpTyped(settings, sport);
  const tests = entries.filter((entry) => workoutFromName(entry.name ?? "").kind === "ftpTest")
    .map((entry) => ({ entry, day: dayKey(entry.startMs, zone), best20: bestAverage(entry, "power", 1200) }));
  const result = ftpFromTest(tests, typedFrom);
  if (!result) return null;
  const key = `ftptest-${sport}-${result.day}`;
  if (dismissed().has(key)) return null;
  const entry = tests.find((test) => test.day === result.day)?.entry;
  const card = node("section", { class: "card training-ftp-test" });
  const current = currentFtp(settings, sport);
  card.append(
    node("span", { class: "field-label" }, t("ftpTestTitle", { date: format(result.day, { day: "numeric", month: "numeric" }) })),
    node("p", { class: "training-ftp-result" }, t("ftpTestResult", { best: result.best20, ftp: result.ftp })),
    node("p", { class: "field-note" }, current ? t("ftpTestBefore", { ftp: current, change: `${result.ftp >= current ? "+" : ""}${result.ftp - current}` }) : t("ftpTestFirst")),
  );
  const actions = node("div", { class: "fitness-suggestion-actions" });
  const open = node("button", { type: "button", class: "link-button" }, t("suggestOpen"));
  open.addEventListener("click", () => onOpen(entry));
  const ignore = node("button", { type: "button", class: "outline-button" }, t("suggestIgnore"));
  ignore.addEventListener("click", () => {
    dismiss(key);
    render();
  });
  const save = node("button", { type: "button", class: "export-button" }, t("ftpTestSave"));
  save.addEventListener("click", () => {
    addFtpRecord(sport, { from: result.day, ftp: result.ftp });
    window.dispatchEvent(new Event("settings-change"));
  });
  actions.append(open, ignore, save);
  card.append(actions);
  return card;
}

// An extra for a change in place of the day's workout, now and then: the technique drill on a usual day, the
// progression on a longer one in even weeks, the pyramid on an interval day in odd weeks.
function extraFor(kinomap, item) {
  if (!kinomap) return null;
  const week = weekNumber(item.day);
  if (item.type === "usual") return kinomap.technique;
  if (item.type === "long" && week % 2 === 0) return kinomap.progression;
  if (item.type === "intervals" && week % 2 === 1) return kinomap.pyramid;
  return null;
}

// What to ride today, large: today's planned workout, or with today done or free the next one; the least workout
// under it, and a warning when the last workouts felt harder than usual.
function todayCard(result, scored, fatigue, entries) {
  const card = node("section", { class: "card training-today" });
  const now = today();
  const excused = excuses();
  // Today excused: the reason, and the next day not excused instead of today's workout.
  const item = excused[now] ? null : result.checklist.find((entry) => entry.day === now);
  const done = item?.status === "done";
  const next = result.checklist.find((entry) => entry.status === "planned" && entry.day > now && !excused[entry.day]) ?? result.days.find((entry) => entry.day > now && !excused[entry.day]);
  const showing = item?.status === "planned" ? item : next;
  const head = node("div", { class: "panel-title-row" });
  head.append(node("span", { class: "field-label" }, t(item?.status === "planned" ? "trainingToday" : "trainingNext", { day: showing ? format(showing.day, { weekday: "long", day: "numeric", month: "numeric" }) : "" })));
  card.append(head);
  if (excused[now]) card.append(node("p", { class: "training-today-done is-excused" }, t("trainingTodayExcused", { reason: excuseText(excused[now]) })));
  if (done) {
    const line = node("p", { class: "training-today-done" }, t("trainingTodayDone"));
    for (const scoredItem of scored.filter((entry) => entry.day === now && entry.result)) line.append(" ", scoreBadge(scoredItem.result.score));
    card.append(line);
  }
  if (showing) {
    card.append(
      node("strong", { class: "training-today-title" }, t(`scorePlanned_${showing.type}`)),
      node("p", { class: "training-today-text" }, plannedText(result.plan, result.sport, showing.type, { detail: true })),
    );
    const alternative = extraFor(result.plan.kinomap, showing);
    if (alternative) card.append(node("p", { class: "field-note" }, t("trainingAlternative", { name: alternative })));
    const suggestions = showing.type === "usual" || showing.type === "long" ? suggestionsButton(result, entries, showing.type) : null;
    if (suggestions) card.append(suggestions);
  } else if (!done) card.append(node("p", { class: "field-note" }, t("trainingTodayFree")));
  if (fatigue) card.append(node("p", { class: "training-warning" }, t("trainingFatigue", { rpe: fatigue.rpe ?? "—", usual: fatigue.usualRpe ?? "—", minutes: result.plan.minimal?.minutes ?? 10 })));
  if (result.plan.minimal && showing && !showing.type.startsWith("ftpTest")) {
    const minimal = result.plan.kinomap?.minimal;
    card.append(node("p", { class: "field-note" }, t("planMinimal", { minutes: result.plan.minimal.minutes }) + (minimal ? ` ${t("planKinomap", { name: minimal })}.` : "")));
  }
  return card;
}

// The weeks ahead as the plan would go: the longer workouts' time, the intervals, the lighter weeks and FTP tests.
function outlookCard(plan) {
  const card = node("section", { class: "card training-outlook" });
  card.append(node("span", { class: "field-label" }, t("trainingOutlook")));
  const table = node("table", { class: "laps-table training-weeks" });
  const headRow = node("tr");
  headRow.append(...["trainingWeek", "trainingLong", "trainingIntervals", "trainingOutlookNote"].map((key) => node("th", {}, t(key))));
  table.append(node("thead"), node("tbody"));
  table.tHead.append(headRow);
  plan.outlook.forEach((week, index) => {
    const row = node("tr", { class: index === 0 ? "is-current" : "" });
    const notes = [...(week.ftpTest ? [t("trainingOutlookTest")] : []), ...(week.lighter ? [t("trainingOutlookLighter")] : [])];
    row.append(
      node("td", {}, `${index === 0 ? t("planThisWeek") : weekNumber(week.monday)} · ${format(week.monday, { day: "numeric", month: "numeric" })}`),
      node("td", {}, `${week.longCount > 1 ? `${week.longCount} × ` : ""}${week.longMinutes} min`),
      node("td", {}, String(week.intervals)),
      node("td", {}, notes.join(" · ")),
    );
    table.tBodies[0].append(row);
  });
  card.append(table, infoHint(t("trainingOutlookInfo")));
  return card;
}

// A small chart: bars or points over time with an optional dashed line (a target or a trend), values labelled.
// items: [{ label, value, kind: "bar" | "point" }]; line: [from, to] values at the first and last item, or null.
function smallChart(items, { line = null, unit = "" } = {}) {
  const width = 320;
  const height = 120;
  const bottom = 16;
  const svgNode = (tag, attributes = {}, text) => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    if (text != null) element.textContent = text;
    return element;
  };
  const values = items.map((item) => item.value).filter((value) => value > 0).concat(line ?? []);
  const top = Math.max(...values, 1) * 1.15;
  const low = items.some((item) => item.kind === "point") ? Math.min(...values) * 0.85 : 0;
  const yFor = (value) => height - bottom - ((value - low) / (top - low)) * (height - bottom - 12);
  const slot = width / Math.max(1, items.length);
  const xFor = (index) => index * slot + slot / 2;
  const svg = svgNode("svg", { viewBox: `0 0 ${width} ${height}`, class: "training-chart", role: "img" });
  if (line) svg.append(svgNode("line", { x1: xFor(0), x2: xFor(items.length - 1), y1: yFor(line[0]), y2: yFor(line[1]), class: "training-chart-line" }));
  items.forEach((item, index) => {
    if (item.value > 0) {
      if (item.kind === "bar") svg.append(svgNode("rect", { x: xFor(index) - slot * 0.3, y: yFor(item.value), width: slot * 0.6, height: yFor(low) - yFor(item.value), rx: 3, class: "training-chart-bar" }));
      else svg.append(svgNode("circle", { cx: xFor(index), cy: yFor(item.value), r: 3.5, class: "training-chart-point" }));
      svg.append(svgNode("text", { x: xFor(index), y: yFor(item.value) - 6, class: "training-chart-value" }, `${Math.round(item.value)}${unit}`));
    }
    if (item.label) svg.append(svgNode("text", { x: xFor(index), y: height - 3, class: "training-chart-label" }, item.label));
  });
  return svg;
}

// How the fitness moves: the power at a zone 2 heart rate, the longest workout of each week against the target,
// and the FTP over time.
function progressCard(sport, entries, plan, settings) {
  const card = node("section", { class: "card training-progress" });
  card.append(node("span", { class: "field-label" }, t("trainingProgress")));
  const grid = node("div", { class: "training-progress-grid" });
  const figure = (title, note, chart) => {
    const box = node("div", { class: "training-figure" });
    box.append(node("strong", {}, title), chart ?? node("p", { class: "field-note" }, t("trainingProgressFew")), node("span", { class: "field-note" }, note));
    return box;
  };
  // Power in zone 2: the last 12 steady workouts' points, the trend through all of the last four months dashed.
  const heart = plan.steadyHeartRate;
  const points = entries.filter((entry) => workoutKind(entry) === "steady" && entry.startMs > Date.now() - 120 * 86_400_000)
    .map((entry) => ({ day: dayKey(entry.startMs, zone), watts: zoneTwoWatts(entry, heart) })).filter((point) => point.watts);
  const trend = zoneTwoTrend(points);
  const shown = trend.points.slice(-12);
  const dayNumber = (key) => Date.parse(`${key}T12:00:00Z`) / 86_400_000;
  let line = null;
  if (trend.perFourWeeks != null && shown.length > 1) {
    // Through the shown points' mean, at the trend's slope, from the first shown to the last.
    const slope = trend.perFourWeeks / 28;
    const mean = shown.reduce((sum, point) => sum + point.watts, 0) / shown.length;
    const middle = shown.reduce((sum, point) => sum + dayNumber(point.day), 0) / shown.length;
    line = [mean + slope * (dayNumber(shown[0].day) - middle), mean + slope * (dayNumber(shown.at(-1).day) - middle)];
  }
  const trendNote = trend.perFourWeeks == null ? "" : t("trainingZoneTwoTrend", { watts: `${trend.perFourWeeks > 0 ? "+" : ""}${displayNumber(trend.perFourWeeks, 1)}` });
  const label = (point, index) => (index === 0 || index === shown.length - 1 ? format(point.day, { day: "numeric", month: "numeric" }) : "");
  grid.append(figure(t("trainingZoneTwo"), trendNote, shown.length >= 2 ? smallChart(shown.map((point, index) => ({ label: label(point, index), value: point.watts, kind: "point" })), { line }) : null));
  // The longest workout of each week, the target dashed.
  const workouts = entries.map((entry) => ({ day: dayKey(entry.startMs, zone), minutes: (entry.summary?.timerSeconds ?? 0) / 60, kind: workoutKind(entry) }));
  const longest = longestMinutesByWeek(workouts, today(), 8);
  const target = settings.sports[sport]?.plan?.longTargetMinutes ?? null;
  grid.append(figure(t("trainingLongest"), target ? t("trainingLongestTarget", { minutes: target }) : t("trainingLongestNote"),
    smallChart(longest.map((week, index) => ({ label: index === longest.length - 1 ? t("planThisWeek") : String(weekNumber(week.monday)), value: week.minutes, kind: "bar" })), { line: target ? [target, target] : null })));
  // The FTP in force at the end of each of the last six months, typed or estimated.
  const months = Array.from({ length: 6 }, (_, index) => {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCMonth(start.getUTCMonth() - 5 + index);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { label: start.toLocaleDateString(locale(), { month: "short", timeZone: "UTC" }), ms: Math.min(Date.now(), end.getTime() - 1) };
  });
  const ftps = months.map((month) => ({ label: month.label, value: ftpOn(settings, sport, month.ms) ?? 0, kind: "point" }));
  const typed = ftpSourceOn(settings, sport, Date.now())?.method === "manual";
  grid.append(figure(t("trainingFtp"), t(typed ? "trainingFtpTyped" : "trainingFtpEstimated"), ftps.some((item) => item.value > 0) ? smallChart(ftps, { unit: " W" }) : null));
  card.append(grid, infoHint([t("trainingZoneTwoNote"), t("trainingLongestNote")].join("\n")));
  return card;
}

function render() {
  const content = byId("trainingContent");
  const settings = settingsFor(view.entries);
  const sports = sportsWithTraining(settings);
  const select = byId("trainingSport");
  if (!sports.includes(view.sport)) view.sport = sports[0] ?? null;
  select.replaceChildren(...sports.map((sport) => new Option(sportLabel(sport), sport, false, sport === view.sport)));
  select.hidden = sports.length < 2;
  if (!view.sport) {
    const empty = node("section", { class: "card" });
    const link = node("button", { type: "button", class: "link-button" }, t("trainingSetUp"));
    link.addEventListener("click", () => openSettings());
    empty.append(node("p", { class: "field-note" }, t("trainingEmpty")), link);
    content.replaceChildren(empty);
    return;
  }
  const sport = view.sport;
  const result = trainingPlan(view.entries, sport);
  const plan = result?.plan ?? null;
  const log = planLog(sport);
  const scored = view.entries.filter((entry) => entry.sport === sport).map((entry) => ({ entry, day: dayKey(entry.startMs, zone), result: scoreFor(entry, plan, settings) }));
  const workouts = scored.map(({ entry, day, result: item }) => ({ day, minutes: (entry.summary?.timerSeconds ?? 0) / 60, kind: workoutKind(entry), ftpTest: item?.as === "ftpTest", score: item?.score ?? null }));
  const cards = [];
  const fatigue = fatigueByFeel(view.entries.filter((entry) => entry.sport === sport).map((entry) => ({ day: dayKey(entry.startMs, zone), rpe: entry.summary?.workoutRpe ?? null, feel: entry.summary?.workoutFeel ?? null, avgHeartRate: entry.summary?.avgHeartRate ?? null })), today());
  const ftpCard = ftpTestCard(sport, view.entries.filter((entry) => entry.sport === sport), settings, openActivity);
  if (ftpCard) cards.push(ftpCard);
  const summary = summaryCard(scored, workouts, log, sport);
  if (summary) cards.push(summary);
  if (result?.checklist.length) cards.push(todayCard(result, scored, fatigue, view.entries.filter((entry) => entry.sport === sport)));
  const week = result?.checklist.length ? node("section", { class: "card diary-plan" }) : null;
  if (week) cards.push(week);
  const next = node("section", { class: "card fitness-next" });
  cards.push(next);
  if (plan?.outlook) cards.push(outlookCard(plan));
  cards.push(adherenceCard(sport, workouts, log));
  if (plan) cards.push(progressCard(sport, view.entries.filter((entry) => entry.sport === sport), plan, settings));
  cards.push(workoutsCard(sport, scored));
  const settingsLink = node("button", { type: "button", class: "link-button" }, t("trainingEditSettings"));
  settingsLink.addEventListener("click", () => openSettings(sport));
  cards.push(settingsLink);
  content.replaceChildren(...cards);
  // Drawn once in the page, as the week's figures measure their column.
  renderNextStep(next, view.entries, sport);
  if (week) {
    const byDay = {};
    for (const item of scored) if (item.result) (byDay[item.day] ??= []).push(item.result.score);
    drawPlanCard(week, result, { scores: byDay, withNextStep: true, excused: excuses(), onExcuse: (day) => openExcuse(day, render) });
  }
}

export async function showTraining() {
  view.entries = (await listEntries().catch(() => [])).map(withCleanHeartRate);
  render();
}

export const rerenderTraining = () => {
  if (!byId("trainingView").hidden) render();
};

export function setupTraining({ onOpen }) {
  openActivity = onOpen;
  byId("trainingSport").addEventListener("change", (event) => {
    view.sport = event.target.value;
    saveDefaults({ training: { sport: view.sport } });
    render();
  });
  window.addEventListener("settings-change", rerenderTraining);
}

