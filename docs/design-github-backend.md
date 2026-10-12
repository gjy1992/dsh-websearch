# GitHub 后端设计（v2.10.0 提案）

> 状态：**设计待确认**，尚未实现。
> 依据：本机实测（2026-10-11，token = gjy1992 的经典 PAT），
> 所有数字都来自真实 API 调用，不是推断。

## 0. 一句话

GitHub 不是"第 13 个通用搜索后端"，而是**一个带独立触发门的垂直后端**：
只有当查询确实在找 GitHub 上的仓库/代码/issue 时才扇出，且**只发一个端点**。

---

## 1. 为什么不能当普通后端

把 GitHub 混进 12 后端扇出会立刻坏事，实测数据：

| 事实 | 实测值 | 后果 |
|---|---|---|
| `search` 配额 | **30 次/分钟**（全局共享） | 并发扇出 + 多查询融合会秒撞 429 |
| `code_search` 配额 | **10 次/分钟**（独立桶） | 更窄 |
| core 配额 | 5000/小时 | 够用 |
| code search 匿名 | **401 Requires authentication** | 必须带 key |

对比：Exa/Parallel 无此限制。所以 GitHub 必须**受门控**、**限流**、**只打一个端点**。

### 1.1 自然语言查询在 GitHub 上会归零（关键实测）

拿本机真实搜索历史（31 条）里的典型查询去打 repositories：

| 查询 | repositories 结果数 |
|---|---|
| `tidal potential station displacement h2 geoid 1+k2 free air correction solid earth tide effective potential` | **0** |
| `tidal potential station displacement h2`（截断到 5 词） | **0** |
| `固体潮 勒夫数 0.707 模型` | **0** |
| `Love number h2 0.707` | **0** |
| `"solid earth tide"`（带引号） | 6 |
| `solid earth tide in:readme` | 885 |
| `solid earth tide in:name,description` | 9 |
| `repo:240xu/dsh-websearch` | 1 |

**结论**：GitHub 的 repositories 搜索是**关键词 AND 匹配**，不是语义检索。
长自然语言查询几乎必然 0 结果。所以：

- ❌ 绝不能把用户原始查询直接丢给 GitHub；
- ✅ 必须先**抽取关键词**，并优先使用用户显式写出的 qualifier；
- ✅ 0 结果是**正常结果**，必须能和"后端失败"区分开（沿用 v2.8.2 的 P1 教训）。

---

## 2. 触发设计：什么时候启用

三层判定，**全部为真才启用**（AND，不是 OR）：

```
启用 = 用户打开了 enableGithub
     ∧ 查询含 GitHub 意图（见 2.1）
     ∧ 本轮配额允许（见 4）
```

### 2.1 意图判定（正则 + 显式 qualifier）

复用 `lib/backends/exa.js` 里已有的 `inferExaCategory` 同款词表，保持一致：

```js
// 与 exa.js:26 的词表对齐，避免同一个词在两个后端有不同解释
const GITHUB_INTENT = /\bgithub\b|\brepo\b|repository|开源项目|源码/;
// 新增：显式 qualifier —— 用户已经在用 GitHub 语法，意图无需推断
const GITHUB_QUALIFIER = /(^|\s)(repo|org|user|language|path|filename|extension|is|in):/;
```

**用本机 31 条真实查询验证过**：命中 2 条（`site:github.com dsh plugin registry`、
`dsh-websearch plugin github repository`），其余 29 条（固体潮/海潮/勒夫数那些）**零误伤**。
误报代价只是多一个后端并发，但按 2.2 的 AND 语义，长查询本来就不会触发。

### 2.2 与 `deepCoverage` 的关系

Exa 的 github category 当前**受 deepCoverage 门控**（`exa.js:49-52`，v2.8.1 修的 P1）。
GitHub 后端**不挂 deepCoverage**——理由不同：

- deepCoverage 是"查全查多"（多花带宽换覆盖）；
- GitHub 是"换个检索源"（换的是**检索语义**，不是覆盖度）。

但两者**共用同一个意图词表**，保证用户不会遇到"开 deepCoverage 时 Exa 说这是
github 查询、GitHub 后端却说不算"的割裂。

### 2.3 不触发时的行为

不触发 = 后端**完全不参与扇出**，不产生任何请求、不占用配额、不出现在遥测里
（避免"每轮都显示 github ✗ skipped"的噪音）。

---

## 3. 端点选择：repositories / code / issues

**每轮只打一个端点**（配额 + 语义双重理由）。按下面的优先级**取第一个命中**：

| 优先级 | 条件 | 端点 | 理由 |
|---|---|---|---|
| 1 | 显式代码语法：`path:` `filename:` `extension:` `language:` | `/search/code` | 用户已经指定了代码维度，只有 code search 认这些 |
| 2 | 显式 issue 意图：`is:issue` `is:pr` `label:` `author:`，或词面 issue/bug/pull request | `/search/issues` | 找的是讨论不是代码；**排在 repo 之前**，否则 `repo:x is:issue y` 会被误路由到 code |
| 3 | 显式仓库范围：`repo:` 或 `org:`（+ 任意关键词） | `/search/code` | 实测：repositories 端点**不匹配仓库内正文** |
| 4 | 其余（默认） | `/search/repositories` | 最广、最省配额 |

第 3 条是**实测推翻初版设计**的地方。初版写的是"repo: + 代码意图才走 code"，
但实测发现 `repo:240xu/dsh-websearch inferExaCategory`：

| 端点 | total_count |
|---|---|
| `/search/repositories` | **0** |
| `/search/code` | **3** |

repositories 只匹配仓库名/描述/README 元数据，不匹配仓库内正文。用户写 `repo:x 某标识符`
就是在"在这个仓库里找这段代码"，所以只要出现 `repo:`/`org:` 作用域就应走 code。

补充规则：

- **repositories 是默认兜底**，因为它的结果对模型最有解释力（`description` + `stargazers_count`）；
- **code search 必须有 key**（匿名 401）。本实现把它作为**配置期要求**：无 key 时后端整体
  `CREDENTIAL_MISSING` 软失败，而不是在运行期把 code 查询偷偷降级成 repositories——
  静默降级会让用户以为"搜到了"，实际搜的是另一个数据集；
- code search 的 `text_matches` 需要 `Accept: application/vnd.github.text-match+json`，
  实测能拿到命中片段，正好当 snippet：

  ```
  path: lib/backends/exa.js | matches: " * enum: github / \"research paper\" / news / pdf ..."
  ```

### 3.1 用户显式 qualifier 优先于自动抽取

如果查询里已经有 `repo:owner/name`、`language:ts`、`is:pr` 这类 GitHub 语法，
**原样透传**，不做任何改写。只有裸自然语言才走抽取（见 5.2）。

---

## 4. 配额与限流

| 项 | 值 | 处理 |
|---|---|---|
| search | 30/min | 进程内令牌桶，**每分钟最多 1 次 GitHub 调用**（留 29 次余量给用户自己） |
| code_search | 10/min | 独立计数；与 search 桶共用"每轮 1 次"上限即可 |
| 429 | `Retry-After` / `X-RateLimit-Reset` | **本轮直接跳过**，不重试（重试会吃掉下一轮的配额） |
| 熔断 | 现有 breaker | 复用；GitHub 失败与网络失败分开归类 |

**关键**：GitHub 的失败**不能拖垮整轮搜索**。它和 Exa/Parallel 一样是软失败
（`provider.js:7-12` 的既有语义：≥1 个后端成功即返回）。

---

## 5. 结果映射

### 5.1 三个端点 → `{ url, title, snippet }`

**repositories**（`items[]`）：

```
url     = html_url
title   = full_name + " — " + description（截断）
snippet = `⭐{stargazers_count} · {language} · 更新 {pushed_at}` + description
```

**code**（`items[]`，需 text-match Accept 头）：

```
url     = html_url
title   = `{repository.full_name}/{path}`
snippet = text_matches[0].fragment（去空白、截断 500，与 anysearch 的预算一致）
```

**issues**（`items[]`）：

```
url     = html_url
title   = `[{state}] {title}` + (pull_request ? " (PR)" : "")
snippet = body 截断 500
```

### 5.2 关键词抽取（仅裸自然语言时）

因为 NL 查询会归零（§1.1），需要一个**保守**的抽取器：

1. 去掉停用词（`the/a/is/how/to/怎么/如何/是什么` 等）；
2. 去掉标点，保留 `.`（版本号如 `0.707`）；
3. **超过 6 个 token 就截断**（实测截到 5 词仍然 0 结果，所以这一步只是减损，不是解法）；
4. 中文词整体保留（实测中文在 repositories 上也是 0，所以中文查询基本只能靠 `in:readme`）。

> ⚠️ 诚实的局限：**GitHub 后端对学术/自然语言查询价值很低**。
> 它的价值场景是"找某个库/某段代码/某个 issue"，那时用户查询本身就短、
> 或者带 qualifier。设计上不假装它能替代 Exa/Parallel。

### 5.3 0 结果必须可区分

`{ sources: [], truncated: false }` 是**正常返回**，遥测里显示 `github ✓12ms/0`，
绝不伪造为失败——这正是 v2.8.2 P1 修过的坑（`CHANGELOG.md` 2.8.2 条目）。

---

## 6. 配置与 UI

### 6.1 新增 Config 字段（`lib/index.js`）

```js
enableGithub: z.boolean().default(false)
  .description("GitHub 检索（需 Key；仅当查询含 GitHub 意图时启用）"),
githubApiKeyEnv: z.string().role("credential-ref").default("DSH_WEBSEARCH_GITHUB_TOKEN")
  .description("GitHub Token 的凭证引用（插件自有名，只从凭证库读写）"),
githubBaseURL: z.string().default("https://api.github.com")
  .description("GitHub API 端点（企业版改此项）"),
githubEndpoints: z.union(["auto", "repositories", "code", "issues"]).default("auto")
  .description("GitHub 检索范围：auto 按查询意图选；也可锁定单一端点"),
githubMaxPerMinute: z.number().step(1).min(1).max(30).default(6)
  .description("GitHub 每分钟最多调用次数（本地限流）"),
```

> **凭证引用名必须是插件自有的**（2026-10-12 修正）。初版默认值用了
> `GITHUB_AUTHKEY` —— 那是宿主进程**已继承的环境变量**，于是
> `credentials.describe()` 返回 `{configured:true, source:"env", writable:false}`，
> 卡片渲染成「只读 / 环境变量提供」，而且保存会被 `assertUnshadowed()` 直接拒绝。
> 改用 `DSH_WEBSEARCH_GITHUB_TOKEN` 后环境层永远不会提供它，凭证文件成为唯一来源，
> UI 可写。**注意**：工具子进程的环境是被擦洗过的，所以「在工具里看不到某变量」
> 不能证明宿主也看不到 —— 判断凭证来源要看 `describe()` 的 `source`/`writable`，
> 不要用子进程 env 推断。

`githubEndpoints: "auto"` 是 §3 的优先级选择器；锁死某一项给高级用户
（比如"我这个项目就是要搜 issue"）。

### 6.2 客户端卡片（`lib/client.js`）

- `BACKENDS` 数组加 `{ id: "github", keyEnv: "DSH_WEBSEARCH_GITHUB_TOKEN", label: "GitHub (仓库/代码/Issue)" }`；
- 归入 `KEYED`（必需 key），`keysReadyRequired` 计数从 7 变 8；
- 卡片上加一行说明：**"GitHub 只在查询涉及仓库/代码时才启用"**，
  避免用户以为它像 Exa 一样每轮都跑。

---

## 7. 需要改动的文件（实现清单）

| 文件 | 改动 |
|---|---|
| `lib/backends/github.js` | **新增**：意图判定 + 端点选择 + 三个 parser + 令牌桶 |
| `lib/index.js` | BACKENDS / DEFAULT_BASE_URLS / DEFAULT_KEY_ENV / DEFAULT_LABELS / Config / DEFAULT_LABELS 注册 |
| `lib/client.js` | BACKENDS 数组 + KEYED 归类 + 卡片文案 |
| `lib/provider.js` | 扇出前调用 `backend.appliesTo(request)` 门控（新可选钩子） |
| `lib/util/filters.js` | **未改动**（见下） |
| `tests/github.test.js` | **新增**：意图判定 / 端点选择 / 三个 parser / 0 结果 / 429 / 无 key / 门控集成 / schema |
| `README.md` + `CHANGELOG.md` | 后端矩阵加一行；2.10.0 条目 |

> `filters.js` 的 recency 映射**刻意没做**：把 `recency` 映射成 `pushed:>YYYY-MM-DD`
> 会与用户已写出的限定符冲突（用户写了 `pushed:` 时不能覆盖），而 GitHub 的
> `pushed:` 只过滤"最近推送"，语义和"搜索时间范围"不是一回事。宁可少一个参数，
> 也不要一个会误导的映射。

### 7.1 新的可选后端钩子

现有 `Backend` 接口只有 `id / requiresCredential / available() / search()`。
需要加一个**可选**的：

```js
appliesTo(request) { return boolean }   // 缺省 true，不影响现有 12 后端
```

`provider.js` 在扇出前过滤：`enabled.filter(b => b.appliesTo?.(request) ?? true)`。
这样"不触发时完全不参与"（§2.3）就是一行代码，且对既有后端零影响。

---

## 8. 测试计划

1. **意图判定**：把本机 31 条真实查询当 fixture，断言只有 2 条命中（防误报回归）；
2. **端点选择**：§3 表格的 4 条优先级各一例 + 边界；
3. **parser**：三个端点各用真实响应结构（脱敏）做 fixture；
4. **0 结果**：`total_count: 0` → 返回 `{sources: []}`，遥测 `✓/0`；
5. **无 key**：无 key 时后端整体 `CREDENTIAL_MISSING` 软失败（不静默改打别的端点）；
6. **429**：mock 429 + `Retry-After` → 本轮跳过、不重试、不进熔断的"网络失败"桶；
7. **令牌桶**：连续 3 轮触发只发出 1 次请求；
8. **真实调用**（可选，手动）：`repo:240xu/dsh-websearch inferExaCategory` 走 code search。

---

## 9. 实现状态与已决事项

**已实现（v2.10.0）**：本设计的 §2–§7 全部落地，29 个新测试（`tests/github.test.js`）。

1. **`enableGithub` 默认值 = false** —— 已定，与其它 key-gated 后端一致。
2. **方案 A 已选**（完整后端，非 Exa category 放开）—— 用户 2026-10-11 拍板。
3. **UI 输入 Key** —— 已实现：设置卡片「需要 API Key」区出现 GitHub 行，
   placeholder 为 `DSH_WEBSEARCH_GITHUB_TOKEN`，保存即写入凭证库（走 2.9.1 修好的
   `remote.credentials.set(ref, value)` 路径），无需重启。

### 实现时发现并修正的设计偏差

- **§3 优先级 2/3 互换**（见上）：`is:issue` 必须先于 `repo:` 判定。
- **`language:` 曾不在意图门里**：`selectGithubEndpoint()` 把它当显式代码语法，
  但 `GITHUB_QUALIFIER` 没收它，导致该分支永远不可达。已对齐，并加测试锁定
  "门与选择器必须对同一组限定符达成一致"。
- **新增：全部门控后端都被跳过时**，provider 原来会抛
  `no enabled backend is available`——但配置其实完全正确（只是这个查询不该走
  GitHub）。已改为返回空成功，与 2.8.2 的"零结果 ≠ 失败"一致。
- **§9.3 缓存键**：`cacheKeyFor` 已含 `backends` 集合，而端点选择是查询的纯函数，
  因此同一查询必然选同一端点，缓存键无需额外维度。**无需改动。**

### 仍然诚实的局限

GitHub 后端对自然语言/学术查询帮助有限（§1.1 实测为 0）。它的价值场景是
"找某个库 / 某段代码 / 某个 issue"。README 已如实写明，未做夸大。
