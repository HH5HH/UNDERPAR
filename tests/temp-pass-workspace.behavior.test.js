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

function loadTempPassHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "let capturedAuthRequest = null;",
    "function parseJsonText(text, fallback = null) { if (typeof text !== 'string' || !text.trim()) { return fallback; } try { return JSON.parse(text); } catch { return fallback; } }",
    "function decodeBase64TextSafe(value = '') { const compact = String(value || '').replace(/\\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'); if (!compact) { return ''; } try { const remainder = compact.length % 4; const padded = remainder === 0 ? compact : `${compact}${'='.repeat(4 - remainder)}`; return Buffer.from(padded, 'base64').toString('utf8'); } catch { return ''; } }",
    "function base64EncodeUtf8(value = '') { return Buffer.from(String(value || ''), 'utf8').toString('base64'); }",
    "function truncateDebugText(value = '', limit = 320) { const text = String(value || ''); return text.length > limit ? text.slice(0, limit) : text; }",
    "function buildRestV2Headers(requestorId = '', headers = {}) { return { 'X-Requestor-Id': String(requestorId || '').trim(), 'AP-Device-Identifier': 'device-1', ...(headers && typeof headers === 'object' ? headers : {}) }; }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    "function formatTimestampLabel(value = 0) { return String(value || 0); }",
    "function buildTempPassDebugMeta() { return {}; }",
    "function buildTempPassResultId(actionKey = '') { return String(actionKey || 'temp-pass'); }",
    "function getActiveAdobePassEnvironment() { return { mgmtBase: 'https://mgmt.auth.adobe.com' }; }",
    "const ADOBE_MGMT_BASE = 'https://mgmt.auth.adobe.com';",
    "const PREMIUM_SERVICE_RESET_TEMPPASS_SCOPE = 'temporary:passes:owner';",
    "function resolveTempPassResetAppInfo() { return { guid: 'reset-guid', appName: 'Reset TempPASS' }; }",
    "async function fetchWithPremiumAuth(programmerId, appInfo, url, requestInit = {}, refreshMode = '', debugMeta = null) { capturedAuthRequest = { programmerId, appInfo, url, requestInit, refreshMode, debugMeta }; return { ok: true, status: 204, statusText: 'No Content', async text() { return ''; } }; }",
    extractFunctionSource(source, "resolveTempPassIdentityPayload"),
    extractFunctionSource(source, "buildTempPassRequestHeaders"),
    extractFunctionSource(source, "resetTempPassForSelection"),
    "function getCapturedAuthRequest() { return capturedAuthRequest; }",
    "module.exports = { resolveTempPassIdentityPayload, buildTempPassRequestHeaders, resetTempPassForSelection, getCapturedAuthRequest };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Buffer,
    URL,
    Math,
    Date,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("TempPASS identity payloads accept raw JSON or base64 JSON and emit a base64 header value", () => {
  const helpers = loadTempPassHelpers();

  const rawIdentity = helpers.resolveTempPassIdentityPayload('{"email":"user@example.com"}');
  assert.equal(rawIdentity.rawJson, '{"email":"user@example.com"}');
  assert.equal(rawIdentity.headerValue, Buffer.from(rawIdentity.rawJson, "utf8").toString("base64"));
  assert.match(rawIdentity.preview, /user@example\.com/);

  const encodedInput = Buffer.from('{"hash":"abc123"}', "utf8").toString("base64");
  const encodedIdentity = helpers.resolveTempPassIdentityPayload(encodedInput);
  assert.equal(encodedIdentity.rawJson, '{"hash":"abc123"}');
  assert.equal(encodedIdentity.headerValue, Buffer.from('{"hash":"abc123"}', "utf8").toString("base64"));

  const headers = helpers.buildTempPassRequestHeaders("REF30", {
    identityHeaderValue: encodedIdentity.headerValue,
    extraHeaders: {
      Authorization: "Bearer token",
    },
  });
  assert.equal(headers["X-Requestor-Id"], "REF30");
  assert.equal(headers.Authorization, "Bearer token");
  assert.equal(headers["AP-TempPass-Identity"], encodedIdentity.headerValue);

  assert.throws(
    () => helpers.resolveTempPassIdentityPayload("not-json"),
    /TempPASS identity must be a JSON object or base64-encoded JSON object\./
  );
});

test("TempPASS reset requests use Adobe PASS reset endpoints and explicit reset-all semantics", async () => {
  const helpers = loadTempPassHelpers();

  await helpers.resetTempPassForSelection({
    programmerId: "fox",
    programmerName: "FOX",
    requestorId: "REF30",
    tempPassMvpd: "TempPass",
    actionKey: "reset-device",
    deviceId: "device-123",
  });
  let captured = helpers.getCapturedAuthRequest();
  let url = new URL(captured.url);
  assert.equal(url.pathname, "/reset-tempass/v3/reset");
  assert.equal(url.searchParams.get("requestor_id"), "REF30");
  assert.equal(url.searchParams.get("mvpd_id"), "TempPass");
  assert.equal(url.searchParams.get("device_id"), "device-123");

  await helpers.resetTempPassForSelection({
    programmerId: "fox",
    programmerName: "FOX",
    requestorId: "REF30",
    tempPassMvpd: "TempPass",
    actionKey: "reset-device",
    resetAllDevices: true,
  });
  captured = helpers.getCapturedAuthRequest();
  url = new URL(captured.url);
  assert.equal(url.searchParams.get("device_id"), "all");

  await helpers.resetTempPassForSelection({
    programmerId: "fox",
    programmerName: "FOX",
    requestorId: "REF30",
    tempPassMvpd: "TempPass",
    actionKey: "reset-generic",
    genericKey: "hash-123",
  });
  captured = helpers.getCapturedAuthRequest();
  url = new URL(captured.url);
  assert.equal(url.pathname, "/reset-tempass/v3/reset/generic");
  assert.equal(url.searchParams.get("key"), "hash-123");

  await helpers.resetTempPassForSelection({
    programmerId: "fox",
    programmerName: "FOX",
    requestorId: "REF30",
    tempPassMvpd: "TempPass",
    actionKey: "reset-generic",
    resetAllGeneric: true,
  });
  captured = helpers.getCapturedAuthRequest();
  url = new URL(captured.url);
  assert.equal(url.pathname, "/reset-tempass/v3/reset/generic");
  assert.equal(url.searchParams.has("key"), false);

  await assert.rejects(
    () =>
      helpers.resetTempPassForSelection({
        programmerId: "fox",
        requestorId: "REF30",
        tempPassMvpd: "TempPass",
        actionKey: "reset-device",
      }),
    /Enter a device identifier or explicitly enable reset-all-devices\./
  );

  await assert.rejects(
    () =>
      helpers.resetTempPassForSelection({
        programmerId: "fox",
        requestorId: "REF30",
        tempPassMvpd: "TempPass",
        actionKey: "reset-generic",
      }),
    /Enter a generic key hash or explicitly enable reset-all-generic\./
  );
});

test("TempPASS workspace assets are registered and the controller supports partial REST-only availability", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  const manifestSource = fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8");
  const workspaceHtml = fs.readFileSync(path.join(ROOT, "temp-pass-workspace.html"), "utf8");
  const workspaceSource = fs.readFileSync(path.join(ROOT, "temp-pass-workspace.js"), "utf8");

  assert.match(backgroundSource, /const UNDERPAR_TEMP_PASS_WORKSPACE_PATH = "temp-pass-workspace\.html";/);
  assert.match(backgroundSource, /"temp-pass-workspace\.html"/);
  assert.match(backgroundSource, /"temp-pass-workspace\.css"/);
  assert.match(backgroundSource, /"temp-pass-workspace\.js"/);
  assert.match(manifestSource, /"temp-pass-workspace\.html"/);
  assert.match(manifestSource, /"temp-pass-workspace\.css"/);
  assert.match(manifestSource, /"temp-pass-workspace\.js"/);
  assert.match(
    popupSource,
    /const canOpenWorkspace = Boolean\(requestorId && \(hasRestApp \|\| hasResetApp\)\);/
  );
  assert.match(
    popupSource,
    /Workspace opens with PROFILE and AUTHORIZE ready\. Reset actions stay disabled until a Reset TempPASS app is available\./
  );
  assert.match(popupSource, /No TempPASS DCR applications were found for this media company\./);
  assert.match(workspaceHtml, /id="workspace-run-profiles"/);
  assert.match(workspaceHtml, /id="workspace-run-authorize"/);
  assert.match(workspaceHtml, /id="workspace-run-reset-device"/);
  assert.match(workspaceHtml, /id="workspace-run-reset-generic"/);
  assert.match(workspaceSource, /sendWorkspaceAction\("workspace-ready"\)/);
  assert.match(workspaceSource, /sendWorkspaceAction\("run-request"/);
  assert.match(workspaceSource, /sendWorkspaceAction\("clear-all"/);
});
