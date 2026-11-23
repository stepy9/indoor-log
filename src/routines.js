// The sets put together on demand, away from any rowing workout: a style (mobility, flexibility or yin yoga), an
// area of the body and a length, made into the player's steps. Mobility and flexibility follow Michal Novotný's
// "Sport je bolest": mobility moved for 45 s each, flexibility held 20 s to keep the range or a minute to gain it,
// the set going round again to fill the time. Yin holds each pose for minutes, never the same one twice.
// Stabilization takes each chain (front, back, side) at its own level for a minute, then the four ball moves for
// the pelvis; balance does its five dumbbell moves one side at a time, more repeats on the weaker side.
// No DOM here, so it is tested on its own.
import { exercises, restSeconds, switchSeconds } from "./recovery.js";

export const routineStyles = ["mobility", "flexibility", "yin", "stability", "balance"];
// Whether a style is put together by area and length, or by its own choices (levels, sides, repeats).
export const byLength = (style) => ["mobility", "flexibility", "yin"].includes(style);
export const stabilityChains = ["front", "back", "side"];
export const stabilityLevels = [1, 2, 3, 4];
export const balanceWeak = ["none", "left", "right"];
export const balanceReps = [8, 10, 12, 15];
// The weaker side's extra repeats.
export const weakerExtra = 3;
// A repeat's time, to tell how long a set of them takes.
const repSeconds = 3;
export const routineAreas = ["all", "hips", "back", "shoulders", "legs"];
export const routineMinutes = [5, 10, 15, 20];
export const routineAims = ["keep", "gain"];

// Each style's exercises in the order they run, one position leading to the next.
const orders = {
  mobility: ["lungeReach", "hipSwitch", "reverseTable", "forearmOpen", "archToHeels"],
  flexibility: ["triangle", "downDog", "kneelingQuad", "lungeSideBend", "lungeTwist", "allFoursSide"],
  // Seated first, then on the front and the knees, lying on the back last.
  yin: ["butterfly", "caterpillar", "ninetyNinety", "swan", "dragon", "childPose", "sphinx", "supineTwist"],
};
// Child's pose comes from the stretching after rowing; in yin it is held long and works these.
const ownAreas = { childPose: ["back", "hips"] };
export const areasOf = (id) => exercises[id].areas ?? ownAreas[id] ?? [];

// A yin pose's hold by the set's length, so even five minutes give a few poses; a change of pose takes a little
// longer than a pause between moves.
const yinHold = { 5: 60, 10: 120, 15: 150, 20: 180 };
const yinRest = 15;
const flexibilityHold = { keep: 20, gain: 60 };
const mobilitySeconds = 45;

// The set: { style, area, aim, minutes (as it comes out), exercises: ids in their order, seconds: { id: time },
// rounds, steps }. Mobility and flexibility go round their area's exercises as many times as fit; yin takes the
// area's poses and, short of them, the others, each once.
export function buildRoutine(choice = {}) {
  if (choice.style === "stability") return stabilitySet(choice);
  if (choice.style === "balance") return balanceSet(choice);
  return lengthSet(choice);
}

// A list of { id, seconds | reps, side } work into the player's steps, a rest before each exercise and a shorter one
// between its sides; with its time in minutes.
function stepsOf(work, rest = restSeconds) {
  const steps = [];
  for (const item of work) {
    steps.push({ type: "rest", seconds: item.side === 2 ? switchSeconds : rest, next: item.id });
    steps.push({ type: "work", ...item });
  }
  const total = steps.reduce((sum, step) => sum + (step.seconds ?? step.reps * repSeconds), 0);
  return { steps, minutes: Math.max(1, Math.round(total / 60)) };
}
const sidesOf = (id, make) => (exercises[id].sides > 1 ? [1, 2] : [null]).map((side) => ({ id, side, ...make(side) }));

// Stabilization: { levels: { front, back, side } (1–4), ball }. Each chain's exercise of its level for a minute
// (per side on the side chain), then, with a ball, the pelvis's four moves counted to fatigue.
const chainId = (chain, level) => `stab${chain[0].toUpperCase()}${chain.slice(1)}${level}`;
export const pelvisMoves = ["ballLower", "ballUpper", "ballBoth", "ballOblique"];
function stabilitySet({ levels = {}, ball = true } = {}) {
  const chains = stabilityChains.map((chain) => chainId(chain, Math.min(4, Math.max(1, levels[chain] ?? 1))));
  const ids = [...chains, ...(ball ? pelvisMoves : [])];
  const work = ids.flatMap((id) => sidesOf(id, () => (exercises[id].reps ? { reps: exercises[id].reps } : { seconds: exercises[id].seconds })));
  const { steps, minutes } = stepsOf(work);
  return { style: "stability", rounds: 1, exercises: ids, seconds: Object.fromEntries(chains.map((id) => [id, exercises[id].seconds])), reps: Object.fromEntries(ids.filter((id) => exercises[id].reps).map((id) => [id, exercises[id].reps])), minutes, steps };
}

// Balance: { weak: "none" | "left" | "right", reps }. All the repeats on the left, then on the right, the weaker
// side a few more.
export const balanceMoves = ["chop", "kneelRow", "bridgePress", "sideLungeRaise", "backLungePress"];
function balanceSet({ weak = "none", reps = 10 } = {}) {
  const on = (side) => reps + ((side === 1 && weak === "left") || (side === 2 && weak === "right") ? weakerExtra : 0);
  const work = balanceMoves.flatMap((id) => sidesOf(id, (side) => ({ reps: on(side) })));
  const { steps, minutes } = stepsOf(work);
  return { style: "balance", weak, rounds: 1, exercises: balanceMoves, seconds: {}, reps: Object.fromEntries(balanceMoves.map((id) => [id, reps])), minutes, steps };
}

function lengthSet({ style = "mobility", area = "all", minutes = 10, aim = "keep" } = {}) {
  const order = orders[style] ?? orders.mobility;
  const inArea = area === "all" ? order : order.filter((id) => areasOf(id).includes(area));
  const rest = style === "yin" ? yinRest : restSeconds;
  let hold = style === "yin" ? (yinHold[minutes] ?? 120) : style === "flexibility" ? (flexibilityHold[aim] ?? 20) : mobilitySeconds;
  const cost = (id) => rest + exercises[id].sides * hold + (exercises[id].sides - 1) * Math.min(rest, switchSeconds);
  const target = minutes * 60;
  // Within half a minute over the length is near enough; never fewer than one exercise.
  const slack = 30;
  // An area whose own exercises would go round more than three times to fill the time takes the style's others
  // after them, so the set is not one move over and over (the book has a set done two or three times).
  const roundCost = inArea.reduce((sum, id) => sum + cost(id), 0);
  const pool = inArea.length >= 2 && roundCost * 3 >= target - slack ? inArea : [...inArea, ...order.filter((id) => !inArea.includes(id))];
  const picked = [];
  let total = 0;
  if (style === "yin") {
    // The area's poses first, then the rest in their order, each once.
    for (const id of [...pool, ...order.filter((item) => !pool.includes(item))]) {
      if (picked.length && total + cost(id) > target + slack) continue;
      picked.push({ id, round: 1 });
      total += cost(id);
      if (total >= target - slack) break;
    }
    // No pose left that fits the time still over: the holds grow, by half minutes, to fill it.
    if (total < target - slack) {
      const holds = picked.reduce((sum, { id }) => sum + exercises[id].sides, 0);
      hold += Math.floor((target - total) / holds / 30) * 30;
      total = picked.reduce((sum, { id }) => sum + cost(id), 0);
    }
  } else {
    for (let round = 1; round <= 8; round += 1) {
      for (const id of pool) {
        if (picked.length && total + cost(id) > target + slack) break;
        picked.push({ id, round });
        total += cost(id);
      }
      if (total + Math.min(...pool.map(cost)) > target + slack) break;
    }
  }
  // Back in the style's order within each round, so one position leads to the next.
  picked.sort((a, b) => a.round - b.round || order.indexOf(a.id) - order.indexOf(b.id));
  const rounds = Math.max(...picked.map((item) => item.round));
  const steps = [];
  for (const { id, round } of picked) {
    const { sides } = exercises[id];
    steps.push({ type: "rest", seconds: rest, next: id, ...(rounds > 1 ? { round } : {}) });
    for (let side = 1; side <= sides; side += 1) {
      if (side > 1) steps.push({ type: "rest", seconds: Math.min(rest, switchSeconds), next: id, ...(rounds > 1 ? { round } : {}) });
      steps.push({ type: "work", id, side: sides > 1 ? side : null, seconds: hold, ...(rounds > 1 ? { round } : {}) });
    }
  }
  const ids = [...new Set(picked.map((item) => item.id))];
  return {
    style, area, aim, rounds,
    exercises: ids,
    seconds: Object.fromEntries(ids.map((id) => [id, hold])),
    minutes: Math.max(1, Math.round(total / 60)),
    steps,
  };
}

// The plan: weekdays (0 Monday … 6 Sunday) each with the choice of a set, { "2": { style: "yin", … } }. The set
// planned for a day, or null.
export const weekdayOf = (day) => (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
export const plannedRoutine = (plan = {}, day) => plan[weekdayOf(day)] ?? null;
// A weekday put in the plan with the choice now made, or taken out when it already has that style.
export function togglePlanDay(plan = {}, weekday, choice) {
  const next = { ...plan };
  if (next[weekday]?.style === choice.style) delete next[weekday];
  else next[weekday] = choice;
  return next;
}

// The sets done, kept by day for the calendar and the plan: { "YYYY-MM-DD": [{ style, area, minutes, exercises }] },
// trimmed to the last weeks so the synced settings do not grow.
export const routineKeepDays = 90;
export function logRoutine(log = {}, day, done) {
  const since = new Date(Date.parse(`${day}T12:00:00Z`) - routineKeepDays * 86_400_000).toISOString().slice(0, 10);
  const kept = Object.fromEntries(Object.entries(log).filter(([key]) => key >= since));
  return { ...kept, [day]: [...(kept[day] ?? []), done] };
}
