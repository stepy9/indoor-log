import assert from "node:assert/strict";
import test from "node:test";
import { busiestBand, strokeDistance } from "../src/technique.js";

// A row second by second: each part [seconds, speed m/s, stroke rate].
function row(parts) {
  const records = { seconds: [], speed: [], cadence: [] };
  let second = 0;
  for (const [length, speed, cadence] of parts) {
    for (let index = 0; index < length; index += 1) {
      records.seconds.push(second);
      records.speed.push(speed);
      records.cadence.push(cadence);
      second += 1;
    }
  }
  return { records };
}

test("strokeDistance gives speed × 60 / rate within the band, after the first ten minutes", () => {
  // Ten minutes at 21 SPM and a fast speed, left out; then 5 minutes at 21 SPM and 4 m/s: 4 × 60 / 21 m a stroke.
  const result = strokeDistance(row([[600, 5, 21], [300, 4, 21]]), [20, 22]);
  assert.ok(Math.abs(result.metersPerStroke - (4 * 60) / 21) < 0.01, String(result.metersPerStroke));
  assert.equal(result.seconds, 300);
});

test("strokeDistance weighs each stroke rate by its strokes", () => {
  const result = strokeDistance(row([[600, 4, 20], [200, 4, 20], [200, 4.4, 21.9]]), [20, 22]);
  // 1680 m over 200 × 20/60 + 200 × 21.9/60 strokes.
  const expected = (200 * 4 + 200 * 4.4) / ((200 * 20 + 200 * 21.9) / 60);
  assert.ok(Math.abs(result.metersPerStroke - expected) < 0.01);
});

test("strokeDistance needs two minutes in the band and leaves out stops", () => {
  assert.equal(strokeDistance(row([[600, 4, 21], [100, 4, 21], [400, 4, 25]]), [20, 22]), null);
  assert.equal(strokeDistance(row([[600, 4, 21], [300, 0, 21]]), [20, 22]), null);
  assert.equal(strokeDistance({ records: {} }, [20, 22]), null);
});

test("busiestBand picks the band rowed in most", () => {
  const entries = [row([[600, 4, 21], [300, 4, 23]]), row([[600, 4, 21], [200, 4, 23], [400, 4, 19]])];
  assert.deepEqual(busiestBand(entries), [22, 24]);
  assert.deepEqual(busiestBand([]), [18, 20]);
});
