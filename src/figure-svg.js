// The exercises' figures as SVG markup, without the DOM, so the app and a preview draw them alike.
// A view: { poses, focus, blocks, far, arrows }. A pose: { trunk, neck, head, arms, legs, feet } as in recovery.js;
// feet, when given, the toe of each leg (null for none). far: { arms: [index], legs: [index] }, the limbs on the
// side away from the eye, drawn darker and behind the body. arrows: SVG paths showing a move's way, drawn faint.
// blocks: rects behind the figure (the mat, a wall, a door frame), each with an optional class ("pad" for a cushion).

const points = (list) => list.map(([x, y]) => `${x},${y}`).join(" ");
const trunkPath = ([[hx, hy], [cx, cy], [sx, sy]]) => `M${hx},${hy} Q${cx},${cy} ${sx},${sy}`;

// Each drawn part as [tag, class, attributes]; the same parts in the same order for every pose of a view, so they
// animate. The far limbs first, then the body, the near limbs, hands and feet, the stretched muscle over them.
export function figureParts(pose, view) {
  const far = view.far ?? {};
  const isFar = (kind, index) => (far[kind] ?? []).includes(index);
  const limbs = (kind, wantFar) => pose[kind].flatMap((joints, index) => {
    if (isFar(kind, index) !== wantFar) return [];
    const tone = wantFar ? " far" : "";
    const list = [["polyline", `limb ${kind === "legs" ? "leg" : "arm"}${tone}`, { points: points(joints) }]];
    const end = joints.at(-1);
    if (kind === "arms") list.push(["circle", `hand${tone}`, { cx: end[0], cy: end[1], r: 6.5 }]);
    const toe = kind === "legs" ? pose.feet?.[index] : null;
    if (toe) list.push(["line", `foot${tone}`, { x1: end[0], y1: end[1], x2: toe[0], y2: toe[1] }]);
    return list;
  });
  const list = [
    ...limbs("legs", true),
    ...limbs("arms", true),
    ...(pose.trunk ? [
      ["path", "trunk", { d: trunkPath(pose.trunk) }],
      ["line", "neck", { x1: pose.trunk[2][0], y1: pose.trunk[2][1], x2: pose.neck[0], y2: pose.neck[1] }],
      ["circle", "head", { cx: pose.head[0], cy: pose.head[1], r: 12 }],
    ] : []),
    ...limbs("legs", false),
    ...limbs("arms", false),
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
    if (kind === "fore") list.push(["polyline", "focus", { points: points(pose.arms[index].slice(1)) }]);
  }
  return list;
}

// A move goes round its poses over and over (two poses: there and back; more: a circle through them); a hold
// eases into the stretch, stays there still most of the cycle and eases back.
const ease = ".45 0 .55 1";
export function timing(hold, count) {
  if (hold) return { dur: "8s", keyTimes: "0;.2;.88;1", keySplines: `${ease};0 0 1 1;${ease}`, order: [0, 1, 1, 0] };
  const order = count === 2 ? [0, 1, 0] : [...Array(count).keys(), 0];
  const steps = order.length - 1;
  return {
    dur: count === 2 ? "5s" : `${count * 1.1}s`,
    keyTimes: order.map((_, index) => String(Math.round((index / steps) * 1000) / 1000)).join(";"),
    keySplines: Array(steps).fill(count === 2 ? ease : "0 0 1 1").join(";"),
    order,
  };
}

const attributes = (attrs) => Object.entries(attrs).map(([key, value]) => ` ${key}="${value}"`).join("");

// The view's whole SVG. frame: a pose's index to draw it still (for a preview); otherwise animated. A move also
// shows its first pose as a faint ghost and its arrows, so the way it goes reads at a glance.
export function figureMarkup(view, { hold = false, frame = null, className = "recovery-figure" } = {}) {
  const how = timing(hold, view.poses.length);
  const drawn = view.poses.map((pose) => figureParts(pose, view));
  const body = [];
  for (const block of view.blocks ?? []) {
    const { class: kind = "", ...rest } = block;
    body.push(`<rect class="mat${kind ? ` ${kind}` : ""}"${attributes(rest)}/>`);
  }
  if (!hold) {
    const ghost = drawn[0].filter(([, kind]) => kind !== "focus").map(([tag, kind, attrs]) => `<${tag} class="${kind}"${attributes(attrs)}/>`).join("");
    body.push(`<g class="ghost">${ghost}</g>`);
  }
  for (const arrow of view.arrows ?? []) body.push(`<path class="move-arrow" d="${arrow}" marker-end="url(#arrowHead)"/>`);
  const still = frame != null ? drawn[Math.min(frame, drawn.length - 1)] : drawn[0];
  still.forEach(([tag, kind, attrs], index) => {
    const animations = frame != null ? [] : Object.keys(attrs).flatMap((key) => {
      const values = how.order.map((pose) => drawn[pose][index][2][key]);
      if (values.every((value) => String(value) === String(attrs[key]))) return [];
      return [`<animate attributeName="${key}" dur="${how.dur}" repeatCount="indefinite" calcMode="spline" keyTimes="${how.keyTimes}" keySplines="${how.keySplines}" values="${values.join(";")}"/>`];
    });
    body.push(`<${tag} class="${kind}"${attributes(attrs)}>${animations.join("")}</${tag}>`);
  });
  const defs = view.arrows?.length ? `<defs><marker id="arrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="move-arrow-head"/></marker></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 170" class="${className}" aria-hidden="true">${defs}${body.join("")}</svg>`;
}
