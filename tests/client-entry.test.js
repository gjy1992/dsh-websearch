// tests/client-entry.test.js — guards for the client entry:
//  1. it must never statically inject a service that may not exist (a pending
//     entry aborts the whole web boot), and
//  2. the card must render on a host that hands it no t() — the
//     web-ui.plugin.item seat passes none, and a missing t() used to throw
//     inside ToggleRow and blank the host's whole Web-plugins section.
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
  // Minimal React surface: the entry declares a class-component error boundary.
  class Component {
    constructor(props) { this.props = props; this.state = {}; }
  }
  const requireStub = (id) => (id === "react" ? { Component, createElement: () => ({}) } : stubModule);
  let exports;
  const sandbox = {
    window: { __ModuleLoader__: { load: (def) => { exports = def.factory(requireStub); } } },
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

/**
 * Register the card against a fake ctx that hands it NO t() (the real
 * web-ui.plugin.item seat does exactly that), then deep-render the returned
 * tree with every function/class component actually invoked.
 *
 * A shallow stub cannot catch this: it only builds element objects, so a missing
 * prop inside ToggleRow never throws. This is the rig that reproduced the
 * "props.t is not a function" blank page.
 */
function deepRenderCard({ enabled = { enableBrave: true } } = {}) {
  const source = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
  const jsx = (type, props) => ({ type, props });
  const jsxRuntime = { jsx, jsxs: jsx, Fragment: "Fragment" };
  class Component {
    constructor(props) { this.props = props; this.state = {}; }
  }
  const requireStub = (id) => (id === "react/jsx-runtime" ? jsxRuntime
    : id === "react" ? { Component, createElement: jsx } : {});
  let entry;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: (def) => { entry = def.factory(requireStub); } } },
    console: { warn() {}, info() {}, error() {} },
  }, { filename: "lib/client.js" });

  const form = {
    getSnapshot: () => ({ status: "ready", value: enabled, writable: true }),
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
  };
  const registered = [];
  const ctx = {
    get: (name) => {
      if (name === "settingsScope") return undefined;
      if (name === "configForms") return { get: (id) => (id === "dsh-websearch" ? form : undefined) };
      if (name === "connection") return { api: { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } } };
      if (name === "remote") return { $on: () => () => {} };
      return undefined;
    },
    locale: { register: () => () => {}, bind: () => (key) => "T:" + key },
    effect: (fn) => { const dispose = fn(); return typeof dispose === "function" ? dispose : () => {}; },
    slots: {
      inject: (_seat, cb) => { const dispose = cb(); void dispose; return () => {}; },
      register: (def, component) => { registered.push({ seat: def.name, component }); return () => {}; },
    },
  };
  ctx.remote = ctx.get("remote");
  ctx.connection = ctx.get("connection");
  entry.apply(ctx);

  const seen = [];
  const withT = [];
  const projection = {
    ready: true, writable: true, status: "ready", value: enabled,
    keyState: {}, stagedKeys: {}, stagedCount: 0, savedAt: 0, conflict: false,
    failedKeys: [], failedFields: [], saving: false, failed: false,
    stagedText: () => undefined,
  };
  const deep = (node, depth = 0) => {
    if (depth > 300 || node === null || node === undefined) return;
    if (Array.isArray(node)) { node.forEach((child) => deep(child, depth + 1)); return; }
    if (typeof node !== "object") return;
    const type = node.type;
    if (typeof type === "function") {
      const isClass = /^class /.test(Function.prototype.toString.call(type));
      const name = type.name || "anon";
      seen.push(name);
      if (!isClass && node.props && typeof node.props.t === "function") withT.push(name);
      deep(isClass ? new type(node.props).render() : type(node.props), depth + 1);
      return;
    }
    const children = node.props && node.props.children;
    if (Array.isArray(children)) children.forEach((child) => deep(child, depth + 1));
    else deep(children, depth + 1);
  };
  deep(registered[0].component({
    // Deliberately no t(): the seat does not provide one.
    useUnifiedSearchCard: (selector) => selector(projection),
    edit: () => {}, setToggle: () => {}, reset: () => {}, editKey: () => {},
    save: () => {}, discard: () => {},
  }));

  return { seat: registered[0].seat, seen, withT };
}

test("client entry: card renders without a host t(), keyed toggles included", () => {
  const { seat, seen, withT } = deepRenderCard();
  assert.equal(seat, "web-ui.plugin.item");
  const toggleRows = seen.filter((name) => name === "ToggleRow").length;
  assert.ok(toggleRows > 0, "the card must render its backend toggle rows");
  assert.ok(withT.filter((name) => name === "ToggleRow").length === toggleRows,
    "every ToggleRow must receive a t() (a missing one throws and blanks the host section)");
  assert.ok(seen.includes("UnifiedSearchSection"));
});
