import assert from "node:assert/strict";
import test from "node:test";
import { criticalPower, ftpSuggestion, ftpTimeline, forSport, activityLoad, decoupling, estimateFtp, estimateMaxHeartRate, formState, freshInDays, heartRateLoad, loadHistory, normalizedPower, powerCurve, timeInZones } from "../src/fitness.js";

// A steady workout at 1 Hz: power and heart rate from the functions given, each of the second.
function entry({ minutes = 60, power = () => 200, heartRate = () => 150, startMs = Date.UTC(2026, 9, 1, 8), sport = "cycling", laps = [] } = {}) {
  const seconds = Array.from({ length: minutes * 60 + 1 }, (_, index) => index);
  return {
    sport, startMs, laps,
    summary: { timerSeconds: minutes * 60, maxHeartRate: Math.max(...seconds.map(heartRate)) },
    records: {
      seconds,
      power: seconds.map(power),
      heartRate: seconds.map(heartRate),
      speed: seconds.map(() => 8),
      cadence: seconds.map(() => null),
      distance: seconds.map((second) => second * 8),
    },
  };
}

test("normalized power equals steady power and rises above the mean for surges", () => {
  assert.ok(Math.abs(normalizedPower(entry()) - 200) < 0.5);
  const surges = normalizedPower(entry({ power: (second) => (Math.floor(second / 60) % 2 ? 300 : 100) }));
  assert.ok(surges > 230, `got ${surges}`);
});

test("an hour at FTP makes a load of 100, from power before heart rate", () => {
  const result = activityLoad(entry(), { ftp: { cycling: 200 }, maxHeartRate: 190, restHeartRate: 50 });
  assert.equal(result.by, "power");
  assert.ok(Math.abs(result.load - 100) < 1);
  assert.ok(Math.abs(result.intensity - 1) < 0.01);
});

test("without an FTP the load comes from the heart rate, an hour at threshold making 100", () => {
  const settings = { maxHeartRate: 200, restHeartRate: 50 };
  const atThreshold = entry({ heartRate: () => 50 + 0.88 * 150 });
  const result = activityLoad(atThreshold, settings);
  assert.equal(result.by, "heartRate");
  assert.ok(Math.abs(result.load - 100) < 1);
  assert.ok(heartRateLoad(entry({ heartRate: () => 120 }), settings) < 50);
  assert.equal(activityLoad(entry({ heartRate: () => null, power: () => null }), settings), null);
});

test("fitness builds slowly and fatigue fast, and form is yesterday's difference", () => {
  const settings = { ftp: { cycling: 200 } };
  const entries = Array.from({ length: 7 }, (_, day) => entry({ startMs: Date.UTC(2026, 9, 1 + day, 8) }));
  const days = loadHistory(entries, settings, "UTC", "2026-10-10");
  assert.equal(days[0].day, "2026-10-01");
  assert.equal(days.length, 10);
  assert.equal(days[0].form, 0);
  const week = days[6];
  assert.ok(week.fatigue > week.fitness);
  assert.ok(days[7].form < 0);
  assert.ok(days[9].fatigue < week.fatigue);
  assert.equal(formState(20), "fresh");
  assert.equal(formState(-20), "productive");
  assert.equal(formState(-40), "overreaching");
});

test("time in zones counts seconds against the maximum heart rate or the FTP", () => {
  const halves = entry({ minutes: 10, heartRate: (second) => (second <= 300 ? 110 : 175), power: (second) => (second <= 300 ? 100 : 220) });
  const heart = timeInZones([halves], "heartRate", { maxHeartRate: 200 });
  assert.deepEqual(heart, [300, 0, 0, 300, 0]);
  const power = timeInZones([halves], "power", { ftp: { cycling: 200 } });
  assert.deepEqual(power, [300, 0, 0, 0, 300, 0]);
});

test("the power curve keeps each duration's best and the FTP is 95 % of 20 minutes", () => {
  const easy = entry({ power: () => 180 });
  const hard = entry({ minutes: 25, power: (second) => (second <= 60 ? 400 : 240) });
  const curve = powerCurve([easy, hard]);
  assert.equal(curve.find((point) => point.duration === 60).value, 400);
  assert.equal(curve.find((point) => point.duration === 3600).value, 180);
  assert.equal(curve.find((point) => point.duration === 3600).entry, easy);
  assert.equal(estimateFtp([easy]), 171);
  assert.equal(estimateMaxHeartRate([entry({ heartRate: () => 181 }), entry({ heartRate: () => 240 })]), 181);
});

test("decoupling compares output per heartbeat of a steady workout's halves after the warm-up", () => {
  const drifting = entry({ heartRate: (second) => 140 + (second / 3600) * 20 });
  const result = decoupling(drifting);
  assert.equal(result.by, "power");
  assert.ok(result.percent > 4 && result.percent < 8, `got ${result.percent}`);
  assert.ok(Math.abs(decoupling(entry()).percent) < 0.01);
  assert.ok(decoupling(entry()).efficiency > 0);
  assert.equal(decoupling(entry({ minutes: 25 })), null);
});

test("each sport keeps its own thresholds and zones, falling back to older settings", () => {
  const settings = { restHeartRate: 50, maxHeartRate: 190, ftp: { rowing: 180 }, sports: { cycling: { maxHeartRate: 200, ftp: 220, heartRateZones: [0, 0.5, 0.65, 0.8, 0.95] } } };
  const ride = entry({ minutes: 10, heartRate: () => 120 });
  assert.deepEqual(timeInZones([ride], "heartRate", settings), [0, 600, 0, 0, 0]);
  const row = { ...ride, sport: "rowing" };
  assert.deepEqual(timeInZones([row], "heartRate", settings), [0, 0, 0, 0, 0].map((_, index) => (index === 1 ? 600 : 0)));
  assert.equal(activityLoad(entry({ power: () => 220 }), settings).by, "power");
  assert.ok(Math.abs(activityLoad(entry({ power: () => 220 }), settings).load - 100) < 1);
  const broken = { sports: { cycling: { maxHeartRate: 200, heartRateZones: [0, 0.9, 0.5, 0.8, 0.95] } } };
  assert.deepEqual(timeInZones([ride], "heartRate", broken), [0, 600, 0, 0, 0]);
});

test("heart rate zones count from the maximum or from the reserve above the resting heart rate", () => {
  const ride = entry({ minutes: 10, heartRate: () => 140 });
  const byMax = { restHeartRate: 60, sports: { cycling: { maxHeartRate: 200 } } };
  assert.deepEqual(timeInZones([ride], "heartRate", byMax), [0, 0, 600, 0, 0]);
  const byReserve = { restHeartRate: 60, sports: { cycling: { maxHeartRate: 200, heartRateBasis: "reserve" } } };
  assert.deepEqual(timeInZones([ride], "heartRate", byReserve), [600, 0, 0, 0, 0]);
});

test("each activity counts with the FTP of its day, from the history or else the estimate up to then", () => {
  const day = (date) => Date.UTC(2026, 9, date, 8);
  const settings = { sports: { cycling: { ftpHistory: [{ from: "2026-10-10", ftp: 250 }, { from: null, ftp: 200 }] } } };
  const early = entry({ startMs: day(5), power: () => 200 });
  const late = entry({ startMs: day(12), power: () => 250 });
  assert.ok(Math.abs(activityLoad(early, settings).load - 100) < 1);
  assert.ok(Math.abs(activityLoad(late, settings).load - 100) < 1);

  const tests = [entry({ startMs: day(1), minutes: 25, power: () => 200 }), entry({ startMs: day(20), minutes: 25, power: () => 240 }), entry({ startMs: day(25), minutes: 25, power: () => 100 })];
  const timeline = ftpTimeline(tests).cycling;
  assert.deepEqual(timeline.map((point) => point.ftp), [190, 228, 228]);
  const estimated = { estimatedFtp: { cycling: timeline } };
  assert.equal(forSport(estimated, "cycling", day(10)).ftp, 190);
  assert.equal(forSport(estimated, "cycling", day(22)).ftp, 228);
  assert.equal(forSport(estimated, "cycling", Date.UTC(2026, 8, 1)).ftp, null);
});

test("critical power comes from three or more all-out efforts up to 20 minutes", () => {
  // 300 W for 20 minutes and a reserve of 20 kJ: P(t) = 300 + 20000 / t.
  const efforts = Object.fromEntries([180, 300, 600, 1200].map((t) => [t, 300 + 20000 / t]));
  const model = criticalPower(efforts);
  assert.ok(Math.abs(model.cp - 300) < 0.5);
  assert.ok(Math.abs(model.wPrime - 20000) < 50);
  assert.equal(criticalPower({ 180: 400, 300: 350 }), null);
  assert.equal(criticalPower({ 180: 300, 300: 300, 600: 300 }), null);
});

test("a typed FTP gets a suggestion once a later estimate beats it", () => {
  const day = (date) => Date.UTC(2026, 9, date, 8);
  const ride = entry({ startMs: day(20), minutes: 25, power: () => 240 });
  const settings = { timeZone: "UTC", sports: { cycling: { ftpHistory: [{ from: "2026-10-01", ftp: 200 }] } }, estimatedFtp: ftpTimeline([ride]) };
  assert.deepEqual({ ...ftpSuggestion(settings, "cycling", day(25)), entry: null }, { ftp: 228, from: "2026-10-20", entry: null });
  const higher = { ...settings, sports: { cycling: { ftpHistory: [{ from: "2026-10-01", ftp: 230 }] } } };
  assert.equal(ftpSuggestion(higher, "cycling", day(25)), null);
  assert.equal(ftpSuggestion({ ...settings, sports: {} }, "cycling", day(25)), null);
});

test("freshInDays counts the days of rest until the form is above +15", () => {
  assert.equal(freshInDays([]), null);
  assert.equal(freshInDays([{ day: "2026-11-04", fitness: 40, fatigue: 20 }]), 1);
  const days = freshInDays([{ day: "2026-11-04", fitness: 50, fatigue: 70 }]);
  assert.ok(days > 1 && days < 20);
  assert.equal(freshInDays([{ day: "2026-11-04", fitness: 0, fatigue: 0 }]), null);
  assert.equal(freshInDays([{ day: "2026-11-04", fitness: 7, fatigue: 17 }]), null);
  assert.ok(freshInDays([{ day: "2026-11-04", fitness: 7, fatigue: 17 }], 0) > 1);
});
