(() => {
  const C = window.COIN || {};
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (p) => `${(p * 100).toFixed(1)}%`;

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
  const links = [["X / Twitter", C.twitter], ["Telegram", C.telegram], ["Chart", C.dexscreener], ["pump.fun", C.pumpUrl]];
  $("socials").innerHTML = links.filter(([, u]) => u)
    .map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join("");
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
  const logoImg = (t, cls) => t.logo
    ? `<img class="${cls}" src="${esc(t.logo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
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
        <div class="pc-src">Win probability from ${esc(g.odds ? g.odds.provider : "bookmaker")} odds, margin removed</div>
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
      const foot = o ? `<div class="g-foot"><span>${o.draw ? `Draw ${pct(o.draw)}` : "Win probability"}</span><span>${esc(o.provider)}</span></div>` : "";
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
    $("s-record").textContent = s && (s.wins + s.losses) ? `${s.wins}-${s.losses}` : "0-0";
    const u = $("s-units");
    const units = s ? Number(s.units) : 0;
    countUp(u, units, (v) => `${units > 0 ? "+" : ""}${v.toFixed(2)}u`);
    u.classList.toggle("pos", units > 0); u.classList.toggle("neg", units < 0);
    const sol = s ? Number(s.sol_claimed) : 0;
    countUp($("s-sol"), sol, (v) => `${sol ? v.toFixed(3) : "0"} SOL`);
    renderRun(feed);

    $("record-list").innerHTML = picks.length ? picks.map((p) => {
      const logo = p.selection_logo || (teams[p.selection] && teams[p.selection].badge);
      return `<div class="rec">
        <span class="rec-date">${esc(p.date.slice(5).replace("-", "/"))}</span>
        <div class="rec-game">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ""}
          <div><div class="rec-sel">${esc(p.selection)}</div>
          <div class="rec-sub">${esc(p.home)} vs ${esc(p.away)} · ${esc(p.score || p.sport)}${p.bet ? ` · <b>$${Number(p.bet.usdc).toFixed(0)} bet</b>` : ""}</div></div></div>
        <span class="rec-conf">${pct(p.probability)} · ${Number(p.best_odds).toFixed(2)}</span>
        <span class="pill ${esc(p.result)}">${esc(p.result)}</span>
      </div>`;
    }).join("") : `<div class="card-empty">The bot's first graded pick will appear here after its first daily run.</div>`;

    const claims = (feed && feed.claims) || [];
    const wallet = C.feeWallet ? `<li><span>Fee wallet</span><a href="https://solscan.io/account/${esc(C.feeWallet)}" target="_blank" rel="noopener">${esc(C.feeWallet.slice(0, 4))}…${esc(C.feeWallet.slice(-4))} ↗</a></li>` : "";
    $("claims-list").innerHTML = wallet + (claims.length
      ? claims.map((c) => `<li><span>${esc(c.date)}</span><span class="sol">+${Number(c.sol).toFixed(4)} SOL</span>
          ${c.signature ? `<a href="https://solscan.io/tx/${esc(c.signature)}" target="_blank" rel="noopener">View tx ↗</a>` : "<span></span>"}</li>`).join("")
      : `<li class="muted"><span>No fees claimed yet</span></li>`);
  }

  // "Today's run": what the bot actually did, straight from its history.
  function renderRun(feed) {
    const betting = !!(feed && feed.betting_live);
    const today = feed && feed.today;
    const claims = (feed && feed.claims) || [];
    const last = claims[0];
    const venueOf = (v) => (v === "polymarket" ? "Polymarket" : "Kalshi");
    const venue = venueOf(feed && feed.venue);
    const rows = [
      ["Fees", last ? `+${Number(last.sol).toFixed(4)} SOL on ${esc(last.date.slice(5).replace("-", "/"))}` : "First claim after launch", !!last],
      ["Pick", today ? `${esc(today.selection)} · ${today.result === "pending" ? pct(today.probability) : today.result === "win" ? "Won" : today.result === "loss" ? "Lost" : "Void"}` : "Next run 09:00 UTC", !!today],
      ["Bet", today && today.bet ? `$${Number(today.bet.usdc).toFixed(0)} on ${venueOf(today.bet.venue)}` : betting ? "Waiting for a fair price" : "Goes live once the wallet is funded", !!(today && today.bet)],
    ];
    const when = feed && feed.generated_at
      ? new Date(feed.generated_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
    $("run-card").innerHTML = `<div class="run-head"><span>Bot's latest run</span><span class="muted">${esc(when)}</span></div>` +
      rows.map(([k, v, done]) => `<div class="run-row"><span class="run-ic ${done ? "ok" : ""}">${done ? "✓" : "·"}</span><span class="run-k">${k}</span><span class="run-v">${v}</span></div>`).join("");
    if (betting) {
      $("status-label").textContent = "Live odds · betting on";
    } else {
      $("step-bet").textContent = `Once the betting account is funded on ${venue}, the pick is backed there at a price no worse than the model's own estimate. Every pick is graded here either way.`;
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

  let feed = null;
  async function refresh() {
    try {
      const games = await loadGames();
      lastGames = games;
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
    setInterval(refresh, 60000);
  })();
})();
