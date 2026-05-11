(() => {
'use strict';
const TICK_MS = 1_000;
const SUBTICK_MS = 60;                  // v0.5 圖表更高 framerate
const PANEL_UPDATE_MS = 2500;
const INITIAL_CASH = 10_000;
const WIN_TARGET = 50_000;
const VISIBLE_CANDLES_BASE = 40;
const TOTAL_HISTORY = 1800;             // v0.5 加長，因為預設 5s 週期更耗資料
const DRIFT = 0.0004;
const VOL = 0.014;
const NEWS_PROB = 0.003;
const CRASH_PROB = 0.0006;
const NEWS_TEXTS = {
  good: ['財報亮眼','分析師看好','利多襲來','大戶吸籌','機構買超','政策利多','業績爆衝'],
  bad:  ['獲利警報','大戶倒貨','解禁賣壓','法人賣超','政策利空','需求疲軟','機構出貨'],
  surge:['漲停鎖死！','資金狂潮！','急拉飆漲！','利多突襲！'],
  crash:['黑天鵝！','閃崩中…','跌停封死！','恐慌賣壓！'],
};

const state = {
  prices: [],
  basePrice: 100, tick: 0, trend: 0, trendTicks: 0,
  startTime: Date.now(),
  cash: INITIAL_CASH, shares: 0, avgCost: 0,
  trades: 0, won: false,
  qtyMode: '100', muted: false,
  displayPrice: 100, flashUntil: 0,

  candlePeriod: 5,                       // v0.5 預設 5s
  ma1Period: 5, ma1On: true,
  ma2Period: 20, ma2On: true,
  showVol: false, showChip: false,

  // 互動
  viewOffset: 0,
  yScaleMult: 1,

  // 跳動式面板更新
  lastPanelUpdate: 0,
  shownPrice: 100,

  // v0.5 掛單系統
  tradingMode: 'market',                 // 'market' | 'limit'
  pendingOrders: [],                     // [{id, side, qty, price, ts}]
  executedHistory: [],                   // [{id, side, qty, price, ts, profit}]
  realizedPnl: 0,
  nextOrderId: 1,
};

let bgm = null;
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function nextPrice() {
  if (state.trendTicks > 0) { state.trendTicks--; if (state.trendTicks === 0) state.trend = 0; }
  else if (Math.random() < 0.01) {
    state.trend = (Math.random() < 0.5 ? -1 : 1) * (0.002 + Math.random()*0.005);
    state.trendTicks = 30 + Math.floor(Math.random()*60);
  }
  const last = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  let mu = DRIFT + state.trend;
  let sig = VOL;
  let event = null, kind = null;
  if (Math.random() < CRASH_PROB) {
    const r = Math.random();
    if (r < 0.5) { mu = -0.08 - Math.random()*0.05; sig = 0.03;
      event = NEWS_TEXTS.crash[Math.floor(Math.random()*NEWS_TEXTS.crash.length)]; kind = 'crash'; }
    else { mu = 0.08 + Math.random()*0.05; sig = 0.03;
      event = NEWS_TEXTS.surge[Math.floor(Math.random()*NEWS_TEXTS.surge.length)]; kind = 'surge'; }
  } else if (Math.random() < NEWS_PROB) {
    const good = Math.random() < 0.5;
    mu += good ? 0.01 : -0.01;
    event = good ? NEWS_TEXTS.good[Math.floor(Math.random()*NEWS_TEXTS.good.length)]
                 : NEWS_TEXTS.bad[Math.floor(Math.random()*NEWS_TEXTS.bad.length)];
    kind = good ? 'news+' : 'news-';
  }
  const shock = gauss() * sig;
  const p = Math.max(0.5, last * Math.exp(mu + shock));
  const v = Math.round(800 + Math.random()*1600 + Math.abs(shock)*40000);
  return { p, v, event, kind };
}

function tick() {
  state.tick++;
  const next = nextPrice();
  state.prices.push({ t: state.tick, p: next.p, v: next.v });
  if (state.prices.length > TOTAL_HISTORY) state.prices.shift();
  if (next.event) {
    log(next.event, 'news');
    if (next.kind === 'crash') { playSfx('crash'); toast(next.event, 'crash'); }
    else if (next.kind === 'surge') { playSfx('surge'); toast(next.event, 'surge'); }
  }
  // v0.5 掛單檢查（每次 tick 完價格後）
  checkPendingOrders(next.p);
  checkWin();
}

/* ============== K-LINE AGGREGATION ============== */
function buildCandles(period) {
  const ticksPerCandle = period;
  const groups = new Map();
  for (const td of state.prices) {
    const groupIdx = Math.floor(td.t / ticksPerCandle);
    if (!groups.has(groupIdx)) {
      groups.set(groupIdx, { startTick: groupIdx * ticksPerCandle, o: td.p, h: td.p, l: td.p, c: td.p, v: td.v });
    } else {
      const g = groups.get(groupIdx);
      g.h = Math.max(g.h, td.p); g.l = Math.min(g.l, td.p);
      g.c = td.p; g.v += td.v;
    }
  }
  const sorted = [...groups.entries()].sort((a, b) => a[0] - b[0]);
  return sorted.map(([_, g]) => ({
    ...g,
    startTime: state.startTime + g.startTick * TICK_MS,
  }));
}
function maOnCandles(candles, period) {
  const out = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let s = 0; for (let j = 0; j < period; j++) s += candles[i-j].c;
    out[i] = s / period;
  }
  return out;
}

const $ = (id) => document.getElementById(id);
function fmt(n) {
  if (n >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n/1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

/* ============== Position Panel ============== */
function maybeUpdatePanel(force = false) {
  if (!state.prices.length) return;
  const now = performance.now();
  if (!force && now - state.lastPanelUpdate < PANEL_UPDATE_MS) return;
  state.lastPanelUpdate = now;

  const cur = state.prices[state.prices.length - 1].p;
  const prev = state.shownPrice;
  const chg = cur - prev;
  const chgPct = (chg / Math.max(0.01, prev)) * 100;

  const priceEl = $('priceNow');
  const oldVal = state.shownPrice;
  state.shownPrice = cur;
  priceEl.textContent = cur.toFixed(2);
  priceEl.classList.remove('tick-up', 'tick-down');
  void priceEl.offsetWidth;
  if (cur > oldVal) priceEl.classList.add('tick-up');
  else if (cur < oldVal) priceEl.classList.add('tick-down');

  const chgEl = $('priceChange');
  chgEl.textContent = `${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chg >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)`;
  chgEl.className = 'posTick ' + (chg >= 0 ? 'up' : 'down');

  // posSub 五欄
  $('cashLabel').textContent = fmt(state.cash);
  $('sharesLabel').textContent = state.shares.toLocaleString();
  $('avgCostLabel').textContent = state.shares > 0 ? state.avgCost.toFixed(2) : '--';

  // 已實現損益
  const realEl = $('realPnlLabel');
  realEl.textContent = (state.realizedPnl >= 0 ? '+' : '') + fmt(state.realizedPnl);
  realEl.className = 'posVal ' + (state.realizedPnl > 0.01 ? 'up' : state.realizedPnl < -0.01 ? 'down' : 'flat');

  const equity = state.cash + state.shares * cur;
  $('equityLabel').textContent = fmt(equity);

  // 未實現損益（posMain 右側）
  const unrealPctEl = $('unrealPnlPct');
  const unrealAmtEl = $('unrealPnlAmount');
  const labelEl = unrealPctEl.parentElement.querySelector('.posLabel');
  if (state.shares > 0) {
    if (labelEl) labelEl.textContent = '未實現損益';
    unrealPctEl.classList.remove('hidden');
    unrealAmtEl.classList.remove('hidden');
    const cost = state.avgCost * state.shares;
    const market = cur * state.shares;
    const pnlAmt = market - cost;
    const pnlPct = (pnlAmt / Math.max(0.001, cost)) * 100;
    unrealPctEl.textContent = (pnlPct >= 0 ? '+' : '') + pnlPct.toFixed(2) + '%';
    unrealPctEl.className = 'posPnl ' + (pnlPct > 0.01 ? 'up' : pnlPct < -0.01 ? 'down' : 'flat');
    unrealAmtEl.textContent = (pnlAmt >= 0 ? '+' : '') + pnlAmt.toFixed(2);
    unrealAmtEl.className = 'posTick ' + (pnlAmt >= 0 ? 'up' : 'down');
  } else {
    // 沒持倉時隱藏未實現欄位
    if (labelEl) labelEl.textContent = '空倉';
    unrealPctEl.textContent = '--';
    unrealPctEl.className = 'posPnl flat';
    unrealAmtEl.textContent = '';
    unrealAmtEl.className = 'posTick';
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
  state.displayPrice += diff * 0.18;
  state.displayPrice *= (1 + (Math.random() - 0.5) * 0.0004);
  drawChartArea();
  maybeUpdatePanel(false);
}

function drawChartArea() {
  if (!state.prices.length) return;
  drawCandleChart();
  if (state.showVol) drawVolChart();
  if (state.showChip) drawChipSide();
}

function setCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr; c.height = h * dpr;
  }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, W: w, H: h };
}

/* ============== Candle Chart ============== */
function drawCandleChart() {
  const c = $('priceChart');
  const { ctx, W, H } = setCanvas(c);
  const allCandles = buildCandles(state.candlePeriod);
  if (allCandles.length < 1) return;

  const N = VISIBLE_CANDLES_BASE;
  const endIdx = Math.max(N, allCandles.length - state.viewOffset);
  const startIdx = Math.max(0, endIdx - N);
  const candles = allCandles.slice(startIdx, endIdx);
  if (candles.length < 1) return;

  $('resetViewBtn').classList.toggle('hidden', state.viewOffset === 0);

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

  const rawLo = Math.min(...candles.map(k => k.l));
  const rawHi = Math.max(...candles.map(k => k.h));
  const center = (rawLo + rawHi) / 2;
  const half = (rawHi - rawLo) / 2;
  const expandedHalf = Math.max(0.01, half * state.yScaleMult);
  const lo = (center - expandedHalf) * 0.998;
  const hi = (center + expandedHalf) * 1.002;

  const padR = 50;
  const chartW = W - padR;
  const candleW = chartW / candles.length;
  const bodyW = Math.max(2, candleW * 0.7);

  const py = (p) => 12 + (H - 24) * (1 - (p - lo) / Math.max(0.001, (hi - lo)));

  // 暴露給 chip side 共用 Y
  state._chartLo = lo;
  state._chartHi = hi;
  state._chartCur = isLive ? state.displayPrice : candles[candles.length - 1].c;
  state._chartH = H;

  // 5 條水平網格
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = 12 + (H - 24) * g / 4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
  }
  // 5 條垂直網格（對齊 x 軸時間 label）
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

  // K 線：嚴格用本根 close vs open
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

  // 掛單線（限價單水平線）
  for (const ord of state.pendingOrders) {
    if (ord.price < lo || ord.price > hi) continue;
    const y = py(ord.price);
    const isLineBuy = ord.side === 'buy';
    ctx.strokeStyle = isLineBuy ? 'rgba(38,166,154,0.55)' : 'rgba(239,83,80,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = isLineBuy ? '#26a69a' : '#ef5350';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${isLineBuy ? '掛買' : '掛賣'} ${ord.qty}@${ord.price.toFixed(2)}`, chartW - 4, y - 2);
  }

  // 現價刻度框
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
  // 5 個位置（對齊 5 條垂直網格）：左到右 0%, 25%, 50%, 75%, 100%
  const c = $('priceChart');
  const W = c.clientWidth;
  const padR = 50;
  const chartW = W - padR;
  const positions = [0, 0.25, 0.5, 0.75, 1];
  const html = positions.map(p => {
    const idx = Math.min(candles.length - 1, Math.round(p * (candles.length - 1)));
    const t = new Date(candles[idx].startTime);
    const hh = String(t.getHours()).padStart(2,'0');
    const mm = String(t.getMinutes()).padStart(2,'0');
    const ss = String(t.getSeconds()).padStart(2,'0');
    const label = showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
    const px = p * chartW;
    return `<span style="left:${px}px">${label}</span>`;
  }).join('');
  el.innerHTML = html;
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

/* v0.5 籌碼分佈：右側並排，共享 Y 軸 */
function drawChipSide() {
  const c = $('chipChart');
  const { ctx, W, H } = setCanvas(c);
  const lo = state._chartLo, hi = state._chartHi;
  if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return;

  // 用最近 TOTAL_HISTORY 區間的籌碼分佈（在 lo–hi 範圍內統計）
  const data = state.prices.slice(-TOTAL_HISTORY);
  const bins = 30;
  const buckets = new Array(bins).fill(0);
  for (const d of data) {
    if (d.p < lo || d.p > hi) continue;
    const b = Math.min(bins - 1, Math.max(0, Math.floor((d.p - lo) / (hi - lo) * bins)));
    buckets[b] += d.v;
  }
  const maxB = Math.max(...buckets, 1);
  const py = (p) => 12 + (H - 24) * (1 - (p - lo) / Math.max(0.001, (hi - lo)));

  // 條形（從右向左長條）
  for (let b = 0; b < bins; b++) {
    if (buckets[b] === 0) continue;
    const w = (buckets[b] / maxB) * (W - 8);
    const yTop = py(lo + (b + 1) * (hi - lo) / bins);
    const yBot = py(lo + b * (hi - lo) / bins);
    const h = Math.max(1, yBot - yTop);
    const grad = ctx.createLinearGradient(W - w, 0, W, 0);
    grad.addColorStop(0, 'rgba(41,98,255,0.15)');
    grad.addColorStop(1, 'rgba(41,98,255,0.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(W - w, yTop, w, h);
  }

  // 現價標記（紅/綠水平線 + 三角）
  const cur = state._chartCur;
  if (cur >= lo && cur <= hi) {
    const y = py(cur);
    const last = state.prices[state.prices.length - 1];
    const prev = state.prices[state.prices.length - 2];
    const color = (prev && last.p >= prev.p) ? '#26a69a' : '#ef5350';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    // 三角箭頭
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(6, y - 4); ctx.lineTo(6, y + 4); ctx.closePath();
    ctx.fill();
  }

  // 平均成本標記（金色虛線）
  if (state.shares > 0 && state.avgCost >= lo && state.avgCost <= hi) {
    const y = py(state.avgCost);
    ctx.strokeStyle = '#f0b90b';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b90b';
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(6, y - 3); ctx.lineTo(6, y + 3); ctx.closePath();
    ctx.fill();
  }
}

/* ============== TRADE ============== */
function currentPrice() { return state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice; }
function getQty() {
  const mode = state.qtyMode;
  const p = state.tradingMode === 'limit' ? parseFloat($('limitPriceInput').value) || currentPrice() : currentPrice();
  if (mode === 'max') {
    return state.tradingMode === 'limit' ? Math.floor(state.cash / p) : Math.floor(state.cash / p);
  }
  const raw = parseInt($('qtyInput').value, 10);
  return Math.max(1, isNaN(raw) ? 0 : raw);
}

function buy() {
  if (state.tradingMode === 'limit') return placeLimitOrder('buy');
  const p = currentPrice();
  let qty = getQty();
  if (p * qty > state.cash) { qty = Math.floor(state.cash / p); if (qty <= 0) { toast('現金不足'); return; } }
  executeMarketBuy(qty, p);
  playSfx('buy');
}

function sell() {
  if (state.tradingMode === 'limit') return placeLimitOrder('sell');
  if (state.shares <= 0) { toast('沒有持倉'); return; }
  const p = currentPrice();
  let qty = state.qtyMode === 'max' ? state.shares : Math.min(state.shares, getQty());
  if (qty <= 0) return;
  executeMarketSell(qty, p);
  playSfx('sell');
}

function executeMarketBuy(qty, p) {
  const totalCost = state.avgCost * state.shares + p * qty;
  state.shares += qty;
  state.avgCost = totalCost / state.shares;
  state.cash -= p * qty;
  state.trades++;
  log(`買 ${qty} @${p.toFixed(2)} = ${fmt(p*qty)}`, 'buy');
  state.executedHistory.unshift({ id: state.nextOrderId++, side: 'buy', qty, price: p, ts: Date.now(), profit: null });
  if (state.executedHistory.length > 50) state.executedHistory.pop();
  maybeUpdatePanel(true);
  updateOrdersUI();
}

function executeMarketSell(qty, p) {
  const profit = (p - state.avgCost) * qty;
  state.realizedPnl += profit;
  state.cash += p * qty;
  state.shares -= qty;
  if (state.shares === 0) state.avgCost = 0;
  state.trades++;
  log(`賣 ${qty} @${p.toFixed(2)} ${profit >= 0 ? '+' : ''}${fmt(profit)}`, 'sell');
  state.executedHistory.unshift({ id: state.nextOrderId++, side: 'sell', qty, price: p, ts: Date.now(), profit });
  if (state.executedHistory.length > 50) state.executedHistory.pop();
  maybeUpdatePanel(true);
  updateOrdersUI();
}

/* 限價單 */
function placeLimitOrder(side) {
  const price = parseFloat($('limitPriceInput').value);
  if (!isFinite(price) || price <= 0) { toast('請輸入有效目標價'); return; }
  let qty = getQty();
  if (qty <= 0) { toast('請輸入數量'); return; }
  if (side === 'buy') {
    if (price * qty > state.cash) {
      qty = Math.floor(state.cash / price);
      if (qty <= 0) { toast('現金不足'); return; }
    }
  } else {
    if (state.shares <= 0) { toast('沒有持倉可賣'); return; }
    qty = state.qtyMode === 'max' ? state.shares : Math.min(state.shares, qty);
    if (qty <= 0) return;
  }
  state.pendingOrders.push({
    id: state.nextOrderId++,
    side, qty, price, ts: Date.now()
  });
  log(`掛${side === 'buy' ? '買' : '賣'} ${qty} @${price.toFixed(2)}`, side);
  toast(`已掛單 ${side === 'buy' ? '買' : '賣'} ${qty}@${price.toFixed(2)}`, 'news');
  playSfx(side);
  updateOrdersUI();
  drawChartArea();
}

function checkPendingOrders(curPrice) {
  if (state.pendingOrders.length === 0) return;
  const remaining = [];
  for (const ord of state.pendingOrders) {
    let trigger = false;
    if (ord.side === 'buy' && curPrice <= ord.price) trigger = true;
    if (ord.side === 'sell' && curPrice >= ord.price) trigger = true;
    if (trigger) {
      // 用觸發價作成交價（簡化）
      if (ord.side === 'buy') {
        if (ord.price * ord.qty > state.cash) {
          log(`掛買失敗（現金不足）${ord.qty}@${ord.price.toFixed(2)}`, 'sell');
          continue;
        }
        executeMarketBuy(ord.qty, ord.price);
        toast(`觸發掛買 ${ord.qty}@${ord.price.toFixed(2)}`, 'surge');
      } else {
        const qty = Math.min(state.shares, ord.qty);
        if (qty <= 0) {
          log(`掛賣失敗（無持倉）${ord.qty}@${ord.price.toFixed(2)}`, 'sell');
          continue;
        }
        executeMarketSell(qty, ord.price);
        toast(`觸發掛賣 ${qty}@${ord.price.toFixed(2)}`, 'surge');
      }
    } else {
      remaining.push(ord);
    }
  }
  state.pendingOrders = remaining;
  updateOrdersUI();
}

function cancelOrder(id) {
  state.pendingOrders = state.pendingOrders.filter(o => o.id !== id);
  log('取消掛單', '');
  updateOrdersUI();
  drawChartArea();
}

function updateOrdersUI() {
  // 委託按鈕指示燈
  $('ordersBtn').classList.toggle('has-pending', state.pendingOrders.length > 0);

  // pending list
  const pList = $('pendingList');
  if (state.pendingOrders.length === 0) {
    pList.innerHTML = '<div class="orderEmpty">尚無掛單</div>';
  } else {
    pList.innerHTML = state.pendingOrders.map(o => {
      const dt = new Date(o.ts);
      const ts = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;
      return `<div class="orderItem">
        <span class="orderSide ${o.side}">${o.side === 'buy' ? '買' : '賣'}</span>
        <div>
          <div class="orderInfo">${o.qty} 股 @ ${o.price.toFixed(2)}</div>
          <div class="orderSub">掛單於 ${ts}</div>
        </div>
        <button class="orderAct" data-cancel="${o.id}">取消</button>
      </div>`;
    }).join('');
    pList.querySelectorAll('[data-cancel]').forEach(b => {
      b.onclick = () => cancelOrder(parseInt(b.dataset.cancel, 10));
    });
  }

  // history list
  const hList = $('historyList');
  if (state.executedHistory.length === 0) {
    hList.innerHTML = '<div class="orderEmpty">尚無歷史</div>';
  } else {
    hList.innerHTML = state.executedHistory.map(o => {
      const dt = new Date(o.ts);
      const ts = `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}:${String(dt.getSeconds()).padStart(2,'0')}`;
      const resultHtml = (o.profit != null)
        ? `<span class="orderResult ${o.profit >= 0 ? 'profit' : 'loss'}">${o.profit >= 0 ? '+' : ''}${fmt(o.profit)}</span>`
        : '<span class="orderSub">建倉</span>';
      return `<div class="orderItem">
        <span class="orderSide ${o.side}">${o.side === 'buy' ? '買' : '賣'}</span>
        <div>
          <div class="orderInfo">${o.qty} 股 @ ${o.price.toFixed(2)}</div>
          <div class="orderSub">${ts}</div>
        </div>
        ${resultHtml}
      </div>`;
    }).join('');
  }
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

/* OVERLAY 控制 */
function openOverlay(id) { $(id).classList.remove('hidden'); }
function closeOverlay(id) { $(id).classList.add('hidden'); }

function updateMaLabels() {
  // v0.5: 用 #ma1Legend / #ma2Legend wrapper 顯示/隱藏
  $('ma1Label').textContent = `MA ${state.ma1Period}`;
  $('ma2Label').textContent = `MA ${state.ma2Period}`;
  $('ma1Legend').classList.toggle('hidden', !state.ma1On);
  $('ma2Legend').classList.toggle('hidden', !state.ma2On);
}

function updateSubPanels() {
  // v0.5: 籌碼分佈是 side panel，不在 subPanels 下方
  $('subPanels').classList.toggle('hidden', !state.showVol);
  $('chipChart').classList.toggle('hidden', !state.showChip);
  drawChartArea();
}

function updateModeUI() {
  document.querySelectorAll('.modeBtn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.tradingMode);
  });
  $('limitPriceRow').classList.toggle('hidden', state.tradingMode !== 'limit');
  // 限價輸入框預設為現價
  if (state.tradingMode === 'limit') {
    const inp = $('limitPriceInput');
    if (!inp.value || parseFloat(inp.value) <= 0) inp.value = currentPrice().toFixed(2);
  }
}

/* ============== CHART INTERACTION (v0.5: 反向滑動) ============== */
function setupChartGesture() {
  const c = $('priceChart');
  let dragging = false;
  let startX = 0, startY = 0;
  let startOffset = 0, startScale = 1;
  let lockedAxis = null;

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
      const W = c.clientWidth - 50;
      const candleW = W / VISIBLE_CANDLES_BASE;
      const allLen = buildCandles(state.candlePeriod).length;
      const maxOffset = Math.max(0, allLen - VISIBLE_CANDLES_BASE);
      // v0.5 反向：手指往右滑 → 看更早的 K（offset 增加）
      state.viewOffset = Math.max(0, Math.min(maxOffset, Math.round(startOffset + dx / candleW)));
    } else if (lockedAxis === 'y') {
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
    if (e.touches.length === 1) { move(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  }, { passive: false });
  c.addEventListener('touchend', end);
  c.addEventListener('touchcancel', end);

  c.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1/1.1;
    state.yScaleMult = Math.max(0.2, Math.min(5, state.yScaleMult * factor));
    drawChartArea();
  }, { passive: false });

  $('resetViewBtn').onclick = () => {
    state.viewOffset = 0; state.yScaleMult = 1; drawChartArea();
  };
}

function init() {
  // 暖場：600 tick 給足歷史
  state.prices = [{ t: 0, p: state.basePrice, v: 1000 }];
  for (let i = 1; i < 600; i++) {
    state.tick = i;
    const next = nextPrice();
    state.prices.push({ t: i, p: next.p, v: next.v });
  }
  state.tick = state.prices.length;
  state.displayPrice = state.prices[state.prices.length - 1].p;
  state.shownPrice = state.displayPrice;
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

  // mode btn (市價/限價)
  document.querySelectorAll('.modeBtn').forEach(btn => {
    btn.onclick = () => {
      state.tradingMode = btn.dataset.mode;
      updateModeUI();
    };
  });

  // period btn (預設 5s)
  document.querySelectorAll('.periodBtn').forEach(btn => {
    btn.onclick = () => {
      state.candlePeriod = parseInt(btn.dataset.period, 10);
      document.querySelectorAll('.periodBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewOffset = 0;
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
  $('indicatorBtn').onclick = () => openOverlay('indicatorOverlay');
  $('ordersBtn').onclick = () => { updateOrdersUI(); openOverlay('ordersOverlay'); };
  $('restartBtn').onclick = () => location.reload();

  // overlay close buttons
  document.querySelectorAll('.overlayClose').forEach(b => {
    b.onclick = () => closeOverlay(b.dataset.close);
  });
  // 點 overlay 背景關閉
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
  });

  // order tab switch
  document.querySelectorAll('.orderTab').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('.orderTab').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      $('pendingTab').classList.toggle('hidden', tab !== 'pending');
      $('historyTab').classList.toggle('hidden', tab !== 'history');
    };
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'b' || e.key === 'B') buy();
    if (e.key === 's' || e.key === 'S') sell();
    if (e.key === 'Escape') {
      document.querySelectorAll('.overlay:not(.hidden)').forEach(o => o.classList.add('hidden'));
    }
  });

  setupBGM();
  setupChartGesture();
  updateMaLabels();
  updateModeUI();
  maybeUpdatePanel(true);
  drawChartArea();

  setInterval(tick, TICK_MS);
  setInterval(subtick, SUBTICK_MS);
  window.addEventListener('resize', () => { drawChartArea(); });
}

window.addEventListener('DOMContentLoaded', init);
})();
