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
  assert.ok(source.includes('"plugins.bundle.config"'),
    "the card must target this bundle's own page in Plugins (plugins.bundle.config)");
  assert.ok(!source.includes('"web-ui.plugin.item"'),
    "the card must no longer sit in the Settings > Web plugins list seat");
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
function deepRenderCard({ enabled = { enableBrave: true }, keyState = {}, forms } = {}) {
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
  const getCalls = [];
  const ctx = {
    get: (name) => {
      if (name === "settingsScope") return undefined;
      if (name === "configForms") return forms ?? { get: (id) => { getCalls.push(id); return id === "dsh-websearch" ? form : undefined; } };
      if (name === "connection") return { api: { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } } };
      if (name === "remote") return { $on: () => () => {} };
      return undefined;
    },
    locale: { register: () => () => {}, bind: () => (key) => { tKeys.push(key); return "T:" + key; } },
    effect: (fn) => { const dispose = fn(); return typeof dispose === "function" ? dispose : () => {}; },
    slots: {
      inject: (_seat, cb) => { const dispose = cb(); void dispose; return () => {}; },
      register: (def, component) => { registered.push({ seat: def.name, key: def.key, component }); return () => {}; },
    },
  };
  ctx.remote = ctx.get("remote");
  ctx.connection = ctx.get("connection");
  entry.apply(ctx);

  const seen = [];
  const withT = [];
  const keyInputs = [];
  const tKeys = [];
  const priorityButtons = [];
  const priorityRows = [];
  const moveCalls = [];
  const orderCalls = [];
  const projection = {
    ready: true, writable: true, status: "ready", value: enabled,
    keyState, stagedKeys: {}, stagedCount: 0, savedAt: 0, conflict: false,
    failedKeys: [], failedFields: [], saving: false, failed: false,
    stagedText: () => undefined,
    priorityList: ["exa", "parallel", "brave"],
  };
  const deep = (node, depth = 0) => {
    if (depth > 300 || node === null || node === undefined) return;
    if (Array.isArray(node)) { node.forEach((child) => deep(child, depth + 1)); return; }
    if (typeof node !== "object") return;
    const type = node.type;
    if (type === "input" && node.props && node.props.className === "wsc-keyInput") {
      keyInputs.push({ placeholder: node.props.placeholder, disabled: node.props.disabled });
    }
    if (type === "button" && node.props && String(node.props.className).includes("wsc-priorityBtn")) {
      priorityButtons.push({ title: node.props.title, children: node.props.children, disabled: node.props.disabled, onClick: node.props.onClick });
    }
    if (node.props && node.props["data-priority-id"] !== undefined) {
      priorityRows.push({ id: node.props["data-priority-id"], index: node.props["data-priority-index"], onDrop: node.props.onDrop, draggable: node.props.draggable });
    }
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
    movePriority: (id, delta) => moveCalls.push([id, delta]),
    setPriority: (list) => orderCalls.push(list),
  }));

  return { seat: registered[0].seat, key: registered[0].key, seen, withT, keyInputs, tKeys, getCalls, priorityButtons, moveCalls, priorityRows, orderCalls };
}

test("client entry: priority up/down buttons reach the controller action", () => {
  // The reported bug: the arrows rendered but did nothing, because the card's
  // action bag never carried movePriority (props had it, `card` did not).
  const { priorityButtons, moveCalls } = deepRenderCard();
  assert.ok(priorityButtons.length >= 3, "one row per prioritised backend, two buttons each");
  const down = priorityButtons.find((b) => b.children === "↓" && b.disabled !== true);
  assert.ok(down, "the middle rows must offer a working down arrow");
  down.onClick();
  assert.equal(moveCalls.length, 1, "clicking the arrow must call the controller");
  assert.equal(moveCalls[0][1], 1);
});

test("client entry: dragging a priority row persists the whole order", () => {
  const { priorityRows, orderCalls } = deepRenderCard();
  assert.equal(priorityRows.length, 3, "one draggable row per prioritised backend");
  assert.ok(priorityRows.every((row) => row.draggable === true), "rows must be draggable");
  // Drag the second row (parallel) onto the first row's position.
  const dataTransfer = { getData: () => "parallel", setData: () => {}, effectAllowed: "", dropEffect: "" };
  priorityRows[0].onDrop({ preventDefault() {}, dataTransfer });
  assert.deepEqual(orderCalls, [["parallel", "exa", "brave"]],
    "a drop must persist the reordered list through setPriority");
});

test("client entry: card renders without a host t(), keyed toggles included", () => {
  const { seat, key, seen, withT } = deepRenderCard();
  assert.equal(seat, "plugins.bundle.config");
  assert.equal(key, "@240xu/dsh-websearch",
    "a keyed slot must name the bundle whose page it renders on");
  const toggleRows = seen.filter((name) => name === "ToggleRow").length;
  assert.ok(toggleRows > 0, "the card must render its backend toggle rows");
  assert.ok(withT.filter((name) => name === "ToggleRow").length === toggleRows,
    "every ToggleRow must receive a t() (a missing one throws and blanks the host section)");
  assert.ok(seen.includes("UnifiedSearchSection"));
});

/**
 * The reported card showed "已配置密钥: 1/7" and an already-stored Key that looked
 * empty. Pin both: every credential slot (8 key-gated — the 7 REST backends plus
 * GitHub — and the 2 optional keys) must render, the counter must publish the
 * required/optional breakdown, and a configured Key must announce itself in the
 * placeholder.
 */
test("client entry: ten credential slots, 8+2 counter, configured-key placeholder", () => {
  const { keyInputs, tKeys } = deepRenderCard({
    keyState: {
      DEEPSEEK_API_KEY: { configured: true, writable: true },
      ANYSEARCH_API_KEY: { configured: true, writable: true },
    },
  });
  assert.equal(keyInputs.length, 10, "8 required + 2 optional credential slots must all render");
  assert.ok(keyInputs.some((input) => input.placeholder === "DSH_WEBSEARCH_GITHUB_TOKEN"),
    "the GitHub token slot must render so the user can paste the PAT in the UI");
  assert.equal(keyInputs.filter((input) => input.placeholder === "T:keySetPlaceholder").length, 2,
    "every configured key must say so in its placeholder");
  assert.ok(keyInputs.some((input) => input.placeholder === "BRAVE_API_KEY"),
    "an unconfigured key still shows its env-var name");
  assert.ok(tKeys.includes("statusKeysDetail"),
    "the counter must render the required/optional breakdown");
  assert.equal(tKeys.filter((key) => key === "keySet").length, 2,
    "configured keys carry the 已配置 badge");
});

/**
 * The user's acceptance criterion: paste the GitHub token in the card, press
 * Save, and the value must land in the credential store. This drives the real
 * controller (not a stub) through editKey -> save and asserts the remote
 * credentials seam received set("DSH_WEBSEARCH_GITHUB_TOKEN", <value>).
 */
test("client entry: saving the GitHub token writes it to the credential store", async () => {
  const source = readFileSync(join(here, "..", "lib", "client.js"), "utf8");
  const jsx = (type, props) => ({ type, props });
  const jsxRuntime = { jsx, jsxs: jsx, Fragment: "Fragment" };
  class Component { constructor(props) { this.props = props; this.state = {}; } }
  const requireStub = (id) => (id === "react/jsx-runtime" ? jsxRuntime
    : id === "react" ? { Component, createElement: jsx } : {});
  let entry;
  vm.runInNewContext(source, {
    window: { __ModuleLoader__: { load: (def) => { entry = def.factory(requireStub); } } },
    console: { warn() {}, info() {}, error() {} },
  }, { filename: "lib/client.js" });

  const setCalls = [];
  const described = [];
  const remoteCredentials = {
    set: async (ref, value) => { setCalls.push([ref, value]); return { ok: true, value: {} }; },
    describe: async (refs) => {
      described.push(...(Array.isArray(refs) ? refs : []));
      return { ok: true, value: {} };
    },
  };
  const form = {
    getSnapshot: () => ({ status: "ready", value: { enableGithub: true }, writable: true }),
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
  };
  let cardProps;
  const ctx = {
    get: (name) => {
      if (name === "settingsScope") return undefined;
      if (name === "configForms") return { get: (id) => (id === "dsh-websearch" ? form : undefined) };
      if (name === "remote.credentials") return remoteCredentials;
      if (name === "remote") return { $on: () => () => {} };
      if (name === "connection") return { api: {} };
      return undefined;
    },
    locale: { register: () => () => {}, bind: () => (key) => "T:" + key },
    effect: (fn) => { const dispose = fn(); return typeof dispose === "function" ? dispose : () => {}; },
    slots: {
      inject: (_seat, cb) => { void cb(); return () => {}; },
      register: (def, component) => {
        // The host merges the seat def's inject() output into the component's
        // props; that output carries the controller's REAL editKey/save. Take
        // the actions from there rather than stubbing them, so this test drives
        // the production save path.
        const injected = def.inject();
        const projection = {
          ready: true, writable: true, status: "ready", value: { enableGithub: true },
          keyState: {}, stagedKeys: {}, stagedCount: 0, savedAt: 0, conflict: false,
          failedKeys: [], failedFields: [], saving: false, failed: false, stagedText: () => undefined,
        };
        component({
          ...injected,
          useUnifiedSearchCard: (selector) => selector(projection),
        });
        cardProps = injected;
        return () => {};
      },
    },
  };
  ctx.remote = ctx.get("remote");
  ctx.connection = ctx.get("connection");
  entry.apply(ctx);
  assert.ok(cardProps && typeof cardProps.editKey === "function" && typeof cardProps.save === "function",
    "the card must expose the controller's editKey/save actions");

  // The refreshAllCredentials() call in apply() must have probed the GitHub ref.
  assert.ok(described.includes("DSH_WEBSEARCH_GITHUB_TOKEN"),
    "the card must describe the GitHub ref so the slot can show 已配置/未配置");

  cardProps.editKey("DSH_WEBSEARCH_GITHUB_TOKEN", "ghp_ui_entered_token");
  await cardProps.save();

  assert.deepEqual(setCalls, [["DSH_WEBSEARCH_GITHUB_TOKEN", "ghp_ui_entered_token"]],
    "saving must write the pasted token to the credential store under the plugin's own ref");
});
/**
 * The reported bug: the card showed only its loading skeleton on the bundle page
 * because configForms was asked for the plugin ROW id, whose namespace the host
 * does not serve (status "unavailable" forever). It must bind a served
 * namespace -- unified-search -- and fall back to the row id only when nothing
 * better is advertised.
 */
test("client entry: binds a served settings namespace, not the plugin row id", () => {
  const readyForm = () => ({
    getSnapshot: () => ({ status: "ready", value: { enableBrave: true }, writable: true }),
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
  });
  const unavailableForm = {
    getSnapshot: () => ({ status: "unavailable", value: {}, writable: true }),
    subscribe: () => () => {},
    set: async () => true,
    unset: async () => true,
  };

  // Served directory names the settings namespace: ask for it, never the row id.
  const asked = [];
  deepRenderCard({
    forms: {
      describe: () => ({
        getSnapshot: () => ({ view: { namespaces: [{ ns: "unified-search" }] } }),
        subscribe: () => () => {},
      }),
      get: (id) => {
        asked.push(id);
        return id === "unified-search" ? readyForm() : unavailableForm;
      },
    },
  });
  assert.deepEqual(asked, ["unified-search"],
    "a served namespace must win over the row id");

  // No directory available: candidate order, and an unusable first candidate must
  // not stop the binder from reaching a usable later one.
  const fallbackAsked = [];
  deepRenderCard({
    forms: {
      get: (id) => {
        fallbackAsked.push(id);
        return id === "dsh-websearch" ? readyForm() : undefined;
      },
    },
  });
  assert.deepEqual(fallbackAsked, ["unified-search", "dsh-websearch"]);
});
