
(function () {
'use strict';

/* ============================================================
   FIREBASE
   ============================================================ */
const FB_CFG = {
  apiKey: "AIzaSyDaMkDm2G-4xYZbfPELXIuYiUXIGJI7c9E",
  authDomain: "paigame.firebaseapp.com",
  databaseURL: "https://paigame-default-rtdb.firebaseio.com",
  projectId: "paigame",
  appId: "1:402951779833:web:14ca7cfe3ee6495f5e7928",
};
let db = null;
function initFirebase() {
  try { firebase.initializeApp(FB_CFG); db = firebase.database(); }
  catch(e) { console.warn('Firebase:', e); }
}

/* ============================================================
   PLAYER SESSION
   ============================================================ */
// sessionStorage: per-tab (not shared between tabs in same browser)
// localStorage:   per-origin (shared across all tabs) — used for nickname & market state only
let playerId    = sessionStorage.getItem('empire_pid') || null;
let nickname    = localStorage.getItem('empire_nick') || '';
let lastSyncEq  = 0;
let selectedMkt = 'empire';

function ensurePlayerId() {
  if (!playerId) {
    playerId = 'p' + Math.random().toString(36).slice(2,9) + Date.now().toString(36);
    sessionStorage.setItem('empire_pid', playerId); // tab-isolated
  }
  return playerId;
}

/* ============================================================
   MARKETS
   ============================================================ */
const MARKETS = {
  empire: {
    id:'empire', name:'Empire 幣', sub:'全球虛擬指數', color:'#2962ff',
    lat:0, lng:0, sigma:0.008, drift:0.0001, base:100,
    blackSwan:0.008, meanRev:0,
    news:{
      good:['機構投資者大量買入 Empire，信心回升',
            '監管機構對 Empire 生態表示正面態度',
            'Empire 鏈日交易量創歷史新高',
            '知名基金宣布重倉 Empire',
            'Empire 協議升級完成，手續費大幅降低',
            '全球最大交易所宣布上架 Empire',
            '頂尖分析師上調 Empire 目標價',
            '跨鏈橋接成功，帶動生態流動性'],
      bad:['Empire 鏈異常交易引發市場擔憂',
           '監管機構傳出將對 Empire 展開調查',
           '大型持倉方被傳出正在出貨',
           'Empire 協議出現漏洞，官方緊急修補',
           '市場情緒轉差，拋壓明顯上升',
           '礦工收益下滑，算力撤出市場',
           '競爭公鏈吸走大量生態資金',
           '高槓桿多頭遭清算，帶動急跌']
    },
    forecast:{
      good:['機構大單預計 {N} 天後進場','協議升級 {N} 天後上線','重大合作 {N} 天後公布','KOL 喊單活動定於 {N} 天後'],
      bad:['解鎖壓力 {N} 天後到來','監管聽證 {N} 天後舉行','競品發布計劃於 {N} 天後','大規模清算預警 {N} 天後']
    }
  },
  tokyo: {
    id:'tokyo', name:'東京 ETF', sub:'日本股市指數', color:'#ff6b6b',
    lat:35.7, lng:139.7, sigma:0.004, drift:0.00005, base:3200,
    blackSwan:0.003, meanRev:0.2,
    news:{
      good:['日本央行維持寬鬆，日股受提振',
            '出口數據優於預期，製造業信心回升',
            '日圓適度走弱，帶動出口類股',
            '半導體供應鏈回穩，科技股受益',
            '外資連續買超日股',
            '日本企業財報全面超越預期'],
      bad:['日圓急升壓縮出口企業獲利',
           '日本 GDP 數據低於市場預期',
           '中日貿易摩擦升溫',
           '日股技術面出現高點反轉信號',
           '機構法人大規模調節日股',
           '通縮疑慮再現，市場信心受損']
    },
    forecast:{
      good:['日銀政策會議 {N} 天後召開，預期利多','出口數據 {N} 天後公布，機構樂觀','外資 {N} 天後大量匯入日股','科技財報 {N} 天後出爐'],
      bad:['日銀 {N} 天後升息，注意衝擊','貿易數據 {N} 天後恐低於預期','機構 {N} 天後降評日股','獲利回吐 {N} 天後釋放']
    }
  },
  brazil: {
    id:'brazil', name:'聖保羅 BRZ', sub:'巴西高波動市場', color:'#51cf66',
    lat:-23.5, lng:-46.6, sigma:0.015, drift:0.0002, base:50,
    blackSwan:0.015, meanRev:0,
    news:{
      good:['巴西原物料出口量創新高','央行意外降息，刺激資金進場',
            '農業豐收預期提振 BRZ','外資大舉流入新興市場',
            '石油巨頭業績爆表，帶動大盤飆升',
            '巴西幣穩定，外資信心增強'],
      bad:['政治不穩定性上升，投資人恐慌',
           '巴西雷亞爾急貶，外資撤離',
           '通膨超預期，央行鷹派發言衝擊市場',
           '財政赤字數據遠超預期',
           '大宗商品暴跌拖累指數',
           '政府政策急轉彎引發拋售潮']
    },
    forecast:{
      good:['大宗商品數據 {N} 天後公布','央行轉向信號 {N} 天後釋出','巴西豐收報告 {N} 天後出爐','外資投入 {N} 天後到位'],
      bad:['政治事件 {N} 天後發酵','通膨數據 {N} 天後偏高','財政報告 {N} 天後赤字超標','雷亞爾壓力 {N} 天後達頂']
    }
  },
  riyadh: {
    id:'riyadh', name:'利雅德 OIL', sub:'中東石油能源市場', color:'#ffd43b',
    lat:24.7, lng:46.7, sigma:0.006, drift:0.0001, base:180,
    blackSwan:0.020, meanRev:0.1,
    news:{
      good:['OPEC 宣布意外減產，油價急拉',
            '沙烏地 GDP 強勁超越預期',
            '利雅德 ETF 獲主權基金大量配置',
            '油田新發現消息帶動資源類股大漲',
            'Vision 2030 項目加速推進',
            '中國石油需求超預期，帶動原油上漲'],
      bad:['油價因需求疲弱急跌',
           '地緣政治緊張衝擊中東市場',
           'OPEC 成員國增產協議破局',
           '美元走強壓縮石油美元收益',
           '全球能源轉型加速，石油前景蒙陰',
           '重要產油設施遭破壞，供應中斷']
    },
    forecast:{
      good:['OPEC 會議 {N} 天後召開，預期減產','油田探勘結果 {N} 天後公布','主權基金 {N} 天後投入','能源峰會 {N} 天後帶動信心'],
      bad:['美聯儲決策 {N} 天後打壓油價','OPEC 增產談判 {N} 天後破裂','中東緊張 {N} 天後升級','替代能源政策 {N} 天後生效']
    }
  },
  seoul: {
    id:'seoul', name:'首爾 K-TECH', sub:'韓國科技成長股', color:'#cc5de8',
    lat:37.6, lng:126.9, sigma:0.010, drift:0.0003, base:75,
    blackSwan:0.012, meanRev:0,
    news:{
      good:['韓國半導體出口大幅成長，科技股帶頭上衝',
            '三星、SK 海力士業績雙雙爆表',
            '韓流文化產業帶動科技股飆漲',
            'K-TECH 指數獲外資瘋狂追捧',
            '韓國政府宣布大規模科技補貼',
            '全球 AI 需求旺盛，帶動韓國晶片股'],
      bad:['韓元急貶，外資撤出',
           '北韓局勢緊張，避險情緒升溫',
           '中韓貿易摩擦衝擊電子出口',
           '科技股估值過高，主力開始調節',
           '韓國 GDP 數據不如預期',
           '晶片市場供應過剩，庫存創新高']
    },
    forecast:{
      good:['科技財報 {N} 天後公布，預期爆表','科技補貼計劃 {N} 天後宣布','晶片旺季 {N} 天後到來','外資 {N} 天後大買超'],
      bad:['地緣政治 {N} 天後激化','科技股解鎖期 {N} 天後到來','主力調節 {N} 天後啟動','半導體庫存數據 {N} 天後出爐']
    }
  }
};

/* ============================================================
   DATA CODE (XOR + Base64 加密存檔)
   ============================================================ */
const CKEY = [83,121,197,43,167,11,251,89,137,53,223,71,179,37,241,101,
              61,233,17,149,97,211,7,163,131,47,199,73,229,113,31,191];

function encodeGameState(st) {
  const d = {
    v:2, n:nickname.slice(0,20),
    c:Math.round(st.cash), s:st.shares,
    a:Math.round((st.avgCost||0)*100),
    r:Math.round(st.realizedPnl),
    m:selectedMkt, t:Date.now()
  };
  const bytes = new TextEncoder().encode(JSON.stringify(d));
  let binary = '';
  bytes.forEach((b,i) => binary += String.fromCharCode(b ^ CKEY[i % CKEY.length]));
  const b64 = btoa(binary).replace(/\+/g,'8').replace(/\//g,'9').replace(/=/g,'0');
  return 'EPC-' + (b64.match(/.{1,8}/g)||[]).join('-');
}

function decodeGameState(code) {
  try {
    if (!code.startsWith('EPC-')) return null;
    const b64 = code.slice(4).replace(/-/g,'').replace(/8/g,'+').replace(/9/g,'/').replace(/0/g,'=');
    const raw = atob(b64);
    const bytes = Uint8Array.from(raw.split('').map(c => c.charCodeAt(0)));
    const plain = new TextDecoder().decode(bytes.map((b,i) => b ^ CKEY[i % CKEY.length]));
    return JSON.parse(plain);
  } catch(e) { return null; }
}

/* ============================================================
   CONSTANTS
   ============================================================ */
const TICK_MS          = 200;
const PULSE_PER_TICK   = 0.2;
const VISIBLE_CANDLES_BASE = 25;
const WIN_TARGET       = 50000;
const PANEL_UPDATE_MS  = 2500;

/* ============================================================
   STATE
   ============================================================ */
let state = {
  tick: 0, prices: [], pendingOrders: [], orderHistory: [],
  cash: 10000, shares: 0, avgCost: 0, realizedPnl: 0,
  candlePeriod: 5, viewOffset: 0, pinned: true,
  ma1: 5, ma2: 20, ma1On: true, ma2On: true,
  tradingMode: 'market', qtyMode: 100, yZoom: 1,
  forecastEvents: [], logExpanded: false,
  logTab: 'all', showVol: false,
  // market
  sigma: 0.008, drift: 0.0001, basePrice: 100,
  blackSwanProb: 0.008, meanReversion: 0,
  newsGood:[], newsBad:[], forecastGood:[], forecastBad:[],
};

function applyMarket(mktId) {
  const m = MARKETS[mktId] || MARKETS.empire;
  selectedMkt = mktId;
  const bn=document.querySelector('.brandName'); if(bn) bn.textContent = m.name || 'EPC';
  state.sigma         = m.sigma;
  state.drift         = m.drift;
  state.basePrice     = m.base;
  state.blackSwanProb = m.blackSwan;
  state.meanReversion = m.meanRev || 0;
  state.newsGood      = m.news.good;
  state.newsBad       = m.news.bad;
  state.forecastGood  = m.forecast.good;
  state.forecastBad   = m.forecast.bad;
}

function resetGameState() {
  const m = MARKETS[selectedMkt] || MARKETS.empire;
  state = {
    tick:0, prices:[], pendingOrders:[], orderHistory:[],
    cash:10000, shares:0, avgCost:0, realizedPnl:0,
    candlePeriod:5, viewOffset:0, pinned:true,
    ma1:5, ma2:20, ma1On:true, ma2On:true,
    tradingMode:'market', qtyMode:100, yZoom:1,
    forecastEvents:[], logExpanded:false, logTab:'all', showVol:false,
    sigma:m.sigma, drift:m.drift, basePrice:m.base,
    blackSwanProb:m.blackSwan, meanReversion:m.meanRev||0,
    newsGood:m.news.good, newsBad:m.news.bad,
    forecastGood:m.forecast.good, forecastBad:m.forecast.bad,
  };
}

/* ============================================================
   HELPERS
   ============================================================ */
const $ = id => document.getElementById(id);
function fmt(n) {
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e4) return (n/1e3).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}
function pulseStr(p) { return 'DAY ' + String(p).padStart(4,'0'); }
function currentPulse() { return Math.floor(state.tick * PULSE_PER_TICK); }
function toast(msg) {
  const t = $('toast'); if (!t) return;
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._tid); t._tid = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ============================================================
   SEED-BASED PRNG (synchronized price across all clients)
   ============================================================ */
const GAME_EPOCH_MS  = 1748736000000; // 2025-06-01 00:00 UTC — fixed cross-device reference
const PULSE_MS       = 5000;           // 1 K-bar = 5 real seconds (25 ticks)
const TICKS_PER_BAR  = PULSE_MS / TICK_MS; // 25 ticks per K-bar
const HISTORY_BARS   = 60;             // show up to 60 K-bars of history = 1500 ticks
// Seed window: anyone opening within the same SEED_PERIOD_MS sees an identical chart.
// 1 h window → reliable cross-device sync; max fast-forward ≈ 17 250 steps (< 10 ms).
const SEED_PERIOD_MS = 3600 * 1000;

function mulberry32(seed) {
  let s = seed >>> 0;
  return function() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getMarketDaySeed(mktId) {
  // Seed on 1-hour periods from epoch — anyone opening within the same hour
  // gets an identical seed → identical price chart. Changes ≤ once per hour.
  const period = Math.floor(Math.max(0, Date.now() - GAME_EPOCH_MS) / SEED_PERIOD_MS);
  let h = (period * 0x9e3779b9) >>> 0;
  for (let i = 0; i < mktId.length; i++) {
    h = Math.imul(h ^ mktId.charCodeAt(i), 0x85ebca77);
    h = ((h << 13) | (h >>> 19)) >>> 0;
  }
  return h;
}

// Consume exactly 8 randoms per call → deterministic tick advancement
function seededGBMStep(rng, prev, m) {
  const u1=rng(),u2=rng(),u3=rng(),u4=rng();
  const z = (u1+u2+u3+u4-2)*0.7071;
  const bsR=rng(), bsD=rng(), bsM=rng();
  rng(); // padding
  let p = prev * Math.exp(
    (m.drift - 0.5*m.sigma*m.sigma)*TICK_MS/1000
    + m.sigma * z * Math.sqrt(TICK_MS/1000)
  );
  if (bsR < m.blackSwan/5) p *= 1+(bsD<0.5?1:-1)*(0.04+bsM*0.05);
  if (m.meanRev > 0) p += m.meanRev*(m.base-p)*0.001;
  return Math.max(p, m.base*0.001);
}

let priceRng = null;

// Closed-candle cache: once a candle's period ends it is frozen
let _closedCandles = {}; // period → sorted array of frozen OHLC
let _closedUpToGi  = {}; // period → last gi that has been frozen

function initSyncedPrices(mktId) {
  const m       = MARKETS[mktId];
  const elapsed = Math.max(0, Date.now() - GAME_EPOCH_MS);

  // Period-absolute tick: all devices at the same real-time moment get the same value.
  // This is the candle-alignment anchor — gi = floor(t / tpc) is identical everywhere.
  const periodStartMs = Math.floor(elapsed / SEED_PERIOD_MS) * SEED_PERIOD_MS;
  const absTick       = Math.floor((elapsed - periodStartMs) / TICK_MS); // 0…17 999

  const histLen   = HISTORY_BARS * TICKS_PER_BAR; // 750 ticks
  const histStart = Math.max(0, absTick - histLen); // fast-forward target

  const seed = getMarketDaySeed(mktId);
  const rng  = mulberry32(seed);

  // Fast-forward to history window start (≤ 17 250 steps, < 10 ms)
  let price = m.base;
  for (let t = 0; t < histStart; t++) price = seededGBMStep(rng, price, m);

  // Store prices with PERIOD-ABSOLUTE t so candle boundaries (gi = floor(t/tpc))
  // are identical across all devices regardless of when they opened.
  state.prices = [];
  state._sessionStartTick = absTick; // for elapsed-time display
  for (let t = histStart; t <= absTick; t++) {
    price = seededGBMStep(rng, price, m);
    const prev = state.prices.length ? state.prices[state.prices.length-1].p : m.base;
    const chg  = Math.abs(price - prev) / (prev || 1);
    state.prices.push({ t, p: +price.toFixed(4),
                        v: Math.round(800 + chg*80000 + Math.random()*500) });
  }
  state.tick   = absTick; // period-absolute — incremented each tick()
  priceRng     = rng;
  _closedCandles = {};
  _closedUpToGi  = {};
}

function getSeedCurrentPrice(mktId) {
  const m       = MARKETS[mktId];
  const elapsed = Math.max(0, Date.now() - GAME_EPOCH_MS);
  const periodStartMs = Math.floor(elapsed / SEED_PERIOD_MS) * SEED_PERIOD_MS;
  const absTick = Math.floor((elapsed - periodStartMs) / TICK_MS);
  const seed = getMarketDaySeed(mktId);
  const rng  = mulberry32(seed);
  let price = m.base;
  for (let t = 0; t < absTick; t++) price = seededGBMStep(rng, price, m);
  return price;
}

/* ============================================================
   GBM ENGINE
   ============================================================ */
function gauss() {
  let u=0,v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

function nextPrice(suppressNews) {
  const last = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  let p;
  const m = { sigma:state.sigma, drift:state.drift, blackSwan:state.blackSwanProb,
               meanRev:state.meanReversion, base:state.basePrice };
  if (priceRng) {
    p = seededGBMStep(priceRng, last, m);
  } else {
    p = last;
    if (Math.random() < state.blackSwanProb/5) {
      p *= 1+(Math.random()<0.5?1:-1)*(0.04+Math.random()*0.05);
    }
    if (state.meanReversion>0) p+=state.meanReversion*(state.basePrice-p)*0.001;
    p *= Math.exp((state.drift-0.5*state.sigma*state.sigma)*TICK_MS/1000
                  +state.sigma*gauss()*Math.sqrt(TICK_MS/1000));
    p = Math.max(0.01, p);
  }
  p = +p.toFixed(4);
  const chgPct = Math.abs(p-last)/(last||1);
  const v = Math.round(800+chgPct*80000+Math.random()*500);
  state.prices.push({ t:state.tick, p, v });
  if (state.prices.length > 800) state.prices.shift();
  if (!suppressNews) maybeAnnounceForecast();
  return p;
}

function triggerForecastEvent(ev) {
  // News + sfx only — price impact comes from seeded GBM (black-swan events inside
  // seededGBMStep already create volatility spikes, so no extra boost needed).
  const pool = ev.dir==='good' ? state.newsGood : state.newsBad;
  const text = pool[Math.floor(Math.random()*pool.length)] || (ev.dir==='good' ? '市場利好消息發酵' : '市場利空消息衝擊');
  addLog(pulseStr(currentPulse()) + ' ' + text, 'news');
  playSfx('news');
}

function maybeAnnounceForecast() {
  if (Math.random() > 0.008) return;
  if (state.forecastEvents.length >= 5) return;
  const dir  = Math.random() < 0.5 ? 'good' : 'bad';
  const lead = 5 + Math.floor(Math.random()*14);
  const executePulse = currentPulse() + lead;
  const pool  = dir==='good' ? state.forecastGood : state.forecastBad;
  const tmpl  = pool[Math.floor(Math.random()*pool.length)] || '市場預告事件將在 {N} 天後發生';
  const msg   = tmpl.replace('{N}', lead);
  state.forecastEvents.push({ dir, executePulse, msg });
  addLog('預告 ' + msg, 'event');
}

/* ============================================================
   TICK
   ============================================================ */
function tick() {
  state.tick++;
  const p = nextPrice(false);

  // forecast execution
  const cp = currentPulse();
  state.forecastEvents = state.forecastEvents.filter(ev => {
    if (ev.executePulse <= cp) { triggerForecastEvent(ev); return false; }
    return true;
  });

  checkPendingOrders(p);
  maybeUpdatePanel();
  $('pulseLabel').textContent = pulseStr(cp);

  // Firebase sync every 50 ticks (~10s)
  if (state.tick % 50 === 0) syncToFirebase();

  drawChartArea();
  renderLog();
}

/* ============================================================
   CANDLES + MA
   ============================================================ */
function buildCandles(period) {
  const tpc = period / (TICK_MS/1000);
  const currentGi = Math.floor(state.tick / tpc);

  // Ensure per-period cache exists
  if (!_closedCandles[period]) { _closedCandles[period] = []; _closedUpToGi[period] = -1; }
  const closed = _closedCandles[period];
  const upTo   = _closedUpToGi[period];

  // Freeze any newly-completed candle groups (gi < currentGi and not yet frozen)
  if (currentGi > upTo + 1) {
    const fresh = new Map();
    for (const td of state.prices) {
      const gi = Math.floor(td.t / tpc);
      if (gi >= currentGi || gi <= upTo) continue;
      if (!fresh.has(gi)) fresh.set(gi, { o:td.p, h:td.p, l:td.p, c:td.p, v:td.v, startTick:td.t });
      const g = fresh.get(gi);
      g.h = Math.max(g.h, td.p); g.l = Math.min(g.l, td.p); g.c = td.p; g.v += td.v;
    }
    for (const gi of [...fresh.keys()].sort((a,b)=>a-b)) {
      const g = fresh.get(gi);
      closed.push({ ...g, startPulse: Math.floor(g.startTick * PULSE_PER_TICK) });
    }
    if (closed.length > 1200) closed.splice(0, closed.length - 1200);
    _closedUpToGi[period] = currentGi - 1;
  }

  // Build the live (current) candle fresh — only this one is allowed to update
  const liveMap = new Map();
  for (const td of state.prices) {
    const gi = Math.floor(td.t / tpc);
    if (gi !== currentGi) continue;
    if (!liveMap.has(gi)) liveMap.set(gi, { o:td.p, h:td.p, l:td.p, c:td.p, v:td.v, startTick:td.t });
    const g = liveMap.get(gi);
    g.h = Math.max(g.h, td.p); g.l = Math.min(g.l, td.p); g.c = td.p; g.v += td.v;
  }
  const liveArr = [...liveMap.values()].map(g => ({ ...g, startPulse: Math.floor(g.startTick * PULSE_PER_TICK) }));

  return [...closed, ...liveArr];
}

function maOnCandles(candles, period) {
  return candles.map((_,i,a) => {
    if (i < period-1) return null;
    return a.slice(i-period+1, i+1).reduce((s,k) => s+k.c, 0) / period;
  });
}

/* ============================================================
   PANEL UPDATE
   ============================================================ */
let _lastPanel = 0;
function flashEl(id) {
  const el = $(id); if (!el) return;
  el.classList.remove('val-updated'); void el.offsetWidth; el.classList.add('val-updated');
}

function maybeUpdatePanel(force) {
  const now = performance.now();
  if (!force && now - _lastPanel < PANEL_UPDATE_MS) return;
  _lastPanel = now;
  const cur    = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  const priceEl  = $('priceNow');
  const chgEl    = $('priceChange');

  if (priceEl) {
    const prev  = parseFloat(priceEl.dataset.prev || cur);
    const chg   = cur - prev;
    const chgPct = prev ? (chg/prev)*100 : 0;
    priceEl.dataset.prev = cur;
    priceEl.textContent  = cur.toFixed(2);
    priceEl.className = 'posValue' + (chg>0?' up':chg<0?' down':'');
    if (chgEl) {
      chgEl.textContent = `${chg>=0?'+':''}${chg.toFixed(2)} (${chg>=0?'+':''}${chgPct.toFixed(2)}%)`;
      chgEl.className   = 'posTick ' + (chg>0.001?'up':chg<-0.001?'down':'');
    }
  }

  const equity = state.cash + state.shares * cur;
  ['cashLabel','sharesLabel','avgCostLabel','equityLabel','realPnlLabel'].forEach(flashEl);
  if (!force) playSfx('panelTick');

  $('cashLabel').textContent   = fmt(state.cash);
  $('sharesLabel').textContent = state.shares.toLocaleString();
  $('avgCostLabel').textContent = state.shares > 0 ? state.avgCost.toFixed(2) : '--';
  const realEl = $('realPnlLabel');
  if (realEl) {
    realEl.textContent = (state.realizedPnl>=0?'+':'') + fmt(state.realizedPnl);
    realEl.className = 'posV ' + (state.realizedPnl>0.5?'up':state.realizedPnl<-0.5?'down':'');
  }
  $('equityLabel').textContent = fmt(equity);

  // unrealized PnL
  const labelEl = $('unrealPnlLabel');
  const amtEl   = $('unrealPnlAmount');
  const pctEl   = $('unrealPnlPct');
  if (state.shares > 0) {
    const cost   = state.avgCost * state.shares;
    const mkt    = cur * state.shares;
    const pnlAmt = mkt - cost;
    const pnlPct = (pnlAmt / Math.max(0.001, cost)) * 100;
    const sign   = pnlAmt >= 0 ? '+' : '';
    if (labelEl) labelEl.textContent = '未實現';
    if (amtEl) { amtEl.textContent = sign + fmt(pnlAmt); amtEl.className = 'posPnl '+(pnlAmt>0.01?'up':pnlAmt<-0.01?'down':'flat'); }
    if (pctEl) { pctEl.textContent = sign + pnlPct.toFixed(2)+'%'; pctEl.className = 'posTick '+(pnlPct>0.01?'up':pnlPct<-0.01?'down':''); }
  } else {
    if (labelEl) labelEl.textContent = '空倉';
    if (amtEl) { amtEl.textContent = '--'; amtEl.className = 'posPnl flat'; }
    if (pctEl) { pctEl.textContent = ''; pctEl.className = 'posTick'; }
  }

  // Goal bar removed (v0.9)
  if (state.showVol && state.prices.length)
    { const vl=$('volNowLabel'); if(vl) vl.textContent=state.prices[state.prices.length-1].v.toLocaleString(); }
  if (equity >= WIN_TARGET) showWin();
}

/* ============================================================
   CANVAS HELPERS
   ============================================================ */
function setCanvas(c) {
  const dpr = window.devicePixelRatio || 1;
  const rect = c.getBoundingClientRect();
  const W = rect.width || c.offsetWidth || 300;
  const H = rect.height || c.offsetHeight || 200;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, W, H };
}

/* ============================================================
   CHART DRAWING
   ============================================================ */
function drawChartArea() {
  drawCandleChart();
}

let _lastDrawW = 0, _lastDrawH = 0;

function drawCandleChart() {
  const c = $('priceChart'); if (!c) return;
  const { ctx, W, H } = setCanvas(c);
  if (!state.prices.length) return;

  const all      = buildCandles(state.candlePeriod);
  const N        = VISIBLE_CANDLES_BASE;
  const totalC   = all.length;
  const endIdx   = state.pinned ? totalC : Math.max(N, totalC - Math.round(state.viewOffset));
  const startIdx = Math.max(0, endIdx - N);
  const candles  = all.slice(startIdx, endIdx);
  if (candles.length < 2) return;

  const ma1 = maOnCandles(all, state.ma1).slice(startIdx, endIdx);
  const ma2 = maOnCandles(all, state.ma2).slice(startIdx, endIdx);

  const vals = candles.flatMap(k=>[k.h,k.l]);
  let lo=Math.min(...vals), hi=Math.max(...vals);
  const pad = (hi-lo)*0.1 || 1; lo-=pad; hi+=pad;
  // Y-zoom: pinch around center
  { const center=(lo+hi)/2, half=(hi-lo)/2/(state.yZoom||1);
    lo=center-half; hi=center+half; }
  const yScale = v => H - ((v-lo)/(hi-lo))*H;

  // grid
  ctx.clearRect(0,0,W,H);
  const GRID_COLOR = 'rgba(255,255,255,0.04)';
  for (let i=0;i<=4;i++) {
    const y = H*i/4;
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y);
    ctx.strokeStyle=GRID_COLOR; ctx.lineWidth=1; ctx.stroke();
  }

  // cost line
  if (state.shares>0 && state.avgCost>0) {
    const cy = yScale(state.avgCost);
    ctx.beginPath(); ctx.moveTo(0,cy); ctx.lineTo(W,cy);
    ctx.strokeStyle='rgba(240,185,11,0.6)'; ctx.lineWidth=1;
    ctx.setLineDash([4,4]); ctx.stroke(); ctx.setLineDash([]);
  }

  // pending limit lines
  state.pendingOrders.forEach(o => {
    const ly = yScale(o.limitPrice);
    ctx.beginPath(); ctx.moveTo(0,ly); ctx.lineTo(W,ly);
    ctx.strokeStyle = o.side==='buy' ? 'rgba(38,166,154,0.5)':'rgba(239,83,80,0.5)';
    ctx.lineWidth=1; ctx.setLineDash([3,5]); ctx.stroke(); ctx.setLineDash([]);
  });

  // candles
  const cw = W / candles.length;
  const bw = Math.max(1, cw * 0.55);
  candles.forEach((k,i) => {
    const up = k.c >= k.o;
    const col = up ? '#26a69a' : '#ef5350';
    const x   = i * cw + cw/2;
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yScale(k.h)); ctx.lineTo(x, yScale(k.l)); ctx.stroke();
    const oy = yScale(Math.max(k.o,k.c)), cy2 = Math.abs(yScale(k.o)-yScale(k.c)) || 1;
    ctx.fillStyle = col;
    ctx.fillRect(x - bw/2, oy, bw, cy2);
  });

  // MA lines
  function drawMa(arr, color) {
    if (!state.ma1On && color==='#f0b90b') return;
    if (!state.ma2On && color==='#2962ff') return;
    ctx.beginPath(); let started=false;
    arr.forEach((v,i) => {
      if (v==null) return;
      const x = i*cw + cw/2, y = yScale(v);
      started ? ctx.lineTo(x,y) : (ctx.moveTo(x,y), started=true);
    });
    ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.stroke();
  }
  if (state.ma1On) drawMa(ma1, '#f0b90b');
  if (state.ma2On) drawMa(ma2, '#2962ff');

  // Y-axis labels
  ctx.fillStyle='#9faab8'; ctx.font='10px JetBrains Mono'; ctx.textAlign='right';
  for (let i=0;i<=4;i++) {
    const v = lo + (hi-lo)*i/4;
    ctx.fillText(v.toFixed(2), W-4, H - H*i/4 - 4);
  }

  // live price tag
  const last   = state.prices[state.prices.length-1].p;
  const tagY   = yScale(last);
  const tagW   = 54, tagH = 16;
  const tagUp  = last >= (candles[candles.length-2]?.c || last);
  ctx.fillStyle = tagUp ? '#26a69a' : '#ef5350';
  ctx.beginPath();
  ctx.roundRect(W - tagW, tagY - tagH/2, tagW, tagH, 3);
  ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 10px JetBrains Mono'; ctx.textAlign='center';
  ctx.fillText(last.toFixed(2), W - tagW/2, tagY + 4);

  // Time axis
  renderTimeAxis(candles, cw);
}

function renderTimeAxis(candles, cw) {
  const ax = $('timeAxis'); if (!ax) return;
  ax.innerHTML='';
  const step = Math.max(1, Math.floor(candles.length / 5));
  candles.forEach((k,i) => {
    if (i % step !== 0 && i !== candles.length-1) return;
    const sp = document.createElement('span');
    sp.textContent = 'D'+String(k.startPulse).padStart(4,'0');
    sp.style.left  = (i * cw + cw/2) + 'px';
    ax.appendChild(sp);
  });
}

/* ============================================================
   TRADE
   ============================================================ */
function currentPrice() { return state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice; }
function getQty() {
  const p = state.tradingMode==='limit' ? (parseFloat($('limitPriceInput')?.value)||currentPrice()) : currentPrice();
  if (state.qtyMode==='max') return Math.floor(state.cash/p);
  const raw = parseInt($('qtyInput')?.value,10);
  if (isNaN(raw)) return typeof state.qtyMode==='number' ? state.qtyMode : 1;
  return Math.max(1, raw);
}

function executeMarketBuy(qty, p) {
  const cost = qty * p;
  state.avgCost = (state.avgCost * state.shares + cost) / (state.shares + qty);
  state.shares += qty; state.cash -= cost;
  const msg = `${pulseStr(currentPulse())} 買 ${qty} @${p.toFixed(2)} = ${fmt(cost)}`;
  addLog(msg, 'buy');
  state.orderHistory.unshift({ side:'buy', type:'market', qty, price:p, placedPulse:currentPulse() });
  updateOrdersUI(); renderLog(); maybeUpdatePanel(true);
}

function executeMarketSell(qty, p) {
  const revenue = qty * p;
  const pnl     = (p - state.avgCost) * qty;
  state.realizedPnl += pnl;
  if (qty >= state.shares) { state.shares=0; state.avgCost=0; }
  else state.shares -= qty;
  state.cash += revenue;
  const msg = `${pulseStr(currentPulse())} 賣 ${qty} @${p.toFixed(2)} PnL:${pnl>=0?'+':''}${fmt(pnl)}`;
  addLog(msg, 'sell');
  state.orderHistory.unshift({ side:'sell', type:'market', qty, price:p, placedPulse:currentPulse() });
  updateOrdersUI(); renderLog(); maybeUpdatePanel(true);
}

function placeLimitOrder(side) {
  const qty  = getQty(); if (qty<=0){toast('數量無效');playSfx('reject');return;}
  const raw  = parseFloat($('limitPriceInput')?.value);
  if (isNaN(raw)||raw<=0){toast('目標價無效');playSfx('reject');return;}
  const lp   = +raw.toFixed(2);
  if (side==='buy'&&lp*qty>state.cash){toast('現金不足');playSfx('reject');return;}
  state.pendingOrders.push({ side, qty, limitPrice:lp, placedPulse:currentPulse() });
  addLog(`${pulseStr(currentPulse())} 委託${side==='buy'?'買':'賣'} ${qty}@${lp}`, 'trade');
  toast(`委託成功：${side==='buy'?'買':'賣'} ${qty} 股 @ ${lp}`);
  markOrderDirty(); playSfx('orderPlace'); updateOrdersUI(); renderLog();
}

function checkPendingOrders(p) {
  state.pendingOrders = state.pendingOrders.filter(o => {
    if (o.side==='buy'&&p<=o.limitPrice) {
      if (o.qty*o.limitPrice>state.cash) {
        toast('委託取消：現金不足');
        addLog(`${pulseStr(currentPulse())} 限買取消 ${o.qty}@${o.limitPrice} [現金不足]`, 'order-cancel');
        return false;
      }
      addLog(`${pulseStr(currentPulse())} 委買成交 ${o.qty}@${p.toFixed(2)}`, 'fill');
      toast(`委託成交：買 ${o.qty} 股 @ ${p.toFixed(2)}`);
      markOrderDirty(); executeMarketBuy(o.qty, o.limitPrice); playSfx('limitFill');
      state.orderHistory.unshift({...o,type:'limit',filledAt:p,filledPulse:currentPulse()});
      return false;
    }
    if (o.side==='sell'&&p>=o.limitPrice) {
      if (o.qty>state.shares) {
        toast('委託取消：持倉不足');
        addLog(`${pulseStr(currentPulse())} 限賣取消 ${o.qty}@${o.limitPrice} [持倉不足]`, 'order-cancel');
        return false;
      }
      addLog(`${pulseStr(currentPulse())} 委賣成交 ${o.qty}@${p.toFixed(2)}`, 'fill');
      toast(`委託成交：賣 ${o.qty} 股 @ ${p.toFixed(2)}`);
      markOrderDirty(); executeMarketSell(o.qty, o.limitPrice); playSfx('limitFill');
      state.orderHistory.unshift({...o,type:'limit',filledAt:p,filledPulse:currentPulse()});
      return false;
    }
    return true;
  });
}

function buy() {
  if (state.tradingMode==='limit') return placeLimitOrder('buy');
  const p=currentPrice(); let qty=getQty();
  if (p*qty>state.cash){qty=Math.floor(state.cash/p);if(qty<=0){toast('現金不足');playSfx('reject');return;}}
  executeMarketBuy(qty,p); playSfx('marketBuy');
}
function sell() {
  if (state.tradingMode==='limit') return placeLimitOrder('sell');
  if (state.shares<=0){toast('沒有持倉');playSfx('reject');return;}
  const p=currentPrice(); const qty=state.qtyMode==='max'?state.shares:Math.min(state.shares,getQty());
  if (qty<=0) return;
  executeMarketSell(qty,p); playSfx('marketSell');
}

/* ============================================================
   LOG
   ============================================================ */
const LOG_ALL=[], LOG_TRADE=[], LOG_NEWS=[];
const LOG_UNREAD={all:0,trade:0,news:0,order:0};
function addLog(text, type) {
  const entry = { text, type };
  LOG_ALL.unshift(entry);
  if (type==='buy'||type==='sell'||type==='trade'||type==='fill') LOG_TRADE.unshift(entry);
  if (type==='news'||type==='event') LOG_NEWS.unshift(entry);
  if (LOG_ALL.length>200)    LOG_ALL.pop();
  if (LOG_TRADE.length>100)  LOG_TRADE.pop();
  if (LOG_NEWS.length>100)   LOG_NEWS.pop();
  // Unread tracking for inactive tabs
  const at = state.logTab;
  if (at!=='all')   LOG_UNREAD.all++;
  if (at!=='trade' && (type==='buy'||type==='sell'||type==='trade'||type==='fill')) LOG_UNREAD.trade++;
  if (at!=='news'  && (type==='news'||type==='event')) LOG_UNREAD.news++;
  renderLogDots();
}
function renderLogDots() {
  ['all','trade','news','order'].forEach(tab => {
    const btn = document.querySelector('.tabBtn[data-logtab="'+tab+'"]');
    if (!btn) return;
    let dot = btn.querySelector('.logDot');
    if (LOG_UNREAD[tab] > 0) {
      if (!dot) { dot = document.createElement('span'); dot.className='logDot'; btn.appendChild(dot); }
    } else {
      if (dot) dot.remove();
    }
  });
}
function markOrderDirty() {
  if (state.logTab !== 'order') { LOG_UNREAD.order++; renderLogDots(); }
}
function renderLog() {
  const tab = state.logTab;

  // ── 委託 tab: live interactive pending orders ──────────────────────────────
  if (tab === 'order') {
    const el = $('logOrder'); if (!el) return;
    if (!state.pendingOrders.length) {
      el.innerHTML = '<div class="commitEmpty">目前無委託單</div>';
      return;
    }
    el.innerHTML = state.pendingOrders.map((o, idx) =>
      `<div class="commitRow">
        <span class="lpSide ${o.side}">${o.side==='buy'?'限買':'限賣'}</span>
        <span class="commitQty">${o.qty} 股</span>
        <span class="commitAt">@ ${o.limitPrice}</span>
        <span class="commitPulse">${pulseStr(o.placedPulse)}</span>
        <button class="commitCancel" data-idx="${idx}">取消</button>
      </div>`
    ).join('');
    el.querySelectorAll('.commitCancel').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt(e.currentTarget.dataset.idx);
        if (!isNaN(idx) && idx >= 0 && idx < state.pendingOrders.length) {
          const o = state.pendingOrders[idx];
          addLog(`${pulseStr(currentPulse())} 取消委託 ${o.side==='buy'?'委買':'委賣'} ${o.qty}@${o.limitPrice}`, 'order-cancel');
          toast(`委託取消：${o.side==='buy'?'買':'賣'} ${o.qty} 股 @ ${o.limitPrice}`);
          state.pendingOrders.splice(idx, 1);
          renderLog(); updateOrdersUI();
        }
      });
    });
    return;
  }

  // ── Other tabs: scrolling log ──────────────────────────────────────────────
  const list = tab==='trade' ? LOG_TRADE : tab==='news' ? LOG_NEWS : LOG_ALL;
  const el = $('log'+tab.charAt(0).toUpperCase()+tab.slice(1)) || $('logAll');
  if (!el) return;
  el.innerHTML = list.slice(0,80).map(e =>
    `<div class="log-entry ${e.type}"><span class="lt">${e.text}</span></div>`
  ).join('');
}

/* ============================================================
   ORDERS UI
   ============================================================ */
function updateOrdersUI() {
  const pl = $('pendingList');
  if (pl) pl.innerHTML = state.pendingOrders.length
    ? state.pendingOrders.map(o =>
        `<div class="orderRow"><span class="oSide ${o.side}">${o.side==='buy'?'限買':'限賣'}</span>
         <span>${o.qty}</span><span>@${o.limitPrice}</span><span class="oMeta">D${o.placedPulse}</span></div>`
      ).join('') : '<div class="orderEmpty">尚無掛單</div>';
  const hl = $('historyList');
  if (hl) hl.innerHTML = state.orderHistory.slice(0,30).length
    ? state.orderHistory.slice(0,30).map(o =>
        `<div class="orderRow"><span class="oSide ${o.side}">${o.type==='limit'?'限':'市'}${o.side==='buy'?'買':'賣'}</span>
         <span>${o.qty}</span><span>@${o.filledAt||o.price}</span><span class="oMeta">D${o.placedPulse}</span></div>`
      ).join('') : '<div class="orderEmpty">尚無歷史</div>';
}

/* Calendar removed (v0.9 cleanup) */

/* ============================================================
   AUDIO
   ============================================================ */
let audioCtx = null;
function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if (audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq,vol,start,dur) {
  try {
    const ctx=getCtx(), o=ctx.createOscillator(), g=ctx.createGain();
    o.frequency.setValueAtTime(freq,start);
    g.gain.setValueAtTime(vol,start); g.gain.exponentialRampToValueAtTime(0.0001,start+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(start); o.stop(start+dur);
  } catch(e){}
}
function playSfx(kind) {
  try {
    const ctx=getCtx(), now=ctx.currentTime;
    if (kind==='marketBuy')   { beep(660,0.08,now,0.05); beep(880,0.05,now+0.05,0.07); }
    else if (kind==='marketSell') { beep(440,0.08,now,0.05); beep(330,0.05,now+0.05,0.07); }
    else if (kind==='orderPlace') { beep(550,0.04,now,0.04); }
    else if (kind==='limitFill')  { beep(760,0.06,now,0.04); beep(960,0.04,now+0.04,0.06); }
    else if (kind==='news')       { beep(400,0.04,now,0.06); beep(500,0.03,now+0.06,0.06); }
    else if (kind==='click')      { beep(800,0.02,now,0.03); }
    else if (kind==='reject')     { beep(180,0.06,now,0.08); }
    else if (kind==='panelTick')  { beep(1600,0.015,now,0.006); }
    else if (kind==='pageFlip') {
      const sr=ctx.sampleRate, bl=Math.ceil(sr*0.16);
      const buf=ctx.createBuffer(1,bl,sr); const d=buf.getChannelData(0);
      for(let i=0;i<bl;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/bl,1.3);
      const src=ctx.createBufferSource(); src.buffer=buf;
      const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=3800; bp.Q.value=0.35;
      const g2=ctx.createGain(); g2.gain.setValueAtTime(0.09,now);
      src.connect(bp); bp.connect(g2); g2.connect(ctx.destination); src.start(now);
    }
  } catch(e){}
}

let bgm=null, bgmStarted=false;
function startBGM() {
  if (bgmStarted) return; bgmStarted=true;
  try {
    bgm=new Audio('./assets/audio/bgm.mp3');
    bgm.loop=true; bgm.volume=0.22; bgm.play().catch(()=>{});
  } catch(e){}
}
function toggleMute() {
  if (bgm) bgm.muted=!bgm.muted;
  const mb=$('muteBtn'); if(mb) mb.style.opacity=bgm&&bgm.muted?'0.35':'1';
}

/* ============================================================
   WIN
   ============================================================ */
function showWin() {
  const ws=$('winScreen'); if(!ws||!ws.classList.contains('hidden')) return;
  ws.classList.remove('hidden');
  const sessionTicks = state.tick - (state._sessionStartTick||0);
  const mins=(sessionTicks*TICK_MS/1000/60).toFixed(1);
  const wt=$('winTime'); if(wt) wt.textContent=mins+'分鐘';
  const wtr=$('winTrades'); if(wtr) wtr.textContent=state.orderHistory.length+'筆';
}

/* ============================================================
   OVERLAYS
   ============================================================ */
function openOverlay(id) {
  document.querySelectorAll('.overlay').forEach(o=>o.classList.add('hidden'));
  const el=$(id); if(el) el.classList.remove('hidden');
}
function closeOverlay(id) { const el=$(id); if(el) el.classList.add('hidden'); }

/* ============================================================
   FIREBASE SYNC + LEADERBOARD
   ============================================================ */
function syncToFirebase() {
  if (!db || !playerId) return;
  const cur = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  const equity = state.cash + state.shares * cur;

  // Broadcast check
  if (lastSyncEq > 0) {
    const gain   = equity - lastSyncEq;
    const gainPct = (gain / lastSyncEq) * 100;
    if (gain > 500 || gainPct > 10) {
      const msg = `${nickname} 爆賺 +${fmt(gain)} (+${gainPct.toFixed(1)}%)！`;
      db.ref('empire/broadcasts').push({
        msg, ts: Date.now(), type:'surge'
      }).catch(()=>{});
    }
  }
  lastSyncEq = equity;

  db.ref('empire/players/' + playerId).set({
    nickname: nickname || '匿名',
    equity: Math.round(equity),
    cash: Math.round(state.cash),
    shares: state.shares,
    market: selectedMkt,
    lastSeen: Date.now(),
  }).catch(()=>{});
}

function setupLeaderboard() {
  if (!db) return;

  // Auto-remove this player from Firebase when they disconnect
  db.ref('empire/players/' + playerId).onDisconnect().remove();

  let _lbSnap = {};
  function applyFilter() {
    const now = Date.now();
    const players = Object.entries(_lbSnap)
      .map(([id,p])=>({id,...p}))
      .filter(p => now - p.lastSeen < 90*1000) // active in last 90s
      .sort((a,b)=>b.equity-a.equity)
      .slice(0,10);
    renderLeaderboard(players);
  }

  db.ref('empire/players').on('value', snap => {
    _lbSnap = snap.val() || {};
    applyFilter();
  });

  // Re-apply filter every 30s so stale players disappear even without Firebase change
  setInterval(applyFilter, 30*1000);

  db.ref('empire/broadcasts').limitToLast(1).on('child_added', snap => {
    const d = snap.val();
    if (d && Date.now()-d.ts < 8000) showBroadcast(d.msg);
  });
}

function renderLeaderboard(players) {
  const el = $('leaderboardList'); if (!el) return;
  if (!players.length) { el.innerHTML='<div class="lbEmpty">尚無在線玩家</div>'; return; }
  el.innerHTML = players.map((p,i) => {
    const isSelf = p.id === playerId;
    const mkt = MARKETS[p.market];
    const mktColor = mkt ? mkt.color : '#fff';
    return `<div class="lbRow${isSelf?' self':''}">
      <span class="lbRank">${i+1}</span>
      <span class="lbName">${p.nickname||'匿名'}</span>
      <span class="lbMkt" style="color:${mktColor};">${mkt?mkt.name:''}</span>
      <span class="lbEq">${fmt(p.equity)}</span>
    </div>`;
  }).join('');
}

let _bcTimeout = null;
function showBroadcast(msg) {
  const el = $('broadcastBanner'); if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden','bc-out');
  el.classList.add('bc-in');
  clearTimeout(_bcTimeout);
  _bcTimeout = setTimeout(() => {
    el.classList.remove('bc-in'); el.classList.add('bc-out');
    setTimeout(() => el.classList.add('hidden'), 600);
  }, 4000);
}

/* ============================================================
   CHART GESTURE
   ============================================================ */
function setupChartGesture() {
  const c = $('priceChart'); if (!c) return;
  let startX=0, startY=0, startOff=0, startYZoom=1, dragging=false, axis=null;
  const LOCK=10;

  function onStart(x, y) {
    startX=x; startY=y; startOff=state.viewOffset;
    startYZoom=state.yZoom||1; dragging=true; axis=null;
  }
  function onMove(x, y) {
    if (!dragging) return;
    const dx=x-startX, dy=y-startY;
    if (!axis) {
      if (Math.abs(dx)>LOCK||Math.abs(dy)>LOCK)
        axis = Math.abs(dx)>Math.abs(dy) ? 'x' : 'y';
      else return;
    }
    if (axis==='x') {
      const all=buildCandles(state.candlePeriod);
      const cw=c.getBoundingClientRect().width/VISIBLE_CANDLES_BASE;
      // swipe left (dx<0)=scroll toward history, swipe right=back to live
      state.viewOffset=Math.max(0,Math.min(all.length-VISIBLE_CANDLES_BASE, startOff+dx/cw));
      state.pinned=(state.viewOffset<=0);
      const rb=$('resetViewBtn');
      if (rb) rb.classList.toggle('hidden', state.pinned);
    } else {
      // swipe up (dy<0)=zoom in, swipe down=zoom out
      state.yZoom=Math.max(0.2,Math.min(8, startYZoom*Math.pow(1.012,-dy)));
    }
    drawCandleChart();
  }
  function onEnd() { dragging=false; axis=null; }

  c.addEventListener('mousedown', e=>{onStart(e.clientX,e.clientY);});
  window.addEventListener('mousemove',e=>{if(dragging)onMove(e.clientX,e.clientY);});
  window.addEventListener('mouseup', onEnd);
  c.addEventListener('touchstart',e=>{e.preventDefault();onStart(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  c.addEventListener('touchmove', e=>{e.preventDefault();onMove(e.touches[0].clientX,e.touches[0].clientY);},{passive:false});
  c.addEventListener('touchend', onEnd);

  const rb=$('resetViewBtn');
  if (rb) rb.addEventListener('click',()=>{
    state.viewOffset=0; state.pinned=true; state.yZoom=1;
    rb.classList.add('hidden'); drawCandleChart();
  });
}

/* ============================================================
   GLOBE (Canvas 2D orthographic projection)
   ============================================================ */
let globeRotX = 0.2, globeRotY = Math.PI / 2;
let globeAnimId = null;
let globeDrag  = false, globeLastX = 0, globeLastY = 0;
let globeSpinX = 0, globeSpinY = 0.003;
let selectedMktHover = null;

const MARKET_LIST = ['empire','tokyo','brazil','riyadh','seoul'];

function latLngToXYZ(lat, lng, r) {
  const phi   = (90 - lat) * Math.PI / 180;
  const theta = (lng + 180) * Math.PI / 180;
  return {
    x: -r * Math.sin(phi) * Math.cos(theta),
    y:  r * Math.cos(phi),
    z:  r * Math.sin(phi) * Math.sin(theta),
  };
}

function projectPoint(px, py, pz, cx, cy, r) {
  // rotate Y
  const cosY = Math.cos(globeRotY), sinY = Math.sin(globeRotY);
  const rx   = px * cosY - pz * sinY;
  const rz   = px * sinY + pz * cosY;
  // rotate X
  const cosX = Math.cos(globeRotX), sinX = Math.sin(globeRotX);
  const ry2  = py * cosX - rz * sinX;
  const rz2  = py * sinX + rz * cosX;
  return { sx: cx + rx, sy: cy - ry2, visible: rz2 > -r * 0.05 };
}

/* ============================================================
   CONTINENT POLYGONS (simplified lat/lng outlines)
   ============================================================ */
const CONTINENT_POLYS = [
  // North America
  [[72,-140],[72,-60],[55,-55],[47,-53],[45,-67],[40,-66],[35,-76],[30,-81],[25,-80],
   [25,-90],[18,-87],[22,-105],[28,-112],[32,-117],[38,-123],[50,-124],[60,-140]],
  // Central America
  [[25,-90],[20,-88],[14,-84],[8,-78],[10,-82],[14,-87]],
  // Greenland
  [[76,-70],[84,-35],[76,25],[65,-20],[60,-44]],
  // South America
  [[10,-74],[8,-62],[5,-51],[0,-50],[-5,-35],[-23,-43],[-33,-52],
   [-55,-68],[-45,-65],[-22,-41],[5,-51]],
  // Europe
  [[71,28],[60,5],[51,-6],[36,-6],[36,5],[37,15],[37,28],[45,30],[55,22],[60,28]],
  // Scandinavia
  [[70,28],[70,31],[65,15],[60,5],[57,8],[60,11],[70,20]],
  // British Isles
  [[58,-5],[60,-2],[58,0],[54,-3],[51,-5],[54,-6]],
  // Africa
  [[37,10],[37,37],[11,44],[0,42],[-10,40],[-35,27],[-35,18],[0,-17],[15,-17]],
  // Arabian Peninsula
  [[30,35],[29,49],[22,60],[12,44],[15,44]],
  // India
  [[28,68],[28,90],[8,78],[20,73]],
  // Asia (main)
  [[71,60],[71,140],[55,160],[45,140],[30,120],[20,120],[10,78],[35,58],[55,58]],
  // Indochina
  [[20,100],[20,108],[10,108],[5,103],[15,100]],
  // Japan
  [[45,142],[35,130],[33,132],[38,141]],
  // Australia
  [[-15,130],[-15,140],[-25,153],[-38,147],[-38,114],[-22,114]],
  // New Zealand
  [[-35,174],[-47,168],[-47,171]],
];

function drawContinents(ctx, cx, cy, r) {
  ctx.fillStyle = '#162a1e';
  ctx.strokeStyle = '#1c3525';
  ctx.lineWidth = 0.8;
  CONTINENT_POLYS.forEach(poly => {
    ctx.beginPath();
    let penDown = false;
    poly.forEach(([lat, lng]) => {
      const {x,y,z} = latLngToXYZ(lat, lng, r);
      const pt = projectPoint(x, y, z, cx, cy, r);
      if (!pt.visible) { penDown = false; return; }
      if (!penDown) { ctx.moveTo(pt.sx, pt.sy); penDown = true; }
      else ctx.lineTo(pt.sx, pt.sy);
    });
    if (penDown) { ctx.closePath(); ctx.fill(); ctx.stroke(); }
  });
}

function drawGlobe() {
  const c = $('globeCanvas'); if (!c) return;
  const dpr = window.devicePixelRatio || 1;
  const W = c.offsetWidth, H = c.offsetHeight;
  c.width = W*dpr; c.height = H*dpr;
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = W/2, cy = H/2;
  const r  = Math.min(W,H) * 0.38;

  // atmosphere
  const atm = ctx.createRadialGradient(cx,cy,r*0.85,cx,cy,r*1.2);
  atm.addColorStop(0,'rgba(41,98,255,0.18)');
  atm.addColorStop(1,'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(cx,cy,r*1.2,0,Math.PI*2);
  ctx.fillStyle=atm; ctx.fill();

  // globe base
  const bg = ctx.createRadialGradient(cx-r*0.3,cy-r*0.3,r*0.1,cx,cy,r);
  bg.addColorStop(0,'#1a2744');
  bg.addColorStop(0.6,'#0d1627');
  bg.addColorStop(1,'#060c1a');
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle=bg; ctx.fill();

  // continents
  drawContinents(ctx, cx, cy, r);

  // lat/lng grid lines
  ctx.strokeStyle='rgba(41,98,255,0.12)'; ctx.lineWidth=0.5;
  for (let lat=-60; lat<=60; lat+=30) {
    ctx.beginPath(); let first=true;
    for (let lng=-180; lng<=180; lng+=5) {
      const {x,y,z}   = latLngToXYZ(lat,lng,r);
      const pt = projectPoint(x,y,z,cx,cy,r);
      if (!pt.visible) { first=true; continue; }
      first ? ctx.moveTo(pt.sx,pt.sy) : ctx.lineTo(pt.sx,pt.sy);
      first=false;
    }
    ctx.stroke();
  }
  for (let lng=-180; lng<=180; lng+=30) {
    ctx.beginPath(); let first=true;
    for (let lat=-90; lat<=90; lat+=5) {
      const {x,y,z}   = latLngToXYZ(lat,lng,r);
      const pt = projectPoint(x,y,z,cx,cy,r);
      if (!pt.visible) { first=true; continue; }
      first ? ctx.moveTo(pt.sx,pt.sy) : ctx.lineTo(pt.sx,pt.sy);
      first=false;
    }
    ctx.stroke();
  }

  // sphere rim highlight
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
  const rim = ctx.createRadialGradient(cx-r*0.5,cy-r*0.5,r*0.3,cx,cy,r);
  rim.addColorStop(0,'rgba(255,255,255,0.06)');
  rim.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=rim; ctx.fill();
  ctx.strokeStyle='rgba(41,98,255,0.35)'; ctx.lineWidth=1.5; ctx.stroke();

  // market markers
  const hitAreas = [];
  MARKET_LIST.forEach(id => {
    const m   = MARKETS[id];
    const {x,y,z} = latLngToXYZ(m.lat, m.lng, r);
    const pt  = projectPoint(x,y,z,cx,cy,r);
    if (!pt.visible) return;

    const isHover = selectedMktHover === id;
    const dotR = isHover ? 8 : 5;

    // glow
    ctx.beginPath(); ctx.arc(pt.sx,pt.sy,dotR*3,0,Math.PI*2);
    ctx.fillStyle = m.color + '33'; ctx.fill();

    // dot
    ctx.beginPath(); ctx.arc(pt.sx,pt.sy,dotR,0,Math.PI*2);
    ctx.fillStyle = m.color; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();

    // label – offset if another dot is close
    ctx.fillStyle='#fff'; ctx.font=`bold ${isHover?12:10}px Inter,sans-serif`;
    ctx.textAlign='center';
    const others = hitAreas; // already-drawn dots
    let labelY = pt.sy - dotR - 4;
    for (const h of others) {
      if (Math.hypot(h.sx - pt.sx, h.sy - pt.sy) < 30) { labelY = pt.sy + dotR + 12; break; }
    }
    ctx.fillText(m.name, pt.sx, labelY);

    hitAreas.push({ id, sx:pt.sx, sy:pt.sy, r:dotR+8 });
  });

  c._hitAreas = hitAreas;
}

function animateGlobe() {
  if (!globeDrag) {
    globeRotY += globeSpinY;
    globeRotX += globeSpinX * 0.1;
    globeRotX = Math.max(-0.6, Math.min(0.6, globeRotX));
  }
  try { drawGlobe(); } catch(e) { console.error('drawGlobe err:', e); }
  globeAnimId = requestAnimationFrame(animateGlobe);
}

function setupGlobeEvents() {
  const c = $('globeCanvas'); if (!c) return;

  function getHit(x, y) {
    const rect = c.getBoundingClientRect();
    const ex = x - rect.left, ey = y - rect.top;
    return (c._hitAreas||[]).find(h => Math.hypot(h.sx-ex,h.sy-ey) < h.r);
  }

  c.addEventListener('mousedown', e=>{
    globeDrag=true; globeLastX=e.clientX; globeLastY=e.clientY;
    globeSpinX=0; globeSpinY=0;
  });
  window.addEventListener('mousemove', e=>{
    if (globeDrag) {
      globeRotY -= (e.clientX-globeLastX)*0.005;
      globeRotX += (e.clientY-globeLastY)*0.003;
      globeRotX = Math.max(-0.8,Math.min(0.8,globeRotX));
      globeLastX=e.clientX; globeLastY=e.clientY;
    } else {
      const h=getHit(e.clientX,e.clientY);
      selectedMktHover = h?h.id:null;
      c.style.cursor   = h?'pointer':'grab';
    }
  });
  window.addEventListener('mouseup', e=>{
    if (globeDrag) {
      globeDrag=false;
      const h=getHit(e.clientX,e.clientY);
      if (h) selectMarket(h.id);
    }
  });
  c.addEventListener('touchstart',e=>{
    e.preventDefault();
    globeDrag=true; globeSpinX=0; globeSpinY=0;
    globeLastX=e.touches[0].clientX; globeLastY=e.touches[0].clientY;
  },{passive:false});
  c.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(!globeDrag) return;
    globeRotY -= (e.touches[0].clientX-globeLastX)*0.005;
    globeRotX += (e.touches[0].clientY-globeLastY)*0.003;
    globeRotX = Math.max(-0.8,Math.min(0.8,globeRotX));
    globeLastX=e.touches[0].clientX; globeLastY=e.touches[0].clientY;
  },{passive:false});
  c.addEventListener('touchend',e=>{
    globeDrag=false;
    if(e.changedTouches.length) {
      const t=e.changedTouches[0];
      const h=getHit(t.clientX,t.clientY);
      if(h) selectMarket(h.id);
    }
  });
}

function selectMarket(id) {
  selectedMkt = id;
  const m = MARKETS[id];
  const info = $('globeMarketInfo');
  if (info) {
    info.innerHTML = `<span class="gmName" style="color:${m.color}">${m.name}</span>
      <span class="gmSub">${m.sub}</span>
      <span class="gmStats">波動 ${['低','低','高','中','中'][MARKET_LIST.indexOf(id)]} · 基礎價 ${m.base}</span>`;
    info.classList.remove('hidden');
  }
  const btn = $('globeEnterBtn');
  if (btn) { btn.classList.remove('hidden'); btn.style.borderColor = m.color; btn.style.boxShadow=`0 0 20px ${m.color}66`; }
}

/* ============================================================
   NICKNAME SCREEN
   ============================================================ */
function showNicknameScreen() {
  const gs=$('globeScreen'); if(gs) gs.classList.add('hidden');
  const ns=$('nicknameScreen'); if(ns) ns.classList.remove('hidden');
  cancelAnimationFrame(globeAnimId);
  // Pre-fill saved nickname so returning players don't retype, but always show screen
  const ni=$('nickInput'); if(ni && nickname) { ni.value=nickname; ni.select(); }
}

/* ============================================================
   MULTI-MARKET STATE (localStorage)
   ============================================================ */
function saveMarketState(mktId) {
  const cur = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  const all = JSON.parse(localStorage.getItem('empire_mkt_states')||'{}');
  all[mktId] = {
    cash: state.cash, shares: state.shares,
    avgCost: state.avgCost, realizedPnl: state.realizedPnl,
    lastPrice: cur, savedAt: Date.now()
  };
  localStorage.setItem('empire_mkt_states', JSON.stringify(all));
}
function loadMarketState(mktId) {
  const all = JSON.parse(localStorage.getItem('empire_mkt_states')||'{}');
  return all[mktId] || null;
}
function clearMarketState(mktId) {
  const all = JSON.parse(localStorage.getItem('empire_mkt_states')||'{}');
  delete all[mktId];
  localStorage.setItem('empire_mkt_states', JSON.stringify(all));
}

let _gameInitialized = false;

function startGame(loadedState) {
  const ns=$('nicknameScreen'); if(ns) ns.classList.add('hidden');
  const gs=$('globeScreen'); if(gs) gs.classList.add('hidden');
  const app=$('app'); if(app) app.classList.remove('hidden');

  ensurePlayerId();

  if (loadedState) {
    selectedMkt = loadedState.m || selectedMkt;
  }
  applyMarket(selectedMkt);
  initSyncedPrices(selectedMkt);   // seeded history

  if (loadedState) {
    nickname = loadedState.n || nickname;
    state.cash        = loadedState.c || 10000;
    state.shares      = loadedState.s || 0;
    state.avgCost     = (loadedState.a||0) / 100;
    state.realizedPnl = loadedState.r || 0;
  } else {
    const saved = loadMarketState(selectedMkt);
    if (saved) {
      state.cash = saved.cash; state.shares = saved.shares;
      state.avgCost = saved.avgCost; state.realizedPnl = saved.realizedPnl;
    } else {
      state.cash = 10000; state.shares = 0;
      state.avgCost = 0;  state.realizedPnl = 0;
    }
  }
  state.pendingOrders = []; state.orderHistory = [];
  state.forecastEvents= [];

  startBGM();
  if (!_gameInitialized) { initFirebase(); setupLeaderboard(); }
  startTick();
  if (!_gameInitialized) {
    _gameInitialized = true;
    setupChartGesture();
    setupIndicatorUI();
  }
  maybeUpdatePanel(true);
}

/* ============================================================
   RETURN TO GLOBE
   ============================================================ */
function returnToGlobe() {
  saveMarketState(selectedMkt);
  if (_tickInterval) { clearInterval(_tickInterval); _tickInterval = null; }
  priceRng = null;
  cancelAnimationFrame(globeAnimId);
  $('app').classList.add('hidden');
  $('globeScreen').classList.remove('hidden');
  selectMarket(selectedMkt);
  animateGlobe();
}

/* ============================================================
   PORTFOLIO OVERVIEW
   ============================================================ */
function updatePortfolioUI() {
  const list = $('portfolioList'); if(!list) return;
  const nickEl = $('portfolioNick'); if(nickEl) nickEl.textContent = nickname || '匿名';
  const all = JSON.parse(localStorage.getItem('empire_mkt_states')||'{}');
  // merge live state for current market
  const cur = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  all[selectedMkt] = {
    cash:state.cash, shares:state.shares, avgCost:state.avgCost,
    realizedPnl:state.realizedPnl, lastPrice:cur
  };
  let totalEq = 0, html = '';
  MARKET_LIST.forEach(id => {
    const m  = MARKETS[id];
    const ms = all[id];
    if (!ms) {
      html += `<div class="pfRow"><span class="pfMkt" style="color:${m.color}">${m.name}</span><span class="pfVal pfDim">尚未進入</span></div>`;
      return;
    }
    const price  = ms.lastPrice || m.base;
    const equity = ms.cash + ms.shares * price;
    totalEq += equity;
    const pnlPct = ((equity/10000-1)*100).toFixed(1);
    const cls = equity>10000?'up':equity<9999?'down':'';
    html += `<div class="pfRow">
      <div class="pfLeft">
        <span class="pfMkt" style="color:${m.color}">${m.name}</span>
        <span class="pfSub">${ms.shares>0?ms.shares+'股 @ '+ms.avgCost.toFixed(2):'空倉'}</span>
      </div>
      <div class="pfRight">
        <span class="pfVal ${cls}">${fmt(equity)}</span>
        <span class="pfPct ${cls}">${equity>=10000?'+':''}${pnlPct}%</span>
      </div>
    </div>`;
  });
  list.innerHTML = html;
  const tEl = $('portfolioTotal'); if(tEl) tEl.textContent = fmt(totalEq);
}

/* ============================================================
   DATA CODE UI
   ============================================================ */
function showDataCode() {
  const code = encodeGameState(state);
  const el = $('dataCodeOutput'); if(!el) return;
  el.value = code;
  el.select();
  navigator.clipboard.writeText(code).then(()=>toast('數據碼已複製！')).catch(()=>toast('請手動複製'));
  playSfx('click');
}

/* ============================================================
   WARMUP + TICK
   ============================================================ */
let _tickInterval = null;
let _lastAbsTick  = 0;

function warmup() {
  initSyncedPrices(selectedMkt);
}
function startTick() {
  if (_tickInterval) clearInterval(_tickInterval);
  _lastAbsTick = Math.floor(Math.max(0, Date.now() - GAME_EPOCH_MS) / TICK_MS);
  _tickInterval = setInterval(() => {
    const nowAbs = Math.floor(Math.max(0, Date.now() - GAME_EPOCH_MS) / TICK_MS);
    const missed = Math.min(nowAbs - _lastAbsTick, 5);
    for (let i = 0; i < missed; i++) tick();
    _lastAbsTick = nowAbs;
  }, TICK_MS);
}

/* ============================================================
   INDICATOR UI
   ============================================================ */
function setupIndicatorUI() {
  const mi=$('ma1Input'), m2i=$('ma2Input');
  const m1t=$('ma1Toggle'), m2t=$('ma2Toggle');
  if (mi)  { mi.value=state.ma1;  mi.addEventListener('input',()=>{state.ma1=Math.max(1,+mi.value)||5;}); }
  if (m2i) { m2i.value=state.ma2; m2i.addEventListener('input',()=>{state.ma2=Math.max(1,+m2i.value)||20;}); }
  if (m1t) { m1t.checked=state.ma1On; m1t.addEventListener('change',()=>{state.ma1On=m1t.checked; $('ma1Legend').classList.toggle('hidden',!state.ma1On);}); }
  if (m2t) { m2t.checked=state.ma2On; m2t.addEventListener('change',()=>{state.ma2On=m2t.checked; $('ma2Legend').classList.toggle('hidden',!state.ma2On);}); }
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  // Globe screen
  const globeScreen = $('globeScreen');
  if (globeScreen) {
    globeScreen.classList.remove('hidden');
    $('app').classList.add('hidden');
    $('nicknameScreen').classList.add('hidden');
    setupGlobeEvents();
    animateGlobe();
    selectMarket('empire');
  }

  // Globe enter button
  const geb = $('globeEnterBtn');
  if (geb) geb.addEventListener('click', showNicknameScreen);

  // Nickname screen
  const nickInput  = $('nickInput');
  const startBtn   = $('nickStartBtn');
  const codeInput  = null; // moved to globe screen
  const loadBtn    = null;

  if (startBtn) startBtn.addEventListener('click', () => {
    const val = (nickInput?.value||'').trim();
    if (!val) { toast('請輸入暱稱'); return; }
    nickname = val.slice(0,20);
    localStorage.setItem('empire_nick', nickname);
    startGame(null);
  });

  // Globe code load button
  const globeCodeLoadBtn = $('globeCodeLoadBtn');
  if (globeCodeLoadBtn) globeCodeLoadBtn.addEventListener('click', () => {
    const raw = ($('globeCodeInput')?.value||'').trim();
    const loaded = decodeGameState(raw);
    if (!loaded) { toast('數據碼無效'); return; }
    nickname = loaded.n || '玩家';
    localStorage.setItem('empire_nick', nickname);
    selectedMkt = loaded.m || 'empire';
    startGame(loaded);
  });

  // Nickname back button
  const nickBackBtn = $('nickBackBtn');
  if (nickBackBtn) nickBackBtn.addEventListener('click', () => {
    $('nicknameScreen').classList.add('hidden');
    $('globeScreen').classList.remove('hidden');
    animateGlobe();
  });

  // Top bar actions
  // Calendar removed
  // Orders overlay removed — orders shown in log
  // indicatorBtn removed from topbar — now in chart
  const chartIndBtn = $('chartIndBtn');
  if (chartIndBtn) chartIndBtn.addEventListener('click',()=>{ openOverlay('indicatorOverlay'); playSfx('click'); });

  const muteBtn = $('muteBtn');
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);
  const lbBtn = $('leaderboardBtn');
  if (lbBtn) lbBtn.addEventListener('click',()=>{ openOverlay('leaderboardOverlay'); playSfx('click'); });

  const codeBtn = $('codeBtn');
  if (codeBtn) codeBtn.addEventListener('click',()=>{ openOverlay('codeOverlay'); showDataCode(); playSfx('click'); });
  const backBtn = $('backGlobeBtn');
  if (backBtn) backBtn.addEventListener('click',()=>{ returnToGlobe(); playSfx('click'); });
  const pfBtn = $('portfolioBtn');
  if (pfBtn) pfBtn.addEventListener('click',()=>{ updatePortfolioUI(); openOverlay('portfolioOverlay'); playSfx('click'); });

  // Close overlays
  document.querySelectorAll('.overlayClose').forEach(b => {
    b.addEventListener('click',()=>closeOverlay(b.dataset.close));
  });
  document.querySelectorAll('.overlay').forEach(o => {
    o.addEventListener('click', e=>{ if(e.target===o) closeOverlay(o.id); });
  });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') document.querySelectorAll('.overlay').forEach(o=>o.classList.add('hidden')); });

  // Trade buttons
  const buyBtn  = $('buyBtn');
  const sellBtn = $('sellBtn');
  if (buyBtn)  buyBtn.addEventListener('click',  buy);
  if (sellBtn) sellBtn.addEventListener('click', sell);

  // Qty buttons
  document.querySelectorAll('.qtyBtn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.qtyBtn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const v = b.dataset.qty;
      state.qtyMode = v==='max' ? 'max' : parseInt(v);
      const qi=$('qtyInput'); if(qi) qi.value='';
    });
  });
  const qtyInput=$('qtyInput');
  if (qtyInput) qtyInput.addEventListener('input',()=>{
    document.querySelectorAll('.qtyBtn').forEach(x=>x.classList.remove('active'));
    state.qtyMode=parseInt(qtyInput.value)||100;
  });

  // Mode buttons
  document.querySelectorAll('.modeBtn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.modeBtn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      state.tradingMode=b.dataset.mode;
      const lr=$('limitPriceRow');
      if (lr) lr.classList.toggle('hidden', state.tradingMode!=='limit');
    });
  });

  // Tab buttons (overlay)
  document.querySelectorAll('.tabBtn[data-tab]').forEach(b => {
    b.addEventListener('click', () => {
      const panel = b.closest('.overlayPanel');
      panel?.querySelectorAll('.tabBtn[data-tab]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      const tab = b.dataset.tab;
      panel?.querySelectorAll('.tabPane').forEach(p=>p.classList.add('hidden'));
      panel?.querySelector('#'+tab+'Tab')?.classList.remove('hidden');
    });
  });

  // Calendar tabs
  document.querySelectorAll('.tabBtn[data-caltab]').forEach(b => {
    b.addEventListener('click', () => {
      const panel=b.closest('.overlayPanel');
      panel?.querySelectorAll('.tabBtn[data-caltab]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      panel?.querySelectorAll('.tabPane').forEach(p=>p.classList.add('hidden'));
      panel?.querySelector('#'+b.dataset.caltab+'Tab')?.classList.remove('hidden');
    });
  });

  // Log tabs
  document.querySelectorAll('.tabBtn[data-logtab]').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.tabBtn[data-logtab]').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      state.logTab=b.dataset.logtab;
      // Clear unread for this tab
      LOG_UNREAD[state.logTab]=0; renderLogDots();
      document.querySelectorAll('.logList').forEach(l=>l.classList.add('hidden'));
      const target=$('log'+state.logTab.charAt(0).toUpperCase()+state.logTab.slice(1));
      if(target) target.classList.remove('hidden');
      renderLog();
    });
  });

  // Log toggle
  const ltBtn=$('logToggleBtn');
  if (ltBtn) ltBtn.addEventListener('click',()=>{
    state.logExpanded=!state.logExpanded;
    $('logPanel').classList.toggle('expanded',state.logExpanded);
    $('logPanel').classList.toggle('collapsed',!state.logExpanded);
    playSfx('pageFlip');
  });

  // Restart
  const rb=$('restartBtn');
  if (rb) rb.addEventListener('click',()=>{
    clearInterval(_tickInterval); _tickInterval=null;
    clearMarketState(selectedMkt);
    state.cash=10000; state.shares=0; state.avgCost=0; state.realizedPnl=0;
    state.pendingOrders=[]; state.orderHistory=[]; state.forecastEvents=[];
    $('winScreen').classList.add('hidden');
    LOG_ALL.length=0; LOG_TRADE.length=0; LOG_NEWS.length=0;
    Object.keys(LOG_UNREAD).forEach(k=>LOG_UNREAD[k]=0); renderLogDots();
    initSyncedPrices(selectedMkt); startTick(); maybeUpdatePanel(true);
  });

  // Data code
  const dcBtn=$('dataCodeBtn');
  if (dcBtn) dcBtn.addEventListener('click', showDataCode);

  // Period buttons (inside indicator overlay)
  document.querySelectorAll('.periodBtn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.periodBtn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      state.candlePeriod=parseInt(b.dataset.period);
      playSfx('click');
    });
  });

  maybeUpdatePanel(true);
}

document.addEventListener('DOMContentLoaded', init);

})();
