const test = require("node:test");
const assert = require("node:assert/strict");

const {
  injectRestV2DocsNoiseGuard,
  installRestV2DocsNoiseGuard,
  normalizeRestV2DocsNoiseText,
  shouldStubRestV2DocsImsProfileRequest,
  shouldSuppressRestV2DocsConsoleArgs,
} = require("../restv2-docs-noise-guard.js");

test("REST V2 docs noise guard suppresses known Adobe and Redoc console chatter only", () => {
  assert.equal(
    shouldSuppressRestV2DocsConsoleArgs(["Going to iterate over instancesSettings"]),
    true
  );
  assert.equal(
    shouldSuppressRestV2DocsConsoleArgs(["Attempting to get field body but it does not exist"]),
    true
  );
  assert.equal(
    shouldSuppressRestV2DocsConsoleArgs(["sp.auth-staging.adobe.com/api/v2/MML/profiles/sso/Apple", "Failed to load resource: 400"]),
    false
  );
});

test("REST V2 docs noise guard targets only the IMS profile request that triggers the developer-site CORS noise", () => {
  assert.equal(
    shouldStubRestV2DocsImsProfileRequest("https://ims-na1.adobelogin.com/ims/profile/v1?client_id=adobe_io&jslVersion=v2-v0.53.0-1-g0303a47"),
    true
  );
  assert.equal(
    shouldStubRestV2DocsImsProfileRequest("https://ims-na1.adobelogin.com/ims/authorize/v2?client_id=adobe_io"),
    false
  );
});

test("REST V2 docs noise guard installs directly on the page world without inline script injection", async () => {
  const consoleCalls = [];
  const delegatedFetchCalls = [];
  class FakeResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status;
      this.statusText = init.statusText;
      this.headers = init.headers;
    }
  }
  const fakeWindow = {
    location: {
      href: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/",
    },
    console: {
      log: (...args) => consoleCalls.push(["log", ...args]),
      info: (...args) => consoleCalls.push(["info", ...args]),
      warn: (...args) => consoleCalls.push(["warn", ...args]),
      error: (...args) => consoleCalls.push(["error", ...args]),
      debug: (...args) => consoleCalls.push(["debug", ...args]),
    },
    fetch: async (...args) => {
      delegatedFetchCalls.push(args);
      return "delegated";
    },
    Response: FakeResponse,
    setTimeout,
    XMLHttpRequest: function FakeXMLHttpRequest() {},
  };
  fakeWindow.XMLHttpRequest.prototype.open = function open() {
    return "opened";
  };
  fakeWindow.XMLHttpRequest.prototype.send = function send() {
    return "sent";
  };
  fakeWindow.XMLHttpRequest.prototype.setRequestHeader = function setRequestHeader() {
    return "header";
  };

  assert.equal(installRestV2DocsNoiseGuard(fakeWindow), true);
  assert.equal(installRestV2DocsNoiseGuard(fakeWindow), true);

  fakeWindow.console.log("Going to iterate over instancesSettings");
  fakeWindow.console.warn("keep this visible");
  fakeWindow.console.error("real error stays visible");
  assert.deepEqual(consoleCalls, [
    ["warn", "keep this visible"],
    ["error", "real error stays visible"],
  ]);

  const stubbedResponse = await fakeWindow.fetch(
    "https://ims-na1.adobelogin.com/ims/profile/v1?client_id=adobe_io"
  );
  assert.equal(stubbedResponse.status, 200);
  assert.equal(stubbedResponse.body, "{}");
  assert.equal(delegatedFetchCalls.length, 0);

  const delegatedResponse = await fakeWindow.fetch("https://developer.adobe.com/favicon.ico");
  assert.equal(delegatedResponse, "delegated");
  assert.equal(delegatedFetchCalls.length, 1);
});

test("REST V2 docs noise guard leaves warn and error methods unwrapped", () => {
  const originalWarn = function warn(...args) {
    return ["warn", this, ...args];
  };
  const originalError = function error(...args) {
    return ["error", this, ...args];
  };
  const fakeWindow = {
    location: {
      href: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/",
    },
    console: {
      log() {},
      info() {},
      debug() {},
      warn: originalWarn,
      error: originalError,
    },
    setTimeout,
  };

  assert.equal(installRestV2DocsNoiseGuard(fakeWindow), true);
  assert.equal(fakeWindow.console.warn, originalWarn);
  assert.equal(fakeWindow.console.error, originalError);
});

test("REST V2 docs noise guard inject helper reuses the document window instead of creating inline script tags", () => {
  let createElementCalls = 0;
  const fakeWindow = {
    location: {
      href: "https://developer.adobe.com/adobe-pass/api/rest_api_v2/interactive/",
    },
    console: {
      log() {},
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    setTimeout,
  };
  const fakeDocument = {
    defaultView: fakeWindow,
    createElement() {
      createElementCalls += 1;
      return {};
    },
  };

  assert.equal(injectRestV2DocsNoiseGuard(fakeDocument), true);
  assert.equal(createElementCalls, 0);
});

test("REST V2 docs noise guard normalizes complex console payloads into readable text", () => {
  assert.equal(normalizeRestV2DocsNoiseText({ message: "hello" }), "{\"message\":\"hello\"}");
  assert.equal(normalizeRestV2DocsNoiseText(null), "");
});
