# 專案長期記憶 — Pai 與 Claude 的遊戲開發筆記

> 這份檔案是長期記憶。每次接手任何遊戲開發專案前，**先讀這份**。

---

## ⚠ 目前主案：Idle Investor（v2026.5 起）

> 2026.5 Pai 決定**屏棄 IdleEmpire**（v2.6 收線），開新案：Idle Investor。
> 本檔案以 Idle Investor 為主，IdleEmpire 經驗保留在第 9 章作為參考。

---

## 1. Idle Investor 核心理念

**「極簡上癮型股市放置遊戲」**

- 玩家在虛擬交易市場開局，初始資金 **10,000 元**
- 市場有一個 24 小時不休市的虛擬標的（暫名「幻象指數 / IDX」）
- 股價每 **10 秒** 更新一次
- 玩家根據價格 + 簡化的技術/籌碼面做進出場
- **勝利條件：資金達 10,000,000 元（1000 倍）**
- 介面極簡、乾淨、優雅，沒有專業術語套娃
- 美術延續 IdleEmpire 的像素風（暖色木紋、JetBrains Mono 數字、Noto Sans TC 中文）
- 音樂沿用 IdleEmpire 的 BGM，另加交易特有音效（買入/賣出/警示）

**反設計原則：**
- ❌ 不要堆專業術語（K 棒 / 布林 / MACD / 多空保證金... 一律避開）
- ❌ 不要複雜的多標的、衍生品、槓桿
- ❌ 不要堆數字面板讓玩家暈
- ✅ 一張清楚的圖、兩三個簡化指標、一對買賣按鈕

---

## 2. 視角與技術架構

| 項目 | 規格 |
| --- | --- |
| 平台 | 單檔 HTML（HTML5 Canvas + 原生 JS），不依賴框架 |
| 美術 | 像素風 UI 框 + 平滑現代圖表（混合：UI 是像素，圖表是 vector） |
| 字體 | 數字 JetBrains Mono、中文 Noto Sans TC（沿用 IdleEmpire） |
| 圖表 | Canvas 自繪 line/area chart，10 秒一 tick，最近 60-120 ticks 可視 |
| 模擬 | 真實 GBM（幾何布朗運動）+ 真實歷史數據 seeds（從 GitHub 抓開放 CSV） |
| 部署 | GitHub Pages，用 `.github_token` 自主 push |

---

## 3. 模擬引擎（價格產生機制）

**目標：** 看起來像真股價，有趨勢、有支撐壓力、有突發大漲跌

**v0.1 採用：**
- **基底**：GBM (geometric Brownian motion)
  - 每 tick `r = μ·dt + σ·sqrt(dt)·N(0,1)`
  - μ（漂移）≈ +0.001 per tick（讓玩家長期能贏）
  - σ（波動）≈ 0.015 per tick（每 10s 約 ±1.5% 波動）
- **疊加事件**：每 200-400 ticks 隨機觸發
  - 利多新聞 → 跳漲 +3~8%
  - 利空新聞 → 跳跌 -3~8%
- **支撐 / 壓力**：價格接近近期高低點時，反彈機率提升

**真實數據種子（之後加）：**
- 從 GitHub 公開 datasets 抓真歷史日 K（如 SPY、TSLA），按比例縮放成 10 秒 ticks
- 讓玩家有「真實感」但又不是預測真股票

---

## 4. 技術面（簡化版，給玩家分析依據）

| 名稱 | 內部含義 | 玩家看到的 |
| --- | --- | --- |
| 短期均線 | MA(5) | 「短期趨勢」綠線 |
| 長期均線 | MA(20) | 「長期趨勢」藍線 |
| 成交量 | volume bars | 「人氣」 |
| 籌碼分佈 | 各價位累積成交量 | 「籌碼分佈圖」 |
| 漲跌動能 | RSI 簡化 | 「熱度」（0-100，紅熱藍冷） |

**禁止術語：** K 棒、KD、MACD、布林通道、保證金、空頭、放空、槓桿等

---

## 5. UI 佈局（極簡）

```
┌─────────────────────────────────────────────┐
│ 現金 10,000   持倉 0 股   總資產 10,000   ▲0% │  ← 頂部資產欄
├─────────────────────────────────────────────┤
│                                             │
│           [ 大圖：價格走勢 ]                │
│         綠線/藍線/橘線 = MA5/MA20/熱度       │
│                                             │
├─────────────────────────────────────────────┤
│ [成交量條]    [籌碼分佈直方圖]              │
├─────────────────────────────────────────────┤
│       現價 100.50   ▲0.25 (+0.25%)         │
│       [買入]     [賣出]     [數量輸入]      │
└─────────────────────────────────────────────┘
```

---

## 6. 遊戲循環與勝利條件

- 開局：10,000 元現金、0 持倉
- 目標：資產總額達 **10,000,000 元**
- 預估遊玩時間：30 分鐘 ~ 2 小時（看玩家技術與運氣）
- 達標後彈出勝利畫面，可選擇繼續或重新開始

---

## 7. 音樂與音效

- **BGM**：沿用 IdleEmpire 的 `bgm.mp3`
- **新音效**：
  - 買入確認：清脆「叮」
  - 賣出確認：金幣「噹」
  - 大漲超過 +5%：上揚音效
  - 大跌超過 -5%：低沉警示
  - 勝利達標：歡呼樂段

---

## 8. 部署機制（沿用 IdleEmpire 的設置）

- **Token**：`~/Desktop/Claude/IdleEmpire/.github_token` 是 fine-grained PAT
- **目標 URL**：放在 `GeorgePai/IdleEmpire` repo 下作為新的 HTML 檔（如 `IdleInvestor.html`），URL 變為 `https://georgepai.github.io/IdleEmpire/IdleInvestor.html`
- 之後可改成獨立 repo `GeorgePai/IdleInvestor`（需 Pai 建一個）
- 每次改完 push 即 GitHub Pages 自動部署

---

## 9. IdleEmpire 經驗保留（不再開發但可參考）

IdleEmpire 從 v1 到 v2.6 累積的經驗：

### 美術 / 素材流程
- pydew_valley GitHub repo 是 Cup Nooble Sprout Lands 素材的好 mirror
- 用 PIL 製作像素 sprite（townhall, market, fence, coin, wheat icon...）
- 嚴格遵守：限定調色盤、無反鋸齒、每像素方塊感
- 字體：JetBrains Mono（數字明確）+ Noto Sans TC（中文清晰）

### 技術
- 純 HTML5 Canvas + 原生 JS 單檔
- 渲染：viewport culling 大幅提升多物件場景性能
- 碰撞：空間網格（grid）取代 O(N²)
- 動畫：4 方向 sprite sheet + 多動作（walk / idle / work）
- 存檔：localStorage（v1 開過、v1.6 移除）

### 部署
- GitHub Pages + fine-grained PAT（PAT 存 `~/Desktop/Claude/IdleEmpire/.github_token`）
- bash 沙箱可以 git clone + push（github.com 在 allowlist）
- cache-busting 用 `?v=N` query string，每次改 bump 一次
- CDN 更新通常需要 30 秒～2 分鐘

### Pai 的審美原則
- 不要任何 emoji 符號（廉價感）
- 字體要清晰（不要 Pixelify Sans，2/8 不分）
- 文字要極簡淺顯（不要冗長敘述）
- 視覺要立體有層次（不要平面塗鴉感）
- 移動要合理（NPC 不走斜線、不能穿建築）

### Pai 與 Claude 合作守則（沿用到 Idle Investor）
- Pai 是玩家+督導，給回饋；技術決策 Claude 自己定
- 誠實 > 討好，遇到限制立刻坦白
- 不要每次過問 Pai；自主執行
- 持續自我審查；用 sub-agent 做品質檢查
- 每次改完 push 部署，不停下來
- **手機與桌機都要順暢**（必測響應式 + 觸控）

---

## 10. Idle Investor 開發路線圖

### v0.1（首發）— 核心循環可玩
- 1 個標的、10s tick、GBM 模擬
- 大圖：price line chart
- 2 條均線：MA5 + MA20
- 成交量 + 籌碼分佈
- 現價 + 買入/賣出按鈕（含數量）
- 頂部資產欄 + 達標 10M 勝利畫面
- 像素 UI 框 + 平滑圖表

### v0.2 — 質感加強
- 真實歷史數據種子混入（從 GitHub 抓 SPY/TSLA CSV）
- 隨機新聞事件（利多/利空文字提示）
- 「熱度」指標（簡化 RSI）
- 圖表 zoom（1m / 10m / 1h）
- 買賣音效完整

### v0.3 — 沉浸感
- 籌碼分佈動態（買賣分布隨時間累積）
- 漲跌動畫 flash + 音效強化
- 達標後加「困難模式」（從更小資金開始）
- 手機 layout 調整

---

## 11. 檔案結構

```
IdleEmpire/                 ← 沿用此資料夾為基地（共用 token、assets/audio）
├── claude.md               ← 本檔
├── .github_token           ← deploy 用
├── IdleInvestor.html       ← 新主檔（單檔 HTML）
├── IdleInvestor.css        ← UI 樣式
├── IdleInvestor.js         ← 主邏輯
├── assets/                 ← IdleEmpire 留下的素材（音效可用）
│   └── audio/              ← bgm.mp3 沿用
├── invest/                 ← Idle Investor 自製素材
│   ├── ui/                 ← 按鈕 / 邊框
│   └── sfx/                ← 新音效（之後加）
└── (IdleEmpire 舊檔)       ← game.js / index.html 留著，不再動
```

---

> 下次接手請從這裡開始：讀 claude.md → 看「v0.1 / v0.2 路線圖」剩什麼 → 動工 → push → 不停下來。
