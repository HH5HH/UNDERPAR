const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const logic = require("../blondie-time-logic.js");

const ROOT = path.resolve(__dirname, "..");
const WORKSPACE_JS_PATH = path.join(ROOT, "blondie-time-workspace.js");

function extractFunctionSource(source, functionName) {
  const marker = "function " + functionName + "(";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "Unable to locate " + functionName + " in blondie-time-workspace.js");
  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, "Unable to locate body for " + functionName);
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
  throw new Error("Unterminated function: " + functionName);
}

function loadWorkspaceOffenderHelpers() {
  const source = fs.readFileSync(WORKSPACE_JS_PATH, "utf8");
  const script = [
    "const BLONDIE_TIME_LOGIC = globalThis.__seed.logic;",
    'const CLIENT_TIMEZONE = "America/Denver";',
    "const ESM_SOURCE_UTC_OFFSET_MINUTES = -8 * 60;",
    extractFunctionSource(source, "escapeHtml"),
    extractFunctionSource(source, "esmPartsToUtcMs"),
    extractFunctionSource(source, "buildEsmDateLabel"),
    extractFunctionSource(source, "formatPercent"),
    extractFunctionSource(source, "formatLatency"),
    extractFunctionSource(source, "formatInteger"),
    extractFunctionSource(source, "getThresholdHitMarkup"),
    extractFunctionSource(source, "buildOffendingRowsContextColumns"),
    extractFunctionSource(source, "buildOffendingRowTableCellMarkup"),
    extractFunctionSource(source, "buildOffendingRowsTableMarkup"),
    "module.exports = { buildOffendingRowsContextColumns, buildOffendingRowsTableMarkup };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    __seed: { logic },
  };
  vm.runInNewContext(script, context, { filename: WORKSPACE_JS_PATH });
  return context.module.exports;
}

test("BT workspace offender table prioritizes triage columns and renders the exact offending rows", () => {
  const helpers = loadWorkspaceOffenderHelpers();
  const displayColumns = [
    "authn-attempts",
    "authn-successful",
    "authz-attempts",
    "authz-successful",
    "authz-latency",
    "mvpd",
    "requestor-id",
    "proxy",
    "resource-id",
    "site-name",
  ];
  const contextColumns = helpers.buildOffendingRowsContextColumns({ displayColumns });
  const offendingRow = {
    year: "2026",
    month: "03",
    day: "19",
    hour: "14",
    minute: "21",
    mvpd: "Verizon",
    "requestor-id": "MML",
    proxy: "Direct",
    "resource-id": "turner-live",
    "site-name": "Turner Prod",
    "authn-attempts": "100",
    "authn-successful": "35",
    "authz-attempts": "140",
    "authz-successful": "110",
    "authz-latency": "1800000",
  };
  offendingRow.__btMetrics = logic.computeRowMetrics(offendingRow);
  offendingRow.__btThresholdHits = [
    {
      key: "authn",
      label: "AuthN",
      displayValue: logic.formatPercent(offendingRow.__btMetrics.authnSuccessPercent),
    },
    {
      key: "latency",
      label: "Latency",
      displayValue: logic.formatLatency(offendingRow.__btMetrics.avgLatencyMs),
    },
  ];

  const markup = helpers.buildOffendingRowsTableMarkup({
    displayColumns,
    offendingRows: [offendingRow],
  });

  assert.deepEqual(Array.from(contextColumns), ["mvpd", "requestor-id", "proxy", "resource-id"]);
  assert.match(markup, /Threshold Hits/);
  assert.match(markup, /Verizon/);
  assert.match(markup, /MML/);
  assert.match(markup, /Direct/);
  assert.match(markup, /turner-live/);
  assert.match(markup, /35\.00%/);
  assert.match(markup, /12857\.14 ms/);
});

test("BT workspace offender table shows a clean empty state when no rows are violating thresholds", () => {
  const helpers = loadWorkspaceOffenderHelpers();
  const markup = helpers.buildOffendingRowsTableMarkup({
    displayColumns: ["mvpd", "requestor-id"],
    offendingRows: [],
  });

  assert.match(markup, /No offending rows are active in this interval/);
});
