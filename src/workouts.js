// Picking workouts the same way for the plan and for how the training went.
import { addDays } from "./dates.js";

// The workouts of the week starting on monday.
export const weekOf = (workouts, monday) => workouts.filter((workout) => workout.day >= monday && workout.day < addDays(monday, 7));

// An interval workout as the plan counts one: an FTP test is not one, whatever its kind.
export const isIntervalSession = (workout) => workout.kind === "intervals" && !workout.ftpTest;
