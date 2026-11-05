import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "vite";

// Every build gives the service worker a new version, so installed apps notice the update.
const stampServiceWorker = {
  name: "stamp-service-worker",
  apply: "build",
  writeBundle({ dir }) {
    const file = join(dir, "sw.js");
    writeFileSync(file, readFileSync(file, "utf8").replace("__BUILD__", Date.now().toString(36)));
  },
};

// The app's version as shown in it: the day it was built and the commit it was built from.
const commit = (() => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
})();
const version = [new Date().toISOString().slice(0, 10), commit].filter(Boolean).join(" · ");

// Relative paths let the build run from any folder, such as a GitHub Pages project site.
export default defineConfig({
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [stampServiceWorker],
});
