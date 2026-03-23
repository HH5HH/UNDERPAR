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

function loadPremiumHydrationHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const PREMIUM_REQUIRED_SERVICE_KEYS = ["restV2", "esm", "degradation"];',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    extractFunctionSource(source, "createEmptyUnderparVaultCredential"),
    extractFunctionSource(source, "normalizeUnderparVaultDcrCache"),
    extractFunctionSource(source, "getPassVaultCredentialResultsForServiceKeys"),
    extractFunctionSource(source, "passVaultCredentialResultHasClientCredentials"),
    "module.exports = { getPassVaultCredentialResultsForServiceKeys, passVaultCredentialResultHasClientCredentials };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("blocking credential result filter ignores optional TempPASS entries", () => {
  const helpers = loadPremiumHydrationHelpers();
  const results = helpers.getPassVaultCredentialResultsForServiceKeys([
    { serviceKey: "resetTempPass", appGuid: "temp", cache: { clientId: "", clientSecret: "" }, error: "optional failed" },
    { serviceKey: "restV2", appGuid: "rest", cache: { clientId: "rest-client", clientSecret: "rest-secret" }, error: "" },
    { serviceKey: "degradation", appGuid: "deg", cache: { clientId: "", clientSecret: "" }, error: "required failed" },
  ]);

  assert.deepEqual(
    results.map((entry) => entry.serviceKey),
    ["restV2", "degradation"]
  );
});

test("credential readiness only passes when client credentials are present", () => {
  const helpers = loadPremiumHydrationHelpers();

  assert.equal(
    helpers.passVaultCredentialResultHasClientCredentials({
      serviceKey: "resetTempPass",
      cache: { clientId: "", clientSecret: "", accessToken: "" },
    }),
    false
  );
  assert.equal(
    helpers.passVaultCredentialResultHasClientCredentials({
      serviceKey: "restV2",
      cache: { clientId: "client", clientSecret: "secret" },
    }),
    true
  );
});
