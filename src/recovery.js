// Stretching after a rowing workout: a short set picked by the workout's primary benefit and length, each exercise
// held for a time, per side where it has two, and, for some, a figure drawn by two poses the picture moves between.
// The set runs as timed steps with a short rest between. No DOM here, so it is tested on its own; the names and
// how-tos live in i18n under recovery_<id> and recoveryHow_<id>.

// A pose of the side-view figure in a 220 × 170 box, the mat's top at y 150: the trunk from the hip through a
// control point to the shoulder, the neck's end and the head's centre, arms and legs as joint lists from the
// shoulder and the hip. focus names the parts drawn over in the accent colour: "trunk", "arm<i>", "leg<i>" or
// "thigh<i>" for a leg's first segment only. hold marks a static stretch, eased into and held still for its time;
// without it the exercise is a move, repeated smoothly between its two poses (or round more of them, a circle).
// more: other views beside the side one, { key: "top" | "detail", poses, focus, blocks }; a close-up's poses
// have arms (and legs) only.
const tabletop = { trunk: [[140, 94], [100, 94], [60, 94]], neck: [46, 88], head: [36, 84], arms: [[[60, 94], [60, 146]]], legs: [[[140, 94], [140, 146], [184, 146]]] };

// Standing upright, facing left, for the warm-up's moves.
const standing = { trunk: [[110, 98], [111, 70], [110, 42]], neck: [112, 32], head: [114, 22], arms: [[[110, 42], [112, 68], [114, 92]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]] };

export const exercises = {
  catCow: {
    seconds: 60, sides: 1,
    poses: [
      { ...tabletop, trunk: [[140, 94], [100, 114], [60, 94]], neck: [47, 84], head: [40, 76] },
      { ...tabletop, trunk: [[140, 94], [100, 54], [60, 94]], neck: [54, 106], head: [50, 116] },
    ],
    focus: ["trunk"],
  },
  childPose: {
    seconds: 45, sides: 1, hold: true,
    poses: [
      tabletop,
      { trunk: [[174, 130], [134, 116], [92, 128]], neck: [84, 134], head: [76, 138], arms: [[[92, 128], [40, 146]]], legs: [[[174, 130], [140, 146], [184, 146]]] },
    ],
    focus: ["trunk"],
  },
  hamstring: {
    seconds: 30, sides: 2, hold: true,
    poses: [
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [96, 146]]], legs: [[[128, 140], [168, 143], [206, 143]], [[128, 140], [146, 104], [180, 128]]] },
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [96, 146]]], legs: [[[128, 140], [168, 143], [206, 143]], [[128, 140], [140, 94], [150, 46]]] },
    ],
    focus: ["leg1"],
  },
  hipFlexor: {
    seconds: 30, sides: 2, hold: true,
    // Half-kneeling, the back knee on a cushion: the front leg (far) at a right angle, the hips easing forward.
    props: [{ x: 122, y: 137, width: 38, height: 13, rx: 5, class: "pad" }],
    far: { legs: [0] },
    poses: [
      { trunk: [[118, 104], [119, 76], [118, 48]], neck: [118, 38], head: [118, 25], arms: [[[118, 48], [104, 70], [82, 98]]], legs: [[[118, 104], [74, 104], [74, 146]], [[118, 104], [140, 145], [184, 144]]], feet: [[55, 147], [197, 149]] },
      { trunk: [[104, 112], [105, 84], [104, 56]], neck: [104, 46], head: [104, 33], arms: [[[104, 56], [88, 78], [68, 96]]], legs: [[[104, 112], [62, 100], [74, 146]], [[104, 112], [140, 145], [184, 144]]], feet: [[55, 147], [197, 149]] },
    ],
    focus: ["thigh1"],
  },
  figureFour: {
    seconds: 30, sides: 2, hold: true,
    // On the back: the near leg's ankle crossed over the far leg's knee, then that leg pulled towards the chest.
    far: { legs: [0] },
    poses: [
      { trunk: [[120, 138], [86, 140], [52, 138]], neck: [42, 136], head: [30, 134], arms: [[[52, 138], [70, 145], [94, 145]]], legs: [[[120, 138], [148, 104], [172, 145]], [[120, 138], [136, 120], [152, 106]]], feet: [[187, 146], [162, 99]] },
      { trunk: [[120, 138], [86, 140], [52, 138]], neck: [42, 136], head: [30, 134], arms: [[[52, 138], [86, 124], [118, 110]]], legs: [[[120, 138], [128, 96], [166, 90]], [[120, 138], [142, 120], [134, 100]]], feet: [[178, 84], [140, 91]] },
    ],
    focus: ["thigh1"],
    more: [{
      key: "top",
      // From above, head up: the crossed leg's knee out to the side and its ankle on the other knee, a "4".
      blocks: [{ x: 60, y: 6, width: 106, height: 158, rx: 10 }],
      poses: [
        { trunk: [[110, 104], [110, 75], [110, 46]], neck: [110, 36], head: [110, 24], arms: [[[97, 50], [87, 76], [83, 102]], [[123, 50], [133, 76], [137, 102]]], legs: [[[103, 106], [100, 136], [98, 156]], [[117, 106], [150, 126], [104, 134]]], feet: [null, [92, 136]] },
        { trunk: [[110, 104], [110, 75], [110, 46]], neck: [110, 36], head: [110, 24], arms: [[[97, 50], [87, 76], [83, 102]], [[123, 50], [133, 76], [137, 102]]], legs: [[[103, 106], [100, 122], [98, 142]], [[117, 106], [150, 112], [104, 120]]], feet: [null, [92, 122]] },
      ],
    }],
  },
  forearm: {
    seconds: 20, sides: 2, hold: true,
    poses: [
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [112, 32], head: [114, 22], arms: [[[110, 42], [138, 44], [164, 46], [182, 46]], [[110, 42], [128, 64], [168, 58]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]] },
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [112, 32], head: [114, 22], arms: [[[110, 42], [138, 44], [164, 46], [172, 62]], [[110, 42], [128, 66], [170, 68]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]] },
    ],
    focus: ["arm0"],
    more: [{
      key: "detail",
      focus: ["fore0"],
      poses: [
        { arms: [[[-10, 70], [70, 70], [160, 72], [200, 72]], [[90, 180], [150, 140], [196, 80]]], legs: [] },
        { arms: [[[-10, 70], [70, 70], [160, 72], [168, 110]], [[90, 180], [150, 146], [172, 112]]], legs: [] },
      ],
    }],
  },
  calf: {
    seconds: 30, sides: 2, hold: true, wall: 34,
    poses: [
      { trunk: [[110, 96], [96, 72], [82, 50]], neck: [76, 40], head: [72, 30], arms: [[[82, 50], [62, 52], [42, 50]]], legs: [[[110, 96], [86, 120], [92, 146]], [[110, 96], [140, 122], [170, 146]]] },
      { trunk: [[102, 98], [86, 76], [70, 56]], neck: [64, 46], head: [60, 36], arms: [[[70, 56], [56, 58], [42, 56]]], legs: [[[102, 98], [78, 120], [92, 146]], [[102, 98], [136, 122], [170, 146]]] },
    ],
    focus: ["leg1"],
  },
  chest: {
    seconds: 30, sides: 1, hold: true, wall: 136,
    // The forearm up the door frame behind, a step forward through the door, the chest opening.
    far: { legs: [0] },
    poses: [
      { trunk: [[112, 98], [112, 72], [110, 48]], neck: [107, 38], head: [104, 25], arms: [[[110, 48], [133, 48], [133, 22]]], legs: [[[112, 98], [112, 122], [112, 145]], [[112, 98], [110, 122], [108, 145]]], feet: [[98, 147], [94, 147]] },
      { trunk: [[106, 100], [105, 75], [104, 50]], neck: [100, 40], head: [96, 28], arms: [[[104, 50], [132, 48], [133, 22]]], legs: [[[106, 100], [114, 124], [120, 145]], [[106, 100], [94, 122], [86, 145]]], feet: [[106, 147], [72, 147]] },
    ],
    focus: ["arm0"],
    more: [{
      key: "front",
      // From the front: the upper arms out to the door frame's sides, the forearms up along it, a goal post;
      // leaning through, the body comes a little nearer and lower.
      focus: ["chest"],
      blocks: [{ x: 14, y: 150, width: 192, height: 8, rx: 4 }, { x: 34, y: 6, width: 9, height: 146, rx: 3 }, { x: 177, y: 6, width: 9, height: 146, rx: 3 }],
      poses: [
        { trunk: [[110, 100], [110, 72], [110, 46]], neck: [110, 34], head: [110, 22], arms: [[[97, 48], [47, 48], [47, 16]], [[123, 48], [173, 48], [173, 16]]], legs: [[[104, 100], [101, 124], [99, 145]], [[116, 100], [119, 124], [121, 145]]], feet: [[91, 147], [129, 147]] },
        { trunk: [[110, 104], [110, 77], [110, 51]], neck: [110, 39], head: [110, 27], arms: [[[96, 53], [47, 48], [47, 16]], [[124, 53], [173, 48], [173, 16]]], legs: [[[104, 104], [101, 126], [99, 145]], [[116, 104], [119, 126], [121, 145]]], feet: [[91, 147], [129, 147]] },
      ],
    }],
  },
  // The warm-up's moves, done in rhythm rather than held: the figure shows the two ends of the move.
  armSwings: {
    seconds: 30, sides: 1,
    // Round through four poses, down, forward, up and back, the arrow showing the way.
    arrows: ["M66,79 A58,58 0 0 1 62,9"],
    poses: [
      { ...standing, arms: [[[110, 42], [108, 68], [106, 94]]] },
      { ...standing, arms: [[[110, 42], [84, 44], [58, 46]]] },
      { ...standing, arms: [[[110, 42], [107, 20], [104, 0]]] },
      { ...standing, arms: [[[110, 42], [134, 48], [156, 58]]] },
    ],
    focus: ["arm0"],
  },
  hipHinge: {
    seconds: 30, sides: 1,
    poses: [
      { ...standing, arms: [[[110, 42], [112, 68], [114, 92]]] },
      { trunk: [[118, 96], [92, 86], [66, 78]], neck: [56, 74], head: [46, 70], arms: [[[66, 78], [66, 104], [66, 128]]], legs: [[[118, 96], [114, 122], [110, 146]], [[118, 96], [118, 122], [116, 146]]] },
    ],
    focus: ["trunk"],
  },
  squat: {
    seconds: 40, sides: 1,
    poses: [
      { ...standing, arms: [[[110, 42], [84, 44], [58, 46]]] },
      { trunk: [[132, 114], [118, 90], [104, 66]], neck: [100, 56], head: [96, 46], arms: [[[104, 66], [78, 68], [52, 70]]], legs: [[[132, 114], [96, 118], [106, 146]], [[132, 114], [100, 120], [112, 146]]] },
    ],
    focus: ["thigh0"],
  },
  legSwings: {
    seconds: 20, sides: 2, wall: 34,
    poses: [
      { ...standing, arms: [[[110, 42], [80, 48], [44, 50]]], legs: [standing.legs[0], [[110, 98], [86, 118], [64, 128]]] },
      { ...standing, arms: [[[110, 42], [80, 48], [44, 50]]], legs: [standing.legs[0], [[110, 98], [134, 118], [156, 128]]] },
    ],
    focus: ["leg1"],
  },
};

// The views an exercise is drawn in, for figure-svg.js: its side view first (on the mat, by its wall and props,
// with its far limbs and arrows), then any other ("top", "front" or "detail"), each { key, poses, focus, blocks,
// far, arrows }.
export function exerciseViews(id) {
  const { poses, focus = [], wall, props = [], far, arrows, more = [] } = exercises[id];
  if (!poses) return [];
  const blocks = [{ x: 14, y: 150, width: 192, height: 8, rx: 4 }, ...(wall != null ? [{ x: wall, y: 6, width: 7, height: 146, rx: 3 }] : []), ...props];
  return [{ key: "side", poses, focus, blocks, far, arrows }, ...more.map((view) => ({ focus, blocks: [], ...view }))];
}

// The pause before each exercise, and between its sides.
export const restSeconds = 10;
export const switchSeconds = 5;

// The set as timed steps: { type: "rest", seconds, next } before each exercise and between its sides, then
// { type: "work", id, side: 1 | 2 | null, seconds }. The first exercise starts after a rest too, to get ready.
// rest: the pause before each exercise; seconds: an exercise's time in this set where it differs from its own.
export function steps(ids, { rest = restSeconds, seconds: own = {} } = {}) {
  const list = [];
  for (const id of ids) {
    const { sides } = exercises[id];
    const seconds = own[id] ?? exercises[id].seconds;
    list.push({ type: "rest", seconds: rest, next: id });
    for (let side = 1; side <= sides; side += 1) {
      if (side > 1) list.push({ type: "rest", seconds: Math.min(rest, switchSeconds), next: id });
      list.push({ type: "work", id, side: sides > 1 ? side : null, seconds });
    }
  }
  return list;
}

const sets = {
  easy: ["catCow", "hamstring", "hipFlexor"],
  long: ["catCow", "hamstring", "hipFlexor", "childPose", "figureFour", "forearm"],
  hard: ["catCow", "hamstring", "hipFlexor", "figureFour", "calf", "chest"],
};
const hardBenefits = new Set(["threshold", "vo2max", "anaerobic", "sprint"]);

// The set after a workout: { set, cooldown, exercises, minutes }. benefit is the primary benefit or null,
// seconds the workout's time. A hard workout asks first for a few easy minutes on the machine; a recovery or a
// short one gets the short set, a longer steady one the fuller set.
export function afterWorkout({ benefit = null, seconds = 0 }) {
  const hard = hardBenefits.has(benefit);
  const set = hard ? "hard" : benefit === "recovery" || seconds < 45 * 60 ? "easy" : "long";
  const ids = sets[set];
  const total = steps(ids).reduce((sum, step) => sum + step.seconds, 0);
  return { set, cooldown: hard, exercises: ids, minutes: Math.round(total / 60) };
}

// The warm-up before a rowing workout: moves for the back, shoulders and hips done in rhythm, short pauses between.
// Before intervals, an FTP test or the goal the full set, then easy minutes on the rower building up to a few
// strokes at the effort's pace; before a steady workout the short set, the first minutes on the rower easy anyway.
export const warmupRest = 5;
const warmups = {
  short: { exercises: ["catCow", "armSwings", "squat"], seconds: { catCow: 30, squat: 30 } },
  full: { exercises: ["catCow", "armSwings", "hipHinge", "squat", "legSwings"], seconds: { catCow: 45 } },
};
const hardTypes = new Set(["intervals", "ftpTestShort", "ftpTest", "goal"]);

// The warm-up for a planned day's type: { set, exercises, seconds, minutes, onRower }; onRower the easy minutes
// on the machine to go on with, before the efforts of a hard day.
export function warmupBefore(type) {
  const set = hardTypes.has(type) ? "full" : "short";
  const { exercises: ids, seconds } = warmups[set];
  const total = steps(ids, { rest: warmupRest, seconds }).reduce((sum, step) => sum + step.seconds, 0);
  return { set, exercises: ids, seconds, minutes: Math.max(1, Math.round(total / 60)), onRower: set === "full" ? 5 : 0 };
}

// Every exercise of the warm-up and the stretching, in the order the sets first take them, each with its time in
// them and the sets it is in: { warmup: [{ id, seconds, sets }], stretch: [...] }, sets naming warmups' and sets' keys.
export function exerciseCatalog() {
  const collect = (groups) => {
    const list = [];
    for (const [set, { exercises: ids, seconds = {} }] of Object.entries(groups)) {
      for (const id of ids) {
        const found = list.find((item) => item.id === id);
        if (found) found.sets.push(set);
        else list.push({ id, seconds: seconds[id] ?? exercises[id].seconds, sides: exercises[id].sides, sets: [set] });
      }
    }
    return list;
  };
  return {
    warmup: collect(warmups),
    stretch: collect(Object.fromEntries(Object.entries(sets).map(([set, ids]) => [set, { exercises: ids }]))),
  };
}
