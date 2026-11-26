// How to breathe with each exercise, in one place. A move there and back gives the breath taken on the way into each
// of its two poses (pose 0 is where it starts): opening, reaching and lowering in, folding, turning deep and the
// effort out. Its spoken cue is recoveryBreath_<id> in i18n. A move with no phases here (one that alternates sides,
// circles or flutters) is said to breathe smoothly; a hold is paced calmly, in for 4 s and out for 6 s.
export const breathPhases = {
  // Warm-up and strength.
  catCow: ["in", "out"],
  openBook: ["out", "in"],
  pushUp: ["out", "in"],
  deadBug: ["in", "out"],
  lunge: ["out", "in"],
  bridge: ["in", "out"],
  hipHinge: ["out", "in"],
  squat: ["out", "in"],
  // Mobility (the book's 9.17–9.21 and beyond).
  lungeReach: ["in", "out"],
  hipSwitch: ["in", "out"],
  reverseTable: ["out", "in"],
  forearmOpen: ["out", "in"],
  archToHeels: ["in", "out"],
  threadNeedle: ["in", "out"],
  ankleRock: ["in", "out"],
  scapPushUp: ["in", "out"],
  inchworm: ["out", "in"],
  // Pilates, as its spoken cues have it.
  rollUp: ["in", "out"],
  rollingBall: ["out", "in"],
  doubleLegStretch: ["out", "in"],
  spineStretch: ["in", "out"],
  saw: ["in", "out"],
  sideKick: ["in", "out"],
  shoulderBridge: ["in", "out"],
  teaser: ["in", "out"],
  // Stabilization with the ball, muscle balance and the band and BOSU: out with the effort.
  ballLower: ["in", "out"],
  ballUpper: ["in", "out"],
  ballBoth: ["in", "out"],
  chop: ["in", "out"],
  kneelRow: ["in", "out"],
  bridgePress: ["in", "out"],
  sideLungeRaise: ["out", "in"],
  backLungePress: ["in", "out"],
  bandPullApart: ["in", "out"],
  bandRow: ["in", "out"],
  bandClamshell: ["in", "out"],
  bandRotation: ["in", "out"],
  bosuSquat: ["out", "in"],
  bosuLunge: ["out", "in"],
};

// The spoken cue for an exercise without its own (breathKind_<kind> in i18n): a hold that braces the trunk, a
// stretch held, or a move. null for the breathing exercises, which lead the breath themselves.
const braced = new Set(["plank", "sidePlank"]);
export function breathKind(id, exercise) {
  if (exercise.style === "breath") return null;
  if (exercise.hold) return braced.has(id) || ["stability", "gear"].includes(exercise.style) ? "brace" : "relax";
  return "flow";
}
