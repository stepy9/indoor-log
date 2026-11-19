// The stretching card after a rowing workout in the activity's detail: the set, its time, and each exercise with
// its dose, how-to and, where it has one, a figure moving between its two poses in time with the breath. A button
// runs the set step by step, full screen on a phone: a countdown per exercise and side, a short rest between,
// and at the end the workout is marked as stretched.
import { afterWorkout, exerciseCatalog, exerciseViews, exercises, steps, strengthLevel, strengthSession, strengthToday, warmupBefore, warmupRest } from "../recovery.js";
import { saveDefaults, savedDefaults } from "./preferences.js";
import { figureMarkup } from "../figure-svg.js";
import { primaryBenefit } from "../fitness.js";
import { saveEntries } from "../library.js";
import { byId, formatDuration, state, t } from "./context.js";



// One view drawn: the markup of figure-svg.js, made an element.
function drawView(id, view) {
  const holder = document.createElement("div");
  holder.innerHTML = figureMarkup(view, { hold: Boolean(exercises[id].hold), className: `recovery-figure is-${view.key}` });
  return holder.firstElementChild;
}

const views = exerciseViews;

// The side view alone, for the small lists.
export function figure(id) {
  const [side] = views(id);
  return side ? drawView(id, side) : null;
}

// Every view, each captioned when there is more than one ("from the side", "from above", "close up").
export function figures(id) {
  const all = views(id);
  if (all.length < 2) return all.map((view) => drawView(id, view));
  return all.map((view) => {
    const box = Object.assign(document.createElement("figure"), { className: "recovery-view" });
    box.append(drawView(id, view), Object.assign(document.createElement("figcaption"), { textContent: t(`recoveryView_${view.key}`) }));
    return box;
  });
}

// The time, said as a hold or as a move to repeat, and per side where it has two.
function dose(id, seconds = exercises[id].seconds, reps = null) {
  const { sides, hold } = exercises[id];
  const time = reps ? t("strengthReps", { reps }) : t(hold ? "recoveryHoldFor" : "recoveryMoveFor", { seconds });
  return sides > 1 ? `${time} ${t("recoveryEachSide")}` : time;
}

// A tag saying whether to hold still or to move, beside the name.
const nameLine = (id) => {
  const line = element("strong", "exercise-name", t(`recovery_${id}`));
  line.append(" ", modeTag(id));
  return line;
};
const modeTag = (id) => element("span", `exercise-mode is-${exercises[id].hold ? "hold" : "move"}`, t(exercises[id].hold ? "recoveryModeHold" : "recoveryModeMove"));

const element = (tag, className, textContent = "") => Object.assign(document.createElement(tag), { className, textContent });

// The player: one step at a time, counted down by the clock, so a phone put aside keeps its place.
const player = { list: [], index: 0, endsAt: 0, left: 0, paused: false, timer: null, doneKey: "recoveryDone", onDone: null, wakeLock: null };

// Sounds to follow the set without looking: three short ticks before a change, one long high tone as an exercise
// starts, two short low ones as it ends, a rising three at the end of the set. One audio context, opened by the
// tap that starts the set (iOS plays nothing from one opened later), muted by the player's bell.
const soundOn = () => savedDefaults().playerSound !== false;
let audio = null;
function openAudio() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { audio = null; }
}
function tones(list) {
  if (!soundOn() || !audio) return;
  try {
    let at = audio.currentTime + 0.02;
    for (const [frequency, seconds, gap = 0.08] of list) {
      const tone = audio.createOscillator();
      const gain = audio.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.25, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
      tone.connect(gain).connect(audio.destination);
      tone.start(at);
      tone.stop(at + seconds + 0.02);
      at += seconds + gap;
    }
  } catch { /* no sound */ }
}
const buzz = (pattern) => { try { if (soundOn()) navigator.vibrate?.(pattern); } catch { /* no vibration */ } };
const sounds = {
  tick: () => tones([[660, 0.12]]),
  start: () => { tones([[990, 0.45]]); buzz(250); },
  stop: () => { tones([[520, 0.15], [520, 0.15]]); buzz([120, 80, 120]); },
  done: () => { tones([[660, 0.18], [880, 0.18], [1100, 0.4]]); buzz([200, 100, 200, 100, 300]); },
};
// The next exercise said aloud in the app's language as a pause starts, or "Right side" before the switch; muted by
// the same bell. Spoken a moment after the tones, so the two do not overlap.
function speak(text) {
  try {
    const synth = window.speechSynthesis;
    if (!soundOn() || !synth || !text) return;
    synth.cancel();
    const lang = state.language === "en" ? "en-GB" : "cs-CZ";
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = synth.getVoices().find((item) => item.lang?.replace("_", "-") === lang) ?? synth.getVoices().find((item) => item.lang?.startsWith(lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    setTimeout(() => synth.speak(utterance), 500);
  } catch { /* no speech */ }
}
const quiet = () => { try { window.speechSynthesis?.cancel(); } catch { /* no speech */ } };
function announce(coming) {
  if (!coming || coming.type !== "work") return;
  if (coming.side === 2) return speak(t("speakRight"));
  const { hold } = exercises[coming.id];
  // Two short sentences, as a coach would say them: "Next exercise: push-ups. 8 repeats." The name in lower case
  // inside the sentence, the side after it.
  const name = t(`recovery_${coming.id}`).toLocaleLowerCase();
  const side = coming.side === 1 ? `, ${t("recoverySide_1").toLocaleLowerCase()}` : "";
  const amount = coming.reps ? t("speakReps", { reps: coming.reps }) : t(hold ? "speakHold" : "speakMove", { seconds: coming.seconds });
  speak(`${t("speakNext", { name })}${side}. ${amount}.`);
}

// The change into the step now showing: a start into work, a stop out of it.
function cue(into) {
  if (into === "done") sounds.done();
  else if (into === "work") sounds.start();
  else sounds.stop();
}

function showStep() {
  const step = player.list[player.index];
  const work = step.type === "work";
  const id = work ? step.id : step.next;
  const dialog = byId("recoveryPlayer");
  dialog.classList.toggle("is-rest", !work);
  const position = [...new Set(player.list.filter((item) => item.type === "work").map((item) => item.id))];
  const rounds = Math.max(1, ...player.list.map((item) => item.round ?? 1));
  const progress = t("recoveryProgress", { current: position.indexOf(id) + 1, total: position.length });
  byId("recoveryPlayerProgress").textContent = rounds > 1 ? `${t("strengthRound", { round: step.round, rounds })} · ${progress}` : progress;
  const coming = player.list[player.index + 1];
  // In work the side, if any, and whether to hold or move.
  const mode = t(exercises[id].hold ? "recoveryModeHold" : "recoveryModeMove");
  const what = work && step.reps ? t("strengthReps", { reps: step.reps }) : mode;
  byId("recoveryPlayerPhase").textContent = work ? (step.side ? `${t(`recoverySide_${step.side}`)} · ${what}` : what) : coming?.side === 2 ? t("recoverySwitch") : coming?.side === 1 ? t("recoveryReadySide") : t("recoveryNext");
  byId("recoveryPlayerName").textContent = t(`recovery_${id}`);
  byId("recoveryPlayerHow").textContent = t(`recoveryHow_${id}`);
  const art = figures(id);
  byId("recoveryPlayerFigure").replaceChildren(...art);
  byId("recoveryPlayerFigure").classList.toggle("has-views", art.length > 1);
  byId("recoveryPlayerFigure").hidden = !art.length;
  // Repeats have no clock: their count shows and "done" ends them; the pause has nothing to stop then.
  const counted = work && step.reps;
  dialog.classList.toggle("is-reps", Boolean(counted));
  byId("recoveryPlayerSkip").textContent = t(counted ? "strengthDoneStep" : "recoverySkip");
  if (counted) {
    player.endsAt = Infinity;
    byId("recoveryPlayerClock").textContent = `${step.reps}×`;
    return;
  }
  if (!work) announce(coming);
  player.left = step.seconds;
  player.endsAt = Date.now() + step.seconds * 1000;
  player.ticked = null;
  tick();
}

// On to the next step, or the end.
function advance() {
  player.index += 1;
  if (player.index >= player.list.length) return finish();
  // Out of a rest into the next one (a side switched) is no stop: only work's ends are said.
  const from = player.list[player.index - 1]?.type;
  const into = player.list[player.index].type;
  if (into === "work") cue("work");
  else if (from === "work") cue("rest");
  showStep();
}

function tick() {
  if (player.paused || !player.list.length || player.list[player.index]?.reps) return;
  const left = Math.max(0, Math.ceil((player.endsAt - Date.now()) / 1000));
  byId("recoveryPlayerClock").textContent = formatDuration(left);
  // The last three seconds of a pause or a hold tick, once each.
  if (left > 0 && left <= 3 && player.ticked !== left) {
    player.ticked = left;
    sounds.tick();
  }
  if (left > 0) return;
  advance();
}

async function finish() {
  stop();
  cue("done");
  const dialog = byId("recoveryPlayer");
  dialog.classList.add("is-done");
  dialog.classList.remove("is-rest");
  byId("recoveryPlayerFigure").hidden = true;
  byId("recoveryPlayerProgress").textContent = "";
  byId("recoveryPlayerPhase").textContent = "";
  byId("recoveryPlayerName").textContent = t(player.doneKey);
  byId("recoveryPlayerHow").textContent = player.doneNote ?? "";
  byId("recoveryPlayerClock").textContent = "✓";
  byId("recoveryPlayerFinish").focus();
  await player.onDone?.();
}

function stop() {
  quiet();
  clearInterval(player.timer);
  player.timer = null;
  player.wakeLock?.release?.().catch?.(() => {});
  player.wakeLock = null;
}

// list: the steps to run; doneKey and doneNote what the end says; onDone what a set finished does.
// intro, when given ({ title, note, exercises: [{ id, seconds }] }), shows the set first, the steps starting on its button.
async function start(list, { doneKey = "recoveryDone", doneNote = "", onDone = null, intro = null } = {}) {
  Object.assign(player, { list, index: 0, paused: false, doneKey, doneNote, onDone });
  const dialog = byId("recoveryPlayer");
  dialog.classList.remove("is-done", "is-paused");
  byId("recoveryPlayerPause").textContent = t("recoveryPause");
  dialog.classList.toggle("is-intro", Boolean(intro));
  byId("recoveryPlayerIntro").hidden = !intro;
  if (intro) {
    byId("recoveryPlayerProgress").textContent = "";
    byId("recoveryPlayerIntroTitle").textContent = intro.title;
    byId("recoveryPlayerIntroNote").textContent = intro.note ?? "";
    byId("recoveryPlayerIntroList").replaceChildren(...intro.exercises.map(({ id, seconds, reps }) => {
      const item = element("li", "recovery-intro-item");
      const art = figure(id);
      const text = element("div", "recovery-text");
      text.append(nameLine(id), element("span", "recovery-dose", dose(id, seconds, reps)));
      item.append(...(art ? [art] : []), text);
      return item;
    }));
    dialog.showModal();
    byId("recoveryPlayerStart").focus();
    return;
  }
  dialog.showModal();
  run();
}

// From the intro's button, or straight away: the steps and their clock.
async function run() {
  openAudio();
  // iOS speaks only once speech has started from a tap: an empty line now opens it for the set.
  try { if (soundOn()) window.speechSynthesis?.speak(new SpeechSynthesisUtterance("")); } catch { /* no speech */ }
  const dialog = byId("recoveryPlayer");
  dialog.classList.remove("is-intro");
  byId("recoveryPlayerIntro").hidden = true;
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
    advance();
  });
  byId("recoveryPlayerClose").addEventListener("click", () => dialog.close());
  // The bell: sounds and vibration on or off, remembered.
  const bell = byId("recoveryPlayerSound");
  const showBell = () => {
    bell.setAttribute("aria-pressed", String(soundOn()));
    bell.textContent = soundOn() ? "🔔" : "🔕";
    bell.title = t(soundOn() ? "playerSoundOn" : "playerSoundOff");
    bell.setAttribute("aria-label", bell.title);
  };
  showBell();
  bell.addEventListener("click", () => {
    saveDefaults({ playerSound: !soundOn() });
    if (!soundOn()) quiet();
    openAudio();
    showBell();
    if (soundOn()) sounds.tick();
  });
  byId("recoveryPlayerStart").addEventListener("click", run);
  byId("recoveryPlayerFinish").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", stop);
}

// Shown for one rowing workout picked; hidden otherwise.
export function renderRecovery(picked, settings, onStretched = () => {}) {
  const card = byId("compareRecovery");
  const entry = picked.length === 1 && picked[0].sport === "rowing" ? picked[0] : null;
  card.hidden = !entry;
  if (!entry) return;
  wirePlayer();
  const plan = afterWorkout({ benefit: primaryBenefit(entry, settings)?.benefit ?? null, seconds: entry.summary.timerSeconds, day: new Date(entry.startMs).toISOString().slice(0, 10) });
  byId("compareRecoveryTitle").textContent = t("recoveryTitle", { minutes: plan.minutes });
  byId("compareRecoveryNote").textContent = t(plan.cooldown ? "recoveryCooldown" : `recoveryNote_${plan.set}`);
  const status = byId("compareRecoveryDone");
  const showStatus = () => {
    status.hidden = !entry.stretched;
    if (entry.stretched) status.textContent = t("recoveryDoneOn", { when: new Date(entry.stretched).toLocaleString(document.documentElement.lang || undefined, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) });
  };
  showStatus();
  const button = byId("compareRecoveryStart");
  // The button opens the set first, what is coming and for how long, and runs it from there.
  button.onclick = () => start(steps(plan.exercises), {
    intro: { title: t("recoveryTitle", { minutes: plan.minutes }), note: byId("compareRecoveryNote").textContent, exercises: plan.exercises.map((id) => ({ id })) },
    onDone: async () => {
      entry.stretched = Date.now();
      await saveEntries([entry]).catch(() => {});
      showStatus();
      onStretched();
    },
  });
}

// The warm-up before a rowing workout planned, for the Training tab's day: a button that opens the set in the same
// player and runs it from there, and what follows on the rower beside it.
export function warmupBlock(type, day = null) {
  wirePlayer();
  const plan = warmupBefore(type, day);
  const block = element("div", "warmup-block");
  const head = element("div", "warmup-head");
  const button = element("button", "outline-button warmup-button", t("warmupStart", { minutes: plan.minutes }));
  button.type = "button";
  const after = plan.onRower ? t("warmupRower", { minutes: plan.onRower }) : t("warmupRowerEasy");
  // The button opens the set first, what is coming and for how long, and runs it from there.
  button.addEventListener("click", () => start(steps(plan.exercises, { rest: warmupRest, seconds: plan.seconds }), {
    doneKey: "warmupDone",
    doneNote: after,
    intro: { title: t("warmupStart", { minutes: plan.minutes }), note: after, exercises: plan.exercises.map((id) => ({ id, seconds: plan.seconds[id] })) },
  }));
  head.append(button, element("span", "field-note warmup-note", after));
  block.append(head);
  return block;
}

// The catalogue of every exercise, from the gear's menu: the warm-up's moves and the stretches, each with its figure,
// time, how-to and the sets it is in.
export function setupExercises(beforeOpen = () => {}) {
  const dialog = byId("exercisesDialog");
  const item = (entry, setKey) => {
    const li = element("li", "recovery-item");
    const art = figures(entry.id);
    const text = element("div", "recovery-text");
    text.append(
      nameLine(entry.id),
      element("span", "recovery-dose", dose(entry.id, entry.seconds, entry.reps)),
      element("p", "", t(`recoveryHow_${entry.id}`)),
      element("span", "field-note exercises-sets", t("exercisesIn", { sets: entry.sets.map((set) => t(`${setKey}_${set}`)).join(", ") })),
    );
    const pictures = element("div", "recovery-views");
    pictures.append(...art);
    li.append(pictures, text);
    return li;
  };
  const render = () => {
    const catalog = exerciseCatalog();
    byId("exercisesWarmup").replaceChildren(...catalog.warmup.map((entry) => item(entry, "exercisesWarmupSet")));
    byId("exercisesStretch").replaceChildren(...catalog.stretch.map((entry) => item(entry, "exercisesStretchSet")));
    const level = strengthSession(strengthLevel(strengthLog(), new Date().toISOString().slice(0, 10)).steps);
    byId("exercisesStrength").replaceChildren(...level.doses.map((entry) => item({ ...entry, sets: ["week"] }, "exercisesStrengthSet")));
  };
  byId("exercisesButton").addEventListener("click", () => {
    beforeOpen();
    render();
    dialog.showModal();
    dialog.scrollTop = 0;
  });
  byId("exercisesClose").addEventListener("click", () => dialog.close());
}

// The days strength work was done, kept with the synced settings: { "YYYY-MM-DD": true }.
export const strengthLog = () => savedDefaults().strengthLog ?? {};

// The strength session for the Training tab's day, when today asks for one (twice a week, an easy day, not the
// goal's week): a button opening it in the player, how many this week; or that today's is done. null otherwise.
export function strengthBlock(today, { type = null, taper = null } = {}) {
  wirePlayer();
  const log = strengthLog();
  const state = strengthToday(log, today, { type, taper });
  if (state.rest === "today") return element("p", "training-today-done strength-done", t("strengthDoneToday"));
  if (!state.due) return null;
  const level = strengthLevel(log, today);
  const session = strengthSession(level.steps);
  const block = element("div", "warmup-block strength-block");
  const head = element("div", "warmup-head");
  const button = element("button", "outline-button warmup-button", t("strengthStart", { minutes: session.minutes }));
  button.type = "button";
  // After a break the dose comes down, and says so.
  const note = [t("strengthNote", { done: state.done, of: 2 }), ...(level.eased ? [t("strengthEased", { steps: level.eased })] : [])].join(" ");
  button.addEventListener("click", () => start(session.steps, {
    doneKey: "strengthDone",
    doneNote: t("strengthDoneNote"),
    intro: { title: t("strengthStart", { minutes: session.minutes }), note: t("strengthIntro", { rounds: session.rounds }), exercises: session.doses },
    onDone: () => {
      saveDefaults({ strengthLog: { ...strengthLog(), [today]: true } });
      window.dispatchEvent(new Event("settings-change"));
    },
  }));
  head.append(button, element("span", "field-note warmup-note", note));
  block.append(head);
  return block;
}
