const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");
const WORKSPACE_JS_PATH = path.join(ROOT, "esm-workspace.js");

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

function loadEsmWorkspaceActionHandler(globals = {}) {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "handleEsmWorkspaceWorkspaceAction"),
    "module.exports = { handleEsmWorkspaceWorkspaceAction };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    state: {
      esmWorkspaceWorkspaceWindowId: 0,
      esmWorkspaceWorkspaceTabIdByWindowId: new Map(),
      premiumPanelRequestToken: 17,
    },
    Map,
    Number,
    String,
    Boolean,
    Promise,
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.handleEsmWorkspaceWorkspaceAction;
}

test("ESM workspace handoff opens ESM Health with a query context derived from the current card", async () => {
  let receivedQueryContext = null;
  const handleEsmWorkspaceWorkspaceAction = loadEsmWorkspaceActionHandler({
    getActiveEsmWorkspaceState: () => ({
      controllerWindowId: 0,
      section: {},
      programmer: {
        programmerId: "Turner",
        programmerName: "Turner",
      },
      requestorIds: ["MML"],
      mvpdIds: ["Comcast_SSO"],
    }),
    esmWorkspaceBindWorkspaceTab: () => {},
    resolveEsmStateForWorkspaceAction: async () => null,
    isEsmServiceRequestActive: () => true,
    getActiveEsmWorkspaceDebugFlowId: () => "",
    emitEsmWorkspaceDebugEvent: () => {},
    normalizeUnderparEsmRequestPath: (value) => String(value || "").trim(),
    buildEsmHealthDashboardQueryContextFromRequestPath: (requestPath, options = {}) => ({
      requestPath,
      programmerId: options.programmerId,
      compareMode: options.compareMode || "off",
      selectionKey: "selection-key",
    }),
    runEsmHealthDashboardForSelection: async (queryContext) => {
      receivedQueryContext = queryContext;
      return {
        ok: true,
        selectionKey: "selection-key",
        queryContext,
      };
    },
    firstNonEmptyString: (values = []) =>
      (Array.isArray(values) ? values : []).find((value) => String(value || "").trim()) || "",
  });

  const result = await handleEsmWorkspaceWorkspaceAction(
    {
      action: "send-to-esm-health",
      card: {
        requestUrl: "/esm/v3/media-company/year/month/day/hour/requestor-id/platform/application-name/api?requestor-id=MML",
        displayNodeLabel: "Daily Auth",
      },
    },
    null
  );

  assert.equal(result.ok, true);
  assert.deepEqual(receivedQueryContext, {
    requestPath: "/esm/v3/media-company/year/month/day/hour/requestor-id/platform/application-name/api?requestor-id=MML",
    programmerId: "Turner",
    compareMode: "off",
    selectionKey: "selection-key",
  });
});

test("ESM workspace renders a card-level send to ESM Health action", () => {
  const workspaceSource = fs.readFileSync(WORKSPACE_JS_PATH, "utf8");

  assert.match(workspaceSource, /class="esm-query-health-link"/);
  assert.match(workspaceSource, /sendWorkspaceAction\("send-to-esm-health"/);
  assert.match(workspaceSource, /Opened .* in ESM HEALTH Dashboard/);
});
