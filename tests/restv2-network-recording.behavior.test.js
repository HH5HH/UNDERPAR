const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const POPUP_PATH = path.join(ROOT, "popup.js");
const BACKGROUND_PATH = path.join(ROOT, "background.js");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");

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

function loadHarRecordingHelpers() {
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
    "module.exports = { buildWebRequestHarEntries };",
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
  return context.module.exports;
}

test("REST V2 profile harvest keeps structured session request headers for downstream hydration", () => {
  const popupSource = fs.readFileSync(POPUP_PATH, "utf8");

  assert.match(
    popupSource,
    /sessionRequestHeaders:\s*context\?\.sessionRequestHeaders && typeof context\.sessionRequestHeaders === "object"/m
  );
});

test("REST V2 debug snapshot exposes recorded device and Roku header presence", () => {
  const popupSource = fs.readFileSync(POPUP_PATH, "utf8");

  assert.match(popupSource, /device_identifier_present:\s*resolveRestV2InteractiveDocsHeaderValueFromContext\(baseContext, "AP-Device-Identifier"\)/);
  assert.match(popupSource, /device_info_present:\s*resolveRestV2InteractiveDocsHeaderValueFromContext\(baseContext, "X-Device-Info"\)/);
  assert.match(
    popupSource,
    /roku_connect_token_present:\s*resolveRestV2InteractiveDocsHeaderValueFromContext\(baseContext, "X-Roku-Reserved-Roku-Connect-Token"\)/m
  );
});

test("REST V2 HAR export merges web-request redirects with tab-network response bodies", () => {
  const { buildWebRequestHarEntries } = loadHarRecordingHelpers();
  const flowEvents = [
    {
      source: "web-request",
      phase: "onBeforeRequest",
      tabId: 91,
      requestId: "wr-1",
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple",
      type: "xmlhttprequest",
      timestampMs: 1000,
      requestBody: {
        formData: {
          SAMLResponse: ["PHNhbWxwOlJlc3BvbnNlPg=="],
        },
      },
    },
    {
      source: "web-request",
      phase: "onBeforeSendHeaders",
      tabId: 91,
      requestId: "wr-1",
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple",
      timestampMs: 1001,
      requestHeaders: {
        Authorization: "<redacted>",
        "AP-Partner-Framework-Status": "status-123",
      },
    },
    {
      source: "web-request",
      phase: "onBeforeRedirect",
      tabId: 91,
      requestId: "wr-1",
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple",
      timestampMs: 1010,
      statusCode: 302,
      statusLine: "HTTP/1.1 302 Found",
      redirectUrl: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
      responseHeaders: {
        Location: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
        "content-type": "application/json",
      },
    },
    {
      source: "tab-network",
      phase: "request",
      tabId: 91,
      requestId: "tn-1",
      method: "POST",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple",
      timestampMs: 1002,
      resourceType: "Fetch",
      requestHeaders: {
        Authorization: "<redacted>",
      },
      postDataPreview: "SAMLResponse=PHNhbWxwOlJlc3BvbnNlPg%3D%3D",
    },
    {
      source: "tab-network",
      phase: "response",
      tabId: 91,
      requestId: "tn-1",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple",
      timestampMs: 1009,
      status: 302,
      statusText: "Found",
      mimeType: "application/json",
      resourceType: "Fetch",
      responseHeaders: {
        Location: "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer",
        "content-type": "application/json",
      },
    },
    {
      source: "tab-network",
      phase: "loading-finished",
      tabId: 91,
      requestId: "tn-1",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple",
      timestampMs: 1011,
      encodedDataLength: 321,
    },
    {
      source: "tab-network",
      phase: "body",
      tabId: 91,
      requestId: "tn-1",
      url: "https://api.auth.adobe.com/api/v2/turner/profiles/sso/Apple",
      timestampMs: 1012,
      bodyPreview: '{"actionName":"partner_profile"}',
      base64Encoded: false,
    },
  ];

  const entries = buildWebRequestHarEntries(flowEvents, {});

  assert.equal(entries.length, 1);
  assert.equal(entries[0]._resourceType, "Fetch");
  assert.equal(entries[0].response.redirectURL, "https://sp.auth.adobe.com/sp/saml/SAMLAssertionConsumer");
  assert.equal(entries[0].response.bodySize, 321);
  assert.match(String(entries[0].response.content.text || ""), /partner_profile/);
  assert.match(String(entries[0].request.postData?.text || ""), /SAMLResponse=/);
  assert.equal(entries[0]._underpar.webRequestSeen, true);
  assert.equal(entries[0]._underpar.tabNetworkSeen, true);
});

test("REST V2 HAR export excludes physical asset traffic such as CSS and fonts", () => {
  const { buildWebRequestHarEntries } = loadHarRecordingHelpers();
  const flowEvents = [
    {
      source: "web-request",
      phase: "onBeforeRequest",
      tabId: 92,
      requestId: "wr-css-1",
      method: "GET",
      url: "https://identity.mvpd.example/auth/app.css",
      type: "stylesheet",
      timestampMs: 2000,
    },
    {
      source: "tab-network",
      phase: "response",
      tabId: 92,
      requestId: "tn-css-1",
      method: "GET",
      url: "https://identity.mvpd.example/auth/app.css",
      resourceType: "Stylesheet",
      mimeType: "text/css",
      timestampMs: 2001,
      responseHeaders: {
        "content-type": "text/css",
      },
    },
    {
      source: "web-request",
      phase: "onBeforeRequest",
      tabId: 92,
      requestId: "wr-font-1",
      method: "GET",
      url: "https://fonts.mvpd.example/provider.woff2",
      type: "font",
      timestampMs: 2002,
    },
  ];

  const entries = buildWebRequestHarEntries(flowEvents, {});

  assert.equal(entries.length, 0);
});

test("UnderPAR background recorder tracks child tabs for network capture parity with HARPO", () => {
  const backgroundSource = fs.readFileSync(BACKGROUND_PATH, "utf8");

  assert.match(backgroundSource, /function trackAdditionalFlowTab\(sourceTabId, targetTabId, trigger = ""\)/);
  assert.match(backgroundSource, /phase:\s*"child-tab-tracked"/);
  assert.match(backgroundSource, /chrome\.tabs\.onCreated\.addListener\(handleTrackedFlowTabCreated\)/);
  assert.match(
    backgroundSource,
    /chrome\.webNavigation\?\.onCreatedNavigationTarget\?\.addListener[\s\S]*chrome\.webNavigation\.onCreatedNavigationTarget\.addListener\(handleTrackedFlowCreatedNavigationTarget\)/
  );
  assert.match(backgroundSource, /function getTrackedTabIdsForFlow\(flowId = ""\)/);
  assert.match(
    backgroundSource,
    /function buildFlowStorageIndex\(\)\s*\{[\s\S]*for \(const flow of debugState\.flowsById\.values\(\)\)/
  );
});

test("UnderPAR manifest includes webNavigation permission for child auth target tracking", () => {
  const manifestSource = fs.readFileSync(MANIFEST_PATH, "utf8");
  assert.match(manifestSource, /"webNavigation"/);
});
