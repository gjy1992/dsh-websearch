// tests/anysearch.test.js — AnySearch backend wiring (v2.9.0).
// Covers the optional-key (anonymous) request shape, documented 1-10 result cap,
// filter mapping, both upstream failure shapes, credential redaction in errors,
// and participation in the provider fan-out.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  anysearchBackend,
  parseAnysearchResult,
  redactAnysearchSecrets,
  ANYSEARCH_MAX_RESULTS,
} from "../lib/backends/anysearch.js";
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
afterEach(() => { if (_origFetch) globalThis.fetch = _origFetch; });

function jsonRes(obj, status = 200) {
  const body = typeof obj === "string" ? obj : JSON.stringify(obj);
  return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) };
}

const ENVELOPE = (results) => ({
  code: 0,
  message: "success",
  request_id: "req-1",
  data: { results, metadata: { total_results: results.length, search_time_ms: 42 } },
});

test("anysearch: keyless-capable — no key required, no Authorization header", async () => {
  assert.equal(anysearchBackend.id, "anysearch");
  assert.equal(anysearchBackend.requiresCredential, false);
  assert.equal(anysearchBackend.available({}), true);
  assert.equal(anysearchBackend.available(undefined), true);

  mockFetch(() => jsonRes(ENVELOPE([{ url: "https://a.example", title: "A", snippet: "s" }])));
  const out = await anysearchBackend.search({ query: "q", maxResults: 5 }, undefined, {}, {});

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.anysearch.com/v1/search");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.match(calls[0].init.headers["X-Anysearch-Client"], /^dsh-websearch\//);
  assert.deepEqual(JSON.parse(calls[0].init.body), { query: "q", max_results: 5, format: "json" });
  assert.equal(out.sources.length, 1);
  assert.equal(out.sources[0].url, "https://a.example");
  assert.equal(out.sources[0].snippet, "s");
});

test("anysearch: optional key adds Bearer; language/zone mapped; max_results clamped to 10", async () => {
  mockFetch(() => jsonRes(ENVELOPE([{ url: "https://b.example", title: "B", content: "c" }])));
  await anysearchBackend.search(
    { query: "q", maxResults: 50, filters: { lang: "zh-CN", region: "cn", recency: "day" } },
    undefined,
    { resolveApiKey: async () => "TESTKEY" },
    {},
  );
  const body = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.headers.Authorization, "Bearer TESTKEY");
  assert.equal(body.max_results, ANYSEARCH_MAX_RESULTS);
  assert.equal(body.language, "zh-CN");
  assert.equal(body.zone, "cn");
  assert.equal(body.time_range, undefined, "AnySearch has no recency param - none is invented");
  assert.equal(body.tag, undefined, "vertical tag/params pair is deliberately not wired");
});

test("anysearch: HTTP 200 with a non-zero business code is a backend failure", async () => {
  mockFetch(() => jsonRes({ code: -1, message: "Missing required params for tag 'code.doc': library.", request_id: "req-bad" }));
  await assert.rejects(
    anysearchBackend.search({ query: "q", maxResults: 5 }, undefined, {}, {}),
    (err) => err instanceof WebError
      && err.code === "WEB_PROVIDER_ERROR"
      && /Missing required params/.test(err.message)
      && /request_id: req-bad/.test(err.message),
  );
});

test("anysearch: anonymous 402 credentials are redacted and a quota hint is added", async () => {
  const upstream = {
    code: -1,
    message: "Your account and API key have been automatically generated. Use the API key below to continue.\n"
      + "username=alice\npassword=hunter2hunter2\napi_key=sk-live-SECRETVALUE123",
    request_id: "req-402",
  };
  mockFetch(() => jsonRes(upstream, 402));
  await assert.rejects(
    anysearchBackend.search({ query: "q", maxResults: 5 }, undefined, {}, {}),
    (err) => {
      assert.ok(err instanceof WebError && err.code === "WEB_PROVIDER_ERROR");
      assert.ok(!err.message.includes("SECRETVALUE123"), "api key must not be echoed");
      assert.ok(!err.message.includes("hunter2hunter2"), "password must not be echoed");
      assert.ok(/api_key=\[redacted\]/.test(err.message), "api_key value replaced");
      assert.ok(err.message.includes("password=[redacted]"), "password value replaced");
      assert.ok(/free quota exhausted/.test(err.message), "quota hint present");
      assert.ok(/HTTP 402/.test(err.message));
      return true;
    },
  );
});

test("anysearch: HTTP 5xx becomes WEB_PROVIDER_ERROR carrying the upstream message", async () => {
  mockFetch(() => jsonRes({ code: -1, message: "Search service unavailable.", request_id: "r-502" }, 502));
  await assert.rejects(
    anysearchBackend.search({ query: "q", maxResults: 5 }, undefined, {}, {}),
    (err) => err.code === "WEB_PROVIDER_ERROR"
      && /Search service unavailable/.test(err.message)
      && /HTTP 502/.test(err.message),
  );
});

test("anysearch: invalid JSON 200 response is an error, never a silent empty result", async () => {
  mockFetch(() => jsonRes("<html>not json</html>"));
  await assert.rejects(
    anysearchBackend.search({ query: "q", maxResults: 5 }, undefined, {}, {}),
    (err) => err.code === "WEB_PROVIDER_ERROR" && /invalid JSON response/.test(err.message),
  );
});

test("redactAnysearchSecrets: strips assignment-style credentials, keeps prose", () => {
  const out = redactAnysearchSecrets(
    "quota exhausted\nusername=bob\npassword=pw123456\napi_key=abcdef123456 token: xyz",
  );
  assert.ok(!out.includes("pw123456"));
  assert.ok(!out.includes("abcdef123456"));
  assert.ok(!out.includes("xyz"));
  assert.ok(out.includes("quota exhausted"));

  // Quoted JSON-style pairs are redacted too (defense in depth).
  const quoted = redactAnysearchSecrets('{"password":"pw654321","api_key":"abcdef654321"}');
  assert.ok(!quoted.includes("pw654321"));
  assert.ok(!quoted.includes("abcdef654321"));
});

test("provider: anysearch alone is available and participates in the fan-out", async () => {
  mockFetch(() => jsonRes(ENVELOPE([{ url: "https://c.example", title: "C", snippet: "s" }])));
  const { createUnifiedSearchProvider } = await import("../lib/provider.js");
  const provider = createUnifiedSearchProvider({
    ctx: {},
    resolveOptions: () => ({
      enabledBackends: ["anysearch"],
      numResults: 5,
      backends: { anysearch: { apiKeyEnv: "ANYSEARCH_API_KEY", baseURL: "https://api.anysearch.com/v1/search", resolveApiKey: async () => undefined } },
    }),
    backends: { anysearch: anysearchBackend },
  });
  assert.equal(provider.available(), true);
  const res = await provider.search({ query: "q", maxResults: 5 });
  assert.equal(res.sources.length, 1);
  assert.equal(res.sources[0].url, "https://c.example");
  assert.match(res.content, /\[websearch backends\] \(diagnostic only, not a source\) anysearch ✓\d+ms\/1/);
});

test("settings schema exposes the anysearch backend (toggle off by default, key ref, base URL)", async () => {
  const { Config } = await import("../lib/index.js");
  const dict = Config.dict ?? {};
  assert.equal(dict.enableAnysearch?.meta?.default, false, "AnySearch is opt-in");
  assert.ok(String(dict.enableAnysearch?.meta?.description ?? "").length > 0);
  assert.equal(dict.anysearchApiKeyEnv?.meta?.default, "ANYSEARCH_API_KEY");
  assert.equal(dict.anysearchApiKeyEnv?.meta?.role, "credential-ref");
  assert.equal(dict.anysearchBaseURL?.meta?.default, "https://api.anysearch.com/v1/search");
  assert.ok(dict.anysearchApiKeyEnv?.meta?.description);
  assert.ok(dict.anysearchBaseURL?.meta?.description);
});
