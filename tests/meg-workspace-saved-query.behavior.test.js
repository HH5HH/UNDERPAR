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

function loadMegWorkspaceActionHandler(globals = {}) {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "handleMegWorkspaceWorkspaceAction"),
    "module.exports = { handleMegWorkspaceWorkspaceAction };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    state: {
      megWorkspaceWindowId: 0,
      megWorkspaceTabIdByWindowId: new Map(),
      premiumPanelRequestToken: 0,
    },
    Map,
    Number,
    String,
    Boolean,
    Promise,
    ...globals,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.handleMegWorkspaceWorkspaceAction;
}

test("MEG workspace saved-query actions bypass live ESM controller gating when saving a query", async () => {
  let persistedRecord = null;
  let mirrorEnsured = false;
  const handleMegWorkspaceWorkspaceAction = loadMegWorkspaceActionHandler({
    getActiveEsmWorkspaceState: () => null,
    megWorkspaceBindWorkspaceTab: () => {},
    megMarkWorkspaceReady: () => {},
    megWorkspaceBroadcastControllerState: () => {},
    resolveSelectedProgrammer: () => null,
    getCurrentPremiumAppsSnapshot: () => null,
    megWorkspaceBroadcastSelectedControllerState: () => {},
    megWorkspaceGetRememberedSelection: () => null,
    megWorkspaceSendWorkspaceMessage: () => {},
    ensureSavedEsmQueryVaultMirror: async () => {
      mirrorEnsured = true;
      return {};
    },
    popupPersistSavedEsmQueryRecord: async (name, url) => {
      persistedRecord = { name, url };
      return {
        storageKey: "underpar:saved-esm-query:Daily%20Auth",
        existed: false,
      };
    },
    popupGetSavedEsmQueryRecords: () => [
      {
        storageKey: "underpar:saved-esm-query:Daily%20Auth",
        name: "Daily Auth",
        url: "/esm/v3/media-company/year/day?requestor-id",
      },
    ],
    popupDeleteSavedEsmQueryRecord: async () => ({ storageKey: "" }),
    refreshAllEsmWorkspaceMegSavedQuerySelectors: () => {},
    isEsmServiceRequestActive: () => false,
    resolveClickEsmDownloadContext: () => {
      throw new Error("saved-query action should not resolve download context");
    },
  });

  const result = await handleMegWorkspaceWorkspaceAction(
    {
      action: "saved-query-put-record",
      payload: {
        name: "Daily Auth",
        url: "/esm/v3/media-company/year/day?requestor-id",
      },
    },
    null
  );

  assert.equal(mirrorEnsured, false);
  assert.deepEqual(persistedRecord, {
    name: "Daily Auth",
    url: "/esm/v3/media-company/year/day?requestor-id",
  });
  assert.equal(result.ok, true);
  assert.equal(result.storageKey, "underpar:saved-esm-query:Daily%20Auth");
  assert.equal(Array.isArray(result.records), true);
});

test("MEG workspace saved-query reads bypass live ESM controller gating during picker hydration", async () => {
  let mirrorEnsured = false;
  const handleMegWorkspaceWorkspaceAction = loadMegWorkspaceActionHandler({
    getActiveEsmWorkspaceState: () => null,
    megWorkspaceBindWorkspaceTab: () => {},
    megMarkWorkspaceReady: () => {},
    megWorkspaceBroadcastControllerState: () => {},
    resolveSelectedProgrammer: () => null,
    getCurrentPremiumAppsSnapshot: () => null,
    megWorkspaceBroadcastSelectedControllerState: () => {},
    megWorkspaceGetRememberedSelection: () => null,
    megWorkspaceSendWorkspaceMessage: () => {},
    ensureSavedEsmQueryVaultMirror: async () => {
      mirrorEnsured = true;
      return {};
    },
    popupPersistSavedEsmQueryRecord: async () => ({ storageKey: "", existed: false }),
    popupGetSavedEsmQueryRecords: () => [
      {
        storageKey: "underpar:saved-esm-query:Daily%20Auth",
        name: "Daily Auth",
        url: "/esm/v3/media-company/year/day?requestor-id",
      },
    ],
    popupDeleteSavedEsmQueryRecord: async () => ({ storageKey: "" }),
    refreshAllEsmWorkspaceMegSavedQuerySelectors: () => {},
    isEsmServiceRequestActive: () => false,
  });

  const result = await handleMegWorkspaceWorkspaceAction(
    {
      action: "saved-query-get-records",
      payload: {},
    },
    null
  );

  assert.equal(mirrorEnsured, true);
  assert.equal(result.ok, true);
  assert.equal(result.records?.[0]?.name, "Daily Auth");
});

test("MEG workspace saved-query actions bypass controller window mismatch guards", async () => {
  let deletedStorageKey = "";
  const handleMegWorkspaceWorkspaceAction = loadMegWorkspaceActionHandler({
    getActiveEsmWorkspaceState: () => ({
      controllerWindowId: 42,
    }),
    megWorkspaceBindWorkspaceTab: () => {},
    megMarkWorkspaceReady: () => {},
    megWorkspaceBroadcastControllerState: () => {},
    resolveSelectedProgrammer: () => null,
    getCurrentPremiumAppsSnapshot: () => null,
    megWorkspaceBroadcastSelectedControllerState: () => {},
    megWorkspaceGetRememberedSelection: () => null,
    megWorkspaceSendWorkspaceMessage: () => {},
    ensureSavedEsmQueryVaultMirror: async () => ({}),
    popupPersistSavedEsmQueryRecord: async () => ({ storageKey: "", existed: false }),
    popupGetSavedEsmQueryRecords: () => [],
    popupDeleteSavedEsmQueryRecord: async (storageKey) => {
      deletedStorageKey = storageKey;
      return { storageKey };
    },
    refreshAllEsmWorkspaceMegSavedQuerySelectors: () => {},
  });

  const result = await handleMegWorkspaceWorkspaceAction(
    {
      action: "saved-query-delete-record",
      payload: {
        storageKey: "underpar:saved-esm-query:Daily%20Auth",
      },
    },
    {
      tab: {
        windowId: 7,
        id: 88,
      },
    }
  );

  assert.equal(result.ok, true);
  assert.equal(deletedStorageKey, "underpar:saved-esm-query:Daily%20Auth");
});
