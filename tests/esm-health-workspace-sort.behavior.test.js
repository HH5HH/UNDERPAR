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

function loadEsmHealthSortHelpers() {
  const filePath = path.join(ROOT, "esm-health-workspace.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "const state = { tableSorts: {} };",
    extractFunctionSource(source, "escapeHtml"),
    extractFunctionSource(source, "formatCompactNumber"),
    extractFunctionSource(source, "formatPercent"),
    extractFunctionSource(source, "formatLatency"),
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
    "module.exports = { state, sortBreakdownRows, getNextBreakdownSortRule, getBreakdownSortAriaValue, renderBreakdownTable };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Intl,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadEsmSparklineHelpers() {
  const filePath = path.join(ROOT, "esm-health-workspace.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const state = { query: { granularity: "hour" } };',
    extractFunctionSource(source, "escapeHtml"),
    extractFunctionSource(source, "formatCompactNumber"),
    extractFunctionSource(source, "encodeSparklinePayload"),
    extractFunctionSource(source, "normalizeGranularity"),
    extractFunctionSource(source, "normalizeSparklineBoundaryUnit"),
    extractFunctionSource(source, "getSparklineBoundaryGroupKey"),
    extractFunctionSource(source, "formatSparklineBoundaryLabel"),
    extractFunctionSource(source, "buildSparklineBoundaryMarkers"),
    extractFunctionSource(source, "getSparklineBoundaryUnitForGranularity"),
    extractFunctionSource(source, "buildSparklineSvg"),
    extractFunctionSource(source, "buildChartHoverTarget"),
    extractFunctionSource(source, "renderChartCard"),
    "module.exports = { state, buildSparklineSvg, renderChartCard, getSparklineBoundaryUnitForGranularity };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Intl,
    encodeURIComponent,
    JSON,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function getSampleColumns() {
  return [
    { key: "platform", label: "Platform", drillType: "platform" },
    { key: "mediaTokens", label: "Play Requests", type: "number" },
    { key: "authzConversion", label: "AuthZ Conv", type: "percent" },
  ];
}

function getSampleRows() {
  return [
    { platform: "Roku", mediaTokens: 12, authzConversion: 0.95 },
    { platform: "Apple TV", mediaTokens: 9, authzConversion: 0.99 },
    { platform: "Fire TV", mediaTokens: 18, authzConversion: 0.87 },
  ];
}

function normalizeRealmObject(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

test("numeric breakdown sorts default to descending and cycle back to the server order", () => {
  const helpers = loadEsmHealthSortHelpers();
  const columns = getSampleColumns();

  assert.deepEqual(normalizeRealmObject(helpers.getNextBreakdownSortRule(columns, null, "mediaTokens")), {
    columnKey: "mediaTokens",
    direction: "desc",
  });
  assert.deepEqual(
    normalizeRealmObject(helpers.getNextBreakdownSortRule(columns, { columnKey: "mediaTokens", direction: "desc" }, "mediaTokens")),
    {
      columnKey: "mediaTokens",
      direction: "asc",
    }
  );
  assert.equal(helpers.getNextBreakdownSortRule(columns, { columnKey: "mediaTokens", direction: "asc" }, "mediaTokens"), null);
});

test("label columns default to ascending text sort", () => {
  const helpers = loadEsmHealthSortHelpers();
  const columns = getSampleColumns();
  const rows = getSampleRows();

  assert.deepEqual(normalizeRealmObject(helpers.getNextBreakdownSortRule(columns, null, "platform")), {
    columnKey: "platform",
    direction: "asc",
  });
  assert.deepEqual(
    helpers.sortBreakdownRows(rows, columns, { columnKey: "platform", direction: "asc" }).map((row) => row.platform),
    ["Apple TV", "Fire TV", "Roku"]
  );
});

test("renderBreakdownTable emits sortable headers and renders rows in the active sort order", () => {
  const helpers = loadEsmHealthSortHelpers();
  const columns = getSampleColumns();
  const rows = getSampleRows();
  helpers.state.tableSorts["platform-hotspots"] = {
    columnKey: "mediaTokens",
    direction: "desc",
  };

  const html = helpers.renderBreakdownTable("platform-hotspots", "Platform Hotspots", "copy", rows, columns, "");
  const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);

  assert(bodyMatch, "Expected tbody markup");
  assert.match(html, /data-sort-table="platform-hotspots"/);
  assert.match(html, /data-sort-column="mediaTokens"/);
  assert.match(html, /<th scope="col" aria-sort="descending">[\s\S]*data-sort-column="mediaTokens"/);
  assert.equal(
    helpers.getBreakdownSortAriaValue(helpers.state.tableSorts["platform-hotspots"], columns[1]),
    "descending"
  );
  assert(bodyMatch[1].indexOf("Fire TV") < bodyMatch[1].indexOf("Roku"));
  assert(bodyMatch[1].indexOf("Roku") < bodyMatch[1].indexOf("Apple TV"));
});

test("workspace source wires delegated header sort clicks into the shared table host", () => {
  const source = fs.readFileSync(path.join(ROOT, "esm-health-workspace.js"), "utf8");

  assert.match(source, /closest\("\[data-sort-table\]\[data-sort-column\]"\)/);
  assert.match(source, /toggleBreakdownTableSort\(/);
});

test("sparkline charts expose hover-aware payloads without overlay tooltip markup", () => {
  const { buildSparklineSvg } = loadEsmSparklineHelpers();
  const html = buildSparklineSvg(
    [
      { bucketKey: "2026-03-29T23", label: "2026-03-29 23:00", playRequests: 1200, accounts: 800 },
      { bucketKey: "2026-03-30T00", label: "2026-03-30 00:00", playRequests: 1450, accounts: 910 },
    ],
    (entry) => Number(entry?.playRequests || 0),
    {
      title: "Play Requests",
      summary: "Daily or hourly media token volume across the selected health window.",
      formatter: (value) => `${Math.round(value)} req`,
      valueLabel: "Play Requests",
      boundaryUnit: "day",
      detailAccessor: (entry) => [`Accounts: ${Math.round(Number(entry?.accounts || 0))}`],
    }
  );

  assert.match(html, /data-sparkline-chart/);
  assert.match(html, /data-sparkline-payload=/);
  assert.doesNotMatch(html, /esm-health-chart-tooltip-title/);
  assert.doesNotMatch(html, /esm-health-chart-tooltip-details/);
  assert.match(html, /esm-health-sparkline-boundary-line/);
  assert.match(html, />03\/30</);
  assert.match(html, /esm-health-sparkline-hover-guide/);
  assert.match(html, /esm-health-sparkline-hover-dot/);
  assert.match(html, /tabindex="0"/);
  assert.match(
    html,
    /aria-label="Play Requests Daily or hourly media token volume across the selected health window\. Play Requests: 1450 req at 2026-03-30 00:00\."/
  );
});

test("chart cards place hover details in a docked panel below the sparkline", () => {
  const helpers = loadEsmSparklineHelpers();
  helpers.state.query.granularity = "hour";
  const { renderChartCard } = helpers;
  const html = renderChartCard(
    "Play Requests",
    3800,
    "Daily or hourly media token volume across the selected health window.",
    [
      { label: "2026-03-29 08:00", playRequests: 1200 },
      { label: "2026-03-29 09:00", playRequests: 1450 },
    ],
    (entry) => Number(entry?.playRequests || 0),
    (value) => `${Math.round(Number(value || 0))} req`
  );

  const chartTitleIndex = html.indexOf("esm-health-chart-title-row");
  const chartWrapIndex = html.indexOf("esm-health-chart-wrap");
  const dockedTooltipIndex = html.indexOf("esm-health-chart-tooltip--docked");

  assert.match(html, /esm-health-chart-title-row/);
  assert.match(html, /Selected bucket/);
  assert.match(html, /esm-health-chart-detail-wrap/);
  assert.notEqual(chartTitleIndex, -1);
  assert.notEqual(chartWrapIndex, -1);
  assert.notEqual(dockedTooltipIndex, -1);
  assert.ok(chartTitleIndex < chartWrapIndex);
  assert.ok(chartWrapIndex < dockedTooltipIndex);
});

test("chart cards derive boundary markers from the active granularity", () => {
  const helpers = loadEsmSparklineHelpers();
  helpers.state.query.granularity = "month";
  const { renderChartCard, getSparklineBoundaryUnitForGranularity } = helpers;
  const html = renderChartCard(
    "Play Requests",
    3800,
    "Daily or hourly media token volume across the selected health window.",
    [
      { bucketKey: "2025-12", label: "12/2025", playRequests: 1200 },
      { bucketKey: "2026-01", label: "01/2026", playRequests: 1450 },
    ],
    (entry) => Number(entry?.playRequests || 0),
    (value) => `${Math.round(Number(value || 0))} req`
  );

  assert.equal(getSparklineBoundaryUnitForGranularity("month"), "year");
  assert.match(html, /esm-health-sparkline-boundary-line/);
  assert.match(html, />2026</);
});
