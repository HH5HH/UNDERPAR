const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE_URL =
  "/esm/v3/media-company/year?media-company=megscope&requestor-id&requestor-id=foxsports&api&metrics=authz-successful#frag";
const EXPECTED_URL =
  "/esm/v3/media-company/year?requestor-id&requestor-id=foxsports&api&metrics=authz-successful";
const USER_REPORTED_URL =
  "/esm/v3/media-company/year/month/day/hour/minute/proxy/mvpd?proxy=Direct&requestor-id";

function extractFunctionSource(source, functionName) {
  const marker = `function ${functionName}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Unable to locate ${functionName}`);
  const bodyStart = source.indexOf("{", start);
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

function loadFunctions(relativePath, functionNames) {
  const filePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("meg workspace saved-query normalization preserves requestor-id flags and filters", () => {
  const helpers = loadFunctions("meg-workspace.js", [
    "normalizeSavedQueryName",
    "stripMegScopedQueryParams",
    "buildSavedQueryRecord",
  ]);

  const record = helpers.buildSavedQueryRecord("  Weekly   Query  ", FIXTURE_URL);

  assert.equal(record.name, "Weekly Query");
  assert.equal(record.url, EXPECTED_URL);
});

test("popup vault mirror preserves requestor-id when building saved query records", () => {
  const helpers = loadFunctions("popup.js", [
    "popupNormalizeSavedEsmQueryName",
    "stripMegWorkspaceScopedQueryParams",
    "popupBuildSavedEsmQueryRecord",
  ]);

  const record = helpers.popupBuildSavedEsmQueryRecord("Saved Query", FIXTURE_URL);

  assert.equal(record.name, "Saved Query");
  assert.equal(record.url, EXPECTED_URL);
});

test("saved query bridge preserves requestor-id while stripping media-company", () => {
  const helpers = loadFunctions("saved-query-bridge.js", ["stripSavedQueryScopedQueryParams"]);

  assert.equal(helpers.stripSavedQueryScopedQueryParams(FIXTURE_URL), EXPECTED_URL);
});

test("vault export normalization preserves requestor-id", () => {
  const helpers = loadFunctions("up-devtools-panel.js", ["normalizeVaultSavedQueryUrl"]);

  assert.equal(helpers.normalizeVaultSavedQueryUrl(FIXTURE_URL), EXPECTED_URL);
});

test("user reported proxy query keeps a bare requestor-id dimension in every saved-query layer", () => {
  const megHelpers = loadFunctions("meg-workspace.js", [
    "normalizeSavedQueryName",
    "stripMegScopedQueryParams",
    "buildSavedQueryRecord",
  ]);
  const popupHelpers = loadFunctions("popup.js", [
    "popupNormalizeSavedEsmQueryName",
    "stripMegWorkspaceScopedQueryParams",
    "popupBuildSavedEsmQueryRecord",
  ]);
  const bridgeHelpers = loadFunctions("saved-query-bridge.js", ["stripSavedQueryScopedQueryParams"]);
  const vaultHelpers = loadFunctions("up-devtools-panel.js", ["normalizeVaultSavedQueryUrl"]);

  assert.equal(megHelpers.stripMegScopedQueryParams(USER_REPORTED_URL), USER_REPORTED_URL);
  assert.equal(megHelpers.buildSavedQueryRecord("Direct Proxy", USER_REPORTED_URL).url, USER_REPORTED_URL);
  assert.equal(popupHelpers.popupBuildSavedEsmQueryRecord("Direct Proxy", USER_REPORTED_URL).url, USER_REPORTED_URL);
  assert.equal(bridgeHelpers.stripSavedQueryScopedQueryParams(USER_REPORTED_URL), USER_REPORTED_URL);
  assert.equal(vaultHelpers.normalizeVaultSavedQueryUrl(USER_REPORTED_URL), USER_REPORTED_URL);
});
