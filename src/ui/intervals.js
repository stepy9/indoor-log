import { detectIntervals, kinomapPlanText, parseKinomapPlan } from "../core.js";
import { byId, displayNumber, formatDuration, t } from "./context.js";
import { levelFromPercent } from "./trainers.js";

// The trainer and resistance of the activity the dialog is open for; the plan preview reads them too.
let current = { trainer: null, resistance: null };

// Interval types offered for segments and laps, in workout order.
export const intensityOptions = [
  ["warmup", "intensityWarmup"],
  ["active", "intensityActive"],
  ["recovery", "intensityRecovery"],
  ["rest", "intensityRest"],
  ["cooldown", "intensityCooldown"],
];

export function intensitySelectElement(value, label, onChange) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  select.append(...intensityOptions.map(([option, key]) => new Option(t(key), option)));
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

// Reads "4:13" or "1:04:13" as milliseconds.
function parseOffset(text) {
  const parts = String(text).trim().split(":").map(Number);
  if (!parts.length || parts.length > 3 || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  return parts.reduce((total, part) => total * 60 + part, 0) * 1000;
}

function average(records, field, fromMs, toMs) {
  const numbers = records.filter((record) => record.timeMs >= fromMs && record.timeMs < toMs).map((record) => record[field]).filter(Number.isFinite);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
}

// The pasted plan as a table of its steps before it is loaded; the box grows with the plan, up to 16 lines.
function renderPlanPreview() {
  const text = byId("planText");
  text.rows = Math.min(16, Math.max(4, text.value.split("\n").length));
  const steps = parseKinomapPlan(text.value, 0);
  const table = byId("planPreview");
  table.hidden = !steps.length;
  // Percentages without a trainer have no levels to become, which the summary says rather than dropping them quietly.
  const noLevels = !current.trainer && steps.some((step) => step.resistancePercent > 0);
  byId("planSummary").textContent = steps.length ? t("planSummary", { count: steps.length, total: formatDuration(steps.at(-1).startMs / 1000) }) + (noLevels ? ` · ${t("planNoTrainer")}` : "") : "";
  if (!steps.length) return;
  const head = document.createElement("tr");
  head.append(...["#", t("segmentStart"), t("segmentDuration"), t("segmentTarget"), t("resistance"), t("lapType")].map((title) => Object.assign(document.createElement("th"), { textContent: title })));
  const types = Object.fromEntries(intensityOptions);
  const rows = steps.map((step, index) => {
    const next = steps[index + 1];
    const cells = [
      String(index + 1),
      formatDuration(step.startMs / 1000),
      next ? formatDuration((next.startMs - step.startMs) / 1000) : "—",
      step.target ? `${step.target} ${step.targetType === "power" ? "W" : "rpm"}` : "—",
      // Kinomap's percentage, and the level it makes on the chosen trainer.
      step.resistancePercent > 0 ? `${step.resistancePercent} %${current.trainer ? ` → ${levelFromPercent(step.resistancePercent, current.trainer)}` : ""}` : "—",
      t(types[step.intensity] ?? "intensityActive"),
    ];
    const row = document.createElement("tr");
    row.className = `is-${step.intensity}`;
    row.append(...cells.map((cell) => Object.assign(document.createElement("td"), { textContent: cell })));
    return row;
  });
  table.replaceChildren(head, ...rows);
}

// Edits a copy of the segments; Save hands back a sorted list that starts at the workout start.
// options: the activity's trainer, whose levels turn plan percentages into resistance, and its resistance.
export function openIntervalsDialog(workout, segments, onSave, options = {}) {
  current = { trainer: options.trainer ?? null, resistance: options.resistance ?? null };
  const dialog = byId("intervalsDialog");
  const { records, startMs, endMs } = workout;
  const cadenceUnit = workout.sport === "running" ? "spm" : "rpm";
  let draft = (segments?.length ? segments : [{ startMs, intensity: "active" }]).map((segment) => ({ ...segment }));

  const normalized = () => {
    const sorted = draft
      .map((segment) => ({ ...segment, startMs: Math.min(endMs - 1000, Math.max(startMs, segment.startMs)) }))
      .sort((a, b) => a.startMs - b.startMs)
      .filter((segment, index, list) => index === 0 || segment.startMs - list[index - 1].startMs >= 1000);
    sorted[0].startMs = startMs;
    return sorted;
  };

  const renderRows = () => {
    draft = normalized();
    const body = byId("intervalsRows");
    body.replaceChildren(...draft.map((segment, index) => {
      const nextMs = draft[index + 1]?.startMs ?? endMs;
      const row = document.createElement("tr");
      row.className = `is-${segment.intensity}`;

      // A min:s field that also steps by a second, or ten with Shift, on the arrow keys.
      const timeInput = (ms, label, column, apply) => {
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.value = formatDuration(ms / 1000);
        input.dataset.column = column;
        input.setAttribute("aria-label", `${label} ${index + 1}`);
        const commit = (valueMs) => {
          apply(valueMs);
          renderRows();
          const again = byId("intervalsRows").children[index]?.querySelector(`input[data-column="${column}"]`);
          again?.focus();
          again?.setSelectionRange(again.value.length, again.value.length);
        };
        input.addEventListener("keydown", (event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          const step = (event.shiftKey ? 10_000 : 1000) * (event.key === "ArrowUp" ? 1 : -1);
          commit((parseOffset(input.value) ?? ms) + step);
        });
        input.addEventListener("change", () => {
          const value = parseOffset(input.value);
          input.classList.toggle("is-invalid", value == null);
          if (value != null) commit(value);
        });
        return input;
      };

      // Moving a start shifts the boundary with the previous segment; with durations locked the later segments move along.
      const start = timeInput(segment.startMs - startMs, t("segmentStart"), "start", (offset) => {
        const previousMs = draft[index - 1]?.startMs ?? startMs;
        const locked = byId("lockDurations").checked;
        const movedMs = Math.max(previousMs + 1000, locked ? startMs + offset : Math.min(nextMs - 1000, startMs + offset));
        const delta = movedMs - segment.startMs;
        segment.startMs = movedMs;
        if (locked) for (const later of draft.slice(index + 1)) later.startMs += delta;
      });
      start.disabled = index === 0;

      // Changing a duration moves every later segment with it; the last one simply ends with the workout.
      const isLast = index === draft.length - 1;
      const duration = timeInput(nextMs - segment.startMs, t("segmentDuration"), "duration", (value) => {
        const delta = Math.max(1000, value) - (nextMs - segment.startMs);
        for (const later of draft.slice(index + 1)) later.startMs += delta;
      });
      duration.disabled = isLast;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "link-button";
      remove.textContent = "×";
      remove.title = t("removeSegment");
      remove.setAttribute("aria-label", `${t("removeSegment")} ${index + 1}`);
      remove.disabled = draft.length === 1;
      remove.addEventListener("click", () => {
        draft.splice(index, 1);
        renderRows();
      });

      // Target: none, cadence or power, with one value the segment aims for.
      const target = document.createElement("span");
      target.className = "target-cell";
      const targetType = document.createElement("select");
      targetType.setAttribute("aria-label", `${t("segmentTarget")} ${index + 1}`);
      targetType.append(new Option(t("targetNone"), ""), new Option(cadenceUnit, "cadence"), new Option("W", "power"));
      targetType.value = segment.targetType ?? "";
      const targetValue = document.createElement("input");
      targetValue.type = "number";
      targetValue.min = "1";
      targetValue.value = segment.target ?? "";
      targetValue.hidden = !targetType.value;
      targetValue.setAttribute("aria-label", `${t("segmentTarget")} ${index + 1}`);
      targetType.addEventListener("change", () => {
        segment.targetType = targetType.value || undefined;
        targetValue.hidden = !targetType.value;
        if (targetType.value && !targetValue.value) {
          // Start from what was actually done in the segment.
          const done = average(records, targetType.value, segment.startMs, nextMs);
          if (done != null) targetValue.value = String(Math.round(done));
        }
        segment.target = targetType.value && Number(targetValue.value) > 0 ? Number(targetValue.value) : undefined;
        if (!targetValue.hidden) targetValue.focus();
      });
      targetValue.addEventListener("input", () => {
        segment.target = Number(targetValue.value) > 0 ? Number(targetValue.value) : undefined;
      });
      target.append(targetValue, targetType);

      // Resistance for this segment; left empty, the activity's applies.
      const resistance = Object.assign(document.createElement("input"), {
        type: "number", className: "level-input", min: "1", value: segment.resistance ?? "", placeholder: current.resistance ?? "—",
      });
      if (current.trainer) resistance.max = String(current.trainer.levels);
      resistance.setAttribute("aria-label", `${t("resistance")} ${index + 1}`);
      resistance.addEventListener("input", () => {
        segment.resistance = Number(resistance.value) > 0 ? Math.round(Number(resistance.value)) : undefined;
      });

      const cadence = average(records, "cadence", segment.startMs, nextMs);
      const power = average(records, "power", segment.startMs, nextMs);
      const cells = [
        String(index + 1),
        start,
        duration,
        cadence == null ? "—" : displayNumber(cadence),
        power == null ? "—" : `${displayNumber(power)} W`,
        target,
        resistance,
        intensitySelectElement(segment.intensity, `${t("lapType")} ${index + 1}`, (value) => {
          segment.intensity = value;
          row.className = `is-${value}`;
        }),
        remove,
      ];
      row.append(...cells.map((content) => {
        const cell = document.createElement("td");
        if (content instanceof Node) cell.append(content);
        else cell.textContent = content;
        return cell;
      }));
      return row;
    }));
    byId("intervalsCount").textContent = t("segmentCount", { count: draft.length });
  };

  byId("addSegmentButton").onclick = () => {
    // A new segment splits the longest one in half.
    const spans = draft.map((segment, index) => [index, (draft[index + 1]?.startMs ?? endMs) - segment.startMs]);
    const [longest, span] = spans.sort((a, b) => b[1] - a[1])[0];
    draft.push({ startMs: draft[longest].startMs + Math.round(span / 2000) * 1000, intensity: "active" });
    renderRows();
  };
  byId("redetectButton").onclick = () => {
    const { segments: detected } = detectIntervals(records);
    draft = detected.length ? detected : [{ startMs, intensity: "active" }];
    renderRows();
  };
  // A plan copied from Kinomap arrives one value per line, or as the JSON its API returns; it is shown as one step per line.
  byId("planText").onpaste = () => setTimeout(() => {
    const text = byId("planText");
    const lines = [];
    for (const token of kinomapPlanText(text.value).split(/\s+/).filter(Boolean)) {
      if (/^(?:\d+:)?\d{1,2}:\d{2}$/.test(token)) lines.push([token]);
      else lines.at(-1)?.push(token);
    }
    if (lines.length) text.value = lines.map((line) => line.join("  ")).join("\n");
    renderPlanPreview();
  });
  byId("planText").oninput = renderPlanPreview;
  renderPlanPreview();
  byId("planApply").onclick = () => {
    // Steps past the end (or the plan's own total line) are left out.
    const planned = parseKinomapPlan(byId("planText").value, startMs).filter((segment) => segment.startMs < endMs - 1000);
    byId("planText").classList.toggle("is-invalid", !planned.length);
    if (!planned.length) return;
    for (const segment of planned) {
      const level = levelFromPercent(segment.resistancePercent, current.trainer);
      if (level) segment.resistance = level;
    }
    draft = planned;
    byId("planText").closest("details").open = false;
    renderRows();
  };
  byId("intervalsCancel").onclick = () => dialog.close();
  byId("intervalsSave").onclick = () => {
    onSave(normalized());
    dialog.close();
  };

  renderRows();
  dialog.showModal();
}
