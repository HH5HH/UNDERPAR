const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");
const HARPO_PATH = path.join(ROOT, "harpo.js");

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

function loadHarpoWorkspaceRecordBuilder() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    `function uniquePreserveOrder(values = []) {
      const items = Array.isArray(values) ? values : [values];
      const seen = new Set();
      const output = [];
      for (const value of items) {
        const normalized = String(value || "").trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(normalized);
      }
      return output;
    }`,
    `function getActiveAdobePassEnvironmentKey() {
      return "stage";
    }`,
    `function getHarpoWorkspaceEnvironmentLabel() {
      return "Stage";
    }`,
    extractFunctionSource(source, "normalizeHarpoWorkspaceDomainList"),
    extractFunctionSource(source, "buildHarpoWorkspaceSessionRecord"),
    "module.exports = { buildHarpoWorkspaceSessionRecord };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    Date,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.buildHarpoWorkspaceSessionRecord;
}

function loadHarpoSelectionAutoStopHelper() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const statusCalls = [];
  let stopCalls = 0;
  const script = [
    extractFunctionSource(source, "maybeAutoStopHarpoRecordingForSelectionChange"),
    "module.exports = { maybeAutoStopHarpoRecordingForSelectionChange };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    state: {
      harpoRecordingStarting: false,
      harpoRecordingStopping: false,
      harpoRecordingActive: false,
      harpoDebugFlowId: "",
      harpoRecordingContext: null,
    },
    setStatus(message, tone) {
      statusCalls.push({ message, tone });
    },
    async stopHarpoRecording() {
      stopCalls += 1;
    },
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return {
    maybeAutoStopHarpoRecordingForSelectionChange: context.module.exports.maybeAutoStopHarpoRecordingForSelectionChange,
    context,
    getStatusCalls() {
      return statusCalls.slice();
    },
    getStopCalls() {
      return stopCalls;
    },
  };
}

function loadHarpoCountHelper() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    `const UNDERPAR_HAR_PHYSICAL_ASSET_RESOURCE_TYPES = new Set(["font", "image", "manifest", "media", "stylesheet"]);`,
    `const UNDERPAR_HAR_PHYSICAL_ASSET_EXTENSIONS = new Set(["apng","avif","bmp","css","cur","eot","gif","heic","heif","ico","jpeg","jpg","m4a","m4s","mp3","mp4","ogg","otf","png","svg","tif","tiff","ts","ttf","wav","webm","webp","woff","woff2"]);`,
    `const UNDERPAR_HAR_PHYSICAL_ASSET_MIME_PREFIXES = ["audio/", "font/", "image/", "video/"];`,
    `const UNDERPAR_HAR_PHYSICAL_ASSET_MIME_TYPES = new Set(["application/font-sfnt","application/font-woff","application/font-woff2","text/css","application/vnd.ms-fontobject","application/x-font-opentype","application/x-font-ttf","application/x-font-woff","application/x-font-woff2"]);`,
    `function firstNonEmptyString(values = []) {
      for (const value of Array.isArray(values) ? values : [values]) {
        if (value == null) continue;
        const normalized = String(value || "").trim();
        if (normalized) return normalized;
      }
      return "";
    }`,
    `function shouldIgnoreRedirectSiteUrl() { return false; }`,
    `function pickFlowEventTimestampMs(event = null, fallback = 0) {
      const direct = Number(event?.timestampMs || 0);
      if (direct > 0) return direct;
      const iso = Date.parse(String(event?.timestamp || "").trim());
      return Number.isFinite(iso) && iso > 0 ? iso : Number(fallback || 0);
    }`,
    `function toHarHeadersArray(headersLike = {}) {
      if (!headersLike || typeof headersLike !== "object") return [];
      return Object.entries(headersLike).map(([name, value]) => ({ name, value: String(value ?? "") }));
    }`,
    `function toHarQueryStringArray(url = "") {
      try {
        return [...new URL(String(url || "")).searchParams.entries()].map(([name, value]) => ({ name, value }));
      } catch {
        return [];
      }
    }`,
    `function getHarHeaderValue(headers = [], headerName = "") {
      const normalizedHeaderName = String(headerName || "").trim().toLowerCase();
      const entry = (Array.isArray(headers) ? headers : []).find(
        (item) => String(item?.name || "").trim().toLowerCase() === normalizedHeaderName
      );
      return String(entry?.value || "").trim();
    }`,
    `function truncateDebugText(value, limit = 10000) {
      const text = typeof value === "string" ? value : String(value ?? "");
      return text.length <= limit ? text : text.slice(0, limit);
    }`,
    `function uniquePreserveOrder(values = []) {
      const items = Array.isArray(values) ? values : [values];
      const seen = new Set();
      const output = [];
      for (const value of items) {
        const normalized = String(value || "").trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(normalized);
      }
      return output;
    }`,
    `const UNDERPAR_HARPO_SECOND_LEVEL_TLDS = new Set(["ac.uk","co.uk","gov.uk","ltd.uk","me.uk","net.uk","org.uk","plc.uk","sch.uk","co.jp","com.au","net.au","org.au","com.br","com.mx","com.tr","co.nz","com.sg"]);`,
    `const UNDERPAR_HARPO_PASS_HOST_RE = /(^|\\.)auth(?:-staging)?\\.adobe\\.com$/i;`,
    `const UNDERPAR_HARPO_ADOBE_SUPPORT_HOSTS = [];`,
    extractFunctionSource(source, "getUnderparHarEventUrl"),
    extractFunctionSource(source, "mergeUnderparHarHeaders"),
    extractFunctionSource(source, "getUnderparHarHeaderValueFromObject"),
    extractFunctionSource(source, "getUnderparHarPathExtension"),
    extractFunctionSource(source, "isUnderparHarPhysicalAssetTraffic"),
    extractFunctionSource(source, "serializeUnderparHarRequestBody"),
    extractFunctionSource(source, "getUnderparHarpoScopeHostname"),
    extractFunctionSource(source, "getUnderparHarpoScopeDomainBucket"),
    extractFunctionSource(source, "isUnderparHarpoAdobeHost"),
    extractFunctionSource(source, "isUnderparHarpoAdobeSupportHost"),
    extractFunctionSource(source, "isUnderparHarpoAdobeTraffic"),
    extractFunctionSource(source, "isUnderparHarpoPassSamlAssertionConsumerUrl"),
    extractFunctionSource(source, "matchesUnderparHarpoScopeDomains"),
    extractFunctionSource(source, "collectUnderparHarpoScopeDomains"),
    extractFunctionSource(source, "collectUnderparHarpoSamlMvpdDomains"),
    extractFunctionSource(source, "resolveUnderparHarpoMvpdDomains"),
    extractFunctionSource(source, "shouldRetainHarpoRecordedEntry"),
    extractFunctionSource(source, "filterHarpoScopedHarEntries"),
    extractFunctionSource(source, "buildUnderparWebRequestHarRecords"),
    extractFunctionSource(source, "buildUnderparTabNetworkHarRecords"),
    extractFunctionSource(source, "mergeUnderparRecordedHarRecord"),
    extractFunctionSource(source, "mergeUnderparRecordedHarRecords"),
    extractFunctionSource(source, "buildWebRequestHarEntries"),
    extractFunctionSource(source, "buildHarpoScopedCaptureResult"),
    extractFunctionSource(source, "shouldExcludeInternalExtensionHarEntry"),
    extractFunctionSource(source, "countHarpoCapturedCalls"),
    "module.exports = { countHarpoCapturedCalls };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
    Date,
    Set,
    Map,
    Math,
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.countHarpoCapturedCalls;
}

function loadHarpoFullCaptureBuilder() {
  const source = fs.readFileSync(POPUP_PATH, "utf8");
  const script = [
    `const UNDERPAR_HAR_PHYSICAL_ASSET_RESOURCE_TYPES = new Set(["font", "image", "manifest", "media", "stylesheet"]);`,
    `const UNDERPAR_HAR_PHYSICAL_ASSET_EXTENSIONS = new Set(["apng","avif","bmp","css","cur","eot","gif","heic","heif","ico","jpeg","jpg","m4a","m4s","mp3","mp4","ogg","otf","png","svg","tif","tiff","ts","ttf","wav","webm","webp","woff","woff2"]);`,
    `const UNDERPAR_HAR_PHYSICAL_ASSET_MIME_PREFIXES = ["audio/", "font/", "image/", "video/"];`,
    `const UNDERPAR_HAR_PHYSICAL_ASSET_MIME_TYPES = new Set(["application/font-sfnt","application/font-woff","application/font-woff2","text/css","application/vnd.ms-fontobject","application/x-font-opentype","application/x-font-ttf","application/x-font-woff","application/x-font-woff2"]);`,
    `function firstNonEmptyString(values = []) {
      for (const value of Array.isArray(values) ? values : [values]) {
        if (value == null) continue;
        const normalized = String(value || "").trim();
        if (normalized) return normalized;
      }
      return "";
    }`,
    `function shouldIgnoreRedirectSiteUrl() { return false; }`,
    `function pickFlowEventTimestampMs(event = null, fallback = 0) {
      const direct = Number(event?.timestampMs || 0);
      if (direct > 0) return direct;
      const iso = Date.parse(String(event?.timestamp || "").trim());
      return Number.isFinite(iso) && iso > 0 ? iso : Number(fallback || 0);
    }`,
    `function toHarHeadersArray(headersLike = {}) {
      if (!headersLike || typeof headersLike !== "object") return [];
      return Object.entries(headersLike).map(([name, value]) => ({ name, value: String(value ?? "") }));
    }`,
    `function toHarQueryStringArray(url = "") {
      try {
        return [...new URL(String(url || "")).searchParams.entries()].map(([name, value]) => ({ name, value }));
      } catch {
        return [];
      }
    }`,
    `function getHarHeaderValue(headers = [], headerName = "") {
      const normalizedHeaderName = String(headerName || "").trim().toLowerCase();
      const entry = (Array.isArray(headers) ? headers : []).find(
        (item) => String(item?.name || "").trim().toLowerCase() === normalizedHeaderName
      );
      return String(entry?.value || "").trim();
    }`,
    `function truncateDebugText(value, limit = 10000) {
      const text = typeof value === "string" ? value : String(value ?? "");
      return text.length <= limit ? text : text.slice(0, limit);
    }`,
    `function uniquePreserveOrder(values = []) {
      const items = Array.isArray(values) ? values : [values];
      const seen = new Set();
      const output = [];
      for (const value of items) {
        const normalized = String(value || "").trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        output.push(normalized);
      }
      return output;
    }`,
    `const UNDERPAR_HARPO_SECOND_LEVEL_TLDS = new Set(["ac.uk","co.uk","gov.uk","ltd.uk","me.uk","net.uk","org.uk","plc.uk","sch.uk","co.jp","com.au","net.au","org.au","com.br","com.mx","com.tr","co.nz","com.sg"]);`,
    `const UNDERPAR_HARPO_PASS_HOST_RE = /(^|\\.)auth(?:-staging)?\\.adobe\\.com$/i;`,
    `const UNDERPAR_HARPO_ADOBE_SUPPORT_HOSTS = [];`,
    `function formatRestV2RequestorMvpdDisplay(requestorId = "", mvpdId = "") {
      return [String(requestorId || "").trim(), String(mvpdId || "").trim()].filter(Boolean).join(" x ");
    }`,
    extractFunctionSource(source, "getUnderparHarEventUrl"),
    extractFunctionSource(source, "mergeUnderparHarHeaders"),
    extractFunctionSource(source, "getUnderparHarHeaderValueFromObject"),
    extractFunctionSource(source, "getUnderparHarPathExtension"),
    extractFunctionSource(source, "isUnderparHarPhysicalAssetTraffic"),
    extractFunctionSource(source, "serializeUnderparHarRequestBody"),
    extractFunctionSource(source, "getUnderparHarpoScopeHostname"),
    extractFunctionSource(source, "getUnderparHarpoScopeDomainBucket"),
    extractFunctionSource(source, "isUnderparHarpoAdobeHost"),
    extractFunctionSource(source, "isUnderparHarpoAdobeSupportHost"),
    extractFunctionSource(source, "isUnderparHarpoAdobeTraffic"),
    extractFunctionSource(source, "isUnderparHarpoPassSamlAssertionConsumerUrl"),
    extractFunctionSource(source, "matchesUnderparHarpoScopeDomains"),
    extractFunctionSource(source, "collectUnderparHarpoScopeDomains"),
    extractFunctionSource(source, "collectUnderparHarpoSamlMvpdDomains"),
    extractFunctionSource(source, "resolveUnderparHarpoMvpdDomains"),
    extractFunctionSource(source, "shouldRetainHarpoRecordedEntry"),
    extractFunctionSource(source, "filterHarpoScopedHarEntries"),
    extractFunctionSource(source, "buildUnderparWebRequestHarRecords"),
    extractFunctionSource(source, "buildUnderparTabNetworkHarRecords"),
    extractFunctionSource(source, "mergeUnderparRecordedHarRecord"),
    extractFunctionSource(source, "mergeUnderparRecordedHarRecords"),
    extractFunctionSource(source, "buildWebRequestHarEntries"),
    extractFunctionSource(source, "buildExtensionHarEntries"),
    extractFunctionSource(source, "buildHarpoScopedCaptureResult"),
    extractFunctionSource(source, "shouldExcludeInternalExtensionHarEntry"),
    extractFunctionSource(source, "buildHarLogFromFlowSnapshot"),
    "module.exports = { buildHarLogFromFlowSnapshot };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    URL,
    URLSearchParams,
    Date,
    Set,
    Map,
    Math,
    chrome: {
      runtime: {
        getManifest() {
          return { version: "test-version" };
        },
      },
    },
  };
  vm.runInNewContext(script, context, { filename: POPUP_PATH });
  return context.module.exports.buildHarLogFromFlowSnapshot;
}

function loadHarpoWorkspaceClassificationRetentionHelper() {
  const source = fs.readFileSync(HARPO_PATH, "utf8");
  const script = [
    extractFunctionSource(source, "shouldRetainHarpoClassification"),
    "module.exports = { shouldRetainHarpoClassification };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: HARPO_PATH });
  return context.module.exports.shouldRetainHarpoClassification;
}

test("HARPO workspace session record keeps UnderPAR dark defaults and safe domains", () => {
  const buildHarpoWorkspaceSessionRecord = loadHarpoWorkspaceRecordBuilder();
  const record = buildHarpoWorkspaceSessionRecord(
    { log: { entries: [] } },
    {
      source: "recording",
      fileName: "capture.har",
      programmerName: "Turner",
      requestorId: "turner",
      requestorName: "Turner East",
      safeDomains: ["turner.com", "adobe.com", "turner.com"],
      reproDomains: ["turner.com", "api.turner.com", "turner.com"],
      mvpdDomains: ["dish.com", "auth.dish.com", "dish.com"],
      expectedMvpds: ["Dish", "Dish"],
    }
  );

  assert.deepEqual(Array.from(record.safeDomains), ["adobe.com", "turner.com"]);
  assert.deepEqual(Array.from(record.programmerDomains), ["adobe.com", "turner.com"]);
  assert.deepEqual(Array.from(record.reproDomains), ["turner.com", "api.turner.com"]);
  assert.deepEqual(Array.from(record.mvpdDomains), ["dish.com", "auth.dish.com"]);
  assert.equal(record.theme, "underpar-dark");
  assert.equal(record.environmentKey, "stage");
  assert.equal(record.environmentLabel, "Stage");
  assert.equal(record.source, "recording");
  assert.equal(record.fileName, "capture.har");
  assert.ok(typeof record.createdAt === "string" && record.createdAt.includes("T"));
});

test("HARPO auto-stop helper stops active recording when RequestorId changes", async () => {
  const { maybeAutoStopHarpoRecordingForSelectionChange, context, getStatusCalls, getStopCalls } = loadHarpoSelectionAutoStopHelper();
  context.state.harpoRecordingActive = true;
  context.state.harpoDebugFlowId = "flow-harpo";
  context.state.harpoRecordingContext = {
    requestorId: "old-requestor",
  };

  const result = await maybeAutoStopHarpoRecordingForSelectionChange(
    {
      requestorId: "new-requestor",
    },
    {
      reason: "Requestor change",
    }
  );

  assert.equal(result, true);
  assert.equal(getStopCalls(), 1);
  assert.deepEqual(getStatusCalls(), [
    {
      message: "Detected Requestor change while HARPO recording was active. Auto-stopping previous capture...",
      tone: "info",
    },
  ]);
});

test("HARPO auto-stop helper ignores unchanged RequestorId", async () => {
  const { maybeAutoStopHarpoRecordingForSelectionChange, context, getStatusCalls, getStopCalls } = loadHarpoSelectionAutoStopHelper();
  context.state.harpoRecordingActive = true;
  context.state.harpoDebugFlowId = "flow-harpo";
  context.state.harpoRecordingContext = {
    requestorId: "same-requestor",
  };

  const result = await maybeAutoStopHarpoRecordingForSelectionChange(
    {
      requestorId: "same-requestor",
    },
    {
      reason: "Requestor change",
    }
  );

  assert.equal(result, false);
  assert.equal(getStopCalls(), 0);
  assert.deepEqual(getStatusCalls(), []);
});

test("HARPO captured call counter ignores extension URLs and counts merged requests", () => {
  const countHarpoCapturedCalls = loadHarpoCountHelper();
  const count = countHarpoCapturedCalls({
    events: [
      {
        source: "web-request",
        phase: "onBeforeRequest",
        tabId: 91,
        requestId: "wr-1",
        method: "GET",
        url: "https://api.auth.adobe.com/api/v2/turner/configuration",
        type: "xmlhttprequest",
        timestampMs: 1000,
      },
      {
        source: "web-request",
        phase: "onCompleted",
        tabId: 91,
        requestId: "wr-1",
        method: "GET",
        url: "https://api.auth.adobe.com/api/v2/turner/configuration",
        statusCode: 200,
        statusLine: "HTTP/1.1 200 OK",
        timestampMs: 1010,
        responseHeaders: {
          "content-type": "application/json",
        },
      },
      {
        source: "web-request",
        phase: "onBeforeRequest",
        tabId: 91,
        requestId: "wr-ext",
        method: "GET",
        url: "chrome-extension://abcdefghijklmnop/harpo.html",
        type: "main_frame",
        timestampMs: 1020,
      },
      {
        source: "web-request",
        phase: "onCompleted",
        tabId: 91,
        requestId: "wr-ext",
        method: "GET",
        url: "chrome-extension://abcdefghijklmnop/harpo.html",
        statusCode: 200,
        statusLine: "HTTP/1.1 200 OK",
        timestampMs: 1021,
        responseHeaders: {
          "content-type": "text/html",
        },
      },
    ],
  });

  assert.equal(count, 1);
});

test("HARPO captured call counter drops unrelated off-scope domains", () => {
  const countHarpoCapturedCalls = loadHarpoCountHelper();
  const count = countHarpoCapturedCalls(
    {
      events: [
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 55,
          requestId: "wr-pass",
          method: "GET",
          url: "https://api.auth.adobe.com/api/v2/thetennischannel/configuration",
          type: "xmlhttprequest",
          timestampMs: 1000,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 55,
          requestId: "wr-pass",
          method: "GET",
          url: "https://api.auth.adobe.com/api/v2/thetennischannel/configuration",
          statusCode: 200,
          statusLine: "HTTP/1.1 200 OK",
          timestampMs: 1010,
          responseHeaders: {
            "content-type": "application/json",
          },
        },
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 55,
          requestId: "wr-offscope",
          method: "GET",
          url: "https://facebook.com/tracker",
          type: "xmlhttprequest",
          timestampMs: 1020,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 55,
          requestId: "wr-offscope",
          method: "GET",
          url: "https://facebook.com/tracker",
          statusCode: 200,
          statusLine: "HTTP/1.1 200 OK",
          timestampMs: 1030,
          responseHeaders: {
            "content-type": "application/json",
          },
        },
      ],
    },
    {
      serviceType: "harpo",
      safeDomains: ["adobe.com", "thetennischannel.com"],
      reproDomains: ["thetennischannel.com"],
    }
  );

  assert.equal(count, 1);
});

test("HARPO captured call counter excludes adobe support hosts that are not in the known requestor domains", () => {
  const countHarpoCapturedCalls = loadHarpoCountHelper();
  const count = countHarpoCapturedCalls(
    {
      events: [
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 55,
          requestId: "wr-pass",
          method: "GET",
          url: "https://api.auth.adobe.com/api/v2/thetennischannel/configuration",
          type: "xmlhttprequest",
          timestampMs: 1000,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 55,
          requestId: "wr-pass",
          method: "GET",
          url: "https://api.auth.adobe.com/api/v2/thetennischannel/configuration",
          statusCode: 200,
          statusLine: "HTTP/1.1 200 OK",
          timestampMs: 1010,
          responseHeaders: {
            "content-type": "application/json",
          },
        },
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 55,
          requestId: "wr-adobedtm",
          method: "GET",
          url: "http://assets.adobedtm.com/launch.js",
          type: "script",
          timestampMs: 1020,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 55,
          requestId: "wr-adobedtm",
          method: "GET",
          url: "http://assets.adobedtm.com/launch.js",
          statusCode: 200,
          statusLine: "HTTP/1.1 200 OK",
          timestampMs: 1030,
          responseHeaders: {
            "content-type": "application/javascript",
          },
        },
      ],
    },
    {
      serviceType: "harpo",
      safeDomains: ["adobe.com", "thetennischannel.com"],
      reproDomains: ["thetennischannel.com"],
    }
  );

  assert.equal(count, 1);
});

test("HARPO full workspace capture keeps page-level off-scope traffic while pass scoped count stays restricted", () => {
  const buildHarLogFromFlowSnapshot = loadHarpoFullCaptureBuilder();
  const har = buildHarLogFromFlowSnapshot(
    {
      flowId: "flow-full-harpo",
      events: [
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 91,
          requestId: "wr-pass",
          method: "GET",
          url: "https://api.auth.adobe.com/api/v2/globaltv/configuration",
          type: "xmlhttprequest",
          timestampMs: 1000,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 91,
          requestId: "wr-pass",
          method: "GET",
          url: "https://api.auth.adobe.com/api/v2/globaltv/configuration",
          statusCode: 200,
          statusLine: "HTTP/1.1 200 OK",
          timestampMs: 1010,
          responseHeaders: {
            "content-type": "application/json",
          },
        },
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 91,
          requestId: "wr-page-breakdown",
          method: "POST",
          url: "https://global.corusappservices.com/authentication/checkauthentication",
          type: "fetch",
          timestampMs: 1020,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 91,
          requestId: "wr-page-breakdown",
          method: "POST",
          url: "https://global.corusappservices.com/authentication/checkauthentication",
          statusCode: 500,
          statusLine: "HTTP/1.1 500 Internal Server Error",
          timestampMs: 1030,
          responseHeaders: {
            "content-type": "text/html",
          },
        },
      ],
    },
    {
      serviceType: "harpo",
      requestorId: "globaltv",
      requestorName: "globaltv",
      mvpd: "Bell",
      safeDomains: ["adobe.com", "globaltv.com"],
      reproDomains: ["globaltv.com"],
    }
  );

  const urls = Array.from(har.log.entries || [], (entry) => entry?.request?.url || "");
  assert.equal(urls.length, 2);
  assert.ok(urls.includes("https://api.auth.adobe.com/api/v2/globaltv/configuration"));
  assert.ok(urls.includes("https://global.corusappservices.com/authentication/checkauthentication"));
  assert.equal(har.log._underpar.context.harpoPassScopedEntryCount, 1);
});

test("HARPO workspace ALL view retains supporting page-level traffic in full mode", () => {
  const shouldRetainHarpoClassification = loadHarpoWorkspaceClassificationRetentionHelper();

  assert.equal(shouldRetainHarpoClassification({ domain: "other" }), true);
  assert.equal(shouldRetainHarpoClassification({ domain: "pass" }), true);
  assert.equal(shouldRetainHarpoClassification({ domain: "unknown" }), false);
});

test("HARPO captured call counter keeps SAML-inferred MVPD traffic", () => {
  const countHarpoCapturedCalls = loadHarpoCountHelper();
  const count = countHarpoCapturedCalls(
    {
      events: [
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 77,
          requestId: "wr-mvpd",
          method: "GET",
          url: "https://auth.spectrum.net/login",
          type: "main_frame",
          timestampMs: 1000,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 77,
          requestId: "wr-mvpd",
          method: "GET",
          url: "https://auth.spectrum.net/login",
          statusCode: 200,
          statusLine: "HTTP/1.1 200 OK",
          timestampMs: 1010,
          responseHeaders: {
            "content-type": "text/html",
          },
        },
        {
          source: "web-request",
          phase: "onBeforeSendHeaders",
          tabId: 77,
          requestId: "wr-saml",
          method: "POST",
          url: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
          type: "xmlhttprequest",
          timestampMs: 1020,
          requestHeaders: {
            referer: "https://auth.spectrum.net/login",
          },
        },
        {
          source: "web-request",
          phase: "onHeadersReceived",
          tabId: 77,
          requestId: "wr-saml",
          method: "POST",
          url: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
          statusCode: 302,
          statusLine: "HTTP/1.1 302 Found",
          timestampMs: 1030,
          responseHeaders: {
            "content-type": "text/html",
            "access-control-allow-origin": "https://auth.spectrum.net",
          },
        },
        {
          source: "web-request",
          phase: "onBeforeRequest",
          tabId: 77,
          requestId: "wr-offscope",
          method: "GET",
          url: "https://facebook.com/tracker",
          type: "xmlhttprequest",
          timestampMs: 1040,
        },
        {
          source: "web-request",
          phase: "onCompleted",
          tabId: 77,
          requestId: "wr-offscope",
          method: "GET",
          url: "https://facebook.com/tracker",
          statusCode: 200,
          statusLine: "HTTP/1.1 200 OK",
          timestampMs: 1050,
          responseHeaders: {
            "content-type": "application/json",
          },
        },
      ],
    },
    {
      serviceType: "harpo",
      safeDomains: ["adobe.com", "thetennischannel.com"],
      reproDomains: ["thetennischannel.com"],
    }
  );

  assert.equal(count, 2);
});
