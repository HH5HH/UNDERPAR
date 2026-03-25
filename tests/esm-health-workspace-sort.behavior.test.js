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
