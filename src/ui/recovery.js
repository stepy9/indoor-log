// The stretching card after a rowing workout in the activity's detail: the set, its time, and each exercise with
// its dose, how-to and, where it has one, a figure moving between its two poses in time with the breath. A button
// runs the set step by step, full screen on a phone: a countdown per exercise and side, a short rest between,
// and at the end the workout is marked as stretched.
import { afterWorkout, exercises, steps } from "../recovery.js";
import { primaryBenefit } from "../fitness.js";
import { saveEntries } from "../library.js";
import { byId, formatDuration, t } from "./context.js";

const svgNs = "http://www.w3.org/2000/svg";
const cycle = "5s";

const points = (list) => list.map(([x, y]) => `${x},${y}`).join(" ");
const trunkPath = ([[hx, hy], [cx, cy], [sx, sy]]) => `M${hx},${hy} Q${cx},${cy} ${sx},${sy}`;

// Each drawn part as [tag, class, attributes of a pose]; the same parts in every pose, so they animate.
function parts(pose, focus) {
  const list = [
    ...pose.legs.map((leg) => ["polyline", "limb leg", { points: points(leg) }]),
    ...pose.arms.map((arm) => ["polyline", "limb arm", { points: points(arm) }]),
    ["path", "trunk", { d: trunkPath(pose.trunk) }],
    ["line", "neck", { x1: pose.trunk[2][0], y1: pose.trunk[2][1], x2: pose.neck[0], y2: pose.neck[1] }],
    ["circle", "head", { cx: pose.head[0], cy: pose.head[1], r: 12 }],
  ];
  for (const name of focus) {
    if (name === "trunk") list.push(["path", "focus", { d: trunkPath(pose.trunk) }]);
    const [, kind, index] = name.match(/^(arm|leg|thigh)(\d+)$/) ?? [];
    if (kind === "arm") list.push(["polyline", "focus", { points: points(pose.arms[index]) }]);
    if (kind === "leg") list.push(["polyline", "focus", { points: points(pose.legs[index]) }]);
    if (kind === "thigh") list.push(["polyline", "focus", { points: points(pose.legs[index].slice(0, 2)) }]);
  }
  return list;
}

export function figure(id) {
  const { poses, focus = [], wall } = exercises[id];
  if (!poses) return null;
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 220 170");
  svg.setAttribute("class", "recovery-figure");
  svg.setAttribute("aria-hidden", "true");
  // The mat, and the wall or door frame leant on where the exercise has one.
  const blocks = [{ x: 14, y: 150, width: 192, height: 8, rx: 4 }, ...(wall != null ? [{ x: wall, y: 6, width: 7, height: 146, rx: 3 }] : [])];
  for (const block of blocks) {
    const rect = document.createElementNS(svgNs, "rect");
    for (const [key, value] of Object.entries({ ...block, class: "mat" })) rect.setAttribute(key, value);
    svg.append(rect);
  }
  const [from, to] = poses.map((pose) => parts(pose, focus));
  from.forEach(([tag, className, attrs], index) => {
    const node = document.createElementNS(svgNs, tag);
    node.setAttribute("class", className);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, value);
      const other = to[index][2][key];
      if (String(other) === String(value)) continue;
      const animate = document.createElementNS(svgNs, "animate");
      for (const [name, setting] of Object.entries({
        attributeName: key, dur: cycle, repeatCount: "indefinite", calcMode: "spline",
        keyTimes: "0;.5;1", keySplines: ".45 0 .55 1;.45 0 .55 1", values: `${value};${other};${value}`,
      })) animate.setAttribute(name, setting);
      node.append(animate);
    }
    svg.append(node);
  });
  return svg;
}

function dose(id) {
  const { seconds, sides } = exercises[id];
  return sides > 1 ? `${t("recoverySeconds", { seconds })} ${t("recoveryEachSide")}` : t("recoverySeconds", { seconds });
}

const element = (tag, className, textContent = "") => Object.assign(document.createElement(tag), { className, textContent });

// The player: one step at a time, counted down by the clock, so a phone put aside keeps its place.
const player = { list: [], index: 0, endsAt: 0, left: 0, paused: false, timer: null, entry: null, onDone: null, wakeLock: null };

function cue(long = false) {
  try { navigator.vibrate?.(long ? [200, 100, 200] : 120); } catch { /* no vibration */ }
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.frequency.value = long ? 660 : 880;
    gain.gain.setValueAtTime(0.15, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + (long ? 0.6 : 0.25));
    tone.connect(gain).connect(audio.destination);
    tone.start();
    tone.stop(audio.currentTime + (long ? 0.6 : 0.25));
    tone.onended = () => audio.close();
  } catch { /* no sound */ }
}

function showStep() {
  const step = player.list[player.index];
  const work = step.type === "work";
  const id = work ? step.id : step.next;
  const dialog = byId("recoveryPlayer");
  dialog.classList.toggle("is-rest", !work);
  const position = [...new Set(player.list.filter((item) => item.type === "work").map((item) => item.id))];
  byId("recoveryPlayerProgress").textContent = t("recoveryProgress", { current: position.indexOf(id) + 1, total: position.length });
  const coming = player.list[player.index + 1];
  byId("recoveryPlayerPhase").textContent = work ? (step.side ? t(`recoverySide_${step.side}`) : "") : coming?.side === 2 ? t("recoverySwitch") : coming?.side === 1 ? t("recoveryReadySide") : t("recoveryNext");
  byId("recoveryPlayerName").textContent = t(`recovery_${id}`);
  byId("recoveryPlayerHow").textContent = t(`recoveryHow_${id}`);
  const art = figure(id);
  byId("recoveryPlayerFigure").replaceChildren(...(art ? [art] : []));
  byId("recoveryPlayerFigure").hidden = !art;
  player.left = step.seconds;
  player.endsAt = Date.now() + step.seconds * 1000;
  tick();
}

function tick() {
  if (player.paused) return;
  const left = Math.max(0, Math.ceil((player.endsAt - Date.now()) / 1000));
  byId("recoveryPlayerClock").textContent = formatDuration(left);
  if (left > 0) return;
  player.index += 1;
  if (player.index >= player.list.length) return finish();
  cue(player.list[player.index].type === "work");
  showStep();
}

async function finish() {
  stop();
  cue(true);
  const dialog = byId("recoveryPlayer");
  dialog.classList.add("is-done");
  dialog.classList.remove("is-rest");
  byId("recoveryPlayerFigure").hidden = true;
  byId("recoveryPlayerProgress").textContent = "";
  byId("recoveryPlayerPhase").textContent = "";
  byId("recoveryPlayerName").textContent = t("recoveryDone");
  byId("recoveryPlayerHow").textContent = "";
  byId("recoveryPlayerClock").textContent = "✓";
  player.entry.stretched = Date.now();
  await saveEntries([player.entry]).catch(() => {});
  player.onDone?.();
}

function stop() {
  clearInterval(player.timer);
  player.timer = null;
  player.wakeLock?.release?.().catch?.(() => {});
  player.wakeLock = null;
}

async function start(entry, ids, onDone) {
  Object.assign(player, { list: steps(ids), index: 0, paused: false, entry, onDone });
  const dialog = byId("recoveryPlayer");
  dialog.classList.remove("is-done", "is-paused");
  byId("recoveryPlayerPause").textContent = t("recoveryPause");
  dialog.showModal();
  showStep();
  player.timer = setInterval(tick, 250);
  // The screen stays on while the set runs, where the browser allows it.
  try { player.wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* stays as it is */ }
}

let wired = false;
function wirePlayer() {
  if (wired) return;
  wired = true;
  const dialog = byId("recoveryPlayer");
  byId("recoveryPlayerPause").addEventListener("click", () => {
    if (dialog.classList.contains("is-done")) return;
    player.paused = !player.paused;
    if (player.paused) player.left = Math.max(0, (player.endsAt - Date.now()) / 1000);
    else player.endsAt = Date.now() + player.left * 1000;
    dialog.classList.toggle("is-paused", player.paused);
    byId("recoveryPlayerPause").textContent = t(player.paused ? "recoveryResume" : "recoveryPause");
  });
  byId("recoveryPlayerSkip").addEventListener("click", () => {
    if (dialog.classList.contains("is-done")) return;
    player.paused = false;
    dialog.classList.remove("is-paused");
    byId("recoveryPlayerPause").textContent = t("recoveryPause");
    player.endsAt = Date.now();
    tick();
  });
  byId("recoveryPlayerClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", stop);
}

// Shown for one rowing workout picked; hidden otherwise.
export function renderRecovery(picked, settings, onStretched = () => {}) {
  const card = byId("compareRecovery");
  const entry = picked.length === 1 && picked[0].sport === "rowing" ? picked[0] : null;
  card.hidden = !entry;
  if (!entry) return;
  wirePlayer();
  const plan = afterWorkout({ benefit: primaryBenefit(entry, settings)?.benefit ?? null, seconds: entry.summary.timerSeconds });
  byId("compareRecoveryTitle").textContent = t("recoveryTitle", { minutes: plan.minutes });
  byId("compareRecoveryNote").textContent = t(plan.cooldown ? "recoveryCooldown" : `recoveryNote_${plan.set}`);
  const status = byId("compareRecoveryDone");
  const showStatus = () => {
    status.hidden = !entry.stretched;
    if (entry.stretched) status.textContent = t("recoveryDoneOn", { when: new Date(entry.stretched).toLocaleString(document.documentElement.lang || undefined, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) });
  };
  showStatus();
  const button = byId("compareRecoveryStart");
  button.onclick = () => start(entry, plan.exercises, () => {
    showStatus();
    onStretched();
  });
  byId("compareRecoveryList").replaceChildren(...plan.exercises.map((id) => {
    const item = element("li", "recovery-item");
    const art = figure(id);
    const text = element("div", "recovery-text");
    text.append(element("strong", "", t(`recovery_${id}`)), element("span", "recovery-dose", dose(id)), element("p", "", t(`recoveryHow_${id}`)));
    item.append(...(art ? [art] : []), text);
    return item;
  }));
}
