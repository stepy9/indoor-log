// The sets put together on demand, away from any rowing workout: a style (mobility, flexibility or yin yoga), an
// area of the body and a length, made into the player's steps. Mobility and flexibility follow Michal Novotný's
// "Sport je bolest": mobility moved for 45 s each, flexibility held 20 s to keep the range or a minute to gain it,
// the set going round again to fill the time. Yin holds each pose for minutes, never the same one twice.
// No DOM here, so it is tested on its own.
import { exercises, restSeconds, switchSeconds } from "./recovery.js";

export const routineStyles = ["mobility", "flexibility", "yin"];
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
export function buildRoutine({ style = "mobility", area = "all", minutes = 10, aim = "keep" } = {}) {
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

// The sets done, kept by day for the calendar and the plan: { "YYYY-MM-DD": [{ style, area, minutes, exercises }] },
// trimmed to the last weeks so the synced settings do not grow.
export const routineKeepDays = 90;
export function logRoutine(log = {}, day, done) {
  const since = new Date(Date.parse(`${day}T12:00:00Z`) - routineKeepDays * 86_400_000).toISOString().slice(0, 10);
  const kept = Object.fromEntries(Object.entries(log).filter(([key]) => key >= since));
  return { ...kept, [day]: [...(kept[day] ?? []), done] };
}
