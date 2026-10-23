/**
 * GitHub search backend for dsh-websearch (v2.10.0).
 *
 * Unlike the other twelve backends this one is NOT a general web index: it is
 * a vertical search over GitHub objects (repositories / code / issues) that
 * only participates when the query actually asks for one. Three measured facts
 * drive the whole design (docs/design-github-backend.md):
 *
 *  1. GitHub's search is keyword AND matching, not semantic retrieval. Long
 *     natural-language queries return total_count: 0 — measured on this
 *     machine's own history ("tidal potential station displacement h2 geoid
 *     1+k2 ..." -> 0; "固体潮 勒夫数 0.707 模型" -> 0).
 *  2. Quota is narrow and shared: search = 30/min, code_search = 10/min.
 *     Firing it on every fan-out would burn the user's own budget.
 *  3. `search/code` rejects anonymous callers outright (401), so a token is
 *     required; repositories/issues also work anonymously but at 10/min.
 *
 * Therefore: the backend exposes an optional `appliesTo(request)` hook that
 * the provider consults per query variant, and it issues AT MOST ONE request
 * per round, to exactly one endpoint, chosen by selectGithubEndpoint().
 *
 * API: GET {baseURL}/search/{repositories|code|issues}
 * Auth: Bearer <token> (classic PAT or fine-grained)
 */

import { WebError } from "@deepseek-ai/dsh-web";
import { throwIfSearchAborted, searchAborted, isAbortError } from "../util/abort.js";

const GITHUB_ENDPOINT = "https://api.github.com";

/** Pinned REST API version (GitHub's documented stability contract). */
const API_VERSION = "2022-11-28";

/** Snippet budget, matching tavily/serper/anysearch so merged context stays bounded. */
const SNIPPET_MAX_CHARS = 500;

/** Endpoint ids, in the order selectGithubEndpoint() considers them. */
export const GITHUB_ENDPOINTS = ["auto", "repositories", "code", "issues"];

/**
 * Word-level GitHub intent. Deliberately the SAME vocabulary as
 * exa.js's inferExaCategory() github branch: one word must not mean "github"
 * to Exa and something else here.
 */
export const GITHUB_INTENT = /\bgithub\b|\brepo\b|repository|开源项目|源码/i;

/**
 * Qualifiers that name a GitHub object on their own, with no "github" word.
 * `in:` is deliberately absent: it reads as ordinary prose often enough to
 * fire the backend on unrelated searches. Everything else here is colon-
 * prefixed GitHub search syntax and MUST stay in sync with
 * selectGithubEndpoint(), which treats the same set as explicit code syntax —
 * otherwise that selector has branches the gate can never reach.
 */
export const GITHUB_QUALIFIER = /(^|\s)(repo|org|user|path|filename|extension|language):/i;

/** Issue/PR selector qualifier. */
export const GITHUB_ISSUE_QUALIFIER = /(^|\s)is:(issue|pr)\b/i;

/** Any qualifier the user typed — used to skip keyword extraction. */
const ANY_QUALIFIER = /(^|\s)(repo|org|user|path|filename|extension|language|label|author|is|in):/i;

/**
 * Does this query ask for something on GitHub?
 *
 * Measured against this machine's 31-query real history: exactly 2 hit
 * (the two that mention github.com / github), 29 scientific queries miss.
 *
 * @param {string} query
 * @returns {boolean}
 */
export function hasGithubIntent(query) {
  const q = typeof query === "string" ? query : "";
  if (q.length === 0) return false;
  return GITHUB_INTENT.test(q) || GITHUB_QUALIFIER.test(q) || GITHUB_ISSUE_QUALIFIER.test(q);
}

/**
 * Choose the single endpoint for this round, by first-match priority.
 *
 *   1. explicit code syntax (path/filename/extension/language)  -> code
 *   2. repo:/org: scope + code intent                           -> code
 *   3. issue intent (is:issue, is:pr, label:, author:, wording) -> issues
 *   4. everything else                                          -> repositories
 *
 * `preferred` short-circuits the inference when the operator pinned
 * githubEndpoints to one value.
 *
 * @param {string} query
 * @param {"auto"|"repositories"|"code"|"issues"} [preferred]
 * @returns {"repositories"|"code"|"issues"}
 */
export function selectGithubEndpoint(query, preferred) {
  if (preferred === "repositories" || preferred === "code" || preferred === "issues") return preferred;
  const q = typeof query === "string" ? query : "";
  if (/(^|\s)(path|filename|extension|language):/i.test(q)) return "code";
  // Issue selectors win over repo scope: "repo:x is:issue y" asks for issues.
  if (GITHUB_ISSUE_QUALIFIER.test(q) || /(^|\s)(label|author):/i.test(q) || /\b(issues?|bugs?|pull request)\b/i.test(q)) return "issues";
  // A repo:/org: scope with a free-text term is a "find this IN that repo"
  // request. Measured: repositories returns 0 for it, code returns 3 — the
  // repositories endpoint does not match on in-repo content at all.
  if (/(^|\s)(repo|org):/i.test(q)) return "code";
  return "repositories";
}

/** Filler words dropped from bare natural-language queries. */
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "do", "does", "did", "how", "what", "which", "who", "when", "where", "why",
  "to", "of", "for", "in", "on", "at", "by", "with", "and", "or", "not",
  "it", "its", "this", "that", "these", "those", "i", "we", "you", "my", "our",
  "please", "search", "find", "show", "me", "give", "want", "need", "look", "for",
]);

/** Token cap for the keyword fallback (GitHub ANDs every term). */
const MAX_KEYWORD_TOKENS = 8;

/**
 * Turn a query into something GitHub's keyword matcher can actually answer.
 *
 * Pass-through cases (no rewriting at all):
 *  - the user already wrote GitHub qualifier syntax — they know what they mean;
 *  - the query contains CJK — token-level stripping would mangle it, and
 *    GitHub's Chinese recall is poor either way.
 *
 * Otherwise: strip punctuation, drop filler words, cap the token count.
 * This is loss reduction, not a fix: a long scientific question still returns
 * 0 from GitHub. See docs/design-github-backend.md §1.1.
 *
 * @param {string} query
 * @returns {string}
 */
export function prepareGithubQuery(query) {
  const raw = typeof query === "string" ? query.trim() : "";
  if (raw.length === 0) return "";
  if (ANY_QUALIFIER.test(raw)) return raw;
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  const tokens = raw.replace(/[^\p{L}\p{N}._/+-]+/gu, " ").split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !STOPWORDS.has(t.toLowerCase()));
  const use = kept.length > 0 ? kept : tokens;
  return use.slice(0, MAX_KEYWORD_TOKENS).join(" ");
}

// ---------------------------------------------------------------------------
// Local call budget.
//
// Module-level sliding window shared by every GitHub call in this process.
// GitHub's own buckets (30/min search, 10/min code_search) are shared with
// whatever else the user runs against the same token, so the plugin keeps a
// deliberately small slice. Exceeding it skips the round instead of retrying:
// a retry would consume the next round's quota too.
// ---------------------------------------------------------------------------

/** @type {number[]} timestamps (ms) of recent GitHub calls, oldest first. */
const callTimes = [];

/** True when the rolling 60s window still has room. Exported for tests. */
export function githubBudgetAllows(maxPerMinute, nowMs = Date.now()) {
  const cap = Math.max(1, Math.floor(Number(maxPerMinute) || 1));
  const cutoff = nowMs - 60_000;
  while (callTimes.length > 0 && callTimes[0] <= cutoff) callTimes.shift();
  return callTimes.length < cap;
}

/** Record one consumed call. Exported for tests. */
export function noteGithubCall(nowMs = Date.now()) {
  callTimes.push(nowMs);
}

/** Clear the window (test helper). */
export function resetGithubBudget() {
  callTimes.length = 0;
}

// ---------------------------------------------------------------------------
// Parsers.
// ---------------------------------------------------------------------------

function truncate(text, max) {
  const s = String(text ?? "");
  return s.length > max ? s.slice(0, max) : s;
}

/** /search/repositories item -> seam source. */
function repositorySource(item) {
  if (!item || typeof item.html_url !== "string" || item.html_url.length === 0) return undefined;
  const meta = ["⭐" + (Number(item.stargazers_count) || 0)];
  if (typeof item.language === "string" && item.language.length > 0) meta.push(item.language);
  if (typeof item.pushed_at === "string" && item.pushed_at.length >= 10) meta.push("pushed " + item.pushed_at.slice(0, 10));
  const desc = typeof item.description === "string" ? item.description : "";
  const snippet = truncate(meta.join(" · ") + (desc.length > 0 ? " — " + desc : ""), SNIPPET_MAX_CHARS);
  const title = String(item.full_name || item.name || item.html_url);
  return { url: item.html_url, title, snippet };
}

/** /search/code item -> seam source (needs the text-match Accept header). */
function codeSource(item) {
  if (!item || typeof item.html_url !== "string" || item.html_url.length === 0) return undefined;
  const repo = typeof item.repository?.full_name === "string" ? item.repository.full_name : "";
  const path = typeof item.path === "string" ? item.path : (typeof item.name === "string" ? item.name : "");
  const title = repo && path ? repo + "/" + path : (path || item.html_url);
  const fragments = [];
  for (const match of item.text_matches ?? []) {
    if (typeof match?.fragment === "string" && match.fragment.trim().length > 0) {
      fragments.push(match.fragment.replace(/\s+/g, " ").trim());
    }
    if (fragments.length >= 3) break;
  }
  const source = { url: item.html_url, title };
  if (fragments.length > 0) source.snippet = truncate(fragments.join(" … "), SNIPPET_MAX_CHARS);
  return source;
}

/** /search/issues item -> seam source (issues and PRs share this endpoint). */
function issueSource(item) {
  if (!item || typeof item.html_url !== "string" || item.html_url.length === 0) return undefined;
  const state = typeof item.state === "string" && item.state.length > 0 ? "[" + item.state + "] " : "";
  const isPr = item.pull_request !== undefined && item.pull_request !== null;
  const title = state + String(item.title || item.html_url) + (isPr ? " (PR)" : "");
  const source = { url: item.html_url, title };
  const body = typeof item.body === "string" ? item.body.replace(/\s+/g, " ").trim() : "";
  if (body.length > 0) source.snippet = truncate(body, SNIPPET_MAX_CHARS);
  return source;
}

/**
 * Map a GitHub search envelope onto seam sources.
 *
 * `items: []` (total_count 0) is a NORMAL result — the caller returns an empty
 * source list, never a failure. v2.8.2's P1 fix established that distinction
 * for the whole provider; this backend must not undo it.
 *
 * @param {object} data   parsed JSON envelope
 * @param {"repositories"|"code"|"issues"} endpoint
 * @param {number} maxResults
 * @returns {Array<{url:string,title?:string,snippet?:string}>}
 */
export function parseGithubResult(data, endpoint, maxResults) {
  const items = Array.isArray(data?.items) ? data.items : [];
  const limit = Math.max(1, Math.floor(Number(maxResults) || 8));
  const sources = [];
  for (const item of items) {
    if (sources.length >= limit) break;
    const source = endpoint === "repositories"
      ? repositorySource(item)
      : endpoint === "code"
        ? codeSource(item)
        : issueSource(item);
    if (source !== undefined) sources.push(source);
  }
  return sources;
}

/**
 * Build a diagnostic string for a non-2xx reply, including the rate-limit
 * headers that make a 403/429 actionable ("retry after 42s" beats "HTTP 403").
 */
export function githubErrorDetail(response, text) {
  const parts = ["HTTP " + response.status];
  const header = (name) => {
    try { return response.headers?.get?.(name) ?? null; } catch { return null; }
  };
  if (response.status === 403 || response.status === 429) {
    const retryAfter = header("retry-after");
    const reset = header("x-ratelimit-reset");
    const remaining = header("x-ratelimit-remaining");
    if (retryAfter !== null) parts.push("retry after " + retryAfter + "s");
    else if (reset !== null && Number.isFinite(Number(reset))) {
      parts.push("resets in " + Math.max(0, Math.ceil(Number(reset) - Date.now() / 1000)) + "s");
    }
    if (remaining === "0") parts.push("quota exhausted");
  }
  const body = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (body.length > 0) parts.push(body.slice(0, 200));
  return parts.join(" · ");
}

/** @type {import("../provider.js").Backend} */
export const githubBackend = {
  id: "github",
  requiresCredential: true,

  available(options) {
    return typeof options?.resolveApiKey === "function";
  },

  /**
   * Per-request gate consulted by the provider. Returning false removes this
   * backend from the round entirely: no request, no telemetry, no breaker
   * entry. Only the GitHub backend implements this hook.
   */
  appliesTo(request) {
    return hasGithubIntent(request?.query);
  },

  async search(request, signal, options, hooks) {
    throwIfSearchAborted(signal);
    const backendOpts = options ?? {};

    const apiKey = await backendOpts.resolveApiKey?.();
    if (!apiKey) {
      throw new WebError(
        "GitHub: token not configured (create one at https://github.com/settings/tokens and add it in Settings > Web Search)",
        "WEB_PROVIDER_CREDENTIAL_MISSING",
      );
    }

    const query = prepareGithubQuery(request?.query);
    if (!query) {
      throw new WebError("GitHub: empty query after preparation", "WEB_PROVIDER_ERROR");
    }

    const endpoint = selectGithubEndpoint(query, backendOpts.endpoints);
    const maxPerMinute = backendOpts.maxPerMinute ?? 6;
    if (!githubBudgetAllows(maxPerMinute)) {
      throw new WebError(
        `GitHub: local budget of ${maxPerMinute} calls/min reached - skipped this round`,
        "WEB_PROVIDER_ERROR",
      );
    }

    const baseURL = backendOpts.baseURL ?? GITHUB_ENDPOINT;
    const url = new URL(baseURL.replace(/\/+$/, "") + "/search/" + endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(Math.min(Math.max(1, Number(request.maxResults) || 8), 100)));

    const headers = {
      // text-match is what makes code results useful: it returns the matched
      // source fragment, which becomes the snippet.
      "Accept": endpoint === "code"
        ? "application/vnd.github.text-match+json"
        : "application/vnd.github+json",
      "X-GitHub-Api-Version": API_VERSION,
      "User-Agent": "dsh-websearch/2.10.0",
      "Authorization": "Bearer " + apiKey,
    };

    hooks?.recordRequest?.({
      endpoint: baseURL,
      toolName: "github_search_" + endpoint,
      body: { q: query, per_page: url.searchParams.get("per_page") },
    });

    // The attempt consumes budget whether or not it succeeds: GitHub counts
    // the request, and a local failure must not license a retry storm.
    noteGithubCall();

    let response;
    try {
      response = await fetch(url, { method: "GET", headers, redirect: "error", signal });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
      throw new WebError("GitHub request failed: " + error, "WEB_PROVIDER_ERROR", { cause: error });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "").then((tx) => tx.slice(0, 300));
      const detail = githubErrorDetail(response, text);
      hooks?.recordOutcome?.({ status: "error", message: detail });
      throw new WebError("GitHub API error (" + detail + ")", "WEB_PROVIDER_ERROR");
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new WebError("GitHub: invalid JSON response", "WEB_PROVIDER_ERROR", { cause: error });
    }

    const sources = parseGithubResult(data, endpoint, request.maxResults ?? 8);
    // total_count 0 lands here too: success with zero sources, not an error.
    hooks?.recordOutcome?.({ status: "ok", count: sources.length, endpoint });
    return { sources };
  },
};

export default githubBackend;
