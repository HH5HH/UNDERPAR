const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_JS_PATH = path.join(ROOT, "popup.js");

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

function loadDebugInfoHelpers() {
  const source = fs.readFileSync(POPUP_JS_PATH, "utf8");
  const script = [
    "const DEBUG_TEXT_PREVIEW_LIMIT = 12000;",
    "const UNDERPAR_DEBUG_LOG_LIMIT = 160;",
    "const UNDERPAR_DEBUG_STATUS_HISTORY_LIMIT = 64;",
    "const BEARER_TOKEN_REDACTION_PATTERN = /\\bBearer\\s+[A-Za-z0-9._~-]{20,}\\b/gi;",
    "const NAMED_TOKEN_VALUE_REDACTION_PATTERN = /\\b(access[_\\s-]?token|id[_\\s-]?token|refresh[_\\s-]?token)\\b\\s*([:=])\\s*([A-Za-z0-9._~-]{16,})/gi;",
    "const JWT_VALUE_REDACTION_PATTERN = /\\b[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b/g;",
    "const state = { logs: [], debugStatusHistory: [] };",
    "function renderDebugConsole() {}",
    "function sanitizeUnderparDebugInfoValue(value) { return value; }",
    "function truncateDebugText(value, limit = DEBUG_TEXT_PREVIEW_LIMIT) { const text = typeof value === 'string' ? value : String(value ?? ''); return text.length <= limit ? text : `${text.slice(0, limit)}... [truncated ${text.length - limit} chars]`; }",
    "function redactSensitiveTokenValues(value) { const raw = String(value || ''); return raw.replace(BEARER_TOKEN_REDACTION_PATTERN, 'Bearer <redacted>').replace(NAMED_TOKEN_VALUE_REDACTION_PATTERN, (_match, tokenName, operator) => `${tokenName}${operator}<redacted>`).replace(JWT_VALUE_REDACTION_PATTERN, '<redacted-jwt>'); }",
    extractFunctionSource(source, "buildUnderparTextFingerprint"),
    extractFunctionSource(source, "redactUnderparSupportPacketText"),
    extractFunctionSource(source, "buildUnderparDebugEntryDetailsSignature"),
    extractFunctionSource(source, "buildUnderparDebugEntrySignature"),
    extractFunctionSource(source, "collectUnderparDebugCorrelationIds"),
    extractFunctionSource(source, "appendDebugLogEntry"),
    extractFunctionSource(source, "appendDebugStatusHistoryEntry"),
    "module.exports = { state, redactUnderparSupportPacketText, collectUnderparDebugCorrelationIds, appendDebugLogEntry, appendDebugStatusHistoryEntry };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Date,
    Math,
    JSON,
    String,
    Set,
    WeakSet,
  };
  vm.runInNewContext(script, context, { filename: POPUP_JS_PATH });
  return context.module.exports;
}

test("debug info collapses consecutive duplicate entries into repeat counts", () => {
  const helpers = loadDebugInfoHelpers();

  helpers.appendDebugLogEntry("status", "Loaded Registered Application Health", { count: 104 });
  helpers.appendDebugLogEntry("status", "Loaded Registered Application Health", { count: 104 });
  helpers.appendDebugStatusHistoryEntry("Loaded Registered Application Health", "success", "status");
  helpers.appendDebugStatusHistoryEntry("Loaded Registered Application Health", "success", "status");

  assert.equal(helpers.state.logs.length, 1);
  assert.equal(helpers.state.logs[0].repeatCount, 2);
  assert.equal(helpers.state.debugStatusHistory.length, 1);
  assert.equal(helpers.state.debugStatusHistory[0].repeatCount, 2);
});

test("debug info support packet redacts emails and preserves distinct correlation ids", () => {
  const helpers = loadDebugInfoHelpers();
  const redacted = helpers.redactUnderparSupportPacketText("Contact eric.minnick@example.com after failure.");
  const correlationIds = helpers.collectUnderparDebugCorrelationIds([
    {
      requestId: "req-123",
      flowId: "flow-456",
      nested: {
        sessionId: "sess-789",
        requestId: "req-123",
      },
    },
  ]);

  assert.match(redacted, /<redacted-email:usr:[0-9a-f]{8}:24>/);
  assert.deepEqual(Array.from(correlationIds), ["requestId:req-123", "flowId:flow-456", "sessionId:sess-789"]);
});
