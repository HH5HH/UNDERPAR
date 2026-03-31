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

function loadSmartWindowHelpers() {
  const source = read("cm-health-workspace.js");
  const script = [
    `const CM_HEALTH_SMART_WINDOW_PRESETS = Object.freeze({
      "hr-24": Object.freeze({ key: "hr-24", label: "HR over HR", description: "Last 24 Hours", granularity: "hour" }),
      "day-7": Object.freeze({ key: "day-7", label: "DAY over DAY", description: "Last 7 Days", granularity: "day" }),
      "month-4": Object.freeze({ key: "month-4", label: "MO over MO", description: "Last 4 Months", granularity: "month" }),
      "year-ytd": Object.freeze({ key: "year-ytd", label: "YR over YR", description: "Year to Date", granularity: "month" }),
    });`,
    extractFunctionSource(source, "normalizeGranularity"),
    extractFunctionSource(source, "normalizeSmartWindowPreset"),
    extractFunctionSource(source, "getSmartWindowPresetDefinition"),
    extractFunctionSource(source, "normalizeIsoDateInput"),
    extractFunctionSource(source, "getPacificDateParts"),
    extractFunctionSource(source, "shiftIsoDateInputByDays"),
    extractFunctionSource(source, "shiftIsoDateInputByMonths"),
    extractFunctionSource(source, "buildSmartWindowDateRange"),
    "module.exports = { buildSmartWindowDateRange };",
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
  vm.runInNewContext(script, context, { filename: path.join(ROOT, "cm-health-workspace.js") });
  return context.module.exports;
}

test("cm health filter bar uses a smart window picker and hides advanced dates by default", () => {
  const html = read("cm-health-workspace.html");
  const js = read("cm-health-workspace.js");
  const css = read("cm-health-workspace.css");

  assert.match(html, /id="workspace-window-select"/);
  assert.match(html, /id="workspace-advanced-filters"/);
  assert.match(html, /id="workspace-apply-advanced-dates"/);
  assert.match(html, /id="workspace-start-date"/);
  assert.match(html, /id="workspace-end-date"/);
  assert.doesNotMatch(html, /workspace-granularity-select/);
  assert.doesNotMatch(html, /workspace-run-dashboard/);
  assert.match(html, /workspace-window-select[\s\S]*Advanced Dates[\s\S]*workspace-apply-advanced-dates/);

  assert.match(js, /windowPreset:\s*"hr-24"/);
  assert.match(js, /windowSelect:\s*document\.getElementById\("workspace-window-select"\)/);
  assert.match(js, /applyAdvancedButton:\s*document\.getElementById\("workspace-apply-advanced-dates"\)/);
  assert.match(js, /function applySmartWindowPresetToQuery\(/);
  assert.match(js, /function hasActiveWorkspaceFilters\(/);
  assert.match(js, /function getSelectedWindowSummary\(/);
  assert.match(js, /els\.windowSelect\.addEventListener\("change"/);
  assert.doesNotMatch(js, /granularitySelect:\s*document\.getElementById/);
  assert.doesNotMatch(js, /runButton:\s*document\.getElementById/);

  assert.match(css, /@import url\("esm-health-workspace\.css"\);/);
});

test("cm smart window presets resolve the expected default ranges and backend granularity", () => {
  const { buildSmartWindowDateRange } = loadSmartWindowHelpers();
  const nowMs = Date.UTC(2026, 2, 30, 20, 0, 0);

  assert.deepEqual(JSON.parse(JSON.stringify(buildSmartWindowDateRange("hr-24", nowMs))), {
    start: "2026-03-29",
    end: "2026-03-30",
    granularity: "hour",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(buildSmartWindowDateRange("day-7", nowMs))), {
    start: "2026-03-24",
    end: "2026-03-30",
    granularity: "day",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(buildSmartWindowDateRange("month-4", nowMs))), {
    start: "2025-12-01",
    end: "2026-03-30",
    granularity: "month",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(buildSmartWindowDateRange("year-ytd", nowMs))), {
    start: "2026-01-01",
    end: "2026-03-30",
    granularity: "month",
  });
});
