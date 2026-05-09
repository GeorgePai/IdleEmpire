#!/bin/bash
# =============================================================
# IdleEmpire — GitHub 一鍵部署腳本
# 用法：在 Terminal 進入 ~/Desktop/Claude/IdleEmpire/ 後執行
#   bash deploy-github.sh
# 它會自動 init / commit / push，最後告訴你怎麼啟用 GitHub Pages。
# =============================================================
set -e

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$PROJECT_DIR"

echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   IdleEmpire — GitHub 自動部署                         ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# ---------- 0. 環境檢查 ----------
if ! command -v git &>/dev/null; then
  echo "❌ 你的電腦上找不到 git。請先安裝："
  echo "   brew install git    (用 Homebrew)"
  echo "   或從 https://git-scm.com/download/mac 下載"
  exit 1
fi

# ---------- 1. 清理殘留檔（pydew/.git、zip、DS_Store） ----------
echo "🧹 [1/6] 清理殘留檔…"
rm -rf assets/pydew 2>/dev/null || true
rm -f idleempire-deploy.zip 2>/dev/null || true
find . -name ".DS_Store" -delete 2>/dev/null || true
echo "   ✓ 清理完成"

# ---------- 2. 寫 .gitignore（避免下次又把雜物送上去） ----------
echo "📝 [2/6] 寫 .gitignore…"
cat > .gitignore << 'EOF'
# macOS
.DS_Store
.AppleDouble
.LSOverride

# 部署產物
*.zip
dist/

# 編輯器
.vscode/
.idea/
*.swp

# 其他
node_modules/
EOF
echo "   ✓ 完成"

# ---------- 3. 初始化 git（如果還沒有） ----------
echo "🔧 [3/6] 初始化 git…"
if [ ! -d .git ]; then
  git init -q
  git branch -M main
  echo "   ✓ 新建 git repo (main 分支)"
else
  echo "   ✓ 已有 git repo，跳過初始化"
fi

# ---------- 4. add + commit ----------
echo "📦 [4/6] 新增檔案並 commit…"
git add -A
if git diff --cached --quiet; then
  echo "   ✓ 沒有新變更，跳過 commit"
else
  # 檢查是否已設定 git user.name / user.email
  if ! git config user.email &>/dev/null; then
    echo ""
    echo "⚠ git 尚未設定使用者資訊，請輸入："
    read -p "你的名字（會出現在 commit 紀錄）: " GIT_NAME
    read -p "你的 Email: " GIT_EMAIL
    git config --global user.name "$GIT_NAME"
    git config --global user.email "$GIT_EMAIL"
  fi
  git commit -q -m "v1: IdleEmpire 像素放置王國（首次發佈）"
  echo "   ✓ 已 commit"
fi

# ---------- 5. 取得 GitHub repo URL ----------
echo ""
echo "🌐 [5/6] 設定 GitHub 遠端 repo"
echo ""
echo "   尚未建立 GitHub repo？打開這個網址新建一個（不要勾 README、license）："
echo "   👉 https://github.com/new"
echo ""
echo "   建好後會看到一個 URL，例如 https://github.com/YOUR_USERNAME/idle-empire.git"
echo ""

# 如果已經設過 origin，顯示現有的
if git remote get-url origin &>/dev/null; then
  CURRENT_URL=$(git remote get-url origin)
  echo "   目前已設定的 origin：$CURRENT_URL"
  read -p "   要保留還是換新的？(直接 Enter 保留 / 貼新 URL 取代): " REPO_URL
  REPO_URL=${REPO_URL:-$CURRENT_URL}
  git remote set-url origin "$REPO_URL"
else
  read -p "   貼上 GitHub repo URL：" REPO_URL
  if [ -z "$REPO_URL" ]; then
    echo "   ❌ 沒貼 URL，無法 push。腳本中止。"
    exit 1
  fi
  git remote add origin "$REPO_URL"
fi
echo "   ✓ remote 設定為 $REPO_URL"

# ---------- 6. push ----------
echo ""
echo "⬆ [6/6] 推送到 GitHub…"
echo "   （第一次推送如果跳出 GitHub 登入視窗，請完成驗證）"
echo ""
if git push -u origin main; then
  echo ""
  echo "╔════════════════════════════════════════════════════════╗"
  echo "║   ✅ 推送成功！                                        ║"
  echo "╚════════════════════════════════════════════════════════╝"

  # 從 URL 解析出 user/repo
  REPO_PATH=$(echo "$REPO_URL" | sed -E 's|.*github\.com[:/]||; s|\.git$||')
  USERNAME=$(echo "$REPO_PATH" | cut -d/ -f1)
  REPONAME=$(echo "$REPO_PATH" | cut -d/ -f2)

  echo ""
  echo "📋 最後一步 — 啟用 GitHub Pages："
  echo ""
  echo "   1️⃣  打開 https://github.com/$REPO_PATH/settings/pages"
  echo "   2️⃣  Source 選 'Deploy from a branch'"
  echo "   3️⃣  Branch 選 'main' / '(root)' → Save"
  echo "   4️⃣  等 1-2 分鐘，重新整理該頁面就會看到："
  echo "       🎉 https://$USERNAME.github.io/$REPONAME/"
  echo ""
  echo "之後每次更新遊戲，只要：git add . && git commit -m \"更新\" && git push"
  echo ""
else
  echo ""
  echo "❌ push 失敗。最常見的原因："
  echo ""
  echo "  1. 沒在 GitHub 建好 repo → 到 https://github.com/new 建一個"
  echo "  2. URL 打錯 → 確認 repo URL 正確（直接從 GitHub 網頁複製）"
  echo "  3. 沒登入 → macOS 通常會跳 'Sign in to GitHub' 視窗，照做即可"
  echo "     或先在 Terminal 跑：gh auth login   (如果有裝 GitHub CLI)"
  echo ""
  exit 1
fi
