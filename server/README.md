# ModelCompare data services

## Local development

```bash
cd server
npm install
npm run db:generate
npm run db:push
npm run sync
npm run api
```

Copy `.env.example` to `.env` and fill in the external credentials before
starting a persistent environment. Authentication requires PostgreSQL: an
invite code creates or reuses one anonymous user per code, so recommendation
history and feedback remain isolated without storing any profile data. The
local knowledge-source management page continues to read `rag-knowledge.json`
when PostgreSQL is unavailable.

In a second terminal, run the web application:

```bash
cd ../web
npm install
npm run dev
```

Open `http://localhost:3000/modelcompare`. The web application reads the
current `prototype/` assets and calls the API at `http://localhost:3456` during
local development.

The independent worker runs continuously with `npm run worker`. It schedules its work in the `Asia/Shanghai` timezone: model catalog at 03:00, official source snapshots at 03:30, reviewed SuperCLUE import at 03:45, and a full pricing refresh every third day at 04:00.

## Persistent environment handoff

To enable PostgreSQL persistence, provide a reachable PostgreSQL 16+ connection
string as `DATABASE_URL`, then run `npm run db:generate` and `npm run db:push`.
Generate a registered user/admin invite with `npm run invite:generate -- user`
or `npm run invite:generate -- admin`; the command prints the plaintext once.
You can also create further invites through `POST /admin/invites`. An invite receives a fixed three-day expiry when it is
first used; logging in again does not extend that deadline. Bootstrap codes are
only a migration/recovery path and follow the same expiry rule. Keep all real
codes only in `server/.env` or deployment secrets; generated codes are returned
only once by the creation endpoint.

## Anonymous-account migration

For an existing installation with email/password users, run this one-off command
before deployment:

```bash
npm run db:migrate:anonymous
```

It writes a timestamped JSON backup under `server/backups/`, deletes the old
users plus sessions, recommendation history, feedback and whitelist rows, then
applies the anonymous-user schema. Do not add this command to a container
startup command: it is intentionally destructive and must be run explicitly.

## Evaluation authentication and quotas

`POST /auth/invite` accepts a generated or bootstrap `inviteCode` and issues an
HttpOnly session cookie that cannot outlive the invite's fixed three-day window
from its first successful login. The configured `ADMIN_INVITE_CODES` bootstrap
administrator credential is the exception: it never expires. Invalid/expired
codes, cross-site writes and excessive login attempts are rejected.
User invite attempts are limited to ten per IP address in ten minutes;
administrator invites are not subject to this login limit.
Direct API clients must authenticate with a valid invite too; an HTTP API cannot
distinguish an authorized script from an authorized browser by headers alone.

`POST /evaluations` requires the session cookie and a JSON body containing
`inviteCode`, `type`, `promptId`, `modelAId`, and `modelBId`. The invite must match
the session owner. Quotas are shared by all non-admin sessions using the same
invite and are reserved atomically before provider calls. Administrator accounts
are exempt from text and image evaluation quotas.
Each two-model evaluation counts once against its type's daily limit in
Asia/Shanghai. Accepted generation attempts count even if a provider fails;
authentication, validation and quota rejections do not consume a slot.

The first three enabled scenarios of each supported type are available, sorted
by sort order, creation date and ID. Older scenarios remain stored for history
but cannot be submitted directly. Image evaluations call MiniMax Image-01 and Image-01 Live
through the MiniMax `image_generation` endpoint and Doubao Seedream 4.0 / 4.5 through the
Volcengine Ark `images/generations` endpoint on each submission; uploaded legacy
assets are not used. Configure `MINIMAX_API_KEY` and optionally `MINIMAX_IMAGE_BASE_URL`
(default: `https://api.minimax.cn/v1`) for MiniMax, and
`DOUBAO_API_KEY` / `DOUBAO_BASE_URL` (default: `https://ark.cn-beijing.volces.com/api/v3`)
for Doubao. Generated URLs are supplied by
the providers and may expire; permanent image archiving is not implemented.

The web client keeps the entered invite in this tab's sessionStorage and clears
it on logout. Existing sessions without a saved invite must log in again.
For allowed cross-origin browser clients configure `CORS_ORIGINS`; reverse
proxies must overwrite public forwarding headers. Keep proxy read timeouts
above the 120-second image-generation timeout.

Run `npm run test:evaluation` from `server/`. This uses a temporary PostgreSQL
database (the database role needs CREATEDB), local mock model endpoints, and
cleans up the test database; it does not spend provider credits or alter
existing application data.

## Commercial data sources

Refresh only OpenAI models with `npm run sync -- --type=catalog --vendor=openai`.
This preserves other vendors' data, visibility and sort settings. The web model
picker loads every API page so catalogs larger than 100 models are not truncated.
For an existing installation whose vendor sort numbers are all zero, run
`node initialize-vendor-order.js` once to number the current admin order from 1.
It leaves an already configured order unchanged.

Vendor management groups visible vendors before hidden vendors. Hold a drag
handle or vendor name and drag to reorder within its group (touch: hold 250 ms), or use arrow keys (Home/End move
to the group boundary). Visibility changes and reorders save automatically via
`PATCH /admin/vendors`, which validates the complete unique vendor list and
writes consecutive positions in one transaction. The comparison picker is
refreshed after saving. No saved-status button is displayed. On failure, an inline
message explains whether to adjust again to retry saving or refresh the page.

- API price cards and subscription plans are separate database entities. Do not put subscription prices into API token-rate items.
- The first sync persists OpenRouter's public catalog as an explicitly labelled aggregator price source. Official provider pages are registered and snapshotted for audit; parsed values must be reviewed before becoming official price cards.
- SuperCLUE has no stable public result API. Put a reviewed export at `server/data/superclue-results.json` (use the example file as the contract), then run `npm run sync -- --type=superclue`. The UI only labels actual SuperCLUE records with `数据来源：SuperCLUE`.

## 2026-10-08 本地迭代

规则与成本、Jev 文本辅助评分队列和选型快照已实现。Jev 默认关闭。2026-10-10 按用户要求删除 Jev 免费额度核验与预算上限；配置服务端密钥及 JEV_MODE 即可启用辅助评分。可通过 POST/GET /evaluations/:id/score 操作自己的已保存文本评测，GET /recommendations 读取当前用户分页历史。评分不会覆盖人工 judgment，环境变量不能单独开启推荐排名信号。

本轮保留 JSON 知识源为实际检索来源，/admin/knowledge 的状态操作写入同一 JSON 文件。完整说明、非破坏性迁移、验证条件及测试证据见 ../开发记录-2026-10-08.md。

新增本地验收：npm run test:rules、npm run test:iteration、npm run test:frontend。集成测试需要本机 PostgreSQL 创建临时数据库的权限；浏览器测试需要本地前端运行于 3000。测试使用模拟模型服务，不产生真实模型费用。

本地启动：`npm run dev:local`；状态：`node ../scripts/local-dev.mjs status`；停止：`npm run dev:local:stop`。生成评测使用用户现有配置；用户于 2026-10-10 进一步要求解除并删除 Jev 额度限制。此入口设置 `MODEL_COMPARE_GENERATION_MODE=configured`，保留生成提供商现有环境变量与 `.env` 凭据，Jev 使用现有 JEV_MODE（默认 off），启动入口不再覆盖该配置；不修改原有 .env。入口为 http://127.0.0.1:3000/modelcompare，标注页为 http://127.0.0.1:3000/modelcompare/annotation.html。标注验收：`npm run test:annotation`。Jev 配置、独立验证数据和命令见 ../validation/jev/README.md；本次记录见 ../开发记录-2026-10-10.md。

评测配置接口返回各厂商可用状态；凭据缺失时，页面说明原因并禁用提交，服务端在预留每日次数和任何模型调用前检查双方配置。`MODEL_COMPARE_GENERATION_MODE=free_only` 仍可用于禁止未核实免费额度的生成调用，但当前本地启动按用户确认使用 `configured`；单纯有密钥不能证明拥有免费额度。提示词保存后同步刷新管理、推荐与评测页面；返回推荐页也重新加载，并禁用提示词接口缓存及忽略过期响应，保留已选场景。

Jev 凭据兼容 `TYPESAFE_API_KEY`、`jev_key` 和 `JEV_KEY`，优先使用非空的 `TYPESAFE_API_KEY`；线上队列与离线验证使用相同读取规则。额度核验与预算上限代码已删除，密钥与模式检查仍保留，不自动开启推荐排名。2026-10-10 已通过一次真实评分测试（HTTP 200），固定模型 `jev-1.13.0` 可用。历史账本列仅为兼容既有数据而保留，费用估算不用于拦截调用；无需数据删除或数据库迁移。

用户确认的 A 组 10 条提示词位于 `prompts/evaluation-presets.js`。已有库不会通过读取或启动自动覆盖管理员文案；`node apply-evaluation-presets.js` 只读检查，`npm run prompts:apply-local` 备份后事务更新同名、同类型的 10 条现有本地场景，保留 ID、排序与启用状态。正式导出使用 `npm run prompts:export`，不带 `--sync`。推荐/测评/管理页展示全部已启用场景，使用摘要与折叠全文；展示验收：`npm run test:prompt-display`。
