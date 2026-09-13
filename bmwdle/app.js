const MAX = 7;
const KEYS = ["chassis", "series", "body", "engine", "fuel", "m"];
const LABELS = ["Chassis", "Series", "Body", "Engine", "Fuel", "M"];
const ROUND_KEY = "bmwdle-round-v3";
const STATS_KEY = "bmwdle-stats-v3";
const TIME_ZONE = "America/Los_Angeles";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const playEl = $("play");
const guessEl = $("guess");
const resultsEl = $("results");
const historyEl = $("history");
const revealEl = $("reveal");

let data, carsById, target, puzzle, results = [], status = "playing", active = 0;

function dayString(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayMs(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function puzzleInfo(now = new Date()) {
  const diff = Math.floor((dayMs(dayString(now)) - dayMs(data.start)) / 86400000);
  const n = Math.max(1, diff + 1);
  const idx = ((diff % data.order.length) + data.order.length) % data.order.length;
  return { n, car: carsById.get(data.order[idx]) || data.cars[0] };
}

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function search(q) {
  const query = norm(q);
  if (!query) return [];
  return data.cars
    .map((car) => {
      const hay = [car.name, car.chassis, car.model, car.series, car.engine, ...car.engines, ...car.aliases].map(norm);
      let score = 0;
      for (const h of hay) {
        if (h === query) score = Math.max(score, 100);
        else if (h.startsWith(query)) score = Math.max(score, 80);
        else if (h.includes(query)) score = Math.max(score, 60);
      }
      return { car, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.car.name.localeCompare(b.car.name))
    .slice(0, 8)
    .map((x) => x.car);
}

function firstLetter(a, b) {
  const x = a.trim().charAt(0).toUpperCase();
  const y = b.trim().charAt(0).toUpperCase();
  return Boolean(x) && x === y;
}

function family(code) {
  return data.families[code] || code;
}

function compare(guess, answer) {
  const attrs = {
    chassis: codeStatus(guess.chassis, answer.chassis),
    series: guess.series === answer.series ? "exact" : "wrong",
    body: guess.body.toLowerCase() === answer.body.toLowerCase() ? "exact" : "wrong",
    engine: engineStatus(guess, answer),
    fuel: guess.fuel === answer.fuel ? "exact" : "wrong",
    m: guess.mRaw === answer.mRaw ? "exact" : "wrong",
  };
  const values = {
    chassis: guess.chassis,
    series: guess.series,
    body: guess.body,
    engine: guess.engine,
    fuel: guess.fuel,
    m: guess.m,
  };
  return {
    car: guess,
    attrs,
    values,
    ok: guess.id === answer.id,
  };
}

function codeStatus(g, t) {
  if (g.toUpperCase() === t.toUpperCase()) return "exact";
  if (firstLetter(g, t)) return "close";
  return "wrong";
}

function engineStatus(guess, answer) {
  if (
    guess.engine.toUpperCase() === answer.engine.toUpperCase() ||
    family(guess.engine) === family(answer.engine)
  ) {
    return "exact";
  }
  if (firstLetter(guess.engine, answer.engine)) return "close";
  return "wrong";
}

function glyph(s) {
  return s === "exact" ? "#" : s === "close" ? "=" : ".";
}

function emoji(s) {
  return s === "exact" ? "🟩" : s === "close" ? "🟨" : "⬛";
}

function tone(s) {
  return s === "exact" ? "exact" : s === "close" ? "close" : "wrong";
}

function valueHtml(key, value, st, solved) {
  if (!solved && st === "close") {
    return `<span class="close">${value.charAt(0)}</span>${escapeHtml(value.slice(1))}`;
  }
  return escapeHtml(value);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function saveRound() {
  localStorage.setItem(
    ROUND_KEY,
    JSON.stringify({ puzzle, ids: results.map((r) => r.car.id), status }),
  );
}

function loadRound() {
  try {
    const raw = JSON.parse(localStorage.getItem(ROUND_KEY) || "null");
    if (!raw || raw.puzzle !== puzzle) return null;
    return raw;
  } catch {
    return null;
  }
}

function recordStats(won, used) {
  let stats;
  try {
    stats = JSON.parse(localStorage.getItem(STATS_KEY) || "null") || {};
  } catch {
    stats = {};
  }
  if (stats.last === puzzle) return;
  stats.played = (stats.played || 0) + 1;
  stats.last = puzzle;
  if (won) {
    stats.wins = (stats.wins || 0) + 1;
    const cont = stats.prev != null && puzzle === stats.prev + 1;
    stats.streak = cont ? (stats.streak || 0) + 1 : 1;
    stats.best = Math.max(stats.best || 0, stats.streak);
  } else {
    stats.streak = 0;
  }
  stats.prev = puzzle;
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function shareText() {
  const lines = results.map((r) =>
    KEYS.map((k) => emoji(r.ok ? "exact" : r.attrs[k])).join(""),
  );
  return [`BMWdle #${puzzle}`, "", ...lines, "", status === "won" ? `${results.length}/${MAX}` : `X/${MAX}`].join("\n");
}

function renderStatus() {
  const used = results.length;
  const show = status === "playing" ? used : used;
  statusEl.children[0].textContent = `#${puzzle}`;
  statusEl.children[1].textContent = `${show}/${MAX}`;
}

function renderResults(list) {
  if (!list.length) {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    return;
  }
  resultsEl.classList.remove("hidden");
  resultsEl.innerHTML = list
    .map(
      (car, i) =>
        `<li><button type="button" data-id="${car.id}" class="${i === active ? "active" : ""}"><span>${escapeHtml(car.name)}</span><span class="meta">${escapeHtml(car.chassis)} · ${escapeHtml(car.engine)}</span></button></li>`,
    )
    .join("");
}

function renderHistory() {
  if (!results.length) {
    historyEl.innerHTML = "";
    return;
  }
  const labels = `<div class="labels">${LABELS.map((l) => `<span>${l}</span>`).join("")}</div>`;
  const rows = results
    .map((r) => {
      const cells = KEYS.map((k) => {
        const st = r.ok ? "exact" : r.attrs[k];
        return `<div class="pip ${st === "exact" ? "exact" : ""}">${valueHtml(k, r.values[k], st, r.ok)}</div>`;
      }).join("");
      return `<article><div class="row-name${r.ok ? " ok" : ""}"><strong>${escapeHtml(r.car.name)}</strong></div><div class="strip">${cells}</div></article>`;
    })
    .join("");
  historyEl.innerHTML = labels + rows;
}

function renderReveal() {
  if (status === "playing") {
    revealEl.classList.add("hidden");
    playEl.classList.remove("hidden");
    return;
  }
  playEl.classList.add("hidden");
  revealEl.classList.remove("hidden");
  const score = status === "won" ? `${results.length}/${MAX}` : `X/${MAX}`;
  const grid = results
    .map((r) => {
      const cells = KEYS.map((k) => {
        const st = r.ok ? "exact" : r.attrs[k];
        return `<span class="${tone(st)}">${glyph(st)}</span>`;
      }).join("");
      return `<div>${cells}</div>`;
    })
    .join("");
  revealEl.innerHTML = `
    <p class="score">${score}</p>
    <h2>${escapeHtml(target.name)}</h2>
    <p class="sub">${escapeHtml(target.chassis)} · ${escapeHtml(target.engine)} · ${target.years[0]}-${target.years[1]}</p>
    <p>${escapeHtml(target.trivia)}</p>
    <div class="share">
      <div class="grid">${grid}</div>
      <button type="button" id="share">[share]</button>
    </div>`;
  $("share").onclick = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      $("share").textContent = "[copied]";
      setTimeout(() => ($("share").textContent = "[share]"), 1500);
    } catch {}
  };
}

function pick(car) {
  if (status !== "playing") return;
  if (results.some((r) => r.car.id === car.id)) return;
  const result = compare(car, target);
  results.push(result);
  if (result.ok) status = "won";
  else if (results.length >= MAX) status = "lost";
  saveRound();
  if (status !== "playing") recordStats(status === "won", results.length);
  guessEl.value = "";
  renderResults([]);
  renderAll();
}

function renderAll() {
  renderStatus();
  renderHistory();
  renderReveal();
  guessEl.disabled = status !== "playing";
}

function currentMatches() {
  const used = new Set(results.map((r) => r.car.id));
  return search(guessEl.value).filter((c) => !used.has(c.id));
}

guessEl.addEventListener("input", () => {
  active = 0;
  renderResults(currentMatches());
});

guessEl.addEventListener("keydown", (e) => {
  const list = currentMatches();
  if (e.key === "Escape") {
    renderResults([]);
    return;
  }
  if (!list.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    active = Math.min(active + 1, list.length - 1);
    renderResults(list);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    active = Math.max(active - 1, 0);
    renderResults(list);
  } else if (e.key === "Enter") {
    e.preventDefault();
    pick(list[active] || list[0]);
  }
});

resultsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  const car = carsById.get(btn.dataset.id);
  if (car) pick(car);
});

document.addEventListener("mousedown", (e) => {
  if (!playEl.contains(e.target)) renderResults([]);
});

async function boot() {
  data = await fetch("data.json").then((r) => r.json());
  carsById = new Map(data.cars.map((c) => [c.id, c]));
  const info = puzzleInfo();
  puzzle = info.n;
  target = info.car;
  const saved = loadRound();
  if (saved) {
    results = saved.ids.map((id) => compare(carsById.get(id), target)).filter((r) => r.car);
    status = saved.status;
  }
  renderAll();
}

boot();
