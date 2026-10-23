/**
 * v2.11.0 — DeepSeek direct Search & Fetch APIs (dsh 0.2.1 web-deepseek-api).
 * Pins the request shape, the response mapping, and the fetch provider's
 * availability rule so a change in the upstream interface fails here first.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  deepseekBackend,
  parseDeepseekApiResult,
  resolveDeepseekApiBase,
  DEFAULT_DEEPSEEK_API_BASE_URL,
} from "../lib/backends/deepseek-api.js";
import {
  createDeepseekFetchProvider,
  parseDeepseekFetchResult,
  DEEPSEEK_FETCH_API_PROVIDER_ID,
} from "../lib/fetch-provider.js";

test("resolveDeepseekApiBase keeps a custom base, trims slashes, maps the legacy Messages base", () => {
  assert.equal(resolveDeepseekApiBase("https://api.deepseek.com/v1/tools"), DEFAULT_DEEPSEEK_API_BASE_URL);
  assert.equal(resolveDeepseekApiBase("https://api.deepseek.com/v1/tools//"), DEFAULT_DEEPSEEK_API_BASE_URL);
  assert.equal(resolveDeepseekApiBase("https://proxy.example/api/v1/tools/"), "https://proxy.example/api/v1/tools");
  // Pre-2.11 saved value: the Messages-API base.
  assert.equal(resolveDeepseekApiBase("https://api.deepseek.com/anthropic/v1"), DEFAULT_DEEPSEEK_API_BASE_URL);
  assert.equal(resolveDeepseekApiBase(undefined), DEFAULT_DEEPSEEK_API_BASE_URL);
});

test("parseDeepseekApiResult maps url/title/snippet/date and honors maxResults", () => {
  const payload = {
    results: [
      { url: "https://a.example/1", title: "A", snippet: "sa", date: "2026-10-01" },
      { url: "https://a.example/2", title: "", snippet: "", date: null },
      { url: "https://a.example/3", title: "C", snippet: "sc", date: null },
    ],
  };
  assert.deepEqual(parseDeepseekApiResult(payload, 8), [
    { url: "https://a.example/1", title: "A", snippet: "sa", publishedAt: "2026-10-01" },
    { url: "https://a.example/2" },
    { url: "https://a.example/3", title: "C", snippet: "sc" },
  ]);
  assert.equal(parseDeepseekApiResult(payload, 2).length, 2);
});

test("parseDeepseekApiResult: empty results is a successful empty search", () => {
  assert.deepEqual(parseDeepseekApiResult({ results: [] }, 8), []);
});

test("parseDeepseekApiResult rejects malformed payloads instead of dropping items", () => {
  assert.throws(() => parseDeepseekApiResult({}, 8), /invalid JSON/);
  assert.throws(() => parseDeepseekApiResult({ results: [{ title: "x", snippet: "" }] }, 8), /invalid result item/);
  assert.throws(
    () => parseDeepseekApiResult({ results: [{ url: "https://x", title: "t", snippet: "s", date: 5 }] }, 8),
    /invalid result item/,
  );
});

test("deepseek backend: search posts the Search API body and maps the response", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ results: [{ url: "https://b.example", title: "B", snippet: "sb", date: null }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const result = await deepseekBackend.search(
      { query: "deepseek api", maxResults: 5 },
      undefined,
      { baseURL: "https://api.deepseek.com/v1/tools", resolveApiKey: async () => "sk-test" },
      {},
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/search");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk-test");
    assert.deepEqual(JSON.parse(calls[0].init.body), { query: "deepseek api", count: 5, need_content: false });
    assert.deepEqual(result.sources, [{ url: "https://b.example", title: "B", snippet: "sb" }]);
    assert.equal(result.truncated, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("deepseek backend: a missing key is a credential error, not a network call", async () => {
  await assert.rejects(
    deepseekBackend.search({ query: "q" }, undefined, { baseURL: DEFAULT_DEEPSEEK_API_BASE_URL, resolveApiKey: async () => undefined }, {}),
    (error) => error.code === "WEB_PROVIDER_CREDENTIAL_MISSING",
  );
});

test("parseDeepseekFetchResult wraps Markdown as a text body with HTTP 200", () => {
  assert.deepEqual(parseDeepseekFetchResult({ content: "# Title\n\nbody" }, "https://page.example/a"), {
    url: "https://page.example/a",
    statusCode: 200,
    body: { kind: "text", content: "# Title\n\nbody" },
    truncated: false,
  });
  assert.throws(() => parseDeepseekFetchResult({}, "https://page.example/a"), /invalid JSON/);
});

test("fetch provider is offered only when enableDeepseekFetch is on", () => {
  const provider = createDeepseekFetchProvider({
    resolveOptions: () => ({ enabled: false, baseURL: DEFAULT_DEEPSEEK_API_BASE_URL, resolveApiKey: async () => "k" }),
  });
  assert.equal(provider.id, DEEPSEEK_FETCH_API_PROVIDER_ID);
  assert.equal(provider.available(), false);

  const enabled = createDeepseekFetchProvider({
    resolveOptions: () => ({ enabled: true, baseURL: DEFAULT_DEEPSEEK_API_BASE_URL, resolveApiKey: async () => "k" }),
  });
  assert.equal(enabled.available(), true);
});

test("fetch provider posts { url } to /fetch and returns the Markdown", async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ content: "page markdown" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const provider = createDeepseekFetchProvider({
      resolveOptions: () => ({ enabled: true, baseURL: "https://api.deepseek.com/v1/tools", resolveApiKey: async () => "sk-test" }),
    });
    const result = await provider.fetch({ url: "https://page.example/a" });
    assert.equal(calls[0].url, "https://api.deepseek.com/v1/tools/fetch");
    assert.deepEqual(JSON.parse(calls[0].init.body), { url: "https://page.example/a" });
    assert.deepEqual(result, {
      url: "https://page.example/a",
      statusCode: 200,
      body: { kind: "text", content: "page markdown" },
      truncated: false,
    });
  } finally {
    globalThis.fetch = original;
  }
});
