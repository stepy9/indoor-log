import { addDays } from "./diary.js";

// How regular the training has been over the last weeks, Monday to Sunday: the workouts, how many of them were
// stretched after, the strength sessions against their aim, and the run of weeks kept.
// A week is kept with at least one workout, most of its workouts stretched and the strength sessions aimed at.
// Stretching and strength count only from the first time each was done: the weeks before had no such feature, so
// they are judged by the workouts alone and show no stretching or strength at all.

const mondayOf = (key) => addDays(key, -((new Date(`${key}T12:00:00Z`).getUTCDay() + 6) % 7));

// workouts: [{ day: "YYYY-MM-DD", stretched: boolean }]; strengthDays: ["YYYY-MM-DD"]; today: "YYYY-MM-DD".
// The first stretch is the earliest workout stretched; the first strength the earliest day logged; without one, today.
// { weeks: [{ monday, workouts, stretched, strength, stretchTracked, strengthTracked, kept, running }] oldest first,
// streak, totals: { workouts, stretchable (workouts since stretching began), stretched, strength, strengthGoal, kept } }
export function regularity({ workouts, strengthDays, today, count = 8, strengthGoal = 2 }) {
  const thisMonday = mondayOf(today);
  const past = workouts.filter((workout) => workout.day <= today);
  const stretchSince = past.filter((workout) => workout.stretched).map((workout) => workout.day).sort()[0] ?? today;
  const strengthSince = strengthDays.filter((day) => day <= today).sort()[0] ?? today;
  const weeks = Array.from({ length: count }, (_, index) => ({ monday: addDays(thisMonday, (index - count + 1) * 7), workouts: 0, stretchable: 0, stretched: 0, strength: 0 }));
  const byMonday = new Map(weeks.map((week) => [week.monday, week]));
  for (const workout of workouts) {
    const week = byMonday.get(mondayOf(workout.day));
    if (!week || workout.day > today) continue;
    week.workouts += 1;
    if (workout.day >= stretchSince) week.stretchable += 1;
    if (workout.stretched) week.stretched += 1;
  }
  for (const day of new Set(strengthDays)) {
    const week = byMonday.get(mondayOf(day));
    if (week && day <= today) week.strength += 1;
  }
  for (const week of weeks) {
    week.running = week.monday === thisMonday;
    week.stretchTracked = addDays(week.monday, 6) >= stretchSince;
    week.strengthTracked = addDays(week.monday, 6) >= strengthSince;
    week.kept = week.workouts > 0 && (!week.stretchTracked || week.stretched * 2 >= week.stretchable) && (!week.strengthTracked || week.strength >= strengthGoal);
  }
  // The run back from the last week gone by, the running week added once it is kept.
  let streak = weeks.at(-1).kept ? 1 : 0;
  for (let index = weeks.length - 2; index >= 0 && weeks[index].kept; index -= 1) streak += 1;
  const sum = (key) => weeks.reduce((total, week) => total + week[key], 0);
  return { weeks, streak, strengthGoal, totals: { workouts: sum("workouts"), stretchable: sum("stretchable"), strengthGoal: strengthGoal * weeks.filter((week) => week.strengthTracked).length, stretched: sum("stretched"), strength: sum("strength"), kept: weeks.filter((week) => week.kept).length } };
}
