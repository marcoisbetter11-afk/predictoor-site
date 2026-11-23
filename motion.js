// Motion layer: smooth scrolling, scroll reveals, hero entrance, parallax, progress bar.
// Everything here is optional polish: if this file fails the page renders fully, just still.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;
  // Reduced motion: keep soft fades, drop movement, smooth scrolling and parallax.
  root.classList.add("motion");
  if (reduce) root.classList.add("calm");
  // Opened in a background tab: browsers pause animations there, so show content
  // straight away and only animate what the visitor scrolls to later.
  if (document.hidden) {
    root.classList.add("still");
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) setTimeout(() => root.classList.remove("still"), 50);
    });
  }

  // ---------- smooth scrolling (Lenis) ----------
  let lenis = null;
  // Smooth wheel scrolling for everyone; a little quicker when the OS asks for less motion.
  if (window.Lenis) {
    lenis = new Lenis({ lerp: reduce ? 0.16 : 0.09, wheelMultiplier: 1, smoothWheel: true });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // In-page links glide instead of jumping (offset for the sticky nav).
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute("href");
      const target = id === "#" ? 0 : document.querySelector(id);
      if (target === null) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -76 });
    });
  }

  // ---------- hero entrance ----------
  const heroBits = document.querySelectorAll(".hb-copy > *");
  heroBits.forEach((el, i) => el.style.setProperty("--d", `${120 + i * 90}ms`));
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("loaded")));

  // ---------- scroll reveals ----------
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      el.classList.add("in");
      io.unobserve(el);
      const delay = parseFloat(el.style.getPropertyValue("--d")) || 0;
      setTimeout(() => { el.classList.remove("reveal", "in"); el.style.removeProperty("--d"); }, delay + 1000);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

  const groups = [
    ".section-head", ".pick-card", ".stats .stat", ".run", "#filters",
    ".steps .step", "#record-list", ".claims", ".footer-inner",
  ];
  for (const sel of groups) {
    document.querySelectorAll(sel).forEach((el, i) => {
      el.classList.add("reveal");
      // Siblings in a row arrive one after another.
      el.style.setProperty("--d", `${Math.min(i, 6) * 80}ms`);
      io.observe(el);
    });
  }

  // ---------- scroll progress + mascot parallax ----------
  const bar = document.createElement("div");
  bar.className = "progress";
  document.querySelector(".nav").appendChild(bar);
  const wide = matchMedia("(min-width: 1081px)");   // parallax only where the art sits behind the text
  const art = reduce ? null : document.querySelector(".hb-art");
  let lastArt = "";
  const paint = () => {
    const y = scrollY;
    const max = root.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (art) {
      const t = wide.matches && y < innerHeight * 1.2 ? `translate3d(0, ${(y * 0.18).toFixed(1)}px, 0)` : "";
      if (t !== lastArt) { art.style.transform = t; lastArt = t; }   // only touch the DOM when it changes
    }
  };
  if (lenis) {
    lenis.on("scroll", paint);            // already runs inside Lenis's animation frame: no extra lag
  } else {
    let ticking = false;
    addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { paint(); ticking = false; });
    }, { passive: true });
  }
  paint();
})();
