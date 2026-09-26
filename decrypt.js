(() => {
  "use strict";

  // One clock for the whole page, regardless of how much text it contains.
  if (window.PageDecrypt) return;
  // Edit this value to set the total decryption time in milliseconds.
  const DECRYPT_DURATION_MS = 550;
  const FRAME_INTERVAL = 1000 / 30;
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*+=?<>[]{}~";
  const SKIP = "script, style, noscript, nav, .nav, input, textarea, select, [contenteditable], [hidden], .hidden, [aria-hidden='true'], [data-no-decrypt]";
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let active = null;

  function finish() {
    const run = active;
    if (!run) return;
    active = null;
    cancelAnimationFrame(run.frame);
    clearTimeout(run.timer);
    for (const entry of run.entries) {
      // Never overwrite text that the app has updated during the effect.
      if (entry.node.data === entry.current) entry.node.data = entry.original;
    }
    if (run.root.getAttribute("aria-busy") === "true") {
      if (run.busy === null) run.root.removeAttribute("aria-busy");
      else run.root.setAttribute("aria-busy", run.busy);
    }
  }

  function scramble(char) {
    // A scrambled character is always different from its final character.
    const offset = 1 + Math.floor(Math.random() * (GLYPHS.length - 1));
    return GLYPHS[(GLYPHS.indexOf(char) + offset) % GLYPHS.length];
  }

  function start(root = document.body) {
    // Repeated starts restore the source before taking a new snapshot.
    finish();
    if (!root || motion.matches || document.hidden) return;

    const entries = [];
    let count = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return /[a-zA-Z0-9]/.test(node.data) && !node.parentElement?.closest(SKIP)
          ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const chars = node.data.split("");
      const order = chars.map((char) => /[a-zA-Z0-9]/.test(char) ? count++ : -1);
      entries.push({ node, chars, order, original: node.data, current: node.data });
    }
    if (!count) return;

    for (const entry of entries) {
      entry.revealAt = entry.order.map((index) => index < 0 ? 0
        : index === count - 1 ? DECRYPT_DURATION_MS
        : DECRYPT_DURATION_MS * (0.1 + 0.9 * (0.8 * index / count + 0.2 * Math.random())));
    }
    const run = {
      root, entries, busy: root.getAttribute("aria-busy"),
      started: performance.now(), lastFrame: -FRAME_INTERVAL, frame: 0, timer: 0,
    };
    active = run;
    root.setAttribute("aria-busy", "true");

    function tick(now) {
      if (active !== run) return;
      const elapsed = now - run.started;
      if (elapsed >= DECRYPT_DURATION_MS) {
        finish();
        return;
      }
      if (elapsed - run.lastFrame >= FRAME_INTERVAL) {
        run.lastFrame = elapsed;
        for (const entry of entries) {
          if (!entry.node.isConnected || entry.node.data !== entry.current) continue;
          entry.current = entry.chars.map((char, index) =>
            elapsed >= entry.revealAt[index] ? char : scramble(char),
          ).join("");
          entry.node.data = entry.current;
        }
      }
      run.frame = requestAnimationFrame(tick);
    }

    // The timeout also completes the effect if animation frames are throttled.
    run.timer = setTimeout(() => { if (active === run) finish(); }, DECRYPT_DURATION_MS);
    tick(run.started);
  }

  window.PageDecrypt = Object.freeze({ start, finish });
  window.addEventListener("pagehide", finish);
  window.addEventListener("pageshow", (event) => { if (event.persisted) finish(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) finish(); });
  motion.addEventListener("change", () => { if (motion.matches) finish(); });
  // Finish before a click, keystroke or copy can use an intermediate label.
  for (const event of ["pointerdown", "keydown", "beforeinput", "copy"]) {
    document.addEventListener(event, finish, { capture: true });
  }
})();
