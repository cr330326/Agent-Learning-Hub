#!/usr/bin/env bash
#
# Agent Learning Hub · 一键启动本地学习网站
#
#   ./start-site.sh                # 校验 → 起服务 → 开浏览器
#   ./start-site.sh --port 9000    # 换端口
#   ./start-site.sh --no-open      # 不自动开浏览器
#   ./start-site.sh --no-audit     # 跳过路径校验
#
# 服务必须从**仓库根目录**起：阅读器按 ../local-courses/ 取 Markdown，
# 从 learning-site/ 里起服务会让整个课程目录落在 document root 之外。
# 直接双击 index.html（file://）同样不行，fetch() 会被跨域策略拦下。
#
# Ctrl-C 停止。

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8765
OPEN_BROWSER=1
RUN_AUDIT=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)     PORT="${2:?--port 需要一个端口号}"; shift 2 ;;
    --port=*)   PORT="${1#*=}"; shift ;;
    --no-open)  OPEN_BROWSER=0; shift ;;
    --no-audit) RUN_AUDIT=0; shift ;;
    -h|--help)  sed -n '3,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          echo "未知参数：$1（--help 看用法）" >&2; exit 2 ;;
  esac
done

command -v python3 >/dev/null || { echo "找不到 python3" >&2; exit 1; }

# --- 1. 校验路径 ----------------------------------------------------------
# 目录改名后 data.js 会整片失效，而且页面不报错，只有点开某一章才 404。
# 所以每次启动先跑一遍，把「点开才发现」提前到「启动就知道」。
if [[ $RUN_AUDIT == 1 ]]; then
  echo "▸ 校验课程路径…"
  if ! (cd "$REPO/learning-site" && python3 scripts/audit_paths.py); then
    echo
    echo "⚠️  有路径失效，站点仍会启动，但上面列出的章节会 404。"
    echo "   修 learning-site/data.js 里对应的字符串即可。"
  fi
  echo
fi

# --- 2. 挑一个可用端口 ----------------------------------------------------
port_busy() { python3 -c "
import socket,sys
s=socket.socket()
try: s.bind(('127.0.0.1',int(sys.argv[1]))); sys.exit(1)
except OSError: sys.exit(0)
finally: s.close()
" "$1"; }

ORIGINAL_PORT=$PORT
while port_busy "$PORT"; do
  if [[ $PORT -ge $((ORIGINAL_PORT + 10)) ]]; then
    echo "端口 $ORIGINAL_PORT–$PORT 都被占用了，用 --port 指定一个空闲端口。" >&2
    exit 1
  fi
  PORT=$((PORT + 1))
done
[[ $PORT != "$ORIGINAL_PORT" ]] && echo "▸ 端口 $ORIGINAL_PORT 被占用，改用 $PORT"

URL="http://localhost:${PORT}/learning-site/"

# --- 3. 起服务 ------------------------------------------------------------
cd "$REPO"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
# Ctrl-C 或异常退出都要收掉子进程，否则端口会一直被占着
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 40); do
  port_busy "$PORT" && break
  sleep 0.1
done
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "服务没起来。手动试试：python3 -m http.server $PORT" >&2
  exit 1
fi

echo "▸ 学习网站已启动"
echo
echo "   $URL"
echo
echo "   Ctrl-C 停止"

# --- 4. 开浏览器 ----------------------------------------------------------
if [[ $OPEN_BROWSER == 1 ]]; then
  if command -v open >/dev/null; then open "$URL"
  elif command -v xdg-open >/dev/null; then xdg-open "$URL" >/dev/null 2>&1
  fi
fi

wait $SERVER_PID
