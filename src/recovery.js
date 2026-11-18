// Stretching after a rowing workout: a short set picked by the workout's primary benefit and length, each exercise
// held for a time, per side where it has two, and, for some, a figure drawn by two poses the picture moves between.
// The set runs as timed steps with a short rest between. No DOM here, so it is tested on its own; the names and
// how-tos live in i18n under recovery_<id> and recoveryHow_<id>.

// A pose of the side-view figure in a 220 × 170 box, the mat's top at y 150: the trunk from the hip through a
// control point to the shoulder, the neck's end and the head's centre, arms and legs as joint lists from the
// shoulder and the hip. focus names the parts drawn over in the accent colour: "trunk", "arm<i>", "leg<i>" or
// "thigh<i>" for a leg's first segment only.
const tabletop = { trunk: [[140, 94], [100, 94], [60, 94]], neck: [46, 88], head: [36, 84], arms: [[[60, 94], [60, 146]]], legs: [[[140, 94], [140, 146], [184, 146]]] };

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
    seconds: 45, sides: 1,
    poses: [
      tabletop,
      { trunk: [[174, 130], [134, 116], [92, 128]], neck: [84, 134], head: [76, 138], arms: [[[92, 128], [40, 146]]], legs: [[[174, 130], [140, 146], [184, 146]]] },
    ],
    focus: ["trunk"],
  },
  hamstring: {
    seconds: 30, sides: 2,
    poses: [
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [96, 146]]], legs: [[[128, 140], [168, 143], [206, 143]], [[128, 140], [146, 104], [180, 128]]] },
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [96, 146]]], legs: [[[128, 140], [168, 143], [206, 143]], [[128, 140], [140, 94], [150, 46]]] },
    ],
    focus: ["leg1"],
  },
  hipFlexor: {
    seconds: 30, sides: 2,
    poses: [
      { trunk: [[110, 98], [112, 70], [110, 42]], neck: [110, 32], head: [110, 22], arms: [[[110, 42], [122, 68], [112, 94]]], legs: [[[110, 98], [70, 98], [70, 146]], [[110, 98], [140, 146], [184, 146]]] },
      { trunk: [[96, 106], [97, 78], [98, 50]], neck: [98, 40], head: [98, 30], arms: [[[98, 50], [110, 76], [100, 102]]], legs: [[[96, 106], [62, 102], [70, 146]], [[96, 106], [140, 146], [184, 146]]] },
    ],
    focus: ["thigh1"],
  },
  figureFour: {
    seconds: 30, sides: 2,
    poses: [
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [74, 146], [100, 146]]], legs: [[[128, 140], [150, 104], [180, 140]], [[128, 140], [164, 124], [148, 104]]] },
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [84, 128], [114, 104]]], legs: [[[128, 140], [118, 96], [150, 84]], [[128, 140], [144, 108], [120, 92]]] },
    ],
    focus: ["thigh1"],
  },
  forearm: {
    seconds: 20, sides: 2,
    poses: [
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [112, 32], head: [114, 22], arms: [[[110, 42], [138, 44], [164, 46], [182, 46]], [[110, 42], [128, 64], [168, 58]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]] },
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [112, 32], head: [114, 22], arms: [[[110, 42], [138, 44], [164, 46], [172, 62]], [[110, 42], [128, 66], [170, 68]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]] },
    ],
    focus: ["arm0"],
  },
  calf: {
    seconds: 30, sides: 2, wall: 34,
    poses: [
      { trunk: [[110, 96], [96, 72], [82, 50]], neck: [76, 40], head: [72, 30], arms: [[[82, 50], [62, 52], [42, 50]]], legs: [[[110, 96], [86, 120], [92, 146]], [[110, 96], [140, 122], [170, 146]]] },
      { trunk: [[102, 98], [86, 76], [70, 56]], neck: [64, 46], head: [60, 36], arms: [[[70, 56], [56, 58], [42, 56]]], legs: [[[102, 98], [78, 120], [92, 146]], [[102, 98], [136, 122], [170, 146]]] },
    ],
    focus: ["leg1"],
  },
  chest: {
    seconds: 30, sides: 1, wall: 130,
    poses: [
      { trunk: [[116, 98], [117, 70], [116, 42]], neck: [114, 32], head: [112, 22], arms: [[[116, 42], [128, 44], [128, 18]]], legs: [[[116, 98], [116, 122], [116, 146]], [[116, 98], [110, 122], [106, 146]]] },
      { trunk: [[104, 100], [104, 72], [104, 44]], neck: [101, 34], head: [98, 24], arms: [[[104, 44], [128, 44], [128, 18]]], legs: [[[104, 100], [90, 122], [84, 146]], [[104, 100], [112, 124], [118, 146]]] },
    ],
    focus: ["arm0"],
  },
};

// The pause before each exercise, and between its sides.
export const restSeconds = 10;
export const switchSeconds = 5;

// The set as timed steps: { type: "rest", seconds, next } before each exercise and between its sides, then
// { type: "work", id, side: 1 | 2 | null, seconds }. The first exercise starts after a rest too, to get ready.
export function steps(ids) {
  const list = [];
  for (const id of ids) {
    const { seconds, sides } = exercises[id];
    list.push({ type: "rest", seconds: restSeconds, next: id });
    for (let side = 1; side <= sides; side += 1) {
      if (side > 1) list.push({ type: "rest", seconds: switchSeconds, next: id });
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
