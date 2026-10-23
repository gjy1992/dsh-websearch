// tests/v281-form.test.js — SettingsForms adapter guard (cross-settings-forms.md):
// the 0.2.x form source is a per-FIELD volatile mark (a root-level
// meta.volatile is dropped when the loader re-resolves the schema, which removed
// this entry from settings.describe() entirely) + per-field meta.description.
import assert from "node:assert/strict";
import { Config } from "../lib/index.js";

// 1. every field carries the volatile mark (what volatileForm() selects).
{
  const missing = Object.entries(Config.dict ?? {})
    .filter(([, sch]) => sch?.meta?.volatile !== true)
    .map(([key]) => key);
  assert.deepEqual(missing, [], "fields missing meta.volatile: " + missing.join(","));
}

// 2. form-quality gate: every top-level field carries a non-empty description
//    (0.2.0 renders meta.description; a bare field falls back to its key name).
{
  const missing = Object.entries(Config.dict ?? {})
    .filter(([, sch]) => !sch?.meta?.description || String(sch.meta.description).trim().length === 0)
    .map(([key]) => key);
  assert.deepEqual(missing, [], "fields missing description: " + missing.join(","));
}

// 3. replication of RT volatileForm (:122-138): the whole Config must project
//    to a form (not undefined) now that the object itself is volatile.
{
  function volatileForm(schema) {
    if (schema.meta?.volatile) return schema; // plainSchema projection upstream
    if (schema.type === "object") {
      const dict = Object.fromEntries(
        Object.entries(schema.dict ?? {}).flatMap(([key, child]) => {
          const f = volatileForm(child);
          return f === undefined ? [] : [[key, f]];
        }),
      );
      return Object.keys(dict).length === 0 ? undefined : { type: "object", dict };
    }
    return undefined;
  }
  const form = volatileForm(Config);
  assert.ok(form, "volatileForm(Config) must yield a form");
  assert.equal(Object.keys(form.dict ?? {}).length, Object.keys(Config.dict ?? {}).length, "all fields included");
}

console.log("v281-form.test.js: all 3 test groups passed");
