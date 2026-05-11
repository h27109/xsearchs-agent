#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# restart.sh - 重启 xsearchs-agent 三个服务
#   chat     对话后端 :8090
#   manage   管理后端 :8091
#   web-ui   前端     :5173
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

VENV_PY=".venv/bin/python3"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# ---------- 工具函数 ----------

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

kill_by_port() {
    local port=$1
    local pids
    pids=$(lsof -ti :"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        log "停止端口 $port 上的进程: $pids"
        echo "$pids" | xargs kill -15 2>/dev/null || true
        # 等待最多 5 秒
        for _ in $(seq 1 10); do
            pids=$(lsof -ti :"$port" 2>/dev/null || true)
            [ -z "$pids" ] && break
            sleep 0.5
        done
        # 还没停就强杀
        pids=$(lsof -ti :"$port" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -9 2>/dev/null || true
            log "端口 $port 强制终止"
        fi
    fi
}

start_service() {
    local name=$1
    local port=$2
    local cmd=$3
    local logfile="$LOG_DIR/${name}.log"

    log "启动 $name (端口 $port) ..."
    nohup $cmd > "$logfile" 2>&1 &
    echo $! > "$LOG_DIR/${name}.pid"

    # 等待端口就绪（最多 15 秒）
    local i=0
    while [ $i -lt 30 ]; do
        if lsof -ti :"$port" >/dev/null 2>&1; then
            log "$name 已启动 ✓ (PID $(cat "$LOG_DIR/${name}.pid"))"
            return 0
        fi
        sleep 0.5
        i=$((i + 1))
    done
    log "⚠ $name 启动超时，请检查日志: $logfile"
    return 1
}

# ---------- 主流程 ----------

log "========== 重启 xsearchs-agent =========="

# 1) 停止旧进程
kill_by_port 8090
kill_by_port 8091
kill_by_port 5173
kill_by_port 5174

sleep 1

# 2) 启动 manage（管理后端 :8091）
start_service "manage" 8091 \
    "env PYTHONPATH=. $VENV_PY -u manage/main.py"

# 3) 启动 chat（对话后端 :8090）
start_service "chat" 8090 \
    "env PYTHONPATH=. $VENV_PY -u chat/main.py"

# 4) 启动 web-ui-v2（前端 :5174）
cd "$SCRIPT_DIR/web-ui-v2"
start_service "web-ui" 5174 \
    "npx vite --host 0.0.0.0"
cd "$SCRIPT_DIR"

log "========== 全部完成 =========="
log "  chat   : http://0.0.0.0:8090"
log "  manage : http://0.0.0.0:8091"
log "  web-ui : http://0.0.0.0:5174"
log "  日志目录: $LOG_DIR/"
