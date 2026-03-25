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

function loadHealthSplunkHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const SPLUNK_BASE_URL = "https://splunk-us.corp.adobe.com";',
    'const SPLUNK_APP_SEARCH_PATH = "/en-US/app/app_adobepass/search";',
    'const SPLUNK_SEARCH_EARLIEST = "-24h@h";',
    'const SPLUNK_SEARCH_LATEST = "now";',
    'const HEALTH_SPLUNK_DASHBOARD_VIEW_NAME = "live_rest_api_sev2_dashboard";',
    'const DEFAULT_ADOBEPASS_ENVIRONMENT = { key: "release-production" };',
    'const state = { selectedRequestorId: "NBADE" };',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    "function resolveSelectedProgrammer() { return { programmerId: 'foxsports', programmerName: 'FOX Sports' }; }",
    "function getActiveAdobePassEnvironment() { return { key: globalThis.__envKey || 'release-production', label: globalThis.__envLabel || 'Production' }; }",
    "function getSplunkSearchIndexForEnvironment(environment = null) { const environmentKey = String(environment?.key || DEFAULT_ADOBEPASS_ENVIRONMENT.key).trim() || DEFAULT_ADOBEPASS_ENVIRONMENT.key; return environmentKey === 'release-staging' ? 'pass-staging' : 'pass-prod'; }",
    "function buildHealthWorkspaceSelectionKey(payload = {}) { return `${String(payload.programmerId || '').trim()}:${String(payload.requestorId || '').trim()}`; }",
    extractFunctionSource(source, "buildSplunkSearchQueryForUpstreamUserId"),
    extractFunctionSource(source, "getSplunkSearchLandingUrl"),
    extractFunctionSource(source, "buildHealthSplunkLoginSearch"),
    extractFunctionSource(source, "buildHealthSplunkDashboardUrl"),
    extractFunctionSource(source, "buildHealthSplunkQueryContext"),
    "module.exports = { getSplunkSearchLandingUrl, buildHealthSplunkDashboardUrl, buildHealthSplunkQueryContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    globalThis: { __envKey: "release-production", __envLabel: "Production" },
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("health splunk dashboard deeplink carries requestor and environment tokens", () => {
  const { buildHealthSplunkDashboardUrl } = loadHealthSplunkHelpers();
  const url = new URL(
    buildHealthSplunkDashboardUrl({
      requestorId: "fbc-fox",
      environmentIndex: "pass-prod",
      earliest: "-24h@h",
      latest: "now",
    })
  );

  assert.equal(url.pathname, "/en-US/app/app_adobepass/live_rest_api_sev2_dashboard");
  assert.equal(url.searchParams.get("form.tr_NmSjmaI0.earliest"), "-24h@h");
  assert.equal(url.searchParams.get("form.tr_NmSjmaI0.latest"), "now");
  assert.equal(url.searchParams.get("form.serviceProvider"), "fbc-fox");
  assert.equal(url.searchParams.get("form.environment"), "pass-prod");
});

test("health splunk query context exposes the dashboard deeplink and keeps the scoped search", () => {
  const { buildHealthSplunkQueryContext } = loadHealthSplunkHelpers();
  const queryContext = buildHealthSplunkQueryContext({
    programmerId: "foxsports",
    programmerName: "FOX Sports",
    requestorId: "NBADE",
  });
  const dashboardUrl = new URL(String(queryContext.dashboardUrl || ""));

  assert.equal(queryContext.environmentIndex, "pass-prod");
  assert.equal(queryContext.search, 'search index=pass-prod "NBADE"');
  assert.equal(dashboardUrl.searchParams.get("form.serviceProvider"), "NBADE");
  assert.equal(dashboardUrl.searchParams.get("form.environment"), "pass-prod");
});

test("splunk landing uses the health dashboard deeplink when provided", () => {
  const { getSplunkSearchLandingUrl } = loadHealthSplunkHelpers();
  const dashboardUrl =
    "https://splunk-us.corp.adobe.com/en-US/app/app_adobepass/live_rest_api_sev2_dashboard?form.tr_NmSjmaI0.earliest=-24h%40h&form.tr_NmSjmaI0.latest=now&form.serviceProvider=MML&form.environment=pass-prod";

  assert.equal(getSplunkSearchLandingUrl({ dashboardUrl }), dashboardUrl);
});
