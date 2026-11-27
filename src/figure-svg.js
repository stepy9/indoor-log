// The exercises' figures as SVG markup, without the DOM, so the app and a preview draw them alike.
// A view: { poses, focus, blocks, far, arrows }. A pose: { trunk, neck, head, arms, legs, feet } as in recovery.js;
// feet, when given, the toe of each leg (null for none). far: { arms: [index], legs: [index] }, the limbs on the
// side away from the eye, drawn darker and behind the body. arrows: SVG paths showing a move's way, drawn faint
// ({ d, both } for one headed at both ends). A pose's strap: a towel from the hand to the foot; its ball: a gym ball
// [x, y, r] moving with the pose. weights: the arms holding a dumbbell, drawn across the hand. A close-up's
// pose has bands instead of a body, each a polyline as wide as the view's bandWidths says; focus "band<i>" names one.
// blocks: rects behind the figure (the mat, a wall, a door frame), each with an optional class ("pad" for a cushion).

import { bodyBetween, bodyParts } from "./figure-body.js";

const points = (list) => list.map(([x, y]) => `${x},${y}`).join(" ");
const trunkPath = ([[hx, hy], [cx, cy], [sx, sy]]) => `M${hx},${hy} Q${cx},${cy} ${sx},${sy}`;

// Each drawn part as [tag, class, attributes]; the same parts in the same order for every pose of a view, so they
// animate. The far limbs first, then the body, the near limbs, hands and feet, the stretched muscle over them.
export function figureParts(pose, view) {
  // A mirrored figure (the other side of a move done on both) has its left limbs where the right ones were.
  const [leftClass, rightClass] = view.mirrored ? ["right", "left"] : ["left", "right"];
  if (pose.body) return bodyParts(pose, view, { left: leftClass, right: rightClass });
  const far = view.far ?? {};
  const isFar = (kind, index) => (far[kind] ?? []).includes(index);
  const limbs = (kind, wantFar) => pose[kind].flatMap((joints, index) => {
    if (isFar(kind, index) !== wantFar) return [];
    // view.left: the limbs on the body's left, drawn in their own colour so left and right can be told apart.
    const side = view.left ? ((view.left[kind] ?? []).includes(index) ? ` ${leftClass}` : ` ${rightClass}`) : "";
    const tone = (wantFar ? " far" : "") + side;
    const list = [["polyline", `limb ${kind === "legs" ? "leg" : "arm"}${tone}`, { points: points(joints) }]];
    const end = joints.at(-1);
    if (kind === "arms") list.push(["circle", `hand${tone}`, { cx: end[0], cy: end[1], r: 6.5 }]);
    const toe = kind === "legs" ? pose.feet?.[index] : null;
    if (toe) list.push(["line", `foot${tone}`, { x1: end[0], y1: end[1], x2: toe[0], y2: toe[1] }]);
    return list;
  });
  // A close-up's parts: bands of their own widths (a forearm, a palm, fingers), far ones darker and behind.
  const bands = (wantFar) => (pose.bands ?? []).flatMap((band, index) => (isFar("bands", index) === wantFar
    ? [["polyline", `limb band${wantFar ? ` far ${rightClass}` : ` ${leftClass}`}`, { points: points(band), style: `stroke-width: ${view.bandWidths?.[index] ?? 12}px` }]] : []));
  const list = [
    // A gym ball behind the body, and a towel or strap held, from the hand to the foot.
    ...(pose.ball ? [["circle", "ball", { cx: pose.ball[0], cy: pose.ball[1], r: pose.ball[2] ?? 20 }]] : []),
    ...(pose.strap ? [["polyline", "strap", { points: points(pose.strap) }]] : []),
    ...bands(true),
    ...limbs("legs", true),
    ...limbs("arms", true),
    ...(pose.trunk ? [
      ["path", "trunk", { d: trunkPath(pose.trunk) }],
      ["line", "neck", { x1: pose.trunk[2][0], y1: pose.trunk[2][1], x2: pose.neck[0], y2: pose.neck[1] }],
      ["circle", "head", { cx: pose.head[0], cy: pose.head[1], r: 12 }],
    ] : []),
    ...limbs("legs", false),
    ...limbs("arms", false),
    ...bands(false),
    // A dumbbell across the hand, square to the forearm.
    ...(view.weights ?? []).map((index) => {
      const arm = pose.arms[index];
      const [hx, hy] = arm.at(-1);
      const [px, py] = arm.at(-2);
      const length = Math.hypot(hx - px, hy - py) || 1;
      const [dx, dy] = [((py - hy) / length) * 11, ((hx - px) / length) * 11];
      return ["line", "weight", { x1: Math.round(hx - dx), y1: Math.round(hy - dy), x2: Math.round(hx + dx), y2: Math.round(hy + dy) }];
    }),
  ];
  // The muscle that stretches or works: a soft band over its part rather than a line.
  for (const name of view.focus ?? []) {
    if (name === "trunk") list.push(["path", "focus", { d: trunkPath(pose.trunk) }]);
    // The chest from the front: across, just under the shoulders the arms start from.
    if (name === "chest") list.push(["line", "focus", { x1: pose.arms[0][0][0] + 4, y1: pose.arms[0][0][1] + 10, x2: pose.arms[1][0][0] - 4, y2: pose.arms[1][0][1] + 10 }]);
    const [, kind, index] = name.match(/^(arm|leg|thigh|fore)(\d+)$/) ?? [];
    if (kind === "arm") list.push(["polyline", "focus", { points: points(pose.arms[index]) }]);
    if (kind === "leg") list.push(["polyline", "focus", { points: points(pose.legs[index]) }]);
    if (kind === "thigh") list.push(["polyline", "focus", { points: points(pose.legs[index].slice(0, 2)) }]);
    // The broad back muscle: from the elbow over the shoulder down the upper side of the trunk.
    if (name === "lat") {
      const arm = pose.arms.at(-1);
      const [[hx, hy], [cx, cy], [sx, sy]] = pose.trunk;
      // A third of the way from the shoulder to the hip, along the trunk's curve.
      const along = (t) => [Math.round((1 - t) ** 2 * sx + 2 * t * (1 - t) * cx + t ** 2 * hx), Math.round((1 - t) ** 2 * sy + 2 * t * (1 - t) * cy + t ** 2 * hy)];
      list.push(["polyline", "focus", { points: points([arm[1], [sx, sy], along(0.18), along(0.36)]) }]);
    }
    if (name.startsWith("band")) list.push(["polyline", "focus", { points: points(pose.bands[Number(name.slice(4))]) }]);
    if (kind === "fore") list.push(["polyline", "focus", { points: points(pose.arms[index].slice(1)) }]);
  }
  return list;
}

// A move goes round its poses over and over (two poses: there, a short stop, back and a short stop, as it is done;
// more: a circle through them); a hold eases into the stretch, stays there still most of the cycle and eases back.
// tempo: the seconds one round takes, where the exercise sets its own.
const ease = ".45 0 .55 1";
export function timing(hold, count, tempo = null) {
  if (hold) return { dur: `${tempo ?? 8}s`, keyTimes: "0;.2;.88;1", keySplines: `${ease};0 0 1 1;${ease}`, order: [0, 1, 1, 0] };
  if (count === 2) return { dur: `${tempo ?? 5}s`, keyTimes: "0;.4;.5;.9;1", keySplines: `${ease};0 0 1 1;${ease};0 0 1 1`, order: [0, 1, 1, 0, 0] };
  const order = [...Array(count).keys(), 0];
  const steps = order.length - 1;
  return {
    dur: `${tempo ?? Math.round(count * 1.1 * 10) / 10}s`,
    keyTimes: order.map((_, index) => String(Math.round((index / steps) * 1000) / 1000)).join(";"),
    keySplines: Array(steps).fill("0 0 1 1").join(";"),
    order,
  };
}

// The progress a spline "x1 y1 x2 y2" gives at time u (0–1), the curve solved for x by halving.
function eased(spline, u) {
  const [x1, y1, x2, y2] = spline.split(" ").map(Number);
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t ** 2 * (1 - t) + t ** 3;
  let [low, high] = [0, 1];
  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    if (at(x1, x2, mid) < u) low = mid; else high = mid;
  }
  return at(y1, y2, (low + high) / 2);
}

// Between two poses by their joints' angles, not their points: each bone turns and keeps its length, so a limb
// swinging round does not shorten on the way. A limb hangs from the trunk's shoulder or hip as it moves.
const lerp = (a, b, t) => a + (b - a) * t;
const lerpPoint = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const turn = (a, b, t) => a + ((((b - a) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI) * t;
function chain(a, b, t, root = lerpPoint(a[0], b[0], t)) {
  const list = [root];
  for (let index = 1; index < a.length; index += 1) {
    const [pa, qa, pb, qb] = [a[index - 1], a[index], b[index - 1], b[index]];
    const angle = turn(Math.atan2(qa[1] - pa[1], qa[0] - pa[0]), Math.atan2(qb[1] - pb[1], qb[0] - pb[0]), t);
    const length = lerp(Math.hypot(qa[0] - pa[0], qa[1] - pa[1]), Math.hypot(qb[0] - pb[0], qb[1] - pb[1]), t);
    const last = list.at(-1);
    list.push([last[0] + Math.cos(angle) * length, last[1] + Math.sin(angle) * length]);
  }
  return list;
}
// A point hung off another (a head off the neck, a toe off the ankle), turning with it the same way.
const hung = (fromA, toA, fromB, toB, from, t) => chain([fromA, toA], [fromB, toB], t, from)[1];
// A limb whose end stays put in both poses (a palm or a foot on the floor) keeps it there: its middle joint (the elbow,
// the knee) found from the bones' lengths, bent the way it bends in the first pose.
const planted = (a, b) => Math.hypot(a.at(-1)[0] - b.at(-1)[0], a.at(-1)[1] - b.at(-1)[1]) < 1;
function pinned(a, b, t, root) {
  const end = a[2];
  const upper = lerp(Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]), Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]), t);
  const lower = lerp(Math.hypot(a[2][0] - a[1][0], a[2][1] - a[1][1]), Math.hypot(b[2][0] - b[1][0], b[2][1] - b[1][1]), t);
  const [dx, dy] = [end[0] - root[0], end[1] - root[1]];
  const reach = Math.min(Math.hypot(dx, dy), upper + lower - 0.01) || 0.01;
  const along = (upper ** 2 - lower ** 2 + reach ** 2) / (2 * reach);
  const off = Math.sqrt(Math.max(0, upper ** 2 - along ** 2));
  const [ux, uy] = [dx / Math.hypot(dx, dy || 0.01), dy / Math.hypot(dx, dy || 0.01)];
  const side = Math.sign((a[2][0] - a[0][0]) * (a[1][1] - a[0][1]) - (a[2][1] - a[0][1]) * (a[1][0] - a[0][0])) || 1;
  const middle = [root[0] + ux * along - uy * off * side, root[1] + uy * along + ux * off * side];
  return [root, middle, end];
}
export function between(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  if (a.body) return bodyBetween(a, b, t, { chain, pinned, planted, hung });
  const pose = { ...a };
  // The limb's start kept where it sits against the trunk's shoulder (arms) or hip (legs).
  const anchored = (kind, end) => a[kind]?.map((limb, index) => {
    const other = b[kind][index];
    if (limb.every((point, at) => point[0] === other[at][0] && point[1] === other[at][1])) return limb;
    if (!a.trunk || !b.trunk) return chain(limb, other, t);
    const [ra, rb] = [a.trunk[end], b.trunk[end]];
    const offset = lerpPoint([limb[0][0] - ra[0], limb[0][1] - ra[1]], [other[0][0] - rb[0], other[0][1] - rb[1]], t);
    const root = pose.trunk[end];
    const start = [root[0] + offset[0], root[1] + offset[1]];
    if (!planted(limb, other)) return chain(limb, other, t, start);
    return limb.length === 3 ? pinned(limb, other, t, start) : [start, ...limb.slice(1)];
  });
  if (a.trunk) {
    // The trunk is a curve, its middle point the curve's pull rather than a joint: from point to point.
    pose.trunk = a.trunk.map((point, index) => lerpPoint(point, b.trunk[index], t));
    pose.neck = hung(a.trunk[2], a.neck, b.trunk[2], b.neck, pose.trunk[2], t);
    pose.head = hung(a.neck, a.head, b.neck, b.head, pose.neck, t);
  }
  if (a.arms) pose.arms = anchored("arms", 2);
  if (a.legs) pose.legs = anchored("legs", 0);
  if (a.feet) pose.feet = a.feet.map((toe, index) => (toe && b.feet?.[index] ? hung(a.legs[index].at(-1), toe, b.legs[index].at(-1), b.feet[index], pose.legs[index].at(-1), t) : toe));
  if (a.bands) pose.bands = a.bands.map((band, index) => chain(band, b.bands[index], t));
  if (a.strap && b.strap) pose.strap = chain(a.strap, b.strap, t);
  if (a.ball && b.ball) pose.ball = a.ball.map((value, index) => lerp(value, b.ball[index], t));
  return pose;
}

// The cycle as frames: { time, pose, strength }, sampled finely where the figure moves so the joints turn, and only
// at its ends where it stands still: some 12 a second, so the straight steps between them do not show. strength: how
// hard the stretched muscle works, 0 at the first pose, 1 at the last.
function frames(poses, how) {
  const seconds = parseFloat(how.dur);
  const keyTimes = how.keyTimes.split(";").map(Number);
  const splines = how.keySplines.split(";");
  const last = poses.length - 1;
  const list = [];
  for (let step = 0; step < how.order.length - 1; step += 1) {
    const [from, to] = [how.order[step], how.order[step + 1]];
    const count = from === to ? 1 : Math.max(8, Math.round((keyTimes[step + 1] - keyTimes[step]) * seconds * 12));
    for (let index = 0; index < count; index += 1) {
      const u = index / count;
      const t = eased(splines[step], u);
      const strength = lerp(from === last ? 1 : 0, to === last ? 1 : 0, t);
      list.push({ time: lerp(keyTimes[step], keyTimes[step + 1], u), pose: between(poses[from], poses[to], t), strength });
    }
  }
  const end = how.order.at(-1);
  list.push({ time: 1, pose: poses[end], strength: end === last ? 1 : 0 });
  return list;
}

const round = (value) => (typeof value === "number" ? Math.round(value * 10) / 10 : value);
const roundPoints = (text) => text.replace(/-?\d+\.\d+/g, (number) => String(round(Number(number))));
const attributes = (attrs) => Object.entries(attrs).map(([key, value]) => ` ${key}="${typeof value === "string" ? roundPoints(value) : round(value)}"`).join("");

// The stretched muscle fainter at rest and full at its stretch (or the work), so it shows when it works.
const focusOpacity = (strength) => round(0.22 + 0.48 * strength);
function drawnParts(pose, view, strength) {
  return figureParts(pose, view).map(([tag, kind, attrs]) => [tag, kind, kind.startsWith("focus") ? { ...attrs, opacity: focusOpacity(strength) } : attrs]);
}

// A soft shadow under the figure where it touches the floor: under its lowest points, as wide as they reach. None
// for a view from above, where the floor is all round it.
function shadow(pose) {
  if (pose.bands || !(pose.legs || pose.body)) return null;
  const all = pose.body ? Object.values(pose.body).filter(Array.isArray) : [...pose.legs.flat(), ...(pose.arms ?? []).flat(), ...(pose.feet ?? []).filter(Boolean), ...(pose.trunk ?? [])];
  const floor = Math.max(...all.map(([, y]) => y));
  const near = all.filter(([, y]) => y >= floor - 8).map(([x]) => x);
  const [left, right] = [Math.min(...near), Math.max(...near)];
  return ["ellipse", "shadow", { cx: (left + right) / 2, cy: floor + 6, rx: (right - left) / 2 + 12, ry: 3.5 }];
}

// The view's whole SVG. frame: a pose's index to draw it still (for a preview); otherwise animated. A move also
// shows its first and its last pose as faint ghosts and its arrows, so the way it goes and how far reads at a glance.
// reduced: for who asked for less motion, the poses take turns without moving between them.
// mirror: the figure turned left for right, for the second side of a move done on both.
export function figureMarkup(shown, { hold = false, frame = null, tempo = null, reduced = false, mirror = false, className = "recovery-figure" } = {}) {
  const view = mirror ? { ...shown, mirrored: true } : shown;
  const how = timing(hold, view.poses.length, reduced ? (tempo ?? 6) : tempo);
  const last = view.poses.length - 1;
  const cycle = frame != null ? [] : reduced
    ? how.order.map((pose, index) => ({ time: Number(how.keyTimes.split(";")[index]), pose: view.poses[pose], strength: pose === last ? 1 : 0 }))
    : frames(view.poses, how);
  const drawn = cycle.map(({ pose, strength }) => {
    const parts = drawnParts(pose, view, strength);
    const under = view.key === "top" ? null : shadow(pose);
    return under ? [under, ...parts] : parts;
  });
  const body = [];
  for (const block of view.blocks ?? []) {
    const { class: kind = "", ...rest } = block;
    body.push(`<rect class="mat${kind ? ` ${kind}` : ""}"${attributes(rest)}/>`);
  }
  if (!hold) {
    const ghost = (pose, kind) => `<g class="${kind}">${figureParts(pose, view).filter(([, part]) => !part.startsWith("focus")).map(([tag, part, attrs]) => `<${tag} class="${part}"${attributes(attrs)}/>`).join("")}</g>`;
    body.push(ghost(view.poses[0], "ghost"));
    if (view.poses.length === 2) body.push(ghost(view.poses[1], "ghost is-end"));
  }
  const stillPose = view.poses[Math.min(frame ?? 0, last)];
  const stillStrength = frame != null && Math.min(frame, last) === last && last > 0 ? 1 : 0;
  const still = drawn[0] ?? (() => { const parts = drawnParts(stillPose, view, stillStrength); const under = view.key === "top" ? null : shadow(stillPose); return under ? [under, ...parts] : parts; })();
  const keyTimes = cycle.map(({ time }) => Math.round(time * 10000) / 10000).join(";");
  still.forEach(([tag, kind, attrs], index) => {
    const animations = !cycle.length ? [] : Object.keys(attrs).flatMap((key) => {
      const values = drawn.map((parts) => parts[index][2][key]);
      if (values.every((value) => String(value) === String(attrs[key]))) return [];
      const shown = values.map((value) => (typeof value === "string" ? roundPoints(value) : round(value)));
      return [`<animate attributeName="${key}" dur="${how.dur}" repeatCount="indefinite" calcMode="${reduced ? "discrete" : "linear"}" keyTimes="${keyTimes}" values="${shown.join(";")}"/>`];
    });
    body.push(`<${tag} class="${kind}"${attributes(attrs)}>${animations.join("")}</${tag}>`);
  });
  // Over the figure, so a limb does not hide it. An arrow is a path, or { d, both } with a head at each end for a move
  // there and back. Its dashes run the way the figure goes: on one way round, and out and back with a move there and back.
  for (const arrow of view.arrows ?? []) {
    const { d, both = false } = typeof arrow === "string" ? { d: arrow } : arrow;
    const flow = both && how.order.length === 5 && !reduced && frame == null
      ? `<animate attributeName="stroke-dashoffset" dur="${how.dur}" repeatCount="indefinite" calcMode="spline" keyTimes="${how.keyTimes}" keySplines="${how.keySplines}" values="0;-30;-30;0;0"/>`
      : "";
    body.push(`<path class="move-arrow${both ? " is-both" : ""}" d="${d}"${both ? ' marker-start="url(#arrowHead)"' : ""} marker-end="url(#arrowHead)">${flow}</path>`);
  }
  const defs = view.arrows?.length ? `<defs><marker id="arrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="move-arrow-head"/></marker></defs>` : "";
  const drawing = mirror ? `<g transform="matrix(-1 0 0 1 220 0)">${body.join("")}</g>` : body.join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 170" class="${className}" aria-hidden="true">${defs}${drawing}</svg>`;
}

// The breath shown under a figure, in time with it: { first, second, dur, split }, the phase shown over the first
// part of the cycle and the one over the rest. A move there and back takes breathing[i] on the way into pose i, so
// its first half is breathing[1] and its second breathing[0]; a hold is paced calmly, in for 4 s and out for 6 s.
// null for a move without phases (one that alternates, circles or flutters).
export function breathCue(view, { hold = false, breathing = null, tempo = null } = {}) {
  if (hold) return { first: "in", second: "out", dur: "10s", split: "hold" };
  if (breathing && view.poses.length === 2) return { first: breathing[1], second: breathing[0], dur: timing(false, 2, tempo).dur, split: "half" };
  return null;
}
