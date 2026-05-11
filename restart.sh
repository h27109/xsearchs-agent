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
        for _ in $(seq 1 10); do
            pids=$(lsof -ti :"$port" 2>/dev/null || true)
            [ -z "$pids" ] && break
            sleep 0.5
        done
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

    local i=0
    while [ $i -lt 30 ]; do
        if lsof -ti :"$port" >/dev/null 2>&1; then
            log "$name 已启动 (PID $(cat "$LOG_DIR/${name}.pid"))"
            return 0
        fi
        sleep 0.5
        i=$((i + 1))
    done
    log "$name 启动超时，请检查日志: $logfile"
    return 1
}

# ---------- 环境准备 ----------

log "========== 准备环境 =========="

# 1) Python 虚拟环境
if [ ! -f "$VENV_PY" ]; then
    log "创建 Python 虚拟环境 ..."
    python3 -m venv .venv
    log "安装 Python 依赖 ..."
    .venv/bin/pip install -e "." -q
else
    log "虚拟环境已存在，跳过"
fi

# 2) 前端依赖
if [ ! -d "web-ui/node_modules" ]; then
    log "安装前端依赖 ..."
    cd web-ui && npm install && cd "$SCRIPT_DIR"
else
    log "前端依赖已存在，跳过"
fi

# ---------- 主流程 ----------

log "========== 重启 xsearchs-agent =========="

kill_by_port 8090
kill_by_port 8091
kill_by_port 5173

sleep 1

start_service "manage" 8091 \
    "env PYTHONPATH=. $VENV_PY -u manage/main.py"

start_service "chat" 8090 \
    "env PYTHONPATH=. $VENV_PY -u chat/main.py"

cd "$SCRIPT_DIR/web-ui"
start_service "web-ui" 5173 \
    "npx vite --host 0.0.0.0"
cd "$SCRIPT_DIR"

log "========== 全部完成 =========="
log "  chat   : http://0.0.0.0:8090"
log "  manage : http://0.0.0.0:8091"
log "  web-ui : http://0.0.0.0:5173"
log "  日志目录: $LOG_DIR/"
