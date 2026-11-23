// The exercises of the sets put together on demand: the mobility and flexibility work of Michal Novotný's book
// "Sport je bolest" (chapter 9, its videos 9.17–9.27) and the long holds of yin yoga. Each in the shape of
// recovery.js's exercises, which take them in, so the same player, figures and catalogue serve them; beside that
// its style, the areas it works and, from the book, its video's number. Names and how-tos live in i18n under
// recovery_<id> and recoveryHow_<id>, written in the app's own words.

// The figure is built from lengths and angles rather than points, so the limbs keep their length from pose to pose:
// an angle in degrees on the screen (0 right, 90 down, -90 up). s scales the whole body, smaller for an upright
// pose with the arms overhead so it fits the 220 × 170 box. The mat's top is y 150; a part on it at y 146.
const rad = Math.PI / 180;
const at = ([x, y], length, angle) => [Math.round(x + length * Math.cos(angle * rad)), Math.round(y + length * Math.sin(angle * rad))];

function kit(s = 1) {
  const size = { trunk: 80 * s, thigh: 50 * s, shin: 46 * s, upper: 30 * s, fore: 28 * s, foot: 14 * s };
  // The trunk from the hip at its angle; bend bows it (positive to the left of the way it runs, so a back lying
  // head-left with a positive bend arches up). The neck and head follow the trunk unless turned.
  const trunk = (hip, angle, { bend = 0, neck = angle } = {}) => {
    const shoulder = at(hip, size.trunk, angle);
    const middle = [(hip[0] + shoulder[0]) / 2, (hip[1] + shoulder[1]) / 2];
    const control = at(middle, bend, angle - 90);
    const neckEnd = at(shoulder, 10, neck);
    return { trunk: [hip, control, shoulder], neck: neckEnd, head: at(neckEnd, 11, neck), shoulder };
  };
  const leg = (hip, thigh, shin) => [hip, at(hip, size.thigh, thigh), at(at(hip, size.thigh, thigh), size.shin, shin)];
  const arm = (shoulder, upper, fore = upper) => [shoulder, at(shoulder, size.upper, upper), at(at(shoulder, size.upper, upper), size.fore, fore)];
  const toe = (legJoints, angle) => at(legJoints[2], size.foot, angle);
  // The hip's height for a leg whose ankle or knee rests on the mat at y 146.
  const hipOver = (x, thigh, shin = null) => {
    const knee = shin == null ? [x, 146] : null;
    if (knee) return at(knee, size.thigh, thigh + 180);
    const ankle = [x, 146];
    return at(at(ankle, size.shin, shin + 180), size.thigh, thigh + 180);
  };
  return { size, trunk, leg, arm, toe, hipOver };
}

// A pose from a trunk and its limbs: { trunk, neck, head, arms, legs, feet }.
const pose = ({ shoulder, ...body }, arms, legs, feet) => ({ ...body, arms, legs, ...(feet ? { feet } : {}) });

// ---- Mobility: done dynamically, slow at first and quicker as it goes, 30–60 s each (the book's 9.17–9.21).

// 9.17 A deep lunge, the arm reaching up, then the hips back over the back knee and the trunk down over the
// straightened front leg.
function lungeReach() {
  const k = kit(0.72);
  const knee = [128, 146];
  const hip = at(knee, k.size.thigh, 245);
  const backLeg = [hip, knee, at(knee, k.size.shin, 0)];
  const front = k.leg(hip, 180, 90);
  const up = k.trunk(hip, -88);
  const a = pose(up, [k.arm(up.shoulder, -100, -95), k.arm(up.shoulder, 80, 100)], [front, backLeg], [k.toe(front, 180), k.toe(backLeg, 0)]);
  // Back: the hip over the knee, the front leg long, the hands to its foot.
  const hip2 = at(knee, k.size.thigh, 268);
  const front2 = k.leg(hip2, 160, 175);
  const fold = k.trunk(hip2, 205, { bend: -6, neck: 200 });
  const back2 = [hip2, knee, at(knee, k.size.shin, 0)];
  const b = pose(fold, [k.arm(fold.shoulder, 115, 150), k.arm(fold.shoulder, 125, 155)], [front2, back2], [k.toe(front2, -110), k.toe(back2, 0)]);
  return { poses: [a, b], far: { arms: [1], legs: [1] }, focus: ["thigh1", "leg0"] };
}

// 9.18 Seated, hands behind, the knees wide: both knees fall to one side, the hips turning, and the free arm reaches
// forward over them.
function hipSwitch() {
  const k = kit(0.85);
  const hip = [130, 140];
  const up = k.trunk(hip, -72, { neck: -100 });
  const legs = [k.leg(hip, -140, 112), k.leg(hip, -135, 110)];
  const a = pose(up, [k.arm(up.shoulder, 70, 80), k.arm(up.shoulder, 62, 76)], legs, [k.toe(legs[0], 180), k.toe(legs[1], 180)]);
  // The knees down to the mat, the trunk turning forward over them, an arm reaching ahead.
  const turn = k.trunk(hip, -105, { neck: -150 });
  const down = [k.leg(hip, 172, 20), k.leg(hip, 176, 15)];
  const b = pose(turn, [k.arm(turn.shoulder, -170, -175), k.arm(turn.shoulder, 70, 80)], down, [k.toe(down[0], 0), k.toe(down[1], 0)]);
  return { poses: [a, b], far: { arms: [1], legs: [0] }, focus: ["thigh1"] };
}

// 9.19 Sitting with the legs long, hands beside the hips, then the hips up into a table: head, trunk and thighs in line.
function reverseTable() {
  const k = kit(0.9);
  const hip = [118, 140];
  const sit = k.trunk(hip, -95, { neck: -80 });
  const long = [k.leg(hip, 0, 0), k.leg(hip, 2, 0)];
  const a = pose(sit, [k.arm(sit.shoulder, 92, 90), k.arm(sit.shoulder, 96, 92)], long, [k.toe(long[0], -80), k.toe(long[1], -80)]);
  // The table: hands under the shoulders, knees bent, the feet flat.
  const hand = [52, 146];
  const shoulder = at(hand, k.size.upper + k.size.fore, -90);
  const hip2 = at(shoulder, k.size.trunk, 0);
  const table = k.trunk(hip2, 180, { neck: 160 });
  const bent = [k.leg(hip2, 10, 90), k.leg(hip2, 14, 90)];
  const fix = (leg) => [leg[0], leg[1], [leg[1][0], 146]];
  const b = pose(table, [k.arm(table.shoulder, 90, 90), k.arm(table.shoulder, 92, 90)], bent.map(fix), [k.toe(fix(bent[0]), 0), k.toe(fix(bent[1]), 0)]);
  return { poses: [a, b], far: { arms: [1], legs: [1] }, focus: ["trunk"] };
}

// 9.20 On the forearms and knees, one leg lifted bent at a right angle, then the whole body turning open to that side.
function forearmOpen() {
  const k = kit(0.9);
  const knee = [140, 146];
  const hip = at(knee, k.size.thigh, 270);
  const flat = k.trunk(hip, 180, { neck: 175 });
  const support = [hip, knee, at(knee, k.size.shin, 0)];
  const lifted = k.leg(hip, -10, -100);
  const a = pose(flat, [k.arm(flat.shoulder, 90, 180), k.arm(flat.shoulder, 92, 180)], [support, lifted], [k.toe(support, 0), k.toe(lifted, -100)]);
  // Turned open: the top arm up and back, the lifted leg opening sideways (seen shorter).
  const open = k.trunk(hip, 190, { neck: 230 });
  const turned = k.leg(hip, -50, -20);
  const b = pose(open, [k.arm(open.shoulder, 90, 180), k.arm(open.shoulder, -70, -60)], [support, turned], [k.toe(support, 0), k.toe(turned, -20)]);
  return { poses: [a, b], far: { arms: [0], legs: [0] }, focus: ["thigh1", "trunk"] };
}

// 9.21 Kneeling with the knees wide, hands ahead: the hips low and the chest up, then back to the heels, the back round.
function archToHeels() {
  const k = kit(0.9);
  const hands = [50, 146];
  const knee = [140, 146];
  const lowHip = [132, 124];
  const arch = { trunk: [lowHip, [96, 136], [64, 98]], neck: [56, 90], head: [52, 78] };
  const shin = (hip) => [hip, knee, at(knee, k.size.shin, 0)];
  const a = { ...arch, arms: [[[64, 98], [57, 122], hands], [[64, 98], [60, 122], [54, 146]]], legs: [shin(lowHip), shin(lowHip)], feet: [[200, 146], [196, 146]] };
  // Back to the heels: the back round, the head down between the arms.
  const heels = [172, 124];
  const round = { trunk: [heels, [128, 84], [86, 118]], neck: [78, 126], head: [70, 134] };
  const b = { ...round, arms: [[[86, 118], [66, 132], hands], [[86, 118], [68, 134], [54, 146]]], legs: [shin(heels), shin(heels)], feet: [[200, 146], [196, 146]] };
  return { poses: [a, b], far: { arms: [1], legs: [1] }, focus: ["trunk"] };
}

// ---- Flexibility: six whole-chain stretches (the book's 9.22–9.27), held about 20 s to keep the range or up to a
// minute to gain it; the whole set two or three times.

// 9.22 Standing wide, the trunk tipped to the side, the lower hand down the inside of the leg, the upper one up.
function triangle() {
  const k = kit(0.72);
  const hip = [120, 94];
  const legs = [k.leg(hip, 120, 112), k.leg(hip, 62, 66)];
  const upright = k.trunk(hip, -90);
  const a = pose(upright, [k.arm(upright.shoulder, 180, 180), k.arm(upright.shoulder, 0, 0)], legs, [k.toe(legs[0], 180), k.toe(legs[1], 0)]);
  const tipped = k.trunk(hip, -165, { neck: -170 });
  const b = pose(tipped, [k.arm(tipped.shoulder, 100, 95), k.arm(tipped.shoulder, -80, -85)], legs, [k.toe(legs[0], 180), k.toe(legs[1], 0)]);
  return { poses: [a, b], far: { arms: [0], legs: [1] }, focus: ["leg0", "trunk"] };
}

// 9.23 Kneeling on one knee, the front foot flat: the hand takes the back foot to the buttock, the other arm reaches up.
function kneelingQuad() {
  const k = kit(0.72);
  const knee = [126, 146];
  const hip = at(knee, k.size.thigh, 255);
  const front = k.leg(hip, 180, 90);
  const lying = [hip, knee, at(knee, k.size.shin, 0)];
  const up = k.trunk(hip, -88);
  const a = pose(up, [k.arm(up.shoulder, -95, -95), k.arm(up.shoulder, 85, 95)], [front, lying], [k.toe(front, 180), k.toe(lying, 0)]);
  // The back foot drawn up, the hand behind holding it.
  const hip2 = at(knee, k.size.thigh, 245);
  const front2 = k.leg(hip2, 180, 95);
  const drawn = [hip2, knee, at(knee, k.size.shin, -75)];
  const up2 = k.trunk(hip2, -84);
  const b = pose(up2, [k.arm(up2.shoulder, -100, -98), [up2.shoulder, at(up2.shoulder, k.size.upper, 60), drawn[2]]], [front2, drawn], [k.toe(front2, 180), k.toe(drawn, -10)]);
  return { poses: [a, b], far: { arms: [0], legs: [0] }, focus: ["thigh1"] };
}

// 9.24 The low lunge, the back knee and toes down, both arms up with the palms together, bending to the side.
// Seen from the front: the bend reads only so.
function lungeSideBend() {
  // From the front: the front leg's knee over its foot, the back knee down on the mat; the shoulders apart.
  const hip = [110, 114];
  const legs = [[[102, 114], [86, 128], [90, 146]], [[118, 114], [124, 132], [126, 146]]];
  const a = { trunk: [hip, [110, 88], [110, 62]], neck: [110, 50], head: [110, 38], arms: [[[98, 64], [92, 40], [106, 16]], [[122, 64], [128, 40], [114, 16]]], legs, feet: [[78, 146], [136, 146]] };
  // Bending to the side: the trunk curving over, the joined hands reaching beyond the head.
  const b = { trunk: [hip, [104, 86], [88, 66]], neck: [80, 56], head: [72, 46], arms: [[[78, 72], [62, 52], [52, 28]], [[98, 60], [84, 36], [58, 24]]], legs, feet: [[78, 146], [136, 146]] };
  return { view: "front", poses: [a, b], far: { arms: [0] }, focus: ["trunk"] };
}

// 9.25 Downward dog: on the hands and the feet, the hips high, back and arms in one line, the heels reaching down.
function downDog() {
  const k = kit(0.95);
  const hands = [40, 146];
  const feet = [178, 146];
  const lifted = [126, 54];
  const a = { trunk: [[128, 70], [104, 86], [78, 104]], neck: [68, 112], head: [60, 120], arms: [[[78, 104], [60, 124], hands], [[78, 104], [62, 126], [46, 146]]], legs: [[[128, 70], [150, 104], [176, 140]], [[128, 70], [154, 104], [182, 140]]], feet: [[190, 142], [196, 142]] };
  const b = { trunk: [lifted, [94, 76], [70, 100]], neck: [61, 110], head: [54, 119], arms: [[[70, 100], [56, 122], hands], [[70, 100], [58, 124], [46, 146]]], legs: [[lifted, [152, 100], [176, 146]], [lifted, [156, 100], [182, 146]]], feet: [[190, 146], [196, 146]] };
  void k; void feet;
  return { poses: [a, b], far: { arms: [1], legs: [1] }, focus: ["leg0"] };
}

// 9.26 A deep lunge, the hand down beside the front foot, the trunk turning open and the other arm up: one line.
function lungeTwist() {
  const k = kit(0.72);
  const knee = [146, 146];
  const hip = at(knee, k.size.thigh, 220);
  const front = k.leg(hip, 175, 95);
  const backLeg = [hip, knee, at(knee, k.size.shin, 0)];
  const low = k.trunk(hip, -160, { neck: -150 });
  const a = pose(low, [k.arm(low.shoulder, 95, 95), k.arm(low.shoulder, 100, 100)], [front, backLeg], [k.toe(front, 180), k.toe(backLeg, 0)]);
  const open = k.trunk(hip, -150, { neck: -110 });
  const b = pose(open, [k.arm(open.shoulder, 95, 92), k.arm(open.shoulder, -85, -88)], [front, backLeg], [k.toe(front, 180), k.toe(backLeg, 0)]);
  return { poses: [a, b], far: { arms: [0], legs: [0] }, focus: ["thigh1", "trunk"] };
}

// 9.27 On all fours, the back flat: one arm and the leg on its side lifted long, then both swung across behind,
// the side of the body making a "C". Seen from the front.
function allFoursSide() {
  const hip = [150, 92];
  const shoulder = [70, 92];
  const flat = { trunk: [hip, [110, 92], shoulder], neck: [58, 92], head: [47, 92] };
  const a = { ...flat, arms: [[shoulder, [70, 120], [70, 146]], [shoulder, [50, 80], [28, 70]]], legs: [[hip, [150, 120], [150, 146]], [hip, [176, 84], [204, 78]]], feet: [[166, 146], [214, 76]] };
  const b = { trunk: [hip, [110, 82], shoulder], neck: [60, 86], head: [52, 78], arms: [[shoulder, [70, 120], [70, 146]], [shoulder, [92, 64], [120, 50]]], legs: [[hip, [150, 120], [150, 146]], [hip, [128, 70], [104, 58]]], feet: [[166, 146], [94, 52]] };
  return { view: "front", poses: [a, b], far: { arms: [0], legs: [0] }, focus: ["trunk"] };
}

// ---- Yin yoga: few poses, each held long and still, the muscles let go; every one gets its own few minutes.

// Butterfly: seated, the soles together and the knees out, folding forward with a round back.
function butterfly() {
  const hip = [130, 138];
  const up = { trunk: [hip, [124, 100], [118, 62]], neck: [116, 52], head: [114, 41] };
  const folded = { trunk: [hip, [96, 90], [74, 112]], neck: [66, 120], head: [60, 130] };
  const legs = [[hip, [88, 124], [104, 142]], [hip, [92, 118], [106, 140]]];
  const a = { ...up, arms: [[[118, 62], [108, 92], [100, 118]]], legs, feet: [[94, 144], [96, 142]] };
  const b = { ...folded, arms: [[[74, 112], [88, 130], [98, 142]]], legs, feet: [[94, 144], [96, 142]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["thigh0", "trunk"] };
}

// Caterpillar: seated, the legs long, folding forward and letting the back round over them.
function caterpillar() {
  const hip = [100, 140];
  const up = { trunk: [hip, [96, 100], [92, 62]], neck: [90, 52], head: [88, 41] };
  const folded = { trunk: [hip, [128, 96], [156, 112]], neck: [164, 120], head: [172, 128] };
  const legs = [[hip, [148, 142], [196, 142]], [hip, [146, 140], [192, 140]]];
  const a = { ...up, arms: [[[92, 62], [112, 92], [132, 116]]], legs, feet: [[200, 128], [196, 126]] };
  const b = { ...folded, arms: [[[156, 112], [170, 128], [186, 138]]], legs, feet: [[200, 128], [196, 126]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk", "leg0"] };
}

// Sphinx: lying on the front, raised on the forearms, the lower back gently arched, the legs long and heavy.
function sphinx() {
  const hip = [132, 140];
  const flat = { trunk: [hip, [96, 141], [62, 140]], neck: [50, 139], head: [39, 136], arms: [[[62, 140], [46, 145], [20, 146]]], legs: [[hip, [168, 142], [204, 144]], [hip, [166, 140], [200, 142]]], feet: [[212, 136], [208, 134]] };
  const raised = { trunk: [hip, [104, 138], [66, 104]], neck: [58, 96], head: [52, 84], arms: [[[66, 104], [66, 144], [30, 146]]], legs: flat.legs, feet: flat.feet };
  return { poses: [flat, raised], far: { legs: [1] }, focus: ["trunk"] };
}

// Dragon: a long low lunge, the back knee down, the hands either side of the front foot, the hips sinking.
function dragon() {
  const knee = [160, 146];
  const hip = [120, 116];
  const low = [112, 124];
  const shape = (h) => ({ trunk: [h, [92, 100], [68, 86]], neck: [58, 80], head: [48, 74], arms: [[[68, 86], [64, 116], [60, 146]]], legs: [[h, [64, 114], [62, 146]], [h, knee, [206, 146]]], feet: [[48, 146], [214, 146]] });
  const a = shape(hip);
  const b = { ...shape(low), trunk: [low, [88, 106], [66, 92]], neck: [56, 86], head: [46, 80], arms: [[[66, 92], [63, 118], [60, 146]]] };
  return { poses: [a, b], far: { legs: [0] }, focus: ["thigh1"] };
}

// Swan, a sleeping one: the front leg bent across in front, the back one long behind, the trunk folding over the
// front shin onto the forearms.
function swan() {
  const hip = [120, 126];
  const legs = [[hip, [86, 140], [118, 146]], [hip, [164, 144], [208, 146]]];
  const up = { trunk: [hip, [110, 96], [100, 66]], neck: [98, 56], head: [96, 45], arms: [[[100, 66], [90, 106], [84, 144]]] };
  const folded = { trunk: [hip, [88, 116], [56, 122]], neck: [46, 126], head: [36, 130], arms: [[[56, 122], [52, 144], [20, 146]]] };
  return { poses: [{ ...up, legs, feet: [[126, 146], [214, 144]] }, { ...folded, legs, feet: [[126, 146], [214, 144]] }], far: { legs: [0] }, focus: ["thigh0"] };
}

// 90/90: seated, the front leg and the back one each bent at a right angle, the trunk turning over the front shin.
// Seen from above, the two right angles read only so.
function ninetyNinety() {
  const hip = [110, 100];
  const legs = [[[104, 104], [72, 104], [72, 140]], [[116, 104], [148, 104], [148, 68]]];
  const up = { trunk: [hip, [110, 74], [110, 48]], neck: [110, 36], head: [110, 24], arms: [[[98, 50], [84, 72], [76, 94]], [[122, 50], [136, 72], [144, 94]]] };
  const folded = { trunk: [hip, [96, 104], [82, 112]], neck: [74, 118], head: [66, 124], arms: [[[74, 106], [60, 120], [54, 138]], [[90, 118], [98, 130], [94, 146]]] };
  return { view: "top", floor: false, props: [{ x: 18, y: 10, width: 184, height: 150, rx: 10 }], poses: [{ ...up, legs, feet: [[58, 144], [154, 56]] }, { ...folded, legs, feet: [[58, 144], [154, 56]] }], far: { legs: [1] }, focus: ["thigh0"] };
}

// A twist lying down: on the back, the arms out, both knees bent and let down to one side, the head turned away.
function supineTwist() {
  const hip = [128, 138];
  const flat = { trunk: [hip, [88, 140], [48, 140]], neck: [36, 139], head: [26, 138], arms: [[[48, 140], [54, 112], [60, 84]]] };
  const a = { ...flat, legs: [[hip, [152, 100], [176, 144]], [hip, [148, 98], [170, 142]]], feet: [[190, 146], [184, 144]] };
  const b = { ...flat, legs: [[hip, [152, 120], [184, 146]], [hip, [150, 116], [180, 140]]], feet: [[196, 146], [192, 140]] };
  return { poses: [a, b], far: { legs: [0] }, focus: ["trunk"] };
}

// Child's pose in yin: the knees wide and the forehead down, the arms long ahead; drawn as recovery.js's own.

const build = (make, extra) => ({ ...make(), ...extra });

// Styles: "mobility" moved, "flexibility" and "yin" held. areas: "hips", "back", "shoulders", "legs".
// book: the video's number in the book, so its own video can be looked up.
export const routineExercises = {
  lungeReach: build(lungeReach, { style: "mobility", seconds: 45, sides: 2, areas: ["hips", "legs"], book: "9.17" }),
  hipSwitch: build(hipSwitch, { style: "mobility", seconds: 45, sides: 2, areas: ["hips"], book: "9.18" }),
  reverseTable: build(reverseTable, { style: "mobility", seconds: 45, sides: 1, areas: ["shoulders", "back", "hips"], book: "9.19" }),
  forearmOpen: build(forearmOpen, { style: "mobility", seconds: 45, sides: 2, areas: ["hips", "back"], book: "9.20" }),
  archToHeels: build(archToHeels, { style: "mobility", seconds: 45, sides: 1, areas: ["back", "shoulders"], book: "9.21" }),
  triangle: build(triangle, { style: "flexibility", hold: true, seconds: 20, sides: 2, areas: ["legs", "back"], book: "9.22" }),
  kneelingQuad: build(kneelingQuad, { style: "flexibility", hold: true, seconds: 20, sides: 2, areas: ["hips", "legs"], book: "9.23" }),
  lungeSideBend: build(lungeSideBend, { style: "flexibility", hold: true, seconds: 20, sides: 2, areas: ["hips", "back", "shoulders"], book: "9.24" }),
  downDog: build(downDog, { style: "flexibility", hold: true, seconds: 20, sides: 1, areas: ["legs", "shoulders", "back"], book: "9.25" }),
  lungeTwist: build(lungeTwist, { style: "flexibility", hold: true, seconds: 20, sides: 2, areas: ["hips", "back"], book: "9.26" }),
  allFoursSide: build(allFoursSide, { style: "flexibility", hold: true, seconds: 20, sides: 2, areas: ["back", "shoulders"], book: "9.27" }),
  butterfly: build(butterfly, { style: "yin", hold: true, seconds: 180, sides: 1, areas: ["hips", "back"] }),
  caterpillar: build(caterpillar, { style: "yin", hold: true, seconds: 180, sides: 1, areas: ["legs", "back"] }),
  sphinx: build(sphinx, { style: "yin", hold: true, seconds: 180, sides: 1, areas: ["back"] }),
  dragon: build(dragon, { style: "yin", hold: true, seconds: 120, sides: 2, areas: ["hips", "legs"] }),
  swan: build(swan, { style: "yin", hold: true, seconds: 180, sides: 2, areas: ["hips"] }),
  ninetyNinety: build(ninetyNinety, { style: "yin", hold: true, seconds: 120, sides: 2, areas: ["hips"] }),
  supineTwist: build(supineTwist, { style: "yin", hold: true, seconds: 120, sides: 2, areas: ["back"] }),
};
