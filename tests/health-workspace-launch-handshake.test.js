const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

test("popup waits for ESM HEALTH and SPLUNK HEALTH workspaces to signal readiness", () => {
  const popupSource = read("popup.js");
  const esmRunSource = extractFunctionSource(popupSource, "runEsmHealthDashboardForSelection");
  const healthRunSource = extractFunctionSource(popupSource, "runHealthSplunkDashboardForSelection");
  const esmWorkspaceActionSource = extractFunctionSource(popupSource, "handleEsmHealthWorkspaceAction");
  const healthWorkspaceActionSource = extractFunctionSource(popupSource, "handleHealthWorkspaceAction");

  assert.match(popupSource, /esmHealthWorkspaceReadyByWindowId:\s*new Map\(\)/);
  assert.match(popupSource, /esmHealthWorkspaceReadyWaitersByWindowId:\s*new Map\(\)/);
  assert.match(popupSource, /healthWorkspaceReadyByWindowId:\s*new Map\(\)/);
  assert.match(popupSource, /healthWorkspaceReadyWaitersByWindowId:\s*new Map\(\)/);
  assert.match(popupSource, /async function esmHealthWorkspaceWaitForReady\(windowId, tabId = 0, timeoutMs = 6000\)/);
  assert.match(popupSource, /async function healthWorkspaceWaitForReady\(windowId, tabId = 0, timeoutMs = 6000\)/);
  assert.match(esmRunSource, /await esmHealthWorkspaceWaitForReady\(targetWindowId, Number\(workspaceTab\?\.id \|\| 0\), 6000\)\.catch\(\(\) => false\);/);
  assert.match(healthRunSource, /await healthWorkspaceWaitForReady\(targetWindowId, Number\(workspaceTab\?\.id \|\| 0\), 6000\)\.catch\(\(\) => false\);/);
  assert.match(esmWorkspaceActionSource, /esmHealthWorkspaceMarkReady\(senderWindowId \|\| Number\(state\.esmHealthWorkspaceWindowId \|\| 0\), senderTabId\);/);
  assert.match(healthWorkspaceActionSource, /healthWorkspaceMarkReady\(senderWindowId \|\| Number\(state\.healthWorkspaceWindowId \|\| 0\), senderTabId\);/);
});
