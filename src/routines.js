// The sets put together on demand, away from any rowing workout: a style (mobility, flexibility or yin yoga), an
// area of the body and a length, made into the player's steps. Mobility and flexibility follow Michal Novotný's
// "Sport je bolest": mobility moved for 45 s each, flexibility held 20 s to keep the range or a minute to gain it,
// the set going round again to fill the time. Yin holds each pose for minutes, never the same one twice.
// Stabilization takes each chain (front, back, side) at its own level for a minute, then the four ball moves for
// the pelvis; balance does its five dumbbell moves one side at a time, more repeats on the weaker side.
// No DOM here, so it is tested on its own.
import { dayMs, noon, weekdayOf } from "./dates.js";
import { afterWorkout, exerciseCatalog, exercises, restSeconds, steps as timedSteps, strengthPlan, strengthSession, switchSeconds, warmupBefore, warmupRest } from "./recovery.js";

export const routineStyles = ["mobility", "flexibility", "yin", "pilates", "breath", "stability", "balance", "gear"];
// The equipment there may be at home; a set with it is offered only when it is there. gearStyleTools: those the
// "gear" style is built around (the ball and the dumbbell have their own in stability and balance).
export const gearTools = ["ball", "dumbbell", "band", "bosu", "roller"];
export const gearStyleTools = ["band", "bosu", "roller"];
export const defaultGear = ["ball", "dumbbell"];
export const hasGear = (id, owned = gearTools) => !exercises[id]?.gear || owned.includes(exercises[id].gear);
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
// The sets around rowing, offered among the others under their own heading; each built as the Today card builds it,
// its kind picked by hand instead of by the day's workout.
export const trainingStyles = ["warmup", "stretch", "strength"];
export const warmupKinds = ["short", "full"];
export const stretchKinds = ["easy", "long", "hard"];

// Each style's exercises in the order they run, one position leading to the next.
const orders = {
  mobility: ["hipCircles", "cossackShift", "inchworm", "lungeReach", "ankleRock", "hipSwitch", "reverseTable", "forearmOpen", "scapPushUp", "archToHeels", "threadNeedle"],
  flexibility: ["crossArm", "tricepsOverhead", "sideLungeHold", "triangle", "downDog", "kneelingQuad", "lungeSideBend", "lungeTwist", "allFoursSide"],
  // Seated first, then on the front and the knees, lying on the back last.
  yin: ["yinSquat", "butterfly", "shoelace", "dragonfly", "caterpillar", "ninetyNinety", "swan", "dragon", "toeSquat", "frog", "meltingHeart", "childPose", "sphinx", "banana", "happyBaby", "supineTwist"],
};
// The warm-up's moves and the stretches after rowing, filling in where the book has few for an area: after its own
// exercises, in this order. Child's pose is one of yin's.
const extras = {
  mobility: ["catCow", "openBook", "armSwings", "hipHinge", "squat", "legSwings"],
  flexibility: ["hamstring", "calf", "quadStretch", "hipFlexor", "figureFour", "chest", "latStretch", "forearm"],
};
export const extrasOf = (style) => extras[style] ?? [];
const ownAreas = {
  childPose: ["back", "hips"],
  catCow: ["back"], openBook: ["back", "shoulders"], armSwings: ["shoulders"], hipHinge: ["legs", "back"], squat: ["legs", "hips"], legSwings: ["hips", "legs"],
  hamstring: ["legs"], calf: ["legs"], quadStretch: ["legs", "hips"], hipFlexor: ["hips"], figureFour: ["hips"], chest: ["shoulders"], latStretch: ["shoulders", "back"], forearm: ["shoulders"],
};
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
  if (choice.style === "custom") return customSet(choice.custom);
  if (choice.style === "stability") return stabilitySet(choice);
  if (choice.style === "balance") return balanceSet(choice);
  if (choice.style === "gear") return gearSet(choice);
  if (choice.style === "pilates") return pilatesSet(choice);
  if (choice.style === "breath") return breathSet(choice);
  if (choice.style === "warmup") return warmupSet(choice);
  if (choice.style === "stretch") return stretchSet(choice);
  if (choice.style === "strength") return strengthSet(choice);
  return lengthSet(choice);
}

const minutesOf = (list) => Math.max(1, Math.round(list.reduce((sum, step) => sum + (step.seconds ?? step.reps * repSeconds), 0) / 60));
// The warm-up: the full one is that before intervals, the short one that before a steady row (its turn by day).
function warmupSet({ warmupKind = "short", day = null } = {}) {
  const plan = warmupBefore(warmupKind === "full" ? "intervals" : null, day);
  const list = timedSteps(plan.exercises, { rest: warmupRest, seconds: plan.seconds });
  return { style: "warmup", kind: plan.set, rounds: 1, exercises: plan.exercises, seconds: Object.fromEntries(plan.exercises.map((id) => [id, plan.seconds[id] ?? exercises[id].seconds])), reps: {}, minutes: minutesOf(list), steps: list };
}
// The stretching as after a short or easy workout, a longer steady one or a hard one.
function stretchSet({ stretchKind = "easy", day = null } = {}) {
  const plan = afterWorkout(stretchKind === "hard" ? { benefit: "threshold", day } : { seconds: stretchKind === "long" ? 3600 : 0, day });
  const list = timedSteps(plan.exercises);
  return { style: "stretch", kind: plan.set, rounds: 1, exercises: plan.exercises, seconds: Object.fromEntries(plan.exercises.map((id) => [id, exercises[id].seconds])), reps: {}, minutes: minutesOf(list), steps: list };
}
// Strength at the level reached (strengthSteps, from its log).
function strengthSet({ strengthSteps = 0 } = {}) {
  const session = strengthSession(strengthSteps);
  const ids = session.doses.map((item) => item.id);
  return {
    style: "strength", rounds: session.rounds, exercises: ids, steps: session.steps, minutes: session.minutes,
    seconds: Object.fromEntries(session.doses.filter((item) => item.seconds).map((item) => [item.id, item.seconds])),
    reps: Object.fromEntries(session.doses.filter((item) => item.reps).map((item) => [item.id, item.reps])),
  };
}

// A list of { id, seconds | reps, side } work into the player's steps, a rest before each exercise and a shorter one
// between its sides; with its time in minutes.
function stepsOf(work, rest = restSeconds) {
  const steps = [];
  for (const item of work) {
    steps.push({ type: "rest", seconds: item.side === 2 ? switchSeconds : rest, next: item.id, ...(item.round ? { round: item.round } : {}) });
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

// A set put together by hand: [{ id, seconds | reps }] in the order given, each per side where it has two.
export const defaultDose = (id) => (exercises[id].reps ? { reps: exercises[id].reps } : { seconds: exercises[id].seconds });
function customSet(items = []) {
  const list = items.filter((item) => exercises[item.id]);
  const work = list.flatMap((item) => sidesOf(item.id, () => (item.reps ? { reps: item.reps } : { seconds: item.seconds ?? exercises[item.id].seconds })));
  const { steps, minutes } = stepsOf(work);
  return {
    style: "custom", rounds: 1, minutes, steps,
    exercises: list.map((item) => item.id),
    seconds: Object.fromEntries(list.filter((item) => !item.reps).map((item) => [item.id, item.seconds ?? exercises[item.id].seconds])),
    reps: Object.fromEntries(list.filter((item) => item.reps).map((item) => [item.id, item.reps])),
  };
}

// Every exercise to pick from by hand, in groups: each style's own (with the moves around rowing that fit it), each
// tool's, then the warm-up's, the stretching's and the strength's. An exercise is in every group it belongs to, so
// cat–cow is in mobility, pilates and both sets around rowing. With owned, only those whose equipment is at home
// (a group left empty out). [{ group, ids }].
export const alsoIn = { pilates: ["catCow"], stability: ["plank", "sidePlank", "deadBug", "bridge"] };
export function exerciseGroups(owned = gearTools) {
  const unique = (ids) => [...new Set(ids)].filter((id) => exercises[id]);
  const stability = Object.keys(exercises).filter((id) => exercises[id].style === "stability");
  const catalog = exerciseCatalog();
  const groups = [
    { group: "mobility", ids: unique([...orders.mobility, ...extras.mobility]) },
    { group: "flexibility", ids: unique([...orders.flexibility, ...extras.flexibility]) },
    { group: "yin", ids: unique(orders.yin) },
    { group: "stability", ids: unique([...stability, ...alsoIn.stability]) },
    { group: "pilates", ids: unique([...alsoIn.pilates, ...pilatesMoves]) },
    { group: "breath", ids: unique(breathTechniques) },
    { group: "balance", ids: unique(balanceMoves) },
    ...gearStyleTools.map((tool) => ({ group: tool, ids: unique(toolMoves(tool)) })),
    { group: "warmup", ids: unique(catalog.warmup.map((item) => item.id)) },
    { group: "stretch", ids: unique(catalog.stretch.map((item) => item.id)) },
    { group: "strength", ids: unique(strengthPlan.exercises.map((item) => item.id)) },
  ];
  // Anything in none of them still to be found.
  const placed = new Set(groups.flatMap((item) => item.ids));
  groups.push({ group: "rowing", ids: Object.keys(exercises).filter((id) => !placed.has(id)) });
  return groups.map((item) => ({ ...item, ids: item.ids.filter((id) => hasGear(id, owned)) })).filter((item) => item.ids.length);
}

// With a tool: { tool, minutes } its exercises in turn, round after round, to fill the length; each by its own time
// or repeats, per side where it has two.
export const toolMoves = (tool) => Object.keys(exercises).filter((id) => exercises[id].style === "gear" && exercises[id].gear === tool);
function gearSet({ tool = "band", minutes = 10 } = {}) {
  const pool = toolMoves(tool);
  const cost = (id) => restSeconds + exercises[id].sides * (exercises[id].reps ? exercises[id].reps * repSeconds : exercises[id].seconds) + (exercises[id].sides - 1) * switchSeconds;
  const target = minutes * 60;
  const picked = [];
  let total = 0;
  for (let round = 1; round <= 8 && pool.length; round += 1) {
    for (const id of pool) {
      if (picked.length && total + cost(id) > target + 30) break;
      picked.push({ id, round });
      total += cost(id);
    }
    if (total + Math.min(...pool.map(cost)) > target + 30) break;
  }
  const rounds = Math.max(1, ...picked.map((item) => item.round));
  const work = picked.flatMap(({ id, round }) => sidesOf(id, () => ({ ...defaultDose(id), ...(rounds > 1 ? { round } : {}) })));
  const { steps, minutes: length } = stepsOf(work);
  const ids = [...new Set(picked.map((item) => item.id))];
  return {
    style: "gear", tool, rounds, minutes: length, steps, exercises: ids,
    seconds: Object.fromEntries(ids.filter((id) => !exercises[id].reps).map((id) => [id, exercises[id].seconds])),
    reps: Object.fromEntries(ids.filter((id) => exercises[id].reps).map((id) => [id, exercises[id].reps])),
  };
}

// Pilates: { minutes, level: "basic" | "advanced" }. The classical order from the hundred to the bridge, round
// again where the length allows; the advanced set adds the teaser and a quarter more repeats (the harder form of
// each move is in its how-to: the legs long and low, the head up).
export const pilatesLevels = ["basic", "advanced"];
export const pilatesMoves = ["hundred", "rollUp", "legCircles", "rollingBall", "singleLegStretch", "doubleLegStretch", "crissCross", "spineStretch", "saw", "swimming", "sideKick", "teaser", "shoulderBridge"];
// Breathing: { technique, breathMinutes }. One exercise for the length, in whole breaths.
export const breathTechniques = ["resonant", "diaphragm", "longExhale", "box", "fourSevenEight", "sigh"];
export const breathMinutes = [2, 5, 10];
export const breathCycle = (id) => exercises[id].pattern.reduce((sum, [, seconds]) => sum + seconds, 0);
function breathSet({ technique = "resonant", breathMinutes: minutes = 5 } = {}) {
  const id = breathTechniques.includes(technique) ? technique : "resonant";
  const seconds = Math.round(Math.max(1, Math.round((minutes * 60) / breathCycle(id))) * breathCycle(id));
  const { steps, minutes: length } = stepsOf([{ id, side: null, seconds }]);
  return { style: "breath", technique: id, rounds: 1, minutes: length, steps, exercises: [id], seconds: { [id]: seconds }, reps: {} };
}

const pilatesDrop = ["rollingBall", "saw", "legCircles", "doubleLegStretch", "spineStretch", "sideKick", "swimming", "crissCross", "rollUp"];
function pilatesSet({ minutes = 10, level = "basic" } = {}) {
  const advanced = level === "advanced";
  const pool = pilatesMoves.filter((id) => advanced || !exercises[id].advanced);
  const dose = (id) => (exercises[id].reps ? { reps: advanced ? Math.round(exercises[id].reps * 1.25) : exercises[id].reps } : { seconds: exercises[id].seconds });
  const cost = (id) => restSeconds + exercises[id].sides * (dose(id).reps ? dose(id).reps * repSeconds : dose(id).seconds) + (exercises[id].sides - 1) * switchSeconds;
  const target = minutes * 60;
  const sum = (ids) => ids.reduce((all, id) => all + cost(id), 0);
  const picked = [];
  let total = 0;
  // Whole rounds while they fit; then a round short of the time left leaves out the least needed moves first,
  // keeping the hundred, the leg stretch, the bridge (and the teaser) and the order.
  for (let round = 1; round <= 4; round += 1) {
    // The hundred warms up once; a later round goes without it.
    let ids = round > 1 ? pool.filter((id) => id !== "hundred") : [...pool];
    for (const drop of pilatesDrop) if (total + sum(ids) > target + 30) ids = ids.filter((id) => id !== drop);
    if (picked.length && (ids.length < 3 || total + sum(ids) > target + 30)) break;
    picked.push(...ids.map((id) => ({ id, round })));
    total += sum(ids);
    if (ids.length < pool.length) break;
  }
  const rounds = Math.max(1, ...picked.map((item) => item.round));
  const work = picked.flatMap(({ id, round }) => sidesOf(id, () => ({ ...dose(id), ...(rounds > 1 ? { round } : {}) })));
  const { steps, minutes: length } = stepsOf(work);
  const ids = [...new Set(picked.map((item) => item.id))];
  return {
    style: "pilates", level, rounds, minutes: length, steps, exercises: ids,
    seconds: Object.fromEntries(ids.filter((id) => !exercises[id].reps).map((id) => [id, dose(id).seconds])),
    reps: Object.fromEntries(ids.filter((id) => exercises[id].reps).map((id) => [id, dose(id).reps])),
  };
}

function lengthSet({ style = "mobility", area = "all", minutes = 10, aim = "keep", day = null } = {}) {
  const own = orders[style] ?? orders.mobility;
  // The flow: the style's own first, the fillers after.
  const order = [...own, ...extrasOf(style)];
  // Each day starts the area's list further on, so the exercises taken change from day to day.
  const shift = day ? Math.round(noon(day) / dayMs) * 3 : 0;
  const turn = (list) => list.map((_, index) => list[(index + shift) % list.length]);
  const inArea = turn(own.filter((id) => area === "all" || areasOf(id).includes(area)));
  const extraInArea = turn(extrasOf(style).filter((id) => area === "all" || areasOf(id).includes(area)));
  const rest = style === "yin" ? yinRest : restSeconds;
  let hold = style === "yin" ? (yinHold[minutes] ?? 120) : style === "flexibility" ? (flexibilityHold[aim] ?? 20) : mobilitySeconds;
  const cost = (id) => rest + exercises[id].sides * hold + (exercises[id].sides - 1) * Math.min(rest, switchSeconds);
  const target = minutes * 60;
  // Within half a minute over the length is near enough; never fewer than one exercise.
  const slack = 30;
  // An area whose own exercises would go round more than three times to fill the time takes the fillers for the
  // area after them, then the style's others, so the set is not one move over and over (the book has a set done
  // two or three times).
  const enough = (list) => list.length >= 2 && list.reduce((sum, id) => sum + cost(id), 0) * 3 >= target - slack;
  const withExtras = [...inArea, ...extraInArea.filter((id) => !inArea.includes(id))];
  // Mobility and flexibility take the fillers in too, so there is more to go round.
  const wide = style === "yin" ? inArea : withExtras;
  const pool = enough(wide) ? wide : enough(withExtras) ? withExtras : [...withExtras, ...turn(own).filter((id) => !withExtras.includes(id))];
  const picked = [];
  let total = 0;
  if (style === "yin") {
    // The area's poses first, then the rest in their order, each once.
    for (const id of [...pool, ...turn(own).filter((item) => !pool.includes(item))]) {
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

// How a stabilization chain's minute went, said at the set's end: { front: [{ day, level, feel }], … }, feel one
// of these. Two sets running at the same level that came easily raise it; two hard ones lower it; "ok" (done,
// but with effort) keeps it, so a minute struggled through does not count as mastered.
export const stabilityFeels = ["easy", "ok", "hard"];
export const feelKeep = 20;
export function recordFeel(log = {}, chain, day, level, feel) {
  const entries = (log[chain] ?? []).filter((entry) => entry.day !== day);
  return { ...log, [chain]: [...entries, { day, level, feel }].sort((a, b) => a.day.localeCompare(b.day)).slice(-feelKeep) };
}
// The level a chain goes on at: its last two answers both at this level and both easy, one up (to 4); both hard,
// one down (to 1); otherwise the same. { level, change: 1 | -1 | 0 }.
export function nextLevel(entries = [], level = 1) {
  const last = entries.slice(-2);
  const both = (feel) => last.length === 2 && last.every((entry) => entry.level === level && entry.feel === feel);
  if (both("easy") && level < 4) return { level: level + 1, change: 1 };
  if (both("hard") && level > 1) return { level: level - 1, change: -1 };
  return { level, change: 0 };
}

// The plan: weekdays (0 Monday … 6 Sunday) each with the choice of a set, { "2": { style: "yin", … } }. The set
// planned for a day, or null.
export { weekdayOf };
export const plannedRoutine = (plan = {}, day) => plan[weekdayOf(day)] ?? null;
// A plan without the days of a saved set taken out.
export const withoutSaved = (plan = {}, id) => Object.fromEntries(Object.entries(plan).filter(([, item]) => !(item.style === "saved" && item.saved === id)));
// A weekday put in the plan with the choice now made, or taken out when it already has that style (a saved set:
// { style: "saved", saved: its id }, the very set).
const samePlanned = (a, b) => a?.style === b.style && (b.style !== "saved" || a.saved === b.saved);
export function togglePlanDay(plan = {}, weekday, choice) {
  const next = { ...plan };
  if (samePlanned(next[weekday], choice)) delete next[weekday];
  else next[weekday] = choice;
  return next;
}

// The sets done, kept by day for the calendar and the plan: { "YYYY-MM-DD": [{ style, area, minutes, exercises }] },
// trimmed to the last weeks so the synced settings do not grow.
export const routineKeepDays = 90;
export function logRoutine(log = {}, day, done) {
  const since = new Date(noon(day) - routineKeepDays * dayMs).toISOString().slice(0, 10);
  const kept = Object.fromEntries(Object.entries(log).filter(([key]) => key >= since));
  return { ...kept, [day]: [...(kept[day] ?? []), done] };
}
