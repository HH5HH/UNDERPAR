const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function extractFunctionSource(source, functionName) {
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) {
      break;
    }
  }
  assert.notEqual(start, -1, `Unable to locate ${functionName}`);
  const paramsStart = source.indexOf("(", start);
  assert.notEqual(paramsStart, -1, `Unable to locate params for ${functionName}`);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") paramsDepth += 1;
    if (char === ")") {
      paramsDepth -= 1;
      if (paramsDepth === 0) {
        bodyStart = source.indexOf("{", index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `Unable to locate body for ${functionName}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`Unterminated function: ${functionName}`);
}

function createClassList() {
  const values = new Set();
  return {
    add(...items) {
      items.forEach((item) => values.add(String(item || "")));
    },
    remove(...items) {
      items.forEach((item) => values.delete(String(item || "")));
    },
    toggle(item, force) {
      const normalized = String(item || "");
      if (force === true) {
        values.add(normalized);
        return true;
      }
      if (force === false) {
        values.delete(normalized);
        return false;
      }
      if (values.has(normalized)) {
        values.delete(normalized);
        return false;
      }
      values.add(normalized);
      return true;
    },
    contains(item) {
      return values.has(String(item || ""));
    },
  };
}

function createNodeStub() {
  const attributes = new Map();
  return {
    classList: createClassList(),
    dataset: {},
    setAttribute(name, value) {
      attributes.set(String(name || ""), String(value || ""));
    },
    removeAttribute(name) {
      attributes.delete(String(name || ""));
    },
    getAttribute(name) {
      return attributes.get(String(name || ""));
    },
  };
}

function loadActivityHelpers(seed = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = globalThis.__seed.state;",
    "const els = globalThis.__seed.els;",
    "const document = globalThis.__seed.document;",
    "function isInteractiveAuthBusyContext() { return false; }",
    extractFunctionSource(source, "getLocalGlobalNetworkActivityCount"),
    extractFunctionSource(source, "getRemoteGlobalNetworkActivityCount"),
    extractFunctionSource(source, "getGlobalNetworkActivityCount"),
    extractFunctionSource(source, "shouldShowBlockingBusyCursor"),
    extractFunctionSource(source, "shouldRunExperienceCloudSessionMonitor"),
    extractFunctionSource(source, "shouldShowLoggedOutAuthActivity"),
    extractFunctionSource(source, "syncGlobalNetworkActivityIndicator"),
    "module.exports = { syncGlobalNetworkActivityIndicator };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("auth activity button spins while network activity is running even when session monitoring is disabled", () => {
  const body = createNodeStub();
  const authBtn = createNodeStub();
  const helpers = loadActivityHelpers({
    state: {
      busy: false,
      busyContext: "",
      restricted: false,
      sessionReady: true,
      loginData: { accessToken: "test" },
      globalNetworkActivityCount: 1,
      remoteNetworkActivityCount: 0,
    },
    els: {
      authBtn,
    },
    document: {
      body,
    },
  });

  helpers.syncGlobalNetworkActivityIndicator();

  assert.equal(authBtn.classList.contains("net-busy"), true);
  assert.equal(authBtn.getAttribute("aria-busy"), "true");
  assert.equal(body.dataset.underparNetworkActivityCount, "1");
  assert.equal(body.classList.contains("net-busy"), false);
});
