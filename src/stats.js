// Averages every module takes: the mean and the median of a list of numbers, null for an empty list.

export const mean = (list) => (list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null);

// The middle value, or the mean of the two middle ones for an even count.
export function median(list) {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
