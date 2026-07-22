# 腾讯云服务器部署

本文适用于后端和 MySQL 运行在同一台腾讯云 Linux 服务器的场景。生产环境不使用本地演示数据，也不要把 `.env` 提交到 Git。

## 1. 准备 MySQL 数据库

登录服务器后进入 MySQL：

```bash
sudo mysql
```

创建生产数据库和独立账号。请把示例密码换成随机强密码：

```sql
CREATE DATABASE IF NOT EXISTS slimming_pk
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'slimming_pk'@'127.0.0.1'
  IDENTIFIED BY '替换为随机强密码';

GRANT ALL PRIVILEGES ON slimming_pk.*
  TO 'slimming_pk'@'127.0.0.1';

FLUSH PRIVILEGES;
EXIT;
```

MySQL 只需监听服务器本机 `127.0.0.1:3306`，不要向公网开放 3306 端口。

## 2. 拉取后端代码

服务器需要 Git、Node.js 20 和 pnpm。确认版本：

```bash
git --version
node --version
corepack enable
pnpm --version
```

首次部署：

```bash
sudo useradd --system --create-home --home-dir /var/lib/slimpk --shell /usr/sbin/nologin slimpk
sudo mkdir -p /opt/slimming-pk
sudo chown slimpk:slimpk /opt/slimming-pk
sudo -u slimpk git clone https://github.com/jasperliu2026ai/slimming-pk.git /opt/slimming-pk
sudo -u slimpk pnpm --dir /opt/slimming-pk install --frozen-lockfile
```

以后更新：

```bash
sudo -u slimpk git -C /opt/slimming-pk pull --ff-only origin main
sudo -u slimpk pnpm --dir /opt/slimming-pk install --frozen-lockfile
```

## 3. 配置生产环境

```bash
sudo -u slimpk cp /opt/slimming-pk/env.example.txt /opt/slimming-pk/.env
sudo chmod 600 /opt/slimming-pk/.env
sudo -u slimpk nano /opt/slimming-pk/.env
```

至少填写下面这些配置：

```dotenv
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

DATABASE_URL="mysql://slimming_pk:替换为数据库密码@127.0.0.1:3306/slimming_pk"
JWT_SECRET=使用_openssl_rand_hex_32_生成

WECHAT_APPID=微信小程序AppID
WECHAT_APPSECRET=微信小程序AppSecret

COS_SECRET_ID=腾讯云CAM子账号SecretId
COS_SECRET_KEY=腾讯云CAM子账号SecretKey
COS_BUCKET=database-1257734014
COS_REGION=ap-guangzhou
```

生成 JWT 密钥：

```bash
openssl rand -hex 32
```

如果数据库密码包含 `@`、`:`、`/`、`#`、`?` 等字符，需要先进行 URL 编码再写入 `DATABASE_URL`。

## 4. 建表和构建

```bash
sudo -u slimpk pnpm --dir /opt/slimming-pk prisma:generate
sudo -u slimpk pnpm --dir /opt/slimming-pk prisma:deploy
sudo -u slimpk pnpm --dir /opt/slimming-pk build
```

生产环境不要执行 `pnpm prisma:seed`，它只用于本地演示数据。

先前台验证：

```bash
sudo -u slimpk pnpm --dir /opt/slimming-pk start
```

另开一个终端检查：

```bash
curl http://127.0.0.1:3000/api/v1/health
```

返回数据中的 `status` 和 `database` 都应为 `ok`。

## 5. 注册 systemd 服务

仓库提供了 `deploy/slimming-pk.service` 模板。如果实际代码目录不是 `/opt/slimming-pk`，先修改模板中的路径。

```bash
sudo cp /opt/slimming-pk/deploy/slimming-pk.service /etc/systemd/system/slimming-pk.service
sudo systemctl daemon-reload
sudo systemctl enable --now slimming-pk
sudo systemctl status slimming-pk
```

查看实时日志：

```bash
sudo journalctl -u slimming-pk -f
```

每次更新代码后执行：

```bash
sudo -u slimpk git -C /opt/slimming-pk pull --ff-only origin main
sudo -u slimpk pnpm --dir /opt/slimming-pk install --frozen-lockfile
sudo -u slimpk pnpm --dir /opt/slimming-pk prisma:generate
sudo -u slimpk pnpm --dir /opt/slimming-pk prisma:deploy
sudo -u slimpk pnpm --dir /opt/slimming-pk build
sudo systemctl restart slimming-pk
curl http://127.0.0.1:3000/api/v1/health
```

后续再通过 Nginx 和 HTTPS 域名对外暴露 API。MySQL 仍保持只允许服务器本机访问。
