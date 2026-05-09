# IdleEmpire — 部署為公開網址

## 🚀 最快路徑：Netlify Drop（免註冊、立即拿網址）

**Chrome 已經幫你開好頁面了**：https://app.netlify.com/drop

兩種選擇，擇一即可：

### 選項 A：拖 zip 檔（最簡單）

1. 打開 Finder，前往 `~/Desktop/Claude/IdleEmpire/`
2. 找到 `idleempire-deploy.zip`（已經幫你打包好）
3. 把它**直接拖到 Chrome 裡 Netlify Drop 的虛線圈圈上**
4. 等 10-30 秒，Netlify 會給你一個 `https://xxxx-xxxx-xxxx.netlify.app` 網址

### 選項 B：拖整個資料夾（更乾淨）

1. 在 Finder 找到 `~/Desktop/Claude/IdleEmpire/`
2. 拖整個資料夾到 Netlify Drop（**注意要連 `assets/pydew/` 也一起傳，那個沒影響功能**）

> 拿到網址後告訴我，我可以幫你把網址記到專案 README，後續更新版本只要再拖一次就好。

---

## 想要永久且可自訂網址（選項 C：GitHub Pages）

如果想要 `https://你的帳號.github.io/idle-empire/` 這種網址：

```bash
cd ~/Desktop/Claude/IdleEmpire

# 1. 清掉那個沙箱卡住沒刪掉的 git 殘留（一次性）
rm -rf assets/pydew

# 2. 初始化 git
git init
git add index.html style.css game.js assets DEPLOY.md
git commit -m "v1: idle empire playable"

# 3. 在 github.com 建一個 repo（例如 idle-empire），然後：
git remote add origin https://github.com/你的帳號/idle-empire.git
git branch -M main
git push -u origin main

# 4. 到 GitHub repo → Settings → Pages → Source: main / root → Save
# 等 1-2 分鐘就有 https://你的帳號.github.io/idle-empire/
```

---

## 之後要更新遊戲怎麼辦？

- **Netlify Drop**：再來一次拖放，會給新網址；或登入 Netlify 把同一個 site 覆蓋
- **GitHub Pages**：`git add . && git commit -m "更新" && git push` 即可

---

## 順手清掉殘留檔（macOS Terminal）

我這邊的沙箱權限刪不掉 `assets/pydew/.git/`（76KB，沒影響功能但很醜）。
你電腦端可以一行清掉：

```bash
rm -rf ~/Desktop/Claude/IdleEmpire/assets/pydew
```
