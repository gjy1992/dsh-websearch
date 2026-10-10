// tests/client-entry.test.js — guard for the web-boot regression: the client
// entry must never statically inject a service that may not exist. DSH 0.1.7
// removed the settingsScope service; while it was listed in `inject` the whole
// entry stayed pending and aborted the web boot with
// "1 entry did not activate ... waiting for service: settingsScope".
// The card must be wired through ctx.get() (no inject requirement) instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Evaluate lib/client.js against a stub __ModuleLoader__ and return its exports. */
function loadClientEntry() {
  const source = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
  const stubModule = new Proxy({}, { get: () => () => undefined });
  let exports;
  const sandbox = {
    window: { __ModuleLoader__: { load: (def) => { exports = def.factory(() => stubModule); } } },
    console,
  };
  vm.runInNewContext(source, sandbox, { filename: "lib/client.js" });
  return exports;
}

test("client entry: required injects only, settingsScope is optional (ctx.get)", () => {
  const entry = loadClientEntry();
  assert.equal(typeof entry.apply, "function");
  assert.ok(Array.isArray(entry.inject));
  for (const name of ["slots", "locale", "connection", "remote"]) {
    assert.ok(entry.inject.includes(name), "inject must keep " + name);
  }
  assert.ok(!entry.inject.includes("settingsScope"),
    "settingsScope in a static inject leaves the entry pending forever and fails the web boot");
  // Probed at use time, never static: the 0.2.0 configForms form and the
  // web-ui.plugin.item seat must not be able to pend the entry either.
  assert.ok(!entry.inject.includes("configForms"));

  const source = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
  assert.ok(source.includes('"web-ui.plugin.item"'),
    "the card must target the Web-plugins settings page list seat");
  assert.ok(source.includes('"settings.section"'),
    "the 0.1.5 settingsScope shim keeps its own settings section");
});
