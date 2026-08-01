#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "$0")/.." && pwd))}"
BRANCH="${DEPLOY_BRANCH:-main}"
SERVICE="${DEPLOY_SERVICE:-slimming-pk}"
HEALTH_URL="${DEPLOY_HEALTH_URL:-http://127.0.0.1:3000/api/v1/health}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/slimming-pk-deploy.lock}"

log() {
  printf '[deploy] %s\n' "$*"
}

fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null || fail 'git 未安装'
command -v curl >/dev/null || fail 'curl 未安装'
command -v systemctl >/dev/null || fail 'systemctl 不可用'
command -v flock >/dev/null || fail 'flock 不可用'
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null || fail '非 root 部署需要 sudo'
  sudo -n true >/dev/null 2>&1 || fail '部署用户没有免密 sudo 权限'
fi

exec 9>"$LOCK_FILE"
flock -n 9 || fail '已有部署任务正在执行'

cd "$APP_DIR"
test -f .env || fail "$APP_DIR/.env 不存在"
test -f package.json || fail '当前目录不是后端项目'

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail '服务器存在未提交的代码修改，为避免覆盖已停止部署'
fi

if command -v pnpm >/dev/null 2>&1; then
  PKG=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  corepack pnpm --version >/dev/null
  PKG=(corepack pnpm)
else
  fail 'pnpm 未安装，请先执行：corepack enable'
fi

run_script() {
  "${PKG[@]}" run "$1"
}

restart_service() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl restart "$SERVICE"
  else
    sudo -n systemctl restart "$SERVICE"
  fi
}

service_status() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl is-active "$SERVICE"
  else
    sudo -n systemctl is-active "$SERVICE"
  fi
}

show_logs() {
  if [ "$(id -u)" -eq 0 ]; then
    journalctl -u "$SERVICE" -n 80 --no-pager || true
  else
    sudo -n journalctl -u "$SERVICE" -n 80 --no-pager || true
  fi
}

log "拉取 origin/$BRANCH"
git fetch origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"

log '安装锁定版本依赖'
CI=1 "${PKG[@]}" install --frozen-lockfile

log '生成 Prisma Client'
run_script prisma:generate

log '编译后端（编译失败不会重启现有服务）'
run_script build

log '应用数据库迁移'
run_script prisma:deploy

log "重启 $SERVICE"
restart_service

log '等待健康检查'
for attempt in $(seq 1 20); do
  if response="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null)" &&
    printf '%s' "$response" | grep -q '"status":"ok"' &&
    printf '%s' "$response" | grep -q '"database":"ok"'; then
    service_status
    log "部署成功：$(git rev-parse --short HEAD)"
    printf '%s\n' "$response"
    exit 0
  fi
  sleep 1
done

show_logs
fail "服务重启后健康检查失败：$HEALTH_URL"
