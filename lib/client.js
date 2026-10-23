window.__ModuleLoader__.load({
	id: "@240xu/dsh-websearch",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		const NS = "websearch.settings";
		const PLUGIN_NS = "unified-search";
		/** The bundle whose page hosts the settings card (plugins.bundle.config key). */
		const PLUGIN_PACKAGE = "@240xu/dsh-websearch";

		/** Backend metadata: id, default credential env ref, label. */
		const BACKENDS = [
			{ id: "exa", keyEnv: null, label: "Exa (MCP, 免费)" },
			{ id: "parallel", keyEnv: null, label: "Parallel (MCP, 免费)" },
			{ id: "ddg", keyEnv: null, label: "DuckDuckGo (HTML)" },
			{ id: "searxng", keyEnv: "SEARXNG_API_KEY", optionalKey: true, label: "SearXNG (元搜索)" },
			{ id: "anysearch", keyEnv: "ANYSEARCH_API_KEY", optionalKey: true, label: "AnySearch (AI 检索)" },
			{ id: "github", keyEnv: "DSH_WEBSEARCH_GITHUB_TOKEN", label: "GitHub (仓库/代码/Issue)", gated: true },
			{ id: "brave", keyEnv: "BRAVE_API_KEY", label: "Brave Search" },
			{ id: "tavily", keyEnv: "TAVILY_API_KEY", label: "Tavily (AI)" },
			{ id: "serper", keyEnv: "SERPER_API_KEY", label: "Serper.dev" },
			{ id: "mojeek", keyEnv: "MOJEEK_API_KEY", label: "Mojeek" },
			{ id: "deepseek", keyEnv: "DEEPSEEK_API_KEY", label: "DeepSeek" },
			{ id: "anthropic", keyEnv: "ANTHROPIC_API_KEY", label: "Anthropic" },
			{ id: "openai", keyEnv: "OPENAI_API_KEY", label: "OpenAI" },
		];
		const GLOBAL_FIELDS = ["numResults", "concurrency", "backendTimeoutMs"];
		/** Enum-valued settings (validated client-side, saved as strings). */
		const SELECT_FIELDS = {
			recency: ["any", "day", "week", "month", "year"],
			dedupStrategy: ["url", "url+title"],
			githubEndpoints: ["auto", "repositories", "code", "issues"],
		};
		/** Boolean settings staged as "true"/"false" strings by the selects. */
		const BOOLEAN_FIELDS = ["rerank", "safeSearch", "resultTelemetry"];
		const KEYLESS = BACKENDS.filter((b) => !b.keyEnv || b.optionalKey);
		const KEYED = BACKENDS.filter((b) => b.keyEnv && !b.optionalKey);
		const OPTIONAL_KEYS = BACKENDS.filter((b) => b.keyEnv && b.optionalKey);

		/** Where the user goes to get/rotate each key. */
		const KEY_URLS = {
			brave: "https://api-dashboard.search.brave.com/app/keys",
			tavily: "https://app.tavily.com/home",
			serper: "https://serper.dev/api-key",
			mojeek: "https://www.mojeek.com/services/search/web-search-api/",
			deepseek: "https://platform.deepseek.com/api_keys",
			anthropic: "https://console.anthropic.com/settings/keys",
			openai: "https://platform.openai.com/api-keys",
			anysearch: "https://anysearch.com/console/api-keys",
			github: "https://github.com/settings/tokens",
		};

		const zh = {
			nav: "搜索",
			groupFree: "免密钥（开箱即用）",
			groupKeyed: "需要 API Key",
			statusEnabled: "已启用后端",
			statusKeys: "已配置密钥",
			statusKeysDetail: "必需 {req}/{reqTotal} · 可选 {opt}/{optTotal}",
			keyMissing: "缺密钥",
			gatedBadge: "按查询启用",
			unsavedHint: "有未保存的修改", savedOk: "已保存 ✓",
			title: "统一搜索 (Unified Search)",
			summaryHint: "多后端并发聚合搜索（Exa / AnySearch / Brave…）",
			description: "聚合网络搜索：13 个后端并发 fan-out、URL 去重合并（GitHub 为按查询门控的垂直检索）。开关后端、填 API Key、调参数，保存即生效。",
			save: "保存",
			discard: "放弃修改",
			dirty: "有未保存修改",
			saved: "已保存",
			saving: "保存中…",
			failed: "保存失败",
			reset: "重置",
			overridden: "已自定义",
			keyLabel: "{id} API Key",
			getKey: "获取 Key ↗",
			keyHint: "填入后保存到凭证库（对应环境变量引用）；留空表示不修改",
			keySet: "已配置",
			keyUnset: "未配置",
			keySetPlaceholder: "已配置——输入新值可替换",
			togglesTitle: "启用后端",
			globalsTitle: "全局参数",
			keysTitle: "API 密钥（保存后写入凭证库，立即生效）",
			shapingTitle: "结果策略",
			recencyLabel: "时间范围",
			langLabel: "搜索语言",
			safeSearchLabel: "安全搜索",
			dedupLabel: "去重策略",
			rerankLabel: "相关性重排",
			on: "开",
			off: "关",
			recencyAny: "不限",
			recencyDay: "一天内",
			recencyWeek: "一周内",
			recencyMonth: "一月内",
			recencyYear: "一年内",
			dedupUrl: "按链接",
			dedupTitle: "链接 + 标题（合并转载）",
			langPlaceholder: "如 en、zh-CN，留空为默认",
						envProvided: "环境变量提供",			readOnly: "只读，无需填写",			conflict: "设置已在其他端被修改，请重试",			keyFailed: "该 Key 保存失败",
			telemetryLabel: "结果健康遥测",
			githubGatedHint: "GitHub 是垂直检索：仅当查询提到仓库/代码/issue 时才参与，且每轮最多调用一次（官方配额 30 次/分钟）。",
			githubScopeLabel: "GitHub 检索范围",
			githubScopeAuto: "自动（按查询意图）",
			githubScopeRepos: "仅仓库 repositories",
			githubScopeCode: "仅代码 code（需 Token）",
			githubScopeIssues: "仅 Issue/PR",
			fallbackHint: "全部后端已关闭：搜索将回退到默认免 Key 后端",
			invalidFields: "以下字段未通过校验：",
			readOnlyScope: "当前配置只读（可能由宿主锁定）",
			optionalTitle: "私有实例可选 Key",
			scopeUnavailable: "宿主未提供本插件的设置表单（configForms 未服务 unified-search / dsh-websearch；已服务：{namespaces}）",
			priorityTitle: "来源优先级",
			priorityHint: "越靠上越优先：决定扇出顺序、去重时谁的结果先占位；改完立即生效。",
			priorityUp: "上移",
			priorityDown: "下移",
			scopeLoading: "正在读取设置…",
		};
		const en = {
			nav: "Web Search",
			groupFree: "Keyless (ready to use)",
			groupKeyed: "Requires API key",
			statusEnabled: "Backends enabled",
			statusKeys: "Keys configured",
			statusKeysDetail: "required {req}/{reqTotal} · optional {opt}/{optTotal}",
			keyMissing: "key missing",
			gatedBadge: "query-gated",
			unsavedHint: "You have unsaved changes", savedOk: "Saved ✓",
			title: "Unified Search",
			summaryHint: "Aggregated multi-backend web search",
			description: "Aggregated web search: 13 backends fan out concurrently, URL-deduped (GitHub is a query-gated vertical search). Toggle backends, set API keys, tune globals — saves apply immediately.",
			save: "Save",
			discard: "Discard",
			dirty: "Unsaved changes",
			saved: "Saved",
			saving: "Saving…",
			failed: "Save failed",
			reset: "Reset",
			overridden: "customized",
			keyLabel: "{id} API Key",
			getKey: "Get key ↗",
			keyHint: "Stored into the credential store on save; leave blank to keep current",
			keySet: "configured",
			keyUnset: "not set",
			keySetPlaceholder: "Configured — type a new value to replace",
			togglesTitle: "Enabled backends",
			globalsTitle: "Global parameters",
			keysTitle: "API keys (saved to the credential store, effective immediately)",
			shapingTitle: "Result shaping",
			recencyLabel: "Recency",
			langLabel: "Language",
			safeSearchLabel: "Safe search",
			dedupLabel: "Dedup strategy",
			rerankLabel: "Relevance rerank",
			on: "On",
			off: "Off",
			recencyAny: "Any time",
			recencyDay: "Past day",
			recencyWeek: "Past week",
			recencyMonth: "Past month",
			recencyYear: "Past year",
			dedupUrl: "By URL",
			dedupTitle: "URL + title (merge syndication)",
			langPlaceholder: "e.g. en, zh-CN; blank = backend default",
			envProvided: "provided by env",
			readOnly: "read-only, nothing to fill",
			conflict: "Changed elsewhere - please retry",
			keyFailed: "failed to save this key",
			telemetryLabel: "Result health telemetry",
			githubGatedHint: "GitHub is a vertical search: it only joins when the query mentions a repo/code/issue, at most once per round (official quota: 30/min).",
			githubScopeLabel: "GitHub search scope",
			githubScopeAuto: "Auto (by query intent)",
			githubScopeRepos: "Repositories only",
			githubScopeCode: "Code only (needs token)",
			githubScopeIssues: "Issues / PRs only",
			fallbackHint: "All backends off: search falls back to the default keyless four.",
			invalidFields: "Fields failed validation:",
			readOnlyScope: "Configuration is read-only (locked by host?)",
			optionalTitle: "Private instance optional keys",
			scopeUnavailable: "This host serves no settings form for this plugin (configForms serves neither unified-search nor dsh-websearch; served: {namespaces})",
			priorityTitle: "Source priority",
			priorityHint: "Higher wins: sets fan-out order and whose result survives dedup. Applies immediately.",
			priorityUp: "Move up",
			priorityDown: "Move down",
			scopeLoading: "Reading settings…",
		};

		//#region styles
		const css = ".wsc-item{list-style:none;margin:0}.wsc-panel{border:1px solid var(--dsw-alias-border-l4,#00000029);background:var(--dsw-alias-bg-layer-1,#fff);border-radius:16px;padding:0;box-shadow:0 1px 2px rgba(15,17,21,.05),0 12px 28px -24px rgba(15,17,21,.35)}.wsc-summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:13px;padding:16px;color:var(--dsw-alias-label-primary)}.wsc-summary::-webkit-details-marker{display:none}.wsc-icon{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);transition:color .16s}.wsc-summaryText{display:flex;flex-direction:column;gap:2px;min-width:0}.wsc-summaryTitle{font-size:15px;font-weight:600;line-height:22px}.wsc-subtitle{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}.wsc-summary::after{content:'';flex:none;width:8px;height:8px;margin-left:auto;border-right:1.5px solid var(--dsw-alias-label-secondary);border-bottom:1.5px solid var(--dsw-alias-label-secondary);transform:rotate(45deg) translate(-2px,-2px);opacity:.75;transition:transform .15s}.wsc-panel[open] .wsc-summary::after{transform:rotate(-135deg) translate(2px,2px)}.wsc-panelBody{padding:0 16px 16px}.wsc-card{display:flex;flex-direction:column;gap:14px}.wsc-sectionTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:4px 0 0;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#0000001a)}.wsc-sectionTitle.wsc-sectionFirst{border-top:0;padding-top:0}.wsc-toggles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px}.wsc-toggle{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;border:1px solid var(--dsw-alias-border-l3,#0000001f);cursor:pointer;font-size:13px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform,#f5f6f7);transition:border-color .15s}.wsc-toggle:hover{border-color:var(--dsw-alias-border-l4,#00000029)}.wsc-toggle input{accent-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#4176e6))}.wsc-input,.wsc-keyInput{box-sizing:border-box;width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l3,#0000001f);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;transition:border-color .15s,box-shadow .15s}.wsc-input:hover,.wsc-keyInput:hover{border-color:var(--dsw-alias-border-l4,#00000029)}.wsc-input:focus,.wsc-keyInput:focus{outline:none;border-color:var(--dsw-alias-state-business-primary,#4176e6);box-shadow:0 0 0 3px rgba(65,118,230,.16)}.wsc-input:disabled,.wsc-keyInput:disabled{background:var(--dsw-alias-bg-module-platform,#f5f6f7);opacity:.7}.wsc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}.wsc-fieldHead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px}.wsc-label{font-size:12px;opacity:.8}.wsc-badge{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l3,#0000001f);background:var(--dsw-alias-bg-layer-1,#fff)}.wsc-badgeOn{color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#4176e6));border-color:currentColor}.wsc-hint{font-size:11px;opacity:.55;margin:3px 0 0}.wsc-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l2,#0000001a)}.wsc-btn{cursor:pointer;border:none;border-radius:10px;padding:8px 16px;font-size:13px;font-family:inherit;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#0f1115));color:var(--dsw-alias-label-primary-foreground,#fff)}.wsc-btnGhost{background:0 0;color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3,#0000001f)}.wsc-btn:disabled{opacity:.5;cursor:default}.wsc-status{font-size:12px;opacity:.7}.wsc-statusBar{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:baseline;padding:10px 12px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2,#0000001a);background:var(--dsw-alias-bg-module-platform,#f5f6f7);font-size:13px}.wsc-statusBar b{font-variant-numeric:tabular-nums}.wsc-badges{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.wsc-keyLink{font-size:11px;color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,#4176e6));text-decoration:none}.wsc-keyLink:hover{text-decoration:underline}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"dsh-websearch/card\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@240xu/dsh-websearch";
			tag.dataset.pluginCss = "dsh-websearch/card";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion

		/** Build a snapshot store (same shape as client-runtime's createSnapshotStore). */
		function createStore(initial) {
			let snap = initial;
			const listeners = new Set();
			return {
				getSnapshot: () => snap,
				subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
				set: (next) => { snap = next; listeners.forEach((l) => l()); },
			};
		}

		/**
		 * Card state machine: reads the bound settings scope snapshot, stages edits,
		 * writes section fields through scope.set/unset and secrets via credentials.
		 */
		class UnifiedSearchCardController {
			constructor(scope, connection, remote, resolveService) {
				this.scope = scope;
				this.connection = connection;
				this.remote = remote;
				/**
				 * Soft service lookup (`ctx.get`). The generated remote namespaces are
				 * injectable services named `remote.<namespace>`: reading
				 * `ctx.remote.credentials` off the context proxy throws
				 * 'cannot get property "remote.credentials" without inject' unless the
				 * entry declares that dependency, and declaring it statically would pend
				 * the whole entry on hosts that do not publish the namespace. Probing by
				 * name keeps the card working on both host lines.
				 */
				this.resolveService = typeof resolveService === "function" ? resolveService : () => undefined;
				this.staged = new Map();      // field -> { text } | { clear: true }
				this.stagedKeys = new Map();  // envRef -> text
				this.keyState = new Map();    // envRef -> {configured}
				this.saving = false;
				this.failed = false;
				this.conflict = false;
				this.failedKeys = new Map(); // envRef -> failure reason
				this.failedFields = new Set();
				this.savedAt = 0;
				this.store = createStore(this.projection());
				this.scope.subscribe(() => this.republish());
			}

			sectionValue(field) {
				return this.scope.getSnapshot().value?.[field];
			}

			fieldState(field) {
				const staged = this.staged.get(field);
				const current = this.sectionValue(field);
				if (staged === undefined) return { text: current === undefined ? "" : String(current), overridden: false };
				return { text: staged.clear ? "" : staged.text, overridden: !staged.clear };
			}

			/**
			 * The enabled backends in their effective priority order: ids named by
			 * `backendOrder` first (in that order), then the rest in registry order —
			 * the same stable rule lib/index.js applies before fan-out.
			 */
			priorityList() {
				const value = this.scope.getSnapshot().value ?? {};
				const enabled = BACKENDS
					.map((b) => b.id)
					.filter((id) => value["enable" + id.charAt(0).toUpperCase() + id.slice(1)] === true);
				const rank = new Map();
				(Array.isArray(value.backendOrder) ? value.backendOrder : []).forEach((id, index) => {
					if (typeof id === "string" && !rank.has(id)) rank.set(id, index);
				});
				return enabled
					.map((id, index) => ({ id, index }))
					.sort((a, b) => {
						const ra = rank.has(a.id) ? rank.get(a.id) : Number.POSITIVE_INFINITY;
						const rb = rank.has(b.id) ? rank.get(b.id) : Number.POSITIVE_INFINITY;
						return ra === rb ? a.index - b.index : ra - rb;
					})
					.map((entry) => entry.id);
			}

			/** Move one backend one step up/down and persist the resulting order. */
			async movePriority(id, delta) {
				const list = this.priorityList();
				const from = list.indexOf(id);
				const to = from + delta;
				if (from < 0 || to < 0 || to >= list.length) return;
				const next = [...list];
				next[from] = list[to];
				next[to] = id;
				try {
					await this.scope.set("backendOrder", next);
				} catch (error) {
					this.failed = true;
					void error;
				}
				this.republish();
			}

			projection() {
				const snap = this.scope.getSnapshot();
				return {
					ready: snap.status === "ready",
					status: snap.status,
					servedNamespaces: typeof this.scope.servedNamespaces === "function" ? this.scope.servedNamespaces() : [],
					writable: snap.writable,
					value: snap.value ?? {},
					keyState: Object.fromEntries(this.keyState),
					stagedKeys: Object.fromEntries([...this.stagedKeys].map(([k, v]) => [k, v.text])),
					stagedCount: this.staged.size + this.stagedKeys.size,
					savedAt: this.savedAt,
					stagedText: (field) => {
						const s = this.staged.get(field);
						return s ? (s.clear ? "" : s.text) : undefined;
					},
					conflict: this.conflict,
					failedKeys: [...this.failedKeys.keys()],
					failedKeyReasons: Object.fromEntries(this.failedKeys),
					failedFields: [...this.failedFields],
					saving: this.saving,
					failed: this.failed,
					priorityList: this.priorityList(),
					version: (this.staged.size + ":" + [...this.staged.keys()].join(",")),
				};
			}

			republish() { this.store.set(this.projection()); }

			edit(field, text) { this.savedAt = 0; this.staged.set(field, { text }); this.republish(); }
			reset(field) { this.staged.delete(field); this.republish(); }
			editKey(envRef, text) { this.savedAt = 0; this.stagedKeys.set(envRef, { text }); this.republish(); }

			/** Toggles write immediately (no staging); globals/keys stage + save. */
			async setToggle(id, checked) {
				try {
					await this.scope.set("enable" + id.charAt(0).toUpperCase() + id.slice(1), checked);
				} catch (err) {
					this.failed = true;
					this.conflict = String(err).includes("SETTINGS_CONFLICT");
				}
				
				this.republish();
			}

			/**
			 * The credential seam this host line exposes.
			 *
			 * 0.2.0 replaces the client-connection `connection.api.credentials`
			 * payload-object form with the generated `ctx.remote.credentials`
			 * namespace, whose descriptor declares positional parameters
			 * (`set(ref, value)`, `describe(refs)`). Calling the old object shape
			 * against it hands the Host an object where it parses a reference name,
			 * so EVERY write is refused as `gateway/bad-request` and every key
			 * silently reads back as unconfigured. Probed at call time so one entry
			 * still serves the 0.1.x line.
			 */
			credentialSeam() {
				const remoteCreds = this.resolveService("remote.credentials");
				if (remoteCreds && typeof remoteCreds.set === "function" && typeof remoteCreds.describe === "function") {
					return { remote: true, api: remoteCreds };
				}
				const legacy = this.connection && this.connection.api && this.connection.api.credentials;
				if (legacy && typeof legacy.set === "function" && typeof legacy.describe === "function") {
					return { remote: false, api: legacy };
				}
				return undefined;
			}

			/**
			 * Pull one reference's view out of a seam's answer, whichever envelope
			 * that seam uses: the remote client answers `{ok, value}` keyed by
			 * reference, the legacy one `{result:{ok, value:{credentials}}}`.
			 */
			static credentialView(seam, answer, ref) {
				if (answer === undefined || answer === null) return undefined;
				const result = seam.remote ? answer : (answer.result ?? answer);
				if (result.ok === false) return undefined;
				const bag = seam.remote ? result.value : (result.value && result.value.credentials);
				return bag ? bag[ref] : undefined;
			}

			async readCredential(ref) {
				try {
					const seam = this.credentialSeam();
					if (seam === undefined) return;
					const answer = seam.remote
						? await seam.api.describe([ref])
						: await seam.api.describe({ refs: [ref] });
					const view = UnifiedSearchCardController.credentialView(seam, answer, ref);
					if (view === undefined) return;
					this.keyState.set(ref, { configured: view?.configured ?? false, writable: view?.writable !== false });
				} catch { /* ignore */ }
				this.republish();
			}

			refreshAllCredentials() {
				for (const b of BACKENDS) if (b.keyEnv) this.readCredential(b.keyEnv);
			}

			async save() {
				if (this.saving) return;
				this.saving = true; this.failed = false;
			this.conflict = false; this.failedFields.clear(); this.republish();
				const doneFields = [];
				const doneKeys = [];
				try {
					for (const [field, staged] of this.staged) {
						// Empty draft clears the override so the schema default applies again.
						if (staged.clear || staged.text === "") { await this.scope.unset(field); doneFields.push(field); continue; }
						if (SELECT_FIELDS[field]) {
							if (!SELECT_FIELDS[field].includes(staged.text)) { this.failed = true; this.failedFields.add(field); continue; }
							await this.scope.set(field, staged.text);
							doneFields.push(field);
							continue;
						}
						if (BOOLEAN_FIELDS.includes(field)) {
							if (staged.text !== "true" && staged.text !== "false") { this.failed = true; this.failedFields.add(field); continue; }
							await this.scope.set(field, staged.text === "true");
							doneFields.push(field);
							continue;
						}
						if (GLOBAL_FIELDS.includes(field)) {
							const num = Number(staged.text);
							// Mirror the server schema bounds client-side so bad input is
							// caught in the UI instead of a failed Host round-trip.
							const BOUNDS = {
								numResults: [1, 50],
								concurrency: [1, 10],
								backendTimeoutMs: [1000, 120000],
							};
							const [lo, hi] = BOUNDS[field] ?? [-Infinity, Infinity];
							if (!Number.isFinite(num) || num < lo || num > hi) { this.failed = true; this.failedFields.add(field); continue; }
							await this.scope.set(field, num);
							doneFields.push(field);
						} else {
							await this.scope.set(field, staged.text);
							doneFields.push(field);
						}
					}
					// A seam probe must never be the reason a save fails silently.
					let seam;
					try { seam = this.credentialSeam(); } catch { seam = undefined; }
					for (const [ref, staged] of this.stagedKeys) {
						const value = staged.text.trim();
						if (value === "") continue;
						try {
							if (seam === undefined) throw new Error("this host exposes no credential surface");
							// Positional on the 0.2.0 remote namespace; payload object on the
							// 0.1.x client-connection seam.
							const answer = seam.remote
								? await seam.api.set(ref, value)
								: await seam.api.set({ ref, value });
							const result = seam.remote ? answer : (answer && answer.result);
							if (result && result.ok === false) {
								throw new Error((result.error && result.error.message) || "credential rejected");
							}
							this.keyState.set(ref, { configured: true, writable: true });
							doneKeys.push(ref);
							this.failedKeys.delete(ref);
						} catch (keyErr) {
							// env-shadowed reference (fail-loud doctrine): isolate so other keys still land.
							this.failed = true;
							this.failedKeys.set(ref, String(keyErr && keyErr.message ? keyErr.message : keyErr).slice(0, 140));
						}
					}
					for (const f of doneFields) this.staged.delete(f);
					for (const k of doneKeys) this.stagedKeys.delete(k);
					if (!this.failed && (doneFields.length > 0 || doneKeys.length > 0)) this.savedAt = Date.now();
				} catch (err) {
					this.failed = true;
					this.conflict = String(err).includes("SETTINGS_CONFLICT");
				}
				this.saving = false;
				this.republish();
			}

			inject() {
				// Slot contract: hooks.{name} must be an observable store; the renderer
				// converts it into props.use{Name} (observableHook). Actions go top-level.
				return {
					hooks: { unifiedSearchCard: this.store },
					edit: (f, t) => this.edit(f, t),
					setToggle: (id, checked) => this.setToggle(id, checked),
					reset: (f) => this.reset(f),
					editKey: (r, t) => this.editKey(r, t),
					movePriority: (id, delta) => this.movePriority(id, delta),
					save: () => this.save(),
					discard: () => { this.staged.clear(); this.stagedKeys.clear(); this.failed = false; this.conflict = false; this.failedKeys.clear(); this.republish(); },
				};
			}
		}

		/** Toggle row for one backend. */
		function ToggleRow(props) {
			const b = props.backend;
			// The Host serves schema-resolved values, so defaults arrive materialized;
			// no client-side default list to drift against the server.
			const checked = props.value === true;
			// Status dot: green keyless-or-keyed, amber enabled-but-key-missing.
			const needsKey = !!b.keyEnv && !b.optionalKey && !props.keyConfigured;
			const dotColor = needsKey ? (checked ? "#e6a700" : "#888") : "#2ea043";
			return react_jsx_runtime.jsxs("label", { className: "wsc-toggle", style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }, children: [
				react_jsx_runtime.jsx("input", {
					type: "checkbox",
					checked,
					onChange: (e) => props.onChange(e.target.checked),
				}),
				react_jsx_runtime.jsx("span", { style: { width: 8, height: 8, borderRadius: "50%", background: dotColor, display: "inline-block" } }),
				react_jsx_runtime.jsx("span", { children: b.label }),
				// b.gated marks a backend that only joins a search when the query
				// calls for it (GitHub). Without the badge the toggle reads like
				// "search here every time", which is exactly the wrong expectation.
				b.gated && react_jsx_runtime.jsx("span", { className: "wsc-badge", style: { fontSize: 10 }, children: props.t("gatedBadge") }),
				needsKey && checked && react_jsx_runtime.jsx("span", { style: { fontSize: 10, opacity: .65 }, children: props.t("keyMissing") }),
			] });
		}

		/** Labeled <select> for enum / boolean settings. */
		function SelectField(props) {
			return react_jsx_runtime.jsxs("div", { children: [
				react_jsx_runtime.jsx("div", { className: "wsc-fieldHead", children: react_jsx_runtime.jsx("span", { className: "wsc-label", children: props.label }) }),
				react_jsx_runtime.jsx("select", {
					className: "wsc-input",
					value: props.value,
					onChange: (e) => props.onChange(e.target.value),
					children: props.options.map((o) =>
						react_jsx_runtime.jsx("option", { value: o.value, children: o.label }, o.value)
					),
				}),
			] });
		}

		/** One credential row: label + status badge + "get key" link + masked input. */
		function KeyField(props) {
			const b = props.backend;
			const t = props.t;
			const ks = props.keyState || {};
			const configured = ks.configured === true;
			const readOnly = configured && ks.writable === false;
			// A stored key says so in the placeholder; the mask keeps it secret and
			// typing a new value replaces it on save.
			const placeholder = readOnly ? t("readOnly") : (configured ? t("keySetPlaceholder") : b.keyEnv);
			return react_jsx_runtime.jsxs("div", { children: [
				react_jsx_runtime.jsxs("div", { className: "wsc-fieldHead", children: [
					react_jsx_runtime.jsx("span", { className: "wsc-label", children: t("keyLabel", { id: b.id }) }),
					react_jsx_runtime.jsxs("span", { className: "wsc-badges", children: [
						KEY_URLS[b.id] && react_jsx_runtime.jsx("a", { className: "wsc-keyLink", href: KEY_URLS[b.id], target: "_blank", rel: "noreferrer", children: t("getKey") }),
						react_jsx_runtime.jsx("span", { className: "wsc-badge" + (configured ? " wsc-badgeOn" : ""), children: configured ? t("keySet") : t("keyUnset") }),
						readOnly && react_jsx_runtime.jsx("span", { className: "wsc-badge", style: { opacity: .75 }, children: t("envProvided") }),
					] }),
				] }),
				react_jsx_runtime.jsx("input", {
					className: "wsc-keyInput", type: "password", autoComplete: "off",
					disabled: readOnly,
					placeholder,
					value: props.value,
					onChange: (e) => props.onChange(e.target.value),
				}),
				react_jsx_runtime.jsx("p", { className: "wsc-hint", children: t("keyHint") }),
				props.failed && react_jsx_runtime.jsx("p", { className: "wsc-hint", style: { color: "#e5534b" }, title: props.failedReason || "", children: t("keyFailed") }),
			] });
		}

		/**
		 * Error boundary around the card. Without one, a throw anywhere in our
		 * subtree makes React unmount the host's whole Web-plugins section, which
		 * renders the page empty. The boundary keeps the host page intact and prints
		 * the failure inline, so it is diagnosable from the UI itself.
		 */
		/** Card translate; bound to ctx.locale in apply(). */
		let cardTranslate = (key) => key;

		class UnifiedSearchCardBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: undefined };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			render() {
				const error = this.state.error;
				if (error !== undefined) {
					const message = error && error.message ? error.message : String(error);
					return react_jsx_runtime.jsx("div", { className: "wsc-card", style: { fontSize: 12 }, children: "unified-search 卡片渲染失败 / card failed: " + message });
				}
				return this.props.children;
			}
		}

		/** Guarded entry the host seat renders (see UnifiedSearchCardBoundary). */
		function UnifiedSearchSectionGuarded(props) {
			// The web-ui.plugin.item seat does not hand the card a t(); merge our own so
			// every props.t(...) call site keeps working.
			const propsWithT = typeof props.t === "function"
				? props
				: { ...props, t: (key, vars) => cardTranslate(key, vars) };
			return react_jsx_runtime.jsx(UnifiedSearchCardBoundary, { children: react_jsx_runtime.jsx(UnifiedSearchSection, propsWithT) });
		}

		/** The card root. */
		function UnifiedSearchSection(props) {
			// Host t() when present, our own locale binding otherwise (see the guarded entry).
			const t = typeof props.t === "function" ? props.t : cardTranslate;
			const state = props.useUnifiedSearchCard((snapshot) => snapshot);
			const card = { edit: props.edit, setToggle: props.setToggle, reset: props.reset, editKey: props.editKey, save: props.save, discard: props.discard };
			// The bundle page renders this section in normal flow (div); the legacy
			// settings list renders occupants inside a <ul>, where an item must be <li>.
			const Root = props.view === "page" ? "div" : "li";
			if (!state.ready) {
				return react_jsx_runtime.jsxs(Root, { className: "wsc-item", children: [react_jsx_runtime.jsxs("details", { className: "wsc-panel", children: [react_jsx_runtime.jsxs("summary", { className: "wsc-summary", children: [react_jsx_runtime.jsx("span", { className: "wsc-icon", children: react_jsx_runtime.jsxs("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [react_jsx_runtime.jsx("circle", { cx: 11, cy: 11, r: 7 }), react_jsx_runtime.jsx("path", { d: "M20 20l-3.6-3.6" })] }) }), react_jsx_runtime.jsxs("span", { className: "wsc-summaryText", children: [react_jsx_runtime.jsx("span", { className: "wsc-summaryTitle", children: t("title") }), react_jsx_runtime.jsx("span", { className: "wsc-subtitle", children: t("summaryHint") })] })] }), react_jsx_runtime.jsx("div", { className: "wsc-card wsc-panelBody", style: { fontSize: 12, opacity: .6 }, children: state.status === "unavailable" ? t("scopeUnavailable", { namespaces: (state.servedNamespaces ?? []).join(", ") || "—" }) : t("scopeLoading") })] })] });
			}

			const toggleField = (id) => "enable" + id.charAt(0).toUpperCase() + id.slice(1);

			// Status summary: enabled backends + configured keys at a glance.
			const enabledCount = BACKENDS.filter((b) => state.value[toggleField(b.id)] === true).length;
			// 10 credential slots: the 8 key-gated backends (the 7 REST backends
			// plus GitHub) and the 2 optional keys (searxng / anysearch) — the
			// counter spans all of them.
			const keySlots = BACKENDS.filter((b) => b.keyEnv);
			const configuredIn = (list) => list.filter((b) => state.keyState[b.keyEnv]?.configured).length;
			const keysReady = configuredIn(keySlots);
			const keysReadyRequired = configuredIn(KEYED);
			const keysReadyOptional = configuredIn(OPTIONAL_KEYS);

			const recencyOptions = [
				{ value: "any", label: props.t("recencyAny") },
				{ value: "day", label: props.t("recencyDay") },
				{ value: "week", label: props.t("recencyWeek") },
				{ value: "month", label: props.t("recencyMonth") },
				{ value: "year", label: props.t("recencyYear") },
			];
			const githubScopeOptions = [
				{ value: "auto", label: props.t("githubScopeAuto") },
				{ value: "repositories", label: props.t("githubScopeRepos") },
				{ value: "code", label: props.t("githubScopeCode") },
				{ value: "issues", label: props.t("githubScopeIssues") },
			];
			const dedupOptions = [
				{ value: "url", label: props.t("dedupUrl") },
				{ value: "url+title", label: props.t("dedupTitle") },
			];
			const boolOptions = [
				{ value: "true", label: props.t("on") },
				{ value: "false", label: props.t("off") },
			];
			const selVal = (f, dflt) => state.stagedText(f) ?? String(state.value[f] ?? dflt);

			// The collapsible chrome is the card's own markup in both seats, so it renders
			// the same on the bundle page and in the legacy settings list.
			return react_jsx_runtime.jsxs(Root, { className: "wsc-item", children: [
				react_jsx_runtime.jsxs("details", { className: "wsc-panel", children: [
					react_jsx_runtime.jsxs("summary", { className: "wsc-summary", children: [react_jsx_runtime.jsx("span", { className: "wsc-icon", children: react_jsx_runtime.jsxs("svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", children: [react_jsx_runtime.jsx("circle", { cx: 11, cy: 11, r: 7 }), react_jsx_runtime.jsx("path", { d: "M20 20l-3.6-3.6" })] }) }), react_jsx_runtime.jsxs("span", { className: "wsc-summaryText", children: [react_jsx_runtime.jsx("span", { className: "wsc-summaryTitle", children: t("title") }), react_jsx_runtime.jsx("span", { className: "wsc-subtitle", children: t("summaryHint") })] })] }),
					react_jsx_runtime.jsxs("div", { className: "wsc-card wsc-panelBody", children: [
							react_jsx_runtime.jsxs("div", { className: "wsc-statusBar", children: [
								react_jsx_runtime.jsxs("span", { children: [props.t("statusEnabled"), ": ", react_jsx_runtime.jsx("b", { children: enabledCount + "/" + BACKENDS.length })] }),
								react_jsx_runtime.jsxs("span", { children: [props.t("statusKeys"), ": ", react_jsx_runtime.jsx("b", { children: keysReady + "/" + keySlots.length })] }),
								react_jsx_runtime.jsx("span", { className: "wsc-hint", style: { margin: 0 }, children: props.t("statusKeysDetail", { req: keysReadyRequired, reqTotal: KEYED.length, opt: keysReadyOptional, optTotal: OPTIONAL_KEYS.length }) }),
							] }),
							react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, opacity: .65 }, children: props.t("description") }),
							(enabledCount === 0) && react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, color: "#e6a700" }, children: props.t("fallbackHint") }),
							(state.writable === false) && react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, color: "#e6a700" }, children: props.t("readOnlyScope") }),
							react_jsx_runtime.jsx("h5", { className: "wsc-sectionTitle wsc-sectionFirst", children: props.t("groupFree") }),
							react_jsx_runtime.jsx("div", { className: "wsc-toggles", children: KEYLESS.map((b) =>
								react_jsx_runtime.jsx(ToggleRow, {
									backend: b,
									t,
									value: state.value[toggleField(b.id)],
									keyConfigured: true,
									onChange: (checked) => card.setToggle(b.id, checked),
								}, b.id)
							) }),
							react_jsx_runtime.jsx("h5", { className: "wsc-sectionTitle", children: props.t("groupKeyed") }),
							react_jsx_runtime.jsx("div", { className: "wsc-toggles", children: KEYED.map((b) =>
								react_jsx_runtime.jsx(ToggleRow, {
									backend: b,
									t,
									value: state.value[toggleField(b.id)],
									keyConfigured: !!state.keyState[b.keyEnv]?.configured,
									onChange: (checked) => card.setToggle(b.id, checked),
								}, b.id)
							) }),
							(Array.isArray(state.priorityList) && state.priorityList.length > 0) && react_jsx_runtime.jsxs("div", { className: "wsc-priorityBlock", children: [
								react_jsx_runtime.jsx("h5", { className: "wsc-sectionTitle", children: props.t("priorityTitle") }),
								react_jsx_runtime.jsx("p", { className: "wsc-hint", style: { margin: 0 }, children: props.t("priorityHint") }),
								react_jsx_runtime.jsx("div", { className: "wsc-priority", children: state.priorityList.map((id, index) =>
									react_jsx_runtime.jsxs("div", { className: "wsc-priorityRow", children: [
										react_jsx_runtime.jsx("span", { className: "wsc-priorityRank", children: index + 1 }),
										react_jsx_runtime.jsx("span", { className: "wsc-priorityName", children: BACKENDS.find((x) => x.id === id)?.label ?? id }),
										react_jsx_runtime.jsx("button", { className: "wsc-btnGhost wsc-priorityBtn", disabled: index === 0, title: props.t("priorityUp"), onClick: () => card.movePriority(id, -1), children: "↑" }),
										react_jsx_runtime.jsx("button", { className: "wsc-btnGhost wsc-priorityBtn", disabled: index === state.priorityList.length - 1, title: props.t("priorityDown"), onClick: () => card.movePriority(id, 1), children: "↓" }),
									] }, id)
								) }),
							] }),
							react_jsx_runtime.jsx("h4", { className: "wsc-sectionTitle", children: props.t("globalsTitle") }),
							react_jsx_runtime.jsxs("div", { className: "wsc-grid", children: [
								react_jsx_runtime.jsxs("div", { children: [
									react_jsx_runtime.jsx("div", { className: "wsc-fieldHead", children: react_jsx_runtime.jsx("span", { className: "wsc-label", children: "numResults" }) }),
									react_jsx_runtime.jsx("input", { className: "wsc-input", value: state.stagedText("numResults") ?? String(state.value.numResults ?? ""), onChange: e => card.edit("numResults", e.target.value), inputMode: "numeric" }),
								] }),
								react_jsx_runtime.jsxs("div", { children: [
									react_jsx_runtime.jsx("div", { className: "wsc-fieldHead", children: react_jsx_runtime.jsx("span", { className: "wsc-label", children: "concurrency" }) }),
									react_jsx_runtime.jsx("input", { className: "wsc-input", value: state.stagedText("concurrency") ?? String(state.value.concurrency ?? ""), onChange: e => card.edit("concurrency", e.target.value), inputMode: "numeric" }),
								] }),
								react_jsx_runtime.jsxs("div", { children: [
									react_jsx_runtime.jsx("div", { className: "wsc-fieldHead", children: react_jsx_runtime.jsx("span", { className: "wsc-label", children: "backendTimeoutMs" }) }),
									react_jsx_runtime.jsx("input", { className: "wsc-input", value: state.stagedText("backendTimeoutMs") ?? String(state.value.backendTimeoutMs ?? ""), onChange: e => card.edit("backendTimeoutMs", e.target.value), inputMode: "numeric" }),
								] }),
							] }),
							react_jsx_runtime.jsx("h4", { className: "wsc-sectionTitle", children: props.t("shapingTitle") }),
							react_jsx_runtime.jsxs("div", { className: "wsc-grid", children: [
								react_jsx_runtime.jsx(SelectField, {
									label: props.t("recencyLabel"),
									value: selVal("recency", "any"),
									options: recencyOptions,
									onChange: (v) => card.edit("recency", v),
								}),
								react_jsx_runtime.jsxs("div", { children: [
									react_jsx_runtime.jsx("div", { className: "wsc-fieldHead", children: react_jsx_runtime.jsx("span", { className: "wsc-label", children: props.t("langLabel") }) }),
									react_jsx_runtime.jsx("input", {
										className: "wsc-input",
										placeholder: props.t("langPlaceholder"),
										value: state.stagedText("language") ?? String(state.value.language ?? ""),
										onChange: e => card.edit("language", e.target.value),
									}),
								] }),
								react_jsx_runtime.jsx(SelectField, {
									label: props.t("dedupLabel"),
									value: selVal("dedupStrategy", "url"),
									options: dedupOptions,
									onChange: (v) => card.edit("dedupStrategy", v),
								}),
								react_jsx_runtime.jsx(SelectField, {
									label: props.t("rerankLabel"),
									value: selVal("rerank", "false"),
									options: boolOptions,
									onChange: (v) => card.edit("rerank", v),
								}),
								react_jsx_runtime.jsx(SelectField, {
									label: props.t("safeSearchLabel"),
									value: selVal("safeSearch", "true"),
									options: boolOptions,
									onChange: (v) => card.edit("safeSearch", v),
								}),
								react_jsx_runtime.jsx(SelectField, {
									label: props.t("telemetryLabel"),
									value: selVal("resultTelemetry", "true"),
									options: boolOptions,
									onChange: (v) => card.edit("resultTelemetry", v),
								}),
							] }),
							(state.value.enableGithub === true) && react_jsx_runtime.jsxs("div", { className: "wsc-grid", children: [
								react_jsx_runtime.jsx(SelectField, {
									label: props.t("githubScopeLabel"),
									value: selVal("githubEndpoints", "auto"),
									options: githubScopeOptions,
									onChange: (v) => card.edit("githubEndpoints", v),
								}),
								react_jsx_runtime.jsx("p", { className: "wsc-hint", style: { gridColumn: "1 / -1", margin: 0 }, children: props.t("githubGatedHint") }),
							] }),
							react_jsx_runtime.jsx("h4", { className: "wsc-sectionTitle", children: props.t("keysTitle") }),
							react_jsx_runtime.jsx("div", { className: "wsc-grid", children: KEYED.map((b) =>
								react_jsx_runtime.jsx(KeyField, {
									backend: b,
									t: props.t,
									keyState: state.keyState[b.keyEnv],
									value: state.stagedKeys[b.keyEnv] ?? "",
									onChange: (v) => card.editKey(b.keyEnv, v),
									failed: state.failedKeys.includes(b.keyEnv),
									failedReason: state.failedKeyReasons?.[b.keyEnv],
								}, b.id)
							) }),
							react_jsx_runtime.jsx("h5", { className: "wsc-sectionTitle", children: props.t("optionalTitle") }),
							react_jsx_runtime.jsx("div", { className: "wsc-grid", children: OPTIONAL_KEYS.map((b) =>
								react_jsx_runtime.jsx(KeyField, {
									backend: b,
									t: props.t,
									keyState: state.keyState[b.keyEnv],
									value: state.stagedKeys[b.keyEnv] ?? "",
									onChange: (v) => card.editKey(b.keyEnv, v),
									failed: state.failedKeys.includes(b.keyEnv),
									failedReason: state.failedKeyReasons?.[b.keyEnv],
								}, b.id)
							) }),
							state.stagedCount > 0 && react_jsx_runtime.jsx("p", { style: { margin: 0, fontSize: 12, opacity: .6 }, children: props.t("unsavedHint") }),
							react_jsx_runtime.jsxs("div", { className: "wsc-actions", children: [
								react_jsx_runtime.jsx("button", { className: "wsc-btn", disabled: state.saving || state.stagedCount === 0 || state.writable === false, onClick: () => card.save(), children: state.saving ? props.t("saving") : props.t("save") }),
								(state.stagedCount > 0) && react_jsx_runtime.jsx("button", { className: "wsc-btn wsc-btnGhost", onClick: () => card.discard(), children: props.t("discard") }),
								state.failed && react_jsx_runtime.jsx("span", { className: "wsc-status", style: { color: "#e5534b" }, children: props.t("failed") }),
								(state.failedFields.length > 0) && react_jsx_runtime.jsx("span", { className: "wsc-status", style: { color: "#e5534b", fontSize: 11 }, children: props.t("invalidFields") + ": " + state.failedFields.join(", ") }),
							state.conflict && react_jsx_runtime.jsx("span", { className: "wsc-status", style: { color: "#e6a700" }, children: props.t("conflict") }),
								!state.failed && !state.saving && state.savedAt > 0 && react_jsx_runtime.jsx("span", { className: "wsc-status", style: { color: "#2ea043" }, children: props.t("savedOk") }),
							] }),
					] }),
				] }),
			] });
		}

		/**
		 * Plugin entry: register the card into the settings plugins page.
		 * Compatibility (compat-audit P0): the settingsScope client service was
		 * removed in DSH 0.1.7. It must NOT be a static inject: when the service
		 * never appears the entry stays pending forever and aborts the whole web
		 * boot ("1 entry did not activate ... waiting for service: settingsScope").
		 * Read it through ctx.get() instead (no inject requirement) and skip the
		 * card with a breadcrumb when no shim provides it.
		 */
		const inject = ["slots", "locale", "connection", "remote"];
		/**
		 * Candidate form keys, most specific first. configForms keys a form by the
		 * SETTINGS NAMESPACE it serves (unified-search here), not by the plugin row id:
		 * asking for a row id returns a form whose namespace is not served, which
		 * stays "unavailable" forever and leaves the card on its loading skeleton.
		 */
		const FORM_IDS = [PLUGIN_NS, "dsh-websearch"];

		/**
		 * Adapt one configForms form to the set/unset pair the card controller drives.
		 * @param form - a configForms form (set/unset or mutate)
		 */
		function adaptForm(form) {
			if (typeof form.set === "function" && typeof form.unset === "function") return form;
			// A form that only exposes mutate() is adapted to the set/unset pair the card
			// controller drives.
			return {
				getSnapshot: () => form.getSnapshot(),
				subscribe: (listener) => form.subscribe(listener),
				set: (field, value) => form.mutate([{ op: "set", path: [field], value }]),
				unset: (field) => form.mutate([{ op: "unset", path: [field] }]),
			};
		}

		/**
		 * A settings scope that follows the served namespaces instead of freezing one
		 * form at load time. configForms keys forms by the SERVED namespace; picking a
		 * candidate while the directory is still empty creates a form that may turn out
		 * to be unserved (status "unavailable") once the mirror loads, which left the
		 * card on its loading skeleton forever. This re-picks on every directory change.
		 *
		 * @param forms - ctx.configForms
		 * @param ids - candidate namespaces, most specific first
		 * @returns the scope the card controller drives, or undefined without configForms
		 */
		function createConfigScope(forms, ids) {
			if (forms === undefined || typeof forms.get !== "function") return undefined;
			const directory = typeof forms.describe === "function" ? forms.describe() : undefined;
			const servedNamespaces = () => {
				try { return directory?.getSnapshot?.()?.view?.namespaces?.map((view) => view.ns) ?? []; } catch { return []; }
			};
			let current;
			let currentId;
			const listeners = new Set();
			const notify = () => listeners.forEach((listener) => listener());
			const candidates = () => {
				const served = servedNamespaces();
				// Unknown directory: the candidate order is the best guess available.
				if (served.length === 0) return ids;
				const inServed = ids.filter((id) => served.includes(id));
				// None of our ids is served: keep the current form and say so via status.
				return inServed.length > 0 ? inServed : ids.slice(0, 1);
			};
			const rebind = () => {
				for (const id of candidates()) {
					let form;
					try { form = forms.get(id); } catch { continue; }
					if (!form || typeof form.getSnapshot !== "function" || typeof form.subscribe !== "function") continue;
					if (form === current || id === currentId) return;
					current = adaptForm(form);
					currentId = id;
					current.subscribe(notify);
					notify();
					return;
				}
			};
			rebind();
			// The mirror starts empty and loads asynchronously; switch when it arrives.
			if (directory !== undefined && typeof directory.subscribe === "function") directory.subscribe(rebind);
			return {
				getSnapshot: () => (current === undefined ? { status: "loading", value: {}, writable: false } : current.getSnapshot()),
				subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
				set: (field, value) => (current === undefined ? Promise.resolve(false) : current.set(field, value)),
				unset: (field) => (current === undefined ? Promise.resolve(false) : current.unset(field)),
				servedNamespaces,
			};
		}

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "websearch: copy dictionaries");
			cardTranslate = (key, vars) => ctx.locale.bind(NS)(key, vars);
			// Settings surface: on the 0.1.5 line the settingsScope shim owns the card and
			// it keeps its own settings section. On 0.2.x settingsScope is gone, so the
			// form comes from configForms and the card lands on THIS bundle's own page in
			// Plugins (plugins.bundle.config, keyed by the package name) instead of the
			// Settings > Web plugins list.
			const settingsScope = ctx.get("settingsScope");
			const legacyScope = settingsScope !== undefined && typeof settingsScope.bind === "function";
			const scope = legacyScope
				? settingsScope.bind({ namespace: PLUGIN_NS })
				: createConfigScope(ctx.get("configForms"), FORM_IDS);
			if (scope === undefined) {
				// No settings surface on this host: skip the card instead of failing the
				// entry (search itself is configured through the server settings form).
				console.warn("[dsh-websearch] no client settings surface (settingsScope or configForms form " + PLUGIN_NS + "); the unified-search settings card is disabled.");
				return;
			}
			const seat = legacyScope ? "settings.section" : "plugins.bundle.config";
			const controller = new UnifiedSearchCardController(scope, ctx.get("connection"), ctx.get("remote"), (name) => ctx.get(name));
			ctx.effect(() => ctx.remote.$on("credentials/updated", () => controller.refreshAllCredentials()), "websearch: credential invalidations");
			// A list slot takes an id/label/order; a keyed slot (plugins.bundle.config)
			// takes the bundle package name and is rendered on that bundle's page.
			const registration = legacyScope
				? {
					name: seat,
					id: "websearch",
					order: 16,
					label: () => ctx.locale.bind(NS)("nav"),
					locale: NS,
					inject: () => controller.inject(),
				}
				: {
					name: seat,
					key: PLUGIN_PACKAGE,
					locale: NS,
					inject: () => controller.inject(),
				};
			ctx.slots.inject(seat, () => ctx.slots.register(registration, UnifiedSearchSectionGuarded));
			controller.refreshAllCredentials();

			// Interop: devkit (and any third-party plugin) dispatches the window
			// event "dsh-websearch:open-settings" to surface this plugin's
			// settings. The host exposes no section-jump API, so: if devkit's
			// toast is available, point the user at the path; otherwise log.
			// (fe-ui C3 keeps devkit toast as the ecosystem standard notifier.)
			const onOpenSettings = () => {
				const hint = "统一搜索设置位于：插件 → @240xu/dsh-websearch";
				try {
					if (window.__dshDevkit && typeof window.__dshDevkit.toast === "function") {
						window.__dshDevkit.toast(hint, { kind: "info" });
						return;
					}
				} catch (e) { /* fall through */ }
				console.info("[dsh-websearch] " + hint);
			};
			// Probe contract (devkit 0.1.1): ready flag + ack event, so the
			// palette can tell "listener present" from "gracefully absent".
			try {
				window.__dshWebsearchSettingsReady = true;
				window.addEventListener("dsh-websearch:open-settings", (ev) => {
					onOpenSettings(ev);
					try {
						window.dispatchEvent(new CustomEvent("dsh-websearch:open-settings:ack"));
					} catch (e) { /* CustomEvent unavailable */ }
				});
				ctx.effect(() => () => window.removeEventListener("dsh-websearch:open-settings", onOpenSettings), "websearch: open-settings listener");
			} catch (e) { /* non-window env */ }
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
