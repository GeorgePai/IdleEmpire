(() => {
'use strict';
const TICK_MS = 3_000;
const SUBTICK_MS = 120;
const INITIAL_CASH = 10_000;
const WIN_TARGET = 10_000_000;
const VISIBLE_TICKS = 80;
const TOTAL_HISTORY = 240;
const DRIFT = 0.0008;
const VOL = 0.018;
const NEWS_PROB = 0.005;
const CRASH_PROB = 0.001;
const NEWS_TEXTS = {
  good:  ['利多消息 / 技術突破', '產品熱賣 / 看好', '財報超預期', '法人加碼', '政策利多'],
  bad:   ['利空消息 / 技術受挫', '對手推競品', '財報不如預期', '法人減碼', '行業逆風'],
  crash: ['黑天鵝 / 市場恐慌', '流動性危機', '系統性風險爆發'],
  surge: ['獨家利多 / 爆量', '法人狂買進場', '產業劇變利多']
};
const state = {
  prices: [], basePrice: 100, tick: 0, trend: 0, trendTicks: 0,
  startTime: Date.now(), cash: INITIAL_CASH, shares: 0, avgCost: 0,
  trades: 0, won: false, qtyMode: '100', muted: false,
  displayPrice: 100, flashUntil: 0, flashColor: null,
};
let bgm = null;
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;
function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function nextPrice() {
  const last = state.prices.length ? state.prices[state.prices.length - 1].p : state.basePrice;
  let drift = DRIFT + state.trend;
  if (state.trendTicks > 0) { state.trendTicks--; if (state.trendTicks === 0) state.trend = 0; }
  if (Math.random() < 0.01) { state.trend = (Math.random() - 0.5) * 0.004; state.trendTicks = 30 + Math.floor(Math.random() * 60); }
  if (state.prices.length > 20) {
    const recent = state.prices.slice(-20).map(p => p.p);
    const hi = Math.max(...recent), lo = Math.min(...recent);
    if (last >= hi * 0.99) drift -= 0.002;
    if (last <= lo * 1.01) drift += 0.002;
  }
  let r = drift + VOL * gauss();
  let eventTxt = null, eventKind = null;
  if (Math.random() < NEWS_PROB) {
    if (Math.random() < 0.55) { r += 0.04 + Math.random() * 0.04; eventTxt = NEWS_TEXTS.good[Math.floor(Math.random() * NEWS_TEXTS.good.length)]; eventKind = 'good'; }
    else { r -= 0.04 + Math.random() * 0.04; eventTxt = NEWS_TEXTS.bad[Math.floor(Math.random() * NEWS_TEXTS.bad.length)]; eventKind = 'bad'; }
  }
  if (Math.random() < CRASH_PROB) {
    if (Math.random() < 0.5) { r -= 0.08 + Math.random() * 0.10; eventTxt = NEWS_TEXTS.crash[Math.floor(Math.random() * NEWS_TEXTS.crash.length)]; eventKind = 'crash'; }
    else { r += 0.08 + Math.random() * 0.10; eventTxt = NEWS_TEXTS.surge[Math.floor(Math.random() * NEWS_TEXTS.surge.length)]; eventKind = 'surge'; }
  }
  const p = Math.max(0.5, last * (1 + r));
  const v = Math.round(500 + Math.random() * 1500 + Math.abs(r) * 80000);
  return { p, v, event: eventTxt, kind: eventKind };
}
function tick() {
  const next = nextPrice();
  const high = next.p * (1 + Math.random() * 0.008);
  const low = next.p * (1 - Math.random() * 0.008);
  state.prices.push({ t: state.tick++, p: next.p, v: next.v, h: high, l: low });
  if (state.prices.length > TOTAL_HISTORY) state.prices.shift();
  if (next.event) {
    log(`${next.event}`, 'news');
    if (next.kind === 'crash') { playSfx('crash'); toast(next.event, 'crash'); }
    else if (next.kind === 'surge') { playSfx('surge'); toast(next.event, 'surge'); }
    else { toast(next.event, 'news', 1500); }
  }
  state.flashUntil = performance.now() + 500;
  state.flashColor = next.p >= state.displayPrice ? 'up' : 'down';
  renderStats();
  checkWin();
}
function subtick() {
  if (state.prices.length === 0) return;
  const target = state.prices[state.prices.length - 1].p;
  const diff = target - state.displayPrice;
  state.displayPrice += diff * 0.18;
  state.displayPrice *= (1 + (Math.random() - 0.5) * 0.0008);
  renderPriceLine();
  renderGauges();
}
const $ = (id) => document.getElementById(id);
function maArray(period) {
  const arr = new Array(state.prices.length);
  for (let i = 0; i < state.prices.length; i++) {
    if (i + 1 < period) { arr[i] = null; continue; }
    let sum = 0;
    for (let j = i + 1 - period; j <= i; j++) sum += state.prices[j].p;
    arr[i] = sum / period;
  }
  return arr;
}
function heatValue() {
  const win = 14;
  if (state.prices.length < win + 1) return 50;
  const recent = state.prices.slice(-(win+1));
  let gain = 0, loss = 0;
  for (let i = 1; i < recent.length; i++) { const d = recent[i].p - recent[i-1].p; if (d > 0) gain += d; else loss -= d; }
  if (gain + loss === 0) return 50;
  const rs = gain / Math.max(0.0001, loss);
  return 100 - 100 / (1 + rs);
}
function momentum() {
  if (state.prices.length < 11) return 0;
  const cur = state.prices[state.prices.length - 1].p;
  const ago = state.prices[state.prices.length - 11].p;
  return ((cur - ago) / ago) * 100;
}
function fmt(n) {
  if (n >= 100_000_000) return (n/100_000_000).toFixed(2) + ' 億';
  if (n >= 10_000) return (n/10_000).toFixed(2) + ' 萬';
  return Number(Math.round(n * 100) / 100).toLocaleString();
}
function renderStats() {
  if (!state.prices.length) return;
  const cur = state.prices[state.prices.length - 1].p;
  const prev = state.prices.length > 1 ? state.prices[state.prices.length - 2].p : cur;
  const chg = cur - prev;
  const chgPct = (chg / prev) * 100;
  $('cashLabel').textContent = fmt(state.cash);
  $('sharesLabel').textContent = state.shares.toLocaleString();
  $('avgCostLabel').textContent = state.shares > 0 ? `成本 ${state.avgCost.toFixed(2)}` : '';
  const equity = state.cash + state.shares * cur;
  $('equityLabel').textContent = fmt(equity);
  const pnl = ((equity - INITIAL_CASH) / INITIAL_CASH) * 100;
  const pnlEl = $('pnlLabel');
  pnlEl.textContent = (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '%';
  pnlEl.className = 'sub ' + (pnl >= 0 ? 'up' : 'down');
  const goalPct = Math.min(100, equity / WIN_TARGET * 100);
  $('goalProgress').style.width = goalPct + '%';
  $('goalPctLabel').textContent = goalPct.toFixed(2) + '%';
  $('priceNow').textContent = state.displayPrice.toFixed(2);
  const chgEl = $('priceChange');
  chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chg >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)`;
  chgEl.className = 'priceChange ' + (chg >= 0 ? 'up' : 'down');
  $('volNowLabel').textContent = state.prices[state.prices.length-1].v.toLocaleString();
  renderTimeAxis();
}
function renderPriceLine() {
  if (!state.prices.length) return;
  $('priceNow').textContent = state.displayPrice.toFixed(2);
  drawPriceChart(); drawVolChart(); drawChipChart();
}
function renderGauges() { drawHeatGauge(); drawMomentumGauge(); }
function setCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}
function renderTimeAxis() {
  const el = $('timeAxis');
  const now = new Date();
  const labels = [];
  for (let i = 4; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 60_000);
    labels.push(`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`);
  }
  el.innerHTML = labels.map(l => `<span>${l}</span>`).join('');
}
function drawPriceChart() {
  const c = $('priceChart');
  const { ctx, W, H } = setCanvas(c);
  const data = state.prices.slice(-VISIBLE_TICKS);
  if (data.length < 2) return;
  const prices = data.map((d, i) => i === data.length - 1 ? state.displayPrice : d.p);
  const highs = data.map(d => d.h || d.p);
  const lows = data.map(d => d.l || d.p);
  const lo = Math.min(...lows) * 0.998;
  const hi = Math.max(...highs) * 1.002;
  const padR = 50;
  const chartW = W - padR;
  const xStep = chartW / (data.length - 1);
  const px = (i) => i * xStep;
  const py = (p) => 12 + (H - 24) * (1 - (p - lo) / (hi - lo));
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = 12 + (H - 24) * g / 4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  for (let g = 0; g <= 4; g++) {
    const x = chartW * g / 4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  ctx.fillStyle = '#555c6e';
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const y = 12 + (H - 24) * g / 4;
    const priceLabel = (hi - (hi - lo) * g / 4).toFixed(2);
    ctx.fillText(priceLabel, chartW + 4, y);
  }
  const startP = prices[0], endP = prices[prices.length - 1];
  const up = endP >= startP;
  const lineColor = up ? '#26a69a' : '#ef5350';
  const glowColor = up ? 'rgba(38,166,154,0.5)' : 'rgba(239,83,80,0.5)';
  const fillGrad = ctx.createLinearGradient(0, 12, 0, H - 12);
  fillGrad.addColorStop(0, up ? 'rgba(38,166,154,0.20)' : 'rgba(239,83,80,0.20)');
  fillGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fillGrad;
  ctx.beginPath();
  ctx.moveTo(px(0), py(prices[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(px(i), py(prices[i]));
  ctx.lineTo(px(data.length - 1), H - 12);
  ctx.lineTo(px(0), H - 12);
  ctx.closePath(); ctx.fill();
  ctx.shadowColor = glowColor; ctx.shadowBlur = 8;
  ctx.strokeStyle = lineColor; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(px(0), py(prices[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(px(i), py(prices[i]));
  ctx.stroke();
  ctx.shadowBlur = 0;
  const ma5 = maArray(5).slice(-VISIBLE_TICKS);
  ctx.strokeStyle = 'rgba(240, 185, 11, 0.85)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < ma5.length; i++) {
    if (ma5[i] == null) continue;
    if (!started) { ctx.moveTo(px(i), py(ma5[i])); started = true; } else ctx.lineTo(px(i), py(ma5[i]));
  }
  ctx.stroke();
  const ma20 = maArray(20).slice(-VISIBLE_TICKS);
  ctx.strokeStyle = 'rgba(41, 98, 255, 0.85)'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  started = false;
  for (let i = 0; i < ma20.length; i++) {
    if (ma20[i] == null) continue;
    if (!started) { ctx.moveTo(px(i), py(ma20[i])); started = true; } else ctx.lineTo(px(i), py(ma20[i]));
  }
  ctx.stroke();
  if (state.shares > 0 && state.avgCost >= lo && state.avgCost <= hi) {
    const y = py(state.avgCost);
    ctx.strokeStyle = 'rgba(240, 185, 11, 0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b90b';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('成本 ' + state.avgCost.toFixed(2), 4, y - 2);
  }
  const curY = py(endP);
  ctx.fillStyle = lineColor;
  ctx.fillRect(chartW, curY - 8, padR - 2, 16);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px JetBrains Mono';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(state.displayPrice.toFixed(2), chartW + (padR - 2) / 2, curY);
  const flash = performance.now() < state.flashUntil;
  const dotR = flash ? 6 : 4;
  ctx.shadowColor = glowColor; ctx.shadowBlur = flash ? 16 : 10;
  ctx.fillStyle = lineColor;
  ctx.beginPath(); ctx.arc(px(data.length - 1), curY, dotR, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(px(data.length - 1), curY, 1.5, 0, Math.PI * 2); ctx.fill();
}
function drawVolChart() {
  const c = $('volChart');
  const { ctx, W, H } = setCanvas(c);
  const data = state.prices.slice(-60);
  if (data.length < 2) return;
  const vols = data.map(d => d.v);
  const maxV = Math.max(...vols, 1);
  const xStep = W / data.length;
  const bw = Math.max(1, xStep - 1);
  for (let i = 0; i < data.length; i++) {
    const v = data[i].v;
    const h = (v / maxV) * (H - 2);
    const prev = i > 0 ? data[i-1].p : data[i].p;
    const up = data[i].p >= prev;
    ctx.fillStyle = up ? 'rgba(38, 166, 154, 0.55)' : 'rgba(239, 83, 80, 0.55)';
    ctx.fillRect(i * xStep, H - h - 1, bw, h);
  }
}
function drawChipChart() {
  const c = $('chipChart');
  const { ctx, W, H } = setCanvas(c);
  const data = state.prices.slice(-TOTAL_HISTORY);
  if (data.length < 2) return;
  const prices = data.map(d => d.p);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  if (hi <= lo) return;
  const bins = 14;
  const buckets = new Array(bins).fill(0);
  for (const d of data) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((d.p - lo) / (hi - lo) * bins)));
    buckets[b] += d.v;
  }
  const maxB = Math.max(...buckets, 1);
  const yStep = H / bins;
  const padR = 2;
  for (let b = 0; b < bins; b++) {
    const w = (buckets[b] / maxB) * (W - padR);
    const y = H - (b + 1) * yStep + 0.5;
    const grad = ctx.createLinearGradient(0, y, w, y);
    grad.addColorStop(0, 'rgba(41, 98, 255, 0.55)');
    grad.addColorStop(1, 'rgba(41, 98, 255, 0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, w, yStep - 1);
  }
  const cur = state.displayPrice;
  if (cur >= lo && cur <= hi) {
    const curBin = (cur - lo) / (hi - lo) * bins;
    const curY = H - curBin * yStep;
    ctx.strokeStyle = '#f0b90b'; ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(0, curY); ctx.lineTo(W, curY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b90b';
    ctx.font = '9px JetBrains Mono';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(cur.toFixed(2), W - 2, curY - 5);
  }
}
function drawArcGauge(c, value, opts) {
  const { ctx, W, H } = setCanvas(c);
  const cx = W / 2;
  const cy = H * 0.92;
  const r = Math.min(W * 0.42, H * 0.85);
  const startA = Math.PI;
  const endA = 0;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a1 = startA + (endA - startA) * i / 3;
    const a2 = startA + (endA - startA) * (i + 1) / 3;
    ctx.strokeStyle = opts.bands[i];
    ctx.beginPath(); ctx.arc(cx, cy, r, a1, a2); ctx.stroke();
  }
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const needleA = startA + (endA - startA) * pct;
  ctx.strokeStyle = opts.activeColor; ctx.lineWidth = 4;
  ctx.shadowColor = opts.activeColor; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(cx, cy, r, startA, needleA); ctx.stroke();
  ctx.shadowBlur = 0;
  const nx = cx + Math.cos(needleA) * (r - 6);
  const ny = cy + Math.sin(needleA) * (r - 6);
  ctx.strokeStyle = '#d1d4dc'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
  ctx.fillStyle = '#d1d4dc';
  ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = opts.activeColor;
  ctx.font = 'bold 13px JetBrains Mono';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(opts.label, cx, cy - r * 0.45);
}
function drawHeatGauge() {
  const heat = heatValue();
  drawArcGauge($('heatGauge'), heat, {
    bands: ['rgba(41,98,255,0.25)', 'rgba(240,185,11,0.25)', 'rgba(239,83,80,0.25)'],
    activeColor: heat > 70 ? '#ef5350' : heat < 30 ? '#2962ff' : '#f0b90b',
    label: Math.round(heat).toString(),
  });
  const el = $('heatStatus');
  if (heat > 70) { el.textContent = '過熱'; el.style.color = '#ef5350'; }
  else if (heat < 30) { el.textContent = '冷清'; el.style.color = '#2962ff'; }
  else { el.textContent = '中性'; el.style.color = '#8b95a8'; }
}
function drawMomentumGauge() {
  const m = momentum();
  const v = Math.max(0, Math.min(100, (m + 5) / 10 * 100));
  drawArcGauge($('momentumGauge'), v, {
    bands: ['rgba(239,83,80,0.25)', 'rgba(139,149,168,0.25)', 'rgba(38,166,154,0.25)'],
    activeColor: m > 0.5 ? '#26a69a' : m < -0.5 ? '#ef5350' : '#8b95a8',
    label: (m >= 0 ? '+' : '') + m.toFixed(2) + '%',
  });
  const el = $('momentumStatus');
  if (m > 1) { el.textContent = '強多'; el.style.color = '#26a69a'; }
  else if (m > 0.2) { el.textContent = '偏多'; el.style.color = '#26a69a'; }
  else if (m < -1) { el.textContent = '強空'; el.style.color = '#ef5350'; }
  else if (m < -0.2) { el.textContent = '偏空'; el.style.color = '#ef5350'; }
  else { el.textContent = '盤整'; el.style.color = '#8b95a8'; }
}
function currentPrice() { return state.prices.length ? state.prices[state.prices.length - 1].p : state.basePrice; }
function getQty() {
  const mode = state.qtyMode;
  const p = currentPrice();
  if (mode === 'max') return Math.floor(state.cash / p);
  const raw = parseInt($('qtyInput').value, 10);
  return Math.max(1, isNaN(raw) ? 0 : raw);
}
function buy() {
  const p = currentPrice();
  let qty = getQty();
  if (p * qty > state.cash) { qty = Math.floor(state.cash / p); if (qty <= 0) { toast('現金不足'); return; } }
  const totalCost = state.avgCost * state.shares + p * qty;
  state.shares += qty;
  state.avgCost = totalCost / state.shares;
  state.cash -= p * qty;
  state.trades++;
  log(`買 ${qty} @${p.toFixed(2)} = ${fmt(p*qty)}`, 'buy');
  playSfx('buy'); renderStats();
}
function sell() {
  if (state.shares <= 0) { toast('沒有持倉'); return; }
  const p = currentPrice();
  let qty = state.qtyMode === 'max' ? state.shares : Math.min(state.shares, getQty());
  if (qty <= 0) return;
  const proceeds = p * qty;
  const profit = (p - state.avgCost) * qty;
  state.cash += proceeds;
  state.shares -= qty;
  if (state.shares === 0) state.avgCost = 0;
  state.trades++;
  log(`賣 ${qty} @${p.toFixed(2)} ${profit >= 0 ? '+' : ''}${fmt(profit)}`, 'sell');
  playSfx('sell'); renderStats();
}
function log(msg, cls = '') {
  const el = $('logArea');
  const line = document.createElement('div');
  line.className = 'log-entry ' + cls;
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  line.textContent = `${ts}  ${msg}`;
  el.insertBefore(line, el.firstChild);
  while (el.childNodes.length > 30) el.removeChild(el.lastChild);
}
function toast(msg, cls = '', dur = 2400) {
  const t = $('toast');
  t.textContent = msg; t.className = cls;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), dur);
}
function playSfx(kind) {
  if (state.muted || !audioCtx) return;
  const now = audioCtx.currentTime;
  if (kind === 'buy') { beep(660, 0.06, now, 0.25); beep(880, 0.08, now + 0.07, 0.25); }
  else if (kind === 'sell') { beep(523, 0.08, now, 0.25); beep(392, 0.10, now + 0.09, 0.25); }
  else if (kind === 'crash') { beep(120, 0.7, now, 0.35, 'sawtooth'); beep(90, 0.7, now + 0.1, 0.25, 'sawtooth'); }
  else if (kind === 'surge') { [880, 1100, 1320].forEach((f, i) => beep(f, 0.08, now + i*0.07, 0.25)); }
  else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.2, now + i*0.13, 0.35)); }
}
function beep(freq, dur, startAt, gain, type = 'square') {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, startAt);
  g.gain.setValueAtTime(gain, startAt);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(startAt); o.stop(startAt + dur + 0.05);
}
function setupBGM() {
  bgm = new Audio('./assets/audio/bgm.mp3');
  bgm.loop = true; bgm.volume = 0.22;
  const start = () => {
    if (state.muted) return;
    bgm.play().catch(()=>{});
    window.removeEventListener('mousedown', start);
    window.removeEventListener('touchstart', start);
    window.removeEventListener('keydown', start);
  };
  window.addEventListener('mousedown', start);
  window.addEventListener('touchstart', start, { passive: true });
  window.addEventListener('keydown', start);
}
function toggleMute() {
  state.muted = !state.muted;
  $('muteBtn').textContent = state.muted ? '♪̷' : '♪';
  if (bgm) { if (state.muted) bgm.pause(); else bgm.play().catch(()=>{}); }
}
function checkWin() {
  if (state.won) return;
  const equity = state.cash + state.shares * currentPrice();
  if (equity >= WIN_TARGET) {
    state.won = true;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
    $('winTime').textContent = `${mins} 分 ${secs} 秒`;
    $('winTrades').textContent = state.trades;
    $('winScreen').classList.remove('hidden');
    playSfx('win');
  }
}
function init() {
  state.prices = [{ t: 0, p: state.basePrice, v: 1000, h: state.basePrice, l: state.basePrice }];
  for (let i = 1; i < 40; i++) {
    state.tick = i;
    const next = nextPrice();
    state.prices.push({ t: i, p: next.p, v: next.v, h: next.p * (1 + Math.random() * 0.008), l: next.p * (1 - Math.random() * 0.008) });
  }
  state.tick = state.prices.length;
  state.displayPrice = state.prices[state.prices.length - 1].p;
  document.querySelectorAll('.qtyBtn').forEach(btn => {
    btn.onclick = () => {
      state.qtyMode = btn.dataset.qty;
      document.querySelectorAll('.qtyBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.qtyMode !== 'max') $('qtyInput').value = state.qtyMode;
    };
  });
  $('qtyInput').addEventListener('focus', () => {
    document.querySelectorAll('.qtyBtn').forEach(b => b.classList.remove('active'));
    state.qtyMode = $('qtyInput').value;
  });
  $('qtyInput').addEventListener('input', () => { state.qtyMode = $('qtyInput').value; });
  $('qtyInput').value = '100';
  $('buyBtn').onclick = buy;
  $('sellBtn').onclick = sell;
  $('muteBtn').onclick = toggleMute;
  $('restartBtn').onclick = () => location.reload();
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'b' || e.key === 'B') buy();
    if (e.key === 's' || e.key === 'S') sell();
  });
  setupBGM();
  renderStats(); renderPriceLine(); renderGauges();
  setInterval(tick, TICK_MS);
  setInterval(subtick, SUBTICK_MS);
  window.addEventListener('resize', () => { renderPriceLine(); renderGauges(); });
}
window.addEventListener('DOMContentLoaded', init);
})();
