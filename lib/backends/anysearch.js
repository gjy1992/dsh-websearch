/**
 * AnySearch backend for dsh-websearch.
 *
 * REST API: POST https://api.anysearch.com/v1/search
 * Docs: https://anysearch.com/docs/api-endpoints/v1-search
 *
 * Auth: `Authorization: Bearer <ANYSEARCH_API_KEY>` is OPTIONAL — without a key
 * the request runs on AnySearch's anonymous tier (per-IP rate limit + a shared
 * daily free quota). That makes this backend keyless-capable: a missing key is
 * never an error, exactly like ddg/searxng.
 *
 * Request:  { query, max_results (1-10), zone? (cn|intl), language?, format? }
 * Response: { code, message, request_id,
 *             data: { results: [{ title, url, snippet?, content? }],
 *                     metadata: { total_results, search_time_ms } } }
 * Failure:  HTTP 4xx/5xx and/or code != 0, with { code: -1, message, request_id }.
 *
 * Not wired: the vertical `tag` + `params` pair. Many tags (e.g. code.doc)
 * reject a request that omits the matching params object, so a bare-tag
 * setting would be a footgun; the endpoint's intent routing is used instead.
 */

import { WebError } from "@deepseek-ai/dsh-web";
import { throwIfSearchAborted, searchAborted, isAbortError } from "../util/abort.js";
import { applyAnysearchFilters, normalizeFilters } from "../util/filters.js";

const ANYSEARCH_ENDPOINT = "https://api.anysearch.com/v1/search";

/** Documented server cap for `max_results` (range 1-10). */
export const ANYSEARCH_MAX_RESULTS = 10;

/** Snippet budget, matching tavily/serper, so merged model context stays bounded. */
const SNIPPET_MAX_CHARS = 500;

/** Client tag reported to the service (same header the official skill sends). */
const CLIENT_TAG = "dsh-websearch/2.10.0";

/**
 * The documented anonymous-quota HTTP 402 reply embeds freshly generated
 * credentials in its `message` (username=/password=/api_key=). Redact those
 * before any upstream text reaches a WebError — the provider copies error text
 * into the model-visible telemetry line and the host log.
 */
const SECRET_ASSIGN_RE = /["']?(user_?name|password|api[_-]?key|token|secret)["']?\s*[=:]\s*["']?[^\s"',}]+/gi;

/** Redact `key=value` credential pairs from an upstream error string. Exported for tests. */
export function redactAnysearchSecrets(text) {
  return String(text ?? "").replace(SECRET_ASSIGN_RE, "$1=[redacted]");
}

/** Clamp a requested count into the documented 1-10 range. */
function clampMaxResults(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return ANYSEARCH_MAX_RESULTS;
  return Math.min(n, ANYSEARCH_MAX_RESULTS);
}

/** @type {import("../provider.js").Backend} */
export const anysearchBackend = {
  id: "anysearch",
  requiresCredential: false,

  available() {
    return true; // anonymous tier: no key required
  },

  async search(request, signal, options, hooks) {
    throwIfSearchAborted(signal);
    const backendOpts = options ?? {};

    // Optional key: when present it lifts the anonymous limits; when absent the
    // request simply carries no Authorization header.
    const apiKey = await backendOpts.resolveApiKey?.();

    const baseURL = backendOpts.baseURL ?? ANYSEARCH_ENDPOINT;
    const maxResults = clampMaxResults(request.maxResults);

    const body = { query: request.query, max_results: maxResults, format: "json" };
    applyAnysearchFilters(body, normalizeFilters(request.filters));

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "User-Agent": CLIENT_TAG,
      "X-Anysearch-Client": CLIENT_TAG,
    };
    if (apiKey) headers.Authorization = "Bearer " + apiKey;

    hooks?.recordRequest?.({ endpoint: baseURL, toolName: "anysearch_search", body });

    let response;
    try {
      response = await fetch(baseURL, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        redirect: "error",
        signal,
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError("AnySearch request failed: " + error, "WEB_PROVIDER_ERROR", { cause: error });
    }

    let raw = "";
    try { raw = await response.text(); } catch { raw = ""; }
    let payload = null;
    try { payload = JSON.parse(raw); } catch { payload = null; }

    // The service reports failures both as HTTP 4xx/5xx and as HTTP 200 with a
    // non-zero business code; either shape is a backend failure.
    const businessCode = payload && typeof payload.code === "number" ? payload.code : 0;
    if (!response.ok || businessCode !== 0) {
      const detail = redactAnysearchSecrets(
        payload && typeof payload.message === "string" && payload.message.length > 0 ? payload.message : raw,
      ).slice(0, 300) || "request failed";
      const requestId = payload && typeof payload.request_id === "string" && payload.request_id.length > 0
        ? " (request_id: " + payload.request_id + ")"
        : "";
      const quotaHint = response.status === 402
        ? " (anonymous free quota exhausted - add an AnySearch API key in Settings > Web Search)"
        : "";
      const line = "HTTP " + response.status + ": " + detail;
      hooks?.recordOutcome?.({ status: "error", message: line });
      throw new WebError("AnySearch API error (" + line + ")" + requestId + quotaHint, "WEB_PROVIDER_ERROR");
    }

    if (payload === null) {
      hooks?.recordOutcome?.({ status: "error", message: "invalid JSON response" });
      throw new WebError("AnySearch: invalid JSON response", "WEB_PROVIDER_ERROR");
    }

    const sources = parseAnysearchResult(payload, maxResults);
    hooks?.recordOutcome?.({ status: "success", count: sources.length });
    return { sources };
  },
};

/**
 * Parse an AnySearch /v1/search envelope into seam sources.
 *
 * `snippet` (short summary) wins; `content` (cleaned page text) is only the
 * fallback, truncated to the same budget. Entries without a URL are dropped.
 *
 * @param {object} data envelope ({ data: { results: [...] } })
 * @param {number} maxResults
 */
export function parseAnysearchResult(data, maxResults) {
  const limit = clampMaxResults(maxResults);
  const results = data?.data?.results ?? [];
  const sources = [];
  for (const item of results) {
    if (sources.length >= limit) break;
    if (!item || typeof item.url !== "string" || item.url.length === 0) continue;
    const snippet = typeof item.snippet === "string" && item.snippet.length > 0
      ? item.snippet.slice(0, SNIPPET_MAX_CHARS)
      : typeof item.content === "string" && item.content.length > 0
        ? item.content.slice(0, SNIPPET_MAX_CHARS)
        : undefined;
    sources.push({
      url: item.url,
      ...(typeof item.title === "string" && item.title.length > 0 ? { title: item.title } : {}),
      ...(snippet !== undefined ? { snippet } : {}),
    });
  }
  return sources;
}

export default anysearchBackend;
