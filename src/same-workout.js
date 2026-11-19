// The same workout done again: the same name, ignoring case and spaces at the ends, or the same intervals,
// lap by lap of the same type and a length within 5 s or 5 % of each other. And how it went each time before,
// to see the progress where it is clearest: the same work at a lower heart rate, or more power at the same one.

export const sameName = (a, b) => Boolean(a.name?.trim()) && a.name.trim().toLowerCase() === b.name?.trim().toLowerCase();

const lapSeconds = (laps, index, entry) => ((laps[index + 1]?.startMs ?? laps[index].endMs ?? entry.startMs + entry.records.seconds.at(-1) * 1000) - laps[index].startMs) / 1000;

export function sameIntervals(a, b) {
  const lapsA = a.laps ?? [];
  const lapsB = b.laps ?? [];
  if (lapsA.length < 2 || lapsA.length !== lapsB.length) return false;
  if (!lapsA.some((lap) => lap.intensity && lap.intensity !== "active")) return false;
  return lapsA.every((lap, index) => {
    if ((lap.intensity ?? "active") !== (lapsB[index].intensity ?? "active")) return false;
    const secondsA = lapSeconds(lapsA, index, a);
    const secondsB = lapSeconds(lapsB, index, b);
    return Math.abs(secondsA - secondsB) <= Math.max(5, Math.max(secondsA, secondsB) * 0.05);
  });
}

export const sameWorkout = (a, b) => a.sport === b.sport && (sameName(a, b) || sameIntervals(a, b));

// One time through: the averages and the power per beat (W/bpm), null where the watch or trainer gave none.
function result(entry) {
  const power = entry.summary?.avgPower > 0 ? entry.summary.avgPower : null;
  const heartRate = entry.summary?.avgHeartRate > 0 ? entry.summary.avgHeartRate : null;
  return { entry, power, heartRate, efficiency: power && heartRate ? power / heartRate : null, seconds: entry.summary?.timerSeconds ?? 0 };
}

// The workout given and the times it was done before, newest first, up to limit of them; each with its change
// against the one given: power and heart rate in their units, the power per beat in per cent.
// { current, earlier: [{ ...result, power, heartRate, efficiency, change: { power, heartRate, efficiency } }] }
export function sameWorkoutHistory(entry, entries, limit = 8) {
  const current = result(entry);
  const delta = (now, then) => (now != null && then != null ? now - then : null);
  const earlier = entries
    .filter((other) => other.id !== entry.id && other.startMs < entry.startMs && sameWorkout(other, entry))
    .sort((a, b) => b.startMs - a.startMs)
    .slice(0, limit)
    .map((other) => {
      const before = result(other);
      return {
        ...before,
        change: {
          power: delta(current.power, before.power),
          heartRate: delta(current.heartRate, before.heartRate),
          efficiency: current.efficiency && before.efficiency ? ((current.efficiency - before.efficiency) / before.efficiency) * 100 : null,
        },
      };
    });
  return { current, earlier };
}
