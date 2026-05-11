# IdleEmpire — 長期記憶（補充給 HANDOFF.md）

> **v1 接手請先讀 `HANDOFF.md`。本檔是補充背景、歷史脈絡與審美原則。**

---

## 1. 專案演化簡史

| 版本期 | 內容 | 狀態 |
|---|---|---|
| v1.x – v2.6 | 農場放置遊戲（pydew valley sprite 風格） | 已封存（經驗保留在第 9 章） |
| v0.1 | 改寫為股市模擬遊戲（沿用 IdleEmpire 名稱） | 完成 |
| v0.2 | 深色 TradingView 風 + 直屏手機 | 完成 |
| v0.3 | 7 項回饋（K 線、週期切換、均線自訂…） | 完成 |
| v0.4 | 修 K 棒漂移 + 拖曳/縮放 + 跳動面板 + 5 萬目標 | 完成 |
| v0.5 | 滑動反向 + 預設 5s + 籌碼右側 + 掛單系統 | 完成 |
| **v0.6** | **PULSE 時間系統 + 預告事件 + 日曆 + Splash + 10+10 新聞** | **當前** |

---

## 2. 為什麼遊戲叫 IdleEmpire 但內容是股市

最初是農場放置遊戲，後改為股市模擬。Pai 要求保留 `IdleEmpire` 這個名稱（GitHub repo / domain 都用此），但實際內容是「Empire 指數 (EPC) 虛擬貨幣交易市場」。

不要在程式碼或文案裡寫到「農場」「種田」「Idle Investor」（舊名）。一律稱：
- 介面/UI：「Empire 指數」「EPC」
- 程式碼註解：可寫「股市」「市場」
- 玩家文案：「虛擬貨幣交易模擬市場」

---

## 3. 反設計原則（極為重要）

❌ **不要做的事**
- 不堆專業術語（MACD / 布林 / RSI / 槓桿 / 衍生品 → 一律避開）
- 不要複雜多標的
- 不要堆數字面板讓玩家暈
- 不用 emoji（廉價感）
- 不要 Pixelify Sans 之類花俏字體（用 JetBrains Mono + Noto Sans TC）
- 不要每改一點就跟 Pai 過問

✅ **要做的事**
- 一張清楚的圖
- 兩三個簡化指標
- 一對買賣按鈕
- 立體有層次
- 大字面板跳動式更新（2.5s 一次）
- 移動合理（拖曳順、Y 軸鎖定）

---

## 4. Pai 與 Claude 協作守則

| 守則 | 說明 |
|---|---|
| 誠實 > 討好 | 遇到限制立刻坦白，不假裝沒事 |
| 不過問 | 確定的事直接做，少回頭問 |
| 持續自我審查 | 每改完跑 node --check + 自己截圖 |
| 每次改完 push | 不留半成品 |
| 手機桌機都順 | 兩端都要驗 |
| 節省 usage | 規劃好再動手，批次修改 |
| 品質不打折 | 流程精準，但不犧牲品質 |

---

## 5. 技術陷阱記憶（HANDOFF.md 有更完整版）

### 5.1 sandbox mount
Pai 重命名資料夾後 `/sessions/.../mnt/IdleEmpire/` 會變空。
**解法**：用 `/tmp/idleempire-push/` cached clone，remote URL 含 token，可繞過 mount 直接 push。

### 5.2 GitHub Pages 部署
- Repo: `GeorgePai/IdleEmpire`
- Branch: `main`
- URL: `https://georgepai.github.io/IdleEmpire/`
- Token: 在 remote URL 內嵌的 fine-grained PAT
- 部署延遲：60–120 秒

### 5.3 cache-busting
HTML 引用 `style.css?v=N` `game.js?v=N`，每次大改 bump N（目前 N=7）。

---

## 6. 美術 / 字體 / 色彩

### 字體
- 數字：**JetBrains Mono**（tabular-nums）
- 英文 / UI：**Inter**
- 中文：**Noto Sans TC**
- 從不用：Pixelify Sans、Comic Sans、Roboto

### 色票（已建立 CSS 變數）
```
--up      #26a69a   漲（青綠）
--down    #ef5350   跌（橙紅）
--accent  #2962ff   主強調（藍）
--gold    #f0b90b   成本線 / 警示
--bg      #0a0e14   主背景
--panel   #131722   面板
```

### 立體 button 配方
```
background: linear-gradient(180deg, lighter 0%, base 100%)
box-shadow:
  inset 0 1px 0 rgba(255,255,255,0.06),   // 上 highlight
  inset 0 -1px 0 rgba(0,0,0,0.4),         // 下 lowlight
  0 2px 0 rgba(0,0,0,0.5),                // 厚度
  0 0 16px var(--up-glow);                // 外發光
:active 時 translateY(2px) + 移除 0 2px 0 → 按下去感
```

---

## 7. PULSE 時間系統速查

| 真實時間 | Pulse | 對應 |
|---|---|---|
| 1s | 0.2 | tick 單位 |
| **5s** | **1** | **一根 5s K 棒** |
| 15s | 3 | 一根 15s K |
| 30s | 6 | 一根 30s K |
| 60s | 12 | 一根 60s K |
| 5min | 60 | 一個季度 |
| 1h | 720 | 兩年 |

格式：`PULSE 0042`（4 位 padding）/ 軸縮寫 `P0042`

---

## 8. 部署快查（節省查 HANDOFF.md 的時間）

```bash
cd /tmp/idleempire-push
# 改檔後
node --check game.js
git add -A
git -c user.email=george.pai.0930@gmail.com -c user.name="George Pai" \
    commit -m "vX.Y: 改了什麼"
git push
# Chrome MCP: navigate ?v=N&t=$(now) → wait 60s → verify
```

---

## 9. 舊版農場遊戲經驗保留（不再開發）

之前 IdleEmpire v1–v2.6 是農場放置遊戲。經驗：
- pydew_valley GitHub repo 是 Cup Nooble Sprout Lands 素材 mirror
- 用 PIL 製作像素 sprite
- 嚴格遵守：限定調色盤、無反鋸齒、每像素方塊感
- 視窗 culling + 空間網格碰撞（大量物件性能優化）
- 4 方向 sprite sheet + 多動作動畫

這套經驗目前用不到（股市專案是純 Canvas line/rect 繪製），但留作以後可能參考。

---

## 10. 下次接手指引

1. 讀 `HANDOFF.md`（v1 必讀第一檔）
2. 讀本檔補充歷史 / 審美 / 守則
3. `cd /tmp/idleempire-push && git log --oneline -10`
4. 開 https://georgepai.github.io/IdleEmpire/ 玩 2 分鐘
5. 等 Pai 下一輪需求，或從 HANDOFF.md 第 7 章「路線圖建議」挑題目
