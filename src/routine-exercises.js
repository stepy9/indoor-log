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
  // From above, head up and the feet down: the knees up and apart, then both fallen to one side, the trunk turning
  // after them and the arm reaching across.
  const top = {
    key: "top",
    blocks: [{ x: 30, y: 6, width: 160, height: 158, rx: 10 }],
    poses: [
      { trunk: [[110, 96], [110, 82], [110, 68]], neck: [110, 58], head: [110, 46], arms: [[[98, 70], [88, 50], [84, 30]], [[122, 70], [132, 50], [136, 30]]], legs: [[[103, 98], [76, 124], [94, 150]], [[117, 98], [144, 124], [126, 150]]] },
      { trunk: [[110, 96], [104, 84], [100, 70]], neck: [96, 60], head: [92, 48], arms: [[[88, 70], [80, 50], [84, 30]], [[112, 72], [92, 98], [70, 118]]], legs: [[[103, 98], [64, 108], [72, 142]], [[117, 98], [90, 124], [102, 154]]] },
    ],
  };
  return { poses: [a, b], far: { arms: [1], legs: [0] }, focus: ["thigh1"], more: [top] };
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
  // From the front: the soles together, the knees out to the sides, the trunk folding down towards the feet.
  const front = {
    key: "front",
    blocks: [{ x: 14, y: 150, width: 192, height: 8, rx: 4 }],
    focus: ["thigh0", "thigh1"],
    poses: [
      { trunk: [[110, 132], [110, 104], [110, 76]], neck: [110, 64], head: [110, 52], arms: [[[98, 78], [92, 104], [104, 136]], [[122, 78], [128, 104], [116, 136]]], legs: [[[102, 134], [56, 132], [104, 146]], [[118, 134], [164, 132], [116, 146]]] },
      { trunk: [[110, 132], [110, 120], [110, 108]], neck: [110, 104], head: [110, 98], arms: [[[96, 110], [92, 124], [104, 140]], [[124, 110], [128, 124], [116, 140]]], legs: [[[102, 134], [56, 132], [104, 146]], [[118, 134], [164, 132], [116, 146]]] },
    ],
  };
  return { poses: [a, b], far: { legs: [1] }, focus: ["thigh0", "trunk"], more: [front] };
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

// Frog: on the forearms, the knees wide apart and bent at a right angle, the hips sinking back between them.
function frog() {
  const shape = (x, y) => ({ trunk: [[x, y], [x - 34, y + 4], [70, 116]], neck: [60, 122], head: [50, 128], arms: [[[70, 116], [72, 146], [40, 146]]], legs: [[[x, y], [134, 146], [178, 146]], [[x, y], [130, 144], [174, 144]]], feet: [[186, 140], [182, 138]] });
  return { poses: [shape(132, 108), shape(144, 116)], far: { legs: [1] }, focus: ["thigh0", "thigh1"] };
}

// Shoelace: seated, the knees stacked one over the other and the feet by the hips; folding forward over the knees.
function shoelace() {
  const hip = [110, 138];
  const legs = [[hip, [158, 130], [124, 146]], [hip, [158, 120], [120, 140]]];
  const up = { trunk: [hip, [106, 100], [102, 62]], neck: [101, 51], head: [100, 40], arms: [[[102, 62], [124, 90], [146, 116]]] };
  const folded = { trunk: [hip, [134, 96], [158, 104]], neck: [166, 110], head: [174, 116], arms: [[[158, 104], [166, 124], [170, 140]]] };
  return { poses: [{ ...up, legs, feet: [[112, 146], [108, 140]] }, { ...folded, legs, feet: [[112, 146], [108, 140]] }], far: { legs: [0] }, focus: ["thigh1"] };
}

// Dragonfly: seated with the legs wide apart, seen from the front, the trunk folding forward between them.
function dragonfly() {
  const legs = [[[102, 136], [60, 140], [20, 142]], [[118, 136], [160, 140], [200, 142]]];
  const feet = [[16, 130], [204, 130]];
  const up = { trunk: [[110, 134], [110, 106], [110, 78]], neck: [110, 66], head: [110, 54], arms: [[[98, 80], [90, 106], [84, 132]], [[122, 80], [130, 106], [136, 132]]] };
  const folded = { trunk: [[110, 134], [110, 122], [110, 110]], neck: [110, 106], head: [110, 100], arms: [[[96, 112], [82, 128], [70, 140]], [[124, 112], [138, 128], [150, 140]]] };
  return { view: "front", poses: [{ ...up, legs, feet }, { ...folded, legs, feet }], focus: ["thigh0", "thigh1"] };
}

// Happy baby: on the back, the knees drawn wide towards the armpits, the soles up and the hands holding the feet.
function happyBaby() {
  const flat = { trunk: [[128, 140], [88, 141], [48, 140]], neck: [36, 139], head: [26, 138] };
  const shape = (knee, ankle) => ({ ...flat, arms: [[[48, 140], [76, 110], [ankle[0] - 2, ankle[1] + 4]]], legs: [[[128, 140], knee, ankle], [[128, 140], [knee[0] + 4, knee[1] - 2], [ankle[0] + 4, ankle[1] - 2]]], feet: [[ankle[0] + 14, ankle[1]], [ankle[0] + 18, ankle[1] - 2]] });
  return { poses: [shape([98, 110], [104, 70]), shape([92, 112], [96, 74])], far: { legs: [1] }, focus: ["thigh0", "trunk"] };
}

// Banana: on the back, seen from above, the arms overhead; the feet and then the hands walked to one side, the body a
// long curve.
function banana() {
  const straight = { trunk: [[110, 104], [110, 78], [110, 52]], neck: [110, 40], head: [110, 28], arms: [[[100, 54], [94, 30], [92, 8]], [[120, 54], [126, 30], [128, 8]]], legs: [[[104, 106], [102, 128], [100, 150]], [[116, 106], [118, 128], [120, 150]]] };
  const curved = { trunk: [[106, 104], [124, 78], [106, 52]], neck: [98, 41], head: [90, 31], arms: [[[96, 54], [80, 34], [66, 16]], [[116, 52], [100, 30], [82, 14]]], legs: [[[100, 106], [86, 128], [74, 148]], [[112, 106], [98, 128], [86, 150]]] };
  return { view: "top", floor: false, props: [{ x: 18, y: 2, width: 184, height: 158, rx: 10 }], poses: [straight, curved], focus: ["trunk"] };
}

// Thread the needle: on all fours, one arm opening up to the ceiling, then threaded under the body, the shoulder and
// the side of the head down on the mat.
function threadNeedle() {
  const legs = [[[140, 96], [140, 146], [188, 146]], [[140, 96], [144, 146], [190, 146]]];
  const feet = [[196, 140], [198, 140]];
  const open = { trunk: [[140, 96], [100, 92], [62, 96]], neck: [52, 92], head: [42, 86], arms: [[[62, 96], [62, 121], [60, 146]], [[62, 96], [66, 68], [70, 40]]] };
  const threaded = { trunk: [[140, 100], [104, 106], [72, 126]], neck: [62, 132], head: [52, 138], arms: [[[72, 126], [58, 136], [48, 146]], [[72, 126], [98, 140], [124, 146]]] };
  return { poses: [{ ...open, legs, feet }, { ...threaded, legs, feet }], far: { arms: [0], legs: [1] }, focus: ["trunk", "arm1"] };
}

// Child's pose in yin: the knees wide and the forehead down, the arms long ahead; drawn as recovery.js's own.

// ---- Stabilization (the book's 9.1–9.16): the front, back and side chains, each in four levels: 1 held still,
// 2 the legs and trunk still with the arms moving, 3 the arms and trunk still with the legs moving, 4 both moving.
// A minute at a level before the next. Then four moves with a gym ball for the pelvis.

// On all fours, the knees hovering a hand's breadth over the mat (9.1, 9.2), or on the forearms (9.3, 9.4).
const hands4 = { trunk: [[140, 88], [100, 90], [60, 92]], neck: [48, 89], head: [37, 86], arms: [[[60, 92], [62, 119], [64, 146]], [[60, 92], [58, 119], [58, 146]]], legs: [[[140, 88], [142, 138], [186, 144]], [[140, 88], [138, 138], [182, 144]]], feet: [[198, 138], [194, 138]] };
const forearms4 = { trunk: [[146, 96], [108, 98], [70, 100]], neck: [58, 98], head: [47, 96], arms: [[[70, 100], [72, 146], [42, 146]], [[70, 100], [68, 146], [38, 146]]], legs: [[[146, 96], [148, 140], [192, 146]], [[146, 96], [144, 140], [188, 146]]], feet: [[204, 140], [200, 140]] };

function front1() {
  const down = { ...hands4, trunk: [[140, 94], [100, 94], [60, 94]], arms: [[[60, 94], [62, 120], [64, 146]], [[60, 94], [58, 120], [58, 146]]], legs: [[[140, 94], [142, 146], [186, 146]], [[140, 94], [138, 146], [182, 146]]], feet: [[198, 140], [194, 140]] };
  return { poses: [down, hands4], far: { arms: [1], legs: [1] }, focus: ["trunk"] };
}
function front2() {
  const reach = { ...hands4, arms: [hands4.arms[0], [[60, 92], [34, 90], [8, 88]]] };
  return { poses: [hands4, reach], far: { arms: [0], legs: [1] }, focus: ["trunk", "arm1"] };
}
function front3() {
  const lift = { ...forearms4, legs: [forearms4.legs[0], [[146, 96], [176, 92], [206, 88]]], feet: [[204, 140], [214, 78]] };
  return { poses: [forearms4, lift], far: { arms: [1], legs: [0] }, focus: ["trunk", "leg1"] };
}
function front4() {
  const lift = { ...forearms4, arms: [forearms4.arms[0], [[70, 100], [44, 96], [16, 92]]], legs: [forearms4.legs[0], [[146, 96], [176, 92], [206, 88]]], feet: [[204, 140], [214, 78]] };
  return { poses: [forearms4, lift], far: { arms: [0], legs: [0] }, focus: ["trunk", "leg1"] };
}

// A bridge on the heels, the arms overhead on the mat: shoulders, hips and thighs in one line (9.5–9.8).
const bridgeUp = { trunk: [[120, 119], [86, 132], [52, 140]], neck: [40, 140], head: [29, 139], arms: [[[52, 140], [28, 144], [4, 146]], [[52, 140], [30, 142], [6, 143]]], legs: [[[120, 119], [168, 104], [168, 146]], [[120, 119], [164, 102], [164, 146]]], feet: [[176, 134], [172, 134]] };
const bridgeDown = { ...bridgeUp, trunk: [[124, 140], [88, 140], [52, 140]], legs: [[[124, 140], [150, 96], [168, 146]], [[124, 140], [146, 94], [164, 146]]] };

function back1() {
  return { poses: [bridgeDown, bridgeUp], far: { arms: [1], legs: [1] }, focus: ["trunk", "thigh0"] };
}
function back2() {
  const along = { ...bridgeUp, arms: [[[52, 140], [76, 144], [100, 146]], [[52, 140], [74, 142], [98, 143]]] };
  return { poses: [bridgeUp, along], far: { arms: [1], legs: [1] }, arrows: ["M18,128 A44,44 0 0 1 96,128"], focus: ["trunk", "arm0"] };
}
function back3() {
  const leg = { ...bridgeUp, legs: [[[120, 119], [166, 105], [210, 91]], bridgeUp.legs[1]], feet: [[214, 78], [172, 134]] };
  return { poses: [bridgeUp, leg], far: { arms: [1], legs: [1] }, focus: ["trunk", "leg0"] };
}
function back4() {
  const leg = { ...bridgeUp, arms: [bridgeUp.arms[0], [[52, 140], [54, 112], [56, 84]]], legs: [[[120, 119], [166, 105], [210, 91]], bridgeUp.legs[1]], feet: [[214, 78], [172, 134]] };
  return { poses: [bridgeUp, leg], far: { arms: [1], legs: [1] }, focus: ["trunk", "leg0"] };
}

// Lying on the side, seen from the front: up on the lower forearm and the lower knee (bent to a right angle), the
// top leg long, the body one line (9.9–9.12).
const sideUp = { trunk: [[140, 116], [102, 106], [64, 98]], neck: [54, 94], head: [43, 91], arms: [[[64, 98], [64, 146], [30, 146]], [[64, 98], [36, 84], [8, 70]]], legs: [[[140, 116], [148, 146], [194, 146]], [[140, 116], [176, 122], [212, 128]]], feet: [null, [216, 116]] };
const sideDown = { ...sideUp, trunk: [[140, 136], [102, 124], [64, 110]], neck: [54, 105], head: [43, 101], arms: [[[64, 110], [64, 146], [30, 146]], [[64, 110], [36, 96], [8, 82]]], legs: [[[140, 136], [148, 146], [194, 146]], [[140, 136], [176, 138], [212, 140]]], feet: [null, [216, 128]] };

function side1() {
  return { view: "front", poses: [sideDown, sideUp], far: { arms: [0], legs: [0] }, focus: ["trunk"] };
}
function side2() {
  // The top arm bent at a right angle swinging back and forward, as in running.
  const back = { ...sideUp, arms: [sideUp.arms[0], [[64, 98], [90, 90], [100, 66]]] };
  const forward = { ...sideUp, arms: [sideUp.arms[0], [[64, 98], [40, 86], [44, 60]]] };
  return { view: "front", poses: [back, forward], far: { arms: [0], legs: [0] }, focus: ["trunk"] };
}
function side3() {
  // The top leg drawn up to the chest and long again, kept at the hip's height.
  const drawn = { ...sideUp, arms: [sideUp.arms[0], [[64, 98], [36, 84], [8, 70]]], legs: [sideUp.legs[0], [[140, 116], [104, 112], [134, 124]]], feet: [null, [146, 118]] };
  return { view: "front", poses: [sideUp, drawn], far: { arms: [0], legs: [0] }, focus: ["trunk", "thigh1"] };
}
function side4() {
  // Running on the side: the arm back as the knee comes forward, and the other way round.
  const a = { ...sideUp, arms: [sideUp.arms[0], [[64, 98], [90, 90], [100, 66]]], legs: [sideUp.legs[0], [[140, 116], [106, 112], [118, 138]]], feet: [null, [106, 142]] };
  const b = { ...sideUp, arms: [sideUp.arms[0], [[64, 98], [40, 86], [44, 60]]], legs: [sideUp.legs[0], [[140, 116], [178, 124], [214, 130]]], feet: [null, [218, 118]] };
  return { view: "front", poses: [a, b], far: { arms: [0], legs: [0] }, focus: ["trunk"] };
}

// On the back with a gym ball between the heels and the buttocks (9.13–9.16), its weight pressed by the heels.
const lying = { trunk: [[128, 140], [88, 140], [48, 140]], neck: [36, 139], head: [26, 138] };
function ballLower() {
  const a = { ...lying, arms: [[[48, 140], [60, 146], [84, 146]]], legs: [[[128, 140], [150, 100], [176, 122]], [[128, 140], [146, 98], [172, 120]]], feet: [[184, 110], [180, 108]], ball: [158, 124, 22] };
  // The hips and lower back peel up, the knees to the chest, the ball lifting with them.
  const b = { trunk: [[130, 124], [92, 136], [52, 140]], neck: [40, 139], head: [29, 138], arms: a.arms.map((arm) => [[52, 140], ...arm.slice(1)]), legs: [[[130, 124], [110, 84], [148, 74]], [[130, 124], [106, 82], [144, 72]]], feet: [[156, 62], [152, 60]], ball: [130, 92, 22] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
function ballUpper() {
  // The legs held up with the ball, the hands behind the head: the head and shoulders curl up towards the knees.
  const legs = [[[128, 140], [130, 90], [176, 92]], [[128, 140], [126, 88], [172, 90]]];
  const a = { ...lying, arms: [[[48, 140], [36, 126], [28, 140]]], legs, feet: [[180, 78], [176, 76]], ball: [152, 116, 20] };
  const b = { trunk: [[128, 140], [96, 138], [70, 116]], neck: [60, 108], head: [52, 100], arms: [[[70, 116], [52, 98], [46, 108]]], legs, feet: [[180, 78], [176, 76]], ball: [152, 116, 20] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
function ballBoth() {
  const a = { ...lying, arms: [[[48, 140], [36, 126], [28, 140]]], legs: [[[128, 140], [150, 100], [176, 122]], [[128, 140], [146, 98], [172, 120]]], feet: [[184, 110], [180, 108]], ball: [158, 124, 22] };
  const b = { trunk: [[130, 130], [96, 134], [68, 114]], neck: [58, 106], head: [50, 98], arms: [[[68, 114], [50, 96], [44, 106]]], legs: [[[130, 130], [112, 86], [150, 76]], [[130, 130], [108, 84], [146, 74]]], feet: [[158, 64], [154, 62]], ball: [132, 96, 22] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
function ballOblique() {
  // From above, head up: the arms out, the ball held up between the legs and tipped to one side, then the other.
  const body = { trunk: [[110, 104], [110, 78], [110, 52]], neck: [110, 40], head: [110, 28], arms: [[[98, 54], [72, 56], [44, 58]], [[122, 54], [148, 56], [176, 58]]] };
  const a = { ...body, legs: [[[103, 106], [76, 122], [70, 148]], [[117, 106], [94, 128], [86, 152]]], ball: [72, 136, 18] };
  const b = { ...body, legs: [[[103, 106], [126, 128], [134, 152]], [[117, 106], [144, 122], [150, 148]]], ball: [148, 136, 18] };
  return { view: "top", floor: false, props: [{ x: 30, y: 6, width: 160, height: 158, rx: 10 }], poses: [a, b], focus: ["trunk"] };
}

// ---- Muscle balance (the book's 9.28–9.32): one side at a time with a dumbbell, 8–15 repeats, more on the weaker side.

function chop() {
  // Half-kneeling, seen from the front: both hands with the dumbbell from beside the hip diagonally up over the other shoulder.
  const legs = [[[102, 114], [86, 128], [90, 146]], [[118, 114], [124, 132], [126, 146]]];
  const body = { trunk: [[110, 114], [110, 88], [110, 62]], neck: [110, 50], head: [110, 38], legs, feet: [[78, 146], [136, 146]] };
  const a = { ...body, arms: [[[98, 64], [112, 88], [132, 110]], [[122, 64], [134, 88], [136, 110]]] };
  const b = { ...body, arms: [[[98, 64], [86, 40], [80, 16]], [[122, 64], [102, 40], [84, 14]]] };
  return { view: "front", poses: [a, b], far: { arms: [0] }, weights: [1], arrows: ["M150,104 Q110,70 70,8"], focus: ["trunk"] };
}
function kneelRow() {
  // Kneeling on one knee, the other leg long behind, a hand on the mat: the dumbbell drawn up to the ribs.
  const body = { trunk: [[140, 96], [102, 96], [64, 96]], neck: [52, 94], head: [41, 92], legs: [[[140, 96], [142, 146], [188, 146]], [[140, 96], [178, 96], [214, 96]]], feet: [[200, 140], [218, 84]] };
  const a = { ...body, arms: [[[64, 96], [62, 121], [60, 146]], [[66, 96], [68, 120], [70, 142]]] };
  const b = { ...body, arms: [[[64, 96], [62, 121], [60, 146]], [[66, 96], [94, 80], [86, 104]]] };
  return { poses: [a, b], far: { arms: [0], legs: [0] }, weights: [1], focus: ["arm1"] };
}
function bridgePress() {
  // A bridge on the upper back, the free arm straight up; the dumbbell pressed up beside it from a bent elbow.
  const body = { trunk: [[120, 112], [86, 130], [52, 140]], neck: [40, 140], head: [29, 139], legs: [[[120, 112], [164, 100], [168, 146]], [[120, 112], [160, 98], [164, 146]]], feet: [[182, 146], [178, 146]] };
  const a = { ...body, arms: [[[52, 140], [54, 112], [56, 84]], [[52, 140], [70, 132], [64, 108]]] };
  const b = { ...body, arms: [[[52, 140], [54, 112], [56, 84]], [[52, 140], [58, 112], [62, 84]]] };
  return { poses: [a, b], far: { arms: [0], legs: [1] }, weights: [1], focus: ["arm1", "trunk"] };
}
function sideLungeRaise() {
  // Seen from the front: from standing, a long step to the side into a lunge, the dumbbell raised to the shoulder.
  const k = kit(0.72);
  const hip = [110, 94];
  const up = k.trunk(hip, -90);
  const standing = [k.leg([104, 94], 92, 90), k.leg([116, 94], 88, 90)];
  const a = { ...up, arms: [[[98, 38], [94, 60], [92, 82]], [[122, 38], [126, 60], [128, 82]]], legs: standing, feet: [[96, 146], [124, 146]] };
  delete a.shoulder;
  const low = [100, 108];
  const b = { trunk: [low, [100, 80], [102, 52]], neck: [102, 41], head: [103, 30], arms: [[[90, 54], [84, 66], [92, 78]], [[114, 54], [138, 54], [162, 54]]], legs: [[[94, 108], [70, 128], [58, 146]], [[106, 108], [140, 116], [174, 140]]], feet: [[46, 146], [184, 146]] };
  return { view: "front", poses: [a, b], far: { arms: [0] }, weights: [1], focus: ["thigh1"] };
}
function backLungePress() {
  // From standing, the dumbbell at the shoulder: a step back down into a lunge, the arm pressing straight up beside the head.
  const k = kit(0.72);
  const hip = [110, 94];
  const up = k.trunk(hip, -90);
  const legs = [k.leg(hip, 90, 90), k.leg(hip, 92, 90)];
  const a = { ...up, arms: [[up.shoulder, [112, 60], [96, 46]], [up.shoulder, [114, 58], [116, 80]]], legs, feet: [[96, 146], [98, 146]] };
  delete a.shoulder;
  const low = [114, 112];
  const down = k.trunk(low, -90);
  const lunge = [[low, [80, 114], [80, 146]], [low, [130, 140], [164, 146]]];
  const b = { ...down, arms: [[down.shoulder, [114, 30], [116, 6]], [down.shoulder, [118, 78], [120, 100]]], legs: lunge, feet: [[66, 146], [176, 142]] };
  delete b.shoulder;
  return { poses: [a, b], far: { arms: [1], legs: [1] }, weights: [0], focus: ["thigh0", "arm0"] };
}

// ---- With equipment at home: a foam roller, a resistance band, a BOSU. The roller is drawn end on (a circle that
// stays while the body rolls over it), the band as a strap between its ends, the BOSU as a dome on the mat.
const roller = (x, y = 136) => [x, y, 10];
const bosuDome = (x, width = 62) => ({ x, y: 132, width, height: 18, rx: 9, class: "pad" });

// Upper back on the roller, feet flat, hands behind the head: the body rolls up and down over it.
function rollThoracic() {
  const a = { trunk: [[124, 128], [92, 124], [60, 122]], neck: [48, 120], head: [37, 117], arms: [[[60, 122], [46, 104], [34, 114]]], legs: [[[124, 128], [150, 96], [168, 146]], [[124, 128], [146, 94], [164, 146]]], feet: [[182, 146], [178, 146]], ball: roller(76, 134) };
  const b = { trunk: [[136, 126], [104, 120], [72, 116]], neck: [60, 113], head: [49, 110], arms: [[[72, 116], [58, 98], [46, 108]]], legs: [[[136, 126], [158, 96], [168, 146]], [[136, 126], [154, 94], [164, 146]]], feet: [[182, 146], [178, 146]], ball: roller(76, 134) };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
// Front of the thighs: face down on the forearms, the roller under the thighs, rolling from hip to knee.
function rollQuads() {
  const shape = (hip) => ({ trunk: [[hip, 120], [hip - 36, 120], [hip - 72, 118]], neck: [hip - 84, 116], head: [hip - 95, 113], arms: [[[hip - 72, 118], [hip - 70, 146], [hip - 98, 146]]], legs: [[[hip, 120], [hip + 40, 124], [hip + 78, 130]], [[hip, 120], [hip + 38, 122], [hip + 76, 128]]], feet: [[hip + 86, 140], [hip + 84, 138]], ball: roller(156, 136) });
  return { poses: [shape(124), shape(146)], far: { arms: [], legs: [1] }, focus: ["thigh0"] };
}
// Glutes: sitting on the roller, one ankle over the other knee, a hand behind; rolling over the crossed side's buttock.
function rollGlutes() {
  const shape = (x) => ({ trunk: [[x, 124], [x - 8, 96], [x - 18, 68]], neck: [x - 22, 57], head: [x - 25, 46], arms: [[[x - 18, 68], [x - 26, 106], [x - 32, 146]]], legs: [[[x, 124], [x + 30, 96], [x + 46, 146]], [[x, 124], [x + 26, 104], [x + 34, 98]]], feet: [[x + 60, 146], null], ball: roller(118, 136) });
  return { poses: [shape(112), shape(124)], far: { legs: [0] }, focus: ["thigh1"] };
}
// Calves: sitting, legs long with the calves on the roller, the hips lifted on the hands, rolling ankle to knee.
function rollCalves() {
  const shape = (x) => ({ trunk: [[x, 128], [x - 6, 100], [x - 10, 72]], neck: [x - 12, 61], head: [x - 13, 50], arms: [[[x - 10, 72], [x - 16, 110], [x - 22, 146]]], legs: [[[x, 128], [x + 46, 124], [x + 92, 124]], [[x, 128], [x + 44, 122], [x + 90, 122]]], feet: [[x + 96, 112], [x + 94, 110]], ball: roller(166, 136) });
  return { poses: [shape(86), shape(108)], far: { legs: [1] }, focus: ["leg0"] };
}

// A standing figure seen from the front, for the band's arm work.
const frontStand = { trunk: [[110, 100], [110, 74], [110, 46]], neck: [110, 36], head: [110, 24], legs: [[[104, 100], [102, 124], [100, 146]], [[116, 100], [118, 124], [120, 146]]], feet: [[92, 146], [128, 146]] };
// Pull-apart: the band held in straight arms before the chest, pulled wide until it touches the chest.
function bandPullApart() {
  const a = { ...frontStand, arms: [[[98, 48], [92, 58], [100, 64]], [[122, 48], [128, 58], [120, 64]]], strap: [[100, 64], [120, 64]] };
  const b = { ...frontStand, arms: [[[98, 48], [70, 48], [42, 48]], [[122, 48], [150, 48], [178, 48]]], strap: [[42, 48], [178, 48]] };
  return { view: "front", poses: [a, b], focus: ["arm0", "arm1"] };
}
// Seated row: legs long, the band round the feet, the elbows drawn back past the body.
function bandRow() {
  const body = { trunk: [[100, 140], [98, 104], [96, 68]], neck: [95, 57], head: [94, 46], legs: [[[100, 140], [148, 142], [196, 142]], [[100, 140], [146, 140], [192, 140]]], feet: [[200, 128], [196, 126]] };
  const a = { ...body, arms: [[[96, 68], [124, 86], [150, 104]]], strap: [[150, 104], [198, 132]] };
  const b = { ...body, arms: [[[96, 68], [76, 86], [100, 96]]], strap: [[100, 96], [198, 132]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["arm0"] };
}
// Clamshell: on the side, knees bent and the band round them, the top knee opens with the feet together.
function bandClamshell() {
  const body = { trunk: [[130, 130], [96, 133], [62, 134]], neck: [50, 133], head: [38, 130], arms: [[[62, 134], [46, 118], [32, 124]]] };
  const a = { ...body, legs: [[[130, 132], [156, 114], [184, 132]], [[130, 128], [158, 108], [184, 128]]], strap: [[158, 108], [156, 114]] };
  const b = { ...body, legs: [[[130, 132], [156, 114], [184, 132]], [[130, 128], [146, 90], [184, 128]]], strap: [[146, 90], [156, 114]] };
  return { view: "front", poses: [a, b], far: { legs: [0] }, focus: ["thigh1"] };
}
// External rotation: the elbow kept at the side, bent at a right angle, the forearm turning out against the band.
function bandRotation() {
  const a = { ...frontStand, arms: [[[98, 48], [96, 72], [106, 80]], [[122, 48], [124, 72], [126, 96]]], strap: [[106, 80], [204, 80]] };
  const b = { ...frontStand, arms: [[[98, 48], [96, 72], [72, 76]], [[122, 48], [124, 72], [126, 96]]], strap: [[72, 76], [204, 80]] };
  // From above, the face down the picture: the elbow at the side, the forearm pointing ahead, then turned out.
  const above = (hand) => ({ trunk: [[84, 70], [110, 66], [136, 70]], neck: [110, 76], head: [110, 84], arms: [[[84, 70], [80, 82], hand], [[136, 70], [140, 82], [140, 92]]], legs: [[[104, 70], [104, 72], [104, 74]], [[116, 70], [116, 72], [116, 74]]], strap: [hand, [204, hand[1]]] });
  const top = { key: "top", blocks: [{ x: 30, y: 30, width: 160, height: 110, rx: 10 }], poses: [above([86, 118]), above([42, 98])], far: { arms: [1] }, focus: ["arm0"] };
  return { view: "front", poses: [a, b], far: { arms: [1] }, focus: ["arm0"], more: [top] };
}
// Side steps: the band round the knees, half-squatting, a step to the side and the other foot after it.
function bandSideStep() {
  const body = (x) => ({ trunk: [[x, 104], [x, 80], [x, 54]], neck: [x, 43], head: [x, 31], arms: [[[x - 12, 56], [x - 16, 78], [x - 8, 92]], [[x + 12, 56], [x + 16, 78], [x + 8, 92]]] });
  const a = { ...body(110), legs: [[[104, 104], [94, 124], [96, 146]], [[116, 104], [126, 124], [124, 146]]], feet: [[86, 146], [134, 146]], strap: [[94, 124], [126, 124]] };
  const b = { ...body(120), legs: [[[114, 104], [96, 124], [86, 146]], [[126, 104], [150, 124], [158, 146]]], feet: [[76, 146], [168, 146]], strap: [[96, 124], [150, 124]] };
  return { view: "front", poses: [a, b], focus: ["thigh0", "thigh1"] };
}

// Squat on the BOSU: both feet on the dome, down and up again.
function bosuSquat() {
  const a = { trunk: [[110, 88], [111, 62], [110, 36]], neck: [108, 26], head: [106, 15], arms: [[[110, 36], [84, 38], [58, 40]]], legs: [[[110, 88], [110, 110], [110, 132]], [[110, 88], [114, 110], [116, 132]]], feet: [[96, 133], [102, 133]] };
  const b = { trunk: [[128, 106], [116, 84], [104, 62]], neck: [99, 52], head: [94, 41], arms: [[[104, 62], [78, 64], [52, 66]]], legs: [[[128, 106], [100, 110], [110, 132]], [[128, 106], [104, 112], [116, 132]]], feet: [[96, 133], [102, 133]] };
  return { props: [bosuDome(80)], poses: [a, b], far: { legs: [1] }, focus: ["thigh0"] };
}
// One leg on the BOSU, the other lifted bent behind, held still.
function bosuBalance() {
  const a = { trunk: [[110, 88], [111, 62], [110, 36]], neck: [108, 26], head: [106, 15], arms: [[[110, 36], [96, 58], [88, 80]], [[110, 36], [124, 58], [132, 80]]], legs: [[[110, 88], [110, 110], [110, 132]], [[110, 88], [114, 110], [116, 132]]], feet: [[96, 133], [102, 133]] };
  const b = { ...a, arms: [[[110, 36], [88, 50], [66, 58]], [[110, 36], [132, 50], [154, 58]]], legs: [[[110, 88], [110, 110], [110, 132]], [[110, 88], [118, 110], [140, 112]]], feet: [[96, 133], [148, 104]] };
  return { props: [bosuDome(80)], poses: [a, b], far: { arms: [1], legs: [1] }, focus: ["leg0"] };
}
// Plank with the hands on the BOSU's flat side, the body one line, held.
function bosuPlank() {
  const a = { trunk: [[140, 120], [106, 112], [72, 104]], neck: [61, 101], head: [50, 98], arms: [[[72, 104], [72, 118], [72, 130]], [[72, 104], [68, 118], [66, 130]]], legs: [[[140, 120], [170, 134], [198, 146]], [[140, 120], [166, 134], [194, 146]]], feet: [[204, 140], [200, 140]] };
  const b = { ...a, trunk: [[140, 112], [106, 108], [72, 104]], legs: [[[140, 112], [170, 130], [198, 146]], [[140, 112], [166, 130], [194, 146]]] };
  return { props: [{ x: 40, y: 130, width: 64, height: 16, rx: 6, class: "pad" }], poses: [a, b], far: { arms: [1], legs: [1] }, focus: ["trunk"] };
}
// Lunge with the front foot on the BOSU: down until the back knee nearly touches, and up.
function bosuLunge() {
  const a = { trunk: [[116, 92], [117, 64], [116, 36]], neck: [114, 26], head: [112, 15], arms: [[[116, 36], [118, 62], [120, 86]]], legs: [[[116, 92], [94, 112], [80, 132]], [[116, 92], [138, 118], [156, 140]]], feet: [[68, 133], [166, 146]] };
  const b = { trunk: [[118, 112], [119, 84], [118, 56]], neck: [116, 46], head: [114, 35], arms: [[[118, 56], [120, 82], [122, 106]]], legs: [[[118, 112], [88, 110], [80, 132]], [[118, 112], [134, 140], [164, 142]]], feet: [[68, 133], [174, 146]] };
  return { props: [bosuDome(52)], poses: [a, b], far: { legs: [1] }, focus: ["thigh0"] };
}

// ---- Pilates on the mat: the classical order, lying on the back, sitting, on the front, on the side, the bridge
// last. The head and shoulders curled up from the mat where the move asks for it.
const backFlat = { trunk: [[128, 140], [88, 141], [48, 140]], neck: [36, 139], head: [26, 138] };
const curled = { trunk: [[128, 140], [96, 136], [64, 124]], neck: [54, 118], head: [45, 111] };
const longLegs = [[[128, 140], [168, 142], [204, 144]], [[128, 140], [166, 140], [200, 142]]];
const longFeet = [[212, 136], [208, 134]];

// The hundred: curled up, the legs in a table, the long arms pumping a hand's breadth above the mat.
function hundred() {
  const legs = [[[128, 140], [128, 90], [174, 90]], [[128, 140], [126, 88], [172, 88]]];
  const shape = (y) => ({ ...curled, arms: [[[64, 124], [92, y], [120, y + 2]]], legs, feet: [[184, 84], [182, 82]] });
  return { poses: [shape(122), shape(132)], far: { legs: [1] }, focus: ["trunk"] };
}
// Roll-up: from lying with the arms overhead, peeled up vertebra by vertebra and over the long legs.
function rollUp() {
  const a = { ...backFlat, arms: [[[48, 140], [24, 140], [2, 140]]], legs: longLegs, feet: longFeet };
  const b = { trunk: [[128, 140], [150, 96], [178, 108]], neck: [186, 114], head: [194, 120], arms: [[[178, 108], [192, 124], [204, 136]]], legs: longLegs, feet: longFeet };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
// Leg circles: on the back, one leg straight up drawing small circles, the pelvis still.
function legCircles() {
  const arms = [[[48, 140], [78, 144], [108, 146]]];
  const down = [[128, 140], [168, 142], [204, 144]];
  const a = { ...backFlat, arms, legs: [down, [[128, 140], [130, 92], [132, 46]]], feet: [[212, 136], [136, 34]] };
  const b = { ...backFlat, arms, legs: [down, [[128, 140], [148, 96], [166, 54]]], feet: [[212, 136], [172, 42]] };
  return { poses: [a, b], far: { legs: [0] }, focus: ["thigh1", "trunk"] };
}
// Rolling like a ball: balanced behind the sit bones, the knees held to the chest, rolling back to the shoulder
// blades and up again.
function rollingBall() {
  const a = { trunk: [[120, 140], [104, 112], [96, 86]], neck: [96, 76], head: [98, 66], arms: [[[96, 86], [124, 92], [142, 108]]], legs: [[[120, 140], [140, 96], [148, 128]], [[120, 140], [138, 94], [146, 126]]], feet: [[160, 132], [158, 130]] };
  const b = { trunk: [[130, 114], [108, 130], [80, 138]], neck: [70, 136], head: [62, 132], arms: [[[80, 138], [104, 100], [124, 82]]], legs: [[[130, 114], [110, 82], [140, 74]], [[130, 114], [112, 80], [142, 72]]], feet: [[150, 64], [152, 62]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
// Single leg stretch: curled up, one knee drawn in, the other leg long and low, changing legs.
function singleLegStretch() {
  const bent = [[128, 140], [104, 108], [134, 90]];
  const long = [[128, 140], [172, 118], [212, 100]];
  const a = { ...curled, arms: [[[64, 124], [88, 112], [104, 108]]], legs: [bent, long], feet: [[144, 82], [220, 92]] };
  const b = { ...curled, arms: [[[64, 124], [88, 112], [104, 108]]], legs: [long, bent], feet: [[220, 92], [144, 82]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
// Double leg stretch: curled round the knees, then the arms long overhead and the legs long and low at once.
function doubleLegStretch() {
  const a = { ...curled, arms: [[[64, 124], [88, 112], [104, 108]]], legs: [[[128, 140], [104, 108], [134, 90]], [[128, 140], [106, 106], [136, 88]]], feet: [[144, 82], [146, 80]] };
  const b = { ...curled, arms: [[[64, 124], [40, 110], [18, 96]]], legs: [[[128, 140], [168, 112], [204, 86]], [[128, 140], [166, 110], [202, 84]]], feet: [[212, 78], [210, 76]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
// Criss-cross: the hands behind the head, the trunk turning the elbow towards the knee drawn in, changing sides.
function crissCross() {
  const bent = [[128, 140], [104, 108], [134, 90]];
  const long = [[128, 140], [172, 118], [212, 100]];
  const arms = [[[64, 124], [52, 104], [40, 112]]];
  const a = { trunk: [[128, 140], [98, 132], [70, 116]], neck: [60, 110], head: [52, 102], arms: [[[70, 116], [62, 96], [50, 102]]], legs: [bent, long], feet: [[144, 82], [220, 92]] };
  const b = { ...curled, arms, legs: [long, bent], feet: [[220, 92], [144, 82]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
// Spine stretch forward: sitting tall with the legs long, the arms ahead, then the back rounding forward, the head
// last, and building up again.
function spineStretch() {
  const hip = [100, 140];
  const legs = [[hip, [148, 142], [196, 142]], [hip, [146, 140], [192, 140]]];
  const feet = [[200, 128], [196, 126]];
  const a = { trunk: [hip, [100, 100], [100, 60]], neck: [100, 48], head: [101, 37], arms: [[[100, 60], [128, 60], [156, 60]]], legs, feet };
  const b = { trunk: [hip, [112, 96], [140, 96]], neck: [148, 104], head: [156, 112], arms: [[[140, 96], [166, 110], [190, 124]]], legs, feet };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}
// Saw: seen from the front, sitting wide with the arms out, the trunk turning and the hand reaching past the other
// foot, the back arm rising behind.
function saw() {
  const legs = [[[102, 136], [60, 140], [20, 142]], [[118, 136], [160, 140], [200, 142]]];
  const feet = [[16, 130], [204, 130]];
  const a = { trunk: [[110, 134], [110, 106], [110, 78]], neck: [110, 66], head: [110, 54], arms: [[[98, 80], [70, 80], [42, 80]], [[122, 80], [150, 80], [178, 80]]], legs, feet };
  const b = { trunk: [[110, 134], [128, 114], [146, 98]], neck: [154, 98], head: [164, 100], arms: [[[140, 98], [170, 118], [196, 134]], [[156, 96], [150, 70], [138, 46]]], legs, feet };
  return { view: "front", poses: [a, b], focus: ["trunk"] };
}
// Swimming: on the front, the arms and legs long and just off the mat, fluttering opposite arm and leg.
function swimming() {
  const body = { trunk: [[132, 138], [96, 136], [62, 132]], neck: [50, 128], head: [39, 124] };
  const up = (from, to) => [from, [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 2], to];
  const a = { ...body, arms: [up([62, 132], [14, 116]), up([62, 132], [14, 136])], legs: [up([132, 138], [204, 144]), up([132, 138], [204, 124])], feet: [[214, 144], [214, 122]] };
  const b = { ...body, arms: [up([62, 132], [14, 136]), up([62, 132], [14, 116])], legs: [up([132, 138], [204, 124]), up([132, 138], [204, 144])], feet: [[214, 122], [214, 144]] };
  return { poses: [a, b], far: { arms: [1], legs: [1] }, focus: ["trunk"] };
}
// Side kick: lying on the side, the head on the hand, the top leg swinging up and down long, the trunk still.
function sideKick() {
  const body = { trunk: [[130, 130], [96, 133], [62, 134]], neck: [50, 133], head: [38, 130], arms: [[[62, 134], [46, 118], [32, 124]]] };
  const bottom = [[130, 132], [170, 136], [206, 140]];
  const a = { ...body, legs: [bottom, [[130, 128], [170, 130], [206, 134]]], feet: [[214, 132], [214, 126]] };
  const b = { ...body, legs: [bottom, [[130, 128], [166, 110], [200, 92]]], feet: [[214, 132], [208, 84]] };
  return { view: "front", poses: [a, b], far: { legs: [0] }, focus: ["thigh1"] };
}
// Shoulder bridge: on the back, the knees bent and the feet flat, the hips rolled up into a line from shoulders to
// knees and down again.
function shoulderBridge() {
  const arms = [[[48, 140], [78, 144], [108, 146]]];
  const a = { ...backFlat, arms, legs: [[[128, 140], [152, 104], [176, 144]], [[128, 140], [150, 102], [172, 142]]], feet: [[190, 146], [186, 144]] };
  const b = { trunk: [[132, 108], [90, 126], [48, 140]], neck: [36, 139], head: [26, 138], arms, legs: [[[132, 108], [168, 102], [176, 146]], [[132, 108], [166, 100], [172, 144]]], feet: [[190, 146], [186, 144]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk", "thigh0"] };
}
// Teaser: from lying, the arms overhead, up into a V on the sit bones, the arms reaching along the legs.
function teaser() {
  const a = { ...backFlat, arms: [[[48, 140], [24, 140], [2, 140]]], legs: longLegs, feet: longFeet };
  const b = { trunk: [[110, 140], [90, 104], [74, 70]], neck: [70, 60], head: [68, 49], arms: [[[74, 70], [100, 62], [126, 54]]], legs: [[[110, 140], [148, 112], [184, 84]], [[110, 140], [146, 110], [182, 82]]], feet: [[192, 76], [190, 74]] };
  return { poses: [a, b], far: { legs: [1] }, focus: ["trunk"] };
}

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
  frog: build(frog, { style: "yin", hold: true, seconds: 180, sides: 1, areas: ["hips"] }),
  shoelace: build(shoelace, { style: "yin", hold: true, seconds: 120, sides: 2, areas: ["hips"] }),
  dragonfly: build(dragonfly, { style: "yin", hold: true, seconds: 180, sides: 1, areas: ["legs", "hips"] }),
  happyBaby: build(happyBaby, { style: "yin", hold: true, seconds: 120, sides: 1, areas: ["hips", "back"] }),
  banana: build(banana, { style: "yin", hold: true, seconds: 120, sides: 2, areas: ["back", "shoulders"] }),
  // Beyond the book, a well-known mobility move.
  threadNeedle: build(threadNeedle, { style: "mobility", seconds: 45, sides: 2, areas: ["back", "shoulders"] }),
  // Pilates: breath, a hint of how to breathe said with the move (recoveryBreath_<id>); advanced, only in the
  // harder set. A move changing legs as it goes counts the repeats of both together.
  hundred: build(hundred, { style: "pilates", seconds: 100, sides: 1, areas: ["back"], breath: true }),
  rollUp: build(rollUp, { style: "pilates", reps: 6, seconds: 40, sides: 1, areas: ["back", "legs"], breath: true }),
  legCircles: build(legCircles, { style: "pilates", reps: 10, seconds: 40, sides: 2, areas: ["hips"], breath: true }),
  rollingBall: build(rollingBall, { style: "pilates", reps: 8, seconds: 30, sides: 1, areas: ["back"], breath: true }),
  singleLegStretch: build(singleLegStretch, { style: "pilates", reps: 16, seconds: 45, sides: 1, areas: ["back", "hips"], breath: true }),
  doubleLegStretch: build(doubleLegStretch, { style: "pilates", reps: 8, seconds: 40, sides: 1, areas: ["back", "shoulders"], breath: true }),
  crissCross: build(crissCross, { style: "pilates", reps: 16, seconds: 45, sides: 1, areas: ["back"], breath: true }),
  spineStretch: build(spineStretch, { style: "pilates", reps: 5, seconds: 30, sides: 1, areas: ["back", "legs"], breath: true }),
  saw: build(saw, { style: "pilates", reps: 10, seconds: 40, sides: 1, areas: ["back", "legs"], breath: true }),
  swimming: build(swimming, { style: "pilates", seconds: 30, sides: 1, areas: ["back", "shoulders"], breath: true }),
  sideKick: build(sideKick, { style: "pilates", reps: 10, seconds: 40, sides: 2, areas: ["hips", "legs"], breath: true }),
  teaser: build(teaser, { style: "pilates", reps: 5, seconds: 30, sides: 1, areas: ["back"], advanced: true, breath: true }),
  // Breathing: no figure, the player draws a circle growing with the breath in and shrinking with it out instead.
  // pattern: the phases of one breath, [phase, seconds], phase one of in, top (a second breath in on top of the
  // first), hold (full) and empty (held out). seconds: the length it is offered at first.
  resonant: { style: "breath", hold: true, seconds: 300, sides: 1, pattern: [["in", 5.5], ["out", 5.5]] },
  diaphragm: { style: "breath", hold: true, seconds: 300, sides: 1, pattern: [["in", 4], ["out", 6]], book: "12.1" },
  longExhale: { style: "breath", hold: true, seconds: 300, sides: 1, pattern: [["in", 4], ["out", 7]] },
  box: { style: "breath", hold: true, seconds: 300, sides: 1, pattern: [["in", 4], ["hold", 4], ["out", 4], ["empty", 4]] },
  fourSevenEight: { style: "breath", hold: true, seconds: 120, sides: 1, pattern: [["in", 4], ["hold", 7], ["out", 8]] },
  sigh: { style: "breath", hold: true, seconds: 120, sides: 1, pattern: [["in", 2], ["top", 1], ["out", 6]] },
  shoulderBridge: build(shoulderBridge, { style: "pilates", reps: 8, seconds: 40, sides: 1, areas: ["hips", "back"], breath: true }),
  // chain and level: a stabilization exercise's place; reps: the repeats a moved one is counted in; gear: what it needs.
  stabFront1: build(front1, { style: "stability", chain: "front", level: 1, hold: true, seconds: 60, sides: 1, book: "9.1" }),
  stabFront2: build(front2, { style: "stability", chain: "front", level: 2, seconds: 60, sides: 1, book: "9.2" }),
  stabFront3: build(front3, { style: "stability", chain: "front", level: 3, seconds: 60, sides: 1, book: "9.3" }),
  stabFront4: build(front4, { style: "stability", chain: "front", level: 4, seconds: 60, sides: 1, book: "9.4" }),
  stabBack1: build(back1, { style: "stability", chain: "back", level: 1, hold: true, seconds: 60, sides: 1, book: "9.5" }),
  stabBack2: build(back2, { style: "stability", chain: "back", level: 2, seconds: 60, sides: 1, book: "9.6" }),
  stabBack3: build(back3, { style: "stability", chain: "back", level: 3, seconds: 60, sides: 1, book: "9.7" }),
  stabBack4: build(back4, { style: "stability", chain: "back", level: 4, seconds: 60, sides: 1, book: "9.8" }),
  stabSide1: build(side1, { style: "stability", chain: "side", level: 1, hold: true, seconds: 60, sides: 2, book: "9.9" }),
  stabSide2: build(side2, { style: "stability", chain: "side", level: 2, seconds: 60, sides: 2, book: "9.10" }),
  stabSide3: build(side3, { style: "stability", chain: "side", level: 3, seconds: 60, sides: 2, book: "9.11" }),
  stabSide4: build(side4, { style: "stability", chain: "side", level: 4, seconds: 60, sides: 2, book: "9.12" }),
  ballLower: build(ballLower, { style: "stability", chain: "pelvis", reps: 15, seconds: 45, sides: 1, gear: "ball", book: "9.13" }),
  ballUpper: build(ballUpper, { style: "stability", chain: "pelvis", reps: 15, seconds: 45, sides: 1, gear: "ball", book: "9.14" }),
  ballBoth: build(ballBoth, { style: "stability", chain: "pelvis", reps: 15, seconds: 45, sides: 1, gear: "ball", book: "9.15" }),
  ballOblique: build(ballOblique, { style: "stability", chain: "pelvis", reps: 15, seconds: 45, sides: 1, gear: "ball", book: "9.16" }),
  chop: build(chop, { style: "balance", reps: 10, seconds: 40, sides: 2, gear: "dumbbell", book: "9.28" }),
  kneelRow: build(kneelRow, { style: "balance", reps: 10, seconds: 40, sides: 2, gear: "dumbbell", book: "9.29" }),
  bridgePress: build(bridgePress, { style: "balance", reps: 10, seconds: 40, sides: 2, gear: "dumbbell", book: "9.30" }),
  sideLungeRaise: build(sideLungeRaise, { style: "balance", reps: 10, seconds: 40, sides: 2, gear: "dumbbell", book: "9.31" }),
  backLungePress: build(backLungePress, { style: "balance", reps: 10, seconds: 40, sides: 2, gear: "dumbbell", book: "9.32" }),
  // With equipment at home: style "gear", gear the tool it needs.
  rollThoracic: build(rollThoracic, { style: "gear", gear: "roller", seconds: 60, sides: 1, areas: ["back"] }),
  rollQuads: build(rollQuads, { style: "gear", gear: "roller", seconds: 60, sides: 1, areas: ["legs", "hips"] }),
  rollGlutes: build(rollGlutes, { style: "gear", gear: "roller", seconds: 45, sides: 2, areas: ["hips"] }),
  rollCalves: build(rollCalves, { style: "gear", gear: "roller", seconds: 60, sides: 1, areas: ["legs"] }),
  bandPullApart: build(bandPullApart, { style: "gear", gear: "band", reps: 15, seconds: 45, sides: 1, areas: ["shoulders", "back"] }),
  bandRow: build(bandRow, { style: "gear", gear: "band", reps: 12, seconds: 45, sides: 1, areas: ["back", "shoulders"] }),
  bandClamshell: build(bandClamshell, { style: "gear", gear: "band", reps: 15, seconds: 45, sides: 2, areas: ["hips"] }),
  bandRotation: build(bandRotation, { style: "gear", gear: "band", reps: 12, seconds: 40, sides: 2, areas: ["shoulders"] }),
  bandSideStep: build(bandSideStep, { style: "gear", gear: "band", reps: 10, seconds: 40, sides: 2, areas: ["hips", "legs"] }),
  bosuSquat: build(bosuSquat, { style: "gear", gear: "bosu", reps: 12, seconds: 45, sides: 1, areas: ["legs", "hips"] }),
  bosuBalance: build(bosuBalance, { style: "gear", gear: "bosu", hold: true, seconds: 30, sides: 2, areas: ["legs"] }),
  bosuPlank: build(bosuPlank, { style: "gear", gear: "bosu", hold: true, seconds: 40, sides: 1, areas: ["back", "shoulders"] }),
  bosuLunge: build(bosuLunge, { style: "gear", gear: "bosu", reps: 8, seconds: 40, sides: 2, areas: ["legs", "hips"] }),
};
