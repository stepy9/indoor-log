import { test } from "node:test";
import assert from "node:assert/strict";
import { csvDay, parseGarminCsv } from "../src/garmin-csv.js";

test("a day is read in the latest year not after today", () => {
  assert.equal(csvDay("18 Lis", "2026-11-18"), "2026-11-18");
  assert.equal(csvDay("27 Srp", "2026-11-18"), "2026-08-27");
  assert.equal(csvDay("31 Pro", "2027-01-05"), "2026-12-31");
  assert.equal(csvDay("Nov 18", "2026-11-18"), "2026-11-18");
  assert.equal(csvDay("2026-10-21", "2026-11-18"), "2026-10-21");
  assert.equal(csvDay("Datum", "2026-11-18"), null);
});

test("the HRV status export gives the nights' HRV", () => {
  const text = "﻿Datum,Noční VST,Základní,7denní průměr\n18 Lis,70ms,69ms - 86ms,68ms\n17 Lis,--,69ms - 86ms,70ms\n";
  assert.deepEqual(parseGarminCsv(text, "2026-11-18"), { hrv: { "2026-11-18": 70 }, sleep: {}, restHeartRate: {}, skinTemp: {} });
});

test("the sleep export gives the sleep and the resting heart rate, not its 7-day HRV", () => {
  const text = "Skóre spánku 4 týdny,Skóre,Klidový srdeční tep,Body Battery,Pulzní oxymetr,Dýchání,Změna teploty pokožky,Stav VST,Kvalita,Trvání,Potřeba spánku,Spánek,Čas probuzení\n"
    + "2026-11-18,82,47,72,--,12.33,'+0.3°,68,Dobrý,7h 23min,8h 50min,22:41,6:59\n"
    + "2026-11-17,62,46,38,--,12.39,0°,70,Uspokojivý,4h 58min,7h 50min,0:58,6:25\n"
    + "2026-11-16,62,46,38,--,12.39,'-0.2°,70,Uspokojivý,4h 58min,7h 50min,0:58,6:25\n";
  const read = parseGarminCsv(text, "2026-11-18");
  assert.deepEqual(read.hrv, {});
  assert.equal(read.sleep["2026-11-18"], 7.38);
  assert.equal(read.restHeartRate["2026-11-18"], 47);
  assert.deepEqual(read.skinTemp, { "2026-11-18": 0.3, "2026-11-17": 0, "2026-11-16": -0.2 });
});

test("the resting heart rate export gives its days", () => {
  const text = "Datum,Klidový,Vysoká\n21 Říj,44 t/min.,145 t/min.\n";
  assert.deepEqual(parseGarminCsv(text, "2026-11-18").restHeartRate, { "2026-10-21": 44 });
});
