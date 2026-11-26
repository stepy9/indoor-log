// The players of the Training tab's day: the warm-up before a rowing workout, the stretching after it and the strength
// work, each exercise with its dose, how-to and, where it has one, a figure moving between its two poses in time with
// the breath. A button runs the set step by step, full screen on a phone: a countdown per exercise and side, a short
// rest between, and at the end the set is marked done.
import { dayMs } from "../dates.js";
import { element } from "./dom.js";
import { afterWorkout, sessionDetail, exerciseViews, exercises, steps, strengthLevel, strengthSession, strengthToday, warmupBefore, warmupRest } from "../recovery.js";
import { saveDefaults, savedDefaults, settingsChanged } from "./preferences.js";
import { breathCue, figureMarkup } from "../figure-svg.js";
import { breathKind } from "../breathing.js";
import { videoButton } from "./video.js";
import { primaryBenefit } from "../fitness.js";
import { saveEntries } from "../library.js";
import { byId, formatDuration, locale, state, t } from "./context.js";
import { showToast } from "./toast.js";



// One view drawn: the markup of figure-svg.js, made an element; cue: with the breath under it (the first view only).
function drawView(id, view, cue = true) {
  const holder = document.createElement("div");
  const { hold, breathing } = exercises[id];
  holder.innerHTML = figureMarkup(view, { hold: Boolean(hold), className: `recovery-figure is-${view.key}` });
  const svg = holder.firstElementChild;
  const breath = cue ? breathCue(view, { hold, breathing }) : null;
  if (!breath) return svg;
  // The figure with its breath under it as text, which keeps a readable size however small the figure is drawn;
  // two words taking turns by a CSS animation of the figure's own length, started with it.
  const box = element("div", "recovery-figure-box");
  const line = element("div", `breath-line is-${breath.split}`);
  line.style.setProperty("--breath-dur", breath.dur);
  for (const [phase, part] of [[breath.first, "first"], [breath.second, "second"]]) line.append(element("span", `breath-cue is-${phase} is-${part}`, `${phase === "in" ? "↑" : "↓"} ${t(phase === "in" ? "breathIn" : "breathOut")}`));
  box.append(svg, line);
  return box;
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
  return all.map((view, index) => {
    const box = Object.assign(document.createElement("figure"), { className: "recovery-view" });
    box.append(drawView(id, view, index === 0), Object.assign(document.createElement("figcaption"), { textContent: t(`recoveryView_${view.key}`) }));
    return box;
  });
}

// The time, said as a hold or as a move to repeat, and per side where it has two.
export function dose(id, seconds = exercises[id].seconds, reps = null) {
  const { sides, hold } = exercises[id];
  // A breathing exercise: just its length.
  if (exercises[id].pattern) return `${minutesText(seconds)} min`;
  // A long hold (yin's) in minutes.
  const time = reps ? t("strengthReps", { reps }) : hold && seconds >= 120 ? t("recoveryHoldForMinutes", { minutes: minutesText(seconds) }) : t(hold ? "recoveryHoldFor" : "recoveryMoveFor", { seconds });
  return sides > 1 ? `${time} ${t("recoveryEachSide")}` : time;
}

// Minutes as the app's language writes them, a half as ",5" in Czech.
export const minutesText = (seconds) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(seconds / 60);

// A tag saying whether to hold still or to move, beside the name.
export const nameLine = (id) => {
  const line = element("strong", "exercise-name", t(`recovery_${id}`));
  // How it is done, and the equipment it takes, as tags under the name.
  const tags = element("span", "exercise-tags");
  tags.append(modeTag(id));
  if (exercises[id].gear) tags.append(element("span", "exercise-mode is-gear", t(`routineGear_${exercises[id].gear}`)));
  line.append(" ", tags);
  return line;
};
const modeKind = (id) => (exercises[id].pattern ? "breath" : exercises[id].hold ? "hold" : "move");
const modeTag = (id) => element("span", `exercise-mode is-${modeKind(id)}`, t(`recoveryMode_${modeKind(id)}`));


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
    // iOS leaves the context interrupted after speech: wake it before each sound.
    if (audio.state !== "running") audio.resume();
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
// The line waiting to be said, cleared by a newer one or by the player stopping, so nothing is said after it closes.
let pendingSpeech = null;
function speak(text, delay = 500) {
  try {
    const synth = window.speechSynthesis;
    if (!soundOn() || !synth || !text) return;
    synth.cancel();
    const lang = locale();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    const voice = synth.getVoices().find((item) => item.lang?.replace("_", "-") === lang) ?? synth.getVoices().find((item) => item.lang?.startsWith(lang.slice(0, 2)));
    if (voice) utterance.voice = voice;
    clearTimeout(pendingSpeech);
    pendingSpeech = setTimeout(() => synth.speak(utterance), delay);
  } catch { /* no speech */ }
}
const quiet = () => {
  clearTimeout(pendingSpeech);
  try { window.speechSynthesis?.cancel(); } catch { /* no speech */ }
};
function announce(coming) {
  if (!coming || coming.type !== "work") return;
  if (coming.side === 2) return speak(t("speakRight"));
  const { hold } = exercises[coming.id];
  // Two short sentences, as a coach would say them: "Next exercise: push-ups. 8 repeats." The name in lower case
  // inside the sentence, the side after it.
  const name = t(`recovery_${coming.id}`).toLocaleLowerCase();
  const side = coming.side === 1 ? `, ${t("recoverySide_1").toLocaleLowerCase()}` : "";
  const amount = coming.reps ? t("speakReps", { reps: coming.reps }) : hold && coming.seconds >= 120 ? spokenMinutes(coming.seconds) : t(hold ? "speakHold" : "speakMove", { seconds: coming.seconds });
  // The first exercise of the last of several rounds says so first.
  const rounds = Math.max(1, ...player.list.map((item) => item.round ?? 1));
  const lastRound = rounds > 1 && coming.round === rounds && !player.list.slice(0, player.list.indexOf(coming)).some((item) => item.type === "work" && item.round === rounds);
  // How to breathe with it: its own cue, else one for its kind (none for the breathing exercises).
  const kind = breathKind(coming.id, exercises[coming.id]);
  const breath = exercises[coming.id].breath ? ` ${t(`recoveryBreath_${coming.id}`)}` : kind ? ` ${t(`breathKind_${kind}`)}` : "";
  speak(`${lastRound ? `${t("speakLastRound")} ` : ""}${t("speakNext", { name })}${side}. ${amount}.${breath}`);
}

// A long hold (yin's) said in minutes, as the screen shows it: "Výdrž dvě a půl minuty", "Hold for 3 minutes".
// Czech says the number as a word, so it agrees with "minuty" (2–4) or "minut" (5 on); a half reads "a půl minuty".
const czechNumbers = ["nula", "jedna", "dvě", "tři", "čtyři", "pět", "šest", "sedm", "osm", "devět", "deset"];
export function spokenMinutes(seconds, language = state.language) {
  const whole = Math.floor(seconds / 60);
  const half = seconds % 60 >= 30;
  const number = language === "en" ? String(whole) : (czechNumbers[whole] ?? String(whole));
  if (half) return t("speakHoldMinutesHalf", { minutes: number });
  return t(language !== "en" && whole >= 5 ? "speakHoldMinutesMany" : "speakHoldMinutesFew", { minutes: number });
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
  const mode = t(`recoveryMode_${modeKind(id)}`);
  const what = work && step.reps ? t("strengthReps", { reps: step.reps }) : mode;
  byId("recoveryPlayerPhase").textContent = work ? (step.side ? `${t(`recoverySide_${step.side}`)} · ${what}` : what) : coming?.side === 2 ? t("recoverySwitch") : coming?.side === 1 ? t("recoveryReadySide") : t("recoveryNext");
  byId("recoveryPlayerName").textContent = t(`recovery_${id}`);
  byId("recoveryPlayerHow").textContent = t(`recoveryHow_${id}`);
  // The book's video for the exercise, played in the app; the set pauses while it plays.
  const video = videoButton(exercises[id].book, () => { if (!player.paused) byId("recoveryPlayerPause").click(); });
  byId("recoveryPlayerVideo").replaceChildren(...(video ? [video] : []));
  byId("recoveryPlayerVideo").hidden = !video;
  const pacer = exercises[id].pattern ? [Object.assign(element("div", "breath-pacer"), { innerHTML: '<div class="breath-circle"></div>' })] : [];
  const art = pacer.length ? pacer : figures(id);
  player.breath = null;
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
  // The pause between rounds says so first and names the next exercise in its last ten seconds; any other pause
  // names it at once.
  player.roundPause = !work && step.seconds > 20;
  if (player.roundPause) {
    speak(t("speakRoundPause", { seconds: step.seconds }));
    byId("recoveryPlayerPhase").textContent = t("strengthRoundPause", { round: coming?.round ?? step.round });
  }
  else if (!work) announce(coming);
  player.left = step.seconds;
  player.endsAt = Date.now() + step.seconds * 1000;
  player.ticked = null;
  player.said = null;
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
  const step = player.list[player.index];
  if (step.type === "work" && exercises[step.id].pattern) breathe(step);
  // During a timed exercise of 30 s or more the voice says the half; once.
  if (player.said !== left) {
    if (step.type === "work" && step.seconds >= 30 && left === Math.ceil(step.seconds / 2)) speak(t("speakHalf"), 0);
    if (player.roundPause && left === 10) announce(player.list[player.index + 1]);
    player.said = left;
  }
  // The last three seconds of a pause or a timed exercise tick, once each; the change then sounds as the next step starts.
  if (left > 0 && left <= 3 && player.ticked !== left) {
    player.ticked = left;
    sounds.tick();
  }
  if (left > 0) return;
  advance();
}

// The breath's phase now: [phase, seconds] of the pattern, by the time gone in the step. A new phase sets the circle
// going to its size over the phase's time left (all of it, or what is left after a pause) and says it.
function breathe(step) {
  const { pattern } = exercises[step.id];
  const cycle = pattern.reduce((sum, [, seconds]) => sum + seconds, 0);
  const gone = Math.max(0, step.seconds - (player.endsAt - Date.now()) / 1000);
  let at = gone % cycle;
  let index = 0;
  while (index < pattern.length - 1 && at >= pattern[index][1]) at -= pattern[index++][1];
  const [phase, seconds] = pattern[index];
  byId("recoveryPlayerPhase").textContent = `${t(`breathPhase_${phase}`)} · ${Math.max(1, Math.ceil(seconds - at))}`;
  const key = `${Math.floor(gone / cycle)}:${index}`;
  if (player.breath === key) return;
  player.breath = key;
  const circle = byId("recoveryPlayerFigure").querySelector(".breath-circle");
  const size = { in: pattern.some(([name]) => name === "top") ? 0.82 : 1, top: 1, out: 0.4 }[phase];
  if (circle && size != null) {
    circle.style.transitionDuration = `${Math.max(0.2, seconds - at)}s`;
    circle.style.transform = `scale(${size})`;
  }
  circle?.setAttribute("data-phase", phase);
  // Each phase said as it starts, one short word, so it can be followed lying down with the eyes closed.
  if (at < 0.5) speak(t(`breathSay_${phase}`), 0);
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
  byId("recoveryPlayerVideo").hidden = true;
  byId("recoveryPlayerClock").textContent = "✓";
  byId("recoveryPlayerFinish").focus();
  // Anything the set asks at its end (how the stabilization went), under the tick.
  const after = byId("recoveryPlayerAfter");
  after.replaceChildren();
  player.after?.(after);
  after.hidden = !after.children.length;
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
// after, when given, fills a box on the end screen (holder) with whatever the set asks then.
async function start(list, { doneKey = "recoveryDone", doneNote = "", onDone = null, intro = null, after = null } = {}) {
  Object.assign(player, { list, index: 0, paused: false, doneKey, doneNote, onDone, after });
  byId("recoveryPlayerAfter").replaceChildren();
  byId("recoveryPlayerAfter").hidden = true;
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
    const circle = byId("recoveryPlayerFigure").querySelector(".breath-circle");
    if (circle && player.paused) Object.assign(circle.style, { transform: getComputedStyle(circle).transform, transitionDuration: "0s" });
    player.breath = null;
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
    bell.dataset.tip = t(soundOn() ? "playerSoundOn" : "playerSoundOff");
    bell.setAttribute("aria-label", bell.dataset.tip);
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

// Any set of steps in the player, straight away (the set already shown by whoever asks): for the sets put
// together on demand.
export function playSteps(list, options = {}) {
  wirePlayer();
  return start(list, options);
}

// The stretching after today's rowing workout, for the Training tab's day: the set picked by the workout's benefit
// and length behind a button, or, once done, a tick. entry: the last rowing workout of today.
export function stretchBlock(entry, settings) {
  wirePlayer();
  if (entry.stretched) return element("p", "training-today-done strength-done", t("recoveryDoneToday"));
  const plan = afterWorkout({ benefit: primaryBenefit(entry, settings)?.benefit ?? null, seconds: entry.summary.timerSeconds, day: new Date(entry.startMs).toISOString().slice(0, 10) });
  const note = t(plan.cooldown ? "recoveryCooldown" : `recoveryNote_${plan.set}`);
  const block = element("div", "warmup-block");
  const head = element("div", "warmup-head");
  const button = element("button", "outline-button warmup-button", t("stretchStart", { minutes: plan.minutes }));
  button.type = "button";
  // The button opens the set first, what is coming and for how long, and runs it from there.
  button.addEventListener("click", () => start(steps(plan.exercises), {
    intro: { title: t("recoveryTitle", { minutes: plan.minutes }), note, exercises: plan.exercises.map((id) => ({ id })) },
    onDone: async () => {
      entry.stretched = Date.now();
      // The exercises done, so the activity's detail lists the very set.
      entry.stretchedExercises = plan.exercises;
      await saveEntries([entry]).catch(() => {});
      settingsChanged();
      showToast(t("savedSession"));
    },
  }));
  head.append(button, element("span", "field-note warmup-note", note));
  block.append(head, element("p", "field-note", t("recoveryCaution")));
  return block;
}

// The warm-up before a rowing workout planned, for the Training tab's day: a button that opens the set in the same
// player and runs it from there, and what follows on the rower beside it.
export const warmupLog = () => savedDefaults().warmupLog ?? {};
export function warmupBlock(type, day = null, today = null) {
  wirePlayer();
  const plan = warmupBefore(type, day);
  // Today's warm-up done: a tick in place of the button.
  if (today && day === today && warmupLog()[today]) return element("p", "training-today-done strength-done", t("warmupDoneToday"));
  const block = element("div", "warmup-block");
  const head = element("div", "warmup-head");
  const button = element("button", "outline-button warmup-button", t("warmupStart", { minutes: plan.minutes }));
  button.type = "button";
  const after = plan.onRower ? t("warmupRower", { minutes: plan.onRower }) : t("warmupRowerEasy");
  // The button opens the set first, what is coming and for how long, and runs it from there.
  button.addEventListener("click", () => start(steps(plan.exercises, { rest: warmupRest, seconds: plan.seconds }), {
    doneKey: "warmupDone",
    doneNote: after,
    // Only today's warm-up is kept; one for a day ahead is a try.
    onDone: () => {
      if (!today || day !== today) return;
      // Kept to the last few weeks, so the synced settings do not grow.
      const since = new Date(Date.now() - 28 * dayMs).toISOString().slice(0, 10);
      // The day keeps the exercises done (true in logs from before), for the activity's detail.
      saveDefaults({ warmupLog: { ...Object.fromEntries(Object.entries(warmupLog()).filter(([key]) => key >= since)), [today]: plan.exercises } });
      settingsChanged();
      showToast(t("savedSession"));
    },
    intro: { title: t("warmupStart", { minutes: plan.minutes }), note: after, exercises: plan.exercises.map((id) => ({ id, seconds: plan.seconds[id] })) },
  }));
  head.append(button, element("span", "field-note warmup-note", after));
  block.append(head);
  return block;
}

// The catalogue is a tab of its own, as the others: the dialog opened without a backdrop and laid in the page's
// flow, the tab in the bar marked, a phone's header naming it.
let pageTitle = null;
export function openExercises() {
  const dialog = byId("exercisesDialog");
  if (dialog.open) { dialog.scrollTop = 0; window.scrollTo({ top: 0 }); return; }
  {
    const title = byId("topbarTitle");
    pageTitle = title.dataset.i18n;
    title.dataset.i18n = "exercisesTitle";
    title.textContent = t("exercisesTitle");
    byId("navExercisesButton")?.setAttribute("aria-pressed", "true");
    document.body.classList.add("is-exercises-page");
    dialog.show();
    window.scrollTo({ top: 0 });
  }
}

// The Exercises page: its sets and every exercise live in the Set panel (ui/routine.js); this opens and closes it.
export function setupExercises(beforeOpen = () => {}) {
  const dialog = byId("exercisesDialog");
  // On a phone the bottom bar's button opens it the same way.
  byId("navExercisesButton")?.addEventListener("click", () => byId("exercisesButton").click());
  byId("exercisesButton").addEventListener("click", () => {
    beforeOpen();
    openExercises();
  });
  byId("exercisesClose").addEventListener("click", () => dialog.close());
  // Leaving the page for another tab closes it; the page's marks go with it.
  for (const button of document.querySelectorAll("[data-app-view], #addButton")) {
    button.addEventListener("click", () => { if (dialog.open && !dialog.matches(":modal")) dialog.close(); });
  }
  dialog.addEventListener("close", () => {
    if (!document.body.classList.contains("is-exercises-page")) return;
    document.body.classList.remove("is-exercises-page");
    byId("navExercisesButton")?.setAttribute("aria-pressed", "false");
    if (pageTitle) {
      const title = byId("topbarTitle");
      title.dataset.i18n = pageTitle;
      title.textContent = t(pageTitle);
    }
  });
}

// The days strength work was done, kept with the synced settings: { "YYYY-MM-DD": true }.
export const strengthLog = () => savedDefaults().strengthLog ?? {};

// A day's strength session or warm-up as lines: each exercise with its repeats or time (per side where it has two).
// { rounds, lines } or null when not done that day.
export function sessionLines(kind, day) {
  const detail = sessionDetail(kind, (kind === "strength" ? strengthLog() : warmupLog())[day], day, strengthLog());
  if (!detail) return null;
  const dose = (item) => item.reps ? `${item.reps}×` : item.seconds ? `${item.seconds} s` : "";
  const lines = detail.items.map((item) => [t(`recovery_${item.id}`), [dose(item), item.sides > 1 && dose(item) ? t("sessionPerSide") : ""].filter(Boolean).join(" ")].filter(Boolean).join(" · "));
  return { rounds: detail.rounds, lines };
}

// The same for a tooltip: its title (with the rounds when more than one), then the exercises one a line.
export function sessionTip(kind, day) {
  const session = sessionLines(kind, day);
  if (!session) return "";
  const title = t(kind === "strength" ? "strengthDoneDay" : "warmupDone");
  return [session.rounds > 1 ? `${title} · ${t("sessionRounds", { rounds: session.rounds })}` : title, ...session.lines.map((line) => `· ${line}`)].join("\n");
}

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
      saveDefaults({ strengthLog: { ...strengthLog(), [today]: session.doses.map((dose) => dose.id) } });
      settingsChanged();
      showToast(t("savedSession"));
    },
  }));
  head.append(button, element("span", "field-note warmup-note", note));
  block.append(head);
  return block;
}
