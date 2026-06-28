# cloud-mail 项目 Skill

## 项目身份和仓库结构

这是 `cloud-mail` 二开项目的通用 AI 工作说明，供 Codex、Claude、Cursor 或其他 AI 助手在本仓库内开发、排查、整理文档、提交前检查或协助部署时读取。

- 本地工作区根目录：`D:\学习\项目\cloud-mail`。
- 前端：`mail-vue/`，技术栈为 Vue 3、Vite、Pinia、Element Plus。
- Worker 接口：`mail-worker/`，基于 Cloudflare Workers、Hono、D1、KV、R2。
- 主要工作分支：`dev`。
- 远端：`origin` 是用户自己的 GitHub fork：`git@github.com:GeneralPeople1970/cloud-mail.git`。
- 旧上游项目名、旧 Codex skill 名和旧本地路径不要重新引入到文档、提示词或代码注释中。

## 默认开发流程

开始任何代码或文档任务前，先确认当前状态：

```bash
git status --short --branch
git remote -v
```

默认规则：

- 除非用户明确要求其他分支，否则在 `dev` 上工作。
- 先看现有实现，再决定改法。优先用 `rg` 查找路由、接口、状态、服务、国际化键和设置项。
- 选择能满足需求的最小增量方案。
- 保持改动小、可审查，并且只服务于当前任务。
- 不要回退或覆盖用户已有改动；遇到不相关的脏工作区改动时只忽略，不要清理。
- 提交或推送前检查密钥、配置和暂存文件，确认只包含有意改动。

优先选择：

- 新增 Vue 组件、页面、请求模块、状态模块或工具函数。
- 新增 Worker 接口路由、服务封装或独立辅助函数。
- 功能开关、可选设置和适配函数。
- 在稳定注册点做小范围集成改动。

尽量避免：

- 重写服务、实体定义、安全、认证、JWT、邮件解析/发送、初始化/迁移逻辑或路由架构。
- 重命名公共函数、接口路径、实体字段、存储键或被广泛使用的国际化键。
- 格式化无关文件。
- 把依赖升级混入功能开发。

如果必须修改核心逻辑，先说明原因，隔离改动，并保持差异最小。

## 二开功能约束

以下内容是 `cloud-mail` fork 的二开行为，不是上游默认行为。继续开发时要保留这些能力，后续改动尽量采用增量方式。

### README 和上游引用

- README 简介在相关场景下应说明本 fork 增加的能力。
- `README.md` 和 `README-en.md` 顶部的 GitHub shields 徽章块、Trendshift 徽章和链接已经移除。
- 除非用户明确要求，不要恢复上游宣传徽章、Trendshift 链接或上游项目入口。
- 如果用户要求清理上游链接，在删除版本发布、社区入口等应用内功能按钮前，先确认用户指的是只清理 README，还是也要清理应用界面。

### 随机邮箱

- 前端入口：侧边栏路由 `/random-email`，普通用户可见，位置在星标和设置之间。
- 相关前端文件：`mail-vue/src/views/random-email/index.vue`、`mail-vue/src/request/random-email.js`，以及路由、侧边栏、`zh.js` / `en.js` 中的注册和国际化改动。
- 相关 Worker 文件：`mail-worker/src/api/random-email-api.js`、`mail-worker/src/service/random-email-service.js`，以及 `mail-worker/src/hono/webs.js` 中的路由注册。
- `randomEmailSubdomains` 保存可选中间段，例如 `edu`；默认必须为空，让部署实例由管理员自行配置。
- `randomEmailLength` 默认值为 `10`。
- `randomEmailMode` 默认值为 `alnum`，表示字母和数字。
- 随机地址格式为 `randomLocal@baseDomain` 或 `randomLocal@middle.baseDomain`。
- 随机地址生成由后端负责。使用 `/randomEmail/generate`，让生成过的地址能记录到配额统计中；不要把持久化用户流程退回到纯前端随机生成。
- 随机邮箱基础域名由 `randomEmailDomainSource`（`cloudflare` / `custom`）和 `randomEmailDomainList` 控制。自定义列表只能选择 Cloudflare/系统域名；空自定义列表回退到 Cloudflare 域名。
- 随机邮箱页面、后端生成、随机收件箱列表校验、分享链接地址校验必须使用同一套解析后的随机邮箱域名列表。普通用户还要应用角色域名权限；管理员不受角色过滤。
- 基于角色的随机邮箱配额字段是 `role.random_email_count`；`0` 表示不限量。生成记录按 `user_id + address` 写入 `random_email_record`。再次查看或分享已经生成过的地址不能重复消耗配额。
- 随机邮箱页面必须显示剩余配额，格式为不限量或剩余/总数。
- 随机收件箱接口必须要求登录，但不能要求管理员权限。
- 不允许用随机收件箱访问已注册账号。
- 随机邮箱列表保持只读：不提供星标、复选框、批量删除或详情删除操作。
- 如果本地测试向 D1 写入了 `edu` 这类示例中间段，报告部署默认值前必须清理。

部署说明：随机邮箱新增了设置表字段。新部署或升级已有部署后，运行一次现有 `/api/init/<jwt_secret>` 初始化接口，让 D1 获得新字段并刷新 KV 设置。

### 邮件分享链接

- 公开分享路由：`/share/:token`，无需登录，并且绕过登录守卫。
- 相关 Worker 文件：`mail-worker/src/api/email-share-api.js`、`mail-worker/src/service/email-share-service.js`、`mail-worker/src/entity/email-share-link.js`、`mail-worker/src/entity/email-share-visit.js`。
- 相关前端文件：`mail-vue/src/components/email-share-dialog/index.vue`、`mail-vue/src/views/shared-email/index.vue`、`mail-vue/src/views/share/index.vue`、`mail-vue/src/request/email-share.js`。
- 链接使用高熵令牌；D1 只保存令牌哈希。明文链接只在生成或重置后立即可见，并按分享 ID 缓存在浏览器 localStorage 中，方便用户查看。
- 分享链接支持基于账号和基于地址两种范围。注册账号分享按 `account_id` 查询；随机/未注册内部地址分享按精确 `to_email` 查询。
- 分享管理页使用表格选择加顶部工具栏批量操作。除非用户明确要求，不要恢复行内操作按钮。
- 分享管理页每行显示 `emailCount`。这个数量必须符合公开分享的可见规则：只统计收件、未删除、不是 `SAVING` 状态，并且限制在该分享账号/地址范围内。
- 打开次数存储在 `email_share_link.open_count`；`email_share_visit` 对同一 IP 做 1 小时去重。
- 管理员全部邮件批量分享只在选中行后显示分享操作，行为与删除按钮一致。

部署说明：分享链接新增或调整了 D1 表。部署后运行 `/api/init/<jwt_secret>`，确保 `email_share_link`、`email_share_visit` 以及兼容字段/索引存在。

### 登录/注册域名展示

- 系统设置包含 `authDomainSource`（`cloudflare` / `custom`）和 `authDomainList`。
- `domainList` 仍然代表 Cloudflare/系统域名列表，不能挪作他用。
- 登录/注册页使用 `loginRegisterDomainList`；自定义认证域名只控制认证页面展示，不改变注册校验、角色权限、随机邮箱或收信行为。
- 自定义认证域名必须从已配置的 Cloudflare/系统域名中选择。空自定义列表回退到 Cloudflare 域名。

部署说明：认证域名展示新增了设置字段。部署后运行 `/api/init/<jwt_secret>`。

### 收件箱账号侧边栏

- 账号侧边栏在真实账号上方有一个虚拟全部邮件卡片。它设置 `accountId = -1` 和 `allReceive = 1`，账号列表首次加载后默认选中，在收件箱显示为 `全部收件`，在发件箱显示为 `全部发件`。
- 收件箱和发件箱视图应使用 `accountStore.currentAccount.allReceive`；选中虚拟卡片时，分别显示当前用户所有注册邮箱的收件或发件。
- 不要把全部邮箱控制改成收件箱/发件箱顶部工具栏开关；用户偏好的交互是放在第一个真实账号上方的邮箱卡片。

### 登录页品牌

- 登录/注册页的 GitHub 项目链接已在本 fork 中移除。
- 除非用户明确要求，不要重新加入上游项目链接界面。

### 调试诊断

- 前端调试路由：`/debug`，对拥有 `setting:query` 的管理员在侧边栏可见。
- 侧边栏调试入口由系统设置中的侧边栏控制卡片管理。默认隐藏，只有管理员启用调试侧边栏项后才显示。
- 调试文件：`mail-vue/src/views/debug/index.vue`、`mail-vue/src/utils/debug-capture.js`。
- 调试页面不能显示原始令牌、Cloudflare ID、JWT 密钥、Telegram 令牌、S3 密钥或其他私有配置。
- 除非明确需要后端诊断接口，否则调试页保持纯前端。它的主要用途是项目/部署诊断：公开配置、系统设置、当前用户、随机邮箱配额/列表、分享列表接口、路由/资源、缓存、Service Worker、IndexedDB 和环境快照。
- 前端错误捕获和缓存清理只是辅助诊断能力；侧边栏控制负责调试入口时，不要重新添加独立调试卡片。
- `init()` 已有加固：网站配置失败不应阻止 Vue 应用挂载，这样 Worker/API 部署异常时 `/debug` 和 `/login` 仍可渲染。
- 调试页包含前端缓存清理操作，用于普通浏览空白但无痕窗口正常的情况。它会注销 Service Worker，清理 Cache Storage、IndexedDB、localStorage 和 sessionStorage，然后回到 `/login`。

### 过期邮件

- 管理员路由 `/expired-email` 管理超过所选阈值的邮件。它复用全部邮件列表风格，并使用 `all-email:query` / `all-email:delete` 权限族，不新增角色权限树。
- Worker 接口路径：`/expiredEmail/list`、`/expiredEmail/delete`、`/expiredEmail/batchDelete`。
- `expiredEmailAutoDelete`：默认 `0` 关闭，`1` 开启。
- `expiredEmailDays`：保留阈值天数，默认 `30`。
- 页面手动删除会物理删除匹配的过期邮件及相关附件/星标记录。自动删除只在启用后由现有每日定时任务执行。

部署说明：过期邮件新增了设置字段。部署后运行 `/api/init/<jwt_secret>`，让 D1 获得 `expired_email_auto_delete`、`expired_email_days` 和侧边栏字段。

### 侧边栏控制

- 系统设置包含侧边栏控制卡片，后端字段为 `sidebarMenuConfig`。
- 空的 `sidebarMenuConfig` 表示所有普通侧边栏项可见。调试是例外：默认隐藏，必须由侧边栏控制显式启用。
- 侧边栏可见性只是展示偏好，不能作为权限边界；已有路由/API 权限仍然负责访问控制。
- 切换调试侧边栏项时，也要同步旧的 `setting.debug` 标志，用于前端错误捕获；但侧边栏显示应由 `sidebarMenuConfig` 驱动。

### 构建规范

- 不要在 Vite 环境文件里设置 `NODE_ENV=release` 或 `NODE_ENV=dev`；Vite 会对不支持的 `NODE_ENV` 值发出警告。使用 Vite mode 和 `VITE_*` 变量。
- 前端构建有意提高了 `chunkSizeWarningLimit`，避免既有大型依赖/应用分块产生噪音警告。
- 如果出现 Browserslist/caniuse-lite 警告，从 `mail-vue/` 运行 `pnpm dlx update-browserslist-db@latest`，如果锁文件变化则提交该变化。

## 受保护核心区域

除非当前功能确实需要，否则避免修改这些位置：

- `mail-worker/src/security/`
- `mail-worker/src/init/`
- `mail-worker/src/entity/`
- `mail-worker/src/email/`
- `mail-worker/src/utils/jwt-utils.js`
- 会影响邮件投递、认证、数据库结构或权限校验的既有 DAO/服务行为。
- `mail-vue/src/router/`、`mail-vue/src/store/` 和布局组件中的既有路由/状态架构。

如果必须修改其中之一：

1. 编辑前说明原因。
2. 保持改动最小且局部。
3. 避免改变公共契约。
4. 增加或运行聚焦校验。

推荐扩展方式：

- 前端新增页面放在 `mail-vue/src/views/<feature>/`。
- 前端新增独立组件放在 `mail-vue/src/components/<feature>/`。
- 前端新增接口封装放在 `mail-vue/src/request/<feature>.js`。
- 只有共享状态确实必要时才新增 Pinia 状态。
- 新增可见文案时，同时补充 `mail-vue/src/i18n/zh.js` 和 `mail-vue/src/i18n/en.js`。
- Worker 新增接口路由放在 `mail-worker/src/api/<feature>-api.js`。
- Worker 新增服务模块放在 `mail-worker/src/service/<feature>-service.js`。
- 以尽量小的改动注册到现有 Hono 设置中。
- 优先使用可选设置，避免 schema 变更。必须变更 schema 时，隔离迁移并说明兼容性影响。

## 本地运行和校验

机器专用值使用本地专用文件。优先使用已被 `.gitignore` 忽略的文件，例如 `.env.local`、`*.local`、`.dev.vars`、`.wrangler/` 下的 Wrangler 本地状态。

如果已跟踪配置文件里目前是示例值，不要替换成真实本地值。Cloudflare 本地开发时，真实值不要写入已跟踪的 `wrangler*.toml`。如果任务需要本地绑定，优先向用户说明所需本地值，而不是提交这些值。

安装依赖：

```powershell
corepack pnpm --dir mail-worker install
corepack pnpm --dir mail-worker rebuild --pending
corepack pnpm --dir mail-vue install
corepack pnpm --dir mail-vue rebuild --pending
```

`pnpm 11` 可能会阻止依赖构建脚本，并可能生成带占位 `allowBuilds` 的 `pnpm-workspace.yaml`。除非用户明确想要仓库级 pnpm 策略，不要提交这些占位文件。本地设置后如果出现未跟踪占位文件，应删除它们。

先启动 Worker/API：

```powershell
corepack pnpm --dir mail-worker run dev
```

预期 Worker 地址：

```text
http://127.0.0.1:8787
```

Worker 就绪后初始化一次本地 D1：

```powershell
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8787/api/init/<jwt_secret>"
```

只有当当前本地 `jwt_secret` 仍是示例/本地值时才使用它。不要把真实生产密钥写进已跟踪文件。

在第二个终端启动 Vue 前端：

```powershell
corepack pnpm --dir mail-vue run dev
```

预期前端地址：

```text
http://localhost:3001/
```

已跟踪的 `mail-vue/.env.dev` 将 `VITE_BASE_URL` 指向 `http://127.0.0.1:8787/api`。如果需要本地覆盖，使用被忽略的本地文件，不要把私有值写入已跟踪配置。

在当前示例开发配置下，首次本地登录可以通过注册创建：

```text
email: admin@example.com
password: 任意不少于 6 个字符的本地密码
```

这只在本地管理员/域名示例值仍包含 `admin@example.com` 和 `example.com` 时成立。如果本地管理员或域名值改变，应从本地配置推导注册邮箱。

常用启动检查：

```powershell
Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8787/api/setting/websiteConfig"
Invoke-WebRequest -UseBasicParsing "http://localhost:3001/"
git status --short --branch
```

预期接口配置响应包含 `code: 200`。预期前端状态为 `200`。

根据触达范围选择校验命令：

```bash
corepack pnpm --dir mail-vue install
corepack pnpm --dir mail-vue run build
corepack pnpm --dir mail-worker install
corepack pnpm --dir mail-worker test
```

本次如果只整理文档或 skill，不需要运行前端/后端构建。

## 密钥、Git 和上游同步规则

不要提交真实本地密钥、Cloudflare ID、JWT 密钥、令牌、私有域名、生产地址、`.dev.vars`、`.env.local`、生成的 Wrangler 状态或机器专用配置。

暂存或提交前检查：

```bash
git status --short --branch
git diff --cached --name-only
git diff --cached --stat
rg -n "(secret|token|password|passwd|api[_-]?key|client_secret|jwt_secret|account_id|database_id|access_key|private_key)" -S .
```

确认：

- 没有暂存真实密钥或本地专用配置。
- 没有暂存无关格式化变更。
- 除非任务需要，否则核心文件未变更。
- 生成的构建产物已被忽略，或被有意排除。
- 已运行校验，或清楚报告失败原因。

为了降低未来上游同步冲突：

- 不要重命名上游文件、函数、路由或配置键。
- 不要跨目录移动既有代码。
- 不要为了风格重写大文件。
- 优先在注册点做小改动，避免修改大量调用点。
- 将自定义行为放在命名清晰的新模块中。
- 保持提交聚焦，方便后续解决冲突。

常规 Git 同步流程：

```bash
git status --short --branch
git add <intentional-files>
git commit -m "feat: describe change"
git push
```

除非用户明确要求，不要推送 `main`、不要强推、不要改写历史、不要重置用户改动。
