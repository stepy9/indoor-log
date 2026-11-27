// A figure drawn as a body rather than lines: a chest and a pelvis between both shoulders and both hips (so the way
// the trunk turns shows by its width), limbs that taper from the trunk out, hands with fingers and feet with heels.
// For poses taken from a video by pose estimation, which gives each joint on both sides, or made from a line figure.
// A body pose: { body: { nose, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lIndex, rIndex, lHip, rHip,
// lKnee, rKnee, lAnkle, rAnkle, lToe, rToe, lWaist?, rWaist?, scale? } }, each [x, y] in the 220 × 170 box; l the
// body's own left. lIndex / rIndex: where the fingers point to; lToe / rToe: the toes; lWaist / rWaist: the waist's
// sides where the trunk bends (from a curved line trunk); scale: the body's size against the video's (1), for the
// widths. A pose may keep a line figure's ball and strap.
// The view's body options: near: the side towards the eye ("l" or "r", default "l"), drawn over the trunk, the other
// under it; far: parts drawn paler as further away ("rShin", "rFoot", "lArm"…); flat: the hands lying flat on the
// floor, seen edge-on ("l", "r"); fist: the hands clenched ("l", "r"); profile: seen from the side, so both sides'
// limbs start from the trunk's middle; focus: "trunk" and limbs ("lThigh", "rLeg", "lArm", "rFore"…); weights: the
// hands holding a dumbbell ("l", "r").

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const fmt = (point) => `${Math.round(point[0] * 10) / 10},${Math.round(point[1] * 10) / 10}`;
const unit = (from, to) => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
  return [(to[0] - from[0]) / length, (to[1] - from[1]) / length];
};

// A tapered segment: a quad from width w1 at a to w2 at b, its ends rounded by a circle each.
function segment(a, b, w1, w2, kind) {
  const [ux, uy] = unit(a, b);
  const side = (p, w, s) => [p[0] - uy * (w / 2) * s, p[1] + ux * (w / 2) * s];
  return [
    ["polygon", kind, { points: [side(a, w1, 1), side(b, w2, 1), side(b, w2, -1), side(a, w1, -1)].map(fmt).join(" ") }],
    ["circle", kind, { cx: a[0], cy: a[1], r: w1 / 2 }],
    ["circle", kind, { cx: b[0], cy: b[1], r: w2 / 2 }],
  ];
}

// A hand from the wrist towards where the fingers point: a palm, four fingers fanned a little (the middle ones
// longest) and the thumb off to the side. flat: lying on the floor, so seen edge-on and narrow. s: the body's scale.
function hand(wrist, toward, kind, flat = 1, s = 1) {
  const u = unit(wrist, toward);
  const n = [-u[1] * flat, u[0] * flat];
  const at = (along, across) => [wrist[0] + (u[0] * along + n[0] * across) * s, wrist[1] + (u[1] * along + n[1] * across) * s];
  const parts = [["polygon", `${kind} palm`, { points: [at(0, -2), at(6.5, -3), at(7, 2.8), at(0, 2)].map(fmt).join(" ") }]];
  for (const [across, length, fan] of [[-2.4, 4.2, -0.5], [-0.8, 5, -0.15], [0.8, 4.8, 0.15], [2.3, 3.8, 0.45]]) {
    const knuckle = at(6.6, across);
    const tip = [knuckle[0] + (u[0] + n[0] * fan * 0.35) * length * s, knuckle[1] + (u[1] + n[1] * fan * 0.35) * length * s];
    parts.push(...segment(knuckle, tip, 1.7 * s, 1.4 * s, kind));
  }
  return [...parts, ...segment(at(1.5, -2.2), at(5, -5.6), 2.2 * s, 1.7 * s, kind)];
}

// A fist: a rounded knob just past the wrist, the thumb across it.
function clenched(wrist, toward, kind, s = 1) {
  const u = unit(wrist, toward);
  const at = (along, across) => [wrist[0] + (u[0] * along - u[1] * across) * s, wrist[1] + (u[1] * along + u[0] * across) * s];
  return [...segment(at(1, 0), at(4.5, 0), 6.5 * s, 6 * s, kind), ...segment(at(2, -2.6), at(5, -1), 2.2 * s, 2 * s, kind)];
}

// A foot from the ankle to the toes: a heel behind, the sole along, the instep higher; the instep on the upper side.
function foot(ankle, toe, kind, s = 1) {
  const u = unit(ankle, toe);
  let n = [-u[1], u[0]];
  if (n[1] > 0) n = [-n[0], -n[1]];
  const length = Math.hypot(toe[0] - ankle[0], toe[1] - ankle[1]) / s + 2;
  const at = (along, across) => fmt([ankle[0] + (u[0] * along - n[0] * across) * s, ankle[1] + (u[1] * along - n[1] * across) * s]);
  return [["path", `${kind} foot-shape`, { d: `M${at(-3, -2.5)} Q${at(-4.5, 2.5)} ${at(-1, 3)} L${at(length - 1, 2.6)} Q${at(length + 1.5, 1.2)} ${at(length, -0.6)} Q${at(length * 0.55, -1.6)} ${at(2, -3)}Z` }]];
}

// The trunk: a chest from the shoulders to a narrower waist, and a pelvis from the waist to the hips. Each side's
// outline a smooth curve through its shoulder, waist and hip, so a back that bends rounds rather than peaks; sampled
// into points, the same number in every pose so it animates.
function trunk(body) {
  const shoulders = mix(body.lShoulder, body.rShoulder, 0.5);
  const hips = mix(body.lHip, body.rHip, 0.5);
  const lWaist0 = body.lWaist ?? mix(body.lShoulder, body.lHip, 0.6);
  const rWaist0 = body.rWaist ?? mix(body.rShoulder, body.rHip, 0.6);
  const waist = mix(lWaist0, rWaist0, 0.5);
  const [lWaist, rWaist] = [mix(waist, lWaist0, 0.82), mix(waist, rWaist0, 0.82)];
  const [lS, rS] = [mix(shoulders, body.lShoulder, 0.92), mix(shoulders, body.rShoulder, 0.92)];
  const [lH, rH] = [mix(hips, body.lHip, 0.9), mix(hips, body.rHip, 0.9)];
  // The curve from a through m (halfway) to b, at t; and its points from t0 to t1.
  const through = (a, m, b) => [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2];
  const at = (a, c, b, t) => [(1 - t) ** 2 * a[0] + 2 * t * (1 - t) * c[0] + t ** 2 * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * c[1] + t ** 2 * b[1]];
  const run = (a, m, b, t0, t1) => { const c = through(a, m, b); return [0, 1, 2, 3, 4].map((step) => at(a, c, b, t0 + ((t1 - t0) * step) / 4)); };
  const [lChest, rChest] = [run(lS, lWaist, lH, 0, 0.5), run(rS, rWaist, rH, 0, 0.5)];
  const [lBelly, rBelly] = [run(lS, lWaist, lH, 0.5, 1), run(rS, rWaist, rH, 0.5, 1)];
  return {
    belly: [...lBelly, ...rBelly.reverse()],
    chest: [...lChest, ...rChest.reverse()],
    // The whole outline, for the trunk's focus.
    outline: [...run(lS, lWaist, lH, 0, 1), ...run(rS, rWaist, rH, 0, 1).reverse()],
  };
}

// Each drawn part as [tag, class, attributes], the same parts in the same order for every pose so they animate.
// left: the classes of the body's left and right limbs ("left" / "right", swapped for a mirrored figure).
export function bodyParts(pose, view, { left = "left", right = "right" } = {}) {
  const body = pose.body;
  const s = body.scale ?? 1;
  const near = view.near ?? "l";
  const far = new Set(view.far ?? []);
  const flat = new Set(view.flat ?? []);
  const fist = new Set(view.fist ?? []);
  const focus = view.focus ?? [];
  const shoulders = mix(body.lShoulder, body.rShoulder, 0.5);
  const hips = mix(body.lHip, body.rHip, 0.5);
  // The joints inside the outline: the hip joints halfway in from the pelvis' sides, the shoulders a little in; seen
  // from the side, both in the trunk's middle.
  const [inHip, inShoulder] = view.profile ? [0, 0] : [0.5, 0.78];
  const joint = { lHip: mix(hips, body.lHip, inHip), rHip: mix(hips, body.rHip, inHip), lShoulder: mix(shoulders, body.lShoulder, inShoulder), rShoulder: mix(shoulders, body.rShoulder, inShoulder) };
  const tone = (side, part) => `body-part ${side === "l" ? left : right}${far.has(`${side}${part}`) || far.has(`${side}Limbs`) ? " far" : ""}`;
  const bones = (side) => ({
    Thigh: [joint[`${side}Hip`], body[`${side}Knee`], 12, 7.5],
    Shin: [body[`${side}Knee`], body[`${side}Ankle`], 7, 4.5],
    Arm: [joint[`${side}Shoulder`], body[`${side}Elbow`], 7.5, 5.5],
    Fore: [body[`${side}Elbow`], body[`${side}Wrist`], 5.5, 4],
  });
  const limbs = (side) => {
    const bone = bones(side);
    const [wrist, index] = [body[`${side}Wrist`], body[`${side}Index`]];
    const handKind = tone(side, "Arm");
    return [
      ...segment(bone.Thigh[0], bone.Thigh[1], bone.Thigh[2] * s, bone.Thigh[3] * s, tone(side, "Thigh")),
      ...segment(bone.Shin[0], bone.Shin[1], bone.Shin[2] * s, bone.Shin[3] * s, tone(side, "Shin")),
      ...foot(body[`${side}Ankle`], body[`${side}Toe`], tone(side, "Foot"), s),
      ...segment(bone.Arm[0], bone.Arm[1], bone.Arm[2] * s, bone.Arm[3] * s, handKind),
      ...segment(bone.Fore[0], bone.Fore[1], bone.Fore[2] * s, bone.Fore[3] * s, handKind),
      // A hand on the floor (at the mat's top) lies flat, seen edge-on.
      ...(fist.has(side) ? clenched(wrist, index, handKind, s) : hand(wrist, index, handKind, flat.has(side) || (view.profile && wrist[1] >= 143) ? 0.4 : 1, s)),
      // A dumbbell across the hand, square to the forearm.
      ...((view.weights ?? []).includes(side) ? [(() => {
        const [ux, uy] = unit(body[`${side}Elbow`], wrist);
        const grip = [wrist[0] + ux * 4 * s, wrist[1] + uy * 4 * s];
        return ["line", "weight", { x1: grip[0] + uy * 11 * s, y1: grip[1] - ux * 11 * s, x2: grip[0] - uy * 11 * s, y2: grip[1] + ux * 11 * s }];
      })()] : []),
    ];
  };
  // The muscle that works: a soft band over its limb ("lThigh", "rLeg" thigh and shin, "lArm" arm and forearm,
  // "rFore"), or the trunk filled over; fainter at rest.
  const limbFocus = (side) => focus.filter((name) => name[0] === side).flatMap((name) => {
    const bone = bones(side);
    const part = name.slice(1);
    const list = part === "Leg" ? [bone.Thigh, bone.Shin] : part === "Arm" ? [bone.Arm, bone.Fore] : bone[part] ? [bone[part]] : [];
    return list.map(([a, b, w1, w2]) => ["polygon", "focus fill", { points: segment(a, b, (w1 + 5) * s, (w2 + 5) * s, "")[0][2].points }]);
  });
  // The far side's parts first, under the trunk; a part named far (a shin going away) under its own limb too.
  const backSide = near === "l" ? "r" : "l";
  const back = limbs(backSide);
  const isFar = ([, kind]) => kind.includes(" far");
  // The head: its centre a little behind the nose; the neck from inside the chest, which covers its base.
  const head = mix(body.nose, shoulders, 0.12);
  const { chest, belly, outline } = trunk(body);
  return [
    // A gym ball behind the body, and a towel or strap held, from the hand to the foot.
    ...(pose.ball ? [["circle", "ball", { cx: pose.ball[0], cy: pose.ball[1], r: pose.ball[2] ?? 20 }]] : []),
    ...(pose.strap ? [["polyline", "strap", { points: pose.strap.map(fmt).join(" ") }]] : []),
    ...back.filter(isFar),
    ...back.filter((part) => !isFar(part)),
    ...limbFocus(backSide),
    ...segment(mix(shoulders, hips, 0.12), mix(shoulders, head, 0.8), 10 * s, 8 * s, "body-part neck-shape"),
    ["polygon", "torso belly", { points: belly.map(fmt).join(" ") }],
    ["polygon", "torso chest", { points: chest.map(fmt).join(" ") }],
    ["ellipse", "body-part head-shape", { cx: head[0], cy: head[1], rx: 7.5 * s, ry: 8.5 * s }],
    // Under the near limbs, which stay clear.
    ...(focus.includes("trunk") ? [["polygon", "focus fill", { points: outline.map(fmt).join(" ") }]] : []),
    ...limbs(near),
    ...limbFocus(near),
  ];
}

// Between two body poses: the trunk's points from one to the other, the limbs turning at their joints from there and
// keeping their length, a hand or a foot that stays put in both kept there.
export function bodyBetween(a, b, t, { chain, pinned, planted, hung }) {
  const out = { ...(a.body.scale ? { scale: a.body.scale } : {}) };
  for (const name of ["nose", "lShoulder", "rShoulder", "lHip", "rHip", "lWaist", "rWaist"]) if (a.body[name]) out[name] = mix(a.body[name], b.body[name], t);
  for (const side of ["l", "r"]) {
    for (const [root, middle, end, tip] of [["Shoulder", "Elbow", "Wrist", "Index"], ["Hip", "Knee", "Ankle", "Toe"]]) {
      const [la, lb] = [[root, middle, end].map((name) => a.body[side + name]), [root, middle, end].map((name) => b.body[side + name])];
      const start = out[side + root];
      const limb = planted(la, lb) ? pinned(la, lb, t, start) : chain(la, lb, t, start);
      [out[side + middle], out[side + end]] = [limb[1], limb[2]];
      out[side + tip] = hung(a.body[side + end], a.body[side + tip], b.body[side + end], b.body[side + tip], limb[2], t);
    }
  }
  const pose = { ...a, body: out };
  if (a.ball && b.ball) pose.ball = a.ball.map((value, index) => value + (b.ball[index] - value) * t);
  if (a.strap && b.strap) pose.strap = chain(a.strap, b.strap, t);
  return pose;
}

// A line figure's view made a body one, seen from the side: the line trunk given depth (the chest thicker than the
// pelvis, bent where the line bends), the near limbs (not far) the left ones, the far ones the right and paler, hands
// and feet added along the forearms and shins where the figure has none. Its arrows and blocks stay.
const quad = ([a, c, b], t) => [(1 - t) ** 2 * a[0] + 2 * t * (1 - t) * c[0] + t ** 2 * b[0], (1 - t) ** 2 * a[1] + 2 * t * (1 - t) * c[1] + t ** 2 * b[1]];
export function bodyFromLines(view) {
  const first = view.poses[0];
  if (!first?.trunk || first.body) return view;
  const [hip0, , shoulder0] = first.trunk;
  // The body's size against the video's, whose trunk is some 50 long; the line figures' are larger.
  const scale = Math.round((Math.hypot(shoulder0[0] - hip0[0], shoulder0[1] - hip0[1]) / 50) * 100) / 100;
  const farArms = view.far?.arms ?? [];
  const farLegs = view.far?.legs ?? [];
  // Which index is the near (left) limb: the one not far; with none far, the first.
  const sides = (count, far) => {
    const near = [...Array(count).keys()].find((index) => !far.includes(index)) ?? 0;
    return { l: near, r: count > 1 ? (near === 0 ? 1 : 0) : near };
  };
  const convert = (pose) => {
    const [hip, , shoulder] = pose.trunk;
    const [ux, uy] = unit(hip, shoulder);
    const n = [-uy, ux];
    const off = (point, depth, sign) => [point[0] + n[0] * depth * sign * scale, point[1] + n[1] * depth * sign * scale];
    // The waist two fifths of the way from the shoulders, on the line's curve.
    const waist = quad(pose.trunk, 0.6);
    const arm = sides(pose.arms.length, farArms);
    const leg = sides(pose.legs.length, farLegs);
    const body = { scale, nose: mix(pose.head, pose.neck, -0.25) };
    for (const [side, sign] of [["l", 1], ["r", -1]]) {
      Object.assign(body, {
        [`${side}Shoulder`]: off(shoulder, 10, sign), [`${side}Hip`]: off(hip, 8.5, sign), [`${side}Waist`]: off(waist, 8, sign),
      });
      // A limb of two points (straight) bends at its middle.
      const joints = (limb) => (limb.length === 2 ? [limb[0], mix(limb[0], limb[1], 0.5), limb[1]] : limb);
      const [, elbow, wrist] = joints(pose.arms[arm[side]]);
      const [, knee, ankle] = joints(pose.legs[leg[side]]);
      const [fx, fy] = unit(elbow, wrist);
      const [sx, sy] = unit(knee, ankle);
      Object.assign(body, {
        // A hand on the floor lies flat, its fingers forward (the way the head is from the hips).
        [`${side}Elbow`]: elbow, [`${side}Wrist`]: wrist, [`${side}Index`]: wrist[1] >= 143 ? [wrist[0] + Math.sign(shoulder[0] - hip[0] || 1) * 9, wrist[1] + 1] : [wrist[0] + fx * 9, wrist[1] + fy * 9],
        [`${side}Knee`]: knee, [`${side}Ankle`]: ankle, [`${side}Toe`]: pose.feet?.[leg[side]] ?? [ankle[0] + sx * 12 * scale, ankle[1] + sy * 12 * scale],
      });
    }
    return { body, ...(pose.ball ? { ball: pose.ball } : {}), ...(pose.strap ? { strap: pose.strap } : {}) };
  };
  // Its focus on the trunk and the limbs, named by side now.
  const named = (name) => {
    const [, kind, index] = name.match(/^(arm|leg|thigh|fore)(\d+)$/) ?? [];
    if (!kind) return name === "trunk" || name === "lat" || name === "chest" ? "trunk" : null;
    const side = Number(index) === sides(first[kind === "arm" || kind === "fore" ? "arms" : "legs"].length, kind === "arm" || kind === "fore" ? farArms : farLegs).l ? "l" : "r";
    return side + { arm: "Arm", leg: "Leg", thigh: "Thigh", fore: "Fore" }[kind];
  };
  const weights = (view.weights ?? []).map((index) => (index === sides(first.arms.length, farArms).l ? "l" : "r"));
  return {
    ...view,
    poses: view.poses.map(convert),
    profile: true,
    near: "l",
    far: farArms.length || farLegs.length ? ["rLimbs"] : [],
    left: undefined,
    focus: [...new Set((view.focus ?? []).map(named).filter(Boolean))],
    weights,
  };
}
