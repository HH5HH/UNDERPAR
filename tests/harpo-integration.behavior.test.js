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
    extractFunctionSource(source, "getUnderparHarEventUrl"),
    extractFunctionSource(source, "mergeUnderparHarHeaders"),
    extractFunctionSource(source, "getUnderparHarHeaderValueFromObject"),
    extractFunctionSource(source, "getUnderparHarPathExtension"),
    extractFunctionSource(source, "isUnderparHarPhysicalAssetTraffic"),
    extractFunctionSource(source, "serializeUnderparHarRequestBody"),
    extractFunctionSource(source, "buildUnderparWebRequestHarRecords"),
    extractFunctionSource(source, "buildUnderparTabNetworkHarRecords"),
    extractFunctionSource(source, "mergeUnderparRecordedHarRecord"),
    extractFunctionSource(source, "mergeUnderparRecordedHarRecords"),
    extractFunctionSource(source, "buildWebRequestHarEntries"),
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
      expectedMvpds: ["Dish", "Dish"],
    }
  );

  assert.deepEqual(Array.from(record.safeDomains), ["adobe.com", "turner.com"]);
  assert.deepEqual(Array.from(record.programmerDomains), ["adobe.com", "turner.com"]);
  assert.deepEqual(Array.from(record.reproDomains), ["turner.com", "api.turner.com"]);
  assert.equal(record.theme, "underpar-dark");
  assert.equal(record.environmentKey, "stage");
  assert.equal(record.environmentLabel, "Stage");
  assert.equal(record.source, "recording");
  assert.equal(record.fileName, "capture.har");
  assert.ok(typeof record.createdAt === "string" && record.createdAt.includes("T"));
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
