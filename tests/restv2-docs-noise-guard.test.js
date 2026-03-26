const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createRestV2DocsNoiseGuardPageScriptSource,
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

test("REST V2 docs noise guard script source includes the known suppression hooks", () => {
  const scriptSource = createRestV2DocsNoiseGuardPageScriptSource();
  assert.match(scriptSource, /instancesSettings/i);
  assert.match(scriptSource, /Attempting to get field body but it does not exist/i);
  assert.match(scriptSource, /ims-na1.*profile\\\\\/v1/i);
});

test("REST V2 docs noise guard normalizes complex console payloads into readable text", () => {
  assert.equal(normalizeRestV2DocsNoiseText({ message: "hello" }), "{\"message\":\"hello\"}");
  assert.equal(normalizeRestV2DocsNoiseText(null), "");
});
