# OpenClaw Agent 一键化配置指南（Simplaix Gateway + @simplaix/lobster-shell）

> 目标：让 OpenClaw agent 按本文档自动完成安装与配置；并在最后引导用户用手机完成 `/pair`。

## 适用场景

- 你希望 OpenClaw 自动部署 `simplaix/agent-gateway`
- 你希望通过命令安装 OpenClaw 插件：`@simplaix/lobster-shell`
- 你希望支持移动端审批（手机 App 配对）

---

## Agent 执行总流程（必须按顺序）

1. 拉取代码（GitHub）
2. 启动 PostgreSQL
3. 生成并写入 gateway `.env`
4. 安装依赖 + 数据库迁移
5. 启动 gateway server（3001）
6. 启动 gateway-app（3000）并登录拿 `ADMIN_JWT`
7. 注册 agent，拿 `runtime_token` (`art_xxx`)
8. seed 策略，拿 `providerId`
9. 用命令安装 OpenClaw 插件：`openclaw plugins install @simplaix/lobster-shell`
10. 写入 `~/.openclaw/openclaw.json`（`gatewayUrl` + `providerId` + `SIMPLAIX_AGENT_RUNTIME_TOKEN`）
11. 启动 Cloudflare tunnel（先 tunnel，后重启 gateway）
12. 向用户发送 `gateway-app` 地址 + `/pair` 操作引导

---

## 1) 拉取代码

```bash
git clone https://github.com/simplaix/agent-gateway.git
cd agent-gateway
```

---

## 2) 启动 PostgreSQL

```bash
docker compose up -d postgres
```

---

## 3) 配置 gateway `.env`

```bash
cp .env.example .env
```

至少保证这些值可用：

- `JWT_SECRET`（随机强字符串）
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `DATABASE_URL=postgresql://gateway:gateway@localhost:5432/gateway`
- `PORT=3001`

---

## 4) 安装依赖 + 迁移

```bash
pnpm install --config.auto-install-peers=false
pnpm db:generate   # 若 migrate 报缺 journal/meta，先 generate
pnpm db:migrate
```

---

## 5) 启动 gateway server

```bash
pnpm dev:server
```

健康检查：

```bash
curl http://localhost:3001/api/health
```

---

## 6) 启动 gateway-app（用于管理与登录）

```bash
cd gateway-app
cp .env.example .env
```

确保：

- `JWT_SECRET` 与根目录 `.env` 一致
- `JWT_ISSUER` 与根目录 `.env` 一致
- `GATEWAY_API_URL=http://localhost:3001`

启动：

```bash
pnpm dev
```

拿 `ADMIN_JWT`：

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"<ADMIN_PASSWORD>"}' | jq -r '.token'
```

---

## 7) 注册 agent（拿 runtime token）

> 注意：当前后端 schema 要求 `upstreamUrl` 必填。

```bash
curl -s -X POST http://localhost:3001/api/v1/admin/agents \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-lobster-agent",
    "upstreamUrl": "http://localhost:3001/api/v1/mcp/mcp",
    "description": "Lobster Shell agent with policy enforcement"
  }'
```

保存返回值：

- `agent.id`
- `runtime_token`（`art_xxx`，只显示一次）

---

## 8) Seed tool policies（拿 providerId）

```bash
ADMIN_JWT="$ADMIN_JWT" AGENT_ID="<agent.id>" bash seed-openclaw-policies.sh
```

保存输出的 `PROVIDER_ID`。

---

## 9) 安装 OpenClaw 插件（按要求使用 command）

```bash
openclaw plugins install @simplaix/lobster-shell
```

如果提示已存在同名目录：先备份/移走旧插件目录再安装。

---

## 10) 写入 OpenClaw 配置

编辑 `~/.openclaw/openclaw.json`，确保有以下配置：

```json
{
  "plugins": {
    "entries": {
      "lobster-shell": {
        "enabled": true,
        "config": {
          "gatewayUrl": "http://localhost:3001",
          "providerId": "<PROVIDER_ID>",
          "timeoutMs": 310000,
          "skipTools": []
        }
      }
    }
  },
  "env": {
    "vars": {
      "SIMPLAIX_AGENT_RUNTIME_TOKEN": "<art_xxx>"
    }
  }
}
```

> `gatewayUrl` 是必填；缺失会导致插件配置校验失败。

---

## 11) 先开 Cloudflare tunnel，再重启 gateway

```bash
cd <agent-gateway-root>
./scripts/dev-tunnel.sh
```

该脚本会写入：

- `GATEWAY_PUBLIC_URL=https://xxxx.trycloudflare.com`

然后**重启** gateway（让新 URL 生效）：

```bash
# 先停旧进程，再启动
pnpm dev:server
```

---

## 12) 交付给用户：管理入口 + 手机配对引导

### 12.1 告知用户管理入口

- 本地管理页：`http://localhost:3000`
- 若你有远程访问方案，也可以给用户远程可访问地址

### 12.2 引导用户手机 App 配对

给用户发以下文案：

1. 在 WhatsApp/Telegram 里给机器人发送：`/pair`
2. 机器人会返回一个 HTTPS 配对链接（`.../api/v1/auth/pair-link/...`）
3. 手机安装并打开 Simplaix Approval App
4. 点击配对链接，系统会跳转到 App 完成绑定
5. 绑定后，高风险工具（如 `exec`）会推送审批请求到手机

若用户收不到推送，检查：

- `GATEWAY_PUBLIC_URL` 是否为公网 HTTPS
- 是否已成功 `/pair`
- 服务端是否有 `No devices registered for user ...` 日志

---

## 验证清单（Agent 必做）

- [ ] `GET /api/health` 返回 healthy
- [ ] OpenClaw 日志出现：`[simplaix-gateway] Policy & Audit plugin initialized`
- [ ] 调用普通工具后有 `/tool-gate/evaluate` + `/tool-gate/audit`
- [ ] 调用高风险工具出现 `require_confirmation`
- [ ] 用户 `/pair` 能拿到可点击链接并在手机完成绑定

---

## 常见问题

### Q1: 为什么 endUser 不是手机号，而是 agentId？
因为当前请求上下文没有提供可解析的直聊 peerId（或没传 `X-End-User-Id`），Gateway 会回退到 agent 身份。

### Q2: 插件安装后报 duplicate/unsafe warning？
- duplicate：说明有旧同名插件目录，先移走再装
- unsafe warning：是静态风险提示，需要人工确认来源可信（官方 npm + 代码审计）

### Q3: `pnpm db:migrate` 报 meta/journal 缺失
先执行 `pnpm db:generate`，再 `pnpm db:migrate`。
