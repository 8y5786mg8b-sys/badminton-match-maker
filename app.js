"use strict";

const STORE = "badminton-match-maker-github-v1";
const $ = (id) => document.getElementById(id);
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const pairKey = (a, b) => [a, b].sort().join("|");
const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const sortJa = (a, b) => a.name.localeCompare(b.name, "ja", { sensitivity: "base", numeric: true });
function dateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function displayDate(key) { const [, m, d] = key.split("-").map(Number); return `${m}月${d}日`; }
function shuffled(items) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function count(map, key) { map.set(key, (map.get(key) || 0) + 1); }

let state = { players: [], pairs: [], rounds: [], courts: 2, date: dateKey() };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || "null");
  if (saved) {
    const sameDay = saved.date === dateKey();
    state = {
      players: (saved.players || []).map((p) => sameDay ? p : { ...p, selected: false, status: "available" }),
      pairs: sameDay ? (saved.pairs || []) : [], rounds: sameDay ? (saved.rounds || []) : [],
      courts: saved.courts || 2, date: dateKey()
    };
  }
} catch { /* Start with an empty local roster. */ }

function save() { localStorage.setItem(STORE, JSON.stringify(state)); }
function player(id) { return state.players.find((p) => p.id === id); }
function name(id) { return player(id)?.name || "不明"; }
function showMessage(text) { const box = $("message"); box.textContent = text; box.classList.remove("hidden"); clearTimeout(showMessage.timer); showMessage.timer = setTimeout(() => box.classList.add("hidden"), 4500); }

function stats(rounds = state.rounds) {
  const games = new Map(), waits = new Map(), partners = new Map(), opponents = new Map();
  for (const round of rounds) {
    const playing = new Set();
    for (const match of round.matches) {
      const a = match.a.map((p) => p.id), b = match.b.map((p) => p.id);
      [...a, ...b].forEach((id) => { playing.add(id); count(games, id); });
      count(partners, pairKey(a[0], a[1])); count(partners, pairKey(b[0], b[1]));
      a.forEach((x) => b.forEach((y) => count(opponents, pairKey(x, y))));
    }
    round.eligible.forEach((p) => { if (!playing.has(p.id)) count(waits, p.id); });
  }
  const streaks = new Map(), last = rounds.at(-1), lastPlaying = new Set(), lastPartners = new Set(), lastOpponents = new Set();
  if (last) for (const match of last.matches) {
    const a = match.a.map((p) => p.id), b = match.b.map((p) => p.id);
    [...a, ...b].forEach((id) => lastPlaying.add(id));
    lastPartners.add(pairKey(a[0], a[1])); lastPartners.add(pairKey(b[0], b[1]));
    a.forEach((x) => b.forEach((y) => lastOpponents.add(pairKey(x, y))));
  }
  state.players.forEach((p) => { let n = 0; for (let i = rounds.length - 1; i >= 0; i--) { if (!rounds[i].matches.some((m) => [...m.a, ...m.b].some((x) => x.id === p.id))) break; n++; } streaks.set(p.id, n); });
  return { games, waits, partners, opponents, streaks, lastPlaying, lastPartners, lastOpponents };
}

function availability() {
  const active = state.players.filter((p) => p.selected && p.status === "available");
  const ids = new Set(active.map((p) => p.id)), blocked = new Set();
  state.pairs.forEach((pair) => {
    if (ids.has(pair.a) !== ids.has(pair.b)) { if (ids.has(pair.a)) blocked.add(pair.a); if (ids.has(pair.b)) blocked.add(pair.b); }
  });
  return { active, playable: active.filter((p) => !blocked.has(p.id)), blocked };
}

function makeRound(baseRounds) {
  const { active, playable } = availability();
  const target = Math.min(state.courts * 4, Math.floor(playable.length / 4) * 4);
  if (target < 4) return null;
  const ids = new Set(playable.map((p) => p.id)), linked = new Set(), units = [];
  state.pairs.forEach((pair) => { if (ids.has(pair.a) && ids.has(pair.b)) { units.push({ ids: [pair.a, pair.b], fixed: true }); linked.add(pair.a); linked.add(pair.b); } });
  playable.forEach((p) => { if (!linked.has(p.id)) units.push({ ids: [p.id], fixed: false }); });
  const s = stats(baseRounds); let chosen = null, chosenScore = Infinity;
  for (let n = 0; n < 1600; n++) {
    const candidate = []; let total = 0;
    shuffled(units).forEach((u) => { if (total + u.ids.length <= target) { candidate.push(u); total += u.ids.length; } });
    if (total !== target || candidate.filter((u) => u.ids.length === 1).length % 2) continue;
    const score = candidate.flatMap((u) => u.ids).reduce((v, id) => v + (s.games.get(id) || 0) * 45 + (s.streaks.get(id) || 0) * 18 - (s.waits.get(id) || 0) * 4 + (s.lastPlaying.has(id) ? 7 : -7), 0) + Math.random() * 14;
    if (score < chosenScore) { chosen = candidate; chosenScore = score; }
  }
  if (!chosen) return null;
  const fixed = chosen.filter((u) => u.ids.length === 2).map((u) => ({ ids: u.ids, fixed: true }));
  const singles = chosen.filter((u) => u.ids.length === 1).map((u) => u.ids[0]);
  let best = null, bestScore = Infinity;
  for (let n = 0; n < 1200; n++) {
    const order = shuffled(singles), teams = [...fixed];
    for (let i = 0; i < order.length; i += 2) teams.push({ ids: [order[i], order[i + 1]], fixed: false });
    const arranged = shuffled(teams); let score = 0;
    arranged.forEach((team) => { if (!team.fixed) { const key = pairKey(...team.ids); score += (s.partners.get(key) || 0) * 22 + (s.lastPartners.has(key) ? 85 : 0); } });
    for (let i = 0; i < arranged.length; i += 2) arranged[i].ids.forEach((x) => arranged[i + 1].ids.forEach((y) => { const key = pairKey(x, y); score += (s.opponents.get(key) || 0) * 6 + (s.lastOpponents.has(key) ? 25 : 0); }));
    score += Math.random() * 12; if (score < bestScore) { best = arranged; bestScore = score; }
  }
  if (!best) return null;
  const ref = (id) => ({ id, name: name(id) }), matches = [];
  for (let i = 0; i < best.length; i += 2) matches.push({ court: i / 2 + 1, a: best[i].ids.map(ref), b: best[i + 1].ids.map(ref) });
  const playing = new Set(matches.flatMap((m) => [...m.a, ...m.b].map((p) => p.id))), eligible = active.map((p) => ref(p.id));
  return { id: uid(), number: baseRounds.length + 1, eligible, matches, waiting: eligible.filter((p) => !playing.has(p.id)) };
}

function renderPlayers(s) {
  const list = [...state.players].sort(sortJa), paired = new Set(state.pairs.flatMap((p) => [p.a, p.b]));
  $("empty-roster").classList.toggle("hidden", list.length > 0); $("player-grid").classList.toggle("hidden", !list.length);
  $("player-grid").innerHTML = list.map((p) => {
    const badges = `${paired.has(p.id) ? '<span class="badge fixed">固定</span>' : ""}${p.selected && p.status === "resting" ? '<span class="badge">休憩中</span>' : ""}${p.selected && p.status === "left" ? '<span class="badge">退出</span>' : ""}`;
    const actions = !p.selected ? "" : p.status === "left" ? `<div class="player-actions"><button class="wide" data-action="available" data-id="${p.id}">↻ 復帰</button></div>` : `<div class="player-actions"><button data-action="${p.status === "resting" ? "available" : "resting"}" data-id="${p.id}">${p.status === "resting" ? "↻ 復帰" : "☕ 休憩"}</button><button data-action="left" data-id="${p.id}">⇥ 退出</button></div>`;
    return `<article class="player-card ${!p.selected || p.status === "left" ? "inactive" : ""}"><div class="player-top"><input type="checkbox" data-check="${p.id}" ${p.selected ? "checked" : ""} aria-label="${esc(p.name)}を本日の参加者にする"><div class="player-info"><div class="player-name">${esc(p.name)}</div><div class="badges">${badges}</div>${state.rounds.length ? `<div class="stats">出場 ${s.games.get(p.id) || 0}・待ち ${s.waits.get(p.id) || 0}</div>` : ""}</div><button class="delete" data-delete="${p.id}" aria-label="${esc(p.name)}を削除">×</button></div>${actions}</article>`;
  }).join("");
}

function renderPairs() {
  const paired = new Set(state.pairs.flatMap((p) => [p.a, p.b])), list = [...state.players].sort(sortJa);
  const optionsA = list.filter((p) => !paired.has(p.id)).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  $("pair-a").innerHTML = `<option value="">1人目</option>${optionsA}`;
  $("pair-b").innerHTML = `<option value="">2人目</option>${optionsA}`;
  $("fixed-pairs").innerHTML = state.pairs.map((p) => `<span class="pair-chip">${esc(name(p.a))} ＋ ${esc(name(p.b))}<button data-unpair="${p.id}" aria-label="固定解除">×</button></span>`).join("");
}

function teamHtml(team) {
  const fixed = state.pairs.some((p) => pairKey(p.a, p.b) === pairKey(team[0].id, team[1].id));
  return `<button class="team ${fixed ? "fixed" : ""}" data-team="${team[0].id}|${team[1].id}"><span>${esc(team[0].name)}</span><span>＋</span><span>${esc(team[1].name)}</span><span class="link-label">${fixed ? "⛓ 固定中" : "🔗 ペア固定"}</span></button>`;
}

function renderRound() {
  const round = state.rounds.at(-1); $("round-title").textContent = round ? `第${round.number}試合` : "対戦待ち";
  if (!round) $("round-content").innerHTML = `<div class="round-empty"><div class="shuffle">⇄</div><b>メンバーを選んで対戦作成</b><span>4名単位で出場者を選び、同じペアや対戦相手が続かないように組みます</span></div>`;
  else $("round-content").innerHTML = `<div class="matches">${round.matches.map((m) => `<article class="court"><div class="court-no"><small>COURT</small><b>${m.court}</b></div>${teamHtml(m.a)}<div class="vs">VS</div>${teamHtml(m.b)}</article>`).join("")}${round.waiting.length ? `<div class="waiting"><small>今回お休み</small><div>${round.waiting.map((p) => esc(p.name)).join("　")}</div></div>` : ""}<div class="round-actions"><button class="outline" id="redo">↻ この回を組み直す</button><button class="ghost" id="undo" aria-label="1つ前に戻す">↶</button></div></div>`;
  const old = state.rounds.slice(0, -1).reverse(); $("history-panel").classList.toggle("hidden", !old.length); $("history-count").textContent = `${old.length}回分`;
  $("history").innerHTML = old.map((r) => `<div class="history-item"><b>第${r.number}試合</b>${r.matches.map((m) => `<div>${m.court}面：${m.a.map((p) => esc(p.name)).join("・")} vs ${m.b.map((p) => esc(p.name)).join("・")}</div>`).join("")}</div>`).join("");
}

function render() {
  const s = stats(), { playable } = availability(), selected = state.players.filter((p) => p.selected).length;
  $("session-date").textContent = `${displayDate(state.date)}の対戦 ・ 日付が変わると自動リセット`;
  $("playable-count").textContent = playable.length; $("member-summary").textContent = `登録 ${state.players.length}名 ／ 本日選択 ${selected}名`;
  $("court-count").value = state.courts; $("footer-summary").textContent = `${playable.length}名対戦可能・最大${Math.min(state.courts, Math.floor(playable.length / 4))}面使用`;
  $("generate").disabled = playable.length < 4; renderPlayers(s); renderPairs(); renderRound(); save();
}

function setStatus(id, status) { const p = player(id); if (!p) return; p.selected = true; p.status = status; showMessage(status === "resting" ? `${p.name}さんを休憩にしました` : status === "left" ? `${p.name}さんを退出にしました` : `${p.name}さんが復帰しました`); render(); }
function toggleTeam(ids) {
  const existing = state.pairs.find((p) => pairKey(p.a, p.b) === pairKey(ids[0], ids[1]));
  if (existing) { state.pairs = state.pairs.filter((p) => p.id !== existing.id); showMessage(`${name(ids[0])}さん・${name(ids[1])}さんの固定を解除しました`); }
  else if (state.pairs.some((p) => ids.includes(p.a) || ids.includes(p.b))) showMessage("どちらかが別の固定ペアに入っています。先に解除してください");
  else { state.pairs.push({ id: uid(), a: ids[0], b: ids[1] }); showMessage(`${name(ids[0])}さん・${name(ids[1])}さんを固定しました`); }
  render();
}
function generate(replace = false) { const base = replace ? state.rounds.slice(0, -1) : state.rounds, round = makeRound(base); if (!round) { showMessage("対戦可能な人が4名以上必要です。固定ペアも確認してください"); return; } state.rounds = [...base, round]; showMessage(replace ? "同じ回を組み直しました" : `第${round.number}試合を作成しました`); render(); scrollTo({ top: 0, behavior: "smooth" }); }

function rosterCsv() {
  const partner = new Map(); state.pairs.forEach((p) => { partner.set(p.a, p.b); partner.set(p.b, p.a); });
  const quote = (v) => `"${String(v).replaceAll('"', '""')}"`;
  return "\uFEFF名前,固定ペア\n" + [...state.players].sort(sortJa).map((p) => `${quote(p.name)},${quote(partner.has(p.id) ? name(partner.get(p.id)) : "")}`).join("\n");
}
function rosterFile() { return new File([rosterCsv()], `バドミントンメンバー_${dateKey()}.csv`, { type: "text/csv;charset=utf-8" }); }
function download(file) { const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showMessage("メンバー表を書き出しました"); }
async function shareRoster() { if (!state.players.length) return showMessage("共有するメンバーがまだいません"); const file = rosterFile(); try { if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: "バドミントン メンバー表", text: "登録メンバーと固定ペアの共有用ファイルです。", files: [file] }); else download(file); } catch (e) { if (e.name !== "AbortError") download(file); } }
function parseLine(line) { const cells = []; let value = "", quoted = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { cells.push(value.trim()); value = ""; } else value += c; } cells.push(value.trim()); return cells; }
async function importRoster(file) {
  try {
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter((x) => x.trim()); if (lines.length < 2 || !parseLine(lines[0])[0].includes("名前")) throw Error();
    const rows = lines.slice(1).map(parseLine).filter((r) => r[0]), byName = new Map(state.players.map((p) => [p.name.trim().toLocaleLowerCase(), p.id]));
    rows.forEach(([n]) => { const key = n.trim().toLocaleLowerCase(); if (!byName.has(key)) { const id = uid(); byName.set(key, id); state.players.push({ id, name: n.trim(), selected: false, status: "available" }); } });
    const used = new Set(state.pairs.flatMap((p) => [p.a, p.b])); rows.forEach(([n, pn]) => { const a = byName.get(n.trim().toLocaleLowerCase()), b = byName.get((pn || "").trim().toLocaleLowerCase()); if (a && b && a !== b && !used.has(a) && !used.has(b)) { state.pairs.push({ id: uid(), a, b }); used.add(a); used.add(b); } });
    showMessage(`${rows.length}名のメンバー表を読み込みました`); render();
  } catch { showMessage("このアプリから書き出したCSVを選んでください"); }
}

for (let i = 1; i <= 8; i++) $("court-count").insertAdjacentHTML("beforeend", `<option value="${i}">${i}面</option>`);
$("add-form").addEventListener("submit", (e) => { e.preventDefault(); const names = $("name-input").value.split(/[、,\n]/).map((n) => n.trim()).filter(Boolean), existing = new Set(state.players.map((p) => p.name.toLocaleLowerCase())); let added = 0; names.forEach((n) => { if (!existing.has(n.toLocaleLowerCase())) { state.players.push({ id: uid(), name: n, selected: true, status: "available" }); existing.add(n.toLocaleLowerCase()); added++; } }); $("name-input").value = ""; showMessage(added ? `${added}名を追加しました` : "追加する名前を入力してください"); render(); });
$("select-all").onclick = () => { state.players.forEach((p) => { p.selected = true; p.status = "available"; }); render(); };
$("clear-all").onclick = () => { state.players.forEach((p) => { p.selected = false; }); render(); };
$("share-roster").onclick = shareRoster; $("import-button").onclick = () => $("file-input").click();
$("file-input").onchange = (e) => { const file = e.target.files[0]; e.target.value = ""; if (file) importRoster(file); };
$("court-count").onchange = (e) => { state.courts = Number(e.target.value); render(); };
$("add-pair").onclick = () => { const a = $("pair-a").value, b = $("pair-b").value; if (!a || !b || a === b) return showMessage("固定する2人を選んでください"); state.pairs.push({ id: uid(), a, b }); showMessage("固定ペアを登録しました"); render(); };
$("generate").onclick = () => generate(false);
document.addEventListener("change", (e) => { const id = e.target.dataset?.check; if (id) { const p = player(id); p.selected = e.target.checked; if (p.selected) p.status = "available"; render(); } });
document.addEventListener("click", (e) => { const target = e.target.closest("[data-action],[data-delete],[data-unpair],[data-team],#redo,#undo"); if (!target) return; if (target.dataset.action) setStatus(target.dataset.id, target.dataset.action); else if (target.dataset.delete) { state.players = state.players.filter((p) => p.id !== target.dataset.delete); state.pairs = state.pairs.filter((p) => p.a !== target.dataset.delete && p.b !== target.dataset.delete); render(); } else if (target.dataset.unpair) { state.pairs = state.pairs.filter((p) => p.id !== target.dataset.unpair); render(); } else if (target.dataset.team) toggleTeam(target.dataset.team.split("|")); else if (target.id === "redo") generate(true); else if (target.id === "undo") { state.rounds.pop(); showMessage("1つ前の対戦作成を取り消しました"); render(); } });
function resetIfNewDay() { if (state.date === dateKey()) return; state.date = dateKey(); state.rounds = []; state.pairs = []; state.players.forEach((p) => { p.selected = false; p.status = "available"; }); showMessage("新しい日になったため、今日の組み合わせをリセットしました"); render(); }
addEventListener("focus", resetIfNewDay); setInterval(resetIfNewDay, 60000); render();

let installPrompt = null;
const installButton = $("install-app");
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (standalone) installButton.classList.add("hidden");
addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; });
addEventListener("appinstalled", () => { installPrompt = null; installButton.classList.add("hidden"); });
installButton.addEventListener("click", async () => {
  if (installPrompt) { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) alert("画面下の共有ボタンを押し、「ホーム画面に追加」→「追加」を選んでください。");
  else alert("ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。");
});

if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));
