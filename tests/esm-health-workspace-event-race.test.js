const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const FILE_PATH = path.join(ROOT, "esm-health-workspace.js");

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

function loadWorkspaceEventHarness(initialState = {}) {
  const source = fs.readFileSync(FILE_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "firstNonEmptyString"),
    extractFunctionSource(source, "getPayloadControllerSelectionKey"),
    extractFunctionSource(source, "doesWorkspaceEventMatchCurrentContext"),
    extractFunctionSource(source, "hasLiveControllerContext"),
    extractFunctionSource(source, "handleWorkspaceEvent"),
    "module.exports = { handleWorkspaceEvent, state, calls };",
  ].join("\n\n");

  const calls = {
    controller: [],
    reportStart: [],
    reportResult: [],
    cleared: 0,
    statuses: [],
    dashboardRuns: [],
  };
  const state = Object.assign(
    {
      workspaceContextKey: "",
      selectionKey: "",
      programmerId: "",
      environmentKey: "",
      premiumPanelRequestToken: 0,
      query: { initialized: false },
      report: null,
      loading: false,
      esmHealthReady: false,
    },
    initialState
  );

  const context = {
    module: { exports: {} },
    exports: {},
    state,
    calls,
    applyControllerState(payload) {
      calls.controller.push(payload);
    },
    handleReportStart(payload) {
      calls.reportStart.push(payload);
    },
    handleReportResult(payload) {
      calls.reportResult.push(payload);
    },
    clearWorkspaceCards() {
      calls.cleared += 1;
    },
    setStatus(message = "") {
      calls.statuses.push(String(message || ""));
    },
    runDashboard(message = "") {
      calls.dashboardRuns.push(String(message || ""));
    },
    Number,
    String,
    Boolean,
    Math,
  };
  vm.runInNewContext(script, context, { filename: FILE_PATH });
  return context.module.exports;
}

test("esm health accepts initial report events before controller context exists", () => {
  const { handleWorkspaceEvent, calls } = loadWorkspaceEventHarness();
  const payload = {
    workspaceContextKey: "ctx-1",
    controllerSelectionKey: "selection-1",
    programmerId: "Turner",
    environmentKey: "release-production",
    premiumPanelRequestToken: 42,
  };

  handleWorkspaceEvent("report-start", payload);
  handleWorkspaceEvent("report-result", payload);

  assert.equal(calls.reportStart.length, 1);
  assert.equal(calls.reportResult.length, 1);
});

test("esm health rejects stale report events once a live controller context exists", () => {
  const { handleWorkspaceEvent, calls } = loadWorkspaceEventHarness({
    workspaceContextKey: "ctx-live",
    selectionKey: "selection-live",
    programmerId: "Turner",
    environmentKey: "release-production",
    premiumPanelRequestToken: 99,
  });

  handleWorkspaceEvent("report-start", {
    workspaceContextKey: "ctx-stale",
    controllerSelectionKey: "selection-stale",
    programmerId: "Other",
    environmentKey: "preview-qa",
    premiumPanelRequestToken: 55,
  });

  assert.equal(calls.reportStart.length, 0);
  assert.equal(calls.reportResult.length, 0);
});
