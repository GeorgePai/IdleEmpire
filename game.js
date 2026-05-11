(() => {
'use strict';
const TICK_MS = 1_000;
const SUBTICK_MS = 100;
const PANEL_UPDATE_MS = 2500;   // v0.4 大字面板每 2.5 秒才跳更新
const INITIAL_CASH = 10_000;
const WIN_TARGET = 50_000;      // v0.4 目標降至 5 萬
const VISIBLE_CANDLES_BASE = 40;
const TOTAL_HISTORY = 600;      // 10 分鐘 (600 tick * 1s)
const DRIFT = 0.0004;
const VOL = 0.014;
const NEWS_PROB = 0.003;
const CRASH_PROB = 0.0006;
const NEWS_TEXTS = {
  good:  ['利多消息 / 技術突破', '產品熱賣 / 看好', '財報超預期', '法人加碼', '政策利多'],
  bad:   ['利空消息 / 技術受挫', '對手推競品', '財報不如預期', '法人減碼', '行業逆風'],
  crash: ['黑天鵝 / 市場恐慌', '流動性危機', '系統性風險爆發'],
  surge: ['獨家利多 / 爆量', '法人狂買進場', '產業劇變利多']
};

const state = {
  prices: [],
  basePrice: 100, tick: 0, trend: 0, trendTicks: 0,
  startTime: Date.now(),
  cash: INITIAL_CASH, shares: 0, avgCost: 0,
  trades: 0, won: false,
  qtyMode: '100', muted: false,
  displayPrice: 100, flashUntil: 0,

  candlePeriod: 15,
  ma1Period: 5, ma1On: true,
  ma2Period: 20, ma2On: true,
  showVol: false, showChip: false,

  // v0.4 互動
  viewOffset: 0,         // 0 = 最新；正值 = 往歷史滾
  yScaleMult: 1,         // 1 = 自動；>1 寬鬆；<1 緊湊

  // v0.4 跳動式面板更新
  lastPanelUpdate: 0,
  shownPrice: 100,
  shownChg: 0,
  shownChgPct: 0,
  shownPnlPct: 0,
  shownPnlAmount: 0,
};

let bgm = null;
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;

function gauss() {
  let u=0,v=0;
  while(u===0)u=Math.random(); while(v===0)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

function nextPrice() {
  const last = state.prices.length ? state.prices[state.prices.length - 1].p : state.basePrice;
  let drift = DRIFT + state.trend;
  if (state.trendTicks > 0) { state.trendTicks--; if (state.trendTicks === 0) state.trend = 0; }
  if (Math.random() < 0.005) { state.trend = (Math.random() - 0.5) * 0.003; state.trendTicks = 60 + Math.floor(Math.random() * 120); }
  if (state.prices.length > 60) {
    const recent = state.prices.slice(-60).map(p => p.p);
    const hi = Math.max(...recent), lo = Math.min(...recent);
    if (last >= hi * 0.99) drift -= 0.001;
    if (last <= lo * 1.01) drift += 0.001;
  }
  let r = drift + VOL * gauss();
  let eventTxt = null, eventKind = null;
  if (Math.random() < NEWS_PROB) {
    if (Math.random() < 0.55) { r += 0.03 + Math.random() * 0.03; eventTxt = NEWS_TEXTS.good[Math.floor(Math.random()*NEWS_TEXTS.good.length)]; eventKind='good'; }
    else { r -= 0.03 + Math.random() * 0.03; eventTxt = NEWS_TEXTS.bad[Math.floor(Math.random()*NEWS_TEXTS.bad.length)]; eventKind='bad'; }
  }
  if (Math.random() < CRASH_PROB) {
    if (Math.random() < 0.5) { r -= 0.06 + Math.random() * 0.08; eventTxt = NEWS_TEXTS.crash[Math.floor(Math.random()*NEWS_TEXTS.crash.length)]; eventKind='crash'; }
    else { r += 0.06 + Math.random() * 0.08; eventTxt = NEWS_TEXTS.surge[Math.floor(Math.random()*NEWS_TEXTS.surge.length)]; eventKind='surge'; }
  }
  const p = Math.max(0.5, last * (1 + r));
  const v = Math.round(500 + Math.random() * 1500 + Math.abs(r) * 60000);
  return { p, v, event: eventTxt, kind: eventKind };
}

function tick() {
  const next = nextPrice();
  state.prices.push({ t: state.tick, p: next.p, v: next.v });
  state.tick++;
  if (state.prices.length > TOTAL_HISTORY) state.prices.shift();
  if (next.event) {
    log(`${next.event}`, 'news');
    if (next.kind === 'crash') { playSfx('crash'); toast(next.event, 'crash'); }
    else if (next.kind === 'surge') { playSfx('surge'); toast(next.event, 'surge'); }
    else { toast(next.event, 'news', 1500); }
  }
  state.flashUntil = performance.now() + 400;
  checkWin();
}

/* ============== K-LINE AGGREGATION (用 tick.t 絕對分組，已收盤的 K 不再改) ============== */
function buildCandles(period) {
  const ticksPerCandle = period;
  const candles = [];
  let cur = null;
  for (const td of state.prices) {
    const groupIdx = Math.floor(td.t / ticksPerCandle);
    if (!cur || cur.gi !== groupIdx) {
      if (cur) candles.push(cur);
      cur = {
        gi: groupIdx,
        startTick: groupIdx * ticksPerCandle,
        startTime: state.startTime + (groupIdx * ticksPerCandle) * TICK_MS,
        o: td.p, h: td.p, l: td.p, c: td.p, v: 0
      };
    }
    if (td.p > cur.h) cur.h = td.p;
    if (td.p < cur.l) cur.l = td.p;
    cur.c = td.p;
    cur.v += td.v;
  }
  if (cur) candles.push(cur);
  return candles;
}

function maOnCandles(candles, period) {
  const arr = new Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    if (i + 1 < period) { arr[i] = null; continue; }
    let sum = 0;
    for (let j = i + 1 - period; j <= i; j++) sum += candles[j].c;
    arr[i] = sum / period;
  }
  return arr;
}

const $ = (id) => document.getElementById(id);

function fmt(n) {
  if (n >= 100_000_000) return (n/100_000_000).toFixed(2) + ' 億';
  if (n >= 10_000) return (n/10_000).toFixed(2) + ' 萬';
  return Number(Math.round(n*100)/100).toLocaleString();
}

/* ============== Position Panel — 跳動式更新 ============== */
function maybeUpdatePanel(force = false) {
  if (!state.prices.length) return;
  const now = performance.now();
  if (!force && now - state.lastPanelUpdate < PANEL_UPDATE_MS) return;
  state.lastPanelUpdate = now;

  const cur = state.prices[state.prices.length - 1].p;
  const prev = state.shownPrice;
  const chg = cur - prev;
  const chgPct = (chg / Math.max(0.01, prev)) * 100;

  // 即時價
  const priceEl = $('priceNow');
  const oldVal = state.shownPrice;
  state.shownPrice = cur;
  priceEl.textContent = cur.toFixed(2);
  // 跳動 flash 動畫
  priceEl.classList.remove('tick-up', 'tick-down');
  void priceEl.offsetWidth;
  if (cur > oldVal) priceEl.classList.add('tick-up');
  else if (cur < oldVal) priceEl.classList.add('tick-down');

  // 漲跌
  const chgEl = $('priceChange');
  chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chg >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)`;
  chgEl.className = 'posTick ' + (chg >= 0 ? 'up' : 'down');

  // 現金/持倉/成本/總資產
  $('cashLabel').textContent = fmt(state.cash);
  $('sharesLabel').textContent = state.shares.toLocaleString();
  $('avgCostLabel').textContent = state.shares > 0 ? state.avgCost.toFixed(2) : '--';
  const equity = state.cash + state.shares * cur;
  $('equityLabel').textContent = fmt(equity);

  // P&L
  const pnlEl = $('pnlPct');
  const pnlAmtEl = $('pnlAmount');
  if (state.shares > 0) {
    const cost = state.avgCost * state.shares;
    const market = cur * state.shares;
    const pnlAmt = market - cost;
    const pnlPct = (pnlAmt / cost) * 100;
    pnlEl.textContent = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%';
    pnlEl.className = 'posPnl ' + (pnlPct > 0.01 ? 'up' : pnlPct < -0.01 ? 'down' : 'flat');
    pnlAmtEl.textContent = (pnlAmt >= 0 ? '+' : '') + pnlAmt.toFixed(2);
    pnlAmtEl.className = 'posTick ' + (pnlAmt >= 0 ? 'up' : 'down');
  } else {
    // 沒持倉 — 顯示整體資金盈虧
    const totalPnl = (state.cash + state.shares * cur) - INITIAL_CASH;
    const totalPnlPct = (totalPnl / INITIAL_CASH) * 100;
    pnlEl.textContent = (totalPnlPct >= 0 ? '+' : '') + totalPnlPct.toFixed(2) + '%';
    pnlEl.className = 'posPnl ' + (totalPnlPct > 0.01 ? 'up' : totalPnlPct < -0.01 ? 'down' : 'flat');
    pnlAmtEl.textContent = (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2);
    pnlAmtEl.className = 'posTick ' + (totalPnl >= 0 ? 'up' : 'down');
  }

  // 目標進度
  const goalPct = Math.min(100, equity / WIN_TARGET * 100);
  $('goalProgress').style.width = goalPct + '%';
  $('goalPctLabel').textContent = goalPct.toFixed(2) + '%';

  if (state.showVol) $('volNowLabel').textContent = state.prices[state.prices.length-1].v.toLocaleString();
}

function subtick() {
  if (state.prices.length === 0) return;
  const target = state.prices[state.prices.length - 1].p;
  const diff = target - state.displayPrice;
  state.displayPrice += diff * 0.22;
  state.displayPrice *= (1 + (Math.random() - 0.5) * 0.0006);
  drawChartArea();
  maybeUpdatePanel(false);   // 內部會判斷是否到時間更新
}

function drawChartArea() {
  if (!state.prices.length) return;
  drawCandleChart();
  if (state.showVol) drawVolChart();
  if (state.showChip) drawChipChart();
}

function setCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  return { ctx, W, H };
}

/* ============== Candle Chart with pan/zoom ============== */
function drawCandleChart() {
  const c = $('priceChart');
  const { ctx, W, H } = setCanvas(c);
  const allCandles = buildCandles(state.candlePeriod);
  if (allCandles.length < 1) return;

  const N = VISIBLE_CANDLES_BASE;
  // viewOffset = 0 → 顯示最後 N 根；offset 越大越往前看
  const endIdx = Math.max(N, allCandles.length - state.viewOffset);
  const startIdx = Math.max(0, endIdx - N);
  const candles = allCandles.slice(startIdx, endIdx);
  if (candles.length < 1) return;

  // 是否在看歷史（顯示 reset 按鈕）
  $('resetViewBtn').classList.toggle('hidden', state.viewOffset === 0);

  // 只在「看最新」時才用 displayPrice tween 最後一根 K 的 close
  const isLive = state.viewOffset === 0;
  if (isLive) {
    const last = candles[candles.length - 1];
    const tweenedClose = state.displayPrice;
    candles[candles.length - 1] = {
      ...last, c: tweenedClose,
      h: Math.max(last.h, tweenedClose),
      l: Math.min(last.l, tweenedClose),
    };
  }

  // Y 範圍 + scale
  const rawLo = Math.min(...candles.map(k => k.l));
  const rawHi = Math.max(...candles.map(k => k.h));
  const center = (rawLo + rawHi) / 2;
  const half = (rawHi - rawLo) / 2;
  const expandedHalf = half * state.yScaleMult;
  const lo = (center - expandedHalf) * 0.998;
  const hi = (center + expandedHalf) * 1.002;

  const padR = 50;
  const chartW = W - padR;
  const candleW = chartW / candles.length;
  const bodyW = Math.max(2, candleW * 0.7);

  const py = (p) => 12 + (H - 24) * (1 - (p - lo) / Math.max(0.001, (hi - lo)));

  // 網格
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
  // 價格刻度
  ctx.fillStyle = '#555c6e';
  ctx.font = '10px JetBrains Mono';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let g = 0; g <= 4; g++) {
    const y = 12 + (H - 24) * g / 4;
    const priceLabel = (hi - (hi - lo) * g / 4).toFixed(2);
    ctx.fillText(priceLabel, chartW + 4, y);
  }

  // K 線
  for (let i = 0; i < candles.length; i++) {
    const k = candles[i];
    const cx = (i + 0.5) * candleW;
    const up = k.c >= k.o;
    const color = up ? '#26a69a' : '#ef5350';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, py(k.h));
    ctx.lineTo(cx, py(k.l));
    ctx.stroke();
    const yTop = py(Math.max(k.o, k.c));
    const yBot = py(Math.min(k.o, k.c));
    const height = Math.max(1, yBot - yTop);
    ctx.fillStyle = color;
    ctx.fillRect(cx - bodyW/2, yTop, bodyW, height);
  }

  // 均線
  if (state.ma1On && state.ma1Period > 0) {
    const fullMa = maOnCandles(allCandles, state.ma1Period).slice(startIdx, endIdx);
    drawMaLine(ctx, fullMa, candleW, py, '#f0b90b');
  }
  if (state.ma2On && state.ma2Period > 0) {
    const fullMa = maOnCandles(allCandles, state.ma2Period).slice(startIdx, endIdx);
    drawMaLine(ctx, fullMa, candleW, py, '#2962ff');
  }

  // 平均成本
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

  // 現價刻度框（只在最新時顯示）
  if (isLive) {
    const cur = state.displayPrice;
    if (cur >= lo && cur <= hi) {
      const curY = py(cur);
      const last = candles[candles.length - 1];
      const curColor = (last && last.c >= last.o) ? '#26a69a' : '#ef5350';
      ctx.fillStyle = curColor;
      ctx.fillRect(chartW, curY - 8, padR - 2, 16);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px JetBrains Mono';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cur.toFixed(2), chartW + (padR - 2) / 2, curY);
    }
  }

  // 時間軸（用每根 K 棒的實際開始時間）
  renderTimeAxis(candles);
}

function drawMaLine(ctx, arr, candleW, py, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] == null) continue;
    const x = (i + 0.5) * candleW;
    const y = py(arr[i]);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function renderTimeAxis(candles) {
  const showSeconds = state.candlePeriod < 15;
  const el = $('timeAxis');
  if (candles.length === 0) { el.innerHTML = ''; return; }
  // 取 5 個位置：0, 1/4, 1/2, 3/4, end
  const positions = [0, 0.33, 0.66, 1];
  const labels = positions.map(p => {
    const idx = Math.min(candles.length - 1, Math.floor(p * (candles.length - 1)));
    const t = new Date(candles[idx].startTime);
    const hh = String(t.getHours()).padStart(2,'0');
    const mm = String(t.getMinutes()).padStart(2,'0');
    const ss = String(t.getSeconds()).padStart(2,'0');
    return showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  });
  el.innerHTML = labels.map(l => `<span>${l}</span>`).join('');
}

function drawVolChart() {
  const c = $('volChart');
  const { ctx, W, H } = setCanvas(c);
  const all = buildCandles(state.candlePeriod);
  const N = VISIBLE_CANDLES_BASE;
  const endIdx = Math.max(N, all.length - state.viewOffset);
  const startIdx = Math.max(0, endIdx - N);
  const candles = all.slice(startIdx, endIdx);
  if (candles.length < 2) return;
  const maxV = Math.max(...candles.map(k => k.v), 1);
  const cw = W / candles.length;
  const bw = Math.max(1, cw * 0.7);
  for (let i = 0; i < candles.length; i++) {
    const k = candles[i];
    const h = (k.v / maxV) * (H - 2);
    const up = k.c >= k.o;
    ctx.fillStyle = up ? 'rgba(38,166,154,0.55)' : 'rgba(239,83,80,0.55)';
    ctx.fillRect(i * cw + (cw - bw)/2, H - h - 1, bw, h);
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
  for (let b = 0; b < bins; b++) {
    const w = (buckets[b] / maxB) * (W - 2);
    const y = H - (b + 1) * yStep + 0.5;
    const grad = ctx.createLinearGradient(0, y, w, y);
    grad.addColorStop(0, 'rgba(41,98,255,0.55)');
    grad.addColorStop(1, 'rgba(41,98,255,0.15)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, w, yStep - 1);
  }
}

/* ============== TRADE ============== */
function currentPrice() { return state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice; }
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
  playSfx('buy'); maybeUpdatePanel(true);
}
function sell() {
  if (state.shares <= 0) { toast('沒有持倉'); return; }
  const p = currentPrice();
  let qty = state.qtyMode === 'max' ? state.shares : Math.min(state.shares, getQty());
  if (qty <= 0) return;
  const profit = (p - state.avgCost) * qty;
  state.cash += p * qty;
  state.shares -= qty;
  if (state.shares === 0) state.avgCost = 0;
  state.trades++;
  log(`賣 ${qty} @${p.toFixed(2)} ${profit >= 0 ? '+' : ''}${fmt(profit)}`, 'sell');
  playSfx('sell'); maybeUpdatePanel(true);
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
function beep(freq, dur, startAt, gain, type='square') {
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

function toggleDrawer() {
  const drawer = $('indicatorDrawer');
  const btn = $('indicatorBtn');
  const isHidden = drawer.classList.contains('hidden');
  if (isHidden) {
    drawer.classList.remove('hidden');
    btn.classList.add('active');
  } else {
    drawer.classList.add('hidden');
    btn.classList.remove('active');
  }
}
function updateMaLabels() {
  $('ma1Label').textContent = state.ma1On ? `MA ${state.ma1Period}` : '';
  $('ma2Label').textContent = state.ma2On ? `MA ${state.ma2Period}` : '';
}
function updateSubPanels() {
  const wantSub = state.showVol || state.showChip;
  $('subPanels').classList.toggle('hidden', !wantSub);
  $('volBox').classList.toggle('hidden', !state.showVol);
  $('chipBox').classList.toggle('hidden', !state.showChip);
  if (state.showVol && state.showChip) {
    $('subPanels').style.gridTemplateColumns = '1fr 1fr';
  } else {
    $('subPanels').style.gridTemplateColumns = '1fr';
  }
  drawChartArea();
}

/* ============== CHART INTERACTION ============== */
function setupChartGesture() {
  const c = $('priceChart');
  let dragging = false;
  let startX = 0, startY = 0;
  let startOffset = 0, startScale = 1;
  let lockedAxis = null;  // null | 'x' | 'y'

  const begin = (x, y) => {
    dragging = true;
    startX = x; startY = y;
    startOffset = state.viewOffset;
    startScale = state.yScaleMult;
    lockedAxis = null;
    c.classList.add('dragging');
  };
  const move = (x, y) => {
    if (!dragging) return;
    const dx = x - startX, dy = y - startY;
    if (!lockedAxis) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        lockedAxis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
    }
    if (lockedAxis === 'x') {
      // 每 candle 寬約 = chartW / VISIBLE_CANDLES
      const W = c.clientWidth - 50;
      const candleW = W / VISIBLE_CANDLES_BASE;
      const allLen = buildCandles(state.candlePeriod).length;
      const maxOffset = Math.max(0, allLen - VISIBLE_CANDLES_BASE);
      state.viewOffset = Math.max(0, Math.min(maxOffset, Math.round(startOffset - dx / candleW)));
    } else if (lockedAxis === 'y') {
      // 上滑（dy 負）→ scale 變小（更精細）；下滑 → scale 變大（範圍寬）
      const factor = Math.pow(1.012, dy);
      state.yScaleMult = Math.max(0.2, Math.min(5, startScale * factor));
    }
    drawChartArea();
  };
  const end = () => { dragging = false; c.classList.remove('dragging'); };

  c.addEventListener('mousedown', e => begin(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', end);
  c.addEventListener('touchstart', e => { if (e.touches.length === 1) begin(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
  c.addEventListener('touchmove', e => {
    if (e.touches.length === 1) {
      move(e.touches[0].clientX, e.touches[0].clientY);
      e.preventDefault();
    }
  }, { passive: false });
  c.addEventListener('touchend', end);
  c.addEventListener('touchcancel', end);

  // 滑鼠滾輪 Y 縮放
  c.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1/1.1;
    state.yScaleMult = Math.max(0.2, Math.min(5, state.yScaleMult * factor));
    drawChartArea();
  }, { passive: false });

  $('resetViewBtn').onclick = () => {
    state.viewOffset = 0;
    state.yScaleMult = 1;
    drawChartArea();
  };
}

function init() {
  // 暖場 600 tick (一開局就有 10 分鐘歷史，時間軸合理分散)
  state.prices = [{ t: 0, p: state.basePrice, v: 1000 }];
  for (let i = 1; i < 600; i++) {
    state.tick = i;
    const next = nextPrice();
    state.prices.push({ t: i, p: next.p, v: next.v });
  }
  state.tick = state.prices.length;
  state.displayPrice = state.prices[state.prices.length - 1].p;
  state.shownPrice = state.displayPrice;
  // startTime 設成 tick 0 的時間（讓時間軸看起來對得上現在）
  state.startTime = Date.now() - (state.prices.length - 1) * TICK_MS;

  // qty btn
  document.querySelectorAll('.qtyBtn').forEach(btn => {
    btn.onclick = () => {
      state.qtyMode = btn.dataset.qty;
      document.querySelectorAll('.qtyBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.qtyMode !== 'max') $('qtyInput').value = state.qtyMode;
    };
  });
  $('qtyInput').value = '100';
  $('qtyInput').addEventListener('focus', () => {
    document.querySelectorAll('.qtyBtn').forEach(b => b.classList.remove('active'));
    state.qtyMode = $('qtyInput').value;
  });
  $('qtyInput').addEventListener('input', () => { state.qtyMode = $('qtyInput').value; });

  // period btn
  document.querySelectorAll('.periodBtn').forEach(btn => {
    btn.onclick = () => {
      state.candlePeriod = parseInt(btn.dataset.period, 10);
      document.querySelectorAll('.periodBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewOffset = 0;     // 切週期時回到最新
      drawChartArea();
    };
  });

  // ma inputs
  const onMa1Change = () => {
    const v = parseInt($('ma1Input').value, 10);
    if (!isNaN(v) && v > 0) state.ma1Period = v;
    state.ma1On = $('ma1Toggle').checked;
    updateMaLabels(); drawChartArea();
  };
  const onMa2Change = () => {
    const v = parseInt($('ma2Input').value, 10);
    if (!isNaN(v) && v > 0) state.ma2Period = v;
    state.ma2On = $('ma2Toggle').checked;
    updateMaLabels(); drawChartArea();
  };
  $('ma1Input').addEventListener('input', onMa1Change);
  $('ma1Toggle').addEventListener('change', onMa1Change);
  $('ma2Input').addEventListener('input', onMa2Change);
  $('ma2Toggle').addEventListener('change', onMa2Change);

  // sub toggle
  $('volToggle').addEventListener('change', () => { state.showVol = $('volToggle').checked; updateSubPanels(); });
  $('chipToggle').addEventListener('change', () => { state.showChip = $('chipToggle').checked; updateSubPanels(); });

  $('buyBtn').onclick = buy;
  $('sellBtn').onclick = sell;
  $('muteBtn').onclick = toggleMute;
  $('indicatorBtn').onclick = toggleDrawer;
  $('restartBtn').onclick = () => location.reload();

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'b' || e.key === 'B') buy();
    if (e.key === 's' || e.key === 'S') sell();
  });

  setupBGM();
  setupChartGesture();
  updateMaLabels();
  maybeUpdatePanel(true);
  drawChartArea();

  setInterval(tick, TICK_MS);
  setInterval(subtick, SUBTICK_MS);
  window.addEventListener('resize', () => { drawChartArea(); });
}

window.addEventListener('DOMContentLoaded', init);
})();
