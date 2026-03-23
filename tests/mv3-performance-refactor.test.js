const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function normalizeVmValue(value) {
  return JSON.parse(JSON.stringify(value));
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

function loadBackgroundWebRequestHelpers() {
  const filePath = path.join(ROOT, "background.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const WEB_REQUEST_FILTER = { urls: ["<all_urls>"] };',
    "const debugState = { flowsById: new Map(), flowIdByTabId: new Map(), panelStateByPort: new Map(), webRequestListenersBound: false };",
    "const visibleTabIds = new Set();",
    "function createEvent() { const listeners = new Set(); return { addListener(listener) { listeners.add(listener); }, removeListener(listener) { listeners.delete(listener); }, hasListener(listener) { return listeners.has(listener); }, count() { return listeners.size; } }; }",
    "const chrome = { webRequest: { onBeforeRequest: createEvent(), onBeforeSendHeaders: createEvent(), onHeadersReceived: createEvent(), onBeforeRedirect: createEvent(), onCompleted: createEvent(), onErrorOccurred: createEvent() } };",
    "function handleWebRequestBeforeRequest() {}",
    "function handleWebRequestBeforeSendHeaders() {}",
    "function handleWebRequestHeadersReceived() {}",
    "function handleWebRequestBeforeRedirect() {}",
    "function handleWebRequestCompleted() {}",
    "function handleWebRequestError() {}",
    "function shouldIgnoreUrlForFlow() { return false; }",
    extractFunctionSource(source, "normalizeTabId"),
    extractFunctionSource(source, "getFlowById"),
    extractFunctionSource(source, "getFlowByTabId"),
    "function isUpPanelVisibleForTab(tabId) { return visibleTabIds.has(normalizeTabId(tabId)); }",
    extractFunctionSource(source, "flowHasNetworkCaptureEnabled"),
    extractFunctionSource(source, "shouldAllowNetworkCaptureForFlow"),
    extractFunctionSource(source, "hasActiveWebRequestCaptureFlow"),
    extractFunctionSource(source, "addWebRequestListenerIfNeeded"),
    extractFunctionSource(source, "removeWebRequestListenerIfPresent"),
    extractFunctionSource(source, "bindWebRequestListeners"),
    extractFunctionSource(source, "unbindWebRequestListeners"),
    extractFunctionSource(source, "syncWebRequestListenerState"),
    extractFunctionSource(source, "getFlowForWebRequest"),
    "function seedFlow(tabId, flowId, context = {}) { const normalizedTabId = normalizeTabId(tabId); const flow = { flowId: String(flowId || normalizedTabId), tabId: normalizedTabId, context: context && typeof context === 'object' ? { ...context } : {} }; debugState.flowsById.set(flow.flowId, flow); debugState.flowIdByTabId.set(normalizedTabId, flow.flowId); return flow; }",
    "function clearFlows() { debugState.flowsById.clear(); debugState.flowIdByTabId.clear(); }",
    "function setPanelVisible(tabId, visible = true) { const normalizedTabId = normalizeTabId(tabId); if (!normalizedTabId) { return; } if (visible) { visibleTabIds.add(normalizedTabId); return; } visibleTabIds.delete(normalizedTabId); }",
    "function getListenerCounts() { return { beforeRequest: chrome.webRequest.onBeforeRequest.count(), beforeSendHeaders: chrome.webRequest.onBeforeSendHeaders.count(), headersReceived: chrome.webRequest.onHeadersReceived.count(), beforeRedirect: chrome.webRequest.onBeforeRedirect.count(), completed: chrome.webRequest.onCompleted.count(), error: chrome.webRequest.onErrorOccurred.count() }; }",
    "module.exports = { clearFlows, setPanelVisible, seedFlow, syncWebRequestListenerState, getFlowForWebRequest, getListenerCounts };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Map,
    Set,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("background source no longer binds global webRequest listeners at service-worker start", () => {
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");

  assert.doesNotMatch(backgroundSource, /if \(chrome\.webRequest\) \{\s*chrome\.webRequest\.onBeforeRequest\.addListener/);
  assert.match(backgroundSource, /void restoreDebugStateFromStorage\(\)\.then\(\(\) => \{\s*syncWebRequestListenerState\(\);/);
});

test("webRequest listeners bind only while a flow is actively allowed to capture network traffic", () => {
  const helpers = loadBackgroundWebRequestHelpers();

  helpers.clearFlows();
  helpers.syncWebRequestListenerState();
  assert.deepEqual(normalizeVmValue(helpers.getListenerCounts()), {
    beforeRequest: 0,
    beforeSendHeaders: 0,
    headersReceived: 0,
    beforeRedirect: 0,
    completed: 0,
    error: 0,
  });

  helpers.seedFlow(17, "flow-17", {
    captureNetwork: true,
    keepNetworkWhenHidden: false,
  });
  helpers.syncWebRequestListenerState();
  assert.deepEqual(normalizeVmValue(helpers.getListenerCounts()), {
    beforeRequest: 0,
    beforeSendHeaders: 0,
    headersReceived: 0,
    beforeRedirect: 0,
    completed: 0,
    error: 0,
  });

  helpers.setPanelVisible(17, true);
  helpers.syncWebRequestListenerState();
  assert.deepEqual(normalizeVmValue(helpers.getListenerCounts()), {
    beforeRequest: 1,
    beforeSendHeaders: 1,
    headersReceived: 1,
    beforeRedirect: 1,
    completed: 1,
    error: 1,
  });

  helpers.setPanelVisible(17, false);
  helpers.syncWebRequestListenerState();
  assert.deepEqual(normalizeVmValue(helpers.getListenerCounts()), {
    beforeRequest: 0,
    beforeSendHeaders: 0,
    headersReceived: 0,
    beforeRedirect: 0,
    completed: 0,
    error: 0,
  });
});

test("events-only flows do not resolve through the webRequest capture path", () => {
  const helpers = loadBackgroundWebRequestHelpers();

  helpers.clearFlows();
  helpers.setPanelVisible(21, true);
  helpers.seedFlow(21, "flow-21", {
    captureNetwork: false,
    keepNetworkWhenHidden: false,
  });
  helpers.syncWebRequestListenerState();

  assert.deepEqual(normalizeVmValue(helpers.getListenerCounts()), {
    beforeRequest: 0,
    beforeSendHeaders: 0,
    headersReceived: 0,
    beforeRedirect: 0,
    completed: 0,
    error: 0,
  });
  assert.equal(helpers.getFlowForWebRequest({ tabId: 21, url: "https://example.com/path" }), null);
});
