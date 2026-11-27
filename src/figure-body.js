// A figure drawn as a body rather than lines: a chest and a pelvis between both shoulders and both hips (so the way
// the trunk turns shows by its width), limbs that taper from the trunk out, hands with fingers and feet with heels.
// For poses taken from a video by pose estimation, which gives each joint on both sides.
// A body pose: { body: { nose, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lIndex, rIndex, lHip, rHip,
// lKnee, rKnee, lAnkle, rAnkle, lToe, rToe } }, each [x, y] in the 220 × 170 box; l the body's own left. lIndex /
// rIndex: where the fingers point to; lToe / rToe: the toes.
// The view's body options: near: the side towards the eye ("l" or "r", default "l"), drawn over the trunk, the other
// under it; far: parts drawn paler as further away ("rShin", "rFoot", "lArm"…); flat: the hands lying flat on the
// floor, seen edge-on ("l", "r"); fist: the hands clenched ("l", "r").

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
// longest) and the thumb off to the side. flat: lying on the floor, so seen edge-on and narrow.
function hand(wrist, toward, kind, flat = 1) {
  const u = unit(wrist, toward);
  const n = [-u[1] * flat, u[0] * flat];
  const at = (along, across) => [wrist[0] + u[0] * along + n[0] * across, wrist[1] + u[1] * along + n[1] * across];
  const parts = [["polygon", `${kind} palm`, { points: [at(0, -2), at(6.5, -3), at(7, 2.8), at(0, 2)].map(fmt).join(" ") }]];
  for (const [across, length, fan] of [[-2.4, 4.2, -0.5], [-0.8, 5, -0.15], [0.8, 4.8, 0.15], [2.3, 3.8, 0.45]]) {
    const knuckle = at(6.6, across);
    parts.push(...segment(knuckle, [knuckle[0] + (u[0] + n[0] * fan * 0.35) * length, knuckle[1] + (u[1] + n[1] * fan * 0.35) * length], 1.7, 1.4, kind));
  }
  return [...parts, ...segment(at(1.5, -2.2), at(5, -5.6), 2.2, 1.7, kind)];
}

// A fist: a rounded knob just past the wrist, the thumb across it.
function clenched(wrist, toward, kind) {
  const u = unit(wrist, toward);
  const at = (along, across) => [wrist[0] + u[0] * along - u[1] * across, wrist[1] + u[1] * along + u[0] * across];
  return [...segment(at(1, 0), at(4.5, 0), 6.5, 6, kind), ...segment(at(2, -2.6), at(5, -1), 2.2, 2, kind)];
}

// A foot from the ankle to the toes: a heel behind, the sole along, the instep higher; the instep on the upper side.
function foot(ankle, toe, kind) {
  const u = unit(ankle, toe);
  let n = [-u[1], u[0]];
  if (n[1] > 0) n = [-n[0], -n[1]];
  const length = Math.hypot(toe[0] - ankle[0], toe[1] - ankle[1]) + 2;
  const at = (along, across) => fmt([ankle[0] + u[0] * along - n[0] * across, ankle[1] + u[1] * along - n[1] * across]);
  return [["path", `${kind} foot-shape`, { d: `M${at(-3, -2.5)} Q${at(-4.5, 2.5)} ${at(-1, 3)} L${at(length - 1, 2.6)} Q${at(length + 1.5, 1.2)} ${at(length, -0.6)} Q${at(length * 0.55, -1.6)} ${at(2, -3)}Z` }]];
}

// The trunk: a chest from the shoulders to a narrower waist, and a pelvis from the waist to the hips.
function trunk(body) {
  const shoulders = mix(body.lShoulder, body.rShoulder, 0.5);
  const hips = mix(body.lHip, body.rHip, 0.5);
  const lWaist0 = mix(body.lShoulder, body.lHip, 0.6);
  const rWaist0 = mix(body.rShoulder, body.rHip, 0.6);
  const waist = mix(lWaist0, rWaist0, 0.5);
  const [lWaist, rWaist] = [mix(waist, lWaist0, 0.82), mix(waist, rWaist0, 0.82)];
  const [lS, rS] = [mix(shoulders, body.lShoulder, 0.92), mix(shoulders, body.rShoulder, 0.92)];
  const [lH, rH] = [mix(hips, body.lHip, 0.9), mix(hips, body.rHip, 0.9)];
  // The chest bulges a little at its sides, between the shoulder and the waist.
  const bulge = (s, w) => { const m = mix(s, w, 0.5); return [m[0] + (s[0] - shoulders[0]) * 0.08, m[1] + (s[1] - shoulders[1]) * 0.08]; };
  return {
    belly: [lWaist, lH, rH, rWaist],
    chest: [lS, bulge(lS, lWaist), lWaist, rWaist, bulge(rS, rWaist), rS],
  };
}

// Each drawn part as [tag, class, attributes], the same parts in the same order for every pose so they animate.
// left: the classes of the body's left and right limbs ("left" / "right", swapped for a mirrored figure).
export function bodyParts(pose, view, { left = "left", right = "right" } = {}) {
  const body = pose.body;
  const near = view.near ?? "l";
  const far = new Set(view.far ?? []);
  const flat = new Set(view.flat ?? []);
  const fist = new Set(view.fist ?? []);
  const shoulders = mix(body.lShoulder, body.rShoulder, 0.5);
  const hips = mix(body.lHip, body.rHip, 0.5);
  // The joints inside the outline: the hip joints halfway in from the pelvis' sides, the shoulders a little in.
  const joint = { lHip: mix(hips, body.lHip, 0.5), rHip: mix(hips, body.rHip, 0.5), lShoulder: mix(shoulders, body.lShoulder, 0.78), rShoulder: mix(shoulders, body.rShoulder, 0.78) };
  const tone = (side, part) => `body-part ${side === "l" ? left : right}${far.has(`${side}${part}`) ? " far" : ""}`;
  const limbs = (side) => [
    ...segment(joint[`${side}Hip`], body[`${side}Knee`], 12, 7.5, tone(side, "Thigh")),
    ...segment(body[`${side}Knee`], body[`${side}Ankle`], 7, 4.5, tone(side, "Shin")),
    ...foot(body[`${side}Ankle`], body[`${side}Toe`], tone(side, "Foot")),
    ...segment(joint[`${side}Shoulder`], body[`${side}Elbow`], 7.5, 5.5, tone(side, "Arm")),
    ...segment(body[`${side}Elbow`], body[`${side}Wrist`], 5.5, 4, tone(side, "Arm")),
    ...(fist.has(side) ? clenched(body[`${side}Wrist`], body[`${side}Index`], tone(side, "Arm")) : hand(body[`${side}Wrist`], body[`${side}Index`], tone(side, "Arm"), flat.has(side) ? 0.4 : 1)),
  ];
  // The far side's parts first, under the trunk; a part named far (a shin going away) under its own limb too.
  const back = limbs(near === "l" ? "r" : "l");
  const isFar = ([, kind]) => kind.includes(" far");
  // The head: its centre a little behind the nose; the neck from inside the chest, which covers its base.
  const head = mix(body.nose, shoulders, 0.12);
  const { chest, belly } = trunk(body);
  const list = [
    ...back.filter(isFar),
    ...back.filter((part) => !isFar(part)),
    ...segment(mix(shoulders, hips, 0.12), mix(shoulders, head, 0.8), 10, 8, "body-part neck-shape"),
    ["polygon", "torso belly", { points: belly.map(fmt).join(" ") }],
    ["polygon", "torso chest", { points: chest.map(fmt).join(" ") }],
    ["ellipse", "body-part head-shape", { cx: head[0], cy: head[1], rx: 7.5, ry: 8.5 }],
    // The muscle that works: the trunk filled over, fainter at rest; under the near limbs, which stay clear.
    ...((view.focus ?? []).includes("trunk") ? [["polygon", "focus fill", { points: [...chest.slice(0, 2), ...belly.slice(1, 3), ...chest.slice(4)].map(fmt).join(" ") }]] : []),
    ...limbs(near),
  ];
  return list;
}

// Between two body poses: the trunk's points from one to the other, the limbs turning at their joints from there and
// keeping their length, a hand or a foot that stays put in both kept there.
export function bodyBetween(a, b, t, { chain, pinned, planted, hung }) {
  const out = {};
  for (const name of ["nose", "lShoulder", "rShoulder", "lHip", "rHip"]) out[name] = mix(a.body[name], b.body[name], t);
  for (const side of ["l", "r"]) {
    for (const [root, middle, end, tip] of [["Shoulder", "Elbow", "Wrist", "Index"], ["Hip", "Knee", "Ankle", "Toe"]]) {
      const [la, lb] = [[root, middle, end].map((name) => a.body[side + name]), [root, middle, end].map((name) => b.body[side + name])];
      const start = out[side + root];
      const limb = planted(la, lb) ? pinned(la, lb, t, start) : chain(la, lb, t, start);
      [out[side + middle], out[side + end]] = [limb[1], limb[2]];
      out[side + tip] = hung(a.body[side + end], a.body[side + tip], b.body[side + end], b.body[side + tip], limb[2], t);
    }
  }
  return { ...a, body: out };
}
