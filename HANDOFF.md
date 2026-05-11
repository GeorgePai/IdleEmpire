# IdleEmpire — HANDOFF 移交文件（v0.6 PULSE BUILD）

> v1 接手前**先讀本檔**。看完再讀 `claude.md` 補充記憶。

---

## 0. 一句話定位

**「Empire 指數 (EPC)」是一個極簡上癮的虛擬貨幣交易模擬器。** 玩家從 $10,000 起步，目標 $50,000（5 倍），直屏手機優先，深色 TradingView-style。

⚠️ **重要**：資料夾叫 `IdleEmpire` 但內容是股市模擬。早期是農場放置遊戲（v1.x–v2.6），已封存。Repo 名稱沿用。

---

## 1. 檔案結構

```
IdleEmpire/
├── HANDOFF.md             ← 本檔（必讀）
├── claude.md              ← 長期記憶補充
├── index.html             ← 主入口（splash + 主介面 + 三個 overlay）
├── style.css              ← 深色 UI（含所有組件樣式）
├── game.js                ← 主邏輯（單檔，IIFE 包覆，~1100 行）
├── .github_token          ← 部署 PAT（fine-grained，只給此 repo 寫入）
└── assets/audio/bgm.mp3   ← BGM（沿用原檔）
```

**部署目標**：GitHub Pages → `https://georgepai.github.io/IdleEmpire/`
**Cached working tree**：`/tmp/idleempire-push/`（remote URL 已含 token，可直接 push）

---

## 2. game.js 模組地圖

| 區塊 | 行數範圍 | 職責 |
|---|---|---|
| 常數 / 新聞庫 | 1–80 | TICK_MS / PULSE_PER_TICK / NEWS_GOOD/BAD / FORECAST_GOOD/BAD |
| state | 80–130 | 所有可變狀態，單一物件 |
| GBM 引擎 | 140–200 | `gauss()` `nextPrice()` `triggerForecastEvent()` `maybeAnnounceForecast()` |
| `tick()` 主循環 | 200–230 | 每秒：推進價格 + 事件 + 限價檢查 + UI 同步 |
| K 棒聚合 | 235–270 | `buildCandles()` `maOnCandles()` |
| 面板更新 | 275–360 | `maybeUpdatePanel()` 跳動式 (2.5s 節流) |
| Canvas 繪製 | 360–520 | `drawCandleChart()` `drawMaLine()` `renderTimeAxis()` `drawVolChart()` |
| 交易 | 525–660 | `buy/sell` `executeMarketBuy/Sell` `placeLimitOrder` `checkPendingOrders` |
| UI 渲染 | 665–760 | `updateOrdersUI` `updateCalendarUI` `renderLog` |
| 音效 | 770–830 | `playSfx` `beep` |
| BGM / Win / Overlay | 830–880 | 雜項 |
| 拖曳手勢 | 890–940 | `setupChartGesture()` |
| Splash 動畫 | 945–975 | `drawSplashChart()` requestAnimationFrame |
| init | 980–1100 | 暖場 + 事件綁定 + 啟動 setInterval |

---

## 3. 關鍵設計決策

### 3.1 PULSE 時間系統（為什麼）

**設計**：1 真實秒 = 0.2 Pulse → **5 真實秒 = 1 PULSE**

**為什麼是 5:1**：
- 預設 K 棒週期 5s。在 5:1 換算下「一根 K 線 = 一個 Pulse-day」，符合「日 K 線」的直覺
- 1:1 太快（玩 1 分鐘已過 60 天），60:1 太慢（沒有累積感）
- 5:1 讓 1 小時遊戲 = 720 Pulse（兩年），夠長但不誇張

**對照表**：
| 真實 | Pulse |
|---|---|
| 5s | 1 |
| 10s | 2 |
| 60s | 12 |
| 5min | 60 |
| 1h | 720 |

**顯示**：`PULSE 0042` (4 位 padding) / X 軸縮寫 `P0042`

### 3.2 K 棒聚合用絕對 tick 而非 array index

**老 bug**：早期版本用 `state.prices` 的 array index 分組。當 FIFO `shift()` 移除舊資料時，所有 group index 同時 -1 → 已收盤 K 棒會重新聚合 → 圖表抖動。

**修法**：
```js
const groupIdx = Math.floor(td.t / ticksPerCandle);  // 用絕對 tick
```
搭配 `state.prices.push({ t: state.tick, ... })`，即使 FIFO 也不影響 groupIdx。**已收盤 K 永遠不變**。

### 3.3 拖曳方向：手指右滑 = 看更舊

```js
state.viewOffset = startOffset + dx / candleW;  // +dx 不是 -dx
```
玩家在手機上滑動的方向直覺：右滑 = 把時間軸往右拉 = 露出左邊（更舊）。`viewOffset > 0` 代表往歷史看。

### 3.4 跳動式面板更新（PANEL_UPDATE_MS = 2500）

**問題**：subtick 60ms 一次，如果每次都更新大字面板，使用者眼花。
**解法**：`maybeUpdatePanel()` 內部用 `performance.now()` 節流，2.5 秒才跳一次，配 CSS `tick-up/tick-down` 動畫做「跳動」感。

### 3.5 預告事件設計

**目標**：玩家可以「預知」未來事件提前佈局（買在低點/逃在高點），增加策略深度。

**機制**：
- 每 tick 0.8% 機率隨機 announce 一個未來事件
- 提前 5–18 Pulse 預告
- 玩家有 25–90 真實秒可佈局（限價買單之類）
- 到 executePulse 時自動 trigger，造成 ±6% 衝擊

**同時上限 5 件**：避免日曆爆炸，也避免市場過度受預告影響。

**Pulse 5–18 範圍的權衡**：太短玩家來不及反應，太長變預知夢、不刺激。

### 3.6 暖場 600 ticks 不出新聞

```js
nextPrice(true)  // suppressNews = true
```
進場前的 120 Pulse 歷史應該「乾淨」，否則 log 一進場就一堆舊新聞。

### 3.7 BGM autoplay 限制

瀏覽器禁止 autoplay。設計：splash「進場交易」按鈕 click 後才 `startBGM()`，因為使用者互動已產生。

### 3.8 Web Audio context suspended

`audioCtx` 初始可能 suspended。每次 `playSfx` 開頭：
```js
if (audioCtx.state === 'suspended') audioCtx.resume();
```

---

## 4. 已知陷阱與解法

| 陷阱 | 症狀 | 解法 |
|---|---|---|
| K 棒 FIFO 漂移 | 已收盤 K 還在變化 | 用絕對 `td.t` 而非 array index 分組 |
| 時間軸「停止」 | 軸標籤不變 | 用每根 K 的 `startPulse`，不要用單一 `startTime + offset` |
| sandbox mount 失效 | 重命名資料夾後 mnt 變空 | 用 `/tmp/idleempire-push/` cached clone |
| 雙均線 legend 殘留 | 關掉 MA1，藍 dot 還在 | wrapper span `#ma1Legend` `.classList.toggle('hidden')` |
| 拖曳方向反 | 玩家覺得跟手機 photo 滑動相反 | `+dx` 不是 `-dx` |
| MA 一開始有 null | 前 N-1 根還沒算出來 | `drawMaLine` skip `arr[i]==null` |
| canvas DPR 模糊 | 高分螢幕字糊 | `setCanvas` 用 `devicePixelRatio` 縮放 transform |
| 觸控長按出選單 | 手機上產生 iOS 文字選單 | body `-webkit-touch-callout: none` + 主要 div `user-select:none` |

---

## 5. 部署流程

```bash
cd /tmp/idleempire-push

# 修改 index.html / style.css / game.js
# 注意 cache-busting：HTML 中 ?v=N，每次大改 bump N

# 語法檢查
node --check game.js

# 提交
git add -A
git -c user.email=george.pai.0930@gmail.com -c user.name="George Pai" \
    commit -m "vX.Y: 簡述改了什麼"
git push   # remote URL 已嵌入 token

# 等 GitHub Pages 部署 (~60s)
# 用 Chrome MCP 驗證
```

**Chrome MCP 驗證模式**：
```
navigate ?vX=1   ← 帶 query 避快取
resize 414x896   ← iPhone 直屏尺寸
javascript_tool  ← 檢查 state / DOM
screenshot       ← 視覺驗證
browser_batch    ← 批次 click + screenshot + javascript 一次完成
```

---

## 6. v0.6 已實作清單

### 核心
- GBM 引擎 + 趨勢 + 黑天鵝 + 即時新聞
- K 棒週期 5/15/30/60s（絕對時間分組）
- 雙均線 MA1 金 / MA2 藍（週期與開關自訂）
- 拖曳 / 縮放 / 回到最新（軸鎖定 10px 閾值）
- 升級網格（1/8 微 + 1/4 主 + 外框 + inset shadow）

### 交易
- 市價買賣
- 限價委託（買 ≤ / 賣 ≥ 觸發）
- 委託明細浮層（待成交 + 歷史，限價 / 市價標記）
- 已實現損益累計
- 圖上掛單虛線 + 成本虛線

### 時間 / 事件
- PULSE 系統（5 真實秒 = 1 Pulse-day）
- 預告事件（5–18 Pulse lead time）
- 日曆浮層（未來預告 + 已發生，倒數 N Pulse）
- 10+10 新聞庫 + 10+10 預告事件庫

### UI
- Splash 登入畫面（動態 K 線剪影 + 金色 3D 進場按鈕）
- 5 欄資產 inline 條（現金/持倉/成本/已實現/總資產）
- 未實現損益右上方（空倉時轉「空倉/--」）
- 三分頁 Log（全部/交易/新聞）+ 可展開
- 三個 overlay（指標/委託/日曆），點背景 + Esc + ✕ 三種關閉
- 跳動式面板更新（2.5s 節流，避免眼花）

### 音效
- 合成 7 種：marketBuy/marketSell/orderPlace/limitFill/news/click/reject
- 原有 crash/surge/win

---

## 7. 未實作 / 路線圖建議

| 優先級 | 項目 | 備註 |
|---|---|---|
| 中 | 真實歷史數據種子 | 從 SPY/TSLA CSV 抽切片混入 GBM |
| 中 | 困難模式 | 起步資金 $1,000 或時間限制 |
| 中 | localStorage 排行榜 | 達標時間 + 交易次數 |
| 低 | 多標的（指數 + 個股） | 會大幅增加 UI 複雜度，三思 |
| 低 | 圖表 zoom 1m/10m/1h | 與目前 viewOffset 機制衝突 |
| 低 | 持倉時間統計 | 進階玩家功能 |
| 低 | 教學 onboarding | 第一次進場引導 |
| 低 | 橫屏支援 | 桌機已 ok，平板橫屏未測 |

---

## 8. 作業原則（Pai 與 Claude 協作守則）

1. **誠實 > 討好**：遇到限制立刻坦白
2. **不過問**：能直接做就做
3. **持續自我審查**：每次改完跑 `node --check` + 自己截圖驗證
4. **每次改完 push 部署**：不留半成品
5. **節省 usage**：規劃好再動手、批次修改、必要時才截圖
6. **品質不打折**：流程精準，但不犧牲品質
7. **手機與桌機都要順暢**
8. **不用 emoji**（廉價感）
9. **字體要清晰**（JetBrains Mono 數字 + Noto Sans TC 中文 + Inter 英文）
10. **文字極簡**

### Pai 的審美原則
- 深色 + 立體 + 不堆 UI
- 不堆專業術語（K 棒/MACD/布林 → 避開，叫「短線」「中線」即可）
- 避免複雜衍生品 / 槓桿
- 一張清楚的圖、兩三個簡化指標、一對買賣按鈕
- 大字面板「跳動式」更新（每 2.5s），避免眼花
- 介面要透氣，不要密密麻麻

---

## 9. v1 接手第一步（按順序）

1. 讀本檔（HANDOFF.md）→ 5 分鐘
2. 讀 `claude.md` 補充歷史背景 → 3 分鐘
3. 開 https://georgepai.github.io/IdleEmpire/ 玩 2 分鐘體會現況
4. `cd /tmp/idleempire-push && git log --oneline -10` 看最近改動
5. 等 Pai 給下一輪需求；如果他直接交辦，先用 AskUserQuestion 釐清模糊處
6. 動工前列計畫，動工後自己驗證 → 部署 → 報告

---

> 「Empire 鏈每跳動一次，市場就推進一個 Pulse。」
> — PULSE BUILD v0.6
