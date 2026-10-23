// tests/volatile-config.test.js — regression for the volatile-config bug.
//
// DSH resolves a `meta.volatile` Config into a volatile REFERENCE (cosmokit
// createVolatile), not a plain object: schemastery's resolver returns
// `[createVolatile(value), adapted]` for such a schema. This plugin marks its
// whole Config volatile so the 0.2.0 settings form renders, so the config
// handed to `apply()` had no data properties at all — every field read was
// `undefined` and every option silently fell back to its default (the backend
// fan-out collapsed to DEFAULT_ENABLED and AnySearch was never queried).
//
// These tests pin the unwrapping in `configValues()` / `resolveOptions()`.
import { test } from "node:test";
import assert from "node:assert/strict";

import { Config, configValues, resolveOptions } from "../lib/index.js";

/** resolveOptions only needs ctx.get() (credentials) + launchEnvironmentOf. */
const ctx = { get: () => undefined };

test("every field is its own volatile reference (the shape under test)", () => {
  const live = Config({ enableAnysearch: true });
  // 0.2.x: each field is marked .volatile(), so every value is a { get } reference
  // and the resolved object arrives with no plain data properties.
  assert.equal(typeof live.get, "undefined", "the root is a plain object, not a reference");
  assert.deepEqual(Object.keys(live.enableAnysearch), ["get"], "a field is a volatile reference");
  assert.equal(live.enableAnysearch.enableAnysearch, undefined, "direct field reads see nothing");
  assert.equal(live.enableAnysearch.get(), true, "the real values live behind get()");
});

test("resolveOptions: a volatile config is unwrapped, so AnySearch joins the fan-out", () => {
  const live = Config({ enableAnysearch: true, enableBrave: false, enableDeepseek: false });
  const opts = resolveOptions(ctx, live);
  assert.deepEqual(opts.enabledBackends, ["exa", "parallel", "ddg", "searxng", "anysearch"]);
});

test("resolveOptions: non-toggle options are honoured too (they were all ignored before)", () => {
  const live = Config({ numResults: 3, concurrency: 2, cacheEnabled: false, resultTelemetry: false });
  const opts = resolveOptions(ctx, live);
  assert.equal(opts.numResults, 3);
  assert.equal(opts.concurrency, 2);
  assert.equal(opts.cacheEnabled, false);
  assert.equal(opts.resultTelemetry, false);
});

test("resolveOptions: the only-enabled backend still wins over the defaults", () => {
  const live = Config({
    enableExa: false, enableParallel: false, enableDdg: false, enableSearxng: false,
    enableAnysearch: true,
  });
  assert.deepEqual(resolveOptions(ctx, live).enabledBackends, ["anysearch"]);
});

test("backendOrder: the explicit source priority reorders the enabled backends", () => {
  const live = Config({
    enableExa: true, enableParallel: true, enableDdg: true, enableSearxng: true,
    backendOrder: ["searxng", "exa"],
  });
  assert.deepEqual(resolveOptions(ctx, live).enabledBackends,
    ["searxng", "exa", "parallel", "ddg"],
    "listed ids come first in list order, the rest keep registry order");
});

test("backendOrder: unknown ids and backends that are off cannot jump the queue", () => {
  const live = Config({
    enableExa: true, enableParallel: true, enableDdg: true, enableSearxng: true,
    backendOrder: ["nope", "brave", "ddg"],
  });
  assert.deepEqual(resolveOptions(ctx, live).enabledBackends,
    ["ddg", "exa", "parallel", "searxng"]);
});

test("resolveOptions: a plain object config (unit tests, older hosts) is unchanged", () => {
  const opts = resolveOptions(ctx, { enableAnysearch: true, numResults: 5 });
  assert.ok(opts.enabledBackends.includes("anysearch"));
  assert.equal(opts.numResults, 5);
});

test("configValues: empty / unreadable inputs degrade to an empty config, never throw", () => {
  assert.deepEqual(configValues(null), {});
  assert.deepEqual(configValues(undefined), {});
  assert.deepEqual(configValues({ get() { throw new Error("boom"); } }), {});
  assert.deepEqual(configValues(Config({ enableAnysearch: true })).enableAnysearch, true);
});
