(() => {
'use strict';
/* ============================================================
   EMPIRE INDEX v0.6 — PULSE BUILD
   時間單位設計：5 真實秒 = 1 PULSE (遊戲日)
   ============================================================ */
const TICK_MS = 1_000;
const SUBTICK_MS = 60;
const PANEL_UPDATE_MS = 2500;
const INITIAL_CASH = 10_000;
const WIN_TARGET = 50_000;
const VISIBLE_CANDLES_BASE = 40;
const TOTAL_HISTORY = 1800;
const DRIFT = 0.0004;
const VOL = 0.014;
const NEWS_PROB = 0.012;        // 普通即時新聞
const FORECAST_PROB = 0.008;    // 預告事件
const FORECAST_MIN_LEAD = 5;    // 提前 5 Pulse 預告
const FORECAST_MAX_LEAD = 18;   // 最多 18 Pulse
const PULSE_PER_TICK = 0.2;     // 1 tick = 0.2 pulse → 5 ticks = 1 pulse

/* ============== 新聞庫：10 利多 + 10 利空 ============== */
const NEWS_GOOD = [
  '機構買家連續吸籌，鏈上巨鯨地址增加 18%',
  'Empire DAO 通過治理提案，代幣銷毀啟動',
  'Vela 央行降息 0.5%，市場流動性提升',
  '主流交易所宣布 EPC 零手續費活動',
  'Layer-2 主網升級完成，TPS 提升 10 倍',
  '監管機構正式核准 EPC 現貨 ETF 上市',
  'Sora 鏈日活突破歷史新高，創 240 萬地址',
  'Phantom Capital 公開五億美元做多倉位',
  '跨鏈橋資金流入連續 7 天創新高',
  '機構支付方案上線，EPC 接入百萬商戶',
];
const NEWS_BAD = [
  '監管機構展開反洗錢調查，多家交易所配合',
  '巨鯨地址連續減倉，鏈上資金外流加速',
  'Vela 央行緊急升息 0.75%，市場流動性收緊',
  '主要交易所暫停 EPC 提現，社群恐慌升溫',
  'Sora 鏈遭遇駭客攻擊，損失估計 8000 萬',
  '監管草案禁止零售投資人持有 EPC',
  'Phantom Capital 拋售 70% 持倉，引發踩踏',
  '法人連續 5 天減倉，做空訂單激增 200%',
  '穩定幣脫鉤事件波及，市場連鎖賣壓',
  '日活地址跌至 60 天新低，鏈上活躍度疲弱',
];

/* ============== 預告事件庫 ============== */
const FORECAST_GOOD = [
  { text: 'Empire DAO 將公布主網升級結果',          impact: '預期：成功則市場樂觀'    },
  { text: 'Vela 央行召開貨幣政策會議',                impact: '預期：降息可能'           },
  { text: '機構 ETF 申請審查截止',                    impact: '預期：核准利多'           },
  { text: '主流交易所將上線新交易對',                  impact: '預期：流動性提升'         },
  { text: 'Layer-2 主網切換窗口',                     impact: '預期：技術利多'           },
  { text: '機構財報日，預期亮眼',                      impact: '預期：盈餘驚喜'           },
  { text: '半年度代幣銷毀執行',                        impact: '預期：通縮利多'           },
  { text: '監管框架草案公布',                          impact: '預期：合規利多'           },
  { text: 'Empire 鏈生態大會，重磅嘉賓出席',          impact: '預期：消息利多'           },
  { text: '社群提案投票結果公布',                      impact: '預期：通過可能性高'       },
];
const FORECAST_BAD = [
  { text: '監管聽證會召開，議題敏感',                  impact: '預期：政策利空'           },
  { text: '大量代幣解禁釋出',                          impact: '預期：賣壓增加'           },
  { text: 'Vela 央行升息會議',                          impact: '預期：流動性收緊'         },
  { text: '主要法人鎖倉期屆滿',                        impact: '預期：減倉壓力'           },
  { text: '稅務改革草案二讀',                          impact: '預期：報稅利空'           },
  { text: '反洗錢調查中期報告',                        impact: '預期：監管利空'           },
  { text: '宏觀數據公布日，市場敏感',                   impact: '預期：波動加大'           },
  { text: '主要交易所合規審查截止',                    impact: '預期：可能下架部分代幣'   },
  { text: '做空機構公布研究報告',                      impact: '預期：估值質疑'           },
  { text: '司法部訴訟結果宣判日',                      impact: '預期：壞消息可能'         },
];

const state = {
  prices: [],
  basePrice: 100, tick: 0, trend: 0, trendTicks: 0,
  startTime: Date.now(),
  cash: INITIAL_CASH, shares: 0, avgCost: 0,
  trades: 0, won: false,
  qtyMode: '100', muted: false,
  displayPrice: 100, flashUntil: 0,

  candlePeriod: 5,
  ma1Period: 5, ma1On: true,
  ma2Period: 20, ma2On: true,
  showVol: false,

  viewOffset: 0,
  yScaleMult: 1,

  lastPanelUpdate: 0,
  shownPrice: 100,

  tradingMode: 'market',
  pendingOrders: [],
  executedHistory: [],
  realizedPnl: 0,
  nextOrderId: 1,

  // 預告事件
  upcomingEvents: [],   // [{id, announcedPulse, executePulse, type, text, impact}]
  pastEvents: [],       // 同上 + executed=true

  // log
  logEntries: { all: [], trade: [], news: [] },
  logTab: 'all',
  logExpanded: false,

  started: false,       // splash 結束才開始
};

/* ============== Pulse 換算 ============== */
function currentPulse() { return Math.floor(state.tick * PULSE_PER_TICK); }
function pulseStr(p) { return 'DAY ' + String(p).padStart(4, '0'); }

let bgm = null;
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const audioCtx = AudioCtx ? new AudioCtx() : null;

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function nextPrice(suppressNews = false) {
  if (state.trendTicks > 0) { state.trendTicks--; if (state.trendTicks === 0) state.trend = 0; }
  else if (Math.random() < 0.01) {
    state.trend = (Math.random() < 0.5 ? -1 : 1) * (0.002 + Math.random()*0.005);
    state.trendTicks = 30 + Math.floor(Math.random()*60);
  }
  const last = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  let mu = DRIFT + state.trend;
  let sig = VOL;
  let event = null, kind = null;
  if (!suppressNews && Math.random() < NEWS_PROB) {
    const good = Math.random() < 0.5;
    mu += good ? 0.015 : -0.015;
    sig *= 1.5;
    event = good ? NEWS_GOOD[Math.floor(Math.random()*NEWS_GOOD.length)]
                 : NEWS_BAD[Math.floor(Math.random()*NEWS_BAD.length)];
    kind = good ? 'news+' : 'news-';
  }
  const shock = gauss() * sig;
  const p = Math.max(0.5, last * Math.exp(mu + shock));
  const v = Math.round(800 + Math.random()*1600 + Math.abs(shock)*40000);
  return { p, v, event, kind };
}

/* 預告事件 — 觸發已預告的事件造成衝擊 */
function triggerForecastEvent(ev) {
  const last = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  let mu, sig = 0.025;
  if (ev.type === 'good') { mu = 0.06 + Math.random()*0.04; }
  else { mu = -0.06 - Math.random()*0.04; }
  const shock = gauss() * sig;
  const p = Math.max(0.5, last * Math.exp(mu + shock));
  const v = Math.round(3000 + Math.random()*5000);
  state.prices.push({ t: state.tick, p, v });
  if (state.prices.length > TOTAL_HISTORY) state.prices.shift();
  state.displayPrice = state.displayPrice * 0.5 + p * 0.5;

  ev.executed = true;
  ev.actualPulse = currentPulse();
  state.pastEvents.unshift(ev);
  if (state.pastEvents.length > 80) state.pastEvents.pop();

  log(`【事件觸發】${ev.text}`, 'event', 'news');
  toast(`${ev.type === 'good' ? '利多' : '利空'}觸發：${ev.text}`, ev.type === 'good' ? 'surge' : 'crash', 3200);
  playSfx(ev.type === 'good' ? 'surge' : 'crash');
}

/* 隨機產生預告事件 */
function maybeAnnounceForecast() {
  if (Math.random() >= FORECAST_PROB) return;
  // 同時上限 5 件
  if (state.upcomingEvents.length >= 5) return;
  const good = Math.random() < 0.5;
  const pool = good ? FORECAST_GOOD : FORECAST_BAD;
  const pick = pool[Math.floor(Math.random()*pool.length)];
  const lead = FORECAST_MIN_LEAD + Math.floor(Math.random() * (FORECAST_MAX_LEAD - FORECAST_MIN_LEAD));
  const ev = {
    id: 'ev' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    type: good ? 'good' : 'bad',
    text: pick.text,
    impact: pick.impact,
    announcedPulse: currentPulse(),
    executePulse: currentPulse() + lead,
    executed: false,
  };
  state.upcomingEvents.push(ev);
  log(`【預告】${lead} 天後：${ev.text}`, 'event', 'news');
  toast(`預告：${lead} 天後 — ${ev.text}`, 'upcoming', 3200);
  playSfx('news');
}

function tick() {
  if (!state.started) return;
  state.tick++;
  const next = nextPrice();
  state.prices.push({ t: state.tick, p: next.p, v: next.v });
  if (state.prices.length > TOTAL_HISTORY) state.prices.shift();
  if (next.event) {
    log(next.event, 'news', 'news');
    if (next.kind === 'news+') toast(next.event, 'surge', 2400);
    else toast(next.event, 'crash', 2400);
    playSfx('news');
  }

  // 預告事件觸發
  const pulse = currentPulse();
  const stillUpcoming = [];
  for (const ev of state.upcomingEvents) {
    if (ev.executePulse <= pulse) {
      triggerForecastEvent(ev);
    } else {
      stillUpcoming.push(ev);
    }
  }
  state.upcomingEvents = stillUpcoming;

  // 新預告
  maybeAnnounceForecast();

  // 限價單檢查
  checkPendingOrders(state.prices[state.prices.length-1].p);

  // 日曆按鈕指示
  $('calendarBtn').classList.toggle('has-upcoming', state.upcomingEvents.length > 0);

  // pulse 標籤
  $('pulseLabel').textContent = pulseStr(pulse);

  checkWin();
}

/* ============== K-LINE ============== */
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
    ...g, startPulse: Math.floor(g.startTick * PULSE_PER_TICK),
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
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e4) return (n/1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

function flashEl(id) {
  const el = $(id); if (!el) return;
  el.classList.remove('val-updated');
  void el.offsetWidth;
  el.classList.add('val-updated');
}

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

  $('cashLabel').textContent = fmt(state.cash);
  $('sharesLabel').textContent = state.shares.toLocaleString();
  $('avgCostLabel').textContent = state.shares > 0 ? state.avgCost.toFixed(2) : '--';

  const realEl = $('realPnlLabel');
  realEl.textContent = (state.realizedPnl >= 0 ? '+' : '') + fmt(state.realizedPnl);
  realEl.className = 'posV ' + (state.realizedPnl > 0.01 ? 'up' : state.realizedPnl < -0.01 ? 'down' : '');

  const equity = state.cash + state.shares * cur;
  $('equityLabel').textContent = fmt(equity);

  // 數值更新動畫 + 音效
  ['cashLabel','sharesLabel','avgCostLabel','equityLabel','realPnlLabel'].forEach(flashEl);
  if (!force) playSfx('panelTick');

  const unrealLabelEl = $('unrealPnlLabel');
  const unrealPctEl = $('unrealPnlPct');
  const unrealAmtEl = $('unrealPnlAmount');
  if (state.shares > 0) {
    unrealLabelEl.textContent = '未實現';
    const cost = state.avgCost * state.shares;
    const market = cur * state.shares;
    const pnlAmt = market - cost;
    const pnlPct = (pnlAmt / Math.max(0.001, cost)) * 100;
    const sign = pnlAmt >= 0 ? '+' : '';
    // 大字：金額
    unrealAmtEl.textContent = sign + fmt(pnlAmt);
    unrealAmtEl.className = 'posPnl ' + (pnlAmt > 0.01 ? 'up' : pnlAmt < -0.01 ? 'down' : 'flat');
    // 小字：百分比
    unrealPctEl.textContent = sign + pnlPct.toFixed(2) + '%';
    unrealPctEl.className = 'posTick ' + (pnlPct > 0.01 ? 'up' : pnlPct < -0.01 ? 'down' : '');
  } else {
    unrealLabelEl.textContent = '空倉';
    unrealAmtEl.textContent = '--';
    unrealAmtEl.className = 'posPnl flat';
    unrealPctEl.textContent = '';
    unrealPctEl.className = 'posTick';
  }

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

/* ============== Candle Chart (升級網格) ============== */
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

  // 升級網格：主格線清晰 + 次格線細微
  ctx.lineWidth = 1;
  // 次水平格線（每 1/8）
  ctx.strokeStyle = 'rgba(140,160,180,0.04)';
  for (let g = 1; g < 8; g++) {
    if (g % 2 === 0) continue;
    const y = 12 + (H - 24) * g / 8;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
  }
  // 主水平格線（每 1/4）
  ctx.strokeStyle = 'rgba(140,160,180,0.10)';
  for (let g = 0; g <= 4; g++) {
    const y = 12 + (H - 24) * g / 4;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
  }
  // 主垂直格線（每 1/4）
  ctx.strokeStyle = 'rgba(140,160,180,0.08)';
  for (let g = 0; g <= 4; g++) {
    const x = chartW * g / 4;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  // 內框（更清晰外框）
  ctx.strokeStyle = 'rgba(140,160,180,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, chartW - 1, H - 1);

  // 價格刻度
  ctx.fillStyle = '#9faab8';
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

  // 平均成本線
  if (state.shares > 0 && state.avgCost >= lo && state.avgCost <= hi) {
    const y = py(state.avgCost);
    ctx.strokeStyle = 'rgba(240, 185, 11, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0b90b';
    ctx.font = 'bold 9px JetBrains Mono';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('成本 ' + state.avgCost.toFixed(2), 4, y - 2);
  }

  // 掛單線
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
  ctx.lineWidth = 1.4;
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

/* 時間軸：顯示 PULSE 編號 */
function renderTimeAxis(candles) {
  const el = $('timeAxis');
  if (candles.length === 0) { el.innerHTML = ''; return; }
  const c = $('priceChart');
  const W = c.clientWidth;
  const padR = 50;
  const chartW = W - padR;
  const positions = [0, 0.25, 0.5, 0.75, 1];
  const html = positions.map(p => {
    const idx = Math.min(candles.length - 1, Math.round(p * (candles.length - 1)));
    const pulse = candles[idx].startPulse;
    const px = p * chartW;
    return `<span style="left:${px}px">D${String(pulse).padStart(4,'0')}</span>`;
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

/* ============== TRADE ============== */
function currentPrice() { return state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice; }
function getQty() {
  const mode = state.qtyMode;
  const p = state.tradingMode === 'limit' ? (parseFloat($('limitPriceInput').value) || currentPrice()) : currentPrice();
  if (mode === 'max') return Math.floor(state.cash / p);
  const raw = parseInt($('qtyInput').value, 10);
  return Math.max(1, isNaN(raw) ? 0 : raw);
}

function buy() {
  if (state.tradingMode === 'limit') return placeLimitOrder('buy');
  const p = currentPrice();
  let qty = getQty();
  if (p * qty > state.cash) { qty = Math.floor(state.cash / p); if (qty <= 0) { toast('現金不足'); playSfx('reject'); return; } }
  executeMarketBuy(qty, p);
  playSfx('marketBuy');
}

function sell() {
  if (state.tradingMode === 'limit') return placeLimitOrder('sell');
  if (state.shares <= 0) { toast('沒有持倉'); playSfx('reject'); return; }
  const p = currentPrice();
  let qty = state.qtyMode === 'max' ? state.shares : Math.min(state.shares, getQty());
  if (qty <= 0) return;
  executeMarketSell(qty, p);
  playSfx('marketSell');
}

function executeMarketBuy(qty, p, fromLimit = false) {
  const totalCost = state.avgCost * state.shares + p * qty;
  state.shares += qty;
  state.avgCost = totalCost / state.shares;
  state.cash -= p * qty;
  state.trades++;
  log(`買 ${qty} @${p.toFixed(2)} = ${fmt(p*qty)}`, 'buy', 'trade');
  state.executedHistory.unshift({ id: state.nextOrderId++, side: 'buy', qty, price: p, ts: Date.now(), profit: null, kind: fromLimit ? 'limit' : 'market' });
  if (state.executedHistory.length > 50) state.executedHistory.pop();
  maybeUpdatePanel(true);
  updateOrdersUI();
}

function executeMarketSell(qty, p, fromLimit = false) {
  const profit = (p - state.avgCost) * qty;
  state.realizedPnl += profit;
  state.cash += p * qty;
  state.shares -= qty;
  if (state.shares === 0) state.avgCost = 0;
  state.trades++;
  log(`賣 ${qty} @${p.toFixed(2)} ${profit >= 0 ? '+' : ''}${fmt(profit)}`, 'sell', 'trade');
  state.executedHistory.unshift({ id: state.nextOrderId++, side: 'sell', qty, price: p, ts: Date.now(), profit, kind: fromLimit ? 'limit' : 'market' });
  if (state.executedHistory.length > 50) state.executedHistory.pop();
  maybeUpdatePanel(true);
  updateOrdersUI();
}

function placeLimitOrder(side) {
  const price = parseFloat($('limitPriceInput').value);
  if (!isFinite(price) || price <= 0) { toast('請輸入有效目標價'); playSfx('reject'); return; }
  let qty = getQty();
  if (qty <= 0) { toast('請輸入數量'); playSfx('reject'); return; }
  if (side === 'buy') {
    if (price * qty > state.cash) {
      qty = Math.floor(state.cash / price);
      if (qty <= 0) { toast('現金不足'); playSfx('reject'); return; }
    }
  } else {
    if (state.shares <= 0) { toast('沒有持倉可賣'); playSfx('reject'); return; }
    qty = state.qtyMode === 'max' ? state.shares : Math.min(state.shares, qty);
    if (qty <= 0) return;
  }
  state.pendingOrders.push({
    id: state.nextOrderId++, side, qty, price, ts: Date.now(),
  });
  log(`掛${side === 'buy' ? '買' : '賣'} ${qty} @${price.toFixed(2)}`, side, 'trade');
  toast(`已掛單 ${side === 'buy' ? '買' : '賣'} ${qty}@${price.toFixed(2)}`, 'news');
  playSfx('orderPlace');
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
      if (ord.side === 'buy') {
        if (ord.price * ord.qty > state.cash) { log(`掛買失敗（現金不足）${ord.qty}@${ord.price.toFixed(2)}`, 'sell', 'trade'); continue; }
        executeMarketBuy(ord.qty, ord.price, true);
        toast(`限價買入 ${ord.qty}@${ord.price.toFixed(2)}`, 'surge');
        playSfx('limitFill');
      } else {
        const qty = Math.min(state.shares, ord.qty);
        if (qty <= 0) { log(`掛賣失敗（無持倉）${ord.qty}@${ord.price.toFixed(2)}`, 'sell', 'trade'); continue; }
        executeMarketSell(qty, ord.price, true);
        toast(`限價賣出 ${qty}@${ord.price.toFixed(2)}`, 'surge');
        playSfx('limitFill');
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
  log('取消掛單', '', 'trade');
  playSfx('click');
  updateOrdersUI();
  drawChartArea();
}

function updateOrdersUI() {
  $('ordersBtn').classList.toggle('has-pending', state.pendingOrders.length > 0);
  const pList = $('pendingList');
  if (state.pendingOrders.length === 0) {
    pList.innerHTML = '<div class="orderEmpty">尚無掛單</div>';
  } else {
    pList.innerHTML = state.pendingOrders.map(o => {
      const placedAt = state.tick - Math.round((Date.now() - o.ts) / TICK_MS);
      const placedPulse = Math.max(0, Math.floor(placedAt * PULSE_PER_TICK));
      return `<div class="orderItem">
        <span class="orderSide ${o.side}">${o.side === 'buy' ? '買' : '賣'}</span>
        <div>
          <div class="orderInfo">${o.qty} 股 @ ${o.price.toFixed(2)}</div>
          <div class="orderSub">掛單於 D${String(placedPulse).padStart(4,'0')}</div>
        </div>
        <button class="orderAct" data-cancel="${o.id}">取消</button>
      </div>`;
    }).join('');
    pList.querySelectorAll('[data-cancel]').forEach(b => {
      b.onclick = () => cancelOrder(parseInt(b.dataset.cancel, 10));
    });
  }
  const hList = $('historyList');
  if (state.executedHistory.length === 0) {
    hList.innerHTML = '<div class="orderEmpty">尚無歷史</div>';
  } else {
    hList.innerHTML = state.executedHistory.map(o => {
      const ph = state.tick - Math.round((Date.now() - o.ts) / TICK_MS);
      const pulse = Math.max(0, Math.floor(ph * PULSE_PER_TICK));
      const resultHtml = (o.profit != null)
        ? `<span class="orderResult ${o.profit >= 0 ? 'profit' : 'loss'}">${o.profit >= 0 ? '+' : ''}${fmt(o.profit)}</span>`
        : '<span class="orderSub">建倉</span>';
      return `<div class="orderItem">
        <span class="orderSide ${o.side}">${o.side === 'buy' ? '買' : '賣'}</span>
        <div>
          <div class="orderInfo">${o.qty} 股 @ ${o.price.toFixed(2)} <span class="orderSub">${o.kind === 'limit' ? '限價' : '市價'}</span></div>
          <div class="orderSub">D${String(pulse).padStart(4,'0')}</div>
        </div>
        ${resultHtml}
      </div>`;
    }).join('');
  }
}

/* ============== 日曆 UI ============== */
function updateCalendarUI() {
  $('calCurrentPulse').textContent = pulseStr(currentPulse());
  const uList = $('upcomingList');
  if (state.upcomingEvents.length === 0) {
    uList.innerHTML = '<div class="orderEmpty">尚無預告事件</div>';
  } else {
    const now = currentPulse();
    uList.innerHTML = state.upcomingEvents
      .slice().sort((a, b) => a.executePulse - b.executePulse)
      .map(ev => {
        const remain = ev.executePulse - now;
        return `<div class="calItem ${ev.type}">
          <div>
            <div class="calPulse ${ev.type}">D${String(ev.executePulse).padStart(4,'0')}</div>
            <div class="calCountdown">${remain > 0 ? remain + ' 天後' : '即將觸發'}</div>
          </div>
          <div>
            <div class="calText">${ev.type === 'good' ? '◆ 利多' : '◆ 利空'} — ${ev.text}</div>
            <div class="calSub">${ev.impact}</div>
          </div>
        </div>`;
      }).join('');
  }
  const pList = $('pastList');
  if (state.pastEvents.length === 0) {
    pList.innerHTML = '<div class="orderEmpty">尚無已發生事件</div>';
  } else {
    pList.innerHTML = state.pastEvents.slice(0, 30).map(ev => {
      return `<div class="calItem ${ev.type} past">
        <div>
          <div class="calPulse ${ev.type}">D${String(ev.actualPulse || ev.executePulse).padStart(4,'0')}</div>
          <div class="calCountdown">已觸發</div>
        </div>
        <div>
          <div class="calText">${ev.type === 'good' ? '◆ 利多' : '◆ 利空'} — ${ev.text}</div>
          <div class="calSub">${ev.impact}</div>
        </div>
      </div>`;
    }).join('');
  }
}

/* ============== LOG ============== */
function log(msg, cls = '', cat = 'all') {
  const ts = pulseStr(currentPulse());
  const entry = { ts, msg, cls };
  state.logEntries.all.unshift(entry);
  if (cat === 'trade') state.logEntries.trade.unshift(entry);
  if (cat === 'news') state.logEntries.news.unshift(entry);
  if (state.logEntries.all.length > 100) state.logEntries.all.pop();
  if (state.logEntries.trade.length > 100) state.logEntries.trade.pop();
  if (state.logEntries.news.length > 100) state.logEntries.news.pop();
  renderLog();
}
function renderLog() {
  const targets = { all: 'logAll', trade: 'logTrade', news: 'logNews' };
  for (const [cat, id] of Object.entries(targets)) {
    const el = $(id);
    if (!el) continue;
    const list = state.logEntries[cat];
    if (list.length === 0) { el.innerHTML = ''; continue; }
    el.innerHTML = list.map(e =>
      `<div class="log-entry ${e.cls}"><span class="lt">${e.ts}</span>${e.msg}</div>`
    ).join('');
  }
}

function toast(msg, cls = '', dur = 2400) {
  const t = $('toast');
  t.textContent = msg; t.className = cls;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), dur);
}

/* ============== 音效（合成）============== */
function playSfx(kind) {
  if (state.muted || !audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  if (kind === 'marketBuy') {
    beep(660, 0.06, now, 0.22); beep(880, 0.08, now + 0.06, 0.22);
  } else if (kind === 'marketSell') {
    beep(660, 0.06, now, 0.22); beep(440, 0.10, now + 0.06, 0.22);
  } else if (kind === 'orderPlace') {
    beep(700, 0.04, now, 0.18); beep(900, 0.05, now + 0.05, 0.18);
  } else if (kind === 'limitFill') {
    [700, 900, 1100, 1320].forEach((f, i) => beep(f, 0.06, now + i*0.05, 0.22));
  } else if (kind === 'news') {
    beep(330, 0.10, now, 0.18, 'triangle'); beep(440, 0.08, now + 0.08, 0.16, 'triangle');
  } else if (kind === 'pageFlip') {
    try {
      const sr = audioCtx.sampleRate;
      const bufLen = Math.ceil(sr * 0.16);
      const buf = audioCtx.createBuffer(1, bufLen, sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++)
        d[i] = (Math.random()*2-1) * Math.pow(1 - i/bufLen, 1.3);
      const src = audioCtx.createBufferSource(); src.buffer = buf;
      const bp = audioCtx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 3800; bp.Q.value = 0.35;
      const g2 = audioCtx.createGain(); g2.gain.setValueAtTime(0.09, now);
      src.connect(bp); bp.connect(g2); g2.connect(audioCtx.destination);
      src.start(now);
    } catch(e) {}
  } else if (kind === 'panelTick') {
    beep(1600, 0.015, now, 0.006);
  } else if (kind === 'click') {
    beep(1200, 0.02, now, 0.12);
  } else if (kind === 'reject') {
    beep(220, 0.16, now, 0.22, 'sawtooth');
  } else if (kind === 'crash') {
    beep(120, 0.7, now, 0.32, 'sawtooth'); beep(90, 0.7, now + 0.1, 0.22, 'sawtooth');
  } else if (kind === 'surge') {
    [880, 1100, 1320].forEach((f, i) => beep(f, 0.08, now + i*0.07, 0.25));
  } else if (kind === 'win') {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.2, now + i*0.13, 0.32));
  }
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
}
function startBGM() {
  if (!bgm || state.muted) return;
  bgm.play().catch(()=>{});
}
function toggleMute() {
  state.muted = !state.muted;
  $('muteBtn').textContent = state.muted ? '♪̷' : '♪';
  if (bgm) { if (state.muted) bgm.pause(); else bgm.play().catch(()=>{}); }
  playSfx('click');
}
function checkWin() {
  if (state.won) return;
  const equity = state.cash + state.shares * currentPrice();
  if (equity >= WIN_TARGET) {
    state.won = true;
    const elapsed = Math.round((Date.now() - state.startTime) / 1000);
    const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
    $('winTime').textContent = `${mins} 分 ${secs} 秒 (DAY ${currentPulse()})`;
    $('winTrades').textContent = state.trades;
    $('winScreen').classList.remove('hidden');
    playSfx('win');
  }
}

function openOverlay(id) { $(id).classList.remove('hidden'); }
function closeOverlay(id) { $(id).classList.add('hidden'); }

function updateMaLabels() {
  $('ma1Label').textContent = `MA ${state.ma1Period}`;
  $('ma2Label').textContent = `MA ${state.ma2Period}`;
  $('ma1Legend').classList.toggle('hidden', !state.ma1On);
  $('ma2Legend').classList.toggle('hidden', !state.ma2On);
}

function updateSubPanels() {
  $('subPanels').classList.toggle('hidden', !state.showVol);
  drawChartArea();
}

function updateModeUI() {
  document.querySelectorAll('.modeBtn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === state.tradingMode);
  });
  $('limitPriceRow').classList.toggle('hidden', state.tradingMode !== 'limit');
  if (state.tradingMode === 'limit') {
    const inp = $('limitPriceInput');
    if (!inp.value || parseFloat(inp.value) <= 0) inp.value = currentPrice().toFixed(2);
  }
}

function setupChartGesture() {
  const c = $('priceChart');
  let dragging = false;
  let startX = 0, startY = 0;
  let startOffset = 0, startScale = 1;
  let lockedAxis = null;

  const begin = (x, y) => {
    dragging = true; startX = x; startY = y;
    startOffset = state.viewOffset; startScale = state.yScaleMult;
    lockedAxis = null; c.classList.add('dragging');
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
  $('resetViewBtn').onclick = () => { state.viewOffset = 0; state.yScaleMult = 1; drawChartArea(); playSfx('click'); };
}

/* ============== Splash 動畫背景 ============== */
function drawSplashChart() {
  const c = $('splashChart');
  if (!c || $('splashScreen').classList.contains('hidden')) return;
  const ctx = c.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // 漂浮 K 線剪影
  const N = 60;
  const candleW = w / N;
  let price = h * 0.5;
  const t0 = performance.now() / 1000;
  ctx.strokeStyle = 'rgba(41,98,255,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, price);
  for (let i = 0; i < N; i++) {
    price += Math.sin((i + t0 * 4) * 0.3) * 8 + (Math.random() - 0.5) * 4;
    price = Math.max(h*0.15, Math.min(h*0.85, price));
    const x = i * candleW;
    ctx.lineTo(x, price);
  }
  ctx.stroke();
  requestAnimationFrame(drawSplashChart);
}

function startGame() {
  $('splashScreen').classList.add('hidden');
  state.started = true;
  state.startTime = Date.now() - state.tick * TICK_MS;
  startBGM();
  playSfx('limitFill');
}

function init() {
  // 暖場 600 tick
  state.prices = [{ t: 0, p: state.basePrice, v: 1000 }];
  for (let i = 1; i < 600; i++) {
    state.tick = i;
    const next = nextPrice(true);  // 暖場不出新聞
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
      playSfx('click');
    };
  });
  $('qtyInput').value = '100';
  $('qtyInput').addEventListener('focus', () => {
    document.querySelectorAll('.qtyBtn').forEach(b => b.classList.remove('active'));
    state.qtyMode = $('qtyInput').value;
  });
  $('qtyInput').addEventListener('input', () => { state.qtyMode = $('qtyInput').value; });

  document.querySelectorAll('.modeBtn').forEach(btn => {
    btn.onclick = () => { state.tradingMode = btn.dataset.mode; updateModeUI(); playSfx('click'); };
  });

  document.querySelectorAll('.periodBtn').forEach(btn => {
    btn.onclick = () => {
      state.candlePeriod = parseInt(btn.dataset.period, 10);
      document.querySelectorAll('.periodBtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewOffset = 0;
      drawChartArea();
      playSfx('click');
    };
  });

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
  $('volToggle').addEventListener('change', () => { state.showVol = $('volToggle').checked; updateSubPanels(); });

  $('buyBtn').onclick = buy;
  $('sellBtn').onclick = sell;
  $('muteBtn').onclick = toggleMute;
  $('indicatorBtn').onclick = () => { openOverlay('indicatorOverlay'); playSfx('click'); };
  $('ordersBtn').onclick = () => { updateOrdersUI(); openOverlay('ordersOverlay'); playSfx('click'); };
  $('calendarBtn').onclick = () => { updateCalendarUI(); openOverlay('calendarOverlay'); playSfx('click'); };
  $('restartBtn').onclick = () => location.reload();
  $('startBtn').onclick = startGame;

  document.querySelectorAll('.overlayClose').forEach(b => {
    b.onclick = () => { closeOverlay(b.dataset.close); playSfx('click'); };
  });
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', (e) => { if (e.target === o) o.classList.add('hidden'); });
  });

  // 委託 / 日曆 / log 分頁
  document.querySelectorAll('[data-tab]').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      $('pendingTab').classList.toggle('hidden', tab !== 'pending');
      $('historyTab').classList.toggle('hidden', tab !== 'history');
      playSfx('click');
    };
  });
  document.querySelectorAll('[data-caltab]').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('[data-caltab]').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.caltab;
      $('upcomingTab').classList.toggle('hidden', tab !== 'upcoming');
      $('pastTab').classList.toggle('hidden', tab !== 'past');
      playSfx('click');
    };
  });
  document.querySelectorAll('[data-logtab]').forEach(t => {
    t.onclick = () => {
      document.querySelectorAll('[data-logtab]').forEach(b => b.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.logtab;
      $('logAll').classList.toggle('hidden', tab !== 'all');
      $('logTrade').classList.toggle('hidden', tab !== 'trade');
      $('logNews').classList.toggle('hidden', tab !== 'news');
      state.logTab = tab;
      playSfx('click');
    };
  });
  // log 展開/收合
  $('logToggleBtn').onclick = () => {
    state.logExpanded = !state.logExpanded;
    $('logPanel').classList.toggle('expanded', state.logExpanded);
    $('logPanel').classList.toggle('collapsed', !state.logExpanded);
    playSfx('pageFlip');
  };

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!state.started) return;
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

  // splash 動畫
  requestAnimationFrame(drawSplashChart);

  setInterval(tick, TICK_MS);
  setInterval(subtick, SUBTICK_MS);
  window.addEventListener('resize', () => { drawChartArea(); });

  // 初始 PULSE label
  $('pulseLabel').textContent = pulseStr(currentPulse());
}

window.addEventListener('DOMContentLoaded', init);
})();
