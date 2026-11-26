// Making elements, the same way in every view: node with attributes (an SVG tag made in the SVG namespace),
// svgNode for SVG on its own, element with just a class. A text that is null, undefined or false leaves it empty; 0 shows.

export const svgNs = "http://www.w3.org/2000/svg";
const svgTags = new Set(["svg", "g", "line", "path", "rect", "circle", "polyline", "polygon", "text", "tspan"]);

function make(element, attributes, text) {
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text != null && text !== false) element.textContent = text;
  return element;
}

export const svgNode = (tag, attributes = {}, text) => make(document.createElementNS(svgNs, tag), attributes, text);

export const node = (tag, attributes = {}, text) =>
  make(svgTags.has(tag) ? document.createElementNS(svgNs, tag) : document.createElement(tag), attributes, text);

export const element = (tag, className = "", textContent = "") => Object.assign(document.createElement(tag), { className, textContent });

// Hands a file to the browser to save, as the FIT export and the backup do.
export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
