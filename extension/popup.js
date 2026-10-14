const $ = (id) => document.getElementById(id);
const f = (n, d = 3) => Number(n).toLocaleString("en-IN", { maximumFractionDigits: d });

function load() {
  chrome.storage.local.get("mpt", ({ mpt }) => {
    const s = mpt || { balance: 10, history: [] };
    const h = s.history || [];
    const tot = h.reduce((a, x) => a + x.pnl, 0), inr = h.reduce((a, x) => a + (x.inr || 0), 0);
    $("bal").textContent = f(s.balance) + " SOL";
    $("wr").textContent = h.length ? Math.round((h.filter((x) => x.pnl > 0).length / h.length) * 100) + "%" : "-";
    $("ps").textContent = (tot >= 0 ? "+" : "") + f(tot); $("ps").className = tot >= 0 ? "up" : "dn";
    $("pi").textContent = (inr >= 0 ? "+₹" : "-₹") + f(Math.abs(inr), 0); $("pi").className = inr >= 0 ? "up" : "dn";
    $("hist").innerHTML = h.slice(0, 30).map((x) =>
      `<tr><td>${x.symbol}</td><td class="mut">${f(x.sol)} SOL</td><td class="${x.pnl >= 0 ? "up" : "dn"}">${x.pnl >= 0 ? "+" : ""}₹${f(x.inr || 0, 0)}</td></tr>`).join("") ||
      '<tr><td class="mut">No closed trades yet</td></tr>';
  });
}

$("reset").onclick = () => {
  chrome.storage.local.get("mpt", ({ mpt }) => {
    const s = mpt || {};
    s.balance = Number($("start").value) || 10; s.positions = {}; s.history = [];
    chrome.storage.local.set({ mpt: s }, load);
  });
};
load();
