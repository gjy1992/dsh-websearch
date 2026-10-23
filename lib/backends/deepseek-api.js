/**
 * DeepSeek Search API backend — the direct Search & Fetch APIs DeepSeek ships
 * alongside the Messages API (2026-10). One HTTP request per search; no
 * auxiliary model turn, so no model tokens are spent on retrieval.
 *
 *   POST {baseURL}/search   { query, count, need_content: false }
 *     -> { results: [{ url, title, snippet, date }] }
 *
 * Auth: `Authorization: Bearer <key>`. The matching fetch capability lives in
 * ../fetch-provider.js (`POST {baseURL}/fetch`).
 *
 * Reference implementation: dsh 0.2.1 packages/web/web-deepseek-api
 * (src/search.ts, src/fetch.ts — providers `deepseek-search-api` /
 * `deepseek-fetch-api`).
 */

import { WebError } from "@deepseek-ai/dsh-web";
import { throwIfSearchAborted, searchAborted, isAbortError } from "../util/abort.js";
import { egressFetch } from "../util/egress-fetch.js";

/** Default Search/Fetch API base, including its /v1/tools path prefix. */
export const DEFAULT_DEEPSEEK_API_BASE_URL = "https://api.deepseek.com/v1/tools";

/** The Search API's own default result count. */
const DEFAULT_COUNT = 10;
/** The Search API's upper bound on `count`. */
const MAX_COUNT = 50;

/**
 * Normalize a configured base URL to a Search/Fetch API base.
 * A legacy value from before 2.11 — the Messages-API base
 * `https://api.deepseek.com/anthropic/v1` — is mapped to the new default, so
 * an upgraded install keeps working without editing its saved settings.
 * @param {string|undefined} baseURL
 * @returns {string} base URL without a trailing slash
 */
export function resolveDeepseekApiBase(baseURL) {
  const base = typeof baseURL === "string" ? baseURL.trim().replace(/\/+$/u, "") : "";
  if (base.length === 0) return DEFAULT_DEEPSEEK_API_BASE_URL;
  if (/\/anthropic\/v1$/u.test(base)) return DEFAULT_DEEPSEEK_API_BASE_URL;
  return base;
}

/**
 * Validate a Search API response and project it onto the seam's sources.
 * An empty `results` array is a successful empty search. A malformed item is a
 * provider error, never a silently dropped result (mirrors dsh-web-deepseek-api).
 * @param {unknown} payload - untrusted response JSON
 * @param {number} maxResults - maximum sources to keep
 * @returns {Array<{url:string,title?:string,snippet?:string,publishedAt?:string}>}
 */
export function parseDeepseekApiResult(payload, maxResults = 8) {
  if (payload === null || typeof payload !== "object" || !Array.isArray(payload.results)) {
    throw new WebError("DeepSeek Search API: invalid JSON response", "WEB_PROVIDER_ERROR");
  }
  const limit = Math.max(1, Math.floor(Number(maxResults) || 8));
  const sources = [];
  for (const item of payload.results) {
    if (sources.length >= limit) break;
    if (
      item === null || typeof item !== "object"
      || typeof item.url !== "string" || item.url.length === 0
      || typeof item.title !== "string"
      || typeof item.snippet !== "string"
      || (item.date !== null && item.date !== undefined && typeof item.date !== "string")
    ) {
      throw new WebError("DeepSeek Search API: invalid result item", "WEB_PROVIDER_ERROR");
    }
    sources.push({
      url: item.url,
      ...(item.title.length > 0 ? { title: item.title } : {}),
      ...(item.snippet.length > 0 ? { snippet: item.snippet } : {}),
      ...(typeof item.date === "string" && item.date.length > 0 ? { publishedAt: item.date } : {}),
    });
  }
  return sources;
}

/** @type {import("../provider.js").Backend} */
export const deepseekBackend = {
  id: "deepseek",
  requiresCredential: true,

  available(options) {
    return typeof options?.resolveApiKey === "function";
  },

  async search(request, signal, options, hooks) {
    throwIfSearchAborted(signal);
    const backendOpts = options ?? {};

    const apiKey = await backendOpts.resolveApiKey?.();
    if (!apiKey) {
      throw new WebError("DeepSeek Search API: API key not configured", "WEB_PROVIDER_CREDENTIAL_MISSING");
    }

    const baseURL = resolveDeepseekApiBase(backendOpts.baseURL);
    const endpoint = baseURL + "/search";
    const count = Math.min(Math.max(1, Math.floor(Number(request.maxResults) || DEFAULT_COUNT)), MAX_COUNT);

    hooks?.recordRequest?.({
      endpoint,
      toolName: "deepseek_search_api",
      body: { query: request.query, count },
    });

    let response;
    try {
      response = await egressFetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "dsh-websearch/2.11",
        },
        body: JSON.stringify({ query: request.query, count, need_content: false }),
        redirect: "error",
        signal,
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError("DeepSeek Search API request failed: " + error, "WEB_PROVIDER_ERROR", { cause: error });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "").then((tx) => tx.slice(0, 300));
      hooks?.recordOutcome?.({ status: "error", message: "HTTP " + response.status + ": " + text });
      throw new WebError(
        "DeepSeek Search API error (HTTP " + response.status + "): " + text
        + " — deepseekBaseURL must be the Search/Fetch API base (default https://api.deepseek.com/v1/tools), not the Messages-API base",
        "WEB_PROVIDER_ERROR",
      );
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new WebError("DeepSeek Search API: invalid JSON response", "WEB_PROVIDER_ERROR", { cause: error });
    }

    const sources = parseDeepseekApiResult(data, request.maxResults ?? DEFAULT_COUNT);
    hooks?.recordOutcome?.({ status: "success", count: sources.length });
    return { sources, truncated: false };
  },
};
