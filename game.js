(() => {
'use strict';
const TICK_MS = 1_000;             // 1 秒一筆 tick（K 線週期由 aggregation 決定）
const SUBTICK_MS = 100;            // 100ms 子 tick 平滑
const INITIAL_CASH = 10_000;
const WIN_TARGET = 10_000_000;
const VISIBLE_CANDLES = 40;        // 顯示 40 根 K 棒
const TOTAL_HISTORY = 1200;        // 保留 1200 tick (20 分鐘)
const DRIFT = 0.0003;
const VOL = 0.012;
const NEWS_PROB = 0.003;
const CRASH_PROB = 0.0006;
const NEWS_TEXTS = {
  good:  ['利多消息 / 技術突破', '產品熱賣 / 看好', '財報超預期', '法人加碼', '政策利多'],
  bad:   ['利空消息 / 技術受挫', '對手推競品', '財報不如預期', '法人減碼', '行業逆風'],
  crash: ['黑天鵝 / 市場恐慌', '流動性危機', '系統性風險爆發'],
  surge: ['獨家利多 / 爆量', '法人狂買進場', '產業劇變利多']
};

const state = {
  prices: [],                  // tick-level: {t, p, v}
  basePrice: 100,
  tick: 0, trend: 0, trendTicks: 0,
  startTime: Date.now(),
  cash: INITIAL_CASH, shares: 0, avgCost: 0,
  trades: 0, won: false,
  qtyMode: '100', muted: false,
  displayPrice: 100, flashUntil: 0,

  // v0.3 用戶設定
  candlePeriod: 15,            // 秒 (5 / 15 / 30)
  ma1Period: 5, ma1On: true,
  ma2Period: 20, ma2On: true,
  showVol: false,
  showChip: false,
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
  if (Math.random() < 0.005) { state.trend = (Math.random() - 0.5) * 0.0025; state.trendTicks = 60 + Math.floor(Math.random() * 120); }
  if (state.prices.length > 60) {
    const recent = state.prices.slice(-60).map(p => p.p);
    const hi = Math.max(...recent), lo = Math.min(...recent);
    if (last >= hi * 0.99) drift -= 0.0008;
    if (last <= lo * 1.01) drift += 0.0008;
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
  state.prices.push({ t: state.tick++, p: next.p, v: next.v });
  if (state.prices.length > TOTAL_HISTORY) state.prices.shift();
  if (next.event) {
    log(`${next.event}`, 'news');
    if (next.kind === 'crash') { playSfx('crash'); toast(next.event, 'crash'); }
    else if (next.kind === 'surge') { playSfx('surge'); toast(next.event, 'surge'); }
    else { toast(next.event, 'news', 1500); }
  }
  state.flashUntil = performance.now() + 400;
  renderStats();
  checkWin();
}

function subtick() {
  if (state.prices.length === 0) return;
  const target = state.prices[state.prices.length - 1].p;
  const diff = target - state.displayPrice;
  state.displayPrice += diff * 0.22;
  state.displayPrice *= (1 + (Math.random() - 0.5) * 0.0006);
  renderPriceArea();
}

/* ============== K-LINE AGGREGATION ============== */
function buildCandles(period) {
  // period in seconds. tick is 1s so period = ticks per candle.
  const ticksPerCandle = period;
  const candles = [];
  // 從末端往前 group
  const data = state.prices;
  // 對齊：最後一根可能未完成
  let cur = null;
  for (let i = 0; i < data.length; i++) {
    const groupIdx = Math.floor(i / ticksPerCandle);
    if (!cur || cur.gi !== groupIdx) {
      if (cur) candles.push(cur);
      cur = { gi: groupIdx, o: data[i].p, h: data[i].p, l: data[i].p, c: data[i].p, v: 0 };
    }
    if (data[i].p > cur.h) cur.h = data[i].p;
    if (data[i].p < cur.l) cur.l = data[i].p;
    cur.c = data[i].p;
    cur.v += data[i].v;
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
  if (state.showVol) $('volNowLabel').textContent = state.prices[state.prices.length-1].v.toLocaleString();
  renderTimeAxis();
}

function renderPriceArea() {
  if (!state.prices.length) return;
  $('priceNow').textContent = state.displayPrice.toFixed(2);
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

function renderTimeAxis() {
  const el = $('timeAxis');
  const now = new Date();
  const period = state.candlePeriod;
  const labels = [];
  for (let i = 4; i >= 0; i--) {
    const sec = i * VISIBLE_CANDLES * period / 4;
    const t = new Date(now.getTime() - sec * 1000);
    labels.push(`${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}:${String(t.getSeconds()).padStart(2,'0')}`);
  }
  el.innerHTML = labels.map(l => `<span>${l}</span>`).join('');
}

/* ============== Candle Chart ============== */
function drawCandleChart() {
  const c = $('priceChart');
  const { ctx, W, H } = setCanvas(c);

  const allCandles = buildCandles(state.candlePeriod);
  const candles = allCandles.slice(-VISIBLE_CANDLES);
  if (candles.length < 1) return;

  // 用 displayPrice 平滑替換最後一根 K 的 close（讓最新 K 跟著動）
  const lastIdx = candles.length - 1;
  const tweenedCandle = { ...candles[lastIdx], c: state.displayPrice };
  // 也讓最後一根的 high/low 至少包住 displayPrice
  tweenedCandle.h = Math.max(tweenedCandle.h, state.displayPrice);
  tweenedCandle.l = Math.min(tweenedCandle.l, state.displayPrice);
  candles[lastIdx] = tweenedCandle;

  // 計算可視範圍
  const lo = Math.min(...candles.map(k => k.l)) * 0.998;
  const hi = Math.max(...candles.map(k => k.h)) * 1.002;

  const padR = 50;
  const chartW = W - padR;
  const candleW = chartW / candles.length;
  const bodyW = Math.max(2, candleW * 0.7);

  const py = (p) => 12 + (H - 24) * (1 - (p - lo) / (hi - lo));

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

  // 畫 K 線（紅跌綠漲）
  for (let i = 0; i < candles.length; i++) {
    const k = candles[i];
    const cx = (i + 0.5) * candleW;
    const up = k.c >= k.o;
    const color = up ? '#26a69a' : '#ef5350';

    // 上下影線
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, py(k.h));
    ctx.lineTo(cx, py(k.l));
    ctx.stroke();

    // 實體
    const yTop = py(Math.max(k.o, k.c));
    const yBot = py(Math.min(k.o, k.c));
    const height = Math.max(1, yBot - yTop);
    ctx.fillStyle = color;
    ctx.fillRect(cx - bodyW/2, yTop, bodyW, height);
    // 邊框
    ctx.strokeStyle = color;
    ctx.strokeRect(cx - bodyW/2 + 0.5, yTop + 0.5, bodyW, height);
  }

  // 均線
  if (state.ma1On && state.ma1Period > 0) {
    const ma = maOnCandles(candles, state.ma1Period);
    drawMaLine(ctx, ma, candleW, py, '#f0b90b');
  }
  if (state.ma2On && state.ma2Period > 0) {
    const ma = maOnCandles(candles, state.ma2Period);
    drawMaLine(ctx, ma, candleW, py, '#2962ff');
  }

  // 平均成本線
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

  // 現價刻度框
  const cur = state.displayPrice;
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

function drawVolChart() {
  const c = $('volChart');
  const { ctx, W, H } = setCanvas(c);
  const candles = buildCandles(state.candlePeriod).slice(-VISIBLE_CANDLES);
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
  const cur = state.displayPrice;
  if (cur >= lo && cur <= hi) {
    const curBin = (cur - lo) / (hi - lo) * bins;
    const curY = H - curBin * yStep;
    ctx.strokeStyle = '#f0b90b'; ctx.lineWidth = 1; ctx.setLineDash([2,2]);
    ctx.beginPath(); ctx.moveTo(0, curY); ctx.lineTo(W, curY); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ============== Trade ============== */
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
  playSfx('buy'); renderStats();
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

/* ============== SFX ============== */
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

/* ============== Indicator Drawer ============== */
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
  $('maLegend').style.opacity = (state.ma1On || state.ma2On) ? '1' : '0.3';
}
function updateSubPanels() {
  const wantSub = state.showVol || state.showChip;
  $('subPanels').classList.toggle('hidden', !wantSub);
  $('volBox').classList.toggle('hidden', !state.showVol);
  $('chipBox').classList.toggle('hidden', !state.showChip);
  if (!state.showVol && !state.showChip) return;
  // 動態 grid
  if (state.showVol && state.showChip) {
    $('subPanels').style.gridTemplateColumns = '1fr 1fr';
  } else {
    $('subPanels').style.gridTemplateColumns = '1fr';
  }
  renderPriceArea();
}

function init() {
  // 預先 40 tick 暖場 (~40 秒史)
  state.prices = [{ t: 0, p: state.basePrice, v: 1000 }];
  for (let i = 1; i < 60; i++) {
    state.tick = i;
    const next = nextPrice();
    state.prices.push({ t: i, p: next.p, v: next.v });
  }
  state.tick = state.prices.length;
  state.displayPrice = state.prices[state.prices.length - 1].p;

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
      renderPriceArea(); renderStats();
    };
  });

  // ma inputs
  const onMa1Change = () => {
    const v = parseInt($('ma1Input').value, 10);
    if (!isNaN(v) && v > 0) state.ma1Period = v;
    state.ma1On = $('ma1Toggle').checked;
    updateMaLabels(); renderPriceArea();
  };
  const onMa2Change = () => {
    const v = parseInt($('ma2Input').value, 10);
    if (!isNaN(v) && v > 0) state.ma2Period = v;
    state.ma2On = $('ma2Toggle').checked;
    updateMaLabels(); renderPriceArea();
  };
  $('ma1Input').addEventListener('input', onMa1Change);
  $('ma1Toggle').addEventListener('change', onMa1Change);
  $('ma2Input').addEventListener('input', onMa2Change);
  $('ma2Toggle').addEventListener('change', onMa2Change);

  // sub toggle
  $('volToggle').addEventListener('change', () => { state.showVol = $('volToggle').checked; updateSubPanels(); });
  $('chipToggle').addEventListener('change', () => { state.showChip = $('chipToggle').checked; updateSubPanels(); });

  // misc
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
  updateMaLabels();
  renderStats();
  renderPriceArea();

  setInterval(tick, TICK_MS);
  setInterval(subtick, SUBTICK_MS);
  window.addEventListener('resize', () => { renderPriceArea(); });
}

window.addEventListener('DOMContentLoaded', init);
})();
