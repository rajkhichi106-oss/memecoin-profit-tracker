(() => {
  const ADDR = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
  const S = { balance: 10, fees: { bp: 0.001, bb: 0.001, sp: 0.001, sb: 0.001 }, positions: {}, history: [], pos: null, min: false, charts: {} };
  let market = null, address = null, err = "", busy = false, refreshQueued = false;

  const fmt = (n, d = 4) => (isFinite(n) ? Number(n).toLocaleString("en-IN", { maximumFractionDigits: d }) : "-");
  const mcFmt = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : (n / 1e3).toFixed(1) + "K");
  const save = () => chrome.storage.local.set({ mpt: S });

  // Same fee logic as the web app: fees are fixed cost, never multiplied by MC growth.
  function calc(p) {
    const value = p.sol * (market.mc / p.entryMc);
    const fees = p.buyFees + S.fees.sp + S.fees.sb;
    return { value, net: value - p.sol - fees, roi: ((value - p.sol - fees) / (p.sol + p.buyFees)) * 100 };
  }

  const el = document.createElement("div");
  el.id = "mpt-hud";
  document.documentElement.appendChild(el);

  // Market-cap history for the live chart: one sample per token every 30s, 24h window.
  function recordChart(addr, mc) {
    if (!(mc > 0)) return;
    S.charts = S.charts || {};
    const arr = S.charts[addr] || (S.charts[addr] = []);
    const now = Date.now();
    if (arr.length && now - arr[arr.length - 1][0] < 30000) return;
    arr.push([now, mc]);
    while (arr.length && now - arr[0][0] > 86400000) arr.shift();
    if (arr.length > 2880) arr.splice(0, arr.length - 2880);
    save();
  }

  function sparkline(arr) {
    const w = 270, h = 44;
    const mcs = arr.map((p) => p[1]);
    const lo = Math.min(...mcs), hi = Math.max(...mcs), span = hi - lo || 1;
    const step = w / Math.max(1, arr.length - 1);
    const pts = arr
      .map((p, i) => `${(i * step).toFixed(1)},${(h - 4 - ((p[1] - lo) / span) * (h - 8)).toFixed(1)}`)
      .join(" ");
    const cls = mcs[mcs.length - 1] >= mcs[0] ? "up" : "dn";
    return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}"/></svg>`;
  }

  function chartHtml() {
    const arr = (S.charts || {})[address];
    if (!arr || arr.length < 2) return "";
    const mins = Math.round((Date.now() - arr[0][0]) / 60000);
    const win = mins >= 60 ? (mins / 60).toFixed(1).replace(/\.0$/, "") + "h" : mins + "m";
    return `<div class="chart"><div class="row mut"><span>MC trend</span><span>${win}</span></div>${sparkline(arr)}</div>`;
  }

  function render() {
    el.className = S.min ? "min" : "";
    if (S.pos) Object.assign(el.style, { left: S.pos.x + "px", top: S.pos.y + "px", right: "auto" });
    const p = address && S.positions[address];
    let pnl = "";
    if (p && market) {
      const r = calc(p), usd = r.net * market.solUsd, cls = r.net >= 0 ? "up" : "dn";
      pnl = `<div class="pnl ${cls}">${r.net >= 0 ? "+" : ""}₹${fmt(usd * market.usdInr, 0)}</div>
        <div class="row mut"><span>${fmt(r.net)} SOL · $${fmt(usd, 2)}</span><span class="${cls}">${fmt(r.roi, 1)}%</span></div>
        <div class="row mut"><span>Entry ${mcFmt(p.entryMc)} → ${mcFmt(market.mc)}</span><span>${fmt(p.sol)} SOL in</span></div>`;
    }
    const headPnl = p && market ? (() => { const r = calc(p); return `<b class="${r.net >= 0 ? "up" : "dn"}">${r.net >= 0 ? "+" : ""}₹${fmt(r.net * market.solUsd * market.usdInr, 0)}</b>`; })() : "";
    const chart = address && chartHtml();
    el.innerHTML = `
      <div class="h"><span>Paper Trader ${headPnl}</span><span class="tools"><button data-a="refresh" title="Refresh token data" aria-label="Refresh token data" ${busy ? 'class="spinning"' : ""}>↻</button><button data-a="min" title="${S.min ? "Expand panel" : "Minimize panel"}" aria-label="${S.min ? "Expand panel" : "Minimize panel"}">${S.min ? "▢" : "—"}</button></span></div>
      <div class="b">
        <div class="row"><span>${market ? `<b>${market.symbol}</b> <span class="mut">${market.dex}</span>` : '<span class="mut">Open a token page</span>'}</span>
          <span>${market ? "MC " + mcFmt(market.mc) : ""}</span></div>
        ${err ? `<div class="err">${err}</div>` : ""}
        ${chart}
        <div class="row mut"><span>Balance</span><span>${fmt(S.balance)} SOL</span></div>
        ${pnl}
        <div class="g">${[0.1, 0.5, 1, 2].map((v) => `<button class="btn buy" data-buy="${v}">${v}</button>`).join("")}</div>
        <div class="g2"><input id="mpt-amt" type="number" step="0.01" placeholder="Custom SOL"><button class="btn buy" data-a="custom">Buy</button></div>
        <div class="g">${[25, 50, 100].map((v) => `<button class="btn sell" data-sell="${v}">${v}%</button>`).join("")}<span></span></div>
        <div class="g2">
          <input data-f="bp" type="number" step="0.0001" value="${S.fees.bp}" title="Buy priority fee (SOL)">
          <input data-f="bb" type="number" step="0.0001" value="${S.fees.bb}" title="Buy bribe fee (SOL)">
          <input data-f="sp" type="number" step="0.0001" value="${S.fees.sp}" title="Sell priority fee (SOL)">
          <input data-f="sb" type="number" step="0.0001" value="${S.fees.sb}" title="Sell bribe fee (SOL)">
        </div>
        <div class="mut" style="font-size:10px">Fees: buy prio / buy bribe / sell prio / sell bribe. Simulated trades only — market data from DEX Screener / Jupiter.</div>
      </div>`;
  }

  function buy(sol) {
    if (!market || !(sol > 0)) return;
    const buyFees = S.fees.bp + S.fees.bb;
    if (sol + buyFees > S.balance) { err = "Not enough paper balance."; return render(); }
    S.balance -= sol + buyFees;
    const p = S.positions[address];
    if (p) {
      // weighted entry MC
      const tokens = p.sol / p.entryMc + sol / market.mc;
      p.sol += sol; p.entryMc = p.sol / tokens; p.buyFees += buyFees;
    } else S.positions[address] = { sol, entryMc: market.mc, buyFees, symbol: market.symbol, t: Date.now() };
    err = ""; save(); render();
  }

  function sell(pct) {
    const p = S.positions[address];
    if (!p || !market) return;
    const f = pct / 100, r = calc(p);
    const sellFees = S.fees.sp + S.fees.sb;
    S.balance += r.value * f - sellFees;
    const realized = (r.value - p.sol) * f - p.buyFees * f - sellFees;
    S.history.unshift({ symbol: p.symbol, sol: p.sol * f, entryMc: p.entryMc, exitMc: market.mc, pnl: realized, inr: realized * market.solUsd * market.usdInr, t: Date.now() });
    S.history = S.history.slice(0, 200);
    if (pct === 100) delete S.positions[address];
    else { p.sol *= 1 - f; p.buyFees *= 1 - f; }
    save(); render();
  }

  el.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.a === "min") { S.min = !S.min; save(); render(); }
    if (t.dataset.a === "refresh") refresh(true);
    if (t.dataset.buy) buy(Number(t.dataset.buy));
    if (t.dataset.a === "custom") buy(Number(el.querySelector("#mpt-amt").value));
    if (t.dataset.sell) sell(Number(t.dataset.sell));
  });
  el.addEventListener("change", (e) => {
    const k = e.target.dataset.f;
    if (k) { S.fees[k] = Math.max(0, Number(e.target.value) || 0); save(); render(); }
  });

  // Dragging
  el.addEventListener("mousedown", (e) => {
    if (!e.target.closest(".h") || e.target.closest("button")) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (m) => { S.pos = { x: Math.max(0, m.clientX - dx), y: Math.max(0, m.clientY - dy) }; el.style.left = S.pos.x + "px"; el.style.top = S.pos.y + "px"; el.style.right = "auto"; };
    const up = () => { removeEventListener("mousemove", move); removeEventListener("mouseup", up); save(); };
    addEventListener("mousemove", move); addEventListener("mouseup", up);
  });

  function detect() {
    const m = location.pathname.match(ADDR);
    return m ? m[0] : null;
  }

  function refresh(force = false) {
    const a = detect();
    if (a !== address) { address = a; market = null; err = ""; render(); }
    if (!address) { err = "Open a token page to load market data."; render(); return; }
    if (document.hidden) return;
    if (busy) {
      if (force) refreshQueued = true;
      return;
    }
    busy = true;
    err = "";
    render();
    chrome.runtime.sendMessage({ type: "market", address, force }, (res) => {
      busy = false;
      if (chrome.runtime.lastError) {
        err = "Market data temporarily unavailable. Try refresh again.";
        render();
        return;
      }
      if (res?.ok) { if (address === a) { market = res.data; err = ""; recordChart(a, market.mc); } }
      else err = res?.error || "Market data temporarily unavailable";
      render();
      if (refreshQueued) { refreshQueued = false; refresh(true); }
    });
  }

  chrome.storage.local.get("mpt", ({ mpt }) => {
    if (mpt) Object.assign(S, mpt);
    render(); refresh();
    setInterval(refresh, 5000);
  });
})();
