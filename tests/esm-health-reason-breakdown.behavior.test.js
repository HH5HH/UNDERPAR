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

test("ESM health aggregates failure reasons into sortable hotspot rows with correlation context", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const script = [
    'const ESM_HEALTH_TOP_ROW_LIMIT = 10;',
    extractFunctionSource(popupSource, "buildEsmHealthReasonFacetSummary"),
    extractFunctionSource(popupSource, "aggregateEsmHealthReasonRows"),
    extractFunctionSource(popupSource, "addEsmHealthIssueShare"),
    "module.exports = { aggregateEsmHealthReasonRows, addEsmHealthIssueShare };",
  ].join("\n\n");

  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    Number,
    String,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, "popup.js") });
  const { aggregateEsmHealthReasonRows, addEsmHealthIssueShare } = context.module.exports;

  const sourceRows = [
    { reason: "Unknown resource", event: "authz-failed", mvpd: "Comcast", "requestor-id": "NBADE", proxy: "adobe", count: 4 },
    { reason: "Unknown resource", event: "authz-failed", mvpd: "Comcast", "requestor-id": "NBADE", proxy: "adobe", count: 2 },
    { reason: "Unknown resource", event: "authz-rejected", mvpd: "Dish", "requestor-id": "NBADE", proxy: "adobe", count: 3 },
    { reason: "Authn expired", event: "authn-failed", mvpd: "Comcast", "requestor-id": "NBADE", proxy: "adobe", count: 2 },
    { reason: "", event: "authz-failed", mvpd: "DirecTV", "requestor-id": "MML", proxy: "proxy", count: 1 },
  ];

  const totalIssueEvents = sourceRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const aggregatedRows = addEsmHealthIssueShare(aggregateEsmHealthReasonRows(sourceRows, 10), totalIssueEvents);

  assert.equal(aggregatedRows.length, 3);
  assert.equal(aggregatedRows[0].reason, "Unknown resource");
  assert.equal(aggregatedRows[0].issueEvents, 9);
  assert.equal(aggregatedRows[0].eventSummary, "authz-failed (+1 more)");
  assert.equal(aggregatedRows[0].mvpdSummary, "Comcast (+1 more)");
  assert.equal(aggregatedRows[0].requestorSummary, "NBADE");
  assert.equal(aggregatedRows[0].issueShare, 9 / 12);
  assert.equal(aggregatedRows[1].reason, "Authn expired");
  assert.equal(aggregatedRows[2].reason, "(unknown)");
});
