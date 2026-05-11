/* =================================================================
   Idle Investor — 主邏輯
   - 10s 一 tick GBM 模擬
   - 兩條均線（短/長）+ 成交量 + 籌碼分佈 + 熱度
   - 買賣 + 達標 10M 勝利
   ================================================================= */
(() => {
'use strict';

/* ============================================================
   CONST
   ============================================================ */
const TICK_MS = 10_000;                  // 10 秒一 tick
const FAST_TICK_MS_DEV = 500;            // dev 模式用，現在不啟用
const INITIAL_CASH = 10_000;
const WIN_TARGET = 10_000_000;
const VISIBLE_TICKS = 90;                // chart 顯示最近 90 ticks（15 分鐘）
const TOTAL_HISTORY = 240;               // 籌碼分佈用近 40 分鐘

// 模擬參數（GBM）
const DRIFT = 0.0008;                    // 每 tick 平均漲幅 +0.08%（讓玩家長期能贏）
const VOL = 0.018;                       // 每 tick 波動 ±1.8% 標準差

// 事件機率（每 tick）
const NEWS_PROB = 0.005;                 // 0.5% 機率觸發新聞
const CRASH_PROB = 0.001;                // 0.1% 機率大跌

const NEWS_TEXTS = {
  good: ['利多消息：技術突破！', '產品熱賣，市場看好', '財報超預期', '法人加碼買進', '行業政策利多'],
  bad:  ['利空消息：技術受質疑', '對手推出競品', '財報不如預期', '法人減碼賣出', '行業遇到逆風'],
  crash:['黑天鵝事件！市場恐慌', '全球性流動性危機', '突發系統性風險'],
  surge:['獨家發現重大利多', '法人爆量買進', '產業劇變利多']
};

/* ============================================================
   STATE
   ============================================================ */
const state = {
  // 價格資料
  prices: [],        // {t, p, v} array
  basePrice: 100,
  tick: 0,
  trend: 0,          // 當前趨勢加成 (隨機調整)
  trendTicks: 0,     // 趨勢剩餘 ticks
  startTime: Date.now(),

  // 玩家
  cash: INITIAL_CASH,
  shares: 0,
  avgCost: 0,
  trades: 0,
  won: false,

  // UI
  qtyMode: '10',
  muted: false,
};

let bgm = null;
const audioCtx = (window.AudioContext || window.webkitAudioContext)
  ? new (window.AudioContext || window.webkitAudioContext)()
  : null;

/* ============================================================
   PRICE SIMULATION
   ============================================================ */
function gauss() {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function nextPrice() {
  const last = state.prices.length ? state.prices[state.prices.length - 1].p : state.basePrice;
  let drift = DRIFT + state.trend;
  let vol = VOL;

  // 趨勢消耗
  if (state.trendTicks > 0) {
    state.trendTicks--;
    if (state.trendTicks === 0) state.trend = 0;
  }
  // 偶爾觸發新趨勢
  if (Math.random() < 0.01) {
    state.trend = (Math.random() - 0.5) * 0.004;   // ±0.2% per tick
    state.trendTicks = 30 + Math.floor(Math.random() * 60);
  }

  // 支撐 / 壓力反彈：若近期高低點被觸及，反彈機率提升
  if (state.prices.length > 20) {
    const recent = state.prices.slice(-20).map(p => p.p);
    const hi = Math.max(...recent), lo = Math.min(...recent);
    if (last >= hi * 0.99) drift -= 0.002;
    if (last <= lo * 1.01) drift += 0.002;
  }

  let r = drift + vol * gauss();

  // 事件
  let eventTxt = null;
  let eventKind = null;
  if (Math.random() < NEWS_PROB) {
    if (Math.random() < 0.55) {
      r += 0.04 + Math.random() * 0.04;
      eventTxt = NEWS_TEXTS.good[Math.floor(Math.random() * NEWS_TEXTS.good.length)];
      eventKind = 'good';
    } else {
      r -= 0.04 + Math.random() * 0.04;
      eventTxt = NEWS_TEXTS.bad[Math.floor(Math.random() * NEWS_TEXTS.bad.length)];
      eventKind = 'bad';
    }
  }
  if (Math.random() < CRASH_PROB) {
    if (Math.random() < 0.5) {
      r -= 0.08 + Math.random() * 0.10;
      eventTxt = NEWS_TEXTS.crash[Math.floor(Math.random() * NEWS_TEXTS.crash.length)];
      eventKind = 'crash';
    } else {
      r += 0.08 + Math.random() * 0.10;
      eventTxt = NEWS_TEXTS.surge[Math.floor(Math.random() * NEWS_TEXTS.surge.length)];
      eventKind = 'surge';
    }
  }

  const p = Math.max(0.5, last * (1 + r));
  // 模擬成交量（隨機 + 動能放大）
  const v = Math.round(500 + Math.random() * 1500 + Math.abs(r) * 50000);

  return { p, v, event: eventTxt, kind: eventKind };
}

function tick() {
  const next = nextPrice();
  state.prices.push({ t: state.tick++, p: next.p, v: next.v });
  if (state.prices.length > TOTAL_HISTORY) state.prices.shift();

  if (next.event) {
    log(`【${state.tick}】${next.event}`, 'news');
    if (next.kind === 'crash') {
      playSfx('crash');
      toast(`⚠ ${next.event}`);
    }
    if (next.kind === 'surge') {
      playSfx('surge');
      toast(`✨ ${next.event}`);
    }
  }

  render();
  checkWin();
}

/* ============================================================
   RENDER
   ============================================================ */
const $ = (id) => document.getElementById(id);

function ma(period, fromEnd = 0) {
  const prices = state.prices.slice(0, state.prices.length - fromEnd);
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((s, x) => s + x.p, 0) / period;
}

function maArray(period) {
  const arr = [];
  for (let i = 0; i < state.prices.length; i++) {
    if (i + 1 < period) { arr.push(null); continue; }
    let sum = 0;
    for (let j = i + 1 - period; j <= i; j++) sum += state.prices[j].p;
    arr.push(sum / period);
  }
  return arr;
}

function heatValue() {
  // 簡化 RSI：近 14 ticks 漲跌幅
  const win = 14;
  if (state.prices.length < win + 1) return 50;
  const recent = state.prices.slice(-(win+1));
  let gain = 0, loss = 0;
  for (let i = 1; i < recent.length; i++) {
    const d = recent[i].p - recent[i-1].p;
    if (d > 0) gain += d; else loss -= d;
  }
  if (gain + loss === 0) return 50;
  const rs = gain / Math.max(0.0001, loss);
  return Math.round(100 - 100 / (1 + rs));
}

function fmt(n, decimals = 2) {
  if (n >= 100_000_000) return (n/100_000_000).toFixed(1) + ' 億';
  if (n >= 10_000) return (n/10_000).toFixed(decimals) + ' 萬';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function render() {
  if (!state.prices.length) return;
  const cur = state.prices[state.prices.length - 1].p;
  const prev = state.prices.length > 1 ? state.prices[state.prices.length - 2].p : cur;
  const chg = cur - prev;
  const chgPct = (chg / prev) * 100;

  // 頂部
  $('cashLabel').textContent = fmt(state.cash);
  $('sharesLabel').textContent = state.shares.toLocaleString();
  $('avgCostLabel').textContent = state.shares > 0 ? `成本 ${state.avgCost.toFixed(2)}` : '';
  const equity = state.cash + state.shares * cur;
  $('equityLabel').textContent = fmt(equity);
  const pnl = ((equity - INITIAL_CASH) / INITIAL_CASH) * 100;
  const pnlEl = $('pnlLabel');
  pnlEl.textContent = (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + '%';
  pnlEl.className = 'sub ' + (pnl >= 0 ? 'up' : 'down');

  // 進度條
  const pct = Math.min(100, equity / WIN_TARGET * 100);
  $('goalProgress').style.width = pct + '%';

  // 價格框
  $('priceNow').textContent = cur.toFixed(2);
  const chgEl = $('priceChange');
  chgEl.textContent = `${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)} (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%)`;
  chgEl.className = chg >= 0 ? 'up' : 'down';

  // 圖表
  drawPriceChart();
  drawVolChart();
  drawChipChart();

  // 熱度
  const heat = heatValue();
  $('heatVal').textContent = heat;
  const heatFill = $('heatFill');
  const isMobile = window.innerWidth < 720;
  if (isMobile) {
    heatFill.style.width = (100 - heat) + '%';
    heatFill.style.height = 'auto';
  } else {
    heatFill.style.height = (100 - heat) + '%';
    heatFill.style.width = 'auto';
  }
}

/* ============== 主圖 ============== */
function drawPriceChart() {
  const c = $('priceChart');
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const data = state.prices.slice(-VISIBLE_TICKS);
  if (data.length < 2) return;
  const prices = data.map(d => d.p);
  const lo = Math.min(...prices) * 0.995;
  const hi = Math.max(...prices) * 1.005;
  const xStep = W / (data.length - 1);

  const px = (i) => i * xStep;
  const py = (p) => H - ((p - lo) / (hi - lo)) * (H - 30) - 15;

  // 網格
  ctx.strokeStyle = '#e8dec2';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = 15 + (H - 30) * g / 4;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.stroke();
    // 價格刻度
    const priceLabel = (hi - (hi - lo) * g / 4).toFixed(2);
    ctx.fillStyle = '#826a4c';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(priceLabel, W - 4, y);
  }

  // 區域填充（價格漲跌色）
  const startP = prices[0];
  const endP = prices[prices.length - 1];
  const fillColor = endP >= startP ? 'rgba(46,150,88,0.12)' : 'rgba(200,58,44,0.12)';
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(px(0), py(prices[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(px(i), py(prices[i]));
  ctx.lineTo(px(data.length - 1), H - 5);
  ctx.lineTo(px(0), H - 5);
  ctx.closePath();
  ctx.fill();

  // 主價格線
  ctx.strokeStyle = endP >= startP ? '#2e9658' : '#c83a2c';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(px(0), py(prices[0]));
  for (let i = 1; i < data.length; i++) ctx.lineTo(px(i), py(prices[i]));
  ctx.stroke();

  // MA5
  const ma5 = maArray(5).slice(-VISIBLE_TICKS);
  ctx.strokeStyle = '#2e9658';
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < ma5.length; i++) {
    if (ma5[i] == null) continue;
    if (!started) { ctx.moveTo(px(i), py(ma5[i])); started = true; }
    else ctx.lineTo(px(i), py(ma5[i]));
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // MA20
  const ma20 = maArray(20).slice(-VISIBLE_TICKS);
  ctx.strokeStyle = '#4a8ac8';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 3]);
  ctx.beginPath();
  started = false;
  for (let i = 0; i < ma20.length; i++) {
    if (ma20[i] == null) continue;
    if (!started) { ctx.moveTo(px(i), py(ma20[i])); started = true; }
    else ctx.lineTo(px(i), py(ma20[i]));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  // 平均成本參考線（若有持倉）
  if (state.shares > 0 && state.avgCost >= lo && state.avgCost <= hi) {
    const y = py(state.avgCost);
    ctx.strokeStyle = '#c8852b';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c8852b';
    ctx.font = 'bold 10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText('我的成本 ' + state.avgCost.toFixed(2), 4, y - 3);
  }

  // 現價點
  const lastX = px(data.length - 1), lastY = py(prices[prices.length - 1]);
  ctx.fillStyle = endP >= startP ? '#2e9658' : '#c83a2c';
  ctx.beginPath();
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(lastX, lastY, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

/* ============== 成交量條 ============== */
function drawVolChart() {
  const c = $('volChart');
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const data = state.prices.slice(-VISIBLE_TICKS);
  if (data.length < 2) return;
  const vols = data.map(d => d.v);
  const maxV = Math.max(...vols, 1);
  const xStep = W / data.length;
  const bw = Math.max(1, xStep - 1);

  for (let i = 0; i < data.length; i++) {
    const v = data[i].v;
    const h = (v / maxV) * (H - 4);
    const prev = i > 0 ? data[i-1].p : data[i].p;
    const up = data[i].p >= prev;
    ctx.fillStyle = up ? 'rgba(46,150,88,0.55)' : 'rgba(200,58,44,0.55)';
    ctx.fillRect(i * xStep, H - h - 2, bw, h);
  }
}

/* ============== 籌碼分佈 ============== */
function drawChipChart() {
  const c = $('chipChart');
  const dpr = window.devicePixelRatio || 1;
  const W = c.clientWidth, H = c.clientHeight;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const data = state.prices.slice(-TOTAL_HISTORY);
  if (data.length < 2) return;

  // bucket 由近 N ticks 的價位 × 成交量累積
  const prices = data.map(d => d.p);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const bins = 20;
  const buckets = new Array(bins).fill(0);
  for (const d of data) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor((d.p - lo) / (hi - lo) * bins)));
    buckets[b] += d.v;
  }
  const maxB = Math.max(...buckets, 1);
  const yStep = H / bins;

  for (let b = 0; b < bins; b++) {
    const w = (buckets[b] / maxB) * (W - 4);
    const y = H - (b + 1) * yStep + 1;
    ctx.fillStyle = 'rgba(184,152,104,0.6)';
    ctx.fillRect(0, y, w, yStep - 2);
  }

  // 現價線
  const cur = data[data.length - 1].p;
  const curBin = Math.min(bins - 1, Math.max(0, Math.floor((cur - lo) / (hi - lo) * bins)));
  const curY = H - (curBin + 0.5) * yStep;
  ctx.strokeStyle = '#c83a2c';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(0, curY); ctx.lineTo(W, curY);
  ctx.stroke();
  ctx.setLineDash([]);
}

/* ============================================================
   TRADE
   ============================================================ */
function currentPrice() {
  return state.prices.length ? state.prices[state.prices.length - 1].p : state.basePrice;
}

function getQty() {
  const mode = state.qtyMode;
  const p = currentPrice();
  if (mode === 'max') {
    return Math.floor(state.cash / p);
  }
  const raw = parseInt($('qtyInput').value, 10);
  return Math.max(1, isNaN(raw) ? 0 : raw);
}

function buy() {
  const p = currentPrice();
  let qty = getQty();
  const cost = p * qty;
  if (cost > state.cash) {
    qty = Math.floor(state.cash / p);
    if (qty <= 0) { toast('現金不足'); return; }
  }
  const totalCost = state.avgCost * state.shares + p * qty;
  state.shares += qty;
  state.avgCost = totalCost / state.shares;
  state.cash -= p * qty;
  state.trades++;
  log(`買入 ${qty} 股 @ ${p.toFixed(2)}（花 ${fmt(p*qty)}）`, 'buy');
  playSfx('buy');
  render();
}

function sell() {
  if (state.shares <= 0) { toast('沒有持倉'); return; }
  const p = currentPrice();
  let qty = state.qtyMode === 'max' ? state.shares : Math.min(state.shares, getQty());
  const proceeds = p * qty;
  const profit = (p - state.avgCost) * qty;
  state.cash += proceeds;
  state.shares -= qty;
  if (state.shares === 0) state.avgCost = 0;
  state.trades++;
  log(`賣出 ${qty} 股 @ ${p.toFixed(2)}（${profit >= 0 ? '+' : ''}${fmt(profit)}）`, 'sell');
  playSfx('sell');
  render();
}

function log(msg, cls = '') {
  const el = $('logArea');
  const line = document.createElement('div');
  line.className = 'log-entry ' + cls;
  const now = new Date();
  const ts = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
  line.textContent = `[${ts}] ${msg}`;
  el.insertBefore(line, el.firstChild);
  while (el.childNodes.length > 30) el.removeChild(el.lastChild);
}

function toast(msg, dur = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), dur);
}

/* ============================================================
   SFX (Web Audio 合成 — 不耗素材)
   ============================================================ */
function playSfx(kind) {
  if (state.muted || !audioCtx) return;
  const now = audioCtx.currentTime;
  if (kind === 'buy') {
    beep(660, 0.06, now, 0.3);
    beep(880, 0.08, now + 0.08, 0.3);
  } else if (kind === 'sell') {
    beep(440, 0.08, now, 0.3);
    beep(330, 0.10, now + 0.10, 0.3);
  } else if (kind === 'crash') {
    beep(120, 0.6, now, 0.4, 'sawtooth');
  } else if (kind === 'surge') {
    beep(880, 0.06, now, 0.3);
    beep(1100, 0.06, now + 0.08, 0.3);
    beep(1320, 0.10, now + 0.16, 0.3);
  } else if (kind === 'win') {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, now + i*0.12, 0.4));
  }
}
function beep(freq, dur, startAt, gain = 0.3, type = 'square') {
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, startAt);
  g.gain.setValueAtTime(gain, startAt);
  g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
  o.connect(g).connect(audioCtx.destination);
  o.start(startAt);
  o.stop(startAt + dur + 0.05);
}

/* ============================================================
   BGM (沿用 IdleEmpire 的 bgm.mp3)
   ============================================================ */
function setupBGM() {
  bgm = new Audio('./assets/audio/bgm.mp3');
  bgm.loop = true;
  bgm.volume = 0.3;
  const startBgm = () => {
    if (state.muted) return;
    bgm.play().catch(()=>{});
    window.removeEventListener('mousedown', startBgm);
    window.removeEventListener('touchstart', startBgm);
    window.removeEventListener('keydown', startBgm);
  };
  window.addEventListener('mousedown', startBgm);
  window.addEventListener('touchstart', startBgm, { passive: true });
  window.addEventListener('keydown', startBgm);
}

function toggleMute() {
  state.muted = !state.muted;
  $('muteBtn').textContent = state.muted ? '靜' : '音';
  if (bgm) {
    if (state.muted) bgm.pause();
    else bgm.play().catch(()=>{});
  }
}

/* ============================================================
   WIN
   ============================================================ */
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

/* ============================================================
   INIT
   ============================================================ */
function init() {
  // 預先產生一段歷史（讓 chart 一開始有東西看）
  state.prices = [{ t: 0, p: state.basePrice, v: 1000 }];
  for (let i = 1; i < 40; i++) {
    state.tick = i;
    const next = nextPrice();
    state.prices.push({ t: i, p: next.p, v: next.v });
  }
  state.tick = state.prices.length;

  // UI binding
  document.querySelectorAll('.qtyBtn').forEach(btn => {
    btn.onclick = () => {
      state.qtyMode = btn.dataset.qty;
      document.querySelectorAll('.qtyBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (state.qtyMode !== 'max') $('qtyInput').value = state.qtyMode;
      playSfx('buy');
    };
  });
  $('qtyInput').oninput = () => { state.qtyMode = $('qtyInput').value; };
  $('buyBtn').onclick = buy;
  $('sellBtn').onclick = sell;
  $('muteBtn').onclick = toggleMute;
  $('restartBtn').onclick = () => location.reload();
  document.querySelector('[data-qty="10"]').classList.add('active');

  // 鍵盤快捷
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'b' || e.key === 'B') buy();
    if (e.key === 's' || e.key === 'S') sell();
  });

  setupBGM();
  render();

  // 主迴圈
  setInterval(tick, TICK_MS);
}

window.addEventListener('DOMContentLoaded', init);
})();
