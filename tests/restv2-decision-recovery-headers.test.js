const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function extractFunctionSource(sourceText, functionName) {
  const marker = `function ${functionName}(`;
  const start = sourceText.indexOf(marker);
  if (start === -1) {
    throw new Error(`Function ${functionName} not found`);
  }

  let signatureDepth = 0;
  let bodyStart = -1;
  for (let index = start; index < sourceText.length; index += 1) {
    const ch = sourceText[index];
    if (ch === "(") {
      signatureDepth += 1;
      continue;
    }
    if (ch === ")") {
      signatureDepth = Math.max(0, signatureDepth - 1);
      continue;
    }
    if (ch === "{" && signatureDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  if (bodyStart === -1) {
    throw new Error(`Function ${functionName} has no body`);
  }

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const ch = sourceText[index];
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return sourceText.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Function ${functionName} did not terminate`);
}

test("REST V2 decision recovery retry can suppress optional auth headers while keeping required headers", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const helperSource = extractFunctionSource(popupSource, "buildRestV2DecisionRequestHeaders");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    buildRestV2Headers: (_serviceProviderId, extraHeaders = {}) => ({
      "AP-Device-Identifier": "device-from-builder",
      "X-Device-Info": "info-from-builder",
      ...extraHeaders,
    }),
    isRestV2LikelyPartnerSsoContext: (context) => context?.__sso === true,
    normalizeRestV2PartnerFrameworkStatusForRequest: (value) => String(value || "").trim(),
    resolveRestV2ExactPartnerFrameworkStatusForContext: (context) => String(context?.partnerFrameworkStatus || "").trim(),
    resolveRestV2InteractiveDocsHeaderValueFromContext: (context, headerName) =>
      context?.headers && typeof context.headers === "object" ? String(context.headers[headerName] || "").trim() : "",
  };

  vm.runInNewContext(`${helperSource}\nmodule.exports = { buildRestV2DecisionRequestHeaders };`, sandbox);
  const { buildRestV2DecisionRequestHeaders } = sandbox.module.exports;

  const decisionRequest = buildRestV2DecisionRequestHeaders(
    "MLB_NETWORK",
    {
      __sso: true,
      partnerFrameworkStatus: "partner-status-json",
      headers: {
        "AP-Session-Identifier": "session-123",
        "AP-Device-Identifier": "device-123",
        "X-Device-Info": "device-info-123",
        "Adobe-Subject-Token": "subject-token-123",
        "AD-Service-Token": "service-token-123",
        "AP-Temppass-Identity": "temp-pass-123",
        "AP-Visitor-Identifier": "visitor-123",
        "X-Roku-Reserved-Roku-Connect-Token": "roku-123",
      },
    },
    {
      suppressOptionalAuthHeaders: true,
    }
  );

  assert.equal(decisionRequest.suppressOptionalAuthHeaders, true);
  assert.equal(decisionRequest.requestHeaders.Accept, "application/json");
  assert.equal(decisionRequest.requestHeaders["Content-Type"], "application/json");
  assert.equal(decisionRequest.requestHeaders["AP-Session-Identifier"], "session-123");
  assert.equal(decisionRequest.requestHeaders["AP-Device-Identifier"], "device-123");
  assert.equal(decisionRequest.requestHeaders["X-Device-Info"], "device-info-123");
  assert.equal(decisionRequest.requestHeaders["AP-Partner-Framework-Status"], "partner-status-json");
  assert.equal(Object.prototype.hasOwnProperty.call(decisionRequest.requestHeaders, "Adobe-Subject-Token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decisionRequest.requestHeaders, "AD-Service-Token"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decisionRequest.requestHeaders, "AP-Temppass-Identity"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(decisionRequest.requestHeaders, "AP-Visitor-Identifier"), false);
  assert.equal(
    Object.prototype.hasOwnProperty.call(decisionRequest.requestHeaders, "X-Roku-Reserved-Roku-Connect-Token"),
    false
  );
});

test("REST V2 session identifier header aliases resolve to the sessionId context property", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const aliasesSource = extractFunctionSource(popupSource, "getRestV2InteractiveDocsHeaderAliasCandidates");
  const propertySource = extractFunctionSource(popupSource, "getRestV2InteractiveDocsContextPropertyForHeader");
  const sandbox = {
    module: { exports: {} },
    exports: {},
  };

  vm.runInNewContext(
    `${aliasesSource}\n${propertySource}\nmodule.exports = { getRestV2InteractiveDocsHeaderAliasCandidates, getRestV2InteractiveDocsContextPropertyForHeader };`,
    sandbox
  );
  const {
    getRestV2InteractiveDocsHeaderAliasCandidates,
    getRestV2InteractiveDocsContextPropertyForHeader,
  } = sandbox.module.exports;

  const aliases = getRestV2InteractiveDocsHeaderAliasCandidates("AP-Session-Identifier");
  assert(aliases.includes("AP-Session-Identifier"));
  assert(aliases.includes("sessionId"));
  assert(aliases.includes("session_identifier"));
  assert.equal(getRestV2InteractiveDocsContextPropertyForHeader("AP-Session-Identifier"), "sessionId");
});

test("REST V2 decision recovery retry preserves recovered profile identity and forces sanitized retry", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const decisionSource = extractFunctionSource(popupSource, "fetchRestV2DecisionCheck");
  const helperSource = extractFunctionSource(popupSource, "buildRestV2DecisionRequestHeaders");
  const contextSource = extractFunctionSource(popupSource, "buildRestV2ContextFromHarvest");

  assert.match(decisionSource, /suppressOptionalAuthHeaders:\s*false/);
  assert.match(decisionSource, /sessionId:\s*firstNonEmptyString\(\[recoveredProfile\?\.sessionId,\s*harvest\?\.sessionId\]\)/);
  assert.match(decisionSource, /profileKey:\s*firstNonEmptyString\(\[recoveredProfile\?\.profileKey,\s*harvest\?\.profileKey\]\)/);
  assert.match(helperSource, /const sessionIdentifier = resolveRestV2InteractiveDocsHeaderValueFromContext\([\s\S]*?"AP-Session-Identifier"/);
  assert.match(decisionSource, /Retrying decision check against recovered session context with the original REST V2 headers plus the recovered session identifier\./);
  assert.match(contextSource, /sessionId:\s*String\(firstNonEmptyString\(\[harvest\.sessionId\]\) \|\| ""\)\.trim\(\)/);
});

test("REST V2 decision requests keep optional auth headers when suppression is disabled", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const helperSource = extractFunctionSource(popupSource, "buildRestV2DecisionRequestHeaders");
  const sandbox = {
    module: { exports: {} },
    exports: {},
    buildRestV2Headers: (_serviceProviderId, extraHeaders = {}) => ({
      "AP-Device-Identifier": "device-from-builder",
      "X-Device-Info": "info-from-builder",
      ...extraHeaders,
    }),
    isRestV2LikelyPartnerSsoContext: () => false,
    normalizeRestV2PartnerFrameworkStatusForRequest: (value) => String(value || "").trim(),
    resolveRestV2ExactPartnerFrameworkStatusForContext: (context) => String(context?.partnerFrameworkStatus || "").trim(),
    resolveRestV2InteractiveDocsHeaderValueFromContext: (context, headerName) =>
      context?.headers && typeof context.headers === "object" ? String(context.headers[headerName] || "").trim() : "",
  };

  vm.runInNewContext(`${helperSource}\nmodule.exports = { buildRestV2DecisionRequestHeaders };`, sandbox);
  const { buildRestV2DecisionRequestHeaders } = sandbox.module.exports;

  const decisionRequest = buildRestV2DecisionRequestHeaders("MLB_NETWORK", {
    headers: {
      "AP-Session-Identifier": "session-123",
      "AP-Device-Identifier": "device-123",
      "X-Device-Info": "device-info-123",
      "Adobe-Subject-Token": "subject-token-123",
      "AD-Service-Token": "service-token-123",
      "AP-Temppass-Identity": "temp-pass-123",
      "AP-Visitor-Identifier": "visitor-123",
    },
  });

  assert.equal(decisionRequest.suppressOptionalAuthHeaders, false);
  assert.equal(decisionRequest.requestHeaders["AP-Session-Identifier"], "session-123");
  assert.equal(decisionRequest.requestHeaders["Adobe-Subject-Token"], "subject-token-123");
  assert.equal(decisionRequest.requestHeaders["AD-Service-Token"], "service-token-123");
  assert.equal(decisionRequest.requestHeaders["AP-Temppass-Identity"], "temp-pass-123");
  assert.equal(decisionRequest.requestHeaders["AP-Visitor-Identifier"], "visitor-123");
});
