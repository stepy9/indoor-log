import { addDays } from "./diary.js";

// The CSV files Garmin Connect exports from its health reports (HRV status, sleep, resting heart rate), read for
// the values the app keeps day by day: { hrv, sleep, restHeartRate, skinTemp }, each { "YYYY-MM-DD": value }.
// Each column is told by its header, in Czech or English; the other columns are left out.

const columns = [
  { key: "hrv", match: /^(noční vst|overnight hrv)$/i },
  { key: "sleep", match: /^(trvání|duration)$/i },
  { key: "restHeartRate", match: /^(klidový srdeční tep|klidový|resting heart rate|resting)$/i },
  { key: "skinTemp", match: /^(změna teploty pokožky|skin temp(erature)? change)$/i },
];

const months = {
  led: 1, úno: 2, bře: 3, dub: 4, kvě: 5, čvn: 6, čvc: 7, srp: 8, zář: 9, říj: 10, lis: 11, pro: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = (number) => String(number).padStart(2, "0");

// The day of a cell: "2026-11-18" as it is, "18 Lis" or "Nov 18" in the latest year not after today.
export function csvDay(text, today) {
  const cell = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(cell)) return cell;
  const parts = cell.toLowerCase().match(/^(\d{1,2})\.?\s+(\p{L}+)\.?$/u) ?? cell.toLowerCase().match(/^(\p{L}+)\.?\s+(\d{1,2})$/u)?.slice(0, 3).reverse();
  if (!parts) return null;
  const [, dayText, monthText] = cell.match(/^\d/) ? parts : [null, parts[0], parts[1]];
  const month = months[monthText.slice(0, 3)];
  if (!month) return null;
  const year = Number(today.slice(0, 4));
  const day = `${year}-${pad(month)}-${pad(Number(dayText))}`;
  return day > today ? `${year - 1}${day.slice(4)}` : day;
}

// A value of a column: a number with or without its unit ("70ms", "47"), the sleep's "7h 23min" in hours.
function cellValue(key, text) {
  const cell = text.trim();
  // The skin's temperature as its change, "'+0.3°", "0°" or "'-0.2°", in °C.
  if (key === "skinTemp") {
    const number = parseFloat(cell.replace(/^'/, "").replace("°", "").replace(",", "."));
    return Number.isFinite(number) && Math.abs(number) < 5 ? number : null;
  }
  if (key === "sleep") {
    const parts = cell.match(/^(\d+)\s*h(?:\s*(\d+)\s*min)?$/i);
    return parts ? Math.round((Number(parts[1]) + Number(parts[2] ?? 0) / 60) * 100) / 100 : null;
  }
  const number = parseFloat(cell.replace(",", "."));
  return Number.isFinite(number) && number > 0 ? number : null;
}

// A line split by commas, quoted cells kept whole.
function splitLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (const char of line) {
    if (char === "\"") quoted = !quoted;
    else if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  return [...cells, cell];
}

export function parseGarminCsv(text, today) {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim());
  const result = { hrv: {}, sleep: {}, restHeartRate: {}, skinTemp: {} };
  if (lines.length < 2) return result;
  const header = splitLine(lines[0]).map((cell) => cell.trim());
  const found = columns.map((column) => ({ ...column, index: header.findIndex((name) => column.match.test(name)) })).filter((column) => column.index > 0);
  for (const line of lines.slice(1)) {
    const cells = splitLine(line);
    const day = csvDay(cells[0] ?? "", today);
    if (!day || day > today || day < addDays(today, -3660)) continue;
    for (const column of found) {
      const value = cellValue(column.key, cells[column.index] ?? "");
      if (value !== null) result[column.key][day] = value;
    }
  }
  return result;
}
