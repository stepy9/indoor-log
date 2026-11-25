// The activity detail: everything known about one activity, read only, opened from the calendar, the library and
// wherever else an activity is clicked. Comparing it and editing it are a button away.
import { bestAverage, bestTime, effortDistances, lapValue, paceFrom, series, downsample, workoutKind } from "../analysis.js";
import { deleteEntry, listEntries, saveEntries } from "../library.js";
import { sameWorkoutHistory } from "../same-workout.js";
import { activityLoad, aerobicEffect, benefitGroup, decoupling, forSport, primaryBenefit, workKilojoules } from "../fitness.js";
import { dayKey } from "../diary.js";
import { hasTraining, planLog, scoreFor, steadyTargets } from "./score.js";
import { scoreBadge } from "./diary.js";
import { trainingPlan, zoneGroups } from "./fitness.js";
import { partsText } from "./training.js";
import { byId, displayNumber, formatDuration, sportLabel, state, t, zone } from "./context.js";
import { kindLabel } from "./library.js";
import { perKgText, settingsFor } from "./settings.js";
import { sessionLines, stretchBlock } from "./recovery.js";
import { afterWorkout } from "../recovery.js";

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
  const max = forSport(settings, sport, entry.startMs).maxHeartRate;
  const benefit = primaryBenefit(entry, settings);
  const effect = aerobicEffect(entry, settings);
  const feelFaces = { 0: "😫", 25: "🙁", 50: "😐", 75: "🙂", 100: "😄" };
  // Average and maximum together, "86 / 121 W": either alone when the other is missing.
  const pair = (low, high, suffix, digits = 0) => {
    const values = [low, high].filter(Number.isFinite);
    return values.length ? `${values.map((value) => displayNumber(value, digits)).join(" / ")} ${suffix}` : null;
  };
  const kg = [summary.avgPower, summary.maxPower].filter(Number.isFinite).map((watts) => perKgText(watts, entry.startMs).replace(" W/kg", "")).filter(Boolean);
  const feel = summary.workoutFeel != null ? `${feelFaces[summary.workoutFeel] ?? ""} ${t(`feel${summary.workoutFeel}`)}`.trim() : null;
  const effort = summary.workoutRpe ? `${summary.workoutRpe} – ${t(`rpe${summary.workoutRpe}`)}` : null;
  // Pairs that belong together share a tile, the second value small under the first, so the numbers fit two rows.
  const list = [
    [t("feel"), feel ?? effort, feel && effort ? `${t("rpe")}: ${effort}` : null],
    [t("lapTime"), formatDuration(summary.timerSeconds)],
    [t("lapDistanceColumn"), summary.distance > 0 ? unit(summary.distance / 1000, "km", 2) : null],
    [metricName("pace", sport), paceText(paceFrom(summary.timerSeconds > 0 ? summary.distance / summary.timerSeconds : null, sport), sport)],
    [t("activityPower"), pair(summary.avgPower, summary.maxPower, "W"), kg.length ? `${kg.join(" / ")} W/kg` : null],
    [t("activityHeart"), pair(summary.avgHeartRate, summary.maxHeartRate, "bpm"),
      max > 0 ? pair(...[summary.avgHeartRate, summary.maxHeartRate].map((value) => (Number.isFinite(value) ? (value / max) * 100 : null)), "% max") : null],
    [t("compareAvgCadence"), unit(summary.avgCadence, cadenceUnit(sport))],
    [t("compareCalories"), unit(summary.calories, "kcal")],
    [t("compareWork"), unit(workKilojoules(entry), "kJ")],
    [t("activityLoad"), loadText(entry, settings)],
    [t("compareBenefit"), benefit ? t(`benefit_${benefit.benefit}`) : effect ? `TE ${displayNumber(effect.value, 1)}` : null,
      // The group only when the name does not say it already (benefitText adds it in brackets then).
      [benefit && benefitText(benefit.benefit) !== t(`benefit_${benefit.benefit}`) ? t(`benefitGroup_${benefitGroup[benefit.benefit]}`) : null,
        benefit && effect ? `TE ${displayNumber(effect.value, 1)} ${t(`teLevel_${effect.level}`)}` : null].filter(Boolean).join(" · ") || null],
  ];
  const box = el("div", "diary-tiles activity-tiles");
  box.append(...list.filter(([, value]) => value).map(([label, value, sub]) => {
    const tile = el("div", "diary-tile");
    tile.append(el("span", "diary-tile-label", label), el("span", "diary-tile-value", value));
    if (sub) tile.append(el("span", "diary-tile-change activity-tile-sub", sub));
    return tile;
  }));
  // The day's plan and how it was kept, a wide tile at the end.
  const planned = planTile(entry, settings);
  if (planned) box.append(planned);
  return box;
}

// One line over time, the laps' intensities shaded behind it, and what a steady workout was given to hold: a band
// for a range, a dashed line for the power to start at, with the time kept in the range under the chart.
function chart(entry, targets = null) {
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
      card.replaceWith(chart(entry, targets));
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
  const target = targets?.[view.metric] ?? null;
  // The target stays in view even where the workout kept away from it.
  const bounds = target ? target.range ?? [target.value, target.value] : [];
  let low = Math.min(...ys, ...bounds);
  let high = Math.max(...ys, ...bounds);
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
  if (target?.range) {
    add("rect", { x: pad.left, width: width - pad.left - pad.right, y: Math.min(y(target.range[0]), y(target.range[1])), height: Math.abs(y(target.range[0]) - y(target.range[1])), class: "activity-chart-target" });
  } else if (target) {
    add("line", { x1: pad.left, x2: width - pad.right, y1: y(target.value), y2: y(target.value), class: "activity-chart-target-line" });
  }
  const step = end > 3600 ? 900 : end > 1200 ? 300 : 60;
  for (let second = step; second < end; second += step) {
    add("text", { x: x(second), y: height - 6, class: "activity-chart-label", "text-anchor": "middle" }, formatDuration(second));
  }
  add("path", { d: points.map((point, index) => `${index ? "L" : "M"}${x(point.x).toFixed(1)},${y(point.y).toFixed(1)}`).join(""), class: "activity-chart-line" });
  card.append(head, svg);
  if (target) card.append(el("p", "activity-chart-note", targetText(target, view.metric, entry.sport)));
  return card;
}

// The plan's target under the chart: "Plan 128–142 bpm · in it 78 % · below 15 % · above 7 %".
function targetText(target, metric, sport) {
  if (!target.range) return t("activityTargetStart", { value: metricText(target.value, metric, sport) });
  const range = `${target.range.join("–")} ${metric === "heartRate" ? "bpm" : cadenceUnit(sport)}`;
  const percent = (share) => `${Math.round(share * 100)} %`;
  const { shares } = target;
  return [t("activityTarget", { range }), shares && t("activityTargetShares", { inside: percent(shares.inside), below: percent(shares.below), above: percent(shares.above) })].filter(Boolean).join(" · ");
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

// Each activity's best power over a time and best time over a distance, kept while the dialog is open: the records
// compare one activity against all the earlier ones.
const bestCache = new Map();
function cachedBest(entry, key, compute) {
  const id = `${entry.id}:${key}`;
  if (!bestCache.has(id)) bestCache.set(id, compute());
  return bestCache.get(id);
}

// How the effort stands against the same sport's earlier activities: a personal record (★) when none before beat it,
// else the best of the last 90 days (☆); null otherwise or with nothing earlier to beat.
function recordMark(entry, value, key, compute, higherBetter) {
  if (!Number.isFinite(value)) return null;
  const earlier = view.entries.filter((other) => other.sport === entry.sport && other.startMs < entry.startMs);
  if (!earlier.length) return null;
  const better = (a, b) => (higherBetter ? a > b : a < b);
  const beats = (list) => list.every((other) => {
    const theirs = cachedBest(other, key, () => compute(other));
    return !Number.isFinite(theirs) || !better(theirs, value) && theirs !== value;
  });
  if (beats(earlier)) return "record";
  const recent = earlier.filter((other) => other.startMs >= entry.startMs - 90 * 86_400_000);
  return recent.length && beats(recent) ? "recent" : null;
}

function bestEfforts(entry) {
  const end = entry.records?.seconds?.at(-1) ?? 0;
  const powers = [10, 60, 300, 1200].filter((seconds) => end >= seconds).map((seconds) => {
    const compute = (one) => bestAverage(one, "power", seconds);
    const watts = cachedBest(entry, `p${seconds}`, () => compute(entry));
    return { label: formatDuration(seconds), value: unit(watts, "W"), mark: recordMark(entry, watts, `p${seconds}`, compute, true), ok: Number.isFinite(watts) };
  });
  const times = (effortDistances[entry.sport] ?? []).filter((meters) => (entry.summary.distance ?? 0) >= meters).map((meters) => {
    const compute = (one) => (one.records?.distance ? bestTime(one, meters) : null);
    const seconds = cachedBest(entry, `d${meters}`, () => compute(entry));
    return { label: meters >= 1000 ? `${displayNumber(meters / 1000, meters % 1000 ? 1 : 0)} km` : `${meters} m`, value: Number.isFinite(seconds) ? formatDuration(seconds) : null, mark: recordMark(entry, seconds, `d${meters}`, compute, false), ok: Number.isFinite(seconds) };
  });
  const items = [...powers, ...times].filter((item) => item.ok);
  if (!items.length) return null;
  const card = el("section", "card");
  const box = el("div", "diary-tiles activity-tiles is-compact");
  box.append(...items.map((item) => {
    const tile = el("div", `diary-tile${item.mark ? ` is-${item.mark}` : ""}`);
    const value = el("span", "diary-tile-value", item.value);
    if (item.mark) {
      value.append(el("span", "activity-record", item.mark === "record" ? " ★" : " ☆"));
      tile.title = t(item.mark === "record" ? "activityRecord" : "activityRecent");
    }
    tile.append(el("span", "diary-tile-label", item.label), value);
    return tile;
  }));
  card.append(el("span", "field-label", t("activityBest")), box);
  if (items.some((item) => item.mark)) card.append(el("p", "field-note", t("activityRecordNote")));
  return card;
}

// The activity's load and its share of the week's (Monday to Sunday, every sport), as the form curve counts it.
function loadText(entry, settings) {
  const own = activityLoad(entry, settings);
  if (!own) return null;
  const day = dayKey(entry.startMs, zone);
  const noon = Date.parse(`${day}T12:00:00Z`);
  const monday = new Date(noon - ((new Date(noon).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
  const sunday = new Date(Date.parse(`${monday}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const week = view.entries.filter((other) => {
    const key = dayKey(other.startMs, zone);
    return key >= monday && key <= sunday;
  }).reduce((sum, other) => sum + (other.id === entry.id ? own.load : activityLoad(other, settings)?.load ?? 0), 0);
  const share = week > 0 ? Math.round((own.load / week) * 100) : null;
  return [displayNumber(own.load), share != null && share < 100 ? t("activityLoadShare", { share }) : null].filter(Boolean).join(" · ");
}

// A note of the user's own on the activity, kept with it in the library (the FIT has no place for one): read as
// text, and changed in place with its own Save, the one thing the detail edits besides the converter.
function noteCard(entry) {
  const card = el("section", "card activity-note");
  const head = el("div", "panel-title-row");
  const edit = el("button", "link-button", t(entry.note ? "activityNoteEdit" : "activityNoteAdd"));
  edit.type = "button";
  head.append(el("span", "field-label", t("activityNote")), edit);
  const text = el("p", "activity-note-text", entry.note ?? "");
  text.hidden = !entry.note;
  card.append(head, text);
  edit.addEventListener("click", () => {
    const area = Object.assign(document.createElement("textarea"), { className: "activity-note-input", value: entry.note ?? "", rows: 3, maxLength: 2000 });
    area.placeholder = t("activityNotePlaceholder");
    const actions = el("div", "activity-note-actions");
    const save = el("button", "export-button", t("save"));
    const cancel = el("button", "outline-button", t("cancel"));
    save.type = cancel.type = "button";
    actions.append(cancel, save);
    edit.hidden = true;
    text.hidden = true;
    card.append(area, actions);
    area.focus();
    cancel.addEventListener("click", () => card.replaceWith(noteCard(entry)));
    save.addEventListener("click", async () => {
      const note = area.value.trim();
      if (note) entry.note = note;
      else delete entry.note;
      await saveEntries([entry]).catch(() => {});
      card.replaceWith(noteCard(entry));
    });
  });
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
function planTile(entry, settings) {
  if (!hasTraining(settings, entry.sport)) return null;
  const plan = trainingPlan(view.entries, entry.sport)?.plan ?? null;
  const scored = plan ? scoreFor(entry, plan, settings) : null;
  const planned = planLog(entry.sport)[dayKey(entry.startMs, zone)] ?? null;
  if (!scored && !planned) return null;
  // The score sits by the title. The tile names what was planned, capitalised; what it was scored as only when that
  // tells something: a day without a plan, a workout scored as other than planned, or one not scored.
  if (scored) byId("activityDetailName").append(scoreBadge(scored.score));
  const capital = (text) => text.charAt(0).toUpperCase() + text.slice(1);
  // Either FTP test planned (5 or 20 minutes) is scored as the FTP test: the same thing.
  const kindOf = (type) => (type?.startsWith("ftpTest") ? "ftpTest" : type);
  const same = planned && scored && kindOf(planned.type) === kindOf(scored.as);
  const head = planned ? capital(t(`scorePlanned_${planned.type}`)) : t("activityUnplanned");
  const tile = el("div", "diary-tile activity-plan-tile");
  const value = el("span", "diary-tile-value", head);
  tile.append(el("span", "diary-tile-label", t("activityPlan")), value);
  // A score without the day's plan says so beside what it was scored as, rather than as a line of its own.
  const approx = scored?.approx ? t("scoreApprox") : null;
  const sub = [same ? null : scored ? t("activityScoredAs", { as: t(`scoreAs_${scored.as ?? "none"}`) }) : t("scoreNone"), approx].filter(Boolean).join(" · ");
  if (sub) tile.append(el("span", "diary-tile-change activity-tile-sub", sub));
  if (scored) {
    const list = el("ul", "activity-plan-parts");
    list.append(...partsText(scored).split(" · ").filter((part) => part && part !== approx).map((part) => {
      const mark = part[0];
      return el("li", mark === "✓" ? "is-good" : mark === "✗" ? "is-poor" : mark === "~" ? "is-fair" : "", part);
    }));
    tile.append(list);
  }
  return tile;
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

// A chip for a set of exercises done around the row; hovering it, or tapping it on a phone, lists the exercises:
// their names, or lines given with the repeats or times, under the rounds when more than one.
function sessionChip(label, ids, done, { lines = null, rounds = 1 } = {}) {
  const chip = el("span", `activity-chip${done ? " is-done" : ""}`);
  chip.tabIndex = 0;
  chip.append(el("span", "", `${done ? "✓ " : ""}${label}`));
  const items = lines ?? ids.map((id) => t(`recovery_${id}`));
  if (items.length) {
    const list = el("ul", "activity-chip-list");
    if (rounds > 1) list.append(el("li", "activity-chip-rounds", t("sessionRounds", { rounds })));
    list.append(...items.map((text) => el("li", "", text)));
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
    // Each exercise with its repeats or time, the strength's rounds over them.
    const warmed = sessionLines("warmup", day);
    if (warmed) box.append(sessionChip(t("exercisesWarmup"), [], true, warmed));
    const strong = sessionLines("strength", day);
    if (strong) box.append(sessionChip(t("exercisesStrength"), [], true, strong));
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
    tiles(entry, settings), chart(entry, steadyTargets(entry, settings, trainingPlan(view.entries, entry.sport)?.workouts)), intensityCard(entry, settings), lapsTable(entry), bestEfforts(entry), sameWorkout(entry), noteCard(entry),
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
  bestCache.clear();
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
