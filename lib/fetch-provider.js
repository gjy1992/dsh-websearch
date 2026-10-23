/**
 * DeepSeek Fetch API provider for the ctx.web fetch capability.
 *
 *   POST {baseURL}/fetch  { url }  ->  { content }   (page Markdown)
 *
 * Registered as `deepseek-fetch-api`. It is offered only when the user turns on
 * `enableDeepseekFetch`, because the host ships its own HTTP fetch provider and
 * two simultaneously *available* fetch providers make the seam fail with
 * WEB_PROVIDER_AMBIGUOUS unless `web.fetchProvider` names one.
 *
 * The API reports neither the target status nor a final redirect URL and fails
 * when the target yields no usable content, so a success is the requested page
 * retrieved with HTTP 200 — exactly what dsh-web-deepseek-api's fetch provider
 * returns.
 */

import { WebError } from "@deepseek-ai/dsh-web";
import { isAbortError, searchAborted } from "./util/abort.js";
import { resolveDeepseekApiBase } from "./backends/deepseek-api.js";

/** Stable id the fetch provider registers under in the fetch registry. */
export const DEEPSEEK_FETCH_API_PROVIDER_ID = "deepseek-fetch-api";

/**
 * Validate a Fetch API response and project it onto a `WebFetchResult`.
 * @param {unknown} payload - untrusted response JSON
 * @param {string} requestUrl - the URL that was requested (the API reports no final URL)
 * @returns {{url:string,statusCode:number,body:{kind:'text',content:string},truncated:boolean}}
 */
export function parseDeepseekFetchResult(payload, requestUrl) {
  if (payload === null || typeof payload !== "object" || typeof payload.content !== "string") {
    throw new WebError("DeepSeek Fetch API: invalid JSON response", "WEB_PROVIDER_ERROR");
  }
  return {
    url: requestUrl,
    statusCode: 200,
    body: { kind: "text", content: payload.content },
    truncated: false,
  };
}

/**
 * @param {{resolveOptions: () => {enabled?:boolean, baseURL?:string, resolveApiKey?: () => Promise<string|undefined>}}} deps
 * @returns {import("@deepseek-ai/dsh-web").WebFetchProvider}
 */
export function createDeepseekFetchProvider({ resolveOptions }) {
  return {
    id: DEEPSEEK_FETCH_API_PROVIDER_ID,

    available() {
      const options = resolveOptions();
      return options?.enabled === true && URL.canParse(resolveDeepseekApiBase(options.baseURL));
    },

    async fetch(request, signal) {
      const options = resolveOptions();
      const apiKey = await options.resolveApiKey?.();
      if (!apiKey) {
        throw new WebError("DeepSeek Fetch API: API key not configured", "WEB_PROVIDER_CREDENTIAL_MISSING");
      }
      const endpoint = resolveDeepseekApiBase(options.baseURL) + "/fetch";

      let response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + apiKey,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "dsh-websearch/2.11",
          },
          body: JSON.stringify({ url: request.url }),
          redirect: "error",
          signal,
        });
      } catch (error) {
        if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
        throw new WebError("DeepSeek Fetch API request failed: " + error, "WEB_PROVIDER_ERROR", { cause: error });
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "").then((tx) => tx.slice(0, 300));
        throw new WebError(
          "DeepSeek Fetch API error (HTTP " + response.status + "): " + text
          + " — the target page may have no usable content, or deepseekBaseURL is not the Search/Fetch API base",
          "WEB_PROVIDER_ERROR",
        );
      }

      let payload;
      try {
        payload = await response.json();
      } catch (error) {
        throw new WebError("DeepSeek Fetch API: invalid JSON response", "WEB_PROVIDER_ERROR", { cause: error });
      }
      return parseDeepseekFetchResult(payload, request.url);
    },
  };
}
