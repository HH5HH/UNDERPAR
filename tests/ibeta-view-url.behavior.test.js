const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_JS_PATH = path.join(ROOT, "popup.js");

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

function loadIBetaHelpers(seed = {}) {
  const source = fs.readFileSync(POPUP_JS_PATH, "utf8");
  const script = [
    'const UNDERPAR_IBETA_HANDLER_BASE_URL = "https://hh5hh.com/ups/";',
    'const UNDERPAR_IBETA_HANDLER_STORE_URL = `${UNDERPAR_IBETA_HANDLER_BASE_URL}index.php?mode=store`;',
    "const UNDERPAR_IBETA_REQUEST_TIMEOUT_MS = 8000;",
    "const fetch = globalThis.__seed.fetch;",
    "const window = globalThis.__seed.window;",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "normalizeUnderparIBetaSnapshot"),
    extractFunctionSource(source, "buildUnderparIBetaStoreRequestBody"),
    extractFunctionSource(source, "createUnderparIBetaViewUrl"),
    "module.exports = { buildUnderparIBetaStoreRequestBody, createUnderparIBetaViewUrl };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: seed,
    AbortController,
    Date,
    clearTimeout: (...args) => seed.window.clearTimeout(...args),
  };
  vm.runInNewContext(script, context, { filename: POPUP_JS_PATH });
  return context.module.exports;
}

function buildSeed(responseText = '{"viewUrl":"https://hh5hh.com/ups/?id=abc123"}') {
  const calls = [];
  return {
    calls,
    fetch: async (url, options = {}) => {
      calls.push({ url: String(url || ""), options: { ...options, headers: { ...(options.headers || {}) } } });
      return {
        ok: true,
        async text() {
          return responseText;
        },
      };
    },
    window: {
      setTimeout(callback, delay) {
        calls.push({ timerDelay: delay, callbackType: typeof callback });
        return 91;
      },
      clearTimeout(id) {
        calls.push({ clearedTimer: id });
      },
    },
  };
}

function buildSnapshot() {
  return {
    renderer: "underpar-esm-teaser-v1",
    workspaceKey: "esm",
    workspaceLabel: "ESM",
    datasetLabel: "Proxy Report",
    displayNodeLabel: "proxy",
    requestUrl: "https://mgmt.auth.adobe.com/esm/v3/media-company/year/month/day/proxy?requestor-id=TEST",
    requestPath: "/esm/v3/media-company/year/month/day/proxy?requestor-id=TEST",
    programmerId: "testco",
    programmerName: "Test Co",
    adobePassEnvironmentKey: "release-production",
    adobePassEnvironmentLabel: "Production",
    lastModified: "Mon, 16 Mar 2026 12:00:00 GMT",
    createdAt: 1710000000000,
    headerContext: {
      pathSegments: ["year", "month", "day", "proxy"],
      queryPairs: [{ key: "requestor-id", operator: "=", value: "TEST" }],
    },
    table: {
      headers: ["DATE", "COUNT"],
      rows: [["03/16/2026 12:00 MST", "1"]],
      rowCount: 1,
    },
  };
}

test("createUnderparIBetaViewUrl posts JSON without the legacy X-Requested-With header", async () => {
  const seed = buildSeed();
  const helpers = loadIBetaHelpers(seed);

  const viewUrl = await helpers.createUnderparIBetaViewUrl(buildSnapshot(), {
    source: "esm-workspace",
    createdAt: 1710000000000,
  });

  assert.equal(viewUrl, "https://hh5hh.com/ups/?id=abc123");
  const fetchCall = seed.calls.find((entry) => entry.url);
  assert.ok(fetchCall);
  assert.equal(fetchCall.url, "https://hh5hh.com/ups/index.php?mode=store");
  assert.equal(fetchCall.options.method, "POST");
  assert.deepEqual(fetchCall.options.headers, {
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  assert.equal(typeof fetchCall.options.body, "string");
  const parsedBody = JSON.parse(fetchCall.options.body);
  assert.equal(parsedBody.snapshot.workspaceKey, "esm");
  assert.equal(parsedBody.source, "esm-workspace");
  assert.equal(parsedBody.debug.rowCount, 1);
});
