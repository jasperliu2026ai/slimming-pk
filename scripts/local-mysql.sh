#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKSPACE_ROOT="$(cd "$PROJECT_ROOT/.." && pwd)"
MYSQL_HOME="${MYSQL_HOME:-$WORKSPACE_ROOT/.local/mysql-8.4.10-macos15-arm64}"
MYSQL_DATA="${MYSQL_DATA:-$WORKSPACE_ROOT/.data/mysql}"
PID_FILE="$MYSQL_DATA/mysql.pid"

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

case "${1:-status}" in
  start)
    if is_running; then
      echo "MySQL 已在 127.0.0.1:3306 运行"
      exit 0
    fi
    if [[ ! -x "$MYSQL_HOME/bin/mysqld" || ! -d "$MYSQL_DATA/mysql" ]]; then
      echo "没有找到已初始化的本地 MySQL，请先按 SETUP.md 完成安装。" >&2
      exit 1
    fi
    "$MYSQL_HOME/bin/mysqld" \
      --basedir="$MYSQL_HOME" \
      --datadir="$MYSQL_DATA" \
      --port=3306 \
      --bind-address=127.0.0.1 \
      --socket="$MYSQL_DATA/mysql.sock" \
      --pid-file="$PID_FILE" \
      --log-error="$MYSQL_DATA/mysql.err" \
      --daemonize
    echo "MySQL 已启动：127.0.0.1:3306"
    ;;
  stop)
    if ! is_running; then
      echo "MySQL 当前未运行"
      exit 0
    fi
    kill "$(cat "$PID_FILE")"
    for _ in {1..20}; do
      is_running || break
      sleep 0.25
    done
    echo "MySQL 已停止"
    ;;
  status)
    if is_running; then
      echo "MySQL 正在运行：127.0.0.1:3306 (PID $(cat "$PID_FILE"))"
    else
      echo "MySQL 当前未运行"
      exit 1
    fi
    ;;
  *)
    echo "用法：$0 {start|stop|status}" >&2
    exit 2
    ;;
esac
