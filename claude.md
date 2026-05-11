# IdleEmpire — 專案長期記憶

> 這份檔案是長期記憶。每次接手前，**先讀這份**。

---

## 1. 核心理念

**「極簡上癮型股市放置遊戲」**

> 名字叫 IdleEmpire（沿用最初的專案名），但實際內容是股市模擬遊戲。
> 之前的農場放置版本已封存（經驗保留在第 9 章），重寫成股市風格。

- 玩家在虛擬交易市場開局，初始資金 **10,000 元**
- 市場有一個 24 小時不休市的虛擬標的「幻象指數 / IDX」
- 股價每 **3 秒** 更新一次（每 120ms 子 tick 平滑動畫）
- 玩家根據簡化的技術/籌碼面做進出場
- **勝利條件：資產達 10,000,000 元（1000 倍）**
- 介面：深色金融專業風（TradingView-style），直屏手機優先
- 字體：JetBrains Mono（數字）+ Noto Sans TC（中文）+ Inter（英文）

**反設計原則：**
- ❌ 不要堆專業術語（K 棒 / 布林 / MACD / 槓桿 ... 一律避開）
- ❌ 不要複雜的多標的、衍生品
- ❌ 不要堆數字面板讓玩家暈
- ✅ 一張清楚的圖、兩三個簡化指標、一對買賣按鈕

---

## 2. 技術架構

| 項目 | 規格 |
| --- | --- |
| 平台 | 單檔 HTML（HTML5 Canvas + 原生 JS） |
| 風格 | 深色金融專業風（黑底 + 青/紅 + 金/藍 accent + radial glow） |
| 字體 | JetBrains Mono（數字）、Noto Sans TC（中文）、Inter（英文） |
| 圖表 | Canvas 自繪 line/area + 半圓儀錶、3 秒 tick + 0.12s 子 tick 平滑 |
| 模擬 | GBM（幾何布朗運動）+ 隨機新聞事件 |
| 部署 | GitHub Pages，repo `GeorgePai/IdleEmpire`，自動 push |

---

## 3. 模擬引擎

**目標：** 看起來像真股價，有趨勢、有支撐壓力、有突發大漲跌

- **基底**：GBM
  - drift ≈ +0.08% per tick
  - vol ≈ 1.8% per tick
- **趨勢切換**：~1% 機率每 tick 觸發新趨勢（30-90 ticks 持續）
- **支撐 / 壓力**：價格接近近期高低點時反彈機率提升
- **事件**：每 tick ~0.5% 觸發新聞（利多 / 利空 / 大漲 / 黑天鵝）

---

## 4. 技術面（簡化版）

| 名稱 | 內部 | 玩家看到的 |
| --- | --- | --- |
| 短線均線 | MA(5) | 「短線」金色線 |
| 中線均線 | MA(20) | 「中線」藍色線 |
| 成交量 | volume bars | 「成交量」（紅綠染色） |
| 籌碼分佈 | 各價位累積成交量 | 橫向藍色漸層條 |
| 熱度 | RSI 簡化 | 半圓儀錶（過熱/中性/冷清） |
| 動能 | 10 ticks pct change | 半圓儀錶（強多/偏多/盤整/偏空/強空） |

---

## 5. UI 佈局（直屏手機優先 max-width 480px）

```
┌─────────────────────┐
│ IDX 幻象指數 ●  ♪ │  ← 標題列 + LIVE pulse
├─────────────────────┤
│ 現金│持倉│總資產+%│  ← 資產欄
│ ━━━━━━━━━━━━━━━ │  ← 目標進度條
├─────────────────────┤
│  110.31  -0.64%     │
│  ┌───────────────┐  │
│  │  即時價格圖   │  │  ← 主圖含 MA5/20 + 發光現價點
│  └───────────────┘  │
├──────────┬──────────┤
│ 成交量  │ 籌碼分佈 │
├──────────┼──────────┤
│ 熱度    │ 動能     │  ← 半圓儀錶
├─────────────────────┤
│ 10/100/1K/全 [輸入] │
│ [  買入  ][ 賣出 ] │
├─────────────────────┤
│ 交易日誌            │
└─────────────────────┘
```

---

## 6. 音效

- **BGM**：沿用之前的 `assets/audio/bgm.mp3`
- **SFX（Web Audio 合成）**：
  - 買入：660Hz + 880Hz 雙音
  - 賣出：523Hz + 392Hz 雙音
  - 暴跌：120Hz + 90Hz sawtooth 長音
  - 突發飆漲：880/1100/1320Hz 上升三音
  - 勝利：C-E-G-C 樂段

---

## 7. 部署機制

- **Repo**：`GeorgePai/IdleEmpire`，main branch
- **URL**：`https://georgepai.github.io/IdleEmpire/`
- **Token**：`.github_token`（fine-grained PAT，只給此 repo 寫入權限）
- **自動部署流程**：
  ```bash
  cd /tmp/idleempire-push  # 已 clone 的 working tree（remote URL 含 token）
  cp 改過的檔 .
  git add -A && git commit -m "..." && git push
  # 1-2 分鐘 Pages 自動部署
  ```
- **cache-busting**：HTML 引用 `style.css?v=N` / `game.js?v=N`，每次大改 bump

---

## 8. 檔案結構

```
IdleEmpire/                 ← 本資料夾
├── claude.md               ← 本檔（長期記憶）
├── .github_token           ← deploy 用
├── index.html              ← 主入口
├── style.css               ← 深色 UI 樣式
├── game.js                 ← 主邏輯
└── assets/
    └── audio/
        └── bgm.mp3         ← 沿用原 BGM
```

---

## 9. 舊版農場放置遊戲經驗保留（不再開發但可參考）

之前 IdleEmpire 是農場放置遊戲（v1 → v2.6），後改成股市模擬遊戲沿用名字。
農場版本的累積經驗：

### 美術 / 素材流程
- pydew_valley GitHub repo 是 Cup Nooble Sprout Lands 素材的好 mirror
- 用 PIL 製作像素 sprite
- 嚴格遵守：限定調色盤、無反鋸齒、每像素方塊感

### 技術
- 純 HTML5 Canvas + 原生 JS 單檔
- 視窗 culling + 空間網格碰撞（大量物件性能優化）
- 動畫：4 方向 sprite sheet + 多動作

### 部署
- GitHub Pages + fine-grained PAT
- bash 沙箱可以 git clone + push（github.com 在 allowlist）
- 注意：sandbox mount 在使用者重命名資料夾後可能失效。`/tmp/idleempire-push` 是 cached clone，仍可推送

### Pai 的審美原則
- 不要 emoji（廉價感）
- 字體要清晰（JetBrains Mono 而非 Pixelify Sans）
- 文字要極簡淺顯
- 視覺要立體有層次
- 移動要合理

### Pai 與 Claude 合作守則
- Pai 是玩家+督導
- 誠實 > 討好
- 遇到限制立刻坦白
- 不要每次過問
- 持續自我審查
- 每次改完 push 部署
- 手機與桌機都要順暢

---

## 10. 開發路線圖

### v0.2（目前）— 完整循環可玩
- 3 秒 tick GBM 模擬
- 深色金融專業 UI（TradingView-style）
- 直屏手機優先
- 雙均線 + 成交量 + 籌碼 + 熱度 + 動能儀錶
- 隨機新聞事件
- 達標彈出勝利畫面

### v0.3 — 質感加強
- 真實歷史數據種子混入（從 GitHub 抓 SPY/TSLA CSV）
- 新聞事件文字提示更豐富
- 圖表 zoom（1m / 10m / 1h）
- 持倉持有時間統計

### v0.4 — 沉浸感
- 困難模式（從更小資金開始）
- 排行榜（local storage）
- 更多隨機事件類型
- 漲跌動畫 flash + 音效強化

---

> 下次接手請從這裡接續：讀 claude.md → 看「v0.3 路線圖」剩什麼 → 動工 → push → 不停下來。
