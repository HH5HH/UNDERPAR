const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

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

function extractConstSetSource(source, constName) {
  const marker = `const ${constName} = new Set([`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Unable to locate ${constName}`);
  const end = source.indexOf("]);", start);
  assert.notEqual(end, -1, `Unable to locate end of ${constName}`);
  return source.slice(start, end + 3);
}

function loadPopupCmuPathHelpers() {
  const source = read("popup.js");
  const script = [
    'const CM_REPORTS_BASE_URL = "https://cm.example.test";',
    'const CM_USAGE_REQUIRED_SEGMENT = "year";',
    'const CM_USAGE_ROOT_SEGMENTS = ["year"];',
    'const CM_USAGE_BILLING_ROOT_SEGMENTS = ["billing"];',
    'const CM_USAGE_ROOT_SEGMENT_SET = new Set([...CM_USAGE_ROOT_SEGMENTS, ...CM_USAGE_BILLING_ROOT_SEGMENTS]);',
    'const CMU_USAGE_ROOT_SEGMENTS = ["year"];',
    'const CMU_USAGE_BILLING_ROOT_SEGMENTS = ["billing"];',
    'const CMU_USAGE_ROOT_SEGMENT_SET = new Set([...CMU_USAGE_ROOT_SEGMENTS, ...CMU_USAGE_BILLING_ROOT_SEGMENTS]);',
    'const CM_USAGE_CANONICAL_PREFIXES = ["/v2/year", "/v2/billing"];',
    'const CM_USAGE_TENANT_QUERY_KEYS = ["tenant", "tenant_id", "tenant-id"];',
    extractFunctionSource(source, "normalizeCmuUsagePathSegment"),
    extractFunctionSource(source, "resolveCmuUsageRootSegments"),
    extractFunctionSource(source, "canonicalizeCmuUsagePathParts"),
    extractFunctionSource(source, "canonicalizeCmuUsagePath"),
    extractFunctionSource(source, "isCanonicalCmuUsagePath"),
    extractFunctionSource(source, "cmUsagePathRequiresTenantScope"),
    "module.exports = { canonicalizeCmuUsagePath, isCanonicalCmuUsagePath, cmUsagePathRequiresTenantScope };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, "popup.js") });
  return context.module.exports;
}

function loadWorkspaceCmuHelpers(relativePath) {
  const source = read(relativePath);
  const script = [
    extractConstSetSource(source, "CM_METRIC_COLUMNS"),
    extractConstSetSource(source, "CM_DATE_DIMENSION_KEYS"),
    extractConstSetSource(source, "CM_FILTER_BLOCKED_COLUMNS"),
    extractConstSetSource(source, "CM_CMU_NON_DIMENSION_PATH_SEGMENTS"),
    'function normalizeCmColumnName(value = "") { return String(value || "").trim().toLowerCase().replace(/_/g, "-"); }',
    'function addCmuPathDimensionAliases(targetSet, value = "") { const normalized = normalizeCmColumnName(value); if (normalized) { targetSet.add(normalized); } }',
    extractFunctionSource(source, "isCmuUsageRequestUrl"),
    extractFunctionSource(source, "isCmDateTimeColumn"),
    extractFunctionSource(source, "isCmMetricColumn"),
    extractFunctionSource(source, "resolveCmuPathDimensionSet"),
    "module.exports = { isCmuUsageRequestUrl, resolveCmuPathDimensionSet };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, relativePath) });
  return context.module.exports;
}

test("CM usage knowledge reflects the billing collection contract", () => {
  const popupSource = read("popup.js");
  const clickCatalog = readJson("click-cmu-endpoints.json");
  const usageExamples = readJson("cm-usage-reports-examples.json");

  assert.match(popupSource, /const CM_USAGE_BILLING_SCOPE = "cmu:billing:client";/);
  assert.match(popupSource, /\[CM_USAGE_BILLING_SCOPE\]: "CM Usage Billing"/);
  assert.match(popupSource, /\[CM_USAGE_ANALYTICS_SCOPE\]: "CM Usage Analytics"/);
  assert.match(popupSource, /"billing",\s*"daily"/);

  const billingEndpoint = (Array.isArray(clickCatalog.endpoints) ? clickCatalog.endpoints : []).find(
    (entry) => String(entry?.url || "").trim() === "https://cm-reports.adobeprimetime.com/v2/billing/daily"
  );
  assert.ok(billingEndpoint, "expected /v2/billing/daily in click CMU endpoint catalog");
  assert.equal(billingEndpoint.zoomKey, "DAY");
  assert.equal(billingEndpoint.zoomClass, "zmDAY");

  assert.equal(usageExamples.reportCount, usageExamples.reports.length);
  const billingExample = (Array.isArray(usageExamples.reports) ? usageExamples.reports : []).find(
    (entry) => String(entry?.path || "").trim() === "/v2/billing/daily"
  );
  assert.ok(billingExample, "expected /v2/billing/daily in CM usage report examples");
  assert.equal(billingExample.section, "daily");
  assert.equal(billingExample.hasMvpdDimension, false);
});

test("popup CM usage path canonicalization accepts billing daily reports without tenant scope", () => {
  const helpers = loadPopupCmuPathHelpers();

  assert.equal(helpers.canonicalizeCmuUsagePath("/v2/billing/daily?tenant=Turner&format=json"), "/v2/billing/daily");
  assert.equal(helpers.isCanonicalCmuUsagePath("/v2/billing/daily?tenant=Turner&format=json"), true);
  assert.equal(helpers.cmUsagePathRequiresTenantScope("/v2/billing/daily?tenant=Turner&format=json"), false);

  assert.equal(
    helpers.canonicalizeCmuUsagePath("/v2/tenant/year/month/day?tenant=Turner&format=json"),
    "/v2/year/tenant/month/day"
  );
  assert.equal(helpers.cmUsagePathRequiresTenantScope("/v2/tenant/year/month/day?tenant=Turner&format=json"), true);
});

test("CM workspaces classify billing daily as CMU usage without exposing fake dimensions", () => {
  [
    "cm-workspace.js",
    "mvpd-workspace.js",
  ].forEach((relativePath) => {
    const helpers = loadWorkspaceCmuHelpers(relativePath);

    assert.equal(helpers.isCmuUsageRequestUrl("https://cm.example.test/v2/billing/daily?tenant=Turner&format=json"), true);
    assert.equal(helpers.isCmuUsageRequestUrl("https://sp.auth.adobe.com/api/v2/MML/configuration"), false);
    assert.equal(
      helpers.resolveCmuPathDimensionSet({
        requestUrl: "https://cm.example.test/v2/billing/daily?tenant=Turner&format=json",
      }),
      null
    );
  });
});
