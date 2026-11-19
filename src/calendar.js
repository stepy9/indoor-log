// The planned training days as an iCalendar file (.ics): one event per day at the time chosen, as long as the day's
// workout takes, with a reminder an hour before. Each event's UID comes from its day and sport, so importing the
// plan again updates the events instead of adding new ones.

// How long each kind of day takes, in minutes, from the plan: the workout itself rounded up to 5 minutes, 15 at least.
export function plannedMinutes(plan, type) {
  const intervals = plan.intervals ?? {};
  const minutes = {
    usual: plan.usual?.minutes,
    long: plan.long?.minutes,
    // A warm-up and a cool-down round the repeats and their rests.
    intervals: 15 + (intervals.repeats ?? 0) * ((intervals.minutes ?? 0) + (intervals.rest ?? 0)),
    ftpTestShort: 30,
    ftpTest: 60,
    goal: plan.long?.minutes ?? 60,
    opener: Math.max(15, Math.round((plan.usual?.minutes ?? 30) / 2 / 5) * 5),
  }[type] ?? plan.usual?.minutes ?? 45;
  return Math.max(15, Math.ceil((Number(minutes) || 45) / 5) * 5);
}

// Text escaped for a property value (RFC 5545 3.3.11).
const escape = (text) => String(text).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines folded at 75 octets, continuations starting with a space (RFC 5545 3.1).
function fold(line) {
  const bytes = new TextEncoder();
  const parts = [];
  let current = "";
  for (const char of line) {
    if (bytes.encode(current + char).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

// "2026-11-20" and "18:30" (plus minutes) as a floating local time "20261120T183000": the calendar shows it at that
// hour wherever it is.
function localStamp(day, time, plusMinutes = 0) {
  const [hours, minutes] = time.split(":").map(Number);
  const date = new Date(Date.UTC(...day.split("-").map((part, index) => Number(part) - (index === 1 ? 1 : 0)), hours, minutes + plusMinutes));
  return date.toISOString().replace(/[-:]/g, "").slice(0, 15);
}

const utcStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// days: [{ day: "YYYY-MM-DD", type }]; time: "HH:MM"; title(type) and description(type) the events' texts;
// minutes(type) their length. now: the moment written as DTSTAMP.
export function planCalendar({ days, sport, time = "18:00", title, description = () => "", minutes, now = Date.now(), reminder = 60 }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Indoor log//Training plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const { day, type } of days) {
    const length = minutes(type);
    const text = description(type);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${day.replace(/-/g, "")}-${sport}@indoor-log`,
      `DTSTAMP:${utcStamp(now)}`,
      // A sequence that grows with each export, so a calendar takes the newer version of the same event.
      `SEQUENCE:${Math.floor(now / 1000)}`,
      `DTSTART:${localStamp(day, time)}`,
      `DTEND:${localStamp(day, time, length)}`,
      `SUMMARY:${escape(title(type))}`,
      ...(text ? [`DESCRIPTION:${escape(text)}`] : []),
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escape(title(type))}`,
      `TRIGGER:-PT${reminder}M`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
