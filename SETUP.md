# SETUP.md - 本地初始化命令清单

第一次拉下这个脚手架后，按顺序执行下面的命令即可跑起来。

## 0. 前置

- Node.js ≥ 18（推荐 20 LTS）
- pnpm ≥ 8（`corepack enable && corepack prepare pnpm@latest --activate`）
- 本地 MySQL 8.x（当前 Mac 已在工作区安装官方 MySQL 8.4 LTS）
- 本地 Redis 6.x（可选，后续接入时才需要）

当前电脑启动、查看和停止本地 MySQL：

```bash
pnpm db:start
pnpm db:status
pnpm db:stop
```

MySQL 程序目录：`../.local/mysql-8.4.10-macos15-arm64`；数据目录：`../.data/mysql`。
它只监听 `127.0.0.1:3306`，不会对局域网或公网开放。

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

# 应用仓库中已有的 migration，并写入本地演示初始数据
pnpm prisma:deploy
pnpm prisma:seed
```

如果 `migrate dev` 报连不上库，先确认：
- MySQL 起来了
- `DATABASE_URL` 里的账号/密码/端口/库名正确
- 库 `slimming_pk` 已存在，且账号拥有迁移权限

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

## 8. 当前持久化范围

用户、PK 房间、成员关系、打卡记录和排行榜已通过 Prisma 接入 MySQL。排行榜不保存绝对体重，按数据库中的成员和打卡记录实时计算。支付模块仍未启用。

## 9. 腾讯云 COS

项目使用私有存储桶 `database-1257734014`（`ap-guangzhou`）。头像写入 `Avatar/`，打卡照片写入 `checkin/`，不会修改现有 `Static/` 内容。

在 `.env` 中填写 CAM 子账号的 `COS_SECRET_ID` 与 `COS_SECRET_KEY` 后重启后端。该子账号只需目标目录的 `cos:PutObject`、`cos:GetObject` 和 `cos:DeleteObject` 权限。小程序照片通过后端 `/api/v1/uploads/images` 上传，数据库只保存对象 Key；私有预览通过 `/api/v1/uploads/signed-url` 获取五分钟有效链接。
