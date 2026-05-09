#!/usr/bin/env python3
"""
IdleEmpire — Single-File Bundler
================================
把 index.html / style.css / game.js / assets/ 全部打包成一個自含 HTML，
所有圖片與音訊以 base64 data: URL 內嵌。
產出：./IdleEmpire.html  (可以直接丟上 GitHub root)

用法：
    cd ~/Desktop/Claude/IdleEmpire
    python3 build_single_html.py
"""
import os
import sys
import base64
import json
import mimetypes
import re

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

# ==== 1. 讀取 source =====================================================
def read_text(p):
    with open(p, encoding='utf-8') as f: return f.read()

def read_bytes(p):
    with open(p, 'rb') as f: return f.read()

print("📖 讀取 source 檔案…")
html = read_text('index.html')
css  = read_text('style.css')
js   = read_text('game.js')
print(f"   index.html: {len(html):,} chars")
print(f"   style.css:  {len(css):,} chars")
print(f"   game.js:    {len(js):,} chars")

# ==== 2. 收集所有資產 ===================================================
print("\n📦 收集資產…")
mimetypes.add_type('audio/mpeg', '.mp3')
mimetypes.add_type('audio/wav', '.wav')
mimetypes.add_type('image/png', '.png')

assets = {}
total_raw = 0
for root, dirs, files in os.walk('assets'):
    # 排除沙箱卡住的 pydew/.git 殘留
    if 'pydew' in root.split(os.sep):
        continue
    # 排除 .DS_Store / 隱藏檔
    files = [f for f in files if not f.startswith('.')]
    for fname in files:
        full = os.path.join(root, fname)
        rel = './' + full.replace(os.sep, '/')
        data = read_bytes(full)
        mime, _ = mimetypes.guess_type(full)
        if mime is None:
            print(f"   ⚠ 跳過未知類型 {rel}")
            continue
        b64 = base64.b64encode(data).decode('ascii')
        assets[rel] = f'data:{mime};base64,{b64}'
        total_raw += len(data)

print(f"   資產數量：{len(assets)}")
print(f"   原始大小：{total_raw/1024:.1f} KB")
print(f"   base64 後：{sum(len(v) for v in assets.values())/1024:.1f} KB")

# ==== 3. 注入 + patch game.js ===========================================
print("\n🔧 注入 asset bundle 到 game.js …")

# 建立 bundle 對照表
bundle_js = (
    "/* === ASSET BUNDLE (base64-inlined) === */\n"
    "window.__ASSET_BUNDLE__ = " + json.dumps(assets, ensure_ascii=False) + ";\n"
    "/* === END BUNDLE === */\n\n"
)

# patch loadAssets — 讓 img.src / a.src 從 bundle 讀取
patched_js = js
patches = [
    ("img.src = src;",  "img.src = (window.__ASSET_BUNDLE__ && window.__ASSET_BUNDLE__[src]) || src;"),
    ("a.src = src;",    "a.src = (window.__ASSET_BUNDLE__ && window.__ASSET_BUNDLE__[src]) || src;"),
]
for old, new in patches:
    if old not in patched_js:
        print(f"   ❌ 找不到要 patch 的字串：{old!r}")
        sys.exit(1)
    patched_js = patched_js.replace(old, new)
print("   ✓ patch 完成")

# ==== 4. 注入 CSS / JS 到 HTML ==========================================
print("\n🧩 內嵌 CSS / JS 到 HTML …")
html2 = html

# 換 stylesheet
html2 = html2.replace(
    '<link rel="stylesheet" href="./style.css">',
    f'<style>\n{css}\n</style>'
)

# 換 script
html2 = html2.replace(
    '<script src="./game.js"></script>',
    f'<script>\n{bundle_js}{patched_js}\n</script>'
)

# 確認 link/script 都被替換掉
if './style.css' in html2 or './game.js' in html2:
    print("   ❌ 替換失敗，仍有外部引用殘留")
    sys.exit(1)
print("   ✓ HTML 整合完成")

# ==== 5. 寫出 ===========================================================
out_path = 'IdleEmpire.html'
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(html2)

size = os.path.getsize(out_path)
print(f"\n✅ 完成！輸出：{out_path}")
print(f"   檔案大小：{size/1024/1024:.2f} MB ({size:,} bytes)")
print(f"\n   下一步：把這個檔上傳取代 GeorgePai/PaiGame 的 IdleEmpire.html")
