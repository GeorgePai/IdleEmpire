
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
let playerId    = localStorage.getItem('empire_pid') || null;
let nickname    = localStorage.getItem('empire_nick') || '';
let lastSyncEq  = 0;
let selectedMkt = 'empire';

function ensurePlayerId() {
  if (!playerId) {
    playerId = 'p' + Math.random().toString(36).slice(2,9) + Date.now().toString(36);
    localStorage.setItem('empire_pid', playerId);
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
const VISIBLE_CANDLES_BASE = 50;
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
  tradingMode: 'market', qtyMode: 100,
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
    tradingMode:'market', qtyMode:100,
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
  let p = last;

  // black swan
  if (Math.random() < state.blackSwanProb / 5) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    p *= (1 + dir * (0.04 + Math.random()*0.05));
  }

  // mean reversion
  if (state.meanReversion > 0) {
    const mid = state.basePrice;
    p += state.meanReversion * (mid - p) * 0.001;
  }

  // GBM
  p *= Math.exp((state.drift - 0.5*state.sigma*state.sigma)*TICK_MS/1000
                + state.sigma * gauss() * Math.sqrt(TICK_MS/1000));

  p = Math.max(0.01, +p.toFixed(4));

  // volume
  const chgPct = Math.abs(p - last) / last;
  const v = Math.round(800 + chgPct * 80000 + Math.random() * 500);

  state.prices.push({ t: state.tick, p, v });
  if (state.prices.length > 600) state.prices.shift();

  if (!suppressNews) maybeAnnounceForecast();
  return p;
}

function triggerForecastEvent(ev) {
  const impact = ev.dir === 'good' ? (0.04 + Math.random()*0.04) : -(0.04 + Math.random()*0.04);
  const last   = state.prices.length ? state.prices[state.prices.length-1].p : state.basePrice;
  const bounces = 8;
  for (let i=0; i<bounces; i++) {
    const f = impact * (1 - i/(bounces+1)) + gauss()*state.sigma*0.5;
    const p2 = Math.max(0.01, +(last*(1+f*(bounces-i)/bounces)).toFixed(4));
    state.prices.push({ t: state.tick + i, p: p2, v: Math.round(2000+Math.random()*3000) });
  }
  const text = ev.dir==='good'
    ? (state.newsGood[Math.floor(Math.random()*state.newsGood.length)]||'市場利好消息發酵')
    : (state.newsBad[Math.floor(Math.random()*state.newsBad.length)]||'市場利空消息衝擊');
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
  updateCalendarUI();
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
  updateCalendarUI();
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
  const map = new Map();
  for (const td of state.prices) {
    const gi = Math.floor(td.t / tpc);
    if (!map.has(gi)) map.set(gi, { o:td.p, h:td.p, l:td.p, c:td.p, v:td.v, startTick:td.t });
    const g = map.get(gi);
    g.h = Math.max(g.h, td.p); g.l = Math.min(g.l, td.p); g.c = td.p; g.v += td.v;
  }
  return [...map.values()].map(g => ({
    ...g, startPulse: Math.floor(g.startTick * PULSE_PER_TICK)
  }));
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

  const goalPct = Math.min(100, equity / WIN_TARGET * 100);
  const gp = $('goalProgress'); if (gp) gp.style.width = goalPct + '%';
  const gl = $('goalPctLabel'); if (gl) gl.textContent = goalPct.toFixed(2) + '%';
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
  return Math.max(1, isNaN(raw)?0:raw);
}

function executeMarketBuy(qty, p) {
  const cost = qty * p;
  state.avgCost = (state.avgCost * state.shares + cost) / (state.shares + qty);
  state.shares += qty; state.cash -= cost;
  const msg = `${pulseStr(currentPulse())} 買 ${qty} @${p.toFixed(2)} = ${fmt(cost)}`;
  addLog(msg, 'buy');
  state.orderHistory.unshift({ side:'buy', type:'market', qty, price:p, placedPulse:currentPulse() });
  updateOrdersUI(); maybeUpdatePanel(true);
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
  updateOrdersUI(); maybeUpdatePanel(true);
}

function placeLimitOrder(side) {
  const qty  = getQty(); if (qty<=0){toast('數量無效');playSfx('reject');return;}
  const raw  = parseFloat($('limitPriceInput')?.value);
  if (isNaN(raw)||raw<=0){toast('目標價無效');playSfx('reject');return;}
  const lp   = +raw.toFixed(2);
  if (side==='buy'&&lp*qty>state.cash){toast('現金不足');playSfx('reject');return;}
  state.pendingOrders.push({ side, qty, limitPrice:lp, placedPulse:currentPulse() });
  addLog(`掛${side==='buy'?'買':'賣'} ${qty}@${lp}`, 'trade');
  playSfx('orderPlace'); updateOrdersUI();
}

function checkPendingOrders(p) {
  state.pendingOrders = state.pendingOrders.filter(o => {
    if (o.side==='buy'&&p<=o.limitPrice) {
      if (o.qty*o.limitPrice>state.cash) { toast('現金不足，掛單取消'); return false; }
      executeMarketBuy(o.qty, o.limitPrice); playSfx('limitFill');
      state.orderHistory.unshift({...o,type:'limit',filledAt:p,filledPulse:currentPulse()});
      return false;
    }
    if (o.side==='sell'&&p>=o.limitPrice) {
      if (o.qty>state.shares) { toast('持倉不足，掛單取消'); return false; }
      executeMarketSell(o.qty, o.limitPrice); playSfx('limitFill');
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
function addLog(text, type) {
  const entry = { text, type };
  LOG_ALL.unshift(entry);
  if (type==='buy'||type==='sell'||type==='trade') LOG_TRADE.unshift(entry);
  if (type==='news'||type==='event') LOG_NEWS.unshift(entry);
  if (LOG_ALL.length>200)   LOG_ALL.pop();
  if (LOG_TRADE.length>100) LOG_TRADE.pop();
  if (LOG_NEWS.length>100)  LOG_NEWS.pop();
}
function renderLog() {
  const tab = state.logTab;
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

/* ============================================================
   CALENDAR UI
   ============================================================ */
function updateCalendarUI() {
  const cp = currentPulse();
  const cl = $('calCurrentPulse'); if(cl) cl.textContent = pulseStr(cp);
  const ul = $('upcomingList');
  if (ul) ul.innerHTML = state.forecastEvents.length
    ? state.forecastEvents.sort((a,b)=>a.executePulse-b.executePulse).map(ev =>
        `<div class="calRow ${ev.dir}"><span class="calCountdown">${ev.executePulse-cp} 天後</span>
         <span class="calMsg">${ev.msg.replace(/\{N\}/g,ev.executePulse-cp)}</span></div>`
      ).join('') : '<div class="orderEmpty">尚無預告</div>';
}

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
  const mins=(state.tick*TICK_MS/1000/60).toFixed(1);
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
  db.ref('empire/players').on('value', snap => {
    const data = snap.val() || {};
    const players = Object.entries(data)
      .map(([id,p])=>({id,...p}))
      .filter(p => Date.now()-p.lastSeen < 3*60*1000) // active in last 3min
      .sort((a,b)=>b.equity-a.equity)
      .slice(0,10);
    renderLeaderboard(players);
  });

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
  let startX=0, startOff=0, startDist=0, dragging=false;
  const LOCK=10;

  function onStart(x) { startX=x; startOff=state.viewOffset; dragging=true; }
  function onMove(x) {
    if (!dragging) return;
    const dx = x - startX;
    if (Math.abs(dx) < LOCK && !dragging) return;
    const all = buildCandles(state.candlePeriod);
    const candleW = c.getBoundingClientRect().width / VISIBLE_CANDLES_BASE;
    state.viewOffset = Math.max(0, Math.min(all.length - VISIBLE_CANDLES_BASE, startOff + dx/candleW));
    state.pinned = (state.viewOffset <= 0);
    drawCandleChart();
  }
  function onEnd() { dragging=false; }

  c.addEventListener('mousedown', e=>{onStart(e.clientX);});
  window.addEventListener('mousemove',e=>{onMove(e.clientX);});
  window.addEventListener('mouseup', onEnd);
  c.addEventListener('touchstart',e=>{e.preventDefault();onStart(e.touches[0].clientX);},{passive:false});
  c.addEventListener('touchmove', e=>{e.preventDefault();onMove(e.touches[0].clientX);},{passive:false});
  c.addEventListener('touchend',  onEnd);

  const rb=$('resetViewBtn');
  if (rb) rb.addEventListener('click',()=>{ state.viewOffset=0; state.pinned=true; rb.classList.add('hidden'); drawCandleChart(); });
}

/* ============================================================
   GLOBE (Canvas 2D orthographic projection)
   ============================================================ */
let globeRotX = 0.2, globeRotY = 0;
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
    const glow = ctx.createRadialGradient(pt.sx,pt.sy,0,pt.sx,pt.sy,dotR*3);
    glow.addColorStop(0, m.color.replace(')',',0.6)').replace('rgb','rgba').replace('#','rgba(').replace(/([0-9a-f]{2})/gi,(m2)=>parseInt(m2,16)+','));
    // simpler glow:
    ctx.beginPath(); ctx.arc(pt.sx,pt.sy,dotR*3,0,Math.PI*2);
    ctx.fillStyle = m.color + '33'; ctx.fill();

    // dot
    ctx.beginPath(); ctx.arc(pt.sx,pt.sy,dotR,0,Math.PI*2);
    ctx.fillStyle = m.color; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();

    // label
    ctx.fillStyle='#fff'; ctx.font=`bold ${isHover?12:10}px Inter,sans-serif`;
    ctx.textAlign='center';
    ctx.fillText(m.name, pt.sx, pt.sy - dotR - 4);

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
  drawGlobe();
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
      globeRotY += (e.clientX-globeLastX)*0.005;
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
    globeRotY += (e.touches[0].clientX-globeLastX)*0.005;
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
  if (cancelAnimationFrame) cancelAnimationFrame(globeAnimId);
}

function startGame(loadedState) {
  const ns=$('nicknameScreen'); if(ns) ns.classList.add('hidden');
  const app=$('app'); if(app) app.classList.remove('hidden');

  ensurePlayerId();
  applyMarket(selectedMkt);

  if (loadedState) {
    // restore from data code
    selectedMkt = loadedState.m || selectedMkt;
    applyMarket(selectedMkt);
    nickname = loadedState.n || nickname;
    state.cash        = loadedState.c || 10000;
    state.shares      = loadedState.s || 0;
    state.avgCost     = (loadedState.a||0) / 100;
    state.realizedPnl = loadedState.r || 0;
  } else {
    resetGameState();
  }

  startBGM();
  initFirebase();
  setupLeaderboard();
  warmup();
  startTick();
  setupChartGesture();
  setupIndicatorUI();
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
function warmup() {
  for (let i=0;i<600;i++) nextPrice(true);
}
function startTick() {
  if (_tickInterval) clearInterval(_tickInterval);
  _tickInterval = setInterval(tick, TICK_MS);
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
  }

  // Globe enter button
  const geb = $('globeEnterBtn');
  if (geb) geb.addEventListener('click', showNicknameScreen);

  // Nickname screen
  const nickInput  = $('nickInput');
  const startBtn   = $('nickStartBtn');
  const codeInput  = $('codeInput');
  const loadBtn    = $('nickLoadBtn');

  if (startBtn) startBtn.addEventListener('click', () => {
    const val = (nickInput?.value||'').trim();
    if (!val) { toast('請輸入暱稱'); return; }
    nickname = val.slice(0,20);
    localStorage.setItem('empire_nick', nickname);
    startGame(null);
  });

  if (loadBtn) loadBtn.addEventListener('click', () => {
    const code = (codeInput?.value||'').trim();
    const loaded = decodeGameState(code);
    if (!loaded) { toast('數據碼無效'); return; }
    nickname = loaded.n || '玩家';
    localStorage.setItem('empire_nick', nickname);
    selectedMkt = loaded.m || 'empire';
    startGame(loaded);
  });

  // Top bar actions
  const calBtn = $('calendarBtn');
  if (calBtn) calBtn.addEventListener('click',()=>{ openOverlay('calendarOverlay'); updateCalendarUI(); playSfx('click'); });
  const ordBtn = $('ordersBtn');
  if (ordBtn) ordBtn.addEventListener('click',()=>{ openOverlay('ordersOverlay'); updateOrdersUI(); playSfx('click'); });
  const indBtn = $('indicatorBtn');
  if (indBtn) indBtn.addEventListener('click',()=>{ openOverlay('indicatorOverlay'); playSfx('click'); });
  const muteBtn = $('muteBtn');
  if (muteBtn) muteBtn.addEventListener('click', toggleMute);
  const lbBtn = $('leaderboardBtn');
  if (lbBtn) lbBtn.addEventListener('click',()=>{ openOverlay('leaderboardOverlay'); playSfx('click'); });

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
      document.querySelectorAll('.logList').forEach(l=>l.classList.add('hidden'));
      const target=$('log'+state.logTab.charAt(0).toUpperCase()+state.logTab.slice(1));
      if(target) target.classList.remove('hidden');
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
    resetGameState();
    $('winScreen').classList.add('hidden');
    LOG_ALL.length=0; LOG_TRADE.length=0; LOG_NEWS.length=0;
    warmup(); startTick(); maybeUpdatePanel(true);
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
