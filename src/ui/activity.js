// The activity detail: everything known about one activity, read only, opened from the calendar, the library and
// wherever else an activity is clicked. Comparing it and editing it are a button away.
import { bestAverage, lapValue, paceFrom, series, downsample, workoutKind } from "../analysis.js";
import { deleteEntry, listEntries } from "../library.js";
import { sameWorkoutHistory } from "../same-workout.js";
import { aerobicEffect, benefitGroup, decoupling, forSport, primaryBenefit, workKilojoules } from "../fitness.js";
import { dayKey } from "../diary.js";
import { hasTraining, planLog, scoreFor } from "./score.js";
import { scoreBadge } from "./diary.js";
import { trainingPlan, zoneGroups } from "./fitness.js";
import { partsText } from "./training.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";
import { kindLabel } from "./library.js";
import { perKgText, settingsFor } from "./settings.js";
import { stretchBlock, strengthLog, warmupLog } from "./recovery.js";
import { afterWorkout, strengthLevel, strengthSession, warmupBefore } from "../recovery.js";

const svgNs = "http://www.w3.org/2000/svg";
// The day stretching after a row came into the app.
const stretchingSince = "2026-11-18";
const dialog = byId("activityDialog");
const view = { entry: null, entries: [], metric: "power" };
let onCompare = () => {};
let onEdit = () => {};

const locale = () => (state.language === "en" ? "en-GB" : "cs-CZ");
const longDate = (ms) => new Intl.DateTimeFormat(locale(), {
  timeZone: zone, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
}).format(new Date(ms));
const dayDate = (ms) => new Intl.DateTimeFormat(locale(), { timeZone: zone, day: "numeric", month: "numeric", year: "2-digit" }).format(new Date(ms));
const el = (tag, className = "", text = "") => Object.assign(document.createElement(tag), { className, textContent: text });
const unit = (value, suffix, digits = 0) => (Number.isFinite(value) ? `${displayNumber(value, digits)} ${suffix}` : null);
const cadenceUnit = (sport) => (sport === "running" ? "spm" : "rpm");

function paceText(value, sport) {
  if (!Number.isFinite(value)) return null;
  if (sport === "cycling") return `${displayNumber(value, 1)} km/h`;
  return `${formatDuration(value)} /${sport === "rowing" ? "500 m" : "km"}`;
}

function metricText(value, metric, sport) {
  if (metric === "pace") return paceText(value, sport);
  if (metric === "power") return unit(value, "W");
  if (metric === "heartRate") return unit(value, "bpm");
  return unit(value, cadenceUnit(sport));
}

const metricName = (metric, sport) => (metric === "pace" ? t(sport === "cycling" ? "lapSpeed" : "lapPace") : t({ power: "lapPower", heartRate: "lapHeartRate", cadence: "lapCadence" }[metric]));

// The metrics the activity has data for, in the order the chart offers them.
const metricsOf = (entry) => ["power", "pace", "heartRate", "cadence"].filter((metric) => {
  const field = { power: "power", pace: "speed", heartRate: "heartRate", cadence: "cadence" }[metric];
  return (entry.records?.[field] ?? []).some((value) => Number.isFinite(value) && value > 0);
});

// The benefit with its group in brackets, unless its name says the group already ("Anaerobic capacity", not "… (Anaerobic)").
export function benefitText(benefit) {
  const name = t(`benefit_${benefit}`);
  const group = t(`benefitGroup_${benefitGroup[benefit]}`);
  return name.toLowerCase().includes(group.toLowerCase()) ? name : `${name} (${group})`;
}

function tiles(entry, settings) {
  const { summary, sport } = entry;
  const watts = (value) => (Number.isFinite(value) ? [unit(value, "W"), perKgText(value, entry.startMs)].filter(Boolean).join(" · ") : null);
  const max = forSport(settings, sport, entry.startMs).maxHeartRate;
  const beats = (value) => (Number.isFinite(value) ? [unit(value, "bpm"), max > 0 ? `${displayNumber((value / max) * 100)} %` : ""].filter(Boolean).join(" · ") : null);
  const benefit = primaryBenefit(entry, settings);
  const effect = aerobicEffect(entry, settings);
  const feelFaces = { 0: "😫", 25: "🙁", 50: "😐", 75: "🙂", 100: "😄" };
  const list = [
    [t("feel"), summary.workoutFeel != null ? `${feelFaces[summary.workoutFeel] ?? ""} ${t(`feel${summary.workoutFeel}`)}`.trim() : null],
    [t("rpe"), summary.workoutRpe ? `${summary.workoutRpe} – ${t(`rpe${summary.workoutRpe}`)}` : null],
    [t("lapTime"), formatDuration(summary.timerSeconds)],
    [t("lapDistanceColumn"), summary.distance > 0 ? unit(summary.distance / 1000, "km", 2) : null],
    [metricName("pace", sport), paceText(paceFrom(summary.timerSeconds > 0 ? summary.distance / summary.timerSeconds : null, sport), sport)],
    [t("compareAvgPower"), watts(summary.avgPower)],
    [t("compareMaxPower"), watts(summary.maxPower)],
    [t("compareAvgHeartRate"), beats(summary.avgHeartRate)],
    [t("compareMaxHeartRate"), beats(summary.maxHeartRate)],
    [t("compareAvgCadence"), unit(summary.avgCadence, cadenceUnit(sport))],
    [t("compareCalories"), unit(summary.calories, "kcal")],
    [t("compareWork"), unit(workKilojoules(entry), "kJ")],
    [t("compareBenefit"), benefit ? benefitText(benefit.benefit) : null],
    [t("compareAerobicEffect"), effect ? `${displayNumber(effect.value, 1)} ${t(`teLevel_${effect.level}`)}` : null],
  ];
  const box = el("div", "diary-tiles activity-tiles");
  box.append(...list.filter(([, value]) => value).map(([label, value]) => {
    const tile = el("div", "diary-tile");
    tile.append(el("span", "diary-tile-label", label), el("span", "diary-tile-value", value));
    return tile;
  }));
  return box;
}

// One line over time, the laps' intensities shaded behind it.
function chart(entry) {
  const metrics = metricsOf(entry);
  if (!metrics.length || !(entry.records?.seconds?.length > 1)) return null;
  if (!metrics.includes(view.metric)) view.metric = metrics[0];
  const card = el("section", "card activity-chart-card");
  const head = el("div", "panel-title-row");
  const switcher = el("div", "segmented");
  switcher.setAttribute("role", "group");
  switcher.append(...metrics.map((metric) => {
    const button = el("button", "", metricName(metric, entry.sport));
    button.type = "button";
    button.setAttribute("aria-pressed", String(metric === view.metric));
    button.addEventListener("click", () => {
      view.metric = metric;
      card.replaceWith(chart(entry));
    });
    return button;
  }));
  head.append(el("span", "field-label", t("activityCourse")), switcher);
  const width = 800;
  const height = 220;
  const pad = { left: 52, right: 8, top: 16, bottom: 22 };
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("class", "activity-chart");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", metricName(view.metric, entry.sport));
  const points = downsample(series(entry, view.metric, { axis: "time", smoothSeconds: 10 }).filter((point) => Number.isFinite(point.y)), 600);
  if (points.length < 2) return null;
  const end = entry.records.seconds.at(-1) || 1;
  const ys = points.map((point) => point.y);
  let low = Math.min(...ys);
  let high = Math.max(...ys);
  if (high === low) high = low + 1;
  const span = high - low;
  low -= span * 0.05;
  high += span * 0.05;
  const inverted = view.metric === "pace" && entry.sport !== "cycling";
  const x = (second) => pad.left + (second / end) * (width - pad.left - pad.right);
  const y = (value) => {
    const share = (value - low) / (high - low);
    return pad.top + (inverted ? share : 1 - share) * (height - pad.top - pad.bottom);
  };
  const add = (tag, attributes, text = "") => {
    const node = document.createElementNS(svgNs, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text) node.textContent = text;
    svg.append(node);
    return node;
  };
  // Interval laps as the converter's chart shows them: a band along the top coloured by the lap's type
  // and a dashed line where each one starts. A steady row's distance laps are left out.
  const laps = entry.laps ?? [];
  if (laps.length >= 2 && (entry.intervalLaps || laps.some((lap) => lap.intensity && lap.intensity !== "active"))) {
    laps.forEach((lap, index) => {
      const from = Math.max(0, (lap.startMs - entry.startMs) / 1000);
      const to = Math.min(end, laps[index + 1] ? (laps[index + 1].startMs - entry.startMs) / 1000 : end);
      if (!(to > from)) return;
      const type = lap.intensity ?? "active";
      add("rect", { x: x(from) + (index ? 1 : 0), y: 2, width: Math.max(1, x(to) - x(from) - (index ? 1 : 0)), height: 5, class: `activity-chart-band is-${type}` });
      if (index) add("line", { x1: x(from), x2: x(from), y1: 8, y2: height - pad.bottom, class: `activity-chart-split is-${type}` });
    });
  }
  for (const value of [low + (high - low) * 0.1, (low + high) / 2, high - (high - low) * 0.1]) {
    add("line", { x1: pad.left, x2: width - pad.right, y1: y(value), y2: y(value), class: "activity-chart-grid" });
    add("text", { x: pad.left - 6, y: y(value) + 4, class: "activity-chart-label", "text-anchor": "end" },
      view.metric === "pace" && entry.sport !== "cycling" ? formatDuration(value) : displayNumber(value, view.metric === "pace" ? 1 : 0));
  }
  const step = end > 3600 ? 900 : end > 1200 ? 300 : 60;
  for (let second = step; second < end; second += step) {
    add("text", { x: x(second), y: height - 6, class: "activity-chart-label", "text-anchor": "middle" }, formatDuration(second));
  }
  add("path", { d: points.map((point, index) => `${index ? "L" : "M"}${x(point.x).toFixed(1)},${y(point.y).toFixed(1)}`).join(""), class: "activity-chart-line" });
  card.append(head, svg);
  return card;
}

function lapsTable(entry) {
  const laps = entry.laps ?? [];
  if (laps.length < 2) return null;
  const sport = entry.sport;
  const intensityKey = { warmup: "intensityWarmup", active: "intensityActive", recovery: "intensityRecovery", rest: "intensityRest", cooldown: "intensityCooldown" };
  const columns = [
    [t("activityLap"), (lap, index) => `${index + 1}${intensityKey[lap.intensity] ? ` · ${t(intensityKey[lap.intensity])}` : ""}`],
    [t("lapTime"), (lap) => formatDuration(lap.timerSeconds)],
    [t("lapDistanceColumn"), (lap) => unit(lap.distance, "m")],
    [metricName("pace", sport), (lap) => paceText(lapValue(lap, "pace", sport), sport)],
    [metricName("power"), (lap) => unit(lap.avgPower, "W")],
    [metricName("heartRate"), (lap) => unit(lap.avgHeartRate, "bpm")],
    [metricName("cadence"), (lap) => unit(lap.avgCadence, cadenceUnit(sport))],
    [t("resistance"), (lap) => (lap.resistance ?? entry.resistance ? String(lap.resistance ?? entry.resistance) : null)],
  ].filter(([, cell]) => laps.some((lap, index) => cell(lap, index)));
  const table = el("table", "laps-table card-table");
  const head = document.createElement("tr");
  head.append(...columns.map(([label]) => el("th", "", label)));
  table.append(document.createElement("thead"), document.createElement("tbody"));
  table.tHead.append(head);
  table.tBodies[0].append(...laps.map((lap, index) => {
    const row = document.createElement("tr");
    row.append(...columns.map(([label, cell]) => {
      const td = el("td", "", cell(lap, index) ?? "—");
      td.dataset.label = label;
      return td;
    }));
    return row;
  }));
  const card = el("section", "card");
  const scroll = el("div", "laps-scroll");
  scroll.append(table);
  card.append(el("span", "field-label", t("activityLaps")), scroll);
  return card;
}

function bestEfforts(entry) {
  const durations = [10, 60, 300, 1200].filter((seconds) => (entry.records?.seconds?.at(-1) ?? 0) >= seconds);
  const values = durations.map((seconds) => [seconds, bestAverage(entry, "power", seconds)]).filter(([, watts]) => Number.isFinite(watts));
  if (!values.length) return null;
  const card = el("section", "card");
  const box = el("div", "diary-tiles activity-tiles is-compact");
  box.append(...values.map(([seconds, watts]) => {
    const tile = el("div", "diary-tile");
    tile.append(el("span", "diary-tile-label", formatDuration(seconds)), el("span", "diary-tile-value", unit(watts, "W")));
    return tile;
  }));
  card.append(el("span", "field-label", t("activityBest")), box);
  return card;
}

// The last time through the same workout, against this one, and the way to put them side by side.
function sameWorkout(entry) {
  const history = sameWorkoutHistory(entry, view.entries);
  if (!history?.earlier.length) return null;
  const last = history.earlier[0];
  const signed = (value, digits, suffix) => (value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : "±"}${displayNumber(Math.abs(value), digits)}${suffix}`);
  const text = t(last.change.power != null ? "sameSummary" : "sameSummaryHeart", {
    day: dayDate(last.entry.startMs), power: signed(last.change.power, 0, " W"), heart: signed(last.change.heartRate, 0, " bpm"), efficiency: signed(last.change.efficiency, 1, " %"),
  });
  const card = el("section", "card");
  const link = el("button", "link-button", t("activityCompareSame"));
  link.type = "button";
  link.addEventListener("click", () => compare(last.entry));
  const line = el("p", "compare-same-summary", `${text} `);
  line.append(link);
  card.append(el("span", "field-label", t("sameTitle", { count: history.earlier.length })), line);
  return card;
}

// What the day's plan asked for and how the workout kept it: the score with each part's tick, as the Training tab
// lists them. Only for a sport with the Training section filled in, and a workout it scores.
function planCard(entry, settings) {
  if (!hasTraining(settings, entry.sport)) return null;
  const plan = trainingPlan(view.entries, entry.sport)?.plan ?? null;
  const scored = plan ? scoreFor(entry, plan, settings) : null;
  const planned = planLog(entry.sport)[dayKey(entry.startMs, zone)] ?? null;
  if (!scored && !planned) return null;
  const card = el("section", "card activity-plan");
  const head = el("div", "panel-title-row");
  head.append(el("span", "field-label", t("activityPlan")));
  card.append(head);
  // The score sits by the title. What was planned and what it was scored as are said only when they tell something:
  // a day without a plan, a workout scored as other than planned, or one not scored.
  if (scored) byId("activityDetailName").append(scoreBadge(scored.score));
  if (!(planned && scored && planned.type === scored.as)) {
    card.append(el("p", "activity-plan-facts", [
      planned ? t("activityPlanned", { planned: t(`scorePlanned_${planned.type}`) }) : t("activityUnplanned"),
      scored ? t("activityScoredAs", { as: t(`scoreAs_${scored.as ?? "none"}`) }) : t("scoreNone"),
    ].join(" · ")));
  }
  if (scored) {
    const list = el("ul", "activity-plan-parts");
    list.append(...partsText(scored).split(" · ").filter(Boolean).map((part) => {
      const mark = part[0];
      return el("li", mark === "✓" ? "is-good" : mark === "✗" ? "is-poor" : mark === "~" ? "is-fair" : "", part);
    }));
    card.append(list);
  }
  return card;
}

// How hard it was: the time in each heart rate and power zone, as Analysis shows them for a period, and for a steady
// workout the decoupling (the heart drifting from the work in the second half) and the work per heartbeat.
function intensityCard(entry, settings) {
  const drift = decoupling(entry);
  const zones = el("div", "fitness-zones");
  zones.append(...zoneGroups([entry], settings, entry.sport));
  const card = el("section", "card");
  card.append(el("span", "field-label", t("activityIntensity")), zones);
  if (drift) {
    const box = el("div", "diary-tiles activity-tiles is-compact activity-drift");
    const tile = (label, value, className = "") => {
      const node = el("div", "diary-tile");
      node.append(el("span", "diary-tile-label", label), el("span", `diary-tile-value ${className}`, value));
      return node;
    };
    const percent = drift.percent;
    box.append(
      tile(t("fitnessDecouplingTitle"), `${displayNumber(percent, 1)} %`, percent < 5 ? "is-better" : percent < 10 ? "" : "is-worse"),
      tile(t("samePerBeat"), drift.by === "power" ? `${displayNumber(drift.efficiency, 2)} W/bpm` : `${displayNumber(drift.efficiency, 2)} m/bpm`),
      tile(t("activityDriftHeart"), `${displayNumber(drift.heart)} bpm`),
    );
    card.append(box, el("p", "field-note", t(percent < 5 ? "activityDriftGood" : percent < 10 ? "activityDriftFair" : "activityDriftPoor")));
  }
  return card;
}

// A chip for a set of exercises done around the row; hovering it, or tapping it on a phone, lists the exercises.
function sessionChip(label, ids, done) {
  const chip = el("span", `activity-chip${done ? " is-done" : ""}`);
  chip.tabIndex = 0;
  chip.append(el("span", "", `${done ? "✓ " : ""}${label}`));
  if (ids.length) {
    const list = el("ul", "activity-chip-list");
    list.append(...ids.map((id) => el("li", "", t(`recovery_${id}`))));
    chip.append(list);
  }
  return chip;
}

// The warm-up, the strength session and the stretching of the activity's day, beside its title. The warm-up and the
// strength show once done (the logs keep the day, the sets follow from it); the stretching offers its button until done.
// The warm-up's set is taken from the activity: the full one before intervals, the short one otherwise.
function renderSessions(entry, settings) {
  const box = byId("activitySessions");
  box.replaceChildren();
  if (entry.sport === "rowing") {
    const day = new Date(entry.startMs).toISOString().slice(0, 10);
    // Logs since the exercises are kept give them; older ones (true) fall back to the set the day would have had.
    const kept = (value, fallback) => (Array.isArray(value) ? value : fallback());
    const warmed = warmupLog()[day];
    if (warmed) box.append(sessionChip(t("exercisesWarmup"), kept(warmed, () => warmupBefore(workoutKind(entry) === "intervals" ? "intervals" : "steady", day).exercises), true));
    const strong = strengthLog()[day];
    if (strong) box.append(sessionChip(t("exercisesStrength"), kept(strong, () => strengthSession(strengthLevel(strengthLog(), day).steps).doses.map((dose) => dose.id)), true));
    const plan = afterWorkout({ benefit: primaryBenefit(entry, settings)?.benefit ?? null, seconds: entry.summary.timerSeconds, day });
    if (entry.stretched) box.append(sessionChip(t("exercisesStretch"), entry.stretchedExercises ?? plan.exercises, true));
    // Stretching came in on 18 November 2026: an activity before it is not offered one it could not have had.
    else if (day >= stretchingSince) {
      try {
        const button = stretchBlock(entry, settings).querySelector("button");
        if (button) {
          button.className = "activity-chip is-action";
          button.textContent = `▶ ${t("exercisesStretch")} · ${plan.minutes} min`;
          button.title = plan.exercises.map((id) => t(`recovery_${id}`)).join(", ");
          box.append(button);
        }
      } catch {}
    }
  }
  box.hidden = !box.childElementCount;
}

function render() {
  const entry = view.entry;
  const settings = settingsFor(view.entries);
  byId("activityDetailName").textContent = entry.name.replace(/^Kinomap - /, "");
  const meta = [longDate(entry.startMs), sportLabel(entry.sport), kindLabel(workoutKind(entry), entry.sport),
    entry.resistance ? `${t("resistance")} ${entry.resistance}` : null].filter(Boolean);
  byId("activityMeta").textContent = meta.join(" · ");
  const index = view.entries.findIndex((other) => other.id === entry.id);
  byId("activityNewer").disabled = index <= 0;
  byId("activityOlder").disabled = index < 0 || index >= view.entries.length - 1;
  renderSessions(entry, settings);
  byId("activityBody").replaceChildren(...[
    tiles(entry, settings), planCard(entry, settings), chart(entry), intensityCard(entry, settings), lapsTable(entry), bestEfforts(entry), sameWorkout(entry),
  ].filter(Boolean));
}

function show(entry) {
  view.entry = entry;
  render();
  byId("activityBody").scrollTop = 0;
}

function compare(other = null) {
  const entry = view.entry;
  close();
  onCompare(entry, other);
}

function step(by) {
  const index = view.entries.findIndex((other) => other.id === view.entry.id);
  const next = view.entries[index + by];
  if (!next) return;
  show(next);
  history.replaceState(history.state, "", `#a=${encodeURIComponent(next.id)}`);
}

function close() {
  if (dialog.open) dialog.close();
}

export async function openActivity(entry) {
  view.entries = await listEntries();
  // The newest copy from the library, so an edit since the click shows.
  view.entry = view.entries.find((other) => other.id === entry.id) ?? entry;
  render();
  if (!dialog.open) {
    dialog.showModal();
    // Back on a phone closes the detail rather than leaving the app.
    if (!location.hash.startsWith("#a=")) history.pushState({ activity: true }, "", `#a=${encodeURIComponent(view.entry.id)}`);
  }
  byId("activityBody").scrollTop = 0;
}

export function setupActivity({ onCompare: compareWith, onEdit: edit }) {
  onCompare = compareWith;
  onEdit = edit;
  byId("activityClose").addEventListener("click", close);
  byId("activityCompare").addEventListener("click", () => compare());
  byId("activityEdit").addEventListener("click", () => {
    const entry = view.entry;
    close();
    onEdit(entry);
  });
  byId("activityDelete").addEventListener("click", async () => {
    if (!window.confirm(t("libraryDeleteConfirm", { name: view.entry.name }))) return;
    await deleteEntry(view.entry.id);
    close();
  });
  byId("activityNewer").addEventListener("click", () => step(-1));
  byId("activityOlder").addEventListener("click", () => step(1));
  dialog.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea")) return;
    if (event.key === "ArrowLeft") step(1);
    if (event.key === "ArrowRight") step(-1);
  });
  dialog.addEventListener("close", () => {
    if (location.hash.startsWith("#a=")) {
      if (history.state?.activity) history.back();
      else history.replaceState(null, "", location.pathname + location.search);
    }
  });
  window.addEventListener("popstate", () => {
    if (!location.hash.startsWith("#a=")) close();
  });
  window.addEventListener("settings-change", () => dialog.open && render());
  // A link straight to an activity opens it once the library is there.
  const match = location.hash.match(/^#a=(.+)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    listEntries().then((entries) => {
      const entry = entries.find((other) => String(other.id) === id);
      if (entry) openActivity(entry);
      else history.replaceState(null, "", location.pathname + location.search);
    }).catch(() => {});
  }
}
