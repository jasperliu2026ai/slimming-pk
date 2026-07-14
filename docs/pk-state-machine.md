# PK 房间状态机设计（v0.1 draft）

> 作者：斯斯【后端】
> 状态：**草稿，待产品/前端 review**
> 关联：`prisma/schema.prisma`（本文档定稿后新增 `PkRoom` / `PkMember` / `PkSettlement` 三张表）

---

## 一、为什么先做这个

PK 房间是整个减肥小程序的**业务骨架**：
- 打卡数据要归属到"某个用户在某个房间的某一天"
- 押金/结算/退款完全依赖房间生命周期
- 排行榜、消息推送、防作弊策略都要基于状态判断

所以先把状态机定死，后面所有模块围绕它展开。

---

## 二、房间生命周期状态

7 个状态，1 个终态族：

```
        create                      start(auto/manual)
   ┌─────────────┐   join/leave    ┌──────────────┐
   │  DRAFT      │ ─────────────►  │  RECRUITING  │
   │ (草稿)      │                 │  (报名中)    │
   └─────────────┘                 └──────┬───────┘
         │ owner cancel                    │
         │                          ready & 到开始时间
         ▼                                 ▼
   ┌─────────────┐                 ┌──────────────┐
   │  CANCELLED  │                 │   RUNNING    │
   │  (已取消)   │                 │  (进行中)    │
   └─────────────┘                 └──────┬───────┘
                                          │ 到结束时间
                                          ▼
                                   ┌──────────────┐
                                   │  SETTLING    │
                                   │  (结算中)    │
                                   └──────┬───────┘
                                          │ 结算完成
                                          ▼
                                   ┌──────────────┐
                                   │  SETTLED     │  ◄── 终态
                                   │  (已结算)    │
                                   └──────────────┘

  异常分支：任何非终态 → ABORTED（人工介入终止，比如系统故障/风控冻结）
```

**状态定义**：

| 状态 | 语义 | 是否可打卡 | 押金状态 |
|---|---|---|---|
| DRAFT | 房主创建但未发布 | 否 | 未收 |
| RECRUITING | 已发布，等成员加入并交押金 | 否 | 待收/部分收 |
| RUNNING | 达到开始条件，进入 PK 周期 | ✅ 是 | 已托管 |
| SETTLING | 到期，正在计算胜负和分账 | 否 | 冻结 |
| SETTLED | 结算完成，奖金已分配 | 否 | 已释放 |
| CANCELLED | 未开始前主动取消 | 否 | 全额退回 |
| ABORTED | 异常终止（罕见） | 否 | 按规则退 |

---

## 三、状态转移矩阵

| From \ Trigger | create | join | leave | ready | tick(cron) | settle_done | cancel | abort |
|---|---|---|---|---|---|---|---|---|
| (nil) | → DRAFT | - | - | - | - | - | - | - |
| DRAFT | - | - | - | → RECRUITING | - | - | → CANCELLED | → ABORTED |
| RECRUITING | - | RECRUITING | RECRUITING | - | → RUNNING(达开始时间) | - | → CANCELLED | → ABORTED |
| RUNNING | - | ❌ | ❌(见规则) | - | → SETTLING(达结束时间) | - | ❌ | → ABORTED |
| SETTLING | - | ❌ | ❌ | - | - | → SETTLED | ❌ | → ABORTED |
| SETTLED | - | - | - | - | - | - | - | - |
| CANCELLED / ABORTED | - | - | - | - | - | - | - | - |

**转移入口**：
- `create`：POST `/pk/rooms` → 房主
- `ready`：POST `/pk/rooms/:id/publish` → 房主，从 DRAFT 到 RECRUITING
- `join / leave`：POST `/pk/rooms/:id/join` / `/leave` → 成员
- `tick`：定时任务扫描（node-cron，1min 一次）
- `settle_done`：结算 job 完成回写
- `cancel`：房主在 DRAFT/RECRUITING 阶段主动取消
- `abort`：**运营后台**触发，需二次确认（走 SAFETY.md 生产操作流程）

---

## 四、几个必须提前拍死的规则

### 4.1 什么时候进入 RUNNING？

两种方案，**倾向方案 A**：

- **方案 A（推荐）**：房主设定 `startAt`，`tick` 定时任务扫到 `startAt <= now && 人数 >= minMembers && 全员已交押金`，自动切 RUNNING。人数不够或有人没交押金 → 自动 CANCELLED，全额退款。
- 方案 B：房主手动点"开始"。**问题**：房主拖延、忘记点，用户体验差。

### 4.2 RUNNING 中途能不能退赛？

**倾向：不能**，一旦 RUNNING：
- 押金不退（进入奖金池）
- 该用户后续算作"失败"参与结算
- 前端灰掉退出按钮

理由：允许中途退赛 → 作弊/骚扰空间大 + 结算规则爆炸复杂。

### 4.3 结算规则（MVP 版）

**目标达成判定**（每个成员独立判断）：
- 减重目标：`(初始体重 - 最后 7 天平均体重) / 初始体重 >= 目标百分比` → 成功
- 打卡完成率：`实际打卡天数 / 周期天数 >= 80%` → 有效参与
- 两个条件都满足 → **成功者**；否则 → **失败者**

**分账**（金额单位：分）：
- 奖金池 = ∑失败者押金 × (1 - 平台抽成率)
- 每个成功者拿到：`自己的押金 + 奖金池 / 成功者人数`
- 全员失败：押金按平台规则处理（待产品定：全额退 or 全额没收 or 沉淀到下一期）
- 全员成功：各自拿回押金，无奖金

**平台抽成率**：MVP 先写死 5%，后续配置化。

### 4.4 幂等 & 并发

- 所有状态转移操作走 **`(room_id, from_state)` 乐观锁**：`UPDATE ... WHERE state = ? AND id = ?`，rowCount=0 则拒绝。
- 结算 job 用 **Redis 分布式锁** `lock:pk:settle:{roomId}`，TTL 60s。
- 结算流水按 `(roomId, userId, "settle")` 唯一索引 → 天然幂等。

### 4.5 定时任务节奏

| 任务 | 频率 | 做什么 |
|---|---|---|
| `pk-tick` | 每分钟 | 扫 RECRUITING/RUNNING 到点的房间，推进状态 |
| `pk-settle` | 由 tick 触发 | 单房间结算 job，异步跑 |
| `pk-recruit-timeout` | 每 10 分钟 | 扫 RECRUITING 超时未成团的，CANCELLED + 退款 |
| `pk-remind` | 每天 9:00 / 20:00 | 提醒 RUNNING 房间的用户打卡 |

---

## 五、数据模型（待落到 Prisma）

```prisma
enum PkRoomState {
  DRAFT
  RECRUITING
  RUNNING
  SETTLING
  SETTLED
  CANCELLED
  ABORTED
}

enum PkMemberState {
  JOINED          // 已加入未交押金
  DEPOSITED       // 已交押金
  ACTIVE          // RUNNING 中
  SUCCEEDED       // 结算：成功
  FAILED          // 结算：失败
  QUIT            // 弃赛（如果开放）
}

model PkRoom {
  id             String       @id @default(cuid())
  ownerId        String
  title          String       @db.VarChar(60)
  rule           Json         // 目标百分比/周期天数/最少人数等
  depositCent    Int          // 入场押金（分）
  minMembers     Int          @default(2)
  maxMembers     Int          @default(10)
  startAt        DateTime
  endAt          DateTime
  state          PkRoomState  @default(DRAFT)
  platformFeeBps Int          @default(500) // 5% = 500bps
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  members        PkMember[]
  settlement     PkSettlement?

  @@index([state, startAt])
  @@index([state, endAt])
  @@index([ownerId, createdAt])
}

model PkMember {
  id             String        @id @default(cuid())
  roomId         String
  userId         String
  state          PkMemberState @default(JOINED)
  initialWeight  Decimal?      @db.Decimal(5, 2)  // 加入时基础体重
  finalWeight    Decimal?      @db.Decimal(5, 2)  // 结算时最后 7 天均值
  checkinDays    Int           @default(0)
  depositCent    Int           // 该成员实际入池押金
  payoutCent     Int?          // 结算时应得金额
  joinedAt       DateTime      @default(now())
  settledAt      DateTime?

  room           PkRoom        @relation(fields: [roomId], references: [id])

  @@unique([roomId, userId])
  @@index([userId, state])
}

model PkSettlement {
  id              String    @id @default(cuid())
  roomId          String    @unique
  poolCent        Int       // 奖金池总额
  feeCent         Int       // 平台抽成
  successCount    Int
  failCount       Int
  detail          Json      // 每人分账明细快照
  settledAt       DateTime  @default(now())

  room            PkRoom    @relation(fields: [roomId], references: [id])
}
```

---

## 六、待用户/产品确认的问题

1. **中途退赛策略**：是否严格禁止？（我倾向禁止）
2. **全员失败**：押金全额退 / 全额没收 / 结转下期？
3. **平台抽成率**：5% 合理吗？是否需要按房间规模阶梯？
4. **"最后 7 天均值"** vs **"结算日单次称重"**：哪个更防作弊？（我倾向前者）
5. **打卡完成率门槛**：80% 合理还是要放宽/收紧？
6. **房间可见性**：公开 / 邀请码 / 好友限定，三选一还是都支持？
7. **单用户同时参加房间数上限**：不限 / 1 个 / 3 个？

以上问题**建议一次对齐**，避免后续状态机反复改。

---

## 七、下一步

拿到上面 7 个问题的答案后：
1. 落 Prisma 表结构 + migration
2. 实现 `pk.service.ts` 状态机核心（`transition(room, event)`）
3. 实现 REST 接口 + Zod schema
4. 单测覆盖：**所有非法状态转移必须被拒绝**
5. 定时任务 + 结算 job
