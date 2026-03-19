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

function loadPopupImsHelpers() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    'const IMS_SCOPE = "openid profile offline_access additional_info.projectedProductContext";',
    'const IMS_DEFAULT_AUTHORIZATION_ENDPOINT = "https://ims-na1.adobelogin.com/ims/authorize/v2";',
    'const IMS_CONSOLE_ALLOWED_SCOPES = ["openid","profile","offline_access","additional_info.projectedProductContext","AdobeID","read_organizations","additional_info.job_function"];',
    'const IMS_LEGACY_SCOPE_MIGRATION_TOKENS = ["avatar","session","additional_info.account_type","additional_info.roles","additional_info.user_image_url","analytics_services"];',
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    "function uniqueSorted(values = []) { return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))].sort(); }",
    "function getZipKeyValueByPath(payload = null, pathExpr = '') { if (!payload || typeof payload !== 'object') { return undefined; } const expr = String(pathExpr || '').trim(); if (!expr) { return undefined; } if (Object.prototype.hasOwnProperty.call(payload, expr)) { return payload[expr]; } const parts = expr.split('.').map((part) => part.trim()).filter(Boolean); if (parts.length === 0) { return undefined; } let node = payload; for (const part of parts) { if (!node || typeof node !== 'object' || !Object.prototype.hasOwnProperty.call(node, part)) { return undefined; } node = node[part]; } return node; }",
    "function readZipKeyValue(payload = null, candidates = []) { for (const candidate of Array.isArray(candidates) ? candidates : []) { const value = getZipKeyValueByPath(payload, candidate); if (typeof value === 'string') { const trimmed = value.trim(); if (trimmed) { return trimmed; } continue; } if (typeof value === 'number' && Number.isFinite(value)) { return String(value); } if (typeof value === 'boolean') { return value ? 'true' : 'false'; } } return ''; }",
    "function decodeZipKeyPayloadBase64(value = '') { const compact = String(value || '').replace(/\\s+/g, '').replace(/-/g, '+').replace(/_/g, '/'); if (!compact) { return ''; } const remainder = compact.length % 4; const padded = remainder === 0 ? compact : `${compact}${'='.repeat(4 - remainder)}`; const binary = atob(padded); try { const bytes = Uint8Array.from(binary, (entry) => entry.charCodeAt(0)); return new TextDecoder().decode(bytes); } catch { return binary; } }",
    "function parseKeyValueText(rawText = '') { const payload = {}; String(rawText || '').split(/\\r?\\n/).forEach((line) => { const match = line.match(/^\\s*([^=:\\s]+)\\s*[:=]\\s*(.+)\\s*$/); if (!match) { return; } payload[String(match[1] || '').trim()] = String(match[2] || '').trim(); }); return payload; }",
    "function parseZipKeyPayload(rawText = '') { const raw = String(rawText || '').trim(); if (!raw) { throw new Error('ZIP.KEY payload is empty.'); } const prefix = 'ZIPKEY1:'; let payloadText = raw; if (raw.slice(0, prefix.length).toUpperCase() === prefix) { payloadText = raw.slice(prefix.length).trim(); } if (!payloadText) { throw new Error('ZIP.KEY payload is empty.'); } if (payloadText.startsWith('{')) { try { const parsed = JSON.parse(payloadText); if (parsed && typeof parsed === 'object') { return parsed; } } catch { throw new Error('ZIP.KEY JSON payload could not be parsed.'); } } try { const decoded = decodeZipKeyPayloadBase64(payloadText).trim(); if (decoded.startsWith('{')) { const parsed = JSON.parse(decoded); if (parsed && typeof parsed === 'object') { return parsed; } } } catch { } const fromKeyValue = parseKeyValueText(payloadText); if (Object.keys(fromKeyValue).length > 0) { return fromKeyValue; } throw new Error('Unknown ZIP.KEY format. Use ZIPKEY1 base64 JSON, raw JSON, or KEY=VALUE lines.'); }",
    extractFunctionSource(source, "normalizeImsScopeList"),
    extractFunctionSource(source, "sanitizeUnderparImsScopeForCredential"),
    extractFunctionSource(source, "normalizeUnderparVaultImsRuntimeConfigRecord"),
    extractFunctionSource(source, "extractUnderparImsRuntimeConfigFromZipKeyText"),
    extractFunctionSource(source, "buildUnderparImsAuthorizationCodeUrl"),
    "module.exports = { normalizeImsScopeList, sanitizeUnderparImsScopeForCredential, normalizeUnderparVaultImsRuntimeConfigRecord, extractUnderparImsRuntimeConfigFromZipKeyText, buildUnderparImsAuthorizationCodeUrl };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    atob: (value) => Buffer.from(String(value || ""), "base64").toString("binary"),
    TextDecoder,
    Uint8Array,
    URLSearchParams,
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

function loadPopupClientIdCandidateHelper() {
  const filePath = path.join(ROOT, "popup.js");
  const source = fs.readFileSync(filePath, "utf8");
  const script = [
    "let tokenClaims = null;",
    "let runtimeConfig = null;",
    "function parseJwtPayload() { return tokenClaims || {}; }",
    "function getActiveUnderparImsRuntimeConfig() { return runtimeConfig; }",
    "function firstNonEmptyString(values = []) { for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (text) { return text; } } return ''; }",
    "function uniquePreserveOrder(values = []) { const seen = new Set(); const output = []; for (const value of Array.isArray(values) ? values : []) { const text = String(value || '').trim(); if (!text || seen.has(text)) { continue; } seen.add(text); output.push(text); } return output; }",
    extractFunctionSource(source, "getUnderparImsClientIdCandidates"),
    "function setTestContext(nextTokenClaims = null, nextRuntimeConfig = null) { tokenClaims = nextTokenClaims; runtimeConfig = nextRuntimeConfig; }",
    "module.exports = { getUnderparImsClientIdCandidates, setTestContext };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
  };
  vm.runInNewContext(script, context, { filename: filePath });
  return context.module.exports;
}

test("runtime source no longer hard-codes debugger client or legacy redirect host", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  const manifestSource = fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8");

  for (const source of [popupSource, backgroundSource, manifestSource]) {
    assert.equal(/adobeExperienceCloudDebugger/i.test(source), false);
    assert.equal(/login\.aepdebugger\.adobe\.com/i.test(source), false);
  }
});

test("legacy helper login surface is no longer shipped", () => {
  assert.equal(fs.existsSync(path.join(ROOT, "src/login/login.js")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "src/login/login.html")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "src/login/login.css")), false);

  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const backgroundSource = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  const manifestSource = fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8");

  for (const source of [popupSource, backgroundSource, manifestSource]) {
    assert.equal(/src\/login\/login\.(html|js|css)/.test(source), false);
    assert.equal(/loginHelperResult/i.test(source), false);
  }
});

test("CM auth bootstrap no longer harvests tokens from Experience page context", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.equal(/requestCmConsoleTokenFromExperiencePageContext/.test(popupSource), false);
  assert.equal(/page-cm:/.test(popupSource), false);
});

test("popup IMS runtime config parser recognizes adobe.ims ZIP.KEY paths", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  assert.match(popupSource, /services\.adobe\.ims\.client_id/);
  assert.match(popupSource, /adobe\.ims\.client_id/);
  assert.match(popupSource, /services\.adobe\.ims\.scope/);
  assert.match(popupSource, /adobe\.ims\.scope/);
});

test("ZIP.KEY-only Adobe IMS imports accept direct adobe.ims.client_id entries", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.extractUnderparImsRuntimeConfigFromZipKeyText([
    "adobe.ims.client_id=underpar-client-id",
    "adobe.ims.scope=openid profile additional_info.projectedProductContext",
  ].join("\n"));

  assert.equal(result.imsRuntimeConfig.clientId, "underpar-client-id");
  assert.equal(result.imsRuntimeConfig.scope, "openid profile additional_info.projectedProductContext");
  assert.equal(result.imsRuntimeConfig.source, "ZIP.KEY");
});

test("legacy IMS scope bundles clamp to the LoginButton-style PKCE default scope", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.sanitizeUnderparImsScopeForCredential(
    "AdobeID,openid,avatar,session,read_organizations,additional_info.job_function,additional_info.projectedProductContext,analytics_services"
  );

  assert.equal(result.scope, "openid profile offline_access additional_info.projectedProductContext");
  assert.deepEqual([...result.droppedScopes].sort(), ["analytics_services", "avatar", "session"].sort());
});

test("supported Adobe IMS org scopes survive ZIP.KEY normalization order", () => {
  const helpers = loadPopupImsHelpers();

  const result = helpers.sanitizeUnderparImsScopeForCredential(
    "openid AdobeID read_organizations additional_info.projectedProductContext additional_info.job_function"
  );

  assert.equal(
    result.scope,
    "openid additional_info.projectedProductContext AdobeID read_organizations additional_info.job_function"
  );
  assert.deepEqual([...result.droppedScopes], []);
});

test("primary IMS client-id candidates come from the token and ZIP.KEY runtime config only", () => {
  const helpers = loadPopupClientIdCandidateHelper();

  helpers.setTestContext({ client_id: "token-client" }, { clientId: "vault-client" });
  assert.deepEqual([...helpers.getUnderparImsClientIdCandidates("token-value")], ["token-client", "vault-client"]);

  helpers.setTestContext({}, null);
  assert.deepEqual([...helpers.getUnderparImsClientIdCandidates("")], []);
});

test("PKCE authorization URL uses code response mode and the configured client ID", () => {
  const helpers = loadPopupImsHelpers();

  const authorizationUrl = helpers.buildUnderparImsAuthorizationCodeUrl({
    clientId: "underpar-client-id",
    redirectUri: "https://example.chromiumapp.org/ims-callback",
    scope: "openid profile",
    state: "state-123",
    codeChallenge: "challenge-123",
    prompt: "none",
    extraParams: {
      organization: "@adobepass",
    },
  });

  const parsed = new URL(authorizationUrl);
  assert.equal(parsed.origin, "https://ims-na1.adobelogin.com");
  assert.equal(parsed.pathname, "/ims/authorize/v2");
  assert.equal(parsed.searchParams.get("client_id"), "underpar-client-id");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("response_mode"), "query");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert.equal(parsed.searchParams.get("code_challenge"), "challenge-123");
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://example.chromiumapp.org/ims-callback");
  assert.equal(parsed.searchParams.get("scope"), "openid profile");
  assert.equal(parsed.searchParams.get("prompt"), "none");
  assert.equal(parsed.searchParams.get("organization"), "@adobepass");
});

test("PKCE authorization URL ignores auth-envelope overrides from extra params", () => {
  const helpers = loadPopupImsHelpers();

  const authorizationUrl = helpers.buildUnderparImsAuthorizationCodeUrl({
    clientId: "underpar-client-id",
    redirectUri: "https://example.chromiumapp.org/ims-callback",
    scope: "openid profile",
    state: "state-123",
    codeChallenge: "challenge-123",
    extraParams: {
      client_id: "exc_app",
      response_type: "token",
      response_mode: "fragment",
      code_challenge_method: "plain",
      code_challenge: "override-me",
      organization: "@adobepass",
    },
  });

  const parsed = new URL(authorizationUrl);
  assert.equal(parsed.searchParams.get("client_id"), "underpar-client-id");
  assert.equal(parsed.searchParams.get("response_type"), "code");
  assert.equal(parsed.searchParams.get("response_mode"), "query");
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");
  assert.equal(parsed.searchParams.get("code_challenge"), "challenge-123");
  assert.equal(parsed.searchParams.get("organization"), "@adobepass");
});

test("logged-out popup and sidepanel surfaces expose ZIP.KEY import controls", () => {
  const popupHtml = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const sidepanelHtml = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");

  for (const htmlSource of [popupHtml, sidepanelHtml]) {
    assert.match(htmlSource, /id="zip-key-import-view"/);
    assert.match(htmlSource, /id="zip-key-dropzone"/);
    assert.match(htmlSource, /id="zip-key-file-input"/);
    assert.match(htmlSource, /id="zip-key-browse-btn"/);
  }

  assert.match(popupSource, /promptForZipKeyImport/);
  assert.match(popupSource, /importZipKeyIntoVaultFromFile/);
});
