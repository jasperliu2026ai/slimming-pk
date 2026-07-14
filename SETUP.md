# SETUP.md - 本地初始化命令清单

第一次拉下这个脚手架后，按顺序执行下面的命令即可跑起来。

## 0. 前置

- Node.js ≥ 18（推荐 20 LTS）
- pnpm ≥ 8（`corepack enable && corepack prepare pnpm@latest --activate`）
- 本地 MySQL 8.x（或用 Docker 起一个）
- 本地 Redis 6.x（可选，后续接入时才需要）

快速拉一个 MySQL（Docker）：

```bash
docker run -d --name fitpk-mysql \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=fitpk \
  -p 3306:3306 \
  mysql:8
```

## 1. 安装依赖

```bash
pnpm install
```

## 2. 配置环境变量

```bash
cp env.example.txt .env
# 打开 .env，至少改这三个：
#   DATABASE_URL   -> 你本地的 mysql 连接串
#   JWT_SECRET     -> 至少 16 位随机串（openssl rand -hex 32）
#   WECHAT_APPID / WECHAT_APPSECRET -> 联调时填，本地跑通不填也行
```

**注意**：项目根目录禁止提交 `.env` 到 git（`.gitignore` 已包含）。

## 3. Prisma 初始化

```bash
# 生成 Prisma Client（第一次和每次改 schema 后都要跑）
pnpm prisma:generate

# 应用首次 migration（会读 DATABASE_URL 建表）
pnpm prisma migrate dev --name init
```

如果 `migrate dev` 报连不上库，先确认：
- MySQL 起来了
- `DATABASE_URL` 里的账号/密码/端口/库名正确
- 库 `fitpk` 已存在（Prisma 会自动建，但账号要有 CREATE 权限）

## 4. 启动 dev server

```bash
pnpm dev
```

看到日志 `server listening on :3000` 就是好了。

自检：

```bash
curl http://localhost:3000/api/v1/health
# 期望: {"status":"ok",...}
```

接口文档：浏览器打开 `http://localhost:3000/docs`

## 5. 单测

```bash
pnpm test          # 跑一次
pnpm test:watch    # watch 模式
pnpm test:cov      # 带覆盖率
```

## 6. 构建 & 生产

```bash
pnpm build        # 编译到 dist/
pnpm start        # node dist/index.js
```

或者直接 Docker：

```bash
docker build -t fitpk-server:dev .
docker run --rm -p 3000:3000 --env-file .env fitpk-server:dev
```

## 7. 常见问题

| 症状 | 排查 |
|---|---|
| `JWT_SECRET must be at least 16 chars` | `.env` 里 `JWT_SECRET` 太短，换成 32 位随机串 |
| `PrismaClientInitializationError` | 检查 `DATABASE_URL` 和 MySQL 是否起来 |
| `EADDRINUSE :::3000` | 3000 端口被占，改 `.env` 里 `PORT` |
| Swagger `/docs` 404 | 确认 `NODE_ENV` 和路由前缀 `/api/v1` 没被改 |
| husky prepare 失败 | 首次没有 `.git` 或 husky 没装，忽略即可（`|| true` 已兜底） |

## 8. 下一步

脚手架里以下模块目前是 stub / TODO，按优先级推进：

1. `src/services/user.service.ts`：接入真实微信 `code2session` + Prisma 落库
2. `src/routes/pk.route.ts`：按 `docs/pk-state-machine.md` 实现房间状态机
3. `src/routes/checkin.route.ts`：打卡+防作弊
4. `src/routes/payment.route.ts`：押金/结算/退款（依赖 PK 状态机）
