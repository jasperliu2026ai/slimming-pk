# fitpk-server

「减肥 PK 小程序」后端服务脚手架（Express + TypeScript + Prisma）。

## 技术栈

| 项 | 选型 |
|---|---|
| 运行时 | Node.js LTS ≥ 18 |
| 语言 | TypeScript（strict） |
| 框架 | Express 4 |
| 参数校验 | Zod |
| ORM | Prisma（MySQL） |
| 日志 | Pino + pino-http |
| 鉴权 | JWT |
| 文档 | swagger-jsdoc + swagger-ui-express（`/docs`） |
| 测试 | Jest + supertest |
| 包管理 | pnpm |
| 部署 | PM2 / Docker / K8s |

## 目录结构

```
src/
  config/         env / logger / swagger 等基础设施
  middlewares/    错误处理、鉴权、traceId、参数校验
  routes/         路由（按业务模块拆分）
  controllers/    请求参数解析 + 返回体组装
  services/       核心业务逻辑（可测试的纯逻辑）
  models/         数据实体（Prisma client 封装、领域模型）
  validators/     Zod schema
  utils/          asyncHandler、AppError 等通用工具
  types/          全局类型扩展
prisma/           数据库 schema & migration
tests/            单测 & 接口测试
```

## 快速开始

```bash
# 1. 装依赖
pnpm install

# 2. 复制环境变量
cp env.example.txt .env
# 编辑 .env 里的 DATABASE_URL / JWT_SECRET 等

# 3. 生成 Prisma Client & 建表
pnpm prisma:generate
pnpm prisma:migrate

# 4. 启动开发
pnpm dev
```

启动后：
- API：`http://localhost:3000/api/v1/health`
- 文档：`http://localhost:3000/docs`

## 工程规范红线

- **TypeScript 严格模式**，禁止 `any` 兜底
- **接口契约先行**：写路由时同步补 `@openapi` 注释
- **参数校验统一走 Zod**：`validate(schema)` 中间件
- **异步 handler** 用 `asyncHandler` 包一层，或直接用 `express-async-errors`
- **业务错误** 抛 `AppError`，由全局错误中间件统一转 JSON
- **日志脱敏**：`token / password / openid / phone` 等敏感字段禁止落日志
- **金额** 一律用整数（分）存储，避免浮点
- **资金变动** 走 `FundLedger`（只增不改），对账依赖它
- **数据库变更** 走 Prisma migration，不手动改表

## 关键路径必须写单测

- 金额计算 / 结算 / 退款
- PK 状态机
- 打卡防作弊校验
- 鉴权 / 权限判断
