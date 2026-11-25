// A short note at the bottom of the page that something was saved, gone after a few seconds. One at a time: a new
// note replaces the one showing.
let current = null;

export function showToast(text, seconds = 3.5) {
  current?.remove();
  const toast = document.createElement("div");
  toast.className = "update-toast saved-toast";
  toast.setAttribute("role", "status");
  toast.textContent = `✓ ${text}`;
  document.body.append(toast);
  current = toast;
  setTimeout(() => {
    toast.classList.add("is-leaving");
    setTimeout(() => toast.remove(), 300);
  }, seconds * 1000);
}
