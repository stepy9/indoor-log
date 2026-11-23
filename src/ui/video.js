// A book video played inside the app, in a dialog over whatever is open, so YouTube itself never opens. Closing it
// stops the video (the frame is emptied).
import { embedUrl, videoOf } from "../book-videos.js";
import { byId, t } from "./context.js";

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  const dialog = byId("videoDialog");
  byId("videoClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { byId("videoFrame").src = "about:blank"; });
}

export function openVideo(book) {
  const id = videoOf(book);
  if (!id) return;
  wire();
  byId("videoTitle").textContent = t("routineBook", { video: book });
  byId("videoFrame").src = embedUrl(id);
  byId("videoDialog").showModal();
}

// A button playing the exercise's video, or null when the book has none for it.
export function videoButton(book, onOpen = () => {}) {
  if (!videoOf(book)) return null;
  const button = Object.assign(document.createElement("button"), { type: "button", className: "outline-button video-button", textContent: `▶ ${t("videoPlay", { video: book })}` });
  button.addEventListener("click", () => { onOpen(); openVideo(book); });
  return button;
}
