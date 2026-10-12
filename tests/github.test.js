// tests/github.test.js — GitHub vertical backend (v2.10.0).
//
// The design contract this file pins (docs/design-github-backend.md):
//   1. the intent gate fires on GitHub queries and stays silent on ordinary
//      ones — asserted against this machine's real 31-query history;
//   2. endpoint selection follows the measured first-match priority;
//   3. at most ONE request per round, enforced by the local budget;
//   4. total_count 0 is a SUCCESS with zero sources, never an error;
//   5. a missing token is CREDENTIAL_MISSING, not a generic failure;
//   6. the provider drops a gated-out backend from the round entirely.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  githubBackend,
  hasGithubIntent,
  selectGithubEndpoint,
  prepareGithubQuery,
  parseGithubResult,
  githubErrorDetail,
  githubBudgetAllows,
  noteGithubCall,
  resetGithubBudget,
  GITHUB_ENDPOINTS,
} from "../lib/backends/github.js";
import { WebError } from "@deepseek-ai/dsh-web";

let _origFetch;
let calls = [];
function mockFetch(handler) {
  _origFetch = globalThis.fetch;
  calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(url, init);
  };
}
afterEach(() => {
  if (_origFetch) globalThis.fetch = _origFetch;
  resetGithubBudget();
});

function jsonRes(obj, status = 200, headers = {}) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

const OPTS = (over = {}) => ({
  baseURL: "https://api.github.com",
  endpoints: "auto",
  maxPerMinute: 6,
  resolveApiKey: async () => "ghp_test_token",
  ...over,
});

// ---------------------------------------------------------------------------
// 1. The intent gate — the whole point of this backend.
// ---------------------------------------------------------------------------

test("github: gate fires on github/repo vocabulary and explicit qualifiers", () => {
  for (const q of [
    "github dsh plugins",
    "awesome github repos",
    "site:github.com dsh plugin registry",
    "dsh-websearch plugin github repository",
    "找一下开源项目 源码",
    "repo:240xu/dsh-websearch",
    "org:deepseek-ai websearch",
    "filename:client.js addEventListener",
    "language:typescript ctx.web",
    "dsh websearch is:issue",
    "is:pr websearch",
  ]) {
    assert.equal(hasGithubIntent(q), true, "should gate ON: " + q);
  }
});

test("github: gate stays silent on ordinary queries (real 31-query history)", () => {
  // Every non-GitHub entry from this machine's actual search history. Two of
  // the 31 real queries mention github; these 29 must never fire the backend.
  const real = [
    "tidal potential station displacement h2 geoid 1+k2 free air correction solid earth tide effective potential",
    "optical clock gravitational potential frequency shift Earth tide Love number k2 h2 correction",
    "IERS conventions solid earth tide vertical displacement gravimetric factor delta 1+h2-3/2k2",
    "tidal Love number h2 value 0.707 solid earth tide displacement model",
    "IERS TN36 chapter 7 nominal Love numbers table h2",
    '"0.707" 固体潮 位移 系数 勒夫数',
    "solid earth tide vertical displacement formula 1+k2-h2 vs h2 which convention",
    "Agnew 2015 Earth Tides Treatise on Geophysics Love number h2 value",
    "勒夫数 h2 0.6 固体潮 位移 中国 许厚泽 潮汐因子",
    "IERS nominal Love numbers h2 0.6078 l2 0.0847 k2 0.298 station displacement",
    "solid earth tide vertical displacement h2 0.61 typical value IERS nominal",
    "负荷潮 勒夫数 0.707 中国 重力固体潮",
    'tidal displacement "0.7067" OR "0.7071" coefficient solid earth tide code',
    "固体潮 位移 计算 公式 系数 0.707 潮汐因子",
    "固体潮 勒夫数 0.707 模型",
    "ETERNA solid earth tide h2 nominal value 0.6078 0.707",
    "0.7071 1/sqrt(2) Love number tidal displacement scaling",
    "solid earth tide Love number h2 0.707",
    "ocean tide loading BLQ coefficients http GET API station latitude longitude model fes2014",
    "FES2014 ocean tide grid download public mirror netcdf 中国 镜像",
    "dsh-websearch anysearch wiring test",
    "pyTMD ocean tide loading body tide solid earth tide module",
    "NLOADF SPOTL Green's function ocean tide loading program",
    "FES2022 ocean tide model download AVISO FES2022b grids",
    "ocean tide loading service FES2014 FES2022 BLQ station coefficients ETOL",
    "ET20 EOT20 ocean tide model tide gauge standard",
    "CSR 3.0 ocean tide loading Green's function standard model",
    "公认 海潮负荷 模型 FES2014 TPXO9 GOT4.10 NAO99b 比较",
    "IERS Conventions 2010 solid Earth tide model standard Wahr Dehant",
  ];
  for (const q of real) {
    assert.equal(hasGithubIntent(q), false, "should gate OFF: " + q);
  }
});

test("github: gate is false for empty / non-string queries", () => {
  assert.equal(hasGithubIntent(""), false);
  assert.equal(hasGithubIntent(undefined), false);
  assert.equal(hasGithubIntent(null), false);
  assert.equal(hasGithubIntent(42), false);
});

// ---------------------------------------------------------------------------
// 2. Endpoint selection (measured priority).
// ---------------------------------------------------------------------------

test("github: endpoint selection follows the measured priority", () => {
  const cases = [
    // [query, expected]
    ["github dsh plugins", "repositories"],
    ["awesome dsh repos", "repositories"],
    ["filename:client.js addEventListener", "code"],
    ["language:typescript ctx.web", "code"],
    ["path:lib/backends/exa.js inferExaCategory", "code"],
    ["extension:js websearch", "code"],
    // Measured: repositories returns 0 for repo:+term, code returns 3.
    ["repo:240xu/dsh-websearch inferExaCategory", "code"],
    ["org:deepseek-ai websearch", "code"],
    // Issue selectors win over repo scope.
    ["repo:240xu/dsh-websearch is:issue", "issues"],
    ["dsh websearch is:pr", "issues"],
    ["label:bug websearch", "issues"],
    ["github websearch bug report", "issues"],
  ];
  for (const [q, expected] of cases) {
    assert.equal(selectGithubEndpoint(q, "auto"), expected, q);
  }
});

test("github: a pinned githubEndpoints short-circuits inference", () => {
  assert.equal(selectGithubEndpoint("github dsh plugins", "code"), "code");
  assert.equal(selectGithubEndpoint("filename:x.js", "repositories"), "repositories");
  assert.equal(selectGithubEndpoint("is:issue x", "repositories"), "repositories");
  // Unknown / absent -> infer.
  assert.equal(selectGithubEndpoint("github dsh plugins", "bogus"), "repositories");
  assert.equal(selectGithubEndpoint("github dsh plugins", undefined), "repositories");
});

test("github: GITHUB_ENDPOINTS lists every accepted scope", () => {
  assert.deepEqual(GITHUB_ENDPOINTS, ["auto", "repositories", "code", "issues"]);
});

// ---------------------------------------------------------------------------
// 3. Query preparation.
// ---------------------------------------------------------------------------

test("github: qualifier queries pass through untouched", () => {
  for (const q of [
    "repo:240xu/dsh-websearch inferExaCategory",
    "filename:client.js addEventListener",
    "is:issue websearch",
    "language:typescript ctx.web",
  ]) {
    assert.equal(prepareGithubQuery(q), q);
  }
});

test("github: CJK queries pass through untouched (token stripping would mangle them)", () => {
  const q = "固体潮 勒夫数 0.707 模型";
  assert.equal(prepareGithubQuery(q), q);
});

test("github: bare English queries drop fillers and cap the token count", () => {
  const out = prepareGithubQuery("how do I find the dsh plugin repository please");
  assert.ok(out.split(" ").length <= 8, "token cap: " + out);
  assert.ok(!/\bhow\b/.test(out) && !/\bplease\b/.test(out), "fillers dropped: " + out);
  assert.match(out, /dsh/);
  // A long scientific question is reduced but NOT rescued — documented limit.
  const long = prepareGithubQuery("tidal potential station displacement h2 geoid free air correction solid earth tide effective potential");
  assert.ok(long.split(" ").length <= 8);
});

// ---------------------------------------------------------------------------
// 4. Parsers.
// ---------------------------------------------------------------------------

test("github: parse repositories into url/title/snippet with stars and language", () => {
  const sources = parseGithubResult({
    total_count: 1,
    items: [{
      full_name: "240xu/dsh-websearch",
      html_url: "https://github.com/240xu/dsh-websearch",
      description: "Unified web search provider",
      stargazers_count: 42,
      language: "JavaScript",
      pushed_at: "2026-10-10T12:00:00Z",
    }],
  }, "repositories", 8);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, "https://github.com/240xu/dsh-websearch");
  assert.equal(sources[0].title, "240xu/dsh-websearch");
  assert.match(sources[0].snippet, /42/);
  assert.match(sources[0].snippet, /JavaScript/);
  assert.match(sources[0].snippet, /2026-10-10/);
  assert.match(sources[0].snippet, /Unified web search provider/);
});

test("github: parse code into repo/path titles with text_matches fragments", () => {
  const sources = parseGithubResult({
    total_count: 1,
    items: [{
      path: "lib/backends/exa.js",
      html_url: "https://github.com/240xu/dsh-websearch/blob/abc/lib/backends/exa.js",
      repository: { full_name: "240xu/dsh-websearch" },
      text_matches: [{ fragment: "export function\n  inferExaCategory(query) {" }],
    }],
  }, "code", 8);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].title, "240xu/dsh-websearch/lib/backends/exa.js");
  assert.match(sources[0].snippet, /inferExaCategory/);
  // Whitespace is collapsed so the snippet stays one line.
  assert.ok(!sources[0].snippet.includes("\n"));
});

test("github: parse issues and PRs, marking PRs explicitly", () => {
  const sources = parseGithubResult({
    total_count: 2,
    items: [
      { title: "Client fiber deadlocks web boot", state: "open", html_url: "https://github.com/240xu/dsh-websearch/issues/4", body: "settingsScope stays in inject" },
      { title: "Add plugin", state: "closed", html_url: "https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6962", body: "new entry", pull_request: { url: "x" } },
    ],
  }, "issues", 8);
  assert.equal(sources.length, 2);
  assert.match(sources[0].title, /^\[open\] Client fiber/);
  assert.ok(!sources[0].title.includes("(PR)"));
  assert.match(sources[1].title, /\(PR\)/);
  assert.match(sources[0].snippet, /settingsScope/);
});

test("github: parser drops items without an html_url and honours maxResults", () => {
  const sources = parseGithubResult({
    items: [
      { full_name: "no-url/repo" },
      { full_name: "a/1", html_url: "https://github.com/a/1" },
      { full_name: "a/2", html_url: "https://github.com/a/2" },
      { full_name: "a/3", html_url: "https://github.com/a/3" },
    ],
  }, "repositories", 2);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://github.com/a/1");
});

test("github: total_count 0 parses to an empty list, not an error", () => {
  assert.deepEqual(parseGithubResult({ total_count: 0, items: [] }, "repositories", 8), []);
  assert.deepEqual(parseGithubResult({}, "repositories", 8), []);
  assert.deepEqual(parseGithubResult(null, "code", 8), []);
});

// ---------------------------------------------------------------------------
// 5. Local budget (the "at most one call per round" contract).
// ---------------------------------------------------------------------------

test("github: local budget caps calls inside the rolling minute window", () => {
  resetGithubBudget();
  const t0 = 1_000_000;
  assert.equal(githubBudgetAllows(3, t0), true);
  noteGithubCall(t0);
  noteGithubCall(t0 + 1000);
  noteGithubCall(t0 + 2000);
  assert.equal(githubBudgetAllows(3, t0 + 3000), false, "3/3 used");
  // The window slides: after 60s the oldest calls age out.
  assert.equal(githubBudgetAllows(3, t0 + 60_001), true);
});

test("github: exceeding the budget skips the round without any request", async () => {
  resetGithubBudget();
  mockFetch(() => jsonRes({ total_count: 0, items: [] }));
  const opts = OPTS({ maxPerMinute: 1 });
  await githubBackend.search({ query: "github a", maxResults: 3 }, undefined, opts, {});
  assert.equal(calls.length, 1);
  await assert.rejects(
    () => githubBackend.search({ query: "github b", maxResults: 3 }, undefined, opts, {}),
    (err) => err instanceof WebError && /budget/.test(err.message),
  );
  assert.equal(calls.length, 1, "the second round issued no request");
});

// ---------------------------------------------------------------------------
// 6. search(): request shape, credential, failures.
// ---------------------------------------------------------------------------

test("github: request carries the token, API version and text-match for code", async () => {
  resetGithubBudget();
  mockFetch(() => jsonRes({ total_count: 1, items: [{ full_name: "a/b", html_url: "https://github.com/a/b", stargazers_count: 1 }] }));
  const out = await githubBackend.search(
    { query: "repo:a/b inferExaCategory", maxResults: 5 },
    undefined,
    OPTS(),
    {},
  );
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.origin + url.pathname, "https://api.github.com/search/code");
  assert.equal(url.searchParams.get("q"), "repo:a/b inferExaCategory");
  assert.equal(url.searchParams.get("per_page"), "5");
  assert.equal(calls[0].init.headers.Authorization, "Bearer ghp_test_token");
  assert.equal(calls[0].init.headers["X-GitHub-Api-Version"], "2022-11-28");
  assert.equal(calls[0].init.headers.Accept, "application/vnd.github.text-match+json");
  assert.equal(out.sources.length, 1);
});

test("github: repositories requests use the plain JSON accept header", async () => {
  resetGithubBudget();
  mockFetch(() => jsonRes({ total_count: 0, items: [] }));
  await githubBackend.search({ query: "github dsh plugins", maxResults: 3 }, undefined, OPTS(), {});
  assert.equal(new URL(calls[0].url).pathname, "/search/repositories");
  assert.equal(calls[0].init.headers.Accept, "application/vnd.github+json");
});

test("github: a missing token is CREDENTIAL_MISSING, not a generic error", async () => {
  resetGithubBudget();
  await assert.rejects(
    () => githubBackend.search({ query: "github x", maxResults: 3 }, undefined, OPTS({ resolveApiKey: async () => undefined }), {}),
    (err) => err instanceof WebError && err.code === "WEB_PROVIDER_CREDENTIAL_MISSING",
  );
});

test("github: 0 results is a success with zero sources (never all-failed)", async () => {
  resetGithubBudget();
  const outcomes = [];
  mockFetch(() => jsonRes({ total_count: 0, items: [] }));
  const out = await githubBackend.search(
    { query: "github zzzz-nothing-xyzzy", maxResults: 3 },
    undefined,
    OPTS(),
    { recordOutcome: (o) => outcomes.push(o) },
  );
  assert.deepEqual(out.sources, []);
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, "ok");
  assert.equal(outcomes[0].count, 0);
});

test("github: a 403 names the rate limit and its reset window", async () => {
  resetGithubBudget();
  mockFetch(() => jsonRes(
    { message: "API rate limit exceeded" },
    403,
    { "retry-after": "42", "x-ratelimit-remaining": "0" },
  ));
  await assert.rejects(
    () => githubBackend.search({ query: "github x", maxResults: 3 }, undefined, OPTS(), {}),
    (err) => {
      assert.ok(err instanceof WebError);
      assert.match(err.message, /HTTP 403/);
      assert.match(err.message, /retry after 42s/);
      assert.match(err.message, /quota exhausted/);
      return true;
    },
  );
});

test("github: githubErrorDetail falls back to the reset timestamp", () => {
  const reset = Math.floor(Date.now() / 1000) + 120;
  const detail = githubErrorDetail(
    { status: 429, headers: { get: (n) => (n === "x-ratelimit-reset" ? String(reset) : null) } },
    '{"message":"slow down"}',
  );
  assert.match(detail, /HTTP 429/);
  assert.match(detail, /resets in \d+s/);
  assert.match(detail, /slow down/);
});

test("github: invalid JSON is an error, not a silent empty result", async () => {
  resetGithubBudget();
  mockFetch(() => jsonRes("not json at all", 200));
  await assert.rejects(
    () => githubBackend.search({ query: "github x", maxResults: 3 }, undefined, OPTS(), {}),
    (err) => err instanceof WebError && /invalid JSON/.test(err.message),
  );
});

test("github: available() reflects whether a key resolver exists", () => {
  assert.equal(githubBackend.id, "github");
  assert.equal(githubBackend.requiresCredential, true);
  assert.equal(githubBackend.available({ resolveApiKey: async () => "x" }), true);
  assert.equal(githubBackend.available({}), false);
  assert.equal(githubBackend.available(undefined), false);
});

test("github: appliesTo delegates to the intent gate", () => {
  assert.equal(githubBackend.appliesTo({ query: "github dsh plugins" }), true);
  assert.equal(githubBackend.appliesTo({ query: "tidal Love number h2" }), false);
  assert.equal(githubBackend.appliesTo({}), false);
});

// ---------------------------------------------------------------------------
// 7. Provider integration: the gate removes the backend from the round.
// ---------------------------------------------------------------------------

test("provider: a gated-out backend issues no request and adds no telemetry", async () => {
  resetGithubBudget();
  mockFetch(() => jsonRes({ total_count: 1, items: [{ full_name: "a/b", html_url: "https://github.com/a/b", stargazers_count: 1 }] }));
  const { createUnifiedSearchProvider } = await import("../lib/provider.js");
  const mkProvider = () => createUnifiedSearchProvider({
    ctx: {},
    resolveOptions: () => ({
      enabledBackends: ["github"],
      numResults: 3,
      backends: { github: OPTS() },
    }),
    backends: { github: githubBackend },
  });

  // GitHub query -> participates.
  const on = await mkProvider().search({ query: "github dsh plugins", maxResults: 3 });
  assert.equal(calls.length, 1);
  assert.match(on.content, /github ✓\d+ms\/1/);

  // Ordinary query -> the backend never runs and never appears in telemetry.
  resetGithubBudget();
  calls = [];
  const off = await mkProvider().search({ query: "tidal Love number h2 value", maxResults: 3 });
  assert.equal(calls.length, 0, "gated-out backend issued no request");
  assert.ok(!/\bgithub\b/.test(off.content ?? ""), "gated-out backend is absent from telemetry: " + off.content);
});

test("provider: a gated-out backend does not count as an all-failed round", async () => {
  resetGithubBudget();
  const { createUnifiedSearchProvider } = await import("../lib/provider.js");
  const provider = createUnifiedSearchProvider({
    ctx: {},
    resolveOptions: () => ({
      enabledBackends: ["github"],
      numResults: 3,
      backends: { github: OPTS() },
    }),
    backends: { github: githubBackend },
  });
  // No fetch mock: the gate must prevent any call, so no network is needed.
  const res = await provider.search({ query: "solid earth tide h2", maxResults: 3 });
  assert.deepEqual(res.sources, []);
  assert.equal(res.truncated, false);
});

// ---------------------------------------------------------------------------
// 8. Settings schema.
// ---------------------------------------------------------------------------

test("github: settings schema exposes the backend (opt-in, credential ref, scope)", async () => {
  const { Config } = await import("../lib/index.js");
  const dict = Config.dict ?? {};
  assert.equal(dict.enableGithub?.meta?.default, false, "GitHub is opt-in");
  assert.ok(String(dict.enableGithub?.meta?.description ?? "").length > 0);
  assert.equal(dict.githubApiKeyEnv?.meta?.default, "DSH_WEBSEARCH_GITHUB_TOKEN");
  assert.equal(dict.githubApiKeyEnv?.meta?.role, "credential-ref");
  assert.equal(dict.githubBaseURL?.meta?.default, "https://api.github.com");
  assert.equal(dict.githubEndpoints?.meta?.default, "auto");
  assert.equal(dict.githubMaxPerMinute?.meta?.default, 6);
  assert.ok(dict.githubApiKeyEnv?.meta?.description);
  assert.ok(dict.githubBaseURL?.meta?.description);
  assert.ok(dict.githubEndpoints?.meta?.description);
  assert.ok(dict.githubMaxPerMinute?.meta?.description);
});

/**
 * Regression guard for the read-only-credential bug (2026-10-12).
 *
 * The default ref MUST be a name the plugin owns. The first implementation used
 * "GITHUB_AUTHKEY" — an ambient variable the host process already had — so the
 * credentials provider resolved it from the inherited environment and
 * describe() answered {configured:true, source:"env", writable:false}. The card
 * then rendered 只读/环境变量提供 and a save would have been rejected by
 * assertUnshadowed() instead of stored. A plugin-owned ref is never supplied by
 * the environment, so the credential file is the only possible source.
 */
test("github: the default credential ref is plugin-owned, never an ambient env name", async () => {
  const { Config } = await import("../lib/index.js");
  const ref = Config.dict.githubApiKeyEnv?.meta?.default;
  assert.equal(ref, "DSH_WEBSEARCH_GITHUB_TOKEN");
  assert.ok(/^DSH_WEBSEARCH_/.test(ref),
    "the ref must live in the plugin's own namespace: an ambient name (e.g. GITHUB_AUTHKEY) " +
    "makes the host report source=env/writable=false and the UI cannot save it");
  assert.ok(!/^(GITHUB_AUTHKEY|GITHUB_TOKEN|GH_TOKEN)$/.test(ref));
});

test("github: resolveOptions threads the GitHub scope and budget to the backend", async () => {
  const { resolveOptions } = await import("../lib/index.js");
  const opts = resolveOptions({ get: () => undefined }, { enableGithub: true, githubEndpoints: "issues", githubMaxPerMinute: 3 });
  assert.ok(opts.enabledBackends.includes("github"));
  assert.equal(opts.backends.github.endpoints, "issues");
  assert.equal(opts.backends.github.maxPerMinute, 3);
  assert.equal(opts.backends.github.apiKeyEnv, "DSH_WEBSEARCH_GITHUB_TOKEN");
  // An out-of-vocabulary scope degrades to auto instead of reaching the backend.
  const bad = resolveOptions({ get: () => undefined }, { enableGithub: true, githubEndpoints: "everything" });
  assert.equal(bad.backends.github.endpoints, "auto");
});
