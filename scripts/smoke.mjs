// Zero-dependency runtime smoke harness for termux-panel.ts.
// Builtins only: node:fs, node:os, node:path, node:child_process, node:util,
// node:test, node:assert/strict, + vendorable typescript (transpileModule, no emit).
// Run: npm run smoke  (or: node scripts/smoke.mjs)

import { writeFileSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ts from "../node_modules/typescript/lib/typescript.js";

// --- stub path for termux-* binaries + argv sentinel (no execFile interception) -------
// NOTE: an earlier version wrapped execFile to record argv, but promisify()
// inside the `new Function` execution context silently dropped stdout (a
// CJS/ESM+promisify interaction). Sentinel files avoid intercepting spawn
// and keep the real execFile path 100% intact.
const stubDir = join(tmpdir(), "tpl-smoke-mockbin");
const argvSentinel = join(tmpdir(), "tpl-smoke-argv.log");
const stubs = {
  "termux-battery-status": `#!/bin/bash\necho '{"percentage": 77, "status": "discharging"}'\n`,
  "termux-location": `#!/bin/bash\nprintf '%s ' "$@" >> "${argvSentinel}"\necho '[termux-location] args: $@' >&2\necho '{"latitude": 1.0, "longitude": 2.0, "provider": "mock"}'\n`,
  "termux-device-info": `#!/bin/bash\necho '{"model": "MockDevice", "android": "99"}'\n`,
};
import { mkdirSync } from "node:fs";
mkdirSync(stubDir, { recursive: true });
for (const [name, body] of Object.entries(stubs)) {
  const f = join(stubDir, name);
  writeFileSync(f, body);
  chmodSync(f, 0o755);
}

// --- load termux-panel.ts via transpileModule (no emit) --------------------------------
const src = readFileSync(new URL("../termux-panel.ts", import.meta.url), "utf8");
const cleaned = src
  .replace(/import type [^\n]*\n/g, "")
  .replace(/import \{ execFile \} from "node:child_process";/g, "const { execFile } = require('node:child_process');")
  .replace(/import \{ promisify \} from "node:util";/g, "const { promisify } = require('node:util');")
  .replace(/import \{ existsSync \} from "node:fs";/g, "const { existsSync } = require('node:fs');");

const result = ts.transpileModule(cleaned, {
  compilerOptions: { module: "commonjs", target: "es2022" },
});
if (result.diagnostics && result.diagnostics.length) {
  throw new Error("transpile failed: " + result.diagnostics.map((d) => d.messageText).join("; "));
}

// --- fake Pi runtime -----------------------------------------------------------
function makePi() {
  const cmds = Object.create(null);
  const tools = Object.create(null);
  return {
    cmds,
    tools,
    registerCommand(name, options) { cmds[name] = options; },
    registerTool(tool) { tools[tool.name] = tool; },
  };
}

function fakeCtx() {
  const calls = { notify: [], select: [], input: [], confirm: [] };
  return {
    mode: "tui",
    hasUI: true,
    ui: {
      select: (title, options) => { calls.select.push({ title, options }); return Promise.resolve(undefined); },
      input: (prompt, def) => { calls.input.push({ prompt, def }); return Promise.resolve(""); },
      confirm: (title, body) => { calls.confirm.push({ title, body }); return Promise.resolve(false); },
      notify: (msg, kind) => { calls.notify.push({ msg, kind }); },
    },
    _calls: calls,
  };
}

// --- evaluate transpiled CJS via Node's own Function (handles default export) --------
// Sentinel-based argv capture: mocks append "$@" to argvSentinel. We reset it
// before each location test and read it back. (See comment above stubs.)
function resetSentinel() { writeFileSync(argvSentinel, "", "utf8"); }
function readSentinel() { try { return readFileSync(argvSentinel, "utf8"); } catch { return ""; } }

const fakeRequire = (name) => {
  if (name === "node:child_process") return { execFile };
  if (name === "node:util") return { promisify };
  if (name === "node:fs") return { existsSync: () => true };
  throw new Error("unexpected require: " + name);
};
function loadFactory() {
  const body = result.outputText;
  // Node's _compile wraps body in (function(exports,require,module,__filename,__dirname){...})
  // and binds `exports` to `module.exports`; the transpiled `exports.default=value`
  // assignment mutates that shared object, so we read it afterwards.
  new Function("module", "exports", "require", "__dirname", "__filename",
    body.replace(/^(?:\s*"use strict";)?/, ""))
  // eslint-disable-next-line no-new-func
  ;
  const wrapper = new Function(
    "module", "exports", "require", "__dirname", "__filename",
    body.replace(/^(\s*"use strict";\s*)?/, "")
  );
  // Provide a fake module + exports that share identity (like Node CJS).
  const mod = { exports: {} };
  const sharedExports = mod.exports;
  wrapper(mod, sharedExports, fakeRequire, process.cwd(), "/termux-panel.ts");
  const def = sharedExports.default ?? sharedExports;
  return typeof def === "function" ? def : sharedExports.default;
}

function withMockPath(fn) {
  const orig = process.env.PATH;
  process.env.PATH = stubDir + ":" + orig;
  try { return fn(); } finally { process.env.PATH = orig; }
}

describe("termux-panel smoke", { concurrency: 1 }, () => {
  test("1. registers 3 commands + termux_read tool", () => {
    const pi = makePi();
    loadFactory()(pi);
    assert.deepEqual(Object.keys(pi.cmds).sort(), ["battery", "location", "termux"]);
    assert.equal("termux_read" in pi.tools, true);
  });

  test("2. /battery under UI writes the battery line", async () => {
    const pi = makePi(); const ctx = fakeCtx();
    const factory = loadFactory();
    await withMockPath(async () => { factory(pi); await pi.cmds.battery.handler("", ctx); });
    const sel = ctx._calls.select.find((c) => c.title === "Battery");
    assert.ok(sel, "expected /battery to render a Battery select view");
    assert.ok(sel.options.some((l) => l.includes("percentage: 77")));
  });

  test("3. termux_read battery returns text lines (no ctx.ui)", async () => {
    const pi = makePi();
    const factory = loadFactory();
    factory(pi);
    const res = await withMockPath(async () => pi.tools.termux_read.execute("session-1", { field: "battery" }));
    assert.equal(res.terminate, false);
    assert.ok(res.content[0].text.includes("percentage: 77"), "battery text present");
  });

  test("4. termux_read location gps passes -p gps", async () => {
    const pi = makePi();
    const factory = loadFactory();
    factory(pi);
    resetSentinel();
    const res = await withMockPath(async () => pi.tools.termux_read.execute("session-2", { field: "location", provider: "gps" }));
    const argv = readSentinel();
    assert.ok(/-p gps/.test(argv), "expected -p gps in argv (saw: " + JSON.stringify(argv) + ")");
    assert.equal(res.terminate, false);
    assert.ok(res.content[0].text.length > 0, "expected non-empty location text");
  });

  test("5. termux_read unknown field -> invalid_field", async () => {
    const pi = makePi();
    loadFactory()(pi);
    const res = await pi.tools.termux_read.execute("session-3", { field: "nope" });
    assert.equal(res.details?.error, "invalid_field");
    assert.ok(res.content[0].text.includes("Unknown field"));
  });

  test("6. headless: bare ctx={} through /battery resolves without throwing", async () => {
    const pi = makePi();
    const factory = loadFactory();
    await withMockPath(async () => { factory(pi); await pi.cmds.battery.handler("", {}); });
    assert.ok(true);
  });

  test("7. /location gps selects gps + GPS provider arg", async () => {
    const pi = makePi(); const ctx = fakeCtx();
    const factory = loadFactory();
    factory(pi);
    resetSentinel();
    await withMockPath(async () => { await pi.cmds.location.handler("gps", ctx); });
    const argv = readSentinel();
    assert.ok(/-p gps/.test(argv), "expected -p gps in argv (saw: " + JSON.stringify(argv) + ")");
    const locSel = ctx._calls.select.find((c) => c.title.startsWith("Location (gps)"));
    assert.ok(locSel, "expected Location (gps) view");
  });

  test("8. /location unknown arg falls back to network", async () => {
    const pi = makePi(); const ctx = fakeCtx();
    const factory = loadFactory();
    factory(pi);
    await withMockPath(async () => { await pi.cmds.location.handler("GLONASS", ctx); });
    const locSel = ctx._calls.select.find((c) => c.title.startsWith("Location (network)"));
    assert.ok(locSel, "expected Location (network) fallback view");
  });
});
