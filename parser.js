/**
 * Custom markup in page .txt files:
 *   [img<filename.png>]     → <img> from img/ (or path as written if it contains /)
 *   [link<url>]             → hyperlink (https:// added if missing)
 *   [link<label|url>]       → hyperlink with custom label
 */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char];
  });
}

function normalizeUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return "#";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^mailto:/i.test(url)) return url;
  return `https://${url}`;
}

function resolveImageSrc(raw) {
  const path = String(raw || "").trim().replace(/^\/+/, "");
  if (!path) return "";
  if (path.startsWith("img/") || path.includes("/")) return path;
  return `img/${path}`;
}

function parseMarkup(text) {
  const pattern = /\[img<([^>\]]+)>\]|\[link<([^>\]]+)>\]/g;
  let html = "";
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    html += escapeHtml(text.slice(lastIndex, match.index));

    if (match[1] !== undefined) {
      const src = resolveImageSrc(match[1]);
      const safeSrc = escapeHtml(src);
      const name = src.split("/").pop() || "image";
      html += `<img src="${safeSrc}" alt="${escapeHtml(name)}" class="cover" />`;
    } else {
      const inside = String(match[2] || "").trim();
      let label;
      let url;
      const pipe = inside.indexOf("|");
      if (pipe === -1) {
        url = inside;
        label = inside;
      } else {
        label = inside.slice(0, pipe).trim();
        url = inside.slice(pipe + 1).trim();
      }
      const href = normalizeUrl(url);
      html += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    }

    lastIndex = pattern.lastIndex;
  }

  html += escapeHtml(text.slice(lastIndex));
  return html;
}

async function loadPageContent(pageName) {
  const el = document.getElementById("content");
  if (!el) return;

  const path = `data/${pageName}.txt`;

  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load ${path} (${response.status})`);
    }
    const text = await response.text();
    el.innerHTML = parseMarkup(text);
  } catch (error) {
    el.textContent = error.message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page) loadPageContent(page);
});
