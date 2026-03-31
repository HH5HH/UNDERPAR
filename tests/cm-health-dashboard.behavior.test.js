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

function normalizeRealmObject(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function makeNormalizeStringList(values = []) {
  const source = Array.isArray(values) ? values : [values];
  const output = [];
  source.forEach((entry) => {
    const normalized = String(entry || "").trim();
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
  });
  return output;
}

function loadPopupFunctions(functionNames, globals = {}) {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    ...functionNames.map((name) => extractFunctionSource(source, name)),
    `module.exports = { ${functionNames.join(", ")} };`,
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadCmHealthSortHelpers() {
  const filePath = path.join(ROOT, "cm-health-workspace.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = { tableSorts: {} };",
    extractFunctionSource(source, "escapeHtml"),
    extractFunctionSource(source, "formatCompactNumber"),
    extractFunctionSource(source, "formatPercent"),
    extractFunctionSource(source, "formatRatio"),
    extractFunctionSource(source, "normalizeBreakdownSortDirection"),
    extractFunctionSource(source, "normalizeBreakdownSortRule"),
    extractFunctionSource(source, "resolveBreakdownColumn"),
    extractFunctionSource(source, "getBreakdownDefaultSortDirection"),
    extractFunctionSource(source, "getBreakdownSortableValue"),
    extractFunctionSource(source, "compareBreakdownSortValues"),
    extractFunctionSource(source, "sortBreakdownRows"),
    extractFunctionSource(source, "getBreakdownSortAriaValue"),
    extractFunctionSource(source, "getBreakdownSortIndicatorHtml"),
    extractFunctionSource(source, "buildBreakdownSortButtonLabel"),
    extractFunctionSource(source, "getNextBreakdownSortRule"),
    extractFunctionSource(source, "renderBreakdownTable"),
    "module.exports = { state, sortBreakdownRows, getNextBreakdownSortRule, renderBreakdownTable };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Intl,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("CM health query context clears incompatible MVPD filters when channel focus is active", () => {
  const popupHelpers = loadPopupFunctions(
    [
      "buildCmHealthWorkspaceBaseSelectionKey",
      "buildCmHealthWorkspaceSelectionKey",
      "resolveCmHealthFilterMode",
      "buildCmHealthDashboardQueryContext",
    ],
    {
      state: { selectedRequestorId: "NBADE" },
      DEFAULT_ADOBEPASS_ENVIRONMENT: { key: "release-production" },
      CM_HEALTH_DEFAULT_GRANULARITY: "hour",
      getActiveAdobePassEnvironmentKey: () => "release-production",
      resolveSelectedProgrammer: () => ({ programmerId: "foxsports", programmerName: "FOX Sports" }),
      getActiveAdobePassEnvironment: () => ({ key: "release-production", label: "Production" }),
      firstNonEmptyString: (values = []) => values.find((value) => String(value || "").trim()) || "",
      normalizeEsmHealthFilterList: makeNormalizeStringList,
      resolveEsmHealthDateRange: (start, end) => ({
        start: String(start || "2026-03-23").trim(),
        end: String(end || "2026-03-24").trim(),
      }),
      normalizeEsmHealthGranularity: (value = "") => {
        const normalized = String(value || "").trim().toLowerCase();
        return normalized === "hour" || normalized === "month" ? normalized : "day";
      },
      resolveCmUsageTenantScopeValue: (...values) => values.find((value) => String(value || "").trim()) || "",
      getCmTenantScopeForProgrammer: () => "fox-tenant",
    }
  );

  const queryContext = normalizeRealmObject(
    popupHelpers.buildCmHealthDashboardQueryContext({
      programmerId: "foxsports",
      programmerName: "FOX Sports",
      windowPreset: "day-7",
      tenantScope: "fox-tenant",
      drilldownMvpdIds: ["Comcast"],
      channels: ["FoxSportsGo"],
      start: "2026-03-23",
      end: "2026-03-24",
    })
  );

  assert.equal(queryContext.filterMode, "channel");
  assert.equal(queryContext.windowPreset, "day-7");
  assert.deepEqual(queryContext.drilldownMvpdIds, []);
  assert.deepEqual(queryContext.mvpdIds, []);
  assert.equal(queryContext.tenantScope, "fox-tenant");
  assert.match(queryContext.selectionKey, /FoxSportsGo/);
});

test("CM health request URL injects tenant scope and MVPD only for MVPD-aware paths", () => {
  const popupHelpers = loadPopupFunctions(["normalizeCmHealthUsagePath", "extractCmHealthUsagePathParts", "buildCmHealthUsageRequestUrl"], {
    CM_REPORTS_BASE_URL: "https://cm.example.test",
    CM_USAGE_TENANT_QUERY_KEYS: ["tenant"],
    buildApiRequestUrl: (baseUrl, pathname) => new URL(pathname, baseUrl),
    resolveCmUsageTenantScopeValue: (...values) => values.find((value) => String(value || "").trim()) || "",
    cmUsagePathRequiresTenantScope: (pathname = "") => String(pathname || "").includes("/tenant"),
    applyCmUsageTenantScopeToSearchParams: (searchParams, tenantScope) => searchParams.set("tenant", tenantScope),
    normalizeEsmHealthFilterList: makeNormalizeStringList,
  });

  const scopedUrl = new URL(
    popupHelpers.buildCmHealthUsageRequestUrl(
      "/v2/tenant/year/month/day/mvpd/platform/application-id",
      {
        tenantScope: "fox-tenant",
        mvpdIds: ["Comcast"],
      }
    )
  );
  const tenantOnlyUrl = new URL(
    popupHelpers.buildCmHealthUsageRequestUrl("/v2/tenant/year/month/day/channel/platform/application-id", {
      tenantScope: "fox-tenant",
      mvpdIds: ["Comcast"],
    })
  );

  assert.equal(scopedUrl.searchParams.get("tenant"), "fox-tenant");
  assert.equal(scopedUrl.searchParams.get("mvpd"), "Comcast");
  assert.equal(scopedUrl.pathname, "/v2/tenant/year/month/day/mvpd/platform/application-id");
  assert.equal(tenantOnlyUrl.searchParams.get("tenant"), "fox-tenant");
  assert.equal(tenantOnlyUrl.searchParams.get("mvpd"), null);

  const concurrencyUrl = new URL(
    popupHelpers.buildCmHealthUsageRequestUrl("/v2/year/month/day/concurrency-level/tenant", {
      tenantScope: "fox-tenant",
    })
  );
  assert.equal(concurrencyUrl.pathname, "/v2/year/month/day/concurrency-level/tenant");
  assert.equal(concurrencyUrl.searchParams.get("metrics"), "users");
});

test("health status source places CM between ESM and SPLUNK launch buttons", () => {
  const popupSource = read("popup.js");
  const popupCssSource = read("popup.css");

  assert.match(popupSource, /data-health-action="esm"[\s\S]*data-health-action="cm"[\s\S]*data-health-action="splunk"/);
  assert.match(popupSource, /if \(normalizedAction === "cm"\)[\s\S]*runCmHealthDashboardForSelection/);
  assert.match(popupSource, /platformBreakdown: fetchCmHealthJson\(queryContext, CM_HEALTH_PLATFORM_APPLICATION_DAILY_PATH/);
  assert.match(popupCssSource, /\.hr-health-action-btn:not\(:disabled\)[\s\S]*underpar-success/);
});

test("CM health workspace renders sortable headers and honors numeric sort order", () => {
  const helpers = loadCmHealthSortHelpers();
  const columns = [
    { key: "platform", label: "Platform", drillType: "platform" },
    { key: "startedSessions", label: "Started", type: "number" },
    { key: "failureRate", label: "Failure", type: "percent" },
  ];
  const rows = [
    { platform: "Roku", startedSessions: 12, failureRate: 0.09 },
    { platform: "Apple TV", startedSessions: 9, failureRate: 0.02 },
    { platform: "Fire TV", startedSessions: 18, failureRate: 0.14 },
  ];
  helpers.state.tableSorts["platform-hotspots"] = {
    columnKey: "startedSessions",
    direction: "desc",
  };

  const html = helpers.renderBreakdownTable("platform-hotspots", "Platform Hotspots", "copy", rows, columns, "");
  const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);

  assert(bodyMatch, "Expected tbody markup");
  assert.match(html, /data-sort-table="platform-hotspots"/);
  assert.match(html, /data-sort-column="startedSessions"/);
  assert.deepEqual(normalizeRealmObject(helpers.getNextBreakdownSortRule(columns, null, "startedSessions")), {
    columnKey: "startedSessions",
    direction: "desc",
  });
  assert(bodyMatch[1].indexOf("Fire TV") < bodyMatch[1].indexOf("Roku"));
  assert(bodyMatch[1].indexOf("Roku") < bodyMatch[1].indexOf("Apple TV"));
});

test("CM health workspace source wires delegated header sort clicks into the shared table host", () => {
  const source = read("cm-health-workspace.js");

  assert.match(source, /closest\("\[data-sort-table\]\[data-sort-column\]"\)/);
  assert.match(source, /toggleBreakdownTableSort\(/);
});

test("CM health workspace charts bind hover-aware sparkline tooltips after rerenders", () => {
  const source = read("cm-health-workspace.js");
  const css = read("esm-health-workspace.css");

  assert.match(source, /data-sparkline-chart/);
  assert.match(source, /data-sparkline-payload/);
  assert.match(source, /bindSparklineTooltips\(\);/);
  assert.match(source, /addEventListener\("mousemove"/);
  assert.match(source, /addEventListener\("keydown"/);
  assert.match(source, /role="img"/);
  assert.match(css, /\.esm-health-chart-tooltip\s*\{/);
  assert.match(css, /\.esm-health-sparkline-hover-guide/);
});
