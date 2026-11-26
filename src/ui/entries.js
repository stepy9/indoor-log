// The library's activities as the views read them: an unavailable library (a private window) reads as empty.
import { listEntries } from "../library.js";
import { withCleanHeartRate } from "../fitness.js";

export const allEntries = () => listEntries().catch(() => []);

// With heart rate outside what a body does left out, as every chart and table takes them.
export const cleanEntries = async () => (await allEntries()).map(withCleanHeartRate);
