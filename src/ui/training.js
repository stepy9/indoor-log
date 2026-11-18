import { workoutKind } from "../analysis.js";
import { addDays, dayKey, weekNumber } from "../diary.js";
import { listEntries } from "../library.js";
import { withCleanHeartRate } from "../fitness.js";
import { adherenceShare, dayStreak, lastMondays, weekAdherence } from "../training.js";
import { drawPlanCard, scoreBadge } from "./diary.js";
import { renderNextStep, trainingPlan } from "./fitness.js";
import { anyTraining, hasTraining, planLog, scoreFor } from "./score.js";
import { openSettings, settingsFor } from "./settings.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { byId, sportLabel, state, t, zone } from "./context.js";

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
  const weeks = lastMondays(now, 8).map((monday) => weekAdherence(log, workouts, monday, now));
  const recent = weeks.slice(-4);
  const share = adherenceShare(recent);
  const scores = workouts.filter((workout) => workout.day > addDays(now, -28) && Number.isFinite(workout.score)).map((workout) => workout.score);
  const average = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
  const streak = dayStreak(workouts.map((workout) => workout.day), now);
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
      node("td", {}, `${week.ridden}/${week.planned}${week.extra ? ` +${week.extra}` : ""}`),
      node("td", {}, pair(week.long)),
      node("td", {}, pair(week.intervals)),
    );
    const scoreCell = node("td");
    if (week.score != null) scoreCell.append(scoreBadge(week.score));
    row.append(scoreCell);
    table.tBodies[0].append(row);
  }
  card.append(table, node("p", { class: "field-note" }, t("trainingWeeksNote")));
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
    row.append(top, node("span", { class: "field-note training-workout-why" }, result ? partsText(result) : t("scoreNone")));
    list.append(row);
  }
  card.append(list, node("p", { class: "field-note" }, t("trainingScoreNote")));
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
  const scored = view.entries.filter((entry) => entry.sport === sport).map((entry) => ({ entry, day: dayKey(entry.startMs, zone), result: scoreFor(entry, plan) }));
  const workouts = scored.map(({ entry, day, result: item }) => ({ day, minutes: (entry.summary?.timerSeconds ?? 0) / 60, kind: workoutKind(entry), ftpTest: item?.as === "ftpTest", score: item?.score ?? null }));
  const cards = [];
  const week = result?.checklist.length ? node("section", { class: "card diary-plan" }) : null;
  if (week) cards.push(week);
  const next = node("section", { class: "card fitness-next" });
  cards.push(next);
  cards.push(adherenceCard(sport, workouts, log), workoutsCard(sport, scored));
  const settingsLink = node("button", { type: "button", class: "link-button" }, t("trainingEditSettings"));
  settingsLink.addEventListener("click", () => openSettings(sport));
  cards.push(settingsLink);
  content.replaceChildren(...cards);
  // Drawn once in the page, as the week's figures measure their column.
  renderNextStep(next, view.entries, sport);
  if (week) {
    const byDay = {};
    for (const item of scored) if (item.result) (byDay[item.day] ??= []).push(item.result.score);
    drawPlanCard(week, result, { scores: byDay });
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

