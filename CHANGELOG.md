# Changelog

## 2.12.0 - 2026-10-23

Per-source priority: choose which backend is tried first and which result wins a
dedup tie.

### Added
- `backendOrder` (backend-id array, default empty). `resolveOptions()` reorders
  `enabledBackends` — the single ordering input the provider already uses for
  fan-out order, first-seen dedup winner, telemetry order, and (without
  `rerank`) the result order. Ids not listed keep their registry order after the
  ranked ones; unknown or disabled ids cannot jump the queue.
- Settings card: a 「来源优先级 / Source priority」 section listing the enabled
  backends in their effective order with ↑/↓ controls. Each move writes
  `backendOrder` immediately (no Save needed) and re-renders from the form's
  snapshot; the server sorts with the same stable rule.

### Verified
- `tests/volatile-config.test.js`: two new tests — the listed ids come first in
  list order with the rest in registry order; unknown ids and disabled backends
  cannot jump the queue.
- `node --test tests/*.test.js`: 183 tests, 182 pass; the single failure is the
  pre-existing Windows path-separator assertion in `tests/store-dir.test.js`.

## 2.11.2 - 2026-10-23

The entry failed to activate on dsh 0.2.1, and that single failure explained the
whole settings-form saga.

### Fixed
- **Duplicate fetch provider id.** dsh 0.2.1 ships its own `web-deepseek-api`
  bundle that registers `deepseek-fetch-api`; this plugin registered the same id,
  so `ctx.web.registerFetchProvider` threw `WEB_DUPLICATE_PROVIDER` out of
  `apply()`. The loader then reported "1 entry did not activate
  dsh-websearch ... a web provider with id \"deepseek-fetch-api\" is already
  registered", the fiber never reached ACTIVE, `settings.describe()` skipped it
  (that filter is `entry.fiber.state === ACTIVE`), the namespace was absent from
  the served list, and the bundle page could only ever show its loading skeleton.
  The provider id is now `unified-deepseek-fetch`, prefixed with this plugin's
  search provider id so the two can coexist.
- Fetch registration is non-fatal: if a host (or another plugin) already owns
  the id, the failure is logged and the search provider still registers. An
  exception here must never take the whole entry — and its settings form — down.
- `tests/deepseek-api.test.js` pins the new id and adds a regression test that
  `apply()` survives a host-owned fetch provider.

### Changed
- README / example patch / config description use the new provider id.

### Verified
- `node --test tests/*.test.js`: 181 tests, 180 pass; the single failure is the
  pre-existing Windows path-separator assertion in `tests/store-dir.test.js`.

## 2.11.1 - 2026-10-23

The settings card moved out of Settings > Web plugins and onto this plugin's own
page in Plugins.

### Changed
- Client entry registers the card into the `plugins.bundle.config` keyed slot
  under this bundle's package name (`@240xu/dsh-websearch`) instead of the
  `web-ui.plugin.item` settings list seat. The host renders that slot on the
  bundle's detail page, between the description and the rows, with
  `view: 'page'`; the card keeps its own Save / Discard controls.
- The card's root adapts to the seat: a `<div>` section on the bundle page
  (`view === 'page'`) and a `<li>` item on the legacy 0.1.5
  `settings.section` seat.
- The "open settings" devkit hint now points at 插件 → @240xu/dsh-websearch.

### Fixed
- The card rendered only its loading skeleton on the bundle page: the form was
  bound to the plugin ROW id (`dsh-websearch`), and `configForms` keys a form by
  the settings NAMESPACE it serves (`unified-search`). A form for an unserved
  namespace reports `status: 'unavailable'` forever, so the card never became
  ready. It now prefers a namespace the settings mirror actually serves
  (`configForms.describe()`), falls back to the candidate order when the
  directory is still empty, and skips an `unavailable` candidate when a later one
  is usable.
- The pending state is no longer a silent "…": it says whether the host serves
  no form at all (`scopeUnavailable`) or the form is still loading.

### Fixed (second pass — the first fix still left the skeleton)
- Binding was decided ONCE at load time. `configForms.get()` creates the form for
  whatever id it is handed; while the settings mirror is still empty (its
  directory loads asynchronously) the first candidate is created "loading" and is
  never re-evaluated, so when the mirror arrived without that namespace the form
  flipped to `unavailable` and the card stayed on its skeleton.
- `createConfigScope()` now follows `configForms.describe()`: it re-picks on every
  directory change, prefers a served candidate, keeps the current form while the
  directory is unknown, and forwards form changes to the card.
- The unavailable state now prints the served namespace list, so a host that
  serves neither `unified-search` nor `dsh-websearch` says exactly that instead of
  being unobservable.

### Fixed (third pass — the real root cause)
- The entry never appeared in `settings.describe()` at all (the served list showed
  no `dsh-websearch`), because the form came from a ROOT-level
  `Config.meta.volatile` mark. The loader re-resolves the plugin schema and that
  root flag is lost, so `volatileForm(schema)` returned `undefined` and the whole
  namespace was dropped — a bundle page could never bind a form for it. Every
  Config field is now marked with `.volatile()` (guarded for older schemastery
  lines), the shape the working third-party plugins use.
- `configValues()` unwraps field-level volatile references too (0.2.x resolves
  each field to a cosmokit `{ get }` reference, not a plain value).

### Verified
- `tests/client-entry.test.js`: 5/5 pass, including the namespace-binding
  regression test (served namespace wins; an unusable candidate does not stop the
  binder).
- `node --test tests/*.test.js`: 179 tests, 178 pass; the single failure is the
  pre-existing Windows path-separator assertion in `tests/store-dir.test.js`.

## 2.11.0 - 2026-10-23

DeepSeek replaced the Messages-API + `web_search_20250305` server-tool route with
its own direct Search and Fetch APIs. The `deepseek` backend now speaks the
Search API, and the plugin can also serve the seam's fetch capability. The
implementation follows dsh 0.2.1 `packages/web/web-deepseek-api` (providers
`deepseek-search-api` / `deepseek-fetch-api`).

### Changed
- `deepseek` backend (`lib/backends/deepseek-api.js`, replaces its entry in
  `anthropic-like.js`): one direct `POST {base}/search`
  `{ query, count, need_content: false }` returning
  `results[] { url, title, snippet, date }`. No auxiliary model turn, so the
  `deepseekModel` field no longer affects retrieval (kept, marked deprecated).
- `deepseekBaseURL` default is now `https://api.deepseek.com/v1/tools` (Search
  and Fetch share one base with its path prefix). A saved pre-2.11 value ending
  in `/anthropic/v1` is mapped to the new base automatically, so upgraded
  installs keep working without editing settings.
- Response validation mirrors upstream: a malformed item is
  `WEB_PROVIDER_ERROR`, while an empty `results` array is a successful empty
  search. Missing key is `WEB_PROVIDER_CREDENTIAL_MISSING`.

### Added
- Fetch provider `deepseek-fetch-api` (`lib/fetch-provider.js`), registered via
  `ctx.web.registerFetchProvider` when the host exposes that registry:
  `POST {base}/fetch { url }` -> `{ content }` returned as a `text` body with
  `statusCode: 200` and the requested URL (the API reports neither the target
  status nor a final redirect URL, and fails when the page has no usable
  content).
- `enableDeepseekFetch` (default false). Opt-in on purpose: the host already
  ships an HTTP fetch provider and two simultaneously usable fetch providers
  make the seam throw `WEB_PROVIDER_AMBIGUOUS` until `web.fetchProvider` names
  one.
- `tests/deepseek-api.test.js`: 9 tests pinning the request body, the response
  mapping (nullable `date`, empty strings dropped), malformed-payload
  rejection, the legacy base-URL mapping, and the fetch provider's
  availability rule plus its `/fetch` request.

### Verified
- `node --test tests/*.test.js`: 154 tests, 153 pass. The single failure is the
  pre-existing Windows path-separator assertion in `tests/store-dir.test.js`
  (unrelated; unchanged before and after this change).
- No live DeepSeek API call was made in this change.

## 2.10.0 - 2026-10-11

GitHub as the thirteenth backend — and the first one that is not a general web
index. It is a vertical search over repositories / code / issues, so it is
query-gated and issues at most one request per round. Design and measurements:
docs/design-github-backend.md.

### Added
- `github` backend (`lib/backends/github.js`): `/search/{repositories,code,issues}`,
  Bearer token, pinned `X-GitHub-Api-Version: 2022-11-28`, and
  `application/vnd.github.text-match+json` on code searches so the matched
  source fragment becomes the snippet.
- Per-request backend gate: the provider now consults an optional
  `backend.appliesTo(request)` hook before fan-out. A gated-out backend leaves
  the round entirely — no request, no telemetry entry, no breaker record.
- `githubEndpoints` (auto | repositories | code | issues, default auto) picks
  ONE endpoint per round by first-match: explicit code syntax -> code; issue
  syntax -> issues; `repo:`/`org:` scope -> code; otherwise repositories.
- `githubMaxPerMinute` (default 6) — a local sliding-window budget on top of
  GitHub's own 30/min search and 10/min code_search buckets.
- Settings card: GitHub appears in the keyed-backend list with a token slot
  (`DSH_WEBSEARCH_GITHUB_TOKEN`), plus a scope selector and gating note shown when the
  toggle is on.

### Verified (real calls, this machine)
- Token resolves to `gjy1992` with `repo` scope; measured
  quota core 5000/h, search 30/min, code_search 10/min.
- Anonymous `search/code` returns 401 `Requires authentication` — the token is
  mandatory for code search, not optional.
- `repo:240xu/dsh-websearch inferExaCategory` returns 0 from repositories and 3
  from code, which is why `repo:` scope routes to code.
- The intent gate was measured against this machine's 31 real queries: 2 hit
  (both genuinely GitHub), 29 scientific queries miss.
- Long natural-language queries return `total_count: 0` from repositories
  (`tidal potential station displacement h2 geoid 1+k2 ...` -> 0;
  `固体潮 勒夫数 0.707 模型` -> 0). The backend documents this limit rather than
  hiding it; 0 results are returned as a SUCCESS, never as all-backends-failed.

### Fixed
- A round in which every enabled backend declines the query (e.g. only GitHub is
  on and the query is not about GitHub) no longer throws
  `no enabled backend is available` — that message blamed a configuration that
  was in fact correct. It now returns an empty success, consistent with 2.8.2.

## 2.9.1 - 2026-10-10

Settings card could not save a Key on the DSH 0.2.0 line, and its Save button
was invisible. Both were client-side only; the search path is unchanged.

- Fixed (credential write rejected, reported only as "保存失败"): the card wrote
  secrets through the removed client-connection payload-object form
  (`connection.api.credentials.set({ ref, value })`). 0.2.0 exposes the generated
  `remote.credentials` namespace with positional parameters
  (`set(ref, value)`, `describe(refs)`), and reading `ctx.remote.credentials` off
  the context proxy throws 'cannot get property "remote.credentials" without
  inject' unless the entry declares that dependency — so every write failed and
  every key read back as unconfigured. The card now probes
  `remote.credentials` through `ctx.get()` at call time (soft dependency: no
  static inject, so a host without the namespace still activates the entry,
  keeping the 0.1.5 settingsScope line working), falls back to the legacy seam,
  calls `set` positionally, and accepts both answer envelopes
  (`{ok, value}` / `{result: {ok, value}}`).
- Fixed (invisible Save button): `.wsc-btn` painted itself with
  `--dsw-alias-accent-primary`, a token this host does not define, so the
  background fell back to transparent while `color` stayed `#fff` — white on
  white in the light theme, still clickable and still occupying layout. It now
  uses the real `--dsw-alias-button-primary-fill` and
  `--dsw-alias-label-primary-foreground`; the accent usages (toggle, badge,
  "获取 Key" link) use `--dsw-alias-state-business-primary`. Every token carries
  a fallback, so an unknown token can no longer hide a control.
- Fixed (failures never explained): `projection().failedKeys` published
  `{ref, reason}` objects while the renderer compared them against a reference
  string with `includes`, so a failed key could never show its hint; the
  optional-key section (searxng / anysearch) rendered no failure hint at all —
  the section the reported case was in. `failedKeys` is a reference list again,
  reasons travel as `failedKeyReasons` (surfaced as the hint's tooltip), and the
  optional section reports failures too.
- Fixed (global fields unsaveable): the numResults / concurrency /
  backendTimeoutMs branch had lost its bounds test and marked the save failed
  unconditionally, so editing any global field always reported failure and never
  wrote. Restored `if (!Number.isFinite(num) || num < lo || num > hi)`.
- Changed: the AnySearch User-Agent header now reuses CLIENT_TAG instead of
  repeating the version literal, so the two can no longer drift.
- Fixed (controls had no outline at all — the reported "border blends into the
  white background"): every control border was painted with
  `--dsw-alias-border-subtle`, a token this host line does not define. An
  undefined `var()` without a fallback makes the whole `border` declaration
  invalid at computed-value time, so `.wsc-toggle`, `.wsc-input`,
  `.wsc-keyInput`, `.wsc-badge` and `.wsc-btnGhost` all measured
  `border: 0px none` live. They now use `--dsw-alias-border-l3` (controls)
  and `-l4` (card frame, hover) with hard fallbacks; the toggle rows and the
  status strip sit on `--dsw-alias-bg-module-platform`, the card frame gains a
  soft shadow, inputs get a hover + focus ring, and section titles / the actions
  row get hairline separators.
- Fixed (key counter read 1/7): the 已配置密钥 counter only counted the seven
  key-gated backends, silently dropping the two optional keys (searxng /
  anysearch) even though the card reads and writes them. It now counts all nine
  credential slots (`2/9` in the reported setup) and shows the split
  (`必需 1/7 · 可选 1/2`) beside it.
- Fixed (an already-stored key gave no sign of it): every configured key's input
  now reads `已配置——输入新值可替换` (en: "Configured — type a new value to
  replace") instead of echoing the env-var name, and the optional-key section
  (searxng / anysearch) gained the 已配置/未配置 badge, the 获取 Key link and
  the read-only handling the key-gated section already had. Both sections now
  render through one shared `KeyField`, so they cannot drift apart again.
- Verified live on DSH 0.2.0-rc.2 (Settings → Web plugins → 统一搜索, light
  theme): staging a Key reports 已保存 ✓, the input clears, the row flips to
  已配置, and the value lands in `$DSH_HOME/.credentials.yaml`; the Save button
  measures `background: rgb(15,17,21)` with white text. The UI polish above was
  measured on the same card: toggle / input / badge borders compute to
  `0.8px solid rgba(0,0,0,.12)` (were `0px none`), the frame to
  `rgba(0,0,0,.16)`, the counter reads `已配置密钥: 2/9 · 必需 1/7 · 可选
  1/2`, and both configured fields read `已配置——输入新值可替换`. Full suite
  108 tests; 107 pass — the single failure is the pre-existing Windows
  path-separator assertion in tests/store-dir.test.js (unchanged before and
  after this fix).

## 2.9.0 - 2026-10-10

AnySearch backend — the 12th backend (`anysearch`).

- Added: POST https://api.anysearch.com/v1/search. Keyless-capable — without a
  key the request runs on AnySearch's documented anonymous tier (per-IP rate
  limit + shared daily free quota); ANYSEARCH_API_KEY raises the limits. Opt-in
  (enableAnysearch defaults false) so the default fan-out, latency and anonymous
  quota spend of existing installs do not change.
- Mapping: max_results clamped to the documented 1-10 range (also after
  deepCoverage widening); language passthrough; zone emitted only when the
  canonical region is exactly cn/intl. AnySearch has no recency parameter, so no
  recency mapping is invented.
- Hardening: HTTP 4xx/5xx and HTTP-200-with-code!=0 both classify as
  WEB_PROVIDER_ERROR (request_id retained for support). Credentials embedded in
  the anonymous HTTP 402 message (username/password/api_key) are redacted before
  the upstream text reaches a WebError, the model-visible telemetry line or the
  host log; 402 additionally carries an "add an API key" hint.
- Settings: enableAnysearch / anysearchApiKeyEnv / anysearchBaseURL fields (with
  descriptions for the 0.2.0 SettingsForms renderer); the Settings card lists
  AnySearch under keyless backends with an optional-key input and a dashboard
  link. Vertical tag/params search is deliberately not exposed (many tags
  require a matching params object and would 400 on a bare tag).
- Fixed (web boot): the client entry no longer statically injects
  settingsScope (removed in DSH 0.1.7). A static inject on a service that never
  appears left the whole entry pending and aborted boot with "web boot: 1 entry
  did not activate ... waiting for service: settingsScope"; the card is now read
  through ctx.get() (no inject requirement) and degrades to a console breadcrumb.
  Regression guard: tests/client-entry.test.js loads lib/client.js in a VM and
  asserts the entry's inject list.
- Tests: 15 new (4 parse + 1 filter + 9 anysearch + 1 client-entry). Full suite
  107 tests; the single failure is the pre-existing Windows path-separator
  assertion in tests/store-dir.test.js. Verified live against the anonymous
  endpoint through both the backend module and the provider fan-out.

## 2.8.6 - 2026-10-18

Search-failure hardening (online incident: every backend search failed with "all enabled backends failed (4)").

- Fix: the sidecar forwarder hop now speaks `node:http(s)` directly instead of the global `fetch`. Hosts that install a global dispatcher (e.g. an HTTP_PROXY-wired `EnvHttpProxyAgent`) hijacked the request to the sidecar: with the sidecar host missing from NO_PROXY it was proxied away through the very chain the sidecar fronts (proxy log: `dial -> sidecar ... EOF`), killing every search. Regression test pins it.
- Fix: the forwarder hop gains its own ceiling — `min(caller signal, DSH_EGRESS_FORWARDER_TIMEOUT_MS ?? 20s)` — with distinct errors for caller abort vs "sidecar stalled?" vs "unreachable (cause chain)".
- Fix: all-fail diagnostics keep the full cause chain and enumerate every backend reason (no >4 truncation; cooled skips counted).
- Fix: SearXNG semantic health — HTTP 200 without `results[]` (anti-bot interstitial) no longer records as success and no longer resets the breaker; anti-bot pages get a friendly label.
- Add: opt-in SearXNG multi-instance failover (`searxngBaseURLs`).
- Fix: DDG timeout ceiling 5s to 8s (measured scrapes up to 7.7s were killed).
- Fix: backend timeouts are classified as timeouts in telemetry/health (were misreported as `unified search aborted`, i.e. user cancellation); proxy/forwarder path failures get their own label.

## 2.8.5 - 2026-10-18

Fingerprint-gated upstreams (Exa, DuckDuckGo) behind TLS-censoring exits.

- Add: optional TLS-egress forwarder. When `DSH_EGRESS_FORWARDER` is set to a local sidecar's `/fwd` endpoint (a forwarder backed by a browser TLS stack), backend requests relay through it and carry the upstream proxy in the sidecar spec (`DSH_EGRESS_FORWARDER_PROXY`, defaulting to `HTTPS_PROXY`). Exists because some upstreams gate on the client TLS fingerprint (JA3) rather than on the exit IP — Node's fingerprint is rejected where a Chromium one is accepted. Unset = byte-identical behavior.
- Fix: the DuckDuckGo backend now uses the GET form. The html endpoint serves the same results page, but the POST form is rejected by its bot wall for non-browser clients (method + fingerprint double gate).
- Tests: 3 new forwarder tests (spec encoding/passthrough, 502 error mapping, NO_PROXY bypass).

## 2.8.4 - 2026-10-18

0.2.1-alpha compatibility: the settings section is visible again on builds without the legacy `settingsScope` client service.

- Fix: the client `inject` no longer hard-depends on `settingsScope` (a missing service kept the web boot pending forever). The legacy scope path is preserved for builds that still publish it.
- Add: `settings.section` registers unconditionally; on 0.2.x the card binds a fenced bridge (`GET/POST /api/unified-search/settings`) to the host settings service and writes the same volatile profile entry the provider resolves from — no second settings store. Headless/CI profiles never mount `webServer`, so nothing runs there.
- Fix: numeric fields (`numResults`, `concurrency`, `backendTimeoutMs`) lost their bounds check and could never be saved.
- Fix: credential invalidation now listens to `credentials/reference-updated` (0.2.x) with the legacy `credentials/updated` kept as a fallback; credential read/write prefers the 0.2.x remote face.
- Add: outbound backend requests now honor `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` through a zero-dependency CONNECT tunnel (`lib/util/egress-fetch.js`), so deployments whose egress is a kill-switched proxy (containers) can search; behavior is unchanged when no proxy env is set.
- Fix: history/health routes fence through the host connection admission (kernel parity) instead of loopback-only host matching, so LAN and tunnel sessions are served; the health route gains the same fence.

## 2.8.3 - 2026-10-06

- v2.8.3: empty shaped-query rejected early (no fan-out/cache aliasing), ZH bare filler 搜索 added, CJK separators require a boundary on either side (entity protection), 4 regression tests

## 2.8.2 - 2026-09-30

- P1 fixes — legitimate zero-results no longer forged as all-backends-failed; limiter sync-throw no longer leaks running (deadlock); exa category inference gated on deepCoverage (parity with tavily/searxng); 3 regression tests

## 2.8.1 - 2026-09-29

DSH 0.2.0 SettingsForms adapter (ruling in dsh-plugin-hub/docs/reviews/
cross-settings-forms.md):

- Added: Config carries meta.volatile — the 0.2.0 settings service
  auto-generates its form from the plugin's Config but only fields under a
  volatile ancestor; without the mark the websearch form was empty. The whole
  Config is now the 0.2.0 Settings panel form.
- Removed: the "no installSection" console.warn on the 0.2.0 line (the
  auto-generated form IS the section; the warning contradicted the visible
  UI). The 0.1.5 installSection path is unchanged.
- Changed: descriptions added to all remaining bare fields (7 ×ApiKeyEnv,
  8 ×BaseURL, 3 ×Model) — meta.description is the only user-visible label
  lever on the 0.2.0 form renderer.
- Guard tests: Config.meta.volatile stays true; every top-level field has a
  non-empty description; RT volatileForm replication includes all fields.

## 2.8.0 - 2026-09-29

"Search wider, search deeper" — retrieval-depth upgrade, all feature-gated
(both new switches default OFF; see README "权威依据与取舍" for sources).

### Added
- multiQuery mode (`multiQueryEnabled`, default false): strictly gated
  (length > 60 or a vs/and/比较/对比/和 separator) derivation of 2-3 sub-queries,
  each fanned out fully, fused with Reciprocal Rank Fusion (k=60); the
  original query always participates with full weight (arXiv:2404.01037 guard).
- deepCoverage (`deepCoverage`, default false): per-backend result budget
  widened to ceil(maxResults × 1.5) before global dedupe/truncation; Tavily
  upgraded to search_depth "advanced"; SearXNG categories widened to
  "general,news,it"; Exa data-category inference (github / research paper /
  news, high-confidence only).
- Observability: GET /api/websearch/history now carries a `backends` array
  (last real outcome, latency, breaker state per backend — no error strings).
- Per-backend timeout ceilings: ddg/searxng capped at 5s
  (min(override, backendTimeoutMs)) so unreachable hosts no longer stall the
  fan-out tail; real-clock test at 5013ms.

### Verified
- Real-call: Exa MCP accepted `category: "github"` and returned github.com-only
  results (docs/real-call-2.8.0.md). DDG/SearXNG real calls blocked by this
  sandbox's egress policy (connection-level failures); covered by parse-level
  tests instead.

## 2.7.3 - 2026-09-29

Compatibility fixes from the six-package compat audit:

- Fixed (P0): the client settings card no longer hard-crashes on DSH 0.1.7 —
  settingsScope access is feature-detected (0.1.5 unchanged; 0.1.7 degrades to
  a console.warn breadcrumb with the shim/config guidance).
- Changed (P1): the server-side settings section no longer silently no-ops on
  the 0.1.7 SettingsForms line — one-time console.warn; search itself is
  unaffected via cordis config.
- Added: engines "node": ">=20.3" (AbortSignal.any).
- Fixed (P2): the cache/history store directory falls back to os.homedir()
  instead of process.env.HOME — HOME is usually unset on Windows, which made
  the store path relative and silently disabled cache/history.
- Changed: package description slimmed; version history lives in CHANGELOG.md.

## 2.7.2 - 2026-09-27

- Settings: the six v2.7 fields carry user-language labels at the schema layer
  (meta.label + top-level .label, units in the tail — e.g. "缓存有效期（秒）"),
  and descriptions now open with the human-readable name (fe-ui W1 remainder;
  on-device rendering tracked as visual-check V5).

## 2.7.1 - 2026-09-26

Review fixes (arch-review P1-1 + P2×3, fe-ui W1):

- Fixed: cache key now includes the enabledBackends selection set — switching
  the backend mix no longer serves a stale result from the old combination.
- Hardened: the cache-hit path re-applies the URL scheme whitelist (a tampered
  cache file cannot smuggle javascript:/data: sources to the model).
- Fixed: history record() serializes through an in-process promise chain (no
  lost updates on concurrent search completions); /api/websearch/* routes sit
  behind a trust fence (loopback Host + same-site browser context).
- Changed: breakerCooldownMs=0 now explicitly disables the cooldown window
  (it previously fell back to 60s); user-language settings labels with
  cache/breaker/history grouping; window event dsh-websearch:open-settings
  (ready flag + ack) for devkit command interop.

## 2.7.0 - 2026-09-25

Three opt-out-by-default features; the v2.6.0 prompting layer is untouched.

### Added
- Disk result cache (lib/cache.js): keyed on shaped query + filters +
  maxResults + enabled backends; TTL 900s, 200-entry cap with oldest-by-mtime
  eviction; atomic tmp+rename writes under $DSH_HOME/cache/websearch/results/;
  hits skip the fan-out entirely and append a "[websearch cache] cache hit,
  age Ns" note. Settings: cacheEnabled / cacheTtl.
- Backend circuit breaker (lib/breaker.js): 3 consecutive failures cool a
  backend for 60s (telemetry: "id ⏸cooled Ns"); state folds into the shared
  health entry (failCount/cooledUntil); fail-open when every candidate is
  cooled — the breaker can only make search faster, never worse.
  Settings: breakerEnabled / breakerThreshold / breakerCooldownMs.
- Search history API (lib/history.js): append-only ring of 50
  {query, time, resultCount, backendsOk, backendsTotal} in history.json;
  GET /api/websearch/history (read-only) + POST /api/websearch/history/clear.
  Settings: historyEnabled.

## 2.6.0 - 2026-09-24

Systematic search prompting (lib/prompting.js), per Tavily/Exa/Anthropic/OpenAI
official guidance:

- Deterministic query shaping before fan-out: conversational filler stripped
  (EN+ZH), whitespace compressed, 1500-char clamp; entities/versions/dates
  never rewritten.
- Result-presentation header at the top of the model-visible content: cite the
  URL for every fact, prefer official/primary and newer sources, ignore
  off-topic snippets; language auto-selected (zh/en).
- Telemetry line self-labeled "(diagnostic only, not a source)" so models do
  not mistake backend health telemetry for result sources.

## 2.5.0 - 2026-09-20

- Read-only GET /api/unified-search/health: enabled/keyless/reachable per
  backend from the last real search's telemetry — never probes anything
  (quota safety), error strings truncated + token-redacted.
- Module-level per-search backend telemetry capture powering the health route.

## 2.4.0 - 2026-08-25

Multi-judge review round: 5 independent reviewers; findings cross-validated before fixing.

### Fixed
- Panel: SearXNG no longer misgrouped as key-requiring (optionalKey flag); the false
  missing-key warning is gone; optional private-instance keys moved to their own section.
- rank.js rerank URL-tokenizer stripped uppercase before lowercasing, so URL match
  weight silently failed on capitalized URLs.
- provider: numResults now propagates into every backend fetch (it previously only
  applied to the final slice).
- provider: allKeyMissing guidance also fires for WEB_PROVIDER_CREDENTIAL_MISSING
  (deepseek/anthropic/openai paths).
- parallel.js outcome recorded after the isError check (mirrors the exa fix).
- ~400 lines of dead code removed (util/rpc.js legacy MCP client + duplicate
  backends/index.js registry).

### Hardened (security judge findings)
- baseURL trust-boundary guard: https enforced (plain http only for private hosts),
  credentials-in-URL rejected - API keys can no longer follow a misconfigured endpoint.
- Server-controlled error bodies truncated to 300 chars before entering errors/logs;
  host-log outcome payloads capped at 500 chars.
- Result URLs scheme-whitelisted to http(s) at merge time (javascript:/data: from
  poisoned backends never reach consumers); DDG uddg decoding covered transitively.
- redirect:error on all REST backends (previously inconsistent).
- mcp-client: SSE multi-data-line envelopes parsed; notification response drained;
  parallel session id no longer leaks pid (crypto.randomUUID).

### UX
- Read-only scope banner with disabled save; toggle writes surface conflict/failure
  instead of silent rejection; validation failures name the offending fields; an all-off
  state shows the fallback hint; telemetry line includes truncated failure reason.
- README: stale session.append design text replaced with the host-logger reality;
  availability semantics corrected; test command generalized.
## 2.3.0 - 2026-08-25

### Added

- Result health telemetry (default on): every search appends a compact
  [websearch backends] line (per-backend status + duration) to result.content so
  the agent can self-diagnose and guide the user; resultTelemetry=false opts out.
- SearXNG network failures hint at switching searxngBaseURL; README documents a
  curated public-instance table.
- Settings panel: telemetry toggle in the shaping section.


## 2.2.0 - 2026-08-25

### Fixed (P0)

- Session-log landmine removed: per-backend request/outcome diagnostics no
  longer append custom event types to the session ledger. The session event
  vocabulary is a closed generated set and session.append() cannot mark an
  envelope ignorable, so ANY session that ran a search was refused by the
  persistence read path on next load (writes succeeded, reads failed).
  Diagnostics now go to the host logger (ctx.logger), which is what
  out-of-repo plugins must use.

### Changed (UX)

- All-backends-failed errors now enumerate each backend's own reason and,
  when every enabled backend lacks its key, point at Settings > Web Search.
- Settings card: API-key inputs detect env-shadowed references via
  credentials.describe().writable - they render read-only with an
  "provided by env" badge instead of failing a doomed write.
- Per-key save failures are isolated and named instead of failing the whole
  card silently; SETTINGS_CONFLICT writes surface a retry banner.

### Tests

- Failure-enumeration, key-missing-guidance and ddg end-to-end regression
  coverage (68 total).

## 2.1.1 - 2026-08-25

### Fixed

- ddg.js crashed on EVERY real search (throwIfSearchAborted is not defined):
  the v2.0 abort-guard refactor added the call but never the import, and no
  test executed the backend end-to-end so it slipped through. Two regression
  tests now run ddgBackend.search against mocked HTML.

## 2.1.0 - 2026-08-25

### Added

- Cross-backend result shaping: settings-level recency / language / safeSearch
  filters mapped per-backend (Brave freshness/country/search_lang, Tavily
  time_range, Serper tbs/hl/gl, SearXNG time_range/language, DDG df);
  unsupported backends ignore unsupported dimensions. Request-level filters
  override settings defaults.
- dedupStrategy url | url+title - the new mode collapses syndicated mirrors by
  CJK-aware title similarity (Jaccard >= 0.9) with cross-entry field fill-in.
- Optional deterministic rerank (query-term overlap; title x3 / snippet x2 /
  URL x1; stable ties keep fan-out priority).
- Settings panel "结果策略 / Result shaping" section (recency, language, dedup
  strategy, rerank, safe search) with client-side validation; zh/en labels.
- tests/filters.test.js, tests/rank.test.js, tests/v21.test.js (30 new cases;
  64 total).

### Fixed

- exa.js recorded MCP isError results as successful outcomes before parsing;
  outcome events now reflect the real status/count.
- provider.js timeout machinery replaced: the old Promise.race left a dangling
  rejection path (unhandled-rejection crash risk) and misclassified internal
  timeouts as soft cancellations. Timeouts now fail loud as
  backend "<id>" timed out after Nms (WEB_PROVIDER_ERROR); caller cancellation
  semantics unchanged.
- mojeek.js no longer sends api_key in the query string (leaks into logs and
  history); auth moved to the Authorization bearer header.
- searxng.js language is configurable instead of hardcoded en; safe search is
  configurable (default ON, preserving prior behavior).
- resolveOptions scopes searchDepth to the Tavily backend options only.

## 2.0.6 - 2026-08-25

- Panel: group backend toggles into keyless/keyed sections.

## 2.0.5 - 2026-08-23

- npm publish pipeline established (@240xu/dsh-websearch).

## 2.0.0 - 2026-08-22

- Five new backends (Brave, Tavily, Serper, SearXNG, Mojeek) on the unified
  fan-out architecture; GUI metadata config schema.

