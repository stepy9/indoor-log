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
const tabletop = { trunk: [[140, 94], [100, 94], [60, 94]], neck: [46, 88], head: [36, 84], arms: [[[60, 94], [67, 146]], [[60, 94], [60, 146]]], legs: [[[140, 94], [147, 146], [191, 146]], [[140, 94], [140, 146], [184, 146]]] };

// Standing upright, facing left, for the warm-up's moves.
const standing = { trunk: [[110, 98], [111, 70], [110, 42]], neck: [108, 32], head: [106, 21], arms: [[[110, 42], [112, 68], [114, 92]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]], feet: [[96, 147], [102, 147]] };

export const exercises = {
  catCow: {
    seconds: 60, sides: 1,
    far: { arms: [0], legs: [0] },
    poses: [
      { ...tabletop, trunk: [[140, 94], [100, 114], [60, 94]], neck: [47, 84], head: [40, 76] },
      { ...tabletop, trunk: [[140, 94], [100, 54], [60, 94]], neck: [54, 106], head: [50, 116] },
    ],
    focus: ["trunk"],
  },
  childPose: {
    seconds: 45, sides: 1, hold: true,
    far: { arms: [0], legs: [0] },
    poses: [
      tabletop,
      { trunk: [[174, 130], [134, 116], [92, 128]], neck: [84, 134], head: [76, 138], arms: [[[92, 128], [47, 144]], [[92, 128], [40, 146]]], legs: [[[174, 130], [147, 146], [191, 146]], [[174, 130], [140, 146], [184, 146]]] },
    ],
    focus: ["trunk"],
  },
  hamstring: {
    seconds: 30, sides: 2, hold: true,
    // On the back, the near leg raised straight, a towel round its foot held by the hand; the far leg on the floor.
    far: { legs: [0] },
    poses: [
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [70, 124], [90, 110]]], legs: [[[128, 140], [168, 143], [206, 143]], [[128, 140], [160, 112], [190, 86]]], feet: [[208, 131], [184, 77]], strap: [[90, 110], [189, 82]] },
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [66, 120], [84, 102]]], legs: [[[128, 140], [168, 143], [206, 143]], [[128, 140], [140, 94], [150, 46]]], feet: [[208, 131], [140, 40]], strap: [[84, 102], [146, 43]] },
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
    // Standing, facing right: the near arm straight out, the far hand easing its fingers down.
    far: { arms: [1], legs: [0] },
    poses: [
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [112, 32], head: [114, 21], arms: [[[110, 42], [138, 44], [164, 46], [182, 46]], [[110, 42], [128, 64], [168, 58]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]], feet: [[124, 147], [130, 147]] },
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [112, 32], head: [114, 21], arms: [[[110, 42], [138, 44], [164, 46], [172, 62]], [[110, 42], [128, 66], [170, 68]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [116, 146]]], feet: [[124, 147], [130, 147]] },
    ],
    focus: ["arm0"],
    more: [{
      key: "detail",
      // The hand close up, palm up: the forearm, the palm and the fingers bending down at the wrist, the other
      // hand (far) pressing on the fingers from above.
      focus: ["band0"],
      far: { bands: [3, 4] },
      bandWidths: [26, 24, 14, 22, 16, 10],
      poses: [
        { arms: [], legs: [], bands: [[[-10, 84], [112, 84]], [[112, 84], [150, 84]], [[150, 84], [186, 84]], [[230, 6], [206, 42]], [[206, 42], [178, 78]], [[122, 78], [140, 66]]] },
        { arms: [], legs: [], bands: [[[-10, 84], [112, 84]], [[112, 84], [138, 112]], [[138, 112], [150, 144]], [[226, 64], [192, 100]], [[192, 100], [154, 128]], [[120, 80], [132, 62]]] },
      ],
    }],
  },
  calf: {
    seconds: 30, sides: 2, hold: true, wall: 34,
    // Hands on the wall, the front leg (far) bent, the back one straight with its heel down.
    far: { legs: [0] },
    poses: [
      { trunk: [[110, 96], [96, 72], [82, 50]], neck: [75, 40], head: [70, 29], arms: [[[82, 50], [62, 52], [44, 50]]], legs: [[[110, 96], [86, 120], [92, 146]], [[110, 96], [140, 122], [170, 146]]], feet: [[78, 147], [156, 147]] },
      { trunk: [[102, 98], [86, 76], [70, 56]], neck: [63, 46], head: [58, 35], arms: [[[70, 56], [56, 58], [44, 56]]], legs: [[[102, 98], [78, 120], [92, 146]], [[102, 98], [136, 122], [170, 146]]], feet: [[78, 147], [156, 147]] },
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
  latStretch: {
    seconds: 30, sides: 1, hold: true,
    // Kneeling before a chair, the forearms on its seat, the hips sinking back to the heels and the chest down.
    props: [{ x: 10, y: 92, width: 50, height: 9, rx: 3 }, { x: 14, y: 100, width: 6, height: 50, rx: 2 }, { x: 50, y: 100, width: 6, height: 50, rx: 2 }],
    far: { arms: [0], legs: [0] },
    poses: [
      { trunk: [[150, 100], [118, 96], [86, 90]], neck: [75, 94], head: [65, 98], arms: [[[86, 90], [56, 90], [34, 89]], [[86, 90], [50, 90], [28, 89]]], legs: [[[150, 100], [156, 146], [198, 146]], [[150, 100], [150, 146], [192, 146]]] },
      { trunk: [[170, 120], [128, 120], [88, 108]], neck: [77, 110], head: [66, 114], arms: [[[88, 108], [56, 90], [34, 89]], [[88, 108], [50, 90], [28, 89]]], legs: [[[170, 120], [156, 146], [198, 146]], [[170, 120], [150, 146], [192, 146]]] },
    ],
    focus: ["lat"],
  },
  quadStretch: {
    seconds: 30, sides: 2, hold: true, wall: 34,
    // Standing, a hand on the wall, the other bringing the heel to the buttock, the knees together.
    far: { arms: [0], legs: [0] },
    poses: [
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [108, 32], head: [106, 21], arms: [[[110, 42], [80, 48], [44, 50]], [[110, 42], [118, 68], [122, 94]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [114, 122], [134, 136]]], feet: [[96, 147], [144, 142]] },
      { trunk: [[110, 98], [111, 70], [110, 42]], neck: [108, 32], head: [106, 21], arms: [[[110, 42], [80, 48], [44, 50]], [[110, 42], [126, 72], [130, 100]]], legs: [[[110, 98], [110, 122], [110, 146]], [[110, 98], [112, 122], [128, 104]]], feet: [[96, 147], [138, 98]] },
    ],
    focus: ["thigh1"],
  },
  openBook: {
    seconds: 30, sides: 2, view: "top", floor: false,
    // From above, lying on the side, head left, knees bent forward: the top arm opens from in front to behind,
    // the chest turning with it.
    props: [{ x: 18, y: 20, width: 184, height: 136, rx: 10 }],
    far: { arms: [0], legs: [0] },
    arrows: ["M102,142 A54,54 0 0 0 102,36"],
    poses: [
      { trunk: [[140, 90], [105, 90], [70, 90]], neck: [58, 90], head: [46, 90], arms: [[[70, 90], [72, 118], [74, 146]], [[70, 90], [78, 116], [84, 142]]], legs: [[[140, 90], [152, 128], [184, 132]], [[140, 90], [146, 126], [178, 128]]] },
      { trunk: [[140, 90], [105, 90], [70, 90]], neck: [58, 90], head: [46, 88], arms: [[[70, 90], [72, 118], [74, 146]], [[70, 90], [78, 64], [84, 38]]], legs: [[[140, 90], [152, 128], [184, 132]], [[140, 90], [146, 126], [178, 128]]] },
    ],
    focus: ["trunk"],
  },
  kneesToChest: {
    seconds: 30, sides: 1, hold: true,
    // On the back, both knees drawn to the chest and hugged, the lower back long on the mat.
    far: { legs: [0] },
    poses: [
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [72, 145], [96, 145]]], legs: [[[128, 140], [152, 104], [176, 145]], [[128, 140], [146, 102], [170, 145]]], feet: [[190, 147], [184, 147]] },
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [70, 118], [94, 106]]], legs: [[[128, 140], [106, 100], [134, 108]], [[128, 140], [100, 102], [128, 112]]], feet: [[144, 102], [138, 106]] },
    ],
    focus: ["trunk"],
  },
  // The strength work, for the muscles rowing leaves out: the chest and triceps (it only pulls), the deep and side
  // trunk that guards the lower back, and each leg on its own (the stroke drives both together). reps: the
  // repeats a set starts at, per side where there are two; the holds start at their seconds.
  pushUp: {
    seconds: 30, sides: 1, reps: 8,
    far: { arms: [0], legs: [0] },
    arrows: [{ d: "M98,52 L98,86", both: true }],
    poses: [
      { trunk: [[126, 118], [94, 107], [62, 96]], neck: [52, 93], head: [41, 90], arms: [[[62, 96], [66, 122], [68, 146]], [[62, 96], [62, 122], [62, 146]]], legs: [[[126, 118], [160, 130], [192, 141]], [[126, 118], [157, 129], [188, 140]]], feet: [[198, 148], [194, 148]] },
      { trunk: [[126, 134], [93, 131], [60, 128]], neck: [50, 127], head: [39, 126], arms: [[[60, 128], [84, 126], [68, 146]], [[60, 128], [80, 124], [62, 146]]], legs: [[[126, 134], [160, 138], [192, 141]], [[126, 134], [157, 137], [188, 140]]], feet: [[198, 148], [194, 148]] },
    ],
    focus: ["arm1"],
  },
  plank: {
    seconds: 30, sides: 1, hold: true,
    far: { arms: [0], legs: [0] },
    poses: [
      { trunk: [[130, 130], [100, 120], [70, 110]], neck: [60, 109], head: [49, 108], arms: [[[70, 110], [74, 146], [46, 146]], [[70, 110], [70, 146], [40, 146]]], legs: [[[130, 130], [164, 146], [196, 146]], [[130, 130], [160, 146], [192, 146]]], feet: [[198, 140], [194, 140]] },
      { trunk: [[130, 124], [100, 117], [70, 110]], neck: [60, 109], head: [49, 108], arms: [[[70, 110], [74, 146], [46, 146]], [[70, 110], [70, 146], [40, 146]]], legs: [[[130, 124], [164, 132], [196, 140]], [[130, 124], [160, 132], [192, 140]]], feet: [[198, 148], [194, 148]] },
    ],
    focus: ["trunk"],
  },
  deadBug: {
    seconds: 30, sides: 1, reps: 10,
    // On the back, arms up and knees over the hips: the near arm back and the far leg out, slowly, the lower back down.
    far: { arms: [0], legs: [0] },
    poses: [
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [50, 114], [52, 88]], [[48, 140], [46, 114], [44, 88]]], legs: [[[128, 140], [132, 100], [168, 100]], [[128, 140], [126, 100], [162, 100]]], feet: [[176, 92], [170, 92]] },
      { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [50, 114], [52, 88]], [[48, 140], [28, 132], [6, 126]]], legs: [[[128, 140], [162, 130], [198, 124]], [[128, 140], [126, 100], [162, 100]]], feet: [[204, 114], [170, 92]] },
    ],
    focus: ["trunk"],
  },
  sidePlank: {
    seconds: 20, sides: 2, hold: true, view: "front",
    // From the front, on one forearm, the body one straight line from the feet to the head, the hips lifted.
    far: { arms: [0] },
    poses: [
      { trunk: [[126, 140], [94, 118], [60, 96]], neck: [49, 89], head: [39, 82], arms: [[[60, 96], [62, 122], [64, 146]], [[60, 96], [61, 70], [62, 44]]], legs: [[[126, 140], [160, 143], [194, 145]], [[126, 140], [158, 140], [190, 141]]] },
      { trunk: [[126, 120], [93, 108], [60, 96]], neck: [49, 89], head: [39, 82], arms: [[[60, 96], [62, 122], [64, 146]], [[60, 96], [61, 70], [62, 44]]], legs: [[[126, 120], [160, 133], [194, 145]], [[126, 120], [158, 130], [190, 140]]] },
    ],
    focus: ["trunk"],
  },
  lunge: {
    seconds: 30, sides: 2, reps: 8,
    // A split stance, the trunk upright: down until the back knee nearly touches, and up again.
    far: { legs: [1] },
    arrows: [{ d: "M176,44 L176,96", both: true }],
    poses: [
      { trunk: [[114, 96], [115, 68], [114, 40]], neck: [112, 30], head: [110, 19], arms: [[[114, 40], [116, 66], [118, 90]]], legs: [[[114, 96], [96, 120], [84, 146]], [[114, 96], [132, 120], [148, 140]]], feet: [[70, 147], [156, 148]] },
      { trunk: [[116, 118], [117, 90], [116, 62]], neck: [114, 52], head: [112, 41], arms: [[[116, 62], [118, 88], [120, 112]]], legs: [[[116, 118], [90, 118], [84, 146]], [[116, 118], [128, 142], [156, 140]]], feet: [[70, 147], [164, 148]] },
    ],
    focus: ["thigh0"],
  },
  // The warm-up's moves, done in rhythm rather than held: the figure shows the two ends of the move.
  bridge: {
    seconds: 30, sides: 1,
    // On the back, knees bent: the hips lift until shoulders, hips and knees are in line, and lower again.
    far: { legs: [0] },
    arrows: [{ d: "M122,60 L122,94", both: true }],
    poses: [
      { trunk: [[124, 140], [88, 140], [52, 140]], neck: [40, 138], head: [28, 136], arms: [[[52, 140], [76, 145], [100, 145]]], legs: [[[124, 140], [150, 104], [172, 145]], [[124, 140], [146, 102], [166, 145]]], feet: [[186, 147], [180, 147]] },
      { trunk: [[122, 106], [88, 124], [52, 140]], neck: [40, 138], head: [28, 136], arms: [[[52, 140], [76, 145], [100, 145]]], legs: [[[122, 106], [154, 98], [172, 145]], [[122, 106], [148, 96], [166, 145]]], feet: [[186, 147], [180, 147]] },
    ],
    focus: ["thigh1"],
  },
  // The warm-up's moves, done in rhythm rather than held: the figure shows the two ends of the move.
  armSwings: {
    seconds: 30, sides: 1,
    // Round through four poses, down, forward, up and back, the arrow showing the way.
    far: { legs: [1] },
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
    // The trunk tips forward from the hips, the back flat; the arrow shows the way down.
    far: { legs: [1] },
    arrows: ["M100,6 A92,92 0 0 0 36,54"],
    poses: [
      { ...standing, arms: [[[110, 42], [112, 68], [114, 92]]] },
      { trunk: [[118, 96], [92, 86], [66, 78]], neck: [55, 74], head: [44, 70], arms: [[[66, 78], [66, 104], [66, 128]]], legs: [[[118, 96], [114, 122], [110, 146]], [[118, 96], [118, 122], [116, 146]]], feet: [[96, 147], [102, 147]] },
    ],
    focus: ["trunk"],
  },
  squat: {
    seconds: 40, sides: 1,
    // Down and up again, the arrow both ways beside the hips.
    far: { legs: [1] },
    arrows: [{ d: "M168,58 L168,118", both: true }],
    poses: [
      { ...standing, arms: [[[110, 42], [84, 44], [58, 46]]] },
      { trunk: [[132, 114], [118, 90], [104, 66]], neck: [99, 56], head: [94, 45], arms: [[[104, 66], [78, 68], [52, 70]]], legs: [[[132, 114], [96, 118], [106, 146]], [[132, 114], [100, 120], [112, 146]]], feet: [[92, 147], [98, 147]] },
    ],
    focus: ["thigh0"],
  },
  legSwings: {
    seconds: 20, sides: 2, wall: 34,
    // A hand on the wall, the near leg swinging forward and back like a pendulum, the arrow both ways under it.
    far: { legs: [0] },
    arrows: [{ d: "M76,122 A38,38 0 0 0 144,122", both: true }],
    poses: [
      { ...standing, arms: [[[110, 42], [80, 48], [44, 50]]], legs: [standing.legs[0], [[110, 98], [86, 118], [64, 128]]], feet: [[96, 147], [54, 119]] },
      { ...standing, arms: [[[110, 42], [80, 48], [44, 50]]], legs: [standing.legs[0], [[110, 98], [134, 118], [156, 128]]], feet: [[96, 147], [163, 139]] },
    ],
    focus: ["leg1"],
  },
};

// The views an exercise is drawn in, for figure-svg.js: its side view first (on the mat, by its wall and props,
// with its far limbs and arrows), then any other ("top", "front" or "detail"), each { key, poses, focus, blocks,
// far, arrows }.
export function exerciseViews(id) {
  const { poses, focus = [], wall, props = [], far, arrows, more = [], view = "side", floor = true } = exercises[id];
  if (!poses) return [];
  // The floor under a side view; a view from above has its mat among the props.
  const blocks = [...(floor ? [{ x: 14, y: 150, width: 192, height: 8, rx: 4 }] : []), ...(wall != null ? [{ x: wall, y: 6, width: 7, height: 146, rx: 3 }] : []), ...props];
  return [{ key: view, poses, focus, blocks, far, arrows }, ...more.map((other) => ({ focus, blocks: [], ...other }))];
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

// Each set: the core always in it (the back, the hamstrings and the hip flexors a rower needs every time) and so
// many more from its pool, taken in turn day by day, so the same kind of workout is not always followed alike.
const sets = {
  easy: { core: ["catCow", "hamstring", "hipFlexor"], pool: ["kneesToChest", "childPose", "figureFour", "quadStretch"], take: 1 },
  long: { core: ["catCow", "hamstring", "hipFlexor"], pool: ["quadStretch", "figureFour", "openBook", "forearm", "childPose", "latStretch", "kneesToChest"], take: 4 },
  hard: { core: ["catCow", "hamstring", "hipFlexor"], pool: ["latStretch", "figureFour", "calf", "chest", "quadStretch", "openBook"], take: 4 },
};

// The order a set runs in, so one position leads to the next: standing first, then on all fours and kneeling,
// lying last.
const flow = ["quadStretch", "calf", "chest", "forearm", "catCow", "childPose", "latStretch", "hipFlexor", "hamstring", "figureFour", "kneesToChest", "openBook"];
// A warm-up the other way round: from the floor up to standing, ready for the rower.
const warmFlow = ["catCow", "bridge", "armSwings", "hipHinge", "squat", "legSwings"];

// The day's turn of a pool: take of them, starting further on each day and wrapping round, so over a few days
// each comes. day: "YYYY-MM-DD" (null: the first turn).
export function pick({ core, pool, take }, day = null, order = flow) {
  const number = day ? Math.round(Date.parse(`${day}T12:00:00Z`) / 86_400_000) : 0;
  const start = (number * take) % pool.length;
  const picked = Array.from({ length: Math.min(take, pool.length) }, (_, index) => pool[(start + index) % pool.length]);
  return [...core, ...picked].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}
const hardBenefits = new Set(["threshold", "vo2max", "anaerobic", "sprint"]);

// The set after a workout: { set, cooldown, exercises, minutes }. benefit is the primary benefit or null,
// seconds the workout's time, day its day for the set's turn. A hard workout asks first for a few easy minutes on
// the machine; a recovery or a short one gets the short set, a longer steady one the fuller set.
export function afterWorkout({ benefit = null, seconds = 0, day = null }) {
  const hard = hardBenefits.has(benefit);
  const set = hard ? "hard" : benefit === "recovery" || seconds < 45 * 60 ? "easy" : "long";
  const ids = pick(sets[set], day);
  const total = steps(ids).reduce((sum, step) => sum + step.seconds, 0);
  return { set, cooldown: hard, exercises: ids, minutes: Math.round(total / 60) };
}

// The warm-up before a rowing workout: moves for the back, shoulders and hips done in rhythm, short pauses between.
// Before intervals, an FTP test or the goal the full set, then easy minutes on the rower building up to a few
// strokes at the effort's pace; before a steady workout the short set, the first minutes on the rower easy anyway.
export const warmupRest = 5;
// The short warm-up takes two of the moves in turn beside cat–cow; the full one takes them all.
const warmups = {
  short: { core: ["catCow"], pool: ["armSwings", "squat", "bridge", "hipHinge", "legSwings"], take: 2, seconds: { catCow: 30, squat: 30 } },
  full: { core: ["catCow", "armSwings", "bridge", "hipHinge", "squat", "legSwings"], pool: [], take: 0, seconds: { catCow: 45 } },
};
const hardTypes = new Set(["intervals", "ftpTestShort", "ftpTest", "goal"]);

// The warm-up for a planned day's type: { set, exercises, seconds, minutes, onRower }; onRower the easy minutes
// on the machine to go on with, before the efforts of a hard day. day: the planned day, for the short set's turn.
export function warmupBefore(type, day = null) {
  const set = hardTypes.has(type) ? "full" : "short";
  const { seconds } = warmups[set];
  const ids = pick(warmups[set], day, warmFlow);
  const total = steps(ids, { rest: warmupRest, seconds }).reduce((sum, step) => sum + step.seconds, 0);
  return { set, exercises: ids, seconds, minutes: Math.max(1, Math.round(total / 60)), onRower: set === "full" ? 5 : 0 };
}

// Every exercise of the warm-up and the stretching, in the order the sets first take them, each with its time in
// them and the sets it is in: { warmup: [{ id, seconds, sets }], stretch: [...] }, sets naming warmups' and sets' keys.
export function exerciseCatalog() {
  const collect = (groups, order) => {
    const list = [];
    for (const [set, { core, pool, seconds = {} }] of Object.entries(groups)) {
      for (const id of [...core, ...pool].sort((a, b) => order.indexOf(a) - order.indexOf(b))) {
        const found = list.find((item) => item.id === id);
        if (found) found.sets.push(set);
        else list.push({ id, seconds: seconds[id] ?? exercises[id].seconds, sides: exercises[id].sides, sets: [set] });
      }
    }
    return list;
  };
  return {
    warmup: collect(warmups, warmFlow),
    stretch: collect(sets, flow),
  };
}

// Strength twice a week for the muscles rowing leaves out, in two rounds: each exercise by its repeats (a press of
// "done" ends it) or, a hold, by its time, a short rest between and a longer one between the rounds. The dose
// follows a level (see strengthLevel): each step a repeat or five seconds more, up to a ceiling.
// Double progression: the repeats grow to the top of their range in two rounds, then a third round comes and
// they start again from the bottom, growing to the top once more. most: the top; a hold's in seconds.
export const strengthPlan = {
  rounds: 2,
  moreRoundsFrom: 6,
  rest: 20,
  roundRest: 60,
  // In the order they run: standing, on the hands, then lying.
  exercises: [
    { id: "lunge", reps: 8, most: 12 },
    { id: "pushUp", reps: 8, most: 15 },
    { id: "plank", seconds: 30, most: 45 },
    { id: "sidePlank", seconds: 20, most: 30 },
    { id: "deadBug", reps: 10, most: 16 },
    { id: "bridge", reps: 12, most: 15 },
  ],
};
export const strengthPerWeek = 2;
// A repeat's time, to tell how long a set of them takes.
const repSeconds = 3;

// The level strength work has reached, in steps of a repeat or five seconds: half a step for every session done,
// and a step less for every full week of a break beyond two (between sessions, and from the last one to today),
// never below the start. log: { "YYYY-MM-DD": true }. { steps, eased: the steps the break up to today took off }.
export const strengthBreakDays = 14;
export function strengthLevel(log = {}, today = null) {
  const days = Object.keys(log).filter((day) => log[day] && (!today || day <= today)).sort();
  const off = (from, to) => Math.max(0, Math.floor((Math.round((keyNoon(to) - keyNoon(from)) / 86_400_000) - strengthBreakDays) / 7));
  let level = 0;
  days.forEach((day, index) => {
    if (index) level = Math.max(0, level - off(days[index - 1], day));
    level += 0.5;
  });
  const eased = today && days.length ? Math.min(Math.floor(level), off(days.at(-1), today)) : 0;
  return { steps: Math.max(0, Math.floor(level) - eased), eased };
}

// Each exercise's dose at a level's steps: { id, reps } or { id, seconds }.
// The rounds at a level's steps: two, three from moreRoundsFrom on.
export const strengthRounds = (steps = 0) => strengthPlan.rounds + (steps >= strengthPlan.moreRoundsFrom ? 1 : 0);
export function strengthDoses(steps = 0) {
  // With the third round the repeats start again from the bottom of their range.
  const within = steps >= strengthPlan.moreRoundsFrom ? steps - strengthPlan.moreRoundsFrom : steps;
  return strengthPlan.exercises.map(({ id, reps, seconds, most }) => (reps
    ? { id, reps: Math.min(most, reps + within) }
    : { id, seconds: Math.min(most, seconds + within * 5) }));
}

// The session at a level's steps as the player's steps: a rest before each exercise (the longer one before a
// round), then its work, per side where it has two: { type: "work", id, side, reps } for repeats, with seconds
// for a hold. round counts from 1. { steps, minutes, doses }.
export function strengthSession(level = 0) {
  const doses = strengthDoses(level);
  const list = [];
  const rounds = strengthRounds(level);
  for (let round = 1; round <= rounds; round += 1) {
    doses.forEach((dose, index) => {
      const { sides } = exercises[dose.id];
      list.push({ type: "rest", seconds: round > 1 && index === 0 ? strengthPlan.roundRest : index === 0 ? restSeconds : strengthPlan.rest, next: dose.id, round });
      for (let side = 1; side <= sides; side += 1) {
        if (side > 1) list.push({ type: "rest", seconds: switchSeconds, next: dose.id, round });
        list.push({ type: "work", id: dose.id, side: sides > 1 ? side : null, round, ...(dose.reps ? { reps: dose.reps } : { seconds: dose.seconds }) });
      }
    });
  }
  const total = list.reduce((sum, step) => sum + (step.seconds ?? step.reps * repSeconds), 0);
  return { steps: list, minutes: Math.round(total / 60), doses, rounds };
}

function keyNoon(key) {
  return Date.parse(`${key}T12:00:00Z`);
}
const mondayKey = (key) => {
  const ms = keyNoon(key);
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};

// Whether today asks for strength work: under twice this week (Monday on), none yesterday or today, and today
// an easy one: no intervals, FTP test, goal or opener planned, and not the goal's week (taper "final").
// log: { "YYYY-MM-DD": true }; type: today's planned type or null for a day without one.
// { due, done: this week's count, rest: why not ("enough", "today", "yesterday", "hard", "taper") }.
const hardDays = new Set(["intervals", "ftpTestShort", "ftpTest", "goal", "opener"]);
export function strengthToday(log = {}, today, { type = null, taper = null } = {}) {
  const monday = mondayKey(today);
  const yesterday = new Date(keyNoon(today) - 86_400_000).toISOString().slice(0, 10);
  const done = Object.keys(log).filter((day) => log[day] && day >= monday && day <= today).length;
  const rest = log[today] ? "today" : done >= strengthPerWeek ? "enough" : taper === "final" ? "taper" : hardDays.has(type) ? "hard" : log[yesterday] ? "yesterday" : null;
  return { due: !rest, done, rest };
}
