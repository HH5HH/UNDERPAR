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

test("popup session persistence uses session-scoped storage and purges legacy local IMS state", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const loadStoredSource = extractFunctionSource(popupSource, "loadStoredLoginData");
  const saveSource = extractFunctionSource(popupSource, "saveLoginData");
  const legacyPurgeSource = extractFunctionSource(popupSource, "clearLegacyPersistedLoginData");

  assert.match(popupSource, /const UNDERPAR_SESSION_STORAGE_ACCESS_LEVEL = "TRUSTED_CONTEXTS";/);
  assert.match(popupSource, /function getUnderparLoginStorageArea\(\)\s*\{\s*return chrome\?\.storage\?\.session \|\| null;/);
  assert.match(loadStoredSource, /const loginData = await readStoredLoginDataSession\(\);/);
  assert.match(saveSource, /await writeStoredLoginDataSession\(normalized\);/);
  assert.doesNotMatch(saveSource, /chrome\.storage\.local\.set\(\s*\{\s*\[STORAGE_KEY\]/);
  assert.match(legacyPurgeSource, /await chrome\.storage\.local\.remove\(STORAGE_KEY\);/);
});

test("popup silent and manual refresh paths prefer the refresh_token grant before browser auth", () => {
  const popupSource = fs.readFileSync(path.join(ROOT, "popup.js"), "utf8");
  const refreshGrantSource = extractFunctionSource(popupSource, "refreshUnderparImsAccessToken");
  const silentRefreshSource = extractFunctionSource(popupSource, "refreshSessionNoTouch");
  const manualRefreshSource = extractFunctionSource(popupSource, "refreshSessionManual");

  assert.match(refreshGrantSource, /grant_type:\s*"refresh_token"/);
  assert.match(refreshGrantSource, /refresh_token:\s*normalizedRefreshToken/);
  assert.match(refreshGrantSource, /endpoint\.searchParams\.set\("client_id", normalizedClientId\);/);
  assert.match(silentRefreshSource, /refreshUnderparLoginSessionWithRefreshToken\(state\.loginData\)/);
  assert.match(silentRefreshSource, /authMode = "silent-web-auth-flow";/);
  assert.match(manualRefreshSource, /refreshUnderparLoginSessionWithRefreshToken\(state\.loginData\)/);
  assert.match(manualRefreshSource, /authMode = "interactive-web-auth-flow";/);
});

test("vault snapshot redaction masks stored token values before rendering storage surfaces", () => {
  const panelSource = fs.readFileSync(path.join(ROOT, "up-devtools-panel.js"), "utf8");
  const buildSnapshotSource = extractFunctionSource(panelSource, "buildVaultAreaSnapshot");

  assert.match(buildSnapshotSource, /const redactedPayload = redactVaultSensitivePayload\(normalizedPayload\);/);
  assert.match(buildSnapshotSource, /errorMessage: redactVaultSensitiveText\(String\(errorMessage \|\| ""\)\.trim\(\)\),/);
  assert.match(buildSnapshotSource, /rawJson: safeJsonStringify\(redactedPayload, 2\),/);
});

test("vault token redactor strips bearer values from nested storage payloads", () => {
  const panelSource = fs.readFileSync(path.join(ROOT, "up-devtools-panel.js"), "utf8");
  const script = [
    "const VAULT_JWT_VALUE_REDACTION_PATTERN = /\\b[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b/g;",
    "const VAULT_BEARER_TOKEN_REDACTION_PATTERN = /\\bBearer\\s+[A-Za-z0-9._~-]{20,}\\b/gi;",
    "const VAULT_NAMED_TOKEN_VALUE_REDACTION_PATTERN = /\\b(access[_\\s-]?token|id[_\\s-]?token|refresh[_\\s-]?token|authorization|csrf[_\\s-]?token)\\b\\s*([:=])\\s*([A-Za-z0-9._~\\/=\\-]{8,})/gi;",
    extractFunctionSource(panelSource, "isVaultSensitiveStorageKey"),
    extractFunctionSource(panelSource, "maskVaultSensitiveValue"),
    extractFunctionSource(panelSource, "redactVaultSensitiveText"),
    extractFunctionSource(panelSource, "redactVaultSensitivePayload"),
    "module.exports = { redactVaultSensitivePayload };",
  ].join("\n\n");
  const context = {
    module: { exports: {} },
    exports: {},
    WeakSet,
  };
  vm.runInNewContext(script, context, { filename: path.join(ROOT, "up-devtools-panel.js") });
  const { redactVaultSensitivePayload } = context.module.exports;

  const sensitivePayload = redactVaultSensitivePayload({
    ims_login_data: {
      accessToken: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart1234567890",
      refreshToken: "refresh-token-should-not-survive",
      nested: {
        Authorization: "Bearer token-abcdefghijklmnopqrstuvwxyz0123456789",
      },
    },
    harmless: "hello",
  });

  const serialized = JSON.stringify(sensitivePayload);
  assert.equal(serialized.includes("refresh-token-should-not-survive"), false);
  assert.equal(serialized.includes("abcdefghijklmnopqrstuvwxyz0123456789"), false);
  assert.equal(serialized.includes("<redacted"), true);
  assert.equal(sensitivePayload.harmless, "hello");
});
