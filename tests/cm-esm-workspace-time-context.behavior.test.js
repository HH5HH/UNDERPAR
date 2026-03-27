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
  const markers = [`async function ${functionName}(`, `function ${functionName}(`];
  let start = -1;
  for (const marker of markers) {
    start = source.indexOf(marker);
    if (start !== -1) {
      break;
    }
  }
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

function loadFunctions(relativePath, functionNames, globals = {}) {
  const source = read(relativePath);
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, relativePath) });
  return context.module.exports;
}

test("CM workspace banner uses CM tenant wording without stale controller-sync copy", () => {
  const source = read("cm-workspace.js");
  assert.match(source, /CM Tenant:/);
  assert.doesNotMatch(source, /Waiting for CM controller sync from UnderPAR side panel/);
});

test("CM workspace derives contextual start values from zoom-aware usage URLs", () => {
  const { buildCmuContextualStartQueryValue, ensureCmuQueryDefaults } = loadFunctions(
    "cm-workspace.js",
    [
      "formatCmuDateQueryValue",
      "shiftInstantToPstCalendar",
      "getCmuSourceCalendarParts",
      "parseCmuQueryDatePartValue",
      "resolveCmuQueryDatePart",
      "normalizeCmuZoomFromValue",
      "getCmuZoomKeyFromUrl",
      "buildCmuContextualStartQueryValue",
      "ensureCmuQueryDefaults",
    ],
    {
      CM_SOURCE_UTC_OFFSET_MINUTES: -8 * 60,
      CM_WORKSPACE_REPORTS_BASE_URL: "https://cm-reports.adobeprimetime.com",
      isCmuUsageRequestUrl: () => true,
      applyWorkspaceTenantScopeToUsageUrl: (urlValue, tenantScope = "") => {
        const parsed = new URL(urlValue, "https://cm-reports.adobeprimetime.com");
        if (tenantScope) {
          parsed.searchParams.set("tenant", tenantScope);
        }
        return parsed.toString();
      },
    }
  );

  assert.equal(
    buildCmuContextualStartQueryValue(
      "https://cm-reports.adobeprimetime.com/v2/year/month/tenant?year=2026&month=03"
    ),
    "2026-03-01T00:00:00"
  );
  assert.equal(
    buildCmuContextualStartQueryValue(
      "https://cm-reports.adobeprimetime.com/v2/year/month/day/hour/minute/tenant?year=2026&month=03&day=27&hour=18"
    ),
    "2026-03-27T18:00:00"
  );

  const normalized = ensureCmuQueryDefaults(
    "https://cm-reports.adobeprimetime.com/v2/year/month/day/tenant?year=2026&month=03&day=27",
    "fox-tenant"
  );
  const normalizedUrl = new URL(normalized);
  assert.equal(normalizedUrl.searchParams.get("start"), "2026-03-27T00:00:00");
  assert.equal(normalizedUrl.searchParams.get("tenant"), "fox-tenant");
  assert.equal(normalizedUrl.searchParams.get("format"), "json");

  const preserved = ensureCmuQueryDefaults(
    "https://cm-reports.adobeprimetime.com/v2/year/month/day/tenant?start=2026-02-01T00:00:00&year=2026&month=03&day=27"
  );
  assert.equal(new URL(preserved).searchParams.get("start"), "2026-02-01T00:00:00");
});

test("ESM workspace injects contextual start values without overwriting explicit start", () => {
  const {
    detectWorkspaceZoomKeyFromUrl,
    shiftInstantToEsmSourceCalendar,
    getEsmSourceCalendarParts,
    parseEsmQueryDatePartValue,
    resolveEsmQueryDatePart,
    buildEsmContextualStartQueryValue,
    ensureEsmContextualStartQuery,
    extractRawQueryText,
    buildInheritedRequestUrl,
  } = loadFunctions("esm-workspace.js", [
    "detectWorkspaceZoomKeyFromUrl",
    "shiftInstantToEsmSourceCalendar",
    "getEsmSourceCalendarParts",
    "parseEsmQueryDatePartValue",
    "resolveEsmQueryDatePart",
    "buildEsmContextualStartQueryValue",
    "ensureEsmContextualStartQuery",
    "extractRawQueryText",
    "buildInheritedRequestUrl",
  ], {
    ESM_SOURCE_UTC_OFFSET_MINUTES: -8 * 60,
    ESM_NODE_BASE_URL: "https://mgmt.auth.adobe.com/esm/v3/media-company/",
    ESM_CARD_ZOOM_TOKEN_BY_KEY: {
      YR: "/year",
      MO: "/month",
      DAY: "/day",
      HR: "/hour",
      MIN: "/minute",
    },
  });

  assert.equal(detectWorkspaceZoomKeyFromUrl("/esm/v3/media-company/year/month/day/hour/minute/proxy"), "MIN");
  assert.equal(
    buildEsmContextualStartQueryValue(
      "https://mgmt.auth.adobe.com/esm/v3/media-company/year/month/day/hour?year=2026&month=03&day=27"
    ),
    "2026-03-27T00:00:00"
  );
  assert.equal(
    buildEsmContextualStartQueryValue(
      "https://mgmt.auth.adobe.com/esm/v3/media-company/year/month/day/hour/minute?year=2026&month=03&day=27&hour=18"
    ),
    "2026-03-27T18:00:00"
  );

  const inherited = buildInheritedRequestUrl(
    "https://mgmt.auth.adobe.com/esm/v3/media-company/year/month/day/hour/proxy/mvpd",
    "https://mgmt.auth.adobe.com/esm/v3/media-company/year/month/day/proxy?requestor-id=MML&year=2026&month=03&day=27"
  );
  const inheritedUrl = new URL(inherited);
  assert.equal(inheritedUrl.searchParams.get("requestor-id"), "MML");
  assert.equal(inheritedUrl.searchParams.get("start"), "2026-03-27T00:00:00");

  const preserved = ensureEsmContextualStartQuery(
    "https://mgmt.auth.adobe.com/esm/v3/media-company/year/month/day/hour?start=2026-02-01T00:00:00&year=2026&month=03&day=27"
  );
  assert.equal(new URL(preserved).searchParams.get("start"), "2026-02-01T00:00:00");
});

test("popup CM and ESM runtime helpers preserve explicit start and synthesize missing start", () => {
  const popupSource = read("popup.js");
  assert.match(
    popupSource,
    /function ensureCmUsageEndpointFormat[\s\S]*popupBuildCmuContextualStartQueryValue/
  );
  assert.doesNotMatch(
    popupSource,
    /function ensureCmUsageEndpointFormat[\s\S]*stripServerManagedTimeParams/
  );
  assert.doesNotMatch(
    popupSource,
    /function ensureCmUsageEndpointFormat[\s\S]*delete\("start"\);\s*parsed\.searchParams\.delete\("end"\);/
  );

  assert.match(
    popupSource,
    /function ensureCmuQueryDefaults[\s\S]*buildContextualCmuStartValue/
  );
  assert.doesNotMatch(
    popupSource,
    /function ensureCmuQueryDefaults[\s\S]*delete\("start"\);\s*parsed\.searchParams\.delete\("end"\);/
  );

  assert.match(
    popupSource,
    /function esmWorkspaceBuildEndpointUrl[\s\S]*popupEnsureEsmContextualStartQuery/
  );
  assert.doesNotMatch(
    popupSource,
    /function esmWorkspaceBuildEndpointUrl[\s\S]*parsed\.searchParams\.delete\("start"\)/
  );
});
