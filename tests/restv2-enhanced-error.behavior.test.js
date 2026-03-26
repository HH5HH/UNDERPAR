const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");

function extractConstSource(source, constName) {
  const marker = `const ${constName} = Object.freeze({`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Unable to locate ${constName}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const semicolonIndex = source.indexOf(";", index);
        return source.slice(start, semicolonIndex + 1);
      }
    }
  }
  throw new Error(`Unterminated constant ${constName}`);
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
  throw new Error(`Unterminated function ${functionName}`);
}

function loadEnhancedErrorHelpers() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : [values]) { if (value == null) { continue; } const normalized = String(value || '').trim(); if (normalized) { return normalized; } } return ''; }",
    extractFunctionSource(source, "parseJsonText"),
    extractFunctionSource(source, "normalizeHttpErrorMessage"),
    extractConstSource(source, "REST_V2_ENHANCED_ERROR_ACTION_HINTS"),
    extractConstSource(source, "REST_V2_ENHANCED_ERROR_HINTS_BY_CODE"),
    extractFunctionSource(source, "getRestV2EnhancedErrorMessageText"),
    extractFunctionSource(source, "normalizeRestV2EnhancedError"),
    "module.exports = { normalizeRestV2EnhancedError };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    redactSensitiveTokenValues: (value = "") => String(value || ""),
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports;
}

test("REST V2 enhanced error normalization preserves Adobe metadata and adds the partner SSO hint", () => {
  const { normalizeRestV2EnhancedError } = loadEnhancedErrorHelpers();
  const normalized = normalizeRestV2EnhancedError(
    {
      status: 400,
      code: "invalid_header_pfs_provider_id_not_determined",
      message: "The provider id value from the partner framework status header is not associated with a known mvpd.",
      helpUrl:
        "https://experienceleague.adobe.com/docs/pass/authentication/integration-guide-programmers/standard-features/error-reporting/enhanced-error-codes.html",
      action: "none",
      trace: "trace-123",
    },
    { httpStatus: 400 }
  );

  assert.equal(normalized.ok, true);
  assert.equal(normalized.code, "invalid_header_pfs_provider_id_not_determined");
  assert.equal(normalized.action, "none");
  assert.equal(normalized.helpUrl.includes("enhanced-error-codes"), true);
  assert.equal(normalized.trace, "trace-123");
  assert.match(normalized.displayMessage, /exact partner framework provider mapping id/i);
});

test("REST V2 enhanced error normalization falls back to action-based guidance for retryable errors", () => {
  const { normalizeRestV2EnhancedError } = loadEnhancedErrorHelpers();
  const normalized = normalizeRestV2EnhancedError(
    {
      status: 403,
      code: "network_connection_timeout",
      message: "There was a connection timeout with the associated partner service.",
      action: "retry",
    },
    { httpStatus: 403 }
  );

  assert.equal(normalized.code, "network_connection_timeout");
  assert.equal(normalized.action, "retry");
  assert.match(normalized.displayMessage, /bounded backoff/i);
});
