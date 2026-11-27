(() => {
  const C = window.COIN || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p) => `${(p * 100).toFixed(1)}%`;
  // Inline line icons (stroke = currentColor) instead of emoji / text symbols.
  const ICON_PATHS = {
    ext: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    dot: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    snow: '<path d="M12 2v20"/><path d="M2 12h20"/><path d="m4.93 4.93 14.14 14.14"/><path d="m19.07 4.93-14.14 14.14"/>',
    xlogo: '<path fill="currentColor" stroke="none" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zm-1.08 16.18h1.7L7.4 4.73H5.58z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    gift: '<path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2z"/><path d="M12 21V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  };
  const icon = (n, cls = "") => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[n]}</svg>`;

  // Leagues shown on the site (ESPN scoreboard paths). Must match bot/espn.py.
  const LEAGUES = [
    { path: "basketball/nba", name: "NBA" },
    { path: "football/nfl", name: "NFL" },
    { path: "hockey/nhl", name: "NHL" },
    { path: "baseball/mlb", name: "MLB" },
    { path: "soccer/uefa.champions", name: "Champions League" },
    { path: "soccer/uefa.europa", name: "Europa League" },
    { path: "soccer/eng.1", name: "Premier League" },
    { path: "soccer/esp.1", name: "La Liga" },
    { path: "soccer/ita.1", name: "Serie A" },
    { path: "soccer/ger.1", name: "Bundesliga" },
    { path: "soccer/fra.1", name: "Ligue 1" },
    { path: "soccer/por.1", name: "Primeira Liga" },
  ];
  const MAX_CONFIDENCE = 0.95;
  const reduceMotion = false;  // with reduced motion, CSS keeps the fades and drops the movement

  // Numbers count up the first time they scroll into view; later updates just swap the text.
  function countUp(el, to, fmt, dur = 1200) {
    if (!el) return;
    if (reduceMotion || el.dataset.counted) { el.dataset.counted = "1"; el.textContent = fmt(to); return; }
    el.dataset.counted = "1";
    el.textContent = fmt(0);
    const run = () => {
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(k < 1 ? to * e : to);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const ob = new IntersectionObserver(([en]) => { if (en.isIntersecting) { ob.disconnect(); run(); } }, { threshold: 0.4 });
    ob.observe(el);
  }

  // ---------- coin config ----------
  const ticker = `$${C.ticker || "COIN"}`;
  document.querySelectorAll('[data-coin="ticker-dollar"]').forEach((el) => (el.textContent = ticker));
  document.title = `${ticker}: the coin that bets on itself`;
  ["buy-link", "buy-link-2"].forEach((id) => { if (C.pumpUrl) $(id).href = C.pumpUrl; else $(id).hidden = true; });
  if (C.contractAddress) {
    $("ca-box").hidden = false;
    $("ca-text").textContent = C.contractAddress;
    $("ca-copy").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(C.contractAddress); $("ca-copy").textContent = "Copied"; }
      catch { $("ca-copy").textContent = "Select & copy"; }
      setTimeout(() => ($("ca-copy").textContent = "Copy"), 1600);
    });
  }
  const links = [["X / Twitter", C.twitter, "xlogo"], ["Telegram", C.telegram, "send"], ["Chart", C.dexscreener, "chart"], ["pump.fun", C.pumpUrl, null]];
  $("socials").innerHTML = links.filter(([, u]) => u)
    .map(([l, u, ic]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${ic ? icon(ic, "ic-lead") : ""}${esc(l)}${icon("ext", "ic-ext")}</a>`).join("");
  addEventListener("scroll", () => document.querySelector(".nav").classList.toggle("scrolled", scrollY > 8), { passive: true });

  // ---------- odds helpers ----------
  const american = (v) => {
    const n = parseFloat(String(v ?? "").replace("+", ""));
    if (!isFinite(n) || n === 0) return null;
    return n < 0 ? -n / (-n + 100) : 100 / (n + 100);
  };
  const decimalOdds = (v) => {
    const n = parseFloat(String(v ?? "").replace("+", ""));
    if (!isFinite(n) || n === 0) return null;
    return n < 0 ? 1 + 100 / -n : 1 + n / 100;
  };
  const mlPick = (side) => side && ((side.close && side.close.odds) || (side.open && side.open.odds));

  function parseGame(ev, league) {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp) return null;
    const team = (c) => ({
      name: c.team.displayName, short: c.team.shortDisplayName || c.team.displayName,
      abbr: c.team.abbreviation, logo: c.team.logo || (c.team.logos && c.team.logos[0] && c.team.logos[0].href),
      color: c.team.color ? `#${c.team.color}` : "#333", alt: c.team.alternateColor ? `#${c.team.alternateColor}` : "#666",
      score: c.score, winner: !!c.winner, record: c.records && c.records[0] && c.records[0].summary,
    });
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) return null;
    const g = {
      id: ev.id, league: league.name, start: new Date(ev.date),
      state: ev.status.type.state, detail: ev.status.type.shortDetail, completed: ev.status.type.completed,
      home: team(home), away: team(away), odds: null,
    };
    const o = comp.odds && comp.odds[0];
    if (o) {
      const ml = o.moneyline || {};
      const raw = {
        home: mlPick(ml.home) ?? (o.homeTeamOdds && o.homeTeamOdds.moneyLine),
        away: mlPick(ml.away) ?? (o.awayTeamOdds && o.awayTeamOdds.moneyLine),
        draw: mlPick(ml.draw) ?? (o.drawOdds && o.drawOdds.moneyLine),
      };
      const imp = { home: american(raw.home), away: american(raw.away), draw: american(raw.draw) };
      if (imp.home && imp.away) {
        const total = imp.home + imp.away + (imp.draw || 0);
        g.odds = {
          home: imp.home / total, away: imp.away / total, draw: imp.draw ? imp.draw / total : null,
          dec: { home: decimalOdds(raw.home), away: decimalOdds(raw.away) },
          provider: (o.provider && (o.provider.displayName || o.provider.name)) || "Sportsbook",
        };
      }
    }
    return g;
  }

  async function loadGames() {
    const res = await Promise.allSettled(LEAGUES.map(async (l) => {
      const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${l.path}/scoreboard`);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      return (d.events || []).map((e) => parseGame(e, l)).filter(Boolean);
    }));
    const now = Date.now();
    return res.flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      // today's slate: live, finished in the last 12h, or starting within 36h
      .filter((g) => g.state === "in" || (g.state === "post" && now - g.start < 12 * 3.6e6) || (g.state === "pre" && g.start - now < 36 * 3.6e6))
      .sort((a, b) => ({ in: 0, pre: 1, post: 2 }[a.state] - { in: 0, pre: 1, post: 2 }[b.state]) || a.start - b.start);
  }

  // Same rule as the bot: most likely winner, kickoff 30m-24h away, max 95%.
  function livePick(games) {
    const now = Date.now();
    let best = null;
    for (const g of games) {
      if (g.state !== "pre" || !g.odds) continue;
      const mins = (g.start - now) / 6e4;
      if (mins < 30 || mins > 24 * 60) continue;
      for (const side of ["home", "away"]) {
        const p = g.odds[side];
        if (p <= MAX_CONFIDENCE && (!best || p > best.probability)) best = { game: g, side, probability: p };
      }
    }
    return best;
  }

  // ---------- feed (bot's official record) ----------
  async function loadFeed() {
    try {
      const r = await fetch(`feed.json?t=${Date.now()}`, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    } catch { return null; }
  }

  // ---------- rendering ----------
  // Ask the image hosts for a small copy instead of the full 500px logo.
  const sized = (u, px) => {
    if (!u) return u;
    const m = u.match(/^https:\/\/a\.espncdn\.com(\/i\/[^?]+\.png)$/);
    if (m) return `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${px}&h=${px}`;
    if (/thesportsdb\.com\/images\/.+\.(png|jpe?g)$/.test(u)) return u + (px <= 64 ? "/tiny" : "/small");
    return u;
  };
  const logoImg = (t, cls) => t.logo
    ? `<img class="${cls}" src="${esc(sized(t.logo, 80))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<span class="${cls}-fb g-logo-fb" style="background:${esc(t.color)}">${esc((t.abbr || t.name).slice(0, 3))}</span>`;

  function countdown(ms) {
    if (ms <= 0) return "Starting";
    const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  let pickTimer, shownPickId = null, lastPickKey = null;
  function renderPickCard(pick, official) {
    const el = $("pick-card");
    const fresh = pick && pick.game.id !== shownPickId;
    shownPickId = pick ? pick.game.id : null;
    el.classList.toggle("enter", !!fresh && !reduceMotion);
    clearInterval(pickTimer);
    if (!pick) {
      el.innerHTML = `<div class="pick-loading">No game qualifies right now. Check back soon.</div>`;
      return;
    }
    const g = pick.game;
    const sel = g[pick.side], other = g[pick.side === "home" ? "away" : "home"];
    const odds = g.odds && g.odds.dec[pick.side];
    const teamHtml = (t, side) => `
      <div class="pc-team ${side === pick.side ? "picked" : "faded"}">
        <span class="pc-logo">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : esc(t.abbr)}</span>
        <span>${esc(t.short)}</span>
      </div>`;
    el.innerHTML = `
      <div class="pc-bg" style="background:linear-gradient(135deg, ${esc(sel.color)} 0%, ${esc(sel.color)} 45%, ${esc(other.color)} 140%)"></div>
      ${sel.logo ? `<img class="pc-ghost" src="${esc(sel.logo)}" alt="">` : ""}
      <div class="pc-top">
        <span class="glass">${esc(g.league)}</span>
        <span class="glass" id="pc-kick">${g.state === "pre" ? "Starts in " + countdown(g.start - Date.now()) : esc(g.detail)}</span>
      </div>
      <div class="pc-match">${teamHtml(g.away, "away")}<span class="pc-vs">@</span>${teamHtml(g.home, "home")}</div>
      <div class="pc-bottom">
        <span class="pc-k">${official ? "Today's pick" : "Live pick · from current odds"}</span>
        <span class="pc-sel">${esc(sel.name)} to win</span>
        <div class="pc-row">
          <div class="pc-prob"><span id="pc-num">${(pick.probability * 100).toFixed(1)}</span><small>%</small></div>
          <div class="pc-facts">
            ${odds ? `Odds <b>${odds.toFixed(2)}</b><br>` : ""}
            ${esc(g.start.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }))}
          </div>
        </div>
        <div class="pc-bar"><i style="width:${(pick.probability * 100).toFixed(1)}%"></i></div>
        <div class="pc-src">Win probability from market odds, margin removed</div>
      </div>`;
    if (fresh) { const n = $("pc-num"); delete n.dataset.counted; countUp(n, pick.probability * 100, (v) => v.toFixed(1), 1400); }
    if (g.state === "pre") {
      pickTimer = setInterval(() => { const k = $("pc-kick"); if (k) k.textContent = "Starts in " + countdown(g.start - Date.now()); }, 30000);
    }
  }

  let activeLeague = "All";
  let lastGames = [], lastPickId = null;

  function renderFilters(games) {
    const counts = games.reduce((m, g) => ((m[g.league] = (m[g.league] || 0) + 1), m), {});
    const names = ["All", ...LEAGUES.map((l) => l.name).filter((n) => counts[n])];
    if (!names.includes(activeLeague)) activeLeague = "All";
    $("filters").innerHTML = names.map((n) =>
      `<button class="filter ${n === activeLeague ? "on" : ""}" data-l="${esc(n)}" role="tab">${esc(n)}<span>${n === "All" ? games.length : counts[n]}</span></button>`).join("");
  }
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest(".filter");
    if (!b) return;
    activeLeague = b.dataset.l;
    renderFilters(lastGames);
    renderGames(lastGames, true);
  });

  let gamesShown = false;
  function renderGames(games, animate) {
    const anim = !reduceMotion && (animate || !gamesShown);
    gamesShown = true;
    const list = activeLeague === "All" ? games : games.filter((g) => g.league === activeLeague);
    if (!list.length) {
      $("games-grid").innerHTML = `<div class="empty">No games on the board right now.</div>`;
      return;
    }
    $("games-grid").innerHTML = list.map((g, i) => {
      const o = g.odds;
      const fav = o ? (o.home >= o.away ? "home" : "away") : null;
      const status = g.state === "in"
        ? `<span class="g-status live"><span class="dot live"></span>${esc(g.detail)}</span>`
        : g.state === "post" ? `<span class="g-status final">${esc(g.detail)}</span>`
        : `<span class="g-status">${esc(g.start.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }))}</span>`;
      const row = (t, side) => {
        const loser = g.state === "post" && !t.winner && (g.home.winner || g.away.winner);
        const right = g.state === "pre" ? (o ? `<span class="g-pct">${pct(o[side])}</span>` : "") : `<span class="g-score">${esc(t.score ?? "")}</span>`;
        return `<div class="g-row ${fav === side ? "fav" : ""} ${loser ? "loser" : ""}">
          ${logoImg(t, "g-logo")}
          <span class="g-name">${esc(t.name)}${t.record ? `<small>${esc(t.record)}</small>` : ""}</span>
          ${right}</div>`;
      };
      const bar = o ? `<div class="g-bar">
          <i style="width:${o.away * 100}%;background:${esc(g.away.color)}"></i>
          ${o.draw ? `<i style="width:${o.draw * 100}%;background:#d4d4d0"></i>` : ""}
          <i style="width:${o.home * 100}%;background:${esc(g.home.color)}"></i></div>` : "";
      const foot = o ? `<div class="g-foot"><span>${o.draw ? `Draw ${pct(o.draw)}` : "Win probability"}</span><span>Market odds</span></div>` : "";
      return `<article class="game ${g.id === lastPickId ? "is-pick" : ""} ${anim ? "enter" : ""}" style="--i:${Math.min(i, 12)}">
        <div class="g-top"><span class="g-league">${esc(g.league)}</span>${g.id === lastPickId ? `<span class="g-pickbadge">Today's pick</span>` : status}</div>
        ${row(g.away, "away")}${row(g.home, "home")}${bar}${foot}
      </article>`;
    }).join("");
  }

  function renderRecord(feed) {
    const picks = (feed && feed.picks) || [];
    const teams = (feed && feed.teams) || {};
    const s = feed && feed.stats;
    const graded = liveGrade(picks);
    const wins = graded.filter((p) => p.result === "win").length, losses = graded.filter((p) => p.result === "loss").length;
    $("s-record").textContent = `${wins}-${losses}`;
    const u = $("s-units");
    const units = Math.round(graded.reduce((t, p) => t + unitsOf(p), 0) * 100) / 100;
    countUp(u, units, (v) => `${units > 0 ? "+" : ""}${v.toFixed(2)}u`);
    u.classList.toggle("pos", units > 0); u.classList.toggle("neg", units < 0);
    const sol = s ? Number(s.sol_claimed) : 0;
    countUp($("s-sol"), sol, (v) => `${sol ? v.toFixed(3) : "0"} SOL`);
    renderRun(feed);

    renderTrackRecord(picks, teams);

    const claims = (feed && feed.claims) || [];
    const wallet = C.feeWallet ? `<li><span>Fee wallet</span><a href="https://solscan.io/account/${esc(C.feeWallet)}" target="_blank" rel="noopener">${esc(C.feeWallet.slice(0, 4))}…${esc(C.feeWallet.slice(-4))}${icon("ext", "ic-ext")}</a></li>` : "";
    const txLink = (sig) => sig ? `<a href="https://solscan.io/tx/${esc(sig)}" target="_blank" rel="noopener">View tx${icon("ext", "ic-ext")}</a>` : "<span></span>";
    const rows = [
      ...claims.map((c) => ({ date: c.date, html: `<li><span>${esc(c.date)}</span><span class="sol">+${Number(c.sol).toFixed(4)} SOL</span>${txLink(c.signature)}</li>` })),
      ...((feed && feed.airdrops) || []).map((a) => ({ date: a.date, html: `<li class="airdrop"><span class="ad-k">${icon("gift")}${esc(a.date)} · Airdrop to ${Number(a.holders) || 0} holders</span><span class="sol">${Number(a.sol).toFixed(4)} SOL</span>${txLink(a.signature)}</li>` })),
    ].sort((x, y) => (x.date < y.date ? 1 : -1));
    $("claims-list").innerHTML = wallet + (rows.length ? rows.map((r) => r.html).join("")
      : `<li class="muted"><span>No fees claimed yet</span></li>`);
  }

  // ---------- track record ----------
  const RESULT = { win: "Hit", loss: "Miss", pending: "Pending", void: "Void" };
  const unitsOf = (p) => (p.result === "win" ? Number(p.best_odds) - 1 : p.result === "loss" ? -1 : 0);
  const fmtU = (u) => `${u > 0 ? "+" : u < 0 ? "−" : ""}${Math.abs(u).toFixed(2)}u`;
  const fmtDay = (d) => {
    const dt = new Date(`${d}T12:00:00Z`);
    return { wd: dt.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }),
             dm: dt.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" }) };
  };
  const gameUrl = (p) => {
    if (!p.espn_id || !p.sport_key) return null;
    const path = p.sport_key.replace(/^espn:/, "");
    const [sport, league] = path.split("/");
    return sport === "soccer"
      ? `https://www.espn.com/soccer/match/_/gameId/${p.espn_id}`
      : `https://www.espn.com/${league}/game/_/gameId/${p.espn_id}`;
  };

  // Profit curve (1 unit per pick), oldest -> newest, as an inline SVG.
  function sparkline(graded) {
    const pts = [0];
    graded.forEach((p) => pts.push(pts[pts.length - 1] + unitsOf(p)));
    if (pts.length < 2) return "";
    const W = 240, H = 64, pad = 4;
    const lo = Math.min(0, ...pts), hi = Math.max(0, ...pts), span = hi - lo || 1;
    const x = (i) => pad + (i * (W - 2 * pad)) / (pts.length - 1);
    const y = (v) => H - pad - ((v - lo) * (H - 2 * pad)) / span;
    const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const up = pts[pts.length - 1] >= 0;
    return `<svg class="spark ${up ? "up" : "down"}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${pad}" x2="${W - pad}" y1="${y(0)}" y2="${y(0)}" class="spark-zero"/>
      <path d="${line}L${x(pts.length - 1)},${y(0)}L${x(0)},${y(0)}Z" class="spark-fill"/>
      <path d="${line}" class="spark-line"/>
      <circle cx="${x(pts.length - 1)}" cy="${y(pts[pts.length - 1])}" r="3.5" class="spark-dot"/>
    </svg>`;
  }

  // A pending pick whose game has already finished (ESPN, loaded for the games grid) is graded
  // right away instead of waiting for the bot's next daily run.
  function liveGrade(picks) {
    const byId = new Map((lastGames || []).map((g) => [g.id, g]));
    return picks.map((p) => {
      const g = p.result === "pending" && p.espn_id && byId.get(p.espn_id);
      if (!g || !g.completed) return p;
      const side = g.home.name === p.selection ? g.home : g.away.name === p.selection ? g.away : null;
      if (!side) return p;
      return { ...p, result: side.winner ? "win" : "loss",
               score: `${g.home.name} ${g.home.score} - ${g.away.score} ${g.away.name}` };
    });
  }

  let recFilter = "all", recShown = 10;
  function renderTrackRecord(rawPicks, teams) {
    const picks = liveGrade(rawPicks);
    const graded = picks.filter((p) => p.result === "win" || p.result === "loss");
    const hits = graded.filter((p) => p.result === "win").length;
    const misses = graded.length - hits;
    const units = graded.reduce((s, p) => s + unitsOf(p), 0);
    const trades = picks.filter((p) => p.bet).length;
    let streak = 0;
    for (const p of graded) { if (p.result === graded[0].result) streak++; else break; }
    const oldestFirst = [...graded].reverse();

    $("rec-summary").innerHTML = picks.length ? `
      <div class="rp-main">
        <span class="rp-k">Hits – misses</span>
        <span class="rp-big"><span class="pos">${hits}</span><span class="rp-dash">–</span><span class="${misses ? "neg" : ""}">${misses}</span></span>
        ${streak >= 2 ? `<span class="rp-streak ${graded[0].result}">${icon(graded[0].result === "win" ? "flame" : "snow")}${streak} ${graded[0].result === "win" ? "hits" : "misses"} in a row</span>` : ""}
      </div>
      <div class="rp-form">
        <span class="rp-k">Form</span>
        <div class="form-dots">${picks.slice(0, 10).reverse().map((p) =>
          `<span class="fd ${esc(p.result)}" title="${esc(p.date)} · ${esc(p.selection)} · ${RESULT[p.result] || ""}">${icon(p.result === "win" ? "check" : p.result === "loss" ? "x" : "dot")}</span>`).join("")}</div>
        <div class="rp-mini">
          <span><b>${graded.length ? Math.round((100 * hits) / graded.length) : 0}%</b> hit rate</span>
          <span><b>${graded.length ? pct(graded.reduce((s, p) => s + p.probability, 0) / graded.length) : "-"}</b> avg confidence</span>
          <span><b>${trades}</b> real trade${trades === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div class="rp-chart">
        <span class="rp-k">Profit, 1 unit per pick</span>
        <span class="rp-units ${units > 0 ? "pos" : units < 0 ? "neg" : ""}">${fmtU(units)}</span>
        ${sparkline(oldestFirst)}
      </div>` : "";

    const counts = { all: picks.length, win: hits, loss: misses, pending: picks.filter((p) => p.result === "pending").length };
    $("rec-filters").innerHTML = picks.length ? [["all", "All"], ["win", "Hits"], ["loss", "Misses"], ["pending", "Pending"]]
      .filter(([k]) => k === "all" || counts[k])
      .map(([k, l]) => `<button type="button" class="filter ${recFilter === k ? "on" : ""}" data-f="${k}">${l} <span>${counts[k]}</span></button>`).join("") : "";
    $("rec-filters").onclick = (e) => {
      const b = e.target.closest("[data-f]");
      if (b) { recFilter = b.dataset.f; recShown = 10; renderTrackRecord(rawPicks, teams); }
    };

    const list = picks.filter((p) => recFilter === "all" || p.result === recFilter);
    const logoOf = (name, p) => (name === p.selection && p.selection_logo) || (teams[name] && teams[name].badge);
    const team = (name, score, p) => {
      const isPick = name === p.selection, logo = logoOf(name, p);
      const won = p.result === "win" && isPick || p.result === "loss" && !isPick;
      return `<div class="rt ${isPick ? "is-pick" : ""}">
        ${logo ? `<img src="${esc(sized(logo, 64))}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'rt-fb',textContent:'${esc(name.slice(0, 1))}'}))">` : `<span class="rt-fb">${esc(name.slice(0, 1))}</span>`}
        <span class="rt-name">${esc(name)}${isPick ? `<span class="rt-tag">Pick</span>` : ""}</span>
        <span class="rt-score ${won ? "won" : ""}">${score ?? ""}</span>
      </div>`;
    };

    $("record-list").innerHTML = list.length ? list.slice(0, recShown).map((p) => {
      const m = /(\d+)\s*-\s*(\d+)/.exec(p.score || "");
      const [hs, as] = m ? [m[1], m[2]] : [null, null];
      const d = fmtDay(p.date), u = unitsOf(p), url = gameUrl(p);
      const trade = p.bet
        ? `<span class="rec-kind trade">Traded $${Number(p.bet.usdc).toFixed(0)}${p.bet.price ? ` @ ${Number(p.bet.price).toFixed(2)}` : ""}</span>`
        : `<span class="rec-kind">Pick only</span>`;
      return `<div class="rec2 r-${esc(p.result)}">
        <div class="r-date"><span>${esc(d.wd)}</span><b>${esc(d.dm)}</b></div>
        <div class="r-match">
          <div class="r-league">${esc(p.sport)}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Game${icon("ext", "ic-ext")}</a>` : ""}</div>
          ${team(p.away, as, p)}${team(p.home, hs, p)}
        </div>
        <div class="r-odds">
          <div class="r-prob"><span style="width:${(p.probability * 100).toFixed(1)}%"></span></div>
          <span>${pct(p.probability)} win chance</span>
          <span class="muted">odds ${Number(p.best_odds).toFixed(2)} · ${trade}</span>
        </div>
        <div class="r-res">
          <span class="pill ${esc(p.result)}">${p.result === "win" ? icon("check") : p.result === "loss" ? icon("x") : ""}${RESULT[p.result] || esc(p.result)}</span>
          ${u ? `<span class="r-u ${u > 0 ? "pos" : "neg"}">${fmtU(u)}</span>` : ""}
        </div>
      </div>`;
    }).join("") : `<div class="card-empty">${picks.length ? "Nothing here yet." : "The bot's first graded pick will appear here after its first daily run."}</div>`;

    const more = $("rec-more");
    more.hidden = list.length <= recShown;
    more.onclick = () => { recShown += 10; renderTrackRecord(rawPicks, teams); };
  }

  // "Today's run": what the bot actually did, straight from its history.
  function renderRun(feed) {
    const betting = !!(feed && feed.betting_live);
    const today = feed && feed.today && liveGrade([feed.today])[0];
    const claims = (feed && feed.claims) || [];
    const last = claims[0];
    const venueOf = (v) => ({ polymarket: "Polymarket", kalshi: "Kalshi" }[v] || "predict.fun");
    // predict.fun gets its logo and a link; the other venues are plain text.
    const venueHtml = (v) => venueOf(v) === "predict.fun"
      ? `<a class="venue-link" href="https://predict.fun" target="_blank" rel="noopener"><img src="img/predictfun.png" alt="" width="16" height="16">predict.fun</a>`
      : venueOf(v);
    const venue = venueHtml(feed && feed.venue);
    const rows = [
      ["Fees", last ? `+${Number(last.sol).toFixed(4)} SOL on ${esc(last.date.slice(5).replace("-", "/"))}` : "First claim after launch", !!last],
      ["Pick", today ? `${esc(today.selection)} · ${today.result === "pending" ? pct(today.probability) : today.result === "win" ? "Won" : today.result === "loss" ? "Lost" : "Void"}` : "Next run 09:00 UTC", !!today],
      ["Bet", today && today.bet ? `$${Number(today.bet.usdc).toFixed(0)} on ${venueHtml(today.bet.venue)}` : betting ? "Waiting for a fair price" : "Goes live once the wallet is funded", !!(today && today.bet)],
    ];
    const when = feed && feed.generated_at
      ? new Date(feed.generated_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    $("run-card").innerHTML = `<div class="run-head"><span>Bot's latest run</span><span class="muted">${esc(when)}</span></div>` +
      rows.map(([k, v, done]) => `<div class="run-row"><span class="run-ic ${done ? "ok" : ""}">${icon(done ? "check" : "dot")}</span><span class="run-k">${k}</span><span class="run-v">${v}</span></div>`).join("");
    if (betting) {
      $("status-label").textContent = "Live odds · betting on";
    } else {
      $("step-bet").innerHTML = `Once the betting account is funded on ${venue}, the pick is backed there at a price no worse than the model's own estimate. Every pick is graded here either way.`;
    }
  }

  // Official pick from the bot if it's for an upcoming/live game we can see; else live pick.
  function choosePick(feed, games) {
    const t = feed && feed.today;
    if (t && t.espn_id) {
      const g = games.find((x) => x.id === t.espn_id);
      if (g && g.state !== "post") {
        const side = g.home.name === t.selection ? "home" : g.away.name === t.selection ? "away" : null;
        if (side) return { pick: { game: g, side, probability: t.probability }, official: true };
      }
    }
    const p = livePick(games);
    return { pick: p, official: false };
  }

  let feed = null, gradedKey = null;
  async function refresh() {
    try {
      const games = await loadGames();
      lastGames = games;
      if (feed) {  // re-grade when a pending pick's game has finished
        const key = liveGrade(feed.picks || []).map((p) => p.result).join();
        if (key !== gradedKey) { gradedKey = key; renderRecord(feed); }
      }
      const { pick, official } = choosePick(feed, games);
      lastPickId = pick ? pick.game.id : null;
      const key = pick ? `${pick.game.id}|${pick.game.state}|${pick.game.detail}|${official}` : "none";
      if (key !== lastPickKey) { lastPickKey = key; renderPickCard(pick, official); }
      countUp($("s-games"), games.length, (v) => String(Math.round(v)), 900);
      renderFilters(games);
      renderGames(games);
      $("games-updated").textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    } catch (e) {
      $("games-grid").innerHTML = `<div class="empty">Couldn't load games. Retrying…</div>`;
    }
  }

  (async () => {
    feed = await loadFeed();
    renderRecord(feed);
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, 60000);
    let hiddenAt = 0;  // catch up straight away when a background tab comes back
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 60000) refresh();
    });
  })();
})();
