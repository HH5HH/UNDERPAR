const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");

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

function loadCompareHelpers() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "normalizeEsmHealthCompareMode"),
    extractFunctionSource(source, "normalizeEsmHealthIsoDate"),
    extractFunctionSource(source, "getEsmHealthPacificDateParts"),
    extractFunctionSource(source, "getEsmHealthDefaultDateRange"),
    extractFunctionSource(source, "shiftEsmHealthIsoDate"),
    extractFunctionSource(source, "shiftEsmHealthIsoDateByMonths"),
    extractFunctionSource(source, "shiftEsmHealthIsoDateByYears"),
    extractFunctionSource(source, "resolveEsmHealthDateRange"),
    extractFunctionSource(source, "getEsmHealthComparisonRange"),
    "module.exports = { getEsmHealthComparisonRange };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Date,
    Intl,
    Math,
    Number,
    String,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports;
}

test("ESM health comparison range resolves previous month and previous year windows", () => {
  const { getEsmHealthComparisonRange } = loadCompareHelpers();

  const monthOverMonth = getEsmHealthComparisonRange({
    start: "2026-03-01",
    end: "2026-03-26",
    compareMode: "mom",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(monthOverMonth)), {
    enabled: true,
    mode: "mom",
    start: "2026-02-01",
    end: "2026-02-26",
    label: "Previous Month Window",
    badgeLabel: "MoM",
  });

  const yearOverYear = getEsmHealthComparisonRange({
    start: "2026-03-01",
    end: "2026-03-26",
    compareMode: "yoy",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(yearOverYear)), {
    enabled: true,
    mode: "yoy",
    start: "2025-03-01",
    end: "2025-03-26",
    label: "Previous Year Window",
    badgeLabel: "YoY",
  });
});

test("popup supports building ESM health query context from a saved ESM request path", () => {
  const source = fs.readFileSync(POPUP_PATH, "utf8");

  assert.match(source, /function buildEsmHealthDashboardQueryContextFromRequestPath\(rawRequestPath = "", options = \{\}\)/);
  assert.match(source, /inferEsmHealthGranularityFromRequestPath\(normalizedRequestPath\)/);
  assert.match(source, /compareMode:\s*normalizeEsmHealthCompareMode\(options\?\.compareMode\)/);
  assert.match(source, /sourceRequestPath:\s*normalizedRequestPath/);
  assert.match(source, /sourceRequestLabel:\s*firstNonEmptyString\(\[options\?\.sourceRequestLabel,\s*options\?\.displayNodeLabel\]\)/);
  assert.match(source, /comparison\.mode,\s*comparison\.start \|\| "\*",\s*comparison\.end \|\| "\*"/);
});
