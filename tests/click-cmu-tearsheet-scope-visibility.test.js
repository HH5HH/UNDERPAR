const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

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

function buildRuntimeHarness(relativePath) {
  const source = read(relativePath);
  const script = [
    extractFunctionSource(source, "getVisibleSystemRequestUrl"),
    extractFunctionSource(source, "getVisibleSystemQueryString"),
    extractFunctionSource(source, "getCompactCmuLabel"),
    "module.exports = { getVisibleSystemRequestUrl, getVisibleSystemQueryString, getCompactCmuLabel };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
    window: {
      location: {
        href: "https://example.test/",
      },
    },
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, relativePath) });
  return context.module.exports;
}

function buildMarkupHarness() {
  const source = read("popup.js");
  const script = [
    extractFunctionSource(source, "getClickCmuVisibleQueryString"),
    extractFunctionSource(source, "getClickCmuVisibleRequestUrl"),
    extractFunctionSource(source, "getClickCmuCompactLabel"),
    extractFunctionSource(source, "buildClickCmuEndpointDlMarkup"),
    "module.exports = { getClickCmuVisibleQueryString, getClickCmuVisibleRequestUrl, getClickCmuCompactLabel, buildClickCmuEndpointDlMarkup };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
    CM_REPORTS_BASE_URL: "https://cm.adobe.test",
    normalizeClickCmuEndpointCatalog: (entries = []) => entries,
    buildClickCmuTemplatePathOrderMap: () => new Map(),
    ensureCmUsageEndpointFormat: (value = "") => String(value || "").trim(),
    deriveClickCmuZoomClass: () => "zmDAY",
    deriveClickCmuStaticColumns: () => ["tenant", "mvpd"],
    escapeHtml: (value = "") =>
      String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;"),
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, "popup.js") });
  return context.module.exports;
}

test("scripts/clickESM.html hides CM tenant scope parameters from visible clickCMU labels", () => {
  const api = buildRuntimeHarness("scripts/clickESM.html");

  assert.equal(
    api.getVisibleSystemQueryString(
      "https://cm.adobe.test/v2/year/tenant/month/day?tenant=Turner&requestor-id=MML&mvpd=Comcast_SSO&metrics=users&format=json"
    ),
    "?requestor-id=MML&mvpd=Comcast_SSO"
  );

  assert.equal(
    api.getVisibleSystemRequestUrl(
      "https://cm.adobe.test/v2/year/tenant/month/day?tenant-id=Turner&requestor-id=MML&limit=500&format=json#frag"
    ),
    "https://cm.adobe.test/v2/year/tenant/month/day?requestor-id=MML"
  );

  assert.equal(
    api.getVisibleSystemRequestUrl("https://cm.adobe.test/maitai/applications?orgId=Turner&format=json"),
    "https://cm.adobe.test/maitai/applications"
  );

  assert.equal(
    api.getCompactCmuLabel(
      "https://cm.adobe.test/v2/year/tenant/month/day?tenant=Turner&requestor-id=MML&mvpd=Comcast_SSO&format=json"
    ),
    "v2/year/tenant/month/day?requestor-id=MML&mvpd=Comcast_SSO"
  );

  assert.equal(
    api.getVisibleSystemRequestUrl("https://cm.adobe.test/v2/billing/daily?tenant=Turner&format=json"),
    "https://cm.adobe.test/v2/billing/daily"
  );

  assert.equal(
    api.getCompactCmuLabel("https://cm.adobe.test/v2/billing/daily?tenant=Turner&format=json"),
    "v2/billing/daily"
  );
});

test("clickCMU static markup hides tenant scope from visible href/text while preserving the full scoped URL in data attributes", () => {
  const { buildClickCmuEndpointDlMarkup } = buildMarkupHarness();

  const markup = buildClickCmuEndpointDlMarkup([
    {
      id: "cmu-1",
      label: "CMU Tenant Drilldown",
      url: "https://cm.adobe.test/v2/year/tenant/month/day?tenant=Turner&requestor-id=MML&mvpd=Comcast_SSO&format=json&metrics=users",
      columns: ["tenant", "mvpd"],
    },
  ]);

  assert.match(markup, /href="https:\/\/cm\.adobe\.test\/v2\/year\/tenant\/month\/day\?requestor-id=MML&amp;mvpd=Comcast_SSO"/);
  assert.match(markup, /data-full-url="https:\/\/cm\.adobe\.test\/v2\/year\/tenant\/month\/day\?tenant=Turner&amp;requestor-id=MML&amp;mvpd=Comcast_SSO&amp;format=json&amp;metrics=users"/);
  assert.match(markup, /data-baseline-href="https:\/\/cm\.adobe\.test\/v2\/year\/tenant\/month\/day\?tenant=Turner&amp;requestor-id=MML&amp;mvpd=Comcast_SSO&amp;format=json&amp;metrics=users"/);
  assert.match(markup, /data-active-href="https:\/\/cm\.adobe\.test\/v2\/year\/tenant\/month\/day\?tenant=Turner&amp;requestor-id=MML&amp;mvpd=Comcast_SSO&amp;format=json&amp;metrics=users"/);
  assert.match(markup, />year\/tenant\/month\/day\?requestor-id=MML&amp;mvpd=Comcast_SSO</);
  assert.doesNotMatch(markup, />[^<]*tenant=Turner[^<]*</);
});

test("popup clickCMU runtime keeps tenant scope internal while rendering clean visible links", () => {
  const popupSource = read("popup.js");

  assert.match(
    popupSource,
    /\["format", "limit", "metrics", "tenant", "tenant_id", "tenant-id", "orgId", "orgid"\]/
  );
  assert.match(popupSource, /data-full-url="\$\{escapeHtml\(fullUrl\)\}"/);
  assert.match(popupSource, /anchor\.dataset\.baselineHref = fullHref;/);
  assert.match(popupSource, /anchor\.dataset\.activeHref = fullHref;/);
  assert.match(popupSource, /anchor\.href = visibleHref \|\| fullHref;/);
});
